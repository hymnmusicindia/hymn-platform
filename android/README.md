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

Run `node scripts/release-team-app.cjs` from the repository root for an update. It increments the patch version and Android versionCode in `android/team-release.json`, builds the app, runs Android unit tests, and prepares a versioned APK plus SHA-256 and release metadata in `public/downloads/hymn-team`. Deploy these files with the web changes. Both Android Settings and the install page then show the same new version. The native Tools screen links to the current download page; APK updates require the user to install them.

Set `JAVA_HOME`, `ANDROID_HOME`, `GOOGLE_CLIENT_ID` and, if necessary, `TEAM_APP_GRADLE` for your Android build environment. On Windows the script detects Android Studio's JDK/SDK and a cached Gradle installation. Use the same signing key for every update; the existing app uses the local Android debug signing key. Do not change that key when distributing an update to existing installs. For release signing, migrate the build and publisher together before distributing the first release-signed build.

`--keep-version` builds the version already declared in the JSON file; `--stage-only` stages an APK that was already built and verifies its output metadata. Neither option allows overwriting an already published versionCode.

## Notification behavior

Android schedules assigned client-call reminders for 30 minutes before the appointment and verifies the current schedule before showing them. WorkManager syncs important team alerts at its minimum periodic interval (15 minutes); the web app's configured push queue delivers to subscribed browser devices. Android 13+ asks the user for notification permission. Real-time FCM delivery to the native APK requires a Firebase Android app and server credentials, which are not configured in this repository. Phone-only controls in Tools can mute call reminders or team alerts without changing HYMN inbox or email preferences. Phone notifications also offer Snooze 10 min and Mute actions.

The user session cookie is stored with AndroidX EncryptedSharedPreferences. Calls use the system dialer and require user confirmation before dialing. Email actions hand off to the user's mail app.
