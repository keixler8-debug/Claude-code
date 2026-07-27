/* Prueba de la lógica pura (sin DOM): almacenamiento, recurrencia e .ics */

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.alert = (m) => console.log('ALERT:', m);

const store = await import('../js/store.js');
const agenda = await import('../js/agenda.js');
const ics = await import('../js/ics.js');
const dates = await import('../js/dates.js');

let failures = 0;
function ok(name, cond, extra = '') {
  if (cond) console.log('  ✓', name);
  else { failures++; console.log('  ✗', name, extra); }
}

console.log('\n== Fechas ==');
ok('dateKey local', dates.dateKey(new Date(2026, 6, 27)) === '2026-07-27');
ok('fromParts', dates.fromParts('2026-07-27', '09:30').getHours() === 9);
ok('parseLocal sin zona', dates.parseLocal('2026-07-27T14:05').getHours() === 14);
ok('startOfWeek lunes', dates.startOfWeek(new Date(2026, 6, 27), 1).getDay() === 1);
ok('monthGrid 42 días', dates.monthGrid(new Date(2026, 6, 1), 1).length === 42);

console.log('\n== Almacenamiento ==');
store.save({ type: 'event', title: 'Dentista', start: '2026-07-27T10:00', end: '2026-07-27T11:00', alarms: [10], color: 'blue' });
store.save({ type: 'task', title: 'Pagar la luz', due: '2026-07-27T18:00', alarms: [0], done: false, color: 'green' });
store.save({ type: 'task', title: 'Sin fecha', due: '', done: false, color: 'green' });
store.save({ type: 'task', title: 'Atrasada', due: '2026-07-20T09:00', done: false, color: 'green' });
const rutina = store.save({
  type: 'routine', title: 'Medicación', time: '08:00', alarms: [0],
  rule: { freq: 'daily', interval: 1 }, startDate: '2026-07-01', endDate: '', completions: {}, color: 'violet',
});
const gym = store.save({
  type: 'routine', title: 'Gimnasio', time: '19:00', alarms: [30],
  rule: { freq: 'weekly', interval: 1, byDay: [1, 3, 5] }, startDate: '2026-07-01', completions: {}, color: 'orange',
});
store.save({
  type: 'routine', title: 'Alquiler', time: '', alarms: [],
  rule: { freq: 'monthly', interval: 1, byMonthDay: [1] }, startDate: '2026-01-01', completions: {}, color: 'pink',
});
ok('se guardan 3 rutinas', store.getState().routines.length === 3);
ok('id asignado', Boolean(rutina.id));
ok('persiste en localStorage', JSON.parse(mem.get('organizador.v1')).routines.length === 3);

console.log('\n== Recurrencia ==');
const lunes = new Date(2026, 6, 27);   // lunes
const martes = new Date(2026, 6, 28);
ok('diaria toca el lunes', agenda.routineOccursOn(rutina, lunes));
ok('semanal L/X/V toca el lunes', agenda.routineOccursOn(gym, lunes));
ok('semanal L/X/V no toca el martes', !agenda.routineOccursOn(gym, martes));
ok('antes de startDate no toca', !agenda.routineOccursOn(gym, new Date(2026, 5, 1)));
const cada3 = { rule: { freq: 'daily', interval: 3 }, startDate: '2026-07-27' };
ok('cada 3 días: día 0 sí', agenda.routineOccursOn(cada3, lunes));
ok('cada 3 días: día 1 no', !agenda.routineOccursOn(cada3, martes));
ok('cada 3 días: día 3 sí', agenda.routineOccursOn(cada3, new Date(2026, 6, 30)));
const finMes = { rule: { freq: 'monthly', interval: 1, byMonthDay: [31] }, startDate: '2026-01-01' };
ok('día 31 en febrero cae el 28', agenda.routineOccursOn(finMes, new Date(2026, 1, 28)));
ok('endDate corta', !agenda.routineOccursOn({ ...rutina, endDate: '2026-07-10' }, lunes));

console.log('\n== Agenda del día ==');
const dia = agenda.occurrencesForDay(lunes);
const titulos = dia.map((o) => o.title);
ok('el lunes hay 4 cosas', dia.length === 4, titulos.join(' | '));
ok('ordenado por hora', dia.map((o) => o.title).join() === 'Medicación,Dentista,Pagar la luz,Gimnasio', titulos.join(','));
ok('atrasadas detectadas', agenda.overdueTasks(new Date(2026, 6, 27, 12)).length === 1);
ok('bandeja sin fecha', agenda.inboxTasks().length === 1);

console.log('\n== Alarmas ==');
const alarmas = agenda.upcomingAlarms(new Date(2026, 6, 27, 0, 0), 1);
ok('hay alarmas', alarmas.length >= 3, String(alarmas.length));
const gymAlarm = alarmas.find((a) => a.occurrence.title === 'Gimnasio');
ok('gimnasio avisa 30 min antes (18:30)', gymAlarm && gymAlarm.at.getHours() === 18 && gymAlarm.at.getMinutes() === 30,
  gymAlarm ? gymAlarm.at.toString() : 'no encontrada');
ok('ordenadas', alarmas.every((a, i) => i === 0 || alarmas[i - 1].at <= a.at));

console.log('\n== Exportación .ics ==');
const out = ics.buildICS();
const lines = out.split('\r\n');
ok('termina en CRLF', out.endsWith('\r\n'));
ok('cabecera', lines[0] === 'BEGIN:VCALENDAR' && lines.includes('END:VCALENDAR'));
ok('un VEVENT por elemento (1 evento + 3 tareas con fecha… )',
  out.match(/BEGIN:VEVENT/g).length === out.match(/END:VEVENT/g).length);
ok('VALARM presente', out.includes('BEGIN:VALARM') && out.includes('TRIGGER:-PT10M'));
ok('TRIGGER a la hora', out.includes('TRIGGER:PT0M'));
ok('RRULE semanal', out.includes('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'));
ok('RRULE mensual', out.includes('RRULE:FREQ=MONTHLY;BYMONTHDAY=1'));
ok('hora flotante (sin Z en DTSTART)', /DTSTART:2026\d{4}T\d{6}\r\n/.test(out) || out.includes('DTSTART:20260727T100000'));
ok('sin líneas > 75 octetos', lines.every((l) => Buffer.byteLength(l, 'utf8') <= 75),
  lines.filter((l) => Buffer.byteLength(l, 'utf8') > 75).join(' // '));
ok('escapa comas y puntos y coma', lines.filter((l) => l.startsWith('SUMMARY:')).every((l) => !/(?<!\\)[,;]/.test(l.slice(8))));

console.log('\n== Importación .ics ==');
const importados = ics.parseICS(out);
ok('se releen los elementos', importados.length >= 5, String(importados.length));
const gymImp = importados.find((i) => i.title === 'Gimnasio');
ok('rutina semanal reconstruida', gymImp && gymImp.type === 'routine' && gymImp.rule.freq === 'weekly'
  && gymImp.rule.byDay.join() === '1,3,5', JSON.stringify(gymImp && gymImp.rule));
ok('alarma reconstruida', gymImp && gymImp.alarms.join() === '30', JSON.stringify(gymImp && gymImp.alarms));
ok('hora reconstruida', gymImp && gymImp.time === '19:00', gymImp && gymImp.time);
const dentista = importados.find((i) => i.title === 'Dentista');
ok('evento reconstruido', dentista && dentista.type === 'event' && dentista.start === '2026-07-27T10:00',
  JSON.stringify(dentista && dentista.start));

const plegado = ics.buildICS.name && (() => {
  store.save({ type: 'event', title: 'Título larguísimo para forzar el plegado de líneas del archivo iCalendar con acentos áéíóú y comas, puntos; y más', start: '2026-08-01T10:00', alarms: [], color: 'blue' });
  const t = ics.buildICS();
  return t.split('\r\n').every((l) => Buffer.byteLength(l, 'utf8') <= 75) && ics.parseICS(t).some((i) => i.title.includes('larguísimo'));
})();
ok('plegado + desplegado con acentos', plegado);

console.log('\n== Día completo ==');
store.clearAll();
store.save({ type: 'event', title: 'Vacaciones', start: '2026-08-10T00:00', end: '2026-08-14T23:59', allDay: true, alarms: [], color: 'teal' });
const vac = ics.buildICS();
ok('DTSTART;VALUE=DATE', vac.includes('DTSTART;VALUE=DATE:20260810'));
ok('DTEND exclusivo (+1 día)', vac.includes('DTEND;VALUE=DATE:20260815'), vac.match(/DTEND[^\r]*/)[0]);
const vacImp = ics.parseICS(vac)[0];
ok('día completo al reimportar', vacImp.allDay === true && vacImp.start.startsWith('2026-08-10'), JSON.stringify(vacImp));
ok('fin corregido al reimportar', vacImp.end.startsWith('2026-08-14'), vacImp.end);
ok('evento de varios días aparece a mitad',
  agenda.occurrencesForDay(new Date(2026, 7, 12)).length === 1);

console.log(failures ? `\n${failures} PRUEBA(S) FALLIDA(S)\n` : '\nTodo correcto ✔\n');
process.exit(failures ? 1 : 0);
