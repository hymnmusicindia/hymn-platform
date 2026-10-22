# Team OS calls and individual email

## Using it

- **Customer callbacks** shows assigned inactivity, enquiry and service-interest follow-ups. Every card includes source context, a preparation tip, a calendar time, contact actions, outcome recording and a link into the email composer.
- **Contacts & Calls** retains researched-lead ownership and acquisition attribution. Its existing call tasks also receive internal calendar reservations; CRM and calendar reschedules stay linked.
- **Team email** is available to every active member, including researchers and other roles without CRM outreach permissions. Contacts are shared; callback notes, CRM access and sending history retain their assignment/manager scopes.
- An individual message needs a selected contact, template, reviewed body and explicit send. HYMN adds the saved employee name and job title (or role), greeting and signature on the server. The From display name changes while the configured, verified HYMN mailbox remains the sender. Replies use the existing configured HYMN reply-to address.

## Automation

The primary workspace's `team-os` job scans bounded batches every 15 minutes. Drafts become eligible after 30 hours without saved edits. Saved enquiries, Community Plan/promotion requests and explicit signed-in service-link clicks are distinct signals. No number means no automated call assignment. Explicit enquiries receive higher priority than browsing interest.

Available caller members are selected by open callback workload, with rotation for ties. Calls reserve 30-minute slots between 09:30 and 18:00 IST, avoiding other calendar reservations. These are internal FOLLOW_UP events; customer appointment confirmations are reserved for explicitly scheduled CALL events. Representatives place the calls themselves.

Repeated service signals append footnotes to an open follow-up rather than multiplying tasks. A resumed/submitted draft, closed request or ineligible contact cancels its obsolete callback and reservation. Unavailable representatives' customer callbacks can be reassigned with a notification and audit entry.

Outcomes retain comments and audit history. A requested callback requires a future time; an occupied/out-of-window time is rejected with the next available slot. No-answer retries move to the next day; three consecutive unanswered attempts block further automatic attempts pending review. Do-not-contact closes related work and prevents email delivery. Account assistance does not claim acquisition credit or create commissions.

## Email delivery

The durable outbox uses request keys, atomic worker claims, recipient/member rechecks and verified sender identity. The new `team-outreach` job runs every minute in the central scheduler and has Vercel/GitHub fallbacks. Its processing budget stays below the scheduler timeout. API sends also schedule an immediate after-response attempt. SMTP-disabled messages stay queued and are visible as pending configuration.

Sending is limited to five individual messages per member/hour and an existing queued/sent/uncertain message suppresses another outreach to the same recipient for three days. Invalid, inactive, suppressed, opted-out or unverified research recipients are rejected. Each email includes a signed opt-out flow; GET only displays confirmation so link scanners do not unsubscribe people. POST suppresses future team outreach without suppressing account or purchase notifications.

Uncertain delivery becomes REVIEW, never an automatic resend. An owner or authorised CRM manager can queue a retry only after recording a delivery review reason and confirming non-delivery. An already accepted provider log prevents a retry. Retry attempts have separate event keys and audit entries. Generic email retries cannot bypass these checks.

## Deployment and checks

Apply the additive `20261023193000_team_smart_outreach` migration through the existing production migration workflow, then deploy the generated Prisma client and application. No customer emails are sent by the migration. `TEAM_AUTOMATION_ENABLED=false` disables scheduled automation. The verified HYMN SMTP configuration must be enabled for delivery.

Run `npm run test:team-outreach` for a disposable PostgreSQL fixture covering the actual migration, scheduling, conflicts, 30-hour boundary, caller scope, deduplication, calendar edits, reassignment, retries, personalized sending, concurrent claims, opt-out and recipient revalidation. Fixture email delivery is mocked; no customer emails or calls are made.

## Design references

[Salesforce assignment rules](https://help.salesforce.com/s/articleView?id=sf.essentials_round_robin_lead_assignment.htm&language=en_US) informed balanced routing. [HubSpot lead scoring/routing](https://academy.hubspot.com/lessons/lead-scoring-lead-routing-hubspot) informed explicit priority distinctions between enquiries and lower-intent browsing. [Google sender guidelines](https://support.google.com/mail/answer/81126) informed sender consistency and opt-out handling. Tips use recorded facts and structured outcomes; they do not invent customer preferences from free-form notes.
