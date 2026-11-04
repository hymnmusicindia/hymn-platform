package fun.hymnmusic.app;
import android.graphics.*;
import android.graphics.drawable.Drawable;

/** A quiet native record sleeve while artwork loads or is unavailable. */
final class MusicArtworkPlaceholder extends Drawable {
    final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    @Override public void draw(Canvas canvas) {
        Rect b = getBounds();
        float x = b.exactCenterX(), y = b.exactCenterY(), radius = Math.min(b.width(),b.height())*.34f;
        paint.setStyle(Paint.Style.FILL);
        paint.setShader(new LinearGradient(0,0,b.width(),b.height(),0xff314952,0xff17242a,Shader.TileMode.CLAMP));
        canvas.drawRect(b,paint);
        paint.setShader(null); paint.setColor(0xff101a20);canvas.drawCircle(x,y,radius,paint);
        paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(Math.max(1,radius*.012f));paint.setColor(0xff3e5259);
        for(float r=radius*.45f;r<radius*.92f;r+=radius*.12f)canvas.drawCircle(x,y,r,paint);
        paint.setStyle(Paint.Style.FILL);paint.setColor(0xffd8c391);canvas.drawCircle(x,y,radius*.28f,paint);
        paint.setColor(0xff20303a);canvas.drawCircle(x,y,radius*.045f,paint);
    }
    @Override public void setAlpha(int alpha) { paint.setAlpha(alpha); }
    @Override public void setColorFilter(ColorFilter filter) { paint.setColorFilter(filter); }
    @Override public int getOpacity() { return PixelFormat.OPAQUE; }
}
