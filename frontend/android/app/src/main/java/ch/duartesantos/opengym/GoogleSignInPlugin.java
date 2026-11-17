package ch.duartesantos.opengym;

import android.app.Activity;
import android.content.Intent;
import android.content.IntentSender;
import android.os.CancellationSignal;
import com.getcapacitor.JSArray;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import java.util.ArrayList;
import java.util.List;
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
 *   const { accessToken, email } = await G.authorize({ scopes: ['https://www.googleapis.com/auth/drive.file'], interactive: true })
 *     // Google Drive for the sync (src/fitsmarter/drive.js). Asks once; after that it answers
 *     // without any screen, so the sync runs on its own. interactive: false rejects 'needs-consent'.
 */
@CapacitorPlugin(name = "GoogleSignIn", requestCodes = { GoogleSignInPlugin.AUTH_REQ })
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

    static final int AUTH_REQ = 0x5157;
    private PluginCall pendingAuth;

    @PluginMethod
    public void authorize(PluginCall call) {
        JSArray arr = call.getArray("scopes");
        List<Scope> scopes = new ArrayList<>();
        try { for (Object o : arr.toList()) scopes.add(new Scope(String.valueOf(o))); } catch (Exception e) { call.reject("bad scopes", "failed"); return; }
        boolean interactive = call.getBoolean("interactive", true);
        Activity act = getActivity();
        Identity.getAuthorizationClient(act)
            .authorize(AuthorizationRequest.builder().setRequestedScopes(scopes).build())
            .addOnSuccessListener(res -> {
                if (res.hasResolution()) {
                    if (!interactive) { call.reject("consent needed", "needs-consent"); return; }
                    try {
                        pendingAuth = call;
                        act.startIntentSenderForResult(res.getPendingIntent().getIntentSender(), AUTH_REQ, null, 0, 0, 0);
                    } catch (IntentSender.SendIntentException e) { pendingAuth = null; call.reject(String.valueOf(e.getMessage()), "failed"); }
                } else resolveAuth(call, res);
            })
            .addOnFailureListener(e -> call.reject(String.valueOf(e.getMessage()), "failed"));
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);
        if (requestCode != AUTH_REQ || pendingAuth == null) return;
        PluginCall call = pendingAuth;
        pendingAuth = null;
        if (resultCode != Activity.RESULT_OK) { call.reject("cancelled", "cancelled"); return; }
        try { resolveAuth(call, Identity.getAuthorizationClient(getActivity()).getAuthorizationResultFromIntent(data)); }
        catch (Exception e) { call.reject(String.valueOf(e.getMessage()), "failed"); }
    }

    private void resolveAuth(PluginCall call, AuthorizationResult res) {
        JSObject ret = new JSObject();
        ret.put("accessToken", res.getAccessToken());
        if (res.toGoogleSignInAccount() != null) ret.put("email", res.toGoogleSignInAccount().getEmail());
        call.resolve(ret);
    }
}
