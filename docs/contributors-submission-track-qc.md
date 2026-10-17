# Clear credits, responsive submission and track-level corrections

## Contributor editor

Desktop and mobile use the same single-open accordion. Each role shows its required name type, completion state and a saved-name summary. The first incomplete role opens initially; completed credits start collapsed. Opening another role closes the previous one. Done collapses a completed role; switching roles also collapses the previous section. Typing and moving focus never collapse an editor mid-click or discard input. Add reopens its role. Optional rights/social details use a separate disclosure. Existing identity linking, multiple contributors, apply-to-all and full legal-name validation are preserved.

Touch fields are at least 48px with 16px text. Keyboard users get labelled expanded states, associated panels and visible focus. Research: [W3C accordion pattern](https://www.w3.org/WAI/ARIA/apg/patterns/accordion/) and [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/).

## Submission critical path

Payment/captured-payment, owner, amount, entitlement, review snapshot, rights and persistence checks remain synchronous. Provider readiness/assets, notifications, analytics and confirmation mail no longer block the response. The paid release atomically persists `autoQc.status = pending`; `after()` starts readiness and the existing submission lock/attempt protocol handles delivery. The existing scheduled release worker recovers pending QC as well as QC-passed handoffs. A failed readiness check stays paused rather than bypassing QC. Background metadata updates patch only the QC key and require the same release edit timestamp, so concurrent customer edits are not overwritten.

Opening a saved release now fetches that owned record directly, not the customer's entire catalogue. This also improves submitted-page return latency. No fixed percentage speed-up is promised: payment gateway, database, connection and media-upload time still vary. The expensive provider-readiness work is removed from acknowledgement latency, not skipped.

## Playlist invitation and Back

Submission replaces the editor URL with the owned submitted URL and synchronizes Next navigation state. The curation invitation uses a normal same-origin document link; returning with browser Back restores the submitted document or reloads its persisted confirmation. The server still checks ownership/payment/submission state; URL parameters alone never prove submission. Browser regression verifies invitation → playlists → Back → submitted screen.

## DireNote correction details

`check_release_status` supplies review remarks; `check_qc_report` supplies stored per-track ACR/ISRC/UPC analyses. Status synchronization enriches actionable review requests with the QC report. Responses must confirm the requested UPC. Reports are cached for one hour by release, submission attempt and review fingerprint, within the shared provider request budget/cooldown. A failed enrichment never discards the original correction remarks.

Only explicit failed checks with actionable messages become customer correction fields. Scanned=false, ACR matches and successful lookup messages are not automatically violations. ISRC/provider ID/unique title mapping attributes reordered EP rows to the correct local track; conflicting identities never fall back to an unrelated positional track. Labels include the track number and title. The existing correction fields, customer dashboard, notification, review and resubmission pipeline receive these issues, with fingerprint deduplication. Raw QC evidence remains in the restricted provider audit log, not an unfiltered customer payload.

Verification uses isolated PostgreSQL and mock providers only: reordered EP reports, conflicting identities, false-positive avoidance, report cache, notification deduplication, pending-QC scheduled recovery, payment/entitlement guards, responsive contributor editing and playlist Back navigation. No live catalogue write, customer email or real payment is performed by these tests. No schema migration is required.
