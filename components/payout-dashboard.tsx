"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { AlertCircle, Landmark, WalletCards, X } from "lucide-react";
import { RoyaltyCalculator } from "@/components/royalty-calculator";
import type { PayoutSummary } from "@/lib/payout";

function formatMoney(amount: number) {
  return `Rs ${Math.round(amount).toLocaleString("en-IN")}`;
}

function StatusBadge({ status }: { status: string }) {
  const active = status === "paid" || status === "Cleared";
  return <span className={active ? "status-pill status-pill-active" : "status-pill"}>{status.replace(/_/g, " ")}</span>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed p-6 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)", background: "var(--bg-soft)" }}>
      {children}
    </div>
  );
}

function KpiCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <article className="metric-card">
      <p className="text-sm" style={{ color: "var(--text-soft)" }}>{label}</p>
      <p className="mt-3 text-3xl font-semibold" style={{ color: "var(--text)" }}>{value}</p>
      {detail ? <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{detail}</p> : null}
    </article>
  );
}

function MonthlyChart({ rows }: { rows: PayoutSummary["monthlyEarnings"] }) {
  const max = Math.max(1, ...rows.map((row) => row.netPayable));
  if (rows.length === 0) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-[1.5rem] border" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
        <p className="max-w-md text-center text-sm" style={{ color: "var(--text-muted)" }}>
          Monthly earnings analytics will appear after HYMN imports verified distributor royalty statements.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[240px] items-end gap-3 rounded-[1.5rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
      {rows.map((row) => (
        <div key={row.month} className="flex flex-1 flex-col items-center gap-3">
          <div className="flex h-44 w-full items-end rounded-2xl" style={{ background: "var(--card)" }}>
            <div className="w-full rounded-2xl transition-all" style={{ height: `${Math.max(8, (row.netPayable / max) * 100)}%`, background: "linear-gradient(180deg, var(--accent), var(--money))" }} />
          </div>
          <p className="text-center text-xs" style={{ color: "var(--text-soft)" }}>{row.month}</p>
        </div>
      ))}
    </div>
  );
}

function TableShell({ headers, empty, children }: { headers: string[]; empty: string; children: React.ReactNode }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="overflow-x-auto rounded-[1.5rem] border" style={{ borderColor: "var(--border)" }}>
      <table className="min-w-full text-left text-sm">
        <thead style={{ background: "var(--bg-soft)", color: "var(--text-soft)" }}>
          <tr>{headers.map((header) => <th key={header} className="px-4 py-3 font-medium">{header}</th>)}</tr>
        </thead>
        <tbody style={{ color: "var(--text)" }}>{hasRows ? children : <tr><td className="px-4 py-6" colSpan={headers.length} style={{ color: "var(--text-muted)" }}>{empty}</td></tr>}</tbody>
      </table>
    </div>
  );
}

function PayoutModal({ summary, onClose, onSuccess }: { summary: PayoutSummary; onClose: () => void; onSuccess: (summary: PayoutSummary) => void }) {
  const [method, setMethod] = useState<"UPI" | "BANK">("UPI");
  const [amount, setAmount] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestedAmount = Number(amount) || 0;
  const serviceFee = requestedAmount * summary.serviceFeeRate;
  const netPayout = requestedAmount - serviceFee;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());

    startTransition(async () => {
      const response = await fetch("/api/payout/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, method, amount: requestedAmount })
      });
      const data = await response.json();
      if (!response.ok) {
        setFeedback(data.error || "Could not submit payout request.");
        return;
      }
      const refreshed = await fetch("/api/payout/summary", { cache: "no-store" });
      onSuccess(await refreshed.json());
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border p-5 shadow-2xl sm:p-6" style={{ borderColor: "var(--border)", background: "var(--card-strong)" }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Request Payout</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Payouts are usually processed within 24-48 hours.</p>
          </div>
          <button type="button" onClick={onClose} className="btn-outline pressable px-3 py-2" aria-label="Close payout request"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
            Amount to withdraw
            <input name="amount" type="number" min={summary.minimumPayoutAmount} max={summary.availableBalance} step="1" required value={amount} onChange={(event) => setAmount(event.target.value)} className="field" placeholder="500" />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setMethod("UPI")} className={method === "UPI" ? "btn-primary pressable" : "btn-outline pressable"}>UPI</button>
            <button type="button" onClick={() => setMethod("BANK")} className={method === "BANK" ? "btn-primary pressable" : "btn-outline pressable"}>Bank Transfer</button>
          </div>
          <input type="hidden" name="method" value={method} />

          {method === "UPI" ? (
            <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>UPI ID<input name="upiId" required className="field" placeholder="name@bank" /></label>
          ) : (
            <div className="grid gap-3">
              <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>Account holder name<input name="accountHolderName" required className="field" /></label>
              <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>Bank account number<input name="bankAccountNumber" required className="field" /></label>
              <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>IFSC code<input name="ifsc" required className="field" /></label>
            </div>
          )}

          <label className="grid gap-2 text-sm" style={{ color: "var(--text-muted)" }}>Optional note<textarea name="userNote" className="field min-h-24" placeholder="Anything the finance team should know?" /></label>

          <div className="rounded-[1.25rem] border p-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text)" }}>
            <p>Requested amount: {formatMoney(requestedAmount)}</p>
            <p className="mt-2">HYMN service fee 2%: {formatMoney(serviceFee)}</p>
            <p className="mt-2 font-semibold">You will receive: {formatMoney(Math.max(0, netPayout))}</p>
          </div>

          <p className="text-sm" style={{ color: "var(--text-muted)" }}>A 2% HYMN service fee will be deducted from each payout request.</p>
          {feedback ? <p className="text-sm" style={{ color: "var(--danger)" }}>{feedback}</p> : null}
          <button type="submit" disabled={isPending || summary.availableBalance < summary.minimumPayoutAmount} className="btn-primary pressable disabled:opacity-50">{isPending ? "Submitting..." : "Submit payout request"}</button>
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
  const hasStatements = summary.monthlyEarnings.length > 0 || summary.releaseBreakdown.length > 0 || summary.trackBreakdown.length > 0 || summary.platformBreakdown.length > 0;
  const buttonDisabled = summary.availableBalance < summary.minimumPayoutAmount || !summary.quarter.payoutRequestsOpen;
  const maxMonthly = useMemo(() => Math.max(0, ...summary.monthlyEarnings.map((row) => row.netPayable)), [summary.monthlyEarnings]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (["overview", "monthly", "quarterly", "statements", "requests", "details"].includes(requested || "")) setActiveTab(requested as typeof activeTab);
  }, []);

  function selectTab(tab: typeof activeTab) {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url.toString());
  }

  async function generateStatement(type: "monthly" | "quarterly") {
    const now = new Date();
    setReportFeedback("Generating statement…");
    const response = await fetch("/api/payout/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(type === "monthly" ? { type, month: now.getUTCMonth() + 1, year: now.getUTCFullYear() } : { type, quarter: summary.quarter.quarter, year: summary.quarter.year })
    });
    const result = await response.json();
    if (!response.ok) return setReportFeedback(result.error || "Statement generation failed.");
    setReportFeedback("Statement generated. Download starting…");
    window.location.assign(`/api/payout/reports/${result.report.id}/download`);
  }

  return (
    <main className="shell py-12 sm:py-16">
      <section className="surface-card overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl" style={{ color: "var(--text)" }}>Payout</h1>
            <p className="mt-4 text-base leading-7" style={{ color: "var(--text-muted)" }}>Track your HYMN earnings, request withdrawals, and review payout history.</p>
            <p className="mt-3 text-sm" style={{ color: "var(--text-soft)" }}>Final payout depends on verified royalty statements and cleared earnings.</p>
          </div>
          <div className="rounded-[1.5rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Available balance</p>
            <p className="mt-2 text-3xl font-semibold" style={{ color: "var(--text)" }}>{formatMoney(summary.availableBalance)}</p>
            <button type="button" disabled={buttonDisabled} onClick={() => setModalOpen(true)} className="btn-primary pressable mt-4 w-full disabled:opacity-50">
              <WalletCards className="h-4 w-4" />
              Request Payout
            </button>
            <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>Fetch your available balance to your preferred payment method.</p>
            {buttonDisabled ? <p className="mt-2 text-xs" style={{ color: "var(--danger)" }}>{!summary.quarter.payoutRequestsOpen ? "Payout requests open after the current quarter closes." : "Minimum payout amount is Rs 500."}</p> : null}
          </div>
        </div>
      </section>

      <nav className="mt-6 flex flex-wrap gap-2" aria-label="Payout sections">
        {(["overview", "monthly", "quarterly", "statements", "requests", "details"] as const).map((tab) => (
          <button key={tab} type="button" onClick={() => selectTab(tab)} className={activeTab === tab ? "btn-primary pressable px-4 py-2 text-sm capitalize" : "btn-outline pressable px-4 py-2 text-sm capitalize"}>
            {tab === "details" ? "Payout details" : tab}
          </button>
        ))}
      </nav>

      {activeTab === "monthly" ? (
        <section className="surface-card mt-6 p-5 sm:p-6">
          <h2 className="text-2xl font-semibold">Monthly earning records</h2>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Database-backed royalty and split rows. Excel reports are generated from these same records.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><KpiCard label="Current Month Earnings" value={formatMoney(summary.currentMonthEarnings)} /><KpiCard label="Current Month Split Earnings" value={formatMoney(summary.currentMonthSplitEarnings)} /><KpiCard label="Current Month Held" value={formatMoney(summary.currentMonthHeldAmount)} /><KpiCard label="Current Month Paid" value={formatMoney(summary.currentMonthPaidAmount)} /></div>
          <div className="mt-5"><MonthlyChart rows={summary.monthlyEarnings} /></div>
          <div className="mt-5"><TableShell headers={["Month", "Release", "Track", "Platform", "UPC", "ISRC", "Gross", "Artist pool", "My share", "My earnings", "Status"]} empty="No split earning rows yet.">
            {summary.monthlyBreakdown.map((row) => <tr key={row.id} className="border-t" style={{ borderColor: "var(--border)" }}><td className="px-3 py-3">{row.month}</td><td className="px-3 py-3">{row.release}</td><td className="px-3 py-3">{row.track}</td><td className="px-3 py-3">{row.platform}</td><td className="px-3 py-3">{row.upc}</td><td className="px-3 py-3">{row.isrc}</td><td className="px-3 py-3">{formatMoney(row.grossRevenue)}</td><td className="px-3 py-3">{formatMoney(row.artistPool)}</td><td className="px-3 py-3">{row.sharePercent}%</td><td className="px-3 py-3">{formatMoney(row.myEarnings)}</td><td className="px-3 py-3"><StatusBadge status={row.status} /></td></tr>)}
          </TableShell></div>
        </section>
      ) : null}

      {activeTab === "quarterly" ? (
        <section className="surface-card mt-6 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm" style={{ color: "var(--text-soft)" }}>Current Quarter</p><h2 className="mt-1 text-3xl font-semibold">Q{summary.quarter.quarter} {summary.quarter.year}</h2><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Closes on {new Date(summary.quarter.endDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p></div><StatusBadge status={summary.quarter.status} /></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><KpiCard label="Quarter-to-date earnings" value={formatMoney(summary.currentQuarterEarnings)} /><KpiCard label="Quarter paid" value={formatMoney(summary.currentQuarterPaid)} /><KpiCard label="Quarter pending payout" value={formatMoney(summary.currentQuarterPending)} /><KpiCard label="Quarter held" value={formatMoney(summary.currentQuarterHeld)} /><KpiCard label="Available balance" value={formatMoney(summary.availableBalance)} /><KpiCard label="Carry forward" value={formatMoney(summary.carryForwardBalance)} /></div>
          <p className="mt-5 rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>{summary.quarter.payoutRequestsOpen ? "Payout requests are open for your carried-forward available balance." : "Payout requests open after the current quarter closes."}</p>
        </section>
      ) : null}

      {activeTab === "statements" ? (
        <section className="surface-card mt-6 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-semibold">Downloadable statements</h2><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Statements contain only your own records.</p></div><div className="flex flex-wrap gap-2"><button type="button" className="btn-outline" onClick={() => generateStatement("monthly")}>Download My Monthly Statement</button><button type="button" className="btn-primary" onClick={() => generateStatement("quarterly")}>Download My Quarterly Statement</button></div></div>
          {reportFeedback ? <p className="mt-3 text-sm">{reportFeedback}</p> : null}
          <div className="mt-5 grid gap-3">{summary.reports.map((report) => <article key={report.id} className="surface-list-item flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold">{report.fileName}</p><p className="mt-1 text-xs" style={{ color: "var(--text-soft)" }}>{new Date(report.generatedAt).toLocaleString("en-IN")} · {report.status}</p></div><a href={`/api/payout/reports/${report.id}/download`} className="btn-outline px-3 py-2 text-xs">Download</a></article>)}</div>
        </section>
      ) : null}

      {activeTab === "details" ? <section className="surface-card mt-6 p-5 sm:p-6"><h2 className="text-2xl font-semibold">Payout details</h2><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Encrypted payout credentials are managed in the Splits workspace and remain masked in the UI.</p><a href="/dashboard?module=splits&tab=payout-details" className="btn-primary mt-5 inline-flex">Manage payout details</a></section> : null}

      {!hasStatements ? (
        <div className="mt-6">
          <EmptyState>No royalty statement has been imported yet. Earnings will appear after HYMN processes distributor reports.</EmptyState>
        </div>
      ) : null}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Available balance" value={formatMoney(summary.availableBalance)} />
        <KpiCard label="Current month earnings" value={formatMoney(summary.currentMonthEarnings)} detail={maxMonthly ? "Based on imported statement month" : undefined} />
        <KpiCard label="Current quarter earnings" value={formatMoney(summary.currentQuarterEarnings)} />
        <KpiCard label="Held balance" value={formatMoney(summary.currentQuarterHeld)} />
        <KpiCard label="Pending payout" value={formatMoney(summary.pendingBalance)} />
        <KpiCard label="Lifetime earnings" value={formatMoney(summary.totalEarnings)} />
        <KpiCard label="Lifetime paid" value={formatMoney(summary.paidTillDate)} />
        <KpiCard label="Carry forward balance" value={formatMoney(summary.carryForwardBalance)} />
      </section>

      <section className="surface-card mt-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Monthly earnings analytics</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Only verified royalty statement data is shown here.</p>
          </div>
          <StatusBadge status="Finance-grade data only" />
        </div>
        <div className="mt-5"><MonthlyChart rows={summary.monthlyEarnings} /></div>
        <div className="mt-5">
          <TableShell headers={["Month", "Gross earnings", "HYMN service fee", "Net payable", "Payout status"]} empty="No monthly statement rows yet.">
            {summary.monthlyEarnings.map((row) => (
              <tr key={row.month} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-3">{row.month}</td><td className="px-4 py-3">{formatMoney(row.grossEarnings)}</td><td className="px-4 py-3">{formatMoney(row.hymnServiceFee)}</td><td className="px-4 py-3">{formatMoney(row.netPayable)}</td><td className="px-4 py-3"><StatusBadge status={row.payoutStatus} /></td>
              </tr>
            ))}
          </TableShell>
        </div>
      </section>

      <section className="mt-6 grid gap-6">
        <div className="surface-card p-5 sm:p-6">
          <h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Earnings breakdown</h2>
          <div className="mt-5 grid gap-5">
            <TableShell headers={["Release", "UPC", "Gross", "HYMN fee", "Net", "Status"]} empty="No release-level earnings yet.">
              {summary.releaseBreakdown.map((row) => <tr key={`${row.releaseTitle}-${row.upc}`} className="border-t" style={{ borderColor: "var(--border)" }}><td className="px-4 py-3">{row.releaseTitle}</td><td className="px-4 py-3">{row.upc}</td><td className="px-4 py-3">{formatMoney(row.grossEarnings)}</td><td className="px-4 py-3">{formatMoney(row.hymnFee)}</td><td className="px-4 py-3">{formatMoney(row.netEarnings)}</td><td className="px-4 py-3"><StatusBadge status={row.payoutStatus} /></td></tr>)}
            </TableShell>
            <TableShell headers={["Track", "ISRC", "Streams/downloads", "Net earnings"]} empty="No track-level earnings yet.">
              {summary.trackBreakdown.map((row) => <tr key={`${row.trackTitle}-${row.isrc}`} className="border-t" style={{ borderColor: "var(--border)" }}><td className="px-4 py-3">{row.trackTitle}</td><td className="px-4 py-3">{row.isrc}</td><td className="px-4 py-3">{row.streamsDownloads ?? "-"}</td><td className="px-4 py-3">{formatMoney(row.netEarnings)}</td></tr>)}
            </TableShell>
            <TableShell headers={["Platform", "Earnings"]} empty="No platform earnings yet.">
              {summary.platformBreakdown.map((row) => <tr key={row.platform} className="border-t" style={{ borderColor: "var(--border)" }}><td className="px-4 py-3">{row.platform}</td><td className="px-4 py-3">{formatMoney(row.earnings)}</td></tr>)}
            </TableShell>
          </div>
        </div>

        <div className="surface-card p-5 sm:p-6">
          <h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Payout history</h2>
          <div className="mt-5">
            <TableShell headers={["Request date", "Requested", "Service fee", "Net payout", "Method", "Status", "Processed", "Admin note"]} empty="No payout requests yet.">
              {summary.payoutHistory.map((row) => <tr key={row.id} className="border-t" style={{ borderColor: "var(--border)" }}><td className="px-4 py-3">{new Date(row.requestDate).toLocaleDateString("en-IN")}</td><td className="px-4 py-3">{formatMoney(row.requestedAmount)}</td><td className="px-4 py-3">{formatMoney(row.serviceFee)}</td><td className="px-4 py-3">{formatMoney(row.netPayout)}</td><td className="px-4 py-3">{row.method}</td><td className="px-4 py-3"><StatusBadge status={row.status} /></td><td className="px-4 py-3">{row.processedDate ? new Date(row.processedDate).toLocaleDateString("en-IN") : "-"}</td><td className="px-4 py-3">{row.adminNote ?? "-"}</td></tr>)}
            </TableShell>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[0.95fr,1.05fr]">
        <div className="surface-card p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-1 h-5 w-5" style={{ color: "var(--money)" }} />
            <div>
              <h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Royalty estimator & payout information</h2>
              <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                HYMN calculates withdrawable payout balance only from verified royalty statements, cleared earnings, admin-confirmed royalty imports, and future DireNote earnings data when available.
              </p>
              <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                Payouts are usually processed within 24-48 hours. A 2% HYMN service fee is deducted from each payout request.
              </p>
              <p className="mt-3 rounded-2xl border p-4 text-sm font-semibold" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text)" }}>
                The royalty calculator is only an estimate. Withdrawable payout balance is based only on verified royalty statements and cleared earnings.
              </p>
            </div>
          </div>
        </div>
        <RoyaltyCalculator />
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          ["Verified sales base", "Only verified royalty statements and cleared earnings count toward payout-ready balances."],
          ["How HYMN calculates royalties", "Gross reported earnings minus applicable HYMN service fees become net payable balances after statement verification."],
          ["Estimator terms", "The royalty calculator is only an estimate and does not represent withdrawable balance."]
        ].map(([title, body]) => (
          <article key={title} className="surface-card p-5">
            <Landmark className="h-5 w-5" style={{ color: "var(--text-soft)" }} />
            <h3 className="mt-4 text-xl font-semibold" style={{ color: "var(--text)" }}>{title}</h3>
            <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{body}</p>
          </article>
        ))}
      </section>

      {modalOpen ? <PayoutModal summary={summary} onClose={() => setModalOpen(false)} onSuccess={setSummary} /> : null}
    </main>
  );
}

// vercel trigger 2
