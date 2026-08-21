"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, ArrowLeft, ChevronDown, Clock3, Copy, ExternalLink, Filter, Grid2X2, List, Pencil, Search, Share2, Sparkles } from "lucide-react";
import { Release } from "@/lib/types";
import { useAccessibleDialog } from "@/components/ui/use-accessible-dialog";
import {
  getReleasePortalAction,
  getReleasePortalDateLabel,
  getReleasePortalSortKey,
  getReleasePortalStage,
  getReleasePortalTrackCount,
  isReleaseUnfinished
} from "@/lib/release-portal";
import { automaticStatusCopy } from "@/lib/release-status-engine";
import { ReleaseSummaryCard } from "@/components/release-summary-card";

const PAGE_SIZE = 12;
const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "review", label: "Under Review" },
  { value: "scheduled", label: "Scheduled" },
  { value: "processing", label: "Processing" },
  { value: "partially_live", label: "Partially Live" },
  { value: "released", label: "Released" },
  { value: "rejected", label: "Rejected" }
] as const;

type StatusFilter = (typeof STATUS_OPTIONS)[number]["value"];

function normalizeArtist(value: string) {
  return value.trim().toLowerCase();
}

function EmptyState({ title, description, actionHref, actionLabel }: { title: string; description: string; actionHref: string; actionLabel: string }) {
  return (
    <section className="surface-card p-8 sm:p-10 text-center">
      <h2 className="text-3xl font-semibold" style={{ color: "var(--text)" }}>{title}</h2>
      <p className="mx-auto mt-4 max-w-2xl text-base" style={{ color: "var(--text-muted)" }}>{description}</p>
      <Link href={actionHref} className="btn-primary pressable mx-auto mt-6 inline-flex">
        {actionLabel}
      </Link>
    </section>
  );
}

function ReleaseCard({ release, selected = false }: { release: Release; selected?: boolean }) {
  const action = getReleasePortalAction(release);
  return <ReleaseSummaryCard release={release} href={action.href} actionLabel={action.label} selected={selected} />;
}

const DETAIL_TABS = ["overview", "information", "tracks", "distribution", "corrections", "splits", "promolink", "earnings", "requests", "activity"] as const;
type DetailTab = (typeof DETAIL_TABS)[number];
const DETAIL_TAB_LABELS: Record<DetailTab, string> = {
  overview: "Overview",
  information: "Metadata",
  tracks: "Tracks",
  distribution: "Delivery",
  corrections: "Correction requests",
  splits: "Splits",
  promolink: "Promotion",
  earnings: "Royalties",
  requests: "Requests",
  activity: "History"
};
type ChangeRequest = { id: number; requestType: string; status: string; reason: string; adminNote?: string | null; providerReference?: string | null; submittedAt: string; reviewedAt?: string | null; completedAt?: string | null; events?: Array<{ id: number; actorType: string; previousStatus?: string | null; newStatus: string; note: string; providerReference?: string | null; createdAt: string }> };

function display(value: unknown) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function storeBadgeStyle(status: string) {
  if (status === "Live" || status === "Content ID Enabled") return { color: "var(--success)", borderColor: "color-mix(in srgb, var(--success) 42%, var(--border))", background: "color-mix(in srgb, var(--success) 10%, transparent)" };
  if (status === "Denied" || status === "Content ID Denied" || status === "Removed") return { color: "var(--danger)", borderColor: "color-mix(in srgb, var(--danger) 42%, var(--border))", background: "color-mix(in srgb, var(--danger) 10%, transparent)" };
  if (status === "Pending" || status === "In Review") return { color: "var(--money)", borderColor: "color-mix(in srgb, var(--money) 42%, var(--border))", background: "color-mix(in srgb, var(--money) 10%, transparent)" };
  return { color: "var(--text-muted)", borderColor: "var(--border)", background: "var(--bg-soft)" };
}

function releaseStatusMessage(release: Release) {
  const automaticCopy = automaticStatusCopy(release);
  if (automaticCopy) return automaticCopy;
  if (release.status === "draft") return "This release is still in drafts. Complete and submit it for review.";
  if (release.status === "under_review" || release.status === "submitted" || release.status === "in_queue") return "Your release is currently under HYMN review. Our team is checking metadata, artwork, audio, and rights.";
  if (release.status === "changes_requested") return "HYMN requested changes for this release. Review the marked fields and resubmit.";
  if (release.status === "rejected") return "This release was rejected. Check the reason and correction notes.";
  if (["sent", "sent_to_distributor", "processing", "delivered"].includes(release.status)) return "Your release has cleared HYMN review and has been sent for distribution.";
  if (release.status === "scheduled") return `Your release is accepted for distribution and scheduled for ${getReleasePortalDateLabel(release)}.`;
  if (release.status === "awaiting_live_confirmation") return "Your release date has arrived. HYMN is waiting for platform availability confirmation.";
  if (release.status === "partially_live") return "Your release is live on selected platforms while remaining stores are still processing.";
  if (release.status === "live") return "Your release is live or confirmed available through platform status.";
  return "This release is saved in your HYMN workspace.";
}

function releaseMetadata(release: Release) {
  return release.metadata && typeof release.metadata === "object" ? release.metadata : {};
}

function resolvedUpc(release: Release) {
  const meta = releaseMetadata(release) as Record<string, any>;
  const value = release.upcCode || meta.direnoteResponse?.upc || meta.upc || meta.upcCode;
  if (typeof value === "string" && value.trim()) return value.trim();
  return release.status === "draft" ? "Will be generated by DireNote" : "Awaiting assignment";
}

function resolvedIsrc(release: Release, track: NonNullable<Release["tracks"]>[number], index: number) {
  if (track.isrc?.trim()) return track.isrc.trim();
  const meta = releaseMetadata(release) as Record<string, any>;
  const responseTracks = Array.isArray(meta.direnoteResponse?.tracks) ? meta.direnoteResponse.tracks : [];
  const byName = responseTracks.find((item: any) => String(item?.track_name || "").trim().toLowerCase() === track.trackTitle.trim().toLowerCase());
  const value = byName?.isrc || responseTracks[index]?.isrc || meta.tracks?.[index]?.isrc || track.metadata?.isrc;
  if (typeof value === "string" && value.trim()) return value.trim();
  return release.status === "draft" ? "Will be generated by DireNote" : "Awaiting assignment";
}

function assignedIdentifier(value: string) {
  return value !== "Will be generated by DireNote" && value !== "Awaiting assignment";
}

function IdentifierValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  if (!assignedIdentifier(value)) return <span className="text-sm" style={{ color: "var(--text-muted)" }}>{value}</span>;
  return <span className="inline-flex items-center gap-3" title="Assigned by DireNote"><code className="font-mono text-sm font-semibold tracking-[0.08em]" style={{ color: "var(--text)" }}>{value}</code><button type="button" className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--accent)" }} onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1400); }} aria-label={`Copy ${value}`}><Copy className="h-3.5 w-3.5" />{copied ? "Copied" : "Copy"}</button></span>;
}

function CorrectionWorkspace({ release, onFix }: { release: Release; onFix: () => void }) {
  const router = useRouter();
  const issues = release.reviewIssues?.fields ?? [];
  const recommendationsOnly = release.reviewIssues?.severity === "minor_correction";
  const requiredCount = recommendationsOnly ? 0 : issues.length;
  const recommendationCount = recommendationsOnly ? issues.length : 0;
  const [selectedField, setSelectedField] = useState(issues[0]?.field ?? "");
  const [resolvedFields, setResolvedFields] = useState<Set<string>>(() => new Set());
  const [resubmitStatus, setResubmitStatus] = useState("");
  const [resubmitting, startResubmitting] = useTransition();
  const selectedIssue = issues.find((issue) => issue.field === selectedField) ?? issues[0];
  const requiredResolved = requiredCount === 0 || issues.every((issue) => resolvedFields.has(issue.field));

  function toggleResolved(field: string) {
    setResolvedFields((current) => {
      const next = new Set(current);
      if (next.has(field)) next.delete(field); else next.add(field);
      return next;
    });
  }

  function resubmit() {
    startResubmitting(async () => {
      setResubmitStatus("Resubmitting corrections…");
      const response = await fetch(`/api/releases/${release.id}/resubmit`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResubmitStatus(data.error || "Corrections could not be resubmitted.");
        return;
      }
      setResubmitStatus("Corrections returned to HYMN review.");
      router.refresh();
    });
  }

  if (!issues.length) return <section className="surface-card"><h2 className="text-2xl font-semibold">Corrections</h2><p className="mt-4 rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>{release.correctionReason || release.rejectionReason || "No structured correction issues are available for this release."}</p><div className="mt-5 flex gap-3"><button type="button" onClick={onFix} className="btn-primary pressable">Edit release</button><Link href={`/contact?releaseId=${release.id}`} className="btn-outline pressable">Contact support</Link></div></section>;

  return <section className="grid gap-5"><div className="surface-card"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-semibold">Correction workspace</h2><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Address each reviewer issue, confirm the corrected field, then return the release to HYMN review.</p></div><span className="status-pill" style={{ color: requiredCount ? "var(--warning)" : "var(--info)" }}>{requiredCount} required correction{requiredCount === 1 ? "" : "s"} · {recommendationCount} recommendation{recommendationCount === 1 ? "" : "s"}</span></div></div><div className="grid gap-5 lg:grid-cols-[260px,minmax(0,1fr)]"><nav className="surface-card self-start" aria-label="Correction issues"><p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-soft)" }}>Issues</p><div className="mt-3 grid gap-2">{issues.map((issue, index) => <button key={issue.field} type="button" onClick={() => setSelectedField(issue.field)} className="min-h-11 rounded-xl border p-3 text-left" style={{ borderColor: selectedIssue?.field === issue.field ? "var(--info)" : "var(--border)", background: selectedIssue?.field === issue.field ? "var(--info-soft)" : "var(--bg-soft)" }}><span className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{index + 1}. {issue.label}</span><span className="text-xs" style={{ color: resolvedFields.has(issue.field) ? "var(--success)" : "var(--warning)" }}>{resolvedFields.has(issue.field) ? "Resolved" : "Open"}</span></span></button>)}</div></nav>{selectedIssue ? <article className="surface-card"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-soft)" }}>Field / category</p><h3 className="mt-2 text-xl font-semibold">{selectedIssue.label}</h3></div><span className="status-pill capitalize">{release.reviewIssues?.severity.replace(/_/g, " ")}</span></div><dl className="mt-6 grid gap-4"><div><dt className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-soft)" }}>Problem</dt><dd className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{selectedIssue.note || "HYMN marked this field for correction."}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-soft)" }}>Reason</dt><dd className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{release.correctionReason || release.rejectionReason || "The submitted value did not pass the current release review."}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-soft)" }}>Exact correction required</dt><dd className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{selectedIssue.note || "Update this field so it is complete and accurate, then mark it resolved."}</dd></div></dl><div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={onFix} className="btn-primary pressable">Fix this</button><button type="button" onClick={() => toggleResolved(selectedIssue.field)} className="btn-outline pressable">{resolvedFields.has(selectedIssue.field) ? "Mark unresolved" : "Mark resolved"}</button></div></article> : null}</div><div className="surface-card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold" style={{ color: requiredResolved ? "var(--success)" : "var(--text)" }}>{requiredResolved ? "All required corrections resolved" : `${requiredCount - resolvedFields.size} required correction${requiredCount - resolvedFields.size === 1 ? "" : "s"} remaining`}</p><p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>Mark an issue resolved only after saving the corrected field.</p>{resubmitStatus ? <p className="mt-2 text-sm" aria-live="polite">{resubmitStatus}</p> : null}</div><button type="button" disabled={!requiredResolved || resubmitting} onClick={resubmit} className="btn-primary pressable disabled:cursor-not-allowed disabled:opacity-45">{resubmitting ? "Resubmitting…" : "Resubmit to HYMN"}</button></div></section>;
}

function DeliveryMatrix({ release }: { release: Release }) {
  const stores = release.distributionStores ?? [];
  const confirmed = stores.filter((store) => store.status === "Live" || store.status === "Content ID Enabled").length;
  const attention = stores.filter((store) => ["Denied", "Content ID Denied", "Paused"].includes(store.status)).length;
  const overall = confirmed === stores.length && stores.length > 0 ? "Live on all confirmed stores" : confirmed > 0 ? `Partially live · ${confirmed} of ${stores.length} selected stores confirmed` : attention > 0 ? `${attention} store${attention === 1 ? "" : "s"} require attention` : stores.length ? "Delivery in progress" : "No store delivery data available";
  const externalStatus = release.direNoteStatus ? release.direNoteStatus.replace(/_/g, " ") : "Awaiting distributor update";
  const lastSynced = release.direNoteLastSyncedAt ? new Date(release.direNoteLastSyncedAt).toLocaleString() : "Not synced yet";
  const integrationSummary = <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="summary-card"><span>Distribution status</span><strong className="capitalize">{externalStatus}</strong></div><div className="summary-card"><span>Last update</span><strong>{lastSynced}</strong></div><div className="summary-card"><span>UPC</span><strong>{resolvedUpc(release)}</strong></div></div>;
  if (!stores.length) return <section className="surface-card"><h2 className="text-2xl font-semibold">Store delivery</h2>{integrationSummary}<p className="mt-4 rounded-xl border p-5 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>HYMN has not received store-level delivery updates for this release yet.</p></section>;
  return <section className="surface-card"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-semibold">Store delivery</h2><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Store-level status is shown separately from the overall release state.</p></div><span className="status-pill" style={{ color: attention ? "var(--warning)" : confirmed ? "var(--success)" : "var(--info)" }}>{overall}</span></div>{integrationSummary}<div className="mt-5 grid gap-3 md:hidden">{stores.map((store) => <article key={store.platform} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><div className="flex items-center justify-between gap-3"><p className="font-semibold">{store.platform}</p><span className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold" style={storeBadgeStyle(store.status)}>{store.status}</span></div><p className="mt-3 text-sm" style={{ color: store.reason ? "var(--danger)" : "var(--text-muted)" }}>{store.reason || store.userFacingNote || "No additional store note."}</p><p className="mt-2 text-xs" style={{ color: "var(--text-soft)" }}>Last update: {store.updatedAt ? new Date(store.updatedAt).toLocaleString() : "Not reported"}</p></article>)}</div><div className="mt-5 hidden overflow-x-auto md:block"><table className="w-full min-w-[720px] text-left"><thead><tr className="border-b text-xs uppercase tracking-[0.14em]" style={{ borderColor: "var(--border)", color: "var(--text-soft)" }}><th className="px-3 py-3">Store</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Last update</th><th className="px-3 py-3">Error or action</th><th className="px-3 py-3">Live link</th></tr></thead><tbody>{stores.map((store) => <tr key={store.platform} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}><td className="px-3 py-4 font-semibold">{store.platform}</td><td className="px-3 py-4"><span className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold" style={storeBadgeStyle(store.status)}>{store.status}</span></td><td className="whitespace-nowrap px-3 py-4 text-sm" style={{ color: "var(--text-soft)" }}>{store.updatedAt ? new Date(store.updatedAt).toLocaleString() : "Not reported"}</td><td className="max-w-md px-3 py-4 text-sm" style={{ color: store.reason ? "var(--danger)" : "var(--text-muted)" }}>{store.reason || store.userFacingNote || "No action required"}</td><td className="px-3 py-4 text-sm" style={{ color: "var(--text-soft)" }}>Not supplied</td></tr>)}</tbody></table></div></section>;
}

function ChangeRequestWorkspace({ release, requests, onCreated }: { release: Release; requests: ChangeRequest[]; onCreated: (request: ChangeRequest) => void }) {
  const [requestType, setRequestType] = useState<"metadata_update" | "takedown">("metadata_update");
  const [requestStep, setRequestStep] = useState(0);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [requestedValues, setRequestedValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<"complete" | "stores" | "territories">("complete");
  const [targets, setTargets] = useState("");
  const [declaration, setDeclaration] = useState(false);
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const metadataFields = [{ key: "release_title", label: "Release title", current: release.releaseTitle || release.trackName }, { key: "artist", label: "Primary artist", current: release.artistName }, { key: "label", label: "Label", current: release.labelDisplayName || release.labelName || "Not supplied" }, { key: "genre", label: "Genre", current: release.primaryGenre || release.genre || "Not supplied" }, { key: "release_date", label: "Release date", current: getReleasePortalDateLabel(release) }];
  const totalSteps = requestType === "metadata_update" ? 4 : 5;
  const canContinue = requestType === "metadata_update" ? (requestStep === 0 ? selectedFields.length > 0 : requestStep === 1 ? selectedFields.every((field) => requestedValues[field]?.trim()) : requestStep === 2 ? reason.trim().length >= 10 : true) : (requestStep === 1 && scope !== "complete" ? targets.trim().length > 0 : requestStep === 2 ? reason.trim().length >= 10 : requestStep === 3 ? declaration : true);

  function reset(nextType: "metadata_update" | "takedown") {
    setRequestType(nextType); setRequestStep(0); setSelectedFields([]); setRequestedValues({}); setReason(""); setScope("complete"); setTargets(""); setDeclaration(false); setStatus("");
  }

  async function submitRequest() {
    setSubmitting(true); setStatus("Submitting request…");
    const requestedChanges = requestType === "metadata_update" ? Object.fromEntries(selectedFields.map((field) => [field, { current: metadataFields.find((item) => item.key === field)?.current, requested: requestedValues[field] }])) : { scope, targets: scope === "complete" ? "All selected stores and territories" : targets, declarationAccepted: declaration };
    const response = await fetch(`/api/releases/${release.id}/change-requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestType, reason, requestedChanges }) });
    const data = await response.json().catch(() => ({}));
    setSubmitting(false);
    if (!response.ok) { setStatus(data.error || "Request failed."); return; }
    onCreated(data.request); setStatus("Request submitted to HYMN for review.");
  }

  return <section className="grid gap-5"><div className="surface-card"><h2 className="text-2xl font-semibold">Release requests</h2><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Request a tracked metadata change or takedown. Submission does not mean an immediate store change.</p><div className="mt-5 inline-flex rounded-xl border p-1" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><button type="button" onClick={() => reset("metadata_update")} className="min-h-11 rounded-lg px-4 text-sm font-semibold" style={{ background: requestType === "metadata_update" ? "var(--card)" : "transparent" }}>Request update</button><button type="button" onClick={() => reset("takedown")} className="min-h-11 rounded-lg px-4 text-sm font-semibold" style={{ background: requestType === "takedown" ? "var(--card)" : "transparent" }}>Request takedown</button></div></div><div className="surface-card"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-soft)" }}>Step {requestStep + 1} of {totalSteps}</p><h3 className="mt-2 text-xl font-semibold">{requestType === "metadata_update" ? ["Select fields", "Compare values", "Reason and restrictions", "Review and submit"][requestStep] : ["Choose scope", "Choose stores or territories", "Reason", "Consequences and declaration", "Review and submit"][requestStep]}</h3></div><span className="status-pill">{requestType === "metadata_update" ? "Metadata update" : "Takedown"}</span></div>{requestType === "metadata_update" && requestStep === 0 ? <div className="mt-5 grid gap-2 sm:grid-cols-2">{metadataFields.map((field) => <label key={field.key} className="flex min-h-11 items-center gap-3 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><input type="checkbox" checked={selectedFields.includes(field.key)} onChange={(event) => setSelectedFields((current) => event.target.checked ? [...current, field.key] : current.filter((item) => item !== field.key))} /><span><span className="block text-sm font-semibold">{field.label}</span><span className="block text-xs" style={{ color: "var(--text-muted)" }}>{field.current}</span></span></label>)}</div> : null}{requestType === "metadata_update" && requestStep === 1 ? <div className="mt-5 grid gap-4">{selectedFields.map((fieldKey) => { const field = metadataFields.find((item) => item.key === fieldKey)!; return <div key={fieldKey} className="grid gap-3 rounded-xl border p-4 md:grid-cols-2" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><label className="grid gap-2 text-sm font-semibold">Existing value<input className="field" value={field.current} readOnly /></label><label className="grid gap-2 text-sm font-semibold">Requested value<input className="field" value={requestedValues[fieldKey] || ""} onChange={(event) => setRequestedValues((current) => ({ ...current, [fieldKey]: event.target.value }))} /></label></div>; })}</div> : null}{requestType === "metadata_update" && requestStep === 2 ? <div className="mt-5 grid gap-4"><div className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--warning)", background: "var(--warning-soft)", color: "var(--text-muted)" }}>Some DSPs restrict artist-name, release-date, identifier, artwork, or audio changes after delivery. HYMN will review feasibility before sending the request to providers.</div><label className="grid gap-2 text-sm font-semibold">Why is this update required?<textarea className="field min-h-28" minLength={10} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></label><p className="text-xs" style={{ color: "var(--text-soft)" }}>If evidence is required, HYMN will request it through the tracked request before provider submission.</p></div> : null}{requestType === "takedown" && requestStep === 0 ? <div className="mt-5 grid gap-3 sm:grid-cols-3">{[{ key: "complete", label: "Complete takedown", copy: "All delivered stores and territories." }, { key: "stores", label: "Store-specific", copy: "Only named stores." }, { key: "territories", label: "Territory-specific", copy: "Only named countries or regions." }].map((item) => <button key={item.key} type="button" onClick={() => setScope(item.key as typeof scope)} className="min-h-24 rounded-xl border p-4 text-left" style={{ borderColor: scope === item.key ? "var(--warning)" : "var(--border)", background: scope === item.key ? "var(--warning-soft)" : "var(--bg-soft)" }}><span className="font-semibold">{item.label}</span><span className="mt-2 block text-sm" style={{ color: "var(--text-muted)" }}>{item.copy}</span></button>)}</div> : null}{requestType === "takedown" && requestStep === 1 ? <div className="mt-5">{scope === "complete" ? <p className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>The request will cover every store and territory currently associated with this release.</p> : <label className="grid gap-2 text-sm font-semibold">Affected {scope === "stores" ? "stores" : "territories"}<textarea className="field min-h-28" value={targets} onChange={(event) => setTargets(event.target.value)} placeholder={`List ${scope === "stores" ? "store names" : "countries or regions"}, separated by commas`} /></label>}</div> : null}{requestType === "takedown" && requestStep === 2 ? <label className="mt-5 grid gap-2 text-sm font-semibold">Reason for takedown<textarea className="field min-h-28" minLength={10} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></label> : null}{requestType === "takedown" && requestStep === 3 ? <div className="mt-5 grid gap-4"><div className="rounded-xl border p-4 text-sm leading-6" style={{ borderColor: "var(--warning)", background: "var(--warning-soft)", color: "var(--text-muted)" }}><p>Takedown processing can take time. Store caching may delay disappearance, and royalties may continue arriving for activity that occurred earlier.</p><p className="mt-2 font-semibold" style={{ color: "var(--text)" }}>Submitting this request does not immediately remove or delete the release.</p></div><label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={declaration} onChange={(event) => setDeclaration(event.target.checked)} /><span>I understand the scope and consequences and confirm that I am authorised to request this takedown.</span></label></div> : null}{requestStep === totalSteps - 1 ? <div className="mt-5 grid gap-3 rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><p><strong>Release:</strong> {release.releaseTitle || release.trackName}</p><p><strong>Request:</strong> {requestType === "metadata_update" ? `${selectedFields.length} metadata field${selectedFields.length === 1 ? "" : "s"}` : `${scope.replace(/_/g, " ")} takedown`}</p><p><strong>Reason:</strong> {reason}</p>{requestType === "takedown" ? <p><strong>Scope:</strong> {scope === "complete" ? "All stores and territories" : targets}</p> : null}</div> : null}<div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><button type="button" disabled={requestStep === 0 || submitting} onClick={() => setRequestStep((current) => Math.max(0, current - 1))} className="btn-outline pressable disabled:opacity-40">Previous</button>{requestStep < totalSteps - 1 ? <button type="button" disabled={!canContinue} onClick={() => setRequestStep((current) => current + 1)} className="btn-primary pressable disabled:opacity-40">Continue</button> : <button type="button" disabled={submitting} onClick={submitRequest} className="btn-primary pressable disabled:opacity-40">{submitting ? "Submitting…" : "Submit request"}</button>}</div>{status ? <p className="mt-4 text-sm" aria-live="polite" style={{ color: "var(--text-muted)" }}>{status}</p> : null}</div><div className="surface-card"><h3 className="text-xl font-semibold">Request history</h3><div className="mt-5 grid gap-3">{requests.map((item) => <article key={item.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold capitalize">{item.requestType.replace(/_/g, " ")}</p><span className="status-pill capitalize">{item.status.replace(/_/g, " ")}</span></div><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{item.reason}</p>{item.adminNote ? <p className="mt-3 text-sm"><strong>HYMN response:</strong> {item.adminNote}</p> : null}{item.providerReference ? <p className="mt-2 font-mono text-xs">Provider reference: {item.providerReference}</p> : null}<div className="mt-4 grid gap-0">{item.events?.map((event) => <div key={event.id} className="border-l pb-4 pl-4 last:pb-0" style={{ borderColor: "var(--border)" }}><p className="text-sm font-semibold capitalize">{event.newStatus.replace(/_/g, " ")}</p><p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{event.note}</p><time className="mt-1 block text-xs" style={{ color: "var(--text-soft)" }}>{new Date(event.createdAt).toLocaleString()}</time></div>)}</div></article>)}{!requests.length ? <p className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>No update or takedown requests have been submitted for this release.</p> : null}</div></div></section>;
}

export function ReleaseManage({ release, initialTab }: { release: Release; initialTab?: string | null }) {
  const router = useRouter();
  const [tab, setTab] = useState<DetailTab>(DETAIL_TABS.includes(initialTab as DetailTab) ? initialTab as DetailTab : "overview");
  const [editWarningOpen, setEditWarningOpen] = useState(false);
  const [editError, setEditError] = useState("");
  const [isEditing, startEditing] = useTransition();
  const editDialogRef = useAccessibleDialog(editWarningOpen, () => { if (!isEditing) setEditWarningOpen(false); });
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const title = release.releaseTitle?.trim() || release.trackName;
  const promoLink = release.presaveSpotify || release.presaveApple || release.exclusiveSpotify || release.exclusiveApple;
  const alreadyDistributed = ["sent", "sent_to_distributor", "processing", "delivered", "live"].includes(release.status);
  const canEdit = ["draft", "changes_requested", "rejected"].includes(release.status);
  const metadata = releaseMetadata(release) as Record<string, any>;
  const hasCorrections = Boolean(release.reviewIssues?.fields.length || release.correctionReason || release.rejectionReason || metadata.direnoteValidationErrors);
  const hasDistribution = alreadyDistributed || Boolean(release.distributionStores?.length) || ["direnote_accepted", "scheduled", "awaiting_live_confirmation", "partially_live"].includes(release.status);
  const hasEarnings = release.status === "live" || Number(release.analytics?.revenue_total || 0) > 0;
  const relevantTabs = DETAIL_TABS.filter((item) => item !== "corrections" || hasCorrections).filter((item) => item !== "distribution" || hasDistribution).filter((item) => item !== "requests" || alreadyDistributed).filter((item) => item !== "earnings" || hasEarnings).filter((item) => item !== "promolink" || Boolean(promoLink) || hasDistribution);

  useEffect(() => {
    fetch(`/api/releases/${release.id}/change-requests`).then(response => response.ok ? response.json() : Promise.reject()).then(data => setChangeRequests(data.requests ?? [])).catch(() => undefined);
  }, [release.id]);

  function proceedToEdit() {
    startEditing(async () => {
      setEditError("");
      const response = await fetch(`/api/distribution/releases/${release.id}/edit`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setEditError(data.error || "Could not return this release to drafts.");
        return;
      }
      router.push(`/distribution/start?edit=${release.id}`);
      router.refresh();
    });
  }

  return <div className="release-manage-page grid gap-6">
    <Link href="/dashboard/releases" className="inline-flex w-fit items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-muted)" }}><ArrowLeft className="h-4 w-4" /> My Releases</Link>
    <section className="surface-card overflow-hidden p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: release.status === "rejected" || release.status === "changes_requested" ? "color-mix(in srgb, var(--danger) 40%, var(--border))" : "var(--border)", background: "var(--bg-soft)", color: "var(--text-muted)" }}>
        <Clock3 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--money)" }} />
        <p>{releaseStatusMessage(release)}</p>
      </div>
      <div className="grid gap-6 md:grid-cols-[220px,1fr] md:items-center">
        <div className="aspect-square overflow-hidden rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>{release.artworkUrl ? <img src={release.artworkUrl} alt={title} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Sparkles className="h-10 w-10" /></div>}</div>
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2"><span className="status-pill status-pill-active">{release.status.replace(/_/g, " ")}</span><span className="status-pill capitalize">{release.releaseType}</span></div>
          <h1 className="mt-4 truncate text-3xl font-semibold sm:text-4xl" style={{ color: "var(--text)" }}>{title}</h1>
          <p className="mt-2" style={{ color: "var(--text-muted)" }}>{release.artistName} · {getReleasePortalTrackCount(release)} track{getReleasePortalTrackCount(release) === 1 ? "" : "s"}</p>
          <div className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2" style={{ color: "var(--text-muted)" }}><p>Release Date: <strong style={{ color: "var(--text)" }}>{getReleasePortalDateLabel(release)}</strong></p><p>Label: <strong style={{ color: "var(--text)" }}>{display(release.labelDisplayName || release.labelName)}</strong></p><p>Genre: <strong style={{ color: "var(--text)" }}>{display([release.primaryGenre || release.genre, release.secondaryGenre].filter(Boolean).join(" / "))}</strong></p><p>UPC: <strong style={{ color: "var(--text)" }}>{resolvedUpc(release)}</strong></p></div>
          <div className="mt-5 flex flex-wrap gap-2">{canEdit ? <button type="button" onClick={() => release.status === "draft" ? router.push(`/distribution/start?edit=${release.id}`) : setEditWarningOpen(true)} className="btn-primary pressable inline-flex items-center gap-2"><Pencil className="h-4 w-4" />{release.status === "draft" ? "Continue editing" : "Fix release"}</button> : null}{promoLink ? <a href={promoLink} target="_blank" rel="noreferrer" className="btn-outline pressable inline-flex items-center gap-2">Promolink <ExternalLink className="h-4 w-4" /></a> : null}<Link href={`/contact?releaseId=${release.id}`} className="btn-outline pressable">Contact support</Link><button type="button" className="btn-outline pressable" aria-label="Share release"><Share2 className="h-4 w-4" /></button></div>
        </div>
      </div>
    </section>
    <div className="overflow-x-auto border-b" style={{ borderColor: "var(--border)" }}><div className="flex min-w-max gap-7">{relevantTabs.map((item) => <button key={item} type="button" onClick={() => setTab(item)} aria-current={tab === item ? "page" : undefined} className="border-b-2 px-1 py-4 text-sm font-semibold" style={{ borderColor: tab === item ? "var(--accent)" : "transparent", color: tab === item ? "var(--text)" : "var(--text-muted)" }}>{DETAIL_TAB_LABELS[item]}</button>)}</div></div>
    {tab === "overview" ? <div className="grid gap-6"><section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[["Current Status", release.status.replace(/_/g, " ")], ["Release Date", getReleasePortalDateLabel(release)], ["UPC", resolvedUpc(release)], ["Total Tracks", getReleasePortalTrackCount(release)], ["Distribution Stage", hasDistribution ? "In distribution" : "Not sent"], ["Review Stage", release.reviewedAt ? "Reviewed" : release.submittedAt ? "In review" : "Not submitted"]].map(([label, value]) => <div key={label} className="metric-card p-4"><p className="text-xs uppercase tracking-[0.14em]" style={{ color: "var(--text-soft)" }}>{label}</p><p className="mt-2 font-semibold capitalize">{value}</p></div>)}</section><section className="surface-card"><h2 className="text-xl font-semibold">Release progress</h2><div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">{["Draft", "Submitted", "HYMN Review", "Sent to Distributor", "Scheduled", "Live"].map((label, index) => { const stageIndex = release.status === "draft" ? 0 : !hasDistribution ? 2 : release.status === "scheduled" ? 4 : release.status === "live" ? 5 : 3; const complete = index < stageIndex; const current = index === stageIndex; return <div key={label} className="relative"><span className="inline-flex h-3 w-3 rounded-full" style={{ background: complete || current ? "var(--accent)" : "var(--border)", boxShadow: current ? "0 0 0 5px color-mix(in srgb, var(--accent) 18%, transparent)" : undefined }} /><p className="mt-3 text-xs font-semibold" style={{ color: current ? "var(--text)" : "var(--text-muted)" }}>{label}</p><p className="mt-1 text-[11px]" style={{ color: "var(--text-soft)" }}>{complete ? "Completed" : current ? "Current" : "Upcoming"}</p></div>; })}</div></section></div> : null}
    {tab === "overview" ? <section className="surface-card"><h2 className="text-xl font-semibold">Identifiers</h2><div className="mt-5 divide-y" style={{ borderColor: "var(--border)" }}><div className="flex flex-wrap items-center justify-between gap-3 py-4"><p className="text-xs uppercase tracking-[0.16em]" style={{ color: "var(--text-soft)" }}>UPC</p><IdentifierValue value={resolvedUpc(release)} /></div>{(release.tracks ?? []).map((track, index) => <div key={track.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="text-sm font-semibold">{track.trackTitle || `Track ${index + 1}`}</p><p className="mt-1 text-xs uppercase tracking-[0.16em]" style={{ color: "var(--text-soft)" }}>ISRC</p></div><IdentifierValue value={resolvedIsrc(release, track, index)} /></div>)}</div><p className="mt-4 text-xs" style={{ color: "var(--text-soft)" }}>Assigned by DireNote</p></section> : null}
    {tab === "information" ? <div className="release-manage-information grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
      <section className="surface-card"><h2 className="text-xl font-semibold">Tracks</h2><div className="mt-4 grid gap-3">{(release.tracks ?? []).map((track, index) => <details key={track.id} open={index === 0} className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}><summary className="cursor-pointer font-semibold">{String(track.trackNumber || index + 1).padStart(2, "0")} {track.trackTitle}</summary><div className="mt-4 grid gap-2">{[["Track Title", track.trackTitle], ["Genre", release.primaryGenre], ["Subgenre", release.secondaryGenre], ["Primary Artist(s)", track.primaryArtist], ["Featured Artist(s)", track.featuredArtists], ["Composition Type", (track.metadata as any)?.compositionType], ["Original Composer(s)", track.composers], ["Producer", track.producers], ["ISRC", resolvedIsrc(release, track, index)], ["Explicit Content", track.explicitContent ? "Yes" : "No"], ["Preview Start", (track.metadata as any)?.previewStart], ["Language of Lyrics", release.language], ["Lyricists", track.songwriters], ["Mood", release.mood]].map(([label, value]) => <div key={label} className="summary-card"><span>{label}</span><span className="text-right">{display(value)}</span></div>)}</div></details>)}{!release.tracks?.length ? <p style={{ color: "var(--text-muted)" }}>No track metadata available yet.</p> : null}</div></section>
      <section className="surface-card"><h2 className="text-xl font-semibold">Release Info</h2><div className="mt-4 grid gap-2">{[["Title", title], ["Catalog Number", release.distributorReleaseId], ["Language", release.language], ["Composition Owner", release.copyrightOwner], ["Year of Composition", (releaseMetadata(release) as any).yearOfComposition], ["Master Recording Owner", release.publishingRights || release.copyrightOwner], ["Year of Recording", (releaseMetadata(release) as any).yearOfRecording], ["Universal Product Code (UPC)", resolvedUpc(release)], ["Label", release.labelDisplayName || release.labelName], ["Mood", release.mood]].map(([label, value]) => <div key={label} className="summary-card"><span>{label}</span><span className="text-right">{display(value)}</span></div>)}</div></section>
    </div> : null}
    {tab === "tracks" ? <section className="surface-card"><h2 className="text-2xl font-semibold">Tracks</h2><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Submitted audio, credits, rights, and identifier details.</p><div className="mt-5 grid gap-3">{(release.tracks ?? []).map((track, index) => <details key={track.id} open={index === 0} className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}><summary className="cursor-pointer font-semibold">{String(track.trackNumber || index + 1).padStart(2, "0")} · {track.trackTitle}</summary><div className="mt-4 grid gap-2 sm:grid-cols-2">{[["Track Title", track.trackTitle], ["Version", track.version], ["Primary Artist", track.primaryArtist], ["Featured Artist", track.featuredArtists], ["Producer", track.producers], ["Songwriter", track.songwriters], ["Composer", track.composers], ["Genre", release.primaryGenre || release.genre], ["Subgenre", release.secondaryGenre], ["Language", release.language], ["Mood", release.mood], ["Explicit Content", track.explicitContent ? "Yes" : "No"], ["Lyrics Status", track.lyrics || track.trackLyrics ? "Provided" : "Not provided"], ["Audio File Status", track.audioUrl ? "Uploaded" : "Missing"], ["ISRC", resolvedIsrc(release, track, index)], ["Preview Start", (track.metadata as any)?.previewStart], ["Composition Type", (track.metadata as any)?.compositionType], ["License Proof", track.coverLicenseUrl || release.licenseDocumentUrl], ["AI / Suno Proof", release.sunoReceiptUrl || release.suno_receipt_url]].map(([label, value]) => <div key={label} className="summary-card"><span>{label}</span><span className="text-right">{display(value)}</span></div>)}</div></details>)}{!release.tracks?.length ? <p className="rounded-xl border p-5 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>No track metadata is available for this release.</p> : null}</div></section> : null}
    {tab === "corrections" ? <CorrectionWorkspace release={release} onFix={() => setEditWarningOpen(true)} /> : null}
    {tab === "splits" ? <section className="surface-card"><h2 className="text-2xl font-semibold">Royalty splits</h2><p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--text-muted)" }}>Create and manage payout shares, send registered-email invites, generate 10-hour collaborator codes, and monitor acceptance from the secure Splits workspace.</p><div className="mt-5 rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>Split recipients and acceptance status are managed in the secure Splits workspace. No percentages are inferred or fabricated here.</div><div className="mt-5 flex flex-wrap gap-3"><Link href={`/dashboard?module=splits&tab=created&releaseId=${release.id}`} className="btn-primary pressable">Manage splits</Link><Link href="/payout" className="btn-outline pressable">View split earnings</Link></div></section> : null}
    {tab === "distribution" ? <DeliveryMatrix release={release} /> : null}
    {tab === "requests" ? <ChangeRequestWorkspace release={release} requests={changeRequests} onCreated={(request) => setChangeRequests((current) => [request, ...current.filter((item) => item.id !== request.id)])} /> : null}
    {tab === "promolink" ? promoLink ? <section className="surface-card"><h2 className="text-2xl font-semibold">Promolink</h2><div className="mt-5 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center" style={{ borderColor: "var(--border)" }}><a href={promoLink} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate" style={{ color: "var(--accent)" }}>{promoLink}</a><button type="button" onClick={() => navigator.clipboard.writeText(promoLink)} className="btn-outline pressable inline-flex items-center gap-2"><Copy className="h-4 w-4" /> Copy</button></div></section> : <EmptyState title="Promolink is not available for this release yet" description="Once your release links are processed, they will appear here." actionHref="/dashboard/releases" actionLabel="Back to releases" /> : null}
    {tab === "earnings" ? <section className="surface-card"><h2 className="text-2xl font-semibold">Release earnings</h2><div className="mt-5 grid gap-3 sm:grid-cols-3">{[["Recorded earnings", release.analytics?.revenue_total ? `₹${release.analytics.revenue_total.toLocaleString()}` : "—"], ["Streams", release.analytics?.streams_total?.toLocaleString()], ["Payout status", release.analytics?.revenue_total ? "See payout ledger" : "Not available"]].map(([label, value]) => <div key={label} className="metric-card p-4"><p className="text-xs uppercase tracking-[0.14em]" style={{ color: "var(--text-soft)" }}>{label}</p><p className="mt-2 font-semibold">{display(value)}</p></div>)}</div><p className="mt-5 text-sm" style={{ color: "var(--text-muted)" }}>Earnings usually take around 1.5 months to reflect after platform reporting and distributor processing.</p><Link href="/payout" className="btn-outline pressable mt-5">Open payout statements</Link></section> : null}
    {tab === "activity" ? <section className="surface-card"><h2 className="text-2xl font-semibold">Release activity</h2><div className="mt-6 grid gap-0">{[["Draft created", "Release workspace created.", release.createdAt], ["Release submitted", "Metadata, artwork, and audio submitted to HYMN.", release.submittedAt], ["HYMN review", release.reviewNote || "HYMN review activity recorded.", release.reviewedAt], ["Approved by HYMN", "Release approved for distribution.", release.approvedAt], ["Sent to distributor", "Release forwarded to the distribution partner.", release.distributedAt], ["Live status updated", "Platform availability confirmed.", release.liveAt]].filter((item) => item[2]).map(([event, description, timestamp]) => <div key={event} className="grid grid-cols-[18px,1fr] gap-3 border-l pb-6 pl-4 last:pb-0" style={{ borderColor: "var(--border)" }}><span className="-ml-[21px] mt-1 h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent)" }} /><div><p className="font-semibold">{event}</p><p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{description}</p><time className="mt-2 block text-xs" style={{ color: "var(--text-soft)" }}>{new Date(String(timestamp)).toLocaleString()}</time></div></div>)}</div></section> : null}
    {editWarningOpen ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target && !isEditing) setEditWarningOpen(false); }}><div ref={editDialogRef as React.RefObject<HTMLDivElement | null>} role="dialog" aria-modal="true" aria-labelledby="edit-release-title" tabIndex={-1} className="w-full max-w-lg rounded-2xl border p-5 shadow-2xl sm:p-6" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}><div className="flex items-start gap-3"><span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}><AlertTriangle className="h-5 w-5" /></span><div><h2 id="edit-release-title" className="text-xl font-semibold">Edit this release?</h2><p className="mt-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>Editing this release will return it to Drafts and stop the review process. You&apos;ll need to re-submit and restart the review process.</p>{alreadyDistributed ? <p className="mt-3 text-sm leading-6" style={{ color: "var(--danger)" }}>This release may already be processing with distribution partners. Editing may require manual review before changes are accepted.</p> : null}{editError ? <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>{editError}</p> : null}</div></div><div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={isEditing} onClick={() => setEditWarningOpen(false)} className="btn-outline pressable justify-center">Cancel</button><button type="button" disabled={isEditing} onClick={proceedToEdit} className="pressable inline-flex min-h-11 items-center justify-center rounded-full px-5 py-2.5 font-semibold text-white disabled:opacity-60" style={{ background: "var(--danger)" }}>{isEditing ? "Returning to drafts…" : "Proceed"}</button></div></div></div> : null}
  </div>;
}

export function ReleasePortal({ releases, selectedReleaseId = null, initialPanel = null, initialTab = null, initialView = null }: { releases: Release[]; selectedReleaseId?: number | null; initialPanel?: string | null; initialTab?: string | null; initialView?: string | null }) {
  const sortedReleases = useMemo(
    () => [...releases].sort((left, right) => {
      const leftKey = getReleasePortalSortKey(left);
      const rightKey = getReleasePortalSortKey(right);
      if (leftKey.rank !== rightKey.rank) return rightKey.rank - leftKey.rank;
      return rightKey.timestamp - leftKey.timestamp;
    }),
    [releases]
  );

  const artists = useMemo(
    () => Array.from(new Set(sortedReleases.map((release) => release.artistName).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [sortedReleases]
  );

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [artistFilter, setArtistFilter] = useState("all");
  const [releaseTypeFilter, setReleaseTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<"all" | "upcoming" | "past" | "undated">("all");
  const [sortOrder, setSortOrder] = useState<"pipeline" | "newest" | "oldest" | "title">("pipeline");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const selectedRelease = useMemo(() => sortedReleases.find((release) => release.id === selectedReleaseId) ?? null, [selectedReleaseId, sortedReleases]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 180);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedSearch, statusFilter, artistFilter, releaseTypeFilter, dateFilter, sortOrder]);

  useEffect(() => {
    if (!selectedRelease) return;
    setSearch(selectedRelease.releaseTitle?.trim() || selectedRelease.trackName || selectedRelease.artistName);
  }, [selectedRelease]);

  const releaseTypes = useMemo(
    () => Array.from(new Set(sortedReleases.map((release) => release.releaseType).filter(Boolean))).sort(),
    [sortedReleases]
  );

  const filteredReleases = useMemo(() => {
    const matching = sortedReleases.filter((release) => {
      const stage = getReleasePortalStage(release);
      const query = debouncedSearch;
      const title = (release.releaseTitle?.trim() || release.trackName).toLowerCase();
      const artist = release.artistName.toLowerCase();
      const identifiers = [release.upcCode, ...(release.tracks ?? []).map((track) => track.isrc)].filter(Boolean).join(" ").toLowerCase();
      const matchesSearch = query.length === 0 || title.includes(query) || artist.includes(query) || identifiers.includes(query);
      const matchesStatus = statusFilter === "all" || stage === statusFilter;
      const matchesArtist = artistFilter === "all" || normalizeArtist(release.artistName) === artistFilter;
      const matchesReleaseType = releaseTypeFilter === "all" || release.releaseType === releaseTypeFilter;
      const releaseDate = release.releaseDate ? new Date(release.releaseDate) : null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const matchesDate = dateFilter === "all"
        || (dateFilter === "undated" && !releaseDate)
        || (dateFilter === "upcoming" && Boolean(releaseDate && releaseDate >= today))
        || (dateFilter === "past" && Boolean(releaseDate && releaseDate < today));
      return matchesSearch && matchesStatus && matchesArtist && matchesReleaseType && matchesDate;
    });
    if (sortOrder === "pipeline") return matching;
    return [...matching].sort((left, right) => {
      if (sortOrder === "title") return (left.releaseTitle || left.trackName).localeCompare(right.releaseTitle || right.trackName);
      const leftTime = new Date(left.createdAt).getTime();
      const rightTime = new Date(right.createdAt).getTime();
      return sortOrder === "oldest" ? leftTime - rightTime : rightTime - leftTime;
    });
  }, [artistFilter, dateFilter, debouncedSearch, releaseTypeFilter, sortOrder, sortedReleases, statusFilter]);

  const visibleReleases = filteredReleases.slice(0, visibleCount);
  const draftRelease = sortedReleases.find((release) => isReleaseUnfinished(release));
  const stats = {
    draft: sortedReleases.filter((release) => getReleasePortalStage(release) === "draft").length,
    scheduled: sortedReleases.filter((release) => getReleasePortalStage(release) === "scheduled").length,
    released: sortedReleases.filter((release) => getReleasePortalStage(release) === "released").length
  };
  const activeView = ["promotion", "trends", "earnings"].includes(initialView || "") ? initialView! : "releases";
  const dashboardNav = (
    <nav aria-label="Release dashboard sections" className="flex flex-wrap items-center gap-2 border-b pb-4 text-sm" style={{ borderColor: "var(--border)" }}>
      {[{ key: "releases", label: "My releases" }, { key: "promotion", label: "Promotion" }, { key: "trends", label: "Trends" }, { key: "earnings", label: "Earnings" }].map((item) => (
        <Link key={item.key} href={item.key === "releases" ? "/dashboard/releases" : `/dashboard/releases?view=${item.key}`} aria-current={activeView === item.key ? "page" : undefined} className="rounded-full border px-4 py-2 font-semibold transition hover:-translate-y-0.5" style={{ borderColor: activeView === item.key ? "var(--accent)" : "var(--border)", background: activeView === item.key ? "var(--accent)" : "var(--card)", color: activeView === item.key ? "var(--accent-foreground)" : "var(--text-muted)" }}>{item.label}</Link>
      ))}
    </nav>
  );

  if (activeView !== "releases") {
    const totalStreams = sortedReleases.reduce((sum, release) => sum + Number(release.analytics?.streams_total || 0), 0);
    const totalRevenue = sortedReleases.reduce((sum, release) => sum + Number(release.analytics?.revenue_total || 0), 0);
    return <div className="release-portal-page grid gap-6 xl:gap-8">{dashboardNav}
      {activeView === "promotion" ? <section className="surface-card p-5 sm:p-6"><h1 className="text-4xl font-semibold tracking-tight">Promotion</h1><p className="mt-3" style={{ color: "var(--text-muted)" }}>Choose a release to start planning its campaign and promotional support.</p><div className="mt-6 grid gap-3">{sortedReleases.map((release) => <div key={release.id} className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><div><p className="font-semibold">{release.releaseTitle || release.trackName}</p><p className="mt-1 text-sm capitalize" style={{ color: "var(--text-muted)" }}>{release.status.replace(/_/g, " ")}</p></div><Link href={`/contact?releaseId=${release.id}`} className="btn-outline pressable text-center">Promote release</Link></div>)}</div></section> : null}
      {activeView === "trends" ? <section className="surface-card p-5 sm:p-6"><h1 className="text-4xl font-semibold tracking-tight">Trends</h1><p className="mt-3" style={{ color: "var(--text-muted)" }}>A catalogue-level view of reported audience activity.</p><div className="mt-6 grid gap-4 sm:grid-cols-3"><div className="metric-card p-5"><p className="text-sm" style={{ color: "var(--text-muted)" }}>Reported streams</p><p className="mt-2 text-2xl font-semibold">{totalStreams.toLocaleString()}</p></div><div className="metric-card p-5"><p className="text-sm" style={{ color: "var(--text-muted)" }}>Live releases</p><p className="mt-2 text-2xl font-semibold">{stats.released}</p></div><div className="metric-card p-5"><p className="text-sm" style={{ color: "var(--text-muted)" }}>Scheduled</p><p className="mt-2 text-2xl font-semibold">{stats.scheduled}</p></div></div><Link href="/analytics" className="btn-primary pressable mt-6 inline-flex">Open detailed analytics</Link></section> : null}
      {activeView === "earnings" ? <section className="surface-card p-5 sm:p-6"><h1 className="text-4xl font-semibold tracking-tight">Earnings</h1><p className="mt-3" style={{ color: "var(--text-muted)" }}>Review reported release revenue and open your payout ledger.</p><div className="metric-card mt-6 p-5"><p className="text-sm" style={{ color: "var(--text-muted)" }}>Recorded release earnings</p><p className="mt-2 text-3xl font-semibold">₹{totalRevenue.toLocaleString()}</p></div><Link href="/payout" className="btn-primary pressable mt-6 inline-flex">Open payout statements</Link></section> : null}
    </div>;
  }
  const statsChips = (
    <>
      <span className="inline-flex items-center gap-2 rounded-full border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
        <Clock3 className="h-4 w-4" />
        {sortedReleases.length} total releases
      </span>
      <span className="inline-flex items-center gap-2 rounded-full border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
        Draft {stats.draft}
      </span>
      <span className="inline-flex items-center gap-2 rounded-full border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
        Scheduled {stats.scheduled}
      </span>
      <span className="inline-flex items-center gap-2 rounded-full border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
        Released {stats.released}
      </span>
    </>
  );

  if (selectedRelease && initialPanel !== "redressal") return <ReleaseManage release={selectedRelease} initialTab={initialTab} />;

  const filtersGrid = (
    <>
      <label className="grid gap-2 text-sm">
        <span className="flex items-center gap-2 uppercase tracking-[0.2em]" style={{ color: "var(--text-soft)" }}>
          <Filter className="h-3.5 w-3.5" />
          Status
        </span>
        <select className="field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-sm">
        <span className="flex items-center gap-2 uppercase tracking-[0.2em]" style={{ color: "var(--text-soft)" }}>
          <Filter className="h-3.5 w-3.5" />
          Release date
        </span>
        <select className="field" value={dateFilter} onChange={(event) => setDateFilter(event.target.value as typeof dateFilter)}>
          <option value="all">Any Date</option>
          <option value="upcoming">Upcoming</option>
          <option value="past">Past</option>
          <option value="undated">No Date</option>
        </select>
      </label>

      <label className="grid gap-2 text-sm">
        <span className="flex items-center gap-2 uppercase tracking-[0.2em]" style={{ color: "var(--text-soft)" }}>
          <Filter className="h-3.5 w-3.5" />
          Release type
        </span>
        <select className="field" value={releaseTypeFilter} onChange={(event) => setReleaseTypeFilter(event.target.value)}>
          <option value="all">All Types</option>
          {releaseTypes.map((releaseType) => <option key={releaseType} value={releaseType}>{releaseType.replace(/_/g, " ")}</option>)}
        </select>
      </label>

      <label className="grid gap-2 text-sm">
        <span className="flex items-center gap-2 uppercase tracking-[0.2em]" style={{ color: "var(--text-soft)" }}>
          <Filter className="h-3.5 w-3.5" />
          Sort
        </span>
        <select className="field" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)}>
          <option value="pipeline">Workflow priority</option>
          <option value="newest">Newest updated</option>
          <option value="oldest">Oldest updated</option>
          <option value="title">Title A–Z</option>
        </select>
      </label>

      <label className="grid gap-2 text-sm">
        <span className="flex items-center gap-2 uppercase tracking-[0.2em]" style={{ color: "var(--text-soft)" }}>
          <Filter className="h-3.5 w-3.5" />
          Artist
        </span>
        <select className="field" value={artistFilter} onChange={(event) => setArtistFilter(event.target.value)}>
          <option value="all">All Artists</option>
          {artists.map((artist) => (
            <option key={artist} value={normalizeArtist(artist)}>{artist}</option>
          ))}
        </select>
      </label>

      <div className="rounded-2xl border px-4 py-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
        <p className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--text-soft)" }}>Visible now</p>
        <p className="mt-2 text-lg font-semibold" style={{ color: "var(--text)" }}>{Math.min(visibleCount, filteredReleases.length)} / {filteredReleases.length}</p>
      </div>
    </>
  );

  if (sortedReleases.length === 0) {
    return (
      <div className="release-portal-page grid gap-6">
        <EmptyState
          title="You have no releases yet"
          description="Start your first distribution and keep everything organized from one clean control center."
          actionHref="/distribution/start"
          actionLabel="Create Release"
        />
      </div>
    );
  }

  return (
    <div className="release-portal-page grid gap-6 xl:gap-8">
      {draftRelease ? (
        <section className="surface-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Continue your draft release</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
              Pick up {draftRelease.releaseTitle?.trim() || draftRelease.trackName} from where you left off.
            </p>
          </div>
          <Link href={getReleasePortalAction(draftRelease).href} className="inline-flex w-full items-center justify-center rounded-full px-5 py-3 font-semibold transition hover:-translate-y-0.5 sm:w-auto" style={{ background: "var(--money)", color: "var(--money-foreground)", boxShadow: "0 16px 38px rgba(245,193,108,0.16)" }}>
            Finish your release
          </Link>
        </section>
      ) : null}

      {dashboardNav}

      <section className="surface-card p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>My releases</h1>
            <p className="mt-3 text-base" style={{ color: "var(--text-muted)" }}>Manage and track all your music releases.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-2xl lg:justify-end"><label className="relative min-w-0 flex-1">
            <span className="sr-only">Search by title or artist</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-soft)" }} />
            <input
              className="field pl-11"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, artist, UPC or ISRC"
            />
          </label><div className="inline-flex rounded-xl border p-1" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><button type="button" aria-label="Grid view" onClick={() => setViewMode("grid")} className="inline-flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: viewMode === "grid" ? "var(--card)" : "transparent", color: viewMode === "grid" ? "var(--text)" : "var(--text-soft)" }}><Grid2X2 className="h-4 w-4" /></button><button type="button" aria-label="List view" onClick={() => setViewMode("list")} className="inline-flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: viewMode === "list" ? "var(--card)" : "transparent", color: viewMode === "list" ? "var(--text)" : "var(--text-soft)" }}><List className="h-4 w-4" /></button></div><Link href="/distribution/start" className="btn-primary pressable whitespace-nowrap">Add release</Link></div>
        </div>

        {selectedRelease ? (
          <div className="mt-5 rounded-2xl border p-4" style={{ borderColor: initialPanel === "redressal" ? "rgba(248,113,113,0.48)" : "var(--border)", background: initialPanel === "redressal" ? "rgba(248,113,113,0.08)" : "var(--bg-soft)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              {selectedRelease.status === "rejected" ? "Rejected" : selectedRelease.status === "changes_requested" ? "Changes Requested" : initialPanel === "redressal" ? "Redressal panel" : "Selected release"}
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              {selectedRelease.status === "rejected" ? selectedRelease.rejectionReason : selectedRelease.status === "changes_requested" ? selectedRelease.correctionReason : `Showing ${selectedRelease.releaseTitle?.trim() || selectedRelease.trackName}.`}
            </p>
            {(selectedRelease.status === "rejected" || selectedRelease.status === "changes_requested") && selectedRelease.reviewIssues ? <div className="mt-4 grid gap-3">
              <div className="flex flex-wrap gap-2"><span className="status-pill status-pill-active capitalize">{selectedRelease.reviewIssues.type.replace(/_/g, " ")}</span><span className="status-pill capitalize">{selectedRelease.reviewIssues.severity.replace(/_/g, " ")}</span></div>
              {selectedRelease.reviewIssues.fields.map((issue) => <div key={issue.field} className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}><p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{issue.label}</p>{issue.note ? <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{issue.note}</p> : null}</div>)}
              <div className="flex flex-wrap gap-2"><Link href={getReleasePortalAction(selectedRelease).href} className="btn-primary pressable">Fix Release</Link><Link href={`/dashboard/releases?releaseId=${selectedRelease.id}&panel=redressal`} className="btn-outline pressable">View Redressal</Link></div>
            </div> : null}
          </div>
        ) : null}

        <details className="ios-collapse mt-5 rounded-2xl p-4 lg:hidden">
          <summary className="flex list-none items-center justify-between gap-3 text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--text)" }}>
            Filters and totals
            <ChevronDown className="ios-collapse-icon h-4 w-4" />
          </summary>

          <div className="ios-collapse-content">
            <div className="ios-collapse-inner">
              <div className="mt-4 flex flex-wrap gap-2 text-xs sm:text-sm" style={{ color: "var(--text-muted)" }}>
                {statsChips}
              </div>

              <div className="mt-4 grid gap-3">
                {filtersGrid}
              </div>
            </div>
          </div>
        </details>

        <div className="mt-6 hidden flex-wrap gap-3 text-sm lg:flex" style={{ color: "var(--text-muted)" }}>
          {statsChips}
        </div>

        <div className="mt-6 hidden gap-4 lg:grid lg:grid-cols-3 xl:grid-cols-6">
          {filtersGrid}
        </div>
      </section>

      <section>
        {filteredReleases.length === 0 ? (
          <EmptyState
            title="No releases match your filters"
            description="Try a different title, artist, or status filter to bring your catalogue back into view."
            actionHref="/dashboard/releases"
            actionLabel="Reset view"
          />
        ) : viewMode === "list" ? (
          <>
            <div className="grid gap-4 lg:hidden">
              {visibleReleases.map((release) => <ReleaseCard key={release.id} release={release} selected={release.id === selectedReleaseId} />)}
            </div>
            <div className="hidden overflow-x-auto rounded-2xl border lg:block" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <table className="w-full min-w-[1120px] text-left text-sm">
                <thead><tr className="border-b text-xs uppercase tracking-[0.12em]" style={{ borderColor: "var(--border)", color: "var(--text-soft)" }}><th className="px-4 py-3">Artwork</th><th className="px-4 py-3">Release</th><th className="px-4 py-3">Artist</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Release date</th><th className="px-4 py-3">HYMN status</th><th className="px-4 py-3">Store status</th><th className="px-4 py-3">UPC</th><th className="px-4 py-3 text-right">Verified earnings</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
                <tbody>{visibleReleases.map((release) => {
                  const action = getReleasePortalAction(release);
                  const liveStores = release.distributionStores?.filter((store) => store.status === "Live").length ?? 0;
                  const storeTotal = release.distributionStores?.length ?? 0;
                  return <tr key={release.id} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-3"><div className="h-11 w-11 overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>{release.artworkUrl ? <img src={release.artworkUrl} alt="" className="h-full w-full object-cover" /> : null}</div></td>
                    <td className="max-w-[220px] px-4 py-3"><Link href={`/dashboard/releases/${release.id}`} className="block truncate font-semibold hover:underline">{release.releaseTitle || release.trackName}</Link></td>
                    <td className="max-w-[160px] truncate px-4 py-3" style={{ color: "var(--text-muted)" }}>{release.artistName}</td>
                    <td className="px-4 py-3 capitalize" style={{ color: "var(--text-muted)" }}>{release.releaseType}</td>
                    <td className="whitespace-nowrap px-4 py-3" style={{ color: "var(--text-muted)" }}>{getReleasePortalDateLabel(release)}</td>
                    <td className="px-4 py-3"><span className="status-pill capitalize">{getReleasePortalStage(release).replace(/_/g, " ")}</span></td>
                    <td className="whitespace-nowrap px-4 py-3" style={{ color: "var(--text-muted)" }}>{storeTotal ? `${liveStores} of ${storeTotal} live` : "Not reported"}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>{resolvedUpc(release)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{Number(release.analytics?.revenue_total || 0) > 0 ? `₹${Number(release.analytics?.revenue_total).toLocaleString("en-IN")}` : "—"}</td>
                    <td className="px-4 py-3 text-right"><Link href={action.href} className="btn-outline pressable inline-flex min-h-10 px-3 py-2 text-xs">{action.label}</Link></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 justify-items-center gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleReleases.map((release) => <ReleaseCard key={release.id} release={release} selected={release.id === selectedReleaseId} />)}
          </div>
        )}
      </section>

      {filteredReleases.length > visibleCount ? (
        <section className="flex justify-center">
          <button type="button" onClick={() => setVisibleCount((current) => current + PAGE_SIZE)} className="btn-outline pressable inline-flex w-full sm:w-auto">
            Load More
          </button>
        </section>
      ) : null}
    </div>
  );
}





// vercel trigger

// vercel trigger 2
// vercel trigger 4
// vercel trigger 5
// vercel trigger 7
// vercel trigger 9

// vercel trigger 11

// vercel trigger 12

// vercel trigger 14
