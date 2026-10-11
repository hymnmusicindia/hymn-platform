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

Four steps: Files, Details, Pricing and Review. File tiles replace long upload rows; master format is inferred from the selected extension. Artwork is part of Files. A sticky live beat card shows artwork, title, metadata chips and preview audio, falling back to the master when no preview is selected. Published, enabled beats without previews play their master through a beat-scoped endpoint with byte-range seeking; drafts and unlisted beats remain inaccessible. Prices use four licence cards, with an explicit suggested-prices action. Optional metadata and licence explanations are collapsed. Final review shows the actual files, beat facts and prices with edit actions, followed by sample declaration. Invalid exclusive pricing or missing sample disclosure blocks submission. Failures retain files and field values for retry.


## Public producer storefront

Active producer profiles are resolved by owner user ID, including administrators with an active producer profile. Beat rows link the saved producer name to `/beat-store/producers/{slug}`. The saved unique slug is the storefront ID; it remains stable when the producer changes their display name. Once a beat is published and enabled, the storefront editor shows the ID, live beat count and public link. Public storefronts show the cover, portrait, producer bio and only that producer's published, enabled catalogue. Draft, pending-review and unlisted beats stay out of the public catalogue. Accounts without a matching public profile retain the known owner name without a broken link.


## Mobile producer bio link

`/p/{slug}` is a public, mobile-first producer link page outside the workspace navigation. It uses the saved portrait, bio and banner, with a dark gradient over the banner background. Up to six live beats are ordered by paid, unrefunded licence sales; newest beats break ties and are used when there are no sales. Only public beat fields are sent to the player; customer and sales data remain on the server. A single audio element plays previews (or the existing controlled master fallback), supports pause and seeking, and stops the previous beat when switching.

The page links to the complete standalone beat store and saved Instagram, YouTube, Spotify and website URLs. Missing or unsafe URLs are omitted. The share button uses the device share sheet when available and clipboard otherwise. The footer links to HYMN with the existing white logo. Active profiles get a bio-link entry in their storefront editor; the full storefront links back to the bio page. Canonical and social-preview metadata use the same saved identity. No database migration is required.

Validation: `node --import tsx scripts/verify-producer-links.ts` and `node --import tsx scripts/verify-producer-link-browser.ts` check sales ranking, safe links, mobile widths (320/390/430), desktop, empty and single-beat profiles, playback switching, sharing, logo loading and touch targets.


## Bio page shopping and open layout

Bio-link beats remain public without sign-in. Small social icons sit below the producer identity; beat rows, load-more and the full-store link use open layouts with thin dividers. Six beats load initially; the public `/api/producer-bio/{slug}/beats?offset=6` endpoint supplies the next six without requiring authentication.

Add to cart and Instant buy use the existing Google Identity Services button in a focused dialog. Login stays on the bio page, restores the selected action and shows the authenticated Google avatar at the top right. Cart entries use the existing HYMN cart; amounts are never trusted from browser storage. Instant buy offers MP3, WAV, stems and exclusive licences with a server quote. The shared create-order/verify-payment APIs create and confirm the purchase. The native dialog closes before Razorpay opens.

Verification checks the signature, order owner and the payment's captured status, amount, currency and order ID before fulfilment. Existing webhook/reconciliation fulfilment handles captured payments if the browser closes. Purchase emails are attempted during fulfilment with licensed files attached within the existing 10 MiB attachment budget and authenticated download access for larger files. The receipt only claims email delivery when the email log is sent; email failure leaves purchased downloads available and reports delivery pending. An unconfirmed signed payment and its cart items are retained per buyer in session storage so a refresh can check the same payment instead of charging again. Completing Instant buy removes only the purchased cart entry, preserving unrelated beats.

Razorpay reference: https://razorpay.com/docs/server-integration/python/test-app/ (signature verification, capture and API confirmation alongside webhooks).

Validation: the producer-link browser script tests the real Google callback against a fixture server, public pagination, login/cart resume, avatar, licence quote, direct and cart checkout, pending capture after refresh and honest delivery status. `scripts/verify-bio-checkout-verification.ts` exercises actual signature/capture checks with a mocked provider; mismatched amounts/currencies/orders, unauthorized owners and uncaptured payments cannot fulfil. No live charges or test emails are made.
