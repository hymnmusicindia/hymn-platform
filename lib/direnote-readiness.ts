import type { Release } from "@/lib/types";
import { buildDireNotePayloadForRelease } from "@/lib/distribution-service";
import { validateDireNotePayload } from "@/lib/direnote";

export type DireNoteReadinessIssue = {
  field: string;
  label: string;
  message: string;
  severity: "error" | "warning";
  category: "Metadata" | "Artists" | "Tracks" | "Contributors" | "Assets" | "Dates" | "Rights" | "UPC/ISRC";
  fixSuggestion: string;
  userFacing: boolean;
};

function categoryFor(field: string): DireNoteReadinessIssue["category"] {
  if (/mood|genre|language|title|label/i.test(field)) return "Metadata";
  if (/artist|instagram/i.test(field)) return "Artists";
  if (/contributor|composer|producer|writer/i.test(field)) return "Contributors";
  if (/artwork|audio|url/i.test(field)) return "Assets";
  if (/date/i.test(field)) return "Dates";
  if (/upc|isrc/i.test(field)) return "UPC/ISRC";
  if (/contenttype|license|receipt|rights|copyright|suno/i.test(field)) return "Rights";
  return "Tracks";
}

export async function validateReleaseForDireNote(release: Release, options: { siteUrl?: string; adminConfirmedExistingArtists?: boolean } = {}) {
  const payload = await buildDireNotePayloadForRelease(release, options);
  const result = validateDireNotePayload(payload, { adminConfirmedExistingArtists: options.adminConfirmedExistingArtists });
  const normalize = (issue: any, severity: "error" | "warning"): DireNoteReadinessIssue => {
    const field = String(issue.field ?? issue.path ?? "release");
    const message = String(issue.message ?? "Review this field.");
    const track = field.match(/^tracks\.(\d+)\.trackLanguage$/);
    const suggestion = field === "contenttype" ? "Open Delivery > Content ownership and select the ownership category that applies to this release."
      : field === "cover_art_url" ? "Check Artwork & Audio for this release. Link its ready JPEG artwork asset, then validate again."
      : track ? `Open Track ${Number(track[1]) + 1} > Track language and select the language of that audio.`
      : `Review ${field} for this release and validate again.`;
    return { field, label: field === "contenttype" ? "Content ownership" : field.split(".").pop()?.replace(/_/g, " ") ?? field, message, severity, category: categoryFor(field), fixSuggestion: issue.fixSuggestion ?? issue.suggestion ?? suggestion, userFacing: issue.userFacing !== false };
  };
  const issues = result.issues.map((issue: any) => normalize(issue, "error"));
  const warnings = result.warnings.map((issue: any) => normalize(typeof issue === "string" ? { message: issue, field: "release" } : issue, "warning"));
  const hasIssueMatching = (pattern: RegExp) => issues.some((issue) => pattern.test(issue.field) || pattern.test(issue.message));
  const checklist = [
    { label: "Artwork URL", ready: Boolean(payload.cover_art_url) && !hasIssueMatching(/cover_art_url|cover artwork|artwork|jpeg|jpg/i) },
    { label: "Audio URLs", ready: payload.tracks.length > 0 && payload.tracks.every((track, index) => Boolean(track.audio_url) && !issues.some((issue) => issue.field === `tracks.${index}.audio_url` || /audio/i.test(issue.field))) },
    { label: "Release date", ready: Boolean(payload.trackReleaseDate) && !hasIssueMatching(/trackReleaseDate|release date/i) },
    { label: "Genre / language", ready: Boolean(payload.albumGenre && payload.albumLanguage) && !hasIssueMatching(/albumGenre|albumSubgenre|albumLanguage|genre|subgenre|language/i) },
    { label: "Mood (optional)", ready: !hasIssueMatching(/albumMood|mood/i) },
    { label: "Writer/composer names", ready: payload.tracks.length > 0 && payload.tracks.every((track) => track.songwriters.length > 0 && track.composers.length > 0) && !hasIssueMatching(/songwriters|composers|writer|composer/i) },
    { label: "Rights confirmation", ready: Boolean(payload.cLine && payload.pLine) && !hasIssueMatching(/cLine|pLine|contenttype|suno_receipt_url|sunoLink|license_receipt_url|rights|copyright|publishing|license/i) }
  ];
  return { ready: issues.length === 0, issues, warnings, payload, checklist };
}
