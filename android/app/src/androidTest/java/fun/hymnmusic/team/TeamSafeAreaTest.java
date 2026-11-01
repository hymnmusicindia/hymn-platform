package fun.hymnmusic.team;

import android.graphics.Color;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class TeamSafeAreaTest {
    @Test public void realWindowInsetsKeepTheAppBelowStatusAndAboveNavigationBars() {
        try (ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class)) {
            androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            activity.onActivity(screen -> {
                FrameLayout safe = screen.getWindow().getDecorView().findViewWithTag(TeamSafeArea.TAG);
                assertNotNull("Every app screen must use the safe-area container", safe);
                WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(safe);
                assertNotNull(insets);
                Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                assertTrue("Status bar needs real device spacing", bars.top > 0);
                assertEquals(bars.top, safe.getPaddingTop());
                assertEquals(bars.left, safe.getPaddingLeft());
                assertEquals(bars.right, safe.getPaddingRight());
                assertEquals(Math.max(bars.bottom, insets.getInsets(WindowInsetsCompat.Type.ime()).bottom), safe.getPaddingBottom());
                assertTrue(safe.getChildAt(0).getTop() >= bars.top);
                assertTrue(safe.getChildAt(0).getBottom() <= safe.getHeight() - bars.bottom);
            });
            activity.recreate();
            androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            activity.onActivity(screen -> assertNotNull(screen.getWindow().getDecorView().findViewWithTag(TeamSafeArea.TAG)));
        }
    }

    @Test public void headerAndTabsStayInsideChangingBarsCutoutsAndKeyboardWithoutDoublePadding() {
        try (ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class)) {
            activity.onActivity(screen -> {
                LinearLayout layout = new LinearLayout(screen); layout.setOrientation(LinearLayout.VERTICAL);
                View header = new View(screen), content = new View(screen), tabs = new View(screen);
                layout.setPadding(8, 7, 8, 5);
                layout.addView(header, new LinearLayout.LayoutParams(-1, 56));
                layout.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
                layout.addView(tabs, new LinearLayout.LayoutParams(-1, 72));
                FrameLayout safe = TeamSafeArea.wrap(screen, layout, Color.WHITE);
                // Gesture navigation, three-button navigation, a landscape cutout and keyboard.
                int[][] states = {{0,24,0,24,0},{0,32,0,48,0},{48,24,0,24,0},{0,24,0,24,300},{0,24,0,24,0}};
                for (int[] state : states) {
                    WindowInsetsCompat insets = new WindowInsetsCompat.Builder()
                        .setInsets(WindowInsetsCompat.Type.systemBars(), Insets.of(0,state[1],0,state[3]))
                        .setInsets(WindowInsetsCompat.Type.displayCutout(), Insets.of(state[0],0,state[2],0))
                        .setInsets(WindowInsetsCompat.Type.ime(), Insets.of(0,0,0,state[4]))
                        .build();
                    for (int repeat = 0; repeat < 3; repeat++) ViewCompat.dispatchApplyWindowInsets(safe, insets);
                    safe.measure(View.MeasureSpec.makeMeasureSpec(400, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(800, View.MeasureSpec.EXACTLY));
                    safe.layout(0,0,400,800);
                    assertEquals(state[0], safe.getPaddingLeft());
                    assertEquals(state[1], safe.getPaddingTop());
                    assertEquals(state[2], safe.getPaddingRight());
                    assertEquals(Math.max(state[3],state[4]), safe.getPaddingBottom());
                    assertTrue(layout.getTop() + header.getTop() >= state[1] + 7);
                    assertTrue(layout.getTop() + tabs.getBottom() <= 800 - Math.max(state[3],state[4]) - 5);
                    assertTrue(layout.getLeft() + header.getLeft() >= state[0] + 8);
                    assertEquals(7, layout.getPaddingTop());
                    assertEquals(5, layout.getPaddingBottom());
                }
            });
        }
    }
}
