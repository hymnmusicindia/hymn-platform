"use client";
import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import styles from './release-stage-carousel.module.css';

type Section = { id: number; label: string; current: boolean; attention: boolean };
export function ReleaseStageCarousel({ sections, onSelect, disabled }: { sections: Section[]; onSelect(id: number): void; disabled: boolean }) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const viewport = useRef<HTMLElement>(null);
  const pendingFocus = useRef(false);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const focused = Math.max(0, sections.findIndex(section => section.current));
  useEffect(() => {
    if (!disabled && pendingFocus.current) { pendingFocus.current = false; buttons.current[focused]?.focus({ preventScroll: true }); }
  }, [disabled, focused]);
  function move(index: number, focus = false) {
    if (disabled || index < 0 || index >= sections.length) return;
    if (focus) { pendingFocus.current = true; viewport.current?.focus({ preventScroll: true }); }
    onSelect(sections[index].id);
  }
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    const next = event.key === 'ArrowRight' ? focused + 1 : event.key === 'ArrowLeft' ? focused - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : null;
    if (next === null) return;
    event.preventDefault(); move(next, true);
  }
  function pointerUp(event: PointerEvent<HTMLElement>) {
    const start = gesture.current; gesture.current = null;
    if (!start) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) < 36 || Math.abs(dx) <= Math.abs(dy) * 1.3) return;
    swiped.current = true;
    move(focused + (dx < 0 ? 1 : -1));
  }
  return <nav ref={viewport} tabIndex={-1} className={styles.viewport} aria-label="Release sections" aria-busy={disabled} onKeyDown={keyboard}
    onPointerDown={event => { swiped.current = false; if (event.isPrimary && event.button === 0) gesture.current = { x: event.clientX, y: event.clientY }; }}
    onPointerMove={event => { const start = gesture.current; if (start && Math.abs(event.clientX - start.x) > 12 && Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y) * 1.3) event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerUp={pointerUp} onPointerCancel={() => { gesture.current = null; }}
    onClickCapture={event => { if (swiped.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); } }}>
    <div className={styles.track} style={{ '--section-index': focused } as CSSProperties}>
      {sections.map((section, index) => <button key={section.id} ref={element => { buttons.current[index] = element; }} type="button" disabled={disabled}
        className={styles.section} data-distance={Math.min(2, Math.abs(index - focused))} tabIndex={index === focused ? 0 : -1}
        aria-current={section.current ? 'step' : undefined} aria-label={section.attention ? `${section.label}, needs attention` : section.label}
        onClick={() => move(index)}><span>{section.label}</span></button>)}
    </div>
  </nav>;
}
