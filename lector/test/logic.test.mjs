/* Prueba de la lógica pura (sin navegador): limpieza del texto, frases,
   párrafos, encabezados repetidos y el recorrido del lector. */

/* El motor de voz no existe fuera del navegador: se finge lo justo para poder
   comprobar el recorrido por el libro sin que nada hable. */
class FakeUtterance {
  constructor(text) { this.text = text; }
}
globalThis.SpeechSynthesisUtterance = FakeUtterance;
globalThis.speechSynthesis = {
  spoken: [],
  speaking: false,
  speak(u) { this.spoken.push(u.text); },
  cancel() {},
  pause() {},
  resume() {},
  getVoices() { return []; },
  addEventListener() {},
  removeEventListener() {},
};

const text = await import('../js/text.js');
const { Reader, sortVoices } = await import('../js/speech.js');

let failures = 0;
function ok(name, cond, extra = '') {
  if (cond) console.log('  ✓', name);
  else { failures++; console.log('  ✗', name, extra); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('\n== Limpieza ==');
ok('ligaduras', text.normalize('la ﬁgura eﬁciente') === 'la figura eficiente');
ok('comillas y guiones', text.normalize('“así” —dijo—') === '"así" -dijo-');
ok('espacios repetidos', text.normalize('  hola    qué   tal  ') === 'hola qué tal');
ok('puntos suspensivos', text.normalize('espera…') === 'espera...');

console.log('\n== Frases ==');
ok('corta por punto', eq(text.splitSentences('Uno. Dos. Tres.'), ['Uno.', 'Dos.', 'Tres.']));
ok('no corta en abreviatura', eq(text.splitSentences('Vino el Sr. Pérez a casa.'), ['Vino el Sr. Pérez a casa.']));
ok('no corta en iniciales', eq(text.splitSentences('Lo escribió J. R. Tolkien.'), ['Lo escribió J. R. Tolkien.']));
ok('no corta decimales', eq(text.splitSentences('Costó 3.50 euros hoy.'), ['Costó 3.50 euros hoy.']));
ok('interrogación y exclamación', eq(text.splitSentences('¿Vienes? ¡Claro!'), ['¿Vienes?', '¡Claro!']));
ok('suspensivos juntos', eq(text.splitSentences('Bueno... Ya veremos.'), ['Bueno...', 'Ya veremos.']));
ok('comilla de cierre', eq(text.splitSentences('Dijo "vale". Y se fue.'), ['Dijo "vale".', 'Y se fue.']));
ok('sin punto final', eq(text.splitSentences('Un fragmento suelto'), ['Un fragmento suelto']));
ok('texto vacío', eq(text.splitSentences('   '), []));

console.log('\n== Párrafos ==');
ok('une el guion de corte', eq(
  text.joinLines([{ text: 'una conti-', gap: 1 }, { text: 'nuación', gap: 1 }]),
  ['una continuación'],
));
ok('une líneas normales', eq(
  text.joinLines([{ text: 'primera línea', gap: 1 }, { text: 'segunda línea', gap: 1 }]),
  ['primera línea segunda línea'],
));
ok('separa por salto grande', eq(
  text.joinLines([{ text: 'Párrafo uno.', gap: 1 }, { text: 'Párrafo dos.', gap: 2.4 }]),
  ['Párrafo uno.', 'Párrafo dos.'],
));
ok('tira líneas vacías', eq(text.joinLines(['hola', '   ', 'adiós']), ['hola adiós']));

console.log('\n== Encabezados y pies ==');
{
  const pages = Array.from({ length: 8 }, (_, i) => [
    'HISTORIA DE ESPAÑA',
    `Contenido de la página ${i + 1}`,
    String(i + 12),
  ]);
  const clean = pages.length && text.stripRunningHeads(pages);
  ok('quita el encabezado repetido', clean.every((p) => !p.includes('HISTORIA DE ESPAÑA')));
  ok('quita el número de página', clean.every((p) => p.length === 1));
  ok('respeta el texto', clean[3][0] === 'Contenido de la página 4');
}
ok('número suelto', text.isPageNumber('  42 ') && text.isPageNumber('— xiv —'));
ok('texto no es número', !text.isPageNumber('Capítulo 42'));

console.log('\n== Troceado ==');
{
  const largo = 'palabra, '.repeat(60).trim();
  const trozos = text.chunk(largo, 100);
  ok('todos por debajo del máximo', trozos.every((t) => t.length <= 100), trozos.map((t) => t.length).join(','));
  ok('no pierde palabras', trozos.join(' ').split(/\s+/).length === largo.split(/\s+/).length);
  ok('frase corta intacta', eq(text.chunk('Corta.'), ['Corta.']));
}
ok('toSpeakable conserva párrafos', eq(
  text.toSpeakable(['Uno. Dos.', 'Tres.']),
  [['Uno.', 'Dos.'], ['Tres.']],
));

console.log('\n== Títulos ==');
ok('tira untitled', text.cleanTitle('untitled') === '');
ok('tira el prefijo de Word', text.cleanTitle('Microsoft Word - capitulo3.doc') === 'capitulo3');
ok('respeta un título de verdad', text.cleanTitle('La casa de la esquina') === 'La casa de la esquina');
ok('cambia los guiones bajos', text.cleanTitle('mi_libro_bueno.pdf') === 'mi libro bueno');

console.log('\n== Idioma ==');
ok('reconoce el español', text.guessLang(
  'Cuando el sol se puso sobre los tejados de la ciudad, todos los vecinos que aún estaban en la plaza se fueron a sus casas, pero él se quedó allí sin decir nada más porque era lo que había prometido y no tenía sentido volver sobre ello.') === 'es');
ok('reconoce el inglés', text.guessLang(
  'When the sun went down over the roofs of the city, all the neighbours that were still in the square went back to their houses, but he stayed there and said nothing more, because that was what he had promised and there was no point going over it again.') === 'en');
ok('no adivina con dos palabras', text.guessLang('Hola mundo') === '');

console.log('\n== Duraciones ==');
ok('estimación a 1x', text.estimateSeconds(['una '.repeat(165).trim()]) === 60);
ok('el doble de rápido, la mitad', text.estimateSeconds(['una '.repeat(165).trim()], 2) === 30);
ok('formato minutos', text.formatDuration(600) === '10 min');
ok('formato horas', text.formatDuration(3900) === '1 h 05 min');
ok('formato segundos', text.formatDuration(12) === '12 s');

console.log('\n== Recorrido del lector ==');
{
  const pages = [
    [['P1 a.', 'P1 b.'], ['P1 c.']],
    [['P2 a.']],
    [['P3 a.', 'P3 b.']],
  ];
  const r = new Reader();
  r.load(pages);
  ok('aplana todo el libro', r.total === 6);
  ok('sabe de qué página es cada trozo', r.chunks[3].page === 1 && r.chunks[5].page === 2);
  ok('conserva el párrafo', r.chunks[2].para === 1);
  ok('primer trozo de una página', r.indexOfPage(2) === 4);

  r.seek(4);
  ok('salta a la página 3 (anterior)', (r.prevPage(), r.index) === 3);
  ok('salta a la página siguiente', (r.nextPage(), r.index) === 4);
  r.seek(999);
  ok('no se sale por arriba', r.index === 5);
  r.seek(-3);
  ok('no se sale por abajo', r.index === 0);

  const visited = [];
  r.onIndex = (i) => visited.push(i);
  r.next(); r.next(); r.prev();
  ok('avanza y retrocede', eq(visited, [1, 2, 1]));

  const r2 = new Reader();
  r2.load(pages, 4);
  ok('retoma donde se dejó', r2.index === 4);
  r2.load([]);
  ok('libro vacío no rompe', r2.total === 0 && r2.index === 0);
}

console.log('\n== Voces ==');
{
  const voices = [
    { name: 'Daniel', lang: 'en-GB', localService: true },
    { name: 'Jorge', lang: 'es-ES', localService: false },
    { name: 'Mónica', lang: 'es-ES', localService: true },
  ];
  const sorted = sortVoices(voices, 'es-ES');
  ok('primero el idioma pedido', sorted[0].lang.startsWith('es') && sorted[1].lang.startsWith('es'));
  ok('antes las locales', sorted[0].name === 'Mónica');
}

console.log(failures ? `\n${failures} fallo(s)\n` : '\nTodo correcto\n');
process.exit(failures ? 1 : 0);
