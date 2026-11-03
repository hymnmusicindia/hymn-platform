package fun.hymnmusic.team;

import org.json.JSONObject;
import java.time.Instant;
import java.util.Locale;

/** Display-only clock derived from the authoritative activity timestamps. */
final class ActivityClock {
    static long seconds(JSONObject activity, long now) {
        if (activity == null) return 0;
        try {
            long start=Instant.parse(activity.getString("startedAt")).toEpochMilli();
            String end=activity.optString("pausedAt", "");
            if(end.isEmpty() || end.equals("null"))end=activity.optString("endedAt", "");
            long until=end.isEmpty()||end.equals("null")?now:Instant.parse(end).toEpochMilli();
            return Math.max(0,(until-start-Math.max(0,activity.optLong("pausedMs")))/1000);
        } catch(Exception ignored) { return 0; }
    }
    static String display(long seconds) { return String.format(Locale.ROOT,"%02d:%02d:%02d",seconds/3600,(seconds/60)%60,seconds%60); }
}
