/**
 * Pure geometry helpers (no DOM). Same formulas as analysis/vigia_analysis/features.py,
 * and both are checked against tests/fixtures/metrics_cases.json.
 *
 * Funciones puras de geometría (sin DOM). Mismas fórmulas que
 * analysis/vigia_analysis/features.py; ambas se validan con el mismo fixture.
 */

/**
 * MediaPipe Face Mesh landmark indices (478-point model).
 * Order for each eye: [p1 outer corner, p2, p3, p4 inner corner, p5, p6]
 * following Soukupová & Čech (2016): EAR = (|p2-p6| + |p3-p5|) / (2 |p1-p4|).
 * "right"/"left" refer to the subject's face, not the viewer.
 */
export const LANDMARKS = Object.freeze({
  rightEye: [33, 160, 158, 133, 153, 144],
  leftEye: [362, 385, 387, 263, 373, 380],
  // Inner-lip points: corners and three upper/lower pairs.
  mouth: { left: 78, right: 308, pairs: [[82, 87], [13, 14], [312, 317]] },
});

export const clamp01 = (x) => Math.min(1, Math.max(0, x));

/** Euclidean distance in pixels. Landmarks are normalised, so scale by frame size. */
export function dist(a, b, width = 1, height = 1) {
  const dx = (a.x - b.x) * width;
  const dy = (a.y - b.y) * height;
  return Math.hypot(dx, dy);
}

/** Eye Aspect Ratio from 6 points [p1..p6]. Returns null if degenerate. */
export function earFromPoints(p, width = 1, height = 1) {
  const horizontal = dist(p[0], p[3], width, height);
  if (horizontal <= 1e-9) return null;
  const v1 = dist(p[1], p[5], width, height);
  const v2 = dist(p[2], p[4], width, height);
  return (v1 + v2) / (2 * horizontal);
}

/** EAR of one eye given the full landmark list and the 6 indices. */
export function eyeAspectRatio(landmarks, indices, width, height) {
  return earFromPoints(indices.map((i) => landmarks[i]), width, height);
}

/** Mean EAR of both eyes (null if either is missing). */
export function averageEAR(landmarks, width, height) {
  const r = eyeAspectRatio(landmarks, LANDMARKS.rightEye, width, height);
  const l = eyeAspectRatio(landmarks, LANDMARKS.leftEye, width, height);
  if (r == null || l == null) return null;
  return (r + l) / 2;
}

/**
 * Mouth Aspect Ratio from corners and vertical pairs:
 * MAR = mean(|upper_i - lower_i|) / |left - right|
 */
export function marFromPoints(left, right, pairs, width = 1, height = 1) {
  const horizontal = dist(left, right, width, height);
  if (horizontal <= 1e-9 || pairs.length === 0) return null;
  const vertical = pairs.reduce((s, [u, d]) => s + dist(u, d, width, height), 0) / pairs.length;
  return vertical / horizontal;
}

export function mouthAspectRatio(landmarks, width, height) {
  const m = LANDMARKS.mouth;
  const pairs = m.pairs.map(([u, d]) => [landmarks[u], landmarks[d]]);
  return marFromPoints(landmarks[m.left], landmarks[m.right], pairs, width, height);
}

/**
 * Head orientation (degrees) from MediaPipe's 4x4 facial transformation matrix.
 * The memory layout is detected from where the translation sits, so the result
 * does not depend on row- vs column-major storage. Signs may vary by device, which
 * is fine: Vigía only uses the deviation from the personal baseline.
 */
export function eulerFromMatrix(matrix) {
  const d = matrix?.data ?? matrix;
  if (!d || d.length < 16) return { pitch: null, yaw: null, roll: null };
  const colMajor = Math.abs(d[14]) >= Math.abs(d[11]);
  const R = (r, c) => (colMajor ? d[c * 4 + r] : d[r * 4 + c]);
  const deg = 180 / Math.PI;
  const pitch = Math.atan2(R(2, 1), R(2, 2)) * deg;
  const yaw = Math.atan2(-R(2, 0), Math.hypot(R(2, 1), R(2, 2))) * deg;
  const roll = Math.atan2(R(1, 0), R(0, 0)) * deg;
  return { pitch, yaw, roll };
}

/** Mean score of the named MediaPipe blendshapes (null if none present). */
export function blendshapeMean(categories, names) {
  const vals = names
    .map((n) => categories.find((c) => c.categoryName === n)?.score)
    .filter((v) => typeof v === 'number');
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/** Bounding box (normalised) of a landmark list. */
export function landmarksBox(landmarks) {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function median(values) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function mean(values) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
