"use client";

export async function uploadEngineerImage(file: File, kind: "photo" | "banner") {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG or WebP image.");
  if (!file.size || file.size > 5 * 1024 * 1024) throw new Error("Choose an image under 5 MB.");
  const form = new FormData();
  form.set("image", file);
  form.set("kind", kind);
  const response = await fetch("/api/studio/images", { method: "POST", body: form });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.url) throw new Error(result?.error || (response.status === 413 ? "Choose an image under 5 MB." : response.status === 401 ? "Please sign in again before uploading." : "Image upload failed. Please try again."));
  return result.url as string;
}
