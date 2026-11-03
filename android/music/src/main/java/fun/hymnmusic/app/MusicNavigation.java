package fun.hymnmusic.app;
import java.net.URI;
import java.util.Locale;

final class MusicNavigation {
    static final String ORIGIN = "https://hymnmusic.fun";
    static boolean internal(String url) {
        try { URI u = URI.create(url); return "https".equalsIgnoreCase(u.getScheme()) && "hymnmusic.fun".equalsIgnoreCase(u.getHost()) && (u.getPort() == -1 || u.getPort() == 443) && u.getUserInfo() == null; }
        catch (Exception e) { return false; }
    }
    static boolean externalScheme(String scheme) {
        return scheme != null && java.util.Arrays.asList("https", "mailto", "tel", "upi", "intent", "tez", "phonepe", "paytmmp", "gpay").contains(scheme.toLowerCase(Locale.ROOT));
    }
    static String initial(String url) { return internal(url) ? url : ORIGIN + "/"; }
}
