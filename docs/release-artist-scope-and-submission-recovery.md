# Release artists and submission recovery

The release wizard maintains album/release primary artists separately from each recording's primary, featured and remixer credits. It restores album identity from the saved release artist name, never from track 1. Adding a blank track, batch-uploading recordings or attaching an audio-library asset starts with the release artists only. Reordering and editing track-specific collaborators do not change album identity. Explicitly editing release artists applies the changed album artists while retaining unrelated track collaborators. Missing legacy artist cards remain a validation issue instead of silently dropping their saved album names. Autosave waits for the saved artist-card list to load.

Correction submission has a 90-second response deadline. After a failed or lost response the client checks an authenticated, owner-scoped receipt for the SHA-256 fingerprint of the exact schema-parsed correction package. Only a matching package already received for review is treated as success. The client never repeats the mutation automatically. Timeouts without a matching receipt exit the busy state and explain how to check Your Releases before retrying. Artist verification, profile refresh, review confirmation and payment-order creation also have bounded requests. Provider review holds and delivery receipts remain authoritative; a browser timeout never approves a release or creates a new partner submission.

Validation:

- `node --import tsx scripts/verify-release-artist-scope.ts`: album/track isolation, release-artist replacement, delivery roles, reorder, receipt recovery, timeout and no duplicate POST.
- `node scripts/verify-release-artist-scope-browser.cjs`: actual release editor at 390/1440px; new tracks inherit album artists only, existing primary and featured collaborators persist in the saved package.
- `node scripts/verify-artist-profile-verification-browser.cjs`: explicit profile consent, cancellation, link changes, mobile/desktop layout and timeout recovery.
- `node scripts/verify-correction-resubmission.cjs`: server correction receipt, ownership, authentication and duplicate prevention.
- Existing artist selection, featured requirements and delivery-contract checks continue to apply.

No database schema migration is required. Existing incorrect packages need an explicit, audited credit correction; do not infer roles for an entire catalogue or alter historical provider payloads.
