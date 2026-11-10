# Dashboard navigation consolidation

Team OS and Admin OS use a shared homepage-style sidebar with stable section headings and inline module links. Hover reveals one section at a time; clicks, Enter/Space and Arrow Down support touch and keyboard use. Escape closes a submenu and returns focus to its heading. Selecting a module highlights its destination without changing the menu inventory or layout. The changing contextual module-tab rows have been removed from these two workspaces. Existing module keys, URLs, actions, data boundaries and permission checks remain in place.

## Admin OS

The 40 existing navigation destinations are grouped into six primary entries:

| Section | Modules |
| --- | --- |
| Overview | Operations dashboard, notifications, operational reporting |
| Distribution | Releases, delivery, manual catalogue, changes and takedowns, fraud, contracts, managed distribution services |
| Finance | Revenue, payouts, royalty imports, reconciliation, KYC |
| Customers & growth | Users, artists, client cards, contributors, referrals, growth, promotions, redemptions, playlist tools, newsletter, enquiries |
| Marketplace & Studio | Producer/beat/order operations, reviews, Studio operations |
| Platform & team | Team access, settings, content, support, audit/activity, email delivery, webhooks, integration health |

Only authorized modules appear. Opening a section reveals its authorized destinations directly in the sidebar; selecting a destination navigates to that module. Admin module search still finds individual tools across every section. Attention counts remain on sections and individual module links. Legacy queue, failed-delivery, payments and producer URLs select the corresponding parent section.

## Team OS

| Section | Modules |
| --- | --- |
| My day | Work-station and assigned work views |
| Customers | Contact directory |
| Team queue | Shared team queue |
| Schedule | Calendar and weekly active hours |
| Messages | Inbox, Team Chat, Team email |
| Manage | Work coordinator, projects, consultations, acquisition, referral link, leadership, approvals, reports, directory, audit and settings |

Members see only sections containing their existing available tools. The personal performance shortcut remains available. Section and module changes now support browser back/forward navigation. Existing `module=` links and the CRM alias still work.

For example, members now find their referral link under **Contacts & growth → My referral link**; the old direct referral URL also works.

Both workspaces place the same labeled Team OS / Admin OS switch buttons below the brand. Destinations come from `/api/workspaces`; Team membership never grants admin access. Multiple team memberships retain their workspace names. On desktop, a collapsed rail reveals labels and submenus on hover or keyboard focus. At widths up to 1000px, the sidebar is a drawer with close, Escape and backdrop controls.

## Customer and producer dashboards

Sidebar entries open workflow sections; existing tools appear in contextual navigation. Files are grouped with distribution. Financial tools are grouped under Money, and profile, settings, referral and support tools share Account & support. Producer callbacks remain local to the producer workspace. Existing module entries that were previously filtered out by the shared navigation helper are retained.

On phones, module navigation scrolls horizontally within its own container. Active sections and modules use `aria-current`, links retain real destinations, buttons retain their existing callbacks, and guided destination links remain available.

## Validation

`npm run test:navigation-sections` verifies module inventory, permission subsets, legacy aliases and desktop/390px/320px navigation. Browser checks exercise admin section/module links and history, restricted navigation, customer/producer finance and referral/support callbacks, Team OS work/referral access, and horizontal overflow. No production data is written by these fixtures.

Verification passed: navigation inventory and sidebar callback checks, browser checks at all three widths, the full production build against isolated PostgreSQL, and targeted ESLint with zero errors (existing warnings remain in the dashboard shells). The temporary browser route and its generated configuration references are cleaned up by the test runner.

## Shared internal sidebar verification

The browser suite checks all 40 admin destinations for stable section/module inventories, restricted roles, actual Admin OS and Team OS shells, the absence of changing module tabs, hover and keyboard navigation, collapsed desktop navigation, authorized workspace switch buttons, browser back navigation, and 1440/390/320px layouts. Screenshot artifacts use the `internal-admin-sidebar-*` and `internal-team-sidebar-*` prefixes. Fixtures mock APIs and send no emails or invitations.
