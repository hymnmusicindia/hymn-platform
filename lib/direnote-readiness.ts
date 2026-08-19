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
  if (/license|receipt|rights|copyright|suno/i.test(field)) return "Rights";
  return "Tracks";
}

export async function validateReleaseForDireNote(release: Release, options: { siteUrl?: string; adminConfirmedExistingArtists?: boolean } = {}) {
  const releaseMood = release.mood || (typeof release.metadata?.mood === "string" ? release.metadata.mood : "");
  if (!releaseMood.trim()) {
    const issue: DireNoteReadinessIssue = { field: "metadata.mood", label: "Mood", message: "Mood is missing. Select a mood before sending to DireNote.", severity: "error", category: "Metadata", fixSuggestion: "Select a mood in release metadata.", userFacing: true };
    return { ready: false, issues: [issue], warnings: [], payload: null };
  }
  const payload = await buildDireNotePayloadForRelease(release, options);
  const result = validateDireNotePayload(payload, { adminConfirmedExistingArtists: options.adminConfirmedExistingArtists });
  const normalize = (issue: any, severity: "error" | "warning"): DireNoteReadinessIssue => {
    const field = String(issue.field ?? issue.path ?? "release");
    const message = String(issue.message ?? "Review this field.");
    return { field, label: field.split(".").pop()?.replace(/_/g, " ") ?? field, message, severity, category: categoryFor(field), fixSuggestion: issue.fixSuggestion ?? `Correct ${field} in the release metadata and validate again.`, userFacing: issue.userFacing !== false };
  };
  const issues = result.issues.map((issue: any) => normalize(issue, "error"));
  const warnings = result.warnings.map((issue: any) => normalize(typeof issue === "string" ? { message: issue, field: "release" } : issue, "warning"));
  return { ready: issues.length === 0, issues, warnings, payload };
}
