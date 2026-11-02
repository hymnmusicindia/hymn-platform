package fun.hymnmusic.team;

import androidx.test.core.app.ActivityScenario;
import org.junit.Test;
import static org.junit.Assert.*;
import android.view.View;
import android.widget.Button;

public class TeamEmailSignInViewTest {
    @Test public void emailAndCodeStayInTheNativeCardAndLoadingRestoresTheForm(){
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            scenario.onActivity(activity->{
                for(boolean dark:new boolean[]{false,true}){
                    String[] submitted={"","",""};int[] requests={0};
                    TeamLoginView login=new TeamLoginView(activity,dark,()->{});
                    assertNull("Google sign-in must not be offered",login.view.findViewWithTag("team-google-sign-in"));
                    assertEquals("Continue with email",login.primary.getText().toString());
                    login.enableEmailSignIn(new TeamEmailSignInView.Actions(){
                        public void request(String email){submitted[0]=email;requests[0]++;}
                        public void verify(String email,String challenge,String code){submitted[0]=email;submitted[1]=challenge;submitted[2]=code;}
                    });
                    assertEquals(View.GONE,login.emailSignIn.getVisibility());
                    login.view.findViewWithTag("team-email-start").performClick();
                    TeamEmailSignInView form=login.emailSignIn;assertEquals(View.VISIBLE,form.getVisibility());
                    form.email.setText("invalid");form.submit.performClick();assertEquals(0,requests[0]);
                    form.email.setText(" Member@Example.test ");form.submit.performClick();assertEquals(1,requests[0]);assertEquals("member@example.test",submitted[0]);
                    form.sent("member@example.test","private-challenge",600,60);
                    assertFalse(form.email.isEnabled());assertEquals(View.VISIBLE,form.code.getVisibility());
                    form.code.setText("123");form.submit.performClick();assertEquals("",submitted[1]);
                    form.code.setText("012345");form.submit.performClick();assertEquals("private-challenge",submitted[1]);assertEquals("012345",submitted[2]);
                    form.findViewWithTag("team-email-resend").performClick();assertEquals("Resend cooldown is enforced",1,requests[0]);
                    login.busy(true);assertEquals(View.INVISIBLE,login.contents.getVisibility());assertEquals(View.VISIBLE,login.loading.getVisibility());
                    login.busy(false);assertEquals(View.VISIBLE,form.getVisibility());assertEquals("012345",form.code.getText().toString());
                    form.clearCode();assertEquals("",form.code.getText().toString());
                    form.change.performClick();assertTrue(form.email.isEnabled());assertEquals(View.GONE,form.code.getVisibility());
                    form.submit.performClick();assertEquals("Changing email invalidates the previous challenge",2,requests[0]);
                }
            });
        }
    }
}
