# Metodología

[🇬🇧 English version](../en/methodology.md) · [← Volver al README](../../README.es.md)

Este documento explica **qué mide Vigía, cómo y por qué**, para que cada número de la app se pueda rastrear hasta
una fórmula, un parámetro de [`web/js/config.js`](../../web/js/config.js) y una referencia.

## 1. Circuito

```
cuadro de cámara → motor → señal del rostro → FatigueMonitor → índice + nivel → alertas / CSV por segundo
```

Todo corre en el navegador. El `FatigueMonitor` ([`fatigue.js`](../../web/js/fatigue.js)) no depende del motor
ni del DOM, así que el mismo código funciona en la app, en los tests y en el simulador.

## 2. Motores de detección

| | MediaPipe Face Landmarker (por defecto) | Cascadas Haar (línea base) |
|---|---|---|
| Método | Malla facial con CNN, 478 puntos 3D (Kartynnik et al., 2019) + blendshapes + matriz de pose | Cascadas de Viola–Jones (2001) |
| Ejecución | WebAssembly + WebGL (GPU, con respaldo en CPU) | OpenCV.js 4.5.2 (WebAssembly) |
| Velocidad objetivo | 30 cuadros/s | 15 cuadros/s sobre un cuadro de 320 px de ancho |
| Estado del ojo | Continuo: EAR | Aproximación binaria: "no se detecta ojo dentro de la cara" |
| Boca | MAR (bostezos) | Solo se dibuja la caja (no se usa para bostezos) |
| Cabeza | Pitch / yaw de la matriz de transformación | Aproximación: desplazamiento vertical de la cara |

El motor Haar reproduce el prototipo original y se mantiene a propósito como **línea base**: los dos motores
exportan el mismo CSV, así se comparan con las mismas métricas. Su debilidad es estructural: la cascada de ojos
se entrenó con ojos *abiertos*, entonces "cerrado" se deduce de una detección fallida, que también ocurre con
anteojos, sombras o la cabeza girada. En una prueba con navegador sin interfaz, el circuito Haar tardó ≈ 21 ms
por cuadro de 320×240 (encontró cara, ambos ojos y boca en una imagen de prueba).

## 3. Señales del rostro

### 3.1 Relación de aspecto del ojo (EAR)

Según Soukupová y Čech (2016), con seis puntos por ojo `[p1 … p6]` (comisura externa, dos puntos del párpado
superior, comisura interna, dos del párpado inferior):

```
EAR = (‖p2 − p6‖ + ‖p3 − p5‖) / (2 · ‖p1 − p4‖)
```

| Ojo (de la persona) | Índices de MediaPipe |
|---|---|
| Derecho | 33, 160, 158, 133, 153, 144 |
| Izquierdo | 362, 385, 387, 263, 373, 380 |

Los puntos de MediaPipe están normalizados entre 0 y 1, así que las distancias se escalan por el ancho y el alto
del cuadro antes de calcular la relación (si no, un cuadro 4:3 deforma el EAR). Vigía usa el promedio de ambos ojos.

### 3.2 Relación de aspecto de la boca (MAR)

Comisuras internas de los labios (78, 308) y tres pares superior/inferior (82–87, 13–14, 312–317):

```
MAR = promedio(‖superiorᵢ − inferiorᵢ‖) / ‖izquierda − derecha‖
```

### 3.3 Pose de la cabeza

Pitch, yaw y roll se extraen de la matriz de transformación facial 4×4 de MediaPipe
(`pitch = atan2(R₂₁, R₂₂)`, `yaw = atan2(−R₂₀, √(R₂₁² + R₂₂²))`). El orden en memoria (por filas o por columnas)
se detecta según dónde está la traslación. Solo se usa la **diferencia con la línea base personal**, así que el
signo no importa, y los ángulos se manejan bien alrededor de ±180°.

### 3.4 Señales extra registradas para análisis

Se registran por segundo los blendshapes `eyeBlinkLeft/Right` y `jawOpen` de MediaPipe. No se usan en el índice
v0.1, pero permiten comparar una señal aprendida con el EAR/MAR geométrico en los cuadernos.

## 4. Calibración personal

Durante los primeros **10 s** la persona mira al frente normalmente. Con al menos **30 cuadros** con cara, la
**mediana** de cada señal pasa a ser la línea base (la mediana ignora los parpadeos durante la calibración). Si no
hay suficientes cuadros, la calibración se repite. Con Haar también se guarda la proporción de cuadros con algún
ojo detectado; si es menor al 60 %, la app avisa que la señal de los ojos es poco confiable.

## 5. Eventos e indicadores

| Indicador | Regla | Parámetro(s) |
|---|---|---|
| Ojo cerrado | MediaPipe: `EAR < 0,65 × EAR base` (0,20 absoluto antes de calibrar). Haar: hay cara pero ningún ojo | `eyeClosedRatio`, `eyeClosedAbsolute` |
| Episodio de cierre | Del primer cuadro cerrado al primer cuadro abierto | — |
| Ruido | Episodio < 50 ms se ignora | `minBlinkMs` |
| Parpadeo | 50 ms ≤ episodio < 800 ms | `longClosureMs` |
| Cierre largo | Episodio ≥ 800 ms (tipo microsueño) | `longClosureMs` |
| Cierre crítico | Ojos todavía cerrados a los 1,5 s → alarma inmediata | `criticalClosureMs` |
| **PERCLOS** | Proporción de cuadros con ojos cerrados en los últimos 60 s (se informa con ≥ 10 s de datos) | `perclosWindowMs`, `perclosMinCoverageMs` |
| Frecuencia de parpadeo | Parpadeos de los últimos 60 s, por minuto | — |
| Duración del parpadeo | Duración media de los parpadeos de los últimos 60 s (≥ 3 parpadeos) | — |
| Bostezo | `MAR ≥ máx(0,5; base + 0,3)` durante ≥ 1,5 s; termina cuando MAR < 80 % del umbral (histéresis) | `yawnMar`, `yawnBaselineMargin`, `yawnMinMs` |
| Desvío de cabeza | `|Δpitch| > 20°` o `|Δyaw| > 30°` durante ≥ 1,5 s (Haar: el centro de la cara se mueve > 0,35 alturas de cara) | `headPitchDeg`, `headYawDeg`, `haarHeadShift`, `headDevMinMs` |
| Rostro perdido | Sin cara durante ≥ 2 s (evento de atención) | `faceLostMs` |
| Pausa | Cuadros separados > 1 s (app en segundo plano) descartan los episodios en curso en vez de sobrecontarlos | `maxGapMs` |

**¿Por qué PERCLOS?** Estudios comparativos para la Federal Highway Administration de EE. UU. encontraron que
PERCLOS era la medida ocular más confiable de somnolencia frente a los lapsos de vigilancia psicomotora
(Wierwille et al., 1994; Dinges y Grace, 1998). La somnolencia además alarga los parpadeos y produce cierres
largos y bostezos, que se suman como señales complementarias.

## 6. Índice de fatiga (heurística v0.1)

Cada indicador se convierte en un componente entre 0 y 1 que **satura** en un nivel documentado:

| Componente | Fórmula | Satura en | Peso |
|---|---|---|---|
| PERCLOS | `PERCLOS / 0,15` | 15 % | **0,45** |
| Cierres largos | `cantidad(últimos 5 min) / 3` | 3 | 0,20 |
| Bostezos | `cantidad(últimos 5 min) / 3` | 3 | 0,15 |
| Duración del parpadeo | `(media − 150 ms) / (400 − 150 ms)` | 400 ms | 0,10 |
| Eventos de cabeza | `(desvíos + 0,5 × rostro perdido) / 3` (últimos 5 min) | 3 | 0,10 |

```
bruto  = 100 × Σ pesoᵢ × componenteᵢ
índice = suavizado exponencial del bruto con τ = 3 s
```

Después de un cierre crítico el índice se mantiene en ≥ 90 durante 10 s.

| Nivel | Índice | Alerta (espera entre repeticiones) |
|---|---|---|
| Alerta | 0–29 | — |
| Fatiga leve | 30–54 | tono suave (2 min) |
| Fatiga moderada | 55–74 | doble tono + voz (45 s) |
| Fatiga alta | 75–100 | tonos fuertes alternados + voz + vibración (12 s) |
| Cierre crítico | cualquiera | igual que alta (4 s) |

Un nivel solo baja cuando el índice queda **5 puntos por debajo** de su piso (histéresis), para evitar parpadeos
de la interfaz.

**Control con patrones simulados** (tests en [`tests/js/fatigue.test.mjs`](../../tests/js/fatigue.test.mjs)):
parpadeo normal (15/min, 150 ms) → índice ≈ 11, *alerta*; parpadeos lentos de 350 ms → ≈ 43, *leve*; parpadeos
lentos + cierres largos + bostezos → ≈ 88, *alta*.

> Estos pesos son una **heurística transparente y fijada a mano** según la literatura, no un modelo validado.
> Reemplazarlos por un modelo ajustado con datos etiquetados es el centro de la hoja de ruta (§ 9).

## 7. Datos de salida (CSV por segundo)

Solo se exportan números agregados: ni imágenes ni puntos de la cara.

| Columna | Significado |
|---|---|
| `t_s` | Segundos desde que empezó el monitoreo |
| `engine` | `mediapipe`, `haar` o `synthetic` |
| `fps` | Cuadros procesados en ese segundo |
| `proc_ms` | Tiempo medio de procesamiento por cuadro (ms) |
| `face_ratio` | Proporción de cuadros con cara |
| `ear_mean`, `mar_max` | EAR medio, MAR máximo |
| `eye_closed_ratio` | Proporción de cuadros con ojos cerrados |
| `blink_score_mean`, `jaw_open_max` | Blendshapes de MediaPipe |
| `pitch_mean`, `yaw_mean` | Pose de la cabeza (grados) |
| `perclos_60s`, `blink_rate_min`, `avg_blink_ms` | Indicadores móviles |
| `blinks`, `long_closures`, `yawns`, `head_deviations`, `face_lost`, `critical_closures` | Eventos en ese segundo |
| `c_perclos`, `c_long_closures`, `c_yawns`, `c_blink_duration`, `c_head` | Aporte de cada componente al índice (puntos, antes del suavizado) |
| `score`, `level` | Índice y nivel de fatiga |

## 8. Calidad del software

- **Tests unitarios:** 31 tests de JavaScript (`npm test`) y 15 de Python (`pytest`).
- **Casos compartidos:** [`tests/fixtures/metrics_cases.json`](../../tests/fixtures/metrics_cases.json) lo usan
  los dos lenguajes, así el navegador y Python calculan exactamente el mismo EAR y MAR.
- **Test de esquema:** Python verifica que sus columnas coincidan con `CSV_COLUMNS` de `session.js`.
- **Simulador:** [`scripts/simulate_session.mjs`](../../scripts/simulate_session.mjs) alimenta el
  `FatigueMonitor` real con un viaje sintético reproducible (con semilla).
- **Estudio de simulación:** [`scripts/simulation_study.mjs`](../../scripts/simulation_study.mjs) evalúa la lógica
  con conductores sintéticos de verdad conocida; resultados en el [informe de ciencia de datos](informe-ciencia-de-datos.md).
- **Prueba en navegador:** el motor Haar se probó de punta a punta en Chrome sin interfaz con una cámara simulada
  (calibración → monitoreo a 15 cuadros/s → resumen → descarga del CSV), y se confirmó que la CSP bloquea el
  servidor de métricas de MediaPipe.

## 9. Plan de evaluación

Los datos sintéticos solo prueban que el circuito funciona. Para afirmar que Vigía detecta fatiga hace falta evidencia:

1. **Datasets públicos** (revisar cada licencia; la mayoría son solo para investigación):
   UTA-RLDD (Ghoddoosian et al., 2019), NTHU-DDD (Weng et al., 2016) y YawDD (Abtahi et al., 2014).
2. **Etiquetas independientes:** escala de somnolencia de Karolinska (KSS, 1–9; Åkerstedt y Gillberg, 1990) cada
   5 min y un test de vigilancia psicomotora de 3 minutos (PVT-B; Basner et al., 2011), nunca medidos por la
   propia cámara.
3. **Métricas:**
   - Eventos (parpadeos, cierres largos, bostezos): precisión, recall y F1 contra anotación manual.
   - Ventanas somnoliento vs. alerta: ROC-AUC y **falsas alarmas por hora** (clave para que la gente confíe).
   - Umbrales elegidos con datos de validación (por ejemplo, ROC / índice de Youden), nunca con el conjunto de prueba.
4. **Sin fuga de datos:** validación cruzada **agrupada por persona** (`GroupKFold`), así el modelo siempre se
   evalúa con personas que nunca vio.
5. **Equidad:** reportar resultados por subgrupo cuando haya etiquetas (anteojos, iluminación, tono de piel,
   sexo, rango de edad).
6. **Modelo:** empezar con una regresión logística sobre rasgos por minuto (interpretable y fácil de exportar a
   JavaScript) y compararla con la heurística v0.1 como línea base.

## 10. Referencias

Ver la [lista completa en la versión en inglés](../en/methodology.md#10-references) (los títulos de los trabajos
se mantienen en su idioma original).
