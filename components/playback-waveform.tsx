"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { cachedPlaybackWaveform, savePlaybackWaveform } from "@/lib/playback-waveform-cache";
import { validWaveform, type WaveformData } from "@/lib/waveform-data";

const barsCount = 88;

/** Only the selected beat loads a compact envelope; no audio fetching or browser decoding. */
export function PlaybackWaveform({ dataUrl, title, currentTime, duration, seek }: { dataUrl: string; title: string; currentTime: number; duration: number; seek: (time: number) => void }) {
  const clip = useId().replaceAll(":", "");
  const surface = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const drag = useRef<{ pointerId: number; url: string } | null>(null);
  const [scrub, setScrub] = useState<{ url: string; time: number } | null>(null);
  useEffect(() => {
    const previous = drag.current;
    drag.current = null;
    setScrub(null);
    if (previous && input.current?.hasPointerCapture(previous.pointerId)) input.current.releasePointerCapture(previous.pointerId);
  }, [dataUrl]);
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
  const displayedTime = scrub?.url === dataUrl ? scrub.time : currentTime;
  const progress = duration > 0 ? Math.max(0, Math.min(1, displayedTime / duration)) : 0;
  const pointerTime = (event: PointerEvent<HTMLInputElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width))) * duration;
  };
  const startScrub = (event: PointerEvent<HTMLInputElement>) => {
    if (!event.isPrimary || event.button !== 0 || duration <= 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, url: dataUrl };
    setScrub({ url: dataUrl, time: pointerTime(event) });
  };
  const moveScrub = (event: PointerEvent<HTMLInputElement>) => {
    if (drag.current?.pointerId !== event.pointerId || drag.current.url !== dataUrl) return;
    setScrub({ url: dataUrl, time: pointerTime(event) });
  };
  const finishScrub = (event: PointerEvent<HTMLInputElement>, commit: boolean) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    const sameTrack = drag.current.url === dataUrl;
    drag.current = null;
    if (commit && sameTrack) seek(pointerTime(event));
    setScrub(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
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
    <input ref={input} type="range" min="0" max={duration > 0 ? duration : 1} step="0.1" value={Math.min(displayedTime, duration || 0)} disabled={duration <= 0}
      onPointerDown={startScrub} onPointerMove={moveScrub} onPointerUp={event => finishScrub(event, true)} onPointerCancel={event => finishScrub(event, false)} onLostPointerCapture={event => finishScrub(event, false)}
      onChange={event => { if (!drag.current) seek(Number(event.target.value)); }} aria-label={`Seek ${title}`} aria-valuetext={`${Math.floor(displayedTime)} seconds of ${Math.floor(duration)} seconds`}/>
  </div>;
}
