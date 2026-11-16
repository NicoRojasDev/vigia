/**
 * Vigía — central configuration.
 * Vigía — configuración central.
 *
 * EN: Every tunable number lives here so it can be documented, tested and
 *     later tuned with data (see analysis/). Values are reasonable defaults
 *     taken from the literature and pilot tests, NOT validated clinical cut-offs.
 * ES: Todos los números ajustables viven acá para poder documentarlos, testearlos
 *     y luego ajustarlos con datos (ver analysis/). Son valores por defecto
 *     razonables tomados de la literatura y pruebas piloto, NO umbrales clínicos.
 *
 * This file must stay free of DOM code: it is imported by Node tests and scripts.
 * Este archivo no debe usar el DOM: lo importan los tests y scripts de Node.
 */

export const APP_VERSION = '0.1.0';
export const REPO_URL = 'https://github.com/NicoRojasDev/vigia';

/**
 * External assets. Versions are pinned so results are reproducible.
 * Assets externos. Las versiones están fijadas para que sea reproducible.
 *
 * Privacy note / Nota de privacidad: these URLs only download static files
 * (code and model). No camera data is ever sent. See docs/en/privacy-and-legal.md.
 */
export const ASSETS = {
  mediapipe: {
    version: '1.2.3',
    bundle: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/vision_bundle.mjs',
    wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm',
    model:
      'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  },
  opencv: {
    version: '4.5.2',
    script: './vendor/opencv/opencv.js',
    cascades: {
      face: './models/haar/haarcascade_frontalface_default.xml',
      eye: './models/haar/haarcascade_eye.xml',
      mouth: './models/haar/haarcascade_mcs_mouth.xml',
    },
  },
};

/** Detection engines / Motores de detección */
export const ENGINES = {
  mediapipe: { targetFps: 30 },
  haar: { targetFps: 15, processWidth: 320 },
};

/** Fatigue-detection parameters / Parámetros de detección de fatiga */
export const DEFAULTS = Object.freeze({
  // --- Calibration / Calibración ---
  calibrationMs: 10_000, // look ahead normally for 10 s / mirar al frente 10 s
  minCalibrationFrames: 30, // frames with a face needed / cuadros con rostro necesarios

  // --- Eyes / Ojos ---
  eyeClosedRatio: 0.65, // closed if EAR < 65 % of personal baseline / cerrado si EAR < 65 % de la base personal
  eyeClosedAbsolute: 0.2, // fallback EAR threshold without baseline / umbral sin calibración
  useBaselineForEyes: true, // false = fixed absolute threshold (ablation study) / umbral fijo
  minBlinkMs: 50, // shorter closures are treated as noise / cierres más cortos = ruido
  longClosureMs: 800, // closure counted as "long" (microsleep-like) / cierre "largo"
  criticalClosureMs: 1500, // immediate alarm / alarma inmediata
  perclosWindowMs: 60_000, // rolling window for PERCLOS / ventana móvil de PERCLOS
  perclosMinCoverageMs: 10_000, // need this much data before reporting / datos mínimos

  // --- Mouth / Boca ---
  yawnMar: 0.5, // inner-lip MAR above this = mouth wide open / boca muy abierta
  yawnBaselineMargin: 0.3, // and at least this much above the personal baseline
  yawnMinMs: 1500, // sustained opening counted as yawn / apertura sostenida = bostezo

  // --- Head / Cabeza ---
  headPitchDeg: 20, // nod (up/down) beyond baseline / cabeceo respecto a la base
  headYawDeg: 30, // turned (left/right) beyond baseline / giro lateral
  haarHeadShift: 0.35, // Haar proxy: face centre shift in face-heights / desplazamiento
  headDevMinMs: 1500, // sustained deviation counted as event / desvío sostenido
  faceLostMs: 2000, // face out of frame this long = attention event / rostro fuera de cuadro
  maxGapMs: 1000, // frames further apart (app paused) reset ongoing episodes / pausa = reinicio

  // --- Score / Índice ---
  eventWindowMs: 5 * 60_000, // events counted over the last 5 min / eventos de los últimos 5 min
  scoreWeights: { perclos: 0.45, longClosures: 0.2, yawns: 0.15, blinkDuration: 0.1, head: 0.1 },
  perclosHigh: 0.15, // PERCLOS at which its sub-score saturates / saturación de PERCLOS
  longClosuresHigh: 3,
  yawnsHigh: 3,
  headEventsHigh: 3,
  blinkDurNormalMs: 150,
  blinkDurHighMs: 400,
  scoreSmoothingMs: 3000, // time constant of the exponential smoothing / suavizado
  criticalHoldMs: 10_000, // after a critical closure, keep score high / mantener índice alto
  criticalScore: 90,
  levelHysteresis: 5, // points below a level's floor needed to step down / histéresis

  // --- Levels / Niveles (min score) ---
  levels: [
    { id: 'ok', min: 0 },
    { id: 'mild', min: 30 },
    { id: 'moderate', min: 55 },
    { id: 'high', min: 75 },
  ],

  // --- Alerts / Alertas ---
  alertCooldownMs: { mild: 120_000, moderate: 45_000, high: 12_000, critical: 4_000 },
});
