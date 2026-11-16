/**
 * SessionRecorder — keeps a per-second summary of the session IN MEMORY ONLY.
 * SessionRecorder — guarda un resumen por segundo de la sesión SOLO EN MEMORIA.
 *
 * Privacy by design / Privacidad desde el diseño:
 *  - No images, no video, no face landmarks are stored. Only aggregated numbers.
 *  - No se guardan imágenes, video ni puntos de la cara. Solo números agregados.
 *  - Nothing is uploaded and nothing is written to browser storage: everything is
 *    gone when the page is refreshed or closed. The user may download a CSV/JSON.
 *  - Nada se sube ni se escribe en el almacenamiento del navegador: todo se borra al
 *    refrescar o cerrar la página. La persona puede descargar un CSV/JSON.
 *
 * Pure module (no DOM) so Node scripts can reuse it (scripts/simulate_session.mjs).
 */
import { APP_VERSION, DEFAULTS } from './config.js';
import { mean } from './metrics.js';

export const CSV_COLUMNS = [
  't_s',
  'engine',
  'fps',
  'proc_ms',
  'face_ratio',
  'ear_mean',
  'mar_max',
  'eye_closed_ratio',
  'blink_score_mean',
  'jaw_open_max',
  'pitch_mean',
  'yaw_mean',
  'perclos_60s',
  'blink_rate_min',
  'avg_blink_ms',
  'blinks',
  'long_closures',
  'yawns',
  'head_deviations',
  'face_lost',
  'critical_closures',
  'c_perclos',
  'c_long_closures',
  'c_yawns',
  'c_blink_duration',
  'c_head',
  'score',
  'level',
];

/** Score components → CSV column with its contribution in score points. */
export const CONTRIBUTION_COLUMNS = {
  perclos: 'c_perclos',
  longClosures: 'c_long_closures',
  yawns: 'c_yawns',
  blinkDuration: 'c_blink_duration',
  head: 'c_head',
};

const EVENT_COLUMN = {
  blink: 'blinks',
  long_closure: 'long_closures',
  yawn: 'yawns',
  head_deviation: 'head_deviations',
  face_lost: 'face_lost',
  critical_closure: 'critical_closures',
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const fmt = (v, digits) => (isNum(v) ? Number(v.toFixed(digits)) : '');
const maxOf = (arr) => {
  const v = arr.filter(isNum);
  return v.length ? Math.max(...v) : null;
};

/** Keeps a bounded, evenly spaced sample of a per-frame signal (for histograms). */
class FrameSampler {
  constructor(cap = 36_000) {
    this.cap = cap;
    this.stride = 1;
    this.count = 0;
    this.values = [];
  }

  push(v) {
    if (!isNum(v)) return;
    if (this.count++ % this.stride !== 0) return;
    this.values.push(v);
    if (this.values.length >= this.cap) {
      this.values = this.values.filter((_, i) => i % 2 === 0);
      this.stride *= 2;
    }
  }
}

export class SessionRecorder {
  constructor({ engine = 'unknown', weights = DEFAULTS.scoreWeights, startedAt = null } = {}) {
    this.engine = engine;
    this.weights = weights;
    this.startedAt = startedAt; // wall-clock Date (only kept in memory)
    this.rows = [];
    this.events = []; // {t_s, type, dur_ms}
    this.frames = { ear: new FrameSampler(), mar: new FrameSampler() };
    this.baseline = null;
    this.bucket = null;
    this.startT = null;
  }

  /** Add one frame (snapshot from FatigueMonitor + raw signal from the engine). */
  add(snap, sig) {
    if (snap.phase !== 'monitoring') return;
    if (this.startT == null) {
      this.startT = snap.t;
      this.baseline = snap.baseline;
    }
    const sec = Math.floor((snap.t - this.startT) / 1000);
    if (!this.bucket || this.bucket.sec !== sec) {
      this.flush();
      this.bucket = {
        sec,
        frames: 0,
        faceFrames: 0,
        proc: [],
        ear: [],
        mar: [],
        closed: [],
        blinkScore: [],
        jawOpen: [],
        pitch: [],
        yaw: [],
        counts: Object.fromEntries(Object.values(EVENT_COLUMN).map((k) => [k, 0])),
        last: null,
      };
    }
    const b = this.bucket;
    b.frames += 1;
    if (sig.faceDetected) b.faceFrames += 1;
    b.proc.push(sig.procMs);
    b.ear.push(sig.ear);
    b.mar.push(sig.mar);
    if (snap.eyeClosed != null) b.closed.push(snap.eyeClosed ? 1 : 0);
    b.blinkScore.push(sig.blinkScore);
    b.jawOpen.push(sig.jawOpen);
    b.pitch.push(sig.pitch);
    b.yaw.push(sig.yaw);
    this.frames.ear.push(sig.ear);
    this.frames.mar.push(sig.mar);
    for (const e of snap.events) {
      const col = EVENT_COLUMN[e.type];
      if (!col) continue;
      b.counts[col] += 1;
      this.events.push({
        t_s: Number(((e.t - this.startT) / 1000).toFixed(2)),
        type: e.type,
        dur_ms: isNum(e.dur) ? Math.round(e.dur) : null,
      });
    }
    b.last = snap;
  }

  flush() {
    const b = this.bucket;
    if (!b || b.frames === 0) return;
    const s = b.last;
    const contributions = {};
    for (const [part, col] of Object.entries(CONTRIBUTION_COLUMNS)) {
      const p = s.parts?.[part];
      contributions[col] = isNum(p) ? fmt(100 * (this.weights[part] ?? 0) * p, 2) : '';
    }
    this.rows.push({
      t_s: b.sec,
      engine: this.engine,
      fps: b.frames,
      proc_ms: fmt(mean(b.proc), 1),
      face_ratio: fmt(b.faceFrames / b.frames, 3),
      ear_mean: fmt(mean(b.ear), 4),
      mar_max: fmt(maxOf(b.mar), 4),
      eye_closed_ratio: fmt(mean(b.closed), 3),
      blink_score_mean: fmt(mean(b.blinkScore), 4),
      jaw_open_max: fmt(maxOf(b.jawOpen), 4),
      pitch_mean: fmt(mean(b.pitch), 2),
      yaw_mean: fmt(mean(b.yaw), 2),
      perclos_60s: fmt(s.perclos, 4),
      blink_rate_min: fmt(s.blinkRate, 2),
      avg_blink_ms: fmt(s.avgBlinkMs, 1),
      ...b.counts,
      ...contributions,
      score: s.score,
      level: s.level,
    });
    this.bucket = null;
  }

  finish() {
    this.flush();
  }

  toCSV() {
    const esc = (v) => {
      const str = String(v ?? '');
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const lines = [CSV_COLUMNS.join(',')];
    for (const r of this.rows) lines.push(CSV_COLUMNS.map((c) => esc(r[c])).join(','));
    return lines.join('\n') + '\n';
  }

  /** Full, reproducible export: data + events + baseline + the parameters used. */
  toJSON() {
    return {
      app: 'vigia',
      version: APP_VERSION,
      engine: this.engine,
      startedAt: this.startedAt ? new Date(this.startedAt).toISOString() : null,
      config: DEFAULTS,
      baseline: this.baseline,
      summary: this.summary(),
      columns: CSV_COLUMNS,
      rows: this.rows,
      events: this.events,
    };
  }

  /** Approximate size of what is held in memory (bytes), shown to the user. */
  memoryBytes() {
    return (
      this.rows.length * CSV_COLUMNS.length * 8 +
      this.events.length * 24 +
      (this.frames.ear.values.length + this.frames.mar.values.length) * 8
    );
  }

  /** Session summary for the end-of-trip screen. */
  summary(levelIds = DEFAULTS.levels.map((l) => l.id)) {
    const rows = this.rows;
    const timeInLevel = Object.fromEntries(levelIds.map((id) => [id, 0]));
    const totals = Object.fromEntries(Object.values(EVENT_COLUMN).map((k) => [k, 0]));
    for (const r of rows) {
      if (r.level in timeInLevel) timeInLevel[r.level] += 1;
      for (const k of Object.keys(totals)) totals[k] += r[k] || 0;
    }
    const scores = rows.map((r) => r.score);
    return {
      durationS: rows.length,
      avgScore: scores.length ? Math.round(mean(scores)) : 0,
      maxScore: scores.length ? Math.max(...scores) : 0,
      maxPerclos: maxOf(rows.map((r) => (r.perclos_60s === '' ? null : r.perclos_60s))),
      timeInLevel,
      totals,
    };
  }
}
