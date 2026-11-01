package fun.hymnmusic.team;

import android.app.Activity;
import android.graphics.Color;
import android.view.View;
import android.view.Window;
import android.widget.FrameLayout;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

/** Keeps the complete app UI inside the current device's usable window bounds. */
final class TeamSafeArea {
    static final String TAG = "hymn-team-safe-area";

    static void configureWindow(Window window, boolean nightMode) {
        WindowCompat.setDecorFitsSystemWindows(window, false);
        // Older Android versions need transparent bars for the same edge-to-edge geometry.
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setAppearanceLightStatusBars(!nightMode);
        controller.setAppearanceLightNavigationBars(!nightMode);
    }

    static FrameLayout wrap(Activity activity, View screen, int background) {
        FrameLayout safeArea = new FrameLayout(activity);
        safeArea.setTag(TAG);
        safeArea.setBackgroundColor(background);
        safeArea.setClipToPadding(true);
        safeArea.addView(screen, new FrameLayout.LayoutParams(-1, -1));
        ViewCompat.setOnApplyWindowInsetsListener(safeArea, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets keyboard = insets.getInsets(WindowInsetsCompat.Type.ime());
            // Replace the padding on every dispatch: rotation, keyboard changes and screen
            // navigation must never accumulate padding or add navigation-bar height twice.
            view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
            // Children already sit inside the safe rectangle; don't apply those insets again.
            return WindowInsetsCompat.CONSUMED;
        });
        return safeArea;
    }
}
