import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  correlationMatrix,
  describe,
  histogram,
  linearTrend,
  parseCSV,
  pearson,
  quantile,
  toNumber,
} from '../../web/js/stats.js';
import { datasetFromCSV, eventsFromRows } from '../../web/js/dataset.js';
import { analyse, buildReport } from '../../web/js/report.js';
import { CSV_COLUMNS } from '../../web/js/session.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('describe matches NumPy conventions (linear quantiles, ddof = 1)', () => {
  const d = describe([1, 2, 3, 4, null, '']);
  assert.equal(d.n, 4);
  assert.equal(d.missing, 2);
  close(d.mean, 2.5);
  close(d.std, Math.sqrt(5 / 3)); // np.std([1,2,3,4], ddof=1)
  close(d.q1, 1.75); // np.percentile([1,2,3,4], 25)
  close(d.median, 2.5);
  close(d.q3, 3.25);
  assert.equal(quantile([], 0.5), null);
  assert.equal(toNumber(''), null);
  assert.equal(toNumber('0.5'), 0.5);
});

test('pearson, trend and correlation matrix', () => {
  close(pearson([1, 2, 3, 4], [2, 4, 6, 8]), 1);
  close(pearson([1, 2, 3, 4], [8, 6, 4, 2]), -1);
  assert.equal(pearson([1, 1, 1], [1, 2, 3]), null);
  const tr = linearTrend([0, 1, 2, 3], [1, 3, 5, 7]);
  close(tr.slope, 2);
  close(tr.intercept, 1);
  close(tr.r2, 1);
  const m = correlationMatrix([{ a: 1, b: 2 }, { a: 2, b: 4 }, { a: 3, b: 7 }], ['a', 'b']);
  assert.equal(m[0][0], 1);
  assert.ok(m[0][1] > 0.98);
});

test('histogram counts every value once', () => {
  const h = histogram([0, 0.1, 0.5, 0.9, 1], { bins: 2, min: 0, max: 1 });
  assert.deepEqual(h.counts, [2, 3]);
  assert.equal(h.edges.length, 3);
});

test('CSV parser handles quotes, empty cells and CRLF', () => {
  const { columns, rows } = parseCSV('a,b,c\r\n1,"x, y",\r\n2,"say ""hi""",3\r\n');
  assert.deepEqual(columns, ['a', 'b', 'c']);
  assert.equal(rows[0].a, 1);
  assert.equal(rows[0].b, 'x, y');
  assert.equal(rows[0].c, '');
  assert.equal(rows[1].b, 'say "hi"');
});

test('the bundled synthetic sample loads as a dataset and gets a report', () => {
  const text = readFileSync(new URL('../../web/data/sample_session.csv', import.meta.url), 'utf8');
  const ds = datasetFromCSV(text, { name: 'sample', kind: 'sample' });
  assert.equal(ds.rows.length, 1801);
  assert.deepEqual(Object.keys(ds.rows[0]), CSV_COLUMNS);
  assert.ok(ds.earThreshold > 0.15 && ds.earThreshold < 0.25);
  assert.ok(ds.events.some((e) => e.type === 'critical_closure'));

  const a = analyse(ds.rows);
  assert.ok(a.trend.slope > 0, 'fatigue grows in the synthetic drive');
  assert.ok(a.thirds.find((x) => x.key === 'score').change > 20);
  assert.ok(a.correlations.slice(0, 3).some((c) => c.key === 'perclos_60s'));

  for (const lang of ['es', 'en']) {
    const md = buildReport({ rows: ds.rows, engine: ds.engine, name: 'sample' }, lang);
    assert.match(md, /^# /);
    assert.match(md, lang === 'es' ? /Datos sintéticos/ : /Synthetic data/);
    assert.match(md, /\| .+ \| .+ \| .+ \| .+ \|/); // thirds table
  }
});

test('foreign CSV files are rejected', () => {
  assert.throws(() => datasetFromCSV('a,b\n1,2\n'), /not_vigia_csv/);
  assert.deepEqual(eventsFromRows([{ t_s: 3, yawns: 2 }]).map((e) => e.type), ['yawn', 'yawn']);
});

test('an empty dataset still produces a report', () => {
  assert.match(buildReport({ rows: [] }, 'en'), /No data/);
});
