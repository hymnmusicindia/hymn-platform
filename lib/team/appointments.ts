import "server-only";
import { Prisma, type TeamCalendarEvent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEmailConfig } from "@/lib/email/email-client";
import { sendTransactionalEmail } from "@/lib/email/send-transactional-email";
import { emailLayout, emailText } from "@/lib/email/email-templates";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { notify } from "./service";

// Written in the same transaction as the appointment. Claims are atomic across
// hosts; uncertain SMTP outcomes require review, never an automatic duplicate.
export async function queueAppointment(tx: Prisma.TransactionClient, event: TeamCalendarEvent, now = new Date()) {
  await tx.teamAppointmentMessage.updateMany({ where: { eventId: event.id, status: "PENDING" }, data: { status: "CANCELLED" } });
  if (!['CALL','FOLLOW_UP'].includes(event.kind) || event.status !== "SCHEDULED" || !event.clientId || event.startsAt <= now) return;
  const jobs = [...(event.kind==='CALL'?[{kind:'CLIENT_CONFIRM',dueAt:now}]:[]), { kind: "REP_CONFIRM", dueAt: now }];
  for (const [kind, minutes] of [["CLIENT_REMINDER", 30], ["REP_REMINDER", 40]] as const) {
    if(event.kind==='FOLLOW_UP'&&kind==='CLIENT_REMINDER')continue;
    const dueAt = new Date(event.startsAt.getTime() - minutes * 60000);
    // Last-minute bookings get confirmation, not two consecutive emails.
    if (dueAt > now) jobs.push({ kind, dueAt });
  }
  await tx.teamAppointmentMessage.createMany({ data: jobs.map(job => ({ ...job, eventId: event.id, revision: event.scheduleRevision })), skipDuplicates: true });
}

export async function processAppointments(eventId?: string, limit = 20, deliver = sendTransactionalEmail, now = new Date()) {
  await prisma.teamAppointmentMessage.updateMany({ where: { status: "SENDING", updatedAt: { lt: new Date(now.getTime() - 5 * 60000) } }, data: { status: "REVIEW", error: "Interrupted delivery; inspect email log before retrying." } });
  const jobs = await prisma.teamAppointmentMessage.findMany({ where: { status: "PENDING", dueAt: { lte: now }, ...(eventId ? { eventId } : {}) }, orderBy: [{ updatedAt: "asc" }, { dueAt: "asc" }], take: Math.min(limit, 100) });
  const results: { id: string; status: string }[] = [];
  const deadline = Date.now() + 40000;
  for (const job of jobs) {
    if (Date.now() >= deadline) break; // Leave unclaimed jobs for the next minute.
    if (!(await prisma.teamAppointmentMessage.updateMany({ where: { id: job.id, status: "PENDING" }, data: { status: "SENDING" } })).count) continue;
    try {
      const e = await prisma.teamCalendarEvent.findUnique({ where: { id: job.eventId }, include: { client: true, assignee: { include: { user: true } } } });
      const finish = async (status: string, error: string | null = null) => { await prisma.teamAppointmentMessage.update({ where: { id: job.id }, data: { status, error } }); results.push({ id: job.id, status }); };
      if (!e || e.scheduleRevision !== job.revision || e.status !== "SCHEDULED" || !['CALL','FOLLOW_UP'].includes(e.kind) || e.kind==='FOLLOW_UP'&&!job.kind.startsWith('REP_') || e.startsAt <= now || e.client?.status !== "ACTIVE" || e.assignee.status !== "ACTIVE" || e.assignee.user.status !== "ACTIVE") { await finish("CANCELLED"); continue; }
      const client = e.client!;
      const rep = job.kind.startsWith("REP_");
      const when = new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Kolkata", hour12: true }).format(e.startsAt) + " IST";
      const day=new Date(e.startsAt.getTime()+330*60000).toISOString().slice(0,10);
      const href = `/team?workspace=${encodeURIComponent(e.workspaceId)}&module=calendar&event=${encodeURIComponent(e.id)}&date=${day}`;
      // Notification is independent of SMTP configuration and deduplicated with
      // the job in one transaction. Initial assignment is notified on save.
      if (job.kind === "REP_REMINDER" && !job.notifiedAt) await prisma.$transaction(async tx => {
        if ((await tx.teamAppointmentMessage.updateMany({ where: { id: job.id, notifiedAt: null }, data: { notifiedAt: now } })).count) await notify(tx, e.assigneeId, `Call ${client.name} at ${when}`, href);
      });
      const to = rep ? e.assignee.user.email : client.email;
      if (!to) { await finish("SKIPPED", "No primary email; in-app assignment remains available."); continue; }
      if (deliver === sendTransactionalEmail && !getEmailConfig().enabled) { await finish("PENDING", "SMTP is disabled or not configured."); continue; }
      const addresses = [client.email, client.secondaryEmail].filter(Boolean);
      const registered = await prisma.user.count({ where: { OR: addresses.map(email => ({ email: { equals: email, mode: "insensitive" as const } })) } });
      const reminder = job.kind.endsWith("REMINDER");
      const title = e.kind === "FOLLOW_UP" ? reminder ? "Your HYMN callback is coming up" : "HYMN callback assigned to you" : reminder ? "Your HYMN call is coming up" : "Your HYMN call is scheduled";
      const body = rep
        ? `You are assigned to call ${client.name} at ${when}.\n${client.phone ? `Phone: ${client.phone}\n` : "No phone is saved. Please coordinate contact details before the call.\n"}${client.email ? `Email: ${client.email}\n` : ""}${e.kind==='FOLLOW_UP'?'This is an internal callback plan; the customer has not been told this is a confirmed appointment.\n':''}If you cannot make it, open the appointment and choose Pass to next available rep. The customer time stays unchanged. If nobody is free, the call stays assigned until coverage is arranged.`
        : `We've ${reminder ? "got a quick reminder about" : "scheduled"} your call with HYMN. Our representative, ${e.assignee.user.name}, will call you at ${when}.${!client.phone ? " Please reply with the number we should call." : ""}\nIf you need to change the time, just reply to this email.${!registered ? "\nFor better assistance, sign up on HYMN so we can help you with your next steps in one place." : ""}`;
      const input = { title, greeting: `Hi ${rep ? e.assignee.user.name : client.name},`, body, ctaLabel: rep ? "View call or pass to another rep" : !registered ? "Sign up on HYMN" : "Open HYMN", ctaUrl: `${getPublicAppUrl()}${rep ? href : !registered ? "/login?mode=signup" : "/"}` };
      const eventKey = `team-appointment:${job.id}`;
      const result = await deliver({ to, subject: `${title} · ${when}`, template: "team_appointment", html: emailLayout(input), text: emailText(input), eventKey, entityType: "team_appointment", entityId: job.id, timeoutMs: 10000, ...(rep ? { userId: e.assignee.userId } : {}) });
      const sent = result.status === "sent" || result.status === "duplicate_skipped" && (await prisma.emailLog.findUnique({ where: { eventKey }, select: { status: true } }))?.status === "sent";
      await finish(sent ? "SENT" : "REVIEW", sent ? null : result.error || "Inspect email log before retrying.");
    } catch {
      await prisma.teamAppointmentMessage.update({ where: { id: job.id }, data: { status: "REVIEW", error: "Appointment delivery failed; inspect before retrying." } });
    }
  }
  return results;
}

export async function assertAppointmentRetryAllowed(jobId: string, email: string) {
  const job = await prisma.teamAppointmentMessage.findUnique({ where: { id: jobId }, include: { event: { include: { client: true, assignee: { include: { user: true } } } } } });
  const e = job?.event;
  const recipient = job?.kind.startsWith("REP_") ? e?.assignee.user.email : e?.client?.email;
  if (!job || job.status !== "REVIEW" || !e || e.scheduleRevision !== job.revision || e.status !== "SCHEDULED" || !(["CALL","FOLLOW_UP"].includes(e.kind)) || e.kind === "FOLLOW_UP" && !job.kind.startsWith("REP_") || e.startsAt <= new Date() || e.client?.status !== "ACTIVE" || e.assignee.status !== "ACTIVE" || e.assignee.user.status !== "ACTIVE" || recipient?.toLowerCase() !== email.toLowerCase()) throw new Error("Appointment changed, expired or already delivered; this email cannot be retried.");
}
