"use client";

import { useEffect, useId, useRef, useState } from "react";

const barsCount = 88;
const maximumBytes = 8 * 1024 * 1024;
const cache = new Map<string, number[]>();

/** Controlled by the existing player; decoding never creates a second playback source. */
export function PlaybackWaveform({ src, title, currentTime, duration, seek }: { src: string; title: string; currentTime: number; duration: number; seek: (time: number) => void }) {
  const clip = useId().replaceAll(":", "");
  const surface = useRef<HTMLDivElement>(null);
  const [visibleBars, setVisibleBars] = useState(barsCount);
  useEffect(() => {
    if (!surface.current || !window.ResizeObserver) return;
    const observer = new ResizeObserver(([entry]) => setVisibleBars(Math.max(18, Math.min(barsCount, Math.round(entry.contentRect.width / 3.8)))));
    observer.observe(surface.current);
    return () => observer.disconnect();
  }, []);
  const [decoded, setDecoded] = useState<{ src: string; bars: number[] } | null>(null);
  const bars = decoded?.src === src ? decoded.bars : cache.get(src);
  const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;
  useEffect(() => {
    if (!src || cache.has(src) || !window.OfflineAudioContext || (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    let cancelled = false;
    async function decode() {
      try {
        const response = await fetch(src, { signal: controller.signal, credentials: "same-origin" });
        if (!response.ok || Number(response.headers.get("content-length")) > maximumBytes) { await response.body?.cancel(); return; }
        const reader = response.body?.getReader();
        if (!reader) return;
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength; if (size > maximumBytes) { await reader.cancel(); return; } chunks.push(item.value); }
        if (cancelled || controller.signal.aborted) return;
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        // Low-rate offline decoding is enough for an envelope, without an audio output device.
        const context = new OfflineAudioContext(1, 1, 16000);
        const audio = await context.decodeAudioData(bytes.buffer);
        if (cancelled || controller.signal.aborted) return;
        const channels = Array.from({ length: audio.numberOfChannels }, (_, channel) => audio.getChannelData(channel));
        const peaks = Array.from({ length: barsCount }, (_, index) => {
          const start = Math.floor(index * audio.length / barsCount), end = Math.floor((index + 1) * audio.length / barsCount);
          let squares = 0, samples = 0;
          const stride = Math.max(1, Math.floor((end - start) / 100));
          for (let sample = start; sample < end; sample += stride) for (const channel of channels) { squares += channel[sample] ** 2; samples++; }
          return Math.sqrt(squares / Math.max(1, samples));
        });
        const maximum = Math.max(...peaks, .001);
        const result = peaks.map(peak => Math.min(1, peak / maximum));
        if (cache.size >= 12) cache.delete(cache.keys().next().value!);
        cache.set(src, result); setDecoded({ src, bars: result });
      } catch { /* Playback and seeking still work when decoding or CORS is unavailable. */ }
      finally { window.clearTimeout(timeout); }
    }
    void decode();
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, [src]);
  const waveform = Array.from({ length: visibleBars }, (_, index) => {
    const start = Math.floor(index * barsCount / visibleBars), end = Math.floor((index + 1) * barsCount / visibleBars);
    const height = bars ? Math.max(...bars.slice(start, end)) : 0;
    const pixels = 2 + height * 46;
    return <rect key={index} x={index * 6 + 1.7} y={(56 - pixels) / 2} width="2.6" height={pixels} rx="1.3"/>;
  });
  return <div ref={surface} className="hymn-player-waveform" data-waveform-ready={Boolean(bars)}>
    <svg viewBox={`0 0 ${visibleBars * 6} 56`} preserveAspectRatio="none" aria-hidden="true">
      <defs><clipPath id={clip}><rect width={progress * visibleBars * 6} height="56"/></clipPath></defs>
      <g className="hymn-waveform-upcoming" fill="#77777c" opacity=".62">{waveform}</g><g className="hymn-waveform-played" fill="#ffffff" clipPath={`url(#${clip})`}>{waveform}</g>
    </svg>
    <span className="hymn-player-playhead" aria-hidden="true" style={{ left: `${progress * 100}%` }}/>
    <input type="range" min="0" max={duration > 0 ? duration : 1} step="0.1" value={Math.min(currentTime, duration || 0)} disabled={duration <= 0} onChange={event => seek(Number(event.target.value))} aria-label={`Seek ${title}`} aria-valuetext={`${Math.floor(currentTime)} seconds of ${Math.floor(duration)} seconds`}/>
  </div>;
}
