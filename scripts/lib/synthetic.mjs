/**
 * Synthetic drivers with KNOWN ground truth, for the simulation study.
 * Conductores sintéticos con verdad CONOCIDA, para el estudio de simulación.
 *
 * Each driver has a personal open-eye EAR, sensor noise, blink habits and a latent
 * fatigue curve f(t) ∈ [0, 1]. From f(t) we schedule eye closures (with realistic
 * closing/opening ramps), yawns, talking, head nods, mirror glances and moments with the
 * face out of frame. Because we generate the episodes ourselves, we know exactly what a
 * perfect detector should report — something real recordings cannot give for free.
 *
 * This is a simplified model of reality (see docs/en/data-science-report.md § threats).
 */

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/** Random driver profile. `overrides` lets experiments fix any field. */
export function makeDriver(id, seed, overrides = {}) {
  const r = rng(seed * 7919 + 17);
  const u = (a, b) => a + (b - a) * r();
  return {
    id,
    seed,
    minutes: 20,
    baseEar: u(0.22, 0.34), // open-eye EAR differs between people
    noise: u(0.006, 0.016), // camera / landmark jitter
    blinkIntervalMs: u(3000, 5200), // ~12–20 blinks per minute when alert
    onsetMin: u(3, 10), // when fatigue starts to grow
    fMax: r() < 0.25 ? u(0.1, 0.3) : u(0.6, 1), // some drivers stay alert
    ...overrides,
  };
}

/** Latent fatigue in [0, 1] at drive time `ms` (after calibration). */
export function fatigueAt(d, ms) {
  const m = ms / 60_000;
  const span = Math.max(1, d.minutes - d.onsetMin - 2);
  return d.fMax * clamp01((m - d.onsetMin) / span);
}

/**
 * Builds the ground-truth timeline for one drive (times in ms, drive time = 0 after
 * calibration; negative times are the calibration period with normal blinking only).
 */
export function generateTimeline(d, calibrationMs = 10_200) {
  const r = rng(d.seed);
  const u = (a, b) => a + (b - a) * r();
  const total = d.minutes * 60_000;
  const closures = [];
  for (let t = -calibrationMs + 500; t < total; ) {
    const f = t > 0 ? fatigueAt(d, t) : 0;
    let dur;
    let kind;
    if (t > 0 && r() < 0.08 * f ** 1.5) {
      kind = 'long';
      dur = r() < 0.3 * f ? u(1600, 2600) : u(850, 1450); // some are microsleeps
    } else {
      kind = 'blink';
      dur = u(100, 170) + f * u(60, 230); // blinks get longer with fatigue
    }
    closures.push({ start: t, end: t + dur, dur, kind });
    t += dur + d.blinkIntervalMs * (1 - 0.35 * f) * u(0.55, 1.45);
  }

  // Non-homogeneous Poisson process by thinning: candidates at the max rate,
  // each accepted with probability rate(t) / maxRate.
  const poisson = (ratePerMin, maxRate, durRange, minGap = 1000) => {
    const out = [];
    for (let t = 2000; t < total; ) {
      t += (-Math.log(1 - r()) / maxRate) * 60_000;
      if (t >= total) break;
      if (r() > ratePerMin(t) / maxRate) continue;
      const dur = u(...durRange);
      out.push({ start: t, end: t + dur, dur });
      t += dur + minGap;
    }
    return out;
  };
  const yawns = poisson((t) => 0.08 + 0.45 * fatigueAt(d, t), 0.53, [2500, 5000], 4000);
  const talking = poisson(() => 0.6, 0.6, [3000, 8000], 2000); // talking / laughing: NOT yawns
  const nods = poisson((t) => 0.4 * fatigueAt(d, t) ** 2, 0.4, [1700, 2800], 3000);
  const glances = poisson(() => 1.5, 1.5, [500, 1100], 1500); // mirror checks: should NOT count
  const faceLost = poisson(() => 0.12, 0.12, [400, 2600], 5000);
  return { closures, yawns, talking, nods, glances, faceLost, total, calibrationMs };
}

/** Index helper to find the active episode at time t quickly (lists are sorted). */
function cursor(list) {
  let i = 0;
  return (t) => {
    while (i < list.length && list[i].end <= t) i++;
    const e = list[i];
    return e && t >= e.start && t < e.end ? e : null;
  };
}

/** Eyelid closure 0..1 inside a closure episode, with closing/opening ramps. */
export function closureDepth(e, t) {
  const rampIn = Math.min(70, 0.3 * e.dur);
  const rampOut = Math.min(110, 0.4 * e.dur);
  const k = t - e.start;
  if (k < rampIn) return k / rampIn;
  if (k > e.dur - rampOut) return Math.max(0, (e.dur - k) / rampOut);
  return 1;
}

/**
 * Frame-by-frame signals at `fps`, as the engine would produce them.
 * Yields {sig, truth} where truth has the exact closure depth and latent fatigue.
 */
export function* frames(d, tl, fps, noiseScale = 1) {
  const r = rng(d.seed + 99);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const dt = 1000 / fps;
  const at = {
    closure: cursor(tl.closures),
    yawn: cursor(tl.yawns),
    talk: cursor(tl.talking),
    nod: cursor(tl.nods),
    glance: cursor(tl.glances),
    lost: cursor(tl.faceLost),
  };
  const box = { x: 0.3, y: 0.2, w: 0.4, h: 0.5 };
  for (let t = -tl.calibrationMs; t < tl.total; t += dt) {
    const f = t > 0 ? fatigueAt(d, t) : 0;
    const c = at.closure(t);
    const depth = c ? closureDepth(c, t) : 0;
    const lost = t > 0 && at.lost(t);
    const y = t > 0 && at.yawn(t);
    const talk = t > 0 && at.talk(t);
    const nod = t > 0 && at.nod(t);
    const glance = t > 0 && at.glance(t);
    const open = d.baseEar * (1 - 0.12 * f);
    const ear = open * (1 - 0.75 * depth) + d.noise * noiseScale * gauss();
    let mar = 0.06 + 0.01 * gauss();
    if (talk) mar = 0.12 + 0.45 * Math.abs(Math.sin((t - talk.start) / 180)) + 0.02 * gauss();
    if (y) mar = 0.06 + 0.7 * Math.min(1, (t - y.start) / 400, (y.end - t) / 400) + 0.02 * gauss();
    const sig = lost
      ? { t: t + tl.calibrationMs, faceDetected: false }
      : {
          t: t + tl.calibrationMs,
          faceDetected: true,
          ear,
          mar,
          pitch: (nod ? 26 : 0) + 1.5 * gauss(),
          yaw: (glance ? 35 : 0) + 2 * gauss(),
          faceBox: box,
        };
    yield { sig, truth: { driveT: t, depth, f, lost: !!lost } };
  }
}
