export type BeatReadinessInput = { title?: string; bpm?: number; genre?: string; mood?: string; keySignature?: string; price?: number; generalPrice?: number; exclusivePrice?: number; sampleDeclaration?: string; sampleDisclosure?: string | null; audioUrl?: string; artworkUrl?: string };

export function validateBeatReadiness(beat: BeatReadinessInput) {
  const checks: Array<[keyof BeatReadinessInput, boolean, string]> = [
    ["title", Boolean(beat.title?.trim()), "Beat title is required."],
    ["bpm", Number.isFinite(beat.bpm) && Number(beat.bpm) > 0, "A valid BPM is required."],
    ["genre", Boolean(beat.genre?.trim()), "Genre is required."],
    ["mood", Boolean(beat.mood?.trim()), "Mood is required."],
    ["keySignature", Boolean(beat.keySignature?.trim()), "Musical key is required."],
    ["price", Number.isFinite(beat.price) && Number(beat.price) > 0, "A valid license price is required."],
    ["generalPrice", beat.generalPrice === undefined || (Number.isFinite(beat.generalPrice) && Number(beat.generalPrice) > 0), "A valid General Licence price is required."],
    ["exclusivePrice", beat.exclusivePrice === undefined || (Number.isFinite(beat.exclusivePrice) && Number(beat.exclusivePrice) > Number(beat.generalPrice ?? beat.price ?? 0)), "Exclusive Licence price must be higher than General."],
    ["sampleDeclaration", beat.sampleDeclaration === undefined || ["NO_UNCONTROLLED_SAMPLES", "CONTAINS_UNCONTROLLED_SAMPLES"].includes(beat.sampleDeclaration), "Complete the sample declaration."],
    ["sampleDisclosure", beat.sampleDeclaration !== "CONTAINS_UNCONTROLLED_SAMPLES" || Boolean(beat.sampleDisclosure?.trim()), "Disclose samples you do not own or control."],
    ["audioUrl", Boolean(beat.audioUrl), "Audio delivery file is required."]
  ];
  const issues = checks.filter(([, valid]) => !valid).map(([field, , message]) => ({ field, message, severity: "error" as const }));
  return { ready: issues.length === 0, issues };
}
