# Public origins behind Hostinger

Hostinger can present `http://0.0.0.0:3000` or a loopback URL to a Route Handler
while the browser sends `Origin: https://hymnmusic.fun`. Comparing Origin with
`new URL(request.url).origin` incorrectly blocks these requests.

Customer mutation handlers with an explicit origin check should use
`isSameAppOrigin` from `lib/request-origin.ts`. It checks the configured public
application origin and rejects missing, malformed and foreign browser origins.
Do not authorize a browser origin using arbitrary forwarded headers. Keep the
existing session, policy, ownership and artist-approval checks.

The distribution artist-verification gate runs before paid correction submission.
An origin rejection at this gate does not submit the correction or attach its
new licence reference to the release. Uploaded ownership-proof assets remain
stored separately. The customer should verify the intended document is attached
when retrying; do not guess between multiple uploaded agreements.

Internal cron HTTP calls also pass through `proxy.ts`. Without public forwarding
context, the production canonical-host rule redirects a loopback request. The
scheduler deliberately uses `redirect: "error"` to protect its bearer credential,
so this used to appear as an unreachable server and trigger public fallback.
`cronRequestHeaders` adds the configured public host/protocol only to loopback
calls. External fallback requests retain their normal headers, and actual
connection failures still use the existing fallback and backoff. The endpoint's
cron-secret verification and durable overlap leases remain required.

Checks:

- `node --import tsx scripts/verify-distribution-origin.ts`
- `node --import tsx scripts/verify-beat-request-origin.ts`
- `node --import tsx scripts/verify-cron-proxy.ts`
- `node --import tsx scripts/verify-cron-domain.ts`
