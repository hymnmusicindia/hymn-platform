"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Check, ChevronDown, CirclePause, Headphones, Instagram, Music2, Search, UserPlus, UserRound, Youtube } from "lucide-react";

type UserOption = { id: number; name: string; email: string; avatar: string | null };
type PortfolioItem = { title: string; url: string };
type Engineer = {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  userAvatar: string;
  professionalName: string;
  slug: string;
  profilePhotoUrl: string;
  bio: string;
  specialties: string[];
  genres: string[];
  socialLinks: { instagram: string; youtube: string };
  portfolioItems: PortfolioItem[];
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

const GENRES = ["Afrobeats", "Alternative", "Ambient", "Bollywood", "Classical", "Country", "Dance", "Devotional", "Drill", "EDM", "Electronic", "Folk", "Funk", "Ghazal", "Hip-Hop", "House", "Indie", "Jazz", "Lo-fi", "Metal", "Pop", "Punjabi", "R&B", "Reggae", "Rock", "Soul", "Techno", "Trap", "World"];
const SPECIALTIES = ["Mixing", "Mastering", "Vocal Production", "Vocal Tuning", "Dialogue Editing", "Stem Mixing", "Dolby Atmos", "Podcast Mixing", "Live Recording", "Sound Design", "Beat Production", "Restoration"];
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();

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
const portfolioLines = (value: FormDataEntryValue | null) => String(value || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => { const separator = line.indexOf("|"); return separator > 0 ? { title: line.slice(0, separator).trim(), url: line.slice(separator + 1).trim() } : { title: "Featured work", url: line }; });
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
    socialLinks: { instagram: String(form.get("instagram") || "").trim() || null, youtube: String(form.get("youtube") || "").trim() || null },
    portfolioItems: portfolioLines(form.get("portfolioItems")),
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

function UserPicker({ users }: { users: UserOption[] }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = users.find(user => user.id === selectedId);
  const visible = useMemo(() => { const term = query.trim().toLowerCase(); return users.filter(user => !term || `${user.name} ${user.email}`.toLowerCase().includes(term)).slice(0, 50); }, [query, users]);
  return <div className="relative"><input type="hidden" name="userId" required value={selectedId ?? ""} /><span className="mb-2 block text-sm font-medium">Registered user</span><button type="button" className="field flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen(value => !value)} aria-expanded={open}><span className="flex min-w-0 items-center gap-3">{selected ? <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--bg-soft)]">{selected.avatar ? <img src={selected.avatar} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : initials(selected.name)}</span> : <UserRound className="h-5 w-5 text-[var(--text-soft)]" />}<span className="min-w-0"><strong className="block truncate text-sm">{selected?.name ?? "Choose an account"}</strong><small className="block truncate text-[var(--text-muted)]">{selected?.email ?? "Search by name or email"}</small></span></span><ChevronDown className={`h-4 w-4 shrink-0 transition ${open ? "rotate-180" : ""}`} /></button>{open ? <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--card-strong)] shadow-2xl"><label className="relative block border-b border-[var(--border)] p-3"><Search className="pointer-events-none absolute left-6 top-6 h-4 w-4 text-[var(--text-soft)]"/><input autoFocus className="field w-full pl-10" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name or email…" /></label><div className="max-h-72 overflow-y-auto p-2">{visible.map(user => <button type="button" key={user.id} onClick={() => { setSelectedId(user.id); setOpen(false); setQuery(""); }} className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition hover:bg-[var(--bg-soft)]"><span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--bg-soft)] text-xs font-semibold">{user.avatar ? <img src={user.avatar} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover"/> : initials(user.name)}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{user.name}</strong><small className="block truncate text-[var(--text-muted)]">{user.email}</small></span>{selectedId === user.id ? <Check className="h-4 w-4 text-[var(--success)]"/> : null}</button>)}{!visible.length ? <p className="p-5 text-center text-sm text-[var(--text-muted)]">No matching accounts.</p> : null}</div></div> : null}</div>;
}

function TagPicker({ name, label, options, initial }: { name: string; label: string; options: string[]; initial: string[] }) {
  const [selected, setSelected] = useState(initial);
  const choices = [...new Set([...options, ...initial])];
  return <fieldset><legend className="text-sm font-medium">{label}</legend><input type="hidden" name={name} value={selected.join(",")} /><div className="mt-2 flex flex-wrap gap-2">{choices.map(option => { const active = selected.includes(option); return <button type="button" key={option} aria-pressed={active} onClick={() => setSelected(items => active ? items.filter(item => item !== option) : [...items, option])} className={`rounded-full border px-3 py-2 text-xs font-medium transition ${active ? "border-[color-mix(in_srgb,var(--accent)_55%,var(--border))] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]"}`}>{active ? <Check className="mr-1 inline h-3 w-3"/> : null}{option}</button>; })}</div>{!selected.length ? <p className="mt-2 text-xs text-[var(--danger)]">Choose at least one option.</p> : null}</fieldset>;
}

function EngineerFields({ engineer, users }: { engineer?: Engineer; users?: UserOption[] }) {
  const listing = engineer?.listing ?? defaults;
  return <div className="grid gap-5">
    {engineer ? <input type="hidden" name="userId" value={engineer.userId} /> : <UserPicker users={users ?? []} />}
    <div className="grid gap-4 md:grid-cols-2">
      <label className="grid gap-2 text-sm font-medium">Professional name<input className="field" name="professionalName" required minLength={2} defaultValue={engineer?.professionalName} /></label>
      <label className="grid gap-2 text-sm font-medium">Public profile slug<input className="field" name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="mix-engineer-name" defaultValue={engineer?.slug} /></label>
    </div>
    <label className="grid gap-2 text-sm font-medium">Profile photo URL <span className="text-xs font-normal text-[var(--text-soft)]">Optional. Leave blank to use the selected account’s Google profile photo.</span><input className="field" type="url" name="profilePhotoUrl" placeholder="Uses Google profile photo automatically" defaultValue={engineer?.profilePhotoUrl && engineer.profilePhotoUrl !== engineer.userAvatar ? engineer.profilePhotoUrl : ""} /></label>
    <label className="grid gap-2 text-sm font-medium">Bio<textarea className="field min-h-28" name="bio" required minLength={20} defaultValue={engineer?.bio} /></label>
    <TagPicker name="specialties" label="Specialties" options={SPECIALTIES} initial={engineer?.specialties ?? ["Mixing", "Mastering"]} />
    <TagPicker name="genres" label="Genres" options={GENRES} initial={engineer?.genres ?? ["Hip-Hop", "Pop", "R&B"]} />
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-soft)] p-4 sm:p-5"><div className="flex items-center gap-2"><Music2 className="h-4 w-4 text-[var(--accent)]"/><h3 className="font-semibold">Public links and work</h3></div><p className="mt-1 text-xs text-[var(--text-muted)]">These links appear on the engineer’s public profile so artists can review their work.</p><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm font-medium"><span className="flex items-center gap-2"><Instagram className="h-4 w-4"/>Instagram profile</span><input className="field" type="url" name="instagram" placeholder="https://instagram.com/username" defaultValue={engineer?.socialLinks.instagram} /></label><label className="grid gap-2 text-sm font-medium"><span className="flex items-center gap-2"><Youtube className="h-4 w-4"/>YouTube channel</span><input className="field" type="url" name="youtube" placeholder="https://youtube.com/@channel" defaultValue={engineer?.socialLinks.youtube} /></label></div><label className="mt-4 grid gap-2 text-sm font-medium">Songs and work samples <span className="text-xs font-normal leading-5 text-[var(--text-soft)]">Add one per line as “Song title | link”. You can use YouTube, Spotify, SoundCloud, or a direct audio link.</span><textarea className="field min-h-28" name="portfolioItems" placeholder={"Midnight Drive | https://youtube.com/watch?v=…\nVocal mix before and after | https://soundcloud.com/…"} defaultValue={engineer?.portfolioItems.map(item => `${item.title} | ${item.url}`).join("\n")} /></label></div>
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
