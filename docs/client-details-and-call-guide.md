# Client details and guided calls

Customers can open **Dashboard → Settings → Personal details → Help us understand your project** to share or clear country, state, city, age range, work/study situation and an INR budget range for their current project. Every field is optional. Saving does not subscribe the customer, change contact permission or initiate outreach.

Authorised team members can record the same information in the existing contact intake/editor, including **Edit contact details** inside an activity. Details appear in the shared contact record and call context. Staff should ask before recording personal details, leave unknown values blank and use the stated project budget rather than infer spending power from age, employment or location. No demographic scoring or automatic exclusion is added.

The customer profile lives under `users.onboarding_preferences.clientDetails`; existing onboarding keys are preserved. An additive `team_clients.client_details` JSONB column holds the CRM snapshot, source and update metadata. Customer edits sync the linked card and increment its version. Staff edits affect the shared contact card, not the customer's account preferences. A later customer save replaces that snapshot with the customer's own values. Older team API clients that omit the field preserve existing details. Clearing all fields is supported. Customer revisions and existing team contact versions reject stale saves. Account imports, explicit account linking, support-created cards and contact merges preserve context.

Call representatives see a prepared introduction using their own signed-in name and job title, a consent-to-talk question, service routes, suggested questions and next steps. Browsing a route never marks client interest; **Add this service to call interests** uses the existing activity draft/autosave. Guide navigation and search preserve call notes.

Distribution prices reuse `distributionPlanCards`, published optional-fee notes and royalty terms. Other guides distinguish published listings from custom quotes. Pricing searches for beats and mixing/mastering fetch current public listings, show only returned prices, and offer retry/fallback on failure. Final checkout and service terms remain authoritative. No invented promotional price, guaranteed live date, playlist placement or result is supplied.

Under-18 guidance appears for a client-reported age range or an existing account birth date that establishes minority. The birth date itself is not added to the call response. The guidance recommends helpful free options and clarifying who should participate in paid decisions.

## Release

Apply `20261114140000_client_details` through the repository's guarded migration deployment process before deploying the application. Back up and rehearse according to `docs/database-deployment.md`. It adds one JSONB column with an empty-object default; no existing demographic data is invented or backfilled. Never use production `db push`.

## Verification

`node --import tsx scripts/verify-client-call-isolated.ts --browser` creates a disposable PostgreSQL fixture, applies the actual additive migration to the previous schema, tests optional/invalid fields, stale and concurrent saves, clears, provenance, account imports, lookup/activity responses, revoked access and canonical pricing/search. It also runs the existing conversation-guide regression suite. Browser checks exercise authenticated customer profile saving, unauthenticated/cross-origin rejection, rep identity, minor guidance, service switching, scoped price search, empty states and mobile/desktop layouts. Mail and background jobs are disabled; no production customer data is changed.

`node scripts/verify-client-details-form.cjs` bundles the actual profile component into an isolated browser fixture with mocked API responses. It checks conflict/reload recovery, input replacement, subsequent saving, clearing all optional fields and the responsive controls without loading unrelated dashboard tools.
