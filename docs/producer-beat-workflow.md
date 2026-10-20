# Producer beat publishing

The first beat requires manual approval. Approval and a durable `producer.beats_auto_publish_unlocked` audit event are recorded in one transaction. Existing published, reserved or exclusively sold inventory qualifies as previously approved; the first automatic publication preserves that eligibility in the audit ledger. Deleting the approved beat does not revoke the recorded unlock.

Subsequent complete original beats publish immediately for active producers with completed, unrestricted storefronts. Metadata and cover updates use the same publication check. Unlisting is preserved. Correction requests, archived/sold/reserved inventory, incomplete assets and restricted accounts cannot bypass review. Automatic publication records its own audit event. Existing pending beats are not bulk-published by deployment.

Upload and edit forms share expanded genre/mood menus and canonical major/minor keys. Up to three moods are stored in the existing mood string, separated by commas; store filters split the values so each mood can match independently. Existing key abbreviations are normalized on save and in the storefront, without rewriting historical records in bulk.

Producers declare original material, licensed samples, or unresolved sample clearance. Licensed samples require source/permission details and a private PDF licence/certificate (10 MB maximum). The PDF is linked by generic asset entity metadata, leaving the unique beat/master relationship intact. Only the producer and authorized reviewers can access it. The review screen links to the certificate. Explicit declarations are audited. Licensed samples still require a rights review; unresolved clearance blocks approval. New exclusive licence snapshots exclude Content ID when third-party samples are declared.

No database migration is required. Deploy the application changes together.

Verification:

```sh
node --import tsx scripts/verify-direnote-virtual.ts --producer-workflow-only
node --import tsx scripts/verify-producer-setup-browser.ts
```

The database test uses an isolated PostgreSQL fixture and exercises actual upload/approval handlers, publication eligibility, private evidence access and validation. Browser checks exercise the producer shell at desktop/mobile widths, mood limits, key/genre controls, licence evidence, retry behavior and setup navigation.
