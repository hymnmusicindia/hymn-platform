package fun.hymnmusic.app;
import org.junit.Test;
import static org.junit.Assert.*;

public class MusicNotificationPolicyTest {
    @Test public void onlyTheCustomerSessionIsStored() {
        assertEquals("hymn_session=abc", MusicNotificationPolicy.sessionCookie("other=secret; hymn_session=abc; admin=private"));
        assertEquals("", MusicNotificationPolicy.sessionCookie(null));
        assertEquals("", MusicNotificationPolicy.sessionCookie("hymn_session=; hymn_admin_session=secret"));
        assertEquals("", MusicNotificationPolicy.sessionCookie("fake_hymn_session=abc"));
    }
    @Test public void tapsStayOnSafeCustomerPages() {
        assertEquals("https://hymnmusic.fun/dashboard/releases?releaseId=12", MusicNotificationPolicy.destination("/dashboard/releases?releaseId=12"));
        for (String href : new String[]{null,"//evil.test","https://evil.test/","https://user@hymnmusic.fun/","/api/auth/logout","/auth","javascript:alert(1)","/\\evil.test","https://hymnmusic.fun:444/"})
            assertEquals(String.valueOf(href), "https://hymnmusic.fun/dashboard", MusicNotificationPolicy.destination(href));
    }
    @Test public void notificationCategoriesAreStable() {
        assertEquals("hymn_releases", MusicNotificationPolicy.channel("release"));
        assertEquals("hymn_store", MusicNotificationPolicy.channel("beat"));
        assertEquals("hymn_store", MusicNotificationPolicy.channel("order"));
        assertEquals("hymn_account", MusicNotificationPolicy.channel("system"));
    }
}
