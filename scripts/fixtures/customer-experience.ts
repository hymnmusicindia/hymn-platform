import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { prisma } from '../../lib/prisma';
import { acceptCurrentPolicies, CURRENT_POLICY_REVISION } from '../../lib/policy-agreement';
import { appointStudioEngineer } from '../../lib/admin-studio-engineers';
import { seedCustomerWorkflows } from './customer-workflows';

async function main() {
  assert.equal(process.env.DATABASE_URL, 'postgresql://fixture:fixture@127.0.0.1:55481/customer_fixture');
  const customer = await prisma.user.create({ data: { name: 'Customer Audit Artist', email: 'customer@audit.fixture.invalid', googleId: 'customer-audit', onboardingDone: true, mobile: '+919876543210', onboardingCompletedAt: new Date(), referralPromptCompletedAt: new Date() } });
  const other = await prisma.user.create({ data: { name: 'Other Customer', email: 'other@audit.fixture.invalid', googleId: 'other-audit', onboardingDone: true } });
  const producer = await prisma.user.create({ data: { name: 'Audit Producer', email: 'producer@audit.fixture.invalid', googleId: 'producer-audit', role: 'PRODUCER', onboardingDone: true, producerProfile: { create: { slug: 'audit-producer', displayName: 'Audit Producer', specialty: 'Beats', bio: 'Original independent music and beats.', status: 'active', active: true } } } });
  const beat = await prisma.beat.create({ data: { userId: producer.id, title: 'Midnight Drive', genre: 'Hip Hop', mood: 'Chill', bpm: 92, keySignature: 'D Minor', priceCents: 150000, enabled: true, status: 'PUBLISHED', sampleDeclaredAt: new Date() } });
  const engineer = await appointStudioEngineer({ userId: producer.id, professionalName: 'Audit Engineer', slug: 'audit-engineer', bio: 'Mixing and mastering for independent artists. Clear vocals, balanced mixes and release-ready masters.', specialties: ['Mixing', 'Mastering'], genres: ['Hip Hop', 'Pop'], socialLinks: { instagram: null, youtube: null }, portfolioItems: [{ title: 'Portfolio sample', url: 'https://example.com/music' }], availability: 'AVAILABLE', maxActiveOrders: 3, verificationState: 'VERIFIED', sellerState: 'ACTIVE', payoutState: 'NOT_CONFIGURED', listing: { title: 'Mix & Master', description: 'Professional mixing and mastering of your original music.', standardPrice: 1999, beatCustomerPrice: 1499, includedRevisions: 2, additionalRevisionPrice: 399, turnaroundDays: 4, sourceRequirements: ['Consolidated stems', 'Rough mix'], deliverables: ['24-bit WAV', 'MP3'], instantAccept: false, active: true, paused: false } }, null, 'customer-fixture');
  const releases = [];
  for (const [title, status] of [['Midnight Sessions', 'LIVE'], ['A Work in Progress', 'DRAFT'], ['Needs Artwork Correction', 'CHANGES_REQUESTED']] as const) {
    releases.push(await prisma.release.create({ data: { userId: customer.id, title, artistName: customer.name, genre: 'Hip Hop', releaseDate: new Date('2026-11-20T00:00:00Z'), status, releaseType: 'single', artworkUrl: '/assets/hymnlogowhite.png', paymentStatus: status === 'DRAFT' ? 'pending' : 'paid', metadata: { language: 'English', primaryArtist: customer.name, releaseTitle: title }, tracks: { create: { title, primaryArtist: customer.name, trackNumber: 1, isrc: status === 'LIVE' ? 'INS002600001' : null } } } }));
  }
  const privateRelease = await prisma.release.create({ data: { userId: other.id, title: 'Private Other Release', artistName: other.name, genre: 'Pop', releaseDate: new Date(), status: 'DRAFT' } });
  await prisma.supportTicket.create({ data: { userId: customer.id, subject: 'Help with my artwork', message: 'Please help me check my artwork requirements.', details: { email: customer.email }, category: 'distribution' } });
  await prisma.subscription.create({ data: { userId: customer.id, plan: 'yearly', planName: 'Yearly', expiryDate: new Date('2027-10-24T00:00:00Z'), status: 'active', releaseLimit: 12, releasesUsed: 2, daysRemaining: 365 } });
  await acceptCurrentPolicies(customer.id, CURRENT_POLICY_REVISION);
  const workflows = await seedCustomerWorkflows(customer.id, beat.id, engineer.id, releases.find(r => r.status === 'DRAFT')!.id);
  mkdirSync('.cache/customer-experience', { recursive: true });
  writeFileSync('.cache/customer-experience/fixture.json', JSON.stringify({ customer: { id: customer.id, name: customer.name, email: customer.email }, otherId: other.id, privateReleaseId: privateRelease.id, releases: releases.map(r => ({ id: r.id, status: r.status })), beatId: beat.id, engineerId: engineer.id, engineerSlug: engineer.slug, producerSlug: 'audit-producer', ...workflows }));
  console.log('Seeded isolated customer, private control record, releases, ticket, subscription, producer, beat and engineer.');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
