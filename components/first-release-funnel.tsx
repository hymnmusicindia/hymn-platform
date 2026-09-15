"use client";

import { ArrowRight, Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { FirstReleaseReceipt } from "@/components/first-release-receipt";

type Eligibility = { authenticated: boolean; eligible: boolean; reason: string; firstName?: string };
type Query = Record<string, string | undefined>;

function releaseState(eligibility: Eligibility) {
  if (!eligibility.authenticated) return { status: "UNCLAIMED", cta: "RELEASE MY TRACK — ₹0", event: "first_release_primary_cta_clicked" };
  if (eligibility.eligible) return { status: "READY TO CLAIM", cta: "CLAIM MY FREE RELEASE", event: "first_release_primary_cta_clicked" };
  if (eligibility.reason === "reserved") return { status: "IN PROGRESS", cta: "CONTINUE MY RELEASE", event: "first_release_resumed" };
  if (eligibility.reason === "release_already_submitted" || eligibility.reason === "already_redeemed") return { status: "CLAIMED", cta: "RELEASE ANOTHER TRACK — ₹99", event: "first_release_plan_cta_clicked" };
  return { status: "MEMBER", cta: "START NEW RELEASE", event: "first_release_primary_cta_clicked" };
}

export function FirstReleaseFunnel({ eligibility, query }: { eligibility: Eligibility; query: Query }) {
  const router = useRouter();
  const viewedRef = useRef(false);
  const attribution = useMemo(() => Object.fromEntries(Object.entries(query).filter(([, value]) => Boolean(value))), [query]);
  const track = useCallback((event: string) => fetch("/api/promotions/first-release", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event, attribution }) }).catch(() => undefined), [attribution]);
  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    void track("first_release_page_viewed");
  }, [track]);

  const startHref = useMemo(() => {
    const params = new URLSearchParams({ campaign: "first-release" });
    for (const [key, value] of Object.entries(attribution)) if (value) params.set(key, value);
    return `/distribution/start?${params}`;
  }, [attribution]);
  const state = releaseState(eligibility);
  const isUsed = state.status === "CLAIMED" || state.status === "MEMBER";
  const begin = () => {
    void track(state.event);
    router.push(isUsed ? "/distribution/start" : startHref);
  };
  const referralCode = query.referral_code || query.ref;

  return <main className="first-release-page">
    <section className="first-release-shell">
      <section className="first-release-hero-grid" aria-labelledby="first-release-title">
        <div className="first-release-copy">
          <p className="first-release-eyebrow">MUSIC DISTRIBUTION FOR INDEPENDENT ARTISTS</p>
          <h1 id="first-release-title">YOUR FIRST RELEASE<br />IS ON US.</h1>
          <div className="first-release-price" aria-label="Standard distribution price 99 rupees, today zero rupees">
            <del className="first-release-price-was">₹99</del>
            <span className="first-release-price-divider" aria-hidden="true" />
            <strong className="first-release-price-free"><em>FREE</em></strong>
          </div>
        </div>

        <aside className="first-release-pass" aria-label="HYMN First Release Pass">
          <div className="first-release-pass-head"><span>HYMN FIRST RELEASE PASS</span><b>01/01</b></div>
          <div className="first-release-pass-title">FIRST SINGLE</div>
          <FirstReleaseReceipt />
          <div className="first-release-product-status"><p>PRODUCT STATUS</p>{["Artwork", "Audio", "Metadata"].map(item => <span key={item}>{item}<Check aria-hidden="true" /></span>)}<em>Ready to begin your release</em></div>
          <div id="first-release-account" className="first-release-pass-account"><p>YOUR ACCOUNT</p>{eligibility.authenticated ? <button type="button" onClick={begin}>{state.cta}<ArrowRight aria-hidden="true" /></button> : <GoogleAuthButton label="Continue with Google" expectedRole="customer" referralCode={referralCode} appearance="quiet" onAuthenticated={() => { void track("first_release_auth_started"); void track("first_release_auth_completed"); router.push(startHref); router.refresh(); }} />}</div>
          <p className="first-release-pass-security">Secure sign-in · HYMN never receives your Google password</p>
          <div className="first-release-pass-foot">STATUS: <b>{state.status}</b></div>
        </aside>
      </section>

    </section>
  </main>;
}
