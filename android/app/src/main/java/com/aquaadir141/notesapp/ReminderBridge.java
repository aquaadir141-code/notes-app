package com.aquaadir141.notesapp;

import android.content.Context;
import android.webkit.JavascriptInterface;

/** Exposed to the page as window.NativeReminders. */
public class ReminderBridge {

    private final Context context;

    ReminderBridge(Context context) {
        this.context = context.getApplicationContext();
    }

    @JavascriptInterface
    public void sync(String remindersJson) {
        ReminderScheduler.sync(context, remindersJson);
    }

    @JavascriptInterface
    public String takeFiredIds() {
        return ReminderScheduler.takeFiredIds(context);
    }
}
