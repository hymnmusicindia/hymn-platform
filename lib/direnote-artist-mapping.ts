import 'server-only';
import { randomUUID } from 'node:crypto';
import { prisma } from './prisma';
import { getDireNoteArtistInformation } from './direnote/direnote-client';
import { requestDireNoteV24 } from './direnote/v24-client';
import { reserveDireNoteRequest } from './direnote-rate-limit';
import { verifiedArtistStoreLinks, savedArtistStoreLinks } from './artist-store-links';
import { confirmsDireNoteIdentityChange } from './direnote/v24-reconciliation';
import { redactDireNoteDiagnostic, type DireNotePayload } from './direnote';
import { createAdminTaskOnce } from './task-queue';

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const safeJson = (value: unknown) => JSON.parse(JSON.stringify(redactDireNoteDiagnostic(value)));
const sameName = (a: string, b: unknown) => typeof b === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();
export async function flagArtistMappingReview(input: { releaseId?: number | null; artistCardId?: number; name: string; message: string }) {
  const task = await createAdminTaskOnce({ eventKey: input.releaseId ? `release:${input.releaseId}:artist-mapping` : `artist:${input.artistCardId}:mapping`, type: 'DireNote Failed', priority: 'high', title: `Artist mapping check: ${input.name}`, body: input.message, href: '/admin/integrations/direnote', entityType: input.releaseId ? 'release' : 'artist', entityId: input.releaseId ?? input.artistCardId! });
  if (task.status === 'resolved') {
    await prisma.adminTask.update({ where: { id: task.id }, data: { status: 'open', resolvedAt: null, resolutionNote: null, body: input.message } });
    await prisma.adminTaskHistory.create({ data: { taskId: task.id, action: 'reopened', metadata: { reason: 'Artist mapping check failed again.' } } });
  }
}
async function rememberCooldown(result: { httpStatus: number | null; retryAfterSeconds?: number }) {
  if (result.httpStatus === 429) await prisma.direNoteLog.create({ data: { action: 'provider_rate_limit', success: false, httpStatus: 429, responseJson: { retryAt: new Date(Date.now() + Math.max(1, result.retryAfterSeconds ?? 60) * 1000).toISOString() } } });
}

/** Fill only empty provider identities. A different stored identity always needs review. */
export async function ensureDireNoteArtistMapping(cardId: number, releaseId: number | null, actorId?: number | null, deadline = Date.now() + 45000) {
  const requestOptions = () => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw Error('Artist mapping verification timed out. Delivery is paused; retry the check before submitting.');
    return { timeoutMs: Math.min(10000, remaining) };
  };
  const card = await prisma.artistCard.findUniqueOrThrow({ where: { id: cardId } });
  if (card.archivedAt) throw Error('The selected artist card is archived. Select an active card before delivery.');
  const desired = savedArtistStoreLinks(card);
  if (!desired.spotify && !desired.apple || !card.direNoteArtistId) return; // First ingestion carries the explicit store URLs.
  const payload: Record<string, string | number> = { artist_id: Number(card.direNoteArtistId) };
  if (!Number.isSafeInteger(payload.artist_id) || Number(payload.artist_id) <= 0) throw Error('The selected artist has an invalid delivery identity. HYMN review is required.');
  const peers = await prisma.artistCard.findMany({ where: { direNoteArtistId: card.direNoteArtistId, id: { not: card.id }, archivedAt: null }, select: { artistName: true, spotifyProfileUrl: true, spotifyArtistId: true, appleMusicProfileUrl: true, appleArtistId: true } });
  if (peers.some(peer => !sameName(card.artistName, peer.artistName) || ((peer.spotifyProfileUrl || peer.spotifyArtistId) && desired.spotify && savedArtistStoreLinks(peer).spotify?.id !== desired.spotify.id) || ((peer.appleMusicProfileUrl || peer.appleArtistId) && desired.apple && savedArtistStoreLinks(peer).apple?.id !== desired.apple.id))) throw Error('This delivery identity is linked to conflicting artist cards. HYMN review is required before delivery.');
  await reserveDireNoteRequest('artist_mapping_check', releaseId, actorId);
  const result = await getDireNoteArtistInformation(card.direNoteArtistId, requestOptions());
  await rememberCooldown(result);
  await prisma.direNoteLog.create({ data: { releaseId, action: 'artist_mapping_check', success: result.success, httpStatus: result.httpStatus, createdByAdminId: actorId ?? null, requestPayloadRedacted: { artistCardId: card.id, artistId: card.direNoteArtistId }, responseJson: safeJson(result.data ?? null) } });
  const artist = object(object(result.data).artist);
  if (!result.success || String(artist.artist_id) !== card.direNoteArtistId || !sameName(card.artistName, artist.name)) throw Error('The artist delivery identity could not be verified. Delivery is paused; retry the identity check before submitting.');
  const links = object(artist.links), remote = verifiedArtistStoreLinks(links);
  for (const provider of ['spotify', 'apple'] as const) {
    const expected = desired[provider]; if (!expected) continue;
    if (links[provider] && remote[provider]?.id !== expected.id) {
      if (releaseId) await prisma.direNoteReconciliationDiscrepancy.create({ data: { releaseId, field: `artist_${card.id}_mapping_${provider}`, hymnValue: expected.url, direNoteValue: String(links[provider]), severity: 'critical' } });
      throw Error(`${provider === 'spotify' ? 'Spotify' : 'Apple Music'} artist mapping differs from the selected HYMN card. Delivery is paused for identity review.`);
    }
    if (!links[provider]) payload[`${provider}_url`] = expected.url;
  }
  const resource = `artist:${card.direNoteArtistId}`;
  const claim = await prisma.$transaction(async tx => {
    // Share the same lock and audit format as the explicit admin identity tools.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422027)`;
    const pending = await tx.direNoteLog.findFirst({ where: { action: 'v24_update_artist', AND: [{ requestPayloadRedacted: { path: ['resource'], equals: resource } }, { responseJson: { path: ['state'], equals: 'unconfirmed' } }] } });
    if (pending) throw Error(`An artist update has an unconfirmed outcome (audit ${pending.id}). Reconcile that update before delivery; it will not be resent.`);
    const current = await tx.artistCard.findUniqueOrThrow({ where: { id: card.id } });
    if (current.archivedAt || current.updatedAt.getTime() !== card.updatedAt.getTime()) throw Error('The artist card changed during the mapping check. Refresh and retry before delivery.');
    if (Object.keys(payload).length === 1) return null;
    return tx.direNoteLog.create({ data: { releaseId, action: 'v24_update_artist', success: false, createdByAdminId: actorId ?? null, requestPayloadRedacted: { operationId: randomUUID(), resource, cacheKey: JSON.stringify(payload), payload, source: 'delivery_artist_mapping', artistCardId: card.id }, responseJson: { state: 'unconfirmed' }, errorMessage: 'Artist mapping update prepared; outcome not confirmed.' } });
  });
  if (!claim) return;
  let dispatched = false;
  try {
    // The audit claim excludes other HYMN identity writes. Re-read after claiming
    // so a profile updated between the first lookup and claim is never overwritten.
    await reserveDireNoteRequest('artist_mapping_prewrite', releaseId, actorId);
    const latest = await getDireNoteArtistInformation(card.direNoteArtistId, requestOptions());
    await rememberCooldown(latest);
    const latestArtist = object(object(latest.data).artist), latestLinks = object(latestArtist.links);
    const latestVerified = verifiedArtistStoreLinks(latestLinks);
    if (!latest.success || String(latestArtist.artist_id) !== card.direNoteArtistId || !sameName(card.artistName, latestArtist.name)) throw Error('Artist mapping changed or could not be checked before update. Delivery remains paused.');
    for (const provider of ['spotify', 'apple'] as const) {
      const wanted = desired[provider]; if (!wanted || !latestLinks[provider]) continue;
      if (latestVerified[provider]?.id !== wanted.id) throw Error('A different artist mapping appeared before update. Delivery remains paused for review.');
      delete payload[`${provider}_url`];
    }
    const currentCard = await prisma.artistCard.findUniqueOrThrow({ where: { id: card.id } });
    if (currentCard.archivedAt || currentCard.updatedAt.getTime() !== card.updatedAt.getTime()) throw Error('The artist card changed before its mapping update. Refresh and retry before delivery.');
    if (Object.keys(payload).length === 1) {
      await prisma.direNoteLog.update({ where: { id: claim.id }, data: { success: true, responseJson: { state: 'confirmed', noWriteNeeded: true, provider: safeJson(latest.data) }, errorMessage: null } });
      return;
    }
    await reserveDireNoteRequest('artist_mapping_update', releaseId, actorId);
    const updateOptions = requestOptions();
    dispatched = true;
    const update = await requestDireNoteV24('update_artist', payload, updateOptions);
    await rememberCooldown(update);
    if (!update.success) {
      const rejected = [400, 401, 403, 404, 409, 422, 429].includes(update.httpStatus ?? 0);
      await prisma.direNoteLog.update({ where: { id: claim.id }, data: { httpStatus: update.httpStatus, responseJson: { state: rejected ? 'rejected' : 'unconfirmed', provider: safeJson(update.data ?? null) }, errorMessage: 'Artist mapping was not confirmed. Delivery remains paused.' } });
      throw Error(`Artist mapping could not be updated (audit ${claim.id}). Delivery is paused; resolve the recorded update before retrying.`);
    }
    await prisma.direNoteLog.update({ where: { id: claim.id }, data: { httpStatus: update.httpStatus, responseJson: { state: 'unconfirmed', awaitingVerification: true, provider: safeJson(update.data) }, errorMessage: 'Update acknowledged; independent artist lookup still required.' } });
    await reserveDireNoteRequest('artist_mapping_verify', releaseId, actorId);
    const proof = await getDireNoteArtistInformation(card.direNoteArtistId, requestOptions());
    await rememberCooldown(proof);
    const verifiedArtist = object(object(proof.data).artist);
    const verifiedLinks = verifiedArtistStoreLinks(verifiedArtist.links);
    if (!proof.success || !sameName(card.artistName, verifiedArtist.name) || !confirmsDireNoteIdentityChange('update_artist', payload, object(proof.data)) || (desired.spotify && verifiedLinks.spotify?.id !== desired.spotify.id) || (desired.apple && verifiedLinks.apple?.id !== desired.apple.id)) throw Error(`Artist mapping update awaits verification (audit ${claim.id}). Delivery is paused; no update will be resent.`);
    await prisma.direNoteLog.update({ where: { id: claim.id }, data: { success: true, httpStatus: update.httpStatus, responseJson: { state: 'confirmed', provider: safeJson(proof.data) }, errorMessage: null } });
    const current = await prisma.artistCard.findUniqueOrThrow({ where: { id: card.id } });
    if (current.archivedAt || current.updatedAt.getTime() !== card.updatedAt.getTime()) throw Error('The artist card changed while its mapping was updated. Review the current identity before delivery.');
  } catch (error) {
    if (!dispatched) await prisma.direNoteLog.update({ where: { id: claim.id }, data: { responseJson: { state: 'not_sent' }, errorMessage: 'No provider update was sent; retry the mapping check.' } });
    throw error;
  }
}

export async function verifyReleaseArtistMappings(userId: number, releaseId: number, payload: DireNotePayload, actorId?: number | null) {
  const deadline = Date.now() + 45000;
  const artists = [...payload.artists, ...(payload.featuring_artists ?? []), ...payload.tracks.flatMap(track => [...(track.artists ?? []), ...(track.featuring_artists ?? [])])];
  // Payload names alone never authorize a provider write: require the exact saved store identity.
  const cards = await prisma.artistCard.findMany({ where: { userId, archivedAt: null } });
  const checked = new Set<number>();
  for (const artist of artists) {
    const wanted = verifiedArtistStoreLinks({ spotify: artist.spotify_url, apple: artist.apple_url });
    const matches = cards.filter(card => sameName(card.artistName, artist.name) && (wanted.spotify ? savedArtistStoreLinks(card).spotify?.id === wanted.spotify.id : wanted.apple ? savedArtistStoreLinks(card).apple?.id === wanted.apple.id : false));
    if (matches.length > 1) throw Error('Multiple saved cards match this artist delivery identity. Select one canonical card before delivery.');
    const card = matches[0];
    if (!card) {
      if (cards.some(candidate => sameName(candidate.artistName, artist.name) && (candidate.spotifyProfileUrl || candidate.appleMusicProfileUrl || candidate.spotifyArtistId || candidate.appleArtistId))) throw Error('A saved artist identity is missing from the delivery payload. Select its HYMN artist card before delivery.');
      continue;
    }
    const saved = savedArtistStoreLinks(card);
    if (saved.spotify && wanted.spotify?.id !== saved.spotify.id || saved.apple && wanted.apple?.id !== saved.apple.id) throw Error('A saved store profile is missing or different in the artist delivery payload. Refresh the release before delivery.');
    if (!checked.has(card.id)) { checked.add(card.id); await ensureDireNoteArtistMapping(card.id, releaseId, actorId, deadline); }
  }
}
