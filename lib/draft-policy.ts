export function meaningfulDraftTitle(value: unknown): string {
  if (typeof value !== "string") return "";
  const title = value.trim();
  return !title || title.length > 200 || /^untitled(?:\s+(?:release|single|ep|album|track))?$/i.test(title) ? "" : title;
}
