import { open } from "node:fs/promises";
import sharp from "sharp";

type Reader = { size: number; read(offset: number, length: number): Promise<Buffer> };

async function inspectAudio(reader: Reader, mime: string) {
  const header = await reader.read(0, 12);
  if (header.length < 12) throw new Error("Audio file is empty or truncated.");
  if (["audio/wav", "audio/x-wav"].includes(mime)) {
    if (header.toString("ascii", 0, 4) !== "RIFF" || header.toString("ascii", 8, 12) !== "WAVE" || header.readUInt32LE(4) + 8 !== reader.size) throw new Error("WAV container is invalid or truncated.");
    let offset = 12;
    let format: { channels: number; sampleRate: number; bits: number; alignment: number } | undefined;
    let dataSize = 0;
    while (offset + 8 <= reader.size) {
      const chunk = await reader.read(offset, 8);
      const kind = chunk.toString("ascii", 0, 4), length = chunk.readUInt32LE(4);
      if (offset + 8 + length > reader.size) throw new Error("WAV contains a truncated audio chunk.");
      if (kind === "fmt ") {
        if (length < 16) throw new Error("WAV format header is incomplete.");
        const fmt = await reader.read(offset + 8, Math.min(length, 40));
        let codec = fmt.readUInt16LE(0);
        if (codec === 65534 && length >= 40) {
          if (!fmt.subarray(26, 40).equals(Buffer.from("000000001000800000aa00389b71", "hex"))) throw new Error("Unsupported WAV extensible codec.");
          codec = fmt.readUInt16LE(24);
        }
        const channels = fmt.readUInt16LE(2), sampleRate = fmt.readUInt32LE(4), bits = fmt.readUInt16LE(14), alignment = fmt.readUInt16LE(12);
        if (![1, 3].includes(codec) || ![1, 2].includes(channels) || sampleRate < 44100 || sampleRate > 192000 || ![16, 24, 32].includes(bits) || (codec === 3 && bits !== 32) || alignment !== channels * bits / 8 || fmt.readUInt32LE(8) !== sampleRate * alignment) throw new Error("WAV must contain supported mono/stereo PCM audio at 44.1–192 kHz and 16/24/32-bit depth.");
        format = { channels, sampleRate, bits, alignment };
      }
      if (kind === "data") dataSize += length;
      offset += 8 + length + (length % 2);
    }
    if (!format || !dataSize || dataSize % format.alignment || offset !== reader.size) throw new Error("WAV has no complete audio frames.");
    return { ...format, duration: dataSize / format.alignment / format.sampleRate };
  }
  if (mime !== "audio/mpeg") throw new Error("Unsupported audio master format.");
  let offset = 0, frames = 0, duration = 0;
  if (header.toString("ascii", 0, 3) === "ID3") {
    if (header.subarray(6, 10).some(value => value > 127)) throw new Error("Invalid MP3 metadata header.");
    offset = 10 + (header[6] << 21 | header[7] << 14 | header[8] << 7 | header[9]) + (header[5] & 16 ? 10 : 0);
  }
  while (offset < reader.size) {
    const frame = await reader.read(offset, Math.min(4, reader.size - offset));
    if (reader.size - offset === 128 && frame.toString("ascii", 0, 3) === "TAG") { offset = reader.size; break; }
    if (frame.length < 4 || frame[0] !== 255 || (frame[1] & 224) !== 224) throw new Error("MP3 contains invalid or truncated audio frames.");
    const version = frame[1] >> 3 & 3, layer = frame[1] >> 1 & 3, bitrateIndex = frame[2] >> 4, rateIndex = frame[2] >> 2 & 3;
    if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) throw new Error("Unsupported MP3 frame encoding.");
    const bitrate = (version === 3 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160])[bitrateIndex] * 1000;
    const sampleRate = [44100, 48000, 32000][rateIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    const length = Math.floor((version === 3 ? 144 : 72) * bitrate / sampleRate) + (frame[2] >> 1 & 1);
    if (offset + length > reader.size) throw new Error("MP3 ends in a truncated audio frame.");
    offset += length; frames++; duration += (version === 3 ? 1152 : 576) / sampleRate;
  }
  if (frames < 2) throw new Error("MP3 does not contain usable audio.");
  return { duration };
}

export async function verifyAudioIntegrity(input: Buffer | string, mime: string) {
  if (Buffer.isBuffer(input)) return inspectAudio({ size: input.length, read: async (offset, length) => input.subarray(offset, offset + length) }, mime);
  const file = await open(input, "r");
  try {
    const { size } = await file.stat();
    let cache = Buffer.alloc(0), cacheOffset = -1;
    return await inspectAudio({ size, read: async (offset, length) => {
      if (offset < cacheOffset || offset + length > cacheOffset + cache.length) {
        cache = Buffer.alloc(Math.min(65536, size - offset));
        const result = await file.read(cache, 0, cache.length, offset);
        cache = cache.subarray(0, result.bytesRead); cacheOffset = offset;
      }
      return cache.subarray(offset - cacheOffset, offset - cacheOffset + length);
    } }, mime);
  } finally { await file.close(); }
}

export async function verifyArtworkIntegrity(input: Buffer | string) {
  const decoder = sharp(input, { failOn: "warning", limitInputPixels: 36_000_000 });
  const metadata = await decoder.metadata();
  if (metadata.format !== "jpeg" || !metadata.width || metadata.width !== metadata.height || metadata.width < 3000 || metadata.width > 6000 || metadata.space === "cmyk" || metadata.hasAlpha || (metadata.pages ?? 1) !== 1) throw new Error("Artwork must be a complete RGB JPEG, square, between 3000 and 6000 pixels.");
  // Decode the full image to catch a valid-looking header with corrupt pixels.
  await decoder.stats();
  return { width: metadata.width, height: metadata.height };
}
