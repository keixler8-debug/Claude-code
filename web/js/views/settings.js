import { el, toggle, field, download, toast, confirmDialog } from '../ui.js';
import { sectionTitle } from '../components.js';
import { getSettings, updateSettings, exportJSON, importJSON, clearAll, addMany, getState } from '../store.js';
import { buildICS, parseICS } from '../ics.js';
import { requestNotificationPermission, notificationsSupported, startRinging, stopRinging } from '../alarms.js';
import { dateKey } from '../dates.js';

const ALARM_PRESETS = [0, 5, 10, 15, 30, 60];

export function renderSettings() {
  const settings = getSettings();
  const root = el('div');
  const state = getState();

  /* ---- iPhone ---- */
  root.append(sectionTitle('Alarmas en el iPhone'));
  root.append(el('div', { class: 'card' }, [
    el('div', { style: { padding: '14px' } }, [
      el('p', { style: { margin: '0 0 10px', fontSize: '14px', color: 'var(--muted)' },
        text: 'Una web no puede sonar sola con el móvil bloqueado. La forma fiable de que el iPhone te avise es pasar tu agenda al Calendario de iOS: sus alertas sí son del sistema.' }),
      el('button', {
        class: 'btn', type: 'button', text: '📅 Enviar al Calendario del iPhone',
        onClick: shareICS,
      }),
      el('button', {
        class: 'btn secondary', type: 'button', text: 'Descargar archivo .ics',
        onClick: () => {
          download(`organizador-${dateKey(new Date())}.ics`, buildICS(), 'text/calendar');
          toast('Archivo .ics generado');
        },
      }),
      el('p', { class: 'hint-text' },
        ['En el iPhone: pulsa «Enviar al Calendario», elige ',
         el('b', { text: 'Calendario' }),
         ' en el menú de compartir y confirma «Añadir todo». Las alarmas que hayas puesto se convierten en alertas nativas.']),
    ]),
  ]));

  /* ---- Notificaciones ---- */
  root.append(sectionTitle('Avisos dentro de la app'));
  const permission = notificationsSupported() ? Notification.permission : 'unsupported';
  root.append(el('div', { class: 'card' }, [
    toggle('Sonido de alarma', 'Timbre y vibración cuando la app está abierta', settings.sound,
      (checked) => { updateSettings({ sound: checked }); }),
    el('div', { class: 'toggle-row' }, [
      el('div', {}, [
        el('div', { class: 'label', text: 'Notificaciones del navegador' }),
        el('div', { class: 'hint', text: permissionHint(permission) }),
      ]),
      permission === 'granted'
        ? el('span', { style: { color: 'var(--ok)', fontWeight: '600' }, text: 'Activadas' })
        : el('button', {
            class: 'pill', type: 'button', text: 'Activar',
            onClick: async () => {
              const result = await requestNotificationPermission();
              toast(result === 'granted' ? 'Notificaciones activadas' : 'No se concedió el permiso',
                result === 'granted' ? '' : 'error');
              repaint();
            },
          }),
    ]),
    el('div', { class: 'toggle-row' }, [
      el('div', {}, [
        el('div', { class: 'label', text: 'Probar la alarma' }),
        el('div', { class: 'hint', text: 'Comprueba que se oye en este dispositivo' }),
      ]),
      el('button', {
        class: 'pill', type: 'button', text: 'Probar',
        onClick: () => { startRinging(); setTimeout(stopRinging, 3500); },
      }),
    ]),
  ]));

  /* ---- Preferencias ---- */
  root.append(sectionTitle('Preferencias'));
  root.append(el('div', { class: 'card', style: { padding: '14px' } }, [
    field('Alarmas por defecto para lo nuevo', alarmDefaults(settings)),
    field('Nombre del calendario exportado', el('input', {
      type: 'text', value: settings.calendarName,
      onChange: (e) => updateSettings({ calendarName: e.target.value.trim() || 'Mi Organizador' }),
    })),
    field('La semana empieza en', el('select', {
      onChange: (e) => { updateSettings({ startOfWeek: Number(e.target.value) }); },
    }, [
      el('option', { value: '1', selected: settings.startOfWeek === 1, text: 'Lunes' }),
      el('option', { value: '0', selected: settings.startOfWeek === 0, text: 'Domingo' }),
    ])),
  ]));

  /* ---- Datos ---- */
  root.append(sectionTitle('Tus datos'));
  root.append(el('div', { class: 'card' }, [
    el('div', { style: { padding: '14px' } }, [
      el('p', { style: { margin: '0 0 12px', fontSize: '14px', color: 'var(--muted)' },
        text: `${state.events.length} eventos · ${state.tasks.length} tareas · ${state.routines.length} rutinas. Todo se guarda solo en este dispositivo.` }),
      el('button', {
        class: 'btn secondary', type: 'button', text: 'Guardar copia de seguridad (.json)',
        onClick: () => {
          download(`organizador-backup-${dateKey(new Date())}.json`, exportJSON(), 'application/json');
          toast('Copia descargada');
        },
      }),
      fileButton('Restaurar copia (.json)', '.json,application/json', async (text) => {
        try {
          importJSON(text);
          toast('Copia restaurada');
        } catch (err) {
          toast('El archivo no es válido', 'error');
          console.error(err);
        }
      }),
      fileButton('Importar calendario (.ics)', '.ics,text/calendar', async (text) => {
        try {
          const items = parseICS(text);
          if (!items.length) { toast('No encontré eventos en ese archivo', 'error'); return; }
          addMany(items);
          toast(`${items.length} elemento(s) importado(s)`);
        } catch (err) {
          toast('No pude leer el .ics', 'error');
          console.error(err);
        }
      }),
      el('button', {
        class: 'btn secondary', type: 'button', text: 'Borrar todo',
        style: { color: 'var(--danger)' },
        onClick: () => confirmDialog('Se borrarán todos tus eventos, tareas y rutinas de este dispositivo.',
          () => { clearAll(); toast('Todo borrado'); }, { confirmLabel: 'Borrar todo' }),
      }),
    ]),
  ]));

  root.append(el('p', { class: 'hint-text', style: { textAlign: 'center', marginTop: '24px' },
    text: 'Organizador · funciona sin conexión · tus datos no salen de aquí' }));

  return root;
}

function permissionHint(permission) {
  if (permission === 'unsupported') return 'Este navegador no las admite';
  if (permission === 'granted') return 'Verás un aviso al saltar cada alarma';
  if (permission === 'denied') return 'Bloqueadas: actívalas en los ajustes del navegador';
  return 'En iPhone, añade antes la app a la pantalla de inicio';
}

function alarmDefaults(settings) {
  const wrap = el('div', { class: 'pills' });
  for (const minutes of ALARM_PRESETS) {
    const active = settings.defaultAlarms.includes(minutes);
    wrap.append(el('button', {
      class: 'pill', type: 'button',
      text: minutes === 0 ? 'A la hora' : minutes < 60 ? `${minutes} min` : `${minutes / 60} h`,
      'aria-pressed': String(active),
      onClick: () => {
        const next = active
          ? settings.defaultAlarms.filter((m) => m !== minutes)
          : [...settings.defaultAlarms, minutes].sort((a, b) => a - b);
        updateSettings({ defaultAlarms: next });
        repaint();
      },
    }));
  }
  return wrap;
}

function fileButton(label, accept, onText) {
  const input = el('input', {
    type: 'file', accept, style: { display: 'none' },
    onChange: async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      onText(await file.text());
      e.target.value = '';
    },
  });
  const button = el('button', { class: 'btn secondary', type: 'button', text: label, onClick: () => input.click() });
  return el('div', {}, [button, input]);
}

async function shareICS() {
  const content = buildICS();
  const filename = `${(getSettings().calendarName || 'organizador').replace(/[^\w-]+/g, '-').toLowerCase()}.ics`;
  const file = new File([content], filename, { type: 'text/calendar' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: getSettings().calendarName });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      console.warn('No se pudo compartir:', err);
    }
  }
  download(filename, content, 'text/calendar');
  toast('Tu navegador no comparte archivos: lo he descargado');
}

let repaint = () => {};

export function setSettingsRepaint(fn) {
  repaint = fn;
}
