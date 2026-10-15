# HYMN Admin OS

## Workspace boundary

HYMN Admin OS is a separate **system workspace** in the internal workspace switcher. Its persisted authority is the existing AdminMembership/AdminRole/AdminPermission graph, not a duplicated TeamWorkspace grant. Team OS Owner, Growth Executive or Marketplace Executive membership never implies platform-admin rights. Only active accounts with effective admin permissions receive the Admin OS switcher entry.

All existing `/admin` pages now live inside one Team OS-style shell. Canonical URLs and API endpoints remain unchanged to preserve bookmarks, provider callbacks and business workflows. There is no second, standalone dashboard frame inside the main portal or nested finance/operations pages. Login remains outside the workspace shell.

`GET /api/workspaces` returns only the signed-in user's active team memberships plus the Admin OS destination when authorised. It uses private/no-store responses; workspace selection is navigation, not an authorisation token.

## Interface and data

The new shell reuses Team OS layout foundations: charcoal surfaces, high-contrast neutral text, compact typography, collapsible sidebar, grouped searchable modules, keyboard module finder, mobile navigation, visible role/permission context and an internal workspace switcher. Shared admin card, table, field, button and status styles apply across existing specialist pages. Existing business forms and actions are retained, rather than rewritten with different payment or delivery semantics.

The command centre is redesigned around real authorised records: actionable counts, queue workload bars and age indicators, a mutually exclusive release-stage donut with accessible numerical legend, and direct handoffs to engineer/studio operations, enquiries, royalty matching and audit evidence. Receipts are labelled as recorded receipts, not profit. The module search remains separate from the module-record search; neither is advertised as an unrestricted cross-database search. Empty or restricted areas never receive fabricated values.

The access map displays actual configured capabilities across catalogue, QC, delivery, royalties, payout approval, paid confirmation, account management and system control. Typical role purposes are explanatory guidance; exact permission data remains authoritative.

## Power review and safeguards

- Unknown navigation modules now fail closed. Empty/unassigned/revoked roles receive no admin workspace entry.
- Administrator identities are checked against ACTIVE accounts, not just a signed role cookie.
- Role grants, revocations and demotions require recent sign-in plus active founder/super-admin authority. `system.manage` alone is insufficient.
- Administrator role changes recheck live authority under a database advisory transaction lock; account-role changes and their audit record commit atomically.
- Self-role changes remain prohibited. Team OS role management remains separate.
- Ordinary account management cannot demote an administrator or restrict another administrator without protected authority. Membership controls are the explicit path for admin role changes.
- Existing payout/KYC, financial adjustment, release QC, rights, licensing, WAV and Direnote gates are preserved. This release does not edit existing staff grants or promote Tavish/Manha to platform administrators.

No schema migration or new external provider is required. No production user roles, permissions or money records are changed by the release operation itself.

## Verification and rollout

`npm run test:admin-os` creates an isolated PostgreSQL fixture, runs the existing Team OS core/advanced suites, tests administrator anti-escalation and audited assignment/revocation, then exercises the admin browser flows. Add `--browser` to the underlying runner to include the Team OS browser suite as well: `node --import tsx scripts/verify-team-os-isolated.ts --admin --browser`.

Browser checks cover one shell, the visual command centre, module search, capability matrix, nested finance route, desktop/mobile navigation, horizontal overflow, permission-aware workspace options, Team-owner denial and live admin revocation. The tests use fixture JWTs, not real Google OAuth. Screenshots are generated under the isolated worktree's `.cache` directory and are not release assets.

Run targeted lint, full TypeScript/production build and payout/studio/Direnote regression checks before pushing. The final handoff records executed results; the existence of this document does not assert a hosted deployment is already live.

Keep production builds separate from running Next dev/browser fixtures. Next regenerates tsconfig includes and next-env declarations for each output directory; a browser server stopped while generating types can leave incomplete development declarations. Use a clean release worktree for production verification and do not commit test-output includes or generated declarations.

Roll out through the existing main-branch deployment process. Roll back the application commit if needed; no database rollback is necessary. Existing specialist workflows and their canonical routes remain available under the previous release.

Limitations: no automatic role re-granting, full accessibility certification, provider OAuth rehearsal or bank-transfer testing is claimed. Specialist business forms are integrated and restyled, not replaced by a new execution engine.

## Executed release checks — 16 October 2026

The isolated Team OS core/advanced suites, admin policy integration and combined Team/Admin desktop/mobile browser suites passed. The final admin browser run also checked the global navigation toggle and Ctrl+K expansion/focus from a collapsed sidebar; screenshots were inspected at desktop and 390px phone widths. Revoking suspended staff membership is covered by the policy tests. Targeted lint reported zero errors (12 existing image/useMemo warnings in retained admin components). Payout, studio-service and Direnote-contract regressions passed. The isolated production build passed compilation, full TypeScript, 288 static-generation steps and build traces after test-generated declarations were separated from the production build. Hosted deployment is a separate verification step.
