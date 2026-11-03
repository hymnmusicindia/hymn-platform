"use client";
import type { CSSProperties } from 'react';
import styles from './quantity-slider.module.css';
export function QuantitySlider({ label, value, min = 0, max, step = 1, onChange, format = String, markers = [] }: {
  label: string; value: number; min?: number; max: number; step?: number; onChange: (n: number) => void; format?: (n: number) => string; markers?: { value: number; label: string }[];
}) {
  const fill = Math.max(0, Math.min(100, (value - min) / (max - min) * 100));
  return <div className={styles.control} style={{ '--slider-fill': `${fill}%` } as CSSProperties}>
    <div className={styles.rail}><span className={styles.track}/><input type="range" aria-label={label} aria-valuetext={format(value)} min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}/></div>
    <div className={styles.ends} aria-hidden="true"><span>{format(min)}</span><span>{format(max)}</span></div>
    {markers.length > 0 && <div className={styles.markers}>{markers.map(marker => <button type="button" key={marker.value} onClick={() => onChange(marker.value)} aria-pressed={value === marker.value}>{marker.label}</button>)}</div>}
  </div>;
}
