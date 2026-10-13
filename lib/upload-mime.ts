export function normalizeUploadMime(mime: string, filename: string) {
  const value = mime.trim().toLowerCase().split(";")[0];
  const aliases: Record<string, string> = { "audio/mp3": "audio/mpeg", "audio/wave": "audio/wav", "audio/vnd.wave": "audio/wav", "application/x-zip-compressed": "application/zip", "image/jpg": "image/jpeg" };
  if (value && value !== "application/octet-stream") return aliases[value] || value;
  const extension = filename.split(".").pop()?.toLowerCase() || "";
  return ({ wav: "audio/wav", mp3: "audio/mpeg", flac: "audio/flac", zip: "application/zip", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf", csv: "text/csv", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } as Record<string, string>)[extension] || value;
}
