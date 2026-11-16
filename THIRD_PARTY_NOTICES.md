# Third-party notices / Avisos de terceros

Vigía's own code is MIT-licensed (see [LICENSE](LICENSE)). It uses the following third-party components, which
keep their own licences. / El código propio de Vigía usa licencia MIT. Estos componentes de terceros conservan
sus propias licencias.

## Redistributed in this repository / Incluidos en este repositorio

| Component | File | Author / copyright | Licence |
|---|---|---|---|
| OpenCV.js 4.5.2 | `web/vendor/opencv/opencv.js` | OpenCV team and contributors | [Apache License 2.0](https://github.com/opencv/opencv/blob/4.x/LICENSE) |
| Frontal face Haar cascade | `web/models/haar/haarcascade_frontalface_default.xml` | Rainer Lienhart · © 2000 Intel Corporation | Intel License Agreement for Open Source Computer Vision Library (BSD-style), full text kept in the file header |
| Eye Haar cascade | `web/models/haar/haarcascade_eye.xml` | Shameem Hameed · © 2000 Intel Corporation | Intel License Agreement (BSD-style), full text kept in the file header |
| Mouth Haar cascade (MCS) | `web/models/haar/haarcascade_mcs_mouth.xml` | © 2006 Modesto Castrillón-Santana (IUSIANI, Universidad de Las Palmas de Gran Canaria) | BSD-style licence, full text kept in the file header. Research use: please cite Castrillón-Santana et al., *ENCARA2*, JVCIR 18(2), 2007 |

The licence headers inside the XML files must not be removed. / No se deben quitar los encabezados de licencia
de los archivos XML.

## Loaded at runtime, not redistributed / Se cargan al usar la app, no se redistribuyen

| Component | Source | Licence |
|---|---|---|
| MediaPipe Tasks Vision 1.2.3 (`@mediapipe/tasks-vision`) | cdn.jsdelivr.net | Apache License 2.0 |
| Face Landmarker model (`face_landmarker.task`: BlazeFace, Face Mesh V2, Blendshapes) | storage.googleapis.com | Apache License 2.0 (per the MediaPipe model cards) |

**MediaPipe privacy notice:** MediaPipe Tasks processes images on device, but by default sends API usage and
performance metrics to Google. Vigía blocks that connection with its Content-Security-Policy. See
[docs/en/privacy-and-legal.md](docs/en/privacy-and-legal.md).

## Generated in code / Generado por código

Alert sounds are synthesised with the Web Audio API and voice uses the device's Speech Synthesis engine: no
third-party audio files are included.
