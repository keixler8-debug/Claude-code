/* Pega todo: biblioteca, extracción del PDF y reproductor. */

import { extract } from './extract.js';
import { cleanTitle, estimateSeconds, formatDuration, guessLang } from './text.js';
import { Reader, isSupported, loadVoices, sortVoices } from './speech.js';
import * as store from './store.js';

const $ = (id) => document.getElementById(id);

const el = {
  library: $('library'), player: $('player'), sheet: $('sheet'),
  file: $('file'), drop: $('drop'),
  progress: $('progress'), progressBar: $('progress-bar'), progressLabel: $('progress-label'),
  list: $('book-list'), empty: $('empty'), supportNote: $('support-note'),
  back: $('back'), title: $('book-title'), settingsBtn: $('settings-btn'),
  pageText: $('page-text'), pageLabel: $('page-label'), leftLabel: $('left-label'),
  scrub: $('scrub'), play: $('play'), prev: $('prev'), next: $('next'),
  prevPage: $('prev-page'), nextPage: $('next-page'),
  voice: $('voice'), rate: $('rate'), rateLabel: $('rate-label'), goto: $('goto'),
  sheetClose: $('sheet-close'),
};

const reader = new Reader();
let book = null;          // libro abierto
let allVoices = [];
let voices = [];
let renderedPage = -1;
let scrubbing = false;
let wakeLock = null;

/* ---------- Biblioteca ---------- */

async function renderLibrary() {
  const books = await store.listBooks();
  const rate = Number(await store.getPref('rate', 1)) || 1;
  el.list.innerHTML = '';
  el.empty.hidden = books.length > 0;

  for (const b of books) {
    const total = b.chunkCount || 1;
    const done = Math.min(b.position || 0, total);
    const pct = Math.round((done / total) * 100);
    const left = formatDuration(estimateSeconds(flatten(b.pages).slice(done), rate));

    const li = document.createElement('li');
    li.className = 'book';
    li.innerHTML = `
      <button class="book-main" type="button">
        <p class="book-title"></p>
        <p class="book-sub"></p>
        <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
      </button>
      <button class="icon-btn book-del" type="button" aria-label="Borrar">
        <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
      </button>`;
    li.querySelector('.book-title').textContent = b.title || b.name;
    li.querySelector('.book-sub').textContent = pct > 0
      ? `${pct}% · quedan ${left}`
      : `${b.pageCount} páginas · ${left}`;
    li.querySelector('.book-main').addEventListener('click', () => openBook(b.id));
    li.querySelector('.book-del').addEventListener('click', async () => {
      if (!confirm(`¿Borrar «${b.title || b.name}»?`)) return;
      await store.deleteBook(b.id);
      renderLibrary();
    });
    el.list.appendChild(li);
  }
}

const flatten = (pages) => (pages || []).flat(2);

/* ---------- Añadir un PDF ---------- */

async function addFiles(files) {
  const pdfs = Array.from(files).filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
  if (!pdfs.length) return;

  const known = await store.listBooks();
  let last = null;
  for (const file of pdfs) {
    const repeated = known.find((b) => b.name === file.name && b.size === file.size);
    if (repeated) { last = repeated; continue; }

    el.progress.hidden = false;
    el.progressLabel.textContent = `Leyendo «${file.name}»…`;
    el.progressBar.style.width = '0%';
    try {
      const data = await file.arrayBuffer();
      const { pages, title, pageCount } = await extract(data, {
        onProgress: (n, total) => {
          el.progressBar.style.width = `${Math.round((n / total) * 100)}%`;
          el.progressLabel.textContent = `Leyendo «${file.name}» — página ${n} de ${total}`;
        },
      });

      const chunkCount = flatten(pages).length;
      if (!chunkCount) {
        alert(`«${file.name}» no lleva texto dentro: parece un escaneo o fotos de páginas. Aún no sé leer eso.`);
        continue;
      }

      last = {
        id: store.newId(),
        name: file.name,
        title: cleanTitle(title) || cleanTitle(file.name) || file.name,
        lang: guessLang(flatten(pages).slice(0, 60).join(' ')),
        size: file.size,
        pages, pageCount, chunkCount,
        position: 0,
        addedAt: Date.now(),
        openedAt: Date.now(),
      };
      await store.putBook(last);
    } catch (err) {
      console.error(err);
      alert(`No he podido abrir «${file.name}».\n${err && err.message ? err.message : ''}`);
    } finally {
      el.progress.hidden = true;
    }
  }

  await renderLibrary();
  if (last) openBook(last.id);
}

/* ---------- Reproductor ---------- */

async function openBook(id) {
  book = await store.getBook(id);
  if (!book) return;

  el.title.textContent = book.title || book.name;
  await applyVoices(book.lang);
  el.goto.max = String(book.pageCount);
  reader.load(book.pages, book.position || 0);
  reader.setRate(book.rate || Number(el.rate.value) || 1);

  el.scrub.max = String(Math.max(0, reader.total - 1));
  renderedPage = -1;
  el.library.hidden = true;
  el.player.hidden = false;
  onIndex(reader.index);
}

async function closeBook() {
  reader.stop();
  releaseWakeLock();
  await flushProgress();
  book = null;
  el.player.hidden = true;
  el.library.hidden = false;
  renderLibrary();
}

/** Guarda la posición ya, sin esperar al temporizador. */
async function flushProgress() {
  clearTimeout(saveTimer);
  if (!book) return;
  book.position = reader.index;
  await store.saveProgress(book.id, reader.index);
}

/** Pinta la página que contiene el trozo `index`. */
function renderPage(index) {
  const chunk = reader.chunks[index];
  if (!chunk || chunk.page === renderedPage) return;
  renderedPage = chunk.page;

  el.pageText.innerHTML = '';
  const start = reader.indexOfPage(chunk.page);
  let para = null;
  let paraId = -1;

  for (let i = start; i < reader.chunks.length && reader.chunks[i].page === chunk.page; i++) {
    const c = reader.chunks[i];
    if (c.para !== paraId) {
      paraId = c.para;
      para = document.createElement('p');
      para.className = 'para';
      el.pageText.appendChild(para);
    }
    const span = document.createElement('span');
    span.className = 'sentence';
    span.dataset.index = String(i);
    span.textContent = c.text + ' ';
    para.appendChild(span);
  }
}

function highlight(index) {
  const old = el.pageText.querySelector('.sentence.now');
  if (old) old.classList.remove('now');
  const now = el.pageText.querySelector(`.sentence[data-index="${index}"]`);
  if (!now) return;
  now.classList.add('now');
  const box = el.pageText.getBoundingClientRect();
  const at = now.getBoundingClientRect();
  if (at.top < box.top + 40 || at.bottom > box.bottom - 60) {
    now.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

let saveTimer = null;
function onIndex(index) {
  renderPage(index);
  highlight(index);

  const chunk = reader.chunks[index];
  const page = chunk ? chunk.page + 1 : 1;
  el.pageLabel.textContent = `Página ${page} de ${book ? book.pageCount : 1}`;
  const left = estimateSeconds(reader.chunks.slice(index).map((c) => c.text), reader.rate);
  el.leftLabel.textContent = `quedan ${formatDuration(left)}`;
  if (!scrubbing) el.scrub.value = String(index);

  const open = book;
  if (!open) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    open.position = index;
    store.saveProgress(open.id, index);
  }, 700);
}

function onState(state) {
  const playing = state === 'playing';
  el.play.classList.toggle('playing', playing);
  el.play.setAttribute('aria-label', playing ? 'Pausa' : 'Reproducir');
  if (playing) requestWakeLock(); else releaseWakeLock();
}

/* La lectura muere si la pantalla se apaga, así que se pide mantenerla viva. */
async function requestWakeLock() {
  if (wakeLock || !navigator.wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch { /* el navegador puede negarse; no pasa nada */ }
}

function releaseWakeLock() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

/* ---------- Voces y velocidad ---------- */

async function setupVoices() {
  allVoices = await loadVoices();
  await applyVoices('');

  const rate = await store.getPref('rate', 1);
  el.rate.value = String(rate);
  el.rateLabel.textContent = `${Number(rate).toFixed(1).replace('.', ',')}×`;
  reader.rate = Number(rate);
}

/**
 * Ordena las voces para el idioma del libro y elige una: la guardada si sirve
 * para ese idioma, y si no la mejor que haya.
 */
async function applyVoices(lang) {
  // En iOS la lista de voces llega tarde: si aún no está, se vuelve a pedir.
  if (!allVoices.length) allVoices = await loadVoices(600);
  const want = lang || navigator.language || 'es';
  voices = sortVoices(allVoices, want);
  el.voice.innerHTML = '';
  voices.forEach((v, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${v.name} · ${v.lang}`;
    el.voice.appendChild(opt);
  });
  if (!voices.length) return;

  const base = want.slice(0, 2).toLowerCase();
  const saved = await store.getPref('voice');
  const savedAt = voices.findIndex((v) => v.name === saved);
  const at = savedAt >= 0 && voices[savedAt].lang.toLowerCase().startsWith(base) ? savedAt : 0;
  el.voice.value = String(at);
  reader.setVoice(voices[at]);
}

/* ---------- Enganches ---------- */

reader.onIndex = onIndex;
reader.onState = onState;
reader.onFinish = () => { const open = book; if (open) store.saveProgress(open.id, reader.total); };

el.file.addEventListener('change', () => { addFiles(el.file.files); el.file.value = ''; });

['dragenter', 'dragover'].forEach((ev) => el.drop.addEventListener(ev, (e) => {
  e.preventDefault(); el.drop.classList.add('over');
}));
['dragleave', 'drop'].forEach((ev) => el.drop.addEventListener(ev, (e) => {
  e.preventDefault(); el.drop.classList.remove('over');
}));
el.drop.addEventListener('drop', (e) => {
  if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
});
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

el.play.addEventListener('click', () => reader.toggle());
el.prev.addEventListener('click', () => reader.prev());
el.next.addEventListener('click', () => reader.next());
el.prevPage.addEventListener('click', () => reader.prevPage());
el.nextPage.addEventListener('click', () => reader.nextPage());
el.back.addEventListener('click', closeBook);

el.pageText.addEventListener('click', (e) => {
  const span = e.target.closest('.sentence');
  if (span) reader.seek(Number(span.dataset.index));
});

el.scrub.addEventListener('input', () => { scrubbing = true; });
el.scrub.addEventListener('change', () => {
  scrubbing = false;
  reader.seek(Number(el.scrub.value));
});

el.settingsBtn.addEventListener('click', () => {
  el.goto.value = String((reader.current ? reader.current.page : 0) + 1);
  el.sheet.hidden = false;
});
el.sheetClose.addEventListener('click', () => { el.sheet.hidden = true; });
el.sheet.addEventListener('click', (e) => { if (e.target === el.sheet) el.sheet.hidden = true; });

el.voice.addEventListener('change', () => {
  const v = voices[Number(el.voice.value)];
  if (!v) return;
  reader.setVoice(v);
  store.setPref('voice', v.name);
});

el.rate.addEventListener('input', () => {
  el.rateLabel.textContent = `${Number(el.rate.value).toFixed(1).replace('.', ',')}×`;
});
el.rate.addEventListener('change', () => {
  const rate = Number(el.rate.value);
  reader.setRate(rate);
  store.setPref('rate', rate);
  onIndex(reader.index);
});

el.goto.addEventListener('change', () => {
  const page = Math.max(1, Math.min(Number(el.goto.value) || 1, book ? book.pageCount : 1));
  reader.seek(reader.indexOfPage(page - 1));
});

document.addEventListener('keydown', (e) => {
  if (el.player.hidden || e.target.matches('input, select, textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); reader.toggle(); }
  if (e.code === 'ArrowRight') reader.next();
  if (e.code === 'ArrowLeft') reader.prev();
});

/* Si se vuelve a la app y la pantalla estuvo apagada, la voz se habrá cortado. */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushProgress();
  else if (reader.state === 'playing') requestWakeLock();
});
window.addEventListener('pagehide', () => { flushProgress(); });

/* ---------- Arranque ---------- */

if (!isSupported()) el.supportNote.hidden = false;
setupVoices();
renderLibrary();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
