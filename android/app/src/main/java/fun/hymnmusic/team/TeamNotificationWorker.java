package fun.hymnmusic.team;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONArray;
import org.json.JSONObject;

/** Battery-conscious native notification sync while the app is backgrounded. */
public final class TeamNotificationWorker extends Worker {
    private static final String CHANNEL = "hymn_team_updates";
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
                if (first) { notify(item); first = false; }
            }
            if (!newestId.isEmpty()) api.setLastNotificationId(newestId);
            return Result.success();
        } catch (Exception error) { return Result.retry(); }
    }

    private void notify(JSONObject item) {
        Context context = getApplicationContext();
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel(CHANNEL, "HYMN Team updates", NotificationManager.IMPORTANCE_DEFAULT));
        Intent open = new Intent(context, MainActivity.class).putExtra("screen", "alerts").addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(item.optString("title", "HYMN Team update"))
            .setContentText("Open HYMN Team to view this update.")
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        manager.notify(item.optString("id", "").hashCode(), builder.build());
    }
}
