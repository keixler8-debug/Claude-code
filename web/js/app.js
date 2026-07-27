/* Punto de entrada: pestañas, repintado y la alarma en pantalla. */

import { el, icon, ICONS, toast } from './ui.js';
import { subscribe } from './store.js';
import { openEditor } from './editor.js';
import { formatTime, formatDateLong } from './dates.js';
import * as alarms from './alarms.js';

import { renderToday, todayActions } from './views/today.js';
import { renderCalendar, setCalendarRepaint } from './views/calendar.js';
import { renderTasks, setTasksRepaint } from './views/tasks.js';
import { renderRoutines } from './views/routines.js';
import { renderSettings, setSettingsRepaint } from './views/settings.js';

const VIEWS = {
  hoy: { title: 'Hoy', render: renderToday, actions: todayActions, newType: 'task' },
  calendario: { title: 'Calendario', render: renderCalendar, newType: 'event' },
  tareas: { title: 'Tareas', render: renderTasks, newType: 'task' },
  rutinas: { title: 'Rutinas', render: renderRoutines, newType: 'routine' },
  ajustes: { title: 'Ajustes', render: renderSettings, newType: 'task' },
};

let current = 'hoy';

const viewRoot = document.getElementById('view');
const titleNode = document.getElementById('view-title');
const actionsNode = document.getElementById('topbar-actions');

function render() {
  const view = VIEWS[current];
  titleNode.textContent = view.title;
  actionsNode.replaceChildren(...(view.actions ? view.actions() : []));

  const scroll = window.scrollY;
  viewRoot.replaceChildren(view.render());
  window.scrollTo({ top: scroll });

  for (const tab of document.querySelectorAll('.tab')) {
    tab.setAttribute('aria-selected', String(tab.dataset.tab === current));
  }
}

function go(tab) {
  if (!VIEWS[tab]) return;
  current = tab;
  location.hash = '#' + tab;
  window.scrollTo({ top: 0 });
  render();
}

/* ---- Pestañas ---- */

document.getElementById('tabbar').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (tab) go(tab.dataset.tab);
});

window.addEventListener('hashchange', () => {
  const tab = location.hash.replace('#', '');
  if (VIEWS[tab] && tab !== current) { current = tab; render(); }
});

document.getElementById('fab').addEventListener('click', () => {
  openEditor(VIEWS[current].newType);
});

/* ---- Repintado tras cualquier cambio de datos ---- */

subscribe(() => render());
setCalendarRepaint(render);
setTasksRepaint(render);
setSettingsRepaint(render);

/* Cambio de día a medianoche: refresca la vista sola. */
let lastDay = new Date().toDateString();
setInterval(() => {
  const today = new Date().toDateString();
  if (today !== lastDay) { lastDay = today; render(); }
}, 30000);

/* ---- Alarma en pantalla ---- */

const alarmRoot = document.getElementById('alarm-root');

function showAlarm(due) {
  const [first, ...rest] = due;
  const occ = first.occurrence;

  const dismiss = () => {
    alarms.stopRinging();
    alarmRoot.replaceChildren();
  };

  const card = el('div', { class: 'alarm-card' }, [
    el('div', { class: 'alarm-bell' }, [icon(ICONS.bell)]),
    el('div', { class: 'alarm-when', text: whenLabel(first) }),
    el('div', { class: 'alarm-title', text: occ.title }),
    el('div', {
      class: 'alarm-sub',
      text: occ.start ? `${formatDateLong(occ.start)} · ${formatTime(occ.start)}` : 'Sin hora',
    }),
    el('button', { class: 'btn', type: 'button', text: 'Vale', onClick: dismiss }),
    el('button', {
      class: 'btn secondary', type: 'button', text: 'Posponer 5 min',
      onClick: () => { alarms.snooze(first, 5); alarmRoot.replaceChildren(); toast('Vuelvo en 5 minutos'); },
    }),
    rest.length ? el('div', { class: 'alarm-more', text: `y ${rest.length} aviso(s) más a la vez` }) : null,
  ]);

  alarmRoot.replaceChildren(el('div', { class: 'alarm-backdrop' }, [card]));
}

function whenLabel(alarm) {
  const m = alarm.minutesBefore;
  if (!m) return 'Es la hora';
  const falta = (n, unidad) => (n === 1 ? `Falta 1 ${unidad}` : `Faltan ${n} ${unidad}s`);
  if (m < 60) return falta(m, 'minuto');
  if (m < 1440) return falta(Math.round(m / 60), 'hora');
  return falta(Math.round(m / 1440), 'día');
}

alarms.start(showAlarm);

/* El audio de iOS necesita un gesto previo del usuario para poder sonar después. */
const unlock = () => alarms.unlockAudio();
document.addEventListener('pointerdown', unlock, { once: true });
document.addEventListener('keydown', unlock, { once: true });

/* ---- Arranque ---- */

const initial = location.hash.replace('#', '');
if (VIEWS[initial]) current = initial;
render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW no registrado:', err));
  });
}
