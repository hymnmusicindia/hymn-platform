# HYMN Frontend Redesign Checklist

This checklist tracks the ordered frontend mandate. It deliberately excludes backend, database, payment, royalty, subscription, authentication, and DireNote business-logic changes.

## 1. Current inventory

Status: completed on 2026-07-28.

### Public and authentication

- Marketing: `/`, `/about`, `/mission`, `/services`, `/faq`, `/contact`, legal pages.
- Authentication: `/login`, `/auth`, `/customer-login`, `/producer-login`.
- Storefront: `/beat-store`, `/beat-store/beats/[slug]`, `/beat-store/producers/[slug]`, legacy `/beatstore`.

### Artist workspace

- Shell/dashboard: `/dashboard`, `/dashboard/customer`, `components/workspace-shells.tsx`.
- Catalogue and release detail: `/dashboard/releases`, `/dashboard/releases/[id]`, `components/release-portal.tsx`.
- Submission: `/distribution`, `/distribution/start`, `components/release-form.tsx` and support components.
- Analytics: `/analytics`, `components/analytics-overview.tsx`.
- Money and collaboration: `/royalty-payouts`, `/payout`, splits module in the dashboard.
- Services: `/managed-services`, `components/managed-service-portal.tsx`.

### Producer workspace

- Canonical candidate: `/producer/dashboard`.
- Legacy aliases requiring equivalence proof: `/producer-dashboard`, `/dashboard/admin`, `/dashboard/customer` variants.
- Main implementation: producer branch in `components/workspace-shells.tsx`.

### Admin workspace

- Main operations/QC: `/admin`, `components/admin-control-center.tsx`.
- Dedicated queues: audit logs, managed services, payout profiles, release change requests, royalties reconciliation, wallet adjustments, webhook events.

### Existing shared frontend

- Global header/navigation: `components/site-header.tsx`.
- Large workspace shells: `components/workspace-shells.tsx`.
- Existing inputs/buttons/cards/status classes: `app/globals.css`.
- Existing feature primitives: audio waveform, upload dropzone, artist cards/selectors, release summary, checkout, Beat Store audio player/cards.
- Existing route-level states: root loading/error/not-found and release-specific loading/error pages.

### Verified-data boundaries

- Analytics state is sourced through `lib/analytics.ts`; empty data remains empty and no fallback metric should be introduced.
- Financial, release, service and queue counts must remain database/API-derived.
- Managed services and payouts must continue to say they are manually processed.

### Duplicate-route candidates (do not remove yet)

- `/beat-store` and `/beatstore`.
- `/producer-dashboard` and `/producer/dashboard`.
- `/payout`, `/royalty-payouts`, and dashboard money modules.
- `/login`, `/auth`, `/customer-login`, `/producer-login`.
- `/dashboard`, role-specific dashboard routes and compatibility entry points.

## Ordered implementation

- [x] 1. Inventory routes/components, data-truth boundaries and duplicate candidates.
- [x] 2. Consolidate semantic design tokens.
- [x] 3. Re-audit and remove fabricated analytics/fallbacks.
- [x] 4. Consolidate loading, empty, error, alert and status primitives.
- [x] 5. Refine shell, header, sidebars and mobile navigation.
- [x] 6. Redesign artist dashboard hierarchy.
- [x] 7. Improve catalogue and release detail.
- [x] 8. Improve release-submission workflow.
- [x] 9. Build structured correction UX.
- [x] 10. Build store-delivery matrix.
- [x] 11. Improve update/takedown requests.
- [x] 12. Improve royalties, wallet, KYC and payouts.
- [x] 13. Redesign admin operations and QC.
- [x] 14. Refine managed Artist Services.
- [x] 15. Polish Beat Store.
- [ ] 16. Perform rendered mobile/accessibility verification.
- [x] 17. Redirect/remove only proven-obsolete duplicate frontend routes/code.

## Verification log

- 2026-07-28, phases 11-15 and 17: clarified update/takedown actions, manual review and payout/KYC states; reorganized permission-aware admin operations; refined managed-services requests and evidence; removed fabricated Beat Store activity, reviews and fallback media; added a mobile purchase action; permanently redirected the proven legacy Beat Store and producer-dashboard routes while retaining compatibility, canonicalized producer notification links, and removed three unreferenced duplicate components. Regenerated the local Prisma client without touching the database. `npx tsc --noEmit --incremental false`, focused ESLint (zero errors), `npm run test:payout`, `npm run test:managed-services`, `npm run test:analytics`, and `git diff --check` passed. Phase 16 remains open because it requires rendered authenticated viewport and assistive-technology checks, not source-only verification.

- 2026-07-28, phases 8-10: converted submission to eight guided stages with desktop left navigation, central form, sticky live summary, compact mobile progress/summary, visible autosave state, first-invalid-field focus, final review/payment, searchable selectors, compact track completion/audio state and reorder controls; upgraded saved artist identity records; added structured correction navigation, required/recommendation counts, resolved state and guarded resubmission; added separate overall/store delivery status with desktop matrix and mobile cards. Removed fabricated queue counts and turnaround fallback. Existing upload, plan, payment, draft, release payload and API contracts were preserved. `npx tsc --noEmit --incremental false`, focused ESLint (zero errors), and scoped `git diff --check` passed. Rendered visual verification remains pending Phase 16.
- 2026-07-28, phases 5-7: regrouped artist, producer and admin navigation around canonical operational routes; removed fabricated sidebar progress and vanity dashboard metrics; added the artist action centre, real release pipeline, verified money summary and real recent releases; upgraded the catalogue with search, status/artist/type/date filters, workflow/date/title sorting, pagination, desktop table and mobile cards; clarified release-detail delivery, royalty, correction, split, promotion and history navigation. `npx tsc --noEmit --incremental false` passed. Focused ESLint passed with zero errors (pre-existing image/performance and hook warnings remain). Rendered viewport checks remain explicitly pending Phase 16.

Record TypeScript, touched-file lint, API-contract review, rendered viewport checks and final repository commands here after each phase. A page is not visually verified merely because it builds.

- 2026-07-28, phases 1–4: added the route/component/truth-boundary inventory; semantic background/text/border/status/focus/disabled/overlay tokens; shared page, section, status, source, empty, error, loading, alert, money and filter primitives. Analytics now uses the exact honest empty state, source/period evidence and a retryable error state. `npx tsc --noEmit --incremental false`, focused ESLint, `npm run test:analytics`, and `git diff --check` passed. Rendered visual verification remains pending Phase 16.
