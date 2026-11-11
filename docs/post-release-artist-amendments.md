# Corrections to existing live releases

Contract reviewed: DireNote API v2.6, updated 18 October 2026, read from
<https://distribution.direnotemedia.com/dnm_api> on 26 October 2026.
The reference renders through JavaScript. Its examples are synthetic; they
must never become production records.

## Corrected delivery model

A post-release correction is a support request against an existing track ISRC.
It is **not** `ingest_content`, a new release, a new UPC assignment or a changed
release date. The release's current delivery attempt and original identifiers
remain current throughout the correction workflow.

The release header opens Requests directly. Old `/distribution/start?amend=ID`
links redirect to that same release's Requests tab. A focused correction form
collects a track, operation, required values or replacement file, and reason.
Customers can track request events and respond to information requests there.

Supported operations:

| Correction | Documented endpoint |
| --- | --- |
| Add a primary/featured artist | `request_add_artist` |
| Remove an artist | `request_remove_artist` |
| Replace with a different artist | `request_replace_artist` |
| Move between primary and featured | `request_swap_artist_type` |
| Replace cover artwork | `request_cover_art_change` |
| Replace the same recording's master | `request_audio_change` |
| Missing on Apple Music or Meta | `request_apple_not_live`, `request_meta_not_live` |

These endpoints require the track to belong to the partner account and be live
on Spotify. HYMN checks local ownership, live release state and existing
identifiers; the partner makes the final catalogue eligibility decision.

Artist replacement requires a different name. Moving the same artist to another
Spotify profile is not artist replacement; it stays in tracked manual review.
Titles, genre, label, dates, rights and other unsupported metadata changes also
use Other release requests. This reference does not document a generic release
metadata update endpoint, so HYMN does not invent one or silently re-ingest.

## Review, receipt and completion

1. Save a tracked correction for HYMN review. This does not edit the live record.
2. An administrator approves, then previews its operation, payload, file details
   and locked UPC/ISRC. Sending requires recent `distribution.submit` permission.
3. A durable pre-send event records the existing ISRC. A timeout, malformed reply,
   missing request ID or uncertain result requires reconciliation, never resend.
4. Only an explicit successful pending request receipt records `support:ID` and
   moves the request to submitted-to-partner. It creates no delivery attempt.
5. The existing ingest-status cron and an admin Check correction status action
   call `list_support_requests` using that exact ID and match its track ISRC.
6. Partner approval moves the request to manual verification, not completion.
   Staff verifies the actual store result before recording completion. Rejection
   records failure without changing the release or identifiers.

Completion projects only the confirmed requested fields into HYMN, with an audit
snapshot. Track artwork remains track-scoped for multi-track releases; a single
track's confirmed cover also updates its release cover. Existing submission
payloads remain immutable. Other metadata continues through reviewed manual
completion. Account notifications and SMTP outbox updates follow request events.

Assets use private managed upload/storage, owner/release binding and checksum
checks. Multipart requests send actual file bytes, not a URL. Artwork must be
JPEG, exactly 3000 × 3000, under 10 MB. Audio must be WAV, 44.1 kHz, stereo,
24-bit, under 100 MB. No arbitrary browser URL is fetched by the support client.

## Legacy requests and deployment

Unsent automatic wizard amendments are quarantined for manual correction review.
The old amendment ingestion entry point is blocked independently in the delivery
service. Existing historical attempts/receipts remain available for reconciliation;
this refactor does not overwrite identifiers already returned by an older send.
The legacy wizard POST can retain an already-open proposal for manual review but
does not enqueue automatic ingestion.

No database migration is required. No production correction or takedown is sent
by deployment or tests. A git push is not confirmation of deployment completion.

## Verification

- `node --import tsx scripts/verify-acquisition-isolated.ts --release-corrections-only`
  runs disposable PostgreSQL and mocked partner calls: ownership, track binding,
  approval, multipart bytes, exact receipts, duplicate/uncertain send protection,
  identifier/attempt preservation, store verification, notification outbox and
  legacy ingestion quarantine.
- `node scripts/verify-release-corrections-browser.cjs` checks the real customer
  component at mobile width, operation fields, existing track selection, submission
  feedback and replacement file guidance.
- TypeScript and targeted ESLint cover changed routes and components.

The older `verify-artist-amendment.ts` and `verify-automatic-amendment.ts` describe
the retired re-ingestion model; use the correction suite above for new writes.
Historical identifier and reconciliation tests remain relevant to old attempts.

## Spotify profile mismatch and legacy live-release recovery

The live v3.1 reference (12 November 2026) still requires `request_replace_artist.new_artist_name` to differ from the existing artist. `update_artist` edits the partner identity record; it does not establish that Spotify moved an existing recording. Neither operation authorizes re-ingestion for a same-artist profile mismatch.

Requests now offer **Wrong Spotify artist profile**, collecting the credited artist, correct Spotify artist profile and existing live Spotify recording URL. HYMN validates ownership, credit and canonical link types, locks the current UPC/ISRC, and tracks a `spotify_content_mismatch` case. Staff records a `spotify:CASE_ID` reference and verifies the actual store result before completion. The case cannot be sent through the recording-correction API. Changing a single recording's mapping never silently rewrites a global artist card.

Spotify's documented route: https://support.spotify.com/us/artists/article/music-mixed-up-with-another-artist/ (content-mismatch form in Spotify for Artists). Existing live delivery status, UPC, ISRC and delivery attempt remain intact.

For historical wizard amendments that incorrectly re-ingested an existing live release, a rejected duplicate can be separated from its original delivery. Recovery requires an original attempt bound to the amendment's locked UPC, exact UPC/unique full ISRC matches for both partner reports, a rejected duplicate, and an independently verified fully live original. The transaction restores the original current attempt, UPC, release date and LIVE status, preserves failed-attempt evidence and immutable payloads, leaves canonical contributor credits intact when legacy snapshots contain incomplete credit data, closes the obsolete re-release request, and creates a mapping-review task. It sends no ingestion, takedown or artist-update write. A failed or incomplete lookup cannot force a live status. Normal status synchronization uses this recovery before applying a rejected legacy duplicate report.

`verify-live-amendment-recovery.ts` runs with the disposable correction database and mocked partner reads. It checks incomplete/wrong proof, original availability, idempotence, identity preservation, mapping validation, case references and absence of re-ingestion.
