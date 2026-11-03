package fun.hymnmusic.team;
import org.junit.Test;
import static org.junit.Assert.*;
public class TeamWorkspaceOriginTest {
    @Test public void onlyExactHttpsOriginCanReceiveTheTeamSession(){
        assertTrue(TeamWorkspaceActivity.trusted("https://hymnmusic.fun/team?module=contacts"));
        for(String url:new String[]{"http://hymnmusic.fun/team","https://hymnmusic.fun.evil.test/team","https://evil.test/?hymnmusic.fun","https://user@hymnmusic.fun/team","https://hymnmusic.fun:8443/team","javascript:alert(1)","file:///secret","https://hymnmusic.fun@evil.test/team"})assertFalse(url,TeamWorkspaceActivity.trusted(url));
    }
}
