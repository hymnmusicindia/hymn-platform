# Mobile distribution and payment return

The wizard uses a padded editor header rather than an unformatted black strip. Mobile fields use readable 16px text and 44–48px touch targets; action bars accommodate bottom safe areas. The artist step no longer reserves a blank viewport. Genre/subgenre and mood pickers use an accessible, dark bottom sheet: horizontally scrollable families, one list of large options, search, focus trapping, Escape dismissal, focus restoration and background scroll locking. Other picker dialogs retain the shared mobile form sizing.

Legal text is independently collapsible before or after consent. Collapsing never checks consent, and all existing legal validation remains mandatory. The final review also collapses the repeated legal text.

## Payment confirmation

- Assets prepared before payment are reused for submission. Retained File objects must not trigger a second upload after the draft has been reviewed and paid.
- Before checkout, the URL records the saved release and review stage. Successful submission replaces it with an owned, reload-safe submitted URL.
- If the submission response is lost, the client reads `/api/distribution/payment/status` and only shows success when the owned persisted release has a paid, submitted state. It does not infer success from a query string or checkout popup. Unpaid drafts and other users' releases cannot produce a success response.
- A checkout dismiss callback cannot override a success handler already verifying payment. An interrupted confirmation tells the customer not to pay again; existing create-order reconciliation resumes captured payments instead of creating duplicate charges.
- Confirmation SMTP runs after the response so mail latency cannot block the submitted screen. Signature, captured-payment, amount, entitlement, review-snapshot, ownership and idempotency checks remain intact.

No real payment is made or release delivered during verification. The isolated checkout fixture covers captured payment, replay, subscription and free release, mobile controls at 360/390/430/768px, independent legal collapse, lost-response recovery, the dismiss race and submitted-screen refresh persistence.

## UX references

- [W3C multi-page forms](https://www.w3.org/WAI/tutorials/forms/multi-page/): clear steps and progress in a long form.
- [web.dev form styling](https://web.dev/learn/forms/styling): native controls, readable text, contrast and usable targets.
- [Nielsen Norman Group mobile accordions](https://www.nngroup.com/articles/mobile-accordions/): reduce page length while preserving access to details.
