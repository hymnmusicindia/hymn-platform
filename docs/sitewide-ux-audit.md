# Site-wide UI/UX audit - 26 October 2026

## Employee referral links

Active non-owner employees can use **Team OS -> My referral link -> Get my referral link**. The generator is also visible above Contacts & Calls, outside the collapsed rewards panel. Employees can copy the resulting link or share through WhatsApp. The standalone referral module does not require CRM permission and avoids loading unrelated work records. Customers still explicitly approve a connection before eligible commission can accrue.

## What was inspected

The source inventory contains **99 page-route patterns**. Every pattern has at least one valid browser example in this audit, including dynamic release, licence, studio project, blog/category, policy, referral and saved performance-report pages.

The browser matrix covered **202 public/customer/admin/producer/staff route and module views at 1440, 390 and 320 pixels**, plus a separate **52-page customer pass at desktop and mobile widths**. These are 254 route/role checks and 710 viewport inspections, with some intentional overlap between roles and aliases. Checks include rendering, horizontal viewport overflow, accessible button names and broken images; screenshots were saved for visual review. Findings were repaired and their affected views rechecked.

These checks use isolated PostgreSQL records, signed local fixture sessions, disabled email delivery and disabled payment/distribution credentials. They do not use production accounts, send mail or charge money. Route coverage does not mean every possible record state, dropdown, error branch or financial transaction was exercised. Screenshot review focused on representative screens and flagged layouts, rather than claiming a manual pixel-by-pixel review of every state.

## Changes from the findings

- Added a dedicated employee referral navigation item and moved the generator out of a collapsed panel. Commission details stay collapsible to limit vertical space.
- Long catalogue titles now wrap across two lines, with release metadata separated from the artist line.
- Beat finder fits short viewports and scrolls internally; its close control has an accessible name.
- Support loading no longer implies zero requests, and callback/new-request actions have consistent target heights. Primary workspace actions have a 44-pixel minimum height on phones and touch screens.
- Welcome-screen typing text hydrates consistently when reduced motion is enabled.
- A shared timestamp formatter removes server/browser locale-default discrepancies in affected admin, release history, reconciliation and royalty-split views. Times show an explicit India time zone.
- Studio administration is labelled Studio operations, and breadcrumbs describe projects, referrals, licences, quality reviews and saved reports instead of exposing raw record IDs.
- Admin hero-image preview uses a bundled default, handles unavailable custom images, and labels upload fields. The image-upload form retains its form reference safely across the async save.
- Next.js smooth-scroll navigation is explicitly configured; reduced-motion users get instant scrolling.

The earlier compact contact previews, padded stage guide, shared disclosures and checkbox fixes are documented in [Contact previews and disclosure polish](ui-disclosure-and-contact-polish.md).

## Reproduce

Run `node --import tsx scripts/verify-customer-experience-isolated.ts --sitewide --turbo` for the isolated fixture and browser matrices. `--serve` keeps the fixture server available for inspection; `--reuse=PATH` resumes a retained fixture under `.cache/customer-experience/fixture-*`. Use `CUSTOMER_AUDIT_HEAP_MB` to bound local development memory.

On the running fixture, `node --import tsx scripts/verify-sitewide-ux-interactions.ts` checks the short-screen beat finder, close/focus behaviour, catalogue titles, loaded support requests, callback target height, sidebar referral generation and sharing, readable admin breadcrumbs, notification timestamps and reduced-motion hydration. `SITEWIDE_AUDIT_RESUME=true` resumes the matrix and rechecks failed or flagged views.

Detailed machine reports and screenshots are in ignored `.cache/sitewide-ux` and `.cache/customer-experience`. These are fixture evidence, not production data. TypeScript and targeted ESLint are separate final checks.

## References

[W3C reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) informed narrow-screen text wrapping and contained scrolling. [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) informed control spacing. These references do not constitute a full WCAG conformance certification. Next.js scroll behaviour follows the installed guide at `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`.

## Route-pattern coverage

All rows below have a checked browser example. Dynamic patterns use fixture records; aliases are checked through their destination.

| Source route | Covered |
| --- | --- |
| `/admin/audit-logs` | Yes |
| `/admin/campaigns` | Yes |
| `/admin/client-cards` | Yes |
| `/admin/contributors` | Yes |
| `/admin/email-logs` | Yes |
| `/admin/fraud` | Yes |
| `/admin/growth` | Yes |
| `/admin/growth/reward-policy` | Yes |
| `/admin/integrations/direnote` | Yes |
| `/admin/leads` | Yes |
| `/admin/login` | Yes |
| `/admin/managed-services` | Yes |
| `/admin/newsletter` | Yes |
| `/admin` | Yes |
| `/admin/partners` | Yes |
| `/admin/payout-profiles` | Yes |
| `/admin/playlist-reviews` | Yes |
| `/admin/promotions` | Yes |
| `/admin/referrals` | Yes |
| `/admin/referrals/payouts` | Yes |
| `/admin/referrals/[id]` | Yes |
| `/admin/release-change-requests` | Yes |
| `/admin/releases/manual` | Yes |
| `/admin/royalties` | Yes |
| `/admin/royalties/reconciliation` | Yes |
| `/admin/studio/orders/[id]` | Yes |
| `/admin/studio` | Yes |
| `/admin/wallet-adjustments` | Yes |
| `/admin/webhook-events` | Yes |
| `/analytics` | Yes |
| `/audio-library` | Yes |
| `/checkout` | Yes |
| `/contributors/claim` | Yes |
| `/dashboard/admin` | Yes |
| `/dashboard/customer` | Yes |
| `/dashboard` | Yes |
| `/dashboard/playlists` | Yes |
| `/dashboard/releases` | Yes |
| `/dashboard/releases/[id]` | Yes |
| `/dashboard/releases/[id]/qc-report` | Yes |
| `/dashboard/studio` | Yes |
| `/distribution/start` | Yes |
| `/first-release` | Yes |
| `/licenses/[id]` | Yes |
| `/managed-services` | Yes |
| `/payout` | Yes |
| `/producer/dashboard` | Yes |
| `/producer-dashboard` | Yes |
| `/release-submitted-preview` | Yes |
| `/royalty-payouts` | Yes |
| `/studio/apply` | Yes |
| `/studio/engineer` | Yes |
| `/studio/engineer/profile` | Yes |
| `/studio/engineer/proof` | Yes |
| `/studio/orders/[id]` | Yes |
| `/studio/start` | Yes |
| `/p/[slug]` | Yes |
| `/producer-onboarding` | Yes |
| `/about` | Yes |
| `/access-denied` | Yes |
| `/auth` | Yes |
| `/beat-store` | Yes |
| `/beat-store/producers/[slug]` | Yes |
| `/beatstore` | Yes |
| `/blog/category/[category]` | Yes |
| `/blog` | Yes |
| `/blog/[slug]` | Yes |
| `/contact` | Yes |
| `/customer-login` | Yes |
| `/distribution` | Yes |
| `/faq` | Yes |
| `/first-release-free` | Yes |
| `/home` | Yes |
| `/login` | Yes |
| `/mission` | Yes |
| `/music-distribution` | Yes |
| `/newsletter/unsubscribe` | Yes |
| `/` | Yes |
| `/partnership-program` | Yes |
| `/playlist-review-terms` | Yes |
| `/policies` | Yes |
| `/policies/[slug]` | Yes |
| `/privacy-policy` | Yes |
| `/producer-login` | Yes |
| `/ref/[code]` | Yes |
| `/services` | Yes |
| `/studio/email-preferences` | Yes |
| `/studio/engineers/[slug]` | Yes |
| `/studio/genres/[genre]` | Yes |
| `/studio` | Yes |
| `/studio/readiness` | Yes |
| `/studio/share/[type]/[id]` | Yes |
| `/studio/test` | Yes |
| `/terms-of-service` | Yes |
| `/welcome` | Yes |
| `/team/join` | Yes |
| `/team` | Yes |
| `/team/performance` | Yes |
| `/team/performance/[id]` | Yes |
