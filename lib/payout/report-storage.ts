import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { localStorageProvider, storageRootPath } from "@/lib/storage-service";

export async function savePayoutReport(bytes: Buffer, filename: string) {
  if (!/^[a-zA-Z0-9_-]+\.xlsx$/.test(filename)) throw new Error("Invalid report filename.");
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const storagePath = `Reports/Payouts/${checksum}-${filename}`;
  try { await localStorageProvider.write(storagePath, bytes); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST" || createHash("sha256").update(await readPayoutReport(storagePath, checksum)).digest("hex") !== checksum) throw error; }
  return storagePath;
}
export async function readPayoutReport(storagePath: string, checksum: string) {
  if (!/^Reports\/Payouts\/[a-f0-9]{64}-[a-zA-Z0-9_-]+\.xlsx$/.test(storagePath)) throw new Error("Invalid report storage path.");
  const bytes = await fs.readFile(path.join(storageRootPath(), storagePath));
  if (createHash("sha256").update(bytes).digest("hex") !== checksum) throw new Error("Stored report failed its integrity check.");
  return bytes;
}
