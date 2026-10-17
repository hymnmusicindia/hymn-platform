# DireNote asynchronous ingest jobs

DireNote v2.5 acknowledges `POST /ingest_content` with HTTP 202 and a `job_id` while it processes a release. HYMN sends the submission attempt's stable `idempotency_key`, stores the returned job reference and does not treat the 202 response as a completed ingest.

The `direnote-ingest-status` cron calls the configured fixed `DIRENOTE_INGEST_STATUS_ENDPOINT` (default `https://api.direnotemedia.com/ingest_status`) every minute. It sends either `job_id` or `idempotency_key`, then records `queued` and `processing` responses. One job is polled per tick and each provider request is reserved against the shared DireNote rate limit. This keeps polling bounded while older due jobs are served first. `poll_after_seconds` is retained for diagnostics.

On `completed`, HYMN validates the returned title, UPC, track count, and ISRCs against the release before persisting provider identifiers and running the normal accepted-release flow. A failed job is marked retryable only when DireNote returns `can_resubmit: true`; otherwise it is marked failed. A completed response with conflicting or incomplete identity requires reconciliation and is not synced to the release.

The same cron is registered in the Hostinger scheduler, Vercel cron, and the five-minute GitHub Actions fallback. Accepted jobs created before job-reference persistence are recovered from the saved DireNote response logs on their next poll. Do not fetch a provider-supplied `status_url`; the client always calls the configured status endpoint.
