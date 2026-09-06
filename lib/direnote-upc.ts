export function normalizeDireNoteUpc(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).replace(/[\s-]/g, "");
  return /^\d{12,14}$/.test(normalized) ? normalized : null;
}

const normalizeText = (value: unknown) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : "";
const normalizeIsrc = (value: unknown) => typeof value === "string" ? value.replace(/[\s-]/g, "").toUpperCase() : "";

/** The documented ISRC report includes track.upc. Reject unrelated catalog rows. */
export function upcFromDireNoteIsrcReport(payload: unknown, isrc: string, releaseTitle: string): string | null {
  const track = (payload as { track?: Record<string, unknown> } | null)?.track;
  if (!track || normalizeIsrc(track.isrc) !== normalizeIsrc(isrc)) return null;
  if (!normalizeText(releaseTitle) || normalizeText(track.release_title) !== normalizeText(releaseTitle)) return null;
  return normalizeDireNoteUpc(track.upc);
}
