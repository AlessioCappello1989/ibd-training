// Motore timer basato su timestamp (preciso anche con schermo spento / tab in background).
let ctx;
export const beep = (f = 880, d = 0.12) => {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d);
    o.start(); o.stop(ctx.currentTime + d);
  } catch {}
};
const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };

export const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
export const fmtUp = (s) => fmt(Math.floor(s));

export const PREP = 5; // secondi di preparazione prima di un WOD

// Fasi del timer per un WOD (null = cronometro libero)
export function phasesFor(w) {
  if (!w) return [{ label: "CRONO", kind: "work", dur: 3 * 3600, up: true }];
  const P = [{ label: "PREPARATI", kind: "prep", dur: PREP }];
  const t = w.type;
  if (t === "AMRAP") P.push({ label: "AMRAP", kind: "work", dur: (w.minutes || 12) * 60 });
  else if (t === "EMOM" || t === "Death By") {
    const n = w.minutes || (t === "EMOM" ? 10 : 20);
    for (let i = 1; i <= n; i++) P.push({ label: `MINUTO ${i}/${n}`, kind: "work", dur: 60 });
  } else if (t === "Tabata") {
    const n = w.rounds || 8, wk = w.work || 20, rs = w.rest || 10;
    for (let i = 1; i <= n; i++) {
      P.push({ label: `LAVORO ${i}/${n}`, kind: "work", dur: wk });
      if (rs > 0 && i < n) P.push({ label: "RECUPERO", kind: "rest", dur: rs });
    }
  } else P.push({ label: t.toUpperCase(), kind: "work", dur: (w.cap || 30) * 60, up: true });
  return P;
}

export class Timer {
  constructor(onTick, onDone) { this.onTick = onTick; this.onDone = onDone; this.reset([]); }
  reset(phases) {
    cancelAnimationFrame(this.raf);
    this.phases = phases; this.idx = 0; this.running = false; this.prev = 0;
    this.total = phases.reduce((a, p) => a + p.dur, 0);
    this.lastBeep = null; this.finished = false; this.emit();
  }
  get phase() { return this.phases[this.idx]; }
  elapsed() { return this.running ? this.base + (performance.now() - this.t0) / 1000 : this.prev; }
  start() {
    if (!this.phases.length || this.running || this.finished) return;
    this.running = true; this.t0 = performance.now(); this.base = this.prev;
    if (this.prev === 0) { beep(660, 0.2); vibrate(80); }
    this.loop();
  }
  pause() {
    if (!this.running) return;
    this.prev = this.elapsed(); this.running = false; cancelAnimationFrame(this.raf); this.emit();
  }
  loop = () => {
    if (!this.running) return;
    const e = this.elapsed();
    let acc = 0, i = 0;
    for (; i < this.phases.length; i++) { if (e < acc + this.phases[i].dur) break; acc += this.phases[i].dur; }
    if (i >= this.phases.length) {
      this.running = false; this.finished = true; this.prev = this.total; this.idx = this.phases.length - 1;
      beep(1046, 0.6); vibrate([200, 100, 200]); this.emit(true); this.onDone && this.onDone(this.total); return;
    }
    if (i !== this.idx) { this.idx = i; beep(this.phases[i].kind === "rest" ? 520 : 880, 0.25); vibrate(120); this.lastBeep = null; }
    const s = Math.ceil(this.phases[i].dur - (e - acc));
    if (!this.phases[i].up && s <= 3 && s >= 1 && s !== this.lastBeep) { this.lastBeep = s; beep(700, 0.08); }
    this.emit(false, e, acc);
    this.raf = requestAnimationFrame(this.loop);
  };
  emit(done = false, e = this.prev, acc) {
    if (acc === undefined) { acc = 0; for (let i = 0; i < this.idx; i++) acc += this.phases[i].dur; }
    this.onTick({ phase: this.phase, elapsed: e, inPhase: Math.max(0, e - acc), done, running: this.running });
  }
}
