"use client";
import { useEffect, type RefObject } from "react";
export function useDriftingRail(ref: RefObject<HTMLDivElement | null>, speed = 20, stopped = false) {
  useEffect(() => {
    const rail = ref.current; if (!rail || stopped) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, last = 0, position = rail.scrollLeft, direction = 1;
    let hovered = false;
    const pause = () => { hovered = true; }; const resume = () => { hovered = false; position = rail.scrollLeft; };
    const tick = (now: number) => {
      const elapsed = last ? Math.min(now - last, 50) : 0; last = now;
      if (!hovered && !motion.matches && !document.hidden && !rail.contains(document.activeElement)) {
        const max = Math.max(0, rail.scrollWidth - rail.clientWidth);
        if (position >= max) direction = -1;
        if (position <= 0) direction = 1;
        position = Math.max(0, Math.min(max, position + direction * elapsed * speed / 1000));
        rail.scrollLeft = position;
      }
      frame = requestAnimationFrame(tick);
    };
    rail.addEventListener('pointerenter', pause); rail.addEventListener('pointerleave', resume);
    rail.addEventListener('touchstart', pause, { passive: true }); rail.addEventListener('touchend', resume);
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); rail.removeEventListener('pointerenter', pause); rail.removeEventListener('pointerleave', resume); rail.removeEventListener('touchstart', pause); rail.removeEventListener('touchend', resume); };
  }, [ref, speed, stopped]);
}
