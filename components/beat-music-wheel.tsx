"use client";

import { artworkPreviewUrl } from "@/lib/artwork-preview";
import { useRef, type PointerEvent } from "react";
import { Pause, Play } from "lucide-react";
import s from "./producer-link-page.module.css";

const clock = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;

export function BeatMusicWheel({ title, artwork, enabled, playing, current, duration, onToggle, onSeek }: {
  title: string; artwork: string; enabled: boolean; playing: boolean; current: number; duration: number;
  onToggle: () => void; onSeek: (seconds: number) => void;
}) {
  const gesture = useRef<{ id: number; angle: number | null; value: number; distance: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const angle = (event: PointerEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - box.left - box.width / 2;
    const y = event.clientY - box.top - box.height / 2;
    return Math.hypot(x, y) < box.width * .16 ? null : Math.atan2(y, x);
  };
  return <button type="button" role="slider" className={s.disc} disabled={!enabled}
    aria-label={`${playing ? "Pause" : "Play"} ${title}`} aria-valuemin={0} aria-valuemax={duration || 0}
    aria-valuenow={Math.min(current, duration)} aria-valuetext={`${clock(current)} of ${clock(duration)}. Tap to ${playing ? "pause" : "play"}. Rotate to seek.`}
    title="Tap to play · Rotate to seek" onClick={event => { if (event.detail === 0 || !suppressClick.current) onToggle(); suppressClick.current = false; }}
    onPointerDown={event => {
      if (!event.isPrimary || event.button !== 0) return;
      suppressClick.current = false;
      gesture.current = { id: event.pointerId, angle: angle(event), value: current, distance: 0, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const drag = gesture.current;
      if (!drag || drag.id !== event.pointerId || !duration) return;
      const next = angle(event); if (next === null) return;
      if (drag.angle === null) { drag.angle = next; return; }
      const delta = Math.atan2(Math.sin(next - drag.angle), Math.cos(next - drag.angle));
      drag.angle = next; drag.distance += Math.abs(delta);
      if (!drag.moved && drag.distance < .16) return;
      drag.moved = true; suppressClick.current = true;
      // One turn moves thirty seconds; wrapping across twelve o'clock stays continuous.
      drag.value = Math.max(0, Math.min(duration, drag.value + delta / (2 * Math.PI) * 30));
      onSeek(drag.value);
    }}
    onPointerUp={event => { if (gesture.current?.id === event.pointerId) gesture.current = null; }}
    onPointerCancel={() => { gesture.current = null; suppressClick.current = true; }}
    onLostPointerCapture={() => { gesture.current = null; }}
    onKeyDown={event => {
      const target = event.key === "Home" ? 0 : event.key === "End" ? duration :
        ["ArrowRight", "ArrowUp"].includes(event.key) ? current + 5 : ["ArrowLeft", "ArrowDown"].includes(event.key) ? current - 5 : null;
      if (target !== null) { event.preventDefault(); if (duration) onSeek(Math.max(0, Math.min(duration, target))); }
    }}>
    <svg className={s.wheelProgress} viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="26" pathLength="100" strokeDasharray={`${duration ? current / duration * 100 : 0} 100`}/></svg>
    <img src={artworkPreviewUrl(artwork, 320)} alt="" loading="lazy" draggable={false} style={{ transform: `rotate(${current * 12}deg)` }}/>
    {playing ? <Pause size={17} fill="currentColor"/> : <Play size={17} fill="currentColor"/>}
  </button>;
}
