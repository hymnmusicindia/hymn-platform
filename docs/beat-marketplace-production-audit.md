# HYMN Beat Store and Producer Ecosystem — production audit

Audit date: 2026-08-26. Scope: current repository lifecycle from role grant through payout. This document records the canonical implementation; it does not describe a second marketplace.

## Lifecycle findings and repairs

| Stage | Before hardening | Canonical path / repair |
|---|---|---|
| Admin grants/revokes Producer | Working | `PATCH /api/admin/users/:id` updates the canonical User role, creates/disables the one ProducerProfile, notifies the user, and writes AuditLog. |
| Producer access/switch | Working | Page redirect plus `requireRole([producer, admin])` protect UI and APIs. Customer switch is rendered only for Producer-role accounts. Same account/session is used. |
| Producer onboarding/profile/public page | Partial | Existing profile and `/beat-store/producers/:slug` retained. First-run dashboard now requires display name, avatar and cover before profile activation. |
| Upload/storage | Partial/insecure preview | Master remains a `private_beat_deliverable` in centralized private storage. Storefront serialization no longer contains the master URL. Optional public MP3 preview is separate. Upload is five staged steps and includes metadata, artwork, prices and sample declaration. |
| Validation/moderation | Partial | BPM, two prices, price ordering, sample disclosure and readiness are validated server-side. Canonical public status is `PUBLISHED`; moderation and audit trail remain in existing Admin flow. |
| Discovery/cards/detail | Partial | Existing search/genre/mood/BPM/key/producer/price sorting retained. Cards now expose the product, both prices and View Beat. Detail offers only General and Exclusive choices. Synthetic listener/cart/sale numbers remain zero, never fabricated. |
| Licence tiers | Duplicated/confusing | New checkout accepts only `general` and `exclusive`. Historical `basic`/`premium` records remain readable and normalize to General when a legacy licence must be generated. |
| General terms | Missing snapshot/config | Per-beat canonical limits and policy fields added. Default is one commercial release. Exact settings are frozen into `licenseTermsSnapshot`. |
| Exclusive legal mode | Insecure copy | Defaults to `EXCLUSIVE_LICENSE`; copyright assignment is stated only for explicit `RIGHTS_ASSIGNMENT`. Existing General licences are counted and disclosed; they remain valid. |
| Exclusive concurrency | Missing | Serializable checkout transaction atomically transitions `PUBLISHED → EXCLUSIVE_RESERVED`; General and Exclusive purchases are blocked during the hold. Matching verified payment alone transitions to `EXCLUSIVELY_SOLD`. Failed/expired reservations release safely. |
| Checkout/pricing | Mostly working | Frontend sends identifiers only. Server fetches canonical beat prices/status. Razorpay order, server signature verification and persisted-order ownership checks are retained. |
| Idempotency | Working | Unique Razorpay IDs, order-item uniqueness, purchase upsert, sale uniqueness, wallet idempotency keys and persisted webhook hashes prevent duplicate fulfilment. |
| Sale/accounting | Partial | Sale now snapshots gross, discount, net base, 30% platform rate, 70% producer rate, both amounts and refunds. Commission is computed once in the fulfilment transaction. |
| Contract/PDF | Broken historical semantics | Purchase now stores an immutable versioned terms snapshot before PDF generation. PDFs render the snapshot. Existing generated PDFs remain available; legacy purchases receive a one-time conservative snapshot when regenerated. |
| Entitlement/download | Working, no counters | Private route checks authenticated owner/admin or a verified accessible purchase. Master URL is absent from public JSON. Successful downloads now update timestamp/count. |
| Customer purchases | Working | Existing dashboard order/purchase records and authenticated master/licence links retained. Exclusive badge derives from the stored licence type. |
| Producer sales/earnings/ledger | Working with UI duplication | Canonical BeatSale, WalletTransaction and ArtistPayoutBalance retained. No browser value authorizes money. Dashboard values originate from server records. |
| Refunds | Working | Webhook creates immutable compensating wallet entries, revokes access and preserves the sale; refunded amount/status are now stored. Sold beats and contracts are not deleted. |
| Payouts | Working | Existing request, KYC, approval, receipt, payout event and immutable wallet-debit architecture retained. Producer APIs are role protected. |
| Admin producer/beat management | Working/partial UX | Existing search, profiles, role changes, moderation, suspension and audit APIs retained. Beats with financial history archive instead of delete. |
| Reconciliation | Missing beat checks | Admin financial reconciliation now flags paid BeatSale split mismatches and missing producer credits, alongside royalty/payout checks. |
| Notifications | Working | Existing idempotent notification/email event keys cover role approval, moderation, purchase, sale, licence and payouts. |
| Mobile | Working/strengthened | Existing responsive store/dashboard retained; staged upload and licence choices use stacked mobile cards and touch-sized controls. |

## Security conclusions

- IDOR: producer beat mutations verify owner; customer purchase listing ignores another requested user unless Admin; licence/master reads verify the purchaser; Admin routes require permissions.
- Price/share manipulation: checkout quote ignores client prices and retrieves canonical price; commission constants and applied rates are server-side.
- Payment replay: unique payment/order IDs plus transactional idempotency prevent duplicate purchases, sales or credits.
- Exclusive race: atomic conditional update permits one reservation winner. A payment for a reservation no longer owned by its order is refused for reconciliation.
- File exposure: master is private and removed from storefront/API serialization; only a separately uploaded preview is public. Private storage validates path, MIME, magic bytes, size and ownership.
- Historical integrity: sold beats archive, licence snapshots are immutable, and refunds reverse rather than delete financial records.

## External production configuration

Repository work cannot create third-party credentials. Hostinger must provide `DATABASE_URL`, `PRIVATE_STORAGE_ROOT`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, public site URLs, and Resend settings. Razorpay must send signed payment events to `/api/webhooks/razorpay`. Prisma migrations must run before the new application version starts.
