package fun.hymnmusic.team;

import org.json.*;
import org.junit.*;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import static org.junit.Assert.*;

public class ChatCacheTest {
    private Path root;
    private SecretKey key;
    private ChatCache cache;
    @Before public void setup() throws Exception { root = Files.createTempDirectory("hymn-chat-test-"); KeyGenerator generator = KeyGenerator.getInstance("AES"); generator.init(256); key = generator.generateKey(); cache = new ChatCache(root.toFile(), "workspace", "member", key); }
    @After public void cleanup() throws Exception { try (java.util.stream.Stream<Path> paths = Files.walk(root)) { paths.sorted(Comparator.reverseOrder()).forEach(path -> path.toFile().delete()); } }
    private JSONObject message(String id, int seconds) throws Exception { return new JSONObject().put("id", id).put("authorId", "author").put("createdAt", java.time.Instant.ofEpochSecond(seconds).toString()).put("body", "Sensitive team note").put("readMemberIds", new JSONArray().put("reader")); }
    private JSONObject snapshot(String id) throws Exception { return ChatCache.snapshot(new JSONObject().put("id", id), Collections.singletonList(message("message", 100)), Collections.emptyList(), true); }
    private Path storedFile() throws Exception { try (java.util.stream.Stream<Path> files = Files.walk(root)) { return files.filter(p -> p.toString().endsWith(".bin")).findFirst().get(); } }

    @Test public void encryptedCacheSurvivesReopening() throws Exception {
        cache.put("chat", snapshot("chat"), cache.epoch());
        ChatCache reopened = new ChatCache(root.toFile(), "workspace", "member", key);
        assertEquals("Sensitive team note", reopened.read("chat").getJSONArray("items").getJSONObject(0).getString("body"));
        assertFalse(new String(Files.readAllBytes(storedFile()), StandardCharsets.ISO_8859_1).contains("Sensitive team note"));
        assertTrue(cache.bytes() > 0);
    }
    @Test public void accountsAndWorkspacesHaveSeparateDownloads() throws Exception {
        cache.put("chat", snapshot("chat"), cache.epoch());
        assertNull(new ChatCache(root.toFile(), "workspace", "another-member", key).read("chat"));
        assertNull(new ChatCache(root.toFile(), "another-workspace", "member", key).read("chat"));
        assertNotNull(cache.read("chat"));
    }
    @Test public void newerSnapshotsReplaceOldDownloadsWithoutExtraFiles() throws Exception {
        cache.put("chat", snapshot("chat"), cache.epoch()); JSONObject updated = snapshot("chat"); updated.getJSONArray("items").getJSONObject(0).put("body", "Updated on server");
        cache.put("chat", updated, cache.epoch()); assertEquals(1, cache.count());
        assertEquals("Updated on server", cache.read("chat").getJSONArray("items").getJSONObject(0).getString("body"));
    }
    @Test public void clearingOneChatPreservesOtherChatsAndDraftFiles() throws Exception {
        Files.write(root.resolve("unsent-drafts.json"), "keep draft".getBytes(StandardCharsets.UTF_8));
        cache.put("one", snapshot("one"), cache.epoch()); cache.put("two", snapshot("two"), cache.epoch());
        long before = cache.bytes(); cache.clear("one");
        assertNull(cache.read("one")); assertNotNull(cache.read("two")); assertTrue(cache.bytes() < before);
        assertTrue(Files.exists(root.resolve("unsent-drafts.json")));
    }
    @Test public void clearAllPreventsAlreadyQueuedWritesFromRefillingStorage() throws Exception {
        long oldEpoch = cache.epoch(); cache.put("one", snapshot("one"), oldEpoch); cache.clearAll();
        assertFalse(cache.put("late-write", snapshot("late-write"), oldEpoch));
        assertEquals(0, cache.bytes()); assertEquals(0, cache.count());
        assertTrue(cache.put("explicitly-reopened", snapshot("explicitly-reopened"), cache.epoch()));
    }
    @Test public void interruptedDownloadsAreIncludedInUsageAndCleared() throws Exception {
        cache.put("chat", snapshot("chat"), cache.epoch()); Path folder = storedFile().getParent();
        Path interrupted = folder.resolve(".download-interrupted.tmp"), unrelated = folder.resolve("keep.json");
        long before = cache.bytes(); Files.write(interrupted, new byte[2048]); Files.write(unrelated, new byte[123]);
        assertEquals(before + 2048, cache.bytes()); cache.clearAll(); assertFalse(Files.exists(interrupted)); assertTrue(Files.exists(unrelated)); assertEquals(0, cache.bytes());
    }
    @Test public void downloadCountIsBounded() throws Exception {
        ChatCache small = new ChatCache(root.toFile(), "workspace", "member", key, 100000, 2);
        for (int i = 0; i < 4; i++) { small.put("chat-" + i, snapshot("chat-" + i), small.epoch()); Thread.sleep(5); }
        assertEquals(2, small.count()); assertNotNull(small.read("chat-3"));
    }
    @Test public void totalDiskUsageIsBounded() throws Exception {
        ChatCache small = new ChatCache(root.toFile(), "workspace", "member", key, 800, 100);
        for (int i = 0; i < 8; i++) { small.put("chat-" + i, snapshot("chat-" + i), small.epoch()); Thread.sleep(5); }
        assertTrue(small.bytes() <= 800); assertTrue(small.count() < 8); assertNotNull(small.read("chat-7"));
    }
    @Test public void corruptDownloadsFallBackToServerSync() throws Exception {
        cache.put("chat", snapshot("chat"), cache.epoch()); byte[] data = Files.readAllBytes(storedFile()); data[data.length - 1] ^= 1; Files.write(storedFile(), data);
        assertNull(cache.read("chat")); assertEquals(0, cache.count());
    }
    @Test public void onlyRecentConfirmedMessagesAndRelevantReadersAreSaved() throws Exception {
        ArrayList<JSONObject> rows = new ArrayList<>(); for (int i = 0; i < 250; i++) rows.add(message("m-" + i, i));
        rows.add(message("pending", 999).put("_state", "failed"));
        JSONObject saved = ChatCache.snapshot(new JSONObject().put("id", "chat"), rows, Arrays.asList(new JSONObject().put("id", "reader"), new JSONObject().put("id", "unrelated")), true);
        assertEquals(200, saved.getJSONArray("items").length()); assertEquals("m-50", saved.getJSONArray("items").getJSONObject(0).getString("id"));
        assertFalse(saved.getBoolean("historyEnd")); assertEquals(1, saved.getJSONArray("readers").length());
        rows.get(249).put("body", "Changed after snapshot"); assertEquals("Sensitive team note", saved.getJSONArray("items").getJSONObject(199).getString("body"));
    }
    @Test public void deletedMessagesDisappearAfterCompleteServerRefreshButDraftsStay() throws Exception {
        Map<String, JSONObject> rows = new HashMap<>(); rows.put("deleted", message("deleted", 10)); rows.put("pending", message("pending", 20).put("_state", "sending"));
        assertTrue(ChatCache.pruneMissing(rows, new JSONArray())); assertFalse(rows.containsKey("deleted")); assertTrue(rows.containsKey("pending"));
    }
    @Test public void latestPageDoesNotDiscardOlderOfflineHistory() throws Exception {
        Map<String, JSONObject> rows = new HashMap<>(); rows.put("older", message("older", 1)); rows.put("deleted-new", message("deleted-new", 110));
        JSONArray fresh = new JSONArray(); for (int i = 50; i < 100; i++) fresh.put(message("m-" + i, i));
        assertTrue(ChatCache.pruneMissing(rows, fresh)); assertTrue(rows.containsKey("older")); assertFalse(rows.containsKey("deleted-new"));
    }
    @Test public void largeUnicodeMessagesTrimOldestDownloadsToFit() throws Exception {
        ArrayList<JSONObject> rows = new ArrayList<>(); String text = String.join("", Collections.nCopies(4000, "界"));
        for (int i = 0; i < 200; i++) rows.add(message("m-" + i, i).put("body", text));
        JSONObject saved = ChatCache.snapshot(new JSONObject().put("id", "chat"), rows, Collections.emptyList(), true);
        assertTrue(saved.getJSONArray("items").length() < 200); assertFalse(saved.getBoolean("historyEnd"));
        assertTrue(cache.put("chat", saved, cache.epoch())); assertNotNull(cache.read("chat"));
    }
}
