# HYMN workspace redesign

The shared workspace now uses one navigation, surface, record-browser and mobile system across artist, producer and admin modules. Operational screens prioritize finding a record, comparing its state, inspecting details and acting on that record.

## Role boundaries

- Admin: permission-filtered operational navigation, no consumer newsletter signup, referral gift, shopping cart, subscription upsell or consumer creation menu. Newsletter campaign management remains a staff tool.
- Artist: release workflow, purchases, rights, support, account and financial destinations.
- Producer: beat upload and moderation, storefront, verified sales, licence agreements, performance, earnings and wallet history. Release distribution remains a separate destination.
- Admin subpages use the same frame; their server-side authorization remains mandatory. Menu visibility is not an authorization boundary.

## Records and detail workflows

`WorkspaceRecords` provides search, sortable columns, 10/25/50-row pagination, explicit empty/filtered states and stacked mobile rows. Users, support, payments, agreements, beat inventory, sales, ledgers and reporting use it. Producer and moderation forms open after selecting an individual record.

The user workspace API requires `users.read`, and separately gates catalogue, finance, support and audit sections. It returns at most 25 records per section per page, full permitted status counts, and a server-side release-status filter. Explicit release ownership takes precedence over the legacy submitter; unassigned manual releases are excluded from a user's catalogue. Credential fields, bank details, session tokens and raw audit metadata are excluded. Last recorded sign-in is not presented as time spent online.

Paid orders drive sales and agreements. Unreviewed beats cannot be published from the producer inventory. Unknown monetary values are unavailable rather than fabricated zeroes. Operational reporting describes stored catalogue snapshots and recorded order history, without invented monthly growth or streaming metrics. Admin task priorities rank critical, high, normal, low; resolved and future-snoozed tasks are excluded from the default queue.

Changes and takedowns share a record-review workspace, filtered on the server by staff permissions. Payment events expose verification, processing state, attempts and references, with detail-level replay feedback.

## Validation

- `npx tsx scripts/verify-workspace-system.ts`: permission navigation, producer upload isolation, task priority/idempotency/resolution/snooze/assignment; uses the local adapter and never connects to a database.
- With a local development server on port 3015: `node scripts/verify-workspace-browser.cjs`. Optional `WORKSPACE_TEST_URL` overrides the local URL. The test temporarily creates a preview route, mocks API responses, exercises 30 module views at 1440/390/320px, checks user drill-downs, search/pagination, publish guards and paid-only sales, then removes the preview route. Do not run against a production server.
- Additional local browser checks exercised change-request validation, failed saves, payment-event failure feedback and producer mobile navigation. The new user endpoint rejects unauthenticated requests.

Browser fixtures verify presentation and interactions; they do not validate production database content or execute production payments, messages or replays.

Production compilation and the build TypeScript phase passed. Page-data collection could not finish because the local production environment does not contain a PostgreSQL `DATABASE_URL`. The normal build also encountered a locked Prisma engine DLL held by the running development server; compilation used the existing generated client, with no schema changes.

## Research

- [NN/g: Data Tables ? Four Major User Tasks](https://www.nngroup.com/articles/data-tables/): find, compare, inspect and act.
- [Carbon: Data table usage](https://v10.carbondesignsystem.com/components/data-table/usage/): consistent toolbars, row actions and progressive detail.
- [NN/g: Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/): keep sensitive or secondary controls behind a deliberate detail step.
