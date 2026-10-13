"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, Check, Disc3, Headphones, Music2, Play, Plus, Trash2 } from "lucide-react";
import { ENGINEER_SPECIALTIES, type EngineerWork } from "@/lib/engineer-applications";
import { workPlayer } from "@/lib/engineer-portfolio";
import styles from "./engineer-work-showcase.module.css";

export function EngineerWorkShowcase({ works, name, years }: { works: EngineerWork[]; name?: string; years?: number | null }) {
  const [selected, setSelected] = useState(0);
  const [filter, setFilter] = useState("All");
  const [loaded, setLoaded] = useState(false);
  const roles = [...new Set(works.map(work => work.role).filter(Boolean))];
  const visible = works.map((work, index) => ({ work, index })).filter(({ work }) => filter === "All" || work.role === filter);
  const active = visible.find(({ index }) => index === selected) ?? visible[0];
  if (!active) return null;
  const work = active.work, player = workPlayer(work.url);
  function select(index: number) { setSelected(index); setLoaded(false); }
  return <section className={styles.showcase} aria-label="Engineer experience and work">
    <header className={styles.heading}><div><p className={styles.kicker}>THE LISTENING ROOM</p><h2>Experience you can hear.</h2><p>{years && years > 0 ? `${years} ${years === 1 ? "year" : "years"} in audio · Self-reported experience. ` : ""}A closer listen to {name ? `${name}’s` : "your"} work and the craft behind it.</p></div><Headphones size={25}/></header>
    {roles.length > 1 ? <div className={styles.filters} aria-label="Filter work by role">{["All", ...roles].map(role => <button type="button" key={role} aria-pressed={filter === role} onClick={() => { setFilter(role); setLoaded(false); }}>{role}</button>)}</div> : null}
    <div className={styles.room}><div className={styles.spotlight}>
      <div className={styles.record} aria-hidden="true"><Disc3/><span>{String(active.index + 1).padStart(2, "0")}</span></div>
      <div className={styles.credit}><p className={styles.kicker}>{work.role || "Work sample"}{work.year ? ` / ${work.year}` : ""}</p><h3>{work.title}</h3>{work.artist ? <p className={styles.artist}>{work.artist}</p> : null}{work.note ? <p className={styles.note}>{work.note}</p> : <p className={styles.note}>A work sample shared by the engineer.</p>}</div>
      <div className={styles.player} key={work.url}>
        {player.audio ? <audio controls preload="none" src={player.audio} aria-label={`Listen to ${work.title}`}/> : player.embed ? loaded ? <iframe title={`${player.platform}: ${work.title}`} src={player.embed} width="100%" height={player.platform === "Spotify" ? 152 : 230} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin"/> : <button type="button" className={styles.load} onClick={() => setLoaded(true)}><Play size={17}/> Load {player.platform} player <span>No autoplay</span></button> : null}
        <a href={work.url} target="_blank" rel="noreferrer" className={styles.external}>Open on {player.platform}<ArrowUpRight size={15}/></a>
      </div>
    </div><div className={styles.queue} aria-label="Select a work sample"><p className={styles.queueLabel}>{visible.length} {visible.length === 1 ? "SELECTED CREDIT" : "SELECTED CREDITS"}</p>{visible.map(({ work: item, index }) => <button type="button" key={`${index}-${item.url}`} aria-pressed={active.index === index} onClick={() => select(index)}><span className={styles.number}>{String(index + 1).padStart(2, "0")}</span><span className={styles.queueText}><strong>{item.title}</strong><small>{[item.artist, item.role, item.year].filter(Boolean).join(" · ")}</small></span>{active.index === index ? <span className={styles.equalizer} aria-label="Selected"><i/><i/><i/></span> : <ArrowUpRight size={15}/>}</button>)}</div></div>
  </section>;
}

export function EngineerWorkEditor({ works, onChange }: { works: EngineerWork[]; onChange: (works: EngineerWork[]) => void }) {
  const [selected, setSelected] = useState(0);
  const active = Math.min(selected, Math.max(0, works.length - 1));
  const work = works[active];
  function patch(value: Partial<EngineerWork>) { onChange(works.map((item, index) => index === active ? { ...item, ...value } : item)); }
  function move(direction: number) { const next = active + direction; if (next < 0 || next >= works.length) return; const updated = [...works]; [updated[active], updated[next]] = [updated[next], updated[active]]; onChange(updated); setSelected(next); }
  return <div className={styles.workEditor}>
    <div className={styles.editorList}>{works.map((item, index) => <button type="button" key={index} aria-pressed={index === active} onClick={() => setSelected(index)}><Music2 size={17}/><span><strong>{item.title || `Untitled work ${index + 1}`}</strong><small>{item.role || "Choose your role"}{index === 0 ? " · Featured first" : ""}</small></span>{index === active ? <Check size={15}/> : null}</button>)}<button type="button" className={styles.add} disabled={works.length >= 8} onClick={() => { onChange([...works, { title: "", url: "", role: "Mixing", artist: "", year: "", note: "" }]); setSelected(works.length); }}><Plus size={17}/> Add a credit <small>{works.length}/8</small></button></div>
    {work ? <div className={styles.workFields}>
      <div className={styles.editTools}><span>Credit {active + 1}</span><button type="button" aria-label="Move work earlier" disabled={active === 0} onClick={() => move(-1)}><ArrowUp size={15}/></button><button type="button" aria-label="Move work later" disabled={active === works.length - 1} onClick={() => move(1)}><ArrowDown size={15}/></button><button type="button" aria-label={`Remove work ${active + 1}`} onClick={() => onChange(works.filter((_, index) => index !== active))}><Trash2 size={15}/></button></div>
      <label>Song or project title<input className="field" aria-label={`Work ${active + 1} title`} value={work.title} required minLength={2} maxLength={120} placeholder="Give this record a name" onChange={event => patch({ title: event.target.value })}/></label>
      <label>Listening link<input className="field" aria-label={`Work ${active + 1} link`} type="url" value={work.url} required maxLength={1000} placeholder="Spotify, YouTube, or a direct audio link" onChange={event => patch({ url: event.target.value })}/><small>Spotify and YouTube players can be opened directly on your profile.</small></label>
      <div className={styles.fieldPair}><label>Artist <span>optional</span><input className="field" value={work.artist ?? ""} maxLength={120} onChange={event => patch({ artist: event.target.value })}/></label><label>Release year <span>optional</span><input className="field" inputMode="numeric" pattern="19[0-9]{2}|20[0-9]{2}" value={work.year ?? ""} maxLength={4} placeholder="2026" onChange={event => patch({ year: event.target.value })}/></label></div>
      <label>Your role<select className="field" aria-label={`Your role in work ${active + 1}`} value={work.role} onChange={event => patch({ role: event.target.value as EngineerWork["role"] })}><option value="">Choose your role</option>{ENGINEER_SPECIALTIES.map(role => <option key={role}>{role}</option>)}</select></label>
      <label>Behind this record <span>optional</span><textarea className="field" value={work.note ?? ""} maxLength={400} rows={3} placeholder="What did you bring to this track? Give listeners something to listen for." onChange={event => patch({ note: event.target.value })}/><small>{work.note?.length ?? 0}/400 · Only claim work you contributed to.</small></label>
    </div> : <p className={styles.empty}>Start with one record you’re proud of. Add a credit to build your listening room.</p>}
  </div>;
}
