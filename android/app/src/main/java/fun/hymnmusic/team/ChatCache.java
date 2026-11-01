package fun.hymnmusic.team;

import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Encrypted, bounded message downloads. Drafts and server records are separate. */
final class ChatCache {
    static final long LIMIT_BYTES = 20_000_000;
    static final int MAX_MESSAGES = 200;
    private static final int MAX_FILE_BYTES = 1_500_000;
    private final File directory;
    private final String scope;
    private final SecretKey key;
    private final long limit;
    private final int maxChats;
    private volatile long epoch;

    ChatCache(File root, String workspace, String member, SecretKey key) throws Exception { this(root, workspace, member, key, LIMIT_BYTES, 100); }
    ChatCache(File root, String workspace, String member, SecretKey key, long limit, int maxChats) throws Exception {
        scope = workspace + ":" + member; this.key = key; this.limit = limit; this.maxChats = maxChats;
        directory = new File(root, hash(scope));
    }
    private static String hash(String text) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)); StringBuilder result = new StringBuilder();
        for (byte b : digest) result.append(String.format(Locale.ROOT, "%02x", b & 255)); return result.toString();
    }
    private File file(String id) throws Exception { return new File(directory, hash(id) + ".bin"); }
    private File[] files() { File[] found = directory.listFiles(f -> f.isFile() && f.getName().matches("[0-9a-f]{64}\\.bin")); return found == null ? new File[0] : found; }
    private File[] downloads() { File[] found = directory.listFiles(f -> f.isFile() && (f.getName().matches("[0-9a-f]{64}\\.bin") || f.getName().startsWith(".download-") && f.getName().endsWith(".tmp"))); return found == null ? new File[0] : found; }
    long epoch() { return epoch; }
    synchronized long bytes() { long size = 0; for (File f : downloads()) size += f.length(); return size; }
    synchronized int count() { return files().length; }

    synchronized JSONObject read(String id) throws Exception {
        File f = file(id); if (!f.isFile()) return null;
        try {
            if (f.length() < 29 || f.length() > MAX_FILE_BYTES + 64) throw new IOException("Invalid cache size");
            byte[] data = Files.readAllBytes(f.toPath());
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, Arrays.copyOfRange(data, 0, 12)));
            cipher.updateAAD((scope + ":" + id).getBytes(StandardCharsets.UTF_8));
            JSONObject result = new JSONObject(new String(cipher.doFinal(data, 12, data.length - 12), StandardCharsets.UTF_8));
            if (result.optInt("version") != 1) throw new IOException("Unsupported cache version");
            f.setLastModified(System.currentTimeMillis()); return result;
        } catch (Exception invalid) { f.delete(); return null; }
    }

    synchronized boolean put(String id, JSONObject snapshot, long expectedEpoch) throws Exception {
        if (expectedEpoch != epoch) return false;
        byte[] plain = snapshot.toString().getBytes(StandardCharsets.UTF_8); if (plain.length > MAX_FILE_BYTES) return false;
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Chat storage unavailable");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key);
        cipher.updateAAD((scope + ":" + id).getBytes(StandardCharsets.UTF_8)); byte[] encrypted = cipher.doFinal(plain);
        Path temporary = Files.createTempFile(directory.toPath(), ".download-", ".tmp");
        try {
            try (OutputStream out = Files.newOutputStream(temporary)) { out.write(cipher.getIV()); out.write(encrypted); }
            try { Files.move(temporary, file(id).toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
            catch (AtomicMoveNotSupportedException ignored) { Files.move(temporary, file(id).toPath(), StandardCopyOption.REPLACE_EXISTING); }
        } finally { Files.deleteIfExists(temporary); }
        File[] stored = downloads(); Arrays.sort(stored, Comparator.comparingLong(File::lastModified)); long size = bytes(); int count = files().length;
        for (File f : stored) { if (size <= limit && count <= maxChats) break; long length = f.length(); if (f.delete()) { size -= length; if (f.getName().endsWith(".bin")) count--; } }
        return true;
    }
    synchronized void clear(String id) throws Exception { epoch++; File f = file(id); if (f.exists() && !f.delete()) throw new IOException("Couldn't clear downloaded chat"); }
    synchronized void clearAll() throws IOException { epoch++; for (File f : downloads()) if (!f.delete()) throw new IOException("Some downloaded chats couldn't be cleared"); }

    static JSONObject snapshot(JSONObject channel, Collection<JSONObject> messages, Collection<JSONObject> people, boolean historyEnd) throws Exception {
        ArrayList<JSONObject> confirmed = new ArrayList<>();
        for (JSONObject message : messages) if (!message.has("_state") && !message.optString("id").isEmpty()) confirmed.add(message);
        confirmed.sort(Comparator.comparing((JSONObject m) -> m.optString("createdAt")).thenComparing(m -> m.optString("id")));
        boolean truncated = confirmed.size() > MAX_MESSAGES;
        if (truncated) confirmed = new ArrayList<>(confirmed.subList(confirmed.size() - MAX_MESSAGES, confirmed.size()));
        int bytes = 0, first = confirmed.size();
        for (int i = confirmed.size() - 1; i >= 0; i--) { int size = confirmed.get(i).toString().getBytes(StandardCharsets.UTF_8).length; if (bytes + size > 1_200_000) break; bytes += size; first = i; }
        if (first > 0) { truncated = true; confirmed = new ArrayList<>(confirmed.subList(first, confirmed.size())); }
        Set<String> needed = new HashSet<>(); JSONArray items = new JSONArray(), readers = new JSONArray();
        for (JSONObject m : confirmed) { items.put(m); needed.add(m.optString("authorId")); JSONArray ids = m.optJSONArray("readMemberIds"); if (ids != null) for (int i = 0; i < ids.length(); i++) needed.add(ids.optString(i)); }
        for (JSONObject p : people) if (needed.contains(p.optString("id"))) readers.put(p);
        return new JSONObject(new JSONObject().put("version", 1).put("channel", channel).put("items", items).put("readers", readers).put("historyEnd", historyEnd && !truncated).toString());
    }
    static boolean pruneMissing(Map<String, JSONObject> messages, JSONArray latest) {
        Set<String> ids = new HashSet<>(); String earliest = null;
        for (int i = 0; i < latest.length(); i++) { JSONObject m = latest.optJSONObject(i); if (m == null) continue; ids.add(m.optString("id")); String order = m.optString("createdAt") + ":" + m.optString("id"); if (earliest == null || order.compareTo(earliest) < 0) earliest = order; }
        boolean changed = false;
        Iterator<Map.Entry<String, JSONObject>> iterator = messages.entrySet().iterator();
        while (iterator.hasNext()) { Map.Entry<String, JSONObject> entry = iterator.next(); JSONObject m = entry.getValue();
            if (m.has("_state") || ids.contains(entry.getKey())) continue;
            String order = m.optString("createdAt") + ":" + m.optString("id");
            if (latest.length() < 50 || earliest != null && order.compareTo(earliest) >= 0) { iterator.remove(); changed = true; }
        }
        return changed;
    }
}
