import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminPermission, requireRecentAdminPermission } from "@/lib/access";
import { getEmailConfig } from "@/lib/email/email-client";
import { sendTransactionalEmail } from "@/lib/email/send-transactional-email";
import { newsletterEmail } from "@/lib/newsletter";
import { getPublicAppUrl } from "@/lib/public-app-url";

const createSchema = z.object({ subject: z.string().trim().min(3).max(180), message: z.string().trim().min(3).max(20_000), imageUrl: z.string().url().max(2048).optional(), imageAlt: z.string().trim().max(160).optional(), campaignId: z.number().int().positive().optional() });
const batchSize = 50;

export async function GET(request: Request) {
  const admin = await requireAdminPermission("system.manage");
  if ("error" in admin) return admin.error;
  const mode = new URL(request.url).searchParams.get("format");
  const subscribers = await prisma.newsletterSubscriber.findMany({ where: { status: "subscribed" }, orderBy: { id: "asc" }, select: { email: true, source: true, status: true, consentAt: true } });
  if (mode === "csv") return new NextResponse(`email,source,status,consent_at\n${subscribers.map(row => [row.email, row.source, row.status, row.consentAt.toISOString()].map(value => `"${value.replace(/"/g, '""')}"`).join(",")).join("\n")}\n`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=hymn-newsletter-subscribers.csv", "Cache-Control": "no-store" } });
  if (mode === "text") return new NextResponse(subscribers.map(row => row.email).join(", "), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  const [total, unsubscribed, campaigns] = await Promise.all([prisma.newsletterSubscriber.count({ where: { status: "subscribed" } }), prisma.newsletterSubscriber.count({ where: { status: "unsubscribed" } }), prisma.newsletterCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 20 })]);
  return NextResponse.json({ total, unsubscribed, campaigns, configured: getEmailConfig().enabled }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const admin = await requireRecentAdminPermission("system.manage");
  if ("error" in admin) return admin.error;
  if (!getEmailConfig().enabled) return NextResponse.json({ error: "Email sending is not enabled or configured in this environment." }, { status: 503 });
  try {
    const input = createSchema.parse(await request.json());
    if (input.imageUrl && !input.imageUrl.startsWith(`${getPublicAppUrl()}/api/public-uploads/site/newsletter/`)) return NextResponse.json({ error: "Upload campaign images through the newsletter composer." }, { status: 400 });
    const actorId = "sub" in admin ? Number(admin.sub) : null;
    let campaign = input.campaignId ? await prisma.newsletterCampaign.findUnique({ where: { id: input.campaignId } }) : null;
    if (!campaign) {
      const recipientCount = await prisma.newsletterSubscriber.count({ where: { status: "subscribed" } });
      campaign = await prisma.newsletterCampaign.create({ data: { subject: input.subject, html: input.message, text: input.message, imageUrl: input.imageUrl || null, imageAlt: input.imageAlt || null, recipientCount, createdById: actorId, status: "sending" } });
      await prisma.auditLog.create({ data: { actorType: "admin", actorId, action: "NEWSLETTER_CAMPAIGN_CREATED", entity: "newsletter_campaign", entityId: String(campaign.id), metadata: { recipientCount } } });
    }
    if (["sent", "cancelled"].includes(campaign.status)) return NextResponse.json({ error: "This campaign has already finished." }, { status: 409 });
    const recipients = await prisma.newsletterSubscriber.findMany({ where: { status: "subscribed", id: { gt: campaign.cursorId } }, orderBy: { id: "asc" }, take: batchSize });
    let sent = 0, failed = 0;
    for (const recipient of recipients) {
      const content = newsletterEmail({ message: campaign.text, unsubscribeToken: recipient.unsubscribeToken, imageUrl: campaign.imageUrl, imageAlt: campaign.imageAlt });
      const result = await sendTransactionalEmail({ to: recipient.email, subject: campaign.subject, html: content.html, text: content.text, template: "newsletter_campaign", eventKey: `newsletter:${campaign.id}:subscriber:${recipient.id}`, entityType: "newsletter_campaign", entityId: campaign.id });
      if (result.status === "sent" || result.status === "duplicate_skipped") sent += 1; else failed += 1;
    }
    const cursorId = recipients.at(-1)?.id ?? campaign.cursorId;
    const remaining = await prisma.newsletterSubscriber.count({ where: { status: "subscribed", id: { gt: cursorId } } });
    campaign = await prisma.newsletterCampaign.update({ where: { id: campaign.id }, data: { cursorId, sentCount: { increment: sent }, failedCount: { increment: failed }, status: remaining ? "sending" : "sent", ...(remaining ? {} : { sentAt: new Date() }) } });
    if (!remaining) await prisma.auditLog.create({ data: { actorType: "admin", actorId, action: "NEWSLETTER_CAMPAIGN_COMPLETED", entity: "newsletter_campaign", entityId: String(campaign.id), metadata: { sentCount: campaign.sentCount, failedCount: campaign.failedCount } } });
    return NextResponse.json({ campaign, processed: recipients.length, remaining, complete: remaining === 0 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send newsletter batch." }, { status: 400 }); }
}
