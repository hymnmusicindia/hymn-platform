import { NextResponse } from "next/server";
import { getEmailConfig } from "@/lib/email/email-client";
import { sendTransactionalEmail } from "@/lib/email/send-transactional-email";
import { newsletterEmail } from "@/lib/newsletter";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!getEmailConfig().enabled) return NextResponse.json({ error: "SMTP delivery is not configured." }, { status: 503 });
  const campaignId = Number(new URL(request.url).searchParams.get("campaignId"));
  if (!Number.isInteger(campaignId) || campaignId < 1) return NextResponse.json({ error: "A valid campaignId is required." }, { status: 400 });
  let campaign = await prisma.newsletterCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (!['queued', 'sending'].includes(campaign.status)) return NextResponse.json({ error: `Campaign is ${campaign.status}.` }, { status: 409 });
  const recipients = await prisma.newsletterSubscriber.findMany({ where: { status: "subscribed", id: { gt: campaign.cursorId } }, orderBy: { id: "asc" }, take: 50 });
  let sent = 0; let failed = 0;
  for (const recipient of recipients) {
    const content = newsletterEmail({ subject: campaign.subject, message: campaign.text, unsubscribeToken: recipient.unsubscribeToken, imageUrl: campaign.imageUrl, imageAlt: campaign.imageAlt, ctaLabel: campaign.ctaLabel, ctaUrl: campaign.ctaUrl });
    const result = await sendTransactionalEmail({ to: recipient.email, subject: campaign.subject, html: content.html, text: content.text, template: "newsletter_campaign", eventKey: `newsletter:${campaign.id}:subscriber:${recipient.id}`, entityType: "newsletter_campaign", entityId: campaign.id });
    if (result.status === "sent" || result.status === "duplicate_skipped") sent += 1; else failed += 1;
  }
  const latestCampaign = await prisma.newsletterCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
  const cursorId = Math.max(latestCampaign.cursorId, recipients.at(-1)?.id ?? campaign.cursorId);
  const remaining = await prisma.newsletterSubscriber.count({ where: { status: "subscribed", id: { gt: cursorId } } });
  const eventKeyPrefix = `newsletter:${campaign.id}:subscriber:`;
  const [totalSent, totalFailed] = await Promise.all([
    prisma.emailLog.count({ where: { eventKey: { startsWith: eventKeyPrefix }, status: "sent" } }),
    prisma.emailLog.count({ where: { eventKey: { startsWith: eventKeyPrefix }, status: "failed" } }),
  ]);
  const finalStatus = remaining ? "sending" : totalSent === 0 && totalFailed > 0 ? "failed" : totalFailed > 0 ? "partial" : "sent";
  campaign = await prisma.newsletterCampaign.update({ where: { id: campaign.id }, data: { cursorId, sentCount: totalSent, failedCount: totalFailed, status: finalStatus, ...(!remaining && totalSent > 0 ? { sentAt: new Date() } : {}) } });
  return NextResponse.json({ campaignId: campaign.id, status: campaign.status, processed: recipients.length, sent, failed, remaining, totalSent, totalFailed });
}
