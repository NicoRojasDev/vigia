/**
 * Vigía — app wiring (UI ↔ camera ↔ engine ↔ fatigue monitor ↔ alerts ↔ session).
 * Vigía — conexión de la app (interfaz ↔ cámara ↔ motor ↔ monitor ↔ alertas ↔ sesión).
 */
import { APP_VERSION, DEFAULTS, ENGINES, REPO_URL } from './config.js';
import { getLang, setLang, t } from './i18n.js';
import { FatigueMonitor } from './fatigue.js';
import { SessionRecorder } from './session.js';
import { AlertManager } from './alerts.js';
import { ScreenWakeLock, startCamera, stopCamera } from './camera.js';
import { COLORS, lineChart } from './charts.js';
import { datasetFromCSV, datasetFromRecorder } from './dataset.js';
import { createLab } from './lab.js';

const $ = (id) => document.getElementById(id);
const el = {
  video: $('video'),
  overlay: $('overlay'),
  placeholder: $('placeholder'),
  calibration: $('calibration'),
  calibrationFill: $('calibrationFill'),
  scoreCard: $('scoreCard'),
  scoreValue: $('scoreValue'),
  scoreBar: $('scoreBar'),
  levelLabel: $('levelLabel'),
  levelHint: $('levelHint'),
  status: $('status'),
  warning: $('warning'),
  engineSelect: $('engineSelect'),
  startBtn: $('startBtn'),
  stopBtn: $('stopBtn'),
  driveBtn: $('driveBtn'),
  testBtn: $('testBtn'),
  langBtn: $('langBtn'),
  summary: $('summary'),
  summaryChart: $('summaryChart'),
  summaryList: $('summaryList'),
  downloadBtn: $('downloadBtn'),
  discardBtn: $('discardBtn'),
  driveView: $('driveView'),
  driveScore: $('driveScore'),
  driveLevel: $('driveLevel'),
  driveHint: $('driveHint'),
  driveStatus: $('driveStatus'),
  exitDriveBtn: $('exitDriveBtn'),
  checklist: $('checklist'),
  consent: $('consent'),
  acceptBtn: $('acceptBtn'),
  cancelBtn: $('cancelBtn'),
  privacyLink: $('privacyLink'),
  codeLink: $('codeLink'),
  version: $('version'),
  stage: $('stage'),
  miniBadge: $('miniBadge'),
  tabs: [...document.querySelectorAll('[role="tab"]')],
  panels: [...document.querySelectorAll('[role="tabpanel"]')],
  memInfo: $('memInfo'),
  dataNoLive: $('dataNoLive'),
  dataLive: $('dataLive'),
  dataLiveKpis: $('dataLiveKpis'),
  liveTable: $('liveTable'),
  liveEvents: $('liveEvents'),
  noSessions: $('noSessions'),
  sessionList: $('sessionList'),
  clearAllBtn: $('clearAllBtn'),
  labSource: $('labSource'),
  labSampleBtn: $('labSampleBtn'),
  labFile: $('labFile'),
  labError: $('labError'),
  dsReportLink: $('dsReportLink'),
  metrics: {
    perclos: $('m-perclos'),
    blinkRate: $('m-blinkRate'),
    avgBlink: $('m-avgBlink'),
    longClosures: $('m-longClosures'),
    yawns: $('m-yawns'),
    head: $('m-head'),
    earmar: $('m-earmar'),
    fps: $('m-fps'),
  },
};

const state = {
  phase: 'idle', // idle | loading | running | stopped
  engineId: 'mediapipe',
  engine: null,
  stream: null,
  monitor: null,
  recorder: null,
  raf: 0,
  lastProc: 0,
  fps: 0,
  lastUi: 0,
  lastSnap: null,
  status: { key: 'status.idle', vars: {} },
  tab: 'monitor',
  session: null, // the session being recorded
  lastPanelUpdate: 0,
};

/**
 * Sessions of this page, kept ONLY in memory (a plain array): nothing is written to
 * localStorage, cookies or a server, so a refresh deletes everything.
 * Sesiones de esta página, SOLO en memoria: al refrescar se borra todo.
 */
const sessions = [];
let sessionSeq = 0;
const labCache = { sample: null, file: null };

const alerts = new AlertManager();
const wakeLock = new ScreenWakeLock();
const engines = {}; // loaded engines are reused between sessions

// ------------------------------------------------------------------ helpers

function setStatus(key, vars = {}) {
  state.status = { key, vars };
  el.status.textContent = t(key, vars);
  el.driveStatus.textContent = t(key, vars);
}

function setControls(mode) {
  const running = mode === 'running';
  const busy = mode === 'loading';
  el.startBtn.hidden = running;
  el.startBtn.disabled = busy;
  el.stopBtn.hidden = !running;
  el.engineSelect.disabled = running || busy;
  el.driveBtn.disabled = !running;
}

async function loadEngine(id) {
  if (engines[id]) return engines[id];
  let engine;
  if (id === 'haar') {
    const { HaarEngine } = await import('./engines/haar-engine.js');
    engine = new HaarEngine();
  } else {
    const { MediaPipeEngine } = await import('./engines/mediapipe-engine.js');
    engine = new MediaPipeEngine();
  }
  await engine.init((s) => setStatus(`status.${s}`));
  engines[id] = engine;
  return engine;
}

const fmtPct = (v) => (v == null ? t('metric.na') : `${(v * 100).toFixed(1)} %`);
const fmtNum = (v, d = 0) => (v == null ? t('metric.na') : v.toFixed(d));
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// ------------------------------------------------------------------ session

function openChecklist() {
  if (!window.isSecureContext) {
    setStatus('error.insecure');
    return;
  }
  alerts.unlock(); // user gesture: allow audio later
  el.consent.checked = false;
  el.acceptBtn.disabled = true;
  if (typeof el.checklist.showModal === 'function') el.checklist.showModal();
  else beginSession();
}

async function beginSession() {
  alerts.unlock();
  el.summary.hidden = true;
  el.warning.hidden = true;
  state.phase = 'loading';
  setControls('loading');

  state.engineId = el.engineSelect.value;
  try {
    state.engine = await loadEngine(state.engineId);
  } catch (err) {
    console.error('[Vigía] engine', err);
    setStatus('error.engine');
    state.phase = 'idle';
    setControls('idle');
    return;
  }

  try {
    setStatus('status.camera');
    state.stream = await startCamera(el.video);
  } catch (err) {
    console.error('[Vigía] camera', err);
    setStatus(err?.message === 'camera_unsupported' ? 'error.insecure' : 'error.camera');
    state.phase = 'idle';
    setControls('idle');
    return;
  }

  el.overlay.width = el.video.videoWidth;
  el.overlay.height = el.video.videoHeight;
  el.placeholder.hidden = true;
  el.calibration.hidden = false;

  state.monitor = new FatigueMonitor();
  state.recorder = new SessionRecorder({ engine: state.engineId, startedAt: new Date() });
  state.session = { id: ++sessionSeq, recorder: state.recorder, engine: state.engineId, live: true };
  sessions.push(state.session);
  el.stage.classList.add('live');
  state.monitor.startCalibration(performance.now());
  state.fps = 0;
  state.lastProc = 0;
  state.phase = 'running';
  setControls('running');
  refreshLabSources(state.tab === 'lab' ? 'live' : null);
  renderDataPanel();
  await wakeLock.acquire();
  state.raf = requestAnimationFrame(loop);
}

function endSession() {
  if (state.phase !== 'running') return;
  state.phase = 'stopped';
  cancelAnimationFrame(state.raf);
  stopCamera(el.video, state.stream);
  state.stream = null;
  wakeLock.release();
  alerts.stop();
  exitDriveMode();
  el.overlay.getContext('2d').clearRect(0, 0, el.overlay.width, el.overlay.height);
  el.placeholder.hidden = false;
  el.calibration.hidden = true;
  state.recorder.finish();
  el.stage.classList.remove('live');
  const finished = state.session;
  finished.live = false;
  if (!state.recorder.rows.length) sessions.splice(sessions.indexOf(finished), 1); // nothing recorded
  state.session = null;
  setControls('idle');
  setStatus('status.stopped');
  if (state.recorder.rows.length > 0) renderSummary();
  const labWasLive = el.labSource.value === 'live';
  refreshLabSources(labWasLive && sessions.includes(finished) ? `s-${finished.id}` : null);
  renderDataPanel();
}

// ------------------------------------------------------------------ main loop

function loop(now) {
  if (state.phase !== 'running') return;
  state.raf = requestAnimationFrame(loop);

  const interval = 1000 / ENGINES[state.engineId].targetFps;
  const dt = now - state.lastProc;
  if (dt < interval - 2) return;
  state.lastProc = now;

  let sig;
  const t0 = performance.now();
  try {
    sig = state.engine.process(el.video, now);
  } catch (err) {
    console.error('[Vigía] frame', err);
    return;
  }
  if (!sig) return;
  sig.procMs = performance.now() - t0;
  if (dt > 0 && dt < 1000) state.fps = state.fps ? state.fps * 0.9 + (1000 / dt) * 0.1 : 1000 / dt;

  const snap = state.monitor.update(sig);
  state.recorder.add(snap, sig);
  state.lastSnap = snap;
  handleEvents(snap);
  drawOverlay(sig, snap);
  if (now - state.lastUi > 200) {
    state.lastUi = now;
    render(snap);
  }
  if (now - state.lastPanelUpdate > 2000) {
    state.lastPanelUpdate = now;
    if (state.tab === 'data') renderDataPanel();
    if (state.tab === 'lab' && el.labSource.value === 'live') showLabSource('live');
  }
}

function handleEvents(snap) {
  for (const e of snap.events) {
    if (e.type === 'calibrated') {
      el.calibration.hidden = true;
      setStatus('status.monitoring');
    } else if (e.type === 'calibration_retry') {
      setStatus('status.calibration_retry');
    } else if (e.type === 'critical_closure') {
      alerts.notify('critical', snap.t, t('voice.critical'));
    }
  }
  if (snap.phase === 'monitoring' && snap.level !== 'ok') {
    alerts.notify(snap.level, snap.t, t(`voice.${snap.level}`));
  }
}

function drawOverlay(sig, snap) {
  const ctx = el.overlay.getContext('2d');
  ctx.clearRect(0, 0, el.overlay.width, el.overlay.height);
  state.engine.drawOverlay?.(ctx, sig, snap, el.overlay.width, el.overlay.height);
}

// ------------------------------------------------------------------ rendering

function render(snap) {
  if (!snap) return;
  if (snap.phase === 'calibrating') {
    const left = Math.ceil((1 - snap.calibrationProgress) * (DEFAULTS.calibrationMs / 1000));
    el.calibrationFill.style.width = `${Math.round(snap.calibrationProgress * 100)}%`;
    if (state.status.key !== 'status.calibration_retry' || snap.calibrationProgress > 0.3) {
      setStatus('status.calibrating', { s: left });
    }
    return;
  }

  const level = snap.level;
  el.scoreCard.dataset.level = level;
  el.driveView.dataset.level = level;
  el.scoreValue.textContent = snap.score;
  el.scoreBar.style.width = `${snap.score}%`;
  el.levelLabel.textContent = t(`level.${level}`);
  el.levelHint.textContent = t(`hint.${level}`);
  el.driveScore.textContent = snap.score;
  el.driveLevel.textContent = t(`level.${level}`);
  el.driveHint.textContent = t(`hint.${level}`);
  el.miniBadge.dataset.level = level;
  el.miniBadge.textContent = `${snap.score} · ${t(`level.${level}`)}`;

  const isHaar = state.engineId === 'haar';
  const m = el.metrics;
  m.perclos.textContent = fmtPct(snap.perclos);
  m.blinkRate.textContent = fmtNum(snap.blinkRate);
  m.avgBlink.textContent = snap.avgBlinkMs == null ? t('metric.na') : `${Math.round(snap.avgBlinkMs)} ms`;
  m.longClosures.textContent = snap.totals.longClosures;
  m.yawns.textContent = isHaar ? t('metric.unsupported') : snap.totals.yawns;
  m.head.textContent = snap.totals.headDeviations + snap.totals.faceLost;
  m.earmar.textContent = isHaar
    ? `👁 ${snap.eyesVisible == null ? t('metric.na') : `${snap.eyesVisible}/2`}`
    : `${fmtNum(snap.ear, 2)} / ${fmtNum(snap.mar, 2)}`;
  m.fps.textContent = fmtNum(state.fps);

  setStatus(snap.faceDetected ? 'status.monitoring' : 'status.no_face');
  const warning = snap.warnings[0];
  el.warning.hidden = !warning;
  if (warning) el.warning.textContent = t(`warning.${warning}`);
}

function renderSummary() {
  const rows = state.recorder.rows;
  const s = state.recorder.summary(DEFAULTS.levels.map((l) => l.id));
  const pct = (sec) => (s.durationS ? Math.round((100 * sec) / s.durationS) : 0);
  const items = [
    [t('summary.duration'), fmtTime(s.durationS)],
    [t('summary.avg'), `${s.avgScore} / 100`],
    [t('summary.max'), `${s.maxScore} / 100`],
    ...DEFAULTS.levels.map((l) => [
      t(`level.${l.id}`),
      `${fmtTime(s.timeInLevel[l.id])} · ${pct(s.timeInLevel[l.id])} %`,
    ]),
    [t('metric.longClosures'), s.totals.long_closures],
    [t('metric.yawns'), state.engineId === 'haar' ? t('metric.unsupported') : s.totals.yawns],
    [t('metric.head'), s.totals.head_deviations + s.totals.face_lost],
  ];
  el.summaryList.replaceChildren(
    ...items.flatMap(([k, v]) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      return [dt, dd];
    }),
  );
  drawChart(el.summaryChart, rows);
  el.summary.hidden = false;
}

/** Score over time with coloured level bands (with hover tooltip). */
function drawChart(canvas, rows) {
  const levels = DEFAULTS.levels;
  lineChart(canvas, {
    x: rows.map((r) => r.t_s),
    series: [{ name: t('metric.score'), values: rows.map((r) => r.score), color: COLORS.text }],
    yMin: 0,
    yMax: 100,
    yFmt: (v) => v.toFixed(0),
    bands: levels.map((l, i) => ({ from: l.min, to: levels[i + 1]?.min ?? 100, color: COLORS.levels[l.id] })),
    emptyText: t('metric.na'),
  });
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = (d = new Date()) => new Date(d).toISOString().slice(0, 16).replace(/[:T]/g, '-');

function exportSession(session, format) {
  const rec = session.recorder;
  const base = `vigia-${session.engine}-${stamp(rec.startedAt ?? new Date())}`;
  if (format === 'json') download(`${base}.json`, JSON.stringify(rec.toJSON(), null, 2), 'application/json');
  else download(`${base}.csv`, rec.toCSV(), 'text/csv');
}

function downloadCsv() {
  if (state.recorder) exportSession({ recorder: state.recorder, engine: state.engineId }, 'csv');
}

/** Export whatever the Data Lab is showing (session, sample or opened file). */
const labExporters = {
  csv(ds) {
    const s = sessions.find((x) => x.id === ds.id);
    if (s) return exportSession(s, 'csv');
    const cols = Object.keys(ds.rows[0] ?? {});
    const lines = [cols.join(','), ...ds.rows.map((r) => cols.map((c) => r[c]).join(','))];
    download(`vigia-${ds.kind}.csv`, `${lines.join('\n')}\n`, 'text/csv');
  },
  json(ds) {
    const s = sessions.find((x) => x.id === ds.id);
    if (s) return exportSession(s, 'json');
    download(
      `vigia-${ds.kind}.json`,
      JSON.stringify({ app: 'vigia', version: APP_VERSION, source: ds.name, config: DEFAULTS, rows: ds.rows, events: ds.events }, null, 2),
      'application/json',
    );
  },
  markdown(ds, md) {
    download(`vigia-informe-${ds.kind}-${stamp()}.md`, md, 'text/markdown');
  },
};

function discardSession() {
  const idx = sessions.findIndex((x) => x.recorder === state.recorder);
  if (idx >= 0) sessions.splice(idx, 1);
  refreshLabSources();
  renderDataPanel();
  state.recorder = null;
  state.monitor = null;
  state.lastSnap = null;
  el.summary.hidden = true;
  el.summaryList.replaceChildren();
  resetScoreUi();
  setStatus('status.idle');
}

function resetScoreUi() {
  el.scoreCard.dataset.level = 'ok';
  el.scoreValue.textContent = '0';
  el.scoreBar.style.width = '0%';
  el.levelLabel.textContent = t('level.ok');
  el.levelHint.textContent = t('hint.ok');
  Object.values(el.metrics).forEach((m) => {
    m.textContent = t('metric.na');
  });
}

// ------------------------------------------------------------------ driving mode

function enterDriveMode() {
  el.driveView.hidden = false;
  document.documentElement.requestFullscreen?.().catch(() => {});
  if (state.lastSnap) render(state.lastSnap);
}

function exitDriveMode() {
  el.driveView.hidden = true;
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}

// ------------------------------------------------------------------ i18n & links

function applyLanguage(lang) {
  setLang(lang);
  alerts.setLanguage(lang);
  const doc = lang === 'es' ? 'docs/es/privacidad-y-legal.md' : 'docs/en/privacy-and-legal.md';
  el.privacyLink.href = `${REPO_URL}/blob/main/${doc}`;
  el.codeLink.href = REPO_URL;
  el.dsReportLink.href = `${REPO_URL}/blob/main/${
    lang === 'es' ? 'docs/es/informe-ciencia-de-datos.md' : 'docs/en/data-science-report.md'
  }`;
  setStatus(state.status.key, state.status.vars);
  if (state.lastSnap && state.phase === 'running') render(state.lastSnap);
  else resetScoreUi();
  if (!el.summary.hidden && state.recorder) renderSummary();
  if (lab) {
    if (labCache.sample) labCache.sample.name = t('lab.src.sample');
    refreshLabSources();
    lab.relabel();
  }
  renderDataPanel();
}

// ------------------------------------------------------------------ tabs

function switchTab(name, { focus = false } = {}) {
  state.tab = name;
  document.body.dataset.tab = name;
  for (const tab of el.tabs) {
    const on = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    if (on && focus) tab.focus();
  }
  for (const panel of el.panels) panel.hidden = panel.dataset.panel !== name;
  if (name === 'data') renderDataPanel();
  if (name === 'lab') showLabSource(el.labSource.value);
  if (name === 'monitor' && state.recorder && !el.summary.hidden) renderSummary();
}

// ------------------------------------------------------------------ "My data" panel

const textEl = (tag, text, cls) => {
  const n = document.createElement(tag);
  n.textContent = text;
  if (cls) n.className = cls;
  return n;
};

function fillTable(table, header, rows) {
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  header.forEach((h) => hr.appendChild(textEl('th', h)));
  thead.appendChild(hr);
  const tbody = document.createElement('tbody');
  for (const r of rows) {
    const tr = document.createElement('tr');
    r.forEach((c) => {
      if (c instanceof Node) {
        const td = document.createElement('td');
        td.appendChild(c);
        tr.appendChild(td);
      } else tr.appendChild(textEl('td', c));
    });
    tbody.appendChild(tr);
  }
  table.replaceChildren(thead, tbody);
}

function levelPill(level) {
  const span = textEl('span', t(`level.${level}`), 'level-pill');
  span.dataset.level = level;
  return span;
}

function renderDataPanel() {
  // memory footprint of everything this page holds
  const totalRows = sessions.reduce((n, x) => n + x.recorder.rows.length, 0);
  const totalEvents = sessions.reduce((n, x) => n + x.recorder.events.length, 0);
  const bytes = sessions.reduce((n, x) => n + x.recorder.memoryBytes(), 0);
  el.memInfo.textContent = t('data.memory', { s: totalRows, e: totalEvents, kb: Math.max(0, Math.round(bytes / 1024)) });

  // live block
  const live = state.session?.live ? state.session.recorder : null;
  el.dataNoLive.hidden = !!live;
  el.dataLive.hidden = !live;
  if (live) {
    const snap = state.lastSnap;
    const sum = live.summary();
    const kpis = [
      [t('col.t'), fmtTime(live.rows.length)],
      [t('col.score'), snap?.phase === 'monitoring' ? String(snap.score) : t('metric.na')],
      [t('col.level'), snap?.phase === 'monitoring' ? t(`level.${snap.level}`) : t('metric.na')],
      [t('summary.avg'), String(sum.avgScore)],
      [t('col.events'), String(live.events.length)],
    ];
    el.dataLiveKpis.replaceChildren(
      ...kpis.map(([k, v]) => {
        const d = document.createElement('div');
        d.className = 'kpi';
        d.append(textEl('span', k), textEl('strong', v));
        return d;
      }),
    );
    const last = live.rows.slice(-15).reverse();
    fillTable(
      el.liveTable,
      [t('col.t'), t('col.score'), t('col.level'), t('col.perclos'), t('col.ear'), t('col.blinks'), t('col.events')],
      last.map((r) => [
        fmtTime(r.t_s),
        String(r.score),
        levelPill(r.level),
        r.perclos_60s === '' ? '—' : `${(r.perclos_60s * 100).toFixed(1)} %`,
        r.ear_mean === '' ? '—' : r.ear_mean.toFixed(3),
        String(r.blinks),
        String(r.long_closures + r.yawns + r.head_deviations + r.face_lost + r.critical_closures),
      ]),
    );
    const evs = live.events.filter((e) => e.type !== 'blink').slice(-10).reverse();
    el.liveEvents.replaceChildren(
      ...(evs.length
        ? evs.map((e) => {
            const li = document.createElement('li');
            li.append(textEl('time', fmtTime(e.t_s)), document.createTextNode(t(`event.${e.type}`)));
            if (e.dur_ms != null) li.append(document.createTextNode(` · ${(e.dur_ms / 1000).toFixed(1)} s`));
            return li;
          })
        : [textEl('li', t('data.noEvents'))]),
    );
  }

  // sessions list
  el.noSessions.hidden = sessions.length > 0;
  el.clearAllBtn.disabled = !sessions.length || !!state.session?.live;
  el.sessionList.replaceChildren(
    ...sessions.map((x) => {
      const rec = x.recorder;
      const sum = rec.summary();
      const li = document.createElement('li');
      const title = document.createElement('strong');
      if (x.live) title.appendChild(textEl('span', '', 'live-dot'));
      title.append(document.createTextNode(t('data.session', { n: x.id })));
      if (rec.startedAt) title.append(document.createTextNode(` · ${new Date(rec.startedAt).toLocaleTimeString(getLang() === 'es' ? 'es-AR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}`));
      if (x.live) title.append(document.createTextNode(` (${t('data.live')})`));
      const meta = textEl(
        'span',
        t('data.sessionMeta', { engine: x.engine, dur: fmtTime(sum.durationS), avg: sum.avgScore, max: sum.maxScore }),
        'meta',
      );
      const buttons = document.createElement('div');
      buttons.className = 'buttons';
      const btn = (label, fn, disabled = false) => {
        const b = textEl('button', label);
        b.type = 'button';
        b.className = 'ghost';
        b.disabled = disabled;
        b.addEventListener('click', fn);
        return b;
      };
      buttons.append(
        btn(t('data.viewLab'), () => {
          refreshLabSources(x.live ? 'live' : `s-${x.id}`);
          switchTab('lab');
        }, !rec.rows.length),
        btn('CSV', () => exportSession(x, 'csv'), !rec.rows.length),
        btn('JSON', () => exportSession(x, 'json'), !rec.rows.length),
        btn(t('data.delete'), () => deleteSession(x), x.live),
      );
      li.append(title, meta, buttons);
      return li;
    }),
  );
}

function deleteSession(x) {
  const i = sessions.indexOf(x);
  if (i < 0 || x.live) return;
  sessions.splice(i, 1);
  if (state.recorder === x.recorder) {
    el.summary.hidden = true;
    state.recorder = null;
  }
  refreshLabSources();
  renderDataPanel();
}

function clearAll() {
  for (const x of [...sessions]) if (!x.live) deleteSession(x);
}

// ------------------------------------------------------------------ Data Lab

let lab = null;

function refreshLabSources(select = null) {
  const prev = select ?? el.labSource.value;
  const opts = [];
  if (state.session?.live) opts.push(['live', t('lab.src.live')]);
  for (const x of sessions) {
    if (x.live || !x.recorder.rows.length) continue;
    const time = x.recorder.startedAt
      ? ` · ${new Date(x.recorder.startedAt).toLocaleTimeString(getLang() === 'es' ? 'es-AR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}`
      : '';
    opts.push([`s-${x.id}`, `${t('data.session', { n: x.id })}${time} (${x.engine})`]);
  }
  if (labCache.sample) opts.push(['sample', t('lab.src.sample')]);
  if (labCache.file) opts.push(['file', t('lab.src.file', { name: labCache.file.name })]);
  el.labSource.replaceChildren(
    ...opts.map(([v, label]) => {
      const o = textEl('option', label);
      o.value = v;
      return o;
    }),
  );
  el.labSource.disabled = !opts.length;
  const values = opts.map((o) => o[0]);
  el.labSource.value = values.includes(prev) ? prev : (values[0] ?? '');
  if (state.tab === 'lab') showLabSource(el.labSource.value);
}

function showLabSource(value) {
  if (!lab) return;
  el.labError.hidden = true;
  let ds = null;
  if (value === 'live' && state.session?.live) {
    ds = datasetFromRecorder(state.session.recorder, { id: state.session.id, name: t('lab.src.live'), live: true });
  } else if (value?.startsWith('s-')) {
    const x = sessions.find((y) => `s-${y.id}` === value);
    if (x) ds = datasetFromRecorder(x.recorder, { id: x.id, name: t('data.session', { n: x.id }) });
  } else if (value === 'sample') ds = labCache.sample;
  else if (value === 'file') ds = labCache.file;
  lab.setDataset(ds);
}

async function loadSample() {
  try {
    if (!labCache.sample) {
      const res = await fetch('./data/sample_session.csv');
      if (!res.ok) throw new Error(String(res.status));
      labCache.sample = datasetFromCSV(await res.text(), { name: t('lab.src.sample'), kind: 'sample' });
    }
    refreshLabSources('sample');
  } catch (err) {
    console.error('[Vigía] sample', err);
    el.labError.textContent = t('lab.fileError');
    el.labError.hidden = false;
  }
}

function openCsvFile(file) {
  if (!file) return;
  // FileReader reads the file locally: nothing is uploaded. / Se lee localmente, no se sube.
  const reader = new FileReader();
  reader.onload = () => {
    try {
      labCache.file = datasetFromCSV(String(reader.result), { name: file.name, kind: 'file' });
      refreshLabSources('file');
    } catch {
      el.labError.textContent = t('lab.fileError');
      el.labError.hidden = false;
    }
    el.labFile.value = '';
  };
  reader.readAsText(file);
}

// ------------------------------------------------------------------ events

el.startBtn.addEventListener('click', openChecklist);
el.stopBtn.addEventListener('click', endSession);
el.consent.addEventListener('change', () => {
  el.acceptBtn.disabled = !el.consent.checked;
});
el.acceptBtn.addEventListener('click', () => {
  el.checklist.close();
  beginSession();
});
el.cancelBtn.addEventListener('click', () => el.checklist.close());
el.driveBtn.addEventListener('click', enterDriveMode);
el.exitDriveBtn.addEventListener('click', exitDriveMode);
el.testBtn.addEventListener('click', () => alerts.test(t('voice.test')));
el.downloadBtn.addEventListener('click', downloadCsv);
el.discardBtn.addEventListener('click', discardSession);
el.langBtn.addEventListener('click', () => applyLanguage(getLang() === 'es' ? 'en' : 'es'));
el.clearAllBtn.addEventListener('click', clearAll);
el.labSource.addEventListener('change', () => showLabSource(el.labSource.value));
el.labSampleBtn.addEventListener('click', loadSample);
el.labFile.addEventListener('change', () => openCsvFile(el.labFile.files?.[0]));
el.tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  tab.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = el.tabs[(i + (e.key === 'ArrowRight' ? 1 : el.tabs.length - 1)) % el.tabs.length];
    switchTab(next.dataset.tab, { focus: true });
  });
});
let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.tab === 'lab') lab?.render();
    if (state.tab === 'monitor' && state.recorder && !el.summary.hidden) renderSummary();
  }, 250);
});

document.addEventListener('visibilitychange', () => {
  if (state.phase === 'running' && document.visibilityState === 'hidden') setStatus('status.paused');
});
window.addEventListener('pagehide', () => {
  if (state.phase === 'running') endSession();
});

lab = createLab(
  {
    empty: $('labEmpty'),
    content: $('labContent'),
    notice: $('labNotice'),
    kpis: $('labKpis'),
    chartScore: $('chartScore'),
    contribLegend: $('contribLegend'),
    chartContrib: $('chartContrib'),
    chartEar: $('chartEar'),
    earNote: $('earNote'),
    chartPerclos: $('chartPerclos'),
    chartHist: $('chartHist'),
    histNote: $('histNote'),
    varSelect: $('varSelect'),
    chartVarHist: $('chartVarHist'),
    chartVarScatter: $('chartVarScatter'),
    varNote: $('varNote'),
    statsTable: $('statsTable'),
    chartCorr: $('chartCorr'),
    eventTotals: $('eventTotals'),
    eventsTable: $('eventsTable'),
    eventsNote: $('eventsNote'),
    reportBox: $('reportBox'),
    reportDownload: $('reportDownload'),
    csvBtn: $('labCsv'),
    jsonBtn: $('labJson'),
    dictTable: $('dictTable'),
  },
  { t, getLang, exporters: labExporters },
);

el.version.textContent = APP_VERSION;
document.body.dataset.tab = 'monitor';
applyLanguage(getLang());
// Deep link: index.html#lab opens the Data Lab with the synthetic example.
if (location.hash === '#lab') {
  switchTab('lab');
  loadSample();
}
