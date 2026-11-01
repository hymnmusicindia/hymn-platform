package fun.hymnmusic.team;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;

/** Battery-conscious native notification sync while the app is backgrounded. */
public final class TeamNotificationWorker extends Worker {
    public TeamNotificationWorker(@NonNull Context context, @NonNull WorkerParameters params) { super(context, params); }

    @NonNull @Override public Result doWork() {
        TeamApi api = new TeamApi(getApplicationContext());
        if (api.cookie().isEmpty()) return Result.success();
        try {
            JSONObject session = api.get("session", "", "");
            String workspace = session.optString("workspaceId", "");
            if (workspace.isEmpty()) return Result.success();
            JSONObject inbox = api.get("notifications", workspace, "offset=0");
            JSONArray items = inbox.optJSONArray("items");
            JSONObject calendar = api.get("calendar", workspace, reminderRange());
            JSONArray events = calendar.optJSONArray("callReminders");
            if (events == null) events = calendar.optJSONArray("items");
            TeamCallReminderScheduler.sync(getApplicationContext(), events, session.optString("memberId", ""), true);
            if (items == null || items.length() == 0) return Result.success();
            String last = api.lastNotificationId();
            JSONObject newest = items.optJSONObject(0);
            if (newest == null) return Result.success();
            String newestId = newest.optString("id", "");
            if (last.isEmpty()) { api.setLastNotificationId(newestId); return Result.success(); }
            boolean first = true;
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i); if (item == null) continue;
                if (item.optString("id").equals(last)) break;
                if (first && item.isNull("readAt")) { notify(item); first = false; }
            }
            if (!newestId.isEmpty()) api.setLastNotificationId(newestId);
            return Result.success();
        } catch (Exception error) { return Result.retry(); }
    }

    private void notify(JSONObject item) {
        Context context = getApplicationContext();
        String id = item.optString("id", "");
        TeamPhoneNotifications.show(context, id.hashCode(), "update:" + id,
            item.optString("title", "HYMN Team update"), "Open HYMN Team to view this update.", false, "", "", 1);
    }

    private String reminderRange() throws Exception {
        long from = System.currentTimeMillis();
        long to = System.currentTimeMillis() + 60L * 86400000L;
        return "start=" + java.net.URLEncoder.encode(java.time.Instant.ofEpochMilli(from).toString(), "UTF-8")
            + "&end=" + java.net.URLEncoder.encode(java.time.Instant.ofEpochMilli(to).toString(), "UTF-8");
    }
}
