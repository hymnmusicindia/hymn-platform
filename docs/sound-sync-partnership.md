# Sound Sync partnership activation

Recipient: `vanshikavohra14@gmail.com`. Agreement: `sound-sync-2026-11-14-v1`.

The invitation and confirmation emails use HYMN's shared HTML layout, monochrome colours, the official `public/assets/hymnlogowhite.png` logo and Manrope typography. The four-page PDF embeds static Manrope Regular/Bold instances derived from the existing OFL-licensed variable font. Source font licence: `public/fonts/manrope-OFL.txt`.

The invitation opens a read-only agreement page. The recipient signs in or creates an account, returns to the invitation, checks acceptance and clicks **Accept agreement & activate Yearly+**. Merely opening a link, including an email scanner's GET, cannot accept or grant anything. Email-code and Google authentication share the strictly allowlisted return path.

One serializable transaction records the agreement digest/version and acceptance, grants the individual Yearly+ term, preserves a longer active manual term, allocates an existing or unique referral code, and queues the confirmation. Concurrent requests retry serialization conflicts; repeated acceptance returns the original result. Provider-billed subscriptions require billing assistance rather than silently replacing a renewing plan. The protected individual term is not revoked when the partnership ends. Sound Sync's separately nominated company account is handled with HYMN; this invitation only grants the individual account.

The target is **105 unique qualifying paying clients per four-month period**. The existing referral programme applies, including explicit customer consent, eligible net revenue, configured purchase rates, refund adjustments and the 14-day hold. This partnership has a **zero minimum withdrawal threshold**, with a positive cleared balance, verified payout profile and one pending request still required. There is no new maximum cap. Other accounts retain their existing minimums. The exception appears consistently in the referral dashboard, calculator and income summary.

## Release and send

1. Review the generated PDF and two HTML previews under `artifacts/sound-sync-partnership`. Preview links and codes are deliberately placeholders.
2. Back up the production database through the established release process. Deploy the additive migration `20261114120000_partnership_activation` with the guarded `npm run deploy:release` workflow. Never use production `db push` or reset. Verify the restricted runtime role has access to the new table through normal owner default grants.
3. Build/deploy the app with the new dependency, schema, routes and static font files. Keep the existing HYMN environment and SMTP secrets on Hostinger.
4. Verify `/api/admin/partnerships/sound-sync` with a recently authenticated administrator (`system.manage`). The read endpoint reports invitation state and `senderReady` without returning bearer tokens.
5. Send the invitation through POST to that endpoint with `{"action":"send_invitation","recipient":"vanshikavohra14@gmail.com"}` and the canonical same-origin header. The scoped `scripts/sound-sync-partnership.ts --send` calls this endpoint using the configured administrator credential; it uses the live application's sender. Do not send until the deployment is verified.
6. Record the returned email status/message ID. Repeated send requests retain the existing send reservation. After acceptance, the existing referral-reconciliation cron drains the durable confirmation queue.

Generate previews without any sending: `node --conditions=react-server --import tsx scripts/sound-sync-partnership.ts`. Real sending requires `--send`, canonical production origin, configured administrator credentials, recent authentication, and a working live SMTP sender.

## Recovery

The individual entitlement and referral dashboard remain available if confirmation mail is delayed. Known pre-DATA SMTP failures retry with backoff, up to five attempts. Uncertain DATA/acceptance outcomes, stale sending jobs and changed recipient accounts enter `REVIEW`; the cron exposes the review count. Inspect the provider and HYMN email logs before an operator authorizes any resend. Generic email retries intentionally reject partnership templates because they would drop the PDF and bypass the review. Never reset acceptance or the subscription to resend an email.

End partnership earning eligibility by recording `ended_at` with the administrative decision and audit evidence; purchases created before it retain their existing earning rules. Do not change the protected individual subscription. Version agreement content immutably: changing content invalidates unaccepted invitations through its digest check, so issue an updated agreement/invitation rather than rewriting already accepted terms.

## Validation

`node --import tsx scripts/verify-partnership-isolated.ts --browser` uses a disposable PostgreSQL fixture and replaces SMTP before enabling mail. It validates the actual migration, invitation replay, wrong identities, expiry/digest checks, concurrent acceptance, billing protection, longer terms, termination protection, one-paise withdrawal, ordinary minimums, pending payout safeguards, PDF attachments, worker concurrency, safe SMTP retry and uncertain-delivery review. Browser coverage includes responsive widths of 320/390/1440, real email-code account creation, auth return navigation, explicit acceptance, scanner-safe GETs, cross-origin rejection, repeat visits, PDF downloads, referral/calculator minimums, and admin sender access/recipient safeguards. No production account, subscription or email is modified by these tests.
