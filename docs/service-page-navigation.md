# Service page navigation

`PortalLayout` uses the same `LandingWorkspace` as the homepage for public and authenticated service pages. Customer, producer and admin dashboard routes retain their own frames; Team OS retains its separate layout. Service links remain available in the expandable homepage sidebar.

On desktop, the homepage/service rail is fixed below the 58px site header. Its grid column remains reserved for the right-hand canvas. Only the service links scroll when they exceed the available height, with scroll chaining contained; the shortcuts and footer stay anchored. Mobile retains the fixed navigation drawer.

On `/distribution/start`, the shell provides a `ReleaseNavigationTarget` above the page content. `ReleaseNavigationSlot` portals the form's live section controls into this header, keeping the existing validation and stage state in `ReleaseForm`. Standalone forms use an inline fallback. The header stays in document flow, outside the metadata fields, and replaces the former distribution module tabs.

The release section carousel keeps the active section centered and sharp, with adjacent sections softened and faded. Clicking a neighboring section, swiping, or using Arrow keys, Home and End selects sections. The header has no surrounding box or selected-button pill.

Quit sits to the left of the carousel, with the live save status and Review to the right. On narrow screens these controls sit above the full-width carousel. The old logo/action bar is removed. Wizard action buttons are borderless off-white text, becoming white on hover or keyboard focus; switches and selection controls retain their state styling.

Footer actions stay side by side at every viewport width. Draft uses muted yellow normally and bright yellow on hover or keyboard focus; longer action labels wrap inside their button instead of stacking the buttons.

Verification: `node scripts/verify-release-navigation-browser.cjs` exercises the actual portal, sidebar and release form at 1440px, 390px and 320px. It checks a single header navigation, field clearance, no page overflow, section selection, keyboard navigation and mobile sidebar links. `npm run test:submission-feedback` checks submission behavior separately.
