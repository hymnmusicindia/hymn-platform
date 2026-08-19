"use client";

import { Pause, Play, Waves } from "lucide-react";
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
  const barCount = compact ? 40 : 64;
  const [bars, setBars] = useState<number[]>(() => fallbackBars(barCount));
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    setBars(fallbackBars(barCount));
  }, [barCount]);

  useEffect(() => {
    if (!src || typeof window === "undefined") {
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
  }, [barCount, src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => setDuration(audio.duration);
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
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
    if (!audio || !src) return;

    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }

  function seek(event: MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio);
  }

  return (
    <div className="grid gap-3 rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
      <audio ref={audioRef} src={src} preload="metadata" />
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
          disabled={!src}
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
        className={clsx("group cursor-pointer rounded-[1.2rem] border px-3 py-4", src ? "" : "opacity-60")}
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

