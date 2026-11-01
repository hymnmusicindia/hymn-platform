import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { isSameAppOrigin } from '@/lib/request-origin';
import { consumeRateLimit } from '@/lib/rate-limit';
import { teamIdentity } from '@/lib/team/access';
import { acceptTeamInvitation } from '@/lib/team/invitations';
import { TeamError } from '@/lib/team/policy';
import { teamDatabaseErrorCode } from '@/lib/team/read-recovery';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

export async function POST(request: Request) {
  try {
    if (!isSameAppOrigin(request)) throw new TeamError('Same-origin request required.', 403);
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new TeamError('JSON content required.', 415);
    if (Number(request.headers.get('content-length') || 0) > 4096) throw new TeamError('Request too large.', 413);
    const text = await request.text();
    if (text.length > 4096) throw new TeamError('Request too large.', 413);
    let body: { token?: unknown } | null;
    try { body = JSON.parse(text); } catch { throw new TeamError('Invalid JSON.'); }
    const user = await teamIdentity();
    const limit = await consumeRateLimit({ scope: 'team-write', identity: String(user.id), limit: 90, windowSeconds: 60 });
    if (!limit.allowed) throw new TeamError('Too many attempts. Try again shortly.', 429);
    return NextResponse.json(await acceptTeamInvitation(user, typeof body?.token === 'string' ? body.token : ''), { headers });
  } catch (error) {
    if (error instanceof TeamError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    const reference = randomUUID();
    console.error('TEAM_INVITATION_ACCEPT_FAILED', { reference, code: teamDatabaseErrorCode(error) });
    return NextResponse.json({ error: 'We could not confirm your invitation because the team service is unavailable. Your invitation link has been kept. Please try again shortly.', reference }, { status: 503, headers: { ...headers, 'Retry-After': '10' } });
  }
}
