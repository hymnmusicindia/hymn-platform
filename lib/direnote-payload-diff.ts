export type PayloadChange = { field: string; before: unknown; after: unknown };

export function diffDireNotePayload(before: unknown, after: unknown, field = ""): PayloadChange[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (before && after && typeof before === "object" && typeof after === "object") {
    const left = before as Record<string, unknown>;
    const right = after as Record<string, unknown>;
    return [...new Set([...Object.keys(left), ...Object.keys(right)])].flatMap(key =>
      diffDireNotePayload(left[key], right[key], field ? `${field}.${key}` : key));
  }
  return [{ field, before: before ?? null, after: after ?? null }];
}
