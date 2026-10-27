# Submission confirmation and shared operation progress

Release submission now opens a portal-based, blurred-background final agreement after the review submit button is pressed. Cancel, Escape and backdrop dismissal send no submission. The agreement is bound to the current metadata fingerprint and is revalidated before processing. New releases, paid corrections and amendments share this gate. A synchronous guard prevents double submission.

The shared operation-progress model advances quickly through the first half, moderately to 80%, then more slowly toward 99%. Real upload bytes are mapped to the transfer portion, reserving the remainder for storage and server verification. Pending work never reports 100%. Only a successful operation/server response enables completion; release confirmation is shown briefly before navigating to the submitted receipt.

After 45 seconds without transfer activity, numeric progress changes to an indeterminate Initialising status with a waiting-for-confirmation explanation. It does not restart a request or reset a payment. Actual errors still stop processing and show the error. The shared hook cleans up timers on cancellation and unmount, preserves monotonic progress when byte counters retry, and bounds progress jumps after background-tab pauses.

The common behavior is used by release submission/draft processing, audio uploads and replacements, artwork validation, rights-document uploads and the shared upload dropzone used by other site modules. Static completion metrics, audio playback positions and existing indeterminate buttons retain their meaning.

Verification: `npm run test:submission-feedback` checks the timing model and real new-release/correction editor on desktop/mobile. Browser checks cover agreement gating, blur, Escape/focus restoration, double-click protection, gradual feedback, long-wait fallback without resubmission and successful receipts. License upload and audio replacement browser regressions are also run.
