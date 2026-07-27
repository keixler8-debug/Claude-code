/* Piezas de interfaz reutilizadas por varias vistas. */

import { el, icon, ICONS, colorVar } from './ui.js';
import { formatTime, relative } from './dates.js';
import { toggleTask, toggleRoutine } from './store.js';
import { describeRule } from './agenda.js';
import { openEditor } from './editor.js';

const KIND_LABEL = { event: 'Evento', task: 'Tarea', routine: 'Rutina' };

function alarmLabel(minutes) {
  if (minutes === 0) return 'a la hora';
  if (minutes < 60) return `${minutes} min antes`;
  if (minutes < 1440) return `${minutes / 60} h antes`;
  return `${minutes / 1440} d antes`;
}

/** Fila de una ocurrencia (evento, tarea o rutina en un día concreto). */
export function occurrenceRow(occ, { showRelative = false } = {}) {
  const { kind, item, done } = occ;
  const checkable = kind !== 'event';

  const check = checkable
    ? el('button', {
        class: 'check' + (done ? ' done' : ''),
        type: 'button',
        'aria-label': done ? 'Marcar como pendiente' : 'Marcar como hecho',
        onClick: (e) => {
          e.stopPropagation();
          if (kind === 'task') toggleTask(item.id);
          else toggleRoutine(item.id, occ.dateKey);
        },
      }, [icon(ICONS.check)])
    : el('div', {
        class: 'check',
        style: { border: 'none', background: colorVar(item.color), width: '10px', height: '10px', margin: '8px 7px 0' },
      });

  const meta = [];
  if (occ.dueLabel) meta.push(el('span', { class: 'chip' }, [icon(ICONS.clock, 12), occ.dueLabel]));
  if (kind === 'routine') meta.push(el('span', { class: 'chip' }, [icon(ICONS.repeat, 12), describeRule(item.rule)]));
  else if (!occ.dueLabel) meta.push(el('span', { class: 'chip', text: KIND_LABEL[kind] }));

  if (occ.overdue) meta.push(el('span', { class: 'overdue', text: 'atrasado' }));
  else if (showRelative && occ.start) meta.push(el('span', { text: relative(occ.start) }));

  if (occ.end && occ.start && !occ.allDay) meta.push(el('span', { text: `hasta ${formatTime(occ.end)}` }));

  for (const minutes of item.alarms || []) {
    meta.push(el('span', { class: 'chip alarm' }, [icon(ICONS.bell, 12), alarmLabel(minutes)]));
  }

  if (item.notes) meta.push(el('span', { text: item.notes.split('\n')[0].slice(0, 60) }));

  const row = el('div', {
    class: 'row' + (done ? ' done' : ''),
    style: { '--dot': colorVar(item.color) },
  }, [
    el('div', { class: 'row-bar' }),
    check,
    el('div', { class: 'row-main' }, [
      el('div', { class: 'row-title', text: occ.title }),
      el('div', { class: 'row-meta' }, meta),
    ]),
    el('div', { class: 'row-time', text: occ.allDay || !occ.start ? 'todo el día' : formatTime(occ.start) }),
    el('button', {
      class: 'row-edit',
      type: 'button',
      'aria-label': 'Editar',
      onClick: (e) => { e.stopPropagation(); openEditor(kind, item); },
    }, [icon(ICONS.pencil, 18)]),
  ]);

  return row;
}

export function emptyCard(title, hint) {
  return el('div', { class: 'card' }, [
    el('div', { class: 'empty' }, [el('strong', { text: title }), hint || '']),
  ]);
}

export function listCard(rows, emptyTitle, emptyHint) {
  if (!rows.length) return emptyCard(emptyTitle, emptyHint);
  return el('div', { class: 'card' }, rows);
}

export function sectionTitle(text, right) {
  return el('div', { class: 'section-title' }, [el('span', { text }), right || null]);
}
