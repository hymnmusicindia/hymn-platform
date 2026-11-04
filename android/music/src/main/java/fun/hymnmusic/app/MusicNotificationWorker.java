package fun.hymnmusic.app;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.*;

public final class MusicNotificationWorker extends Worker {
    public MusicNotificationWorker(@NonNull Context context, @NonNull WorkerParameters parameters) { super(context, parameters); }
    @NonNull @Override public Result doWork() {
        try { MusicPhoneNotifications.sync(getApplicationContext()); return Result.success(); }
        catch (Exception error) { return Result.retry(); }
    }
}
