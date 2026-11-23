NOCTURNAL delivery recovery — 23 November 2026

The active corrected release is #227, approved on 21 November at 08:51 UTC. Its previous package was accepted on 15 November as submission #73, UPC 3473620323199, and returned for corrections. The earlier release #193 is a separate correction-held package; #226 is archived.

Five preparation errors exhausted the automatic retry allowance by 09:15 UTC on 21 November. The recorded error was partner hourly request capacity exhaustion. Preparation then entered `needs_review`, excluding it from subsequent automation scans despite the running worker. No new content-ingest attempt was recorded for the corrected package.

Capacity deferrals now honor the structured Retry-After duration without consuming the preparation error allowance. Existing capacity-only holds become eligible again through the normal candidate query. All payment, active account, signed review, source checksum, correction resolution, uncertain attempt and duplicate acceptance guards still apply. Timeouts retain bounded retries; identity conflicts remain held. No production schema change is required.

Validation: preparation retry contract tests passed for zero, four, five and fifty prior failures; Retry-After timing and uncertain-write/identity exclusions passed. Disposable PostgreSQL automation tests passed, including legacy capacity recovery and continued exclusion of identity holds, current correction evidence and duplicate/uncertain-send protection. No provider writes occurred in these tests.

Live preflight: public homepage, pricing, login, release and studio entry routes returned 200. Anonymous cron health returned 401. Authenticated health confirmed a running primary worker and healthy ingest/automation jobs. Overall health was 503: status reconciliation reported a failed run, one appointment and two old queued emails require review. These findings do not establish successful external OAuth, payment or email delivery.

Deployment and actual corrected-package acceptance must be read back from Hostinger and the durable submission record before claiming delivery completed.
