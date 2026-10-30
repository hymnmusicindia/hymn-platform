import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { teamMutation, teamRead, teamWrite } from '../lib/team/service';
import {savePersonalCallPlan,syncPersonalCallPlans} from '../lib/team/personal-call-plan';
import {employeeCallSlot} from '../lib/team/availability';
import {indiaWorkday} from '../lib/team/daily-work';
import { syncWorkStationTickets, recoverWorkStationCoverage } from '../lib/team/work-station';
import { activitySeconds, workActivity } from '../lib/team/work-station-policy';
import type { Actor } from '../lib/team/policy';
async function main() {
    assert.equal(process.env.DATABASE_URL, 'postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture');
    const ws = await prisma.teamWorkspace.create({ data: { name: 'Work-station fixture', clientCardsImportedAt: new Date() } });
    async function member(name: string, permissions: string[], owner = false) { const role = await prisma.teamRole.create({ data: { workspaceId: ws.id, name, permissions, owner } }); const user = await prisma.user.create({ data: { name, email: `${randomUUID()}@station.fixture.invalid`, googleId: randomUUID() } }); return prisma.teamMember.create({ data: { workspaceId: ws.id, userId: user.id, roleId: role.id, jobTitle: 'Call representative' }, include: { role: true } }); }
    const perms = ['tasks.update', 'tasks.create', 'tasks.complete', 'crm.outreach.manage', 'crm.prospects.view', 'support.reply', 'calendar.manage'];
    const rep = await member('Kira', perms), other = await member('Other', perms), boss = await member('Aditya', [], true), viewer = await member('Viewer', []);
    const client = await prisma.teamClient.create({ data: { workspaceId: ws.id, ownerId: rep.id, name: 'Customer', phone: '+919876543210', email: 'customer@station.fixture.invalid', notes: 'PRIVATE CONTACT NOTE' } });
    const draft = { notes: 'Discussed the release requirements and next steps.', needs: 'Distribution', commitments: 'Send checklist', nextAction: 'Follow up tomorrow', services: ['DISTRIBUTION'], checklist: [] };
    const task = await prisma.teamTask.create({ data: { workspaceId: ws.id, ownerId: rep.id, creatorId: boss.id, clientId: client.id, title: 'Call customer', dueAt: new Date(), followUpContext: { kind: 'CALL' } } });
    async function detail(id: string, a: Actor = rep) { return teamRead(a, 'workstation-activity', new URLSearchParams({ id })); }
    async function write(resource: string, id: string, extra: Record<string, unknown> = {}, a: Actor = rep) { const d = await detail(id, a); return teamMutation(a, resource, { id, activityId: d.activity!.id, version: d.task.version, draft, ...extra }); }
    const key = randomUUID();
    const start = await teamMutation(rep, 'workstation-start', { taskId: task.id, requestKey: key });
    assert.equal(start.id, task.id);
    await assert.rejects(teamMutation(viewer, 'workstation-start', { taskId: task.id, requestKey: randomUUID() }), /permission/);
    assert.ok(!JSON.stringify(await detail(task.id)).includes('PRIVATE CONTACT NOTE'));
    await assert.rejects(detail(task.id, other), /unavailable|not found/i);
    const competing = await prisma.teamTask.create({ data: { workspaceId: ws.id, ownerId: other.id, creatorId: boss.id, clientId: client.id, title: 'Same customer' } });
    await assert.rejects(teamMutation(other, 'workstation-start', { taskId: competing.id, requestKey: randomUUID() }), /teammate.*already/);
    const stale = await detail(task.id);
    await write('workstation-save', task.id);
    await assert.rejects(teamMutation(rep, 'workstation-save', { id: task.id, activityId: stale.activity!.id, version: stale.task.version, draft }), /changed/);
    assert.equal((await detail(task.id)).activity!.notes, draft.notes);
    await write('workstation-pause', task.id);
    assert.equal((await detail(task.id)).activity!.status, 'PAUSED');
    await teamMutation(other, 'workstation-start', { taskId: competing.id, requestKey: randomUUID() });
    await assert.rejects(write('workstation-resume', task.id), /Another activity/);
    await write('workstation-pause', competing.id, {}, other);
    await write('workstation-resume', task.id);
    await assert.rejects(teamMutation(rep, 'task-update', { id: task.id, version: (await detail(task.id)).task.version, status: 'COMPLETED' }), /release.*activity/);
    // Three real attempts schedule twice, then surface a supervisor exception. No SMTP invoked.
    for (let attempt = 1; attempt <= 3; attempt++) {
        if (attempt > 1)
            await teamMutation(rep, 'workstation-start', { taskId: task.id, requestKey: randomUUID() });
        const finished = await write('workstation-finish', task.id, { outcome: 'NO_ANSWER' });
        assert.equal(finished.status, attempt === 3 ? 'BLOCKED' : 'TODO');
        if (attempt < 3)
            assert.ok(finished.nextAt);
    }
    assert.equal(await prisma.teamOutreachEmail.count({ where: { clientId: client.id, template: 'activity-missed-call' } }), 1);
    assert.equal(await prisma.teamAudit.count({ where: { entityId: client.id, action: 'contact.call_report' } }), 3);
    // Retry after two hours permits another truthful message for a separate attempt.
    await prisma.teamAudit.updateMany({ where: { entityId: client.id, action: 'workstation.missed_email' }, data: { createdAt: new Date(Date.now() - 7200001) } });
    const retry = await prisma.teamTask.create({ data: { workspaceId: ws.id, ownerId: rep.id, creatorId: boss.id, clientId: client.id, title: 'Later customer call', followUpContext: { kind: 'CALL' } } });
    await teamMutation(rep, 'workstation-start', { taskId: retry.id, requestKey: randomUUID() });
    await write('workstation-finish', retry.id, { outcome: 'NO_ANSWER' });
    assert.equal(await prisma.teamOutreachEmail.count({ where: { clientId: client.id, template: 'activity-missed-call' } }), 2);
    const customer = await prisma.user.create({ data: { name: 'Ticket customer', email: 'ticket@station.fixture.invalid', googleId: randomUUID() } });
    const ticket = await prisma.supportTicket.create({ data: { userId: customer.id, subject: 'Need help with release', message: 'Please call me about my release.', details: { callbackRequestedAt: new Date().toISOString(), callbackStatus: 'REQUESTED' } } });
    const ticketTask = await teamMutation(rep, 'workstation-start', { ticketId: ticket.id, requestKey: randomUUID() });
    await assert.rejects(write('workstation-finish', ticketTask.id, { outcome: 'NO_ANSWER' }), /usable phone/);
    const d = await detail(ticketTask.id);
    const mail = { id: ticketTask.id, activityId: d.activity!.id, requestKey: randomUUID(), kind: 'phone-request', subject: 'Your HYMN callback', body: 'Please reply with your phone number including country code.', reviewed: true };
    const job = await teamMutation(rep, 'workstation-email', mail);
    assert.equal(job.status, 'QUEUED');
    assert.equal((await teamMutation(rep, 'workstation-email', mail)).id, job.id);
    await assert.rejects(teamMutation(rep, 'workstation-email', { ...mail, body: 'Different message for the same request key.' }), /request changed/);
    assert.equal((await prisma.supportReply.findUniqueOrThrow({ where: { id: job.id } })).authorId, rep.userId);
    await write('workstation-finish', ticketTask.id, { outcome: 'COMPLETED', closeTicket: true });
    assert.equal((await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status, 'CLOSED');
    // Generic completion keeps checklist, recurrence and independent-review rules.
    const general = await prisma.teamTask.create({ data: { workspaceId: ws.id, ownerId: rep.id, creatorId: boss.id, title: 'Recurring task', recurrenceDays: 7, checklist: [{ text: 'Verify facts', done: true }] } });
    await prisma.teamCalendarEvent.create({data:{workspaceId:ws.id,creatorId:boss.id,assigneeId:rep.id,clientId:client.id,followUpTaskId:general.id,title:'Recurring task',kind:'FOLLOW_UP',startsAt:new Date(Date.now()+86400000)}});
    await teamMutation(rep, 'workstation-start', { taskId: general.id, requestKey: randomUUID() });
    assert.deepEqual((await detail(general.id)).activity!.checklist, [true]);
    const gd = { ...draft, checklist: [true] };
    const g = await detail(general.id);
    await teamMutation(rep, 'workstation-finish', { id: general.id, activityId: g.activity!.id, version: g.task.version, draft: gd, outcome: 'COMPLETED' });
    assert.equal(await prisma.teamTask.count({ where: { eventKey: `${general.id}:recurrence` } }), 1);
    assert.equal((await prisma.teamCalendarEvent.findUniqueOrThrow({where:{followUpTaskId:general.id}})).status,'COMPLETED');
    const review = await prisma.teamTask.create({ data: { workspaceId: ws.id, ownerId: rep.id, creatorId: boss.id, title: 'Review task', approvalRequired: true } });
    await teamMutation(rep, 'workstation-start', { taskId: review.id, requestKey: randomUUID() });
    assert.equal((await write('workstation-finish', review.id, { outcome: 'COMPLETED' })).status, 'IN_REVIEW');
    const abandoned = await prisma.teamTask.create({ data: { workspaceId: ws.id, ownerId: rep.id, creatorId: boss.id, title: 'Abandoned session' } });
    await teamMutation(rep, 'workstation-start', { taskId: abandoned.id, requestKey: randomUUID() });
    await write('workstation-save', abandoned.id);
    await teamMutation(boss, 'workstation-release', { id: abandoned.id, version: (await detail(abandoned.id)).task.version, reason: 'Representative lost access; preserving work.' });
    assert.equal((await detail(abandoned.id)).activity!.status, 'FINISHED');
    assert.equal(await prisma.teamAudit.count({ where: { entityId: abandoned.id, action: 'workstation.released' } }), 1);
    const paused = { ...workActivity((await prisma.teamTask.findUniqueOrThrow({ where: { id: abandoned.id } })).followUpContext)!, startedAt: '2026-10-31T00:00:00Z', pausedAt: '2026-10-31T00:01:00Z', endedAt: '2026-10-31T00:10:00Z', pausedMs: 0 };
    assert.equal(activitySeconds(paused), 60);
    const intake = await prisma.supportTicket.create({ data: { userId: customer.id, subject: 'A new support request', message: 'Need distribution help.' } });
    await teamWrite(boss, (tx, a) => syncWorkStationTickets(tx, a));
    await teamWrite(boss, (tx, a) => syncWorkStationTickets(tx, a));
    assert.equal(await prisma.teamTask.count({ where: { workspaceId: ws.id, recordType: 'support', recordId: intake.id } }), 1);
    const prospect = await prisma.teamProspect.create({ data: { workspaceId: ws.id, ownerId: rep.id, clientId: client.id, name: client.name, email: client.email, phone: client.phone, sourceUrl: 'https://station.fixture.invalid/contact', evidence:'Customer requested contact', score:{}, identityKey:randomUUID(), verified: true, contactEligibility: 'CONSENTED', stage: 'READY_TO_CONTACT' } });
    const crm = await prisma.teamTask.create({ data: { workspaceId: ws.id, ownerId: rep.id, creatorId: boss.id, title: 'First CRM contact', eventKey: `${prospect.id}:call` } });
    await teamMutation(rep, 'workstation-start', { taskId: crm.id, requestKey: randomUUID() });
    assert.equal((await detail(crm.id)).activity!.kind, 'CALL');
    await write('workstation-finish', crm.id, { outcome: 'COMPLETED' });
    assert.equal(await prisma.teamOutreach.count({ where: { prospectId: prospect.id, actorId: rep.id, kind: 'CONTACT' } }), 1);
    assert.equal((await prisma.teamProspect.findUniqueOrThrow({ where: { id: prospect.id } })).stage, 'CONTACTED');
    const coverage = await prisma.teamTask.create({ data: { workspaceId: ws.id, ownerId: rep.id, creatorId: boss.id, clientId: client.id, title: 'No coverage call', followUpContext: { kind: 'CALL' } } });
    await teamMutation(rep, 'workstation-start', { taskId: coverage.id, requestKey: randomUUID() });
    await prisma.teamMember.update({ where: { id: rep.id }, data: { availability: 'UNAVAILABLE' } });
    assert.equal((await write('workstation-finish', coverage.id, { outcome: 'NO_ANSWER' })).status, 'BLOCKED');
    await prisma.teamMember.update({ where: { id: rep.id }, data: { availability: 'AVAILABLE' } });
    await teamWrite(boss, (tx, a) => recoverWorkStationCoverage(tx, a));
    assert.equal((await detail(coverage.id)).task.status, 'TODO');
    assert.equal((await detail(task.id)).task.status, 'BLOCKED', 'Three-attempt cap cannot be auto-reopened by coverage repair');
    const legacyTicket=await prisma.supportTicket.create({data:{userId:customer.id,subject:'Existing sales enquiry',message:'Please help with distribution.'}});
    const customerCard=(await detail(ticketTask.id)).client!;
    await prisma.teamClient.update({where:{id:customerCard.id},data:{phone:'+919876541234'}});
    const legacy=await prisma.teamTask.create({data:{workspaceId:ws.id,ownerId:rep.id,creatorId:boss.id,clientId:customerCard.id,title:'Legacy enquiry',eventKey:`support-call:legacy:${randomUUID()}`,followUpContext:{kind:'ENQUIRY',source:`ticket:${legacyTicket.id}`,referenceId:String(legacyTicket.id)}}});
    const opened=await teamMutation(rep,'workstation-start',{ticketId:legacyTicket.id,requestKey:randomUUID()});assert.equal(opened.id,legacy.id);
    assert.equal((await detail(legacy.id)).ticket!.id,legacyTicket.id);
    await write('workstation-finish',legacy.id,{outcome:'COMPLETED',closeTicket:true});
    assert.equal(await teamWrite(boss,(tx,a)=>employeeCallSlot(tx,a.workspaceId,a.id,new Date())),null,'Owners remain excluded until explicit opt-in');
    await assert.rejects(teamWrite(rep,(tx,a)=>savePersonalCallPlan(tx,a,{enabled:true,dailyLimit:4})),/owner access/);
    for(let i=0;i<6;i++){const c=await prisma.teamClient.create({data:{workspaceId:ws.id,ownerId:other.id,name:`Personal plan customer ${i}`,phone:`+91987777000${i}`}});await prisma.teamTask.create({data:{workspaceId:ws.id,ownerId:other.id,creatorId:boss.id,clientId:c.id,title:`Friendly introduction ${i}`,eventKey:`support-call:personal-fixture:${i}`,dueAt:new Date(Date.now()-86400000),followUpContext:{kind:'FRIENDLY_INTRO',callPhone:c.phone,pinnedAssignee:true}}});}
    await teamWrite(boss,(tx,a)=>savePersonalCallPlan(tx,a,{enabled:true,dailyLimit:4}));
    assert.equal((await teamWrite(boss,(tx,a)=>syncPersonalCallPlans(tx,a))).assigned,4);
    assert.equal((await teamWrite(boss,(tx,a)=>syncPersonalCallPlans(tx,a))).assigned,0);
    const personal=await prisma.teamTask.findMany({where:{workspaceId:ws.id,ownerId:boss.id,followUpContext:{path:['personalCallPlan'],equals:true}},orderBy:{dueAt:'asc'}});assert.equal(personal.length,4);
    const scheduledDay=indiaWorkday(personal[0].dueAt!).day;assert.ok(personal.every(t=>indiaWorkday(t.dueAt!).day===scheduledDay));
    const extraSlot=await teamWrite(boss,(tx,a)=>employeeCallSlot(tx,a.workspaceId,a.id,personal[0].dueAt!));assert.ok(extraSlot&&indiaWorkday(extraSlot).day!==scheduledDay,'Daily call cap applies to future retries too');
    await teamMutation(boss,'workstation-start',{taskId:personal[0].id,requestKey:randomUUID()});await write('workstation-finish',personal[0].id,{outcome:'COMPLETED'},boss);
    assert.equal((await teamWrite(boss,(tx,a)=>syncPersonalCallPlans(tx,a))).assigned,0,'Completing a call must not refill beyond four for the day');
    console.log('PASS Work-station: permissions, privacy, concurrency, pause/resume, persistence, stale writes, three-attempt retry, two-hour email gap, ticket emails and closure, recurrence, review, supervisor recovery and deduplicated routing. No customer mail sent.');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
