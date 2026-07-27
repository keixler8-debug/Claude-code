import { el, icon, ICONS } from '../ui.js';
import { occurrenceRow, listCard, sectionTitle } from '../components.js';
import { occurrencesForDay, overdueTasks, inboxTasks, upcomingAlarms } from '../agenda.js';
import { formatDateLong, formatTime, relative, parseLocal, addDays, formatDateShort } from '../dates.js';
import { openEditor } from '../editor.js';

export function renderToday() {
  const now = new Date();
  const today = occurrencesForDay(now);
  const pending = today.filter((o) => !o.done);
  const doneCount = today.length - pending.length;
  const next = today.find((o) => !o.done && o.start && o.start > now);
  const nextAlarm = upcomingAlarms(now, 3)[0];

  const root = el('div');

  /* Cabecera */
  const hero = el('div', { class: 'hero' }, [
    el('div', { class: 'date', text: formatDateLong(now) }),
    el('div', { class: 'headline', text: headline(pending.length) }),
    el('div', {
      class: 'sub',
      text: today.length
        ? `${pending.length} pendiente${pending.length === 1 ? '' : 's'} · ${doneCount} hecho${doneCount === 1 ? '' : 's'}`
        : 'Nada en la agenda de hoy.',
    }),
  ]);

  if (next) {
    hero.append(el('div', { class: 'next-up' }, [
      el('div', {}, [
        el('div', { style: { opacity: .85, fontSize: '12px' }, text: 'A CONTINUACIÓN' }),
        el('b', { text: next.title }),
      ]),
      el('div', { style: { textAlign: 'right' } }, [
        el('div', { text: formatTime(next.start) }),
        el('div', { style: { opacity: .85, fontSize: '12px' }, text: relative(next.start, now) }),
      ]),
    ]));
  } else if (nextAlarm) {
    hero.append(el('div', { class: 'next-up' }, [
      el('div', {}, [
        el('div', { style: { opacity: .85, fontSize: '12px' }, text: 'PRÓXIMA ALARMA' }),
        el('b', { text: nextAlarm.occurrence.title }),
      ]),
      el('div', { style: { textAlign: 'right' } }, [
        el('div', { text: formatDateShort(nextAlarm.at) + ' ' + formatTime(nextAlarm.at) }),
        el('div', { style: { opacity: .85, fontSize: '12px' }, text: relative(nextAlarm.at, now) }),
      ]),
    ]));
  }

  root.append(hero);

  /* Atrasadas */
  const overdue = overdueTasks(now);
  if (overdue.length) {
    root.append(
      sectionTitle('Atrasado'),
      listCard(overdue.map((task) => occurrenceRow({
        key: `task:${task.id}:overdue`,
        kind: 'task',
        item: task,
        title: task.title,
        start: parseLocal(task.due),
        end: null,
        allDay: Boolean(task.allDay),
        done: false,
        overdue: true,
        dateKey: task.due.slice(0, 10),
      })), '')
    );
  }

  /* Hoy */
  root.append(sectionTitle('Hoy'));
  root.append(listCard(
    today.map((occ) => occurrenceRow(occ, { showRelative: true })),
    'Día despejado',
    'Toca el botón + para añadir algo.'
  ));

  /* Sin fecha */
  const inbox = inboxTasks();
  if (inbox.length) {
    root.append(sectionTitle('Sin fecha'));
    root.append(listCard(inbox.map((task) => occurrenceRow({
      key: `task:${task.id}:inbox`,
      kind: 'task',
      item: task,
      title: task.title,
      start: null,
      end: null,
      allDay: true,
      done: false,
      overdue: false,
      dateKey: '',
    })), ''));
  }

  /* Mañana */
  const tomorrow = occurrencesForDay(addDays(now, 1)).filter((o) => !o.done);
  if (tomorrow.length) {
    root.append(sectionTitle('Mañana'));
    root.append(listCard(tomorrow.map((occ) => occurrenceRow(occ)), ''));
  }

  return root;
}

function headline(pending) {
  if (pending === 0) return 'Todo listo';
  if (pending === 1) return 'Queda 1 cosa';
  return `Quedan ${pending} cosas`;
}

export function todayActions() {
  return [
    el('button', {
      class: 'icon-btn',
      type: 'button',
      'aria-label': 'Nueva tarea rápida',
      onClick: () => openEditor('task'),
    }, [icon(ICONS.check)]),
  ];
}
