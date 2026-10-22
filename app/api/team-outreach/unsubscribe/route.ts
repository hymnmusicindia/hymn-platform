import jwt from 'jsonwebtoken';
import { getUserSessionSecret } from '@/lib/env';
import { prisma } from '@/lib/prisma';
export const runtime = 'nodejs';
const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
function recipient(token: string) {
  const data = jwt.verify(token, getUserSessionSecret());
  if (typeof data === 'string' || data.purpose !== 'team_outreach_unsubscribe' || typeof data.email !== 'string' || data.email.length > 320) throw new Error('Invalid token');
  return data.email.toLowerCase();
}
const page = (body: string) => `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>HYMN email preferences</title></head><body style="background:#11161c;color:#f4f6fa;font:16px Arial;padding:32px;line-height:1.7"><main style="max-width:580px;margin:auto"><h1>HYMN email preferences</h1>${body}</main></body></html>`;
export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get('token') || ''; recipient(token);
    return new Response(page(`<p>Stop individual outreach emails from HYMN team members? Your account and purchase updates are unchanged.</p><form method="post"><input type="hidden" name="token" value="${token.replace(/[^a-zA-Z0-9_.-]/g, '')}"><button type="submit" style="padding:12px 18px;cursor:pointer">Stop team outreach emails</button></form>`), { headers });
  } catch { return new Response(page('<p>This link is invalid or expired. Reply to your HYMN contact for help.</p>'), { status: 400, headers }); }
}
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get('content-length') || 0) > 10000) return new Response('Request too large', { status: 413 });
    const email = recipient(String((await request.formData()).get('token') || ''));
    await prisma.teamOutreachSuppression.upsert({ where: { email }, create: { email }, update: {} });
    await prisma.teamOutreachEmail.updateMany({ where: { recipient: email, status: 'QUEUED' }, data: { status: 'CANCELLED', error: 'Recipient opted out.' } });
    return new Response(page('<p>You will no longer receive individual HYMN team outreach emails. Account and purchase updates are unchanged.</p>'), { headers });
  } catch { return new Response(page('<p>We could not update your preferences. Please try again or reply to HYMN.</p>'), { status: 400, headers }); }
}
