import { commissionMinor, netReferralAmounts, REFERRAL_COMMISSION_RATES, REFERRAL_NETWORK_RATES_BPS, REFERRAL_NET_NETWORK_RATES_BPS, type ReferralCommissionCategory } from './referral-commission-policy';
export type CalculatorPolicy = { enabled: boolean; mode: 'net' | 'legacy'; rateBps: number; networkEnabled: boolean; minimumPayoutMinor?: number };
export type CalculatorPurchase = { id: string; category: ReferralCommissionCategory; quantity: number; baseMinor: number };
export function referralScenario(friends: number, branching: number, purchases: CalculatorPurchase[], policy: CalculatorPolicy) {
  if (!Number.isInteger(friends) || friends < 0 || friends > 1000 || !Number.isInteger(branching) || branching < 0 || branching > 5) throw Error('Invalid referral scenario.');
  if (!Number.isInteger(policy.rateBps) || policy.rateBps < 0 || policy.rateBps > 10000) throw Error('Invalid programme rate.');
  const levels = Array.from({ length: 7 }, (_, n) => ({ level: n + 1, people: friends * branching ** n, amount: 0 }));
  const sources = purchases.map(purchase => {
    if (!(purchase.category in REFERRAL_COMMISSION_RATES) || !Number.isInteger(purchase.quantity) || purchase.quantity < 0 || purchase.quantity > 100 || !Number.isSafeInteger(purchase.baseMinor) || purchase.baseMinor < 0 || purchase.baseMinor > 10000000) throw Error('Invalid purchase assumptions.');
    const rateBps = policy.mode === 'net' ? policy.rateBps : REFERRAL_COMMISSION_RATES[purchase.category];
    const unit = policy.enabled ? commissionMinor(purchase.baseMinor, rateBps) : 0;
    const direct = unit * purchase.quantity * friends;
    let network = 0;
    levels[0].amount += direct;
    // Do not assume room within legacy marketplace caps without gross-payment evidence.
    let budget = policy.mode === 'legacy' && ['beats', 'studio'].includes(purchase.category) ? 0 : Math.max(0, purchase.baseMinor - unit);
    const netRewards = policy.mode === 'net' && policy.rateBps === 200 ? netReferralAmounts(purchase.baseMinor, purchase.baseMinor, rateBps, REFERRAL_NET_NETWORK_RATES_BPS) : [];
    for (let i = 1; i < levels.length; i++) {
      const perPayment = policy.enabled && policy.networkEnabled ? policy.mode === 'net' ? netRewards[i] ?? 0 : Math.min(budget, commissionMinor(unit, REFERRAL_NETWORK_RATES_BPS[i])) : 0;
      budget -= perPayment;
      const reward = perPayment * purchase.quantity * levels[i].people;
      levels[i].amount += reward; network += reward;
    }
    return { id: purchase.id, rateBps, unit, direct, network, total: direct + network };
  });
  const direct = sources.reduce((n, s) => n + s.direct, 0), network = sources.reduce((n, s) => n + s.network, 0);
  return { direct, network, total: direct + network, sources, levels };
}
