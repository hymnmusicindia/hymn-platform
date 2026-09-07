type TrackLanguageSource = { language?: unknown; titleLanguage?: unknown; metadata?: Record<string, unknown> | null };

/** Read explicit legacy track values, never infer audio language from the album. */
export function readTrackLanguage(track: TrackLanguageSource | null | undefined): string {
  if (!track) return "";
  const metadata = track.metadata;
  const nested = metadata?.metadata && typeof metadata.metadata === "object" ? metadata.metadata as Record<string, unknown> : undefined;
  const value = track.language ?? metadata?.language ?? track.titleLanguage ?? metadata?.titleLanguage ?? nested?.titleLanguage;
  return typeof value === "string" ? value.trim() : "";
}
