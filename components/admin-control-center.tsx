"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { AdminContentManager } from "@/components/admin-content-manager";
import { AdminTimedPlaylistManager } from "@/components/admin-timed-playlist-manager";
import { DashboardFrame } from "@/components/dashboard-frame";
import type { AdminPayoutRequest } from "@/lib/payout";
import type { AdminStoreStatus, ArtistProfile, Beat, DistributionOrder, Notification, Order, PartnershipLead, ProducerApplication, ProducerProfile, Release, SiteSettings, StoreStatus, StoreStatusHistoryEntry, SupportTicket, User, UserRole } from "@/lib/types";

type PersistedAdminTask = { id: number; type: string; priority: string; title: string; body: string; href: string; status: string; createdAt: string };

function formatMoney(amount: number) {
  return `Rs ${amount.toLocaleString("en-IN")}`;
}

function StatCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="metric-card fade-up">
      <p className="text-sm" style={{ color: "var(--text-soft)" }}>{label}</p>
      <p className="mt-3 text-3xl font-semibold" style={{ color: "var(--text)" }}>{value}</p>
      {detail ? <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{detail}</p> : null}
    </div>
  );
}

function StatusPill({ label, active = true }: { label: string; active?: boolean }) {
  return <span className={active ? "status-pill status-pill-active" : "status-pill"}>{label}</span>;
}

function SurfaceSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="surface-card fade-up p-5 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>{title}</h2>
          {description ? <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{description}</p> : null}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function EmptyState({ copy }: { copy: string }) {
  return <p className="text-sm" style={{ color: "var(--text-soft)" }}>{copy}</p>;
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
  const [isPending, startTransition] = useTransition();

  async function loadRequests() {
    const response = await fetch("/api/admin/payouts", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      setFeedback(data.error || "Could not load payout requests.");
      return;
    }
    setRequests(data.requests ?? []);
  }

  useEffect(() => {
    loadRequests();
  }, []);

  function updateStatus(requestId: number, status: "approved" | "processing" | "paid" | "rejected") {
    startTransition(async () => {
      const response = await fetch("/api/admin/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, status, adminNote: adminNote[requestId] ?? "" })
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

  return (
    <SurfaceSection title="Payout requests" description="Approve, process, pay, or reject artist payout requests. Sensitive payout details are masked here.">
      {feedback ? <p className="mb-4 text-sm" style={{ color: "var(--text)" }}>{feedback}</p> : null}
      <div className="grid gap-4">
        {requests.map((request) => (
          <article key={request.id} className="surface-list-item p-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="font-semibold" style={{ color: "var(--text)" }}>{request.userName}</p>
                <p className="mt-1 text-sm" style={{ color: "var(--text-soft)" }}>{request.userEmail} / User #{request.userId}</p>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4" style={{ color: "var(--text-muted)" }}>
                  <span>Requested: {formatMoney(request.requestedAmount)}</span>
                  <span>Fee: {formatMoney(request.serviceFee)}</span>
                  <span>Net: {formatMoney(request.netAmount)}</span>
                  <span>{request.method}: {request.payoutDetails}</span>
                </div>
                <p className="mt-2 text-xs" style={{ color: "var(--text-soft)" }}>Requested {new Date(request.requestedAt).toLocaleString("en-IN")}</p>
                {request.adminNote ? <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>Admin note: {request.adminNote}</p> : null}
              </div>
              <div className="min-w-[260px]">
                <StatusPill label={request.status} active={request.status === "paid" || request.status === "processing"} />
                <textarea
                  className="field mt-3 min-h-20"
                  placeholder="Admin note, required when rejecting"
                  value={adminNote[request.id] ?? ""}
                  onChange={(event) => setAdminNote((notes) => ({ ...notes, [request.id]: event.target.value }))}
                />
                <div className="mt-3 grid grid-cols-2 gap-2">
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
  | "analytics"
  | "revenue"
  | "earnings-entry"
  | "royalties"
  | "contracts"
  | "promotions"
  | "support"
  | "moderation"
  | "fraud"
  | "notifications"
  | "team"
  | "settings"
  | "users"
  | "payments"
  | "content"
  | "timed-playlists"
  | "operations";

export function AdminControlCenter({
  currentAdmin,
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
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    fetch("/api/admin/tasks").then((response) => response.json()).then((data) => { if (active) setPersistedTasks(data.tasks ?? []); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!selectedReleaseId) return;
    fetch(`/api/admin/releases/${selectedReleaseId}/audit`).then((response) => response.json()).then((data) => setReleaseAudit(data.logs ?? [])).catch(() => setReleaseAudit([]));
    fetch(`/api/admin/releases/${selectedReleaseId}/direnote/readiness`).then((response) => response.json()).then((data) => setDireNoteReadiness(data)).catch(() => setDireNoteReadiness(null));
  }, [selectedReleaseId]);

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
  const selectedRelease = releases.find((release) => release.id === selectedReleaseId) ?? releases[0] ?? null;
  const todayLabel = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
  const notificationCountsByType = useMemo(() => {
    const counts = new Map<string, number>();
    initialNotifications.forEach((notification) => counts.set(notification.type, (counts.get(notification.type) ?? 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [initialNotifications]);
  const highPriorityNotifications = useMemo(() => initialNotifications.filter((notification) => notification.priority === "high"), [initialNotifications]);

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

  function selectAdminTab(tab: AdminTab) {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState(null, "", url.toString());
    }
  }

  function updateReleaseStatus(id: number, status: Release["status"]) {
    startTransition(async () => {
      const response = await fetch(`/api/admin/update-status/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note: `Status set to ${status}` })
      });
      const data = await response.json();
      if (!response.ok) {
        setFeedback(data.error || "Could not update release.");
        return;
      }
      setReleases((items) => items.map((item) => (item.id === id ? data.release : item)));
      setFeedback(`Release updated: ${data.release.trackName}`);
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
      eyebrow="Admin"
      title="HYMN Command Center"
      subtitle={`${currentAdmin.name} / ${currentAdmin.email} / ${todayLabel}`}
      navItems={[
        { key: "overview", label: "Overview", description: "Today and platform health", group: "Command Center" },
        { key: "notifications", label: "Notifications", description: "Operations feed", group: "Command Center" },
        { key: "analytics", label: "Analytics", description: "Live platform signals", group: "Command Center" },
        { key: "releases", label: "Releases", description: "Approval workflow", group: "Distribution Operations" },
        { key: "distribution-queue", label: "Distribution Queue", description: "DSP delivery", group: "Distribution Operations" },
        { key: "moderation", label: "Content Moderation", description: "Artwork and metadata", group: "Distribution Operations" },
        { key: "fraud", label: "Fraud Detection", description: "Risk signals", group: "Distribution Operations" },
        { key: "payments", label: "Payments", description: "Checkout records", group: "Money Operations" },
        { key: "revenue", label: "Revenue", description: "Revenue overview", group: "Money Operations" },
        { key: "royalties", label: "Payouts", description: "Withdrawal controls", group: "Money Operations" },
        { key: "earnings-entry", label: "Earnings Entry", description: "Import release earnings", group: "Money Operations" },
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
        { key: "settings", label: "Settings", description: "Platform config", group: "Platform" }
      ]}
      activeKey={activeTab}
      onSelect={selectAdminTab}
      quickActions={
        <>
          <button type="button" onClick={() => selectAdminTab("releases")} className="btn-outline pressable px-4 py-2 text-sm">Review Releases</button>
          <button type="button" onClick={() => selectAdminTab("earnings-entry")} className="btn-primary pressable px-4 py-2 text-sm">Enter Earnings</button>
          <button type="button" onClick={() => selectAdminTab("royalties")} className="btn-outline pressable px-4 py-2 text-sm">Manage Payouts</button>
        </>
      }
    >
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <button type="button" onClick={() => selectAdminTab("releases")} className="text-left"><StatCard label="Pending reviews" value={pendingReviews} detail="Submitted, queued, or under review" /></button>
        <button type="button" onClick={() => selectAdminTab("releases")} className="text-left"><StatCard label="Changes requested" value={changesRequested} detail="Correction flow needs follow-up" /></button>
        <button type="button" onClick={() => selectAdminTab("distribution-queue")} className="text-left"><StatCard label="Sent to DireNote" value={sentToDireNote} detail="Sent, processing, delivered, or live" /></button>
        <button type="button" onClick={() => selectAdminTab("revenue")} className="text-left"><StatCard label="Revenue" value={formatMoney(distributionRevenue + commerceRevenue)} detail={`${formatMoney(distributionRevenue)} distribution + ${formatMoney(commerceRevenue)} commerce`} /></button>
      </section>

      {feedback ? <p className="text-sm" style={{ color: "var(--text)" }}>{feedback}</p> : null}

      {activeTab === "overview" ? (
        <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
          <SurfaceSection title="Today's Action Queue" description="Live admin tasks assembled from releases, payouts, support, and producer applications.">
            <div className="grid gap-4">
              {persistedTasks.map((item) => (
                <article key={`task-${item.id}`} className="surface-list-item p-4" style={item.priority === "critical" ? { borderColor: "var(--danger)" } : undefined}>
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><StatusPill label={item.type} active={item.priority === "high" || item.priority === "critical"} /><span className="text-xs capitalize" style={{ color: "var(--text-soft)" }}>{item.priority} · {new Date(item.createdAt).toLocaleString("en-IN")}</span></div><p className="mt-3 font-semibold" style={{ color: "var(--text)" }}>{item.title}</p><p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{item.body}</p></div><div className="flex flex-wrap gap-2"><a href={item.href} className="btn-outline pressable px-3 py-2 text-xs">Open</a><button type="button" onClick={() => updatePersistedTask(item.id, { status: "assigned", assignToMe: true, note: "Assigned from Operations Queue." })} className="btn-outline pressable px-3 py-2 text-xs">Assign to me</button><button type="button" onClick={() => updatePersistedTask(item.id, { status: "snoozed", snoozedUntil: new Date(Date.now() + 86_400_000).toISOString(), note: "Snoozed for 24 hours." })} className="btn-outline pressable px-3 py-2 text-xs">Snooze 24h</button><button type="button" onClick={() => resolvePersistedTask(item.id)} className="btn-outline pressable px-3 py-2 text-xs">Resolve</button></div></div>
                </article>
              ))}
              {actionQueue.map((item, index) => (
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
              {persistedTasks.length === 0 && actionQueue.length === 0 ? <EmptyState copy="No action required right now. Release, payout, support, and application queues are clear." /> : null}
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
            <div className="grid gap-4">
              {initialDistributionOrders.slice(0, 6).map((order) => (
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
              {initialDistributionOrders.length === 0 ? <EmptyState copy="No distribution checkouts yet." /> : null}
            </div>
          </SurfaceSection>

          <SurfaceSection title="Recent activity" description="Latest release and commerce events from existing platform data.">
            <div className="grid gap-4">
              {[...releases.slice(0, 4).map((release) => ({ title: adminReleaseTitle(release), detail: `${release.artistName} / ${release.status.replace(/_/g, " ")}`, time: release.createdAt })), ...initialOrders.slice(0, 2).map((order) => ({ title: `Beat store order #${order.id}`, detail: `${order.paymentStatus} / ${formatMoney(order.amount)}`, time: order.createdAt }))].map((item) => (
                <article key={`${item.title}-${item.time}`} className="surface-list-item p-4">
                  <p className="font-semibold" style={{ color: "var(--text)" }}>{item.title}</p>
                  <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{item.detail}</p>
                </article>
              ))}
              {releases.length === 0 && initialOrders.length === 0 ? <EmptyState copy="No release or commerce activity yet." /> : null}
            </div>
          </SurfaceSection>
        </div>
      ) : null}

      {(activeTab === "releases" || activeTab === "distribution-queue" || activeTab === "moderation") ? (
        <div className="grid gap-6 xl:grid-cols-[0.92fr,1.08fr]">
          <SurfaceSection title="All submissions" description="Open a release to inspect assets and change review status.">
            <div className="grid gap-4">
              {releases.map((release) => (
                <button key={release.id} type="button" onClick={() => setSelectedReleaseId(release.id)} className="surface-list-item pressable p-4 text-left" style={selectedRelease?.id === release.id ? { borderColor: "var(--accent)", background: "var(--accent-soft)" } : undefined}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold" style={{ color: "var(--text)" }}>{release.releaseTitle}</p>
                      <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{release.artistName} / {release.releaseType.toUpperCase()} / {release.releaseDate}</p>
                    </div>
                    <StatusPill label={release.status.replace(/_/g, " ")} active />
                  </div>
                </button>
              ))}
            </div>
          </SurfaceSection>

          <SurfaceSection title="Detailed view" description="Approve, reject, or push a release through review states.">
            {selectedRelease ? (
              <div className="grid gap-5">
                <div className="grid gap-4 lg:grid-cols-[0.9fr,1.1fr]">
                  <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                    {selectedRelease.artworkUrl ? <img src={selectedRelease.artworkUrl} alt={selectedRelease.releaseTitle} className="aspect-square w-full rounded-[1.1rem] object-cover" /> : <div className="aspect-square w-full rounded-[1.1rem] border border-dashed" style={{ borderColor: "var(--border)" }} />}
                  </div>
                  <div className="grid gap-3 text-sm">
                    <div className="surface-list-item p-4"><span style={{ color: "var(--text-soft)" }}>Artist</span><p className="mt-2 font-semibold" style={{ color: "var(--text)" }}>{selectedRelease.artistName}</p></div>
                    <div className="surface-list-item p-4"><span style={{ color: "var(--text-soft)" }}>Release</span><p className="mt-2 font-semibold" style={{ color: "var(--text)" }}>{selectedRelease.releaseTitle}</p></div>
                    <div className="surface-list-item p-4"><span style={{ color: "var(--text-soft)" }}>Metadata</span><p className="mt-2" style={{ color: "var(--text)" }}>{selectedRelease.primaryGenre ?? "-"} / {selectedRelease.secondaryGenre ?? "-"} / {selectedRelease.language}</p></div>
                    <div className="surface-list-item p-4"><span style={{ color: "var(--text-soft)" }}>Mood</span><p className="mt-2" style={{ color: "var(--text)" }}>{selectedRelease.mood || "Missing"}</p></div>
                    <div className="surface-list-item p-4"><span style={{ color: "var(--text-soft)" }}>Existing identifiers</span><p className="mt-2" style={{ color: "var(--text)" }}>Already released: {selectedRelease.releasePreviouslyReleased ? "Yes" : "No"}</p>{selectedRelease.releasePreviouslyReleased ? <div className="mt-1 grid gap-1" style={{ color: "var(--text-muted)" }}><p>UPC: {selectedRelease.upcCode || "Missing"}</p>{selectedRelease.tracks?.map((track,index)=><p key={track.id}>Track {index+1} — {track.trackTitle}: {track.isrc || "ISRC missing"}</p>)}</div> : null}</div>
                    <div className="surface-list-item p-4"><span style={{ color: "var(--text-soft)" }}>Queue</span><p className="mt-2" style={{ color: "var(--text)" }}>#{selectedRelease.queuePosition ?? 0} Â· {selectedRelease.estimatedReviewTime ?? "Pending"}</p></div>
                  </div>
                </div>
                <AdminStoreStatusEditor release={selectedRelease} />
                <details className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><summary className="cursor-pointer font-semibold">Automation &amp; Audit Timeline ({releaseAudit.length})</summary><div className="mt-4 grid gap-2">{releaseAudit.map((event) => <div key={event.id} className="summary-card"><span><strong>{event.action.replace(/_/g, " ")}</strong><br /><small>{new Date(event.createdAt).toLocaleString("en-IN")}</small></span><span className="max-w-[50%] truncate text-xs">{event.metadata ? JSON.stringify(event.metadata) : "Recorded"}</span></div>)}{releaseAudit.length === 0 ? <p className="text-sm" style={{ color: "var(--text-muted)" }}>No audit events recorded yet.</p> : null}</div></details>
                <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
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
                  {direNoteReadiness ? <div className="mt-4 grid gap-2">{direNoteReadiness.issues.map((issue) => <div key={`${issue.category}-${issue.field}`} className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--danger)", background: "var(--danger-soft)" }}><p className="font-semibold">{issue.category} · {issue.field}</p><p className="mt-1">{issue.message}</p><p className="mt-1 text-xs">Fix: {issue.fixSuggestion}</p></div>)}{direNoteReadiness.warnings.map((issue) => <div key={`warning-${issue.field}`} className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)" }}><p className="font-semibold">Warning · {issue.category}</p><p className="mt-1">{issue.message}</p></div>)}</div> : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {([
                    ["under_review", "Start review"],
                    ["approved", "Approve"],
                    ["sent", "Send to DireNote"],
                    ["live", "Mark live"]
                  ] as Array<[Release["status"], string]>).map(([status, label]) => (
                    <button key={status} type="button" disabled={isPending} onClick={() => {
                      if (status === "approved" || status === "sent") {
                        setConfirmStatusAction(status);
                      } else {
                        updateReleaseStatus(selectedRelease.id, status);
                      }
                    }} className={status === "approved" || status === "sent" ? "btn-primary pressable" : "btn-outline pressable"}>
                      {label}
                    </button>
                  ))}
                  <button type="button" disabled={isPending} onClick={() => openReview("changes_requested")} className="btn-outline pressable">Request Metadata Changes</button>
                  <button type="button" disabled={isPending} onClick={() => openReview("rejected")} className="btn-outline pressable" style={{ color: "var(--danger)" }}>Reject Release</button>
                </div>
                <div className="grid gap-3">
                  {(selectedRelease.tracks ?? []).map((track) => (
                    <article key={track.id} className="surface-list-item p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold" style={{ color: "var(--text)" }}>{track.trackNumber}. {track.trackTitle}</p>
                          <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{track.primaryArtist} / {track.duration}</p>
                        </div>
                        <StatusPill label={track.explicitContent ? "explicit" : "clean"} active={track.explicitContent} />
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : <EmptyState copy="Select a release to open the detailed view." />}
          </SurfaceSection>
        </div>
      ) : null}

      {activeTab === "users" ? (
        <SurfaceSection title="Users" description="Review email, release counts, activity, and role assignments.">
          <div className="grid gap-4">
            {users.map((user) => (
              <article key={user.id} className="surface-list-item p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <p className="font-semibold" style={{ color: "var(--text)" }}>{user.name}</p>
                    <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{user.email}</p>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      <span>{releaseCountByUser.get(user.id) ?? 0} releases</span>
                      <span>{latestUserActivity.get(user.id) ? new Date(latestUserActivity.get(user.id) as string).toLocaleDateString() : "No activity yet"}</span>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(["customer", "producer", "admin"] as UserRole[]).map((role) => (
                      <button key={role} type="button" onClick={() => updateRole(user, role)} className={user.role === role ? "btn-primary pressable" : "btn-outline pressable"}>{role}</button>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </SurfaceSection>
      ) : null}

      {activeTab === "earnings-entry" ? <AdminEarningsEntry users={users} releases={releases} /> : null}

      {activeTab === "royalties" ? <div className="grid gap-6"><AdminPayoutManager /><AdminPayoutReports /></div> : null}

      {(activeTab === "payments" || activeTab === "revenue" || activeTab === "royalties") ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <SurfaceSection title="Distribution payments" description="Track Rs 99 submissions, subscriptions, and payment outcomes.">
            <div className="grid gap-4">
              {initialDistributionOrders.map((order) => {
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
              {initialOrders.map((order) => (
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
            {initialArtistProfiles.map((profile) => (
              <article key={profile.id} className="surface-list-item flex gap-4 p-4">
                {profile.imageUrl ? <img src={profile.imageUrl} alt={profile.name} className="h-16 w-16 rounded-2xl object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>{profile.name.slice(0, 1)}</div>}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold" style={{ color: "var(--text)" }}>{profile.name}</p>
                  <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>User #{profile.userId} Â· {profile.followers ? `${profile.followers.toLocaleString("en-IN")} followers` : "No follower data"}</p>
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
              {initialNotifications.slice(0, 12).map((notification) => (
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
            {supportTickets.map((ticket) => (
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

      {(activeTab === "operations" || activeTab === "producers") ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <SurfaceSection title="Beats" description="Enable or disable storefront inventory.">
            <div className="grid gap-4">
              {beats.map((beat) => (
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
              {applications.map((application) => (
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
              {initialLeads.map((lead) => (
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
                ? "This will approve the release and immediately send it to DireNote for processing." 
                : "This will directly send the release to DireNote for distribution."}
            </p>
            <div className="mt-6 flex gap-3 justify-center">
              <button type="button" onClick={() => setConfirmStatusAction(null)} className="btn-outline pressable px-4 py-2">Cancel</button>
              <button type="button" onClick={() => {
                updateReleaseStatus(selectedRelease.id, confirmStatusAction);
                setConfirmStatusAction(null);
              }} className="btn-primary pressable px-4 py-2">
                Yes, {confirmStatusAction === "approved" ? "Approve" : "Send"}
              </button>
            </div>
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
