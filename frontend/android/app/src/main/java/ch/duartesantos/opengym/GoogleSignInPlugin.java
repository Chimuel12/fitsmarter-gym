package ch.duartesantos.opengym;

import android.os.CancellationSignal;
import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

/**
 * FitSmarter: "Continue with Google" in the Android app. Google refuses its sign-in page inside a
 * WebView, so the phone's own account picker (Credential Manager) signs in and hands the page a
 * Google ID token, which src/fitsmarter/compete.js passes to Firebase (signInWithCredential).
 *
 * Usage from JS:
 *   const G = registerPlugin('GoogleSignIn');
 *   const { idToken } = await G.signIn({ clientId: '<web client id>' }); // rejects 'cancelled' or 'failed'
 */
@CapacitorPlugin(name = "GoogleSignIn")
public class GoogleSignInPlugin extends Plugin {

    @PluginMethod
    public void signIn(PluginCall call) {
        String clientId = call.getString("clientId");
        if (clientId == null || clientId.isEmpty()) { call.reject("clientId missing", "failed"); return; }
        GetCredentialRequest request = new GetCredentialRequest.Builder()
            .addCredentialOption(new GetSignInWithGoogleOption.Builder(clientId).build())
            .build();
        CredentialManager.create(getContext()).getCredentialAsync(getActivity(), request, new CancellationSignal(),
            ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse result) {
                    Credential c = result.getCredential();
                    if (c instanceof CustomCredential && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(c.getType())) {
                        try {
                            GoogleIdTokenCredential g = GoogleIdTokenCredential.createFrom(c.getData());
                            JSObject ret = new JSObject();
                            ret.put("idToken", g.getIdToken());
                            ret.put("name", g.getDisplayName());
                            call.resolve(ret);
                        } catch (Exception e) { call.reject(String.valueOf(e.getMessage()), "failed"); }
                    } else call.reject("unexpected credential", "failed");
                }
                @Override
                public void onError(GetCredentialException e) {
                    call.reject(String.valueOf(e.getMessage()), e instanceof GetCredentialCancellationException ? "cancelled" : "failed");
                }
            });
    }
}
