package fun.hymnmusic.team;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.Gravity;
import android.webkit.*;
import android.widget.*;
import androidx.core.view.ViewCompat;

/** Full authorized Team OS workflows, inside the app with the existing session. No JS bridge. */
public final class TeamWorkspaceActivity extends Activity {
    private WebView web;
    private ValueCallback<Uri[]> files;
    static boolean trusted(String value) {
        try { java.net.URI u=new java.net.URI(value);return "https".equals(u.getScheme())&&"hymnmusic.fun".equals(u.getHost())&&(u.getPort()==-1||u.getPort()==443)&&u.getUserInfo()==null; }catch(Exception ignored){return false;}
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        TeamApi api=new TeamApi(this);
        if(api.cookie().isEmpty()){finish();return;}
        boolean dark=getSharedPreferences("hymn_team_settings",MODE_PRIVATE).getBoolean("night_mode",false);
        TeamPalette palette=new TeamPalette(dark);TeamSafeArea.configureWindow(getWindow(),dark);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(palette.background);
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(12,4,12,4);
        Button back=new Button(this);back.setText("Back");back.setAllCaps(false);bar.addView(back);back.setOnClickListener(v->finish());
        TextView title=new TextView(this);title.setText(getIntent().getStringExtra("title"));title.setTextColor(palette.text);title.setTextSize(15);title.setMaxLines(1);title.setEllipsize(android.text.TextUtils.TruncateAt.END);bar.addView(title,new LinearLayout.LayoutParams(0,-2,1));
        Button reload=new Button(this);reload.setText("Refresh");reload.setAllCaps(false);bar.addView(reload);reload.setOnClickListener(v->web.reload());root.addView(bar);
        ProgressBar progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);root.addView(progress,new LinearLayout.LayoutParams(-1,6));
        TextView error=new TextView(this);error.setTextColor(palette.error);error.setPadding(16,12,16,12);error.setVisibility(android.view.View.GONE);root.addView(error);
        web=new WebView(this);web.setBackgroundColor(palette.background);root.addView(web,new LinearLayout.LayoutParams(-1,0,1));
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setAllowFileAccessFromFileURLs(false);settings.setAllowUniversalAccessFromFileURLs(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setSupportMultipleWindows(false);
        CookieManager cookies=CookieManager.getInstance();cookies.setAcceptCookie(true);cookies.setAcceptThirdPartyCookies(web,false);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                String value=request.getUrl().toString();if(trusted(value))return false;
                if(request.isForMainFrame()&&request.hasGesture()&&java.util.Arrays.asList("https","tel","mailto").contains(request.getUrl().getScheme()))try{startActivity(new Intent(Intent.ACTION_VIEW,request.getUrl()));}catch(Exception ignored){}
                return true;
            }
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon){error.setVisibility(android.view.View.GONE);}
            @Override public void onPageFinished(WebView view,String url){if(!trusted(url))return;view.evaluateJavascript("document.documentElement.setAttribute('data-theme','"+(dark?"dark":"light")+"');var s=document.getElementById('hymn-native-frame');if(!s){s=document.createElement('style');s.id='hymn-native-frame';s.textContent='[data-site-header]{display:none!important}';document.head.appendChild(s)}",null);}
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError failure){if(request.isForMainFrame()){error.setText("Could not load this workspace. Check your connection and tap Refresh.");error.setVisibility(android.view.View.VISIBLE);}}
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public void onProgressChanged(WebView view,int value){progress.setProgress(value);progress.setVisibility(value==100?android.view.View.GONE:android.view.View.VISIBLE);}
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(!trusted(view.getUrl()))return false;if(files!=null)files.onReceiveValue(null);files=callback;
                Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT);pick.addCategory(Intent.CATEGORY_OPENABLE);pick.setType("*/*");pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);try{startActivityForResult(pick,311);}catch(Exception e){files.onReceiveValue(null);files=null;}return true;
            }
        });
        web.setDownloadListener((url,userAgent,disposition,mime,size)->{
            if(!trusted(url))return;
            new android.app.AlertDialog.Builder(this).setTitle("Download attachment?").setMessage("Save this file to Downloads on this phone?").setNegativeButton("Cancel",null).setPositiveButton("Download",(d,w)->{try{
                DownloadManager.Request download=new DownloadManager.Request(Uri.parse(url));download.addRequestHeader("Cookie",api.cookie());download.setMimeType(mime);download.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);download.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,URLUtil.guessFileName(url,disposition,mime).replaceAll("[^a-zA-Z0-9._ -]","_"));((DownloadManager)getSystemService(DOWNLOAD_SERVICE)).enqueue(download);
            }catch(Exception e){Toast.makeText(this,"Download unavailable. Try again.",Toast.LENGTH_LONG).show();}}).show();
        });
        android.widget.FrameLayout safe=TeamSafeArea.wrap(this,root,palette.background);setContentView(safe);ViewCompat.requestApplyInsets(safe);
        Uri.Builder url=Uri.parse(TeamApi.BASE+"/team").buildUpon().appendQueryParameter("workspace",getIntent().getStringExtra("workspace")).appendQueryParameter("module",getIntent().getStringExtra("module"));
        String task=getIntent().getStringExtra("task");if(task!=null&&!task.isEmpty())url.appendQueryParameter("task",task);
        cookies.setCookie(TeamApi.BASE,api.cookie()+"; Path=/; Secure; HttpOnly; SameSite=Lax",accepted->{if(!isDestroyed()){cookies.flush();web.loadUrl(url.build().toString());}});
    }
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==311&&files!=null){java.util.ArrayList<Uri> selected=new java.util.ArrayList<>();if(result==RESULT_OK&&data!=null){if(data.getClipData()!=null)for(int i=0;i<data.getClipData().getItemCount();i++){Uri uri=data.getClipData().getItemAt(i).getUri();if("content".equals(uri.getScheme()))selected.add(uri);}else if(data.getData()!=null&&"content".equals(data.getData().getScheme()))selected.add(data.getData());}files.onReceiveValue(selected.isEmpty()?null:selected.toArray(new Uri[0]));files=null;}}
    @Override public void onBackPressed(){if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){if(files!=null)files.onReceiveValue(null);if(web!=null){web.stopLoading();web.destroy();}super.onDestroy();}
}
