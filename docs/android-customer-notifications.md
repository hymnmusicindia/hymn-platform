# HYMN Music Android notifications

This update adds **native Android notifications to the customer WebView app**. The website remains the app UI. Phone alerts reuse committed HYMN inbox records; they do not infer approval, delivery or live status independently.

## Supported events

- Release review, corrections/rejection, delivery and live updates already recorded in the HYMN inbox.
- Beat approval, purchases, file fulfilment and licences already recorded in the inbox.
- Account, payout, Studio delivery and administrator announcements already recorded in the inbox.
- New Studio chat messages and callback requests now create an idempotent inbox notification for the other participant. Message and notification commit together. Private message bodies and callback phone numbers are not copied into phone payloads.

These are Android alerts, not SMS. This does not add a marketing broadcast or notify everyone about every new beat. An event must already target the signed-in user. HYMN Team is a different APK and retains its existing notification implementation.

## Delivery and controls

The foreground checks every 15 seconds; WorkManager checks in the background at Android's minimum periodic interval of **15 minutes**. Battery restrictions, Doze, lack of network and force-stop can delay or prevent execution. This is **not immediate push**. Firebase Cloud Messaging is not configured; it needs Firebase Android registration and server credentials before a real-time transport can be enabled and tested. Do not promise instant alerts from this build.

After verified sign-in, an explanation offers Enable alerts or Not now. Android 13+ additionally requires the OS permission. Notification bell → Phone alert settings can enable or pause alerts and open Android settings. Release, beat/purchase and account/message categories can be muted individually in Android. Pausing does not change the HYMN inbox or email settings.

The first sync establishes a baseline, avoiding a flood of historical notifications. Subsequent syncs read ascending-ID pages of 50, with at most five pages per run; a later run continues unfinished catch-up. Read inbox items advance the cursor without producing phone alerts. Disabled phone alerts are also checkpointed rather than replayed on re-enable. Stable account/event tags replace an existing notification on replay. The newest 30 active phone alerts are retained; older records remain in the inbox.

## Security

- `/api/music/phone-notifications` checks the existing revocable HYMN session on every call. User ID comes only from that session. Responses are private/no-store and contain no message body, metadata, email or session token.
- The native worker stores only the customer session cookie, account, epoch and cursor in encrypted preferences. Admin and unrelated WebView cookies are excluded.
- Session changes invalidate in-flight results and clear displayed notifications and checkpoints. Expired/revoked sessions clear local notification access. Network failures preserve state for retry.
- Taps are immutable explicit app intents; the foreground revalidates the signed-in account before opening the destination. External origins, credentials in URLs and auth/API destinations fall back to the dashboard.
- Lock-screen public content is generic. Android privacy settings ultimately control what is visible.
- No JavaScript interface is exposed to website frames. A navigation to the fixed same-origin settings URL opens the native controls.

## Validation before production

Run from the repository root:

```powershell
node --import tsx scripts/verify-music-phone-notifications.ts
node --import tsx scripts/verify-studio-services-isolated.ts
```

The first uses the actual route with mocked sessions and database; it tests authentication, invalid/overflow cursors, isolation, baseline, 120-record pagination, already-read records, empty accounts, safe links and branding. The second uses a disposable PostgreSQL database and simulated providers. It tests both Studio recipients, repeat-send deduplication, sender exclusion and the existing Studio lifecycle/financial suite. Neither sends real customer alerts or mail.

Android unit tests include `MusicNotificationPolicyTest`. Instrumentation uses a separate app ID so customer/employee app data is untouched:

```text
gradle -PmusicNotificationTest=true :music:assembleDebug :music:assembleDebugAndroidTest :music:testDebugUnitTest
```

Install the resulting debug app and test APK only on a dedicated emulator. Run `fun.hymnmusic.app.MusicPhoneNotificationsTest` using AndroidJUnitRunner. It checks permission denial/grant, opt-in/pause, duplicate tags, release channel, lock-screen privacy, immutable tap presence and logout cleanup. It never opens the website or sends network requests. Do not run all existing native-screen tests against production accounts.

**Production gate:** verify an actual signed-in test account against a staging server: first-install baseline; release approval/correction/live alert; beat purchase; Studio reply; notification tap; offline recovery; background execution; revoke permission; sign-out/account switch; and reboot. Include Android 8/9 and Android 13+ with representative OEM battery settings. For FCM, separately verify delivery/token rotation/invalid-token cleanup and revoked-session handling on real devices. A compiled APK or mocked server test alone does not prove real-world background delivery.

The prepared release is **1.0.5 (versionCode 6)**. Keep public download metadata pointing at the existing production APK until the staging/device gate passes. No production database migration is required for this change.

### Results on 4 November 2026

- Phone-feed regression: passed, and registered in the normal `npm test` runner.
- Isolated Studio lifecycle, notification-recipient/retry, managed upload and financial-recovery suites: passed. Production data and gateways were not used.
- Final signed release build and five Android unit tests: passed. Dedicated `.notificationtest` app and instrumentation APK also compiled successfully.
- Android instrumentation execution: **not completed**. The temporary headless emulator remained offline and was stopped. Tests are compiled, not device-verified.
- Full-project TypeScript check and read-only Firebase project lookup stalled on this machine and were stopped; neither is recorded as a pass. No Firebase configuration was confirmed.
- Production deployment and public APK metadata: **unchanged**. The signed candidate is at `artifacts/hymn-music-notifications-1.0.5.apk` for controlled staging/device validation only. Its API must be deployed to staging before end-to-end testing.

### Publication follow-up

The user subsequently requested publication after notification tests. The notification builder/manager now has six additional [Robolectric](https://robolectric.org/getting-started/) tests across Android API 28 and 33. All six passed, together with the five existing navigation/policy tests. These check opt-in/pause, denied permission, Android system mute, stable-tag replacement, notification categories, private lock-screen content, account-bound explicit taps and a bounded offline catch-up tray. This is a simulated Android runtime; physical-device/OEM behavior remains unverified.

`scripts/verify-music-app-update-browser.cjs` passed for older-app detection, exclusion of current/newer apps and ordinary browsers, download URL, light/dark 320/390/1440px layouts, dismissal persistence and an unavailable release API. The phone-feed regression passed again.

The web header now checks `/api/music/app-release` only inside HYMN Music's WebView user agent. Older apps receive a dismissible update dialog; it checks again on foreground/online and periodically, respects a 24-hour dismissal, and never blocks the page on a failed check. Existing binaries gain this web-delivered prompt when they reload the updated website. Android still requires the user to download/open the APK and confirm installation. No silent install is attempted.

Public release metadata is prepared for 1.0.5 (6), signed with the existing customer app key. The authorized announcement targets active customer/producer inboxes only, once per account/version, after the live release version and downloaded APK size/SHA-256 are verified. No email/SMS is sent. The release announcement is not a claim of FCM delivery to old binaries, which lack the native notification service.
