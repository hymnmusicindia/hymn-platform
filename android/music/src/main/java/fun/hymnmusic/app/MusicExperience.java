package fun.hymnmusic.app;

import android.app.Dialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.ColorDrawable;
import android.content.res.ColorStateList;
import android.graphics.drawable.RippleDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.*;
import org.json.*;
import java.util.Locale;

/** Native HYMN editorial home, product navigation and expandable workspace menu. */
final class MusicExperience {
    final MusicActivity a;
    MusicExperience(MusicActivity activity) { a = activity; }

    void navigate(Runnable action) {
        if (a.screen.equals("release-editor") && a.distribution.metadata != null) a.distribution.collect();
        action.run();
    }

    LinearLayout.LayoutParams weighted() { return new LinearLayout.LayoutParams(0, -2, 1); }
    void label(LinearLayout parent, String text) {
        TextView t = a.text(text.toUpperCase(Locale.ROOT), 10, a.palette.muted, true);
        t.setLetterSpacing(.17f);
        parent.addView(t);
    }
    TextView touch(String label, Runnable action) {
        TextView t = a.text(label, 13, a.palette.text, true);
        t.setGravity(Gravity.CENTER);
        t.setPadding(a.dp(12), a.dp(10), a.dp(12), a.dp(10));
        t.setMinHeight(a.dp(48));
        t.setFocusable(true);
        t.setContentDescription(label);
        t.setBackground(new RippleDrawable(ColorStateList.valueOf(0x226f7b89), a.shape(a.palette.surface, 14), null));
        t.setOnClickListener(v -> navigate(action));
        return t;
    }

    void header() {
        a.header.removeAllViews();
        a.header.setOrientation(LinearLayout.VERTICAL);
        a.header.setPadding(a.dp(16), a.dp(6), a.dp(16), a.dp(4));
        LinearLayout top = a.row();
        TextView menu = touch("☰", this::menu);
        menu.setTextSize(23);
        menu.setContentDescription("Open navigation menu");
        top.addView(menu, new LinearLayout.LayoutParams(a.dp(48), a.dp(48)));
        LinearLayout identity = a.row();
        identity.setGravity(Gravity.CENTER);
        ImageView mark = new ImageView(a);
        mark.setImageResource(R.drawable.hymn_logo);
        identity.addView(mark, new LinearLayout.LayoutParams(a.dp(27), a.dp(27)));
        TextView brand = a.text("HYMN", 17, a.palette.text, true);
        brand.setLetterSpacing(.08f);
        brand.setPadding(a.dp(8), 0, 0, 0);
        identity.addView(brand);
        identity.setContentDescription("HYMN Music home");
        identity.setOnClickListener(v -> navigate(a::home));
        top.addView(identity, weighted());
        TextView profile = touch(a.api.signedIn() ? a.initials() : "Sign in", () -> {
            if (a.api.signedIn()) a.desk.account(); else a.signIn();
        });
        profile.setContentDescription("Profile and settings");
        top.addView(profile);
        a.header.addView(top);
        LinearLayout products = a.row();
        LinearLayout.LayoutParams left = weighted();
        left.rightMargin = a.dp(5);
        products.addView(touch("Distribution  ⌄", () -> product("Distribution")), left);
        LinearLayout.LayoutParams right = weighted();
        right.leftMargin = a.dp(5);
        products.addView(touch("Beat Store  ⌄", () -> product("Beat Store")), right);
        a.header.addView(products);
    }

    void bottom() {
        a.nav.removeAllViews();
        a.nav.setBackgroundColor(a.palette.surface);
        a.nav.setPadding(a.dp(8), a.dp(5), a.dp(8), a.dp(5));
        String[] names = {"Home", "Releases", "Beats", "Studio", "More"};
        String[] icons = {"⌂", "♫", "◉", "≋", "•••"};
        for (int i = 0; i < names.length; i++) {
            final int item = i;
            LinearLayout tab = a.column();
            tab.setGravity(Gravity.CENTER);
            tab.setMinimumHeight(a.dp(52));
            TextView icon = a.text(icons[i], 21, a.palette.muted, true);
            icon.setGravity(Gravity.CENTER);
            tab.addView(icon);
            TextView name = a.text(names[i], 10, a.palette.muted, true);
            name.setGravity(Gravity.CENTER);
            tab.addView(name);
            tab.setContentDescription(names[i]);
            tab.setFocusable(true);
            tab.setOnClickListener(v -> navigate(() -> {
                switch (item) {
                    case 0: a.home(); break;
                    case 1: a.releases(); break;
                    case 2: a.desk.beats(); break;
                    case 3: a.desk.studio(); break;
                    default: menu();
                }
            }));
            a.nav.addView(tab, weighted());
        }
    }

    void selection() {
        for (int i = 0; i < a.nav.getChildCount(); i++) {
            boolean active = i == 0 ? a.screen.equals("home") : i == 1 ? a.screen.contains("release") :
                i == 2 ? a.screen.contains("beat") || a.screen.equals("purchases") :
                i == 3 ? a.screen.contains("studio") : false;
            LinearLayout tab = (LinearLayout) a.nav.getChildAt(i);
            tab.setBackground(active ? a.shape(a.dark ? 0xff26323c : 0xffebe8e0, 14) : null);
            for (int n = 0; n < tab.getChildCount(); n++)
                ((TextView) tab.getChildAt(n)).setTextColor(active ? a.palette.text : a.palette.muted);
        }
    }

    // Store content directly; no dependence on a device manufacturer's dialog hierarchy.
    LinearLayout currentDrawer;
    Dialog open(String title) {
        Dialog d = new Dialog(a);
        d.requestWindowFeature(Window.FEATURE_NO_TITLE);
        ScrollView scroll = new ScrollView(a);
        LinearLayout box = a.column();
        box.setPadding(a.dp(20), a.dp(28), a.dp(20), a.dp(32));
        box.setBackgroundColor(a.palette.background);
        scroll.addView(box);
        d.setContentView(scroll);
        Window w = d.getWindow();
        w.setBackgroundDrawable(new ColorDrawable(a.palette.background));
        w.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
        w.setDimAmount(.55f);
        w.setGravity(Gravity.START);
        d.show();
        w.setLayout(Math.min(a.dp(360), (int)(a.getResources().getDisplayMetrics().widthPixels*.93)), -1);
        currentDrawer = box;
        LinearLayout row = a.row();
        row.addView(a.text(title, 24, a.palette.text, true), weighted());
        row.addView(touch("✕", d::dismiss));
        box.addView(row);
        a.space(box, 8);
        box.addView(a.text("Your music. Your next chapter.", 12, a.palette.muted, false));
        a.space(box, 22);
        return d;
    }
    void item(LinearLayout box, Dialog d, String title, Runnable next) {
        TextView t = a.text(title, 14, a.palette.text, false);
        t.setPadding(a.dp(12), a.dp(14), a.dp(12), a.dp(14));
        t.setMinHeight(a.dp(48));
        t.setFocusable(true);
        t.setOnClickListener(v -> { d.dismiss(); navigate(next); });
        box.addView(t);
    }
    void group(LinearLayout box, Dialog d, String name, boolean expanded) {
        LinearLayout shell = a.column();
        shell.setBackground(a.shape(a.palette.surface, 16));
        LinearLayout.LayoutParams size = new LinearLayout.LayoutParams(-1, -2);
        size.bottomMargin = a.dp(10);
        box.addView(shell, size);
        TextView heading = a.text(name + (expanded ? "  −" : "  +"), 15, a.palette.text, true);
        heading.setPadding(a.dp(14), a.dp(16), a.dp(14), a.dp(16));
        heading.setMinHeight(a.dp(52));
        heading.setContentDescription(name + " menu");
        heading.setFocusable(true);
        shell.addView(heading);
        LinearLayout links = a.column();
        links.setPadding(a.dp(6), 0, a.dp(6), a.dp(8));
        populate(links, d, name);
        links.setVisibility(expanded ? View.VISIBLE : View.GONE);
        shell.addView(links);
        heading.setOnClickListener(v -> {
            boolean show = links.getVisibility() != View.VISIBLE;
            links.setVisibility(show ? View.VISIBLE : View.GONE);
            heading.setText(name + (show ? "  −" : "  +"));
        });
    }
    void populate(LinearLayout box, Dialog d, String name) {
        switch (name) {
            case "Distribution":
                item(box,d,"Create a release",()->{if(a.signed())a.distribution.start();});
                item(box,d,"Your catalogue & corrections",a::releases);
                item(box,d,"Artist profiles",a.desk::artists);
                item(box,d,"Plans & artist slots",a.desk::plans);
                item(box,d,"Private audio library",a.desk::library); break;
            case "Beat Store":
                item(box,d,"Explore beats",a.desk::beats);
                item(box,d,"Purchases & licences",a.desk::purchases);
                item(box,d,"Stop audio",a::stopAudio); break;
            case "Studio & playlists":
                item(box,d,"Mixing & mastering",a.desk::studio);
                item(box,d,"Your Studio projects",()->a.desk.studioOrders(""));
                item(box,d,"Playlist listening & feedback",a.desk::playlists); break;
            case "Your circle":
                item(box,d,"Referral link & earnings",a.desk::referrals);
                item(box,d,"Referral tree",()->{if(a.signed())a.desk.referralNetwork();});
                item(box,d,"Earnings calculator",a.desk::calculator);
                item(box,d,"Conversations",()->{if(a.signed())a.desk.referralChats();}); break;
            default:
                item(box,d,"Your profile & appearance",a.desk::account);
                item(box,d,"Notifications",a.desk::notifications);
                item(box,d,"Earnings & payouts",a.desk::payouts);
                item(box,d,"Orders & receipts",()->{if(a.signed())a.desk.orders();});
                item(box,d,"Help & support",a.desk::support);
        }
    }
    void menu() {
        Dialog d = open("HYMN / MUSIC");
        LinearLayout content = currentDrawer;
        for (String section : new String[]{"Distribution","Beat Store","Studio & playlists","Your circle","Your account"})
            group(content,d,section,false);
        item(content,d,"Back to home",a::home);
    }
    void product(String name) {
        Dialog d = open(name);
        populate(currentDrawer,d,name);
    }

    LinearLayout darkCard(LinearLayout parent) {
        LinearLayout c = a.card(parent);
        c.setBackground(a.shape(0xff142329, 22));
        c.setPadding(a.dp(20), a.dp(24), a.dp(20), a.dp(24));
        return c;
    }
    void home() {
        a.page("home", "", "");
        label(a.body, a.api.signedIn() ? "YOUR HYMN, IN SYNC" : "INDEPENDENT BY DESIGN");
        a.space(a.body, 12);
        FrameLayout hero = new FrameLayout(a);
        hero.setBackground(a.shape(0xff17242a,24));
        hero.setClipToOutline(true);
        ImageView image = NativeArtwork.view(a,"/images/home-hero-640.webp",370);
        hero.addView(image,new FrameLayout.LayoutParams(-1,-1));
        View shade = new View(a);
        shade.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
            new int[]{0x55202b30,0xb310191f,0xff10191f}));
        hero.addView(shade,new FrameLayout.LayoutParams(-1,-1));
        LinearLayout copy = a.column();
        copy.setPadding(a.dp(24),a.dp(28),a.dp(24),a.dp(24));
        TextView eyebrow = a.text("MADE FOR YOUR NEXT CHAPTER",10,0xffe6d2a3,true);
        eyebrow.setLetterSpacing(.15f);
        copy.addView(eyebrow);
        a.space(copy,30);
        TextView title = a.text("Your sound.\nYour story.\nYour HYMN.",38,Color.WHITE,true);
        title.setLineSpacing(0,.98f);
        copy.addView(title);
        a.space(copy,14);
        copy.addView(a.text("From your first idea to your next release.",13,0xffd5dce1,false));
        a.space(copy,24);
        TextView start = a.button("Release your music  ↗",()->{if(a.signed())a.distribution.start();});
        start.setBackground(a.shape(0xffe6d2a3,14));
        start.setTextColor(0xff17242a);
        copy.addView(start);
        hero.addView(copy,new FrameLayout.LayoutParams(-1,-2));
        a.body.addView(hero,new LinearLayout.LayoutParams(-1,-2));
        a.space(a.body,20);
        LinearLayout shortcuts = a.row();
        feature(shortcuts,"01 / DISTRIBUTION","Make it\nworldwide.",a::releases);
        feature(shortcuts,"02 / BEAT STORE","Find your\nnext sound.",a.desk::beats);
        a.body.addView(shortcuts);
        a.space(a.body,20);
        LinearLayout showcase = darkCard(a.body);
        TextView tag = a.text("#RELEASEDONHYMN",10,0xffafc8ca,true);
        tag.setLetterSpacing(.18f);
        showcase.addView(tag);
        a.space(showcase,12);
        showcase.addView(a.text("Yes, these releases\nmoved through HYMN.",25,Color.WHITE,true));
        a.space(showcase,8);
        showcase.addView(a.text("Independent artists. Real releases. Your next chapter belongs here.",12,0xffbecdd0,false));
        a.space(showcase,20);
        LinearLayout releaseShelf = a.column();
        showcase.addView(releaseShelf);
        showcase.addView(whiteLink("Your next release is waiting  ↗",()->{if(a.signed())a.distribution.start();}));
        a.space(a.body,10);
        LinearLayout beatShelf = a.column();
        a.body.addView(beatShelf);
        LinearLayout studio = darkCard(a.body);
        studio.addView(NativeArtwork.view(a,"/home-studio.jpg",170),new LinearLayout.LayoutParams(-1,a.dp(170)));
        a.space(studio,18);
        studio.addView(a.text("Your sound.\nRelease-ready.",28,Color.WHITE,true));
        a.space(studio,8);
        studio.addView(a.text("Mixing and mastering, with people who hear your vision.",13,0xffc8d4d8,false));
        a.space(studio,12);
        studio.addView(whiteLink("Explore Studio  ↗",a.desk::studio));
        if(a.api.signedIn()) {
            a.tile("Your workspace","Releases, earnings and updates — all together.",a.desk::account);
            if(!a.api.saved("pending-payment").isEmpty())a.tile("Payment confirmation","Continue verification without paying again",a::retryPayment);
        }
        a.space(a.body,12);
        TextView footer=a.text("HYMN MUSIC  /  CREATE YOUR NEXT CHAPTER",9,a.palette.muted,true);
        footer.setLetterSpacing(.1f);footer.setGravity(Gravity.CENTER);a.body.addView(footer);
        JSONObject saved=null;
        try { if(!a.api.saved("public-home").isEmpty())saved=new JSONObject(a.api.saved("public-home")); } catch(Exception ignored) {}
        if(saved!=null)renderPublic(saved,releaseShelf,beatShelf);
        int current=a.epoch;
        a.workers.execute(()->{try{JSONObject data=a.api.request("GET","/api/customer-app/home",null);a.api.save("public-home",data.toString());a.runOnUiThread(()->{if(a.epoch==current&&!a.isFinishing())renderPublic(data,releaseShelf,beatShelf);});}catch(Exception ignored){a.runOnUiThread(()->{if(a.epoch==current&&releaseShelf.getChildCount()==0)releaseShelf.addView(a.text("Music finds its way here. Explore HYMN's release tools to begin.",12,0xffbecdd0,false));});}});
    }
    TextView whiteLink(String title,Runnable next) {
        TextView link=touch(title,next);
        link.setTextColor(0xffe6d2a3);
        link.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);
        link.setBackgroundColor(Color.TRANSPARENT);
        return link;
    }
    void feature(LinearLayout parent,String eyebrow,String title,Runnable next) {
        LinearLayout card=a.column();
        card.setPadding(a.dp(16),a.dp(20),a.dp(16),a.dp(18));
        card.setBackground(a.shape(a.palette.surface,18));
        TextView small=a.text(eyebrow,9,a.palette.muted,true);
        small.setLetterSpacing(.08f);card.addView(small);
        a.space(card,12);card.addView(a.text(title,22,a.palette.text,true));
        a.space(card,14);card.addView(a.text("Explore  ↗",12,a.palette.text,true));
        LinearLayout.LayoutParams p=weighted();if(parent.getChildCount()==0)p.rightMargin=a.dp(6);else p.leftMargin=a.dp(6);
        parent.addView(card,p);card.setContentDescription(eyebrow+": "+title);card.setOnClickListener(v->navigate(next));
    }
    void renderPublic(JSONObject data,LinearLayout releases,LinearLayout beats) {
        releases.removeAllViews();beats.removeAllViews();
        JSONArray rows=data.optJSONArray("releases");
        if(rows!=null&&rows.length()>0) {
            HorizontalScrollView scroll=new HorizontalScrollView(a);scroll.setHorizontalScrollBarEnabled(false);
            scroll.setClipToPadding(false);LinearLayout line=a.row();line.setPadding(a.dp(3),a.dp(8),a.dp(3),a.dp(14));
            for(int i=0;i<Math.min(rows.length(),12);i++) {
                JSONObject r=rows.optJSONObject(i);LinearLayout card=a.column();card.setBackground(a.shape(0xff20343c,14));
                card.setClipToOutline(true);card.setRotation(i%2==0?-3:3);
                card.addView(NativeArtwork.view(a,r.optString("artworkUrl"),142),new LinearLayout.LayoutParams(a.dp(142),a.dp(142)));
                TextView title=a.text(r.optString("title"),11,Color.WHITE,true);title.setMaxLines(1);title.setEllipsize(android.text.TextUtils.TruncateAt.END);title.setPadding(a.dp(10),a.dp(10),a.dp(10),0);card.addView(title);
                TextView artist=a.text(r.optString("artistName"),10,0xffb7cbd0,false);artist.setMaxLines(1);artist.setPadding(a.dp(10),a.dp(3),a.dp(10),a.dp(12));card.addView(artist);
                LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(a.dp(142),-2);p.rightMargin=a.dp(14);line.addView(card,p);
                card.setContentDescription(r.optString("title")+" by "+r.optString("artistName"));
            }
            scroll.addView(line);releases.addView(scroll);
        }
        JSONArray catalogue=data.optJSONArray("beats");
        if(catalogue!=null&&catalogue.length()>0) {
            label(beats,"A NEW SOUND. A NEW BEGINNING.");a.space(beats,10);
            beats.addView(a.text("Find your next sound.",26,a.palette.text,true));a.space(beats,16);
            HorizontalScrollView scroller=new HorizontalScrollView(a);scroller.setHorizontalScrollBarEnabled(false);LinearLayout line=a.row();
            for(int i=0;i<catalogue.length();i++) {
                JSONObject b=catalogue.optJSONObject(i);LinearLayout card=a.column();card.setPadding(a.dp(10),a.dp(10),a.dp(10),a.dp(12));card.setBackground(a.shape(a.palette.surface,16));
                card.addView(NativeArtwork.view(a,b.optString("artworkUrl"),150),new LinearLayout.LayoutParams(a.dp(150),a.dp(150)));
                a.space(card,10);TextView title=a.text(b.optString("title"),15,a.palette.text,true);title.setMaxLines(1);card.addView(title);
                card.addView(a.text(b.optString("genre")+" / "+b.optInt("bpm")+" BPM",10,a.palette.muted,false));a.space(card,8);
                card.addView(a.text(a.desk.money(b.optDouble("price"))+"  ↗",12,a.palette.text,true));
                LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(a.dp(170),-2);p.rightMargin=a.dp(12);line.addView(card,p);card.setOnClickListener(v->a.desk.beats());
            }
            scroller.addView(line);beats.addView(scroller);a.space(beats,22);
        }
    }
}
