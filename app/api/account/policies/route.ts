import { NextResponse } from 'next/server';
import { isSameAppOrigin } from '@/lib/request-origin';
import { requireUser } from '@/lib/access';
import { acceptCurrentPolicies, getPolicyAgreementStatus } from '@/lib/policy-agreement';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
export async function GET() {
  const auth = await requireUser(); if ('error' in auth) return auth.error;
  return NextResponse.json(await getPolicyAgreementStatus(auth.user.id), { headers });
}
export async function POST(request: Request) {
  const auth = await requireUser(); if ('error' in auth) return auth.error;
  if (!isSameAppOrigin(request)) return NextResponse.json({ error: 'This request must come from your HYMN account.' }, { status: 403, headers });
  const body = await request.json().catch(() => null);
  if (body?.accepted !== true || typeof body.revision !== 'string') return NextResponse.json({ error: 'Explicit acceptance of the displayed policy revision is required.' }, { status: 400, headers });
  const result = await acceptCurrentPolicies(auth.user.id, body.revision);
  return NextResponse.json(result.status, { status: result.stale ? 409 : 200, headers });
}
