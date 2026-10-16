# DireNote API v2.4 endpoint audit

Contract: user-supplied DireNote v2.4 documentation, changelog 15 October 2026. Twenty-four endpoints total: five previously integrated, nineteen previously unused. Examples in that document are not production records and have not been seeded.

## Coverage

| Endpoint(s) | Before this audit | Current integration |
| --- | --- | --- |
| `ingest_content` | Integrated | Existing readiness, public asset handling, durable delivery attempts and duplicate-send protection retained; isolated pipeline regression suite exercises it. |
| `check_release_status` | Integrated | Existing polling/reconciliation and UPC/ISRC repair retained; used after confirmed withdrawal and to reconcile an interrupted withdrawal. |
| `check_revenue_report` | Integrated | Existing royalty reconciliation/import retained, not replaced by partner payouts. |
| `check_artist`, `check_songwriter` | Linked-record refresh | Existing protected HYMN refresh retained; also used to verify interrupted identity changes against provider IDs and requested fields. |
| `list_releases` | Unused | Paginated, searchable provider catalogue with status/type filters. Browse only: never adopt foreign releases by name. |
| `get_smartlink` | Unused | UPC lookup; HTTPS `dnm.link` results open safely in a new tab. |
| `check_qc_report` | Unused | UPC lookup with expandable per-track analysis. Unscanned is not an error and scanned is not approval. |
| `withdraw_release` | Unused | Recent `system.manage` authentication, typed UPC confirmation, durable pre-write audit, replay protection, no automatic retry, subsequent local status reconciliation. Pending-only enforcement remains provider-authoritative. This is irreversible, not a store takedown. |
| `list_artists`, `list_songwriters` | Unused | Paginated provider catalogue, search and visible provider identifiers. No unsafe name-only association with HYMN accounts. |
| `update_artist`, `update_songwriter` | Unused | Explicit field selection; omitted fields preserved; permitted blank URL/IPI clears supported; name/IPI/IPRS validation; duplicate-link conflicts shown. Provider-only changes do not silently overwrite verified HYMN identity data. |
| `list_payouts` | Unused | Paginated partner settlements, status/type/date/ID filtering and masked payment details. USD settlements are separate from customer withdrawals; no wallet credits or double-counted revenue. |
| `list_territories`, `list_stores`, `list_genres`, `list_languages` | Unused | Searchable authenticated reference tools, persisted 24-hour cache. Existing wizard taxonomies remain stable rather than silently changing customer drafts. |
| `list_instruments`, `list_contributor_roles`, `list_video_platforms` | Unused | Same cached reference tools for credits/delivery operations. |
| `list_master_collecting_bodies`, `list_mechanical_societies`, `list_performance_societies` | Unused | Same cached reference tools for rights operations. |

## Where to use it

Admin → integration monitor at `/admin/integrations/direnote` → **DireNote catalogue & tools**. Choose an operation, enter its filters or identifiers, then load data. List requests fetch 25 records with Previous/Next pagination; no automatic catalogue-wide scans consume the provider budget.

The server action route is `/api/admin/direnote/catalogue`. It accepts only the nineteen allowlisted operations and strict payload schemas, not URLs, arbitrary paths or credentials. Server credentials override transport payloads. Outbound authentication never follows redirects. Reads require `releases.read`; settlements require `payouts.review`; all provider writes require recent `system.manage` authentication. Same-origin checks apply to every request. Responses/logs are credential-redacted, private and no-store. References alone use a persisted cache.

Every uncached request reserves capacity in the existing cross-instance PostgreSQL request budget. Provider Retry-After sets a shared cooldown, including non-JSON 429 responses. No endpoint loops fetch the entire catalogue automatically.

## Interrupted changes

An audit record is written **before** contacting the provider. A UUID identifies each requested change; reusing it never repeats the provider write, and changing its payload is rejected. Unconfirmed writes block further changes to that provider resource, even under a different UUID. Timeouts, network failures and 5xx outcomes are not proof that a write failed.

Use **Check recorded change — read only** for an unconfirmed operation. `/api/admin/direnote/catalogue/reconcile` queries provider data without repeating the write. Identity reconciliation requires the exact provider ID and every changed field to match (an omitted response field never proves a clear). Withdrawal requires matching UPC, rejected tracks and explicit “Withdrawn by user” remarks. The read and the reconciliation result are audited. If evidence is insufficient, the record stays blocked: contact DireNote with its audit ID. There is deliberately no force-resend or unsupported manual success switch.

Provider webhooks remain **coming soon** in this contract; existing scheduled polling is still required. There is no invented webhook subscription, payout creation API or store-takedown API.

## Verification and limits

- `node --import tsx scripts/verify-direnote-v24.ts`: nineteen operation/transport contracts, strict validation, omitted-versus-cleared fields, identifier normalization, credential injection, timeouts, conflicts, Retry-After and conservative reconciliation evidence.
- `node --import tsx scripts/verify-direnote-virtual.ts --v24-only --build`: isolated PostgreSQL, production Next build and HTTP/UI checks for permissions, same-origin/recent-auth, all nineteen tools, reference cache, pagination, durable replay/conflict handling, ambiguous outcomes, read-only reconciliation and shared cooldown.
- Existing checkout/pipeline fixture independently covers submission/payment ownership, races, entitlements and mobile interaction.

No live update, withdrawal, payout or release submission is performed by these tests. Provider-specific availability, account permissions and actual catalogue values require live read-only verification after deployment. A git push alone is not proof that Hostinger has deployed it. No database schema migration is needed; the integration uses existing DireNote audit records.
