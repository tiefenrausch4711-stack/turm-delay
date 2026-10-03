'use strict';

// Gespeicherte Videos und Analysemodus. Nutzt Hilfen aus app.js wie $, clamp und mode.

const DB_NAME = 'lagcam-test';
const THUMB_BEFORE_END_US = 2e6;   // Vorschaubild etwa 2 Sekunden vor dem Ende, dort liegt meist der Sprung

// ---------- Datenbank ----------

let dbPromise = null;
function db() {
  if (!dbPromise) dbPromise = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 2);
    r.onupgradeneeded = () => {
      // clips enthält die kleinen Angaben für die Liste, data das eigentliche Video,
      // images die gespeicherten Bilder, jedes einem Video zugeordnet
      const d = r.result;
      if (!d.objectStoreNames.contains('clips')) d.createObjectStore('clips', { keyPath: 'id', autoIncrement: true });
      if (!d.objectStoreNames.contains('data')) d.createObjectStore('data', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('images')) d.createObjectStore('images', { keyPath: 'id', autoIncrement: true }).createIndex('clipId', 'clipId');
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
const allImages = () => inTx(['images'], 'readonly', t => reqP(t.objectStore('images').getAll()));
const putImage = im => inTx(['images'], 'readwrite', t => reqP(t.objectStore('images').put(im)));
const deleteImage = id => inTx(['images'], 'readwrite', t => { t.objectStore('images').delete(id); });

// Mit dem Video verschwinden auch seine Bilder
const deleteClip = id => inTx(['clips', 'data', 'images'], 'readwrite', async t => {
  t.objectStore('clips').delete(id);
  t.objectStore('data').delete(id);
  const keys = await reqP(t.objectStore('images').index('clipId').getAllKeys(id));
  for (const k of keys) t.objectStore('images').delete(k);
});

async function cleanupOld() {
  if (!settings.keepDays) return;   // nie löschen
  const limit = Date.now() - settings.keepDays * 864e5;
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
  // Nummern eines Tages steigen nur. Auch nach dem Löschen wird keine Nummer wieder vergeben,
  // damit heruntergeladene Dateien eindeutig bleiben.
  const used = (await allClips()).filter(c => c.day === day).reduce((m, c) => Math.max(m, c.nr), 0);
  const last = settings.lastNr && settings.lastNr.day === day ? settings.lastNr.nr : 0;
  const nr = Math.max(used, last) + 1;
  settings.lastNr = { day, nr };
  saveSettings();
  const cfg = {
    codec: config.codec, codedWidth: config.codedWidth, codedHeight: config.codedHeight,
    description: config.description ? copyBuf(config.description) : undefined,
  };
  const meta = { day, nr, created: now.getTime(), dur, w: config.codedWidth, h: config.codedHeight, star: false, name: '', prop: '', thumb: null };
  await inTx(['clips', 'data'], 'readwrite', async t => {
    const id = await reqP(t.objectStore('clips').add(meta));
    meta.id = id;
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

// 2026-10-02-Teo_Kopfsprung_V3.mp4 und 2026-10-02-Teo_Kopfsprung_V3_B1.jpg.
// Fehlen Name oder Stichwort, entfällt der jeweilige Teil.
const cleanPart = v => (v || '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
function clipBaseName(c) {
  const name = cleanPart(c.name), prop = cleanPart(c.prop);
  return `${c.day}${name ? '-' + name : ''}${prop ? '_' + prop : ''}_V${c.nr}`;
}
const clipFileName = c => clipBaseName(c) + '.mp4';
const imageFileName = (c, im) => `${clipBaseName(c)}_B${im.n}.jpg`;
const clipLabel = c => 'V' + c.nr;
const imageLabel = (c, im) => `V${c.nr}_B${im.n}`;

// ---------- Ein- und Ausstieg ----------

// Die Kamera läuft in der Analyse noch eine Weile weiter. Dann ist das Bild beim Zurückkehren
// sofort da. Die USB-Kamera der Android-App braucht einen Decoder, den der Player braucht.
// Sie geht deshalb gleich aus.
const ANALYSIS_CAM_MS = 3 * 60 * 1000;
let analysisCamTimer = 0;

function enterAnalysis() {
  mode = 'analysis';
  // Jedes Öffnen beginnt mit allen Videos, ohne Filter und oben in der Liste
  Object.assign(listFilter, { kind: 'videos', star: false, name: '', prop: '' });
  listScroll = null;
  $('aGrid').scrollTop = 0;
  history.pushState({ v: 'list' }, '');
  clearTimeout(analysisCamTimer);
  const stopCam = () => { if (mode === 'analysis') camOp(async () => { stopCamera(); }); };
  if (NATIVE && settings.facing === 'external') stopCam();
  else analysisCamTimer = setTimeout(stopCam, ANALYSIS_CAM_MS);
  $('settings').classList.add('hidden');
  $('analysis').classList.remove('hidden');
  showList();
}

// ---------- Videoseite direkt aus dem Betrieb ----------
// Die Kamera nimmt weiter in den Puffer auf. Zurück geht es in die verzögerte Wiedergabe.

async function enterReview(p) {
  if (reviewing || mode !== 'run') return;
  const saved = await p.catch(() => null);
  if (!saved || reviewing || mode !== 'run') return;
  clearRecent();
  cancelPress();
  reviewing = true;
  releaseRunDecoder();
  history.pushState({ v: 'review' }, '');
  listClips = await allClips();
  listImages = (await allImages()).filter(im => clipById(im.clipId));
  $('pBack').textContent = '‹ Wiedergabe';
  $('aPlayer').classList.add('review');
  $('run').classList.add('hidden');
  $('analysis').classList.remove('hidden');
  try { await openClip(clipById(saved.id) || saved); }
  catch (e) { console.warn(e); }
  // Ohne Video zurück in die Wiedergabe
  if (!pc && reviewing) history.back();
}

async function leaveReview() {
  await flushImageEdits();
  closePlayer();
  closeRange();
  $('aPlayer').classList.add('hidden');
  $('aPlayer').classList.remove('review');
  $('analysis').classList.add('hidden');
  $('pBack').textContent = '‹ Übersicht';
  restartRunPlayback();
  reviewing = false;
  $('run').classList.remove('hidden');
}

function leaveAnalysis() {
  closePlayer();
  closeThumbDecoder();
  $('analysis').classList.add('hidden');
  clearTimeout(analysisCamTimer);
  const live = camState === 'ok' && track && track.readyState === 'live';
  enterSettings();
  if (!live) restartCamera();
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
let listScroll = null;   // Position der Liste, bevor ein Video geöffnet wurde
let listClips = [];
let listImages = [];
const listFilter = { kind: 'videos', star: false, name: '', prop: '' };

// Gilt für Videos und für Bilder, Bilder übernehmen Stern, Name und Stichwort von ihrem Video
const passesFilter = c => (!listFilter.star || c.star) && (!listFilter.name || c.name === listFilter.name) && (!listFilter.prop || c.prop === listFilter.prop);
const clipById = id => listClips.find(c => c.id === id);

async function showList() {
  await flushImageEdits();
  closePlayer();
  $('aPlayer').classList.add('hidden');
  $('aList').classList.remove('hidden');
  const gen = ++listGen;
  try { await cleanupOld(); } catch (e) { console.warn(e); }
  const clips = await allClips();
  const images = await allImages();
  if (gen !== listGen) return;
  listClips = clips;
  listImages = images.filter(im => clipById(im.clipId));
  // Vorhandene Namen und Stichwörter gelten als je eingetragen
  rememberTerms('name', clips.map(c => c.name));
  rememberTerms('prop', clips.map(c => c.prop));
  renderList(clips);
  if (listScroll !== null) { $('aGrid').scrollTop = listScroll; listScroll = null; }
  renderStorage();
  makeMissingThumbs(clips, gen);
}

function renderList(clips) {
  // Alte Vorschaubilder erst freigeben, wenn die neuen Kacheln stehen, sonst laden sie ins Leere
  const old = listUrls;
  setTimeout(() => old.forEach(u => URL.revokeObjectURL(u)), 3000);
  listUrls = [];
  const grid = $('aGrid');
  grid.textContent = '';
  renderFilter(clips);
  const images = listFilter.kind === 'images';
  // Einträge sind Videos oder Bilder, nie gemischt
  let items = images
    ? listImages.map(im => ({ im, c: clipById(im.clipId) })).filter(x => passesFilter(x.c))
    : clips.filter(passesFilter).map(c => ({ c }));
  const all = images ? listImages.length : clips.length;
  $('aEmpty').classList.toggle('hidden', items.length > 0);
  $('aEmpty').textContent = images
    ? (all ? 'Keine Bilder für diese Auswahl.' : 'Noch keine Bilder gespeichert.')
    : (all ? 'Keine Videos für diese Auswahl.' : 'Noch keine Videos gespeichert.');
  // Neueste Videos zuerst, die Bilder eines Videos in ihrer Reihenfolge B1, B2, B3
  items.sort((a, b) => b.c.created - a.c.created || (a.im ? a.im.n - b.im.n : 0));
  let day = null, row = null;
  for (const x of items) {
    if (x.c.day !== day) {
      day = x.c.day;
      grid.append(el('h3', 'day', dayLabel(day)));
      row = el('div', 'cards');
      grid.append(row);
    }
    row.append(x.im ? imageCard(x.c, x.im) : clipCard(x.c));
  }
}

function fillSelect(sel, label, values, current) {
  sel.textContent = '';
  sel.append(new Option(label, ''));
  for (const v of values) sel.append(new Option(v, v));
  sel.value = current;
  sel.disabled = !values.length;
}

const sortedValues = (clips, key) => [...new Set(clips.map(c => c[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));

function renderFilter(clips) {
  const names = sortedValues(clips, 'name'), props = sortedValues(clips, 'prop');
  if (listFilter.name && !names.includes(listFilter.name)) listFilter.name = '';
  if (listFilter.prop && !props.includes(listFilter.prop)) listFilter.prop = '';
  fillSelect($('fName'), 'Name', names, listFilter.name);
  fillSelect($('fProp'), 'Stichwort', props, listFilter.prop);
  $('fStar').classList.toggle('on', listFilter.star);
  $('fStar').disabled = !clips.length;
  for (const b of $('fKind').querySelectorAll('button')) b.classList.toggle('on', b.dataset.k === listFilter.kind);
}

// Aufbewahrung der Videos ohne Stern, 1 bis 30 Tage oder nie, einstellbar unten in der Liste.
// Nie ist intern 0 und folgt als Stufe auf 30.
const KEEP_MIN = 1, KEEP_MAX = 30;
const keepRaw = Math.round(+settings.keepDays);
settings.keepDays = keepRaw === 0 ? 0 : clamp(keepRaw || 7, KEEP_MIN, KEEP_MAX);
let keepTimer = 0;

function renderKeep() {
  const d = settings.keepDays;
  $('keepLabel').textContent = d ? 'Videos ohne Stern löschen nach' : 'Videos ohne Stern löschen';
  $('keepDays').textContent = !d ? 'nie' : d === 1 ? '1 Tag' : d + ' Tagen';
  $('keepMinus').disabled = d === KEEP_MIN;
  $('keepPlus').disabled = d === 0;
}

function stepKeep(delta) {
  const d = settings.keepDays || KEEP_MAX + 1;   // nie liegt eine Stufe über 30
  const next = clamp(d + delta, KEEP_MIN, KEEP_MAX + 1);
  settings.keepDays = next > KEEP_MAX ? 0 : next;
  saveSettings();
  renderKeep();
  // Erst kurz nach dem letzten Tippen aufräumen, eine kürzere Frist löscht dann sofort
  clearTimeout(keepTimer);
  keepTimer = setTimeout(() => { if (mode === 'analysis' && !viewMode) showList(); }, 1500);
}
$('keepMinus').addEventListener('click', () => stepKeep(-1));
$('keepPlus').addEventListener('click', () => stepKeep(1));
renderKeep();

$('fStar').addEventListener('click', () => { listFilter.star = !listFilter.star; renderList(listClips); });
$('fName').addEventListener('change', e => { listFilter.name = e.target.value; renderList(listClips); });
$('fProp').addEventListener('change', e => { listFilter.prop = e.target.value; renderList(listClips); });
$('fKind').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.dataset.k === listFilter.kind) return;
  listFilter.kind = b.dataset.k;
  $('aGrid').scrollTop = 0;
  renderList(listClips);
});

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
  info.append(el('b', '', clipLabel(c)), el('span', 'time', hhmm(c.created)));
  const who = [c.name, c.prop].filter(Boolean).join(' · ');
  if (who) info.append(el('span', 'nm', who));
  info.append(star);
  const n = listImages.filter(im => im.clipId === c.id).length;
  if (n) th.append(el('span', 'imgs', n === 1 ? '1 Bild' : n + ' Bilder'));
  card.append(th, info);
  card.addEventListener('click', () => {
    listScroll = $('aGrid').scrollTop;
    history.pushState({ v: 'player' }, '');
    openClip(c);
  });
  return card;
}

function imageCard(c, im) {
  const card = el('div', 'card');
  const th = el('div', 'th');
  if (im.thumb) setThumb(th, im.thumb);
  const info = el('div', 'info');
  info.append(el('b', '', imageLabel(c, im)), el('span', 'time', hhmm(c.created)));
  const who = [c.name, c.prop].filter(Boolean).join(' · ');
  if (who) info.append(el('span', 'nm', who));
  if (c.star) info.append(el('span', 'star on', '★'));
  card.append(th, info);
  card.addEventListener('click', () => {
    listScroll = $('aGrid').scrollTop;
    history.pushState({ v: 'player' }, '');
    openImage(im);
  });
  return card;
}

// Zeigt nur den Platz der Videos, nicht den der Offline-Dateien
async function renderStorage() {
  try {
    const recs = await inTx(['data'], 'readonly', t => reqP(t.objectStore('data').getAll()));
    const imgs = await allImages();
    const mb = (recs.reduce((s, r) => s + (r.data ? r.data.size : 0), 0)
      + imgs.reduce((s, im) => s + (im.base ? im.base.size : 0) + (im.thumb ? im.thumb.size : 0), 0)) / 1048576;
    $('uiStore').textContent = 'Belegter Speicher ' + (!mb ? '0' : mb < 10 ? mb.toFixed(1).replace('.', ',') : Math.round(mb)) + ' MB';
  } catch (e) { $('uiStore').textContent = ''; }
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

// Ein gemeinsamer Decoder für alle Vorschaubilder, sie entstehen nacheinander
let thumbDec = null, thumbOut = null, thumbChain = Promise.resolve();

function thumbDecoder() {
  if (!thumbDec || thumbDec.state === 'closed') {
    thumbDec = new VideoDecoder({
      output: f => { if (thumbOut) thumbOut(f); f.close(); },
      error: e => { console.warn(e); thumbDec = null; },
    });
  }
  return thumbDec;
}

function closeThumbDecoder() {
  if (thumbDec && thumbDec.state !== 'closed') { try { thumbDec.close(); } catch (e) {} }
  thumbDec = null;
}

function makeThumb(id) {
  const p = thumbChain.then(() => makeThumbNow(id));
  thumbChain = p.catch(() => {});
  return p;
}

async function makeThumbNow(id) {
  const d = await getData(id);
  const fr = d.frames, skip = d.skip || 0;
  const end = fr[fr.length - 1][0];
  // Bild etwa 2 Sekunden vor dem Ende, aber nie aus dem Vorlauf vor einem Schnitt.
  // Liegt das Vollbild davor im sichtbaren Teil, reicht es allein, dann muss nur ein Bild dekodiert werden.
  let t = fr.length - 1;
  while (t > skip && fr[t][0] > end - THUMB_BEFORE_END_US) t--;
  let k = t;
  while (k > 0 && !fr[k][1]) k--;
  if (k >= skip) t = k;
  const base = fr[k][2];
  const bytes = new Uint8Array(await d.data.slice(base, fr[t][2] + fr[t][3]).arrayBuffer());
  const cv = document.createElement('canvas');
  cv.width = 384; cv.height = 216;
  const dec = thumbDecoder();
  thumbOut = f => { if (f.timestamp === fr[t][0]) cv.getContext('2d').drawImage(f, 0, 0, cv.width, cv.height); };
  try {
    dec.configure(d.cfg);
    for (let i = k; i <= t; i++) {
      const [ts, key, off, len] = fr[i];
      dec.decode(new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: ts, data: bytes.subarray(off - base, off - base + len) }));
    }
    await dec.flush();
  } finally { thumbOut = null; }
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
let viewMode = null;        // video oder image, solange ein Fenster offen ist
let pimg = null;            // geöffnetes Bild { rec, clip }
let pFirst = 0;             // erstes sichtbares Bild, davor liegt nach dem Schneiden ein Vorlauf
let pStill = false;         // eine Bildfolge ersetzt gerade das Videobild


const pCount = () => (pc ? pc.frames.length : 0);

function keyBefore(i) {
  while (i > 0 && !pc.frames[i][1]) i--;
  return i;
}

function chunkAt(i) {
  const [ts, key, off, len] = pc.frames[i];
  return new EncodedVideoChunk({ type: key ? 'key' : 'delta', timestamp: ts, data: pc.bytes.subarray(off, off + len) });
}

// Scheitert der Hardware-Decoder, etwa weil alle belegt sind, dekodiert die App das Video in Software
let pSoft = false;
function resetDecoder() {
  pGen++;
  pQueue.forEach(q => q.frame.close());
  pQueue = [];
  if (!pdec || pdec.state === 'closed') {
    pdec = new VideoDecoder({
      output: onPlayerFrame,
      error: e => {
        console.warn(e);
        pdec = null;
        if (pSoft || !pc) return;
        pSoft = true;
        const i = pTarget >= 0 ? pTarget : pPos;
        setTimeout(() => { if (!pc) return; pTarget = -1; pPending = -1; seek(i); }, 0);
      },
    });
  } else {
    pdec.reset();
  }
  pdec.configure(pSoft ? { ...pc.cfg, hardwareAcceleration: 'prefer-software' } : pc.cfg);
}

function drawPlayer(f) {
  const w = f.displayWidth, h = f.displayHeight;
  if (pCanvas.width !== w || pCanvas.height !== h) { pCanvas.width = w; pCanvas.height = h; layoutView(); }
  pctx.drawImage(f, 0, 0, w, h);
  if (pStill) { pStill = false; $('pStill').classList.add('hidden'); renderSaveBtn(); }
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
  // Kommt nach 1,5 s kein Bild, hängt der Hardware-Decoder. Dann in Software noch einmal.
  setTimeout(() => {
    if (gen !== pGen || pTarget !== i || pSoft || !pc) return;
    pSoft = true;
    if (pdec) { try { pdec.close(); } catch (e) {} }
    pdec = null;
    pTarget = -1; pPending = -1;
    seek(i);
  }, 1500);
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

const playEnd = () => pCount() - 1;

function startFeed(i) {
  resetDecoder();
  pFeed = keyBefore(i);
  pStartIdx = i;
  pClock = null;
}

function play() {
  if (!pc || pPlaying) return;
  if (pPos >= pCount() - 1) pPos = pFirst;   // am Ende beginnt die Wiedergabe von vorn
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
  if (pPos >= last) pause();
}

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
  renderSaveBtn();   // ein anderes Bild lässt sich wieder speichern
}

async function openClip(c) {
  const d = await getData(c.id);
  if (!d) return;
  closePlayer();
  pc = { meta: c, cfg: d.cfg, frames: d.frames, bytes: new Uint8Array(await d.data.arrayBuffer()) };
  pIndex = new Map(pc.frames.map((f, i) => [f[0], i]));
  pFirst = clamp(d.skip || 0, 0, pc.frames.length - 1);
  pPos = pFirst; pTarget = -1; pPending = -1; pPlaying = false; pStill = false;
  pSoft = false;   // jedes Video versucht es zuerst mit der Hardware
  $('pStill').classList.add('hidden');
  closeRange();
  viewMode = 'video';
  savedSig = null;
  $('aPlayer').classList.remove('imgMode');
  $('aList').classList.add('hidden');
  $('aPlayer').classList.remove('hidden');
  resetDrawing();
  $('pTitle').textContent = `${dayLabel(c.day)} · ${clipLabel(c)} · ${hhmm(c.created)}`;
  fillClipFields(c);
  renderClipNav();
  resetDelete();
  $('pSeek').min = pFirst;
  $('pSeek').max = pCount() - 1;
  pctx.fillStyle = '#000';
  pctx.fillRect(0, 0, pCanvas.width, pCanvas.height);
  updatePlayerUi();
  seek(pFirst);
}

// Stern, Name und Stichwort gehören zum Video, auch wenn ein Bild offen ist
const curClip = () => (viewMode === 'image' ? pimg && pimg.clip : pc && pc.meta);

function fillClipFields(c) {
  hideSuggest();
  $('pName').value = c.name || '';
  $('pProp').value = c.prop || '';
  renderStar();
  renderClipNav();
  resetDelete();
}

function closePlayer() {
  viewMode = null;
  pimg = null;
  if (!pc) return;
  pause();
  pGen++;
  if (pdec && pdec.state !== 'closed') { try { pdec.close(); } catch (e) {} }
  pdec = null;
  pc = null;
  pTarget = -1; pPending = -1;
}

// ---------- Bildfenster ----------

async function openImage(im) {
  await savePromise;
  const c = clipById(im.clipId);
  if (!c) return;
  closePlayer();
  closeRange();
  viewMode = 'image';
  pimg = { rec: im, clip: c };
  pStill = false;
  $('pStill').classList.add('hidden');
  $('aPlayer').classList.add('imgMode');
  $('aList').classList.add('hidden');
  $('aPlayer').classList.remove('hidden');
  const bmp = await createImageBitmap(im.base);
  pCanvas.width = bmp.width;
  pCanvas.height = bmp.height;
  pctx.drawImage(bmp, 0, 0);
  bmp.close();
  resetDrawing();
  setShapes(im.shapes);
  savedSig = saveSig();   // frisch geöffnet gilt als gespeichert
  renderSaveBtn();
  $('pTitle').textContent = `${dayLabel(c.day)} · ${imageLabel(c, im)}`;
  fillClipFields(c);
}

// Vorheriges und nächstes Video in zeitlicher Reihenfolge, innerhalb des Filters der Liste.
// Das geöffnete Video zählt mit, auch wenn es durch eine Namensänderung nicht mehr zum Filter passt.
function clipNeighbor(dir) {
  if (!pc) return null;
  const cur = pc.meta.created;
  const pool = listClips.filter(c => c.id !== pc.meta.id && passesFilter(c));
  let best = null;
  for (const c of pool) {
    if (dir > 0 ? c.created > cur && (!best || c.created < best.created) : c.created < cur && (!best || c.created > best.created)) best = c;
  }
  return best;
}

// Unter „Bilder“ blättern die Pfeile durch die Bilder dieses Videos
const imagesOf = clipId => listImages.filter(im => im.clipId === clipId).sort((a, b) => a.n - b.n);
function imageNeighbor(dir) {
  if (!pimg) return null;
  const list = imagesOf(pimg.clip.id);
  const i = list.findIndex(im => im.id === pimg.rec.id);
  return list[i + dir] || null;
}
const neighbor = dir => (viewMode === 'image' ? imageNeighbor(dir) : clipNeighbor(dir));

function renderClipNav() {
  $('pPrevClip').disabled = !neighbor(-1);
  $('pNextClip').disabled = !neighbor(1);
  // Umschaltung „Video | Bilder“, Bilder nur wählbar, wenn das Video welche hat
  const c = curClip();
  const n = c ? imagesOf(c.id).length : 0;
  for (const b of $('pKind').querySelectorAll('button')) b.classList.toggle('on', (b.dataset.pk === 'images') === (viewMode === 'image'));
  $('pKind').querySelector('[data-pk="images"]').disabled = !n;
}

$('pKind').addEventListener('click', async e => {
  const b = e.target.closest('button');
  if (!b || b.disabled || navBusy) return;
  await savePromise;
  const c = curClip();
  if (!c) return;
  navBusy = true;
  try {
    await flushImageEdits();
    if (b.dataset.pk === 'images' && viewMode !== 'image') { const first = imagesOf(c.id)[0]; if (first) await openImage(first); }
    else if (b.dataset.pk === 'video' && viewMode !== 'video') await openClip(c);
  } finally { navBusy = false; }
});

// Wechsel ohne neuen Verlaufseintrag, die Zurück-Geste führt weiter direkt zur Liste.
// Zeitlupe bleibt, Zoom, Zeichnung, Schleife und Schnittauswahl beginnen neu.
let navBusy = false;   // schnelles Doppeltippen öffnet nicht zwei Videos gleichzeitig
async function showNeighbor(dir) {
  const x = neighbor(dir);
  if (!x || navBusy) return;
  navBusy = true;
  try {
    await flushImageEdits();
    await (viewMode === 'image' ? openImage(x) : openClip(x));
  } finally { navBusy = false; }
}
$('pPrevClip').addEventListener('click', () => showNeighbor(-1));
$('pNextClip').addEventListener('click', () => showNeighbor(1));

function renderStar() {
  const c = curClip();
  const on = !!(c && c.star);
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
  else if (b.dataset.tab === 'live' && mode === 'analysis') history.back();
});

// Zurück-Taste und Zurück-Geste von Android. Wiedergabe führt zur Liste, Liste zu Live.
// Im Betrieb bleibt sie wirkungslos, damit ein versehentliches Wischen den Betrieb nicht beendet.
window.addEventListener('popstate', () => {
  if (!$('tvCal').classList.contains('hidden')) { closeTvCal(); return; }   // zuerst das Prüfbild für den Fernseher
  if (!$('uiDlg').classList.contains('hidden')) {
    // Aus Farbwähler und Löschen zuerst zurück in die Einstellungen, erst dann zu
    if (!$('uiPick').classList.contains('hidden') || !$('uiDel').classList.contains('hidden')) {
      closePicker();
      $('uiDel').classList.add('hidden');
      $('uiMain').classList.remove('hidden');
      history.pushState({ v: 'dlg' }, '');
      return;
    }
    closeUi();
    return;
  }   // zuerst das Fenster Darstellung
  if (mode === 'run') {
    if (reviewing) { leaveReview(); return; }   // von der Videoseite zurück in die Wiedergabe
    history.pushState({ v: 'run' }, '');
    return;
  }
  if (mode !== 'analysis') return;
  if (!$('aPlayer').classList.contains('hidden')) showList();
  else leaveAnalysis();
});
$('pBack').addEventListener('click', () => history.back());

$('pPlay').addEventListener('click', () => (pPlaying ? pause() : play()));
// Ein Bild vor oder zurück. Gehalten schaltet die Taste fortlaufend weiter.
const stepBase = () => (pPending >= 0 ? pPending : pTarget >= 0 ? pTarget : pPos);
function holdRepeat(btn, fn) {
  let timer = 0;
  const stop = () => { clearTimeout(timer); timer = 0; };
  btn.addEventListener('pointerdown', () => {
    stop();
    fn();
    const loop = () => { fn(); timer = setTimeout(loop, 110); };
    timer = setTimeout(loop, 450);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(type, stop);
}
holdRepeat($('pPrev'), () => seek(stepBase() - 1));
holdRepeat($('pNext'), () => seek(stepBase() + 1));
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
  const c = curClip();
  if (!c) return;
  c.star = !c.star;
  renderStar();
  renderClipNav();
  await putClip(c);
});

for (const [id, key] of [['pName', 'name'], ['pProp', 'prop']]) {
  $(id).addEventListener('change', async () => {
    const c = curClip();
    if (!c) return;
    // Doppelte Leerzeichen entfernen und eine vorhandene Schreibweise übernehmen, damit „teo“ und „Teo“ ein Name bleiben
    let v = $(id).value.replace(/\s+/g, ' ').trim();
    const known = knownTerms(key).find(k => k.toLocaleLowerCase('de') === v.toLocaleLowerCase('de'));
    if (known) v = known;
    $(id).value = v;
    rememberTerms(key, [v]);
    c[key] = v;
    renderClipNav();
    await putClip(c);
  });
  $(id).addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
  $(id).addEventListener('input', () => showSuggest($(id), key));
  $(id).addEventListener('focus', () => showSuggest($(id), key));
  $(id).addEventListener('blur', () => setTimeout(hideSuggest, 150));
}

// ---------- Vorschläge für Name und Stichwort ----------
// Erst ab dem ersten Buchstaben. Passend ist der Anfang des Begriffs, danach der Anfang eines Wortes darin.
// Jeder je eingetragene Begriff bleibt in den Einstellungen gemerkt, auch wenn sein Video gelöscht ist.

const lc = s => s.toLocaleLowerCase('de');

function knownTerms(key) {
  const seen = new Map();
  const saved = (settings.terms && settings.terms[key]) || [];
  for (const t of [...saved, ...listClips.map(c => c[key])]) if (t && !seen.has(lc(t))) seen.set(lc(t), t);
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'de'));
}

function rememberTerms(key, list) {
  settings.terms = settings.terms || {};
  const mine = settings.terms[key] || (settings.terms[key] = []);
  let added = false;
  for (const t of list) if (t && !mine.some(m => lc(m) === lc(t))) { mine.push(t); added = true; }
  if (added) saveSettings();
}

function showSuggest(input, key) {
  const q = lc(input.value.replace(/\s+/g, ' ').trimStart());
  if (!q) return hideSuggest();
  const terms = knownTerms(key).filter(t => lc(t) !== lc(input.value.trim()));
  const starts = terms.filter(t => lc(t).startsWith(q));
  const inWord = terms.filter(t => !lc(t).startsWith(q) && lc(t).split(/[\s-]+/).some(w => w.startsWith(q)));
  const hits = [...starts, ...inWord].slice(0, 8);
  if (!hits.length) return hideSuggest();
  const box = $('pSuggest');
  box.textContent = '';
  for (const t of hits) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t;
    // pointerdown statt click, damit das Feld den Fokus erst nach der Wahl verliert
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      input.value = t;
      hideSuggest();
      input.dispatchEvent(new Event('change'));
      input.blur();
    });
    box.append(b);
  }
  // Rechtsbündig direkt unter dem Feld, in den Maßen der Kopfzeile
  const bar = box.parentElement;
  box.style.top = (input.offsetTop + input.offsetHeight + 4) + 'px';
  box.style.right = (bar.clientWidth - input.offsetLeft - input.offsetWidth) + 'px';
  box.style.minWidth = input.offsetWidth + 'px';
  box.classList.remove('hidden');
}

function hideSuggest() {
  $('pSuggest').classList.add('hidden');
}

function download(file) {
  // In der Android-App speichert Android die Datei im Download-Ordner
  if (NATIVE) {
    playerMsg('Wird gespeichert …', true);
    native.save(file).then(ok => playerMsg(ok ? 'Im Download-Ordner gespeichert' : 'Speichern fehlgeschlagen'));
    return;
  }
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

// Video lädt das Video, ein Bild nur das Bild mit seiner Zeichnung
let downBusy = false;
$('pDown').addEventListener('click', async () => {
  if (viewMode === 'image') {
    // Das Umwandeln dauert etwa eine Sekunde. Name und Bild werden sofort festgehalten,
    // damit ein Wechsel oder Löschen in dieser Zeit nichts durcheinanderbringt.
    if (downBusy || !pimg) return;
    downBusy = true;
    const name = imageFileName(pimg.clip, pimg.rec);
    const snap = snapCanvas(pCanvas.width, pCanvas.height, true);
    playerMsg('Bild wird vorbereitet …', true);
    try {
      const blob = await canvasBlob(snap, 0.92);
      $('pMsg').classList.add('hidden');
      download(new File([blob], name, { type: 'image/jpeg' }));
    } finally { downBusy = false; }
    return;
  }
  if (!pc) return;
  pause();
  download(currentFile());
});

$('pDel').addEventListener('click', async () => {
  if (!viewMode) return;
  const b = $('pDel');
  if (!b.classList.contains('armed')) {
    b.classList.add('armed');
    b.textContent = 'Ja, löschen';
    delTimer = setTimeout(resetDelete, 3000);
    return;
  }
  resetDelete();
  if (viewMode === 'image') {
    // Danach das nächste Bild desselben Videos zeigen, ohne weitere Bilder das Video
    const { rec, clip } = pimg;
    const next = imageNeighbor(1) || imageNeighbor(-1);
    savedSig = saveSig();   // gelöschtes Bild nicht mehr speichern
    await deleteImage(rec.id);
    listImages = listImages.filter(im => im.id !== rec.id);
    if (next) await openImage(next);
    else await openClip(clip);
    return;
  }
  const id = pc.meta.id;
  closePlayer();
  await deleteClip(id);
  history.back();   // zurück zur Liste
});

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
  if (kind === 'cut') { a = pFirst; b = n - 1; }
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
  $('rgInfo').textContent = 'Länge ' + fmtSec(pc.frames[selB][0] - pc.frames[selA][0]);
  const cnt = strobeShown();
  $('rgCount').textContent = cnt;
  $('rgMinus').disabled = cnt <= STROBE_MIN;
  $('rgPlus').disabled = cnt >= Math.min(STROBE_MAX, selB - selA + 1);
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
// Die Bildfolge kann nicht mehr Bilder haben, als der Abschnitt enthält
const strobeShown = () => Math.min(strobeCount, selB - selA + 1);
$('rgMinus').addEventListener('click', () => { strobeCount = Math.max(STROBE_MIN, strobeShown() - 1); renderRange(); });
$('rgPlus').addEventListener('click', () => { strobeCount = Math.min(STROBE_MAX, strobeShown() + 1); renderRange(); });
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
    else { await makeStrobe(a, b, strobeShown()); closeRange(); }
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
  renderSaveBtn();
}

// ---------- Bilder speichern ----------

const canvasBlob = (cv, q) => new Promise(res => cv.toBlob(res, 'image/jpeg', q));

// Bild mit oder ohne Zeichnung, ohne Griffe und ohne Zoom, in der gewünschten Größe.
// Läuft ohne Warten, damit genau das Bild im Moment des Tippens erfasst wird.
function snapCanvas(w, h, withDrawing) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.drawImage(pCanvas, 0, 0, w, h);
  if (withDrawing) {
    renderDrawing(false);
    x.drawImage(dCanvas, 0, 0, w, h);
    renderDrawing();
  }
  return c;
}
const composeImage = (w, h, q) => canvasBlob(snapCanvas(w, h, true), q);

let playerMsgTimer = 0;
// keep lässt die Meldung stehen, bis die nächste kommt. ms bestimmt sonst die Dauer.
function playerMsg(text, keep, ms = 2200) {
  $('pMsg').textContent = text;
  $('pMsg').classList.remove('hidden');
  clearTimeout(playerMsgTimer);
  if (!keep) playerMsgTimer = setTimeout(() => $('pMsg').classList.add('hidden'), ms);
}

// Fingerabdruck des aktuellen Standes. Ist er seit dem letzten Speichern unverändert, bleibt der Knopf grau,
// damit kein doppeltes Bild entsteht.
const saveSig = () => JSON.stringify([viewMode, viewMode === 'image' ? pimg && pimg.rec.id : pPos, pStill, shapes]);
let savedSig = null;

function renderSaveBtn() {
  const b = $('dSave');
  if (!b) return;
  // Jedes Bild lässt sich speichern, auch ohne Zeichnung. Nur dasselbe Bild nicht zweimal.
  b.disabled = !viewMode || saveSig() === savedSig;
}

let saveBusy = false;
let savePromise = Promise.resolve();   // wer ein Bild öffnet, wartet, bis ein laufendes Speichern fertig ist
$('dSave').addEventListener('click', () => {
  if (saveBusy || !viewMode) return;
  saveBusy = true;
  savePromise = saveNowImage();
});

async function saveNowImage() {
  let slow = 0;
  try {
    if (viewMode === 'video') pause();
    // Zuerst alles im Moment des Tippens festhalten, danach in Ruhe umwandeln
    const W = pCanvas.width, H = pCanvas.height;
    const thumbCv = snapCanvas(384, 216, true);
    const shapesNow = getShapes();
    const sig = saveSig();
    // Der Hinweis erscheint nur, wenn das Umwandeln merklich dauert
    slow = setTimeout(() => playerMsg('Wird gespeichert …', true), 400);
    if (viewMode === 'image') {
      // Änderungen gehen in dasselbe Bild, das Bild bleibt seinem Video zugeordnet
      const rec = pimg.rec;
      rec.shapes = shapesNow;
      rec.thumb = await canvasBlob(thumbCv, 0.8);
      await putImage(rec);
      savedSig = sig;
      clearTimeout(slow);
      playerMsg('Gespeichert', false, 1200);
      return;
    }
    const c = pc.meta;
    const baseCv = snapCanvas(W, H, false);
    const still = pStill;
    // Nummer sofort vergeben, damit zwei schnelle Speichervorgänge nie dieselbe bekommen
    const n = imagesOf(c.id).reduce((m, im) => Math.max(m, im.n), 0) + 1;
    const rec = { clipId: c.id, n, created: Date.now(), w: W, h: H, shapes: shapesNow, strobe: still };
    listImages.push(rec);
    try {
      [rec.base, rec.thumb] = await Promise.all([canvasBlob(baseCv, 0.92), canvasBlob(thumbCv, 0.8)]);
      rec.id = await putImage(rec);
    } catch (e) {
      listImages.splice(listImages.indexOf(rec), 1);
      throw e;
    }
    savedSig = sig;
    renderClipNav();
    clearTimeout(slow);
    playerMsg('Gespeichert als ' + imageLabel(c, rec), false, 1200);
  } catch (e) {
    console.warn(e);
    clearTimeout(slow);
    playerMsg('Speichern fehlgeschlagen');
  } finally {
    saveBusy = false;
    renderSaveBtn();
  }
}

// Änderungen an einem gespeicherten Bild gehen beim Verlassen nicht verloren
async function flushImageEdits() {
  await savePromise;
  if (viewMode !== 'image' || saveSig() === savedSig) return;
  saveBusy = true;
  savePromise = saveNowImage();
  await savePromise;
}

// ---------- Videos löschen in den Einstellungen ----------

// Drei Schritte, damit nichts aus Versehen verloren geht: Knopf, Auswahl mit Anzahl, Rückfrage.
let delOnlyNoStar = true;

$('delOpen').addEventListener('click', async () => {
  const clips = await allClips();
  const noStar = clips.filter(c => !c.star).length;
  $('delNoStar').textContent = `Ohne Stern löschen (${noStar})`;
  $('delNoStar').disabled = !noStar;
  $('delAll').textContent = `Alle löschen (${clips.length})`;
  $('delAll').disabled = !clips.length;
  $('delChoose').classList.remove('hidden');
  $('delAsk').classList.add('hidden');
  $('uiMain').classList.add('hidden');
  $('uiDel').classList.remove('hidden');
});

function closeDelete() {
  $('uiDel').classList.add('hidden');
  $('uiMain').classList.remove('hidden');
}

async function askDelete(onlyNoStar) {
  delOnlyNoStar = onlyNoStar;
  const clips = await allClips();
  const hit = onlyNoStar ? clips.filter(c => !c.star) : clips;
  const n = hit.length;
  const ids = new Set(hit.map(c => c.id));
  const nImg = (await allImages()).filter(im => ids.has(im.clipId)).length;
  const vids = n === 1 ? '1 Video' : n + ' Videos';
  const imgs = nImg ? ` mit ${nImg === 1 ? '1 Bild' : nImg + ' Bildern'}` : '';
  $('delQuestion').textContent = onlyNoStar
    ? `${vids} ohne Stern${imgs} wirklich löschen? Das lässt sich nicht rückgängig machen.`
    : n === 1
      ? `${vids}${imgs} wirklich löschen, auch mit Stern? Das lässt sich nicht rückgängig machen.`
      : `Wirklich alle ${vids}${imgs} löschen, auch die mit Stern? Das lässt sich nicht rückgängig machen.`;
  $('delChoose').classList.add('hidden');
  $('delAsk').classList.remove('hidden');
}

async function deleteMany(onlyNoStar) {
  const ids = new Set((await allClips()).filter(c => !onlyNoStar || !c.star).map(c => c.id));
  const imgIds = (await allImages()).filter(im => ids.has(im.clipId)).map(im => im.id);
  await inTx(['clips', 'data', 'images'], 'readwrite', t => {
    for (const id of ids) { t.objectStore('clips').delete(id); t.objectStore('data').delete(id); }
    for (const id of imgIds) t.objectStore('images').delete(id);
  });
  closeDelete();
  renderStorage();
  if (mode === 'analysis' && !viewMode) showList();
}
$('delNoStar').addEventListener('click', () => askDelete(true));
$('delAll').addEventListener('click', () => askDelete(false));
$('delCancel').addEventListener('click', closeDelete);
$('delYes').addEventListener('click', () => deleteMany(delOnlyNoStar));
$('delNo').addEventListener('click', closeDelete);

// ---------- Start ----------

// Chrome soll die Videos auch bei knappem Speicher nicht selbst löschen
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
cleanupOld().catch(e => console.warn(e));
