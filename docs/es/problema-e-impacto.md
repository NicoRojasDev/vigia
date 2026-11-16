# Problemática e impacto

[🇬🇧 English version](../en/problem-and-impact.md) · [← Volver al README](../../README.es.md)

## 1. El problema: la fatiga al volante

- En Argentina murieron **3894 personas en siniestros viales en 2024**, casi 10 por día
  ([informe INSOD – UADE, con datos de la ANSV](https://uade.edu.ar/media/qkdjxlmz/seguridad-vial-informe-insod-final-_.pdf)).
  El informe preliminar de la ANSV para 2025 registró
  [4060 víctimas en 3255 siniestros](https://www.atmseguros.com.ar/descargas/Infobae_VacacionesInvierno_FernandoRodriguez.pdf).
- Según *Luchemos por la Vida*, manejar con fatiga extrema
  [equivale a superar el nivel de alcohol en sangre permitido por ley](https://www.iprofesional.com/actualidad/459961-el-peligroso-habito-al-volante-que-aumenta-el-riesgo-de-choque-un-33).
- El European Transport Safety Council estima que la fatiga está presente en
  [el 20 % de los siniestros viales en Europa](https://diariodecuyo.com.ar/editorialdeldia/La-fatiga-al-volante-es-un-alto-factor-de-riesgo-20220222-0087.html),
  y los choques "en solitario" se concentran entre las 3 y las 5 de la madrugada y entre las 15 y las 17.
- En EE. UU. la NHTSA estima que [entre el 2 % y el 20 % de las muertes viales](https://www.nhtsa.gov/node/138456)
  se deben a la somnolencia. Las cifras oficiales hablan de
  [693 muertes en 2022](https://www.automotive-fleet.com/news/study-reveals-dangers-of-driving-while-tired), pero
  el propio informe de la NHTSA recoge estimaciones de investigadores de
  [más de 8000 muertes por año](https://www.nbcdfw.com/news/local/drowsy-driving-deaths-may-be/59618/): es un
  problema muy subregistrado.
- Para la ANSV, el estrés y la fatiga son
  ["factores de riesgo difíciles de medir"](https://noticias.autocosmos.com.ar/2025/09/30/este-es-el-impacto-del-estres-en-la-conduccion).
  No existe un "alcoholímetro del sueño", y las personas suelen subestimar su propio cansancio.

## 2. A quién afecta

- **Choferes profesionales:** camioneros, micros de larga distancia, transporte de cargas, reparto y
  aplicaciones de viaje, muchas veces con turnos nocturnos o rotativos.
- **Rutas largas y monótonas**, como las nacionales 9 y 34 que atraviesan Santiago del Estero, donde
  la falta de estímulos favorece la somnolencia.
- **Jóvenes:** según el ISEV, [4 de cada 10 conductores involucrados en siniestros graves tenían menos de 30
  años](https://www.lanacion.com.ar/autos/hay-decisiones-claves-que-pueden-evitar-un-accidente-de-transito-hablan-los-especialistas-nid13062026/).

## 3. La brecha

Los sistemas de monitoreo del conductor ya existen: la Unión Europea, por ejemplo, exige advertencia de
somnolencia y atención en vehículos nuevos ([Reglamento (UE) 2019/2144](https://eur-lex.europa.eu/eli/reg/2019/2144/oj)).
Pero vienen en autos nuevos o en equipos para flotas que hay que comprar e instalar. La mayoría de quienes manejan
en nuestra región, con vehículos usados y sin presupuesto para hardware, quedan afuera.

## 4. La propuesta de Vigía

| | |
|---|---|
| **Costo cero** | Solo hace falta un celular con cámara frontal y un soporte |
| **Sin instalar** | Es una página web; funciona en Android y iPhone con un navegador moderno |
| **Privado** | Todo se procesa en el dispositivo; no hay servidor que reciba video ni datos |
| **Abierto y auditable** | Fórmulas, umbrales y código públicos; cualquiera puede revisar cómo decide |
| **Inclusivo** | Interfaz bilingüe, alertas por sonido, voz y vibración, y un motor liviano para equipos más modestos |

## 5. Impacto esperado y cómo medirlo

Vigía es un prototipo: estas son **hipótesis a medir**, no resultados.

| Dimensión | Indicador | Cómo se mide |
|---|---|---|
| Técnica | Recall de cierres largos y falsas alarmas por hora | Datasets públicos y piloto con etiquetas KSS/PVT ([metodología](metodologia.md#9-plan-de-evaluación)) |
| Uso | Sesiones completas, minutos monitoreados | Solo si en el futuro se agregan métricas opt-in y anónimas, con revisión legal |
| Conducta | % de personas que dicen haber parado a descansar después de una alerta alta | Encuesta voluntaria |
| Social | Conductores alcanzados a través de cooperativas, terminales y escuelas de manejo | Alianzas locales |

## 6. Alineación con objetivos globales

- **ODS 3, meta 3.6:** reducir a la mitad las muertes y lesiones por siniestros de tránsito.
- **Decenio de Acción para la Seguridad Vial 2021–2030** (ONU/OMS), con la meta de reducir un 50 % las muertes
  viales hacia 2030.
