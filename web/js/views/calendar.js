import { el, icon, ICONS, colorVar } from '../ui.js';
import { occurrenceRow, listCard, sectionTitle } from '../components.js';
import { occurrencesForDay } from '../agenda.js';
import {
  monthGrid, dateKey, isToday, sameDay, addMonths, formatMonthYear, formatDateLong,
  DAY_SHORT, startOfDay,
} from '../dates.js';
import { getSettings } from '../store.js';
import { openEditor } from '../editor.js';

/* El mes y el día elegidos sobreviven entre repintados. */
const view = { cursor: startOfDay(new Date()), selected: startOfDay(new Date()) };

export function renderCalendar() {
  const weekStart = getSettings().startOfWeek;
  const root = el('div');

  root.append(el('div', { class: 'cal-head' }, [
    el('div', { class: 'month', text: formatMonthYear(view.cursor) }),
    el('div', { class: 'cal-nav' }, [
      el('button', {
        class: 'icon-btn', type: 'button', 'aria-label': 'Mes anterior',
        onClick: () => { view.cursor = addMonths(view.cursor, -1); repaint(); },
      }, [icon(ICONS.left)]),
      el('button', {
        class: 'icon-btn', type: 'button', 'aria-label': 'Hoy',
        onClick: () => { view.cursor = startOfDay(new Date()); view.selected = startOfDay(new Date()); repaint(); },
      }, [icon(ICONS.today)]),
      el('button', {
        class: 'icon-btn', type: 'button', 'aria-label': 'Mes siguiente',
        onClick: () => { view.cursor = addMonths(view.cursor, 1); repaint(); },
      }, [icon(ICONS.right)]),
    ]),
  ]));

  const weekdays = el('div', { class: 'weekdays' });
  for (let i = 0; i < 7; i++) weekdays.append(el('span', { text: DAY_SHORT[(weekStart + i) % 7] }));
  root.append(weekdays);

  const grid = el('div', { class: 'grid' });
  for (const day of monthGrid(view.cursor, weekStart)) {
    grid.append(dayCell(day));
  }
  root.append(grid);

  /* Detalle del día seleccionado */
  const items = occurrencesForDay(view.selected);
  root.append(sectionTitle(formatDateLong(view.selected), el('button', {
    class: 'link-btn', type: 'button', text: '+ Añadir',
    onClick: () => openEditor('event', null, { date: dateKey(view.selected) }),
  })));
  root.append(listCard(
    items.map((occ) => occurrenceRow(occ)),
    'Nada este día',
    'Toca «Añadir» para llenarlo.'
  ));

  return root;
}

function dayCell(day) {
  const items = occurrencesForDay(day);
  const outOfMonth = day.getMonth() !== view.cursor.getMonth();
  const pending = items.filter((o) => !o.done);

  const dots = el('div', { class: 'dots' });
  const colors = [...new Set(items.slice(0, 12).map((o) => o.item.color || 'blue'))].slice(0, 4);
  for (const color of colors) dots.append(el('div', { class: 'dot', style: { '--dot': colorVar(color) } }));

  return el('button', {
    class: 'day'
      + (outOfMonth ? ' out' : '')
      + (isToday(day) ? ' today' : '')
      + (sameDay(day, view.selected) ? ' selected' : ''),
    type: 'button',
    onClick: () => {
      view.selected = startOfDay(day);
      if (outOfMonth) view.cursor = startOfDay(day);
      repaint();
    },
  }, [
    el('span', { text: String(day.getDate()) }),
    dots,
    pending.length > 3 ? el('span', { class: 'count', text: `+${pending.length - 3}` }) : null,
  ]);
}

let repaint = () => {};

export function setCalendarRepaint(fn) {
  repaint = fn;
}

export function goToDate(date) {
  view.cursor = startOfDay(date);
  view.selected = startOfDay(date);
}
