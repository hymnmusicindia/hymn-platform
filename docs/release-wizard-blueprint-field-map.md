# Release wizard presentation map

The LANDR recording and blueprint guide the interface only. The canonical draft, checkout and DireNote contracts remain in the existing routes and `lib/direnote.ts`. This map records the controls touched by the presentation refactor; it does not treat reference limits or example values as HYMN requirements.

| UI area | Existing state and handler | Validation / persistence | DireNote mapping or boundary | Regression check |
| --- | --- | --- | --- | --- |
| Format and release title | `formatIntent`, `release.releaseTitle`, `confirmFormatAndOpenArtists` in `components/release-form.tsx` | `formatIssue`, `releaseInfoIssue`, draft `wizardFormatIntent` | `releaseType` → `typeOfRelease`; title/Single track title → `albumname` | `test:release-status`, isolated browser fixture |
| Primary artists | `tracks[].primaryArtistIds`, `ArtistPicker`, `selectPrimaryArtistForAllTracks` | `primaryArtistComplete`, artist profile validation, draft `artistProfileIds` | canonical artist identities → `artists` and track `artists` | `test:first-release`, DireNote contract, isolated browser fixture |
| Audio and track order | `tracks[].id`, `handleAudioBatch`, `handleAudioFile`, `reorderTrack` | resumable `/api/uploads/sessions`, `trackIssue`, draft `clientTrackId` and `trackNumber` | stored track audio URL → `audio_url`; title → `trackName` | `test:storage`, DireNote contract, isolated browser fixture |
| Cover | `artworkFile`, `handleArtwork`, `artworkPreview` | `validateArtwork`, private asset upload, `artworkIssue` | stored artwork URL → `cover_art_url` | `test:storage`, isolated browser fixture |
| Release metadata and rights | `release`, `setRelease`, prefills accepted through `resolvePrefill` | `releaseInfoIssue`, draft snapshot and review | language, genre, date, label, `cLine`, `pLine`, UPC through existing builder | DireNote field and contract checks |
| Track metadata and credits | `tracks[]`, `updateTrack`, contributor editors | `trackIssue`, contributor validators, draft `metadata.tracks[]` | language, ISRC, explicit flag and structured songwriter/composer/producer credits | DireNote field and contract checks |
| Destinations and acknowledgements | `platforms`, `togglePlatform`, `legal`, `setLegalDeclarationAccepted` | `destinationsIssues`, review confirmation and existing checkout guards | store selection follows existing order/submission routing; acknowledgements are not invented provider fields | `test:payment-enforcement`, isolated browser fixture |
| Autosave and final review | `autosaveSnapshot`, `retryAutosave`, `enterReviewMode`, `handleFinalSubmit` | versioned `/api/distribution/drafts/[id]` PATCH; existing payment/submit endpoints | no provider call from UI section navigation; actual status comes from server sync | `test:distribution-idempotency`, isolated browser fixture |

The interface adds no new provider fields, endpoint, schema, or status. AI suggestions and reference-only capabilities remain outside this change. The isolated fixture uses its own PostgreSQL database and mock provider; it does not submit a live release.
