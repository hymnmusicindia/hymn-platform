# Team client appointments

Client cards can be created within the scheduling dialog, without losing the event's fields. A name is required; email and phone remain optional. Appointment emails use the primary address; either saved address matching a HYMN account suppresses the signup suggestion. This checks registration, not whether somebody happens to have an active browser session.

For upcoming scheduled CALL events:

| Recipient | On scheduling / reassignment / rescheduling | Before start |
| --- | --- | --- |
| Client | Email with representative and date/time | Email 30 minutes before |
| Assigned representative | Email and in-app notification | Email and in-app notification 40 minutes before |

Times are explicitly India time (IST), displayed in AM/PM. No saved phone: the client is asked to reply with a number; the representative is warned to coordinate contact details. Internal notes are not included in client emails. Last-minute bookings skip already-passed reminder thresholds to avoid consecutive duplicate notices. Existing future calls receive future reminders through the additive migration, not retroactive confirmation emails.

## Queue and delivery

The appointment and its outbox records commit together. Schedule revisions invalidate obsolete jobs on reschedule, reassignment, cancellation or status/client/type changes. The worker rechecks event status, revision, client contact preference and representative/account status. Atomic conditional claims prevent concurrent workers from sending the same job. EmailLog provides a second deduplication key. Interrupted or uncertain SMTP attempts become REVIEW, not blind retries; inspect the admin email log. Manual failed-email retries revalidate the current appointment. Successful retries update the job state.

The event dialog shows delivery statuses. Disabled SMTP keeps emails pending; in-app representative reminders still work. Cancelling a client card's contact permission cancels its future scheduled events. These are requested appointment notices, not newsletter campaigns; newsletter unsubscribe alone does not cancel a scheduled appointment.

Messages already accepted by SMTP cannot be recalled. A cancellation or handoff stops unprocessed jobs, but cannot retract a message already in flight. Manual retries also claim the job atomically; already-delivered jobs cannot be replayed.

Hostinger's existing `npm start` entrypoint invokes `/api/cron/team-appointments` every minute, starting 30 seconds after boot, using `CRON_SECRET`. Requires `TEAM_AUTOMATION_ENABLED` not `false`, live SMTP configured, and a running Node process. The endpoint also appears in `vercel.json` for deployments with minute-cron support. Do not install duplicate external cron unless needed; atomic claims still protect multiple hosts. Reminders are due at the requested offsets, normally processed on the next minute tick; SMTP/provider delays and downtime prevent exact delivery-time guarantees. After downtime, reminders for calls that already started are cancelled rather than delivered late.

## Handoff permissions

The currently assigned representative, or a member with `tasks.assign`, can pass an upcoming call to an active, AVAILABLE representative in the same workspace. A reason and current event version are required. Slot conflicts are checked using normal calendar validation. Both old and new representatives are notified, and the client gets updated appointment details. This grants no ability to assign arbitrary work. Pending old-assignee reminders are invalidated. Calls already started/completed/cancelled cannot be handed off.

## Design references

- [AWS transactional outbox guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html): atomic business changes and durable notification jobs, with idempotent consumers.
- [PostgreSQL SELECT locking guidance](https://www.postgresql.org/docs/current/sql-select.html): queue concurrency considerations. This implementation uses conditional UPDATE claims rather than adding a queue vendor.

Verification: `node --import tsx scripts/verify-team-os-isolated.ts --contacts-browser` exercises the additive migration, permissions, queue timing, cancellation/handoff/stale retry protection, SMTP-free delivery mocks and desktop/mobile browser interactions. No production mail is sent by the fixture.
