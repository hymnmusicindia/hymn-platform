# HYMN Team OS release

## Architecture and delivered workflows

Team OS reuses Next.js 16, React 19, PostgreSQL/Prisma, HYMN sessions, private storage, the existing SMTP client and branded email templates. `/team` is an internal workspace, not a replacement for the customer, producer or admin dashboards. Team roles cannot grant platform-admin, banking, payment, deployment or Direnote authority.

The release includes membership-gated profile navigation; two independently verified owner accounts; eight role templates and owner-managed custom permissions; expiring email invitations with authenticated acceptance; directory profiles, responsibilities, reporting managers and cycle prevention; suspension/revocation; personal work queues; task delegation, reassignment, review, reopening, dependencies, checklists, subtasks, collaborators, recurrence, bulk actions and recoverable archiving; projects, milestones, configurable statuses and chronological timelines; list, Kanban and agenda views; saved task filters; private attachments; comments and safe Markdown rendering.

Collaboration includes persisted private/public channels, threads, mentions, reactions, pinning, author editing/removal, read receipts, message-to-task creation, scoped search and in-app notifications. Authenticated five-second polling provides live refresh; this is not a WebSocket or push service. Retry keys prevent duplicate message creation after uncertain network responses.

Growth includes source-backed qualification/scoring, canonical GrowthLead links rather than independent customer copies, reviewed CSV import/export, duplicate detection, authorised inbound handover, recorded outreach, suppression, follow-ups and customer-account conversion. A draft is never counted as contact. Discovery defaults to honest public research links; optional MusicBrainz metadata requires explicit commercial-use approval (`TEAM_MUSICBRAINZ_COMMERCIAL_APPROVED=true`). Review [MusicBrainz API terms](https://musicbrainz.org/doc/MusicBrainz_API) before enabling it. No invented contact details or automated cold outreach.

Operations read actual beats, engineers, releases and studio orders. Non-owner release/studio access requires assigned coordination tasks. Engineer QA includes actual DAW metadata. Owner-configured event rules create idempotent review tasks; independent approval requests record decisions but never execute refunds, rights transfers, publication, payments or distribution. Existing WAV availability, licensing, payouts and release gates are unchanged.

Management includes workload/status counts, immutable weekly reports, operational analytics, recorded positive paid-customer counts, owner-only revenue by currency, INR acquisition costs and cost per paid customer. Financial metrics are gross recorded orders for explicitly linked CRM customers, not causal marketing attribution or profit. Beat/distribution reporting uses order creation date; studio reporting uses paidAt. Free credit orders are not paid conversions. Metrics explain these definitions in the interface.

## Security and persistence

Twenty-one Team models are added by `20261015190000_team_os` and `20261015220000_team_os_complete`. The latter adds collaboration controls and links to existing GrowthLead; it does not modify referral/payment defaults. No destructive business migration is included.

Every API checks the existing active account and active workspace membership. Writes lock the workspace and recheck live membership/permissions inside the transaction. Version checks reject stale task/project/document edits. Private conversations remain scoped even from unrelated owners. Sensitive attachments are owner-only and served only after exact asset/task/project checks. Body/upload/rate limits and same-public-origin checks apply. Audit logs are append-only by PostgreSQL trigger. CSV exports escape spreadsheet formulas; rich text never renders arbitrary HTML.

Owners share one protected role definition. Routine invitation/member endpoints cannot grant or revoke this role. Explicit operator provisioning does not change User.role. No accounts are created from names.

## Release and account activation

1. Review the additive migrations and ensure a normal PostgreSQL backup is available. Use the established owner-credential migration deployment script; never production `db push`.
2. Run `npm run build:release` in the configured release environment. Publish through the existing repository/deployment pipeline.
3. Explicit operator provisioning: `node --import tsx scripts/grant-team-owners.ts --emails hymnmusicindia@gmail.com,adityaujjain01@gmail.com` previews; adding `--apply` initialises the workspace if absent and grants both verified active accounts Owner access. More than one existing workspace is rejected as ambiguous.
4. Invite Tavish (`relhantavish22@gmail.com`, Growth Executive) and Manha (`manhadakora5@gmail.com`, Marketplace Executive) through the Directory, or run `node --conditions=react-server --import tsx scripts/invite-team-staff.ts --owner-email hymnmusicindia@gmail.com --apply` with approved SMTP configuration. Existing memberships/pending invitations are preserved. Email provider acceptance is not inbox delivery. Access activates only on same-account acceptance.
5. Sign in with an owner account, open avatar → Team Workspace, check Directory, create an assignment and verify staff acceptance. Direct URL is `/team`.

Existing `CRON_SECRET` enables the startup scheduler to run Team OS maintenance every fifteen minutes; `TEAM_AUTOMATION_ENABLED=false` disables it. The protected cron endpoint also supports an external scheduler. Without CRON_SECRET, owners can run workflow sync manually. Digests/reminders are in-app, not email. Invitation email uses existing EMAIL_ENABLED/SMTP configuration and keeps the standard HYMN WhatsApp footer. No new paid provider is required.

Rollback application code first; retain collaboration tables, attachments and audit history. Do not drop populated tables or reset migration history. Coexisting old code remains compatible with the additive schema.

## Verification

`npm run test:team-os:browser` starts isolated PostgreSQL on loopback 55461 and Next on 35461; it never uses production data. Core and advanced integration coverage includes delegation, scope denial, concurrent stale edits, review gates, dependencies, immutable audit, revoked access, invitation acceptance, private chat, retry deduplication, recurrence/archive, documents, independent approvals, reporting cycles, evidence import duplicates, paid-only revenue isolation and automation retries. Browser coverage exercises desktop task creation/completion, profile entry, native dialogs, mobile navigation/layout and ordinary-customer denial.

Targeted lint, full TypeScript, a clean production build, payout domain, studio services and Direnote contract checks are release gates. Test logs and the final handoff record actual outcomes; this document does not imply OAuth, SMTP inbox, payment-provider or production-browser verification was performed.

## Honest limitations

Release verification on 16 October 2026: isolated co-owner bootstrap, core/advanced database integration and expanded desktop/mobile browser suites passed; targeted Team OS lint passed without warnings; the final clean production build passed compilation, full TypeScript, all 288 static-generation steps and traces. Existing payout, studio-services, private-storage validation and Direnote-contract regressions passed. Both migrations are applied in production; both Owner memberships were verified using the runtime database connection. Real Google OAuth, SMTP inbox delivery and hosted release availability are separate checks, not implied by these automated results.

Public source discovery still requires human research and permission to contact prospects. No paid discovery connector, AI processing, automatic cold emailing, external push notifications, WebSocket service, causal revenue attribution or full accessibility/security certification is claimed. The UI follows the existing dark theme. Timeline/agenda are functional chronological views rather than a third-party drag-resize Gantt. Rich descriptions use a safe Markdown editor/rendering model. Business execution remains in existing authorised HYMN/admin workflows; Team OS records and coordinates the work without bypassing them.
