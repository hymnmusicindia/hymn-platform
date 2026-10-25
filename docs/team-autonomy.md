# Team OS automatic work

Team OS assigns operational work from saved data. Staff record the real outcome in the source screen; the coordinator handles routing, reservations, reminders and reconciliation.

## Active hours

- Employees without a weekly override use Monday–Saturday, 09:30–18:00 IST. Owners supervise and are excluded from operational assignments.
- Kira uses Monday–Saturday, 17:00–21:00 IST, with automatic call assignments released only while that shift is active. Sundays are excluded. Her normal requirement is 24 hours/week.
- Managers configure recurring shifts in Active hours. A weekly override is optional and must cover at least 70% of configured hours after approved leave. Restricted evening shifts cannot be bypassed with a daytime or Sunday override.
- Setting an employee to AWAY/PAUSED, disabling their account/membership, or removing the required permission removes them from eligible routing. Disabling recurring coverage requires an explicit weekly plan.
- A fully approved week of leave supplies no booking windows. Partial leave reduces the hours requirement; submit an override to identify the particular days/times absent.

## Sources and resulting work

| Saved data | Automatic next step | Completion evidence |
| --- | --- | --- |
| New saved contact linked to an unverified acquisition lead | Source-check task, preferably for its original researcher | Contact source checked, usable contact details and eligibility recorded |
| Source-checked, eligible lead awaiting a caller | Caller handoff and first-contact task | Actual outreach and conversation records |
| Customer callback request | Priority callback routing and reserved slot | Real recorded call outcome |
| Enquiry, inactive draft, service interest | Contextual internal follow-up suggestion | Actual outcome; stale signals are cancelled |
| Pending producer or engineer application | Task for a reviewer with the corresponding approval permission | Decision saved in Creator approvals |
| Release, beat, engineer-profile or studio queue | Existing enabled workflow rules create review tasks | Existing review/approval flow |
| Quick intake | Permission, workload and free-slot routing | Work outcome in its existing flow |

Source tasks have stable unique event keys. Repeated worker runs do not recreate them. Invalidated source evidence or a resubmitted application reopens the existing task and reservation, preserving their IDs. Source-check and creator-review assignments cannot be completed by ticking a task checkbox. Creator self-review is excluded. An unavailable source-task owner is replaced without changing original research attribution. Deliberately cancelled source assignments remain cancelled.

Source tasks reserve a 30-minute calendar slot. Internal callback suggestions outside current hours are moved into free slots, retaining the original task and event IDs and updating revisions, deadlines and pending rep messages. Confirmed customer CALL appointments are preserved and raise a coverage notice for the supervisor instead of silently changing an agreed time.

## Execution and recovery

The `team-os` job manifest runs every five minutes after deployment. Contact and research writes also wake a small source-work pass using Next.js `after`; the scheduled worker is the durable fallback. Merely opening a page is not required.

Each source assignment or reconciliation commits in its own workspace-locked transaction. A cron pass advances up to four source records, repairs up to three internal callbacks, and continues existing independent workflow, daily-work, customer-follow-up, coordinator and reminder phases. Empty source queues stop early. Schedule scans keep a durable cursor so later appointments are examined as well. Audit events include `automation.source_assigned`, `automation.source_reassigned`, `automation.schedule_repaired` and `TEAM_OS_PHASE_FAILED`.

This automates dispatch, not business facts: people still make calls, establish contact eligibility, verify a lead, review work samples and approve releases. A missing eligible employee or an unavailable requested appointment time stays visible as waiting/coverage work. Existing explicitly disabled workflow rules stay disabled.

## Validation

Run sequentially (the disposable PostgreSQL fixture uses one fixed local port):

```text
node --import tsx scripts/verify-acquisition-isolated.ts --team-autonomy-only
node --import tsx scripts/verify-acquisition-isolated.ts --team-coordinator-only
node --import tsx scripts/verify-acquisition-isolated.ts --team-cron-recovery-only
```

The autonomy fixture covers default recurring shifts, restricted overrides, the 17:00 gate, Sundays, daily task deadlines, source task deduplication and factual completion, creator permissions, internal callback reflow, rep-only messages and confirmed-appointment exceptions.
