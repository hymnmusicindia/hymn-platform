# Distribution services: artist workflow and operations

Implemented against the [official DireNote v3.1 reference](https://distribution.direnotemedia.com/dnm_api), verified 11 November 2026. HYMN customer pages, notifications and email use HYMN branding. Partner identifiers, request receipts and signed event evidence remain internal.

## Where each feature lives

| Feature | Artist entry | Staff entry |
| --- | --- | --- |
| Missing Instagram/Facebook music | Live release → Appeal Meta availability; Requests | Existing amendment review and technical-request automation |
| Instagram/Facebook artist linking | Release → Requests → Profiles; Promotion → Link artist profiles | Admin → Distribution → Distribution services |
| YouTube Official Artist Channel | Release → Requests → Profiles; Managed services links new OAC requests to this workflow | Distribution services; legacy requests remain visible in Managed services |
| YouTube, Facebook, TikTok and SoundCloud claim release | Release → Requests → Rights and claims | Distribution services with rights review |
| Official music video delivery | Release → Promotion → Distribute an official music video; Requests → Video | Distribution services with media/metadata review |
| Master collection registration | Release → Royalties → Register master collection rights; Requests → Rights and claims | Distribution services with share, period and authorization review |
| Full-store takedown | Release → Requests → Removal | Distribution services, requiring takedown permission |
| Verified store link | Release → Promotion | Existing catalogue tools |
| 25 live royalty report endpoints | Delivered release → Royalties → Release revenue insights | Distribution services → Partner account revenue insights; royalty reconciliation permission |
| Current reference lists | Release metadata editor; Requests → Accepted delivery values and rights societies | Existing catalogue reference tools |
| Signed release, video, request, payout and copyright events | Reconciled release/request status; matched rights claims also produce notifications and email | Distribution services → Signed event reconciliation; admin tasks |

Request history stays accessible during and after takedown. New requests are disabled when a release is no longer eligible. Services use the existing recording's confirmed UPC and ISRC; video identifiers are recorded separately and never replace audio identifiers.

## Submission and completion

### YouTube OAC in the distribution wizard

The Delivery step, release Requests and Managed services use the same artist-level OAC card and accessible popup. Opening it does not navigate away or submit the surrounding release form. It preserves draft progress, traps focus, supports Escape/close, and restores focus. The artist can switch profiles inside the popup; status is refreshed every 30 seconds while the page is visible.

Only `https://www.youtube.com/channel/UC` followed by the remaining 22 channel-ID characters is accepted for new applications. Handles, custom/user URLs, videos, shortened links, tracking queries and trailing slashes are rejected on the client and server. This is HYMN's stricter submission format; the partner contract accepts a YouTube channel URL plus a matching 24-character ID. The popup links to YouTube advanced settings and derives the ID automatically. It collects a request note and channel-ownership authorization. Five fully live releases and a verified owned artist profile remain server-enforced; HYMN selects an existing live recording for the audit trail, so artists do not need to choose an arbitrary recording.

OAC is registered once per artist channel. Requests for the same artist across releases share status and duplicate protection. HYMN review approval and a submission receipt show **Under review**; a verified partner approval or completed request shows **Approved**, with **View channel**. An approved/active application cannot be submitted again. Earlier managed requests remain read-only and block duplicate applications; unresolved legacy outcomes need staff reconciliation.

Rejected applications show the recorded reason. A fresh application after rejection requires **INR 80**, clearly disclosed before checkout; first applications do not incur this resubmission fee. Technical transport failures alone do not trigger that fee. The payment order is saved as `distribution_orders.plan = youtube_oac_retry`, with immutable application intent, source request and fingerprint. Browser verification requires a valid payment signature and a gateway-confirmed captured INR 8000-paise payment. Signed Razorpay webhooks and the existing financial reconciliation worker can also recover fulfillment. Payment and application replay create only one request, and the payment is consumed atomically with request creation. Changed intent, ownership, amount/currency, reused/reversed payments and ordinary release-checkout reuse are refused. An OAC refund does not cancel a distribution subscription. The existing acquisition revenue ledger records the actual fee; OAC retries do not grant distribution entitlement or referral qualification. No new database migration is required.

If capture succeeded but confirmation was interrupted, the popup provides **Retry payment confirmation** or **Resume paid application**, without opening another checkout. The financial reconciliation worker raises an OAC recovery task if a paid intent cannot be fulfilled. Staff must resolve changed source identifiers or ownership before further action, rather than charge again.

**Request channel change** on an approved OAC opens guided instructions and an owned, deduplicated support case containing the current channel, proposed canonical channel URL, reason and authorization. The documented API has no OAC amendment endpoint. Staff must confirm the supported change process with the partner and then record the outcome; this flow never blindly files another OAC request or replaces an approved channel. Support is reachable from the saved case through `/dashboard?tab=support`.

`GET /api/distribution/oac?artistId=…` returns only owned artist choices and sanitized status. Same-origin authenticated `POST /api/distribution/oac` handles applications, payment verification/recovery and channel-change requests. Generic release-service submission enforces the same paid-retry and approved-channel rules, and the older managed-service creation endpoint cannot bypass them.

New services use `release_change_requests` with request type `distribution_service`; no new schema migration is required. The existing request-events, admin-task, notification and release-email outboxes are reused. Existing creative/technical corrections retain their original workflow. General amendment review cannot complete or submit service requests through the wrong path.

1. The artist selects the service and recording, supplies its required fields and evidence, and confirms authorization. Claims and Instagram linking require Spotify availability evidence. Public video links must be permanent HTTPS links; the partner validates MP4, JPEG dimensions/size and MP3 format/size during processing. Queue acceptance is not media validation or store publication.
2. HYMN verifies account ownership, live/delivered eligibility, identifiers and service-specific rules. OAC requires a verified artist profile and at least five live releases. Earlier active legacy OAC requests block duplicates. Video uses its own audited genre/subgenre and language vocabulary and a release date at least three days away in India time. Master registration requires a positive share no greater than 100 and a valid collection period.
3. Staff review the exact saved payload. A changed recording, profile or owner invalidates the reviewed request. Submission requires recent `distribution.submit` access and typed `SEND <request number>` confirmation. Review/completion requires recent `updates.review`; takedown actions additionally require `takedowns.review`.
4. Before contacting the partner, a durable send event and request state are committed. Concurrent clicks cannot send twice. Video uses a stable server-generated ingestion idempotency key. API credentials are injected on the server and cannot be supplied by the artist.
5. A verified request/work/job receipt starts tracking. Definite validation/authentication/rate-limit refusals fail the request with a reviewable outcome. HTTP 409, network timeouts, malformed receipts and ambiguous server outcomes remain in manual reconciliation; they are never automatically resent. Exact prior claim/takedown receipts can be recovered by read-only lookup. Video can be recovered by its idempotency key, and collection by ISRC plus the exact period/share. If returned fields cannot prove identity, staff must contact partner support rather than guess an ID.
6. Partner approval is not completion. Profile/claim/OAC changes and video store outcomes require staff to verify the actual result before completing. Published master registrations are completed only after the work identity, period and share match. Full-store removal enters `TAKEDOWN_PROCESSING` after a verified receipt and `TAKEN_DOWN` only after approval plus staff verification. A declined removal restores only the live projection belonging to that same request; it cannot undo another removal or reset the catalogue's live-age evidence. Identifiers remain unchanged.

Full takedowns require 90 days live. A known recent HYMN live transition blocks an early request; older imported catalogue with no local live-date evidence must be checked by staff. The partner also enforces its own 90-day rule. Partial store/territory removals remain in the existing reviewed workflow, since the new API endpoint only supports full removal.

Public video links are supplied by the artist; this does not introduce an MP4 hosting product or charge a new fee automatically. Staff must verify any service-specific commercial terms before approving. Master collection and reporting do not create wallet credits or promise royalty earnings.

## Read APIs and privacy

Artist analytics always receive both server-selected UPC and owned ISRC filters. A selected track ID must belong to the release. The response must echo that exact scope and requested currency; foreign recording rows or unverified scopes are withheld. Reports are bounded to less than ten years and paginated. USD and other reporting currencies are displayed explicitly; no conversion or wallet mutation is inferred. Administrative account-wide reporting uses a separate permission-protected endpoint.

Reporting reads use a 15-minute cache keyed by operation, identifiers, filters and configured partner identity. Smart links use a one-hour cache and must confirm the owned UPC and an HTTPS `dnm.link` destination. Reference lists use a 24-hour cache. References are searchable lookup aids; they do not silently change a draft's saved metadata. Video and audio taxonomies remain separate.

All outbound requests share the existing persistent provider budget and Retry-After cooldown. Service polling runs through the existing `direnote-ingest-status` worker: pending video jobs become eligible after 30 seconds, metadata/collection requests after 15 minutes. Approved outcomes awaiting staff verification do not consume repeated polling calls. New work is bounded per pass; manual status reads remain available.

## Signed webhook activation

1. Deploy this code using the normal HYMN release process.
2. Set server-only `DNM_WEBHOOK_SECRET` (or `DIRENOTE_WEBHOOK_SECRET`) to the signing secret issued by the distribution partner. This is separate from the API PIN.
3. Have the partner register `https://hymnmusic.fun/api/webhooks/direnote` for the same account. The staff screen shows the configured endpoint and whether a signing secret is present; it never displays the secret. The documented API has no registration endpoint, so this account setup remains external.
4. Keep the existing ingest/status and release-email cron jobs enabled. Verify a legitimate signed event in the staff event monitor after activation. A successful Git push is not confirmation of deployment or partner registration.

The receiver verifies HMAC-SHA256 over timestamp plus exact raw bytes, checks the five-minute signing window and event headers, limits body size, and saves an inbox record before acknowledging. Event IDs are serialized across app instances; same-ID different-payload deliveries are refused. Unknown event types are acknowledged and ignored. Unsigned ingestion callbacks are not treated as signed events.

Reconciliation reads current state instead of applying lifecycle values from event order. Delayed rejection events cannot overwrite a newer verified live status. Request/video identities must match saved receipts. Settlement events create staff reconciliation tasks and never touch customer wallet/payment credit handlers. Copyright claims produce urgent tasks with response deadlines; only a uniquely matched current release notifies an artist, and actual claimant/artist names are preserved. Unmatched claims still alert staff immediately. A claim alone is not evidence of infringement.

Read failures retry with backoff; abandoned processing leases recover after ten minutes. Six failed attempts create a staff exception. Administrators with recent `system.manage` permission can retry read-only reconciliation. This never repeats a provider write.

## Verification

### Guided Requests workspace

The Requests tab starts with six goal-based choices: release corrections, artist profiles, content claims, video delivery, master collection and removal. Only the selected service opens. Artist profiles and claim platforms are grouped rather than displayed as nine competing services. OAC retains its dedicated artist-level popup and paid-retry safeguards.

Standard service requests use Recording → Details → Instructions → Review; video separates media files from video metadata. The review page allows changes to each section while retaining the other answers. No request is sent while advancing or checking answers. Shared service validation catches incorrect links and incompatible details before submission; final checks and server validation remain authoritative. A failed send preserves answers and its submission key. Draft answers are held in memory for the current release only.

Track requests combines distribution service history with earlier release changes and Meta appeals. Status filters, attention counts and expandable cards replace always-visible notes and event lists. Each card keeps its instructions, current HYMN response and dated activity together. Earlier information requests link to the existing secure response workflow. New-service duplicates are checked per recording; OAC identity and duplicate checks remain artist-scoped. History failures block new submissions until status can be refreshed, and stale responses from a different release cannot update the current workspace.

The correction tools, Meta availability form, reference browser and earlier update/removal wizard are available through **Fix release details** and **Release changes & additional help**. Response-needed legacy requests expand that area automatically. These forms and their endpoints are unchanged.

The design uses progressive disclosure and a check-answers stage, informed by [Nielsen Norman Group](https://www.nngroup.com/articles/progressive-disclosure/), [GOV.UK question-page guidance](https://design-system.service.gov.uk/patterns/question-pages/) and [GOV.UK check-answers guidance](https://design-system.service.gov.uk/patterns/check-answers/). These patterns guide presentation; they do not imply testing with HYMN artists. Automated browser checks cover the grouped entry page, all eight standard service flows, retained answers, editing from review, no early submission, platform validation, duplicate blocking, unified tracking and OAC at 320/390/1440 pixels.

`npm run test:distribution-services` runs disposable PostgreSQL integration checks, responsive component/browser checks at 320/390/1440 pixels, and navigation/permission checks. Provider HTTP and email delivery are simulated; tests submit no production releases, rights requests or artist emails.

Coverage includes every new write/receipt family and all 25 analytics endpoints, ownership and cross-origin denial, unreviewed/duplicate/concurrent send prevention, immutable audio IDs, source changes, invalid URLs/dates/shares, exact payload fields, receipt recovery, uncertain outcomes, currency/scope isolation, cached reads, actual route authorization, raw signature tampering, stale/future timestamps, duplicate/conflicting event IDs, oversized webhook bodies, delayed events, one-time claim notifications, settlement isolation, takedown lifecycle, server-error form recovery, active-request disabling, staff confirmations, reporting and reference navigation.

`npm run test:distribution-services:build` additionally builds Next against that fixture database. Persistent Webpack caching is disabled only for this disk-limited validation build using `HYMN_BUILD_DISABLE_CACHE=true`; normal builds retain their existing caching behavior.

Live acceptance, media validity and account entitlements cannot be proved by simulated tests. Verify the first real approved request for each service and the registered webhook after deployment. Do not submit documentation examples as real releases.
