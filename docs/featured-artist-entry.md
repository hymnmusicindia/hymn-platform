# Featured artist entry

The [official artist-object contract](https://distribution.direnotemedia.com/dnm_api#artist-object) requires a name, recommends store links for mapping, and requires Instagram when an artist must be provisioned. These rules apply to primary and featured artist objects.

Featured artists now use the same avatar-and-plus interface and shared profile dialog as primary artists. The library offers **Use name** as well as saved cards and profile creation. A name is accepted without a HYMN card only after a unique exact match is confirmed in the integration's account-scoped artist catalogue. This does not associate someone else's card with the customer or claim ownership of the artist. Ambiguous names, incomplete paginated searches and unmatched names require profile details. The shared new-profile flow requires Instagram in that case. Store links can be supplied for accurate mapping.

`POST /api/distribution/featured-artist` is authenticated and rate limited. It returns only the matching decision, never provider credentials, IDs or catalogue records. Lookups use `list_artists`, honor shared provider request reservations and Retry-After limits, and cache decisions in the database for five minutes. Failures are not cached or treated as positive matches. Cancelled or changed searches cannot add stale names.

The server repeats the conditional check during review validation before checkout and during distribution validation/delivery. Names without Instagram must match an existing provider artist; names with profile/Instagram details can be provisioned. A failed check prevents confirmation or delivery rather than silently dropping a featured artist. Primary artist-card ownership and existing identity-confirmation rules are unchanged.

Names, selected card IDs and mixed selections survive draft saves independently. Name-only credits do not consume a saved-card slot. Featured artist names continue to populate release- and track-level `featuring_artists`; selected profiles supply their store links. Remixer delivery behavior is unchanged.

Mixed name-only and saved-card credits are supported in the same track. Name-only guests never inherit the primary artist's Instagram/YouTube details or links from an unselected card that happens to share their name.

Verification:

- `npx tsx scripts/verify-featured-artist-requirements.ts`: exact names, pagination, ambiguity, failed responses and conditional Instagram.
- `node scripts/verify-featured-artist-browser.cjs`: actual release form at 1440px, 390px and 320px, shared artist UI, known names without cards, required new-profile Instagram, failures/cancellation, draft persistence and removal.
- `npx tsx scripts/verify-acquisition-isolated.ts --artist-mapping-only`: real isolated PostgreSQL cache and provider pagination, plus existing artist identity/mapping regressions.
- Existing artist-credit, navigation and submission-feedback browser checks.

Live provider calls require the production API credentials; local verification uses the documented contract and controlled provider responses. No live release is submitted by these checks.
