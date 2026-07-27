/*
 * Motor de alarmas dentro de la app.
 *
 * Ojo con la letra pequeña de iOS: una web (aunque esté instalada en la pantalla
 * de inicio) NO puede despertarse sola en segundo plano sin un servidor de push.
 * Así que esto suena cuando la app está abierta. Para que el iPhone te avise con
 * la pantalla bloqueada, exporta el .ics y añádelo al Calendario (Ajustes → Exportar),
 * o usa la app nativa de la carpeta `ios/`.
 */

import { upcomingAlarms } from './agenda.js';
import { getSettings } from './store.js';
import { formatTime } from './dates.js';

const FIRED_KEY = 'organizador.alarmas-disparadas';
const TICK_MS = 15000;
const LATE_TOLERANCE_MS = 5 * 60000; // no suenes una alarma de hace media hora

let timer = null;
let audioCtx = null;
let ringing = null;      // { stop() }
let onFire = () => {};

function loadFired() {
  try {
    const data = JSON.parse(localStorage.getItem(FIRED_KEY) || '{}');
    const cutoff = Date.now() - 3 * 86400000;
    for (const [id, at] of Object.entries(data)) if (at < cutoff) delete data[id];
    return data;
  } catch {
    return {};
  }
}

let fired = loadFired();

function markFired(id) {
  fired[id] = Date.now();
  try { localStorage.setItem(FIRED_KEY, JSON.stringify(fired)); } catch { /* sin espacio: da igual */ }
}

/** El audio en iOS solo arranca tras un gesto del usuario. */
export function unlockAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function beep(startAt, freq, duration) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(0.35, startAt + 0.02);
  gain.gain.setValueAtTime(0.35, startAt + duration - 0.05);
  gain.gain.linearRampToValueAtTime(0, startAt + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
  return osc;
}

/** Vibrar es un extra: los navegadores lo bloquean si el usuario aún no ha tocado nada. */
function vibrate(pattern) {
  if (!navigator.vibrate) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try { navigator.vibrate(pattern); } catch { /* da igual */ }
}

/** Patrón de timbre repetido hasta que se descarta (máx. 60 s). */
export function startRinging() {
  if (!getSettings().sound) return;
  unlockAudio();
  if (!audioCtx) return;
  stopRinging();

  let cancelled = false;
  const oscillators = [];
  const started = Date.now();

  const round = () => {
    if (cancelled || Date.now() - started > 60000) return;
    const t = audioCtx.currentTime;
    // Tri-tono ascendente, dos veces.
    [0, 0.9].forEach((offset) => {
      oscillators.push(beep(t + offset, 880, 0.18));
      oscillators.push(beep(t + offset + 0.22, 1108, 0.18));
      oscillators.push(beep(t + offset + 0.44, 1318, 0.28));
    });
    schedule = setTimeout(round, 2200);
  };

  let schedule = null;
  round();

  vibrate([400, 200, 400, 200, 600]);

  ringing = {
    stop() {
      cancelled = true;
      clearTimeout(schedule);
      for (const osc of oscillators) { try { osc.stop(); } catch { /* ya parado */ } }
      vibrate(0);
    },
  };
}

export function stopRinging() {
  if (ringing) ringing.stop();
  ringing = null;
}

export function notificationsSupported() {
  return typeof Notification !== 'undefined';
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

async function showNotification(title, body) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const options = { body, icon: './icons/icon-192.png', badge: './icons/icon-192.png', tag: 'organizador-alarma', renotify: true };
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
  } catch (err) {
    console.warn('No se pudo mostrar la notificación:', err);
  }
}

function alarmText(alarm) {
  const { occurrence, minutesBefore } = alarm;
  const hora = occurrence.start ? formatTime(occurrence.start) : '';
  if (minutesBefore === 0) return `Ahora · ${hora}`;
  if (minutesBefore < 60) return `En ${minutesBefore} min · ${hora}`;
  if (minutesBefore % 1440 === 0) return `En ${minutesBefore / 1440} día(s) · ${hora}`;
  return `En ${Math.round(minutesBefore / 60)} h · ${hora}`;
}

const snoozed = []; // { at: number, alarm }

function tick() {
  const now = new Date();
  const due = upcomingAlarms(new Date(now.getTime() - LATE_TOLERANCE_MS), 1)
    .filter((a) => a.at <= now && !fired[a.id]);

  for (let i = snoozed.length - 1; i >= 0; i--) {
    if (snoozed[i].at <= now.getTime()) due.push(snoozed.splice(i, 1)[0].alarm);
  }

  if (!due.length) return;

  for (const alarm of due) markFired(alarm.id);

  const first = due[0];
  startRinging();
  showNotification(first.occurrence.title, alarmText(first));
  onFire(due);
}

/** Arranca el bucle de comprobación. `handler(alarmas)` recibe las que acaban de sonar. */
export function start(handler) {
  onFire = handler || (() => {});
  stop();
  tick();
  timer = setInterval(tick, TICK_MS);
  document.addEventListener('visibilitychange', onVisible);
}

function onVisible() {
  if (document.visibilityState === 'visible') tick();
}

export function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  document.removeEventListener('visibilitychange', onVisible);
}

/** Vuelve a sonar dentro de N minutos. */
export function snooze(alarm, minutes = 5) {
  stopRinging();
  snoozed.push({ at: Date.now() + minutes * 60000, alarm });
}
