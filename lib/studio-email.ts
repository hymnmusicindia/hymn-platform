import { prisma } from "@/lib/prisma";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { sendTransactionalEmail } from "@/lib/email/send-transactional-email";
type StudioEmailEvent = "request" | "accepted" | "declined" | "delivery" | "revision" | "completed" | "refund";
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
export async function sendStudioEmail(orderPublicId: string, event: StudioEmailEvent, eventKey: string) {
  const order = await prisma.studioServiceOrder.findUnique({ where: { publicId: orderPublicId }, include: { customer: true, engineerParty: { include: { claimedBy: true } }, engineerProfile: true } });
  if (!order) return;
  const engineer = order.engineerParty.claimedBy;
  const toEngineer = ["request", "revision", "completed"].includes(event);
  const recipient = toEngineer ? engineer : order.customer;
  if (!recipient) return;
  const subjects: Record<StudioEmailEvent,string> = { request: "New HYMN Studio request", accepted: "Your Studio project was accepted", declined: "Your Studio request was declined", delivery: "Your Studio delivery is ready", revision: "A Studio revision was requested", completed: "Studio project completed", refund: "Studio payment refund update" };
  const action = `${getPublicAppUrl()}/studio/orders/${order.publicId}`;
  const message = `${subjects[event]} for “${order.projectTitle}”.`;
  await sendTransactionalEmail({ to: recipient.email, userId: recipient.id, subject: subjects[event], template: `studio_${event}`, eventKey: `studio:${order.id}:${event}:${eventKey}:email`, entityType: "studio_order", entityId: order.id, html: `<p>Hi ${escape(recipient.name)},</p><p>${escape(message)}</p><p><a href="${escape(action)}">Open Studio workspace</a></p>`, text: `Hi ${recipient.name}, ${message} ${action}` });
}
