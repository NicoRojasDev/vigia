// Small signal generator for the tests. / Generador de señales para los tests.

export const FPS = 30;
export const DT = 1000 / FPS;

export const openFace = (t, extra = {}) => ({
  t,
  faceDetected: true,
  ear: 0.3,
  mar: 0.05,
  pitch: 0,
  yaw: 0,
  faceBox: { x: 0.3, y: 0.2, w: 0.4, h: 0.5 },
  ...extra,
});

/** Run `fn(t)` -> signal for `ms` milliseconds starting at `t0`. Returns {t, snaps}. */
export function run(monitor, t0, ms, fn) {
  const snaps = [];
  let t = t0;
  for (; t < t0 + ms; t += DT) snaps.push(monitor.update(fn(t)));
  return { t, snaps };
}

/** Calibrate with an open, frontal face for the default 10 s. */
export function calibrate(monitor, t0 = 0) {
  monitor.startCalibration(t0);
  return run(monitor, t0, 10_200, (t) => openFace(t));
}

export const eventsOf = (snaps, type) => snaps.flatMap((s) => s.events).filter((e) => e.type === type);
