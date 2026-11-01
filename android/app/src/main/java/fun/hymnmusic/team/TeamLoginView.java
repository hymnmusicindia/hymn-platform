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
    final Button google;
    final TextView message;
    private final Activity activity;
    private final TeamPalette palette;
    TeamLoginView(Activity activity, boolean dark, Runnable signIn) {
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
        LinearLayout card=new LinearLayout(activity);card.setTag("team-login-card");card.setOrientation(LinearLayout.VERTICAL);card.setGravity(Gravity.CENTER_HORIZONTAL);card.setPadding(dp(24),dp(30),dp(24),dp(26));card.setBackground(shape(palette.card,palette.border,28));card.setElevation(dp(dark?2:5));
        center.addView(card,new FrameLayout.LayoutParams(-1,-2,Gravity.CENTER));
        ImageView logo=new ImageView(activity);logo.setImageResource(R.drawable.hymn_logo);logo.setScaleType(ImageView.ScaleType.FIT_CENTER);logo.setContentDescription("HYMN Music");logo.setPadding(dp(10),dp(10),dp(10),dp(10));logo.setBackground(shape(0xff080a0d,0,20));card.addView(logo,new LinearLayout.LayoutParams(dp(74),dp(74)));
        TextView eyebrow=label("HYMN TEAM OS",11,palette.muted,true);eyebrow.setLetterSpacing(.18f);add(card,eyebrow,18);
        TextView title=label("Your team.\nOne shared rhythm.",29,palette.text,true);title.setTag("team-login-title");title.setLineSpacing(dp(3),1);androidx.core.view.ViewCompat.setAccessibilityHeading(title,true);add(card,title,12);
        TextView subtitle=label("A little less switching.\nA lot more working together.",14,palette.muted,false);subtitle.setLineSpacing(dp(4),1);add(card,subtitle,12);
        LinearLayout features=new LinearLayout(activity);features.setGravity(Gravity.CENTER);features.setPadding(0,dp(16),0,dp(16));features.setBackground(shape(palette.elevated,0,16));
        String[] names={"Your work","Schedule","Team chat"};int[] icons={R.drawable.ic_workstation_nav,R.drawable.ic_calendar_nav,R.drawable.ic_chat_nav};
        for(int i=0;i<names.length;i++){LinearLayout item=new LinearLayout(activity);item.setOrientation(LinearLayout.VERTICAL);item.setGravity(Gravity.CENTER);ImageView icon=new ImageView(activity);icon.setImageResource(icons[i]);icon.setColorFilter(palette.text);item.addView(icon,new LinearLayout.LayoutParams(dp(20),dp(20)));TextView caption=label(names[i],11,palette.muted,false);LinearLayout.LayoutParams cp=new LinearLayout.LayoutParams(-1,-2);cp.topMargin=dp(7);item.addView(caption,cp);features.addView(item,new LinearLayout.LayoutParams(0,-2,1));}
        add(card,features,24);
        google=new Button(activity);google.setTag("team-google-sign-in");google.setText("Continue with Google");google.setAllCaps(false);google.setTextSize(14);google.setTypeface(Typeface.DEFAULT,Typeface.BOLD);google.setTextColor(0xff1f1f1f);google.setBackground(shape(0xffffffff,0xff747775,14));google.setPadding(dp(16),dp(14),dp(16),dp(14));google.setMinHeight(dp(54));
        android.graphics.drawable.Drawable mark=activity.getDrawable(R.drawable.google_g);mark.setBounds(0,0,dp(20),dp(20));google.setCompoundDrawablesRelative(mark,null,null,null);google.setCompoundDrawablePadding(dp(10));google.setGravity(Gravity.CENTER);google.setOnClickListener(v->signIn.run());LinearLayout.LayoutParams gp=new LinearLayout.LayoutParams(-1,-2);gp.topMargin=dp(24);card.addView(google,gp);
        message=label("",12,palette.muted,false);message.setTag("team-sign-in-status");message.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);message.setVisibility(View.GONE);add(card,message,12);
        TextView privacy=label("Use the Google account invited to your team.\nYour workspace stays private.",12,palette.muted,false);privacy.setLineSpacing(dp(3),1);add(card,privacy,18);
        TextView footer=label("HYMN MUSIC  /  TOGETHER IN SYNC",9,palette.muted,true);footer.setLetterSpacing(.12f);add(card,footer,26);
    }
    void status(String value,boolean error){message.setText(value);message.setTextColor(error?palette.error:palette.muted);message.setVisibility(value.isEmpty()?View.GONE:View.VISIBLE);message.setPadding(dp(12),dp(10),dp(12),dp(10));message.setBackground(error?shape(palette.errorSoft,0,12):null);}
    void busy(boolean busy){google.setEnabled(!busy);google.setAlpha(busy?.65f:1f);google.setText(busy?"Signing in…":"Continue with Google");}
    private int dp(float value){return Math.round(value*activity.getResources().getDisplayMetrics().density);}
    private TextView label(String value,float size,int color,boolean bold){TextView label=new TextView(activity);label.setText(value);label.setTextSize(size);label.setTextColor(color);label.setGravity(Gravity.CENTER);if(bold)label.setTypeface(Typeface.DEFAULT,Typeface.BOLD);return label;}
    private GradientDrawable shape(int color,int border,int radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));if(border!=0)d.setStroke(dp(1),border);return d;}
    private void add(LinearLayout parent,View child,int margin){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.topMargin=dp(margin);parent.addView(child,p);}
}
