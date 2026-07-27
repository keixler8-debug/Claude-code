/* Utilidades de fecha. Todo se trabaja en hora local del dispositivo. */

export const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const DAY_SHORT = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
export const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' de una fecha local. */
export function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'HH:MM' de una fecha local. */
export function timeKey(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convierte 'YYYY-MM-DD' (+ opcional 'HH:MM') en un Date local. */
export function fromParts(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

/** Acepta 'YYYY-MM-DDTHH:MM' (local, sin zona) o un ISO completo. */
export function parseLocal(value) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(value);
  if (!m) return new Date(value);
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), 0, 0);
}

/** Serializa a 'YYYY-MM-DDTHH:MM' (lo que espera <input type="datetime-local">). */
export function toLocalInput(d) {
  if (!d) return '';
  return `${dateKey(d)}T${timeKey(d)}`;
}

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addMonths(d, n) {
  const x = new Date(d);
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  return x;
}

export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isToday(d) {
  return sameDay(d, new Date());
}

/** Días de diferencia en el calendario (ignora la hora). */
export function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}

/** Lunes (o el día configurado) de la semana que contiene `d`. */
export function startOfWeek(d, weekStart = 1) {
  const x = startOfDay(d);
  const diff = (x.getDay() - weekStart + 7) % 7;
  return addDays(x, -diff);
}

/** Rejilla de 6x7 días que cubre el mes de `d`. */
export function monthGrid(d, weekStart = 1) {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const start = startOfWeek(first, weekStart);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function formatTime(d) {
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateLong(d) {
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} de ${MONTH_NAMES[d.getMonth()]}`;
}

export function formatDateShort(d) {
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}`;
}

export function formatMonthYear(d) {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

/** "en 15 min", "hace 2 h", "mañana"… */
export function relative(target, now = new Date()) {
  const diffMin = Math.round((target - now) / 60000);
  const abs = Math.abs(diffMin);
  if (abs < 1) return 'ahora';
  if (abs < 60) return diffMin > 0 ? `en ${abs} min` : `hace ${abs} min`;
  const days = daysBetween(now, target);
  if (days === 0) {
    const h = Math.round(abs / 60);
    return diffMin > 0 ? `en ${h} h` : `hace ${h} h`;
  }
  if (days === 1) return 'mañana';
  if (days === -1) return 'ayer';
  if (days > 0) return `en ${days} días`;
  return `hace ${Math.abs(days)} días`;
}
