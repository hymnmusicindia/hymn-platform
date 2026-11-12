import 'server-only';
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { savedArtistStoreLinks, verifiedArtistStoreLinks, attachedArtistProfileIds } from './artist-store-links';
import { selectedReleaseArtistIds, preserveArtistReleaseMappings, artistIdentityFingerprint } from './release-artist-verification';
import { hubNoticeHref, interventionFor } from './artist-hub-policy';
import { ensureUserHandle } from './user-handles';
import { getPayoutCredential } from './payout/credentials';
import { createAdminTaskOnce } from './task-queue';

type Tx = Prisma.TransactionClient;
export class ArtistHubError extends Error { constructor(message: string, readonly status = 409) { super(message); } }
async function active(tx: Tx, userId: number) {
  if (!await tx.user.count({ where: { id: userId, status: 'ACTIVE' } })) throw new ArtistHubError('An active HYMN account is required.', 403);
}
export async function hubNotice(tx: Tx, userId: number, eventKey: string, title: string, body: string) {
  await tx.notification.upsert({ where: { eventKey }, create: { userId, eventKey, title, body, href: hubNoticeHref(eventKey), actionLabel: 'Open HYMN', type: 'system' }, update: {} });
  await tx.artistHubMail.upsert({ where: { eventKey }, create: { userId, eventKey, title, body }, update: {} });
}
export function publicHubCard(identity: { id: number; displayName: string; spotifyId: string | null; appleId: string | null }) {
  return { id: identity.id, name: identity.displayName, spotifyUrl: identity.spotifyId ? `https://open.spotify.com/artist/${identity.spotifyId}` : null, appleUrl: identity.appleId ? `https://music.apple.com/artist/${identity.appleId}` : null };
}
export async function findHubIdentity(links: { spotifyUrl?: string | null; appleUrl?: string | null }) {
  const parsed = verifiedArtistStoreLinks({ spotify: links.spotifyUrl, apple: links.appleUrl });
  const conditions = [...(parsed.spotify ? [{ spotifyId: parsed.spotify.id }] : []), ...(parsed.apple ? [{ appleId: parsed.apple.id }] : [])];
  if (!conditions.length) return null;
  const matches = await prisma.artistHubIdentity.findMany({ where: { OR: conditions } });
  if (matches.length > 1) throw new ArtistHubError('These store profiles belong to different HYMN identities. Resolve the profile conflict in Artist profiles.');
  const match = matches[0];
  if (match && ((parsed.spotify && match.spotifyId && parsed.spotify.id !== match.spotifyId) || (parsed.apple && match.appleId && parsed.apple.id !== match.appleId))) throw new ArtistHubError('The store profiles conflict. Use the matched artist’s saved store links.');
  return match || null;
}

export async function enrollHubArtist(userId: number, cardId: number) {
  await ensureUserHandle(userId);
  const result = await prisma.$transaction(async tx => {
    await active(tx, userId);
    // Registry lock serializes enrolment, shared-card attachment and identity edits.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422100, 1)`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422030, ${cardId}::integer)`;
    const card = await tx.artistCard.findFirst({ where: { id: cardId, userId, archivedAt: null } });
    if (!card) throw new ArtistHubError('Choose an active artist card from your library.', 404);
    if (card.hubIdentityId) {
      const existing = await tx.artistHubIdentity.findUniqueOrThrow({ where: { id: card.hubIdentityId } });
      if (existing.ownerUserId !== userId) throw new ArtistHubError('This artist is managed by another HYMN account.');
      return { identity: publicHubCard(existing) };
    }
    const links = savedArtistStoreLinks(card);
    const match = await tx.artistHubIdentity.findFirst({ where: { OR: [{ sourceCardId: card.id }, ...(links.spotify ? [{ spotifyId: links.spotify.id }] : []), ...(links.apple ? [{ appleId: links.apple.id }] : [])] } });
    if (match) {
      for (const recipient of [userId, match.ownerUserId]) await hubNotice(tx, recipient, `artist-hub:claim-conflict:${match.id}:${userId}:${recipient}`, 'Artist profile link conflict', `A conflicting connection was attempted for ${match.displayName}. The existing HYMN mapping remains protected. Review the artist profile or open an ownership case.`);
      return { conflict: true as const };
    }
    const storeConditions = [...(links.spotify ? [{ spotifyArtistId: links.spotify.id }, { spotifyProfileUrl: links.spotify.url }] : []), ...(links.apple ? [{ appleArtistId: links.apple.id }, { appleMusicProfileUrl: links.apple.url }] : [])];
    const earlier = storeConditions.length ? await tx.artistCard.findFirst({ where: { userId: { not: userId }, archivedAt: null, user: { status: 'ACTIVE' }, AND: [{ OR: storeConditions }, { OR: [{ createdAt: { lt: card.createdAt } }, { createdAt: card.createdAt, id: { lt: card.id } }] }] }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }) : null;
    if (earlier) {
      for (const recipient of [userId, earlier.userId]) await hubNotice(tx, recipient, `artist-hub:legacy-conflict:${earlier.id}:${userId}:${recipient}`, 'Existing artist link needs resolution', `${card.artistName} has a store link saved on an earlier HYMN account. Neither account has been verified as the owner by this check. The earlier mapping stays protected while the connection is resolved through account recovery or HYMN support.`);
      return { conflict: true as const };
    }
    const identity = await tx.artistHubIdentity.create({ data: { ownerUserId: userId, sourceCardId: card.id, displayName: card.artistName, spotifyId: links.spotify?.id, appleId: links.apple?.id } });
    await tx.artistCard.update({ where: { id: card.id }, data: { hubIdentityId: identity.id } });
    await tx.auditLog.create({ data: { actorId: userId, action: 'ARTIST_HUB_ENROLLED', entity: 'artist_hub', entityId: String(identity.id), metadata: { cardId, verification: 'linked_only' } } });
    return { identity: publicHubCard(identity) };
  }, { timeout: 30000 });
  if ('conflict' in result) throw new ArtistHubError('This store profile was linked earlier on another HYMN account. Both accounts have been notified. Add the connected artist, recover your old account or contact HYMN support.');
  return result.identity;
}

/** Create an account-owned reference, never grant edit authority over the source artist. */
export async function attachHubArtist(userId: number, identityId: number) {
  return prisma.$transaction(async tx => {
    await active(tx, userId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422100, 1)`;
    const identity = await tx.artistHubIdentity.findUniqueOrThrow({ where: { id: identityId } });
    const source = await tx.artistCard.findFirst({ where: { id: identity.sourceCardId, archivedAt: null, user: { status: 'ACTIVE' } } });
    if (!source) throw new ArtistHubError('This artist is currently unavailable.');
    const existing = await tx.artistCard.findFirst({ where: { userId, hubIdentityId: identityId, archivedAt: null } });
    if (existing) return existing.id;
    const { getUserEntitlements } = await import('./entitlements');
    const entitlement = await getUserEntitlements(userId);
    if (!entitlement.canCreateArtistProfile) throw new ArtistHubError('Your artist profile limit has been reached.');
    const named = await tx.artistCard.findFirst({ where: { userId, artistName: source.artistName } });
    if (named) {
      const local = savedArtistStoreLinks(named), remote = savedArtistStoreLinks(source);
      if (named.archivedAt || named.hubIdentityId || (['spotify', 'apple'] as const).some(key => local[key] && local[key]?.id !== remote[key]?.id) || (!local.spotify && !local.apple)) throw new ArtistHubError('A different artist card uses this name. Resolve it in your library before linking.');
      await preserveArtistReleaseMappings(tx, named);
      await tx.artistCard.update({ where: { id: named.id }, data: { hubIdentityId: identityId, spotifyProfileUrl: source.spotifyProfileUrl, spotifyArtistId: source.spotifyArtistId, appleMusicProfileUrl: source.appleMusicProfileUrl, appleArtistId: source.appleArtistId, instagramUrl: source.instagramUrl, youtubeUrl: source.youtubeUrl, direNoteArtistId: null, direNoteLastSyncedAt: null } });
      return named.id;
    }
    const card = await tx.artistCard.create({ data: { userId, artistName: source.artistName, hubIdentityId: identityId, spotifyProfileUrl: source.spotifyProfileUrl, spotifyArtistId: source.spotifyArtistId, appleMusicProfileUrl: source.appleMusicProfileUrl, appleArtistId: source.appleArtistId, instagramUrl: source.instagramUrl, youtubeUrl: source.youtubeUrl, imageUrl: source.imageUrl } });
    await tx.auditLog.create({ data: { actorId: userId, action: 'ARTIST_HUB_ATTACHED', entity: 'artist_hub', entityId: String(identityId), metadata: { cardId: card.id } } });
    return card.id;
  }, { timeout: 30000 });
}

/** Called by the normal card editor, under the registry and card locks. */
export async function guardHubCardEdit(tx: Tx, card: { id: number; userId: number; hubIdentityId: number | null }, next: { artistName: string; spotifyProfileUrl?: string | null; appleMusicProfileUrl?: string | null; instagramUrl?: string | null; youtubeUrl?: string | null }, changed: boolean) {
  if (!changed) return;
  const parsed = verifiedArtistStoreLinks({ spotify: next.spotifyProfileUrl, apple: next.appleMusicProfileUrl });
  const existing = await tx.artistHubIdentity.findFirst({ where: { id: card.hubIdentityId ?? -1 } });
  if (existing && (existing.ownerUserId !== card.userId || existing.sourceCardId !== card.id)) throw new ArtistHubError('This shared artist is managed from their own HYMN Studio. Select another artist to change the credit.');
  const matches = await tx.artistHubIdentity.findMany({ where: { id: { not: existing?.id ?? -1 }, OR: [...(parsed.spotify ? [{ spotifyId: parsed.spotify.id }] : []), ...(parsed.apple ? [{ appleId: parsed.apple.id }] : [])] } });
  if (matches.length) throw new ArtistHubError('This store profile is already connected to another HYMN artist. Add that artist or open an ownership case.');
  if (existing) {
    await tx.artistHubIdentity.update({ where: { id: existing.id }, data: { displayName: next.artistName, spotifyId: parsed.spotify?.id ?? null, appleId: parsed.apple?.id ?? null, revision: { increment: 1 } } });
    await tx.artistHubEndorsement.updateMany({ where: { identityId: existing.id }, data: { active: false } });
    const references = await tx.artistCard.findMany({ where: { hubIdentityId: existing.id, id: { not: card.id }, archivedAt: null }, orderBy: { id: 'asc' } });
    for (const reference of references) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422030, ${reference.id}::integer)`;
      await preserveArtistReleaseMappings(tx, reference);
      await tx.artistCard.update({ where: { id: reference.id }, data: { artistName: next.artistName, spotifyProfileUrl: next.spotifyProfileUrl || null, spotifyArtistId: parsed.spotify?.id ?? null, appleMusicProfileUrl: next.appleMusicProfileUrl || null, appleArtistId: parsed.apple?.id ?? null, ...(next.instagramUrl !== undefined ? { instagramUrl: next.instagramUrl } : {}), ...(next.youtubeUrl !== undefined ? { youtubeUrl: next.youtubeUrl } : {}), direNoteArtistId: null, direNoteLastSyncedAt: null } });
    }
  }
}

function participationRevision(release: { title: string; tracks: Array<{ id: number; title: string; audioUrl: string | null; metadata: unknown }> }, identityId: number, cards: Array<Parameters<typeof artistIdentityFingerprint>[0] & { id: number; hubIdentityId: number | null }>) {
  const relevant = new Set(cards.filter(card => card.hubIdentityId === identityId).map(card => card.id));
  return createHash('sha256').update(JSON.stringify({ title: release.title, identities: cards.filter(card => relevant.has(card.id)).map(artistIdentityFingerprint), tracks: release.tracks.map(track => ({ id: track.id, title: track.title, audio: track.audioUrl, selected: selectedReleaseArtistIds([track]).filter(id => relevant.has(id)), metadata: track.metadata })) })).digest('hex');
}

/** Requests are created only from server-owned card links. Rejections survive credit removal. */
export async function syncHubParticipation(userId: number, releaseId: number) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422101, ${releaseId}::integer)`;
    const release = await tx.release.findFirst({ where: { id: releaseId, userId, archivedAt: null }, include: { tracks: true } });
    if (!release) throw new ArtistHubError('Release not found.', 404);
    const ids = selectedReleaseArtistIds(release.tracks, release.artistProfileId);
    const cards = await tx.artistCard.findMany({ where: { id: { in: ids }, userId, archivedAt: null } });
    const identities = await tx.artistHubIdentity.findMany({ where: { id: { in: cards.flatMap(card => card.hubIdentityId ? [card.hubIdentityId] : []) }, ownerUserId: { not: userId } } });
    for (const identity of identities) {
      const revision = participationRevision(release, identity.id, cards);
      const before = await tx.artistHubParticipation.findUnique({ where: { releaseId_identityId: { releaseId, identityId: identity.id } } });
      if (before?.status === 'rejected' || before?.revision === revision) continue;
      const row = await tx.artistHubParticipation.upsert({ where: { releaseId_identityId: { releaseId, identityId: identity.id } }, create: { releaseId, identityId: identity.id, ownerUserId: userId, recipientUserId: identity.ownerUserId, revision }, update: { revision, recipientUserId: identity.ownerUserId, status: 'pending', reason: null, decidedAt: null } });
      await hubNotice(tx, identity.ownerUserId, `artist-hub:participation:${row.id}:${revision}`, 'Your artist profile was added to a release', `${identity.displayName} is credited on “${release.title}”. Review participation in HYMN. Submission can continue while your response is pending. Royalties require a separate agreement.`);
    }
    return tx.artistHubParticipation.findMany({ where: { releaseId }, orderBy: { id: 'asc' } });
  }, { timeout: 30000 });
}
export async function assertHubParticipation(releaseId: number, tx: Tx = prisma) {
  if (await tx.artistHubParticipation.count({ where: { releaseId, status: 'rejected' } })) throw new ArtistHubError('An artist declined participation. Open artist profiles to resolve the release before submitting.');
}

export async function respondHubParticipation(userId: number, id: number, revision: string, decision: 'accepted' | 'rejected', reason = '') {
  if (decision === 'rejected' && reason.trim().length < 3) throw new ArtistHubError('Choose a reason for declining.');
  const before = await prisma.artistHubParticipation.findFirst({ where: { id, recipientUserId: userId } });
  if (!before) throw new ArtistHubError('Participation request not found.', 404);
  await syncHubParticipation(before.ownerUserId, before.releaseId);
  return prisma.$transaction(async tx => {
    await active(tx, userId);
    const initial = await tx.artistHubParticipation.findFirst({ where: { id, recipientUserId: userId } });
    if (!initial) throw new ArtistHubError('Participation request not found.', 404);
    // Record a decline immediately, even while an external request is in flight.
    // Restarting a blocked release still serializes with dispatch.
    if (decision === 'accepted') await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422028, ${initial.releaseId}::integer)`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422101, ${initial.releaseId}::integer)`;
    const row = await tx.artistHubParticipation.findUniqueOrThrow({ where: { id } });
    const managedIdentity = await tx.artistHubIdentity.findUniqueOrThrow({ where: { id: row.identityId } });
    if (managedIdentity.ownerUserId !== userId) throw new ArtistHubError('Artist management moved to another account. This account can no longer change participation.', 403);
    if (row.revision !== revision) throw new ArtistHubError('This release changed. Refresh before deciding.');
    if (row.status === decision) return row;
    if (decision === 'accepted' && row.status === 'rejected' && row.intervention !== 'blocked_locally') throw new ArtistHubError('Delivery intervention is already in progress. Resolve the case before restarting delivery.');
    const release = await tx.release.findUniqueOrThrow({ where: { id: row.releaseId } });
    const attempt = await tx.distributionSubmissionAttempt.findFirst({ where: { releaseId: row.releaseId }, orderBy: { id: 'desc' } });
    const intervention = decision === 'rejected' ? interventionFor(attempt?.state, release.status) : 'none';
    const result = await tx.artistHubParticipation.update({ where: { id }, data: { status: decision, reason: decision === 'rejected' ? reason.trim().slice(0, 1000) : null, decidedAt: new Date(), intervention } });
    await tx.auditLog.create({ data: { actorId: userId, action: 'ARTIST_HUB_PARTICIPATION_DECIDED', entity: 'release', entityId: String(row.releaseId), metadata: { participationId: id, revision, previous: row.status, decision, intervention } } });
    await hubNotice(tx, row.ownerUserId, `artist-hub:decision:${id}:${revision}:${decision}`, decision === 'accepted' ? 'Artist participation approved' : 'Artist participation declined', decision === 'accepted' ? `Participation on “${release.title}” was approved. Royalty shares remain separate.` : `An artist declined participation on “${release.title}”. ${intervention === 'blocked_locally' ? 'Submission is blocked.' : 'HYMN is checking delivery and the available resolution.'} Reason: ${reason.trim().slice(0, 500)}`);
    return result;
  }, { timeout: 30000, maxWait: 10000 });
}

export async function openHubCase(userId: number, identityId: number, kind: 'ownership' | 'transfer', reason: string) {
  const identity = await prisma.artistHubIdentity.findUniqueOrThrow({ where: { id: identityId } });
  if (identity.ownerUserId === userId) throw new ArtistHubError('Start the transfer from your destination account.');
  if (reason.trim().length < 10) throw new ArtistHubError('Describe the issue in at least ten characters.');
  const result = await prisma.$transaction(async tx => {
    await active(tx, userId);
    const eventKey = `artist-hub:case:${identityId}:${userId}:${kind}`;
    const row = await tx.artistHubCase.upsert({ where: { eventKey }, create: { eventKey, requesterUserId: userId, identityId, kind, reason: reason.trim().slice(0, 2000) }, update: {} });
    for (const recipient of [userId, identity.ownerUserId]) await hubNotice(tx, recipient, `${eventKey}:${recipient}`, 'Artist profile ownership needs resolution', `A ${kind === 'transfer' ? 'transfer request' : 'conflicting ownership claim'} was opened for ${identity.displayName}. The established mapping remains protected. Open HYMN artist profiles to review case #${row.id}.`);
    return row;
  });
  await createAdminTaskOnce({ eventKey: result.eventKey, type: 'Artist identity', priority: 'high', title: `Artist identity case #${result.id}`, body: result.reason, href: '/admin/tasks', entityType: 'artist_hub_case', entityId: result.id });
  return { id: result.id, status: result.status };
}

export async function hubOverview(userId: number) {
  const [cards, identities, requests, outgoing, cases, payout, handle] = await Promise.all([
    prisma.artistCard.findMany({ where: { userId, archivedAt: null }, orderBy: { id: 'asc' } }),
    prisma.artistHubIdentity.findMany({ where: { ownerUserId: userId } }),
    prisma.artistHubParticipation.findMany({ where: { recipientUserId: userId }, orderBy: { updatedAt: 'desc' }, take: 100 }),
    prisma.artistHubParticipation.findMany({ where: { ownerUserId: userId }, orderBy: { updatedAt: 'desc' }, take: 100 }),
    prisma.artistHubCase.findMany({ where: { OR: [{ requesterUserId: userId }, { identityId: { in: (await prisma.artistHubIdentity.findMany({ where: { ownerUserId: userId }, select: { id: true } })).map(row => row.id) } }] }, take: 50, orderBy: { id: 'desc' } }),
    getPayoutCredential(userId), ensureUserHandle(userId),
  ]);
  const releases = await prisma.release.findMany({ where: { id: { in: [...requests, ...outgoing].map(row => row.releaseId) } }, select: { id: true, title: true, status: true, artistName: true, releaseDate: true, tracks: { select: { title: true, primaryArtist: true }, orderBy: { trackNumber: 'asc' } }, user: { select: { name: true, handle: { select: { tag: true } } } } } });
  const decorate = (row: typeof requests[number]) => ({ id: row.id, releaseId: row.releaseId, identityId: row.identityId, revision: row.revision, status: row.status, reason: row.reason, intervention: row.intervention, title: releases.find(release => release.id === row.releaseId)?.title || 'Release unavailable', uploader: releases.find(release => release.id === row.releaseId)?.user.handle?.tag || 'HYMN collaborator', tracks: releases.find(release => release.id === row.releaseId)?.tracks.map(track => ({ title: track.title, artist: track.primaryArtist })) || [], updatedAt: row.updatedAt.toISOString() });
  const live = await prisma.release.findMany({ where: { status: 'LIVE', archivedAt: null, OR: [{ userId }, { id: { in: requests.filter(row => row.status === 'accepted').map(row => row.releaseId) } }] }, select: { id: true, title: true, userId: true, artistProfileId: true, tracks: { select: { metadata: true } } }, orderBy: { id: 'desc' }, take: 100 });
  const [liveCards, liveParticipants, liveAgreements] = await Promise.all([
    prisma.artistCard.findMany({ where: { id: { in: [...new Set(live.flatMap(release => release.tracks.flatMap(track => attachedArtistProfileIds(track.metadata, release.artistProfileId))))] } } }),
    prisma.artistHubParticipation.findMany({ where: { releaseId: { in: live.map(release => release.id) }, status: 'accepted' } }),
    prisma.splitRecord.findMany({ where: { releaseId: { in: live.map(release => release.id) }, trackId: null, status: { not: 'archived' } }, select: { releaseId: true } }),
  ]);
  const livePeople = await prisma.user.findMany({ where: { id: { in: [...new Set([...live.map(release => release.userId), ...liveParticipants.map(row => row.recipientUserId)])] }, status: 'ACTIVE' }, select: { id: true, name: true, handle: { select: { tag: true } } } });
  const releasesForSplits = live.map(release => {
    const selected = [...new Set(release.tracks.flatMap(track => attachedArtistProfileIds(track.metadata, release.artistProfileId)))];
    const releaseCards = liveCards.filter(card => selected.includes(card.id) && card.userId === release.userId);
    const identityIds = releaseCards.flatMap(card => card.hubIdentityId ? [card.hubIdentityId] : []);
    const approved = liveParticipants.filter(row => row.releaseId === release.id && identityIds.includes(row.identityId));
    const candidateIds = new Set([release.userId, ...approved.map(row => row.recipientUserId)]);
    const people = livePeople.filter(person => candidateIds.has(person.id));
    return { id: release.id, title: release.title, recipients: people.map(person => ({ userId: person.id, name: person.name, handle: person.handle?.tag || null })), hasAgreement: liveAgreements.some(row => row.releaseId === release.id) };
  });
  const endorsements = await prisma.artistHubEndorsement.findMany({ where: { identityId: { in: identities.map(identity => identity.id) }, active: true } });
  const eligibleEndorsers = await prisma.payoutCredential.findMany({ where: { userId: { in: endorsements.map(row => row.userId) }, status: 'verified' }, select: { userId: true } });
  const eligible = new Set(eligibleEndorsers.map(row => row.userId));
  return { handle, payout, cards: cards.map(card => ({ id: card.id, name: card.artistName, spotifyUrl: card.spotifyProfileUrl, appleUrl: card.appleMusicProfileUrl, instagramUrl: card.instagramUrl, youtubeUrl: card.youtubeUrl, hubIdentityId: card.hubIdentityId, managed: identities.some(identity => identity.sourceCardId === card.id), confirmations: endorsements.filter(row => row.identityId === card.hubIdentityId && eligible.has(row.userId) && row.userId !== userId).length })), requests: requests.map(decorate), outgoing: outgoing.map(decorate), cases: cases.map(row => ({ id: row.id, kind: row.kind, status: row.status, identityId: row.identityId, reason: row.reason, canDecide: row.kind === 'transfer' && row.status === 'open' && identities.some(identity => identity.id === row.identityId) })), releasesForSplits };
}
export type ArtistHubOverview = Awaited<ReturnType<typeof hubOverview>>;
