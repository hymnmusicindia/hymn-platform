# Studio Services industry benchmark

Research date: 2026-09-23. Public product/help documentation was reviewed; competitors are evidence for user expectations, not templates to copy.

| Source | Practice | Why it exists | HYMN decision | Rationale |
| --- | --- | --- | --- | --- |
| SoundBetter payment terms and workroom | Customer pre-funds work; provider starts after funding; customer approval releases payment | Protects both sides and keeps evidence on-platform | Modify | HYMN records captured funds as held, then releases engineer earnings only on approval/completion. Razorpay is not represented as regulated escrow. |
| SoundBetter provider marketplace | Curated specialists, portfolio samples, explicit service/turnaround and verified reviews | Reduces wrong-fit hiring and remote-work anxiety | Adopt | Engineer cards show only persisted genres, services, portfolio, availability, turnaround and completed-order reviews. |
| SoundBetter additional payments | Scope can expand inside the workroom through an additional payment request | Prevents informal scope creep | Adopt | `StudioAmendment` snapshots requested scope and amount and activates only after customer approval/payment. |
| SoundBetter communication guidance | Frequent workroom communication and durable exchange/file records | Remote creative work needs context and dispute evidence | Adopt | Messages coexist with system events, timeline, files and status; they do not own business state. |
| BeatStars Services | Generic service listing with title, category, description, tags, fixed/inquiry pricing and collaborators | Supports creative services beyond one hard-coded product | Modify | Generic listing schema, initially exposing only Mixing & Mastering; fixed server pricing first. |
| Upwork fixed-price milestones | Funded work, one active stage, explicit deliverable/review, mutually visible scope changes | Controls payment and scope transitions | Modify | HYMN uses an order/delivery/revision state machine rather than general milestones; amendments require explicit acceptance. |
| Upwork review window | Customer review period followed by policy-driven automatic release | Prevents orders remaining unresolved forever | Modify | Store `autoCompleteAt`; notification/escalation precedes completion, and disputes stop settlement. |
| Fiverr delivery/revision pattern | Delivery is a distinct action; revision returns the order to active work | Separates chat attachments from contractual delivery | Adopt | `StudioDelivery` is immutable and versioned; only an active delivery can be approved or revised. |

## Practices rejected

- Synthetic ratings, order counts, availability, discounts or crossed-out prices.
- Starting work before verified funding.
- Releasing full engineer earnings merely because a file was uploaded.
- Treating ordinary chat attachments as contractual delivery.
- Client-controlled revision numbers, price, discount, capacity or status.
- Permanent public source-file URLs or off-platform contact/payment prompts.
- Forcing engineer selection into the primary Beat checkout; the main upsell follows successful licence generation.

## Product policy chosen

HYMN uses captured payment with an internal held/available ledger lifecycle, not “escrow” wording. Engineer acceptance expires if unanswered; declines/timeouts enter refund review. Two revisions are included by the listing snapshot. Revision three and later each require the snapshotted additional-revision price. Final approval completes the order, releases the snapshotted engineer share once, and enables an idempotent distribution handoff.
