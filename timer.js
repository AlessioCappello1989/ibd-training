// Motore timer: AMRAP, EMOM, Tabata, For Time, Riposo. Basato su timestamp (preciso anche in background).
const beep = (() => {
  let ctx;
  return (f = 880, d = 0.12) => {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.25, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + d);
      o.start(); o.stop(ctx.currentTime + d);
    } catch {}
  };
})();
const vibrate = (p) => navigator.vibrate && navigator.vibrate(p);

export const fmt = (s) => {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60), r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
};
export const fmtUp = (s) => fmt(Math.floor(s));

// Costruisce la lista di fasi {label, kind, dur} dal config
export function buildPhases(mode, c) {
  const P = [];
  if (c.prep > 0) P.push({ label: "PREPARATI", kind: "prep", dur: c.prep });
  if (mode === "amrap") P.push({ label: "AMRAP", kind: "work", dur: c.minutes * 60 });
  else if (mode === "emom") {
    for (let i = 1; i <= c.rounds; i++) P.push({ label: `MINUTO ${i}/${c.rounds}`, kind: "work", dur: c.every, round: i });
  } else if (mode === "tabata") {
    for (let i = 1; i <= c.rounds; i++) {
      P.push({ label: "LAVORO", kind: "work", dur: c.work, round: i });
      if (!(i === c.rounds && c.rest === 0)) P.push({ label: "RECUPERO", kind: "rest", dur: c.rest, round: i });
    }
  } else if (mode === "fortime") P.push({ label: "FOR TIME", kind: "work", dur: c.cap * 60, up: true });
  else if (mode === "rest") P.push({ label: "RIPOSO", kind: "rest", dur: c.rest });
  return P.filter((p) => p.dur > 0);
}

export class Timer {
  constructor(onTick, onDone) { this.onTick = onTick; this.onDone = onDone; this.reset([]); }
  reset(phases) {
    cancelAnimationFrame(this.raf);
    this.phases = phases; this.idx = 0; this.running = false; this.elapsedPrev = 0; this.phaseStart = 0;
    this.total = phases.reduce((a, p) => a + p.dur, 0);
    this.doneAt = 0; this.lastBeepSec = null; this.emit();
  }
  get phase() { return this.phases[this.idx]; }
  start() {
    if (!this.phases.length || this.running) return;
    this.running = true; this.t0 = performance.now(); this.base = this.elapsedPrev;
    if (this.idx === 0 && this.elapsedPrev === 0) { beep(660, .2); vibrate(80); }
    this.loop();
  }
  pause() { if (!this.running) return; this.running = false; this.elapsedPrev = this.elapsed(); cancelAnimationFrame(this.raf); this.emit(); }
  elapsed() { return this.running ? this.base + (performance.now() - this.t0) / 1000 : this.elapsedPrev; }
  loop = () => {
    if (!this.running) return;
    const e = this.elapsed();
    // trova fase corrente
    let acc = 0, i = 0;
    for (; i < this.phases.length; i++) { if (e < acc + this.phases[i].dur) break; acc += this.phases[i].dur; }
    if (i >= this.phases.length) {
      this.running = false; this.elapsedPrev = this.total; this.idx = this.phases.length - 1;
      beep(1046, .5); vibrate([200, 100, 200]); this.emit(true); this.onDone && this.onDone(this.total); return;
    }
    if (i !== this.idx) { this.idx = i; beep(this.phases[i].kind === "rest" ? 520 : 880, .25); vibrate(120); this.lastBeepSec = null; }
    const left = this.phases[i].dur - (e - acc);
    const s = Math.ceil(left);
    if (s <= 3 && s >= 1 && s !== this.lastBeepSec && !this.phases[i].up) { this.lastBeepSec = s; beep(700, .08); }
    this.emit(false, e, acc);
    this.raf = requestAnimationFrame(this.loop);
  };
  stopNow() { const e = this.elapsed(); this.pause(); return e; }
  emit(done = false, e = this.elapsedPrev, acc) {
    if (acc === undefined) { acc = 0; for (let i = 0; i < this.idx; i++) acc += this.phases[i].dur; }
    const p = this.phase;
    this.onTick({ phase: p, idx: this.idx, count: this.phases.length, elapsed: e, inPhase: Math.max(0, e - acc), done, running: this.running });
  }
}
