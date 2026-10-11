"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowDownLeft, GitBranch, RefreshCw } from "lucide-react";
import { WorkspaceRecords } from "@/components/workspace-records";
type SettlementData = {
  latestRun: { status: string; createdAt: string; error: string | null } | null;
  summary: { grossMinor: number; feeMinor: number; taxMinor: number; bankMinor: number; exceptions: number; outflows: { type: string; debitMinor: number }[] };
  settlements: { id: string; utr: string | null; amountMinor: number; status: string; createdAt: string; ledgerMinor: number; differenceMinor: number; reconciliation: string }[];
  entries: { key: string; entityId: string; type: string; paymentId: string | null; settlementId: string | null; currency: string; amountMinor: number; creditMinor: number; debitMinor: number; source: string; match: string; onHold: boolean; settled: boolean }[];
};
type RouteData = {
  enabled: boolean; limit: number;
  accounts: { userId: number; accountId: string; status: string; user: { name: string | null; email: string } }[];
  sources: { key: string; label: string; userId: number | null; name: string; amountMinor: number }[];
  transfers: { id: number; sourceKey: string; paymentId: string; transferId: string | null; amountMinor: number; status: string; error: string | null; settlementId: string | null; user: { name: string | null; email: string } }[];
};
const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);
export function GatewayFinanceWorkspace() {
  const [view, setView] = useState<"settlements" | "route" | null>(null);
  const [month, setMonth] = useState(new Date(Date.now() + 19800000).toISOString().slice(0, 7));
  const [settlements, setSettlements] = useState<SettlementData | null>(null);
  const [route, setRoute] = useState<RouteData | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [userId, setUserId] = useState(""); const [accountId, setAccountId] = useState(""); const [productId, setProductId] = useState("");
  const [confirm, setConfirm] = useState<{ id: number; action: "submit" | "release"; amount: number; recipient: string } | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!view) return;
    const response = await fetch(`/api/admin/gateway-finance?view=${view}&month=${month}`, { signal, cache: "no-store" });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "Financial records unavailable.");
    if (view === "route") setRoute(data); else setSettlements(data);
  }, [view, month]);
  useEffect(() => {
    const controller = new AbortController();
    setSettlements(null); setRoute(null); setError("");
    load(controller.signal).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [load]);
  async function act(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/gateway-finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Action failed.");
      setConfirm(null); setNotice("Financial records updated."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Action failed."); }
    finally { setBusy(false); }
  }
  return <section className="gateway-finance" aria-label="Gateway finance">
    <nav className="gateway-tabs" aria-label="Gateway financial workspaces">
      <button className="btn-outline" aria-expanded={view === "settlements"} onClick={() => setView(view === "settlements" ? null : "settlements")}><ArrowDownLeft size={16}/> Bank settlements</button>
      <button className="btn-outline" aria-expanded={view === "route"} onClick={() => setView(view === "route" ? null : "route")}><GitBranch size={16}/> Creator transfers</button>
    </nav>
    {view && <div className="revenue-chart gateway-panel">
      <header className="revenue-heading"><div><h3>{view === "settlements" ? "Settlement reconciliation" : "Razorpay Route"}</h3><p>{view === "settlements" ? "Match gateway transactions and track bank settlement references." : "Reserve creator earnings, verify transfers, then release settlement."}</p></div><button className="btn-outline" disabled={busy} onClick={() => { setError(""); load().catch(err => setError(err.message)); }}><RefreshCw size={15}/> Refresh records</button></header>
      {error && <p role="alert" className="gateway-error">{error}</p>}{notice && <p role="status">{notice}</p>}
      {view === "settlements" && <>
        <div className="revenue-toolbar"><label>Settlement month<input className="field" type="month" value={month} onChange={e => setMonth(e.target.value)}/></label><button className="btn-outline" disabled={busy || !month} onClick={() => act({ action: "sync", month })}>{busy ? "Syncing…" : "Sync with Razorpay"}</button></div>
        {!settlements && !error && <p role="status">Loading settlement records…</p>}
        {settlements && <>
          <p className="gateway-note">{settlements.latestRun ? `Latest sync: ${settlements.latestRun.status} · ${new Date(settlements.latestRun.createdAt).toLocaleString("en-IN")}` : "No report has been synced for this month."}{settlements.latestRun?.error ? ` · ${settlements.latestRun.error}` : ""}</p>
          <div className="revenue-metrics">{[{ label: "Gross payments", amount: settlements.summary.grossMinor }, { label: "Reported gateway fees", amount: settlements.summary.feeMinor }, { label: "Tax component", amount: settlements.summary.taxMinor }, { label: "Provider-confirmed bank settlement", amount: settlements.summary.bankMinor }].map(row => <article className="revenue-metric" key={row.label}><span>{row.label}</span><strong>{money(row.amount)}</strong></article>)}</div>
          <p className="gateway-note">INR only · Fees and tax are shown as reported; tax may be included in the fee field. Bank totals use processed settlement entities. A UTR is the provider reference; bank statement matching remains separate.</p>
          <div className="revenue-months" aria-label="Gateway deductions">{settlements.summary.outflows.map(row => <div className="revenue-month" key={row.type}><span>{row.type}</span><div><i style={{ width: `${Math.min(100, row.debitMinor / Math.max(1, settlements.summary.grossMinor) * 100)}%` }}/></div><strong>{money(row.debitMinor)}</strong></div>)}</div>
          <h4>Bank settlements</h4><WorkspaceRecords rows={settlements.settlements} rowKey={row => row.id} noun="settlements" searchText={row => `${row.id} ${row.utr} ${row.status}`} columns={[
            { key: "id", label: "Settlement / UTR", primary: true, render: row => <><strong>{row.id}</strong><small>{row.utr || "UTR pending"}</small></> },
            { key: "amount", label: "Bank amount", render: row => money(row.amountMinor) },
            { key: "recon", label: "Ledger reconciliation", render: row => <><span className="status-pill">{row.reconciliation}</span><small>Ledger {money(row.ledgerMinor)} · Difference {money(row.differenceMinor)}</small></> },
            { key: "status", label: "Status", render: row => <span className="status-pill">{row.status}</span> },
            { key: "date", label: "Date", render: row => new Date(row.createdAt).toLocaleDateString("en-IN") },
          ]}/>
          <h4>Transaction matches <small>{settlements.summary.exceptions} need review</small></h4><WorkspaceRecords rows={settlements.entries} rowKey={row => row.key} noun="gateway transactions" searchText={row => `${row.entityId} ${row.paymentId} ${row.settlementId} ${row.source} ${row.match}`} columns={[
            { key: "entity", label: "Transaction / source", primary: true, render: row => <><strong>{row.entityId}</strong><small>{row.type} · {row.source}</small></> },
            { key: "value", label: "Amount", render: row => row.currency === "INR" ? money(row.amountMinor) : `${row.currency} ${(row.amountMinor / 100).toFixed(2)}` },
            { key: "flow", label: "Credits / debits", render: row => row.currency === "INR" ? <>{money(row.creditMinor)} / {money(row.debitMinor)}</> : "Other currency" },
            { key: "match", label: "Reconciliation", render: row => <><span className="status-pill">{row.match}</span><small>{row.onHold ? "On hold" : row.settled ? "Settled" : "Pending"}</small></> },
            { key: "settlement", label: "Settlement", render: row => row.settlementId || "Not assigned" },
          ]}/>
        </>}
      </>}
      {view === "route" && <>
        {!route && !error && <p role="status">Loading creator transfers…</p>}
        {route && <>
          {!route.enabled && <p className="gateway-error">Route transfers are disabled. Activate Route in Razorpay and set RAZORPAY_ROUTE_ENABLED=true after onboarding your linked accounts.</p>}
          <details className="revenue-explainer"><summary>Connect an onboarded creator account</summary><p>Complete linked account KYC and Route activation in Razorpay first. The account email must match the HYMN user. Financial actions require a recent admin sign-in.</p><form className="gateway-link-form" onSubmit={e => { e.preventDefault(); act({ action: "link", userId: Number(userId), accountId, productId }); }}><label>HYMN user ID<input className="field" required type="number" min="1" value={userId} onChange={e => setUserId(e.target.value)}/></label><label>Linked account ID<input className="field" required placeholder="acc_…" value={accountId} onChange={e => setAccountId(e.target.value)}/></label><label>Route configuration ID<input className="field" required placeholder="acc_prd_…" value={productId} onChange={e => setProductId(e.target.value)}/></label><button className="btn-outline" disabled={busy || !route.enabled}>Verify and connect</button></form></details>
          <WorkspaceRecords rows={route.accounts} rowKey={row => row.userId} noun="linked accounts" searchText={row => `${row.user.name} ${row.user.email} ${row.accountId}`} columns={[
            { key: "user", label: "Creator", primary: true, render: row => <><strong>{row.user.name}</strong><small>{row.user.email} · #{row.userId}</small></> },
            { key: "account", label: "Linked account", render: row => row.accountId },
            { key: "status", label: "Activation", render: row => row.status },
          ]}/>
          <h4>Earnings available to reserve</h4><p className="gateway-note">Uses recorded creator shares. Existing payouts, refunds, insufficient wallet funds and unmatched funding block reservation. Latest {route.limit} records per source.</p>
          <WorkspaceRecords rows={route.sources} rowKey={row => row.key} noun="creator earnings" searchText={row => `${row.label} ${row.name}`} columns={[
            { key: "source", label: "Earning / creator", primary: true, render: row => <><strong>{row.label}</strong><small>{row.name} · #{row.userId}</small></> },
            { key: "amount", label: "Creator share", render: row => money(row.amountMinor) },
            { key: "action", label: "Action", render: row => <button className="btn-outline" disabled={busy || !route.enabled || !route.accounts.some(account => account.userId === row.userId)} onClick={() => act({ action: "reserve", sourceKey: row.key })}>Reserve earnings</button> },
          ]}/>
          {confirm && <div className="gateway-confirm" role="region" aria-label="Confirm transfer"><strong>{confirm.action === "submit" ? "Create a held transfer" : "Release funds for settlement"}: {money(confirm.amount)}</strong><p>{confirm.recipient} · Transfer #{confirm.id}. {confirm.action === "submit" ? "Funds stay on hold until you release them." : "Razorpay will settle to the creator according to their settlement schedule."}</p><button className="btn-primary" disabled={busy} onClick={() => act({ action: confirm.action, id: confirm.id })}>Confirm {confirm.action === "submit" ? "held transfer" : "release"}</button> <button className="btn-outline" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button></div>}
          <h4>Transfer ledger</h4><WorkspaceRecords rows={route.transfers} rowKey={row => row.id} noun="Route transfers" searchText={row => `${row.sourceKey} ${row.paymentId} ${row.transferId} ${row.user.email} ${row.status}`} columns={[
            { key: "creator", label: "Creator / source", primary: true, render: row => <><strong>{row.user.name || row.user.email}</strong><small>{row.sourceKey} · #{row.id}</small></> },
            { key: "amount", label: "Reserved", render: row => money(row.amountMinor) },
            { key: "status", label: "Status", render: row => <><span className="status-pill">{row.status}</span><small>{row.error}</small></> },
            { key: "reference", label: "Provider references", render: row => <><small>{row.transferId || "Not submitted"}</small><small>{row.paymentId}</small><small>{row.settlementId}</small></> },
            { key: "action", label: "Actions", render: row => <div className="gateway-actions">{row.status === "reserved" && <><button className="btn-outline" disabled={busy || !route.enabled} onClick={() => setConfirm({ id: row.id, action: "submit", amount: row.amountMinor, recipient: row.user.email })}>Create held transfer</button><button className="btn-outline" disabled={busy} onClick={() => act({ action: "cancel", id: row.id })}>Cancel reservation</button></>}{row.status === "held" && <button className="btn-outline" disabled={busy || !route.enabled} onClick={() => setConfirm({ id: row.id, action: "release", amount: row.amountMinor, recipient: row.user.email })}>Release settlement</button>}{!["cancelled", "reserved"].includes(row.status) && <button className="btn-outline" disabled={busy} onClick={() => act({ action: "refresh", id: row.id })}>Verify status</button>}</div> },
          ]}/>
        </>}
      </>}
    </div>}
  </section>;
}
