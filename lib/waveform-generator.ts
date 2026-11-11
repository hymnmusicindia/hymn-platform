import type { FileHandle } from "node:fs/promises";
import { setImmediate as yieldToServer } from "node:timers/promises";
import { WAVEFORM_BINS, type WaveformData } from "./waveform-data";

const maximumDuration = 30 * 60;
const maximumBytes = 500 * 1024 * 1024;

function result(values: number[], duration: number): WaveformData {
  if (!values.length || !Number.isFinite(duration) || duration <= 0 || duration > maximumDuration) throw Error("Unsupported audio duration");
  const peaks = Array.from({ length: WAVEFORM_BINS }, (_, index) => {
    const start = Math.floor(index * values.length / WAVEFORM_BINS);
    const end = Math.max(start + 1, Math.ceil((index + 1) * values.length / WAVEFORM_BINS));
    let peak = 0;
    for (let bin = start; bin < end; bin++) peak = Math.max(peak, values[bin] || 0);
    return peak;
  });
  const maximum = Math.max(...peaks, 0.00001);
  return { version: 1, duration, peaks: peaks.map(peak => Math.round(255 * peak / maximum)) };
}

/** WAV reads at most 128 small windows, even for a 500 MB master. */
async function wavPeaks(file: FileHandle, size: number): Promise<WaveformData> {
  const header = Buffer.alloc(40);
  let offset = 12, format = 0, channels = 0, rate = 0, bits = 0, align = 0;
  let start = 0, length = 0;
  for (let chunk = 0; chunk < 1024 && offset + 8 <= size; chunk++) {
    const { bytesRead } = await file.read(header, 0, 8, offset);
    if (bytesRead < 8) break;
    const name = header.toString("ascii", 0, 4), bytes = header.readUInt32LE(4);
    if (name === "fmt ") {
      if (bytes < 16 || (await file.read(header, 0, Math.min(bytes, 40), offset + 8)).bytesRead < 16) throw Error("Invalid WAV format");
      format = header.readUInt16LE(0); channels = header.readUInt16LE(2); rate = header.readUInt32LE(4); align = header.readUInt16LE(12); bits = header.readUInt16LE(14);
      if (format === 0xfffe && bytes >= 40) format = header.readUInt16LE(24);
    }
    if (name === "data") { start = offset + 8; length = Math.min(bytes, size - start); break; }
    offset += 8 + bytes + (bytes % 2);
  }
  if (![1, 3].includes(format) || ![8, 16, 24, 32].includes(bits) || (format === 3 && bits !== 32)
    || channels < 1 || channels > 8 || rate < 8000 || rate > 384000 || align !== channels * bits / 8 || !length) throw Error("Unsupported WAV format");
  const frames = Math.floor(length / align), duration = frames / rate;
  if (duration <= 0 || duration > maximumDuration) throw Error("Unsupported audio duration");
  const values: number[] = [];
  const window = Buffer.alloc(1024 * align);
  for (let bin = 0; bin < WAVEFORM_BINS; bin++) {
    const from = Math.floor(bin * frames / WAVEFORM_BINS), to = Math.floor((bin + 1) * frames / WAVEFORM_BINS);
    // Four spaced windows per bin avoid sampling only a silent edge or transient.
    let squares = 0, count = 0;
    for (let part = 0; part < 4; part++) {
      const frame = from + Math.floor((to - from) * part / 4);
      const wanted = Math.min(256, Math.max(0, to - frame)) * align;
      const read = await file.read(window, 0, wanted, start + frame * align);
      for (let byte = 0; byte + align <= read.bytesRead; byte += align) {
        for (let channel = 0; channel < channels; channel++) {
          const position = byte + channel * bits / 8;
          const sample = format === 3 ? window.readFloatLE(position) : bits === 8 ? (window[position] - 128) / 128
            : bits === 16 ? window.readInt16LE(position) / 32768 : bits === 24 ? window.readIntLE(position, 3) / 8388608 : window.readInt32LE(position) / 2147483648;
          if (Number.isFinite(sample)) { squares += sample * sample; count++; }
        }
      }
    }
    values.push(Math.sqrt(squares / Math.max(1, count)));
  }
  return result(values, duration);
}

/** Streaming MP3 decode retains one compressed chunk and a bounded envelope, never the full PCM track. */
async function mp3Peaks(file: FileHandle, size: number): Promise<WaveformData> {
  const { MPEGDecoder } = await import("mpg123-decoder");
  const decoder = new MPEGDecoder();
  await decoder.ready;
  const bytes = Buffer.alloc(16 * 1024), envelope: number[] = [];
  let samples = 0, rate = 0, bucketSize = 2048, inBucket = 0, squares = 0;
  const deadline = Date.now() + 60_000;
  try {
    for (let position = 0; position < size; position += bytes.length) {
      if (Date.now() > deadline) throw Error("Audio analysis timed out");
      const { bytesRead } = await file.read(bytes, 0, Math.min(bytes.length, size - position), position);
      if (!bytesRead) break;
      const decoded = decoder.decode(bytes.subarray(0, bytesRead));
      if (decoded.sampleRate) {
        if (rate && rate !== decoded.sampleRate) throw Error("Changing sample rate is unsupported");
        rate = decoded.sampleRate;
      }
      samples += decoded.samplesDecoded;
      if (rate && samples / rate > maximumDuration) throw Error("Unsupported audio duration");
      for (let sample = 0; sample < decoded.samplesDecoded; sample++) {
        let energy = 0;
        for (const channel of decoded.channelData) energy += channel[sample] ** 2;
        squares += energy / Math.max(1, decoded.channelData.length);
        if (++inBucket === bucketSize) {
          envelope.push(Math.sqrt(squares / inBucket)); squares = 0; inBucket = 0;
          if (envelope.length === 2048) {
            for (let index = 0; index < 1024; index++) envelope[index] = Math.sqrt((envelope[index * 2] ** 2 + envelope[index * 2 + 1] ** 2) / 2);
            envelope.length = 1024; bucketSize *= 2;
          }
        }
      }
      await yieldToServer();
    }
    if (inBucket) envelope.push(Math.sqrt(squares / inBucket));
    return result(envelope, samples / rate);
  } finally { decoder.free(); }
}

export async function generateWaveform(file: FileHandle): Promise<WaveformData> {
  const { size } = await file.stat();
  if (!size || size > maximumBytes) throw Error("Unsupported audio size");
  const header = Buffer.alloc(12);
  await file.read(header, 0, header.length, 0);
  return header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WAVE"
    ? wavPeaks(file, size) : mp3Peaks(file, size);
}
