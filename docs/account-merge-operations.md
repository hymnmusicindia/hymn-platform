# Approved customer-account merge

The operator path is `scripts/merge-deepan-accounts.ts`, backed by
`lib/account-merge.ts`. It is not a public API. Production identity is checked
against HYMN's canonical database/branch, and the operator supplies both user IDs
and expected SHA-256 hashes of their current normalised email addresses. Without
`--apply`, it performs a locked read-only inventory and conflict check.

Before applying, the operator checks the live authentication readiness endpoint
reports `accountMergeGuard: v2`. Sign-in/signup and merging share email-identity
advisory locks, preventing a concurrent login from resurrecting a retired account.
Retired email and Google identities are blocked using hashes in the immutable
`ACCOUNT_MERGED` audit event. Password signup, Google login and password login all
check this guard. Session issuance rejects merged tombstones; legacy cookies are
also checked, and database-backed sessions must match their signed user ID.

## Merge policy

- Only active CUSTOMER accounts with matching roles are supported.
- The destination must not own business records. Initial sessions, audit history,
  handles and handle reservations are allowed; other destination data is a blocker.
- Retain the destination's email and Google identity. Retain its password if set;
  otherwise preserve the source's existing password credential on the destination.
- Preserve the established source profile, referral code, account age, preferences,
  and primary handle. Both existing handle reservations belong to the destination.
- Transfer every populated database foreign key to `users`, except protected audit
  actors. Also transfer reviewed non-FK ownership in acquisition events, contribution
  creation and contributor-name history. Unknown non-FK references stop the merge.
- Preserve release/track IDs, UPCs, ISRCs, statuses, file paths, asset checksums,
  payment/order IDs and subscription IDs. Only their owner reference changes.
- Preserve the subscription's complete row apart from `userId`: dates, limits,
  usage, provider references and renewal state must compare exactly after transfer.
- Revoke all existing sessions from both accounts. Fresh destination sign-in is required.
- Keep the source user ID as a BANNED, invisible, anonymised tombstone for its
  immutable audit references. Remove its actual email, Google ID, password, profile,
  mobile, DOB, referral code and spendable credits. It cannot sign in or receive data.
- Never disable audit triggers, update/delete audit entries, or relabel their actors.
  Original audit rows are hashed before/after to verify byte-equivalent preservation.

## Retired email and rollback safety

The operator scans all live text, JSON and array columns for the retired address.
Unexpected occurrences stop the merge. Historical sent-email recipient fields and
provider request snapshots are anonymised rather than falsely asserting those
historical messages used the new address. Failed/queued email recipients are
redirected to the destination. Historical external emails/provider records and the
contents of existing copyrighted files are not erased by a HYMN database merge.

Before mutation, an AES-256-GCM encrypted rollback snapshot is written to a private
OS temporary directory outside Git. Its key derives from an existing protected
`ACCOUNT_MERGE_BACKUP_KEY`, `PAYOUT_ENCRYPTION_KEY` or `JWT_SECRET`; no plaintext
credentials or old email are written to an operator log or committed backup.
The snapshot records user rows, affected business rows and scrubbed historical rows.
It is retained for recovery; restoring it requires manual conflict checks, especially
if the destination has performed new business operations after the merge.

All mutations and assertions run in one serializable transaction. A mismatch or
database constraint failure rolls back the entire transfer. After commit, verify
the active destination, subscription, owner counts, retired-login rejection and
absence of source-owned operational data again from a fresh connection.

## Verification

```sh
node scripts/verify-merged-account-identity.cjs
node --import tsx scripts/verify-account-merge-isolated.ts
```

The isolated PostgreSQL test enforces the production presence-status CHECK and
append-only audit triggers. It verifies dry runs, destination-conflict rollback,
unchanged subscriptions, release/asset/credit transfer, destination Google identity,
primary/reserved handles, session revocation, encrypted backup, audit preservation
and retired-email/Google blocking. No real customer account is used by these tests.
