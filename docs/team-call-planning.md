# Call allocation and nightly plans

Call-only emphasis is configured as `preferences.crm.callWeight`. Ordinary representatives use 1; the preferred dedicated caller uses 1.25. Allocation compares projected open call workload divided by weight, while retaining permission, availability, free-slot and shift checks. CRM lead rotation, customer callbacks, coordinator call intake and appointment handoffs use the weighted policy.

`scripts/rebalance-team-calls.ts` previews an explicit owner operation. `--preferred-member=<verified ID> --request-key=<stable key> --apply` saves and verifies a private backup, then redistributes only unattempted internal callback tasks. Confirmed customer appointments and attempted/in-progress work are retained. Tasks and calendar entries update atomically, revisions advance, obsolete representative reminders are cancelled, and one in-app summary is recorded for each caller. The request key prevents replay. Overdue internal suggestions are replanned within declared hours; future suggestions retain their date/time when capacity permits.

The existing `team-performance` cron runs every minute. From 21:00 to midnight Asia/Kolkata it queues one next-day planning email per active user, combining their active workspaces. Weekly performance reporting remains separate and weekly; neither phase blocks the other on failure.

The email contains working hours, all next-day calendar entries, other assignments due that day, overdue work and undated open work. A task linked to a calendar entry is listed once. Only the recipient's assigned or collaborating tasks are included. The agenda is collected immediately before delivery so queued mail reflects current assignments. It includes a single workspace link and no per-call staff reminder emails.

`EmailLog.eventKey` deduplicates each user and target day across retries and overlapping cron calls. Delivery claims are atomic. Known pre-connection failures may retry later that night; uncertain SMTP outcomes and interrupted sends require review. Expired plans are cancelled rather than sent the following morning. Generic transactional retries cannot bypass these rules. An explicit `nightlyPlan: false` preference is respected.

Run `node --import tsx scripts/verify-acquisition-isolated.ts --team-call-plan-only` for database-backed allocation, appointment preservation, workload, agenda, concurrent delivery and SMTP uncertainty checks. Real SMTP is never used in this fixture.
