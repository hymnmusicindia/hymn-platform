# Referral consent and safeguards

This document supersedes older new-account-only, automatic signup attribution, and permanent connection descriptions. Existing earned commission rules and configured rates remain unchanged.

## Customer experience

A customer or active team member shares their permanent `/join?ref=CODE` link. Existing account holders can participate too. Opening a link stores a pending invitation, not an earning entitlement. After sign-in, a dialog names the inviter and identifies the community or team programme. The customer must check the approval box and confirm. Declining changes no attribution.

The customer can manage connections in the referral dashboard. Each programme supports one active connection. After 45 elapsed days the customer may remove it with a second confirmation. Connections do not expire automatically. A replacement requires a new explicit approval and starts a new 45-day period. Removal stops future purchases from contributing; earlier valid earnings, adjustments and audit history remain.

## Team and finance

Non-owner active team members can copy their link in the acquisition dashboard/rewards area or share through WhatsApp. An approved team link uses the employee acquisition ledger, not a duplicate personal referral commission. It reuses the canonical customer card and lead. A link alone never certifies a researched source, completed call or verified lead. Referral-only contacts do not create research verification tasks or research rewards.

New manual acquisition claims also require customer approval. Historical acquisition records are grandfathered without inventing consent timestamps. Finance must reconcile real revenue, taxes, partner costs, fees and refunds under the existing programme. No bank transfer is triggered by approval. Configured rates, payout verification and holding periods still apply.

Employee attribution periods are retained in server-written history. Purchases use the employee effective at purchase creation; replacing the employee cannot take earlier purchases. Refund adjustments stay with the original earned ledger entries even after removal or replacement.

## Abuse controls

Approval requires a short-lived signed proof bound to the signed-in customer, inviter, programme and currently reviewed connection. Mutations use same-origin checks, bounded payloads, rate limiting, database locks and uniqueness constraints. Self-referrals, canonical Gmail aliases, shared contact identities, circular community paths, conflicting attribution and unresolved earlier risk flags are rejected or sent for support review. A shared IP alone is not proof of fraud. Referrals do not grant account access or extra customer fees.

## Notifications and recovery

Approval and removal create durable email jobs and account notifications in the same transaction. Team members also receive their configured team notification. Emails use the shared HYMN HTML layout, PNG logo, reply address and connection-management link. Signup itself is not delayed by SMTP.

Known delivery failures retry with backoff. Jobs exceeding the attempt budget, stale sending jobs and uncertain SMTP acceptance enter REVIEW instead of blindly sending duplicate messages. The reconciliation cron reports these as requiring attention. An administrator with recent wallet-adjustment authorization must inspect delivery logs, enter a reason and explicitly confirm that review before retrying or closing a job. Every decision is audited. REVIEW does not mean the email definitely failed.

## Deployment

Deploy the committed Prisma migration `20261026110000_referral_consent_and_effective_periods` before serving this application version, through the normal `npm run db:migrate:deploy` release workflow. Generate Prisma Client as part of the build. Do not replace the migration with production `db push`: the SQL backfill preserves legacy consent semantics and adds the active employee uniqueness constraint.

Ensure the existing referral reconciliation cron and HYMN SMTP configuration are enabled. Check its mail attention report after deployment. This implementation does not send live test mail, change historical commission rates or move funds.

## Verification

- `node --import tsx scripts/verify-referrals-isolated.ts --consent-only`: actual prior-schema migration, existing accounts, explicit consent, proof binding, concurrency, identity rejection, exact 45-day boundary, replacement inviters, employee period history and late refunds.
- `node --import tsx scripts/verify-referrals-isolated.ts`: legacy migrations, product commissions, seven-level network, refund/payout checks and mocked SMTP recovery.
- `node --import tsx scripts/verify-referrals-isolated.ts --auth-only --reuse=FIXTURE`: run after the full suite on that isolated fixture; verifies signup/login consent and SMTP isolation.
- `node --import tsx scripts/verify-referral-links.ts`: visitor and signed-in redirects, secure cookies, rate limits and cross-site rejection.
- `node scripts/verify-referral-consent-browser.cjs`: approval, decline, removal confirmation and responsive UI at 320, 390 and 1440 pixels.
- TypeScript and targeted ESLint checks.

All database integration checks use isolated local PostgreSQL fixtures, not production.

## References

[Rewardful: dealing with self-referrals](https://help.rewardful.com/en/articles/5989704-dealing-with-self-referrals) informed explicit identity checks and a review path for correlated accounts rather than treating every risk signal as proven fraud.

[FirstPromoter: fraud protection settings](https://help.firstpromoter.com/en/articles/13772161-fraud-protection-settings-in-firstpromoter) informed identity and payout checks, refund adjustments and manual review controls. The 45-day removal period and existing-customer eligibility are HYMN product requirements, not claims taken from these sources.
