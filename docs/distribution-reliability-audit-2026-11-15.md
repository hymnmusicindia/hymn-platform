# Distribution reliability audit — 15 November 2026

## Reported incidents

- NOCTURNAL #227, 19 tracks, remained UNDER_REVIEW after approval requests around 12:35–12:39 IST.
- The admin Rights tab accumulated whole “Attached rights evidence” sections on refresh.
- Old NOCTURNAL #193 remained visible alongside the replacement.

## Evidence and causes

The production audit recorded APPROVE_RELEASE_STARTED at 12:34:49 and 12:37:05 IST. Each was followed by ARTIST_MAPPING_DELIVERY_PAUSED at 12:36:04 and 12:38:20 IST, respectively, with “Artist mapping verification timed out.” No submission attempt or partner acknowledgement existed for #227. Artist identity verification processed the album’s unique artists sequentially under one shared 45-second deadline; the human approval was saved only after this slow work. A gateway response could therefore leave the release in review and conceal the actionable error.

The duplicated evidence was reproduced in the complete admin component, not its standalone preview. The evidence component and submission history were siblings using the same numeric release ID as their React key. Background parent updates retained orphan evidence sections. Distinct, namespaced keys and integration tests address that reconciliation failure. The earlier bounded preview change alone did not resolve this parent-level collision.

## Changes

- Approval now saves a signed, version-bound manual QC decision and delivery queue atomically before any partner lookup. The UI receives a truthful queued acknowledgement rather than waiting for artist verification or claiming partner receipt.
- The worker can start a verified queued package with no prior submission attempt. Rights-document checksums, audio and artwork bind the approval to the reviewed sources. Source checks are read in one database batch.
- All artist associations are validated before provider I/O. Unique artists are checked with concurrency capped at three and a shared bounded deadline. Failure stops new work and drains active checks before releasing the delivery lock.
- Temporary preparation failures back off, with a maximum of five preparation failures before review. Identity conflicts, changed sources and unresolved provider writes retain their review/reconciliation safeguards. Existing idempotent ingest attempts remain authoritative.
- Audited review-signature recovery is restricted to authenticated operations, an exact queued version, a trusted human status transition, an unchanged package and immutable private sources. It cannot manufacture a review from unsigned metadata or replay an existing submission.
- The operations UI has one compact workspace navigation, an inline catalogue toolbar, a narrower queue beside a larger review pane, approval actions near the top, and collapsed QC/submission history. Rights evidence renders once and unmounts on tab switches.
- #193 was archived at the user’s request, retaining source files and provider/audit history. No provider cancellation or shared-file deletion was performed.

## Verification

- Real isolated PostgreSQL integration: durable manual approval, root-admin signing, readiness blockers, stale-version rejection, repeated approval, no-attempt recovery, source checksum changes, retry backoff, unresolved attempts, audited signature recovery and fabricated checkpoint rejection.
- Nineteen-artist preflight: deduplication, concurrency cap, validation before I/O, new identities, failure short-circuiting and draining active work.
- Full admin browser integration in light/dark themes at 320, 390, 768 and 1440 pixels: forty parent refresh cycles, repeated Rights/Summary switches, one evidence section, catalogue/QC/delivery navigation and no horizontal overflow.
- Manual QC browser checks: permissions, confirmation targeting, payment/readiness presentation and non-JSON HTTP 502 handling without an automatic duplicate write.
- Distribution policy checks and TypeScript checks.

Partner acceptance and live availability remain distinct milestones. Production delivery results must be confirmed from the current attempt and provider acknowledgement, not inferred from a queued status.
