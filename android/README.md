# HYMN Team Android

This is a native Android client for the HYMN team workspace. It does not open the website as its app UI. The Android UI provides Google sign-in, Home, Tasks, Schedule, Alerts, Work-station, Calls & follow-ups, team email history, Activity & Audit, Team Chat, Projects and Team Directory. It includes a workspace detail screen, account photo synced from HYMN, task status analytics, day/night appearance, mobile back navigation and quick links. Data is read and updated through the authenticated HYMN Team APIs. Access control remains enforced on the server.

## Build

Use Android Studio's bundled JDK 17 or newer and the Android SDK (API 36). Supply the same Google **Web application** OAuth client ID used by HYMN's server, either as `GOOGLE_CLIENT_ID` or Gradle property `googleClientId`:

```powershell
$env:GOOGLE_CLIENT_ID = "your-web-oauth-client-id"
gradle assembleDebug
```

The debug APK is at `app/build/outputs/apk/debug/app-debug.apk`. The Android OAuth client must authorize package `fun.hymnmusic.team` and the SHA-1 certificate used to sign the APK.

## Download releases

The public install page is `/team/app`; `/team/app/download` always serves the current published APK, with its version in the downloaded filename. Team OS includes a direct download and a copyable install-page link. The install page is accessible before sign-in; workspace data still requires an active membership.

Run `node scripts/release-team-app.cjs` from the repository root for an update. It increments the patch version and Android versionCode in `android/team-release.json`, builds the app, runs Android unit tests, and prepares a versioned APK plus SHA-256 and release metadata in `public/downloads/hymn-team`. Deploy these files with the web changes. Both Android Settings and the install page then show the same new version. The native Tools screen checks the public release metadata. Newer versions also check on foreground (at most every four hours) and prompt at most once a day for each update. A user-confirmed update downloads inside the app, checks its size, SHA-256, package, version and installed signing certificate, then opens Android's installer. Android may first ask the user to allow installs from HYMN Team; installation always requires confirmation. Existing older binaries need one manual update to gain this capability.

Set `JAVA_HOME`, `ANDROID_HOME`, `GOOGLE_CLIENT_ID` and, if necessary, `TEAM_APP_GRADLE` for your Android build environment. On Windows the script detects Android Studio's JDK/SDK and a cached Gradle installation. Use the same signing key for every update; the existing app uses the local Android debug signing key. Do not change that key when distributing an update to existing installs. For release signing, migrate the build and publisher together before distributing the first release-signed build.

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
