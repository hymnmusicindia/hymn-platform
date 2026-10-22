import 'server-only';
import { createHash } from 'node:crypto';
import type { ArtistCard, Prisma, ReleaseArtistIdentity } from '@prisma/client';
import { prisma } from './prisma';
import { attachedArtistProfileIds, savedArtistStoreLinks, verifiedArtistStoreLinks } from './artist-store-links';
import type { ArtistProfile } from './types';


const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function selectedReleaseArtistIds(tracks: Array<{ metadata?: unknown; artistProfileIds?: number[]; featuredArtistProfileIds?: number[] }>, fallback: number | null = null) {
  if (!tracks.length && fallback) return [fallback];
  return [...new Set(tracks.flatMap(track => {
    const root = record(track.metadata), meta = Object.keys(record(root.metadata)).length ? record(root.metadata) : root;
    const featured = track.featuredArtistProfileIds ?? meta.featuredArtistProfileIds;
    return [...attachedArtistProfileIds(track.artistProfileIds ? track : track.metadata, fallback), ...(Array.isArray(featured) ? featured.filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0) : [])];
  }))].sort((a, b) => a - b);
}
type IdentityCard = Pick<ArtistCard, 'artistName' | 'spotifyProfileUrl' | 'spotifyArtistId' | 'appleMusicProfileUrl' | 'appleArtistId' | 'youtubeUrl' | 'instagramUrl'>;
function instagramIdentity(value: string | null) {
  if (!value) return null;
  try { const url = new URL(value.startsWith('@') ? `https://instagram.com/${value.slice(1)}` : value); if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname) || url.username || url.password || url.port) return value; return `https://www.instagram.com${url.pathname.replace(/\/$/, '')}`; } catch { return value; }
}
export function cardIdentity(card: IdentityCard) {
  const links = savedArtistStoreLinks(card);
  return { artistName: card.artistName, spotifyUrl: links.spotify?.url ?? null, appleUrl: links.apple?.url ?? null, youtubeUrl: verifiedArtistStoreLinks({ youtube: card.youtubeUrl }).youtube?.url ?? (card.youtubeUrl || null), instagramUrl: instagramIdentity(card.instagramUrl) };
}
export const artistIdentityFingerprint = (card: IdentityCard) => hash(cardIdentity(card));
const selectionHash = (ids: number[]) => hash([...new Set(ids)].sort((a, b) => a - b));
const editable = new Set(['DRAFT', 'AWAITING_PAYMENT', 'CHANGES_REQUESTED', 'DISTRIBUTOR_CHANGES_REQUIRED', 'REJECTED', 'RESUBMITTED']);
export class ArtistVerificationError extends Error { readonly status = 409; }

async function context(userId: number, releaseId: number, ids?: number[]) {
  const release = await prisma.release.findFirst({ where: { id: releaseId, userId, archivedAt: null }, include: { tracks: { select: { metadata: true } }, artistIdentities: true } });
  if (!release) throw new ArtistVerificationError('Release not found.');
  const selected = ids ?? selectedReleaseArtistIds(release.tracks, release.artistProfileId);
  const cards = await prisma.artistCard.findMany({ where: { id: { in: selected }, userId, archivedAt: null } });
  if (cards.length !== selected.length) throw new ArtistVerificationError('Select active artist cards from your own account.');
  return { release, cards, ids: selected, selectionHash: selectionHash(selected) };
}

/** A live track must explicitly reference this card. Names alone never qualify. */
async function liveArtistIds(userId: number, excludingReleaseId: number) {
  const releases = await prisma.release.findMany({ where: { userId, id: { not: excludingReleaseId }, archivedAt: null, OR: [{ status: { in: ['LIVE', 'PARTIALLY_LIVE'] } }, { tracks: { some: { distributorStatus: { in: ['live', 'LIVE'] } } } }] }, select: { status: true, artistProfileId: true, tracks: { select: { metadata: true, distributorStatus: true } } } });
  return new Set(releases.flatMap(release => [...(release.status === 'LIVE' && release.artistProfileId ? [release.artistProfileId] : []), ...release.tracks.filter(track => release.status === 'LIVE' || track.distributorStatus?.toLowerCase() === 'live').flatMap(track => selectedReleaseArtistIds([track], release.artistProfileId))]));
}

export async function getArtistVerification(userId: number, releaseId: number, ids?: number[]) {
  const ctx = await context(userId, releaseId, ids);
  if (!editable.has(ctx.release.status)) throw new ArtistVerificationError('This release is no longer open for artist verification.');
  const liveIds = await liveArtistIds(userId, releaseId);
  const artists = ctx.cards.map(card => {
    const saved = ctx.release.artistIdentities.find(row => row.artistCardId === card.id);
    const required = liveIds.has(card.id);
    const approved = Boolean(saved?.confirmedAt && saved.confirmedBy === userId && saved.sourceFingerprint === artistIdentityFingerprint(card) && saved.selectionHash === ctx.selectionHash);
    return { artistCardId: card.id, name: card.artistName, spotifyUrl: saved?.sourceFingerprint === artistIdentityFingerprint(card) ? saved.spotifyUrl : cardIdentity(card).spotifyUrl, appleUrl: cardIdentity(card).appleUrl, youtubeUrl: card.youtubeUrl, instagramUrl: card.instagramUrl, fingerprint: artistIdentityFingerprint(card), required, approved };
  });
  return { releaseId, artists: artists.filter(artist => artist.required && !artist.approved) };
}

function snapshot(card: ArtistCard, ids: number[]) {
  return { artistCardId: card.id, ...cardIdentity(card), providerArtistId: card.direNoteArtistId, sourceFingerprint: artistIdentityFingerprint(card), selectionHash: selectionHash(ids) };
}

/** Before changing a card, preserve mappings for every explicitly associated old release. */
export async function preserveArtistReleaseMappings(tx: Prisma.TransactionClient, card: ArtistCard) {
  const releases = await tx.release.findMany({ where: { userId: card.userId }, select: { id: true, artistProfileId: true, tracks: { select: { metadata: true } } } });
  const data = releases.flatMap(release => {
    const ids = selectedReleaseArtistIds(release.tracks, release.artistProfileId);
    return ids.includes(card.id) ? [{ releaseId: release.id, ...snapshot(card, ids) }] : [];
  });
  if (data.length) await tx.releaseArtistIdentity.createMany({ data, skipDuplicates: true });
}

export type ArtistProfileApproval = { artistCardId: number; fingerprint: string; spotifyUrl: string; appleUrl?: string | null; youtubeUrl?: string | null; instagramUrl?: string | null; openedSpotifyUrl: string; approved: true };
function approvedLinks(input: ArtistProfileApproval) {
  const verified = verifiedArtistStoreLinks({ spotify: input.spotifyUrl, apple: input.appleUrl, youtube: input.youtubeUrl });
  if (!verified.spotify || verified.spotify.url !== verifiedArtistStoreLinks({ spotify: input.openedSpotifyUrl }).spotify?.url) throw new ArtistVerificationError('Open the Spotify artist profile you are approving. Use an open.spotify.com/artist/ link.');
  if (input.appleUrl && !verified.apple) throw new ArtistVerificationError('Enter a valid Apple Music artist profile link.');
  if (input.youtubeUrl && !verified.youtube) throw new ArtistVerificationError('Enter a valid YouTube channel link.');
  let instagramUrl: string | null = null;
  if (input.instagramUrl) {
    try { const url = new URL(input.instagramUrl); if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname) || url.username || url.password || url.port || !/^\/[A-Za-z0-9._]+\/?$/.test(url.pathname)) throw Error(); instagramUrl = `https://www.instagram.com${url.pathname.replace(/\/$/, '')}`; }
    catch { throw new ArtistVerificationError('Enter a valid Instagram profile link.'); }
  }
  return { spotifyUrl: verified.spotify.url, appleUrl: verified.apple?.url ?? null, youtubeUrl: verified.youtube?.url ?? null, instagramUrl };
}

export async function approveReleaseArtistProfiles(userId: number, releaseId: number, ids: number[], approvals: ArtistProfileApproval[]) {
  const ctx = await context(userId, releaseId, ids);
  if (!editable.has(ctx.release.status)) throw new ArtistVerificationError('This release is no longer open for artist verification.');
  if (new Set(approvals.map(a => a.artistCardId)).size !== approvals.length) throw new ArtistVerificationError('Duplicate artist approvals.');
  const checked = approvals.map(input => {
    const card = ctx.cards.find(card => card.id === input.artistCardId);
    if (!card || input.approved !== true || input.fingerprint !== artistIdentityFingerprint(card)) throw new ArtistVerificationError('The artist card changed. Refresh the profile check before approving.');
    return { card, input, links: approvedLinks(input) };
  });
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422028, ${releaseId}::integer)`;
    if (await tx.distributionSubmissionAttempt.findFirst({ where: { releaseId, isCurrent: true, OR: [{ state: 'processing' }, { state: 'submitted', providerStatus: { in: ['queued', 'processing'] } }] } })) throw new ArtistVerificationError('An accepted release is still processing. Wait for the current delivery before changing its mapping.');
    // Serialise card corrections with other submissions and the normal card editor.
    for (const { card } of [...checked].sort((a, b) => a.card.id - b.card.id)) await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422030, ${card.id}::integer)`;
    const release = await tx.release.findUniqueOrThrow({ where: { id: releaseId } });
    if (release.userId !== userId || release.archivedAt || !editable.has(release.status)) throw new ArtistVerificationError('The release changed. Refresh before approving.');
    for (const { card: before, input, links } of checked) {
      const card = await tx.artistCard.findUniqueOrThrow({ where: { id: before.id } });
      if (card.archivedAt || artistIdentityFingerprint(card) !== input.fingerprint) throw new ArtistVerificationError('The artist card changed. Refresh before approving.');
      const corrected = JSON.stringify(cardIdentity(card)) !== JSON.stringify({ artistName: card.artistName, ...links });
      if (corrected) {
        await preserveArtistReleaseMappings(tx, card);
        // A new local mapping starts unbound. Ingestion resolves its provider artist ID;
        // never update a historical provider artist to point to another store identity.
        await tx.artistCard.update({ where: { id: card.id }, data: { spotifyProfileUrl: links.spotifyUrl, spotifyArtistId: verifiedArtistStoreLinks({ spotify: links.spotifyUrl }).spotify!.id, appleMusicProfileUrl: links.appleUrl, appleArtistId: verifiedArtistStoreLinks({ apple: links.appleUrl }).apple?.id ?? null, youtubeUrl: links.youtubeUrl, instagramUrl: links.instagramUrl, direNoteArtistId: null, direNoteLastSyncedAt: null, ...(cardIdentity(card).spotifyUrl !== links.spotifyUrl ? { imageUrl: null, followers: null } : {}) } });
      }
      const current = await tx.artistCard.findUniqueOrThrow({ where: { id: card.id } });
      const data = { ...snapshot(current, ids), confirmedAt: new Date(), confirmedBy: userId, openedSpotifyUrl: links.spotifyUrl, corrected, previousProviderArtistId: corrected ? card.direNoteArtistId : null };
      await tx.releaseArtistIdentity.upsert({ where: { releaseId_artistCardId: { releaseId, artistCardId: card.id } }, create: { releaseId, ...data }, update: data });
      await tx.auditLog.create({ data: { actorId: userId, action: 'ARTIST_PROFILE_APPROVED', entity: 'release', entityId: String(releaseId), metadata: { artistCardId: card.id, scope: 'this_and_future_releases', before: cardIdentity(card), approved: links, openedSpotifyUrl: links.spotifyUrl, previousProviderArtistId: card.direNoteArtistId, corrected, fingerprint: data.sourceFingerprint, selectionHash: data.selectionHash } } });
    }
    // Profile approvals are separate from metadata, but invalidate any earlier checkout review.
    await tx.release.update({ where: { id: releaseId }, data: { reviewConfirmedAt: null, reviewConfirmedBy: null, reviewMetadataHash: null } });
  }, { timeout: 30000 });
}

/** Used at review, checkout, submission, and delivery. Customer metadata cannot forge this. */
export async function assertReleaseArtistVerification(userId: number, releaseId: number, ids?: number[], freeze = false) {
  const ctx = await context(userId, releaseId, ids);
  const submitted = !editable.has(ctx.release.status);
  const liveIds = await liveArtistIds(userId, releaseId);
  for (const card of ctx.cards) {
    const saved = ctx.release.artistIdentities.find(row => row.artistCardId === card.id);
    if (submitted && saved) continue; // Already-submitted mappings are immutable.
    if (liveIds.has(card.id)) {
      if (!saved?.confirmedAt || saved.confirmedBy !== userId || saved.sourceFingerprint !== artistIdentityFingerprint(card) || saved.selectionHash !== ctx.selectionHash) throw new ArtistVerificationError(`Open and confirm ${card.artistName}'s Spotify artist profile before submitting this release.`);
    }

  }
  if (freeze) await prisma.$transaction(async tx => {
    for (const id of ctx.ids) await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422030, ${id}::integer)`;
    for (const original of ctx.cards) {
      const card = await tx.artistCard.findUniqueOrThrow({ where: { id: original.id } });
      if (card.archivedAt || artistIdentityFingerprint(card) !== artistIdentityFingerprint(original)) throw new ArtistVerificationError('The artist card changed during submission. Refresh and confirm the latest profile.');
      const saved = await tx.releaseArtistIdentity.findUnique({ where: { releaseId_artistCardId: { releaseId, artistCardId: card.id } } });
      if (!saved) await tx.releaseArtistIdentity.create({ data: { releaseId, ...snapshot(card, ctx.ids) } });
      else if (!saved.confirmedAt && !submitted) await tx.releaseArtistIdentity.update({ where: { id: saved.id }, data: snapshot(card, ctx.ids) });
    }
  }, { timeout: 30000 });
}

export async function releaseArtistProfiles(releaseId: number, profiles: ArtistProfile[]) {
  const rows = await prisma.releaseArtistIdentity.findMany({ where: { releaseId }, include: { artistCard: true } });
  const all = [...profiles];
  for (const row of rows) if (!all.some(profile => profile.id === row.artistCardId)) {
    all.push({ id: row.artistCardId, userId: row.artistCard.userId, name: row.artistName, isLinked: Boolean(row.spotifyUrl || row.appleUrl), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  }
  return all.map(profile => {
    const saved = rows.find(row => row.artistCardId === profile.id);
    return saved ? { ...profile, name: saved.artistName, spotifyUrl: saved.spotifyUrl ?? undefined, spotifyArtistId: verifiedArtistStoreLinks({ spotify: saved.spotifyUrl }).spotify?.id, appleUrl: saved.appleUrl ?? undefined, appleArtistId: verifiedArtistStoreLinks({ apple: saved.appleUrl }).apple?.id, youtubeUrl: saved.youtubeUrl ?? '', instagramUrl: saved.instagramUrl ?? '' } : profile;
  });
}

/** Compare identities, excluding provider binding and mutable nonidentity card fields. */
export function snapshotMatchesCard(saved: ReleaseArtistIdentity, card: ArtistCard) {
  return JSON.stringify({ artistName: saved.artistName, spotifyUrl: saved.spotifyUrl, appleUrl: saved.appleUrl, youtubeUrl: saved.youtubeUrl, instagramUrl: saved.instagramUrl }) === JSON.stringify(cardIdentity(card));
}

/** Unknown historical links may be enriched; known different identities may not be reused. */
export function conflictsWithHistoricalIdentity(previous: ReleaseArtistIdentity, next: ReleaseArtistIdentity) {
  const oldLinks = verifiedArtistStoreLinks({ spotify: previous.spotifyUrl, apple: previous.appleUrl });
  const newLinks = verifiedArtistStoreLinks({ spotify: next.spotifyUrl, apple: next.appleUrl });
  return previous.artistName.trim().toLowerCase() !== next.artistName.trim().toLowerCase() ||
    (['spotify', 'apple'] as const).some(key => Boolean(oldLinks[key] && oldLinks[key]?.id !== newLinks[key]?.id)) ||
    Boolean(previous.youtubeUrl && previous.youtubeUrl !== next.youtubeUrl) ||
    Boolean(previous.instagramUrl && previous.instagramUrl !== next.instagramUrl);
}
