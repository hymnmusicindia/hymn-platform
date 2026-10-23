# Customer experience audit — 24 October 2026

The audit uses the running application and an isolated PostgreSQL customer
account, with draft/live/correction releases, a subscription, purchased beat and
licence, support ticket, producer storefront, engineer and Studio project.
Customer records, charges, emails and distribution submissions in production are
not exercised by the fixture.

## Changes

- Removed blanket CSS resets that flattened every control with a rounded class,
  removed borders and obscured selected states. Component controls retain their
  own design; shared actions have softer corners and a 44px minimum height.
  Text section navigation remains unboxed.
- Rounded form fields, release timing choices and subscription offer actions;
  strengthened keyboard focus feedback without changing disabled states.
- Anchored the screen-reader-only account summary so it cannot widen the desktop
  document. Fixed the artwork image's immediate positioning container.
- Initialise dashboard sections from their URL so support, promotion, splits,
  settings and other deep links do not first render the overview.
- Corrected draft links from licence agreements, next actions and onboarding.
  Existing `?draft=` links remain supported through the same owner-scoped lookup
  as `?edit=`. Missing or inaccessible releases still fail the existing gate.
- Missing referral reward configuration hides the optional onboarding offer
  instead of returning a server error. No reward configuration is created and no
  unconfigured reward is advertised.
- Replaced implementation terminology in checkout with a clear payment summary.
- Corrected purchase-feedback deferral so closed, hidden cart drawers do not
  suppress feedback indefinitely. Feedback remains deferred during checkout,
  support, release editing and other sensitive workflows.

## Coverage

| Area | Customer views and interactions |
| --- | --- |
| Home and account | Home, dashboard, messages, settings, subscription, referral, account |
| Distribution | Catalogue, draft and live details, section navigation, QC report, wizard, saved draft links |
| Royalties | Analytics, earnings and payouts, royalty payout redirect, splits |
| Beatstore | Catalogue, producer storefront and profile, search/reset, genre selection, cart, playback, licence and checkout |
| Studio | Directory, genre page, engineer profile, readiness, booking form, projects, project workspace and application |
| Promotion and support | Promotion segments, Community Plans, artist services, contact, support request, callback and private screenshot |
| Information | Services, distribution entry, first release, producer onboarding, FAQ, about, mission, partnerships and policies |

The browser audit records page errors, API errors, broken images, unnamed buttons,
document overflow and rectangular filled controls at desktop and mobile sizes.
Feature checks cover submission receipts, required/optional fields, keyboard
navigation, selected states, modal dismissal and the existing access boundaries.

The final scan covered 52 customer routes at 1440px and 390px (104 views), with
no page/API errors, document overflow, broken images or unnamed visible buttons.
Eleven workflow checks passed, including 320px modal checks, authenticated and
anonymous screenshot downloads, callback receipts, spinning CD playback,
cart-to-checkout quotes and rejection of staff access, other customers' release
records and forged payments. Legacy distribution and first-release redirects
were verified at their final destination. Cold development-server restarts were
retried only for read-only page navigation.

The purchase-feedback regression passed at desktop and mobile sizes, including
hidden cart drawers, deferral during support and open modals, explicit rating
submission and the same optional comment step for negative ratings. TypeScript,
targeted ESLint, payment enforcement, checkout boundaries, release transitions
and generated release input rules also passed. Existing dashboard lint warnings
remain unrelated to these changes.

Run `npm run test:customer-experience` for the disposable database and browser
checks. Evidence is written under `.cache/customer-experience/` and is not shipped.
The payment enforcement, checkout boundary, release transition and input-rule
checks remain separate from presentation tests.
