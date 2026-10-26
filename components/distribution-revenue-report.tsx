"use client";

import { useState } from "react";

type Preview = { isrc: string; rows: number; totals: Array<[string, number]> };
export function DistributionRevenueReport({ onImported }: { onImported: () => Promise<void> }) {
  const [isrc, setIsrc] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function lookup(importIntoLedger = false) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/direnote/revenue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isrc: importIntoLedger ? preview?.isrc : isrc, import: importIntoLedger }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Revenue lookup failed.");
      if (importIntoLedger) {
        setMessage(`Imported ${data.ingestion.imported} rows; ${data.ingestion.unmatched} need matching; ${data.ingestion.duplicatesIgnored} duplicate rows skipped.`);
        setPreview(null); await onImported();
      } else {
        const totals = new Map<string, number>(); let rows = 0;
        for (const month of data.report.revenue_by_month ?? []) for (const row of month.breakdown ?? []) {
          rows++; const currency = String(row.currency).toUpperCase();
          totals.set(currency, (totals.get(currency) ?? 0) + Number(row.revenue));
        }
        setPreview({ isrc: String(data.report.track.isrc), rows, totals: [...totals] });
        if (!rows) setMessage("HYMN has no reported earnings for this recording yet.");
      }
    } catch (error) { setPreview(null); setMessage(error instanceof Error ? error.message : "Revenue lookup failed."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-3xl border p-6" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
    <h2 className="text-xl font-semibold">HYMN distribution revenue</h2>
    <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Look up a recording by ISRC and review reported earnings before importing them into the royalty ledger.</p>
    <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); void lookup(); }}>
      <label className="grid gap-2 text-sm">Recording ISRC<input className="rounded-xl border bg-transparent p-3" value={isrc} maxLength={64} disabled={busy} onChange={event => { setIsrc(event.target.value); setPreview(null); setMessage(""); }} required placeholder="INHYM2600001" /></label>
      <button className="btn-outline" disabled={busy} type="submit">{busy ? "Loading…" : "Preview revenue"}</button>
    </form>
    {preview ? <div className="mt-4 text-sm"><p>{preview.isrc}: {preview.rows} report rows</p>{preview.totals.map(([currency, amount]) => <p key={currency}>{currency} {amount.toFixed(6)}</p>)}{preview.rows > 0 ? <button type="button" className="btn-primary mt-3" disabled={busy} onClick={() => void lookup(true)}>Import into royalty ledger</button> : null}</div> : null}
    {message ? <p className="mt-4 text-sm" role="status">{message}</p> : null}
  </section>;
}
