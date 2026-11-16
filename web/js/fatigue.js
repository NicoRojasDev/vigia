/**
 * FatigueMonitor — turns per-frame face signals into fatigue indicators.
 * FatigueMonitor — convierte señales del rostro (por cuadro) en indicadores de fatiga.
 *
 * Engine-agnostic: it works with MediaPipe (EAR/MAR/head pose) or with the
 * classic Haar baseline (eyes visible / face position). Pure logic, no DOM:
 * time comes from the signal (`sig.t`, in ms) so it can be tested and simulated.
 *
 * Independiente del motor y sin DOM: el tiempo llega en la señal (`sig.t`, en ms),
 * así se puede testear y simular.
 *
 * Input signal / Señal de entrada:
 *   { t, faceDetected, ear?, mar?, pitch?, yaw?, eyesVisible?, faceBox?, blinkScore?, jawOpen? }
 */
import { DEFAULTS } from './config.js';
import { clamp01, mean, median } from './metrics.js';

const TOTAL_KEYS = {
  long_closure: 'longClosures',
  critical_closure: 'criticalClosures',
  yawn: 'yawns',
  head_deviation: 'headDeviations',
  face_lost: 'faceLost',
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Smallest signed difference between two angles in degrees (handles ±180° wrap). */
export function angleDiff(a, b) {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

/** Personal baseline from calibration samples (medians are robust to blinks). */
export function computeBaseline(samples) {
  const withEyes = samples.filter((s) => isNum(s.eyesVisible));
  return {
    frames: samples.length,
    ear: median(samples.map((s) => s.ear)),
    mar: median(samples.map((s) => s.mar)),
    pitch: median(samples.map((s) => s.pitch)),
    yaw: median(samples.map((s) => s.yaw)),
    cy: median(samples.map((s) => (s.faceBox ? s.faceBox.y + s.faceBox.h / 2 : null))),
    faceH: median(samples.map((s) => s.faceBox?.h)),
    eyeVisibleRate: withEyes.length ? mean(withEyes.map((s) => (s.eyesVisible > 0 ? 1 : 0))) : null,
  };
}

export function levelIndexFor(score, currentIndex, cfg) {
  let idx = 0;
  cfg.levels.forEach((l, i) => {
    if (score >= l.min) idx = i;
  });
  // Hysteresis: only step down once clearly below the current level's floor.
  if (idx < currentIndex && score > cfg.levels[currentIndex].min - cfg.levelHysteresis) {
    return currentIndex;
  }
  return idx;
}

export class FatigueMonitor {
  constructor(config = {}) {
    this.cfg = {
      ...DEFAULTS,
      ...config,
      scoreWeights: { ...DEFAULTS.scoreWeights, ...(config.scoreWeights ?? {}) },
    };
    this.reset();
  }

  reset() {
    this.phase = 'idle'; // idle → calibrating → monitoring
    this.baseline = null;
    this.calibSamples = [];
    this.calibStart = null;
    this.monitorStart = null;

    this.closedSince = null;
    this.criticalFired = false;
    this.lastCriticalT = -Infinity;
    this.faceLostSince = null;
    this.faceLostFired = false;
    this.yawnSince = null;
    this.headSince = null;
    this.headFired = false;

    this.window = []; // PERCLOS samples {t, c}
    this.windowHead = 0;
    this.windowClosed = 0;
    this.blinks = []; // {t, dur} — last 60 s
    this.events = []; // last `eventWindowMs`
    this.totals = { blinks: 0, longClosures: 0, criticalClosures: 0, yawns: 0, headDeviations: 0, faceLost: 0 };

    this.score = 0;
    this.rawScore = 0;
    this.parts = null;
    this.levelIndex = 0;
    this.lastT = null;
    this.lastFrameT = null;
  }

  /** Forget episodes in progress (closure, yawn, head turn, face lost). */
  resetEpisodes() {
    this.closedSince = null;
    this.criticalFired = false;
    this.yawnSince = null;
    this.headSince = null;
    this.headFired = false;
    this.faceLostSince = null;
    this.faceLostFired = false;
  }

  startCalibration(t) {
    this.reset();
    this.phase = 'calibrating';
    this.calibStart = t;
  }

  /** Feed one frame. Returns a snapshot with metrics, score, level and new events. */
  update(sig) {
    const t = sig.t;
    const out = [];

    if (this.phase === 'calibrating') {
      if (sig.faceDetected) this.calibSamples.push(sig);
      if (t - this.calibStart >= this.cfg.calibrationMs) {
        if (this.calibSamples.length >= this.cfg.minCalibrationFrames) {
          this.baseline = computeBaseline(this.calibSamples);
          this.phase = 'monitoring';
          this.monitorStart = t;
          this.lastT = t;
          out.push({ type: 'calibrated', t });
        } else {
          out.push({ type: 'calibration_retry', t });
          this.calibStart = t;
          this.calibSamples = [];
        }
      }
      return this.snapshot(t, sig, out, null);
    }

    if (this.phase !== 'monitoring') return this.snapshot(t, sig, out, null);

    // If the app was paused (tab hidden, phone locked) we cannot know what happened
    // in between, so ongoing episodes are discarded instead of being over-counted.
    if (this.lastFrameT != null && t - this.lastFrameT > this.cfg.maxGapMs) this.resetEpisodes();
    this.lastFrameT = t;

    const eyeClosed = this.isEyeClosed(sig);
    this.trackFace(sig, t, out);
    this.trackEyes(eyeClosed, t, out);
    this.trackPerclos(eyeClosed, t);
    this.trackYawn(sig, t, out);
    this.trackHead(sig, t, out);
    this.prune(t);
    this.updateScore(t);
    return this.snapshot(t, sig, out, eyeClosed);
  }

  // ---------------------------------------------------------------- signals

  /** true / false, or null when unknown (no face, no eye signal). */
  isEyeClosed(sig) {
    if (!sig.faceDetected) return null;
    if (isNum(sig.ear)) {
      const thr =
        this.cfg.useBaselineForEyes && isNum(this.baseline?.ear)
          ? this.baseline.ear * this.cfg.eyeClosedRatio
          : this.cfg.eyeClosedAbsolute;
      return sig.ear < thr;
    }
    if (isNum(sig.eyesVisible)) return sig.eyesVisible === 0; // Haar proxy
    return null;
  }

  trackFace(sig, t, out) {
    if (sig.faceDetected) {
      this.faceLostSince = null;
      this.faceLostFired = false;
      return;
    }
    if (this.faceLostSince == null) this.faceLostSince = t;
    if (!this.faceLostFired && t - this.faceLostSince >= this.cfg.faceLostMs) {
      this.faceLostFired = true;
      this.addEvent({ type: 'face_lost', t }, out);
    }
  }

  trackEyes(closed, t, out) {
    const c = this.cfg;
    if (closed === true) {
      if (this.closedSince == null) this.closedSince = t;
      const dur = t - this.closedSince;
      if (dur >= c.criticalClosureMs) {
        if (!this.criticalFired) {
          this.criticalFired = true;
          this.addEvent({ type: 'critical_closure', t, dur }, out);
        }
        this.lastCriticalT = t; // keep the score high while eyes stay closed
      }
    } else if (closed === false) {
      if (this.closedSince != null) this.endClosure(t - this.closedSince, t, out);
      this.closedSince = null;
      this.criticalFired = false;
    } else if (
      this.closedSince != null &&
      this.faceLostSince != null &&
      t - this.faceLostSince >= c.faceLostMs
    ) {
      // Face gone for too long: we can no longer say what the eyes did.
      this.closedSince = null;
      this.criticalFired = false;
    }
  }

  endClosure(dur, t, out) {
    if (dur < this.cfg.minBlinkMs) return; // single-frame noise
    if (dur >= this.cfg.longClosureMs) {
      this.addEvent({ type: 'long_closure', t, dur }, out);
    } else {
      this.blinks.push({ t, dur });
      this.totals.blinks += 1;
      out.push({ type: 'blink', t, dur });
    }
  }

  trackPerclos(closed, t) {
    if (closed == null) return;
    const c = closed ? 1 : 0;
    this.window.push({ t, c });
    this.windowClosed += c;
  }

  trackYawn(sig, t, out) {
    if (!isNum(sig.mar)) {
      this.yawnSince = null;
      return;
    }
    const thr = Math.max(this.cfg.yawnMar, (this.baseline?.mar ?? 0) + this.cfg.yawnBaselineMargin);
    if (sig.mar >= thr) {
      if (this.yawnSince == null) this.yawnSince = t;
    } else if (sig.mar < thr * 0.8) {
      if (this.yawnSince != null && t - this.yawnSince >= this.cfg.yawnMinMs) {
        this.addEvent({ type: 'yawn', t, dur: t - this.yawnSince }, out);
      }
      this.yawnSince = null;
    }
  }

  /** Head pose (MediaPipe) or face-centre shift (Haar proxy) away from the baseline. */
  headDeviation(sig) {
    const b = this.baseline;
    if (!sig.faceDetected || !b) return null;
    if (isNum(sig.pitch) && isNum(b.pitch)) {
      const pitchOff = Math.abs(angleDiff(sig.pitch, b.pitch)) > this.cfg.headPitchDeg;
      const yawOff =
        isNum(sig.yaw) && isNum(b.yaw) && Math.abs(angleDiff(sig.yaw, b.yaw)) > this.cfg.headYawDeg;
      return pitchOff || yawOff;
    }
    if (sig.faceBox && isNum(b.cy) && isNum(b.faceH) && b.faceH > 0) {
      const cy = sig.faceBox.y + sig.faceBox.h / 2;
      return Math.abs(cy - b.cy) / b.faceH > this.cfg.haarHeadShift;
    }
    return null;
  }

  trackHead(sig, t, out) {
    const dev = this.headDeviation(sig);
    if (dev === true) {
      if (this.headSince == null) this.headSince = t;
      if (!this.headFired && t - this.headSince >= this.cfg.headDevMinMs) {
        this.headFired = true;
        this.addEvent({ type: 'head_deviation', t }, out);
      }
    } else if (dev === false) {
      this.headSince = null;
      this.headFired = false;
    }
  }

  addEvent(e, out) {
    this.events.push(e);
    out.push(e);
    const key = TOTAL_KEYS[e.type];
    if (key) this.totals[key] += 1;
  }

  prune(t) {
    const wStart = t - this.cfg.perclosWindowMs;
    while (this.windowHead < this.window.length && this.window[this.windowHead].t < wStart) {
      this.windowClosed -= this.window[this.windowHead].c;
      this.windowHead += 1;
    }
    if (this.windowHead > 4096) {
      this.window = this.window.slice(this.windowHead);
      this.windowHead = 0;
    }
    const eStart = t - this.cfg.eventWindowMs;
    if (this.events.length && this.events[0].t < eStart) this.events = this.events.filter((e) => e.t >= eStart);
    const bStart = t - 60_000;
    if (this.blinks.length && this.blinks[0].t < bStart) this.blinks = this.blinks.filter((b) => b.t >= bStart);
  }

  // ---------------------------------------------------------------- metrics

  /** PERCLOS: fraction of frames with eyes closed in the rolling window. */
  perclos() {
    const n = this.window.length - this.windowHead;
    if (n <= 0) return null;
    const coverage = this.window[this.window.length - 1].t - this.window[this.windowHead].t;
    if (coverage < this.cfg.perclosMinCoverageMs) return null;
    return this.windowClosed / n;
  }

  /** Blinks per minute over the last 60 s (scaled if monitoring started recently). */
  blinkRate(t) {
    if (this.monitorStart == null) return null;
    const elapsed = Math.min(60_000, t - this.monitorStart);
    if (elapsed < 10_000) return null;
    return (this.blinks.length / elapsed) * 60_000;
  }

  avgBlinkMs() {
    if (this.blinks.length < 3) return null;
    return mean(this.blinks.map((b) => b.dur));
  }

  recentCounts() {
    const r = { longClosures: 0, criticalClosures: 0, yawns: 0, headDeviations: 0, faceLost: 0 };
    for (const e of this.events) {
      const key = TOTAL_KEYS[e.type];
      if (key) r[key] += 1;
    }
    return r;
  }

  warnings() {
    const w = [];
    const rate = this.baseline?.eyeVisibleRate;
    if (isNum(rate) && rate < 0.6) w.push('eye_signal_unreliable');
    return w;
  }

  /**
   * Fatigue score 0–100: weighted sum of saturating sub-scores, smoothed in time.
   * v0.1 is a transparent heuristic; the roadmap replaces the weights with a model
   * fitted on labelled data (KSS / PVT). See docs/en/methodology.md.
   */
  updateScore(t) {
    const c = this.cfg;
    const w = c.scoreWeights;
    const perclos = this.perclos();
    const recent = this.recentCounts();
    const avgBlink = this.avgBlinkMs();
    const parts = {
      perclos: perclos == null ? 0 : clamp01(perclos / c.perclosHigh),
      longClosures: clamp01(recent.longClosures / c.longClosuresHigh),
      yawns: clamp01(recent.yawns / c.yawnsHigh),
      blinkDuration:
        avgBlink == null
          ? 0
          : clamp01((avgBlink - c.blinkDurNormalMs) / (c.blinkDurHighMs - c.blinkDurNormalMs)),
      head: clamp01((recent.headDeviations + 0.5 * recent.faceLost) / c.headEventsHigh),
    };
    const raw = 100 * Object.keys(w).reduce((s, k) => s + w[k] * (parts[k] ?? 0), 0);
    this.parts = parts;
    this.rawScore = raw;

    const dt = this.lastT == null ? 0 : Math.max(0, t - this.lastT);
    this.lastT = t;
    const alpha = 1 - Math.exp(-dt / c.scoreSmoothingMs);
    this.score += alpha * (raw - this.score);
    if (t - this.lastCriticalT <= c.criticalHoldMs) this.score = Math.max(this.score, c.criticalScore);
    this.levelIndex = levelIndexFor(this.score, this.levelIndex, c);
  }

  snapshot(t, sig, events, eyeClosed) {
    const monitoring = this.phase === 'monitoring';
    const level = this.cfg.levels[this.levelIndex];
    return {
      t,
      phase: this.phase,
      calibrationProgress:
        this.phase === 'calibrating'
          ? clamp01((t - this.calibStart) / this.cfg.calibrationMs)
          : monitoring
            ? 1
            : 0,
      faceDetected: !!sig.faceDetected,
      eyeClosed,
      eyesVisible: sig.eyesVisible ?? null,
      ear: sig.ear ?? null,
      mar: sig.mar ?? null,
      pitch: sig.pitch ?? null,
      yaw: sig.yaw ?? null,
      perclos: monitoring ? this.perclos() : null,
      blinkRate: monitoring ? this.blinkRate(t) : null,
      avgBlinkMs: monitoring ? this.avgBlinkMs() : null,
      totals: { ...this.totals },
      recent: this.recentCounts(),
      score: Math.round(this.score),
      rawScore: this.rawScore,
      parts: this.parts,
      level: level.id,
      levelIndex: this.levelIndex,
      events,
      baseline: this.baseline,
      warnings: monitoring ? this.warnings() : [],
    };
  }
}
