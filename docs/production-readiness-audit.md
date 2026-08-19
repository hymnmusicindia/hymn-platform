# HYMN production-readiness audit

Audit date: 2026-07-24

Scope: static review of the Next.js application, 116 API routes, shared libraries, Prisma schema/migrations, authentication boundary, payments, DireNote, distribution, beat licensing, notifications, splits/payouts, reporting, configuration, and representative UI surfaces. Build/type/runtime checks are recorded separately after remediation. Real Google, Razorpay, DireNote, storage, cron, email, and production-database flows require staging credentials and cannot be truthfully certified by static review alone.

## Executive decision

The repository is **not production-deployable before the P0 items below are remediated and verified**. Several important controls already exist (server-side payment signature verification, release/order ownership checks in reviewed routes, admin guards, DireNote readiness validation, payout audit models, private report downloads, and file-size/extension limits), but two P0 defects can compromise authentication or financial data integrity.

## Prioritized findings

### P0 — release blockers

1. **Auth/session signing falls back to a public value.** `lib/session.ts` and `middleware.ts` use `JWT_SECRET || "change-me"`; the admin key is derived from it when absent. A production instance with incomplete environment configuration therefore accepts tokens signed with a known key. Production must fail closed and require independent, high-entropy user/admin secrets.
2. **Royalty import preview performs writes.** `app/api/admin/royalties/import/route.ts` creates `UnmatchedRoyaltyRow` records before checking `confirm`. Repeated previews create financial-operation residue and make reconciliation/quarter closing unreliable. Preview must be read-only; confirmed imports need deterministic deduplication.

### P1 — high risk

3. **Environment readiness is documented but not enforced.** `.env.example` lists core variables, but there is no centralized production validation for database, auth, Google, Razorpay, DireNote, storage, cron, payout encryption, and public URL configuration. Optional integrations need explicit feature-state handling; critical services must fail with actionable errors.
4. **Payment creation has a development fallback.** Checkout can manufacture `dev_checkout_order_*` and expose a `dev_razorpay_key` when Razorpay is absent. This is useful locally but must be impossible in production. Distribution/subscription/beat payment routes need the same fail-closed rule.
5. **Quarter-close recovery is incomplete.** Report-generation failure reopens a claimed period, but a failure during the subsequent database transaction can leave it stuck in `closing`, with an orphan report. The close operation needs a recovery path and audit evidence.
6. **Next.js request boundary is deprecated.** The project uses `middleware.ts`; Next 16 expects `proxy.ts`. Current builds warn and a future upgrade may break route protection.
7. **Debug/test surface and residue remain.** `/api/test-validation` is production-disabled and admin-protected, and mock login is disabled by default in production—good controls—but public client configuration can still opt mock login in. Dozens of `vercel trigger` comments and a mock-login component remain, lowering review quality and increasing accidental exposure risk.
8. **Lint gate is broken.** `npm run lint` invokes removed `next lint` under Next 16. CI currently has no functioning lint command.

### P2 — consistency and operability

9. **API envelopes are inconsistent.** Reviewed routes mix `{ error }`, `{ success, ... }`, raw entities, and route-specific structures. Wholesale replacement would break clients; introduce a shared response/error utility for new and touched routes, then migrate by feature with contract tests.
10. **Status vocabulary remains distributed.** A release status engine exists, but status literals and presentation copy still appear in multiple UI/API files. Continue migration to the canonical status configuration rather than changing persisted values in one large unsafe rewrite.
11. **Loading/error/empty coverage is uneven.** Feature components often implement local states, but the app lacks consistent route-level loading/error/not-found fallbacks and shared accessible state primitives.
12. **UI primitives are duplicated.** Buttons, cards, status pills, page headers, tables, and modal patterns are implemented locally across large components. Consolidate incrementally to avoid visual regressions; prioritize admin, distribution, release management, payouts, and beat checkout.
13. **Accessibility requires browser validation.** Static code shows modal and icon-button patterns that need consistent dialog semantics, focus restoration, keyboard handling, accessible names, contrast checks, and 44px mobile hit targets.
14. **Mobile/table behavior requires viewport testing.** Responsive CSS exists, but 360/390/430px behavior cannot be certified without rendering. Admin tables, distribution forms, audio controls, payout reports, and dashboard navigation are the highest-risk surfaces.
15. **Performance risks remain.** Some report/admin queries intentionally load broad datasets and should be bounded or queued as volume grows. Numerous raw image usages and large client components should be migrated selectively to optimized server/image boundaries.
16. **Repository hygiene is inconsistent.** Duplicate `client-updates` source copies contain stale auth fallbacks and can mislead maintenance/security scanning. Generated/deployment trigger comments should be removed.

## Area-by-area audit notes

- **Homepage/auth/dashboard:** protected route boundary exists; secret fallback is critical. Dashboard features and recommendations are present but visual/browser checks remain.
- **Admin:** `requireAdmin` is widely used and proxy protection covers `/api/admin`; individual route guards remain defense-in-depth. Admin login and integration callbacks require staging tests.
- **Distribution/releases:** draft, payment, review, manage, status automation, and DireNote modules exist. Reviewed payment submission derives ownership from the session. Full draft-ID/routing regression needs an authenticated database fixture.
- **DireNote:** payload/readiness logic includes mood handling and blocks missing mood. Live contract, accepted taxonomies, UPC/ISRC response persistence, retries, and raw-response retention require sandbox verification.
- **Beat store:** server-side quote construction and Razorpay verification exist; purchase/license creation is designed idempotently. Exclusive-lock concurrency and PDF regeneration need integration tests.
- **Payouts/splits/reports:** database is the source of truth and XLSX is an output; admin/user report authorization and audit concepts exist. Preview mutation and close recovery are the urgent defects.
- **Notifications:** event keys and `createNotificationOnce` exist in newer flows. Older calls without event keys should be migrated with stable identifiers and CTA contract tests.
- **Uploads:** reviewed royalty import enforces size and extension. All artwork/audio/proof upload entry points still need MIME/magic-byte, object ownership, quota, malware, and signed-URL expiry verification.
- **Payments:** signature verification and session ownership are present in reviewed checkout flow. Webhook idempotency, reconciliation, missing-provider behavior, and subscription/distribution variants need staging tests.
- **Deployment:** migrations and build scripts exist. Production needs migration execution before app rollout, real secrets, private durable storage, cron authentication, monitoring/alerts, backups, and rollback rehearsal.

## Remediation order

1. Fail-closed secrets/provider configuration and migrate middleware to proxy.
2. Make financial previews read-only/idempotent and make quarter closing recoverable.
3. Restore lint/type/build gates and add centralized production readiness checks.
4. Remove debug residue and prevent production mock/test enablement.
5. Add consistent route-level error/loading/not-found UI and improve touched APIs/UI accessibility.
6. Run build, typecheck, payout verification, Prisma validation, dependency audit, and document remaining staging/manual tests.

## Definition of “verified” for this pass

Passing local build/type/domain checks proves compilation and selected pure/domain behavior only. Production readiness additionally requires a staging deployment using production-equivalent PostgreSQL, private object storage, HTTPS origins, real provider sandbox credentials, migrations, cron execution, webhook replay tests, responsive browser checks, accessibility scanning, and failure/reconciliation drills.

## Remediation completed in this pass

- Removed known production JWT fallbacks and required independent user/admin signing secrets.
- Migrated the Next.js request boundary from deprecated `middleware.ts` to `proxy.ts`.
- Prevented production mock login, development Razorpay signatures/orders, and distribution payment bypass.
- Added centralized production configuration diagnostics and an admin-only readiness endpoint.
- Made royalty statement previews read-only and confirmed unmatched rows idempotent through `source_key` plus a migration.
- Added transaction-failure recovery, orphan-report marking, and audit evidence to quarterly closing.
- Added route-level loading, error, retry, and not-found experiences.
- Restored the Next 16 ESLint command and matching configuration/dependencies.

## Verification results

- `npm run build`: passed (118 routes). The build-only database URL had no running server, so public beat/producer prerendering logged its existing in-memory fallback behavior.
- `npx tsc --noEmit`: passed.
- `npx prisma validate`: passed with a build-only PostgreSQL URL.
- `npm run test:payout`: passed.
- `npm run lint`: passed with 0 errors and 70 baseline warnings. Warnings are primarily raw `<img>` optimization, unused symbols, and one hook dependency; they remain cleanup work.
- Dependency install audit: 0 known vulnerabilities. A later standalone audit request was unavailable in the restricted runner; the successful install audit is the recorded result.
- `git diff --check`: passed (line-ending notices only).

## Remaining deployment gates

1. Apply `20260724_unmatched_royalty_idempotency` with `npm run db:migrate:deploy` against staging before deploying application code.
2. Use Node 20.19+ or 22.13+ in CI/runtime; Node 20.17 triggered a transitive engine warning.
3. Configure every item reported by `/api/admin/system-readiness`; rotate any secret ever committed or shared outside the secret manager.
4. Run payment/webhook reconciliation, DireNote sandbox submission, Google auth/origin, private storage, cron replay, email/notification CTA, beat exclusive-lock, license regeneration, and payout close/retry tests against staging services.
5. Run authenticated browser regression at 360/390/430px, tablet, laptop, and desktop, plus keyboard/screen-reader and automated accessibility checks.
6. Resolve the 70 lint warnings incrementally, migrate high-impact images to `next/image`, bound high-volume admin/report queries, and remove deployment-trigger comment residue.
7. Investigate the Turbopack file-tracing warning from dynamic local storage paths; production must use durable object storage rather than local filesystem uploads.
