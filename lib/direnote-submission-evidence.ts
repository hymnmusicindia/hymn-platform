import { validIsrc, validReleaseBarcode } from './release-input-rules';
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const normalized = (value: unknown) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : '';

export function hasDireNoteAcceptanceEvidence(attempt: {
  state: string;
  isCurrent: boolean;
  idempotencyKey?: string | null;
  providerReference?: string | null;
  upc?: string | null;
  responseRedacted?: unknown;
} | null | undefined) {
  if (!attempt || !attempt.isCurrent || !['submitted', 'processing'].includes(attempt.state)) return false;
  const response = record(attempt.responseRedacted);
  const reference = typeof attempt.providerReference === 'string' ? attempt.providerReference.trim() : '';
  const clientKey = typeof attempt.idempotencyKey === 'string' ? attempt.idempotencyKey.trim() : '';
  const responseKey = typeof response.providerIdempotencyKey === 'string' ? response.providerIdempotencyKey.trim() : '';
  return Boolean(
    typeof response.ingestJobId === 'string' && response.ingestJobId.trim() ||
    typeof response.distributorReleaseId === 'string' && response.distributorReleaseId.trim() ||
    validReleaseBarcode(String(response.upc ?? attempt.upc ?? '')) ||
    reference && reference !== clientKey ||
    responseKey && responseKey !== clientKey
  );
}

export function canNotifyDireNoteHandoff(status: string, attempt: Parameters<typeof hasDireNoteAcceptanceEvidence>[0]) {
  return hasDireNoteAcceptanceEvidence(attempt) && [
    'submitting_to_distributor', 'sent', 'sent_to_distributor', 'distributor_processing',
    'processing', 'scheduled', 'awaiting_live_confirmation', 'partially_live', 'delivered', 'live'
  ].includes(status.toLowerCase());
}

export function direNoteAcknowledgement(input: { httpStatus: number | null; jobId?: string | null; idempotencyKey?: string | null; upc?: string | null; releaseId?: string | null }) {
  if (input.httpStatus === null || input.httpStatus < 200 || input.httpStatus >= 300) return 'unconfirmed';
  const job = Boolean(input.jobId || input.idempotencyKey);
  if (input.httpStatus === 202) return job ? 'queued' : 'unconfirmed';
  if (job) return 'queued';
  if (validReleaseBarcode(input.upc || '') || input.releaseId) return 'identified';
  return 'unconfirmed';
}

/** A catalogue-confirmed legacy delivery is not an asynchronous ingest job. */
export function verifiedDireNoteCatalogue(attempt: { upc: string | null; rawStatusPayload?: unknown }, release: { title: string; upc: string | null; tracks: { isrc: string | null }[] }) {
  const payload = record(attempt.rawStatusPayload), remote = record(payload.release);
  const tracks = Array.isArray(payload.tracks) ? payload.tracks.map(record) : [];
  const upc = typeof remote.upc_code === 'string' ? remote.upc_code.trim() : '';
  const isrcs = tracks.map(track => String(track.isrc || '').replace(/[\s-]/g, '').toUpperCase());
  return payload.success === true && validReleaseBarcode(upc) && upc === attempt.upc && upc === release.upc && normalized(remote.album_name) === normalized(release.title)
    && release.tracks.length > 0 && tracks.length === release.tracks.length && new Set(isrcs).size === tracks.length
    && release.tracks.every(track => validIsrc(track.isrc || '') && isrcs.includes((track.isrc || '').replace(/[\s-]/g, '').toUpperCase()));
}
