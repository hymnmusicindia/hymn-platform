package fun.hymnmusic.team;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.animation.LinearInterpolator;
import android.view.animation.PathInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;

/** Logo stays still inside the progress arc; only the entry transition moves it. */
final class TeamLoadingView extends FrameLayout {
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF circle=new RectF();
    private final TeamPalette palette;
    final ImageView logo;
    private ValueAnimator animator;
    private float phase;
    TeamLoadingView(Context context,TeamPalette palette){
        super(context);this.palette=palette;setTag("team-login-loading");setWillNotDraw(false);
        setContentDescription("Signing in to HYMN");setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
        logo=new ImageView(context);logo.setImageResource(R.drawable.hymn_logo);logo.setScaleType(ImageView.ScaleType.FIT_CENTER);logo.setPadding(dp(10),dp(10),dp(10),dp(10));
        GradientDrawable tile=new GradientDrawable();tile.setColor(0xff080a0d);tile.setCornerRadius(dp(20));logo.setBackground(tile);logo.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        addView(logo,new FrameLayout.LayoutParams(dp(74),dp(74),Gravity.CENTER));
    }
    void enter(float offset){
        logo.animate().cancel();logo.setTranslationY(ValueAnimator.areAnimatorsEnabled()?offset:0);
        if(ValueAnimator.areAnimatorsEnabled())logo.animate().translationY(0).setDuration(420).setInterpolator(new PathInterpolator(.2f,0,0,1)).start();
        startRing();
    }
    private void startRing(){
        if(animator!=null||!isAttachedToWindow()||getVisibility()!=VISIBLE||!ValueAnimator.areAnimatorsEnabled())return;
        animator=ValueAnimator.ofFloat(0,1);animator.setDuration(1450);animator.setRepeatCount(ValueAnimator.INFINITE);animator.setInterpolator(new LinearInterpolator());animator.addUpdateListener(value->{phase=(float)value.getAnimatedValue();invalidate();});animator.start();
    }
    void stop(){if(animator!=null){animator.cancel();animator=null;}logo.animate().cancel();logo.setTranslationY(0);}
    @Override protected void onAttachedToWindow(){super.onAttachedToWindow();startRing();}
    @Override protected void onDetachedFromWindow(){stop();super.onDetachedFromWindow();}
    @Override protected void onWindowVisibilityChanged(int visibility){super.onWindowVisibilityChanged(visibility);if(visibility==VISIBLE)startRing();else if(logo!=null)stop();}
    @Override protected void onVisibilityChanged(View changed,int visibility){super.onVisibilityChanged(changed,visibility);if(visibility==VISIBLE)startRing();else if(logo!=null)stop();}
    @Override public void onInitializeAccessibilityNodeInfo(AccessibilityNodeInfo info){super.onInitializeAccessibilityNodeInfo(info);info.setClassName("android.widget.ProgressBar");}
    @Override protected void onDraw(Canvas canvas){
        super.onDraw(canvas);float radius=Math.min(dp(88),Math.min(getWidth(),getHeight())/2f-dp(16));if(radius<=0)return;
        float x=getWidth()/2f,y=getHeight()/2f;circle.set(x-radius,y-radius,x+radius,y+radius);
        paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(dp(2));paint.setStrokeCap(Paint.Cap.ROUND);paint.setColor(palette.border);canvas.drawCircle(x,y,radius,paint);
        paint.setColor(palette.accent);paint.setStrokeWidth(dp(3));float sweep=ValueAnimator.areAnimatorsEnabled()?125+65*(float)Math.sin(phase*Math.PI*2):250;canvas.drawArc(circle,-90+phase*360,sweep,false,paint);
    }
    private int dp(float size){return Math.round(size*getResources().getDisplayMetrics().density);}
}
