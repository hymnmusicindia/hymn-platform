# Studio workflow audit and completion — 16 October 2026

## Implemented

- Authenticated Studio SSE chat, optimistic sending, stable retry keys, send timeout, reconnect and non-overlapping polling fallback. Streams renew after approximately 23 seconds. Outbound sends temporarily release the receive connection to avoid HTTP/1 connection-slot contention.
- Active-account enforcement across Studio APIs, participant domain operations, uploads and private asset reads.
- Amount-based refund ledger: partial refunds do not close an entire project. Multiple captured payments must all be fully refunded before the project becomes REFUNDED. Duplicate/stale notifications cannot double-reverse earnings.
- Compensating engineer-wallet and commission adjustments preserve original earnings. Provider disputes hold remaining engineer earnings; verified wins release eligible holds. Financial-review tasks block further payouts and Route dispatch until reviewed.
- Durable refund requests, stable provider idempotency keys, pending-refund reconciliation and explicit admin retry of confirmed failures. A timeout is never treated as success or permission to issue a second refund.
- Bounded provider reconciliation for Studio payments, captured-payment recovery, refund-history pagination and known failed/received webhook replay. Cancelled/ineligible projects do not reactivate on late capture.
- Admin payment/refund ledger, settled financial-review closure, safe resume constraints, refund retry controls and net-of-refund revenue/receipts.
- Studio automation is protected by a database lease and is scheduled by the long-lived Node entrypoint as well as the existing Vercel cron.

## Verification

Run:
```
node --import tsx scripts/verify-studio-services-isolated.ts --chat-audit
node --import tsx scripts/verify-team-os-isolated.ts --live-chat
node --import tsx scripts/verify-razorpay-signatures.ts
node --import tsx scripts/verify-studio-services.ts
node --import tsx scripts/verify-migration-safety.ts
node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit
```

The isolated Studio runner exercises the additive SQL migration, lifecycle, quote/payment idempotency, engineer acceptance, revisions, paid amendments, two-party completion, earnings, reviews and release handoff. Upload tests use real fixture bytes for chunk checksums, resume, completion replay, role restrictions and ranged private reads. Financial tests cover partial/full boundaries, duplicate/stale refunds, currency/over-refund rejection, earning reversals, dispute holds/releases, ambiguous-response retries, pending/failed refunds, admin retry and late capture. Browser checks cover client sending, engineer replies/history, offline retry, outsider denial and mobile overflow.

Provider financial responses are simulated; tests never issue live charges, refunds or customer emails. Development compilation can exceed send timeouts; browser fixtures warm relevant bundles before checking steady-state behaviour. A local latency sample is not a production SLA.

## Operational limitations

- Production deployment must apply migration `20261016160000_studio_refund_recovery` before loading the new Prisma client. The guarded release pipeline does this; do not use production `db push`.
- The Node scheduler requires CRON_SECRET; STUDIO_AUTOMATION_ENABLED=false disables it. Missing provider credentials disable provider reconciliation/refund submission rather than assuming a refund succeeded.
- Already-settled external transfers require finance review; HYMN does not automatically reverse bank transfers. Negative wallet balances remain blocked even after an admin closes review.
- Reconciliation can replay known authenticated webhooks and fetch payment/refund history. A dispute webhook never received by HYMN still requires provider-dashboard monitoring/manual reconciliation.
- Large uploads and real payment/settlement behaviour require staging/live operational validation. The historical read-only production check contained no paid Studio transactions, so it could not certify paid production history.

References: [MDN server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events), [Razorpay refund idempotency](https://razorpay.com/docs/api/payments/refund/create-normal/), [Razorpay order payments](https://razorpay.com/docs/api/orders/fetch-payments/), [Vercel cron behaviour](https://vercel.com/docs/cron-jobs).
