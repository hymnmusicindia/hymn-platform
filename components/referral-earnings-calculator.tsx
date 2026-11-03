"use client";
import { useId, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, TrendingUp } from 'lucide-react';
import { distributionPlanCards } from '@/lib/distribution-plans';
import { commissionMinor, REFERRAL_COMMISSION_RATES, REFERRAL_HOLD_DAYS, REFERRAL_MINIMUM_PAYOUT_MINOR } from '@/lib/referral-commission-policy';
import '@/app/styles/referral-calculator.css';
const money = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n / 100);
export function ReferralEarningsCalculator({ showLink = false }: { showLink?: boolean }) {
  const id = useId();
  const [planKey, setPlanKey] = useState('yearly_plus');
  const [purchases, setPurchases] = useState(10);
  const plan = distributionPlanCards.find(p => p.key === planKey)!;
  const rate = REFERRAL_COMMISSION_RATES[plan.key];
  const perPurchase = commissionMinor(plan.price * 100, rate);
  const estimate = perPurchase * purchases;
  const target = Math.ceil(REFERRAL_MINIMUM_PAYOUT_MINOR / perPurchase);
  return <section className="referral-calculator" aria-labelledby={`${id}-title`}>
    <div className="referral-calculator-controls"><p className="referral-calculator-kicker"><TrendingUp size={16}/> YOUR NEXT OPPORTUNITY</p>
      <h2 id={`${id}-title`}>Your recommendation.<br/>Their next release.</h2><p>See what introducing artists to HYMN could earn you.</p>
      <label htmlFor={`${id}-plan`}>What would your friends choose?</label>
      <select id={`${id}-plan`} value={planKey} onChange={e => setPlanKey(e.target.value)}>{distributionPlanCards.map(p => <option key={p.key} value={p.key}>{p.title} · {money(p.price * 100)}</option>)}</select>
      <div className="referral-calculator-count"><label htmlFor={`${id}-count`}>Eligible paid purchases</label><input id={`${id}-count`} type="number" min="0" max="10000" step="1" value={purchases} onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 0 && n <= 10000) setPurchases(n); }}/></div>
      <input aria-label="Explore purchase count" type="range" min="0" max={Math.max(100, purchases)} step="1" value={purchases} onChange={e => setPurchases(Number(e.target.value))}/>
      <div className="referral-calculator-presets">{[5, 10, 25, 50].map(n => <button key={n} type="button" aria-pressed={purchases === n} onClick={() => setPurchases(n)}>{n} purchases</button>)}</div>
    </div>
    <div className="referral-calculator-result"><span>ESTIMATED DIRECT COMMISSION</span><output aria-live="polite" htmlFor={`${id}-plan ${id}-count`}>{money(estimate)}</output>
      <p>{purchases} paid purchases × {money(perPurchase)} each</p>
      <div className="referral-calculator-rate"><strong>{rate / 100}%</strong><span>of each eligible {plan.title} payment<br/>at today’s base price</span></div>
      <p className="referral-calculator-milestone">{target} qualifying purchases at this price could reach the {money(REFERRAL_MINIMUM_PAYOUT_MINOR)} withdrawal minimum.</p>
      {showLink && <Link href="/dashboard?tab=referral">Get your referral link <ArrowUpRight size={17}/></Link>}
    </div>
    <small className="referral-calculator-disclosure">An illustration, not promised income. Purchases must be paid, eligible and approved through an active referral connection. Discounts, refunds and reversals change earnings. A {REFERRAL_HOLD_DAYS}-day hold, verified payout details and {money(REFERRAL_MINIMUM_PAYOUT_MINOR)} withdrawal minimum apply. Renewals can earn again when eligible; they are not assumed in this estimate.</small>
  </section>;
}
