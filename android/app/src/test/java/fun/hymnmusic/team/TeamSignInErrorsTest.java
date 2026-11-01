package fun.hymnmusic.team;

import org.junit.Test;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.NoCredentialException;
import static org.junit.Assert.*;

public class TeamSignInErrorsTest {
    @Test public void cancellationIsNeutralAndOffersAnExplicitRetry(){
        Exception cancelled=new GetCredentialCancellationException("Activity is cancelled by the user.");
        assertFalse(TeamSignInErrors.isError(cancelled));
        assertTrue(TeamSignInErrors.message(cancelled).contains("Tap Continue"));
        assertFalse(TeamSignInErrors.message(cancelled).contains("by the user"));
    }
    @Test public void unavailableCredentialDoesNotAssumeAnAccountIsMissing(){
        Exception missing=new NoCredentialException("internal provider diagnostic");
        assertTrue(TeamSignInErrors.isError(missing));
        assertTrue(TeamSignInErrors.message(missing).contains("Google Play services"));
        assertFalse(TeamSignInErrors.message(missing).contains("internal provider"));
    }
    @Test public void providerFailuresDoNotExposeRawDiagnostics(){
        Exception error=new IllegalStateException("sensitive provider diagnostic");
        assertTrue(TeamSignInErrors.isError(error));
        assertFalse(TeamSignInErrors.message(error).contains("sensitive"));
    }
}
