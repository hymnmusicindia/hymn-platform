package fun.hymnmusic.team;

/** Keep unrelated screens warm, while refreshing every view affected by a write. */
final class TeamCachePolicy {
    static boolean affected(String action,String resource) {
        if(resource==null||resource.isEmpty())return true;
        if(action.startsWith("chat-"))return false;
        if(action.startsWith("notifications"))return resource.equals("notifications")||resource.equals("overview");
        if(action.startsWith("workstation")||action.startsWith("task")||action.startsWith("call-"))return java.util.Arrays.asList("overview","tasks","calendar","workstation","workstation-activity","call-followups","reports","notifications").contains(resource);
        if(action.startsWith("calendar"))return java.util.Arrays.asList("calendar","overview","workstation","tasks","notifications").contains(resource);
        return true;
    }
}
