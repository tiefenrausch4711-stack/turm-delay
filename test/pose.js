'use strict';

// Zauberstab: erkennt im angezeigten Bild Schulter, Hüfte, Knie und Knöchel des Springers und legt
// daraus eine Zeichnung mit Hüftwinkel und Winkel zum Lot an. Die Erkennung (MediaPipe Pose Landmarker)
// liegt im Ordner mp und läuft ohne Internet auf dem Gerät. Sie wird erst beim ersten Gebrauch geladen.

const POSE_BASE = new URL('mp/', location.href).href;
const POSE_FILES = ['vision_bundle.mjs', 'vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'pose_landmarker_full.task'];
const POSE_IDX = { L: [11, 23, 25, 27], R: [12, 24, 26, 28] };   // Schulter, Hüfte, Knie, Knöchel
const POSE_MIN = 0.5;       // so sicher muss die Erkennung im Mittel sein, sonst keine Zeichnung
const POSE_SURE = 0.5;      // darunter gilt ein einzelner Punkt als unsicher und erscheint grau
const POSE_INPUT = 512;     // Kantenlänge des Ausschnitts, der an die Erkennung geht

let poseLm = null, poseLoading = null, poseBusy = false;

async function poseModel() {
  if (poseLm) return poseLm;
  if (!poseLoading) {
    poseLoading = (async () => {
      const { PoseLandmarker } = await import(POSE_BASE + 'vision_bundle.mjs');
      const files = { wasmLoaderPath: POSE_BASE + 'vision_wasm_internal.js', wasmBinaryPath: POSE_BASE + 'vision_wasm_internal.wasm' };
      const opts = delegate => ({
        baseOptions: { modelAssetPath: POSE_BASE + 'pose_landmarker_full.task', delegate },
        runningMode: 'IMAGE', numPoses: 3,   // mehrere, damit bei Zuschauern im Bild der angetippte Springer gewählt wird
        minPoseDetectionConfidence: 0.3, minPosePresenceConfidence: 0.3,
      });
      // Grafikchip bevorzugt, sonst der Prozessor
      try { return await PoseLandmarker.createFromOptions(files, opts('GPU')); }
      catch (e) { console.warn(e); return await PoseLandmarker.createFromOptions(files, opts('CPU')); }
    })();
  }
  try { poseLm = await poseLoading; }
  catch (e) { poseLoading = null; throw e; }
  return poseLm;
}

// Ein quadratischer Ausschnitt um (cx, cy) mit Kantenlänge side, um rot Grad gedreht, geht an die Erkennung.
// Die gefundenen Punkte kommen in Bildpunkten des Videos zurück.
const poseCanvas = document.createElement('canvas');
poseCanvas.width = poseCanvas.height = POSE_INPUT;
const poseCtx = poseCanvas.getContext('2d');

function poseRun(lm, src, cx, cy, side, rot) {
  const S = POSE_INPUT, a = rot * Math.PI / 180;
  poseCtx.setTransform(1, 0, 0, 1, 0, 0);
  poseCtx.fillStyle = '#000';
  poseCtx.fillRect(0, 0, S, S);
  poseCtx.translate(S / 2, S / 2);
  poseCtx.rotate(a);
  poseCtx.drawImage(src, cx - side / 2, cy - side / 2, side, side, -S / 2, -S / 2, S, S);
  const res = lm.detect(poseCanvas);
  if (!res || !res.landmarks || !res.landmarks.length) return null;
  const cos = Math.cos(a), sin = Math.sin(a), k = side / S;
  let best = null;
  for (const marks of res.landmarks) {
    const all = marks.map(m => {
      const qx = (m.x - 0.5) * S, qy = (m.y - 0.5) * S;
      return { p: [cx + (qx * cos + qy * sin) * k, cy + (-qx * sin + qy * cos) * k], v: Math.min(m.visibility ?? 1, m.presence ?? 1) };
    });
    // Die Seite, die der Kamera zugewandt ist, wird sicherer erkannt
    const sum = idx => idx.reduce((s, i) => s + all[i].v, 0);
    const idx = sum(POSE_IDX.L) >= sum(POSE_IDX.R) ? POSE_IDX.L : POSE_IDX.R;
    const pts = idx.map(i => all[i].p);
    // Von mehreren Personen zählt die, deren Rumpf am nächsten an der angetippten Stelle liegt
    const mx = pts.reduce((s, p) => s + p[0], 0) / 4, my = pts.reduce((s, p) => s + p[1], 0) / 4;
    const dist = Math.hypot(mx - cx, my - cy);
    if (!best || dist < best.dist) best = { all, rot, pts, vis: idx.map(i => all[i].v), score: sum(idx) / 4, dist };
  }
  return best;
}

async function detectPose(src, cx, cy) {
  const lm = await poseModel();
  const H = src.height, W = src.width;
  // Erster Durchgang: Ausschnitt um die angetippte Stelle. Die Erkennung richtet den Körper selbst aus.
  // Nur wenn sie unsicher ist, folgen gedrehte Versuche, das hilft manchmal bei Springern kopfüber.
  const side = Math.min(W, H) * 0.5;
  let best = poseRun(lm, src, cx, cy, side, 0);
  if (!best || best.score < POSE_MIN + 0.15) {
    for (const rot of [90, 180, 270]) {
      const r = poseRun(lm, src, cx, cy, side, rot);
      if (r && (!best || r.score > best.score)) best = r;
    }
  }
  if (!best) return null;
  // Zweiter Durchgang: enger Ausschnitt um den gefundenen Körper, das macht die Punkte genauer
  const sure = best.all.filter(m => m.v > 0.3).map(m => m.p);
  if (sure.length >= 4) {
    const xs = sure.map(p => p[0]), ys = sure.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const side2 = clamp(Math.max(x1 - x0, y1 - y0) * 1.5, H * 0.12, Math.min(W, H));
    const r = poseRun(lm, src, (x0 + x1) / 2, (y0 + y1) / 2, side2, best.rot);
    if (r && r.score >= best.score * 0.9) best = r;
  }
  return best;
}

// Tippen mit dem Zauberstab auf den Springer
async function poseTap(p) {
  if (poseBusy || !viewMode) return;
  poseBusy = true;
  if (viewMode === 'video') pause();
  playerMsg(poseLm ? 'Haltung wird erkannt …' : 'Erkennung wird geladen …', true);
  try {
    const r = await detectPose(pCanvas, p[0], p[1]);
    if (!r || r.score < POSE_MIN) {
      playerMsg('Haltung nicht sicher erkannt. Bitte genau auf den Springer tippen.', false, 3500);
      return;
    }
    shapes.push({ type: 'pose', pts: r.pts, unsure: r.vis.map(v => v < POSE_SURE), color: COLORS[colorIdx] });
    renderDrawing();
    $('pMsg').classList.add('hidden');
  } catch (e) {
    console.warn(e);
    playerMsg('Erkennung nicht verfügbar', false, 3500);
  } finally {
    poseBusy = false;
  }
}

// Im Browser die Dateien der Erkennung einmal im Hintergrund in den Offline-Speicher holen,
// damit der Zauberstab später auch ohne Internet geht. Die Android-App bringt sie selbst mit.
if (!NATIVE && 'caches' in window && 'serviceWorker' in navigator) {
  setTimeout(async () => {
    if (!navigator.onLine || !navigator.serviceWorker.controller) return;
    for (const f of POSE_FILES) {
      try { if (!(await caches.match(POSE_BASE + f))) await fetch(POSE_BASE + f); } catch (e) {}
    }
  }, 20000);
}
