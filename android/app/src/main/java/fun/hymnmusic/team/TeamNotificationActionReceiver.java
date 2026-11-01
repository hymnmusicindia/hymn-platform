package fun.hymnmusic.team;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;

/** Handles notification actions locally on this phone. */
public final class TeamNotificationActionReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        int id = intent.getIntExtra(TeamPhoneNotifications.EXTRA_NOTIFICATION_ID, 0);
        String key = intent.getStringExtra(TeamPhoneNotifications.EXTRA_KEY);
        if (key == null || key.isEmpty()) key = String.valueOf(id);
        android.app.NotificationManager manager = (android.app.NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(id);

        if (TeamPhoneNotifications.ACTION_MUTE.equals(intent.getAction())) {
            context.getSharedPreferences(TeamPhoneNotifications.PREFS, Context.MODE_PRIVATE).edit().putBoolean(key, true).apply();
            return;
        }
        if (!TeamPhoneNotifications.ACTION_SNOOZE.equals(intent.getAction())) return;
        long delay = TimeUnit.MINUTES.toMillis(10);
        if (intent.getBooleanExtra(TeamPhoneNotifications.EXTRA_CALL, false)) {
            try { delay = Math.min(delay, java.time.Instant.parse(intent.getStringExtra(TeamPhoneNotifications.EXTRA_STARTS_AT)).toEpochMilli() - System.currentTimeMillis() - TimeUnit.MINUTES.toMillis(1)); }
            catch (Exception ignored) { return; }
            if (delay <= 0) return;
        }
        context.getSharedPreferences(TeamPhoneNotifications.PREFS, Context.MODE_PRIVATE).edit().putLong("snooze:" + key, System.currentTimeMillis() + delay).apply();
        Data data = new Data.Builder()
            .putInt(TeamPhoneNotifications.EXTRA_NOTIFICATION_ID, id)
            .putString(TeamPhoneNotifications.EXTRA_KEY, key)
            .putString(TeamPhoneNotifications.EXTRA_TITLE, intent.getStringExtra(TeamPhoneNotifications.EXTRA_TITLE))
            .putString(TeamPhoneNotifications.EXTRA_BODY, intent.getStringExtra(TeamPhoneNotifications.EXTRA_BODY))
            .putBoolean(TeamPhoneNotifications.EXTRA_CALL, intent.getBooleanExtra(TeamPhoneNotifications.EXTRA_CALL, false))
            .putString(TeamPhoneNotifications.EXTRA_EVENT_ID, intent.getStringExtra(TeamPhoneNotifications.EXTRA_EVENT_ID))
            .putString(TeamPhoneNotifications.EXTRA_STARTS_AT, intent.getStringExtra(TeamPhoneNotifications.EXTRA_STARTS_AT))
            .putInt(TeamPhoneNotifications.EXTRA_REVISION, intent.getIntExtra(TeamPhoneNotifications.EXTRA_REVISION, 1))
            .build();
        OneTimeWorkRequest reminder = new OneTimeWorkRequest.Builder(TeamSnoozedNotificationWorker.class)
            .setInputData(data)
            .setInitialDelay(delay, TimeUnit.MILLISECONDS)
            .build();
        WorkManager.getInstance(context).enqueueUniqueWork("hymn-team-snooze-" + id, ExistingWorkPolicy.REPLACE, reminder);
    }
}
