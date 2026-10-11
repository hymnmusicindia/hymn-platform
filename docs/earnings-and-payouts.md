# Earnings and payouts

`/payout` is the shared earnings and withdrawal destination. The sidebar and profile menu use one Earnings & payouts entry. Existing customer dashboard earnings/payouts tab links redirect there. Producer beat-sale accounting remains distinct from artist royalty reporting.

The overview prioritizes available INR balance, reserved withdrawals and completed net payments. Lifetime earnings stay separate; the UI does not imply these figures are an accounting equation. Reported months are sorted chronologically, limited to the latest six, and displayed without inventing missing periods. Release details, period records, split allocations and withdrawal timelines expand on demand. Split-only recipients can review their allocations even without their own distributor statements.

Readiness uses active requests (including under review), payout profile verification, current exchange-rate availability, the configured USD minimum and quarter window. These checks guide the interface; the existing server withdrawal checks remain authoritative. Fee previews use the configured percentage and the server rounding sequence. The request form uses the stored, verified payout profile instead of collecting ignored bank details again.

Balances refresh manually, when the browser regains focus and every minute while visible. Responses are private/no-store. Failed refreshes retain the previous balances with a visible warning. Accepted withdrawal responses reserve their confirmed amount locally if the subsequent refresh fails; the accepted request stays visible. Unconfirmed submissions disable retry until the user reviews activity. Statement generation targets the latest reported monthly period and handles failures explicitly.

The summary includes profile status, counts under-review requests as reserved and preserves legitimate zero lifetime earnings instead of falling back to gross revenue. No schema migration is required.

Root, public, release and payout loading boundaries use the shared HYMN skeleton with a reduced-motion fallback. Generic workspace loading states use the same component.

Validation: `scripts/verify-earnings.ts` uses mock financial APIs for readiness, chronological periods, paise precision, search, disclosure, pending requests, failure recovery, confirmed-request refresh failures, split-only history and fullscreen loading at 1440/390/320px. `scripts/verify-workspace-navigation.ts` checks shared navigation. TypeScript and lint checks accompany these browser checks.
