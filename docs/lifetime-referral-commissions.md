# Lifetime referral commissions

Referral owners earn withdrawable INR commission on each eligible future purchase by their referred account. Attribution has no time expiry. This is separate from HYMN spending credits, artist royalties and producer/engineer earnings.

| Purchase | Rate | Basis | Example |
| --- | --- | --- | --- |
| One-time release | 10% | Cash collected after discounts/credits | ₹99 → ₹9.90 |
| Half-yearly plan, including renewals | 8% | Cash collected | ₹699 → ₹55.92 |
| Yearly plan, including renewals | 7% | Cash collected | ₹1,099 → ₹76.93 |
| Yearly+ plan, including renewals | 5% | Cash collected | ₹1,999 → ₹99.95 |
| Beats | 20% | Recorded HYMN platform share only | ₹100 sale, ₹30 HYMN share → ₹6 |
| Studio, including paid revisions/amendments | 15% | Recorded HYMN platform share only | ₹2,000 purchase, ₹400 HYMN share → ₹60 |

These are business policy choices, not externally prescribed rates. Lower subscription rates reflect higher allowances; marketplace rates share HYMN's margin without reducing seller entitlements. Gateway costs and operating expenses remain HYMN's responsibility; the commission basis is collected cash/platform share, not an estimate of profit after fees or tax.

## Accounting and controls

- Rates are stored on the referral and on each commission. Subscription payment records snapshot the purchased plan, preserving the rate if the account later changes plan.
- One referrer per account; existing self/circular/duplicate attribution checks remain. Existing valid referrals earn on future qualifying purchases. Existing credit promises retain their old policy; new signups use lifetime terms.
- Only persisted paid/captured INR payments with provider payment IDs qualify. Credit-only purchases, free allowances, failed/unpaid purchases, test-key mode and self-purchases do not. No retroactive commission on purchases created before the migration's UTC launch timestamp.
- A unique payment ID plus source identity prevent browser/webhook/reconciliation replays from paying twice. Amounts use integer paise; commissions round down to paise.
- Each commission starts with a 14-day hold. Cleared entries become available automatically through the authenticated referral reconciliation cron, or in bounded batches when requesting payout.
- Verified refund events reduce commission proportionally; multiple refunds accumulate, duplicate refund IDs do not. Refund-pending, disputes and account/risk reviews hold funds. Lost disputes reverse commission. Late refund entries arriving before capture are checked when commission is created.
- Withdrawal requires an active account, verified payout profile and ₹500 cleared commission. Requests reserve the entire cleared balance atomically, and only one request may remain pending. Payment destinations are snapshotted with the existing encrypted payout credentials; public APIs expose no bank secrets.
- Admin records an externally completed bank/UPI transfer with a unique reference and review note. This implementation does not automatically initiate Razorpay Route or bank transfers. Recent admin authentication and `payouts.review` are required.
- Refunds after withdrawal create an offset against future earnings; unpaid requests whose amount is no longer funded must be rejected and recreated. Financial changes create audit entries; requests and recorded payments remain separate.

## Deployment

1. Deploy migration `20261012130000_lifetime_referral_commissions` through `npm run db:migrate:deploy` (or the existing `build:release` pipeline) **before starting the new application**. The migration adds tables/columns, freezes rates for existing referrals and records the launch timestamp; it does not issue rewards or transfer money.
2. Build with the regenerated Prisma client and restart the app. Restricted runtime roles need SELECT/INSERT/UPDATE on the new tables and USAGE on their sequences through the deployment's normal grants.
3. Schedule `GET /api/cron/referral-reconciliation` with `Authorization: Bearer <CRON_SECRET>` every 10 minutes. The job is bounded and retryable; repeated runs drain larger queues. Keep existing signed Razorpay capture/refund/dispute webhooks and payment reconciliation scheduled.
4. Referral earnings appear in the existing referral centre. Admin queue: `/admin/referrals/payouts`, linked from `/admin/referrals`. Customers configure their existing payout profile before requesting withdrawal.

No production migration, charge, bank transfer or commission payout was performed during implementation.

## Validation

`node --import tsx scripts/verify-referrals-isolated.ts` validates actual migration SQL and UTC cutover, historical reward compatibility, repeat releases, hybrid payment basis, renewals, plan snapshots, beat and Studio shares, replay, refunds, hold periods, profile checks, concurrent payout reservation, rejection, recorded payment and post-payout recovery in an isolated local database.

`node --import tsx scripts/verify-referral-commissions-browser.ts` validates mobile/desktop UI, withdrawal errors/retry, paginated commissions and payout history. No live gateway credentials or emails are used by these fixtures.

Provider design reference: [Razorpay Route](https://razorpay.com/route/) separates transfers, settlement holds and reversals. The commission ledger intentionally records liabilities independently of transfers so refund corrections remain visible.
