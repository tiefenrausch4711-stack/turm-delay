'use strict';

const APP_VERSION = '1';
const STORE_KEY = 'turmdelay.settings.v1';
const KEY_INTERVAL_MS = 1000;      // Keyframe etwa jede Sekunde
const LOOKAHEAD_MS = 150;          // so früh wird vor der Anzeige dekodiert
const MEMORY_BUDGET = 150 * 1024 * 1024;
const WATCHDOG_MS = 2000;          // so lange ohne Bild gilt die Kamera als ausgefallen
const RECONNECT_MS = 3000;
const LONG_PRESS_MS = 3000;
const OVERLOAD_HOLD_MS = 5000;     // so lange bleibt die Anzeige nach einer Überlast gelb

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r1 = x => Math.round(x * 10) / 10;

// ---------- Einstellungen ----------

const DEFAULT_CAM = { mirror: false, zoom: 1, exp: 'auto', iso: 400 };
const DEFAULTS = {
  facing: 'environment',
  height: 1080,
  fps: 30,
  delay: 20,
  started: false,
  cams: { environment: { ...DEFAULT_CAM }, user: { ...DEFAULT_CAM } },
};

function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) {}
  return {
    ...DEFAULTS, ...s,
    cams: {
      environment: { ...DEFAULT_CAM, ...(s.cams && s.cams.environment) },
      user: { ...DEFAULT_CAM, ...(s.cams && s.cams.user) },
    },
  };
}

function saveSettings() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (e) {}
}

const settings = loadSettings();
const cam = () => settings.cams[settings.facing];
const reqWidth = () => Math.round(settings.height * 16 / 9);
const bitrateFor = h => (h >= 1080 ? 6e6 : 4e6);
const maxDelay = () => clamp(Math.floor(MEMORY_BUDGET / (bitrateFor(settings.height) / 8)), 1, 30);

// H.264 Constrained Baseline mit passendem Level
function avcCodec(w, h, fps) {
  const fs = Math.ceil(w / 16) * Math.ceil(h / 16);
  const mbps = fs * fps;
  let lvl = '33';
  if (fs <= 3600 && mbps <= 108000) lvl = '1F';
  else if (fs <= 5120 && mbps <= 216000) lvl = '20';
  else if (fs <= 8192 && mbps <= 245760) lvl = '28';
  else if (fs <= 8704 && mbps <= 522240) lvl = '2A';
  return 'avc1.42E0' + lvl;
}

// ---------- Zustand ----------

let mode = 'settings';         // settings oder run
let camState = 'off';          // off, ok, lost
let stream = null, track = null, caps = {}, reader = null;
let camGen = 0;
let lastFrameAt = 0;
let fpsCount = 0, fpsWindowStart = performance.now(), measuredFps = 0;
let degraded = false;          // Kamera liefert weniger als eingestellt
let overloadUntil = 0;

let encoder = null, encW = 0, encH = 0, encConfig = null, forceKey = true, lastKeyAt = 0;
let hwPref = 'prefer-hardware', encoderErrors = 0;
let decoder = null, decoderConfigRef = null;

let buffer = [];               // { seq, ts, key, chunk, config }
let nextSeq = 0;
let feedSeq = null;            // nächster zu dekodierender Eintrag
let frameQueue = [];           // dekodierte Bilder, die auf ihre Anzeigezeit warten
let opStart = 0;
let lastShownTs = 0;
let lastTrimAt = 0;

const canvas = $('out');
const ctx = canvas.getContext('2d', { alpha: false });
const video = $('pv');

function markOverload() { overloadUntil = performance.now() + OVERLOAD_HOLD_MS; }

// ---------- Kamera ----------

let camQueue = Promise.resolve();
function camOp(fn) {
  camQueue = camQueue.then(fn).catch(e => console.warn(e));
  return camQueue;
}

async function getStream() {
  const base = {
    width: { ideal: reqWidth() },
    height: { ideal: settings.height },
    frameRate: { ideal: settings.fps, max: settings.fps },
  };
  const tries = [
    { ...base, facingMode: { exact: settings.facing }, zoom: true },
    { ...base, facingMode: { exact: settings.facing } },
    { ...base, facingMode: settings.facing },
    { ...base, frameRate: { ideal: settings.fps }, facingMode: settings.facing },
  ];
  let err;
  for (const v of tries) {
    try { return await navigator.mediaDevices.getUserMedia({ audio: false, video: v }); }
    catch (e) { err = e; if (e.name === 'NotAllowedError') break; }
  }
  throw err;
}

async function startCamera() {
  const gen = ++camGen;
  const s = await getStream();
  if (gen !== camGen) { s.getTracks().forEach(t => t.stop()); return; }
  stream = s;
  track = s.getVideoTracks()[0];
  caps = track.getCapabilities ? track.getCapabilities() : {};
  track.addEventListener('ended', () => { if (gen === camGen) cameraLost(); });
  const st = track.getSettings();
  degraded = (st.height || 0) < settings.height;
  await applyZoom();
  await applyExposure();
  if (mode === 'settings') video.srcObject = stream;
  lastFrameAt = performance.now() + 2000;   // Anlaufzeit
  fpsCount = 0; fpsWindowStart = performance.now(); measuredFps = 0;
  camState = 'ok';
  forceKey = true;
  reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
  pump(reader, gen);
  renderSettings();
}

function stopCamera() {
  camGen++;
  if (reader) { reader.cancel().catch(() => {}); reader = null; }
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null; track = null;
  video.srcObject = null;
}

async function pump(rd, gen) {
  while (gen === camGen) {
    let r;
    try { r = await rd.read(); } catch (e) { break; }
    if (r.done) break;
    onCameraFrame(r.value);
  }
  if (gen === camGen) cameraLost();
}

function restartCamera() {
  return camOp(async () => {
    stopCamera();
    resetPlayback();
    try { await startCamera(); }
    catch (e) { console.warn(e); cameraLost(e); }
  });
}

let reconnecting = false;
async function cameraLost(err) {
  if (reconnecting) return;
  reconnecting = true;
  camState = 'lost';
  stopCamera();
  resetPlayback();
  renderSettings(err);
  while (true) {
    await sleep(RECONNECT_MS);
    let ok = false;
    await camOp(async () => {
      try { await startCamera(); ok = true; }
      catch (e) { renderSettings(e); }
    });
    if (ok) break;
  }
  reconnecting = false;
  opStart = performance.now();
  resetPlayback();
}

// Liefert immer nur die neueste Anforderung an die Kamera aus
function latestOnly(fn) {
  let busy = false, again = false;
  return async function run() {
    if (busy) { again = true; return; }
    busy = true;
    do { again = false; try { await fn(); } catch (e) { console.warn(e); } } while (again);
    busy = false;
  };
}

const applyZoom = latestOnly(async () => {
  if (track && caps.zoom) {
    await track.applyConstraints({ advanced: [{ zoom: clamp(cam().zoom, caps.zoom.min, caps.zoom.max) }] });
  }
  applyPreviewTransform();
});

const applyExposure = latestOnly(async () => {
  if (!track || !caps.exposureMode) return;
  const c = cam();
  if (c.exp === 'auto' || !caps.exposureTime || !caps.exposureMode.includes('manual')) {
    await track.applyConstraints({ advanced: [{ exposureMode: 'continuous' }] });
    return;
  }
  const cons = { exposureMode: 'manual', exposureTime: clamp(+c.exp, caps.exposureTime.min, caps.exposureTime.max) };
  if (caps.iso) cons.iso = clamp(c.iso, caps.iso.min, caps.iso.max);
  await track.applyConstraints({ advanced: [cons] });
});

// Digitaler Zoom nur, wenn die Kamera keinen eigenen Zoom meldet
const digitalZoom = () => (caps.zoom ? 1 : cam().zoom);

function applyPreviewTransform() {
  const z = digitalZoom();
  video.style.transform = `scale(${cam().mirror ? -z : z}, ${z})`;
}

// ---------- Aufnahme und Kodierung ----------

function onCameraFrame(f) {
  const now = performance.now();
  lastFrameAt = now;
  fpsCount++;
  if (now - fpsWindowStart >= 2000) {
    measuredFps = fpsCount * 1000 / (now - fpsWindowStart);
    fpsCount = 0;
    fpsWindowStart = now;
    if (mode === 'run' && measuredFps < settings.fps * 0.8) markOverload();
  }
  if (mode !== 'run' || camState !== 'ok') { f.close(); return; }
  encodeFrame(f, now);
}

function makeEncoder() {
  encoder = new VideoEncoder({
    output: onEncoded,
    error: e => {
      console.warn(e);
      markOverload();
      encoder = null;
      if (++encoderErrors >= 2) hwPref = 'no-preference';
    },
  });
  encW = 0; encH = 0;
}

function encodeFrame(f, now) {
  const w = f.displayWidth, h = f.displayHeight;
  try {
    if (!encoder || encoder.state === 'closed') makeEncoder();
    if (w !== encW || h !== encH || encoder.state !== 'configured') {
      encoder.configure({
        codec: avcCodec(w, h, settings.fps), width: w, height: h,
        bitrate: bitrateFor(h), framerate: settings.fps,
        hardwareAcceleration: hwPref, latencyMode: 'realtime', avc: { format: 'avc' },
      });
      encW = w; encH = h; forceKey = true;
    }
    if (encoder.encodeQueueSize > 3) { markOverload(); f.close(); return; }
    const key = forceKey || now - lastKeyAt >= KEY_INTERVAL_MS;
    // Zeitstempel auf die Uhr der Seite umstellen, damit Aufnahme und Anzeige vergleichbar sind
    const vf = new VideoFrame(f, { timestamp: Math.round(now * 1000) });
    f.close();
    encoder.encode(vf, { keyFrame: key });
    vf.close();
    if (key) { lastKeyAt = now; forceKey = false; }
  } catch (e) {
    console.warn(e);
    try { f.close(); } catch (x) {}
    markOverload();
    encoder = null;
  }
}

function onEncoded(chunk, meta) {
  if (meta && meta.decoderConfig) encConfig = { ...meta.decoderConfig, hardwareAcceleration: hwPref };
  if (mode !== 'run' || camState !== 'ok') return;
  const ts = chunk.timestamp / 1000;
  if (ts < opStart) return;
  const key = chunk.type === 'key';
  if (buffer.length === 0 && !key) return;
  buffer.push({ seq: nextSeq++, ts, key, chunk, config: encConfig });
}

// ---------- Wiedergabe ----------

function makeDecoder() {
  decoder = new VideoDecoder({
    output: onDecoded,
    error: e => {
      console.warn(e);
      markOverload();
      decoder = null;
      decoderConfigRef = null;
      feedSeq = null;
    },
  });
  decoderConfigRef = null;
}

function onDecoded(frame) {
  frameQueue.push(frame);
  const T = performance.now() - settings.delay * 1000;
  // Veraltete Bilder sofort freigeben, damit der Hardware-Decoder nicht blockiert
  while (frameQueue.length > 1 && frameQueue[1].timestamp / 1000 <= T) frameQueue.shift().close();
  while (frameQueue.length > 8) frameQueue.shift().close();
}

function resetPlayback() {
  buffer = [];
  feedSeq = null;
  frameQueue.forEach(f => f.close());
  frameQueue = [];
  if (decoder && decoder.state !== 'closed') {
    try { decoder.reset(); } catch (e) { decoder = null; }
  }
  decoderConfigRef = null;
  forceKey = true;
  lastShownTs = 0;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function baseSeq() { return buffer.length ? buffer[0].seq : nextSeq; }

function feed(limit, T) {
  if (feedSeq !== null && feedSeq < baseSeq()) feedSeq = null;
  if (feedSeq === null) {
    let idx = -1;
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i].key && buffer[i].ts <= T) idx = i;
      else if (buffer[i].ts > T) break;
    }
    if (idx < 0) idx = buffer.findIndex(e => e.key);
    if (idx < 0) return;
    feedSeq = buffer[idx].seq;
    decoderConfigRef = null;
  }
  if (!decoder || decoder.state === 'closed') makeDecoder();
  while (true) {
    const e = buffer[feedSeq - baseSeq()];
    if (!e || e.ts > limit) break;
    if (decoder.decodeQueueSize > 6) { markOverload(); break; }
    try {
      if (e.key && e.config && (e.config !== decoderConfigRef || decoder.state !== 'configured')) {
        decoder.configure(e.config);
        decoderConfigRef = e.config;
      }
      if (decoder.state === 'configured') decoder.decode(e.chunk);
    } catch (err) {
      console.warn(err);
      markOverload();
      decoder = null;
      feedSeq = null;
      return;
    }
    feedSeq++;
  }
}

function trim(now) {
  const cutoff = now - settings.delay * 1000 - 2000;
  let k = 0;
  for (let i = 1; i < buffer.length; i++) {
    const e = buffer[i];
    if (e.ts > cutoff) break;
    if (feedSeq !== null && e.seq > feedSeq) break;
    if (e.key) k = i;
  }
  if (k > 0) buffer.splice(0, k);
}

function drawFrame(f) {
  const w = f.displayWidth, h = f.displayHeight;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const z = digitalZoom();
  ctx.save();
  if (cam().mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  if (z > 1) {
    const sw = w / z, sh = h / z;
    ctx.drawImage(f, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, w, h);
  } else {
    ctx.drawImage(f, 0, 0, w, h);
  }
  ctx.restore();
}

const badge = $('badge');
function setBadge(text, cls) {
  if (badge.textContent !== text) badge.textContent = text;
  const c = cls || '';
  if (badge.className !== c) badge.className = c;
}

function tick() {
  if (mode !== 'run') return;
  requestAnimationFrame(tick);
  const now = performance.now();

  if (camState !== 'ok') { setBadge('Kamera', 'bad'); return; }

  const remaining = settings.delay - (now - opStart) / 1000;
  if (remaining > 0) { setBadge(String(Math.ceil(remaining)), ''); return; }

  const T = now - settings.delay * 1000;
  feed(T + LOOKAHEAD_MS, T);

  let show = null;
  while (frameQueue.length && frameQueue[0].timestamp / 1000 <= T) {
    if (show) show.close();
    show = frameQueue.shift();
  }
  if (show) {
    drawFrame(show);
    lastShownTs = show.timestamp / 1000;
    show.close();
  }
  // Anzeige hängt deutlich hinter dem Soll zurück
  if (lastShownTs && T - lastShownTs > 400) markOverload();

  if (now - lastTrimAt > 1000) { trim(now); lastTrimAt = now; }

  const warn = degraded || now < overloadUntil;
  setBadge(settings.delay + ' s', warn ? 'warn' : '');
}

// ---------- Wechsel zwischen Einstellungen und Betrieb ----------

function enterRun() {
  mode = 'run';
  settings.started = true;
  saveSettings();
  $('settings').classList.add('hidden');
  $('run').classList.remove('hidden');
  video.srcObject = null;
  resetPlayback();
  opStart = performance.now();
  overloadUntil = 0;
  requestAnimationFrame(tick);
}

function enterSettings() {
  mode = 'settings';
  resetPlayback();
  $('run').classList.add('hidden');
  $('settings').classList.remove('hidden');
  if (stream) video.srcObject = stream;
  renderSettings();
}

async function goFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    await screen.orientation.lock('landscape');
  } catch (e) {}
}

// ---------- Langes Drücken ----------

const ring = $('ring');
let press = null;

function cancelPress() {
  if (!press) return;
  clearTimeout(press.timer);
  press = null;
  ring.classList.remove('go');
  ring.classList.add('hidden');
}

$('run').addEventListener('pointerdown', e => {
  if (press) { cancelPress(); return; }   // zweiter Finger oder Tropfen bricht ab
  ring.style.left = e.clientX + 'px';
  ring.style.top = e.clientY + 'px';
  ring.classList.remove('hidden', 'go');
  void ring.getBoundingClientRect();
  ring.classList.add('go');
  press = {
    id: e.pointerId,
    timer: setTimeout(() => { cancelPress(); enterSettings(); }, LONG_PRESS_MS),
  };
});
for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
  $('run').addEventListener(type, e => { if (press && e.pointerId === press.id) cancelPress(); });
}
document.addEventListener('contextmenu', e => e.preventDefault());

// ---------- Oberfläche der Einstellungen ----------

function setSeg(id, value) {
  for (const b of $(id).querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === String(value));
}

function renderSettings(err) {
  const c = cam();
  setSeg('segFacing', settings.facing);
  setSeg('segMirror', c.mirror ? '1' : '0');
  setSeg('segExp', c.exp);
  setSeg('segRes', settings.height);
  setSeg('segFps', settings.fps);

  const zoom = $('zoom');
  const zmin = caps.zoom ? caps.zoom.min : 1;
  const zmax = caps.zoom ? Math.min(caps.zoom.max, 8) : 4;
  zoom.min = zmin; zoom.max = zmax;
  zoom.value = clamp(c.zoom, zmin, zmax);
  $('zoomVal').textContent = r1(c.zoom) + 'x';

  const expOk = caps.exposureMode && caps.exposureMode.includes('manual') && caps.exposureTime;
  $('expGrp').classList.toggle('hidden', !expOk);
  $('isoGrp').classList.toggle('hidden', !expOk || !caps.iso || c.exp === 'auto');
  if (caps.iso) {
    $('iso').min = caps.iso.min;
    $('iso').max = caps.iso.max;
  }
  $('iso').value = c.iso;
  $('isoVal').textContent = c.iso;

  const md = maxDelay();
  if (settings.delay > md) settings.delay = md;
  $('delay').max = md;
  $('delay').value = settings.delay;
  $('delayVal').textContent = settings.delay + ' s';
  $('version').textContent = 'Version ' + APP_VERSION;

  applyPreviewTransform();
  renderCamInfo(err);
}

let lastCamError = null;
function renderCamInfo(err) {
  if (err) lastCamError = err;
  if (camState === 'ok') lastCamError = null;
  err = lastCamError;
  const el = $('camInfo');
  if (camState === 'lost' || err) {
    let msg = 'Kamera wird neu verbunden';
    if (err && err.name === 'NotAllowedError') msg = 'Kamerazugriff wurde nicht erlaubt. Bitte in den Chrome-Einstellungen für diese Seite freigeben.';
    el.textContent = msg;
    el.className = 'bad';
    return;
  }
  if (!track) { el.textContent = 'Kamera wird gestartet'; el.className = ''; return; }
  const st = track.getSettings();
  const fpsTxt = measuredFps ? `, gemessen ${r1(measuredFps)} Bilder pro Sekunde` : '';
  el.textContent = `Kamera liefert ${st.width} x ${st.height}${fpsTxt}`;
  const low = degraded || (measuredFps && measuredFps < settings.fps * 0.8);
  el.className = low ? 'warn' : '';
}

$('panel').addEventListener('click', e => {
  const b = e.target.closest('.seg button');
  if (!b) return;
  const v = b.dataset.v;
  switch (b.parentElement.id) {
    case 'segFacing':
      if (settings.facing !== v) { settings.facing = v; restartCamera(); }
      break;
    case 'segMirror':
      cam().mirror = v === '1';
      break;
    case 'segExp':
      cam().exp = v;
      applyExposure();
      break;
    case 'segRes':
      if (settings.height !== +v) { settings.height = +v; restartCamera(); }
      break;
    case 'segFps':
      if (settings.fps !== +v) { settings.fps = +v; restartCamera(); }
      break;
  }
  saveSettings();
  renderSettings();
});

$('zoom').addEventListener('input', e => {
  cam().zoom = +e.target.value;
  $('zoomVal').textContent = r1(cam().zoom) + 'x';
  applyZoom();
  saveSettings();
});

$('iso').addEventListener('input', e => {
  cam().iso = +e.target.value;
  $('isoVal').textContent = cam().iso;
  applyExposure();
  saveSettings();
});

function setDelay(d) {
  settings.delay = clamp(d, 1, maxDelay());
  $('delay').value = settings.delay;
  $('delayVal').textContent = settings.delay + ' s';
  saveSettings();
}
$('delay').addEventListener('input', e => setDelay(+e.target.value));
$('delayMinus').addEventListener('click', () => setDelay(settings.delay - 1));
$('delayPlus').addEventListener('click', () => setDelay(settings.delay + 1));

$('start').addEventListener('click', () => { goFullscreen(); enterRun(); });

// ---------- Wache Kamera und wacher Bildschirm ----------

setInterval(() => {
  const now = performance.now();
  if (camState === 'ok' && track && (now - lastFrameAt > WATCHDOG_MS || track.readyState === 'ended')) cameraLost();
  if (mode === 'settings') renderCamInfo();
}, 500);

let wakeLock = null;
async function requestWakeLock() {
  if (wakeLock || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (e) { wakeLock = null; }
}
document.addEventListener('visibilitychange', requestWakeLock);
setInterval(requestWakeLock, 5000);

// ---------- Start ----------

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn(e));
}

(function init() {
  renderSettings();
  if (!('MediaStreamTrackProcessor' in window) || !('VideoEncoder' in window)) {
    $('settings').classList.remove('hidden');
    $('camInfo').textContent = 'Dieser Browser unterstützt die nötigen Funktionen nicht.';
    $('camInfo').className = 'bad';
    return;
  }
  requestWakeLock();
  restartCamera();
  if (settings.started) enterRun(); else enterSettings();
})();
