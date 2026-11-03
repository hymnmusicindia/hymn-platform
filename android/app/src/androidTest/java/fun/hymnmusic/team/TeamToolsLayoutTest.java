package fun.hymnmusic.team;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import android.widget.EditText;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public class TeamToolsLayoutTest {
    private TextView find(View view,String text){if(view instanceof TextView && ((TextView)view).getText().toString().contains(text))return (TextView)view;if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){TextView result=find(((ViewGroup)view).getChildAt(i),text);if(result!=null)return result;}return null;}
    @Test public void toolsStartCollapsedAndProfileOwnsAccountActions(){
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){scenario.onActivity(screen->{try{
            java.lang.reflect.Field session=MainActivity.class.getDeclaredField("session");session.setAccessible(true);session.set(screen,new JSONObject().put("owner",true).put("workspaceName","Fixture"));
            java.lang.reflect.Method show=MainActivity.class.getDeclaredMethod("showPage",String.class);show.setAccessible(true);show.invoke(screen,"more");
            View root=screen.getWindow().getDecorView();assertNotNull(find(root,"Tools"));TextView roles=find(root,"Roles & settings");assertNotNull(roles);assertFalse(roles.isShown());
            TextView category=find(root,"Team & operations");assertNotNull(category);category.performClick();assertTrue(roles.isShown());
            java.lang.reflect.Field top=MainActivity.class.getDeclaredField("top");top.setAccessible(true);assertNull(find((View)top.get(screen),"Sign out"));
        }catch(Exception e){throw new AssertionError(e);}});}
    }
}
