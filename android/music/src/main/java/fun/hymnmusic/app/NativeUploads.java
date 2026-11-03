package fun.hymnmusic.app;
import android.net.Uri;
import android.database.Cursor;
import android.provider.OpenableColumns;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Native document picker and bounded-memory, integrity-checked private uploads. */
final class NativeUploads {
    final MusicActivity a;
    NativeUploads(MusicActivity activity){a=activity;}
    void release(int releaseId,String trackKey,String category,java.util.function.Consumer<JSONObject> done){a.chooseFile(category.equals("RELEASE_COVER_ART")?"image/jpeg":category.equals("TRACK_AUDIO_MASTER")?"audio/*":"application/pdf",uri->a.task(()->upload(uri,releaseId,trackKey,category,null),done));}
    void studio(String order,Runnable done){a.chooseFile("*/*",uri->a.task(()->upload(uri,0,"","",order),asset->done.run()));}
    String hash(byte[] data)throws Exception{byte[] digest=MessageDigest.getInstance("SHA-256").digest(data);StringBuilder out=new StringBuilder();for(byte b:digest)out.append(String.format(Locale.ROOT,"%02x",b&255));return out.toString();}
    JSONObject upload(Uri uri,int releaseId,String trackKey,String category,String studio)throws Exception{
        String name="upload";try(Cursor c=a.getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(c!=null&&c.moveToFirst())name=c.getString(0);}name=name.replaceAll("[\\\\/\\r\\n]","_");String mime=a.getContentResolver().getType(uri);String lower=name.toLowerCase(Locale.ROOT);if(lower.endsWith(".wav"))mime="audio/wav";else if(lower.endsWith(".mp3"))mime="audio/mpeg";else if(lower.endsWith(".flac"))mime="audio/flac";else if(lower.endsWith(".zip"))mime="application/zip";else if(lower.endsWith(".jpg")||lower.endsWith(".jpeg"))mime="image/jpeg";else if(lower.endsWith(".pdf"))mime="application/pdf";
        long maximum=studio!=null?2L*1024*1024*1024:category.equals("TRACK_AUDIO_MASTER")?500L*1024*1024:20L*1024*1024;
        File local=File.createTempFile("hymn-upload-",".bin",a.getCacheDir());try{
            long size=0;try(InputStream in=a.getContentResolver().openInputStream(uri);OutputStream out=new FileOutputStream(local)){if(in==null)throw new IOException("The selected file could not open.");byte[] buffer=new byte[65536];int n;while((n=in.read(buffer))!=-1){size+=n;if(size>maximum)throw new IOException("This file exceeds the upload limit.");out.write(buffer,0,n);}}if(size==0)throw new IOException("The selected file is empty.");
            int chunkSize=category.contains("RECEIPT")||category.contains("LICENSE")?512*1024:studio!=null?8*1024*1024:a.api.request("GET","/api/uploads/sessions?releaseId="+releaseId,null).getJSONObject("config").getInt("chunkSize");if(chunkSize<512*1024||chunkSize>10*1024*1024)throw new IOException("The upload configuration is unavailable. Please try again.");JSONObject start;
            JSONArray hashes=new JSONArray();try(RandomAccessFile file=new RandomAccessFile(local,"r")){for(long at=0;at<size;at+=chunkSize){byte[] chunk=new byte[(int)Math.min(chunkSize,size-at)];file.readFully(chunk);hashes.put(hash(chunk));}}
            if(studio!=null)start=a.api.request("POST","/api/studio/uploads",a.json("action","create","orderId",studio,"role","SOURCE","filename",name,"mime",mime,"size",size));else start=a.api.request("POST","/api/uploads/sessions",a.json("releaseId",releaseId,"clientTrackId",trackKey,"assetCategory",category,"originalFilename",name,"mimeType",mime,"totalSize",size,"chunkHashes",hashes));
            JSONObject session=start.optJSONObject("session");String id=session==null?"":session.getString("id"),token=start.optString("token");int actual=studio!=null?start.optInt("chunkSize",chunkSize):session.optInt("chunkSize",chunkSize);if(actual!=chunkSize)throw new IOException("Upload configuration changed. Please select this file again.");
            JSONArray uploaded=studio==null?session.optJSONArray("uploadedChunks"):a.api.request("POST","/api/studio/uploads",a.json("action","status","token",token)).optJSONArray("uploadedChunks");Set<Integer> sent=new HashSet<>();for(int n=0;uploaded!=null&&n<uploaded.length();n++)sent.add(uploaded.optInt(n));
            try(RandomAccessFile file=new RandomAccessFile(local,"r")){for(int index=0;index<hashes.length();index++){if(Thread.currentThread().isInterrupted())throw new IOException("Upload interrupted. Select the same file to resume.");if(sent.contains(index))continue;file.seek((long)index*chunkSize);byte[] chunk=new byte[(int)Math.min(chunkSize,size-(long)index*chunkSize)];file.readFully(chunk);if(studio==null)a.api.bytes("PUT","/api/uploads/sessions/"+id+"/chunks/"+index,chunk,"application/octet-stream");else studioChunk(token,index,hashes.getString(index),name,mime,chunk);int percent=(index+1)*100/hashes.length();a.runOnUiThread(()->{a.progress.setIndeterminate(false);a.progress.setProgress(percent);});}}
            JSONObject complete=studio==null?a.api.request("POST","/api/uploads/sessions/"+id+"/complete",a.json()):a.api.request("POST","/api/studio/uploads",a.json("action","complete","token",token));JSONObject asset=complete.optJSONObject("asset");if(asset==null)throw new IOException("The server is still checking this file. Please retry to resume safely.");asset.put("name",name);
            if(mime!=null&&mime.startsWith("audio/")){android.media.MediaMetadataRetriever reader=new android.media.MediaMetadataRetriever();try{reader.setDataSource(local.getPath());long ms=Long.parseLong(reader.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION));asset.put("duration",String.format(Locale.ROOT,"%d:%02d",ms/60000,(ms/1000)%60));}catch(Exception ignored){}finally{reader.release();}}
            return asset;
        }finally{local.delete();a.runOnUiThread(()->a.progress.setIndeterminate(true));}
    }
    void studioChunk(String token,int index,String checksum,String filename,String mime,byte[] chunk)throws Exception{String boundary="HYMN"+UUID.randomUUID();ByteArrayOutputStream bytes=new ByteArrayOutputStream();for(String[] pair:new String[][]{{"token",token},{"index",String.valueOf(index)},{"checksum",checksum}})bytes.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\""+pair[0]+"\"\r\n\r\n"+pair[1]+"\r\n").getBytes(StandardCharsets.UTF_8));bytes.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\"chunk\"; filename=\"chunk.bin\"\r\nContent-Type: application/octet-stream\r\n\r\n").getBytes(StandardCharsets.UTF_8));bytes.write(chunk);bytes.write(("\r\n--"+boundary+"--\r\n").getBytes(StandardCharsets.UTF_8));a.api.bytes("POST","/api/studio/uploads",bytes.toByteArray(),"multipart/form-data; boundary="+boundary);}
}
