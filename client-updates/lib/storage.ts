import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const maxAudioBytes = 50 * 1024 * 1024;
const maxImageBytes = 10 * 1024 * 1024;

function getUploadRoot() {
  return process.env.STORAGE_ROOT || "./public/uploads";
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

  const root = getUploadRoot();
  const folder = path.join(process.cwd(), root, directory);
  await fs.mkdir(folder, { recursive: true });

  const ext = path.extname(file.name) || "";
  const fileName = `${randomUUID()}${ext}`;
  const filePath = path.join(folder, fileName);
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, bytes);

  return `${root.replace("./public", "")}/${directory}/${fileName}`;
}
