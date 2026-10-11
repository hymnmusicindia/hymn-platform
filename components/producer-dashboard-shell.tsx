"use client";

import { customerMessage } from "@/lib/customer-message";

import Link from "next/link";
import { ProducerSetupGuide } from "@/components/producer-setup-guide";
import { producerSetup, producerSetupTab } from "@/lib/producer-setup";
import { WorkspaceGuidance, type GuideStep } from "@/components/workspace-guidance";
import dynamic from "next/dynamic";
import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { DashboardFrame } from "@/components/dashboard-frame";
import { BeatCard } from "@/components/beat-card";
import { Beat, BeatPurchase, Notification, Order, Release, SupportTicket, User } from "@/lib/types";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { CustomerHome, ProducerHome } from "@/components/simplified-dashboard-home";
import { FirstLoginReferralPrompt } from "@/components/first-login-referral-prompt";
import { WorkspaceRecords } from "@/components/workspace-records";
import { normalizeBeatLicenseType } from "@/lib/beat-store";

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
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent)" }}>Producer workspace</p>
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
  if (!Number.isFinite(amount)) return "Unavailable";
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
  return <div className="grid gap-6 xl:grid-cols-[0.75fr,1.25fr]">
    <Panel title="Your storefront preview" description="Give artists a clear first impression of your sound.">
      <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
        {profile?.coverPhotoUrl ? <img src={profile.coverPhotoUrl} alt="Producer cover" className="aspect-[16/7] w-full object-cover" /> : <div className="flex aspect-[16/7] items-center justify-center text-sm text-[var(--text-muted)]">Your cover image goes here</div>}
        <div className="p-5">{profile?.avatarUrl && <img src={profile.avatarUrl} alt="Producer profile" className="mb-3 h-16 w-16 rounded-full object-cover"/>}<h3 className="text-2xl font-semibold">{profile?.displayName || user.name}</h3><p className="mt-2 text-sm text-[var(--text-muted)]">{profile?.bio || "Your beats. Your identity."}</p></div>
      </div>
    </Panel>
    <Panel title="Set up your storefront" description="Three essentials to get started. You can refine everything later.">
      <form onSubmit={onSubmit} className="grid gap-5">
        <label className="grid gap-2 text-sm">Producer name<input name="displayName" required minLength={2} defaultValue={profile?.displayName || user.name} className="field" /><small className="text-[var(--text-muted)]">The name artists see beside your beats.</small></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm">Profile image<input name="avatar" required={!profile?.avatarUrl} type="file" accept="image/jpeg,image/png,image/webp" className="field"/><small className="text-[var(--text-muted)]">A square portrait or your producer logo.</small></label><label className="grid gap-2 text-sm">Cover image<input name="coverPhoto" required={!profile?.coverPhotoUrl} type="file" accept="image/jpeg,image/png,image/webp" className="field"/><small className="text-[var(--text-muted)]">A wide image that represents your sound.</small></label></div>
        <details className="rounded-xl border border-[var(--border)] p-4"><summary className="cursor-pointer text-sm font-semibold">Add more personality <span className="font-normal text-[var(--text-muted)]">(optional)</span></summary><div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm sm:col-span-2">Bio<textarea name="bio" defaultValue={profile?.bio || ""} className="field min-h-28"/></label><label className="grid gap-2 text-sm">Location<input name="location" defaultValue={profile?.location || ""} className="field"/></label><label className="grid gap-2 text-sm">Your sound<input name="producerTags" defaultValue={Array.isArray(profile?.tags) ? profile.tags.join(", ") : profile?.specialty || ""} className="field" placeholder="Hip-Hop, Trap, R&B"/></label>
          {[["instagramUrl","Instagram"],["youtubeUrl","YouTube"],["spotifyUrl","Spotify"],["websiteUrl","Website"]].map(([name,label])=><label key={name} className="grid gap-2 text-sm">{label}<input name={name} type="url" defaultValue={profile?.[name] || ""} className="field"/></label>)}
        </div></details>
        {feedback && <p role="status" className="text-sm text-[var(--text-muted)]">{customerMessage(feedback)}</p>}
        <button type="submit" disabled={pending} className="btn-primary pressable">{pending ? "Saving storefront..." : "Save storefront & continue"}</button>
      </form>
    </Panel>
  </div>;
}
export function ProducerDashboardShell({ user, beats, orders, earnings, finance }: { user: User; beats: Beat[]; orders: Order[]; earnings: { totalSales: number; totalRevenue: number; beatsSold: number }; finance: any }) {
  const [requestedTab, setActiveTab] = useState<"overview" | "profile" | "catalog" | "collaborations" | "placements" | "contracts" | "earnings" | "payout" | "ledger" | "upload" | "licensing" | "messages" | "analytics" | "settings" | "manage" | "sales">("overview");
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
  const setup = producerSetup(producerProfile, catalog);
  const activeTab = producerSetupTab(requestedTab, setup) as typeof requestedTab;
  const [producerNotifications, setProducerNotifications] = useState<Notification[]>([]);
  const enabledBeats = catalog.filter((beat) => beat.enabled);
  const disabledBeats = catalog.filter((beat) => !beat.enabled);
  const licenseRows = orders.filter(order=>order.paymentStatus === "paid").flatMap((order) => order.items.map((item) => ({ order, item })));
  const genres = Array.from(new Set(catalog.map((beat) => beat.genre).filter(Boolean))).sort();
  const filteredCatalog = useMemo(() => catalog.filter((beat) => {
    const matchesStatus = catalogStatusFilter === "all" || (catalogStatusFilter === "enabled" ? beat.enabled && beat.status === "PUBLISHED" : catalogStatusFilter === "disabled" ? !beat.enabled : beat.status === catalogStatusFilter);
    const matchesGenre = catalogGenreFilter === "all" || beat.genre === catalogGenreFilter;
    return matchesStatus && matchesGenre && matchesQuery([beat.title, beat.genre, beat.mood, beat.bpm, beat.price], dashboardSearch);
  }), [catalog, catalogGenreFilter, catalogStatusFilter, dashboardSearch]);
  const filteredLicenseRows = useMemo(() => licenseRows.filter(({ order, item }) => matchesQuery([order.id, order.buyerName, order.buyerEmail, order.paymentStatus, item.beatTitle, item.licenseType], dashboardSearch)), [dashboardSearch, licenseRows]);
  const licenseCounts = useMemo(() => {
    const counts: Record<string, number> = { mp3: 0, wav: 0, stems: 0, exclusive: 0 };
    filteredLicenseRows.forEach(({ item }) => { const type = normalizeBeatLicenseType(item.licenseType); counts[type] = (counts[type] ?? 0) + 1; });
    return counts;
  }, [filteredLicenseRows]);

  useEffect(() => {
    fetch("/api/notifications?limit=30", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => setProducerNotifications(Array.isArray(data?.notifications) ? data.notifications : [])).catch(() => undefined);
  }, []);

  useEffect(() => {
    const readTab = () => {
      const tab = new URLSearchParams(window.location.search).get("tab");
      const valid = ["overview", "profile", "catalog", "collaborations", "placements", "contracts", "earnings", "payout", "ledger", "upload", "licensing", "messages", "analytics", "settings", "manage", "sales"];
      setActiveTab(tab && valid.includes(tab) ? tab as typeof activeTab : "overview");
    };
    readTab();
    window.addEventListener("popstate", readTab);
    return () => window.removeEventListener("popstate", readTab);
  }, []);

  function selectProducerTab(tab: typeof activeTab) {
    const destination = producerSetupTab(tab, setup) as typeof requestedTab;
    setActiveTab(destination);
    setFeedback(null);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", destination);
    window.history.pushState({}, "", url);
  }

  function saveProducerProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    startTransition(async () => {
      setFeedback(null);
      try {
      const response = await fetch("/api/producer/profile", { method: "PATCH", body: new FormData(form) });
      const data = await response.json();
      if (!response.ok) return setFeedback(data.error || "Could not update producer profile.");
      setProducerProfile(data.profile);
      setFeedback("Producer profile saved.");
      if (!setup.complete && producerSetup(data.profile, catalog).storefrontReady) {
        if (producerSetup(data.profile, catalog).complete) window.location.assign("/producer/dashboard?tab=overview");
        else { setActiveTab("upload"); window.history.replaceState({}, "", "/producer/dashboard?tab=upload"); }
      }
      } catch { setFeedback("Could not save your storefront. Your form is still here; please retry."); }
    });
  }

  function handleBeatUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (beatUploadStep !== 5) return;
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
        if (!setup.complete && setup.storefrontReady) window.location.assign("/producer/dashboard?tab=overview");
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
    const targetBeat = editingBeat;
    const replacementArtwork = formData.get("artwork");
    const patch = {
      title: String(formData.get("title") || ""),
      bpm: Number(formData.get("bpm")),
      genre: String(formData.get("genre") || ""),
      mood: String(formData.get("mood") || ""),
      keySignature: String(formData.get("keySignature") || ""),
      generalPrice: Number(formData.get("generalPrice")),
      stemPrice: Number(formData.get("stemPrice")),
      exclusivePrice: Number(formData.get("exclusivePrice")),
      description: String(formData.get("description") || ""),
    };
    startTransition(async () => {
      try {
        const metadataResponse = await fetch(`/api/producer/beats/${targetBeat.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
        const metadataData = await metadataResponse.json().catch(() => ({}));
        if (!metadataResponse.ok) throw new Error(metadataData.error || "Could not update beat details.");
        let updatedBeat = metadataData.beat as Beat;
        setCatalog((items) => items.map((item) => item.id === targetBeat.id ? updatedBeat : item));
        if (replacementArtwork instanceof File && replacementArtwork.size > 0) {
          const artworkForm = new FormData();
          artworkForm.set("artwork", replacementArtwork);
          const artworkResponse = await fetch(`/api/producer/beats/${targetBeat.id}/artwork`, { method: "PATCH", body: artworkForm });
          const artworkData = await artworkResponse.json().catch(() => ({}));
          if (!artworkResponse.ok) throw new Error(artworkData.error || "Beat details were saved, but the cover could not be replaced.");
          updatedBeat = artworkData.beat as Beat;
        }
        setCatalog((items) => items.map((item) => item.id === targetBeat.id ? updatedBeat : item));
        setEditingBeat(null);
        setFeedback(replacementArtwork instanceof File && replacementArtwork.size > 0 ? `Beat and cover updated: ${updatedBeat.title}. The previous cover was permanently deleted.` : `Beat updated: ${updatedBeat.title}`);
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Could not update beat.");
      }
    });
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

  const guideBeat = catalog.find(beat => ["DRAFT", "CHANGES_REQUESTED"].includes(beat.status || "")) ?? catalog[0];
  const guidePublished = guideBeat?.status === "PUBLISHED";
  const guideListed = guidePublished && !!guideBeat?.enabled;
  const guideSubmitted = !!guideBeat && !["DRAFT", "CHANGES_REQUESTED"].includes(guideBeat.status || "DRAFT");
  const beatGuide: GuideStep[] = [
    {label:"Upload",href:"/producer/dashboard?tab=upload",state:guideSubmitted ? "done" : "current",hint:"Audio, artwork, pricing"},
    {label:"Review",href:"/producer/dashboard?tab=catalog",state:guidePublished ? "done" : guideSubmitted ? "current" : "next",hint:"Check feedback"},
    {label:"Publish",href:"/producer/dashboard?tab=catalog",state:guideListed ? "done" : guidePublished ? "current" : "next",hint:guidePublished ? "Manage store visibility" : "After HYMN approval"},
    {label:"Earn",href:"/producer/dashboard?tab=earnings",state:guideListed ? "current" : "next",hint:"Sales, shares, payouts"}
  ];

  return (
    <DashboardFrame
      eyebrow="Producer dashboard"
      title={user.name}
      subtitle={user.email}
      navItems={setup.complete ? [
        {key:"overview",label:"Overview",group:"Workspace"},
        {key:"catalog",label:"My beats",description:"Inventory, pricing and review status",group:"Beatstore"},
        {key:"upload",label:"Upload beat",group:"Beatstore"},
        {key:"profile",label:"My storefront",group:"Beatstore"},
        {key:"sales",label:"Sales & licences",group:"Business"},
        {key:"earnings",label:"Earnings & payouts",group:"Business"},
        {key:"analytics",label:"Performance",group:"Business"},
        {key:"collaborations",label:"Credited tracks",group:"Business"},
        {key:"releases",label:"My releases",group:"Distribution",href:"/dashboard/releases"},
        {key:"new-release",label:"Add release",group:"Distribution",href:"/distribution/start"},
        {key:"splits",label:"Royalty splits",group:"Distribution",href:"/dashboard?tab=collaborators"},
        {key:"studio",label:"Find an engineer",group:"Mixing / Mastering",href:"/studio"},
        {key:"studio-orders",label:"My projects",group:"Mixing / Mastering",href:"/dashboard/studio"},
        {key:"messages",label:"Notifications",group:"Account"},
        {key:"settings",label:"Settings",group:"Account"},
        {key:"help",label:"Help & support",group:"Support",href:"/dashboard?tab=support"},
      ] : [
        {key:"overview",label:"Launch your store",group:"Workspace"},
        {key:"profile",label:"Set up storefront",group:"Beatstore"},
        ...(setup.storefrontReady ? [{key:"upload",label:"Upload first beat",group:"Beatstore"}] : []),
        {key:"catalog",label:"My beats",group:"Beatstore"},
        {key:"messages",label:"Notifications",group:"Account"},
        {key:"settings",label:"Settings",group:"Account"},
        {key:"help",label:"Help & support",group:"Support",href:"/dashboard?tab=support"},
      ]}
      activeKey={activeTab === "licensing" || activeTab === "contracts" ? "sales" : activeTab === "ledger" || activeTab === "payout" ? "earnings" : activeTab}
      onSelect={selectProducerTab}
      newAction={{label:setup.complete ? "Upload beat" : setup.storefrontReady ? "Upload first beat" : "Set up storefront",onClick:()=>selectProducerTab(setup.storefrontReady ? "upload" : "profile")}}
      searchValue={dashboardSearch}
      onSearchChange={setDashboardSearch}
      searchPlaceholder={activeTab === "catalog" ? "Search beats, genre, mood, BPM..." : activeTab === "licensing" || activeTab === "sales" ? "Search buyers, orders, licenses..." : "Search catalog and sales..."}
      workspaceAction={<WorkspaceSwitcher current="producer" available={user.role === "admin" ? ["customer", "producer", "admin"] : ["customer", "producer"]} />}
      onNotificationsClick={() => selectProducerTab("messages")}
      notificationCount={producerNotifications.filter((notification) => !notification.readAt).length}
      setupMode={!setup.complete}
      compactOverview
    >
      {setup.complete && <FirstLoginReferralPrompt />}
      {!setup.complete && activeTab !== "overview" && <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-4"><div><strong>Launch your store</strong><p className="text-xs text-[var(--text-muted)]">{setup.completedSteps}/2 complete - Storefront, then first beat</p></div><button className="btn-outline" onClick={() => selectProducerTab("overview")}>View setup guide</button></div>}
      {setup.complete && ["overview", "catalog", "upload"].includes(activeTab) && <WorkspaceGuidance title={guideBeat ? `Beat path: ${guideBeat.title}` : "Build your first beat listing"} steps={beatGuide}/>}
      {activeTab === "overview" && !setup.complete ? <ProducerSetupGuide setup={setup} profile={producerProfile} name={user.name} onTab={selectProducerTab}/> : null}
      {activeTab === "overview" && setup.complete ? <ProducerHome user={user} beats={catalog} finance={{ ...finance, profile: producerProfile }} notifications={producerNotifications} onTab={(tab) => selectProducerTab(tab)} /> : null}
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
              <button type="button" onClick={() => selectProducerTab("upload")} className="btn-primary pressable">Upload Beat</button>
              <button type="button" onClick={() => selectProducerTab("catalog")} className="btn-outline pressable">Manage Catalog</button>
              <button type="button" onClick={() => selectProducerTab("licensing")} className="btn-outline pressable">Licensing</button>
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
            <fieldset hidden={beatUploadStep !== 4} className="grid gap-4 sm:grid-cols-2"><legend className="mb-4 text-xl font-semibold">Pricing & licences</legend><div className="rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2 text-sm"><span className="block font-medium">MP3 Licence</span><span className="text-xs text-[var(--text-soft)]">Fixed HYMN standard: ₹120 · General · No Content ID</span></div><label className="text-sm font-medium">WAV Licence price<input name="generalPrice" required type="number" min="1" className="field mt-2" placeholder="₹500" /></label><label className="text-sm font-medium">Stem Files Licence price<input name="stemPrice" required type="number" min="1" className="field mt-2" placeholder="₹999" /></label><label className="text-sm font-medium">Stems Exclusive Licence price<input name="exclusivePrice" required type="number" min="2" className="field mt-2" placeholder="₹5000" /></label><input name="price" type="hidden" value="120" /><p className="sm:col-span-2 text-xs text-[var(--text-soft)]">MP3 is fixed at ₹120. WAV, Stem Files, and Stems Exclusive prices can be changed. General licences do not include Content ID; Stems Exclusive includes WAV and Content ID.</p></fieldset>
            <fieldset hidden={beatUploadStep !== 5} className="grid gap-3"><legend className="mb-4 text-xl font-semibold">Review</legend><div className="rounded-2xl border p-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><p className="font-semibold">Ready to submit for HYMN review</p><p className="mt-2 text-[var(--text-muted)]">We will validate the audio, artwork, metadata, prices, and sample declaration. The beat is not public until approved.</p></div></fieldset>
            <div className="flex items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--border)" }}><button type="button" className="btn-outline" disabled={beatUploadStep === 1 || isPending} onClick={() => setBeatUploadStep((step) => Math.max(1, step - 1))}>Back</button>{beatUploadStep < 5 ? <button type="button" className="btn-primary" onClick={(event) => { event.preventDefault(); const current = event.currentTarget.form?.querySelector<HTMLFieldSetElement>(`fieldset:not([hidden])`); const invalid = current ? Array.from(current.elements).find((element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement => "checkValidity" in element && !(element as HTMLInputElement).checkValidity()) : null; if (invalid) return invalid.reportValidity(); setBeatUploadStep((step) => Math.min(5, step + 1)); }}>Continue</button> : <button type="submit" disabled={isPending} className="btn-primary pressable">{isPending ? "Uploading..." : "Submit for review"}</button>}</div>
            {feedback ? <p className="text-sm" style={{ color: "var(--text)" }}>{customerMessage(feedback)}</p> : null}
          </form>
        </Panel>
      ) : null}
      {(activeTab === "manage" || activeTab === "catalog") ? (
        <Panel title="Manage beats" description="Enable, disable, and price your catalog without desktop-only controls.">
          <div className="mb-5 grid gap-3 md:grid-cols-[0.8fr,0.8fr,1fr]">
            <select className="field" value={catalogStatusFilter} onChange={(event) => setCatalogStatusFilter(event.target.value)}>
              <option value="all">All status</option>
              <option value="enabled">Published in store</option><option value="PENDING_REVIEW">Awaiting review</option><option value="CHANGES_REQUESTED">Corrections required</option><option value="DRAFT">Draft</option>
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
          <WorkspaceRecords searchable={false} rows={filteredCatalog} rowKey={beat=>beat.id} noun="beats" searchText={beat=>`${beat.title} ${beat.genre} ${beat.bpm} ${beat.status}`} searchPlaceholder="Search catalogue" columns={[
            {key:"beat",label:"Beat",primary:true,value:beat=>beat.title,render:beat=><div className="record-identity">{beat.artworkUrl?<img src={beat.artworkUrl} alt=""/>:<span className="record-art"/>}<div><strong>{beat.title}</strong><small>{beat.genre} / {beat.bpm} BPM</small>{beat.reviewIssues?.reason&&<small style={{color:"var(--danger)"}}>{beat.reviewIssues.reason}</small>}</div></div>},
            {key:"status",label:"Review",value:beat=>beat.status||"",render:beat=><StatusPill label={beat.status||"DRAFT"}/>},
            {key:"price",label:"Starting price",value:beat=>beat.price,render:beat=>formatMoney(beat.generalPrice??beat.price)},
            {key:"listed",label:"Visibility",render:beat=>beat.enabled&&beat.status==="PUBLISHED"?"Published":"Not listed"},
            {key:"actions",label:"Manage",render:beat=><div className="record-actions">{beat.previewUrl||beat.fileUrl?<a href={beat.previewUrl||beat.fileUrl} target="_blank" rel="noreferrer" className="btn-outline">Listen</a>:null}<button onClick={()=>setEditingBeat(beat)} className="btn-outline">Edit</button><button disabled={isPending||(!beat.enabled&&beat.status!=="PUBLISHED")} onClick={()=>handleBeatUpdate(beat,{enabled:!beat.enabled})} className="btn-outline">{beat.enabled?"Unlist":"Publish"}</button><button disabled={isPending} className="btn-outline" onClick={()=>setDeletingBeat(beat)}>Delete</button></div>}
          ]}/>
        </Panel>
      ) : null}

      {activeTab === "analytics" ? <Panel title="Catalogue performance" description="Paid Beat Store orders, grouped by beat. Streaming reports are available separately in Trends.">
        <div className="user-workspace-summary"><StatCard label="Paid licences" value={licenseRows.length}/><StatCard label="Recorded sales" value={formatMoney(licenseRows.reduce((sum,row)=>sum+row.item.price,0))}/><StatCard label="Published beats" value={catalog.filter(beat=>beat.enabled&&beat.status==="PUBLISHED").length}/><StatCard label="Beats with sales" value={catalog.filter(beat=>licenseRows.some(row=>row.item.beatId===beat.id)).length}/></div>
        <WorkspaceRecords searchable={false} externalSearch={dashboardSearch} rows={catalog.map(beat=>{const sales=licenseRows.filter(row=>row.item.beatId===beat.id);return {beat,count:sales.length,total:sales.reduce((sum,row)=>sum+row.item.price,0)};})} rowKey={row=>row.beat.id} searchText={row=>`${row.beat.title} ${row.beat.genre}`} noun="beats" initialSort="revenue" columns={[
          {key:"beat",label:"Beat",primary:true,value:row=>row.beat.title,render:row=><><strong>{row.beat.title}</strong><small>{row.beat.genre}</small></>},
          {key:"sales",label:"Paid licences",value:row=>row.count,render:row=><div className="performance-bar"><span style={{width:`${licenseRows.length?row.count/licenseRows.length*100:0}%`}}/><strong>{row.count}</strong></div>},
          {key:"revenue",label:"Recorded sales",value:row=>row.total,render:row=>formatMoney(row.total)},
          {key:"status",label:"Review",render:row=><StatusPill label={row.beat.status||"DRAFT"}/>}
        ]}/>
      </Panel>:null}

      {activeTab === "contracts" || activeTab === "licensing" ? <Panel title="Licences & agreements" description="Verified sales, licence tiers, and the documents attached to each purchase."><WorkspaceRecords searchable={false} rows={filteredLicenseRows} rowKey={row=>`${row.order.id}-${row.item.beatId}-${row.item.licenseType}`} searchText={row=>`${row.order.id} ${row.item.beatTitle} ${row.item.licenseType} ${row.order.buyerEmail}`} noun="licences" columns={[
        {key:"beat",label:"Beat",primary:true,value:row=>row.item.beatTitle||"",render:row=><><strong>{row.item.beatTitle||`Beat #${row.item.beatId}`}</strong><small>Order #{row.order.id}</small></>},
        {key:"tier",label:"Licence",value:row=>row.item.licenseType,render:row=><StatusPill label={row.item.licenseType}/>},
        {key:"buyer",label:"Buyer",render:row=>row.order.buyerName||row.order.buyerEmail||`User #${row.order.userId}`},
        {key:"document",label:"Agreement",render:row=>row.item.licenseUrl?<a className="btn-outline" href={row.item.licenseUrl}>Open document</a>:<span>Not available</span>}
      ]}/></Panel>:null}

      {(activeTab === "placements" || activeTab === "collaborations") ? (
        <Panel title={activeTab === "placements" ? "Placement opportunities" : "Collaborations"} description={activeTab === "collaborations" ? "Tracks connected to your canonical contributor identity, independent of Beat Store sales and payout setup." : "Uses paid beat orders and buyers as practical collaboration signals."}>
          <div className="grid gap-3">
            {activeTab === "collaborations" ? (finance.creditedTracks ?? []).map((credit: any) => <article key={`credit-${credit.id}`} className="surface-list-item p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold" style={{ color: "var(--text)" }}>{credit.trackTitle}</p><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{credit.releaseTitle} · {credit.artistName} · credited as {String(credit.role).replaceAll("_", " ")}</p></div><StatusPill label={credit.releaseStatus} active /></div></article>) : filteredLicenseRows.map(({ order, item }, index) => (
              <article key={`placement-${order.id}-${index}`} className="surface-list-item p-4">
                <p className="font-semibold" style={{ color: "var(--text)" }}>{item.beatTitle ?? `Beat #${item.beatId}`}</p>
                <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Buyer: {order.buyerEmail ?? order.buyerName ?? `User #${order.userId}`} / {item.licenseType}</p>
              </article>
            ))}
            {activeTab === "collaborations" && !(finance.creditedTracks ?? []).length ? <EmptyState copy="No tracks are linked to your contributor identity yet." /> : null}
            {activeTab === "placements" && filteredLicenseRows.length === 0 ? <EmptyState copy="No paid beat orders yet, so there are no placement signals." /> : null}
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

      {activeTab === "earnings" || activeTab === "payout" ? <Panel title="Earnings & payouts" description="Your recorded producer share, available balance, and withdrawals."><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Your sale earnings" value={formatMoney(finance.producerEarnings)}/><StatCard label="Available to withdraw" value={formatMoney(finance.availableBalance)}/><StatCard label="Payouts pending" value={formatMoney(finance.pendingPayout)}/><StatCard label="Paid to date" value={formatMoney(finance.lifetimePaid)}/></div><div className="workspace-money-summary"><div><h3>Revenue share</h3><div className="workspace-share-bar" aria-label="Producer 70%, HYMN 30%"><span style={{width:"70%"}}>Your share 70%</span><span>HYMN 30%</span></div><p>Gross recorded sales {formatMoney(finance.grossRevenue)}. The ledger records the actual share credited for each sale.</p></div><div><h3>Withdraw your earnings</h3><p>Review payout eligibility, payment details, and withdrawal requests in your payout workspace.</p><Link className="btn-primary" href="/payout">Open payouts</Link><button className="btn-outline" onClick={()=>selectProducerTab("ledger")}>Wallet history</button></div></div></Panel>:null}

      {["ledger", "earnings", "payout"].includes(activeTab) ? <Panel title="Wallet ledger" description="Recorded producer credits and balance movements."><WorkspaceRecords searchable={false} externalSearch={dashboardSearch} rows={(finance.ledger||[]) as Array<{id:number;type:string;note?:string;referenceId?:string;amount:number;balanceAfter:number;createdAt:string}>} rowKey={entry=>entry.id} searchText={entry=>`${entry.type} ${entry.note} ${entry.referenceId}`} noun="entries" initialSort="date" columns={[
        {key:"type",label:"Movement",primary:true,render:entry=><><strong>{entry.type.replaceAll("_"," ")}</strong><small>{entry.note||entry.referenceId}</small></>},
        {key:"amount",label:"Amount",value:entry=>Number(entry.amount),render:entry=>formatMoney(Number(entry.amount))},
        {key:"balance",label:"Balance after",render:entry=>formatMoney(Number(entry.balanceAfter))},
        {key:"date",label:"Recorded",value:entry=>Date.parse(entry.createdAt),render:entry=>new Date(entry.createdAt).toLocaleString("en-IN")}
      ]}/></Panel>:null}

      {activeTab === "sales" ? <Panel title="Sales & licences" description="One row per verified sale. Your share comes from the recorded ledger."><WorkspaceRecords searchable={false} rows={filteredLicenseRows} rowKey={row=>`${row.order.id}-${row.item.beatId}-${row.item.licenseType}`} searchText={row=>`${row.order.id} ${row.item.beatTitle} ${row.order.buyerEmail} ${row.item.licenseType}`} noun="sales" initialSort="date" columns={[
        {key:"beat",label:"Sale",primary:true,value:row=>row.item.beatTitle||"",render:row=><><strong>{row.item.beatTitle||`Beat #${row.item.beatId}`}</strong><small>Order #{row.order.id} / {row.item.licenseType}</small></>},
        {key:"buyer",label:"Buyer",render:row=>row.order.buyerName||row.order.buyerEmail||`User #${row.order.userId}`},
        {key:"gross",label:"Item price",value:row=>row.item.price,render:row=>formatMoney(row.item.price)},
        {key:"agreement",label:"Licence document",render:row=>row.item.licenseUrl?<a className="btn-outline" href={row.item.licenseUrl}>Open licence</a>:"Document pending"},
        {key:"share",label:"Your recorded share",render:row=>{const sale=finance.sales?.find((entry:any)=>entry.orderId===row.order.id&&entry.beatId===row.item.beatId&&entry.licenseType===row.item.licenseType);return sale?formatMoney(Number(sale.producerEarningAmount)):"Ledger pending";}},
        {key:"date",label:"Date",value:row=>Date.parse(row.order.createdAt),render:row=>new Date(row.order.createdAt).toLocaleDateString("en-IN")}
      ]}/></Panel>:null}

      {editingBeat ? (
        <div role="dialog" aria-modal="true" aria-label="Edit beat" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
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
                  <label className="text-sm font-medium mb-1 block">WAV Licence price (Rs)</label>
                  <input name="generalPrice" type="number" defaultValue={editingBeat.generalPrice ?? editingBeat.price} required className="field" />
                </div>
                <div><label className="text-sm font-medium mb-1 block">Stem Files Licence price (Rs)</label><input name="stemPrice" type="number" defaultValue={editingBeat.stemPrice ?? editingBeat.generalPrice ?? editingBeat.price} required className="field" /></div>
                <div><label className="text-sm font-medium mb-1 block">Stems Exclusive Licence price (Rs)</label><input name="exclusivePrice" type="number" defaultValue={editingBeat.exclusivePrice} required className="field" /></div>
              </div>
              <div><label className="text-sm font-medium mb-1 block">Description</label><textarea name="description" defaultValue={editingBeat.description} className="field min-h-24" /></div>
              <label className="grid gap-2 text-sm"><span className="font-medium">Replace cover artwork <span style={{ color: "var(--text-soft)" }}>(optional)</span></span><input name="artwork" type="file" accept="image/jpeg,image/png,image/webp" className="field" /><span className="text-xs leading-5" style={{ color: "var(--text-soft)" }}>JPEG, PNG, or WebP up to 10 MB. After a successful replacement, the previous cover is permanently deleted from storage with no backup.</span></label>
              <div className="mt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setEditingBeat(null)} className="btn-outline pressable">Cancel</button>
                <button type="submit" disabled={isPending} className="btn-primary pressable disabled:opacity-50">{isPending ? "Saving…" : "Save Changes"}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deletingBeat ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl text-center">
            <h3 className="text-xl font-semibold mb-2" style={{ color: "var(--text)" }}>Remove beat?</h3>
            <p className="text-sm mb-6" style={{ color: "var(--text-soft)" }}>
              “{deletingBeat.title}” will be permanently deleted when it has no sales history. If licences or sales exist, it will be archived and removed from sale while those records remain available.
            </p>
            <div className="flex flex-col gap-3">
              <button type="button" disabled={isPending} onClick={handleBeatDelete} className="btn-primary pressable bg-red-600 border-red-600 hover:bg-red-700 text-white disabled:opacity-60">{isPending ? "Removing…" : "Remove beat"}</button>
              <button type="button" disabled={isPending} onClick={() => setDeletingBeat(null)} className="btn-outline pressable disabled:opacity-60">Cancel</button>
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
