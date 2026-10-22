# Correction receipt and admin review

A received correction is a HYMN review step. An older accepted delivery and its
correction report remain historical evidence until the reviewed replacement is
sent. A customer receipt must not imply that the replacement reached the provider.

`updatePaidDistributionRelease` now writes metadata/tracks and calls
`finalizeReleaseReviewHandoff` in the same PostgreSQL transaction. The handoff
records review status, QC queue/log, a payload-specific admin task, account
notification and durable receipt email. A failure rolls back the complete save.
Repeated payload receipts do not create duplicate tasks or messages. Rights
corrections require manual review; an older auto-QC pass is not reused.

The email cron repairs legacy saved correction receipts missing their queue/task.
It takes the release lock, checks that the release is still awaiting review and
preserves its identifiers and accepted submission. It never ingests a replacement.
An explicit approval/rejection resolves the corresponding review task.

The admin catalogue refreshes on mount, focus and every 30 seconds. Errors retain
the last loaded rows and offer retry. An in-flight refresh cannot overwrite a
newer local administrative decision. Reviewers can use the same read endpoint
as catalogue operators. QC includes resubmitted and in-QC states, and older provider
corrections cannot hide a newer local review status. Linked private licence proofs
are clickable and readable by authorised release reviewers; unrelated customers
and unlinked private proofs remain protected.

Release 147's saved correction handoff was recovered with a backup and an open
review task. Its licence upload, identifiers, tracks and previous submission were
preserved. Review it at `/admin?tab=distribution-queue&releaseId=147`.

Checks:

- `node --import tsx scripts/verify-acquisition-isolated.ts --review-handoff-only`
- `node scripts/verify-admin-release-feed.cjs`
- `node scripts/verify-correction-resubmission.cjs`
- `node --import tsx scripts/verify-review-proof-access.ts`
