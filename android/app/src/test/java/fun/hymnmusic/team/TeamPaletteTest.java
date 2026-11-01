package fun.hymnmusic.team;

import org.junit.Test;
import static org.junit.Assert.*;

public class TeamPaletteTest {
    private double channel(int c){double x=c/255.0;return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4);}
    private double luminance(int color){return .2126*channel((color>>16)&255)+.7152*channel((color>>8)&255)+.0722*channel(color&255);}
    private double contrast(int a,int b){double x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
    @Test public void bothThemesKeepTextAndStatusReadable(){
        for(boolean dark:new boolean[]{false,true}){
            TeamPalette p=new TeamPalette(dark);
            assertTrue(contrast(p.text,p.card)>=4.5);
            assertTrue(contrast(p.muted,p.card)>=4.5);
            assertTrue(contrast(p.muted,p.elevated)>=4.5);
            assertTrue(contrast(p.error,p.errorSoft)>=4.5);
            assertTrue(contrast(p.accent,p.accentForeground)>=4.5);
        }
    }
}
