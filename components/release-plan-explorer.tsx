"use client";

import { useId, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarDays, Info } from 'lucide-react';
import { getTrackPricingQuote } from '@/lib/distribution-pricing';
import styles from './release-plan-explorer.module.css';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const rhythms = [{ value: 1, label: 'One single' }, { value: 3, label: 'Every 4 months' }, { value: 6, label: 'Every 2 months' }, { value: 12, label: 'Monthly' }];
const currency = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

export function ReleasePlanExplorer() {
  const id = useId();
  const [cadence, setCadence] = useState(3);
  const [selectedMonth, setSelectedMonth] = useState(11);
  const values = months.map((_, index) => Math.floor((index + 1) * cadence / 12));
  const points = values.map((count, index) => ({ x: 30 + index * 40, y: 222 - count / cadence * 170 }));
  const line = points.map((point, index) => index === 0 ? `M${point.x} ${point.y}` : `H${point.x} V${point.y}`).join(' ');
  const selected = points[selectedMonth];
  const baseCost = getTrackPricingQuote(1).finalPrice;
  const nextReleaseMonth = values.findIndex((value, index) => index >= selectedMonth && value > (values[index - 1] ?? 0));
  return <div className={styles.explorer}>
    <div className={styles.controls}>
      <p className={styles.kicker}>MAKE SPACE FOR YOUR MUSIC</p>
      <h2>Your year.<br/><em>Your releases.</em></h2>
      <p>Pick your pace. Watch your catalogue take shape.</p>
      <fieldset><legend>How often would you like to release a single?</legend><div className={styles.rhythms}>{rhythms.map(option => <label key={option.value}><input type="radio" name={`${id}-rhythm`} value={option.value} checked={cadence === option.value} onChange={() => setCadence(option.value)}/><span>{option.label}</span></label>)}</div></fieldset>
      <div className={styles.metrics} aria-live="polite" aria-atomic="true"><div><strong>{cadence}</strong><span>planned {cadence === 1 ? 'single' : 'singles'}</span></div><div><strong>{currency(cadence * baseCost)}</strong><span>base cost across the year</span></div></div>
      <p className={styles.costNote}>{currency(baseCost)} per single. Add-ons extra. Discounts and subscriptions not included.</p>
      <div className={styles.actions}><Link href="/first-release">Check my first-release offer<ArrowUpRight size={15}/></Link><Link href="/pricing">Compare all plans<ArrowUpRight size={15}/></Link></div>
    </div>
    <figure className={styles.graph}>
      <figcaption><div><span>YOUR CATALOGUE, OVER A YEAR</span><strong>Your catalogue, visualised.</strong></div><span className={styles.example}>Your plan</span></figcaption>
      <div className={styles.graphCaption}><span><i/>Planned singles, cumulative</span><small>Starting from zero</small></div>
      <svg viewBox="0 0 500 255" className={styles.chart} role="img" aria-labelledby={`${id}-title ${id}-description`}>
        <title id={`${id}-title`}>{cadence} planned {cadence === 1 ? 'single' : 'singles'} across a year</title>
        <desc id={`${id}-description`}>Cumulative planned releases: {months.map((month, index) => `${month}: ${values[index]}`).join(', ')}. This shows a release schedule, not audience growth.</desc>
        <defs><linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="var(--hymn-material-ink)" stopOpacity=".25"/><stop offset="1" stopColor="var(--hymn-material-ink)" stopOpacity="0"/></linearGradient></defs>
        {[...new Set([0, Math.ceil(cadence / 2), cadence])].map(tick => <g key={tick}><line x1="30" x2="470" y1={222 - tick / cadence * 170} y2={222 - tick / cadence * 170} stroke="var(--hymn-border-strong)" strokeOpacity=".17" strokeDasharray="3 6"/><text x="13" y={226 - tick / cadence * 170} fontSize="10" fill="var(--hymn-text-muted)" textAnchor="middle">{tick}</text></g>)}
        <path d={`${line} V222 H30 Z`} fill={`url(#${id}-area)`}/><path d={line} fill="none" stroke="var(--hymn-material-ink)" strokeWidth="3" strokeLinejoin="round"/>
        <line x1={selected.x} x2={selected.x} y1="35" y2="226" stroke="var(--hymn-border-strong)" strokeOpacity=".5" strokeDasharray="4 5"/>
        {points.map((point,index) => <circle key={index} cx={point.x} cy={point.y} r={index === selectedMonth ? 7 : 3} fill={index === selectedMonth ? 'var(--hymn-text)' : 'var(--hymn-material-ink)'} stroke="var(--hymn-card)" strokeWidth="2"/>)}
        <rect x={Math.max(34, Math.min(408, selected.x - 30))} y={Math.max(16, selected.y - 31)} width="59" height="22" rx="5" fill="var(--hymn-accent)"/>
        <text x={Math.max(34, Math.min(408, selected.x - 30)) + 29.5} y={Math.max(16, selected.y - 31) + 15} textAnchor="middle" fontSize="10" fill="var(--hymn-accent-foreground)">{values[selectedMonth]} {values[selectedMonth] === 1 ? 'single' : 'singles'}</text>
      </svg>
      <div className={styles.months} aria-label="Explore your release plan by month">{months.map((month,index) => <button key={month} type="button" aria-pressed={selectedMonth === index} aria-label={`${month}: ${values[index]} planned ${values[index] === 1 ? 'single' : 'singles'} so far`} onClick={() => setSelectedMonth(index)}>{month}</button>)}</div>
      <div className={styles.annotation} role="status"><CalendarDays size={19}/><div><strong>{months[selectedMonth]}: {values[selectedMonth]} {values[selectedMonth] === 1 ? 'single' : 'singles'} in your plan</strong><p>{nextReleaseMonth < 0 ? 'Your year of releases, mapped.' : `Your ${values[selectedMonth] > (values[selectedMonth - 1] ?? 0) ? 'release this month' : `next release in ${months[nextReleaseMonth]}`} needs preparation and review.`}</p></div></div>
      <p className={styles.disclaimer}><Info size={14}/><span>Release plan only. Streams and earnings are not guaranteed. Dates depend on review.</span></p>
    </figure>
  </div>;
}
