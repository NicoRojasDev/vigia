# Roadmap

[🇪🇸 Versión en español](../es/hoja-de-ruta.md) · [← Back to README](../../README.md)

## ✅ v0.1 — Foundations (current)

- [x] Web app with two engines: MediaPipe Face Landmarker and the classic OpenCV.js Haar baseline
- [x] EAR, MAR, head pose, personal calibration, blinks, long and critical closures, PERCLOS, yawns, head events
- [x] Transparent 0–100 fatigue score with 4 levels and escalating alerts (sound, voice, vibration)
- [x] Hands-free driving mode, screen wake lock, pre-drive safety checklist
- [x] Privacy by design: on-device processing, in-memory session, CSP blocking outgoing connections
- [x] Per-second CSV/JSON export, Python toolkit, synthetic session simulator and first analysis notebook
- [x] *My data* tab (in memory, deleted on refresh) and *Data Lab* tab with an automatic bilingual report
- [x] Simulation study with known ground truth (threshold, frame rate, calibration, score validity) and report
- [x] JS + Python tests sharing fixtures; GitHub Actions for tests and Pages deployment
- [x] Bilingual docs: problem & impact, methodology, privacy & legal, ethics & limitations

## v0.2 — Benchmark

- [ ] `02_benchmark.ipynb`: run both engines over a public drowsiness dataset (offline, from video files)
- [ ] Event metrics (precision, recall, F1) and false alarms per hour, Haar vs MediaPipe
- [ ] Tune `eyeClosedRatio`, `yawnMar` and others with ROC curves on a validation split
- [ ] Results table in the README

## v0.3 — Offline and installable

- [ ] Self-host the MediaPipe WebAssembly and model, so `connect-src` can be `'self'` only
- [ ] Service worker + manifest (installable PWA that works without signal on the road)
- [ ] Optional OpenCV.js build without `unsafe-eval`

## v0.4 — Pilot with independent labels (opt-in)

- [ ] In-app 3-minute PVT reaction test and KSS self-report, only **while stopped**
- [ ] Specific consent screen; data stay on the device unless the user explicitly shares them
- [ ] Protocol following the checklist in [privacy & legal § 3](privacy-and-legal.md#3-before-collecting-anyone-elses-data-next-stages)

## v0.5 — Learned model

- [ ] Per-minute features → logistic regression, cross-validated by person (`GroupKFold`)
- [ ] Export coefficients to JSON and load them in the browser
- [ ] Compare against the v0.1 heuristic; keep the better one as default

## Ideas

- Driving-time and break reminders
- Night-driving guidance and low-light warnings
- Accessibility audit (screen readers, colour-blind palettes) and a Portuguese UI for the region
