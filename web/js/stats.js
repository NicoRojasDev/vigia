/**
 * Small statistics toolkit for the in-browser Data Lab (pure, no DOM, tested in Node).
 * Pequeño kit de estadística para el Laboratorio de datos (puro, sin DOM, testeado en Node).
 *
 * Quantiles use linear interpolation, like NumPy's default, so numbers match the
 * Python notebooks. / Los cuantiles usan interpolación lineal, como NumPy por defecto.
 */

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** '' / null / 'NaN' → null; numeric strings → numbers. */
export function toNumber(v) {
  if (isNum(v)) return v;
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function column(rows, key) {
  return rows.map((r) => toNumber(r[key]));
}

export function quantile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Descriptive statistics, ignoring missing values (sample std, ddof = 1). */
export function describe(values) {
  const v = values.filter(isNum).sort((a, b) => a - b);
  const n = v.length;
  const missing = values.length - n;
  if (!n) return { n, missing, mean: null, std: null, min: null, q1: null, median: null, q3: null, max: null };
  const m = v.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? v.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1) : 0;
  return {
    n,
    missing,
    mean: m,
    std: Math.sqrt(variance),
    min: v[0],
    q1: quantile(v, 0.25),
    median: quantile(v, 0.5),
    q3: quantile(v, 0.75),
    max: v[n - 1],
  };
}

/** Pearson correlation on pairwise-complete observations (null if undefined). */
export function pearson(x, y) {
  const pairs = [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (isNum(x[i]) && isNum(y[i])) pairs.push([x[i], y[i]]);
  }
  const n = pairs.length;
  if (n < 3) return null;
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
  const my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [a, b] of pairs) {
    sxy += (a - mx) * (b - my);
    sxx += (a - mx) ** 2;
    syy += (b - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** Correlation matrix for the given columns. */
export function correlationMatrix(rows, keys) {
  const cols = keys.map((k) => column(rows, k));
  return keys.map((_, i) => keys.map((__, j) => (i === j ? 1 : pearson(cols[i], cols[j]))));
}

/** Histogram with equal-width bins. Returns {edges (bins+1), counts (bins)}. */
export function histogram(values, { bins = 30, min = null, max = null } = {}) {
  const v = values.filter(isNum);
  if (!v.length) return { edges: [], counts: [] };
  const lo = min ?? Math.min(...v);
  let hi = max ?? Math.max(...v);
  if (hi === lo) hi = lo + 1;
  const width = (hi - lo) / bins;
  const counts = new Array(bins).fill(0);
  for (const x of v) {
    if (x < lo || x > hi) continue;
    const i = Math.min(bins - 1, Math.floor((x - lo) / width));
    counts[i] += 1;
  }
  const edges = Array.from({ length: bins + 1 }, (_, i) => lo + i * width);
  return { edges, counts };
}

/** Ordinary least squares y = a + b·x. Returns {slope, intercept, r2, n}. */
export function linearTrend(x, y) {
  const pts = [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (isNum(x[i]) && isNum(y[i])) pts.push([x[i], y[i]]);
  }
  const n = pts.length;
  if (n < 3) return { slope: null, intercept: null, r2: null, n };
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [a, b] of pts) {
    sxy += (a - mx) * (b - my);
    sxx += (a - mx) ** 2;
    syy += (b - my) ** 2;
  }
  if (sxx === 0) return { slope: null, intercept: null, r2: null, n };
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept, r2, n };
}

/**
 * Minimal CSV parser (RFC 4180 quotes, comma separator). Numeric-looking cells
 * become numbers; empty cells stay ''. Returns {columns, rows}.
 */
export function parseCSV(text) {
  const records = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      records.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    records.push(row);
  }
  const nonEmpty = records.filter((r) => r.some((c) => c !== ''));
  if (!nonEmpty.length) return { columns: [], rows: [] };
  const [header, ...body] = nonEmpty;
  const columns = header.map((h) => h.trim());
  const rows = body.map((r) =>
    Object.fromEntries(
      columns.map((c, i) => {
        const raw = (r[i] ?? '').trim();
        const n = raw === '' ? '' : Number(raw);
        return [c, raw !== '' && Number.isFinite(n) ? n : raw];
      }),
    ),
  );
  return { columns, rows };
}
