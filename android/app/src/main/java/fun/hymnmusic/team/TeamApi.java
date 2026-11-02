package fun.hymnmusic.team;

import android.content.Context;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/** Small native HTTP client. Authorization stays in Android encrypted preferences. */
final class TeamApi {
    static final String BASE = "https://hymnmusic.fun";
    private static final String PREFS = "hymn_team_secure_session";
    private static final String KEY_COOKIE = "session_cookie";
    private static final String CHAT_CACHE_KEY = "hymn_team_chat_downloads_v1";
    private final Context context;
    private android.content.SharedPreferences securePrefs;
    private volatile String cacheScope = "";
    private final java.util.concurrent.atomic.AtomicLong cacheEpoch = new java.util.concurrent.atomic.AtomicLong();
    private final android.util.LruCache<String, JSONObject> screenCache = new android.util.LruCache<>(16);
    private final java.util.Map<String, ChatCache> chatCaches = new java.util.HashMap<>();
    private static final java.util.concurrent.ExecutorService CHAT_DISK = java.util.concurrent.Executors.newSingleThreadExecutor(r -> { Thread t = new Thread(r, "hymn-chat-storage"); t.setDaemon(true); return t; });

    TeamApi(Context context) { this.context = context.getApplicationContext(); }

    private synchronized android.content.SharedPreferences prefs() throws Exception {
        if (securePrefs != null) return securePrefs;
        MasterKey key = new MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build();
        securePrefs = EncryptedSharedPreferences.create(context, PREFS, key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
        return securePrefs;
    }

    String cookie() {
        try { return prefs().getString(KEY_COOKIE, ""); } catch (Exception ignored) { return ""; }
    }

    synchronized void clear() { cacheScope = ""; invalidateViews(); try { prefs().edit().remove(KEY_COOKIE).apply(); } catch (Exception ignored) { } }
    private synchronized void invalidateViews(){cacheEpoch.incrementAndGet();screenCache.evictAll();try{android.content.SharedPreferences.Editor edit=prefs().edit();for(String key:prefs().getAll().keySet())if(key.startsWith("view_cache:"))edit.remove(key);edit.apply();}catch(Exception ignored){}}
    synchronized void setCacheScope(JSONObject session) {
        String next=session.optString("workspaceId")+":"+session.optString("memberId")+":"+session.optBoolean("owner")+":"+session.optJSONArray("permissions");
        if (!next.equals(cacheScope)) { cacheEpoch.incrementAndGet(); screenCache.evictAll(); }
        cacheScope=next;
    }
    private String cacheKey(String resource,String workspace,String query) {
        if(cacheScope.isEmpty() || !java.util.Arrays.asList("overview","tasks","calendar","notifications","projects","members","workstation","call-followups","reports").contains(resource))return "";
        try { java.security.MessageDigest digest=java.security.MessageDigest.getInstance("SHA-256");byte[] bytes=digest.digest((cacheScope+":"+workspace+":"+resource+":"+query).getBytes(StandardCharsets.UTF_8));StringBuilder key=new StringBuilder("view_cache:");for(byte b:bytes)key.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return key.toString(); }catch(Exception ignored){return "";}
    }
    synchronized JSONObject cached(String resource,String workspace,String query) {
        String key=cacheKey(resource,workspace,query);if(key.isEmpty())return null;
        try {JSONObject saved=screenCache.get(key);if(saved==null){String value=prefs().getString(key,"");if(value.isEmpty())return null;saved=new JSONObject(value);screenCache.put(key,saved);}if(System.currentTimeMillis()-saved.optLong("at")>15*60*1000L)return null;return new JSONObject(saved.getJSONObject("data").toString());}catch(Exception ignored){return null;}
    }
    private synchronized void remember(String key,JSONObject data,long epoch) {
        if(key.isEmpty()||epoch!=cacheEpoch.get())return;
        try {JSONObject saved=new JSONObject().put("at",System.currentTimeMillis()).put("data",data);String value=saved.toString();if(value.length()>200000)return;screenCache.put(key,saved);
            chatDisk(()->{synchronized(TeamApi.this){try{if(epoch!=cacheEpoch.get()||cacheScope.isEmpty())return;android.content.SharedPreferences.Editor edit=prefs().edit();java.util.List<String> keys=new java.util.ArrayList<>();for(String existing:prefs().getAll().keySet())if(existing.startsWith("view_cache:"))keys.add(existing);while(keys.size()>=16)edit.remove(keys.remove(0));edit.putString(key,value).apply();}catch(Exception ignored){}}});
        }catch(Exception ignored){}
    }
    static final class ApiException extends IllegalStateException {
        final int status;
        ApiException(int status, String message) { super(message); this.status = status; }
    }
    JSONObject workDraft(String key) throws Exception {
        String value = prefs().getString("work_draft:" + key, "");
        return value.isEmpty() ? null : new JSONObject(value);
    }
    void saveWorkDraft(String key, JSONObject value) throws Exception { prefs().edit().putString("work_draft:" + key, value.toString()).apply(); }
    void clearWorkDraft(String key) throws Exception { prefs().edit().remove("work_draft:" + key).apply(); }
    JSONObject chatDraft(String key) throws Exception { String value = prefs().getString("chat_draft:" + key, "{}"); return new JSONObject(value); }
    void saveChatDraft(String key, JSONObject draft) throws Exception { prefs().edit().putString("chat_draft:" + key, draft.toString()).apply(); }
    synchronized ChatCache chatCache(String workspace, String member) throws Exception {
        String scope = workspace + ":" + member; ChatCache store = chatCaches.get(scope); if (store != null) return store;
        new MasterKey.Builder(context, CHAT_CACHE_KEY).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build();
        java.security.KeyStore keys = java.security.KeyStore.getInstance("AndroidKeyStore"); keys.load(null);
        store = new ChatCache(new java.io.File(context.getNoBackupFilesDir(), "chat-downloads"), workspace, member, (javax.crypto.SecretKey)keys.getKey(CHAT_CACHE_KEY, null));
        chatCaches.put(scope, store); return store;
    }
    void chatDisk(Runnable work) { CHAT_DISK.execute(work); }
    String lastNotificationId() { try { return prefs().getString("last_notification_id", ""); } catch (Exception ignored) { return ""; } }
    void setLastNotificationId(String id) { try { prefs().edit().putString("last_notification_id", id).apply(); } catch (Exception ignored) { } }

    JSONObject request(String method, String path, JSONObject body, boolean auth) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(BASE + path).openConnection();
        try {
            connection.setRequestMethod(method);
            connection.setConnectTimeout(10000);
            // Workstation writes may wait 10s for the workspace lock and run
            // for up to 30s. A 12s client timeout abandoned valid server work.
            connection.setReadTimeout(path.startsWith("/api/team/workstation") ? (method.equals("GET") ? 25000 : 50000) : path.startsWith("/api/auth/") ? 30000 : path.startsWith("/api/team/chat-") ? (method.equals("GET") ? 20000 : 30000) : 12000);
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("X-HYMN-Client", "android-team");
            if (auth) {
                String cookie = cookie();
                if (cookie.isEmpty()) throw new IllegalStateException("Sign in to your HYMN team account.");
                connection.setRequestProperty("Cookie", cookie);
            }
            if (body != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                connection.setRequestProperty("Origin", BASE);
                try (OutputStream out = connection.getOutputStream()) { out.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
            }
            int status = connection.getResponseCode();
            if ("/api/auth/team-email".equals(path) && status >= 200 && status < 300) {
                for (java.util.Map.Entry<String, java.util.List<String>> entry : connection.getHeaderFields().entrySet()) {
                    if (entry.getKey() == null || !entry.getKey().equalsIgnoreCase("Set-Cookie")) continue;
                    for (String header : entry.getValue()) if (header.startsWith("hymn_session=")) {
                        prefs().edit().putString(KEY_COOKIE, header.split(";", 2)[0]).apply(); break;
                    }
                }
            }
            InputStream stream = status >= 200 && status < 400 ? connection.getInputStream() : connection.getErrorStream();
            StringBuilder response = new StringBuilder();
            if (stream != null) try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line; while ((line = reader.readLine()) != null) response.append(line);
            }
            JSONObject json;
            try { json = new JSONObject(response.toString()); } catch (Exception ignored) { json = new JSONObject(); }
            if (status < 200 || status >= 300) throw new ApiException(status, json.optString("error", "Request failed (" + status + ")."));
            return json;
        } finally {
            connection.disconnect();
        }
    }

    JSONObject get(String resource, String workspace, String extraQuery) throws Exception {
        String query = "workspace=" + enc(workspace) + (extraQuery == null || extraQuery.isEmpty() ? "" : "&" + extraQuery);
        if (resource.equals("workstation") || resource.equals("workstation-activity")) query += "&view=mobile";
        long epoch=cacheEpoch.get();String key=cacheKey(resource,workspace,extraQuery);
        try {JSONObject data=request("GET", "/api/team/" + resource + "?" + query, null, true);remember(key,data,epoch);return data;}
        catch(ApiException error){if(error.status==401||error.status==403)invalidateViews();throw error;}
    }

    JSONObject post(String resource, String workspace, JSONObject body) throws Exception {
        try { JSONObject result=request("POST", "/api/team/" + resource + "?workspace=" + enc(workspace), body, true);
            if(!resource.startsWith("chat-"))invalidateViews(); return result;
        } catch(ApiException error) { if(error.status==401||error.status==403)invalidateViews();throw error; }
    }

    private static String enc(String value) throws Exception { return URLEncoder.encode(value == null ? "" : value, "UTF-8"); }
}
