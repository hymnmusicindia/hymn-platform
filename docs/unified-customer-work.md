# Unified customer work and Google Calendar

Team OS has six primary destinations: My day, Customers, Team queue, Schedule, Messages, and Manage. Existing task, callback, research, consultation and calendar URLs remain valid. Consultations and research retain specialist views under Manage. My day filters first conversations, follow-ups, consultations and ongoing assistance, and includes accepted specialist collaborations.

The shared customer card links open work, responsible teammates, call stages, appointments, Meet links and shared history. Private contact notes retain their existing access rules. Calendar viewing permission alone does not reveal other employees' bookings on the customer card. Customer merges retain consultation links and do-not-contact preferences.

## Calls, scheduling and handoffs

Call phase, call attempts and completed conversations are separate task fields. A no-answer increments attempts without advancing the phase. A completed conversation with a next step advances ordinary call work to Follow-up; consultations retain their specialist phase. Moving a booking and saving notes never records a call. Three unanswered attempts continue to require supervisor review. Research attribution and financial credit remain independent of task assignment.

The common allocator uses role permissions, active membership, assignment availability, service expertise, declared hours, reservations, daily limits, existing responsibility and weighted shared workload. Consultation tasks and their calendar reservations count once. The slot picker loads one batched allocation snapshot; writes revalidate under the workspace lock. CRM rotation, coordinator calls, representative passing and consultations use the common selector; daily planning and employee slots share its capacity rules.

Consultation submission reserves an available selected slot, creates one shared task and links the calendar event atomically. An unavailable slot leaves the request UNASSIGNED for review. No-slot requests are saved for allocation. The Team OS cron retries waiting requests in bounded batches, and does not silently move an expired customer-requested time. Legacy assigned consultations gain their shared task through reconciliation or Prepare shared call task.

Reschedule is available from the queue and customer card. It uses version checks, available slots, existing teammate preference, a reason and an explicit customer-agreement checkbox. Internal plans use FOLLOW_UP; agreed appointments use CALL. Changing a confirmed booking preserves its event identity. Real consultation outcomes close the prior appointment and preserve its history; any new internal follow-up gets a separate reservation.

Handoffs keep the current responsible teammate until acceptance. Transfer changes operational ownership; Help adds a collaborator. The recipient must still have source access, permissions, hours and capacity when accepting. Changed, active, reserved or closed work cannot be accepted using an old handoff. Accepted specialists can find shared work in My day and add updates in Team discussion. The accountable teammate is notified of updates.

## Connect the HYMN hosting Google account

The shared HYMN Google account hosts confirmed call events. The assigned teammate and customer receive Google Calendar invitations on their own email addresses. The event title is Client name — purpose. The description contains the customer-supplied requirements and relevant call details; private notes and handoff summaries are excluded. Google generates a Meet conference for the event.

1. Enable Google Calendar API in the hosting OAuth project's Google Cloud console and configure its consent screen for the HYMN account.
2. Configure a Web application OAuth client with the redirect URI `https://<HYMN public host>/api/team/google-calendar/callback`.
3. Set `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, and a stable random `TEAM_CALENDAR_ENCRYPTION_KEY` of at least 32 characters in server environment configuration. The integration can reuse `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`; encryption falls back to the existing strong `JWT_SECRET` if a dedicated key is absent. Changing encryption keys requires reconnecting.
4. As a workspace owner, open Team queue → Google Calendar & Meet → Connect Google Calendar, sign into the **HYMN hosting account**, and grant Calendar access. Google sign-in alone does not grant Calendar permission. The callback checks a signed expiring state, the HTTP-only nonce cookie, the current owner session and the granted scopes.
5. Confirm the hosting account shown in Team queue. Test one actual agreed consultation after deployment and check invitations in the client's and teammate's calendars. A Google Meet link requires the hosting account to support Meet conferencing.

Refresh tokens are encrypted with AES-256-GCM and never returned to the browser. A connected calendar cannot be silently switched to a different account after it owns events. Reconnect its original hosting account to preserve those bookings.

### Get Google Calendar OAuth credentials

1. Open [Google Cloud Console](https://console.cloud.google.com/), select or create the HYMN project, then enable **Google Calendar API** under **APIs & Services → Library**.
2. Open **Google Auth Platform**. Configure **Branding** with HYMN's app name, support email and developer contact. Under **Audience**, use Internal only for an eligible Google Workspace organization; otherwise use External. While Testing, add the HYMN hosting Google account as a test user.
3. Under **Data Access**, add `openid`, `https://www.googleapis.com/auth/userinfo.email`, and `https://www.googleapis.com/auth/calendar.events`. The application requests `openid email` and Calendar event access.
4. Under **Clients → Create client**, choose **Web application**, name it HYMN Calendar, and add this exact **Authorized redirect URI**: `https://hymnmusic.fun/api/team/google-calendar/callback`. If the app runs on a different public origin, use that origin; it must match the server's public app URL. For local development, add `http://localhost:3000/api/team/google-calendar/callback` separately.
5. Copy the Client ID and Client secret into the server's environment as `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET`. Set `TEAM_CALENDAR_ENCRYPTION_KEY` to a stable cryptographically random secret; generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Keep these secrets in server configuration, outside source control and client bundles. Restart/redeploy after saving them.
6. As workspace owner, use **Team queue → Google Calendar & Meet → Connect Google Calendar** and authorize the HYMN hosting Google account. Creating credentials does not connect the calendar by itself.

For External apps in Testing, Calendar refresh tokens expire after seven days. Configure production publishing and any required Google verification for ongoing use, then reconnect as needed. See [Google's web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server) and [refresh token expiration rules](https://developers.google.com/identity/protocols/oauth2#expiration).

## Durable external synchronization

### Automated meetings by email

Workspace owners can use **Team queue → Schedule a Google meeting** to enter guest email addresses, an IST date/time and a 15–240 minute duration. The form starts with tomorrow at 4 PM IST and a 30-minute duration. It accepts up to 20 guests, removes duplicate addresses and checks the host's HYMN reservations. It does not check guests' external calendar availability.

Saving creates a durable meeting request, including while the hosting Google account is disconnected. Connect the account using the existing Google Calendar & Meet form once. The OAuth callback, after-response hook and Team OS worker then create the Google event, invite the supplied guests and request a Meet link. A saved request is not labelled as a Google booking until synchronization succeeds; guests still choose whether to accept. Owner-only request history shows waiting/retry/error states, Calendar/Meet links and cancellation controls, and refreshes pending requests periodically.

Meeting descriptions contain only the explicitly supplied invitation message. Private contact/calendar notes are excluded. Request keys and deterministic Google event IDs protect browser and worker retries from duplicate events. Retries preserve the original form/request identity. Expired offline requests are flagged for a new time instead of sending a retroactive invitation. Cancellation is saved locally and queued for Google so guests receive the external cancellation after synchronization.

Deploy migration `20261111100000_scheduled_meetings` before serving the meeting scheduler. It adds meeting guest/message/request-key fields to existing calendar events without changing historical records. Run `npm run test:meetings` for migration parity, owner permissions, validation, persistence, retry/concurrency/cancellation cases and responsive form tests. The integration continues to use `calendar.events`, `conferenceDataVersion=1` and `sendUpdates=all` as documented by [Google's event creation API](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).

The database transaction queues synchronization without waiting for Google. After-response hooks and the existing Team OS cron process that queue. Local bookings remain saved during an outage. Deterministic event IDs and conference request IDs, atomic leases, revision checks and retry backoff prevent duplicate event creation and stale local acknowledgements. Rescheduling updates the external event; reassignment replaces the invited teammate; opt-out and cancellation remove the external booking. Completed calls retain calendar history.

The customer card shows the Meet link or synchronization state. Owners see Waiting for connection, Retry and Error exceptions in Team queue, with reconnect and retry controls. Transient failures back off; authentication/conferencing failures require review. Google API requests have timeouts and each processing pass has a bounded time budget. Pending conference creation is polled by subsequent passes.

Apply migration `20261110190000_unified_customer_calls` before serving the new code. Use HYMN's existing owner-credential release migration process. The migration adds fields/tables, classifies legacy call work and queues existing upcoming consultation bookings; it does not delete customer history. A Git push does not apply the migration or authorize the hosting Google account.

## Verification

`node --import tsx scripts/verify-acquisition-isolated.ts --unified-crm-only` applies the real SQL migration to its pinned preceding schema and verifies schema parity before running PostgreSQL integration checks. `node scripts/verify-team-calendar-oauth.cjs` checks connection authorization and state boundaries. Google HTTP calls are simulated; tests send no invitations. `node scripts/verify-unified-customer-work-browser.cjs` exercises responsive scheduling and handoff controls at 1440, 390 and 320 pixels. Existing core, workstation, consultation, coordinator and navigation suites cover their surrounding paths.

References: [Google event creation and deterministic IDs](https://developers.google.com/workspace/calendar/api/guides/create-events), [Google event and conference data](https://developers.google.com/workspace/calendar/api/v3/reference/events), [Google error and quota handling](https://developers.google.com/workspace/calendar/api/guides/errors), [Google server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [HubSpot activity associations](https://knowledge.hubspot.com/records/associate-activities-with-records), [Intercom balanced assignment](https://www.intercom.com/help/en/articles/6553774-balanced-assignment-deep-dive).
