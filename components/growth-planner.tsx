"use client";

import { useId, useState } from 'react';
import Link from 'next/link';
import styles from './growth-planner.module.css';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function GrowthPlanner() {
  const [cadence, setCadence] = useState(3);
  const id = useId();
  return <section className={styles.root} aria-labelledby={`${id}-title`}>
    <div className={styles.copy}><p className={styles.eyebrow}>MAKE ROOM FOR YOUR NEXT CHAPTER</p><h2 id={`${id}-title`}>One release is a beginning.<br/>Build a catalogue at your pace.</h2><p>Turn your ambition into a plan you can follow. Bring your music, prepare each release and keep your next step in view with HYMN.</p><div className={styles.links}><Link href="/first-release">Check my first-release offer</Link><Link href="/pricing">Compare release costs</Link></div><p className={styles.note}>HYMN adds zero royalty commission. The distribution partner&apos;s share applies.</p></div>
    <figure className={styles.planner}>
      <figcaption id={`${id}-caption`}>Your catalogue plan <span>Illustration · starting from zero</span></figcaption>
      <fieldset><legend>How often would you like to release?</legend><div className={styles.choices}>{[{value:1,label:'Once a year'},{value:3,label:'Every 4 months'},{value:6,label:'Every 2 months'},{value:12,label:'Monthly'}].map(option => <label key={option.value}><input type="radio" name={`${id}-cadence`} value={option.value} checked={cadence === option.value} onChange={() => setCadence(option.value)}/><span>{option.label}</span></label>)}</div></fieldset>
      <div className={styles.result} role="status"><strong>{cadence}</strong><span>planned {cadence === 1 ? 'release' : 'releases'} in a year</span></div>
      <div className={styles.chart} role="img" aria-labelledby={`${id}-caption`} aria-describedby={`${id}-description`}>
        {months.map((month, index) => { const count = Math.floor((index + 1) * cadence / 12); return <div className={styles.column} key={month}><span className={styles.bar} style={{height:`${count / 12 * 100}%`}}/><span>{month}</span></div>; })}
      </div>
      <p id={`${id}-description`} className="sr-only">Cumulative planned releases, January–December: {months.map((_, index) => Math.floor((index + 1) * cadence / 12)).join(', ')}.</p>
      <p className={styles.note}>A planning example, not measured artist growth or a promise of streams, sales or earnings. Release dates remain subject to review.</p>
    </figure>
  </section>;
}
