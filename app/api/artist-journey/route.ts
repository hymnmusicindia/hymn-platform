import { z, ZodError } from 'zod';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { isSameAppOrigin } from '@/lib/request-origin';
import { consumeRateLimit } from '@/lib/rate-limit';
import { journeyJson, journeySources, readJourneyProfile, recordArtistSignal, requestArtistHelp, saveJourneyProfile } from '@/lib/artist-journey';
import { object } from '@/lib/artist-journey-policy';
import { TeamError } from '@/lib/team/policy';
import { internalUserWhere } from '@/lib/team/internal-identity';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };
async function identity() { const session = await getSession(); if (!session)
    throw new TeamError('Sign in to continue.', 401); const user = await prisma.user.findFirst({ where: { id: session.sub, status: 'ACTIVE', role: { in: ['CUSTOMER', 'PRODUCER'] }, NOT: internalUserWhere }, select: { id: true, name: true } }); if (!user)
    throw new TeamError('Artist account required.', 403); return user; }
function failure(error: unknown) { return Response.json({ error: error instanceof ZodError ? error.issues.map(i => i.message).join(' ') : error instanceof TeamError ? error.message : 'The artist workspace is temporarily unavailable. Please retry.' }, { status: error instanceof TeamError ? error.status : error instanceof ZodError ? 400 : 503, headers }); }
export async function GET(request: Request) {
    try {
        const user = await identity();
        if (new URL(request.url).searchParams.get('view') === 'preferences')
            return Response.json({ profile: await readJourneyProfile(user.id) }, { headers });
        const [profile, sources, events] = await Promise.all([readJourneyProfile(user.id), journeySources(user.id), prisma.growthEvent.findMany({ where: { userId: user.id, event: { in: ['artist_promise', 'artist_recap', 'artist_help_requested'] } }, orderBy: { createdAt: 'desc' }, take: 60 })]);
        const recapId = new URL(request.url).searchParams.get('recap');
        if (recapId) {
            if (!z.string().uuid().safeParse(recapId).success)
                throw new TeamError('Recap unavailable.', 404);
            const recap = await prisma.growthEvent.findFirst({ where: { id: recapId, userId: user.id, event: 'artist_recap' } });
            if (!recap)
                throw new TeamError('Recap unavailable.', 404);
            if (!events.some(e => e.id === recap.id))
                events.unshift(recap);
            else {
                events.splice(events.findIndex(e => e.id === recap.id), 1);
                events.unshift(recap);
            }
        }
        const beats = await prisma.beat.findMany({ where: { id: { in: profile.shortlist }, enabled: true, status: { in: ['PUBLISHED', 'EXCLUSIVE_RESERVED'] } }, select: { id: true, title: true, genre: true, bpm: true } });
        return Response.json({ name: user.name, profile, sources, beats, promises: events.filter(e => e.event === 'artist_promise').map(e => { const p = object(e.properties); return { id: p.id, text: p.text, party: p.party, dueAt: p.dueAt, status: p.status, version: p.version }; }), recaps: events.filter(e => e.event === 'artist_recap').map(e => { const p = object(e.properties); return { id: e.id, summary: p.summary, nextSteps: p.nextSteps, beatIds: p.beatIds, senderName: p.senderName, senderRole: p.senderRole, publishedAt: p.publishedAt }; }), requests: events.filter(e => e.event === 'artist_help_requested').slice(0, 5).map(e => ({ id: e.id, createdAt: e.createdAt, ...object(e.properties) })) }, { headers });
    }
    catch (e) {
        return failure(e);
    }
}
export async function POST(request: Request) {
    try {
        if (!isSameAppOrigin(request))
            throw new TeamError('Same-origin request required.', 403);
        if (!request.headers.get('content-type')?.startsWith('application/json'))
            throw new TeamError('JSON content required.', 415);
        if (Number(request.headers.get('content-length') || 0) > 16000)
            throw new TeamError('Request too large.', 413);
        const raw = await request.text();
        if (raw.length > 16000)
            throw new TeamError('Request too large.', 413);
        let body: Record<string, unknown>;
        try {
            body = object(JSON.parse(raw));
        }
        catch {
            throw new TeamError('Invalid request.');
        }
        const user = await identity(), limit = await consumeRateLimit({ scope: body.action === 'signal' ? 'artist-signal' : 'artist-journey-write', identity: String(user.id), limit: body.action === 'signal' ? 800 : 30, windowSeconds: 3600 });
        if (!limit.allowed)
            throw new TeamError('Please try again later.', 429);
        if (body.action === 'preferences')
            return Response.json({ profile: await saveJourneyProfile(user.id, body.profile) }, { headers });
        if (body.action === 'help')
            return Response.json(await requestArtistHelp(user.id, body), { headers });
        if (body.action === 'signal')
            return Response.json(await recordArtistSignal(user.id, body.signal), { headers });
        if (body.action === 'promise-reported') {
            const d = z.object({ id: z.string().uuid(), version: z.number().int().positive() }).parse(body);
            return Response.json(await prisma.$transaction(async (tx) => { const key = `artist-promise:${d.id}`; await tx.$queryRaw `SELECT id FROM growth_events WHERE key = ${key} FOR UPDATE`; const row = await tx.growthEvent.findUnique({ where: { key } }), p = object(row?.properties); if (!row || row.userId !== user.id || p.party !== 'ARTIST')
                throw new TeamError('Promise unavailable.', 404); if (p.version !== d.version)
                throw new TeamError('Promise changed. Reload first.', 409); if (p.status === 'DONE')
                return { reported: true }; await tx.growthEvent.update({ where: { id: row.id }, data: { properties: journeyJson({ ...p, status: 'REPORTED_DONE', version: d.version + 1, reportedAt: new Date().toISOString() }) } }); return { reported: true }; }), { headers });
        }
        throw new TeamError('Unknown artist action.', 400);
    }
    catch (e) {
        return failure(e);
    }
}
