# Public agent readiness

HYMN's public business facts live in `lib/public-business.ts`. The confirmed support phone, email, Instagram and YouTube profiles are shared with Organization/ContactPoint JSON-LD. A business address is intentionally omitted at the owner's request; the address audit warning remains unresolved. HYMN is described as an Organization, with no invented physical storefront or opening hours.

## Public surfaces

- `/robots.txt`: preserves the existing crawl policy, public image exceptions and sitemap, and adds `Content-Signal: search=yes, ai-train=no`.
- `/`: server-rendered contact links, a public pricing link, visible FAQs and corresponding WebPage, Service, Offer and FAQPage data. Existing Organization and WebSite data remains in the root layout. Existing blog pages retain BlogPosting data.
- `/pricing`: prices from the same `distributionPlanCards` used by checkout. One-time estimates use `getTrackPricingQuote`, and optional UGC / Content ID fees use their canonical constants. Prices are INR, add-ons and eligibility are disclosed, and royalty commentary preserves the distribution partner's 30% share and HYMN's zero additional royalty-percentage commission.
- A server-rendered `noscript` summary preserves visible public pricing, contact, service and policy links when JavaScript is disabled. This avoids relying on JavaScript to reveal streamed Suspense content. It contains no private or session-derived data.
- `/llms.txt`: public page index, contact details and agent capabilities.
- `/index.md`: public homepage content, with no account-specific content. The proxy serves this representation at `/` and `/home` for an explicit acceptable `text/markdown` request. HTML remains the default. Both representations vary by Accept; React Server Component requests retain their normal rendering path. Canonical-host redirects and private-route authentication remain intact.
- `/agents`: public documentation and a JSON-RPC initialization example.
- `/.well-known/mcp/server-card.json`: SEP-1649-style discovery with public CORS, an actual endpoint, consistent server identity, protocol version and capabilities.
- `/mcp`: stateless Streamable HTTP, JSON responses, protocol `2025-06-18`. Initialization, ping, tool discovery and three public tool calls are supported. No SSE subscription, resource subscription, prompts or list-change notifications are advertised.

## Tool boundaries

`hymn_get_business_info`, `hymn_list_services` and `hymn_get_distribution_pricing` expose public information only. There are no tools for accounts, customers, private audio, payments, Team OS, Admin OS, calendars, meeting invitations or messages. Tool names and arguments are allowlisted. Pricing estimates accept only an integer track count from 1 to 100. The MCP handler rejects requests larger than 16 KiB, malformed JSON, unsupported versions/content negotiation and untrusted browser origins. Non-browser clients may omit Origin. No database writes or credentials are needed.

Public pages register the same tools through the experimental WebMCP API. Current `document.modelContext` takes precedence, with compatibility for the earlier `navigator.modelContext`. Registration uses an AbortSignal for cleanup and the legacy unregister method where supported. Unsupported browsers retain normal functionality; no fake API is installed.

## Verification

Run `npm run test:agent-readiness`. It checks content negotiation and cache variation, private-route protection, schema and price parity, MCP initialization/discovery/calls, origin and argument validation, invalid/oversized requests, real HTTP responses, modern/legacy browser registration and no-JavaScript access to prices, contact links and structured data. The browser runner uses isolated development memory data, mocks browser APIs, disables email and restores generated Next.js configuration references.

## References

- [Content Signals](https://contentsignals.org/)
- [WebMCP draft](https://webmachinelearning.github.io/webmcp/)
- [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [SEP-1649 server card proposal](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1649)

These discovery mechanisms and use preferences do not guarantee adoption by any particular crawler, browser or assistant. No rights to artist recordings, artwork or beat licences are implied.
