import * as S from "./store.js";
import { Timer, phasesFor, fmt, fmtUp, PREP } from "./timer.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let user = null, view = "allena", authMode = "in";
let D = { entries: [], results: [], wods: [] };
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
const fd = (ms) => new Date(ms).toLocaleDateString("it-IT", { day: "numeric", month: "short" }).replace(".", "");
const num = (n) => (Math.round(n * 10) / 10).toString().replace(".", ",");
const epley = (kg, r) => (r <= 1 ? kg : kg * (1 + r / 30));
const kcalFor = (e) => Math.round((e.kg || 0) * e.reps * e.sets * 0.04 + e.reps * e.sets * 0.5);
const fmtTime = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };

function groups() {
  const m = new Map();
  for (const e of [...D.entries].sort((a, b) => a.date - b.date)) {
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
  tile.className = "tile" + (t.done ? " done" : t.phase && t.running ? " " + t.phase.kind : t.running ? " run" : "");
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

let laps = 0, lapStart = 0, lapInt = null;
const paintLap = () => { $("#lapN").textContent = laps; $("#lapT").textContent = lapStart ? fmtUp((Date.now() - lapStart) / 1000) : "00:00"; };
pressable($("#tileLap"), () => {
  if (!lapStart) { lapStart = Date.now(); lapInt = setInterval(paintLap, 250); }
  else { laps++; lapStart = Date.now(); }
  paintLap();
}, () => { laps = 0; lapStart = 0; clearInterval(lapInt); paintLap(); });

function paintKcal() {
  const today = D.entries.filter((e) => isToday(e.date) && e.kind !== "max");
  $("#kcal").textContent = today.reduce((a, e) => a + (e.kcal || 0), 0);
  $("#kHint").textContent = today.length ? `${today.length} ${today.length === 1 ? "esercizio" : "esercizi"} oggi` : "salva un esercizio…";
}

/* ======================= VIEWS ======================= */
const V = {};

/* ---- ALLENA ---- */
V.allena = {
  html() {
    const g = groups();
    const today = D.entries.filter((e) => isToday(e.date) && e.kind !== "max").sort((a, b) => b.date - a.date);
    const names = [...new Set([...g.map((x) => x.name), "Back squat", "Front squat", "Deadlift", "Clean", "Snatch", "Strict press", "Push press", "Bench press", "Thruster", "Pull-up"])];
    return `
    <div class="card"><h2>Allenamento</h2>
      <label for="aEx" style="margin-top:0">Esercizio</label>
      <input id="aEx" list="exList" placeholder="Es. Back squat" autocomplete="off">
      <datalist id="exList">${names.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
      ${g.length ? `<div class="chips sm">${g.slice(0, 6).map((x) => `<button class="chip" data-ex="${esc(x.name)}">${esc(x.name)}</button>`).join("")}</div>` : ""}
      <div class="g3">
        <div><label for="aKg">Peso (kg)</label><input id="aKg" type="number" inputmode="decimal" min="0" step="0.5" placeholder="0"></div>
        <div><label for="aReps">Ripetizioni</label><input id="aReps" type="number" inputmode="numeric" min="1" value="10"></div>
        <div><label for="aSets">Serie</label><input id="aSets" type="number" inputmode="numeric" min="1" value="1"></div>
      </div>
      <button class="btn primary" id="aSave">Salva esercizio</button>
    </div>
    <div class="card"><h2>Oggi</h2>
      ${today.length ? today.map((e) => `<div class="row"><div><div class="nm">${esc(e.exercise)}</div><div class="tp">${num(e.kg)} kg × ${e.reps} rip × ${e.sets} ${e.sets === 1 ? "serie" : "serie"} · ${e.kcal} kcal</div></div><button class="x" data-del="entries:${e.id}" aria-label="Elimina">✕</button></div>`).join("") : `<p class="muted" style="margin:0">Nessun esercizio salvato oggi.</p>`}
    </div>`;
  },
  bind() {
    $$("[data-ex]").forEach((b) => (b.onclick = () => { $("#aEx").value = b.dataset.ex; const last = groups().find((x) => x.name === b.dataset.ex)?.list.at(-1); if (last) { $("#aKg").value = last.kg || ""; $("#aReps").value = last.reps; } $("#aKg").focus(); }));
    $("#aSave").onclick = async () => {
      const ex = $("#aEx").value.trim(), kg = parseFloat($("#aKg").value) || 0, reps = parseInt($("#aReps").value) || 0, sets = parseInt($("#aSets").value) || 1;
      if (!ex) return toast("Scrivi il nome dell'esercizio", true);
      if (reps < 1) return toast("Inserisci le ripetizioni", true);
      const e = { kind: "training", exercise: ex, kg, reps, sets, date: Date.now() }; e.kcal = kcalFor(e);
      await save("entries", e, `Salvato: ${ex} ${num(kg)} kg ✔`);
    };
  },
};

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
  $$("[data-delwod]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Eliminare questo WOD?")) return;
    await S.remove(user.uid, "wods", b.dataset.delwod); if (lsGet("ibd_today_wod") === b.dataset.delwod) lsSet("ibd_today_wod", "");
    await reload(); openWodList(); renderView();
  }));
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
  const [entries, results, wods] = await Promise.all(["entries", "results", "wods"].map((c) => S.list(user.uid, c)));
  D = { entries, results, wods };
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

$("#main").addEventListener("click", async (ev) => {
  const d = ev.target.closest("[data-del]"); if (!d) return;
  ev.stopPropagation();
  if (!confirm("Eliminare?")) return;
  const [col, id] = d.dataset.del.split(":");
  try { await S.remove(user.uid, col, id); await reload(); renderAll(); toast("Eliminato"); } catch (e) { toast("Errore: " + e.message, true); }
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
