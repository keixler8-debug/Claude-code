#!/usr/bin/env node
/*
 * Empaqueta la app en un único archivo HTML autocontenido.
 *
 *   node web/build-standalone.mjs            -> web/organizador.html
 *   node web/build-standalone.mjs --body-only salida.html
 *
 * Sirve para mandar la app por correo, abrirla desde el disco o publicarla en
 * sitios que solo admiten un archivo. Junta los módulos ES en un solo script
 * envolviendo cada uno en su propia función, así que no hacen falta ni bundler
 * ni dependencias y los nombres de cada módulo no chocan entre sí.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = dirname(fileURLToPath(import.meta.url));

/* Orden topológico: cada módulo va después de aquellos de los que depende. */
const MODULES = [
  'js/dates.js',
  'js/store.js',
  'js/agenda.js',
  'js/ics.js',
  'js/ui.js',
  'js/alarms.js',
  'js/editor.js',
  'js/components.js',
  'js/views/today.js',
  'js/views/calendar.js',
  'js/views/tasks.js',
  'js/views/routines.js',
  'js/views/settings.js',
  'js/app.js',
];

const IMPORT_RE = /^\s*import\s+(?:(\*\s+as\s+\w+)|(\{[^}]*\}))\s+from\s+['"]([^'"]+)['"];?\s*$/gm;

/** Convierte un módulo ES en el cuerpo de una función que devuelve sus exportaciones. */
function wrap(path) {
  let source = readFileSync(join(WEB, path), 'utf8');

  // Fuera el bloque del service worker: en un solo archivo no hay nada que cachear.
  source = source.replace(/\/\* build:sw:start[\s\S]*?build:sw:end \*\//g, '');

  // Las importaciones pasan a leer del registro de módulos.
  source = source.replace(IMPORT_RE, (line, namespace, named, specifier) => {
    const target = relative(WEB, resolve(dirname(join(WEB, path)), specifier)).split('\\').join('/');
    if (!MODULES.includes(target)) throw new Error(`${path} importa ${target}, que no está en MODULES`);
    if (namespace) return `const ${namespace.replace(/^\*\s+as\s+/, '')} = __m[${JSON.stringify(target)}];`;
    return `const ${named.replace(/\bas\b/g, ':')} = __m[${JSON.stringify(target)}];`;
  });

  // Nombres exportados, para reconstruir el objeto del módulo al final.
  const exported = new Set();
  for (const m of source.matchAll(/^\s*export\s+(?:async\s+)?(?:function|const|let|var|class)\s+(\w+)/gm)) {
    exported.add(m[1]);
  }
  for (const m of source.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) exported.add(name);
    }
  }

  source = source.replace(/^\s*export\s+(?=(?:async\s+)?(?:function|const|let|var|class)\s)/gm, '');
  source = source.replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '');

  const returned = [...exported].map((name) => `    ${name},`).join('\n');
  return `__m[${JSON.stringify(path)}] = (() => {\n${source}\n  return {\n${returned}\n  };\n})();\n`;
}

const bundle = `const __m = {};\n\n` + MODULES.map(wrap).join('\n');
const css = readFileSync(join(WEB, 'styles.css'), 'utf8');

/* El cuerpo de index.html, sin <head> ni las etiquetas del documento. */
const html = readFileSync(join(WEB, 'index.html'), 'utf8');
const body = html.slice(html.indexOf('<body>') + '<body>'.length, html.indexOf('</body>'))
  .replace(/\s*<script[\s\S]*?<\/script>\s*/g, '\n')
  .trim();

const bodyOnly = process.argv.includes('--body-only');
const outPath = process.argv.find((a) => a.endsWith('.html') && !a.includes('build-standalone'))
  || join(WEB, 'organizador.html');

const page = bodyOnly
  ? `<style>\n${css}\n</style>\n\n${body}\n\n<script>\n${bundle}\n</script>\n`
  : `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
<title>Organizador</title>
<meta name="theme-color" content="#0b0d13" media="(prefers-color-scheme: dark)" />
<meta name="theme-color" content="#f6f7fb" media="(prefers-color-scheme: light)" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Organizador" />
<link rel="apple-touch-icon" href="${dataURI('icons/icon-180.png')}" />
<link rel="icon" href="${dataURI('icons/icon-192.png')}" />
<style>
${css}
</style>
</head>
<body>
${body}
<script>
${bundle}
</script>
</body>
</html>
`;

writeFileSync(outPath, page, 'utf8');
console.log(`${relative(process.cwd(), outPath)} · ${(page.length / 1024).toFixed(0)} KB`
  + (bodyOnly ? ' (solo cuerpo)' : ''));

function dataURI(path) {
  return 'data:image/png;base64,' + readFileSync(join(WEB, path)).toString('base64');
}
