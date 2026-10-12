# Referral centre and network commissions

## What changes

- Personal invitation link → validated inviter on signup → one permanent referral connection.
- Referrer and new member both get an account notification and an acceptance email. The outbox is committed with the connection, never inside an external SMTP call.
- Profiles open private text conversations. Only the two direct participants can read/send; either can pause it. Messages have pagination, read receipts, unread counts, polling while visible, send limits, bounded request bodies and retry keys. HTML is rendered as plain text.
- An expandable network shows seven levels, 25 accounts per branch page. Descendant emails are not exposed. Rejected connections and inactive accounts cannot be traversed.
- Every paid purchase receives one frozen allocation, protected against replay across products. Refunds adjust every beneficiary; account/risk checks cover the complete path before withdrawal.
- Pending earnings under one day show “Less than 24 hours”; elapsed holds show “Final checks pending”, never “0 days” or an unverified promise of availability.

## Commission basis

Direct commissions retain release/plan rates: one-time 10%, half-yearly 8%, yearly 7%, Yearly+ 5% of cash collected. Credits and free entitlements do not earn commission.

Beat-store and Studio direct commissions are capped at **5% of HYMN's recorded share**, preserving producer/engineer earnings. The **combined** marketplace allocation is additionally capped at the smaller of HYMN's share and 5% of cash collected.

The implemented conservative interpretation is:

| Level | Basis | Rate |
| --- | --- | --- |
| 1 | Product cash / HYMN share, as above | Category rate |
| 2 | Direct commission | 1% |
| 3–7 | Direct commission | 0.5% each |

Example: a ₹1,000 one-time release yields ₹100 direct commission, ₹1 at level 2, and ₹0.50 each at levels 3–7, assuming seven eligible ancestors. Paise are rounded down; missing/ineligible levels are not redistributed. Network allocations apply only to purchases created after the network migration's UTC launch timestamp. Existing earned commissions are unchanged.

There are no joining fees, recruitment rewards or required purchases to participate. This implementation is sale-based; it is **not a legal determination** that HYMN's programme satisfies every direct-selling requirement. Review the actual business arrangement before marketing it as a multi-level programme.

## Activation

1. Deploy code and run `npm run db:migrate:deploy` using the existing migration-owner configuration. The new migration is `20261012160000_referral_network_and_conversations`; the preceding lifetime-commission migration is also required. Never use `db push` or reset on production.
2. Configure `EMAIL_ENABLED=true`, `SMTP_USER`, `SMTP_APP_PASSWORD`, `SMTP_HOST`, `SMTP_PORT`, and an authenticated `EMAIL_FROM`. Keep secrets on the server.
3. Schedule authenticated `GET /api/cron/referral-reconciliation` every five minutes with `Authorization: Bearer <CRON_SECRET>`. Successful signup/manual acceptance also starts a bounded post-response mail worker. Cron recovers missed work and SMTP failures.
4. Verify a new-account invitation through Google signup, both notifications, both real email deliveries, chat, and the admin referral email counters. Run a small authorised test-mode purchase separately; test-mode payments never generate withdrawable commission.

Email delivery is at-least-once: jobs have concurrent-worker leases, retry backoff and five-minute crash recovery. SMTP acceptance followed by a server crash can cause a duplicate email; SMTP does not provide an exactly-once guarantee. Delivery logs record successful sends. Pending jobs remain queued while SMTP is disabled, and inactive recipients are cancelled.

Accrual, payment/refund reconciliation and acceptance emails run automatically. Cash withdrawals still require a verified payout profile, a 14-day hold and ₹500 minimum; the existing admin flow records an externally completed bank transfer. This change does **not** initiate automatic bank transfers or mark unpaid money as paid.

## Verification

`node --import tsx scripts/verify-referrals-isolated.ts --reuse=.cache/hymn-referrals-EJpYjY --payments` uses an isolated local database, resets **only** that fixture, and checks actual migration SQL, legacy rewards, lifetime commissions, network allocations/refunds, withdrawals, private chat and mocked SMTP failure/recovery, plus payment/Studio regressions. Browser checks are `verify-referral-circle-browser.ts` and `verify-referral-commissions-browser.ts`, at 320/390/1440px. Link regression is `verify-referral-links.ts`.

Research: [India's 2023 direct-selling amendment](https://egazette.gov.in/WriteReadData/2023/246732.pdf), [2021 rules announcement](https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=1785873&lang=2&reg=48), [Rewardful campaign settings and refund holds](https://help.rewardful.com/en/articles/14148863-campaign-settings-overview), [Razorpay webhook validation and duplicate handling](https://razorpay.com/docs/webhooks/validate-test/).
