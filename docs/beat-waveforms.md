# Beat Store waveform delivery

The player reads a compact, 128-bin envelope from `/api/beats/:id/waveform?source=preview|master`. It never downloads a second audio copy or invokes Web Audio decoding. Audio playback starts directly from the user gesture and does not wait for waveform preparation.

## Generation and storage

Producer and admin uploads prepare envelopes before attempting publication. Older beats are prepared on their first selected-track request, or with the bounded backfill below. A cold legacy beat shows “Preparing waveform” until its real envelope is ready; precomputed and recently played beats render without waiting for audio decoding. This is not a claim that uncached data can arrive before a network round trip.

Generation runs on the server against DB-linked files, never arbitrary visitor-supplied URLs. WAV analysis samples four windows in each of 128 time bins (roughly 0.5 MB read for a stereo 16-bit master regardless of track length). MP3 analysis streams 16 KB chunks through `mpg123-decoder`, yields between chunks, retains a bounded envelope, and frees decoder memory afterward. Limits: 500 MB, 30 minutes, and a 60-second MP3 analysis deadline. Genuine silence remains flat.

Small JSON envelopes live in `Waveforms/<hash-prefix>/<hash>.json` under the existing durable managed storage root. Cache identity includes asset ID, checksum, size and modification time, so changing a source generates a new version. Preview and fallback master have independent envelopes. Files are written atomically. No database migration is required.

A filesystem gate permits one analysis at a time per shared storage root, also across Node processes. Other requests return HTTP 202 with Retry-After; the active player retries with backoff. Failed analyses have a 60-second cooldown, and stale locks recover after 120 seconds. There is no catalogue-wide generation on page load and no unbounded request queue. Uploads that encounter a busy worker log a deferred result and use the same on-selection fallback.

Published state, producer status, asset ownership, retention and deletion are checked before serving cached peaks. Responses use ETags and private revalidation. A bounded cache of 24 recent envelopes persists in the browser for five minutes. Switching tracks aborts the previous request and scheduled retries. Data Saver does not disable tiny envelope requests.

## Existing catalogue backfill

Run on the application host with its existing database and storage environment:

```sh
npm run beats:prepare-waveforms -- --limit 25 --after-id 0
```

This reads at most 25 published beat IDs and processes them sequentially. Each source reports `ready`, `busy`, `retry`, or `not_playable`. Re-run deferred beats after the worker is free; advance `--after-id` to the reported `nextAfterId` only after handling deferred results. The maximum batch size is 1,000. There is no automatic full-catalogue scan.

For a future multi-host deployment with independent disks, move envelopes to shared object storage/CDN and use a distributed job queue with a global concurrency limit. The current filesystem gate coordinates hosts only when they share the same durable root. This change bounds waveform work; it does not by itself add catalogue pagination or establish a 100,000-beat load-test result.

## Verification

```sh
npm run test:premium-player
npx tsx scripts/verify-waveform-generation.ts --mp3 /path/to/a/real-preview.mp3
```

The suite covers large WAVs, bounded reads, real peaks and silence, durable cache reuse, concurrency/backoff, API access rules, no eager catalogue loading, no secondary audio fetch, cache bounds, track switching, network recovery, playback fallback and the responsive player controls. The optional MP3 command checks a real encoded fixture without committing an audio recording.

References: [MDN decodeAudioData](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData), [WaveSurfer FAQ on precomputed peaks and streaming](https://wavesurfer.xyz/docs/), [mpg123-decoder streaming API](https://github.com/eshaz/wasm-audio-decoders/tree/main/src/mpg123-decoder).
