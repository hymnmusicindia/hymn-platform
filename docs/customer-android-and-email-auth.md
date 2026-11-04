# HYMN Music customer Android app and email sign-in

The customer app is the `android/music` module (`fun.hymnmusic.app`). From version 1.0.4 its launcher is `MusicWebActivity`, displaying the live HYMN website in a WebView at the user's request. Website navigation, layouts and customer workflows are authoritative. The former native screens remain non-exported legacy code and are not launched. The staff app remains `android/app` (`fun.hymnmusic.team`). Existing server endpoints still verify payment signatures, capture, ownership, pricing, release reviews and entitlements.

The wrapper provides system-bar/keyboard insets, persisted WebView cookies, document-picker uploads, authenticated streamed downloads, generated-file downloads up to 25 MB, back navigation, loading progress and connection retry. Only exact HTTPS HYMN pages navigate within the main WebView. External links and payment-app schemes use Android intents; local file navigation and mixed content are blocked. The wrapper never ignores certificate errors. Google account selection uses Credential Manager and copies the server-issued HttpOnly session into the WebView; email sign-in uses the website form. Website changes appear without rebuilding the APK; wrapper changes still require an APK update.

## Email sign-in

`POST /api/auth/email` requests or verifies a six-digit email code. Requesting a code does not create an account. Successful verification creates a customer or signs into an existing active identity, preserving its account role and name. Merged/inactive identities cannot enter through this flow. Administrator identities receive codes like other active accounts; the existing role is read from the database, never accepted from the client.

Codes expire after ten minutes. Requests and attempts have persistent limits; resends invalidate older challenges. A keyed code digest is bound to the email and challenge ID. Verification consumes a locked database row in the same transaction as identity creation. Session cookies use the existing HttpOnly session system. The native app stores its cookie and recovery state in Android encrypted preferences. No schema migration or new environment secret is needed; the existing email configuration and user session secret are used.

## Customer workflows available through the website

- Email signup/login, profile, preferences, appearance and logout.
- Artist profiles and explicit store identity confirmation.
- Release drafts, track metadata, private artwork/audio/documents, device draft recovery, server version conflict protection, review, payment/subscription entitlement submission, correction resubmission and release status.
- Beat discovery, previews, licence details, server quotes, checkout, owned downloads and release handoff.
- Plan purchase, annual artist-slot pricing through the existing quote service and renewal actions.
- Studio engineer discovery, project creation, payment, private source upload, messages, deliveries, approval, revisions, scope payment, reviews, cancellation and release handoff.
- Playlist listening/feedback purchases using external Spotify tracks or the customer's HYMN catalogue, submission tracking, listening-link updates, cancellation, concerns and curator feedback.
- Referral link sharing, branches, messages, server-calculated illustrations and referral payout requests.
- Income summaries, payout credentials, withdrawal requests, history, support callbacks, notifications, policy reader and order history.

Server authorization and validation remain authoritative. A displayed client success is never sufficient evidence of payment or payout completion. Independent curator settlement remains the existing HYMN-reviewed process. The application does not add a customer self-service curator withdrawal endpoint.

## Build and release

Customer app 1.0.3 adds native Google account selection alongside email codes, a two-row product header, expandable navigation groups, artwork-led home and beat catalogue, and the public HYMN release showcase. Google uses Android Credential Manager and server ID-token verification; it never embeds a browser login. Register package `fun.hymnmusic.app` with the release certificate SHA-1 `A0:CB:DC:63:9F:1E:14:26:DC:2A:8E:9D:25:57:B2:E8:39:FB:5C:29` in the same Google Cloud project as the web client. A real Google account/device test remains necessary; an emulator without an account cannot prove consent completion.

Public home content uses the website's cached public preview and an encrypted device cache. Images run on a separate bounded executor so artwork downloads do not block authenticated API work. Private customer data is excluded from the public home response.

Sign-in mail has a compact authentication-only template, a distinct code subject and UTC request timestamp. SMTP acceptance confirms handoff, not inbox delivery time. Delivery diagnostics omit addresses and codes. Active administrator identities can sign in without losing their existing roles; suspended and merged identities remain blocked.

Run `node scripts/release-music-app.cjs`. A first build creates an ignored signing key under `android/.signing/`; subsequent builds reuse it and increment `android/music-release.json`. The command builds the release APK, runs JVM tests, checks the package/version metadata and publishes a content-hashed APK plus `public/downloads/hymn-music/release.json`.

Back up `android/.signing/customer-release.jks` and `customer.properties` securely together. They must never be committed or uploaded to public storage. The same key is required for every future APK update.

Publish the source, manifest and selected versioned APK together. `/music/app` is the shareable install page; `/music/app/download` streams the latest APK with the version, content length and hash in response headers. The session API reports the latest published Android version. Android still requires user approval to install an update; ordinary applications cannot silently replace themselves.

## Validation

- `node --import tsx scripts/verify-customer-email-isolated.ts`: isolated PostgreSQL fixture, mocked mail; no production accounts or emails.
- `node scripts/verify-email-auth-ui.cjs`: real React form in Chromium, mocked OTP API, four viewport widths, error/retry and resend behaviour.
- `:music:testDebugUnitTest`: HTTPS origin and external-scheme boundaries.
- `:music:connectedDebugAndroidTest`: native view tree, sign-in controls and navigation visibility.
- Release APK compilation and signing verification.

These checks do not charge a real card, request a real payout or prove delivery to every email provider. Live transaction completion requires the payment provider's normal confirmation and reconciliation.
