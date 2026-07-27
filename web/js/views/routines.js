import { el } from '../ui.js';
import { occurrenceRow, listCard, sectionTitle } from '../components.js';
import { getState, isRoutineDone } from '../store.js';
import { routineOccursOn } from '../agenda.js';
import { dateKey, fromParts, addDays, DAY_SHORT, isToday } from '../dates.js';

export function renderRoutines() {
  const root = el('div');
  const routines = getState().routines;

  if (!routines.length) {
    root.append(sectionTitle('Rutinas'));
    root.append(listCard([], 'Todavía no hay rutinas',
      'Una rutina es algo que se repite: tomar la medicación, el gimnasio, sacar la basura…'));
    return root;
  }

  const today = new Date();
  const key = dateKey(today);
  const active = routines.filter((r) => routineOccursOn(r, today));
  const rest = routines.filter((r) => !routineOccursOn(r, today));

  if (active.length) {
    const doneCount = active.filter((r) => isRoutineDone(r, key)).length;
    root.append(sectionTitle(`Hoy · ${doneCount}/${active.length}`));
    root.append(listCard(active.map((r) => routineRow(r, today)), ''));
  }

  root.append(sectionTitle('Racha de los últimos 14 días'));
  root.append(el('div', { class: 'card' }, routines.map((r) => streakRow(r, today))));

  if (rest.length) {
    root.append(sectionTitle('Hoy no tocan'));
    root.append(listCard(rest.map((r) => routineRow(r, today, { inactive: true })), ''));
  }

  return root;
}

function routineRow(routine, date) {
  const key = dateKey(date);
  return occurrenceRow({
    key: `routine:${routine.id}:${key}`,
    kind: 'routine',
    item: routine,
    title: routine.title,
    start: routine.time ? fromParts(key, routine.time) : null,
    end: null,
    allDay: !routine.time,
    done: isRoutineDone(routine, key),
    overdue: false,
    dateKey: key,
  });
}

/** Cuadrícula de 14 días: verde si se hizo, hueco si tocaba y no se hizo. */
function streakRow(routine, today) {
  const cells = el('div', { style: { display: 'flex', gap: '3px', marginTop: '6px' } });
  for (let i = 13; i >= 0; i--) {
    const day = addDays(today, -i);
    const key = dateKey(day);
    const due = routineOccursOn(routine, day);
    const done = isRoutineDone(routine, key);
    let background = 'var(--surface-2)';
    if (due && done) background = 'var(--ok)';
    else if (due && !done && !isToday(day)) background = 'color-mix(in srgb, var(--danger) 35%, transparent)';
    else if (due) background = 'color-mix(in srgb, var(--accent) 30%, transparent)';
    cells.append(el('div', {
      title: `${key}${due ? (done ? ' · hecho' : ' · pendiente') : ' · no tocaba'}`,
      style: { flex: '1', height: '22px', borderRadius: '4px', background },
    }));
  }

  const labels = el('div', { style: { display: 'flex', gap: '3px', marginTop: '3px' } });
  for (let i = 13; i >= 0; i--) {
    const day = addDays(today, -i);
    labels.append(el('div', {
      style: { flex: '1', textAlign: 'center', fontSize: '9px', color: 'var(--muted)' },
      text: DAY_SHORT[day.getDay()],
    }));
  }

  const total = countDone(routine);
  return el('div', { style: { padding: '12px 14px', borderBottom: '1px solid var(--line)' } }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px' } }, [
      el('div', { style: { fontWeight: '550', fontSize: '15px' }, text: routine.title }),
      el('div', { style: { fontSize: '13px', color: 'var(--muted)' }, text: `${total} veces` }),
    ]),
    cells,
    labels,
  ]);
}

function countDone(routine) {
  return Object.keys(routine.completions || {}).length;
}
