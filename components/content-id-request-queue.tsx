"use client";

import { useMemo, useState } from "react";
import { isValidYoutubeChannelUrl } from "@/lib/content-id-access";
import { artworkPreviewUrl } from "@/lib/artwork-preview";

type RequestRow = {
  id: number;
  status: "pending" | "approved" | "declined";
  reviewEligibility: { liveTrackCount: number; requiredTrackCount: number; ready: boolean };
  requestedAt: string;
  reviewedAt: string | null;
  channelUrl: string | null;
  feeAmount: number;
  reviewReason: string | null;
  user: { id: number; name: string; email: string };
  release: {
    id: number;
    title: string;
    artistName: string;
    artworkUrl: string | null;
    tracks: { id: number; title: string; trackNumber: number }[];
  };
  distributionOrder: {
    id: number;
    amount: number;
    creditsUsed: number;
    paymentStatus: string;
    razorpayPaymentId: string | null;
    createdAt: string;
  } | null;
  reviewedBy: { id: number; name: string; email: string } | null;
};

type Filter = "pending" | "all";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function safeYoutubeChannelUrl(value: string | null) {
  return isValidYoutubeChannelUrl(value) ? new URL(value).href : null;
}

export function ContentIdRequestQueue({ initialRequests }: { initialRequests: RequestRow[] }) {
  const [rows, setRows] = useState(initialRequests);
  const [filter, setFilter] = useState<Filter>("pending");
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [messages, setMessages] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const pendingCount = rows.filter((row) => row.status === "pending").length;
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => (filter === "all" || row.status === "pending")
      && (!query || [row.user.name, row.user.email, row.release.title, row.release.artistName].some((value) => value.toLowerCase().includes(query))));
  }, [filter, rows, search]);

  async function review(row: RequestRow, action: "approve" | "keep_pending" | "decline") {
    const reason = notes[row.id]?.trim() || "";
    if (action === "decline" && !reason) {
      setMessages((current) => ({ ...current, [row.id]: "Add a reason before declining this request." }));
      return;
    }
    setBusyId(row.id);
    setMessages((current) => ({ ...current, [row.id]: "Saving review…" }));
    try {
      const response = await fetch(`/api/admin/content-id/requests/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason || undefined })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not update this request.");
      if (action !== "keep_pending") {
        setRows((current) => current.map((item) => item.id === row.id ? { ...item, status: data.request.status, reviewedAt: data.request.reviewedAt, reviewReason: data.request.reviewReason } : item));
      }
      setMessages((current) => ({ ...current, [row.id]: action === "keep_pending" ? "Request remains pending. Your note was recorded." : `Request ${action === "approve" ? "approved" : "declined"}.` }));
    } catch (error) {
      setMessages((current) => ({ ...current, [row.id]: error instanceof Error ? error.message : "Could not update this request." }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="grid gap-1 text-sm font-medium">
          Search requests
          <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Artist, release, user, or email" />
        </label>
        <div className="flex items-end gap-2">
          <button type="button" className={filter === "pending" ? "btn-primary" : "btn-secondary"} onClick={() => setFilter("pending")}>Pending · {pendingCount}</button>
          <button type="button" className={filter === "all" ? "btn-primary" : "btn-secondary"} onClick={() => setFilter("all")}>All requests · {rows.length}</button>
        </div>
      </div>
      {visibleRows.length ? (
        <div className="grid gap-4">
          {visibleRows.map((row) => {
            const paymentConfirmed = row.distributionOrder?.paymentStatus === "paid";
            const reviewReady = row.reviewEligibility.ready;
            const channelLink = safeYoutubeChannelUrl(row.channelUrl);
            return (
              <article key={row.id} className="surface-card overflow-hidden">
                <div className="flex flex-col gap-5 lg:flex-row">
                  <div className="flex min-w-0 flex-1 gap-4">
                    <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
                      {row.release.artworkUrl ? <img src={artworkPreviewUrl(row.release.artworkUrl, 96)} alt={`${row.release.title} cover artwork`} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs" style={{ color: "var(--text-muted)" }}>No artwork</div>}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold">{row.release.title}</h2>
                        <span className="status-pill capitalize">{row.status.replace("_", " ")}</span>
                      </div>
                      <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{row.release.artistName} · {row.release.tracks.length} {row.release.tracks.length === 1 ? "track" : "tracks"}</p>
                      <p className="mt-3 font-medium">{row.user.name}</p>
                      <a className="text-sm underline" href={`mailto:${encodeURIComponent(row.user.email)}`}>{row.user.email}</a>
                      <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>Requested {formatDate(row.requestedAt)}</p>
                    </div>
                  </div>
                  <aside className="rounded-xl border p-4 text-sm lg:w-72" style={{ borderColor: "var(--border)", background: "var(--surface-muted)" }}>
                    <p className="font-semibold">Payment evidence</p>
                    <p className="mt-2">Request fee: {row.feeAmount === 0 ? "Waived" : `₹${row.feeAmount.toLocaleString("en-IN")}`}</p>
                    <p className={paymentConfirmed ? "font-medium" : ""} style={{ color: paymentConfirmed ? "var(--success)" : "var(--danger)" }}>{paymentConfirmed ? row.feeAmount === 0 ? "Yearly+ entitlement confirmed" : "Payment confirmed" : "Payment not confirmed"}</p>
                    <p className="mt-1">Charged in checkout: ₹{row.distributionOrder?.amount?.toLocaleString("en-IN") ?? 0}</p>
                    <p className="mt-1">Distribution order: {row.distributionOrder?.id ?? "Unavailable"}</p>
                    {row.distributionOrder?.razorpayPaymentId ? <p className="mt-1 break-all text-xs">Payment ref: {row.distributionOrder.razorpayPaymentId}</p> : null}
                    <p className="mt-2">Paid with credits: ₹{row.distributionOrder?.creditsUsed?.toLocaleString("en-IN") ?? 0}</p>
                    <p className="mt-2">Live HYMN tracks: {row.reviewEligibility.liveTrackCount}/{row.reviewEligibility.requiredTrackCount}</p>
                  </aside>
                </div>
                <div className="mt-5 grid gap-4 border-t pt-4 md:grid-cols-2" style={{ borderColor: "var(--border)" }}>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Tracks</p>
                    <ol className="mt-2 grid gap-1 text-sm">
                      {row.release.tracks.map((track) => <li key={track.id}>{track.trackNumber}. {track.title}</li>)}
                    </ol>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>YouTube channel</p>
                    {row.channelUrl ? channelLink
                      ? <a className="mt-2 inline-block break-all text-sm underline" href={channelLink} target="_blank" rel="noreferrer">{row.channelUrl}</a>
                      : <p className="mt-2 break-all text-sm">{row.channelUrl} <span style={{ color: "var(--danger)" }}>(not a valid YouTube HTTPS URL)</span></p>
                      : <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>No channel URL supplied</p>}
                    {row.reviewReason ? <p className="mt-2 text-sm">Previous review: {row.reviewReason}</p> : null}
                  </div>
                </div>
                {row.status === "pending" ? (
                  <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
                    <label className="grid gap-1 text-sm font-medium">
                      Review note <span className="font-normal" style={{ color: "var(--text-muted)" }}>Required to decline; optional for approval or keeping pending.</span>
                      <textarea className="input min-h-20" maxLength={2000} value={notes[row.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [row.id]: event.target.value }))} placeholder="Add context or the reason for your decision" />
                    </label>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="btn-primary pressable" disabled={busyId === row.id || !paymentConfirmed || !reviewReady} onClick={() => void review(row, "approve")}>Approve access</button>
                      <button type="button" className="btn-secondary pressable" disabled={busyId === row.id || !paymentConfirmed || !reviewReady} onClick={() => void review(row, "keep_pending")}>Keep pending</button>
                      <button type="button" className="btn-secondary pressable" disabled={busyId === row.id || !paymentConfirmed || !reviewReady} onClick={() => void review(row, "decline")}>Decline request</button>
                    </div>
                    {!paymentConfirmed ? <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>Review actions are disabled until the request payment or Yearly+ entitlement is confirmed.</p> : null}
                    {paymentConfirmed && !reviewReady ? <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Review has not started. Actions unlock after {row.reviewEligibility.requiredTrackCount} tracks are confirmed live through HYMN Music.</p> : null}
                    <p className="mt-2 text-sm" aria-live="polite">{messages[row.id]}</p>
                  </div>
                ) : (
                  <p className="mt-4 border-t pt-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                    {row.reviewedBy ? `Reviewed by ${row.reviewedBy.name}` : "Reviewed"}{row.reviewedAt ? ` · ${formatDate(row.reviewedAt)}` : ""}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      ) : <div className="surface-card p-8 text-center"><h2 className="text-lg font-semibold">No requests found</h2><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{filter === "pending" ? "There are no pending Content ID requests right now." : "Try another search."}</p></div>}
    </section>
  );
}
