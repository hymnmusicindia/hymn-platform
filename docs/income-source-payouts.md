# Income sources and withdrawals

Distribution royalties retain the configured USD minimum (default $105), exchange-rate freshness checks and quarterly withdrawal window. Referrals require INR 1,500 after their existing 14-day hold. Mixing/mastering, beat sales and other wallet income require INR 3,000. Curator settlements require INR 1,500 after the existing seven-day dispute hold.

The service minimum is approximately two completed INR 1,999 mixing jobs after the existing 20% platform fee. Smaller referral and curator payments accumulate to INR 1,500. These thresholds govern future requests; existing requests are not repriced or cancelled. Wallet withdrawal fees remain 2%; other routes retain their existing rules.

`/api/payout/income` provides the authenticated account's source breakdown. Studio and beat credits/reversals come from wallet transaction types. Approved manual adjustments populate Other. The remaining wallet lifetime earnings are distribution royalties. Promotional checkout credits are displayed separately and never enter withdrawal availability. Referral commissions and curator reviews are read from their own ledgers and are not credited again to the wallet.

Requested and completed wallet payouts are deducted from their persisted source. Rejected, failed and cancelled reservations are excluded. Route transfers reserve their recorded studio or beat source, including settled transfers, so that funds cannot be withdrawn twice. Historical mixed/unrecognised payouts or negative source balances require reconciliation; source withdrawals are blocked instead of guessing an allocation. Finance must resolve these using audited source evidence.

Wallet request validation runs while holding the existing wallet row lock. It checks the selected source and shared wallet balance, minimum, verified destination, and existing active request. Referral withdrawals retain their existing transaction and hold checks.

Curator settlement records the entire eligible cleared batch for the same curator. Finance must first transfer the full batch amount and enter that exact INR amount plus the actual bank reference. The API refuses a mismatched amount or a batch changed by a dispute during settlement. The admin interface explicitly describes the batch behavior. Curator earnings remain outside the shared wallet.

No migration or balance backfill is performed by this change. Deployment is required for the UI and policy changes to become live. Verify with `scripts/verify-income-policy.ts` and the payout domain checks. Database integration and payment-provider staging checks should precede production release.
