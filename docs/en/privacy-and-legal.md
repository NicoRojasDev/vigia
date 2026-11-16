# Privacy, legal compliance and safe use

[🇪🇸 Versión en español](../es/privacidad-y-legal.md) · [← Back to README](../../README.md)

> **Disclaimer:** this document explains how Vigía was designed to respect Argentine law. It is a student's
> analysis, **not legal advice**. Before any commercial or institutional use, or any use involving other people's
> data, consult a lawyer. Laws reviewed in November 2026.

## 1. Summary: what happens to the data

| Data | Where it is processed | Stored? | Sent? |
|---|---|---|---|
| Camera image | Browser memory, frame by frame | **No** | **No** |
| Face landmarks | Memory, only to draw the current frame | **No** | **No** |
| Per-second numbers (EAR, PERCLOS, score…) | Memory during the session | Only if the user taps *Download CSV*, and it stays **on their device** | **No** |
| A CSV opened in the Data Lab | Read in the browser (FileReader) | Only in memory | **No** |
| Identity (name, account, location) | — | Never asked | No |

- **No accounts, cookies, `localStorage`, analytics or tracking.**
- **No face recognition:** Vigía does not identify people or build biometric templates; it only measures eye and
  mouth opening and head orientation.
- **Deleting is easy:** *Delete* / *Delete all* in the *My data* tab, refreshing or closing the tab removes everything held in memory.

### Network connections

The page only downloads **static files**:

| Service | Purpose | What the provider sees |
|---|---|---|
| GitHub Pages | Hosts the page | IP address and browser, like any website |
| cdn.jsdelivr.net | MediaPipe code (`@mediapipe/tasks-vision@1.2.3`) | Same |
| storage.googleapis.com | `face_landmarker.task` model | Same |

The classic engine (Haar) downloads nothing external: OpenCV.js and the cascades are in the repository.

### Key finding: MediaPipe usage metrics

The privacy notice of the [`@mediapipe/tasks-vision`](https://www.npmjs.com/package/@mediapipe/tasks-vision)
package states that **images are processed on device and are not sent to Google**, but that the library **does
send API performance and usage metrics** to Google, and that **the app developer is responsible for obtaining
users' informed consent** for that. Inspecting version 1.2.3 shows those metrics are sent via `POST` to
`odml.pa.googleapis.com`.

**Design decision:** instead of asking for an extra consent, Vigía **blocks that connection**. `index.html`
defines a *Content-Security-Policy* whose `connect-src` only allows the site itself, the two hosts above and
`data:` (used by OpenCV.js to read its own embedded WebAssembly, no network). The browser refuses any other
connection, and an automated test confirmed that a request to `odml.pa.googleapis.com` is blocked by the policy.

> If you fork the project and remove or widen that policy, you must inform users and obtain consent for
> MediaPipe's metrics.

## 2. Argentine legal framework applied to the design

### 2.1 Personal data protection — [Law 25.326](https://www.argentina.gob.ar/normativa/nacional/ley-25326-2000-64790/actualizacion)

Law 25.326 remains in force. Reform bills are in Congress but
[create no current obligations](https://abogados.com.ar/nuevo-proyecto-de-ley-de-proteccion-de-datos-personales/39762).

How Vigía takes it into account:

- **Informed consent (art. 5):** before the camera starts, a checklist explains what is processed and how; the
  session cannot start without ticking "I understand and agree".
- **Purpose limitation and data minimisation:** only the numbers needed to estimate fatigue are computed. No
  images or landmarks are stored.
- **No developer database:** since nothing leaves the device, the author never receives or stores anyone's data.
  Users alone decide whether to export their CSV.
- **Security:** processing is local and the browser security policy prevents network leaks.

### 2.2 Biometric and sensitive data

- [AAIP Resolution 4/2019](https://argentina.gob.ar/normativa/318874_res4AAIP_pdf/archivo) defines biometric data
  and treats it as **sensitive** when it may reveal
  [potentially discriminatory information](https://abogados.com.ar/mejores-practicas-en-la-aplicacion-de-la-ley-de-proteccion-de-datos-personales-resolucion-42019-de-la-agencia-de-acceso-a-la-informacion-publica/23000?tech=1).
- Argentina joined Convention 108 (Law 27.483) and **Convention 108+** through
  [Law 27.699](https://abogados.com.ar/importante-novedad-en-proteccion-de-datos-personales-el-congreso-convirtio-en-ley-la-adhesion-de-argentina-al-convenio-108/31613),
  which extends special categories to biometric data; the AAIP applies this when data
  [uniquely identify a person and reveal health or physiological information](https://www.marval.com/Publicacion/nuevo-criterio-orientador-e-indicador-de-mejores-practicas-para-el-tratamiento-de-datos-geneticos-15393?lang=es).

Fatigue level is physiological information. That is why Vigía handles it with maximum care even though it
**identifies no one**: it is computed on the fly, stays on the device and is never linked to an identity.

### 2.3 Traffic law — [Law 24.449](https://www.argentina.gob.ar/normativa/nacional/ley-24449-818/actualizacion)

- **Art. 48 (x)** prohibits [driving while using headphones or communication systems that require continuous
  manual operation](https://www.iprofesional.com/actualidad/447454-multas-por-usar-el-celular-con-el-auto-detenido-de-cuanto-es-y-que-debes-saber),
  and **art. 39** requires both hands on the wheel.

Design decisions:

| Requirement | How Vigía handles it |
|---|---|
| Do not handle the phone | Set up **while the vehicle is stopped**; afterwards it runs on its own |
| No headphones | Alerts play through the **speaker**; the app reminds users before starting |
| Do not distract | *Driving mode* shows only a number, a colour and a short sentence |
| Clear view | The checklist asks for a **fixed mount** that does not block the view or mirrors |

Provinces and municipalities adhere to the national law and may add their own rules: check yours.

### 2.4 Not a medical product — ANMAT

ANMAT Provision 64/2025 adopted the MERCOSUR definition of
[software as a medical device (SaMD)](https://abogados.com.ar/inteligencia-artificial-y-software-medico-en-argentina-desafios-regulatorios-para-el-regimen-de-productos-medicos/40131):
software intended by its manufacturer for a medical purpose.

Vigía has **no medical purpose**: it does not diagnose sleep disorders or any disease, recommend treatments or
replace a consultation. It is an educational road-safety tool. Therefore:

- The app and docs say so wherever relevant.
- No claims such as "detects sleep apnoea" or "prevents accidents". Vigía **warns** about signs of fatigue.

### 2.5 Intellectual property — Law 11.723 and licences

Vigía's own code is MIT-licensed. Third-party components keep their licences and notices (Apache 2.0 for OpenCV
and MediaPipe; BSD-style licences for the Haar cascades). See [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).
Alert sounds are generated in code: no third-party audio.

### 2.6 Out-of-scope uses

Vigía is designed for **personal, voluntary use**. Using it to monitor employees, discipline people, price
insurance or identify individuals triggers other obligations (labour and data-protection law) and is **not
supported**. See [ethics & limitations](ethics-and-limitations.md).

## 3. Before collecting anyone else's data (next stages)

The roadmap includes a pilot to validate the detector. Before collecting any third-party data:

- [ ] Free, express and informed **written** consent (art. 5, Law 25.326), revocable at any time.
- [ ] **Adults only.**
- [ ] Store **metrics only**, never video, unless there is specific, separate consent.
- [ ] **De-identified** data (no names or anything that could identify the person).
- [ ] Access, rectification and deletion rights with a clear contact channel.
- [ ] Check whether the database must be registered with the AAIP.
- [ ] For academic work, approval from the institution (e.g. ITSE).
- [ ] **Never** test while driving on public roads: pilots run in a simulator or with the vehicle stopped.

## 4. Safe-use guide

1. Sleep well before a trip. Vigía does not replace rest.
2. Set everything up **while stopped**: fixed mount, camera facing you, volume up.
3. Tap *Start*, accept the checklist and look ahead for 10 seconds to calibrate.
4. Turn on *driving mode* and do not touch the phone while driving.
5. If a **moderate or high** fatigue alert sounds, **pull over somewhere safe and rest.** A short nap and getting
   out of the vehicle help; driving "a bit longer" does not.
6. If you feel sleepy, **do not wait for the alarm**.

## 5. Contact

Privacy questions or reports: open an issue at
[github.com/NicoRojasDev/vigia](https://github.com/NicoRojasDev/vigia/issues).
