# Service page navigation

`PortalLayout` uses the same `LandingWorkspace` as the homepage for public and authenticated service pages. Customer, producer and admin dashboard routes retain their own frames; Team OS retains its separate layout. Service links remain available in the expandable homepage sidebar.

On `/distribution/start`, the shell provides a `ReleaseNavigationTarget` above the page content. `ReleaseNavigationSlot` portals the form's live section controls into this header, keeping the existing validation and stage state in `ReleaseForm`. Standalone forms use an inline fallback. The header stays in document flow, outside the metadata fields, and replaces the former distribution module tabs.

The release section controls are centered when space allows and scroll horizontally on narrow screens. Arrow keys, Home and End select sections; the current section scrolls into view. Touch scrolling does not change stages accidentally.

Verification: `node scripts/verify-release-navigation-browser.cjs` exercises the actual portal, sidebar and release form at 1440px, 390px and 320px. It checks a single header navigation, field clearance, no page overflow, section selection, keyboard navigation and mobile sidebar links. `npm run test:submission-feedback` checks submission behavior separately.
