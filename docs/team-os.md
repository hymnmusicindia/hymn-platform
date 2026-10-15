# HYMN Team OS

> Historical first-slice design and verification notes. The expanded release, current deployment steps and limitations are documented in [team-os-release.md](team-os-release.md). Status statements below describe the original slice, not the current release.

## Architecture and integration plan

Next.js 16 App Router, React 19, PostgreSQL and Prisma 6 are retained. Existing HYMN session cookies identify users; internal memberships are separate from CUSTOMER/PRODUCER/ADMIN account types and from admin memberships. No existing admin permission is expanded by Team OS.

The first vertical slice establishes an explicit owner, custom permission roles, authenticated expiring invitations, a protected `/team` workspace, projects, delegated tasks, review gates, private conversations, internal notifications, CRM records and weekly reports. Existing GrowthLead records are inbound enquiries, not a complete acquisition engine. Intake rejects contacts already present there rather than copying their business records into Team OS. Unified inbound-lead assignment/enrichment remains unfinished; no migration or silent import of existing leads is performed. Operational references are validated against existing Beat, Release, EngineerProfile and StudioServiceOrder records; no payment or distribution mutation is performed by this domain.

All reads are membership-checked and record-scoped. All writes run in a transaction with a workspace lock and re-check live membership/role, making revocation and task dependencies consistent under concurrent changes. Version fields reject stale edits. Audit rows are written in the same transaction. The initial realtime transport is authenticated short polling, not WebSocket/push delivery.

Initial staff templates describe Tavish Relhan and Manha Dakora but do not grant either access. Invitations require an explicit email, acceptance by the same signed-in account, and a single-use hashed token.

## Implementation status

This is an initial working vertical slice, not completion of all seven phases of the master specification.

Implemented: profile dropdown membership discovery, server-protected workspace, owner bootstrap, eight role templates and custom role creation, member suspension/restoration and role reassignment, expiring hashed single-use invitations, task creation/updates/delegation, checklists/dependencies, evidence and independent review gates, comments, projects, list/Kanban/agenda views, private/public channels, persisted messages, retry deduplication, in-app notifications, source-backed prospects, scoring breakdown, manual outreach events, opt-out suppression, customer-account linking, idempotent CRM follow-up tasks, server-calculated weekly reporting, founder workload/status counts, audit history, responsive dark UI and native accessible dialogs.

Not yet implemented: rich-text editing, task deletion/recurrence/subtasks/collaborators, project editing/milestones/workflow configuration, drag calendar/timeline and saved filters, attachment upload/download, threaded chat/reactions/read indicators/mentions/message editing, cross-module global search/command palette, discovery connectors and bulk import/export, payment-verified conversions/revenue attribution, configurable operation-event automation, dedicated approval types beyond task review, detailed DAW/asset QA, knowledge base, digest/reminder preferences, light theme, multi-workspace switcher, and complete seven-phase hardening. No decorative navigation is shown for these unfinished modules. Search is limited to loaded records in the selected view; paginated task pages show 50 records. Other module endpoints accept offsets, but their UI currently displays the latest 50. Chat displays the latest 50 messages.

Operational queues read the existing Beat, EngineerProfile, Release and StudioServiceOrder tables. Releases and studio orders are visible only when linked to an accessible task. The owner must create these initial record assignments; coordinators cannot attach arbitrary release/order IDs to gain visibility. Beat/engineer coordinators see limited operational metadata, never media storage keys or payment details. Completing these tasks cannot publish, enable WAV, alter ownership, change prices, submit to Direnote, or mutate payments.

## API and authorisation

`GET /api/team/[resource]`: session, overview, tasks, task, comments, projects, members, channels, messages, notifications, prospects, outreach, reports, audit, operations. The authenticated identity is always obtained from the existing HYMN session and current ACTIVE User and TeamMember records. Resource selectors are not SQL/table identifiers.

`POST /api/team/[resource]`: tasks, task-update, comments, projects, invites, members, roles, channels, messages, notifications, prospects, prospect-update, outreach, reports. Each action independently checks its permission; tasks/projects/prospects/conversations are resource-scoped. Custom role creation and access changes require the actual owner flag, not simply a permission string. No owner role can be invited or self-assigned.

`POST /api/team/accept` requires an active HYMN account but not an existing team membership; the invitation email must match the database account email. Tokens use 256 bits of randomness, only SHA-256 hashes are persisted, links expire in 72 hours, and revoked/used tokens are rejected. Tokens use URL fragments to avoid request/referrer logs. Sign-in handoff retains the token in tab-scoped session storage and removes it on acceptance. No invitation email is currently sent.

Write endpoints enforce same-origin requests, JSON input/body limits, rate limiting, schema validation, live permission checks and transaction-scoped locks. Read responses use private/no-store caching. Prisma parameterisation prevents raw-input SQL injection. Text renders through React escaping; arbitrary rich HTML is not accepted. Task versions prevent lost updates, dependencies are cycle-checked, and notification/read updates are recipient-scoped. Private conversations remain private even from the workspace owner unless included. Audit SQL triggers reject UPDATE/DELETE. No RLS is enabled: application-server policies enforce the existing deployment's trusted database access boundary.

## Database and deployment

Migration: `prisma/migrations/20261015190000_team_os/migration.sql`. Adds 14 team-domain tables, their indexes/foreign keys, status/record checks, one-owner-role constraint and append-only audit trigger. Existing business tables/data are not rewritten. User receives only a Prisma inverse relation; no new authentication system is created.

1. Review the schema and migration; take a normal PostgreSQL backup using the established deployment procedure.
2. Deploy schema before exposing new routes: `npx prisma migrate deploy`, then `npx prisma generate` in the approved release environment. Do not run `db push` against production.
3. Build and deploy using the existing HYMN release process. No paid provider or new infrastructure is required.
4. Verify the founder account ID, active ADMIN status and inclusion in `ADMIN_GOOGLE_EMAILS`. Then explicitly run `node --import tsx scripts/bootstrap-team-os.ts --owner-user-id <verified-id>` with approved production configuration. Bootstrap refuses existing workspaces and never grants access by matching a name.
5. Sign in as the founder, open Team Workspace from the avatar menu, and invite Tavish and Manha using their explicitly confirmed account emails. Select Growth Executive / Marketplace Executive respectively. Neither employee has been invited or granted access by this implementation.
6. Validate acceptance, role boundaries, task assignment, private chat and suspension before relying on Team OS operationally.

No new provider credentials are required for the implemented functionality. Existing DATABASE_URL and session secrets remain in the established environment. Discovery providers, email delivery and AI features require explicit integration/configuration before enabling; this release does not transmit confidential records to an AI provider.

Rollback: roll back application code first and retain team tables/data. Do not drop populated collaboration tables or delete work history. The additive schema can coexist with the previous application. Any eventual schema removal requires an explicit backup/export and approved data-retention decision; audit immutability intentionally prevents routine deletion.

## Verification commands

- `npm run test:team-os`: isolated PostgreSQL migration and persisted workflow/security tests. Only loopback port 55461 and database `team_fixture` are allowed. The fixture is retained in the OS temporary directory; production is never used.
- `npm run test:team-os:browser`: additionally boots an isolated Next dev server on 35461, creates signed fixture sessions and exercises desktop/mobile flows and normal-customer denial. Fixture account sessions are not real Google OAuth verification.
- Targeted ESLint: `npx eslint lib/team components/team app/team app/api/team scripts/*team-os*.ts`.
- Full TypeScript and production build are required before deployment. Use `NODE_OPTIONS=--max-old-space-size=4096` where needed so Next's TypeScript child process also receives the heap limit.

Regression checks should include existing Direnote contracts, payouts and studio service rules. These tests do not replace real Google OAuth/payment-provider end-to-end verification, full accessibility certification, penetration testing, backup restore testing or a production rollout rehearsal.

## Executed verification

- Prisma schema validation and client generation: passed (using an explicitly isolated loopback DATABASE_URL for validation).
- Full `tsc --noEmit`: passed again after the final policy/UI refinements and removal of test-generated configuration entries. Production build also passed its TypeScript stage.
- Targeted ESLint: passed after correcting the page error-boundary structure and invitation navigation.
- Whole-repository ESLint: 1 error and 198 warnings across 1,072 files. The error is the pre-existing `prefer-const` issue in `scripts/verify-spotify-artist-photos.ts:10`, which this task did not modify. New Team OS code passes targeted lint.
- Additive migration against an isolated copy of the application schema: passed, including database status constraints and immutable audit trigger.
- Persisted Team OS domain/security integration tests: passed across repeated fixtures, including stale concurrent edits, immutable audit protection, beat/WAV non-mutation and rejection of duplicate existing inbound enquiry contacts.
- Desktop/mobile Playwright flows and normal-customer page/API denial: passed. The initial browser test used an overly strict label locator; the corrected explicit status-selector test passed.
- Existing `verify-direnote-contract.ts`, `verify-payout-domain.ts`, and `verify-studio-services.ts`: passed.
- Initial production compilation passed, but Next's TypeScript worker exceeded its default 2GB heap. The second full production build with `NODE_OPTIONS=--max-old-space-size=4096` passed compilation, TypeScript, 285 static-page generation steps and build traces; `/team`, `/team/join` and `/api/team/[resource]` are in the resulting route manifest.

Production migration, founder bootstrap, staff invitations, emailing, Git push and deployment have **not** been performed. Existing unrelated worktree changes have been preserved.

## Changed-file map

- `app/team/{page,loading,error}.tsx`, `app/team/join/page.tsx`: protected pages, loading/error handling and invitation entry.
- `components/team/{workspace.tsx,workspace.module.css,join.tsx}`: responsive UI, forms, task views, conversations and invitation acceptance.
- `components/site-header.tsx`: additive membership-gated profile-menu entry; existing account controls remain.
- `lib/team/{access,policy,validation,service}.ts`: existing-session bridge, roles, input schemas, transaction/security policies and persisted workflows.
- `app/api/team/[resource]/route.ts`: independently authorised read/write handlers.
- `prisma/schema.prisma` and the Team OS migration: collaboration persistence only.
- `scripts/bootstrap-team-os.ts`, `scripts/verify-team-os*.ts` and `package.json`: explicit owner setup and isolated test commands.
- This document: architecture, scope, deployment, rollback and verification handoff.

Next.js test/build commands regenerated local `next-env.d.ts` and added test-output include paths. Team-specific generated include changes were removed after verification; the existing sidebar development output references were preserved. Generated test/build outputs and temporary databases are not part of the release.
