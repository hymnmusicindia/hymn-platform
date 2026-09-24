# Studio Services architecture audit

Audit date: 2026-09-23. Scope: HYMN Mixing & Mastering marketplace and its Beat Store, payment, storage, rights, and distribution handoff.

| Existing module | Files / models | Purpose | Reuse | Refactor needed | Duplication risk / new requirement |
| --- | --- | --- | --- | --- | --- |
| Authentication and roles | `lib/session.ts`, `lib/access.ts`, `User`, `AdminMembership` | Customer, seller and admin sessions/RBAC | Yes | Add engineer capability checks through canonical party/profile | Never add an EngineerUser or separate login. |
| Canonical contributor identity | `ContributorParty`, `ProducerProfile`, `lib/contributor-identity.ts` | One real person across producer and release credits | Yes | Add one-to-one `EngineerProfile` and engineer credit reuse | Separate engineer identity would split credits and payouts. |
| Beat catalog and purchases | `Beat`, `CheckoutOrder`, `CheckoutOrderItem`, `BeatPurchase`, Beat Store APIs | Catalog, checkout, licence ownership | Yes | Add optional post-purchase Studio order relationship and upsell | Do not duplicate beat orders or licence state. |
| Beat licence documents | `BeatPurchase.licenseUrl`, `StoredAsset.beatPurchaseId`, licence routes | Canonical signed agreement/proof | Yes | Expose owned licence selector and attach purchase to Studio/release | Do not upload a second proof when HYMN already owns it. |
| Razorpay and webhooks | `lib/razorpay.ts`, checkout routes, `PaymentWebhookEvent` | Signature verification, captured-payment verification and replay handling | Yes | Add Studio payment records and webhook dispatch keyed by persisted order | Never trust browser amount/status. |
| Wallet and payout ledger | `WalletTransaction`, `ArtistPayoutBalance`, payout services | Immutable earnings, holds, releases and reversals | Yes | Credit engineer only after completion; snapshot commission | Avoid a separate Studio wallet. |
| Private assets | `StoredAsset`, `lib/private-storage.ts`, upload integrity helpers | Hashed private files and authorized streaming | Yes | Add Studio ownership relations/categories and ZIP/audio policies | Never expose source packages by permanent public URL. |
| Resumable upload | `UploadSession`, `/api/uploads/sessions`, chunk hashes | Chunked resume and verified assembly | Refactor | Generalize release-only foreign key into Studio order target | Do not create a parallel uploader. |
| Notifications/email | `Notification`, `EmailLog`, Resend services | Durable in-app and throttled transactional communication | Yes | Add Studio event keys/templates | Avoid chat-only business state and duplicate sends. |
| Audit log | `AuditLog`, admin audit APIs | Actor/action/before-after history | Yes | Record every Studio transition, payment, file, revision and handoff | Messages are not an audit substitute. |
| Reviews | `PurchaseReview` | Verified purchase review and moderation | Refactor | Add Studio-order review tied to completed work | Never show synthetic ratings/counts. |
| Distribution wizard | release form, draft APIs, `Release`, `Track` | Standard submission/QC lifecycle | Yes | Add idempotent Studio handoff prefill; no auto-submit | Never create a second release system. |
| Rights and licence linkage | `BeatPurchase`, `ReleaseTrackBeatLink`, rights fields | Licence provenance and DireNote proof | Yes | Handoff links purchase, maps General to non-exclusive, preserves Exclusive semantics | Do not infer copyright transfer. |
| DireNote asset delivery | `lib/distributor-asset-delivery.ts`, distribution service | Opaque provider-readable proof/file URLs | Yes | Use canonical licence asset and approved master | No public customer source files. |
| Admin portal | admin shell, RBAC and operational queues | Review, recovery and financial oversight | Yes | Add Studio order/engineer/config/dispute views | No unrestricted status override. |

## Resulting boundaries

Studio Services is a generic domain with Mixing & Mastering as the only initially active service type. `EngineerProfile` is a capability of `ContributorParty`; `StudioServiceListing` owns current commercial configuration; every `StudioServiceOrder` snapshots price, revisions, turnaround and commission. Messages, system events, assets, immutable deliveries, revisions, amendments, payments and status history are durable child records.

The customer pays against a server-created order. Engineer capacity is claimed transactionally. Work starts only after verified payment and acceptance. Two included revisions are consumed by server-assigned sequence numbers; later revisions require a captured payment record. Completion creates an immutable engineer earning and wallet credit. Cancellation/refund creates compensating records instead of deleting history.

The distribution bridge creates or reuses one customer release draft, references the approved master, selected `BeatPurchase`, its canonical agreement asset and the same contributor party for mixing/mastering credit. It pre-fills the standard wizard and never bypasses customer review or HYMN QC.
