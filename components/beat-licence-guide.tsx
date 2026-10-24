"use client";

import { useState, type CSSProperties } from "react";
import { ArrowDownToLine, ArrowRight, Check, Headphones, Layers3, ShieldCheck, SlidersHorizontal } from "lucide-react";
import type { BeatStoreLicenseType, StorefrontBeat } from "@/lib/beat-store";
import styles from "./beat-licence-guide.module.css";

const formats = [
  { id: "mp3", label: "MP3", caption: "Catch the idea", detail: "One compressed audio file. A lightweight starting point for writing and working with the beat.", tags: ["Full beat", "Compressed audio"], color: "#a5caff" },
  { id: "wav", label: "WAV", caption: "Build your session", detail: "Uncompressed audio for your recording and mixing session. Keep the full beat in one file.", tags: ["Full beat", "Uncompressed audio"], color: "#c5b4ff" },
  { id: "stems", label: "Stems", caption: "Shape every layer", detail: "Separate audio parts let you adjust the balance and make room for your voice in the mix.", tags: ["Separate parts", "Mix control"], color: "#9fe3ca" },
  { id: "exclusive", label: "Exclusive", caption: "Make a bigger move", detail: "Explore the exclusive agreement, including any earlier licences. The contract defines the rights you receive.", tags: ["Exclusive agreement", "Review prior licences"], color: "#f4bdab" }
] as const;

function FormatArt({ kind }: { kind: BeatStoreLicenseType }) {
  return <svg viewBox="0 0 240 140" fill="none" aria-hidden="true" className={styles.art}>
    {kind === "exclusive" ? <>
      <rect x="66" y="18" width="106" height="110" rx="10" fill="currentColor" opacity=".08" transform="rotate(-8 119 73)" />
      <rect x="72" y="12" width="96" height="112" rx="8" fill="#171d28" stroke="currentColor" strokeOpacity=".6" />
      <path d="M90 34h37M90 46h60M90 58h47M90 70h32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".45" />
      <circle cx="153" cy="99" r="23" fill="#171d28" stroke="currentColor" strokeWidth="2" />
      <path d="m143 99 7 7 13-15" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </> : kind === "stems" ? <>
      {[0, 1, 2, 3].map(row => <g key={row} transform={`translate(28 ${20 + row * 28})`} opacity={1 - row * .14}>
        <rect width="184" height="21" rx="4" fill="currentColor" opacity=".07" />
        {Array.from({ length: 33 }, (_, i) => { const height = 3 + ((i * 7 + row * 11) % 16); return <rect key={i} x={8 + i * 5} y={(21 - height) / 2} width="2" height={height} rx="1" fill="currentColor" />; })}
      </g>)}
    </> : <>
      <rect x="26" y="18" width="188" height="104" rx="12" stroke="currentColor" strokeOpacity=".24" fill="currentColor" fillOpacity=".04" />
      <path d="M40 92h160" stroke="currentColor" opacity=".15" />
      {Array.from({ length: kind === "mp3" ? 29 : 53 }, (_, i) => { const height = 8 + Math.abs(Math.sin(i * 1.73)) * (18 + 30 * Math.sin(i * .19) ** 2); return <rect key={i} x={40 + i * (kind === "mp3" ? 5.5 : 3)} y={68 - height / 2} width={kind === "mp3" ? 3 : 1.5} height={height} rx="1" fill="currentColor" opacity={.4 + (i % 4) * .18} />; })}
      <circle cx="193" cy="31" r="3" fill="currentColor" />
    </>}
  </svg>;
}

export function BeatLicenceGuide({ beat, onChoose, onBrowse }: { beat: StorefrontBeat | null; onChoose: (beat: StorefrontBeat, licence: BeatStoreLicenseType) => void; onBrowse: () => void }) {
  const [selected, setSelected] = useState<BeatStoreLicenseType>("wav");
  const format = formats.find(item => item.id === selected)!;
  return <section className={styles.guide} aria-labelledby="beat-licence-guide">
    <header className={styles.heading}><div><span className={styles.eyebrow}>YOUR NEXT TRACK STARTS HERE</span><h2 id="beat-licence-guide">One beat. <span>Your way.</span></h2></div><p>Pick your format. Find your flow.</p></header>
    <div className={styles.formats} role="group" aria-label="Explore beat formats">
      {formats.map((item, i) => <button key={item.id} type="button" className={styles.format} style={{ "--format-color": item.color } as CSSProperties} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>
        <div className={styles.cardTop}><span>0{i + 1}</span><span className={styles.selection}>{selected === item.id ? <Check size={13} /> : <ArrowRight size={13} />}</span></div>
        <FormatArt kind={item.id} />
        <strong>{item.label}</strong><span className={styles.caption}>{item.caption}</span>
      </button>)}
    </div>
    <div className={styles.selectionPanel} style={{ "--format-color": format.color } as CSSProperties}>
      <div className={styles.selectionCopy} aria-live="polite" aria-atomic="true"><span className={styles.panelIcon}>{selected === "stems" ? <Layers3 size={23} /> : selected === "exclusive" ? <ShieldCheck size={23} /> : <Headphones size={23} />}</span><div><h3>{format.label} <span>/ {format.caption}</span></h3><p>{format.detail}</p><div className={styles.tags}>{format.tags.map(tag => <span key={tag}>{tag}</span>)}</div></div></div>
      <button type="button" className={styles.action} onClick={() => beat ? onChoose(beat, selected) : onBrowse()}>{beat ? `View ${format.label} licence` : "Explore beats"}<ArrowRight size={17} /></button>
      {beat ? <span className={styles.currentBeat}>For: {beat.title}</span> : null}
    </div>
    <ol className={styles.journey} aria-label="How buying a beat works">
      <li><span className={styles.journeyIcon}><Headphones size={19} /></span><div><small>01 / DISCOVER</small><strong>Find your sound</strong></div><ArrowRight className={styles.connector} size={18} /></li>
      <li><span className={styles.journeyIcon}><SlidersHorizontal size={19} /></span><div><small>02 / CHOOSE</small><strong>Review your licence</strong></div><ArrowRight className={styles.connector} size={18} /></li>
      <li><span className={styles.journeyIcon}><ArrowDownToLine size={19} /></span><div><small>03 / CREATE</small><strong>Get files in My purchases</strong></div></li>
    </ol>
    <details className={styles.terms}><summary><ShieldCheck size={15} />Before you release <span>+</span></summary><p>File format does not determine usage rights. Check the selected beat’s agreement for stream limits, credits, monetisation and Content ID permissions. Exclusive rights and earlier licences follow the contract.</p></details>
  </section>;
}
