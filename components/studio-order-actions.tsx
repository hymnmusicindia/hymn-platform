"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Amendment = { publicId: string; description: string; amount: number; status: string };

async function post(path: string, body: unknown) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function loadRazorpay() {
  return new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay could not be loaded."));
    document.body.appendChild(script);
  });
}

export function StudioOrderActions({ orderPublicId, status, customer, reviewed, amendments }: { orderPublicId: string; status: string; customer: boolean; reviewed: boolean; amendments: Amendment[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const act = async (work: () => Promise<unknown>) => { setBusy(true); setError(""); try { await work(); router.refresh(); } catch (value) { setError(value instanceof Error ? value.message : "Request failed."); } finally { setBusy(false); } };
  const payAmendment = async (item: Amendment) => {
    const payment = await post(`/api/studio/orders/${orderPublicId}/amendments/${item.publicId}/payment`, { idempotencyKey: crypto.randomUUID() });
    await loadRazorpay();
    if (!window.Razorpay) throw new Error("Razorpay is unavailable.");
    const checkout = new window.Razorpay({ key: payment.key, amount: payment.amount, currency: payment.currency, name: "HYMN Studio", description: `Scope amendment · ${item.description}`, order_id: payment.orderId, handler: async (result: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => { await post("/api/studio/payments/verify", result); router.refresh(); } });
    checkout.on("payment.failed", response => setError(response.error?.description || "Payment failed."));
    checkout.open();
  };
  const cancellable = customer && !["COMPLETED", "CANCELLED", "REFUNDED", "EXPIRED"].includes(status);
  const openAmendments = amendments.filter(item => item.status === "PROPOSED" || item.status === "AWAITING_PAYMENT");
  const canProposeAmendment = !customer && !["COMPLETED", "CANCELLED", "REFUNDED", "EXPIRED", "DISPUTED"].includes(status);
  if (!cancellable && !canProposeAmendment && !(customer && status === "COMPLETED" && !reviewed) && !(customer && openAmendments.length)) return null;

  return <section className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-5">
    <h2 className="font-semibold">Project actions</h2>
    {error ? <p className="mt-3 text-sm text-[var(--danger)]" role="alert">{error}</p> : null}
    {canProposeAmendment ? <form className="mt-4 space-y-3" onSubmit={event => { event.preventDefault(); void act(async () => { await post(`/api/studio/orders/${orderPublicId}/amendments`, { description, amount: Number(amount) }); setDescription(""); setAmount(""); }); }}>
      <p className="text-sm text-[var(--text-muted)]">Propose a paid change when the customer asks for work outside the agreed scope.</p>
      <textarea className="input w-full" required minLength={3} value={description} onChange={event => setDescription(event.target.value)} placeholder="Describe the scope change" />
      <input className="input w-full" required min={1} step="0.01" type="number" value={amount} onChange={event => setAmount(event.target.value)} placeholder="Amount in INR" />
      <button className="btn-outline w-full justify-center" disabled={busy}>Send amendment</button>
    </form> : null}
    {customer ? <div className="mt-4 space-y-3">{openAmendments.map(item => <div key={item.publicId} className="rounded-xl border border-[var(--border)] p-3 text-sm"><p>{item.description}</p><p className="mt-1 font-semibold">₹{item.amount.toLocaleString("en-IN")}</p><button className="btn-outline mt-3 w-full justify-center" disabled={busy} onClick={() => void act(() => payAmendment(item))}>Accept and pay</button></div>)}</div> : null}
    {customer && status === "COMPLETED" && !reviewed ? <form className="mt-4 space-y-3" onSubmit={event => { event.preventDefault(); void act(() => post(`/api/studio/orders/${orderPublicId}/review`, { rating, comment })); }}><label className="block text-sm">Rating<select className="input mt-1 w-full" value={rating} onChange={event => setRating(Number(event.target.value))}>{[5,4,3,2,1].map(value => <option key={value} value={value}>{value} stars</option>)}</select></label><textarea className="input w-full" value={comment} onChange={event => setComment(event.target.value)} placeholder="Share feedback (optional)"/><button className="btn-outline w-full justify-center" disabled={busy}>Publish review</button></form> : null}
    {cancellable ? <button className="mt-4 text-sm text-[var(--danger)] underline" disabled={busy} onClick={() => void act(() => post(`/api/studio/orders/${orderPublicId}/cancel`, { reason: "Cancelled by customer", idempotencyKey: crypto.randomUUID() }))}>Request cancellation</button> : null}
  </section>;
}
