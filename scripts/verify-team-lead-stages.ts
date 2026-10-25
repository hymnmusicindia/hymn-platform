import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { teamMutation } from '../lib/team/service';
import { acquisitionRead } from '../lib/team/acquisition';
import { workWeek, moveWorkWeek } from '../lib/team/availability-rules';

async function main() {
  assert.equal(process.env.DATABASE_URL, 'postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture');
  const workspace = await prisma.teamWorkspace.create({ data: { name: 'Clear lead stages', clientCardsImportedAt: new Date() } });
  const researcherRole = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name: 'Researcher', permissions: ['crm.prospects.view', 'crm.prospects.create'] } });
  const callerRole = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name: 'Call rep', permissions: ['crm.prospects.view', 'crm.outreach.manage', 'calendar.manage'] } });
  async function member(name: string, roleId: string) {
    const user = await prisma.user.create({ data: { name, email: `${name}@lead-stages.fixture.invalid`, googleId: `lead-stages-${name}` } });
    const week = workWeek();
    return prisma.teamMember.create({ data: { workspaceId: workspace.id, userId: user.id, roleId, preferences: { workAvailability: { weeklyMinutes: 2400, plans: Object.fromEntries([week, moveWorkWeek(week, 1)].map(key => [key, { revision: 1, submittedAt: new Date().toISOString(), slots: Array.from({ length: 7 }, (_, day) => ({ day, start: 570, end: 1080 })) }])) } } }, include: { role: true } });
  }
  const researcher = await member('Researcher', researcherRole.id), caller = await member('Caller', callerRole.id), other = await member('Other', callerRole.id);
  const card = await teamMutation(researcher, 'clients-save', { name: 'Real potential customer', phone: '+919876543210', ownerId: researcher.id }) as { id: string };
  let p = await prisma.teamProspect.findUniqueOrThrow({ where: { clientId: card.id } });
  const leads = async (actor = researcher) => (await acquisitionRead(actor, 'acquisition-leads', new URLSearchParams()) as { items: any[] }).items;
  assert.equal((await leads())[0].leadVerified, false); assert.equal(p.stage, 'NEEDS_RESEARCH');
  await prisma.teamProspect.update({ where: { id: p.id }, data: { ownerId: caller.id } });
  await prisma.acquisitionLead.update({ where: { prospectId: p.id }, data: { acquisitionEmployeeId: caller.id } });
  await assert.rejects(teamMutation(other, 'prospect-call-save', { id: p.id, version: p.version, stage: 'VERIFIED_LEAD' }), /unavailable/);
  await assert.rejects(teamMutation(caller, 'prospect-call-save', { id: p.id, version: p.version, stage: 'VERIFIED_LEAD' }), /must speak/);
  p = await teamMutation(caller, 'prospect-research-save', { id: p.id, version: p.version, email: null, phone: p.phone, sourceUrl: 'https://example.org/professional', evidence: 'Checked public professional contact details.', notes: '', verified: true, contactEligibility: 'LEGITIMATE_INTEREST' }) as typeof p;
  assert.equal((await leads())[0].leadVerified, false, 'A source check does not verify a lead.');
  const verification = { talked: true, identityConfirmed: true, needsConfirmed: true, confirmed: true };
  await assert.rejects(teamMutation(caller, 'prospect-call-save', { id: p.id, version: p.version, stage: 'VERIFIED_LEAD', verifyLead: verification }), /actual conversation/);
  p = await teamMutation(caller, 'prospect-call-save', { id: p.id, version: p.version, contact: { body: 'Spoke about music distribution and confirmed their identity.', evidence: 'Call log reference 123' } }) as typeof p;
  assert.equal(p.stage, 'CONTACTED'); assert.equal((await leads())[0].leadVerified, false);
  await assert.rejects(teamMutation(caller, 'prospect-call-save', { id: p.id, version: p.version, stage: 'INTERESTED' }), /must speak/);
  await assert.rejects(teamMutation(researcher, 'prospect-call-save', { id: p.id, version: p.version, stage: 'VERIFIED_LEAD', verifyLead: verification }), /permission/);
  await assert.rejects(teamMutation(caller, 'prospect-call-save', { id: p.id, version: p.version, stage: 'VERIFIED_LEAD', verifyLead: { ...verification, confirmed: false } }));
  p = await teamMutation(caller, 'prospect-call-save', { id: p.id, version: p.version, stage: 'VERIFIED_LEAD', verifyLead: verification }) as typeof p;
  assert.equal(p.stage, 'VERIFIED_LEAD'); assert.equal((await leads())[0].leadVerified, true);
  assert.equal(await prisma.teamOutreach.count({ where: { prospectId: p.id, kind: 'LEAD_VERIFIED' } }), 1);
  p = await teamMutation(caller, 'prospect-call-save', { id: p.id, version: p.version, stage: 'VERIFIED_LEAD', verifyLead: verification }) as typeof p;
  assert.equal(await prisma.teamOutreach.count({ where: { prospectId: p.id, kind: 'LEAD_VERIFIED' } }), 1, 'A second confirmation cannot inflate verification totals.');
  p = await teamMutation(caller, 'prospect-call-save', { id: p.id, version: p.version, stage: 'INTERESTED' }) as typeof p;
  const totals = (await acquisitionRead(researcher, 'acquisition-targets', new URLSearchParams()) as { items: any[] }).items[0];
  assert.equal(totals.savedLeads, 1); assert.equal(totals.verifiedLeads, 1);
  assert.equal((await acquisitionRead(caller, 'acquisition-targets', new URLSearchParams()) as { items: any[] }).items[0].verifiedByYou, 1);
  p = await teamMutation(caller, 'prospect-research-save', { id: p.id, version: p.version, email: null, phone: '+919876543211', sourceUrl: 'https://example.org/professional', evidence: 'Updated contact details after reviewing the source.', notes: '', verified: true, contactEligibility: 'LEGITIMATE_INTEREST' }) as typeof p;
  assert.equal((await leads())[0].leadVerified, false, 'Old verification cannot cover a different phone number.');
  assert.equal((await leads())[0].prospect.stage, 'CONTACTED');
  await assert.rejects(teamMutation(caller, 'prospect-call-save', { id: p.id, version: p.version, stage: 'VERIFIED_LEAD', verifyLead: verification }), /current contact details/);
  console.log('Lead stages: saved vs source checked vs talked vs verified, scoped rep permissions, explicit confirmation, no skipped stages, unique counts and changed identity passed.');
}
main().finally(() => prisma.$disconnect());
