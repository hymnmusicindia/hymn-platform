"use client";

import { FormEvent, useState, useTransition } from "react";
import type { User } from "@/lib/types";

type Benefits = { checkoutCredit: number; subscription: null | { plan: string; planName: string | null; expiryDate: string; status: string } };

function dateAfter(days: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysUntil(value: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selected = new Date(`${value}T00:00:00`);
  return Math.max(0, Math.round((selected.getTime() - today.getTime()) / 86_400_000));
}

export function AdminUserBenefits({ user, onCreditChange }: { user: User; onCreditChange: (balance: number) => void }) {
  const [open, setOpen] = useState(false);
  const [benefits, setBenefits] = useState<Benefits>({ checkoutCredit: user.referralCredits || 0, subscription: null });
  const [plan, setPlan] = useState("half_yearly");
  const [expiryDate, setExpiryDate] = useState(() => dateAfter(180));
  const [credit, setCredit] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();

  async function openManager() {
    setOpen((value) => !value);
    if (open) return;
    const response = await fetch(`/api/admin/users/${user.id}/benefits`, { cache: "no-store" });
    if (response.ok) setBenefits((await response.json()).benefits);
  }
  function grant(event: FormEvent<HTMLFormElement>, kind: "subscription" | "checkout_credit") {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setFeedback("");
    startTransition(async () => {
      const payload = kind === "subscription" ? { kind, plan, durationDays: daysUntil(expiryDate), note: data.get("note") } : { kind, amount: Number(credit), note: data.get("note") };
      const response = await fetch(`/api/admin/users/${user.id}/benefits`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) return setFeedback(result.error || "Could not update benefits.");
      setFeedback(result.message);
      if (result.benefits.checkoutCredit !== undefined) { setBenefits((current) => ({ ...current, checkoutCredit: result.benefits.checkoutCredit })); onCreditChange(result.benefits.checkoutCredit); setCredit(""); }
      if (result.benefits.subscription) setBenefits((current) => ({ ...current, subscription: result.benefits.subscription }));
    });
  }

  return <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--border)" }}>
    <button type="button" onClick={openManager} className="text-sm font-semibold" style={{ color: "var(--accent)" }}>{open ? "Close benefits" : "Manage plan and checkout wallet"}</button>
    {open ? <div className="mt-4 grid gap-5 lg:grid-cols-2">
      <form onSubmit={(event) => grant(event, "subscription")} className="grid gap-3">
        <div><p className="font-semibold">Subscription access</p><p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{benefits.subscription ? `${benefits.subscription.planName || benefits.subscription.plan} · expires ${new Date(benefits.subscription.expiryDate).toLocaleDateString("en-IN")}` : "No subscription currently recorded"}</p></div>
        <div className="grid gap-3 sm:grid-cols-2"><select className="field" value={plan} onChange={(event) => { const next = event.target.value; setPlan(next); setExpiryDate(dateAfter(next === "half_yearly" ? 180 : 365)); }}><option value="half_yearly">Half-Yearly</option><option value="yearly">Yearly</option><option value="yearly_plus">Yearly+</option></select><label className="grid gap-1"><span className="text-xs" style={{ color: "var(--text-muted)" }}>Access until</span><input className="field" type="date" min={dateAfter(1)} max={dateAfter(1095)} value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} required aria-label="Subscription expiry date" /></label></div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>{daysUntil(expiryDate).toLocaleString("en-IN")} days of access · expires {new Date(`${expiryDate}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
        <input name="note" className="field" required minLength={3} placeholder="Reason for granting access" />
        <button disabled={pending} className="btn-primary">Grant subscription</button>
      </form>
      <form onSubmit={(event) => grant(event, "checkout_credit")} className="grid gap-3">
        <div><p className="font-semibold">Checkout wallet</p><p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Available discount credit: Rs {benefits.checkoutCredit.toLocaleString("en-IN")}</p></div>
        <input className="field" type="number" min="1" max="1000000" step="1" value={credit} onChange={(event) => setCredit(event.target.value)} required placeholder="Amount in INR" />
        <input name="note" className="field" required minLength={3} placeholder="Reason for adding credit" />
        <button disabled={pending} className="btn-primary">Add checkout credit</button>
      </form>
      {feedback ? <p className="text-sm lg:col-span-2" style={{ color: "var(--text-muted)" }}>{feedback}</p> : null}
    </div> : null}
  </div>;
}
