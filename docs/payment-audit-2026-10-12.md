# Payment workflow audit — 12 October 2026

## Coverage and results

| Flow | Verification |
| --- | --- |
| Distribution submission | Pricing, paid-draft reuse, credits/hybrid totals, review requirement, order ownership, captured payment validation, entitlement validation and submission replay contracts passed. Distribution capture was exercised in isolated PostgreSQL. |
| Half-yearly / Yearly / Yearly+ | Supplied live plan IDs fetched read-only: INR 699 every six months, INR 1,099 yearly, INR 1,999 yearly. Signature, entitlement and same-mandate checkout-resume tests passed. The local environment snapshot does not contain the plan IDs; deployed environment variables were not inspected. |
| Beat store and producer bio | Capture, amount, currency, owner and signature rejection tests passed for both verification URLs. Browser tests passed for Google sign-in, cart/instant purchase, confirmation retry, cancellation and mobile layouts. |
| Beat fulfilment and webhooks | Isolated PostgreSQL tested browser-first/webhook-first completion, replay, invalid amount/currency, authorization before capture, credit accounting and exclusive-sale protection. |
| Studio initial order / paid revisions / amendments | Isolated PostgreSQL lifecycle passed, including same-payment amendment resume, engineer acceptance, revisions, delivery, settlement and release handoff. |
| Reconciliation | Tests require exact release linkage and prevent granting recurring access from release-entitlement or legacy order rows without provider verification. |
| SDK loading and security policy | Browser tests passed for concurrent loading, failed download, missing constructor, stale script timeout, retry and CSP dependency loading. |

## Fixes

- Legacy `/api/payment/verify` now uses the canonical captured-payment verification and fulfilment path; browser-supplied item lists no longer generate pretend licence URLs.
- Every checkout uses the same retryable SDK loader, with a 15-second timeout and failed-script cleanup.
- Distribution payment failures leave Razorpay's retry window usable instead of unlocking the submission form underneath it.
- Unpaid studio amendments can resume the original payment; asynchronous verification failures are caught and displayed.
- Beat-sale replay looks up the normalized licence type that was actually persisted, preventing duplicate-sale constraint failures for older licence aliases.
- Beat/distribution fulfilment transactions have bounded cloud-database timeouts; provider calls remain outside these transactions.
- Created/authenticated recurring checkout can resume the same matching provider mandate; active subscriptions and mismatched plans cannot create replacement mandates through this path.
- Reconciliation matches the order's actual release ID and does not restore recurring access from a release payment or a zero-value subscription-covered release.

## Reproduce

Use `node --import tsx scripts/verify-payment-flows-isolated.ts` for the isolated PostgreSQL audit. It clears payment credentials and disables email in child processes; fixture data stays under `.cache/payment-audit-*`.

Additional checks: `verify-payment-loader-browser.ts`, `verify-bio-checkout-verification.ts`, `verify-producer-link-browser.ts`, `verify-subscription-checkout-resume.ts` (with `--conditions=react-server`), `verify-payment-reconciliation-boundaries.ts`, `verify-razorpay-subscriptions.ts`, `verify-distribution-payment-enforcement.ts`, `verify-distribution-pricing.ts`, and `verify-razorpay-csp.ts`.

## Production limits

No live charge, refund, transfer, recurring mandate or email was created for this audit. Opening real Razorpay checkout only verifies initialization. Full distribution draft submission with production assets, bank authorization, recurring renewal, webhook delivery configuration, cron scheduling and receipt delivery still need production operational verification. Passing automated tests does not establish that every live payment method works on every device.
