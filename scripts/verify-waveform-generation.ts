import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import type { FileHandle } from "node:fs/promises";
import { generateWaveform } from "../lib/waveform-generator";
import { cachedWaveform } from "../lib/waveform-cache";
import { validWaveform } from "../lib/waveform-data";

export function wavFixture(seconds = 90, silent = false) {
  const rate = 44100, channels = 2, frames = rate * seconds, bytes = Buffer.alloc(44 + frames * channels * 2);
  bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(channels, 22); bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 4, 28);
  bytes.writeUInt16LE(4, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  if (!silent) for (let frame = 0; frame < frames; frame++) {
    const gain = .1 + .65 * Math.sin(frame / rate * 2.1) ** 2;
    const sample = Math.round(Math.sin(frame / rate * Math.PI * 880) * gain * 26000);
    bytes.writeInt16LE(sample, 44 + frame * 4); bytes.writeInt16LE(Math.round(sample * .5), 46 + frame * 4);
  }
  return bytes;
}

async function main() {
  await fs.mkdir(".cache", { recursive: true });
  const root = await fs.mkdtemp(path.resolve(".cache/waveform-generation-"));
  const target = path.join(root, "large.wav"), bytes = wavFixture();
  assert(bytes.length > 8 * 1024 * 1024);
  await fs.writeFile(target, bytes);
  const file = await fs.open(target, "r");
  let readBytes = 0;
  const bounded = { stat: () => file.stat(), read: async (...args: Parameters<typeof file.read>) => {
    const result = await file.read(...args); readBytes += result.bytesRead; return result;
  } } as FileHandle;
  const waveform = await generateWaveform(bounded);
  assert(validWaveform(waveform)); assert.equal(waveform.duration, 90);
  assert(new Set(waveform.peaks).size > 20); assert(readBytes < 600_000, `Bounded reads, got ${readBytes}`);
  assert(JSON.stringify(waveform).length < 1024);
  const cacheRoot = path.join(root, "cache");
  const first = await cachedWaveform(cacheRoot, "large-v1", file); assert.equal(first.state, "ready");
  const noReads = { stat: () => file.stat(), read: () => { throw Error("Cache hit must not analyse audio"); } } as unknown as FileHandle;
  const hit = await cachedWaveform(cacheRoot, "large-v1", noReads); assert.deepEqual(hit, first);
  await fs.writeFile(path.join(cacheRoot, ".generation.lock"), "busy");
  assert.equal((await cachedWaveform(cacheRoot, "different-source", noReads)).state, "busy");
  await fs.unlink(path.join(cacheRoot, ".generation.lock"));
  await fs.writeFile(path.join(cacheRoot, ".generation.lock"), "stale");
  await fs.utimes(path.join(cacheRoot, ".generation.lock"), new Date(0), new Date(0));
  assert.equal((await cachedWaveform(cacheRoot, "different-source", file)).state, "ready");
  await file.close();
  const silentPath = path.join(root, "silent.wav"); await fs.writeFile(silentPath, wavFixture(1, true));
  const silent = await fs.open(silentPath, "r"); assert((await generateWaveform(silent)).peaks.every(peak => peak === 0)); await silent.close();
  const invalidPath = path.join(root, "invalid.wav"); await fs.writeFile(invalidPath, Buffer.from("RIFF\0\0\0\0WAVEinvalid"));
  const invalid = await fs.open(invalidPath, "r");
  assert.equal((await cachedWaveform(cacheRoot, "invalid", invalid)).state, "retry");
  assert.equal((await cachedWaveform(cacheRoot, "invalid", { stat: () => invalid.stat(), read: () => { throw Error("Must back off"); } } as unknown as FileHandle)).state, "retry");
  await invalid.close();
  const mp3Index = process.argv.indexOf("--mp3");
  if (mp3Index >= 0) {
    const mp3 = await fs.open(process.argv[mp3Index + 1], "r");
    try {
      const stat = await mp3.stat(), started = Date.now(), decoded = await generateWaveform(mp3);
      assert(validWaveform(decoded)); assert(new Set(decoded.peaks).size > 10); assert(JSON.stringify(decoded).length < 1024);
      console.log(`PASS real MP3: ${stat.size} bytes, ${decoded.duration.toFixed(2)} seconds, ${Date.now() - started} ms, bounded streaming decode`);
    } finally { await mp3.close(); }
  }
  console.log(`PASS waveform generation: >8 MB WAV, ${readBytes} bytes analysed, real peaks, <1 KB envelope, silence, disk cache, concurrency gate, stale-lock recovery and failure backoff`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
