package fun.hymnmusic.team;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;
public class ActivityClockTest {
    @Test public void runningPausedAndFinishedUseServerTime() throws Exception {
        JSONObject a=new JSONObject().put("startedAt","2026-11-03T10:00:00Z").put("pausedMs",10000);
        long now=java.time.Instant.parse("2026-11-03T10:02:00Z").toEpochMilli();
        assertEquals(110,ActivityClock.seconds(a,now));
        a.put("pausedAt","2026-11-03T10:01:00Z");assertEquals(50,ActivityClock.seconds(a,now));
        a.remove("pausedAt");a.put("endedAt","2026-11-03T10:01:30Z");assertEquals(80,ActivityClock.seconds(a,now));
    }
    @Test public void invalidAndFutureTimesNeverDisplayNegative() throws Exception {
        assertEquals(0,ActivityClock.seconds(null,0));assertEquals(0,ActivityClock.seconds(new JSONObject(),0));
        assertEquals("01:01:01",ActivityClock.display(3661));
    }
}
