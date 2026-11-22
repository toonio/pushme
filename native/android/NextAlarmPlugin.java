package fr.toonio.pushme;

import android.app.AlarmManager;
import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * NextAlarm — reads the time of the next alarm clock set on this phone, by any app.
 *
 * AlarmManager.getNextAlarmClock() has been available since API 21 and needs no
 * permission, because of what it deliberately does not expose: there is no label, no
 * repeat rule and no owning app, only a timestamp. So this plugin cannot tell the app
 * that "the work alarm" is set — only that *an* alarm is, and when it goes off. The
 * guesswork built on top of that lives in www/js/alarms.js, where it can be read and
 * tested; everything here is a single fact handed over unchanged.
 *
 * Copied into the generated Android project by tools/patch-android.js.
 */
@CapacitorPlugin(name = "NextAlarm")
public class NextAlarmPlugin extends Plugin {

    @PluginMethod
    public void next(PluginCall call) {
        JSObject result = new JSObject();

        AlarmManager manager = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        AlarmManager.AlarmClockInfo info = (manager == null) ? null : manager.getNextAlarmClock();

        if (info == null) {
            // No alarm set, which is a real answer and not a failure.
            result.put("found", false);
        } else {
            result.put("found", true);
            result.put("triggerTime", info.getTriggerTime());
        }

        call.resolve(result);
    }
}
