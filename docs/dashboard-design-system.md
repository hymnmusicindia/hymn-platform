# Shared dashboard design

Admin, customer, producer and Team OS use `app/styles/dashboard-design-system.css`, scoped to `data-dashboard-surface`. Public pages retain their existing design. The shared system controls typography, dark surfaces, panel spacing, metrics, navigation tabs, tables, focus indicators and form geometry. Semantic status and destructive action colours remain contextual.

`WorkspacePanel` and `WorkspaceMetric` provide common module anatomy for admin, customer and producer modules; Team OS uses the same panel component and surface tokens. Existing module routes, permissions and business actions remain intact.

Run `npm run test:dashboard-design` to render real dashboard shells with isolated API fixtures. It checks representative modules across all four roles at 1440, 390 and 320 pixels, shared computed panel styles, runtime errors, horizontal overflow and unpaid-sale exclusion. These local fixtures do not verify live API availability or production data.
