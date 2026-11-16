import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FatigueMonitor } from '../../web/js/fatigue.js';
import { CSV_COLUMNS, SessionRecorder } from '../../web/js/session.js';
import { _STRINGS_FOR_TESTS } from '../../web/js/i18n.js';
import { calibrate, openFace, run } from './helpers.mjs';

test('recorder keeps one row per second and only aggregated numbers', () => {
  const m = new FatigueMonitor();
  const rec = new SessionRecorder({ engine: 'test' });
  const cal = calibrate(m);
  for (const s of cal.snaps) rec.add(s, {}); // calibration frames are ignored
  let t = cal.t;
  for (; t < cal.t + 10_000; t += 1000 / 30) {
    const sig = openFace(t, { ear: (t - cal.t) % 4000 < 150 ? 0.1 : 0.3, landmarks: [{ x: 1, y: 1 }], procMs: 12 });
    rec.add(m.update(sig), sig);
  }
  rec.finish();
  assert.ok(rec.rows.length >= 10 && rec.rows.length <= 11, `rows ${rec.rows.length}`);
  const csv = rec.toCSV();
  const [header, ...lines] = csv.trim().split('\n');
  assert.equal(header, CSV_COLUMNS.join(','));
  assert.equal(lines.length, rec.rows.length);
  assert.ok(!csv.includes('landmarks'));
  const blinks = rec.rows.reduce((s, r) => s + r.blinks, 0);
  assert.equal(blinks, 3); // blinks at 0, 4 and 8 s (the first one ends at ~150 ms)
  assert.equal(rec.events.filter((e) => e.type === 'blink').length, 3);
  assert.ok(rec.frames.ear.values.length > 250); // per-frame sample for histograms
  const json = rec.toJSON();
  assert.equal(json.rows.length, rec.rows.length);
  assert.ok(json.config.calibrationMs > 0);
  assert.ok(!JSON.stringify(json).includes('"x":1')); // no landmarks
  const contrib = rec.rows.at(-1);
  const sumC = ['c_perclos', 'c_long_closures', 'c_yawns', 'c_blink_duration', 'c_head']
    .reduce((s, c) => s + contrib[c], 0);
  assert.ok(sumC >= 0 && sumC <= 100);
  const sum = rec.summary();
  assert.equal(sum.totals.blinks, 3);
  assert.equal(sum.durationS, rec.rows.length);
  assert.equal(sum.timeInLevel.ok, rec.rows.length);
});

test('every UI string exists in both languages', () => {
  const es = Object.keys(_STRINGS_FOR_TESTS.es).sort();
  const en = Object.keys(_STRINGS_FOR_TESTS.en).sort();
  assert.deepEqual(es, en);
});

test('run helper sanity', () => {
  const m = new FatigueMonitor();
  const { snaps } = run(m, 0, 100, (t) => openFace(t));
  assert.equal(snaps[0].phase, 'idle');
});
