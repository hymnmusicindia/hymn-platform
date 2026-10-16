import "server-only";
import { prisma } from "@/lib/prisma";
import { getEmailConfig } from "./email-client";
import { emailLayout, emailText } from "./email-templates";
import { sendTransactionalEmail } from "./send-transactional-email";
import { studioPreferenceToken } from "@/lib/studio-beat-followups";
export const ENGINEER_REMINDER_TEMPLATE = "engineer_booking_one_day_v1";
export function engineerReminderContent(input: { name: string; engineer: string; project: string; resumeUrl: string; engineersUrl: string; preferencesUrl: string }) {
  const model = { title: "A good song deserves a good engineer.", greeting: `Hi ${input.name || "artist"},`, body: `We noticed you started a booking with ${input.engineer} for “${input.project}”, but payment is still unfinished.\n\nIf you’re still looking for an engineer, this could be your next step towards a polished, release-ready record. Revisit the samples, scope and price, and complete the booking when you feel ready. Work starts after payment and the engineer’s confirmation—not before.\n\nNot sure this is the right engineer? We have more engineers to explore. Take your time finding the right fit for your sound.\n\nAlready booked or changed your plans? No action is needed. This is a one-time reminder.`, ctaLabel: "Continue my booking", ctaUrl: input.resumeUrl, sections: [{ title: "Find your sound’s best match", body: "Explore other HYMN engineers and their work before choosing.", linkLabel: "Explore engineers", linkUrl: input.engineersUrl }] };
  model.sections.push({ title: "Optional Studio emails", body: "You can stop engineer recommendations and optional Studio reminders at any time.", linkLabel: "Stop optional Studio emails", linkUrl: input.preferencesUrl });
  return { subject: `${input.name || "Artist"}, a good song deserves a good engineer`, html: emailLayout(model), text: emailText(model) };
}
export async function sendEngineerBookingReminders(deliver = sendTransactionalEmail) {
  const config = getEmailConfig(); if (!config.enabled || !process.env.JWT_SECRET || process.env.ENGINEER_REMINDERS_ENABLED === "false") return { enabled: false, sent: 0 };
  const cutoff = new Date(Date.now() - 86400000);
  const done = await prisma.emailLog.findMany({ where: { template: ENGINEER_REMINDER_TEMPLATE }, select: { userId: true } });
  const candidates = await prisma.studioServiceOrder.findMany({ where: { status: "AWAITING_PAYMENT", paymentStatus: "UNPAID", cancelledAt: null, createdAt: { lt: cutoff }, customerId: { notIn: done.flatMap(r => r.userId ? [r.userId] : []) }, customer: { status: "ACTIVE", studioTipsEnabled: true, studioOrders: { none: { paymentStatus: "PAID" } } }, engineerProfile: { sellerState: "ACTIVE" }, serviceListing: { active: true, paused: false } }, select: { customerId: true }, distinct: ["customerId"], take: 100 });
  let sent = 0, failed = 0;
  for (const candidate of candidates) {
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(19462029, ${candidate.customerId}::int)`;
      const eventKey = `${ENGINEER_REMINDER_TEMPLATE}:${candidate.customerId}`;
      if (await tx.emailLog.findUnique({ where: { eventKey } })) return;
      const order = await tx.studioServiceOrder.findFirst({ where: { customerId: candidate.customerId, status: "AWAITING_PAYMENT", paymentStatus: "UNPAID", cancelledAt: null, customer: { status: "ACTIVE" } }, orderBy: { createdAt: "desc" }, include: { customer: { select: { name: true, email: true } }, engineerProfile: { select: { professionalName: true, sellerState: true } } } });
      if (!order || order.createdAt >= cutoff) return;
      if (await tx.studioServiceOrder.findFirst({ where: { customerId: candidate.customerId, paymentStatus: "PAID", paidAt: { gte: order.createdAt } }, select: { id: true } })) return;
      // Do not recommend an unavailable/suspended engineer, or resurrect a cancelled checkout.
      if (order.engineerProfile.sellerState !== "ACTIVE") return;
      const current = await prisma.studioServiceOrder.findFirst({ where: { id: order.id, status: "AWAITING_PAYMENT", paymentStatus: "UNPAID", cancelledAt: null, customer: { status: "ACTIVE", studioTipsEnabled: true }, serviceListing: { active: true, paused: false } }, select: { id: true } }); if (!current) return;
      const content = engineerReminderContent({ name: order.customer.name, engineer: order.engineerProfile.professionalName, project: order.projectTitle, resumeUrl: `${config.appUrl}/studio/orders/${order.publicId}`, engineersUrl: `${config.appUrl}/studio#engineers`, preferencesUrl: `${config.appUrl}/studio/email-preferences?token=${studioPreferenceToken(order.customerId)}` });
      const result = await deliver({ ...content, to: order.customer.email, userId: order.customerId, eventKey, template: ENGINEER_REMINDER_TEMPLATE, entityType: "studio_order", entityId: order.id });
      if (result.status === "sent") sent++; if (result.status === "failed") failed++;
    }, { timeout: 45000 });
    if (sent + failed >= 5) break;
  }
  return { enabled: true, sent, failed };
}
