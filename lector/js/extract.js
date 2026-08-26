/* Saca texto legible de un PDF usando pdf.js.
   Reconstruye líneas a partir de las posiciones de cada trozo de texto,
   detecta dos columnas y devuelve párrafos por página. */

import { joinLines, stripRunningHeads, toSpeakable } from './text.js';

const PDFJS_URL = new URL('../vendor/pdfjs/pdf.min.mjs', import.meta.url).href;
const WORKER_URL = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

let pdfjs = null;

/** Carga pdf.js una sola vez. */
export async function getPdfjs() {
  if (!pdfjs) {
    pdfjs = await import(PDFJS_URL);
    pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URL;
  }
  return pdfjs;
}

/** Agrupa los trozos de texto de una página en líneas ordenadas. */
function buildLines(items, transform, Util) {
  const placed = [];
  for (const item of items) {
    const str = item.str;
    if (!str || !str.trim()) continue;
    const m = Util.transform(transform, item.transform);
    const size = Math.hypot(m[2], m[3]) || Math.abs(m[3]) || 10;
    placed.push({ str, x: m[4], y: m[5], w: item.width || 0, size });
  }
  if (!placed.length) return [];

  // ¿Dos columnas? Si hay una franja vertical central sin nada de texto.
  const xs = placed.map((p) => p.x);
  const left = Math.min(...xs);
  const right = Math.max(...placed.map((p) => p.x + p.w));
  const width = right - left;
  let split = null;
  if (width > 0 && placed.length > 30) {
    const bandStart = left + width * 0.44;
    const bandEnd = left + width * 0.56;
    const crosses = placed.filter((p) => p.x < bandEnd && p.x + p.w > bandStart).length;
    const before = placed.filter((p) => p.x + p.w <= bandStart).length;
    const after = placed.filter((p) => p.x >= bandEnd).length;
    if (crosses === 0 && before > placed.length * 0.2 && after > placed.length * 0.2) {
      split = (bandStart + bandEnd) / 2;
    }
  }

  const columns = split === null
    ? [placed]
    : [placed.filter((p) => p.x < split), placed.filter((p) => p.x >= split)];

  const lines = [];
  for (const column of columns) {
    const rows = [];
    for (const p of column.slice().sort((a, b) => a.y - b.y || a.x - b.x)) {
      const row = rows[rows.length - 1];
      if (row && Math.abs(p.y - row.y) <= Math.max(2, p.size * 0.5)) {
        row.parts.push(p);
        row.y = (row.y * (row.parts.length - 1) + p.y) / row.parts.length;
      } else {
        rows.push({ y: p.y, parts: [p] });
      }
    }
    let prev = null;
    for (const row of rows) {
      const parts = row.parts.sort((a, b) => a.x - b.x);
      const size = parts.reduce((s, p) => s + p.size, 0) / parts.length;
      let text = '';
      let cursor = null;
      for (const p of parts) {
        if (cursor !== null && p.x - cursor > size * 0.22 && !/\s$/.test(text) && !/^\s/.test(p.str)) text += ' ';
        text += p.str;
        cursor = p.x + p.w;
      }
      const gap = prev === null ? 2 : (row.y - prev.y) / Math.max(1, size * 1.2);
      lines.push({ text, gap, size });
      prev = { y: row.y, size };
    }
  }
  return lines;
}

/**
 * Abre un PDF y saca todo el texto.
 * `data` es un ArrayBuffer. Devuelve { pages: [[frase, …], …], title, pageCount }.
 */
export async function extract(data, { onProgress, password } = {}) {
  const lib = await getPdfjs();
  const doc = await lib.getDocument({ data, password, isEvalSupported: false }).promise;

  const raw = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    raw.push(buildLines(content.items, viewport.transform, lib.Util));
    page.cleanup();
    if (onProgress) onProgress(n, doc.numPages);
  }

  const cleaned = stripRunningHeads(raw.map((lines) => lines.map((l) => l.text)));
  const pages = cleaned.map((texts, i) => {
    const withGaps = texts.map((text) => {
      const source = raw[i].find((l) => l.text === text);
      return { text, gap: source ? source.gap : 1 };
    });
    return toSpeakable(joinLines(withGaps));
  });

  let title = '';
  try {
    const meta = await doc.getMetadata();
    title = (meta.info && meta.info.Title ? String(meta.info.Title) : '').trim();
  } catch { /* metadatos opcionales */ }

  const pageCount = doc.numPages;
  await doc.destroy();
  return { pages, title, pageCount };
}
