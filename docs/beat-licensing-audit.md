# Beatstore licensing and fulfilment audit — 29 October 2026

## Research and contract policy

Primary references reviewed:

- [BeatStars: licence differences](https://help.beatstars.com/hc/en-us/articles/360035466813-What-are-the-differences-between-the-available-licenses-and-terms): producers define their own grants and limits; there is no universal stream allowance.
- [BeatStars: contracts FAQ](https://help.beatstars.com/hc/en-us/articles/54320717002395-Content-Licenses-Contracts-FAQs): transaction-specific licences use producer settings, buyer identity, price and usage limits.
- [Airbit: Beat Licensing 101](https://creators.airbit.com/getting-started-hub/beat-licensing-101): non-exclusive and exclusive grants differ and can be customised.
- [YouTube: Content ID eligibility](https://support.google.com/youtube/answer/2605065?hl=en): reference material requires exclusive rights; non-exclusively licensed material is ineligible.

HYMN's wording is original, not copied from another marketplace's contracts. Version `2026-10-29` covers scope, cumulative stream/video limits, duration and territory, upgrades, permitted production/distribution, separate synchronisation permissions, performance, monetisation, copyrights and publishing, credits, Content ID, samples, delivery/payment, breach/correction, amendments and disputes. It does not invent publishing percentages, grant rights the producer does not control, or automatically assign copyright. Template publication is not a legal enforceability opinion; bespoke assignments and separately negotiated splits need their own written terms.

Producers configure non-exclusive limits in both upload and edit forms. All three non-exclusive file tiers use that beat's shared usage policy. Blank stream/video caps mean no numeric cap, not unlimited ownership; a blank duration means no fixed term. Existing settings and grants are preserved. Streaming caps are contractual; HYMN does not claim to track all external DSP usage automatically.

## Findings and repairs

| Finding | Repair |
| --- | --- |
| Producer usage fields existed in storage but were not editable | Shared validated fields for recordings, streams, music videos, term, territory, performance, monetisation and credits |
| Checkout used vague limits and exclusive ownership/Content ID claims | Beat-specific usage summary and full clauses in checkout; conditional Content ID and express assignment language |
| Terms were first assembled at payment fulfilment from mutable catalogue data | Additive `checkout_order_items.license_terms_snapshot` column; capture rights and clauses during order creation and copy them at fulfilment |
| Agreement clauses were regenerated from current code | Persist clauses alongside rights; website and generated PDF read the same snapshot; legacy terms retain their version |
| PDF omitted stream and video limits | Rights summary now includes both limits and public performance permission |
| Purchases showed beat IDs without direct file delivery | Titles and authenticated, purchase-specific Download beat links |
| Order licence URLs could point to an absent legacy endpoint | Paid order items resolve through their actual purchase's licence endpoint |
| Generic asset URLs could bypass file-tier restrictions | Shared format entitlement policy for direct downloads and email attachments |
| Revoked PDF access could bypass the purchase endpoint through an owner asset URL | Private PDF reads also recheck the purchase entitlement |
| Missing WAV/stems could still be offered by price alone | Store and checkout use available private deliverable format; no conversion or fake stems are implied |
| Purchase emails only linked to a dashboard | Explicit authenticated beat and agreement/PDF links, plus available attachments within the existing 10 MiB raw limit |

The existing single deliverable model remains in place. An MP3 upload does not create a WAV or stem archive. Missing advertised formats are unavailable for new checkout, and existing buyers receive a clear support message if their file is missing. Producers must supply genuine source files; transcoding MP3 to WAV does not restore lost quality. A stem/exclusive archive must contain the promised source files; this change does not inspect every archive's contents or add multi-format upload management.

Expired/revoked entitlements and another buyer's files remain protected. Public preview behaviour is unchanged: when no separate preview exists, a published audio master may be played publicly, as configured by the existing product. Private purchase downloads are not DRM.

## Verification

- `node --import tsx scripts/verify-direnote-virtual.ts --beat-licensing-only`: isolated PostgreSQL; actual migration SQL, order snapshots surviving catalogue edits before payment, fulfilment, PDF creation/parsing, email attachments/links, purchase listing, owner/other-user/revoked download APIs and generic storage guards.
- `node scripts/verify-email.cjs`: SMTP configuration/TLS, HTML escaping, attachments, ownership, format tiers, size budget, duplicate and failure logging. Does not send real mail.
- `node --import tsx scripts/verify-checkout-order-persistence.ts`: scoped reservations and checkout snapshot persistence.
- `node --import tsx scripts/verify-payment-flows-isolated.ts --webhooks-only`: verified-payment fulfilment, duplicate events, amount/currency mismatch, refunds and producer accounting.
- `npm run test:beatstore:browser`: store playback, engagement, cart/licence separation and responsive widths.

CI runs the licence, mail and checkout snapshot checks on relevant changes. Existing issued purchases are not mass-rewritten with new legal terms.

## Production record checks

Read-only database audit found 13 published beats (8 MP3 masters and 5 WAV masters), each with a private deliverable record. The one active pre-existing purchase has a PDF, a paid order and a sent delivery email. Eight MP3-only beats had prices for unavailable WAV/stem/exclusive formats; the new availability checks prevent those formats from being purchased. This checks database records, not every file byte on remote storage. The additive snapshot migration was applied successfully before code publication.

## Explicit delivery requests through HYMN SMTP

An explicitly requested beat delivery is stored as a deduplicated Beat delivery task, bound to the purchase owner and a hash of the account recipient. The existing release-emails scheduler checks one request per run. It verifies active access and reads the licensed master, generates the agreement on live private storage without sending an early email, reads the resulting PDF, then uses the standard HYMN licence-ready SMTP email with authenticated links and size-eligible attachments. It resolves the request only after an SMTP acceptance receipt, or when an existing sent receipt suppresses a duplicate. Missing files/configuration wait; changed recipients and uncertain in-flight SMTP outcomes require review. Failures retry at most three times, with an hourly delay. Expired processing tasks are not automatically reclaimed because their previous SMTP outcome might be unknown. No workstation SMTP credentials or locally generated production file records are needed.

Run `node --import tsx scripts/verify-direnote-virtual.ts --beat-delivery-only` to verify readiness gating, both attachments, disabled SMTP, account-recipient binding, concurrent claims and duplicate suppression without sending actual mail.
