package fun.hymnmusic.team;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.app.TimePickerDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.content.pm.PackageManager;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.text.TextUtils;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.PopupWindow;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONArray;
import java.text.DateFormat;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.ArrayList;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.atomic.AtomicInteger;
import java.net.HttpURLConnection;
import java.net.URL;

/** Native HYMN Team app. All records and permissions come from the HYMN Team API. */
public final class MainActivity extends Activity {
    private int NAVY, MUTED, BG, BLUE, BORDER;
    // Separate requests keep a slow module from blocking navigation or sign-in callbacks.
    private final ExecutorService io = Executors.newFixedThreadPool(4);
    private final AtomicInteger screenGeneration = new AtomicInteger();
    private TeamApi api;
    private LinearLayout root, top, content, bottom;
    private TextView heading, message;
    private ProgressBar progress;
    private String workspace = "", memberId = "", memberName = "", page = "home", tool = "";
    private String chatChannelId = "", chatChannelName = "";
    private String workBucket = "today";
    private String taskFilter = "all";
    private boolean notificationSyncStarted = false;
    private boolean nightMode = false;
    private String previousPage = "home";
    private String profileImageUrl = "";
    private JSONArray inboxItems = new JSONArray();
    private TextView inboxBadge;
    private volatile Bitmap cachedProfileBitmap;
    private volatile String cachedProfileUrl = "";
    private JSONObject session;
    private JSONObject activeWorkDetail;
    private boolean workActionBusy = false;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        nightMode = getSharedPreferences("hymn_team_settings", MODE_PRIVATE).getBoolean("night_mode", false); applyThemePalette();
        api = new TeamApi(this);
        if (api.cookie().isEmpty()) showLogin(); else loadSession();
    }

    private int dp(float value) { return (int)(value * getResources().getDisplayMetrics().density + 0.5f); }
    private int surface() { return nightMode ? Color.rgb(23, 33, 49) : Color.WHITE; }
    private void applyThemePalette() {
        NAVY = nightMode ? Color.rgb(232, 238, 248) : Color.rgb(16, 30, 50);
        MUTED = nightMode ? Color.rgb(159, 174, 195) : Color.rgb(101, 116, 139);
        BG = nightMode ? Color.rgb(14, 21, 33) : Color.rgb(244, 246, 249);
        BLUE = nightMode ? Color.rgb(133, 177, 255) : Color.rgb(40, 92, 180);
        BORDER = nightMode ? Color.rgb(45, 60, 81) : Color.rgb(224, 230, 238);
        if (getWindow() != null) { getWindow().setStatusBarColor(BG); getWindow().setNavigationBarColor(surface()); getWindow().getDecorView().setSystemUiVisibility(nightMode ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR); }
    }
    private GradientDrawable shape(int color, int stroke, int radius) { GradientDrawable d = new GradientDrawable(); d.setColor(color); d.setCornerRadius(dp(radius)); if (stroke != 0) d.setStroke(dp(1), stroke); return d; }
    private TextView text(String value, float size, int color, boolean bold) { TextView v = new TextView(this); v.setText(value); v.setTextSize(size); v.setTextColor(color); if (bold) v.setTypeface(Typeface.DEFAULT, Typeface.BOLD); return v; }
    private void styleInput(EditText input) { input.setTextColor(NAVY); input.setHintTextColor(MUTED); }

    private void showLogin() {
        LinearLayout screen = new LinearLayout(this); screen.setOrientation(LinearLayout.VERTICAL); screen.setGravity(Gravity.CENTER_HORIZONTAL); screen.setPadding(dp(26), dp(42), dp(26), dp(30)); screen.setBackgroundColor(BG);
        ImageView logo = new ImageView(this); logo.setImageResource(R.drawable.hymn_logo); logo.setScaleType(ImageView.ScaleType.FIT_CENTER); screen.addView(logo, new LinearLayout.LayoutParams(dp(76), dp(76)));
        TextView title = text("Your team, in your pocket.", 25, NAVY, true); title.setGravity(Gravity.CENTER); LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(-1, -2); tp.topMargin = dp(24); screen.addView(title, tp);
        TextView sub = text("Work, schedules and team updates in one place.", 14, MUTED, false); sub.setGravity(Gravity.CENTER); LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-1, -2); sp.topMargin = dp(10); sp.bottomMargin = dp(34); screen.addView(sub, sp);
        Button google = button("G     Continue with Google", true); screen.addView(google, new LinearLayout.LayoutParams(-1, dp(54))); google.setOnClickListener(v -> beginGoogleSignIn());
        message = text("", 12, Color.rgb(180, 45, 45), false); LinearLayout.LayoutParams mp = new LinearLayout.LayoutParams(-1, -2); mp.topMargin = dp(14); screen.addView(message, mp);
        TextView footer = text("Secure sign-in with your HYMN team Google account", 12, MUTED, false); footer.setGravity(Gravity.CENTER); LinearLayout.LayoutParams fp = new LinearLayout.LayoutParams(-1, -2); fp.topMargin = dp(30); screen.addView(footer, fp);
        setContentView(screen);
    }

    private Button button(String label, boolean primary) {
        Button b = new Button(this); b.setText(label); b.setAllCaps(false); b.setTextSize(14); b.setTypeface(Typeface.DEFAULT, Typeface.BOLD); b.setTextColor(primary ? (nightMode ? Color.rgb(16, 30, 50) : Color.WHITE) : NAVY); b.setBackground(shape(primary ? (nightMode ? BLUE : NAVY) : surface(), primary ? (nightMode ? BLUE : NAVY) : BORDER, 13));
        return b;
    }

    private void beginGoogleSignIn() {
        if (BuildConfig.GOOGLE_WEB_CLIENT_ID.isEmpty()) { message.setText("Google sign-in is not configured in this APK. Build with the HYMN web OAuth client ID."); return; }
        message.setText("Opening secure Google sign-in…");
        try {
            GetGoogleIdOption option = new GetGoogleIdOption.Builder().setFilterByAuthorizedAccounts(false).setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID).setAutoSelectEnabled(false).build();
            GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
            CredentialManager manager = CredentialManager.create(this);
            manager.getCredentialAsync(this, request, null, io, new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override public void onResult(GetCredentialResponse response) { submitGoogleCredential(response.getCredential()); }
                @Override public void onError(@NonNull GetCredentialException error) { runOnUiThread(() -> message.setText("Google sign-in failed: " + safe(error.getMessage()))); }
            });
        } catch (Exception e) { message.setText("Google sign-in could not start. Please try again."); }
    }

    private void submitGoogleCredential(Credential credential) {
        io.execute(() -> {
            try {
                if (!(credential instanceof CustomCredential)) throw new IllegalStateException("Choose a Google account to continue.");
                GoogleIdTokenCredential google = GoogleIdTokenCredential.createFrom(((CustomCredential) credential).getData());
                memberName = google.getDisplayName() == null ? "Team member" : google.getDisplayName();
                Uri picture = google.getProfilePictureUri();
                if (picture != null) { profileImageUrl = picture.toString(); getSharedPreferences("hymn_team_settings", MODE_PRIVATE).edit().putString("profile_picture_url", profileImageUrl).apply(); }
                JSONObject payload = new JSONObject().put("credential", google.getIdToken());
                api.request("POST", "/api/auth/google", payload, false);
                JSONObject saved = api.get("session", "", ""); session = saved;
                workspace = saved.optString("workspaceId", ""); memberName = saved.optString("name", "Team member");
                memberId = saved.optString("memberId", "");
                if (saved.has("avatarUrl") && !saved.isNull("avatarUrl") && !saved.optString("avatarUrl").isEmpty()) profileImageUrl = saved.optString("avatarUrl");
                else if (profileImageUrl.isEmpty()) profileImageUrl = getSharedPreferences("hymn_team_settings", MODE_PRIVATE).getString("profile_picture_url", "");
                if (workspace.isEmpty()) throw new IllegalStateException("This Google account does not have an active HYMN team membership.");
                runOnUiThread(() -> showPage("home"));
            } catch (Exception e) { api.clear(); runOnUiThread(() -> { showLogin(); message.setText(safe(e.getMessage())); }); }
        });
    }

    private void loadSession() {
        showLoading("Connecting to HYMN Team…");
        io.execute(() -> {
            try {
                JSONObject result = api.get("session", "", "");
                session = result; workspace = result.optString("workspaceId", ""); memberId = result.optString("memberId", ""); memberName = result.optString("name", "Team member");
                profileImageUrl = result.optString("avatarUrl", "");
                if (profileImageUrl.isEmpty() || profileImageUrl.equals("null")) profileImageUrl = getSharedPreferences("hymn_team_settings", MODE_PRIVATE).getString("profile_picture_url", "");
                if (workspace.isEmpty()) throw new IllegalStateException("No active HYMN team membership found.");
                session = result; runOnUiThread(() -> showPage(getIntent().getStringExtra("screen") == null ? "home" : getIntent().getStringExtra("screen")));
            } catch (Exception e) { api.clear(); runOnUiThread(this::showLogin); }
        });
    }

    private void showLoading(String label) {
        LinearLayout screen = new LinearLayout(this); screen.setGravity(Gravity.CENTER); screen.setOrientation(LinearLayout.VERTICAL); screen.setBackgroundColor(BG);
        ImageView logo = new ImageView(this); logo.setImageResource(R.drawable.hymn_logo); screen.addView(logo, new LinearLayout.LayoutParams(dp(72), dp(72)));
        ProgressBar bar = new ProgressBar(this); LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(dp(44), dp(44)); bp.topMargin = dp(22); screen.addView(bar, bp);
        TextView t = text(label, 14, MUTED, false); LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(-2, -2); tp.topMargin = dp(12); screen.addView(t, tp); setContentView(screen);
    }

    private void showPage(String next) {
        if (!next.equals(page) && !next.equals("workspace-detail")) previousPage = page;
        page = next; tool = ""; screenGeneration.incrementAndGet();
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(BG);
        bottom = null;
        top = new LinearLayout(this); top.setGravity(Gravity.CENTER_VERTICAL); top.setPadding(dp(8), dp(7), dp(8), dp(7)); top.setBackgroundColor(surface());
        ImageView back = new ImageView(this); back.setImageResource(R.drawable.ic_back); back.setColorFilter(NAVY); back.setScaleType(ImageView.ScaleType.CENTER); back.setPadding(dp(11), dp(11), dp(11), dp(11)); back.setBackground(shape(surface(), BORDER, 13)); back.setClickable(true); back.setFocusable(true); LinearLayout.LayoutParams backParams = new LinearLayout.LayoutParams(dp(44), dp(44)); backParams.rightMargin = dp(5); top.addView(back, backParams); back.setOnClickListener(v -> navigateBack());
        ImageView logo = new ImageView(this); logo.setImageResource(R.drawable.hymn_logo); logo.setScaleType(ImageView.ScaleType.FIT_CENTER); LinearLayout.LayoutParams logoParams = new LinearLayout.LayoutParams(dp(32), dp(32)); logoParams.rightMargin = dp(5); top.addView(logo, logoParams);
        LinearLayout titleBox = new LinearLayout(this); titleBox.setOrientation(LinearLayout.VERTICAL); titleBox.setPadding(dp(2), 0, dp(4), 0); heading = text("HYMN TEAM", 9, MUTED, true); titleBox.addView(heading); TextView workspaceLabel = text("HYMN  ·  " + session.optString("workspaceName", "Team workspace"), 11, NAVY, true); workspaceLabel.setSingleLine(true); workspaceLabel.setEllipsize(TextUtils.TruncateAt.END); LinearLayout.LayoutParams workspaceParams = new LinearLayout.LayoutParams(-1, -2); workspaceParams.topMargin = dp(3); titleBox.addView(workspaceLabel, workspaceParams); top.addView(titleBox, new LinearLayout.LayoutParams(0, -2, 1)); workspaceLabel.setOnClickListener(v -> showPage("workspace-detail"));
        FrameLayout avatarFrame = new FrameLayout(this); LinearLayout.LayoutParams avatarFrameParams = new LinearLayout.LayoutParams(dp(38), dp(38)); avatarFrameParams.leftMargin = dp(3); top.addView(avatarFrame, avatarFrameParams);
        TextView avatarFallback = text(firstName(memberName).substring(0, 1).toUpperCase(Locale.ROOT), 14, Color.WHITE, true); avatarFallback.setGravity(Gravity.CENTER); avatarFallback.setBackground(shape(nightMode ? Color.rgb(50, 72, 105) : BLUE, 0, 20)); avatarFrame.addView(avatarFallback, new FrameLayout.LayoutParams(-1, -1));
        ImageView avatar = new ImageView(this); avatar.setScaleType(ImageView.ScaleType.CENTER_CROP); avatar.setBackground(shape(Color.TRANSPARENT, 0, 20)); avatar.setClipToOutline(true); avatarFrame.addView(avatar, new FrameLayout.LayoutParams(-1, -1)); String avatarUrl = profileImageUrl; if (!avatarUrl.isEmpty() && !avatarUrl.equals("null")) loadAvatar(avatar, avatarUrl); avatarFrame.setOnClickListener(v -> showPage("workspace-detail"));
        FrameLayout inboxFrame = new FrameLayout(this); LinearLayout.LayoutParams inboxParams = new LinearLayout.LayoutParams(dp(42), dp(44)); inboxParams.leftMargin = dp(2); top.addView(inboxFrame, inboxParams); ImageView inboxIcon = new ImageView(this); inboxIcon.setImageResource(R.drawable.ic_inbox_nav); inboxIcon.setColorFilter(NAVY); inboxIcon.setPadding(dp(11), dp(11), dp(11), dp(11)); inboxIcon.setBackground(shape(surface(), BORDER, 13)); inboxFrame.addView(inboxIcon, new FrameLayout.LayoutParams(-1, -1)); inboxIcon.setOnClickListener(v -> showInboxPopup(inboxIcon)); inboxBadge = text("", 8, Color.WHITE, true); inboxBadge.setGravity(Gravity.CENTER); inboxBadge.setBackground(shape(Color.rgb(208, 54, 64), 0, 10)); FrameLayout.LayoutParams badgeParams = new FrameLayout.LayoutParams(dp(17), dp(17), Gravity.TOP | Gravity.END); inboxFrame.addView(inboxBadge, badgeParams); inboxBadge.setVisibility(View.GONE); updateInboxBadge();
        ImageView refresh = new ImageView(this); refresh.setImageResource(R.drawable.ic_refresh); refresh.setColorFilter(NAVY); refresh.setPadding(dp(10), dp(10), dp(10), dp(10)); refresh.setBackground(shape(surface(), BORDER, 13)); LinearLayout.LayoutParams refreshParams = new LinearLayout.LayoutParams(dp(40), dp(44)); refreshParams.leftMargin = dp(4); top.addView(refresh, refreshParams); refresh.setOnClickListener(v -> loadPageData());
        Button logout = button("Sign out", false); logout.setTextSize(10); logout.setPadding(dp(7), 0, dp(7), 0); LinearLayout.LayoutParams logoutParams = new LinearLayout.LayoutParams(-2, dp(44)); logoutParams.leftMargin = dp(5); top.addView(logout, logoutParams); logout.setOnClickListener(v -> confirmSignOut()); root.addView(top);        ScrollView scroll = new ScrollView(this); content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(dp(16), dp(16), dp(16), dp(22)); scroll.setFillViewport(true); scroll.addView(content); root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        if (!page.equals("workspace-detail")) { bottom = new LinearLayout(this); bottom.setGravity(Gravity.CENTER); bottom.setBackgroundColor(surface()); bottom.setPadding(dp(5), dp(5), dp(5), dp(5)); root.addView(bottom, new LinearLayout.LayoutParams(-1, dp(72))); }
        setContentView(root); if (bottom != null && !page.equals("workspace-detail")) buildNavigation(); loadPageData(); startNotificationSync();
    }

    private void buildNavigation() {
        String[] labels = {"Home", "Work-station", "Schedule", "Inbox", "Tools"}; int[] icons = {R.drawable.ic_home_nav, R.drawable.ic_workstation_nav, R.drawable.ic_calendar_nav, R.drawable.ic_inbox_nav, R.drawable.ic_tools_nav}; String[] keys = {"home", "workstation", "schedule", "alerts", "more"};
        for (int i = 0; i < labels.length; i++) {
            final String key = keys[i]; boolean selected = page.equals(key);
            LinearLayout item = new LinearLayout(this); item.setGravity(Gravity.CENTER); item.setOrientation(LinearLayout.VERTICAL); item.setBackground(shape(selected ? (nightMode ? Color.rgb(35, 53, 78) : Color.rgb(235, 242, 255)) : Color.TRANSPARENT, 0, 14)); bottom.addView(item, new LinearLayout.LayoutParams(0, -1, 1));
            ImageView icon = new ImageView(this); icon.setImageResource(icons[i]); icon.setColorFilter(selected ? BLUE : MUTED); icon.setPadding(dp(2), dp(2), dp(2), dp(2)); LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(dp(22), dp(22)); iconParams.bottomMargin = dp(3); item.addView(icon, iconParams);
            TextView label = text(labels[i], 10, selected ? BLUE : MUTED, selected); label.setGravity(Gravity.CENTER); item.addView(label);
            item.setOnClickListener(v -> showPage(key));
        }
    }

    private void loadPageData() {
        if (content == null) return;
        final int generation = screenGeneration.incrementAndGet(); final String requestedPage = page; final String requestedTool = tool;
        content.removeAllViews(); heading.setText(requestedTool.isEmpty() ? "HYMN  /  " + requestedPage.toUpperCase(Locale.ROOT) : toolName(requestedTool).toUpperCase(Locale.ROOT));
        if (requestedPage.equals("home")) renderHomeLoading();
        else { TextView wait = text(requestedTool.equals("workstation") || requestedPage.equals("workstation") ? "Loading your work queue…" : "Loading your workspace…", 13, MUTED, false); content.addView(wait); }
        io.execute(() -> {
            try {
                if (requestedPage.equals("home")) {
                    CompletableFuture<JSONObject> overview = CompletableFuture.supplyAsync(() -> readApi("overview", ""), io);
                    CompletableFuture<JSONObject> upcoming = CompletableFuture.supplyAsync(() -> readApi("calendar", calendarQuery()), io);
                    CompletableFuture<JSONObject> inbox = CompletableFuture.supplyAsync(() -> readApi("notifications", "offset=0"), io);
                    CompletableFuture<JSONObject> tasks = CompletableFuture.supplyAsync(() -> readApi("tasks", "mine=1&offset=0"), io);
                    JSONObject overviewData = homeResult(overview), calendarData = homeResult(upcoming), inboxData = homeResult(inbox), taskData = homeResult(tasks);
                    boolean partial = overview.isCompletedExceptionally() || upcoming.isCompletedExceptionally() || inbox.isCompletedExceptionally() || tasks.isCompletedExceptionally();
                    runOnUiThread(() -> { if (screenGeneration.get() == generation) { TeamCallReminderScheduler.sync(getApplicationContext(), calendarData.optJSONArray("callReminders"), memberId); updateInboxSummary(inboxData); renderHome(overviewData, taskData, calendarData, inboxData, partial); } });
                } else if (requestedPage.equals("workspace-detail")) {
                    JSONObject overview = api.get("overview", workspace, ""); runOnUiThread(() -> { if (screenGeneration.get() == generation) renderWorkspaceDetail(overview); });
                } else if (requestedPage.equals("tasks")) {
                    String query = "mine=1&offset=0" + (taskFilter.equals("all") ? "" : "&status=" + taskFilter);
                    JSONObject tasks = api.get("tasks", workspace, query); runOnUiThread(() -> { if (screenGeneration.get() == generation) renderRows("My assigned tasks", tasks.optJSONArray("items"), "tasks"); });
                } else if (requestedPage.equals("schedule")) {
                    JSONObject calendar = calendarRange(); runOnUiThread(() -> { if (screenGeneration.get() == generation) { TeamCallReminderScheduler.sync(getApplicationContext(), calendar.optJSONArray("callReminders"), memberId); renderRows("Coming up", calendar.optJSONArray("items"), "schedule"); } });
                } else if (requestedPage.equals("alerts")) {
                    JSONObject inbox = api.get("notifications", workspace, "offset=0"); runOnUiThread(() -> { if (screenGeneration.get() == generation) { updateInboxSummary(inbox); renderRows("Notifications", inbox.optJSONArray("items"), "alerts"); } });
                } else if (requestedPage.equals("workstation")) loadTool("workstation", generation);
                else if (requestedTool.equals("notifications")) runOnUiThread(() -> { if (screenGeneration.get() == generation) renderTool("notifications", new JSONObject()); });
                else if (!requestedTool.isEmpty()) loadTool(requestedTool, generation);
                else runOnUiThread(() -> { if (screenGeneration.get() == generation) renderTools(); });
            } catch (Exception e) { runOnUiThread(() -> { if (screenGeneration.get() == generation) renderError(e.getMessage()); }); }
        });
    }

    private JSONObject readApi(String resource, String query) { try { return api.get(resource, workspace, query); } catch (Exception error) { throw new CompletionException(error); } }
    private JSONObject homeResult(CompletableFuture<JSONObject> request) { try { return request.join(); } catch (Exception ignored) { return new JSONObject(); } }

    private void renderHomeLoading() {
        addText("Good to see you, " + firstName(memberName) + ".", 23, NAVY, true); addText("Your work and schedule, together.", 13, MUTED, false); addSpace(16);
        LinearLayout card = new LinearLayout(this); card.setGravity(Gravity.CENTER_VERTICAL); card.setPadding(dp(15), dp(14), dp(15), dp(14)); card.setBackground(shape(surface(), BORDER, 14));
        ProgressBar spinner = new ProgressBar(this); LinearLayout.LayoutParams pp = new LinearLayout.LayoutParams(dp(22), dp(22)); pp.rightMargin = dp(12); card.addView(spinner, pp);
        card.addView(text("Syncing your latest team updates…", 13, MUTED, false)); LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(-1, -2); cp.bottomMargin = dp(18); content.addView(card, cp);
        addSectionTitle("Quick access");
        String[][] shortcuts = {{"Schedule", "schedule"}, {"Open inbox", "alerts"}};
        for (String[] shortcut : shortcuts) { Button action = button(shortcut[0] + "  →", false); LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams(-1, dp(48)); ap.bottomMargin = dp(8); content.addView(action, ap); action.setOnClickListener(v -> showPage(shortcut[1])); }
    }

    private String calendarQuery() {
        Calendar now = Calendar.getInstance(TimeZone.getTimeZone("Asia/Kolkata")); Calendar end = (Calendar) now.clone(); end.add(Calendar.DAY_OF_YEAR, 14);
        try { return "start=" + java.net.URLEncoder.encode(now.toInstant().toString(), "UTF-8") + "&end=" + java.net.URLEncoder.encode(end.toInstant().toString(), "UTF-8"); } catch (Exception ignored) { return ""; }
    }

    private JSONObject calendarRange() throws Exception {
        Calendar now = Calendar.getInstance(TimeZone.getTimeZone("Asia/Kolkata")); Calendar end = (Calendar) now.clone(); end.add(Calendar.DAY_OF_YEAR, 14);
        String start = java.net.URLEncoder.encode(now.toInstant().toString(), "UTF-8"), finish = java.net.URLEncoder.encode(end.toInstant().toString(), "UTF-8");
        return api.get("calendar", workspace, "start=" + start + "&end=" + finish);
    }

    private void renderHome(JSONObject overview, JSONObject tasksData, JSONObject calendar, JSONObject inbox, boolean partial) {
        content.removeAllViews(); addText("Good to see you, " + firstName(memberName) + ".", 23, NAVY, true); addText("Your work and schedule, together.", 13, MUTED, false); addSpace(16);
        if (partial) { TextView notice = text("Some details are taking longer to sync. Your workspace is still ready.", 12, BLUE, true); notice.setPadding(dp(13), dp(12), dp(13), dp(12)); notice.setBackground(shape(nightMode ? Color.rgb(28, 45, 69) : Color.rgb(235, 242, 255), 0, 12)); LinearLayout.LayoutParams np = new LinearLayout.LayoutParams(-1, -2); np.bottomMargin = dp(12); content.addView(notice, np); }
        addWorkspaceCard();
        LinearLayout metrics = new LinearLayout(this); metrics.setOrientation(LinearLayout.HORIZONTAL);
        addMetric(metrics, "OPEN TASKS", overview.optInt("active")); addMetric(metrics, "DUE SOON", count(calendar.optJSONArray("deadlines"))); addMetric(metrics, "NEW ALERTS", unread(inbox.optJSONArray("items"))); content.addView(metrics);
        addPieChart(overview);
        addSpace(22); addSectionTitle("Coming up"); JSONArray events = calendar.optJSONArray("items"); if (events == null || events.length() == 0) addEmpty("Nothing scheduled in the next 14 days."); else for (int i = 0; i < Math.min(events.length(), 5); i++) addRecord(events.optJSONObject(i), "schedule");
        addSpace(16); addSectionTitle("Your tasks"); JSONArray tasks = tasksData.optJSONArray("items"); if (tasks == null || tasks.length() == 0) addEmpty("You’re clear for now. New assignments will appear here."); else for (int i = 0; i < Math.min(tasks.length(), 4); i++) addRecord(tasks.optJSONObject(i), "tasks");
        if (tasks != null && tasks.length() > 0) { Button allTasks = button("View all assigned tasks  →", false); LinearLayout.LayoutParams taskParams = new LinearLayout.LayoutParams(-1, dp(46)); taskParams.bottomMargin = dp(10); content.addView(allTasks, taskParams); allTasks.setOnClickListener(v -> showPage("tasks")); }
    }

    private void addWorkspaceCard() {
        LinearLayout card = new LinearLayout(this); card.setGravity(Gravity.CENTER_VERTICAL); card.setPadding(dp(15), dp(13), dp(12), dp(13)); card.setBackground(shape(surface(), BORDER, 15)); LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(-1, -2); cp.bottomMargin = dp(14); content.addView(card, cp);
        LinearLayout identity = new LinearLayout(this); identity.setOrientation(LinearLayout.VERTICAL); card.addView(identity, new LinearLayout.LayoutParams(0, -2, 1)); identity.addView(text("ACTIVE WORKSPACE", 9, MUTED, true)); TextView name = text(session.optString("workspaceName", "HYMN Team"), 15, NAVY, true); LinearLayout.LayoutParams np = new LinearLayout.LayoutParams(-1, -2); np.topMargin = dp(4); identity.addView(name, np); Button details = button("Details  ›", false); card.addView(details, new LinearLayout.LayoutParams(-2, dp(42))); card.setOnClickListener(v -> showPage("workspace-detail")); details.setOnClickListener(v -> showPage("workspace-detail"));
    }

    private void addPieChart(JSONObject overview) {
        addSpace(14); addSectionTitle("Task analytics");
        String[] labels = {"To do", "In progress", "In review", "Blocked", "Completed", "Backlog"}; String[] keys = {"TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "COMPLETED", "BACKLOG"}; int[] values = new int[keys.length]; JSONArray breakdown = overview.optJSONArray("statusBreakdown");
        if (breakdown != null) for (int i = 0; i < breakdown.length(); i++) { JSONObject row = breakdown.optJSONObject(i); if (row == null) continue; int amount = row.optInt("_count", 0); JSONObject count = row.optJSONObject("_count"); if (count != null) amount = count.optInt("_all", count.optInt("status", 0)); for (int j = 0; j < keys.length; j++) if (keys[j].equals(row.optString("status"))) values[j] = amount; }
        int[] colors = {Color.rgb(73, 130, 220), Color.rgb(60, 165, 145), Color.rgb(157, 119, 220), Color.rgb(220, 147, 67), Color.rgb(70, 165, 104), Color.rgb(128, 143, 164)};
        LinearLayout card = new LinearLayout(this); card.setGravity(Gravity.CENTER_VERTICAL); card.setPadding(dp(12), dp(12), dp(12), dp(12)); card.setBackground(shape(surface(), BORDER, 15)); LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(-1, -2); cp.bottomMargin = dp(12); content.addView(card, cp);
        PieChartView chart = new PieChartView(values, colors); card.addView(chart, new LinearLayout.LayoutParams(dp(142), dp(142)));
        LinearLayout legend = new LinearLayout(this); legend.setOrientation(LinearLayout.VERTICAL); LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -2, 1); lp.leftMargin = dp(12); card.addView(legend, lp);
        int total = 0; for (int value : values) total += value;
        for (int i = 0; i < labels.length; i++) { LinearLayout line = new LinearLayout(this); line.setGravity(Gravity.CENTER_VERTICAL); LinearLayout.LayoutParams lineParams = new LinearLayout.LayoutParams(-1, -2); lineParams.bottomMargin = dp(7); legend.addView(line, lineParams); View swatch = new View(this); swatch.setBackground(shape(colors[i], 0, 4)); LinearLayout.LayoutParams swatchParams = new LinearLayout.LayoutParams(dp(8), dp(8)); swatchParams.rightMargin = dp(7); line.addView(swatch, swatchParams); line.addView(text(labels[i], 10, MUTED, false), new LinearLayout.LayoutParams(0, -2, 1)); line.addView(text(String.valueOf(values[i]), 11, NAVY, true)); }
        TextView caption = text(total + " tasks tracked", 10, MUTED, false); caption.setGravity(Gravity.CENTER); LinearLayout.LayoutParams cap = new LinearLayout.LayoutParams(-1, -2); cap.topMargin = dp(2); legend.addView(caption, cap);
    }

    private final class PieChartView extends View {
        private final int[] values, colors; private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG); private final RectF bounds = new RectF();
        PieChartView(int[] values, int[] colors) { super(MainActivity.this); this.values = values; this.colors = colors; }
        @Override protected void onDraw(Canvas canvas) { super.onDraw(canvas); float size = Math.min(getWidth(), getHeight()) - dp(12); float left = (getWidth() - size) / 2f, top = (getHeight() - size) / 2f; bounds.set(left, top, left + size, top + size); int total = 0; for (int value : values) total += value; if (total == 0) { paint.setColor(BORDER); canvas.drawArc(bounds, 0, 360, true, paint); return; } float start = -90f; for (int i = 0; i < values.length; i++) { if (values[i] <= 0) continue; paint.setColor(colors[i]); float sweep = 360f * values[i] / total; canvas.drawArc(bounds, start, sweep, true, paint); start += sweep; } }
    }

    private void renderWorkspaceDetail(JSONObject overview) {
        content.removeAllViews(); addText("Workspace", 24, NAVY, true); addText("Your HYMN team at a glance", 13, MUTED, false); addSpace(18);
        LinearLayout profile = new LinearLayout(this); profile.setGravity(Gravity.CENTER_VERTICAL); profile.setPadding(dp(16), dp(16), dp(16), dp(16)); profile.setBackground(shape(surface(), BORDER, 16)); LinearLayout.LayoutParams pp = new LinearLayout.LayoutParams(-1, -2); pp.bottomMargin = dp(12); content.addView(profile, pp);
        FrameLayout frame = new FrameLayout(this); LinearLayout.LayoutParams fp = new LinearLayout.LayoutParams(dp(64), dp(64)); fp.rightMargin = dp(14); profile.addView(frame, fp); TextView initials = text(firstName(memberName).substring(0, 1).toUpperCase(Locale.ROOT), 22, Color.WHITE, true); initials.setGravity(Gravity.CENTER); initials.setBackground(shape(BLUE, 0, 40)); frame.addView(initials, new FrameLayout.LayoutParams(-1, -1)); ImageView photo = new ImageView(this); photo.setScaleType(ImageView.ScaleType.CENTER_CROP); photo.setBackground(shape(Color.TRANSPARENT, 0, 40)); photo.setClipToOutline(true); frame.addView(photo, new FrameLayout.LayoutParams(-1, -1)); String url = profileImageUrl; if (!url.isEmpty() && !url.equals("null")) loadAvatar(photo, url);
        LinearLayout info = new LinearLayout(this); info.setOrientation(LinearLayout.VERTICAL); profile.addView(info, new LinearLayout.LayoutParams(0, -2, 1)); info.addView(text(memberName, 17, NAVY, true)); info.addView(text(session.optString("email", ""), 11, MUTED, false)); LinearLayout.LayoutParams roleParams = new LinearLayout.LayoutParams(-1, -2); roleParams.topMargin = dp(5); info.addView(text(session.optString("roleName", "Team member") + " · " + session.optString("department", "HYMN Team"), 11, BLUE, true), roleParams);
        LinearLayout ws = new LinearLayout(this); ws.setOrientation(LinearLayout.VERTICAL); ws.setPadding(dp(16), dp(16), dp(16), dp(16)); ws.setBackground(shape(surface(), BORDER, 16)); LinearLayout.LayoutParams wp = new LinearLayout.LayoutParams(-1, -2); wp.bottomMargin = dp(12); content.addView(ws, wp); ws.addView(text("ACTIVE WORKSPACE", 10, MUTED, true)); TextView wsName = text(session.optString("workspaceName", "HYMN Team"), 20, NAVY, true); LinearLayout.LayoutParams wn = new LinearLayout.LayoutParams(-1, -2); wn.topMargin = dp(7); ws.addView(wsName, wn); ws.addView(text("Your tasks, schedules and team activity are organized here.", 12, MUTED, false));
        LinearLayout stats = new LinearLayout(this); stats.setOrientation(LinearLayout.HORIZONTAL); LinearLayout.LayoutParams stp = new LinearLayout.LayoutParams(-1, -2); stp.topMargin = dp(15); ws.addView(stats, stp); addMetric(stats, "OPEN", overview.optInt("active")); addMetric(stats, "REVIEW", overview.optInt("reviews")); addMetric(stats, "DONE", overview.optInt("completed"));
        addPieChart(overview); addSectionTitle("Workspace shortcuts"); String[][] actions = {{"My work", "tasks"}, {"Schedule", "schedule"}, {"Team tools", "more"}}; for (String[] action : actions) { Button shortcut = button("Open " + action[0] + "  →", false); LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams(-1, dp(48)); ap.bottomMargin = dp(8); content.addView(shortcut, ap); shortcut.setOnClickListener(v -> showPage(action[1])); }
        addSpace(8); addText("Profile photo and account details are synced from your HYMN account.", 11, MUTED, false);
    }

    private void loadAvatar(ImageView target, String imageUrl) {
        Bitmap cached = cachedProfileBitmap;
        if (cached != null && imageUrl.equals(cachedProfileUrl)) { target.setImageBitmap(cached); return; }
        io.execute(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(imageUrl); String host = url.getHost() == null ? "" : url.getHost().toLowerCase(Locale.ROOT);
                if (!"https".equalsIgnoreCase(url.getProtocol()) || !(host.equals("googleusercontent.com") || host.endsWith(".googleusercontent.com"))) return;
                connection = (HttpURLConnection) url.openConnection(); connection.setConnectTimeout(8000); connection.setReadTimeout(8000); connection.setInstanceFollowRedirects(true); connection.setUseCaches(true);
                connection.setRequestProperty("Accept", "image/*"); connection.setRequestProperty("User-Agent", "HYMN-Team-Android");
                int status = connection.getResponseCode(); if (status < 200 || status >= 300 || connection.getContentLengthLong() > 2_000_000L) return;
                Bitmap bitmap = BitmapFactory.decodeStream(connection.getInputStream());
                if (bitmap != null) { cachedProfileBitmap = bitmap; cachedProfileUrl = imageUrl; runOnUiThread(() -> { if (!isFinishing()) target.setImageBitmap(bitmap); }); }
            } catch (Exception ignored) { }
            finally { if (connection != null) connection.disconnect(); }
        });
    }
    private void addMetric(LinearLayout row, String label, int value) {
        LinearLayout card = new LinearLayout(this); card.setOrientation(LinearLayout.VERTICAL); card.setPadding(dp(13), dp(13), dp(8), dp(12)); card.setBackground(shape(surface(), BORDER, 14)); LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(92), 1); params.rightMargin = dp(7); row.addView(card, params);
        card.addView(text(label, 9, MUTED, true)); TextView number = text(String.valueOf(value), 24, NAVY, true); LinearLayout.LayoutParams np = new LinearLayout.LayoutParams(-2, -2); np.topMargin = dp(8); card.addView(number, np);
    }

    private void renderRows(String title, JSONArray rows, String kind) {
        content.removeAllViews(); addText(title, 22, NAVY, true); addText("Synced with your HYMN team workspace", 12, MUTED, false); addSpace(14);
        if (kind.equals("tasks")) {
            HorizontalScrollView filtersScroll = new HorizontalScrollView(this); filtersScroll.setHorizontalScrollBarEnabled(false); LinearLayout filters = new LinearLayout(this); filters.setOrientation(LinearLayout.HORIZONTAL); String[][] options = {{"All", "all"}, {"To do", "TODO"}, {"In progress", "IN_PROGRESS"}, {"Review", "IN_REVIEW"}, {"Done", "COMPLETED"}};
            for (String[] option : options) { Button filter = button(option[0], taskFilter.equals(option[1])); filter.setTextSize(11); LinearLayout.LayoutParams fp = new LinearLayout.LayoutParams(-2, dp(40)); fp.rightMargin = dp(7); filters.addView(filter, fp); filter.setOnClickListener(v -> { taskFilter = option[1]; loadPageData(); }); }
            filtersScroll.addView(filters); LinearLayout.LayoutParams filtersParams = new LinearLayout.LayoutParams(-1, dp(44)); filtersParams.bottomMargin = dp(10); content.addView(filtersScroll, filtersParams);
        }
        if (kind.equals("tasks") && hasPermission("tasks.create")) { Button create = button("+  Create task", true); LinearLayout.LayoutParams createParams = new LinearLayout.LayoutParams(-1, dp(48)); createParams.bottomMargin = dp(14); content.addView(create, createParams); create.setOnClickListener(v -> createTask()); }
        if (kind.equals("schedule") && hasPermission("calendar.manage")) { Button create = button("+  Add to schedule", true); LinearLayout.LayoutParams createParams = new LinearLayout.LayoutParams(-1, dp(48)); createParams.bottomMargin = dp(14); content.addView(create, createParams); create.setOnClickListener(v -> createCalendarEvent()); }
        if (rows == null || rows.length() == 0) addEmpty("Nothing here yet.");
        else for (int i = 0; i < rows.length(); i++) addRecord(rows.optJSONObject(i), kind);
    }

    private void addRecord(JSONObject row, String kind) {
        if (row == null) return;
        LinearLayout card = new LinearLayout(this); card.setOrientation(LinearLayout.VERTICAL); card.setPadding(dp(15), dp(14), dp(15), dp(13)); card.setBackground(shape(surface(), BORDER, 14)); LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(-1, -2); cp.bottomMargin = dp(10); content.addView(card, cp);
        String title = row.optString("title", row.optString("subject", row.optString("name", "Team update")));
        card.addView(text(title, 15, NAVY, true));
        String subtitle = row.optString("description", row.optString("status", row.optString("kind", "")));
        if (!subtitle.isEmpty()) { TextView sub = text(subtitle, 12, MUTED, false); LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2); p.topMargin = dp(6); card.addView(sub, p); }
        String date = row.optString("dueAt", row.optString("startsAt", row.optString("createdAt", "")));
        if (!date.isEmpty()) { TextView dt = text(formatDate(date), 11, MUTED, false); LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2); p.topMargin = dp(6); card.addView(dt, p); }
        LinearLayout actions = new LinearLayout(this); actions.setGravity(Gravity.END | Gravity.CENTER_VERTICAL); actions.setOrientation(LinearLayout.HORIZONTAL); LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams(-1, -2); ap.topMargin = dp(8);
        if (kind.equals("tasks") && row.has("version")) {
            Button done = button("Mark done", false); done.setTextSize(11); actions.addView(done, new LinearLayout.LayoutParams(-2, dp(40)));
            done.setOnClickListener(v -> updateTask(row));
        }
        if (kind.equals("workstation") && row.has("version")) {
            Button start = button("Open work", true); start.setTextSize(11); LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-2, dp(40)); actions.addView(start, p); start.setOnClickListener(v -> startWork(row));
        }
        if (kind.equals("alerts") && !row.isNull("readAt")) { /* already read */ }
        if (kind.equals("alerts") && row.isNull("readAt")) {
            Button read = button("Mark read", false); read.setTextSize(11); actions.addView(read, new LinearLayout.LayoutParams(-2, dp(40))); read.setOnClickListener(v -> markRead(row.optString("id")));
        }
        JSONObject client = row.optJSONObject("client");
        String phone = row.optString("phone", row.optString("callbackPhone", client == null ? "" : client.optString("phone", "")));
        if (!phone.isEmpty()) { Button call = button("Call", true); call.setTextSize(11); LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-2, dp(40)); p.leftMargin = dp(8); actions.addView(call, p); call.setOnClickListener(v -> dial(phone)); }
        String email = row.optString("email", client == null ? "" : client.optString("email", ""));
        if (!email.isEmpty()) { Button mail = button("Email", false); mail.setTextSize(11); LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-2, dp(40)); p.leftMargin = dp(8); actions.addView(mail, p); mail.setOnClickListener(v -> email(email)); }
        if (kind.equals("call-followups") && row.has("version")) { Button log = button("Log outcome", false); log.setTextSize(11); LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-2, dp(40)); p.leftMargin = dp(8); actions.addView(log, p); log.setOnClickListener(v -> logCallOutcome(row)); }
        if (actions.getChildCount() > 0) card.addView(actions, ap);
    }

    private void updateTask(JSONObject row) {
        try {
            JSONObject body = new JSONObject().put("id", row.getString("id")).put("version", row.getInt("version")).put("status", "COMPLETED");
            mutate("task-update", body, "Task marked complete.");
        } catch (Exception e) { toastError(e.getMessage()); }
    }

    private void startWork(JSONObject task) {
        JSONObject context = task.optJSONObject("followUpContext");
        JSONObject existing = context == null ? null : context.optJSONObject("workActivity");
        if (existing != null && !existing.optString("id").isEmpty() && !existing.optString("status").equals("FINISHED")) {
            openWorkActivity(task.optString("id"));
            return;
        }
        final int generation = screenGeneration.get();
        showContentLoading("Starting activity…");
        io.execute(() -> {
            try {
                JSONObject request = new JSONObject().put("taskId", task.getString("id")).put("requestKey", UUID.randomUUID().toString());
                JSONObject result = api.post("workstation-start", workspace, request);
                String taskId = result.optString("id", task.optString("id"));
                runOnUiThread(() -> { if (generation == screenGeneration.get()) openWorkActivity(taskId, generation); });
            } catch (Exception e) {
                runOnUiThread(() -> { if (generation == screenGeneration.get()) renderActivityLoadError(e, () -> startWork(task)); });
            }
        });
    }

    private void openWorkActivity(String id) {
        openWorkActivity(id, screenGeneration.get());
    }

    private void openWorkActivity(String id, int generation) {
        showContentLoading("Opening Work-station activity…");
        io.execute(() -> {
            try {
                JSONObject detail = api.get("workstation-activity", workspace, "id=" + java.net.URLEncoder.encode(id, "UTF-8"));
                runOnUiThread(() -> { if (generation == screenGeneration.get()) renderWorkActivity(detail); });
            } catch (Exception e) {
                runOnUiThread(() -> { if (generation == screenGeneration.get()) renderActivityLoadError(e, () -> openWorkActivity(id)); });
            }
        });
    }

    /** Keep the workspace and navigation attached while an action is in flight. */
    private void renderActivityLoadError(Exception error, Runnable retryAction) {
        content.removeAllViews();
        addText("Couldn't reach this activity", 20, NAVY, true); addSpace(8);
        addText(error instanceof java.io.IOException ? "The connection to HYMN took too long or was interrupted. Your saved draft is still on this phone." : safe(error.getMessage()), 13, MUTED, false);
        addSpace(14); Button retry = button("Retry activity", true); content.addView(retry); retry.setOnClickListener(v -> retryAction.run());
        addSpace(8); Button queue = button("Back to work queue", false); content.addView(queue); queue.setOnClickListener(v -> showPage("workstation"));
    }

    private void showContentLoading(String label) {
        if (content == null) return;
        content.removeAllViews();
        LinearLayout status = new LinearLayout(this);
        status.setGravity(Gravity.CENTER);
        status.setOrientation(LinearLayout.VERTICAL);
        status.setPadding(dp(18), dp(28), dp(18), dp(28));
        status.setBackground(shape(surface(), BORDER, 14));
        ProgressBar bar = new ProgressBar(this);
        status.addView(bar, new LinearLayout.LayoutParams(dp(36), dp(36)));
        TextView labelView = text(label, 13, MUTED, false);
        LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(-2, -2);
        labelParams.topMargin = dp(12);
        status.addView(labelView, labelParams);
        content.addView(status, new LinearLayout.LayoutParams(-1, -2));
    }

    private void renderWorkActivity(JSONObject detail) {
        content.removeAllViews(); JSONObject task = detail.optJSONObject("task"), activity = detail.optJSONObject("activity"); if (task == null || activity == null) { addEmpty("Activity data is unavailable."); return; }
        activeWorkDetail = detail;
        workActionBusy = false;
        String id = task.optString("id"), activityId = activity.optString("id"), status = activity.optString("status"); int version = task.optInt("version");
        JSONObject visibleDraft;
        JSONObject recovery = null;
        try {
            visibleDraft = WorkActivityRecovery.draft(activity);
            JSONObject saved = api.workDraft(workDraftKey(id));
            if (saved != null && activityId.equals(saved.optString("activityId"))) {
                try { visibleDraft = WorkActivityRecovery.merge(saved.getJSONObject("base").getJSONObject("task"), saved.getJSONObject("base").getJSONObject("activity"), saved.getJSONObject("draft"), task, activity); }
                catch (WorkActivityRecovery.Conflict conflict) { recovery = saved; }
            } else if (saved != null) recovery = saved;
        } catch (Exception e) { toastError("The saved draft could not be restored. Your server activity is still available."); visibleDraft = activity; }
        addText(task.optString("title", "Work activity"), 22, NAVY, true); addText(status.equals("RUNNING") ? "Timer running" : status.equals("PAUSED") ? "Paused" : "Activity report", 12, MUTED, false); addSpace(14);
        EditText notes = new EditText(this); styleInput(notes); notes.setHint("Add notes, what the contact needs, and your next action"); notes.setText(visibleDraft.optString("notes", "")); notes.setGravity(Gravity.TOP); notes.setMinLines(5); notes.setPadding(dp(14), dp(12), dp(14), dp(12)); notes.setBackground(shape(surface(), BORDER, 12)); content.addView(notes, new LinearLayout.LayoutParams(-1, dp(150)));
        ArrayList<CheckBox> checklist = new ArrayList<>(); JSONArray checks = task.optJSONArray("checklist");
        JSONArray flags = visibleDraft.optJSONArray("checklist");
        if (checks != null && checks.length() > 0) { addSpace(10); addSectionTitle("Checklist"); for (int i=0;i<checks.length();i++) { JSONObject item = checks.optJSONObject(i); if (item == null) continue; CheckBox check = new CheckBox(this); check.setText(item.optString("text", "Checklist item")); check.setTextColor(NAVY); check.setTextSize(13); check.setChecked(flags != null && i < flags.length() ? flags.optBoolean(i) : item.optBoolean("done")); checklist.add(check); content.addView(check); } }
        final JSONObject baseDetail = detail;
        Runnable keepDraft = () -> { try { persistWorkDraft(id, baseDetail, activityDraft(notes.getText().toString(), checklistFlags(checklist), baseDetail)); } catch (Exception e) { toastError("Could not save the draft on this phone. Keep this screen open and try Save notes."); } };
        notes.addTextChangedListener(new android.text.TextWatcher() {
            public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
            public void onTextChanged(CharSequence s, int start, int before, int count) { keepDraft.run(); }
            public void afterTextChanged(android.text.Editable s) { }
        });
        for (CheckBox check : checklist) check.setOnCheckedChangeListener((view, checked) -> keepDraft.run());
        if (recovery != null) {
            final JSONObject retained = recovery;
            addEmpty("Your saved draft needs review because this activity changed. The latest server version is shown.");
            Button review = button("Review saved notes", false); content.addView(review);
            review.setOnClickListener(v -> new AlertDialog.Builder(this).setTitle("Saved notes on this phone")
                .setMessage(retained.optJSONObject("draft") == null ? "No saved notes found." : retained.optJSONObject("draft").optString("notes", "No notes"))
                .setNegativeButton("Keep latest", null).setPositiveButton(status.equals("FINISHED") ? "Copy notes" : "Restore notes", (dialog, which) -> {
                    JSONObject draft = retained.optJSONObject("draft"); if (draft == null) return;
                    if (status.equals("FINISHED")) ((android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(android.content.ClipData.newPlainText("Saved activity notes", draft.optString("notes", "")));
                    else notes.setText(draft.optString("notes", ""));
                }).show());
        }
        if (status.equals("FINISHED")) { notes.setEnabled(false); for (CheckBox check : checklist) check.setEnabled(false); addEmpty("This activity has finished. Return to the work queue to see its current status."); return; }
        addSpace(12); LinearLayout actions = new LinearLayout(this); actions.setGravity(Gravity.CENTER_VERTICAL); actions.setOrientation(LinearLayout.HORIZONTAL);
        Button save = button("Save notes", false); actions.addView(save, new LinearLayout.LayoutParams(0, dp(46), 1)); Button toggle = button(status.equals("RUNNING") ? "Pause" : "Resume", true); LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(0, dp(46), 1); tp.leftMargin = dp(8); actions.addView(toggle, tp); content.addView(actions);
        save.setOnClickListener(v -> saveWorkActivity(id, activityId, version, notes.getText().toString(), checklistFlags(checklist), "workstation-save"));
        toggle.setOnClickListener(v -> saveWorkActivity(id, activityId, version, notes.getText().toString(), checklistFlags(checklist), status.equals("RUNNING") ? "workstation-pause" : "workstation-resume"));
        if (hasPermission("tasks.complete")) { Button finish = button("Finish activity", false); LinearLayout.LayoutParams fp = new LinearLayout.LayoutParams(-1, dp(46)); fp.topMargin = dp(9); content.addView(finish, fp); finish.setOnClickListener(v -> finishWorkActivity(id, activityId, version, notes.getText().toString(), checklistFlags(checklist))); }
    }

    private JSONArray checklistFlags(ArrayList<CheckBox> checks) { JSONArray result = new JSONArray(); for (CheckBox check : checks) result.put(check.isChecked()); return result; }
    private String workDraftKey(String id) { return workspace + ":" + memberId + ":" + id; }
    private JSONObject activityDraft(String notes, JSONArray checklist, JSONObject detail) throws Exception {
        return WorkActivityRecovery.draft(detail.getJSONObject("activity")).put("notes", notes).put("checklist", checklist);
    }
    private void persistWorkDraft(String id, JSONObject base, JSONObject draft) throws Exception {
        JSONObject activity = base.getJSONObject("activity");
        JSONObject snapshot = new JSONObject().put("task", new JSONObject().put("checklist", base.getJSONObject("task").optJSONArray("checklist")))
            .put("activity", WorkActivityRecovery.draft(activity).put("id", activity.getString("id")));
        api.saveWorkDraft(workDraftKey(id), new JSONObject().put("activityId", activity.getString("id")).put("base", snapshot).put("draft", draft));
    }

    private void saveWorkActivity(String id, String activityId, int version, String notes, JSONArray checklist, String action) {
        submitWorkChange(id, activityId, notes, checklist, action, null);
    }

    private void finishWorkActivity(String id, String activityId, int version, String notes, JSONArray checklist) {
        if (notes.trim().length() < 10) { toastError("Add a brief activity report before finishing."); return; }
        String[] outcomes = {"COMPLETED", "FOLLOW_UP", "BLOCKED"}; String[] labels = {"Completed", "Follow up", "Blocked"};
        new AlertDialog.Builder(this).setTitle("Finish activity").setItems(labels, (dialog, which) -> {
            try { submitWorkChange(id, activityId, notes, checklist, "workstation-finish", new JSONObject().put("outcome", outcomes[which]).put("closeTicket", false)); }
            catch (Exception e) { toastError(e.getMessage()); }
        }).show();
    }

    private void setWorkControlsEnabled(View view, boolean enabled) {
        if (view instanceof Button || view instanceof EditText || view instanceof CheckBox) view.setEnabled(enabled);
        if (view instanceof ViewGroup) { ViewGroup group = (ViewGroup) view; for (int i = 0; i < group.getChildCount(); i++) setWorkControlsEnabled(group.getChildAt(i), enabled); }
    }

    private void submitWorkChange(String id, String activityId, String notes, JSONArray checklist, String action, JSONObject extra) {
        if (workActionBusy || activeWorkDetail == null) return;
        final JSONObject base, draft;
        final int generation = screenGeneration.get();
        final LinearLayout workContent = content;
        try {
            base = new JSONObject(activeWorkDetail.toString());
            draft = activityDraft(notes, checklist, base);
            persistWorkDraft(id, base, draft);
        } catch (Exception e) { toastError("Could not retain your draft. Please try again before leaving this screen."); return; }
        workActionBusy = true; setWorkControlsEnabled(workContent, false);
        final TextView actionStatus = text(action.equals("workstation-resume") ? "Resuming activity…" : action.equals("workstation-pause") ? "Pausing activity…" : "Saving activity…", 13, BLUE, true);
        workContent.addView(actionStatus, 0);
        io.execute(() -> {
            try {
                for (int attempt = 0; attempt < 2; attempt++) {
                    JSONObject latest = api.get("workstation-activity", workspace, "id=" + java.net.URLEncoder.encode(id, "UTF-8"));
                    JSONObject task = latest.getJSONObject("task"), activity = latest.getJSONObject("activity");
                    if (!activityId.equals(activity.optString("id")) || !memberId.equals(task.optString("ownerId"))) throw new WorkActivityRecovery.Conflict();
                    JSONObject merged = WorkActivityRecovery.merge(base.getJSONObject("task"), base.getJSONObject("activity"), draft, task, activity);
                    if (activity.optString("status").equals("FINISHED")) {
                        if (action.equals("workstation-finish") && extra != null && extra.optString("outcome").equals(activity.optString("outcome")) && WorkActivityRecovery.equal(merged, WorkActivityRecovery.draft(activity))) break;
                        throw new IllegalStateException("This activity has already finished. Your notes are saved on this phone; reopen the activity to review its report.");
                    }
                    JSONObject body = extra == null ? new JSONObject() : new JSONObject(extra.toString());
                    body.put("id", id).put("activityId", activityId).put("version", task.getInt("version")).put("draft", merged);
                    try { api.post(action, workspace, body); break; }
                    catch (TeamApi.ApiException e) { if (e.status == 409 && attempt == 0) continue; throw e; }
                    catch (java.io.IOException uncertain) {
                        // A timeout does not mean the write failed. Read it back before offering a retry.
                        JSONObject confirmed = api.get("workstation-activity", workspace, "id=" + java.net.URLEncoder.encode(id, "UTF-8"));
                        JSONObject saved = confirmed.getJSONObject("activity");
                        if (!WorkActivityRecovery.confirmed(action, activityId, extra == null ? "" : extra.optString("outcome"), merged, saved)) throw uncertain;
                        break;
                    }
                }
                if (generation == screenGeneration.get()) api.clearWorkDraft(workDraftKey(id));
                runOnUiThread(() -> { if (generation != screenGeneration.get()) return; workActionBusy = false; if (action.equals("workstation-finish")) showPage("home"); else openWorkActivity(id); });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    if (generation != screenGeneration.get()) return;
                    workActionBusy = false; setWorkControlsEnabled(workContent, true); workContent.removeView(actionStatus);
                    new AlertDialog.Builder(this).setTitle("Activity not updated")
                        .setMessage(safe(error.getMessage()) + "\n\nYour draft is saved on this phone.")
                        .setNegativeButton("Keep editing", null)
                        .setPositiveButton("Reload activity", (dialog, which) -> openWorkActivity(id)).show();
                });
            }
        });
    }

    private boolean hasPermission(String permission) {
        if (session == null) return false;
        if (session.optBoolean("owner")) return true;
        JSONArray permissions = session.optJSONArray("permissions");
        if (permissions != null) for (int i=0;i<permissions.length();i++) if (permission.equals(permissions.optString(i))) return true;
        return false;
    }

    private void createTask() {
        EditText title = new EditText(this); styleInput(title); title.setHint("Task title");
        EditText description = new EditText(this); styleInput(description); description.setHint("Details (optional)"); description.setMinLines(2);
        LinearLayout form = new LinearLayout(this); form.setOrientation(LinearLayout.VERTICAL); form.setPadding(dp(20), dp(8), dp(20), 0); form.addView(title); form.addView(description);
        new AlertDialog.Builder(this).setTitle("Create task").setView(form).setNegativeButton("Cancel", null).setPositiveButton("Create", (d,w) -> {
            String value = title.getText().toString().trim(); if (value.length() < 3) { toastError("Task title must be at least 3 characters."); return; }
            try { JSONObject body = new JSONObject().put("title", value).put("description", description.getText().toString().trim()).put("ownerId", memberId).put("priority", "NORMAL").put("approvalRequired", false).put("dependencyIds", new JSONArray()).put("checklist", new JSONArray()).put("recordType", JSONObject.NULL).put("recordId", JSONObject.NULL); mutate("tasks", body, "Task created."); }
            catch (Exception e) { toastError(e.getMessage()); }
        }).show();
    }

    private void createCalendarEvent() {
        EditText title = new EditText(this); styleInput(title); title.setHint("Schedule title");
        LinearLayout form = new LinearLayout(this); form.setPadding(dp(20), dp(8), dp(20), 0); form.addView(title);
        new AlertDialog.Builder(this).setTitle("Add to schedule").setView(form).setNegativeButton("Cancel", null).setPositiveButton("Choose time", (d,w) -> {
            String value = title.getText().toString().trim(); if (value.isEmpty()) { toastError("Add a title first."); return; }
            Calendar date = Calendar.getInstance(TimeZone.getTimeZone("Asia/Kolkata"));
            new DatePickerDialog(this, (picker, year, month, day) -> { date.set(year, month, day); new TimePickerDialog(this, (clock, hour, minute) -> { date.set(Calendar.HOUR_OF_DAY, hour); date.set(Calendar.MINUTE, minute); date.set(Calendar.SECOND, 0); saveCalendarEvent(value, date); }, date.get(Calendar.HOUR_OF_DAY), date.get(Calendar.MINUTE), false).show(); }, date.get(Calendar.YEAR), date.get(Calendar.MONTH), date.get(Calendar.DAY_OF_MONTH)).show();
        }).show();
    }

    private void saveCalendarEvent(String title, Calendar date) {
        try {
            SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US); iso.setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));
            JSONObject body = new JSONObject().put("title", title).put("kind", "EVENT").put("clientId", JSONObject.NULL).put("assigneeId", memberId).put("startsAt", iso.format(date.getTime())).put("endsAt", JSONObject.NULL).put("notes", "").put("outcome", "").put("status", "SCHEDULED").put("reminderMinutes", 30);
            mutate("calendar-save", body, "Schedule item created.");
        } catch (Exception e) { toastError(e.getMessage()); }
    }

    private void logCallOutcome(JSONObject row) {
        String[] outcomes = {"TALKED", "NO_ANSWER", "CALLBACK", "INTERESTED", "RESOLVED", "NOT_INTERESTED", "DO_NOT_CONTACT"};
        String[] labels = {"Talked", "No answer", "Call back", "Interested", "Resolved", "Not interested", "Do not contact"};
        new AlertDialog.Builder(this).setTitle("Call result").setItems(labels, (dialog, which) -> {
            EditText notes = new EditText(this); styleInput(notes); notes.setHint("Add a short call note (required)"); notes.setMinLines(2); notes.setGravity(Gravity.TOP);
            new AlertDialog.Builder(this).setTitle("Add call notes").setView(notes).setNegativeButton("Cancel", null).setPositiveButton("Save", (d, w) -> {
                String note = notes.getText().toString().trim(); if (note.length() < 3) { toastError("Please add at least a short note."); return; }
                try { JSONObject payload = new JSONObject().put("id", row.getString("id")).put("version", row.getInt("version")).put("outcome", outcomes[which]).put("notes", note); mutate("call-followup-outcome", payload, "Call result saved."); }
                catch (Exception e) { toastError(e.getMessage()); }
            }).show();
        }).show();
    }

    private void markRead(String id) { try { mutate("notifications", new JSONObject().put("id", id), "Alert marked as read."); } catch (Exception e) { toastError(e.getMessage()); } }

    private void updateInboxSummary(JSONObject result) {
        JSONArray items = result.optJSONArray("items");
        if (items != null) inboxItems = items;
        updateInboxBadge();
    }

    private void updateInboxBadge() {
        if (inboxBadge == null) return;
        int total = unread(inboxItems);
        inboxBadge.setText(total > 9 ? "9+" : String.valueOf(total));
        inboxBadge.setVisibility(total > 0 ? View.VISIBLE : View.GONE);
    }

    private void showInboxPopup(View anchor) {
        int width = Math.min(dp(340), getResources().getDisplayMetrics().widthPixels - dp(24));
        int height = Math.min(dp(480), getResources().getDisplayMetrics().heightPixels - dp(180));
        PopupWindow popup = new PopupWindow(this);
        popup.setWidth(width); popup.setHeight(Math.max(dp(250), height)); popup.setFocusable(true); popup.setOutsideTouchable(true); popup.setBackgroundDrawable(shape(surface(), BORDER, 16)); popup.setElevation(dp(12));
        popup.setContentView(buildInboxPopup(popup));
        int[] anchorPosition = new int[2]; anchor.getLocationOnScreen(anchorPosition);
        int xOffset = getResources().getDisplayMetrics().widthPixels - width - dp(12) - anchorPosition[0];
        popup.showAsDropDown(anchor, xOffset, dp(6));
        io.execute(() -> {
            try {
                JSONObject fresh = api.get("notifications", workspace, "offset=0");
                runOnUiThread(() -> { updateInboxSummary(fresh); if (popup.isShowing()) popup.setContentView(buildInboxPopup(popup)); });
            } catch (Exception ignored) { }
        });
    }

    private View buildInboxPopup(PopupWindow popup) {
        LinearLayout panel = new LinearLayout(this); panel.setOrientation(LinearLayout.VERTICAL); panel.setPadding(dp(16), dp(15), dp(16), dp(12)); panel.setBackground(shape(surface(), BORDER, 16));
        LinearLayout titleRow = new LinearLayout(this); titleRow.setGravity(Gravity.CENTER_VERTICAL); panel.addView(titleRow, new LinearLayout.LayoutParams(-1, -2));
        titleRow.addView(text("Inbox", 18, NAVY, true), new LinearLayout.LayoutParams(0, -2, 1));
        Button close = button("Close", false); close.setTextSize(11); titleRow.addView(close, new LinearLayout.LayoutParams(-2, dp(36))); close.setOnClickListener(v -> popup.dismiss());
        int unreadCount = unread(inboxItems); TextView summary = text(unreadCount == 0 ? "You’re all caught up" : unreadCount + " unread update" + (unreadCount == 1 ? "" : "s"), 11, MUTED, false); LinearLayout.LayoutParams summaryParams = new LinearLayout.LayoutParams(-1, -2); summaryParams.topMargin = dp(3); summaryParams.bottomMargin = dp(10); panel.addView(summary, summaryParams);
        ScrollView scroll = new ScrollView(this); LinearLayout list = new LinearLayout(this); list.setOrientation(LinearLayout.VERTICAL); scroll.addView(list); panel.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        if (inboxItems.length() == 0) { TextView empty = text("No messages yet. New team updates will appear here.", 13, MUTED, false); empty.setGravity(Gravity.CENTER); empty.setPadding(dp(18), dp(25), dp(18), dp(25)); list.addView(empty); }
        for (int i = 0; i < inboxItems.length(); i++) {
            JSONObject item = inboxItems.optJSONObject(i); if (item == null) continue;
            boolean unreadItem = item.isNull("readAt");
            LinearLayout card = new LinearLayout(this); card.setOrientation(LinearLayout.VERTICAL); card.setPadding(dp(12), dp(11), dp(12), dp(11)); card.setBackground(shape(unreadItem ? (nightMode ? Color.rgb(29, 46, 68) : Color.rgb(242, 247, 255)) : surface(), BORDER, 12)); LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(-1, -2); cardParams.bottomMargin = dp(8); list.addView(card, cardParams);
            card.addView(text(item.optString("title", "Team update"), 13, NAVY, true));
            String created = item.optString("createdAt", ""); if (!created.isEmpty()) { TextView time = text(formatDate(created), 10, MUTED, false); LinearLayout.LayoutParams timeParams = new LinearLayout.LayoutParams(-1, -2); timeParams.topMargin = dp(5); card.addView(time, timeParams); }
            TextView state = text(unreadItem ? "Unread · tap to review" : "Read", 10, unreadItem ? BLUE : MUTED, unreadItem); LinearLayout.LayoutParams stateParams = new LinearLayout.LayoutParams(-1, -2); stateParams.topMargin = dp(6); card.addView(state, stateParams);
            card.setOnClickListener(v -> showInboxMessage(item, popup));
        }
        return panel;
    }

    private void showInboxMessage(JSONObject item, PopupWindow popup) {
        boolean unreadItem = item.isNull("readAt"); String title = item.optString("title", "Team update");
        String detail = item.optString("description", "This update was sent to your HYMN team inbox.");
        AlertDialog.Builder dialog = new AlertDialog.Builder(this).setTitle(title).setMessage(detail).setNegativeButton("Close", (d, w) -> { });
        dialog.setPositiveButton(unreadItem ? "Done · mark read" : "Done", (d, w) -> { if (unreadItem) markInboxRead(item.optString("id"), popup); else popup.dismiss(); }).show();
    }

    private void markInboxRead(String id, PopupWindow popup) {
        if (id == null || id.isEmpty()) return;
        io.execute(() -> {
            try {
                api.post("notifications", workspace, new JSONObject().put("id", id));
                runOnUiThread(() -> {
                    for (int i = 0; i < inboxItems.length(); i++) {
                        JSONObject old = inboxItems.optJSONObject(i); if (old == null || !id.equals(old.optString("id"))) continue;
                        try { inboxItems.put(i, new JSONObject(old.toString()).put("readAt", new Date().toInstant().toString())); } catch (Exception ignored) { }
                        break;
                    }
                    updateInboxBadge(); if (popup.isShowing()) popup.setContentView(buildInboxPopup(popup));
                });
            } catch (Exception error) { runOnUiThread(() -> toastError("Couldn’t mark this message as read. " + safe(error.getMessage()))); }
        });
    }

    private void mutate(String resource, JSONObject body, String success) {
        showLoading("Saving your change…");
        io.execute(() -> { try { api.post(resource, workspace, body); runOnUiThread(() -> { showPage(page); }); } catch (Exception e) { runOnUiThread(() -> new AlertDialog.Builder(this).setTitle("Couldn’t save").setMessage(safe(e.getMessage())).setPositiveButton("OK", (d,w) -> showPage(page)).show()); } });
    }

    private void renderTools() {
        content.removeAllViews(); addText("Workspace", 22, NAVY, true); addText("Everything your team needs, together.", 13, MUTED, false); addSpace(14);
        Button appearance = button(nightMode ? "☀  Switch to day mode" : "☾  Switch to night mode", false); LinearLayout.LayoutParams appearanceParams = new LinearLayout.LayoutParams(-1, dp(46)); appearanceParams.bottomMargin = dp(10); content.addView(appearance, appearanceParams); appearance.setOnClickListener(v -> toggleTheme());
        addSectionTitle("Phone notifications");
        addText("These controls affect alerts on this phone only. HYMN inbox messages and email preferences stay unchanged.", 12, MUTED, false);
        addPhoneNotificationSetting("Client call reminders", TeamPhoneNotifications.MUTE_CALLS, "Upcoming calls assigned to you");
        addPhoneNotificationSetting("Team updates", TeamPhoneNotifications.MUTE_UPDATES, "Inbox and important workspace alerts");
        TextView timing = text("Call reminders are scheduled for 30 minutes before the call. Use Snooze 10 min or Mute on a phone notification to control it.", 11, MUTED, false); timing.setPadding(dp(12), dp(10), dp(12), dp(10)); timing.setBackground(shape(surface(), BORDER, 12)); LinearLayout.LayoutParams timingParams = new LinearLayout.LayoutParams(-1, -2); timingParams.bottomMargin = dp(16); content.addView(timing, timingParams);
        String[][] groups = {{"Work", "Work-station|workstation", "Projects|projects", "Reports|reports"}, {"Connect", "Calls & follow-ups|call-followups", "Team chat|channels", "Team email history|team-email-history"}, {"People & operations", "Team directory|members", "Availability|availability", "Work coordinator|coordinator", "Creator approvals|creator-applications", "Operations|operations", "Contacts & research|acquisition-dashboard"}, {"Activity", "Call reports|call-reports", "Activity & audit|audit"}, {"Preferences", "Phone notifications|notifications"}};
        for (String[] group : groups) {
            addSectionTitle(group[0]);
            for (int i = 1; i < group.length; i++) {
                String[] item = group[i].split("\\|");
                if (item[1].equals("notifications")) {
                    LinearLayout card = new LinearLayout(this); card.setGravity(Gravity.CENTER_VERTICAL); card.setPadding(dp(15), dp(11), dp(14), dp(11)); card.setBackground(shape(surface(), BORDER, 14)); LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, dp(58)); p.bottomMargin = dp(8); content.addView(card, p);
                    ImageView icon = new ImageView(this); icon.setImageResource(R.drawable.ic_notification); icon.setColorFilter(BLUE); icon.setPadding(dp(7), dp(7), dp(7), dp(7)); LinearLayout.LayoutParams ip = new LinearLayout.LayoutParams(dp(34), dp(34)); ip.rightMargin = dp(12); card.addView(icon, ip);
                    card.addView(text(item[0], 14, NAVY, true), new LinearLayout.LayoutParams(0, -2, 1)); TextView arrow = text("›", 22, MUTED, false); card.addView(arrow);
                    card.setOnClickListener(v -> { tool = "notifications"; loadPageData(); }); continue;
                }
                LinearLayout card = new LinearLayout(this); card.setGravity(Gravity.CENTER_VERTICAL); card.setPadding(dp(15), dp(11), dp(14), dp(11)); card.setBackground(shape(surface(), BORDER, 14)); LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, dp(58)); p.bottomMargin = dp(8); content.addView(card, p);
                TextView icon = text(toolIcon(item[1]), 19, BLUE, true); icon.setGravity(Gravity.CENTER); LinearLayout.LayoutParams ip = new LinearLayout.LayoutParams(dp(34), dp(34)); ip.rightMargin = dp(12); icon.setBackground(shape(Color.rgb(237, 243, 252), 0, 11)); card.addView(icon, ip);
                card.addView(text(item[0], 14, NAVY, true), new LinearLayout.LayoutParams(0, -2, 1)); card.addView(text("›", 22, MUTED, false));
                card.setOnClickListener(v -> { tool = item[1]; if (tool.equals("workstation")) workBucket = "today"; loadPageData(); });
            }
        }
        addSpace(8); Button logout = button("Sign out of HYMN Team", false); content.addView(logout, new LinearLayout.LayoutParams(-1, dp(48))); logout.setOnClickListener(v -> confirmSignOut());
    }

    private String toolIcon(String key) {
        if (key.equals("workstation")) return "✓"; if (key.contains("call")) return "☎"; if (key.equals("channels")) return "◌";
        if (key.contains("email")) return "✉"; if (key.equals("projects")) return "▦"; if (key.contains("member")) return "♙";
        if (key.contains("availability")) return "◷"; if (key.contains("report")) return "▤"; if (key.contains("audit")) return "◉";
        return "✦";
    }

    private void addPhoneNotificationSetting(String title, String preferenceKey, String subtitle) {
        LinearLayout row = new LinearLayout(this); row.setGravity(Gravity.CENTER_VERTICAL); row.setPadding(dp(14), dp(10), dp(10), dp(10)); row.setBackground(shape(surface(), BORDER, 13)); LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(-1, -2); rowParams.bottomMargin = dp(8); content.addView(row, rowParams);
        LinearLayout labels = new LinearLayout(this); labels.setOrientation(LinearLayout.VERTICAL); row.addView(labels, new LinearLayout.LayoutParams(0, -2, 1)); labels.addView(text(title, 13, NAVY, true)); TextView hint = text(subtitle, 10, MUTED, false); LinearLayout.LayoutParams hintParams = new LinearLayout.LayoutParams(-1, -2); hintParams.topMargin = dp(4); labels.addView(hint, hintParams);
        android.content.SharedPreferences prefs = getSharedPreferences(TeamPhoneNotifications.PREFS, MODE_PRIVATE);
        boolean muted = prefs.getBoolean(preferenceKey, false);
        android.widget.Switch toggle = new android.widget.Switch(this); toggle.setText(muted ? "Muted" : "On"); toggle.setTextColor(MUTED); toggle.setTextSize(10); toggle.setChecked(!muted); row.addView(toggle, new LinearLayout.LayoutParams(-2, dp(48)));
        toggle.setOnCheckedChangeListener((button, enabled) -> { prefs.edit().putBoolean(preferenceKey, !enabled).apply(); toggle.setText(enabled ? "On" : "Muted"); });
    }

    private void loadTool(String selected, int generation) {
        String extra = selected.equals("workstation") ? "bucket=" + workBucket : "";
        try { JSONObject data = api.get(selected, workspace, extra); runOnUiThread(() -> { if (screenGeneration.get() == generation) renderTool(selected, data); }); }
        catch (Exception error) { runOnUiThread(() -> { if (screenGeneration.get() == generation) renderError(error.getMessage()); }); }
    }

    private void renderTool(String selected, JSONObject data) {
        content.removeAllViews(); addText(toolName(selected), 22, NAVY, true); addText("Live data from HYMN Team OS", 12, MUTED, false); addSpace(14);
        if (selected.equals("notifications")) {
            addText("Control team notification delivery on this phone without changing your HYMN inbox or email preferences.", 12, MUTED, false); addSpace(10);
            addPhoneNotificationSetting("Client call reminders", TeamPhoneNotifications.MUTE_CALLS, "30 minutes before calls assigned to you");
            addPhoneNotificationSetting("Team updates", TeamPhoneNotifications.MUTE_UPDATES, "Important inbox and workspace alerts");
            return;
        }
        if (selected.equals("workstation")) {
            LinearLayout filters = new LinearLayout(this); filters.setGravity(Gravity.CENTER_VERTICAL); filters.setOrientation(LinearLayout.HORIZONTAL); String[][] buckets = {{"Today", "today"}, {"Upcoming", "upcoming"}, {"Overdue", "overdue"}, {"Done", "finished"}};
            for (String[] bucket : buckets) { Button filter = button(bucket[0], workBucket.equals(bucket[1])); filter.setTextSize(11); filter.setPadding(dp(9), 0, dp(9), 0); LinearLayout.LayoutParams fp = new LinearLayout.LayoutParams(0, dp(40), 1); fp.rightMargin = dp(5); filters.addView(filter, fp); filter.setOnClickListener(v -> { workBucket = bucket[1]; loadPageData(); }); }
            content.addView(filters); addSpace(12);
        }
        JSONArray rows = data.optJSONArray("items");
        if (rows == null) {
            if (selected.equals("workstation")) rows = data.optJSONArray("items");
            else if (selected.equals("team-email-inbox")) rows = data.optJSONArray("items");
        }
        if (rows == null || rows.length() == 0) addEmpty(selected.equals("workstation") ? "Nothing in this queue. Try another filter or check back later." : "No items available, or your role does not include this module.");
        else if (selected.equals("channels")) {
            for (int i = 0; i < rows.length(); i++) { JSONObject channel = rows.optJSONObject(i); if (channel == null) continue; LinearLayout card = toolCard(channel.optString("name", "Team channel"), "Open conversation"); card.setOnClickListener(v -> openChat(channel.optString("id"), channel.optString("name"))); }
        } else for (int i = 0; i < rows.length(); i++) addRecord(rows.optJSONObject(i), selected);
        if (selected.equals("team-email-history")) addText("Sent team email history. Tap Email on a contact record to open your Android mail app.", 12, MUTED, false);
        if (selected.equals("call-followups")) addText("Tap Call to use the phone dialer. HYMN does not place calls without your confirmation.", 12, MUTED, false);
    }

    private String toolName(String name) { if (name.equals("workstation")) return "Work-station"; if (name.equals("call-followups")) return "Calls & follow-ups"; if (name.equals("team-email-inbox")) return "Team email"; return name.replace('-', ' '); }

    private LinearLayout toolCard(String title, String subtitle) {
        LinearLayout card = new LinearLayout(this); card.setOrientation(LinearLayout.VERTICAL); card.setPadding(dp(15), dp(13), dp(15), dp(13)); card.setBackground(shape(surface(), BORDER, 14)); LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2); p.bottomMargin = dp(9); content.addView(card, p); card.addView(text(title, 15, NAVY, true)); TextView sub = text(subtitle, 11, MUTED, false); LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-1, -2); sp.topMargin = dp(5); card.addView(sub, sp); return card;
    }

    private void openChat(String id, String name) {
        chatChannelId = id; chatChannelName = name;
        content.removeAllViews(); addText(name, 21, NAVY, true); addText("Team conversation", 12, MUTED, false); addSpace(12);
        LinearLayout compose = new LinearLayout(this); compose.setGravity(Gravity.CENTER_VERTICAL); EditText input = new EditText(this); styleInput(input); input.setHint("Write a message"); input.setTextSize(13); input.setMinHeight(dp(48)); input.setBackground(shape(surface(), BORDER, 12)); compose.addView(input, new LinearLayout.LayoutParams(0, -2, 1)); Button send = button("Send", true); LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(dp(78), dp(48)); sp.leftMargin = dp(8); compose.addView(send, sp); content.addView(compose);
        send.setOnClickListener(v -> { String body = input.getText().toString().trim(); if (body.isEmpty()) return; try { JSONObject payload = new JSONObject().put("channelId", chatChannelId).put("body", body).put("clientKey", UUID.randomUUID().toString()).put("mentions", new JSONArray()); io.execute(() -> { try { api.post("messages", workspace, payload); runOnUiThread(() -> openChat(chatChannelId, chatChannelName)); } catch (Exception e) { runOnUiThread(() -> toastError(e.getMessage())); } }); } catch (Exception ignored) { } });
        io.execute(() -> { try { String channel = java.net.URLEncoder.encode(id, "UTF-8"); JSONObject messages = api.get("messages", workspace, "channel=" + channel); runOnUiThread(() -> { JSONArray items = messages.optJSONArray("items"); if (items == null || items.length() == 0) addEmpty("Start this conversation with a message."); else for (int i=0;i<items.length();i++) { JSONObject row = items.optJSONObject(i); if (row == null) continue; JSONObject author = row.optJSONObject("author"); String who = author != null && author.optJSONObject("user") != null ? author.optJSONObject("user").optString("name", "Teammate") : "Teammate"; LinearLayout card = toolCard(who, row.optString("body", "")); } }); } catch (Exception e) { runOnUiThread(() -> addEmpty(safe(e.getMessage()))); } });
    }
    private void signOut() {
        screenGeneration.incrementAndGet();
        io.execute(() -> { try { api.request("POST", "/api/auth/logout", new JSONObject(), true); } catch (Exception ignored) { } api.clear(); WorkManager manager = WorkManager.getInstance(getApplicationContext()); manager.cancelUniqueWork("hymn-team-notification-sync"); manager.cancelUniqueWork("hymn-team-notification-sync-now"); manager.cancelAllWorkByTag("hymn-team-call-reminder"); getSharedPreferences("hymn_team_call_reminders", MODE_PRIVATE).edit().clear().apply(); runOnUiThread(this::showLogin); });
    }

    private void toggleTheme() {
        nightMode = !nightMode; getSharedPreferences("hymn_team_settings", MODE_PRIVATE).edit().putBoolean("night_mode", nightMode).apply(); applyThemePalette(); showPage("more");
    }

    private void confirmSignOut() {
        new AlertDialog.Builder(this).setTitle("Sign out?").setMessage("You can sign back in with your HYMN team Google account.").setNegativeButton("Cancel", null).setPositiveButton("Sign out", (d, w) -> signOut()).show();
    }

    private void startNotificationSync() {
        if (notificationSyncStarted) return;
        notificationSyncStarted = true;
        Constraints constraints = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(TeamNotificationWorker.class, 15, TimeUnit.MINUTES).setConstraints(constraints).addTag("hymn-team-notification-sync").build();
        WorkManager.getInstance(getApplicationContext()).enqueueUniquePeriodicWork("hymn-team-notification-sync", ExistingPeriodicWorkPolicy.KEEP, request);
        androidx.work.OneTimeWorkRequest initialSync = new androidx.work.OneTimeWorkRequest.Builder(TeamNotificationWorker.class).setConstraints(constraints).addTag("hymn-team-notification-sync").build();
        WorkManager.getInstance(getApplicationContext()).enqueueUniqueWork("hymn-team-notification-sync-now", androidx.work.ExistingWorkPolicy.KEEP, initialSync);
        boolean asked = getSharedPreferences("hymn_team_settings", MODE_PRIVATE).getBoolean("notification_permission_asked", false);
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            if (asked) return;
            getSharedPreferences("hymn_team_settings", MODE_PRIVATE).edit().putBoolean("notification_permission_asked", true).apply();
            requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 401);
        }
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); setIntent(intent);
        String destination = intent.getStringExtra("screen");
        if (destination != null && !workspace.isEmpty()) showPage(destination);
    }

    private void renderError(String error) { content.removeAllViews(); addText("Couldn’t load this section", 20, NAVY, true); addSpace(8); addText(safe(error), 13, MUTED, false); addSpace(14); Button retry = button("Try again", true); content.addView(retry); retry.setOnClickListener(v -> loadPageData()); if (page.equals("more") && !tool.isEmpty()) { Button back = button("Back to workspace", false); LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(-1, dp(46)); bp.topMargin = dp(8); content.addView(back, bp); back.setOnClickListener(v -> { tool = ""; loadPageData(); }); } }

    private void navigateBack() {
        if (page.equals("more") && !tool.isEmpty()) { tool = ""; loadPageData(); return; }
        if (page.equals("workspace-detail")) { String target = previousPage; if (target.equals("workspace-detail")) target = "home"; showPage(target); return; }
        if (!page.equals("home")) { String target = previousPage; if (target.equals(page) || target.equals("workspace-detail")) target = "home"; showPage(target); return; }
        finish();
    }
    private void addText(String value, float size, int color, boolean bold) { TextView t = text(value, size, color, bold); LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2); p.bottomMargin = dp(5); content.addView(t, p); }
    private void addSectionTitle(String value) { TextView t = text(value, 17, NAVY, true); LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2); p.bottomMargin = dp(10); content.addView(t, p); }
    private void addSpace(int h) { View v = new View(this); content.addView(v, new LinearLayout.LayoutParams(1, dp(h))); }
    private void addEmpty(String value) { TextView t = text(value, 13, MUTED, false); t.setPadding(dp(14), dp(18), dp(14), dp(18)); t.setBackground(shape(surface(), BORDER, 12)); LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2); p.bottomMargin = dp(10); content.addView(t, p); }
    private int count(JSONArray a) { return a == null ? 0 : a.length(); }
    private int unread(JSONArray a) { int count = 0; if (a != null) for (int i=0;i<a.length();i++) if (a.optJSONObject(i) != null && a.optJSONObject(i).isNull("readAt")) count++; return count; }
    private String firstName(String name) { return name == null || name.trim().isEmpty() ? "there" : name.trim().split("\\s+")[0]; }
    private String safe(String error) { return error == null || error.isEmpty() ? "Please try again." : error; }
    private String formatDate(String value) { try { String normalized = value.endsWith("Z") ? value : value; java.time.Instant instant = java.time.Instant.parse(normalized); return new SimpleDateFormat("EEE, d MMM · h:mm a", Locale.getDefault()).format(Date.from(instant)); } catch (Exception ignored) { return value; } }
    private void dial(String phone) { try { startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(phone)))); } catch (Exception e) { toastError("No phone app is available."); } }
    private void email(String address) { try { startActivity(new Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:" + Uri.encode(address)))); } catch (Exception e) { toastError("No email app is available."); } }
    private void toastError(String error) { new AlertDialog.Builder(this).setMessage(safe(error)).setPositiveButton("OK", null).show(); }

    @Override protected void onDestroy() { io.shutdownNow(); super.onDestroy(); }

    @Override public void onBackPressed() {
        navigateBack();
    }
}
