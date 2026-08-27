# Lector · PDFs en voz alta

Abres un PDF y te lo lee. Dos mandos, ni uno más:

1. **Una línea** para ir hacia atrás y hacia adelante en el audio.
2. **Seis velocidades**: 0,75× · 1× · 1,25× · 1,5× · 1,75× · 2×.

(Y el botón de play/pausa, claro.)

> **Aviso honesto:** este código está escrito pero **no compilado**. Se
> desarrolló en Linux, sin Xcode ni Swift, así que no he podido ejecutarlo.
> Espera tener que corregir algún detalle la primera vez que lo abras.

> **¿No tienes un Mac?** Entonces esta app no se puede instalar en tu iPhone:
> Apple obliga a compilarla y firmarla desde un Mac. Hay un camino alternativo
> que funciona solo con el iPhone y que también suena con la pantalla apagada:
> [**SIN-MAC.md**](SIN-MAC.md).

## Qué necesitas

- Un Mac con **Xcode 15 o superior**.
- Un iPhone con **iOS 16 o superior** (o el simulador).
- Una cuenta de Apple gratuita basta para instalarlo en tu propio iPhone. La
  app caduca a los 7 días y se reinstala volviendo a pulsar ▶︎ en Xcode.

## Abrirlo

**Opción A — con XcodeGen (recomendada):**

```bash
cd ios/Lector
brew install xcodegen
xcodegen generate
open Lector.xcodeproj
```

**Opción B — a mano:**

1. Xcode → *File ▸ New ▸ Project… ▸ iOS ▸ App*.
2. Product Name: `Lector`. Interface: **SwiftUI**. Language: **Swift**.
3. Borra el `ContentView.swift` y el `LectorApp.swift` que crea Xcode.
4. Arrastra la carpeta `ios/Lector/Lector/` al proyecto, marcando *Copy items
   if needed* y *Create groups*.
5. En *Signing & Capabilities* elige tu equipo (tu Apple ID sirve) y añade
   **Background Modes ▸ Audio, AirPlay, and Picture in Picture**. Sin eso la
   voz se corta al bloquear la pantalla. (Con la opción A ya viene puesto en el
   `Info.plist`.)

Conecta el iPhone, selecciónalo arriba y pulsa ▶︎.

## Cómo se usa

- **Meter un PDF**: el botón de arriba a la derecha, o desde cualquier otra app
  (Archivos, Safari, Correo, WhatsApp) con *Compartir ▸ Lector*. El PDF se
  copia dentro de la app, así que sigue ahí aunque borres el original.
- **La línea de posición**: arrástrala. Cae siempre al principio de una frase,
  que empezar a media frase suena raro. Debajo verás el tiempo transcurrido, la
  página y lo que queda.
- **La velocidad**: se aplica al momento, sin perder el sitio.
- **Con la pantalla apagada** sigue leyendo. Desde la pantalla de bloqueo o los
  auriculares puedes pausar y saltar (−15 s / +30 s).
- **Se acuerda de dónde ibas** en cada PDF: al volver a abrir la app aparece
  donde lo dejaste, en pausa.

## Dos cosas que conviene saber

**El tiempo que se muestra es una estimación.** El motor de voz no sabe cuánto
va a tardar hasta que lo dice, así que la cuenta sale de los caracteres que
faltan y de la velocidad elegida. Con un texto normal se queda cerca; con
tablas o fórmulas, menos.

**La voz por defecto de iOS es regulera.** Merece muchísimo la pena descargar
una mejor: *Ajustes ▸ Accesibilidad ▸ Contenido hablado ▸ Voces ▸ Español* y
elige una que ponga *Mejorada* o *Premium*. La app detecta el idioma del
documento y coge automáticamente la mejor voz instalada para ese idioma (si el
PDF está en inglés, lo leerá con voz inglesa).

## Qué PDFs valen

Los que tienen texto de verdad. Si el PDF es un **escaneo** (fotos de las
páginas), no hay nada que leer y la app te lo dice; hay que pasarle antes un
OCR. Los PDFs con contraseña tampoco se abren.

## Mapa del código

| Archivo | Qué hace |
|---|---|
| `Models/Book.swift` | Saca el texto del PDF con PDFKit, vuelve a pegar los párrafos partidos línea a línea, quita los números de página y lo trocea en frases. Cada frase guarda en qué carácter del documento empieza: eso es lo que convierte la barra en una posición. |
| `Models/Speed.swift` | Las seis velocidades y su equivalencia con el motor de voz. |
| `Services/SpeechReader.swift` | El motor: mantiene tres frases en cola para que no se oigan silencios, lleva la posición palabra a palabra, y gestiona pausas, saltos e interrupciones (llamadas, auriculares). |
| `Services/SpeechReader+NowPlaying.swift` | Pantalla de bloqueo, centro de control y mandos de los auriculares. |
| `Services/Library.swift` | Copia los PDFs a la carpeta de la app y recuerda posición y velocidad. |
| `Views/ReaderView.swift` | La pantalla entera: frase actual con la palabra resaltada, la línea de posición, play/pausa y las seis velocidades. |
