# Purchase feedback timing and presentation

The review prompt asks about the artist's journey rather than exposing internal
plan identifiers or raw purchase labels. Rating selection is reversible until
Continue saves it. Every rating, including one star, leads to the same optional
comment step. The verified-purchase API and one-review-per-purchase constraints
are unchanged.

Distribution/service and subscription feedback is deferred until the release
submission confirmation has been left. `ReleaseReviewConfirmation` marks entry;
its cleanup signals departure on the next animation frame, after checking the
confirmation is actually absent. That check prevents React Strict Mode cleanup
from being mistaken for navigation. Session-scoped markers recover a full-page
navigation; they contain timestamps only, not purchase or release details.

The global prompt rechecks eligible purchases against the authenticated API.
It also waits for any existing modal (such as playlist submission) to close,
rather than stacking focus traps. Beat-purchase feedback retains its existing
post-purchase timing. Dismissal still snoozes an unrated purchase for seven days.
Storage errors do not break the page or in-session departure event.

Test: `node scripts/verify-post-purchase-review-ui.cjs`.

The approach follows [NN/G's task-then-ask feedback guidance](https://www.nngroup.com/articles/user-feedback/)
and [USWDS modal accessibility guidance](https://designsystem.digital.gov/components/modal/).
