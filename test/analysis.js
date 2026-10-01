'use strict';

// Gespeicherte Videos und Analysemodus. Nutzt Hilfen aus app.js wie $, clamp und mode.

const DB_NAME = 'lagcam-test';
const KEEP_DAYS = 7;               // Videos ohne Stern werden danach gelöscht
const THUMB_BEFORE_END_US = 2e6;   // Vorschaubild etwa 2 Sekunden vor dem Ende, dort liegt meist der Sprung

// ---------- Datenbank ----------

let dbPromise = null;
function db() {
  if (!dbPromise) dbPromise = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      // clips enthält die kleinen Angaben für die Liste, data das eigentliche Video
      r.result.createObjectStore('clips', { keyPath: 'id', autoIncrement: true });
      r.result.createObjectStore('data', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbPromise;
}

const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

async function inTx(stores, txMode, fn) {
  const t = (await db()).transaction(stores, txMode);
  const done = new Promise((res, rej) => { t.oncomplete = res; t.onerror = t.onabort = () => rej(t.error || new Error('Abbruch')); });
  const result = await fn(t);
  await done;
  return result;
}

const allClips = () => inTx(['clips'], 'readonly', t => reqP(t.objectStore('clips').getAll()));
const getData = id => inTx(['data'], 'readonly', t => reqP(t.objectStore('data').get(id)));
const putClip = c => inTx(['clips'], 'readwrite', t => reqP(t.objectStore('clips').put(c)));
const deleteClip = id => inTx(['clips', 'data'], 'readwrite', t => {
  t.objectStore('clips').delete(id);
  t.objectStore('data').delete(id);
});

async function cleanupOld() {
  const limit = Date.now() - KEEP_DAYS * 864e5;
  for (const c of await allClips()) if (!c.star && c.created < limit) await deleteClip(c.id);
}

// ---------- Speichern aus dem Betrieb ----------

const pad2 = n => String(n).padStart(2, '0');
const dayKey = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function copyBuf(src) {
  if (ArrayBuffer.isView(src)) return src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength);
  return src.slice(0);
}

// Speichervorgänge laufen nacheinander, damit die Nummern lückenlos steigen
let saveChain = Promise.resolve();
function saveClip(snap) {
  const p = saveChain.then(() => writeClip(snap));
  saveChain = p.catch(() => {});
  return p;
}

async function writeClip({ config, entries }) {
  const t0 = entries[0].ts;
  const parts = [], frames = [];
  let off = 0;
  for (const e of entries) {
    const u = new Uint8Array(e.chunk.byteLength);
    e.chunk.copyTo(u);
    parts.push(u);
    // Zeitstempel in Mikrosekunden ab dem ersten Bild, Keyframe, Lage in den Daten, Länge
    frames.push([Math.round((e.ts - t0) * 1000), e.key ? 1 : 0, off, u.byteLength]);
    off += u.byteLength;
  }
  const n = frames.length;
  const dur = n > 1 ? frames[n - 1][0] / 1000 * n / (n - 1) : 33;
  const now = new Date();
  const day = dayKey(now);
  const nr = (await allClips()).filter(c => c.day === day).reduce((m, c) => Math.max(m, c.nr), 0) + 1;
  const cfg = {
    codec: config.codec, codedWidth: config.codedWidth, codedHeight: config.codedHeight,
    description: config.description ? copyBuf(config.description) : undefined,
  };
  const meta = { day, nr, created: now.getTime(), dur, w: config.codedWidth, h: config.codedHeight, star: false, name: '', thumb: null };
  await inTx(['clips', 'data'], 'readwrite', async t => {
    const id = await reqP(t.objectStore('clips').add(meta));
    t.objectStore('data').add({ id, cfg, frames, data: new Blob(parts) });
  });
  return meta;
}

// ---------- MP4 für den Export ----------

// Die Daten liegen bereits als H.264 vor. Sie werden nur verpackt, nicht neu kodiert.
function makeMp4(cfg, frames, bytes, skip = 0) {
  const TS = 90000;
  const n = frames.length;
  const avgUs = n > 1 ? frames[n - 1][0] / (n - 1) : 33333;
  const durs = frames.map((f, i) => Math.max(1, Math.round((i < n - 1 ? frames[i + 1][0] - f[0] : avgUs) * TS / 1e6)));
  const total = durs.reduce((a, b) => a + b, 0);
  // Vorlauf nach dem Schneiden, den Player über die Edit List überspringen
  const pre = durs.slice(0, skip).reduce((a, b) => a + b, 0);
  const shown = total - pre;

  const u32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const u16 = v => [(v >>> 8) & 255, v & 255];
  const str = s => [...s].map(c => c.charCodeAt(0));
  const zeros = k => new Array(k).fill(0);
  const box = (type, ...parts) => {
    let len = 8;
    for (const p of parts) len += p.length;
    const out = new Uint8Array(len);
    out.set(u32(len), 0);
    out.set(str(type), 4);
    let o = 8;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  };
  const full = (type, ver, flags, ...parts) => box(type, [ver, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...parts);
  const matrix = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].flatMap(u32);
  const w = cfg.codedWidth, h = cfg.codedHeight;

  // Gleich lange Bilddauern werden zusammengefasst
  const stts = [];
  for (const d of durs) {
    if (stts.length && stts[stts.length - 1][1] === d) stts[stts.length - 1][0]++;
    else stts.push([1, d]);
  }
  const keys = [];
  frames.forEach((f, i) => { if (f[1]) keys.push(i + 1); });

  const ftyp = box('ftyp', str('isom'), u32(0x200), str('isomiso2avc1mp41'));
  const moov = dataOffset => box('moov',
    full('mvhd', 0, 0, u32(0), u32(0), u32(TS), u32(shown), u32(0x10000), u16(0x100), zeros(10), matrix, zeros(24), u32(2)),
    box('trak',
      full('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(shown), zeros(8), u16(0), u16(0), u16(0), u16(0), matrix, u32(w << 16), u32(h << 16)),
      box('edts', full('elst', 0, 0, u32(1), u32(shown), u32(pre), u16(1), u16(0))),
      box('mdia',
        full('mdhd', 0, 0, u32(0), u32(0), u32(TS), u32(total), u16(0x55c4), u16(0)),
        full('hdlr', 0, 0, u32(0), str('vide'), zeros(12), str('VideoHandler'), [0]),
        box('minf',
          full('vmhd', 0, 1, zeros(8)),
          box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))),
          box('stbl',
            full('stsd', 0, 0, u32(1),
              box('avc1', zeros(6), u16(1), zeros(16), u16(w), u16(h), u32(0x480000), u32(0x480000), u32(0), u16(1), zeros(32), u16(0x18), u16(0xffff),
                box('avcC', new Uint8Array(cfg.description)))),
            full('stts', 0, 0, u32(stts.length), stts.flatMap(([c, d]) => [...u32(c), ...u32(d)])),
            full('stss', 0, 0, u32(keys.length), keys.flatMap(u32)),
            full('stsc', 0, 0, u32(1), u32(1), u32(n), u32(1)),
            full('stsz', 0, 0, u32(0), u32(n), frames.flatMap(f => u32(f[3]))),
            full('stco', 0, 0, u32(1), u32(dataOffset)))))));
  const moovLen = moov(0).length;
  const mdatHead = new Uint8Array([...u32(bytes.length + 8), ...str('mdat')]);
  return new Blob([ftyp, moov(ftyp.length + moovLen + 8), mdatHead, bytes], { type: 'video/mp4' });
}

function clipFileName(c) {
  const name = c.name ? '_' + c.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') : '';
  return `LagTime_${c.day}_${pad2(c.nr)}${name}.mp4`;
}

// ---------- Ein- und Ausstieg ----------

function enterAnalysis() {
  mode = 'analysis';
  camOp(async () => { stopCamera(); });
  $('settings').classList.add('hidden');
  $('analysis').classList.remove('hidden');
  showList();
}

function leaveAnalysis() {
  closePlayer();
  $('analysis').classList.add('hidden');
  enterSettings();
  restartCamera();
}

// ---------- Liste ----------

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const hhmm = t => { const d = new Date(t); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const fmtSec = us => (us / 1e6).toFixed(2).replace('.', ',') + ' s';

function dayLabel(day) {
  const now = new Date();
  if (day === dayKey(now)) return 'Heute';
  if (day === dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return 'Gestern';
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

let listUrls = [];
let listGen = 0;
let listClips = [];
const listFilter = { star: false, name: '' };

async function showList() {
  closePlayer();
  $('aPlayer').classList.add('hidden');
  $('aList').classList.remove('hidden');
  const gen = ++listGen;
  try { await cleanupOld(); } catch (e) { console.warn(e); }
  const clips = await allClips();
  if (gen !== listGen) return;
  listClips = clips;
  renderList(clips);
  renderStorage();
  makeMissingThumbs(clips, gen);
}

function renderList(clips) {
  listUrls.forEach(u => URL.revokeObjectURL(u));
  listUrls = [];
  const grid = $('aGrid');
  grid.textContent = '';
  renderFilter(clips);
  const all = clips.length;
  clips = clips.filter(c => (!listFilter.star || c.star) && (!listFilter.name || c.name === listFilter.name));
  $('aEmpty').classList.toggle('hidden', clips.length > 0);
  $('aEmpty').textContent = all ? 'Keine Videos für diese Auswahl.' : 'Noch keine Videos gespeichert.\nIm Betrieb den Kreis unten links 1 Sekunde halten.';
  clips.sort((a, b) => b.created - a.created);
  let day = null, row = null;
  for (const c of clips) {
    if (c.day !== day) {
      day = c.day;
      grid.append(el('h3', 'day', dayLabel(day)));
      row = el('div', 'cards');
      grid.append(row);
    }
    row.append(clipCard(c));
  }
}

function renderFilter(clips) {
  const names = [...new Set(clips.map(c => c.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  if (listFilter.name && !names.includes(listFilter.name)) listFilter.name = '';
  const sel = $('fName');
  sel.textContent = '';
  sel.append(new Option('Alle Springer', ''));
  for (const nm of names) sel.append(new Option(nm, nm));
  sel.value = listFilter.name;
  sel.disabled = !names.length;
  $('fStar').classList.toggle('on', listFilter.star);
}

$('fStar').addEventListener('click', () => { listFilter.star = !listFilter.star; renderList(listClips); });
$('fName').addEventListener('change', e => { listFilter.name = e.target.value; renderList(listClips); });

function setThumb(box, blob) {
  const u = URL.createObjectURL(blob);
  listUrls.push(u);
  let img = box.querySelector('img');
  if (!img) { img = new Image(); box.prepend(img); }
  img.src = u;
}

function starText(on) { return on ? '★' : '☆'; }

function clipCard(c) {
  const card = el('div', 'card');
  card.dataset.id = c.id;
  const th = el('div', 'th');
  th.append(el('span', 'dur', Math.round(c.dur / 1000) + ' s'));
  if (c.thumb) setThumb(th, c.thumb);
  const info = el('div', 'info');
  const star = el('button', 'star' + (c.star ? ' on' : ''), starText(c.star));
  star.setAttribute('aria-label', 'Stern');
  star.addEventListener('click', async e => {
    e.stopPropagation();
    c.star = !c.star;
    star.textContent = starText(c.star);
    star.classList.toggle('on', c.star);
    await putClip(c);
    if (listFilter.star) renderList(listClips);
  });
  info.append(el('b', '', String(c.nr)), el('span', 'time', hhmm(c.created)), star);
  card.append(th, info);
  if (c.name) card.append(el('div', 'nm', c.name));
  card.addEventListener('click', () => openClip(c));
  return card;
}

async function renderStorage() {
  try {
    const { usage } = await navigator.storage.estimate();
    $('aStore').textContent = 'Belegt ' + Math.round(usage / 1048576) + ' MB';
  } catch (e) { $('aStore').textContent = ''; }
}

// Vorschaubilder entstehen erst in der Liste, damit das Speichern im Betrieb nichts dekodieren muss
async function makeMissingThumbs(clips, gen) {
  for (const c of clips) {
    if (c.thumb) continue;
    if (gen !== listGen || !$('aPlayer').classList.contains('hidden')) return;
    try {
      c.thumb = await makeThumb(c.id);
      await putClip(c);
      const box = document.querySelector(`.card[data-id="${c.id}"] .th`);
      if (box && gen === listGen) setThumb(box, c.thumb);
    } catch (e) { console.warn(e); }
  }
}

async function makeThumb(id) {
  const d = await getData(id);
  const end = d.frames[d.frames.length - 1][0];
  let k = 0;
  d.frames.forEach((f, i) => { if (f[1] && f[0] <= end - THUMB_BEFORE_END_US) k = i; });
  const [, , off, len] = d.frames[k];
  const buf = await d.data.slice(off, off + len).arrayBuffer();
  const cv = document.createElement('canvas');
  cv.width = 384; cv.height = 216;
  await new Promise((res, rej) => {
    const dec = new VideoDecoder({
      output: f => { cv.getContext('2d').drawImage(f, 0, 0, cv.width, cv.height); f.close(); },
      error: rej,
    });
    dec.configure(d.cfg);
    dec.decode(new EncodedVideoChunk({ type: 'key', timestamp: 0, data: buf }));
    dec.flush().then(() => { dec.close(); res(); }, rej);
  });
  return new Promise(res => cv.toBlob(res, 'image/jpeg', 0.75));
}

// ---------- Wiedergabe ----------

const pCanvas = $('pOut');
const pctx = pCanvas.getContext('2d', { alpha: false });
let pc = null;             // geöffnetes Video { meta, cfg, frames, bytes }
let pIndex = new Map();    // Zeitstempel zu Bildnummer
let pdec = null, pGen = 0;
let pPos = 0;              // angezeigtes Bild
let pTarget = -1;          // Bild, das gerade gesucht wird
let pPending = -1;         // nächstes Ziel, falls beim Wischen schon ein neues kommt
let pPlaying = false, pSpeed = 1;
let pQueue = [];           // dekodierte Bilder während der Wiedergabe
let pFeed = 0, pStartIdx = 0, pClock = null;
let seekDragging = false;
let loopA = -1, loopB = -1;  // Schleife von Bild loopA bis loopB, -1 bedeutet nicht gesetzt
let pFirst = 0;             // erstes sichtbares Bild, davor liegt nach dem Schneiden ein Vorlauf
let pStill = false;         // eine Bildfolge ersetzt gerade das Videobild

const loopOn = () => loopA >= 0 && loopB > loopA;

const pCount = () => (pc ? pc.frames.length : 0);

function keyBefore(i) {
  while (i > 0 && !pc.frames[i][1]) i--;
  return i;
}

function chunkAt(i) {
  const [ts, key, off, len] = pc.frames[i];
  return new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: ts, data: pc.bytes.subarray(off, off + len) });
}

function resetDecoder() {
  pGen++;
  pQueue.forEach(q => q.frame.close());
  pQueue = [];
  if (!pdec || pdec.state === 'closed') {
    pdec = new VideoDecoder({
      output: onPlayerFrame,
      error: e => { console.warn(e); pdec = null; },
    });
  } else {
    pdec.reset();
  }
  pdec.configure(pc.cfg);
}

function drawPlayer(f) {
  const w = f.displayWidth, h = f.displayHeight;
  if (pCanvas.width !== w || pCanvas.height !== h) { pCanvas.width = w; pCanvas.height = h; layoutView(); }
  pctx.drawImage(f, 0, 0, w, h);
  if (pStill) { pStill = false; $('pStill').classList.add('hidden'); }
  onPlayerFrameShown();
}

function onPlayerFrame(frame) {
  const i = pIndex.get(frame.timestamp);
  if (pPlaying) { pQueue.push({ i, frame }); return; }
  if (i === pTarget) { drawPlayer(frame); pPos = i; updatePlayerUi(); }
  frame.close();
}

// Springt auf ein Bild. Dekodiert wird ab dem Keyframe davor, also höchstens etwa eine Sekunde.
function seek(i) {
  if (!pc) return;
  i = clamp(i, pFirst, pCount() - 1);
  if (pPlaying) pause();
  if (pTarget >= 0) { pPending = i; return; }
  pTarget = i;
  try {
    resetDecoder();
    for (let k = keyBefore(i); k <= i; k++) pdec.decode(chunkAt(k));
  } catch (e) { console.warn(e); pdec = null; }
  const gen = pGen;
  const done = () => {
    if (gen !== pGen) return;
    pTarget = -1;
    if (pPending >= 0) {
      const j = pPending;
      pPending = -1;
      if (j !== pPos) seek(j);
    }
  };
  if (pdec) pdec.flush().then(done, done);
  else done();
}

// Letztes Bild der Wiedergabe, bei aktiver Schleife deren Ende
const playEnd = () => (loopOn() ? loopB : pCount() - 1);

function startFeed(i) {
  resetDecoder();
  pFeed = keyBefore(i);
  pStartIdx = i;
  pClock = null;
}

function play() {
  if (!pc || pPlaying) return;
  if (loopOn() && (pPos < loopA || pPos >= loopB)) pPos = loopA;
  else if (pPos >= pCount() - 1) pPos = pFirst;   // am Ende beginnt die Wiedergabe von vorn
  pTarget = -1; pPending = -1;
  pPlaying = true;
  startFeed(pPos);
  requestAnimationFrame(playerTick);
  updatePlayerUi();
}

function pause() {
  if (!pPlaying) return;
  pPlaying = false;
  pQueue.forEach(q => q.frame.close());
  pQueue = [];
  updatePlayerUi();
}

function playerTick(now) {
  if (!pPlaying || !pc) return;
  requestAnimationFrame(playerTick);
  const last = playEnd();
  try {
    while (pdec && pFeed <= last && pdec.decodeQueueSize < 4 && pQueue.length < 6) {
      pdec.decode(chunkAt(pFeed++));
      if (pFeed === last + 1) pdec.flush().catch(() => {});
    }
  } catch (e) { console.warn(e); pause(); return; }
  while (pQueue.length && pQueue[0].i < pStartIdx) pQueue.shift().frame.close();
  if (!pQueue.length) return;
  if (!pClock) pClock = { wall: now, ts: pc.frames[pQueue[0].i][0] };
  const mediaNow = pClock.ts + (now - pClock.wall) * 1000 * pSpeed;
  let show = null;
  while (pQueue.length && pc.frames[pQueue[0].i][0] <= mediaNow) {
    if (show) show.frame.close();
    show = pQueue.shift();
  }
  if (show) {
    drawPlayer(show.frame);
    pPos = show.i;
    show.frame.close();
    updatePlayerUi();
  }
  if (pPos >= last) {
    if (loopOn()) startFeed(loopA);
    else pause();
  }
}

function renderLoop() {
  const b = $('pLoop'), band = $('pBand');
  const on = loopOn();
  b.querySelector('b').textContent = loopA < 0 ? 'Anfang' : on ? 'Aus' : 'Ende';
  b.classList.toggle('set', loopA >= 0);
  const n = Math.max(1, pCount() - 1 - pFirst);
  band.classList.toggle('hidden', loopA < 0);
  band.style.setProperty('--a', (loopA < 0 ? 0 : loopA - pFirst) / n);
  band.style.setProperty('--w', on ? (loopB - loopA) / n : 0);
}

// Erster Druck setzt den Anfang, zweiter das Ende, dritter hebt die Schleife auf
$('pLoop').addEventListener('click', () => {
  if (!pc) return;
  if (loopA < 0) loopA = pPos;
  else if (!loopOn()) {
    if (pPos === loopA) return;
    [loopA, loopB] = [Math.min(loopA, pPos), Math.max(loopA, pPos)];
  } else { loopA = -1; loopB = -1; }
  renderLoop();
});

function setSpeed(s) {
  if (pPlaying && pClock) pClock = { wall: performance.now(), ts: pc.frames[pPos][0] };
  pSpeed = s;
  updatePlayerUi();
}

function updatePlayerUi() {
  if (!pc) return;
  const n = pCount();
  if (!seekDragging) $('pSeek').value = pPos;
  fillRange($('pSeek'));
  $('pTime').textContent = fmtSec(pc.frames[pPos][0] - pc.frames[pFirst][0]) + ' / ' + fmtSec(pc.meta.dur * 1000);
  $('pPlay').classList.toggle('playing', pPlaying);
  $('pPlay').setAttribute('aria-label', pPlaying ? 'Anhalten' : 'Abspielen');
  for (const b of $('pSpeed').querySelectorAll('button')) b.classList.toggle('on', +b.dataset.v === pSpeed);
  $('pPrev').disabled = pPos <= pFirst;
  $('pNext').disabled = pPos >= n - 1;
}

async function openClip(c) {
  const d = await getData(c.id);
  if (!d) return;
  closePlayer();
  pc = { meta: c, cfg: d.cfg, frames: d.frames, bytes: new Uint8Array(await d.data.arrayBuffer()) };
  pIndex = new Map(pc.frames.map((f, i) => [f[0], i]));
  pFirst = clamp(d.skip || 0, 0, pc.frames.length - 1);
  pPos = pFirst; pTarget = -1; pPending = -1; pPlaying = false; pStill = false;
  $('pStill').classList.add('hidden');
  closeRange();
  loopA = -1; loopB = -1;
  $('aList').classList.add('hidden');
  $('aPlayer').classList.remove('hidden');
  resetDrawing();
  renderLoop();
  $('pTitle').textContent = `${dayLabel(c.day)} · ${c.nr} · ${hhmm(c.created)}`;
  $('pName').value = c.name || '';
  renderStar();
  resetDelete();
  $('pSeek').min = pFirst;
  $('pSeek').max = pCount() - 1;
  pctx.fillStyle = '#000';
  pctx.fillRect(0, 0, pCanvas.width, pCanvas.height);
  updatePlayerUi();
  seek(pFirst);
  // Bereits vergebene Namen als Vorschläge
  const names = [...new Set((await allClips()).map(x => x.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  const dl = $('pNames');
  dl.textContent = '';
  for (const nm of names) { const o = document.createElement('option'); o.value = nm; dl.append(o); }
}

function closePlayer() {
  if (!pc) return;
  pause();
  pGen++;
  if (pdec && pdec.state !== 'closed') { try { pdec.close(); } catch (e) {} }
  pdec = null;
  pc = null;
  pTarget = -1; pPending = -1;
}

function renderStar() {
  const on = !!(pc && pc.meta.star);
  $('pStar').textContent = starText(on);
  $('pStar').classList.toggle('on', on);
}

// Löschen braucht einen zweiten Druck innerhalb von 3 Sekunden
let delTimer = 0;
function resetDelete() {
  clearTimeout(delTimer);
  $('pDel').classList.remove('armed');
  $('pDel').textContent = 'Löschen';
}

// ---------- Bedienung ----------

// Umschaltung oben zwischen Live und Analyse
document.addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  if (b.dataset.tab === 'analyse' && mode === 'settings') { goFullscreen(); enterAnalysis(); }
  else if (b.dataset.tab === 'live' && mode === 'analysis') leaveAnalysis();
});
$('pBack').addEventListener('click', showList);

$('pPlay').addEventListener('click', () => (pPlaying ? pause() : play()));
$('pPrev').addEventListener('click', () => seek(pPos - 1));
$('pNext').addEventListener('click', () => seek(pPos + 1));
$('pSpeed').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) setSpeed(+b.dataset.v);
});

const pSeek = $('pSeek');
pSeek.addEventListener('pointerdown', () => { seekDragging = true; });
for (const type of ['pointerup', 'pointercancel']) pSeek.addEventListener(type, () => { seekDragging = false; });
pSeek.addEventListener('input', () => { fillRange(pSeek); seek(+pSeek.value); });
pSeek.addEventListener('change', () => { seekDragging = false; });

$('pStar').addEventListener('click', async () => {
  if (!pc) return;
  pc.meta.star = !pc.meta.star;
  renderStar();
  await putClip(pc.meta);
});

$('pName').addEventListener('change', async () => {
  if (!pc) return;
  pc.meta.name = $('pName').value.trim();
  await putClip(pc.meta);
});
$('pName').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });

function download(file) {
  const u = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = u;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}

// Die Datei entsteht ohne Warten, damit Chrome das Herunterladen als Folge des Tippens erlaubt
function currentFile() {
  return new File([makeMp4(pc.cfg, pc.frames, pc.bytes, pFirst)], clipFileName(pc.meta), { type: 'video/mp4' });
}

$('pDown').addEventListener('click', () => {
  if (!pc) return;
  pause();
  download(currentFile());
});

$('pDel').addEventListener('click', async () => {
  if (!pc) return;
  const b = $('pDel');
  if (!b.classList.contains('armed')) {
    b.classList.add('armed');
    b.textContent = 'Wirklich löschen?';
    delTimer = setTimeout(resetDelete, 3000);
    return;
  }
  resetDelete();
  const id = pc.meta.id;
  closePlayer();
  await deleteClip(id);
  showList();
});

// ---------- Foto ----------

// Speichert das angezeigte Bild mit Zeichnung, aber ohne die Griffe
function savePhoto() {
  if (!pc) return;
  pause();
  const c = document.createElement('canvas');
  c.width = pCanvas.width;
  c.height = pCanvas.height;
  const x = c.getContext('2d');
  x.drawImage(pCanvas, 0, 0);
  renderDrawing(false);
  x.drawImage(dCanvas, 0, 0, c.width, c.height);
  renderDrawing();
  const t = ((pc.frames[pPos][0] - pc.frames[pFirst][0]) / 1e6).toFixed(2).replace('.', ',');
  const name = clipFileName(pc.meta).replace(/\.mp4$/, pStill ? '_Bildfolge.jpg' : `_${t}s.jpg`);
  c.toBlob(b => download(new File([b], name, { type: 'image/jpeg' })), 'image/jpeg', 0.92);
}
$('dPhoto').addEventListener('click', savePhoto);

// ---------- Abschnitt wählen für Schneiden und Bildfolge ----------

const STROBE_MIN = 3, STROBE_MAX = 16;
const MIN_RANGE = 3;          // so viele Bilder liegen mindestens zwischen Anfang und Ende
let rangeMode = null;         // cut oder strobe
let strobeCount = 8;
let selA = 0, selB = 0;       // gewählter Abschnitt, Anfang und Ende als Bildnummern

const selFrac = i => (i - pFirst) / Math.max(1, pCount() - 1 - pFirst);

function openRange(kind) {
  if (!pc) return;
  if (rangeMode === kind) { closeRange(); return; }
  pause();
  rangeMode = kind;
  const n = pCount();
  let a, b;
  if (loopOn()) { a = loopA; b = loopB; }
  else if (kind === 'cut') { a = pFirst; b = n - 1; }
  else { a = Math.max(pFirst, pPos - 30); b = Math.min(n - 1, pPos + 30); }
  if (b - a < MIN_RANGE) { a = pFirst; b = n - 1; }
  selA = a; selB = b;
  for (const id of ['hA', 'hB', 'pSel']) $(id).classList.remove('hidden');
  $('rgCountBox').classList.toggle('hidden', kind !== 'strobe');
  $('rgOk').textContent = kind === 'cut' ? 'Schneiden' : 'Erstellen';
  $('rgOk').disabled = false;
  $('dCut').classList.toggle('on', kind === 'cut');
  $('dStrobe').classList.toggle('on', kind === 'strobe');
  $('pRange').classList.remove('hidden');
  renderRange();
}

function closeRange() {
  rangeMode = null;
  $('pRange').classList.add('hidden');
  for (const id of ['hA', 'hB', 'pSel']) $(id).classList.add('hidden');
  $('dCut').classList.remove('on');
  $('dStrobe').classList.remove('on');
}

function renderRange() {
  $('hA').style.setProperty('--x', selFrac(selA));
  $('hB').style.setProperty('--x', selFrac(selB));
  $('pSel').style.setProperty('--a', selFrac(selA));
  $('pSel').style.setProperty('--w', selFrac(selB) - selFrac(selA));
  $('rgInfo').textContent = fmtSec(pc.frames[selB][0] - pc.frames[selA][0]);
  $('rgCount').textContent = strobeCount;
}

// Die Punkte für Anfang und Ende liegen auf dem Zeitregler und können sich nicht überholen.
// Beim Ziehen zeigt das Video das gewählte Bild.
for (const [id, isA] of [['hA', true], ['hB', false]]) {
  const h = $(id);
  let drag = null;
  const moveTo = i => {
    if (isA) selA = clamp(i, pFirst, selB - MIN_RANGE);
    else selB = clamp(i, selA + MIN_RANGE, pCount() - 1);
    renderRange();
    seek(isA ? selA : selB);
  };
  h.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    drag = e.pointerId;
    try { h.setPointerCapture(e.pointerId); } catch (x) {}
    seek(isA ? selA : selB);
  });
  h.addEventListener('pointermove', e => {
    if (drag !== e.pointerId) return;
    const r = $('pSeek').getBoundingClientRect();
    const f = clamp((e.clientX - r.left - 13) / (r.width - 26), 0, 1);
    moveTo(Math.round(pFirst + f * (pCount() - 1 - pFirst)));
  });
  for (const type of ['pointerup', 'pointercancel']) h.addEventListener(type, e => { if (drag === e.pointerId) drag = null; });
}
$('rgMinus').addEventListener('click', () => { strobeCount = Math.max(STROBE_MIN, strobeCount - 1); renderRange(); });
$('rgPlus').addEventListener('click', () => { strobeCount = Math.min(STROBE_MAX, strobeCount + 1); renderRange(); });
$('rgCancel').addEventListener('click', closeRange);
$('dCut').addEventListener('click', () => openRange('cut'));
$('dStrobe').addEventListener('click', () => openRange('strobe'));

$('rgOk').addEventListener('click', async () => {
  if (!pc || !rangeMode) return;
  const a = selA, b = selB;
  const ok = $('rgOk');
  ok.disabled = true;
  ok.textContent = rangeMode === 'cut' ? 'Wird geschnitten …' : 'Wird erstellt …';
  try {
    if (rangeMode === 'cut') await cutClip(a, b);
    else { await makeStrobe(a, b, strobeCount); closeRange(); }
  } catch (e) {
    console.warn(e);
    ok.textContent = 'Fehler';
    ok.disabled = false;
  }
});

// ---------- Schneiden ----------

// Das Original wird ersetzt. Ab dem Keyframe vor dem Anfang bleibt ein unsichtbarer Vorlauf,
// damit nichts neu kodiert werden muss.
async function cutClip(a, b) {
  const fr = pc.frames;
  const k = keyBefore(a);
  const base = fr[k][0], off0 = fr[k][2];
  const end = fr[b][2] + fr[b][3];
  const frames = fr.slice(k, b + 1).map(([ts, key, off, len]) => [ts - base, key, off - off0, len]);
  const skip = a - k;
  const shown = frames.length - skip;
  const meta = pc.meta;
  meta.dur = shown > 1 ? (frames[frames.length - 1][0] - frames[skip][0]) / 1000 * shown / (shown - 1) : 33;
  meta.thumb = null;
  const rec = { id: meta.id, cfg: pc.cfg, frames, skip, data: new Blob([pc.bytes.subarray(off0, end)]) };
  await inTx(['clips', 'data'], 'readwrite', t => {
    t.objectStore('clips').put(meta);
    t.objectStore('data').put(rec);
  });
  await openClip(meta);
}

// ---------- Bildfolge ----------

const STROBE_W = 1280, STROBE_H = 720;   // Arbeitsgröße, spart Speicher auf dem Tablet
const STROBE_CELL = 4;                    // Raster für die Erkennung des Springers
const STROBE_THRESHOLD = 28;              // Helligkeitsabstand zum Hintergrund, ab dem ein Punkt zum Springer gehört

async function makeStrobe(a, b, count) {
  const idx = [...new Set(Array.from({ length: count }, (_, j) => Math.round(a + (b - a) * j / (count - 1))))];
  const want = new Map(idx.map((i, j) => [pc.frames[i][0], j]));
  const cvs = idx.map(() => {
    const c = document.createElement('canvas');
    c.width = STROBE_W; c.height = STROBE_H;
    return c;
  });
  // Ein eigener Decoder läuft einmal durch den Abschnitt und behält nur die gewünschten Bilder
  await new Promise((res, rej) => {
    const dec = new VideoDecoder({
      output: f => {
        const j = want.get(f.timestamp);
        if (j !== undefined) cvs[j].getContext('2d').drawImage(f, 0, 0, STROBE_W, STROBE_H);
        f.close();
      },
      error: rej,
    });
    dec.configure(pc.cfg);
    for (let i = keyBefore(a); i <= b; i++) dec.decode(chunkAt(i));
    dec.flush().then(() => { dec.close(); res(); }, rej);
  });

  const n = cvs.length;
  const gw = STROBE_W / STROBE_CELL, gh = STROBE_H / STROBE_CELL, cells = gw * gh;
  // Helligkeit auf einem groben Raster
  const small = cvs.map(c => {
    const s = document.createElement('canvas');
    s.width = gw; s.height = gh;
    const x = s.getContext('2d');
    x.drawImage(c, 0, 0, gw, gh);
    const d = x.getImageData(0, 0, gw, gh).data;
    const L = new Uint8Array(cells);
    for (let i = 0; i < cells; i++) L[i] = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8;
    return L;
  });
  // Der Median über alle Bilder ist der Hintergrund ohne Springer.
  // Pro Rasterfeld wird das Bild gemerkt, das dem Hintergrund am nächsten kommt.
  const bgPick = new Uint8Array(cells);
  const masks = small.map(() => new Uint8Array(cells));
  const tmp = new Uint8Array(n);
  for (let p = 0; p < cells; p++) {
    for (let j = 0; j < n; j++) tmp[j] = small[j][p];
    tmp.sort();
    const med = tmp[n >> 1];
    let best = 0, bestD = 999;
    for (let j = 0; j < n; j++) {
      const dd = Math.abs(small[j][p] - med);
      if (dd < bestD) { bestD = dd; best = j; }
      if (dd > STROBE_THRESHOLD) masks[j][p] = 1;
    }
    bgPick[p] = best;
  }
  // Masken um ein Feld erweitern, damit die Ränder des Springers nicht abgeschnitten werden
  const grown = masks.map(m => {
    const g = new Uint8Array(cells);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      if (!m[y * gw + x]) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy, xx = x + dx;
        if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) g[yy * gw + xx] = 1;
      }
    }
    return g;
  });
  const imgs = cvs.map(c => c.getContext('2d').getImageData(0, 0, STROBE_W, STROBE_H).data);
  const out = new ImageData(STROBE_W, STROBE_H);
  const od = out.data;
  for (let y = 0; y < STROBE_H; y++) {
    const row = ((y / STROBE_CELL) | 0) * gw;
    for (let x = 0; x < STROBE_W; x++) {
      const cell = row + ((x / STROBE_CELL) | 0);
      let j = bgPick[cell];
      for (let k = n - 1; k >= 0; k--) if (grown[k][cell]) { j = k; break; }   // spätere Bilder liegen oben
      const p = (y * STROBE_W + x) * 4, s = imgs[j];
      od[p] = s[p]; od[p + 1] = s[p + 1]; od[p + 2] = s[p + 2]; od[p + 3] = 255;
    }
  }
  pCanvas.width = STROBE_W;
  pCanvas.height = STROBE_H;
  pctx.putImageData(out, 0, 0);
  layoutView();
  onPlayerFrameShown();
  pStill = true;
  $('pStill').textContent = `Bildfolge · ${n} Bilder`;
  $('pStill').classList.remove('hidden');
}

// ---------- Start ----------

// Chrome soll die Videos auch bei knappem Speicher nicht selbst löschen
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
cleanupOld().catch(e => console.warn(e));
