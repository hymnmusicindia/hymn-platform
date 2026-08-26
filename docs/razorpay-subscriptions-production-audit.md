# Razorpay Subscriptions production audit

## Result

Recurring HYMN products (`half_yearly`, `yearly`, `yearly_plus`) now use Razorpay Subscriptions as billing authority. One-time distribution, add-ons, General Beat licences, and Exclusive Beat licences continue to use Razorpay Orders.

The former flow created a normal order and fabricated a local expiry period after payment. That activation path was removed. Existing local subscriptions are retained as legacy/manual entitlements and are not assigned invented provider identifiers.

## Canonical flow

1. Browser sends only a HYMN product key.
2. Server resolves the active immutable plan version and server-owned amount.
3. Server creates a Razorpay Subscription and persists ownership before returning its ID.
4. Checkout uses `subscription_id`.
5. The callback signature is verified as `payment_id|subscription_id` and ownership is checked.
6. Razorpay is fetched for authoritative state; lifecycle webhooks remain the ongoing source of truth.
7. HYMN grants local features from the synchronized subscription and consumes release allowance idempotently per release.

## Webhook configuration

Configure the existing `/api/webhooks/razorpay` endpoint with the same `RAZORPAY_WEBHOOK_SECRET` used by Hostinger. Enable:

- `subscription.authenticated`
- `subscription.activated`
- `subscription.charged`
- `subscription.updated`
- `subscription.pending`
- `subscription.halted`
- `subscription.paused`
- `subscription.resumed`
- `subscription.cancelled`
- `subscription.completed`
- `payment.captured`
- `payment.failed`

The shared event table deduplicates provider event IDs and payload hashes. An atomic processing claim prevents concurrent replay. Subscription payments are unique by Razorpay payment ID.

## Required Hostinger variables

Create the three plans in Razorpay Dashboard and set:

```text
RAZORPAY_PLAN_HALF_YEARLY=plan_...
RAZORPAY_PLAN_YEARLY=plan_...
RAZORPAY_PLAN_YEARLY_PLUS=plan_...
```

Keep the existing Razorpay key, secret, public key, and webhook secret. Optional release-limit and total-cycle overrides are documented in `.env.example`.

## Deployment

Run `npx prisma migrate deploy` against production Neon before starting the new application build. Do not delete or rewrite existing `subscriptions` rows. New provider fields are nullable specifically to preserve those records.
