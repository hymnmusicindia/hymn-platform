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
