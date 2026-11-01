package fun.hymnmusic.team;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.concurrent.*;

/** Verified same-signer APK updates. Android always asks the user to install. */
final class TeamAppUpdater implements AutoCloseable {
    private static final String PRIMARY="https://hymnmusic.fun/downloads/hymn-team/";
    private static final String FALLBACK="https://raw.githubusercontent.com/hymnmusicindia/hymn-platform/main/public/downloads/hymn-team/";
    private final Activity activity;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private volatile boolean closed,busy;
    private volatile boolean promptAllowed=true;
    void setPromptAllowed(boolean allowed){promptAllowed=allowed;}
    private File pending;
    TeamAppUpdater(Activity activity){this.activity=activity;}
    private boolean active(){return !closed&&!activity.isFinishing()&&!activity.isDestroyed();}
    private void toast(String message){activity.runOnUiThread(()->{if(active())Toast.makeText(activity,message,Toast.LENGTH_LONG).show();});}
    void check(boolean force){
        if(closed||busy)return;
        android.content.SharedPreferences prefs=activity.getSharedPreferences("hymn_team_updates",0);
        if(!force&&System.currentTimeMillis()-prefs.getLong("checked",0)<4*60*60*1000L)return;
        busy=true;
        worker.execute(()->{try{
            JSONObject release=null;String base=PRIMARY;
            try{release=metadata(PRIMARY);}catch(Exception ignored){}
            try{JSONObject mirrored=metadata(FALLBACK);if(release==null||mirrored.getInt("versionCode")>release.getInt("versionCode")){release=mirrored;base=FALLBACK;}}catch(Exception ignored){}
            if(release==null)throw new IOException("Update metadata unavailable");
            prefs.edit().putLong("checked",System.currentTimeMillis()).apply();
            int code=release.getInt("versionCode");
            if(code<=BuildConfig.VERSION_CODE){if(force)toast("HYMN Team is up to date.");return;}
            if(!force&&prefs.getInt("promptedCode",0)==code&&System.currentTimeMillis()-prefs.getLong("promptedAt",0)<24*60*60*1000L)return;
            final JSONObject update=release;final String source=base;
            activity.runOnUiThread(()->{if(!active()||!promptAllowed)return;prefs.edit().putInt("promptedCode",code).putLong("promptedAt",System.currentTimeMillis()).apply();
                new AlertDialog.Builder(activity).setTitle("Update HYMN Team")
                    .setMessage("Version "+update.optString("version")+" is ready. Download and install it to get the latest improvements. Your account and data stay on this device.")
                    .setNegativeButton("Later",null).setPositiveButton("Update",(dialog,which)->download(source,update)).show();});
        }catch(Exception error){if(force)toast("Could not check for updates. Please try again.");}finally{busy=false;}});
    }
    private JSONObject metadata(String base)throws Exception{
        HttpURLConnection connection=connect(base+"release.json");
        try(InputStream in=connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>16384)throw new IOException("Invalid update metadata");out.write(buffer,0,n);}
            JSONObject release=new JSONObject(out.toString(StandardCharsets.UTF_8.name()));
            if(!release.getString("file").matches("hymn-team-[0-9]+\\.[0-9]+\\.[0-9]+-[a-f0-9]{12}\\.apk")||!release.getString("sha256").matches("[a-f0-9]{64}")||release.getLong("size")<=0||release.getLong("size")>64*1024*1024L)throw new IOException("Invalid update metadata");return release;
        }finally{connection.disconnect();}
    }
    private HttpURLConnection connect(String url)throws Exception{
        HttpURLConnection connection=(HttpURLConnection)new URL(url).openConnection();
        connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(15000);connection.setReadTimeout(30000);connection.setUseCaches(false);
        if(connection.getResponseCode()!=200){connection.disconnect();throw new IOException("Update unavailable");}return connection;
    }
    private void download(String base,JSONObject release){
        if(busy||closed)return;busy=true;toast("Downloading HYMN Team update…");
        worker.execute(()->{File file=null;try{
            File directory=new File(activity.getCacheDir(),"app-updates");if(!directory.isDirectory()&&!directory.mkdirs())throw new IOException("No update storage");
            file=new File(directory,release.getString("file"));HttpURLConnection connection=connect(base+release.getString("file"));
            MessageDigest digest=MessageDigest.getInstance("SHA-256");long expected=release.getLong("size"),total=0;
            try(InputStream in=connection.getInputStream();FileOutputStream out=new FileOutputStream(file)){
                byte[] buffer=new byte[32768];int n;while((n=in.read(buffer))!=-1){if(closed||Thread.currentThread().isInterrupted())throw new IOException("Download stopped");total+=n;if(total>expected)throw new IOException("Invalid download size");digest.update(buffer,0,n);out.write(buffer,0,n);}out.getFD().sync();
            }finally{connection.disconnect();}
            StringBuilder hash=new StringBuilder();for(byte b:digest.digest())hash.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
            if(total!=expected||!hash.toString().equals(release.getString("sha256")))throw new IOException("Update checksum mismatch");
            verifySigner(file,release.getInt("versionCode"));final File verified=file;
            activity.runOnUiThread(()->{if(active()){pending=verified;install();}});
        }catch(Exception error){if(file!=null)file.delete();toast("Update could not be verified or downloaded. Please try again.");}finally{busy=false;}});
    }
    @SuppressWarnings("deprecation") private void verifySigner(File file,int code)throws Exception{
        PackageManager pm=activity.getPackageManager();int flags=Build.VERSION.SDK_INT>=28?PackageManager.GET_SIGNING_CERTIFICATES:PackageManager.GET_SIGNATURES;
        PackageInfo installed=pm.getPackageInfo(activity.getPackageName(),flags),archive=pm.getPackageArchiveInfo(file.getAbsolutePath(),flags);
        if(archive==null||!activity.getPackageName().equals(archive.packageName)||archive.versionCode!=code||code<=BuildConfig.VERSION_CODE)throw new SecurityException("Wrong update package");
        android.content.pm.Signature[] actual=Build.VERSION.SDK_INT>=28?installed.signingInfo.getApkContentsSigners():installed.signatures;
        android.content.pm.Signature[] next=Build.VERSION.SDK_INT>=28?archive.signingInfo.getApkContentsSigners():archive.signatures;
        if(actual==null||next==null||actual.length!=next.length||actual.length==0)throw new SecurityException("Wrong update signer");
        for(android.content.pm.Signature signature:actual)if(!Arrays.asList(next).contains(signature))throw new SecurityException("Wrong update signer");
    }
    void resumeInstall(){if(pending!=null&&activity.getPackageManager().canRequestPackageInstalls())install();}
    private void install(){
        if(pending==null||!active()||!promptAllowed)return;
        try{if(!activity.getPackageManager().canRequestPackageInstalls()){
            new AlertDialog.Builder(activity).setTitle("Allow HYMN Team updates").setMessage("Allow this app to install updates on the next screen, then return here to continue.")
                .setNegativeButton("Later",null).setPositiveButton("Open settings",(dialog,which)->activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.getPackageName())))).show();return;}
            Uri uri=FileProvider.getUriForFile(activity,activity.getPackageName()+".updates",pending);
            activity.startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));pending=null;
        }catch(Exception error){toast("Open the HYMN Team download page to install this update.");}
    }
    @Override public void close(){closed=true;worker.shutdownNow();}
}
