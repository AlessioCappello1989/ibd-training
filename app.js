import * as S from "./store.js";
import { Timer, phasesFor, fmt, fmtUp, PREP } from "./timer.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let user = null, view = "allena", authMode = "in";
let D = { entries: [], results: [], wods: [], schede: [] };
let newType = "AMRAP";
let timerWod = null, lastElapsed = 0;

/* ======================= WOD ======================= */
const TYPES = {
  "AMRAP":   { kind: "rounds", fields: ["minutes"], desc: "AMRAP: fai più giri possibili del tuo elenco di movimenti nel tempo stabilito." },
  "EMOM":    { kind: "count",  fields: ["minutes"], desc: "EMOM: ogni minuto, allo scattare del minuto, esegui il lavoro previsto e riposa per il tempo che resta." },
  "For Time":{ kind: "time",   fields: ["cap"],     desc: "For Time: completa il lavoro il più velocemente possibile." },
  "RFT":     { kind: "time",   fields: ["rounds", "cap"], desc: "RFT (Rounds For Time): completa un numero di giri il più in fretta possibile." },
  "Tabata":  { kind: "count",  fields: ["rounds", "work", "rest"], desc: "Tabata: round brevi di lavoro intenso e breve recupero (classico: 8 × 20\" / 10\")." },
  "Chipper": { kind: "time",   fields: ["cap"],     desc: "Chipper: una lunga lista di movimenti da completare una sola volta, in ordine." },
  "Ladder":  { kind: "rounds", fields: ["cap"],     desc: "Ladder: le ripetizioni salgono (o scendono) a ogni round." },
  "Death By":{ kind: "count",  fields: ["minutes"], desc: "Death By: ogni minuto aggiungi una ripetizione; vai avanti finché non riesci più a completarle." },
  "Strength":{ kind: "kg",     fields: [],          desc: "Strength: lavoro di forza con carichi progressivi, per esempio 5×5." },
  "Complex": { kind: "kg",     fields: [],          desc: "Complex: sequenza di movimenti con il bilanciere senza mai appoggiarlo." },
};
const FIELD = {
  minutes: ["Durata (minuti)", 12], cap: ["Time cap (minuti)", 15], rounds: ["Giri / round", 5],
  work: ["Lavoro (secondi)", 20], rest: ["Recupero (secondi)", 10],
};
const NOTE = "Scegli carichi e varianti adatti a te. Per cronometrare usa il timer in alto.";
const PRESETS = [
  { id: "p-kelly", name: "Kelly", type: "RFT", rounds: 5, cap: 40, moves: ["400 m corsa", "30 box jump (60 cm)", "30 wall ball (9/6 kg)"] },
  { id: "p-cindy", name: "Cindy", type: "AMRAP", minutes: 20, moves: ["5 trazioni", "10 piegamenti", "15 air squat"] },
  { id: "p-fran", name: "Fran", type: "For Time", cap: 12, moves: ["21-15-9", "Thruster (43/30 kg)", "Trazioni"] },
  { id: "p-grace", name: "Grace", type: "For Time", cap: 10, moves: ["30 clean & jerk (61/43 kg)"] },
  { id: "p-helen", name: "Helen", type: "RFT", rounds: 3, cap: 20, moves: ["400 m corsa", "21 kettlebell swing (24/16 kg)", "12 trazioni"] },
  { id: "p-karen", name: "Karen", type: "For Time", cap: 15, moves: ["150 wall ball (9/6 kg)"] },
  { id: "p-tabata", name: "Tabata squat", type: "Tabata", rounds: 8, work: 20, rest: 10, moves: ["Air squat"] },
  { id: "p-emom", name: "EMOM 12", type: "EMOM", minutes: 12, moves: ["Min 1: 10 burpee", "Min 2: 15 kettlebell swing", "Min 3: 12 sit-up"] },
];
const allWods = () => [...D.wods, ...PRESETS];
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const todayWod = () => allWods().find((w) => w.id === lsGet("ibd_today_wod")) || PRESETS[0];

function wodSub(w) {
  switch (w.type) {
    case "RFT": return `${w.rounds || 5} giri · a tempo`;
    case "For Time": return "a tempo" + (w.cap ? ` · cap ${w.cap} min` : "");
    case "AMRAP": return `AMRAP ${w.minutes || 12} min`;
    case "EMOM": return `EMOM ${w.minutes || 10} min`;
    case "Tabata": return `Tabata · ${w.rounds || 8} round ${w.work || 20}"/${w.rest || 10}"`;
    case "Chipper": return "Chipper · a tempo";
    case "Strength": return "Forza";
    default: return w.type;
  }
}

/* ======================= utils ======================= */
const toast = (msg, bad) => {
  const t = $("#toast"); t.textContent = msg; t.className = "show" + (bad ? " bad" : "");
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ""), 3200);
};
const dayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const isToday = (ms) => dayKey(ms) === dayKey(Date.now());
const sod = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const isDone = (e) => e.status !== "plan";
const iso = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
let selDay = sod(Date.now());
const fd = (ms) => new Date(ms).toLocaleDateString("it-IT", { day: "numeric", month: "short" }).replace(".", "");
const num = (n) => (Math.round(n * 10) / 10).toString().replace(".", ",");
const epley = (kg, r) => (r <= 1 ? kg : kg * (1 + r / 30));
const kcalFor = (e) => Math.round((e.kg || 0) * e.reps * e.sets * 0.04 + e.reps * e.sets * 0.5);
const fmtTime = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };

function groups() {
  const m = new Map();
  for (const e of D.entries.filter(isDone).sort((a, b) => a.date - b.date)) {
    const k = e.exercise.trim().toLowerCase();
    if (!m.has(k)) m.set(k, { key: k, name: e.exercise.trim(), list: [] });
    const g = m.get(k); g.name = e.exercise.trim(); g.list.push(e);
  }
  return [...m.values()].sort((a, b) => b.list.at(-1).date - a.list.at(-1).date);
}
function dayBest(list, fn) {
  const m = new Map();
  for (const e of list) { const d = dayKey(e.date), v = fn(e); if (!m.has(d) || v > m.get(d).v) m.set(d, { t: e.date, v, e }); }
  return [...m.values()].sort((a, b) => a.t - b.t);
}

function parseScore(kind, str) {
  str = String(str).trim().replace(",", ".");
  if (!str) return null;
  if (kind === "time") {
    const m = str.match(/^(?:(\d+):)?(\d{1,3}):(\d{2})$/);
    if (!m) return null;
    return (m[1] ? +m[1] * 3600 : 0) + +m[2] * 60 + +m[3];
  }
  if (kind === "rounds") {
    const m = str.match(/^(\d+)(?:\s*\+\s*(\d+))?$/);
    return m ? +m[1] * 1000 + +(m[2] || 0) : null;
  }
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

/* ======================= AUTH ======================= */
function showAuth() {
  $("#app").classList.add("hidden"); $("#auth").classList.remove("hidden");
  $("#demoWarn").classList.toggle("hidden", !S.demo);
  $("#btnDemo").classList.toggle("hidden", !S.demo);
}
const authMsg = (e) => ({
  "auth/invalid-credential": "Email o password errata.",
  "auth/wrong-password": "Password errata.",
  "auth/user-not-found": "Nessun account con questa email: usa «Registrati».",
  "auth/invalid-email": "Email non valida.",
  "auth/email-already-in-use": "Questa email è già registrata: usa «Accedi».",
  "auth/weak-password": "Password troppo corta (minimo 6 caratteri).",
  "auth/popup-closed-by-user": "Accesso con Google annullato.",
  "auth/cancelled-popup-request": "",
  "auth/unauthorized-domain": "Dominio non autorizzato: in Firebase vai su Authentication → Impostazioni → Domini autorizzati e aggiungi " + location.hostname,
  "auth/operation-not-allowed": "Metodo di accesso non attivo: in Firebase vai su Authentication → Metodo di accesso e attiva Google / Email-Password.",
  "auth/network-request-failed": "Nessuna connessione, riprova.",
  "auth/invalid-api-key": "Chiavi Firebase non valide: controlla firebase-config.js.",
  "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "Chiavi Firebase non valide: controlla firebase-config.js.",
  "auth/configuration-not-found": "Authentication non è stato attivato nel progetto Firebase (clicca «Inizia» in Authentication).",
  "auth/too-many-requests": "Troppi tentativi, riprova tra qualche minuto.",
}[e.code] ?? (e.message || "Errore di accesso"));

$$(".tabs button").forEach((b) => (b.onclick = () => {
  authMode = b.dataset.m;
  $$(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
  $("#authSubmit").textContent = authMode === "in" ? "Accedi" : "Crea account";
  $("#password").autocomplete = authMode === "in" ? "current-password" : "new-password";
}));
$("#authForm").onsubmit = async (ev) => {
  ev.preventDefault(); $("#authErr").textContent = "";
  if (S.demo) return ($("#authErr").textContent = "Firebase non è collegato. Usa la modalità demo o inserisci le chiavi.");
  try {
    const em = $("#email").value.trim(), pw = $("#password").value;
    await (authMode === "in" ? S.authApi.signIn(em, pw) : S.authApi.signUp(em, pw));
  } catch (e) { $("#authErr").textContent = authMsg(e); }
};
$("#btnGoogle").onclick = async () => {
  $("#authErr").textContent = "";
  if (S.demo) return ($("#authErr").textContent = "Per usare Google devi prima collegare Firebase (chiavi in firebase-config.js).");
  try { await S.authApi.google(); } catch (e) { $("#authErr").textContent = authMsg(e); }
};
window.addEventListener("autherr", (ev) => ($("#authErr").textContent = authMsg(ev.detail)));
$("#btnReset").onclick = async () => {
  const em = $("#email").value.trim();
  if (!em) return ($("#authErr").textContent = "Scrivi prima la tua email qui sopra.");
  if (S.demo) return;
  try { await S.authApi.reset(em); toast("Email per reimpostare la password inviata"); } catch (e) { $("#authErr").textContent = authMsg(e); }
};
$("#btnDemo").onclick = () => S.authApi.demoLogin();

/* ======================= TILES: timer / kcal / giri ======================= */
function pressable(el, onTap, onHold) {
  let t, held = false;
  el.addEventListener("pointerdown", () => { held = false; t = setTimeout(() => { held = true; onHold(); try { navigator.vibrate && navigator.vibrate(40); } catch {} }, 650); });
  el.addEventListener("pointerup", () => { clearTimeout(t); if (!held) onTap(); });
  ["pointerleave", "pointercancel"].forEach((ev) => el.addEventListener(ev, () => clearTimeout(t)));
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}

const timer = new Timer(onTick, onDone);
function setupTimer(w) { timerWod = w; lastElapsed = 0; timer.reset(phasesFor(w)); }
function onTick(t) {
  const tile = $("#tileTimer");
  tile.className = "tile" + (t.running ? " on" : t.elapsed > 0 ? " off" : "");
  const p = t.phase;
  $("#tTime").textContent = !p ? "00:00" : p.up ? fmtUp(t.inPhase) : fmt(p.dur - t.inPhase);
  let hint = t.running ? "tocca per pausa" : t.elapsed > 0 && !t.done ? "tocca per riprendere · tieni premuto: azzera" : t.done ? "finito · tieni premuto: azzera" : "tocca per avviare";
  if (timerWod && p) hint = `${timerWod.name} · ${p.label.toLowerCase()}<br>${hint}`;
  $("#tHint").innerHTML = hint;
  if (timerWod) lastElapsed = Math.max(0, t.elapsed - PREP);
}
function onDone() {
  toast(timerWod ? `⏱️ Tempo! ${timerWod.name} finito` : "⏱️ Finito");
  if (view === "wod") renderView();
}
pressable($("#tileTimer"), () => {
  if (timer.running) { timer.pause(); if (view === "wod") renderView(); }
  else if (timer.finished) { timer.reset(phasesFor(timerWod)); }
  else timer.start();
}, () => { setupTimer(null); if (view === "wod") renderView(); });

let laps = 0, lapState = "idle", lapStart = 0, lapAcc = 0, lapInt = null; // idle | run | stop
const lapMs = () => lapAcc + (lapState === "run" ? Date.now() - lapStart : 0);
const paintLap = () => {
  $("#lapN").textContent = laps; $("#lapT").textContent = fmtUp(lapMs() / 1000);
  $("#tileLap").className = "tile" + (lapState === "run" ? " on" : lapState === "stop" ? " off" : "");
  $("#lapH").textContent = lapState === "run" ? "tocca: nuovo giro · tieni premuto: stop" : lapState === "stop" ? "tocca: riprendi · tieni premuto: azzera" : "tocca per partire";
};
pressable($("#tileLap"), () => {
  if (lapState === "run") { laps++; lapAcc = 0; lapStart = Date.now(); }
  else { lapState = "run"; lapStart = Date.now(); clearInterval(lapInt); lapInt = setInterval(paintLap, 250); }
  paintLap();
}, () => {
  clearInterval(lapInt);
  if (lapState === "run") { lapAcc += Date.now() - lapStart; lapState = "stop"; }
  else { laps = 0; lapAcc = 0; lapState = "idle"; }
  paintLap();
});

function paintKcal() {
  const today = D.entries.filter((e) => isToday(e.date) && e.kind !== "max" && isDone(e));
  $("#kcal").textContent = today.reduce((a, e) => a + (e.kcal || 0), 0);
  $("#kHint").textContent = today.length ? `${today.length} ${today.length === 1 ? "esercizio" : "esercizi"} oggi` : "salva un esercizio…";
}

/* ======================= VIEWS ======================= */
const V = {};

/* ---- ALLENA (programma per giorno) ---- */
const DAYN = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
const addDays = (ms, n) => { const d = new Date(ms); d.setDate(d.getDate() + n); return sod(d.getTime()); };
const weekStartOf = (ms) => { const d = new Date(sod(ms)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return sod(d.getTime()); };
const dayList = (ms) => D.entries.filter((e) => e.kind !== "max" && dayKey(e.date) === dayKey(ms)).sort((a, b) => (a.createdAt || a.date) - (b.createdAt || b.date));
let formStatus = null;
V.allena = {
  html() {
    const today = sod(Date.now()), ws = weekStartOf(selDay);
    const days = [...Array(7)].map((_, i) => addDays(ws, i));
    const list = dayList(selDay), nDone = list.filter(isDone).length;
    const month = new Date(selDay).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    const long = new Date(selDay).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
    const dot = (d) => { const l = dayList(d); return !l.length ? "" : l.every(isDone) ? "all" : "plan"; };
    return `
    ${planHtml()}
    <div class="card">
      <div class="weekbar"><button class="wk" data-wk="-1" aria-label="Settimana precedente">‹</button><div class="wlabel">${esc(month)}</div><button class="wk" data-wk="1" aria-label="Settimana successiva">›</button></div>
      <div class="days">${days.map((d, i) => `<button class="day ${d === selDay ? "sel" : ""} ${d === today ? "tod" : ""}" data-day="${d}"><small>${DAYN[i]}</small><b>${new Date(d).getDate()}</b><i class="dot ${dot(d)}"></i></button>`).join("")}</div>
      ${selDay !== today ? `<button class="link todaylink" id="dToday">Vai a oggi</button>` : ""}
    </div>

    <div class="card"><h2 style="text-transform:capitalize">${esc(long)}</h2>
      <p class="cnt">${list.length ? `${nDone} di ${list.length} fatti` : "Nessun esercizio in programma"}</p>
      ${list.length ? list.map((e) => `<div class="item ${isDone(e) ? "done" : ""}"><button class="chk" data-chk="${e.id}" aria-label="${isDone(e) ? "Rimetti da fare" : "Segna come fatto"}">${isDone(e) ? "✓" : ""}</button><div class="itx"><div class="nm">${esc(e.exercise)}</div><div class="tp">${e.kg ? num(e.kg) + " kg × " : ""}${e.reps} rip × ${e.sets} serie${e.scheda ? " · " + esc(e.scheda) : ""}</div></div><button class="x" data-del="entries:${e.id}" aria-label="Elimina">✕</button></div>`).join("") : `<p class="muted" style="margin:0">Nessun esercizio in questo giorno.</p>`}
    </div>
`;
  },
  bind() {
    planBind();
    $$("[data-wk]").forEach((b) => (b.onclick = () => { selDay = addDays(selDay, +b.dataset.wk * 7); formStatus = null; renderView(); }));
    $$("[data-day]").forEach((b) => (b.onclick = () => { selDay = +b.dataset.day; formStatus = null; renderView(); }));
    if ($("#dToday")) $("#dToday").onclick = () => { selDay = sod(Date.now()); formStatus = null; renderView(); };
    $$("[data-chk]").forEach((b) => (b.onclick = async () => {
      const e = D.entries.find((x) => x.id === b.dataset.chk); if (!e) return;
      const next = isDone(e) ? "plan" : "done", patch = { status: next };
      if (next === "done" && sod(e.date) === sod(Date.now())) patch.date = Date.now();
      try { await S.update(user.uid, "entries", e.id, patch); await reload(); renderAll(); toast(next === "done" ? "Fatto ✔" : "Rimesso da fare"); }
      catch (err) { toast("Errore: " + err.message, true); }
    }));
  },
};

/* ---- PIANO DI ALLENAMENTO (giorni con blocchi Allenamento / Superset / WOD) ---- */
const BT = ["allenamento", "superset", "wod"];
const BTL = { allenamento: "Allenamento", superset: "Superset", wod: "WOD" };
const emptyBlocks = () => ({ allenamento: { items: [], rest: "" }, superset: { items: [], rest: "" }, wod: { items: [] } });
const normSc = (x) => {
  const b = emptyBlocks();
  if (x.blocks) BT.forEach((t) => { if (x.blocks[t]) b[t] = { ...b[t], ...x.blocks[t], items: [...(x.blocks[t].items || [])] }; });
  else if (x.items) b.allenamento.items = x.items.map((i) => ({ exercise: i.exercise, sets: i.sets || 1, reps: String(i.reps ?? ""), kg: i.kg || 0 }));
  return { ...x, blocks: b };
};
const planDays = () => D.schede.map(normSc).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
let planSel = lsGet("ibd_plan_sel") || null, planType = "allenamento", planEdit = null;
const curDay = () => { const d = planDays(); return d.find((x) => x.id === planSel) || d[0] || null; };
const setLineP = (it) => `${it.sets || 1}×${it.reps}${it.kg ? ` a ${num(it.kg)} kg` : ""}`;
const wodMin = (w) => (["AMRAP", "EMOM", "Death By"].includes(w.type) ? w.minutes : w.type === "Tabata" ? Math.round(((w.rounds || 8) * ((w.work || 20) + (w.rest || 10))) / 60) : w.cap) || 0;
const wodSnap = (w) => ({ wodId: w.id, name: w.name, sub: wodSub(w), moves: w.moves || [], mins: wodMin(w) });
const longDay = (ms) => new Date(ms).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
const planErr = (e) => toast("Errore di salvataggio: " + (e.code === "permission-denied" ? "regole Firestore non pubblicate" : e.message), true);

async function planSave(sc, patch, msg) {
  try { await S.update(user.uid, "schede", sc.id, patch); await reload(); renderView(); if (msg) toast(msg); }
  catch (e) { planErr(e); }
}
async function applyScheda(sc, dayMs) {
  const when = sod(dayMs) + 12 * 36e5, items = [...sc.blocks.allenamento.items, ...sc.blocks.superset.items];
  if (!items.length) return toast("Questo giorno del piano non ha esercizi", true);
  try {
    for (let i = 0; i < items.length; i++) {
      const it = items[i], e = { kind: "training", status: "plan", exercise: it.exercise, kg: it.kg || 0, reps: parseInt(String(it.reps)) || 1, sets: it.sets || 1, scheda: sc.name, date: when, createdAt: Date.now() + i };
      e.kcal = kcalFor(e); await S.add(user.uid, "entries", e);
    }
    selDay = sod(dayMs); formStatus = null; await reload(); renderAll();
    toast(`«${sc.name}» aggiunto a ${longDay(dayMs)} ✔`);
  } catch (err) { toast("Errore: " + err.message, true); }
}

const doneToday = (sc, it) => D.entries.find((e) => isDone(e) && e.kind === "training" && e.scheda === sc.name && e.exercise === it.exercise && sod(e.date) === sod(Date.now()));
function planHtml() {
  const days = planDays(), sc = curDay();
  const chips = `<div class="chips scroll">${days.map((d) => `<button class="chip ${sc && d.id === sc.id ? "on" : ""}" data-pday="${d.id}">${esc(d.name)}</button>`).join("")}<button class="chip" id="pAddDay" aria-label="Aggiungi un giorno">+</button></div>`;
  const head = `<h2>Piano di allenamento</h2><p class="muted" style="font-size:1.05rem;line-height:1.5;margin:0 0 6px">Per registrare un esercizio tocca l'icona di salvataggio accanto alla matita: salva subito serie, ripetizioni e peso del piano con la data di oggi.</p>${chips}`;
  if (!sc) return `<div class="card">${head}<p class="muted" style="margin:10px 0 0">Tocca + per creare il primo giorno del piano, poi dagli un nome e aggiungi gli esercizi.</p></div>`;

  const blk = (t) => {
    const b = sc.blocks[t]; if (!b.items.length) return "";
    const m = t === "wod" ? b.items.reduce((a, i) => a + (i.mins || 0), 0) : 0;
    const title = t === "wod" ? (m ? `WOD · ${m} minuti` : "WOD") : BTL[t];
    const rows = b.items.map((it, i) => t === "wod"
      ? `<div class="pi wod"><div class="pix" data-pwod="${i}" role="button" tabindex="0"><div class="nm">WOD · ${esc(it.name)}</div><div class="tp">${esc(String(it.sub || "").replace(/ min\b/, " minuti"))}</div>${(it.moves || []).length ? `<div class="tp">${esc(it.moves.join(" · "))}</div>` : ""}<div class="tp">tocca per registrare il risultato e vai nella pagina WOD per confermarlo.</div></div><div class="pia"><button data-pdel="${t}:${i}" aria-label="Elimina">✖️</button></div></div>`
      : `<div class="pi ${doneToday(sc, it) ? "isdone" : ""}"><div class="pix"><div class="nm">${esc(it.exercise)}</div><div class="tp">${esc(setLineP(it))}</div></div><div class="pia">${doneToday(sc, it) ? `<button class="ok" data-psave="${t}:${i}" aria-label="Fatto oggi: tocca per annullare">✓</button>` : `<button data-psave="${t}:${i}" aria-label="Salva nello storico">💾</button>`}<button data-pedit="${t}:${i}" aria-label="Modifica">✏️</button><button data-pdel="${t}:${i}" aria-label="Elimina">✖️</button></div></div>`).join("");
    const rest = t === "wod" ? "" : `<label for="pRest_${t}">Recupero ${BTL[t].toLowerCase()}</label><input id="pRest_${t}" data-prest="${t}" placeholder="Es. Recupero 60 secondi" value="${esc(b.rest || "")}" autocomplete="off">`;
    return `<div class="pbh">${esc(title)}</div>${rows}${rest}`;
  };

  if (planEdit && !(sc.blocks[planEdit.t] && sc.blocks[planEdit.t].items[planEdit.i])) planEdit = null;
  const eit = planEdit ? sc.blocks[planEdit.t].items[planEdit.i] : null, typ = planEdit ? planEdit.t : planType;
  const names = [...new Set([...groups().map((x) => x.name), ...planDays().flatMap((d) => [...d.blocks.allenamento.items, ...d.blocks.superset.items].map((i) => i.exercise)), "Panca piana bilanciere", "Back squat", "Deadlift", "Curl bilanciere", "Pull-up"])];
  const wodSel = lsGet("ibd_today_wod");
  const form = `<div class="pdiv"></div><h3 class="pbt">Blocco Allenamento Selezionabile</h3>
    <div class="chips">${BT.map((t) => `<button class="chip ${t === typ ? "on" : ""}" data-ptype="${t}" ${planEdit && t !== typ ? "disabled" : ""}>${BTL[t]}</button>`).join("")}</div>
    ${typ === "wod"
      ? `<label for="pWod">Scegli il WOD</label><select id="pWod">${allWods().map((w) => `<option value="${w.id}" ${w.id === wodSel ? "selected" : ""}>${esc(w.name)} · ${esc(wodSub(w))}</option>`).join("")}</select><button class="btn primary" id="pAddWod">Aggiungi WOD</button>`
      : `<label for="pEx">${eit ? "Modifica esercizio" : "Aggiungi esercizio"}</label>
         <input id="pEx" list="exList4" placeholder="Es. Curl con bilanciere" value="${esc(eit ? eit.exercise : "")}" autocomplete="off"><datalist id="exList4">${names.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
         <div class="g3b">
           <div><label for="pSets">Serie</label><input id="pSets" type="number" inputmode="numeric" min="1" placeholder="3" value="${eit ? eit.sets || 1 : ""}"></div>
           <div><label for="pReps">Ripetizioni</label><input id="pReps" placeholder="8-10" value="${esc(eit ? String(eit.reps) : "")}" autocomplete="off"></div>
           <div><label for="pKg">Peso (kg)</label><input id="pKg" type="number" inputmode="decimal" min="0" step="0.5" placeholder="0" value="${eit && eit.kg ? eit.kg : ""}"></div>
         </div>
         <button class="btn primary" id="pAdd">${eit ? "Salva modifica" : "Aggiungi esercizio"}</button>${eit ? `<button class="btn outline sm" id="pCancelEdit">Annulla modifica</button>` : ""}`}`;

  return `<div class="card">${head}
    <label for="pName">Nome del giorno</label>
    <input id="pName" value="${esc(sc.name)}" autocomplete="off">
    ${BT.map(blk).join("")}
    ${form}
    <button class="btn outline sm" id="pDelDay" style="margin-top:22px;color:var(--red);border-color:var(--red)">🗑 Elimina il giorno «${esc(sc.name)}»</button>
  </div>`;
}

function planBind() {
  const sc = curDay();
  $$("[data-pday]").forEach((b) => (b.onclick = () => { planSel = b.dataset.pday; lsSet("ibd_plan_sel", planSel); planEdit = null; renderView(); }));
  if ($("#pAddDay")) $("#pAddDay").onclick = async () => {
    try {
      const id = await S.add(user.uid, "schede", { name: `Giorno ${planDays().length + 1}`, blocks: emptyBlocks(), createdAt: Date.now() });
      planSel = id; lsSet("ibd_plan_sel", id); planEdit = null; await reload(); renderView();
    } catch (e) { planErr(e); }
  };
  if (!sc) return;
  $("#pName").onchange = (e) => planSave(sc, { name: e.target.value.trim() || sc.name });
  $$("[data-prest]").forEach((i) => (i.onchange = () => { const bl = { ...sc.blocks }; bl[i.dataset.prest] = { ...bl[i.dataset.prest], rest: i.value.trim() }; planSave(sc, { blocks: bl }); }));
  $$("[data-ptype]").forEach((b) => (b.onclick = () => { planType = b.dataset.ptype; renderView(); }));
  $$("[data-pwod]").forEach((el) => (el.onclick = () => {
    const it = sc.blocks.wod.items[+el.dataset.pwod], w = it && allWods().find((x) => x.id === it.wodId);
    if (!w) return toast("Questo WOD non esiste più: sceglilo dalla pagina WOD", true);
    lsSet("ibd_today_wod", w.id); setupTimer(null); go("wod");
  }));
  $$("[data-psave]").forEach((b) => (b.onclick = () => {
    const [t, i] = b.dataset.psave.split(":"), it = sc.blocks[t].items[+i]; if (!it) return;
    const prev = doneToday(sc, it);
    if (prev) { S.remove(user.uid, "entries", prev.id).then(reload).then(renderAll).then(() => toast("Segnato come non fatto")).catch(planErr); return; }
    const e = { kind: "training", status: "done", exercise: it.exercise, kg: it.kg || 0, reps: parseInt(String(it.reps)) || 1, sets: it.sets || 1, scheda: sc.name, date: Date.now(), createdAt: Date.now() };
    e.kcal = kcalFor(e); save("entries", e, `Salvato nello storico: ${it.exercise} ✔`);
  }));
  $$("[data-pedit]").forEach((b) => (b.onclick = () => {
    const [t, i] = b.dataset.pedit.split(":"); planEdit = { t, i: +i }; planType = t; renderView();
    const el = $("#pEx"); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }));
  $$("[data-pdel]").forEach((b) => (b.onclick = () => {
    if (!armDelete(b)) return;
    const [t, i] = b.dataset.pdel.split(":"), bl = { ...sc.blocks };
    bl[t] = { ...bl[t], items: bl[t].items.filter((_, k) => k !== +i) }; planEdit = null; planSave(sc, { blocks: bl });
  }));
  if ($("#pAdd")) $("#pAdd").onclick = () => {
    const ex = $("#pEx").value.trim(), sets = parseInt($("#pSets").value) || 1, reps = $("#pReps").value.trim(), kg = parseFloat($("#pKg").value) || 0;
    if (!ex) return toast("Scrivi il nome dell'esercizio", true);
    if (!reps) return toast("Inserisci le ripetizioni (es. 8 oppure 8-10)", true);
    const t = planEdit ? planEdit.t : planType, bl = { ...sc.blocks }, items = [...bl[t].items], it = { exercise: ex, sets, reps, kg }, editing = !!planEdit;
    if (editing) items[planEdit.i] = it; else items.push(it);
    bl[t] = { ...bl[t], items }; planEdit = null;
    planSave(sc, { blocks: bl }, editing ? "Modifica salvata ✔" : `${ex} aggiunto al piano ✔`);
  };
  if ($("#pCancelEdit")) $("#pCancelEdit").onclick = () => { planEdit = null; renderView(); };
  if ($("#pAddWod")) $("#pAddWod").onclick = () => {
    const w = allWods().find((x) => x.id === $("#pWod").value); if (!w) return;
    const bl = { ...sc.blocks }; bl.wod = { ...bl.wod, items: [...bl.wod.items, wodSnap(w)] };
    planSave(sc, { blocks: bl }, `WOD ${w.name} aggiunto al piano ✔`);
  };
  $("#pDelDay").onclick = async (ev) => {
    if (!armDelete(ev.currentTarget)) return;
    try { await S.remove(user.uid, "schede", sc.id); planSel = null; lsSet("ibd_plan_sel", ""); planEdit = null; await reload(); renderView(); toast("Giorno eliminato"); }
    catch (e) { planErr(e); }
  };
}

/* ---- WOD ---- */
V.wod = {
  html() {
    const w = todayWod(), T = TYPES[w.type];
    const labels = { time: ["Il tuo tempo (minuti:secondi)", "Es. 12:34"], rounds: ["Il tuo risultato (giri + ripetizioni)", "Es. 8+12"], count: [w.type === "EMOM" || w.type === "Death By" ? "Minuti completati" : "Round completati", "Es. 10"], kg: ["Carico massimo (kg)", "Es. 80"] }[T.kind];
    let pre = "";
    if (T.kind === "time" && timerWod?.id === w.id && lastElapsed > 5) pre = fmtTime(lastElapsed);
    if (T.kind === "rounds" && laps > 0) pre = String(laps);
    return `
    <div class="card">
      <div class="eyebrow">WOD di oggi</div>
      <h2 style="font-size:2.3rem;margin:6px 0 0">${esc(w.name)}</h2>
      <div class="sub">${esc(wodSub(w))}</div>
      <div class="moves">${(w.moves || []).map((m) => `<div>${esc(m)}</div>`).join("")}</div>
      <p class="note">${esc(w.note || NOTE)}</p>
      <button class="btn primary" id="wStart" style="margin-top:0">${timer.running && timerWod?.id === w.id ? "⏸ Pausa timer" : "▶ Avvia timer del WOD"}</button>
      <button class="btn outline" id="wChange">Cambia WOD</button>
    </div>

    <div class="card"><h2>Registra il risultato</h2>
      <div class="info">Stai registrando il risultato del WOD selezionato qui sopra: <b>${esc(w.name)}</b> (${esc(wodSub(w))}). Per registrarne un altro, scegline uno con “Cambia WOD” o dai tuoi WOD.</div>
      <label for="rVal" style="margin-top:0">${labels[0]}</label>
      <input id="rVal" placeholder="${labels[1]}" value="${esc(pre)}" ${T.kind === "time" || T.kind === "rounds" ? "" : 'inputmode="decimal"'} autocomplete="off">
      <button class="btn primary" id="rSave">Salva risultato</button>
    </div>

    <div class="card"><h2>Crea il tuo WOD</h2>
      <div class="chips">${Object.keys(TYPES).map((t) => `<button class="chip ${t === newType ? "on" : ""}" data-t="${t}">${t}</button>`).join("")}</div>
      <p class="small" style="margin:8px 0 0">${esc(TYPES[newType].desc)}</p>
      <label for="cName">Nome (facoltativo)</label>
      <input id="cName" placeholder="Es. Il mio ${newType}">
      ${TYPES[newType].fields.map((f) => `<label for="c_${f}">${FIELD[f][0]}</label><input id="c_${f}" type="number" inputmode="numeric" min="1" value="${FIELD[f][1]}">`).join("")}
      <label for="cMoves">Movimenti (uno per riga)</label>
      <textarea id="cMoves" rows="4" placeholder="Es.&#10;21 thruster&#10;21 trazioni"></textarea>
      <button class="btn primary" id="cSave">Salva WOD</button>
    </div>`;
  },
  bind() {
    const w = todayWod(), T = TYPES[w.type];
    $("#wChange").onclick = openWodList;
    $("#wStart").onclick = () => {
      if (timerWod?.id === w.id && (timer.running || timer.elapsed() > 0) && !timer.finished) { timer.running ? timer.pause() : timer.start(); }
      else { setupTimer(w); timer.start(); }
      scrollTo({ top: 0, behavior: "smooth" }); renderView();
    };
    $("#rSave").onclick = async () => {
      const raw = $("#rVal").value, v = parseScore(T.kind, raw);
      if (v === null) return toast(T.kind === "time" ? "Usa il formato minuti:secondi, es. 12:34" : T.kind === "rounds" ? "Usa il formato giri+ripetizioni, es. 8+12" : "Inserisci un numero", true);
      const score = T.kind === "time" ? fmtTime(v) : T.kind === "kg" ? `${num(v)} kg` : raw.trim().replace(/\s/g, "");
      await save("results", { wod: w.name, type: w.type, kind: T.kind, score, value: v, date: Date.now() }, `Risultato salvato: ${w.name} ${score} ✔`);
    };
    $$("[data-t]").forEach((b) => (b.onclick = () => { newType = b.dataset.t; renderView(); }));
    $("#cSave").onclick = async () => {
      const moves = $("#cMoves").value.split("\n").map((s) => s.trim()).filter(Boolean);
      if (!moves.length) return toast("Aggiungi almeno un movimento", true);
      const o = { name: $("#cName").value.trim() || `Il mio ${newType}`, type: newType, moves, createdAt: Date.now() };
      TYPES[newType].fields.forEach((f) => (o[f] = parseInt($(`#c_${f}`).value) || FIELD[f][1]));
      const id = await S.add(user.uid, "wods", o);
      lsSet("ibd_today_wod", id); await reload(); setupTimer(null); renderAll(); toast(`WOD «${o.name}» creato e selezionato ✔`); scrollTo({ top: 0, behavior: "smooth" });
    };
  },
};

function openWodList() {
  $("#wodList").innerHTML = allWods().map((w) => `
    <div class="row"><button style="text-align:left;flex:1" data-pick="${w.id}"><div class="nm">${esc(w.name)}</div><div class="tp">${esc(wodSub(w))}${w.id.startsWith("p-") ? "" : " · tuo WOD"}</div></button>
    ${w.id.startsWith("p-") ? "" : `<button class="x" data-delwod="${w.id}" aria-label="Elimina">✕</button>`}</div>`).join("");
  $$("[data-pick]").forEach((b) => (b.onclick = () => { lsSet("ibd_today_wod", b.dataset.pick); $("#wodDlg").close(); setupTimer(null); renderView(); }));
  $$("[data-delwod]").forEach((b) => (b.onclick = () => arm(b, "w" + b.dataset.delwod, async () => {
    await S.remove(user.uid, "wods", b.dataset.delwod); if (lsGet("ibd_today_wod") === b.dataset.delwod) lsSet("ibd_today_wod", "");
    await reload(); openWodList(); renderView();
  })));
  $("#wodDlg").showModal();
}
$("#wodClose").onclick = () => $("#wodDlg").close();

/* ---- PROGRESSI ---- */
let selEx = null;
V.progressi = {
  html() {
    const g = groups();
    if (!selEx || !g.find((x) => x.key === selEx)) selEx = g[0]?.key;
    const maxes = g.map((x) => ({ g: x, e: x.list.filter((e) => e.kind === "max").sort((a, b) => b.kg - a.kg || b.date - a.date)[0] })).filter((x) => x.e);
    // miglioramenti WOD
    const byW = new Map();
    for (const r of [...D.results].sort((a, b) => a.date - b.date)) { if (!byW.has(r.wod)) byW.set(r.wod, []); byW.get(r.wod).push(r); }
    const wodRows = [...byW.entries()].map(([name, rs]) => {
      const kind = rs[0].kind, first = rs[0];
      const best = rs.reduce((a, r) => ((kind === "time" ? r.value < a.value : r.value > a.value) ? r : a));
      return { name, rs, kind, first, best };
    });
    return `
    <div class="card"><h2>Progressi</h2>
      ${g.length ? `<label for="pSel" style="margin-top:0">Esercizio</label>
      <select id="pSel">${g.map((x) => `<option value="${esc(x.key)}" ${x.key === selEx ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
      <canvas id="pChart"></canvas><div class="rec" id="pRec"></div>` : `<p class="muted" style="margin:0">Salva un esercizio o un massimale per vedere qui i tuoi progressi.</p>`}
    </div>

    <div class="card"><h2>Massimali</h2>
      <label for="mEx" style="margin-top:0">Esercizio</label>
      <input id="mEx" list="exList2" placeholder="Es. Squat" autocomplete="off"><datalist id="exList2">${g.map((x) => `<option value="${esc(x.name)}">`).join("")}</datalist>
      <div class="g2">
        <div><label for="mKg">Massimale (kg)</label><input id="mKg" type="number" inputmode="decimal" min="0" step="0.5"></div>
        <div><label for="mDate">Data</label><input id="mDate" type="date" value="${new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10)}"></div>
      </div>
      <button class="btn primary" id="mSave">Registra massimale</button>
      <div style="margin-top:10px">${maxes.map((x) => `<div class="row"><div><div class="nm">${esc(x.g.name)}</div><div class="tp">massimale</div></div><div class="val"><small>${fd(x.e.date)}</small><b>${num(x.e.kg)} kg</b></div></div>`).join("")}</div>
    </div>

    <div class="card"><h2>Miglioramenti WOD</h2>
      ${wodRows.length ? wodRows.map((r) => {
        const f = (x) => (r.kind === "time" ? fmtTime(x.value) : x.score);
        const imp = r.rs.length > 1 && (r.kind === "time" ? r.best.value < r.first.value : r.best.value > r.first.value);
        return `<div class="row"><div><div class="nm">${esc(r.name)}</div><div class="tp">${r.rs.length} ${r.rs.length === 1 ? "risultato" : "risultati"}</div></div>
          <div class="val ${r.rs.length > 1 ? "chg" : ""}">${r.rs.length > 1 ? `<span class="a"><small>${fd(r.first.date)}</small><b>${esc(f(r.first))}</b></span><span class="arrow">→</span><span class="${imp ? "" : "dn"}"><small>${fd(r.best.date)}</small><b>${esc(f(r.best))}</b></span>` : `<span><small>${fd(r.first.date)}</small><b>${esc(f(r.first))}</b></span>`}</div></div>`;
      }).join("") : `<p class="muted" style="margin:0">Salva il risultato di un WOD per vedere i miglioramenti.</p>`}
    </div>`;
  },
  bind() {
    const draw = () => {
      const g = groups().find((x) => x.key === selEx); if (!g) return;
      const pts = dayBest(g.list, (e) => e.kg).slice(-30);
      drawChart($("#pChart"), pts.map((p) => ({ t: p.t, v: p.v })));
      const rec = Math.max(...pts.map((p) => p.v)), diff = pts.at(-1).v - pts[0].v;
      $("#pRec").innerHTML = `Record: <b>${num(rec)} kg</b>${pts.length > 1 ? ` · Variazione: <b style="color:${diff >= 0 ? "var(--green)" : "var(--red)"}">${diff >= 0 ? "+" : ""}${num(diff)} kg</b> dall'inizio` : ""}`;
    };
    if ($("#pSel")) { draw(); $("#pSel").onchange = (e) => { selEx = e.target.value; draw(); }; }
    $("#mSave").onclick = async () => {
      const ex = $("#mEx").value.trim(), kg = parseFloat($("#mKg").value);
      if (!ex) return toast("Scrivi il nome dell'esercizio", true);
      if (!(kg > 0)) return toast("Inserisci il massimale in kg", true);
      const d = new Date($("#mDate").value + "T12:00:00").getTime() || Date.now();
      await save("entries", { kind: "max", exercise: ex, kg, reps: 1, sets: 1, kcal: 0, date: d }, `Massimale salvato: ${ex} ${num(kg)} kg 🏆`);
    };
  },
};

function drawChart(canvas, pts) {
  const dpr = devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const c = canvas.getContext("2d"); c.scale(dpr, dpr); c.clearRect(0, 0, W, H);
  if (!pts.length) return;
  const pl = 34, pr = 34, pt = 30, pb = 30;
  const xs = pts.map((p) => p.t), ys = pts.map((p) => p.v);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), lo = Math.min(...ys), hi = Math.max(...ys);
  const span = hi - lo || Math.max(hi, 1) * 0.3, y0 = lo - span * 0.25, y1 = hi + span * 0.25;
  const X = (t) => (x1 === x0 ? W / 2 : pl + ((t - x0) / (x1 - x0)) * (W - pl - pr));
  const Y = (v) => H - pb - ((v - y0) / (y1 - y0)) * (H - pt - pb);
  c.strokeStyle = "#cfc9b9"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(pl - 14, H - pb + 6); c.lineTo(W - pr + 14, H - pb + 6); c.stroke();
  c.strokeStyle = "#2347f5"; c.lineWidth = 3; c.lineJoin = "round"; c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(X(p.t), Y(p.v)) : c.moveTo(X(p.t), Y(p.v)))); c.stroke();
  c.font = "600 13px Barlow, sans-serif"; c.textAlign = "center";
  const step = Math.ceil(pts.length / 6);
  pts.forEach((p, i) => {
    c.fillStyle = "#2347f5"; c.beginPath(); c.arc(X(p.t), Y(p.v), 6, 0, 7); c.fill();
    if (i % step === 0 || i === pts.length - 1) {
      c.fillStyle = "#14181f"; c.fillText(num(p.v), X(p.t), Y(p.v) - 12);
      c.fillStyle = "#6b6a63"; c.fillText(fd(p.t), X(p.t), H - 6);
    }
  });
}

/* ---- STORICO ---- */
V.storico = {
  html() {
    const g = groups();
    const open = V.storico.open || {};
    const one = g.filter((x) => x.list.some((e) => e.kg > 0 && e.reps > 0));
    const rm = one.map((x) => {
      const days = dayBest(x.list.filter((e) => e.kg > 0 && e.reps > 0), (e) => epley(e.kg, e.reps));
      return { x, first: days[0], last: days.at(-1) };
    });
    const res = [...D.results].sort((a, b) => b.date - a.date);
    return `
    <div class="card"><h2>Allenamenti</h2>
      ${g.length ? g.map((x) => {
        const first = x.list[0], last = x.list.at(-1), many = x.list.length > 1 && dayKey(first.date) !== dayKey(last.date);
        const up = last.kg >= first.kg;
        return `<button class="row" data-tg="${esc(x.key)}"><div><div class="nm">${esc(x.name)}</div><div class="tp">tocca per i dettagli</div></div>
          <div class="val ${many ? "chg" : ""}">${many ? `<span class="a"><small>${fd(first.date)}</small><b>${num(first.kg)} kg</b></span><span class="arrow">→</span><span class="${up ? "" : "dn"}"><small>${fd(last.date)}</small><b>${num(last.kg)} kg</b></span>` : `<span><small>${fd(last.date)}</small><b>${num(last.kg)} kg</b></span>`}</div></button>
          ${open[x.key] ? `<div class="det">${[...x.list].reverse().map((e) => `<div><span>${fd(e.date)} · ${e.kind === "max" ? "🏆 massimale" : `${e.reps} rip × ${e.sets}`}</span><span><b>${num(e.kg)} kg</b> <button class="x" data-del="entries:${e.id}" aria-label="Elimina">✕</button></span></div>`).join("")}</div>` : ""}`;
      }).join("") : `<p class="muted" style="margin:0">Ancora nessun allenamento salvato.</p>`}
    </div>

    <div class="card"><h2>1RM stimato</h2>
      <p class="muted"><b style="color:var(--ink)">1RM</b> (una ripetizione massimale) è il peso massimo che riesci a sollevare una sola volta con buona tecnica. Qui è calcolato dalle tue serie, senza doverlo provare.</p>
      ${rm.length ? rm.map(({ x, first, last }) => {
        const many = first.t !== last.t && dayKey(first.t) !== dayKey(last.t);
        return `<div class="row"><div><div class="nm">${esc(x.name)}</div><div class="tp">da ${num(last.e.kg)} kg × ${last.e.reps}</div></div>
          <div class="val ${many ? "chg" : ""}">${many ? `<span class="a"><small>${fd(first.t)}</small><b>${num(first.v)} kg</b></span><span class="arrow">→</span><span class="${last.v >= first.v ? "" : "dn"}"><small>${fd(last.t)}</small><b>${num(last.v)} kg</b></span>` : `<span><small>${fd(last.t)}</small><b>${num(last.v)} kg</b></span>`}</div></div>`;
      }).join("") : ""}
      <p class="small" style="margin:12px 0 0">Formula di Epley: peso × (1 + ripetizioni ÷ 30). Con 1 ripetizione il valore è il peso stesso. È più affidabile sotto le 10 ripetizioni.</p>
    </div>

    <div class="card"><h2>Risultati WOD</h2>
      ${res.length ? res.map((r) => `<div class="row"><div><div class="nm">${esc(r.wod)}</div><div class="tp">${fd(r.date)} · ${esc(r.type)}</div></div><div class="val"><b>${esc(r.score)}</b> <button class="x" data-del="results:${r.id}" aria-label="Elimina">✕</button></div></div>`).join("") : `<p class="muted" style="margin:0">Nessun risultato WOD salvato.</p>`}
    </div>`;
  },
  open: {},
  bind() {
    $$("[data-tg]").forEach((b) => (b.onclick = () => { V.storico.open[b.dataset.tg] = !V.storico.open[b.dataset.tg]; renderView(); }));
  },
};

/* ======================= render / navigazione ======================= */
async function save(col, obj, msg) {
  try { await S.add(user.uid, col, obj); await reload(); renderAll(); toast(msg); }
  catch (e) { toast("Errore di salvataggio: " + (e.code === "permission-denied" ? "regole Firestore non pubblicate" : e.message), true); }
}
async function reload() {
  const [entries, results, wods, schede] = await Promise.all(["entries", "results", "wods", "schede"].map((c) => S.list(user.uid, c)));
  D = { entries, results, wods, schede };
}
function renderView() {
  const y = scrollY;
  $("#main").innerHTML = V[view].html(); V[view].bind();
  $$("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.view === view));
  scrollTo(0, y);
}
function renderAll() { paintKcal(); renderView(); }
function go(v) { view = v; renderView(); scrollTo(0, 0); }
$$("#nav button").forEach((b) => (b.onclick = () => go(b.dataset.view)));

let armKey = null, armT;
function arm(btn, key, fn) {
  if (armKey !== key) {
    armKey = key; const old = btn.textContent; btn.textContent = "Elimina?"; btn.style.fontSize = ".95rem";
    clearTimeout(armT); armT = setTimeout(() => { armKey = null; if (btn.isConnected) { btn.textContent = old; btn.style.fontSize = ""; } }, 2500);
    return;
  }
  armKey = null; clearTimeout(armT); fn();
}
$("#main").addEventListener("click", (ev) => {
  const d = ev.target.closest("[data-del]"); if (!d) return;
  ev.stopPropagation();
  const [col, id] = d.dataset.del.split(":");
  arm(d, d.dataset.del, async () => {
    try { await S.remove(user.uid, col, id); await reload(); renderAll(); toast("Eliminato"); } catch (e) { toast("Errore: " + e.message, true); }
  });
}, true);

/* ======================= profilo ======================= */
$("#btnProfile").onclick = () => {
  $("#profMail").textContent = user.email;
  $("#profMode").textContent = S.demo ? "Modalità demo: i dati restano solo su questo telefono." : "I tuoi dati sono sincronizzati su Firebase.";
  $("#profDlg").showModal();
};
$("#profClose").onclick = () => $("#profDlg").close();
$("#btnLogout").onclick = () => S.authApi.out();
$("#btnExport").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(D, null, 2)], { type: "application/json" }));
  a.download = "ibd-training-dati.json"; a.click();
};

/* ======================= avvio ======================= */
function hello() {
  const name = (user.name || user.email.split("@")[0] || "atleta").split(" ")[0];
  const d = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  $("#hello").textContent = `Ciao ${name} · ${d}`;
}
S.init(async (u) => {
  user = u;
  if (!u) return showAuth();
  $("#auth").classList.add("hidden"); $("#app").classList.remove("hidden");
  hello();
  try { await reload(); } catch (e) { toast("Errore lettura dati: " + (e.code === "permission-denied" ? "pubblica le regole Firestore" : e.message), true); }
  setupTimer(null); paintLap(); go("allena"); paintKcal();
}).catch((e) => { showAuth(); $("#authErr").textContent = "Errore di avvio: " + e.message; });

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
