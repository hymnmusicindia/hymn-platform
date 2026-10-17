# DireNote status reconciliation — 17 October 2026

## Verified live reconciliation

Only the three requested releases were synchronized. No ingest, resubmission,
withdrawal or revenue import was performed.

| Release | UPC | Saved HYMN state |
| --- | --- | --- |
| YAMUNAWOOD | 3473620319345 | CHANGES_REQUESTED |
| ONLY FEELINGS | 3473620319451 | CHANGES_REQUESTED |
| Ye Zindagi Na Milegi Tujhe Phir Kabhi | 3473620319079 | SCHEDULED |

YAMUNAWOOD requires acceptable sample licences. ONLY FEELINGS requires proof of
rights after a possible copyright match. An approval is not proof of store
availability: the third release remains scheduled until its release date and
verified live confirmation.

## Root causes and safeguards

- The status endpoint returned the rejected and later approved versions of the
  same ISRC. Reconciliation now selects the uniquely newest dated revision per
  valid ISRC before extracting corrections and aggregating status. Missing or
  tied timestamps retain all evidence; array order does not decide approval.
- YAMUNAWOOD's old ingestion acknowledgement contained a different UPC from its
  current attempt, release and previously verified status response. The latter
  takes precedence only with successful provider evidence, matching release
  title, matching UPC and every local ISRC. Conflicts without that proof still
  stop reconciliation. Original diagnostics are not overwritten.
- A repeat correction fingerprint could leave DELIVERY_FAILED unrepaired. It
  now repairs that projection while still protecting customer corrections
  already submitted for review from reopening on stale provider remarks.
- Failed records now advance their polling timestamp so they cannot permanently
  starve unchecked releases. Accepted attempts without a current flag have a
  bounded status-only recovery path. Neither path re-ingests content.
- Shared request reservation transactions allow bounded lock contention rather
  than expiring at the default five-second transaction timeout.
- Cron status HTTP requests and transient retries share a deadline; optional QC
  enrichment can defer without discarding provider review remarks. Identity
  refresh is limited to two concurrent workers and stops starting at the same
  time boundary. Existing per-release/global leases and rate-limit cooldowns
  remain in effect.
- The hourly GitHub job treats nonzero reconciliation errors as an unhealthy run
  even when the endpoint returns HTTP 200 with a partial-success summary.

## Verification and operations

Run `node --import tsx scripts/verify-direnote-track-revisions.ts` and
`node --import tsx scripts/verify-direnote-virtual.ts --lifecycle-only` for isolated
revision, identity, projection, lineage, correction-deduplication and cron tests.

`scripts/sync-requested-direnote-status.ts` defaults to a read-only database
report for these three UPCs. `--inspect-provider` adds budget-reserved provider
reads; `--apply` explicitly invokes guarded status synchronization. It loads
ignored `.env.hostinger` locally and does not embed credentials.

The existing hourly schedule remains unchanged. The fixed code must be deployed
to the live application for subsequent live cron runs to use it. Provider outages,
ambiguous identities and rate limits remain reportable/retryable errors, not
conditions to conceal by forcing an approved status.
