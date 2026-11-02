import 'server-only';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ARTIST_GOALS, journeyPreferences, mergedSegments, object, type JourneyPreferences, type ListenRecord } from './artist-journey-policy';
import { TeamError } from './team/policy';
type Db = Prisma.TransactionClient;
export const journeyJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function readJourneyProfile(userId: number, db: Db = prisma) { const raw = (await db.growthEvent.findUnique({ where: { key: `artist-profile:${userId}` }, select: { properties: true } }))?.properties; return { ...journeyPreferences(raw), contactChangedAt: typeof object(raw).contactChangedAt === 'string' ? String(object(raw).contactChangedAt) : null }; }
export const preferencesSchema = z.object({ revision: z.number().int().min(0), goal: z.enum(Object.keys(ARTIST_GOALS) as [
        keyof typeof ARTIST_GOALS,
        ...(keyof typeof ARTIST_GOALS)[]
    ]), mode: z.enum(['EXPLORING', 'ACTIVE', 'LATER']), contact: z.enum(['ASK_FIRST', 'CALL', 'MESSAGE', 'NONE']), analytics: z.boolean(), timezone: z.string().max(80).refine(v => { try {
        new Intl.DateTimeFormat('en', { timeZone: v }).format();
        return true;
    }
    catch {
        return false;
    } }, 'Choose a valid timezone.'), startHour: z.number().int().min(8).max(20), endHour: z.number().int().min(9).max(21), weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7), after: z.string().datetime({ offset: true }).nullable(), deadline: z.string().datetime({ offset: true }).nullable(), notes: z.string().trim().max(1000), shortlist: z.array(z.number().int().positive()).max(5) }).refine(p => p.endHour > p.startHour, 'Choose an end time after the start.').refine(p => p.mode !== 'LATER' || !!p.after, 'Choose when to resume.');
export async function saveJourneyProfile(userId: number, input: unknown) {
    const data = preferencesSchema.parse(input);
    return prisma.$transaction(async (tx) => {
        // Dedicated event row keeps journey choices independent of onboarding updates.
        await tx.growthEvent.upsert({ where: { key: `artist-profile:${userId}` }, create: { key: `artist-profile:${userId}`, event: 'artist_journey_profile', source: 'artist_journey', userId, properties: journeyJson(journeyPreferences(null)) }, update: {} });
        await tx.$queryRaw `SELECT id FROM growth_events WHERE key = ${`artist-profile:${userId}`} FOR UPDATE`;
        const previous = await readJourneyProfile(userId, tx);
        if (previous.revision !== data.revision)
            throw new TeamError('Your preferences changed in another window. Reload before saving.', 409);
        const user = await tx.user.findFirst({ where: { id: userId, status: 'ACTIVE' }, select: { mobile: true } });
        if (!user)
            throw new TeamError('Account unavailable.', 403);
        if (data.contact === 'CALL' && !user.mobile?.replace(/\D/g, '').match(/^\d{7,15}$/))
            throw new TeamError('Add a valid phone number in your account before choosing calls.');
        const ids = [...new Set(data.shortlist)];
        if (ids.length !== await tx.beat.count({ where: { id: { in: ids }, enabled: true, status: { in: ['PUBLISHED', 'EXCLUSIVE_RESERVED'] } } }))
            throw new TeamError('A shortlisted beat is no longer available. Remove it and try again.');
        const contactFields = ['contact', 'mode', 'after', 'timezone', 'startHour', 'endHour', 'weekdays'] as const;
        const changed = contactFields.some(key => JSON.stringify(previous[key]) !== JSON.stringify(data[key]));
        const next = { ...data, shortlist: ids, revision: data.revision + 1, contactChangedAt: changed ? new Date().toISOString() : previous.contactChangedAt || null };
        await tx.growthEvent.update({ where: { key: `artist-profile:${userId}` }, data: { properties: journeyJson(next) } });
        if (!data.analytics)
            await tx.growthEvent.deleteMany({ where: { userId, event: { in: ['artist_beat_listen', 'artist_beat_licence', 'artist_beat_favourite', 'artist_cart_interest', 'artist_signal_ready', 'customer_service_interest'] } } });
        await tx.growthEvent.create({ data: { key: `artist-profile-change:${randomUUID()}`, event: 'artist_preferences_changed', source: 'artist_journey', userId, properties: { revision: next.revision, contact: next.contact, analytics: next.analytics, goal: next.goal } } });
        return next;
    });
}
const helpSchema = z.object({ requestKey: z.string().uuid(), reason: z.enum(['GOAL', 'SHORTLIST', 'READINESS', 'PAYMENT', 'MIXING', 'LICENCE']), message: z.string().trim().min(3).max(1500), channel: z.enum(['CALL', 'MESSAGE']), requestedAt: z.string().datetime({ offset: true }).optional() });
export async function requestArtistHelp(userId: number, input: unknown) {
    const data = helpSchema.parse(input);
    const p = await readJourneyProfile(userId);
    if (data.requestedAt && new Date(data.requestedAt) <= new Date())
        throw new TeamError('Choose a future callback time.');
    const user = await prisma.user.findFirst({ where: { id: userId, status: 'ACTIVE' }, select: { mobile: true } });
    if (!user)
        throw new TeamError('Account unavailable.', 403);
    if (data.channel === 'CALL' && !user.mobile?.replace(/\D/g, '').match(/^\d{7,15}$/))
        throw new TeamError('Add your phone number in account settings first.');
    const key = `artist-help:${userId}:${data.requestKey}`, properties = { ...data, goal: p.goal, shortlist: p.shortlist };
    const prior = await prisma.growthEvent.findUnique({ where: { key } });
    if (prior) {
        const old = object(prior.properties);
        if (old.reason !== data.reason || old.message !== data.message || old.channel !== data.channel || String(old.requestedAt || '') !== String(data.requestedAt || ''))
            throw new TeamError('This request changed. Start a new request.', 409);
        return { id: prior.id, status: 'REQUESTED' };
    }
    const result = await prisma.growthEvent.upsert({ where: { key }, create: { key, event: 'artist_help_requested', source: 'artist_journey', userId, properties: journeyJson(properties) }, update: {} });
    return { id: result.id, status: 'REQUESTED' };
}
const telemetrySchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('listen'), beatId: z.number().int().positive(), session: z.string().uuid(), seq: z.number().int().min(1).max(2000), duration: z.number().finite().min(10).max(1800), segments: z.array(z.tuple([z.number().finite().min(0), z.number().finite().min(0)])).max(16) }),
    z.object({ kind: z.enum(['licence', 'favourite', 'cart']), beatId: z.number().int().positive(), license: z.string().max(30).optional(), active: z.boolean().optional() })
]);
export async function recordArtistSignal(userId: number, input: unknown, now = new Date()) {
    const data = telemetrySchema.parse(input);
    return prisma.$transaction(async (tx) => {
        // Serialise against opt-out; a racing heartbeat must not restore deleted data.
        await tx.$queryRaw `SELECT id FROM growth_events WHERE key = ${`artist-profile:${userId}`} FOR UPDATE`;
        const profile = await readJourneyProfile(userId, tx);
        if (!profile.analytics)
            return { recorded: false };
        if (!await tx.beat.findFirst({ where: { id: data.beatId, enabled: true, status: { in: ['PUBLISHED', 'EXCLUSIVE_RESERVED'] } }, select: { id: true } }))
            return { recorded: false };
        if (data.kind !== 'listen') {
            const day = now.toISOString().slice(0, 10);
            const key = `artist-${data.kind}:${userId}:${data.beatId}:${day}`;
            await tx.growthEvent.upsert({ where: { key }, create: { key, userId, event: `artist_${data.kind === 'licence' ? 'beat_licence' : data.kind === 'favourite' ? 'beat_favourite' : 'cart_interest'}`, source: 'artist_journey', properties: journeyJson({ ...data, at: now.toISOString() }) }, update: { properties: journeyJson({ ...data, at: now.toISOString() }) } });
            await readySignal(tx, userId, `${data.kind}:${data.beatId}:${day}`, now);
            return { recorded: true };
        }
        const key = `artist-listen:${userId}:${data.session}:${data.beatId}`, row = await tx.growthEvent.findUnique({ where: { key } }), previous = object(row?.properties);
        if (Number(previous.seq || 0) >= data.seq)
            return { recorded: false };
        const segments = mergedSegments(data.segments, data.duration), seconds = segments.reduce((sum, [a, b]) => sum + b - a, 0);
        const budget = row ? Math.min(15, Math.max(0, (now.getTime() - Date.parse(String(previous.lastAt))) / 1000 + 1)) : 12;
        if (seconds > budget || data.segments.some(([a, b]) => b < a || b > data.duration + 1))
            throw new TeamError('Invalid playback interval.');
        const all = mergedSegments([...(Array.isArray(previous.segments) ? previous.segments as [
                number,
                number
            ][] : []), ...segments], data.duration);
        const properties = { beatId: data.beatId, seq: data.seq, duration: data.duration, seconds: Math.min(7200, Number(previous.seconds || 0) + seconds), segments: all, uniqueSeconds: all.reduce((n, [a, b]) => n + b - a, 0), lastAt: now.toISOString() };
        await tx.growthEvent.upsert({ where: { key }, create: { key, userId, event: 'artist_beat_listen', source: 'artist_journey', properties: journeyJson(properties) }, update: { properties: journeyJson(properties) } });
        if (properties.uniqueSeconds >= Math.min(30, data.duration * .5))
            await readySignal(tx, userId, `listen:${data.beatId}:${now.toISOString().slice(0, 10)}`, now);
        return { recorded: true };
    });
}
async function readySignal(tx: Db, userId: number, key: string, now: Date) { await tx.growthEvent.createMany({ data: [{ key: `artist-ready:${userId}:${key}`, event: 'artist_signal_ready', source: 'artist_journey', userId, createdAt: now, properties: { reason: key } }], skipDuplicates: true }); }
export async function listeningSummary(userId: number, db: Db = prisma, now = new Date()): Promise<ListenRecord[]> { const rows = await db.growthEvent.findMany({ where: { userId, event: 'artist_beat_listen', createdAt: { gte: new Date(now.getTime() - 14 * 86400000) } }, orderBy: { createdAt: 'desc' }, take: 300 }); const byId = new Map<number, ListenRecord>(); for (const row of rows) {
    const p = object(row.properties), id = Number(p.beatId);
    if (!Number.isSafeInteger(id))
        continue;
    const prior = byId.get(id);
    byId.set(id, { beatId: id, seconds: (prior?.seconds || 0) + Number(p.seconds || 0), uniqueSeconds: Math.max(prior?.uniqueSeconds || 0, Number(p.uniqueSeconds || 0)), duration: Number(p.duration || 0), sessions: (prior?.sessions || 0) + 1, lastAt: prior && prior.lastAt > String(p.lastAt) ? prior.lastAt : String(p.lastAt) });
} const beats = await db.beat.findMany({ where: { id: { in: [...byId.keys()] } }, select: { id: true, title: true, genre: true, bpm: true } }); return [...byId.values()].map(r => ({ ...r, ...beats.find(b => b.id === r.beatId) })).sort((a, b) => b.seconds - a.seconds).slice(0, 12); }
export async function journeySources(userId: number, db: Db = prisma) {
    const [releases, purchases, orders] = await Promise.all([
        db.release.findMany({ where: { userId, archivedAt: null }, select: { id: true, title: true, status: true, releaseDate: true, artworkUrl: true, audioUrl: true, draftCompletionPercent: true, missingFields: true, lastEditedAt: true, createdAt: true, paymentStatus: true }, orderBy: { updatedAt: 'desc' }, take: 12 }),
        db.beatPurchase.findMany({ where: { userId, hasAccess: true }, select: { id: true, beatId: true, purchasedAt: true, beat: { select: { title: true } } }, orderBy: { purchasedAt: 'desc' }, take: 12 }),
        db.checkoutOrder.findMany({ where: { userId, createdAt: { gte: new Date(Date.now() - 14 * 86400000) } }, select: { id: true, paymentStatus: true, fulfilledAt: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 12 })
    ]);
    return { releases, purchases, orders };
}
