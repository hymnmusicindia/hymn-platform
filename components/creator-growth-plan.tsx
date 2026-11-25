'use client';

import { useId, useState } from 'react';
import type { CreatorRole } from '@/lib/creator-paths';
import styles from './creator-growth-plan.module.css';

const plans = {
  producer: { unit: 'beats', label: 'Catalogue additions in your plan', paces: [1, 2, 4] },
  engineer: { unit: 'projects', label: 'Projects in your plan', paces: [1, 2, 3] },
  curator: { unit: 'review slots', label: 'Review capacity in your plan', paces: [4, 8, 12] }
} as const;

export function CreatorGrowthPlan({ role }: { role: CreatorRole }) {
  const [choices, setChoices] = useState({ producer: 2, engineer: 2, curator: 8 });
  const plan = plans[role], pace = choices[role], total = pace * 6;
  const gradient = `creator-plan-${useId().replace(/:/g, '')}`;
  const ceiling = plan.paces[2] * 6;
  const points = Array.from({ length: 7 }, (_, month) => ({ x: 18 + month * 44, y: 118 - month * pace / ceiling * 96 }));
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
  return <section className={styles.root} aria-label="Six-month creator activity planner">
    <header><span>YOUR NEXT SIX MONTHS</span><span>Plan your pace</span></header>
    <div className={styles.metric} aria-live="polite"><strong>{total}<span>{plan.unit}</span></strong><p>{plan.label}</p></div>
    <div className={styles.chart}><svg viewBox="0 0 300 144" role="img" aria-label={`Planning example: ${pace} ${plan.unit} per month adds up to ${total} over six months.`}>
      <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".2"/><stop offset="100%" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
      {[22,70,118].map(y=><line key={y} x1="18" x2="282" y1={y} y2={y} className={styles.grid}/>)}
      <path d={`${line} L282,118 L18,118 Z`} fill={`url(#${gradient})`}/><path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      {points.map((point,index)=><circle key={index} cx={point.x} cy={point.y} r={index===6?4:2.5} fill="currentColor"/>)}
      <text x="18" y="139">Now</text><text x="150" y="139" textAnchor="middle">Month 3</text><text x="282" y="139" textAnchor="end">Month 6</text>
    </svg></div>
    <div className={styles.paces} role="group" aria-label="Choose monthly activity">{plan.paces.map(value=><button key={value} type="button" aria-pressed={pace===value} onClick={()=>setChoices(current=>({...current,[role]:value}))}>{value}<span>/ month</span></button>)}</div>
    <small>Planning example. Activity does not guarantee sales, projects, streams or income.</small>
  </section>;
}
