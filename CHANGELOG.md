# Changelog

## [0.1.0] — 2026-11-16

First public foundation of the project. / Primera base pública del proyecto.

### Added / Agregado
- Web app (no build step) with MediaPipe Face Landmarker and OpenCV.js Haar engines.
- `FatigueMonitor`: personal calibration, blinks, long and critical eye closures, PERCLOS, yawns, head events,
  0–100 fatigue score with 4 levels and hysteresis.
- Escalating alerts (Web Audio, Speech Synthesis, vibration) with cooldowns; hands-free driving mode; screen wake lock.
- Pre-drive safety and consent checklist; Content-Security-Policy that blocks outgoing connections.
- In-memory per-second session recorder, summary chart and CSV export.
- Python toolkit (`analysis/vigia_analysis`), synthetic session simulator and first notebook.
- *My data* tab: live per-second table, event log and every session of the page, in memory only (deleted on refresh).
- *Data Lab* tab: score decomposition, EAR vs threshold, histograms, descriptive statistics, correlations,
  variable explorer, automatic bilingual report and CSV/JSON/Markdown export; opens local CSVs and a synthetic example.
- Simulation study with known ground truth (`scripts/simulation_study.mjs`, notebook 02) and bilingual data science report.
- 31 JavaScript tests and 15 Python tests sharing fixtures; GitHub Actions for tests and Pages.
- Bilingual documentation (EN/ES): problem & impact, methodology, privacy & legal, ethics & limitations, roadmap.

### Changed from the original prototype / Cambios respecto del prototipo original
- The Haar-cascade detector is kept as a comparable baseline engine instead of the only method.
