"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Disc3, Gift, MoreHorizontal, Pencil, Settings, Trash2, X } from "lucide-react";
import type { Release } from "@/lib/types";
import {
  getReleasePortalBadgeStyle,
  getReleasePortalDateLabel,
  getReleasePortalStage,
  getReleasePortalStageLabel,
  getReleasePortalTrackCount
} from "@/lib/release-portal";

export function ReleaseSummaryCard({
  release,
  href,
  actionLabel = "Manage",
  selected = false
}: {
  release: Release;
  href: string;
  actionLabel?: string;
  selected?: boolean;
}) {
  const title = release.releaseTitle?.trim() || release.trackName || "Untitled release";
  const stage = getReleasePortalStage(release);
  const trackCount = getReleasePortalTrackCount(release);
  const needsCorrection = release.status === "changes_requested";
  const primaryActionLabel = release.status === "draft" ? "Edit" : needsCorrection ? "Fix release" : actionLabel;
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState<"duplicate" | "delete" | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const canDelete = release.status === "draft";
  const releaseMetadata = release.metadata && typeof release.metadata === "object" ? release.metadata as Record<string, unknown> : {};
  const isFreeReleaseDraft = release.status === "draft" && releaseMetadata.promotionCode === "FIRST_RELEASE_FREE";

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [menuOpen]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function duplicateRelease() {
    setMenuOpen(false); setBusy("duplicate");
    try {
      const response = await fetch(`/api/releases/${release.id}/duplicate`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice({ text: data.error || "Something went wrong. Please try again.", error: true }); setBusy(null); return; }
      setNotice({ text: "Release duplicated successfully." });
      router.push(`/distribution/start?edit=${data.releaseId}`);
      router.refresh();
    } catch {
      setNotice({ text: "Could not reach the server. Please try again.", error: true });
      setBusy(null);
    }
  }

  async function deleteRelease() {
    setBusy("delete");
    const response = await fetch(`/api/releases/${release.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setNotice({ text: data.error || "Something went wrong. Please try again.", error: true }); setBusy(null); setDeleteOpen(false); return; }
    setDeleteOpen(false); setNotice({ text: "Draft deleted successfully." }); router.refresh();
  }

  return (
    <article
      className="release-summary-tile group flex h-full w-full max-w-[282px] flex-col rounded-[9px] border p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg"
      style={{
        borderColor: selected ? "var(--accent)" : "var(--border)",
        background: "var(--card)",
        boxShadow: selected ? "0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent)" : undefined
      }}
    >
      <div className="relative aspect-square w-full rounded-[6px] bg-[var(--bg-soft)]">
        <div className="h-full w-full overflow-hidden rounded-[6px]">
        {release.artworkUrl ? (
          <img
            src={release.artworkUrl}
            alt={`${title} artwork`}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.015]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center" style={{ color: "var(--text-soft)" }}>
            <Disc3 className="h-10 w-10" aria-hidden="true" />
          </div>
        )}
        </div>
        <div ref={menuRef} className="absolute right-2.5 top-2.5 z-20">
          <button type="button" onClick={() => setMenuOpen((value) => !value)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label={`Actions for ${title}`} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-md backdrop-blur-md transition hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80">
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          </button>
          {menuOpen ? <div role="menu" className="absolute right-0 top-11 z-30 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#171a20]/95 p-1.5 text-sm text-white shadow-2xl backdrop-blur-xl">
            <button role="menuitem" type="button" disabled={busy !== null} onClick={duplicateRelease} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition hover:bg-white/10 disabled:opacity-50"><Copy className="h-4 w-4" />{busy === "duplicate" ? "Duplicating…" : "Duplicate release"}</button>
            <button role="menuitem" type="button" aria-disabled={!canDelete} onClick={() => { setMenuOpen(false); canDelete ? setDeleteOpen(true) : setNotice({ text: "This release cannot be deleted after submission.", error: true }); }} className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition ${canDelete ? "text-red-400 hover:bg-red-500/10" : "cursor-not-allowed text-white/35"}`} title={canDelete ? undefined : "Only drafts can be deleted."}><Trash2 className="h-4 w-4" />Delete release</button>
          </div> : null}
        </div>
      </div>

      {isFreeReleaseDraft ? <div className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.09em] text-emerald-600 dark:text-emerald-400"><Gift className="h-3 w-3" />One-time free release</div> : null}

      <div className="mt-3 flex min-w-0 items-center justify-between gap-3">
        <span
          className="inline-flex max-w-[62%] truncate rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
          style={getReleasePortalBadgeStyle(stage)}
        >
          {getReleasePortalStageLabel(stage)}
        </span>
        <span className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
          {getReleasePortalDateLabel(release)}
        </span>
      </div>

      <h3 className="mt-3 truncate text-[17px] font-semibold leading-tight" style={{ color: "var(--text)" }}>
        {title}
      </h3>
      <p className="mt-1 truncate text-sm" style={{ color: "var(--text-muted)" }}>
        <span className="capitalize">{release.releaseType}</span> · {trackCount} Track{trackCount === 1 ? "" : "s"} · {release.artistName || "Unknown artist"}
      </p>

      <div className="mt-4">
        <Link
          href={href}
          className="pressable inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold"
          style={{ borderColor: "var(--border)", background: "var(--text)", color: "var(--bg)" }}
          aria-label={`${primaryActionLabel} ${title}`}
        >
          {release.status === "draft" || needsCorrection ? <Pencil className="h-4 w-4" aria-hidden="true" /> : <Settings className="h-4 w-4" aria-hidden="true" />}
          {primaryActionLabel}
        </Link>
      </div>
      {deleteOpen && typeof document !== "undefined" ? createPortal(<div role="dialog" aria-modal="true" aria-labelledby={`delete-title-${release.id}`} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onKeyDown={(event) => { if (event.key === "Escape" && !busy) setDeleteOpen(false); }}>
        <div className="w-full max-w-md rounded-2xl border p-5 shadow-2xl sm:p-6" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="flex items-start justify-between gap-4"><div><h2 id={`delete-title-${release.id}`} className="text-xl font-semibold">Delete this draft?</h2><p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>This draft release will be permanently removed. This action cannot be undone.</p></div><button type="button" onClick={() => setDeleteOpen(false)} disabled={busy !== null} aria-label="Close dialog" className="rounded-full p-1.5 hover:bg-white/10"><X className="h-5 w-5" /></button></div>
          <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setDeleteOpen(false)} disabled={busy !== null} className="btn-outline pressable">Cancel</button><button type="button" onClick={deleteRelease} disabled={busy !== null} className="pressable rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60">{busy === "delete" ? "Deleting…" : "Delete"}</button></div>
        </div>
      </div>, document.body) : null}
      {notice && typeof document !== "undefined" ? createPortal(<div role="status" className={`fixed bottom-5 right-5 z-[110] max-w-sm rounded-xl border px-4 py-3 text-sm font-medium text-white shadow-xl ${notice.error ? "border-red-400/30 bg-red-950/95" : "border-emerald-400/30 bg-emerald-950/95"}`}>{notice.text}</div>, document.body) : null}
    </article>
  );
}
// vercel trigger 5
// vercel trigger 7

// vercel trigger 12
