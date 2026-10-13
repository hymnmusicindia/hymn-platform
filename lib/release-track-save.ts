import type { Prisma } from "@prisma/client";

type TrackWrite = {
  title: string;
  trackNumber: number;
  primaryArtist?: string | null;
  audioUrl?: string | null;
  isrc?: string | null;
  metadata: Prisma.InputJsonValue;
};

// The caller holds the release lock and owns the transaction. Preserve existing
// track IDs so uploads, credits and release links survive every draft save.
export async function saveReleaseTracks(db: Prisma.TransactionClient, releaseId: number, rows: TrackWrite[], existing: { id: number; trackNumber: number | null }[]) {
  const numbers = rows.map(row => row.trackNumber);
  if (numbers.some(number => !Number.isInteger(number) || number < 1) || new Set(numbers).size !== numbers.length) throw new Error("Every track must have a unique positive track number.");
  if (rows.some(row => typeof row.title !== "string" || [row.primaryArtist, row.audioUrl, row.isrc].some(value => value !== undefined && value !== null && typeof value !== "string"))) throw new Error("Check the track titles, artist names, audio links and recording identifiers before saving.");
  if (!rows.length) return [];
  const previous = new Map(existing.map(track => [track.trackNumber, track]));
  const created = rows.filter(row => !previous.has(row.trackNumber));
  if (created.length) await db.track.createMany({ data: created.map(row => ({ ...row, releaseId })) });
  const updated = rows.flatMap(row => {
    const track = previous.get(row.trackNumber);
    return track ? [{ ...row, id: track.id, hasIsrc: row.isrc !== undefined, hasAudio: row.audioUrl !== undefined, hasArtist: row.primaryArtist !== undefined }] : [];
  });
  if (updated.length) await db.$executeRaw`
    UPDATE tracks AS t SET title=x.title,
      primary_artist=CASE WHEN x."hasArtist" THEN x."primaryArtist" ELSE t.primary_artist END,
      audio_url=CASE WHEN x."hasAudio" THEN x."audioUrl" ELSE t.audio_url END,metadata=x.metadata,
      isrc=CASE WHEN x."hasIsrc" THEN x.isrc ELSE t.isrc END
    FROM jsonb_to_recordset(${JSON.stringify(updated)}::jsonb)
      AS x(id int,title text,"primaryArtist" text,"audioUrl" text,isrc text,"hasIsrc" boolean,"hasAudio" boolean,"hasArtist" boolean,metadata jsonb)
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
