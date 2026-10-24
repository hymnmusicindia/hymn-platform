# YAMUNAWOOD delivery recovery (2026-10-24)

Release 81's verified historical catalogue (UPC 3473620319543) contains all five recordings, rejected with a content ownership match remark. This is evidence of the older delivery, not evidence that the correction approved on October 24 was delivered.

Two records prevented that correction from being sent:

- The asynchronous poller quarantined a dashboard-reconciled catalogue delivery because it had no asynchronous job reference.
- A separate October 15 request returned HTTP 200 with `success:false` and `MySQL server has gone away`. Its job lookup returned 404 `Job not found`. Its outcome remains unconfirmed; a missing job is not proof of non-receipt.

The targeted recovery verifies the catalogue's title, UPC, recording count and every ISRC, checks the historical error and job lookup, and scopes changes to the approved correction. It retires the older uncertain request with preserved evidence and an audit entry, then submits the separately approved correction through the normal locked, idempotent pipeline. It does not retry the uncertain historical request or record invented non-receipt confirmation.

`scripts/retry-reviewed-yamunawood.ts` defaults to verification only. `--apply` performs this one-time recovery. `--resume` can continue after the audited retirement only while no subsequent attempt exists and the same correction remains approved. `--poll-only` checks the current ingest job without submitting anything. These operations use the configured production environment; do not run them against a different release or revision.

The general fix distinguishes catalogue-confirmed deliveries from asynchronous jobs. Bare successful HTTP responses require reconciliation unless they include a usable provider job or release reference. Local persistence failures after provider acceptance also return an explicit reconciliation result. The admin summary separates approval/readiness from delivery.

Validation: isolated PostgreSQL catalogue recovery and unresolved-job regression checks; existing isolated distribution lifecycle suite; TypeScript and targeted ESLint checks.
