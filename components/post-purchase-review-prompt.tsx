"use client";
import { customerMessage } from "@/lib/customer-message";
import { Check, Star } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { CustomerDialog } from "./customer-dialog";
import { useAccessibleDialog } from "./ui/use-accessible-dialog";
import { CONFIRMATION_LEFT_EVENT, clearReviewConfirmationDeparture, recentlyLeftReviewConfirmation, recoverConfirmationDeparture, deferPurchaseReview } from "@/lib/purchase-review-timing";
import "./post-purchase-review-prompt.css";
type EligiblePurchase = { purchaseType: "beat" | "service" | "subscription"; purchaseId: number; label: string };
const ratingLabels = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
export function PostPurchaseReviewPrompt() {
  const [purchase, setPurchase] = useState<EligiblePurchase | null>(null);
  const [rating, setRating] = useState(0);
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const visible = useRef(false);
  function dismiss() {
    if (isPending) return;
    if (purchase && !reviewId) try { localStorage.setItem(`hymn-review-snooze:${purchase.purchaseType}:${purchase.purchaseId}`, String(Date.now() + 7 * 86400000)); } catch {}
    visible.current = false; setPurchase(null);
  }
  const dialog = useAccessibleDialog(Boolean(purchase), dismiss);
  useEffect(() => {
    let active = true;
    let pending: EligiblePurchase | null = null;
    let departed = recentlyLeftReviewConfirmation();
    const tryShow = () => {
      if (!active || !pending || visible.current) return;
      if (deferPurchaseReview(window.location.pathname, window.location.search)) return;
      if (document.querySelector('[data-release-review-confirmation]')) return;
      // Cart drawers stay mounted when closed. Only an active modal may defer feedback.
      if ([...document.querySelectorAll('[role="dialog"][aria-modal="true"]:not([data-purchase-review])')].some(dialog => !dialog.closest('[aria-hidden="true"],[hidden],[inert]'))) return;
      if (pending.purchaseType !== "beat" && !departed && !recentlyLeftReviewConfirmation()) return;
      let snoozedUntil = 0;
      try { snoozedUntil = Number(localStorage.getItem(`hymn-review-snooze:${pending.purchaseType}:${pending.purchaseId}`) || 0); } catch {}
      if (snoozedUntil > Date.now()) { pending = null; return; }
      const eligible = pending; pending = null; visible.current = true;
      setRating(0); setReviewId(null); setText(""); setError(""); setPurchase(eligible);
    };
    const loadEligible = async () => {
      try {
        const response = await fetch("/api/reviews/eligible", { cache:"no-store" });
        if (!response.ok || !active) return;
        const data = await response.json();
        if (active && data.eligible) { pending = data.eligible; tryShow(); }
      } catch {}
    };
    const handlePurchase = (event: Event) => {
      pending = (event as CustomEvent<EligiblePurchase>).detail;
      if (pending && pending.purchaseType !== "beat") { departed = false; clearReviewConfirmationDeparture(); }
      tryShow();
    };
    const handleLeft = () => { departed = true; if (pending) tryShow(); else void loadEligible(); };
    window.addEventListener("hymn:purchase-review-eligible", handlePurchase);
    window.addEventListener(CONFIRMATION_LEFT_EVENT, handleLeft);
    recoverConfirmationDeparture();
    const observer = new MutationObserver(tryShow);
    observer.observe(document.body, { childList:true, subtree:true });
    void loadEligible();
    return () => { active = false; observer.disconnect(); window.removeEventListener("hymn:purchase-review-eligible", handlePurchase); window.removeEventListener(CONFIRMATION_LEFT_EVENT, handleLeft); };
  }, []);
  function saveRating() {
    if (!purchase || !rating || isPending || reviewId) return;
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/reviews", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ purchaseType:purchase.purchaseType, purchaseId:purchase.purchaseId, rating }) });
        const data = await response.json();
        if (!response.ok) { setError(data.error || "Your rating could not be saved."); return; }
        setReviewId(data.review.id);
      } catch { setError("We couldn’t save your rating. Please try again."); }
    });
  }
  function finish() {
    if (!reviewId || isPending) return;
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch(`/api/reviews/${reviewId}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({body:text}) });
        const data = await response.json();
        if (!response.ok) { setError(data.error || "Your review could not be saved."); return; }
        visible.current = false; setPurchase(null);
      } catch { setError("We couldn’t save your feedback. Please try again."); }
    });
  }
  if (!purchase) return null;
  const title = purchase.purchaseType === "beat" ? "How was finding your next sound?" : "How was submitting your release?";
  return <CustomerDialog open compact purchaseReview dialogRef={dialog} titleId="review-prompt-title" title={reviewId ? "Thanks for sharing your voice." : title} eyebrow={reviewId ? "Step 2 of 2 / Optional feedback" : "Step 1 of 2 / Your experience"} description={reviewId ? "What worked well? What could we make easier?" : "Your honest feedback helps improve the next artist's journey."} onClose={dismiss} closeLabel="Review later" busy={isPending} footer={<>
    <button type="button" className="btn-outline" onClick={dismiss} disabled={isPending}>{reviewId ? "Finish without a comment" : "Maybe later"}</button>
    <button type="button" className="btn-primary" onClick={reviewId ? finish : saveRating} disabled={isPending || (!reviewId && !rating)}>{isPending ? "Saving..." : reviewId ? "Send feedback" : "Continue"}</button>
  </>}>
    {!reviewId ? <fieldset className="purchase-review-rating" disabled={isPending}><legend>How did it feel?</legend><div>{[1,2,3,4,5].map(value => <label key={value} className={rating >= value ? "is-selected" : ""}><input type="radio" name="purchase-rating" value={value} checked={rating === value} onChange={() => setRating(value)} aria-label={`${value} star${value===1?"":"s"} \u2014 ${ratingLabels[value]}`}/><Star size={25} aria-hidden="true" fill={rating >= value ? "currentColor" : "none"}/></label>)}</div><p aria-live="polite">{rating ? `${rating} / 5 - ${ratingLabels[rating]}` : "Choose the rating that reflects your experience"}</p></fieldset> : <div className="purchase-review-comments"><span className="purchase-review-saved"><Check size={14}/> {rating}/5 rating saved</span><label htmlFor="purchase-review-text">A few words <span>(optional)</span></label><textarea id="purchase-review-text" value={text} disabled={isPending} maxLength={1200} onChange={event => setText(event.target.value)} placeholder="Tell us about your experience..." /><span className="purchase-review-count">{text.length}/1200</span></div>}
    <small className="purchase-review-note">{reviewId ? "Reviews may appear publicly after moderation. Please leave out private details." : "Every rating helps us improve. Your rating is saved on Continue."}</small>
    {error ? <p className="purchase-review-error" role="alert">{customerMessage(error)}</p> : null}
  </CustomerDialog>;
}
