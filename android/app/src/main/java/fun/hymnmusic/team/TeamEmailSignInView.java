package fun.hymnmusic.team;

import android.app.Activity;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.InputFilter;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.*;

/** Native email verification. Codes and challenges live only in this screen's memory. */
final class TeamEmailSignInView extends LinearLayout {
    interface Actions { void request(String email); void verify(String email,String challenge,String code); }
    final EditText email,code;
    final Button submit,change;
    private final TextView hint;
    private final Activity activity;
    private final TeamPalette palette;
    private final Actions actions;
    private String challenge="",requestedEmail="";
    private long resendAt,expiresAt;
    TeamEmailSignInView(Activity activity,TeamPalette palette,Actions actions) {
        super(activity);this.activity=activity;this.palette=palette;this.actions=actions;
        setOrientation(VERTICAL);setTag("team-email-sign-in");setGravity(Gravity.CENTER_HORIZONTAL);
        hint=new TextView(activity);hint.setText("Sign in with your team email. No Google Play services needed.");hint.setTextColor(palette.muted);hint.setTextSize(12);hint.setGravity(Gravity.CENTER);add(hint,0);
        email=field("Team email",InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);email.setTag("team-sign-in-email");email.setAutofillHints(View.AUTOFILL_HINT_EMAIL_ADDRESS);email.setFilters(new InputFilter[]{new InputFilter.LengthFilter(254)});add(email,12);
        code=field("6-digit verification code",InputType.TYPE_CLASS_NUMBER);code.setTag("team-sign-in-code");code.setFilters(new InputFilter[]{new InputFilter.LengthFilter(6)});code.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);code.setVisibility(GONE);add(code,12);
        submit=button("Send sign-in code",true);submit.setTag("team-email-submit");submit.setOnClickListener(v->submit());add(submit,12);
        change=button("Change email",false);change.setVisibility(GONE);change.setOnClickListener(v->reset());add(change,4);
        Button resend=button("Send a new code",false);resend.setTag("team-email-resend");resend.setVisibility(GONE);resend.setOnClickListener(v->{if(android.os.SystemClock.elapsedRealtime()<resendAt){hint.setText("Please wait a minute before requesting another code.");return;}actions.request(requestedEmail);});add(resend,0);
    }
    private void submit(){
        String value=email.getText().toString().trim().toLowerCase(java.util.Locale.ROOT);
        if(!android.util.Patterns.EMAIL_ADDRESS.matcher(value).matches()){email.setError("Enter your team email");email.requestFocus();return;}
        if(challenge.isEmpty()){actions.request(value);return;}
        if(android.os.SystemClock.elapsedRealtime()>=expiresAt){hint.setText("This code has expired. Send a new code to continue.");return;}
        String digits=code.getText().toString();if(!digits.matches("[0-9]{6}")){code.setError("Enter the six-digit code");code.requestFocus();return;}
        actions.verify(requestedEmail,challenge,digits);
    }
    void sent(String emailValue,String token,int expiresIn,int resendAfter){
        requestedEmail=emailValue;challenge=token;long now=android.os.SystemClock.elapsedRealtime();resendAt=now+resendAfter*1000L;expiresAt=now+expiresIn*1000L;
        email.setText(emailValue);email.setEnabled(false);code.setText("");code.setVisibility(VISIBLE);change.setVisibility(VISIBLE);findViewWithTag("team-email-resend").setVisibility(VISIBLE);submit.setText("Verify & sign in");
        hint.setText("If this email belongs to an active team member, a code is on its way. Check your inbox or spam folder, then enter it here.");code.requestFocus();
    }
    void clearCode(){code.setText("");}
    private void reset(){challenge="";requestedEmail="";code.setText("");code.setVisibility(GONE);change.setVisibility(GONE);findViewWithTag("team-email-resend").setVisibility(GONE);email.setEnabled(true);submit.setText("Send sign-in code");hint.setText("Sign in with your team email. No Google Play services needed.");email.requestFocus();}
    private EditText field(String placeholder,int type){EditText value=new EditText(activity);value.setSingleLine(true);value.setInputType(type);value.setTextSize(14);value.setTextColor(palette.text);value.setHintTextColor(palette.muted);value.setHint(placeholder);value.setContentDescription(placeholder);value.setGravity(Gravity.CENTER);value.setPadding(dp(12),dp(14),dp(12),dp(14));value.setBackground(shape(palette.elevated,palette.border));value.setMinHeight(dp(52));return value;}
    private Button button(String text,boolean primary){Button button=new Button(activity);button.setText(text);button.setAllCaps(false);button.setTextSize(primary?14:12);button.setTextColor(primary?palette.accentForeground:palette.muted);button.setTypeface(Typeface.DEFAULT,Typeface.BOLD);button.setMinHeight(dp(48));button.setBackground(primary?shape(palette.accent,palette.accent):shape(palette.card,0));return button;}
    private GradientDrawable shape(int color,int border){GradientDrawable shape=new GradientDrawable();shape.setColor(color);shape.setCornerRadius(dp(12));if(border!=0)shape.setStroke(dp(1),border);return shape;}
    private void add(View child,int margin){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.topMargin=dp(margin);addView(child,p);}
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
}
