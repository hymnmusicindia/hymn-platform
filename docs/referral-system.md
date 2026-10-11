# Referral system audit and revamp

The sidebar uses a shared footer on home and workspace pages: Help & support, Refer a friend (gift), and More links (Terms of service, Privacy, Policy center, Contact). The footer stays outside the scrolling service navigation; links close mobile navigation. The policy disclosure closes with Escape or an outside click.

## Research and choices

- [Dropbox referral help](https://help.dropbox.com/storage-space/earn-space-referring-friends): personal invite links, single attribution, eligibility conditions, and visible referral stages. HYMN uses link/code sharing and explicit joined, verifying, earned, ineligible, reversal and review states.
- [Viral Loops authorized conversions](https://developers.viral-loops.com/docs/how-to-secure-your-campaign-with-authorized-conversions): valuable rewards should be authorized by the backend. Sharing telemetry never qualifies or grants a HYMN reward; a verified persisted payment does.
- [Stripe customer credit balance](https://docs.stripe.com/billing/customer/balance): transaction history supports tracking changes to a credit balance. HYMN retains append-only reward/redemption/reversal entries and keeps promotional credit separate from royalty balances.

These patterns informed the implementation. HYMN's existing reward economics remain in place; these references do not define HYMN's terms.

## Corrected inconsistencies

- The onboarding prompt and application API now both use a 24-hour window, before an order or subscription payment. Formerly the prompt appeared for seven days and subscription payments were omitted from lockout.
- Referral assignment and code generation are serialized for an account. Duplicate, self, inactive-account, partner-conflict and circular attribution are rejected. The ancestry check detects longer referral cycles.
- New referrals retain their reward-policy snapshot. Recurring purchases qualify only when captured, positive-value, INR, and eligible under that snapshot; known adverse payment events block qualification/approval. Qualification is recoverable independently of growth analytics.
- Administrative approval retains the verification period, active-account check, clear review status, row lock, and unique ledger key. It issues one reward and a notification. Reward emails use actual stored amounts and escaped shared templates, omit zero-value friend bonuses, and use stable per-recipient event keys. Failed email delivery remains visible in existing email logs/admin retry tools; email failure cannot roll back a credit grant.
- Subscription refund/dispute events now reach referral review. Refund values are read from the refund entity instead of an attached original payment. Full reversals reject unapproved referrals or reverse approved rewards once. Partial refunds and disputes require review; spent rewards raise the existing fraud alert rather than making balances negative. Original ledger entries are retained.
- Reversal and legacy grants lock user balances in deterministic ID order. Reversals preserve the original credit bucket.
- Admin totals now aggregate stored reward amounts and full-population counts, replacing a hard-coded eight-rupee calculation and limited-page totals.
- FAQ answers match the current recurring-plan policy and distinguish older referral terms. New referrals do not promise the obsolete separate three-rupee friend bonus.
- Tracking and mutation routes validate origin and tracking is rate limited. Personal dashboard responses are private/no-store. History uses ownership-scoped cursor pagination; no recipient names or full emails are exposed to referrers.

## Customer experience

Personal invitation link and permanent code, copy/WhatsApp/native share, copy/share failure feedback, retryable loading, progress explanations and verification dates, potential versus earned amounts, filtered referral history, paginated credit history, refresh, empty states and expandable rules. Sharing cancellation is quiet. Mobile layouts work at 320px and 390px.

Credit remains usable where checkout offers credit redemption. This module does not turn promotional credit into a cash payout, change the reward policy, or automatically approve rewards. Refund/dispute review stays conservative; an adverse provider event is not automatically cleared by a later captured-payment replay.

## Operations and verification

`/api/cron/referral-reconciliation` uses CRON_SECRET and the existing Vercel scheduler, hourly at minute 40. It recovers pending recurring-purchase qualification without requiring analytics to be enabled. It never approves rewards or adjusts balances. No schema migration is required.

- `node --import tsx scripts/verify-referrals-isolated.ts`: temporary local PostgreSQL, email and analytics disabled. Covers onboarding, self/duplicate/circular attribution, policy snapshots, verification periods, concurrent approval, genuine partial-refund webhook processing, full/duplicate reversals, rejection, spent-credit review, and recovery.
- `node --import tsx scripts/verify-referrals-browser.ts`: mocked APIs, responsive layouts, loading retry, sharing, filtering, history, and footer policy controls.
- `node --import tsx scripts/verify-workspace-navigation.ts`: canonical navigation and footer visibility in the real public workspace layout.

Existing live credits and historical referrals are not rewritten. The older `verify-referral-integration.ts` now delegates to the isolated runner instead of creating fixtures against the configured application database. Legacy five/three-rupee grants and reversals are verified alongside new recurring-plan referrals.
