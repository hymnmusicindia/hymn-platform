package fun.hymnmusic.team;

import android.view.View;
import android.widget.FrameLayout;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class TeamLoginViewTest {
    @Test public void captureBothThemesForVisualReview() throws Exception {
        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("wm size 390x844").close();
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            for(boolean dark:new boolean[]{false,true}){
                java.util.concurrent.CountDownLatch frame=new java.util.concurrent.CountDownLatch(1);
                scenario.onActivity(activity->{
                    TeamLoginView login=new TeamLoginView(activity,dark,()->{});
                    TeamSafeArea.configureWindow(activity.getWindow(),dark);
                    activity.setContentView(TeamSafeArea.wrap(activity,login.view,new TeamPalette(dark).background));
                    login.view.postOnAnimation(()->login.view.postOnAnimation(frame::countDown));
                });
                assertTrue("The new theme must draw before capture",frame.await(10,java.util.concurrent.TimeUnit.SECONDS));
                androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().waitForIdleSync();
                android.graphics.Bitmap screenshot=null;int pixel=0;boolean presented=false;
                for(int attempt=0;attempt<30;attempt++){
                    if(screenshot!=null)screenshot.recycle();
                    screenshot=androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
                    assertNotNull(screenshot);pixel=screenshot.getPixel(10,Math.min(100,screenshot.getHeight()-1));
                    presented=dark?android.graphics.Color.red(pixel)<100:android.graphics.Color.red(pixel)>180;
                    if(presented)break;
                    android.os.SystemClock.sleep(100);
                }
                assertTrue("Screenshot must show dark="+dark+", pixel="+Integer.toHexString(pixel),presented);
                java.io.File directory=new java.io.File(androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null),"ui-proof");
                assertTrue(directory.isDirectory()||directory.mkdirs());
                try(java.io.FileOutputStream output=new java.io.FileOutputStream(new java.io.File(directory,dark?"sign-in-dark.png":"sign-in-light.png"))){assertTrue(screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG,100,output));}
                screenshot.recycle();
            }
        }
    }
    @Test public void cardCentersOnPhoneAndTabletAndLongStatusStaysScrollable(){
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            scenario.onActivity(activity->{
                float density=activity.getResources().getDisplayMetrics().density;
                for(boolean dark:new boolean[]{false,true})for(int[] bounds:new int[][]{{320,740},{390,844},{800,1024},{320,360}}){
                    TeamLoginView login=new TeamLoginView(activity,dark,()->{});
                    int width=Math.round(bounds[0]*density),height=Math.round(bounds[1]*density);
                    login.view.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(height,View.MeasureSpec.EXACTLY));login.view.layout(0,0,width,height);
                    FrameLayout center=(FrameLayout)login.view.getChildAt(0);View card=center.findViewWithTag("team-login-card");
                    assertTrue(card.getWidth()<=Math.round(440*density));
                    assertEquals(width/2f,card.getLeft()+card.getWidth()/2f,density);
                    assertEquals(center.getHeight()/2f,card.getTop()+card.getHeight()/2f,density);
                    assertTrue(card.getLeft()>=0);assertTrue(card.getRight()<=width);
                    assertTrue(login.google.isEnabled());login.busy(true);assertFalse(login.google.isEnabled());login.busy(false);assertTrue(login.google.isEnabled());
                    login.status("Sign-in wasn't completed. Tap Continue with Google when you're ready.",false);assertEquals(View.VISIBLE,login.message.getVisibility());
                    login.status("",false);assertEquals(View.GONE,login.message.getVisibility());
                }
            });
        }
    }
}
