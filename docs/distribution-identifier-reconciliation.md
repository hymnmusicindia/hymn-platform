# Provider-issued release identifiers

HYMN imports the UPC and recording ISRCs from each confirmed submission's
response or completed asynchronous ingest job. Corrected submissions may receive
new identifiers. The activation transaction saves replaced values to
`external_identifier_history`, updates the canonical release/track columns and
metadata, and supersedes the earlier attempt. Repeating the same result does not
create another change-history entry.

While a corrected job is awaiting identifiers, the previous UPC is labelled as
previous in the catalogue and release details. Its old correction cannot be
projected onto the newer submission. Completed jobs stop polling; lifecycle and
correction polling continues using the current attempt's UPC.

Job polling shares a durable per-release lease with status polling and submission
so multiple instances cannot apply competing results. A result for an older
attempt cannot replace a newer current attempt. Every response must confirm its
job ID or its recorded outbound idempotency key. Lost receipts are recovered only
from logs for that key, never an unrelated earlier submission's log. Numeric
timestamps, phone numbers and release IDs are not treated as UPCs. Ambiguous UPC
evidence and unrelated sibling recordings are rejected.

Incomplete completed-job identifiers retain the last verified values and are
retried by reading the same job on the normal cadence. Three incomplete results
require reconciliation; no new ingest is sent. Provider transport errors and
shared request limits retain existing retry/cooldown handling.

Terminal receipts are excluded before the database batch limit, so a large
completed catalogue cannot starve newly queued jobs. Queued correction emails
are bound to their submission and correction event; superseded requests are
cancelled before SMTP. A scoped authenticated outbox run can deliver one specific
release/email without running unrelated recovery or messaging work.

Run `node --import tsx scripts/verify-direnote-virtual.ts --identifier-sync-only`
for isolated PostgreSQL tests covering first assignment, replacement, unchanged
values, history, duplicate results, concurrent workers, stale attempts, missing
and mismatched correlation, incomplete-result recovery and safe fallbacks.
Contract and correction tests cover ambiguous UPCs and unrelated numeric data.
