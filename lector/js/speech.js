/* Motor de lectura en voz alta sobre la síntesis de voz del navegador.
   Lee frase a frase para poder ir siguiendo el texto y retomar donde se dejó. */

const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;

/* Chrome (escritorio) se queda mudo si una lectura pasa de ~15 s: hay que
   darle un pause/resume cada pocos segundos. Safari, en cambio, se atraganta
   si se lo haces, así que solo se aplica donde hace falta. */
const NEEDS_KEEPALIVE = typeof navigator !== 'undefined'
  && /chrome|chromium|edg/i.test(navigator.userAgent)
  && !/android/i.test(navigator.userAgent);

export function isSupported() {
  return !!synth && typeof SpeechSynthesisUtterance !== 'undefined';
}

/** Lista de voces; espera a que el navegador las cargue si aún no están. */
export function loadVoices(timeout = 2000) {
  return new Promise((resolve) => {
    if (!synth) return resolve([]);
    const now = synth.getVoices();
    if (now.length) return resolve(now);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      synth.removeEventListener('voiceschanged', finish);
      resolve(synth.getVoices());
    };
    synth.addEventListener('voiceschanged', finish);
    setTimeout(finish, timeout);
  });
}

/** Ordena las voces poniendo delante las del idioma preferido. */
export function sortVoices(voices, lang = 'es') {
  const base = (lang || 'es').slice(0, 2).toLowerCase();
  return voices.slice().sort((a, b) => {
    const am = a.lang.toLowerCase().startsWith(base) ? 0 : 1;
    const bm = b.lang.toLowerCase().startsWith(base) ? 0 : 1;
    if (am !== bm) return am - bm;
    if (a.localService !== b.localService) return a.localService ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export class Reader {
  constructor() {
    this.chunks = [];          // [{ page, text }]
    this.index = 0;
    this.state = 'stopped';    // 'stopped' | 'playing' | 'paused'
    this.rate = 1;
    this.voice = null;
    this.token = 0;
    this.keepalive = null;
    this.onIndex = () => {};
    this.onState = () => {};
    this.onFinish = () => {};
  }

  /** `pages` = [[[trozo, …], …], …] (páginas → párrafos → trozos). */
  load(pages, index = 0) {
    this.stop();
    this.chunks = [];
    pages.forEach((paragraphs, page) => {
      paragraphs.forEach((pieces, para) => {
        pieces.forEach((text) => this.chunks.push({ page, para, text }));
      });
    });
    this.index = Math.min(Math.max(0, index), Math.max(0, this.chunks.length - 1));
    this.onIndex(this.index);
  }

  get current() { return this.chunks[this.index] || null; }
  get total() { return this.chunks.length; }

  /** Índice del primer trozo de una página (para saltar de página). */
  indexOfPage(page) {
    const at = this.chunks.findIndex((c) => c.page >= page);
    return at === -1 ? Math.max(0, this.chunks.length - 1) : at;
  }

  setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.onState(state);
  }

  setRate(rate) {
    this.rate = rate;
    if (this.state === 'playing') this.restart();
  }

  setVoice(voice) {
    this.voice = voice;
    if (this.state === 'playing') this.restart();
  }

  /** Vuelve a decir el trozo actual con los ajustes nuevos. */
  restart() {
    const at = this.index;
    this.cancel();
    this.index = at;
    this.speakCurrent();
  }

  cancel() {
    this.token++;
    if (synth) synth.cancel();
    this.stopKeepalive();
  }

  play() {
    if (!this.chunks.length || !synth) return;
    if (this.state === 'paused') {
      // Reanudar de verdad falla en varios navegadores: se vuelve a decir la frase.
      this.restart();
      this.setState('playing');
      return;
    }
    if (this.state === 'playing') return;
    this.speakCurrent();
    this.setState('playing');
  }

  pause() {
    if (this.state !== 'playing') return;
    this.cancel();
    this.setState('paused');
  }

  toggle() {
    if (this.state === 'playing') this.pause();
    else this.play();
  }

  stop() {
    this.cancel();
    this.setState('stopped');
  }

  /** Va a un trozo concreto; sigue leyendo si estaba leyendo. */
  seek(index) {
    const wasPlaying = this.state === 'playing';
    this.cancel();
    this.index = Math.min(Math.max(0, index), Math.max(0, this.chunks.length - 1));
    this.onIndex(this.index);
    if (wasPlaying) { this.speakCurrent(); this.setState('playing'); }
  }

  next() { this.seek(this.index + 1); }
  prev() { this.seek(this.index - 1); }

  nextPage() {
    const page = this.current ? this.current.page : 0;
    this.seek(this.indexOfPage(page + 1));
  }

  prevPage() {
    const page = this.current ? this.current.page : 0;
    const start = this.indexOfPage(page);
    this.seek(this.index > start + 1 ? start : this.indexOfPage(Math.max(0, page - 1)));
  }

  speakCurrent() {
    const chunk = this.current;
    if (!synth || !chunk) { this.setState('stopped'); this.onFinish(); return; }

    const token = ++this.token;
    this.onIndex(this.index);

    const u = new SpeechSynthesisUtterance(chunk.text);
    u.rate = this.rate;
    if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; }

    u.onend = () => {
      if (token !== this.token) return;
      this.stopKeepalive();
      if (this.index + 1 >= this.chunks.length) {
        this.setState('stopped');
        this.onFinish();
        return;
      }
      this.index++;
      this.speakCurrent();
    };

    u.onerror = (e) => {
      if (token !== this.token) return;
      this.stopKeepalive();
      // 'interrupted'/'canceled' son cosa nuestra (pausa, salto); el resto, parar.
      if (e && (e.error === 'interrupted' || e.error === 'canceled')) return;
      this.setState('paused');
    };

    const start = () => {
      if (token !== this.token) return;
      synth.speak(u);
      this.startKeepalive();
    };

    // iOS solo deja hablar si el speak() sale del propio toque del usuario, así
    // que la primera vez se llama sin rodeos. Solo se aplaza cuando hay algo
    // sonando todavía, porque Safari ignora un speak() pegado a un cancel().
    if (synth.speaking || synth.pending) setTimeout(start, 0);
    else start();
  }

  startKeepalive() {
    if (!NEEDS_KEEPALIVE || this.keepalive) return;
    this.keepalive = setInterval(() => {
      if (this.state !== 'playing' || !synth.speaking) return;
      synth.pause();
      synth.resume();
    }, 9000);
  }

  stopKeepalive() {
    if (this.keepalive) { clearInterval(this.keepalive); this.keepalive = null; }
  }
}
