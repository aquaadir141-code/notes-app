package com.aquaadir141.notesapp;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {

    private static final String APP_URL = "https://aquaadir141-code.github.io/notes-app/";
    private static final int REQUEST_SAVE_BACKUP = 1;
    private static final int REQUEST_PICK_FILE = 2;

    private WebView webView;
    private String pendingBackupJson;
    private ValueCallback<Uri[]> filePathCallback;

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
        webView.setWebChromeClient(new WebChromeClient() {
            // WebView ignores <input type="file"> unless the app opens a picker itself.
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                try {
                    startActivityForResult(intent, REQUEST_PICK_FILE);
                } catch (ActivityNotFoundException e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });
        webView.addJavascriptInterface(new BackupBridge(), "AndroidBackup");

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(APP_URL);
        }
    }

    // Exposed to the page as window.AndroidBackup. WebView has no downloads or
    // Web Share, so the page hands the backup JSON here and we let the user pick
    // where to save it.
    private class BackupBridge {
        @JavascriptInterface
        public void save(final String filename, final String json) {
            runOnUiThread(() -> {
                pendingBackupJson = json;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE, filename);
                try {
                    startActivityForResult(intent, REQUEST_SAVE_BACKUP);
                } catch (ActivityNotFoundException e) {
                    pendingBackupJson = null;
                    Toast.makeText(MainActivity.this, "לא נמצא מקום לשמירת הקובץ", Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        Uri uri = (resultCode == RESULT_OK && data != null) ? data.getData() : null;

        if (requestCode == REQUEST_PICK_FILE) {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(uri != null ? new Uri[]{uri} : null);
                filePathCallback = null;
            }
        } else if (requestCode == REQUEST_SAVE_BACKUP) {
            String json = pendingBackupJson;
            pendingBackupJson = null;
            if (uri == null || json == null) return;
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                out.write(json.getBytes(StandardCharsets.UTF_8));
                Toast.makeText(this, "גיבוי נשמר בהצלחה", Toast.LENGTH_LONG).show();
            } catch (Exception e) {
                Toast.makeText(this, "שמירת הגיבוי נכשלה", Toast.LENGTH_LONG).show();
            }
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
