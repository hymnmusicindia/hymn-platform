# Post-release artist-profile amendments

Approved Spotify profile amendments now have an explicit delivery path, separate
from the existing manual metadata/takedown request workflow. Customers request
“Spotify artist profile” under release requests. An administrator approves the
request, previews its locked identifiers and redacted payload, then sends it with
`updates.review` plus a recent `distribution.submit` permission. A preview revision
binds the request, artist card, assets and original identifiers; stale previews
cannot execute. Other metadata amendments remain in their existing manual process.

The transport payload alone marks release and tracks as previously released,
supplies the original release date, and selects a delivery date three days ahead.
These flags do not change the customer's original declaration or display a
re-release switch. Expired presave/exclusive campaign dates are not reused.
The approved Spotify URL is sent at release and track artist levels. The old
provider artist is never updated to a different nonempty Spotify mapping.

The UPC is omitted so DireNote can assign one. Existing ISRCs are supplied for the
same recordings, following IFPI's unchanged-recording rule. HYMN saves the actual
valid identifiers returned by the provider; it does not manufacture replacements.
References: <https://distribution.direnotemedia.com/dnm_api> and
<https://isrc.ifpi.org/why-use-isrc/when-not-to-assign>.

## Identifier locking and history

- Before assignment, the original UPC and ISRCs remain the displayed identifier
  set. Durable history rows lock those values against the new attempt.
- The new attempt's unresolved UPC/ISRCs remain null. Status reconciliation must
  never mistake the displayed old identifiers for new provider assignment.
- A partial or malformed assignment cannot produce a mixed identifier set.
  Only a full valid UPC plus one matched ISRC per track switches the projection.
- The previous attempt, payload, UPC and track identifiers remain in submission
  history. Changes are also recorded in `external_identifier_history`.
- Provider receipt and assignment are separate from final store confirmation.
  Completion requires a live report with the exact approved Spotify profile.
  A mismatched/missing profile opens an admin mapping review without re-ingestion.
- A failed queued amendment restores the preceding live attempt and per-release
  mapping. The original catalogue and its identifiers remain current. The failed
  amendment and its diagnostics remain in history.

Automatic retries cannot bypass unresolved submissions. Accepted amendment
requests are replay-safe. A corrected card remains the default for future releases
while historical delivery mappings stay isolated. Amendments use dedicated customer
notifications and emails; ordinary release-status emails are suppressed during
amendment execution to avoid contradictory new-release messages.

Internal receipt metadata/payload flags are admin-only. Customer request-event
responses expose notes/statuses, not internal execution metadata. No production
migration is needed beyond the artist verification table from the preceding change.

## Verification

The release header's **Amend release** action opens
`/distribution/start?amend=<owned release ID>`. This uses the existing distribution
wizard with the prior metadata, credits and assets pre-filled. It never changes a
live release to Draft, creates a checkout, or edits its recording identifiers.
The original UPC/ISRC set is displayed as locked; the server independently rejects
identifier changes, track additions/removals and track-number/ISRC remapping.
Missing masters can be restored through the existing managed upload flow.

Wizard submissions are stored as complete proposed metadata in a tracked HYMN
review request, with a server-signed content revision and replay fingerprint. The live
release is unchanged. An earlier unsent legacy request can be replaced with the
complete wizard proposal, invalidating its previous approval. A different pending
wizard proposal or a request already sent to the partner cannot be overwritten.
The source revision covers editable metadata, assets, credits and original
identifiers. Background status polling, sync timestamps and analytics do not
invalidate an open amendment. Actual content changes still require a fresh review.
The admin queue exposes the submitted metadata and locked identifiers for review.
General wizard amendments use the existing tracked manual partner review process;
the automated endpoint described above remains specific to Spotify link amendments.

After a successful wizard submission, a confirmation screen identifies the saved
request and links directly to its details. An existing pending request opens its
confirmation and tracking view; it never claims a second set of changes was saved.
Release cards, list views and the release header display the amendment's own status
independently of the live release status. The details page refreshes status on focus
and periodically, and shows an immutable before/after summary and event history.
Owners can respond when HYMN requests additional information.

Request creation, administrative decisions, automatic partner acceptance, failure
and verified completion write a unique account notification and durable email job
in the same database transaction. The existing SMTP outbox delivers and retries
these jobs. Amendment email validity follows the request's status and proposal
fingerprint, rather than the release's general status. Stale progress messages are
cancelled; historical submission receipts survive normal review progression. A
bounded repair job finds recent acknowledgements missing a notification or email.

General wizard amendments still require HYMN to record partner execution and its
reference. On recorded completion, reviewed metadata, assets and credits are applied
to the same local release and track IDs. Original UPC/ISRCs and publication dates
remain unchanged, with a full before-projection in the audit trail. A changed source
revision blocks completion rather than overwriting a newer release. This does not
pretend that a manual decision executed a provider API call.

Additional checks:
`node --import tsx scripts/verify-amendment-wizard-identifiers.ts`,
`node scripts/verify-amendment-wizard-route.cjs`, and
`node scripts/verify-amendment-wizard-browser.cjs`. The isolated suite also runs
`verify-amendment-feedback.ts`, including mocked SMTP, lifecycle guards, completion
projection, immutable identifiers, notification repair and duplicate prevention.

`node --import tsx scripts/verify-acquisition-isolated.ts --amendment-identifiers-only`
uses disposable PostgreSQL, intercepted provider responses and disabled email.
It tests pending/partial/malformed/full assignments, no fallback to old UPC,
admin approval, internal flags, supplied original ISRC, assigned UPC, mapping at
all artist levels, scoped polling, replay prevention, final profile verification,
rollback after job failure and immutable historical payloads.

The live test requested for Deepan's “Tere Bin Jiyun Kaise Bata” is release 25,
original UPC `3473620314135`, ISRC `INDN22602494`. The approved destination is
`https://open.spotify.com/artist/0cevmXPSNfo7KO9xeE7M3m`. Its saved audio references
missing stored asset 65. The operator subsequently supplied the original WAV:
stereo, 24-bit PCM, 44.1 kHz, 252 seconds, 66,769,458 bytes. The owner has since submitted a wizard amendment with an updated master reference.
The live release remains unchanged while that request is reviewed; no new identifiers should be reported until the provider
actually assigns them. The artist card default was updated with all four previous
release mappings preserved, and an approved operator request was prepared with a
local backup of the original release/attempts.
