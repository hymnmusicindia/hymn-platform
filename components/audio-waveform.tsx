"use client";

import { Pause, Play, RotateCcw, Waves } from "lucide-react";
import clsx from "clsx";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";

type AudioWaveformProps = {
  src?: string;
  title: string;
  subtitle?: string;
  compact?: boolean;
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
  return Array.from({ length: count }, (_, index) => 0.35 + ((index % 6) / 12));
}

export function AudioWaveform({ src, title, subtitle, compact = false }: AudioWaveformProps) {
  const validSrc = typeof src === "string" && src.trim() !== "";
  const barCount = compact ? 40 : 64;
  const [bars, setBars] = useState<number[]>(() => fallbackBars(barCount));
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [playbackError, setPlaybackError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    setBars(fallbackBars(barCount));
  }, [barCount]);

  useEffect(() => {
    if (!validSrc || typeof window === "undefined" || src?.startsWith("/api/assets/")) {
      setBars(fallbackBars(barCount));
      return;
    }

    let cancelled = false;
    const context = new window.AudioContext();

    const readWaveform = async () => {
      try {
        const response = await fetch(src);
        const buffer = await response.arrayBuffer();
        const decoded = await context.decodeAudioData(buffer.slice(0));
        if (cancelled) return;

        const channel = decoded.getChannelData(0);
        const blockSize = Math.floor(channel.length / barCount) || 1;
        const nextBars = Array.from({ length: barCount }, (_, index) => {
          const start = index * blockSize;
          let sum = 0;
          for (let offset = 0; offset < blockSize; offset += 1) {
            sum += Math.abs(channel[start + offset] ?? 0);
          }
          return Math.max(0.14, Math.min(1, sum / blockSize * 2.8));
        });

        setBars(nextBars);
        setDuration(decoded.duration);
      } catch {
        if (!cancelled) {
          setBars(fallbackBars(barCount));
        }
      } finally {
        void context.close();
      }
    };

    void readWaveform();

    return () => {
      cancelled = true;
      void context.close();
    };
  }, [barCount, src, validSrc]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => setDuration(audio.duration);
    const onCanPlay = () => setPlaybackError(false);
    const onError = () => { setPlaying(false); setPlaybackError(true); };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("error", onError);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
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

  function seek(event: MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio);
  }

  if (compact) {
    return (
      <div className={clsx("audio-waveform-inline", playing && "is-playing", !validSrc && "is-disabled", playbackError && "has-error")}>
        {validSrc ? <audio ref={audioRef} src={src} preload="metadata" /> : null}
        <button type="button" className="audio-waveform-inline-play" onClick={playbackError ? retryPlayback : togglePlayback} disabled={!validSrc} aria-label={`${playbackError ? "Retry preview for" : playing ? "Pause" : "Play"} ${title}`}>
          {playbackError ? <RotateCcw /> : playing ? <Pause /> : <Play />}
        </button>
        <div className="audio-waveform-inline-copy">
          <strong title={title}>{title}</strong>
          <span>{playbackError ? "Preview unavailable · tap retry" : subtitle || "Audio master"}</span>
        </div>
        <div role="slider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={`Seek ${title}`} onClick={seek} className="audio-waveform-inline-track">
          <div className="audio-waveform-live" aria-hidden="true">
            {bars.map((bar, index) => {
              const active = index / Math.max(1, bars.length - 1) <= progress;
              return <span key={`${index}-${bar.toFixed(3)}`} style={{ height: `${Math.max(4, Math.round(bar * 22))}px`, background: active ? "var(--accent)" : "var(--border-strong)" }} />;
            })}
          </div>
        </div>
        <span className="audio-waveform-inline-time">{currentTime} / {totalTime}</span>
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
        onClick={seek}
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
