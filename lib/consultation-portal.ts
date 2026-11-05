import "server-only";
import { Prisma, ConsultationStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { contactNumberToE164 } from "@/lib/contact-phone-countries";
import { activeWindows, acceptsAssignmentsNow } from "@/lib/team/availability-rules";
import { queueAppointment } from "@/lib/team/appointments";
import { CONSULTATION_INTERESTS, CONSULTATION_STATUSES, consultationSlotsForMember, isConsultationSlotAvailable, selectConsultationAssignee, type ConsultationAssigneeCandidate } from "@/lib/consultation-domain";
import { z } from "zod";

const interestIds = CONSULTATION_INTERESTS.map(item => item.id) as [string, ...string[]];
const consultationConsentVersion = "consultation-privacy-v2";
const funnelEventIds = [
  "CONSULTATION_PAGE_VIEWED",
  "CTA_CLICKED",
  "NAME_SUBMITTED",
  "AUTHENTICATION_STARTED",
  "AUTHENTICATION_COMPLETED",
  "PHONE_SUBMITTED",
  "INTERESTS_SELECTED",
  "SLOT_SELECTED",
  "CONSULTATION_SUBMITTED"
] as const;
const submitSchema = z.object({
  idempotencyKey: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  dialCode: z.string().regex(/^\d{1,3}$/),
  phone: z.string().trim().min(1).max(24),
  interests: z.array(z.enum(interestIds)).min(1).max(7),
  otherRequirement: z.string().trim().max(2000),
  callbackAt: z.string().datetime({ offset: true }).nullable(),
  source: z.string().trim().min(1).max(80),
  campaign: z.string().trim().max(160),
  referralUrl: z.string().max(1000),
  landingPageUrl: z.string().max(1000),
  referrer: z.string().max(1000),
  firstTouchSource: z.string().trim().min(1).max(80),
  latestTouchSource: z.string().trim().min(1).max(80),
  utm: z.object({
    source: z.string().max(160),
    medium: z.string().max(160),
    campaign: z.string().max(160),
    content: z.string().max(160),
    term: z.string().max(160)
  }).strict(),
  funnelEvents: z.array(z.enum(funnelEventIds)).max(20),
  consent: z.literal(true),
  marketingConsent: z.boolean()
}).strict().superRefine((data, ctx) => {
  if (new Set(data.interests).size !== data.interests.length) ctx.addIssue({ code: "custom", path: ["interests"], message: "Remove duplicate service selections." });
  if (data.interests.includes("OTHER") && !data.otherRequirement) ctx.addIssue({ code: "custom", path: ["otherRequirement"], message: "Tell us what you are looking for." });
});

export class ConsultationPortalError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const terminalStatuses: ConsultationStatus[] = ["CONVERTED", "NOT_INTERESTED", "LOST"];
const cardInterest: Record<string, string> = {
  DISTRIBUTION: "DISTRIBUTION",
  BEAT_SALES: "BEAT_SALES",
  BEAT_PURCHASE: "BEAT_PURCHASE",
  BECOME_ENGINEER: "BECOME_ENGINEER",
  MIX_MASTER: "MIX_MASTER",
  PLAYLIST_CURATION: "PLAYLIST_CURATION",
  OTHER: "OTHER"
};
const normaliseCardPhone = (value: string) => value.replace(/[^\d+]/g, "").slice(0, 40);

function slotWindow(now = new Date()) {
  const after = new Date((Math.floor(now.getTime() / (30 * 60_000)) + 1) * (30 * 60_000));
  return { after, until: new Date(after.getTime() + 14 * 86400_000) };
}

async function eligibleMembers(db: Prisma.TransactionClient | typeof prisma, workspaceId: string) {
  const members = await db.teamMember.findMany({
    where: { workspaceId, status: "ACTIVE", availability: "AVAILABLE", role: { owner: false }, user: { status: "ACTIVE" } },
    include: { role: true, user: { select: { name: true } } },
    orderBy: { id: "asc" }
  });
  return members.filter(member =>
    member.role.permissions.includes("crm.prospects.view") &&
    member.role.permissions.includes("crm.outreach.manage") &&
    member.role.permissions.includes("calendar.manage") &&
    acceptsAssignmentsNow(member.preferences)
  );
}

export async function consultationProfile(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, mobile: true, role: true, status: true } });
  if (!user || user.status !== "ACTIVE" || user.role === UserRole.ADMIN) throw new ConsultationPortalError("Sign in with an active HYMN artist or producer account to continue.", 403);
  return { id: user.id, name: user.name, email: user.email, mobile: user.mobile };
}

export async function consultationAvailability(now = new Date()) {
  const workspace = await prisma.teamWorkspace.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!workspace) return { timezone: "Asia/Kolkata", dates: [] };
  const { after, until } = slotWindow(now);
  const members = await eligibleMembers(prisma, workspace.id);
  if (!members.length) return { timezone: "Asia/Kolkata", dates: [] };
  const reservations = await prisma.teamCalendarEvent.findMany({
    where: { workspaceId: workspace.id, assigneeId: { in: members.map(member => member.id) }, status: "SCHEDULED", startsAt: { gte: new Date(after.getTime() - 7 * 86400_000), lt: until } },
    select: { assigneeId: true, kind: true, startsAt: true, endsAt: true }
  });
  const availableByTime = new Map<number, number>();
  for (const member of members) {
    const memberReservations = reservations.filter(event => event.assigneeId === member.id);
    for (const slot of consultationSlotsForMember(member.preferences, memberReservations, after, until)) {
      availableByTime.set(slot.getTime(), (availableByTime.get(slot.getTime()) || 0) + 1);
    }
  }
  const dates = new Map<string, string[]>();
  for (const [timestamp, count] of [...availableByTime].sort(([a], [b]) => a - b)) {
    if (!count) continue;
    const startsAt = new Date(timestamp);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(startsAt);
    dates.set(day, [...(dates.get(day) || []), startsAt.toISOString()]);
  }
  return { timezone: "Asia/Kolkata", dates: [...dates].map(([date, slots]) => ({ date, slots })) };
}

function sourceLabel(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9 _.-]/g, "").slice(0, 80) || "website";
}

function candidateShape<T extends Awaited<ReturnType<typeof eligibleMembers>>[number]>(member: T, load: number, lastAssignedAt: number): ConsultationAssigneeCandidate & T {
  return { ...member, id: member.id, name: member.user.name, preferences: member.preferences, load, lastAssignedAt };
}

async function chooseAssignee(tx: Prisma.TransactionClient, workspaceId: string, interests: string[], callbackAt: Date | null) {
  const members = await eligibleMembers(tx, workspaceId);
  const candidates = [];
  for (const member of members) {
    if (callbackAt) {
      const reservations = await tx.teamCalendarEvent.findMany({
        where: { workspaceId, assigneeId: member.id, status: "SCHEDULED", startsAt: { gte: new Date(callbackAt.getTime() - 7 * 86400_000), lt: new Date(callbackAt.getTime() + 30 * 60_000) } },
        select: { kind: true, startsAt: true, endsAt: true }
      });
      if (!isConsultationSlotAvailable(member.preferences, callbackAt, reservations)) continue;
    } else if (activeWindows(member.preferences, new Date(), new Date(Date.now() + 14 * 86400_000)).length === 0) {
      continue;
    }
    const [load, latest] = await Promise.all([
      tx.consultationRequest.count({ where: { workspaceId, assignedMemberId: member.id, status: { notIn: terminalStatuses } } }),
      tx.consultationRequest.findFirst({ where: { workspaceId, assignedMemberId: member.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } })
    ]);
    candidates.push(candidateShape(member, load, latest?.createdAt.getTime() || 0));
  }
  return selectConsultationAssignee(candidates, interests);
}

async function notifyMember(tx: Prisma.TransactionClient, memberId: string, title: string, href: string) {
  const member = await tx.teamMember.findUnique({ where: { id: memberId }, select: { status: true, preferences: true } });
  if (member?.status === "ACTIVE" && (member.preferences as { notifications?: boolean }).notifications !== false) {
    await tx.teamNotification.create({ data: { memberId, title, href } });
  }
}

function scheduleNote(interests: string[], otherRequirement: string) {
  const labels = interests.map(id => CONSULTATION_INTERESTS.find(item => item.id === id)?.title || id).join(", ");
  return `Consultation request · ${labels}${otherRequirement ? ` · Other: ${otherRequirement}` : ""}`;
}

export async function submitConsultation(userId: number, raw: unknown) {
  const data = submitSchema.parse(raw);
  const mobile = contactNumberToE164(data.dialCode, data.phone);
  const callbackAt = data.callbackAt ? new Date(data.callbackAt) : null;
  if (callbackAt && (callbackAt <= new Date() || callbackAt.getTime() > Date.now() + 14 * 86400_000)) {
    throw new ConsultationPortalError("Choose a callback time within the next two weeks.", 400);
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true, status: true } });
  if (!user || user.status !== "ACTIVE" || user.role === UserRole.ADMIN) throw new ConsultationPortalError("Sign in with an active HYMN artist or producer account to continue.", 403);
  const workspace = await prisma.teamWorkspace.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!workspace) throw new ConsultationPortalError("Consultation booking is temporarily unavailable. Please try again later.", 503);

  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM team_workspaces WHERE id = ${workspace.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const previous = await tx.consultationRequest.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: data.idempotencyKey } }, include: { assignedMember: { include: { user: { select: { name: true } } } } } });
    if (previous) return { request: previous, duplicate: true };
    const account = await tx.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, status: true, mobile: true } });
    if (!account || account.status !== "ACTIVE") throw new ConsultationPortalError("Your HYMN account is no longer active.", 403);
    const owner = await tx.teamMember.findFirst({ where: { workspaceId: workspace.id, status: "ACTIVE", role: { owner: true } }, orderBy: { joinedAt: "asc" }, select: { id: true } });
    if (!owner) throw new ConsultationPortalError("The HYMN team cannot accept consultation requests right now. Please try again later.", 503);
    const linkedCard = await tx.teamClient.findUnique({ where: { userId } });
    const card = linkedCard?.workspaceId === workspace.id ? linkedCard : null;
    const reusable = card || await tx.teamClient.findFirst({
      where: { workspaceId: workspace.id, userId: null, mergedIntoId: null, status: "ACTIVE", OR: [{ email: { equals: account.email, mode: "insensitive" } }, { secondaryEmail: { equals: account.email, mode: "insensitive" } }, { additionalEmails: { has: account.email.toLowerCase() } }] },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
    const previousPhone = reusable ? normaliseCardPhone(reusable.phone) : "";
    const alternatePhones = reusable
      ? [...new Set([...reusable.alternatePhones.map(normaliseCardPhone), ...(previousPhone && previousPhone !== mobile ? [previousPhone] : [])].filter(value => value && value !== mobile))]
      : [];
    const interests = [...new Set([...data.interests.map(id => cardInterest[id]), ...(reusable?.interests || [])])];
    const client = reusable
      ? await tx.teamClient.update({ where: { id: reusable.id }, data: { userId, name: data.fullName, email: account.email, phone: mobile, alternatePhones, interests, version: { increment: 1 } } })
      : await tx.teamClient.create({ data: { workspaceId: workspace.id, ownerId: owner.id, userId, name: data.fullName, email: account.email, phone: mobile, interests } });
    await tx.user.update({ where: { id: userId }, data: { name: data.fullName, mobile } });

    const assignee = await chooseAssignee(tx, workspace.id, data.interests, callbackAt);
    let calendarEventId: string | null = null;
    if (callbackAt && !assignee) throw new ConsultationPortalError("That callback time is no longer available. Choose another time or request a callback without selecting a slot.", 409);
    if (callbackAt && assignee) {
      const event = await tx.teamCalendarEvent.create({
        data: {
          workspaceId: workspace.id,
          creatorId: owner.id,
          assigneeId: assignee.id,
          clientId: client.id,
          title: `HYMN consultation with ${data.fullName}`,
          kind: "CALL",
          startsAt: callbackAt,
          endsAt: new Date(callbackAt.getTime() + 30 * 60_000),
          notes: scheduleNote(data.interests, data.otherRequirement),
          status: "SCHEDULED"
        }
      });
      calendarEventId = event.id;
      await queueAppointment(tx, event);
    }
    const status = callbackAt ? ConsultationStatus.CALLBACK_SCHEDULED : assignee ? ConsultationStatus.ASSIGNED : ConsultationStatus.UNASSIGNED;
    const request = await tx.consultationRequest.create({
      data: {
        workspaceId: workspace.id,
        userId,
        clientId: client.id,
        assignedMemberId: assignee?.id || null,
        calendarEventId,
        fullName: data.fullName,
        email: account.email,
        phoneE164: mobile,
        dialCode: data.dialCode,
        interests: data.interests,
        otherRequirement: data.otherRequirement,
        source: sourceLabel(data.source),
        campaign: data.campaign || null,
        referralUrl: data.referralUrl || null,
        landingPageUrl: data.landingPageUrl || "/consultation",
        referrer: data.referrer || null,
        firstTouchSource: sourceLabel(data.firstTouchSource),
        latestTouchSource: sourceLabel(data.latestTouchSource),
        utm: data.utm as Prisma.InputJsonValue,
        funnelEvents: [...new Set([...data.funnelEvents, "CONSULTATION_SUBMITTED"])],
        idempotencyKey: data.idempotencyKey,
        preferredCallback: callbackAt,
        consentAt: new Date(),
        consentVersion: consultationConsentVersion,
        marketingConsent: data.marketingConsent,
        status
      },
      include: { assignedMember: { include: { user: { select: { name: true } } } } }
    });
    await tx.consultationActivity.create({ data: { consultationId: request.id, kind: "SUBMITTED", metadata: { source: request.source, campaign: request.campaign, status } } });
    for (const event of request.funnelEvents) {
      await tx.consultationActivity.create({ data: { consultationId: request.id, kind: "FUNNEL_EVENT", metadata: { event } } });
    }
    const consultationHref = `/team?workspace=${encodeURIComponent(workspace.id)}&module=consultations&consultation=${encodeURIComponent(request.id)}`;
    if (assignee) await notifyMember(tx, assignee.id, `New consultation request: ${data.fullName}`, consultationHref);
    else {
      const managers = await tx.teamMember.findMany({ where: { workspaceId: workspace.id, status: "ACTIVE", OR: [{ role: { owner: true } }, { role: { permissions: { has: "tasks.assign" } } }] }, select: { id: true } });
      for (const manager of managers) await notifyMember(tx, manager.id, `Unassigned consultation request: ${data.fullName}`, consultationHref);
    }
    return { request, duplicate: false };
  }, { maxWait: 10000, timeout: 30000 });

  return {
    id: result.request.id,
    appointmentEventId: result.request.calendarEventId,
    duplicate: result.duplicate,
    fullName: result.request.fullName,
    email: result.request.email,
    phone: result.request.phoneE164,
    interests: result.request.interests,
    preferredCallback: result.request.preferredCallback?.toISOString() || null,
    status: result.request.status,
    assigned: Boolean(result.request.assignedMemberId),
    assignedMember: result.request.assignedMember?.user.name || null
  };
}

export { CONSULTATION_STATUSES, funnelEventIds };
