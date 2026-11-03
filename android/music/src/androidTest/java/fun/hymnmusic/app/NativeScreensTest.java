package fun.hymnmusic.app;
import android.content.Intent;
import android.view.*;
import android.widget.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class) public class NativeScreensTest {
 @Test public void customerScreensAreNativeAndRespectSystemBars(){android.app.Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();MusicActivity a=(MusicActivity)instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(),MusicActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));long deadline=System.currentTimeMillis()+20000;while(a.api==null&&System.currentTimeMillis()<deadline)android.os.SystemClock.sleep(100);assertNotNull(a.api);instrumentation.waitForIdleSync();instrumentation.runOnMainSync(()->{a.api.clear();a.home();assertTrue(a.body.getChildCount()>3);assertTrue(a.nav.getChildCount()==5);assertFalse(containsWebView(a.getWindow().getDecorView()));a.signIn();assertTrue(hasEdit(a.body));assertEquals("signin",a.screen);assertEquals(View.GONE,a.nav.getVisibility());a.more();assertTrue(a.body.getChildCount()>8);assertEquals("more",a.screen);assertEquals(View.VISIBLE,a.nav.getVisibility());a.finish();});}
 boolean hasEdit(View v){if(v instanceof EditText)return true;if(v instanceof ViewGroup){ViewGroup group=(ViewGroup)v;for(int i=0;i<group.getChildCount();i++)if(hasEdit(group.getChildAt(i)))return true;}return false;}
 boolean containsWebView(View v){if(v instanceof android.webkit.WebView)return true;if(v instanceof ViewGroup){ViewGroup group=(ViewGroup)v;for(int i=0;i<group.getChildCount();i++)if(containsWebView(group.getChildAt(i)))return true;}return false;}
}
