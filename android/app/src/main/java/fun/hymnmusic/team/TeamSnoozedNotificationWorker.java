package fun.hymnmusic.team;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.Instant;

public final class TeamSnoozedNotificationWorker extends Worker {
    public TeamSnoozedNotificationWorker(@NonNull android.content.Context context, @NonNull WorkerParameters params) { super(context, params); }

    @NonNull @Override public Result doWork() {
        int id = getInputData().getInt(TeamPhoneNotifications.EXTRA_NOTIFICATION_ID, 0);
        String key = getInputData().getString(TeamPhoneNotifications.EXTRA_KEY);
        String title = getInputData().getString(TeamPhoneNotifications.EXTRA_TITLE);
        String body = getInputData().getString(TeamPhoneNotifications.EXTRA_BODY);
        boolean call = getInputData().getBoolean(TeamPhoneNotifications.EXTRA_CALL, false);
        String eventId = getInputData().getString(TeamPhoneNotifications.EXTRA_EVENT_ID);
        String startsAt = getInputData().getString(TeamPhoneNotifications.EXTRA_STARTS_AT);
        int revision = getInputData().getInt(TeamPhoneNotifications.EXTRA_REVISION, 1);
        if (id != 0 && key != null && title != null && body != null) {
            if (call) {
                try {
                    if (eventId == null || startsAt == null || Instant.parse(startsAt).toEpochMilli() <= System.currentTimeMillis()) return Result.success();
                    TeamApi api = new TeamApi(getApplicationContext()); if (api.cookie().isEmpty()) return Result.success();
                    String from = java.net.URLEncoder.encode(Instant.ofEpochMilli(System.currentTimeMillis() - 3600000L).toString(), "UTF-8");
                    String until = java.net.URLEncoder.encode(Instant.ofEpochMilli(System.currentTimeMillis() + 3 * 86400000L).toString(), "UTF-8");
                    JSONObject calendar = api.get("calendar", "", "start=" + from + "&end=" + until); JSONArray calls = calendar.optJSONArray("callReminders"); JSONObject current = null;
                    if (calls != null) for (int i = 0; i < calls.length(); i++) { JSONObject event = calls.optJSONObject(i); if (event != null && eventId.equals(event.optString("id"))) { current = event; break; } }
                    if (current == null || !startsAt.equals(current.optString("startsAt")) || revision != current.optInt("scheduleRevision", revision)) return Result.success();
                } catch (Exception ignored) { return Result.retry(); }
            }
            getApplicationContext().getSharedPreferences(TeamPhoneNotifications.PREFS, android.content.Context.MODE_PRIVATE).edit().remove("snooze:" + key).apply();
            TeamPhoneNotifications.show(getApplicationContext(), id, key, title, body, call, eventId, startsAt, revision);
        }
        return Result.success();
    }
}
