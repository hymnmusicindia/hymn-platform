"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";
import { AdminContentManager } from "@/components/admin-content-manager";
import { AdminTimedPlaylistManager } from "@/components/admin-timed-playlist-manager";
import { AdminActivityAndLogs } from "@/components/admin-activity-and-logs";
import { AdminUserBenefits } from "@/components/admin-user-benefits";
import { DashboardFrame } from "@/components/dashboard-frame";
import { DireNoteDiagnostics } from "@/components/direnote-diagnostics";
import type { AdminPayoutRequest } from "@/lib/payout";
import type { AdminPermissionKey } from "@/lib/access";
import type { AdminStoreStatus, ArtistProfile, Beat, DistributionOrder, Notification, Order, PartnershipLead, ProducerApplication, ProducerProfile, Release, SiteSettings, StoreStatus, StoreStatusHistoryEntry, SupportTicket, User, UserRole } from "@/lib/types";

type PersistedAdminTask = { id: number; type: string; priority: string; title: string; body: string; href: string; status: string; createdAt: string };

function formatMoney(amount: number) {
  return `Rs ${amount.toLocaleString("en-IN")}`;
}

function StatCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="metric-card admin-stat-card fade-up h-full">
      <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-soft)" }}>{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>{value}</p>
      {detail ? <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{detail}</p> : null}
    </div>
  );
}

function StatusPill({ label, active = true }: { label: string; active?: boolean }) {
  const normalized = label.toLowerCase().replace(/_/g, " ");
  const negative = /failed|rejected|denied|critical|missing|issue/.test(normalized);
  const warning = /pending|review|scheduled|requested|waiting|processing/.test(normalized);
  return <span className={`status-pill ${active ? "status-pill-active" : ""} ${negative ? "admin-status-negative" : warning ? "admin-status-warning" : ""}`}>{normalized}</span>;
}

function SurfaceSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="surface-card admin-module-section fade-up p-5 sm:p-6 lg:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-5" style={{ borderColor: "var(--border)" }}>
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent)" }}>Admin workspace</p>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl" style={{ color: "var(--text)" }}>{title}</h2>
          {description ? <p className="mt-2 max-w-3xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>{description}</p> : null}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function EmptyState({ copy }: { copy: string }) {
  return <div className="rounded-2xl border border-dashed px-5 py-8 text-center text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text-soft)" }}>{copy}</div>;
}

function adminReleaseTitle(release: Release) {
  return release.releaseTitle || release.trackName || `Release #${release.id}`;
}

const STORE_STATUS_OPTIONS: StoreStatus[] = ["Live", "In Review", "Pending", "Denied", "Not Available", "Content ID Enabled", "Content ID Denied", "Takedown Requested", "Paused", "Removed"];
const STORE_DENIAL_REASONS = ["Metadata mismatch", "Artwork issue", "Audio quality issue", "Rights / ownership issue", "Explicit content issue", "Artist profile mismatch", "Duplicate release", "Store policy issue", "Content ID conflict", "Territory restriction", "Other"];

function AdminStoreStatusEditor({ release }: { release: Release }) {
  const [saved, setSaved] = useState<AdminStoreStatus[]>([]);
  const [drafts, setDrafts] = useState<AdminStoreStatus[]>([]);
  const [history, setHistory] = useState<StoreStatusHistoryEntry[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/admin/releases/${release.id}/store-statuses`).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load store statuses.");
      if (!active) return;
      const incoming = (data.stores ?? []) as AdminStoreStatus[];
      const byPlatform = new Map<string, AdminStoreStatus>(incoming.map((store) => [store.platform, store]));
      const rows: AdminStoreStatus[] = Array.from(new Set([...(release.platforms ?? []), ...Array.from(byPlatform.keys())])).map((platform) => byPlatform.get(platform) ?? { platform, status: "Pending" });
      setSaved(rows); setDrafts(rows); setHistory(data.history ?? []); setFeedback(null);
    }).catch((error) => active && setFeedback(error.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [release.id, release.platforms]);

  const changed = drafts.filter((row) => JSON.stringify(row) !== JSON.stringify(saved.find((item) => item.platform === row.platform)));
  function update(platform: string, patch: Partial<AdminStoreStatus>) { setDrafts((rows) => rows.map((row) => row.platform === platform ? { ...row, ...patch } : row)); }
  async function save() {
    const invalid = changed.find((row) => (row.status === "Denied" || row.status === "Content ID Denied") && !row.reason);
    if (invalid) { setFeedback(`Select a denial reason for ${invalid.platform}.`); return; }
    setSaving(true); setFeedback(null);
    try {
      const response = await fetch(`/api/admin/releases/${release.id}/store-statuses`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stores: changed }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save store statuses.");
      setSaved(data.stores); setDrafts(data.stores); setHistory(data.history); setFeedback("Store statuses saved. One summary notification was created.");
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Could not save store statuses."); }
    finally { setSaving(false); }
  }

  return <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold" style={{ color: "var(--text)" }}>Store &amp; Platform Status</p><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Manage user-visible delivery states and private operations notes.</p></div>{changed.length ? <span className="status-pill">{changed.length} unsaved</span> : null}</div>
    {loading ? <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>Loading store statuses…</p> : drafts.length ? <div className="mt-4 grid gap-3">{drafts.map((row) => <div key={row.platform} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
      <div className="grid gap-3 xl:grid-cols-[180px,180px,1fr,1fr]"><div><p className="font-semibold">{row.platform}</p><p className="mt-1 text-xs" style={{ color: "var(--text-soft)" }}>Current: {saved.find((item) => item.platform === row.platform)?.status ?? "Not set"}</p></div><select className="field" value={row.status} onChange={(event) => update(row.platform, { status: event.target.value as StoreStatus, reason: event.target.value.includes("Denied") ? row.reason : null })}>{STORE_STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}</select><input className="field" value={row.userFacingNote ?? ""} onChange={(event) => update(row.platform, { userFacingNote: event.target.value })} placeholder="User-facing note" /><input className="field" value={row.internalNote ?? ""} onChange={(event) => update(row.platform, { internalNote: event.target.value })} placeholder="Internal admin note" /></div>
      {row.status === "Denied" || row.status === "Content ID Denied" ? <div className="mt-3 grid gap-3 sm:grid-cols-2"><select className="field" value={row.reason ?? ""} onChange={(event) => update(row.platform, { reason: event.target.value })}><option value="">Select required denial reason</option>{STORE_DENIAL_REASONS.map((reason) => <option key={reason}>{reason}</option>)}</select>{row.reason === "Other" ? <input className="field" placeholder="Explain in the user-facing note" value={row.userFacingNote ?? ""} onChange={(event) => update(row.platform, { userFacingNote: event.target.value })} /> : null}</div> : null}
    </div>)}</div> : <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>No platforms were selected for this release.</p>}
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={!changed.length || saving} onClick={save} className="btn-primary pressable">{saving ? "Saving…" : "Save Store Statuses"}</button><button type="button" disabled={!changed.length || saving} onClick={() => { setDrafts(saved); setFeedback(null); }} className="btn-outline pressable">Reset Changes</button></div>{feedback ? <p className="mt-3 text-sm" style={{ color: feedback.includes("saved") ? "var(--success)" : "var(--danger)" }}>{feedback}</p> : null}
    <details className="mt-5 rounded-xl border p-4" style={{ borderColor: "var(--border)" }}><summary className="cursor-pointer font-semibold">Store Status History ({history.length})</summary><div className="mt-4 grid gap-2">{history.map((item) => <div key={item.id} className="summary-card"><span>{new Date(item.updatedAt || "").toLocaleString()} · {item.platform}<br /><small>{item.updatedByLabel || "Admin"}{item.reason ? ` · ${item.reason}` : ""}</small></span><span>{item.oldStatus || "Not set"} → {item.status}</span></div>)}{!history.length ? <p className="text-sm" style={{ color: "var(--text-muted)" }}>No status changes recorded yet.</p> : null}</div></details>
  </div>;
}

const REVIEW_ISSUE_TYPES = [
  ["metadata", "Metadata issue"], ["artwork", "Artwork issue"], ["audio", "Audio issue"], ["rights_ownership", "Rights / ownership issue"],
  ["contributor_credits", "Contributor / credits issue"], ["release_date", "Release date issue"], ["genre_language", "Genre / language issue"],
  ["artist_profile", "Artist profile issue"], ["license_ai_proof", "License / AI proof issue"], ["platform_destination", "Platform / destination issue"], ["other", "Other"]
] as const;
const METADATA_REVIEW_FIELDS = ["Release title", "Track title", "Artist name", "Primary artist links", "Spotify artist URL", "Apple Music artist URL", "Instagram URL", "Genre", "Subgenre", "Mood", "Language", "Track title language", "Label name", "C Line", "P Line", "Release date", "Original release date", "UPC", "ISRC", "Explicit lyrics flag", "Lyrics", "Songwriters", "Composers", "Producers", "Featuring artists", "Content type", "AI proof / Suno receipt", "License receipt", "Artwork", "Audio file", "Platform destinations", "Other metadata"];
function reviewFieldKey(label: string) { return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }

function AdminEarningsEntry({ users, releases }: { users: User[]; releases: Release[] }) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedReleaseId, setSelectedReleaseId] = useState("");
  const [grossEarning, setGrossEarning] = useState("");
  const [distributorDeduction, setDistributorDeduction] = useState("");
  const [hymnCommission, setHymnCommission] = useState("");
  const [artistNetPayable, setArtistNetPayable] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [statementFile, setStatementFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<{ matched: unknown[]; unmatched: unknown[] } | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredReleases = useMemo(() => {
    const userId = Number(selectedUserId);
    return Number.isInteger(userId) ? releases.filter((release) => release.userId === userId) : [];
  }, [releases, selectedUserId]);

  const selectedRelease = filteredReleases.find((release) => String(release.id) === selectedReleaseId) ?? null;
  const suggestedNet = Math.max(0, (Number(grossEarning) || 0) - (Number(distributorDeduction) || 0) - (Number(hymnCommission) || 0));
  const years = Array.from({ length: 8 }, (_, index) => new Date().getFullYear() - index);

  function handleUserChange(value: string) {
    setSelectedUserId(value);
    setSelectedReleaseId("");
    setFeedback(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setFeedback(null);

    startTransition(async () => {
      const response = await fetch("/api/admin/earnings-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          releaseId: selectedReleaseId,
          statementMonth: formData.get("statementMonth"),
          statementYear: formData.get("statementYear"),
          platform: formData.get("platform"),
          territory: formData.get("territory"),
          grossEarning,
          distributorDeduction,
          hymnCommission,
          artistNetPayable,
          streamsDownloads: formData.get("streamsDownloads"),
          sourceReference: formData.get("sourceReference"),
          adminNote: formData.get("adminNote")
        })
      });
      const data = await response.json();
      if (!response.ok) {
        setFeedback(data.error || "Could not save earnings entry.");
        return;
      }
      setFeedback(`Earnings saved for ${data.entry.releaseName}. The user's Payout dashboard is updated.`);
      form.reset();
      setGrossEarning("");
      setDistributorDeduction("");
      setHymnCommission("");
      setArtistNetPayable("");
    });
  }

  async function importStatement(confirm: boolean) {
    if (!statementFile) return setFeedback("Choose a CSV or XLSX statement first.");
    const payload = new FormData(); payload.set("file", statementFile); payload.set("confirm", String(confirm));
    const response = await fetch("/api/admin/royalties/import", { method: "POST", body: payload }); const result = await response.json();
    if (!response.ok) return setFeedback(result.error || "Could not import statement.");
    if (!confirm) { setImportPreview({ matched: result.matched || [], unmatched: result.unmatched || [] }); setFeedback(`Preview ready: ${result.matched?.length || 0} matched, ${result.unmatched?.length || 0} unmatched. Confirm only after reviewing.`); }
    else { setFeedback(`${result.imported} royalty rows imported and split calculations applied.`); setImportPreview(null); setStatementFile(null); }
  }

  return (
    <SurfaceSection title="Earnings Entry" description="Select a user, choose one of their releases, then enter verified release payout data. Earnings may take around 1.5 months to reflect. Withdrawal payout takes 24-48 hours after approval.">
      <div className="grid gap-5">
        <div className="rounded-[1.5rem] border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
          <div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="font-semibold">Statement import and financial export</h3><p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>CSV/XLSX rows match by ISRC first, then UPC. Preview is mandatory before credit.</p></div><a href="/api/admin/royalties/export" className="btn-outline pressable px-3 py-2 text-sm">Export Excel workbook</a></div>
          <div className="mt-4 flex flex-wrap items-center gap-3"><input type="file" accept=".csv,.xlsx" className="field max-w-md" onChange={(event) => { setStatementFile(event.target.files?.[0] || null); setImportPreview(null); }} /><button type="button" className="btn-outline" onClick={() => importStatement(false)}>Preview import</button>{importPreview ? <button type="button" className="btn-primary" onClick={() => importStatement(true)}>Confirm {importPreview.matched.length} matched rows</button> : null}</div>
          {importPreview?.unmatched.length ? <p className="mt-3 text-sm" style={{ color: "var(--warning)" }}>{importPreview.unmatched.length} unmatched rows will remain uncredited for manual review.</p> : null}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
            Select User / Artist
            <select className="field" value={selectedUserId} onChange={(event) => handleUserChange(event.target.value)}>
              <option value="">Choose user first</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.name} / {user.email}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
            Select Release
            <select className="field" value={selectedReleaseId} disabled={!selectedUserId} onChange={(event) => setSelectedReleaseId(event.target.value)}>
              <option value="">{selectedUserId ? "Choose release" : "Select user first"}</option>
              {filteredReleases.map((release) => (
                <option key={release.id} value={release.id}>{adminReleaseTitle(release)} / {release.artistName}</option>
              ))}
            </select>
          </label>
        </div>

        {selectedUserId && filteredReleases.length === 0 ? <EmptyState copy="This user does not have any releases yet. Earnings entry unlocks after a release is selected." /> : null}

        {selectedRelease ? (
          <form onSubmit={submit} className="rounded-[1.5rem] border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
            <div className="mb-5 rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <p className="font-semibold" style={{ color: "var(--text)" }}>{adminReleaseTitle(selectedRelease)}</p>
              <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Release earning data will be connected to User #{selectedRelease.userId} and Release #{selectedRelease.id}.</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>Statement month<select name="statementMonth" required className="field" defaultValue={new Date().getMonth() + 1}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2026, index, 1).toLocaleDateString("en-IN", { month: "long" })}</option>)}</select></label>
              <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>Statement year<select name="statementYear" required className="field" defaultValue={new Date().getFullYear()}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
              <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>Platform / DSP<input name="platform" required className="field" placeholder="Spotify, Apple Music, YouTube Music" /></label>
              <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>Territory<input name="territory" className="field" placeholder="India, Worldwide, US" /></label>
              <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>Gross earning<input type="number" min="0" step="0.01" required className="field" value={grossEarning} onChange={(event) => setGrossEarning(event.target.value)} /></label>
              <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>Distributor deduction<input type="number" min="0" step="0.01" className="field" value={distributorDeduction} onChange={(event) => setDistributorDeduction(event.target.value)} /></label>
              <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>HYMN commission<input type="number" min="0" step="0.01" className="field" value={hymnCommission} onChange={(event) => setHymnCommission(event.target.value)} /></label>
              <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>Artist net payable<input type="number" min="0" step="0.01" required className="field" value={artistNetPayable} onChange={(event) => setArtistNetPayable(event.target.value)} placeholder={String(suggestedNet || "")} /></label>
              <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>Streams / downloads<input name="streamsDownloads" type="number" min="0" step="1" className="field" placeholder="Optional" /></label>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>Source / reference note<input name="sourceReference" className="field" placeholder="DireNote statement, report ID, invoice reference" /></label>
              <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>Admin note<input name="adminNote" className="field" placeholder="Internal finance note" /></label>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <div>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>Suggested net after deductions</p>
                <p className="mt-1 text-2xl font-semibold" style={{ color: "var(--text)" }}>{formatMoney(suggestedNet)}</p>
              </div>
              <button type="submit" disabled={isPending} className="btn-primary pressable">{isPending ? "Saving..." : "Save earnings entry"}</button>
            </div>
          </form>
        ) : selectedUserId ? <EmptyState copy="Select a release to open the earning data form." /> : <EmptyState copy="Start by selecting the user/artist. Releases and earning data stay locked until a user is chosen." />}

        {feedback ? <p className="text-sm" style={{ color: "var(--text)" }}>{feedback}</p> : null}
      </div>
    </SurfaceSection>
  );
}

function AdminPayoutManager() {
  const [requests, setRequests] = useState<AdminPayoutRequest[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState<Record<number, string>>({});
  const [paymentEvidence, setPaymentEvidence] = useState<Record<number, { paymentReference: string; paymentMethod: string; paymentDate: string; paidAmount: string }>>({});
  const [isPending, startTransition] = useTransition();
  const [fx, setFx] = useState<{ usdToInrRate: number | null; rateUpdatedAt: string | null; rateStatus: string; approximateMinimumInr: number | null } | null>(null);

  async function loadRequests() {
    const response = await fetch("/api/admin/payouts", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      setFeedback(data.error || "Could not load payout requests.");
      return;
    }
    setRequests(data.requests ?? []);
  }

  async function loadFx() {
    const response = await fetch("/api/payout/config", { cache: "no-store" });
    if (response.ok) setFx(await response.json());
  }

  function refreshFx() {
    startTransition(async () => {
      const response = await fetch("/api/admin/exchange-rates/refresh", { method: "POST" });
      const data = await response.json();
      setFeedback(response.ok ? "USD/INR exchange rate refreshed." : data.error || "Exchange-rate refresh failed.");
      if (response.ok) await loadFx();
    });
  }

  useEffect(() => {
    loadRequests();
    loadFx();
  }, []);

  function updateStatus(requestId: number, status: "under_review" | "approved" | "processing" | "paid" | "rejected") {
    startTransition(async () => {
      const response = await fetch("/api/admin/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, status, adminNote: adminNote[requestId] ?? "", ...(status === "paid" ? { ...paymentEvidence[requestId], paidAmount: Number(paymentEvidence[requestId]?.paidAmount) } : {}) })
      });
      const data = await response.json();
      if (!response.ok) {
        setFeedback(data.error || "Could not update payout request.");
        return;
      }
      setFeedback(`Payout request #${requestId} updated.`);
      await loadRequests();
    });
  }

  async function uploadPayoutProof(requestId: number, file?: File) {
    if (!file) return; const form = new FormData(); form.set("file", file); setFeedback("Uploading private payment proof...");
    const response = await fetch(`/api/admin/payouts/${requestId}/proof`, { method: "POST", body: form }); const data = await response.json().catch(() => ({}));
    if (!response.ok) return setFeedback(data.error || "Payment proof upload failed."); setFeedback(`Private proof attached to payout #${requestId}.`); await loadRequests();
  }

  return (
    <SurfaceSection title="Payout requests" description="Approve, process, pay, or reject artist payout requests. Sensitive payout details are masked here.">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4" style={{ borderColor: "var(--border)" }}>
        <div><p className="font-semibold">USD/INR payout rate</p><p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{fx?.usdToInrRate ? `1 USD = ${fx.usdToInrRate.toFixed(4)} INR · $105 ≈ ${formatMoney(fx.approximateMinimumInr ?? 0)}` : "No successful rate stored"}{fx?.rateUpdatedAt ? ` · updated ${new Date(fx.rateUpdatedAt).toLocaleString("en-IN")}` : ""}{fx?.rateStatus === "stale" ? " · STALE" : ""}</p></div>
        <button type="button" className="btn-outline pressable" disabled={isPending} onClick={refreshFx}>{isPending ? "Refreshing…" : "Refresh rate"}</button>
      </div>
      {feedback ? <p className="mb-4 text-sm" style={{ color: "var(--text)" }}>{feedback}</p> : null}
      <div className="grid gap-4">
        {requests.map((request) => (
          <article key={request.id} className="surface-list-item p-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="font-semibold" style={{ color: "var(--text)" }}>{request.userName}</p>
                <p className="mt-1 text-sm" style={{ color: "var(--text-soft)" }}>{request.userEmail} / User #{request.userId}</p>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4" style={{ color: "var(--text-muted)" }}>
                  <span>Requested: {formatMoney(request.requestedAmount)}{request.requestedAmountUsd !== null ? ` · $${request.requestedAmountUsd.toFixed(2)}` : ""}</span>
                  {request.usdToInrRate !== null ? <span>FX: 1 USD = {request.usdToInrRate.toFixed(4)} INR · {request.exchangeRateProvider}</span> : null}
                  <span>Fee: {formatMoney(request.serviceFee)}</span>
                  <span>Net: {formatMoney(request.netAmount)}</span>
                  <span>{request.method}: {request.payoutDetails}</span>
                </div>
                <p className="mt-2 text-xs" style={{ color: "var(--text-soft)" }}>Requested {new Date(request.requestedAt).toLocaleString("en-IN")}</p>
                {request.adminNote ? <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>Admin note: {request.adminNote}</p> : null}
                <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Audit timeline ({request.events.length})</summary><ol className="mt-2 space-y-1">{request.events.map(event => <li key={event.id}>{new Date(event.createdAt).toLocaleString("en-IN")} · {event.actorType} · {event.previousStatus || "created"} → {event.newStatus}{event.note ? ` · ${event.note}` : ""}</li>)}</ol></details>
                {request.proofPath ? <a className="mt-2 inline-block text-sm underline" href={request.proofPath}>Open private payment proof</a> : null}
              </div>
              <div className="min-w-[260px]">
                <StatusPill label={request.status} active={request.status === "paid" || request.status === "processing"} />
                <textarea
                  className="field mt-3 min-h-20"
                  placeholder="Admin note, required when rejecting"
                  value={adminNote[request.id] ?? ""}
                  onChange={(event) => setAdminNote((notes) => ({ ...notes, [request.id]: event.target.value }))}
                />
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <input className="field" placeholder="Unique UTR / reference" value={paymentEvidence[request.id]?.paymentReference ?? ""} onChange={(event) => setPaymentEvidence(current => ({ ...current, [request.id]: { paymentReference: event.target.value, paymentMethod: current[request.id]?.paymentMethod ?? "", paymentDate: current[request.id]?.paymentDate ?? "", paidAmount: current[request.id]?.paidAmount ?? String(request.netAmount) } }))} />
                  <input className="field" placeholder="Method (NEFT / UPI)" value={paymentEvidence[request.id]?.paymentMethod ?? ""} onChange={(event) => setPaymentEvidence(current => ({ ...current, [request.id]: { paymentReference: current[request.id]?.paymentReference ?? "", paymentMethod: event.target.value, paymentDate: current[request.id]?.paymentDate ?? "", paidAmount: current[request.id]?.paidAmount ?? String(request.netAmount) } }))} />
                  <input type="date" className="field" aria-label="Payment date" value={paymentEvidence[request.id]?.paymentDate ?? ""} onChange={(event) => setPaymentEvidence(current => ({ ...current, [request.id]: { paymentReference: current[request.id]?.paymentReference ?? "", paymentMethod: current[request.id]?.paymentMethod ?? "", paymentDate: event.target.value, paidAmount: current[request.id]?.paidAmount ?? String(request.netAmount) } }))} />
                  <input type="number" min="0.01" step="0.01" className="field" aria-label="Paid amount" value={paymentEvidence[request.id]?.paidAmount ?? String(request.netAmount)} onChange={(event) => setPaymentEvidence(current => ({ ...current, [request.id]: { paymentReference: current[request.id]?.paymentReference ?? "", paymentMethod: current[request.id]?.paymentMethod ?? "", paymentDate: current[request.id]?.paymentDate ?? "", paidAmount: event.target.value } }))} />
                  <label className="field text-xs">Optional private payment proof<input type="file" className="mt-1 block w-full" accept="application/pdf,image/jpeg,image/png" onChange={event => uploadPayoutProof(request.id, event.target.files?.[0])} /></label>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" disabled={isPending} onClick={() => updateStatus(request.id, "under_review")} className="btn-outline pressable px-3 py-2 text-xs">Start review</button>
                  <button type="button" disabled={isPending} onClick={() => updateStatus(request.id, "approved")} className="btn-outline pressable px-3 py-2 text-xs">Approve</button>
                  <button type="button" disabled={isPending} onClick={() => updateStatus(request.id, "processing")} className="btn-outline pressable px-3 py-2 text-xs">Processing</button>
                  <button type="button" disabled={isPending} onClick={() => updateStatus(request.id, "paid")} className="btn-primary pressable px-3 py-2 text-xs">Paid</button>
                  <button type="button" disabled={isPending} onClick={() => updateStatus(request.id, "rejected")} className="btn-outline pressable px-3 py-2 text-xs" style={{ color: "var(--danger)" }}>Reject</button>
                </div>
              </div>
            </div>
          </article>
        ))}
        {requests.length === 0 ? <EmptyState copy="No payout requests yet." /> : null}
      </div>
    </SurfaceSection>
  );
}

function AdminPayoutReports() {
  const [data, setData] = useState<{ periods: any[]; reports: any[]; unmatched: number }>({ periods: [], reports: [], unmatched: 0 });
  const [feedback, setFeedback] = useState("");
  const now = new Date(); const currentQuarter = Math.floor(now.getUTCMonth() / 3) + 1;
  async function load() { const response = await fetch("/api/admin/payout-reports", { cache: "no-store" }); if (response.ok) setData(await response.json()); }
  useEffect(() => { load(); }, []);
  async function run(payload: Record<string, unknown>) { setFeedback("Working…"); const response = await fetch("/api/admin/payout-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const result = await response.json(); setFeedback(response.ok ? "Reporting operation completed." : result.error || "Reporting operation failed."); if (response.ok) await load(); }
  function closePeriod(period: any) { if (!window.confirm("Close this quarter?\n\nThis will lock the quarter, generate the final Excel report, carry forward unpaid balances, and start the next quarter view. Financial history will not be deleted.")) return; run({ action: "close-quarter", quarter: period.quarter, year: period.year }); }
  return <SurfaceSection title="Monthly and quarterly reports" description="Generate database-backed Excel workbooks, review closed periods, and operate quarterly payout cycles without deleting ledger history.">
    <div className="flex flex-wrap gap-2"><button className="btn-outline" onClick={() => run({ type: "monthly", month: now.getUTCMonth() + 1, year: now.getUTCFullYear() })}>Generate Monthly Report</button><button className="btn-outline" onClick={() => run({ type: "quarterly", quarter: currentQuarter, year: now.getUTCFullYear() })}>Generate Quarterly Report</button><button className="btn-primary" onClick={() => run({ type: "master", year: now.getUTCFullYear() })}>Generate Master Ledger</button><a href="/api/admin/royalties/export" className="btn-outline">Download Master Excel</a></div>
    {data.unmatched ? <p className="mt-4 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--warning)", color: "var(--warning)" }}>{data.unmatched} unmatched royalty row(s) must be resolved before normal quarter closing.</p> : null}
    {feedback ? <p className="mt-3 text-sm">{feedback}</p> : null}
    <div className="mt-5 overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}><table className="min-w-full text-left text-sm"><thead><tr>{["Period", "Status", "Gross", "Artist pool", "Held", "Paid", "Carry forward", "Action"].map(h => <th key={h} className="px-3 py-3">{h}</th>)}</tr></thead><tbody>{data.periods.filter(p => p.type === "quarterly").map(period => <tr key={period.id} className="border-t" style={{ borderColor: "var(--border)" }}><td className="px-3 py-3">Q{period.quarter} {period.year}</td><td className="px-3 py-3 capitalize">{period.status}</td><td className="px-3 py-3">{formatMoney(Number(period.totalGrossRevenue))}</td><td className="px-3 py-3">{formatMoney(Number(period.totalArtistPool))}</td><td className="px-3 py-3">{formatMoney(Number(period.totalHeldAmount))}</td><td className="px-3 py-3">{formatMoney(Number(period.totalPaidAmount))}</td><td className="px-3 py-3">{formatMoney(Number(period.totalCarryForward))}</td><td className="px-3 py-3">{period.status === "open" ? <button className="btn-outline px-3 py-2 text-xs" onClick={() => closePeriod(period)}>Close Quarter</button> : period.generatedReportUrl ? <a className="btn-outline px-3 py-2 text-xs" href={period.generatedReportUrl}>Download</a> : "—"}</td></tr>)}</tbody></table></div>
    <div className="mt-5 grid gap-3">{data.reports.map(report => <article key={report.id} className="surface-list-item flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold">{report.fileName}</p><p className="mt-1 text-xs" style={{ color: "var(--text-soft)" }}>{report.type} · {new Date(report.generatedAt).toLocaleString("en-IN")} · {report.status}</p></div><div className="flex gap-2"><a href={`/api/payout/reports/${report.id}/download`} className="btn-outline px-3 py-2 text-xs">Download</a><button className="btn-outline px-3 py-2 text-xs" onClick={() => run({ type: report.type, month: report.month, quarter: report.quarter, year: report.year })}>Regenerate</button></div></article>)}</div>
  </SurfaceSection>;
}

type AdminTab =
  | "overview"
  | "artists"
  | "producers"
  | "releases"
  | "distribution-queue"
  | "delivery"
  | "analytics"
  | "revenue"
  | "earnings-entry"
  | "royalties"
  | "contracts"
  | "promotions"
  | "support"
  | "fraud"
  | "notifications"
  | "team"
  | "settings"
  | "users"
  | "payments"
  | "content"
  | "timed-playlists"
  | "operations"
  | "activity";

export function AdminControlCenter({
  currentAdmin,
  adminAccess,
  initialTab,
  initialReleases,
  initialBeats,
  initialOrders,
  initialUsers,
  initialApplications,
  initialLeads,
  initialDistributionOrders,
  initialArtistProfiles,
  initialProducerProfiles,
  initialSiteSettings,
  initialNotifications,
  initialSupportTickets
}: {
  currentAdmin: User;
  adminAccess: { role: string; permissions: AdminPermissionKey[] };
  initialTab?: AdminTab;
  initialReleases: Release[];
  initialBeats: Beat[];
  initialOrders: Order[];
  initialUsers: User[];
  initialApplications: ProducerApplication[];
  initialLeads: PartnershipLead[];
  initialDistributionOrders: DistributionOrder[];
  initialArtistProfiles: ArtistProfile[];
  initialProducerProfiles: ProducerProfile[];
  initialSiteSettings: SiteSettings;
  initialNotifications: Notification[];
  initialSupportTickets: SupportTicket[];
}) {
  const hasPermission = (permission: AdminPermissionKey) => adminAccess.permissions.includes(permission);
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab ?? "overview");
  const [releases, setReleases] = useState(initialReleases);
  const [beats, setBeats] = useState(initialBeats);
  const [users, setUsers] = useState(initialUsers);
  const [applications, setApplications] = useState(initialApplications);
  const [supportTickets, setSupportTickets] = useState(initialSupportTickets);
  const [selectedReleaseId, setSelectedReleaseId] = useState<number | null>(initialReleases[0]?.id ?? null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [notificationFeedback, setNotificationFeedback] = useState<string | null>(null);
  const [persistedTasks, setPersistedTasks] = useState<PersistedAdminTask[]>([]);
  const [releaseAudit, setReleaseAudit] = useState<Array<{ id: number; action: string; createdAt: string; metadata?: Record<string, unknown> | null }>>([]);
  const [direNoteReadiness, setDireNoteReadiness] = useState<{ ready: boolean; issues: Array<{ field: string; category: string; message: string; fixSuggestion: string }>; warnings: Array<{ field: string; category: string; message: string }> } | null>(null);
  const [reviewAction, setReviewAction] = useState<"rejected" | "changes_requested" | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewIssueType, setReviewIssueType] = useState("");
  const [reviewSeverity, setReviewSeverity] = useState("required_correction");
  const [reviewFieldSearch, setReviewFieldSearch] = useState("");
  const [reviewFields, setReviewFields] = useState<Record<string, { label: string; note: string }>>({});
  const [reviewInternalNote, setReviewInternalNote] = useState("");
  const [confirmStatusAction, setConfirmStatusAction] = useState<Release["status"] | null>(null);
  const [direNoteResult, setDireNoteResult] = useState<{ type: "success" | "error"; title: string; message: string } | null>(null);
  const [isSubmittingToDireNote, setIsSubmittingToDireNote] = useState(false);
  const [direNoteCooldowns, setDireNoteCooldowns] = useState<Record<number, number>>({});
  const [cooldownClock, setCooldownClock] = useState(() => Date.now());
  const [queueSearch, setQueueSearch] = useState("");
  const [queueStatus, setQueueStatus] = useState("all");
  const [queueType, setQueueType] = useState("all");
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [userActivityFilter, setUserActivityFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [paymentPlanFilter, setPaymentPlanFilter] = useState("all");
  const [paymentPeriodFilter, setPaymentPeriodFilter] = useState("all");
  const [paymentSort, setPaymentSort] = useState("newest");
  const [activityTypeFilter, setActivityTypeFilter] = useState("all");
  const [activityStatusFilter, setActivityStatusFilter] = useState("all");
  const [activitySort, setActivitySort] = useState("newest");
  const [taskPriorityFilter, setTaskPriorityFilter] = useState("all");
  const [taskTypeFilter, setTaskTypeFilter] = useState("all");
  const [reviewTab, setReviewTab] = useState<"overview" | "metadata" | "tracks" | "assets" | "rights" | "direnote" | "activity">("overview");
  const [catalogTab, setCatalogTab] = useState<"overview" | "tracks" | "distribution" | "identifiers" | "stores" | "promolink" | "earnings" | "activity">(initialTab === "delivery" ? "distribution" : "overview");
  const [moduleSearch, setModuleSearch] = useState("");
  const [producerManagement, setProducerManagement] = useState<any[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setInterval(() => setCooldownClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/tasks").then((response) => response.json()).then((data) => { if (active) setPersistedTasks(data.tasks ?? []); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!selectedReleaseId) return;
    fetch(`/api/admin/releases/${selectedReleaseId}/audit`).then((response) => response.ok ? response.json() : null).then((data) => setReleaseAudit(Array.isArray(data?.logs) ? data.logs : [])).catch(() => setReleaseAudit([]));
    fetch(`/api/admin/releases/${selectedReleaseId}/direnote/readiness`).then((response) => response.ok ? response.json() : null).then((data) => setDireNoteReadiness(data && Array.isArray(data.issues) ? { ...data, warnings: Array.isArray(data.warnings) ? data.warnings : [] } : null)).catch(() => setDireNoteReadiness(null));
  }, [selectedReleaseId]);
  useEffect(() => {
    if (activeTab !== "producers") return;
    fetch("/api/admin/producers", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => setProducerManagement(Array.isArray(data?.producers) ? data.producers : [])).catch(() => setProducerManagement([]));
  }, [activeTab, users]);

  async function resolvePersistedTask(id: number) {
    const response = await fetch(`/api/admin/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "resolved", note: "Resolved from Operations Queue." }) });
    if (response.ok) setPersistedTasks((tasks) => tasks.filter((task) => task.id !== id));
  }
  async function updatePersistedTask(id: number, body: Record<string, unknown>) {
    const response = await fetch(`/api/admin/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (response.ok) setPersistedTasks((tasks) => body.status === "snoozed" || body.status === "resolved" ? tasks.filter((task) => task.id !== id) : tasks.map((task) => task.id === id ? { ...task, ...data.task } : task));
  }

  async function reviewBeat(beat: Beat, decision: "approved" | "changes_requested") {
    const reason = decision === "changes_requested" ? window.prompt("Describe exactly what the producer must correct:") : null;
    if (decision === "changes_requested" && !reason?.trim()) return;
    const response = await fetch(`/api/admin/beats/${beat.id}/review`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, reason }) });
    const data = await response.json();
    if (!response.ok) { setFeedback(data.error || "Could not review beat."); return; }
    setBeats((items) => items.map((item) => item.id === beat.id ? { ...item, enabled: data.beat.enabled, status: data.beat.status, reviewIssues: data.beat.reviewIssues } : item));
  }

  const distributionRevenue = initialDistributionOrders.filter((order) => order.paymentStatus === "paid").reduce((sum, order) => sum + order.amount, 0);
  const commerceRevenue = initialOrders.filter((order) => order.paymentStatus === "paid").reduce((sum, order) => sum + order.amount, 0);
  const pendingReviews = releases.filter((release) => ["submitted", "in_queue", "under_review"].includes(release.status.toLowerCase())).length;
  const changesRequested = releases.filter((release) => release.status === "changes_requested").length;
  const failedDistributionJobs = releases.filter((release) => ["failed", "rejected"].includes(release.status.toLowerCase())).length;
  const sentToDireNote = releases.filter((release) => ["sent", "sent_to_distributor", "processing", "delivered", "live"].includes(release.status.toLowerCase())).length;
  const openSupportTickets = supportTickets.filter((ticket) => ["open", "in_progress"].includes(ticket.status)).length;
  const pendingProducerApplications = applications.filter((application) => application.status === "pending").length;
  const oldestWaiting = (dates: Array<string | null | undefined>) => {
    const valid = dates.filter((date): date is string => Boolean(date)).map((date) => new Date(date).getTime()).filter(Number.isFinite);
    if (!valid.length) return "No waiting items";
    const hours = Math.max(0, Math.floor((Date.now() - Math.min(...valid)) / 3_600_000));
    return hours < 24 ? `Oldest ${hours}h` : `Oldest ${Math.floor(hours / 24)}d`;
  };
  const operationalQueues = [
    { label: "Releases awaiting QC", count: pendingReviews, urgency: pendingReviews ? "High" : "Clear", oldest: oldestWaiting(releases.filter((release) => ["submitted", "in_queue", "under_review"].includes(release.status)).map((release) => release.submittedAt || release.createdAt)), tab: "distribution-queue" as AdminTab },
    { label: "Corrections awaiting artist", count: changesRequested, urgency: changesRequested ? "Attention" : "Clear", oldest: oldestWaiting(releases.filter((release) => release.status === "changes_requested").map((release) => release.reviewedAt || release.createdAt)), tab: "releases" as AdminTab },
    { label: "Failed distributor submissions", count: failedDistributionJobs, urgency: failedDistributionJobs ? "Critical" : "Clear", oldest: oldestWaiting(releases.filter((release) => ["failed", "rejected"].includes(release.status)).map((release) => release.createdAt)), tab: "distribution-queue" as AdminTab },
    { label: "Awaiting live confirmation", count: releases.filter((release) => ["awaiting_live_confirmation", "partially_live"].includes(release.status)).length, urgency: "Normal", oldest: oldestWaiting(releases.filter((release) => ["awaiting_live_confirmation", "partially_live"].includes(release.status)).map((release) => release.distributedAt || release.createdAt)), tab: "releases" as AdminTab },
    { label: "Failed payment events", count: initialDistributionOrders.filter((order) => order.paymentStatus === "failed").length, urgency: initialDistributionOrders.some((order) => order.paymentStatus === "failed") ? "Critical" : "Clear", oldest: oldestWaiting(initialDistributionOrders.filter((order) => order.paymentStatus === "failed").map((order) => order.createdAt)), tab: "payments" as AdminTab },
    { label: "Overdue support tickets", count: openSupportTickets, urgency: openSupportTickets ? "Attention" : "Clear", oldest: oldestWaiting(supportTickets.filter((ticket) => ["open", "in_progress"].includes(ticket.status)).map((ticket) => ticket.createdAt)), tab: "support" as AdminTab },
  ];
  const reviewQueueStatuses = ["submitted", "in_queue", "under_review", "changes_requested", "approved", "failed"];
  const catalogStatuses = ["sent", "sent_to_distributor", "scheduled", "processing", "awaiting_live_confirmation", "partially_live", "delivered", "live"];
  const requestedSelectedRelease = releases.find((release) => release.id === selectedReleaseId) ?? null;
  const selectedRelease = activeTab === "distribution-queue"
    ? (requestedSelectedRelease && reviewQueueStatuses.includes(requestedSelectedRelease.status) ? requestedSelectedRelease : releases.find((release) => reviewQueueStatuses.includes(release.status)) ?? null)
    : requestedSelectedRelease ?? releases[0] ?? null;
  const direNoteCooldownSeconds = selectedRelease
    ? Math.max(0, Math.ceil(((direNoteCooldowns[selectedRelease.id] ?? 0) - cooldownClock) / 1000))
    : 0;
  const direNoteCooldownLabel = `${Math.floor(direNoteCooldownSeconds / 60)}:${String(direNoteCooldownSeconds % 60).padStart(2, "0")}`;
  const queueReleases = useMemo(() => releases.filter((release) => {
    const query = queueSearch.trim().toLowerCase();
    const searchable = [release.releaseTitle, release.trackName, release.artistName, release.upcCode, release.ownerEmail, ...(release.tracks ?? []).map((track) => track.isrc)].filter(Boolean).join(" ").toLowerCase();
    const belongsToModule = activeTab === "distribution-queue" ? reviewQueueStatuses.includes(release.status) : true;
    return belongsToModule && (!query || searchable.includes(query)) && (queueStatus === "all" || release.status === queueStatus) && (queueType === "all" || release.releaseType === queueType);
  }), [activeTab, queueSearch, queueStatus, queueType, releases]);
  const catalogReleases = useMemo(() => releases.filter((release) => catalogStatuses.includes(release.status)), [releases]);
  const selectedCatalogRelease = catalogReleases.find((release) => release.id === selectedReleaseId) ?? catalogReleases[0] ?? null;
  const today = new Date();
  const todayLabel = `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][today.getUTCDay()]}, ${today.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][today.getUTCMonth()]} ${today.getUTCFullYear()}`;
  const notificationCountsByType = useMemo(() => {
    const counts = new Map<string, number>();
    initialNotifications.forEach((notification) => counts.set(notification.type, (counts.get(notification.type) ?? 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [initialNotifications]);
  const highPriorityNotifications = useMemo(() => initialNotifications.filter((notification) => notification.priority === "high"), [initialNotifications]);
  const searchMatch = (...values: unknown[]) => !moduleSearch.trim() || values.filter(Boolean).join(" ").toLowerCase().includes(moduleSearch.trim().toLowerCase());

  const releaseCountByUser = useMemo(() => {
    const counts = new Map<number, number>();
    releases.forEach((release) => counts.set(release.userId, (counts.get(release.userId) ?? 0) + 1));
    return counts;
  }, [releases]);

  const latestUserActivity = useMemo(() => {
    const stamps = new Map<number, string>();
    releases.forEach((release) => {
      const current = stamps.get(release.userId);
      if (!current || new Date(release.createdAt).getTime() > new Date(current).getTime()) {
        stamps.set(release.userId, release.createdAt);
      }
    });
    initialOrders.forEach((order) => {
      const current = stamps.get(order.userId);
      if (!current || new Date(order.createdAt).getTime() > new Date(current).getTime()) {
        stamps.set(order.userId, order.createdAt);
      }
    });
    return stamps;
  }, [initialOrders, releases]);
  const filteredUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    const recentCutoff = Date.now() - 30 * 86_400_000;
    return users.filter((user) => {
      const activity = latestUserActivity.get(user.id);
      const matchesSearch = !query || `${user.name} ${user.email} ${user.id}`.toLowerCase().includes(query);
      const matchesRole = userRoleFilter === "all" || user.role === userRoleFilter;
      const matchesActivity = userActivityFilter === "all" || (userActivityFilter === "recent" ? Boolean(activity && new Date(activity).getTime() >= recentCutoff) : !activity || new Date(activity).getTime() < recentCutoff);
      return matchesSearch && matchesRole && matchesActivity;
    });
  }, [latestUserActivity, userActivityFilter, userRoleFilter, userSearch, users]);
  const filteredDistributionPayments = useMemo(() => {
    const periodDays = paymentPeriodFilter === "7d" ? 7 : paymentPeriodFilter === "30d" ? 30 : 0;
    const cutoff = periodDays ? Date.now() - periodDays * 86_400_000 : 0;
    return initialDistributionOrders.filter((order) => (paymentStatusFilter === "all" || order.paymentStatus === paymentStatusFilter) && (paymentPlanFilter === "all" || order.plan === paymentPlanFilter) && (!cutoff || new Date(order.createdAt).getTime() >= cutoff)).sort((a, b) => paymentSort === "amount-high" ? b.amount - a.amount : paymentSort === "amount-low" ? a.amount - b.amount : paymentSort === "oldest" ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [initialDistributionOrders, paymentPeriodFilter, paymentPlanFilter, paymentSort, paymentStatusFilter]);
  const recentActivityItems = useMemo(() => [...releases.map((release) => ({ type: "release", status: release.status, title: adminReleaseTitle(release), detail: `${release.artistName} / ${release.status.replace(/_/g, " ")}`, time: release.createdAt })), ...initialOrders.map((order) => ({ type: "commerce", status: order.paymentStatus, title: `Beat store order #${order.id}`, detail: `${order.paymentStatus} / ${formatMoney(order.amount)}`, time: order.createdAt }))].filter((item) => (activityTypeFilter === "all" || item.type === activityTypeFilter) && (activityStatusFilter === "all" || item.status === activityStatusFilter)).sort((a, b) => activitySort === "oldest" ? new Date(a.time).getTime() - new Date(b.time).getTime() : new Date(b.time).getTime() - new Date(a.time).getTime()), [activitySort, activityStatusFilter, activityTypeFilter, initialOrders, releases]);
  const actionQueue = useMemo(() => {
    const releaseItems = releases
      .filter((release) => ["submitted", "in_queue", "under_review", "changes_requested", "failed", "rejected"].includes(release.status.toLowerCase()))
      .slice(0, 5)
      .map((release) => ({
        type: release.status === "changes_requested" ? "Correction" : ["failed", "rejected"].includes(release.status) ? "Risk" : "Release",
        title: adminReleaseTitle(release),
        detail: `${release.artistName} / ${release.releaseType.toUpperCase()}`,
        time: release.submittedAt ?? release.createdAt,
        priority: ["failed", "rejected", "changes_requested"].includes(release.status) ? "High" : "Normal",
        cta: "Review",
        tab: "releases" as AdminTab
      }));
    const payoutItems = initialNotifications
      .filter((notification) => notification.type === "payout" && notification.priority === "high")
      .slice(0, 3)
      .map((notification) => ({
        type: "Payout",
        title: notification.title,
        detail: notification.body,
        time: notification.createdAt,
        priority: "High",
        cta: "Open payouts",
        tab: "royalties" as AdminTab
      }));
    const supportItems = supportTickets
      .filter((ticket) => ["open", "in_progress"].includes(ticket.status))
      .slice(0, 3)
      .map((ticket) => ({
        type: "Support",
        title: ticket.subject,
        detail: ticket.message,
        time: ticket.createdAt,
        priority: ticket.status === "open" ? "Normal" : "Active",
        cta: "Open ticket",
        tab: "support" as AdminTab
      }));
    const producerItems = applications
      .filter((application) => application.status === "pending")
      .slice(0, 3)
      .map((application) => ({
        type: "Producer",
        title: application.artistName,
        detail: `${application.email} / ${application.genreFocus}`,
        time: application.createdAt,
        priority: "Normal",
        cta: "Review",
        tab: "producers" as AdminTab
      }));
    return [...releaseItems, ...payoutItems, ...supportItems, ...producerItems]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 8);
  }, [applications, initialNotifications, releases, supportTickets]);
  const filteredPersistedTasks = useMemo(() => persistedTasks.filter((item) => (taskPriorityFilter === "all" || item.priority === taskPriorityFilter) && (taskTypeFilter === "all" || item.type === taskTypeFilter)), [persistedTasks, taskPriorityFilter, taskTypeFilter]);
  const filteredActionQueue = useMemo(() => actionQueue.filter((item) => (taskPriorityFilter === "all" || item.priority.toLowerCase() === taskPriorityFilter) && (taskTypeFilter === "all" || item.type === taskTypeFilter)), [actionQueue, taskPriorityFilter, taskTypeFilter]);

  function selectAdminTab(tab: AdminTab) {
    setActiveTab(tab);
    if (tab === "delivery") setCatalogTab("distribution");
    setModuleSearch("");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState(null, "", url.toString());
    }
  }

  function updateReleaseStatus(id: number, status: Release["status"]) {
    startTransition(async () => {
      const isDireNoteAction = status === "sent";
      if (isDireNoteAction) {
        setIsSubmittingToDireNote(true);
        setDireNoteResult(null);
        setDireNoteCooldowns((current) => ({ ...current, [id]: Date.now() + 5 * 60 * 1000 }));
      }
      try {
        const response = await fetch(`/api/admin/update-status/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, note: `Status set to ${status}` })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const issueMessages = Array.isArray(data.validation?.issues)
            ? data.validation.issues.map((issue: { message?: string }) => issue.message).filter(Boolean)
            : [];
          const reason = [data.error, ...issueMessages].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(" ") || "Could not update release.";
          setFeedback(reason);
          if (isDireNoteAction) setDireNoteResult({ type: "error", title: "Distribution submission failed", message: reason });
          return;
        }
        setReleases((items) => items.map((item) => (item.id === id ? data.release : item)));
        const releaseName = data.release?.releaseTitle || data.release?.trackName || "Release";
        setFeedback(status === "approved" ? `${releaseName} was approved by HYMN.` : status === "sent" ? `${releaseName} was sent for distribution successfully.` : `${releaseName} status updated to ${status.replace(/_/g, " ")}.`);
        if (isDireNoteAction) {
          const warningText = Array.isArray(data.warnings) && data.warnings.length
            ? ` HYMN distribution accepted it with ${data.warnings.length} warning${data.warnings.length === 1 ? "" : "s"}.`
            : " HYMN distribution accepted the submission for processing.";
          setDireNoteResult({ type: "success", title: "Sent for distribution", message: `${releaseName} was sent successfully.${warningText}` });
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : "The distribution request could not be completed.";
        setFeedback(reason);
        if (isDireNoteAction) setDireNoteResult({ type: "error", title: "Distribution connection error", message: reason });
      } finally {
        if (isDireNoteAction) setIsSubmittingToDireNote(false);
      }
    });
  }

  function syncDireNoteRelease(id: number) {
    startTransition(async () => {
      setDireNoteResult(null);
      try {
        const response = await fetch(`/api/admin/releases/${id}/direnote/sync`, { method: "POST" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = data.error || "Distribution sync could not be completed.";
          setFeedback(message); setDireNoteResult({ type: "error", title: "Distribution sync failed", message });
          return;
        }
        const message = data.status ? `Synced successfully. Distribution status: ${String(data.status).replace(/_/g, " ")}.` : "Synced successfully.";
        setFeedback(message); setDireNoteResult({ type: "success", title: "Distribution synced", message });
        window.location.reload();
      } catch {
        const message = "Distribution sync could not be completed.";
        setFeedback(message); setDireNoteResult({ type: "error", title: "Distribution sync failed", message });
      }
    });
  }

  function toggleBeat(beat: Beat) {
    startTransition(async () => {
      const response = await fetch(`/api/producer/beats/${beat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !beat.enabled })
      });
      const data = await response.json();
      if (!response.ok) {
        setFeedback(data.error || "Could not update beat.");
        return;
      }
      setBeats((items) => items.map((item) => (item.id === beat.id ? data.beat : item)));
      setFeedback(`Beat updated: ${data.beat.title}`);
    });
  }

  function updateRole(user: User, role: UserRole) {
    startTransition(async () => {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role })
      });
      const data = await response.json();
      if (!response.ok) {
        setFeedback(data.error || "Could not update user role.");
        return;
      }
      setUsers((items) => items.map((item) => (item.id === user.id ? data.user : item)));
      setFeedback(`Role updated for ${data.user.name}`);
    });
  }

  function updateProducerPhoto(producerId: number, file?: File | null) {
    if (!file) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.append("avatar", file);
      const response = await fetch(`/api/admin/producers/${producerId}/photo`, { method: "PATCH", body: formData });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFeedback(data.error || "Could not update producer photo.");
        return;
      }
      setProducerManagement((items) => items.map((prod) => prod.id === producerId ? { ...prod, profile: { ...prod.profile, avatarUrl: data.avatarUrl, coverPhotoUrl: data.avatarUrl } } : prod));
      setFeedback("Producer profile photo updated successfully.");
    });
  }

  function reviewApplication(id: number, status: "approved" | "rejected") {
    startTransition(async () => {
      const response = await fetch(`/api/admin/producer-applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewNote: `Application ${status}` })
      });
      const data = await response.json();
      if (!response.ok) {
        setFeedback(data.error || "Could not review application.");
        return;
      }
      setApplications((items) => items.map((item) => (item.id === id ? data.application : item)));
      if (status === "approved") {
        setUsers((items) => items.map((item) => (item.id === data.application.userId ? { ...item, role: "producer" } : item)));
      }
      setFeedback(`Application ${status}.`);
    });
  }

  function openReview(action: "rejected" | "changes_requested") {
    setReviewAction(action);
    setReviewReason("");
    setReviewIssueType("");
    setReviewSeverity("required_correction");
    setReviewFieldSearch("");
    setReviewFields({});
    setReviewInternalNote("");
  }

  function submitReleaseReview() {
    if (!selectedRelease || !reviewAction || !reviewReason.trim() || !reviewIssueType || (reviewIssueType === "metadata" && !Object.keys(reviewFields).length)) return;
    startTransition(async () => {
      const response = await fetch(`/api/admin/update-status/${selectedRelease.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: reviewAction,
          reason: reviewReason.trim(),
          issueType: reviewIssueType,
          severity: reviewSeverity,
          fields: Object.entries(reviewFields).map(([field, value]) => ({ field, label: value.label, note: value.note.trim() })),
          adminInternalNote: reviewInternalNote.trim()
        })
      });
      const data = await response.json();
      if (!response.ok) { setFeedback(data.error || "Could not save release review."); return; }
      setReleases((items) => items.map((item) => item.id === selectedRelease.id ? data.release : item));
      setFeedback(reviewAction === "rejected" ? "Release rejected with a saved reason." : "Corrections requested and sent to the artist.");
      setReviewAction(null);
    });
  }

  function sendAdminNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setNotificationFeedback(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: formData.get("target"),
          userId: formData.get("userId"),
          title: formData.get("title"),
          message: formData.get("message"),
          type: formData.get("type"),
          priority: formData.get("priority"),
          href: formData.get("href"),
          actionLabel: formData.get("actionLabel")
        })
      });
      const data = await response.json();
      if (!response.ok) {
        setNotificationFeedback(data.error || "Could not send notification.");
        return;
      }
      setNotificationFeedback(`Notification sent to ${data.sent} recipient(s).`);
      form.reset();
    });
  }

  function updateTicketStatus(ticketId: number, status: SupportTicket["status"]) {
    startTransition(async () => {
      const response = await fetch("/api/support-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-status", ticketId, status })
      });
      const data = await response.json();
      if (!response.ok) {
        setFeedback(data.error || "Could not update ticket.");
        return;
      }
      setSupportTickets((items) => items.map((item) => item.id === ticketId ? data.ticket : item));
      setFeedback(`Ticket updated: ${data.ticket.subject}`);
    });
  }

  return (
    <DashboardFrame
      title="HYMN Command Center"
      subtitle={<span className="admin-identity"><span className="admin-identity-line"><span className="admin-online-dot" />{currentAdmin.name}<span className="admin-active-label">Active</span></span><span className="admin-identity-meta">{currentAdmin.email} · {todayLabel}</span></span>}
      navItems={[
        { key: "overview", label: "Operations Overview", description: "Queues requiring attention", group: "Command Center" },
        { key: "notifications", label: "Notifications", description: "Operations feed", group: "Command Center" },
        { key: "analytics", label: "Operational Reporting", description: "Persisted platform activity", group: "Command Center" },
        { key: "releases", label: "Releases", description: "Manage approved, scheduled, and live catalog releases", group: "Distribution Operations" },
        { key: "distribution-queue", label: "QC Queue", description: "Review and process submissions", group: "Distribution Operations" },
        { key: "delivery", label: "Distributor Delivery", description: "Distribution and store status", group: "Distribution Operations" },
        { key: "updates", label: "Update Requests", description: "Metadata and delivery changes", group: "Distribution Operations", href: "/admin/release-change-requests" },
        { key: "takedowns", label: "Takedowns", description: "Removal requests and outcomes", group: "Distribution Operations", href: "/admin/release-change-requests" },
        { key: "fraud", label: "Fraud Detection", description: "Risk monitoring and investigations", group: "Distribution Operations", href: "/admin/fraud" },
        { key: "referrals-admin", label: "Referrals", description: "Attribution, credits and abuse review", group: "Money Operations", href: "/admin/referrals" },
        { key: "payments", label: "Payments", description: "Checkout records", group: "Money Operations" },
        { key: "revenue", label: "Revenue", description: "Revenue overview", group: "Money Operations" },
        { key: "royalties", label: "Payouts", description: "Withdrawal controls", group: "Money Operations" },
        { key: "earnings-entry", label: "Royalty Management", description: "Import reports and manage ledgers", group: "Money Operations", href: "/admin/royalties" },
        { key: "reconciliation", label: "Reconciliation", description: "Resolve unmatched statement rows", group: "Money Operations", href: "/admin/royalties/reconciliation" },
        { key: "kyc", label: "KYC", description: "Payout-profile review", group: "Money Operations", href: "/admin/payout-profiles" },
        { key: "managed-services", label: "Managed Services", description: "CRBT, OAC and Content ID", group: "Growth / Content", href: "/admin/managed-services" },
        { key: "artists", label: "Artists", description: "Profiles and creators", group: "Growth / Content" },
        { key: "promotions", label: "Promotions", description: "Campaign ops", group: "Growth / Content" },
        { key: "timed-playlists", label: "Timed Playlists", description: "Playlist scheduling", group: "Growth / Content" },
        { key: "content", label: "Content Settings", description: "Site and producer content", group: "Growth / Content" },
        { key: "producers", label: "Producers", description: "Applications and catalog", group: "Marketplace" },
        { key: "operations", label: "Beats / Orders", description: "Inventory and leads", group: "Marketplace" },
        { key: "contracts", label: "Contracts", description: "Agreements and splits", group: "Support / Legal" },
        { key: "support", label: "Support Tickets", description: "Inbound help", group: "Support / Legal" },
        { key: "users", label: "Users", description: "Role management", group: "Platform" },
        { key: "team", label: "Team", description: "Staff operations", group: "Platform" },
        { key: "activity", label: "Activity and Logs", description: "Active admins and session history", group: "Platform" },
        { key: "integrations", label: "Integrations", description: "Provider configuration", group: "Platform", href: "/admin?tab=settings" },
        { key: "health", label: "System Health", description: "Readiness and provider state", group: "Platform", href: "/admin?tab=settings#system-health" },
        { key: "settings", label: "Settings", description: "Platform config", group: "Platform" }
      ]}
      activeKey={activeTab}
      onSelect={selectAdminTab}
      searchValue={moduleSearch}
      onSearchChange={setModuleSearch}
      searchPlaceholder={`Search ${activeTab.replace(/-/g, " ")}...`}
      onNotificationsClick={() => selectAdminTab("notifications")}
      notificationCount={initialNotifications.filter((notification) => !notification.readAt).length}
      quickActions={
        <>
          <button type="button" onClick={() => selectAdminTab("releases")} className="btn-outline pressable px-4 py-2 text-sm">Review Releases</button>
          <button type="button" onClick={() => selectAdminTab("earnings-entry")} className="btn-primary pressable px-4 py-2 text-sm">Enter Earnings</button>
          <button type="button" onClick={() => selectAdminTab("royalties")} className="btn-outline pressable px-4 py-2 text-sm">Manage Payouts</button>
        </>
      }
    >
      <AdminActivityAndLogs currentPage={activeTab} visible={activeTab === "activity"} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><div><span style={{ color: "var(--text-muted)" }}>Signed in as </span><strong>{currentAdmin.name}</strong><span style={{ color: "var(--text-muted)" }}> · Admin role: </span><strong className="capitalize">{adminAccess.role.replace(/_/g, " ")}</strong></div><span className="status-pill">{adminAccess.permissions.length} permissions</span></div>
      {activeTab === "overview" ? <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{operationalQueues.map((queue) => <button key={queue.label} type="button" onClick={() => selectAdminTab(queue.tab)} className="surface-list-item pressable min-h-32 p-4 text-left"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{queue.label}</p><p className="mt-2 text-3xl font-semibold">{queue.count}</p></div><StatusPill label={queue.urgency} active={queue.count > 0} /></div><p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>{queue.oldest}</p></button>)}</section> : null}
      {activeTab === "overview" ? <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <button type="button" onClick={() => selectAdminTab("releases")} className="text-left"><StatCard label="Pending reviews" value={pendingReviews} detail="Submitted, queued, or under review" /></button>
        <button type="button" onClick={() => selectAdminTab("releases")} className="text-left"><StatCard label="Changes requested" value={changesRequested} detail="Correction flow needs follow-up" /></button>
        <button type="button" onClick={() => selectAdminTab("distribution-queue")} className="text-left"><StatCard label="Sent for distribution" value={sentToDireNote} detail="Sent, processing, delivered, or live" /></button>
        <button type="button" onClick={() => selectAdminTab("revenue")} className="text-left"><StatCard label="Revenue" value={formatMoney(distributionRevenue + commerceRevenue)} detail={`${formatMoney(distributionRevenue)} distribution + ${formatMoney(commerceRevenue)} commerce`} /></button>
      </section> : null}

      {feedback ? <div role="status" className="flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text)" }}><p className="leading-6">{feedback}</p><button type="button" onClick={() => setFeedback(null)} className="pressable shrink-0 rounded-lg p-1" aria-label="Dismiss message"><X className="h-4 w-4" /></button></div> : null}

      {activeTab === "overview" ? (
        <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
          <SurfaceSection title="Today's Action Queue" description="Live admin tasks assembled from releases, payouts, support, and producer applications.">
            <div className="mb-4 grid gap-2 border-b pb-4 sm:grid-cols-2" style={{ borderColor: "var(--border)" }}><select className="field" value={taskPriorityFilter} onChange={(event) => setTaskPriorityFilter(event.target.value)}><option value="all">All priorities</option><option value="high">High priority</option><option value="normal">Normal priority</option><option value="active">Active</option><option value="critical">Critical</option></select><select className="field" value={taskTypeFilter} onChange={(event) => setTaskTypeFilter(event.target.value)}><option value="all">All queue types</option>{Array.from(new Set([...persistedTasks.map((item) => item.type), ...actionQueue.map((item) => item.type)])).sort().map((type) => <option key={type} value={type}>{type}</option>)}</select></div>
            <div className="grid gap-4">
              {filteredPersistedTasks.map((item) => (
                <article key={`task-${item.id}`} className="surface-list-item p-4" style={item.priority === "critical" ? { borderColor: "var(--danger)" } : undefined}>
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><StatusPill label={item.type} active={item.priority === "high" || item.priority === "critical"} /><span className="text-xs capitalize" style={{ color: "var(--text-soft)" }}>{item.priority} · {new Date(item.createdAt).toLocaleString("en-IN")}</span></div><p className="mt-3 font-semibold" style={{ color: "var(--text)" }}>{item.title}</p><p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{item.body}</p></div><div className="flex flex-wrap gap-2"><a href={item.href} className="btn-outline pressable px-3 py-2 text-xs">Open</a><button type="button" onClick={() => updatePersistedTask(item.id, { status: "assigned", assignToMe: true, note: "Assigned from Operations Queue." })} className="btn-outline pressable px-3 py-2 text-xs">Assign to me</button><button type="button" onClick={() => updatePersistedTask(item.id, { status: "snoozed", snoozedUntil: new Date(Date.now() + 86_400_000).toISOString(), note: "Snoozed for 24 hours." })} className="btn-outline pressable px-3 py-2 text-xs">Snooze 24h</button><button type="button" onClick={() => resolvePersistedTask(item.id)} className="btn-outline pressable px-3 py-2 text-xs">Resolve</button></div></div>
                </article>
              ))}
              {filteredActionQueue.map((item, index) => (
                <article key={`${item.type}-${item.title}-${index}`} className="surface-list-item p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill label={item.type} active={item.priority === "High"} />
                        <span className="text-xs" style={{ color: "var(--text-soft)" }}>{new Date(item.time).toLocaleString("en-IN")}</span>
                      </div>
                      <p className="mt-3 font-semibold" style={{ color: "var(--text)" }}>{item.title}</p>
                      <p className="mt-2 line-clamp-2 text-sm" style={{ color: "var(--text-soft)" }}>{item.detail}</p>
                    </div>
                    <button type="button" onClick={() => selectAdminTab(item.tab)} className="btn-outline pressable px-3 py-2 text-xs">{item.cta}</button>
                  </div>
                </article>
              ))}
              {filteredPersistedTasks.length === 0 && filteredActionQueue.length === 0 ? <EmptyState copy="No queue items match the selected filters." /> : null}
            </div>
          </SurfaceSection>

          <SurfaceSection title="Pipeline Snapshot" description="The fastest read on operations pressure today.">
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard label="Failed / rejected" value={failedDistributionJobs} detail="Needs correction or retry" />
              <StatCard label="Open support" value={openSupportTickets} detail="Open or in progress" />
              <StatCard label="Producer applications" value={pendingProducerApplications} detail="Awaiting review" />
              <StatCard label="Total users" value={users.length} detail="All HYMN accounts" />
            </div>
          </SurfaceSection>

          <SurfaceSection title="Recent distribution payments" description="Track pay-per-release and subscription checkout states.">
            <div className="mb-4 grid gap-2 border-b pb-4 sm:grid-cols-2" style={{ borderColor: "var(--border)" }}><select className="field" value={paymentStatusFilter} onChange={(event) => setPaymentStatusFilter(event.target.value)}><option value="all">All payment statuses</option>{Array.from(new Set(initialDistributionOrders.map((order) => order.paymentStatus))).sort().map((status) => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}</select><select className="field" value={paymentPlanFilter} onChange={(event) => setPaymentPlanFilter(event.target.value)}><option value="all">All plans</option>{Array.from(new Set(initialDistributionOrders.map((order) => order.plan))).sort().map((plan) => <option key={plan} value={plan}>{plan.replace(/_/g, " ")}</option>)}</select><select className="field" value={paymentPeriodFilter} onChange={(event) => setPaymentPeriodFilter(event.target.value)}><option value="all">Any date</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select><select className="field" value={paymentSort} onChange={(event) => setPaymentSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="amount-high">Highest amount</option><option value="amount-low">Lowest amount</option></select></div>
            <div className="grid gap-4">
              {filteredDistributionPayments.slice(0, 8).map((order) => (
                <article key={order.id} className="surface-list-item p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold" style={{ color: "var(--text)" }}>Order #{order.id}</p>
                      <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{order.plan} / {formatMoney(order.amount)}</p>
                    </div>
                    <StatusPill label={order.paymentStatus} active={order.paymentStatus === "paid"} />
                  </div>
                </article>
              ))}
              {filteredDistributionPayments.length === 0 ? <EmptyState copy="No distribution payments match the selected filters." /> : null}
            </div>
          </SurfaceSection>

          <SurfaceSection title="Recent activity" description="Latest release and commerce events from existing platform data.">
            <div className="mb-4 grid gap-2 border-b pb-4 sm:grid-cols-3" style={{ borderColor: "var(--border)" }}><select className="field" value={activityTypeFilter} onChange={(event) => setActivityTypeFilter(event.target.value)}><option value="all">All activity</option><option value="release">Releases</option><option value="commerce">Commerce</option></select><select className="field" value={activityStatusFilter} onChange={(event) => setActivityStatusFilter(event.target.value)}><option value="all">All statuses</option>{Array.from(new Set([...releases.map((release) => release.status), ...initialOrders.map((order) => order.paymentStatus)])).sort().map((status) => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}</select><select className="field" value={activitySort} onChange={(event) => setActivitySort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></div>
            <div className="grid gap-4">
              {recentActivityItems.slice(0, 8).map((item) => (
                <article key={`${item.title}-${item.time}`} className="surface-list-item p-4">
                  <p className="font-semibold" style={{ color: "var(--text)" }}>{item.title}</p>
                  <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{item.detail}</p>
                </article>
              ))}
              {recentActivityItems.length === 0 ? <EmptyState copy="No activity matches the selected filters." /> : null}
            </div>
          </SurfaceSection>
        </div>
      ) : null}

      {activeTab === "releases" || activeTab === "delivery" ? (
        <div className="grid gap-6 xl:grid-cols-[0.82fr,1.18fr]">
          <SurfaceSection title={activeTab === "delivery" ? "Distributor Delivery" : "Releases"} description={activeTab === "delivery" ? "Track distribution processing, delivery state, store availability, and live confirmation." : "Manage approved, scheduled, distributed, and live catalog releases."}>
            <div className="grid gap-3">
              {catalogReleases.map((release) => <button key={release.id} type="button" onClick={() => { setSelectedReleaseId(release.id); setCatalogTab("overview"); }} className="surface-list-item pressable p-4 text-left" style={selectedCatalogRelease?.id === release.id ? { borderColor: "var(--accent)", background: "var(--accent-soft)" } : undefined}><div className="flex gap-3">{release.artworkUrl ? <img src={release.artworkUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" /> : <div className="h-16 w-16 shrink-0 rounded-xl border border-dashed" style={{ borderColor: "var(--border)" }} />}<div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{release.releaseTitle || release.trackName}</p><p className="mt-1 truncate text-sm" style={{ color: "var(--text-muted)" }}>{release.artistName} · {release.releaseType.toUpperCase()} · {release.tracks?.length ?? 0} tracks</p></div><StatusPill label={release.status.replace(/_/g, " ")} active /></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-soft)" }}><span>Release {release.releaseDate || "—"}</span><span>UPC {release.upcCode || "Pending"}</span><span>{release.distributionStores?.filter((store) => store.status === "Live").length ?? 0} stores live</span></div></div></div></button>)}
              {catalogReleases.length === 0 ? <EmptyState copy="No approved or live releases yet. Releases will appear here after they are sent for distribution or marked live." /> : null}
            </div>
          </SurfaceSection>
          <SurfaceSection title={activeTab === "delivery" ? "Delivery Details" : "Catalog Details"} description="Distribution state, identifiers, stores, links, and reporting for the selected release.">
            {selectedCatalogRelease ? <div className="grid gap-5">
              <div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="text-2xl font-semibold">{selectedCatalogRelease.releaseTitle || selectedCatalogRelease.trackName}</h3><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{selectedCatalogRelease.artistName} · {selectedCatalogRelease.releaseType.toUpperCase()} · Release {selectedCatalogRelease.releaseDate || "—"}</p></div><StatusPill label={selectedCatalogRelease.status.replace(/_/g, " ")} active /></div>
              <nav className="flex gap-1 overflow-x-auto rounded-2xl border p-1.5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }} aria-label="Catalog sections">{(["overview", "tracks", "distribution", "identifiers", "stores", "promolink", "earnings", "activity"] as const).map((tab) => <button key={tab} type="button" onClick={() => setCatalogTab(tab)} className={catalogTab === tab ? "btn-primary pressable shrink-0 px-3 py-2 text-xs capitalize" : "pressable shrink-0 rounded-full px-3 py-2 text-xs font-semibold capitalize"} style={catalogTab === tab ? undefined : { color: "var(--text-muted)" }}>{tab === "identifiers" ? "UPC / ISRC" : tab}</button>)}</nav>
              {catalogTab === "overview" ? <div className="grid gap-5 rounded-2xl border p-5 sm:grid-cols-[10rem,1fr]" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>{selectedCatalogRelease.artworkUrl ? <img src={selectedCatalogRelease.artworkUrl} alt={selectedCatalogRelease.releaseTitle} className="aspect-square w-full rounded-2xl object-cover" /> : <div className="aspect-square rounded-2xl border border-dashed" style={{ borderColor: "var(--border)" }} />}<div className="grid content-start gap-3 sm:grid-cols-2">{[["Title", selectedCatalogRelease.releaseTitle], ["Artist", selectedCatalogRelease.artistName], ["Label", selectedCatalogRelease.labelName || selectedCatalogRelease.labelDisplayName], ["Language", selectedCatalogRelease.language], ["Genre", [selectedCatalogRelease.primaryGenre, selectedCatalogRelease.secondaryGenre].filter(Boolean).join(" / ")], ["UPC", selectedCatalogRelease.upcCode || "Pending"]].map(([label, value]) => <div key={String(label)}><p className="text-xs font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--text-soft)" }}>{label}</p><p className="mt-1 text-sm font-semibold">{value || "—"}</p></div>)}</div></div> : null}
              {catalogTab === "tracks" ? <div className="grid gap-3">{(selectedCatalogRelease.tracks ?? []).map((track) => <article key={track.id} className="surface-list-item p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{track.trackNumber}. {track.trackTitle}</p><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{track.primaryArtist} · ISRC {track.isrc || "Pending"}</p></div><StatusPill label={track.explicitContent ? "Explicit" : "Clean"} active={track.explicitContent} /></div>{track.audioUrl ? <audio controls preload="none" className="mt-3 w-full" src={track.audioUrl} /> : null}</article>)}</div> : null}
              {catalogTab === "distribution" ? <div className="grid gap-3 sm:grid-cols-2">{[["Distribution status", selectedCatalogRelease.status.replace(/_/g, " ")], ["Distribution release ID", selectedCatalogRelease.distributorReleaseId], ["Scheduled / release date", selectedCatalogRelease.releaseDate], ["Distributed at", selectedCatalogRelease.distributedAt ? new Date(selectedCatalogRelease.distributedAt).toLocaleString("en-IN") : null], ["Live confirmation", selectedCatalogRelease.liveAt ? new Date(selectedCatalogRelease.liveAt).toLocaleString("en-IN") : "Awaiting confirmation"], ["Last updated", selectedCatalogRelease.lastEditedAt ? new Date(selectedCatalogRelease.lastEditedAt).toLocaleString("en-IN") : new Date(selectedCatalogRelease.createdAt).toLocaleString("en-IN")]].map(([label, value]) => <div key={String(label)} className="summary-card"><span>{label}</span><strong>{value || "—"}</strong></div>)}</div> : null}
              {catalogTab === "identifiers" ? <div className="grid gap-3"><div className="summary-card"><span>Release UPC</span><strong>{selectedCatalogRelease.upcCode || "Pending"}</strong></div>{(selectedCatalogRelease.tracks ?? []).map((track) => <div key={track.id} className="summary-card"><span>{track.trackNumber}. {track.trackTitle}</span><strong>{track.isrc || "Pending"}</strong></div>)}</div> : null}
              {catalogTab === "stores" ? <AdminStoreStatusEditor release={selectedCatalogRelease} /> : null}
              {catalogTab === "promolink" ? <div className="rounded-2xl border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>{typeof selectedCatalogRelease.metadata?.promolinkUrl === "string" ? <a href={selectedCatalogRelease.metadata.promolinkUrl} target="_blank" rel="noreferrer" className="btn-primary inline-flex">View Promolink</a> : <p className="text-sm" style={{ color: "var(--text-muted)" }}>Promolink will appear after the release is scheduled or live.</p>}</div> : null}
              {catalogTab === "earnings" ? <div className="rounded-2xl border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>{selectedCatalogRelease.analytics ? <div className="grid gap-3 sm:grid-cols-2">{Object.entries(selectedCatalogRelease.analytics).filter(([, value]) => typeof value === "number").map(([label, value]) => <div key={label} className="summary-card"><span>{label.replace(/([A-Z])/g, " $1")}</span><strong>{Number(value).toLocaleString("en-IN")}</strong></div>)}</div> : <p className="text-sm leading-6" style={{ color: "var(--text-muted)" }}>Earnings usually take around 1.5 months to reflect after platform reporting and distributor processing.</p>}</div> : null}
              {catalogTab === "activity" ? <div className="grid gap-2">{releaseAudit.map((event) => <div key={event.id} className="summary-card"><span><strong>{event.action.replace(/_/g, " ")}</strong><br /><small>{new Date(event.createdAt).toLocaleString("en-IN")}</small></span><span>Recorded</span></div>)}{releaseAudit.length === 0 ? <EmptyState copy="No catalog activity has been recorded yet." /> : null}</div> : null}
              <div className="flex flex-wrap gap-2">{["scheduled", "processing", "awaiting_live_confirmation", "partially_live", "delivered", "sent"].includes(selectedCatalogRelease.status) ? <button type="button" disabled={isPending} onClick={() => setConfirmStatusAction("live")} className="btn-primary pressable">Mark Live</button> : null}<button type="button" onClick={() => setCatalogTab("stores")} className="btn-outline pressable">Update Store Status</button>{selectedCatalogRelease.analytics ? <button type="button" onClick={() => setCatalogTab("earnings")} className="btn-outline pressable">View Earnings</button> : null}</div>
            </div> : <EmptyState copy="Select a catalog release to manage its distribution details." />}
          </SurfaceSection>
        </div>
      ) : null}

      {activeTab === "distribution-queue" ? (
        <div className="grid gap-6 xl:grid-cols-[0.92fr,1.08fr]">
          <SurfaceSection title="All Submissions" description="Review submitted releases, inspect readiness, and open the complete operations record.">
            <div className="grid gap-4">
              <div className="grid gap-3 rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                <input className="field" value={queueSearch} onChange={(event) => setQueueSearch(event.target.value)} placeholder="Search title, artist, UPC, ISRC, or user email" aria-label="Search submissions" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <select className="field" value={queueStatus} onChange={(event) => setQueueStatus(event.target.value)} aria-label="Filter by status"><option value="all">All statuses</option>{Array.from(new Set(releases.map((release) => release.status))).map((status) => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}</select>
                  <select className="field" value={queueType} onChange={(event) => setQueueType(event.target.value)} aria-label="Filter by release type"><option value="all">All release types</option><option value="single">Single</option><option value="ep">EP</option><option value="album">Album</option></select>
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{queueReleases.length} of {releases.length} submissions</p>
              </div>
              {queueReleases.map((release) => {
                const assetReady = Boolean(release.artworkUrl && (release.tracks ?? []).length && (release.tracks ?? []).every((track) => track.audioUrl));
                return <button key={release.id} type="button" onClick={() => { setSelectedReleaseId(release.id); setReviewTab("overview"); }} className="surface-list-item pressable p-4 text-left" style={selectedRelease?.id === release.id ? { borderColor: "var(--accent)", background: "var(--accent-soft)" } : undefined}>
                  <div className="flex gap-3">
                    {release.artworkUrl ? <img src={release.artworkUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" /> : <div className="h-16 w-16 shrink-0 rounded-xl border border-dashed" style={{ borderColor: "var(--border)" }} />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold" style={{ color: "var(--text)" }}>{release.releaseTitle || release.trackName}</p><p className="mt-1 truncate text-sm" style={{ color: "var(--text-soft)" }}>{release.artistName} · {release.tracks?.length ?? 0} track{release.tracks?.length === 1 ? "" : "s"} · {release.releaseType.toUpperCase()}</p></div><StatusPill label={release.status.replace(/_/g, " ")} active /></div>
                      <div className="mt-3 grid gap-1 text-xs sm:grid-cols-2" style={{ color: "var(--text-muted)" }}><span>Submitted {release.submittedAt ? new Date(release.submittedAt).toLocaleDateString("en-IN") : "Not submitted"}</span><span>Release {release.releaseDate ? new Date(release.releaseDate).toLocaleDateString("en-IN") : "—"}</span><span>Payment {release.paymentStatus === "paid" ? "Verified" : release.paymentStatus ?? "Pending"}</span><span style={{ color: assetReady ? "var(--success)" : "var(--danger)" }}>Distribution {assetReady ? "Ready to check" : "Issues found"}</span></div>
                    </div>
                  </div>
                </button>;
              })}
              {queueReleases.length === 0 ? <EmptyState copy="No submissions match these filters. Submitted releases will appear here for review." /> : null}
            </div>
          </SurfaceSection>

          <SurfaceSection title="Selected Release Review" description="Inspect metadata, files, rights, readiness, and the complete activity record.">
            {selectedRelease ? (
              <div className="grid gap-5">
                <div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>{selectedRelease.releaseTitle || selectedRelease.trackName}</h3><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{selectedRelease.releaseType.toUpperCase()} · {selectedRelease.tracks?.length ?? 0} track{selectedRelease.tracks?.length === 1 ? "" : "s"} · {selectedRelease.artistName}</p><p className="mt-2 text-xs" style={{ color: "var(--text-soft)" }}>Submitted {selectedRelease.submittedAt ? new Date(selectedRelease.submittedAt).toLocaleString("en-IN") : "—"} · Release {selectedRelease.releaseDate || "—"} · {selectedRelease.ownerEmail || "Account email unavailable"}</p></div><StatusPill label={selectedRelease.status.replace(/_/g, " ")} active /></div>
                <nav className="flex gap-1 overflow-x-auto rounded-2xl border p-1.5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }} aria-label="Release review sections">{(["overview", "metadata", "tracks", "assets", "rights", "direnote", "activity"] as const).map((tab) => <button key={tab} type="button" onClick={() => setReviewTab(tab)} className={reviewTab === tab ? "btn-primary pressable shrink-0 px-3 py-2 text-xs capitalize" : "pressable shrink-0 rounded-full px-3 py-2 text-xs font-semibold capitalize"} style={reviewTab === tab ? undefined : { color: "var(--text-muted)" }}>{tab === "assets" ? "Artwork & Audio" : tab === "direnote" ? "Distribution readiness" : tab}</button>)}</nav>
                {reviewTab === "overview" ? <div className="grid gap-5 rounded-[1.4rem] border p-5 sm:grid-cols-[9rem,1fr] sm:items-start" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                  <div>
                    {selectedRelease.artworkUrl ? <img src={selectedRelease.artworkUrl} alt={selectedRelease.releaseTitle} className="aspect-square w-full rounded-2xl object-cover shadow-lg" /> : <div className="flex aspect-square w-full items-center justify-center rounded-2xl border border-dashed text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>No artwork</div>}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--accent)" }}>Operational summary</p>
                    <h3 className="mt-2 truncate text-xl font-semibold" style={{ color: "var(--text)" }}>{selectedRelease.releaseTitle || selectedRelease.trackName}</h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {[["Submitted", selectedRelease.submittedAt ? new Date(selectedRelease.submittedAt).toLocaleDateString("en-IN") : "Not submitted"], ["Release date", selectedRelease.releaseDate ? new Date(selectedRelease.releaseDate).toLocaleDateString("en-IN") : "Not scheduled"], ["Payment", selectedRelease.paymentStatus === "paid" ? "Verified" : "Pending"], ["DireNote", direNoteReadiness ? direNoteReadiness.ready ? "Ready" : `${(direNoteReadiness.issues || []).length} issue${(direNoteReadiness.issues || []).length === 1 ? "" : "s"}` : "Checking"]].map(([label, value]) => <div key={String(label)}><p className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--text-soft)" }}>{label}</p><p className="mt-1 text-sm font-semibold" style={{ color: label === "DireNote" && direNoteReadiness?.ready === false ? "var(--danger)" : "var(--text)" }}>{value}</p></div>)}
                    </div>
                  </div>
                </div> : null}
                {reviewTab === "metadata" ? <div className="grid gap-3 sm:grid-cols-2">{[["Release title", selectedRelease.releaseTitle], ["Release type", selectedRelease.releaseType], ["Primary artist", selectedRelease.artistName], ["Genre", selectedRelease.primaryGenre], ["Subgenre", selectedRelease.secondaryGenre], ["Mood", selectedRelease.mood], ["Language", selectedRelease.language], ["Label", selectedRelease.labelName || selectedRelease.labelDisplayName], ["Release date", selectedRelease.releaseDate], ["Original release date", selectedRelease.originalReleaseDate], ["UPC", selectedRelease.upcCode || (selectedRelease.releasePreviouslyReleased ? "Missing" : "Pending")], ["YouTube Content ID", selectedRelease.youtubeContentIdEnabled ? "Enabled" : "Disabled"], ["Previously released", selectedRelease.releasePreviouslyReleased ? "Yes" : "No"], ["Additional request", selectedRelease.adminInstructions]].map(([label, value]) => <div key={String(label)} className="summary-card"><span>{label}</span><strong>{value || "—"}</strong></div>)}</div> : null}
                {reviewTab === "assets" ? <div className="grid gap-4"><div className="grid gap-4 sm:grid-cols-2"><div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>{selectedRelease.artworkUrl ? <><img src={selectedRelease.artworkUrl} alt={selectedRelease.releaseTitle} className="aspect-square w-full rounded-xl object-cover" /><a href={selectedRelease.artworkUrl} target="_blank" rel="noreferrer" className="btn-outline mt-3 inline-flex text-xs">Open artwork file</a></> : <EmptyState copy="Artwork file is missing." />}</div><div className="grid gap-3">{(selectedRelease.tracks ?? []).map((track) => <article key={track.id} className="surface-list-item p-4"><p className="font-semibold">{track.trackNumber}. {track.trackTitle}</p>{track.audioUrl ? <audio controls preload="none" className="mt-3 w-full" src={track.audioUrl} /> : <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>Audio file missing</p>}</article>)}</div></div><AdminStoreStatusEditor release={selectedRelease} /></div> : null}
                {reviewTab === "rights" ? <div className="grid gap-3 sm:grid-cols-2">{[["Content type", selectedRelease.contentType], ["Copyright owner", selectedRelease.copyrightOwner], ["Publishing rights", selectedRelease.publishingRights], ["Ownership confirmed", selectedRelease.ownershipConfirmed ? "Yes" : "No"], ["Terms accepted", selectedRelease.agreedToTerms ? "Yes" : "No"], ["License proof", selectedRelease.licenseReceiptUrl || selectedRelease.license_receipt_url || selectedRelease.licenseDocumentUrl || selectedRelease.beatLicenseUrl], ["AI / Suno proof", selectedRelease.sunoReceiptUrl || selectedRelease.suno_receipt_url || selectedRelease.sunoLink], ["Unauthorised samples", selectedRelease.noUnauthorizedSamples ? "Confirmed none" : "Not confirmed"]].map(([label, value]) => <div key={String(label)} className="summary-card"><span>{label}</span>{typeof value === "string" && /^https?:/.test(value) ? <a className="font-semibold underline" href={value} target="_blank" rel="noreferrer">Open proof</a> : <strong>{value || "—"}</strong>}</div>)}</div> : null}
                {reviewTab === "activity" ? <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><h3 className="font-semibold">Activity &amp; Audit Timeline ({releaseAudit.length})</h3><div className="mt-4 grid gap-2">{releaseAudit.map((event) => <div key={event.id} className="summary-card"><span><strong>{event.action.replace(/_/g, " ")}</strong><br /><small>{new Date(event.createdAt).toLocaleString("en-IN")}</small></span><span className="max-w-[50%] truncate text-xs">{event.metadata ? JSON.stringify(event.metadata) : "Recorded"}</span></div>)}{releaseAudit.length === 0 ? <EmptyState copy="No activity has been recorded yet." /> : null}</div></div> : null}
                {reviewTab === "direnote" ? <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold" style={{ color: "var(--text)" }}>DireNote readiness</p>
                      <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Checklist uses saved release assets and metadata. Failed items should be fixed before distributor handoff.</p>
                      {!selectedRelease.mood?.trim() ? <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>Missing mood. DireNote requires metadata.mood as a string.</p> : null}
                    </div>
                    <StatusPill label={selectedRelease.artworkUrl && (selectedRelease.tracks ?? []).every((track) => track.audioUrl) ? "Assets ready" : "Fix assets"} active={Boolean(selectedRelease.artworkUrl && (selectedRelease.tracks ?? []).every((track) => track.audioUrl))} />
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {[
                      ["Artwork URL", Boolean(selectedRelease.artworkUrl)],
                      ["Audio URLs", (selectedRelease.tracks ?? []).length > 0 && (selectedRelease.tracks ?? []).every((track) => Boolean(track.audioUrl))],
                      ["Release date", Boolean(selectedRelease.releaseDate)],
                      ["Genre / language", Boolean(selectedRelease.primaryGenre && selectedRelease.language)],
                      ["Mood", Boolean(typeof selectedRelease.mood === "string" && selectedRelease.mood.trim())],
                      ["Writer/composer names", (selectedRelease.tracks ?? []).every((track) => Boolean(track.songwriters && track.composers))],
                      ["Rights confirmation", Boolean(selectedRelease.ownershipConfirmed && selectedRelease.agreedToTerms)]
                    ].map(([label, ready]) => (
                      <div key={String(label)} className="summary-card"><span>{label}</span><span>{ready ? "Ready" : "Needs fix"}</span></div>
                    ))}
                  </div>
                  {direNoteReadiness ? <div className="mt-4 grid gap-2">{(direNoteReadiness.issues || []).map((issue) => <div key={`${issue.category}-${issue.field}`} className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--danger)", background: "var(--danger-soft)" }}><p className="font-semibold">{issue.category} · {issue.field}</p><p className="mt-1">{issue.message}</p><p className="mt-1 text-xs">Fix: {issue.fixSuggestion}</p></div>)}{(direNoteReadiness.warnings || []).map((issue) => <div key={`warning-${issue.field}`} className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)" }}><p className="font-semibold">Warning · {issue.category}</p><p className="mt-1">{issue.message}</p></div>)}</div> : null}
                </div> : null}
                <div className="sticky bottom-3 z-10 grid gap-3 rounded-2xl border p-3 shadow-xl sm:grid-cols-2 xl:grid-cols-3" style={{ borderColor: "var(--border)", background: "var(--card-strong)" }}>
                  {["submitted", "in_queue", "changes_requested", "failed", "draft"].includes(selectedRelease.status) ? <button type="button" disabled={isPending || !hasPermission("releases.review")} title={!hasPermission("releases.review") ? "Requires releases.review permission" : undefined} onClick={() => updateReleaseStatus(selectedRelease.id, "under_review")} className="btn-outline pressable disabled:opacity-45">Start Review</button> : null}
                  {selectedRelease.status === "under_review" ? <button type="button" disabled={isPending || !hasPermission("releases.review")} title={!hasPermission("releases.review") ? "Requires releases.review permission" : undefined} onClick={() => setConfirmStatusAction("approved")} className="btn-primary pressable disabled:opacity-45">Approve</button> : null}
                  {selectedRelease.status === "approved" || selectedRelease.status === "failed" ? <button type="button" disabled={isPending || isSubmittingToDireNote || direNoteCooldownSeconds > 0 || direNoteReadiness?.ready === false || !hasPermission(selectedRelease.status === "failed" ? "distribution.retry" : "distribution.submit")} title={direNoteCooldownSeconds > 0 ? `DireNote cooldown: ${direNoteCooldownLabel} remaining` : !hasPermission(selectedRelease.status === "failed" ? "distribution.retry" : "distribution.submit") ? `Requires ${selectedRelease.status === "failed" ? "distribution.retry" : "distribution.submit"} permission` : undefined} onClick={() => setConfirmStatusAction("sent")} className="btn-primary pressable disabled:opacity-45">{isSubmittingToDireNote ? "Submitting to DireNote..." : direNoteCooldownSeconds > 0 ? `Try again in ${direNoteCooldownLabel}` : selectedRelease.status === "failed" ? "Retry Send" : "Send to DireNote"}</button> : null}
                  {selectedRelease.upcCode ? <button type="button" disabled={isPending || !hasPermission("releases.read")} title={!hasPermission("releases.read") ? "Requires releases.read permission" : undefined} onClick={() => syncDireNoteRelease(selectedRelease.id)} className="btn-outline pressable disabled:opacity-45">Sync with DireNote</button> : null}
                  {["sent", "scheduled", "processing", "awaiting_live_confirmation", "partially_live", "delivered"].includes(selectedRelease.status) ? <button type="button" disabled={isPending || !hasPermission("distribution.confirm_status")} title={!hasPermission("distribution.confirm_status") ? "Requires distribution.confirm_status permission" : undefined} onClick={() => setConfirmStatusAction("live")} className="btn-primary pressable disabled:opacity-45">Mark Live</button> : null}
                  {["submitted", "in_queue", "under_review", "approved"].includes(selectedRelease.status) ? <button type="button" disabled={isPending || !hasPermission("releases.review")} title={!hasPermission("releases.review") ? "Requires releases.review permission" : undefined} onClick={() => openReview("changes_requested")} className="btn-outline pressable disabled:opacity-45" style={{ color: "var(--money)" }}>Request Metadata Changes</button> : null}
                  {["submitted", "in_queue", "under_review", "approved"].includes(selectedRelease.status) ? <button type="button" disabled={isPending || !hasPermission("releases.review")} title={!hasPermission("releases.review") ? "Requires releases.review permission" : undefined} onClick={() => openReview("rejected")} className="btn-outline pressable disabled:opacity-45" style={{ color: "var(--danger)" }}>Reject Release</button> : null}
                  {selectedRelease.status === "changes_requested" ? <div className="rounded-full border px-4 py-2 text-center text-sm font-semibold" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>Awaiting user correction</div> : null}
                </div>
                {reviewTab === "tracks" ? <div className="grid gap-3">
                  {(selectedRelease.tracks ?? []).map((track) => (
                    <details key={track.id} className="surface-list-item p-4" open={(selectedRelease.tracks?.length ?? 0) === 1}><summary className="cursor-pointer"><div className="inline-flex w-[calc(100%-1.5rem)] items-start justify-between gap-3 align-middle"><div><p className="font-semibold" style={{ color: "var(--text)" }}>{track.trackNumber}. {track.trackTitle}</p><p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{track.primaryArtist} · {track.duration}</p></div><StatusPill label={track.explicitContent ? "Explicit" : "Clean"} active={track.explicitContent} /></div></summary><div className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-2" style={{ borderColor: "var(--border)" }}>{[["Version", track.version], ["Featured artists", track.featuredArtists], ["Songwriters", track.songwriters], ["Composers", track.composers], ["Producers", track.producers], ["ISRC", track.isrc || (track.previouslyReleased ? "Missing" : "Pending")], ["Lyrics", track.trackLyrics || track.lyrics], ["Audio", track.audioUrl ? "Ready" : "Missing"]].map(([label, value]) => <div key={String(label)} className="summary-card"><span>{label}</span><strong className="max-w-[60%] truncate">{value || "—"}</strong></div>)}</div></details>
                  ))}
                </div> : null}
              </div>
            ) : <EmptyState copy="Select a release to open the detailed view." />}
          </SurfaceSection>
        </div>
      ) : null}

      {activeTab === "users" ? (
        <SurfaceSection title="Users" description="Review email, release counts, activity, and role assignments.">
          <div className="mb-5 grid gap-3 border-b pb-5 md:grid-cols-[minmax(0,1fr),180px,180px]" style={{ borderColor: "var(--border)" }}>
            <input className="field" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Search by name, email, or user ID" aria-label="Search users" />
            <select className="field" value={userRoleFilter} onChange={(event) => setUserRoleFilter(event.target.value)} aria-label="Filter users by role"><option value="all">All roles</option><option value="customer">Artists</option><option value="producer">Producers</option><option value="admin">Admins</option></select>
            <select className="field" value={userActivityFilter} onChange={(event) => setUserActivityFilter(event.target.value)} aria-label="Filter users by activity"><option value="all">Any activity</option><option value="recent">Active in 30 days</option><option value="inactive">Inactive 30+ days</option></select>
          </div>
          <div className="grid gap-4">
            {filteredUsers.map((user) => (
              <article key={user.id} className="surface-list-item p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                   <div className="flex min-w-0 items-start gap-3">
                     <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold" style={{ background: "var(--bg-soft)", color: "var(--text)" }}>{user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : user.name.slice(0, 1).toUpperCase()}</span>
                     <div className="min-w-0"><p className="truncate font-semibold" style={{ color: "var(--text)" }}>{user.name}</p>
                     <p className="mt-1 truncate text-sm" style={{ color: "var(--text-soft)" }}>{user.email}</p>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      <span>{releaseCountByUser.get(user.id) ?? 0} releases</span>
                      <span>{latestUserActivity.get(user.id) ? new Date(latestUserActivity.get(user.id) as string).toLocaleDateString() : "No activity yet"}</span>
                     </div>
                     </div>
                  </div>
                   <div className="grid gap-2 sm:grid-cols-3">
                    {(["customer", "producer", "admin"] as UserRole[]).map((role) => (
                      <button key={role} type="button" onClick={() => updateRole(user, role)} className={user.role === role ? "btn-primary pressable" : "btn-outline pressable"}>{role}</button>
                    ))}
                   </div>
                 </div>
                 <AdminUserBenefits user={user} onCreditChange={(balance) => setUsers((items) => items.map((item) => item.id === user.id ? { ...item, referralCredits: balance } : item))} />
               </article>
            ))}
            {filteredUsers.length === 0 ? <EmptyState copy="No users match the selected search and filters." /> : null}
          </div>
        </SurfaceSection>
      ) : null}

      {activeTab === "earnings-entry" ? <AdminEarningsEntry users={users} releases={releases} /> : null}

      {activeTab === "royalties" ? <div className="grid gap-6"><AdminPayoutManager /><AdminPayoutReports /></div> : null}

      {(activeTab === "payments" || activeTab === "revenue") ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <SurfaceSection title="Distribution payments" description="Track Rs 99 submissions, subscriptions, and payment outcomes.">
            <div className="grid gap-4">
              {initialDistributionOrders.filter((order) => searchMatch(order.id, order.plan, order.paymentStatus, order.releaseId)).map((order) => {
                const linkedRelease = releases.find((release) => release.id === order.releaseId);
                return (
                  <article key={order.id} className="surface-list-item p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold" style={{ color: "var(--text)" }}>Distribution order #{order.id}</p>
                        <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{order.plan} / {formatMoney(order.amount)}</p>
                      </div>
                      <StatusPill label={order.paymentStatus} active={order.paymentStatus === "paid"} />
                    </div>
                    <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>{linkedRelease ? linkedRelease.releaseTitle : "Release not linked yet"}</p>
                  </article>
                );
              })}
              {initialDistributionOrders.length === 0 ? <EmptyState copy="No distribution orders yet." /> : null}
            </div>
          </SurfaceSection>

          <SurfaceSection title="Beat store payments" description="Verified storefront orders and payment state.">
            <div className="grid gap-4">
              {initialOrders.filter((order) => searchMatch(order.id, order.buyerEmail, order.paymentStatus, order.razorpayOrderId)).map((order) => (
                <article key={order.id} className="surface-list-item p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold" style={{ color: "var(--text)" }}>Order #{order.id}</p>
                      <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{order.buyerEmail ?? `User #${order.userId}`}</p>
                    </div>
                    <StatusPill label={order.paymentStatus} active={order.paymentStatus === "paid"} />
                  </div>
                  <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>{formatMoney(order.amount)} / {order.razorpayOrderId}</p>
                </article>
              ))}
              {initialOrders.length === 0 ? <EmptyState copy="No beat store orders yet." /> : null}
            </div>
          </SurfaceSection>
        </div>
      ) : null}

      {activeTab === "artists" ? (
        <SurfaceSection title="Artist profiles" description="Every saved artist profile with live store links when available.">
          <div className="grid gap-4 lg:grid-cols-2">
            {initialArtistProfiles.filter((profile) => searchMatch(profile.name, profile.userId)).map((profile) => (
              <article key={profile.id} className="surface-list-item flex gap-4 p-4">
                {profile.imageUrl ? <img src={profile.imageUrl} alt={profile.name} className="h-16 w-16 rounded-2xl object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>{profile.name.slice(0, 1)}</div>}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold" style={{ color: "var(--text)" }}>{profile.name}</p>
                  <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>User #{profile.userId} · {profile.followers ? `${profile.followers.toLocaleString("en-IN")} followers` : "No follower data"}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {profile.spotifyUrl ? <a href={profile.spotifyUrl} target="_blank" rel="noreferrer" className="rounded-full border px-3 py-1" style={{ borderColor: "var(--border)", color: "var(--text)" }}>Spotify</a> : null}
                    {profile.appleUrl ? <a href={profile.appleUrl} target="_blank" rel="noreferrer" className="rounded-full border px-3 py-1" style={{ borderColor: "var(--border)", color: "var(--text)" }}>Apple Music</a> : null}
                  </div>
                </div>
              </article>
            ))}
            {initialArtistProfiles.length === 0 ? <EmptyState copy="No artist profiles created yet." /> : null}
          </div>
        </SurfaceSection>
      ) : null}

      {(activeTab === "content" || activeTab === "settings") ? (
        <div className="grid gap-6">
          {activeTab === "settings" ? <DireNoteDiagnostics /> : null}
          {activeTab === "settings" ? <SurfaceSection title="Transactional email" description="Resend delivery configuration, attempts, failures, and retries."><div className="flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><div><p className="font-semibold">Email logs</p><p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>Review every transactional email attempt and retry failed deliveries safely.</p></div><a href="/admin/email-logs" className="btn-primary w-fit">Open email logs</a></div></SurfaceSection> : null}
          <AdminContentManager initialProducerProfiles={initialProducerProfiles} initialSiteSettings={initialSiteSettings} />
        </div>
      ) : null}

      {activeTab === "timed-playlists" ? (
        <AdminTimedPlaylistManager />
      ) : null}

      {activeTab === "notifications" ? (
        <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
          <SurfaceSection title="Generated notifications" description="Read-only stream of notifications created by platform events.">
            <form onSubmit={sendAdminNotification} className="mb-6 grid gap-3 rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
              <div className="grid gap-3 md:grid-cols-3">
                <select name="target" className="field" defaultValue="all">
                  <option value="all">All users</option>
                  <option value="customers">All customers</option>
                  <option value="producers">All producers</option>
                  <option value="admins">All admins</option>
                  <option value="user">Specific user ID</option>
                </select>
                <input name="userId" className="field" placeholder="User ID, if specific" />
                <select name="type" className="field" defaultValue="system">
                  <option value="system">System</option><option value="release">Release</option><option value="beat">Beat</option><option value="order">Order</option><option value="payout">Payout</option><option value="account">Account</option>
                </select>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr,0.5fr]">
                <input name="title" required className="field" placeholder="Notification title" />
                <select name="priority" className="field" defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select>
              </div>
              <textarea name="message" required minLength={5} className="field min-h-24" placeholder="Notification body" />
              <div className="grid gap-3 md:grid-cols-2">
                <input name="href" className="field" placeholder="Optional link, e.g. /dashboard/releases" />
                <input name="actionLabel" className="field" placeholder="Optional CTA label" />
              </div>
              <button type="submit" disabled={isPending} className="btn-primary pressable w-fit">{isPending ? "Sending..." : "Send notification"}</button>
              {notificationFeedback ? <p className="text-sm" style={{ color: "var(--text)" }}>{notificationFeedback}</p> : null}
            </form>
            <div className="grid gap-4">
              {initialNotifications.filter((notification) => searchMatch(notification.title, notification.body, notification.type, notification.userId)).slice(0, 12).map((notification) => (
                <article key={notification.id} className="surface-list-item p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold" style={{ color: "var(--text)" }}>{notification.title}</p>
                      <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{notification.body}</p>
                      <p className="mt-3 text-xs" style={{ color: "var(--text-soft)" }}>User #{notification.userId} / {new Date(notification.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusPill label={notification.type} active />
                      <StatusPill label={notification.priority} active={notification.priority === "high"} />
                    </div>
                  </div>
                  {notification.href ? <p className="mt-3 truncate text-xs" style={{ color: "var(--text-soft)" }}>{notification.actionLabel ?? "Open"}: {notification.href}</p> : null}
                </article>
              ))}
              {initialNotifications.length === 0 ? <EmptyState copy="No generated notifications yet." /> : null}
            </div>
          </SurfaceSection>

          <div className="grid gap-6">
            <SurfaceSection title="Counts by type">
              <div className="grid gap-3">
                {notificationCountsByType.map(([type, count]) => (
                  <div key={type} className="summary-card">
                    <span className="capitalize" style={{ color: "var(--text-muted)" }}>{type}</span>
                    <span className="font-semibold" style={{ color: "var(--text)" }}>{count}</span>
                  </div>
                ))}
                {notificationCountsByType.length === 0 ? <EmptyState copy="No notification types recorded yet." /> : null}
              </div>
            </SurfaceSection>
            <SurfaceSection title="High priority">
              <div className="grid gap-3">
                {highPriorityNotifications.slice(0, 6).map((notification) => (
                  <article key={`high-${notification.id}`} className="surface-list-item p-4" style={{ borderColor: "rgba(248,113,113,0.42)" }}>
                    <p className="font-semibold" style={{ color: "var(--text)" }}>{notification.title}</p>
                    <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>User #{notification.userId} / {notification.type}</p>
                  </article>
                ))}
                {highPriorityNotifications.length === 0 ? <EmptyState copy="No high-priority notifications." /> : null}
              </div>
            </SurfaceSection>
          </div>
        </div>
      ) : null}

      {activeTab === "support" ? (
        <SurfaceSection title="Support tickets" description="Customer and producer requests with admin status control.">
          <div className="grid gap-4">
            {supportTickets.filter((ticket) => searchMatch(ticket.subject, ticket.message, ticket.category, ticket.status, ticket.userId)).map((ticket) => (
              <article key={ticket.id} className="surface-list-item p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <p className="font-semibold" style={{ color: "var(--text)" }}>{ticket.subject}</p>
                    <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{ticket.message}</p>
                    <p className="mt-3 text-xs" style={{ color: "var(--text-soft)" }}>User #{ticket.userId} / {new Date(ticket.createdAt).toLocaleString()}</p>
                    <p className="mt-2 text-xs" style={{ color: "var(--text-soft)" }}>Category: {ticket.category ?? "general"}{ticket.relatedReleaseId ? ` · Release #${ticket.relatedReleaseId}` : ""}{ticket.relatedPurchaseId ? ` · Purchase #${ticket.relatedPurchaseId}` : ""}{ticket.relatedPayoutId ? ` · Payout #${ticket.relatedPayoutId}` : ""}</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-4">
                    {(["open", "in_progress", "resolved", "closed"] as SupportTicket["status"][]).map((status) => (
                      <button key={status} type="button" disabled={isPending} onClick={() => updateTicketStatus(ticket.id, status)} className={ticket.status === status ? "btn-primary pressable px-3 py-2 text-xs" : "btn-outline pressable px-3 py-2 text-xs"}>
                        {status.replace(/_/g, " ")}
                      </button>
                    ))}
                  </div>
                </div>
              </article>
            ))}
            {supportTickets.length === 0 ? <EmptyState copy="No support tickets yet." /> : null}
          </div>
        </SurfaceSection>
      ) : null}

      {activeTab === "producers" ? <div className="grid gap-6"><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Producers" value={producerManagement.length} /><StatCard label="Active beats" value={producerManagement.reduce((sum, producer) => sum + producer.activeBeats, 0)} /><StatCard label="Gross sales" value={formatMoney(producerManagement.reduce((sum, producer) => sum + producer.grossRevenue, 0))} /><StatCard label="Producer earnings 70%" value={formatMoney(producerManagement.reduce((sum, producer) => sum + producer.producerEarnings, 0))} /></section><SurfaceSection title="Producer Management" description="Manage producer access, public profiles, beat catalogs, verified 70/30 sales, and payout balances."><div className="grid gap-4">{producerManagement.filter((producer) => searchMatch(producer.name, producer.email, producer.status)).map((producer) => <article key={producer.id} className="surface-list-item p-4"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="flex gap-4">{producer.profile?.coverPhotoUrl || producer.profile?.avatarUrl ? <img src={producer.profile.coverPhotoUrl || producer.profile.avatarUrl} alt="" className="h-16 w-16 rounded-2xl object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-2xl border font-semibold" style={{ borderColor: "var(--border)" }}>{producer.name.slice(0, 1)}</div>}<div><p className="font-semibold">{producer.profile?.displayName || producer.name}</p><p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{producer.email}</p><div className="mt-2"><StatusPill label={producer.status} active={producer.status === "active"} /></div></div></div><div className="grid gap-2 sm:grid-cols-3"><div className="summary-card"><span>Beats</span><strong>{producer.activeBeats}/{producer.totalBeats}</strong></div><div className="summary-card"><span>Sales</span><strong>{producer.totalSales}</strong></div><div className="summary-card"><span>Available</span><strong>{formatMoney(producer.availableBalance)}</strong></div></div></div><div className="mt-4 grid gap-2 sm:grid-cols-4"><label className="btn-outline pressable text-center cursor-pointer">Change Photo<input type="file" accept="image/*" className="hidden" onChange={(e) => updateProducerPhoto(producer.id, e.target.files?.[0])} /></label><button type="button" onClick={() => selectAdminTab("operations")} className="btn-outline pressable">View Beats</button><button type="button" onClick={() => selectAdminTab("royalties")} className="btn-outline pressable">View Payouts</button><button type="button" onClick={() => { const linked = users.find((user) => user.id === producer.id); if (linked) updateRole(linked, "customer"); }} className="btn-outline pressable" style={{ color: "var(--danger)" }}>Revoke Producer Role</button></div></article>)}{producerManagement.length === 0 ? <EmptyState copy="No producers found. Grant producer access from Admin Portal → Users." /> : null}</div></SurfaceSection></div> : null}

      {activeTab === "operations" ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <SurfaceSection title="Beats" description="Enable or disable storefront inventory.">
            <div className="grid gap-4">
              {beats.filter((beat) => searchMatch(beat.title, beat.genre, beat.mood, beat.status)).map((beat) => (
                <article key={beat.id} className="surface-list-item p-4">
                  <div className="flex flex-col gap-3">
                    <div>
                      <p className="font-semibold" style={{ color: "var(--text)" }}>{beat.title}</p>
                      <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>Rs {beat.price} / {beat.genre} / {beat.mood}</p>
                      <div className="mt-2"><StatusPill label={(beat.status ?? (beat.enabled ? "APPROVED" : "PENDING_REVIEW")).replace(/_/g, " ")} active={beat.status === "PENDING_REVIEW"} /></div>
                      {beat.reviewIssues?.reason ? <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>{beat.reviewIssues.reason}</p> : null}
                    </div>
                    <div className="grid gap-2"><button type="button" onClick={() => reviewBeat(beat, "approved")} className="btn-primary pressable">Approve beat</button><button type="button" onClick={() => reviewBeat(beat, "changes_requested")} className="btn-outline pressable">Request corrections</button><button type="button" onClick={() => toggleBeat(beat)} className="btn-outline pressable">{beat.enabled ? "Disable storefront" : "Keep hidden"}</button></div>
                  </div>
                </article>
              ))}
            </div>
          </SurfaceSection>

          <SurfaceSection title="Producer applications" description="Approve or reject producer onboarding.">
            <div className="grid gap-4">
              {applications.filter((application) => searchMatch(application.artistName, application.email, application.genreFocus, application.status)).map((application) => (
                <article key={application.id} className="surface-list-item p-4">
                  <p className="font-semibold" style={{ color: "var(--text)" }}>{application.artistName}</p>
                  <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{application.email} / {application.genreFocus}</p>
                  <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>{application.message}</p>
                  {application.status === "pending" ? <div className="mt-4 grid gap-2"><button type="button" onClick={() => reviewApplication(application.id, "approved")} className="btn-primary pressable">Approve</button><button type="button" onClick={() => reviewApplication(application.id, "rejected")} className="btn-outline pressable">Reject</button></div> : <div className="mt-4"><StatusPill label={application.status} /></div>}
                </article>
              ))}
              {applications.length === 0 ? <EmptyState copy="No producer applications yet." /> : null}
            </div>
          </SurfaceSection>

          <SurfaceSection title="Partnership leads" description="Inbound business development and partnership requests.">
            <div className="grid gap-4">
              {initialLeads.filter((lead) => searchMatch(lead.name, lead.email, lead.collaborationType)).map((lead) => (
                <article key={lead.id} className="surface-list-item p-4">
                  <p className="font-semibold" style={{ color: "var(--text)" }}>{lead.name}</p>
                  <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{lead.email} / {lead.collaborationType}</p>
                  <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>{lead.message}</p>
                </article>
              ))}
              {initialLeads.length === 0 ? <EmptyState copy="No partnership leads yet." /> : null}
            </div>
          </SurfaceSection>
        </div>
      ) : null}
      {(activeTab === "analytics" || activeTab === "contracts" || activeTab === "promotions" || activeTab === "fraud" || activeTab === "team") ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
          <SurfaceSection title={activeTab === "analytics" ? "Platform analytics" : activeTab === "contracts" ? "Contracts" : activeTab === "promotions" ? "Promotion operations" : activeTab === "fraud" ? "Fraud detection" : "Team management"} description="Executive module view using live HYMN platform signals while preserving the existing backend operations.">
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard label="Total artists" value={users.filter((user) => user.role === "customer").length} />
              <StatCard label="Active releases" value={releases.length} />
              <StatCard label="Monthly revenue" value={formatMoney(distributionRevenue + commerceRevenue)} />
              <StatCard label="Pending reviews" value={pendingReviews} />
            </div>
            <div className="mt-6 grid gap-3">
              {releases.slice(0, 5).map((release) => (
                <article key={`${activeTab}-${release.id}`} className="surface-list-item p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold" style={{ color: "var(--text)" }}>{release.releaseTitle}</p>
                      <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{release.artistName} / {release.status.replace(/_/g, " ")}</p>
                    </div>
                    <StatusPill label={release.status.replace(/_/g, " ")} />
                  </div>
                </article>
              ))}
            </div>
          </SurfaceSection>
          <SurfaceSection title="Operational shortcuts" description="Fast paths into the live systems that already power HYMN.">
            <div className="grid gap-3">
              <button type="button" onClick={() => setActiveTab("releases")} className="btn-primary pressable">Open release queue</button>
              <button type="button" onClick={() => setActiveTab("revenue")} className="btn-outline pressable">Review financials</button>
              <button type="button" onClick={() => setActiveTab("producers")} className="btn-outline pressable">Producer operations</button>
            </div>
          </SurfaceSection>
        </div>
      ) : null}
      {confirmStatusAction && selectedRelease ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
          <section role="dialog" aria-modal="true" aria-label="Confirm Action" className="w-full max-w-md rounded-[1.5rem] border p-5 shadow-2xl sm:p-7" style={{ borderColor: "var(--border)", background: "var(--card-strong)" }}>
            <h2 className="text-xl font-semibold text-center" style={{ color: "var(--text)" }}>Are you sure?</h2>
            <p className="mt-3 text-center text-sm" style={{ color: "var(--text-muted)" }}>
              {confirmStatusAction === "approved"
                ? "This confirms that HYMN has reviewed the metadata, artwork, audio, and rights. DireNote submission remains a separate action."
                : confirmStatusAction === "live"
                  ? "Only continue if platform or store availability is confirmed. This does not claim availability on every platform."
                  : "The DireNote readiness check must pass before this release is submitted for distribution."}
            </p>
            <div className="mt-6 flex gap-3 justify-center">
              <button type="button" onClick={() => setConfirmStatusAction(null)} className="btn-outline pressable px-4 py-2">Cancel</button>
              <button type="button" onClick={() => {
                updateReleaseStatus(selectedRelease.id, confirmStatusAction);
                setConfirmStatusAction(null);
              }} className="btn-primary pressable px-4 py-2">
                Yes, {confirmStatusAction === "approved" ? "Approve" : confirmStatusAction === "live" ? "Mark live" : "Send"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {isSubmittingToDireNote ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-in fade-in duration-200">
          <section role="status" aria-label="Submitting to DireNote" className="w-full max-w-md rounded-[1.75rem] border p-8 shadow-2xl text-center flex flex-col items-center justify-center gap-5" style={{ borderColor: "var(--border)", background: "var(--card-strong)" }}>
            <div className="relative flex items-center justify-center">
              <div className="h-16 w-16 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: "var(--border-strong)", borderTopColor: "var(--accent)" }} />
              <div className="absolute h-8 w-8 animate-pulse rounded-full" style={{ background: "var(--accent-soft)" }} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: "var(--accent)" }}>Transmission in progress</p>
              <h3 className="mt-1 text-xl font-bold" style={{ color: "var(--text)" }}>Submitting to DireNote...</h3>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                We are bundling metadata, verifying audio signatures, and transmitting the catalog package to distributor servers. <br /><br />
                <span className="font-semibold" style={{ color: "var(--text)" }}>This may take 1–2 minutes.</span> Please do not close or refresh this tab while we complete the distributor handshake.
              </p>
            </div>
          </section>
        </div>
      ) : null}
      {direNoteResult ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <section role="alertdialog" aria-modal="true" aria-labelledby="direnote-result-title" className="w-full max-w-md rounded-[1.5rem] border p-6 shadow-2xl sm:p-7" style={{ borderColor: "var(--border)", background: "var(--card-strong)" }}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: direNoteResult.type === "success" ? "var(--success-soft)" : "var(--danger-soft)", color: direNoteResult.type === "success" ? "var(--success)" : "var(--danger)" }}>
                  {direNoteResult.type === "success" ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: direNoteResult.type === "success" ? "var(--success)" : "var(--danger)" }}>{direNoteResult.type === "success" ? "Submission complete" : "Action required"}</p>
                  <h2 id="direnote-result-title" className="mt-1 text-xl font-semibold" style={{ color: "var(--text)" }}>{direNoteResult.title}</h2>
                </div>
              </div>
              <button type="button" onClick={() => setDireNoteResult(null)} className="btn-outline pressable p-2" aria-label="Close result"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-5 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{direNoteResult.message}</p>
            <button type="button" onClick={() => setDireNoteResult(null)} className={direNoteResult.type === "success" ? "btn-primary pressable mt-6 w-full" : "btn-outline pressable mt-6 w-full"}>Done</button>
          </section>
        </div>
      ) : null}
      {reviewAction && selectedRelease ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-label="Release review reason" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[1.5rem] border p-5 shadow-2xl sm:p-7" style={{ borderColor: "var(--border)", background: "var(--card-strong)" }}>
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--accent)" }}>{reviewAction === "rejected" ? "Reject Release" : "Request Metadata Changes"}</p><h2 className="mt-2 text-2xl font-semibold" style={{ color: "var(--text)" }}>{adminReleaseTitle(selectedRelease)}</h2></div>
              <button type="button" onClick={() => setReviewAction(null)} className="btn-outline pressable px-3 py-2">Close</button>
            </div>
            <div className="mt-6 grid gap-5">
              <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>Main reason<textarea className="field min-h-28" required value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} placeholder="Explain the reason for rejection or requested correction." /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>Issue type<select className="field" value={reviewIssueType} onChange={(event) => { setReviewIssueType(event.target.value); if (event.target.value !== "metadata") setReviewFields({}); }}><option value="">Select issue type</option>{REVIEW_ISSUE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>Correction severity<select className="field" value={reviewSeverity} onChange={(event) => setReviewSeverity(event.target.value)}><option value="minor_correction">Minor correction</option><option value="required_correction">Required correction</option><option value="critical_issue">Critical issue</option></select></label>
              </div>
              {reviewIssueType === "metadata" ? <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
                <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>Search metadata fields<input className="field" value={reviewFieldSearch} onChange={(event) => setReviewFieldSearch(event.target.value)} placeholder="Search title, artist, credits..." /></label>
                <div className="mt-4 flex max-h-44 flex-wrap gap-2 overflow-y-auto">
                  {METADATA_REVIEW_FIELDS.filter((label) => label.toLowerCase().includes(reviewFieldSearch.toLowerCase())).map((label) => { const key = reviewFieldKey(label); const selected = Boolean(reviewFields[key]); return <button key={key} type="button" onClick={() => setReviewFields((current) => { const next = { ...current }; if (next[key]) delete next[key]; else next[key] = { label, note: "" }; return next; })} className={selected ? "btn-primary pressable px-3 py-2 text-xs" : "btn-outline pressable px-3 py-2 text-xs"}>{label}</button>; })}
                </div>
                <div className="mt-4 grid gap-3">{Object.entries(reviewFields).map(([key, field]) => <label key={key} className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>{field.label}<input className="field" value={field.note} onChange={(event) => setReviewFields((current) => ({ ...current, [key]: { ...field, note: event.target.value } }))} placeholder={`Note for ${field.label}`} /></label>)}</div>
              </div> : null}
              <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>Internal admin note (not shown to artist)<textarea className="field min-h-20" value={reviewInternalNote} onChange={(event) => setReviewInternalNote(event.target.value)} /></label>
              <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><p className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--text-soft)" }}>Artist message preview</p><p className="mt-2 text-sm" style={{ color: "var(--text)" }}>{reviewReason.trim() || "Enter a reason to preview the user-facing message."}</p></div>
              <button type="button" onClick={submitReleaseReview} disabled={isPending || !reviewReason.trim() || !reviewIssueType || (reviewIssueType === "metadata" && !Object.keys(reviewFields).length)} className="btn-primary pressable disabled:cursor-not-allowed disabled:opacity-45">{isPending ? "Saving..." : reviewAction === "rejected" ? "Reject Release" : "Send Correction Request"}</button>
            </div>
          </section>
        </div>
      ) : null}
    </DashboardFrame>
  );
}








// vercel trigger

// vercel trigger 2

// vercel trigger
// vercel trigger 4
// vercel trigger 5
// vercel trigger 6
// vercel trigger 7
// vercel trigger 8
// vercel trigger 9

// vercel trigger 11

// vercel trigger 12

// vercel trigger 14
