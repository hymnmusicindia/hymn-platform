# DireNote ingest connectivity audit

Audit date: 2026-09-07. Work is uncommitted and not production-certified.

## Incident evidence

Read-only production inspection found Magenta Track 2 with version
`Instrumental`, no flat or nested track language, and album language `Hindi`.
Both retained successful ingest-request logs sent:

```json
{"trackName":"pink","trackLanguage":"Hindi","trackVersion":"Instrumental","explicitLyrics":"No"}
```

This is an exact projection of the relevant logged fields, not the complete
track payload. Ingest success means receipt, not editorial acceptance. The
original user's language selection cannot be recovered from the retained rows.

The old path was: Track Title Language selector -> `TrackDraft.titleLanguage`
-> `metadata.tracks[].metadata.titleLanguage` -> Zod accepts metadata ->
checkout/update-release constructs a new track object WITHOUT metadata ->
track language lost -> `buildDireNotePayload` reads `release.language` for
EVERY track -> canonical client JSON POST `/ingest_content`.

Reload independently defaulted absent track language to English. Draft save
retained nested metadata but paid save discarded it. The repeated request was
rebuilt from the DB, not replayed from an old request; rebuilding still selected
the wrong release-level source.

## Canonical path after repair

Track Language selector -> form state -> API `tracks[].language` ->
`distributionTrackSchema.language` -> paid/draft route -> `Track.metadata.language`
-> `deserializeRelease` -> `readTrackLanguage` -> `tracks[].trackLanguage` ->
final payload validation -> snapshot -> client JSON POST.

Explicit legacy per-track `titleLanguage` values remain readable, including
nested metadata. Missing values are NOT migrated from album language. Existing
legacy title-language values may need artist confirmation as audio language.
No new competing instrumental flag is introduced. The existing Instrumental
version is a consistency constraint; the track language is canonical.

The isolated regression changes only the track selection and proves this
candidate mapped projection reaches the second HTTP request:

```json
{"trackName":"pink","trackLanguage":"Instrumental","trackVersion":"Instrumental","explicitLyrics":"No"}
```

`Instrumental` is confirmed in section 6b of the official
[DNM API v2.2 documentation](https://distribution.direnotemedia.com/dnm_api)
(updated August 21, 2026; checked September 8, 2026), matching the shared form
and validator configuration. Section 5c also confirms that lyrics are optional.
The mock proves connectivity, not acceptance of a specific production release.
No commit/push or production re-ingest is authorized by a mock alone.

## Field Matrix

Sources below refer to `components/release-form.tsx`, `lib/validation.ts`,
the draft/checkout/update API routes, `Track.metadata`/`Release.metadata`,
and `lib/direnote.ts`. CONNECTED means code path inspected; test scope is
reported separately. UNSUPPORTED/UNKNOWN does not mean silently delivered.

| Field | UI / API / DB source | DireNote destination | Mapping / validation | Status |
| --- | --- | --- | --- | --- |
| Release title | releaseTitle / Release.title + metadata | albumname | required; single title equality | CONNECTED |
| Release version | metadata albumVersion/version/edition; no dedicated control | albumVersion | optional string | PARTIAL: metadata-only |
| Release type | releaseType / Release.releaseType | typeOfRelease | single/ep/album -> Single/EP/Album; enum/count | CONNECTED; unsafe fallback removed |
| Primary artist | selected cards -> artistName / Release.artistName | artists[].name + profile URLs | comma-separated names; card lookup; provisioning links | BROKEN card-ID save/reload -> REPAIRED |
| Featuring artists | track featuredArtists | release and track featuring_artists | name splitting; profile lookup | CONNECTED |
| Label | recordLabelName/labelName | labelName | required | CONNECTED |
| Genre/subgenre | release selectors -> genre + secondaryGenre | albumGenre/albumSubgenre; trackGenre/trackSubgenre | shared catalog + friendly alias table; valid pair | CONNECTED; missing subgenre no longer invented |
| Album language | release language selector -> metadata.language | albumLanguage | shared enum | CONNECTED; no longer overwrites tracks |
| Track language | track selector -> API language -> Track.metadata.language | trackLanguage | shared enum, required, explicit legacy reads | BROKEN -> REPAIRED |
| Instrumental | existing version + canonical track language | trackVersion / trackLanguage | inconsistent values blocked | REPAIRED; enum confirmed in official API section 6b |
| Mood | mood selector -> metadata.mood | albumMood | optional free text; no documented mood enum | REPAIRED; unwarranted required checks removed |
| Release date | releaseTiming / scheduledReleaseDate -> releaseDate | trackReleaseDate | date, minimum lead time | CONNECTED |
| Original date | dedicated originalReleaseDate input -> API/metadata | originalReleaseDate | required for transfer, past date, re-release only | BROKEN -> REPAIRED; no longer reuses scheduled date |
| Previously released | releasePreviouslyReleased | releasePreviouslyReleased + track default | Yes/No, existing UPC/ISRC | BROKEN -> API PERSISTENCE REPAIRED |
| UPC | release UPC + provider-owned column | upc | transfer retained; fresh correction omits old UPC | CONNECTED; virtual lifecycle tested |
| C-Line/P-Line | rights controls -> copyrightOwner/publishingRights | cLine/pLine | required, distinct fields | CONNECTED; regression tested |
| Content ownership class | ownership selector -> API contentType -> metadata | contenttype | shared exact aliases, unsupported/missing blocks | BROKEN -> REPAIRED; exclusive-label misclassification fixed |
| AI/beat licence proof | conditional receipt/song URL controls -> API -> metadata | suno_receipt_url, sunoLink, license_receipt_url | conditional required/public PDF; private asset URL signing | BROKEN connectivity -> REPAIRED |
| Cover song licence | cover controls -> isCover, coverLicenseUrl | no documented per-track destination | local rights validation | UNKNOWN PROVIDER CONTRACT |
| Artwork | uploaded private artwork + canonical resolver | cover_art_url | authorized distributor URL, JPEG | CONNECTED |
| Territories | territory selector -> metadata.territory | none in current payload contract | persisted only | UNSUPPORTED / provider destination unconfirmed |
| DSP selections | platforms selector -> metadata.platforms | none in current payload contract | HYMN store state only | UNSUPPORTED / provider destination unconfirmed |
| YouTube Content ID | selector + consent fields | youtubeContentID | boolean -> Yes/No | BROKEN -> PAID API PERSISTENCE REPAIRED |
| Content ID channel/consent | channel URL and monetisation clauses | no current provider destination | retained for HYMN eligibility | API PERSISTENCE REPAIRED; HYMN-only |
| Presave/exclusive dates | release metadata only | presaveSpotify/Apple, exclusiveSpotify/Apple | relative date checks | PARTIAL: no dedicated form controls |
| Admin instructions | metadata adminInstructions/reviewNote/addrequest | addrequest | optional | CONNECTED metadata-only |
| Owner email | server user lookup | owner_email | server-derived, warning if missing | CONNECTED |
| Track title/version | track controls -> title/version | trackName/trackVersion | title required; version optional | CONNECTED |
| Track order | array order + trackNumber | tracks array position | stable IDs/order during correction | CONNECTED; no invented numeric provider key |
| Disc number | no canonical form/DB field | none | none | UNSUPPORTED |
| Track primary artists | selected cards -> primaryArtist | tracks[].artists | names, profile URLs | CONNECTED |
| Remixer | form remixers -> additionalPrimaryArtists | not mapped | role contract unavailable | PARTIAL / UNKNOWN; not silently certified |
| Songwriter/composer | legal-name credits + contributor metadata | songwriters/composers | role filter, IPI/IPRS/socials; first/last names | CONNECTED |
| Producer | producers string + contributor record | producers + contributors | split names / role | CONNECTED |
| Lyricist/publisher | no dedicated canonical controls | no verified destination | none | UNSUPPORTED |
| Explicit | checkbox -> explicitContent | explicitLyrics | boolean -> Yes/No | CONNECTED |
| Lyrics | optional lyrics textarea -> API lyrics -> Track.metadata.lyrics | trackLyrics | optional for all tracks, including explicit content | REPAIRED |
| Audio | upload -> Track.audioUrl / stored asset | audio_url | signed provider delivery; WAV/MP3 | CONNECTED |
| Duration/BPM/key | metadata / upload results | no current provider destination | HYMN-only; checkout BPM/key preservation fixed | CONNECTED locally; UNSUPPORTED provider |
| Dolby Atmos | checkbox -> metadata.dolbyAtmos | none | no spatial-audio delivery contract | UNSUPPORTED |
| ISRC | provider-owned column / transfer input | isrc | transfer retained, fresh correction omits | CONNECTED; virtual lifecycle tested |
| Preview offset | track metadata previewStart | previewStart | preserves zero; legacy default 30 | MAPPING REPAIRED; no dedicated control |
| Vocalist | track metadata vocalist | vocalist | optional | PARTIAL: no dedicated control |
| Credentials | server environment only | pin/client_id | server overwrite; sanitized snapshots | CONNECTED, never customer supplied |

## Verification Scope

- `verify-direnote-field-mapping.ts`: multilingual candidate, golden release and Track 2,
  every configured genre/subgenre and language, invalid/missing language,
  legacy read precedence, API schema, contributor roles/socials, required-field
  null/undefined/empty/whitespace checks, payload diff, exact loopback HTTP body.
- `verify-direnote-lifecycle.ts`: real isolated PostgreSQL, initial ingest,
  ten cron passes, language persistence, current-DB re-ingest, snapshots/diff,
  identifier history, current UPC polling, failures, locks, transfer identity.
- Browser fixture is extended to select Instrumental version/language in the
  real form, submit the real update API, reload, then submit corrections.
  Do not infer a browser pass from the service-level lifecycle pass.
- Existing contract suite is narrower than full payload certification. All
  selector E2E coverage and remaining PARTIAL
  rows must be completed before claiming the user's complete audit is done.

## Operational Safety

No production rows changed. No production ingestion performed. No push.
Attempt payload snapshots and diffs are additive nullable JSONB columns.
Historical snapshots are not fabricated from current metadata. The admin
payload-preview endpoint is permission-gated and omits credential fields.
Signed asset-path tokens and credential query parameters are redacted in
payload diagnostics. Current canonical fields override legacy metadata aliases.
The closed cart drawer was also clipped and made inert after the mobile browser
check proved it doubled the document width.
Production recovery must wait for all quality gates,
and controlled deployment of additive schema before application code.
