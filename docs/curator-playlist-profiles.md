# Curator playlist profiles and lightweight artwork

Curator Studio applications now require a playlist cover, genres, moods/activities,
song languages and an audience description, alongside the Spotify playlist URL,
listing description, review fee and review capacity. The playlist URL is the
canonical identifier; duplicate pending/approved applications remain blocked.

Cover uploads require sign-in, same-origin requests and a per-account rate limit.
The server decodes JPG/PNG/WebP (5 MB limit, minimum 300 × 300), strips metadata,
and creates a square WebP no larger than 960 pixels. Application cover URLs must
belong to that curator's upload namespace. Existing ownership moderation remains
required. Uploading a cover does not verify playlist ownership.

Additional profile fields are stored in the existing append-only
`PLAYLIST_CURATOR_APPLIED` audit record's `profile` object, in the same transaction
as the listing. No audit updates/deletes or database migration are needed. Legacy
listings remain readable with their existing genres and cover fallback. Profiles
are joined into the approved catalogue and the owner/admin studio; catalogue
search includes moods, languages and audience.

UI thumbnails use `artworkPreviewUrl` rather than full-resolution artwork:

- Playlist rail covers: 192 px; discovery covers: 320 px.
- Release selection cards and studio cover summaries: 192 px.
- Local public raster cover assets under `/assets/` and `/images/` now use
  `/api/image-preview`, with a fixed width allowlist and cached WebP transforms.
- Existing release/asset/public-upload previews keep their original access rules.
- Distributor originals and explicit downloads are unchanged. Remote images without
  a supported CDN resizing API remain unchanged; no arbitrary remote-image proxy
  is introduced. SVG/vector files and local blob previews are not transformed.

The public preview route validates paths, resolves symlinks inside `public`,
rejects traversal/non-raster files and caps source bytes/pixels. Its browser cache
is one day with stale-while-revalidate; source-content hashing invalidates the
server's transform cache when a source image changes.

Verification: `verify-curator-cover.cjs`, `verify-artwork-preview.ts`,
`verify-playlist-review-ui.cjs`, `verify-playlist-review-routes.cjs`, and the
isolated PostgreSQL marketplace integration suite.
