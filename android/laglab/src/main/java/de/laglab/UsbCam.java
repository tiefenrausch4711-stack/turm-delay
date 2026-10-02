package de.laglab;

import android.content.Context;
import android.hardware.usb.UsbDevice;
import android.media.Image;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;
import android.view.Surface;

import com.serenegiant.usb.IFrameCallback;
import com.serenegiant.usb.Size;
import com.serenegiant.usb.USBMonitor;
import com.serenegiant.usb.UVCCamera;
import com.serenegiant.usb.UVCControl;
import com.serenegiant.usb.UVCParam;

import org.json.JSONObject;

import java.nio.ByteBuffer;
import java.util.List;

/**
 * USB-Webcam direkt über USB. Die Bilder kommen als MJPEG, werden auf dem Gerät zu H.264
 * verdichtet und als kleine Stücke an die Web-App gereicht, die sie dekodiert.
 * Alle Kamerabefehle laufen nacheinander in einem eigenen Thread.
 */
class UsbCam {
    private static final String TAG = "UsbCam";

    interface Listener {
        /** none, denied, lost oder error */
        void onState(String state, String msg);
        /** Art 0 Kopf, 1 Schlüsselbild, 2 Folgebild, Zeit in Mikrosekunden */
        void onChunk(int type, long ts, byte[] data);
        /** Bereiche für Belichtung, Verstärkung und Fokus */
        void onCaps(JSONObject caps);
    }

    private final Listener listener;
    private final Handler cam;
    private final USBMonitor monitor;
    private final Object lock = new Object();

    private Surface surface;        // die Bibliothek braucht eine Fläche für ihre Vorschau
    private UVCCamera camera;
    private boolean wanted;         // die Web-App möchte Bilder
    private boolean visible = true; // die App ist im Vordergrund
    private boolean streaming;
    private boolean asking;         // die Freigabe-Frage ist offen

    private MediaCodec enc;
    private Thread outThread;
    private volatile boolean running;
    private int width, height, layout;
    private byte[] src, config;

    UsbCam(Context ctx, Listener l) {
        listener = l;
        HandlerThread ht = new HandlerThread("usbcam");
        ht.start();
        cam = new Handler(ht.getLooper());
        monitor = new USBMonitor(ctx, new USBMonitor.OnDeviceConnectListener() {
            @Override public void onAttach(UsbDevice d) {
                cam.post(() -> { if (wanted && camera == null && isVideo(d)) ask(d); });
            }
            @Override public void onDetach(UsbDevice d) { }
            @Override public void onDeviceOpen(UsbDevice d, USBMonitor.UsbControlBlock cb, boolean createNew) {
                cam.post(() -> open(cb));
            }
            @Override public void onDeviceClose(UsbDevice d, USBMonitor.UsbControlBlock cb) {
                cam.post(() -> close(true));
            }
            @Override public void onCancel(UsbDevice d) {
                cam.post(() -> {
                    asking = false;
                    if (wanted) listener.onState("denied", null);
                });
            }
        });
        monitor.register();
    }

    void setSurface(Surface s) { cam.post(() -> surface = s); }

    /** Die Web-App möchte Bilder der USB-Kamera */
    void on() {
        cam.post(() -> {
            wanted = true;
            if (camera != null) { startStream(); return; }
            if (asking) return;
            UsbDevice d = findDevice();
            if (d == null) listener.onState("none", null);
            else ask(d);
        });
    }

    /** Die Web-App braucht keine Bilder mehr, die Kamera bleibt verbunden */
    void off() {
        cam.post(() -> { wanted = false; stopStream(); });
    }

    /** Im Hintergrund ruht die Kamera. Die Web-App verbindet beim Zurückkehren neu. */
    void setVisible(boolean v) {
        cam.post(() -> {
            visible = v;
            if (!v && streaming) { stopStream(); listener.onState("lost", null); }
        });
    }

    /** Belichtung und Fokus aus der Web-App */
    void control(JSONObject m) {
        cam.post(() -> {
            if (camera == null) return;
            try {
                UVCControl c = camera.getControl();
                String exp = m.optString("exp", "");
                if (exp.equals("auto")) c.setExposureTimeAuto(true);
                else if (exp.equals("manual")) {
                    c.setExposureTimeAuto(false);
                    c.setExposureTimeAbsolute(m.getInt("time"));
                    if (m.has("gain")) c.setGain(m.getInt("gain"));
                }
                String focus = m.optString("focus", "");
                if (focus.equals("auto")) c.setFocusAuto(true);
                else if (focus.equals("manual")) {
                    c.setFocusAuto(false);
                    c.setFocusAbsolute(m.getInt("value"));
                }
            } catch (Exception e) {
                Log.w(TAG, e);
            }
        });
    }

    private JSONObject caps() {
        JSONObject o = new JSONObject();
        try {
            UVCControl c = camera.getControl();
            o.put("t", "caps");
            if (c.isExposureTimeAbsoluteEnable()) o.put("exp", range(c.updateExposureTimeAbsoluteLimit()));
            if (c.isGainEnable()) o.put("gain", range(c.updateGainLimit()));
            if (c.isFocusAbsoluteEnable() && c.isFocusAutoEnable()) o.put("focus", range(c.updateFocusAbsoluteLimit()));
        } catch (Exception e) {
            Log.w(TAG, e);
        }
        return o;
    }

    private static JSONObject range(int[] r) throws Exception {
        JSONObject o = new JSONObject();
        o.put("min", r[0]);
        o.put("max", r[1]);
        return o;
    }

    void release() {
        cam.post(() -> {
            close(false);
            monitor.unregister();
            monitor.destroy();
            cam.getLooper().quitSafely();
        });
    }

    private UsbDevice findDevice() {
        for (UsbDevice d : monitor.getDeviceList()) if (isVideo(d)) return d;
        return null;
    }

    private static boolean isVideo(UsbDevice d) {
        if (d.getDeviceClass() == 14) return true;
        for (int i = 0; i < d.getInterfaceCount(); i++) if (d.getInterface(i).getInterfaceClass() == 14) return true;
        return false;
    }

    private void ask(UsbDevice d) {
        asking = true;
        monitor.requestPermission(d);   // ruft onDeviceOpen auf, sofort, wenn die Freigabe schon besteht
    }

    private void open(USBMonitor.UsbControlBlock cb) {
        asking = false;
        if (camera != null) return;
        try {
            UVCCamera c = new UVCCamera(new UVCParam());
            int r = c.open(cb);
            if (r != 0) {
                c.destroy();
                if (wanted) listener.onState("error", "Die USB-Kamera ließ sich nicht öffnen (Fehler " + r + ").");
                return;
            }
            camera = c;
            // Bei wenig Licht soll die Kamera nicht langsamer werden, das Bild wird dann dunkler
            try { c.getControl().setAutoExposurePriority(0); } catch (Exception e) { Log.w(TAG, e); }
            if (wanted) startStream();
        } catch (Exception e) {
            Log.w(TAG, e);
            if (wanted) listener.onState("error", "Die USB-Kamera ließ sich nicht öffnen.");
        }
    }

    private void close(boolean tell) {
        boolean was = wanted && (streaming || camera != null);
        stopStream();
        if (camera != null) {
            try { camera.destroy(); } catch (Exception e) { Log.w(TAG, e); }
            camera = null;
        }
        if (tell && was) listener.onState("lost", null);
    }

    private void startStream() {
        if (streaming || camera == null || !visible) return;
        try {
            if (surface == null) { listener.onState("error", "Keine Fläche für die Kamera."); return; }
            List<Size> sizes = camera.getSupportedSizeList();
            Size pick = pick(sizes, 1920, 1080);
            if (pick == null) pick = pick(sizes, 1280, 720);
            if (pick == null) pick = sizes.get(0);
            if (pick.fpsList != null && pick.fpsList.contains(30)) pick.fps = 30;
            camera.setPreviewSize(pick);
            width = pick.width;
            height = pick.height;
            src = new byte[width * height * 3 / 2];
            layout = 0;
            listener.onCaps(caps());
            startEncoder();
            camera.setPreviewDisplay(surface);
            camera.setFrameCallback(frameCallback, UVCCamera.PIXEL_FORMAT_NV12);
            camera.startPreview();
            streaming = true;
        } catch (Exception e) {
            Log.w(TAG, e);
            stopEncoder();
            listener.onState("error", "Die USB-Kamera ließ sich nicht starten.");
        }
    }

    private void stopStream() {
        if (!streaming) return;
        streaming = false;
        try { camera.stopPreview(); } catch (Exception e) { Log.w(TAG, e); }
        stopEncoder();
    }

    private static Size pick(List<Size> sizes, int w, int h) {
        for (Size s : sizes) if (s.type == UVCCamera.UVC_VS_FRAME_MJPEG && s.width == w && s.height == h) return s;
        for (Size s : sizes) if (s.width == w && s.height == h) return s;
        return null;
    }

    // ---------- Verdichten ----------

    private final IFrameCallback frameCallback = buf -> {
        long ts = System.nanoTime() / 1000;
        synchronized (lock) {
            if (enc == null) return;
            try {
                int idx = enc.dequeueInputBuffer(0);
                if (idx < 0) return;   // Encoder voll, dieses Bild auslassen
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
            } catch (Exception e) {
                Log.w(TAG, e);
            }
        }
    };

    // Kopiert ein NV12-Bild in das Eingabebild des Encoders, gleich welche Anordnung er erwartet
    private void copyToImage(Image img) {
        Image.Plane[] p = img.getPlanes();
        int w = width, h = height;
        ByteBuffer y = p[0].getBuffer();
        int ys = p[0].getRowStride();
        if (ys == w) { y.position(0); y.put(src, 0, w * h); }
        else for (int r = 0; r < h; r++) { y.position(r * ys); y.put(src, r * w, w); }
        ByteBuffer u = p[1].getBuffer(), v = p[2].getBuffer();
        int us = p[1].getRowStride(), up = p[1].getPixelStride();
        int vs = p[2].getRowStride(), vp = p[2].getPixelStride();
        int base = w * h;
        // Einmal prüfen, ob V direkt hinter U liegt. Dann erwartet der Encoder NV12 wie die Quelle.
        if (layout == 0) {
            layout = 2;
            if (up == 2 && vp == 2 && us == vs) {
                byte old = u.get(1), mark = (byte) (old ^ 0x5a);
                u.put(1, mark);
                if (v.get(0) == mark) layout = 1;
                u.put(1, old);
            }
        }
        if (layout == 1) {
            for (int r = 0; r < h / 2; r++) {
                int s = base + r * w;
                u.position(r * us);
                u.put(src, s, w - 1);
                v.put(r * vs + w - 2, src[s + w - 1]);
            }
            return;
        }
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
        // Hohe Datenrate, weil die Web-App das Bild noch einmal verdichtet
        f.setInteger(MediaFormat.KEY_BIT_RATE, height >= 1080 ? 12_000_000 : 8_000_000);
        f.setInteger(MediaFormat.KEY_FRAME_RATE, 30);
        f.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1);
        f.setInteger(MediaFormat.KEY_PREPEND_HEADER_TO_SYNC_FRAMES, 1);
        MediaCodec e = MediaCodec.createEncoderByType("video/avc");
        e.configure(f, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
        e.start();
        config = null;
        running = true;
        synchronized (lock) { enc = e; }
        outThread = new Thread(() -> drain(e), "usbcam-out");
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
                listener.onChunk(0, info.presentationTimeUs, data);
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
            listener.onChunk(key ? 1 : 2, info.presentationTimeUs, data);
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
