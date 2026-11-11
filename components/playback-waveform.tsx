"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cachedPlaybackWaveform, savePlaybackWaveform } from "@/lib/playback-waveform-cache";
import { validWaveform, type WaveformData } from "@/lib/waveform-data";

const barsCount = 88;

/** Only the selected beat loads a compact envelope; no audio fetching or browser decoding. */
export function PlaybackWaveform({ dataUrl, title, currentTime, duration, seek }: { dataUrl: string; title: string; currentTime: number; duration: number; seek: (time: number) => void }) {
  const clip = useId().replaceAll(":", "");
  const surface = useRef<HTMLDivElement>(null);
  const [visibleBars, setVisibleBars] = useState(barsCount);
  useEffect(() => {
    if (!surface.current || !window.ResizeObserver) return;
    const observer = new ResizeObserver(([entry]) => setVisibleBars(Math.max(18, Math.min(barsCount, Math.round(entry.contentRect.width / 3.8)))));
    observer.observe(surface.current);
    return () => observer.disconnect();
  }, []);
  const [loaded, setLoaded] = useState<{ url: string; data: WaveformData } | null>(null);
  const [requestState, setRequestState] = useState<{ url: string; state: "loading" | "unavailable" }>({ url: dataUrl, state: "loading" });
  const data = loaded?.url === dataUrl ? loaded.data : cachedPlaybackWaveform(dataUrl);
  const bars = data?.peaks;
  const state = data ? "ready" : requestState.url === dataUrl ? requestState.state : "loading";
  const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;
  useEffect(() => {
    if (!dataUrl || cachedPlaybackWaveform(dataUrl)) return;
    const controller = new AbortController();
    let timer = 0, attempts = 0;
    setRequestState({ url: dataUrl, state: "loading" });
    async function load() {
      let retry = 2000;
      const request = new AbortController();
      const abort = () => request.abort();
      controller.signal.addEventListener("abort", abort, { once: true });
      const timeout = window.setTimeout(abort, 65_000);
      try {
        const response = await fetch(dataUrl, { signal: request.signal, credentials: "same-origin" });
        retry = Math.min(60_000, Math.max(1000, (Number(response.headers.get("retry-after")) || 2) * 1000));
        if (response.status === 404) { setRequestState({ url: dataUrl, state: "unavailable" }); return; }
        if (response.status === 200) {
          const text = await response.text();
          const next: unknown = text.length <= 4096 ? JSON.parse(text) : null;
          if (!validWaveform(next)) throw Error("Invalid waveform response");
          if (controller.signal.aborted) return;
          savePlaybackWaveform(dataUrl, next); setLoaded({ url: dataUrl, data: next }); return;
        }
      } catch { /* Transient network failures retry only while this beat remains selected. */ }
      finally { window.clearTimeout(timeout); controller.signal.removeEventListener("abort", abort); }
      if (controller.signal.aborted) return;
      if (++attempts < 12) timer = window.setTimeout(load, Math.max(retry, Math.min(10_000, 1000 * 2 ** (attempts - 1))));
      else setRequestState({ url: dataUrl, state: "unavailable" });
    }
    void load();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [dataUrl]);
  const waveform = Array.from({ length: visibleBars }, (_, index) => {
    const start = Math.floor(index * (bars?.length || barsCount) / visibleBars), end = Math.floor((index + 1) * (bars?.length || barsCount) / visibleBars);
    const height = bars ? Math.max(...bars.slice(start, end)) / 255 : 0;
    const pixels = 2 + height * 46;
    return <rect key={index} x={index * 6 + 1.7} y={(56 - pixels) / 2} width="2.6" height={pixels} rx="1.3"/>;
  });
  return <div ref={surface} className="hymn-player-waveform" data-waveform-ready={Boolean(bars)} data-waveform-state={state}>
    <svg viewBox={`0 0 ${visibleBars * 6} 56`} preserveAspectRatio="none" aria-hidden="true">
      <defs><clipPath id={clip}><rect width={progress * visibleBars * 6} height="56"/></clipPath></defs>
      <g className="hymn-waveform-upcoming" fill="#77777c" opacity=".62">{waveform}</g><g className="hymn-waveform-played" fill="#ffffff" clipPath={`url(#${clip})`}>{waveform}</g>
    </svg>
    {!data ? <span className="hymn-player-waveform-message">{state === "loading" ? "Preparing waveform" : "Waveform unavailable"}</span> : null}
    <span className="hymn-player-playhead" aria-hidden="true" style={{ left: `${progress * 100}%` }}/>
    <input type="range" min="0" max={duration > 0 ? duration : 1} step="0.1" value={Math.min(currentTime, duration || 0)} disabled={duration <= 0} onChange={event => seek(Number(event.target.value))} aria-label={`Seek ${title}`} aria-valuetext={`${Math.floor(currentTime)} seconds of ${Math.floor(duration)} seconds`}/>
  </div>;
}
