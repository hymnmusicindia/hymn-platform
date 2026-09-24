"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, ChevronDown, CirclePause, Headphones, UserPlus } from "lucide-react";

type UserOption = { id: number; name: string; email: string };
type Engineer = {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  professionalName: string;
  slug: string;
  profilePhotoUrl: string;
  bio: string;
  specialties: string[];
  genres: string[];
  availability: string;
  maxActiveOrders: number;
  verificationState: string;
  sellerState: string;
  payoutState: string;
  listing: {
    title: string;
    description: string;
    standardPrice: number;
    beatCustomerPrice: number | null;
    includedRevisions: number;
    additionalRevisionPrice: number;
    turnaroundDays: number;
    sourceRequirements: string[];
    deliverables: string[];
    instantAccept: boolean;
    active: boolean;
    paused: boolean;
  };
};

const defaults: Engineer["listing"] = {
  title: "Professional Mixing & Mastering",
  description: "A complete professional mix and master for one song, delivered release-ready.",
  standardPrice: 1999,
  beatCustomerPrice: 1499,
  includedRevisions: 2,
  additionalRevisionPrice: 399,
  turnaroundDays: 5,
  sourceRequirements: ["Consolidated stems or multitracks", "Rough reference mix", "Tempo and sample rate"],
  deliverables: ["24-bit WAV master", "320 kbps MP3"],
  instantAccept: false,
  active: true,
  paused: false,
};

const split = (value: FormDataEntryValue | null) => String(value || "").split(",").map(item => item.trim()).filter(Boolean);
function payload(form: FormData) {
  const beatPrice = String(form.get("beatCustomerPrice") || "").trim();
  return {
    userId: Number(form.get("userId")),
    professionalName: String(form.get("professionalName") || ""),
    slug: String(form.get("slug") || ""),
    profilePhotoUrl: String(form.get("profilePhotoUrl") || "").trim() || null,
    bio: String(form.get("bio") || ""),
    specialties: split(form.get("specialties")),
    genres: split(form.get("genres")),
    availability: String(form.get("availability")),
    maxActiveOrders: Number(form.get("maxActiveOrders")),
    verificationState: String(form.get("verificationState")),
    sellerState: String(form.get("sellerState")),
    payoutState: String(form.get("payoutState")),
    listing: {
      title: String(form.get("title") || ""),
      description: String(form.get("description") || ""),
      standardPrice: Number(form.get("standardPrice")),
      beatCustomerPrice: beatPrice ? Number(beatPrice) : null,
      includedRevisions: Number(form.get("includedRevisions")),
      additionalRevisionPrice: Number(form.get("additionalRevisionPrice")),
      turnaroundDays: Number(form.get("turnaroundDays")),
      sourceRequirements: split(form.get("sourceRequirements")),
      deliverables: split(form.get("deliverables")),
      instantAccept: form.get("instantAccept") === "on",
      active: form.get("active") === "on",
      paused: form.get("paused") === "on",
    },
  };
}

function EngineerFields({ engineer, users }: { engineer?: Engineer; users?: UserOption[] }) {
  const listing = engineer?.listing ?? defaults;
  return <div className="grid gap-5">
    {engineer ? <input type="hidden" name="userId" value={engineer.userId} /> : <label className="grid gap-2 text-sm font-medium">Registered user<select className="field" name="userId" required defaultValue=""><option value="" disabled>Select the account that will receive engineer access</option>{users?.map(user => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select></label>}
    <div className="grid gap-4 md:grid-cols-2">
      <label className="grid gap-2 text-sm font-medium">Professional name<input className="field" name="professionalName" required minLength={2} defaultValue={engineer?.professionalName} /></label>
      <label className="grid gap-2 text-sm font-medium">Public profile slug<input className="field" name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="mix-engineer-name" defaultValue={engineer?.slug} /></label>
    </div>
    <label className="grid gap-2 text-sm font-medium">Profile photo URL <span className="text-xs font-normal text-[var(--text-soft)]">Optional HTTPS image URL</span><input className="field" type="url" name="profilePhotoUrl" placeholder="https://…" defaultValue={engineer?.profilePhotoUrl} /></label>
    <label className="grid gap-2 text-sm font-medium">Bio<textarea className="field min-h-28" name="bio" required minLength={20} defaultValue={engineer?.bio} /></label>
    <div className="grid gap-4 md:grid-cols-2">
      <label className="grid gap-2 text-sm font-medium">Specialties <span className="text-xs font-normal text-[var(--text-soft)]">Comma-separated</span><input className="field" name="specialties" required placeholder="Mixing, Mastering, Vocal production" defaultValue={engineer?.specialties.join(", ")} /></label>
      <label className="grid gap-2 text-sm font-medium">Genres <span className="text-xs font-normal text-[var(--text-soft)]">Comma-separated</span><input className="field" name="genres" required placeholder="Hip-Hop, Pop, R&B" defaultValue={engineer?.genres.join(", ")} /></label>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <label className="grid gap-2 text-sm font-medium">Availability<select className="field" name="availability" defaultValue={engineer?.availability ?? "AVAILABLE"}><option value="AVAILABLE">Available</option><option value="UNAVAILABLE">Unavailable</option></select></label>
      <label className="grid gap-2 text-sm font-medium">Verification<select className="field" name="verificationState" defaultValue={engineer?.verificationState ?? "VERIFIED"}><option value="VERIFIED">Verified</option><option value="UNVERIFIED">Unverified</option></select></label>
      <label className="grid gap-2 text-sm font-medium">Seller status<select className="field" name="sellerState" defaultValue={engineer?.sellerState ?? "ACTIVE"}><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option></select></label>
      <label className="grid gap-2 text-sm font-medium">Payout status<select className="field" name="payoutState" defaultValue={engineer?.payoutState ?? "NOT_CONFIGURED"}><option value="NOT_CONFIGURED">Not configured</option><option value="PENDING">Pending</option><option value="READY">Ready</option></select></label>
      <label className="grid gap-2 text-sm font-medium">Max active orders<input className="field" type="number" name="maxActiveOrders" min={1} max={50} required defaultValue={engineer?.maxActiveOrders ?? 3} /></label>
    </div>
    <div className="border-t border-[var(--border)] pt-5"><p className="hymn-kicker">Service listing</p><div className="mt-4 grid gap-4">
      <label className="grid gap-2 text-sm font-medium">Service title<input className="field" name="title" required defaultValue={listing.title} /></label>
      <label className="grid gap-2 text-sm font-medium">Service description<textarea className="field min-h-24" name="description" required minLength={20} defaultValue={listing.description} /></label>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="grid gap-2 text-sm font-medium">Standard price (₹)<input className="field" type="number" name="standardPrice" min={0} step="0.01" required defaultValue={listing.standardPrice} /></label>
        <label className="grid gap-2 text-sm font-medium">Beat price (₹)<input className="field" type="number" name="beatCustomerPrice" min={0} step="0.01" defaultValue={listing.beatCustomerPrice ?? ""} /></label>
        <label className="grid gap-2 text-sm font-medium">Included revisions<input className="field" type="number" name="includedRevisions" min={0} max={20} required defaultValue={listing.includedRevisions} /></label>
        <label className="grid gap-2 text-sm font-medium">Extra revision (₹)<input className="field" type="number" name="additionalRevisionPrice" min={0} step="0.01" required defaultValue={listing.additionalRevisionPrice} /></label>
        <label className="grid gap-2 text-sm font-medium">Turnaround days<input className="field" type="number" name="turnaroundDays" min={1} max={90} required defaultValue={listing.turnaroundDays} /></label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">Required source files <span className="text-xs font-normal text-[var(--text-soft)]">Comma-separated</span><input className="field" name="sourceRequirements" required defaultValue={listing.sourceRequirements.join(", ")} /></label>
        <label className="grid gap-2 text-sm font-medium">Deliverables <span className="text-xs font-normal text-[var(--text-soft)]">Comma-separated</span><input className="field" name="deliverables" required defaultValue={listing.deliverables.join(", ")} /></label>
      </div>
      <div className="flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={listing.active} /> Public listing active</label><label className="flex items-center gap-2"><input type="checkbox" name="paused" defaultChecked={listing.paused} /> Pause new orders</label><label className="flex items-center gap-2"><input type="checkbox" name="instantAccept" defaultChecked={listing.instantAccept} /> Automatically accept paid orders</label></div>
    </div></div>
  </div>;
}

export function AdminStudioEngineerManager({ users, engineers }: { users: UserOption[]; engineers: Engineer[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>, engineer?: Engineer) {
    event.preventDefault();
    const form = event.currentTarget;
    const key = engineer ? String(engineer.id) : "create";
    setPending(key); setMessage(null);
    const response = await fetch(engineer ? `/api/admin/studio/engineers/${engineer.id}` : "/api/admin/studio/engineers", { method: engineer ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload(new FormData(form))) });
    const envelope = await response.json().catch(() => ({}));
    setPending(null);
    if (!response.ok || !envelope.success) { setMessage({ tone: "error", text: envelope.error?.message || "Could not save engineer." }); return; }
    setMessage({ tone: "success", text: engineer ? `${engineer.professionalName} was updated.` : "Engineer appointed and notified." });
    if (!engineer) form.reset();
    router.refresh();
  }
  return <section className="mt-7 grid gap-5">
    {message ? <p role="status" className={`rounded-2xl border p-4 text-sm ${message.tone === "error" ? "border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] text-[var(--danger)]" : "border-[color-mix(in_srgb,var(--success)_40%,var(--border))] text-[var(--success)]"}`}>{message.text}</p> : null}
    <details className="group rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4"><span className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><UserPlus className="h-5 w-5" /></span><span><strong className="block text-lg">Appoint an engineer</strong><small className="text-[var(--text-muted)]">Connect a user, publish their service, and open their workspace.</small></span></span><ChevronDown className="h-5 w-5 transition group-open:rotate-180" /></summary>
      <form className="mt-6 border-t border-[var(--border)] pt-6" onSubmit={event => submit(event)}><EngineerFields users={users} /><button className="btn-primary mt-6" disabled={pending === "create"}>{pending === "create" ? "Appointing…" : "Appoint engineer"}</button></form>
    </details>
    <div className="grid gap-3"><div><p className="hymn-kicker">Engineer roster</p><h2 className="mt-2 text-xl font-semibold">Manage access and listings</h2></div>{engineers.length ? engineers.map(engineer => <details key={engineer.id} className="group rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4"><span className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--bg-soft)]"><Headphones className="h-5 w-5" /></span><span className="min-w-0"><strong className="flex items-center gap-1.5 truncate">{engineer.professionalName}{engineer.verificationState === "VERIFIED" ? <BadgeCheck className="h-4 w-4 shrink-0 text-[var(--info)]" /> : null}</strong><small className="block truncate text-[var(--text-muted)]">{engineer.userEmail} · {engineer.availability.toLowerCase()} · {engineer.sellerState.toLowerCase()}</small></span></span><span className="flex items-center gap-3">{engineer.listing.paused || !engineer.listing.active ? <CirclePause className="h-4 w-4 text-[var(--warning)]" /> : <span className="hymn-status-badge hymn-status-success">Live</span>}<ChevronDown className="h-5 w-5 transition group-open:rotate-180" /></span></summary>
      <form className="mt-6 border-t border-[var(--border)] pt-6" onSubmit={event => submit(event, engineer)}><p className="mb-5 text-sm text-[var(--text-muted)]">Linked account: {engineer.userName} · {engineer.userEmail}</p><EngineerFields engineer={engineer} /><div className="mt-6 flex flex-wrap items-center gap-3"><button className="btn-primary" disabled={pending === String(engineer.id)}>{pending === String(engineer.id) ? "Saving…" : "Save engineer"}</button><a className="btn-outline" href={`/studio/engineers/${engineer.slug}`} target="_blank" rel="noreferrer">View public profile</a></div></form>
    </details>) : <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-[var(--text-muted)]">No engineers appointed yet.</div>}</div>
  </section>;
}
