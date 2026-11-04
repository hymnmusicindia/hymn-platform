package fun.hymnmusic.app;

import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import androidx.core.graphics.Insets;
import androidx.core.view.*;
import androidx.credentials.*;
import androidx.credentials.exceptions.*;
import com.google.android.libraries.identity.googleid.*;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.*;

/** Website-first customer app. Only HYMN pages are rendered in the privileged WebView. */
public final class MusicWebActivity extends Activity {
    static final int UPLOAD = 71, DOWNLOAD = 72;
    WebView web;
    LinearLayout root;
    ProgressBar progress;
    TextView google;
    LinearLayout failure;
    ValueCallback<Uri[]> upload;
    String downloadUrl, downloadCookie, retryUrl = MusicNavigation.ORIGIN;
    byte[] downloadBytes;
    String blobToken;
    boolean googleBusy;
    final ExecutorService worker = Executors.newFixedThreadPool(2);
    final Handler handler = new Handler(Looper.getMainLooper());
    CancellationSignal googleCancellation;
    Runnable googleDeadline;
    boolean notificationSyncBusy, notificationScreenActive;
    String pendingNotificationAccount, pendingNotificationHref;
    final Runnable notificationTick = new Runnable() { public void run() {
        if (!notificationScreenActive) return;
        syncPhoneNotifications(); handler.postDelayed(this, 15000);
    }};

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(0xff101519);
        getWindow().setNavigationBarColor(0xff101519);
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(0xff101519);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom)); return insets;
        });
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        root.addView(progress, new LinearLayout.LayoutParams(-1, dp(3)));
        google = new TextView(this); google.setText("Continue with Google"); google.setGravity(Gravity.CENTER);
        google.setTextColor(Color.WHITE); google.setTextSize(14); google.setPadding(dp(16), dp(14), dp(16), dp(14));
        google.setBackgroundColor(0xff24333c); google.setVisibility(View.GONE); google.setOnClickListener(v -> googleSignIn()); root.addView(google);
        FrameLayout content = new FrameLayout(this); root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        web = new WebView(this); web.setBackgroundColor(0xff101519); content.addView(web, new FrameLayout.LayoutParams(-1,-1));
        failure = new LinearLayout(this); failure.setOrientation(LinearLayout.VERTICAL); failure.setGravity(Gravity.CENTER);
        failure.setPadding(dp(28),dp(28),dp(28),dp(28)); failure.setBackgroundColor(0xff101519); failure.setVisibility(View.GONE);
        TextView explanation = new TextView(this); explanation.setText("HYMN couldn't load this page.\nCheck your connection and try again."); explanation.setTextColor(Color.WHITE); explanation.setTextSize(17); explanation.setGravity(Gravity.CENTER); failure.addView(explanation);
        Button retry = new Button(this); retry.setText("Try again"); retry.setOnClickListener(v -> web.loadUrl(MusicNavigation.initial(retryUrl))); failure.addView(retry);
        content.addView(failure, new FrameLayout.LayoutParams(-1,-1)); setContentView(root);
        WebSettings settings = web.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false); settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); settings.setSafeBrowsingEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT); settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(true); settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setUserAgentString(settings.getUserAgentString()+" HYMNMusic/"+BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true); // payment provider frames
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if("hymn-download".equals(request.getUrl().getScheme())) { if(request.isForMainFrame())receiveBlob(request.getUrl());return true; }
                return route(request.getUrl().toString());
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                if (!MusicNavigation.internal(url)) return;
                retryUrl=url; failure.setVisibility(View.GONE); progress.setVisibility(View.VISIBLE); updateGoogle(url);
            }
            @Override public void doUpdateVisitedHistory(WebView view,String url,boolean reload) { updateGoogle(url); }
            @Override public void onPageFinished(WebView view, String url) {
                progress.setVisibility(View.GONE); CookieManager.getInstance().flush(); updateGoogle(url);
                syncPhoneNotifications();
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if(request.isForMainFrame()) { failure.setVisibility(View.VISIBLE); progress.setVisibility(View.GONE); }
            }
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response) {
                if(request.isForMainFrame() && response.getStatusCode()>=500) { failure.setVisibility(View.VISIBLE); progress.setVisibility(View.GONE); }
            }
            @Override public boolean onRenderProcessGone(WebView view,RenderProcessGoneDetail detail) { recreate(); return true; }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view,int value) { progress.setProgress(value); }
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params) {
                if(!MusicNavigation.internal(view.getUrl())) return false;
                if(upload!=null) upload.onReceiveValue(null); upload=callback;
                Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT); pick.addCategory(Intent.CATEGORY_OPENABLE); pick.setType("*/*");
                String[] accept=params.getAcceptTypes(); if(accept!=null&&accept.length>0&&!accept[0].isEmpty())pick.putExtra(Intent.EXTRA_MIME_TYPES,accept);
                pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);
                try { startActivityForResult(pick,UPLOAD); } catch(ActivityNotFoundException e) { upload.onReceiveValue(null); upload=null; toast("No file picker is available on this device."); }
                return true;
            }
            @Override public boolean onCreateWindow(WebView view,boolean dialog,boolean userGesture,Message message) {
                if(!userGesture)return false;
                WebView popup=new WebView(MusicWebActivity.this);
                popup.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){String url=r.getUrl().toString();if(!route(url))web.loadUrl(url);v.destroy();return true;}});
                ((WebView.WebViewTransport)message.obj).setWebView(popup); message.sendToTarget(); return true;
            }
        });
        web.setDownloadListener((url,agent,disposition,mime,size)->prepareDownload(url,disposition,mime));
        receiveNotificationIntent(getIntent());
        if(saved==null||web.restoreState(saved)==null) web.loadUrl(initialUrl(getIntent()));
    }
    void receiveNotificationIntent(Intent intent) {
        pendingNotificationAccount = intent.getStringExtra("notificationAccount");
        pendingNotificationHref = intent.getStringExtra("notificationHref");
    }
    void syncPhoneNotifications() {
        if (notificationSyncBusy || isDestroyed()) return;
        notificationSyncBusy = true;
        String cookies = CookieManager.getInstance().getCookie(MusicNavigation.ORIGIN);
        worker.execute(() -> {
            String verified = "";
            try { MusicPhoneNotifications.captureSession(this, cookies); verified = MusicPhoneNotifications.sync(this); }
            catch (Exception ignored) { /* A transient outage must not sign the user out. WorkManager retries. */ }
            final String account = verified;
            runOnUiThread(() -> {
                notificationSyncBusy = false;
                if (isDestroyed()) return;
                // Ignore late authentication results after WebView sign-out or account switching.
                if (!MusicNotificationPolicy.sessionCookie(cookies).equals(MusicNotificationPolicy.sessionCookie(CookieManager.getInstance().getCookie(MusicNavigation.ORIGIN)))) return;
                if (pendingNotificationHref != null && !account.isEmpty()) {
                    if (account.equals(pendingNotificationAccount)) web.loadUrl(MusicNotificationPolicy.destination(pendingNotificationHref));
                    pendingNotificationHref = null; pendingNotificationAccount = null;
                }
                if (!account.isEmpty() && notificationScreenActive) askForPhoneNotifications();
            });
        });
    }
    void askForPhoneNotifications() {
        // Explain the purpose after sign-in, rather than showing an unexplained OS prompt at launch.
        android.content.SharedPreferences choice = getSharedPreferences("hymn_notification_choice", MODE_PRIVATE);
        if (choice.getBoolean("asked", false)) return;
        choice.edit().putBoolean("asked", true).apply();
        new AlertDialog.Builder(this).setTitle("Stay in the loop")
            .setMessage("Get release approvals, correction requests, live-release updates, beat purchases and HYMN messages on your phone. You can change each category in Android notification settings.")
            .setNegativeButton("Not now", (dialog, which) -> {})
            .setPositiveButton("Enable alerts", (dialog, which) -> {
                choice.edit().putBoolean("enabled", true).apply();
                if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 73);
            }).show();
    }
    int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    String initialUrl(Intent intent){String url=intent.getDataString();return MusicNavigation.initial(url);}
    boolean route(String url) {
        if (MusicNavigation.internal(url) && "/music/app/notifications".equals(Uri.parse(url).getPath())) {
            showPhoneNotificationSettings(); return true;
        }
        if(MusicNavigation.internal(url))return false;
        Uri uri=Uri.parse(url);
        if("https".equals(uri.getScheme())&&"accounts.google.com".equals(uri.getHost())&&web!=null&&MusicNavigation.internal(web.getUrl())){googleSignIn();return true;}
        if(url.startsWith("blob:")||url.startsWith("data:"))return true;
        external(url);return true;
    }
    void showPhoneNotificationSettings() {
        new AlertDialog.Builder(this).setTitle("Phone notifications")
            .setItems(new String[]{"Enable phone alerts", "Pause phone alerts", "Android notification settings"}, (dialog, which) -> {
                android.content.SharedPreferences choice = getSharedPreferences("hymn_notification_choice", MODE_PRIVATE);
                if (which == 0) {
                    choice.edit().putBoolean("enabled", true).putBoolean("asked", true).apply();
                    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED)
                        requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 73);
                    else if (!androidx.core.app.NotificationManagerCompat.from(this).areNotificationsEnabled()) openPhoneNotificationSettings();
                    else toast("Phone alerts enabled.");
                } else if (which == 1) {
                    choice.edit().putBoolean("enabled", false).putBoolean("asked", true).apply();
                    androidx.core.app.NotificationManagerCompat.from(this).cancelAll(); toast("Phone alerts paused. Your HYMN inbox is unchanged.");
                } else openPhoneNotificationSettings();
            }).setNegativeButton("Close", null).show();
    }
    void openPhoneNotificationSettings() {
        startActivity(new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName()));
    }
    void external(String url) {
        try {
            Uri uri=Uri.parse(url);if(!MusicNavigation.externalScheme(uri.getScheme()))return;
            Intent intent;
            if("intent".equals(uri.getScheme())) { intent=Intent.parseUri(url,Intent.URI_INTENT_SCHEME);intent.setComponent(null);intent.setSelector(null);intent.addCategory(Intent.CATEGORY_BROWSABLE);if(intent.getData()==null||!MusicNavigation.externalScheme(intent.getData().getScheme())||"intent".equals(intent.getData().getScheme()))return; }
            else intent=new Intent(Intent.ACTION_VIEW,uri).addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(intent);
        }catch(Exception e){toast("No app is available to open this link.");}
    }
    void updateGoogle(String url) {
        if(!MusicNavigation.internal(url)){google.setVisibility(View.GONE);return;}
        String path=Uri.parse(url).getPath();boolean auth=path!=null&&(path.equals("/auth")||path.equals("/login")||path.equals("/customer-login")||path.equals("/join"));
        google.setVisibility(auth?View.VISIBLE:View.GONE);
    }
    void googleSignIn() {
        if(googleBusy)return;
        if(com.google.android.gms.common.GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(this)!=com.google.android.gms.common.ConnectionResult.SUCCESS){toast("Update Google Play services, or use the email code form below.");return;}
        googleBusy=true; google.setEnabled(false);google.setText("Opening Google…");googleCancellation=new CancellationSignal();
        googleDeadline=()->{googleCancellation.cancel();googleFinished();toast("Google did not finish. Try again or use an email code.");};handler.postDelayed(googleDeadline,60000);
        GetCredentialRequest request=new GetCredentialRequest.Builder().addCredentialOption(new GetSignInWithGoogleOption.Builder(getString(R.string.google_web_client_id)).build()).build();
        CredentialManager.create(this).getCredentialAsync(this,request,googleCancellation,androidx.core.content.ContextCompat.getMainExecutor(this),new CredentialManagerCallback<GetCredentialResponse,GetCredentialException>(){
            @Override public void onResult(GetCredentialResponse response){
                handler.removeCallbacks(googleDeadline);
                try {
                    String token=GoogleIdTokenCredential.createFrom(((CustomCredential)response.getCredential()).getData()).getIdToken();google.setText("Signing you in…");
                    worker.execute(()->{try{CustomerApi api=new CustomerApi(MusicWebActivity.this);api.request("POST","/api/auth/google",new JSONObject().put("credential",token));String cookie=api.saved("cookie");
                        if(cookie.isEmpty())throw new IOException();runOnUiThread(()->{if(isDestroyed())return;CookieManager.getInstance().setCookie(MusicNavigation.ORIGIN,cookie+"; Path=/; Secure; HttpOnly; SameSite=Lax",ok->{googleFinished();CookieManager.getInstance().flush();web.loadUrl(MusicNavigation.ORIGIN+"/dashboard");});});
                    }catch(Exception e){runOnUiThread(()->{googleFinished();toast("Google sign-in could not finish. Try again or use an email code.");});}});
                }catch(Exception e){googleFinished();toast("Google could not verify this account. Use an email code or try again.");}
            }
            @Override public void onError(GetCredentialException e){googleFinished();toast(e instanceof GetCredentialCancellationException?"Google sign-in closed.":"Google sign-in is unavailable. You can use the email code form.");}
        });
    }
    void googleFinished(){if(googleDeadline!=null)handler.removeCallbacks(googleDeadline);googleBusy=false;google.setEnabled(true);google.setText("Continue with Google");}
    void prepareDownload(String url,String disposition,String mime) {
        if(!MusicNavigation.internal(web.getUrl()))return;
        downloadBytes=null;downloadUrl=null;downloadCookie=null;
        if(url.startsWith("blob:")) {
            blobToken=java.util.UUID.randomUUID().toString();
            web.evaluateJavascript("(async()=>{try{const b=await(await fetch("+JSONObject.quote(url)+")).blob();if(b.size>25*1024*1024)throw Error();const f=new FileReader();f.onload=()=>{location.href='hymn-download://"+blobToken+"?data='+encodeURIComponent(f.result)};f.readAsDataURL(b);}catch(e){location.href='hymn-download://"+blobToken+"?error=1'}})()",null);return;
        }
        if(!MusicNavigation.internal(url)){external(url);return;}
        downloadUrl=url;downloadCookie=CookieManager.getInstance().getCookie(MusicNavigation.ORIGIN);
        saveDownload(URLUtil.guessFileName(url,disposition,mime),mime);
    }
    void receiveBlob(Uri uri){
        if(blobToken==null||!blobToken.equals(uri.getHost())||!MusicNavigation.internal(web.getUrl()))return;blobToken=null;
        try{String data=uri.getQueryParameter("data");if(data==null||data.length()>36*1024*1024)throw new IOException();int comma=data.indexOf(',');if(!data.startsWith("data:")||comma<0||!data.substring(0,comma).endsWith(";base64"))throw new IOException();
            String mime=data.substring(5,data.indexOf(';'));downloadBytes=android.util.Base64.decode(data.substring(comma+1),android.util.Base64.DEFAULT);
            saveDownload(mime.equals("application/pdf")?"HYMN-document.pdf":"HYMN-download",mime);
        }catch(Exception e){toast("This generated file could not be saved. Try its direct download link.");}
    }
    void saveDownload(String name,String mime){
        Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime!=null&&!mime.isEmpty()?mime:"application/octet-stream");
        save.putExtra(Intent.EXTRA_TITLE,name);
        try{startActivityForResult(save,DOWNLOAD);}catch(ActivityNotFoundException e){toast("No document save location is available.");}
    }
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);
        if(request==UPLOAD&&upload!=null){Uri[] selected=null;if(result==RESULT_OK&&data!=null){if(data.getClipData()!=null){int n=data.getClipData().getItemCount();selected=new Uri[n];for(int i=0;i<n;i++)selected[i]=data.getClipData().getItemAt(i).getUri();}else if(data.getData()!=null)selected=new Uri[]{data.getData()};}
            if(selected!=null)for(Uri uri:selected)if(!"content".equals(uri.getScheme())){selected=null;break;}upload.onReceiveValue(selected);upload=null;
        }else if(request==DOWNLOAD&&result==RESULT_OK&&data!=null&&data.getData()!=null){Uri target=data.getData();String url=downloadUrl,cookie=downloadCookie;byte[] generated=downloadBytes;downloadBytes=null;downloadUrl=null;downloadCookie=null;if(url==null&&generated==null)return;
            toast("Saving download…");worker.execute(()->{HttpURLConnection connection=null;try{
                if(generated!=null){try(OutputStream out=getContentResolver().openOutputStream(target,"w")){if(out==null)throw new IOException();out.write(generated);}runOnUiThread(()->toast("Download saved."));return;}
                connection=(HttpURLConnection)new URL(url).openConnection();connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(15000);connection.setReadTimeout(90000);if(cookie!=null)connection.setRequestProperty("Cookie",cookie);
                if(connection.getResponseCode()!=200)throw new IOException();try(InputStream in=connection.getInputStream();OutputStream out=getContentResolver().openOutputStream(target,"w")){if(out==null)throw new IOException();byte[] bytes=new byte[65536];int n;while((n=in.read(bytes))!=-1)out.write(bytes,0,n);}runOnUiThread(()->toast("Download saved."));
            }catch(Exception e){runOnUiThread(()->toast("Download failed. Refresh the page and try again."));}finally{if(connection!=null)connection.disconnect();}});
        }
    }
    void toast(String message){if(!isDestroyed())Toast.makeText(this,message,Toast.LENGTH_LONG).show();}
    @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);receiveNotificationIntent(intent);if(pendingNotificationHref!=null)syncPhoneNotifications();else web.loadUrl(initialUrl(intent));}
    @Override protected void onSaveInstanceState(Bundle state){super.onSaveInstanceState(state);web.saveState(state);}
    @Override protected void onPause(){super.onPause();notificationScreenActive=false;handler.removeCallbacks(notificationTick);web.onPause();CookieManager.getInstance().flush();syncPhoneNotifications();}
    @Override protected void onResume(){super.onResume();notificationScreenActive=true;if(web!=null)web.onResume();handler.removeCallbacks(notificationTick);handler.post(notificationTick);}
    @Override protected void onDestroy(){notificationScreenActive=false;handler.removeCallbacks(notificationTick);if(upload!=null)upload.onReceiveValue(null);if(googleDeadline!=null)handler.removeCallbacks(googleDeadline);if(googleCancellation!=null)googleCancellation.cancel();worker.shutdownNow();web.destroy();super.onDestroy();}
}
