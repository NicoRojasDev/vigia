# Privacidad, legalidad y uso seguro

[🇬🇧 English version](../en/privacy-and-legal.md) · [← Volver al README](../../README.es.md)

> **Aviso:** este documento describe cómo se diseñó Vigía para respetar la normativa argentina. Es un análisis
> de un estudiante, **no es asesoramiento legal**. Antes de cualquier uso comercial, institucional o con datos de
> terceros, consultá con un/a abogado/a. Normativa revisada en noviembre de 2026.

## 1. Resumen: qué pasa con los datos

| Dato | Dónde se procesa | ¿Se guarda? | ¿Se envía? |
|---|---|---|---|
| Imagen de la cámara | En la memoria del navegador, cuadro a cuadro | **No** | **No** |
| Puntos de la cara (landmarks) | En memoria, solo para dibujar el cuadro actual | **No** | **No** |
| Números por segundo (EAR, PERCLOS, índice…) | En memoria durante la sesión | Solo si la persona toca *Descargar CSV*, y queda **en su dispositivo** | **No** |
| Un CSV abierto en el Laboratorio | Se lee en el navegador (FileReader) | Solo en memoria | **No** |
| Identidad (nombre, cuenta, ubicación) | — | No se pide | No |

- **Sin cuentas, cookies, `localStorage`, analíticas ni seguimiento.**
- **Sin reconocimiento facial:** Vigía no identifica personas ni crea plantillas biométricas; solo mide apertura
  de ojos y boca y la orientación de la cabeza.
- **Borrar es simple:** *Borrar* / *Borrar todo* en la pestaña *Mis datos*, refrescar o cerrar la página elimina todo lo que había en memoria.

### Conexiones de red

La página solo descarga **archivos estáticos**:

| Servicio | Para qué | Qué ve el proveedor |
|---|---|---|
| GitHub Pages | Sirve la página | La IP y el navegador, como cualquier sitio web |
| cdn.jsdelivr.net | Código de MediaPipe (`@mediapipe/tasks-vision@1.2.3`) | Ídem |
| storage.googleapis.com | Modelo `face_landmarker.task` | Ídem |

El motor clásico (Haar) no descarga nada externo: OpenCV.js y las cascadas están en el repositorio.

### Hallazgo importante: las métricas de uso de MediaPipe

El aviso de privacidad del paquete [`@mediapipe/tasks-vision`](https://www.npmjs.com/package/@mediapipe/tasks-vision)
aclara que **las imágenes se procesan en el dispositivo y no se envían a Google**, pero que la librería **sí envía
métricas de rendimiento y uso** de la API a Google, y que **quien desarrolla la app es responsable de obtener el
consentimiento informado** de sus usuarios para eso. Revisando el código de la versión 1.2.3 se ve que esas métricas
se envían por `POST` a `odml.pa.googleapis.com`.

**Decisión de diseño:** en lugar de pedir un consentimiento extra, Vigía **bloquea esa conexión**. El
`index.html` define una *Content-Security-Policy* cuya directiva `connect-src` solo permite el propio sitio, los
dos hosts de la tabla anterior y `data:` (que usa OpenCV.js para leer su propio WebAssembly, sin red). El
navegador rechaza cualquier otra conexión, y lo verificamos con un test automatizado: la solicitud a
`odml.pa.googleapis.com` queda bloqueada por la política.

> Si hacés un *fork* y quitás o ampliás esa política, tenés que informar y pedir consentimiento por las métricas
> de MediaPipe.

## 2. Marco legal argentino aplicado al diseño

### 2.1 Protección de datos personales — [Ley 25.326](https://www.argentina.gob.ar/normativa/nacional/ley-25326-2000-64790/actualizacion)

La Ley 25.326 sigue vigente. Aunque hay proyectos de reforma en el Congreso, [no generan obligaciones
actuales](https://abogados.com.ar/nuevo-proyecto-de-ley-de-proteccion-de-datos-personales/39762).

Cómo la tiene en cuenta Vigía:

- **Consentimiento informado (art. 5):** antes de encender la cámara se muestra una lista de verificación que
  explica qué se procesa y cómo; sin marcar "Entiendo y acepto" no se puede iniciar.
- **Finalidad y minimización:** solo se calculan los números necesarios para estimar fatiga. No se guardan
  imágenes ni puntos de la cara.
- **Sin base de datos del desarrollador:** como nada sale del dispositivo, el autor no recibe ni almacena datos
  de nadie. La persona usuaria es la única que decide si exporta su CSV.
- **Seguridad:** el procesamiento es local y la política de seguridad del navegador impide fugas por red.

### 2.2 Datos biométricos y datos sensibles

- La [Resolución AAIP 4/2019](https://argentina.gob.ar/normativa/318874_res4AAIP_pdf/archivo) define los datos
  biométricos y establece que se consideran **sensibles** cuando pueden revelar datos
  [potencialmente discriminatorios](https://abogados.com.ar/mejores-practicas-en-la-aplicacion-de-la-ley-de-proteccion-de-datos-personales-resolucion-42019-de-la-agencia-de-acceso-a-la-informacion-publica/23000?tech=1).
- Argentina adhirió al Convenio 108 (Ley 27.483) y al **Convenio 108+** por la
  [Ley 27.699](https://abogados.com.ar/importante-novedad-en-proteccion-de-datos-personales-el-congreso-convirtio-en-ley-la-adhesion-de-argentina-al-convenio-108/31613),
  que amplía las categorías especiales para incluir datos biométricos; la AAIP aplica ese criterio cuando los
  datos [identifican unívocamente a una persona y revelan información sobre su salud o fisiología](https://www.marval.com/Publicacion/nuevo-criterio-orientador-e-indicador-de-mejores-practicas-para-el-tratamiento-de-datos-geneticos-15393?lang=es).

El nivel de fatiga es información fisiológica. Por eso Vigía la trata con el máximo cuidado aunque **no identifica
a nadie**: se calcula en el momento, se queda en el dispositivo y nunca se vincula a una identidad.

### 2.3 Tránsito — [Ley 24.449](https://www.argentina.gob.ar/normativa/nacional/ley-24449-818/actualizacion)

- El **art. 48 inc. x** prohíbe [conducir usando auriculares y sistemas de comunicación de operación manual
  continua](https://www.iprofesional.com/actualidad/447454-multas-por-usar-el-celular-con-el-auto-detenido-de-cuanto-es-y-que-debes-saber),
  y el **art. 39** exige conducir con ambas manos en el volante.

Decisiones de diseño:

| Requisito | Cómo lo resuelve Vigía |
|---|---|
| No manipular el teléfono | Se configura **con el vehículo detenido**; después funciona solo, sin tocar nada |
| No usar auriculares | Las alertas suenan por el **parlante**; la app lo recuerda antes de empezar |
| No distraer | El *modo conducción* muestra solo un número, un color y una frase |
| Visión libre | La lista de verificación pide un **soporte fijo** que no tape la visión ni los espejos |

Cada provincia y municipio adhiere a la ley nacional y puede tener normas propias: revisá las de tu jurisdicción.

### 2.4 No es un producto médico — ANMAT

La Disposición ANMAT 64/2025 incorporó la definición MERCOSUR de
[software como producto médico (SaMD)](https://abogados.com.ar/inteligencia-artificial-y-software-medico-en-argentina-desafios-regulatorios-para-el-regimen-de-productos-medicos/40131):
software destinado por su fabricante a una finalidad médica.

Vigía **no tiene finalidad médica**: no diagnostica trastornos del sueño ni ninguna enfermedad, no indica
tratamientos y no reemplaza una consulta. Es una herramienta educativa de seguridad vial. Por eso:

- La app y la documentación lo aclaran en cada pantalla relevante.
- No se usan frases como "detecta apnea del sueño" o "previene accidentes". Vigía **alerta** sobre signos de fatiga.

### 2.5 Propiedad intelectual — Ley 11.723 y licencias

El código propio usa la licencia MIT. Los componentes de terceros conservan sus licencias y avisos
(Apache 2.0 para OpenCV y MediaPipe; licencias tipo BSD para las cascadas Haar). Ver
[THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md). Los sonidos se generan por código: no hay audios de terceros.

### 2.6 Usos que quedan fuera

Vigía está pensado para **uso personal y voluntario**. Usarlo para controlar empleados, sancionar, fijar primas de
seguro o identificar personas implica otras obligaciones (laborales y de datos personales) y **no está contemplado**.
Ver [ética y limitaciones](etica-y-limitaciones.md).

## 3. Antes de juntar datos de otras personas (próximas etapas)

La hoja de ruta incluye un piloto para validar el detector. Antes de recolectar cualquier dato de terceros:

- [ ] Consentimiento libre, expreso e informado **por escrito** (art. 5, Ley 25.326), revocable en cualquier momento.
- [ ] Solo **personas mayores de edad**.
- [ ] Guardar **solo métricas**, nunca video, salvo consentimiento específico y separado.
- [ ] Datos **disociados** (sin nombre ni nada que permita identificar a la persona).
- [ ] Derechos de acceso, rectificación y supresión con un canal de contacto claro.
- [ ] Revisar si corresponde inscribir la base de datos ante la AAIP.
- [ ] Si es un trabajo académico, aval de la institución (por ejemplo, el ITSE).
- [ ] **Nunca** hacer pruebas manejando en la vía pública: el piloto se hace en simulador o con el vehículo detenido.

## 4. Guía de uso seguro

1. Dormí bien antes de viajar. Vigía no reemplaza el descanso.
2. Configurá todo **con el vehículo detenido**: soporte fijo, cámara mirando tu cara, volumen alto.
3. Tocá *Iniciar*, aceptá la lista y mirá al frente 10 segundos para calibrar.
4. Activá el *modo conducción* y no vuelvas a tocar el teléfono mientras manejás.
5. Si suena una alerta de fatiga **moderada o alta, detenete en un lugar seguro y descansá.** Una siesta corta y
   salir del vehículo ayudan; seguir manejando "un poco más" no.
6. Si sentís sueño, **no esperes a que suene la alarma**.

## 5. Contacto

Dudas o reportes sobre privacidad: abrí un *issue* en
[github.com/NicoRojasDev/vigia](https://github.com/NicoRojasDev/vigia/issues).
