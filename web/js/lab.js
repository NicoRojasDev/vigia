/**
 * Data Lab view: the data-science perspective on a session, computed in the browser.
 * Laboratorio de datos: la mirada de ciencia de datos sobre una sesión, calculada en el navegador.
 */
import { DEFAULTS } from './config.js';
import { CONTRIBUTION_COLUMNS, CSV_COLUMNS } from './session.js';
import { column, correlationMatrix, describe, histogram, isNum, linearTrend, pearson } from './stats.js';
import { buildReport, fmtClock } from './report.js';
import { clock, COLORS, heatmap, histogramChart, lineChart, scatter, stackedArea } from './charts.js';

const VARS = [
  'score',
  'perclos_60s',
  'ear_mean',
  'eye_closed_ratio',
  'blink_rate_min',
  'avg_blink_ms',
  'mar_max',
  'pitch_mean',
  'yaw_mean',
  'face_ratio',
  'fps',
  'proc_ms',
  'blink_score_mean',
  'jaw_open_max',
];
const CORR_VARS = ['score', 'perclos_60s', 'ear_mean', 'eye_closed_ratio', 'blink_rate_min', 'avg_blink_ms', 'mar_max', 'pitch_mean'];

const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of [].concat(children)) node.append(c);
  return node;
};

function table(target, header, rows) {
  target.replaceChildren(
    el('thead', {}, el('tr', {}, header.map((h) => el('th', { textContent: h, scope: 'col' })))),
    el(
      'tbody',
      {},
      rows.map((r) => el('tr', {}, r.map((c, i) => el(i === 0 ? 'th' : 'td', { textContent: c, ...(i === 0 ? { scope: 'row' } : {}) })))),
    ),
  );
}

/** Very small, safe Markdown → DOM renderer for the generated report (no innerHTML). */
function renderMarkdown(target, md) {
  const inline = (text) => {
    const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter(Boolean);
    return parts.map((p) =>
      p.startsWith('**') ? el('strong', { textContent: p.slice(2, -2) }) : p.startsWith('_') && p.endsWith('_') ? el('em', { textContent: p.slice(1, -1) }) : document.createTextNode(p),
    );
  };
  const nodes = [];
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('# ')) nodes.push(el('h4', {}, inline(line.slice(2))));
    else if (line.startsWith('## ')) nodes.push(el('h5', {}, inline(line.slice(3))));
    else if (line.startsWith('> ')) nodes.push(el('blockquote', {}, inline(line.slice(2))));
    else if (line.startsWith('- ')) {
      const items = [];
      while (i < lines.length && lines[i].startsWith('- ')) items.push(el('li', {}, inline(lines[i++].slice(2))));
      i--;
      nodes.push(el('ul', {}, items));
    } else if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      i--;
      const cells = rows.filter((r) => !/^\|[-:| ]+\|$/.test(r)).map((r) => r.slice(1, -1).split('|').map((c) => c.trim()));
      const t = el('table');
      table(t, cells[0], cells.slice(1));
      nodes.push(el('div', { className: 'table-wrap' }, t));
    } else if (line === '---' || line.trim() === '') continue;
    else nodes.push(el('p', {}, inline(line)));
  }
  target.replaceChildren(...nodes);
}

export function createLab(els, { t, getLang, exporters }) {
  let ds = null;
  let selectedVar = 'perclos_60s';
  let report = '';

  const nf = (v, d = 2) => {
    if (!isNum(v)) return t('metric.na');
    const s = Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(d);
    return getLang() === 'es' ? s.replace('.', ',') : s;
  };

  function renderKpis(rows) {
    const fps = describe(column(rows, 'fps')).mean;
    const proc = describe(column(rows, 'proc_ms')).mean;
    const face = describe(column(rows, 'face_ratio')).mean;
    const ear = column(rows, 'ear_mean');
    const missing = rows.length ? ear.filter((v) => !isNum(v)).length / rows.length : null;
    const last = Number(rows.at(-1)?.t_s);
    const tiles = [
      ['kpi.rows', String(rows.length)],
      ['kpi.duration', fmtClock(isNum(last) ? last + 1 : rows.length)],
      ['kpi.fps', nf(fps, 1)],
      ['kpi.proc', isNum(proc) ? `${nf(proc, 1)} ms` : t('metric.na')],
      ['kpi.face', isNum(face) ? `${nf(face * 100, 0)} %` : t('metric.na')],
      ['kpi.missing', isNum(missing) ? `${nf(missing * 100, 0)} %` : t('metric.na')],
    ];
    els.kpis.replaceChildren(
      ...tiles.map(([k, v]) => el('div', { className: 'kpi' }, [el('span', { textContent: t(k) }), el('strong', { textContent: v })])),
    );
  }

  function renderCharts(rows) {
    const x = column(rows, 't_s');
    const empty = t('metric.na');
    const levels = DEFAULTS.levels;
    lineChart(els.chartScore, {
      x,
      series: [{ name: t('var.score'), values: column(rows, 'score'), color: COLORS.text }],
      yMin: 0,
      yMax: 100,
      yFmt: (v) => v.toFixed(0),
      bands: levels.map((l, i) => ({ from: l.min, to: levels[i + 1]?.min ?? 100, color: COLORS.levels[l.id] })),
      emptyText: empty,
    });

    const parts = Object.entries(CONTRIBUTION_COLUMNS);
    els.contribLegend.replaceChildren(
      ...parts.map(([p], i) => {
        const sw = el('i', { className: 'swatch' });
        sw.style.background = COLORS.series[i];
        return el('span', { className: 'legend-item' }, [sw, document.createTextNode(t(`part.${p}`))]);
      }),
    );
    stackedArea(els.chartContrib, {
      x,
      series: parts.map(([p, col], i) => ({ name: t(`part.${p}`), values: column(rows, col), color: COLORS.series[i] })),
      total: { name: t('var.score'), values: column(rows, 'score') },
      yMax: 100,
      emptyText: empty,
    });

    const thr = ds.earThreshold;
    lineChart(els.chartEar, {
      x,
      series: [{ name: t('var.ear_mean'), values: column(rows, 'ear_mean'), color: COLORS.series[0] }],
      refLines: isNum(thr) ? [{ y: thr, label: t('lab.thr') }] : [],
      yFmt: (v) => v.toFixed(2),
      emptyText: empty,
    });
    els.earNote.textContent = isNum(thr)
      ? t(ds.thresholdEstimated ? 'lab.earNoteEst' : 'lab.earNote', { thr: nf(thr, 3) })
      : t('metric.na');

    lineChart(els.chartPerclos, {
      x,
      series: [{ name: 'PERCLOS', values: column(rows, 'perclos_60s').map((v) => (isNum(v) ? v * 100 : v)), color: COLORS.series[1] }],
      yMin: 0,
      refLines: [{ y: DEFAULTS.perclosHigh * 100, label: '15 %' }],
      yFmt: (v) => `${v.toFixed(0)}%`,
      emptyText: empty,
    });

    const frames = ds.earFrames?.length ? ds.earFrames : null;
    const values = frames ?? column(rows, 'ear_mean');
    const h = histogram(values, { bins: 40 });
    histogramChart(els.chartHist, {
      ...h,
      color: COLORS.series[0],
      refLine: isNum(thr) ? { x: thr, label: t('lab.thr') } : null,
      xFmt: (v) => v.toFixed(2),
      countLabel: t('lab.count'),
      emptyText: empty,
    });
    els.histNote.textContent = t(frames ? 'lab.histNoteFrames' : 'lab.histNoteSeconds', {
      n: values.filter(isNum).length,
    });
  }

  function renderExplorer(rows) {
    const v = column(rows, selectedVar);
    const score = column(rows, 'score');
    histogramChart(els.chartVarHist, {
      ...histogram(v, { bins: 30 }),
      color: COLORS.series[2],
      countLabel: t('lab.count'),
      xFmt: (x) => (Math.abs(x) >= 10 ? x.toFixed(0) : x.toFixed(2)),
      emptyText: t('metric.na'),
    });
    const tr = linearTrend(v, score);
    scatter(els.chartVarScatter, {
      x: v,
      y: score,
      xLabel: t(`var.${selectedVar}`),
      yLabel: t('var.score'),
      yMin: 0,
      yMax: 100,
      yFmt: (v) => v.toFixed(0),
      color: COLORS.series[2],
      trend: selectedVar === 'score' ? null : tr,
      emptyText: t('metric.na'),
    });
    const d = describe(v);
    const r = selectedVar === 'score' ? 1 : pearson(v, score);
    els.varNote.textContent = `${t('stat.mean')} ${nf(d.mean)} · ${t('stat.std')} ${nf(d.std)} · ${t('stat.median')} ${nf(d.median)} · ${t(
      'lab.varScatterNote',
      { r: nf(r), b: nf(tr.slope) },
    )}`;
  }

  function renderStats(rows) {
    const header = ['stat.var', 'stat.n', 'stat.missing', 'stat.mean', 'stat.std', 'stat.min', 'stat.q1', 'stat.median', 'stat.q3', 'stat.max'].map(t);
    const body = VARS.map((k) => {
      const d = describe(column(rows, k));
      return [t(`var.${k}`), String(d.n), String(d.missing), nf(d.mean), nf(d.std), nf(d.min), nf(d.q1), nf(d.median), nf(d.q3), nf(d.max)];
    }).filter((r) => r[1] !== '0');
    table(els.statsTable, header, body);

    const keys = CORR_VARS.filter((k) => column(rows, k).some(isNum));
    heatmap(els.chartCorr, { labels: keys.map((k) => t(`var.${k}`)), matrix: correlationMatrix(rows, keys) });
  }

  function renderEvents() {
    const evs = ds.events ?? [];
    const counts = {};
    for (const e of evs) counts[e.type] = (counts[e.type] ?? 0) + 1;
    els.eventTotals.textContent = `${t('ev.total')}: ${
      Object.entries(counts)
        .map(([k, n]) => `${t(`event.${k}`)} ${n}`)
        .join(' · ') || t('data.noEvents')
    }`;
    const recent = evs.slice(-60).reverse();
    table(
      els.eventsTable,
      [t('ev.time'), t('ev.type'), t('ev.dur')],
      recent.map((e) => [clock(e.t_s), t(`event.${e.type}`), isNum(e.dur_ms) ? `${nf(e.dur_ms / 1000, 2)} s` : '—']),
    );
    els.eventsNote.textContent = ds.kind === 'file' || ds.kind === 'sample' ? t('lab.eventsNoteCsv') : '';
  }

  function renderReport() {
    report = buildReport({ rows: ds.rows, engine: ds.engine, name: ds.name, startedAt: ds.startedAt }, getLang());
    renderMarkdown(els.reportBox, report);
  }

  function renderDictionary() {
    table(els.dictTable, ['Columna / Column', getLang() === 'es' ? 'Significado' : 'Meaning'], CSV_COLUMNS.map((c) => [c, t(`dict.${c}`)]));
  }

  function render() {
    const has = !!ds?.rows?.length;
    els.empty.hidden = has;
    els.content.hidden = !has;
    els.notice.hidden = !(has && ds.engine === 'synthetic');
    if (!els.notice.hidden) els.notice.textContent = t('lab.synthetic');
    if (!has) return;
    const rows = ds.rows;
    renderKpis(rows);
    renderCharts(rows);
    renderExplorer(rows);
    renderStats(rows);
    renderEvents();
    renderReport();
    renderDictionary();
  }

  // options of the variable explorer
  const fillVarSelect = () => {
    els.varSelect.replaceChildren(...VARS.map((k) => el('option', { value: k, textContent: t(`var.${k}`), selected: k === selectedVar })));
  };
  fillVarSelect();
  els.varSelect.addEventListener('change', () => {
    selectedVar = els.varSelect.value;
    if (ds?.rows?.length) renderExplorer(ds.rows);
  });
  els.reportDownload.addEventListener('click', () => ds && exporters.markdown(ds, report));
  els.csvBtn.addEventListener('click', () => ds && exporters.csv(ds));
  els.jsonBtn.addEventListener('click', () => ds && exporters.json(ds));

  return {
    setDataset(next) {
      ds = next;
      render();
    },
    get dataset() {
      return ds;
    },
    render,
    relabel() {
      fillVarSelect();
      render();
    },
  };
}
