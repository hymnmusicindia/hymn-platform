import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const maxAudioBytes = 50 * 1024 * 1024;
const maxImageBytes = 10 * 1024 * 1024;

function isAbsoluteStoragePath(value: string) {
  return /^(?:[A-Za-z]:[\\/]|\/)/.test(value);
}

function resolveConfiguredStoragePath(value: string, cwd: string) {
  return value.startsWith("/") ? value : path.resolve(cwd, value);
}

function joinStoragePath(root: string, ...segments: string[]) {
  return root.startsWith("/") ? path.posix.join(root, ...segments.map((value) => value.replace(/\\/g, "/"))) : path.join(root, ...segments);
}

function resolveStoragePath(root: string, relativePath: string) {
  const api = root.startsWith("/") ? path.posix : path;
  const resolved = api.resolve(root, relativePath);
  if (resolved === root || !resolved.startsWith(`${root}${api.sep}`)) throw new Error("Invalid public upload path.");
  return resolved;
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function legacyRoots(env: NodeJS.ProcessEnv, cwd: string) {
  return (env.HYMN_LEGACY_STORAGE_ROOTS || "")
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => resolveConfiguredStoragePath(value, cwd));
}

export function publicStorageRootPath(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()) {
  const configured = env.STORAGE_ROOT?.trim();
  const durableRoot = env.HYMN_STORAGE_ROOT?.trim() || env.PRIVATE_STORAGE_ROOT?.trim();
  if (configured) {
    if (env.NODE_ENV === "production" && !isAbsoluteStoragePath(configured)) throw new Error("Hostinger STORAGE_ROOT must be an absolute persistent Linux path.");
    return resolveConfiguredStoragePath(configured, cwd);
  }
  if (durableRoot) {
    if (env.NODE_ENV === "production" && !isAbsoluteStoragePath(durableRoot)) throw new Error("Hostinger HYMN_STORAGE_ROOT must be an absolute persistent Linux path.");
    return durableRoot.startsWith("/") ? `${durableRoot.replace(/\/+$/, "")}/Public` : path.join(resolveConfiguredStoragePath(durableRoot, cwd), "Public");
  }
  if (env.NODE_ENV === "production") throw new Error("HYMN_STORAGE_ROOT is required for persistent Hostinger uploads.");
  return path.resolve(cwd, "public/uploads");
}

const publicUploadDirectories = ["producers", "beats", "Beatstore", "site"] as const;

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
  const root = publicStorageRootPath();
  return resolveStoragePath(root, normalizedPublicPath(relativePath));
}

export function resolvePublicUploadPaths(relativePath: string, env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()) {
  const safeRelativePath = normalizedPublicPath(relativePath);
  const managedRoots = unique([
    env.STORAGE_ROOT?.trim() ? resolveConfiguredStoragePath(env.STORAGE_ROOT.trim(), cwd) : null,
    env.HYMN_STORAGE_ROOT?.trim() ? joinStoragePath(resolveConfiguredStoragePath(env.HYMN_STORAGE_ROOT.trim(), cwd), "Public") : null,
    env.PRIVATE_STORAGE_ROOT?.trim() ? joinStoragePath(resolveConfiguredStoragePath(env.PRIVATE_STORAGE_ROOT.trim(), cwd), "Public") : null,
    ...legacyRoots(env, cwd).flatMap((root) => [root, joinStoragePath(root, "Public")]),
    path.resolve(cwd, "public/uploads")
  ]);
  return managedRoots.map((root) => resolveStoragePath(root, safeRelativePath));
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

  const canonicalImageExtension: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
  const ext = kind === "image" ? canonicalImageExtension[file.type] : path.extname(file.name).toLowerCase();
  const fileName = `${randomUUID()}${ext}`;
  
  const root = publicStorageRootPath();
  const folder = path.join(/* turbopackIgnore: true */ root, directory);
  await fs.mkdir(folder, { recursive: true });

  const filePath = path.join(folder, fileName);
  const temporaryPath = `${filePath}.${randomUUID()}.pending`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(temporaryPath, bytes, { flag: "wx" });
  await fs.rename(temporaryPath, filePath).catch(async (error) => {
    await fs.unlink(temporaryPath).catch(() => undefined);
    throw error;
  });

  return publicUploadUrl(`${directory}/${fileName}`);
}

export async function deleteUploadedFileByUrl(value: string | null | undefined) {
  if (!value?.startsWith("/api/public-uploads/")) return;
  const encoded = value.slice("/api/public-uploads/".length).split("/");
  const relativePath = encoded.map((part) => decodeURIComponent(part)).join("/");
  await fs.unlink(resolvePublicUploadPath(relativePath)).catch(() => undefined);
}

/** Permanently removes a public local asset after its database reference has been replaced. */
export async function deleteUploadedFileByUrlPermanently(value: string | null | undefined) {
  if (!value?.startsWith("/api/public-uploads/")) return;
  const encoded = value.slice("/api/public-uploads/".length).split("/");
  const relativePath = encoded.map((part) => decodeURIComponent(part)).join("/");
  try {
    await fs.unlink(resolvePublicUploadPath(relativePath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
