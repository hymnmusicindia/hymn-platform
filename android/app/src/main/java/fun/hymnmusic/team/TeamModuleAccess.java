package fun.hymnmusic.team;

import org.json.JSONArray;
import org.json.JSONObject;

/** Navigation mirrors server capabilities; APIs remain the authority for every request. */
final class TeamModuleAccess {
    static boolean has(JSONObject session, String permission) {
        if (session == null) return false;
        if (session.optBoolean("owner")) return true;
        JSONArray permissions = session.optJSONArray("permissions");
        if (permissions != null) for (int i = 0; i < permissions.length(); i++) if (permission.equals(permissions.optString(i))) return true;
        return false;
    }
    static boolean visible(JSONObject session, String module) {
        if (session == null) return false;
        switch (module) {
            case "home": case "more": case "workspace-detail": case "tasks": case "projects":
            case "alerts": case "notifications": case "availability": case "team-email-history": return true;
            case "workstation": return has(session,"clients.view");
            case "schedule": return has(session,"calendar.view");
            case "chats": case "channels": return has(session,"chat.use");
            case "reports": return has(session,"reports.team.view");
            case "call-followups": return has(session,"crm.outreach.manage");
            case "members": return has(session,"team.members.view");
            case "coordinator": return has(session,"tasks.create");
            case "creator-applications": return has(session,"operations.producers.approve") || has(session,"operations.engineers.approve");
            case "operations": return has(session,"operations.distribution.review") || has(session,"operations.beats.manage") || has(session,"operations.engineers.manage") || has(session,"operations.studio.review");
            case "acquisition-dashboard": return has(session,"crm.prospects.view");
            case "contacts": return has(session,"clients.view");
            case "emails": return has(session,"crm.outreach.manage") || has(session,"support.reply");
            case "approvals": return has(session,"tasks.approve");
            case "settings": case "leadership": return session.optBoolean("owner");
            case "referral": return !session.optBoolean("owner");
            case "audit": return has(session,"audit.view");
            // Standalone call reports require a contact ID and are opened from contact records.
            default: return false;
        }
    }
}
