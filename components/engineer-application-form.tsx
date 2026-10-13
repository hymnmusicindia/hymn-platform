"use client";

import { EngineerProfileBuilder, type ProfileExtras } from "@/components/engineer-profile-builder";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BadgeCheck, Clock3 } from "lucide-react";

type Application = { profileExtras?: unknown; id: number; professionalName: string; bio: string; specialties: string[]; genres: string[]; portfolioUrl: string; instagramUrl: string | null; experienceLevel: string; startingPrice: number; turnaroundDays: number; status: string; reviewNote: string | null; createdAt: string; updatedAt: string };
type FormState = { professionalName: string; bio: string; specialties: string[]; genres: string[]; portfolioUrl: string; instagramUrl: string; experienceLevel: "STARTING" | "WORKING" | "ESTABLISHED"; startingPrice: number; turnaroundDays: number };


export function EngineerApplicationForm({ user, application, activeProfile }: { user: { name: string; avatar: string | null }; application: Application | null; activeProfile: { id: number; professionalName: string } | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editingExisting, setEditingExisting] = useState(false);
  const [error, setError] = useState("");
  const [form] = useState<FormState>({ professionalName: application?.professionalName || user.name, bio: application?.bio || "", specialties: application?.specialties || ["Mixing", "Mastering"], genres: application?.genres || [], portfolioUrl: application?.portfolioUrl || "", instagramUrl: application?.instagramUrl || "", experienceLevel: (application?.experienceLevel as FormState["experienceLevel"]) || "WORKING", startingPrice: application?.startingPrice || 1999, turnaroundDays: application?.turnaroundDays || 5 });

  if (activeProfile) return <section className="engineer-apply-result"><span className="engineer-result-icon"><BadgeCheck /></span><p className="hymn-kicker">Studio engineer</p><h1>You’re ready for projects.</h1><p>{activeProfile.professionalName} is active in HYMN Studio.</p><div><Link href="/studio/engineer" className="btn-primary">Open engineer workspace <ArrowRight size={16}/></Link><Link href="/studio" className="btn-outline">View public Studio</Link></div></section>;
  if (application?.status === "PENDING" && !editingExisting) return <section className="engineer-apply-result"><span className="engineer-result-icon is-pending"><Clock3 /></span><p className="hymn-kicker">Application in review</p><h1>Your sound is with us.</h1><p>HYMN is reviewing your work sample and profile. You’ll get an email and notification after the decision.</p><div className="engineer-result-meta"><span>Submitted</span><strong>{new Date(application.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</strong></div><button type="button" className="btn-outline" onClick={() => { setEditingExisting(true); }}>Update application</button></section>;

  async function submit(draft: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/studio/engineer-application", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || "Could not submit your application.");
      setEditingExisting(false); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit your application."); }
    finally { setBusy(false); }
  }

  const stored = application?.profileExtras as ProfileExtras | null;
  return <EngineerProfileBuilder initial={{ ...form, profileExtras: stored || { photo: user.avatar || "", banner: "", works: [{ title: "", url: form.portfolioUrl, role: "Mixing" }] } }} onSubmit={submit} busy={busy} error={error}/>;
}
