package fun.hymnmusic.team;

import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.NoCredentialException;

/** Provider diagnostics stay in logs; the entry screen gives actionable guidance. */
final class TeamSignInErrors {
    static boolean isError(Exception error){return !(error instanceof GetCredentialCancellationException);}
    static String message(Exception error){
        if(error instanceof GetCredentialCancellationException)return "Google did not complete sign-in. Tap Continue to retry, or open Team OS in the browser.";
        if(error instanceof NoCredentialException)return "Google could not provide a sign-in credential. Check Google Play services, or open Team OS in the browser.";
        return "Google couldn't complete sign-in. Check your connection and Google Play services, then try again.";
    }
}
