"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Crown, X, Zap } from "lucide-react";
import { CustomerOverlay } from "@/components/customer-overlay";
import { DistributionPricingStrip } from "@/components/distribution-pricing-strip";
import { useAccessibleDialog } from "@/components/ui/use-accessible-dialog";

export function openSubscriptions() {
  window.dispatchEvent(new Event("hymn-open-subscriptions"));
}

export function SubscriptionButton({ className }: { className?: string }) {
  return <button type="button" className={className} onClick={openSubscriptions} aria-haspopup="dialog"><Crown size={16} /> Subscriptions</button>;
}

/** One instance in the shared header serves every subscription entry point. */
export function SubscriptionOptions() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const dialogRef = useAccessibleDialog(open, close);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("hymn-open-subscriptions", show);
    return () => window.removeEventListener("hymn-open-subscriptions", show);
  }, []);

  return <CustomerOverlay open={open}>
    <div className="subscription-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="subscription-options-title" className="subscription-dialog">
        <header className="subscription-dialog-heading"><div><p>MAKE ROOM FOR YOUR MUSIC</p><h2 id="subscription-options-title">Subscriptions</h2></div><button type="button" onClick={close} aria-label="Close subscriptions"><X size={21} /></button></header>
        <div className="subscription-dialog-content">
          <section className="subscription-first-release"><div className="subscription-gift-icon"><Zap size={25} /></div><div><p>YOUR DEBUT, OUR GIFT</p><h3>Your first release on us.</h3><span>One Single. Base distribution covered by HYMN. No subscription needed.</span><small>For eligible first releases. Optional add-ons are charged separately.</small></div><Link href="/distribution/start?campaign=first-release" onClick={close}>Start free <ArrowRight size={18} /></Link></section>
          <div className="subscription-comparison-heading"><h3>Keep the music coming.</h3><p>Choose the subscription that fits your next chapter.</p></div>
          <div onClick={event => { if ((event.target as HTMLElement).closest("a[href]")) close(); }}><DistributionPricingStrip showPlanManagement /></div>
          <p className="subscription-dialog-note">Your selected subscription and payment details are confirmed at checkout.</p>
        </div>
      </section>
    </div>
  </CustomerOverlay>;
}
