# Team Workspace verification — 11 November 2026

The production outage was caused by missing migration `20261110190000_unified_customer_calls`. The migration was applied using the existing canonical-database release process. The task query that failed with `P2022` subsequently passed. Startup and release checks now probe the call-work, consultation, handoff and Google Calendar schema before serving the application.

The broader browser checks also found that editing an existing contact record never displayed its dialog. The dialog now stays mounted in both directory and record views. The regression follows the actual record → edit → save flow, checks private-note hiding and owner preservation, and runs at 1440, 390 and 320 pixels.

## Confirmed checks

| Area | Verification |
| --- | --- |
| Core regressions | `npm test`: all 16 groups and four request/update/notification boundary checks passed. Includes distribution contracts and pricing, artist validation, producer lifecycle, analytics, 120 migration safety checks, payment signatures and enforcement, subscriptions, storage/media integrity, release transitions, payout policy and studio services. |
| Team OS | `npm run test:team-os` passed: explicit owner bootstrap, delegated work, approvals, stale writes, dependencies, chat privacy, CRM idempotency, suppression, reporting, invitation/revocation, append-only audit, recurrence/archive, projects, approved documents, automation, contact matching, reminder boundaries, handoffs, cancellation and booking overlap rules. |
| Acquisition and CRM | `npm run test:acquisition` passed: attribution, reconciliation, partial refunds, independent customer rewards, disputes, payout reservation races, caller rotation, permissions, phone deduplication, scheduling, daily targets, handoffs, concurrency and IST midnight. |
| Work-station domain | `npm run test:work-station` passed: shared/private assignments, claims, reopening, immutable attempts, concurrency, retry limits, support workflows, report amendments, merge retention, callback ownership, atomic completion and leadership reporting. The personal-plan fixture uses its simulated clock for candidate dates. |
| Production build | Next.js production compilation, TypeScript, all 369 generated pages and build tracing passed against a disposable fixture database, with external email and cron workers disabled and an 8 GB Node heap. |
| Lint | `npx eslint app components lib scripts --quiet --cache` passed with zero errors. Existing warnings remain. |
| Unified customer work | `npm run test:unified-crm` passed: migration parity, concurrent capacity, idempotency, private calendar scope, rescheduling, stale edits, handoffs, call attempts and waiting allocation. |
| Google Calendar | Simulated event identity, Meet creation, concurrent synchronization, retry/reconnect, URL validation and opt-out cancellation passed. OAuth rejects cross-origin requests, non-owners, wrong/replayed state, missing scopes, changed sessions and revoked ownership. |
| Finance integration | Mocked settlement import, pagination failure, verified accounts, concurrent wallet reservations, held transfers, duplicate delivery, timeout recovery, reversals and cancellation passed. |
| Work-station browser | Autosave, timer pause/resume, call outcomes, ticket email controls, contact lookup and overflow checks passed in light/dark themes at 1440, 768, 390 and 320 pixels. |
| Contacts/calendar browser | Calendar views, slot composer, contact-record editing, restricted notes, owner preservation, WhatsApp links and overflow checks passed at 1440, 390 and 320 pixels. |
| Call-report browser | Saved history, report amendments, reopening, actual IST times and mobile overflow checks passed at 1440, 390 and 320 pixels. |
| Chat | Initial delivery, conversation isolation, live changes, permission revocation, directory updates and cleanup passed. |
| Audio preview | Rapid switching, stale abort/error isolation, WAV fallback, pause/resume and audible default volume passed at 1440 and 390 pixels. |
| Spotify photo refresh | Cron authentication, identity validation, concurrent edits, missing images and provider failures passed. |
| Team startup/read recovery | Session/account/membership checks, bounded transient retries, permanent failures and missing-schema deployment guards passed. |

Legacy fixtures were updated to use the real historical pre-migration schema, then brought forward to the current generated client in disposable databases. Customer referral fixtures now use a separate non-staff referrer. Signup is explicitly checked to avoid silently assigning a connection; the old signed-link helper is exercised separately with a legacy lead. Advanced Team tests reject owner work assignments and unverified conversion, and use an employee with the matching review permission.

All external Calendar requests and finance transfers in these tests were simulated. No live Google authorization, invitation delivery, SMTP delivery or real payment transfer was tested. Local OAuth credentials remain in ignored environment files and are not part of the commit.

## Meeting automation follow-up

The owner-facing meeting scheduler now creates durable requests for explicit guest emails and IST times, waits for the hosting account connection, and uses the existing Google synchronization worker for invitations, Meet links and cancellation. The additive migration `20261111100000_scheduled_meetings` was verified for schema parity and applied through the canonical production migration process.

`npm run test:meetings` passes migration parity, owner/revocation checks, recipient/time validation, offline persistence, request idempotency, overlap rejection, private-note exclusion, description escaping, transient failure/retry, concurrent sync, pending conference polling, stable Meet request identity, fully synced no-resend, cancellation and expired-request suppression. Google IDs are checked against the actual API's `0-9` / `a-v` alphabet. The earlier brand-spelled prefix contained an invalid `y`; new deterministic IDs use a valid prefix while stored external IDs remain unchanged.

The browser suite passes at 1440, 390 and 320 pixels, covering tomorrow at 4 PM IST defaults, retained form/request keys after failure, normalized guests, connection waiting state, Google/Meet links, cancellation and overflow. `npm run test:unified-crm`, OAuth boundary checks, schema-readiness checks, focused lint and the 121-migration safety check also pass. No real Google invitations were sent during verification.

The final production build, TypeScript checks and all 369 generated pages passed against the updated disposable fixture database, including the corrected event and conference request identities.
