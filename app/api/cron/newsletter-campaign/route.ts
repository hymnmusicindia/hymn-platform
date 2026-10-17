import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getEmailConfig } from "@/lib/email/email-client";
import { sendTransactionalEmail } from "@/lib/email/send-transactional-email";
import { newsletterEmail } from "@/lib/newsletter";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request, campaignId: number, deliveryTokenHash?: string | null) {
  const bearer = request.headers.get("authorization");
  if (process.env.CRON_SECRET && bearer === `Bearer ${process.env.CRON_SECRET}`) return true;
  const deliveryToken = request.headers.get("x-campaign-token");
  if (deliveryToken && deliveryTokenHash) {
    const actual = crypto.createHash("sha256").update(deliveryToken).digest("hex");
    if (actual.length === deliveryTokenHash.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(deliveryTokenHash))) return true;
  }
  const timestamp = request.headers.get("x-campaign-timestamp") || "";
  const signature = request.headers.get("x-campaign-signature") || "";
  if (!/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 5 * 60_000) return false;
  return [process.env.NEWSLETTER_WORKER_SECRET, process.env.ADMIN_JWT_SECRET].filter(Boolean).some(secret => {
    const expected = crypto.createHmac("sha256", secret!).update(`${campaignId}.${timestamp}`).digest("hex");
    return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  });
}

export async function POST(request: Request) {
  const campaignId = Number(new URL(request.url).searchParams.get("campaignId"));
  if (!Number.isInteger(campaignId) || campaignId < 1) return NextResponse.json({ error: "A valid campaignId is required." }, { status: 400 });
  let campaign = await prisma.newsletterCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (!authorized(request, campaignId, campaign.deliveryTokenHash)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const runId = crypto.randomUUID(), leaseKey = `newsletter-campaign:${campaignId}`;
  const lease = await prisma.$queryRaw<Array<{ run_id: string }>>`INSERT INTO cron_leases (lease_key,run_id,leased_until,updated_at) VALUES (${leaseKey},${runId},NOW()+INTERVAL '10 minutes',NOW()) ON CONFLICT (lease_key) DO UPDATE SET run_id=EXCLUDED.run_id,leased_until=EXCLUDED.leased_until,updated_at=NOW() WHERE cron_leases.leased_until<NOW() RETURNING run_id`;
  if (lease[0]?.run_id !== runId) return NextResponse.json({ skipped: "already_running", campaignId });
  try {
  if (!getEmailConfig().enabled) return NextResponse.json({ error: "SMTP delivery is not configured." }, { status: 503 });
  if (!['queued', 'sending'].includes(campaign.status)) return NextResponse.json({ error: `Campaign is ${campaign.status}.` }, { status: 409 });
  const recipients = await prisma.newsletterSubscriber.findMany({ where: { status: "subscribed", id: { gt: campaign.cursorId } }, orderBy: { id: "asc" }, take: 50 });
  let sent = 0; let failed = 0;
  const deadline = Date.now() + 40000;
  let lastProcessedId = campaign.cursorId;
  for (const recipient of recipients) {
    if (Date.now() >= deadline) break;
    const content = newsletterEmail({ subject: campaign.subject, message: campaign.text, unsubscribeToken: recipient.unsubscribeToken, imageUrl: campaign.imageUrl, imageAlt: campaign.imageAlt, ctaLabel: campaign.ctaLabel, ctaUrl: campaign.ctaUrl });
    const baseEventKey = `newsletter:${campaign.id}:subscriber:${recipient.id}`;
    const interrupted = await prisma.emailLog.findUnique({ where: { eventKey: baseEventKey }, select: { status: true, retryCount: true } });
    // A crash after SMTP acceptance can leave queued state. Do not turn that
    // uncertainty into a new event key and potentially duplicate the email.
    if (interrupted?.status === "queued") return NextResponse.json({ campaignId, error: "An interrupted email needs delivery review before this campaign can continue." }, { status: 409 });
    const result = await sendTransactionalEmail({ to: recipient.email, timeoutMs: Math.max(1000, Math.min(8000, deadline - Date.now())), subject: campaign.subject, html: content.html, text: content.text, template: "newsletter_campaign", eventKey: baseEventKey, entityType: "newsletter_campaign", entityId: campaign.id });
    if (result.status === "sent" || result.status === "duplicate_skipped" && interrupted?.status === "sent") sent += 1; else failed += 1;
    lastProcessedId = recipient.id;
  }
  const latestCampaign = await prisma.newsletterCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
  const cursorId = Math.max(latestCampaign.cursorId, lastProcessedId);
  const remaining = await prisma.newsletterSubscriber.count({ where: { status: "subscribed", id: { gt: cursorId } } });
  const eventKeyPrefix = `newsletter:${campaign.id}:subscriber:`;
  const [sentLogs, totalFailed] = await Promise.all([
    prisma.emailLog.count({ where: { eventKey: { startsWith: eventKeyPrefix }, status: "sent" } }),
    prisma.emailLog.count({ where: { eventKey: { startsWith: eventKeyPrefix }, status: "failed" } }),
  ]);
  const totalSent = Math.min(campaign.recipientCount, sentLogs);
  const finalStatus = remaining ? "sending" : totalSent === 0 && totalFailed > 0 ? "failed" : totalFailed > 0 ? "partial" : "sent";
  campaign = await prisma.newsletterCampaign.update({ where: { id: campaign.id }, data: { cursorId, sentCount: totalSent, failedCount: totalFailed, status: finalStatus, ...(!remaining && totalSent > 0 ? { sentAt: new Date() } : {}) } });
  return NextResponse.json({ campaignId: campaign.id, status: campaign.status, processed: sent + failed, sent, failed, remaining, totalSent, totalFailed });
  } finally { await prisma.$executeRaw`UPDATE cron_leases SET leased_until=NOW(),updated_at=NOW() WHERE lease_key=${leaseKey} AND run_id=${runId}`.catch(() => undefined); }
}
