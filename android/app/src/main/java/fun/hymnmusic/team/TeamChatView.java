package fun.hymnmusic.team;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.*;
import org.json.*;
import java.util.*;
import java.util.concurrent.*;

/** Native chat, with a stable composer and foreground-only live synchronization. */
final class TeamChatView {
    interface AvatarLoader { void load(ImageView image, String url); default long cachedBytes() { return 0; } default void clearCache() throws Exception {} }
    private final Activity activity;
    private final TeamApi api;
    private final String workspace, me;
    private final int ink, muted, background, surface, accent, border;
    private final AvatarLoader avatars;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newFixedThreadPool(2);
    private final LinearLayout root, body;
    private final Map<String, JSONObject> messages = new HashMap<>(), people = new HashMap<>();
    private final Map<String, View> messageViews = new HashMap<>();
    private final Set<String> marking = new HashSet<>();
    private JSONArray members = new JSONArray();
    private JSONObject channel;
    private ScrollView scroll;
    private LinearLayout thread;
    private EditText composer;
    private TextView connection;
    private Button send;
    private boolean closed, paused, syncing, sending, initial, historyEnd;
    private int generation, failures, loaded;
    private String fingerprint = "", pendingKey = "", pendingBody = "";
    private String search = "";
    private JSONObject lastList;
    private ChatCache downloads;
    private boolean remoteVerified, clearingDownloads;
    private final Runnable tick = this::refresh;
    private final Runnable readVisible = this::markVisible;

    TeamChatView(Activity activity, TeamApi api, String workspace, String me, int ink, int muted, int background, int surface, int accent, int border, AvatarLoader avatars) {
        this.activity = activity; this.api = api; this.workspace = workspace; this.me = me;
        this.ink = ink; this.muted = muted; this.background = background; this.surface = surface; this.accent = accent; this.border = border; this.avatars = avatars;
        try { downloads = api.chatCache(workspace, me); } catch (Exception ignored) { }
        root = column(); root.setBackgroundColor(background); body = column(); root.addView(body, new LinearLayout.LayoutParams(-1, -1));
    }
    View view() { return root; }
    private int dp(int n) { return (int)(n * activity.getResources().getDisplayMetrics().density + .5f); }
    private LinearLayout column() { LinearLayout v = new LinearLayout(activity); v.setOrientation(1); return v; }
    private GradientDrawable shape(int color, int radius) { GradientDrawable d = new GradientDrawable(); d.setColor(color); d.setCornerRadius(dp(radius)); return d; }
    private TextView label(String value, int size, int color, boolean bold) { TextView t = new TextView(activity); t.setText(value); t.setTextColor(color); t.setTextSize(size); if (bold) t.setTypeface(null, Typeface.BOLD); return t; }
    private Button button(String title) { Button b = new Button(activity); b.setText(title); b.setAllCaps(false); b.setTextColor(accent); b.setTextSize(13); b.setMinWidth(0); b.setMinimumWidth(0); b.setPadding(dp(14), 0, dp(14), 0); b.setBackground(shape(surface, 14)); return b; }
    private void space(LinearLayout box, int n) { box.addView(new View(activity), new LinearLayout.LayoutParams(1, dp(n))); }
    private JSONObject user(JSONObject person) { JSONObject u = person == null ? null : person.optJSONObject("user"); return u == null ? new JSONObject() : u; }
    private View avatar(String name, String url, int size) {
        FrameLayout frame = new FrameLayout(activity); frame.setLayoutParams(new LinearLayout.LayoutParams(dp(size), dp(size)));
        TextView initials = label(name.isEmpty() ? "H" : name.substring(0, 1).toUpperCase(Locale.ROOT), Math.max(9, size / 3), accent, true); initials.setGravity(Gravity.CENTER); initials.setBackground(shape(surface == Color.WHITE ? Color.rgb(226, 235, 244) : border, size)); frame.addView(initials, new FrameLayout.LayoutParams(-1, -1));
        ImageView image = new ImageView(activity); image.setScaleType(ImageView.ScaleType.CENTER_CROP); image.setBackground(shape(Color.TRANSPARENT, size)); image.setClipToOutline(true); frame.addView(image, new FrameLayout.LayoutParams(-1, -1)); if (!url.isEmpty() && !url.equals("null")) avatars.load(image, url);
        image.setOutlineProvider(new android.view.ViewOutlineProvider() { @Override public void getOutline(View v, android.graphics.Outline outline) { outline.setOval(0, 0, v.getWidth(), v.getHeight()); } });
        frame.setContentDescription(name); return frame;
    }
    void start() { showList(); }
    void openExternal(String id, String name) { try { open(new JSONObject().put("id", id).put("name", name).put("direct", id.startsWith("dm-"))); } catch (Exception ignored) {} }
    void pause() { paused = true; main.removeCallbacks(tick); main.removeCallbacks(readVisible); }
    void resume() { if (closed) return; paused = false; schedule(0); }
    void close() { closed = true; generation++; main.removeCallbacksAndMessages(null); network.shutdownNow(); }
    boolean back() { if (channel == null) return false; saveComposer(); showList(); return true; }
    private void schedule(long delay) { main.removeCallbacks(tick); if (!paused && !closed) main.postDelayed(tick, delay); }
    private void hint(String text) { if (connection != null) connection.setText(text); }

    private void showList() {
        generation++; syncing = false; remoteVerified = false; channel = null; messages.clear(); messageViews.clear(); marking.clear(); fingerprint = ""; body.removeAllViews(); body.setPadding(dp(16), dp(12), dp(16), 0);
        LinearLayout heading = new LinearLayout(activity); heading.setGravity(Gravity.CENTER_VERTICAL); heading.addView(label("Chats", 25, ink, true), new LinearLayout.LayoutParams(0, -2, 1));
        Button direct = button("New chat"); direct.setBackground(shape(accent, 14)); direct.setTextColor(surface); heading.addView(direct, new LinearLayout.LayoutParams(-2, dp(42))); direct.setOnClickListener(v -> choose(false)); Button group = button("New group"); LinearLayout.LayoutParams gp = new LinearLayout.LayoutParams(-2, dp(42)); gp.leftMargin = dp(8); heading.addView(group, gp); group.setOnClickListener(v -> choose(true)); body.addView(heading); space(body, 12);
        EditText find = new EditText(activity); find.setTextColor(ink); find.setHintTextColor(muted); find.setHint("Search conversations"); find.setTextSize(14); find.setSingleLine(true); find.setPadding(dp(14), dp(9), dp(14), dp(9)); find.setBackground(shape(surface, 18)); find.setText(search); body.addView(find, new LinearLayout.LayoutParams(-1, dp(44)));
        find.addTextChangedListener(new android.text.TextWatcher() { public void beforeTextChanged(CharSequence s, int start, int count, int after) {} public void onTextChanged(CharSequence s, int start, int before, int count) { search = s.toString(); if (lastList != null) { fingerprint = ""; renderList(lastList); } } public void afterTextChanged(android.text.Editable s) {} });
        LinearLayout status = new LinearLayout(activity); status.setGravity(Gravity.CENTER_VERTICAL); connection = label("Updating conversations…", 12, muted, false); connection.setPadding(0, dp(9), 0, dp(4)); status.addView(connection, new LinearLayout.LayoutParams(0, -2, 1)); Button storage = button("Storage"); status.addView(storage, new LinearLayout.LayoutParams(-2, dp(40))); storage.setOnClickListener(v -> showStorage()); body.addView(status); space(body, 10);
        scroll = new ScrollView(activity); thread = column(); scroll.addView(thread); body.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1)); schedule(0);
        if (lastList != null) renderList(lastList);
        else try { JSONObject cached = api.chatDraft("directory:" + workspace + ":" + me); if (System.currentTimeMillis() - cached.optLong("at") < 300000 && cached.optJSONObject("data") != null) renderList(cached.getJSONObject("data")); } catch (Exception ignored) { }
    }

    private void open(JSONObject next) {
        saveComposer(); generation++; syncing = false; sending = false; historyEnd = false; remoteVerified = false; clearingDownloads = false; channel = next; messages.clear(); messageViews.clear(); marking.clear(); loaded = 0; fingerprint = ""; initial = true;
        body.removeAllViews(); body.setPadding(0, 0, 0, 0);
        LinearLayout bar = new LinearLayout(activity); bar.setGravity(Gravity.CENTER_VERTICAL); bar.setPadding(dp(12), dp(8), dp(12), dp(8)); bar.setBackgroundColor(surface);
        Button back = button("‹"); bar.addView(back, new LinearLayout.LayoutParams(dp(44), dp(44))); back.setOnClickListener(v -> back());
        bar.addView(avatar(next.optString("name", "Team"), next.optString("avatar", ""), 40));
        LinearLayout names = column(); names.setPadding(dp(10), 0, 0, 0); TextView title = label(next.optString("name", "Conversation"), 17, ink, true); title.setSingleLine(true); title.setEllipsize(android.text.TextUtils.TruncateAt.END); names.addView(title);
        connection = label("Opening saved messages…", 11, muted, false); names.addView(connection); bar.addView(names, new LinearLayout.LayoutParams(0, -2, 1)); Button menu = button("⋮"); menu.setContentDescription("Chat storage options"); bar.addView(menu, new LinearLayout.LayoutParams(dp(44), dp(44))); menu.setOnClickListener(v -> showStorage()); body.addView(bar);
        scroll = new ScrollView(activity); scroll.setFillViewport(true); thread = column(); thread.setPadding(dp(12), dp(12), dp(12), dp(12)); scroll.addView(thread); body.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        scroll.getViewTreeObserver().addOnScrollChangedListener(() -> { main.removeCallbacks(readVisible); main.postDelayed(readVisible, 250); });
        LinearLayout compose = new LinearLayout(activity); compose.setGravity(Gravity.BOTTOM); compose.setPadding(dp(10), dp(8), dp(10), dp(8)); compose.setBackgroundColor(surface);
        composer = new EditText(activity); composer.setTextColor(ink); composer.setHintTextColor(muted); composer.setHint("Message"); composer.setTextSize(15); composer.setMaxLines(5); composer.setMinLines(1); composer.setPadding(dp(14), dp(10), dp(14), dp(10)); composer.setBackground(shape(background, 22)); composer.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE | android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES); composer.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(4000)});
        pendingBody = ""; pendingKey = "";
        try { JSONObject draft = api.chatDraft(draftKey()); pendingBody = draft.optString("pendingBody"); pendingKey = draft.optString("pendingKey"); composer.setText(draft.optString("text")); } catch (Exception ignored) { hint("Your saved draft couldn't load. Reopen this chat to retry."); }
        composer.addTextChangedListener(new android.text.TextWatcher() { public void beforeTextChanged(CharSequence s, int start, int count, int after) {} public void onTextChanged(CharSequence s, int start, int before, int count) { saveComposer(); } public void afterTextChanged(android.text.Editable s) {} });
        compose.addView(composer, new LinearLayout.LayoutParams(0, -2, 1)); send = button("Send"); LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(dp(70), dp(48)); sp.leftMargin = dp(8); compose.addView(send, sp); send.setOnClickListener(v -> send()); body.addView(compose); restoreDownloads(); schedule(0);
    }
    private String draftKey() { return workspace + ":" + me + ":" + channel.optString("id"); }
    private void saveComposer() { if (channel != null && composer != null) try { api.saveChatDraft(draftKey(), new JSONObject().put("text", composer.getText().toString()).put("pendingBody", pendingBody).put("pendingKey", pendingKey)); } catch (Exception ignored) { hint("Could not save this draft on your phone. Keep the chat open until sent."); } }

    private void refresh() {
        if (paused || closed || syncing) return;
        syncing = true; final int token = generation; final String id = channel == null ? "" : channel.optString("id"); final String query = channel == null ? "" : messageQuery(id);
        network.execute(() -> { try {
            JSONObject data = id.isEmpty() ? api.get("chat-conversations", workspace, "") : api.get("chat-messages", workspace, query);
            main.post(() -> { if (closed || token != generation) return; syncing = false; failures = 0;
                if (id.isEmpty()) { if (!data.toString().equals(fingerprint)) try { api.saveChatDraft("directory:" + workspace + ":" + me, new JSONObject().put("at", System.currentTimeMillis()).put("data", data)); } catch (Exception ignored) {} renderList(data); } else { remoteVerified = true; updateThread(data); }
                hint(id.isEmpty() ? "Private conversations with your team" : "Live sync · " + (channel.optBoolean("direct") ? "Personal chat" : "Group chat")); schedule(id.isEmpty() ? 5000 : 2000);
            });
        } catch (Exception e) { main.post(() -> { if (closed || token != generation) return; syncing = false; failures++; hint("Reconnecting… " + (messages.isEmpty() && id.length() > 0 ? "Your draft is kept." : ""));
            if (e instanceof TeamApi.ApiException && (((TeamApi.ApiException)e).status == 401 || ((TeamApi.ApiException)e).status == 403 || ((TeamApi.ApiException)e).status == 404)) { saveComposer(); messages.clear(); thread.removeAllViews(); members = new JSONArray(); people.clear(); lastList = null; if (downloads != null) api.chatDisk(() -> { try { if (((TeamApi.ApiException)e).status == 401) downloads.clearAll(); else if (!id.isEmpty()) downloads.clear(id); } catch (Exception ignored) {} }); try { api.saveChatDraft("directory:" + workspace + ":" + me, new JSONObject()); } catch (Exception ignored) {} hint("Chat unavailable. Return to Chats or sign in again."); return; }
            schedule(Math.min(15000, 2000L * failures)); }); } });
    }
    private String messageQuery(String id) { return "channel=" + android.net.Uri.encode(id) + (channel != null && !channel.optString("peerId").isEmpty() ? "&peer=" + android.net.Uri.encode(channel.optString("peerId")) : ""); }

    private void renderList(JSONObject data) {
        lastList = data;
        members = data.optJSONArray("members"); if (members == null) members = new JSONArray();
        for (int i = 0; i < members.length(); i++) { JSONObject p = members.optJSONObject(i); if (p != null) people.put(p.optString("id"), p); }
        String next = data.toString(); if (next.equals(fingerprint)) return; fingerprint = next; thread.removeAllViews();
        JSONArray rows = data.optJSONArray("items"); if (rows == null || rows.length() == 0) { thread.addView(label("Start a conversation with a teammate or create a group.", 15, muted, false)); return; }
        for (int i = 0; i < rows.length(); i++) { JSONObject c = rows.optJSONObject(i); if (c == null || !c.optString("name").toLowerCase(Locale.ROOT).contains(search.toLowerCase(Locale.ROOT))) continue;
            LinearLayout row = new LinearLayout(activity); row.setGravity(Gravity.CENTER_VERTICAL); row.setPadding(dp(12), dp(14), dp(12), dp(14)); row.setBackground(shape(surface, 16)); row.addView(avatar(c.optString("name", "Team"), c.optString("avatar", ""), 50));
            LinearLayout text = column(); text.setPadding(dp(12), 0, dp(8), 0); text.addView(label(c.optString("name", "Team"), 16, ink, true)); JSONObject last = c.optJSONObject("lastMessage"); TextView preview = label(last == null ? "Say hello" : last.optString("body"), 13, muted, false); preview.setSingleLine(true); preview.setEllipsize(android.text.TextUtils.TruncateAt.END); text.addView(preview); row.addView(text, new LinearLayout.LayoutParams(0, -2, 1));
            LinearLayout meta = column(); meta.setGravity(Gravity.RIGHT); if (last != null) meta.addView(label(time(last.optString("createdAt")), 10, muted, false)); if (c.optInt("unread") > 0) { TextView count = label(String.valueOf(c.optInt("unread")), 11, Color.WHITE, true); count.setGravity(Gravity.CENTER); count.setBackground(shape(Color.rgb(30, 135, 100), 20)); meta.addView(count, new LinearLayout.LayoutParams(dp(25), dp(25))); } row.addView(meta); LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(-1, -2); rp.bottomMargin = dp(8); thread.addView(row, rp); row.setOnClickListener(v -> open(c));
        }
    }

    private void updateThread(JSONObject data) { updateThread(data, true); }
    private void updateThread(JSONObject data, boolean latest) {
        JSONArray readers = data.optJSONArray("readers"); if (readers != null) for (int i = 0; i < readers.length(); i++) { JSONObject p = readers.optJSONObject(i); if (p != null) people.put(p.optString("id"), p); }
        JSONArray rows = data.optJSONArray("items"); if (rows == null) rows = new JSONArray(); loaded = Math.max(loaded, rows.length());
        boolean changed = latest && ChatCache.pruneMissing(messages, rows);
        if (latest && rows.length() < 50) historyEnd = true;
        for (int i = 0; i < rows.length(); i++) { JSONObject m = rows.optJSONObject(i); if (m == null) continue; String id = m.optString("id"); JSONObject old = messages.put(id, m); if (old == null || !old.toString().equals(m.toString())) changed = true;
            String key = m.optString("clientKey"); if (key.startsWith(me + ":")) { messages.remove("pending:" + key.substring(me.length() + 1)); if (!sending && !pendingKey.isEmpty() && key.equals(me + ":" + pendingKey)) { pendingKey = ""; pendingBody = ""; composer.setText(""); send.setText("Send"); } }
        }
        if (!changed && !initial) { markVisible(); return; }
        renderMessages(); persistDownloads();
    }
    private void renderMessages() {
        boolean bottom = initial || scroll.getChildCount() == 0 || scroll.getScrollY() + scroll.getHeight() >= thread.getHeight() - dp(100); int y = scroll.getScrollY();
        thread.removeAllViews(); messageViews.clear();
        if (loaded >= 50 && !historyEnd) { Button older = button("Load earlier messages"); thread.addView(older); older.setOnClickListener(v -> loadOlder(older)); }
        ArrayList<JSONObject> rows = new ArrayList<>(messages.values()); rows.sort(Comparator.comparing((JSONObject m) -> m.optString("createdAt")).thenComparing(m -> m.optString("id")));
        String day = "";
        for (JSONObject m : rows) {
            String date = m.optString("createdAt").split("T")[0]; if (!day.equals(date)) { TextView divider = label(date, 11, muted, false); divider.setGravity(Gravity.CENTER); divider.setPadding(0, dp(12), 0, dp(12)); thread.addView(divider); day = date; }
            boolean mine = me.equals(m.optString("authorId")); LinearLayout line = new LinearLayout(activity); line.setGravity(mine ? Gravity.RIGHT : Gravity.LEFT); LinearLayout bubble = column(); bubble.setPadding(dp(12), dp(8), dp(12), dp(7)); bubble.setBackground(shape(mine ? (surface == Color.WHITE ? Color.rgb(218, 242, 231) : Color.rgb(28, 66, 61)) : surface, 16));
            if (!mine && !channel.optBoolean("direct")) bubble.addView(label(user(m.optJSONObject("author")).optString("name", "Teammate"), 11, accent, true));
            TextView text = label(m.optString("body"), 15, ink, false); text.setTextIsSelectable(true); text.setMaxWidth(dp(265)); android.text.util.Linkify.addLinks(text, android.text.util.Linkify.WEB_URLS); bubble.addView(text); TextView stamp = label(time(m.optString("createdAt")), 10, muted, false); stamp.setGravity(Gravity.RIGHT); bubble.addView(stamp);
            LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(-2, -2); bp.bottomMargin = dp(6); line.addView(bubble, bp); thread.addView(line); messageViews.put(m.optString("id"), line);
            if (mine) addReceipt(m);
        }
        if (rows.isEmpty()) { TextView empty = label("Messages stay within your HYMN team. Say hello to get started.", 13, muted, false); empty.setPadding(dp(16), dp(30), dp(16), 0); thread.addView(empty); }
        initial = false; scroll.post(() -> { if (bottom) scroll.fullScroll(View.FOCUS_DOWN); else scroll.scrollTo(0, y); main.postDelayed(readVisible, 200); });
    }
    private void addReceipt(JSONObject message) {
        JSONArray ids = message.optJSONArray("readMemberIds"); ArrayList<String> seen = new ArrayList<>(); if (ids != null) for (int i = 0; i < ids.length(); i++) if (!me.equals(ids.optString(i))) seen.add(ids.optString(i));
        LinearLayout row = new LinearLayout(activity); row.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL); row.setPadding(0, 0, dp(4), dp(6));
        if (channel.optBoolean("direct")) row.addView(label(seen.isEmpty() ? "Sent" : "Seen", 10, seen.isEmpty() ? muted : accent, false));
        else { for (int i = 0; i < Math.min(4, seen.size()); i++) { JSONObject u = user(people.get(seen.get(i))); View picture = avatar(u.optString("name", "Teammate"), u.optString("avatar", ""), 18); row.addView(picture); } if (seen.size() > 4) row.addView(label(" +" + (seen.size() - 4), 10, muted, false)); }
        if (message.has("_state")) { row.removeAllViews(); row.addView(label(message.optString("_state").equals("failed") ? "Not sent · tap Retry" : "Sending…", 10, muted, false)); }
        thread.addView(row);
    }
    private void markVisible() {
        if (closed || paused || channel == null || !remoteVerified || clearingDownloads || !activity.hasWindowFocus()) return;
        JSONArray ids = new JSONArray(); Rect bounds = new Rect();
        for (Map.Entry<String, View> entry : messageViews.entrySet()) { JSONObject m = messages.get(entry.getKey()); if (m == null || me.equals(m.optString("authorId")) || marking.contains(entry.getKey())) continue;
            boolean seen = false; JSONArray read = m.optJSONArray("readMemberIds"); if (read != null) for (int i = 0; i < read.length(); i++) if (me.equals(read.optString(i))) seen = true;
            if (!seen && entry.getValue().getGlobalVisibleRect(bounds) && bounds.height() > dp(12)) { ids.put(entry.getKey()); marking.add(entry.getKey()); if (ids.length() == 50) break; }
        }
        if (ids.length() == 0) return; final int token = generation; final String id = channel.optString("id");
        network.execute(() -> { try { api.post("chat-read", workspace, new JSONObject().put("channelId", id).put("ids", ids)); }
            catch (Exception ignored) { main.post(() -> { if (token == generation) for (int i = 0; i < ids.length(); i++) marking.remove(ids.optString(i)); }); } });
    }
    private void loadOlder(Button button) {
        if (closed || paused) return;
        button.setEnabled(false); final int token = generation; final String id = channel.optString("id");
        final int offset = (int)messages.values().stream().filter(m -> !m.has("_state")).count();
        final String query = messageQuery(id) + "&offset=" + offset;
        network.execute(() -> { try { JSONObject result = api.get("chat-messages", workspace, query); main.post(() -> { if (closed || token != generation) return; updateThread(result, false); button.setEnabled(true); if (result.optJSONArray("items") != null && result.optJSONArray("items").length() < 50) { historyEnd = true; renderMessages(); persistDownloads(); } }); }
            catch (Exception e) { main.post(() -> { if (closed || token != generation) return; button.setEnabled(true); hint("Earlier messages couldn't load. Tap to retry."); }); } });
    }
    private void send() {
        if (closed || paused || sending || channel == null) return; String text = composer.getText().toString().trim(); if (text.isEmpty()) return;
        if (!text.equals(pendingBody)) { pendingBody = text; pendingKey = UUID.randomUUID().toString(); }
        saveComposer();
        final String id = channel.optString("id"), key = pendingKey; final int token = generation; sending = true; send.setEnabled(false); composer.setEnabled(false); send.setText("Sending");
        try { messages.put("pending:" + key, new JSONObject().put("id", "pending:" + key).put("authorId", me).put("body", text).put("createdAt", java.time.Instant.now().toString()).put("_state", "sending")); renderMessages(); } catch (Exception ignored) {}
        final String peer = channel.optString("peerId");
        network.execute(() -> { try { JSONObject result = api.post("chat-send", workspace, new JSONObject().put("channelId", id).put("body", text).put("clientKey", key).put("peerId", peer)); main.post(() -> { if (closed || token != generation) return; completeSend(result, key); }); }
            catch (Exception e) { main.post(() -> { if (closed || token != generation) return;
                for (JSONObject received : messages.values()) if ((me + ":" + key).equals(received.optString("clientKey"))) { completeSend(received, key); return; }
                sending = false; composer.setEnabled(true); send.setEnabled(true); send.setText("Retry"); try { JSONObject pending = messages.get("pending:" + key); if (pending != null) pending.put("_state", "failed"); } catch (Exception ignored) {} renderMessages(); hint("Message not confirmed. Tap Retry; your message is kept."); }); } });
    }
    private void completeSend(JSONObject result, String key) {
        sending = false; remoteVerified = true; composer.setEnabled(true); send.setEnabled(true); send.setText("Send"); pendingBody = ""; pendingKey = ""; composer.setText(""); messages.remove("pending:" + key); messages.put(result.optString("id"), result); renderMessages(); persistDownloads(); schedule(0);
    }
    private void restoreDownloads() {
        if (downloads == null || channel == null) return;
        final String id = channel.optString("id"); final int token = generation;
        api.chatDisk(() -> { try {
            JSONObject saved = downloads.read(id);
            main.post(() -> { if (closed || token != generation || remoteVerified || clearingDownloads) return;
                if (saved == null) { hint("Syncing messages…"); return; }
                JSONArray rows = saved.optJSONArray("items"), readers = saved.optJSONArray("readers");
                if (readers != null) for (int i = 0; i < readers.length(); i++) { JSONObject p = readers.optJSONObject(i); if (p != null) people.put(p.optString("id"), p); }
                if (rows != null) for (int i = 0; i < rows.length(); i++) { JSONObject m = rows.optJSONObject(i); if (m != null && !messages.containsKey(m.optString("id"))) messages.put(m.optString("id"), m); }
                loaded = rows == null ? 0 : rows.length(); historyEnd = saved.optBoolean("historyEnd"); renderMessages(); hint("Saved on this phone · syncing updates…");
            });
        } catch (Exception ignored) { } });
    }
    private void persistDownloads() {
        if (downloads == null || channel == null || clearingDownloads || !remoteVerified) return;
        final String id = channel.optString("id"); final JSONObject descriptor = channel;
        final ArrayList<JSONObject> rows = new ArrayList<>(messages.values()), readers = new ArrayList<>(people.values());
        final boolean complete = historyEnd; final long epoch = downloads.epoch();
        api.chatDisk(() -> { try { downloads.put(id, ChatCache.snapshot(descriptor, rows, readers, complete), epoch); } catch (Exception ignored) { } });
    }
    private String storageSize(long bytes) {
        if (bytes == 0) return "0 KB";
        return bytes < 1_000_000 ? String.format(Locale.getDefault(), "%.0f KB", bytes / 1000d) : String.format(Locale.getDefault(), "%.1f MB", bytes / 1_000_000d);
    }
    private void showStorage() {
        final String id = channel == null ? "" : channel.optString("id");
        LinearLayout panel = column(); panel.setPadding(dp(20), dp(12), dp(20), dp(12)); panel.setBackgroundColor(surface);
        TextView usage = label("Calculating downloaded messages…", 15, ink, true); panel.addView(usage); space(panel, 8);
        ProgressBar meter = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal); meter.setMax(100); panel.addView(meter, new LinearLayout.LayoutParams(-1, dp(6))); space(panel, 12);
        TextView photos = label("Profile photos…", 13, muted, false); panel.addView(photos); space(panel, 14);
        TextView help = label("Recent messages are saved on this phone for faster opening. Older messages load from HYMN when needed.\n\nClearing downloads keeps shared messages and unsent drafts.", 13, muted, false); panel.addView(help); space(panel, 16);
        AlertDialog dialog = new AlertDialog.Builder(activity).setTitle("Chat storage").setView(panel).setPositiveButton("Done", null).create();
        Button one = button("Clear this chat's downloads"), all = button("Clear all chat downloads"), pictures = button("Clear downloaded photos");
        one.setEnabled(downloads != null && !id.isEmpty()); all.setEnabled(downloads != null); panel.addView(one, new LinearLayout.LayoutParams(-1, dp(46))); space(panel, 6); panel.addView(all, new LinearLayout.LayoutParams(-1, dp(46))); space(panel, 6); panel.addView(pictures, new LinearLayout.LayoutParams(-1, dp(46)));
        one.setOnClickListener(v -> { dialog.dismiss(); confirmClear(id, false, false); }); all.setOnClickListener(v -> { dialog.dismiss(); confirmClear("", true, false); }); pictures.setOnClickListener(v -> { dialog.dismiss(); confirmClear("", false, true); }); dialog.show();
        api.chatDisk(() -> { long bytes = downloads == null ? 0 : downloads.bytes(); int count = downloads == null ? 0 : downloads.count(); long images = avatars.cachedBytes();
            main.post(() -> { if (closed || !dialog.isShowing()) return; usage.setText(downloads == null ? "Local message storage is unavailable" : storageSize(bytes) + " of 20 MB · " + count + " saved chats"); meter.setProgress((int)Math.min(100, bytes * 100 / ChatCache.LIMIT_BYTES)); photos.setText("Downloaded profile photos: " + storageSize(images)); });
        });
    }
    private void confirmClear(String id, boolean all, boolean photos) {
        String title = photos ? "Clear downloaded photos?" : all ? "Clear all chat downloads?" : "Clear this chat's downloads?";
        String explanation = photos ? "Profile photos will download again when needed." : "Remove downloaded messages from this phone. Shared messages stay on HYMN and your unsent drafts are kept. Reopen a chat to download its messages again.";
        new AlertDialog.Builder(activity).setTitle(title).setMessage(explanation).setNegativeButton("Cancel", null).setPositiveButton("Clear downloads", (dialog, which) -> {
            saveComposer(); if (!photos) { clearingDownloads = true; generation++; syncing = false; main.removeCallbacks(tick); main.removeCallbacks(readVisible); }
            final int token = generation;
            api.chatDisk(() -> {
                String result;
                try { if (photos) avatars.clearCache(); else if (downloads != null) { if (all) downloads.clearAll(); else downloads.clear(id); } result = photos ? "Downloaded photos cleared" : "Downloaded messages cleared"; }
                catch (Exception e) { result = "Some downloads couldn't be cleared. Please try again."; }
                final String message = result;
                main.post(() -> { if (closed || token != generation) return; if (!photos) showList(); hint(message); Toast.makeText(activity, message, Toast.LENGTH_SHORT).show(); });
            });
        }).show();
    }
    private void choose(boolean group) {
        ArrayList<JSONObject> options = new ArrayList<>(); for (int i = 0; i < members.length(); i++) { JSONObject m = members.optJSONObject(i); if (m != null && !me.equals(m.optString("id"))) options.add(m); }
        options.sort(Comparator.comparing(p -> user(p).optString("name", "Teammate")));
        if (options.isEmpty()) { hint("Your team directory is updating. Please try again shortly."); schedule(0); return; }
        showPeople(options, group);
    }
    private void showPeople(ArrayList<JSONObject> options, boolean group) {
        LinearLayout panel = column(); panel.setPadding(dp(16), dp(8), dp(16), dp(8)); panel.setBackgroundColor(surface);
        EditText filter = new EditText(activity); filter.setTextColor(ink); filter.setHintTextColor(muted); filter.setHint("Search teammates"); filter.setSingleLine(true); filter.setTextSize(14); panel.addView(filter);
        ScrollView list = new ScrollView(activity); LinearLayout rows = column(); list.addView(rows); panel.addView(list, new LinearLayout.LayoutParams(-1, dp(340)));
        Set<String> selected = new HashSet<>();
        AlertDialog dialog = new AlertDialog.Builder(activity).setTitle(group ? "Add group members" : "New chat").setView(panel).setNegativeButton("Cancel", null).setPositiveButton(group ? "Next" : "Done", null).create();
        Runnable draw = () -> { rows.removeAllViews(); for (JSONObject p : options) {
            JSONObject u = user(p); String name = u.optString("name", "Teammate"); if (!name.toLowerCase(Locale.ROOT).contains(filter.getText().toString().toLowerCase(Locale.ROOT))) continue;
            LinearLayout row = new LinearLayout(activity); row.setGravity(Gravity.CENTER_VERTICAL); row.setPadding(0, dp(10), 0, dp(10)); row.addView(avatar(name, u.optString("avatar", ""), 44)); LinearLayout details = column(); details.setPadding(dp(12), 0, dp(6), 0); details.addView(label(name, 15, ink, true)); details.addView(label(p.optString("jobTitle", "Team member"), 11, muted, false)); row.addView(details, new LinearLayout.LayoutParams(0, -2, 1)); rows.addView(row);
            if (group) { CheckBox check = new CheckBox(activity); check.setChecked(selected.contains(p.optString("id"))); row.addView(check); check.setOnCheckedChangeListener((v, value) -> { if (value) selected.add(p.optString("id")); else selected.remove(p.optString("id")); dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(!selected.isEmpty()); }); row.setOnClickListener(v -> check.setChecked(!check.isChecked())); }
            else row.setOnClickListener(v -> { dialog.dismiss(); String id = p.optString("directChannelId"); if (id.isEmpty()) { hint("Team chat is updating. Refresh and try again."); schedule(0); return; } try { open(new JSONObject().put("id", id).put("name", name).put("avatar", u.optString("avatar", "")).put("peerId", p.optString("id")).put("direct", true)); } catch (Exception ignored) {} });
        } };
        filter.addTextChangedListener(new android.text.TextWatcher() { public void beforeTextChanged(CharSequence s, int start, int count, int after) {} public void onTextChanged(CharSequence s, int start, int before, int count) { draw.run(); } public void afterTextChanged(android.text.Editable s) {} });
        dialog.show(); draw.run(); dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(!group);
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> { if (!group) { dialog.dismiss(); return; } dialog.dismiss(); JSONArray ids = new JSONArray(); for (String id : selected) ids.put(id);
            EditText name = new EditText(activity); name.setHint("Group name"); name.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(100)});
            AlertDialog title = new AlertDialog.Builder(activity).setTitle("Name your group").setView(name).setNegativeButton("Cancel", null).setPositiveButton("Create group", null).create(); title.show(); title.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(w -> { if (name.getText().toString().trim().length() < 2) { name.setError("Use at least two characters"); return; } title.dismiss(); try { create("chat-group", new JSONObject().put("name", name.getText().toString()).put("memberIds", ids).put("requestKey", UUID.randomUUID().toString())); } catch (Exception ignored) {} });
        });
    }
    private void create(String resource, JSONObject request) {
        if (closed || paused) return;
        final int token = generation; hint("Opening conversation…"); network.execute(() -> { try {
            JSONObject result = api.post(resource, workspace, request); JSONObject next = new JSONObject().put("id", result.getString("id")).put("name", result.optString("name")).put("direct", resource.equals("chat-direct"));
            if (resource.equals("chat-direct")) { JSONObject u = user(people.get(request.optString("memberId"))); next.put("name", u.optString("name", "Teammate")).put("avatar", u.optString("avatar", "")); }
            main.post(() -> { if (!closed && token == generation) open(next); });
        } catch (Exception e) { main.post(() -> { if (closed || token != generation) return; hint("Couldn't confirm the group yet. Retry safely without creating a duplicate."); Button retry = button("Retry creating group"); thread.addView(retry, 0); retry.setOnClickListener(v -> { thread.removeView(retry); create(resource, request); }); }); } });
    }
    private String time(String value) { try { return java.time.Instant.parse(value).atZone(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("HH:mm")); } catch (Exception ignored) { return ""; } }
}
