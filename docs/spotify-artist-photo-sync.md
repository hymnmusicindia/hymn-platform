# Spotify artist photos

Linked artist cards use the main image returned by Spotify's documented
`GET /v1/artists/{id}` API. This is not the artist's header banner or album art.

- Creating or updating a Spotify-linked profile refreshes the saved `imageUrl`.
- A newly linked profile from DireNote also triggers a refresh outside the database transaction.
- `GET /api/cron/spotify-artist-photos` refreshes linked, non-archived cards daily.
- The daily GitHub Actions workflow calls it at 02:05 UTC (07:35 IST).
- Requests use `Authorization: Bearer <CRON_SECRET>` and a database lease prevents overlapping jobs.
- Each refresh bypasses the five-minute artist cache. Identity and image compare-and-set checks protect concurrent edits.
- Missing Spotify photos, unavailable providers and invalid credentials never erase the existing photo.
- Authentication and rate-limit failures stop the batch. Failed or deferred runs return HTTP 503 and record a summary in the audit log.
- Existing artist-photo components consume the saved image without a separate UI redesign.

Production requires a valid `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` pair.
The credentials in the local `.env.hostinger` snapshot returned `invalid_client`
on October 14, 2026. No credentials were changed. Spotify oEmbed is deliberately
not used as a fallback: the tested artist response returned album artwork,
which must not be represented as the artist's profile photograph.

Verification: `node --conditions=react-server --import tsx scripts/verify-spotify-artist-photos.ts`.

References: https://developer.spotify.com/documentation/web-api/reference/get-an-artist
and https://developer.spotify.com/documentation/embeds/reference/oembed.
