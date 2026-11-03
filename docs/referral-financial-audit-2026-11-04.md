# Referral financial audit — 4 November 2026

The audit follows captured payments through attribution, seven-level allocation,
net-revenue reconciliation, refunds/disputes, withdrawal reservation and payment
recording. Payout rates and commercial terms were not changed.

## Corrections

- Withdrawal eligibility rechecks revenue evidence, source/customer identity and
  the UTC hold timestamp instead of trusting a cached AVAILABLE status.
- Full refunds reverse commissions under both direct-only and network net policies.
  Partial refunds cannot clear until the verified revenue deduction is recorded.
- Refund IDs deduplicate provider deliveries. Processed/failed outcomes outrank
  delayed creation events. Already-reconciled refunds do not reopen revenue review.
- Dispute outcomes are tracked by dispute ID; an older win cannot clear a separate
  open dispute, and delayed opening events cannot overwrite terminal outcomes.
- Distinct partial refunds are summed when updating order states. Cumulative full
  beat refunds revoke access and reverse seller credit once.
- Failed refunds can restore the captured order's paid state. Partially refunded
  orders can reconcile their retained revenue with documented provider deductions.
- Unresolved Beat Store refunds/disputes block withdrawal approval and Route
  transfers, including adverse events awaiting processing.
- Gmail/Googlemail dot and plus aliases cannot establish a self-referral connection.
- Invalid monetary arguments are rejected; refund allocation uses integer arithmetic.
- Recovery batches skip net-policy payments already waiting for reconciliation,
  so those records cannot starve later eligible payments. Duplicate payment IDs
  are refreshed once per batch. Programme-date SQL comparisons use UTC explicitly.

## Verification

`node --import tsx scripts/verify-referrals-isolated.ts --payments`

Runs disposable PostgreSQL tests for legacy rewards, lifetime rewards, seven-level
net allocations, replay, snapshots, holds, reversals, concurrent withdrawal/review,
unique bank references, post-payout recovery, mail outbox recovery and gateway
fulfilment. Includes the new money audit and 58,824 rounding/cap scenarios.

`node --import tsx scripts/verify-studio-services-isolated.ts`

Covers studio quote/payment/revision/settlement, earning reversal, dispute
holds/releases, partial/pending/failed refunds and late-capture recovery.

Additional checks cover calculator agreement, payout API authorization, constant-time
gateway signature verification, revenue arithmetic, payout-domain rules and TypeScript.
Race tests deliberately provoke serialization/unique-key errors and assert that only
one financial action commits.

## Existing production records

The database-enforced read-only inspection returned zero findings for negative
commissions, duplicate beneficiary/payment allocations, unreversed full refunds,
stale available net evidence, stale cumulative-refund order states, multiple pending
referral withdrawals and invalid paid-payout records. The repeatable inspector is
`scripts/inspect-referral-money.ts`; remote use requires explicit read-only mode and
the configured expected database host/name.

Tests used disposable records and simulated provider observations. No real charges,
bank transfers, customer messages or payout approvals were performed. Revenue
reconciliation and bank payment recording remain explicit authorized workflows.
