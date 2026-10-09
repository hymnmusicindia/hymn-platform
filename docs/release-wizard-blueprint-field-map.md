# Release wizard presentation map

The LANDR recording and blueprint guide the interface only. The canonical draft, checkout and DireNote contracts remain in the existing routes and `lib/direnote.ts`. This map records the controls touched by the presentation refactor; it does not treat reference limits or example values as HYMN requirements.

| UI area | Existing state and handler | Validation / persistence | DireNote mapping or boundary | Regression check |
| --- | --- | --- | --- | --- |
| Release type and title | Track count derives Single, EP, or Album; the release title is entered in Release info | `releaseInfoIssue`, draft `wizardFormatIntent` | `releaseType` to `typeOfRelease`; title to `albumname` | `test:release-status`, isolated browser fixture |
| Primary artists | `tracks[].primaryArtistIds`, `ArtistPicker`, `selectPrimaryArtistForAllTracks` | `primaryArtistComplete`, artist profile validation, draft `artistProfileIds` | canonical artist identities → `artists` and track `artists` | `test:first-release`, DireNote contract, isolated browser fixture |
| Audio and track order | `tracks[].id`, `handleAudioBatch`, `handleAudioFile`, `reorderTrack` | Resumable `/api/uploads/sessions`; audio checked in Music and titles checked in Track details | Stored track audio URL to `audio_url`; title to `trackName` | `test:storage`, DireNote contract, isolated browser fixture |
| Cover | `artworkFile`, `handleArtwork`, `artworkPreview` | `validateArtwork`, private asset upload, `artworkIssue` | stored artwork URL → `cover_art_url` | `test:storage`, isolated browser fixture |
| Release metadata and rights | `release`, `setRelease`, prefills accepted through `resolvePrefill` | `releaseInfoIssue`, draft snapshot and review | language, genre, date, label, `cLine`, `pLine`, UPC through existing builder | DireNote field and contract checks |
| Track metadata and credits | `tracks[]`, `updateTrack`, contributor editors | `trackIssue`, contributor validators, draft `metadata.tracks[]` | language, ISRC, explicit flag and structured songwriter/composer/producer credits | DireNote field and contract checks |
| Destinations and acknowledgements | `platforms`, `togglePlatform`, `legal`, `setLegalDeclarationAccepted` | `destinationsIssues`, review confirmation and existing checkout guards | store selection follows existing order/submission routing; acknowledgements are not invented provider fields | `test:payment-enforcement`, isolated browser fixture |
| Autosave and final review | `autosaveSnapshot`, `retryAutosave`, `enterReviewMode`, `handleFinalSubmit` | versioned `/api/distribution/drafts/[id]` PATCH; existing payment/submit endpoints | no provider call from UI section navigation; actual status comes from server sync | `test:distribution-idempotency`, isolated browser fixture |

The interface adds no new provider fields, endpoint, schema, or status. AI suggestions and reference-only capabilities remain outside this change. The isolated fixture uses its own PostgreSQL database and mock provider; it does not submit a live release.
