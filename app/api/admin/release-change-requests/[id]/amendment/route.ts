import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminPermission, requireRecentAdminPermission } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { getDetailedReleaseById } from '@/lib/distribution-db';
import { buildDireNotePayloadForRelease } from '@/lib/distribution-service';
import { loadArtistAmendment, artistAmendmentPayload, executeArtistAmendment, artistAmendmentRevision } from '@/lib/release-artist-amendment';
import { redactDireNotePayload, validateDireNotePayload } from '@/lib/direnote';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission('updates.review'); if ('error' in admin) return admin.error;
  const body = z.object({ action: z.enum(['preview', 'submit']), previewRevision: z.string().length(64).optional() }).safeParse(await request.json().catch(() => null));
  const id = Number((await context.params).id);
  if (!body.success || !Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'Choose an amendment and action.' }, { status: 400 });
  if (body.data.action === 'submit') { const delivery = await requireRecentAdminPermission('distribution.submit'); if ('error' in delivery) return delivery.error; }
  try {
    const change = await prisma.releaseChangeRequest.findUniqueOrThrow({ where: { id } });
    const release = await getDetailedReleaseById(change.releaseId); if (!release) return NextResponse.json({ error: 'Release not found.' }, { status: 404 });
    const amendment = await loadArtistAmendment(release, id);
    if (body.data.action === 'submit' && amendment.request.status === 'submitted_to_partner') return NextResponse.json({ submitted: true, replayed: true, request: amendment.request });
    const revision = artistAmendmentRevision(amendment, release);
    if (body.data.action === 'preview') {
      const payload = artistAmendmentPayload(await buildDireNotePayloadForRelease(amendment.projectedRelease), amendment, (release.originalReleaseDate || release.releaseDate).slice(0, 10));
      const validation = validateDireNotePayload(payload, { replaceProviderIdentifiers: true });
      return NextResponse.json({ revision, payload: redactDireNotePayload(payload), issues: validation.issues, warnings: validation.warnings, locked: { upc: release.upcCode, tracks: release.tracks?.map(track => ({ title: track.trackTitle, isrc: track.isrc })) } });
    }
    if (body.data.previewRevision !== revision) return NextResponse.json({ error: 'The amendment or release changed. Preview and review the current version before sending.' }, { status: 409 });
    const result = await executeArtistAmendment(id, 'sub' in admin ? Number(admin.sub) || null : null);
    return NextResponse.json({ ...result, request: await prisma.releaseChangeRequest.findUnique({ where: { id } }) }, { status: result.submitted ? 200 : 409 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Amendment could not be processed.' }, { status: 409 }); }
}
