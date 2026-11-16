import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FatigueMonitor, levelIndexFor } from '../../web/js/fatigue.js';
import { DEFAULTS } from '../../web/js/config.js';
import { calibrate, DT, eventsOf, openFace, run } from './helpers.mjs';

test('calibration builds a personal baseline', () => {
  const m = new FatigueMonitor();
  const { snaps } = calibrate(m);
  assert.equal(m.phase, 'monitoring');
  assert.equal(eventsOf(snaps, 'calibrated').length, 1);
  assert.ok(Math.abs(m.baseline.ear - 0.3) < 1e-9);
  assert.ok(Math.abs(m.baseline.cy - 0.45) < 1e-9);
});

test('calibration restarts when the face is not visible', () => {
  const m = new FatigueMonitor();
  m.startCalibration(0);
  const { snaps } = run(m, 0, 10_200, (t) => ({ t, faceDetected: false }));
  assert.equal(m.phase, 'calibrating');
  assert.equal(eventsOf(snaps, 'calibration_retry').length, 1);
});

test('normal blinking is counted and keeps the driver "ok"', () => {
  const m = new FatigueMonitor();
  const { t } = calibrate(m);
  // 150 ms blink every 4 s → 15 blinks/min, PERCLOS ≈ 3.75 %.
  const { snaps } = run(m, t, 120_000, (tt) => openFace(tt, { ear: (tt - t) % 4000 < 150 ? 0.1 : 0.3 }));
  const last = snaps.at(-1);
  assert.ok(last.totals.blinks >= 28 && last.totals.blinks <= 31, `blinks ${last.totals.blinks}`);
  assert.ok(Math.abs(last.blinkRate - 15) <= 1.5, `rate ${last.blinkRate}`);
  assert.ok(last.perclos > 0.02 && last.perclos < 0.06, `perclos ${last.perclos}`);
  assert.equal(last.totals.longClosures, 0);
  assert.equal(last.level, 'ok');
  assert.ok(last.score < DEFAULTS.levels[1].min);
});

test('single-frame noise is not a blink', () => {
  const m = new FatigueMonitor();
  const { t } = calibrate(m);
  let first = true;
  const { snaps } = run(m, t, 2000, (tt) => {
    const ear = first ? 0.1 : 0.3;
    first = false;
    return openFace(tt, { ear });
  });
  assert.equal(snaps.at(-1).totals.blinks, 0);
});

test('a 1 s closure is a long closure (not a blink)', () => {
  const m = new FatigueMonitor();
  const { t } = calibrate(m);
  const { snaps } = run(m, t, 3000, (tt) => openFace(tt, { ear: tt - t < 1000 ? 0.1 : 0.3 }));
  assert.equal(eventsOf(snaps, 'long_closure').length, 1);
  assert.equal(eventsOf(snaps, 'critical_closure').length, 0);
  assert.equal(snaps.at(-1).totals.blinks, 0);
});

test('a 2 s closure fires a critical alert and forces the "high" level', () => {
  const m = new FatigueMonitor();
  const { t } = calibrate(m);
  const { snaps } = run(m, t, 2100, (tt) => openFace(tt, { ear: 0.1 }));
  const crit = eventsOf(snaps, 'critical_closure');
  assert.equal(crit.length, 1);
  assert.ok(crit[0].dur >= DEFAULTS.criticalClosureMs && crit[0].dur < DEFAULTS.criticalClosureMs + 2 * DT);
  const last = snaps.at(-1);
  assert.ok(last.score >= DEFAULTS.criticalScore, `score ${last.score}`);
  assert.equal(last.level, 'high');
});

test('a sustained wide-open mouth is a yawn; a short one is not', () => {
  const m = new FatigueMonitor();
  const { t } = calibrate(m);
  const short = run(m, t, 3000, (tt) => openFace(tt, { mar: tt - t < 500 ? 0.7 : 0.05 }));
  assert.equal(eventsOf(short.snaps, 'yawn').length, 0);
  const long = run(m, short.t, 5000, (tt) => openFace(tt, { mar: tt - short.t < 3000 ? 0.7 : 0.05 }));
  assert.equal(eventsOf(long.snaps, 'yawn').length, 1);
});

test('head nod beyond the baseline is detected once per episode', () => {
  const m = new FatigueMonitor();
  const { t } = calibrate(m);
  const { snaps } = run(m, t, 4000, (tt) => openFace(tt, { pitch: tt - t < 3000 ? 30 : 0 }));
  assert.equal(eventsOf(snaps, 'head_deviation').length, 1);
});

test('Haar proxy: no eyes detected inside the face counts as closed', () => {
  const m = new FatigueMonitor();
  m.startCalibration(0);
  const haar = (tt, eyes) => ({
    t: tt,
    faceDetected: true,
    eyesVisible: eyes,
    faceBox: { x: 0.3, y: 0.2, w: 0.4, h: 0.5 },
  });
  const cal = run(m, 0, 10_200, (tt) => haar(tt, 2));
  assert.equal(m.baseline.eyeVisibleRate, 1);
  const { snaps } = run(m, cal.t, 2000, (tt) => haar(tt, tt - cal.t < 1000 ? 0 : 2));
  assert.equal(eventsOf(snaps, 'long_closure').length, 1);
  // Face centre moving down by > 0.35 face heights is a head-drop proxy.
  const drop = run(m, cal.t + 2000, 2500, (tt) => ({ ...haar(tt, 2), faceBox: { x: 0.3, y: 0.45, w: 0.4, h: 0.5 } }));
  assert.equal(eventsOf(drop.snaps, 'head_deviation').length, 1);
});

test('unreliable Haar eye signal raises a warning', () => {
  const m = new FatigueMonitor();
  m.startCalibration(0);
  let i = 0;
  const cal = run(m, 0, 10_200, (tt) => ({ t: tt, faceDetected: true, eyesVisible: i++ % 2 ? 0 : 1 }));
  const { snaps } = run(m, cal.t, 100, (tt) => ({ t: tt, faceDetected: true, eyesVisible: 1 }));
  assert.deepEqual(snaps.at(-1).warnings, ['eye_signal_unreliable']);
});

test('face out of frame for > 2 s is an attention event', () => {
  const m = new FatigueMonitor();
  const { t } = calibrate(m);
  const { snaps } = run(m, t, 3000, (tt) => ({ t: tt, faceDetected: false }));
  assert.equal(eventsOf(snaps, 'face_lost').length, 1);
});

test('a pause in the frames does not create fake long closures', () => {
  const m = new FatigueMonitor();
  const { t } = calibrate(m);
  m.update(openFace(t, { ear: 0.1 })); // eyes closed…
  const snap = m.update(openFace(t + 5000, { ear: 0.3 })); // …app paused 5 s, then open
  assert.equal(snap.totals.longClosures, 0);
  assert.equal(snap.totals.criticalClosures, 0);
});

test('a drowsy pattern escalates the level', () => {
  const m = new FatigueMonitor();
  const { t } = calibrate(m);
  // Slow 350 ms blinks every 2.5 s + one 1.2 s closure every 20 s + yawns.
  const { snaps } = run(m, t, 180_000, (tt) => {
    const k = tt - t;
    const closed = k % 2500 < 350 || k % 20_000 < 1200;
    const yawning = k % 45_000 > 10_000 && k % 45_000 < 13_000;
    return openFace(tt, { ear: closed ? 0.1 : 0.3, mar: yawning ? 0.75 : 0.05 });
  });
  const last = snaps.at(-1);
  assert.ok(last.levelIndex >= 2, `level ${last.level} score ${last.score}`);
  assert.ok(last.perclos > 0.1);
});

test('level hysteresis avoids flicker at a boundary', () => {
  const cfg = DEFAULTS;
  assert.equal(levelIndexFor(56, 0, cfg), 2);
  assert.equal(levelIndexFor(52, 2, cfg), 2); // within 5 points below "moderate"
  assert.equal(levelIndexFor(49, 2, cfg), 1);
});
