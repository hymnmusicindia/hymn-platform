"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, ChevronRight, RefreshCw, WalletCards, X } from 'lucide-react';
import { INCOME_SOURCE_KEYS, SOURCE_COLORS, incomeComposition, incomeSlicePath, incomeMoney, incomeWithdrawalBlock, type IncomeSource, type IncomeSourceKey, type IncomeSummary, type IncomeHistory } from '@/lib/income-explorer';
import { useAccessibleDialog } from '@/components/ui/use-accessible-dialog';
import styles from './income-sources.module.css';
const percentage = (share: number) => `${(share * 100).toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`;
const dateLabel = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : 'Date unavailable';
function validSummary(value: IncomeSummary) {
  return value && Number.isFinite(value.checkoutCredit) && typeof value.reconciliationRequired === 'boolean' && Array.isArray(value.sources) && value.sources.every(row => row && INCOME_SOURCE_KEYS.includes(row.key) && typeof row.label === 'string' && ['wallet', 'referral', 'curator'].includes(row.route) && ['USD', 'INR'].includes(row.currency) && ['earned', 'available', 'held', 'paid', 'minimum'].every(key => Number.isFinite(row[key as keyof IncomeSource])) && row.available >= 0 && row.held >= 0 && row.paid >= 0 && row.minimum > 0) && new Set(value.sources.map(row => row.key)).size === value.sources.length;
}

function SourceHistory({ source, revision }: { source: IncomeSourceKey; revision: number }) {
  const [history, setHistory] = useState<IncomeHistory | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState<number | undefined>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const timer = window.setTimeout(() => controller.abort(), 20000);
    setLoading(true); setError('');
    fetch(`/api/payout/income/history?${new URLSearchParams({ source, ...(page ? { before: String(page) } : {}) })}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => { if (!response.ok) throw Error('Income history could not load.'); const data: IncomeHistory = await response.json(); if (data.source !== source || !Array.isArray(data.entries) || !Array.isArray(data.withdrawals)) throw Error('Income history could not load.'); if (!controller.signal.aborted) { setHistory(current => ({ ...data, entries: page && current ? [...current.entries, ...data.entries].filter((entry, index, entries) => entries.findIndex(row => row.id === entry.id) === index) : data.entries })); } })
      .catch(() => { if (!disposed) setError(controller.signal.aborted ? 'History request timed out. Please retry.' : 'History is unavailable. Your balance is still shown.'); })
      .finally(() => { window.clearTimeout(timer); if (!disposed) setLoading(false); });
    return () => { disposed = true; window.clearTimeout(timer); controller.abort(); };
  }, [source, page, revision, retry]);
  return <div className={styles.history}>
    <div className={styles.subheading}><h4>Earning history</h4><span>Recorded credits and reversals</span></div>
    {loading && !history ? <p role="status">Loading earning history…</p> : null}
    {error ? <div role="alert"><p>{error}</p><button onClick={() => { setLoading(false); setRetry(value => value + 1); }}>Retry history</button></div> : null}
    {!loading && history && !history.entries.length ? <p className={styles.empty}>No earning entries yet. New verified activity will appear here.</p> : null}
    <ol className={styles.entries}>{history?.entries.map(entry => <li key={entry.id}><span className={styles.entryIcon} data-negative={entry.amount < 0}>{entry.amount < 0 ? <ArrowUpRight size={15}/> : <ArrowDownLeft size={15}/>}</span><span><strong>{entry.label}</strong><small>{dateLabel(entry.date)} · {entry.status.replace(/_/g, ' ').toLowerCase()}</small></span><b data-negative={entry.amount < 0}>{incomeMoney(entry.amount)}</b></li>)}</ol>
    {history?.nextCursor ? <button disabled={loading} onClick={() => setPage(history.nextCursor!)}>{loading ? 'Loading…' : 'Load older earnings'}</button> : null}
    {history?.withdrawals.length ? <><div className={styles.subheading}><h4>Recent withdrawals</h4><span>Amounts before withdrawal fees</span></div><ol className={styles.entries}>{history.withdrawals.map(entry => <li key={entry.id}><span><strong>{entry.label}</strong><small>{dateLabel(entry.date)} · {entry.status.replace(/_/g, ' ').toLowerCase()}</small></span><b>{incomeMoney(entry.amount)}</b></li>)}</ol></> : null}
  </div>;
}

function WithdrawalConfirmation({ source, busy, onClose, onConfirm }: { source: IncomeSource; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const dialog = useAccessibleDialog(true, () => { if (!busy) onClose(); });
  const amount = Math.floor(source.available * 100 + 0.000001) / 100;
  const fee = source.route === 'wallet' ? Math.round(amount * .02 * 100) / 100 : 0;
  return <div className={styles.overlay}><section ref={dialog as React.RefObject<HTMLElement | null>} role="dialog" aria-modal="true" aria-labelledby="source-withdrawal-title" tabIndex={-1} className={styles.confirmation}><header><h3 id="source-withdrawal-title">Review withdrawal</h3><button aria-label="Close withdrawal review" disabled={busy} onClick={onClose}><X size={17}/></button></header><p>{source.label} · your verified payout destination</p><dl><div><dt>Requested amount</dt><dd>{incomeMoney(amount)}</dd></div><div><dt>Withdrawal fee</dt><dd>{incomeMoney(fee)}{source.route === 'wallet' ? ' (2%)' : ''}</dd></div><div><dt>Expected payment</dt><dd>{incomeMoney(amount - fee)}</dd></div></dl><p>HYMN verifies your balance, destination and payout eligibility when you submit.</p><button className={styles.primary} disabled={busy} onClick={onConfirm}>{busy ? 'Submitting…' : 'Confirm withdrawal'}</button></section></div>;
}

export function IncomeSources({ onDistribution, onMoneyChanged }: { onDistribution?: () => void; onMoneyChanged?: () => void } = {}) {
  const [data, setData] = useState<IncomeSummary | null>(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [selected, setSelected] = useState(() => new Set<IncomeSourceKey>(INCOME_SOURCE_KEYS));
  const [focused, setFocused] = useState<IncomeSourceKey | null>(null);
  const [confirmation, setConfirmation] = useState<IncomeSourceKey | null>(null);
  const [revision, setRevision] = useState(0);
  const refreshRequest = useRef<AbortController | null>(null), sending = useRef(false);
  const refresh = useCallback(async () => {
    if (refreshRequest.current) return;
    const controller = new AbortController(); refreshRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    setRefreshing(true);
    try {
      const response = await fetch('/api/payout/income', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw Error('Could not refresh income sources.');
      const next: IncomeSummary = await response.json();
      if (!validSummary(next)) throw Error('Income data could not be verified.');
      if (!controller.signal.aborted) { setData(next); setError(''); setRevision(value => value + 1); }
    } catch { setError('Could not refresh income. Showing the last loaded figures, if available. Try again.'); }
    finally { window.clearTimeout(timeout); if (refreshRequest.current === controller) { refreshRequest.current = null; setRefreshing(false); } }
  }, []);
  useEffect(() => {
    void refresh();
    const update = () => { if (document.visibilityState !== 'hidden' && !sending.current) void refresh(); };
    const timer = window.setInterval(update, 60000);
    window.addEventListener('focus', update);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); refreshRequest.current?.abort(); refreshRequest.current = null; };
  }, [refresh]);
  const composition = incomeComposition(data?.sources ?? [], selected);
  const source = data?.sources.find(row => row.key === focused && selected.has(row.key)) ?? data?.sources.find(row => selected.has(row.key) && row.earned > 0) ?? data?.sources.find(row => selected.has(row.key));
  const confirmSource = data?.sources.find(row => row.key === confirmation);
  const block = source ? incomeWithdrawalBlock(source, !!data?.reconciliationRequired) : null;
  function toggle(key: IncomeSourceKey) { setSelected(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }
  async function withdraw() {
    if (!confirmSource || sending.current || uncertain || incomeWithdrawalBlock(confirmSource, !!data?.reconciliationRequired)) return;
    sending.current = true; setBusy(true); setFeedback('');
    refreshRequest.current?.abort(); refreshRequest.current = null; setRefreshing(false);
    const amount = Math.floor(confirmSource.available * 100 + .000001) / 100;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(confirmSource.route === 'referral' ? '/api/referrals/payouts' : '/api/payout/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceType: confirmSource.key, amount }), signal: controller.signal });
      if (response.status >= 500) throw Error('Unconfirmed withdrawal');
      const result = await response.json();
      if (!response.ok) { setConfirmation(null); setFeedback(result.error || 'Your request was not accepted. Review your payout details.'); await refresh(); return; }
      if (!(result.request?.id || result.payout?.id)) throw Error('Unconfirmed withdrawal');
      setData(current => current ? { ...current, sources: current.sources.map(row => ({ ...row, ...(row.key === confirmSource.key ? { available: Math.max(0, row.available - amount), held: row.held + amount } : {}), ...((confirmSource.route === 'wallet' && row.route === 'wallet') || row.key === confirmSource.key ? { requestPending: true } : {}) })) } : current);
      setConfirmation(null); setFeedback('Withdrawal accepted. Your funds are reserved; follow the request in recent withdrawals.'); setRevision(value => value + 1); onMoneyChanged?.(); await refresh();
    } catch { setUncertain(true); setConfirmation(null); setFeedback('The withdrawal outcome is unconfirmed. Review withdrawal activity before any further request. Automatic retry is disabled.'); }
    finally { window.clearTimeout(timeout); sending.current = false; setBusy(false); }
  }
  return <section className={styles.root} aria-label="Income by source">
    <header className={styles.heading}><div><p className={styles.kicker}><WalletCards size={15}/> THE EARNINGS EXPLORER</p><h2>Your income, in perspective.</h2><p className={styles.muted}>Choose your sources. Follow each share from earnings to payout.</p></div><button disabled={busy || refreshing} onClick={() => void refresh()} aria-label="Refresh income sources"><RefreshCw size={14}/>{refreshing ? 'Refreshing…' : 'Refresh sources'}</button></header>
    {error ? <p className={styles.notice} role="alert">{error}</p> : null}{feedback ? <p className={styles.notice} role="status">{feedback}</p> : null}
    {!data ? <div className={styles.loading} role="status">{error ? 'Income sources are unavailable. Use Refresh sources to try again.' : 'Loading your verified income…'}</div> : <>
      <div className={styles.metrics}><article><span>Recorded lifetime income</span><strong>{incomeMoney(composition.netTotal)}</strong><small>Across all earning sources</small></article><article><span>Selected in the chart</span><strong>{incomeMoney(composition.selectedTotal)}</strong><small>{percentage(composition.positiveTotal ? composition.selectedTotal / composition.positiveTotal : 0)} of positive recorded income</small></article><article><span>Income sources</span><strong>{data.sources.filter(row => selected.has(row.key)).length}<small> / {data.sources.length}</small></strong><small>Choose a slice to explore its activity</small></article></div>
      <div className={styles.workspace}>
        <div className={styles.composition}>
          <div className={styles.subheading}><h3>Where it comes from</h3><span>Lifetime · INR</span></div>
          <div className={styles.chartWrap}><svg viewBox="0 0 240 240" className={styles.donut} role="group" aria-label="Income composition chart"><circle cx="120" cy="120" r="89" fill="none" stroke="var(--border)" strokeWidth="28"/>{composition.slices.map(slice => <path key={slice.key} d={incomeSlicePath(slice.offset, slice.share, source?.key === slice.key)} fill={SOURCE_COLORS[slice.key]} role="button" tabIndex={0} aria-label={`${slice.label}: ${percentage(slice.share)} of total income`} aria-pressed={source?.key === slice.key} onClick={() => setFocused(slice.key)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setFocused(slice.key); } }}><title>{slice.label} · {incomeMoney(slice.earned)} · {percentage(slice.share)}</title></path>)}<text x="120" y="112" textAnchor="middle" className={styles.chartLabel}>{composition.positiveTotal ? 'SELECTED SHARE' : 'NO EARNINGS YET'}</text><text x="120" y="141" textAnchor="middle" className={styles.chartValue}>{percentage(composition.positiveTotal ? composition.selectedTotal / composition.positiveTotal : 0)}</text></svg></div>
          <p className={styles.chartNote}>{composition.hiddenShare > .00001 && composition.positiveTotal ? `Grey represents ${percentage(composition.hiddenShare)} of income from unselected sources. ` : ''}Percentages always use all positive recorded income; changing a selection does not change that total.</p>
          {composition.adjustments < 0 ? <p className={styles.notice}>Net negative source adjustments: {incomeMoney(composition.adjustments)}. Negative sources are listed below and do not form pie slices.</p> : null}
          <div className={styles.selectionActions}><span>Sources in chart</span><button onClick={() => setSelected(new Set(data.sources.map(row => row.key)))}>Select all</button><button onClick={() => setSelected(new Set())}>Clear selection</button></div>
          <div className={styles.sources}>{data.sources.map(row => <div key={row.key} className={styles.source} data-focused={source?.key === row.key} style={{ '--source-color': SOURCE_COLORS[row.key] } as CSSProperties}><label><input type="checkbox" checked={selected.has(row.key)} onChange={() => toggle(row.key)} aria-label={`Include ${row.label}`}/><span className={styles.swatch}/><span>{row.label}</span></label><button onClick={() => { setSelected(current => new Set([...current, row.key])); setFocused(row.key); }} aria-label={`Explore ${row.label}`}><strong>{incomeMoney(row.earned)}</strong><small>{percentage(composition.positiveTotal ? Math.max(0, row.earned) / composition.positiveTotal : 0)} of total <ChevronRight size={12}/></small></button></div>)}</div>
        </div>
        <section className={styles.detail} aria-label="Selected income source details" aria-live="polite">{source ? <>
          <div className={styles.detailHeading}><span className={styles.kicker}>SOURCE DETAIL</span><h3><i style={{ background: SOURCE_COLORS[source.key] }}/>{source.label}</h3><p>{percentage(composition.positiveTotal ? Math.max(0, source.earned) / composition.positiveTotal : 0)} of total positive income</p></div>
          <div className={styles.detailMetrics}>{[['Earned', source.earned], ['Available', source.available], ['Held / reserved', source.held], ['Paid before fees', source.paid]].map(([label, amount]) => <div key={String(label)}><span>{label}</span><strong>{incomeMoney(Number(amount))}</strong></div>)}</div>
          {source.key === 'artist_royalty' ? <div className={styles.routeCard}><span className={styles.kicker}>DISTRIBUTION PAYOUTS</span><h4>Partner reporting. A separate payout journey.</h4><p>Your royalties depend on verified distribution reports, currency conversion and the payout window. Manage them in the dedicated workspace below.</p><button className={styles.primary} onClick={onDistribution ?? (() => document.getElementById('distribution-payouts')?.scrollIntoView({ behavior: 'smooth' }))}>Open distribution payouts<ArrowUpRight size={15}/></button></div> : <div className={styles.routeCard}><div className={styles.subheading}><h4>Withdrawal readiness</h4><span>Minimum {incomeMoney(source.minimum)}</span></div><progress max={Math.max(1, source.minimum)} value={Math.max(0, Math.min(source.minimum, source.available))} aria-label={`${source.label} minimum payout progress`}/><p>{block || 'Your cleared source balance meets the minimum. Review your request before submitting.'}</p>{source.route !== 'curator' ? <button className={styles.primary} disabled={busy || uncertain || !!block} onClick={() => setConfirmation(source.key)}>Review withdrawal <ArrowUpRight size={15}/></button> : <a href="/dashboard/playlists">View curator settlements<ArrowUpRight size={15}/></a>}<small>{source.route === 'wallet' ? '2% withdrawal fee. Paid amounts above are before that fee.' : source.route === 'referral' ? 'Only cleared commissions can be withdrawn. Pending commissions keep their 14-day hold.' : 'Cleared reviews are settled by HYMN finance as one batch.'}</small></div>}
          <SourceHistory key={`${source.key}-${revision}`} source={source.key} revision={revision}/>
        </> : <div className={styles.empty}><h3>Choose an income source</h3><p>Select a source above to explore its earnings, history and withdrawals.</p><button onClick={() => setSelected(new Set(data.sources.map(row => row.key)))}>Select all sources</button></div>}</section>
      </div>
      <footer className={styles.footer}><span><Check size={14}/> Verified records · INR amounts</span><p>HYMN checkout credit: <strong>{incomeMoney(data.checkoutCredit)}</strong>. Spending credit is separate from earned, withdrawable cash.</p></footer>
      {data.reconciliationRequired ? <p className={styles.notice} role="status">Some historical wallet withdrawals need finance reconciliation. Wallet withdrawals are locked until the allocation is verified; independent referral and curator records remain visible.</p> : null}
    </>}
    {confirmSource ? <WithdrawalConfirmation source={confirmSource} busy={busy} onClose={() => setConfirmation(null)} onConfirm={() => void withdraw()}/> : null}
  </section>;
}
