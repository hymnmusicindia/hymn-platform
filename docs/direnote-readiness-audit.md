# DireNote Readiness and Contract Audit

Source: [Official DNM API v2.2](https://distribution.direnotemedia.com/dnm_api),
checked September 8, 2026. The complete field-by-field mapping inventory is in
[the field mapping audit](direnote-field-mapping-audit.md).

## HARADO TEST

Read-only production inspection confirmed release 18 has one persisted track,
English track language, Original/Exclusive Licensed ownership, and ready JPEG
artwork. The canonical production-mode payload has one track, a .jpg delivery
URL, and zero readiness issues. No production records were modified or submitted.

The admin queue could display a fallback release while fetching readiness for
the original selected ID. Requests were also neither cancelled nor scoped on
completion. These two bugs allowed unrelated two-track warnings to appear under
the one-track release header. Readiness and audit requests now use the displayed
release ID; readiness responses carry their ID, stale responses are discarded,
and handoff waits for that release's readiness check to pass.

## Artwork

The customer-facing artwork route is not a filename. Resolving it must recover
the linked StoredAsset or the existing legacy public URL before format checks.
Legacy public JPEGs now resolve instead of being validated as an extensionless
display route. Existing private upload validation checks JPEG magic bytes, MIME,
and filename; no PNG is renamed and passed off as JPEG. Diagnostics distinguish
an actual PNG filename from an unresolved delivery filename.

## Official Options and Endpoints

The automated public-document comparison verifies all 32 genre families, every
subgenre, all 42 languages (including Instrumental), three ownership categories,
and the three configured default endpoint URLs. It uses browser DOM tables, not
a manually guessed vocabulary. Mood is optional free text, so the UI's mood
suggestions are not represented as an official fixed enum. Empty mood and the
document's Happy, Sad and Energetic examples are accepted, as is Empowering.

All provider operations use JSON POST with server-owned pin/client_id:

| Operation | Endpoint | Identifier/body |
| --- | --- | --- |
| Ingest | https://api.direnotemedia.com/ingest_content | canonical release/track payload |
| Status | https://api.direnotemedia.com/check_release_status | current attempt UPC |
| Revenue | https://api.direnotemedia.com/check_revenue_report | normalized ISRC |

The documentation URL is not an ingestion endpoint. Local mock endpoint
overrides remain supported for isolated tests.

## Intentional Boundaries

Required release fields, exact ownership enums, conditional AI/license proofs,
artist provisioning rules, track counts, single-title equality, date checks,
writer/composer names, audio types and optional lyrics were reviewed against the
official contract. Payload and API tests cover these paths and false/zero values.

HYMN deliberately requires explicit track language and subgenre to avoid the
provider's fallback behavior. Transfers require existing identifiers and original
dates to protect catalogue identity. These are stricter HYMN policies, not claims
that the documentation makes every such field mandatory.

There is no documented fixed mood enum, DSP-selection key, territory key,
Dolby Atmos delivery contract, or dedicated remixer field. The inventory marks
those distinctions explicitly; this audit does not invent undocumented delivery
capabilities or claim actual provider acceptance from a mock.

## Verification

- Official-document taxonomy/endpoint comparison.
- Production HARADO read-only canonical readiness check.
- Field mapping tests: optional mood/lyrics, JPEG/JPEG uppercase/signed filename,
  explicit track language and multi-track isolation.
- Isolated PostgreSQL and real browser: one-track readiness while another
  two-track release is the out-of-queue initial selection; desktop/mobile views.
- TypeScript, lint, production build, and the standard regression suite.
