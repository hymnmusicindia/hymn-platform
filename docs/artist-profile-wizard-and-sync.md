# Artist profile creation and store-link synchronization

The artist modal is rendered through a portal to `document.body`, outside the
release form's transformed and clipped track containers. It centers in the
viewport with a dimmed, blurred backdrop, a scrollable body, persistent actions,
keyboard focus containment, Escape dismissal and a page scroll lock.

Creation starts with an explicit store-profile choice. First-release artists
provide their public name and Instagram handle or profile URL. Their canonical
artist card is persisted with Instagram and null store identities. Existing
artists continue through name, Spotify,
Apple Music, Instagram, YouTube and optional producer credits. Spotify can be
skipped to provide an Apple Music identity. Changing paths preserves the name
and clears unused store selections; first-release requests include Instagram.
Editing a first-release card also
collects Instagram, allowing previously saved incomplete profiles to be repaired.
No new artist table or database migration is introduced.

The existing hourly DireNote sync reads the documented `tracks[].artist.links`
response. A matched track's saved artist IDs (or its release's canonical artist
relation as fallback) restrict candidates before matching the returned name.
No account-wide name lookup or new card creation is performed. Only validated
Spotify artist, Apple artist and YouTube channel URLs are accepted. Spotify and
Apple IDs are persisted along with URLs. Partial discovery is supported; repeat
polls reuse the same card. Conflicts create a review discrepancy rather than
replacing a verified identity. Saved cards expose links when reloaded/opened.

Provider contract checked: https://distribution.direnotemedia.com/dnm_api
(v2.2, checked 2026-09-09). The status response documents artist links. Section
Instagram is optional in artist creation, editing, selection, and delivery preflight.
Supplied social links are still validated; existing artists still need a store link.
Other provider submission requirements remain intact. No live ingestion
is used for testing.

Verification commands:

```text
npm run test:first-release
npm run test:direnote-fields
npm run test:direnote-e2e
```

The browser suite covers both wizard paths, Apple-only existing identities,
desktop centering, mobile layout, back navigation and Instagram API persistence.
The isolated PostgreSQL suite executes the actual hourly handler with mock
artist links and checks attachment boundaries, partial discovery, stored IDs,
conflicting links, idempotency and malformed URLs. Deployment scheduling still
requires an actual hourly Hostinger/hPanel trigger when hosted on Hostinger;
the repository's Vercel cron configuration alone does not configure Hostinger.

## DireNote artist endpoint enrichment

The existing `check_artist` endpoint is called after submission once DireNote
returns an artist ID. The hourly release-sync handler now prioritizes up to ten
associated artist cards missing Spotify or Apple Music URLs, retrying no sooner
than one hour after a successful lookup. Fully linked cards retain the weekly
refresh. This handles store pages that are created several days after ingestion.
The artist endpoint fills validated Spotify/Apple artist URLs and IDs, YouTube
channel URLs, and Instagram links when missing. Partial results stay on the same
artist card and appear in the artist picker on its next fetch.

All matched tracks are processed even when an earlier artist changed. Provider
artist-ID conflicts stop link propagation for that record. Endpoint updates use
compare-and-set writes so concurrent artist edits are preserved. No migration
or new credentials are required. Hostinger still needs the existing authenticated
hourly `/api/cron/direnote-release-sync` job to be scheduled.

`npm run test:direnote-virtual` includes the isolated PostgreSQL regression
`verify-direnote-artist-enrichment.ts`: multiple track identities, staged provider
links, hourly retries, duplicate prevention, mismatched names and concurrent edits.
All provider calls in that regression are intercepted locally; it sends no real
releases or emails.
