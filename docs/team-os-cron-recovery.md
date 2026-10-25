# Team OS scheduled job recovery

The `team-os` job repeatedly returned HTTP 503. Production rollback diagnostics
identified the `workflow-sync` transaction expiring at its 30-second limit.
There were 38 due tasks; each reminder performed separate lookup, event, member
and notification queries inside one transaction. The route swallowed the error,
so the health page could not identify the failing phase.

Deadline reminders now use bounded batches of 100. Existing task/day events are
excluded before selecting the next batch, so a backlog advances rather than
revisiting the first 100 tasks. Shared notification batching checks preferences
and active membership, then writes deduplication events and notifications in the
same workspace-locked transaction. A rollback preserves neither half.

The job separately commits rules, workflows, daily work, calendar events, task
reminders, digests, customer follow-ups, coordinator routing and availability
reminders. Failures record `TEAM_OS_PHASE_FAILED` with phase, error code and
duration; independent phases continue, and the job still returns 503. Existing
cron leases prevent overlapping runs. No notification history is cleared.

Scheduled event reminders retain `remindedAt`; digest keys and task reminder
keys remain compatible with prior runs. Calendar task reminders use the same
batch helper. The dedicated CALL reminder job is unchanged. Client introductions
retain their existing delivery and uncertain-send protections. An unavailable
sender with no pending introductions is a harmless skip; pending introductions
with no sender still require attention.

After the change, the workflow phase completed in approximately 13 seconds in a
rollback-only production-data diagnostic. The other inspected phases also
completed within their transaction limits. No diagnostic transaction committed.
This is not a replacement for a successful deployed cron run.

Verification:

- `node --import tsx scripts/verify-acquisition-isolated.ts --team-cron-recovery-only`
  tests 130-task batch progression, replay safety, digest/calendar deduplication,
  disabled notifications, rollback atomicity, deliberate phase failure, continued
  independent reminders, durable diagnostics and subsequent recovery.
- TypeScript and targeted ESLint.

No migration is required. Deploy the commit, then run the authenticated
`/api/cron/team-os` endpoint or let the normal scheduler run it. Inspect the new
`CRON_RUN_FINISHED` record rather than deleting old failed runs.
