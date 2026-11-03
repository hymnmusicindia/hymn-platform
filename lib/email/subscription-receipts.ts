import 'server-only';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { labelArtistQuote, labelExtrasForAmount } from '@/lib/label-artist-pricing';
import { getEmailClient, getEmailConfig, type EmailAttachment } from './email-client';
import { emailLayout, emailText } from './email-templates';

export const SUBSCRIPTION_RECEIPT_TEMPLATE = 'subscription_receipt';
const snapshotSchema = z.object({
  version: z.literal(1), paymentId: z.number().int().positive(), userId: z.number().int().positive(), subscriptionId: z.number().int().positive(),
  receipt: z.string(), email: z.string().email(), plan: z.string(), date: z.string(), period: z.string(),
  gatewayPayment: z.string(), gatewayPaid: z.number().int().positive(), offlinePaid: z.number().int().nonnegative(),
  offlineReference: z.string(), artists: z.number().int().nonnegative(), freeArtists: z.number().int().nonnegative(),
  lines: z.array(z.object({ description: z.string(), amount: z.number().int() })).min(1).max(20),
  total: z.number().int().positive(), renewalNote: z.string(),
  pdfBase64: z.string().max(1500000), sha256: z.string().regex(/^[a-f0-9]{64}$/), claimedAt: z.string().optional(), nextAttemptAt: z.string().optional()
});
export type ReceiptSnapshot = z.infer<typeof snapshotSchema>;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const money = (minor: number) => `INR ${(minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value: Date) => value.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
const ascii = (value: string) => value.normalize('NFKD').replace(/[^\x20-\x7e]/g, '').slice(0, 110);

export async function renderSubscriptionReceipt(s: Omit<ReceiptSnapshot, 'pdfBase64' | 'sha256'>) {
  if (s.lines.reduce((sum, line) => sum + line.amount, 0) !== s.total || s.gatewayPaid + s.offlinePaid !== s.total) throw Error('Receipt amounts do not reconcile.');
  const doc = await PDFDocument.create();
  doc.setTitle(`${s.receipt} | HYMN payment receipt`); doc.setAuthor('HYMN Music');
  const regular = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(await readFile(join(process.cwd(), 'public', 'assets', 'hymnlogowhite.png')));
  const page = doc.addPage([595, 842]);
  const ink = rgb(.08, .11, .14), muted = rgb(.35, .40, .44), gold = rgb(.71, .55, .29), rule = rgb(.86, .88, .90);
  const text = (value: string, x: number, y: number, size = 10, strong = false, color = ink) => page.drawText(ascii(value), { x, y, size, font: strong ? bold : regular, color });
  page.drawRectangle({ x: 0, y: 690, width: 595, height: 152, color: ink });
  page.drawImage(logo, { x: 42, y: 766, width: 125, height: 125 * logo.height / logo.width });
  text('YOUR MUSIC. YOUR NEXT CHAPTER.', 42, 749, 8, false, rgb(.76, .80, .83));
  page.drawText('HYMN', { x: 105, y: 264, size: 105, font: bold, color: ink, opacity: .035, rotate: degrees(33) });
  text('PAYMENT RECEIPT', 42, 724, 23, true, rgb(1, 1, 1));
  text(s.receipt, 42, 665, 10, true); text(`Issued ${date(new Date())}`, 375, 665, 9, false, muted);
  text('BILLED TO', 42, 625, 8, true, muted); text(s.email, 42, 606, 11, true);
  text(`Payment date: ${s.date}`, 42, 585, 9, false, muted);
  text(s.plan, 42, 546, 17, true); text(s.period, 42, 525, 10, false, muted);
  page.drawRectangle({ x: 42, y: 477, width: 511, height: 30, color: rgb(.95, .96, .97) });
  text('DESCRIPTION', 54, 488, 8, true, muted); text('AMOUNT', 455, 488, 8, true, muted);
  let y = 456;
  for (const line of s.lines) { text(line.description, 54, y, 9); const amount = money(line.amount); text(amount, 541 - regular.widthOfTextAtSize(amount, 9), y, 9); y -= 29; }
  page.drawLine({ start: { x: 42, y: y + 9 }, end: { x: 553, y: y + 9 }, thickness: 1, color: rule });
  text('TOTAL PAID', 54, y - 20, 11, true); text(money(s.total), 408, y - 20, 17, true, gold);
  y -= 61;
  text(`${s.artists} artist profiles in total | ${s.freeArtists} complimentary`, 54, y, 10, true);
  text(`Gateway payment: ${s.gatewayPayment} | ${money(s.gatewayPaid)}`, 54, y - 24, 8, false, muted);
  if (s.offlinePaid) text(`Offline payment: ${s.offlineReference} | ${money(s.offlinePaid)}`, 54, y - 42, 8, false, muted);
  text(s.renewalNote, 54, y - 68, 8, false, muted);
  page.drawLine({ start: { x: 42, y: 112 }, end: { x: 553, y: 112 }, thickness: 1, color: rule });
  text('Thank you for growing with HYMN.', 42, 87, 11, true);
  text('Payment acknowledgement. This document is not a GST tax invoice.', 42, 68, 8, false, muted);
  text('hymnmusic.fun | Questions? Reply to your receipt email.', 42, 51, 8, false, muted);
  return Buffer.from(await doc.save());
}

export async function receiptAttachment(value: unknown): Promise<EmailAttachment> {
  const s = snapshotSchema.parse(value), content = Buffer.from(s.pdfBase64, 'base64');
  if (content.toString('base64') !== s.pdfBase64 || content.subarray(0, 5).toString() !== '%PDF-' || createHash('sha256').update(content).digest('hex') !== s.sha256 || s.lines.reduce((n, l) => n + l.amount, 0) !== s.total || s.gatewayPaid + s.offlinePaid !== s.total) throw Error('Receipt document failed integrity checks.');
  return { filename: `${s.receipt}.pdf`, content, contentType: 'application/pdf' };
}

/** Called only for persisted captured payments. Unique payment key survives retries/webhooks. */
export async function queueSubscriptionReceipt(paymentId: number, db = prisma) {
  const payment = await db.subscriptionPayment.findUniqueOrThrow({ where: { id: paymentId }, include: { subscription: { include: { user: true, planVersion: true } } } });
  if (payment.status !== 'captured' || payment.amount <= 0 || payment.currency !== 'INR') return null;
  const key = `subscription-receipt:${payment.razorpayPaymentId}`;
  const existing = await db.emailLog.findUnique({ where: { eventKey: key } });
  if (existing) return existing;
  const sub = payment.subscription;
  // Never use today's changed plan to explain a historical payment.
  if (sub.plan !== payment.planSnapshot || !sub.planVersion || payment.amount !== sub.planVersion.amount) throw Error('Payment pricing needs receipt review.');
  const extra = payment.planSnapshot === 'yearly_plus' ? labelExtrasForAmount(payment.amount) : 0;
  const lines = [{ description: sub.planName || sub.plan, amount: payment.amount }];
  if (payment.planSnapshot === 'yearly_plus') {
    const quote = labelArtistQuote(extra);
    lines.splice(0, 1, { description: 'Yearly+ / Label - 15 included artist profiles', amount: 199900 });
    if (extra) lines.push({ description: `${extra} extra artist profile(s) - INR 250 each / year`, amount: quote.subtotal });
    if (quote.discount) lines.push({ description: 'Extra artist volume saving (5%)', amount: -quote.discount });
  }
  const grants = payment.planSnapshot === 'yearly_plus' ? await db.auditLog.findMany({ where: { entity: 'subscription_artist_grant', entityId: String(sub.id), action: 'ARTIST_SLOTS_GRANTED' }, orderBy: { id: 'asc' } }) : [];
  let freeArtists = 0, offlinePaid = 0, offlineSlots = 0; const references: string[] = [];
  for (const grant of grants) {
    const g = grant.metadata as { slots?: number; paidMinor?: number; receiptPaymentId?: number; reference?: string; validUntil?: string } | null;
    if (!g || !Number.isSafeInteger(g.slots) || g.slots! < 1 || g.slots! > 500) continue;
    if (g.validUntil && Date.parse(g.validUntil) <= payment.createdAt.getTime()) continue;
    if (g.paidMinor) {
      if (g.receiptPaymentId !== payment.id || !Number.isSafeInteger(g.paidMinor) || g.paidMinor <= 0 || !g.reference) continue;
      offlinePaid += g.paidMinor; offlineSlots += g.slots!; references.push(g.reference);
    } else freeArtists += g.slots!;
  }
  if (offlinePaid) lines.push({ description: `${offlineSlots} extra artist profile(s) - offline payment`, amount: offlinePaid });
  if (freeArtists) lines.push({ description: `${freeArtists} complimentary artist profiles - exclusive grant`, amount: 0 });
  const baseArtists = payment.planSnapshot === 'yearly_plus' ? 15 : payment.planSnapshot === 'yearly' ? 7 : 5;
  const snapshot = {
    version: 1 as const, paymentId, subscriptionId: sub.id, userId: sub.userId, email: sub.user.email, plan: sub.planName || sub.plan,
    receipt: `HYMN-SUB-${payment.id.toString().padStart(6, '0')}`, date: date(payment.createdAt),
    period: payment.billingPeriodStart && payment.billingPeriodEnd ? `${date(payment.billingPeriodStart)} to ${date(payment.billingPeriodEnd)}` : 'See your HYMN subscription for the billing period.',
    gatewayPayment: payment.razorpayPaymentId, gatewayPaid: payment.amount, offlinePaid, offlineReference: references.join(', '),
    artists: baseArtists + extra + offlineSlots + freeArtists, freeArtists, lines, total: payment.amount + offlinePaid,
    renewalNote: offlinePaid ? 'Offline extra slots renew separately at INR 250 per slot / year; authorisation required.' : 'Subscription and paid extra artist slots renew together unless cancelled.'
  };
  const pdf = await renderSubscriptionReceipt(snapshot);
  const payload = snapshotSchema.parse({ ...snapshot, pdfBase64: pdf.toString('base64'), sha256: createHash('sha256').update(pdf).digest('hex') });
  return db.emailLog.upsert({ where: { eventKey: key }, update: {}, create: { userId: sub.userId, toEmail: sub.user.email, subject: `Your HYMN payment receipt | ${snapshot.receipt}`, template: SUBSCRIPTION_RECEIPT_TEMPLATE, eventKey: key, entityType: 'subscription_payment', entityId: String(payment.id), status: 'pending', payload: json(payload) } });
}

type Delivery = (input: { from: string; to: string; subject: string; html: string; text: string; replyTo?: string; attachments: EmailAttachment[] }) => Promise<{ data: { id?: string } | null; error: { message: string } | null }>;
export async function deliverSubscriptionReceipts(logId?: number, deliver?: Delivery, db = prisma, now = new Date()) {
  const config = getEmailConfig();
  if (!config.enabled && !deliver) return { sent: 0, failed: 0, enabled: false };
  const scope = { template: SUBSCRIPTION_RECEIPT_TEMPLATE };
  // An interrupted/ambiguous SMTP send needs review, never a blind duplicate receipt.
  await db.emailLog.updateMany({ where: { ...scope, status: 'sending', payload: { path: ['claimedAt'], lt: new Date(now.getTime() - 600000).toISOString() } }, data: { status: 'review', errorMessage: 'Interrupted receipt delivery; verify SMTP outcome before retrying.' } });
  const jobs = await db.emailLog.findMany({ where: { ...scope, status: 'pending', ...(logId ? { id: logId } : {}) }, orderBy: { id: 'asc' }, take: 4 });
  let sent = 0, failed = 0;
  const deadline = Date.now() + 15000;
  for (const job of jobs) {
    if (Date.now() + 10000 > deadline) break;
    const parsed = snapshotSchema.safeParse(job.payload);
    if (!parsed.success) { await db.emailLog.updateMany({ where: { id: job.id, status: 'pending' }, data: { status: 'review', errorMessage: 'Invalid receipt payload; review required.' } }); failed++; continue; }
    const s = parsed.data;
    if (s.nextAttemptAt && Date.parse(s.nextAttemptAt) > now.getTime()) continue;
    const claimed = await db.emailLog.updateMany({ where: { id: job.id, status: 'pending' }, data: { status: 'sending', payload: json({ ...s, claimedAt: now.toISOString() }) } });
    if (!claimed.count) continue;
    try {
      const payment = await db.subscriptionPayment.findUnique({ where: { id: s.paymentId }, include: { subscription: { include: { user: true } } } });
      if (!payment || payment.status !== 'captured' || payment.amount !== s.gatewayPaid || payment.currency !== 'INR' || payment.razorpayPaymentId !== s.gatewayPayment || payment.subscription.userId !== job.userId || payment.subscription.user.email.toLowerCase() !== job.toEmail.toLowerCase() || s.email.toLowerCase() !== job.toEmail.toLowerCase()) throw Error('Receipt payment or recipient changed.');
      await receiptAttachment(s);
    } catch {
      await db.emailLog.update({ where: { id: job.id }, data: { status: 'review', errorMessage: 'Receipt recipient, payment or PDF needs review.' } }); failed++; continue;
    }
    const input = { title: 'Your HYMN receipt', body: `Payment received: ${money(s.total)}. Your detailed PDF receipt is attached. ${s.artists} artist profiles are included, with ${s.freeArtists} complimentary.`, ctaLabel: 'Open your subscription', ctaUrl: `${config.appUrl}/dashboard?tab=subscription`, sections: [{ title: 'Payment record', body: `Gateway: ${money(s.gatewayPaid)}${s.offlinePaid ? `. Offline, confirmed by HYMN: ${money(s.offlinePaid)}.` : '.'}` }, { title: 'Renewal', body: s.renewalNote }] };
    try {
      const result = await (deliver ?? getEmailClient({ timeoutMs: 10000 })!.emails.send)({ from: config.from, to: job.toEmail, subject: job.subject, html: emailLayout(input), text: emailText(input), replyTo: config.replyTo, attachments: [await receiptAttachment(s)] });
      if (result.error || !result.data?.id) throw Error('SMTP acceptance not confirmed.');
      await db.emailLog.update({ where: { id: job.id }, data: { status: 'sent', sentAt: new Date(), providerMessageId: result.data.id, errorMessage: null } }); sent++;
    } catch (error) {
      failed++;
      const e = error as { code?: string; command?: string };
      const safe = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(e.code || '') || e.code === 'ETIMEDOUT' && e.command === 'CONN';
      const retryCount = job.retryCount + 1;
      await db.emailLog.update({ where: { id: job.id }, data: { status: safe && retryCount <= 5 ? 'pending' : 'review', retryCount, errorMessage: safe ? 'SMTP connection unavailable; retry scheduled.' : 'Receipt delivery uncertain; verify before resending.', payload: json({ ...s, nextAttemptAt: new Date(now.getTime() + Math.min(3600, 60 * 2 ** retryCount) * 1000).toISOString() }) } });
    }
  }
  return { sent, failed, enabled: true };
}

/** Repair recent missed enqueue events; never bulk-email historical customers. */
export async function repairSubscriptionReceipts(db = prisma) {
  // Exclude already-queued payments in SQL so a busy day cannot starve older misses.
  const rows = await db.$queryRaw<Array<{ id: number }>>`SELECT p.id FROM subscription_payments p WHERE p.status = 'captured' AND p.currency = 'INR' AND p.created_at >= ${new Date(Date.now() - 7 * 86400000)} AND NOT EXISTS (SELECT 1 FROM email_logs e WHERE e.event_key = 'subscription-receipt:' || p.razorpay_payment_id) ORDER BY p.id ASC LIMIT 40`;
  let queued = 0, review = 0;
  for (const row of rows) {
    try { if (await queueSubscriptionReceipt(row.id, db)) queued++; }
    catch {
      review++;
      const payment = await db.subscriptionPayment.findUnique({ where: { id: row.id }, include: { subscription: { include: { user: true } } } });
      if (payment) await db.emailLog.upsert({ where: { eventKey: `subscription-receipt:${payment.razorpayPaymentId}` }, update: {}, create: { userId: payment.subscription.userId, toEmail: payment.subscription.user.email, subject: 'HYMN receipt requires payment review', template: SUBSCRIPTION_RECEIPT_TEMPLATE, eventKey: `subscription-receipt:${payment.razorpayPaymentId}`, entityType: 'subscription_payment', entityId: String(payment.id), status: 'review', errorMessage: 'Receipt pricing or snapshot needs review before email delivery.' } });
    }
  }
  return { queued, review, errorCount: review };
}
