package fun.hymnmusic.team;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.util.LruCache;
import android.widget.ImageView;
import java.io.*;
import java.lang.ref.WeakReference;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;

/** Shared, bounded photo cache. Photos never compete with team API requests. */
final class AvatarRepository {
    private final Activity activity;
    private final TeamApi api;
    private final File directory;
    private final ExecutorService workers = Executors.newFixedThreadPool(3);
    private final ConcurrentHashMap<String, ConcurrentLinkedQueue<WeakReference<ImageView>>> pending = new ConcurrentHashMap<>();
    private final LruCache<String, Bitmap> memory = new LruCache<String, Bitmap>(4096) {
        @Override protected int sizeOf(String key, Bitmap value) { return Math.max(1, value.getByteCount() / 1024); }
    };
    private volatile boolean closed;
    private final Object diskLock = new Object();
    private long epoch;
    AvatarRepository(Activity activity, TeamApi api) { this.activity = activity; this.api = api; directory = new File(activity.getCacheDir(), "team-avatars"); }

    void load(ImageView target, String source) {
        if (closed || source == null || source.isEmpty() || source.equals("null")) return;
        Bitmap cached = memory.get(source); if (cached != null) { target.setImageBitmap(cached); return; }
        ConcurrentLinkedQueue<WeakReference<ImageView>> queue = new ConcurrentLinkedQueue<>(); queue.add(new WeakReference<>(target));
        ConcurrentLinkedQueue<WeakReference<ImageView>> existing = pending.putIfAbsent(source, queue);
        if (existing != null) { existing.add(new WeakReference<>(target)); return; }
        final long token; synchronized (diskLock) { token = epoch; }
        workers.execute(() -> {
            Bitmap picture = null; HttpURLConnection connection = null;
            try {
                String key = Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(source.getBytes(StandardCharsets.UTF_8)), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
                File file = new File(directory, key + ".png");
                if (file.isFile() && System.currentTimeMillis() - file.lastModified() < TimeUnit.DAYS.toMillis(7)) picture = BitmapFactory.decodeFile(file.getAbsolutePath());
                if (picture == null) {
                    URL url = new URL(source.startsWith("/") ? TeamApi.BASE + source : source);
                    String host = url.getHost().toLowerCase(Locale.ROOT); boolean hymn = host.equals("hymnmusic.fun") || host.equals("www.hymnmusic.fun");
                    if (!url.getProtocol().equals("https") || !(hymn || host.equals("googleusercontent.com") || host.endsWith(".googleusercontent.com"))) return;
                    connection = (HttpURLConnection)url.openConnection(); connection.setConnectTimeout(5000); connection.setReadTimeout(6000); connection.setInstanceFollowRedirects(!hymn); connection.setUseCaches(true);
                    if (hymn) connection.setRequestProperty("Cookie", api.cookie());
                    if (connection.getResponseCode() != 200 || connection.getContentLengthLong() > 2_000_000) return;
                    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                    try (InputStream in = connection.getInputStream()) { byte[] buffer = new byte[8192]; int n; while ((n = in.read(buffer)) != -1) { if (bytes.size() + n > 2_000_000) return; bytes.write(buffer, 0, n); } }
                    byte[] data = bytes.toByteArray(); BitmapFactory.Options options = new BitmapFactory.Options(); options.inJustDecodeBounds = true; BitmapFactory.decodeByteArray(data, 0, data.length, options);
                    if (options.outWidth <= 0 || options.outHeight <= 0) return;
                    options.inSampleSize = 1; while (Math.max(options.outWidth, options.outHeight) / options.inSampleSize > 256) options.inSampleSize *= 2;
                    options.inJustDecodeBounds = false; picture = BitmapFactory.decodeByteArray(data, 0, data.length, options);
                    if (picture != null) { synchronized (diskLock) { if (token == epoch && !closed) try { directory.mkdirs(); try (OutputStream out = new FileOutputStream(file)) { picture.compress(Bitmap.CompressFormat.PNG, 100, out); } trim(); } catch (IOException ignored) { } } }
                }
                if (picture != null) { synchronized (diskLock) { if (token != epoch || closed) return; memory.put(source, picture); } final Bitmap ready = picture; activity.runOnUiThread(() -> {
                    synchronized (diskLock) { if (closed || activity.isFinishing() || token != epoch) return; }
                    for (WeakReference<ImageView> reference : queue) { ImageView image = reference.get(); if (image != null) image.setImageBitmap(ready); }
                }); }
            } catch (Exception ignored) { /* Initials remain visible when a photo is unavailable. */ }
            finally { if (connection != null) connection.disconnect(); pending.remove(source, queue); }
        });
    }
    private void trim() {
        File[] files = directory.listFiles(); if (files == null) return;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified)); long size = 0; for (File f : files) size += f.length();
        for (File f : files) { if (size <= 8_000_000) break; long length = f.length(); if (f.delete()) size -= length; }
    }
    void close() { closed = true; workers.shutdownNow(); pending.clear(); }
    long cachedBytes() { synchronized (diskLock) { File[] files = directory.listFiles(); long size = 0; if (files != null) for (File f : files) if (f.isFile()) size += f.length(); return size; } }
    void clearCache() throws IOException { synchronized (diskLock) { epoch++; memory.evictAll(); pending.clear(); File[] files = directory.listFiles(); if (files != null) for (File f : files) if (f.isFile() && !f.delete()) throw new IOException("Some downloaded photos couldn't be cleared"); } }
}
