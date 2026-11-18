# HYMN support assistant

The floating Support entry replaces the home compass launcher. It is available on public/customer pages; staff routes retain their existing workspace. The home goal guide remains accessible through My path in the support header. Knowledge answers are deterministic matches against curated service tags, using current distribution plan data and links to HYMN guidance. No new model service, third-party chat platform, or external transmission of conversation text is required. Unmatched questions are offered a team ticket rather than an invented answer or account status.

Customers can describe their issue, choose a service, then review and submit a ticket. Distribution requests select an owned, non-archived release and optional track. The saved UPC is filled automatically; releases without an assigned UPC and customers without a release remain supported. Lists are searchable and paginated. Server ownership checks reject another account's release/track and mismatched UPCs. Support never edits release identifiers or submits a release.

The contact step explains that the submitted number updates the account and shared contact card. Explicit international prefixes are retained; bare ten-digit numbers use +91, stated in the UI. The existing account-to-contact directory helper participates in the ticket transaction. Previous phone numbers, notes, interests and contact status are preserved. Contacts are never merged by phone. Support tickets, contact updates, admin tasks, notifications and audit records commit together. Producer accounts use the same contact-save flow.

Each composer uses a stable UUID and a server-side payload fingerprint. User/workspace locks serialize concurrent retries. A matching replay returns the saved ticket; reusing the key for different content is rejected. After an uncertain response, the UI freezes the submitted details and retries the same request. Success appears only after a confirmed response. No customer tickets or messages were created during verification.

Tickets use the existing Support inbox, reviewer tools, reply history and durable email outbox. Track, release, UPC and contact number are shown in the existing ticket tools. Optional callbacks enter the existing representative follow-up scanner; a callback request does not reserve or promise an appointment. Earlier ticket-specific callback forms retain their original behavior; the new chat contact step explicitly saves to the shared contact card.

The widget supports light/dark themes, mobile keyboards, keyboard focus trapping, Escape/minimize, readable staged forms and reduced motion. Private draft details clear when the session identity changes. Public answers do not require login; ticket creation and release lookup do. Requests enforce same-origin checks, input bounds, no-store responses and rate limits. The knowledge answer service cannot execute actions; creating a ticket requires the explicit reviewed submit action.

## References

- [assistant-ui](https://github.com/assistant-ui/assistant-ui): React conversation interface reference.
- [Chatwoot](https://github.com/chatwoot/chatwoot): support conversations and help-center handoff reference.
- [Intercom ticket form options](https://www.intercom.com/help/en/articles/8300310-ticket-form-options): service-based branching and collecting issue context inside the messenger.

These informed the interaction design. No external repository code or extra runtime packages were copied or installed.

## Verification

- `node --import tsx scripts/verify-acquisition-isolated.ts --support-chat-only`: real isolated PostgreSQL; concurrent idempotency, owned release/track/UPC validation, no-UPC/no-release cases, customer and producer contact updates, previous numbers and opt-outs preserved, private pagination, inactive-account rejection and atomic rollback.
- `node --conditions=react-server --import tsx scripts/verify-support-chat-api.ts`: authentication, origin checks, request limits, rate limits, public/private separation and trusted identity.
- `node scripts/verify-support-chat-browser.cjs`: light/dark at 320/390/768/1440px; answers, release-to-ticket flow, phone review, uncertain-response retry, success reference, Escape and signed-out privacy.
- TypeScript and production build.

No schema migration or additional credentials are required.
