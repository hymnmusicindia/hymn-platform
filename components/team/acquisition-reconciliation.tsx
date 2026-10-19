"use client";

import { FormEvent, useState } from "react";

type Api = <T>(resource: string, body?: unknown) => Promise<T>;
type Evidence = { id: string; sourceType: string; sourceId: string; paymentId: string; recognisedRevenueMinor: number; applicableTaxesMinor?: number | null; refundsChargebacksMinor?: number | null; directPassThroughCostsMinor?: number | null; providerFeeMinor?: number | null; currency: string; customer: { name: string; email: string }; status: string };

export function AcquisitionReconciliation({ items, api, refresh }: { items: Evidence[]; api: Api; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>, item: Evidence) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("acquisition-evidence-review", {
        id: item.id,
        applicableTaxesMinor: Number(form.get("taxes")),
        refundsChargebacksMinor: Number(form.get("refunds")),
        directPassThroughCostsMinor: Number(form.get("costs")),
        providerFeeMinor: Number(form.get("providerFee")),
        taxEvidence: String(form.get("taxEvidence") || "").split("\n").map(value => value.trim()).filter(Boolean),
        costEvidence: String(form.get("costEvidence") || "").split("\n").map(value => value.trim()).filter(Boolean),
        adjustmentReference: form.get("adjustmentReference"),
        reason: form.get("reason"),
      });
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reconcile this transaction."); }
    finally { setBusy(false); }
  }
  return <section><h2>Revenue reconciliation</h2><p>Only verified paid transactions appear here. Supply documented tax, refund, direct cost, and provider fee amounts. Missing source records keep the transaction out of commission accrual.</p>
    {items.map(item => <details key={item.id}><summary>{item.sourceType} #{item.sourceId} · {item.customer.name} · {item.currency} {(item.recognisedRevenueMinor / 100).toFixed(2)} · {item.status}</summary><p>Payment verification: {item.paymentId}</p>
      <form onSubmit={event => submit(event, item)}><label>Applicable taxes (minor units)<input name="taxes" type="number" min="0" step="1" required defaultValue={item.applicableTaxesMinor ?? 0} /></label><label>Refunds and chargebacks (minor units)<input name="refunds" type="number" min="0" step="1" required defaultValue={item.refundsChargebacksMinor ?? 0} /></label><label>Direct pass-through costs (minor units)<input name="costs" type="number" min="0" step="1" required defaultValue={item.directPassThroughCostsMinor ?? 0} /></label><label>Payment provider fee (minor units)<input name="providerFee" type="number" min="0" step="1" required defaultValue={item.providerFeeMinor ?? 0} /></label><label>Tax/invoice references, one per line<textarea name="taxEvidence" required /></label><label>Cost/refund/settlement references, one per line<textarea name="costEvidence" required /></label><label>Provider adjustment reference<input name="adjustmentReference" maxLength={200} /></label><label>Review reason<textarea name="reason" required minLength={8} /></label><button disabled={busy}>Reconcile or record adjustment</button></form>
    </details>)}{!items.length ? <p>No transactions await reconciliation.</p> : null}{error ? <p role="alert">{error}</p> : null}</section>;
}
