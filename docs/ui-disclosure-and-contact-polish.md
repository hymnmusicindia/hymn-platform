# Contact previews and shared disclosure polish

Contact cards show a compact name, phone/email or scheduled call, and a consistent detail affordance. Clicking opens a native modal with contact facts, source checks, notes and existing call controls. The pipeline does not repeat stage, caller and verification paragraphs on every card; these details remain in the modal. Each stage scrolls independently for long lists. The existing permission checks and save payloads are unchanged.

The six-stage guide starts collapsed. Its expanded layout uses three columns on desktop, two on tablet and one on small screens, with space between step numbers, headings, explanations and the final caution. The modal supports native focus containment, Escape and focus return. Background scrolling is restored on close.

The site-wide disclosure stylesheet provides low-specificity defaults for header spacing, text wrapping, focus rings and chevrons. Existing SVG indicators retain control and do not receive duplicate arrows. The beat licence guide now uses a vector chevron in place of its text plus. Shared Team OS defaults no longer override nested guide padding or component heading/link colours, and checkboxes do not inherit text-field width.

The implementation follows [W3C accordion guidance](https://www.w3.org/WAI/ARIA/apg/patterns/accordion/) for clear disclosure controls and [W3C modal guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) for keyboard and focus behaviour. Native details and dialog elements preserve their built-in semantics.

Verification: `node scripts/verify-visual-polish-browser.cjs` compiles the shared CSS and mounts the actual CRM, Team OS styles, analytics state and beat licence guide at 390, 768 and 1440 pixels. It checks card height, the six-step guide, horizontal overflow, popup details, focus restoration, checkbox sizing, button text contrast and duplicate indicators. Screenshots are stored in the ignored `.cache/visual-polish` directory. `node scripts/verify-team-lead-stages-browser.cjs` verifies the call outcome, second verification confirmation and saved payload. TypeScript and targeted ESLint checks also pass.

This is a shared-component review and responsive fixture verification; it is not a claim that every authenticated production page and data state was visually inspected.
