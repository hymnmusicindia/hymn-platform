# Artist store mapping before delivery

An artist name is not a store identity. The delivery payload builder now refuses to omit a saved Spotify/Apple identity when a same-name card exists in that customer's library but is not explicitly attached to the release/track. Select the intended card; names are never used to choose an unrelated profile automatically. The selected store URLs are included at both release and track level, including featured artists.

Valid stored Spotify/Apple IDs on older cards are preserved by deriving their artist URLs. An explicitly selected card never inherits stale Spotify/Apple links from legacy release metadata. Every saved store identity, including a secondary Apple identity when Spotify matches, must agree with the final payload.

After payload validation and before approval/submission claim, `verifyReleaseArtistMappings` checks each distinct exact saved store identity. Known provider artist IDs are looked up through `POST /check_artist`. The provider ID and artist name must match. Existing nonempty Spotify/Apple values must have the same store artist ID as the HYMN card; conflicting or malformed nonempty values block delivery and create an admin task and reconciliation discrepancy. An unavailable provider, expired check budget or exhausted request allowance also pauses delivery rather than proceeding without identity checks.

If a provider link is empty, HYMN sends only the missing Spotify/Apple fields through `POST /update_artist`. It never automatically replaces a different nonempty store identity, changes an artist name or clears a link. The operation uses the existing identity-tool lock and `v24_update_artist` audit format. An audit is committed before dispatch; a fresh read after claiming avoids overwriting a mapping another HYMN operation just set. Card edits, archived cards and conflicting cards sharing a provider ID stop the operation. Network requests have individual 10-second limits within a shared 45-second preflight budget.

A successful update acknowledgement is insufficient: another `/check_artist` request must prove the intended mapping. Timeouts, ambiguous failures and missing read-back proof remain `unconfirmed` and prevent another write or ingestion. Admins use the existing integration monitor's **Check recorded change — read only** reconciliation tool. Explicit provider rejection can be retried after resolution; rate limits respect the shared provider cooldown. No provider credentials enter customer responses or audits.

First-ingestion artists have no provider ID to query yet. Their chosen store URLs still travel in the ingestion payload. After synchronous ingestion returns an artist ID, HYMN performs the same mapping verification/fill and existing link enrichment. Completed asynchronous jobs bind the returned ID to the attached card for the normal scheduled artist refresh, which also verifies/fills empty provider mappings. Failure creates an admin task without repeating accepted ingestion. Existing hourly release/artist lookups still fill newly discovered, validated links into empty fields on the associated HYMN card. Saved store identities are never overwritten by a conflicting provider response.

This prevents HYMN from silently dropping a known profile or knowingly submitting with a conflicting stored mapping. It cannot guarantee Spotify's final placement or move previously delivered tracks. Already split catalogues require provider/Spotify correction. This change does not submit any correction for Deepan's existing releases or mutate live provider profiles during testing. No database migration is required.

Reference: [DireNote API documentation](https://distribution.direnotemedia.com/dnm_api), checked 22 October 2026 (`check_artist`, `check_release_status`, `update_artist`).

Validation:

```
node --import tsx scripts/verify-acquisition-isolated.ts --artist-mapping-only
node --import tsx scripts/verify-direnote-field-mapping.ts
node --import tsx scripts/verify-direnote-contract.ts
```

The database fixture uses intercepted provider requests and a disposable PostgreSQL instance. It covers missing-field update/read-back, repeat polling, conflicting links/names/IDs, concurrent card edits, uncertain writes, acknowledged-but-unverified updates, missing card association and release/track Spotify URL propagation. It sends no live ingestion or messages.
