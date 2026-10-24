# Team OS work coordinator

The Team OS home screen combines operator intake, prioritised next actions, routing history, missing weekly plans and appointment delivery/coverage exceptions. Existing CRM, customer callbacks, Calendar, My Work, approvals and business review workflows remain the places where work is performed.

## Weekly active hours

Employees submit Monday-based weekly availability in Asia/Kolkata. Each week needs an explicit submission; Copy last week is a shortcut, not automatic approval. Slots use 15-minute increments, cannot overlap and cannot exceed 12 hours per day. The default baseline is 40 working hours; an authorised member manager can change the baseline and approve leave for a particular week.

At least 70% of baseline hours after approved leave must be declared. For example, 40 hours with no leave requires 28 available hours; 40 hours with eight hours leave requires 22 hours 24 minutes, rounded up by the available quarter-hour slots. Full-week leave makes an employee unavailable for routing. Already booked work consumes calendar capacity but does not reduce the declared percentage. Employees cannot remove hours covering upcoming scheduled calls or coordinator work. Owners supervise and are never assigned employee work.

No schedules are fabricated for existing employees. Until an employee submits a compliant plan, the system keeps new work waiting or leaves its source eligible for the next scheduled scan.

## Operator intake

Paste an enquiry or handover, use Suggest fields from text, verify the category/contact fields, and provide a short title and source. Field suggestions use explicit text patterns; they are not an AI judgement or proof of customer intent. Known contact identifiers are matched; ambiguous matches require contact review. A retry key makes a repeated submission safe, and conflicting reuse is rejected. Research outreach eligibility and do-not-contact records cannot be bypassed through intake.

Intake commits before assignment. An authenticated server after-hook attempts routing immediately; the existing scheduled Team OS job retries WAITING entries. If an employee is unavailable, missing a weekly plan or missing the required permissions, input remains saved. Requested callback times are preserved. Expired requested times require a new agreed time; operators can retry, reschedule or cancel their waiting entries. Only managers can manage other operators' intake.

Unfinished operator input is retained in the same browser tab, scoped to that employee. Reloading restores the draft and its retry key. Successful intake clears the draft. This is a convenience until submission; the durable intake table is the saved source of truth.

Routing matches category permissions, active membership, availability and a free 30-minute calendar slot. It favours lower open workload and then the earlier slot. It records a task, reserves its calendar slot, notifies the employee and retains the original operator's task visibility. Related open customer callbacks receive additional context instead of duplicate tasks. These assignments do not grant new permissions or perform publication, distribution approval, financial or ownership decisions.

Existing business review rules now use declared availability and fall back to another qualified employee when the preferred employee has no slot. Missing operational rules are initialised by the scheduled owner coordinator once qualified employees exist; explicit disabled/custom rules are preserved. Existing open record review tasks are not duplicated. Scans use bounded batches. Owners can open Routing rules from the coordinator.

## Call assignment, email and passing

Calendar offers automatic representative assignment for new calls. Both automatic and explicit assignments check weekly hours, role permissions and calendar conflicts. Assigned internal callbacks email the representative only; they do not tell a customer an unconfirmed time. Confirmed CALL appointments retain the existing client confirmations/reminders and representative emails.

Assignment emails link to the exact call on its calendar date. Pass to next available rep preserves that time, excludes representatives who already passed the same call, updates the linked task, invalidates previous queued reminders and queues the new assignment. If nobody can cover, the original assignment remains and managers receive a deduplicated notification. The home screen shows the unresolved coverage exception. Passing is an authenticated POST action; an email link does not mutate a call.

Call outcomes must be recorded in Customer callbacks. Completing a generic My Work task cannot manufacture a successful conversation. A real recorded outcome is retained even if no subsequent slot exists; that follow-up is blocked for coverage review. Completed coordinator work releases its reservation. Successfully completed appointments and email history remain auditable.

## Operations and verification

Apply `20261025090000_team_work_coordinator` before deploying this version. This additive migration introduces the durable intake queue; availability uses the existing employee preferences JSON. No historical records are deleted or bulk reassigned. Existing cron schedules run assignment scans and weekly submission reminders; the appointment outbox sends messages. SMTP, cron execution and accurate employee submissions are prerequisites for routine automation. Failed or uncertain email delivery remains REVIEW, rather than being automatically sent again.

- `npm run test:team-coordinator`: real migration/schema parity plus isolated PostgreSQL workflow checks.
- `npm run test:team-coordinator:browser`: those checks plus desktop/mobile operator intake, weekly plan submission and email deep-link/handoff checks.

The system automates routine coordination under explicit rules. It does not claim error-free operation, infer customer agreement from browsing, or replace authorised business review. The exceptions screen is part of normal operation.
