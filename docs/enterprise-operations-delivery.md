# Enterprise operations delivery

This delivery extends the existing Team OS. It is a working owner workload/delegation slice of the larger enterprise specification, not a claim that every requested advanced module has been completed.

## Audit and architecture

The application uses Next.js 16.4.5, React, Prisma/PostgreSQL and the existing cookie/session authentication. Team membership, live account status and protected owner roles are resolved on the server. Administrative platform membership is a separate authority boundary. An owner of a Team workspace does not automatically receive financial/platform administrator privileges.

The existing system already provides projects, dependencies and cycle rejection, task approvals, comments/attachments, private threaded chat, mentions and read state, role management, approval requests, audit history, deterministic call routing, capacity-aware appointments, acquisition attribution, weekly reporting and idempotent service-review automation. These implementations were retained. Calls and Tasks & operations remain separate queues.

Reviewed implementation areas include `prisma/schema.prisma`, `lib/team/{access,policy,service,advanced,daily-work,operations,work-station-policy}`, existing Team/Admin navigation, owner-bootstrap verification, Team OS integration fixtures and core regression suites. Local Next route-handler and CSS guides were read before implementation. Existing unrelated CSS, TypeScript configuration, downloads, operational scripts and local artifacts are excluded from this delivery.

## Delivered functionality

Owners can open **Team → Manage → Operations centre**, or `/team?module=owner-operations&workspace=<workspace-id>`.

- Owner-only operational dashboard with clickable outstanding, active, overdue, blocked and recently completed metrics.
- Links to actual pending task-review, acquisition and waiting intake records, rather than fabricated business/revenue figures.
- Department, text/project/person and seven/thirty-day filters; workload, attention and recent-activity views.
- Workload cards with current/proposed remaining effort, configured capacity, availability, missing estimates and explicit capacity states. Task counts are never used as utilisation.
- Editable remaining-hour estimates, member weekly planning capacity, skills and near/overload thresholds.
- Multi-select assignment with desktop drag/drop and explicit touch/keyboard controls.
- Local what-if planning, projected capacity, per-change removal, reset and handoff note. No database mutation occurs during preview.
- Atomic application of up to 50 changes with task-version checks and live permission/member validation. A failed task rolls back the whole batch.
- Safe undo using versions returned by the preceding transfer; subsequent edits cause a conflict rather than being overwritten.
- Contextual task drawer for estimates, prerequisite status, linked record/project and access to existing full task history/files.
- Focused attention view deduplicated by task ID, showing actual blocked/overdue reasons.
- Existing notification preferences respected for transfers. Creator, comments, files, task IDs and historical/acquisition financial attribution are preserved.
- Existing global search extended with permission-filtered workspace commands, Create task and recent workspace commands. Ctrl/Cmd+K no longer triggers the conflicting Team page switch. Existing record searches keep server-side scopes.
- Bounded sixty-second/focus refresh when no plan is pending. Pending plans remain stable and are revalidated on apply; failed refreshes expose stale state.
- Responsive light/dark layout, native modal focus handling, keyboard alternatives, reduced-motion handling and empty/error states.

## Storage, authority and deployment

No database migration, new dependency, paid service or production data rewrite is required. Remaining effort lives in the existing task `followUpContext.operations.remainingHours`. Member planning settings live in `preferences.operations`. Both preserve unrelated metadata and increment/check appropriate concurrency tokens. Capacity settings have a hash token to prevent competing owners overwriting each other.

All new mutations run through the existing workspace-locked transaction, which re-reads actor membership and role. Planning reads also recheck live owner authority. Display names, supplied roles and email text grant nothing. Existing authenticated same-origin, JSON, size and rate-limit API guards apply. No new owner grants were made. Existing co-owner identity and privilege setup remain intact.

A read-only production check on 26 November 2026 confirmed the existing active protected owner memberships for Aditya Ujjain (user 18) and HYMN Music (user 27). The application does not hardcode these names or IDs to grant access; it uses their verified membership records.

Calls, consultations, active activities, scheduled calendar work, archived/closed tasks and incompatible project/service destinations are deliberately prevented from generic reassignment. Their established workflows preserve consent, appointment confirmations, declared hours, review permissions and financial attribution. No external messages are sent by previewing or applying this plan; in-app notifications use existing preferences.

Rolling back the application leaves additive JSON metadata harmless and preserves audit/history records. No destructive database rollback is needed.

## Capacity and reporting definitions

The planning horizon includes open tasks due before its end, plus overdue and undated tasks. Available hours equal configured weekly hours multiplied by horizon days / 7. This is declared planning capacity, not attendance or calendar-slot availability. Missing capacity/estimates produce incomplete data, and zero capacity never divides by zero. Completion metrics use actual completion timestamps in the preceding seven/thirty days; they do not imply all-time completion or a ranking.

Reads are bounded to 5,000 task summaries. If exceeded, the UI explicitly marks counts partial and withholds precise utilisation. Member cards initially show at most 50 matching tasks, with an explicit refinement message. This limit is not presented as an exhaustive enterprise-scale analytics backend.

## Research

Interaction guidance came from [Linear ownership](https://linear.app/docs/assigning-issues), [Linear triage](https://linear.app/docs/triage), [Asana workload](https://asana.com/resources/asana-tips-workload), [ClickUp views](https://clickup.com/features/views), [Monday workload](https://support.monday.com/hc/en-us/articles/360010166559-Resource-management-with-Workload), [Notion linked views](https://www.notion.com/help/views-filters-and-sorts), [Trello card movement](https://support.atlassian.com/trello/docs/moving-cards-or-lists/), [Airtable personal views](https://support.airtable.com/articles/5189551686-getting-started-with-airtable-views) and [n8n workflow structure](https://docs.n8n.io/build/understand-workflows.md). Ownership stays explicit, moving a card preserves its identity, views operate on shared records, and planning is separated from applying changes. Figma/Miro help pages could not be retrieved; no claim of reviewing those pages is made.

## Remaining scope and safety boundaries

- The canonical task owner is non-null and widely used by call, notification, acquisition and review contracts. True ownerless tasks and an unassigned-task drop lane need a coordinated nullable-owner migration and regression of those consumers. The existing Work coordinator waiting-intake queue is exposed accurately instead of disguising an owner as “unassigned.”
- Generic scheduled-call/calendar reassignment is not provided in the new board; use Calls/Calendar.
- There is no new arbitrary automation canvas, execution replay engine or configurable CRM stage model. Existing restricted/idempotent automation and acquisition state/commission contracts remain in force. Generalising them safely needs explicit event schemas, action-level authority and replay/loop limits before activation.
- Custom widget resizing/order, server-persisted named dashboards, drag timeline/status/priority editing, automatic skill recommendations, full cross-entity graph canvas and acknowledgment-required handoffs are not added here. Existing workflow/status editors and structured handoff machinery remain available.
- Attention items are task exceptions with contextual inspection. Snooze/escalation lifecycle, deduplicated cross-service financial/legal alerts and new Friday reporting automation are not implemented by this delivery.
- Polling is lightweight, not websocket realtime. A pending plan is not silently reconciled; versions protect the apply operation. Undo is session-local and cannot bypass current authorization or changed versions.
- Whole-system browser/end-to-end coverage is not claimed. The final response records actual commands/results and any baseline failures.

## Verification commands and artifacts

- `node --import tsx scripts/verify-team-os-isolated.ts --operations-only`: disposable PostgreSQL integration tests.
- `node --import tsx scripts/verify-team-os-isolated.ts --operations-build`: the same isolated tests plus a real production Next build against disposable data, with email/cron disabled.
- `node scripts/verify-operations-planning-browser.cjs`: light/dark 320/390/1440px interactions, drag/touch preview, no-write sandbox, apply, undo, estimates, stale rejection, attention, Ctrl+K and overflow checks.
- `--operations-http-only` runs the real built Team page and API against a fresh disposable database. It validates authenticated owner access, member/forged-role/cross-origin denial, input validation, private no-store responses and live revocation. The fixture models the production proxy/origin headers and disables external redirects.
- `node scripts/verify-core-suite.cjs`: sixteen existing domain groups and request-boundary regressions; no production mutations.
- `node --import tsx scripts/verify-navigation-sections.ts`: existing navigation reachability/permission regression.
- Existing Team OS/admin isolated suite was run as a baseline. Backend, advanced Team and Admin authority assertions passed. Its legacy Admin browser test failed an immediate focus assertion after Ctrl+K; it is not reported as passing.
- The additional isolated workstation regression initially hit local disk exhaustion. After clearing stopped fixture data and generated cache, its retry passed the separate Calls/Tasks queues, shared assignment visibility, stale claims, activity concurrency, callback ownership, call reports and both-owner leadership tests. Production data was unaffected.
- Screenshots: `.cache/operations-planning-browser/{light,dark}-{320,390,1440}-workspace.png`; error-state counterparts omit `-workspace`.

Actual built-shell screenshots are `production-desktop.png` and `production-mobile.png` in that directory. Their data comes from disposable accounts, not live business analytics. Full-shell review caught inherited full-width filter styles; scoped layout overrides corrected them. Review counts now match the actual task-review destination, waiting intake links open Work coordinator, and capacity audit entries open the staff directory. Dedicated regression assertions cover these destinations.

The domain regression command passed all sixteen core groups and request-boundary checks. Changed-file lint has zero errors; it reports the small avatar `<img>` warning and a pre-existing unused `_reason` warning in the service file.

Final release verification on 26 November 2026 passed production compilation (4.0 minutes), full Next TypeScript checking (4.4 minutes), generation of all 396 static pages, build tracing and the real production HTTP/browser fixture. The disposable database shut down cleanly and the verification wrapper returned zero. The final source was frozen before that run.

Review artifacts: [desktop](images/enterprise-operations-desktop.png) and [mobile](images/enterprise-operations-mobile.png). These intentionally show isolated fixture records.

No production accounts, live customer records or external messaging systems are used by the new test fixtures.
