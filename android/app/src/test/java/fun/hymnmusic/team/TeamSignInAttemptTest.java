package fun.hymnmusic.team;

import org.junit.Test;
import static org.junit.Assert.*;

public class TeamSignInAttemptTest {
    @Test public void duplicateTapsCannotStartAnotherProviderRequest(){TeamSignInAttempt state=new TeamSignInAttempt();int first=state.begin();assertTrue(first>0);assertEquals(-1,state.begin());assertTrue(state.current(first));}
    @Test public void cancelledCallbackCannotFinishANewerAttempt(){TeamSignInAttempt state=new TeamSignInAttempt();int old=state.begin();state.finish();int next=state.begin();assertFalse(state.current(old));assertFalse(state.advance(old,TeamSignInAttempt.Phase.WORKSPACE));assertTrue(state.waitingForGoogle(next));}
    @Test public void googleDeadlineDoesNotCancelTheServerExchange(){TeamSignInAttempt state=new TeamSignInAttempt();int id=state.begin();assertTrue(state.waitingForGoogle(id));assertTrue(state.advance(id,TeamSignInAttempt.Phase.TOKEN_EXCHANGE));assertFalse(state.waitingForGoogle(id));assertTrue(state.current(id));}
    @Test public void duplicateResultsCannotMoveTheStageBackwards(){TeamSignInAttempt state=new TeamSignInAttempt();int id=state.begin();assertTrue(state.advance(id,TeamSignInAttempt.Phase.TOKEN_EXCHANGE));assertFalse(state.advance(id,TeamSignInAttempt.Phase.TOKEN_EXCHANGE));assertTrue(state.advance(id,TeamSignInAttempt.Phase.WORKSPACE));assertFalse(state.advance(id,TeamSignInAttempt.Phase.GOOGLE));}
    @Test public void finishingDoesNotAutomaticallyRetry(){TeamSignInAttempt state=new TeamSignInAttempt();int id=state.begin();state.finish();assertEquals(TeamSignInAttempt.Phase.IDLE,state.phase());assertFalse(state.current(id));assertFalse(state.waitingForGoogle(id));}
}
