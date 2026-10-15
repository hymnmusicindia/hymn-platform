"use client";
import { useState } from "react";
import { ArrowUpRight, ChevronRight, WalletCards } from "lucide-react";
import type { PayoutSummary } from "@/lib/payout";
import { moneyLabel, payoutReadiness, recentEarningMonths } from "@/lib/earnings-presentation";
import styles from "./earnings-center.module.css";

type Section = "overview" | "monthly" | "quarterly" | "statements" | "requests" | "details";
export function EarningsBalance({ summary, onSection, onWithdraw }: { summary:PayoutSummary; onSection:(section:Section)=>void; onWithdraw:()=>void }) {
  const readiness=payoutReadiness(summary);
  const hasReports=summary.monthlyEarnings.length>0;
  const progress=summary.availableBalanceUsd===null || summary.exchangeRate.rateStatus!=="active" || summary.minimumPayoutUsd<=0 ? null : Math.min(100,Math.max(0,summary.availableBalanceUsd/summary.minimumPayoutUsd*100));
  return <section className={styles.balance} aria-label="Your money at a glance">
    <div><span className={styles.kicker}><WalletCards size={16} aria-hidden="true" />Distribution royalty balance</span><p className={styles.amount}>{moneyLabel(summary.availableBalance)}</p><p className={styles.muted}>Distribution only. Other income and its withdrawal limits are shown separately above.</p>
      <div className={styles.balanceStats}><div><span>In progress</span><strong>{moneyLabel(summary.pendingBalance)}</strong><small>Reserved for withdrawals</small></div><div><span>Paid to you</span><strong>{moneyLabel(summary.paidTillDate)}</strong><small>Completed payments, after fees</small></div><div><span>Lifetime earnings</span><strong>{hasReports || summary.totalEarnings>0 ? moneyLabel(summary.totalEarnings) : "Awaiting reports"}</strong><small>Verified earnings, before withdrawal fees</small></div></div>
    </div>
    <aside className={styles.readiness} data-ready={readiness.ready}><span className={styles.kicker}>Your next move</span><h2>{readiness.title}</h2><p>{readiness.detail}</p>
      {progress!==null ? <><div className={styles.progress} role="progressbar" aria-label="Progress toward minimum withdrawal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span style={{width:`${progress}%`}} /></div><small>Approx. ${summary.availableBalanceUsd!.toFixed(2)} / ${summary.minimumPayoutUsd} minimum</small></> : null}
      <button className={styles.primary} disabled={!readiness.ready && !readiness.tab} onClick={()=>readiness.tab ? onSection(readiness.tab) : onWithdraw()}>{readiness.ready ? "Request withdrawal" : readiness.tab==="requests" ? "Track withdrawal" : readiness.tab==="details" ? "Manage payout details" : readiness.tab==="quarterly" ? "View payout window" : "Withdrawal not available"}<ArrowUpRight size={16} aria-hidden="true" /></button>
      <small>{(summary.serviceFeeRate*100).toLocaleString("en-IN")}% service fee per withdrawal</small>
    </aside>
  </section>;
}

export function EarningsOverview({ summary, onSection }: { summary:PayoutSummary; onSection:(section:Section)=>void }) {
  const [query,setQuery]=useState("");
  const months=recentEarningMonths(summary.monthlyEarnings);
  const latest=months.at(-1);
  const max=Math.max(0,...months.map(row=>Math.abs(row.netPayable)));
  const releases=[...summary.releaseBreakdown].sort((a,b)=>b.netEarnings-a.netEarnings).filter(row=>row.releaseTitle.toLowerCase().includes(query.toLowerCase()));
  const platforms=[...summary.platformBreakdown].sort((a,b)=>b.earnings-a.earnings).slice(0,4);
  const recent=[...summary.payoutHistory].sort((a,b)=>b.requestDate.localeCompare(a.requestDate)).slice(0,3);
  return <div className={styles.overview}>
    {!months.length ? <section className={styles.empty}><span className={styles.kicker}>Your earnings story starts here</span><h2>{summary.monthlyBreakdown.length ? "Your split earnings are available." : "Reports first. A clearer picture next."}</h2><p>{summary.monthlyBreakdown.length ? "Open earnings history to review your reported split allocations and your share of each release." : "Once verified royalty reports arrive, you will see your earning periods, releases and platforms here. Your account balance above is shown separately."}</p>{summary.monthlyBreakdown.length ? <button className={styles.textButton} onClick={()=>onSection("monthly")}>Review split earnings<ChevronRight size={15}/></button> : null}</section> : <section className={styles.card}><div className={styles.sectionHeading}><div><span className={styles.kicker}>Latest reported period</span><h2>{moneyLabel(latest!.netPayable)} <small>{latest!.month}</small></h2><p>Latest {months.length} reported period{months.length===1 ? "" : "s"}. Missing months are not treated as zero.</p></div><button onClick={()=>onSection("monthly")} className={styles.textButton}>Earnings history<ChevronRight size={15}/></button></div><div className={styles.months}>{months.map(row=><div key={row.month} className={styles.month}><span>{row.month}</span><div aria-hidden="true"><i data-negative={row.netPayable<0} style={{width:`${max ? Math.abs(row.netPayable)/max*100 : 0}%`}}/></div><strong>{moneyLabel(row.netPayable)}</strong></div>)}</div></section>}
    <div className={styles.columns}>
      <section className={styles.card}><div className={styles.sectionHeading}><div><h2>What is earning</h2><p>Your leading releases, by reported earnings.</p></div></div><label className={styles.search}><span className="sr-only">Search earning releases</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Find a release" type="search"/></label><div className={styles.list}>{releases.slice(0,5).map((row,index)=><details key={`${row.upc}-${row.releaseTitle}-${index}`} className={styles.release}><summary><span><strong>{row.releaseTitle}</strong><small>Reported royalties</small></span><b>{moneyLabel(row.netEarnings)}</b><ChevronRight size={14}/></summary><dl><div><dt>UPC</dt><dd>{row.upc}</dd></div><div><dt>Gross revenue</dt><dd>{moneyLabel(row.grossEarnings)}</dd></div><div><dt>HYMN fee</dt><dd>{moneyLabel(row.hymnFee)}</dd></div><div><dt>Reported net earnings</dt><dd>{moneyLabel(row.netEarnings)}</dd></div></dl></details>)}</div>{!releases.length ? <p className={styles.muted}>{query ? "No releases match your search." : "Release earnings appear with your verified reports."}</p> : null}{releases.length>5 ? <p className={styles.muted}>Showing your top 5 of {releases.length} releases. Search to find another release.</p> : null}</section>
      <section className={styles.card}><div className={styles.sectionHeading}><div><h2>Withdrawal activity</h2><p>Follow your money from request to payment.</p></div><button className={styles.textButton} onClick={()=>onSection("requests")}>View all<ChevronRight size={15}/></button></div><div className={styles.list}>{recent.map(row=><button className={styles.activity} key={row.id} onClick={()=>onSection("requests")}><span><strong>Request #{row.id}</strong><small>{new Date(row.requestDate).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})} | {row.status.replace(/_/g," ")}</small></span><b>{moneyLabel(row.requestedAmount)}</b></button>)}</div>{!recent.length ? <p className={styles.muted}>No withdrawals requested yet. Your first request and its status will appear here.</p> : null}<div className={styles.platforms}><span className={styles.kicker}>Reported platforms</span>{platforms.map(row=><div key={row.platform}><span>{row.platform}</span><strong>{moneyLabel(row.earnings)}</strong></div>)}{!platforms.length ? <p className={styles.muted}>Awaiting platform reports.</p> : null}</div></section>
    </div>
  </div>;
}
