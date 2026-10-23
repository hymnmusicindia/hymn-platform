import { teamActor } from '@/lib/team/access';
import { TeamError } from '@/lib/team/policy';
import { readAssignedReleaseQc, reviewAssignedReleaseQc, deliverApprovedReleaseQc } from '@/lib/team/release-qc';
import { after } from 'next/server';
import { isSameAppOrigin } from '@/lib/request-origin';
import { ZodError } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';
function failure(error: unknown) {
  return Response.json({ error: error instanceof ZodError ? error.issues.map(i => i.message).join(' ') : error instanceof Error ? error.message : 'QC request failed.' }, { status: error instanceof TeamError ? error.status : error instanceof ZodError ? 400 : 409, headers: { 'Cache-Control': 'private, no-store' } });
}
export async function GET(request: Request) {
  try { const p = new URL(request.url).searchParams; const actor = await teamActor(p.get('workspace') || undefined); return Response.json(await readAssignedReleaseQc(actor, p.get('task') || undefined), { headers: { 'Cache-Control': 'private, no-store' } }); } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!isSameAppOrigin(request)) return Response.json({ error: 'Same-origin request required.' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 20000) return Response.json({ error: 'QC request too large.' }, { status: 413 });
  try { const p = new URL(request.url).searchParams; const actor = await teamActor(p.get('workspace') || undefined); const raw = await request.text(); if (raw.length > 20000) return Response.json({ error: 'QC request too large.' }, { status: 413 }); const result = await reviewAssignedReleaseQc(actor, JSON.parse(raw)); if (result.status === 'approved') after(() => deliverApprovedReleaseQc(1, result.taskId).then(() => undefined)); return Response.json(result); } catch (error) { return failure(error); }
}
