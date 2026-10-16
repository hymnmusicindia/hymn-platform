# Team client contacts and scheduling

Client cards support one primary and one secondary email, six service interests, optional city/state and existing notes. Email matching is case-insensitive and live against the user database; badges do not grant access, merge users or change login addresses. Duplicate contact addresses across either email slot are rejected within a workspace under the existing workspace write lock. Account lookup requires clients.manage; client lists require clients.view.

New schedule times are blank. The required start and optional end use a 12-hour dial plus accessible native selects and explicit AM/PM. Dates/time are interpreted in Asia/Kolkata. Existing events retain saved values. Start-only appointments have a null end, remain visible in range queries and receive reminders. They are point appointments for conflict detection, not silently assigned a duration.

An active client save queues one introduction to the primary address only when neither address matches a HYMN account. The durable welcome queue is deduplicated globally by normalised email; edits and concurrent saves do not send repeated introductions. Old cards are not bulk-mailed by the migration. Next after() dispatches after the save response, with the Team OS cron as a recovery path. The worker rechecks account signup, contact status, primary-address changes, owner activity and newsletter suppression before sending. No newsletter subscription is created.

The introduction uses the saved name, interests and optional location, with honest fallback copy, reply-to, opt-out-by-reply instructions and the standard HYMN WhatsApp footer. EMAIL_ENABLED and configured SMTP credentials are required. Disabled email leaves jobs pending. SMTP uncertainty/failure is marked REVIEW and is not automatically resent; inspect Admin email logs before an explicit retry. SENT means SMTP accepted the message, not proof that the recipient read it. Saving a contact and sending email are separate durable steps.

Verification: `node --import tsx scripts/verify-team-os-isolated.ts --contacts-browser`, TypeScript, targeted ESLint and migration safety checks. Financial and email provider tests use isolated fixtures and injected delivery, never real customer emails.

Design references: [Material time pickers](https://m3.material.io/components/time-pickers/) and [WAI dialog/date-picker keyboard guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/).

## Interactive calendar and My Work

The entire day surface is a keyboard/touch-accessible scheduling button; event chips open their own details and task chips open My Work without triggering the date composer. Client-card drag/drop is retained. The board offers month/selected-day agenda views, event-type and teammate filters, title/client search, closed-event visibility, today highlighting and overflow-to-agenda controls. Multi-day events appear on each day they overlap.

Choose “Task in My Work” in the day composer to create a canonical TeamTask at the selected due time. No second calendar-event copy is created. Retries use a stable per-composer UUID, checked under the workspace lock. Existing task creation/assignment permissions, visibility rules, status transitions and audit logs are retained. Changes to a task's due time or completion in My Work are reflected by calendar reads. The Team OS cron sends one in-app due reminder per task/due-time combination; the cron's 15-minute cadence determines delivery timing. This release adds no schema migration or external calendar sync.

Interaction references: [FullCalendar date selection](https://fullcalendar.io/docs/date-clicking-selecting-demo) and [Google Calendar task scheduling](https://support.google.com/calendar/answer/9901136).
