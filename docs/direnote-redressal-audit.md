# DireNote redressal audit

The canonical release and track identities are the integer primary keys in
`prisma/schema.prisma`. UPC and ISRC are provider identifiers.

| Concern | Existing implementation | Repair required |
| --- | --- | --- |
| API/auth | `lib/direnote/direnote-client.ts`, `direnote-config.ts` | Reject malformed replies; redact echoed secrets |
| Ingest | `lib/distribution-service.ts` | Reuse for corrections |
| Attempt ledger | `lib/distribution-idempotency.ts`, `DistributionSubmissionAttempt` | Preserve attempts; current pointer and identifier snapshots |
| Status/remarks | `lib/direnote-service.ts`, `direnote-corrections.ts` | Poll current attempt; scope fingerprints to attempt |
| Scheduler | `app/api/cron/direnote-release-sync/route.ts`, `vercel.json` | Hourly, bounded, serialized |
| Review model | `Release.reviewIssues`, `correctionReason` | Preserve correction history in attempt ledger |
| Customer workspace | `components/release-portal.tsx`, `release-form.tsx` | Save corrections without closing provider review |
| Resubmission | `app/api/releases/[id]/resubmit/route.ts` | Canonical ingest for provider corrections |
| Paid metadata save | `updatePaidDistributionRelease` in `lib/distribution-db.ts` | Preserve track IDs and server-owned metadata |
| Notifications | `notifyReleaseStatusChange`, `lib/notifications.ts`, email templates | Attempt-scoped deduplication |
| Admin queue | `DistributionQueueEntry`, `lib/task-queue.ts` | Reuse correction tasks and review state |
| Manual sync | `app/api/admin/releases/[id]/direnote/sync/route.ts` | Same service as cron |
| Audit/diagnostics | `DireNoteLog`, `ExternalIdentifierHistory`, status transitions, reconciliation panel | Sanitized attempt status snapshots |
| Lifecycle | `lib/release-status-engine.ts` | Acceptance closes provider review; pending alone does not |

No second correction model or scheduler is needed. The existing attempt ledger
can retain identifier snapshots, review issue history and provider response data.
The subsequent field audit found that track language was discarded on paid save
and ignored by ingestion. The repaired language path and outstanding provider
contract questions are documented in `direnote-field-mapping-audit.md`.

Initial audit found that remarks are already parsed independently of status,
but fingerprints lack attempt scope, the cron slows older releases to daily,
and paid edits delete track rows and replace provider metadata. Successful
attempt rows currently have no explicit current marker. These defects prevent
the existing partial Magenta regression from proving a complete lifecycle.
