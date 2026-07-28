import { el, openSheet, sheetHeader, toast, colorVar } from '../ui.js';
import { occurrenceRow, listCard, sectionTitle } from '../components.js';
import { getState, isRoutineDone, save, getSettings } from '../store.js';
import { routineOccursOn, routineStats, describeRule } from '../agenda.js';
import { dateKey, fromParts, addDays, startOfWeek, startOfDay, DAY_SHORT, formatDateLong } from '../dates.js';
import { openEditor } from '../editor.js';

const HEATMAP_WEEKS = 12;

export function renderRoutines() {
  const root = el('div');
  const routines = getState().routines;

  if (!routines.length) {
    root.append(sectionTitle('Tareas diarias'));
    root.append(listCard([], 'Todavía no hay ninguna',
      'Son las cosas que repites: la medicación, el gimnasio, sacar la basura…'));
    root.append(el('button', {
      class: 'btn', type: 'button', text: '+ Escribir mi lista de una vez',
      style: { marginTop: '12px' },
      onClick: openBulkAdd,
    }));
    return root;
  }

  const today = new Date();
  const key = dateKey(today);
  const active = routines.filter((r) => routineOccursOn(r, today));
  const rest = routines.filter((r) => !routineOccursOn(r, today));

  /* --- La lista de hoy, para ir marcando --- */
  if (active.length) {
    const done = active.filter((r) => isRoutineDone(r, key)).length;
    root.append(sectionTitle(`Hoy · ${done}/${active.length}`, progressPill(done, active.length)));
    root.append(listCard(active.map((r) => routineRow(r, today)), ''));
  } else {
    root.append(sectionTitle('Hoy'));
    root.append(listCard([], 'Hoy no toca ninguna', 'Descansa.'));
  }

  /* --- Seguimiento --- */
  root.append(sectionTitle('Seguimiento', el('button', {
    class: 'link-btn', type: 'button', text: '+ Añadir varias',
    onClick: openBulkAdd,
  })));
  root.append(el('div', { class: 'card' }, routines.map(trackerRow)));

  if (rest.length) {
    root.append(sectionTitle('Hoy no tocan'));
    root.append(listCard(rest.map((r) => routineRow(r, today)), ''));
  }

  return root;
}

function progressPill(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return el('span', { class: 'chip', style: { color: pct === 100 ? 'var(--ok)' : 'var(--muted)' }, text: `${pct}%` });
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

/* ---------- Fila de seguimiento ---------- */

function trackerRow(routine) {
  const stats = routineStats(routine);
  const today = startOfDay(new Date());

  const cells = el('div', { class: 'heat-strip' });
  for (let i = 13; i >= 0; i--) {
    const day = addDays(today, -i);
    cells.append(dayCell(routine, day, stats));
  }

  const labels = el('div', { class: 'heat-strip heat-labels' });
  for (let i = 13; i >= 0; i--) {
    const day = addDays(today, -i);
    labels.append(el('span', { text: DAY_SHORT[day.getDay()] }));
  }

  return el('button', {
    class: 'tracker',
    type: 'button',
    onClick: () => openDetail(routine),
  }, [
    el('div', { class: 'tracker-head' }, [
      el('span', { class: 'dot', style: { '--dot': colorVar(routine.color) } }),
      el('span', { class: 'tracker-title', text: routine.title }),
      el('span', { class: 'tracker-rate', text: stats.rate === null ? '—' : `${stats.rate}%` }),
    ]),
    el('div', { class: 'tracker-stats' }, [
      stat('Racha', stats.current, stats.current >= 3 ? 'var(--ok)' : null),
      stat('Mejor', stats.best),
      stat('Hechas', `${stats.doneTotal}/${stats.dueTotal}`),
    ]),
    cells,
    labels,
  ]);
}

function stat(label, value, color) {
  return el('span', { class: 'tracker-stat' }, [
    el('b', { text: String(value), style: color ? { color } : {} }),
    ' ' + label.toLowerCase(),
  ]);
}

/** Un cuadradito del mapa: verde hecho, rojo perdido, hueco si no tocaba. */
function dayCell(routine, day, stats, { big = false } = {}) {
  const key = dateKey(day);
  const entry = stats.history.find((h) => h.key === key);
  const due = entry ? entry.due : routineOccursOn(routine, day);
  const done = entry ? entry.done : isRoutineDone(routine, key);
  const isToday = key === dateKey(new Date());
  const future = day > startOfDay(new Date());

  let state = 'none';
  if (future) state = 'future';
  else if (due && done) state = 'done';
  else if (due && isToday) state = 'today';
  else if (due) state = 'missed';

  return el('span', {
    class: `heat-cell heat-${state}` + (big ? ' big' : ''),
    title: `${key} · ${due ? (done ? 'hecho' : 'sin hacer') : 'no tocaba'}`,
  });
}

/* ---------- Detalle: historial completo ---------- */

function openDetail(routine) {
  const stats = routineStats(routine, { windowDays: 30 });
  const today = startOfDay(new Date());
  const weekStart = getSettings().startOfWeek;

  openSheet((sheet, close) => {
    sheet.append(sheetHeader(routine.title, {
      onCancel: close,
      onSave: () => { close(); openEditor('routine', routine); },
      saveLabel: 'Editar',
    }));

    sheet.append(el('p', { class: 'hint-text', style: { margin: '0 0 14px' }, text: describeRule(routine.rule) }));

    sheet.append(el('div', { class: 'card stat-grid' }, [
      bigStat('Racha actual', stats.current, 'días seguidos'),
      bigStat('Mejor racha', stats.best, 'días seguidos'),
      bigStat('Últimos 30 días', stats.rate === null ? '—' : stats.rate + '%', `${stats.doneWindow} de ${stats.dueWindow}`),
      bigStat('Desde el principio', `${stats.doneTotal}/${stats.dueTotal}`, 'días hechos'),
    ]));

    /* Mapa de las últimas 12 semanas */
    sheet.append(el('div', { class: 'section-title', style: { marginTop: '20px' } }, [
      el('span', { text: `Últimas ${HEATMAP_WEEKS} semanas` }),
    ]));

    const grid = el('div', { class: 'heat-grid' });
    const first = startOfWeek(addDays(today, -7 * (HEATMAP_WEEKS - 1)), weekStart);

    const rowLabels = el('div', { class: 'heat-col heat-daynames' });
    for (let i = 0; i < 7; i++) rowLabels.append(el('span', { text: DAY_SHORT[(weekStart + i) % 7] }));
    grid.append(rowLabels);

    for (let w = 0; w < HEATMAP_WEEKS; w++) {
      const col = el('div', { class: 'heat-col' });
      for (let d = 0; d < 7; d++) {
        col.append(dayCell(routine, addDays(first, w * 7 + d), stats, { big: true }));
      }
      grid.append(col);
    }
    sheet.append(el('div', { style: { overflowX: 'auto' } }, [grid]));

    sheet.append(el('div', { class: 'legend' }, [
      legendItem('done', 'hecho'),
      legendItem('missed', 'sin hacer'),
      legendItem('none', 'no tocaba'),
    ]));

    /* Días perdidos recientes, para saber dónde flojeas */
    const missed = stats.history
      .filter((h) => h.due && !h.done && h.key !== dateKey(today))
      .slice(-6)
      .reverse();

    if (missed.length) {
      sheet.append(el('div', { class: 'section-title', style: { marginTop: '20px' } }, [
        el('span', { text: 'Últimos días que se te pasó' }),
      ]));
      sheet.append(el('div', { class: 'card' }, missed.map((entry) => el('div', {
        class: 'row',
        style: { padding: '10px 14px' },
      }, [
        el('div', { class: 'row-main' }, [
          el('div', { class: 'row-title', style: { fontSize: '14px' }, text: formatDateLong(entry.date) }),
        ]),
        el('button', {
          class: 'link-btn',
          type: 'button',
          text: 'Marcar',
          onClick: (e) => {
            e.stopPropagation();
            routine.completions = routine.completions || {};
            routine.completions[entry.key] = new Date().toISOString();
            save(routine);
            close();
            toast('Marcado');
          },
        }),
      ]))));
    }
  });
}

function bigStat(label, value, hint) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'stat-value', text: String(value) }),
    el('div', { class: 'stat-label', text: label }),
    el('div', { class: 'stat-hint', text: hint }),
  ]);
}

function legendItem(state, label) {
  return el('span', { class: 'legend-item' }, [
    el('span', { class: `heat-cell heat-${state}` }),
    label,
  ]);
}

/* ---------- Escribir la lista entera de golpe ---------- */

function openBulkAdd() {
  openSheet((sheet, close) => {
    let text = '';
    let time = '';

    const commit = () => {
      const titles = text.split('\n').map((line) => line.trim()).filter(Boolean);
      if (!titles.length) { toast('Escribe al menos una', 'error'); return; }
      const colors = ['violet', 'teal', 'orange', 'pink', 'blue', 'green'];
      titles.forEach((title, i) => {
        save({
          type: 'routine',
          title,
          notes: '',
          time,
          rule: { freq: 'daily', interval: 1, byDay: [], byMonthDay: [] },
          startDate: dateKey(new Date()),
          endDate: '',
          alarms: time ? [...getSettings().defaultAlarms] : [],
          completions: {},
          color: colors[i % colors.length],
        });
      });
      close();
      toast(`${titles.length} tarea(s) diaria(s) añadida(s)`);
    };

    sheet.append(
      sheetHeader('Mi lista diaria', { onSave: commit, saveLabel: 'Crear' }),
      el('p', { class: 'hint-text', style: { margin: '0 0 12px' },
        text: 'Una por línea. Se crean como tareas de todos los días; luego puedes cambiar cualquiera para que sea solo algunos días.' }),
      el('div', { class: 'field' }, [
        el('textarea', {
          placeholder: 'Tomar la medicación\nHacer la cama\nBeber 2 L de agua\nLeer 20 minutos',
          style: { minHeight: '150px' },
          autocapitalize: 'sentences',
          onInput: (e) => { text = e.target.value; },
        }),
      ]),
      el('div', { class: 'field' }, [
        el('label', { text: 'Hora (opcional, para que suene la alarma)' }),
        el('input', { type: 'time', onChange: (e) => { time = e.target.value; } }),
      ]),
      el('button', { class: 'btn', type: 'button', text: 'Crear', onClick: commit })
    );
  });
}
