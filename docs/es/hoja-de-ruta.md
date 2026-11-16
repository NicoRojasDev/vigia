# Hoja de ruta

[🇬🇧 English version](../en/roadmap.md) · [← Volver al README](../../README.es.md)

## ✅ v0.1 — Bases (actual)

- [x] App web con dos motores: MediaPipe Face Landmarker y la línea base clásica Haar con OpenCV.js
- [x] EAR, MAR, pose de cabeza, calibración personal, parpadeos, cierres largos y críticos, PERCLOS, bostezos y cabeceos
- [x] Índice de fatiga 0–100 transparente, con 4 niveles y alertas escalonadas (sonido, voz, vibración)
- [x] Modo conducción manos libres, pantalla siempre encendida y lista de seguridad antes de salir
- [x] Privacidad desde el diseño: procesamiento local, sesión en memoria y CSP que bloquea conexiones salientes
- [x] Exportación CSV/JSON por segundo, paquete de Python, simulador de sesiones sintéticas y primer cuaderno de análisis
- [x] Pestaña *Mis datos* (en memoria, se borra al refrescar) y *Laboratorio de datos* con informe automático bilingüe
- [x] Estudio de simulación con verdad conocida (umbral, cuadros por segundo, calibración, validez del índice) e informe
- [x] Tests de JS y Python con casos compartidos; GitHub Actions para tests y publicación en Pages
- [x] Documentación bilingüe: problemática e impacto, metodología, privacidad y legal, ética y limitaciones

## v0.2 — Comparación (benchmark)

- [ ] `02_benchmark.ipynb`: correr ambos motores sobre un dataset público de somnolencia (sin conexión, desde videos)
- [ ] Métricas por evento (precisión, recall, F1) y falsas alarmas por hora, Haar vs. MediaPipe
- [ ] Ajustar `eyeClosedRatio`, `yawnMar` y otros con curvas ROC sobre un conjunto de validación
- [ ] Tabla de resultados en el README

## v0.3 — Sin conexión e instalable

- [ ] Alojar el WebAssembly y el modelo de MediaPipe en el propio sitio, para que `connect-src` sea solo `'self'`
- [ ] Service worker + manifiesto (PWA instalable que funcione sin señal en la ruta)
- [ ] Compilación opcional de OpenCV.js sin `unsafe-eval`

## v0.4 — Piloto con etiquetas independientes (voluntario)

- [ ] Test de reacción PVT de 3 minutos y autoevaluación KSS dentro de la app, solo **con el vehículo detenido**
- [ ] Pantalla de consentimiento específica; los datos quedan en el dispositivo salvo que la persona decida compartirlos
- [ ] Protocolo según la lista de [privacidad y legal § 3](privacidad-y-legal.md#3-antes-de-juntar-datos-de-otras-personas-próximas-etapas)

## v0.5 — Modelo entrenado

- [ ] Rasgos por minuto → regresión logística con validación cruzada por persona (`GroupKFold`)
- [ ] Exportar los coeficientes a JSON y cargarlos en el navegador
- [ ] Comparar con la heurística v0.1 y dejar la mejor por defecto

## Ideas

- Recordatorios de tiempo de manejo y pausas
- Consejos para manejo nocturno y aviso de poca luz
- Auditoría de accesibilidad (lectores de pantalla, paletas para daltonismo) e interfaz en portugués para la región
