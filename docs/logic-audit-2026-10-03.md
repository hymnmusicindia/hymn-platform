# Website logic audit — 3 October 2026

## Scope and evidence

Reviewed shared release presentation, release eligibility and draft lifecycle,
beat-card cart actions, generic checkout, subscription checkout integration,
notification ownership checks, and session/admin permission helpers. Ran the
repository's complete default test suite plus pricing, growth, marketplace,
checkout boundary and TypeScript checks. The API tree contains 247 files; this
is a broad risk-focused review, not a line-by-line certification of every route.

## Confirmed findings fixed

| Area | Inconsistency | Change |
| --- | --- | --- |
| Free release | Deleting an unpaid, unsubmitted draft archives it and could consume eligibility. | Exclude archived records lacking payment, submission metadata and a submitted transition from the prior-submission check. |
| Free release | Campaign capacity was checked only during submission. | Eligibility now checks the redemption limit too. |
| Duplication | Copies inherited campaign markers and submission metadata. | Strip those markers from the copied top-level and nested metadata. Eligibility is recalculated when the new draft is opened. |
| Corrections | Distributor-requested changes did not receive the free-release badge or correction action. | Use the shared correction stage. |
| Customer statuses | Legacy stage labels and filters still exposed partner stages or mislabeled statuses as Draft. | Align shared labels and filters with Under Review; recognize the legacy distributed/live alias. |
| Quick-release timing | Live releases still promised availability after approval. | Show Available now, partial availability, or removal as appropriate without displaying a tentative date. |
| Beat card | Remove on an MP3/stems purchase toggled WAV instead. | Toggle the licence already present in the cart. |
| Empty checkout | An empty beat cart silently became a one-time distribution purchase. | Keep the cart empty, explain it, and prevent payment. |
| Checkout quotes | Failed quote refreshes could retain a previous payable quote. | Clear stale quotes before refresh and guard payment. |
| Checkout fulfilment | Generic checkout accepted one-time distribution payments without a reviewed release. | Reject them server-side and route standalone distribution checkout to the release form. |
| Subscriptions | Subscription products went through one-time beat-order checkout. | Create a provider subscription and verify its subscription callback through the existing subscription API. |
| Cart completion | Zero-cost purchases left the cart populated; paid purchases did not notify other same-page cart listeners. | Clear and broadcast cart updates for both completion paths. |
| Checkout boundaries | Mixed subscription/beat baskets, duplicate beat licences and unsupported recurring discounts were accepted. | Reject these combinations before any order is created; hide recurring-discount controls. |
| Verification | Storage tests asserted removed card classes; status tests asserted superseded partner labels. | Update obsolete expectations while retaining access, metadata and current status checks. |

## Verification limits and remaining review

- No live payment, subscription, refund, payout or distributor action was triggered by this audit.
- No production data migration was needed or performed.
- Browser journeys, email notifications and all third-party callbacks were not end-to-end tested. Customer-facing notification/email wording warrants a separate pass against the simplified Under Review policy.
- Session compatibility accepts signed legacy user tokens without a session ID; whether to expire those sessions is a separate compatibility decision, not changed here.
- Campaign capacity reservation concurrency and recovery after a process interruption still merit isolated database fault-injection tests.
- The default suite includes source-contract assertions as well as domain tests; passing it does not replace browser or isolated database integration tests.
