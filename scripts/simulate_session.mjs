#!/usr/bin/env node
/**
 * Generates a SYNTHETIC 30-minute drive with fatigue that grows over time and runs
 * it through the real FatigueMonitor + SessionRecorder used by the web app.
 * The output CSV has exactly the same format as a real session export.
 *
 * Genera un viaje SINTÉTICO de 30 minutos con fatiga creciente y lo pasa por el mismo
 * FatigueMonitor + SessionRecorder de la app web. El CSV tiene el mismo formato que una
 * sesión real. No contiene datos de ninguna persona.
 *
 * Usage / Uso:
 *   node scripts/simulate_session.mjs [output.csv] [--minutes 30] [--seed 42]
 * Without an output path it writes the sample used by the notebooks and by the
 * web Data Lab: analysis/sample_data/synthetic_session.csv and web/data/sample_session.csv.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { FatigueMonitor } from '../web/js/fatigue.js';
import { SessionRecorder } from '../web/js/session.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const custom = args.find((a) => a.endsWith('.csv'));
const outputs = custom
  ? [resolve(custom)]
  : [resolve('analysis/sample_data/synthetic_session.csv'), resolve('web/data/sample_session.csv')];
const MINUTES = opt('minutes', 30);
const SEED = opt('seed', 42);
const FPS = 30;
const DT = 1000 / FPS;

// Small seeded PRNG (mulberry32) so the sample is reproducible.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(SEED);
const uniform = (a, b) => a + (b - a) * rand();
const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

/** Fatigue from 0 (fresh) to 1 (very drowsy), rising after minute 8. */
const fatigueAt = (ms) => Math.min(1, Math.max(0, (ms / 60_000 - 8) / (MINUTES - 10)));

// Build the timeline of episodes (blinks, long closures, yawns, nods).
const total = MINUTES * 60_000;
const episodes = { closed: [], yawn: [], nod: [] };
for (let t = 2000; t < total; ) {
  const f = fatigueAt(t);
  const dur = uniform(110, 170) + f * uniform(120, 260);
  episodes.closed.push([t, t + dur]);
  t += dur + uniform(4200, 5200) - f * uniform(1500, 2500);
}
for (let t = 9 * 60_000; t < total; ) {
  const f = fatigueAt(t);
  if (rand() < f * 0.9) episodes.closed.push([t, t + uniform(850, 1400)]);
  t += uniform(50_000, 110_000) - f * 25_000;
}
for (let t = 6 * 60_000; t < total; ) {
  const f = fatigueAt(t);
  if (rand() < 0.25 + f) episodes.yawn.push([t, t + uniform(2500, 5000)]);
  t += uniform(150_000, 240_000) - f * 90_000;
}
for (let t = 18 * 60_000; t < total; t += uniform(120_000, 200_000)) {
  episodes.nod.push([t, t + uniform(1700, 2600)]);
}
episodes.closed.push([27.2 * 60_000, 27.2 * 60_000 + 1900]); // one critical microsleep
const inside = (list, t) => list.some(([a, b]) => t >= a && t < b);

const monitor = new FatigueMonitor();
const recorder = new SessionRecorder({ engine: 'synthetic' });
monitor.startCalibration(0);
const calibMs = monitor.cfg.calibrationMs + 200;

for (let t = 0; t < calibMs + total; t += DT) {
  const k = t - calibMs; // drive time (negative while calibrating)
  const closed = k >= 0 && inside(episodes.closed, k);
  const yawning = k >= 0 && inside(episodes.yawn, k);
  const nodding = k >= 0 && inside(episodes.nod, k);
  const faceLost = k >= 0 && k % 400_000 > 397_200; // ~2.8 s glance away every ~6.7 min
  const sig = faceLost
    ? { t, faceDetected: false }
    : {
        t,
        faceDetected: true,
        ear: (closed ? 0.09 : 0.3 - 0.03 * fatigueAt(Math.max(0, k))) + 0.008 * gauss(),
        mar: (yawning ? 0.72 : 0.06) + 0.01 * gauss(),
        pitch: (nodding ? 27 : 0) + 1.5 * gauss(),
        yaw: 2 * gauss(),
        blinkScore: closed ? 0.85 : 0.05,
        jawOpen: yawning ? 0.8 : 0.03,
        faceBox: { x: 0.3, y: 0.2, w: 0.4, h: 0.5 },
      };
  recorder.add(monitor.update(sig), sig);
}
recorder.finish();

for (const out of outputs) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, recorder.toCSV());
  console.log(`Wrote ${recorder.rows.length} rows → ${out}`);
}
const s = recorder.summary();
console.log(JSON.stringify(s));
