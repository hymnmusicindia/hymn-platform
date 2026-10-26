# Dashboard navigation consolidation

Related modules now share a primary section and contextual module navigation. Existing module keys, URLs, actions, data boundaries and permission checks remain in place.

## Admin OS

The 39 existing navigation destinations are grouped into six primary entries:

| Section | Modules |
| --- | --- |
| Overview | Operations dashboard, notifications, operational reporting |
| Distribution | Releases, delivery, manual catalogue, changes and takedowns, fraud, contracts, managed distribution services |
| Finance | Revenue, payouts, royalty imports, reconciliation, KYC |
| Customers & growth | Users, artists, client cards, contributors, referrals, growth, promotions, redemptions, playlist tools, newsletter, enquiries |
| Marketplace & Studio | Producer/beat/order operations, reviews, Studio operations |
| Platform & team | Team access, settings, content, support, audit/activity, email delivery, webhooks, integration health |

Only authorized modules appear. Opening a section selects an authorized destination; its other modules appear above the page. Admin module search still finds individual tools across every section. Attention counts remain on sections and individual module links. Legacy queue, failed-delivery, payments and producer URLs select the corresponding parent section.

## Team OS

| Section | Modules |
| --- | --- |
| Home | Work coordinator |
| Work & schedule | My Work, All Work, projects, approvals, calendar, weekly active hours |
| Contacts & growth | Contact database, acquisition/CRM, callbacks, My referral link |
| Messages | Inbox, Team Chat, Team email |
| Quality & reports | Release QC, creator approvals, reports |
| Team & access | Directory, activity/audit, roles/settings |

Members see only sections containing their existing available tools. The personal performance shortcut remains available. Section and module changes now support browser back/forward navigation. Existing `module=` links and the CRM alias still work.

For example, members now find their referral link under **Contacts & growth → My referral link**; the old direct referral URL also works.

## Customer and producer dashboards

Sidebar entries open workflow sections; existing tools appear in contextual navigation. Files are grouped with distribution. Financial tools are grouped under Money, and profile, settings, referral and support tools share Account & support. Producer callbacks remain local to the producer workspace. Existing module entries that were previously filtered out by the shared navigation helper are retained.

On phones, module navigation scrolls horizontally within its own container. Active sections and modules use `aria-current`, links retain real destinations, buttons retain their existing callbacks, and guided destination links remain available.

## Validation

`npm run test:navigation-sections` verifies module inventory, permission subsets, legacy aliases and desktop/390px/320px navigation. Browser checks exercise admin section/module links and history, restricted navigation, customer/producer finance and referral/support callbacks, Team OS work/referral access, and horizontal overflow. No production data is written by these fixtures.

Verification passed: navigation inventory and sidebar callback checks, browser checks at all three widths, the full production build against isolated PostgreSQL, and targeted ESLint with zero errors (existing warnings remain in the dashboard shells). The temporary browser route and its generated configuration references are cleaned up by the test runner.
