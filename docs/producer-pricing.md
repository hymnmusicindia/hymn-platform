# Producer-controlled beat pricing

Producers can set MP3, WAV, stems and exclusive prices separately from Upload Beat or Edit Beat. MP3 defaults to INR 120 for existing listings but is no longer fixed. `mp3_price_cents` stores MP3; the existing `price_cents` remains stems. Storefront/cart and server checkout quotes use the saved MP3 value. Existing purchases and receipts are not repriced.

Price-only saves preserve publication/review status. Metadata edits (including musical key and rights declarations) still require review. Ownership checks remain in place. Partial tier updates validate against existing values, so an exclusive price cannot become invalid by changing only another tier. Amounts are finite, bounded and limited to two decimal places; zero-priced non-MP3 tiers remain unavailable at checkout.

Migration `20261015210000_producer_mp3_pricing` is additive. It was deployed through the configured owner migration credential after confirming it was the only pending migration and there were no failed migrations. No beat-specific prices, ownership, publication states, payment records or Team OS tables were changed in production.

Verification: isolated PostgreSQL migration and persistence tests passed; the actual PATCH handler was exercised with fixture authentication, validating producer ownership and published price-only edits. Saved prices remain independent, server price calculations match the edited MP3 amount, invalid precision/negative values are rejected, and merged partial updates are validated. TypeScript passed. Targeted new-code lint passed; existing UI files retain pre-existing warnings. The older producer lifecycle source-text test fails on a producer-profile assertion already absent from the unchanged baseline; no unrelated producer identity code was modified.

Run `node --import tsx scripts/verify-producer-pricing-isolated.ts` to repeat the isolated tests. It uses only loopback port 55462 and `pricing_fixture`. After deployment, smoke-test Edit Beat as the producer and confirm the public storefront and checkout quote show the saved amount. Setting prices does not upload missing audio or replace format/rights review.
