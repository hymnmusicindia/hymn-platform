import { after, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { requestEmailCode, verifyEmailCode, EmailSignInError } from '@/lib/email-sign-in';
import { isSameAppOrigin } from '@/lib/request-origin';
import { referralJson } from '@/lib/referral-request';
import { requestIdentity } from '@/lib/rate-limit';
import { createSession } from '@/lib/session';
import { destinationAfterLogin, reportReturnPath } from '@/lib/routes';
import { ensureAccountClientCard } from '@/lib/team/client-cards';
import { getEmailConfig } from '@/lib/email/email-client';
import type { UserRole } from '@/lib/types';
export const runtime = 'nodejs';
export const maxDuration = 30;
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const email = z.string().trim().toLowerCase().email().max(254);
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('request'), email, name: z.string().trim().max(100).optional() }).strict(),
  z.object({ action: z.literal('verify'), email, challenge: z.string().min(1).max(2000), code: z.string().regex(/^\d{6}$/), returnTo: z.string().max(250).optional() }).strict()
]);
export async function GET() { return NextResponse.json({ emailSignIn: 'v1', available: getEmailConfig().enabled }, { headers }); }
export async function POST(request: Request) {
  try {
    if (!isSameAppOrigin(request)) return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403, headers });
    if (!request.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({ error: 'JSON content required.' }, { status: 415, headers });
    const payload = schema.parse(await referralJson(request, 4096)), ipAddress = requestIdentity(request);
    if (payload.action === 'request') {
      if (!getEmailConfig().enabled) return NextResponse.json({ error: 'Email sign-in is temporarily unavailable.' }, { status: 503, headers });
      return NextResponse.json(await requestEmailCode(payload.email, payload.name || '', ipAddress), { status: 202, headers });
    }
    const { user, isNew } = await verifyEmailCode(payload.email, payload.challenge, payload.code, ipAddress);
    const role = user.role.toLowerCase() as UserRole;
    await createSession({ sub: user.id, name: user.name, email: user.email, role, avatarUrl: user.avatar }, { ipAddress, userAgent: request.headers.get('user-agent')?.slice(0, 1000) });
    after(() => ensureAccountClientCard(user.id).then(() => undefined).catch(() => { console.error('EMAIL_AUTH_CLIENT_CARD_SYNC_FAILED'); }));
    return NextResponse.json({ signedIn: true, isNew, redirectPath: reportReturnPath(payload.returnTo) || destinationAfterLogin(role) }, { headers });
  } catch (error) {
    if (error instanceof EmailSignInError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { ...headers, ...(error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {}) } });
    if (error instanceof ZodError) return NextResponse.json({ error: 'Enter a valid email and six-digit code.' }, { status: 400, headers });
    console.error('CUSTOMER_EMAIL_AUTH_UNAVAILABLE');
    return NextResponse.json({ error: 'Sign-in could not finish. Please try again.' }, { status: 503, headers });
  }
}
