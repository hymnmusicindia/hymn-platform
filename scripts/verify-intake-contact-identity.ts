import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { teamMutation, teamRead } from '../lib/team/service';

async function main() {
  assert.equal(process.env.DATABASE_URL, 'postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture');
  const workspace = await prisma.teamWorkspace.create({ data: { name: 'Automatic contact identity', clientCardsImportedAt: new Date() } });
  const role = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name: 'Operator' } });
  async function member(name: string) {
    const user = await prisma.user.create({ data: { name, email: `${name}@identity.fixture.invalid`, googleId: `identity-${name}` } });
    return prisma.teamMember.create({ data: { workspaceId: workspace.id, userId: user.id, roleId: role.id }, include: { role: true } });
  }
  const alice = await member('Alice'), bob = await member('Bob');
  const card = await prisma.teamClient.create({ data: { workspaceId: workspace.id, ownerId: alice.id, name: 'Existing customer', email: 'saved@identity.fixture.invalid', phone: '+91 (79872) 74100', secondaryEmail: 'secondary@identity.fixture.invalid', additionalEmails: ['extra@identity.fixture.invalid'], alternatePhones: ['0091 76543 21098'], notes: 'Alice private note' } });
  const lookup = async(email = '', phone = '', excludeId = '', actor = bob) => teamRead(actor, 'clients-identity', new URLSearchParams({ email, phone, ...(excludeId ? { excludeId } : {}) })) as Promise<{ items: any[]; accounts: any[] }>;
  for (const phone of ['7987274100', '+91 79872 74100', '00917987274100', '7654321098']) assert.equal((await lookup('', phone)).items[0].id, card.id);
  for (const email of ['SAVED@IDENTITY.FIXTURE.INVALID', 'secondary@identity.fixture.invalid', 'extra@identity.fixture.invalid']) assert.equal((await lookup(email)).items[0].id, card.id);
  assert.equal((await lookup('saved@identity.fixture.invalid')).items[0].notes, '', 'Private notes do not leak into matches.');
  assert.equal((await lookup('saved@identity.fixture.invalid', '', card.id)).items.length, 0);
  assert.equal((await lookup('', '7987')).items.length, 0, 'Incomplete phones must not return broad matches.');
  await prisma.teamClient.update({ where: { id: card.id }, data: { status: 'DO_NOT_CONTACT' } });
  assert.equal((await lookup('', '7987274100')).items[0].status, 'DO_NOT_CONTACT');
  await assert.rejects(teamMutation(bob, 'clients-save', { name: 'Duplicate', phone: '7987274100', ownerId: bob.id }), /matching|already belong/i);
  await prisma.teamClient.update({ where: { id: card.id }, data: { status: 'ACTIVE' } });
  const user = await prisma.user.create({ data: { name: 'Registered customer', email: 'registered@identity.fixture.invalid', contactEmail: 'contact@identity.fixture.invalid', mobile: '+91 71234 56789', googleId: 'identity-account' } });
  const legacy = await prisma.teamClient.create({ data: { workspaceId: workspace.id, ownerId: alice.id, name: 'Existing unlinked account card', email: user.contactEmail! } });
  for (const input of [['contact@identity.fixture.invalid', ''], ['', '7123456789']]) assert.equal((await lookup(...input as [string, string])).accounts[0].id, user.id);
  await assert.rejects(teamMutation(bob, 'clients-save', { name: 'Accidental account duplicate', email: user.email, ownerId: bob.id }), /matching saved card/);
  const linked = await teamMutation(bob, 'clients-use-account', { userId: user.id, phone: '7123456789' }) as { id: string; version: number };
  assert.equal(linked.id, legacy.id, 'Selecting a registered account links its matching card instead of creating a duplicate.');
  assert.equal((await prisma.teamClient.findUniqueOrThrow({ where: { id: linked.id } })).userId, user.id);
  assert.equal((await prisma.teamClient.findUniqueOrThrow({ where: { id: linked.id } })).phone, '+917123456789', 'A missing phone can be filled from the selected account.');
  assert.equal((await teamMutation(bob, 'clients-use-account', { userId: user.id, phone: '7123456789' }) as { id: string }).id, linked.id);
  assert.equal(await prisma.teamClientWelcome.count({ where: { clientId: linked.id } }), 0);
  assert.equal(await prisma.teamProspect.count({ where: { clientId: linked.id } }), 0, 'Registered customers are never claimed as new leads.');
  assert.equal((await lookup('contact@identity.fixture.invalid')).items[0].id, linked.id, 'Account aliases resolve to the saved card after linking.');
  const unrelated = await prisma.user.create({ data: { name: 'Unrelated', email: 'unrelated@identity.fixture.invalid', googleId: 'identity-unrelated' } });
  await assert.rejects(teamMutation(bob, 'clients-use-account', { userId: unrelated.id, phone: '7123456789' }), /no longer matches/);
  const merged = await teamMutation(bob, 'clients-merge', { targetId: card.id, targetVersion: card.version, confirmedSamePerson: true, reason: 'Customer confirmed this second email.', requestKey: randomUUID(), draft: { name: 'Typed customer', email: card.email, phone: '+919999900001', ownerId: bob.id } }) as { id: string; version: number };
  assert.equal(merged.id, card.id);
  assert.ok((await prisma.teamClient.findUniqueOrThrow({ where: { id: card.id } })).alternatePhones.includes('+919999900001'));
  assert.equal((await lookup('', '9999900001')).items[0].id, card.id);
  assert.equal((await prisma.teamClient.findUniqueOrThrow({ where: { id: card.id } })).notes, 'Alice private note');
  await assert.rejects(teamMutation(bob, 'clients-save', { id: card.id, version: card.version, name: card.name, phone: card.phone, email: card.email, ownerId: alice.id }), /changed/);
  const otherWorkspace = await prisma.teamWorkspace.create({ data: { name: 'Other identity workspace' } });
  assert.equal((await lookup(card.email, '', '', { ...bob, workspaceId: otherWorkspace.id })).items.length, 0);
  console.log('Automatic identity: exact and alias matching, normalized phones, privacy, blocked records, registered-account linking, idempotency, merge preservation, version protection and workspace scope passed.');
}
main().finally(() => prisma.$disconnect());
