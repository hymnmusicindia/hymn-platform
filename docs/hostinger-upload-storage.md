# Hostinger upload and managed storage

HYMN release masters now use database-backed resumable upload sessions and a single local provider. `StoredAsset` remains the canonical asset record; its relative path is portable and its protected `/api/assets/:id/download` URL does not expose customer or release names.

## Storage tree

```text
/home/u390865851/private-storage/
├── Customer Assets/
│   ├── Single Title - rel_123/
│   │   ├── Cover Art/cover-original.jpg
│   │   ├── Audio Files/Track Title - trk_456.wav
│   │   └── Other Assets/
│   └── Album Title - rel_789/
│       ├── Release Assets/Cover Art/cover-original.jpg
│       ├── 01 - Intro - trk_101/Audio/master.wav
│       └── 02 - Home - trk_102/Audio/master.wav
├── Producer Assets/
├── User Assets/
├── Documents/
└── Temp Uploads/{upload-session-id}/00000.part
```

Titles are presentation only. Every managed folder includes a stable release, track, or client-track identifier. Renaming or reordering does not change an existing `StoredAsset.relativePath`.

## Hostinger deployment

1. Use the verified persistent directory `/home/u390865851/private-storage`, which is outside both `hbuilds` and `public_html`.
2. Set `HYMN_STORAGE_ROOT=/home/u390865851/private-storage`, `PRIVATE_STORAGE_ROOT=/home/u390865851/private-storage`, and `STORAGE_ROOT=/home/u390865851/private-storage/Public`. Production writes are locked to these paths; configured older roots remain read-only recovery candidates.
3. Set upload tuning values from `.env.example` and optionally `HOSTINGER_STORAGE_CAPACITY_GB`.
4. Both the Hostinger `npm run build` and production `npm start` commands run `prisma migrate deploy`. A failed migration intentionally prevents deployment with a mismatched schema. The separate `vercel-build` command remains migration-free.
5. Schedule an authenticated POST to `/api/cron/storage-cleanup` every hour with `Authorization: Bearer $CRON_SECRET`.
6. Use `GET /api/admin/storage` for managed bytes, category breakdown, temporary sessions, filesystem capacity, and 60/70/80/90 percent warning levels.

## Request flow

The browser creates or resumes an `UploadSession`, sends only missing 5–10 MB chunks with bounded concurrency and per-chunk retry, and then requests completion. Assembly streams in order while calculating SHA-256; it never concatenates the master in process memory. Completion is idempotent, so a Hostinger gateway 504 can be polled safely without creating a second asset.

Legacy private assets continue to resolve from their existing `objectKey`. No automatic move or deletion is performed during deployment.
