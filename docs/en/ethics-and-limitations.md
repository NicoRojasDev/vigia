# Ethics and limitations (model card)

[🇪🇸 Versión en español](../es/etica-y-limitaciones.md) · [← Back to README](../../README.md)

## Intended use

- **Who:** adult drivers who choose to use it, especially on long or night trips.
- **What for:** an extra, early warning when visible signs of fatigue appear (long eye closures, rising PERCLOS,
  yawns, head nods), so the driver decides to stop and rest.
- **How:** personal and voluntary, on the driver's own phone, with everything processed on the device.

## Out of scope (do not use Vigía for)

- ❌ Monitoring, ranking or disciplining employees, or as evidence in any dispute.
- ❌ Insurance pricing, credit or any decision about a person.
- ❌ Identifying people (Vigía has no face recognition and must not be extended with it under this project).
- ❌ Diagnosing sleep disorders or any medical condition.
- ❌ Detecting alcohol, drugs or distraction from using the phone. Those are different problems.
- ❌ Replacing rest, legal driving-time limits or a certified safety system.

## Factors that affect performance

| Factor | Effect |
|---|---|
| Low light / night | Standard phone cameras have no infrared; at night the face may not be detected |
| Sunglasses, tinted or reflective lenses | Eyes may not be visible → EAR unreliable; Haar may report "eyes closed" |
| Camera position | A low or side angle distorts EAR and head pose; calibration reduces but does not remove this |
| Vibration and bumps | Blurry frames and brief face losses |
| Talking, singing, laughing | Can look like yawns (MAR) or change the eye shape |
| Looking at mirrors | Expected head turns; short ones are ignored, ≥ 1.5 s count as head events |
| Device power | Slow phones process fewer frames; very short blinks may be missed |
| Engine | The Haar baseline is much less reliable than MediaPipe (see methodology) |

## Risks and mitigations

| Risk | Why it matters | Mitigation in v0.1 |
|---|---|---|
| **False negatives** (no alert while drowsy) | The most dangerous error | Clear message that Vigía does not replace rest; immediate alarm for eyes closed ≥ 1.5 s; roadmap measures recall first |
| **False positives** | People ignore or switch off an app that cries wolf ("alarm fatigue") | Personal calibration, minimum durations, hysteresis, alert cooldowns |
| **Over-reliance / risk compensation** | "I can keep driving, the app will warn me" | Every screen and alert says to stop and rest; no gamification of driving time |
| **Distraction** | Looking at or touching the phone while driving | Hands-free design, minimal driving mode, set-up only while stopped |
| **Unequal performance** | Detectors may work worse for some faces, skin tones, ages or with glasses | MediaPipe's Face Mesh V2 model card reports fairness evaluation across regions; Vigía will report its own results by subgroup when labelled data are available |
| **Privacy** | Fatigue is physiological information | On-device processing, no storage of images or landmarks, CSP blocking outgoing connections |

## Known technical limitations (v0.1)

- Thresholds and score weights are **literature-based defaults, not validated** with labelled data.
- PERCLOS is approximated by EAR (not by pupil coverage as in the original lab measure).
- The fatigue score is a heuristic; its numbers are not probabilities.
- MediaPipe requires an internet connection the first time (to download the library and model).
- The app must stay in the foreground with the screen on; browsers pause the camera in the background.

## Transparency

All thresholds are in [`web/js/config.js`](../../web/js/config.js), every formula is in the
[methodology](methodology.md), and the code is open under the MIT licence. Feedback and bug reports are welcome
through GitHub issues.
