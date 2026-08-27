# Escuchar PDFs sin Mac, con el móvil en el bolsillo

La app de esta carpeta necesita un Mac para compilarse. Si no lo tienes, hay un
camino que funciona **hoy, solo con el iPhone**, y que cumple lo importante:
suena con la pantalla apagada y el móvil en el bolsillo.

## Por qué hace falta este rodeo

Una app web (de esas que se añaden a la pantalla de inicio desde Safari) puede
leer texto en voz alta, pero **el motor de voz del navegador se calla en cuanto
bloqueas la pantalla**. Es una limitación de iOS, no algo que se pueda
programar mejor.

Un **archivo de audio**, en cambio, sí sigue sonando bloqueado, con sus mandos
en la pantalla de bloqueo. Así que en vez de leer el PDF en el momento, lo
convertimos antes en audio y luego lo escuchamos como cualquier audiolibro.

Y lo mejor: el iPhone sabe hacer esa conversión él solo, con las voces de Apple
—que son mejores que cualquier cosa que pudiera meter yo en una app—, usando la
app **Atajos**, que ya viene instalada.

## Lo que vas a montar

1. Un atajo llamado **Lector**, con su icono en la pantalla de inicio. Le das un
   PDF y te devuelve el audio.
2. **VLC** (gratis, App Store) para escucharlo: barra de posición, control de
   velocidad, sigue sonando con la pantalla apagada y se acuerda de por dónde
   ibas.

## Antes de empezar: una voz decente

La voz por defecto canta bastante. Merece la pena, y es gratis:

*Ajustes ▸ Accesibilidad ▸ Contenido hablado ▸ Voces ▸ Español* → elige una que
ponga **Mejorada** o **Premium** y espera a que se descargue.

## El atajo, paso a paso

Abre **Atajos ▸ +** (arriba a la derecha) y ve añadiendo estas acciones. Para
encontrarlas, escribe la palabra en negrita en el buscador de acciones.

| # | Busca | Acción | Ajustes |
|---|---|---|---|
| 1 | **PDF** | *Obtener texto del PDF* (Get Text from PDF) | Déjala apuntando a "Entrada del atajo". Si tiene la opción de ignorar cabeceras y pies de página, actívala: quita los números de página, que leídos en voz alta molestan. |
| 2 | **hablado** o **audio** | *Crear audio hablado a partir del texto* (Make Spoken Audio from Text) | Toca la flecha para desplegar opciones y elige la voz que descargaste. **Deja la velocidad en normal**: la velocidad se cambia luego al escuchar, y así no hay que reconvertir nada. |
| 3 | **guardar** | *Guardar archivo* (Save File) | Destino: *En mi iPhone* (o iCloud Drive), carpeta `Audiolibros`. Desactiva "Preguntar dónde guardar" para que no te pregunte cada vez. |

Luego, arriba del todo, toca el nombre del atajo y:

- Ponle **Lector** y elige icono y color.
- Activa **"Mostrar en la hoja para compartir"** (Share Sheet). Eso hace que
  aparezca en *Compartir ▸ Lector* desde cualquier PDF, en Archivos, Safari,
  Correo o WhatsApp.
- En *Compartir ▸ Añadir a la pantalla de inicio* te queda con su icono, igual
  que una app.

### Si el PDF es largo

Un libro entero de una sentada puede tardar mucho o quedarse a medias. En ese
caso, mete dos pasos más entre el 1 y el 2 para trocearlo por páginas:

| # | Busca | Acción | Ajustes |
|---|---|---|---|
| 1b | **preguntar** | *Pedir información* (Ask for Input) ×2 | Tipo **Número**. Una pregunta "¿Desde qué página?" y otra "¿Hasta qué página?". |
| 1c | **elementos** | *Obtener elementos de la lista* (Get Items from List) | Modo **Elementos en el intervalo**, del primer número al segundo. Requiere que en el paso 1 las páginas salgan como lista (la opción de combinar páginas, desactivada). |

Y lo ejecutas por tandas (por ejemplo de 30 en 30 páginas). Cada tanda te deja
un archivo; VLC los reproduce en orden si están en la misma carpeta y los
nombras `01`, `02`, `03`…

## Escucharlo

1. Instala **VLC** desde la App Store (gratis, sin cuenta).
2. Abre **Archivos**, ve a la carpeta `Audiolibros`, mantén pulsado el audio y
   *Compartir ▸ VLC*. (O desde VLC, en la pestaña de red / archivos locales.)
3. Dale al play y bloquea la pantalla: sigue sonando.

Dentro de VLC tienes lo que pediste y algo más:

- **La línea de posición** para ir hacia atrás y adelante, y mandos también en
  la pantalla de bloqueo y en los auriculares.
- **La velocidad**, en el menú de opciones del reproductor. No son seis fijas
  como en la app nativa: es un ajuste continuo de 0,25× a 4×, así que puedes
  dejarlo clavado donde te guste.
- Se acuerda de por dónde ibas y te ofrece continuar.

## Lo que no me gusta de este camino (para que lo sepas antes)

- **Hay que convertir cada PDF y esperar.** No es abrir y darle al play.
- **Ocupa espacio.** Un libro entero en audio son cientos de megas.
- **No sé cuánto tarda la conversión** ni si un PDF gigante la aguanta de una
  vez: no tengo un iPhone aquí para probarlo. Haz la primera prueba con un PDF
  de cinco páginas antes de meterle un libro.
- **Si el PDF es un escaneo** (fotos de las páginas) no hay texto que sacar y no
  funcionará. Eso le pasa igual a la app nativa.

## Y si algún día tienes un Mac a mano

La app de esta carpeta ([`README.md`](README.md)) hace todo esto de un tirón:
abres el PDF y le das al play, sin conversiones ni archivos sueltos. Son 15
minutos con un Mac prestado y se queda instalada en tu iPhone.
