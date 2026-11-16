/**
 * Datasets for the Data Lab: a live/finished in-memory session, the bundled synthetic
 * example, or a CSV the user opens from their own device (read locally, never uploaded).
 * Pure module (no DOM), tested in Node.
 *
 * Conjuntos de datos para el Laboratorio: sesión en memoria, ejemplo sintético o un CSV
 * que la persona abre desde su dispositivo (se lee localmente, nunca se sube).
 */
import { DEFAULTS } from './config.js';
import { median } from './metrics.js';
import { column, isNum, parseCSV } from './stats.js';

const EVENT_COLUMNS = {
  blinks: 'blink',
  long_closures: 'long_closure',
  critical_closures: 'critical_closure',
  yawns: 'yawn',
  head_deviations: 'head_deviation',
  face_lost: 'face_lost',
};

/** From a SessionRecorder (live or finished). */
export function datasetFromRecorder(rec, { id, name, live = false } = {}) {
  const ear = rec.baseline?.ear;
  return {
    id,
    kind: live ? 'live' : 'session',
    name,
    engine: rec.engine,
    startedAt: rec.startedAt,
    rows: rec.rows,
    events: rec.events,
    earFrames: rec.frames?.ear.values ?? null,
    earThreshold: isNum(ear) ? ear * DEFAULTS.eyeClosedRatio : null,
    thresholdEstimated: false,
  };
}

/** Rebuild an event log from the per-second counts of a CSV. */
export function eventsFromRows(rows) {
  const events = [];
  for (const r of rows) {
    for (const [col, type] of Object.entries(EVENT_COLUMNS)) {
      const n = Number(r[col]) || 0;
      for (let i = 0; i < n; i++) events.push({ t_s: Number(r.t_s), type, dur_ms: null });
    }
  }
  return events;
}

/** From CSV text. Throws Error('not_vigia_csv') if the key columns are missing. */
export function datasetFromCSV(text, { name, kind = 'file' } = {}) {
  const { columns, rows } = parseCSV(text);
  if (!columns.includes('t_s') || !columns.includes('score')) throw new Error('not_vigia_csv');
  // Personal baseline is not in the CSV: estimate it from the first 10 s like the app does.
  const early = column(rows.slice(0, 10), 'ear_mean');
  const base = median(early);
  return {
    id: kind,
    kind,
    name,
    engine: rows[0]?.engine || 'unknown',
    startedAt: null,
    rows,
    events: eventsFromRows(rows),
    earFrames: null,
    earThreshold: isNum(base) ? base * DEFAULTS.eyeClosedRatio : null,
    thresholdEstimated: true,
  };
}
