# Lector

Escucha tus PDF como si fueran audiolibros. Abres el archivo, le das al play y
el móvil te lo lee en voz alta. Sin cuentas, sin subir nada a ningún sitio: el
PDF se lee dentro del propio navegador y ahí se queda.

```bash
cd lector
python3 -m http.server 8000
# y abre http://localhost:8000
```

En el iPhone: ábrelo en Safari (en **https** o en `localhost`) y *Compartir ▸
Añadir a pantalla de inicio*. A partir de ahí funciona sin conexión.

## Qué hace

- **Añadir un PDF** — tócalo o arrástralo. Saca el texto, quita los encabezados
  y los números de página que se repiten, y lo parte en frases.
- **Leer en voz alta** de corrido, página tras página, con la frase que suena
  resaltada. Tocando cualquier otra frase, salta ahí.
- **Retomar** donde lo dejaste. Cada libro guarda su posición.
- **Velocidad y voz** — de 0,5× a 2,5×. Si el PDF está en español, propone
  primero las voces en español, aunque el móvil esté en otro idioma.
- **Biblioteca** con el porcentaje leído y lo que queda por escuchar.

## Lo que conviene saber

- **La voz la pone el sistema, no la app.** En el iPhone, *Ajustes ▸
  Accesibilidad ▸ Contenido hablado ▸ Voces ▸ Español* permite descargar voces
  mucho mejores que la que viene de fábrica. Merece la pena.
- **Con la pantalla apagada se para.** Safari corta la síntesis de voz en
  cuanto la app deja de estar en primer plano, y no hay manera de evitarlo
  desde una app web. Mientras esté abierta, la app pide mantener la pantalla
  encendida.
- **Los PDF escaneados no valen.** Si el PDF son fotos de las páginas y no
  texto, no hay nada que leer. La app lo dice al abrirlo.
- **Todo se queda en el dispositivo.** El texto extraído y la posición se
  guardan en IndexedDB. Si borras los datos del navegador, desaparecen.

## Pruebas

```bash
node lector/test/logic.test.mjs
```

Cubre la limpieza del texto, el corte en frases (con abreviaturas, iniciales y
decimales), la unión de líneas partidas por guion, el borrado de encabezados y
pies repetidos, el troceado para el sintetizador, la detección de idioma y el
recorrido del lector por el libro.

## Estructura

```
lector/
  index.html, styles.css, manifest.webmanifest, sw.js
  js/
    text.js      Limpieza, frases, párrafos e idioma (todo funciones puras)
    extract.js   PDF → líneas → párrafos, con pdf.js
    speech.js    Motor de lectura sobre speechSynthesis
    store.js     Biblioteca y posición en IndexedDB
    app.js       Biblioteca, reproductor y ajustes
  vendor/pdfjs/  pdf.js de Mozilla (Apache 2.0), copiado tal cual
  test/logic.test.mjs
```

`vendor/pdfjs/` es la distribución `legacy` de [pdf.js](https://mozilla.github.io/pdf.js/)
4.7.76, incluida aquí para que la app funcione sin conexión y sin depender de
ningún CDN.
