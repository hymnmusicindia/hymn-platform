NOCTURNAL delivery recovery - 23 November 2026

The active corrected release is #227, approved on 21 November at 08:51 UTC. Its previous package was accepted on 15 November as submission #73, UPC 3473620323199, and returned for corrections. The earlier release #193 is a separate correction-held package; #226 is archived.

Five preparation errors exhausted the automatic retry allowance by 09:15 UTC on 21 November. The recorded error was partner hourly request capacity exhaustion. Preparation then entered `needs_review`, excluding it from subsequent automation scans despite the running worker. No new content-ingest attempt was recorded for the corrected package.

Capacity deferrals now honor the structured Retry-After duration without consuming the preparation error allowance. Existing capacity-only holds become eligible again through the normal candidate query. All payment, active account, signed review, source checksum, correction resolution, uncertain attempt and duplicate acceptance guards still apply. Timeouts retain bounded retries; identity conflicts remain held. No production schema change is required.

Live investigation also found 95 reservations in the preceding hour. Routine catalogue reads now stop at 55 shared reservations, leaving 40 for delivery preparation, ingestion, acknowledgements and other operations, and the existing five administrator requests. The total remains 100, serialized by the same database advisory lock. Retry-After is calculated from the reservation whose expiry actually frees capacity for that request tier, rather than repeatedly waking on the oldest single request.

Validation: preparation retry contract tests passed for zero, four, five and fifty prior failures; Retry-After timing and uncertain-write/identity exclusions passed. Disposable PostgreSQL automation tests passed, including legacy capacity recovery and continued exclusion of identity holds, current correction evidence and duplicate/uncertain-send protection. No provider writes occurred in these tests.

The database capacity test verified routine polling stops at 55 while mapping checks, ingestion and acknowledgement polling continue; automated delivery stops at 95 and administrator requests stop at 100. Test reservations are removed before the subsequent correction-contract test.

Delivery also checks estimated album headroom (two checks per unique artist plus ingestion) before starting provider preparation. This check consumes no reservation and defers until enough existing slots expire. Actual calls still reserve individually under the shared lock, so concurrent work cannot exceed the ceiling. Additional identity updates can still defer safely; this estimate is not a guaranteed capacity allocation.

Live preflight: public homepage, pricing, login, release and studio entry routes returned 200. Anonymous cron health returned 401. Authenticated health confirmed a running primary worker and healthy ingest/automation jobs. Overall health was 503: status reconciliation reported a failed run, one appointment and two old queued emails require review. These findings do not establish successful external OAuth, payment or email delivery.

Deployment and actual corrected-package acceptance must be read back from Hostinger and the durable submission record before claiming delivery completed.
