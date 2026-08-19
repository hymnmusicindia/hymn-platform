export type BeatReadinessInput = { title?: string; bpm?: number; genre?: string; mood?: string; keySignature?: string; price?: number; audioUrl?: string; artworkUrl?: string };

export function validateBeatReadiness(beat: BeatReadinessInput) {
  const checks: Array<[keyof BeatReadinessInput, boolean, string]> = [
    ["title", Boolean(beat.title?.trim()), "Beat title is required."],
    ["bpm", Number.isFinite(beat.bpm) && Number(beat.bpm) > 0, "A valid BPM is required."],
    ["genre", Boolean(beat.genre?.trim()), "Genre is required."],
    ["mood", Boolean(beat.mood?.trim()), "Mood is required."],
    ["keySignature", Boolean(beat.keySignature?.trim()), "Musical key is required."],
    ["price", Number.isFinite(beat.price) && Number(beat.price) > 0, "A valid license price is required."],
    ["audioUrl", Boolean(beat.audioUrl), "Audio preview/delivery file is required."],
    ["artworkUrl", Boolean(beat.artworkUrl), "Artwork is required."]
  ];
  const issues = checks.filter(([, valid]) => !valid).map(([field, , message]) => ({ field, message, severity: "error" as const }));
  return { ready: issues.length === 0, issues };
}
