# Mis apps

En este repositorio viven dos apps distintas, las dos en español y sin cuentas
ni servidores: lo que guardas se queda en tu dispositivo.

- **Organizador** — calendario, rutinas y tareas con alarmas. Hay versión web
  ([`web/`](web/)) y app nativa de iOS ([`ios/`](ios/)). Es de lo que habla el
  resto de este README.
- **Lector** ([`ios/Lector/`](ios/Lector/)) — abre un PDF y te lo lee en voz
  alta, como un audiolibro: una línea para moverte por el audio y seis
  velocidades. App nativa de iOS.

---

# Organizador

Calendario, rutinas diarias y tareas puntuales, con alarmas. En español y sin
cuentas: los datos se quedan en tu dispositivo.

Hay dos versiones que comparten el mismo modelo de datos:

| | [`web/`](web/) — app web (PWA) | [`ios/`](ios/) — app nativa |
|---|---|---|
| **Cómo se instala** | Se abre en Safari y se añade a la pantalla de inicio | Xcode + tu iPhone |
| **Alarmas con el móvil bloqueado** | No (hay que pasar la agenda al Calendario de iOS) | Sí, notificaciones locales |
| **Estado** | Probada y funcionando | Escrita pero **sin compilar** — no había Xcode en el entorno |

## Los tres tipos de cosas

- **Evento** — una cita con hora: el dentista, una reunión, un viaje de varios días.
- **Tarea** — algo que se hace una vez y se acaba. Con fecha o sin ella (entonces
  se queda en la bandeja de entrada).
- **Rutina** — algo que se repite: la medicación cada mañana, el gimnasio los
  lunes/miércoles/viernes, el alquiler el día 1. Se marca día a día y la app
  lleva la cuenta de la racha.

Cualquiera de los tres admite varias alarmas (a la hora, 10 min antes, 1 día
antes…).

## Alarmas en el iPhone

Esto es lo que más condiciona el diseño, así que conviene ser claro:

**Una app web no puede despertarse sola en segundo plano en iOS** sin un servidor
de notificaciones push. Como quisiste que los datos no salieran del dispositivo,
no hay servidor. Así que la PWA:

- **Sí** suena (timbre + vibración + notificación) mientras la tienes abierta.
- **No** puede sonar sola con la pantalla bloqueada.

Para que el iPhone te avise de verdad hay dos caminos, y la app cubre los dos:

1. **Exportar al Calendario de iOS.** En *Ajustes ▸ Enviar al Calendario del
   iPhone*, elige `Calendario` en el menú de compartir y confirma. Tus alarmas
   se convierten en alertas nativas del sistema. Repítelo cuando cambies cosas.
2. **La app nativa** de [`ios/`](ios/), que programa notificaciones locales de
   verdad.

## Empezar con la app web

Es HTML, CSS y JavaScript sin dependencias ni compilación. Cualquier servidor
estático vale:

```bash
cd web
python3 -m http.server 8000
# y abre http://localhost:8000
```

Para usarla en el iPhone tiene que estar en **https** (o en `localhost`).
GitHub Pages apuntando a la carpeta `web/` funciona bien. Una vez abierta en
Safari: *Compartir ▸ Añadir a pantalla de inicio*. A partir de ahí se abre a
pantalla completa y funciona sin conexión.

### Pruebas

```bash
node web/test/logic.test.mjs
```

Cubre las fechas, la persistencia, las reglas de repetición, el cálculo de
alarmas y el ida y vuelta completo del formato `.ics` (incluido el plegado de
líneas y los eventos de día completo).

## Estructura

```
web/
  index.html, styles.css, manifest.webmanifest, sw.js
  js/
    store.js       Estado y persistencia en localStorage
    dates.js       Utilidades de fecha en hora local
    agenda.js      Expansión de repeticiones y ocurrencias de un día
    ics.js         Generación e importación de .ics (RFC 5545)
    alarms.js      Timbre, notificaciones y bucle de comprobación
    editor.js      Alta y edición de los tres tipos
    views/         Hoy, Calendario, Tareas, Rutinas, Ajustes
  test/logic.test.mjs
ios/
  project.yml      Proyecto para XcodeGen
  Organizador/     SwiftUI + UserNotifications
  Lector/          La otra app: PDFs en voz alta (proyecto aparte)
```

## Copias de seguridad

Ajustes ▸ *Guardar copia de seguridad (.json)* descarga todo. Si borras los datos
del navegador o cambias de móvil, se restaura desde ahí. Es la única red de
seguridad que hay: sin servidor, no hay nada en la nube.
