/**
 * Tiny canvas chart helpers for the Data Lab (no chart library, no network).
 * Ayudas mínimas de gráficos en canvas para el Laboratorio de datos.
 *
 * Design rules (validated palette, dark surface #121b2e):
 *  - one y-axis per chart (never dual axes), thin 2 px lines, recessive grid;
 *  - categorical colours in fixed order; status colours only for fatigue levels;
 *  - every chart has a hover tooltip; text uses text colours, never series colours.
 */

export const COLORS = {
  surface: '#0a1020',
  grid: 'rgba(255,255,255,0.07)',
  axis: 'rgba(255,255,255,0.18)',
  text: '#e6ebf5',
  muted: '#9aa6bf',
  series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'],
  levels: { ok: '#0ca30c', mild: '#fab219', moderate: '#ec835a', high: '#d03b3b' },
  divNeg: [57, 135, 229], // blue pole
  divMid: [56, 56, 53], // neutral grey midpoint
  divPos: [230, 103, 103], // red pole
};

const FONT = '11px system-ui, -apple-system, "Segoe UI", sans-serif';
let tipEl = null;

function tip() {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'chart-tip';
    tipEl.setAttribute('role', 'tooltip');
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

function showTip(evt, lines) {
  const el = tip();
  el.replaceChildren(
    ...lines.map(([label, value, color]) => {
      const row = document.createElement('div');
      if (color) {
        const sw = document.createElement('span');
        sw.className = 'chart-tip-swatch';
        sw.style.background = color;
        row.appendChild(sw);
      }
      const l = document.createElement('span');
      l.textContent = value == null ? label : `${label}: `;
      row.appendChild(l);
      if (value != null) {
        const v = document.createElement('strong');
        v.textContent = value;
        row.appendChild(v);
      }
      return row;
    }),
  );
  el.hidden = false;
  const pad = 14;
  const { innerWidth: vw } = window;
  const rect = el.getBoundingClientRect();
  let x = evt.clientX + pad;
  if (x + rect.width > vw - 8) x = evt.clientX - rect.width - pad;
  el.style.left = `${Math.max(8, x)}px`;
  el.style.top = `${evt.clientY + pad}px`;
}

function hideTip() {
  if (tipEl) tipEl.hidden = true;
}

/** Size the canvas to its CSS width × height at device pixel ratio. */
function setup(canvas, height) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || canvas.parentElement?.clientWidth || 320;
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = FONT;
  return { ctx, W, H: height };
}

function attach(canvas, onMove) {
  canvas._onMove = onMove;
  if (canvas._hoverReady) return;
  canvas._hoverReady = true;
  const move = (e) => {
    const r = canvas.getBoundingClientRect();
    canvas._onMove?.(e, e.clientX - r.left, e.clientY - r.top);
  };
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerdown', move);
  canvas.addEventListener('pointerleave', () => {
    hideTip();
    canvas._redraw?.(null);
  });
}

function niceTicks(min, max, count = 4) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? step0;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

/** Ticks on round clock values (10 s … 1 h) for time axes. */
function timeTicks(min, max, count) {
  const steps = [10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
  const step = steps.find((st) => (max - min) / st <= count) ?? 3600;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(v);
  return ticks;
}

const defaultFmt = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(2));
export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function frame(ctx, W, H, pad, yMin, yMax, yFmt, xMin, xMax, xFmt) {
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;
  const X = (v) => pad.l + ((v - xMin) / (xMax - xMin || 1)) * pw;
  const Y = (v) => pad.t + ph * (1 - (v - yMin) / (yMax - yMin || 1));
  ctx.fillStyle = COLORS.muted;
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.textAlign = 'right';
  for (const v of niceTicks(yMin, yMax)) {
    ctx.beginPath();
    ctx.moveTo(pad.l, Y(v));
    ctx.lineTo(W - pad.r, Y(v));
    ctx.stroke();
    ctx.fillText(yFmt(v), pad.l - 6, Y(v) + 4);
  }
  ctx.textAlign = 'center';
  const maxTicks = Math.max(2, Math.floor(pw / 70));
  const xTicks = xFmt === clock ? timeTicks(xMin, xMax, maxTicks) : niceTicks(xMin, xMax, maxTicks);
  for (const v of xTicks) ctx.fillText(xFmt(v), X(v), H - 6);
  return { X, Y, pw, ph };
}

function noData(canvas, height, text) {
  const { ctx, W, H } = setup(canvas, height);
  ctx.fillStyle = COLORS.muted;
  ctx.textAlign = 'center';
  ctx.fillText(text, W / 2, H / 2);
  canvas._redraw = null;
  canvas._onMove = null;
}

/**
 * Line chart. opts: {x, series:[{name, values, color}], yMin?, yMax?, bands?:[{from,to,color}],
 * refLines?:[{y,label}], height?, xFmt?, yFmt?, emptyText?}
 */
export function lineChart(canvas, opts) {
  const height = opts.height ?? 180;
  const x = opts.x ?? [];
  const allY = opts.series.flatMap((s) => s.values).filter(Number.isFinite);
  if (x.length < 2 || !allY.length) return noData(canvas, height, opts.emptyText ?? '—');
  const yFmt = opts.yFmt ?? defaultFmt;
  const xFmt = opts.xFmt ?? clock;
  let yMin = opts.yMin ?? Math.min(...allY, ...(opts.refLines ?? []).map((r) => r.y));
  let yMax = opts.yMax ?? Math.max(...allY, ...(opts.refLines ?? []).map((r) => r.y));
  if (opts.yMin == null || opts.yMax == null) {
    const padY = (yMax - yMin || 1) * 0.08;
    if (opts.yMin == null) yMin -= padY;
    if (opts.yMax == null) yMax += padY;
  }
  const xMin = x[0];
  const xMax = x[x.length - 1];

  const draw = (hover) => {
    const { ctx, W, H } = setup(canvas, height);
    const pad = { l: 42, r: 12, t: 10, b: 22 };
    for (const b of opts.bands ?? []) {
      const pw = W - pad.l - pad.r;
      const ph = H - pad.t - pad.b;
      const Yb = (v) => pad.t + ph * (1 - (v - yMin) / (yMax - yMin));
      ctx.fillStyle = b.color;
      ctx.globalAlpha = 0.13;
      ctx.fillRect(pad.l, Yb(Math.min(b.to, yMax)), pw, Yb(Math.max(b.from, yMin)) - Yb(Math.min(b.to, yMax)));
      ctx.globalAlpha = 1;
    }
    const { X, Y } = frame(ctx, W, H, pad, yMin, yMax, yFmt, xMin, xMax, xFmt);
    for (const r of opts.refLines ?? []) {
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = COLORS.text;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(pad.l, Y(r.y));
      ctx.lineTo(W - pad.r, Y(r.y));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      if (r.label) {
        ctx.fillStyle = COLORS.text;
        ctx.textAlign = 'left';
        ctx.fillText(r.label, pad.l + 4, Y(r.y) - 4);
      }
    }
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    for (const s of opts.series) {
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      let pen = false;
      s.values.forEach((v, i) => {
        if (!Number.isFinite(v)) {
          pen = false;
          return;
        }
        if (pen) ctx.lineTo(X(x[i]), Y(v));
        else ctx.moveTo(X(x[i]), Y(v));
        pen = true;
      });
      ctx.stroke();
    }
    if (hover != null) {
      ctx.strokeStyle = COLORS.axis;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(x[hover]), pad.t);
      ctx.lineTo(X(x[hover]), H - pad.b);
      ctx.stroke();
      for (const s of opts.series) {
        const v = s.values[hover];
        if (!Number.isFinite(v)) continue;
        ctx.fillStyle = COLORS.surface;
        ctx.beginPath();
        ctx.arc(X(x[hover]), Y(v), 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(X(x[hover]), Y(v), 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return { X, pad, W };
  };
  const geo = draw(null);
  canvas._redraw = draw;
  attach(canvas, (e, px) => {
    const pw = geo.W - geo.pad.l - geo.pad.r;
    const xv = xMin + ((px - geo.pad.l) / pw) * (xMax - xMin);
    let idx = 0;
    let best = Infinity;
    for (let i = 0; i < x.length; i++) {
      const d = Math.abs(x[i] - xv);
      if (d < best) {
        best = d;
        idx = i;
      }
    }
    draw(idx);
    showTip(e, [
      [xFmt(x[idx]), null],
      ...opts.series.map((s) => [s.name, Number.isFinite(s.values[idx]) ? yFmt(s.values[idx]) : '—', s.color]),
    ]);
  });
}

/** Stacked area: opts {x, series:[{name, values, color}], yMax?, height?, total?:{name, values}} */
export function stackedArea(canvas, opts) {
  const height = opts.height ?? 200;
  const x = opts.x ?? [];
  if (x.length < 2) return noData(canvas, height, opts.emptyText ?? '—');
  const n = x.length;
  const cum = opts.series.map(() => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    let acc = 0;
    opts.series.forEach((s, k) => {
      acc += Number.isFinite(s.values[i]) ? s.values[i] : 0;
      cum[k][i] = acc;
    });
  }
  const yMax = opts.yMax ?? Math.max(10, ...cum[cum.length - 1]) * 1.05;
  const xFmt = opts.xFmt ?? clock;
  const xMin = x[0];
  const xMax = x[n - 1];
  const draw = (hover) => {
    const { ctx, W, H } = setup(canvas, height);
    const pad = { l: 42, r: 12, t: 10, b: 22 };
    const { X, Y } = frame(ctx, W, H, pad, 0, yMax, (v) => v.toFixed(0), xMin, xMax, xFmt);
    for (let k = opts.series.length - 1; k >= 0; k--) {
      ctx.fillStyle = opts.series[k].color;
      ctx.beginPath();
      ctx.moveTo(X(x[0]), Y(0));
      for (let i = 0; i < n; i++) ctx.lineTo(X(x[i]), Y(cum[k][i]));
      ctx.lineTo(X(x[n - 1]), Y(0));
      ctx.closePath();
      ctx.fill();
      // surface-coloured seam between layers
      ctx.strokeStyle = COLORS.surface;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < n; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(x[i]), Y(cum[k][i]));
      ctx.stroke();
    }
    if (hover != null) {
      ctx.strokeStyle = COLORS.text;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(x[hover]), pad.t);
      ctx.lineTo(X(x[hover]), H - pad.b);
      ctx.stroke();
    }
    return { pad, W };
  };
  const geo = draw(null);
  canvas._redraw = draw;
  attach(canvas, (e, px) => {
    const pw = geo.W - geo.pad.l - geo.pad.r;
    const idx = Math.max(0, Math.min(n - 1, Math.round(((px - geo.pad.l) / pw) * (n - 1))));
    draw(idx);
    showTip(e, [
      [xFmt(x[idx]), null],
      ...opts.series.map((s) => [s.name, Number.isFinite(s.values[idx]) ? s.values[idx].toFixed(1) : '0', s.color]),
      ...(opts.total ? [[opts.total.name, Number.isFinite(opts.total.values[idx]) ? String(opts.total.values[idx]) : '—']] : []),
    ]);
  });
}

/** Histogram: opts {edges, counts, color?, refLine?:{x,label}, height?, xFmt?, countLabel?} */
export function histogramChart(canvas, opts) {
  const height = opts.height ?? 170;
  const { edges, counts } = opts;
  if (!counts?.length || !counts.some((c) => c > 0)) return noData(canvas, height, opts.emptyText ?? '—');
  const xFmt = opts.xFmt ?? defaultFmt;
  const yMax = Math.max(...counts) * 1.1;
  const xMin = edges[0];
  const xMax = edges[edges.length - 1];
  const draw = (hover) => {
    const { ctx, W, H } = setup(canvas, height);
    const pad = { l: 42, r: 12, t: 10, b: 22 };
    const { X, Y } = frame(ctx, W, H, pad, 0, yMax, (v) => v.toFixed(0), xMin, xMax, xFmt);
    counts.forEach((c, i) => {
      const x0 = X(edges[i]) + 1;
      const x1 = X(edges[i + 1]) - 1;
      ctx.fillStyle = opts.color ?? COLORS.series[0];
      ctx.globalAlpha = hover == null || hover === i ? 1 : 0.55;
      ctx.fillRect(x0, Y(c), Math.max(1, x1 - x0), Y(0) - Y(c));
    });
    ctx.globalAlpha = 1;
    if (opts.refLine && Number.isFinite(opts.refLine.x)) {
      const rx = X(opts.refLine.x);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = COLORS.text;
      ctx.beginPath();
      ctx.moveTo(rx, pad.t);
      ctx.lineTo(rx, H - pad.b);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = rx > W - 120 ? 'right' : 'left';
      ctx.fillText(opts.refLine.label ?? '', rx + (rx > W - 120 ? -4 : 4), pad.t + 10);
    }
    return { X, pad, W };
  };
  const geo = draw(null);
  canvas._redraw = draw;
  attach(canvas, (e, px) => {
    const i = edges.findIndex((edge, k) => k < counts.length && px >= geo.X(edge) && px < geo.X(edges[k + 1]));
    if (i < 0) return;
    draw(i);
    showTip(e, [[`${xFmt(edges[i])} – ${xFmt(edges[i + 1])}`, null], [opts.countLabel ?? 'n', String(counts[i])]]);
  });
}

function divergingColor(r) {
  const t = Math.max(-1, Math.min(1, r ?? 0));
  const pole = t < 0 ? COLORS.divNeg : COLORS.divPos;
  const a = Math.abs(t);
  const c = COLORS.divMid.map((m, i) => Math.round(m + (pole[i] - m) * a));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Correlation heatmap (diverging blue ↔ grey ↔ red). opts {labels, matrix} */
export function heatmap(canvas, opts) {
  const k = opts.labels.length;
  const W0 = canvas.clientWidth || canvas.parentElement?.clientWidth || 320;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = FONT;
  const left = Math.min(160, Math.max(...opts.labels.map((l) => measure.measureText(l).width)) + 12);
  const size = Math.max(14, Math.min(40, (W0 - left - 8) / k));
  const height = size * k + 20;
  const draw = (hover) => {
    const { ctx } = setup(canvas, height);
    ctx.textBaseline = 'middle';
    opts.labels.forEach((lab, i) => {
      ctx.fillStyle = COLORS.muted;
      ctx.font = FONT;
      ctx.textAlign = 'right';
      ctx.fillText(lab, left - 8, 10 + i * size + size / 2);
      opts.labels.forEach((_, j) => {
        const r = opts.matrix[i][j];
        ctx.fillStyle = r == null ? COLORS.grid : divergingColor(r);
        ctx.fillRect(left + j * size + 1, 10 + i * size + 1, size - 2, size - 2);
        if (hover && hover[0] === i && hover[1] === j) {
          ctx.strokeStyle = COLORS.text;
          ctx.lineWidth = 2;
          ctx.strokeRect(left + j * size + 1, 10 + i * size + 1, size - 2, size - 2);
        }
        if (size >= 24 && r != null) {
          ctx.fillStyle = COLORS.text;
          ctx.font = '10px system-ui, -apple-system, "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(r.toFixed(2).replace(/^(-?)0\./, '$1.'), left + j * size + size / 2, 10 + i * size + size / 2);
        }
      });
    });
    ctx.textBaseline = 'alphabetic';
  };
  draw(null);
  canvas._redraw = draw;
  attach(canvas, (e, px, py) => {
    const j = Math.floor((px - left) / size);
    const i = Math.floor((py - 10) / size);
    if (i < 0 || j < 0 || i >= k || j >= k) {
      hideTip();
      draw(null);
      return;
    }
    draw([i, j]);
    const r = opts.matrix[i][j];
    showTip(e, [[`${opts.labels[i]} × ${opts.labels[j]}`, null], ['r', r == null ? '—' : r.toFixed(3)]]);
  });
}

/** Scatter with optional OLS line. opts {x, y, xLabel, yLabel, color?, trend?:{slope, intercept}} */
export function scatter(canvas, opts) {
  const height = opts.height ?? 200;
  const pts = [];
  for (let i = 0; i < opts.x.length; i++) {
    if (Number.isFinite(opts.x[i]) && Number.isFinite(opts.y[i])) pts.push([opts.x[i], opts.y[i], i]);
  }
  if (pts.length < 3) return noData(canvas, height, opts.emptyText ?? '—');
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  let xMin = Math.min(...xs);
  let xMax = Math.max(...xs);
  let yMin = opts.yMin ?? Math.min(...ys);
  let yMax = opts.yMax ?? Math.max(...ys);
  const px = (xMax - xMin || 1) * 0.05;
  xMin -= px;
  xMax += px;
  if (opts.yMin == null) yMin -= (yMax - yMin || 1) * 0.05;
  if (opts.yMax == null) yMax += (yMax - yMin || 1) * 0.05;
  const xFmt = opts.xFmt ?? defaultFmt;
  const draw = (hover) => {
    const { ctx, W, H } = setup(canvas, height);
    const pad = { l: 42, r: 12, t: 10, b: 22 };
    const { X, Y } = frame(ctx, W, H, pad, yMin, yMax, opts.yFmt ?? defaultFmt, xMin, xMax, xFmt);
    ctx.fillStyle = opts.color ?? COLORS.series[0];
    ctx.globalAlpha = 0.45;
    for (const [a, b] of pts) {
      ctx.beginPath();
      ctx.arc(X(a), Y(b), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (opts.trend?.slope != null) {
      ctx.strokeStyle = COLORS.text;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(X(xMin), Y(opts.trend.intercept + opts.trend.slope * xMin));
      ctx.lineTo(X(xMax), Y(opts.trend.intercept + opts.trend.slope * xMax));
      ctx.stroke();
    }
    if (hover) {
      ctx.fillStyle = COLORS.surface;
      ctx.beginPath();
      ctx.arc(X(hover[0]), Y(hover[1]), 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = opts.color ?? COLORS.series[0];
      ctx.beginPath();
      ctx.arc(X(hover[0]), Y(hover[1]), 5, 0, Math.PI * 2);
      ctx.fill();
    }
    return { X, Y };
  };
  const geo = draw(null);
  canvas._redraw = draw;
  attach(canvas, (e, mx, my) => {
    let best = null;
    let bd = 400; // 20 px radius
    for (const p of pts) {
      const d = (geo.X(p[0]) - mx) ** 2 + (geo.Y(p[1]) - my) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (!best) {
      hideTip();
      draw(null);
      return;
    }
    draw(best);
    showTip(e, [
      [opts.xLabel, xFmt(best[0])],
      [opts.yLabel, defaultFmt(best[1])],
    ]);
  });
}
