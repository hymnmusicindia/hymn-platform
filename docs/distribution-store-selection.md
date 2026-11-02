# Release destination preferences

Verified on 3 November 2026 using the authenticated, read-only `POST /list_stores` endpoint. The response lists 38 destinations; the sanitized snapshot is in `evidence/direnote-stores-2026-11-03.json`. Reference: https://distribution.direnotemedia.com/dnm_api.

The selector uses compact rows with visible names, original website-published icons and native checkboxes on the right. Streaming destinations are separate from social monetisation and YouTube Content ID. Apple Music, iTunes and Shazam remain separate destinations, matching the catalogue. No unsupported Audible Magic/Gracenote option or invented upgrade/curation promise is added.

The current ingestion contract does not accept a per-release store inclusion/exclusion field. HYMN saves destination preferences but explicitly tells customers that store exclusions cannot currently be enforced through the connection. A catalogue entry is not proof of current availability, successful delivery, territorial availability or store acceptance. Provider catalogue entries such as Wynk are displayed as returned, without a service-availability promise. Store confirmation still comes from delivery evidence.

`150+ More Stores` remains a supported legacy draft value and is rendered as “Other supported stores” only when present in an existing draft; new releases select explicit catalogue names. Its generic music icon does not represent a store brand.

Original icons are stored locally under `public/assets/store-logos/original`. `sources.json` records the source URL of every downloaded image. Most come directly from store websites/CDNs; three use the original website favicon served through the DuckDuckGo icon cache where direct access was blocked. Images are not redrawn, recoloured or converted into replica SVGs. If an image fails, the store name and checkbox remain available with a generic music symbol. Refreshes of `scripts/fetch-store-brand-assets.cjs` require reviewing the source manifest and checking any unavailable brands before committing.

YouTube Music is ordinary music delivery and does not enable the paid social add-on. Social destinations retain the existing rights-consent gate. Content ID retains its eligibility check, channel details and existing price; selecting ordinary music delivery does not enable it.

Validation: scoped TypeScript check including release form and checkout declarations; eight browser layouts (light/dark at 1440, 768, 390 and 320 pixels), label-click and keyboard selection, right-positioned checkboxes, consent gating, image decoding and overflow checks; catalogue/validation/pricing checks. No customer release submission or delivery occurred during verification.
