# Unified HYMN Studio

HYMN Studio is the customer workspace at `/studio`. `/dashboard` and `/dashboard/customer` render the same new experience so existing bookmarks and notification links keep working. Guest visitors can browse engineers and sign in to open their workspace.

The design follows the user's saved light/dark theme. The new rail, overview, compact metrics, grouped tools, activity, project collection and engineer directory use scoped CSS. No DashboardFrame styling is required. The distribution editor keeps its existing controls and card catalogue.

## Destinations and retained features

- Overview: actual release counts, project status, royalty balance, corrections, drafts, recent releases, notifications and plan.
- My library: original files, purchased beats, download permissions and agreements.
- Releases: existing catalogue, release details, corrections and distribution editor.
- Mixing & mastering: projects, delivery history, private conversations, revisions, payments, approval and release handoff through their existing routes.
- Engineers: availability, genre, price and turnaround filters; verified profiles, application, readiness checks and beat-purchase context.
- Project extras: consultations, vouches and approval/withdrawal of public credits and audio samples.
- Growth: existing analytics, promotion and Content ID workflows.
- Business: royalty splits, earnings/payouts, billing/subscription actions and referrals.
- Account: notifications, preferences, account activity and support.

Producer/admin accounts can switch to Producer tools inside the same shell. Catalogue uploads/editing, storefront, sales/licences, performance, credited tracks, finance and requested buyer files retain their existing server authorization. Customer accounts are not granted producer privileges. Producer onboarding gates remain in place.

## Integration and safeguards

No database schema, settlement, licence, payment, file-access or order state-machine changes. Projects are selected by the authenticated customer's ID with a narrow summary projection. Project query failure displays an unavailable state rather than a zero count. Existing standalone URLs and API authorization remain intact. `/dashboard/studio` redirects to the new projects collection. Engineer-intent links explicitly request `view=engineers`; beat purchase context is preserved in filters and profile links.

The keyboard tool finder supports Ctrl/Cmd+K, filtering, focus containment and Escape. Mobile navigation closes after selection. Shared navigation links do not prefetch expensive tools before selection. Files and project masters are not loaded by the overview.

## References

- [BeatStars Studio app](https://www.beatstars.com/studio/app): connected content, licences, communication and business tools.
- [Spotify for Artists analytics](https://artists.spotify.com/en/analytics): distinct music, audience and performance destinations.
- The user's attached reference supplied the compact navigation, statistics and workspace direction. HYMN's interface and assets are independently implemented.

## Validation

`node scripts/verify-hymn-studio-browser.cjs` tests light/dark at 1440, 1024, 390 and 320 pixels, navigation, role-specific tools, release/draft links, keyboard finder and horizontal overflow. Existing Studio service/state-machine/private-file checks and navigation regression tests are retained. CI runs these checks on Studio changes.

The repository-wide `test:performance-execution` also contains a legacy source-text assertion for provider status polling that fails against the existing worker implementation. That worker and assertion are outside this UI change; the full suite is not claimed as passing.

## Brand asset

The user-supplied transparent PNG is stored unchanged at public/assets/hymn-studio-logo.png (the accidental double extension was corrected). The logo component displays its artwork through a cropped SVG viewport without modifying pixels. The same original logo appears in the desktop rail, mobile header and guest Studio introduction; CSS inverts it in dark mode. All Studio colours inherit the global HYMN theme tokens.
