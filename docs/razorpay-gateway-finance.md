# Settlement reconciliation and Route

The admin **HYMN Revenue** workspace now includes **Bank settlements** and **Creator transfers**. Revenue remains separate from gateway cash movements: settling a collection does not create revenue again, and a creator transfer does not count as HYMN earnings.

## Deployment

1. Deploy the code and apply `prisma migrate deploy` to the PostgreSQL database. The additive migration is `20261012120000_gateway_settlements_route`. Generate the Prisma client during the normal deployment build.
2. Existing `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` and `CRON_SECRET` are used. No new credential is needed for settlement reporting. Use matching Test or Live account credentials throughout.
3. In Razorpay, enable Route for the merchant, create linked accounts, complete their KYC/stakeholder/bank/terms onboarding and activate their **route** product configuration. Onboarding remains in Razorpay; HYMN does not accept bank credentials or agree to terms on behalf of a creator.
4. Set `RAZORPAY_ROUTE_ENABLED=true` only after activation. In Creator transfers, connect the HYMN user ID, `acc_...` linked account ID and `acc_prd_...` product configuration ID. HYMN verifies the account email against the user and checks the Route product is activated. Each financial dispatch/release verifies activation again.
5. Subscribe the existing signed webhook endpoint `/api/webhooks/razorpay` to the available settlement and transfer lifecycle events, including `settlement.processed`, `transfer.processed` and `transfer.failed`. Keep existing payment/subscription/refund/dispute subscriptions enabled. Webhook IDs are used only as identifiers; amounts and status are re-fetched through the authenticated API.
6. Schedule `GET /api/cron/gateway-finance` daily with `Authorization: Bearer <CRON_SECRET>`. Vercel configuration includes 01:50 UTC daily. On Hostinger, configure the same authenticated request using its scheduler; Vercel cron configuration alone does not schedule a Hostinger deployment. The job imports the current and previous Indian calendar months and refreshes up to 100 unresolved Route transfers, oldest checked first. It never creates/releases transfers automatically.

## Settlements

Choose a month, then **Sync with Razorpay**. All pages of the combined settlement recon report are fetched and validated before ledger rows are published. Failed pagination leaves the previous complete snapshot available and marks the sync failed. Rows are upserted by transaction identity; changing settlement assignment cannot duplicate a payment.

The workspace shows gross payments, provider-reported fees and the tax component, refund/transfer/adjustment debits, processed settlement amounts and UTRs. Fee and tax fields are displayed separately without assuming whether tax is included in fees. Net credits minus debits are compared with each settlement's reported amount, without subtracting fees a second time. Missing report lines and differences remain visible. Payment IDs match subscription, distribution, beat and studio records; ambiguous IDs, unmatched rows and payment amount/currency discrepancies are flagged.

INR charts exclude other currencies. The settlement API reports Razorpay's bank settlement status and UTR; this does **not** independently verify a bank statement. Empty data is not fabricated. Backfill older months using the month selector. Financial sync failures return a non-success HTTP response so scheduler monitoring can alert.

## Creator transfers

1. **Reserve earnings** for a paid unrefunded beat sale or an available completed studio earning. HYMN uses the stored creator amount, not a hardcoded split. Studio earnings are apportioned over their captured initial/revision/amendment payments with exact paise conservation.
2. Reservation moves the creator's INR wallet balance from available to pending under a database lock, so normal payout requests cannot reserve it again. A source is unique across retries. Historical sources overlapping wallet payout requests are blocked because those funds cannot be proven unspent. Existing payouts must be reconciled separately.
3. **Create held transfer** verifies the source, captured payment amount/currency/order, refunds and activated linked account. It creates one held transfer per funding payment. Review the amount and recipient in the confirmation panel before confirming.
4. **Release settlement** rechecks source/refunds/account activation and removes the provider hold. A release means processing, not paid. Only a processed recipient settlement moves pending funds into lifetime paid and writes the debit ledger and creator notification, once.
5. An entirely unsubmitted source can be cancelled to release its wallet reservation. Once submission starts, cancellation is blocked.

Transfer creation from payments does not assume an undocumented idempotency header. The persisted dispatch claim prevents concurrent sends. A timeout or crash is an uncertain result: verification searches provider transfers by the persisted intent note and never automatically repeats the POST. Unmanaged provider transfers block dispatch. Failed, reversed or uncertain transfers require finance review; they do not silently re-credit wallets or become eligible for retransmission. Resolve the provider transfer/refund state and use HYMN's existing audited financial adjustment workflow where a compensating wallet adjustment is needed. Existing refund/dispute workflows remain responsible for the underlying sale reversal. Reviews must consider both the Route reservation and that reversal to avoid duplicate credit/debit.

Admin reads require `payouts.review`; reservation, connection, dispatch, cancellation and release require `payouts.approve` plus an admin sign-in within 15 minutes. POST actions require a matching Origin. The feature flag gates new provider transfers and releases; read-only reconciliation remains available when disabled. These permissions and explicit held-release workflow intentionally preserve human control over money movement.

## Validation

`npm run test:gateway-finance` starts an isolated embedded PostgreSQL database, applies the additive migration to the previous schema and tests provider fixtures without live transfers. `node --import tsx scripts/verify-gateway-finance-browser.ts` checks desktop and mobile views using the JSON fixtures produced by that test. Type checking and targeted ESLint cover the implementation.

Official contracts used:
- https://razorpay.com/docs/api/settlements/fetch-recon/
- https://razorpay.com/docs/api/payments/route/create-transfers-payments/
- https://razorpay.com/docs/api/payments/route/fetch-transfers-payment/
