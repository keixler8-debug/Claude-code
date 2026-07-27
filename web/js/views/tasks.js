import { el, segmented } from '../ui.js';
import { occurrenceRow, listCard, sectionTitle } from '../components.js';
import { getState } from '../store.js';
import { parseLocal, startOfDay, dateKey, daysBetween, formatDateShort } from '../dates.js';

const state = { filter: 'pendientes' };

export function renderTasks() {
  const root = el('div');
  const all = getState().tasks;

  root.append(el('div', { style: { marginBottom: '6px' } }, [
    segmented([
      { value: 'pendientes', label: 'Pendientes' },
      { value: 'hechas', label: 'Hechas' },
      { value: 'todas', label: 'Todas' },
    ], state.filter, (value) => { state.filter = value; repaint(); }),
  ]));

  const visible = all.filter((t) => {
    if (state.filter === 'pendientes') return !t.done;
    if (state.filter === 'hechas') return t.done;
    return true;
  });

  if (!visible.length) {
    root.append(sectionTitle('Tareas puntuales'));
    root.append(listCard([], 'Sin tareas aquí', 'Las tareas puntuales son las que se hacen una vez y se acaban.'));
    return root;
  }

  const today = startOfDay(new Date());
  const groups = new Map([
    ['Atrasadas', []],
    ['Hoy', []],
    ['Esta semana', []],
    ['Más adelante', []],
    ['Sin fecha', []],
  ]);

  for (const task of visible) {
    const row = toRow(task);
    if (!task.due) { groups.get('Sin fecha').push(row); continue; }
    const diff = daysBetween(today, parseLocal(task.due));
    if (diff < 0) groups.get(task.done ? 'Más adelante' : 'Atrasadas').push(row);
    else if (diff === 0) groups.get('Hoy').push(row);
    else if (diff <= 7) groups.get('Esta semana').push(row);
    else groups.get('Más adelante').push(row);
  }

  for (const [name, rows] of groups) {
    if (!rows.length) continue;
    root.append(sectionTitle(`${name} · ${rows.length}`));
    root.append(listCard(rows, ''));
  }

  return root;
}

function toRow(task) {
  const due = task.due ? parseLocal(task.due) : null;
  return occurrenceRow({
    key: `task:${task.id}`,
    kind: 'task',
    item: task,
    title: task.title,
    start: due && !task.allDay ? due : null,
    end: null,
    allDay: !due || Boolean(task.allDay),
    done: Boolean(task.done),
    overdue: Boolean(due) && !task.done && due < new Date(),
    dateKey: due ? dateKey(due) : '',
    dueLabel: due ? formatDateShort(due) : '',
  });
}

let repaint = () => {};

export function setTasksRepaint(fn) {
  repaint = fn;
}
