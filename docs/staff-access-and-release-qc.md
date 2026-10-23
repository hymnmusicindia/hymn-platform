# Staff access and assigned release QC

Staff access (`/admin?tab=team`) now shows Team OS memberships, exact team-role
permissions and platform-admin memberships in one directory. Team assignments and
platform access remain explicit grants. Existing memberships are not copied into
more powerful roles. Team responsibility changes require recent founder/super-admin
authentication, reject stale role/status snapshots, protect owners/self access and
write both administrative and workspace audit records.

The explicit `operations.distribution.qc` permission enables Team OS → Release QC.
Existing coordination-only `operations.distribution.review` does not authorise QC
decisions. An active QC member can inspect and decide only a release assigned to
them. Their artist/producer account type and research permissions can be retained.
Private audio, artwork and rights evidence repeat active membership/permission and
release-assignment checks on each asset read. No financial or platform-account
administration follows from a QC role.

The `team-release-qc` worker allocates submitted, resubmitted and pending-review
releases to available QC members using current workload. It avoids self-review,
preserves existing authorised assignments and reassigns work after QC authority is
revoked. A resubmission after a completed correction review gets a new task round.
Decision persistence rechecks current membership, assignment and release/task
versions in the status-change transaction. Customer corrections use the existing
HYMN notification and mail outbox.

Approval completes the QC task and saves `delivery=pending` in the same transaction
as the release approval. Next.js `after` attempts delivery; the authenticated minute
worker provides durable recovery. Delivery calls the existing submission service,
retaining its payment, rights, artist-profile, validation, submission-lock and
provider-attempt guards. Concurrent workers claim a task once. Uncertain/failed or
interrupted delivery requires operational review rather than a blind resend, with
a deduplicated task in the existing admin queue. QC approval is distinct from
confirmed platform delivery/live status.

Internal identity classification checks team/admin memberships and account,
email and normalised telephone matches. Staff artist/producer login types do not
make their own browsing or abandoned drafts sales leads. Old inferred sales tasks
and calendar reservations are cancelled without deleting history. Explicit support
callback requests remain available to team members.

Validation: `npm run test:staff-qc` runs a disposable loopback PostgreSQL database
with email disabled and a fake distribution function. It checks internal identity
exclusion, real customer signals, task allocation, private-file access, stale and
revoked decisions, correction emails, new review rounds, concurrency, uncertain
delivery escalation and protected role changes. It does not submit real releases.
# Creator application approvals

`operations.producers.approve` and `operations.engineers.approve` expose the
corresponding pending queues in **Team OS → Creator approvals**. These are
business decision permissions, separate from the existing read-only marketplace
coordination permissions. They do not grant platform administrator access.

Reviewers must provide notes and confirm their checks before approving. Decisions
recheck active membership and permissions under the workspace lock, reject
self-review and stale submissions, and lock the application row. Producer access
or the engineer profile and first service listing commit with the decision,
applicant notification and audit evidence. A failed appointment rolls back the
decision. Existing engineer profiles and payout configuration are preserved.

Run `npx tsx scripts/verify-acquisition-isolated.ts --creator-approvals-only` for
the disposable-database permission, activation, concurrency and rollback checks.

