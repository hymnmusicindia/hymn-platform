import { isSameAppOrigin } from "@/lib/request-origin";
import { NextResponse, after } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { teamActor, teamIdentity } from "@/lib/team/access";
import { TeamError } from "@/lib/team/policy";
import { teamMutation, teamRead, acceptTeamInvitation, teamWrite } from "@/lib/team/service";
import { consumeRateLimit } from "@/lib/rate-limit";
import { recoverTeamRead, teamDatabaseErrorCode } from "@/lib/team/read-recovery";
import { emailLayout, emailText } from "@/lib/email/email-templates";
import { sendTransactionalEmail } from "@/lib/email/send-transactional-email";
import { getPublicAppUrl } from "@/lib/public-app-url";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
function failure(error: unknown) {
  if (error instanceof TeamError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400, headers });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "This record already exists. Refresh before trying again." }, { status: 409, headers });
  // Avoid logging raw Prisma errors: they can contain query arguments and PII.
  console.error("TEAM_WORKSPACE_REQUEST_FAILED", { code: teamDatabaseErrorCode(error) });
  return NextResponse.json({ error: "Team Workspace is temporarily unavailable. Please try again." }, { status: 503, headers });
}
type Context = { params: Promise<{ resource: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const url = new URL(request.url); const { resource } = await context.params;
    const result = await recoverTeamRead(async () => {
      const a = await teamActor(url.searchParams.get("workspace") || undefined);
      return teamRead(a, resource, url.searchParams);
    });
    return NextResponse.json(result, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    // Session cookies are SameSite=Lax; additionally require same-origin browser
    // writes. Never trust a client-supplied role/member identity.
    if (!isSameAppOrigin(request)) throw new TeamError("Same-origin request required.", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new TeamError("JSON content required.", 415);
    if (Number(request.headers.get("content-length") || 0) > 256000) throw new TeamError("Request too large.", 413);
    const text = await request.text(); if (text.length > 256000) throw new TeamError("Request too large.", 413);
    let body: unknown; try { body = JSON.parse(text); } catch { throw new TeamError("Invalid JSON."); }
    const user = await teamIdentity();
    const limit = await consumeRateLimit({ scope: "team-write", identity: String(user.id), limit: 90, windowSeconds: 60 });
    if (!limit.allowed) throw new TeamError("Too many changes. Try again shortly.", 429);
    const { resource } = await context.params;
    if (["acquisition-email-queue", "team-email-send", "team-email-retry"].includes(resource)) {
      const emailLimit = await consumeRateLimit({ scope: "team-acquisition-email", identity: String(user.id), limit: 5, windowSeconds: 3600 });
      if (!emailLimit.allowed) throw new TeamError("Email outreach is limited to 5 individual messages per hour.", 429);
    }
    const actor=resource==='accept'?null:await teamActor(new URL(request.url).searchParams.get('workspace')||undefined);
    const result = resource === "accept" ? await acceptTeamInvitation(user, typeof (body as { token?: unknown })?.token === "string" ? (body as { token: string }).token : "") : await teamMutation(actor!, resource, body);
    if(actor&&['clients-save','prospect-research-save','prospect-call-save'].includes(resource))after(async()=>{const {syncSourceWork}=await import('@/lib/team/autonomous-work');await teamWrite(actor,(tx,a)=>syncSourceWork(tx,a));});
    if(actor&&['availability-save','availability-policy'].includes(resource))after(async()=>{await teamWrite(actor,async(tx,a)=>{await (await import('@/lib/team/coordinator')).syncCoordinator(tx,a);});});
    if(actor&&resource==='coordinator-intake'&&result&&typeof result==='object'&&'id' in result) {
      const intakeId=String(result.id);
      after(async()=>{await teamWrite(actor,async(tx,a)=>{await (await import('@/lib/team/coordinator')).dispatchIntake(tx,a,intakeId);});const {prisma}=await import('@/lib/prisma');const item=await prisma.teamWorkIntake.findUnique({where:{id:intakeId},select:{taskId:true}});if(item?.taskId){const event=await prisma.teamCalendarEvent.findUnique({where:{followUpTaskId:item.taskId},select:{id:true}});if(event)await (await import('@/lib/team/appointments')).processAppointments(event.id,4);}});
    }
    if(['coordinator-intake','coordinator-update','call-followup-update','call-followup-outcome'].includes(resource) && result && typeof result==='object') {
      const row=result as {taskId?:string;id?:string};
      const taskId=resource.startsWith('coordinator-')?row.taskId:row.id;
      if(taskId)after(async()=>{const {prisma}=await import('@/lib/prisma');const event=await prisma.teamCalendarEvent.findUnique({where:{followUpTaskId:taskId},select:{id:true}});if(event)await (await import('@/lib/team/appointments')).processAppointments(event.id,4);});
    }
    if (resource === "call-followup-outcome" && result && typeof result === "object" && "followupEmail" in result) {
      const job = result.followupEmail as { id: string; status: string } | null;
      if (job?.status === "QUEUED") after(async () => { const { processTeamOutreachEmail } = await import("@/lib/team/outreach-email"); await processTeamOutreachEmail(job.id, 1); });
    }
    if (resource === "clients-save" && result && typeof result === "object" && "id" in result) {
      const clientId = String(result.id);
      after(async () => { const { processClientWelcomes } = await import("@/lib/team/client-welcome"); await processClientWelcomes(clientId, 1); });
    }
    if (resource === "consultations" && result && typeof result === "object" && "calendarEventId" in result && typeof result.calendarEventId === "string") {
      const eventId = result.calendarEventId;
      after(async () => { const { processAppointments } = await import("@/lib/team/appointments"); await processAppointments(eventId, 4); });
    }
    if (resource === "consultations" && result && typeof result === "object" && "callbackCancelled" in result && result.callbackCancelled === true && "id" in result) {
      const consultationId = String(result.id);
      after(async () => {
        const { prisma } = await import("@/lib/prisma");
        const consultation = await prisma.consultationRequest.findUnique({ where: { id: consultationId }, select: { fullName: true, email: true, updatedAt: true } });
        if (!consultation) { console.error("CONSULTATION_CANCELLATION_NOTICE_MISSING_RECORD", { consultationId }); return; }
        const title = "Your HYMN consultation callback was cancelled";
        const email = {
          title,
          greeting: `Hi ${consultation.fullName},`,
          body: "The callback time previously reserved for you has been cancelled. The HYMN team will contact you to arrange another convenient time.",
          ctaLabel: "Visit HYMN",
          ctaUrl: getPublicAppUrl()
        };
        const delivery = await sendTransactionalEmail({
          to: consultation.email,
          subject: title,
          template: "consultation_callback_cancelled",
          html: emailLayout(email),
          text: emailText(email),
          eventKey: `consultation:${consultationId}:callback-cancel:${consultation.updatedAt.getTime()}`,
          entityType: "consultation_request",
          entityId: consultationId
        });
        if (!["sent", "duplicate_skipped"].includes(delivery.status)) console.error("CONSULTATION_CANCELLATION_EMAIL_NOT_SENT", { consultationId, status: delivery.status });
      });
    }
    if (["calendar-save", "calendar-handoff"].includes(resource) && result && typeof result === "object" && "id" in result) {
      const eventId = String(result.id);
      after(async () => { const { processAppointments } = await import("@/lib/team/appointments"); await processAppointments(eventId, 4); });
    }
    if (resource === "acquisition-email-queue" && result && typeof result === "object" && "id" in result) {
      const eventId = String(result.id);
      after(async () => { const { processAcquisitionEmailEvent } = await import("@/lib/team/acquisition-email"); await processAcquisitionEmailEvent(eventId); });
    }
    if (["team-email-send", "team-email-retry"].includes(resource) && result && typeof result === "object" && "id" in result) {
      const id = String(result.id);
      after(async () => { const { processTeamOutreachEmail } = await import("@/lib/team/outreach-email"); await processTeamOutreachEmail(id, 1); });
    }
    if (resource.startsWith('workstation-') && result && typeof result === 'object') {
      const row = result as { email?: { id?: string; status?: string; channel?: string }; id?: string; status?: string; channel?: string };
      const mail = row.email || (resource === 'workstation-email' ? row : null);
      if (mail?.id && mail.status === 'QUEUED') after(async () => {
        if (mail.channel === 'support') await (await import('@/lib/support')).processSupportMail(mail.id);
        else await (await import('@/lib/team/outreach-email')).processTeamOutreachEmail(mail.id,1);
      });
    }
    return NextResponse.json(result, { headers });
  } catch (error) { return failure(error); }
}
