package fun.hymnmusic.team;

import android.app.Activity;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.*;

/** Centered, scrollable entry screen; system insets are owned by TeamSafeArea. */
final class TeamLoginView {
    final ScrollView view;
    final Button primary;
    final TextView message;
    private final Activity activity;
    private final TeamPalette palette;
    final FrameLayout card;
    final LinearLayout contents;
    final TeamLoadingView loading;
    private final ImageView headerLogo;
    private final Button browser,details;
    private boolean working;
    TeamEmailSignInView emailSignIn;
    TeamLoginView(Activity activity, boolean dark, Runnable signIn) {
        this(activity,dark,signIn,()->{},()->{});
    }
    TeamLoginView(Activity activity,boolean dark,Runnable signIn,Runnable openBrowser,Runnable copyDetails) {
        this.activity=activity;palette=new TeamPalette(dark);
        view=new ScrollView(activity);view.setTag("team-login");view.setFillViewport(true);view.setClipToPadding(false);view.setVerticalScrollBarEnabled(false);
        view.setBackground(new GradientDrawable(GradientDrawable.Orientation.TL_BR,new int[]{palette.elevated,palette.background,palette.background}));
        FrameLayout center=new FrameLayout(activity){
            @Override protected void onMeasure(int widthSpec,int heightSpec){
                if(getChildCount()>0){android.view.ViewGroup.LayoutParams p=getChildAt(0).getLayoutParams();int width=Math.min(dp(440),Math.max(0,MeasureSpec.getSize(widthSpec)-getPaddingLeft()-getPaddingRight()));if(p.width!=width){p.width=width;getChildAt(0).setLayoutParams(p);}}
                super.onMeasure(widthSpec,heightSpec);
            }
        };
        center.setPadding(dp(20),dp(28),dp(20),dp(28));view.addView(center,new ScrollView.LayoutParams(-1,-2));
        card=new FrameLayout(activity);card.setTag("team-login-card");card.setBackground(shape(palette.card,palette.border,28));card.setElevation(dp(dark?2:5));center.addView(card,new FrameLayout.LayoutParams(-1,-2,Gravity.CENTER));
        contents=new LinearLayout(activity);contents.setOrientation(LinearLayout.VERTICAL);contents.setGravity(Gravity.CENTER_HORIZONTAL);contents.setPadding(dp(24),dp(30),dp(24),dp(26));card.addView(contents,new FrameLayout.LayoutParams(-1,-2));
        ImageView logo=headerLogo=new ImageView(activity);logo.setImageResource(R.drawable.hymn_logo);logo.setScaleType(ImageView.ScaleType.FIT_CENTER);logo.setContentDescription("HYMN Music");logo.setPadding(dp(10),dp(10),dp(10),dp(10));logo.setBackground(shape(0xff080a0d,0,20));contents.addView(logo,new LinearLayout.LayoutParams(dp(74),dp(74)));
        TextView eyebrow=label("HYMN TEAM OS",11,palette.muted,true);eyebrow.setLetterSpacing(.18f);add(contents,eyebrow,18);
        TextView title=label("Your team.\nOne shared rhythm.",29,palette.text,true);title.setTag("team-login-title");title.setLineSpacing(dp(3),1);androidx.core.view.ViewCompat.setAccessibilityHeading(title,true);add(contents,title,12);
        TextView subtitle=label("A little less switching.\nA lot more working together.",14,palette.muted,false);subtitle.setLineSpacing(dp(4),1);add(contents,subtitle,12);
        LinearLayout features=new LinearLayout(activity);features.setGravity(Gravity.CENTER);features.setPadding(0,dp(16),0,dp(16));features.setBackground(shape(palette.elevated,0,16));
        String[] names={"Your work","Schedule","Team chat"};int[] icons={R.drawable.ic_workstation_nav,R.drawable.ic_calendar_nav,R.drawable.ic_chat_nav};
        for(int i=0;i<names.length;i++){LinearLayout item=new LinearLayout(activity);item.setOrientation(LinearLayout.VERTICAL);item.setGravity(Gravity.CENTER);ImageView icon=new ImageView(activity);icon.setImageResource(icons[i]);icon.setColorFilter(palette.text);item.addView(icon,new LinearLayout.LayoutParams(dp(20),dp(20)));TextView caption=label(names[i],11,palette.muted,false);LinearLayout.LayoutParams cp=new LinearLayout.LayoutParams(-1,-2);cp.topMargin=dp(7);item.addView(caption,cp);features.addView(item,new LinearLayout.LayoutParams(0,-2,1));}
        add(contents,features,24);
        primary=new Button(activity);primary.setTag("team-email-start");primary.setText("Continue with email");primary.setAllCaps(false);primary.setTextSize(14);primary.setTypeface(Typeface.DEFAULT,Typeface.BOLD);primary.setTextColor(palette.accentForeground);primary.setBackground(shape(palette.accent,palette.accent,14));primary.setMinHeight(dp(54));primary.setOnClickListener(v->signIn.run());LinearLayout.LayoutParams gp=new LinearLayout.LayoutParams(-1,-2);gp.topMargin=dp(24);contents.addView(primary,gp);
        message=label("",12,palette.muted,false);message.setTag("team-sign-in-status");message.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);message.setVisibility(View.GONE);add(contents,message,12);
        browser=new Button(activity);browser.setText("Open Team OS in browser");browser.setAllCaps(false);browser.setTextSize(13);browser.setTextColor(palette.text);browser.setBackground(shape(palette.elevated,palette.border,12));browser.setMinHeight(dp(48));browser.setVisibility(View.GONE);browser.setOnClickListener(v->openBrowser.run());add(contents,browser,12);
        details=new Button(activity);details.setText("Copy sign-in details");details.setAllCaps(false);details.setTextSize(12);details.setTextColor(palette.muted);details.setBackgroundColor(android.graphics.Color.TRANSPARENT);details.setMinHeight(dp(48));details.setVisibility(View.GONE);details.setOnClickListener(v->copyDetails.run());add(contents,details,4);
        TextView privacy=label("Use the email address invited to your team.\nYour workspace stays private.",12,palette.muted,false);privacy.setLineSpacing(dp(3),1);add(contents,privacy,18);
        TextView footer=label("HYMN MUSIC  /  TOGETHER IN SYNC",9,palette.muted,true);footer.setLetterSpacing(.12f);add(contents,footer,26);
        loading=new TeamLoadingView(activity,palette);loading.setVisibility(View.GONE);card.addView(loading,new FrameLayout.LayoutParams(-1,-1));
    }
    void status(String value,boolean error){if(working){loading.setContentDescription(value);loading.announceForAccessibility(value);return;}message.setText(value);message.setTextColor(error?palette.error:palette.muted);message.setVisibility(value.isEmpty()?View.GONE:View.VISIBLE);message.setPadding(dp(12),dp(10),dp(12),dp(10));message.setBackground(error?shape(palette.errorSoft,0,12):null);}
    void busy(boolean busy){
        if(working==busy)return;working=busy;primary.setEnabled(!busy);
        if(busy){
            int[] source=new int[2],target=new int[2];headerLogo.getLocationInWindow(source);card.getLocationInWindow(target);
            float offset=source[1]+headerLogo.getHeight()/2f-(target[1]+card.getHeight()/2f);
            contents.setVisibility(View.INVISIBLE);contents.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
            loading.setVisibility(View.VISIBLE);loading.enter(card.getHeight()>0?offset:0);
        }else{
            loading.stop();loading.setVisibility(View.GONE);contents.setVisibility(View.VISIBLE);contents.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
        }
    }
    void recovery(){browser.setVisibility(View.VISIBLE);details.setVisibility(View.VISIBLE);}

    void enableEmailSignIn(TeamEmailSignInView.Actions actions){
        if(emailSignIn!=null)return;
        emailSignIn=new TeamEmailSignInView(activity,palette,actions);emailSignIn.setVisibility(View.GONE);
        primary.setOnClickListener(v->{primary.setVisibility(View.GONE);emailSignIn.setVisibility(View.VISIBLE);status("",false);});
        int index=contents.indexOfChild(primary);
        LinearLayout.LayoutParams formParams=new LinearLayout.LayoutParams(-1,-2);formParams.topMargin=dp(18);contents.addView(emailSignIn,index+1,formParams);
    }

    private int dp(float value){return Math.round(value*activity.getResources().getDisplayMetrics().density);}
    private TextView label(String value,float size,int color,boolean bold){TextView label=new TextView(activity);label.setText(value);label.setTextSize(size);label.setTextColor(color);label.setGravity(Gravity.CENTER);if(bold)label.setTypeface(Typeface.DEFAULT,Typeface.BOLD);return label;}
    private GradientDrawable shape(int color,int border,int radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));if(border!=0)d.setStroke(dp(1),border);return d;}
    private void add(LinearLayout parent,View child,int margin){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.topMargin=dp(margin);parent.addView(child,p);}
}
