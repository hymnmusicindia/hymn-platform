# Artist and contributor audit

Verified on 2026-10-28 against the current source and the [official API documentation](https://distribution.direnotemedia.com/dnm_api).

Producer cards now collect `producerArtistName`, not a required legal name. The artist-card role JSON stores the public credit separately from any optional legacy legal name. Older producer cards use the card's artist name for the public credit and retain the existing legal name as optional data. Selecting a producer card automatically fills the required producer artist name and deduplicates by that credit name.

The Songwriters, Composers and Producers tiles each open the corresponding contributor section and focus its required name input. The general Edit credits action remains available.

| Field | Current delivery behavior |
| --- | --- |
| Featured artists | Connected. `buildDireNotePayload` includes `featuring_artists` at release and track level, with selected artist-card store links. Artist mapping verification includes those arrays. They use the content-ingestion endpoint, not a separate featured-artist endpoint. |
| Remixer | Stored only. The wizard saves names in `additionalPrimaryArtists` and profile IDs in `remixerProfileIds`. The payload builder does not send these as remixers. Canonical REMIXER is also deliberately excluded from the supported contributor-role mapper. The form now states that remixer credits are saved for HYMN review only. |

The current official docs expose `list_contributor_roles` and generic track contributors, but do not document a dedicated remixer field. The read-only role lookup could not run because this checkout has no API PIN or client ID configured. Provider acceptance of a remixer role therefore remains unverified; no undocumented role was added and no live release was submitted.

Checks: artist validation, featured/producer payload contract, actual browser profile creation and direct contributor editing at desktop/mobile widths, isolated PostgreSQL artist-card round trips and artist mapping regression, TypeScript and lint.
