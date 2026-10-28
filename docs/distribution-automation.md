# Distribution operations and automatic QC

The distribution workspace combines the catalogue, QC queue, delivery monitor and exceptions. Submitted releases are newest first; drafts have a separate collection. Rows are paginated and keep detail, identifiers, store controls, evidence and existing delivery actions available in the inspector. Customer catalogues default to a compact list, with grid view still available.

## Automatic delivery

All eligible releases participate by default. `DISTRIBUTION_AUTOMATION_ENABLED=false` pauses automatic QC, submission and amendments while leaving manual operations and status reconciliation available.

The payment handoff, minute scheduler (`distribution-automation`) and existing recovery cron share the same checks. The independent GitHub frequent-job fallback also includes this worker. Eligibility requires an active customer, verified payment/entitlement, all seven customer declarations, a submitted workflow state and no unresolved partner outcome or sensitive hold. Unresolved high/critical fraud alerts on the release or customer block delivery independently of editable metadata.

QC checks existing payload readiness and artist confirmations, resolves preview artwork to its actual private asset, verifies source ownership and SHA-256 checksums, fully decodes JPEG artwork and inspects audio integrity. Signed evidence binds the result to the release identity, record version, metadata and tracks. Delivery verifies the signature, revision, selected source IDs/checksums and eligibility under the existing release submission lock. It checks again after artist mapping/preflight work, before claiming delivery. Existing attempt identity, cooldown, retry limits and uncertain-response reconciliation remain authoritative.

The worker is deterministic, explainable technical automation. It does not use an LLM, listen for creative quality, establish copyright clearance, identify undisclosed samples or prove legal ownership. Existing partner QC and human review remain necessary for those decisions. A passed local report does not mean a store has approved or published a release.

## Corrections and amendments

- Only outer whitespace in release and track titles is automatically corrected. Every fix is audited; artist names and creative meaning are preserved.
- A metadata correction request is automatically resolved only when every requested field is covered by those exact formatting fixes. Other requested corrections retain their customer action/review state.
- Customer-resubmitted pre-delivery corrections are checked again. Changes to artist identity/profile selections, credits, rights or explicit declarations relative to signed prior evidence require review. Legacy corrected deliveries without a signed baseline also require review; unrelated edits or clearing another hold cannot erase that requirement.
- Licensed/non-exclusive, AI-generated and cover content; copyright/fraud flags; sensitive review issues; unverified legacy sources; oversized files; and uncertain checks pause for review. Temporary check failures back off and stop after five retries.
- Media checks retain signed progress across cycles for larger multi-track packages. Delivery only proceeds after the whole package passes.
- Already delivered recordings use existing-recording support requests, retaining UPC/ISRC. Technical Apple/Meta availability requests may be validated and sent automatically. Creative/identity amendments require approval first. Legacy unstructured amendments remain manual. A durable support-write marker prevents blind resends after timeouts.
- Partner acceptance of an amendment is tracked separately from verified store completion. Uncertain outcomes are not presented as completed work.

## Refresh and capacity

Admin views poll while visible every 15 seconds and refresh on focus; customer catalogues refresh every 30 seconds and on focus, without refreshing an open release editing view. Team QC lists refresh without replacing an open review form. Errors retain the last successful snapshot. New submissions and draft-to-submitted handoffs produce one dismissible on-screen notice, without repeating it on overlapping polls.

After the initial catalogue snapshot, admin reads use an indexed `(updated_at, id)` cursor, fixed-window pages of 200 changes and a maximum of five pages per poll. Archived releases are removed from the client snapshot. A short overlap handles ordinary transaction visibility delays. The initial admin snapshot still loads the current catalogue in full; this change does not claim unlimited catalogue capacity. Very large catalogues should move initial counts/search and pagination to server queries. Transactions taking longer than the overlap may require an explicit full resynchronization.

Automatic QC checks two candidates per scheduled cycle, in oldest-work-first order. Unchanged exceptions are skipped using the checked record version. Confirmed retryable attempts retain exponential cooldown and attempt limits; uncertain/failed attempts require reconciliation. Per-release QC locks, the submission lock and cron leases prevent competing workers from creating duplicate sends.

## Verification

- `node --conditions=react-server --import tsx scripts/verify-distribution-automation-policy.ts`
- `node --import tsx scripts/verify-acquisition-isolated.ts --distribution-automation-only`
- `node scripts/verify-distribution-operations-browser.cjs`
- `node scripts/verify-distribution-admin-browser.cjs`
- `node scripts/verify-admin-release-feed.cjs`
- `node scripts/verify-admin-release-delta-feed.cjs`
- `node scripts/verify-distribution-portal-visual.cjs`
- `node --import tsx scripts/verify-direnote-virtual.ts --build`

Database tests use disposable PostgreSQL and private-file fixtures. Read-only provider readiness/identity dependencies are mocked in the focused worker suite; the lifecycle regression exercises the actual QC-to-submission service against a mock HTTP provider. No real release delivery or customer mail is needed for these tests.

The release regression workflow runs `npm run test:distribution-automation` and `npm run test:distribution-operations` on relevant pushes and pull requests.

## Design and contract references

- [Carbon data table guidance](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines): compact rows, toolbars, pagination and expanded details.
- [Carbon notification guidance](https://www.carbondesignsystem.com/building-blocks/core/patterns/notifications): contextual, nondisruptive status and arrival notices.
- [Spotify metadata guidance](https://support.spotify.com/sg-en/artists/article/metadata-formatting-guidelines/) and [Apple music metadata](https://artists.apple.com/support/1119-music-metadata): preserve supplied artist/recording identity and metadata meaning.
- [Internal provider API documentation](https://distribution.direnotemedia.com/dnm_api#artist-object): existing ingestion/support endpoints and repository contract tests remain the integration boundary. Provider names stay in internal integration evidence; customer-facing wording uses HYMN.
