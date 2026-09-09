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
5b also states that Instagram is mandatory when DireNote provisions a new artist.
Both artist creation paths require Instagram, matching provider provisioning
requirements. The provider submission preflight remains intact. No live ingestion
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
