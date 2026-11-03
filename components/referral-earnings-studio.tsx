"use client";
import { useEffect, useId, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowUpRight, AudioLines, Disc3, Headphones, Info, LoaderCircle, Minus, Plus, RefreshCw, Repeat2, Sparkles, Users } from 'lucide-react';
import { QuantitySlider } from '@/components/ui/quantity-slider';
import { referralScenario, type CalculatorPolicy, type CalculatorPurchase } from '@/lib/referral-calculator';
import { distributionPlanCards } from '@/lib/distribution-plans';
import { REFERRAL_HOLD_DAYS, REFERRAL_MINIMUM_PAYOUT_MINOR, REFERRAL_NETWORK_RATES_BPS, REFERRAL_NET_NETWORK_RATES_BPS } from '@/lib/referral-commission-policy';
import '@/app/styles/referral-calculator.css';
const money = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n / 100);
const count = (n: number) => n.toLocaleString('en-IN');
const kinds = [
  { id: 'releases', name: 'Releases', Icon: Disc3, color: '#75bfa3', category: 'one_time', net: 5000, legacy: 9900 },
  { id: 'plans', name: 'Subscriptions', Icon: AudioLines, color: '#b6a0db', category: 'yearly_plus', net: 100000, legacy: 199900 },
  { id: 'beats', name: 'Beats', Icon: Headphones, color: '#dfa36c', category: 'beats', net: 10000, legacy: 10000 },
  { id: 'studio', name: 'Studio', Icon: Sparkles, color: '#76b3de', category: 'studio', net: 30000, legacy: 30000 },
  { id: 'renewals', name: 'Renewals', Icon: Repeat2, color: '#d68fa5', category: 'yearly_plus', net: 100000, legacy: 199900 }
] as const;
function NumberStepper({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (n: number) => void }) {
  return <div className="earn-stepper"><button type="button" disabled={!value} aria-label={`Decrease ${label}`} onClick={() => onChange(value - 1)}><Minus size={13}/></button><input type="number" aria-label={label} min={0} max={max} step={1} value={value} onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 0 && n <= max) onChange(n); }}/><button type="button" disabled={value >= max} aria-label={`Increase ${label}`} onClick={() => onChange(value + 1)}><Plus size={13}/></button></div>;
}
export function ReferralEarningsCalculator({ showLink = false }: { showLink?: boolean }) {
  const id = useId();
  const [policy, setPolicy] = useState<CalculatorPolicy | null>(null), [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  const [friends, setFriends] = useState(25), [branching, setBranching] = useState(0);
  const [friendsMax, setFriendsMax] = useState(200);
  const changeFriends = (n: number) => { setFriends(n); setFriendsMax(max => Math.max(max, Math.ceil(n / 200) * 200)); };
  const [view, setView] = useState<'mix' | 'network'>('mix'), [active, setActive] = useState('plans');
  const [purchases, setPurchases] = useState<CalculatorPurchase[]>([]);
  const [stickyTop, setStickyTop] = useState(120);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('[data-site-header]');
    if (!header) return;
    const update = () => setStickyTop(Math.ceil(header.getBoundingClientRect().height) + 10);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update); observer.observe(header);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const controller = new AbortController(); setError(false);
    const timeout = setTimeout(() => { controller.abort(); setError(true); }, 15000);
    fetch('/api/referrals/calculator', { cache: 'no-store', signal: controller.signal }).then(async r => {
      if (!r.ok) throw Error('Unavailable'); const data = await r.json();
      const p = data.policy as CalculatorPolicy;
      if (!['net', 'legacy'].includes(p.mode) || typeof p.networkEnabled !== 'boolean' || typeof p.enabled !== 'boolean' || !Number.isInteger(p.rateBps) || p.rateBps < 0 || p.rateBps > 10000) throw Error('Invalid policy');
      if (controller.signal.aborted) return;
      setPolicy(p); setPurchases(kinds.map(k => ({ id: k.id, category: k.category, quantity: k.id === 'releases' ? 2 : ['plans', 'beats'].includes(k.id) ? 1 : 0, baseMinor: p.mode === 'net' ? k.net : k.legacy })));
    }).catch(() => { if (!controller.signal.aborted) setError(true); }).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [attempt]);
  const change = (key: string, patch: Partial<CalculatorPurchase>) => setPurchases(rows => rows.map(row => row.id === key ? { ...row, ...patch } : row));
  const result = policy ? referralScenario(friends, branching, purchases, policy) : null;
  const networkRates = policy?.mode === 'net' ? REFERRAL_NET_NETWORK_RATES_BPS : REFERRAL_NETWORK_RATES_BPS;
  const selected = purchases.find(p => p.id === active), kind = kinds.find(k => k.id === active)!;
  const maxBase = selected?.category === 'one_time' ? 9900 : ['half_yearly', 'yearly', 'yearly_plus'].includes(selected?.category || '') ? (distributionPlanCards.find(p => p.key === selected?.category)?.price || 1999) * 100 : 1000000;
  let stop = 0;
  const segments = kinds.map(k => { const amount = result?.sources.find(s => s.id === k.id)?.total || 0; const start = stop; stop += result?.total ? amount / result.total * 100 : 0; return `${k.color} ${start}% ${stop}%`; });
  return <section className="referral-calculator" aria-labelledby={`${id}-title`} style={{ '--earn-sticky-top': `${stickyTop}px` } as CSSProperties}>
    <header className="earn-heading"><div><p className="earn-eyebrow"><Sparkles size={14}/> THE POWER OF YOUR CIRCLE</p><h2 id={`${id}-title`}>One link. More ways to earn.</h2><p>Every eligible purchase. Not just their first.</p></div><span className="earn-badge"><Repeat2 size={13}/> Repeat purchases count</span></header>
    {!result || !policy || !selected ? <div className="earn-loading" role="status">{error ? <><p>Estimates are temporarily unavailable.</p><button type="button" onClick={() => setAttempt(n => n + 1)}><RefreshCw size={15}/> Try again</button></> : <><LoaderCircle size={26} className="animate-spin"/><p>Loading programme rates…</p></>}</div> : <>
      <div className="earn-mobile-summary"><span>Estimated earnings</span><strong>{money(result.total)}</strong></div>
      <div className="earn-workbench"><div className="earn-controls">
        <div className="earn-people"><div><span className="earn-step-number">01</span><span>Paying referrals</span></div><NumberStepper label="Paying referrals" value={friends} max={1000} onChange={changeFriends}/></div>
        <QuantitySlider label="Paying referrals slider" value={friends} max={friendsMax} onChange={changeFriends} markers={[{ value: 10, label: '10 people' }, { value: 50, label: '50 people' }, { value: 200, label: '200 people' }]}/>
        <div className="earn-view-tabs" role="group" aria-label="Calculator view"><button type="button" aria-pressed={view === 'mix'} onClick={() => setView('mix')}><Disc3 size={14}/> Purchase mix</button><button type="button" aria-pressed={view === 'network'} onClick={() => setView('network')}><Users size={14}/> Your network</button></div>
        {view === 'mix' ? <>
          <div className="earn-section-title"><span className="earn-step-number">02</span><span>What they purchase</span><small>per person</small></div>
          <div className="earn-source-list">{kinds.map(k => { const row = purchases.find(p => p.id === k.id)!; return <div key={k.id} className="earn-source-row" data-active={active === k.id} data-enabled={row.quantity > 0} style={{ '--source-color': k.color } as CSSProperties}><button type="button" className="earn-source-select" aria-pressed={active === k.id} onClick={() => setActive(k.id)}><span><k.Icon size={17}/></span><strong>{k.name}</strong></button><NumberStepper label={`${k.name} purchases per person`} value={row.quantity} max={100} onChange={quantity => change(k.id, { quantity })}/></div>; })}</div>
          <div className="earn-purchase-editor"><div className="earn-editor-heading"><span>{kind.name}</span><span className="earn-rate">{result.sources.find(s => s.id === active)!.rateBps / 100}%</span></div>
            {['plans', 'renewals'].includes(active) && <select aria-label={`${kind.name} plan`} value={selected.category} onChange={e => { const plan = distributionPlanCards.find(p => p.key === e.target.value)!; change(active, { category: plan.key, baseMinor: policy.mode === 'net' ? Math.min(selected.baseMinor, plan.price * 100) : plan.price * 100 }); }}>{distributionPlanCards.filter(p => p.key !== 'one_time').map(p => <option key={p.key} value={p.key}>{p.title}</option>)}</select>}
            <div className="earn-price-heading"><label htmlFor={`${id}-amount`}>{policy.mode === 'net' ? 'HYMN net / purchase' : ['beats', 'studio'].includes(selected.category) ? 'HYMN share / purchase' : 'Payment / purchase'}</label><div className="earn-price-field"><span>₹</span><input id={`${id}-amount`} aria-label="Estimated eligible amount per purchase" type="number" min={0} max={maxBase / 100} step="0.01" value={selected.baseMinor / 100} onChange={e => { const n = Math.round(Number(e.target.value) * 100); if (Number.isSafeInteger(n) && n >= 0 && n <= maxBase) change(active, { baseMinor: n }); }}/></div></div>
            <QuantitySlider label="Estimated eligible amount slider" value={selected.baseMinor} max={maxBase} step={1} onChange={baseMinor => change(active, { baseMinor })} format={money}/>
            <small><Info size={12}/>{policy.mode === 'net' ? 'Example net after costs. Edit your assumption.' : ['beats', 'studio'].includes(selected.category) ? 'HYMN’s share only; seller earnings stay separate.' : 'Use the actual eligible payment amount.'}</small>
          </div>
        </> : <div className="earn-network-editor"><div className="earn-section-title"><span className="earn-step-number">02</span><span>When your circle grows</span></div>
          <div className="earn-people"><span>Buyers per referral</span><NumberStepper label="Buyers per referral" value={branching} max={5} onChange={setBranching}/></div>
          <QuantitySlider label="Buyers per referral slider" value={branching} max={5} onChange={setBranching}/>
          <div className="earn-network-tree"><div className="earn-tree-you"><span>H</span><strong>You</strong></div>{result.levels.slice(0, 3).map(level => <div className="earn-tree-level" key={level.level}><span className="earn-tree-line"/><div><Users size={15}/><strong>{count(level.people)}</strong><span>{level.level === 1 ? 'your referrals' : `level ${level.level}`}<small>{level.level === 1 ? policy.mode === 'net' ? `${policy.rateBps / 100}% of net` : 'Direct reward' : policy.networkEnabled ? `${networkRates[level.level - 1] / 100}% of direct` : 'Connections only'}</small></span><b>{money(level.amount)}</b></div></div>)}</div>
          {policy.networkEnabled ? <details className="earn-deep-levels"><summary>See levels 4–7</summary>{result.levels.slice(3).map(level => <div key={level.level}><span>Level {level.level} · {count(level.people)} people</span><strong>{money(level.amount)}</strong></div>)}</details> : <p className="earn-network-status">Network payouts are not enabled under the current programme.</p>}
          <small>Illustrative connections, not a growth forecast. Only eligible purchases earn.</small>
        </div>}
      </div>
      <aside className="earn-result" aria-label="Estimated earnings"><div className="earn-result-label"><span>YOUR SCENARIO</span><span>Illustration</span></div>
        <div className="earn-donut" style={{ background: `conic-gradient(${result.total ? segments.join(',') : '#405158 0% 100%'})` }}><div><span>Estimated earnings</span><output aria-live="polite">{money(result.total)}</output><small>{count(friends)} direct buyers</small></div></div>
        <div className="earn-split"><div><span>Direct</span><strong>{money(result.direct)}</strong></div><div><span>Network</span><strong>{money(result.network)}</strong></div></div>
        <div className="earn-breakdown">{kinds.map(k => <div key={k.id}><span><i style={{ background: k.color }}/>{k.name}</span><strong>{money(result.sources.find(s => s.id === k.id)!.total)}</strong></div>)}</div>
        <div className="earn-payout-goal"><div><span>Withdrawal milestone</span><strong>{money(REFERRAL_MINIMUM_PAYOUT_MINOR)}</strong></div><div className="earn-goal-track"><span style={{ width: `${Math.min(100, result.total / REFERRAL_MINIMUM_PAYOUT_MINOR * 100)}%` }}/></div><small>{result.total >= REFERRAL_MINIMUM_PAYOUT_MINOR ? 'Your scenario reaches the minimum. Payment checks still apply.' : `${money(REFERRAL_MINIMUM_PAYOUT_MINOR - result.total)} to the minimum in this scenario.`}</small></div>
        {showLink && <Link className="earn-start" href="/dashboard?tab=referral">Start with your link <ArrowUpRight size={16}/></Link>}
      </aside></div>
      <footer className="earn-footer"><span><Repeat2 size={13}/> Eligible repeat purchases & renewals</span><span>{REFERRAL_HOLD_DAYS}-day hold</span><span>{money(REFERRAL_MINIMUM_PAYOUT_MINOR)} minimum withdrawal</span></footer>
      <details className="earn-method"><summary><Info size={13}/> How this estimate works</summary><div><p>These are editable examples, not actual customer purchases or promised income. {policy.mode === 'net' ? `The standard rate is ${policy.rateBps / 100}% of verified eligible HYMN net revenue after taxes, refunds, pass-through costs and fees.` : 'Category rates apply to eligible collected payments; marketplace rates use HYMN’s recorded share.'} Your connection’s saved terms and eligibility apply.</p><p>{policy.networkEnabled ? `Level 2 earns ${networkRates[1] / 100}% of the purchase’s direct commission; levels 3–7 earn ${networkRates[2] / 100}% each. These are shares of commission, not percentages of the order price. The original referrer keeps their direct commission.` : 'The current policy pays direct commissions only. The diagram shows connections; it does not add network earnings.'} All selected quantities apply per person; future renewals are counted only when you add them.</p><p>Only active, eligible connections and approved payments qualify. Self-purchases, free credits and royalties are excluded. Refunds and disputes can reduce earnings; a verified payout profile is required. Marketplace network estimates under legacy terms are excluded where the gross-payment cap cannot be verified.</p></div></details>
    </>}
  </section>;
}
