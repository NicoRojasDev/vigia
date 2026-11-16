/**
 * Classic baseline: OpenCV.js Haar cascades (Viola–Jones, 2001).
 * Línea base clásica: cascadas Haar de OpenCV.js (Viola–Jones, 2001).
 *
 * This is how the original prototype worked. It is kept on purpose so both
 * approaches can be compared with the same pipeline and metrics:
 *  - face:  haarcascade_frontalface_default.xml
 *  - eyes:  haarcascade_eye.xml   → "eyes closed" ≈ no eye detected inside the face
 *  - mouth: haarcascade_mcs_mouth.xml (drawn only; not reliable for yawns)
 *
 * Así funcionaba el prototipo original. Se mantiene para comparar ambos enfoques.
 * Limitation: the eye cascade was trained on OPEN eyes, so "closed" is inferred from
 * a missed detection, which also happens with glasses, shadows or head turns.
 */
import { ASSETS, ENGINES } from '../config.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.dataset.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(s);
  });
}

/**
 * opencv.js builds expose `cv` as a ready module, a pending module or a "thenable".
 * Careful: the Emscripten module has its own `.then`, so `await cv` (or returning it
 * from an async function) loops forever. We wait with callbacks and return a wrapper.
 *
 * Ojo: el módulo de Emscripten tiene `.then`; hacer `await cv` queda en bucle infinito.
 */
function resolveCv(cv) {
  return new Promise((resolve, reject) => {
    if (!cv) return reject(new Error('opencv_not_found'));
    if (cv.Mat) return resolve({ cv });
    if (typeof cv.then === 'function') {
      cv.then((mod) => resolve({ cv: mod?.Mat ? mod : cv }));
    } else {
      cv.onRuntimeInitialized = () => resolve({ cv });
    }
  });
}

const clampRect = (x, y, w, h, W, H) => {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w));
  const y1 = Math.min(H, Math.round(y + h));
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
};

export class HaarEngine {
  constructor() {
    this.id = 'haar';
    this.label = 'OpenCV.js Haar cascades';
    this.cv = null;
    this.classifiers = {};
    this.canvas = null;
    this.ctx = null;
  }

  async init(onStatus = () => {}) {
    onStatus('loading_library');
    await loadScript(ASSETS.opencv.script);
    this.cv = (await resolveCv(globalThis.cv)).cv;
    const cv = this.cv;

    onStatus('loading_model');
    for (const [name, url] of Object.entries(ASSETS.opencv.cascades)) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Could not load ${url}`);
      const data = new Uint8Array(await res.arrayBuffer());
      const file = `${name}.xml`;
      try {
        cv.FS_unlink(`/${file}`);
      } catch {
        /* first load */
      }
      cv.FS_createDataFile('/', file, data, true, false, false);
      const clf = new cv.CascadeClassifier();
      if (!clf.load(file)) throw new Error(`Invalid cascade ${file}`);
      this.classifiers[name] = clf;
    }
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  process(video, t) {
    if (!this.cv || video.readyState < 2 || !video.videoWidth) return null;
    const cv = this.cv;
    const W = ENGINES.haar.processWidth;
    const H = Math.round((W * video.videoHeight) / video.videoWidth);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    this.ctx.drawImage(video, 0, 0, W, H);
    return this.detect(this.canvas, t);
  }

  /** Detection on a canvas/image element (also used by tests). */
  detect(source, t) {
    const cv = this.cv;
    const toDelete = [];
    const track = (m) => {
      toDelete.push(m);
      return m;
    };
    try {
      const src = track(cv.imread(source));
      const W = src.cols;
      const H = src.rows;
      const gray = track(new cv.Mat());
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.equalizeHist(gray, gray);

      // 1) Face — keep the largest one.
      const faces = track(new cv.RectVector());
      const minFace = Math.round(W * 0.15);
      this.classifiers.face.detectMultiScale(gray, faces, 1.1, 5, 0, new cv.Size(minFace, minFace));
      let f = null;
      for (let i = 0; i < faces.size(); i++) {
        const r = faces.get(i);
        if (!f || r.width * r.height > f.width * f.height) f = r;
      }
      if (!f) return { t, engine: this.id, faceDetected: false };

      // 2) Eyes — search the upper part of the face, count one per side.
      const eyeArea = clampRect(f.x, f.y + f.height * 0.18, f.width, f.height * 0.37, W, H);
      const eyeRoi = track(gray.roi(eyeArea));
      const eyes = track(new cv.RectVector());
      const minEye = Math.max(8, Math.round(f.width * 0.12));
      const maxEye = Math.round(f.width * 0.45);
      this.classifiers.eye.detectMultiScale(
        eyeRoi, eyes, 1.1, 6, 0, new cv.Size(minEye, minEye), new cv.Size(maxEye, maxEye),
      );
      let left = null;
      let right = null;
      for (let i = 0; i < eyes.size(); i++) {
        const e = eyes.get(i);
        const box = { x: eyeArea.x + e.x, y: eyeArea.y + e.y, w: e.width, h: e.height };
        if (e.x + e.width / 2 < eyeArea.width / 2) left ??= box;
        else right ??= box;
      }
      const eyeBoxes = [left, right].filter(Boolean);

      // 3) Mouth — lower third of the face (overlay only).
      const mouthArea = clampRect(f.x + f.width * 0.15, f.y + f.height * 0.62, f.width * 0.7, f.height * 0.45, W, H);
      let mouthBox = null;
      if (mouthArea.width > 10 && mouthArea.height > 6) {
        const mouthRoi = track(gray.roi(mouthArea));
        const mouths = track(new cv.RectVector());
        this.classifiers.mouth.detectMultiScale(mouthRoi, mouths, 1.1, 11, 0);
        for (let i = 0; i < mouths.size(); i++) {
          const m = mouths.get(i);
          if (!mouthBox || m.width * m.height > mouthBox.w * mouthBox.h) {
            mouthBox = { x: mouthArea.x + m.x, y: mouthArea.y + m.y, w: m.width, h: m.height };
          }
        }
      }

      const norm = (b) => b && { x: b.x / W, y: b.y / H, w: b.w / W, h: b.h / H };
      return {
        t,
        engine: this.id,
        faceDetected: true,
        ear: null,
        mar: null,
        pitch: null,
        yaw: null,
        eyesVisible: eyeBoxes.length,
        blinkScore: null,
        jawOpen: null,
        faceBox: norm({ x: f.x, y: f.y, w: f.width, h: f.height }),
        eyeBoxes: eyeBoxes.map(norm),
        mouthBox: norm(mouthBox),
      };
    } finally {
      // OpenCV.js memory is manual: free every Mat/vector.
      for (const m of toDelete) m.delete();
    }
  }

  drawOverlay(ctx, sig, snap, W, H) {
    if (!sig?.faceBox) return;
    const rect = (b, color, width = 2) => {
      if (!b) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.strokeRect(b.x * W, b.y * H, b.w * W, b.h * H);
    };
    rect(sig.faceBox, 'rgba(255,255,255,0.6)');
    for (const e of sig.eyeBoxes ?? []) rect(e, '#4ade80');
    if (snap?.eyeClosed) rect(sig.faceBox, '#ff5d5d', 3);
    rect(sig.mouthBox, '#60a5fa');
  }

  dispose() {
    for (const c of Object.values(this.classifiers)) {
      try {
        c.delete();
      } catch {
        /* ignore */
      }
    }
    this.classifiers = {};
  }
}
