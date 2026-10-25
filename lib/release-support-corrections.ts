import 'server-only';
import { createHash } from 'node:crypto';
import type { Prisma, ReleaseChangeRequest } from '@prisma/client';
import sharp from 'sharp';
import { prisma } from './prisma';
import { correctionSchema } from './release-correction-contract';
import { localPrivateStorage } from './private-storage';
import { verifyAudioIntegrity } from './media-integrity';
import { requestDireNoteCorrection } from './direnote/support-client';
import { enqueueAmendmentUpdate, amendmentTransactionOptions } from './release-amendment-notifications';

const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export async function validateReleaseCorrection(releaseId: number, userId: number, input: unknown) {
  const correction = correctionSchema.parse(input);
  const release = await prisma.release.findFirstOrThrow({ where: { id: releaseId, userId, archivedAt: null }, include: { tracks: true } });
  if (!['LIVE', 'PARTIALLY_LIVE'].includes(release.status)) throw Error('These corrections require a live release. Pending deliveries need HYMN review.');
  const track = release.tracks.find(track => track.id === correction.trackId);
  if (!track?.isrc || !/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/i.test(track.isrc) || !release.upc) throw Error('The existing UPC and track ISRC must be confirmed first.');
  if ('new_artist_name' in correction && correction.artist_name.toLowerCase() === correction.new_artist_name.toLowerCase()) throw Error('Replace artist requires a different artist. Spotify profile mapping corrections require manual review.');
  if ('artist_name' in correction && correction.action !== 'request_add_artist') {
    const metadata = record(track.metadata);
    const names = [track.primaryArtist || '', ...String(metadata.featuredArtists || '').split(',')].flatMap(name => name.split(/,| & /)).map(name => name.trim().toLowerCase());
    if (!names.includes(correction.artist_name.toLowerCase())) throw Error('Select an artist already credited on this track.');
    if (['request_remove_artist', 'request_swap_artist_type'].includes(correction.action) && names.filter(Boolean).length < 2) throw Error('This change requires at least two credited artists.');
  }
  let file: { bytes: Buffer; mimeType: string; fileName: string } | undefined;
  if ('assetId' in correction) {
    const artwork = correction.action === 'request_cover_art_change';
    const asset = await prisma.storedAsset.findFirstOrThrow({ where: { id: correction.assetId, ownerUserId: userId, releaseId, deletedAt: null, uploadStatus: 'ready', assetType: artwork ? 'private_unreleased_artwork' : 'private_audio_master' } });
    if (asset.byteSize >= (artwork ? 10 : 100) * 1024 * 1024) throw Error(artwork ? 'Artwork must be under 10 MB.' : 'Audio must be under 100 MB.');
    file = await localPrivateStorage.createAuthorizedRead({ assetId: asset.id, requesterUserId: userId, isAdmin: false });
    if (artwork) {
      const image = await sharp(file.bytes).metadata();
      if (image.format !== 'jpeg' || image.width !== 3000 || image.height !== 3000) throw Error('Cover artwork must be JPEG, exactly 3000 × 3000 pixels.');
    } else {
      if (!['audio/wav', 'audio/x-wav'].includes(file.mimeType)) throw Error('Audio replacement must be WAV.');
      const audio = await verifyAudioIntegrity(file.bytes, file.mimeType);
      if (!('sampleRate' in audio) || audio.sampleRate !== 44100 || audio.channels !== 2 || audio.bits !== 24) throw Error('Audio replacement must be 44.1 kHz, stereo, 24-bit WAV.');
    }
  }
  const { action: _action, trackId: _track, ...fields } = correction;
  void _action; void _track;
  const { assetId: _asset, ...body } = fields as Record<string, unknown>;
  void _asset;
  return { correction, release, track, file, payload: { isrc: track.isrc, ...body } };
}

export async function previewSupportCorrection(requestId: number) {
  const request = await prisma.releaseChangeRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (!['approved', 'submitted_to_partner', 'processing_manually'].includes(request.status)) throw Error('Approve the correction before sending it.');
  const changes = record(request.requestedChanges);
  if (!changes.supportCorrection) throw Error('This legacy amendment requires manual partner review. It cannot be sent as a new release.');
  const data = await validateReleaseCorrection(request.releaseId, request.requestedByUserId, changes.supportCorrection);
  const locked = { upc: data.release.upc, isrc: data.track.isrc, trackId: data.track.id };
  const original = record(changes.locked);
  if (original.upc !== locked.upc || original.isrc !== locked.isrc || original.trackId !== locked.trackId) throw Error('The original identifiers changed. HYMN must review this correction again.');
  const revision = createHash('sha256').update(JSON.stringify({ requestId, updatedAt: request.updatedAt, correction: data.correction, locked, version: data.release.version, file: data.file ? createHash('sha256').update(data.file.bytes).digest('hex') : null })).digest('hex');
  return { request, ...data, revision, locked };
}

/** A durable pre-write record blocks duplicate sends, including uncertain outcomes. */
export async function submitSupportCorrection(requestId: number, revision: string, actorId?: number | null) {
  const data = await previewSupportCorrection(requestId);
  if (data.revision !== revision) throw Error('The correction changed. Preview it again before sending.');
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422028, ${data.request.releaseId}::integer)`;
    const current = await tx.releaseChangeRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (current.status !== 'approved' || current.updatedAt.getTime() !== data.request.updatedAt.getTime()) throw Error('This correction is no longer approved for sending.');
    const release = await tx.release.findUniqueOrThrow({ where: { id: current.releaseId }, select: { version: true, upc: true } });
    const track = await tx.track.findUniqueOrThrow({ where: { id: data.track.id }, select: { isrc: true } });
    if (release.version !== data.release.version || release.upc !== data.locked.upc || track.isrc !== data.locked.isrc) throw Error('The release changed. Preview this correction again.');
    const sent = await tx.releaseChangeRequestEvent.findFirst({ where: { requestId, metadata: { path: ['supportWrite'], equals: true } } });
    if (sent) throw Error('A partner send is already recorded. Check its status or reconcile it manually; do not resend.');
    const other = await tx.releaseChangeRequestEvent.findFirst({ where: { requestId: { not: requestId }, request: { releaseId: current.releaseId, status: { notIn: ['completed', 'failed'] } }, AND: [{ metadata: { path: ['supportWrite'], equals: true } }, { metadata: { path: ['isrc'], equals: data.track.isrc! } }] } });
    if (other) throw Error('Another correction for this recording has an unresolved partner send. Reconcile it first.');
    await tx.releaseChangeRequestEvent.create({ data: { requestId, actorType: 'admin', actorId, previousStatus: current.status, newStatus: 'processing_manually', note: 'Correction send started against the existing recording. Awaiting partner receipt.', metadata: { supportWrite: true, action: data.correction.action, isrc: data.track.isrc, locked: data.locked } } });
    await tx.releaseChangeRequest.update({ where: { id: requestId }, data: { status: 'processing_manually' } });
  }, amendmentTransactionOptions);
  const response = await requestDireNoteCorrection(data.correction.action, data.payload, data.file);
  const receipt = record(record(response.data).request);
  const providerId = Number(receipt.request_id);
  const confirmed = response.success && Number.isSafeInteger(providerId) && providerId > 0 && receipt.status === 'pending';
  return prisma.$transaction(async tx => {
    const status = confirmed ? 'submitted_to_partner' : 'processing_manually';
    const note = confirmed ? 'HYMN correction received for partner review. The existing release and identifiers are retained; this is not completion.' : 'The correction receipt could not be confirmed. HYMN must reconcile the partner outcome before any further send.';
    const request = await tx.releaseChangeRequest.update({ where: { id: requestId }, data: { status, ...(confirmed ? { providerReference: `support:${providerId}` } : {}), adminNote: note } });
    const event = await tx.releaseChangeRequestEvent.create({ data: { requestId, actorType: 'system', previousStatus: 'processing_manually', newStatus: status, note, metadata: { supportReceipt: true, confirmed, httpStatus: response.httpStatus, ...(confirmed ? { providerRequestId: providerId, providerStatus: 'pending' } : {}) } } });
    await enqueueAmendmentUpdate(tx, requestId, event.id);
    return { submitted: confirmed, request };
  }, amendmentTransactionOptions);
}

export async function syncSupportCorrection(requestId: number) {
  const current = await prisma.releaseChangeRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (current.status !== 'submitted_to_partner' || !/^support:\d+$/.test(current.providerReference || '')) return current;
  const id = Number(current.providerReference!.slice(8));
  const response = await requestDireNoteCorrection('list_support_requests', { request_id: id, per_page: 1 });
  const rows = record(response.data).requests;
  const receipt = Array.isArray(rows) ? rows.map(record).find(row => Number(row.request_id) === id) : null;
  const correction = correctionSchema.parse(record(current.requestedChanges).supportCorrection);
  const track = await prisma.track.findFirst({ where: { id: correction.trackId, releaseId: current.releaseId } });
  if (!response.success || !receipt || String(receipt.isrc || '').replace(/[ -]/g, '').toUpperCase() !== track?.isrc?.toUpperCase()) throw Error('Partner status could not be matched to this recording.');
  if (!['approved', 'rejected'].includes(String(receipt.status))) return current;
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422028, ${current.releaseId}::integer)`;
    const latest = await tx.releaseChangeRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (latest.status !== 'submitted_to_partner') return latest;
    const status = receipt.status === 'rejected' ? 'failed' : 'processing_manually';
    const note = receipt.status === 'approved' ? 'The partner approved this correction. HYMN will verify the store result before marking it complete.' : 'The partner declined this correction. HYMN will review the outcome; the release and identifiers remain unchanged.';
    const request = await tx.releaseChangeRequest.update({ where: { id: requestId }, data: { status, adminNote: note } });
    const event = await tx.releaseChangeRequestEvent.create({ data: { requestId, actorType: 'system', previousStatus: latest.status, newStatus: status, note, metadata: { providerRequestId: id, providerStatus: String(receipt.status), providerNote: String(receipt.notes || '').slice(0, 2000) } } });
    await enqueueAmendmentUpdate(tx, requestId, event.id);
    return request;
  }, amendmentTransactionOptions);
}

export async function syncPendingSupportCorrections() {
  const requests = await prisma.releaseChangeRequest.findMany({ where: { status: 'submitted_to_partner', providerReference: { startsWith: 'support:' } }, orderBy: { updatedAt: 'asc' }, take: 5 });
  for (const request of requests) {
    try { await syncSupportCorrection(request.id); } catch { /* Keep pending; a read failure never triggers another write. */ }
    finally { await prisma.releaseChangeRequest.updateMany({ where: { id: request.id, status: 'submitted_to_partner' }, data: { updatedAt: new Date() } }); }
  }
  return requests.length;
}

/** Staff confirms the store result after partner approval; only the requested fields change. */
export async function applyCompletedSupportCorrection(tx: Prisma.TransactionClient, request: ReleaseChangeRequest) {
  const changes = record(request.requestedChanges);
  if (!changes.supportCorrection) return;
  const correction = correctionSchema.parse(changes.supportCorrection);
  const approval = await tx.releaseChangeRequestEvent.findFirst({ where: { requestId: request.id, metadata: { path: ['providerStatus'], equals: 'approved' } } });
  if (!approval) throw Error('Check the partner correction status and record its approval before confirming the store result.');
  const release = await tx.release.findUniqueOrThrow({ where: { id: request.releaseId }, include: { tracks: true } });
  const track = release.tracks.find(track => track.id === correction.trackId);
  const locked = record(changes.locked);
  if (!track || release.upc !== locked.upc || track.isrc !== locked.isrc) throw Error('Original identifiers changed. Reconcile before recording completion.');
  const metadata = record(track.metadata), releaseMetadata = record(release.metadata);
  const split = (value: string) => value.split(',').map(name => name.trim()).filter(Boolean);
  let primary = split(track.primaryArtist || ''), featured = split(String(metadata.featuredArtists || ''));
  const remove = (values: string[], name: string) => values.filter(value => value.toLowerCase() !== name.toLowerCase());
  if (correction.action === 'request_add_artist') {
    if (correction.artist_type === 'primary') primary = [...new Set([...primary, correction.artist_name])];
    else featured = [...new Set([...featured, correction.artist_name])];
  } else if (correction.action === 'request_remove_artist') {
    primary = remove(primary, correction.artist_name); featured = remove(featured, correction.artist_name);
  } else if (correction.action === 'request_replace_artist') {
    const replace = (values: string[]) => values.map(value => value.toLowerCase() === correction.artist_name.toLowerCase() ? correction.new_artist_name : value);
    primary = replace(primary); featured = replace(featured);
  } else if (correction.action === 'request_swap_artist_type') {
    primary = remove(primary, correction.artist_name); featured = remove(featured, correction.artist_name);
    if (correction.direction === 'primary_to_featuring') featured.push(correction.artist_name); else primary.push(correction.artist_name);
  }
  const artistChange = 'artist_name' in correction;
  if (artistChange && !primary.length) throw Error('Confirm the remaining primary artist before completing this correction.');
  const assetUrl = 'assetId' in correction ? `/api/assets/${correction.assetId}/download` : undefined;
  await tx.track.update({ where: { id: track.id }, data: {
    ...(artistChange ? { primaryArtist: primary.join(', ') } : {}),
    ...(correction.action === 'request_audio_change' ? { audioUrl: assetUrl } : {}),
    metadata: JSON.parse(JSON.stringify({ ...metadata, ...(artistChange ? { primaryArtist: primary.join(', '), featuredArtists: featured.join(', ') } : {}), ...(correction.action === 'request_cover_art_change' ? { correctedArtworkUrl: assetUrl } : {}) })),
  } });
  await tx.release.update({ where: { id: release.id }, data: {
    ...(correction.action === 'request_audio_change' && track.trackNumber === 1 ? { audioUrl: assetUrl } : {}),
    ...(correction.action === 'request_cover_art_change' && release.tracks.length === 1 ? { artworkUrl: assetUrl } : {}),
    ...(artistChange && release.tracks.length === 1 ? { artistName: primary.join(', ') } : {}),
    metadata: JSON.parse(JSON.stringify({ ...releaseMetadata, ...(artistChange && release.tracks.length === 1 ? { artistName: primary.join(', ') } : {}), ...(correction.action === 'request_cover_art_change' && release.tracks.length === 1 ? { artworkUrl: assetUrl } : {}) })),
    version: { increment: 1 },
  } });
  await tx.auditLog.create({ data: { actorType: 'system', action: 'RELEASE_SUPPORT_CORRECTION_APPLIED', entity: 'release', entityId: String(release.id), metadata: JSON.parse(JSON.stringify({ requestId: request.id, locked, previous: { title: release.title, artistName: release.artistName, artworkUrl: release.artworkUrl, audioUrl: release.audioUrl, metadata: release.metadata, track } })) } });
}
