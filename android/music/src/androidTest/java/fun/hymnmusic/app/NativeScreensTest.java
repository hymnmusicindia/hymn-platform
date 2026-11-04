package fun.hymnmusic.app;
import android.app.Activity;
import android.content.*;
import android.net.Uri;
import android.view.View;
import android.webkit.WebSettings;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public class NativeScreensTest {
 @Test public void websiteShellProtectsUploadsAndKeepsAuthAccessible(){
  android.app.Instrumentation i=InstrumentationRegistry.getInstrumentation();
  MusicWebActivity a=(MusicWebActivity)i.startActivitySync(new Intent(i.getTargetContext(),MusicWebActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
  i.runOnMainSync(()->{
   assertNotNull(a.web);assertTrue(a.web.getSettings().getJavaScriptEnabled());assertTrue(a.web.getSettings().getDomStorageEnabled());
   assertFalse(a.web.getSettings().getAllowFileAccess());assertFalse(a.web.getSettings().getAllowUniversalAccessFromFileURLs());
   assertEquals(WebSettings.MIXED_CONTENT_NEVER_ALLOW,a.web.getSettings().getMixedContentMode());
   assertTrue(a.route("file:///etc/passwd"));assertTrue(a.route("javascript:alert(1)"));assertFalse(a.route("https://hymnmusic.fun/distribution/start"));
   a.updateGoogle("https://hymnmusic.fun/auth");assertEquals(View.VISIBLE,a.google.getVisibility());
   a.updateGoogle("https://hymnmusic.fun/beat-store");assertEquals(View.GONE,a.google.getVisibility());
   final Uri[][] chosen=new Uri[1][];
   a.upload=value->chosen[0]=value;a.onActivityResult(MusicWebActivity.UPLOAD,Activity.RESULT_OK,new Intent().setData(Uri.parse("content://fixture/audio.wav")));
   assertEquals("content",chosen[0][0].getScheme());assertNull(a.upload);
   a.upload=value->chosen[0]=value;a.onActivityResult(MusicWebActivity.UPLOAD,Activity.RESULT_OK,new Intent().setData(Uri.parse("file:///private/data")));
   assertNull(chosen[0]);assertNull(a.upload);
   a.upload=value->chosen[0]=value;a.onActivityResult(MusicWebActivity.UPLOAD,Activity.RESULT_CANCELED,null);assertNull(chosen[0]);assertNull(a.upload);a.finish();
  });
 }
}
