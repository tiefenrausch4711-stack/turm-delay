'use strict';

const APP_VERSION = '5';   // Stand der Test-App
const STORE_KEY = 'lagcam.test.settings';
const MAIN_STORE_KEY = 'turmdelay.settings.v1';   // Einstellungen der normalen App
const KEY_INTERVAL_MS = 1000;      // Keyframe etwa jede Sekunde
const LOOKAHEAD_MS = 150;          // so früh wird vor der Anzeige dekodiert
const MEMORY_BUDGET = 150 * 1024 * 1024;
const WATCHDOG_MS = 2000;          // so lange ohne Bild gilt die Kamera als ausgefallen
const RECONNECT_MS = 3000;
const CONSTRAINT_TIMEOUT_MS = 3000; // so lange darf ein Kamerabefehl höchstens dauern
const CONSTRAINT_GRACE_MS = 3000;   // so lange nach einem Kamerabefehl schweigt die Überwachung
const LONG_PRESS_MS = 3000;
const SAVE_PRESS_MS = 1000;       // so lange muss der Speicherknopf gehalten werden
const OVERLOAD_HOLD_MS = 5000;     // so lange bleibt die Anzeige nach einer Überlast gelb

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r1 = x => Math.round(x * 10) / 10;

// ---------- Einstellungen ----------

const DEFAULT_CAM = { zoom: 1, exp: 'auto', ev: 0.6, focus: 'auto', fd: 1 };
const DEFAULTS = {
  facing: 'environment',
  height: 1080,
  fps: 30,
  delay: 20,
  cams: { environment: { ...DEFAULT_CAM }, user: { ...DEFAULT_CAM } },
};

function loadSettings() {
  let s = {};
  // Beim ersten Start die Einstellungen der normalen App übernehmen
  try { s = JSON.parse(localStorage.getItem(STORE_KEY) || localStorage.getItem(MAIN_STORE_KEY)) || {}; } catch (e) {}
  return {
    ...DEFAULTS, ...s,
    height: 1080,  // fest, passend zum Fernseher
    fps: 30,       // fest, Chrome liefert auf dem Tablet höchstens 30
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

// Alte Stufen wie 1/250 aus früheren Versionen werden zu Manuell
for (const f of ['environment', 'user']) {
  const c = settings.cams[f];
  if (c.exp !== 'auto' && c.exp !== 'manual') c.exp = 'manual';
}
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

let mode = 'settings';         // settings, run oder analysis
let camState = 'off';          // off, ok, lost
let stream = null, track = null, caps = {}, reader = null;
let camGen = 0;
let lastFrameAt = 0;
let watchdogQuietUntil = 0;     // Überwachung ruht bis zu diesem Zeitpunkt
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
let opStart = null;             // Zeitpunkt des ersten Bildes im Betrieb, vorher null
let lastShownTs = 0;
let lastTrimAt = 0;

const canvas = $('out');
const ctx = canvas.getContext('2d', { alpha: false });
const video = $('pv');

function markOverload() { overloadUntil = performance.now() + OVERLOAD_HOLD_MS; }

function quietWatchdog(ms) {
  watchdogQuietUntil = Math.max(watchdogQuietUntil, performance.now() + ms);
}

function withTimeout(p, ms) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('Zeitüberschreitung')), ms); })])
    .finally(() => clearTimeout(t));
}

// Kamerabefehl mit Zeitgrenze. Android liefert während der Umstellung kurz keine Bilder,
// deshalb ruht die Überwachung währenddessen und kurz danach.
async function constrain(cons) {
  if (!track) return;
  quietWatchdog(CONSTRAINT_TIMEOUT_MS + CONSTRAINT_GRACE_MS);
  try { await withTimeout(track.applyConstraints({ advanced: [cons] }), CONSTRAINT_TIMEOUT_MS); }
  finally { quietWatchdog(CONSTRAINT_GRACE_MS); }
}

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
  quietWatchdog(10000);   // Kamerastart samt Einstellungen kann dauern
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
  await applyFocus();
  if (mode === 'settings') video.srcObject = stream;
  lastFrameAt = performance.now();
  quietWatchdog(2000);   // Anlaufzeit bis zum ersten Bild
  fpsCount = 0; fpsWindowStart = performance.now(); measuredFps = 0;
  camState = 'ok';
  forceKey = true;
  reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
  pump(reader, gen);
  renderSettings();
}

function stopCamera() {
  camGen++;
  if (camState === 'ok') camState = 'off';
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
    if (mode === 'analysis') continue;   // Während der Analyse bleibt die Kamera aus
    let ok = false;
    await camOp(async () => {
      // Kamera wurde inzwischen anderweitig gestartet, etwa durch einen Kamerawechsel
      if (camState === 'ok' && track && track.readyState === 'live') { ok = true; return; }
      try { await startCamera(); ok = true; }
      catch (e) { renderSettings(e); }
    });
    if (ok) break;
  }
  reconnecting = false;
  opStart = null;
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
    await constrain({ zoom: clamp(cam().zoom, caps.zoom.min, caps.zoom.max) });
  }
  applyPreviewTransform();
});

const applyExposure = latestOnly(async () => {
  if (!track || !caps.exposureMode) return;
  const c = cam();
  if (c.exp === 'auto' || !caps.exposureTime || !caps.exposureMode.includes('manual')) {
    await constrain({ exposureMode: 'continuous' });
    return;
  }
  const p = expParams(c.ev);
  const cons = { exposureMode: 'manual', exposureTime: p.t };
  if (caps.iso) cons.iso = p.iso;
  await constrain(cons);
});

// Fokus. Der Regler geht linear vom kleinsten zum größten gemeldeten Abstand.
const focusOk = () => !!(caps.focusMode && caps.focusMode.includes('manual')
  && caps.focusDistance && caps.focusDistance.max > caps.focusDistance.min);

function focusDist(fd) {
  const r = caps.focusDistance;
  return Math.round((r.min + (r.max - r.min) * clamp(fd, 0, 1)) * 100) / 100;
}

const applyFocus = latestOnly(async () => {
  if (!track || !caps.focusMode) return;
  const c = cam();
  if (c.focus !== 'manual' || !focusOk()) {
    if (caps.focusMode.includes('continuous')) await constrain({ focusMode: 'continuous' });
    return;
  }
  await constrain({ focusMode: 'manual', focusDistance: focusDist(c.fd) });
});

// Chrome meldet bei Automatik nur den zuletzt gesetzten Wert, nicht den tatsächlichen.
// Deshalb steht bei Automatik kein Zahlenwert.
function focusText() {
  if (!track || !focusOk()) return '';
  if (cam().focus !== 'manual') return 'Fokus Auto';
  const d = focusDist(cam().fd);
  return 'Fokus Manuell ' + String(Math.round(d * 10) / 10).replace('.', ',') + ' m';
}

// Ein Helligkeitswert von 0 bis 1 wird auf Belichtungszeit und ISO verteilt.
// Die Skala ist logarithmisch über das Produkt aus Zeit und ISO.
// Zuerst steigt die Zeit bis 1/250 s, dann der ISO-Wert bis zum Maximum, danach wieder die Zeit.
// So bleibt die Belichtung für schnelle Bewegungen möglichst kurz.
const EXP_SHORT = 40;   // 1/250 s in Einheiten von 100 Mikrosekunden

function expRange() {
  const T = caps.exposureTime, I = caps.iso;
  // Untergrenzen über 0, sonst liefert die logarithmische Skala ungültige Werte
  const tMin = Math.max(T.min, 0.1), tMax = Math.max(T.max, tMin * 2);
  const iMin = I ? Math.max(I.min, 1) : 1, iMax = I ? Math.max(I.max, iMin) : 1;
  return { tMin, tMax, iMin, iMax, pMin: tMin * iMin, pMax: tMax * iMax };
}

function expParams(ev) {
  const r = expRange();
  const p = r.pMin * Math.pow(r.pMax / r.pMin, clamp(ev, 0, 1));
  const tA = clamp(EXP_SHORT, r.tMin, r.tMax);
  let t, iso;
  if (p <= tA * r.iMin) { t = p / r.iMin; iso = r.iMin; }
  else if (p <= tA * r.iMax) { t = tA; iso = p / tA; }
  else { t = p / r.iMax; iso = r.iMax; }
  return { t: clamp(Math.round(t * 10) / 10, r.tMin, r.tMax), iso: Math.round(clamp(iso, r.iMin, r.iMax)) };
}

function fmtTime(u) {
  const s = u / 10000;
  return s >= 0.5 ? String(Math.round(s * 10) / 10).replace('.', ',') + ' s' : '1/' + Math.round(1 / s) + ' s';
}

function expText() {
  if (!track || !caps.exposureMode) return '';
  // Wie beim Fokus stehen Zahlenwerte nur bei manueller Belichtung
  if (cam().exp !== 'manual' || !caps.exposureTime) return 'EV Auto';
  const { t, iso } = expParams(cam().ev);
  const parts = ['EV Manuell', fmtTime(t)];
  if (caps.iso) parts.push('ISO ' + iso);
  return parts.join(' · ');
}

// Digitaler Zoom nur, wenn die Kamera keinen eigenen Zoom meldet
const digitalZoom = () => (caps.zoom ? 1 : cam().zoom);

function applyPreviewTransform() {
  const z = digitalZoom();
  video.style.transform = `scale(${z})`;
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
  // Der Countdown beginnt erst mit dem ersten Kamerabild
  if (opStart === null) opStart = now;
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
  if (opStart === null || ts < opStart) return;
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

  if (camState === 'lost') { setBadge(settings.delay + ' s', 'bad'); return; }
  if (camState !== 'ok') { setBadge(String(settings.delay), ''); return; }   // Kamera startet noch

  const remaining = opStart === null ? settings.delay : settings.delay - (now - opStart) / 1000;
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
  $('settings').classList.add('hidden');
  $('run').classList.remove('hidden');
  video.srcObject = null;
  resetPlayback();
  opStart = null;
  overloadUntil = 0;
  $('toast').classList.add('hidden');
  requestAnimationFrame(tick);
}

function enterSettings() {
  mode = 'settings';
  cancelSavePress();
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

// ---------- Puffer speichern ----------

// Gespeichert wird der Teil, der noch gezeigt wird, also vom Bild auf dem Fernseher bis jetzt.
// Beginn ist der Keyframe davor, damit das Video dekodierbar bleibt.
function snapshotBuffer() {
  if (mode !== 'run' || camState !== 'ok' || !buffer.length) return null;
  const T = performance.now() - settings.delay * 1000;
  let start = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i].ts > T) break;
    if (buffer[i].key) start = i;
  }
  const config = buffer[start].config;
  if (!config) return null;
  const entries = [];
  for (let i = start; i < buffer.length; i++) {
    if (buffer[i].key && buffer[i].config !== config) break;   // Auflösung hat gewechselt
    entries.push(buffer[i]);
  }
  return { config, entries };
}

let toastTimer = 0;
function showToast(text, bad) {
  const t = $('toast');
  t.textContent = text;
  t.className = bad ? 'bad' : '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
}

async function saveNow() {
  const snap = snapshotBuffer();
  if (!snap) { showToast('Nichts zu speichern', true); return; }
  saveBtn.classList.add('done');
  try {
    const c = await saveClip(snap);
    showToast('Gespeichert · Nr. ' + c.nr);
  } catch (e) {
    console.warn(e);
    showToast('Speichern fehlgeschlagen', true);
  } finally {
    setTimeout(() => saveBtn.classList.remove('done'), 600);
  }
}

// Eine Sekunde halten. Dabei verschwindet das Schwarz im Kreis.
const saveBtn = $('saveBtn');
let savePress = null;

function cancelSavePress() {
  if (!savePress) return;
  clearTimeout(savePress.timer);
  savePress = null;
  saveBtn.classList.remove('go');
}

saveBtn.addEventListener('pointerdown', e => {
  e.stopPropagation();   // löst nicht das Zurück in die Einstellungen aus
  if (savePress) { cancelSavePress(); return; }
  cancelPress();
  saveBtn.classList.remove('go');
  void saveBtn.getBoundingClientRect();
  saveBtn.classList.add('go');
  savePress = {
    id: e.pointerId,
    timer: setTimeout(() => { cancelSavePress(); saveNow(); }, SAVE_PRESS_MS),
  };
});
for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
  saveBtn.addEventListener(type, e => { if (savePress && e.pointerId === savePress.id) cancelSavePress(); });
}

// ---------- Oberfläche der Einstellungen ----------

const fmtNum = x => String(r1(x)).replace('.', ',');
const fmtZoom = z => (Number.isInteger(r1(z)) ? r1(z) + ',0' : fmtNum(z)) + '×';
const CAM_LABEL = { environment: 'Rückseite', user: 'Vorderseite' };

function setSeg(id, value) {
  for (const b of $(id).querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === String(value));
}

// Füllt die Spur eines Schiebereglers bis zum Regler
function fillRange(el) {
  const min = +el.min, max = +el.max;
  const p = max > min ? (el.value - min) / (max - min) * 100 : 0;
  el.style.setProperty('--p', p + '%');
}

function buildTicks(max) {
  const box = $('delayTicks');
  if (box.dataset.max === String(max)) return;
  box.dataset.max = max;
  box.textContent = '';
  for (let v = 1; v <= max; v++) {
    const x = max > 1 ? (v - 1) / (max - 1) * 100 : 0;
    const i = document.createElement('i');
    const major = v === 1 || v % 5 === 0;
    if (major) i.className = 'major';
    i.style.left = x + '%';
    box.append(i);
    if (major) {
      const b = document.createElement('b');
      b.textContent = v;
      b.style.left = x + '%';
      box.append(b);
    }
  }
}

function renderSettings(err) {
  const c = cam();
  setSeg('segFacing', settings.facing);
  setSeg('segExp', c.exp);

  const zoom = $('zoom');
  const zmin = caps.zoom ? caps.zoom.min : 1;
  const zmax = caps.zoom ? Math.min(caps.zoom.max, 8) : 4;
  zoom.min = zmin; zoom.max = zmax;
  zoom.value = clamp(c.zoom, zmin, zmax);
  $('zoomVal').textContent = fmtZoom(c.zoom);
  fillRange(zoom);

  const expOk = caps.exposureMode && caps.exposureMode.includes('manual') && caps.exposureTime;
  $('expGrp').classList.toggle('hidden', !expOk);
  $('evGrp').classList.toggle('hidden', !expOk || c.exp !== 'manual');

  setSeg('segFocus', c.focus);
  $('focusGrp').classList.toggle('hidden', !focusOk());
  $('fdGrp').classList.toggle('hidden', !focusOk() || c.focus !== 'manual');
  $('fd').value = Math.round(c.fd * 1000);
  fillRange($('fd'));
  $('ev').value = Math.round(c.ev * 1000);
  fillRange($('ev'));

  const md = maxDelay();
  if (settings.delay > md) settings.delay = md;
  $('delay').max = md;
  buildTicks(md);
  $('delay').value = settings.delay;
  $('delayVal').textContent = settings.delay;
  fillRange($('delay'));
  $('version').textContent = 'Stand ' + APP_VERSION;

  applyPreviewTransform();
  renderCamInfo(err);
}

let lastCamError = null;
let unsupported = false;
function renderCamInfo(err) {
  if (err) lastCamError = err;
  if (camState === 'ok') lastCamError = null;
  err = lastCamError;
  const state = $('hudState'), stateTxt = $('hudStateTxt'), msg = $('camMsg');
  const fpsEl = $('hudFps');
  $('hudCam').textContent = CAM_LABEL[settings.facing];

  if (unsupported || camState === 'lost' || err) {
    let text = 'Kamera wird neu verbunden';
    if (unsupported) text = 'Dieser Browser unterstützt die nötigen Funktionen nicht.';
    else if (err && err.name === 'NotAllowedError') text = 'Kamerazugriff wurde nicht erlaubt. Bitte in den Chrome-Einstellungen für diese Seite freigeben.';
    state.className = 'state bad';
    stateTxt.textContent = 'Getrennt';
    msg.textContent = text;
    msg.classList.remove('hidden');
    $('hudRes').textContent = '–';
    $('hudExp').textContent = '';
    $('hudFocus').textContent = '';
    fpsEl.textContent = '–';
    fpsEl.className = '';
    return;
  }
  msg.classList.add('hidden');
  if (!track) {
    state.className = 'state';
    stateTxt.textContent = 'Start';
    return;
  }
  const st = track.getSettings();
  const low = degraded || (measuredFps && measuredFps < settings.fps * 0.8);
  state.className = 'state ' + (low ? 'warn' : 'ok');
  stateTxt.textContent = 'Live';
  $('hudRes').textContent = `${st.width} × ${st.height}`;
  $('hudExp').textContent = expText();
  $('hudFocus').textContent = focusText();
  fpsEl.textContent = measuredFps ? `${fmtNum(measuredFps)} / ${settings.fps} fps` : `– / ${settings.fps} fps`;
  fpsEl.className = low ? 'warn' : '';
}

$('settings').addEventListener('click', e => {
  const b = e.target.closest('.seg button');
  if (!b) return;
  const v = b.dataset.v;
  switch (b.parentElement.id) {
    case 'segFacing':
      if (settings.facing !== v) { settings.facing = v; restartCamera(); }
      break;
    case 'segExp': {
      cam().exp = v;
      applyExposure();
      break;
    }
    case 'segFocus': {
      cam().focus = v;
      applyFocus();
      break;
    }
  }
  saveSettings();
  renderSettings();
});

$('zoom').addEventListener('input', e => {
  cam().zoom = +e.target.value;
  $('zoomVal').textContent = fmtZoom(cam().zoom);
  fillRange(e.target);
  applyZoom();
  saveSettings();
});

$('ev').addEventListener('input', e => {
  cam().ev = +e.target.value / 1000;
  fillRange(e.target);
  applyExposure();
  $('hudExp').textContent = expText();
  saveSettings();
});

$('fd').addEventListener('input', e => {
  cam().fd = +e.target.value / 1000;
  fillRange(e.target);
  applyFocus();
  $('hudFocus').textContent = focusText();
  saveSettings();
});

function setDelay(d) {
  settings.delay = clamp(d, 1, maxDelay());
  $('delay').value = settings.delay;
  $('delayVal').textContent = settings.delay;
  fillRange($('delay'));
  saveSettings();
}
$('delay').addEventListener('input', e => setDelay(+e.target.value));
$('delayMinus').addEventListener('click', () => setDelay(settings.delay - 1));
$('delayPlus').addEventListener('click', () => setDelay(settings.delay + 1));

$('start').addEventListener('click', () => { goFullscreen(); enterRun(); });

// ---------- Wache Kamera und wacher Bildschirm ----------

setInterval(() => {
  const now = performance.now();
  const stalled = now > watchdogQuietUntil && now - lastFrameAt > WATCHDOG_MS;
  if (camState === 'ok' && track && (stalled || track.readyState === 'ended')) cameraLost();
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

// Eine neue Version wird im Hintergrund geladen, während die App läuft.
// Beim nächsten Start wird sie ohne Wartezeit übernommen, nie während des Betriebs.
async function applyUpdateAtStart() {
  if (!('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    // reg.active fehlt bei der allerersten Installation, dann ist nichts zu übernehmen
    if (reg.waiting && reg.active) {
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
      reg.waiting.postMessage('skipWaiting');
      return true;
    }
    if (navigator.onLine) reg.update().catch(() => {});
  } catch (e) { console.warn(e); }
  return false;
}

(async function init() {
  // Nach dem Übernehmen lädt die Seite neu. Falls das ausbleibt, geht es nach kurzer Zeit normal weiter.
  if (await applyUpdateAtStart()) await sleep(4000);
  renderSettings();
  if (!('MediaStreamTrackProcessor' in window) || !('VideoEncoder' in window)) {
    unsupported = true;
    $('settings').classList.remove('hidden');
    renderCamInfo();
    return;
  }
  requestWakeLock();
  restartCamera();
  enterSettings();
})();
