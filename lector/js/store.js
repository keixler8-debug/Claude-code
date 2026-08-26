/* Biblioteca guardada en el propio dispositivo (IndexedDB).
   Nada sale de aquí: ni el PDF ni por dónde vas. */

const DB_NAME = 'lector';
const DB_VERSION = 1;
const BOOKS = 'books';
const PREFS = 'prefs';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BOOKS)) db.createObjectStore(BOOKS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(PREFS)) db.createObjectStore(PREFS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(storeName, mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export function newId() {
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Todos los libros, el último leído primero. */
export async function listBooks() {
  const all = await run(BOOKS, 'readonly', (s) => s.getAll());
  return (all || []).sort((a, b) => (b.openedAt || b.addedAt || 0) - (a.openedAt || a.addedAt || 0));
}

export function getBook(id) {
  return run(BOOKS, 'readonly', (s) => s.get(id));
}

export function putBook(book) {
  return run(BOOKS, 'readwrite', (s) => s.put(book));
}

export function deleteBook(id) {
  return run(BOOKS, 'readwrite', (s) => s.delete(id));
}

/** Guarda solo la posición, sin reescribir el texto entero desde fuera. */
export async function saveProgress(id, position) {
  const book = await getBook(id);
  if (!book) return;
  book.position = position;
  book.openedAt = Date.now();
  await putBook(book);
}

export function getPref(key, fallback = null) {
  return run(PREFS, 'readonly', (s) => s.get(key)).then((v) => (v === undefined ? fallback : v));
}

export function setPref(key, value) {
  return run(PREFS, 'readwrite', (s) => s.put(value, key));
}

/** Espacio ocupado, si el navegador lo cuenta. */
export async function usage() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try { return await navigator.storage.estimate(); } catch { return null; }
}
