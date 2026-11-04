package fun.hymnmusic.app;

import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import androidx.credentials.*;
import androidx.credentials.exceptions.*;
import com.google.android.libraries.identity.googleid.*;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.common.ConnectionResult;

/** Explicit native Google account selection; ID tokens are verified by HYMN's server. */
final class NativeGoogleSignIn {
    final MusicActivity a;
    CancellationSignal cancellation;
    final Handler handler = new Handler(Looper.getMainLooper());
    Runnable deadline;
    NativeGoogleSignIn(MusicActivity activity) { a = activity; }

    void start() {
        if (a.authBusy) return;
        int availability = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(a);
        if (availability != ConnectionResult.SUCCESS) {
            a.error("Google sign-in needs up-to-date Google Play services on this device. You can also continue with an email code.");
            return;
        }
        a.authBusy = true;
        cancellation = new CancellationSignal();
        final int screen = a.epoch;
        GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(a.getString(R.string.google_web_client_id)).build();
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
        deadline = () -> {
            if (cancellation != null) cancellation.cancel();
            a.authBusy = false;
            if (a.epoch == screen && !a.isFinishing()) {
                a.signIn();
                a.error("Google did not finish. Please try again or continue with your email code.");
            }
        };
        handler.postDelayed(deadline, 60000);
        CredentialManager.create(a).getCredentialAsync(a, request, cancellation, androidx.core.content.ContextCompat.getMainExecutor(a),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override public void onResult(GetCredentialResponse result) {
                    clearDeadline();
                    if (a.isFinishing() || a.epoch != screen) { a.authBusy = false; return; }
                    try {
                        Credential credential = result.getCredential();
                        if (!(credential instanceof CustomCredential)) throw new IllegalArgumentException();
                        GoogleIdTokenCredential google = GoogleIdTokenCredential.createFrom(((CustomCredential) credential).getData());
                        a.authLoading("Signing you in with Google…");
                        a.post("/api/auth/google", a.json("credential", google.getIdToken()), data -> {
                            a.authBusy = false;
                            a.challenge = "";
                            a.restore();
                        });
                    } catch (Exception invalid) {
                        a.authBusy = false;
                        a.signIn();
                        a.error("Google could not verify this account. Try again or use an email code.");
                    }
                }
                @Override public void onError(GetCredentialException error) {
                    clearDeadline();
                    a.authBusy = false;
                    if (a.isFinishing() || a.epoch != screen) return;
                    if (error instanceof GetCredentialCancellationException) {
                        a.notice("Google sign-in closed. Choose a sign-in method when you are ready.");
                    } else if (error instanceof NoCredentialException) {
                        a.error("No Google account is available. Add one in your device settings, or use an email code.");
                    } else {
                        a.error("Google sign-in could not finish on this device. Update Google Play services and try again, or use an email code.");
                    }
                }
            });
    }
    void clearDeadline() { if (deadline != null) handler.removeCallbacks(deadline); deadline = null; }
    void close() { clearDeadline(); if (cancellation != null) cancellation.cancel(); }
}
