package fun.hymnmusic.team;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class WorkActivityRecoveryTest {
    private JSONObject activity() throws Exception {
        return new JSONObject().put("id", "activity-1").put("notes", "Original notes")
            .put("needs", "Distribution").put("commitments", "Send information")
            .put("nextAction", "Call tomorrow").put("services", new JSONArray().put("DISTRIBUTION"))
            .put("checklist", new JSONArray().put(false).put(false));
    }
    private JSONObject task() throws Exception {
        return new JSONObject().put("version", 1).put("checklist", new JSONArray()
            .put(new JSONObject().put("text", "Introduce HYMN").put("done", false))
            .put(new JSONObject().put("text", "Confirm next step").put("done", false)));
    }

    @Test public void unrelatedTaskUpdateDoesNotBlockPauseOrResume() throws Exception {
        JSONObject base = activity(), original = task(), remote = task().put("version", 42);
        JSONObject local = WorkActivityRecovery.draft(base).put("notes", "Notes written on phone");
        JSONObject result = WorkActivityRecovery.merge(original, base, local, remote, activity().put("status", "PAUSED"));
        assertEquals("Notes written on phone", result.getString("notes"));
        assertEquals("Distribution", result.getString("needs"));
        assertEquals("DISTRIBUTION", result.getJSONArray("services").getString(0));
    }

    @Test public void independentWebAndPhoneEditsAreMerged() throws Exception {
        JSONObject base = activity(), local = WorkActivityRecovery.draft(base).put("notes", "Phone notes");
        JSONObject remote = activity().put("needs", "Web updated needs");
        JSONObject result = WorkActivityRecovery.merge(task(), base, local, task(), remote);
        assertEquals("Phone notes", result.getString("notes"));
        assertEquals("Web updated needs", result.getString("needs"));
    }

    @Test(expected = WorkActivityRecovery.Conflict.class) public void conflictingNotesMustNotBeSilentlyOverwritten() throws Exception {
        JSONObject base = activity();
        WorkActivityRecovery.merge(task(), base, WorkActivityRecovery.draft(base).put("notes", "Phone notes"), task(), activity().put("notes", "Web notes"));
    }

    @Test public void alreadyCommittedDraftCanBeRecognizedAfterTimeout() throws Exception {
        JSONObject base = activity(), local = WorkActivityRecovery.draft(base).put("notes", "Saved notes");
        JSONObject merged = WorkActivityRecovery.merge(task(), base, local, task().put("version", 2), activity().put("notes", "Saved notes"));
        assertTrue(WorkActivityRecovery.equal(local, merged));
    }

    @Test public void independentChecklistEditsAreMerged() throws Exception {
        JSONObject base = activity(), local = WorkActivityRecovery.draft(base).put("checklist", new JSONArray().put(true).put(false));
        JSONObject remote = activity().put("checklist", new JSONArray().put(false).put(true));
        JSONObject merged = WorkActivityRecovery.merge(task(), base, local, task(), remote);
        assertTrue(merged.getJSONArray("checklist").getBoolean(0));
        assertTrue(merged.getJSONArray("checklist").getBoolean(1));
    }

    @Test(expected = WorkActivityRecovery.Conflict.class) public void reorderedChecklistRequiresReview() throws Exception {
        JSONObject original = task(), changed = task();
        JSONArray items = changed.getJSONArray("checklist");
        changed.put("checklist", new JSONArray().put(items.get(1)).put(items.get(0)));
        WorkActivityRecovery.merge(original, activity(), WorkActivityRecovery.draft(activity()), changed, activity());
    }

    @Test(expected = WorkActivityRecovery.Conflict.class) public void replacedActivityCannotReceiveOldDraft() throws Exception {
        WorkActivityRecovery.merge(task(), activity(), WorkActivityRecovery.draft(activity()), task(), activity().put("id", "replacement"));
    }

    @Test public void taskChecklistDoneFlagsDoNotHideActivityDraftChecklist() throws Exception {
        JSONObject changed = task(); changed.getJSONArray("checklist").getJSONObject(0).put("done", true);
        JSONObject local = WorkActivityRecovery.draft(activity()).put("checklist", new JSONArray().put(false).put(true));
        JSONObject merged = WorkActivityRecovery.merge(task(), activity(), local, changed, activity());
        assertFalse(merged.getJSONArray("checklist").getBoolean(0));
        assertTrue(merged.getJSONArray("checklist").getBoolean(1));
    }

    @Test public void pauseTimeoutRequiresServerToActuallyBePaused() throws Exception {
        JSONObject saved = activity().put("status", "RUNNING"), intended = WorkActivityRecovery.draft(saved);
        assertFalse(WorkActivityRecovery.confirmed("workstation-pause", "activity-1", "", intended, saved));
        assertTrue(WorkActivityRecovery.confirmed("workstation-pause", "activity-1", "", intended, saved.put("status", "PAUSED")));
    }

    @Test public void resumeTimeoutRequiresRunningStateAndSavedNotes() throws Exception {
        JSONObject saved = activity().put("status", "RUNNING"), intended = WorkActivityRecovery.draft(saved);
        assertTrue(WorkActivityRecovery.confirmed("workstation-resume", "activity-1", "", intended, saved));
        assertFalse(WorkActivityRecovery.confirmed("workstation-resume", "activity-1", "", intended.put("notes", "Not saved yet"), saved));
    }

    @Test public void finishTimeoutMustMatchRequestedOutcome() throws Exception {
        JSONObject saved = activity().put("status", "FINISHED").put("outcome", "BLOCKED"), intended = WorkActivityRecovery.draft(saved);
        assertFalse(WorkActivityRecovery.confirmed("workstation-finish", "activity-1", "COMPLETED", intended, saved));
        assertTrue(WorkActivityRecovery.confirmed("workstation-finish", "activity-1", "BLOCKED", intended, saved));
    }

    @Test public void timeoutCannotConfirmAReplacementActivity() throws Exception {
        JSONObject saved = activity().put("id", "another-activity").put("status", "RUNNING");
        assertFalse(WorkActivityRecovery.confirmed("workstation-resume", "activity-1", "", WorkActivityRecovery.draft(saved), saved));
    }
}
