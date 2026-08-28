import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { put } from "@vercel/blob";

const maxAudioBytes = 50 * 1024 * 1024;
const maxImageBytes = 10 * 1024 * 1024;

function getUploadRoot() {
  return process.env.STORAGE_ROOT || "./public/uploads";
}

const publicUploadDirectories = ["producers", "beats", "site"] as const;

function normalizedPublicPath(value: string) {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Invalid public upload path.");
  }
  if (!publicUploadDirectories.some((directory) => normalized === directory || normalized.startsWith(`${directory}/`))) {
    throw new Error("This upload is not publicly accessible.");
  }
  return normalized;
}

export function publicUploadUrl(relativePath: string) {
  return `/api/public-uploads/${normalizedPublicPath(relativePath).split("/").map(encodeURIComponent).join("/")}`;
}

export function resolvePublicUploadPath(relativePath: string) {
  const root = path.resolve(/* turbopackIgnore: true */ process.cwd(), getUploadRoot());
  const resolved = path.resolve(root, normalizedPublicPath(relativePath));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("Invalid public upload path.");
  return resolved;
}

/** Converts legacy absolute Hostinger paths into the public media endpoint. */
export function normalizePublicUploadUrl(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(?:https?:|data:|blob:)/i.test(trimmed) || trimmed.startsWith("/api/public-uploads/")) return trimmed;

  const normalized = trimmed.replace(/\\/g, "/");
  for (const directory of publicUploadDirectories) {
    const marker = `/${directory}/`;
    const index = normalized.lastIndexOf(marker);
    if (index >= 0) return publicUploadUrl(normalized.slice(index + 1));
  }
  return trimmed;
}

export async function saveUploadedFile(file: File, directory: string, kind: "audio" | "image" | "file") {
  const allowedAudio = [
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/flac",
    "application/zip",
    "application/x-zip-compressed"
  ];
  const allowedImage = ["image/jpeg", "image/png", "image/webp"];

  if (kind === "audio" && !allowedAudio.includes(file.type)) {
    throw new Error("Unsupported audio file type.");
  }
  if (kind === "image" && !allowedImage.includes(file.type)) {
    throw new Error("Unsupported artwork file type.");
  }
  if (kind === "audio" && file.size > maxAudioBytes) {
    throw new Error("Audio file is too large.");
  }
  if (kind === "image" && file.size > maxImageBytes) {
    throw new Error("Artwork file is too large.");
  }

  const isVercel = process.env.VERCEL === '1' || process.env.NEXT_PUBLIC_VERCEL_ENV;
  const ext = path.extname(file.name) || "";
  const fileName = `${randomUUID()}${ext}`;
  
  if (isVercel) {
    const blobPath = `${directory}/${fileName}`;
    const blob = await put(blobPath, file, { access: 'public' });
    return blob.url;
  }

  const root = getUploadRoot();
  const folder = path.join(/* turbopackIgnore: true */ process.cwd(), root, directory);
  await fs.mkdir(folder, { recursive: true });

  const filePath = path.join(folder, fileName);
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, bytes);

  return publicUploadUrl(`${directory}/${fileName}`);
}
