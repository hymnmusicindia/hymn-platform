"use client";
import { useEffect, useRef, type KeyboardEvent } from 'react';
import styles from './release-stage-carousel.module.css';

type Section = { id: number; label: string; current: boolean; attention: boolean };
export function ReleaseStageCarousel({ sections, onSelect, disabled }: { sections: Section[]; onSelect(id: number): void; disabled: boolean }) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const viewport = useRef<HTMLElement>(null);
  const pendingFocus = useRef(false);
  const focused = Math.max(0, sections.findIndex(section => section.current));
  useEffect(() => {
    const button = buttons.current[focused];
    const container = viewport.current;
    if (button && container) container.scrollTo({ left: Math.max(0, button.offsetLeft - container.offsetLeft - (container.clientWidth - button.clientWidth) / 2), behavior: "auto" });
  }, [focused]);
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
  return <nav ref={viewport} tabIndex={-1} className={styles.viewport} aria-label="Release sections" aria-busy={disabled} onKeyDown={keyboard}>
    <div className={styles.track}>
      {sections.map((section, index) => <button key={section.id} ref={element => { buttons.current[index] = element; }} type="button" disabled={disabled}
        className={styles.section} data-distance={Math.min(2, Math.abs(index - focused))} tabIndex={index === focused ? 0 : -1}
        aria-current={section.current ? 'step' : undefined} aria-label={section.attention ? `${section.label}, needs attention` : section.label}
        onClick={() => move(index)}><span>{section.label}</span></button>)}
    </div>
  </nav>;
}
