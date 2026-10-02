'use strict';

// ---------- Brücke zur Android-App ----------
// In der Android-App stellt Android das Objekt window.laglab bereit. Im Browser fehlt es,
// dann bleibt alles wie bisher.

const NATIVE = !!window.laglab;

const native = (() => {
  if (!NATIVE) return null;
  const bridge = window.laglab;
  const send = obj => bridge.postMessage(JSON.stringify(obj));
  let usb = null;     // laufende USB-Kamera
  let saveDone = null;

  // ----- USB-Kamera: H.264 von der App, hier dekodiert und als Kameraspur bereitgestellt -----

  function codecFrom(b) {
    for (let i = 0; i + 6 < b.length; i++) {
      if (b[i] === 0 && b[i + 1] === 0 && b[i + 2] === 1 && (b[i + 3] & 0x1f) === 7) {
        const h = x => x.toString(16).padStart(2, '0');
        return 'avc1.' + h(b[i + 4]) + h(b[i + 5]) + h(b[i + 6]);
      }
    }
    return null;
  }

  function makeTrack(u) {
    // Bevorzugt eine echte Videospur, sonst über ein Canvas
    if ('MediaStreamTrackGenerator' in window) {
      const gen = new MediaStreamTrackGenerator({ kind: 'video' });
      const writer = gen.writable.getWriter();
      u.put = f => { writer.write(f).catch(() => f.close()); };
      u.end = () => { writer.close().catch(() => {}); };
      return gen;
    }
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    const t = cv.captureStream(30).getVideoTracks()[0];
    u.put = f => {
      if (cv.width !== f.displayWidth) { cv.width = f.displayWidth; cv.height = f.displayHeight; }
      ctx.drawImage(f, 0, 0);
      f.close();
    };
    u.end = () => t.stop();
    return t;
  }

  function onChunk(buf) {
    const u = usb;
    if (!u) return;
    const a = new Uint8Array(buf);
    const type = a[0];
    let ts = 0;
    for (let i = 1; i < 9; i++) ts = ts * 256 + a[i];
    const data = a.subarray(9);
    if (type === 0 || type === 1) {
      const c = codecFrom(data);
      if (c && c !== u.codec) {
        u.codec = c;
        u.waitKey = true;
        u.dec.configure({ codec: c, optimizeForLatency: true });
      }
    }
    if (type === 0 || !u.codec) return;
    if (u.waitKey && type !== 1) return;
    u.waitKey = false;
    if (u.dec.decodeQueueSize > 6) { u.waitKey = true; return; }   // Rückstau, bis zum nächsten Schlüsselbild aussetzen
    u.dec.decode(new EncodedVideoChunk({ type: type === 1 ? 'key' : 'delta', timestamp: ts, data }));
  }

  // Vor dem ersten Bild scheitert der Start. Danach endet die Spur, und die App verbindet neu wie bei jeder Kamera.
  function fail(u, text) {
    if (usb !== u) return;
    const e = new Error(text);
    e.name = 'NoExternal';
    const rej = u.reject;
    u.reject = null; u.resolve = null;
    stopUsb(u);
    if (rej) rej(e);
    else u.track.dispatchEvent(new Event('ended'));
  }

  function stopUsb(u, tell = true) {
    if (usb !== u) return;
    usb = null;
    clearTimeout(u.timer);
    if (tell) send({ t: 'cam', on: false });
    try { u.dec.close(); } catch (e) {}
    u.end && u.end();
  }

  function usbStream() {
    if (usb) stopUsb(usb);
    return new Promise((resolve, reject) => {
      const u = { codec: '', waitKey: true, reject, w: 0, h: 0 };
      u.dec = new VideoDecoder({
        output: f => {
          u.w = f.displayWidth; u.h = f.displayHeight;
          if (u.resolve) {
            const r = u.resolve;
            u.resolve = null; u.reject = null;
            clearTimeout(u.timer);
            r(new MediaStream([u.track]));
          }
          u.put(f);
        },
        error: e => { console.warn(e); fail(u, 'Bild der USB-Kamera ließ sich nicht dekodieren.'); },
      });
      u.track = makeTrack(u);
      u.resolve = resolve;
      // Die Spur verhält sich für die App wie eine Kamera ohne Zoom, Belichtung und Fokus
      u.track.getSettings = () => ({ width: u.w, height: u.h, frameRate: 30 });
      u.track.getCapabilities = () => ({});
      const stop = u.track.stop.bind(u.track);
      u.track.stop = () => { stopUsb(u); stop(); };
      usb = u;
      // Lange genug für die Freigabe-Frage von Android
      u.timer = setTimeout(() => fail(u, 'Die USB-Kamera antwortet nicht.'), 20000);
      send({ t: 'cam', on: true });
    });
  }

  function onState(m) {
    const u = usb;
    if (!u) return;
    if (m.state === 'none') fail(u, 'Bitte die Kamera anschließen.');
    else if (m.state === 'denied') fail(u, 'Die USB-Freigabe wurde abgelehnt.');
    else if (m.state === 'error') fail(u, m.msg || 'Die USB-Kamera ließ sich nicht öffnen.');
    else if (m.state === 'lost') fail(u, 'Die USB-Kamera wurde getrennt.');
  }

  // ----- Herunterladen in den Download-Ordner -----

  async function save(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const done = new Promise(r => { saveDone = r; });
    send({ t: 'saveStart', name: file.name, mime: file.type || 'application/octet-stream' });
    const step = 1 << 20;
    for (let i = 0; i < buf.length; i += step) bridge.postMessage(buf.slice(i, i + step).buffer);
    send({ t: 'saveEnd' });
    return done;
  }

  bridge.onmessage = e => {
    const d = e.data;
    if (d instanceof ArrayBuffer) return onChunk(d);
    if (typeof d !== 'string') return;
    // Ältere WebViews schicken Binärdaten als Text
    if (d.startsWith('B:')) return onChunk(Uint8Array.from(atob(d.slice(2)), c => c.charCodeAt(0)).buffer);
    const m = JSON.parse(d);
    if (m.t === 'cam') onState(m);
    else if (m.t === 'saved' && saveDone) { saveDone(m.ok); saveDone = null; }
  };
  send({ t: 'hello' });

  return { usbStream, save };
})();
