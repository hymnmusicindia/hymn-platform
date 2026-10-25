import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { teamMutation, teamRead, teamWrite } from '../lib/team/service';
import { syncCustomerFollowups, nextCallDue } from '../lib/team/customer-followups';
import { calendarRead } from '../lib/team/calendar';
import { timedLayout, weekDays, moveCalendarDate } from '../lib/team/calendar-layout';
import { whatsappLink } from '../lib/team/phone';
import { serviceForPath } from '../lib/team/service-interest';

async function main() {
  assert.equal(process.env.DATABASE_URL, 'postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture');
  const workspace = await prisma.teamWorkspace.create({ data: { name: 'Shared contacts fixture', clientCardsImportedAt: new Date() } });
  const ownerRole = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name: 'Owner', owner: true } });
  const staffRole = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name: 'Staff', permissions: ['calendar.view', 'calendar.manage'] } });
  const callerRole = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name: 'Caller', permissions: ['calendar.view', 'calendar.manage', 'crm.outreach.manage', 'tasks.update', 'tasks.view'] } });
  async function member(name: string, roleId: string, caller = false) {
    const user = await prisma.user.create({ data: { name, email: `${name}@contacts.fixture.invalid`, googleId: name } });
    return prisma.teamMember.create({ data: { workspaceId: workspace.id, userId: user.id, roleId, preferences: caller ? { crm: { caller: true, workRole: 'caller' }, workAvailability: { weeklyMinutes:2400, plans:Object.fromEntries(['2026-10-19','2026-10-26'].map(week=>[week,{revision:1,submittedAt:'2026-10-19T00:00:00Z',slots:Array.from({length:7},(_,day)=>({day,start:570,end:1080}))}])) } } : {} }, include: { role: true } });
  }
  const owner = await member('Owner', ownerRole.id), alice = await member('Alice', staffRole.id), bob = await member('Bob', staffRole.id);
  const caller = await member('Caller', callerRole.id, true), second = await member('Second', callerRole.id, true);
  const card = await teamMutation(alice, 'clients-save', { name: 'Shared Artist', phone: '+919876543210', notes: 'Alice private note', ownerId: alice.id }) as { id: string; version: number };
  const intakeLead = await prisma.teamProspect.findUniqueOrThrow({ where: { clientId: card.id }, include: { acquisitionLead: true } });
  assert.equal(intakeLead.stage, 'NEEDS_RESEARCH');
  assert.equal(intakeLead.verified, false);
  assert.equal(intakeLead.contactEligibility, 'UNVERIFIED');
  assert.equal(intakeLead.notes, '', 'Private contact notes must not leak into the pipeline.');
  assert.equal(intakeLead.acquisitionLead?.researcherEmployeeId, alice.id);
  assert.equal(intakeLead.acquisitionLead?.acquisitionEmployeeId, null);
  const read = await calendarRead(bob, 'clients', new URLSearchParams({ clientId: card.id })) as { items: { id: string; notes: string; notesVisible: boolean }[] };
  assert.equal(read.items[0].notes, ''); assert.equal(read.items[0].notesVisible, false);
  const updated = await teamMutation(bob, 'clients-save', { id: card.id, version: card.version, name: 'Shared Artist corrected', phone: '+919876543210', notes: 'Cannot replace private notes', ownerId: alice.id }) as { version: number };
  assert.equal((await prisma.teamClient.findUniqueOrThrow({ where: { id: card.id } })).notes, 'Alice private note');
  await assert.rejects(teamMutation(bob, 'clients-save', { name: 'Duplicate formatted number', phone: '919876543210', ownerId: bob.id }), /phone already exists|matching contact exists/i);
  await assert.rejects(teamMutation(bob, 'clients-save', { id: card.id, version: updated.version, name: 'Reassigned', ownerId: bob.id }), /permission/);
  assert.equal((await calendarRead(bob, 'clients', new URLSearchParams({ q: 'Alice private note' })) as { total: number }).total, 0);
  const noPermissionsRole = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name: 'Contact-only' } });
  const basic = await member('Basic', noPermissionsRole.id);
  await teamMutation(basic, 'clients-save', { name: 'Basic staff saved this', ownerId: basic.id });
  assert.ok((await calendarRead(basic, 'clients', new URLSearchParams()) as { total: number }).total >= 2);
  await assert.rejects(teamRead(basic, 'call-followups', new URLSearchParams()), /permission/);
  const start = '2026-10-22T10:00:00+05:30';
  await teamMutation(alice, 'calendar-save', { title: 'Private Alice event', kind: 'EVENT', assigneeId: alice.id, clientId: card.id, startsAt: start, notes: 'Private schedule notes' });
  await teamMutation(bob, 'calendar-save', { title: 'Private Bob event', kind: 'EVENT', assigneeId: bob.id, clientId: null, startsAt: start });
  const range = new URLSearchParams({ start: '2026-10-22T00:00:00+05:30', end: '2026-10-23T00:00:00+05:30' });
  const bobCalendar = await calendarRead(bob, 'calendar', range) as { items: { title: string }[] };
  assert.deepEqual(bobCalendar.items.map(e => e.title), ['Private Bob event']);
  assert.equal((await calendarRead(owner, 'calendar', range) as { total: number }).total, 2);
  const otherWorkspace = await prisma.teamWorkspace.create({ data: { name: 'Other workspace', clientCardsImportedAt: new Date() } });
  const otherRole = await prisma.teamRole.create({ data: { workspaceId: otherWorkspace.id, name: 'Owner', owner: true } });
  const other = await prisma.teamMember.create({ data: { workspaceId: otherWorkspace.id, userId: owner.userId, roleId: otherRole.id }, include: { role: true } });
  assert.equal((await calendarRead(other, 'clients', new URLSearchParams({ clientId: card.id })) as { total: number }).total, 0);

  const now = new Date('2026-10-22T06:00:00Z');
  const customer = await prisma.user.create({ data: { name: 'Draft customer', email: 'draft@contacts.fixture.invalid', googleId: 'draft-customer', mobile: '+919876543211', role: 'CUSTOMER' } });
  const release = await prisma.release.create({ data: { userId: customer.id, title: 'Inactive draft', artistName: 'Artist', genre: 'Hip Hop', releaseDate: now, lastEditedAt: new Date(now.getTime() - 30 * 3600000 + 1) } });
  const sync = async (time = now) => {
    // Reset fixture scan cursors to exercise a full rescan immediately; production resumes bounded batches each cron tick.
    await prisma.teamWorkspace.update({ where: { id: workspace.id }, data: { customerFollowupCursor: {} } });
    return teamWrite(owner, (tx, a) => syncCustomerFollowups(tx, a, time));
  };
  assert.equal((await sync()).assigned, 0, 'A 29h59m draft must not trigger.');
  await prisma.release.update({ where: { id: release.id }, data: { lastEditedAt: new Date(now.getTime() - 30 * 3600000) } });
  assert.equal((await sync()).assigned, 1, 'Exactly 30 hours triggers a callback.');
  assert.equal((await sync()).assigned, 0, 'Retry is idempotent.');
  const first = await prisma.teamTask.findFirstOrThrow({ where: { clientId: { not: null }, eventKey: { startsWith: 'support-call:' } } });
  assert.ok([caller.id, second.id].includes(first.ownerId));
  const assignedCaller = first.ownerId === caller.id ? caller : second, unassignedCaller = first.ownerId === caller.id ? second : caller;
  assert.equal((await teamRead(assignedCaller, 'call-followups', new URLSearchParams()) as { total: number }).total, 1);
  assert.equal((await teamRead(unassignedCaller, 'call-followups', new URLSearchParams()) as { total: number }).total, 0);
  await prisma.release.update({ where: { id: release.id }, data: { lastEditedAt: now } });
  await sync(); assert.equal((await prisma.teamTask.findUniqueOrThrow({ where: { id: first.id } })).status, 'CANCELLED');
  assert.equal((await sync(new Date(now.getTime() + 30 * 3600000))).assigned, 1, 'A new inactivity cycle can receive a fresh callback.');
  await prisma.growthLead.create({ data: { kind: 'contact', name: customer.name, email: customer.email, phone: customer.mobile, userId: customer.id, interest: 'Mixing', message: 'Please help me finish the mix.' } });
  await prisma.growthEvent.create({ data: { key: 'fixture-interest', event: 'customer_service_interest', source: 'support_signal', userId: customer.id, properties: { service: 'Studio services' } } });
  assert.equal((await sync()).assigned, 2);
  assert.equal((await sync()).assigned, 0);
  assert.equal(await prisma.acquisitionLead.count({ where: { customerId: customer.id } }), 0, 'Support callbacks never claim acquisition credit.');
  assert.equal(await prisma.teamProspect.count({ where: { clientId: card.id } }), 1, 'Editing a contact never duplicates its lead.');
  assert.equal(await prisma.teamAppointmentMessage.count({where:{kind:{startsWith:'CLIENT_'}}}), 0, 'Internal callbacks must not send customer appointment emails.');
  const linked = await prisma.teamClient.findUniqueOrThrow({ where: { userId: customer.id } });
  await teamMutation(bob, 'clients-save', { id: linked.id, version: linked.version, ownerId: linked.ownerId, name: linked.name, phone: linked.phone, email: linked.email, status: 'DO_NOT_CONTACT' });
  assert.equal(await prisma.teamTask.count({ where: { clientId: linked.id, status: { notIn: ['COMPLETED', 'CANCELLED'] } } }), 0);
  await assert.rejects(teamMutation(bob, 'clients-save', { id: linked.id, version: linked.version + 1, ownerId: linked.ownerId, name: linked.name, phone: linked.phone, email: linked.email, status: 'ACTIVE' }), /reactivate/);
  await sync(); assert.equal(await prisma.teamTask.count({ where: { clientId: linked.id, status: { notIn: ['COMPLETED', 'CANCELLED'] } } }), 0);

  const researcherRole = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name: 'Researcher', permissions: ['crm.prospects.create', 'crm.prospects.view'] } });
  const researcher = await member('Researcher', researcherRole.id);
  const researched = await teamMutation(researcher, 'clients-save', { name: 'New research contact', phone: '+919876543222', ownerId: researcher.id, research: { sourceUrl: 'https://example.org/professional', evidence: 'Public professional source verified', verified: true, contactEligibility: 'DO_NOT_CONTACT' } }) as { id: string; version: number; status: string };
  assert.equal(researched.status, 'DO_NOT_CONTACT');
  assert.equal(researched.version, (await prisma.teamClient.findUniqueOrThrow({ where: { id: researched.id } })).version);
  const prospect = await prisma.teamProspect.findUniqueOrThrow({ where: { clientId: researched.id } });
  assert.equal(prospect.suppressed, true); assert.equal(await prisma.acquisitionLead.count({ where: { prospectId: prospect.id, researcherEmployeeId: researcher.id } }), 1);
  await assert.rejects(teamMutation(bob, 'clients-save', { name: 'No research permission', phone: '+919876543223', ownerId: bob.id, research: { sourceUrl: 'https://example.org/professional', evidence: 'Public professional source verified', verified: true, contactEligibility: 'LEGITIMATE_INTEREST' } }), /permission/);
  assert.equal(await prisma.teamClient.count({ where: { name: 'No research permission' } }), 0, 'The entire card/research write rolls back on failure.');

  const blocks = timedLayout([{ id: 'a', start, end: '2026-10-22T11:00:00+05:30' }, { id: 'b', start: '2026-10-22T10:30:00+05:30', end: '2026-10-22T11:30:00+05:30' }, { id: 'c', start: '2026-10-22T11:30:00+05:30', end: null }], '2026-10-22');
  assert.deepEqual(blocks.map(b => b.columns), [2, 2, 1]); assert.equal(blocks[0].top, 560);
  assert.deepEqual(weekDays('2026-10-22').slice(0, 2), ['2026-10-19', '2026-10-20']);
  assert.equal(moveCalendarDate('2026-10-31', 'month', 1), '2026-11-01');
  assert.equal(whatsappLink('+91 98765 43210', true), 'https://web.whatsapp.com/send?phone=919876543210');
  assert.equal(whatsappLink('invalid'), null); assert.equal(serviceForPath('/distribution/start'), null);
  assert.ok(serviceForPath('/studio')); assert.equal(serviceForPath('/admin'), null);
  assert.equal(nextCallDue(new Date('2026-10-22T17:00:00Z')).toISOString(), '2026-10-22T18:00:00.000Z');
  console.log('Shared contacts, private notes, calendar scope, 30-hour lifecycle, caller isolation, deduplication, DNC, credit separation and timeline layout passed.');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
