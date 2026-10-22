import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { enqueueAmendmentUpdate, amendmentTransactionOptions } from '@/lib/release-amendment-notifications';

export async function POST(request: Request, context: { params: Promise<{ id: string; requestId: string }> }) {
  const auth = await requireUser(); if ('error' in auth) return auth.error;
  try {
    const { note } = z.object({ note: z.string().trim().min(10).max(2000) }).parse(await request.json());
    const params = await context.params;
    const releaseId = Number(params.id), requestId = Number(params.requestId);
    if (!Number.isSafeInteger(releaseId) || !Number.isSafeInteger(requestId)) throw Error('Choose a valid request.');
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422028, ${releaseId}::integer)`;
      const current = await tx.releaseChangeRequest.findFirstOrThrow({ where: { id: requestId, releaseId, requestedByUserId: auth.user.id, release: { userId: auth.user.id, archivedAt: null } } });
      if (current.status !== 'information_required') {
        const replay = await tx.releaseChangeRequestEvent.findFirst({ where: { requestId, actorType: 'user', actorId: auth.user.id, note, previousStatus: 'information_required', newStatus: 'submitted' } });
        if (current.status === 'submitted' && replay) return current;
        throw Error('This request is not waiting for additional information.');
      }
      const updated = await tx.releaseChangeRequest.update({ where: { id: requestId }, data: { status: 'submitted', adminNote: null, reviewedAt: null, reviewedByAdminId: null } });
      const event = await tx.releaseChangeRequestEvent.create({ data: { requestId, actorType: 'user', actorId: auth.user.id, previousStatus: 'information_required', newStatus: 'submitted', note } });
      await enqueueAmendmentUpdate(tx, requestId, event.id);
      return updated;
    }, amendmentTransactionOptions);
    return NextResponse.json({ request: result });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Response could not be saved.' }, { status: 409 }); }
}
