package de.laglab;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.io.OutputStream;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Hülle um die Web-App. Sie zeigt LagLab in einer WebView und ergänzt, was der Browser nicht darf:
 * die USB-Kamera und das Speichern im Download-Ordner.
 */
public class MainActivity extends Activity {
    private static final String TAG = "LagLab";
    private static final String ORIGIN = "https://appassets.androidplatform.net";

    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView web;
    private UsbCam usb;
    private JavaScriptReplyProxy js;
    private boolean binary;
    private PermissionRequest pendingWebPermission;

    // Speichern läuft nacheinander in einem eigenen Thread
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private Uri saveUri;
    private OutputStream saveOut;
    private boolean saveOk;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        FrameLayout root = new FrameLayout(this);
        // Winzige Fläche, die die Kamera-Bibliothek für ihre Vorschau braucht. Sie liegt hinter der WebView.
        SurfaceView sv = new SurfaceView(this);
        root.addView(sv, new FrameLayout.LayoutParams(2, 2));
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        hideBars();

        usb = new UsbCam(this, new UsbCam.Listener() {
            @Override public void onState(String s, String msg) { sendState(s, msg); }
            @Override public void onChunk(int type, long ts, byte[] data) { sendChunk(type, ts, data); }
            @Override public void onCaps(JSONObject caps) { post(caps.toString()); }
        });
        sv.getHolder().addCallback(new SurfaceHolder.Callback() {
            @Override public void surfaceCreated(SurfaceHolder h) { usb.setSurface(h.getSurface()); }
            @Override public void surfaceChanged(SurfaceHolder h, int f, int w, int hh) { }
            @Override public void surfaceDestroyed(SurfaceHolder h) { usb.setSurface(null); }
        });

        setupWeb();
        // Die Kamera-Berechtigung braucht LagLab für die eingebauten Kameras und für die USB-Kamera
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, 1);
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        boolean ok = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (pendingWebPermission != null) {
            if (ok) pendingWebPermission.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            else pendingWebPermission.deny();
            pendingWebPermission = null;
        }
    }

    @Override
    protected void onStart() {
        super.onStart();
        usb.setVisible(true);
    }

    @Override
    protected void onStop() {
        usb.setVisible(false);
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        usb.release();
        web.destroy();
        io.shutdown();
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus) hideBars();
    }

    // Die Zurück-Geste geht in der Web-App einen Schritt zurück, auf der ersten Seite schließt sie die App
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    private void hideBars() {
        getWindow().setDecorFitsSystemWindows(false);
        WindowInsetsController c = getWindow().getInsetsController();
        if (c == null) return;
        c.hide(WindowInsets.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    // ---------- Web-App ----------

    private void setupWeb() {
        web.setBackgroundColor(getColor(R.color.splash));
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setMediaPlaybackRequiresUserGesture(false);
        // Die Dateien der Web-App liegen in der App selbst
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/app/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                WebResourceResponse res = loader.shouldInterceptRequest(r.getUrl());
                // Module und WebAssembly brauchen die passende Dateiart, sonst lädt die Bilderkennung nicht
                String path = r.getUrl().getPath();
                if (res != null && path != null) {
                    if (path.endsWith(".wasm")) res.setMimeType("application/wasm");
                    else if (path.endsWith(".mjs") || path.endsWith(".js")) res.setMimeType("text/javascript");
                }
                return res;
            }
        });
        // Eingebaute Kameras über getUserMedia
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest r) {
                main.post(() -> {
                    if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        r.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                    } else {
                        pendingWebPermission = r;
                        requestPermissions(new String[]{Manifest.permission.CAMERA}, 1);
                    }
                });
            }
        });
        binary = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_ARRAY_BUFFER);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "laglab", Collections.singleton(ORIGIN),
                    (view, msg, origin, isMain, reply) -> onMessage(msg, reply));
        }
        web.loadUrl(ORIGIN + "/app/index.html");
    }

    private void onMessage(WebMessageCompat msg, JavaScriptReplyProxy reply) {
        js = reply;
        if (msg.getType() == WebMessageCompat.TYPE_ARRAY_BUFFER) {
            byte[] part = msg.getArrayBuffer();
            io.execute(() -> saveWrite(part));
            return;
        }
        String data = msg.getData();
        if (data == null) return;
        try {
            JSONObject m = new JSONObject(data);
            switch (m.optString("t")) {
                case "ctl":
                    usb.control(m);
                    break;
                case "cam":
                    if (m.optBoolean("on")) usb.on(); else usb.off();
                    break;
                case "saveStart": {
                    String name = m.getString("name"), mime = m.optString("mime", "application/octet-stream");
                    io.execute(() -> saveStart(name, mime));
                    break;
                }
                case "saveEnd":
                    io.execute(this::saveEnd);
                    break;
            }
        } catch (Exception e) {
            Log.w(TAG, e);
        }
    }

    private void post(String s) {
        main.post(() -> { if (js != null) js.postMessage(s); });
    }

    private void sendState(String state, String msg) {
        try {
            JSONObject o = new JSONObject();
            o.put("t", "cam");
            o.put("state", state);
            if (msg != null) o.put("msg", msg);
            post(o.toString());
        } catch (Exception e) { }
    }

    // Ein Bild an die Web-App: 1 Byte Art, 8 Byte Zeit, dann die Daten
    private void sendChunk(int type, long ts, byte[] data) {
        byte[] m = new byte[9 + data.length];
        m[0] = (byte) type;
        for (int i = 0; i < 8; i++) m[1 + i] = (byte) (ts >>> (56 - 8 * i));
        System.arraycopy(data, 0, m, 9, data.length);
        main.post(() -> {
            if (js == null) return;
            if (binary) js.postMessage(m);
            else js.postMessage("B:" + Base64.encodeToString(m, Base64.NO_WRAP));
        });
    }

    // ---------- Speichern im Download-Ordner ----------

    private void saveStart(String name, String mime) {
        saveEnd();
        try {
            ContentResolver cr = getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            v.put(MediaStore.MediaColumns.IS_PENDING, 1);
            saveUri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            saveOut = cr.openOutputStream(saveUri);
            saveOk = saveOut != null;
        } catch (Exception e) {
            Log.w(TAG, e);
            saveOk = false;
        }
    }

    private void saveWrite(byte[] part) {
        if (saveOut == null) return;
        try { saveOut.write(part); } catch (Exception e) { Log.w(TAG, e); saveOk = false; }
    }

    private void saveEnd() {
        if (saveUri == null) return;
        boolean ok = saveOk;
        try {
            if (saveOut != null) saveOut.close();
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.IS_PENDING, 0);
            getContentResolver().update(saveUri, v, null, null);
            if (!ok) getContentResolver().delete(saveUri, null, null);
        } catch (Exception e) {
            Log.w(TAG, e);
            ok = false;
        }
        saveUri = null;
        saveOut = null;
        try {
            JSONObject o = new JSONObject();
            o.put("t", "saved");
            o.put("ok", ok);
            post(o.toString());
        } catch (Exception e) { }
    }
}
