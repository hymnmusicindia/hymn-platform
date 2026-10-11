"use client";

import { customerMessage } from "@/lib/customer-message";

import { FormEvent, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowUpRight, RefreshCw, X } from "lucide-react";
import { EarningsRecords, WithdrawalRecords } from "@/components/earnings-records";
import { EarningsBalance, EarningsOverview } from "@/components/earnings-overview";
import { moneyLabel, payoutReadiness, recentEarningMonths } from "@/lib/earnings-presentation";
import styles from "./earnings-center.module.css";
import { ContextualHelp } from "@/components/contextual-help";
import type { PayoutSummary } from "@/lib/payout";
import { useAccessibleDialog } from "@/components/ui/use-accessible-dialog";

function formatMoney(amount: number) {
  return moneyLabel(amount);
}

function StatusBadge({ status }: { status: string }) {
  const active = status === "paid" || status === "Cleared";
  return <span className={active ? "status-pill status-pill-active" : "status-pill"}>{status.replace(/_/g, " ")}</span>;
}

function KpiCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <article className="metric-card group relative overflow-hidden transition-transform duration-200 hover:-translate-y-0.5">
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, var(--accent), transparent)" }} />
      <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-soft)" }}>{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--text)" }}>{value}</p>
      {detail ? <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{detail}</p> : null}
    </article>
  );
}

function PayoutModal({ summary, onClose, onSuccess }: { summary: PayoutSummary; onClose: () => void; onSuccess: (summary: PayoutSummary) => void }) {
  const [amount, setAmount] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [isPending, startTransition] = useTransition();
  const requestedAmount = Number(amount) || 0;
  const serviceFee = Math.round(requestedAmount * summary.serviceFeeRate * 100) / 100;
  const netPayout = Math.round((requestedAmount - serviceFee) * 100) / 100;
  const dialogRef = useAccessibleDialog(true, () => { if (!isPending) onClose(); });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());

    startTransition(async () => {
      try {
        const response = await fetch("/api/payout/request", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({...payload, amount:requestedAmount}) });
        const data = await response.json();
        if (!response.ok) { setFeedback(data.error || "Could not submit payout request."); return; }
        // Reserve the accepted amount locally if the subsequent refresh is unavailable.
        const acceptedRequest: PayoutSummary["payoutHistory"][number] = data.request;
        const accepted = { ...summary, availableBalance: Math.max(0,Math.round((summary.availableBalance-acceptedRequest.requestedAmount)*100)/100), pendingBalance:Math.round((summary.pendingBalance+acceptedRequest.requestedAmount)*100)/100, payoutEligible:false, availableBalanceUsd:null, payoutHistory:[acceptedRequest,...summary.payoutHistory] };
        onSuccess(accepted);
        try { const refreshed = await fetch("/api/payout/summary",{cache:"no-store"}); if (refreshed.ok) onSuccess(await refreshed.json()); } catch { /* The accepted reservation remains visible. */ }
        onClose();
      } catch { setUncertain(true); setFeedback("The request could not be confirmed. Close this window and refresh your withdrawal activity before trying again."); }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target && !isPending) onClose(); }}>
      <form ref={dialogRef as React.RefObject<HTMLFormElement | null>} role="dialog" aria-modal="true" aria-labelledby="payout-dialog-title" tabIndex={-1} onSubmit={submit} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border p-5 shadow-2xl sm:p-6" style={{ borderColor: "var(--border)", background: "var(--card-strong)" }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="payout-dialog-title" className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Request Payout</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>HYMN manually reviews and processes payout requests. Track the confirmed status here instead of submitting another request.</p>
          </div>
          <button type="button" disabled={isPending} onClick={onClose} className="btn-outline pressable px-3 py-2" aria-label="Close payout request"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
            Amount to withdraw
            <input name="amount" type="number" min={summary.exchangeRate.usdToInrRate ? Math.ceil(summary.minimumPayoutUsd * summary.exchangeRate.usdToInrRate * 100) / 100 : undefined} max={summary.availableBalance} step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} className="field" placeholder={summary.minimumPayoutAmount ? String(summary.minimumPayoutAmount) : ""} />
          </label>

          <p className="text-sm" style={{ color:"var(--text-muted)" }}>Payment goes to your verified payout profile. <a href="/dashboard?module=splits&tab=payout-details" className="underline">Review payout details</a></p>

          <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>Optional note<textarea name="userNote" className="field min-h-24" placeholder="Anything the finance team should know?" /></label>

          <div className="rounded-[1.25rem] border p-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text)" }}>
            <p>Requested amount: {formatMoney(requestedAmount)}</p>
            <p className="mt-2">HYMN service fee {summary.serviceFeeRate * 100}%: {formatMoney(serviceFee)}</p>
            <p className="mt-2 font-semibold">You will receive: {formatMoney(Math.max(0, netPayout))}</p>
          </div>

          <p className="text-sm" style={{ color: "var(--text-muted)" }}>A {summary.serviceFeeRate * 100}% HYMN service fee will be deducted from each payout request.</p>
          {feedback ? <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>{customerMessage(feedback)}</p> : null}
          <button type="submit" disabled={isPending || uncertain || !payoutReadiness(summary).ready} className="btn-primary pressable disabled:opacity-50">{isPending ? "Submitting..." : "Submit payout request"}</button>
        </div>
      </form>
    </div>
  );
}

export function PayoutDashboard({ initialSummary }: { initialSummary: PayoutSummary }) {
  const [summary, setSummary] = useState(initialSummary);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "monthly" | "quarterly" | "statements" | "requests" | "details">("overview");
  const [reportFeedback, setReportFeedback] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const refreshController = useRef<AbortController | null>(null);
  const buttonDisabled = !payoutReadiness(summary).ready;
  const refresh = useCallback(async () => {
    if (refreshController.current) return;
    const controller = new AbortController(); refreshController.current = controller;
    setRefreshing(true);
    try {
      const response = await fetch("/api/payout/summary", { cache:"no-store", signal:controller.signal });
      if (!response.ok) throw new Error("Could not refresh");
      const next = await response.json();
      if (typeof next.availableBalance !== "number" || !Array.isArray(next.payoutHistory)) throw new Error("Invalid summary");
      setSummary(next); setRefreshError(""); setRefreshedAt(new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}));
    } catch { if (!controller.signal.aborted) setRefreshError("Could not refresh. Showing your last loaded balances. Please try again."); }
    finally { if (refreshController.current === controller) refreshController.current = null; if (!controller.signal.aborted) setRefreshing(false); }
  }, []);
  useEffect(() => {
    const update = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(update, 60000);
    window.addEventListener("focus",update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus",update); refreshController.current?.abort(); refreshController.current=null; };
  }, [refresh]);

  useEffect(() => {
    const sync = () => {
      const requested = new URLSearchParams(window.location.search).get("tab");
      setActiveTab(["overview", "monthly", "quarterly", "statements", "requests", "details"].includes(requested || "") ? requested as typeof activeTab : "overview");
    };
    sync(); window.addEventListener("popstate",sync);
    return () => window.removeEventListener("popstate",sync);
  }, []);

  function selectTab(tab: typeof activeTab) {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.pushState(null, "", url.toString());
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  async function generateStatement(type: "monthly" | "quarterly") {
    if (reportBusy) return;
    setReportBusy(true); setReportFeedback("Generating statement...");
    const latest = recentEarningMonths(summary.monthlyEarnings).at(-1);
    const [monthName, year] = latest?.month.split(" ") ?? [];
    const month = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(monthName?.slice(0,3) ?? "")+1;
    if (type === "monthly" && (!month || !year)) { setReportBusy(false); setReportFeedback("No reported period is available for a monthly statement yet."); return; }
    try {
      const response = await fetch("/api/payout/reports", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(type==="monthly" ? {type,month,year:Number(year)} : {type,quarter:summary.quarter.quarter,year:summary.quarter.year})});
      const result=await response.json();
      if (!response.ok) throw new Error(result.error || "Statement generation failed.");
      const download=document.createElement("a"); download.href=`/api/payout/reports/${result.report.id}/download`; download.download=""; document.body.appendChild(download); download.click(); download.remove();
      setReportFeedback("Statement generated. Your download is starting.");
      void refresh();
    } catch(error) { setReportFeedback(error instanceof Error ? error.message : "Could not generate your statement. Please try again."); }
    finally { setReportBusy(false); }
  }

  return (
    <main className={`shell ${styles.center}`}>
      <header className={styles.heading}><div><h1>Earnings & payouts</h1><p>Your reported royalties, available funds and withdrawals, together.{refreshedAt ? ` Updated ${refreshedAt}.` : ""}</p></div><button className={styles.refresh} type="button" disabled={refreshing} onClick={()=>void refresh()}><RefreshCw size={14} aria-hidden="true"/>{refreshing ? "Refreshing..." : "Refresh balances"}</button></header>
      {refreshError ? <p className={styles.feedback} role="alert">{refreshError}</p> : null}
      <span className="sr-only" role="status">{refreshing ? "Refreshing balances" : refreshedAt ? `Balances refreshed at ${refreshedAt}` : "Balances loaded"}</span>
      <EarningsBalance summary={summary} onSection={selectTab} onWithdraw={()=>setModalOpen(true)}/>
      <nav className={styles.tabs} aria-label="Earnings and payout sections">
        {(["overview", "monthly", "quarterly", "statements", "requests", "details"] as const).map(tab=><button key={tab} type="button" onClick={()=>selectTab(tab)} aria-current={activeTab===tab ? "page" : undefined}>{({overview:"Overview",monthly:"Earnings history",quarterly:"Quarter summary",statements:"Statements",requests:"Withdrawals",details:"Payout details"})[tab]}</button>)}
      </nav>

      {activeTab === "monthly" ? (
        <section className="surface-card mt-6 p-5 sm:p-6">
          <h2 className="text-2xl font-semibold">Monthly earning records</h2>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Database-backed royalty and split rows. Excel reports are generated from these same records.</p>

          <EarningsRecords rows={summary.monthlyBreakdown} periods={summary.monthlyEarnings}/>
        </section>
      ) : null}

      {activeTab === "quarterly" ? (
        <section className="surface-card mt-6 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm" style={{ color: "var(--text-soft)" }}>Current Quarter <ContextualHelp faqId="quarterly-payouts" label="Quarterly payouts">Quarterly closing locks the reporting period, publishes statements, and carries eligible unpaid balances forward.</ContextualHelp></p><h2 className="mt-1 text-3xl font-semibold">Q{summary.quarter.quarter} {summary.quarter.year}</h2><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Closes on {new Date(summary.quarter.endDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p></div><StatusBadge status={summary.quarter.status} /></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><KpiCard label="Quarter-to-date earnings" value={formatMoney(summary.currentQuarterEarnings)} /><KpiCard label="Quarter paid" value={formatMoney(summary.currentQuarterPaid)} /><KpiCard label="Quarter pending payout" value={formatMoney(summary.currentQuarterPending)} /><KpiCard label="Quarter held" value={formatMoney(summary.currentQuarterHeld)} /><KpiCard label="Available balance" value={formatMoney(summary.availableBalance)} /><KpiCard label="Carry forward" value={formatMoney(summary.carryForwardBalance)} /></div>
          <p className="mt-5 rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>{summary.quarter.payoutRequestsOpen ? "Payout requests are open for your carried-forward available balance." : "Payout requests open after the current quarter closes."}</p>
        </section>
      ) : null}

      {activeTab === "statements" ? (
        <section className="surface-card mt-6 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-semibold">Downloadable statements</h2><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Statements contain only your own records.</p></div><div className="flex flex-wrap gap-2"><button type="button" className="btn-outline" disabled={reportBusy} onClick={() => generateStatement("monthly")}>Download My Monthly Statement</button><button type="button" className="btn-primary" disabled={reportBusy} onClick={() => generateStatement("quarterly")}>Download My Quarterly Statement</button></div></div>
          {reportFeedback ? <p className="mt-3 text-sm">{reportFeedback}</p> : null}
          <div className="mt-5 grid gap-3">{summary.reports.map((report) => <article key={report.id} className="surface-list-item flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold">{report.fileName}</p><p className="mt-1 text-xs" style={{ color: "var(--text-soft)" }}>{new Date(report.generatedAt).toLocaleString("en-IN")} · {report.status}</p></div><a href={`/api/payout/reports/${report.id}/download`} className="btn-outline px-3 py-2 text-xs">Download</a></article>)}</div>
        </section>
      ) : null}

      {activeTab === "details" ? <section className="surface-card mt-6 p-5 sm:p-6"><h2 className="text-2xl font-semibold">Payout details</h2><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Encrypted payout credentials are managed in the Splits workspace and remain masked in the UI.</p><a href="/dashboard?module=splits&tab=payout-details" className="btn-primary mt-5 inline-flex">Manage payout details</a></section> : null}

      {activeTab === "requests" ? (
        <section className="surface-card mt-6 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-soft)" }}>Withdrawal activity</p><h2 className="mt-2 text-2xl font-semibold">Payout requests</h2><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Track every request from submission through processing.</p></div>
            <button type="button" disabled={buttonDisabled} onClick={() => setModalOpen(true)} className="btn-primary pressable disabled:opacity-50">Request payout <ArrowUpRight className="h-4 w-4" /></button>
          </div>
          <WithdrawalRecords rows={summary.payoutHistory}/>
        </section>
      ) : null}

      {activeTab === "overview" ? <EarningsOverview summary={summary} onSection={selectTab}/> : null}

      {modalOpen ? <PayoutModal summary={summary} onClose={() => setModalOpen(false)} onSuccess={next=>{refreshController.current?.abort();refreshController.current=null;setRefreshing(false);setRefreshError("");setSummary(next);}} /> : null}
    </main>
  );
}

// vercel trigger 2
// vercel trigger 7
// vercel trigger 9

// vercel trigger 11

// vercel trigger 12
