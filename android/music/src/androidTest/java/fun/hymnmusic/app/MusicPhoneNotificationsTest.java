package fun.hymnmusic.app;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.os.*;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.*;
import static org.junit.Assert.*;

/** Dedicated .notificationtest build only. Does not open HYMN or contact any server. */
public class MusicPhoneNotificationsTest {
    Context context;
    @Before public void prepare() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue("Use -PmusicNotificationTest so employee/customer app data is untouched", context.getPackageName().endsWith(".notificationtest"));
        context.getSystemService(NotificationManager.class).cancelAll();
        if (Build.VERSION.SDK_INT >= 33) shell("pm grant " + context.getPackageName() + " " + Manifest.permission.POST_NOTIFICATIONS);
        MusicPhoneNotifications.prefs(context).edit().clear().commit();
        context.getSharedPreferences("hymn_notification_choice", 0).edit().clear().commit();
        MusicPhoneNotifications.channels(context);
    }
    void shell(String command) throws Exception {
        try (ParcelFileDescriptor fd = InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(command);
             java.io.InputStream in = new ParcelFileDescriptor.AutoCloseInputStream(fd)) { while (in.read() != -1) {} }
    }
    @After public void cleanup() { context.getSystemService(NotificationManager.class).cancelAll(); }
    @Test public void optInPermissionAndPauseAreRespected() throws Exception {
        assertFalse(MusicPhoneNotifications.enabled(context));
        context.getSharedPreferences("hymn_notification_choice", 0).edit().putBoolean("enabled", true).commit();
        assertTrue(MusicPhoneNotifications.enabled(context));
        if (Build.VERSION.SDK_INT >= 33) {
            shell("pm revoke " + context.getPackageName() + " " + Manifest.permission.POST_NOTIFICATIONS);
            assertFalse(MusicPhoneNotifications.enabled(context));
            shell("pm grant " + context.getPackageName() + " " + Manifest.permission.POST_NOTIFICATIONS);
        }
        context.getSharedPreferences("hymn_notification_choice", 0).edit().putBoolean("enabled", false).commit();
        assertFalse(MusicPhoneNotifications.enabled(context));
    }
    @Test public void duplicateTagsPrivacyChannelsAndLogout() throws Exception {
        JSONObject item = new JSONObject().put("id", 14).put("type", "release").put("title", "Release approved").put("href", "/dashboard/releases?releaseId=3");
        MusicPhoneNotifications.show(context, "7", item); MusicPhoneNotifications.show(context, "7", item);
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        assertEquals(1, manager.getActiveNotifications().length);
        Notification notice = manager.getActiveNotifications()[0].getNotification();
        assertEquals("hymn_releases", notice.getChannelId()); assertEquals(Notification.VISIBILITY_PRIVATE, notice.visibility);
        assertEquals("HYMN Music", notice.publicVersion.extras.getString(Notification.EXTRA_TITLE));
        assertNotNull(notice.contentIntent); assertTrue((notice.flags & Notification.FLAG_AUTO_CANCEL) != 0);
        SharedPreferences p = MusicPhoneNotifications.prefs(context);
        p.edit().putString("cookie", "hymn_session=fixture-only").putString("account", "7").putString("cursor", "14").putLong("epoch", 4).commit();
        MusicPhoneNotifications.captureSession(context, "other=irrelevant");
        assertEquals("", p.getString("cookie", "")); assertFalse(p.contains("account")); assertFalse(p.contains("cursor")); assertEquals(5, p.getLong("epoch", 0));
        assertEquals(0, manager.getActiveNotifications().length);
        assertEquals("", MusicPhoneNotifications.sync(context));
    }
}
