package fun.hymnmusic.app;

/** Pure policy shared by the foreground and background notification sync. */
final class MusicNotificationPolicy {
    static String sessionCookie(String cookies) {
        if (cookies != null) for (String part : cookies.split(";")) {
            String value = part.trim();
            if (value.startsWith("hymn_session=") && value.length() > 13) return value;
        }
        return "";
    }
    static String channel(String type) {
        if ("release".equals(type)) return "hymn_releases";
        if ("beat".equals(type) || "order".equals(type)) return "hymn_store";
        return "hymn_account";
    }
    static String destination(String href) {
        String url = href != null && href.startsWith("/") && !href.startsWith("//") ? MusicNavigation.ORIGIN + href : href;
        if (!MusicNavigation.internal(url)) return MusicNavigation.ORIGIN + "/dashboard";
        try {
            String path = java.net.URI.create(url).getPath();
            if (path.startsWith("/api/") || path.startsWith("/auth") || url.contains("\\")) return MusicNavigation.ORIGIN + "/dashboard";
        } catch (Exception e) { return MusicNavigation.ORIGIN + "/dashboard"; }
        return url;
    }
}
