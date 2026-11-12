# HYMN artist profiles and collaborations

## Experience

The existing HYMN Music logo and Studio shell are retained. `/studio?tab=artists`
contains Artist profiles, Collaborations, Royalties & verification and Resolution
centre. It is a feature of HYMN, not a separately branded product. Profile linking
is optional. Existing library cards remain usable without enrollment.

Artists edit store/social defaults in Studio. The distribution picker also finds
connected identities by full `@name#1234` or an exact Spotify/Apple artist ID.
Selecting an existing artist creates an account-owned reference, not ownership of
the shared identity. References cannot change another artist's defaults.

Participation requests are created at release verification/review, with durable
in-app/email events. Pending requests permit checkout and submission. Explicit
declines block further submission even if the uploader removes the artist credit.
Declines are recorded immediately during an in-flight delivery. Dispatch checks
again immediately before network I/O; the worker reconciles any race afterwards.
Recording/credit/profile changes invalidate prior consent. Requests expose only
the scoped title, public uploader handle and track-credit summary, not owner files,
bank details, KYC documents or email addresses.

Existing link reservations win provisionally. An earlier unconnected library
mapping also prevents a newer account enrolling the same identity; both accounts
receive private conflict notices. Registration time is not proof of ownership.
Transfers require the current manager's explicit approval, an active destination
with verified payout details, and an attached destination artist card. Historical
release mappings, participation decisions and royalty beneficiaries are preserved.
Contested ownership and inaccessible-account recovery use the existing staff task
and support paths. No automated hostile takeover is permitted.

## Consent and money

Identity association, community confirmation, participation and royalty consent are
separate. Community confirmations require verified payout identity and an approved
live collaboration. Self-confirmation is rejected. Confirmations can be withdrawn;
identity edits/transfers clear existing confirmations. None is advertised as
independently verified Spotify/Apple ownership.

A live release prompts collaborators to optionally propose equal or custom shares.
Proposals use the existing `SplitRecord`/`SplitRecipient` ledger and allocation
engine. Whole-release proposals include the release owner and approved primary
collaborators; zero-percent shares are allowed without granting earnings. Everyone
in the proposal must accept the same allocation, including a zero-percent owner.
Replacing a proposal requires cancellation and fresh consent; it cannot be edited
piecemeal through the legacy invitation endpoints. Individual-track agreements
remain available in the existing Royalty splits feature.

Integer basis points conserve 100% for equal thirds and other rounding cases.
Existing earnings are never recalculated. If statements already exist, new Hub
proposals must start in a future month. Pending proposals retain the existing owner
payout path. Unverified recipients' allocated earnings stay held. The distribution
partner's share and applicable adjustments are preserved; HYMN takes zero
additional royalty commission.

## Inbuilt KYC

No external KYC provider is connected. Existing approved credentials are reused.
Identical saves preserve verification; beneficiary/identity changes reset it and
notify the customer. Strict input validation protects method and identity fields.

Private JPG/PNG/PDF identity and beneficiary evidence can be saved incrementally.
Checks cover ownership, file integrity, size, readable image dimensions, PDF pages
and duplicate evidence. The system does not claim government checks, bank-account
ownership verification or liveness verification. Human identity/beneficiary review
remains required. If an evidence application is started, staff cannot approve it
until both current documents and the consent declaration are present and bound to
the current payout details. Existing verification records retain their legacy
review path. Submitted/verified evidence is protected from ordinary deletion.
`kyc.review` permission is required for staff evidence access. Credentials remain
encrypted and customer summaries remain masked.

## Provider boundary and recovery

Official contract checked on 12 November 2026:
[DNM API v3.1](https://distribution.direnotemedia.com/dnm_api).

| Capability | Integration |
| --- | --- |
| Artist lookup/default mapping | Existing `check_artist`, guarded `update_artist`, immutable release snapshots |
| Delivery | Existing `ingest_content`, `ingest_status`, `check_release_status` and webhook processing |
| Decline before delivery | Local submission block |
| Decline during processing | Reconcile the accepted attempt; wait for a known UPC |
| Pending release withdrawal | `withdraw_release` only after read proof that every track is pending |
| Withdrawal outcome | Verify exact UPC and every track's rejected/“withdrawn by user” evidence |
| Unknown withdrawal | Preserve prepared intention; read back, never blindly resend |
| Accepted/live or otherwise ineligible | Critical staff resolution task; no false claim of instant removal |
| Ordinary takedown | Existing tracked workflow; provider requires 90 days live |
| Royalties | Existing revenue import, agreement selection and payout ledger |

The authenticated ingestion cron runs existing duties first, then bounded artist
activity, mail and intervention work. Unique event keys deduplicate notifications;
mail failures use the existing email log/retry mechanism. Uncertain sends require
review instead of blind replay. A single reminder is sent after three days. Live
collaboration notices do not allocate royalty shares automatically.

Notifications apply to activity through HYMN. These APIs do not provide universal
alerts whenever an artist ID is used by an unrelated distributor.

## Release and verification

Apply additive migration `20261112120000_artist_hub` before deploying application
code. It adds nullable library links and new tables; it rewrites no historical
royalties, releases, mappings or credentials. Startup, controlled migration deploy
and production schema checks verify the required columns before serving new code.

Verification commands:

```text
npm run test:artist-profiles
npm run test:artist-profiles:build
node --import tsx scripts/verify-splits-isolated.ts
node --import tsx scripts/verify-acquisition-isolated.ts --artist-verification-only
npm test
npm run build
```

The feature suite rehearses migration into disposable PostgreSQL, checks protected
identity links, historical priority, authorization, stale decisions, pending
progress, persistent rejection, KYC evidence, transfers, unanimous splits,
withdrawal confirmation, unknown outcomes and notification deduplication. Browser
checks cover light/dark at 1440px, 390px and 320px, consent dialogs, errors, focus,
lookup and exact equal-share totals. Evidence and API calls in these tests use
disposable local data; no real release, email or payment is sent.

Validated on 12 November 2026: the disposable migration/integration suite and
existing payout KYC suite passed; the existing split, artist-verification and
provider-mapping regressions passed; new profile/KYC browser journeys and the
existing artist-profile dialog passed at desktop/mobile sizes. All 16 core
regression groups and request/update-boundary checks passed. Targeted lint reported
zero errors and 17 existing warnings in retained workspace components/helpers. The
the isolated production build (compilation, TypeScript, static generation and
traces) passed. No production migration, live delivery or customer email was
performed as part of verification. Deployment remains a separate operation.
