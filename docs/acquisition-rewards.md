# Research & Acquisition

The existing Team OS contains acquisition navigation, lead registration and assignment, signed employee links, outreach templates, attribution inspection, employee rewards, the customer referral dashboard, the commission ledger, reconciliation, payout management, and audited programme settings. All writes use the existing Team OS authentication and server permissions.

## Revenue and attribution

Researcher and converter identities are independent. Defaults are 2% and 3%; the employee reward cap defaults to 7%. Customer referral rewards are outside that cap, as requested, and start at 2% of reconciled eligible net revenue. Only one direct customer referral qualifies under the new policy. Existing payments retain their earlier policy and network allocations.

Migration `20261019140000_customer_referral_net_revenue` records the customer net-policy effective date. New customer referral purchases enter the reconciliation queue even without an employee lead. Unassigned evidence is visible to acquisition administrators, and its first review locks the record and assigns the reviewing workspace. Other workspaces cannot subsequently change it.

Verified paid orders and billing records supply payment IDs and recognised revenue. Distribution and subscriptions use actual recorded receipts. Beat and studio services use the recorded contractual HYMN share, preserving the seller's share. Taxes, refunds, direct costs, and provider fees require nonnegative amounts and supporting accounting references. Missing evidence blocks final accrual. No accounting amounts are inferred from a redirect or assumed to be zero.

Refund events hold rewards until reconciliation. Employee corrections append ledger entries. Customer corrections append `referral_commission_adjustments`, preserving the original calculation and recording the previous balance, delta, resulting balance, rate, policy, and timestamp; the commission row's net balance is a current projection. An earned reward's rate does not change when settings change. Full refunds can reduce the balance to zero. Customer adjustment history is returned only through the authenticated owner's ledger.

## Operations

Employee accrual starts disabled and requires an administrator to enable it after finance approves the policy. Reconcile the evidence queue from Commission Ledger. Every adjustment requires a reason and reference. Payout approval requires a completed hold and reconciled payment evidence. Recording a payout requires confirmation of a separately executed transfer; this module does not initiate bank transfers. Customer payouts retain the existing verified profile and minimum withdrawal rules.

Outreach uses the existing email provider, approved templates, recipient suppression and unsubscribe controls. Failed or disabled sends are recorded as failures rather than reported as delivered. Test fixtures disable or mock transport and do not send live email.

No new secret variables are required. Existing configuration uses `DATABASE_URL`, a database-owner `MIGRATION_DATABASE_URL` for guarded migration deployment, `EXPECTED_DATABASE_HOST`, `EXPECTED_DATABASE_NAME`, `EXPECTED_NEON_BRANCH_ID`, `REQUIRE_RESTRICTED_DATABASE_ROLE`, session secrets, the public application URL, the existing Razorpay variables, and the existing email provider variables. Keep values outside Git. Production migration deployment uses `scripts/deploy-production-migrations.ts` to check the canonical database and owner access before `prisma migrate deploy`.

## Verification

`npm run test:acquisition` applies the release SQL to a disposable PostgreSQL database and checks attribution, evidence idempotency, employee commission uniqueness, customer-only referrals, net revenue, missing evidence, partial and full refunds, retained original calculations, adjustment entries, payout holds, and outreach persistence.

`npm run test:acquisition-revenue` checks product revenue calculations. `npm run test:referrals-integration` checks legacy policy preservation, referral eligibility, recurring payments, refund and dispute reconciliation, concurrency, payout reservations, and mocked email retries. These fixtures never use the production database.

After `npm run build`, run `npm run test:acquisition -- --browser` to exercise the production build against the disposable database, including navigation, attribution lookup, mobile width, and anonymous API denial. The fixture blocks external browser requests and disables scheduled automation and email.
