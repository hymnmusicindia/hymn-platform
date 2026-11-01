package fun.hymnmusic.team;

import android.content.Context;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/** Keeps durable, local reminders for calls assigned to this signed-in team member. */
final class TeamCallReminderScheduler {
    private static final String PREFS = "hymn_team_call_reminders";
    private static final String PREFIX = "event:";
    private TeamCallReminderScheduler() { }

    static void sync(Context context, JSONArray events, String memberId) { sync(context, events, memberId, false); }

    static void sync(Context context, JSONArray events, String memberId, boolean pruneMissing) {
        android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        Set<String> activeIds = new HashSet<>();
        WorkManager work = WorkManager.getInstance(context);
        if (events != null) for (int i = 0; i < events.length(); i++) {
            JSONObject event = events.optJSONObject(i);
            if (event == null || !"CALL".equals(event.optString("kind")) || !"SCHEDULED".equals(event.optString("status")) || !memberId.equals(event.optString("assigneeId"))) continue;
            String id = event.optString("id"), startsAt = event.optString("startsAt");
            if (id.isEmpty() || startsAt.isEmpty()) continue;
            try {
                long start = Instant.parse(startsAt).toEpochMilli();
                if (start <= System.currentTimeMillis()) continue;
                String signature = event.optInt("scheduleRevision", event.optInt("version", 1)) + "|" + startsAt;
                activeIds.add(id);
                if (signature.equals(prefs.getString(PREFIX + id, ""))) continue;
                JSONObject client = event.optJSONObject("client");
                Data data = new Data.Builder()
                    .putString("event_id", id)
                    .putString("client_name", client == null ? "" : client.optString("name", ""))
                    .putString("starts_at", startsAt)
                    .putInt("schedule_revision", event.optInt("scheduleRevision", event.optInt("version", 1)))
                    .build();
                long dueAt = Math.max(System.currentTimeMillis(), start - TimeUnit.MINUTES.toMillis(30));
                OneTimeWorkRequest reminder = new OneTimeWorkRequest.Builder(TeamCallReminderWorker.class)
                    .setInputData(data)
                    .addTag("hymn-team-call-reminder")
                    .setInitialDelay(Math.max(0, dueAt - System.currentTimeMillis()), TimeUnit.MILLISECONDS)
                    .build();
                work.enqueueUniqueWork("hymn-team-call-" + id, ExistingWorkPolicy.REPLACE, reminder);
                prefs.edit().putString(PREFIX + id, signature).apply();
            } catch (Exception ignored) { }
        }
        if (!pruneMissing) return;
        for (String key : prefs.getAll().keySet()) {
            if (!key.startsWith(PREFIX)) continue;
            String id = key.substring(PREFIX.length());
            if (!activeIds.contains(id)) { work.cancelUniqueWork("hymn-team-call-" + id); prefs.edit().remove(key).apply(); }
        }
    }
}
