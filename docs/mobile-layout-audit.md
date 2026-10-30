# Mobile layout audit — 30 October 2026

The QC report could size itself from long evidence text inside the flex workspace, while the surrounding canvas clipped it. The report now has an explicit container width, shrinkable flex children, wrapping identifiers/URLs, bounded native audio and compact two-column header actions. Expanded correction requests preserve line breaks. Phone cards use smaller padding and headings; controls retain 44px touch targets. Download and correction destinations are unchanged.

The shared mobile workspace now constrains direct tool-page roots to the available content width. Shared record browsers wrap long values, keep pagination inside the screen, use touch-sized controls and 16px phone/tablet input text. These fixes cover the components used across customer, team and administration views.

Validation:

- `node scripts/verify-mobile-layout.cjs`: actual QC report, public workspace shell and record browser with the complete global/Tailwind/module cascade. Both themes at 1440, 768, 390 and 320px; expanded correction/match evidence, deliberately long URLs and rights-holder identifiers, audio controls, touch targets, contrast and unchanged correction/download links. Screenshots: `.cache/mobile-layout`.
- `node scripts/audit-responsive-pages.cjs`: read-only local-server sweep of Home, Beatstore, Distribution, Studio, services, FAQ, contact and login at 320/390/768px in both themes (48 combinations). Checks page overflow and visible content bounds while allowing intentional carousels, scroll regions and closed navigation drawers. Report/screenshots: `.cache/responsive-pages`.
- Existing browser suites cover library, beat purchase details and pending delivery, marketplace/Studio operations, distribution operations, customer/producer Studio, team call sheets and leadership updates at desktop/mobile widths. The purchase navigation fixture was updated to expect the existing merged library route.
- TypeScript and the shared theme contract.

The local server uses public fallback content where database configuration is unavailable; data-heavy and protected views use real components with fixture records. No production record was changed. This covers the tested routes, shared layouts and states; it does not claim every possible customer record or third-party widget was exercised. The QC/record-browser regression runs in the existing Studio CI job.
