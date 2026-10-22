# Artist profile confirmation before another release

An artist card requires a Spotify confirmation on another release once an explicitly
associated recording is live. HYMN checks release/card IDs, including featured
artist associations, rather than matching names or trusting `hasLiveMusic` input.
For a partially live release, the associated track itself must be live.

Before checkout (and before uploading paid corrections), the form requests the
server's pending checks. Each pending artist must have a valid HTTPS Spotify
**artist** URL. The customer opens that exact URL and explicitly approves it.
Changing the URL resets the open/approval controls. This records customer
attestation; it does not claim independently verified Spotify account ownership.
The dialog supports keyboard dismissal, focus containment and mobile scrolling.

Customers can correct Spotify, Apple Music, YouTube channel and Instagram links.
Corrections require explicit approval and become defaults for this and future
releases. A missing first-release Spotify link must therefore be supplied before
the next submission. All customer copy uses HYMN branding.

## Mapping isolation

`release_artist_identities` is server-owned and separate from user-editable release
metadata. It stores the approved URLs, card/selection fingerprint, owner approval,
opened Spotify URL, previous provider identity and the new provider binding.
First-release mappings are frozen at review. Before a normal card edit or popup
correction, HYMN snapshots every old explicitly associated release that lacks one.
Old ingested requests remain in submission history; a correction does not rewrite
them. Legacy releases with no explicit card association are not guessed by name.

Payload building uses the release snapshot at album and track artist levels. Audio,
artwork, UPC/ISRC, credits, pricing and other release fields retain their existing
paths. Profile approval is checked separately from the payment quote and metadata
review hash. Review, checkout, verify-submit, paid edits and delivery all enforce
the server-side gate. An edited card/selection invalidates draft approval.

A corrected default clears only the card's **current provider artist binding**;
historical release bindings remain untouched. It also clears a stale Spotify photo
when the Spotify identity changes. Card changes, approvals and ingestion identity
binding share the card advisory-lock namespace `81422030`; approvals also respect
the existing release submission lock. Delayed responses cannot rebind a different
current identity. Async and synchronous binding check the current submission's
saved payload, not just the artist name. Status sync also respects frozen mappings.

## Provider contract and limits

The documented API is <https://distribution.direnotemedia.com/dnm_api>.
`/check_artist` reads stored mappings; `/update_artist` can fill missing mappings.
HYMN's existing guard never replaces a nonempty conflicting historical store link.
The API has no documented standalone create-artist or create-partner-user endpoint.
HYMN sends the approved explicit links through `/ingest_content`, then saves the
artist ID returned by synchronous ingestion or `/ingest_status`.

Consequently, a correction creates a separate **local mapping**, not a fabricated
provider ID or a new partner client account. The provider may create or reuse an
identity according to its documented link matching. An identity already associated
with a conflicting known historical mapping is quarantined as a critical
reconciliation discrepancy and an admin mapping-review task. Accepted ingestion is
never repeated to try to obtain a different ID. Newly discovered links may enrich
previously unknown identities without treating that as a conflict.

This does not automatically move songs already live on the wrong Spotify page.
Existing catalogue placement needs the distributor/Spotify correction process:
<https://support.spotify.com/ca-en/artists/article/music-mixed-up-with-another-artist/>.

## Deployment and verification

Apply `20261022150000_release_artist_verification` before deploying application
code. It only creates the new table and indexes. The guarded deployment helper
`scripts/deploy-artist-verification.ts --apply` verifies the canonical database and
owner, rejects unrelated pending migrations, and verifies a local gzip snapshot of
artist mappings and release associations before running the migration deploy tool.

Checks:

- `node --import tsx scripts/verify-acquisition-isolated.ts --artist-verification-only`
  rehearses the SQL migration from the previous schema in disposable PostgreSQL,
  then checks approval, ownership, payload isolation, corrections, asynchronous
  identity protection and the existing artist-mapping regression suite.
- `node scripts/verify-artist-profile-verification-browser.cjs` checks the actual
  dialog at 390px and 1440px, link opening, edit/reset behavior, explicit consent,
  cancellation and overflow, with all API/Spotify traffic intercepted.
- TypeScript, targeted ESLint, provider contract and field-mapping checks.

No test sends mail, submits music, or calls the live provider.
