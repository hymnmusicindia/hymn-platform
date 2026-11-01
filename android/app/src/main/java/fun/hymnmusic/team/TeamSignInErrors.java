package fun.hymnmusic.team;

import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.NoCredentialException;

/** Provider diagnostics stay in logs; the entry screen gives actionable guidance. */
final class TeamSignInErrors {
    static boolean isError(Exception error){return !(error instanceof GetCredentialCancellationException);}
    static String message(Exception error){
        if(error instanceof GetCredentialCancellationException)return "Sign-in wasn't completed. Tap Continue with Google when you're ready.";
        if(error instanceof NoCredentialException)return "Add your team Google account in Android Settings, then try again. Make sure Google Play services is enabled.";
        return "Google couldn't complete sign-in. Check your connection and Google Play services, then try again.";
    }
}
