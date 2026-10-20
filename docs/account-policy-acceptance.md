# Account policy acceptance

The authenticated portal shows a HYMN graphite/gold policy banner until the account explicitly accepts the current policy revision. It links to the Terms of Service, Distribution Terms, Policy Center and Privacy Policy. Distribution royalty shares are explained in the Terms of Service and Distribution Terms, including the revenue base, example, separate charges and payout conditions.

`lib/policy-content.ts` owns the documents and displayed version/date. Update the version and date when publishing policy changes. A SHA-256 fingerprint includes every policy document and the version, so changing policy content requires renewed acceptance even if the version was accidentally left unchanged.

Acceptance uses the existing AuditLog table; no database migration is required. A publication record preserves the complete document snapshot. Each explicit acceptance records the authenticated account, timestamp, revision and publication reference. Transaction locks make concurrent acceptance idempotent. Historical records remain available. Acceptance does not grant optional marketing consent.

`GET /api/account/policies` returns the signed-in account's current status without caching. `POST` requires an explicit boolean acceptance, the displayed revision and the configured application origin. A stale revision returns 409 and requires review again. Failed requests leave the banner visible.

Distribution review confirmation, checkout creation, payment verification/submission and submitted-release updates require current policy acceptance on the server (428 when missing). Draft editing remains available. The wizard retains the release-specific rights/permissions confirmation; legacy release declaration fields remain compatible with stored releases and validation. Commercial policy text is no longer repeated in the wizard.

Verification:

```sh
node --import tsx scripts/verify-direnote-virtual.ts --policy-only
node scripts/verify-policy-api.cjs
node scripts/verify-policy-banner.cjs
```

The first command creates an isolated fixture PostgreSQL database. The browser fixture covers desktop/mobile layout, persistence, failed saves and changed revisions. Confirm the commercial wording against the applicable DireNote agreement before changing the stated revenue base or percentages.
