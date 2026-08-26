/* Texto: limpieza, unión de líneas en párrafos y división en frases.
   Todo son funciones puras — se prueban en test/logic.test.mjs. */

/* Abreviaturas tras las que un punto NO termina la frase. Sin el punto final
   y en minúsculas. */
const ABBREVIATIONS = new Set([
  'sr', 'sra', 'srta', 'sres', 'dr', 'dra', 'dres', 'd', 'dña', 'ud', 'uds',
  'vd', 'vds', 'lic', 'ing', 'prof', 'profa', 'gral', 'cap', 'tte', 'sgto',
  'av', 'avda', 'c', 'cl', 'ctra', 'pza', 'plza', 'apdo', 'dpto', 'depto',
  'art', 'arts', 'pág', 'pag', 'págs', 'pags', 'p', 'pp', 'núm', 'num', 'nro',
  'vol', 'vols', 'ed', 'eds', 'edit', 'trad', 'coord', 'comp', 'cf', 'cfr',
  'op', 'cit', 'ibíd', 'ibid', 'etc', 'aprox', 'máx', 'max', 'mín', 'min',
  'fig', 'figs', 'tab', 'tel', 'telf', 'ext', 'ej', 'esp', 'gr', 'kg', 'km',
  'mr', 'mrs', 'ms', 'jr', 'st', 'vs', 'inc', 'ltd', 'co', 'eg', 'ie', 'al',
  's', 'ss', 'a', 'ac', 'dc', 'jc', 'siglo', 'sig',
]);

/* Sustituciones de caracteres que los PDF usan y los lectores de voz
   pronuncian mal o no pronuncian. */
const REPLACEMENTS = [
  [/ﬀ/g, 'ff'], [/ﬁ/g, 'fi'], [/ﬂ/g, 'fl'],
  [/ﬃ/g, 'ffi'], [/ﬄ/g, 'ffl'], [/ﬅ/g, 'st'], [/ﬆ/g, 'st'],
  [/[‘’‛′]/g, "'"],
  [/[“”‟″]/g, '"'],
  [/[‐‑‒–—―]/g, '-'],
  [/…/g, '...'],
  [/[       ]/g, ' '],
  [/[​‌‍﻿­]/g, ''],
  [/•/g, ' '],
];

/** Normaliza un texto suelto: ligaduras, comillas, espacios repetidos. */
export function normalize(text) {
  let out = String(text || '');
  for (const [re, to] of REPLACEMENTS) out = out.replace(re, to);
  return out.replace(/[ \t]+/g, ' ').trim();
}

/** ¿La línea es solo un número de página, un romano suelto o basura corta? */
export function isPageNumber(line) {
  const t = line.trim();
  if (!t) return true;
  if (/^[-–—\s|.]*\d{1,4}[-–—\s|.]*$/.test(t)) return true;
  if (/^[-–—\s|.]*[ivxlcdm]{1,7}[-–—\s|.]*$/i.test(t) && t.length <= 9) return true;
  return false;
}

/** Clave para comparar líneas entre páginas ignorando el número que cambia. */
export function runningKey(line) {
  return normalize(line).toLowerCase().replace(/\d+/g, '#').replace(/[^\p{L}#]+/gu, ' ').trim();
}

/**
 * Quita encabezados y pies que se repiten a lo largo del libro, y los números
 * de página. Solo se mira la primera y la última línea de cada página, y nunca
 * se deja una página vacía por esto.
 */
export function stripRunningHeads(pages) {
  const clean = pages.map((lines) => lines.filter((l) => !isPageNumber(l)));
  if (pages.length < 4) return clean;

  const counts = new Map();
  const bump = (key) => { if (!key.endsWith(':')) counts.set(key, (counts.get(key) || 0) + 1); };
  for (const lines of clean) {
    if (!lines.length) continue;
    bump(`top:${runningKey(lines[0])}`);
    if (lines.length > 1) bump(`bot:${runningKey(lines[lines.length - 1])}`);
  }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.4));

  return clean.map((lines) => {
    if (!lines.length) return lines;
    let start = 0;
    let end = lines.length;
    if ((counts.get(`top:${runningKey(lines[0])}`) || 0) >= threshold) start = 1;
    if (end - 1 > start && (counts.get(`bot:${runningKey(lines[end - 1])}`) || 0) >= threshold) end--;
    return lines.slice(start, end);
  });
}

/**
 * Une las líneas de una página en párrafos: deshace los guiones de corte de
 * palabra y decide dónde acaba de verdad un párrafo.
 * `lines` = [{ text, gap }] donde `gap` es el salto vertical antes de la línea
 * en múltiplos de su altura (1 ≈ interlineado normal). También acepta strings.
 */
export function joinLines(lines) {
  const items = lines.map((l) => (typeof l === 'string' ? { text: l, gap: 1 } : l))
    .map((l) => ({ ...l, text: normalize(l.text) }))
    .filter((l) => l.text);

  const paragraphs = [];
  let current = '';

  const flush = () => { if (current.trim()) paragraphs.push(current.trim()); current = ''; };

  for (let i = 0; i < items.length; i++) {
    const { text, gap } = items[i];
    const startsNew = current === '';

    if (!startsNew && gap > 1.6) flush();

    if (current === '') { current = text; continue; }

    if (/[\p{Ll}\p{Lu}]-$/u.test(current) && /^\p{Ll}/u.test(text)) {
      // guion de corte: "conti-" + "nuación" → "continuación"
      current = current.slice(0, -1) + text;
    } else {
      current += ' ' + text;
    }
  }
  flush();
  return paragraphs;
}

/** ¿El punto que hay en `index` de `text` cierra de verdad la frase? */
function isSentenceEnd(text, index) {
  const ch = text[index];
  if (ch !== '.') return true;

  const before = text.slice(0, index);
  const word = (/([\p{L}\p{N}]+)$/u.exec(before) || [, ''])[1];
  if (!word) return true;
  if (ABBREVIATIONS.has(word.toLowerCase())) return false;
  // Inicial suelta: "J. R. R. Tolkien"
  if (word.length === 1 && /\p{Lu}/u.test(word)) return false;
  // Número seguido de más número: "3.14", "1. Introducción" sí corta
  if (/^\d+$/.test(word) && /^\s*\d/.test(text.slice(index + 1))) return false;
  return true;
}

/** Divide un texto en frases. Devuelve un array de strings sin vacíos. */
export function splitSentences(text) {
  const src = normalize(text);
  const out = [];
  let start = 0;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;

    // se traga los puntos suspensivos y los signos seguidos: "!?", "..."
    let end = i;
    while (end + 1 < src.length && '.!?'.includes(src[end + 1])) end++;
    // y las comillas o paréntesis de cierre
    while (end + 1 < src.length && '"\')]»”’'.includes(src[end + 1])) end++;

    const next = src.slice(end + 1);
    const opensNext = /^\s+["'«¿¡(\[]?[\p{Lu}\p{N}¿¡«]/u.test(next) || next.trim() === '';
    if (!opensNext) { i = end; continue; }
    if (!isSentenceEnd(src, i)) { i = end; continue; }

    const piece = src.slice(start, end + 1).trim();
    if (piece) out.push(piece);
    start = end + 1;
    i = end;
  }

  const rest = src.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/**
 * Parte las frases demasiado largas para que el sintetizador no se atragante
 * (algunos navegadores cortan por encima de ~250 caracteres).
 */
export function chunk(sentence, max = 220) {
  const s = sentence.trim();
  if (s.length <= max) return [s];

  const pieces = [];
  let rest = s;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = Math.max(
      window.lastIndexOf('; '), window.lastIndexOf(': '),
      window.lastIndexOf(', '), window.lastIndexOf(' — '), window.lastIndexOf(' - '),
    );
    if (cut < max * 0.4) cut = window.lastIndexOf(' ');
    if (cut <= 0) cut = max;
    pieces.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) pieces.push(rest);
  return pieces.filter(Boolean);
}

/**
 * Párrafos de una página → lo que se va a leer, conservando la separación en
 * párrafos: [[trozo, trozo], [trozo], …].
 */
export function toSpeakable(paragraphs) {
  const out = [];
  for (const p of paragraphs) {
    const pieces = [];
    for (const sentence of splitSentences(p)) {
      for (const piece of chunk(sentence)) pieces.push(piece);
    }
    if (pieces.length) out.push(pieces);
  }
  return out;
}

/** Duración aproximada en segundos a `rate` (≈ 165 palabras por minuto a 1x). */
export function estimateSeconds(chunks, rate = 1) {
  const words = chunks.reduce((n, s) => n + s.split(/\s+/).length, 0);
  return Math.round((words / 165) * 60 / (rate || 1));
}

/* Palabras cortas y frecuentes que delatan el idioma de un texto. */
const LANG_HINTS = {
  es: ['que', 'los', 'las', 'del', 'con', 'para', 'como', 'pero', 'porque', 'muy', 'sin', 'sobre', 'cuando', 'más', 'está', 'ser', 'hay', 'todo', 'sus', 'era'],
  en: ['the', 'and', 'that', 'with', 'for', 'was', 'this', 'have', 'not', 'from', 'they', 'which', 'been', 'were', 'would', 'their', 'about', 'there'],
  pt: ['não', 'uma', 'mais', 'como', 'para', 'com', 'são', 'está', 'pelo', 'pela', 'seu', 'muito', 'também', 'foi', 'ele'],
  fr: ['les', 'des', 'une', 'pour', 'avec', 'dans', 'pas', 'sur', 'plus', 'était', 'elle', 'nous', 'ont', 'mais', 'sont', 'cette'],
  it: ['che', 'non', 'una', 'per', 'con', 'come', 'sono', 'anche', 'della', 'degli', 'questo', 'alla', 'era', 'gli'],
  de: ['und', 'der', 'die', 'das', 'nicht', 'mit', 'sich', 'auch', 'eine', 'dem', 'den', 'ist', 'war', 'auf', 'für'],
};

/** Adivina el idioma de un texto para elegir la voz. Devuelve 'es', 'en'… o ''. */
export function guessLang(sample) {
  const words = String(sample || '').toLowerCase().match(/[\p{L}]+/gu) || [];
  if (words.length < 20) return '';
  const seen = words.slice(0, 3000);
  let best = '';
  let bestScore = 0;
  for (const [lang, hints] of Object.entries(LANG_HINTS)) {
    const set = new Set(hints);
    const score = seen.reduce((n, w) => n + (set.has(w) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = lang; }
  }
  return bestScore >= seen.length * 0.02 ? best : '';
}

/** Los PDF traen títulos como 'untitled' o 'Microsoft Word - cap3.doc'. */
export function cleanTitle(raw) {
  const t = String(raw || '')
    .replace(/^Microsoft Word\s*-\s*/i, '')
    .replace(/\.(pdf|docx?|indd|pages|tex)$/i, '')
    .replace(/[_]+/g, ' ')
    .trim();
  if (t.length < 2) return '';
  if (/^(untitled|sin t[ií]tulo|documento?\s*\d*|document\s*\d*|unknown|none)$/i.test(t)) return '';
  return t;
}

/** '1 h 04 min' / '12 min' / '45 s' */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, '0')} min`;
}
