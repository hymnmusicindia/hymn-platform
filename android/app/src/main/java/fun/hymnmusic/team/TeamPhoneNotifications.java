package fun.hymnmusic.team;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.content.pm.PackageManager;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/** Phone-only notification channels and preferences; these do not change HYMN inbox or email settings. */
final class TeamPhoneNotifications {
    static final String PREFS = "hymn_team_notification_controls";
    static final String MUTE_CALLS = "mute_client_call_reminders";
    static final String MUTE_UPDATES = "mute_team_updates";
    static final String EXTRA_NOTIFICATION_ID = "notification_id";
    static final String EXTRA_KEY = "notification_key";
    static final String EXTRA_TITLE = "notification_title";
    static final String EXTRA_BODY = "notification_body";
    static final String EXTRA_CALL = "notification_call";
    static final String EXTRA_EVENT_ID = "notification_event_id";
    static final String EXTRA_STARTS_AT = "notification_starts_at";
    static final String EXTRA_REVISION = "notification_revision";
    static final String ACTION_SNOOZE = "fun.hymnmusic.team.SNOOZE_NOTIFICATION";
    static final String ACTION_MUTE = "fun.hymnmusic.team.MUTE_NOTIFICATION";
    private static final String CHANNEL_UPDATES = "hymn_team_updates";
    private static final String CHANNEL_CALLS = "hymn_team_calls";

    private TeamPhoneNotifications() { }

    static boolean muted(Context context, boolean call) {
        String key = call ? MUTE_CALLS : MUTE_UPDATES;
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(key, false);
    }

    static void show(Context context, int notificationId, String uniqueKey, String title, String body, boolean call, String eventId, String startsAt, int revision) {
        if (muted(context, call)) return;
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        String snoozeKey = call && eventId != null && !eventId.isEmpty() ? "call:" + eventId : uniqueKey;
        long snoozedUntil = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong("snooze:" + snoozeKey, 0L);
        if (snoozedUntil > System.currentTimeMillis()) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            manager.createNotificationChannel(new NotificationChannel(CHANNEL_UPDATES, "HYMN Team updates", NotificationManager.IMPORTANCE_DEFAULT));
            NotificationChannel calls = new NotificationChannel(CHANNEL_CALLS, "Client call reminders", NotificationManager.IMPORTANCE_HIGH);
            calls.setDescription("Private reminders for client calls assigned to you.");
            calls.enableVibration(true);
            manager.createNotificationChannel(calls);
        }
        int requestBase = uniqueKey.hashCode();
        Intent open = new Intent(context, MainActivity.class)
            .putExtra("screen", call ? "schedule" : "alerts")
            .putExtra(EXTRA_EVENT_ID, eventId == null ? "" : eventId)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent content = PendingIntent.getActivity(context, requestBase, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent snoozeIntent = actionIntent(context, ACTION_SNOOZE, notificationId, snoozeKey, title, body, call, eventId, startsAt, revision);
        PendingIntent snooze = PendingIntent.getBroadcast(context, requestBase ^ 0x5A05, snoozeIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String muteKey = call ? MUTE_CALLS : MUTE_UPDATES;
        Intent muteIntent = actionIntent(context, ACTION_MUTE, notificationId, muteKey, title, body, call, eventId, startsAt, revision);
        PendingIntent mute = PendingIntent.getBroadcast(context, requestBase ^ 0x4D55, muteIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String channel = call ? CHANNEL_CALLS : CHANNEL_UPDATES;
        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(content)
            .setAutoCancel(true)
            .setOnlyAlertOnce(false)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setCategory(call ? NotificationCompat.CATEGORY_EVENT : NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(call ? NotificationCompat.PRIORITY_HIGH : NotificationCompat.PRIORITY_DEFAULT)
            .addAction(0, "Snooze 10 min", snooze)
            .addAction(0, call ? "Mute call reminders" : "Mute team alerts", mute);
        notification.setPublicVersion(new NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(call ? "Upcoming client call" : "HYMN Team update")
            .setContentText("Open HYMN Team to review this notification.")
            .build());
        manager.notify(notificationId, notification.build());
    }

    private static Intent actionIntent(Context context, String action, int id, String key, String title, String body, boolean call, String eventId, String startsAt, int revision) {
        return new Intent(context, TeamNotificationActionReceiver.class)
            .setAction(action)
            .setData(android.net.Uri.parse("hymn-team://notification/" + action.substring(action.lastIndexOf('.') + 1).toLowerCase() + "/" + id))
            .putExtra(EXTRA_NOTIFICATION_ID, id)
            .putExtra(EXTRA_KEY, key)
            .putExtra(EXTRA_TITLE, title)
            .putExtra(EXTRA_BODY, body)
            .putExtra(EXTRA_CALL, call)
            .putExtra(EXTRA_EVENT_ID, eventId == null ? "" : eventId)
            .putExtra(EXTRA_STARTS_AT, startsAt == null ? "" : startsAt)
            .putExtra(EXTRA_REVISION, revision);
    }
}
