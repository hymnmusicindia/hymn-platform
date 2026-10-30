import 'server-only';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { supportDetails } from '@/lib/support';
import { can, demand, TeamError, assertTaskTransition, type Actor } from './policy';
import { taskScope, teamMutationTx } from './service';
import { indiaWorkday, assertDailyTaskChange } from './daily-work';
import { employeeCallSlot } from './availability';
import { syncCallbackCalendar } from './callback-calendar';
import { accountCard, recordCallbackOutcome } from './customer-followups';
import { linkProspectContact } from './contact-directory';
import { CLIENT_INTERESTS } from './client-interests';
import { whatsappNumber } from './phone';
import { teamSenderRole } from './outreach-content';
import { activityOpen, workActivity, activitySeconds, activityEmailTemplates, MISSED_EMAIL_GAP_MS, type WorkActivity } from './work-station-policy';
const obj = (x: unknown): Record<string, unknown> => x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {};
const json = (x: unknown) => JSON.parse(JSON.stringify(x)) as Prisma.InputJsonValue;
const terminal = ['COMPLETED', 'CANCELLED'];
function ticketIdOf(task:{recordType:string|null;recordId:number|null;followUpContext:unknown}){const c=obj(task.followUpContext);const id=Number(c.referenceId);return task.recordType==='support'?task.recordId:Number.isSafeInteger(id)&&id>0&&String(c.source||'').split(':')[0]==='ticket'&&String(c.source).split(':')[1]===String(id)?id:null;}
const ticketAccess = (a: Actor) => can(a, 'support.reply') || can(a, 'crm.outreach.manage');
const audit = (tx: Prisma.TransactionClient, a: Actor, action: string, entityId: string, detail: unknown) => tx.teamAudit.create({ data: { workspaceId: a.workspaceId, actorId: a.id, action, entityId, detail: json(detail) } });
async function primary(db: Pick<Prisma.TransactionClient, 'teamWorkspace'>, a: Actor) { if ((await db.teamWorkspace.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } }))?.id !== a.workspaceId)
    throw new TeamError('Customer support is handled in the primary HYMN workspace.', 403); }
async function ownTask(db: Pick<Prisma.TransactionClient, 'teamTask'>, a: Actor, id: string) { const task = await db.teamTask.findFirst({ where: { ...taskScope(a), id } }); if (!task)
    throw new TeamError('Activity not found.', 404); return task; }
async function contact(db: Pick<Prisma.TransactionClient, 'teamClient'>, a: Actor, id: string) { const row = await db.teamClient.findFirst({ where: { id, workspaceId: a.workspaceId, mergedIntoId: null } }); if (!row)
    throw new TeamError('Contact unavailable or merged. Open the retained contact.', 409); return row; }
const summarySelect = { id: true, title: true, description: true, ownerId: true, status: true, priority: true, dueAt: true, version: true, recordType: true, recordId: true, eventKey: true, clientId: true, followUpContext: true, checklist: true, approvalRequired: true, blocker: true, client: { select: { id: true, name: true, phone: true, email: true, interests: true, status: true } }, owner: { select: { id: true, user: { select: { name: true } }, jobTitle: true } } } satisfies Prisma.TeamTaskSelect;
export async function stationRead(a: Actor, resource: string, p: URLSearchParams) {
    demand(a, 'clients.view');
    if (resource === 'workstation-members') {
        demand(a, 'tasks.assign');
        return { items: await prisma.teamMember.findMany({ where: { workspaceId: a.workspaceId, status: 'ACTIVE', role: { owner: false }, user: { status: 'ACTIVE' } }, select: { id: true, jobTitle: true, user: { select: { name: true } } }, orderBy: { id: 'asc' }, take: 250 }) };
    }
    if (resource === 'workstation-contact') {
        const c = await contact(prisma, a, p.get('id') || '');
        return { id: c.id, name: c.name, email: c.email, phone: c.phone, interests: c.interests, status: c.status };
    }
    if (resource === 'workstation-activity') {
        const task = await ownTask(prisma, a, p.get('id') || '');
        if (task.ownerId !== a.id && !can(a, 'tasks.all'))
            throw new TeamError('Activity unavailable.', 403);
        const client = task.clientId ? await contact(prisma, a, task.clientId) : null;
        const ticketId = ticketIdOf(task);
        const ticket = ticketId && ticketAccess(a) ? (await primary(prisma, a), await prisma.supportTicket.findUnique({ where: { id: ticketId }, include: { replies: { orderBy: { createdAt: 'asc' } } } })) : null;
        const owner = await prisma.teamMember.findUnique({ where: { id: task.ownerId }, select: { jobTitle: true, user: { select: { name: true } } } });
        const reports = client ? await prisma.teamAudit.findMany({ where: { workspaceId: a.workspaceId, entityId: { in: [client.id, ...(await prisma.teamClient.findMany({ where: { workspaceId: a.workspaceId, mergedIntoId: client.id }, select: { id: true } })).map(c => c.id)] }, action: { in: ['contact.call_report', 'contact.activity_report'] } }, orderBy: { createdAt: 'desc' }, take: 15 }) : [];
        return { task: { ...task, owner }, activity: workActivity(task.followUpContext), client: client ? { id: client.id, name: client.name, email: client.email, phone: client.phone, interests: client.interests, status: client.status } : null, ticket, history: reports.map(r => ({ id: r.id, createdAt: r.createdAt, ...obj(r.detail) })) };
    }
    if (resource === 'workstation-tickets') {
        if (!ticketAccess(a))
            throw new TeamError('Support permission required.', 403);
        await primary(prisma, a);
        const offset = z.coerce.number().int().min(0).max(100000).catch(0).parse(p.get('offset') || 0);
        const where: Prisma.SupportTicketWhereInput = { status: { in: ['OPEN', 'IN_PROGRESS'] }, ...(p.get('q') ? { OR: [{ subject: { contains: p.get('q')!.slice(0, 160), mode: 'insensitive' } }, { user: { email: { contains: p.get('q')!.slice(0, 160), mode: 'insensitive' } } }] } : {}) };
        const [items, total] = await Promise.all([prisma.supportTicket.findMany({ where, include: { user: { select: { name: true, email: true, mobile: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: offset, take: 30 }), prisma.supportTicket.count({ where })]);
        return { items, total };
    }
    const { start, end, day } = indiaWorkday();
    const bucket = p.get('bucket') || 'today';
    const offset = z.coerce.number().int().min(0).max(100000).catch(0).parse(p.get('offset') || 0);
    const team = p.get('team') === '1' && can(a, 'tasks.all');
    const base: Prisma.TeamTaskWhereInput = { ...taskScope(a), ...(!team ? { ownerId: a.id } : {}) };
    const date: Prisma.TeamTaskWhereInput = bucket === 'upcoming' ? { dueAt: { gte: end } } : bucket === 'overdue' ? { dueAt: { lt: start } } : bucket === 'finished' ? {} : { OR: [{ dueAt: { lt: end } }, { dueAt: null }, { followUpContext: { path: ['workActivity', 'status'], equals: 'RUNNING' } }, { followUpContext: { path: ['workActivity', 'status'], equals: 'PAUSED' } }] };
    const where: Prisma.TeamTaskWhereInput = { ...base, ...date, status: bucket === 'finished' ? { in: terminal } : { notIn: terminal }, ...(p.get('q') ? { AND: [{ OR: [{ title: { contains: p.get('q')!.slice(0, 160), mode: 'insensitive' } }, { client: { name: { contains: p.get('q')!.slice(0, 160), mode: 'insensitive' } } }, {project:{title:{contains:p.get('q')!.slice(0,160),mode:'insensitive'}}}] }] } : {}) };
    const [items, total, active, counts] = await Promise.all([prisma.teamTask.findMany({ where, select: summarySelect, orderBy: [{ dueAt: 'asc' }, { id: 'asc' }], skip: offset, take: 30 }), prisma.teamTask.count({ where }), prisma.teamTask.findFirst({ where: { workspaceId: a.workspaceId, ownerId: a.id, archivedAt: null, status: { notIn: terminal }, OR: [{ followUpContext: { path: ['workActivity', 'status'], equals: 'RUNNING' } }, { followUpContext: { path: ['workActivity', 'status'], equals: 'PAUSED' } }] }, select: summarySelect }), prisma.teamTask.groupBy({ by: ['status'], where: { ...base, ...date }, _count: true })]);
    return { items, total, active, counts, day, canSupport: ticketAccess(a), canTeam: can(a, 'tasks.all') };
}
const startSchema = z.object({ requestKey: z.string().uuid(), taskId: z.string().optional(), clientId: z.string().optional(), ticketId: z.number().int().positive().optional(), kind: z.enum(['CALL', 'TASK', 'SUPPORT', 'QC']).default('CALL'), title: z.string().trim().min(3).max(180).default('Manual customer activity') });
async function startActivity(tx: Prisma.TransactionClient, a: Actor, input: unknown, now: Date) {
    demand(a, 'tasks.update');
    const data = startSchema.parse(input);
    const same = await tx.teamTask.findUnique({ where: { eventKey: `workstation-manual:${a.workspaceId}:${a.id}:${data.requestKey}` } });
    if (same)
        return { id: same.id };
    let task = data.taskId ? await ownTask(tx, a, data.taskId) : null;
    let client = data.clientId ? await contact(tx, a, data.clientId) : task?.clientId ? await contact(tx, a, task.clientId) : null;
    if (data.ticketId) {
        if (!ticketAccess(a))
            throw new TeamError('Support permission required.', 403);
        await primary(tx, a);
        const ticket = await tx.supportTicket.findUnique({ where: { id: data.ticketId }, include: { user: { select: { id: true, name: true, email: true, mobile: true, status: true } } } });
        if (!ticket || terminal.concat('CLOSED', 'RESOLVED').includes(ticket.status) || ticket.user.status !== 'ACTIVE')
            throw new TeamError('This ticket is closed or unavailable.', 409);
        client = await accountCard(tx, a, ticket.user);
        if (!client)
            throw new TeamError('Ticket customer belongs to another workspace.', 409);
        task = await tx.teamTask.findFirst({ where: { workspaceId: a.workspaceId, archivedAt: null, status: { notIn: terminal }, OR: [{ recordType: 'support', recordId: ticket.id }, { clientId: client.id, followUpContext: { path: ['referenceId'], equals: String(ticket.id) }, AND: [{ followUpContext: { path: ['source'], string_starts_with: `ticket:${ticket.id}` } }] }] } });
        if (!task) {
            const details = supportDetails(ticket.details);
            const callback = !!details.callbackRequestedAt && !['CONTACTED', 'CANCELLED'].includes(details.callbackStatus || '');
            task = await tx.teamTask.create({ data: { workspaceId: a.workspaceId, ownerId: a.id, creatorId: a.id, clientId: client.id, eventKey: `workstation-ticket:${a.workspaceId}:${ticket.id}:${data.requestKey}`, recordType: 'support', recordId: ticket.id, title: `Ticket #${ticket.id}: ${ticket.subject}`.slice(0, 180), description: ticket.message, priority: 'HIGH', dueAt: now, followUpContext: json({ kind: callback ? 'SUPPORT_CALLBACK' : 'SUPPORT', referenceId: String(ticket.id), source: `ticket:${ticket.id}:${details.callbackRequestedAt}`, callbackPhone: details.callbackPhone || ticket.user.mobile || client.phone }) } });
        }
    }
    if (!task) {
        demand(a, 'tasks.create');
        if (!client)
            throw new TeamError('Choose or create a contact before starting a manual activity.');
        task = await tx.teamTask.create({ data: { workspaceId: a.workspaceId, ownerId: a.id, creatorId: a.id, clientId: client.id, eventKey: `workstation-manual:${a.workspaceId}:${a.id}:${data.requestKey}`, title: data.title, dueAt: now, followUpContext: json({ kind: data.kind }) } });
    }
    if (task.ownerId !== a.id)
        throw new TeamError('This work belongs to another teammate. Ask a manager to reassign it.', 409);
    if (terminal.includes(task.status))
        throw new TeamError('This task is already closed.', 409);
    if (task.status === 'BLOCKED')
        throw new TeamError('This task needs supervisor review before restarting. Resolve its blocker first.', 409);
    let context = obj(task.followUpContext), existing = workActivity(context);
    if (existing && existing.status !== 'FINISHED')
        return { id: task.id };
    if (!client && task.clientId)
        client = await contact(tx, a, task.clientId);
    if (!client && task.recordType === 'release' && task.recordId) {
        const release = await tx.release.findUnique({ where: { id: task.recordId }, include: { user: { select: { id: true, name: true, email: true, mobile: true } } } });
        if (release)
            client = await accountCard(tx, a, release.user);
    }
    const crmTask = task.eventKey?.endsWith(':call') ? await tx.teamProspect.findFirst({ where: { workspaceId: a.workspaceId, id: task.eventKey.slice(0, -5) } }) : null;
    if (crmTask) {
        if (!crmTask.verified || crmTask.suppressed || !['CONSENTED', 'LEGITIMATE_INTEREST'].includes(crmTask.contactEligibility))
            throw new TeamError('Check the source and outreach eligibility before calling.', 403);
        const linkedId=crmTask.clientId||await linkProspectContact(tx,crmTask.id,a);if(!linkedId)throw new TeamError('Save a usable contact identity before starting this activity.');client=await contact(tx,a,linkedId);
    }
    const kind = task.recordType === 'release' ? 'QC' : task.recordType === 'support' || context.kind === 'SUPPORT_CALLBACK' ? 'SUPPORT' : crmTask || task.eventKey?.startsWith('support-call:') || context.kind === 'CALL' || context.kind === 'MANUAL' ? 'CALL' : data.taskId ? 'TASK' : data.kind;
    const isCall = kind === 'CALL' || kind === 'SUPPORT' && !!(context.kind === 'SUPPORT_CALLBACK');
    if (isCall) {
        demand(a, 'crm.outreach.manage');
        if (!client || client.status !== 'ACTIVE')
            throw new TeamError('Choose an active contact for this call.');
        const prospect = await tx.teamProspect.findFirst({ where: { clientId: client.id } });
        if (prospect?.suppressed)
            throw new TeamError('This contact has opted out. Do not call.', 403);
        if (kind === 'CALL' && prospect && (!prospect.verified || !['CONSENTED', 'LEGITIMATE_INTEREST'].includes(prospect.contactEligibility)))
            throw new TeamError('Check the contact source and outreach eligibility before calling.', 403);
        const email = client.email;
        if (email && await tx.newsletterSubscriber.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, OR: [{ unsubscribedAt: { not: null } }, { status: { not: 'subscribed' } }] } }))
            throw new TeamError('This contact has opted out of outreach.', 403);
    }
    const active = await tx.teamTask.findMany({ where: { workspaceId: a.workspaceId, archivedAt: null, status: { notIn: terminal }, OR: [{ ownerId: a.id }, ...(client ? [{ clientId: client.id }] : [])], followUpContext: { path: ['workActivity', 'status'], not: 'FINISHED' } }, select: { id: true, ownerId: true, followUpContext: true, clientId: true, title: true } });
    for (const other of active.filter(t => t.id !== task!.id && workActivity(t.followUpContext)?.status === 'RUNNING')) {
        throw new TeamError(other.ownerId === a.id ? 'Pause or finish your current activity before starting another.' : 'A teammate is already working with this contact. Review the active work before calling.', 409);
    }
    const activity: WorkActivity = { id: randomUUID(), kind, memberId: a.id, startedAt: now.toISOString(), lastSavedAt: now.toISOString(), status: 'RUNNING', pausedMs: 0, notes: '', needs: '', commitments: '', nextAction: '', services: client?.interests || [], clientInterests: client?.interests || [], checklist: (Array.isArray(task.checklist) ? task.checklist : []).map(item => !!obj(item).done) };
    await tx.teamTask.update({ where: { id: task.id }, data: { status: 'IN_PROGRESS', ...(client ? { clientId: client.id } : {}), followUpContext: json({ ...context, workActivity: activity }), version: { increment: 1 } } });
    await audit(tx, a, 'workstation.started', task.id, { title: task.title, clientId: client?.id, kind, activityId: activity.id });
    return { id: task.id };
}
const draft = z.object({ notes: z.string().max(10000), needs: z.string().max(2000).default(''), commitments: z.string().max(2000).default(''), nextAction: z.string().max(2000).default(''), services: z.array(z.enum(Object.keys(CLIENT_INTERESTS) as [
        keyof typeof CLIENT_INTERESTS,
        ...(keyof typeof CLIENT_INTERESTS)[]
    ])).max(7), checklist: z.array(z.boolean()).max(100) });
const change = z.object({ id: z.string().min(1), activityId: z.string().uuid(), version: z.number().int().positive(), draft: draft.optional() });
async function queueActivityMail(tx: Prisma.TransactionClient, a: Actor, task: {
    id: string;
    clientId: string | null;
    recordType: string | null;
    recordId: number | null;
    followUpContext: unknown;
}, kind: keyof typeof activityEmailTemplates, requestKey: string, now: Date, body?: string, subject?: string) {
    if (!task.clientId)
        return { status: 'SKIPPED', reason: 'No contact is linked.' };
    const client = await contact(tx, a, task.clientId);
    if (client.status !== 'ACTIVE')
        return { status: 'SKIPPED', reason: 'Contact is not eligible for email.' };
    const context = obj(task.followUpContext);
    const ticketId = ticketIdOf(task);
    const member = await tx.teamMember.findUniqueOrThrow({ where: { id: a.id }, include: { user: { select: { name: true } }, role: true } });
    const cutoff = new Date(now.getTime() - MISSED_EMAIL_GAP_MS);
    if (kind === 'missed-call' && await tx.teamAudit.findFirst({ where: { workspaceId: a.workspaceId, entityId: client.id, action: 'workstation.missed_email', createdAt: { gt: cutoff } } }))
        return { status: 'SUPPRESSED', reason: 'A missed-call email was already queued within the last two hours.' };
    const model = activityEmailTemplates[kind];
    const text = body || model.body;
    const title = subject || model.subject;
    let job: {
        id: string;
        status: string;
    };
    if (ticketId) {
        if (!ticketAccess(a))
            throw new TeamError('Support permission required.', 403);
        await primary(tx, a);
        const ticket = await tx.supportTicket.findUniqueOrThrow({ where: { id: ticketId }, include: { user: { select: { email: true } } } });
        const details = supportDetails(ticket.details);
        const recipient = z.string().email().safeParse(details.email || ticket.user.email);
        if (!recipient.success)
            return { status: 'SKIPPED', reason: 'No valid customer email.' };
        const prior = await tx.supportReply.findUnique({ where: { requestKey } });
        if (prior && (prior.ticketId !== ticketId || prior.authorId !== a.userId || prior.body !== text || prior.subject !== title))
            throw new TeamError('Email request changed. Review and send as a new request.', 409);
        job = await tx.supportReply.upsert({ where: { requestKey }, create: { ticketId, authorId: a.userId, requestKey, kind: kind === 'missed-call' ? 'missed-call' : 'solution', recipient: recipient.data, subject: title, body: text }, update: {} });
    }
    else {
        const email = client.email.toLowerCase();
        if (!z.string().email().safeParse(email).success)
            return { status: 'SKIPPED', reason: 'No valid contact email.' };
        if (await tx.teamOutreachSuppression.findUnique({ where: { email } }) || await tx.newsletterSubscriber.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, OR: [{ unsubscribedAt: { not: null } }, { status: { not: 'subscribed' } }] } }) || await tx.teamProspect.findFirst({ where: { clientId: client.id, OR: [{ suppressed: true }, { verified: false }, { contactEligibility: { notIn: ['CONSENTED', 'LEGITIMATE_INTEREST'] } }] } }))
            return { status: 'SKIPPED', reason: 'Email preferences or verification prevent outreach.' };
        job = await tx.teamOutreachEmail.upsert({ where: { requestKey }, create: { requestKey, workspaceId: a.workspaceId, memberId: a.id, clientId: client.id, recipient: email, senderName: member.user.name, senderRole: teamSenderRole(member), template: `activity-${kind}`, subject: title, body: text }, update: {} });
    }
    await audit(tx, a, kind === 'missed-call' ? 'workstation.missed_email' : 'workstation.email_queued', client.id, { taskId: task.id, kind, jobId: job.id });
    return { ...job, channel: ticketId ? 'support' : 'outreach' };
}
export async function stationMutation(tx: Prisma.TransactionClient, a: Actor, resource: string, input: unknown, now = new Date()) {
    if(resource==='workstation-personal-plan')return (await import('./personal-call-plan')).savePersonalCallPlan(tx,a,input);
    if (resource === 'workstation-start')
        return startActivity(tx, a, input, now);
    if (resource === 'workstation-release') {
        demand(a, 'tasks.assign');
        const d = z.object({ id: z.string(), version: z.number().int(), reason: z.string().trim().min(10).max(2000) }).parse(input);
        const t = await ownTask(tx, a, d.id);
        if (t.version !== d.version)
            throw new TeamError('Activity changed. Reload before releasing it.', 409);
        const activity = workActivity(t.followUpContext);
        if (!activity || activity.status === 'FINISHED')
            throw new TeamError('No reserved activity to release.', 409);
        await tx.teamTask.update({ where: { id: t.id }, data: { followUpContext: json({ ...obj(t.followUpContext), workActivity: { ...activity, status: 'FINISHED', endedAt: now.toISOString(), outcome: 'BLOCKED' } }), version: { increment: 1 } } });
        await audit(tx, a, 'workstation.released', t.id, { clientId: t.clientId, reason: d.reason, activityId: activity.id, accountable: activity.memberId, draft: activity });
        return { id: t.id };
    }
    demand(a, 'tasks.update');
    const data = change.parse(input);
    let task = await ownTask(tx, a, data.id);
    let activity = workActivity(task.followUpContext);
    if (task.ownerId !== a.id || activity?.memberId !== a.id || activity.id !== data.activityId)
        throw new TeamError('Only the accountable teammate can update this activity.', 403);
    if (terminal.includes(task.status) && resource !== 'workstation-finish' && resource !== 'workstation-pause')
        throw new TeamError('The source task is closed. Save your final report or pause and close.', 409);
    if (activity.status === 'FINISHED') {
        if (resource === 'workstation-finish')
            return { id: task.id, completed: true };
        throw new TeamError('This activity is finished.', 409);
    }
    if (task.version !== data.version)
        throw new TeamError('Activity changed in another tab. Reload it before saving; your local draft is retained.', 409);
    if (data.draft) {
        if (data.draft.checklist.length !== (Array.isArray(task.checklist) ? task.checklist.length : 0))
            throw new TeamError('Task checklist changed. Reload the activity.', 409);
        activity = { ...activity, ...data.draft };
    }
    activity.lastSavedAt = now.toISOString();
    const context = obj(task.followUpContext);
    if (resource === 'workstation-pause') {
        if (activity.status === 'RUNNING') {
            activity.status = 'PAUSED';
            activity.pausedAt = now.toISOString();
        }
    }
    else if (resource === 'workstation-resume') {
        if (activity.status === 'PAUSED') {
            const running = await tx.teamTask.findFirst({ where: { workspaceId: a.workspaceId, id: { not: task.id }, archivedAt: null, status: { notIn: terminal }, OR: [{ ownerId: a.id }, ...(task.clientId ? [{ clientId: task.clientId }] : [])], followUpContext: { path: ['workActivity', 'status'], equals: 'RUNNING' } } });
            if (running)
                throw new TeamError('Another activity is running for this teammate or contact. Pause it before resuming.', 409);
            activity.pausedMs += Math.max(0, now.getTime() - Date.parse(activity.pausedAt!));
            delete activity.pausedAt;
            activity.status = 'RUNNING';
        }
    }
    else if (resource === 'workstation-finish') {
        demand(a, 'tasks.complete');
        const result = z.object({ outcome: z.enum(['COMPLETED', 'FOLLOW_UP', 'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'DO_NOT_CONTACT', 'BLOCKED']), nextAt: z.string().datetime({ offset: true }).optional(), closeTicket: z.boolean().default(false) }).parse(input);
        const noContact = ['NO_ANSWER', 'BUSY', 'WRONG_NUMBER'].includes(result.outcome);
        if (!noContact && activity.notes.trim().length < 10)
            throw new TeamError('Add a brief report of what happened (at least 10 characters).');
        const calling = !result.closeTicket && ['CALL', 'SUPPORT'].includes(activity.kind) && (activity.kind === 'CALL' || context.kind === 'SUPPORT_CALLBACK');
        if (!terminal.includes(task.status) && calling && ['COMPLETED', 'NO_ANSWER', 'BUSY', 'FOLLOW_UP'].includes(result.outcome) && !whatsappNumber(String(context.callbackPhone || context.callPhone || (task.clientId ? (await contact(tx, a, task.clientId)).phone : ''))))
            throw new TeamError('Request a usable phone number before recording a call. You can save a blocked report meanwhile.');
        if (['NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'DO_NOT_CONTACT'].includes(result.outcome) && !calling)
            throw new TeamError('Use call outcomes only for call activities.');
        if (result.outcome === 'COMPLETED' && !terminal.includes(task.status))
            await assertDailyTaskChange(tx, a, task, { status: 'COMPLETED' });
        if (result.outcome === 'COMPLETED' && !terminal.includes(task.status) && (!activity.checklist.every(Boolean) || await tx.teamTask.count({ where: { workspaceId: a.workspaceId, id: { in: task.dependencyIds }, status: 'COMPLETED' } }) !== task.dependencyIds.length))
            throw new TeamError('Complete task dependencies and checklist before marking the work completed.');
        if (result.nextAt && new Date(result.nextAt) <= now)
            throw new TeamError('Choose a future follow-up time.');
        const report = result.outcome === 'NO_ANSWER' ? 'Call not answered.' : result.outcome === 'BUSY' ? 'Customer was busy.' : result.outcome === 'WRONG_NUMBER' ? 'Wrong number reported; verify contact details before retrying.' : activity.notes.trim();
        activity = { ...activity, ...(noContact ? { notes: report, needs: '', commitments: '', nextAction: '', services: [] } : {}), status: 'FINISHED', endedAt: now.toISOString(), outcome: result.outcome };
        let status = task.status, dueAt = task.dueAt, blocker = '';
        if (terminal.includes(task.status)) {
            status = task.status;
            blocker = task.blocker;
        }
        else if (calling && ['COMPLETED', 'NO_ANSWER', 'BUSY', 'FOLLOW_UP', 'DO_NOT_CONTACT'].includes(result.outcome)) {
            const mapped = result.outcome === 'COMPLETED' ? 'TALKED' : result.outcome === 'BUSY' ? 'NO_ANSWER' : result.outcome === 'FOLLOW_UP' ? (result.nextAt ? 'CALLBACK' : 'INTERESTED') : result.outcome;
            task = await recordCallbackOutcome(tx, a, { id: task.id, version: task.version, outcome: mapped, notes: activity.notes.slice(0, 2000), ...(result.nextAt ? { nextAt: result.nextAt } : {}) }, now, { queueEmail: false, workStation: true });
            status = result.outcome==='COMPLETED'&&task.approvalRequired?'IN_REVIEW':task.status;
            dueAt = task.dueAt;
            blocker = task.blocker;
        }
        else if (result.outcome === 'WRONG_NUMBER' || result.outcome === 'BLOCKED') {
            if (result.outcome === 'WRONG_NUMBER' && result.nextAt) {
                const desired = new Date(result.nextAt);
                const slot = await employeeCallSlot(tx, a.workspaceId, a.id, desired, undefined, task.id, 'tasks.update');
                if (slot?.getTime() === desired.getTime()) {
                    status = 'TODO';
                    dueAt = slot;
                    blocker = 'Verify or correct the contact number before this scheduled attempt. Wrong numbers are never auto-retried.';
                } else {
                    status = 'BLOCKED';
                    dueAt = slot;
                    blocker = 'Requested retry time is unavailable. Verify the contact number and ask a supervisor to schedule coverage.';
                }
            } else {
                status = 'BLOCKED';
                blocker = activity.notes.slice(0, 2000);
            }
        }
        else if (result.outcome === 'FOLLOW_UP') {
            const desired = result.nextAt ? new Date(result.nextAt) : new Date(now.getTime() + 86400000);
            dueAt = await employeeCallSlot(tx, a.workspaceId, a.id, desired, undefined, task.id, 'tasks.update');
            if (result.nextAt && dueAt?.getTime() !== desired.getTime())
                dueAt = null;
            status = dueAt ? 'TODO' : 'BLOCKED';
            blocker = dueAt ? '' : 'No available working-hours slot. Supervisor coverage is required.';
        }
        else {
            if (task.eventKey?.startsWith('auto-source:'))
                throw new TeamError('Save the linked source decision before completing this activity. Use the source tools in this wizard.');
            const review = task.approvalRequired || !!task.recordType && task.recordType !== 'support';
            status = review ? 'IN_REVIEW' : 'COMPLETED';
            assertTaskTransition({ previous: task.status, next: status, review: !!review, evidence: activity.notes, blocker: '', dependenciesComplete: await tx.teamTask.count({ where: { workspaceId: a.workspaceId, id: { in: task.dependencyIds }, status: 'COMPLETED' } }) === task.dependencyIds.length, checklistComplete: activity.checklist.every(Boolean), reviewer: can(a, 'tasks.approve'), authorIsOwner: true });
        }
        if (result.closeTicket) {
            if (status !== 'COMPLETED')
                throw new TeamError('Finish required review before closing this ticket.');
            if (!ticketAccess(a))
                throw new TeamError('Support permission required.', 403);
            await primary(tx, a);
            const ticketId = ticketIdOf(task);
            if (!ticketId || result.outcome !== 'COMPLETED')
                throw new TeamError('Complete the support activity before closing its ticket.');
            await tx.supportTicket.update({ where: { id: ticketId }, data: { status: 'CLOSED' } });
            await tx.adminTask.updateMany({ where: { eventKey: `support:${ticketId}:open`, status: { not: 'resolved' } }, data: { status: 'resolved', resolutionNote: 'Closed in Team Work-station.', resolvedAt: now } });
            await audit(tx, a, 'workstation.ticket_closed', String(ticketId), { clientId: task.clientId, notes: activity.notes });
        }
        if (calling && task.clientId && ['COMPLETED', 'FOLLOW_UP'].includes(result.outcome) && can(a, 'crm.prospects.view')) {
            const prospect = await tx.teamProspect.findFirst({ where: { workspaceId: a.workspaceId, clientId: task.clientId, ...(!can(a, 'crm.all') ? { ownerId: a.id } : {}) } });
            if (prospect && prospect.verified && !prospect.suppressed && ['CONSENTED', 'LEGITIMATE_INTEREST'].includes(prospect.contactEligibility)) {
                await teamMutationTx(tx, a, 'prospect-call-save', { id: prospect.id, version: prospect.version, stage: ['NEW', 'NEEDS_RESEARCH', 'READY_TO_CONTACT', 'ASSIGNED', 'QUALIFIED'].includes(prospect.stage) ? 'CONTACTED' : prospect.stage, contact: { body: activity.notes.slice(0, 4000), evidence: `Work-station activity ${activity.id}` }, followUpAt: status === 'TODO' ? dueAt?.toISOString() : null });
            }
        }
        const updated = await tx.teamTask.update({ where: { id: task.id }, data: { status, dueAt, blocker, evidence: activity.notes, completedAt: status === 'COMPLETED' ? now : null, checklist: json((Array.isArray(task.checklist) ? task.checklist : []).map((item, i) => ({ ...obj(item), done: activity!.checklist[i] }))), followUpContext: json({ ...obj(task.followUpContext), workActivity: activity }), version: { increment: 1 } } });
        const member = await tx.teamMember.findUniqueOrThrow({ where: { id: a.id }, include: { user: { select: { name: true } } } });
        await audit(tx, a, calling ? 'contact.call_report' : 'contact.activity_report', task.clientId || task.id, { activityId: activity.id, taskId: task.id, contactName: task.title, occurredAt: activity.startedAt, endedAt: activity.endedAt, elapsedSeconds: activitySeconds(activity), authorName: member.user.name, authorRole: member.jobTitle, memberId: a.id, source: calling ? 'PERSONAL_PHONE' : 'WORK_STATION', outcome: calling && result.outcome === 'COMPLETED' ? 'TALKED' : result.outcome, discussion: activity.notes, needs: activity.needs, commitments: activity.commitments, nextAction: activity.nextAction, services: activity.services, nextAt: dueAt?.toISOString(), status });
        if (task.clientId) {
            const current = await contact(tx, a, task.clientId);
            const initial = activity.clientInterests || [];
            const interests = [...new Set([...current.interests.filter(v => !initial.includes(v) || activity!.services.includes(v)), ...activity.services])];
            await tx.teamClient.update({ where: { id: task.clientId }, data: { interests, version: { increment: 1 } } });
        }
        if (calling)
            await syncCallbackCalendar(tx, a, updated);
        else {const event=await tx.teamCalendarEvent.findUnique({where:{followUpTaskId:updated.id}});if(event){const closed=['COMPLETED','CANCELLED','BLOCKED','IN_REVIEW'].includes(updated.status);const startsAt=updated.dueAt||event.startsAt;const changed=await tx.teamCalendarEvent.update({where:{id:event.id},data:{startsAt,endsAt:new Date(startsAt.getTime()+1800000),status:updated.status==='COMPLETED'?'COMPLETED':closed?'CANCELLED':'SCHEDULED',version:{increment:1},scheduleRevision:{increment:1}}});await (await import('./appointments')).queueAppointment(tx,changed,now);}}
        if (status === 'IN_REVIEW' && task.status !== 'IN_REVIEW') {
            const reviewers = await tx.teamMember.findMany({ where: { workspaceId: a.workspaceId, status: 'ACTIVE', id: { not: a.id }, OR: [{ role: { owner: true } }, { role: { permissions: { has: 'tasks.approve' } } }] }, select: { id: true } });
            for (const reviewer of reviewers)
                await tx.teamNotification.create({ data: { memberId: reviewer.id, title: `Review requested: ${task.title}`, href: `/team?workspace=${a.workspaceId}&module=approvals&task=${task.id}` } });
        }
        if (status === 'COMPLETED' && task.recurrenceDays && !(await tx.teamMember.findUniqueOrThrow({ where: { id: task.ownerId }, include: { role: true } })).role.owner) {
            const eventKey = `${task.id}:recurrence`;
            await tx.teamTask.upsert({ where: { eventKey }, update: {}, create: { workspaceId: a.workspaceId, creatorId: a.id, ownerId: task.ownerId, projectId: task.projectId, clientId: task.clientId, title: task.title, description: task.description, priority: task.priority, approvalRequired: task.approvalRequired, recordType: task.recordType, recordId: task.recordId, recurrenceDays: task.recurrenceDays, dueAt: new Date((dueAt?.getTime() || now.getTime()) + task.recurrenceDays * 86400000), eventKey, checklist: json((Array.isArray(task.checklist) ? task.checklist : []).map(c => ({ ...obj(c), done: false }))) } });
        }
        const email = ['NO_ANSWER', 'BUSY'].includes(result.outcome) ? await queueActivityMail(tx, a, updated, 'missed-call', `workstation-missed:${activity.id}`, now) : null;
        return { id: task.id, completed: true, status, nextAt: dueAt, email };
    }
    else if (resource !== 'workstation-save')
        throw new TeamError('Unknown activity action.', 404);
    await tx.teamTask.update({ where: { id: task.id }, data: { followUpContext: json({ ...context, workActivity: activity }), version: { increment: 1 } } });
    if (resource !== 'workstation-save')
        await audit(tx, a, resource === 'workstation-pause' ? 'workstation.paused' : 'workstation.resumed', task.id, { clientId: task.clientId, activityId: activity.id });
    return { id: task.id };
}
export async function stationEmail(tx: Prisma.TransactionClient, a: Actor, input: unknown, now = new Date()) {
    const data = z.object({ id: z.string(), activityId: z.string().uuid(), requestKey: z.string().uuid(), kind: z.enum(['phone-request', 'solution', 'missed-call']), subject: z.string().trim().min(3).max(200).regex(/^[^\r\n]+$/), body: z.string().trim().min(10).max(8000), reviewed: z.literal(true) }).parse(input);
    const task = await ownTask(tx, a, data.id), activity = workActivity(task.followUpContext);
    if (task.ownerId !== a.id || activity?.id !== data.activityId || activity.status === 'FINISHED')
        throw new TeamError('Open your own active activity before sending.', 403);
    if (!ticketAccess(a) || !ticketIdOf(task))
        throw new TeamError('This template is only for an assigned support ticket.', 403);
    if (/\[Add the actual|{{|}}/.test(data.body))
        throw new TeamError('Replace template placeholders with the actual solution.');
    if (data.kind === 'missed-call')
        throw new TeamError('Finish a real unanswered call to queue its missed-call message.');
    return queueActivityMail(tx, a, task, data.kind, `workstation-mail:${a.workspaceId}:${a.id}:${data.activityId}:${data.requestKey}`, now, data.body, data.subject);
}
/** Bounded, cursor-based routing. No calls or customer emails are made by intake. */
export async function syncWorkStationTickets(tx: Prisma.TransactionClient, a: Actor, now = new Date()) {
    const first = await tx.teamWorkspace.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (first?.id !== a.workspaceId)
        return { created: 0 };
    const workspace = await tx.teamWorkspace.findUniqueOrThrow({ where: { id: a.workspaceId } });
    const cursor = obj(workspace.customerFollowupCursor);
    const tickets = await tx.supportTicket.findMany({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, user: { status: 'ACTIVE' } }, include: { user: { select: { id: true, name: true, email: true, mobile: true } } }, orderBy: { id: 'asc' }, take: 20, ...(typeof cursor.stationTicket === 'number' ? { cursor: { id: cursor.stationTicket }, skip: 1 } : {}) });
    const members = (await tx.teamMember.findMany({ where: { workspaceId: a.workspaceId, status: 'ACTIVE', availability: 'AVAILABLE', role: { owner: false }, user: { status: 'ACTIVE' } }, include: { role: true }, orderBy: { id: 'asc' } })).filter(m => ticketAccess(m) && can(m, 'tasks.update') && can(m, 'tasks.complete'));
    const loads = await tx.teamTask.groupBy({ by: ['ownerId'], where: { workspaceId: a.workspaceId, archivedAt: null, status: { notIn: terminal } }, _count: true });
    const load = new Map(loads.map(x => [x.ownerId, x._count]));
    let created = 0;
    const deadline = Date.now() + 12000;
    for (const ticket of tickets) {
        if (Date.now() > deadline)
            break;
        cursor.stationTicket = ticket.id;
        const details = supportDetails(ticket.details), callback = !!details.callbackRequestedAt && !['CONTACTED', 'CANCELLED'].includes(details.callbackStatus || '');
        const eventKey = `workstation-ticket:${a.workspaceId}:${ticket.id}:${details.callbackRequestedAt || 'support'}`;
        if (await tx.teamTask.findUnique({ where: { eventKey } }))
            continue;
        if (await tx.teamTask.findFirst({ where: { workspaceId: a.workspaceId, archivedAt: null, ...(callback ? { status: { notIn: terminal } } : {}), OR: [{ recordType: 'support', recordId: ticket.id }, { followUpContext: { path: ['referenceId'], equals: String(ticket.id) }, AND: [{ followUpContext: { path: ['source'], string_starts_with: `ticket:${ticket.id}` } }] }] } }))
            continue;
        const ranked = members.filter(m => !callback || can(m, 'crm.outreach.manage')).sort((l, r) => (load.get(l.id) || 0) - (load.get(r.id) || 0));
        let assignment: {
            id: string;
            dueAt: Date;
        } | null = null;
        for (const m of ranked) {
            const dueAt = await employeeCallSlot(tx, a.workspaceId, m.id, now, undefined, undefined, callback ? 'crm.outreach.manage' : 'tasks.update');
            if (dueAt) {
                assignment = { id: m.id, dueAt };
                break;
            }
        }
        if (!assignment)
            continue; // Remains visible in Customer tickets; next cursor sweep retries coverage.
        const client = await accountCard(tx, a, ticket.user);
        if (!client)
            continue;
        const task = await tx.teamTask.create({ data: { workspaceId: a.workspaceId, creatorId: a.id, ownerId: assignment.id, clientId: client.id, eventKey, recordType: 'support', recordId: ticket.id, title: `Ticket #${ticket.id}: ${ticket.subject}`.slice(0, 180), description: ticket.message, dueAt: assignment.dueAt, priority: 'HIGH', followUpContext: json({ kind: callback ? 'SUPPORT_CALLBACK' : 'SUPPORT', referenceId: String(ticket.id), source: `ticket:${ticket.id}:${details.callbackRequestedAt}`, callbackPhone: details.callbackPhone || ticket.user.mobile || client.phone }) } });
        load.set(assignment.id, (load.get(assignment.id) || 0) + 1);
        created++;
        if (callback)
            await tx.supportTicket.update({ where: { id: ticket.id }, data: { details: json({ ...details, callbackStatus: 'ASSIGNED' }) } });
        await tx.teamNotification.create({ data: { memberId: assignment.id, title: `Assigned: ${task.title}`, href: `/team?workspace=${a.workspaceId}&module=work-station&task=${task.id}` } });
        await audit(tx, a, 'workstation.ticket_routed', task.id, { ticketId: ticket.id, ownerId: assignment.id, clientId: client.id });
    }
    if (!tickets.length)
        delete cursor.stationTicket;
    await tx.teamWorkspace.update({ where: { id: a.workspaceId }, data: { customerFollowupCursor: json(cursor) } });
    return { created };
}
/** Only repair missing-coverage retries; explicit times, wrong numbers and attempt limits require people. */
export async function recoverWorkStationCoverage(tx: Prisma.TransactionClient, a: Actor, now = new Date()) {
    const rows = await tx.teamTask.findMany({ where: { workspaceId: a.workspaceId, archivedAt: null, status: 'BLOCKED', followUpContext: { path: ['workActivity', 'status'], equals: 'FINISHED' }, OR: [{ blocker: { startsWith: 'Outcome saved. No declared free time' } }, { blocker: { startsWith: 'No available working-hours slot' } }] }, orderBy: { updatedAt: 'asc' }, take: 10 });
    let recovered = 0;
    for (const task of rows) {
        const context = obj(task.followUpContext);
        if (Number(context.noAnswerAttempts || 0) >= 3)
            continue;
        const activity = workActivity(context);
        if (!activity || !['NO_ANSWER', 'BUSY', 'FOLLOW_UP'].includes(activity.outcome || ''))
            continue;
        const calling = activity.kind === 'CALL' || context.kind === 'SUPPORT_CALLBACK';
        if (calling && (!task.clientId || (await contact(tx, a, task.clientId)).status !== 'ACTIVE'))
            continue;
        const dueAt = await employeeCallSlot(tx, a.workspaceId, task.ownerId, now, undefined, task.id, calling ? 'crm.outreach.manage' : 'tasks.update');
        if (!dueAt)
            continue;
        const updated = await tx.teamTask.update({ where: { id: task.id }, data: { status: 'TODO', dueAt, blocker: '', version: { increment: 1 } } });
        if (calling)
            await syncCallbackCalendar(tx, a, updated);
        else {const event=await tx.teamCalendarEvent.findUnique({where:{followUpTaskId:updated.id}});if(event){const closed=['COMPLETED','CANCELLED','BLOCKED','IN_REVIEW'].includes(updated.status);const startsAt=updated.dueAt||event.startsAt;const changed=await tx.teamCalendarEvent.update({where:{id:event.id},data:{startsAt,endsAt:new Date(startsAt.getTime()+1800000),status:updated.status==='COMPLETED'?'COMPLETED':closed?'CANCELLED':'SCHEDULED',version:{increment:1},scheduleRevision:{increment:1}}});await (await import('./appointments')).queueAppointment(tx,changed,now);}}
        await audit(tx, a, 'workstation.coverage_recovered', task.id, { clientId: task.clientId, dueAt: dueAt.toISOString(), ownerId: task.ownerId });
        await tx.teamNotification.create({ data: { memberId: task.ownerId, title: `Working-hours retry scheduled: ${task.title}`, href: `/team?workspace=${a.workspaceId}&module=work-station&task=${task.id}` } });
        recovered++;
    }
    return { recovered };
}
