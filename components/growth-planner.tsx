"use client";

import { useId, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, Disc3, Radio, Repeat2 } from 'lucide-react';
import styles from './growth-planner.module.css';
import { ReleasePlanExplorer } from './release-plan-explorer';

const stages = [
  { title: 'Make it release-ready', label: 'Prepare', icon: Disc3, description: 'Start with a track you feel proud of. Find a licensed beat or work with a mixing or mastering engineer before you release.', action: 'Explore studio support', href: '/studio', x: 76, y: 204 },
  { title: 'Give listeners a way in', label: 'Release', icon: Radio, description: 'Submit your music for distribution to streaming platforms. Share your release with your audience so they know where to listen.', action: 'Explore distribution', href: '/distribution', x: 254, y: 149 },
  { title: 'Build on what you learn', label: 'Keep going', icon: Repeat2, description: 'Plan your next release, stay in touch with your audience and use the response to shape your next move. A catalogue grows one track at a time.', action: 'Plan my next step', href: '/welcome', x: 449, y: 63 }
] as const;

export function GrowthPlanner() {
  const [active, setActive] = useState(1);
  const [mode, setMode] = useState<'plan' | 'journey'>('plan');
  const id = useId();
  const stage = stages[active];
  return <section id="artist-growth" className={styles.section} aria-label="Your release plan and discovery journey">
    <div className={styles.modeSwitch} aria-label="Choose a planning tool"><button type="button" aria-pressed={mode === 'plan'} aria-controls={`${id}-content`} onClick={() => setMode('plan')}>Build my release plan</button><button type="button" aria-pressed={mode === 'journey'} aria-controls={`${id}-content`} onClick={() => setMode('journey')}>Understand discovery</button></div>
    <div id={`${id}-content`}>{mode === 'plan' ? <div className={styles.plan}><ReleasePlanExplorer/></div> : <div className={styles.root}>
    <div className={styles.copy}>
      <p className={styles.eyebrow}>SMALL STEPS. MORE POSSIBILITIES.</p>
      <h2 id={`${id}-title`}>Your next listener<br/>starts with your<br/><em>next move.</em></h2>
      <p>Good music deserves a way into the world. HYMN helps with the steps around your sound, so you can keep creating and give people more chances to discover you.</p>
      <div className={styles.steps} aria-label="Explore the artist journey">{stages.map((item, index) => <button key={item.label} type="button" aria-pressed={active === index} aria-controls={`${id}-detail`} onClick={() => setActive(index)}><span className={styles.stepNumber}>0{index + 1}</span><item.icon size={17}/><span>{item.label}</span><ArrowUpRight size={16}/></button>)}</div>
      <p className={styles.ownership}><Check size={15}/>Your direction. Your music. Support along the way.</p>
    </div>
    <div className={styles.visual}>
      <figure className={styles.planner}>
        <figcaption><span>THE BIGGER PICTURE</span><strong>Build momentum, one release at a time.</strong></figcaption>
        <div className={styles.legend}><span/>A possible discovery journey <small>Illustration</small></div>
        <svg className={styles.chart} viewBox="0 0 520 280" role="img" aria-labelledby={`${id}-chart-title ${id}-chart-description`}>
          <title id={`${id}-chart-title`}>Illustrative artist discovery journey</title>
          <desc id={`${id}-chart-description`}>A conceptual curve links preparing your track, releasing it, and continuing to create. It includes dips because artist growth is uneven. No numerical results or forecasts are shown.</desc>
          <defs><linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--hymn-material-ink)" stopOpacity=".34"/><stop offset="100%" stopColor="var(--hymn-material-ink)" stopOpacity="0"/></linearGradient></defs>
          {[60,120,180,240].map(y => <line key={y} x1="26" x2="492" y1={y} y2={y} stroke="currentColor" strokeOpacity=".12" strokeDasharray="3 6"/>)}
          <path d="M26 225 C48 226 55 210 76 204 S115 178 145 187 S203 155 229 161 S242 153 254 149 S290 112 321 126 S365 84 393 98 S422 77 449 63 S477 45 492 40 L492 240 L26 240 Z" fill={`url(#${id}-fill)`}/>
          <path d="M26 225 C48 226 55 210 76 204 S115 178 145 187 S203 155 229 161 S242 153 254 149 S290 112 321 126 S365 84 393 98 S422 77 449 63 S477 45 492 40" fill="none" stroke="var(--hymn-material-ink)" strokeWidth="3.5" strokeLinecap="round"/>
          <line x1={stage.x} x2={stage.x} y1={stage.y} y2="240" stroke="var(--hymn-material-ink)" strokeOpacity=".5" strokeDasharray="4 5"/>
          {stages.map((item,index) => <g key={item.label}><circle cx={item.x} cy={item.y} r={active===index?13:7} fill="var(--hymn-material-ink)" fillOpacity={active===index?.2:1}/><circle cx={item.x} cy={item.y} r={active===index?5:3} fill={active===index?'var(--hymn-text)':'var(--hymn-card)'}/><text x={item.x} y="265" textAnchor="middle" fill="currentColor" fontSize="12">{item.label}</text></g>)}
        </svg>
        <p className={styles.note}>A journey illustration, not measured results or a forecast. Streams, listeners and earnings are never guaranteed.</p>
      </figure>
      <div id={`${id}-detail`} className={styles.detail} aria-live="polite" aria-atomic="true"><span className={styles.detailIcon}><stage.icon size={23}/></span><div><h3>{stage.title}</h3><p>{stage.description}</p><Link href={stage.href}>{stage.action}<ArrowUpRight size={15}/></Link></div></div>
    </div>
    </div>}</div>
  </section>;
}
