package fun.hymnmusic.app;

import android.app.Dialog;
import android.content.Intent;
import android.view.*;
import android.widget.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class NativeScreensTest {
    @Test public void nativeNavigationAndSignInRemainAccessible() {
        android.app.Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
        MusicActivity a=(MusicActivity)instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(),MusicActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        long deadline=System.currentTimeMillis()+20000;
        while(a.api==null&&System.currentTimeMillis()<deadline)android.os.SystemClock.sleep(100);
        assertNotNull(a.api);instrumentation.waitForIdleSync();
        instrumentation.runOnMainSync(()->{
            a.api.clear();a.home();
            assertTrue(a.body.getChildCount()>3);
            assertEquals(5,a.nav.getChildCount());
            assertEquals(LinearLayout.VERTICAL,a.header.getOrientation());
            assertTrue(hasText(a.header,"Distribution"));assertTrue(hasText(a.header,"Beat Store"));
            assertFalse(containsWebView(a.getWindow().getDecorView()));
            a.signIn();
            assertTrue(hasEdit(a.body));assertTrue(hasGoogleButton(a.body));
            assertEquals("signin",a.screen);assertEquals(View.GONE,a.nav.getVisibility());
            Dialog drawer=a.experience.open("Explore HYMN");
            LinearLayout content=a.experience.currentDrawer;
            a.experience.group(content,drawer,"Distribution",false);
            LinearLayout group=(LinearLayout)content.getChildAt(content.getChildCount()-1);
            View links=group.getChildAt(1);
            assertEquals(View.GONE,links.getVisibility());
            group.getChildAt(0).performClick();
            assertEquals(View.VISIBLE,links.getVisibility());
            assertTrue(hasText(links,"Artist profiles"));
            group.getChildAt(0).performClick();assertEquals(View.GONE,links.getVisibility());
            drawer.dismiss();a.home();assertEquals(View.VISIBLE,a.nav.getVisibility());a.finish();
        });
    }
    boolean hasText(View v,String text){if(v instanceof TextView&&((TextView)v).getText().toString().contains(text))return true;if(v instanceof ViewGroup){ViewGroup group=(ViewGroup)v;for(int i=0;i<group.getChildCount();i++)if(hasText(group.getChildAt(i),text))return true;}return false;}
    boolean hasEdit(View v){if(v instanceof EditText)return true;if(v instanceof ViewGroup){ViewGroup group=(ViewGroup)v;for(int i=0;i<group.getChildCount();i++)if(hasEdit(group.getChildAt(i)))return true;}return false;}
    boolean hasGoogleButton(View v){if(v instanceof com.google.android.gms.common.SignInButton)return true;if(v instanceof ViewGroup){ViewGroup group=(ViewGroup)v;for(int i=0;i<group.getChildCount();i++)if(hasGoogleButton(group.getChildAt(i)))return true;}return false;}
    boolean containsWebView(View v){if(v instanceof android.webkit.WebView)return true;if(v instanceof ViewGroup){ViewGroup group=(ViewGroup)v;for(int i=0;i<group.getChildCount();i++)if(containsWebView(group.getChildAt(i)))return true;}return false;}
}
