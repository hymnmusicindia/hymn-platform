# Playlist review marketplace

## Product decision and research

This is a paid **listening and feedback** marketplace, not paid playlist placement.
HYMN's four existing Services playlists are seeded at **₹50 per track review**:
Dusk Till Dawn, Fresh Releases, Indie Hits, and Ungatekept Gems. Independent
curators choose their own review fee (₹10–₹10,000), subject to listing approval.
There are no paid placement durations, placement auctions, guaranteed streams,
or guaranteed positive opinions. A shortlist has no placement entitlement.

Spotify explicitly prohibits services selling guaranteed playlist placement:
[Spotify artist policy](https://support.spotify.com/uk/artists/article/third-party-services-that-guarantee-streams/).
The review/response model is informed by
[Groover's submission and feedback workflow](https://help.groover.co/en/articles/2966453-how-to-use-groover-for-the-first-time).
These are product-policy references, not legal approval of HYMN's implementation.
The public `/playlist-review-terms` page should receive independent legal review;
it deliberately does not promise immunity from mandatory legal duties.

## Surfaces

- `/dashboard?tab=promotions`: catalogue, curator filters/search, submission form,
  secure checkout, feedback history, dispute forms, and Curator studio.
- `/admin/playlist-reviews`: `services.manage` approval, moderation, HYMN reviews,
  dispute resolution, and settlement recording. Recording a transfer additionally
  requires `payouts.mark_paid` and verified existing payout credentials.
- `/playlist-review-terms`: versioned buyer/curator terms, editorial independence,
  third-party disclosures, research warning, deadline/refund/dispute rules.
- Existing non-playlist promotion enquiries remain available below the marketplace.

No audience counts, genres, testimonials, Spotify ownership, or results are fabricated.
Playlist links and HYMN covers come from the existing Services catalogue. Covers
use small 480px WebP derivatives, not the multi-megabyte originals. Gradient fallback
artwork illustrates independent listings rather than pretending to be Spotify artwork. Independent ownership is
verified manually before approval; an application declaration is not verification.

## Persistence and lifecycle

`PlaylistReviewListing` owns fee, owner, approval, capacity and playlist identity.
`PlaylistReviewRequest` snapshots fee, terms version, submitted music and pitch;
it holds unique gateway identifiers, deadlines, feedback, refund and settlement state.
`PlaylistReviewMail` is an idempotent transactional outbox. Existing audit logs
record applications, pricing, payments, decisions, disputes and settlements.
SQL adds foreign keys to real users and constraints for pricing and delivered feedback.

```text
approved listing → awaiting payment → verified captured payment → in review
                                                               ├→ shortlisted
                                                               ├→ not a fit
                                                               └→ deadline missed → refund pending → refunded
completed review → seven-day dispute hold → manual verified settlement
artist concern / provider dispute → disputed → support resolution / refund
```

The review clock starts at payment time, never at playlist inclusion. A curator
must listen, leave at least 30 characters of specific feedback, and provide an
actionable next step of at least 10 characters for either decision. Customer copy
frames a decline as a playlist/audience mismatch, not a judgement of talent.
Reports address abusive, fabricated or non-substantive feedback; minimum text
length alone is not proof of a quality review.

Pricing changes affect future orders only. Active-review capacity includes unpaid
reservations made in the last 30 minutes. Curators cannot approve themselves,
review someone else's submissions, buy reviews from themselves, or alter fees on
HYMN listings. Pausing a listing stops new submissions but preserves existing duties.
No marketplace commission is charged at launch. Gateway costs are not added at
checkout. Tax/accounting treatment and manual settlements require operational review.

## Payments, refunds and retries

Checkout amounts come from persisted listings, not the client. A customer-supplied
UUID makes creation retryable; reuse with different submission details is rejected.
The server verifies the Razorpay signature, fetches the payment, and checks captured
status, amount, INR currency, order binding and customer ownership. Only then is a
review opened. Callback loss is covered by signed webhooks and scheduled order
reconciliation. Unpaid orders never enter the listening queue or earn a curator fee.

The webhook router recognises this product before the legacy product dispatcher.
Missing new tables during a rolling deployment do not block unrelated legacy orders.
Refund/provider-dispute events freeze or cancel earnings. Late webhook duplicates
do not open another review. Partial external refunds require support investigation;
they are not silently treated as authority to refund an entire order.

Missed deadlines queue a full refund to the original payment. Before another refund
request, automation fetches existing refunds to recover a lost provider response.
Pending refunds are polled rather than duplicated. A processed full refund is
persisted before notifying the artist. Curator fees remain held for seven days after
delivery, and an open dispute freezes settlement. A settlement entry requires an
actual external transfer reference; the app does **not** initiate bank transfers.

## Automation and email

`GET /api/cron/playlist-reviews` requires the existing server-only `CRON_SECRET`.
A ten-minute database lease prevents overlapping runs across replicas/schedulers.
Work is bounded by batch sizes and a four-minute budget. The run reconciles pending
payments, expires deadlines, processes/polls refunds, sends a one-day reminder,
and drains the branded transactional-email outbox with bounded retries.
Queued email is recorded atomically with its business event. Failed/skipped sends
remain pending; a duplicate failed email log is not mistaken for delivery. Eight
failed attempts need operator attention through email logs/outbox inspection.

The standard Hostinger `npm start` entrypoint invokes the protected endpoint after
a startup delay and every 15 minutes while the process is running. Disable this
fallback only when an external scheduler is confirmed:
`PLAYLIST_REVIEW_AUTOMATION_ENABLED=false`. `vercel.json` also schedules every 15
minutes; the shared lease makes concurrent invocations safe. This is not a durable
scheduler when the server is stopped: use a Hostinger system cron for independent
uptime if available. Deadlines are persisted and overdue work catches up after restart.

Emails cover submission receipts, curator assignments, upcoming deadlines,
constructive review results, listing moderation, disputes and refunds. Curator
assignment links open the relevant workspace; HYMN assignments use the admin desk.
No add/remove instructions are sold as part of the review service.

## Release and verification

The additive migration is `20261014190000_playlist_reviews`. Deploy using the
existing guarded `scripts/deploy-production-migrations.ts` owner-credential path,
never `db push` against production. This migration seeds the four known HYMN playlists.
Generated Prisma clients must include the new models before new routes are used.

Run:

```sh
node --import tsx scripts/verify-playlist-reviews-isolated.ts
node scripts/verify-playlist-review-ui.cjs
node --conditions=react-server --import tsx scripts/verify-playlist-review-routes.cjs
node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit
```

The isolated test uses embedded PostgreSQL, the pre-feature schema plus the actual
migration, and mocked Razorpay methods. It does not charge real cards, refund real
payments, email customers, or create fake production submissions. UI tests exercise
desktop/mobile discovery, fee displays, filtering, form focus and decline feedback.
Operational rollout still needs a real authorised small-value payment/refund smoke
test and confirmation that the deployed Hostinger startup loop is logging successful
runs; these are not inferred from a local build or a Git push.
# Catalogue-linked pricing (15 October 2026)

Submission defaults to the signed-in customer's live, approved, under-review and delivery-stage HYMN tracks. The server loads
the selected recording and its parent release, verifies ownership and eligible release status,
and uses canonical title/artist values. HYMN playlists charge ₹50 for these verified
catalogue selections, ₹80 for external submissions. Independent playlist fees remain
curator-controlled. Spotify recording links are required for listening in both paths;
selecting a catalogue track does not claim to independently verify an external URL.

Checkout creation appends track/release IDs and source to the immutable audit trail.
Retries cannot switch the linked track or source under an existing request key.
Amounts remain snapshotted on requests/orders; payment verification, refunds and
settlement use the original amount, never current pricing. No schema migration is
required. Terms version is `playlist-review-2026-10-15-v2`.

