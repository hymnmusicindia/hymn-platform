export function beatMetadataRequiresReview(current: Record<string, unknown>, patch: Record<string, unknown>) {
  return ["title", "bpm", "genre", "mood", "keySignature", "description", "subgenre", "tags", "sampleDeclaration", "sampleDisclosure"].some(key => {
    if (patch[key] === undefined) return false;
    const normalise = (value: unknown) => key === "tags" ? JSON.stringify(value ?? []) : value ?? "";
    return normalise(current[key]) !== normalise(patch[key]);
  });
}
