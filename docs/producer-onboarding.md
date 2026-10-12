# Shareable producer onboarding

Send producers `https://hymnmusic.fun/producer-onboarding`.

The page sits outside the public workspace layout: no sidebar, workspace search or analytics. Existing `/producer-login` links redirect here.

1. Google sign-in stays on the onboarding page. Account roles remain server-controlled.
2. Customers enter their producer name and sound, confirm ownership and age, and accept the marketplace terms through the existing enrollment endpoint.
3. Producers set up their storefront with the existing live preview. The saved name, profile image and cover determine readiness.
4. The existing beat uploader submits the first beat for review. A confirmed submission opens the completion state, with a link to the producer catalogue.

Reloading derives progress from the authenticated account, producer profile and saved beat statuses. Enrollment refreshes server data and remounts the flow using the authoritative account role. Suspended or disabled profiles show a support destination; administrators cannot convert their account here.

The page uses existing APIs and requires no database migration. Beat review and publication rules remain in effect. Save failures retain the form and allow retry.

Browser verification covered 320px, 390px and 1440px widths: sign-in return, enrollment consent payload, storefront failure/retry, upload-step progression, completion and restricted profiles. TypeScript and targeted ESLint checks are required before release.
