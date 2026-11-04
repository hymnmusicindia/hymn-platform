package fun.hymnmusic.app;

import android.os.Handler;
import android.os.Looper;
import android.text.*;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.util.*;

/** Searchable native storefront with bounded rendering and independent artwork loading. */
final class NativeBeatStore {
    final MusicActivity a;
    JSONArray beats = new JSONArray();
    int limit = 24;
    LinearLayout results;
    EditText search;
    Spinner genre;
    final Handler handler = new Handler(Looper.getMainLooper());
    Runnable pending;
    NativeBeatStore(MusicActivity activity) { a = activity; }
    void open() {
        a.page("beats","Find your next sound.","Original beats. Clear licences. Yours to create with.");
        LinearLayout controls = a.card(a.body);
        search = a.field(controls,"Search beats, moods or producers","",android.text.InputType.TYPE_CLASS_TEXT);
        genre = a.select(controls,"Explore a genre",new String[]{"All genres"},"All genres");
        LinearLayout audio = a.row();
        audio.addView(a.secondary("Stop preview",a::stopAudio),new LinearLayout.LayoutParams(0,-2,1));
        if(a.api.signedIn()) { LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,-2,1);p.leftMargin=a.dp(8);audio.addView(a.secondary("Your purchases",a.desk::purchases),p); }
        controls.addView(audio);
        results = a.column();a.body.addView(results);
        a.get("/api/beats",data -> {
            beats=data.optJSONArray("beats");if(beats==null)beats=new JSONArray();
            TreeSet<String> genres=new TreeSet<>();for(int i=0;i<beats.length();i++)if(!beats.optJSONObject(i).optString("genre").isEmpty())genres.add(beats.optJSONObject(i).optString("genre"));
            ArrayList<String> options=new ArrayList<>();options.add("All genres");options.addAll(genres);
            ArrayAdapter<String> adapter=new ArrayAdapter<String>(a,android.R.layout.simple_spinner_dropdown_item,options){@Override public View getView(int p,View v,ViewGroup parent){TextView text=(TextView)super.getView(p,v,parent);text.setTextColor(a.palette.text);text.setTextSize(14);return text;}};
            genre.setAdapter(adapter);
            genre.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){public void onItemSelected(AdapterView<?> parent,View view,int index,long id){limit=24;render();}public void onNothingSelected(AdapterView<?> parent){}});
            search.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence value,int start,int count,int after){}public void afterTextChanged(Editable value){}public void onTextChanged(CharSequence value,int start,int before,int count){if(pending!=null)handler.removeCallbacks(pending);pending=()->{if(a.screen.equals("beats")){limit=24;render();}};handler.postDelayed(pending,180);}});
            render();
        });
    }
    void render() {
        results.removeAllViews();
        String q=search.getText().toString().trim().toLowerCase(Locale.ROOT),g=String.valueOf(genre.getSelectedItem());
        ArrayList<JSONObject> matches=new ArrayList<>();
        for(int i=0;i<beats.length();i++){JSONObject b=beats.optJSONObject(i);if(!g.equals("All genres")&&!b.optString("genre").equals(g))continue;String terms=(b.optString("title")+" "+b.optString("producerName")+" "+b.optString("genre")+" "+b.optString("mood")).toLowerCase(Locale.ROOT);if(terms.contains(q))matches.add(b);}
        TextView count=a.text(matches.size()+" sounds to explore",11,a.palette.muted,false);results.addView(count);a.space(results,12);
        int columns=a.getResources().getDisplayMetrics().widthPixels/a.getResources().getDisplayMetrics().density>=360?2:1;
        int width=(int)(a.getResources().getDisplayMetrics().widthPixels/a.getResources().getDisplayMetrics().density-40-(columns-1)*12)/columns;
        LinearLayout row=null;
        for(int i=0;i<Math.min(limit,matches.size());i++) {
            if(i%columns==0){row=a.row();row.setGravity(Gravity.TOP);results.addView(row);}
            JSONObject beat=matches.get(i);LinearLayout c=a.column();c.setPadding(a.dp(9),a.dp(9),a.dp(9),a.dp(12));c.setBackground(a.shape(a.palette.surface,18));
            LinearLayout.LayoutParams card=new LinearLayout.LayoutParams(0,-2,1);card.bottomMargin=a.dp(12);if(i%columns>0)card.leftMargin=a.dp(12);row.addView(c,card);
            FrameLayout cover=new FrameLayout(a);cover.setBackground(a.shape(a.palette.surface,12));cover.setClipToOutline(true);
            cover.addView(NativeArtwork.view(a,beat.optString("artworkUrl"),width-18),new FrameLayout.LayoutParams(-1,-1));
            TextView preview=a.button("▶",()->a.play("/api/beats/"+beat.optInt("id")+"/audio"));preview.setContentDescription("Preview "+beat.optString("title"));preview.setPadding(0,0,0,0);preview.setBackground(a.shape(0xffe6d2a3,26));preview.setTextColor(0xff17242a);
            FrameLayout.LayoutParams play=new FrameLayout.LayoutParams(a.dp(48),a.dp(48),Gravity.BOTTOM|Gravity.END);play.setMargins(a.dp(8),a.dp(8),a.dp(8),a.dp(8));cover.addView(preview,play);c.addView(cover,new LinearLayout.LayoutParams(-1,a.dp(width-18)));
            a.space(c,12);TextView title=a.text(beat.optString("title"),16,a.palette.text,true);title.setMaxLines(2);title.setEllipsize(TextUtils.TruncateAt.END);c.addView(title);
            TextView producer=a.text(beat.optString("producerName"),10,a.palette.muted,false);producer.setMaxLines(1);producer.setEllipsize(TextUtils.TruncateAt.END);c.addView(producer);a.space(c,6);
            c.addView(a.text(beat.optString("genre")+" · "+beat.optInt("bpm")+" BPM",10,a.palette.muted,false));a.space(c,12);
            double price=beat.optDouble("generalPrice");if(price<=0)price=beat.optDouble("price");c.addView(a.text("From "+a.desk.money(price),13,a.palette.text,true));a.space(c,8);
            c.addView(a.secondary("View licences  ↗",()->a.desk.beat(beat)));
        }
        if(row!=null&&columns>1&&Math.min(limit,matches.size())%columns!=0)row.addView(new View(a),new LinearLayout.LayoutParams(0,1,1));
        if(matches.isEmpty())results.addView(a.text("No matches yet. Try another mood, artist or genre.",14,a.palette.muted,false));
        if(matches.size()>limit)results.addView(a.secondary("Explore more sounds",()->{limit+=24;render();}));
    }
}
