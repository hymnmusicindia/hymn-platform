import { requireSupportAccess } from "@/lib/support-access";
import { isSameAppOrigin } from "@/lib/request-origin";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { SupportError, validateSupportDetails, changeSupportCallback, queueSupportReply, retrySupportReply, processSupportMail, readSupportTicket } from "@/lib/support";
import { after, NextResponse } from "next/server";
import { createSupportTicket, listAllSupportTickets, listSupportTicketsByUser, updateSupportTicketStatus } from "@/lib/db";
import { requireUser } from "@/lib/access";
import type { SupportTicketStatus } from "@/lib/types";
import { createAdminTaskOnce, resolveAdminTask } from "@/lib/task-queue";
import { logAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";

function parseStatus(value: unknown): SupportTicketStatus | null {
  if (value === "open" || value === "in_progress" || value === "resolved" || value === "closed") return value;
  return null;
}

export async function GET() {
  const result = await requireUser();
  const access = await requireSupportAccess();
  if (!("error" in access)) {
    return NextResponse.json({tickets:await listAllSupportTickets(), reviewer:true},{headers:{"Cache-Control":"private, no-store"}});
  }
  if ("error" in result) return result.error;
  const tickets = await listSupportTicketsByUser(result.user.id);
  return NextResponse.json({ tickets },{headers:{"Cache-Control":"private, no-store"}});
}

async function post(request: Request) {
  if (!isSameAppOrigin(request)) return NextResponse.json({error:"Same-origin request required."},{status:403});
  if (Number(request.headers.get("content-length") || 0)>50000) throw new SupportError("Request too large.",413);
  const text=await request.text();
  if(text.length>50000)throw new SupportError("Request too large.",413);
  let body; try {body=JSON.parse(text);}catch {throw new SupportError("Invalid JSON request.");}
  if(!body||typeof body!=="object"||Array.isArray(body))throw new SupportError("Invalid request.");
  const action = String(body.action || "create");

  if (["update-status", "send-reply", "retry-reply", "callback-no-answer", "callback-contacted"].includes(action)) {
    const access = await requireSupportAccess();
    if ("error" in access) return access.error;
    const actorId = "sub" in access ? Number(access.sub) : 0;
    const ticketId = Number(body.ticketId);
    if (!Number.isInteger(ticketId) || ticketId <= 0) throw new SupportError("Invalid ticket.");
    if (action === "send-reply" || action === "retry-reply") {
      const rate = await consumeRateLimit({scope:"support-reply",identity:String(actorId || "admin-session"),limit:30,windowSeconds:3600});
      if (!rate.allowed) throw new SupportError("Email limit reached. Try later.",429);
      const reply = action === "retry-reply" ? await retrySupportReply(ticketId,body,actorId) : await queueSupportReply(ticketId, actorId, body);
      after(async()=>{await processSupportMail(reply.id);});
      return NextResponse.json({ticket:await readSupportTicket(ticketId)}, {headers:{"Cache-Control":"no-store"}});
    }
    if (action === "callback-no-answer" || action === "callback-contacted") {
      const ticket = await changeSupportCallback(ticketId,null,body);
      await logAuditEvent({actorType:"admin",actorId:actorId || null,entityType:"support_ticket",entityId:ticketId,action:`support.${action}`,newValue:{notes:String(body.notes).slice(0,2000)}});
      return NextResponse.json({ticket});
    }
    const status = parseStatus(body.status);
    if (!status) throw new SupportError("A valid ticket status is required.");
    await prisma.supportTicket.findUniqueOrThrow({where:{id:ticketId}}).catch(()=>{throw new SupportError("Ticket not found.",404);});
    await updateSupportTicketStatus(ticketId,status);
    if (status === "resolved" || status === "closed") await resolveAdminTask(`support:${ticketId}:open`, `Support ticket ${status}.`);
    await logAuditEvent({actorType:"admin",actorId:actorId || null,entityType:"support_ticket",entityId:ticketId,action:`support.${status}`});
    return NextResponse.json({ticket:await readSupportTicket(ticketId)});
  }
  const result = await requireUser();
  if ("error" in result) return result.error;
  if (!await prisma.user.count({where:{id:result.user.id,status:"ACTIVE"}})) throw new SupportError("Your account is not active.",403);
  if (action === "request-callback") {
    if(!Number.isSafeInteger(Number(body.ticketId))||Number(body.ticketId)<1)throw new SupportError("Invalid ticket.");
    const rate=await consumeRateLimit({scope:"support-callback",identity:String(result.user.id),limit:5,windowSeconds:3600});
    if(!rate.allowed)throw new SupportError("Callback request limit reached. Please try later.",429);
    const ticket = await changeSupportCallback(Number(body.ticketId),result.user.id,body);
    await createAdminTaskOnce({eventKey:`support:${ticket.id}:callback:${ticket.details?.callbackRequestedAt}`,type:"Support callback",priority:"high",title:`Callback: ${ticket.subject}`,body:`Customer requested a callback. ${ticket.details?.callbackPreference || ""}`,href:`/admin?tab=support&ticketId=${ticket.id}`,entityType:"support_ticket",entityId:ticket.id});
    return NextResponse.json({ticket});
  }
  if (action !== "create") throw new SupportError("Unsupported support action.");

  const subject = String(body.subject || "").trim();
  const message = String(body.message || "").trim();
  if (subject.length < 3 || subject.length > 200 || message.length < 10 || message.length > 10000) {
    return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
  }

  const parseId = (value: unknown) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
  const rate = await consumeRateLimit({scope:"support-create",identity:String(result.user.id),limit:10,windowSeconds:3600});
  if (!rate.allowed) throw new SupportError("Request limit reached. Try later.",429);
  const details = await validateSupportDetails(body,result.user);
  const relatedReleaseId = parseId(body.relatedReleaseId);
  if (relatedReleaseId && !await prisma.release.count({where:{id:relatedReleaseId,userId:result.user.id}})) throw new SupportError("Release not found.",404);
  const ticket = await createSupportTicket({
    details,
    userId: result.user.id,
    subject,
    message,
    category: typeof body.category === "string" ? body.category.slice(0, 80) : "general",
    priority: body.priority === "high" ? "high" : "normal",
    relatedReleaseId: parseId(body.relatedReleaseId),
    relatedPurchaseId: parseId(body.relatedPurchaseId),
    relatedPayoutId: parseId(body.relatedPayoutId)
  });
  await Promise.all([
    createAdminTaskOnce({ eventKey: `support:${ticket.id}:open`, type: "Support Ticket Open", priority: ticket.details?.callbackRequestedAt || ticket.priority === "high" ? "high" : "normal", title: ticket.subject, body: ticket.message, href: `/admin?tab=support&ticketId=${ticket.id}`, entityType: "support_ticket", entityId: ticket.id }),
    logAuditEvent({ actorType: "user", actorId: result.user.id, entityType: "support_ticket", entityId: ticket.id, action: "support.created", newValue: { category: ticket.category, priority: ticket.priority, relatedReleaseId: ticket.relatedReleaseId, relatedPurchaseId: ticket.relatedPurchaseId, relatedPayoutId: ticket.relatedPayoutId } })
  ]);
  return NextResponse.json({ ticket }, { status: 201 });
}

export async function POST(request:Request) {
  try {return await post(request);}
  catch(error) {return NextResponse.json({error:error instanceof SupportError ? error.message : "Support is temporarily unavailable. Please retry."},{status:error instanceof SupportError?error.status:503,headers:{"Cache-Control":"no-store"}});}
}
// vercel trigger
