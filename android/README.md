# HYMN Team Android

This is a native Android client for the HYMN team workspace. It does not open the website as its app UI. The Android UI provides Google sign-in, Home, Tasks, Schedule, Alerts, Work-station, Calls & follow-ups, team email history, Activity & Audit, Team Chat, Projects and Team Directory. It includes a workspace detail screen, account photo synced from HYMN, task status analytics, day/night appearance, mobile back navigation and quick links. Data is read and updated through the authenticated HYMN Team APIs. Access control remains enforced on the server.

## Build

Use Android Studio's bundled JDK 17 or newer and the Android SDK (API 36). Supply the same Google **Web application** OAuth client ID used by HYMN's server, either as `GOOGLE_CLIENT_ID` or Gradle property `googleClientId`:

```powershell
$env:GOOGLE_CLIENT_ID = "your-web-oauth-client-id"
gradle assembleDebug
```

The debug APK is at `app/build/outputs/apk/debug/app-debug.apk`. The Android OAuth client must authorize package `fun.hymnmusic.team` and the SHA-1 certificate used to sign the APK.

## Native notifications

Android schedules a network-aware WorkManager sync at the platform's minimum periodic interval (15 minutes) and displays new HYMN team alerts as native notifications. Android 13+ asks the user for notification permission. This is a resilient polling fallback; real-time FCM delivery requires a Firebase Android app and server credentials, which are not configured in this repository.

The user session cookie is stored with AndroidX EncryptedSharedPreferences. Calls use the system dialer and require user confirmation before dialing. Email actions hand off to the user's mail app.
