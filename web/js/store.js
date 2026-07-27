/* Almacenamiento local. Todo vive en este dispositivo: nada sale a ningún servidor. */

const KEY = 'organizador.v1';

const DEFAULT_STATE = {
  version: 1,
  events: [],    // citas con hora de inicio/fin
  tasks: [],     // tareas puntuales (one-time)
  routines: [],  // tareas que se repiten (diarias, semanales, mensuales)
  settings: {
    startOfWeek: 1,        // 1 = lunes
    defaultAlarms: [10],   // minutos antes, por defecto
    sound: true,
    notifications: false,
    calendarName: 'Mi Organizador',
  },
};

const listeners = new Set();
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) },
    };
  } catch (err) {
    console.error('No se pudo leer el almacenamiento, empiezo de cero:', err);
    return structuredClone(DEFAULT_STATE);
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error('No se pudo guardar:', err);
    alert('No se pudo guardar en este dispositivo. ¿Estás en modo privado o sin espacio?');
  }
}

function emit() {
  persist();
  for (const fn of listeners) fn(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState() {
  return state;
}

export function getSettings() {
  return state.settings;
}

export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  emit();
}

export function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

const COLLECTIONS = { event: 'events', task: 'tasks', routine: 'routines' };

function collectionFor(type) {
  const name = COLLECTIONS[type];
  if (!name) throw new Error('Tipo desconocido: ' + type);
  return name;
}

export function save(item) {
  const list = state[collectionFor(item.type)];
  if (!item.id) {
    item.id = uid();
    item.createdAt = new Date().toISOString();
    list.push(item);
  } else {
    const i = list.findIndex((x) => x.id === item.id);
    if (i === -1) list.push(item);
    else list[i] = { ...list[i], ...item, updatedAt: new Date().toISOString() };
  }
  emit();
  return item;
}

export function remove(type, id) {
  const name = collectionFor(type);
  state[name] = state[name].filter((x) => x.id !== id);
  emit();
}

export function find(type, id) {
  return state[collectionFor(type)].find((x) => x.id === id) || null;
}

/** Marca/desmarca una tarea puntual. */
export function toggleTask(id) {
  const task = find('task', id);
  if (!task) return;
  task.done = !task.done;
  task.doneAt = task.done ? new Date().toISOString() : null;
  emit();
}

/** Marca/desmarca una rutina para un día concreto (clave 'YYYY-MM-DD'). */
export function toggleRoutine(id, dateKey) {
  const routine = find('routine', id);
  if (!routine) return;
  routine.completions = routine.completions || {};
  if (routine.completions[dateKey]) delete routine.completions[dateKey];
  else routine.completions[dateKey] = new Date().toISOString();
  emit();
}

export function isRoutineDone(routine, dateKey) {
  return Boolean(routine.completions && routine.completions[dateKey]);
}

/* ---- Copia de seguridad ---- */

export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text, { merge = false } = {}) {
  const incoming = JSON.parse(text);
  if (!incoming || typeof incoming !== 'object') throw new Error('El archivo no tiene el formato esperado.');
  if (merge) {
    for (const key of ['events', 'tasks', 'routines']) {
      const existing = new Set(state[key].map((x) => x.id));
      for (const item of incoming[key] || []) {
        if (!existing.has(item.id)) state[key].push(item);
      }
    }
  } else {
    state = {
      ...structuredClone(DEFAULT_STATE),
      ...incoming,
      settings: { ...DEFAULT_STATE.settings, ...(incoming.settings || {}) },
    };
  }
  emit();
}

export function clearAll() {
  state = structuredClone(DEFAULT_STATE);
  emit();
}

/** Añade varios elementos de golpe (usado por la importación de .ics). */
export function addMany(items) {
  for (const item of items) {
    item.id = item.id || uid();
    item.createdAt = item.createdAt || new Date().toISOString();
    state[collectionFor(item.type)].push(item);
  }
  emit();
}
