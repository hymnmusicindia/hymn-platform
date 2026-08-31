"use client";

import { Star, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

type EligiblePurchase = { purchaseType: "beat" | "service" | "subscription"; purchaseId: number; label: string };

export function PostPurchaseReviewPrompt() {
  const [purchase, setPurchase] = useState<EligiblePurchase | null>(null);
  const [rating, setRating] = useState(0);
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    const showEligible = (eligible: EligiblePurchase | null, respectSnooze = true) => {
      if (!active || !eligible) return;
      const snoozedUntil = Number(window.localStorage.getItem(`hymn-review-snooze:${eligible.purchaseType}:${eligible.purchaseId}`) || 0);
      if (!respectSnooze || snoozedUntil <= Date.now()) {
        setRating(0);
        setReviewId(null);
        setText("");
        setError("");
        setPurchase(eligible);
      }
    };
    const loadEligible = async () => {
      const response = await fetch("/api/reviews/eligible", { cache: "no-store" }).catch(() => null);
      if (!response?.ok) return;
      const data = await response.json();
      showEligible(data.eligible as EligiblePurchase | null);
    };
    const handlePurchaseCompleted = (event: Event) => showEligible((event as CustomEvent<EligiblePurchase>).detail, false);
    window.addEventListener("hymn:purchase-review-eligible", handlePurchaseCompleted);
    void loadEligible();
    return () => { active = false; window.removeEventListener("hymn:purchase-review-eligible", handlePurchaseCompleted); };
  }, []);

  function dismiss() {
    if (purchase && !reviewId) window.localStorage.setItem(`hymn-review-snooze:${purchase.purchaseType}:${purchase.purchaseId}`, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    setPurchase(null);
  }

  function chooseRating(value: number) {
    if (!purchase || isPending || reviewId) return;
    setRating(value);
    setError("");
    startTransition(async () => {
      const response = await fetch("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...purchase, rating: value }) });
      const data = await response.json();
      if (!response.ok) { setRating(0); setError(data.error || "Your rating could not be saved."); return; }
      setReviewId(data.review.id);
    });
  }

  function finish() {
    if (!reviewId || isPending) return;
    setError("");
    startTransition(async () => {
      const response = await fetch(`/api/reviews/${reviewId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Your review could not be saved."); return; }
      setPurchase(null);
    });
  }

  if (!purchase) return null;
  return (
    <div className="fixed inset-0 z-[180] flex items-end justify-center bg-black/35 px-3 pb-3 backdrop-blur-[2px] sm:justify-end sm:px-5 sm:pb-5" role="presentation">
      <section className="w-full max-w-md rounded-[1.75rem] border p-5 shadow-[0_28px_90px_rgba(0,0,0,.34)] sm:p-6" style={{ minHeight: "min(33dvh, 360px)", borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }} role="dialog" aria-modal="true" aria-labelledby="review-prompt-title">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--text-soft)" }}>Verified purchase</p><h2 id="review-prompt-title" className="mt-2 text-2xl font-semibold tracking-[-0.025em]">Review your experience</h2><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{purchase.label}</p></div>
          <button type="button" onClick={dismiss} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: "var(--border)" }} aria-label="Review later"><X className="h-4 w-4" /></button>
        </div>
        {!reviewId ? <div className="mt-7"><p className="text-sm font-medium">How would you rate it?</p><div className="mt-3 flex gap-2" role="radiogroup" aria-label="Rating">{[1,2,3,4,5].map(value => <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} star${value === 1 ? "" : "s"}`} disabled={isPending} onClick={() => chooseRating(value)} className="inline-flex h-12 w-12 items-center justify-center rounded-full border transition hover:-translate-y-0.5 disabled:opacity-50" style={{ borderColor: rating >= value ? "#e5a72f" : "var(--border)", background: rating >= value ? "color-mix(in srgb, #e5a72f 14%, var(--card))" : "var(--bg-soft)" }}><Star className="h-5 w-5" fill={rating >= value ? "#e5a72f" : "none"} color={rating >= value ? "#e5a72f" : "currentColor"} /></button>)}</div><p className="mt-4 text-xs" style={{ color: "var(--text-soft)" }}>{isPending ? "Saving your rating…" : "Your rating is tied to this purchase and can only be submitted once."}</p></div> : <div className="mt-6"><label className="text-sm font-medium" htmlFor="purchase-review-text">Tell us more <span style={{ color: "var(--text-soft)" }}>(optional)</span></label><textarea id="purchase-review-text" value={text} maxLength={1200} onChange={event => setText(event.target.value)} className="field mt-3 min-h-24 resize-y" placeholder="What worked well? What could we improve?" /><div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs" style={{ color: "var(--text-soft)" }}>{text.length}/1200</span><button type="button" onClick={finish} disabled={isPending} className="btn-primary pressable">{isPending ? "Saving…" : text.trim() ? "Submit review" : "Skip and finish"}</button></div></div>}
        {error ? <p className="mt-4 text-sm" style={{ color: "var(--danger)" }} role="alert">{error}</p> : null}
      </section>
    </div>
  );
}
