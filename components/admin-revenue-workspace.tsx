"use client";
import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, CircleDollarSign, ShieldCheck } from "lucide-react";
import { monthlyRevenue, revenueChannels, summarizeRevenue, type RevenueEntry, type RevenueChannel } from "@/lib/revenue-report";
import { WorkspaceRecords } from "@/components/workspace-records";

const colors = ["#7687e8", "#41a98b", "#d49b44", "#b17bd4", "#4aa9c4", "#d57e91"];
const money = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
export function AdminRevenueWorkspace({ entries, onPayments, search = "" }: { entries: RevenueEntry[]; onPayments: () => void; search?: string }) {
  const [period, setPeriod] = useState("all");
  const [channel, setChannel] = useState<RevenueChannel | "all">("all");
  const [measure, setMeasure] = useState<"hymn" | "receipts">("hymn");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const rows = useMemo(() => {
    const cutoff = period === "all" || period === "custom" ? 0 : Date.now() - Number(period) * 86400000;
    const query = search.trim().toLowerCase();
    return entries.filter(row => (!query || `${row.customer} ${row.reference} ${row.channel} ${row.evidence}`.toLowerCase().includes(query)) && row.currency === "INR" && (channel === "all" || row.channel === channel) && Date.parse(row.date) >= cutoff && (period !== "custom" || ((!from || Date.parse(row.date) >= Date.parse(`${from}T00:00:00+05:30`)) && (!to || Date.parse(row.date) < Date.parse(`${to}T00:00:00+05:30`) + 86400000))));
  }, [entries, period, channel, from, to, search]);
  const summary = summarizeRevenue(rows); const months = monthlyRevenue(rows);
  const total = summary[measure]; const max = Math.max(1, ...months.map(row => row[measure]));
  const positiveTotal = summary.channels.reduce((sum, row) => sum + Math.max(0, row[measure]), 0);
  let progress = 0;
  const slices = summary.channels.map((row, index) => { const value = row[measure]; const start = progress; progress += positiveTotal > 0 ? Math.max(0, value) / positiveTotal * 100 : 0; return { ...row, color: colors[index], start, end: progress }; });
  const donut = positiveTotal > 0 ? `conic-gradient(${slices.map(row => `${row.color} ${row.start}% ${row.end}%`).join(",")})` : "var(--border)";
  return <div className="revenue-workspace">
    <header className="revenue-heading"><div><p className="workspace-kicker">Command Center</p><h2>HYMN Revenue</h2><p>Collections, platform share, and the records behind them.</p></div><button className="btn-outline" onClick={onPayments}>Checkout attempts <ArrowUpRight size={15}/></button></header>
    <div className="revenue-toolbar"><label>Period<select className="field" aria-label="Revenue period" value={period} onChange={e => setPeriod(e.target.value)}><option value="all">All recorded history</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option><option value="custom">Choose dates</option></select></label><label>Source<select className="field" aria-label="Revenue source" value={channel} onChange={e => setChannel(e.target.value as typeof channel)}><option value="all">All sources</option>{revenueChannels.map(name => <option key={name}>{name}</option>)}</select></label>{period === "custom" && <><label>From<input className="field" type="date" value={from} onChange={e => setFrom(e.target.value)}/></label><label>To<input className="field" type="date" min={from} value={to} onChange={e => setTo(e.target.value)}/></label></>}</div>
    <div className="revenue-metrics">{[
      { label: "HYMN earned", value: summary.hymn, detail: "Service revenue + recorded commissions", icon: CircleDollarSign },
      { label: "Gross collected", value: summary.receipts, detail: "Includes creator shares", icon: ArrowDownLeft },
      { label: "Manually paid", value: summary.merchantConfirmed, detail: "Included · merchant-confirmed receipts", icon: ShieldCheck },
      { label: "Share not allocated", value: summary.unallocated, detail: "Commission ledger pending", icon: ArrowUpRight }
    ].map(({label,value,detail,icon:Icon}, index) => <article key={label} className={`revenue-metric ${index === 0 ? "revenue-metric-primary" : ""}`}><span><Icon size={17}/>{label}</span><strong>{money(value)}</strong><small>{detail}</small></article>)}</div>
    <div className="revenue-chart-controls" role="group" aria-label="Chart measure"><button aria-pressed={measure === "hymn"} onClick={() => setMeasure("hymn")}>HYMN share</button><button aria-pressed={measure === "receipts"} onClick={() => setMeasure("receipts")}>Gross collections</button></div>
    <div className="revenue-charts"><section className="revenue-chart"><h3>Where it comes from</h3><div className="revenue-donut-layout"><div className="revenue-donut" role="img" aria-label={`${measure === "hymn" ? "HYMN share" : "Gross collections"} by source: ${slices.map(row => `${row.channel} ${money(row[measure])}`).join(", ")}`} style={{background:donut}}><div><small>{measure === "hymn" ? "HYMN share" : "Collected"}</small><strong>{money(total)}</strong></div></div><div className="revenue-legend">{slices.map(row => <button key={row.channel} onClick={() => setChannel(channel === row.channel ? "all" : row.channel)} aria-pressed={channel === row.channel}><i style={{background:row.color}}/><span>{row.channel}</span><strong>{money(row[measure])}</strong><small>{positiveTotal > 0 ? Math.round(Math.max(0,row[measure]) / positiveTotal * 100) : 0}%</small></button>)}</div></div></section>
      <section className="revenue-chart"><h3>By month <small>{measure === "hymn" ? "HYMN share" : "Gross collections"}</small></h3><div className="revenue-months">{months.length ? months.map(row => <div key={row.month} className="revenue-month"><span>{new Intl.DateTimeFormat("en-IN",{month:"short",year:"2-digit",timeZone:"Asia/Kolkata"}).format(new Date(`${row.month}-01T00:00:00+05:30`))}</span><div><i style={{width:`${Math.max(0,row[measure]) / max * 100}%`}}/></div><strong>{money(row[measure])}</strong></div>) : <p className="records-empty">No recorded revenue in this period.</p>}</div></section></div>
    <details className="revenue-explainer"><summary>What these numbers include</summary><p>HYMN earned is subscription and distribution service receipts plus persisted Beat Store, studio, royalty and completed-payout fees. Donut segments show positive source totals; signed adjustments remain in the ledger. It is before tax, gateway fees, refunds and operating costs; it is not profit or bank settlement. Manually paid receipts retain pending gateway verification. Unallocated shares are excluded from HYMN earned. Royalty fees use statement month; other entries use their recorded date.</p>{summarizeRevenue(entries).otherCurrencies.length > 0 && <p>Other currencies are excluded from INR charts: {summarizeRevenue(entries).otherCurrencies.join(", ")}.</p>}</details>
    <section className="revenue-chart"><h3>Revenue ledger <small>{rows.length} records</small></h3><WorkspaceRecords searchable={false} rows={rows} rowKey={row => row.id} noun="revenue records" searchText={row => `${row.customer} ${row.reference} ${row.channel} ${row.evidence}`} columns={[
      {key:"source",label:"Source / customer",primary:true,render:row=><><strong>{row.channel}</strong><small>{row.customer}</small></>},
      {key:"receipt",label:"Collected",value:row=>row.receipt,render:row=>row.receipt ? money(row.receipt) : "Ledger allocation"},
      {key:"hymn",label:"HYMN share",value:row=>row.hymn ?? -1,render:row=>row.hymn === null ? "Pending allocation" : money(row.hymn)},
      {key:"evidence",label:"Evidence / reference",render:row=><><span className="status-pill">{row.evidence === "merchant_confirmation" ? "Paid · manually confirmed" : row.evidence === "ledger" ? "Recorded commission" : "Gateway captured"}</span><small>{row.reference}</small></>},
      {key:"date",label:"Date",value:row=>Date.parse(row.date),render:row=>new Date(row.date).toLocaleDateString("en-IN",{timeZone:"Asia/Kolkata"})}
    ]}/></section>
  </div>;
}
