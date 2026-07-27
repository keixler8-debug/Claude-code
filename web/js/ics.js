/*
 * Generación e importación de archivos .ics (iCalendar, RFC 5545).
 *
 * Este es el puente con el iPhone: el Calendario de iOS entiende VALARM, así que
 * cada evento/tarea/rutina exportada suena como una alerta nativa del sistema.
 * Usamos horas "flotantes" (sin zona horaria) a propósito: iOS las interpreta en
 * la hora local del teléfono, que es justo lo que quieres para una agenda personal.
 */

import { fromParts, parseLocal, dateKey } from './dates.js';
import { getState } from './store.js';

const ICS_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const pad = (n) => String(n).padStart(2, '0');

function escapeText(value = '') {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function unescapeText(value = '') {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/** 'YYYYMMDDTHHMMSS' en hora local flotante. */
function icsLocal(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

/** 'YYYYMMDD' para eventos de día completo. */
function icsDate(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/** 'YYYYMMDDTHHMMSSZ' en UTC (para DTSTAMP). */
function icsUTC(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Plegado de líneas a 75 octetos, como manda el RFC. */
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const charSize = new TextEncoder().encode(char).length;
    if (size + charSize > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += charSize;
  }
  if (current) out.push(current);
  return out.join('\r\n ');
}

function alarmBlock(minutesBefore, title) {
  const trigger = minutesBefore === 0 ? 'PT0M' : `-PT${minutesBefore}M`;
  return [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `TRIGGER:${trigger}`,
    `DESCRIPTION:${escapeText(title)}`,
    'END:VALARM',
  ];
}

function ruleToRRule(rule = {}, endDate) {
  const interval = Math.max(1, rule.interval || 1);
  const parts = [];
  if (rule.freq === 'daily') parts.push('FREQ=DAILY');
  else if (rule.freq === 'weekly') {
    parts.push('FREQ=WEEKLY');
    if (rule.byDay && rule.byDay.length) parts.push('BYDAY=' + rule.byDay.map((d) => ICS_DAYS[d]).join(','));
  } else if (rule.freq === 'monthly') {
    parts.push('FREQ=MONTHLY');
    if (rule.byMonthDay && rule.byMonthDay.length) parts.push('BYMONTHDAY=' + rule.byMonthDay.join(','));
  } else return null;
  if (interval > 1) parts.push('INTERVAL=' + interval);
  // DTSTART es flotante, así que UNTIL también debe serlo (RFC 5545 §3.3.10).
  if (endDate) parts.push('UNTIL=' + icsLocal(fromParts(endDate, '23:59')));
  return parts.join(';');
}

function vevent({ uid, stamp, title, notes, start, end, allDay, alarms, rrule, categories }) {
  const lines = ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${icsUTC(stamp)}`];
  if (allDay) {
    lines.push(`DTSTART;VALUE=DATE:${icsDate(start)}`);
    const dayAfter = new Date(end || start);
    dayAfter.setDate(dayAfter.getDate() + 1);
    lines.push(`DTEND;VALUE=DATE:${icsDate(dayAfter)}`);
  } else {
    lines.push(`DTSTART:${icsLocal(start)}`);
    lines.push(`DTEND:${icsLocal(end || new Date(start.getTime() + 30 * 60000))}`);
  }
  if (rrule) lines.push(`RRULE:${rrule}`);
  lines.push(`SUMMARY:${escapeText(title)}`);
  if (notes) lines.push(`DESCRIPTION:${escapeText(notes)}`);
  if (categories) lines.push(`CATEGORIES:${escapeText(categories)}`);
  for (const minutes of alarms || []) lines.push(...alarmBlock(minutes, title));
  lines.push('END:VEVENT');
  return lines;
}

/**
 * Construye el .ics completo.
 * opts.include = { events, tasks, routines } — qué exportar.
 * opts.includeDone = incluir tareas ya hechas.
 */
export function buildICS(opts = {}) {
  const { include = { events: true, tasks: true, routines: true }, includeDone = false } = opts;
  const state = getState();
  const stamp = new Date();
  const name = state.settings.calendarName || 'Mi Organizador';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Organizador//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    `X-WR-TIMEZONE:${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];

  if (include.events) {
    for (const ev of state.events) {
      const start = parseLocal(ev.start);
      if (!start) continue;
      lines.push(...vevent({
        uid: `${ev.id}@organizador`,
        stamp,
        title: ev.title,
        notes: ev.notes,
        start,
        end: ev.end ? parseLocal(ev.end) : null,
        allDay: ev.allDay,
        alarms: ev.alarms,
        categories: 'Evento',
      }));
    }
  }

  if (include.tasks) {
    for (const task of state.tasks) {
      if (!task.due) continue;
      if (task.done && !includeDone) continue;
      const due = parseLocal(task.due);
      lines.push(...vevent({
        uid: `${task.id}@organizador`,
        stamp,
        title: (task.done ? '✓ ' : '') + task.title,
        notes: task.notes,
        start: due,
        end: null,
        allDay: task.allDay,
        alarms: task.done ? [] : task.alarms,
        categories: 'Tarea',
      }));
    }
  }

  if (include.routines) {
    for (const routine of state.routines) {
      const rrule = ruleToRRule(routine.rule, routine.endDate);
      if (!rrule) continue;
      const baseDate = routine.startDate || dateKey(new Date());
      const start = fromParts(baseDate, routine.time || '09:00');
      lines.push(...vevent({
        uid: `${routine.id}@organizador`,
        stamp,
        title: routine.title,
        notes: routine.notes,
        start,
        end: new Date(start.getTime() + 15 * 60000),
        allDay: false,
        alarms: routine.alarms,
        rrule,
        categories: 'Rutina',
      }));
    }
  }

  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/* ---------------- Importación ---------------- */

function unfold(text) {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

function parseIcsDate(value, params) {
  const isDate = /VALUE=DATE(?!-)/i.test(params || '') || /^\d{8}$/.test(value);
  if (isDate) {
    const y = +value.slice(0, 4), m = +value.slice(4, 6), d = +value.slice(6, 8);
    return { date: new Date(y, m - 1, d), allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(value);
  if (!m) return null;
  if (m[7] === 'Z') {
    return { date: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0))), allDay: false };
  }
  return { date: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)), allDay: false };
}

function rruleToRule(value) {
  const parts = Object.fromEntries(
    value.split(';').map((p) => {
      const [k, v] = p.split('=');
      return [k.toUpperCase(), v];
    })
  );
  const interval = parseInt(parts.INTERVAL || '1', 10) || 1;
  const freq = (parts.FREQ || '').toUpperCase();
  if (freq === 'DAILY') return { freq: 'daily', interval };
  if (freq === 'WEEKLY') {
    const byDay = (parts.BYDAY || '')
      .split(',')
      .map((d) => ICS_DAYS.indexOf(d.replace(/^[-+]?\d+/, '').toUpperCase()))
      .filter((i) => i >= 0);
    return { freq: 'weekly', interval, byDay };
  }
  if (freq === 'MONTHLY') {
    const byMonthDay = (parts.BYMONTHDAY || '')
      .split(',')
      .map((n) => parseInt(n, 10))
      .filter((n) => n >= 1 && n <= 31);
    return { freq: 'monthly', interval, byMonthDay };
  }
  return null;
}

/**
 * Lee un .ics y devuelve elementos listos para `store.addMany`.
 * Los VEVENT con RRULE se convierten en rutinas; el resto, en eventos.
 */
export function parseICS(text) {
  const lines = unfold(text).split(/\r?\n/);
  const items = [];
  let current = null;
  let alarmTrigger = null;
  let inAlarm = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line === 'BEGIN:VEVENT') { current = { alarms: [] }; continue; }
    if (line === 'END:VEVENT') {
      if (current && current.title && current.start) items.push(finalize(current));
      current = null;
      continue;
    }
    if (!current) continue;

    if (line === 'BEGIN:VALARM') { inAlarm = true; alarmTrigger = null; continue; }
    if (line === 'END:VALARM') {
      if (alarmTrigger !== null) current.alarms.push(alarmTrigger);
      inAlarm = false;
      continue;
    }

    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const left = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [nameRaw, ...paramParts] = left.split(';');
    const name = nameRaw.toUpperCase();
    const params = paramParts.join(';');

    if (inAlarm) {
      if (name === 'TRIGGER') {
        const m = /^-?P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(value);
        if (m) {
          const mins = (+(m[1] || 0)) * 1440 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
          alarmTrigger = mins;
        }
      }
      continue;
    }

    switch (name) {
      case 'SUMMARY': current.title = unescapeText(value); break;
      case 'DESCRIPTION': current.notes = unescapeText(value); break;
      case 'DTSTART': {
        const parsed = parseIcsDate(value, params);
        if (parsed) { current.start = parsed.date; current.allDay = parsed.allDay; }
        break;
      }
      case 'DTEND': {
        const parsed = parseIcsDate(value, params);
        if (parsed) current.end = parsed.date;
        break;
      }
      case 'RRULE': current.rule = rruleToRule(value); break;
      default: break;
    }
  }

  return items;
}

function localInput(d) {
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function finalize(raw) {
  const alarms = [...new Set(raw.alarms)].sort((a, b) => a - b);
  if (raw.rule) {
    return {
      type: 'routine',
      title: raw.title,
      notes: raw.notes || '',
      time: raw.allDay ? '' : `${pad(raw.start.getHours())}:${pad(raw.start.getMinutes())}`,
      rule: raw.rule,
      startDate: dateKey(raw.start),
      endDate: null,
      alarms,
      completions: {},
      color: 'violet',
    };
  }
  let end = raw.end || null;
  if (raw.allDay && end) {
    // En .ics el DTEND de un evento de día completo es exclusivo: resta un día.
    end = new Date(end.getTime() - 86400000);
  }
  return {
    type: 'event',
    title: raw.title,
    notes: raw.notes || '',
    start: raw.allDay ? dateKey(raw.start) + 'T00:00' : localInput(raw.start),
    end: end ? (raw.allDay ? dateKey(end) + 'T23:59' : localInput(end)) : '',
    allDay: Boolean(raw.allDay),
    alarms,
    color: 'blue',
  };
}
