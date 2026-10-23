import { after } from 'next/server';
import { ZodError } from 'zod';
import { teamActor } from '@/lib/team/access';
import { TeamError } from '@/lib/team/policy';
import { readCreatorApplications, decideCreatorApplication } from '@/lib/team/creator-applications';
import { isSameAppOrigin } from '@/lib/request-origin';
import { apiRequestId } from '@/lib/api-response';
import { emailLayout, emailText } from '@/lib/email/email-templates';
import { sendTransactionalEmail } from '@/lib/email/send-transactional-email';
import { getPublicAppUrl } from '@/lib/public-app-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
function failure(e: unknown) { return Response.json({ error: e instanceof ZodError ? e.issues.map(i => i.message).join(' ') : e instanceof Error ? e.message : 'Application review failed.' }, { status: e instanceof TeamError ? e.status : e instanceof ZodError ? 400 : 409, headers }); }
export async function GET(request: Request) {
  try { return Response.json(await readCreatorApplications(await teamActor(new URL(request.url).searchParams.get('workspace') || undefined)), { headers }); } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  if (!isSameAppOrigin(request)) return Response.json({ error: 'Same-origin request required.' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 12000) return Response.json({ error: 'Request too large.' }, { status: 413 });
  try {
    const raw = await request.text(); if (raw.length > 12000) return Response.json({ error: 'Request too large.' }, { status: 413 });
    const result = await decideCreatorApplication(await teamActor(new URL(request.url).searchParams.get('workspace') || undefined), JSON.parse(raw), apiRequestId(request));
    after(async () => { const e = result.email; const message = { title: e.title, greeting: `Hi ${e.name},`, body: e.body, ctaLabel: 'Open HYMN', ctaUrl: `${getPublicAppUrl()}${e.href}` }; await sendTransactionalEmail({ to: e.to, userId: e.userId, subject: e.title, template: 'creator_application_review', eventKey: e.eventKey, html: emailLayout(message), text: emailText(message) }); });
    return Response.json({ status: result.status, profileId: result.profileId, message: `Application ${result.status.toLowerCase()}. The applicant will receive the review notes.` }, { headers });
  } catch (e) { return failure(e); }
}
