export function normalizeDireNoteUpc(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).replace(/[\s-]/g, "");
  return /^\d{12,14}$/.test(normalized) ? normalized : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function upcFromDireNoteResponse(value: unknown): string | null {
  const root = record(value);
  const data = record(root.data);
  const result = record(root.result);
  const response = record(root.direnoteResponse);
  const direNote = record(root.direNote);
  const candidates = [
    root,
    data,
    result,
    record(root.release),
    record(data.release),
    record(result.release),
    response,
    record(response.data),
    record(response.result),
    record(response.release),
    record(record(response.data).release),
    record(record(response.result).release),
    direNote,
    record(direNote.data),
    record(direNote.result),
    record(direNote.release),
    record(record(direNote.data).release),
    record(record(direNote.result).release)
  ];
  for (const candidate of candidates) {
    const upc = normalizeDireNoteUpc(candidate.upc ?? candidate.UPC ?? candidate.upc_code ?? candidate.upcCode);
    if (upc) return upc;
  }
  return null;
}

const normalizeText = (value: unknown) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : "";
const normalizeIsrc = (value: unknown) => typeof value === "string" ? value.replace(/[\s-]/g, "").toUpperCase() : "";

function trackRecords(value: unknown): Array<Record<string, unknown>> {
  const root = record(value);
  const data = record(root.data);
  const result = record(root.result);
  const directTrack = record(root.track);
  const dataTrack = record(data.track);
  const resultTrack = record(result.track);
  const arrays = [root.tracks, data.tracks, result.tracks]
    .filter(Array.isArray)
    .flatMap(items => items.map(record));
  return [directTrack, dataTrack, resultTrack, ...arrays].filter(item => Object.keys(item).length);
}

function trackReleaseTitle(track: Record<string, unknown>) {
  return normalizeText(track.release_title ?? track.releaseTitle ?? track.album_name ?? track.albumName ?? track.release_name ?? track.releaseName);
}

/** The documented ISRC report includes track.upc. Reject unrelated catalog rows. */
export function upcFromDireNoteIsrcReport(payload: unknown, isrc: string, releaseTitle: string): string | null {
  const expectedIsrc = normalizeIsrc(isrc);
  if (!expectedIsrc) return null;
  for (const track of trackRecords(payload)) {
    if (normalizeIsrc(track.isrc) !== expectedIsrc) continue;
    const receivedTitle = trackReleaseTitle(track);
    if (receivedTitle && normalizeText(releaseTitle) && receivedTitle !== normalizeText(releaseTitle)) continue;
    const upc = normalizeDireNoteUpc(track.upc ?? track.UPC ?? track.upc_code ?? track.upcCode);
    if (upc) return upc;
  }
  return null;
}
