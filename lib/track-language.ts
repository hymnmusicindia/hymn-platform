type TrackLanguageSource = { version?: unknown; language?: unknown; titleLanguage?: unknown; metadata?: Record<string, unknown> | null };

/** Instrumental version takes precedence; other tracks keep their own language. */
export function readTrackLanguage(track: TrackLanguageSource | null | undefined): string {
  if (!track) return "";
  const metadata = track.metadata;
  const nested = metadata?.metadata && typeof metadata.metadata === "object" ? metadata.metadata as Record<string, unknown> : undefined;
  const version = track.version ?? metadata?.version ?? nested?.version;
  if (typeof version === "string" && version.trim().toLowerCase() === "instrumental") return "Instrumental";
  const value = track.language ?? metadata?.language ?? track.titleLanguage ?? metadata?.titleLanguage ?? nested?.titleLanguage;
  return typeof value === "string" ? value.trim() : "";
}
