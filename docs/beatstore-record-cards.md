# Beatstore record cards

Beatstore and public producer storefronts use `BeatStoreCard`. Producer dashboard cards retain `BeatCard`; the record-sleeve presentation is scoped to the store CSS module.

Square artwork rises on hover. On activation the sleeve rises and settles behind the record. The record rotates only while the shared audio player reports actual playback. Pausing retains the record's position. The sleeve and record share the same centre. Artwork appears only on the circular centre label; no outer artwork ring or centre play/pause overlay obscures it. The artwork remains an accessible playback button, with full controls in the shared player. Reduced-motion settings disable the movement while retaining controls and selected state.

The visible view count measures distinct signed browser/device identities that start a preview, not card impressions. Likes can be toggled without signing in and persist on the same browser. They are browser-level engagement counts, not verified unique people. A signed HttpOnly, SameSite cookie supplies an anonymous identity; the database stores its HMAC key, not a raw IP or email. Clearing cookies or using another browser creates a new identity. Public reads are batched; writes are rate limited, restricted to the app origin and idempotent. Only enabled, published/reserved beats expose counts. Historical counts are not fabricated or backfilled.

Cards show the actual licence price, without calculated comparison prices or unsupported timed-sale claims. Checkout pricing remains unchanged. Quick-add uses the same entry licence shown on the card, preventing a higher-priced default from appearing unexpectedly in the cart.

Licence selection has separate state from playback, so opening a licence for a different beat does not mislabel the currently playing audio or animate the wrong record.

Verification:

- `npm run test:beatstore` applies the actual migration to an isolated PostgreSQL fixture and checks persistent counts, concurrency, replay/unlike behavior, cookie signatures, publication scope and API guards.
- `npm run test:beatstore:browser` checks the real player and producer grid at 1440/768/390/320px: hover, sleeve reveal, rotation/pause, view deduplication, likes, actual prices, concentric alignment, absence of artwork rings and centre overlays, licence/playback separation and reduced motion.

Design reference: [Baymard pricing research](https://baymard.com/research-articles/product-page-price-discounts) recommends immediately visible prices and unambiguous promotional messaging.
