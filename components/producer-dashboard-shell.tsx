"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { DashboardFrame } from "@/components/dashboard-frame";
import { FloatingAssistant } from "@/components/floating-assistant";
import { BeatCard } from "@/components/beat-card";
import { Beat, BeatPurchase, Notification, Order, Release, SupportTicket, User } from "@/lib/types";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { CustomerHome, ProducerHome } from "@/components/simplified-dashboard-home";

const AnalyticsDashboard = dynamic(() => import("@/components/analytics-dashboard").then((module) => module.AnalyticsDashboard));
const ReferralPanel = dynamic(() => import("@/components/referral-panel").then((module) => module.ReferralPanel));
const SplitsDashboard = dynamic(() => import("@/components/splits-dashboard").then((module) => module.SplitsDashboard));
const ProfilePreferencesForm = dynamic(() => import("@/components/profile-preferences-form").then((module) => module.ProfilePreferencesForm));

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric-card customer-stat-card fade-up h-full">
      <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-soft)" }}>{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>{value}</p>
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="surface-card customer-module-section overflow-hidden p-5 sm:p-6 lg:p-7 fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-5" style={{ borderColor: "var(--border)" }}>
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent)" }}>Artist workspace</p>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl" style={{ color: "var(--text)" }}>{title}</h2>
          {description ? <p className="mt-2 max-w-3xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>{description}</p> : null}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function StatusPill({ label, active = true }: { label: string; active?: boolean }) {
  const normalized = label.toLowerCase().replace(/_/g, " ");
  const negative = /failed|rejected|denied|missing|issue/.test(normalized);
  const warning = /pending|review|scheduled|requested|processing/.test(normalized);
  return <span className={`status-pill ${active ? "status-pill-active" : ""} ${negative ? "customer-status-negative" : warning ? "customer-status-warning" : ""}`}>{normalized}</span>;
}

function EmptyState({ copy }: { copy: string }) {
  return <div className="rounded-2xl border border-dashed px-5 py-8 text-center text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text-soft)" }}>{copy}</div>;
}

function formatMoney(amount: number) {
  return `Rs ${Math.round(amount).toLocaleString("en-IN")}`;
}

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not set" : date.toLocaleDateString();
}

function releaseTitle(release: Release) {
  return release.releaseTitle?.trim() || release.trackName || "Untitled release";
}

function matchesQuery(values: Array<string | number | null | undefined>, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(normalized));
}

function MiniTable({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--border)" }}>{children}</div>;
}

function Timeline({ items }: { items: Array<{ label: string; detail?: string; active?: boolean }> }) {
  return (
    <div className="grid gap-3">
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className="flex gap-3">
          <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: item.active ? "var(--accent)" : "var(--border)", background: item.active ? "var(--accent)" : "var(--bg-soft)" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.active ? "var(--accent-foreground)" : "var(--text-soft)" }} />
          </span>
          <span>
            <span className="block text-sm font-semibold" style={{ color: "var(--text)" }}>{item.label}</span>
            {item.detail ? <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>{item.detail}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

function ProducerProfileWorkspace({ user, profile, onSubmit, pending, feedback }: { user: User; profile: any; onSubmit: (event: FormEvent<HTMLFormElement>) => void; pending: boolean; feedback: string | null }) {
  return <div className="grid gap-6 xl:grid-cols-[0.75fr,1.25fr]"><Panel title="Producer identity" description="This profile powers your public identity across the HYMN Beat Store."><div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>{profile?.coverPhotoUrl ? <img src={profile.coverPhotoUrl} alt="Producer cover" className="aspect-[16/7] w-full object-cover" /> : <div className="flex aspect-[16/7] items-center justify-center text-sm" style={{ color: "var(--text-muted)" }}>Add a cover photo</div>}<div className="p-5"><h3 className="text-2xl font-semibold">{profile?.displayName || user.name}</h3><p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{profile?.bio || "Complete your producer profile before publishing beats."}</p><div className="mt-4"><StatusPill label={profile?.status || "pending setup"} active={profile?.status === "active"} /></div></div></div></Panel><Panel title="Edit producer profile" description="Display name is required. Images are validated and stored through HYMN uploads."><form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm">Display name<input name="displayName" required minLength={2} defaultValue={profile?.displayName || user.name} className="field" /></label><label className="grid gap-2 text-sm">Location<input name="location" defaultValue={profile?.location || ""} className="field" /></label><label className="grid gap-2 text-sm sm:col-span-2">Bio<textarea name="bio" defaultValue={profile?.bio || ""} className="field min-h-28" /></label><label className="grid gap-2 text-sm sm:col-span-2">Genre tags<input name="producerTags" defaultValue={Array.isArray(profile?.tags) ? profile.tags.join(", ") : profile?.specialty || ""} className="field" placeholder="Hip-Hop, Trap, R&B" /></label><label className="grid gap-2 text-sm">Cover photo<input name="coverPhoto" type="file" accept="image/jpeg,image/png,image/webp" className="field" /></label><label className="grid gap-2 text-sm">Profile image<input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" className="field" /></label>{[["instagramUrl","Instagram"],["youtubeUrl","YouTube"],["spotifyUrl","Spotify"],["websiteUrl","Website"]].map(([name,label])=><label key={name} className="grid gap-2 text-sm">{label}<input name={name} type="url" defaultValue={profile?.[name] || ""} className="field" /></label>)}<button type="submit" disabled={pending} className="btn-primary pressable sm:col-span-2">{pending ? "Saving..." : "Save producer profile"}</button>{feedback ? <p className="text-sm sm:col-span-2" style={{ color: "var(--text-muted)" }}>{feedback}</p> : null}</form></Panel></div>;
}
export function ProducerDashboardShell({ user, beats, orders, earnings, finance }: { user: User; beats: Beat[]; orders: Order[]; earnings: { totalSales: number; totalRevenue: number; beatsSold: number }; finance: any }) {
  const [activeTab, setActiveTab] = useState<"overview" | "profile" | "catalog" | "collaborations" | "placements" | "contracts" | "earnings" | "payout" | "ledger" | "upload" | "licensing" | "messages" | "analytics" | "settings" | "manage" | "sales">("overview");
  const [catalog, setCatalog] = useState(beats);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editingBeat, setEditingBeat] = useState<Beat | null>(null);
  const [deletingBeat, setDeletingBeat] = useState<Beat | null>(null);
  const [audioFormat, setAudioFormat] = useState<string>("");
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [catalogStatusFilter, setCatalogStatusFilter] = useState("all");
  const [catalogGenreFilter, setCatalogGenreFilter] = useState("all");
  const [selectedAudioFile, setSelectedAudioFile] = useState<File | null>(null);
  const [beatUploadStep, setBeatUploadStep] = useState(1);
  const [producerProfile, setProducerProfile] = useState(finance.profile ?? null);
  const [producerNotifications, setProducerNotifications] = useState<Notification[]>([]);
  const enabledBeats = catalog.filter((beat) => beat.enabled);
  const disabledBeats = catalog.filter((beat) => !beat.enabled);
  const licenseRows = orders.flatMap((order) => order.items.map((item) => ({ order, item })));
  const genres = Array.from(new Set(catalog.map((beat) => beat.genre).filter(Boolean))).sort();
  const filteredCatalog = useMemo(() => catalog.filter((beat) => {
    const matchesStatus = catalogStatusFilter === "all" || (catalogStatusFilter === "enabled" ? beat.enabled : !beat.enabled);
    const matchesGenre = catalogGenreFilter === "all" || beat.genre === catalogGenreFilter;
    return matchesStatus && matchesGenre && matchesQuery([beat.title, beat.genre, beat.mood, beat.bpm, beat.price], dashboardSearch);
  }), [catalog, catalogGenreFilter, catalogStatusFilter, dashboardSearch]);
  const filteredLicenseRows = useMemo(() => licenseRows.filter(({ order, item }) => matchesQuery([order.id, order.buyerName, order.buyerEmail, order.paymentStatus, item.beatTitle, item.licenseType], dashboardSearch)), [dashboardSearch, licenseRows]);
  const licenseCounts = useMemo(() => {
    const counts: Record<string, number> = { general: 0, basic: 0, premium: 0, exclusive: 0 };
    filteredLicenseRows.forEach(({ item }) => { counts[item.licenseType] = (counts[item.licenseType] ?? 0) + 1; });
    return counts;
  }, [filteredLicenseRows]);

  useEffect(() => {
    fetch("/api/notifications?limit=30", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => setProducerNotifications(Array.isArray(data?.notifications) ? data.notifications : [])).catch(() => undefined);
  }, []);

  function saveProducerProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    startTransition(async () => {
      const response = await fetch("/api/producer/profile", { method: "PATCH", body: new FormData(form) });
      const data = await response.json();
      if (!response.ok) return setFeedback(data.error || "Could not update producer profile.");
      setProducerProfile(data.profile);
      setFeedback("Producer profile saved.");
    });
  }

  function handleBeatUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setFeedback(null);

    const format = formData.get("audioFormat") as string;
    const file = formData.get("file") as File | null;
    if (file && format) {
      const isMp3 = file.name.toLowerCase().endsWith(".mp3") || file.type === "audio/mpeg" || file.type === "audio/mp3";
      const isWav = file.name.toLowerCase().endsWith(".wav") || file.type === "audio/wav";
      if (format === "MP3" && !isMp3) {
        setFeedback("Please upload a valid MP3 file.");
        return;
      }
      if (format === "WAV" && !isWav) {
        setFeedback("Please upload a valid WAV file.");
        return;
      }
    }

    startTransition(async () => {
      try {
        setFeedback("Uploading and securely organizing beat assets…");
        const response = await fetch("/api/producer/beats", { method: "POST", body: formData });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Beat upload failed (HTTP ${response.status}).`);
        if (!data.beat?.id) throw new Error("The server did not return the finalized beat. Please retry; no duplicate was added to this page.");
        setCatalog((items) => [data.beat, ...items.filter((item) => item.id !== data.beat.id)]);
        setFeedback(`Beat uploaded and submitted for review: ${data.beat.title}`);
        form.reset();
        setSelectedAudioFile(null);
        setAudioFormat("");
        setBeatUploadStep(1);
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Could not upload beat. Please retry.");
      }
    });
  }

  function handleBeatUpdate(beat: Beat, patch: Partial<Beat>) {
    startTransition(async () => {
      const response = await fetch(`/api/producer/beats/${beat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const data = await response.json();
      if (!response.ok) {
        setFeedback(data.error || "Could not update beat.");
        return;
      }
      setCatalog((items) => items.map((item) => (item.id === beat.id ? data.beat : item)));
      setFeedback(`Beat updated: ${data.beat.title}`);
    });
  }

  function handleBeatEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingBeat) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const patch = {
      title: String(formData.get("title") || ""),
      bpm: Number(formData.get("bpm")),
      genre: String(formData.get("genre") || ""),
      mood: String(formData.get("mood") || ""),
      keySignature: String(formData.get("keySignature") || ""),
      generalPrice: Number(formData.get("generalPrice")),
      exclusivePrice: Number(formData.get("exclusivePrice")),
      description: String(formData.get("description") || ""),
    };
    handleBeatUpdate(editingBeat, patch);
    setEditingBeat(null);
  }

  function handleBeatDelete() {
    if (!deletingBeat) return;
    startTransition(async () => {
      const response = await fetch(`/api/producer/beats/${deletingBeat.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        setFeedback(data.error || "Could not delete beat.");
        setDeletingBeat(null);
        return;
      }
      setCatalog((items) => data.archived ? items.map((item) => item.id === deletingBeat.id ? { ...item, enabled: false, status: "ARCHIVED" } : item) : items.filter((item) => item.id !== deletingBeat.id));
      setFeedback(data.archived ? `Beat archived because it has sales history: ${deletingBeat.title}` : `Beat deleted: ${deletingBeat.title}`);
      setDeletingBeat(null);
    });
  }

  return (
    <DashboardFrame
      eyebrow="Producer dashboard"
      title={user.name}
      subtitle={user.email}
      navItems={[
        { key: "overview", label: "Overview", description: "Catalogue, sales and actions", group: "Home" },
        { key: "catalog", label: "My Beats", description: "Catalogue and pricing", group: "Beats" },
        { key: "upload", label: "Upload Beat", description: "Add a new beat", group: "Beats" },
        { key: "store", label: "Beat Store", description: "Open your storefront", group: "Beats", href: "/beat-store" },
        { key: "sales", label: "Sales", description: "Verified purchases", group: "Business" },
        { key: "earnings", label: "Earnings", description: "Your 70% share", group: "Business" },
        { key: "payout", label: "Payouts", description: "Balance and withdrawals", group: "Business" },
        { key: "profile", label: "Producer Profile", description: "Your public identity", group: "Profile" },
        { key: "messages", label: "Notifications", description: "Sales and account updates", group: "Account" },
        { key: "settings", label: "Settings", description: "Workspace preferences", group: "Account" },
        { key: "help", label: "Help & FAQ", description: "Guidance and support", group: "Support", href: "/faq" }
      ]}
      activeKey={activeTab}
      onSelect={setActiveTab}
      searchValue={dashboardSearch}
      onSearchChange={setDashboardSearch}
      searchPlaceholder={activeTab === "catalog" ? "Search beats, genre, mood, BPM..." : activeTab === "licensing" || activeTab === "sales" ? "Search buyers, orders, licenses..." : "Search catalog and sales..."}
      workspaceAction={<WorkspaceSwitcher current="producer" />}
      onNotificationsClick={() => setActiveTab("messages")}
      notificationCount={producerNotifications.filter((notification) => !notification.readAt).length}
      compactOverview
    >
      {activeTab === "overview" ? <ProducerHome user={user} beats={catalog} finance={finance} notifications={producerNotifications} onTab={(tab) => setActiveTab(tab)} /> : null}
      {false && activeTab === "overview" ? <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Catalog size" value={catalog.length} />
        <StatCard label="Enabled beats" value={enabledBeats.length} />
        <StatCard label="Disabled beats" value={disabledBeats.length} />
        <StatCard label="Total sales" value={finance.totalSales} />
        <StatCard label="Available payout" value={formatMoney(finance.availableBalance)} />
        <StatCard label="Producer earnings 70%" value={formatMoney(finance.producerEarnings)} />
        <StatCard label="HYMN commission 30%" value={formatMoney(finance.hymnCommission)} />
      </section> : null}

      {false && activeTab === "overview" ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
          <Panel title="Creative collaboration workspace" description="Catalog, placements, licensing, and artist requests in one premium producer OS.">
            <div className="grid gap-3 sm:grid-cols-3">
              <button type="button" onClick={() => setActiveTab("upload")} className="btn-primary pressable">Upload Beat</button>
              <button type="button" onClick={() => setActiveTab("catalog")} className="btn-outline pressable">Manage Catalog</button>
              <button type="button" onClick={() => setActiveTab("licensing")} className="btn-outline pressable">Licensing</button>
            </div>
            <div className="mt-6 grid gap-4">
              {catalog.slice(0, 4).map((beat) => (
                <div key={beat.id} className="max-w-sm">
                  <BeatCard beat={beat} />
                </div>
              ))}
              {catalog.length === 0 ? <EmptyState copy="No beats uploaded yet." /> : null}
            </div>
          </Panel>
          <Panel title="Producer performance" description="Verified signals from catalog and paid order data.">
            <div className="grid gap-4">
              <StatCard label="Verified orders" value={orders.length} />
              <StatCard label="Licenses sold" value={earnings.beatsSold} />
              <StatCard label="Active beats" value={enabledBeats.length} />
            </div>
          </Panel>
        </div>
      ) : null}

      {activeTab === "profile" ? <ProducerProfileWorkspace user={user} profile={producerProfile} onSubmit={saveProducerProfile} pending={isPending} feedback={feedback} /> : null}

      {activeTab === "upload" ? (
        <Panel title="Upload Beat" description="Complete five short steps. Your master stays private; only an optional preview is public.">
          <form onSubmit={handleBeatUpload} className="mx-auto grid max-w-2xl gap-5">
            <div><div className="flex justify-between text-xs"><span>Step {beatUploadStep} of 5</span><span>{["Audio", "Beat information", "Artwork", "Pricing & licences", "Review"][beatUploadStep - 1]}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border)]"><span className="block h-full bg-[var(--accent)] transition-all" style={{ width: `${beatUploadStep * 20}%` }} /></div></div>
            <fieldset hidden={beatUploadStep !== 1} className="grid gap-4"><legend className="mb-4 text-xl font-semibold">Audio</legend><select name="audioFormat" required className="field w-full" value={audioFormat} onChange={(e) => setAudioFormat(e.target.value)}><option value="">Master format</option><option value="MP3">High-quality MP3</option><option value="WAV">Lossless WAV</option></select><label className="text-sm font-medium">Private master / delivery file<input name="file" required type="file" accept={audioFormat === "MP3" ? ".mp3,audio/mpeg" : audioFormat === "WAV" ? ".wav,audio/wav" : "audio/*,.wav,.mp3"} className="field mt-2" onChange={(event) => setSelectedAudioFile(event.target.files?.[0] ?? null)} /></label>{selectedAudioFile ? <p className="rounded-xl border px-3 py-2 text-xs" style={{ borderColor: "var(--border)" }}>{selectedAudioFile.name} · {(selectedAudioFile.size / 1048576).toFixed(2)} MB</p> : null}<label className="text-sm font-medium">Public preview (optional)<input name="preview" type="file" accept="audio/mpeg,.mp3" className="field mt-2" /></label><p className="text-xs text-[var(--text-soft)]">If no preview is supplied, the private master is never exposed. You can add a preview later.</p></fieldset>
            <fieldset hidden={beatUploadStep !== 2} className="grid gap-4 sm:grid-cols-2"><legend className="mb-4 text-xl font-semibold">Beat information</legend><input name="title" required className="field sm:col-span-2" placeholder="Beat title" /><input name="bpm" required type="number" min="40" max="300" className="field" placeholder="BPM" /><input name="keySignature" required className="field" placeholder="Key (for example F# Minor)" /><input name="genre" required className="field" placeholder="Genre" /><input name="subgenre" className="field" placeholder="Subgenre" /><input name="mood" required className="field" placeholder="Mood" /><input name="tags" className="field" placeholder="Tags, separated by commas" /><textarea name="description" className="field min-h-28 sm:col-span-2" placeholder="Description" /><label className="sm:col-span-2 text-sm font-medium">Does this beat contain samples you do not own or control?<select name="sampleDeclaration" required className="field mt-2"><option value="">Choose an answer</option><option value="NO_UNCONTROLLED_SAMPLES">No</option><option value="CONTAINS_UNCONTROLLED_SAMPLES">Yes — I will disclose them below</option></select></label><textarea name="sampleDisclosure" className="field min-h-24 sm:col-span-2" placeholder="Required when you answered Yes: identify the samples and clearance status" /></fieldset>
            <fieldset hidden={beatUploadStep !== 3} className="grid gap-4"><legend className="mb-4 text-xl font-semibold">Artwork</legend><label className="text-sm font-medium">Beat artwork (optional)<input name="artwork" type="file" accept="image/jpeg,image/png,image/webp" className="field mt-2" /></label><p className="text-xs text-[var(--text-soft)]">JPEG, PNG or WebP. HYMN uses a clean fallback if you skip artwork.</p></fieldset>
            <fieldset hidden={beatUploadStep !== 4} className="grid gap-4 sm:grid-cols-2"><legend className="mb-4 text-xl font-semibold">Pricing & licences</legend><label className="text-sm font-medium">General Licence price<input name="generalPrice" required type="number" min="1" className="field mt-2" placeholder="₹500" /></label><label className="text-sm font-medium">Exclusive Licence price<input name="exclusivePrice" required type="number" min="2" className="field mt-2" placeholder="₹5000" /></label><input name="price" type="hidden" value="1" /><p className="sm:col-span-2 text-xs text-[var(--text-soft)]">Exclusive must cost more than General. HYMN receives 30%; you receive 70% of the net sale amount. Exclusive defaults to an exclusive licence, not copyright assignment.</p></fieldset>
            <fieldset hidden={beatUploadStep !== 5} className="grid gap-3"><legend className="mb-4 text-xl font-semibold">Review</legend><div className="rounded-2xl border p-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><p className="font-semibold">Ready to submit for HYMN review</p><p className="mt-2 text-[var(--text-muted)]">We will validate the audio, artwork, metadata, prices, and sample declaration. The beat is not public until approved.</p></div></fieldset>
            <div className="flex items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--border)" }}><button type="button" className="btn-outline" disabled={beatUploadStep === 1 || isPending} onClick={() => setBeatUploadStep((step) => Math.max(1, step - 1))}>Back</button>{beatUploadStep < 5 ? <button type="button" className="btn-primary" onClick={(event) => { const current = event.currentTarget.form?.querySelector<HTMLFieldSetElement>(`fieldset:not([hidden])`); const invalid = current ? Array.from(current.elements).find((element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement => "checkValidity" in element && !(element as HTMLInputElement).checkValidity()) : null; if (invalid) return invalid.reportValidity(); setBeatUploadStep((step) => Math.min(5, step + 1)); }}>Continue</button> : <button type="submit" disabled={isPending} className="btn-primary pressable">{isPending ? "Uploading..." : "Submit for review"}</button>}</div>
            {feedback ? <p className="text-sm" style={{ color: "var(--text)" }}>{feedback}</p> : null}
          </form>
        </Panel>
      ) : null}
      {(activeTab === "manage" || activeTab === "catalog") ? (
        <Panel title="Manage beats" description="Enable, disable, and price your catalog without desktop-only controls.">
          <div className="mb-5 grid gap-3 md:grid-cols-[0.8fr,0.8fr,1fr]">
            <select className="field" value={catalogStatusFilter} onChange={(event) => setCatalogStatusFilter(event.target.value)}>
              <option value="all">All status</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
            <select className="field" value={catalogGenreFilter} onChange={(event) => setCatalogGenreFilter(event.target.value)}>
              <option value="all">All genres</option>
              {genres.map((genre) => <option key={genre} value={genre}>{genre}</option>)}
            </select>
            <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text-muted)" }}>
              Showing {filteredCatalog.length} / {catalog.length} beats
            </div>
          </div>
          <div className="grid gap-4">
            {filteredCatalog.map((beat) => (
              <article key={beat.id} className="surface-list-item p-4 lg:p-6">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                  <div className="w-full max-w-[280px]">
                    <BeatCard beat={beat} />
                    <div className="mt-3"><StatusPill label={(beat.status ?? (beat.enabled ? "PUBLISHED" : "PENDING_REVIEW")).replace(/_/g, " ")} active={beat.status === "PUBLISHED"} /></div>
                    {beat.reviewIssues?.reason ? <div className="mt-3 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}><p className="font-semibold">Corrections requested</p><p className="mt-1">{beat.reviewIssues.reason}</p></div> : null}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-5">
                    {beat.fileUrl ? <a href={beat.fileUrl} target="_blank" rel="noreferrer" className="btn-outline pressable text-center">Preview</a> : <button type="button" disabled className="btn-outline opacity-50">No audio</button>}
                    <Link href="/beat-store" className="btn-outline pressable text-center">Storefront</Link>
                    <button type="button" onClick={() => setEditingBeat(beat)} className="btn-outline pressable">
                      Edit
                    </button>
                    <button type="button" disabled={!beat.enabled && beat.status !== "APPROVED"} onClick={() => handleBeatUpdate(beat, { enabled: !beat.enabled })} className="btn-outline pressable disabled:opacity-50">
                      {beat.enabled ? "Disable" : "Enable"}
                    </button>
                    <button type="button" onClick={() => setDeletingBeat(beat)} className="btn-outline pressable text-red-500 border-red-500 hover:bg-red-500/10 hover:text-red-600">
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {filteredCatalog.length === 0 ? <EmptyState copy="No beats match the active filters." /> : null}
          </div>
        </Panel>
      ) : null}

      {activeTab === "licensing" ? (
        <Panel title="Licensing system" description="License tier sales and available license documents from real orders.">
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <StatCard label="Basic" value={licenseCounts.basic} />
            <StatCard label="Premium" value={licenseCounts.premium} />
            <StatCard label="Exclusive" value={licenseCounts.exclusive} />
          </div>
          <div className="grid gap-3">
            {filteredLicenseRows.map(({ order, item }, index) => (
              <article key={`${order.id}-${item.beatId}-${index}`} className="surface-list-item p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="font-semibold" style={{ color: "var(--text)" }}>{item.beatTitle ?? `Beat #${item.beatId}`}</p><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Order #{order.id} / {order.buyerEmail ?? order.buyerName ?? `User #${order.userId}`}</p></div>
                  <StatusPill label={item.licenseType} />
                </div>
                {item.licenseUrl ? <a href={item.licenseUrl} className="mt-3 inline-flex rounded-full border px-3 py-1 text-xs" style={{ borderColor: "var(--border)", color: "var(--text)" }}>View license doc</a> : <p className="mt-3 text-xs" style={{ color: "var(--text-soft)" }}>No uploaded/generated license document available.</p>}
              </article>
            ))}
            {filteredLicenseRows.length === 0 ? <EmptyState copy="No license sales match this search." /> : null}
          </div>
        </Panel>
      ) : null}

      {activeTab === "analytics" ? (
        <Panel title="Beat analytics" description="Real catalog and order-derived performance. No fake streaming metrics.">
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Enabled vs disabled" value={`${enabledBeats.length}/${disabledBeats.length}`} />
            <StatCard label="Genres" value={genres.length} />
            <StatCard label="Revenue" value={formatMoney(earnings.totalRevenue)} />
          </div>
          <div className="mt-6 grid gap-3">
            {catalog.map((beat) => {
              const sales = licenseRows.filter(({ item }) => item.beatId === beat.id);
              return <div key={`analytics-${beat.id}`} className="summary-card"><span>{beat.title}</span><span>{sales.length} sale(s) / {formatMoney(sales.reduce((sum, row) => sum + row.item.price, 0))}</span></div>;
            })}
            {catalog.length === 0 ? <EmptyState copy="Upload beats to start catalog analytics." /> : null}
          </div>
        </Panel>
      ) : null}

      {activeTab === "contracts" ? (
        <Panel title="Contract center" description="Lists existing license documents and clearly marks missing docs.">
          <div className="grid gap-3">
            {filteredLicenseRows.map(({ order, item }, index) => (
              <div key={`contract-${order.id}-${index}`} className="summary-card"><span>{item.beatTitle ?? `Beat #${item.beatId}`} / {item.licenseType}</span><span>{item.licenseUrl ? "Document ready" : "Document missing"}</span></div>
            ))}
            {filteredLicenseRows.length === 0 ? <EmptyState copy="No contracts or license documents available yet." /> : null}
          </div>
        </Panel>
      ) : null}

      {(activeTab === "placements" || activeTab === "collaborations") ? (
        <Panel title={activeTab === "placements" ? "Placement opportunities" : "Collaborations"} description="Uses paid beat orders and buyers as practical collaboration signals.">
          <div className="grid gap-3">
            {filteredLicenseRows.map(({ order, item }, index) => (
              <article key={`placement-${order.id}-${index}`} className="surface-list-item p-4">
                <p className="font-semibold" style={{ color: "var(--text)" }}>{item.beatTitle ?? `Beat #${item.beatId}`}</p>
                <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Buyer: {order.buyerEmail ?? order.buyerName ?? `User #${order.userId}`} / {item.licenseType}</p>
              </article>
            ))}
            {filteredLicenseRows.length === 0 ? <EmptyState copy="No paid beat orders yet, so there are no placement signals." /> : null}
          </div>
        </Panel>
      ) : null}

      {activeTab === "messages" ? (
        <Panel title="Producer messages" description="Beat sales, payout changes, approvals, license updates, and admin notices.">
          <div className="grid gap-3">{producerNotifications.map((notification) => <article key={notification.id} className="surface-list-item p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{notification.title}</p><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{notification.body}</p><p className="mt-2 text-xs" style={{ color: "var(--text-soft)" }}>{new Date(notification.createdAt).toLocaleString("en-IN")}</p></div><StatusPill label={notification.readAt ? "Read" : "Unread"} active={!notification.readAt} /></div>{notification.href ? <a href={notification.href} className="btn-outline mt-3 inline-flex px-3 py-2 text-xs">{notification.actionLabel || "Open"}</a> : null}</article>)}{producerNotifications.length === 0 ? <EmptyState copy="No producer notifications yet." /> : null}</div>
        </Panel>
      ) : null}

      {activeTab === "settings" ? (
        <Panel title="Producer settings" description="Profile facts and storefront status. Admin-managed public producer profiles remain protected.">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="summary-card"><span>Name</span><span>{user.name}</span></div>
            <div className="summary-card"><span>Email</span><span>{user.email}</span></div>
            <div className="summary-card"><span>Role</span><span className="capitalize">{user.role}</span></div>
            <div className="summary-card"><span>Catalog visibility</span><span>{enabledBeats.length} enabled beats</span></div>
          </div>
        </Panel>
      ) : null}

      {activeTab === "earnings" ? (
        <Panel title="Producer earnings" description="Every paid beat sale is split server-side: 70% producer share and 30% HYMN commission.">
          {finance.totalSales > 0 ? <section className="grid gap-4 md:grid-cols-4"><StatCard label="Gross sales" value={formatMoney(finance.grossRevenue)} /><StatCard label="Your 70%" value={formatMoney(finance.producerEarnings)} /><StatCard label="HYMN 30%" value={formatMoney(finance.hymnCommission)} /><StatCard label="Sales" value={finance.totalSales} /></section> : <EmptyState copy="No beat sales yet. Earnings will appear after a verified purchase is credited." />}
        </Panel>
      ) : null}

      {activeTab === "payout" ? <Panel title="Producer payout" description="Producer sale balances use the existing secure payout request and quarterly processing system."><div className="grid gap-4 sm:grid-cols-3"><StatCard label="Available balance" value={formatMoney(finance.availableBalance)} /><StatCard label="Pending payout" value={formatMoney(finance.pendingPayout)} /><StatCard label="Lifetime paid" value={formatMoney(finance.lifetimePaid)} /></div><div className="mt-5 flex flex-wrap gap-3"><Link href="/payout" className="btn-primary pressable">Open payout dashboard</Link><button type="button" onClick={() => setActiveTab("ledger")} className="btn-outline pressable">View producer ledger</button></div>{!finance.payouts?.length ? <div className="mt-5"><EmptyState copy="No producer payout activity yet. Your available balance will appear after beat sales are credited." /></div> : null}</Panel> : null}

      {activeTab === "ledger" ? <Panel title="Producer wallet ledger" description="Immutable credits created from verified beat sales. Commission percentages cannot be edited here."><div className="grid gap-3">{finance.ledger?.map((entry: any) => <article key={entry.id} className="surface-list-item p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{entry.type.replace(/_/g, " ")}</p><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{entry.note || `Reference ${entry.referenceId}`}</p><p className="mt-2 text-xs" style={{ color: "var(--text-soft)" }}>{new Date(entry.createdAt).toLocaleString("en-IN")}</p></div><div className="text-right"><p className="font-semibold" style={{ color: "var(--success)" }}>+{formatMoney(Number(entry.amount))}</p><p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Balance {formatMoney(Number(entry.balanceAfter))}</p></div></div></article>)}{!finance.ledger?.length ? <EmptyState copy="No producer ledger entries yet. Verified beat sales will be credited automatically." /> : null}</div></Panel> : null}

      {activeTab === "sales" ? (
        <Panel title="Sales history" description="See every verified order and the license mix behind it.">
          <div className="grid gap-4">
            {orders.filter((order) => filteredLicenseRows.some((row) => row.order.id === order.id)).map((order) => (
              <article key={order.id} className="surface-list-item p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold" style={{ color: "var(--text)" }}>Order #{order.id}</p>
                  <StatusPill label={`Rs ${order.amount}`} />
                </div>
                <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>Buyer: {order.buyerName ?? `User #${order.userId}`}</p>
                <div className="mt-4 grid gap-2">
                  {order.items.filter((item) => matchesQuery([order.id, order.buyerName, order.buyerEmail, item.beatTitle, item.licenseType], dashboardSearch)).map((item, index) => {
                    const sale = finance.sales?.find((entry: any) => entry.orderId === order.id && entry.beatId === item.beatId && entry.licenseType === item.licenseType);
                    return <div key={`${order.id}-${item.beatId}-${index}`} className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                      <div className="flex flex-wrap items-center justify-between gap-2"><span>{item.beatTitle ?? `Beat #${item.beatId}`} · {item.licenseType}</span>{sale ? <span>Net {formatMoney(Number(sale.netSaleAmount))} · Producer {formatMoney(Number(sale.producerEarningAmount))} · HYMN {formatMoney(Number(sale.hymnCommissionAmount))}</span> : <span>Sale ledger pending</span>}</div>
                    </div>;
                  })}
                </div>
              </article>
            ))}
            {filteredLicenseRows.length === 0 ? <EmptyState copy="No producer sales match this search." /> : null}
          </div>
        </Panel>
      ) : null}
      <FloatingAssistant
        context="Producer support"
        suggestions={[
          { label: "Upload a beat", description: "Jump to the inventory upload workflow." },
          { label: "Check sales", description: "Review orders and catalog performance." },
          { label: "Open beatstore", description: "See the storefront experience like a buyer." }
        ]}
      />


      {editingBeat ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl">
            <h3 className="text-xl font-semibold mb-4" style={{ color: "var(--text)" }}>Edit Beat</h3>
            <form onSubmit={handleBeatEditSubmit} className="grid gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Title</label>
                <input name="title" defaultValue={editingBeat.title} required className="field" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Genre</label>
                  <input name="genre" defaultValue={editingBeat.genre} required className="field" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Mood</label>
                  <input name="mood" defaultValue={editingBeat.mood} required className="field" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium mb-1 block">BPM</label>
                  <input name="bpm" type="number" defaultValue={editingBeat.bpm} required className="field" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Key</label>
                  <input name="keySignature" defaultValue={editingBeat.keySignature} className="field" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">General Licence price (Rs)</label>
                  <input name="generalPrice" type="number" defaultValue={editingBeat.generalPrice ?? editingBeat.price} required className="field" />
                </div>
                <div><label className="text-sm font-medium mb-1 block">Exclusive Licence price (Rs)</label><input name="exclusivePrice" type="number" defaultValue={editingBeat.exclusivePrice} required className="field" /></div>
              </div>
              <div><label className="text-sm font-medium mb-1 block">Description</label><textarea name="description" defaultValue={editingBeat.description} className="field min-h-24" /></div>
              <div className="mt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setEditingBeat(null)} className="btn-outline pressable">Cancel</button>
                <button type="submit" className="btn-primary pressable">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deletingBeat ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl text-center">
            <h3 className="text-xl font-semibold mb-2" style={{ color: "var(--text)" }}>Delete Beat</h3>
            <p className="text-sm mb-6" style={{ color: "var(--text-soft)" }}>
              Are you sure you want to permanently delete "{deletingBeat.title}"? This cannot be undone.
            </p>
            <div className="flex flex-col gap-3">
              <button type="button" onClick={handleBeatDelete} className="btn-primary pressable bg-red-600 border-red-600 hover:bg-red-700 text-white">Yes, delete beat</button>
              <button type="button" onClick={() => setDeletingBeat(null)} className="btn-outline pressable">Cancel</button>
            </div>
          </div>
        </div>
      ) : null}

    </DashboardFrame>
  );
}






// vercel trigger

// vercel trigger 2

// vercel trigger 4

// vercel trigger 3
// vercel trigger 4
// vercel trigger 7

// vercel trigger 11
