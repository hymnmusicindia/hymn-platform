package fun.hymnmusic.team;

import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Foreground-only event connection, isolated from message-send HTTP requests. */
final class TeamChatStream implements AutoCloseable {
    interface Listener { void data(JSONObject value); void error(Exception error); }
    private volatile boolean closed;
    private volatile HttpURLConnection connection;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    TeamChatStream(TeamApi api,String workspace,String channel,String peer,Listener listener) {
        worker.execute(()->{
            while(!closed) {
                try {
                    String query="workspace="+URLEncoder.encode(workspace,"UTF-8")+"&view=native";
                    query+=channel.isEmpty()?"&list=1":"&channel="+URLEncoder.encode(channel,"UTF-8")+"&peer="+URLEncoder.encode(peer,"UTF-8");
                    HttpURLConnection current=(HttpURLConnection)new URL(TeamApi.BASE+"/api/team/chat-stream?"+query).openConnection();connection=current;
                    current.setConnectTimeout(10000);current.setReadTimeout(60000);current.setUseCaches(false);current.setRequestProperty("Accept","text/event-stream");current.setRequestProperty("Cookie",api.cookie());
                    int status=current.getResponseCode();if(status!=200)throw new TeamApi.ApiException(status,"Live connection unavailable.");
                    if(current.getContentType()==null||!current.getContentType().startsWith("text/event-stream"))throw new IllegalStateException("Streaming is not available on this connection.");
                    try(BufferedReader reader=new BufferedReader(new InputStreamReader(current.getInputStream(),StandardCharsets.UTF_8))){
                        String line,event="";StringBuilder data=new StringBuilder();
                        while(!closed&&(line=reader.readLine())!=null){
                            if(line.isEmpty()) {if(data.length()>0){JSONObject value=new JSONObject(data.toString());if(event.equals("unavailable"))throw new TeamApi.ApiException(value.optInt("status",503),"Live connection interrupted.");listener.data(value);}data.setLength(0);event="";}
                            else if(line.startsWith("data:")){if(data.length()>0)data.append('\n');data.append(line.substring(5).trim());if(data.length()>1000000)throw new IllegalStateException("Live message batch too large.");}
                            else if(line.startsWith("event:"))event=line.substring(6).trim();
                        }
                    }
                }catch(Exception error){if(!closed)listener.error(error);return;}
                finally{HttpURLConnection current=connection;connection=null;if(current!=null)current.disconnect();}
                try{Thread.sleep(750);}catch(InterruptedException stopped){return;}
            }
        });
    }
    @Override public void close(){closed=true;HttpURLConnection current=connection;if(current!=null)current.disconnect();worker.shutdownNow();}
}
