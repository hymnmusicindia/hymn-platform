import type { Prisma } from "@prisma/client";

type TrackWrite = {
  title: string;
  trackNumber: number;
  primaryArtist?: string | null;
  audioUrl?: string | null;
  isrc?: string | null;
  metadata: Prisma.InputJsonValue;
};

function clientTrackId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = metadata as Record<string, unknown>;
  return typeof value.clientTrackId === "string" && value.clientTrackId ? value.clientTrackId : clientTrackId(value.metadata);
}

// The caller holds the release lock and owns the transaction. Preserve existing
// track IDs so uploads, credits and release links survive every draft save.
export async function saveReleaseTracks(db: Prisma.TransactionClient, releaseId: number, rows: TrackWrite[], existing: { id: number; trackNumber: number | null }[]) {
  const numbers = rows.map(row => row.trackNumber);
  if (numbers.some(number => !Number.isInteger(number) || number < 1) || new Set(numbers).size !== numbers.length) throw new Error("Every track must have a unique positive track number.");
  if (rows.some(row => typeof row.title !== "string" || [row.primaryArtist, row.audioUrl, row.isrc].some(value => value !== undefined && value !== null && typeof value !== "string"))) throw new Error("Check the track titles, artist names, audio links and recording identifiers before saving.");
  if (!rows.length) return [];
  const refs = rows.map(row => clientTrackId(row.metadata));
  const knownRefs = refs.filter((ref): ref is string => Boolean(ref));
  if (new Set(knownRefs).size !== knownRefs.length) throw new Error("Each recording must have a unique track identity.");
  const identityTracks = existing.length && knownRefs.length ? await db.track.findMany({ where: { releaseId, id: { in: existing.map(track => track.id) } }, select: { id: true, trackNumber: true, title: true, audioUrl: true, metadata: true } }) : [];
  const previous = new Map(existing.map(track => [track.trackNumber, track]));
  const used = new Set<number>();
  const reserved = new Set(identityTracks.filter(track => knownRefs.includes(clientTrackId(track.metadata) || "") || knownRefs.includes(`existing-track-${track.id}`)).map(track => track.id));
  const matches = rows.map((row, index) => {
    let match: { id: number; trackNumber: number | null } | undefined;
    if (refs[index] && identityTracks.length) {
      match = identityTracks.find(track => clientTrackId(track.metadata) === refs[index]);
      const originalId = refs[index]?.match(/^existing-track-(\d+)$/)?.[1];
      match ??= originalId ? identityTracks.find(track => track.id === Number(originalId)) : undefined;
      const legacy = identityTracks.filter(track => !clientTrackId(track.metadata) && !used.has(track.id) && !reserved.has(track.id));
      const audioMatches = legacy.filter(track => row.audioUrl && track.audioUrl === row.audioUrl);
      const titleMatches = legacy.filter(track => row.title && track.title === row.title);
      // Legacy drafts acquire a client identity on their first save. Match the
      // recording before its position so a first-save reorder remains safe.
      match ??= audioMatches.length === 1 ? audioMatches[0] : titleMatches.length === 1 ? titleMatches[0] : legacy.find(track => track.trackNumber === row.trackNumber);
    } else match = previous.get(row.trackNumber);
    if (match && used.has(match.id)) throw new Error("Two recordings cannot use the same track identity.");
    if (match) used.add(match.id);
    return match;
  });
  const removed = identityTracks.filter(track => !used.has(track.id));
  if (removed.length) await db.track.updateMany({ where: { releaseId, id: { in: removed.map(track => track.id) } }, data: { trackNumber: Math.max(...numbers) + existing.length + 1 } });
  const created = rows.filter((_, index) => !matches[index]);
  if (created.length) await db.track.createMany({ data: created.map(row => ({ ...row, releaseId })) });
  const updated = rows.flatMap((row, index) => {
    const track = matches[index];
    return track ? [{ ...row, id: track.id, hasIsrc: row.isrc !== undefined, hasAudio: row.audioUrl !== undefined, hasArtist: row.primaryArtist !== undefined }] : [];
  });
  if (updated.length) await db.$executeRaw`
    UPDATE tracks AS t SET title=x.title,track_number=x."trackNumber",
      primary_artist=CASE WHEN x."hasArtist" THEN x."primaryArtist" ELSE t.primary_artist END,
      audio_url=CASE WHEN x."hasAudio" THEN x."audioUrl" ELSE t.audio_url END,metadata=x.metadata,
      isrc=CASE WHEN x."hasIsrc" THEN x.isrc ELSE t.isrc END
    FROM jsonb_to_recordset(${JSON.stringify(updated)}::jsonb)
      AS x(id int,title text,"trackNumber" int,"primaryArtist" text,"audioUrl" text,isrc text,"hasIsrc" boolean,"hasAudio" boolean,"hasArtist" boolean,metadata jsonb)
    WHERE t.id=x.id AND t.release_id=${releaseId}`;
  const saved = await db.track.findMany({ where: { releaseId, trackNumber: { in: numbers } }, select: { id: true, trackNumber: true } });
  if (saved.length !== rows.length) throw new Error("The track list changed while saving. Refresh the latest draft and retry.");
  const byNumber = new Map(saved.map(track => [track.trackNumber, track]));
  return rows.map(row => byNumber.get(row.trackNumber)!);
}

export function releaseSaveFailure(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "P2028") return { error: "Saving this release took too long. Your previously saved draft and payment records are retained. Please retry.", code: "RELEASE_SAVE_TIMEOUT", retryable: true };
  if (["P2034", "P1001", "P1002", "P1017", "P2024"].includes(code)) return { error: "The release could not be saved because the database is temporarily busy or unavailable. Your saved draft and payment records are retained. Please retry shortly.", code: "RELEASE_SAVE_RETRYABLE", retryable: true };
  return null;
}
