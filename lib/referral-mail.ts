import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getEmailClient, getEmailConfig } from "@/lib/email/email-client";
import { getPublicAppUrl } from "@/lib/public-app-url";

const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

// Transactional outbox: committed signups survive server exits and SMTP outages.
// SMTP is at-least-once: a crash after acceptance can resend, never lose a job.
export async function deliverReferralMail(deadline = Date.now() + 15000) {
  const config = getEmailConfig(), client = getEmailClient({ timeoutMs: 4000 });
  if (!config.enabled || !client) return { sent: 0, deferred: true };
  let sent = 0;
  while (Date.now() < deadline) {
    const token = new Date();
    const rows = await prisma.$queryRaw<Array<{ id: number }>>`
      WITH next AS (SELECT id FROM referral_mail_jobs WHERE
        (status = 'PENDING' AND available_at <= NOW() AT TIME ZONE 'UTC') OR
        (status = 'SENDING' AND locked_at < (NOW() AT TIME ZONE 'UTC') - INTERVAL '5 minutes')
        ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT 1)
      UPDATE referral_mail_jobs j SET status = 'SENDING', locked_at = (${token}::timestamptz AT TIME ZONE 'UTC'), attempts = attempts + 1
      FROM next WHERE j.id = next.id RETURNING j.id`;
    if (!rows.length) break;
    const job = await prisma.referralMailJob.findUniqueOrThrow({ where: { id: rows[0].id }, include: { user: { select: { email: true, status: true } } } });
    const url = `${getPublicAppUrl()}/dashboard?tab=referral`;
    try {
      if (job.user.status !== "ACTIVE") {
        await prisma.referralMailJob.updateMany({ where: { id: job.id, lockedAt: token }, data: { status: "CANCELLED", lockedAt: null } });
        continue;
      }
      const html = `<div style="font-family:Arial,sans-serif;max-width:540px;margin:auto;padding:32px"><h2>${escape(job.subject)}</h2><p>${escape(job.body)}</p><a href="${escape(url)}">Open your referral centre</a><p>HYMN Music</p></div>`;
      const result = await client.emails.send({ from: config.from, to: job.user.email, subject: job.subject, html, text: `${job.body}\n${url}`, ...(config.replyTo ? { replyTo: config.replyTo } : {}) });
      if (result.error) throw new Error("Email delivery failed.");
      await prisma.$transaction(async tx => {
        const updated = await tx.referralMailJob.updateMany({ where: { id: job.id, lockedAt: token, status: "SENDING" }, data: { status: "SENT", sentAt: new Date(), lockedAt: null } });
        if (updated.count) await tx.emailLog.upsert({ where: { eventKey: job.eventKey }, update: { status: "sent", sentAt: new Date(), providerMessageId: result.data?.id }, create: { userId: job.userId, toEmail: job.user.email, subject: job.subject, template: "referral_accepted", eventKey: job.eventKey, entityType: "referral_mail", entityId: String(job.id), status: "sent", sentAt: new Date(), provider: "smtp", providerMessageId: result.data?.id || randomUUID(), payload: { html, text: `${job.body}\n${url}` } } });
      });
      sent++;
    } catch {
      await prisma.referralMailJob.updateMany({ where: { id: job.id, lockedAt: token }, data: { status: "PENDING", lockedAt: null, availableAt: new Date(Date.now() + Math.min(86400, 60 * 2 ** Math.min(job.attempts, 10)) * 1000) } });
    }
  }
  return { sent, deferred: false };
}
