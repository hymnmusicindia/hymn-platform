# Royalty agreements and artist handles

## Product flow

An active signed-in account can find another active account by exact email or full `@name#1234`. Search returns only public name, handle and avatar; it does not publish a searchable email directory. The profile menu displays a copyable handle and lets its owner change the name and four-digit discriminator. Tags are lower-case and globally unique. Previous tags stay reserved to the original account. Invitations use immutable user IDs, so renaming cannot transfer an invitation.

Release owners create whole-release or individual-track agreements. Every artist, including the owner, receives an explicit share; the owner share is accepted automatically. Other collaborators review the release, role, percentage and note, and explicitly accept or decline. The optional private-code path requires the original code for acceptance, is single-use and expires after ten hours. Invitations and responses create in-app messages within the same database transaction. Email attempts use the existing transactional email logs and retry tools, with a unique key for every invitation. API responses report email delivery status separately from invitation success.

Agreements become active only when all participants accept and payout shares total exactly 100%. Pending invitations reserve their proposed percentage. Declines, withdrawals and expired codes release it. Percentages support two decimals, with up to 100 active collaborators per agreement. An artist cannot receive duplicate active shares within one agreement. Owners can cancel an unallocated agreement; affected artists receive in-app cancellation notices and replacement agreements require fresh acceptance. Once allocated, agreements lock. A future amendment uses a new agreement and a future statement month; old versions continue to govern earlier months.

## Financial boundaries

New royalty imports allocate and credit within the same transaction as the royalty record. Track agreements take priority over release-wide agreements. Only active/locked agreements effective for the statement month apply. Incomplete agreements use the existing owner payout path. Historical owner-paid statements cannot be retrospectively recalculated into a new agreement. Existing split allocations return their existing ledger entries without crediting again.

Largest-remainder allocation conserves the royalty pool in integer cents, including very small pools. Unverified payout profiles retain earnings as pending; manual verification releases them exactly once. User and earning row locks serialize verification, allocation and reversal. Each credit and reversal has an idempotency key. Administrative reversals remain auditable. No historical balances are automatically rewritten by this migration.

This module allocates the platform's artist royalty pool after HYMN fees. It does not submit publishing ownership or songwriter registrations to collecting societies.

## Audit findings addressed

- Concurrent invitations previously checked totals before the transaction.
- Acceptance and revocation previously used stale invitation states.
- Split codes could previously be accepted by invitation ID without code proof.
- Held earnings matched recipient names, risking identity collisions; that unsafe reassignment path was removed.
- Re-invitation email/notification keys previously reused agreement and email identifiers.
- Withdrawn and expired invites could leave stale allocated totals.
- Split allocation and royalty import previously used separate transactions; pending agreements could suppress the owner payout path without allocating any split.
- Profile existence previously allowed credit before verification.
- Recalculation and administrative reversals now have explicit replay protection.
- Held earning release now records a monetary wallet credit, consistent with payout balances.
- Collaborators receive scoped release/statement data rather than full owner metadata.

## Validation and deployment

`node --import tsx scripts/verify-splits-isolated.ts` starts an isolated embedded PostgreSQL database, applies the identity migration against the previous schema, and verifies authorization, concurrent percentages/responses, uniqueness, reservation, notification deduplication, code proof and replay, verified payout release, allocation/reversal idempotency, future version selection and rounding. All emails are disabled.

`node --import tsx scripts/verify-splits-browser.ts` requires a local Next preview on port 3015. It temporarily creates a fixture route and removes it on completion. API responses are mocked. Tests cover desktop, 390px and 320px, search, payloads, consent, code proof and handle editing.

Deploy additive migration `20261011120000_artist_handles` before serving the new code. Handles are assigned lazily when a user opens their profile or is found by email. New accounts do not require a separate backfill. Existing split/royalty records are preserved.

## Research

- TuneCore Splits: invitation acceptance, dashboard visibility and collaborator shares: https://support.tunecore.com/hc/en-ca/articles/12251710747156-TuneCore-Splits
- DistroKid Splits: explicit allocations and invitations: https://distrokid.com/cs/product/splits and https://support.distrokid.com/hc/en-us/sections/360004389234-Splits
- Discord identity reference: https://support.discord.com/hc/en-us/articles/12620128861463-New-Usernames-Display-Names. Discord itself retired discriminator tags; HYMN deliberately implements the editable name plus four digits requested for this product.
