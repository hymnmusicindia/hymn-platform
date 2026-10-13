# Studio conversation, trust and discovery audit

## Product flow

Beat purchase → licence → optional readiness check / engineer / listening consultation → paid private project → source files → delivery → included or paid revisions → explicit client AND engineer confirmation → one settlement → verified client vouch → optional distribution draft.

A ready master can skip Studio. Beat-purchase handoff and Studio handoff preserve licence provenance and contributor credits. Distribution remains a separate explicit customer action.

## Changes and findings

- Replaced chat-triggered page refreshes with an optimistic outbox, stable retry keys and automatic visible-tab polling. The sender sees their message immediately; recipient updates poll every 2.5 seconds plus request time. This is not a WebSocket service.
- Added chronological verified payment receipts, private attachments, versioned final deliveries, revision tickets, paid scope changes and callback requests to the same conversation. Older messages have a history cursor rather than silently disappearing after 500 messages.
- Private-upload token issuance and completion re-check participant, role and project state. Finalization waits until the Studio attachment exists. A delivery uses newly attached files rather than accidentally reusing every historic file.
- Removed automatic completion. Each latest delivery records separate client and engineer confirmation. Revision requests reset confirmation. Financial settlement runs under a project lock and requires captured payments; duplicate confirmations do not credit the wallet twice.
- Locked initial, revision and amendment checkout creation so simultaneous clicks resume the same persisted payment. Retry-key lookups cannot return another customer's order. Project messages scope their retry key to order and author.
- Added provider refund idempotency and wait for a processed refund before recording it as refunded. All captured components must finish refunding before the entire order is marked refunded.
- Blocked completion during an unfinished accepted scope-change checkout. Scope changes cannot be paid on closed projects. Open disputes have a permission-protected admin audit view and resume/refund decision, with an audit trail and participant notifications.
- Corrected beat draft links from `draft=` to `resume=`. Serialized beat-draft creation and Studio handoff. An already-submitted release cannot have its audio silently overwritten. A ZIP delivery cannot be handed off as an audio master.
- Fixed discovery results to show the listings that actually match the requested filters.
- Added public community vouches, distinct from completed-project client vouches. Self-vouches and duplicate author/engineer records are rejected; community publication requires moderation. Public names require explicit opt-in; legacy client reviews remain anonymous. Reporting and withdrawal are supported.
- Artist-confirmed credits and mix breakdowns require rights attestation, confirmation by the credited artist, and moderation. Revocation removes the public page and share card. No private project audio is automatically published.
- Added before/after previews with synchronized playback and optional RMS-based level matching. Direct public audio, CORS permission and a 20 MB limit apply. This is approximate preview matching, not LUFS certification.
- Added share pages with generated Open Graph artwork for client vouches, community vouches and confirmed release credits.
- Added a visual self-assessment readiness tool, genre discovery, public profile evidence, repeat-client and timed-final-delivery statistics, short listening-call slots, owner availability/capacity controls and optional studio introduction links.
- Consultation booking is transactional, blocks self-booking and limits outstanding bookings. Phone numbers and briefs are visible only to the booked customer and assigned engineer; admin operations access remains permission controlled.
- Beat receipts include contextual Studio suggestions. Scheduled seven-day recommendations exclude revoked purchases, releases already started, active Studio projects and opted-out customers. Job state and email event keys prevent routine duplicate delivery. Optional recommendations can be disabled with a purpose-specific signed preference link.
- Sanitized database validation, duplicate and conflict errors before exposing Studio API responses.

## Research used

- [SoundBetter: project funding and client approval](https://soundbetter.com/faq/15-how-does-soundbetter-work)
- [Fiverr: delivery and revision lifecycle](https://help.fiverr.com/hc/en-us/articles/37552517993105-The-complete-guide-to-your-Fiverr-order-Statuses-and-process)
- [Fiverr: reviews after delivery and completion](https://help.fiverr.com/hc/en-us/articles/47050730700561-Leaving-and-managing-reviews-on-Fiverr)
- [Razorpay: idempotent normal refunds](https://github.com/razorpay/markdown-docs/blob/master/api/refunds/normal-refunds-idempotent.md)

HYMN deliberately requires both parties to confirm completion, as requested, rather than copying marketplace auto-completion windows.

## Verification and limits

The isolated PostgreSQL suite covers migration application, role/ownership checks, duplicate payments, concurrent revision requests, paid revision amount checks, mutual confirmation, once-only earnings, final-master retention, rights/credit handoff, self/duplicate vouches, public-name consent, artist permission and competing consultation bookings. Browser checks cover desktop, tablet and mobile rendering, horizontal overflow, history scrolling and optimistic sending with a delayed response. Production checks also exercise trust moderation, share artwork and permission withdrawal.

This is a targeted application and lifecycle audit, not a guarantee that the entire platform has no undiscovered vulnerabilities. Live payment/refund and SMTP delivery still depend on the configured providers. Source and superseded working assets retain the existing 90-day cleanup policy; conversation events remain in history. Engineers make their own rights attestations, which artist confirmation and moderation strengthen but cannot independently prove every underlying right.
