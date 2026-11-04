package fun.hymnmusic.app;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;
import androidx.work.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

final class MusicPhoneNotifications {
    private static final Object LOCK = new Object();
    private static final String WORK = "hymn-music-notifications";
    private static SharedPreferences preferences;
    private static boolean syncing;
    static SharedPreferences prefs(Context context) throws Exception {
        synchronized (LOCK) {
            if (preferences == null) {
                MasterKey key = new MasterKey.Builder(context.getApplicationContext()).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build();
                preferences = EncryptedSharedPreferences.create(context.getApplicationContext(), "hymn_music_phone", key,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV, EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
            }
            return preferences;
        }
    }
    static boolean enabled(Context context) {
        return context.getSharedPreferences("hymn_notification_choice", Context.MODE_PRIVATE).getBoolean("enabled", false)
            && (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
            && NotificationManagerCompat.from(context).areNotificationsEnabled();
    }
    static void captureSession(Context context, String cookies) throws Exception {
        String cookie = MusicNotificationPolicy.sessionCookie(cookies);
        synchronized (LOCK) {
            SharedPreferences p = prefs(context);
            if (!cookie.equals(p.getString("cookie", ""))) {
                // Epoch changes invalidate every in-flight request and old notification tap.
                p.edit().putString("cookie", cookie).remove("account").remove("cursor").putLong("epoch", p.getLong("epoch", 0) + 1).commit();
                NotificationManagerCompat.from(context).cancelAll();
            }
        }
        if (cookie.isEmpty()) WorkManager.getInstance(context).cancelUniqueWork(WORK);
        else WorkManager.getInstance(context).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP,
            new PeriodicWorkRequest.Builder(MusicNotificationWorker.class, 15, TimeUnit.MINUTES)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build());
    }
    static void channels(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel("hymn_releases", "Release updates", NotificationManager.IMPORTANCE_DEFAULT));
        manager.createNotificationChannel(new NotificationChannel("hymn_store", "Beats and purchases", NotificationManager.IMPORTANCE_DEFAULT));
        manager.createNotificationChannel(new NotificationChannel("hymn_account", "Messages and account updates", NotificationManager.IMPORTANCE_DEFAULT));
    }
    /** Returns verified account, or empty when signed out. Never logs credentials or payloads. */
    static String sync(Context context) throws Exception {
        SharedPreferences p = prefs(context);
        final String cookie; final long epoch;
        synchronized (LOCK) {
            if (syncing) return "";
            cookie = p.getString("cookie", ""); epoch = p.getLong("epoch", 0);
            if (cookie.isEmpty()) return "";
            syncing = true;
        }
        try {
            channels(context);
            // Bounded pages keep background execution short; subsequent runs resume the cursor.
            for (int page = 0; page < 5; page++) {
                String account = p.getString("account", ""), cursor = p.getString("cursor", "");
                String query = account.isEmpty() || cursor.isEmpty() ? "" : "?account=" + URLEncoder.encode(account, "UTF-8") + "&after=" + cursor;
                HttpURLConnection connection = (HttpURLConnection) new URL(MusicNavigation.ORIGIN + "/api/music/phone-notifications" + query).openConnection();
                JSONObject feed;
                try {
                    connection.setInstanceFollowRedirects(false); connection.setUseCaches(false); connection.setConnectTimeout(10000); connection.setReadTimeout(15000);
                    connection.setRequestProperty("Cookie", cookie); connection.setRequestProperty("Accept", "application/json");
                    int status = connection.getResponseCode();
                    if (status == 401 || status == 403) {
                        synchronized (LOCK) { if (epoch == p.getLong("epoch", 0)) captureSession(context, ""); }
                        return "";
                    }
                    if (status != 200) throw new IOException("Notification sync unavailable");
                    StringBuilder raw = new StringBuilder();
                    try (Reader reader = new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8)) {
                        char[] buffer = new char[4096]; int count;
                        while ((count = reader.read(buffer)) != -1) { raw.append(buffer, 0, count); if (raw.length() > 100000) throw new IOException("Invalid notification feed"); }
                    }
                    feed = new JSONObject(raw.toString());
                } finally { connection.disconnect(); }
                synchronized (LOCK) {
                    if (epoch != p.getLong("epoch", 0) || !cookie.equals(p.getString("cookie", ""))) return "";
                    String owner = feed.getString("account");
                    if (!owner.matches("[1-9][0-9]*")) throw new IOException("Invalid account");
                    if (!account.isEmpty() && !owner.equals(account) && !feed.optBoolean("baseline")) throw new IOException("Account mismatch");
                    JSONArray items = feed.getJSONArray("items");
                    if (enabled(context) && !feed.optBoolean("baseline")) for (int i = 0; i < items.length(); i++) show(context, owner, items.getJSONObject(i));
                    // Commit after posting. Stable tags replace the same alert if a crash causes replay.
                    if (!p.edit().putString("account", owner).putString("cursor", String.valueOf(feed.getLong("cursor"))).commit()) throw new IOException("Notification checkpoint failed");
                    if (!feed.optBoolean("hasMore")) return owner;
                }
            }
            return p.getString("account", "");
        } finally { synchronized (LOCK) { syncing = false; } }
    }
    static void show(Context context, String account, JSONObject item) throws Exception {
        int id = item.getInt("id");
        Intent open = new Intent(context, MusicWebActivity.class).setAction("hymn.notification." + account + "." + id)
            .putExtra("notificationAccount", account).putExtra("notificationHref", MusicNotificationPolicy.destination(item.optString("href")))
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification publicNotice = new NotificationCompat.Builder(context, MusicNotificationPolicy.channel(item.optString("type")))
            .setSmallIcon(R.drawable.ic_notification).setContentTitle("HYMN Music").setContentText("You have a new update.").build();
        Notification notice = new NotificationCompat.Builder(context, MusicNotificationPolicy.channel(item.optString("type")))
            .setSmallIcon(R.drawable.ic_notification).setContentTitle(item.optString("title", "HYMN update"))
            .setContentText("Open HYMN to view this update.").setContentIntent(tap).setAutoCancel(true).setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setPublicVersion(publicNotice).build();
        // Android limits active alerts per app. Keep the newest 30; all history stays in HYMN.
        android.service.notification.StatusBarNotification[] active = context.getSystemService(NotificationManager.class).getActiveNotifications();
        if (active.length >= 30) {
            android.service.notification.StatusBarNotification oldest = active[0];
            for (android.service.notification.StatusBarNotification entry : active) if (entry.getPostTime() < oldest.getPostTime()) oldest = entry;
            NotificationManagerCompat.from(context).cancel(oldest.getTag(), oldest.getId());
        }
        NotificationManagerCompat.from(context).notify("hymn:" + account + ":" + id, id, notice);
    }
}
