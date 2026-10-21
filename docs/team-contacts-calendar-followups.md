# Shared contacts, calendar and customer callbacks

Every active Team OS member can read, add and update basic contact cards in their workspace. Contact database, calendar lookup and CRM Add contact actions use the same card store. Research registration is an optional handoff on that form, restricted to researchers. Existing account/lead checks and immutable acquisition attribution still apply; saving ordinary contacts and support callbacks earns no acquisition credit.

Private card notes and welcome delivery history remain visible only to the responsible teammate and members with `crm.all` (including owners). They are excluded from shared searches. Editing basic details cannot overwrite another member's private notes, reassign ownership without `tasks.assign`, or reactivate another member's suppressed card. Research changes update the linked card; card identity changes invalidate research verification. Do-not-contact cancels open linked callbacks and future appointments.

Calendar events are returned only when the member is the assignee or creator, or has `tasks.all` / `tasks.assign` authority. Task deadlines retain existing owner, creator, collaborator and project scope. Knowing a shared contact does not grant access to their appointments or call history. Calendar navigation supports Day, Week, Month and a seven-day Schedule; all times use IST. Timed blocks share columns when they overlap, and clicking an empty hour preselects that time. Mobile opens Day view; Week has its own contained scroll region.

## Automatic callbacks

The existing authenticated `team-os` cron invokes a separate workspace-locked callback transaction, with bounded batches and persisted scan cursors. It runs for the primary (oldest) workspace, matching existing HYMN account-card ownership. Each run retries safely; the existing cron schedule determines delivery latency after eligibility (the inactivity threshold is not a guaranteed exact dispatch time).

- Draft: eligible after **30 hours** since `lastEditedAt`, falling back to creation time. A newer saved edit, submission, archive or ineligible contact cancels the old callback at the next scan. A later 30-hour inactivity cycle can create a new callback.
- Enquiry: actual `GrowthLead(kind=contact)` records from the last 30 days, excluding closed/resolved/spam/do-not-contact. A guest's supplied phone can be used with an explicit unverified-identity footnote.
- Service interest: actual trusted service-link clicks recorded independently of marketing analytics. The POST endpoint validates same origin, active signed-in customer/producer, an allowlisted service path, body size and per-user rate limit. Identity comes from the session. It deduplicates per customer/service/IST day. Distribution start is deliberately excluded, so uploading does not bypass the 30-hour draft rule. Interest has a seven-day lookback and is clearly labelled as browsing, not an enquiry or sale.

An active contact with a usable international phone number is required. Calls rotate among available, active, non-owner employees designated as callers in CRM preferences, with `crm.outreach.manage` and `tasks.update`. Sources remain retryable if no caller is available. Signals have unique workflow keys; repeated interest/enquiries about one service append context to an existing open callback. Assigned staff see their own queue; `tasks.all` permits workspace supervision. Representatives open WhatsApp Web, the app or the phone dialler and record the real outcome/next step in My Work. Opening a link sends no message, starts no call and records no successful contact. Callback tasks do not create customer appointments, appointment emails or acquisition commissions.

`TEAM_AUTOMATION_ENABLED=false` disables new service-interest capture. Disabling the existing `team-os` cron stops callback generation as well as its other Team OS work; there is no separate external scheduler to configure.

## Deployment and validation

Deploy `20261022090000_shared_contacts_followups` before serving the new code. It adds nullable task/contact links, callback context, a unique optional prospect/card link and a workspace scan cursor. Existing contacts and tasks are retained. Use the existing `npm run deploy:release` owner-credential migration process, or `build:release` in the deployment pipeline. A Git push alone does not prove that Hostinger has deployed code or applied this migration.

Checks:

```
node --import tsx scripts/verify-acquisition-isolated.ts --contacts-followups-only
node scripts/verify-team-interest-route.cjs
node scripts/verify-team-calendar-directory.cjs
node --import tsx scripts/verify-acquisition-isolated.ts
node node_modules/typescript/bin/tsc --noEmit --pretty false
```

The isolated database fixture applies the SQL migration to the preceding schema, and covers shared editing/private-note protection, workspace/calendar/caller isolation, the 30-hour boundary, retries, draft resumption, DNC and financial separation. Browser checks exercise actual components at 1440, 390 and 320 pixels. No production customer messages are sent by these tests.

Design references: [Google Calendar views and navigation](https://support.google.com/calendar/answer/6110849), [WhatsApp click to chat](https://faq.whatsapp.com/5913398998672934). The implementation uses HYMN's existing dark palette and local contact/calendar data; it is not a Google Calendar integration.
