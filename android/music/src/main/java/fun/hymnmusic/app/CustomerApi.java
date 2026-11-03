package fun.hymnmusic.app;
import android.content.Context;
import android.content.SharedPreferences;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

final class CustomerApi {
    static final String BASE="https://hymnmusic.fun";
    private final SharedPreferences secure;
    private final android.util.LruCache<String,JSONObject> cache=new android.util.LruCache<>(20);
    static final class Failure extends IOException { final int status; Failure(int status,String message){super(message);this.status=status;} }
    CustomerApi(Context context) throws Exception {
        MasterKey key=new MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build();
        secure=EncryptedSharedPreferences.create(context,"hymn_music_secure",key,EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
    }
    String saved(String key){return secure.getString(key,"");}
    void save(String key,String value){secure.edit().putString(key,value).apply();}
    void clear(){secure.edit().clear().apply();cache.evictAll();NativeArtwork.cache.evictAll();}
    void clearSession(){secure.edit().remove("cookie").apply();cache.evictAll();NativeArtwork.cache.evictAll();}
    boolean signedIn(){return !saved("cookie").isEmpty();}
    JSONObject cached(String path){JSONObject data=cache.get(path);try{return data!=null&&System.currentTimeMillis()-data.getLong("at")<60000?new JSONObject(data.getJSONObject("value").toString()):null;}catch(Exception e){return null;}}
    HttpURLConnection connection(String path,String method) throws Exception {
        String url=path.startsWith("/")?BASE+path:path;
        if(!MusicNavigation.internal(url))throw new IOException("This action is not a HYMN account request.");
        HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();c.setRequestMethod(method);c.setInstanceFollowRedirects(false);c.setUseCaches(false);c.setConnectTimeout(15000);c.setReadTimeout(90000);
        c.setRequestProperty("Accept","application/json");c.setRequestProperty("Origin",BASE);c.setRequestProperty("X-HYMN-Client","android-customer/"+BuildConfig.VERSION_NAME);
        if(signedIn())c.setRequestProperty("Cookie",saved("cookie"));return c;
    }
    JSONObject request(String method,String path,JSONObject body)throws Exception{
        HttpURLConnection c=connection(path,method);try{
            if(body!=null){c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json; charset=utf-8");try(OutputStream out=c.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}}
            return finish(c,path,method);
        }finally{c.disconnect();}
    }
    JSONObject bytes(String method,String path,byte[] data,String type)throws Exception{
        HttpURLConnection c=connection(path,method);try{c.setDoOutput(true);c.setRequestProperty("Content-Type",type);c.setFixedLengthStreamingMode(data.length);try(OutputStream out=c.getOutputStream()){out.write(data);}return finish(c,path,method);}finally{c.disconnect();}
    }
    JSONObject multipart(String path,JSONObject payload)throws Exception{
        String boundary="HYMN"+UUID.randomUUID();String value="--"+boundary+"\r\nContent-Disposition: form-data; name=\"payload\"\r\nContent-Type: application/json\r\n\r\n"+payload+"\r\n--"+boundary+"--\r\n";
        return bytes("POST",path,value.getBytes(StandardCharsets.UTF_8),"multipart/form-data; boundary="+boundary);
    }
    private JSONObject finish(HttpURLConnection c,String path,String method)throws Exception{
        int status=c.getResponseCode();
        if(status>=200&&status<300)for(Map.Entry<String,List<String>> entry:c.getHeaderFields().entrySet())if("Set-Cookie".equalsIgnoreCase(entry.getKey()))for(String header:entry.getValue())if(header.startsWith("hymn_session="))save("cookie",header.split(";",2)[0]);
        InputStream stream=status<400?c.getInputStream():c.getErrorStream();StringBuilder raw=new StringBuilder();
        if(stream!=null)try(BufferedReader reader=new BufferedReader(new InputStreamReader(stream,StandardCharsets.UTF_8))){String line;while((line=reader.readLine())!=null){raw.append(line);if(raw.length()>12000000)throw new IOException("This response is too large. Try a narrower search.");}}
        JSONObject value;try{value=new JSONObject(raw.toString());}catch(Exception e){throw new Failure(status,"HYMN could not load this screen. Please try again.");}
        if(status<200||status>=300){String message=value.optString("error","Request could not finish.");if(value.optJSONArray("errors")!=null)for(int i=0;i<value.getJSONArray("errors").length();i++)message+="\n• "+value.getJSONArray("errors").getJSONObject(i).optString("message");throw new Failure(status,message);}
        if(method.equals("GET"))cache.put(path,new JSONObject().put("at",System.currentTimeMillis()).put("value",value));else cache.evictAll();return value;
    }
    void download(String path,OutputStream output)throws Exception{
        HttpURLConnection c=connection(path,"GET");try{int status=c.getResponseCode();if(status!=200)throw new Failure(status,"Download is not available. Refresh and try again.");try(InputStream in=c.getInputStream()){byte[] buffer=new byte[65536];int read;while((read=in.read(buffer))!=-1)output.write(buffer,0,read);}}finally{c.disconnect();}
    }
    static String enc(String value){try{return URLEncoder.encode(value,"UTF-8");}catch(Exception e){return "";}}
}
