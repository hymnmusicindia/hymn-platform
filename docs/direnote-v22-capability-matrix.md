# DireNote DNM API v2.2 capability matrix

Last audited: 2026-08-22

This is the implementation contract for the three documented DireNote endpoints.

## Endpoints

| DNM endpoint | HYMN implementation | Storage / operations | Status |
| --- | --- | --- | --- |
| `POST /ingest_content` | `submitToDireNote`, `submitRelease` | submission claim, release/track identifiers, sanitized logs/audits | IMPLEMENTED |
| `POST /check_release_status` | `getDireNoteReleaseInformation`, `syncDireNoteRelease` | external metadata, canonical identifier history, artist links, discrepancies | IMPLEMENTED |
| `POST /check_revenue_report` | `getDireNoteRevenueReport`, `importDireNoteRevenueReport` | atomic royalty importer, matching/unmatched queues, source fingerprints | IMPLEMENTED |

Calls inject the documented JSON-body `pin` and `client_id` only on the server.
`lib/direnote-rate-limit.ts` reserves at most 95 calls per rolling hour, below
the documented 100/IP/hour ceiling.

## Content-ingestion field coverage

| DNM field(s) | HYMN source / implementation | Status |
| --- | --- | --- |
| `pin`, `client_id` | server configuration and client injection; redacted logs | IMPLEMENTED |
| `albumname`, `albumVersion`, `typeOfRelease` | `buildDireNotePayload`, release form/record | IMPLEMENTED |
| `albumGenre`, `albumSubgenre`, `albumLanguage`, `albumMood` | shared taxonomy and server preflight | IMPLEMENTED |
| `contenttype` | rights metadata normalization | IMPLEMENTED |
| `trackReleaseDate`, `originalReleaseDate` | mapper plus release-date validation | IMPLEMENTED |
| `presaveSpotify`, `presaveApple`, `exclusiveSpotify`, `exclusiveApple` | metadata mapper plus date validation | IMPLEMENTED |
| `labelName`, `cLine`, `pLine` | direct release-field mapping and C/P regression test | IMPLEMENTED |
| `upc`, `youtubeContentID`, `releasePreviouslyReleased`, `addrequest` | release fields/metadata mapper | IMPLEMENTED |
| `cover_art_url` | public JPEG asset mapper and preflight | IMPLEMENTED |
| release `artists`, `featuring_artists` | artist-card/release-credit mapper | IMPLEMENTED |
| `suno_receipt_url`, `sunoLink`, `license_receipt_url` | conditional rights-proof mapping and validation | IMPLEMENTED |
| `tracks[].trackName`, `audio_url` | track mapper and public WAV/MP3 validation | IMPLEMENTED |
| `tracks[].trackGenre`, `trackSubgenre`, `trackLanguage` | inherited taxonomy mapper | IMPLEMENTED |
| `tracks[].isrc`, `trackVersion`, `previewStart`, `vocalist`, `explicitLyrics`, `trackLyrics`, `previouslyReleased` | track metadata mapper/validation | IMPLEMENTED |
| `tracks[].producers`, `artists`, `featuring_artists`, `contributors` | credits mapper | IMPLEMENTED |
| `tracks[].songwriters`, `composers` | contributor mapper with multi-word policy | IMPLEMENTED |
| artist `name`, `spotify_url`, `apple_url`, `youtube_url`, `instagram_url` | profile and metadata mapper; sync conflict reconciliation | IMPLEMENTED |
| writer/composer `name`, `ipi`, `iprs_member`, `instagram_url`, `x_url` | contributor metadata mapper | IMPLEMENTED |

## Provider response and operations

| Capability / documented field | HYMN handling | Status |
| --- | --- | --- |
| Ingestion `message`, `upc`, IDs, warnings | parser, state/audit records and customer notifications | IMPLEMENTED |
| Ingestion track name/ISRC/status | track identifier/status persistence | IMPLEMENTED |
| Status release/track metadata | separately auditable cached provider facts and reconciliation | IMPLEMENTED |
| Status artist Spotify/Apple/YouTube links | fills only empty matching artist-card links; conflicts are flagged | IMPLEMENTED |
| Revenue track/summary/month/breakdown values | canonical normalized records into existing transactional ledger | IMPLEMENTED |
| API/CSV duplicate protection | shared `royaltyEconomicFingerprint` plus importer precheck | IMPLEMENTED |
| Financial atomicity | existing `importRoyaltyStatementAtomic` transaction | IMPLEMENTED |
| Status/revenue scheduling | authenticated bounded cron routes; revenue is opt-in | IMPLEMENTED |
| Safe transient retry handling | idempotent ingestion claim; explicit 400/401/405/429/500 classification | IMPLEMENTED |
| Sanitized API logs/audit trail | `DireNoteLog`, release and financial audits | IMPLEMENTED |
| Customer-safe release status | portal reads cached HYMN facts only | IMPLEMENTED |
| Webhooks | no endpoint or signing contract is documented by DireNote | BLOCKED BY DIRENOTE |
| Bulk/paginated revenue backfill | no bulk/date/pagination contract is documented | BLOCKED BY DIRENOTE |

## Deployment configuration

- `DIRENOTE_INGEST_ENDPOINT`, `DIRENOTE_RELEASE_INFORMATION_ENDPOINT`, `DIRENOTE_REVENUE_REPORT_ENDPOINT`
- `DIRENOTE_API_PIN` / `DIRENOTE_PIN`, `DIRENOTE_CLIENT_ID`
- `CRON_SECRET`, `DIRENOTE_RELEASE_SYNC_ENABLED`, `DIRENOTE_REVENUE_SYNC_ENABLED`, `DIRENOTE_REVENUE_SYNC_ACTOR_ID`

Run `prisma migrate deploy` against production PostgreSQL before enabling the
new routes. Sandbox credentials and a PostgreSQL test database are required for
live-provider certification; HYMN never generates fake identifiers, revenue, or DSP links.
