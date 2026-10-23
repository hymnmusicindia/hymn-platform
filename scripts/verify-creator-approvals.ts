import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { roleTemplates } from '../lib/team/policy';
import { readCreatorApplications, decideCreatorApplication } from '../lib/team/creator-applications';

async function main() {
  assert.equal(process.env.DATABASE_URL, 'postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture');
  assert.equal(process.env.EMAIL_ENABLED, 'false');
  const workspace = await prisma.teamWorkspace.create({ data: { name: 'Creator approval fixture' } });
  const role = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name: 'Research + QC + Creator approvals', permissions: [...roleTemplates.Researcher, 'operations.distribution.qc', 'operations.producers.approve', 'operations.engineers.approve'] } });
  const qc = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name: 'QC only', permissions: roleTemplates['Release QC Reviewer'] } });
  async function user(name: string) { return prisma.user.create({ data: { name, email: `${name}@creator.fixture.invalid`, googleId: name } }); }
  const reviewer = await user('manha'), other = await user('tavish'), producer = await user('producer'), engineer = await user('engineer');
  const manha = await prisma.teamMember.create({ data: { workspaceId: workspace.id, roleId: role.id, userId: reviewer.id }, include: { role: true } });
  const tavish = await prisma.teamMember.create({ data: { workspaceId: workspace.id, roleId: qc.id, userId: other.id }, include: { role: true } });
  const createProducer = (userId: number) => prisma.producerApplication.create({ data: { userId, producerName: 'Fixture producer', genre: 'Hip Hop', yearsExperience: 3, pricing: 'INR 1000', bio: 'Original music producer and beat maker.' } });
  const p = await createProducer(producer.id), own = await createProducer(reviewer.id);
  const e = await prisma.engineerApplication.create({ data: { userId: engineer.id, professionalName: 'Fixture engineer', bio: 'Experienced mixing and mastering engineer.', specialties: ['Mixing'], genres: ['Hip Hop'], portfolioUrl: 'https://example.com/work', experienceLevel: 'Professional', startingPrice: 1500, turnaroundDays: 4 } });
  const decide = (kind: 'producer' | 'engineer', id: number, updatedAt: Date) => ({ kind, id, updatedAt: updatedAt.toISOString(), decision: 'APPROVE', note: 'Portfolio and identity checked against submitted work.', checksConfirmed: true });
  await assert.rejects(readCreatorApplications(tavish), /permission/);
  assert.equal((await readCreatorApplications(manha)).producers.some(a => a.id === own.id), false);
  await assert.rejects(decideCreatorApplication(tavish, decide('producer', p.id, p.updatedAt), 'fixture'), /permission/);
  await assert.rejects(decideCreatorApplication(manha, decide('producer', own.id, own.updatedAt), 'fixture'), /own application/);
  await assert.rejects(decideCreatorApplication(manha, { ...decide('producer', p.id, p.updatedAt), checksConfirmed: false }, 'fixture'), /Confirm/);
  await assert.rejects(decideCreatorApplication(manha, decide('producer', p.id, new Date(0)), 'fixture'), /changed/);
  const concurrent = await Promise.allSettled([decideCreatorApplication(manha, decide('producer', p.id, p.updatedAt), 'fixture-a'), decideCreatorApplication(manha, decide('producer', p.id, p.updatedAt), 'fixture-b')]);
  assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1, 'One reviewer decision wins; retries cannot overwrite it.');
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: producer.id } })).role, 'PRODUCER');
  assert.equal(await prisma.notification.count({ where: { userId: producer.id } }), 1);
  const approved = await decideCreatorApplication(manha, decide('engineer', e.id, e.updatedAt), 'fixture-engineer');
  assert.equal(approved.status, 'APPROVED'); assert.ok(approved.profileId);
  const profile = await prisma.engineerProfile.findUniqueOrThrow({ where: { id: approved.profileId! }, include: { listings: true } });
  assert.equal(profile.verificationState, 'VERIFIED'); assert.equal(profile.payoutState, 'NOT_CONFIGURED');
  assert.equal(profile.listings.length, 1); assert.equal(profile.listings[0].active, true);
  await assert.rejects(decideCreatorApplication(manha, decide('engineer', e.id, e.updatedAt), 'fixture-repeat'), /already reviewed/);
  const badUser = await user('invalid-engineer');
  const invalid = await prisma.engineerApplication.create({ data: { userId: badUser.id, professionalName: 'Invalid fixture', bio: 'Another engineer sample profile.', specialties: ['Mixing'], genres: ['Pop'], portfolioUrl: 'https://example.com/work', experienceLevel: 'New', startingPrice: 1500, turnaroundDays: 2 } });
  await prisma.contributorParty.create({ data: { publicId: crypto.randomUUID(), professionalName: 'Invalid fixture', displayName: 'Invalid fixture', claimedByUserId: badUser.id, mergedIntoId: profile.contributorPartyId } });
  await assert.rejects(decideCreatorApplication(manha, decide('engineer', invalid.id, invalid.updatedAt), 'fixture-rollback'), /merged/);
  assert.equal((await prisma.engineerApplication.findUniqueOrThrow({ where: { id: invalid.id } })).status, 'PENDING', 'Profile creation failure rolls back the decision.');
  await prisma.teamMember.update({ where: { id: manha.id }, data: { roleId: qc.id } });
  await assert.rejects(readCreatorApplications(manha), /permission/);
  await assert.rejects(decideCreatorApplication(manha, { ...decide('producer', own.id, own.updatedAt), decision: 'REJECT' }, 'fixture-revoked'), /permission/);
  assert.equal(await prisma.adminMembership.count({ where: { userId: reviewer.id } }), 0);
  assert.equal((await prisma.teamRole.findUniqueOrThrow({ where: { id: qc.id } })).permissions.includes('operations.producers.approve'), false, 'Tavish has no creator approval authority.');
  console.log('Creator approvals passed: scoped authority, self-review, stale/concurrent decisions, real producer/engineer activation, rollback and immediate revocation.');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
