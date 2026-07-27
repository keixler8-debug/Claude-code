/* Hoja para crear y editar eventos, tareas y rutinas. */

import { el, openSheet, closeSheet, sheetHeader, field, segmented, toggle, confirmDialog, toast, COLORS, colorVar } from './ui.js';
import { dateKey, timeKey, toLocalInput, parseLocal, fromParts, DAY_SHORT } from './dates.js';
import { save, remove, getSettings } from './store.js';

const ALARM_PRESETS = [
  { value: 0, label: 'A la hora' },
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 h' },
  { value: 120, label: '2 h' },
  { value: 1440, label: '1 día' },
];

const TYPES = [
  { value: 'event', label: 'Evento' },
  { value: 'task', label: 'Tarea' },
  { value: 'routine', label: 'Rutina' },
];

function blank(kind, defaults = {}) {
  const now = new Date();
  const base = {
    title: '',
    notes: '',
    color: 'blue',
    alarms: [...getSettings().defaultAlarms],
  };
  const day = defaults.date || dateKey(now);
  const nextHour = new Date(now.getTime() + 60 * 60000);
  nextHour.setMinutes(0, 0, 0);

  if (kind === 'event') {
    return { ...base, type: 'event', allDay: false, start: `${day}T${timeKey(nextHour)}`, end: '' };
  }
  if (kind === 'task') {
    return { ...base, type: 'task', color: 'green', allDay: false, due: `${day}T${timeKey(nextHour)}`, done: false };
  }
  return {
    ...base,
    type: 'routine',
    color: 'violet',
    time: '09:00',
    rule: { freq: 'daily', interval: 1, byDay: [], byMonthDay: [] },
    startDate: day,
    endDate: '',
    completions: {},
  };
}

/**
 * Abre el editor.
 * @param {'event'|'task'|'routine'} kind
 * @param {object|null} existing  elemento a editar, o null para crear
 * @param {{date?: string}} defaults
 */
export function openEditor(kind = 'event', existing = null, defaults = {}) {
  let draft = existing
    ? structuredClone(existing)
    : blank(kind, defaults);

  openSheet((sheet, close) => {
    const body = el('div');

    const rebuild = () => {
      body.replaceChildren(...buildFields(draft, (next) => { draft = next; rebuild(); }));
    };

    const onSave = () => {
      const title = (draft.title || '').trim();
      if (!title) { toast('Ponle un título', 'error'); return; }
      draft.title = title;
      if (draft.type === 'routine' && draft.rule.freq === 'weekly' && !draft.rule.byDay.length) {
        toast('Elige al menos un día de la semana', 'error');
        return;
      }
      if (draft.type === 'routine' && draft.rule.freq === 'monthly' && !draft.rule.byMonthDay.length) {
        toast('Elige al menos un día del mes', 'error');
        return;
      }
      if (draft.type === 'event' && draft.end && parseLocal(draft.end) < parseLocal(draft.start)) {
        toast('El final va antes del inicio', 'error');
        return;
      }
      save(draft);
      close();
      toast(existing ? 'Guardado' : 'Añadido');
    };

    sheet.append(
      sheetHeader(existing ? 'Editar' : 'Nuevo', { onSave }),
      existing
        ? null
        : el('div', { class: 'field' }, [
            segmented(TYPES, draft.type, (type) => {
              draft = { ...blank(type, defaults), title: draft.title, notes: draft.notes, alarms: draft.alarms };
              rebuild();
            }),
          ]),
      body,
      el('button', { class: 'btn', type: 'button', text: existing ? 'Guardar' : 'Añadir', onClick: onSave }),
      existing
        ? el('button', {
            class: 'btn secondary',
            type: 'button',
            text: 'Eliminar',
            style: { color: 'var(--danger)' },
            onClick: () => {
              close();
              confirmDialog(`Se borrará «${existing.title}». No se puede deshacer.`, () => {
                remove(existing.type, existing.id);
                toast('Eliminado');
              });
            },
          })
        : null
    );

    rebuild();
  });

  return closeSheet;
}

function buildFields(draft, update) {
  const nodes = [];
  const set = (patch) => update({ ...draft, ...patch });

  nodes.push(field('Título', el('input', {
    type: 'text',
    value: draft.title,
    placeholder: draft.type === 'routine' ? 'Ej. Tomar la medicación' : 'Ej. Dentista',
    autocapitalize: 'sentences',
    onInput: (e) => { draft.title = e.target.value; },
  })));

  if (draft.type === 'event') nodes.push(...eventFields(draft, set));
  if (draft.type === 'task') nodes.push(...taskFields(draft, set));
  if (draft.type === 'routine') nodes.push(...routineFields(draft, set));

  nodes.push(field('Alarmas', alarmPicker(draft, set),
    'Suenan dentro de la app cuando está abierta. Para que el iPhone avise con la pantalla bloqueada, exporta el calendario desde Ajustes.'));

  nodes.push(field('Color', colorPicker(draft, set)));

  nodes.push(field('Notas', el('textarea', {
    value: draft.notes || '',
    placeholder: 'Opcional',
    onInput: (e) => { draft.notes = e.target.value; },
  })));

  return nodes;
}

/* ---- Campos por tipo ---- */

function eventFields(draft, set) {
  const start = parseLocal(draft.start) || new Date();
  const end = draft.end ? parseLocal(draft.end) : null;

  const nodes = [
    el('div', { class: 'card', style: { marginBottom: '14px' } }, [
      toggle('Todo el día', null, Boolean(draft.allDay), (checked) => set({ allDay: checked })),
    ]),
    field('Empieza', dateTimeInputs(start, draft.allDay, (d) => { draft.start = toLocalInput(d); })),
  ];

  const endWrap = el('div');
  const renderEnd = () => {
    endWrap.replaceChildren(
      draft.end
        ? el('div', {}, [
            dateTimeInputs(end || start, draft.allDay, (d) => { draft.end = toLocalInput(d); }),
            el('button', {
              class: 'link-btn', type: 'button', text: 'Quitar hora de fin',
              onClick: () => { draft.end = ''; set({ end: '' }); },
            }),
          ])
        : el('button', {
            class: 'btn secondary', type: 'button', text: '+ Añadir hora de fin',
            onClick: () => set({ end: toLocalInput(new Date(start.getTime() + 60 * 60000)) }),
          })
    );
  };
  renderEnd();
  nodes.push(field('Termina', endWrap));

  return nodes;
}

function taskFields(draft, set) {
  const nodes = [
    el('div', { class: 'card', style: { marginBottom: '14px' } }, [
      toggle('Con fecha', 'Sin fecha se queda en la bandeja de entrada', Boolean(draft.due),
        (checked) => set({ due: checked ? toLocalInput(nextRoundHour()) : '' })),
      draft.due ? toggle('Todo el día', null, Boolean(draft.allDay), (checked) => set({ allDay: checked })) : null,
    ].filter(Boolean)),
  ];

  if (draft.due) {
    const due = parseLocal(draft.due);
    nodes.push(field('Fecha límite', dateTimeInputs(due, draft.allDay, (d) => { draft.due = toLocalInput(d); })));
  }

  return nodes;
}

function routineFields(draft, set) {
  const nodes = [];
  const rule = draft.rule;

  nodes.push(field('Se repite', segmented([
    { value: 'daily', label: 'Diaria' },
    { value: 'weekly', label: 'Semanal' },
    { value: 'monthly', label: 'Mensual' },
  ], rule.freq, (freq) => {
    const next = { ...rule, freq };
    if (freq === 'weekly' && !next.byDay.length) next.byDay = [new Date().getDay()];
    if (freq === 'monthly' && !next.byMonthDay.length) next.byMonthDay = [new Date().getDate()];
    set({ rule: next });
  })));

  if (rule.freq === 'weekly') {
    const pills = el('div', { class: 'pills' });
    for (let d = 0; d < 7; d++) {
      const index = (d + 1) % 7; // empieza en lunes
      const active = rule.byDay.includes(index);
      pills.append(el('button', {
        class: 'pill day-pill',
        type: 'button',
        text: DAY_SHORT[index],
        'aria-pressed': String(active),
        onClick: () => {
          const byDay = active ? rule.byDay.filter((x) => x !== index) : [...rule.byDay, index].sort();
          set({ rule: { ...rule, byDay } });
        },
      }));
    }
    const shortcuts = el('div', { class: 'pills', style: { marginTop: '8px' } }, [
      el('button', { class: 'pill', type: 'button', text: 'L-V', onClick: () => set({ rule: { ...rule, byDay: [1, 2, 3, 4, 5] } }) }),
      el('button', { class: 'pill', type: 'button', text: 'Fin de semana', onClick: () => set({ rule: { ...rule, byDay: [0, 6] } }) }),
      el('button', { class: 'pill', type: 'button', text: 'Todos', onClick: () => set({ rule: { ...rule, byDay: [0, 1, 2, 3, 4, 5, 6] } }) }),
    ]);
    nodes.push(field('Días', el('div', {}, [pills, shortcuts])));
  }

  if (rule.freq === 'monthly') {
    nodes.push(field('Días del mes', el('input', {
      type: 'text',
      inputmode: 'numeric',
      value: rule.byMonthDay.join(', '),
      placeholder: 'Ej. 1, 15',
      onChange: (e) => {
        const byMonthDay = e.target.value
          .split(/[,\s]+/)
          .map((n) => parseInt(n, 10))
          .filter((n) => n >= 1 && n <= 31);
        set({ rule: { ...rule, byMonthDay: [...new Set(byMonthDay)].sort((a, b) => a - b) } });
      },
    }), 'Si pones 31, en los meses cortos se hace el último día.'));
  }

  const unit = { daily: 'días', weekly: 'semanas', monthly: 'meses' }[rule.freq];
  nodes.push(field('Cada cuánto', el('div', { class: 'row-2' }, [
    el('input', {
      type: 'number', min: '1', max: '99', value: String(rule.interval || 1),
      onChange: (e) => set({ rule: { ...rule, interval: Math.max(1, parseInt(e.target.value, 10) || 1) } }),
    }),
    el('div', { style: { alignSelf: 'center', color: 'var(--muted)' }, text: unit }),
  ])));

  const timeWrap = el('div', { class: 'card', style: { marginBottom: '14px' } }, [
    toggle('A una hora concreta', 'Si no, aparece como pendiente del día', Boolean(draft.time),
      (checked) => set({ time: checked ? '09:00' : '' })),
  ]);
  nodes.push(timeWrap);

  if (draft.time) {
    nodes.push(field('Hora', el('input', {
      type: 'time', value: draft.time,
      onChange: (e) => { draft.time = e.target.value || '09:00'; },
    })));
  }

  nodes.push(field('Vigencia', el('div', { class: 'row-2' }, [
    el('div', {}, [
      el('label', { style: { fontSize: '12px', color: 'var(--muted)' }, text: 'Desde' }),
      el('input', { type: 'date', value: draft.startDate || '', onChange: (e) => { draft.startDate = e.target.value; } }),
    ]),
    el('div', {}, [
      el('label', { style: { fontSize: '12px', color: 'var(--muted)' }, text: 'Hasta (opcional)' }),
      el('input', { type: 'date', value: draft.endDate || '', onChange: (e) => { draft.endDate = e.target.value; } }),
    ]),
  ])));

  return nodes;
}

/* ---- Controles compartidos ---- */

function nextRoundHour() {
  const d = new Date(Date.now() + 60 * 60000);
  d.setMinutes(0, 0, 0);
  return d;
}

function dateTimeInputs(value, allDay, onChange) {
  const current = { date: dateKey(value), time: timeKey(value) };
  const emit = () => onChange(fromParts(current.date, allDay ? '00:00' : current.time));

  const dateInput = el('input', {
    type: 'date', value: current.date,
    onChange: (e) => { current.date = e.target.value || current.date; emit(); },
  });

  if (allDay) return dateInput;

  return el('div', { class: 'row-2' }, [
    dateInput,
    el('input', {
      type: 'time', value: current.time,
      onChange: (e) => { current.time = e.target.value || current.time; emit(); },
    }),
  ]);
}

function alarmPicker(draft, set) {
  const wrap = el('div', { class: 'pills' });
  const alarms = draft.alarms || [];
  for (const preset of ALARM_PRESETS) {
    const active = alarms.includes(preset.value);
    wrap.append(el('button', {
      class: 'pill',
      type: 'button',
      text: preset.label,
      'aria-pressed': String(active),
      onClick: () => {
        const next = active ? alarms.filter((m) => m !== preset.value) : [...alarms, preset.value];
        set({ alarms: next.sort((a, b) => a - b) });
      },
    }));
  }
  return wrap;
}

function colorPicker(draft, set) {
  const wrap = el('div', { class: 'swatches' });
  for (const color of COLORS) {
    wrap.append(el('button', {
      class: 'swatch',
      type: 'button',
      'aria-label': color,
      'aria-pressed': String(draft.color === color),
      style: { '--dot': colorVar(color) },
      onClick: () => set({ color }),
    }));
  }
  return wrap;
}
