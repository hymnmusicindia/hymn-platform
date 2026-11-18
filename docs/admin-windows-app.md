# HYMN Admin OS for Windows

## Architecture decision

The Windows app runs the live Admin OS inside an isolated Electron renderer. All existing distribution, store, user, financial and system modules retain their canonical URLs, server authorization and workflows. There is no second admin implementation or local database of customer records. Native main-process code owns browser sign-in, the Windows tray, bounded background polling, notification actions and settings. Remote web content has no preload bridge, Node access or notification/OS permissions. The small local connection/settings screen has a checked, narrowly scoped IPC bridge.

Evaluated primary references:

| Option | Fit for this portal | Decision |
| --- | --- | --- |
| [Electron](https://github.com/electron/electron), [security guidance](https://www.electronjs.org/docs/latest/tutorial/security), [notifications](https://www.electronjs.org/docs/latest/api/notification) | Reuses the complete portal; consistent Chromium; independent native tray/notification loop; JavaScript maintenance fits this repository. Bundles a substantial browser runtime. | Selected. |
| [Tauri](https://github.com/tauri-apps/tauri), [capabilities](https://v2.tauri.app/security/capabilities/) | Smaller runtime through system WebView; supports native features. Adds a Rust toolchain and another implementation language for background networking and sign-in. Remote capabilities still need careful isolation. | A valid future size-focused alternative; no blanket claim that one framework is inherently secure. |
| [Windows PWA](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps-chromium/ux) | Very small install and web updates. Background alerts require a service-worker/push transport and permission lifecycle. It does not supply this app's independent native tray poller. | Useful browser installation option; not the selected desktop delivery. |
| [electron-builder](https://github.com/electron-userland/electron-builder) | Windows NSIS installer, Start menu shortcut and consistent packaging. | Selected packaging tool. No template app code copied. |

## Sign-in and authority

The application opens `https://hymnmusic.fun/desktop-connect` in the system browser, rather than putting Google sign-in inside an embedded browser. The app generates a random verifier, SHA-256 challenge, random state and ephemeral callback port bound only to `127.0.0.1`. A pairing code is visible in both screens. The browser requires explicit approval, a recent signed-in user and live active admin authority. Its signed 60-second handoff contains the challenge, user ID and unique ID, not a reusable session cookie. `/api/desktop-admin-auth` is intentionally outside the authenticated admin API prefix: exchange is authenticated by this short-lived proof-bound code. Approval still requires admin authentication. Same-origin checks, bounded JSON and rate limiting apply.

The native process verifies callback host/path/state and exchanges the code with the original verifier. The server rechecks active role/membership and atomically consumes the unique code using the existing durable rate-limit table. Concurrent redemption succeeds once. The normal revocable HYMN session is created directly in the app's persistent Chromium partition. Secrets are never passed to the renderer, bundled into the installer or printed by tests. Shared legacy admin passwords do not pair the app; use an approved Google-backed admin account. No migration or extra OAuth client registration is needed.

## Alert behaviour

`GET /api/admin/desktop/events` reads existing persisted AdminTask records and immutable SUBMITTED/RESUBMITTED release transitions. Reading submission history independently means a release that finishes review between polls is still observable. Other task categories include correction reviews, delivery failures, support tickets/callbacks, stores/Studio, account reviews and finance. Unknown task categories are restricted to system administrators. Each response checks live permissions and active identity; grouped entities also require their specific capability. Task bodies, evidence, phone numbers and customer messages are excluded from banners. Clicks use fixed admin destinations and cannot navigate to arbitrary URL schemes or hosts.

Polling runs every 15 seconds, independently of renderer visibility. Failed requests retry with bounded exponential backoff up to two minutes. Windows resume triggers a sync. A quiet first sync suppresses historical task floods. Stable updatedAt/id pagination, a two-minute overlap and bounded revision-key deduplication handle equal timestamps, repeated pages and short commit/network delays. After more than six days without a successful sync, the app establishes a fresh baseline instead of submitting an invalid stale window. This is a bounded polling feed, not a guaranteed event log or instant push service. Changes overwritten between polls and transactions delayed beyond the overlap are not guaranteed as individual alerts; the admin queue remains authoritative.

Closing a window keeps the process running in the tray. **Quit**, signing out of Windows, sleep/offline conditions, expired sessions and Windows Focus Assist can stop or delay banners. Alerts require a connected active admin session. Revocation hides the workspace and stops authorised event delivery at the next successful poll; server actions always retain their own permission checks. Notification preference and optional Start with Windows are local controls. Start with Windows defaults off. A tray menu provides a local test notification. It never creates a server ticket or submission.

## Packaging and updates

Build from the repository root with Node 22.12+:

```powershell
cd desktop/admin
npm ci --ignore-scripts
node node_modules/electron/install.js
node prepare-assets.cjs
npm test
npm run dist
```

The Windows x64 installer is `desktop/admin/dist/HYMN-Admin-OS-Setup-1.0.0-x64.exe`. Install per-user; no machine-wide administration is required. The packaged ASAR must contain only the enumerated app files/assets, no web dependencies, environment files or database tooling. Native dependency rebuilding is disabled because this shell has no native Node dependencies. Electron 45 uses an explicit runtime installer. Build output is ignored by Git. Packaging enables OS-encrypted cookies and ASAR integrity checking; it disables RunAsNode, NODE_OPTIONS and Node inspector arguments, and loads application code only from the ASAR.

Portal changes are delivered through the existing web deployment. Desktop runtime changes require a new versioned installer. This first release does **not** enable unauthenticated automatic executable updates. A production code-signing certificate and a trusted update channel must be configured before adding signed automatic runtime updates; see [Electron updates](https://www.electronjs.org/docs/latest/tutorial/updates). No code-signing identity was available during this build, so Windows may show an unknown-publisher/SmartScreen prompt. Do not describe this installer as signed or Microsoft Store certified.

## Verification

- `node --import tsx scripts/verify-acquisition-isolated.ts --admin-desktop-only`: real isolated PostgreSQL; active membership, wrong proof, expired code, parallel single-use redemption, revocation/suspension, permission filtering, private summaries and 301 equal-timestamp events interleaved across four pages. A completed release's submission remains observable.
- `node --conditions=react-server --import tsx scripts/verify-admin-desktop-api.ts`: recent admin approval, CSRF, public exchange validation, session creation only on success, body limits, rate limits and no-store.
- `node --test desktop/admin/tests/policy.test.cjs`: trusted navigation, initial pagination, overlapping retries, identity changes and invalid feed actions.
- `node scripts/verify-admin-desktop-browser.cjs`: actual Electron runtime with isolated userData and fake transport; sandbox, no remote bridge, loopback state verification, successful pairing, notification delivery/click/deduplication, tray close, preferences and revocation. Login-item and notification OS effects are mocked; it does not alter the developer's startup registration or send real production alerts.

The actual installed Windows notification policy and a real Google account approval require user interaction. Automated tests do not claim to complete Google OAuth or bypass Windows Focus Assist. Backend rollout follows the existing main-branch Hostinger deployment; no customer data or permissions are changed by deployment.
