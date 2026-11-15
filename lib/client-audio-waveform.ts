"use client";

export const WAVEFORM_SAMPLES = 512;
export type AudioWaveformData = { bars: number[]; duration: number };
const cache = new Map<string, Promise<AudioWaveformData>>();
const localFiles = new WeakMap<File, Promise<AudioWaveformData>>();
const waiting: Array<() => void> = [];
let active = 0;
let decoder: OfflineAudioContext | undefined;

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = () => {
      active++;
      void work().then(resolve, reject).finally(() => {
        active--;
        waiting.shift()?.();
      });
    };
    if (active < 2) start(); else waiting.push(start);
  });
}

async function decode(buffer: ArrayBuffer): Promise<AudioWaveformData> {
  // Low-rate offline decoding avoids opening an audio output and keeps album batches lighter.
  decoder ??= new OfflineAudioContext(1, 1, 8000);
  const audio = await decoder.decodeAudioData(buffer);
  const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
  const block = Math.max(1, Math.ceil(audio.length / WAVEFORM_SAMPLES));
  const peaks = Array.from({ length: WAVEFORM_SAMPLES }, (_, i) => {
    const start = i * block, end = Math.min(audio.length, start + block);
    const stride = Math.max(1, Math.floor((end - start) / 128));
    let peak = 0, sum = 0, count = 0;
    for (let j = start; j < end; j += stride) for (const channel of channels) {
      const value = Math.abs(channel[j] ?? 0);
      peak = Math.max(peak, value); sum += value * value; count++;
    }
    return peak * .3 + Math.sqrt(sum / Math.max(count, 1)) * .7;
  });
  const maximum = Math.max(...peaks, .001);
  return { bars: peaks.map(value => Math.max(.06, Math.min(1, value / maximum))), duration: audio.duration };
}

function remember(src: string, result: Promise<AudioWaveformData>) {
  cache.set(src, result);
  while (cache.size > 96) cache.delete(cache.keys().next().value!);
  void result.then(data => {
    if (src.startsWith("blob:")) return;
    try {
      const prefix = "hymn-waveform:v2:";
      const keys = Object.keys(localStorage).filter(key => key.startsWith(prefix));
      if (keys.length >= 64) localStorage.removeItem(keys[0]);
      localStorage.setItem(`${prefix}${src}`, JSON.stringify(data));
    } catch { /* Storage being full or disabled must not block playback. */ }
  }, () => { if (cache.get(src) === result) cache.delete(src); });
  return result;
}

export function prepareAudioWaveformFile(file: File) {
  let result = localFiles.get(file);
  if (!result) {
    result = enqueue(async () => decode(await file.arrayBuffer()));
    localFiles.set(file, result);
    void result.catch(() => localFiles.delete(file));
  }
  return result;
}

export function seedAudioWaveform(src: string, result: Promise<AudioWaveformData>) {
  remember(src, result);
}

export function loadAudioWaveform(src: string): Promise<AudioWaveformData> {
  const pending = cache.get(src);
  if (pending) return pending;
  try {
    const data = JSON.parse(localStorage.getItem(`hymn-waveform:v2:${src}`) || "null") as AudioWaveformData | null;
    if (data && Number.isFinite(data.duration) && data.duration >= 0 && Array.isArray(data.bars) && data.bars.length === WAVEFORM_SAMPLES && data.bars.every(value => Number.isFinite(value) && value >= 0 && value <= 1)) {
      return remember(src, Promise.resolve(data));
    }
  } catch {}
  return remember(src, enqueue(async () => {
    const response = await fetch(src, { signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error("Waveform audio unavailable");
    return decode(await response.arrayBuffer());
  }));
}
