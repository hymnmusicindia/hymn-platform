"use client";

import { useEffect, useRef, useState } from "react";
import { CustomerOverlay } from "@/components/customer-overlay";
import { useAccessibleDialog } from "@/components/ui/use-accessible-dialog";
import { PlaylistFeedbackPrompt, PlaylistTestimonials } from "./playlist-service-feedback";
import { useDriftingRail } from "./ui/use-drifting-rail";
import { ArrowUpRight, AudioLines, Check, Clock3, Headphones, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import { loadBioRazorpay } from "@/lib/client-razorpay";
import { REVIEW_TERMS_VERSION, REVIEW_NOT_A_FIT_COPY, reviewFeeMinor } from "@/lib/playlist-review-domain";
import "./playlist-review-marketplace.css";
import "./playlist-banner-compact.css";

type Listing = { id: number; name: string; playlistUrl: string; description: string; genres: string; feeMinor: number; isHymn: boolean; capacity: number; status: string; moderationNote?: string | null; curator?: { name: string; email: string } | null };
type Review = { id: number; listing: Listing; trackTitle: string; artistName: string; trackUrl: string; pitch: string; amountMinor: number; status: string; dueAt?: string; reviewedAt?: string; remark?: string; nextStep?: string; payoutStatus: string };
type CatalogueTrack = { id: number; title: string; primaryArtist: string | null; isrc: string | null; release: { id: number; title: string; artistName: string; artworkUrl: string | null } };
type Snapshot = { releasedTracks?: CatalogueTrack[]; listings: Listing[]; requests: Review[]; ownListings: Listing[]; inbox: Review[]; checkoutAvailable: boolean };
const money = (minor: number) => `₹${(minor / 100).toLocaleString("en-IN")}`;
const hymnCovers: Record<string, string> = { "Dusk Till Dawn": "1", "Indie Hits": "2", "Ungatekept Gems": "4", "Fresh Releases": "3" };
const statusLabel: Record<string, string> = { AWAITING_PAYMENT: "Payment not completed", IN_REVIEW: "Listening & reviewing", SHORTLISTED: "Caught the curator’s attention", NOT_A_FIT: "Not a fit for this playlist", REFUND_PENDING: "Refund in progress", REFUNDED: "Fee refunded", DISPUTED: "HYMN is reviewing your concern" };

export function PlaylistReviewMarketplace({ admin = false }: { admin?: boolean }) {
  const [open, setOpen] = useState(false);
  const carousel = useRef<HTMLDivElement>(null);
  const secondCarousel = useRef<HTMLDivElement>(null);
  const [motionPaused, setMotionPaused] = useState(false);
  useDriftingRail(secondCarousel, 16, admin || open || motionPaused);
  const dialogRef = useAccessibleDialog(open, () => setOpen(false));
  useEffect(() => {
    if (admin || open || motionPaused) return;
    const rail = carousel.current; if (!rail) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0; let previous = 0; let direction = 1; let paused = false; let position = rail.scrollLeft;
    const pause = () => { paused = true; }; const resume = () => { position = rail.scrollLeft; paused = false; };
    const tick = (now: number) => {
      const elapsed = previous ? Math.min(now - previous, 50) : 0; previous = now;
      if (!paused && !motion.matches && !document.hidden && !rail.contains(document.activeElement)) {
        const max = rail.scrollWidth - rail.clientWidth;
        if (rail.scrollLeft >= max - 1) direction = -1;
        if (rail.scrollLeft <= 1) direction = 1;
        position = Math.max(0, Math.min(max, position + direction * elapsed * .025));
        rail.scrollLeft = position;
      }
      frame = requestAnimationFrame(tick);
    };
    rail.addEventListener('pointerenter', pause); rail.addEventListener('pointerleave', resume);
    rail.addEventListener('touchstart', pause, { passive: true }); rail.addEventListener('touchend', resume);
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); rail.removeEventListener('pointerenter', pause); rail.removeEventListener('pointerleave', resume); rail.removeEventListener('touchstart', pause); rail.removeEventListener('touchend', resume); };
  }, [admin, open, motionPaused]);
  useEffect(() => {
    if (["curator", "submissions"].includes(new URLSearchParams(window.location.search).get("reviewView") || "")) setOpen(true);
  }, []);
  if (admin) return <PlaylistReviewWorkspace admin />;
  const covers = [{ name: "Dusk Till Dawn", image: "1" }, { name: "Indie Hits", image: "2" }, { name: "Ungatekept Gems", image: "4" }, { name: "Fresh Releases", image: "3" }];
  return <>
    <section className="playlist-invitation" aria-labelledby="playlist-invitation-title">
      <div className="playlist-invitation-main"><div className="playlist-invitation-copy"><Headphones size={30} strokeWidth={1.5} /><h2 id="playlist-invitation-title">Your sound.<br />A new discovery.</h2><p>Discover playlists that fit your music.<br />Get heard. Take your next step.</p><button type="button" className="playlist-invitation-cta" onClick={() => setOpen(true)} aria-haspopup="dialog">Explore playlists <ArrowUpRight size={18} /></button><small>Reviews from ₹50 for HYMN releases<br />₹80 for external tracks · No paid placement</small></div>
      <div className="playlist-invitation-gallery"><div className="playlist-cover-wall">{[0, 1].map(row => <div className="playlist-invitation-covers" key={row} ref={row === 0 ? carousel : secondCarousel} aria-label={row === 0 ? "Explore HYMN playlists" : "More HYMN playlists"}>{[...covers.slice(row * 2), ...covers.slice(0, row * 2)].map(cover => <button type="button" key={cover.image} onClick={() => setOpen(true)} aria-label={`Explore ${cover.name}`}><img src={`/assets/playlist-images/previews/${cover.image}.webp`} width={112} height={112} loading="lazy" decoding="async" alt={`${cover.name} playlist cover`} /><span>{cover.name}</span></button>)}</div>)}</div><div className="playlist-carousel-controls"><span>Curated for your next chapter</span><button type="button" onClick={() => setMotionPaused(value => !value)} aria-pressed={motionPaused}>{motionPaused ? "Play motion" : "Pause motion"}</button></div><PlaylistTestimonials paused={motionPaused || open} /></div></div>
      <div className="playlist-invitation-benefits" aria-label="What your review includes">{[[Headphones, "A real listen", "Your recording, heard by a curator."], [AudioLines, "Useful feedback", "Specific notes. A practical next step."], [Clock3, "Seven-day window", "No review on time? Your fee is refunded."]].map(([Icon, title, text]) => { const Symbol = Icon as typeof Headphones; return <div key={String(title)}><Symbol size={20} /><span><strong>{String(title)}</strong><small>{String(text)}</small></span></div>; })}</div>
    </section>
    <CustomerOverlay open={open}><div className="playlist-dialog-backdrop" onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}><section ref={dialogRef} className="playlist-review-dialog" role="dialog" aria-modal="true" aria-labelledby="playlist-dialog-title" tabIndex={-1}><header className="playlist-dialog-heading"><div><h2 id="playlist-dialog-title">Find your next curator</h2><p>Choose a playlist. Send your song. Get feedback.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Close playlist workspace"><X size={22} /></button></header><div className="playlist-dialog-content"><PlaylistReviewWorkspace /></div></section></div></CustomerOverlay>
  </>;
}

function PlaylistReviewWorkspace({ admin = false }: { admin?: boolean }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState("discover"); const [query, setQuery] = useState(""); const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Listing | null>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [requestKey, setRequestKey] = useState("");
  const [trackSource, setTrackSource] = useState<"hymn" | "external">("hymn");
  const [catalogueId, setCatalogueId] = useState("");
  const catalogueTrack = data?.releasedTracks?.find(track => String(track.id) === catalogueId);
  const reviewPrice = selected ? reviewFeeMinor(selected.isHymn, selected.feeMinor, trackSource === "hymn") : 0;
  function changeSource(source: "hymn" | "external") { setTrackSource(source); setRequestKey(crypto.randomUUID()); }
  const endpoint = admin ? "/api/admin/playlist-reviews" : "/api/playlist-reviews";
  useEffect(() => { const view = new URLSearchParams(window.location.search).get("reviewView"); if (view === "curator" || view === "submissions") setTab(view); }, []);
  async function refresh() {
    const response = await fetch(endpoint); const value = await response.json();
    if (!response.ok) throw new Error(value.error || "Could not load the review workspace."); setData(value);
  }
  useEffect(() => { let active = true; fetch(endpoint).then(async response => { const value = await response.json(); if (!response.ok) throw new Error(value.error); if (active) setData(value); }).catch(error => { if (active) setMessage(error.message || "Could not load playlists."); }); return () => { active = false; }; }, [endpoint]);
  useEffect(() => {
    if (!selected) return;
    setTrackSource("hymn"); setCatalogueId("");
    const form = document.getElementById("playlist-submission-form");
    form?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    form?.querySelector<HTMLButtonElement>(".playlist-track-card, .playlist-external-toggle")?.focus({ preventScroll: true });
  }, [selected]);
  async function action(body: Record<string, unknown>) {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const value = await response.json(); if (!response.ok) throw new Error(value.error || "Please try again."); return value;
  }
  async function submitReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || busy) return;
    const form = new FormData(event.currentTarget); setBusy(true); setMessage("");
    try {
      await loadBioRazorpay();
      const checkout = await action({ action: "checkout", listingId: selected.id, requestKey, ...(trackSource === "hymn" ? { trackId: Number(catalogueId) } : {}), trackTitle: form.get("trackTitle"), artistName: form.get("artistName"), trackUrl: form.get("trackUrl"), pitch: form.get("pitch"), accepted: form.get("accepted") === "on", termsVersion: REVIEW_TERMS_VERSION });
      const gateway = new window.Razorpay!({ key: checkout.keyId, amount: checkout.amount, currency: "INR", order_id: checkout.orderId, name: "HYMN", description: "Curator listening & feedback · no guaranteed placement", handler: async (payment: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        try { await action({ action: "verify", orderId: payment.razorpay_order_id, paymentId: payment.razorpay_payment_id, signature: payment.razorpay_signature }); setSelected(null); setTab("submissions"); setMessage("Your music is in the review queue. Feedback is due within seven days of payment."); await refresh(); }
        catch (error) { setMessage(`${error instanceof Error ? error.message : "Verification is pending."} If charged, do not pay again: we’ll reconcile the payment automatically.`); }
        finally { setBusy(false); }
      }, modal: { ondismiss: () => { setBusy(false); setMessage("Checkout closed. If you were charged, check My submissions before trying again."); void refresh(); } } });
      gateway.open();
    } catch (error) { setBusy(false); setMessage(error instanceof Error ? error.message : "Checkout unavailable."); }
  }
  async function formAction(event: React.FormEvent<HTMLFormElement>, kind: "apply" | "decide" | "moderate" | "dispute" | "resolve" | "settle" | "pricing", id?: number) {
    event.preventDefault(); if (busy) return; const form = event.currentTarget; const values = Object.fromEntries(new FormData(form)); setBusy(true); setMessage("");
    try {
      await action({ ...values, action: kind, id, feeRupees: Number(values.feeRupees), capacity: Number(values.capacity), ownershipConfirmed: values.ownershipConfirmed === "on", termsVersion: REVIEW_TERMS_VERSION });
      form.reset(); await refresh(); setMessage(kind === "apply" ? "Application received. HYMN will verify your playlist ownership and review the listing before it opens." : kind === "decide" ? "Feedback delivered. Thank you for giving this artist a thoughtful next step." : "Update saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); } finally { setBusy(false); }
  }
  const listings = (data?.listings || []).filter(row => (filter === "all" || (filter === "hymn" ? row.isHymn : !row.isHymn)) && `${row.name} ${row.genres} ${row.description}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="playlist-marketplace">
    <header className="playlist-marketplace-hero"><div><span className="playlist-eyebrow"><AudioLines size={14} /> A thoughtful next listen</span><h2>Your sound.<br /><span>Meet your next curator.</span></h2><p>Real ears. Useful feedback. Independent decisions.<br />Start with a ₹50 HYMN review, or discover an independent curator.</p><div className="playlist-trust"><span><Headphones size={14} /> Listening + written feedback</span><span><Clock3 size={14} /> Seven-day response window</span></div></div><aside><span className="playlist-orbit"><Headphones size={42} /></span><strong>Feedback, not a promise.</strong><p>No bought playlist slots. No guaranteed streams. Just a fair chance to be heard.</p></aside></header>
    <nav className="playlist-marketplace-nav" aria-label="Playlist review workspace">{[["discover", "Discover playlists"], ["submissions", "My submissions"], ["curator", admin ? "Curator operations" : "Curator studio"]].map(([key, label]) => <button type="button" key={key} aria-current={tab === key ? "page" : undefined} onClick={() => { setTab(key); setSelected(null); }}>{label}{key === "submissions" && data?.requests.length ? <span>{data.requests.length}</span> : null}</button>)}<a href="/playlist-review-terms" target="_blank" rel="noreferrer">How it works & terms <ArrowUpRight size={14} /></a></nav>
    {message ? <div className="playlist-message" role="status">{message}<button type="button" aria-label="Dismiss message" onClick={() => setMessage("")}><X size={15} /></button></div> : null}
    {!admin && tab === "submissions" ? data?.requests.filter(row => row.reviewedAt && ["SHORTLISTED", "NOT_A_FIT"].includes(row.status)).map(row => <PlaylistFeedbackPrompt key={row.id} reviewId={row.id} trackTitle={row.trackTitle} />) : null}
    {!data ? <div className="playlist-empty">{message ? <><p>The marketplace couldn’t load.</p><button className="btn-outline" onClick={() => { void refresh().catch(error => setMessage(error.message)); }}>Try again</button></> : "Loading your review workspace…"}</div> : null}
    {data && tab === "discover" ? <>
      <p className="playlist-source-note">HYMN reviews: ₹50 for your released HYMN catalogue tracks · ₹80 for external tracks. Independent curators set their own fees.</p>
      <div className="playlist-toolbar"><label><Search size={17} /><input aria-label="Search playlists" placeholder="Find a playlist or genre…" value={query} onChange={event => setQuery(event.target.value)} /></label><div>{[["all", "All curators"], ["hymn", "HYMN"], ["independent", "Independent"]].map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div></div>
      <div className="playlist-catalogue">{listings.map((listing, index) => <article className="playlist-listing" key={listing.id}><div className="playlist-art" data-tone={index % 4}>{listing.isHymn && hymnCovers[listing.name] ? <img src={`/assets/playlist-images/previews/${hymnCovers[listing.name]}.webp`} alt={`${listing.name} playlist cover`} width={480} height={480} loading="lazy" decoding="async" /> : <AudioLines size={68} strokeWidth={1} />}<span>{listing.isHymn ? "HYMN SELECTS" : "INDEPENDENT CURATOR"}</span><a href={listing.playlistUrl} target="_blank" rel="noreferrer" aria-label={`Listen to ${listing.name}`}><ArrowUpRight size={18} /></a></div><div className="playlist-listing-body"><span className="playlist-owner"><ShieldCheck size={13} />{listing.isHymn ? "HYMN curator" : "Ownership reviewed · independent"}</span><h3>{listing.name}</h3><p>{listing.description}</p><span className="playlist-genre">{listing.genres}</span><footer><div><strong>{money(listing.feeMinor)}</strong><small>per track review</small></div><button type="button" disabled={busy || !data.checkoutAvailable || admin} aria-expanded={selected?.id === listing.id} aria-controls="playlist-submission-form" onClick={() => { setSelected(listing); setRequestKey(crypto.randomUUID()); }}>Send a track <ArrowUpRight size={16} /></button></footer></div></article>)}</div>
      {!listings.length ? <div className="playlist-empty">No playlists match yet. Try another search or curator filter.</div> : null}
      {selected ? <form id="playlist-submission-form" className="playlist-form" onSubmit={submitReview}>
        <header><div><span className="playlist-eyebrow">Your next chapter</span><h3>Send your track to {selected.name}</h3><p>Listening and written feedback within seven days of payment. No recurring charge or paid placement.</p></div><button type="button" aria-label="Close submission form" onClick={() => !busy && setSelected(null)}><X /></button></header>
        <fieldset className="playlist-source" disabled={busy}><legend>Choose your track</legend>
          <div className="playlist-catalogue-heading"><div><span className="playlist-eyebrow">Your distribution catalogue</span><h4>Choose a released song</h4><p>Select a recording. We’ll bring its title and artist with it.</p></div><span className="playlist-catalogue-rate">{money(reviewFeeMinor(selected.isHymn, selected.feeMinor, true))}<small>per review</small></span></div>
          <div className="playlist-track-grid" role="group" aria-label="Your released HYMN tracks">{(data?.releasedTracks || []).map(track => {
            const active = trackSource === "hymn" && catalogueId === String(track.id);
            return <button key={track.id} type="button" className="playlist-track-card" aria-pressed={active} aria-label={`Select ${track.title} by ${track.primaryArtist || track.release.artistName}`} onClick={() => { setTrackSource("hymn"); setCatalogueId(String(track.id)); setRequestKey(crypto.randomUUID()); }}><div className="playlist-track-art">{track.release.artworkUrl ? <img src={track.release.artworkUrl} alt={`${track.release.title} cover`} loading="lazy" decoding="async" onError={event => { event.currentTarget.style.display = "none"; }} /> : null}<AudioLines size={34} aria-hidden="true" /><span className="playlist-track-selected" aria-hidden="true">{active ? <Check size={16} /> : <span />}</span></div><div className="playlist-track-copy"><span className="playlist-track-live"><span />Released on HYMN</span><strong>{track.title}</strong><span>{track.primaryArtist || track.release.artistName}</span><small>{active ? "Selected for review" : track.release.title}</small></div></button>;
          })}</div>
          {!data?.releasedTracks?.length ? <div className="playlist-catalogue-empty"><AudioLines size={28} /><strong>Your released music will appear here</strong><p>No live HYMN tracks yet. You can submit an external recording below.</p></div> : null}
          <div className="playlist-external-section"><button type="button" className="playlist-external-toggle" aria-expanded={trackSource === "external"} aria-controls="playlist-external-details" onClick={() => changeSource(trackSource === "external" ? "hymn" : "external")}><span><strong>Not distributed via HYMN?</strong><small>Submit a track from another distributor</small></span><span>{money(reviewFeeMinor(selected.isHymn, selected.feeMinor, false))} <ArrowUpRight size={16} /></span></button>{trackSource === "external" ? <p id="playlist-external-details" className="playlist-source-note">You’re welcome here too. Enter your song details and Spotify link below. {selected.isHymn ? "External-track reviews cost ₹80." : "This independent curator’s own fee applies."}</p> : null}</div>
        </fieldset>
        <div className="playlist-form-grid" key={`${trackSource}:${catalogueId}`}><label>Track title<input name="trackTitle" required maxLength={200} readOnly={trackSource === "hymn"} defaultValue={trackSource === "hymn" ? catalogueTrack?.title || "" : ""} /></label><label>Artist name<input name="artistName" required maxLength={120} readOnly={trackSource === "hymn"} defaultValue={trackSource === "hymn" ? catalogueTrack?.primaryArtist || catalogueTrack?.release.artistName || "" : ""} /></label><label className="playlist-full">Spotify track link<input type="url" name="trackUrl" required placeholder="https://open.spotify.com/track/…" /><small>Use the link to this exact recording so the curator can listen.</small></label><label className="playlist-full">Introduce your song<textarea name="pitch" required minLength={20} maxLength={1500} placeholder="What should the curator listen for? Tell them about the sound, mood, and intended audience." /></label></div>
        <label className="playlist-check"><input name="accepted" type="checkbox" required />I control this music and accept the <a href="/playlist-review-terms" target="_blank" rel="noreferrer">review terms</a>. I understand I’m paying for feedback, not placement or streams; a timely review is chargeable even if my song isn’t selected.</label>
        <div className="playlist-source-total" aria-live="polite"><span>{trackSource === "hymn" ? "HYMN catalogue review" : "External-track review"}<small>One track · one review · no recurring charge</small></span><strong>{money(reviewPrice)}</strong></div>
        <button className="playlist-primary" disabled={busy || (trackSource === "hymn" && !catalogueTrack)}>{busy ? "Opening secure checkout…" : `Continue to payment · ${money(reviewPrice)}`}</button>
      </form> : null}
      <p className="playlist-disclaimer"><ShieldCheck size={16} />Research each playlist before submitting. Independent curators make their own editorial decisions. HYMN offers reporting and dispute support, but does not guarantee their audience, placement, streams, or results.</p>
    </> : null}
    {data && tab === "submissions" ? <div className="playlist-review-list"><header><h3>Every listen is a step forward.</h3><p>Track your reviews, read the feedback, and decide what comes next.</p></header>{!data.requests.length ? <div className="playlist-empty"><Sparkles /><h3>Your first thoughtful listen starts here.</h3><p>Explore a playlist and introduce your song. You stay in control of where you pitch.</p><button type="button" className="playlist-primary" onClick={() => setTab("discover")}>Discover playlists</button></div> : null}{data.requests.map(row => <article className="playlist-review-card" key={row.id}><header><div><span className="playlist-eyebrow">{row.listing.name} · {money(row.amountMinor)}</span><h3>{row.trackTitle}</h3><p>{row.artistName}</p></div><span className="playlist-status" data-status={row.status}>{statusLabel[row.status] || row.status}</span></header>{row.status === "IN_REVIEW" && row.dueAt ? <p><Clock3 size={14} /> Feedback due {new Date(row.dueAt).toLocaleString("en-IN")}</p> : null}{row.status === "NOT_A_FIT" ? <p className="playlist-encouragement">{REVIEW_NOT_A_FIT_COPY}</p> : null}{row.remark ? <div className="playlist-feedback"><h4>From your curator</h4><p>{row.remark}</p><h4>Your next step</h4><p>{row.nextStep}</p></div> : null}{["IN_REVIEW", "NOT_A_FIT", "SHORTLISTED"].includes(row.status) ? <details className="playlist-dispute"><summary>Need help with this review?</summary><form onSubmit={event => formAction(event, "dispute", row.id)}><label>Tell HYMN what happened<textarea name="reason" required minLength={20} maxLength={1500} /></label><button className="btn-outline" disabled={busy}>Ask HYMN to review</button></form></details> : null}</article>)}</div> : null}
    {data && tab === "curator" ? <div className="playlist-review-list"><header><h3>{admin ? "Curator approval & review desk" : "Make every response useful."}</h3><p>Listen before deciding. Describe the fit—not the artist’s worth. Leave one specific observation and one practical next step.</p></header>
      {data.ownListings.map(listing => <article className="playlist-review-card" key={listing.id}><header><div><h3>{listing.name}</h3><a href={listing.playlistUrl} target="_blank" rel="noreferrer">Open playlist ↗</a><p>{money(listing.feeMinor)} / review · {listing.capacity} queue capacity</p></div><span className="playlist-status">{listing.status}</span></header>{admin && listing.curator ? <p>Applied by {listing.curator.name} · {listing.curator.email}</p> : null}{listing.moderationNote ? <p>{listing.moderationNote}</p> : null}{admin ? <form className="playlist-form-grid" onSubmit={event => formAction(event, "moderate", listing.id)}><label>Decision<select name="status"><option value="APPROVED">Approve ownership & listing</option><option value="PAUSED">Pause new submissions</option><option value="DECLINED">Decline application</option></select></label><label>Verification / moderation note<input name="note" required minLength={20} maxLength={2000} placeholder="Record how ownership was verified." /></label><button className="playlist-primary" disabled={busy}>Save moderation</button></form> : null}{!admin ? <form className="playlist-form-grid" onSubmit={event => formAction(event, "pricing", listing.id)}><label>Review fee (₹)<input name="feeRupees" type="number" min={10} max={10000} step={1} defaultValue={listing.feeMinor / 100} required /></label><label>Active-review capacity<input name="capacity" type="number" min={1} max={100} defaultValue={listing.capacity} required /></label><button className="btn-outline" disabled={busy}>Update future review pricing</button><small>Existing checkouts keep their original fee. <a href="/payout">Manage payout verification ↗</a></small></form> : null}</article>)}
      {data.inbox.map(row => <article className="playlist-review-card" key={row.id}><header><div><span className="playlist-eyebrow">{row.listing.name} · {money(row.amountMinor)}</span><h3>{row.trackTitle}</h3><p>{row.artistName} · {statusLabel[row.status]}</p></div><a href={row.trackUrl} target="_blank" rel="noreferrer" className="playlist-primary">Listen <Headphones size={15} /></a></header><p>{row.pitch}</p>{row.dueAt ? <p>Review deadline: {new Date(row.dueAt).toLocaleString("en-IN")}</p> : null}{row.status === "IN_REVIEW" ? <form className="playlist-form-grid" onSubmit={event => formAction(event, "decide", row.id)}><label className="playlist-full">Editorial decision<select name="status"><option value="NOT_A_FIT">Not a fit for this playlist</option><option value="SHORTLISTED">Shortlist for editorial consideration</option></select></label><label className="playlist-full">Your listening notes<textarea name="remark" required minLength={30} maxLength={2000} placeholder="Mention something you heard, then explain how it fits—or differs from—this playlist’s audience. Avoid generic or personal judgments." /></label><label className="playlist-full">One practical next step<textarea name="nextStep" required minLength={10} maxLength={600} placeholder="Suggest a more suitable genre, audience, production adjustment, or pitching approach." /></label><button className="playlist-primary" disabled={busy}>Deliver thoughtful feedback <Check size={16} /></button></form> : <div className="playlist-feedback"><p>{row.remark || row.status}</p>{row.nextStep ? <p>{row.nextStep}</p> : null}<small>Settlement: {row.payoutStatus.replace(/_/g, " ").toLowerCase()}</small></div>}{admin && row.status === "DISPUTED" ? <form className="playlist-form-grid" onSubmit={event => formAction(event, "resolve", row.id)}><label>Resolution<select name="resolution"><option value="REFUND">Refund the fee</option><option value="UPHOLD">Uphold delivered review</option></select></label><label>Artist-facing explanation<input name="note" required minLength={20} maxLength={2000} /></label><button className="playlist-primary" disabled={busy}>Resolve concern</button></form> : null}{admin && row.payoutStatus === "HELD" ? <form className="playlist-form-grid" onSubmit={event => formAction(event, "settle", row.id)}><label className="playlist-full">Actual bank/provider settlement reference<input name="reference" required minLength={8} maxLength={200} placeholder="Only after verified transfer and the seven-day dispute hold." /></label><button className="btn-outline" disabled={busy}>Record completed settlement</button></form> : null}</article>)}
      {!admin ? <form className="playlist-form" onSubmit={event => formAction(event, "apply")}><h3>Bring your playlist. Share your ears.</h3><p>Apply as an independent curator. HYMN checks ownership before the listing opens. You set your review fee; editorial selection must never be sold.</p><div className="playlist-form-grid"><label>Playlist name<input name="name" required minLength={3} maxLength={90} /></label><label>Spotify playlist link<input name="playlistUrl" type="url" required /></label><label>Genres / audience<input name="genres" required minLength={3} maxLength={160} /></label><label>Review fee (₹)<input name="feeRupees" type="number" min={10} max={10000} step={1} defaultValue={50} required /></label><label>Maximum active reviews<input name="capacity" type="number" min={1} max={100} defaultValue={20} required /></label><label className="playlist-full">What are you looking for?<textarea name="description" required minLength={30} maxLength={800} /></label></div><label className="playlist-check"><input name="ownershipConfirmed" type="checkbox" required />I own or control this playlist, will personally listen and respond within seven days, prohibit artificial streams, and accept the <a href="/playlist-review-terms" target="_blank" rel="noreferrer">curator terms</a>.</label><button className="playlist-primary" disabled={busy}>Apply to curate <ArrowUpRight size={16} /></button></form> : null}
    </div> : null}
  </div>;
}
