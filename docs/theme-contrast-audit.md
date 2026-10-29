# Theme and contrast checks

The header profile menu uses the existing animated Sun/Moon control. It changes the document theme, saves `hymn-theme`, and synchronizes other mounted controls. Desktop and mobile profile menus share the control.

The blank Studio subscription button was caused by the global text-action stylesheet overriding its foreground while the Studio module retained a filled background. Filled Studio actions now declare their intended foreground, respected by normal, hover and focus styles.

`app/styles/theme-tokens.css` now owns both palettes. Its `--hymn-*` primitives feed the public site, Studio, distribution, admin, producer, team and overlay aliases. Local palettes in the older stylesheets have been removed or converted to these aliases. Neutral surfaces are opaque, elevation uses restrained shared shadows, and gradients pair with theme-aware text. The header is white in light mode and graphite in dark mode; its former blur and fixed black background are removed.

Public review cards, the music workflow, newsletter, navigation and mobile footer use the same contract. Explicit `force-dark` photograph/promotional islands retain a complete inverse palette instead of mixing dark artwork with inherited light-theme text. Visual artwork such as the Beatstore record remains separate from interface surfaces.

Regression coverage:

- `node scripts/verify-hymn-studio-browser.cjs`: actual global stylesheet imports in application order; light/dark at 1440, 1024, 390 and 320 pixels; primary action text contrast at least 4.5:1 in normal, hover and focus states.
- `node scripts/verify-header-theme.cjs`: actual header and toggle, saved preference, desktop/mobile switching, menu text contrast, existing presence controls.
- `node scripts/verify-theme-surfaces.cjs`: representative admin/team boundary surfaces, inputs, shared sidebar and newsletter text.
- `node scripts/verify-theme-components.cjs`: actual reviews and music workflow components, admin/team CSS modules, report fields, distribution actions and overlays, in both themes at desktop/mobile widths. Includes primary hover and focus states.
- `node scripts/verify-theme-contract.cjs`: all primary, muted and secondary text against the core surfaces, semantic status fills and primary actions must reach 4.5:1; input boundaries must reach 3:1. Rejects new literal palette overrides in component stylesheets.
- `node scripts/audit-theme-pages.cjs`: reads a local running site and saves screenshots plus a machine-readable report in `.cache/theme-core-audit`. Set `THEME_AUDIT_ORIGIN` and `THEME_AUDIT_ROUTES` to choose the server and routes.

The rendered audit covered home, Studio, Beatstore, distribution, services, FAQ, contact and login at 1440px/390px in light/dark modes: 32 combinations and 2,626 text checks in the initial sweep. It found services/FAQ headings and mobile footer panels that the initial Studio-only test did not cover. After corrections, affected routes were rechecked: 24 combinations, 1,903 text checks, no reported contrast failures or horizontal overflow. Review/workflow and authenticated workspace component fixtures also pass in both themes.

These checks use local fallback content where production database access is unavailable. They do not change business records. Authenticated styles use real CSS modules with fixture records. The contrast helper evaluates solid backgrounds and gradient endpoints; text over photographs/composited artwork also needs visual inspection. This is not an assertion that every possible customer record, dialog and third-party widget has been exercised.
