package fun.hymnmusic.team;

import org.junit.Test;
import static org.junit.Assert.*;

public class TeamSignInAttemptTest {
    @Test public void duplicateTapsCannotStartAnotherRequest(){TeamSignInAttempt state=new TeamSignInAttempt();int first=state.begin();assertTrue(first>0);assertEquals(-1,state.begin());assertTrue(state.current(first));}
    @Test public void cancelledCallbackCannotFinishANewerAttempt(){TeamSignInAttempt state=new TeamSignInAttempt();int old=state.begin();state.finish();int next=state.begin();assertFalse(state.current(old));assertFalse(state.advance(old,TeamSignInAttempt.Phase.WORKSPACE));assertTrue(state.waitingToStart(next));}
    @Test public void startingPhaseEndsWhenServerExchangeBegins(){TeamSignInAttempt state=new TeamSignInAttempt();int id=state.begin();assertTrue(state.waitingToStart(id));assertTrue(state.advance(id,TeamSignInAttempt.Phase.TOKEN_EXCHANGE));assertFalse(state.waitingToStart(id));assertTrue(state.current(id));}
    @Test public void duplicateResultsCannotMoveTheStageBackwards(){TeamSignInAttempt state=new TeamSignInAttempt();int id=state.begin();assertTrue(state.advance(id,TeamSignInAttempt.Phase.TOKEN_EXCHANGE));assertFalse(state.advance(id,TeamSignInAttempt.Phase.TOKEN_EXCHANGE));assertTrue(state.advance(id,TeamSignInAttempt.Phase.WORKSPACE));assertFalse(state.advance(id,TeamSignInAttempt.Phase.READY));}
    @Test public void finishingDoesNotAutomaticallyRetry(){TeamSignInAttempt state=new TeamSignInAttempt();int id=state.begin();state.finish();assertEquals(TeamSignInAttempt.Phase.IDLE,state.phase());assertFalse(state.current(id));assertFalse(state.waitingToStart(id));}
}
