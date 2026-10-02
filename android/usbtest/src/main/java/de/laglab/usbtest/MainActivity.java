package de.laglab.usbtest;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.pm.PackageManager;
import android.hardware.usb.UsbDevice;
import android.media.Image;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.util.Base64;
import android.view.Gravity;
import android.view.Surface;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.WindowManager;
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

import com.serenegiant.usb.IFrameCallback;
import com.serenegiant.usb.Size;
import com.serenegiant.usb.USBMonitor;
import com.serenegiant.usb.UVCCamera;
import com.serenegiant.usb.UVCParam;

import org.json.JSONObject;

import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Machbarkeitstest: Die USB-Webcam wird direkt über USB geöffnet, ihre Bilder werden auf dem Gerät
 * zu H.264 verdichtet und an eine Webseite in der App gereicht. Die Webseite dekodiert sie mit
 * WebCodecs, so wie es LagLab später tun würde, und misst, was ankommt.
 */
public class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";

    private final Handler main = new Handler(Looper.getMainLooper());
    // Die Kamera-Bibliothek verlangt einen Thread mit eigener Nachrichtenschleife
    private Handler camHandler;
    private WebView web;
    private volatile Surface previewSurface;
    private USBMonitor monitor;

    // Verbindung zur Webseite, Meldungen vor dem Verbinden werden gesammelt
    private JavaScriptReplyProxy js;
    private boolean binary;
    private final List<String> backlog = new ArrayList<>();

    // Kamera und Encoder
    private final Object lock = new Object();
    private UVCCamera camera;
    private MediaCodec enc;
    private Thread outThread;
    private volatile boolean running;
    private int width, height;
    private byte[] src;
    private byte[] config;

    // Zähler für die Messung, je Sekunde
    private int camFrames, encIn, encOut, dropped;
    private long convNs;
    private long outBytes;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        FrameLayout root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));

        // Kleines Direktbild der Kamera unten rechts, zum Vergleich mit dem Bild in der Webseite
        SurfaceView sv = new SurfaceView(this);
        int sw = getResources().getDisplayMetrics().widthPixels;
        int pw = (int) (sw * 0.3f), ph = pw * 9 / 16;
        int margin = (int) (16 * getResources().getDisplayMetrics().density);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(pw, ph, Gravity.BOTTOM | Gravity.END);
        lp.setMargins(margin, margin, margin, margin);
        root.addView(sv, lp);
        sv.getHolder().addCallback(new SurfaceHolder.Callback() {
            @Override public void surfaceCreated(SurfaceHolder h) { previewSurface = h.getSurface(); }
            @Override public void surfaceChanged(SurfaceHolder h, int f, int w, int hh) { }
            @Override public void surfaceDestroyed(SurfaceHolder h) { previewSurface = null; }
        });
        setContentView(root);

        setupWeb();
        main.postDelayed(this::stats, 1000);

        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) startUsb();
        else requestPermissions(new String[]{Manifest.permission.CAMERA}, 1);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        boolean ok = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        log(ok ? "Kameraberechtigung erteilt." : "Kameraberechtigung abgelehnt. Ohne sie gibt Android die USB-Kamera nicht frei.");
        startUsb();
    }

    @Override
    protected void onDestroy() {
        closeCamera();
        if (monitor != null) { monitor.unregister(); monitor.destroy(); }
        super.onDestroy();
    }

    // ---------- Webseite ----------

    private void setupWeb() {
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return loader.shouldInterceptRequest(r.getUrl());
            }
        });
        binary = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_ARRAY_BUFFER);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "usbcam", Collections.singleton(ORIGIN),
                    (view, msg, origin, isMain, reply) -> onPageMessage(msg.getData(), reply));
        } else {
            log("Diese WebView kann keine Nachrichten empfangen. Bitte Android System WebView aktualisieren.");
        }
        web.loadUrl(ORIGIN + "/assets/index.html");
    }

    private void onPageMessage(String data, JavaScriptReplyProxy reply) {
        if (data == null) return;
        if (data.equals("hello")) {
            js = reply;
            try {
                JSONObject o = new JSONObject();
                o.put("t", "hello");
                o.put("clock", System.nanoTime() / 1000);
                o.put("binary", binary);
                o.put("android", Build.VERSION.RELEASE);
                o.put("model", Build.MANUFACTURER + " " + Build.MODEL);
                reply.postMessage(o.toString());
            } catch (Exception e) { }
            for (String s : backlog) reply.postMessage(s);
            backlog.clear();
        } else if (data.startsWith("copy:")) {
            ClipboardManager cm = getSystemService(ClipboardManager.class);
            cm.setPrimaryClip(ClipData.newPlainText("LagLab USB-Test", data.substring(5)));
        }
    }

    private void sendJson(JSONObject o) {
        String s = o.toString();
        main.post(() -> {
            if (js != null) js.postMessage(s);
            else backlog.add(s);
        });
    }

    private void log(String text) {
        try {
            JSONObject o = new JSONObject();
            o.put("t", "log");
            o.put("msg", text);
            sendJson(o);
        } catch (Exception e) { }
    }

    // Ein Bild an die Webseite: 1 Byte Art (0 Kopf, 1 Schlüsselbild, 2 Folgebild), 8 Byte Zeit, dann die Daten
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

    private void stats() {
        main.postDelayed(this::stats, 1000);
        try {
            JSONObject o = new JSONObject();
            synchronized (lock) {
                o.put("t", "stats");
                o.put("cam", camFrames);
                o.put("encIn", encIn);
                o.put("encOut", encOut);
                o.put("dropped", dropped);
                o.put("convMs", camFrames > 0 ? convNs / camFrames / 1e6 : 0);
                o.put("kbps", outBytes * 8 / 1000);
                camFrames = encIn = encOut = dropped = 0;
                convNs = outBytes = 0;
            }
            sendJson(o);
        } catch (Exception e) { }
    }

    // ---------- USB ----------

    private static boolean isVideo(UsbDevice d) {
        if (d.getDeviceClass() == 14) return true;
        for (int i = 0; i < d.getInterfaceCount(); i++) if (d.getInterface(i).getInterfaceClass() == 14) return true;
        return false;
    }

    private static String name(UsbDevice d) {
        String n = (d.getManufacturerName() == null ? "" : d.getManufacturerName() + " ")
                + (d.getProductName() == null ? "Gerät" : d.getProductName());
        return String.format("%s (%04x:%04x)", n.trim(), d.getVendorId(), d.getProductId());
    }

    private void startUsb() {
        if (monitor != null) return;
        HandlerThread ht = new HandlerThread("camera");
        ht.start();
        camHandler = new Handler(ht.getLooper());
        monitor = new USBMonitor(this, new USBMonitor.OnDeviceConnectListener() {
            @Override
            public void onAttach(UsbDevice d) {
                log("USB-Gerät erkannt: " + name(d) + (isVideo(d) ? ", Kamera" : ", keine Kamera"));
                if (isVideo(d) && camera == null) {
                    log("Frage die USB-Freigabe an.");
                    monitor.requestPermission(d);
                }
            }
            @Override
            public void onDetach(UsbDevice d) {
                log("USB-Gerät entfernt: " + name(d));
            }
            @Override
            public void onDeviceOpen(UsbDevice d, USBMonitor.UsbControlBlock cb, boolean createNew) {
                log("USB-Freigabe erteilt.");
                camHandler.post(() -> openCamera(cb));
            }
            @Override
            public void onDeviceClose(UsbDevice d, USBMonitor.UsbControlBlock cb) {
                log("Kamera getrennt.");
                closeCamera();
            }
            @Override
            public void onCancel(UsbDevice d) {
                log("USB-Freigabe wurde abgelehnt.");
            }
        });
        monitor.register();
        log("Warte auf eine USB-Kamera.");
    }

    // ---------- Kamera ----------

    private void openCamera(USBMonitor.UsbControlBlock cb) {
        try {
            for (int i = 0; i < 40 && previewSurface == null; i++) Thread.sleep(50);
            UVCCamera c = new UVCCamera(new UVCParam());
            int r = c.open(cb);
            if (r != 0) { log("Kamera ließ sich nicht öffnen, Fehler " + r); c.destroy(); return; }

            List<Size> sizes = c.getSupportedSizeList();
            StringBuilder sb = new StringBuilder();
            for (Size s : sizes) sb.append(s.type == UVCCamera.UVC_VS_FRAME_MJPEG ? "MJPEG " : "YUV ")
                    .append(s.width).append("x").append(s.height).append(" ").append(s.fpsList).append(" | ");
            JSONObject o = new JSONObject();
            o.put("t", "sizes");
            o.put("list", sb.toString());
            sendJson(o);

            Size pick = pick(sizes, 1920, 1080);
            if (pick == null) pick = pick(sizes, 1280, 720);
            if (pick == null) pick = sizes.get(0);
            if (pick.fpsList != null && pick.fpsList.contains(30)) pick.fps = 30;
            c.setPreviewSize(pick);
            width = pick.width;
            height = pick.height;
            src = new byte[width * height * 3 / 2];
            log("Gewählt: " + (pick.type == UVCCamera.UVC_VS_FRAME_MJPEG ? "MJPEG " : "YUV ") + width + "x" + height + " mit " + pick.fps + " B/s");

            startEncoder();
            if (previewSurface != null) c.setPreviewDisplay(previewSurface);
            else log("Keine Fläche für das Direktbild vorhanden.");
            c.setFrameCallback(frameCallback, UVCCamera.PIXEL_FORMAT_NV12);
            c.startPreview();
            synchronized (lock) { camera = c; }
            log("Kamera läuft.");
        } catch (Exception e) {
            log("Fehler beim Öffnen: " + e);
        }
    }

    private static Size pick(List<Size> sizes, int w, int h) {
        for (Size s : sizes) if (s.type == UVCCamera.UVC_VS_FRAME_MJPEG && s.width == w && s.height == h) return s;
        for (Size s : sizes) if (s.width == w && s.height == h) return s;
        return null;
    }

    private void closeCamera() {
        UVCCamera c;
        synchronized (lock) { c = camera; camera = null; }
        if (c != null) {
            try { c.stopPreview(); } catch (Exception e) { }
            try { c.destroy(); } catch (Exception e) { }
        }
        stopEncoder();
    }

    private final IFrameCallback frameCallback = buf -> {
        long t0 = System.nanoTime();
        long ts = t0 / 1000;
        synchronized (lock) {
            camFrames++;
            if (enc == null) return;
            try {
                int idx = enc.dequeueInputBuffer(0);
                if (idx < 0) { dropped++; return; }
                buf.rewind();
                buf.get(src, 0, Math.min(src.length, buf.remaining()));
                Image img = enc.getInputImage(idx);
                int size;
                if (img != null) { copyToImage(img); size = width * height * 3 / 2; }
                else {
                    ByteBuffer in = enc.getInputBuffer(idx);
                    in.clear();
                    size = Math.min(in.remaining(), src.length);
                    in.put(src, 0, size);
                }
                enc.queueInputBuffer(idx, 0, size, ts, 0);
                encIn++;
            } catch (Exception e) {
                dropped++;
            }
            convNs += System.nanoTime() - t0;
        }
    };

    // Kopiert ein NV12-Bild in das Eingabebild des Encoders, gleich welche Anordnung er erwartet
    private void copyToImage(Image img) {
        Image.Plane[] p = img.getPlanes();
        int w = width, h = height;
        ByteBuffer y = p[0].getBuffer();
        int ys = p[0].getRowStride();
        for (int r = 0; r < h; r++) { y.position(r * ys); y.put(src, r * w, w); }
        ByteBuffer u = p[1].getBuffer(), v = p[2].getBuffer();
        int us = p[1].getRowStride(), up = p[1].getPixelStride();
        int vs = p[2].getRowStride(), vp = p[2].getPixelStride();
        int base = w * h;
        for (int r = 0; r < h / 2; r++) {
            int s = base + r * w;
            for (int c = 0; c < w / 2; c++) {
                u.put(r * us + c * up, src[s + 2 * c]);
                v.put(r * vs + c * vp, src[s + 2 * c + 1]);
            }
        }
    }

    private void startEncoder() throws Exception {
        MediaFormat f = MediaFormat.createVideoFormat("video/avc", width, height);
        f.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible);
        f.setInteger(MediaFormat.KEY_BIT_RATE, height >= 1080 ? 6_000_000 : 4_000_000);
        f.setInteger(MediaFormat.KEY_FRAME_RATE, 30);
        f.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1);
        if (Build.VERSION.SDK_INT >= 29) f.setInteger(MediaFormat.KEY_PREPEND_HEADER_TO_SYNC_FRAMES, 1);
        MediaCodec e = MediaCodec.createEncoderByType("video/avc");
        e.configure(f, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
        e.start();
        log("Encoder: " + e.getName());
        config = null;
        running = true;
        synchronized (lock) { enc = e; }
        outThread = new Thread(() -> drain(e), "encoder-out");
        outThread.start();
    }

    private void drain(MediaCodec e) {
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        while (running) {
            int idx;
            try { idx = e.dequeueOutputBuffer(info, 10_000); } catch (Exception x) { break; }
            if (idx < 0) continue;
            ByteBuffer out = e.getOutputBuffer(idx);
            byte[] data = new byte[info.size];
            out.position(info.offset);
            out.get(data);
            e.releaseOutputBuffer(idx, false);
            if ((info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) {
                config = data;
                sendChunk(0, info.presentationTimeUs, data);
                continue;
            }
            boolean key = (info.flags & MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0;
            // Jedes Schlüsselbild bekommt den Kopf, damit es allein dekodierbar ist
            if (key && config != null && !startsWithSps(data)) {
                byte[] d = new byte[config.length + data.length];
                System.arraycopy(config, 0, d, 0, config.length);
                System.arraycopy(data, 0, d, config.length, data.length);
                data = d;
            }
            synchronized (lock) { encOut++; outBytes += data.length; }
            sendChunk(key ? 1 : 2, info.presentationTimeUs, data);
        }
    }

    private static boolean startsWithSps(byte[] d) {
        int i = d.length > 4 && d[2] == 1 ? 3 : 4;
        return d.length > i && (d[i] & 0x1f) == 7;
    }

    private void stopEncoder() {
        MediaCodec e;
        synchronized (lock) { e = enc; enc = null; }
        running = false;
        if (outThread != null) { try { outThread.join(500); } catch (InterruptedException x) { } outThread = null; }
        if (e != null) {
            try { e.stop(); } catch (Exception x) { }
            e.release();
        }
    }
}
