# Beat preview delivery

Public preview audio and published linked-master fallbacks now stream directly from a file handle, rather than reading the complete file into a Buffer before replying. The stream uses 64KB buffers and honours browser Range requests (including Safari-style two-byte probes), seeking, suffix ranges, HEAD, ETag revalidation and If-Range. Stopping/switching cancels the old transfer and closes its handle. No audio is requested simply by browsing the catalogue.

This is progressive playback, not a fixed half-song split. The native browser chooses its buffer and requests later bytes as needed. A Range request may cover the rest of a file; the server still streams it without allocating the whole file. This does not guarantee that a browser will download exactly half or a fixed number of seconds ahead.

Public upload URLs retain their immutable cache policy. The published-master route uses private revalidation so cached bytes can be reused while publication and owner/asset availability are checked. Responses include no-transform and X-Accel-Buffering: no to avoid wasteful intermediary recompression/buffering. Missing, retired, expired, inactive-owner and mismatched assets fail closed. Private purchase downloads and their full integrity/entitlement checks are unchanged.

No per-listen transcoding, background encoder, database migration or new dependency is introduced. Stored MP3/WAV file sizes and purchase originals are unchanged. Smaller encoded previews would require a separate encode-once ingest/backfill step; progressive delivery avoids that CPU cost for this change.

Validation: `npm run test:beat-preview-streaming` checks 16-byte reads from a 16MB file, bounded first chunks, seeking/ranges, conditional responses, aborted transfers and handle closure, actual public media delivery, linked-master access gates and original preservation. Real Chromium audio with the actual player provider starts before a deliberately throttled 2.65MB WAV finishes transferring at 1440/390/320px, and switching closes the old stream. Tests measure local progressive behaviour, not production latency or physical iOS-device speed. Existing rapid-switch/fallback and artwork regressions also pass. CI runs the streaming suite.

Reference: [HTTP range requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests).
