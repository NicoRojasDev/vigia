# Methodology

[🇪🇸 Versión en español](../es/metodologia.md) · [← Back to README](../../README.md)

This document explains **what Vigía measures, how, and why**, so every number in the app can be traced to a
formula, a parameter in [`web/js/config.js`](../../web/js/config.js) and a reference.

## 1. Pipeline

```
camera frame → engine → face signal → FatigueMonitor → score + level → alerts / per-second CSV
```

Everything runs in the browser. The `FatigueMonitor` ([`fatigue.js`](../../web/js/fatigue.js)) is
engine-agnostic and pure (no DOM), so the same code runs in the app, in the tests and in the simulator.

## 2. Detection engines

| | MediaPipe Face Landmarker (default) | Haar cascades (baseline) |
|---|---|---|
| Method | CNN face mesh, 478 3D landmarks (Kartynnik et al., 2019) + blendshapes + head pose matrix | Viola–Jones boosted cascades (2001) |
| Runtime | WebAssembly + WebGL (GPU, falls back to CPU) | OpenCV.js 4.5.2 (WebAssembly) |
| Target rate | 30 frames/s | 15 frames/s on a 320 px-wide frame |
| Eye state | Continuous: EAR | Binary proxy: "no eye detected inside the face" |
| Mouth | MAR (yawns) | Detected box only (not used for yawns) |
| Head | Pitch / yaw from the transformation matrix | Proxy: vertical shift of the face box |

The Haar engine reproduces the original prototype. It is kept on purpose as a **baseline**: both engines
export the same CSV, so they can be compared with the same metrics. Its main weakness is structural: the eye
cascade was trained on *open* eyes, so "closed" is inferred from a missed detection, which also happens with
glasses, shadows or a turned head. In a headless-browser test the Haar pipeline took ≈ 21 ms per 320×240 frame
(face, both eyes and mouth found on a sample image).

## 3. Face signals

### 3.1 Eye Aspect Ratio (EAR)

Following Soukupová & Čech (2016), with six landmarks per eye `[p1 … p6]` (outer corner, two upper-lid points,
inner corner, two lower-lid points):

```
EAR = (‖p2 − p6‖ + ‖p3 − p5‖) / (2 · ‖p1 − p4‖)
```

| Eye (subject's) | MediaPipe indices |
|---|---|
| Right | 33, 160, 158, 133, 153, 144 |
| Left | 362, 385, 387, 263, 373, 380 |

MediaPipe landmarks are normalised to [0, 1], so distances are scaled by the frame width and height before the
ratio (otherwise a 4:3 frame distorts EAR). Vigía uses the mean of both eyes.

### 3.2 Mouth Aspect Ratio (MAR)

Inner-lip corners (78, 308) and three upper/lower pairs (82–87, 13–14, 312–317):

```
MAR = mean(‖upperᵢ − lowerᵢ‖) / ‖left − right‖
```

### 3.3 Head pose

Pitch, yaw and roll are extracted from MediaPipe's 4×4 facial transformation matrix
(`pitch = atan2(R₂₁, R₂₂)`, `yaw = atan2(−R₂₀, √(R₂₁² + R₂₂²))`). The memory layout (row- or column-major) is
detected from where the translation is stored. Only the **difference from the personal baseline** is used, so
sign conventions do not matter, and angles wrap correctly around ±180°.

### 3.4 Extra signals recorded for analysis

MediaPipe blendshapes `eyeBlinkLeft/Right` and `jawOpen` are recorded per second. They are not used in the v0.1
score, but they allow comparing a learned signal with the geometric EAR/MAR in the notebooks.

## 4. Personal calibration

During the first **10 s** the driver looks ahead normally. With at least **30 frames** containing a face, the
**median** of each signal becomes the baseline (medians ignore the blinks that happen during calibration). If
there are not enough frames, calibration restarts. For Haar, the share of calibration frames with an eye
detected is also stored; if it is below 60 %, the app warns that the eye signal is unreliable.

## 5. Events and indicators

| Indicator | Rule | Parameter(s) |
|---|---|---|
| Eye closed | MediaPipe: `EAR < 0.65 × baseline EAR` (0.20 absolute before calibration). Haar: face found but no eye | `eyeClosedRatio`, `eyeClosedAbsolute` |
| Closure episode | From the first closed frame to the first open frame | — |
| Noise | Episode < 50 ms is ignored | `minBlinkMs` |
| Blink | 50 ms ≤ episode < 800 ms | `longClosureMs` |
| Long closure | Episode ≥ 800 ms (microsleep-like) | `longClosureMs` |
| Critical closure | Eyes still closed after 1.5 s → immediate alarm | `criticalClosureMs` |
| **PERCLOS** | Share of frames with eyes closed in the last 60 s (reported once ≥ 10 s of data) | `perclosWindowMs`, `perclosMinCoverageMs` |
| Blink rate | Blinks in the last 60 s, per minute | — |
| Blink duration | Mean duration of blinks in the last 60 s (≥ 3 blinks) | — |
| Yawn | `MAR ≥ max(0.5, baseline + 0.3)` for ≥ 1.5 s; ends when MAR < 80 % of the threshold (hysteresis) | `yawnMar`, `yawnBaselineMargin`, `yawnMinMs` |
| Head deviation | `|Δpitch| > 20°` or `|Δyaw| > 30°` for ≥ 1.5 s (Haar: face centre moves > 0.35 face-heights) | `headPitchDeg`, `headYawDeg`, `haarHeadShift`, `headDevMinMs` |
| Face lost | No face for ≥ 2 s (attention event) | `faceLostMs` |
| Pause | Frames > 1 s apart (app in background) discard ongoing episodes instead of over-counting them | `maxGapMs` |

**Why PERCLOS?** Comparative studies for the US Federal Highway Administration found PERCLOS to be the most
reliable ocular measure of drowsiness against psychomotor vigilance lapses (Wierwille et al., 1994;
Dinges & Grace, 1998). Drowsiness also lengthens blinks and produces long closures and yawns, which are added
as complementary signals.

## 6. Fatigue score (v0.1 heuristic)

Each indicator becomes a sub-score between 0 and 1 that **saturates** at a documented level:

| Sub-score | Formula | Saturates at | Weight |
|---|---|---|---|
| PERCLOS | `PERCLOS / 0.15` | 15 % | **0.45** |
| Long closures | `count(last 5 min) / 3` | 3 | 0.20 |
| Yawns | `count(last 5 min) / 3` | 3 | 0.15 |
| Blink duration | `(mean − 150 ms) / (400 − 150 ms)` | 400 ms | 0.10 |
| Head events | `(deviations + 0.5 × face lost) / 3` (last 5 min) | 3 | 0.10 |

```
raw   = 100 × Σ weightᵢ × subscoreᵢ
score = exponential smoothing of raw with τ = 3 s
```

After a critical closure the score is held at ≥ 90 for 10 s.

| Level | Score | Alert (cooldown) |
|---|---|---|
| Alert | 0–29 | — |
| Mild fatigue | 30–54 | soft tone (2 min) |
| Moderate fatigue | 55–74 | double tone + voice (45 s) |
| High fatigue | 75–100 | loud alternating tones + voice + vibration (12 s) |
| Critical closure | any | same as high (4 s) |

A level only drops after the score is **5 points below** its floor (hysteresis), to avoid flickering.

**Sanity check with simulated patterns** (unit tests in [`tests/js/fatigue.test.mjs`](../../tests/js/fatigue.test.mjs)):
normal blinking (15/min, 150 ms) → score ≈ 11, *alert*; slow 350 ms blinks → ≈ 43, *mild*; slow blinks + long
closures + yawns → ≈ 88, *high*.

> These weights are a **transparent, hand-set heuristic** based on the literature, not a validated model.
> Replacing them with a model fitted on labelled data is the core of the roadmap (§ 9).

## 7. Output data (per-second CSV)

Only aggregated numbers are exported — no images, no landmarks.

| Column | Meaning |
|---|---|
| `t_s` | Seconds since monitoring started |
| `engine` | `mediapipe`, `haar` or `synthetic` |
| `fps` | Frames processed in that second |
| `proc_ms` | Mean processing time per frame (ms) |
| `face_ratio` | Share of frames with a face |
| `ear_mean`, `mar_max` | Mean EAR, maximum MAR |
| `eye_closed_ratio` | Share of frames with eyes closed |
| `blink_score_mean`, `jaw_open_max` | MediaPipe blendshapes |
| `pitch_mean`, `yaw_mean` | Head pose (degrees) |
| `perclos_60s`, `blink_rate_min`, `avg_blink_ms` | Rolling indicators |
| `blinks`, `long_closures`, `yawns`, `head_deviations`, `face_lost`, `critical_closures` | Events in that second |
| `c_perclos`, `c_long_closures`, `c_yawns`, `c_blink_duration`, `c_head` | Contribution of each component to the score (points, before smoothing) |
| `score`, `level` | Fatigue score and level |

## 8. Software quality

- **Unit tests:** 31 JavaScript tests (`npm test`) and 15 Python tests (`pytest`).
- **Shared fixtures:** [`tests/fixtures/metrics_cases.json`](../../tests/fixtures/metrics_cases.json) is used by
  both languages, so the browser and Python compute exactly the same EAR and MAR.
- **Schema test:** Python checks that its CSV columns match `CSV_COLUMNS` in `session.js`.
- **Simulator:** [`scripts/simulate_session.mjs`](../../scripts/simulate_session.mjs) drives the real
  `FatigueMonitor` with a seeded, reproducible synthetic drive.
- **Simulation study:** [`scripts/simulation_study.mjs`](../../scripts/simulation_study.mjs) evaluates the logic on
  synthetic drivers with known ground truth — results in the [data science report](data-science-report.md).
- **Browser check:** the Haar engine was tested end to end in headless Chrome with a fake camera
  (calibration → monitoring at 15 frames/s → summary → CSV download), and the CSP was confirmed to block
  MediaPipe's metrics endpoint.

## 9. Evaluation plan

Synthetic data only proves that the pipeline works. To claim that Vigía detects fatigue, it needs evidence:

1. **Public datasets** (check each licence; most are for research use only):
   UTA-RLDD (Ghoddoosian et al., 2019), NTHU-DDD (Weng et al., 2016) and YawDD (Abtahi et al., 2014).
2. **Independent labels:** the Karolinska Sleepiness Scale (KSS, 1–9; Åkerstedt & Gillberg, 1990) every 5 min and
   a 3-minute psychomotor vigilance test (PVT-B; Basner et al., 2011) — never measured by the camera itself.
3. **Metrics:**
   - Events (blinks, long closures, yawns): precision, recall, F1 against manual annotation.
   - Drowsy vs alert windows: ROC-AUC, and **false alarms per hour** (critical for user trust).
   - Thresholds chosen on validation data (e.g. ROC / Youden), never on the test set.
4. **No data leakage:** cross-validation **grouped by person** (`GroupKFold`), so the model is always evaluated on
   people it has never seen.
5. **Fairness:** report results by subgroup where labels exist (glasses, lighting, skin tone, sex, age range).
6. **Model:** start with a logistic regression on per-minute features (interpretable, easy to export to
   JavaScript); compare against the v0.1 heuristic as the baseline.

## 10. References

- Soukupová, T., & Čech, J. (2016). *Real-Time Eye Blink Detection using Facial Landmarks.* 21st Computer Vision
  Winter Workshop.
- Wierwille, W. W., et al. (1994). *Research on Vehicle-Based Driver Status/Performance Monitoring.* NHTSA,
  DOT HS 808 247.
- Dinges, D. F., & Grace, R. (1998). *PERCLOS: A Valid Psychophysiological Measure of Alertness as Assessed by
  Psychomotor Vigilance.* FHWA-MCRT-98-006.
- Viola, P., & Jones, M. (2001). *Rapid Object Detection using a Boosted Cascade of Simple Features.* CVPR.
- Kartynnik, Y., et al. (2019). *Real-time Facial Surface Geometry from Monocular Video on Mobile GPUs.* CVPR
  Workshops.
- Castrillón-Santana, M., et al. (2007). *ENCARA2: Real-time detection of multiple faces at different
  resolutions in video streams.* JVCIR 18(2). (Mouth cascade.)
- Åkerstedt, T., & Gillberg, M. (1990). *Subjective and objective sleepiness in the active individual.*
  International Journal of Neuroscience, 52.
- Basner, M., Mollicone, D., & Dinges, D. F. (2011). *Validity and sensitivity of a brief psychomotor vigilance
  test (PVT-B) to total and partial sleep deprivation.* Acta Astronautica, 69.
- Ghoddoosian, R., Galib, M., & Athitsos, V. (2019). *A Realistic Dataset and Baseline Temporal Model for Early
  Drowsiness Detection.* CVPR Workshops.
- Weng, C.-H., Lai, Y.-H., & Lai, S.-H. (2016). *Driver Drowsiness Detection via a Hierarchical Temporal Deep
  Belief Network.* ACCV Workshops.
- Abtahi, S., Omidyeganeh, M., Shirmohammadi, S., & Hariri, B. (2014). *YawDD: A Yawning Detection Dataset.*
  ACM MMSys.
