package fun.hymnmusic.team;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class TeamModuleAccessTest {
    private JSONObject member(String... permissions) throws Exception {
        return new JSONObject().put("permissions",new JSONArray(permissions));
    }
    @Test public void basicMemberSeesOnlyMembershipModules() throws Exception {
        JSONObject session=member();
        assertTrue(TeamModuleAccess.visible(session,"tasks"));
        for(String module:new String[]{"call-followups","members","audit","reports","operations","chats","schedule","workstation"})
            assertFalse(module,TeamModuleAccess.visible(session,module));
    }
    @Test public void outreachPermissionDoesNotGrantOtherTools() throws Exception {
        JSONObject session=member("crm.outreach.manage","calendar.view","chat.use","tasks.complete","clients.view");
        for(String module:new String[]{"call-followups","schedule","chats","workstation"})assertTrue(module,TeamModuleAccess.visible(session,module));
        assertFalse(TeamModuleAccess.visible(session,"audit"));
        assertFalse(TeamModuleAccess.visible(session,"members"));
    }
    @Test public void operationsAndReviewPermissionsAreIndependent() throws Exception {
        assertTrue(TeamModuleAccess.visible(member("operations.studio.review"),"operations"));
        assertFalse(TeamModuleAccess.visible(member("operations.studio.review"),"creator-applications"));
        assertTrue(TeamModuleAccess.visible(member("operations.producers.approve"),"creator-applications"));
    }
    @Test public void ownerAndUnknownRoutesFailClosedCorrectly() throws Exception {
        JSONObject owner=member().put("owner",true);
        assertTrue(TeamModuleAccess.visible(owner,"audit"));
        assertFalse(TeamModuleAccess.visible(owner,"unknown-module"));
        assertFalse(TeamModuleAccess.visible(owner,"call-reports"));
        assertFalse(TeamModuleAccess.visible(null,"home"));
    }
    @Test public void fullToolsKeepIndependentAuthorization() throws Exception {
        assertTrue(TeamModuleAccess.visible(member("clients.view"),"contacts"));
        assertFalse(TeamModuleAccess.visible(member("clients.view"),"settings"));
        assertFalse(TeamModuleAccess.visible(member("clients.view"),"approvals"));
        assertTrue(TeamModuleAccess.visible(member("tasks.approve"),"approvals"));
        assertTrue(TeamModuleAccess.visible(member("crm.outreach.manage"),"emails"));
    }
}
