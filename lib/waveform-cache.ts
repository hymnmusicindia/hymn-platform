import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { FileHandle } from "node:fs/promises";
import { generateWaveform } from "./waveform-generator";
import { validWaveform, type WaveformData } from "./waveform-data";

type CachedWaveform = { state: "ready"; data: WaveformData; etag: string } | { state: "busy" | "retry" };

/** One analysis per storage root, also across Node processes. No unbounded work queue. */
export async function cachedWaveform(root: string, identity: string, file: FileHandle): Promise<CachedWaveform> {
  const stat = await file.stat();
  const hash = createHash("sha256").update(`v1:${identity}:${stat.size}:${stat.mtimeMs}`).digest("hex");
  const directory = path.join(root, hash.slice(0, 2)), target = path.join(directory, `${hash}.json`);
  const read = async () => {
    try {
      if ((await fs.stat(target)).size > 4096) return null;
      const data: unknown = JSON.parse(await fs.readFile(target, "utf8"));
      return validWaveform(data) ? data : null;
    } catch { return null; }
  };
  const hit = await read();
  if (hit) return { state: "ready", data: hit, etag: `"waveform-${hash}"` };
  const failure = `${target}.retry`;
  const failedAt = await fs.stat(failure).then(value => value.mtimeMs, () => 0);
  if (Date.now() - failedAt < 60_000) return { state: "retry" };
  await fs.mkdir(directory, { recursive: true });
  const lockPath = path.join(root, ".generation.lock");
  // A crashed process cannot leave generation permanently disabled.
  const lockStat = await fs.stat(lockPath).catch(() => null);
  if (lockStat && Date.now() - lockStat.mtimeMs > 120_000) await fs.unlink(lockPath).catch(() => undefined);
  const lock = await fs.open(lockPath, "wx").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") return null;
    throw error;
  });
  if (!lock) return { state: "busy" };
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    const existing = await read();
    if (existing) return { state: "ready", data: existing, etag: `"waveform-${hash}"` };
    try {
      const data = await generateWaveform(file);
      await fs.writeFile(temporary, JSON.stringify(data), { flag: "wx" });
      await fs.rename(temporary, target);
      await fs.unlink(failure).catch(() => undefined);
      return { state: "ready", data, etag: `"waveform-${hash}"` };
    } catch {
      await fs.writeFile(failure, "retry");
      return { state: "retry" };
    }
  } finally {
    await fs.unlink(temporary).catch(() => undefined);
    await lock.close();
    await fs.unlink(lockPath).catch(() => undefined);
  }
}
