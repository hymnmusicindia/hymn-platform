import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { attachHubArtist, ArtistHubError, enrollHubArtist, findHubIdentity, hubOverview, openHubCase, publicHubCard, respondHubParticipation, syncHubParticipation } from '@/lib/artist-hub';
import { findSplitArtist } from '@/lib/user-handles';
import { endorseHubArtist, resolveHubTransfer, proposeHubSplit } from '@/lib/artist-hub-agreements';
import { consumeRateLimit } from '@/lib/rate-limit';

const id = z.number().int().positive();
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('enroll'), cardId: id }).strict(),
  z.object({ action: z.literal('attach'), identityId: id }).strict(),
  z.object({ action: z.literal('lookup'), query: z.string().trim().min(3).max(300) }).strict(),
  z.object({ action: z.literal('respond'), id, revision: z.string().regex(/^[a-f0-9]{64}$/), decision: z.enum(['accepted', 'rejected']), reason: z.string().max(1000).default('') }).strict(),
  z.object({ action: z.literal('sync'), releaseId: id }).strict(),
  z.object({ action: z.literal('case'), identityId: id, kind: z.enum(['ownership', 'transfer']), reason: z.string().trim().min(10).max(2000) }).strict(),
  z.object({ action: z.literal('transfer'), caseId: id, approve: z.boolean() }).strict(),
  z.object({ action: z.literal('endorse'), identityId: id, releaseId: id, active: z.boolean() }).strict(),
  z.object({ action: z.literal('propose'), releaseId: id, period: z.string().regex(/^\d{4}-\d{2}$/), shares: z.array(z.object({ userId: id, basisPoints: z.number().int().min(0).max(10000) }).strict()).min(1).max(100) }).strict(),
]);
export const runtime = 'nodejs';
const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET() {
  const auth = await requireUser(); if ('error' in auth) return auth.error;
  try { return reply(await hubOverview(auth.user.id)); }
  catch { return reply({ error: 'Artist profiles could not be loaded. Please retry.' }, 503); }
}
export async function POST(request: Request) {
  const auth = await requireUser(); if ('error' in auth) return auth.error;
  const limit = await consumeRateLimit({ scope: 'artist-hub-action', identity: String(auth.user.id), limit: 120, windowSeconds: 3600 });
  if (!limit.allowed) return reply({ error: 'Too many artist actions. Please try again later.' }, 429);
  try {
    const input = schema.parse(await request.json()), userId = auth.user.id;
    if (input.action === 'enroll') return reply({ identity: await enrollHubArtist(userId, input.cardId) });
    if (input.action === 'attach') {
      const cardId = await attachHubArtist(userId, input.identityId);
      const { listArtistProfilesByUser } = await import('@/lib/db');
      return reply({ profile: (await listArtistProfilesByUser(userId)).find(card => card.id === cardId) });
    }
    if (input.action === 'lookup') {
      let identities;
      if (input.query.startsWith('@')) {
        const artist = await findSplitArtist(input.query);
        identities = artist ? await prisma.artistHubIdentity.findMany({ where: { ownerUserId: artist.id }, take: 20 }) : [];
      } else {
        const match = await findHubIdentity({ spotifyUrl: input.query, appleUrl: input.query });
        identities = match ? [match] : [];
      }
      return reply({ matches: identities.map(publicHubCard) });
    }
    if (input.action === 'respond') return reply({ participation: await respondHubParticipation(userId, input.id, input.revision, input.decision, input.reason) });
    if (input.action === 'sync') return reply({ participations: await syncHubParticipation(userId, input.releaseId) });
    if (input.action === 'case') return reply({ case: await openHubCase(userId, input.identityId, input.kind, input.reason) });
    if (input.action === 'transfer') return reply(await resolveHubTransfer(userId, input.caseId, input.approve));
    if (input.action === 'endorse') return reply(await endorseHubArtist(userId, input.identityId, input.releaseId, input.active));
    if (input.action === 'propose') return reply(await proposeHubSplit(userId, input));
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return reply({ error: 'Check the selected action and entered details.' }, 400);
    if (error instanceof ArtistHubError) return reply({ error: error.message }, error.status);
    return reply({ error: 'The action could not be completed. Refresh and try again.' }, 409);
  }
}
