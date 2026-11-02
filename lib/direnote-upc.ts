export function normalizeDireNoteUpc(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).replace(/[\s-]/g, "");
  return /^\d{12,14}$/.test(normalized) ? normalized : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function walkDireNoteObjects(value: unknown, seen = new Set<unknown>()): Array<Record<string, unknown>> {
  const current = record(value);
  if (!current || seen.has(value)) return [];
  seen.add(value);
  const nested = Object.values(current)
    .flatMap((child) => {
      if (!child || typeof child !== "object") return [];
      if (Array.isArray(child)) return child.flatMap(item => walkDireNoteObjects(item, seen));
      return walkDireNoteObjects(child, seen);
    });
  return [current, ...nested];
}

export function upcFromDireNoteResponse(value: unknown): string | null {
  const candidates = walkDireNoteObjects(value);
  const identifiers=new Set<string>();
  for (const candidate of candidates) {
    for(const key of ['upc','UPC','upc_code','upcCode']){
      const upc=normalizeDireNoteUpc(candidate[key]);if(upc)identifiers.add(upc);
    }
  }
  return identifiers.size===1?[...identifiers][0]:null;
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
  const matches=new Set<string>(),root=record(payload),data=record(root.data),result=record(root.result);
  // A sibling track's UPC is never a fallback for the matched recording.
  const envelopeUpc=upcFromDireNoteResponse({release:root.release,dataRelease:data.release,resultRelease:result.release});
  for (const track of trackRecords(payload)) {
    if (normalizeIsrc(track.isrc) !== expectedIsrc) continue;
    const receivedTitle = trackReleaseTitle(track);
    if (receivedTitle && normalizeText(releaseTitle) && receivedTitle !== normalizeText(releaseTitle)) continue;
    const upc = normalizeDireNoteUpc(track.upc ?? track.UPC ?? track.upc_code ?? track.upcCode) ?? envelopeUpc;
    if (upc) matches.add(upc);
  }
  return matches.size===1?[...matches][0]:null;
}
