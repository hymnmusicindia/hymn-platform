import 'server-only';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { customerBrandText } from '@/lib/customer-message';
import { journeyJson, journeySources, listeningSummary, readJourneyProfile } from '@/lib/artist-journey';
import { ARTIST_GOALS, customerCallWindow, journeyRequestActive, nextCustomerWindow, experimentGroup, intentScore, meaningfulListen, object, type IntentSignal, type JourneyPreferences } from '@/lib/artist-journey-policy';
import { can, demand, TeamError, type Actor } from './policy';
import { accountCard } from './customer-followups';
import { taskScope } from './service';
import { employeeCallSlot } from './availability';
import { syncCallbackCalendar } from './callback-calendar';
import { acceptsAssignmentsNow } from './availability-rules';
import { internalUserWhere } from './internal-identity';
import { notifyTeamBatch } from './notification-batch';
import {activityEmailTemplates,activityEmailLabels} from './work-station-policy';
import { supportDetails } from '@/lib/support';
type Db = Prisma.TransactionClient;
const openStatuses = ['COMPLETED', 'CANCELLED'];
const href = (taskId: string, workspace: string) => `/team?workspace=${workspace}&module=work-station&task=${taskId}`;
const profileSelect = { id: true, name: true, email: true, mobile: true, status: true, createdAt: true, preferredLanguage: true, onboardingPurpose: true, onboardingUserType: true } as const;
export async function artistTask(db: Db, a: Actor, id: string, write = false) { demand(a, 'clients.view'); if (write)
    demand(a, 'tasks.update'); const task = await db.teamTask.findFirst({ where: { ...taskScope(a), id }, include: { client: true } }); if (!task || !task.client || task.ownerId !== a.id && !can(a, 'tasks.all') || write && task.ownerId !== a.id)
    throw new TeamError('Customer activity unavailable.', 403); return task; }
export async function artistInsight(userId: number, db: Db = prisma, now = new Date()) {
    const [profile, sources, events] = await Promise.all([readJourneyProfile(userId, db), journeySources(userId, db), db.growthEvent.findMany({ where: { userId, event: { in: ['artist_help_requested', 'artist_beat_licence', 'artist_beat_favourite', 'artist_cart_interest', 'customer_service_interest'] }, createdAt: { gte: new Date(now.getTime() - 14 * 86400000) } }, orderBy: { createdAt: 'desc' }, take: 80 })]);
    const listens = profile.analytics ? await listeningSummary(userId, db, now) : [];
    const signals: IntentSignal[] = [], owned = new Set(sources.purchases.map(p => p.beatId)), seen = new Set<string>(), closedHelp = new Set<string>();
    const helpIds = events.filter(e => e.event === 'artist_help_requested').map(e => e.id);
    if (helpIds.length) {
        const client = await db.teamClient.findUnique({ where: { userId }, select: { workspaceId: true } });
        if (client) {
            const links = await db.teamWorkflowEvent.findMany({ where: { eventKey: { in: helpIds.map(id => `artist-work:${client.workspaceId}:help:${id}`) } }, select: { taskId: true, eventKey: true } }), closed = await db.teamTask.findMany({ where: { id: { in: links.flatMap(l => l.taskId ? [l.taskId] : []) }, status: { in: openStatuses } }, select: { id: true } }), closedIds = new Set(closed.map(t => t.id));
            for (const link of links)
                if (link.taskId && closedIds.has(link.taskId))
                    closedHelp.add(link.eventKey.split(':').pop()!);
        }
    }
    for (const l of listens) {
        if (owned.has(l.beatId))
            continue;
        if (meaningfulListen(l))
            signals.push({ key: 'listening', label: `Listened to ${l.title || 'a beat'}: ${Math.round(l.uniqueSeconds)} unique seconds`, points: 10, observedAt: l.lastAt, kind: 'OBSERVED', service: 'beats' });
        if (l.sessions >= 2)
            signals.push({ key: 'return', label: 'Returned to a beat in more than one playback session', points: 10, observedAt: l.lastAt, kind: 'OBSERVED', service: 'beats' });
    }
    for (const e of events) {
        const p = object(e.properties);
        if (e.event === 'artist_help_requested' && closedHelp.has(e.id))
            continue;
        const family = e.event + ':' + String(p.beatId || '');
        if (e.event !== 'artist_help_requested') {
            if (seen.has(family))
                continue;
            seen.add(family);
            if (owned.has(Number(p.beatId)))
                continue;
        }
        if (e.event === 'artist_help_requested')
            signals.push({ key: 'request', label: `Requested ${p.channel === 'CALL' ? 'a callback' : 'help by message'}: ${String(p.message).slice(0, 160)}`, points: 60, observedAt: e.createdAt.toISOString(), kind: 'REQUESTED', service: String(p.reason) });
        else if (profile.analytics && p.active !== false)
            signals.push({ key: e.event, label: e.event === 'artist_beat_licence' ? 'Compared beat licence options' : e.event === 'artist_beat_favourite' ? 'Saved a favourite beat' : e.event === 'artist_cart_interest' ? 'Added a beat to the cart' : 'Explored an artist service', points: e.event === 'artist_cart_interest' ? 25 : 15, observedAt: e.createdAt.toISOString(), kind: 'OBSERVED', service: 'beats' });
    }
    const readiness = sources.releases.filter(r => ['DRAFT', 'AWAITING_PAYMENT', 'CHANGES_REQUESTED', 'DISTRIBUTOR_CHANGES_REQUIRED'].includes(r.status)).map(r => ({ id: r.id, title: r.title, status: r.status, percent: r.draftCompletionPercent, releaseDate: r.releaseDate, checks: [{ label: 'Audio uploaded', done: !!r.audioUrl }, { label: 'Artwork uploaded', done: !!r.artworkUrl }, { label: 'Metadata complete', done: r.draftCompletionPercent >= 100 }, { label: 'Payment verified', done: ['paid', 'verified', 'completed', 'success'].includes(String(r.paymentStatus).toLowerCase()) }], missing: Array.isArray(r.missingFields) ? r.missingFields.filter((v): v is string => typeof v === 'string').slice(0, 12) : [] }));
    if (profile.analytics && events.filter(e => e.event === 'customer_service_interest').length >= 3)
        signals.push({ key: 'service_return', label: 'Returned to artist services on at least three recorded visits', points: 25, observedAt: events.find(e => e.event === 'customer_service_interest')!.createdAt.toISOString(), kind: 'OBSERVED', service: 'distribution' });
    if (profile.analytics && profile.mode === 'ACTIVE' && profile.goal !== 'EXPLORING')
        signals.push({ key: 'active_goal', label: 'Artist chose an active music project', points: 15, observedAt: now.toISOString(), kind: 'REQUESTED', service: profile.goal });
    const score = intentScore(signals, now);
    score.level = signals.some(s => s.key === 'request') ? 'REQUESTED' : score.score >= 50 ? 'HIGH' : 'EXPLORING';
    const blocker = readiness.find(r => r.status.includes('CHANGES')) ? 'Release corrections need attention' : readiness[0] ? 'Release requirements are unfinished' : profile.goal === 'FIND_BEAT' ? 'Choose a beat and clarify the licence' : profile.goal === 'FINISH_MIX' ? 'Confirm files, scope and references' : profile.goal === 'PROMOTE' ? 'Agree a promotion goal and release timeline' : 'Confirm the artist’s next step';
    return { profile, listens, score, readiness, purchases: sources.purchases, blocker, goal: ARTIST_GOALS[profile.goal], group: experimentGroup(userId), suggestion: score.level === 'REQUESTED' ? 'Answer the customer’s request first.' : profile.contact === 'NONE' ? 'No proactive contact. Keep the workspace ready for the customer.' : profile.contact === 'MESSAGE' ? 'Use the reviewed activity email to offer one useful next step.' : profile.contact === 'CALL' ? 'Help with the current blocker during the customer’s preferred hours.' : 'Offer help in the artist workspace; wait for their contact choice.' };
}
const promiseSchema = z.object({ id: z.string().uuid().optional(), version: z.number().int().min(0), taskId: z.string().min(1), text: z.string().trim().min(3).max(500), party: z.enum(['HYMN', 'ARTIST']), dueAt: z.string().datetime({ offset: true }), evidence: z.enum(['MANUAL', 'BEAT_PURCHASED', 'RELEASE_SUBMITTED', 'AUDIO_UPLOADED']).default('MANUAL'), releaseId: z.number().int().positive().optional() });
export async function artistMutation(tx: Db, a: Actor, resource: string, input: unknown) {
    if (resource === 'artist-routing-save') {
        demand(a, 'crm.outreach.manage');
        const d = z.object({ services: z.array(z.enum(['beats', 'distribution', 'mixing', 'promotion', 'onboarding'])).max(5), languages: z.array(z.string().regex(/^[a-z]{2,3}$/)).max(8) }).parse(input);
        const m = await tx.teamMember.findUniqueOrThrow({ where: { id: a.id } });
        await tx.teamMember.update({ where: { id: a.id }, data: { preferences: journeyJson({ ...object(m.preferences), artistRouting: d }) } });
        return { saved: true };
    }
    if (resource === 'artist-promise-save') {
        const d = promiseSchema.parse(input), task = await artistTask(tx, a, d.taskId, true);
        if (!task.client!.userId)
            throw new TeamError('Link a registered artist account first.');
        if (d.dueAt && new Date(d.dueAt) <= new Date())
            throw new TeamError('Choose a future promise deadline.');
        if (d.releaseId && !await tx.release.findFirst({ where: { id: d.releaseId, userId: task.client!.userId, archivedAt: null } }))
            throw new TeamError('Release unavailable.');
        if (['RELEASE_SUBMITTED', 'AUDIO_UPLOADED'].includes(d.evidence) && !d.releaseId)
            throw new TeamError('Choose a release for automatic completion.');
        const id = d.id || randomUUID(), key = `artist-promise:${id}`, prior = await tx.growthEvent.findUnique({ where: { key } }), previous = object(prior?.properties);
        if (prior && (previous.workspaceId !== a.workspaceId || previous.taskId !== task.id))
            throw new TeamError('Promise unavailable.', 403);
        if (prior && d.version === 0 && previous.text === d.text && previous.party === d.party && previous.dueAt === d.dueAt && previous.evidence === d.evidence && previous.releaseId === d.releaseId)
            return { id: prior.id, promise: previous };
        if (Number(previous.version || 0) !== d.version)
            throw new TeamError('Promise changed. Reload before saving.', 409);
        if (previous.status === 'DONE')
            throw new TeamError('A completed promise cannot be overwritten.');
        const next = { ...d, id, workspaceId: a.workspaceId, memberId: a.id, clientId: task.clientId, status: 'OPEN', version: d.version + 1, createdAt: previous.createdAt || new Date().toISOString() };
        const row = await tx.growthEvent.upsert({ where: { key }, create: { key, event: 'artist_promise', source: 'artist_journey', userId: task.client!.userId, properties: journeyJson(next) }, update: { properties: journeyJson(next) } });
        await tx.notification.create({ data: { userId: task.client!.userId, title: 'An agreed action was saved', body: customerBrandText(d.text, [task.client!.name]), href: '/artist-journey', eventKey: `artist-promise:${id}:${next.version}`, type: 'system' } });
        await tx.teamAudit.create({ data: { workspaceId: a.workspaceId, actorId: a.id, entityId: task.clientId!, action: 'artist.promise_saved', detail: journeyJson({ promiseId: id, taskId: task.id, version: next.version }) } });
        return { id: row.id, promise: next };
    }
    if (resource === 'artist-promise-complete') {
        const d = z.object({ taskId: z.string(), id: z.string().uuid(), version: z.number().int().positive(), evidence: z.string().trim().min(3).max(1000) }).parse(input), task = await artistTask(tx, a, d.taskId, true);
        const row = await tx.growthEvent.findUnique({ where: { key: `artist-promise:${d.id}` } }), p = object(row?.properties);
        if (!row || p.taskId !== task.id || p.workspaceId !== a.workspaceId)
            throw new TeamError('Promise unavailable.', 404);
        if (p.version !== d.version)
            throw new TeamError('Promise changed. Reload before completing.', 409);
        await tx.growthEvent.update({ where: { id: row.id }, data: { properties: journeyJson({ ...p, status: 'DONE', version: d.version + 1, completedAt: new Date().toISOString(), completionEvidence: d.evidence, completedBy: a.id }) } });
        await tx.teamAudit.create({ data: { workspaceId: a.workspaceId, actorId: a.id, entityId: task.clientId!, action: 'artist.promise_completed', detail: journeyJson({ promiseId: d.id, evidence: d.evidence }) } });
        return { completed: true };
    }
    if (resource === 'artist-recap-publish') {
        const d = z.object({ taskId: z.string(), requestKey: z.string().uuid(), summary: z.string().trim().min(10).max(4000), nextSteps: z.string().trim().min(3).max(2000), beatIds: z.array(z.number().int().positive()).max(5), reviewed: z.literal(true) }).parse(input), task = await artistTask(tx, a, d.taskId, true);
        if (!task.client!.userId)
            throw new TeamError('Link a registered artist before sharing a recap.');
        if (await tx.beat.count({ where: { id: { in: [...new Set(d.beatIds)] }, enabled: true, status: { in: ['PUBLISHED', 'EXCLUSIVE_RESERVED'] } } }) !== new Set(d.beatIds).size)
            throw new TeamError('A selected beat is unavailable.');
        const sender = await tx.teamMember.findUniqueOrThrow({ where: { id: a.id }, select: { jobTitle: true, user: { select: { name: true } } } }), key = `artist-recap:${task.id}:${d.requestKey}`;
        const payload = { taskId: task.id, workspaceId: a.workspaceId, summary: customerBrandText(d.summary, [task.client!.name]), nextSteps: customerBrandText(d.nextSteps, [task.client!.name]), beatIds: d.beatIds, senderName: sender.user.name, senderRole: sender.jobTitle, publishedAt: new Date().toISOString() };
        const old = await tx.growthEvent.findUnique({ where: { key } });
        if (old) {
            const p = object(old.properties);
            if (p.summary !== payload.summary || p.nextSteps !== payload.nextSteps || JSON.stringify(p.beatIds) !== JSON.stringify(d.beatIds))
                throw new TeamError('Recap changed. Review it as a new recap.', 409);
            return { id: old.id, url: `/artist-journey?recap=${old.id}` };
        }
        const row = await tx.growthEvent.create({ data: { key, userId: task.client!.userId, event: 'artist_recap', source: 'artist_journey', properties: journeyJson(payload) } });
        await tx.notification.create({ data: { userId: task.client!.userId, title: 'Your HYMN session recap is ready', body: 'Review your advice and agreed next steps in your private artist journey.', href: `/artist-journey?recap=${row.id}`, eventKey: `artist-recap:${row.id}`, type: 'system' } });
        await tx.teamAudit.create({ data: { workspaceId: a.workspaceId, actorId: a.id, entityId: task.clientId!, action: 'artist.recap_published', detail: { taskId: task.id, recapId: row.id } } });
        return { id: row.id, url: `/artist-journey?recap=${row.id}` };
    }
    throw new TeamError('Unknown artist action.', 404);
}
export async function artistRead(a: Actor, resource: string, p: URLSearchParams) {
    if (resource === 'artist-desk') {
        demand(a, 'tasks.update');
        const tasks = await prisma.teamTask.findMany({ where: { ...taskScope(a), ownerId: a.id, status: { notIn: openStatuses }, OR: [{ followUpContext: { path: ['artistJourney'], equals: true } }, { followUpContext: { path: ['kind'], equals: 'CALL' } }] }, select: { id: true, title: true, dueAt: true, status: true, followUpContext: true, client: { select: { name: true } } }, orderBy: [{ dueAt: 'asc' }, { id: 'asc' }], take: 100 });
        const member = await prisma.teamMember.findUniqueOrThrow({ where: { id: a.id }, select: { preferences: true } });
        const counts = await prisma.$queryRaw<{
            open: number;
            overdue: number;
            done: number;
        }[]> `SELECT COUNT(*) FILTER (WHERE properties->>'status' <> 'DONE')::integer AS open, COUNT(*) FILTER (WHERE properties->>'status' <> 'DONE' AND (properties->>'dueAt')::timestamptz < NOW())::integer AS overdue, COUNT(*) FILTER (WHERE properties->>'status' = 'DONE')::integer AS done FROM growth_events WHERE event = 'artist_promise' AND properties->>'workspaceId' = ${a.workspaceId} AND (${can(a, 'tasks.all')} OR properties->>'memberId' = ${a.id})`;
        return { items: tasks.filter(t => object(t.followUpContext).artistJourney === true).sort((a, b) => Number(object(b.followUpContext).intentScore || 0) - Number(object(a.followUpContext).intentScore || 0)).slice(0, 6).map(t => ({ id: t.id, title: t.title, dueAt: t.dueAt, status: t.status, reason: object(t.followUpContext).whyNow, nextStep: object(t.followUpContext).nextStep, score: object(t.followUpContext).intentScore, contact: object(t.followUpContext).contactMode })), promises: counts[0] || { open: 0, overdue: 0, done: 0 }, routing: object(object(member.preferences).artistRouting) };
    }
    if (resource === 'artist-activity') {
        const task = await artistTask(prisma, a, p.get('id') || '');
        let recipient=task.client!.email;
        const c=object(task.followUpContext),reference=Number(c.referenceId),ticketId=task.recordType==='support'?task.recordId:Number.isSafeInteger(reference)&&String(c.source).split(':')[0]==='ticket'&&String(c.source).split(':')[1]===String(reference)?reference:null;
        if(ticketId&&task.client!.userId&&(can(a,'support.reply')||can(a,'crm.outreach.manage'))&&(await prisma.teamWorkspace.findFirst({orderBy:{createdAt:'asc'},select:{id:true}}))?.id===a.workspaceId){const ticket=await prisma.supportTicket.findFirst({where:{id:ticketId,userId:task.client!.userId},include:{user:{select:{email:true}}}});if(ticket)recipient=String(supportDetails(ticket.details).email||ticket.user.email);}
        const userId = task.client!.userId;
        if (!userId)
            return { registered: false, emailTemplates:activityEmailTemplates,emailLabels:activityEmailLabels,client:{name:task.client!.name,email:recipient}, promises: [], recaps: [], insight: null };
        const [insight, rows] = await Promise.all([artistInsight(userId), prisma.growthEvent.findMany({ where: { userId, event: { in: ['artist_promise', 'artist_recap'] }, properties: { path: ['workspaceId'], equals: a.workspaceId } }, orderBy: { createdAt: 'desc' }, take: 50 })]);
        const manageable = await prisma.teamTask.findMany({ where: { workspaceId: a.workspaceId, ownerId: a.id, id: { in: rows.map(r => String(object(r.properties).taskId)) } }, select: { id: true } }), ids = new Set(manageable.map(t => t.id));
        return { registered: true, emailTemplates:activityEmailTemplates,emailLabels:activityEmailLabels,client:{name:task.client!.name,email:recipient}, insight:object(task.followUpContext).experimentGroup==='COMPARISON'?{...insight,suggestion:'Observation only. Respond if the artist requests help; do not initiate behaviour-triggered contact.'}:insight, promises: rows.filter(r => r.event === 'artist_promise').map(r => ({ ...object(r.properties), eventId: r.id, canComplete: ids.has(String(object(r.properties).taskId)) })), recaps: rows.filter(r => r.event === 'artist_recap').map(r => ({ id: r.id, ...object(r.properties) })) };
    }
    if (resource === 'artist-performance') {
        demand(a, 'reports.all.view');
        const since = new Date(Date.now() - 30 * 86400000);
        const tasks = await prisma.teamTask.findMany({ where: { workspaceId: a.workspaceId, createdAt: { gte: since }, followUpContext: { path: ['artistJourney'], equals: true } }, select: { status: true, completedAt: true, followUpContext: true, client: { select: { userId: true } } }, take: 5000 });
        const ids = tasks.flatMap(t => t.client?.userId ? [t.client.userId] : []), purchases = await prisma.beatPurchase.findMany({ where: { userId: { in: ids }, hasAccess: true, purchasedAt: { gte: since } }, select: { userId: true, purchasedAt: true } });
        return { period: 'Last 30 days', truncated: tasks.length === 5000, groups: ['ASSISTED', 'COMPARISON'].map(group => { const selected = tasks.filter(t => object(t.followUpContext).experimentGroup === group), users = [...new Set(selected.flatMap(t => t.client?.userId ? [t.client.userId] : []))]; return { group, customers: users.length, completed: selected.filter(t => t.status === 'COMPLETED').length, purchasers: users.filter(id => purchases.some(p => p.userId === id && selected.some(t => t.client?.userId === id && p.purchasedAt >= new Date(String(object(t.followUpContext).signalAt))))).length }; }), note: 'Observed outcomes, not proof of causation. Explicit help requests are always served.' };
    }
    throw new TeamError('Unknown artist view.', 404);
}
export async function preferredSlot(tx: Db, workspaceId: string, memberId: string, p: JourneyPreferences, after: Date, taskId?: string) { let candidate = nextCustomerWindow(p, after); for (let i = 0; i < 20 && candidate; i++) {
    const slot = await employeeCallSlot(tx, workspaceId, memberId, candidate, undefined, taskId);
    if (!slot || slot.getTime() > after.getTime() + 14 * 86400000)
        return null;
    if (customerCallWindow(p, slot))
        return slot;
    candidate = nextCustomerWindow(p, new Date(slot.getTime() + 30 * 60000));
} return null; }
async function routeArtist(tx: Db, a: Actor, user: Prisma.UserGetPayload<{
    select: typeof profileSelect;
}>, service: string, p: JourneyPreferences, call: boolean, after: Date) {
    const members = await tx.teamMember.findMany({ where: { workspaceId: a.workspaceId, status: 'ACTIVE', availability: 'AVAILABLE', role: { owner: false }, user: { status: 'ACTIVE' } }, include: { role: true }, orderBy: { id: 'asc' } });
    const eligible = members.filter(m => can(m, 'tasks.update') && can(m, 'crm.outreach.manage') && acceptsAssignmentsNow(m.preferences, new Date()));
    const current = await tx.teamClient.findUnique({ where: { userId: user.id }, select: { ownerId: true } });
    const reservations = await tx.teamCalendarEvent.findMany({ where: { workspaceId: a.workspaceId, assigneeId: { in: eligible.map(m => m.id) }, status: 'SCHEDULED', startsAt: { gte: new Date(), lt: new Date(Date.now() + 7 * 86400000) } }, select: { assigneeId: true, startsAt: true, endsAt: true } });
    const counts = await tx.teamTask.groupBy({ by: ['ownerId'], where: { workspaceId: a.workspaceId, ownerId: { in: eligible.map(m => m.id) }, status: { notIn: openStatuses }, archivedAt: null }, _count: true });
    const ranked = eligible.map(m => { const prefs = object(object(m.preferences).artistRouting), skills = Array.isArray(prefs.services) ? prefs.services : [], languages = Array.isArray(prefs.languages) ? prefs.languages : []; const minutes = reservations.filter(r => r.assigneeId === m.id).reduce((n, r) => n + Math.max(15, Math.min(240, ((r.endsAt?.getTime() || r.startsAt.getTime() + 30 * 60000) - r.startsAt.getTime()) / 60000)), 0) + (counts.find(r => r.ownerId === m.id)?._count || 0) * 15; return { member: m, rank: minutes - (skills.includes(service) ? 90 : 0) - (languages.includes(user.preferredLanguage) ? 60 : 0) - (m.id === current?.ownerId ? 120 : 0) }; }).sort((x, y) => x.rank - y.rank || x.member.id.localeCompare(y.member.id));
    for (const { member } of ranked) {
        if (!call)
            return { member, dueAt: after };
        const slot = await preferredSlot(tx, a.workspaceId, member.id, p, after);
        if (slot)
            return { member, dueAt: slot };
    }
    return null;
}
export async function syncArtistJourneys(tx: Db, a: Actor, now = new Date()) {
    demand(a, 'acquisition.admin');
    if (process.env.TEAM_AUTOMATION_ENABLED === 'false')
        return { created: 0, reconciled: 0 };
    if ((await tx.teamWorkspace.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } }))?.id !== a.workspaceId)
        return { created: 0, reconciled: 0 };
    const started = Date.now(), workspace = await tx.teamWorkspace.findUniqueOrThrow({ where: { id: a.workspaceId }, select: { customerFollowupCursor: true } }), cursor = object(workspace.customerFollowupCursor), state = object(cursor.artistJourney);
    let created = 0, reconciled = 0;
    const [newUsers, events, releases, orders, pendingRequests] = await Promise.all([
        tx.user.findMany({ where: { status: 'ACTIVE', role: { in: ['CUSTOMER', 'PRODUCER'] }, NOT: internalUserWhere, createdAt: { gte: new Date(now.getTime() - 30 * 86400000) }, id: { gt: Number(state.userId || 0) } }, select: profileSelect, orderBy: { id: 'asc' }, take: 20 }),
        tx.growthEvent.findMany({ where: { event: { in: ['artist_help_requested', 'artist_signal_ready', 'artist_preferences_changed', 'customer_service_interest'] }, userId: { not: null }, createdAt: { gte: new Date(now.getTime() - 14 * 86400000) }, ...(typeof state.eventAt === 'string' ? { OR: [{ createdAt: { gt: new Date(state.eventAt) } }, { createdAt: new Date(state.eventAt), id: { gt: String(state.eventId || '') } }] } : {}) }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 25 }),
        tx.release.findMany({ where: { archivedAt: null, status: { in: ['DRAFT', 'AWAITING_PAYMENT', 'CHANGES_REQUESTED', 'DISTRIBUTOR_CHANGES_REQUIRED'] }, id: { gt: Number(state.releaseId || 0) }, user: { status: 'ACTIVE', NOT: internalUserWhere } }, select: { id: true, userId: true, title: true, status: true, releaseDate: true, lastEditedAt: true, createdAt: true, version: true }, orderBy: { id: 'asc' }, take: 15 }),
        tx.checkoutOrder.findMany({ where: { id: { gt: Number(state.orderId || 0) }, createdAt: { gte: new Date(now.getTime() - 14 * 86400000), lt: new Date(now.getTime() - 2 * 3600000) }, paymentStatus: { in: ['created', 'failed', 'payment_failed'] }, fulfilledAt: null, user: { status: 'ACTIVE', NOT: internalUserWhere } }, select: { id: true, userId: true, paymentStatus: true, createdAt: true }, orderBy: { id: 'asc' }, take: 15 }),
        tx.$queryRaw<{
            id: string;
        }[]> `SELECT e.id FROM growth_events e WHERE e.event = 'artist_help_requested' AND e.created_at >= ${new Date(now.getTime() - 30 * 86400000)} AND NOT EXISTS (SELECT 1 FROM team_workflow_events w WHERE w."eventKey" = ${`artist-work:${a.workspaceId}:help:`} || e.id) ORDER BY e.created_at, e.id LIMIT 20`
    ]);
    if (!newUsers.length)
        state.userId = 0;
    if (!releases.length)
        state.releaseId = 0;
    if (!orders.length)
        state.orderId = 0;
    const candidates = new Map<number, {
        user: typeof newUsers[number];
        onboard: boolean;
        request?: typeof events[number];
        source?: {
            key: string;
            reason: string;
            recordType: string;
            recordId: number;
            urgent: boolean;
        };
    }>();
    for (const user of newUsers)
        candidates.set(user.id, { user, onboard: true });
    const requests = pendingRequests.length ? await tx.growthEvent.findMany({ where: { id: { in: pendingRequests.map(e => e.id) } } }) : [];
    for (const e of [...events, ...requests]) {
        const user = await tx.user.findFirst({ where: { id: e.userId!, status: 'ACTIVE', role: { in: ['CUSTOMER', 'PRODUCER'] }, NOT: internalUserWhere }, select: profileSelect });
        if (user) {
            const old = candidates.get(user.id);
            candidates.set(user.id, { user, onboard: old?.onboard || false, request: e.event === 'artist_help_requested' ? e : old?.request });
        }
    }
    for (const release of releases) {
        const correction = release.status.includes('CHANGES'), idle = (now.getTime() - (release.lastEditedAt || release.createdAt).getTime()) >= 30 * 3600000, soon = release.releaseDate > now && release.releaseDate.getTime() - now.getTime() < 7 * 86400000;
        if (!correction && !idle && !soon)
            continue;
        const user = await tx.user.findUnique({ where: { id: release.userId }, select: profileSelect });
        if (!user)
            continue;
        const old = candidates.get(user.id);
        candidates.set(user.id, { ...old, user, onboard: old?.onboard || false, source: { key: `release:${release.id}:${release.status}:${(release.lastEditedAt || release.createdAt).toISOString()}`, reason: correction ? `Corrections are still required for ${release.title}` : soon ? `Release date approaching; requirements unfinished for ${release.title}` : `Release draft inactive for at least 30 hours: ${release.title}`, recordType: 'release', recordId: release.id, urgent: correction || soon } });
    }
    for (const order of orders) {
        const old = candidates.get(order.userId);
        if (old?.source || old?.request)
            continue;
        const user = await tx.user.findUnique({ where: { id: order.userId }, select: profileSelect });
        if (user)
            candidates.set(user.id, { ...old, user, onboard: old?.onboard || false, source: { key: `checkout:${order.id}`, reason: order.paymentStatus === 'created' ? 'Checkout unfinished for at least two hours' : 'Payment attempt failed; offer assistance', recordType: 'checkout', recordId: order.id, urgent: false } });
    }
    for (const { user, onboard: newSignup, request, source } of candidates.values()) {
        let onboard = newSignup;
        if (onboard && await tx.teamWorkflowEvent.findUnique({where:{eventKey:`artist-work:${a.workspaceId}:onboard:${user.id}`}})) onboard = false;
        if (Date.now() - started > 16000)
            break;
        const explicit = !!request, profileAtIntake = await readJourneyProfile(user.id, tx), resume = profileAtIntake.mode === 'LATER' && !!profileAtIntake.after && ['CALL', 'MESSAGE'].includes(profileAtIntake.contact);
        const key = explicit ? `artist-work:${a.workspaceId}:help:${request!.id}` : source ? `artist-work:${a.workspaceId}:${source.key}` : onboard ? `artist-work:${a.workspaceId}:onboard:${user.id}` : resume ? `artist-work:${a.workspaceId}:resume:${user.id}:${profileAtIntake.after}` : `artist-work:${a.workspaceId}:interest:${user.id}:${now.toISOString().slice(0, 10)}`;
        if (await tx.teamWorkflowEvent.findUnique({ where: { eventKey: key } }))
            continue;
        const insight = await artistInsight(user.id, tx, now), p = insight.profile, group = experimentGroup(user.id), help = object(request?.properties);
        if (!onboard && !explicit && !source && !resume && (insight.score.score < 50 || p.mode !== 'ACTIVE' || p.contact === 'NONE'))
            continue;
        const comparisonOnly = !explicit && !onboard && !source && !resume && group==='COMPARISON';
        const suggested = comparisonOnly ? 'Observation only. Wait for the artist to request help; do not initiate behaviour-triggered contact.' : insight.suggestion;
        const client = await accountCard(tx, a, user);
        if (!client || client.status !== 'ACTIVE')
            continue;
        if (!explicit && !onboard && !source && await tx.teamTask.findFirst({ where: { workspaceId: a.workspaceId, clientId: client.id, archivedAt: null, completedAt: { gte: new Date(now.getTime() - 3 * 86400000) } } }))
            continue;
        if (await tx.teamProspect.findFirst({ where: { clientId: client.id, suppressed: true } }) || await tx.teamOutreachSuppression.findUnique({ where: { email: user.email.toLowerCase() } }))
            continue;
        const service = ['SHORTLIST', 'LICENCE'].includes(String(help.reason)) || p.goal === 'FIND_BEAT' || p.goal === 'EXPLORING' && insight.listens.length ? 'beats' : help.reason === 'MIXING' || p.goal === 'FINISH_MIX' ? 'mixing' : p.goal === 'PROMOTE' ? 'promotion' : p.goal === 'EXPLORING' && !source ? 'onboarding' : 'distribution';
        const requestActive = explicit && journeyRequestActive({ helpRequestId: request!.id, helpRequestedAt: request!.createdAt.toISOString() }, p);
        const call = (explicit ? help.channel === 'CALL' && (p.contact === 'CALL' || requestActive) : p.contact === 'CALL' && (onboard || !!source || resume || group === 'ASSISTED')) && !!client.phone.replace(/\D/g, '').match(/^\d{7,15}$/);
        const contactProfile = { ...p, contact: call ? 'CALL' as const : p.contact, ...(requestActive ? { mode: 'ACTIVE' as const, after: null } : {}) };
        const requested = typeof help.requestedAt === 'string' ? new Date(help.requestedAt) : null, after = new Date(Math.max(now.getTime() + 60 * 60000, requested?.getTime() || 0, !requestActive && p.after ? Date.parse(p.after) : 0));
        const prior = await tx.teamTask.findFirst({ where: { workspaceId: a.workspaceId, clientId: client.id, archivedAt: null, status: { notIn: openStatuses }, OR: [{ followUpContext: { path: ['artistJourney'], equals: true } }, { eventKey: { startsWith: 'support-call:' } }, { followUpContext: { path: ['kind'], equals: 'CALL' } }] }, orderBy: { createdAt: 'asc' } });
        if (prior) {
            const c = object(prior.followUpContext);
            if (object(c.workActivity).status === 'RUNNING' || object(c.workActivity).status === 'PAUSED')
                continue;
            const slot = call ? await preferredSlot(tx, a.workspaceId, prior.ownerId, contactProfile, after, prior.id) : null;
            const changed = await tx.teamTask.update({ where: { id: prior.id }, data: { ...(explicit ? { priority: 'HIGH' } : {}), ...(call && slot ? { dueAt: slot } : {}), followUpContext: journeyJson({ ...c, artistJourney: true, ...(call && slot ? { kind: 'CALL' } : explicit ? { kind: 'TASK' } : {}), intentScore: insight.score.score, whyNow: explicit ? String(help.message) : source?.reason || 'New artist account or updated engagement', nextStep: suggested, contactMode: comparisonOnly?'INSIGHTS_ONLY':call ? 'CALL' : p.contact, ...(source ? { sourceRecord: source } : {}), ...(explicit ? { helpRequestId: request!.id, helpRequestedAt: request!.createdAt.toISOString(), helpMessage: help.message, requestedAt: help.requestedAt || null, requestedChannel: help.channel } : {}) }), version: { increment: 1 } } });
            if (call && slot)
                await syncCallbackCalendar(tx, a, changed);
            else if (explicit)
                await tx.teamCalendarEvent.updateMany({ where: { followUpTaskId: prior.id, status: 'SCHEDULED' }, data: { status: 'CANCELLED', version: { increment: 1 }, scheduleRevision: { increment: 1 } } });
            await tx.teamWorkflowEvent.create({ data: { workspaceId: a.workspaceId, eventKey: key, taskId: prior.id } });
            await notifyTeamBatch(tx, a, [{ eventKey: `artist-updated:${key}`, memberId: prior.ownerId, title: 'Updated customer context: ' + prior.title, href: href(prior.id, a.workspaceId), taskId: prior.id }]);
            reconciled++;
            continue;
        }
        const route = await routeArtist(tx, a, user, service, contactProfile, call, after);
        if (!route)
            continue;
        const title = explicit ? 'Help requested' : source ? 'Artist needs assistance' : onboard ? 'Welcome and next step' : resume ? 'Preferred follow-up' : group === 'COMPARISON' ? 'Artist insight — comparison group' : 'Artist needs a next step';
        const why = explicit ? String(help.message) : source?.reason || (onboard ? `New account. Goal: ${insight.goal}` : resume ? `Artist asked to resume contact after ${p.after}` : insight.score.reasons.map(r => r.label).join('; '));
        const t = await tx.teamTask.create({ data: { workspaceId: a.workspaceId, creatorId: a.id, ownerId: route.member.id, clientId: client.id, eventKey: key, title: `${title}: ${client.name}`.slice(0, 200), description: `${why}\n\nCurrent blocker: ${insight.blocker}\nNext step: ${suggested}\nContact preference: ${p.contact}. ${requested ? 'Customer requested ' + requested.toISOString() + '.' : ''}\nAn internal work slot is not a confirmed customer appointment.`, priority: explicit || source?.urgent ? 'HIGH' : 'NORMAL', dueAt: route.dueAt, followUpContext: journeyJson({ artistJourney: true, kind: call ? 'CALL' : 'TASK', service, sourceRecord: source || null, signalAt: now.toISOString(), intentScore: insight.score.score, whyNow: why, nextStep: suggested, contactMode: comparisonOnly?'INSIGHTS_ONLY':call ? 'CALL' : p.contact, experimentGroup: explicit || onboard || source || resume ? 'SERVICE' : group, helpRequestId: request?.id || null, helpRequestedAt: request?.createdAt.toISOString() || null, requestedAt: help.requestedAt || null, requestedChannel: help.channel || null, success: 'Resolve the next blocker and record the agreed action.' }) } });
        if (call)
            await syncCallbackCalendar(tx, a, t);
        await tx.teamWorkflowEvent.create({ data: { workspaceId: a.workspaceId, eventKey: key, taskId: t.id } });
        await notifyTeamBatch(tx, a, [{ eventKey: `artist-assigned:${t.id}`, memberId: route.member.id, title: t.title, href: href(t.id, a.workspaceId), taskId: t.id }]);
        created++;
    }
    // Advance only after the bounded batch completes; workflow keys make retries safe.
    if (Date.now() - started < 16000) {
        if (newUsers.length)
            state.userId = newUsers[newUsers.length - 1].id;
        if (events.length) {
            state.eventId = events[events.length - 1].id;
            state.eventAt = events[events.length - 1].createdAt.toISOString();
        }
        if (releases.length)
            state.releaseId = releases[releases.length - 1].id;
        if (orders.length)
            state.orderId = orders[orders.length - 1].id;
    }
    await tx.teamWorkspace.update({ where: { id: a.workspaceId }, data: { customerFollowupCursor: journeyJson({ ...cursor, artistJourney: state }) } });
    return { created, reconciled };
}
export async function syncArtistPromises(tx: Db, a: Actor, now = new Date()) {
    demand(a, 'acquisition.admin');
    const workspace = await tx.teamWorkspace.findUniqueOrThrow({ where: { id: a.workspaceId }, select: { customerFollowupCursor: true } }), cursor = object(workspace.customerFollowupCursor);
    let completed = 0;
    const rows = await tx.growthEvent.findMany({ where: { event: 'artist_promise', AND: [{ properties: { path: ['workspaceId'], equals: a.workspaceId } }, { properties: { path: ['status'], not: 'DONE' } }], ...(typeof cursor.artistPromise === 'string' ? { id: { gt: cursor.artistPromise } } : {}) }, orderBy: { id: 'asc' }, take: 100 });
    for (const row of rows) {
        cursor.artistPromise = row.id;
        const p = object(row.properties);
        const task = await tx.teamTask.findFirst({ where: { id: String(p.taskId), workspaceId: a.workspaceId, archivedAt: null }, select: { ownerId: true, clientId: true } });
        if (!task)
            continue;
        let done = false;
        if (row.userId && p.evidence === 'BEAT_PURCHASED')
            done = !!await tx.beatPurchase.findFirst({ where: { userId: row.userId, hasAccess: true, purchasedAt: { gte: new Date(String(p.createdAt)) } } });
        if (row.userId && p.releaseId && ['AUDIO_UPLOADED', 'RELEASE_SUBMITTED'].includes(String(p.evidence))) {
            const r = await tx.release.findFirst({ where: { id: Number(p.releaseId), userId: row.userId, archivedAt: null }, select: { status: true, audioUrl: true, updatedAt: true } });
            done = !!r && (p.evidence === 'AUDIO_UPLOADED' ? !!r.audioUrl : !['DRAFT', 'AWAITING_PAYMENT', 'CHANGES_REQUESTED', 'DISTRIBUTOR_CHANGES_REQUIRED', 'FAILED', 'REJECTED', 'ARCHIVED'].includes(r.status));
        }
        if (done) {
            await tx.growthEvent.update({ where: { id: row.id }, data: { properties: journeyJson({ ...p, status: 'DONE', version: Number(p.version) + 1, completedAt: now.toISOString(), completionEvidence: `Verified from HYMN: ${p.evidence}` }) } });
            completed++;
        }
        else if (new Date(String(p.dueAt)) <= now)
            await notifyTeamBatch(tx, a, [{ eventKey: `artist-promise-due:${row.id}:${now.toISOString().slice(0, 10)}`, memberId: task.ownerId, title: `Promise needs attention: ${String(p.text).slice(0, 120)}`, href: href(String(p.taskId), a.workspaceId), taskId: String(p.taskId) }]);
    }
    if (!rows.length)
        delete cursor.artistPromise;
    await tx.teamWorkspace.update({ where: { id: a.workspaceId }, data: { customerFollowupCursor: journeyJson(cursor) } });
    return { completed };
}
/** Recheck source truth and preferences before leaving a call in the queue. */
export async function reconcileArtistWork(tx: Db, a: Actor, now = new Date()) {
    demand(a, 'acquisition.admin');
    const workspace = await tx.teamWorkspace.findUniqueOrThrow({ where: { id: a.workspaceId }, select: { customerFollowupCursor: true } }), cursor = object(workspace.customerFollowupCursor);
    const tasks = await tx.teamTask.findMany({ where: { workspaceId: a.workspaceId, archivedAt: null, status: { notIn: openStatuses }, followUpContext: { path: ['artistJourney'], equals: true }, ...(typeof cursor.artistReview === 'string' ? { id: { gt: cursor.artistReview } } : {}) }, include: { client: true, owner: { include: { user: { select: { status: true } } } } }, orderBy: { id: 'asc' }, take: 30 });
    let cancelled = 0, rescheduled = 0;
    for (const task of tasks) {
        cursor.artistReview = task.id;
        const c = object(task.followUpContext), activity = object(c.workActivity), userId = task.client?.userId;
        if (!userId || ['RUNNING', 'PAUSED'].includes(String(activity.status)))
            continue;
        const p = await readJourneyProfile(userId, tx), source = object(c.sourceRecord);
        let obsolete = task.client?.status !== 'ACTIVE' || !await tx.user.findFirst({ where: { id: userId, status: 'ACTIVE', NOT: internalUserWhere }, select: { id: true } });
        if (source.recordType === 'checkout') {
            const order = await tx.checkoutOrder.findUnique({ where: { id: Number(source.recordId) }, select: { userId: true, paymentStatus: true, fulfilledAt: true, createdAt: true } });
            obsolete ||= !order || order.userId !== userId || !!order.fulfilledAt || ['paid', 'captured', 'completed', 'success'].includes(order.paymentStatus);
            if (order && !obsolete)
                obsolete = !!await tx.checkoutOrder.findFirst({ where: { userId, paymentStatus: { in: ['paid', 'captured', 'completed', 'success'] }, createdAt: { gte: order.createdAt } } });
        }
        if (source.recordType === 'release') {
            const release = await tx.release.findUnique({ where: { id: Number(source.recordId) }, select: { userId: true, status: true, archivedAt: true } });
            obsolete ||= !release || release.userId !== userId || !!release.archivedAt || !['DRAFT', 'AWAITING_PAYMENT', 'CHANGES_REQUESTED', 'DISTRIBUTOR_CHANGES_REQUIRED'].includes(release.status);
        }
        if (obsolete) {
            const updated = await tx.teamTask.update({ where: { id: task.id }, data: { status: 'CANCELLED', blocker: 'The source issue was resolved or the contact is no longer eligible.', version: { increment: 1 } } });
            await syncCallbackCalendar(tx, a, updated);
            cancelled++;
            continue;
        }
        const explicit = journeyRequestActive(c, p), allowed = p.contact === 'CALL' || explicit && c.requestedChannel === 'CALL';
        if (c.kind === 'CALL' && !allowed) {
            await tx.teamTask.update({ where: { id: task.id }, data: { followUpContext: journeyJson({ ...c, kind: 'TASK', contactMode: p.contact, whyNow: !p.analytics && !explicit ? 'Review the artist’s chosen goal and current requirements.' : c.whyNow, nextStep: 'Respect the artist’s current contact choice. Offer help in their workspace.' }), version: { increment: 1 } } });
            await tx.teamCalendarEvent.updateMany({ where: { followUpTaskId: task.id, status: 'SCHEDULED' }, data: { status: 'CANCELLED', version: { increment: 1 }, scheduleRevision: { increment: 1 } } });
            rescheduled++;
            continue;
        }
        if (c.kind === 'CALL') {
            const cp = { ...p, contact: 'CALL' as const, ...(explicit ? { mode: 'ACTIVE' as const, after: null } : {}) };
            const memberUnavailable = task.owner.status !== 'ACTIVE' || task.owner.user.status !== 'ACTIVE' || task.owner.availability !== 'AVAILABLE';
            if (memberUnavailable || !task.dueAt || task.dueAt < now || !customerCallWindow(cp, task.dueAt)) {
                const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: profileSelect });
                let ownerId = task.ownerId, dueAt = memberUnavailable ? null : await preferredSlot(tx, a.workspaceId, ownerId, cp, new Date(now.getTime() + 3600000), task.id);
                if (!dueAt) {
                    const route = await routeArtist(tx, a, user, String(c.service), cp, true, new Date(now.getTime() + 3600000));
                    if (route) {
                        ownerId = route.member.id;
                        dueAt = route.dueAt;
                    }
                }
                const updated = await tx.teamTask.update({ where: { id: task.id }, data: { ownerId, dueAt, status: dueAt ? 'TODO' : 'BLOCKED', blocker: dueAt ? '' : 'No matching representative/customer time window. Agree coverage or a new time.', version: { increment: 1 } } });
                await syncCallbackCalendar(tx, a, updated);
                if (ownerId !== task.ownerId)
                    await notifyTeamBatch(tx, a, [{ eventKey: `artist-handoff:${task.id}:${ownerId}`, memberId: ownerId, title: 'Artist follow-up reassigned: ' + task.title, href: href(task.id, a.workspaceId), taskId: task.id }]);
                rescheduled++;
            }
        }
    }
    if (!tasks.length)
        delete cursor.artistReview;
    await tx.teamWorkspace.update({ where: { id: a.workspaceId }, data: { customerFollowupCursor: journeyJson(cursor) } });
    return { cancelled, rescheduled };
}
/** A queue can be stale between cron runs. Validate again at the point of action. */
export async function assertArtistAction(tx: Db, task: {
    clientId: string | null;
    followUpContext: unknown;
}, channel: 'START' | 'EMAIL', now = new Date()) {
    const c = object(task.followUpContext);
    if (!task.clientId)
        return;
    const client = await tx.teamClient.findUnique({ where: { id: task.clientId }, select: { userId: true, status: true } });
    if (!client?.userId)
        return;
    const raw = await tx.growthEvent.findUnique({ where: { key: `artist-profile:${client.userId}` }, select: { id: true } });
    const p = await readJourneyProfile(client.userId, tx);
    const explicit = journeyRequestActive(c, p);
    if (channel === 'EMAIL' && c.experimentGroup === 'COMPARISON' && !explicit)
        throw new TeamError('This is an observation-only comparison activity. Respond only if the artist requests help.');
    if (channel === 'EMAIL' && raw && !explicit && (p.contact === 'NONE' || p.contact === 'ASK_FIRST' || p.mode === 'LATER' && (!p.after || new Date(p.after) > now)))
        throw new TeamError('The artist’s contact choice does not allow proactive email.');
    if (channel === 'START' && c.kind === 'CALL' && raw && !explicit && (p.contact !== 'CALL' || !customerCallWindow(p, now)))
        throw new TeamError('The artist’s current contact choice or preferred hours do not allow this call. Review their journey first.', 409);
    if (c.artistJourney !== true)
        return;
    const source = object(c.sourceRecord);
    if (source.recordType === 'checkout') {
        const order = await tx.checkoutOrder.findUnique({ where: { id: Number(source.recordId) }, select: { userId: true, paymentStatus: true, fulfilledAt: true, createdAt: true } });
        if (!order || order.userId !== client.userId || order.fulfilledAt || !['created', 'failed', 'payment_failed'].includes(order.paymentStatus) || await tx.checkoutOrder.findFirst({ where: { userId: client.userId, createdAt: { gte: order.createdAt }, paymentStatus: { in: ['paid', 'captured', 'completed', 'success'] } } }))
            throw new TeamError('Checkout is resolved. Refresh this activity instead of contacting the artist.', 409);
    }
    if (source.recordType === 'release') {
        const r = await tx.release.findUnique({ where: { id: Number(source.recordId) }, select: { userId: true, status: true, archivedAt: true } });
        if (!r || r.userId !== client.userId || r.archivedAt || !['DRAFT', 'AWAITING_PAYMENT', 'CHANGES_REQUESTED', 'DISTRIBUTOR_CHANGES_REQUIRED'].includes(r.status))
            throw new TeamError('The release issue is resolved. Refresh this activity.', 409);
    }
}
