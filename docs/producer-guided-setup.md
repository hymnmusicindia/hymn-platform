# Guided producer launch

New producers see guided storefront setup instead of business analytics until their saved storefront contains a producer name, profile image and cover, and they have submitted at least one beat. Optional biography, social links and location do not block setup. Enrollment preserves the chosen name and sound in a pending-setup profile.

Setup opens directly into the storefront form, with compact two-step navigation. On desktop, the form sits on the left and a sticky live storefront preview sits on the right. Names, selected image files and bio update in the preview before saving; temporary image URLs are revoked when replaced or unmounted. Optional details are collapsed. Narrow screens stack the preview below the form without shrinking the fields. Profile save advances to first upload. A successful first submission reloads the producer workspace with current server data. Pending review counts as an upload; approval and public listing remain separate. Existing published and sold beats count, while draft/archived-only catalogues do not.

During setup, business analytics, sales, earnings, distribution/studio navigation, newsletter, referral prompts and subscription upsells are deferred. Settings, notifications, support and catalogue corrections remain accessible. Deep-linked business tabs resolve to the launch guide without briefly rendering metrics. The upload endpoint verifies storefront readiness before processing files. Restricted accounts cannot reactivate themselves by saving their profile.

Setup progress is derived from saved records, not browser-local dismissal or an arbitrary completion toggle. If required images are removed or the last qualifying listing is deleted, the guide returns. Existing financial records and payout entitlements are unchanged; this is a workspace onboarding flow, not a withdrawal restriction.

Research informing the design:
- Shopify setup guides use interactive checklists and visual progress: https://shopify.dev/docs/api/app-home/latest/patterns/compositions/setup-guide
- NN/g progressive disclosure defers secondary capabilities until needed: https://www.nngroup.com/articles/progressive-disclosure/
- NN/g recommends contextual help at the point of action: https://www.nngroup.com/articles/onboarding-tutorials/

Validation: `node --import tsx scripts/verify-producer-setup.ts` covers readiness and deep-link rules. `node --import tsx scripts/verify-producer-setup-browser.ts` exercises the actual dashboard shell with browser fixtures at desktop and mobile widths. No live uploads or account changes are performed by those checks.

## Compact beat upload

Four steps: Files, Details, Pricing and Review. File tiles replace long upload rows; master format is inferred from the selected extension. Artwork is part of Files. A sticky live beat card shows artwork, title, metadata chips and only the separately selected public preview audio. Private masters are never attached to a public-facing player. Prices use four licence cards, with an explicit suggested-prices action. Optional metadata and licence explanations are collapsed. Final review shows the actual files, beat facts and prices with edit actions, followed by sample declaration. Invalid exclusive pricing or missing sample disclosure blocks submission. Failures retain files and field values for retry.
