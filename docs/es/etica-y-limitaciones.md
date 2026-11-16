# Ética y limitaciones (ficha del modelo)

[🇬🇧 English version](../en/ethics-and-limitations.md) · [← Volver al README](../../README.es.md)

## Uso previsto

- **Quién:** personas adultas que manejan y eligen usarlo, sobre todo en viajes largos o nocturnos.
- **Para qué:** un aviso extra y temprano cuando aparecen signos visibles de fatiga (cierres largos de ojos,
  PERCLOS en aumento, bostezos, cabeceos), para que la persona decida parar y descansar.
- **Cómo:** uso personal y voluntario, en el propio teléfono, con todo procesado en el dispositivo.

## Fuera de alcance (no usar Vigía para)

- ❌ Controlar, rankear o sancionar a empleados, ni como prueba en ningún conflicto.
- ❌ Fijar precios de seguros, otorgar créditos o tomar cualquier decisión sobre una persona.
- ❌ Identificar personas (Vigía no tiene reconocimiento facial y este proyecto no debe ampliarse en ese sentido).
- ❌ Diagnosticar trastornos del sueño ni ninguna condición médica.
- ❌ Detectar alcohol, drogas o distracción por usar el celular. Son problemas distintos.
- ❌ Reemplazar el descanso, los límites legales de horas de manejo o un sistema de seguridad certificado.

## Factores que afectan el rendimiento

| Factor | Efecto |
|---|---|
| Poca luz / noche | Las cámaras comunes no tienen infrarrojo; de noche puede no detectarse la cara |
| Anteojos de sol, lentes polarizados o con reflejos | Los ojos pueden no verse → EAR poco confiable; Haar puede marcar "ojos cerrados" |
| Posición de la cámara | Un ángulo bajo o lateral deforma el EAR y la pose; la calibración lo reduce pero no lo elimina |
| Vibraciones y pozos | Cuadros movidos y pérdidas breves de la cara |
| Hablar, cantar, reír | Puede parecer un bostezo (MAR) o cambiar la forma del ojo |
| Mirar los espejos | Giros esperables; los cortos se ignoran, los de ≥ 1,5 s cuentan como evento |
| Potencia del equipo | Los teléfonos lentos procesan menos cuadros y pueden perder parpadeos muy cortos |
| Motor | La línea base Haar es mucho menos confiable que MediaPipe (ver metodología) |

## Riesgos y mitigaciones

| Riesgo | Por qué importa | Mitigación en v0.1 |
|---|---|---|
| **Falsos negativos** (no avisa estando con sueño) | Es el error más peligroso | Mensaje claro de que Vigía no reemplaza el descanso; alarma inmediata con ojos cerrados ≥ 1,5 s; la hoja de ruta mide primero el recall |
| **Falsos positivos** | La gente ignora o apaga una app que avisa de más ("fatiga de alarmas") | Calibración personal, duraciones mínimas, histéresis y esperas entre alertas |
| **Sobreconfianza / compensación del riesgo** | "Puedo seguir manejando, la app me avisa" | Cada pantalla y alerta indica parar y descansar; no se premia manejar más tiempo |
| **Distracción** | Mirar o tocar el teléfono mientras se maneja | Diseño manos libres, modo conducción mínimo, configuración solo con el vehículo detenido |
| **Rendimiento desigual** | Los detectores pueden funcionar peor con algunas caras, tonos de piel, edades o con anteojos | La ficha del modelo Face Mesh V2 de MediaPipe informa una evaluación de equidad por regiones; Vigía reportará sus propios resultados por subgrupo cuando tenga datos etiquetados |
| **Privacidad** | La fatiga es información fisiológica | Procesamiento local, sin guardar imágenes ni puntos de la cara, CSP que bloquea conexiones salientes |

## Limitaciones técnicas conocidas (v0.1)

- Los umbrales y los pesos del índice son **valores por defecto tomados de la literatura, sin validar** con datos etiquetados.
- El PERCLOS se aproxima con el EAR (no con la cobertura de la pupila como en la medición original de laboratorio).
- El índice de fatiga es una heurística: sus valores no son probabilidades.
- MediaPipe necesita conexión a internet la primera vez (para descargar la librería y el modelo).
- La app tiene que quedar en primer plano y con la pantalla encendida; los navegadores pausan la cámara en segundo plano.

## Transparencia

Todos los umbrales están en [`web/js/config.js`](../../web/js/config.js), cada fórmula está en la
[metodología](metodologia.md) y el código es abierto con licencia MIT. Comentarios y reportes de errores son
bienvenidos a través de los *issues* de GitHub.
