package fun.hymnmusic.app;
import org.junit.Test;
import static org.junit.Assert.*;
public class MusicNavigationTest {
 @Test public void credentialsOnlyReachExactHttpsOrigin(){assertTrue(MusicNavigation.internal("https://hymnmusic.fun/api/auth/email"));assertTrue(MusicNavigation.internal("https://hymnmusic.fun:443/api/assets/12/download"));for(String url:new String[]{"http://hymnmusic.fun/","https://hymnmusic.fun.evil.test/","https://evil.test@hymnmusic.fun/","https://hymnmusic.fun:444/","javascript:alert(1)","file:///etc/passwd","https://hymnmusic.fun@evil.test/"})assertFalse(url,MusicNavigation.internal(url));}
 @Test public void onlySupportedExternalSchemes(){assertTrue(MusicNavigation.externalScheme("upi"));assertTrue(MusicNavigation.externalScheme("https"));assertFalse(MusicNavigation.externalScheme("javascript"));assertFalse(MusicNavigation.externalScheme("file"));}
}
