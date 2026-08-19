export const FRAUD_STATUSES = ["new", "under_review", "escalated", "monitoring", "action_required", "resolved", "false_positive", "closed"] as const;
export const FRAUD_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const FRAUD_CATEGORIES = ["artificial_streaming", "payment_fraud", "chargeback_risk", "payout_fraud", "identity_mismatch", "account_takeover", "duplicate_account", "metadata_manipulation", "copyright_ownership", "split_abuse", "beat_store_abuse", "license_fraud", "revenue_report_anomaly", "duplicate_identifier", "file_reuse", "suspicious_device_activity", "referral_abuse", "promo_abuse", "admin_override_anomaly", "other"] as const;
export function severityForScore(score: number) { return score >= 75 ? "critical" : score >= 50 ? "high" : score >= 30 ? "medium" : "low"; }
export function safePage(value: string | null) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 10_000) : 1; }
export function adminActorId(admin: object) { return "sub" in admin ? Number((admin as { sub: unknown }).sub) : 0; }

// vercel trigger 14
