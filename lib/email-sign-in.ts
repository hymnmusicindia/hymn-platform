import 'server-only';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';
import { getUserSessionSecret } from '@/lib/env';
import { consumeRateLimit } from '@/lib/rate-limit';
import { assertNotMergedIdentity } from '@/lib/merged-account-identity';
import { createUniqueReferralCode } from '@/lib/referrals';
import { getEmailClient, getEmailConfig } from '@/lib/email/email-client';
import { emailLayout, emailText } from '@/lib/email/email-templates';

const PURPOSE = 'hymn-customer-email-v1', TTL = 600;
export class EmailSignInError extends Error {
  constructor(message: string, readonly status = 400, readonly retryAfter = 0) { super(message); }
}
const mac = (value: string) => createHmac('sha256', getUserSessionSecret()).update(`${PURPOSE}:${value}`).digest('hex');
const equal = (a: unknown, b: string) => typeof a === 'string' && /^[a-f0-9]{64}$/.test(a) && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
async function limit(scope: string, identity: string, count: number, seconds: number) {
  const result = await consumeRateLimit({ scope: `email-auth-${scope}`, identity, limit: count, windowSeconds: seconds });
  if (!result.allowed) throw new EmailSignInError('Too many attempts. Please wait before trying again.', 429, result.retryAfterSeconds);
}
async function deliver(email: string, code: string) {
  const config = getEmailConfig(), client = getEmailClient({ timeoutMs: 15000 });
  if (!config.enabled || !client) throw new EmailSignInError('Email sign-in is temporarily unavailable.', 503);
  const template = { title: 'Your HYMN sign-in code', body: `Your verification code is ${code}.\n\nUse it to sign in or create your HYMN account. It expires in 10 minutes and works once.`, ctaLabel: '', ctaUrl: '', notice: 'Never share this code. If you did not request it, ignore this email.' };
  const result = await client.emails.send({ from: config.from, to: email, subject: template.title, html: emailLayout(template), text: emailText(template), ...(config.replyTo ? { replyTo: config.replyTo } : {}) });
  if (result.error) throw new EmailSignInError('We could not send your code. Please try again shortly.', 503);
}
export async function requestEmailCode(email: string, name: string, ip: string, send = deliver) {
  email = email.trim().toLowerCase(); name = name.trim().slice(0, 100);
  await limit('request-ip', ip, 12, 900); await limit('request-email', email, 4, 900); await limit('resend', email, 1, 60);
  const id = randomUUID(), code = String(randomInt(0, 1000000)).padStart(6, '0');
  const scope = `${PURPOSE}:${mac(`email:${email}`)}`;
  const challenge = jwt.sign({ purpose: PURPOSE, e: mac(`email:${email}`), c: mac(`code:${id}:${email}:${code}`), n: name }, getUserSessionSecret(), { algorithm: 'HS256', jwtid: id, expiresIn: TTL, audience: PURPOSE, issuer: 'hymn-music' });
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))::text`;
    await tx.securityRateLimit.updateMany({ where: { scope }, data: { expiresAt: new Date() } });
    await tx.securityRateLimit.create({ data: { keyHash: mac(`challenge:${id}`), scope, count: 0, windowStart: new Date(), expiresAt: new Date(Date.now() + TTL * 1000) } });
  });
  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { status: true, role: true } });
  let eligible = !existing || existing.status === 'ACTIVE' && existing.role !== 'ADMIN';
  try { await assertNotMergedIdentity({ email }); } catch { eligible = false; }
  if (eligible) await send(email, code);
  return { challenge, expiresIn: TTL, resendAfter: 60, message: 'Check your inbox and spam folder for your HYMN code. Use the most recent code.' };
}
export async function verifyEmailCode(email: string, challenge: string, code: string, ip: string) {
  email = email.trim().toLowerCase();
  await limit('verify-ip', ip, 30, 900);
  const invalid = () => new EmailSignInError('This code is incorrect, expired or already used. Request a new code.', 401);
  let claims: jwt.JwtPayload;
  try {
    const payload = jwt.verify(challenge, getUserSessionSecret(), { algorithms: ['HS256'], audience: PURPOSE, issuer: 'hymn-music', maxAge: TTL });
    if (typeof payload === 'string' || payload.purpose !== PURPOSE || typeof payload.jti !== 'string' || !equal(payload.e, mac(`email:${email}`))) throw invalid();
    claims = payload;
  } catch { throw invalid(); }
  await limit('code-attempt', claims.jti!, 5, TTL + 60);
  if (!equal(claims.c, mac(`code:${claims.jti}:${email}:${code}`))) throw invalid();
  return prisma.$transaction(async tx => {
    const keyHash = mac(`challenge:${claims.jti}`);
    await tx.$queryRaw`SELECT key_hash FROM security_rate_limits WHERE key_hash = ${keyHash} FOR UPDATE`;
    const row = await tx.securityRateLimit.findUnique({ where: { keyHash } });
    if (!row || row.count !== 0 || row.expiresAt <= new Date()) throw invalid();
    await assertNotMergedIdentity({ email }, tx, true);
    let user = await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (user && (user.status !== 'ACTIVE' || user.role === 'ADMIN')) throw invalid();
    const isNew = !user;
    if (!user) {
      const name = typeof claims.n === 'string' && claims.n.trim() ? claims.n.trim().slice(0, 100) : email.split('@')[0].slice(0, 100);
      user = await tx.user.create({ data: { email, name, googleId: `email-${randomUUID()}`, role: 'CUSTOMER', referralCode: await createUniqueReferralCode(tx, name) } });
    }
    await tx.auditLog.create({ data: { actorId: user.id, action: isNew ? 'USER_CREATED_WITH_EMAIL' : 'LOGIN', entity: 'users', entityId: String(user.id), metadata: { authenticationProvider: 'email_otp' } } });
    await tx.securityRateLimit.update({ where: { keyHash }, data: { count: 1 } });
    return { user, isNew };
  }, { timeout: 20000 });
}
