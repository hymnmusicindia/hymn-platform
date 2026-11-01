package fun.hymnmusic.team;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Iterator;

/** Three-way draft merge: unrelated task updates must not overwrite activity edits. */
final class WorkActivityRecovery {
    static final String[] FIELDS = {"notes", "needs", "commitments", "nextAction", "services", "checklist"};

    static final class Conflict extends Exception {
        Conflict() { super("This activity was edited elsewhere. Your draft is saved on this phone. Review the latest activity before saving again."); }
    }

    static JSONObject draft(JSONObject activity) throws Exception {
        JSONObject result = new JSONObject();
        for (String field : FIELDS) result.put(field, activity.has(field) ? activity.get(field) :
            field.equals("services") || field.equals("checklist") ? new JSONArray() : "");
        return new JSONObject(result.toString());
    }

    static boolean confirmed(String action, String activityId, String outcome, JSONObject intendedDraft, JSONObject saved) throws Exception {
        if (!activityId.equals(saved.optString("id")) || !equal(intendedDraft, draft(saved))) return false;
        String status = saved.optString("status");
        if (action.equals("workstation-pause")) return status.equals("PAUSED");
        if (action.equals("workstation-resume")) return status.equals("RUNNING");
        if (action.equals("workstation-finish")) return status.equals("FINISHED") && outcome.equals(saved.optString("outcome"));
        return action.equals("workstation-save") && !status.equals("FINISHED");
    }

    static boolean equal(Object left, Object right) throws Exception {
        if (left == right) return true;
        if (left instanceof JSONObject && right instanceof JSONObject) {
            JSONObject a = (JSONObject) left, b = (JSONObject) right;
            if (a.length() != b.length()) return false;
            Iterator<String> keys = a.keys();
            while (keys.hasNext()) { String key = keys.next(); if (!b.has(key) || !equal(a.get(key), b.get(key))) return false; }
            return true;
        }
        if (left instanceof JSONArray && right instanceof JSONArray) {
            JSONArray a = (JSONArray) left, b = (JSONArray) right;
            if (a.length() != b.length()) return false;
            for (int i = 0; i < a.length(); i++) if (!equal(a.get(i), b.get(i))) return false;
            return true;
        }
        return left != null && left.equals(right);
    }

    static JSONObject merge(JSONObject baseTask, JSONObject baseActivity, JSONObject local, JSONObject remoteTask, JSONObject remoteActivity) throws Exception {
        if (!baseActivity.getString("id").equals(remoteActivity.optString("id"))) throw new Conflict();
        // Checklist flags are positional; changed/reordered items require a review.
        if (!equal(checklistLayout(baseTask), checklistLayout(remoteTask))) throw new Conflict();
        JSONObject base = draft(baseActivity), remote = draft(remoteActivity), result = new JSONObject();
        for (String field : FIELDS) {
            Object before = base.get(field), mine = local.get(field), theirs = remote.get(field);
            if (field.equals("checklist") && before instanceof JSONArray && mine instanceof JSONArray && theirs instanceof JSONArray) {
                JSONArray a = (JSONArray) before, b = (JSONArray) mine, c = (JSONArray) theirs, merged = new JSONArray();
                if (a.length() != b.length() || b.length() != c.length()) throw new Conflict();
                for (int i = 0; i < a.length(); i++) merged.put(mergeValue(a.get(i), b.get(i), c.get(i)));
                result.put(field, merged);
            } else result.put(field, mergeValue(before, mine, theirs));
        }
        return result;
    }

    private static Object mergeValue(Object base, Object local, Object remote) throws Exception {
        if (equal(local, base)) return remote;
        if (equal(remote, base) || equal(local, remote)) return local;
        throw new Conflict();
    }

    private static JSONArray checklistLayout(JSONObject task) throws Exception {
        JSONArray source = task.optJSONArray("checklist"), result = new JSONArray();
        if (source != null) for (int i = 0; i < source.length(); i++) {
            JSONObject item = new JSONObject(source.getJSONObject(i).toString());
            item.remove("done"); result.put(item);
        }
        return result;
    }
}
