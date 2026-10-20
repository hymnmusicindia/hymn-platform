export function meaningfulDraftTitle(value: unknown): string {
  if (typeof value !== "string") return "";
  const title = value.trim();
  return !title || title.length > 200 || /^untitled(?:\s+(?:release|single|ep|album|track))?$/i.test(title) ? "" : title;
}

/** Drafts protect incomplete work; a real title remains required for submission. */
export function draftTitleForSave(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : "Untitled Release";
}
