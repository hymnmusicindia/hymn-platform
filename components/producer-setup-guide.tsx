"use client";
import { ArrowRight, Check, ImagePlus, Music2, Store, Upload } from "lucide-react";
import type { producerSetup, ProducerSetupProfile } from "@/lib/producer-setup";
import s from "./producer-setup-guide.module.css";

export function ProducerSetupGuide({ setup, profile, name, onTab }: { setup: ReturnType<typeof producerSetup>; profile: ProducerSetupProfile | null; name: string; onTab: (tab: "profile" | "upload" | "catalog") => void }) {
  const next = setup.storefrontReady ? "upload" : "profile";
  return <section className={s.root} aria-labelledby="producer-setup-title">
    <header className={s.header}><div><p className={s.eyebrow}>YOUR PRODUCER LAUNCHPAD</p><h1 id="producer-setup-title">Your sound deserves a storefront.</h1><p>Make it yours. Add your first beat. Start your next chapter.</p></div><span className={s.counter}>{setup.completedSteps}/2 complete</span></header>
    <div className={s.progress} role="progressbar" aria-label="Producer setup progress" aria-valuemin={0} aria-valuemax={2} aria-valuenow={setup.completedSteps}><span style={{ width: `${setup.completedSteps * 50}%` }} /></div>
    {setup.restricted && <p role="alert" className={s.notice}>Your producer account needs attention. Contact support before publishing or uploading.</p>}
    <div className={s.layout}><div className={s.steps}>
      <article className={s.step} data-current={!setup.storefrontReady}><span className={s.stepIcon}>{setup.storefrontReady ? <Check/> : <Store/>}</span><div><small>STEP 01 · YOUR IDENTITY</small><h2>Build your storefront</h2><p>Your producer name, profile image and cover make your store recognisable.</p><div className={s.requirements}>{["Producer name", "Profile image", "Cover image"].map(label => <span key={label} data-done={!setup.missing.includes(label)}>{!setup.missing.includes(label) && <Check size={12}/>} {label}</span>)}</div><button className="btn-outline" onClick={() => onTab("profile")}>{setup.storefrontReady ? "Edit storefront" : "Set up storefront"}<ArrowRight size={15}/></button></div></article>
      <article className={s.step} data-current={setup.storefrontReady && !setup.uploaded}><span className={s.stepIcon}>{setup.uploaded ? <Check/> : <Upload/>}</span><div><small>STEP 02 · YOUR FIRST LISTING</small><h2>Upload your first beat</h2><p>Our guided upload covers audio, beat details, artwork and licence prices.</p><button className={setup.storefrontReady ? "btn-primary" : "btn-outline"} disabled={!setup.storefrontReady} onClick={() => onTab("upload")}>{setup.uploaded ? "Add another beat" : "Upload first beat"}<ArrowRight size={15}/></button>{!setup.storefrontReady && <small className={s.hint}>Complete your storefront to continue.</small>}</div></article>
      <p className={s.note}>Once both steps are complete, your sales, earnings and performance workspace opens automatically. HYMN review is a separate step before a beat goes public.</p>
      {setup.uploaded && <button className="btn-outline" onClick={() => onTab("catalog")}>View uploaded beats</button>}
    </div><aside className={s.preview}><div className={s.cover}>{profile?.coverPhotoUrl ? <img src={profile.coverPhotoUrl} alt="Your storefront cover"/> : <ImagePlus/>}<span>STOREFRONT PREVIEW</span></div><div className={s.previewBody}><div className={s.avatar}>{profile?.avatarUrl ? <img src={profile.avatarUrl} alt="Your producer profile"/> : <Music2/>}</div><h2>{profile?.displayName || name}</h2><p>Your beats. Your identity.</p><div className={s.beatPlaceholder}><Music2/><span>Your first beat goes here</span></div><button className="btn-primary" disabled={setup.restricted} onClick={() => onTab(next)}>{next === "profile" ? "Make it yours" : "Add your first beat"}<ArrowRight size={15}/></button></div></aside></div>
  </section>;
}
