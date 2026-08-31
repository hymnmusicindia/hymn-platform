"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgePercent, CheckCircle2, Gift, Loader2, ShieldCheck, X } from "lucide-react";

type CheckoutItem =
  | { type: "beat"; beatId: number; licenseType: "general" | "exclusive" }
  | { type: "distribution"; plan: "one_time" | "half_yearly" | "yearly" | "yearly_plus"; trackCount: number; platforms: string[]; youtubeContentIdEnabled?: boolean };

type CheckoutQuote = {
  productId: string;
  lineItems: Array<{ productId: string; label: string; description: string; quantity: number; unitPrice: number; total: number }>;
  originalPrice: number;
  couponCode: string | null;
  couponDiscount: number;
  referralCreditsApplied: number;
  referralCreditBalance: number;
  referralBenefitApplied: number;
  finalAmount: number;
  messages: string[];
};

type RazorpayResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = {
  open: () => void;
  on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void;
};

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

function formatMoney(value: number) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function defaultItems(product?: string | null): CheckoutItem[] {
  if (product === "subscription-half_yearly") {
    return [{ type: "distribution", plan: "half_yearly", trackCount: 1, platforms: ["Spotify", "Apple Music"] }];
  }
  if (product === "subscription-yearly") {
    return [{ type: "distribution", plan: "yearly", trackCount: 1, platforms: ["Spotify", "Apple Music"] }];
  }
  if (product === "subscription-yearly_plus") {
    return [{ type: "distribution", plan: "yearly_plus", trackCount: 1, platforms: ["Spotify", "Apple Music"] }];
  }
  return [{ type: "distribution", plan: "one_time", trackCount: 1, platforms: ["Spotify", "Apple Music"] }];
}

function readBeatCart(): CheckoutItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("hymn-beat-cart");
    const items = raw ? JSON.parse(raw) as Array<{ beatId?: number; licenseType?: string }> : [];
    return items
      .filter((item): item is { beatId: number; licenseType: "general" | "exclusive" | "basic" } => Boolean(item.beatId) && (["general", "basic", "exclusive"] as string[]).includes(String(item.licenseType)))
      .map((item) => ({ type: "beat", beatId: item.beatId, licenseType: item.licenseType === "basic" ? "general" : item.licenseType }));
  } catch {
    return [];
  }
}

function loadRazorpayScript() {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("Browser checkout is unavailable."));
    if (window.Razorpay) return resolve();
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Razorpay could not be loaded.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay could not be loaded."));
    document.body.appendChild(script);
  });
}

export function CheckoutExperience({ product }: { product?: string | null }) {
  const [items, setItems] = useState<CheckoutItem[]>(() => defaultItems(product));
  const [couponInput, setCouponInput] = useState("");
  const [couponCode, setCouponCode] = useState<string | undefined>();
  const [useReferralCredits, setUseReferralCredits] = useState(false);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (product === "beatstore") {
      const cartItems = readBeatCart();
      setItems(cartItems.length ? cartItems : defaultItems(null));
    }
  }, [product]);

  const payload = useMemo(() => ({ items, couponCode, useReferralCredits }), [couponCode, items, useReferralCredits]);

  useEffect(() => {
    let active = true;
    async function refreshQuote() {
      setLoading(true);
      setFeedback(null);
      try {
        const response = await fetch("/api/checkout/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not calculate checkout.");
        if (active) setQuote(data.quote);
      } catch (error) {
        if (active) setFeedback(error instanceof Error ? error.message : "Could not calculate checkout.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void refreshQuote();
    return () => {
      active = false;
    };
  }, [payload]);

  function applyCoupon() {
    setCouponCode(couponInput.trim() || undefined);
  }

  function removeCoupon() {
    setCouponInput("");
    setCouponCode(undefined);
  }

  async function proceedToPay() {
    setPaying(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/checkout/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create order.");

      if (!data.requiresPayment) {
        setSuccess(true);
        setQuote(data.quote);
        if (data.reviewEligibility) window.dispatchEvent(new CustomEvent("hymn:purchase-review-eligible", { detail: data.reviewEligibility }));
        return;
      }

      await loadRazorpayScript();
      if (!window.Razorpay) throw new Error("Razorpay is unavailable.");

      const checkout = new window.Razorpay({
        key: data.key,
        amount: data.amount,
        currency: data.currency,
        name: "HYMN",
        description: "Secure HYMN checkout",
        order_id: data.orderId,
        handler: async (payment: RazorpayResponse) => {
          try {
            const verifyResponse = await fetch("/api/checkout/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payment)
            });
            const verifyData = await verifyResponse.json();
            if (!verifyResponse.ok) throw new Error(verifyData.error || "Payment verification failed.");
            setSuccess(true);
            if (verifyData.reviewEligibility) window.dispatchEvent(new CustomEvent("hymn:purchase-review-eligible", { detail: verifyData.reviewEligibility }));
            if (product === "beatstore") window.localStorage.removeItem("hymn-beat-cart");
          } catch (error) {
            setFeedback(error instanceof Error ? error.message : "Payment verification failed.");
          } finally {
            setPaying(false);
          }
        },
        modal: {
          ondismiss: () => setPaying(false)
        }
      });
      checkout.on("payment.failed", (response) => {
        setFeedback(response.error?.description || "Payment failed. Please try again.");
        setPaying(false);
      });
      checkout.open();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Checkout failed.");
      setPaying(false);
    }
  }

  return (
    <section className="shell py-10">
      <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
        <div className="surface-card p-6 sm:p-8">
          <h1 className="text-4xl font-semibold" style={{ color: "var(--text)" }}>Review before payment.</h1>
          <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
            Pricing, coupons, checkout credits, and the Razorpay order amount are recalculated on the backend before payment.
          </p>

          <div className="mt-6 grid gap-3">
            {quote?.lineItems.map((item) => (
              <article key={item.productId} className="rounded-[1.2rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>{item.label}</h2>
                    <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{item.description}</p>
                  </div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{formatMoney(item.total)}</p>
                </div>
              </article>
            ))}
            {loading ? <p className="text-sm" style={{ color: "var(--text-muted)" }}>Refreshing checkout...</p> : null}
          </div>

          <div className="mt-6 rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <div className="flex items-center gap-2">
              <BadgePercent className="h-4 w-4" style={{ color: "var(--text-soft)" }} />
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Coupon code</p>
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input className="field flex-1" value={couponInput} onChange={(event) => setCouponInput(event.target.value.toUpperCase())} placeholder="WELCOME100" />
              {couponCode ? (
                <button type="button" className="btn-outline pressable" onClick={removeCoupon}>
                  <X className="h-4 w-4" />
                  Remove
                </button>
              ) : (
                <button type="button" className="btn-primary pressable" onClick={applyCoupon}>Apply</button>
              )}
            </div>
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <input type="checkbox" className="mt-1" checked={useReferralCredits} onChange={(event) => setUseReferralCredits(event.target.checked)} />
            <span>
              <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}>
                <Gift className="h-4 w-4" />
                Apply HYMN checkout credits
              </span>
              <span className="mt-1 block text-sm" style={{ color: "var(--text-muted)" }}>
                Available balance: {formatMoney(quote?.referralCreditBalance ?? 0)}
              </span>
            </span>
          </label>
        </div>

        <aside className="surface-card self-start p-6 sm:p-8">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" style={{ color: "var(--text-soft)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Backend validated</h2>
          </div>

          <div className="mt-6 space-y-3 text-sm">
            {[
              ["Original price", quote?.originalPrice ?? 0],
              ["Coupon discount", -(quote?.couponDiscount ?? 0)],
              ["Checkout credits used", -(quote?.referralCreditsApplied ?? 0)]
            ].map(([label, value]) => (
              <div key={label as string} className="flex items-center justify-between gap-4">
                <span style={{ color: "var(--text-muted)" }}>{label}</span>
                <span className="font-semibold" style={{ color: "var(--text)" }}>{formatMoney(Number(value))}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t pt-5" style={{ borderColor: "var(--border)" }}>
            <p className="text-sm" style={{ color: "var(--text-soft)" }}>Final payable amount</p>
            <p className="mt-2 text-4xl font-semibold" style={{ color: "var(--text)" }}>{formatMoney(quote?.finalAmount ?? 0)}</p>
          </div>

          {quote?.messages.length ? (
            <div className="mt-5 grid gap-2">
              {quote.messages.map((message) => (
                <p key={message} className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
                  <CheckCircle2 className="h-4 w-4" style={{ color: "var(--money)" }} />
                  {message}
                </p>
              ))}
            </div>
          ) : null}

          {feedback ? <p className="mt-4 text-sm" style={{ color: "var(--danger)" }}>{feedback}</p> : null}
          {success ? (
            <div className="mt-5 rounded-[1.2rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
              <p className="font-semibold" style={{ color: "var(--text)" }}>Payment verified.</p>
              <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>Your order has been recorded and rewards were processed securely.</p>
              <Link href="/dashboard" className="btn-outline pressable mt-4 inline-flex">Open dashboard</Link>
            </div>
          ) : (
            <button type="button" className="btn-primary pressable mt-6 w-full" disabled={loading || paying || !quote} onClick={proceedToPay}>
              {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Proceed to Pay
            </button>
          )}
        </aside>
      </div>
    </section>
  );
}

// vercel trigger 2
