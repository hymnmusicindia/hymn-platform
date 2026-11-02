# HYMN Team Android

### Email sign-in without Google Play services

Version 2.1.8 adds a native **Continue with email** form. Members enter their team email and a six-digit emailed code without a browser redirect. Version 2.1.9 removes native Google sign-in and its SDKs; email-code verification is the app's sign-in method. Deploy `/api/auth/team-email` before distributing the APK; its readiness response must report `teamEmailSignIn: "v1"` and `available: true`. The server uses the existing SMTP configuration and database-backed `security_rate_limits`; no migration or new credential is required.

Codes last ten minutes, permit five attempts and can be redeemed once, including simultaneous requests across server processes. Only active accounts with active team memberships can sign in. The server rechecks membership at redemption and retains the account's existing role. Challenges contain secret-keyed HMACs rather than plaintext codes or account-existence information. Request and verification limits persist in PostgreSQL; codes are not cached or logged. The native app stores the resulting session in its existing encrypted preferences.

Run `node --import tsx scripts/verify-team-email-sign-in-isolated.ts` for isolated database security checks. This fixture mocks code delivery and never sends real emails. Android instrumentation includes `TeamEmailSignInViewTest` for validation, resend cooldown and loading-state recovery.

This is a native Android client for the HYMN team workspace. It does not open the website as its app UI. The Android UI provides email-code sign-in, Home, Tasks, Schedule, Alerts, Work-station, Calls & follow-ups, team email history, Activity & Audit, Team Chat, Projects and Team Directory. It includes a workspace detail screen, account photo synced from HYMN, task status analytics, day/night appearance, mobile back navigation and quick links. Data is read and updated through the authenticated HYMN Team APIs. Access control remains enforced on the server.

## Build

Use Android Studio's bundled JDK 17 or newer and the Android SDK (API 36). Run `gradle assembleDebug` from `android`. The APK is at `app/build/outputs/apk/debug/app-debug.apk`. No Google OAuth client configuration is needed for the native app.

## Download releases

The public install page is `/team/app`; `/team/app/download` always serves the current published APK, with its version in the downloaded filename. Team OS includes a direct download and a copyable install-page link. The install page is accessible before sign-in; workspace data still requires an active membership.

Run `node scripts/release-team-app.cjs` from the repository root for an update. It increments the patch version and Android versionCode in `android/team-release.json`, builds the app, runs Android unit tests, and prepares a versioned APK plus SHA-256 and release metadata in `public/downloads/hymn-team`. Deploy these files with the web changes. Both Android Settings and the install page then show the same new version. The native Tools screen checks the public release metadata. Newer versions also check on foreground (at most every four hours) and prompt at most once a day for each update. A user-confirmed update downloads inside the app, checks its size, SHA-256, package, version and installed signing certificate, then opens Android's installer. Android may first ask the user to allow installs from HYMN Team; installation always requires confirmation. Existing older binaries need one manual update to gain this capability.

Set `JAVA_HOME`, `ANDROID_HOME` and, if necessary, `TEAM_APP_GRADLE` for your Android build environment. On Windows the script detects Android Studio's JDK/SDK and a cached Gradle installation. Use the same signing key for every update; the existing app uses the local Android debug signing key. Do not change that key when distributing an update to existing installs. For release signing, migrate the build and publisher together before distributing the first release-signed build.

`--keep-version` builds the version already declared in the JSON file; `--stage-only` stages an APK that was already built and verifies its output metadata. Neither option allows overwriting an already published versionCode.

## System bars and keyboard spacing

`TeamSafeArea` owns the activity's edge-to-edge setup and wraps every login, loading and workspace screen. It applies the union of system-bar and display-cutout insets to the outer container; bottom spacing is the larger of the navigation-bar and keyboard inset. Existing header/content/tab padding is kept inside that safe area. Insets are consumed once and replaced on each dispatch, so changes in screen, navigation mode or keyboard visibility do not accumulate padding. Status and navigation icons follow the app's day/night palette.

`TeamSafeAreaTest` verifies actual Android window bounds and recreation, then tests header/tab geometry against gesture navigation, three-button navigation, a side cutout and keyboard opening/closing, including repeated inset dispatch. Run `gradle connectedDebugAndroidTest` on a dedicated test emulator with no signed-in employee account.

## Notifications

Android schedules assigned client-call reminders for 30 minutes before the appointment and verifies the current schedule before showing them. WorkManager syncs important team alerts at its minimum periodic interval (15 minutes); the web app's configured push queue delivers to subscribed browser devices. Android 13+ asks the user for notification permission. Real-time FCM delivery to the native APK requires a Firebase Android app and server credentials, which are not configured in this repository. Phone-only controls in Tools can mute call reminders or team alerts without changing HYMN inbox or email preferences. Phone notifications also offer Snooze 10 min and Mute actions.

The user session cookie is stored with AndroidX EncryptedSharedPreferences. Calls use the system dialer and require user confirmation before dialing. Email actions hand off to the user's mail app.

## Access and loading

Native navigation and Tools use `TeamModuleAccess` to show only modules allowed by the current server session. API authorization remains mandatory. A 403 removes the module and refreshes membership; foreground checks pick up role changes. Standalone call reports are hidden because that API requires a contact ID.

Read-only screen snapshots are bounded to 16 entries, 200,000 characters each and a 15-minute lifetime in encrypted preferences. Keys include workspace, member and permission scope. Logout, access errors and successful mutations invalidate screen snapshots; epochs prevent stale in-flight responses from repopulating them. Saved views appear while fresh requests run. Home sections load independently and missing results remain marked as updating.

## Live chat

Foreground chat uses authenticated server-sent events with immediate same-worker invalidations after committed writes. Every refresh rechecks membership and channel access; a 2.5-second fallback catches writes on other workers. Connections close after 50 seconds and reconnect; unsupported connections fall back to ordinary polling. This is not a distributed event broker or WhatsApp's full infrastructure. Background native notifications still use WorkManager.

Encrypted local history and a persisted outgoing queue keep conversation opening and composing responsive. Each queued send retains its client key across retries, so the existing server idempotency prevents duplicate records. Confirmations replace pending bubbles without clearing a newer draft. Network failures retry; access and validation failures require review. Draft writes are debounced. The send-arrow icon has a 48dp target and an accessibility label.

Run `node scripts/test-team-chat-stream.cjs` for isolated stream delivery, permission revocation and cleanup checks. Android unit tests include the module permission matrix and existing encrypted chat cache/recovery coverage.

## Sign-in and shared palette

Email-code sign-in keeps verification inside the native app. Duplicate taps are disabled, stale results are ignored, and update prompts are deferred while a sign-in request is active.

`TeamLoginView` centers a maximum-440dp card within a fill-viewport scroll container. Short windows and larger fonts can scroll instead of clipping. Status messages use accessible live announcements and theme-appropriate contrast. `TeamPalette` mirrors the light/dark values in `app/styles/theme-tokens.css` for native screens. `TeamPaletteTest` checks contrast for labels, errors and primary actions. `TeamLoginViewTest` covers card centering and sizing on phone/tablet/short viewports plus busy and status states.

## Sign-in progress and recovery

During an active request, the sign-in card hides all normal content and moves the HYMN logo into a large animated progress ring. Hidden content retains the card’s dimensions; success leaves for the workspace, and failures restore controls. The same loader is used when restoring a saved session. Animation honors Android’s disabled-animation setting and stops when hidden or detached.

Each attempt has a distinct ID and monotonic stage. Late results cannot replace a newer request. HYMN sign-in requests have a 30-second read timeout. Transient connection failures retain an existing session and offer Retry connection. Optional recovery diagnostics contain only the APK version, package/signing fingerprint, request stage, error code and Android version.
