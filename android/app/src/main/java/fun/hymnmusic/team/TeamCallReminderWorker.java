package fun.hymnmusic.team;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/** Posts the on-device reminder at the scheduled call's 30-minute reminder time. */
public final class TeamCallReminderWorker extends Worker {
    public TeamCallReminderWorker(@NonNull android.content.Context context, @NonNull WorkerParameters params) { super(context, params); }

    @NonNull @Override public Result doWork() {
        String eventId = getInputData().getString("event_id");
        String client = getInputData().getString("client_name");
        String startsAt = getInputData().getString("starts_at");
        int revision = getInputData().getInt("schedule_revision", 1);
        if (eventId == null || startsAt == null) return Result.success();
        try {
            Instant start = Instant.parse(startsAt);
            long now = System.currentTimeMillis();
            if (start.toEpochMilli() <= now) return Result.success();
            TeamApi api = new TeamApi(getApplicationContext());
            if (api.cookie().isEmpty()) return Result.success();
            String from = java.net.URLEncoder.encode(Instant.ofEpochMilli(now - 3600000L).toString(), "UTF-8");
            String until = java.net.URLEncoder.encode(Instant.ofEpochMilli(now + 3 * 86400000L).toString(), "UTF-8");
            JSONObject calendar = api.get("calendar", "", "start=" + from + "&end=" + until);
            JSONArray currentCalls = calendar.optJSONArray("callReminders");
            JSONObject current = null;
            if (currentCalls != null) for (int i = 0; i < currentCalls.length(); i++) {
                JSONObject candidate = currentCalls.optJSONObject(i);
                if (candidate != null && eventId.equals(candidate.optString("id"))) { current = candidate; break; }
            }
            if (current == null || !startsAt.equals(current.optString("startsAt")) || revision != current.optInt("scheduleRevision", revision)) return Result.success();
            long minutesLeft = Math.max(0, (start.toEpochMilli() - System.currentTimeMillis() + 59999) / 60000);
            String time = DateTimeFormatter.ofPattern("h:mm a").withZone(ZoneId.of("Asia/Kolkata")).format(start);
            String title = minutesLeft > 25 ? "Client call in 30 minutes" : "Client call starting soon";
            String body = (client == null || client.isEmpty() ? "Your scheduled client call" : "Call with " + client) + " · " + time + " IST";
            android.content.Context context = getApplicationContext();
            TeamPhoneNotifications.show(context, eventId.hashCode(), "call:" + eventId, title, body, true, eventId, startsAt, revision);
        } catch (Exception error) { return Result.retry(); }
        return Result.success();
    }
}
