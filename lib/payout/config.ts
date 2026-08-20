const DEFAULT_MINIMUM_PAYOUT_USD = 105;
const DEFAULT_REFRESH_HOURS = 24;

function positiveNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number.`);
  return value;
}

export const PAYOUT_CONFIG = Object.freeze({
  minimumPayoutUsd: positiveNumber("MINIMUM_PAYOUT_USD", DEFAULT_MINIMUM_PAYOUT_USD),
  exchangeRateRefreshHours: positiveNumber("FX_RATE_REFRESH_HOURS", DEFAULT_REFRESH_HOURS),
  payoutServiceFeePercent: 2
});


// vercel trigger 12
