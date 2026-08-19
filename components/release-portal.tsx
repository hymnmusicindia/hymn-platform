"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, ArrowLeft, ChevronDown, Clock3, Copy, ExternalLink, Filter, Grid2X2, List, Pencil, Search, Share2, Sparkles } from "lucide-react";
import { Release } from "@/lib/types";
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

function SkeletonCard() {
  return (
    <div className="w-full overflow-hidden rounded-[1.35rem] border bg-[color-mix(in_srgb,var(--card)_96%,transparent)] md:max-w-[260px] md:justify-self-center" style={{ borderColor: "var(--border)" }}>
      <div className="aspect-square animate-pulse bg-[color-mix(in_srgb,var(--bg-soft)_80%,transparent)]" />
      <div className="space-y-3 p-4">
        <div className="h-4 w-24 animate-pulse rounded-full bg-[color-mix(in_srgb,var(--bg-soft)_80%,transparent)]" />
        <div className="h-5 w-4/5 animate-pulse rounded-full bg-[color-mix(in_srgb,var(--bg-soft)_80%,transparent)]" />
        <div className="h-4 w-3/5 animate-pulse rounded-full bg-[color-mix(in_srgb,var(--bg-soft)_80%,transparent)]" />
        <div className="h-11 animate-pulse rounded-full bg-[color-mix(in_srgb,var(--bg-soft)_80%,transparent)]" />
      </div>
    </div>
  );
}

const DETAIL_TABS = ["overview", "information", "tracks", "distribution", "corrections", "splits", "promolink", "earnings", "activity"] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

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
  return ["sent", "sent_to_distributor", "processing", "delivered"].includes(release.status) ? "Pending" : "—";
}

function resolvedIsrc(release: Release, track: NonNullable<Release["tracks"]>[number], index: number) {
  if (track.isrc?.trim()) return track.isrc.trim();
  const meta = releaseMetadata(release) as Record<string, any>;
  const responseTracks = Array.isArray(meta.direnoteResponse?.tracks) ? meta.direnoteResponse.tracks : [];
  const byName = responseTracks.find((item: any) => String(item?.track_name || "").trim().toLowerCase() === track.trackTitle.trim().toLowerCase());
  const value = byName?.isrc || responseTracks[index]?.isrc || meta.tracks?.[index]?.isrc || track.metadata?.isrc;
  if (typeof value === "string" && value.trim()) return value.trim();
  return ["sent", "sent_to_distributor", "processing", "delivered"].includes(release.status) ? "Pending" : "—";
}

export function ReleaseManage({ release, initialTab }: { release: Release; initialTab?: string | null }) {
  const router = useRouter();
  const [tab, setTab] = useState<DetailTab>(DETAIL_TABS.includes(initialTab as DetailTab) ? initialTab as DetailTab : "overview");
  const [editWarningOpen, setEditWarningOpen] = useState(false);
  const [editError, setEditError] = useState("");
  const [isEditing, startEditing] = useTransition();
  const title = release.releaseTitle?.trim() || release.trackName;
  const promoLink = release.presaveSpotify || release.presaveApple || release.exclusiveSpotify || release.exclusiveApple;
  const alreadyDistributed = ["sent", "sent_to_distributor", "processing", "delivered", "live"].includes(release.status);
  const canEdit = ["draft", "changes_requested", "rejected"].includes(release.status);
  const metadata = releaseMetadata(release) as Record<string, any>;
  const hasCorrections = Boolean(release.reviewIssues?.fields.length || release.correctionReason || release.rejectionReason || metadata.direnoteValidationErrors);
  const hasDistribution = alreadyDistributed || Boolean(release.distributionStores?.length) || ["direnote_accepted", "scheduled", "awaiting_live_confirmation", "partially_live"].includes(release.status);
  const hasEarnings = release.status === "live" || Number(release.analytics?.revenue_total || 0) > 0;
  const relevantTabs = DETAIL_TABS.filter((item) => item !== "corrections" || hasCorrections).filter((item) => item !== "distribution" || hasDistribution).filter((item) => item !== "earnings" || hasEarnings).filter((item) => item !== "promolink" || Boolean(promoLink) || hasDistribution);

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
        <div className="aspect-square overflow-hidden rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>{release.artworkUrl ? <img src={release.artworkUrl} alt={title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Sparkles className="h-10 w-10" /></div>}</div>
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2"><span className="status-pill status-pill-active">{release.status.replace(/_/g, " ")}</span><span className="status-pill capitalize">{release.releaseType}</span></div>
          <h1 className="mt-4 truncate text-3xl font-semibold sm:text-4xl" style={{ color: "var(--text)" }}>{title}</h1>
          <p className="mt-2" style={{ color: "var(--text-muted)" }}>{release.artistName} · {getReleasePortalTrackCount(release)} track{getReleasePortalTrackCount(release) === 1 ? "" : "s"}</p>
          <div className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2" style={{ color: "var(--text-muted)" }}><p>Release Date: <strong style={{ color: "var(--text)" }}>{getReleasePortalDateLabel(release)}</strong></p><p>Label: <strong style={{ color: "var(--text)" }}>{display(release.labelDisplayName || release.labelName)}</strong></p><p>Genre: <strong style={{ color: "var(--text)" }}>{display([release.primaryGenre || release.genre, release.secondaryGenre].filter(Boolean).join(" / "))}</strong></p><p>UPC: <strong style={{ color: "var(--text)" }}>{resolvedUpc(release)}</strong></p></div>
          <div className="mt-5 flex flex-wrap gap-2">{canEdit ? <button type="button" onClick={() => release.status === "draft" ? router.push(`/distribution/start?edit=${release.id}`) : setEditWarningOpen(true)} className="btn-primary pressable inline-flex items-center gap-2"><Pencil className="h-4 w-4" />{release.status === "draft" ? "Continue editing" : "Fix release"}</button> : null}{promoLink ? <a href={promoLink} target="_blank" rel="noreferrer" className="btn-outline pressable inline-flex items-center gap-2">Promolink <ExternalLink className="h-4 w-4" /></a> : null}<Link href={`/contact?releaseId=${release.id}`} className="btn-outline pressable">Contact support</Link><button type="button" className="btn-outline pressable" aria-label="Share release"><Share2 className="h-4 w-4" /></button></div>
        </div>
      </div>
    </section>
    <div className="overflow-x-auto border-b" style={{ borderColor: "var(--border)" }}><div className="flex min-w-max gap-7">{relevantTabs.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className="border-b-2 px-1 py-4 text-sm font-semibold capitalize" style={{ borderColor: tab === item ? "var(--accent)" : "transparent", color: tab === item ? "var(--text)" : "var(--text-muted)" }}>{item}</button>)}</div></div>
    {tab === "overview" ? <div className="grid gap-6"><section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[["Current Status", release.status.replace(/_/g, " ")], ["Release Date", getReleasePortalDateLabel(release)], ["UPC", resolvedUpc(release)], ["Total Tracks", getReleasePortalTrackCount(release)], ["Distribution Stage", hasDistribution ? "In distribution" : "Not sent"], ["Review Stage", release.reviewedAt ? "Reviewed" : release.submittedAt ? "In review" : "Not submitted"]].map(([label, value]) => <div key={label} className="metric-card p-4"><p className="text-xs uppercase tracking-[0.14em]" style={{ color: "var(--text-soft)" }}>{label}</p><p className="mt-2 font-semibold capitalize">{value}</p></div>)}</section><section className="surface-card"><h2 className="text-xl font-semibold">Release progress</h2><div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">{["Draft", "Submitted", "HYMN Review", "Sent to Distributor", "Scheduled", "Live"].map((label, index) => { const stageIndex = release.status === "draft" ? 0 : !hasDistribution ? 2 : release.status === "scheduled" ? 4 : release.status === "live" ? 5 : 3; const complete = index < stageIndex; const current = index === stageIndex; return <div key={label} className="relative"><span className="inline-flex h-3 w-3 rounded-full" style={{ background: complete || current ? "var(--accent)" : "var(--border)", boxShadow: current ? "0 0 0 5px color-mix(in srgb, var(--accent) 18%, transparent)" : undefined }} /><p className="mt-3 text-xs font-semibold" style={{ color: current ? "var(--text)" : "var(--text-muted)" }}>{label}</p><p className="mt-1 text-[11px]" style={{ color: "var(--text-soft)" }}>{complete ? "Completed" : current ? "Current" : "Upcoming"}</p></div>; })}</div></section></div> : null}
    {tab === "information" ? <div className="release-manage-information grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
      <section className="surface-card"><h2 className="text-xl font-semibold">Tracks</h2><div className="mt-4 grid gap-3">{(release.tracks ?? []).map((track, index) => <details key={track.id} open={index === 0} className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}><summary className="cursor-pointer font-semibold">{String(track.trackNumber || index + 1).padStart(2, "0")} {track.trackTitle}</summary><div className="mt-4 grid gap-2">{[["Track Title", track.trackTitle], ["Genre", release.primaryGenre], ["Subgenre", release.secondaryGenre], ["Primary Artist(s)", track.primaryArtist], ["Featured Artist(s)", track.featuredArtists], ["Composition Type", (track.metadata as any)?.compositionType], ["Original Composer(s)", track.composers], ["Producer", track.producers], ["ISRC", resolvedIsrc(release, track, index)], ["Explicit Content", track.explicitContent ? "Yes" : "No"], ["Preview Start", (track.metadata as any)?.previewStart], ["Language of Lyrics", release.language], ["Lyricists", track.songwriters], ["Mood", release.mood]].map(([label, value]) => <div key={label} className="summary-card"><span>{label}</span><span className="text-right">{display(value)}</span></div>)}</div></details>)}{!release.tracks?.length ? <p style={{ color: "var(--text-muted)" }}>No track metadata available yet.</p> : null}</div></section>
      <section className="surface-card"><h2 className="text-xl font-semibold">Release Info</h2><div className="mt-4 grid gap-2">{[["Title", title], ["Catalog Number", release.distributorReleaseId], ["Language", release.language], ["Composition Owner", release.copyrightOwner], ["Year of Composition", (releaseMetadata(release) as any).yearOfComposition], ["Master Recording Owner", release.publishingRights || release.copyrightOwner], ["Year of Recording", (releaseMetadata(release) as any).yearOfRecording], ["Universal Product Code (UPC)", resolvedUpc(release)], ["Label", release.labelDisplayName || release.labelName], ["Mood", release.mood]].map(([label, value]) => <div key={label} className="summary-card"><span>{label}</span><span className="text-right">{display(value)}</span></div>)}</div></section>
    </div> : null}
    {tab === "tracks" ? <section className="surface-card"><h2 className="text-2xl font-semibold">Tracks</h2><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Submitted audio, credits, rights, and identifier details.</p><div className="mt-5 grid gap-3">{(release.tracks ?? []).map((track, index) => <details key={track.id} open={index === 0} className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}><summary className="cursor-pointer font-semibold">{String(track.trackNumber || index + 1).padStart(2, "0")} · {track.trackTitle}</summary><div className="mt-4 grid gap-2 sm:grid-cols-2">{[["Track Title", track.trackTitle], ["Version", track.version], ["Primary Artist", track.primaryArtist], ["Featured Artist", track.featuredArtists], ["Producer", track.producers], ["Songwriter", track.songwriters], ["Composer", track.composers], ["Genre", release.primaryGenre || release.genre], ["Subgenre", release.secondaryGenre], ["Language", release.language], ["Mood", release.mood], ["Explicit Content", track.explicitContent ? "Yes" : "No"], ["Lyrics Status", track.lyrics || track.trackLyrics ? "Provided" : "Not provided"], ["Audio File Status", track.audioUrl ? "Uploaded" : "Missing"], ["ISRC", resolvedIsrc(release, track, index)], ["Preview Start", (track.metadata as any)?.previewStart], ["Composition Type", (track.metadata as any)?.compositionType], ["License Proof", track.coverLicenseUrl || release.licenseDocumentUrl], ["AI / Suno Proof", release.sunoReceiptUrl || release.suno_receipt_url]].map(([label, value]) => <div key={label} className="summary-card"><span>{label}</span><span className="text-right">{display(value)}</span></div>)}</div></details>)}{!release.tracks?.length ? <p className="rounded-xl border p-5 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>No track metadata is available for this release.</p> : null}</div></section> : null}
    {tab === "corrections" ? <section className="surface-card"><h2 className="text-2xl font-semibold">Corrections</h2><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Resolve each requested change before resubmitting.</p><div className="mt-5 grid gap-3">{release.reviewIssues?.fields.map((issue) => <div key={issue.field} className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{issue.label}</p><span className="status-pill capitalize">{release.reviewIssues?.severity.replace(/_/g, " ")}</span></div><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{issue.note || release.correctionReason || release.rejectionReason || "A correction is required for this field."}</p></div>)}{!release.reviewIssues?.fields.length ? <p className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>{release.correctionReason || release.rejectionReason || "No correction requests for this release."}</p> : null}</div><div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => setEditWarningOpen(true)} className="btn-primary pressable">Fix release</button><Link href={`/contact?releaseId=${release.id}`} className="btn-outline pressable">Contact support</Link></div></section> : null}
    {tab === "splits" ? <section className="surface-card"><h2 className="text-2xl font-semibold">Royalty splits</h2><p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--text-muted)" }}>Create and manage payout shares, send registered-email invites, generate 10-hour collaborator codes, and monitor acceptance from the secure Splits workspace.</p><div className="mt-5 rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>Split recipients and acceptance status are managed in the secure Splits workspace. No percentages are inferred or fabricated here.</div><div className="mt-5 flex flex-wrap gap-3"><Link href={`/dashboard?module=splits&tab=created&releaseId=${release.id}`} className="btn-primary pressable">Manage splits</Link><Link href="/payout" className="btn-outline pressable">View split earnings</Link></div></section> : null}
    {tab === "distribution" ? <section className="surface-card"><div><h2 className="text-2xl font-semibold">Distribution</h2><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Current store and platform delivery status.</p></div>{release.distributionStores?.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead><tr className="border-b text-xs uppercase tracking-[0.16em]" style={{ borderColor: "var(--border)", color: "var(--text-soft)" }}><th className="px-3 py-3">Platform</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Details</th><th className="px-3 py-3">Updated</th></tr></thead><tbody>{release.distributionStores.map((store) => <tr key={store.platform} className="border-b" style={{ borderColor: "var(--border)" }}><td className="px-3 py-4 font-semibold">{store.platform}</td><td className="px-3 py-4"><span className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold" style={storeBadgeStyle(store.status)}>{store.status}</span></td><td className="max-w-md px-3 py-4 text-sm" style={{ color: "var(--text-muted)" }}>{store.reason ? <p className="font-semibold" style={{ color: "var(--danger)" }}>{store.reason}</p> : null}{store.userFacingNote || "—"}</td><td className="px-3 py-4 text-sm" style={{ color: "var(--text-soft)" }}>{store.updatedAt ? new Date(store.updatedAt).toLocaleDateString() : "—"}</td></tr>)}</tbody></table></div> : <p className="mt-6 rounded-xl border p-5 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>No store delivery data available yet.</p>}</section> : null}
    {tab === "promolink" ? promoLink ? <section className="surface-card"><h2 className="text-2xl font-semibold">Promolink</h2><div className="mt-5 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center" style={{ borderColor: "var(--border)" }}><a href={promoLink} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate" style={{ color: "var(--accent)" }}>{promoLink}</a><button type="button" onClick={() => navigator.clipboard.writeText(promoLink)} className="btn-outline pressable inline-flex items-center gap-2"><Copy className="h-4 w-4" /> Copy</button></div></section> : <EmptyState title="Promolink is not available for this release yet" description="Once your release links are processed, they will appear here." actionHref="/dashboard/releases" actionLabel="Back to releases" /> : null}
    {tab === "earnings" ? <section className="surface-card"><h2 className="text-2xl font-semibold">Release earnings</h2><div className="mt-5 grid gap-3 sm:grid-cols-3">{[["Recorded earnings", release.analytics?.revenue_total ? `₹${release.analytics.revenue_total.toLocaleString()}` : "—"], ["Streams", release.analytics?.streams_total?.toLocaleString()], ["Payout status", release.analytics?.revenue_total ? "See payout ledger" : "Not available"]].map(([label, value]) => <div key={label} className="metric-card p-4"><p className="text-xs uppercase tracking-[0.14em]" style={{ color: "var(--text-soft)" }}>{label}</p><p className="mt-2 font-semibold">{display(value)}</p></div>)}</div><p className="mt-5 text-sm" style={{ color: "var(--text-muted)" }}>Earnings usually take around 1.5 months to reflect after platform reporting and distributor processing.</p><Link href="/payout" className="btn-outline pressable mt-5">Open payout statements</Link></section> : null}
    {tab === "activity" ? <section className="surface-card"><h2 className="text-2xl font-semibold">Release activity</h2><div className="mt-6 grid gap-0">{[["Draft created", "Release workspace created.", release.createdAt], ["Release submitted", "Metadata, artwork, and audio submitted to HYMN.", release.submittedAt], ["HYMN review", release.reviewNote || "HYMN review activity recorded.", release.reviewedAt], ["Approved by HYMN", "Release approved for distribution.", release.approvedAt], ["Sent to distributor", "Release forwarded to the distribution partner.", release.distributedAt], ["Live status updated", "Platform availability confirmed.", release.liveAt]].filter((item) => item[2]).map(([event, description, timestamp]) => <div key={event} className="grid grid-cols-[18px,1fr] gap-3 border-l pb-6 pl-4 last:pb-0" style={{ borderColor: "var(--border)" }}><span className="-ml-[21px] mt-1 h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent)" }} /><div><p className="font-semibold">{event}</p><p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{description}</p><time className="mt-2 block text-xs" style={{ color: "var(--text-soft)" }}>{new Date(String(timestamp)).toLocaleString()}</time></div></div>)}</div></section> : null}
    {editWarningOpen ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="edit-release-title" onMouseDown={(event) => { if (event.currentTarget === event.target && !isEditing) setEditWarningOpen(false); }}><div className="w-full max-w-lg rounded-2xl border p-5 shadow-2xl sm:p-6" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}><div className="flex items-start gap-3"><span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}><AlertTriangle className="h-5 w-5" /></span><div><h2 id="edit-release-title" className="text-xl font-semibold">Edit this release?</h2><p className="mt-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>Editing this release will return it to Drafts and stop the review process. You&apos;ll need to re-submit and restart the review process.</p>{alreadyDistributed ? <p className="mt-3 text-sm leading-6" style={{ color: "var(--danger)" }}>This release may already be processing with distribution partners. Editing may require manual review before changes are accepted.</p> : null}{editError ? <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>{editError}</p> : null}</div></div><div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={isEditing} onClick={() => setEditWarningOpen(false)} className="btn-outline pressable justify-center">Cancel</button><button type="button" disabled={isEditing} onClick={proceedToEdit} className="pressable inline-flex min-h-11 items-center justify-center rounded-full px-5 py-2.5 font-semibold text-white disabled:opacity-60" style={{ background: "var(--danger)" }}>{isEditing ? "Returning to drafts…" : "Proceed"}</button></div></div></div> : null}
  </div>;
}

export function ReleasePortal({ releases, selectedReleaseId = null, initialPanel = null, initialTab = null }: { releases: Release[]; selectedReleaseId?: number | null; initialPanel?: string | null; initialTab?: string | null }) {
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
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const selectedRelease = useMemo(() => sortedReleases.find((release) => release.id === selectedReleaseId) ?? null, [selectedReleaseId, sortedReleases]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 180);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedSearch, statusFilter, artistFilter]);

  useEffect(() => {
    if (!selectedRelease) return;
    setSearch(selectedRelease.releaseTitle?.trim() || selectedRelease.trackName || selectedRelease.artistName);
  }, [selectedRelease]);

  const filteredReleases = useMemo(() => {
    return sortedReleases.filter((release) => {
      const stage = getReleasePortalStage(release);
      const query = debouncedSearch;
      const title = (release.releaseTitle?.trim() || release.trackName).toLowerCase();
      const artist = release.artistName.toLowerCase();
      const identifiers = [release.upcCode, ...(release.tracks ?? []).map((track) => track.isrc)].filter(Boolean).join(" ").toLowerCase();
      const matchesSearch = query.length === 0 || title.includes(query) || artist.includes(query) || identifiers.includes(query);
      const matchesStatus = statusFilter === "all" || stage === statusFilter;
      const matchesArtist = artistFilter === "all" || normalizeArtist(release.artistName) === artistFilter;
      return matchesSearch && matchesStatus && matchesArtist;
    });
  }, [artistFilter, debouncedSearch, sortedReleases, statusFilter]);

  const visibleReleases = filteredReleases.slice(0, visibleCount);
  const draftRelease = sortedReleases.find((release) => isReleaseUnfinished(release));
  const stats = {
    draft: sortedReleases.filter((release) => getReleasePortalStage(release) === "draft").length,
    scheduled: sortedReleases.filter((release) => getReleasePortalStage(release) === "scheduled").length,
    released: sortedReleases.filter((release) => getReleasePortalStage(release) === "released").length
  };
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
      <div className="grid gap-6">
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
    <div className="grid gap-6 xl:gap-8">
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

      <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b pb-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}><Link href="/distribution">Distribution</Link><span className="font-semibold" style={{ color: "var(--text)" }}>My releases</span><span title="Coming soon">Promotion</span><span title="Coming soon">Trends</span><span title="Coming soon">Earnings</span><span title="Coming soon">Fair Trade AI</span></nav>

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

        <div className="mt-6 hidden gap-4 lg:grid lg:grid-cols-[1fr,1fr] xl:grid-cols-[0.7fr,0.7fr,0.6fr]">
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
        ) : (
          <div className={viewMode === "grid" ? "grid grid-cols-1 justify-items-center gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid grid-cols-1 justify-items-center gap-4 sm:grid-cols-2"}>
            {visibleReleases.map((release) => (
              <ReleaseCard key={release.id} release={release} selected={release.id === selectedReleaseId} />
            ))}
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
