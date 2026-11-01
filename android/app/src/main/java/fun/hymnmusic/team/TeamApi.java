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
    private final Context context;
    private android.content.SharedPreferences securePrefs;

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

    void clear() { try { prefs().edit().remove(KEY_COOKIE).apply(); } catch (Exception ignored) { } }
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
    String lastNotificationId() { try { return prefs().getString("last_notification_id", ""); } catch (Exception ignored) { return ""; } }
    void setLastNotificationId(String id) { try { prefs().edit().putString("last_notification_id", id).apply(); } catch (Exception ignored) { } }

    JSONObject request(String method, String path, JSONObject body, boolean auth) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(BASE + path).openConnection();
        try {
            connection.setRequestMethod(method);
            connection.setConnectTimeout(10000);
            // Workstation writes may wait 10s for the workspace lock and run
            // for up to 30s. A 12s client timeout abandoned valid server work.
            connection.setReadTimeout(path.startsWith("/api/team/workstation") ? (method.equals("GET") ? 25000 : 50000) : 12000);
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
            if ("/api/auth/google".equals(path) && status >= 200 && status < 300) {
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
        return request("GET", "/api/team/" + resource + "?" + query, null, true);
    }

    JSONObject post(String resource, String workspace, JSONObject body) throws Exception {
        return request("POST", "/api/team/" + resource + "?workspace=" + enc(workspace), body, true);
    }

    private static String enc(String value) throws Exception { return URLEncoder.encode(value == null ? "" : value, "UTF-8"); }
}
