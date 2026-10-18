const PLACEHOLDER_TRACK_TITLE = /^(?:track\s*\d+|untitled(?:\s+(?:track|single|release))?)$/i;

export function wizardTrackTitle(value: unknown, preserveSavedTitle: boolean): string {
  if (!preserveSavedTitle || typeof value !== "string") return "";
  const title = value.trim();
  return title && !PLACEHOLDER_TRACK_TITLE.test(title) ? title : "";
}
