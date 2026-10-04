# First-release campaign audit — 4 October 2026

Scope: `/first-release`, its historical redirect, authentication handoff, upload drafts, resume links, review, checkout, redemption, corrections, customer badges and distributor status handling.

## Changes

- Persist the campaign marker and whitelisted UTM attribution when the first upload draft is created, including drafts with no tracks yet. Reject an unavailable campaign claim rather than silently creating a normal paid draft.
- Resume the customer's existing campaign draft from the landing page. Campaign parameters cannot replace the intended campaign or inject another draft ID. Refresh account eligibility after Google authentication.
- Distinguish an unavailable campaign from an already-used offer. Restore saved attribution when a customer resumes from the dashboard.
- Explicit campaign claims use the free Single offer without consuming an active subscription's release allowance. Normal subscription submissions do not receive a misleading free-offer label.
- Keep FREE RELEASE visible through draft, review, correction and scheduled states. Remove it once live, partially live, distributed, taken down or archived. Preserve the marker when a redeemed release is reopened as a draft.
- Save draft metadata and tracks atomically under the submission lock. Preserve track IDs and linked assets, recheck owner/status inside the transaction, and invalidate review confirmation on edits.
- Serialize client autosaves, wait for pending saves and persist the complete latest release before confirming review. Store durable artwork URLs rather than browser preview URLs. Do not send draft autosaves against correction-only releases.
- Count active reservations against campaign capacity. Validate/reserve the free entitlement before confirming a zero-value order. Preserve/recover redemption when submission has already persisted instead of releasing its reservation after an error.
- Use submission history as well as current status for eligibility, so reopening a previously submitted release as a draft cannot unlock another first-release gift.
- Keep redeemed corrections within one Single and the original purchased services. Ordinary corrections reuse the original entitlement; they neither create another payment nor consume another promotion. Show “No additional payment” on their review screen.
- After customer corrections return to HYMN review, admin approval recognizes the resolved provider correction and sends a new payload. It no longer mistakes the original accepted submission for a completed duplicate.
- Use first-release submission wording instead of telling a zero-payment customer that a payment was confirmed.

## Verification

Commands:

```text
npm test
npm run test:distribution-pricing
node --import tsx scripts/verify-direnote-virtual.ts --build --checkout-only
```

The isolated runner creates a disposable local PostgreSQL database, builds the production application, and uses fixture payment/distributor servers. Coverage includes:

- Empty campaign drafts and desktop/mobile resume URLs.
- Canonical save, server review confirmation, zero-value submission and replay.
- Duplicate first-release rejection and optional paid add-ons.
- Correction eligibility, retained tags, reopened drafts, and prevention of extra tracks/unpurchased services.
- Same-account and cross-account reservation races, campaign limits, stale reservations, campaign deactivation and deleted unfinished drafts.
- Stable track identity and rejection of autosaves after submission.
- Existing payment, subscription, upload, review and distributor lifecycle regressions.

Google sign-in uses the existing authentication integration; automated browser checks use fixture sessions. External services are mocked: these checks do not submit a real release to stores, charge a card, or confirm the deployed production environment. No customer records or environment credentials are changed by this audit.
