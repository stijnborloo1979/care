package be.lifeangle.ledbalk;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** Start de ledbalk-dienst na het opstarten van het scherm. */
public class OpstartOntvanger extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Intent dienst = new Intent(context, LedService.class);
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(dienst);
        else context.startService(dienst);
    }
}
