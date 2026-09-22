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
4. Hostinger's routine `npm run build` generates Prisma Client and compiles Next.js using only the restricted runtime `DATABASE_URL`; it does not need database-owner access. Before deploying a release that contains a new migration, run `npm run deploy:release` from the controlled release environment with `MIGRATION_DATABASE_URL` set to the Neon owner connection, then trigger the Hostinger build. `npm run build:release` combines those steps only for controlled builders that securely expose the owner credential. The migration runner also recognizes standard unpooled owner aliases and verifies ownership before changing schema. `npm start` performs a read-only identity/schema preflight, while `vercel-build` remains migration-free.
5. Schedule an authenticated POST to `/api/cron/storage-cleanup` every hour with `Authorization: Bearer $CRON_SECRET`.
6. Use `GET /api/admin/storage` for managed bytes, category breakdown, temporary sessions, filesystem capacity, and 60/70/80/90 percent warning levels.

## Request flow

The browser creates or resumes an `UploadSession`, sends only missing 5–10 MB chunks with bounded concurrency and per-chunk retry, and then requests completion. Assembly streams in order while calculating SHA-256; it never concatenates the master in process memory. Completion is idempotent, so a Hostinger gateway 504 can be polled safely without creating a second asset.

Legacy private assets continue to resolve from their existing `objectKey`. No automatic move or deletion is performed during deployment.
