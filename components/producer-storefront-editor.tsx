"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ImagePlus, Music2 } from "lucide-react";
import { customerMessage } from "@/lib/customer-message";
import s from "./producer-storefront-editor.module.css";

function useImagePreview(file: File | null, saved?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setUrl(null); return; }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url || saved || null;
}

export function ProducerStorefrontEditor({ name, profile, liveBeatCount = 0, onSubmit, pending, feedback }: { name: string; profile: any; liveBeatCount?: number; onSubmit: (event: FormEvent<HTMLFormElement>) => void; pending: boolean; feedback: string | null }) {
  const [displayName, setDisplayName] = useState(profile?.displayName || name);
  const [bio, setBio] = useState(profile?.bio || "");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const avatarUrl = useImagePreview(avatar, profile?.avatarUrl);
  const coverUrl = useImagePreview(cover, profile?.coverPhotoUrl);
  return <section className={s.editor} aria-label="Storefront editor">
    <div className={s.formPane}><header><h2>{liveBeatCount ? "Your storefront" : "Set up your storefront"}</h2><p>{liveBeatCount ? "Keep your producer identity up to date." : "Three essentials. See your changes as you go."}</p>{liveBeatCount > 0 && profile?.slug && <Link className={s.storefrontLink} href={`/beat-store/producers/${encodeURIComponent(profile.slug)}`}>@{profile.slug} <span>Open storefront &rarr;</span></Link>}</header>
      <form onSubmit={onSubmit}>
        <label>Producer name<input name="displayName" required minLength={2} value={displayName} onChange={event => setDisplayName(event.target.value)} className="field"/></label>
        <div className={s.images}><label>Profile image<input name="avatar" required={!profile?.avatarUrl} type="file" accept="image/jpeg,image/png,image/webp" className="field" onChange={event => setAvatar(event.target.files?.[0] ?? null)}/><small>Portrait or producer logo</small></label><label>Cover image<input name="coverPhoto" required={!profile?.coverPhotoUrl} type="file" accept="image/jpeg,image/png,image/webp" className="field" onChange={event => setCover(event.target.files?.[0] ?? null)}/><small>A wide image for your store</small></label></div>
        <details className={s.optional}><summary>More details <span>(optional)</span></summary><div className={s.optionalFields}>
          <label className={s.wide}>Bio<textarea name="bio" value={bio} onChange={event => setBio(event.target.value)} className="field" rows={2}/></label>
          <label>Location<input name="location" defaultValue={profile?.location || ""} className="field"/></label><label>Your sound<input name="producerTags" defaultValue={Array.isArray(profile?.tags) ? profile.tags.join(", ") : profile?.specialty || ""} className="field" placeholder="Trap, R&B"/></label>
          {[["instagramUrl","Instagram"],["youtubeUrl","YouTube"],["spotifyUrl","Spotify"],["websiteUrl","Website"]].map(([key,label]) => <label key={key}>{label}<input name={key} type="url" defaultValue={profile?.[key] || ""} className="field"/></label>)}
        </div></details>
        {feedback && <p role="status">{customerMessage(feedback)}</p>}
        <button type="submit" disabled={pending} className="btn-primary">{pending ? "Saving storefront..." : (liveBeatCount ? "Save changes" : "Save storefront & continue")}</button>
      </form>
    </div>
    <aside className={s.preview} aria-label="Live storefront preview"><div className={s.cover}>{coverUrl ? <img src={coverUrl} alt="Storefront cover preview"/> : <ImagePlus/>}<span>STOREFRONT PREVIEW</span></div><div className={s.previewBody}><div className={s.avatar}>{avatarUrl ? <img src={avatarUrl} alt="Producer image preview"/> : <Music2/>}</div><h3>{displayName.trim() || "Your producer name"}</h3><p>{bio.trim() || "Your beats. Your identity."}</p><div className={s.placeholder}><Music2/><span>{liveBeatCount ? `${liveBeatCount} beats live` : "Your first beat goes here"}</span></div><small className={s.next}>{liveBeatCount && profile?.slug ? `@${profile.slug}` : "Next: add your first beat"}</small></div></aside>
  </section>;
}
