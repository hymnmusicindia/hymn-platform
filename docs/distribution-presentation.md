# Distribution presentation

The distribution wizard, release catalogue and release management pages share
`app/styles/distribution-consistency.css`, imported after the legacy styles in
the root layout. Its `distribution-workflow` scope owns the wizard shell, stage
navigation and controls across setup, editing and review. Keep changes to these
shared elements here rather than adding another stage-specific layout override.

- The five editing sections stay in the same sticky horizontal navigation:
  Cover artwork, Credits & tracks, Release details, Delivery, Review. Artists
  and Music are setup steps outside that menu. Small screens
  scroll the navigation horizontally; the current stage is positioned in view.
- The hosting portal remains the scroll owner; panels do not create nested
  vertical scroll areas. Bottom actions remain available while editing.
- Surfaces use 16px corners, fields and buttons use 10–12px corners, and controls
  have a minimum 44px target. Selected controls have contrasting text and fill.
- Current stages use a filled selection and `aria-current`; re-release choices
  expose `aria-pressed`. Keyboard focus has an explicit visible outline.

References: [W3C multi-page forms](https://www.w3.org/WAI/tutorials/forms/multi-page/)
and [GOV.UK task lists](https://design-system.service.gov.uk/components/task-list/).

Run `node scripts/verify-distribution-visual.cjs` for a browser fixture of the real
ReleaseForm at 1440, 1024, 768 and 390 pixels. It checks all seven stages, current
stage visibility, sticky navigation, overflow and re-release selection; previews
are saved under `.tmp/distribution-visual/`. Next navigation and network responses
are mocked; this is a presentation check, not a live delivery or checkout test.

Run `node scripts/verify-distribution-portal-visual.cjs` for catalogue search,
empty-result recovery, grid/list selection, keyboard tab navigation and overflow
checks at the same four widths. Network and Next navigation use fixture responses.
