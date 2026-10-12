"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Disc3, Headphones, LogIn, Store, Upload } from "lucide-react";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { ProducerStorefrontEditor } from "@/components/producer-storefront-editor";
import { ProducerBeatUploader } from "@/components/producer-beat-uploader";
import { producerSetup, type ProducerSetupProfile } from "@/lib/producer-setup";
import type { UserRole } from "@/lib/types";
import "@/app/styles/producer-onboarding.css";

type Profile = ProducerSetupProfile & { slug?: string; bio?: string | null; location?: string | null; specialty?: string | null; tags?: string[]; instagramUrl?: string | null; youtubeUrl?: string | null; spotifyUrl?: string | null; websiteUrl?: string | null };
type Props = { user: { name: string; role: UserRole; status?: string } | null; initialProfile: Profile | null; uploaded: boolean };

async function responseBody(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Couldn't save your progress. Please try again.");
  if (!body) throw new Error("Couldn't confirm your progress. Please try again.");
  return body;
}

export function ProducerOnboarding({ user, initialProfile, uploaded }: Props) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [submitted, setSubmitted] = useState(uploaded);
  const [editingStore, setEditingStore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setup = producerSetup(profile, []);
  const blocked = Boolean(user?.status && user.status !== "active") || setup.restricted;
  const finished = setup.storefrontReady && submitted;
  const step = !user ? 0 : !setup.storefrontReady || editingStore ? 1 : 2;

  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(null);
    try {
      await responseBody(await fetch("/api/producer/enroll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ producerName: form.get("producerName"), genre: form.get("genre"), rightsConfirmed: form.has("rights"), ageConfirmed: form.has("age"), termsAccepted: form.has("terms") }) }));
      router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Please try again."); setBusy(false); }
  }

  async function saveStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(null);
    try {
      const data = await responseBody(await fetch("/api/producer/profile", { method: "PATCH", body: form }));
      if (!data.profile || !producerSetup(data.profile, []).storefrontReady) throw new Error("Add your producer name, profile photo and cover to continue.");
      setProfile(data.profile); setEditingStore(false);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Please try again."); }
    finally { setBusy(false); }
  }

  async function uploadBeat(form: FormData) {
    const data = await responseBody(await fetch("/api/producer/beats", { method: "POST", body: form }));
    if (!data.beat?.id) throw new Error("Submission wasn't confirmed. Check your catalogue before trying again.");
    setSubmitted(true);
  }

  return <main className="producer-entry" data-theme="dark">
    <header className="producer-entry-header"><Link href="/" aria-label="HYMN home"><Image src="/assets/hymnlogowhite.png" alt="HYMN Music" width={120} height={40} priority /></Link><span>PRODUCER START</span>{user && <span className="producer-entry-name">{user.name}</span>}</header>
    <nav className="producer-entry-progress" aria-label="Producer onboarding progress">{[[LogIn, "Sign in"], [Store, "Your store"], [Upload, "First beat"]].map(([Icon, label], index) => {
      const done = index === 0 ? Boolean(user) : index === 1 ? setup.storefrontReady : finished;
      return <div key={String(label)} aria-current={!finished && index === step ? "step" : undefined} data-done={done}><span>{done ? <Check size={16} /> : <Icon size={16} />}</span><strong>{String(label)}</strong>{index < 2 && <i aria-hidden="true" />}</div>;
    })}</nav>

    {blocked ? <section className="producer-entry-message"><Headphones size={36} /><h1>Your account needs a hand.</h1><Link href="/contact" className="btn-primary">Contact HYMN</Link></section>
      : user?.role === "admin" ? <section className="producer-entry-message"><Store size={36}/><h1>This link is ready for producers.</h1><p>Share /producer-onboarding with your next producer.</p><Link className="btn-outline" href="/admin">Back to admin</Link></section>
      : !user ? <section className="producer-entry-intro"><div><span className="producer-entry-eyebrow">YOUR BEATS. YOUR STORE.</span><h1>Turn your sound<br />into your next move.</h1><p>Build your storefront. Upload your first beat.</p><GoogleAuthButton label="Start with Google" expectedRole="producer" appearance="quiet" onAuthenticated={() => router.refresh()} /><small>New here? Your account is created when you sign in.</small><Link href="/policies/producer-terms">Producer terms</Link></div><aside aria-label="Your producer journey"><div className="producer-entry-record"><Disc3 strokeWidth={.7} /></div><div className="producer-entry-visual-path"><span><Store/>Your store</span><ArrowRight/><span><Headphones/>Your beats</span><ArrowRight/><span><Upload/>Ready to sell</span></div></aside></section>
      : user.role !== "producer" ? <section className="producer-entry-activate"><header><Store size={30}/><h1>Make it official.</h1><p>Two details, then your storefront.</p></header><form onSubmit={enroll}><div className="producer-entry-fields"><label>Producer name<input name="producerName" className="field" defaultValue={user.name} minLength={2} maxLength={100} required /></label><label>Your sound<input name="genre" className="field" placeholder="Trap, R&B, Drill" minLength={2} maxLength={100} required /></label></div><div className="producer-entry-consent"><label><input name="rights" type="checkbox" required/><span>I own or control the rights to the beats and assets I upload.</span></label><label><input name="age" type="checkbox" required/><span>I am 18 or older.</span></label><label><input name="terms" type="checkbox" required/><span>I accept the <Link href="/policies/producer-terms" target="_blank">Producer Terms</Link> and <Link href="/policies/beat-store-terms" target="_blank">Beat Store Terms</Link>.</span></label></div><p className="producer-entry-share">You earn 70% of eligible sales. HYMN's share is 30%. Listings are reviewed before going live.</p>{error && <p className="producer-entry-error" role="alert">{error}</p>}<button className="btn-primary" disabled={busy}>{busy ? "Opening your store..." : "Set up my store"}<ArrowRight size={16}/></button></form></section>
      : finished && !editingStore ? <section className="producer-entry-message"><span className="producer-entry-success"><Check size={30}/></span><h1>You're on your way.</h1><p>Your storefront is set up and your first beat is submitted. Manage your beats and follow their review status in your workspace.</p><Link className="btn-primary" href="/producer/dashboard?tab=catalog">Open my workspace<ArrowRight size={16}/></Link><button type="button" onClick={() => setEditingStore(true)}>Edit storefront</button></section>
      : !setup.storefrontReady || editingStore ? <ProducerStorefrontEditor name={user.name} profile={profile} onSubmit={saveStore} pending={busy} feedback={error} />
      : <><div className="producer-entry-upload-heading"><button type="button" onClick={() => setEditingStore(true)}>Edit storefront</button><span>Your store is saved. Add your first beat.</span></div><ProducerBeatUploader producerName={profile?.displayName || user.name} onUpload={uploadBeat}/></>}
    <footer className="producer-entry-footer"><Link href="/">HYMN Music</Link><span>Independent sound. A place to grow.</span></footer>
  </main>;
}
