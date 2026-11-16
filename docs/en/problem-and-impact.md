# Problem and impact

[🇪🇸 Versión en español](../es/problema-e-impacto.md) · [← Back to README](../../README.md)

## 1. The problem: fatigue at the wheel

- In Argentina, **3,894 people died in road crashes in 2024**, almost 10 per day
  ([INSOD – UADE report, based on ANSV data](https://uade.edu.ar/media/qkdjxlmz/seguridad-vial-informe-insod-final-_.pdf)).
  ANSV's preliminary report for 2025 recorded
  [4,060 victims in 3,255 crashes](https://www.atmseguros.com.ar/descargas/Infobae_VacacionesInvierno_FernandoRodriguez.pdf).
- According to the NGO *Luchemos por la Vida*, driving with extreme fatigue is
  [equivalent to exceeding the legal blood-alcohol limit](https://www.iprofesional.com/actualidad/459961-el-peligroso-habito-al-volante-que-aumenta-el-riesgo-de-choque-un-33).
- The European Transport Safety Council estimates that fatigue is present in
  [20% of road crashes in Europe](https://diariodecuyo.com.ar/editorialdeldia/La-fatiga-al-volante-es-un-alto-factor-de-riesgo-20220222-0087.html),
  and single-vehicle crashes cluster between 3–5 a.m. and 3–5 p.m.
- In the US, NHTSA estimates that [2% to 20% of road deaths](https://www.nhtsa.gov/node/138456) are due to
  drowsiness. Official figures report
  [693 deaths in 2022](https://www.automotive-fleet.com/news/study-reveals-dangers-of-driving-while-tired), but
  NHTSA's own report cites researchers' estimates of
  [more than 8,000 deaths per year](https://www.nbcdfw.com/news/local/drowsy-driving-deaths-may-be/59618/): it is
  heavily under-reported.
- Argentina's road-safety agency (ANSV) calls stress and fatigue
  ["risk factors that are hard to measure"](https://noticias.autocosmos.com.ar/2025/09/30/este-es-el-impacto-del-estres-en-la-conduccion).
  There is no "breathalyser for sleep", and people tend to underestimate their own tiredness.

## 2. Who is affected

- **Professional drivers:** truckers, long-distance buses, freight, delivery and ride-hailing, often on night or
  rotating shifts.
- **Long, monotonous routes**, such as national routes 9 and 34 across Santiago del Estero, where the lack of
  stimuli encourages drowsiness.
- **Young drivers:** according to ISEV, [4 in 10 drivers involved in serious crashes were under
  30](https://www.lanacion.com.ar/autos/hay-decisiones-claves-que-pueden-evitar-un-accidente-de-transito-hablan-los-especialistas-nid13062026/).

## 3. The gap

Driver-monitoring systems already exist — the European Union, for example, requires drowsiness and attention
warning in new vehicles ([Regulation (EU) 2019/2144](https://eur-lex.europa.eu/eli/reg/2019/2144/oj)). But they come
with new cars or fleet hardware that must be bought and installed. Most drivers in our region, with used vehicles
and no hardware budget, are left out.

## 4. Vigía's proposal

| | |
|---|---|
| **Zero cost** | Just a phone with a front camera and a mount |
| **Nothing to install** | It is a web page; works on Android and iPhone with a modern browser |
| **Private** | Everything is processed on the device; no server receives video or data |
| **Open and auditable** | Public formulas, thresholds and code; anyone can check how it decides |
| **Inclusive** | Bilingual UI, sound + voice + vibration alerts, and a lightweight engine for modest devices |

## 5. Expected impact and how to measure it

Vigía is a prototype: these are **hypotheses to measure**, not results.

| Dimension | Indicator | How it is measured |
|---|---|---|
| Technical | Recall of long closures and false alarms per hour | Public datasets and a pilot with KSS/PVT labels ([methodology](methodology.md#9-evaluation-plan)) |
| Usage | Completed sessions, monitored minutes | Only if opt-in, anonymous metrics are added in the future, after legal review |
| Behaviour | % of users who report stopping to rest after a high alert | Voluntary survey |
| Social | Drivers reached through cooperatives, bus terminals and driving schools | Local partnerships |

## 6. Alignment with global goals

- **SDG 3, target 3.6:** halve global deaths and injuries from road traffic crashes.
- **Decade of Action for Road Safety 2021–2030** (UN/WHO), aiming to cut road deaths by 50% by 2030.
