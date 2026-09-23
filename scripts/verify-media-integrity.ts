import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { verifyAudioIntegrity, verifyArtworkIntegrity } from "../lib/media-integrity";
import { localStorageProvider } from "../lib/storage-service";

function wav() {
  const bytes = Buffer.alloc(44 + 44100 * 4);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(44100, 24); bytes.writeUInt32LE(176400, 28); bytes.writeUInt16LE(4, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}

async function main() {
  const valid = wav();
  assert.equal((await verifyAudioIntegrity(valid, "audio/wav")).duration, 1);
  for (const corrupt of [Buffer.alloc(0), valid.subarray(0, 16), valid.subarray(0, valid.length - 1), Buffer.from("ID3not-a-wav")]) await assert.rejects(verifyAudioIntegrity(corrupt, "audio/wav"));
  const badCodec = Buffer.from(valid); badCodec.writeUInt16LE(85, 20);
  await assert.rejects(verifyAudioIntegrity(badCodec, "audio/wav"), /PCM/);
  const emptyAudio = valid.subarray(0, 44); emptyAudio.writeUInt32LE(36, 4); emptyAudio.writeUInt32LE(0, 40);
  await assert.rejects(verifyAudioIntegrity(emptyAudio, "audio/wav"), /complete audio/);
  const mp3 = Buffer.alloc(417 * 3);
  for (let offset = 0; offset < mp3.length; offset += 417) Buffer.from([255, 251, 144, 0]).copy(mp3, offset);
  assert((await verifyAudioIntegrity(mp3, "audio/mpeg")).duration > 0);
  await assert.rejects(verifyAudioIntegrity(mp3.subarray(0, mp3.length - 1), "audio/mpeg"), /truncated/);
  await assert.rejects(verifyAudioIntegrity(Buffer.from("ID3abcdefghijk"), "audio/mpeg"));
  const cover = await sharp({ create: { width: 3000, height: 3000, channels: 3, background: "#334455" } }).jpeg().toBuffer();
  assert.equal((await verifyArtworkIntegrity(cover)).width, 3000);
  await assert.rejects(verifyArtworkIntegrity(cover.subarray(0, 300)), /./);
  const small = await sharp({ create: { width: 1000, height: 900, channels: 3, background: "white" } }).jpeg().toBuffer();
  await assert.rejects(verifyArtworkIntegrity(small), /square/);
  const dir = await mkdtemp(path.resolve(".cache", "media-integrity-"));
  const audioPath = path.join(dir, "master.wav");
  await writeFile(audioPath, wav());
  assert.equal((await verifyAudioIntegrity(audioPath, "audio/wav")).duration, 1);
  process.env.HYMN_STORAGE_ROOT = dir;
  await Promise.all([localStorageProvider.writeChunk("resume", 0, Buffer.from("same")), localStorageProvider.writeChunk("resume", 0, Buffer.from("same"))]);
  await assert.rejects(localStorageProvider.writeChunk("resume", 0, Buffer.from("evil")), /content does not match/);
  await localStorageProvider.writeChunk("resume", 1, Buffer.from("tail"));
  assert.equal((await localStorageProvider.assemble("resume", 2, 8)).size, 8);
  await assert.rejects(localStorageProvider.assemble("resume", 3, 12), /ENOENT/);
  await localStorageProvider.write("retained.wav", Buffer.from("original master"));
  const replacement = path.join(dir, "replacement.wav");
  await writeFile(replacement, Buffer.from("replacement master"));
  await assert.rejects(localStorageProvider.moveAssembled(replacement, "retained.wav"), /exist/i);
  assert.equal((await localStorageProvider.read("retained.wav")).toString(), "original master");
  console.log("Media integrity checks passed: WAV structure/codec/truncation, MP3 framing, decoded JPEG dimensions/corruption, streamed validation and overwrite protection.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
