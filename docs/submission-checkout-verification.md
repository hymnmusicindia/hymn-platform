# Distribution checkout and submission

An attached paid order could be resumed after the account's selected plan
changed. The checkout response omitted its persisted plan, and the form sent
the current page plan instead. The verification endpoint correctly rejected
that mismatch. Checkout responses now return the persisted plan; the form
carries that plan through the asynchronous upload/payment callback. The resume
page also selects an attached paid order's plan, with legacy aliases normalized.
Server ownership, plan, payment model, amount and signature checks remain active.

New checkout drafts were also sent to the paid-correction helper while their
release payment flag was still pending. The helper now accepts a server-only
verified order reference and independently checks the paid, claimed order
inside its transaction before updating a pending draft. Awaiting-payment drafts
transition through submitted before entering review. Completed submission retries
return the existing release, and notification failures do not turn a persisted
submission into a customer-facing payment failure.

Subscription reservations now create a usage-ledger entry with the reservation,
so concurrent requests see the last slot as occupied. Failure cleanup only
releases a claim acquired by that request and removes its allowance reservation.
Expired unused synthetic subscription orders can be replaced by one-time
checkout; captured money or credit payments remain protected. The first-release
zero-amount path validates and redeems its promotion instead of being rejected
as an unsupported entitlement.

The isolated production-server suite (`npm run test:direnote-e2e`) uses a local
Razorpay HTTP mock and fixture credentials. The real SDK, signature checks,
checkout routes, private asset metadata checks, Prisma writes and review queue
are exercised. No live charges or live DireNote ingests are made. Cases include
active/unlimited subscriptions, last-slot concurrency, exhausted allowances,
zero/full/partial credit balances, captured one-time payments, stale-plan
recovery, failed asset validation and retry, invalid signatures, completed
request replay and free first-release redemption.

The HTTP fixtures create ready private-asset records in the isolated database;
they do not claim to test a new upload's byte transport or live Razorpay service
availability. Browser coverage for the artist wizard and correction workflow
runs separately in the same production-build suite.
