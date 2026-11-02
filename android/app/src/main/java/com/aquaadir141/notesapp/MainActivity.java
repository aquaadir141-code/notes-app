package com.aquaadir141.notesapp;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {

    private static final String APP_URL = "https://aquaadir141-code.github.io/notes-app/";
    private static final String BACKUP_FOLDER = "Notes Backups";
    private static final String BACKUP_PREFIX = "notes_backup_";

    private WebView webView;
    private final ExecutorService backupExecutor = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setStatusBarColor(Color.parseColor("#38a169"));

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(false);
        settings.setGeolocationEnabled(false);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new AutoBackupBridge(), "AndroidAutoBackup");

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(APP_URL);
        }
    }

    // Exposed to the page as window.AndroidAutoBackup. The page calls saveDaily()
    // once a day (and again when notes change that day). The file goes to
    // Documents/Notes Backups on the phone, which survives uninstalling the app,
    // so no picker or confirmation is ever needed.
    private class AutoBackupBridge {
        @JavascriptInterface
        public void saveDaily(final String filename, final String json, final int keep) {
            if (filename == null || json == null || !filename.startsWith(BACKUP_PREFIX)
                    || !filename.endsWith(".json") || filename.contains("/")) return;
            backupExecutor.execute(() -> {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        saveToDocuments(filename, json, Math.max(keep, 7));
                    } else {
                        saveToAppFolder(filename, json, Math.max(keep, 7));
                    }
                } catch (Exception ignored) {
                    // The in-app (IndexedDB) copy is still saved by the page.
                }
            });
        }

        @JavascriptInterface
        public String location() {
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    ? "Documents/" + BACKUP_FOLDER
                    : "Android/data/" + getPackageName() + "/files/" + BACKUP_FOLDER;
        }
    }

    private void saveToDocuments(String filename, String json, int keep) throws Exception {
        ContentResolver resolver = getContentResolver();
        Uri collection = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        String relativePath = "Documents/" + BACKUP_FOLDER + "/";

        Uri target = null;
        try (Cursor c = resolver.query(collection,
                new String[]{MediaStore.MediaColumns._ID},
                MediaStore.MediaColumns.RELATIVE_PATH + "=? AND " + MediaStore.MediaColumns.DISPLAY_NAME + "=?",
                new String[]{relativePath, filename}, null)) {
            if (c != null && c.moveToFirst()) {
                target = Uri.withAppendedPath(collection, String.valueOf(c.getLong(0)));
            }
        }

        if (target == null) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
            values.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            target = resolver.insert(collection, values);
            if (target == null) return;
            writeTo(resolver.openOutputStream(target, "wt"), json);
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(target, done, null, null);
        } else {
            writeTo(resolver.openOutputStream(target, "wt"), json);
        }

        // Keep only the newest `keep` daily files this app created.
        List<Long> ids = new ArrayList<>();
        try (Cursor c = resolver.query(collection,
                new String[]{MediaStore.MediaColumns._ID},
                MediaStore.MediaColumns.RELATIVE_PATH + "=? AND " + MediaStore.MediaColumns.DISPLAY_NAME + " LIKE ?",
                new String[]{relativePath, BACKUP_PREFIX + "%"},
                MediaStore.MediaColumns.DISPLAY_NAME + " DESC")) {
            while (c != null && c.moveToNext()) ids.add(c.getLong(0));
        }
        for (int i = keep; i < ids.size(); i++) {
            resolver.delete(Uri.withAppendedPath(collection, String.valueOf(ids.get(i))), null, null);
        }
    }

    private void saveToAppFolder(String filename, String json, int keep) throws Exception {
        File dir = new File(getExternalFilesDir(null), BACKUP_FOLDER);
        if (!dir.exists() && !dir.mkdirs()) return;
        writeTo(new FileOutputStream(new File(dir, filename)), json);
        File[] files = dir.listFiles((d, name) -> name.startsWith(BACKUP_PREFIX) && name.endsWith(".json"));
        if (files == null) return;
        Arrays.sort(files, (a, b) -> b.getName().compareTo(a.getName()));
        for (int i = keep; i < files.length; i++) files[i].delete();
    }

    private static void writeTo(OutputStream out, String json) throws Exception {
        if (out == null) return;
        try (OutputStream o = out) {
            o.write(json.getBytes(StandardCharsets.UTF_8));
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
