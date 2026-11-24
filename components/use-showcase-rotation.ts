"use client";

import { useEffect, useRef, useState, type FocusEvent, type TouchEvent, type KeyboardEvent, type PointerEvent } from 'react';

/** Shared autoplay: mouse hover, keyboard focus and a deliberate touch tap pause it. */
export function useShowcaseRotation(count: number, interval = 7000) {
  const root = useRef<HTMLElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [index, setIndex] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tapped, setTapped] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  const paused = hovered || focused || tapped || !visible || !pageVisible || reduced;
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => setReduced(media.matches);
    const visibility = () => setPageVisible(!document.hidden);
    motion(); visibility();
    media.addEventListener('change', motion); document.addEventListener('visibilitychange', visibility);
    const observer = new IntersectionObserver(entries => setVisible(Boolean(entries[0]?.isIntersecting)), { threshold: .25 });
    if (root.current) observer.observe(root.current);
    return () => { observer.disconnect(); media.removeEventListener('change', motion); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => setIndex(current => (current + 1) % count), interval);
    return () => clearTimeout(timer);
  }, [count, interval, index, cycle, paused]);
  function select(next: number) { setIndex((next + count) % count); setCycle(current => current + 1); }
  const handlers = {
    onPointerEnter(event: PointerEvent<HTMLElement>) { if (event.pointerType === 'mouse') setHovered(true); },
    onPointerLeave() { setHovered(false); },
    onFocusCapture(event: FocusEvent<HTMLElement>) { setFocused(event.target.matches(':focus-visible')); },
    onBlurCapture(event: FocusEvent<HTMLElement>) { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); },
    onTouchStart(event: TouchEvent<HTMLElement>) { if (event.touches.length !== 1) { touch.current = null; return; } const start = event.touches[0]; touch.current = start ? { x: start.clientX, y: start.clientY } : null; },
    onTouchCancel() { touch.current = null; },
    onTouchEnd(event: TouchEvent<HTMLElement>) {
      const start = touch.current, end = event.changedTouches[0]; touch.current = null;
      if (!start || !end) return;
      const dx = end.clientX - start.x, dy = end.clientY - start.y;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) { event.preventDefault(); select(index + (dx < 0 ? 1 : -1)); }
      else if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && !(event.target as Element).closest('a,button,input,summary')) setTapped(current => !current);
    },
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target === event.currentTarget && event.key === ' ') { event.preventDefault(); setTapped(current => !current); }
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); select(event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : index + (event.key === 'ArrowRight' ? 1 : -1));
    }
  };
  return { root, index, select, paused, tapped, visible, handlers };
}
