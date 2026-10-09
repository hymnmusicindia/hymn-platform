"use client";

import { Pause, Pencil, Play, RotateCcw, Waves } from "lucide-react";
import clsx from "clsx";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

type AudioWaveformProps = {
  src?: string;
  title: string;
  subtitle?: string;
  compact?: boolean;
  compactMinimal?: boolean;
  editableTitle?: {
    value: string;
    placeholder: string;
    ariaLabel: string;
    inputRef?: (node: HTMLInputElement | null) => void;
    onChange: (value: string) => void;
  };
};

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "00:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function fallbackBars(count: number) {
  return Array.from({ length: count }, () => 0.08);
}

const PEAK_SAMPLES = 512;

function fitPeaksToWidth(peaks: number[], width: number) {
  const count = Math.max(24, Math.min(160, Math.floor(width / 4)));
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * peaks.length / count);
    const end = Math.max(start + 1, Math.ceil((index + 1) * peaks.length / count));
    let amplitude = 0;
    for (let sample = start; sample < end; sample++) amplitude = Math.max(amplitude, peaks[sample] ?? 0);
    return amplitude;
  });
}

export function AudioWaveform({ src, title, subtitle, compact = false, compactMinimal = false, editableTitle }: AudioWaveformProps) {
  const validSrc = typeof src === "string" && src.trim() !== "";
  const [peaks, setPeaks] = useState<number[]>(() => fallbackBars(PEAK_SAMPLES));
  const [waveformWidth, setWaveformWidth] = useState(480);
  const [waveformReady, setWaveformReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [playbackError, setPlaybackError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const seekingRef = useRef(false);
  const bars = useMemo(() => fitPeaksToWidth(peaks, waveformWidth), [peaks, waveformWidth]);

  useEffect(() => {
    const element = waveformRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      if (width > 0) setWaveformWidth(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [compact]);

  useEffect(() => {
    if (!validSrc || typeof window === "undefined") {
      setPeaks(fallbackBars(PEAK_SAMPLES));
      setWaveformReady(false);
      return;
    }

    let cancelled = false;
    let context: AudioContext | null = null;
    const cacheKey = `hymn-waveform:v2:${src}`;
    setPeaks(fallbackBars(PEAK_SAMPLES));
    setWaveformReady(false);
    try {
      const cached = window.localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as { bars?: number[]; duration?: number };
        if (Array.isArray(parsed.bars) && parsed.bars.length === PEAK_SAMPLES) {
          setPeaks(parsed.bars);
          setWaveformReady(true);
          if (typeof parsed.duration === "number") setDuration(parsed.duration);
          return;
        }
        if (typeof parsed.duration === "number") setDuration(parsed.duration);
      }
    } catch {}
    const controller = new AbortController();
    const schedule = typeof window.requestIdleCallback === "function"
      ? (callback: () => void) => window.requestIdleCallback(callback, { timeout: 1800 })
      : (callback: () => void) => window.setTimeout(callback, 700);
    const cancelSchedule = typeof window.cancelIdleCallback === "function"
      ? (handle: number) => window.cancelIdleCallback(handle)
      : (handle: number) => window.clearTimeout(handle);

    const readWaveform = async () => {
      try {
        const response = await fetch(src, { signal: controller.signal });
        if (!response.ok) throw new Error("Waveform audio unavailable");
        const buffer = await response.arrayBuffer();
        context = new window.AudioContext();
        const decoded = await context.decodeAudioData(buffer.slice(0));
        if (cancelled) return;

        const channels = Array.from({ length: decoded.numberOfChannels }, (_, channelIndex) => decoded.getChannelData(channelIndex));
        const blockSize = Math.max(1, Math.ceil(decoded.length / PEAK_SAMPLES));
        const rawPeaks = Array.from({ length: PEAK_SAMPLES }, (_, index) => {
          const start = index * blockSize;
          const end = Math.min(decoded.length, start + blockSize);
          let peak = 0;
          let sumSquares = 0;
          let count = 0;
          const stride = Math.max(1, Math.floor((end - start) / 128));
          for (let sample = start; sample < end; sample += stride) {
            for (const channel of channels) {
              const value = Math.abs(channel[sample] ?? 0);
              peak = Math.max(peak, value);
              sumSquares += value * value;
              count++;
            }
          }
          return peak * 0.3 + Math.sqrt(sumSquares / Math.max(1, count)) * 0.7;
        });
        const peakMax = Math.max(...rawPeaks, 0.001);
        const nextBars = rawPeaks.map((peak) => Math.max(0.06, Math.min(1, peak / peakMax)));

        setPeaks(nextBars);
        setWaveformReady(true);
        setDuration(decoded.duration);
        try { window.localStorage.setItem(cacheKey, JSON.stringify({ bars: nextBars, duration: decoded.duration })); } catch {}
      } catch {
        if (!cancelled) {
          setPeaks(fallbackBars(PEAK_SAMPLES));
          setWaveformReady(false);
        }
      } finally {
        if (context && context.state !== "closed") void context.close();
      }
    };

    const scheduled = schedule(() => { void readWaveform(); });

    return () => {
      cancelled = true;
      controller.abort();
      cancelSchedule(scheduled);
    };
  }, [src, validSrc]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => setDuration(audio.duration);
    const onTimeUpdate = () => {
      if (audio.duration && Number.isFinite(audio.currentTime)) setProgress(audio.currentTime / audio.duration);
    };
    const onCanPlay = () => setPlaybackError(false);
    const onError = () => { setPlaying(false); setPlaybackError(true); };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("error", onError);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("ended", onEnded);
    };
  }, [src]);

  useEffect(() => {
    if (!playing || !audioRef.current) return;

    const syncProgress = () => {
      const audio = audioRef.current;
      if (!audio || !audio.duration) {
        rafRef.current = window.requestAnimationFrame(syncProgress);
        return;
      }

      setProgress(audio.currentTime / audio.duration);
      if (!audio.paused) {
        rafRef.current = window.requestAnimationFrame(syncProgress);
      }
    };

    rafRef.current = window.requestAnimationFrame(syncProgress);
    return () => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [playing]);

  const currentTime = useMemo(() => formatTime(progress * duration), [duration, progress]);
  const totalTime = useMemo(() => formatTime(duration), [duration]);

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !validSrc) return;

    if (audio.paused) {
      setPlaybackError(false);
      void audio.play().catch(() => setPlaybackError(true));
    } else {
      audio.pause();
    }
  }

  function retryPlayback() {
    const audio = audioRef.current;
    if (!audio || !validSrc) return;
    setPlaybackError(false);
    audio.load();
    void audio.play().catch(() => setPlaybackError(true));
  }

  function seekAt(clientX: number, element: HTMLDivElement) {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;

    const rect = element.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio);
  }

  function beginSeek(event: PointerEvent<HTMLDivElement>) {
    seekingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    seekAt(event.clientX, event.currentTarget);
  }

  function moveSeek(event: PointerEvent<HTMLDivElement>) {
    if (seekingRef.current) seekAt(event.clientX, event.currentTarget);
  }

  function endSeek(event: PointerEvent<HTMLDivElement>) {
    seekingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function keyboardSeek(event: KeyboardEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio?.duration) return;
    const step = event.shiftKey ? 10 : 5;
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      audio.currentTime = event.key === "Home" ? 0 : audio.duration;
      setProgress(audio.currentTime / audio.duration);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + (event.key === "ArrowLeft" ? -step : step)));
      setProgress(audio.currentTime / audio.duration);
    }
  }

  if (compact) {
    return (
      <div className={clsx("audio-waveform-inline", compactMinimal && "audio-waveform-inline-minimal", playing && "is-playing", !validSrc && "is-disabled", playbackError && "has-error")}>
        {validSrc ? <audio ref={audioRef} src={src} preload="metadata" /> : null}
        <button type="button" className="audio-waveform-inline-play" onClick={playbackError ? retryPlayback : togglePlayback} disabled={!validSrc} aria-label={`${playbackError ? "Retry preview for" : playing ? "Pause" : "Play"} ${title}`}>
          {playbackError ? <RotateCcw /> : playing ? <Pause /> : <Play />}
        </button>
        {!compactMinimal ? <div className="audio-waveform-inline-copy">
          {editableTitle ? (
            <label className="audio-waveform-inline-name">
              <Pencil aria-hidden="true" />
              <input
                ref={editableTitle.inputRef}
                value={editableTitle.value}
                onChange={(event) => editableTitle.onChange(event.target.value)}
                placeholder={editableTitle.placeholder}
                aria-label={editableTitle.ariaLabel}
              />
            </label>
          ) : <strong title={title}>{title}</strong>}
          <span>{playbackError ? "Preview unavailable · tap retry" : subtitle || ""}</span>
        </div> : null}
        <div ref={waveformRef} role="slider" tabIndex={validSrc ? 0 : -1} aria-disabled={!validSrc} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-valuetext={`${currentTime} of ${totalTime}`} aria-label={`Seek ${title}`} onPointerDown={beginSeek} onPointerMove={moveSeek} onPointerUp={endSeek} onPointerCancel={endSeek} onKeyDown={keyboardSeek} className="audio-waveform-inline-track">
          <div className={clsx("audio-waveform-live", !waveformReady && "is-pending")} aria-hidden="true">
            {bars.map((bar, index) => {
              const active = index / Math.max(1, bars.length - 1) <= progress;
              return <span key={index} style={{ height: `${Math.max(3, Math.round(bar * 32))}px`, background: active ? "var(--accent)" : "var(--text-soft)" }} />;
            })}
          </div>
          <span className="audio-waveform-playhead" style={{ left: `${Math.min(100, Math.max(0, progress * 100))}%`, opacity: progress > 0 ? 1 : 0 }} aria-hidden="true" />
        </div>
        {!compactMinimal ? <span className="audio-waveform-inline-time">{currentTime} / {totalTime}</span> : null}
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
      {validSrc ? <audio ref={audioRef} src={src} preload="metadata" /> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold" style={{ color: "var(--text)" }}>
            {title}
          </p>
          <p className="truncate text-sm" style={{ color: "var(--text-soft)" }}>
            {subtitle || "Waveform preview"}
          </p>
        </div>
        <button
          type="button"
          onClick={togglePlayback}
          disabled={!validSrc}
          className="pressable inline-flex h-11 w-11 items-center justify-center rounded-full border disabled:opacity-40"
          style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
      </div>

      <div
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-label={`Seek ${title}`}
        onPointerDown={beginSeek}
        onPointerMove={moveSeek}
        onPointerUp={endSeek}
        onPointerCancel={endSeek}
        onKeyDown={keyboardSeek}
        tabIndex={validSrc ? 0 : -1}
        aria-disabled={!validSrc}
        aria-valuetext={`${currentTime} of ${totalTime}`}
        ref={waveformRef}
        className={clsx("group cursor-pointer rounded-[1.2rem] border px-3 py-4", validSrc ? "" : "opacity-60")}
        style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.02)" }}
      >
        <div className="flex h-20 items-end gap-[3px]">
          {bars.length > 0 ? (
            bars.map((bar, index) => {
              const active = index / Math.max(1, bars.length - 1) <= progress;
              const height = Math.max(16, Math.round((compact ? 42 : 62) * bar));
              const bounce = playing ? 1 + ((index % 5) * 0.03) : 1;
              return (
                <span
                  key={`${index}-${bar.toFixed(3)}`}
                  className="flex-1 rounded-full"
                  style={{
                    height: `${height}px`,
                    background: active ? "var(--accent)" : "rgba(255,255,255,0.14)",
                    opacity: active ? 1 : 0.72,
                    transform: `scaleY(${bounce})`
                  }}
                />
              );
            })
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Waves className="h-5 w-5" />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-soft)" }}>
        <span>{currentTime}</span>
        <span>{totalTime}</span>
      </div>
    </div>
  );
}


// vercel trigger 12
