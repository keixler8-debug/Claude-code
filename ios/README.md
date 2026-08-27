# Organizador · app nativa de iOS

> Esta carpeta contiene **dos** apps independientes: la de aquí (Organizador) y
> [`Lector/`](Lector/), que lee PDFs en voz alta. Cada una tiene su propio
> proyecto de Xcode.

Esta es la versión que hace **sonar alarmas de verdad**: notificaciones locales
del sistema, con el iPhone bloqueado, sin conexión y sin ningún servidor.

> **Aviso honesto:** este código está escrito pero **no compilado**. Se
> desarrolló en un entorno Linux sin Xcode ni cadena de herramientas de Swift,
> así que no he podido ejecutarlo ni probarlo. Espera tener que corregir algún
> detalle la primera vez que lo abras en Xcode. La versión web (`../web/`) sí
> está probada y funcionando.

## Qué necesitas

- Un Mac con **Xcode 15 o superior**.
- Un iPhone con **iOS 16 o superior** (o el simulador).
- Una cuenta de Apple gratuita basta para instalarlo en tu propio iPhone; la app
  caduca a los 7 días y se reinstala volviendo a pulsar ▶︎ en Xcode.

## Abrirlo

**Opción A — con XcodeGen (recomendada):**

```bash
cd ios
brew install xcodegen
xcodegen generate
open Organizador.xcodeproj
```

**Opción B — a mano, sin instalar nada:**

1. Xcode → *File ▸ New ▸ Project… ▸ iOS ▸ App*.
2. Product Name: `Organizador`. Interface: **SwiftUI**. Language: **Swift**.
   Marca *Use Core Data*: **no**.
3. Borra el `ContentView.swift` y el `OrganizadorApp.swift` que crea Xcode.
4. Arrastra la carpeta `ios/Organizador/` al proyecto, marcando
   *Copy items if needed* y *Create groups*.
5. En *Signing & Capabilities* elige tu equipo (tu Apple ID sirve).

En ambos casos: conecta el iPhone, selecciónalo arriba y pulsa ▶︎.

## Alarmas

La app pide permiso de notificaciones al arrancar. A partir de ahí, cada alarma
que pongas en un evento, tarea o rutina se programa como notificación local.

Detalles que conviene saber:

- **iOS solo admite 64 notificaciones pendientes por app.** La app usa
  disparadores repetitivos para las rutinas regulares (una sola notificación
  cubre "todos los días a las 8:00" indefinidamente) y reserva el resto del cupo
  para los avisos con fecha más cercanos. Se reprograma todo cada vez que
  cambias algo y cada vez que vuelves a abrir la app.
- **Modos de concentración.** Para que las alarmas atraviesen "No molestar",
  añade en Xcode la capacidad *Time Sensitive Notifications*
  (*Signing & Capabilities ▸ + Capability*). El código ya marca los avisos como
  `.timeSensitive`; sin el permiso simplemente se comporta como una
  notificación normal.
- **Sonido con el móvil en silencio.** Eso requiere *Critical Alerts*, que Apple
  solo concede pidiéndoselo explícitamente. No está incluido.
- Las rutinas **sin hora concreta** no pueden sonar: son una lista de pendientes
  del día.

## Compartir datos con la versión web

Ajustes ▸ *Compartir mi calendario (.ics)* exporta todo, y
*Importar un archivo .ics* lo lee de vuelta. Es el mismo formato que usa la app
web, así que puedes mover tu agenda de una a otra (y a la app Calendario de
iOS).

Los datos **no se sincronizan solos** entre la web y esta app: cada una guarda lo
suyo en su propio dispositivo. El `.ics` es el puente manual.

## Mapa del código

| Archivo | Qué hace |
|---|---|
| `Models/Models.swift` | Tipos: `Event`, `TaskItem`, `Routine`, `RecurrenceRule`, `Occurrence`. La lógica de "¿toca hoy esta rutina?" vive en `Routine.occurs(on:)`. |
| `Models/Store.swift` | Estado de la app y persistencia en un JSON dentro de Documentos. |
| `Services/NotificationService.swift` | Programación de las alarmas y reparto del cupo de 64. |
| `Services/ICSService.swift` | Exportación e importación de `.ics`. |
| `Views/RootView.swift` | Las cinco pestañas. |
| `Views/EditorView.swift` | Alta y edición de los tres tipos. |
| `Views/ItemRow.swift`, `OccurrenceRow.swift` | La fila que usan todas las listas. |
