"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Crown, Gift, Minus, X, Zap } from "lucide-react";
import { CustomerOverlay } from "@/components/customer-overlay";
import { planPerks } from "@/components/distribution-pricing-strip";
import { distributionPlanCards } from "@/lib/distribution-plans";
import { useAccessibleDialog } from "@/components/ui/use-accessible-dialog";

const subscriptions = distributionPlanCards.filter(plan => plan.key !== "one_time");
const sharedBenefits = planPerks.half_yearly.filter(feature => feature.included &&
  subscriptions.every(plan => planPerks[plan.key].some(item => item.label === feature.label && item.included)));
type OfferState = "loading" | "gift" | "reserved" | "one-time" | "unverified";

export function openSubscriptions() {
  window.dispatchEvent(new Event("hymn-open-subscriptions"));
}

export function SubscriptionButton({ className }: { className?: string }) {
  return <button type="button" className={className} onClick={openSubscriptions} aria-haspopup="dialog"><Crown size={16} /> Subscriptions</button>;
}

/** The shared header owns this dialog; eligibility refreshes every time it opens. */
export function SubscriptionOptions() {
  const [open, setOpen] = useState(false);
  const [offer, setOffer] = useState<OfferState>("loading");
  const close = () => setOpen(false);
  const dialogRef = useAccessibleDialog(open, close);
  useEffect(() => {
    const show = () => { setOffer("loading"); setOpen(true); };
    window.addEventListener("hymn-open-subscriptions", show);
    return () => window.removeEventListener("hymn-open-subscriptions", show);
  }, []);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setOffer("loading");
    fetch("/api/promotions/first-release", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Eligibility unavailable");
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (data.eligible === true || (data.authenticated === false && data.reason === "authentication_required")) setOffer("gift");
        else if (data.reason === "reserved") setOffer("reserved");
        else if (data.authenticated === true && data.eligible === false) setOffer("one-time");
        else setOffer("unverified");
      })
      .catch(() => { if (!controller.signal.aborted) setOffer("unverified"); });
    return () => controller.abort();
  }, [open]);

  const gift = offer === "gift" || offer === "reserved";
  const bannerTitle = offer === "loading" ? "Finding your release options…"
    : offer === "gift" ? "Your first release on us."
    : offer === "reserved" ? "Your first release is in progress."
    : "Not ready for a subscription?";
  const bannerHref = offer === "gift" ? "/distribution/start?campaign=first-release"
    : offer === "reserved" ? "/dashboard/releases" : "/distribution/start";

  return <CustomerOverlay open={open}>
    <div className="subscription-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="subscription-options-title" className="subscription-dialog">
        <header className="subscription-dialog-heading">
          <div><p>MAKE ROOM FOR YOUR MUSIC</p><h2 id="subscription-options-title">Subscriptions</h2></div>
          <button type="button" onClick={close} aria-label="Close subscriptions"><X size={21} /></button>
        </header>
        <div className="subscription-dialog-content">
          <section className="subscription-first-release" data-offer={offer} aria-busy={offer === "loading"}>
            <div className={`subscription-offer-icon ${gift ? "is-gift" : "is-lightning"}`} aria-hidden="true">
              {gift ? <Gift size={28} /> : <Zap size={27} />}
            </div>
            <div className="subscription-offer-copy" aria-live="polite">
              <h3>{bannerTitle}</h3>
              <p>{offer === "loading" ? "Your subscription options are ready below."
                : offer === "gift" ? "One Single. Base distribution covered. No subscription needed."
                : offer === "reserved" ? "Pick up your existing release from your dashboard."
                : "Release your next single with a one-time payment."}</p>
              <small>{offer === "gift" ? "For eligible first releases. Optional add-ons cost extra."
                : offer === "unverified" ? "Free-release eligibility will be checked when you start."
                : offer === "one-time" ? "No subscription required. Optional add-ons cost extra." : null}</small>
            </div>
            {offer !== "loading" ? <Link className="subscription-offer-action" href={bannerHref} onClick={close}>
              {offer === "gift" ? "Start free" : offer === "reserved" ? "Continue release" : "Choose one-time release"}<ArrowRight size={17} />
            </Link> : null}
          </section>
          <div className="subscription-comparison-heading"><h3>More music. One subscription.</h3><p>Compare the full price and artist capacity.</p></div>
          <div className="subscription-shared-benefits"><span>Every subscription includes</span><ul>{sharedBenefits.map(feature => <li key={feature.label}><Check size={13} />{feature.label}</li>)}</ul></div>
          <div className="subscription-comparison-grid">
            {subscriptions.map(plan => <article key={plan.key} className="distribution-plan-card subscription-comparison-card" data-featured={plan.featured}>
              <header><span>{plan.key === "half_yearly" ? "FLEXIBLE START" : plan.key === "yearly" ? "MOST POPULAR" : "FOR LABELS & TEAMS"}</span><h3>{plan.title}</h3><p>{plan.key === "half_yearly" ? "Build your release rhythm." : plan.key === "yearly" ? "Plan a full year of music." : "Grow a multi-artist catalogue."}</p></header>
              <div className="subscription-price"><strong>₹{plan.price.toLocaleString("en-IN")}</strong><span> / {plan.cadence}</span><small>Total subscription price</small></div>
              <Link href={`/checkout?product=subscription-${plan.key}`} onClick={close} className="subscription-plan-action">{plan.cta}<ArrowRight size={16} /></Link>
              <dl><div><dt>Artist profiles</dt><dd>{plan.artistLimit}</dd></div><div><dt>Support</dt><dd>{plan.key === "half_yearly" ? "Standard" : plan.key === "yearly" ? "Faster response" : "24/7 priority"}</dd></div><div><dt>Custom label name</dt><dd>{plan.label_editable ? "Included" : "Not included"}</dd></div></dl>
              {plan.key === "yearly" ? <p className="subscription-value-note">Save ₹{(distributionPlanCards[1].price * 2 - plan.price).toLocaleString("en-IN")} vs two 6-month subscriptions</p> : <p className="subscription-value-note">{plan.key === "half_yearly" ? "A shorter commitment" : "Your label. Your artists."}</p>}
            </article>)}
          </div>
          <details className="subscription-full-comparison"><summary>Compare all features <ChevronDown size={16} /></summary><div>{subscriptions.map(plan => <section key={plan.key}><h4>{plan.title}</h4><ul>{planPerks[plan.key].map(feature => <li key={feature.label} data-included={feature.included}>{feature.included ? <Check size={14} /> : <Minus size={14} />}<span>{feature.label}{!feature.included ? " — not included" : ""}</span></li>)}</ul></section>)}</div></details>
          <p className="subscription-dialog-note">Your selection and payment details are confirmed at checkout.</p>
        </div>
      </section>
    </div>
  </CustomerOverlay>;
}
