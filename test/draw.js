'use strict';

// Zeichnen, Winkel messen und Zoom im Standbild der Analyse. Nutzt pc, pCanvas und Hilfen aus analysis.js.
// Zeichnungen liegen in Bildpunkten des Videos und bleiben so auch beim Zoomen an ihrer Stelle.

const COLORS = ['#ffd21f', '#ff4d4d', '#37d3c4', '#ffffff'];
const HANDLE_PX = 30;       // so nah muss ein Finger an einem Punkt sein, um ihn zu verschieben
const LINE_PX = 4;          // Strichstärke auf dem Bildschirm, unabhängig vom Zoom
const MAX_ZOOM = 8;
const DOUBLE_TAP_MS = 300;

const dStage = $('pStage'), dView = $('pView'), dCanvas = $('pDraw');
const dctx = dCanvas.getContext('2d');
let tool = 'view';          // view, free, line, angle, plumb oder magic
let colorIdx = 0;
let shapes = [];            // { type: 'free' | 'line' | 'angle' | 'plumb' | 'pose', pts: [[x, y], ...], color, unsure }
let pending = null;         // Form, die gerade entsteht
let placing = false;        // der letzte Punkt von pending folgt noch dem Finger
let drag = null;            // verschobener Punkt { shape, idx }
let vz = { z: 1, x: 0, y: 0 };            // Zoom und Verschiebung
let vbox = { x: 0, y: 0, w: 1, h: 1 };    // Lage des Videos in der Bühne ohne Zoom
const pointers = new Map();
let pinch = null, pan = null, gestureDone = false, lastTap = 0;

// ---------- Lage und Zoom ----------

function layoutView() {
  const st = dStage.getBoundingClientRect();
  const W = pCanvas.width || 1920, H = pCanvas.height || 1080;
  const s = Math.min(st.width / W, st.height / H) || 1;
  vbox = { w: W * s, h: H * s, x: (st.width - W * s) / 2, y: (st.height - H * s) / 2 };
  Object.assign(dView.style, { left: vbox.x + 'px', top: vbox.y + 'px', width: vbox.w + 'px', height: vbox.h + 'px' });
  if (dCanvas.width !== W || dCanvas.height !== H) { dCanvas.width = W; dCanvas.height = H; }
  applyViewZoom();
}

function applyViewZoom() {
  vz.z = clamp(vz.z, 1, MAX_ZOOM);
  vz.x = clamp(vz.x, vbox.w * (1 - vz.z), 0);
  vz.y = clamp(vz.y, vbox.h * (1 - vz.z), 0);
  dView.style.transform = `translate(${vz.x}px, ${vz.y}px) scale(${vz.z})`;
  $('dZoom').disabled = vz.z <= 1.001;
  renderDrawing();
}

function resetViewZoom() {
  vz = { z: 1, x: 0, y: 0 };
  applyViewZoom();
}

// Punkt in der Bühne relativ zum ungezoomten Video
function stagePoint(e) {
  const r = dStage.getBoundingClientRect();
  return [e.clientX - r.left - vbox.x, e.clientY - r.top - vbox.y];
}

// Punkt in Bildpunkten des Videos
function videoPoint(e) {
  const [x, y] = stagePoint(e);
  return [(x - vz.x) / vz.z * dCanvas.width / vbox.w, (y - vz.y) / vz.z * dCanvas.height / vbox.h];
}

// Bildpunkte des Videos je Bildschirmpunkt
const pxScale = () => dCanvas.width / vbox.w / vz.z;

// ---------- Zeichnen ----------

// Gradzahl auf dunklem Feld
function drawLabel(text, x, y, color, k) {
  dctx.font = `700 ${24 * k}px system-ui, Roboto, sans-serif`;
  dctx.textAlign = 'center';
  dctx.textBaseline = 'middle';
  const w = dctx.measureText(text).width + 14 * k;
  dctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  dctx.fillRect(x - w / 2, y - 17 * k, w, 34 * k);
  dctx.fillStyle = color;
  dctx.fillText(text, x, y + 1 * k);
}

// Strich mit dunklem Rand, damit er auf hellem und dunklem Grund sichtbar bleibt
function strokeLine(path, color, k) {
  dctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  dctx.lineWidth = (LINE_PX + 3) * k;
  dctx.stroke(path);
  dctx.strokeStyle = color;
  dctx.lineWidth = LINE_PX * k;
  dctx.stroke(path);
}

// Körperhaltung vom Zauberstab: Schulter, Hüfte, Knie, Knöchel, dazu Hüftwinkel und Winkel zum Lot
function drawPose(s, k, handles) {
  const [S, H, K, A] = s.pts;
  const un = s.unsure || [];
  dctx.lineCap = 'round';
  dctx.lineJoin = 'round';
  const body = new Path2D();
  body.moveTo(S[0], S[1]);
  body.lineTo(H[0], H[1]);
  body.lineTo(K[0], K[1]);
  body.lineTo(A[0], A[1]);
  strokeLine(body, s.color, k);

  // Hüftwinkel zwischen Schulter und Knie
  const a1 = Math.atan2(S[1] - H[1], S[0] - H[0]);
  let diff = Math.atan2(K[1] - H[1], K[0] - H[0]) - a1;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff <= -Math.PI) diff += 2 * Math.PI;
  const arc = new Path2D();
  arc.arc(H[0], H[1], 42 * k, a1, a1 + diff, diff < 0);
  strokeLine(arc, s.color, k);
  const mid = a1 + diff / 2;
  // Beschriftungen kommen zuletzt, damit sie über den Linien liegen und sich nicht überdecken
  dctx.font = `700 ${24 * k}px system-ui, Roboto, sans-serif`;
  const labels = [];
  const hipText = 'Hüfte ' + Math.round(Math.abs(diff) * 180 / Math.PI) + '°';
  labels.push({ text: hipText, x: H[0] - Math.cos(mid) * 58 * k, y: H[1] - Math.sin(mid) * 58 * k, w: dctx.measureText(hipText).width + 14 * k });

  // Körperachse zum Lot. Ohne sicheren Knöchel zählt der Rumpf von der Schulter bis zur Hüfte.
  const E = un[3] ? H : A;
  const [lo, hi] = S[1] > E[1] ? [S, E] : [E, S];   // das Lot steht auf dem unteren Punkt
  const len = Math.hypot(hi[0] - lo[0], hi[1] - lo[1]);
  if (len > 1) {
    const lot = new Path2D();
    lot.moveTo(lo[0], lo[1]);
    lot.lineTo(lo[0], lo[1] - len);
    dctx.setLineDash([14 * k, 9 * k]);
    strokeLine(lot, s.color, k);
    dctx.setLineDash([]);
    const up = -Math.PI / 2, dir = Math.atan2(hi[1] - lo[1], hi[0] - lo[0]);
    const r = Math.min(70 * k, len * 0.4);
    const arc2 = new Path2D();
    arc2.arc(lo[0], lo[1], r, up, dir, dir < up);
    strokeLine(arc2, s.color, k);
    const dev = Math.round(Math.acos(Math.min(1, Math.abs(hi[1] - lo[1]) / len)) * 180 / Math.PI);
    // Beschriftung neben dem Lot auf der Seite, auf der der Körper nicht liegt
    const away = hi[0] < lo[0] ? 1 : -1;
    const text = 'Lot ' + dev + '°' + (un[3] ? ' Rumpf' : '');
    const w = dctx.measureText(text).width + 14 * k;
    labels.push({ text, x: lo[0] + away * (w / 2 + 12 * k), y: lo[1] - Math.min(len * 0.3, r * 0.8), w });
  }
  // Überdecken sich die Beschriftungen, wechselt die für die Hüfte auf die andere Seite, notfalls nach oben
  if (labels.length === 2) {
    const [h, l] = labels;
    const hit = () => Math.abs(h.x - l.x) < (h.w + l.w) / 2 + 6 * k && Math.abs(h.y - l.y) < 40 * k;
    if (hit()) h.x = 2 * H[0] - h.x;
    if (hit()) h.y = l.y - 44 * k;
  }
  for (const b of labels) drawLabel(b.text, b.x, b.y, s.color, k);

  if (!handles) return;
  s.pts.forEach((p, i) => {
    dctx.beginPath();
    dctx.arc(p[0], p[1], 8 * k, 0, 2 * Math.PI);
    dctx.fillStyle = un[i] ? '#9aa0a6' : s.color;   // grau, wenn die Erkennung unsicher war
    dctx.fill();
    dctx.lineWidth = 2 * k;
    dctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    dctx.stroke();
  });
}

function drawShape(s, k, handles) {
  const pts = s.pts;
  if (!pts.length) return;
  if (s.type === 'pose') { drawPose(s, k, handles); return; }
  dctx.lineCap = 'round';
  dctx.lineJoin = 'round';
  const stroke = path => {
    // dunkler Rand, damit die Linie auf hellem und dunklem Grund sichtbar bleibt
    dctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    dctx.lineWidth = (LINE_PX + 3) * k;
    dctx.stroke(path);
    dctx.strokeStyle = s.color;
    dctx.lineWidth = LINE_PX * k;
    dctx.stroke(path);
  };
  if (s.type === 'plumb') {
    // Lot, eine senkrechte Linie über die ganze Bildhöhe
    const lot = new Path2D();
    lot.moveTo(pts[0][0], 0);
    lot.lineTo(pts[0][0], dCanvas.height);
    dctx.setLineDash([16 * k, 10 * k]);
    stroke(lot);
    dctx.setLineDash([]);
  } else {
    const line = new Path2D();
    line.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) line.lineTo(pts[i][0], pts[i][1]);
    if (s.type === 'free' && pts.length === 1) line.lineTo(pts[0][0] + 0.1, pts[0][1]);
    stroke(line);
  }
  if (s.type === 'free') return;

  if (s.type === 'angle' && pts.length === 3) {
    const [a, b, c] = pts;
    const a1 = Math.atan2(a[1] - b[1], a[0] - b[0]);
    let diff = Math.atan2(c[1] - b[1], c[0] - b[0]) - a1;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff <= -Math.PI) diff += 2 * Math.PI;
    const arc = new Path2D();
    arc.arc(b[0], b[1], 42 * k, a1, a1 + diff, diff < 0);
    stroke(arc);
    const deg = Math.round(Math.abs(diff) * 180 / Math.PI) + '°';
    const mid = a1 + diff / 2;
    const tx = b[0] - Math.cos(mid) * 34 * k, ty = b[1] - Math.sin(mid) * 34 * k;
    dctx.font = `700 ${24 * k}px system-ui, Roboto, sans-serif`;
    dctx.textAlign = 'center';
    dctx.textBaseline = 'middle';
    const w = dctx.measureText(deg).width + 14 * k;
    dctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    dctx.fillRect(tx - w / 2, ty - 17 * k, w, 34 * k);
    dctx.fillStyle = s.color;
    dctx.fillText(deg, tx, ty + 1 * k);
  }
  // Griffe zum Verschieben der Punkte
  if (!handles) return;
  for (const p of pts) {
    dctx.beginPath();
    dctx.arc(p[0], p[1], 7 * k, 0, 2 * Math.PI);
    dctx.fillStyle = s.color;
    dctx.fill();
    dctx.lineWidth = 2 * k;
    dctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    dctx.stroke();
  }
}

function renderDrawing(handles = true) {
  dctx.clearRect(0, 0, dCanvas.width, dCanvas.height);
  const k = pxScale();
  for (const s of shapes) drawShape(s, k, handles);
  if (pending) drawShape(pending, k, handles);
  $('dUndo').disabled = !shapes.length && !pending;
  $('dClear').disabled = !shapes.length && !pending;
  renderSaveBtn();
}

// Zeichnung als Kopie lesen und setzen, für gespeicherte Bilder
function getShapes() { return JSON.parse(JSON.stringify(shapes)); }
function setShapes(list) {
  shapes = JSON.parse(JSON.stringify(list || []));
  pending = null;
  placing = false;
  drag = null;
  renderDrawing();
}
const hasDrawing = () => shapes.length > 0;

function findHandle(p) {
  const r = HANDLE_PX * pxScale();
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (s.type === 'free') continue;
    for (let j = 0; j < s.pts.length; j++) {
      if (Math.hypot(s.pts[j][0] - p[0], s.pts[j][1] - p[1]) <= r) return { shape: s, idx: j };
    }
  }
  return null;
}

function commit() {
  shapes.push(pending);
  pending = null;
  placing = false;
}

// Bricht nur das ab, was der Finger gerade zeichnet. Fertige Punkte eines Winkels bleiben.
function cancelStroke() {
  drag = null;
  if (!pending) return;
  if (pending.type === 'angle') {
    if (placing) pending.pts.pop();
    placing = false;
    if (!pending.pts.length) pending = null;
  } else {
    pending = null;
  }
  renderDrawing();
}

function drawDown(e) {
  const p = videoPoint(e);
  const h = findHandle(p);
  if (h && !(pending && pending.type === 'angle')) { drag = h; return; }
  if (tool === 'magic') { poseTap(p); return; }
  const color = COLORS[colorIdx];
  if (tool === 'free') pending = { type: 'free', pts: [p], color };
  else if (tool === 'line') pending = { type: 'line', pts: [p, p.slice()], color };
  else if (tool === 'plumb') { pending = { type: 'plumb', pts: [p], color }; placing = true; }
  else if (tool === 'angle') {
    if (!pending) pending = { type: 'angle', pts: [], color };
    pending.pts.push(p);
    placing = true;
  }
  renderDrawing();
}

function drawMove(e) {
  const p = videoPoint(e);
  if (drag) {
    drag.shape.pts[drag.idx] = p;
    if (drag.shape.unsure) drag.shape.unsure[drag.idx] = false;   // von Hand gesetzt gilt als sicher
    renderDrawing();
    return;
  }
  if (!pending) return;
  if (pending.type === 'free') {
    const last = pending.pts[pending.pts.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 2 * pxScale()) return;
    pending.pts.push(p);
  } else if (pending.type === 'line') {
    pending.pts[1] = p;
  } else if (pending.type === 'plumb') {
    pending.pts[0] = p;
  } else if (placing) {
    pending.pts[pending.pts.length - 1] = p;
  }
  renderDrawing();
}

function drawUp() {
  if (drag) { drag = null; return; }
  if (!pending) return;
  if (pending.type === 'free' || pending.type === 'plumb') commit();
  else if (pending.type === 'line') {
    const [a, b] = pending.pts;
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 10 * pxScale()) commit();
    else pending = null;
  } else {
    placing = false;
    if (pending.pts.length === 3) commit();
  }
  renderDrawing();
}

// ---------- Finger ----------

function startPinch() {
  const [a, b] = [...pointers.values()];
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  pinch = {
    d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1,
    z: vz.z,
    c: [(m[0] - vz.x) / vz.z, (m[1] - vz.y) / vz.z],   // Stelle im Bild unter der Fingermitte
  };
}

function movePinch() {
  const [a, b] = [...pointers.values()];
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  vz.z = clamp(pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, 1, MAX_ZOOM);
  vz.x = m[0] - pinch.c[0] * vz.z;
  vz.y = m[1] - pinch.c[1] * vz.z;
  applyViewZoom();
}

dStage.addEventListener('pointerdown', e => {
  if (!viewMode) return;
  try { dStage.setPointerCapture(e.pointerId); } catch (x) {}
  pointers.set(e.pointerId, stagePoint(e));
  if (pointers.size === 2) {
    // Zwei Finger zoomen und verschieben, in jedem Werkzeug
    cancelStroke();
    pan = null;
    gestureDone = true;
    startPinch();
    return;
  }
  if (pointers.size > 2 || gestureDone) return;
  if (tool === 'view') {
    const now = performance.now();
    if (now - lastTap < DOUBLE_TAP_MS) { lastTap = 0; resetViewZoom(); return; }
    lastTap = now;
    pan = { p: stagePoint(e), x: vz.x, y: vz.y };
    return;
  }
  drawDown(e);
});

dStage.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, stagePoint(e));
  if (pinch) { if (pointers.size >= 2) movePinch(); return; }
  if (gestureDone) return;
  if (pan) {
    const p = stagePoint(e);
    vz.x = pan.x + p[0] - pan.p[0];
    vz.y = pan.y + p[1] - pan.p[1];
    applyViewZoom();
    return;
  }
  drawMove(e);
});

function pointerEnd(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pinch) { if (pointers.size < 2) pinch = null; }
  else if (pan) pan = null;
  else if (!gestureDone) drawUp();
  // Nach einer Zwei-Finger-Geste zeichnet erst ein neuer Finger wieder
  if (!pointers.size) gestureDone = false;
}
dStage.addEventListener('pointerup', pointerEnd);
dStage.addEventListener('pointercancel', e => { if (!pinch && !pan) cancelStroke(); pointerEnd(e); });

// ---------- Werkzeuge ----------

function setTool(t) {
  if (pending && pending.type === 'angle' && t !== 'angle') { pending = null; placing = false; }
  tool = t;
  for (const b of $('pTools').querySelectorAll('[data-tool]')) b.classList.toggle('on', b.dataset.tool === t);
  renderDrawing();
}

function renderColor() {
  $('dColor').style.setProperty('--c', COLORS[colorIdx]);
}

$('pTools').addEventListener('click', e => {
  const b = e.target.closest('[data-tool]');
  if (b) setTool(b.dataset.tool);
});
$('dColor').addEventListener('click', () => {
  colorIdx = (colorIdx + 1) % COLORS.length;
  renderColor();
});
$('dUndo').addEventListener('click', () => {
  if (pending) { pending = null; placing = false; }
  else shapes.pop();
  renderDrawing();
});
$('dClear').addEventListener('click', () => {
  shapes = [];
  pending = null;
  placing = false;
  renderDrawing();
});
$('dZoom').addEventListener('click', resetViewZoom);

// Zeichnungen verschwinden, sobald ein anderes Bild erscheint
function onPlayerFrameShown() {
  if (!shapes.length && !pending) return;
  shapes = [];
  pending = null;
  placing = false;
  drag = null;
  renderDrawing();
}

function resetDrawing() {
  shapes = [];
  pending = null;
  placing = false;
  drag = null;
  pointers.clear();
  pinch = null; pan = null; gestureDone = false;
  vz = { z: 1, x: 0, y: 0 };
  setTool('view');
  layoutView();
}

// Auch das Einblenden der Regler für Schneiden und Bildfolge ändert die Größe der Bühne
new ResizeObserver(() => { if (viewMode) layoutView(); }).observe(dStage);
renderColor();
