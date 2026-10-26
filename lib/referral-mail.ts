import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getEmailClient, getEmailConfig } from "@/lib/email/email-client";
import { getPublicAppUrl } from "@/lib/public-app-url";
import {emailLayout,emailText} from '@/lib/email/email-templates';

// Transactional outbox: committed signups survive server exits and SMTP outages.
// Uncertain SMTP acceptance is retained for audited review rather than automatic replay.
export async function deliverReferralMail(deadline = Date.now() + 15000) {
  const config = getEmailConfig(), client = getEmailClient({ timeoutMs: 4000 });
  // SMTP acceptance can outlive a crashed worker. Never blindly replay an uncertain send.
  await prisma.referralMailJob.updateMany({where:{status:'SENDING',lockedAt:{lt:new Date(Date.now()-300000)}},data:{status:'REVIEW',lockedAt:null,lastError:'Interrupted SMTP delivery. Inspect delivery logs before retrying.'}});
  if (!config.enabled || !client) return { sent: 0, deferred: true };

  let sent = 0;
  while (Date.now() < deadline) {
    const token = new Date();
    const rows = await prisma.$queryRaw<Array<{ id: number }>>`
      WITH next AS (SELECT id FROM referral_mail_jobs WHERE
        (status = 'PENDING' AND available_at <= NOW() AT TIME ZONE 'UTC')
        ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT 1)
      UPDATE referral_mail_jobs j SET status = 'SENDING', locked_at = (${token}::timestamptz AT TIME ZONE 'UTC'), attempts = attempts + 1
      FROM next WHERE j.id = next.id RETURNING j.id`;
    if (!rows.length) break;
    const job = await prisma.referralMailJob.findUniqueOrThrow({ where: { id: rows[0].id }, include: { user: { select: { email: true, status: true } } } });
    const url = `${getPublicAppUrl()}/dashboard?tab=referral`;
    let accepted=false;
    try {
      if (job.user.status !== "ACTIVE") {
        await prisma.referralMailJob.updateMany({ where: { id: job.id, lockedAt: token }, data: { status: "CANCELLED", lockedAt: null } });
        continue;
      }
      const template={title:job.subject,body:job.body,ctaLabel:'Manage referral connections',ctaUrl:url,notice:'Opening a link alone does not approve a referral. Review connections and removal dates in your HYMN account.'};
      const html=emailLayout(template),text=emailText(template);
      const result = await client.emails.send({ from: config.from, to: job.user.email, subject: job.subject, html, text, ...(config.replyTo ? { replyTo: config.replyTo } : {}) });
      if (result.error) throw new Error("Email delivery failed.");
      accepted=true;
      await prisma.$transaction(async tx => {
        const updated = await tx.referralMailJob.updateMany({ where: { id: job.id, lockedAt: token, status: "SENDING" }, data: { status: "SENT", sentAt: new Date(), lockedAt: null,lastError:null } });
        if (updated.count) await tx.emailLog.upsert({ where: { eventKey: job.eventKey }, update: { status: "sent", sentAt: new Date(), providerMessageId: result.data?.id }, create: { userId: job.userId, toEmail: job.user.email, subject: job.subject, template: "referral_accepted", eventKey: job.eventKey, entityType: "referral_mail", entityId: String(job.id), status: "sent", sentAt: new Date(), provider: "smtp", providerMessageId: result.data?.id || randomUUID(), payload: { html, text } } });
      });
      sent++;
    } catch(error) {
      const uncertain=accepted||Boolean(error&&typeof error==='object'&&'command' in error&&error.command==='DATA');
      await prisma.referralMailJob.updateMany({ where: { id: job.id, lockedAt: token }, data: { status:uncertain||job.attempts>=8?'REVIEW':'PENDING',lastError:uncertain?'Delivery outcome uncertain. Check SMTP logs before retrying.':job.attempts>=8?'Automatic retries exhausted. Verify sender and recipient before retrying.':'SMTP did not confirm delivery. Automatic retry scheduled.', lockedAt: null, availableAt: new Date(Date.now() + Math.min(86400, 60 * 2 ** Math.min(job.attempts, 10)) * 1000) } });
    }
  }
  return { sent, deferred: false };
}
