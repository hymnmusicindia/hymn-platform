import s from './hymn-studio.module.css';
export function HymnStudioLoading() {
  return <div className={s.studio} style={{display:'block',padding:'36px'}} role="status" aria-live="polite"><header className={s.heading}><div><p className={s.eyebrow}>HYMN Studio</p><h1>Opening your workspace…</h1><p>Getting your music and tools ready.</p></div></header><div className={s.metrics}>{['Music','Projects','Activity','Your tools'].map(label=><div className={s.metric} key={label}><span>{label}</span><strong aria-hidden="true">—</strong></div>)}</div></div>;
}
