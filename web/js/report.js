/**
 * Automatic, bilingual session report (Markdown). Pure module, tested in Node.
 * Informe automático y bilingüe de la sesión (Markdown). Módulo puro, testeado en Node.
 *
 * Built only from the per-second rows the user already has in memory:
 * descriptive statistics, a linear trend, first-vs-last-third comparison,
 * correlations and data-quality checks.
 */
import { APP_VERSION } from './config.js';
import { column, describe, isNum, linearTrend, pearson } from './stats.js';

const T = {
  es: {
    title: 'Informe automático de la sesión — Vigía',
    source: 'Fuente',
    engine: 'Motor',
    date: 'Fecha',
    duration: 'Duración',
    rows: 'Filas (1 por segundo)',
    summary: 'Resumen',
    meanScore: (m, x) => `Índice de fatiga medio **${m}/100** (máximo ${x}/100).`,
    levels: 'Tiempo por nivel',
    levelNames: { ok: 'alerta', mild: 'leve', moderate: 'moderada', high: 'alta' },
    perclos: (mean, max) => `PERCLOS medio ${mean} %, máximo ${max} %.`,
    events: 'Eventos',
    eventNames: {
      blinks: 'parpadeos',
      long_closures: 'cierres largos',
      critical_closures: 'cierres críticos',
      yawns: 'bostezos',
      head_deviations: 'desvíos de cabeza',
      face_lost: 'rostro fuera de cuadro',
    },
    firstLong: (t) => `Primer cierre largo a los **${t}**.`,
    noLong: 'No hubo cierres largos.',
    trend: 'Tendencia',
    trendText: (s, r2) => `El índice cambió **${s} puntos cada 10 minutos** (regresión lineal, R² = ${r2}).`,
    trendShort: 'La sesión es demasiado corta (< 3 min) para estimar una tendencia.',
    thirds: 'Primer tercio vs. último tercio',
    indicator: 'Indicador',
    first: 'Primer tercio',
    last: 'Último tercio',
    change: 'Cambio',
    names: {
      score: 'Índice',
      perclos_60s: 'PERCLOS (60 s)',
      avg_blink_ms: 'Duración del parpadeo (ms)',
      blink_rate_min: 'Parpadeos / min',
      ear_mean: 'EAR medio',
      eye_closed_ratio: 'Proporción con ojos cerrados',
      mar_max: 'MAR máximo',
      pitch_mean: 'Pitch medio (°)',
    },
    corr: 'Variables que acompañan al índice',
    corrText: 'Correlación de Pearson con el índice (|r| más altos):',
    corrNote:
      'Correlación no implica causalidad, y el índice se calcula a partir de algunas de estas variables: es esperable que se relacionen.',
    quality: 'Calidad de los datos',
    face: (p) => `Rostro detectado en el ${p} % de los cuadros.`,
    missing: (p) => `EAR faltante en el ${p} % de los segundos.`,
    fps: (f, ms) => `Velocidad media ${f} cuadros/s${ms ? `, ${ms} ms de procesamiento por cuadro` : ''}.`,
    caveats: 'Lectura y limitaciones',
    caveatList: [
      'Vigía v0.1 usa una heurística transparente, todavía no validada con etiquetas independientes (KSS / PVT).',
      'Los resultados dependen de la luz, la posición de la cámara y el uso de anteojos.',
      'No es un dispositivo médico ni de seguridad certificado; no reemplaza el descanso.',
    ],
    synthetic: '**Datos sintéticos:** sirven para probar el circuito y la visualización, no para validar el detector.',
    footer: (v) => `Generado en el navegador con Vigía v${v}. Los datos no salieron del dispositivo.`,
    empty: 'No hay datos para informar.',
  },
  en: {
    title: 'Automatic session report — Vigía',
    source: 'Source',
    engine: 'Engine',
    date: 'Date',
    duration: 'Duration',
    rows: 'Rows (1 per second)',
    summary: 'Summary',
    meanScore: (m, x) => `Mean fatigue score **${m}/100** (peak ${x}/100).`,
    levels: 'Time per level',
    levelNames: { ok: 'alert', mild: 'mild', moderate: 'moderate', high: 'high' },
    perclos: (mean, max) => `Mean PERCLOS ${mean}%, peak ${max}%.`,
    events: 'Events',
    eventNames: {
      blinks: 'blinks',
      long_closures: 'long closures',
      critical_closures: 'critical closures',
      yawns: 'yawns',
      head_deviations: 'head deviations',
      face_lost: 'face out of frame',
    },
    firstLong: (t) => `First long closure at **${t}**.`,
    noLong: 'No long closures.',
    trend: 'Trend',
    trendText: (s, r2) => `The score changed **${s} points every 10 minutes** (linear regression, R² = ${r2}).`,
    trendShort: 'The session is too short (< 3 min) to estimate a trend.',
    thirds: 'First third vs last third',
    indicator: 'Indicator',
    first: 'First third',
    last: 'Last third',
    change: 'Change',
    names: {
      score: 'Score',
      perclos_60s: 'PERCLOS (60 s)',
      avg_blink_ms: 'Blink duration (ms)',
      blink_rate_min: 'Blinks / min',
      ear_mean: 'Mean EAR',
      eye_closed_ratio: 'Share of frames with eyes closed',
      mar_max: 'Max MAR',
      pitch_mean: 'Mean pitch (°)',
    },
    corr: 'Variables that move with the score',
    corrText: 'Pearson correlation with the score (highest |r|):',
    corrNote:
      'Correlation is not causation, and the score is computed from some of these variables, so they are expected to be related.',
    quality: 'Data quality',
    face: (p) => `Face detected in ${p}% of frames.`,
    missing: (p) => `EAR missing in ${p}% of seconds.`,
    fps: (f, ms) => `Mean speed ${f} frames/s${ms ? `, ${ms} ms of processing per frame` : ''}.`,
    caveats: 'Interpretation and limitations',
    caveatList: [
      'Vigía v0.1 uses a transparent heuristic, not yet validated against independent labels (KSS / PVT).',
      'Results depend on lighting, camera position and glasses.',
      'Not a medical device or a certified safety system; it does not replace rest.',
    ],
    synthetic: '**Synthetic data:** useful to test the pipeline and the charts, not to validate the detector.',
    footer: (v) => `Generated in the browser with Vigía v${v}. The data never left the device.`,
    empty: 'No data to report.',
  },
};

const LEVELS = ['ok', 'mild', 'moderate', 'high'];
const EVENTS = ['blinks', 'long_closures', 'critical_closures', 'yawns', 'head_deviations', 'face_lost'];
const CORR_KEYS = ['perclos_60s', 'avg_blink_ms', 'blink_rate_min', 'ear_mean', 'eye_closed_ratio', 'mar_max', 'pitch_mean'];
const THIRD_KEYS = ['score', 'perclos_60s', 'avg_blink_ms', 'blink_rate_min', 'ear_mean'];

export const fmtClock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function fmt(v, d = 1, lang = 'es') {
  if (!isNum(v)) return '—';
  const s = v.toFixed(d);
  return lang === 'es' ? s.replace('.', ',') : s;
}

/** Key numbers of a dataset, shared by the report and the Data Lab. */
export function analyse(rows) {
  const t = column(rows, 't_s');
  const score = column(rows, 'score');
  const n = rows.length;
  const levelSec = Object.fromEntries(LEVELS.map((l) => [l, rows.filter((r) => r.level === l).length]));
  const totals = Object.fromEntries(EVENTS.map((k) => [k, column(rows, k).reduce((s, v) => s + (v ?? 0), 0)]));
  const firstLong = rows.find((r) => Number(r.long_closures) > 0);
  const durationS = n ? (t.filter(isNum).at(-1) ?? n - 1) + 1 : 0;
  const trend = durationS >= 180 ? linearTrend(t, score) : null;
  const thirds = THIRD_KEYS.map((k) => {
    const v = column(rows, k);
    const a = describe(v.slice(0, Math.floor(n / 3))).mean;
    const b = describe(v.slice(n - Math.floor(n / 3))).mean;
    return { key: k, first: a, last: b, change: isNum(a) && isNum(b) ? b - a : null };
  });
  const correlations = CORR_KEYS.map((k) => ({ key: k, r: pearson(column(rows, k), score) }))
    .filter((c) => isNum(c.r))
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  const ear = column(rows, 'ear_mean');
  return {
    n,
    durationS,
    score: describe(score),
    perclos: describe(column(rows, 'perclos_60s')),
    levelPct: Object.fromEntries(LEVELS.map((l) => [l, n ? (100 * levelSec[l]) / n : 0])),
    totals,
    firstLongS: firstLong ? Number(firstLong.t_s) : null,
    trend,
    thirds,
    correlations,
    facePct: describe(column(rows, 'face_ratio')).mean,
    earMissingPct: n ? (100 * ear.filter((v) => !isNum(v)).length) / n : null,
    fps: describe(column(rows, 'fps')).mean,
    procMs: describe(column(rows, 'proc_ms')).mean,
  };
}

/**
 * @param {{rows: object[], engine?: string, name?: string, startedAt?: Date|string|null}} data
 * @param {'es'|'en'} lang
 */
export function buildReport(data, lang = 'es') {
  const L = T[lang] ?? T.es;
  const rows = data.rows ?? [];
  if (!rows.length) return `# ${L.title}\n\n${L.empty}\n`;
  const a = analyse(rows);
  const f = (v, d = 1) => fmt(v, d, lang);
  const engine = data.engine ?? rows[0].engine ?? '—';
  const out = [];

  out.push(`# ${L.title}`, '');
  out.push(`- **${L.source}:** ${data.name ?? '—'}`);
  out.push(`- **${L.engine}:** ${engine}`);
  if (data.startedAt) out.push(`- **${L.date}:** ${new Date(data.startedAt).toLocaleString(lang === 'es' ? 'es-AR' : 'en-US')}`);
  out.push(`- **${L.duration}:** ${fmtClock(a.durationS)}`);
  out.push(`- **${L.rows}:** ${a.n}`, '');
  if (engine === 'synthetic') out.push(L.synthetic, '');

  out.push(`## ${L.summary}`, '');
  out.push(`- ${L.meanScore(f(a.score.mean, 0), f(a.score.max, 0))}`);
  out.push(
    `- ${L.levels}: ${LEVELS.map((l) => `${L.levelNames[l]} ${f(a.levelPct[l], 0)} %`).join(' · ')}`.replace(
      / %/g,
      lang === 'es' ? ' %' : '%',
    ),
  );
  if (isNum(a.perclos.mean)) out.push(`- ${L.perclos(f(100 * a.perclos.mean), f(100 * a.perclos.max))}`);
  out.push(`- ${L.events}: ${EVENTS.map((k) => `${a.totals[k]} ${L.eventNames[k]}`).join(' · ')}`);
  out.push(`- ${a.firstLongS == null ? L.noLong : L.firstLong(fmtClock(a.firstLongS))}`, '');

  out.push(`## ${L.trend}`, '');
  if (a.trend?.slope != null) {
    const s = a.trend.slope * 600;
    out.push(L.trendText(`${s >= 0 ? '+' : ''}${f(s)}`, f(a.trend.r2, 2)), '');
  } else out.push(L.trendShort, '');

  out.push(`## ${L.thirds}`, '');
  out.push(`| ${L.indicator} | ${L.first} | ${L.last} | ${L.change} |`, '|---|---:|---:|---:|');
  for (const th of a.thirds) {
    const scale = th.key === 'perclos_60s' ? 100 : 1;
    const d = th.key === 'ear_mean' ? 3 : 1;
    const ch = isNum(th.change) ? `${th.change >= 0 ? '+' : ''}${f(th.change * scale, d)}` : '—';
    out.push(`| ${L.names[th.key]}${scale === 100 ? ' (%)' : ''} | ${f(th.first * scale, d)} | ${f(th.last * scale, d)} | ${ch} |`);
  }
  out.push('');

  if (a.correlations.length) {
    out.push(`## ${L.corr}`, '', L.corrText, '');
    for (const c of a.correlations.slice(0, 3)) out.push(`- ${L.names[c.key]}: r = ${f(c.r, 2)}`);
    out.push('', `> ${L.corrNote}`, '');
  }

  out.push(`## ${L.quality}`, '');
  if (isNum(a.facePct)) out.push(`- ${L.face(f(100 * a.facePct, 0))}`);
  if (isNum(a.earMissingPct)) out.push(`- ${L.missing(f(a.earMissingPct, 0))}`);
  if (isNum(a.fps)) out.push(`- ${L.fps(f(a.fps, 0), isNum(a.procMs) ? f(a.procMs, 1) : null)}`);
  out.push('');

  out.push(`## ${L.caveats}`, '');
  for (const c of L.caveatList) out.push(`- ${c}`);
  out.push('', `---`, `_${L.footer(APP_VERSION)}_`, '');
  return out.join('\n');
}
