# HYMN operations upgrade

## Administration

Admin navigation is a keyboard-operable, single-open accordion. Search displays a flat list of authorised modules. Producers and Beats / Orders share the Marketplace destination; old producer links resolve to the merged view. Producer inspection starts in a native modal with published catalogue cards (cover, title, key, BPM, mood and genre) and retains the existing profile/access controls. Release catalogues use searchable square artwork cards; selection opens centered delivery/catalog details without discarding the list. Pending engineer approvals use explicit dark-on-warm colours.

Revenue now owns scoped layout styles for metrics, filters, source donut, monthly bars, ledger and gateway tools. Financial definitions and payment actions are unchanged. Initial admin queries run in parallel rather than serial batches; heavier Revenue, Users and Team modules are split into on-demand bundles. These are structural improvements, not a claim of measured production latency or full server-side dataset pagination.

Admin Team separates platform access from Team OS membership, shows actual permission matrices, searches accounts/staff, handles network/API failures and sends optimistic membership versions. Founder/super-admin, live actor status, self-change prevention, recent authentication, same-origin checks, transaction locking and atomic audits remain server-enforced. Old clients can omit the optional version for compatibility; the new Team form always includes it. No new platform administrator privileges are granted by this release.

## Approved reviews

Signed-in home now includes a responsive customer-review carousel. Only approved written PurchaseReview rows are used; the latest 12 moderated reviews are fetched (null moderation dates last), with pinned entries prioritised inside that recent set. Approval expires the shared home cache immediately. Pin/unpin changes ordering; rejection removes a review. No customer review text or approval is fabricated. Deepan Aggarwal's existing approved review was confirmed read-only during implementation.

## Shared calendar and clients

Migration `20261016090000_team_calendar_clients` adds TeamClient and TeamCalendarEvent, indexes, foreign keys and status/range constraints. It extends built-in role-name templates with calendar/client capabilities while retaining their existing powers; owner roles use their protected owner permission bypass. Custom names receive no implicit grants.

Clients require only a name and responsible teammate; phone and email are optional. Cards contain research footnotes and active/do-not-contact/archive status. The shared month calendar accepts drag/drop on desktop and click-to-schedule on touch/keyboard. Calls, email plans, meetings, follow-ups and general events have an assignee, India-time start/end, notes, outcome, reminder and scheduled/completed/cancelled status. Existing accessible task deadlines remain in the agenda. Reads and writes stay within the authenticated workspace. Reassigning or editing another person's work requires assignment permission; concurrent edits and overlapping assignee slots are rejected. Completed events require an outcome; do-not-contact/archive cancels future scheduled outreach. Records are retained, not destructively deleted.

The existing Team cron emits in-app reminders once per event, with up to 15-minute scheduling granularity. Rescheduling resets the reminder. Calendar email entries do not automatically send client emails; their email links open the user's email application. This is not a Google/Outlook sync or a telephony service. Client records are distinct from the evidence-based acquisition Prospect/GrowthLead workflow, avoiding invented research evidence or automatic newsletter subscriptions. List pagination and polling are bounded (100 clients per page; 1,000 events per six-week calendar range, with a visible warning if exceeded).

Interaction research: [W3C date-picker/dialog example](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/) informed explicit date labels, keyboard alternatives and live month headings; [FullCalendar's event interaction documentation](https://fullcalendar.io/docs/eventDrop) informed persisted event editing/drop semantics. Implementation uses native React/HTML/CSS rather than adding a calendar dependency.

## One-time engineer booking reminder

Authenticated `/api/cron/engineer-reminders` runs hourly from the production startup process, first tick 150 seconds after startup. It requires CRON_SECRET, enabled SMTP, JWT_SECRET for signed preference links, and ENGINEER_REMINDERS_ENABLED not set to false. Missing credentials skip without consuming deduplication keys.

Only an active, opted-in customer with an AWAITING_PAYMENT/UNPAID order older than 24 hours, no successful Studio purchase, and an active available listing/engineer qualifies. The latest unpaid booking is used; newer incomplete checkouts delay the reminder. Paid, cancelled, suspended, recent or opted-out accounts/orders are excluded/rechecked. The email names the customer, selected engineer and project, links to the actual Studio order and engineer directory, includes the shared WhatsApp contact button and the existing signed Studio preference opt-out. It does not claim an engineer accepted an unpaid job or guarantee results. One durable EmailLog key per customer prevents automatic repeated reminders; failed/ambiguous sends require inspection, not blind retries. A run attempts at most five deliveries. Fixture tests use an injected fake delivery function and never contact SMTP.

## Verification and deployment

Run `node --import tsx scripts/verify-team-os-isolated.ts --upgrade` for migration, Team regression, admin authority, calendar/client and fake-mail tests plus desktop/mobile browser flows. Run TypeScript/lint and a production build separately after browser servers stop (Next rewrites generated type paths). Deploy the additive migration with the existing ownership-checked production migration command, then push the application. Production SMTP secrets must be configured by the operator; they are never committed. A pushed commit is not proof of a completed hosting deployment or delivered email.
