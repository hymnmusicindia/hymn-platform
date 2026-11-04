package fun.hymnmusic.app;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.os.Build;
import org.json.JSONObject;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

/** Actual Android notification builder/manager under a JVM Android runtime; no network. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = {28, 33})
public class MusicNotificationRenderingTest {
    Context context; NotificationManager manager;
    @Before public void setup() {
        context = RuntimeEnvironment.getApplication(); manager = context.getSystemService(NotificationManager.class);
        manager.cancelAll(); MusicPhoneNotifications.channels(context);
        Shadows.shadowOf(manager).setNotificationsEnabled(true);
        Shadows.shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
        context.getSharedPreferences("hymn_notification_choice", 0).edit().clear().commit();
    }
    @Test public void optInPausePermissionAndSystemMute() {
        assertFalse(MusicPhoneNotifications.enabled(context));
        context.getSharedPreferences("hymn_notification_choice", 0).edit().putBoolean("enabled", true).commit();
        assertTrue(MusicPhoneNotifications.enabled(context));
        if (Build.VERSION.SDK_INT >= 33) {
            Shadows.shadowOf(RuntimeEnvironment.getApplication()).denyPermissions(Manifest.permission.POST_NOTIFICATIONS);
            assertFalse(MusicPhoneNotifications.enabled(context));
            Shadows.shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
        }
        Shadows.shadowOf(manager).setNotificationsEnabled(false); assertFalse(MusicPhoneNotifications.enabled(context));
        Shadows.shadowOf(manager).setNotificationsEnabled(true);
        context.getSharedPreferences("hymn_notification_choice", 0).edit().putBoolean("enabled", false).commit();
        assertFalse(MusicPhoneNotifications.enabled(context));
    }
    JSONObject item(int id, String type) throws Exception {
        return new JSONObject().put("id", id).put("type", type).put("title", "HYMN update").put("href", "/dashboard/releases?releaseId=3");
    }
    @Test public void replayReplacesAlertAndTapIsBoundToAccount() throws Exception {
        MusicPhoneNotifications.show(context, "7", item(14, "release"));
        MusicPhoneNotifications.show(context, "7", item(14, "release"));
        assertEquals(1, manager.getActiveNotifications().length);
        Notification notice = manager.getActiveNotifications()[0].getNotification();
        assertEquals("hymn_releases", notice.getChannelId()); assertEquals(Notification.VISIBILITY_PRIVATE, notice.visibility);
        assertEquals("HYMN Music", notice.publicVersion.extras.getString(Notification.EXTRA_TITLE));
        assertTrue((notice.flags & Notification.FLAG_ONLY_ALERT_ONCE) != 0);
        assertTrue((notice.flags & Notification.FLAG_AUTO_CANCEL) != 0);
        Intent tap = Shadows.shadowOf(notice.contentIntent).getSavedIntent();
        assertEquals("7", tap.getStringExtra("notificationAccount"));
        assertEquals(MusicWebActivity.class.getName(), tap.getComponent().getClassName());
        assertEquals("https://hymnmusic.fun/dashboard/releases?releaseId=3", tap.getStringExtra("notificationHref"));
        manager.cancelAll(); assertEquals(0, manager.getActiveNotifications().length);
    }
    @Test public void offlineCatchUpKeepsBoundedTrayAndSeparateCategories() throws Exception {
        for (int id = 1; id <= 60; id++) MusicPhoneNotifications.show(context, "7", item(id, "beat"));
        assertEquals(30, manager.getActiveNotifications().length);
        assertEquals("hymn_store", manager.getActiveNotifications()[0].getNotification().getChannelId());
        assertNotNull(manager.getNotificationChannel("hymn_account"));
    }
}
