import "server-only";
import { prisma } from "@/lib/prisma";
import { can, demand, TeamError, type Actor } from "./policy";
import { taskScope } from "./service";
import { callJourney } from "./call-journey";
import { isCallWork } from "./daily-call-policy";
import { appointmentSelect } from "./customer-work";
import { publicContact } from "./contact-directory";

const activeTaskStatuses = { notIn: ["COMPLETED", "CANCELLED"] };

export async function contactProfileRead(actor: Actor, params: URLSearchParams) {
  demand(actor, "clients.view");
  const requestedId = params.get("clientId") || "";
  const requested = await prisma.teamClient.findFirst({
    where: { id: requestedId, workspaceId: actor.workspaceId },
    select: { id: true, mergedIntoId: true },
  });
  if (!requested) throw new TeamError("Contact not found.", 404);
  const contactId = requested.mergedIntoId || requested.id;
  const contact = await prisma.teamClient.findFirst({
    where: { id: contactId, workspaceId: actor.workspaceId, mergedIntoId: null },
    include: {
      owner: { select: { id: true, user: { select: { name: true } } } },
    },
  });
  if (!contact) throw new TeamError("Contact not found.", 404);

  const mergedIds = await prisma.teamClient.findMany({
    where: { workspaceId: actor.workspaceId, mergedIntoId: contact.id },
    select: { id: true },
  });
  const familyIds = [contact.id, ...mergedIds.map(row => row.id)];
  const now = new Date();
  const [tasks, events, reports, consultations] = await Promise.all([
    prisma.teamTask.findMany({
      where: {
        ...taskScope(actor),
        clientId: { in: familyIds },
        status: activeTaskStatuses,
      },
      take: 30,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        version: true,
        callPhase: true,
        callAttempts: true,
        conversationCount: true,
        eventKey: true,
        followUpContext: true,
        dueAt: true,
        ownerId: true,
      },
    }),
    can(actor, "tasks.all") || can(actor, "tasks.assign")
      ? prisma.teamCalendarEvent.findMany({
          where: {
            workspaceId: actor.workspaceId,
            clientId: { in: familyIds },
            status: "SCHEDULED",
            startsAt: { gte: now },
          },
          take: 20,
          orderBy: { startsAt: "asc" },
          select: {
            ...appointmentSelect,
            followUpTaskId: true,
            title: true,
            kind: true,
            startsAt: true,
            assigneeId: true,
            assignee: { select: { user: { select: { name: true } } } },
          },
        })
      : prisma.teamCalendarEvent.findMany({
          where: {
            workspaceId: actor.workspaceId,
            clientId: { in: familyIds },
            status: "SCHEDULED",
            startsAt: { gte: now },
            OR: [{ assigneeId: actor.id }, { creatorId: actor.id }],
          },
          take: 20,
          orderBy: { startsAt: "asc" },
          select: {
            ...appointmentSelect,
            followUpTaskId: true,
            title: true,
            kind: true,
            startsAt: true,
            assigneeId: true,
            assignee: { select: { user: { select: { name: true } } } },
          },
        }),
    prisma.teamAudit.findMany({
      where: {
        workspaceId: actor.workspaceId,
        entityId: { in: familyIds },
        action: { in: ["contact.call_report", "contact.activity_report", "contact.schedule_changed", "contact.handoff_requested", "contact.handoff_resolved"] },
      },
      take: 30,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, actorId: true, createdAt: true, detail: true },
    }),
    can(actor, "crm.prospects.view")
      ? prisma.consultationRequest.findMany({
          where: {
            workspaceId: actor.workspaceId,
            clientId: { in: familyIds },
            ...(!can(actor, "crm.all") ? { assignedMemberId: actor.id } : {}),
          },
          take: 10,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            createdAt: true,
            preferredCallback: true,
            assignedMemberId: true,
            assignedMember: { select: { user: { select: { name: true } } } },
            activities: {
              where: { kind: { notIn: ["FUNNEL_EVENT"] } },
              take: 10,
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                kind: true,
                message: true,
                createdAt: true,
                actorMember: { select: { user: { select: { name: true } } } },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);
  const memberIds = [...new Set([...tasks.map(task => task.ownerId), ...events.map(event => event.assigneeId), ...reports.map(report => report.actorId)])];
  const owners = memberIds.length
    ? await prisma.teamMember.findMany({
        where: { workspaceId: actor.workspaceId, id: { in: memberIds } },
        select: { id: true, jobTitle: true, user: { select: { name: true } } },
      })
    : [];
  const ownerNames = new Map(owners.map(owner => [owner.id, owner.user.name]));

  const openTasks = tasks
    .map(task => ({ ...task, dueAt: task.dueAt?.toISOString() || null }))
    .sort((left, right) => {
      if (left.dueAt && right.dueAt) return left.dueAt.localeCompare(right.dueAt);
      if (left.dueAt) return -1;
      if (right.dueAt) return 1;
      return 0;
    });
  const eventActions = events.map(event => ({
    id: event.id,
    title: event.title,
    kind: event.kind,
    dueAt: event.startsAt.toISOString(),
    ownerId: event.assigneeId,
    ownerName: ownerNames.get(event.assigneeId) || "",
    type: "calendar" as const,
    ...Object.fromEntries(Object.entries(event).filter(([key]) => key.startsWith("google"))),
    followUpTaskId: event.followUpTaskId,
  }));
  const taskActions = openTasks.map(task => ({
        id: task.id,
        title: task.title,
        version: task.version,
        isCall: isCallWork(task),
        journey: callJourney(task.followUpContext,task),
        canManage: task.ownerId === actor.id || can(actor, "tasks.assign"),
        booking: events.find(event => event.followUpTaskId === task.id) || null,
        status: task.status,
        dueAt: task.dueAt,
        ownerId: task.ownerId,
        ownerName: ownerNames.get(task.ownerId) || "",
        type: "task" as const,
      }));
  const nextAction = [...taskActions, ...eventActions.filter(event => !event.followUpTaskId || !taskActions.some(task => task.id === event.followUpTaskId))]
    .sort((left, right) => {
      if (left.dueAt && right.dueAt) return left.dueAt.localeCompare(right.dueAt);
      if (left.dueAt) return -1;
      if (right.dueAt) return 1;
      return 0;
    })[0] || null;

  const reportHistory = reports.map(row => {
    const detail = row.detail as {
      occurredAt?: string;
      authorName?: string;
      authorRole?: string;
      outcome?: string;
      discussion?: string;
      nextAction?: string;
      nextAt?: string;
      source?: string;
    };
    return {
      id: row.id,
      type: "interaction" as const,
      createdAt: row.createdAt.toISOString(),
      occurredAt: detail.occurredAt || row.createdAt.toISOString(),
      authorName: detail.authorName || ownerNames.get(row.actorId) || "Team member",
      authorRole: detail.authorRole || owners.find(member => member.id === row.actorId)?.jobTitle || "",
      outcome: detail.outcome || "",
      discussion: detail.discussion || "",
      nextAction: detail.nextAction || "",
      nextAt: detail.nextAt || "",
      source: detail.source || "",
    };
  });
  const consultationHistory = consultations.flatMap(request => request.activities.map(activity => ({
    id: activity.id,
    type: "consultation" as const,
    createdAt: activity.createdAt.toISOString(),
    occurredAt: activity.createdAt.toISOString(),
    authorName: activity.actorMember?.user.name || "Team member",
    authorRole: "",
    outcome: activity.kind,
    discussion: activity.message,
    nextAction: "",
    nextAt: "",
    source: "CONSULTATION",
  })));
  const history = [...reportHistory, ...consultationHistory]
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 30);

  return {
    contact: {
      ...publicContact(actor, contact),
      owner: { id: contact.owner.id, name: contact.owner.user.name },
    },
    nextAction,
    actions: taskActions,
    upcomingEvents: eventActions,
    consultations: consultations.map(request => ({
      id: request.id,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
      preferredCallback: request.preferredCallback?.toISOString() || null,
      assignedMemberId: request.assignedMemberId,
      assignedMemberName: request.assignedMember?.user.name || null,
    })),
    history,
    count: {
      activeTasks: openTasks.length,
      upcomingEvents: eventActions.length,
      interactions: history.length,
    },
  };
}
