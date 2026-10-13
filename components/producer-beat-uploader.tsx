"use client";
import { artworkPreviewUrl } from "@/lib/artwork-preview";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, ChevronRight, Disc3, FileAudio, ImagePlus, Music2, Play, Upload } from "lucide-react";
import s from "./producer-beat-uploader.module.css";

const stages = ["Files", "Details", "Pricing", "Review"];
function useLocalUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { if (!file) { setUrl(null); return; } const next = URL.createObjectURL(file); setUrl(next); return () => URL.revokeObjectURL(next); }, [file]);
  return url;
}
export function ProducerBeatUploader({ producerName, onUpload }: { producerName: string; onUpload: (data: FormData) => Promise<void> }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [master, setMaster] = useState<File | null>(null), [preview, setPreview] = useState<File | null>(null), [artwork, setArtwork] = useState<File | null>(null);
  const [title, setTitle] = useState(""), [bpm, setBpm] = useState(""), [key, setKey] = useState(""), [genre, setGenre] = useState(""), [mood, setMood] = useState("");
  const [wav, setWav] = useState(""), [stems, setStems] = useState(""), [exclusive, setExclusive] = useState("");
  const [samples, setSamples] = useState("");
  const artworkUrl = useLocalUrl(artwork), previewUrl = useLocalUrl(preview), masterUrl = useLocalUrl(master);
  const format = master?.name.toLowerCase().endsWith(".wav") ? "WAV" : master?.name.toLowerCase().endsWith(".mp3") ? "MP3" : "";
  function validate(index: number) {
    if (index === 0 && (!master || !format)) { setError("Choose a WAV or MP3 master."); return false; }
    if (index === 0 && preview && !preview.name.toLowerCase().endsWith(".mp3")) { setError("Choose an MP3 for the public preview."); return false; }
    const fields = formRef.current?.querySelector<HTMLFieldSetElement>(`fieldset[data-step="${index}"]`);
    const invalid = fields && Array.from(fields.elements).find((field): field is HTMLInputElement => "checkValidity" in field && !(field as HTMLInputElement).checkValidity());
    if (invalid) { setError(invalid.validationMessage); invalid.reportValidity(); return false; }
    if (index === 2 && Number(exclusive) <= Math.max(Number(wav), Number(stems))) { setError("Exclusive price must be higher than WAV and stems."); return false; }
    return true;
  }
  function next() { setError(""); if (validate(step)) setStep(value => Math.min(3, value + 1)); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || step !== 3) return;
    setError("");
    for (let index = 0; index < 4; index++) { if (index !== step) { const fields = formRef.current?.querySelector<HTMLFieldSetElement>(`fieldset[data-step="${index}"]`); if (fields?.querySelector(":invalid")) { setStep(index); setError("Check the highlighted fields."); return; } } }
    if (!validate(3)) return;
    setBusy(true);
    try { await onUpload(new FormData(event.currentTarget)); } catch (failure) { setError(failure instanceof Error ? failure.message : "Upload failed. Your files are still selected; retry."); } finally { setBusy(false); }
  }
  function fileTile(name: string, label: string, file: File | null, accept: string, icon: React.ReactNode, onChange: (file: File | null) => void, optional = false) {
    return <label className={s.fileTile} data-selected={Boolean(file)}>{file ? <Check/> : icon}<strong>{label}</strong><span>{file ? file.name : optional ? "Optional" : "WAV / MP3"}</span>{file && <small>{(file.size / 1048576).toFixed(1)} MB · Change file</small>}<input aria-label={label} name={name} type="file" accept={accept} required={!optional} disabled={busy} onChange={event => onChange(event.target.files?.[0] ?? null)}/></label>;
  }
  return <section className={s.root} aria-label="Beat upload workspace"><header className={s.header}><h2>Upload beat</h2><nav aria-label="Beat upload steps">{stages.map((label,index) => <button key={label} type="button" disabled={index > step || busy} aria-current={step === index ? "step" : undefined} onClick={() => { setError(""); setStep(index); }}><span>{index < step ? <Check size={12}/> : index + 1}</span>{label}</button>)}</nav></header>
    <div className={s.layout}><form ref={formRef} noValidate onSubmit={submit} onChange={()=>{if(error)setError("");}} className={s.form} aria-busy={busy}>
      <input name="audioFormat" type="hidden" value={format}/><input name="price" type="hidden" value="120"/>
      <fieldset data-step="0" hidden={step !== 0}><legend>Your beat files</legend><div className={s.files}>{fileTile("file","Master audio",master,".mp3,.wav,audio/mpeg,audio/wav",<FileAudio/>,setMaster)}{fileTile("preview","Public preview",preview,".mp3,audio/mpeg",<Play/>,setPreview,true)}{fileTile("artwork","Artwork",artwork,"image/jpeg,image/png,image/webp",<ImagePlus/>,setArtwork,true)}</div><p className={s.hint}><Play size={13}/> Preview plays first. Without one, your master plays in the store.</p></fieldset>
      <fieldset data-step="1" hidden={step !== 1}><legend>Beat details</legend><div className={s.fields}><label className={s.wide}>Title<input className="field" name="title" required value={title} onChange={event=>setTitle(event.target.value)} placeholder="Name your beat"/></label><label>BPM<input className="field" name="bpm" type="number" required min="40" max="300" value={bpm} onChange={event=>setBpm(event.target.value)} placeholder="140"/></label><label>Key<input className="field" name="keySignature" required value={key} onChange={event=>setKey(event.target.value)} placeholder="F# minor"/></label><label>Genre<input className="field" name="genre" required value={genre} onChange={event=>setGenre(event.target.value)} list="beat-genres" placeholder="Trap"/><datalist id="beat-genres">{["Hip-Hop","Trap","Drill","R&B","Pop","Afrobeats"].map(value=><option key={value} value={value}/>)}</datalist></label><label>Mood<input className="field" name="mood" required value={mood} onChange={event=>setMood(event.target.value)} list="beat-moods" placeholder="Dark"/><datalist id="beat-moods">{["Dark","Energetic","Chill","Sad","Aggressive","Uplifting"].map(value=><option key={value} value={value}/>)}</datalist></label></div><details className={s.optional}><summary>Tags & description <span>(optional)</span></summary><div className={s.fields}><label>Tags<input name="tags" className="field" placeholder="Melodic, guitar"/></label><label>Subgenre<input name="subgenre" className="field"/></label><label className={s.wide}>Description<textarea name="description" className="field" rows={2}/></label></div></details></fieldset>
      <fieldset data-step="2" hidden={step !== 2}><legend>Set your prices</legend><div className={s.priceGrid}><div className={s.priceCard}><Music2/><strong>MP3</strong><b>₹120</b><small>Fixed · No Content ID</small></div>{[["generalPrice","WAV",wav,setWav],["stemPrice","Stems",stems,setStems],["exclusivePrice","Exclusive",exclusive,setExclusive]].map(([name,label,value,setValue])=><label className={s.priceCard} key={name as string}><Disc3/><strong>{label as string}</strong><span>₹<input aria-label={`${label} price`} name={name as string} type="number" min={name === "exclusivePrice" ? "2" : "1"} step="1" required value={value as string} onChange={event=>(setValue as (value:string)=>void)(event.target.value)}/></span><small>{name === "exclusivePrice" ? "WAV + Content ID" : "No Content ID"}</small></label>)}</div><button type="button" className={s.suggest} onClick={()=>{setWav("500");setStems("999");setExclusive("5000");}}>Use suggested prices</button><details className={s.optional}><summary>Licence details</summary><p>MP3 is fixed at ₹120. WAV and stems are general licences without Content ID. Stems Exclusive includes WAV and Content ID. Exclusive must cost more than WAV and stems.</p></details></fieldset>
      <fieldset data-step="3" hidden={step !== 3}><legend>Ready for review</legend><div className={s.reviewRows}>{[["Files",`${master?.name || "Missing master"} · ${preview ? "Preview added" : "Master used for playback"}`,0],["Beat",`${title} · ${bpm} BPM · ${key}`,1],["Prices",`MP3 ₹120 · WAV ₹${wav} · Stems ₹${stems} · Exclusive ₹${exclusive}`,2]].map(([label,value,index])=><div key={label}><span><small>{label}</small><strong>{value}</strong></span><button type="button" onClick={()=>setStep(Number(index))}>Edit</button></div>)}</div><label className={s.sampleLabel}>Samples you don’t own or control?<select name="sampleDeclaration" className="field" required value={samples} onChange={event=>setSamples(event.target.value)}><option value="">Choose an answer</option><option value="NO_UNCONTROLLED_SAMPLES">No</option><option value="CONTAINS_UNCONTROLLED_SAMPLES">Yes — disclose below</option></select></label><label hidden={samples !== "CONTAINS_UNCONTROLLED_SAMPLES"} className={s.sampleLabel}>Samples & clearance<textarea name="sampleDisclosure" className="field" rows={2} required={samples === "CONTAINS_UNCONTROLLED_SAMPLES"}/></label><p className={s.hint}><Check size={13}/> Your beat goes live after HYMN approval.</p></fieldset>
      {error && <p role="alert" className={s.error}>{error}</p>}
      <footer className={s.actions}><button className="btn-outline" type="button" disabled={step === 0 || busy} onClick={()=>{setError("");setStep(value=>Math.max(0,value-1));}}>Back</button>{step < 3 ? <button className="btn-primary" type="button" onClick={event=>{event.preventDefault();next();}}>Continue<ChevronRight size={15}/></button> : <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Uploading..." : "Submit for review"}<Upload size={15}/></button>}</footer>
    </form><aside className={s.preview} aria-label="Live beat preview"><div className={s.artwork}>{artworkUrl ? <img src={artworkPreviewUrl(artworkUrl, 320)} alt="Beat artwork preview"/> : <Disc3/>}<span>BEAT PREVIEW</span></div><div className={s.previewBody}><h3>{title.trim() || "Your beat title"}</h3><p>{producerName}</p><div className={s.tags}>{[bpm && `${bpm} BPM`,key,genre,mood].filter(Boolean).map(value=><span key={value}>{value}</span>)}</div>{(previewUrl || masterUrl) ? <audio controls src={previewUrl || masterUrl || undefined} aria-label={previewUrl ? "Selected public preview" : "Selected master audio"}/> : <div className={s.audioPlaceholder}><Play size={15}/> {master ? "Master added · private" : "Add your beat files"}</div>}<div className={s.previewPrice}><span>MP3 licence</span><strong>₹120</strong></div><small>Preview only · not published</small></div></aside></div>
  </section>;
}
