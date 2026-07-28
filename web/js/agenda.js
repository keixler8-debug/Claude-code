/* Convierte eventos, tareas y rutinas en "ocurrencias" concretas de un día. */

import { dateKey, fromParts, parseLocal, addDays, startOfDay, endOfDay, daysBetween } from './dates.js';
import { getState, isRoutineDone } from './store.js';

/**
 * ¿Toca esta rutina el día `date`?
 * rule = { freq: 'daily' | 'weekly' | 'monthly', interval, byDay: [0..6], byMonthDay: [1..31] }
 */
export function routineOccursOn(routine, date) {
  const rule = routine.rule || { freq: 'daily', interval: 1 };
  const day = startOfDay(date);

  const from = routine.startDate ? startOfDay(fromParts(routine.startDate)) : null;
  if (from && day < from) return false;
  if (routine.endDate && day > endOfDay(fromParts(routine.endDate))) return false;

  const interval = Math.max(1, rule.interval || 1);

  if (rule.freq === 'daily') {
    if (!from || interval === 1) return true;
    return daysBetween(from, day) % interval === 0;
  }

  if (rule.freq === 'weekly') {
    const days = rule.byDay && rule.byDay.length ? rule.byDay : [day.getDay()];
    if (!days.includes(day.getDay())) return false;
    if (!from || interval === 1) return true;
    const weeks = Math.floor(daysBetween(from, day) / 7);
    return weeks % interval === 0;
  }

  if (rule.freq === 'monthly') {
    const nums = rule.byMonthDay && rule.byMonthDay.length ? rule.byMonthDay : [from ? from.getDate() : day.getDate()];
    // "día 31" en un mes de 30 se resuelve el último día del mes.
    const lastOfMonth = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
    const matches = nums.some((n) => n === day.getDate() || (n > lastOfMonth && day.getDate() === lastOfMonth));
    if (!matches) return false;
    if (!from || interval === 1) return true;
    const months = (day.getFullYear() - from.getFullYear()) * 12 + (day.getMonth() - from.getMonth());
    return months % interval === 0;
  }

  return false;
}

const PLURAL_DAYS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];

/** Descripción legible de la repetición. */
export function describeRule(rule = {}) {
  const n = Math.max(1, rule.interval || 1);
  if (rule.freq === 'daily') return n === 1 ? 'Todos los días' : `Cada ${n} días`;
  if (rule.freq === 'weekly') {
    const days = (rule.byDay || []).slice().sort();
    const isWeekdays = days.length === 5 && days.join() === '1,2,3,4,5';
    const isWeekend = days.length === 2 && days.join() === '0,6';
    let which;
    if (isWeekdays) which = 'de lunes a viernes';
    else if (isWeekend) which = 'los fines de semana';
    else if (days.length) which = 'los ' + days.map((d) => PLURAL_DAYS[d]).join(', ');
    else which = '';
    return n === 1 ? `Cada semana ${which}`.trim() : `Cada ${n} semanas ${which}`.trim();
  }
  if (rule.freq === 'monthly') {
    const days = (rule.byMonthDay || []).join(', ');
    const which = days ? `el día ${days}` : '';
    return n === 1 ? `Cada mes ${which}`.trim() : `Cada ${n} meses ${which}`.trim();
  }
  return 'Sin repetición';
}

/**
 * Ocurrencias de un día concreto, ordenadas por hora.
 * Cada ocurrencia: { key, kind, item, title, start: Date|null, end: Date|null, allDay, done, overdue }
 */
export function occurrencesForDay(date) {
  const state = getState();
  const key = dateKey(date);
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const now = new Date();
  const out = [];

  for (const ev of state.events) {
    const start = parseLocal(ev.start);
    if (!start) continue;
    const end = ev.end ? parseLocal(ev.end) : null;
    // Un evento aparece en el día si se solapa con él (soporta eventos de varios días).
    const last = end && end > start ? end : start;
    if (last < dayStart || start > dayEnd) continue;
    out.push({
      key: `event:${ev.id}:${key}`,
      kind: 'event',
      item: ev,
      title: ev.title,
      start,
      end,
      allDay: Boolean(ev.allDay),
      done: false,
      overdue: false,
      dateKey: key,
    });
  }

  for (const task of state.tasks) {
    if (!task.due) continue;
    const due = parseLocal(task.due);
    if (dateKey(due) !== key) continue;
    out.push({
      key: `task:${task.id}:${key}`,
      kind: 'task',
      item: task,
      title: task.title,
      start: task.allDay ? null : due,
      end: null,
      allDay: Boolean(task.allDay),
      done: Boolean(task.done),
      overdue: !task.done && due < now,
      dateKey: key,
    });
  }

  for (const routine of state.routines) {
    if (!routineOccursOn(routine, date)) continue;
    const start = routine.time ? fromParts(key, routine.time) : null;
    out.push({
      key: `routine:${routine.id}:${key}`,
      kind: 'routine',
      item: routine,
      title: routine.title,
      start,
      end: null,
      allDay: !routine.time,
      done: isRoutineDone(routine, key),
      overdue: Boolean(start) && !isRoutineDone(routine, key) && start < now,
      dateKey: key,
    });
  }

  return out.sort(sortOccurrences);
}

function sortOccurrences(a, b) {
  if (!a.start && !b.start) return a.title.localeCompare(b.title, 'es');
  if (!a.start) return -1;
  if (!b.start) return 1;
  return a.start - b.start;
}

/** Ocurrencias de un rango, agrupadas por día. Devuelve [{ date, key, items }]. */
export function occurrencesForRange(from, to) {
  const days = [];
  let cursor = startOfDay(from);
  const last = startOfDay(to);
  let guard = 0;
  while (cursor <= last && guard++ < 800) {
    days.push({ date: new Date(cursor), key: dateKey(cursor), items: occurrencesForDay(cursor) });
    cursor = addDays(cursor, 1);
  }
  return days;
}

/* Cuánto historial se recorre como mucho al calcular rachas. */
const MAX_HISTORY_DAYS = 400;

/**
 * Seguimiento de una rutina: qué días tocaba, cuáles hiciste y cuáles no.
 *
 * Devuelve:
 *   history    [{ date, key, due, done }] día a día desde que empezó la rutina
 *   dueTotal   días en los que tocaba
 *   doneTotal  días que la hiciste
 *   dueWindow / doneWindow / rate   lo mismo, limitado a los últimos `windowDays`
 *   current    racha actual (días con tarea seguidos hechos)
 *   best       la racha más larga que has tenido
 */
export function routineStats(routine, { now = new Date(), windowDays = 30 } = {}) {
  const today = startOfDay(now);
  const todayKey = dateKey(today);
  const earliest = addDays(today, -MAX_HISTORY_DAYS);
  const start = routine.startDate ? startOfDay(fromParts(routine.startDate)) : earliest;
  const from = start > earliest ? start : earliest;
  const windowStart = addDays(today, -(windowDays - 1));

  const history = [];
  let dueTotal = 0;
  let doneTotal = 0;
  let dueWindow = 0;
  let doneWindow = 0;
  let best = 0;
  let run = 0;

  for (let day = new Date(from); day <= today; day = addDays(day, 1)) {
    const key = dateKey(day);
    const due = routineOccursOn(routine, day);
    const done = isRoutineDone(routine, key);
    history.push({ date: new Date(day), key, due, done });
    if (!due) continue;

    dueTotal++;
    if (done) {
      doneTotal++;
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }

    if (day >= windowStart) {
      dueWindow++;
      if (done) doneWindow++;
    }
  }

  // Racha actual: se cuenta hacia atrás por los días en los que tocaba.
  // El día de hoy, si aún está pendiente, no rompe la racha: no ha terminado.
  const dueDays = history.filter((entry) => entry.due);
  let current = 0;
  for (let i = dueDays.length - 1; i >= 0; i--) {
    const entry = dueDays[i];
    if (entry.done) { current++; continue; }
    if (i === dueDays.length - 1 && entry.key === todayKey) continue;
    break;
  }

  return {
    history,
    dueTotal,
    doneTotal,
    dueWindow,
    doneWindow,
    rate: dueWindow ? Math.round((doneWindow / dueWindow) * 100) : null,
    current,
    best,
    windowDays,
  };
}

/** Tareas puntuales sin hacer cuya fecha ya pasó (antes de hoy). */
export function overdueTasks(now = new Date()) {
  const today = startOfDay(now);
  return getState()
    .tasks.filter((t) => !t.done && t.due && parseLocal(t.due) < today)
    .sort((a, b) => parseLocal(a.due) - parseLocal(b.due));
}

/** Tareas puntuales sin fecha. */
export function inboxTasks() {
  return getState().tasks.filter((t) => !t.due && !t.done);
}

/**
 * Próximas alarmas dentro de una ventana de tiempo.
 * Devuelve [{ at: Date, occurrence, minutesBefore, id }] ordenadas.
 */
export function upcomingAlarms(from = new Date(), windowDays = 8) {
  const alarms = [];
  const days = occurrencesForRange(from, addDays(from, windowDays));
  for (const day of days) {
    for (const occ of day.items) {
      if (!occ.start || occ.done) continue;
      const offsets = occ.item.alarms && occ.item.alarms.length ? occ.item.alarms : [];
      for (const minutes of offsets) {
        const at = new Date(occ.start.getTime() - minutes * 60000);
        if (at < from) continue;
        alarms.push({
          id: `${occ.key}@${minutes}`,
          at,
          minutesBefore: minutes,
          occurrence: occ,
        });
      }
    }
  }
  return alarms.sort((a, b) => a.at - b.at);
}
