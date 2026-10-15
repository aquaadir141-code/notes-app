package com.aquaadir141.notesapp;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * Keeps one AlarmManager alarm per pending reminder. The web page sends the full
 * list of reminders; it is stored so alarms can be restored after a reboot.
 */
public final class ReminderScheduler {

    static final String EXTRA_ID = "reminder_id";
    static final String EXTRA_TEXT = "reminder_text";

    private static final String PREFS = "reminders";
    private static final String KEY_REMINDERS = "reminders_json";
    private static final String KEY_FIRED = "fired_ids";

    private ReminderScheduler() {}

    /** Replaces all scheduled reminders with the given JSON array of {id, text, at}. */
    static synchronized void sync(Context context, String json) {
        JSONArray next;
        try {
            next = new JSONArray(json);
        } catch (JSONException e) {
            return;
        }
        cancelAll(context, load(context));
        prefs(context).edit().putString(KEY_REMINDERS, next.toString()).apply();
        scheduleAll(context, next);
    }

    /** Re-creates alarms from storage, e.g. after the device restarts. */
    static synchronized void restore(Context context) {
        scheduleAll(context, load(context));
    }

    static synchronized void markFired(Context context, String id) {
        Set<String> fired = new HashSet<>(prefs(context).getStringSet(KEY_FIRED, new HashSet<String>()));
        fired.add(id);
        prefs(context).edit().putStringSet(KEY_FIRED, fired).apply();
    }

    /** Returns the ids notified while the app was closed, as a JSON array, and clears them. */
    static synchronized String takeFiredIds(Context context) {
        Set<String> fired = prefs(context).getStringSet(KEY_FIRED, new HashSet<String>());
        JSONArray out = new JSONArray();
        for (String id : fired) out.put(id);
        prefs(context).edit().remove(KEY_FIRED).apply();
        return out.toString();
    }

    private static void scheduleAll(Context context, JSONArray reminders) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        long now = System.currentTimeMillis();
        for (int i = 0; i < reminders.length(); i++) {
            JSONObject r = reminders.optJSONObject(i);
            if (r == null) continue;
            String id = r.optString("id", "");
            long at = r.optLong("at", 0);
            if (id.isEmpty() || at <= now) continue;
            PendingIntent pi = pendingIntent(context, id, r.optString("text", ""));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
                // Without exact-alarm access Android may delay the alarm by a few minutes.
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, at, pi);
            }
        }
    }

    private static void cancelAll(Context context, JSONArray reminders) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        for (int i = 0; i < reminders.length(); i++) {
            JSONObject r = reminders.optJSONObject(i);
            if (r == null) continue;
            String id = r.optString("id", "");
            if (!id.isEmpty()) am.cancel(pendingIntent(context, id, ""));
        }
    }

    private static PendingIntent pendingIntent(Context context, String id, String text) {
        Intent intent = new Intent(context, ReminderReceiver.class);
        // The data URI makes each reminder's PendingIntent distinct.
        intent.setData(android.net.Uri.parse("notesapp://reminder/" + android.net.Uri.encode(id)));
        intent.putExtra(EXTRA_ID, id);
        intent.putExtra(EXTRA_TEXT, text);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(context, id.hashCode(), intent, flags);
    }

    private static JSONArray load(Context context) {
        try {
            return new JSONArray(prefs(context).getString(KEY_REMINDERS, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
