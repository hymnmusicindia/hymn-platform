# Theme and contrast checks

The header profile menu uses the existing animated Sun/Moon control. It changes the document theme, saves `hymn-theme`, and synchronizes other mounted controls. Desktop and mobile profile menus share the control.

The blank Studio subscription button was caused by the global text-action stylesheet overriding its foreground while the Studio module retained a filled background. Filled Studio actions now declare their intended foreground, respected by normal, hover and focus styles.

The final global theme stylesheet restores the document light palette at legacy portal, admin and team boundaries. Shared navigation, newsletter controls, footer and public content panels have light-mode colours. Intentional photograph overlays and dark promotional artwork retain their contrast treatment.

Regression coverage:

- `node scripts/verify-hymn-studio-browser.cjs`: actual global stylesheet imports in application order; light/dark at 1440, 1024, 390 and 320 pixels; primary action text contrast at least 4.5:1 in normal, hover and focus states.
- `node scripts/verify-header-theme.cjs`: actual header and toggle, saved preference, desktop/mobile switching, menu text contrast, existing presence controls.
- `node scripts/verify-theme-surfaces.cjs`: representative admin/team boundary surfaces, inputs, shared sidebar and newsletter text.

Public pages sampled with a read-only browser audit: home, Studio, Beatstore, distribution, services, FAQ, contact and login. Automated solid-background calculations cannot reliably judge text over photographs, layered gradients or composited artwork. This is not exhaustive coverage of every authenticated record, dialog or page state.
