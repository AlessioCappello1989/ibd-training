import * as S from "./store.js";
import { Timer, buildPhases, fmt, fmtUp } from "./timer.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let user = null, workouts = [], authMode = "in";

// ---------- WOD predefiniti (preset timer) ----------
const WODS = [
  { name: "Cindy", type: "AMRAP", mode: "amrap", cfg: { minutes: 20 }, desc: "5 trazioni · 10 piegamenti · 15 squat" },
  { name: "Fran", type: "For Time", mode: "fortime", cfg: { cap: 10 }, desc: "21-15-9 thruster + trazioni" },
  { name: "Grace", type: "For Time", mode: "fortime", cfg: { cap: 10 }, desc: "30 clean & jerk" },
  { name: "Karen", type: "For Time", mode: "fortime", cfg: { cap: 15 }, desc: "150 wall ball" },
  { name: "EMOM 12", type: "EMOM", mode: "emom", cfg: { rounds: 12, every: 60 }, desc: "Un blocco ogni minuto" },
  { name: "Tabata", type: "Tabata", mode: "tabata", cfg: { rounds: 8, work: 20, rest: 10 }, desc: "8 round 20\" on / 10\" off" },
];
let activeWod = null;

// ---------- Utils ----------
function toast(msg, bad) {
  const t = $("#toast"); t.textContent = msg; t.className = "show" + (bad ? " bad" : "");
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ""), 2600);
}
const dayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const fmtDate = (ms) => new Date(ms).toLocaleString("it-IT", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const toLocalInput = (ms) => { const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
const weekStart = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };

function streak() {
  const days = new Set(workouts.map((w) => dayKey(w.date)));
  let n = 0, d = new Date(); d.setHours(0, 0, 0, 0);
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1); // oggi non ancora allenato: non rompe la serie
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// Massimali (miglior carico) per esercizio
function bestByExercise() {
  const m = {};
  for (const w of workouts) for (const e of w.exercises || []) {
    if (!e.name || !(e.weight > 0)) continue;
    const k = e.name.trim().toLowerCase();
    (m[k] ||= { name: e.name.trim(), pts: [] }).pts.push({ t: w.date, kg: e.weight, reps: e.reps });
  }
  for (const k in m) m[k].pts.sort((a, b) => a.t - b.t);
  return m;
}

// ---------- Auth UI ----------
function showAuth() {
  $("#app").classList.add("hidden"); $("#auth").classList.remove("hidden");
  $("#btnDemo").classList.toggle("hidden", !S.demo);
  if (S.demo) $("#authErr").textContent = "Firebase non configurato: modalità demo disponibile.";
}
$$(".authtab").forEach((b) => b.onclick = () => {
  authMode = b.dataset.m;
  $$(".authtab").forEach((x) => x.classList.toggle("active", x === b));
  $("#authSubmit").textContent = authMode === "in" ? "ACCEDI" : "CREA ACCOUNT";
});
const authErrMsg = (e) => ({
  "auth/invalid-credential": "Email o password errata.",
  "auth/email-already-in-use": "Email già registrata.",
  "auth/weak-password": "Password troppo corta (min. 6).",
  "auth/popup-closed-by-user": "Accesso annullato.",
  "auth/unauthorized-domain": "Dominio non autorizzato in Firebase (Authentication → Impostazioni).",
}[e.code] || e.message);
$("#authForm").onsubmit = async (ev) => {
  ev.preventDefault(); $("#authErr").textContent = "";
  if (S.demo) return ($("#authErr").textContent = "Configura Firebase oppure usa la modalità demo.");
  try {
    const em = $("#email").value.trim(), pw = $("#password").value;
    await (authMode === "in" ? S.authApi.signIn(em, pw) : S.authApi.signUp(em, pw));
  } catch (e) { $("#authErr").textContent = authErrMsg(e); }
};
$("#btnGoogle").onclick = async () => {
  if (S.demo) return ($("#authErr").textContent = "Configura Firebase per usare Google.");
  try { await S.authApi.google(); } catch (e) { $("#authErr").textContent = authErrMsg(e); }
};
$("#btnReset").onclick = async () => {
  const em = $("#email").value.trim();
  if (!em) return ($("#authErr").textContent = "Inserisci prima l'email.");
  if (S.demo) return;
  try { await S.authApi.reset(em); toast("Email di reset inviata"); } catch (e) { $("#authErr").textContent = authErrMsg(e); }
};
$("#btnDemo").onclick = () => S.authApi.demoLogin();
$("#btnLogout").onclick = () => S.authApi.out();

// ---------- Navigazione ----------
function go(view) {
  $$(".view").forEach((v) => v.classList.toggle("hidden", v.id !== "v-" + view));
  $$(".nav button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  ({ home: renderHome, progress: renderProgress, history: renderHistory, profile: renderProfile }[view] || (() => {}))();
  scrollTo(0, 0);
}
$$(".nav button").forEach((b) => b.onclick = () => go(b.dataset.view));

async function reload() { workouts = await S.listWorkouts(user.uid); }

// ---------- Home ----------
function renderHome() {
  const now = Date.now(), ws = weekStart(now);
  const week = workouts.filter((w) => w.date >= ws).length;
  const mins = Math.round(workouts.filter((w) => w.date >= ws).reduce((a, w) => a + (w.duration || 0), 0));
  const name = user.name?.split(" ")[0] || user.email.split("@")[0];
  const last = workouts[0];
  $("#v-home").innerHTML = `
    <div class="hello"><p class="muted" style="margin:0">Ciao,</p><h2>${esc(name).toUpperCase()} 💪</h2></div>
    <div class="stats">
      <div class="stat"><b>${week}</b><small>Questa sett.</small></div>
      <div class="stat"><b>${streak()}</b><small>Giorni di fila</small></div>
      <div class="stat"><b>${mins}</b><small>Minuti sett.</small></div>
    </div>
    <div class="card"><h3>Allenamento di oggi</h3><div class="wods">
      ${WODS.map((w, i) => `<div class="wod"><div><b>${w.name}</b><small>${w.type} · ${w.desc}</small></div><button data-w="${i}">VAI</button></div>`).join("")}
    </div></div>
    ${last ? `<div class="card"><h3>Ultimo allenamento</h3><b>${esc(last.title)}</b><br><small class="muted">${fmtDate(last.date)} · ${esc(last.type)}${last.score ? " · " + esc(last.score) : ""}</small></div>` : `<div class="card muted">Nessun allenamento ancora. Avvia il timer o registra il primo!</div>`}
    <button class="btn primary big" id="homeLog" style="width:100%">+ REGISTRA ALLENAMENTO</button>`;
  $$("[data-w]").forEach((b) => b.onclick = () => { activeWod = WODS[b.dataset.w]; go("timer"); applyWod(); });
  $("#homeLog").onclick = () => openLog();
}

// ---------- Timer UI ----------
let mode = "amrap", cfg = {}, rounds = 0;
const DEF = {
  amrap: { prep: 10, minutes: 12 },
  emom: { prep: 10, rounds: 10, every: 60 },
  tabata: { prep: 10, rounds: 8, work: 20, rest: 10 },
  fortime: { prep: 10, cap: 15 },
  rest: { prep: 0, rest: 90 },
};
const FIELDS = {
  amrap: [["minutes", "Minuti"]], emom: [["rounds", "Round"], ["every", "Ogni (sec)"]],
  tabata: [["rounds", "Round"], ["work", "Lavoro (s)"], ["rest", "Recupero (s)"]],
  fortime: [["cap", "Time cap (min)"]], rest: [["rest", "Secondi"]],
};
const timer = new Timer(onTick, onDone);

function renderCfg() {
  $("#cfg").innerHTML = [["prep", "Prep (s)"], ...FIELDS[mode]].map(([k, l]) =>
    `<label>${l}<input type="number" min="0" data-k="${k}" value="${cfg[k]}"></label>`).join("");
  $$("#cfg input").forEach((i) => i.oninput = () => { cfg[i.dataset.k] = Math.max(0, +i.value || 0); resetTimer(); });
}
function setMode(m, keep) {
  mode = m; cfg = { ...DEF[m], ...(keep || {}) };
  $$("#modeChips button").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
  renderCfg(); resetTimer();
}
function applyWod() {
  if (!activeWod) return;
  setMode(activeWod.mode, activeWod.cfg);
  $("#wodBanner").classList.remove("hidden");
  $("#wodBanner").innerHTML = `<b>${activeWod.name}</b> — ${activeWod.desc} <button class="link" id="clearWod">✕</button>`;
  $("#clearWod").onclick = () => { activeWod = null; $("#wodBanner").classList.add("hidden"); };
}
function resetTimer() {
  rounds = 0; $("#roundCount").textContent = 0;
  timer.reset(buildPhases(mode, cfg)); $("#tStart").textContent = "START";
}
function onTick(t) {
  const clock = $("#clock");
  clock.className = "clock " + (t.done ? "done" : t.phase ? t.phase.kind : "");
  if (!t.phase) { $("#time").textContent = "--:--"; $("#phaseLabel").textContent = "PRONTO"; $("#barFill").style.width = "0"; return; }
  const p = t.phase;
  $("#time").textContent = p.up ? fmtUp(t.inPhase) : fmt(p.dur - t.inPhase);
  $("#phaseLabel").textContent = t.done ? "FINITO 🔥" : p.label;
  $("#roundInfo").textContent = (mode === "tabata" || mode === "emom") && p.round ? `Round ${p.round}` : "";
  $("#barFill").style.width = Math.min(100, (t.inPhase / p.dur) * 100) + "%";
}
function onDone(total) { $("#tStart").textContent = "START"; askSave(total); }

$$("#modeChips button").forEach((b) => b.onclick = () => { activeWod = null; $("#wodBanner").classList.add("hidden"); setMode(b.dataset.mode); });
$("#tStart").onclick = () => {
  if (timer.running) { timer.pause(); $("#tStart").textContent = "RIPRENDI"; }
  else { timer.start(); $("#tStart").textContent = "PAUSA"; }
};
$("#tReset").onclick = resetTimer;
$("#tRound").onclick = () => { rounds++; $("#roundCount").textContent = rounds; };
$("#tFinish").onclick = () => { const e = timer.stopNow(); if (e < 1) return toast("Avvia prima il timer", true); $("#tStart").textContent = "RIPRENDI"; askSave(e); };
$("#btnManual").onclick = () => openLog();

function askSave(seconds) {
  // Per For Time il tempo trascorso è il risultato; per AMRAP i giri
  const score = mode === "fortime" ? fmtUp(seconds) : mode === "amrap" && rounds ? `${rounds} giri` : "";
  const prep = cfg.prep || 0;
  const workSec = Math.max(0, seconds - prep);
  openLog({
    title: activeWod?.name || ({ amrap: "AMRAP", emom: "EMOM", tabata: "Tabata", fortime: "For Time", rest: "Riposo" })[mode],
    type: activeWod?.type || ({ amrap: "AMRAP", emom: "EMOM", tabata: "Tabata", fortime: "For Time", rest: "Altro" })[mode],
    duration: Math.round((workSec / 60) * 10) / 10, score,
  });
}

// ---------- Registrazione ----------
const dlg = $("#logDlg");
function exRow(e = {}) {
  const d = document.createElement("div"); d.className = "exrow"; d.style.marginTop = "6px";
  d.innerHTML = `<input list="exNames" placeholder="Esercizio" value="${esc(e.name || "")}" data-f="name">
    <input type="number" step="0.5" min="0" placeholder="kg" value="${e.weight ?? ""}" data-f="weight">
    <input type="number" min="0" placeholder="reps" value="${e.reps ?? ""}" data-f="reps">
    <input type="number" min="0" placeholder="serie" value="${e.sets ?? ""}" data-f="sets">
    <button type="button" aria-label="Rimuovi">✕</button>`;
  d.querySelector("button").onclick = () => d.remove();
  $("#exRows").appendChild(d);
}
function openLog(pre = {}) {
  $("#lTitle").value = pre.title || ""; $("#lType").value = pre.type || "AMRAP";
  $("#lDur").value = pre.duration ?? 0; $("#lDate").value = toLocalInput(Date.now());
  $("#lScore").value = pre.score || ""; $("#lNotes").value = ""; $("#exRows").innerHTML = "";
  $("#exRows").insertAdjacentHTML("beforebegin", "");
  exRow();
  const names = new Set([...WODS.map((w) => w.name), ...workouts.map((w) => w.title)]);
  $("#wodNames").innerHTML = [...names].map((n) => `<option value="${esc(n)}">`).join("");
  const ex = new Set(Object.values(bestByExercise()).map((x) => x.name));
  ["Back squat", "Front squat", "Deadlift", "Clean", "Snatch", "Shoulder press", "Bench press", "Thruster"].forEach((n) => ex.add(n));
  $("#exNames").innerHTML = [...ex].map((n) => `<option value="${esc(n)}">`).join("");
  dlg.showModal();
}
$("#addEx").onclick = () => exRow();
$("#lCancel").onclick = () => dlg.close();
$("#logForm").onsubmit = async (ev) => {
  ev.preventDefault();
  const exercises = $$(".exrow").map((r) => {
    const g = (f) => r.querySelector(`[data-f=${f}]`).value;
    return { name: g("name").trim(), weight: +g("weight") || 0, reps: +g("reps") || 0, sets: +g("sets") || 0 };
  }).filter((e) => e.name);
  const w = {
    title: $("#lTitle").value.trim(), type: $("#lType").value, duration: +$("#lDur").value || 0,
    date: new Date($("#lDate").value).getTime(), score: $("#lScore").value.trim(), notes: $("#lNotes").value.trim(),
    exercises, createdAt: Date.now(),
  };
  if (!w.title || isNaN(w.date)) return;
  try {
    const before = bestByExercise();
    await S.addWorkout(user.uid, w); await reload(); dlg.close();
    const after = bestByExercise();
    const prs = exercises.filter((e) => e.weight > 0 && (!before[e.name.toLowerCase()] || e.weight > Math.max(...before[e.name.toLowerCase()].pts.map((p) => p.kg))));
    toast(prs.length ? `🏆 Nuovo PR: ${prs[0].name} ${prs[0].weight} kg!` : "Allenamento salvato ✔");
    go("history");
  } catch (e) { toast("Errore salvataggio: " + e.message, true); }
};

// ---------- Storico ----------
function renderHistory() {
  const el = $("#v-history");
  if (!workouts.length) return (el.innerHTML = `<div class="card muted">Nessun allenamento registrato.</div><button class="btn primary" id="hLog" style="width:100%">+ Registra</button>`, $("#hLog").onclick = () => openLog());
  const best = bestByExercise();
  el.innerHTML = `<button class="btn primary" id="hLog" style="width:100%;margin-bottom:14px">+ Registra allenamento</button>` +
    workouts.map((w) => `
    <div class="card hist"><div style="flex:1">
      <h4>${esc(w.title)}</h4>
      <small><span class="tag">${esc(w.type)}</span>${fmtDate(w.date)}${w.duration ? " · " + w.duration + " min" : ""}</small>
      ${(w.exercises || []).length ? `<ul>${w.exercises.map((e) => {
        const isPr = e.weight > 0 && e.weight >= Math.max(...best[e.name.toLowerCase()].pts.map((p) => p.kg));
        return `<li>${esc(e.name)} ${e.weight ? e.weight + " kg" : ""}${e.sets ? " " + e.sets + "×" : " "}${e.reps ? e.reps : ""} ${isPr ? '<span class="pr">PR</span>' : ""}</li>`;
      }).join("")}</ul>` : ""}
      ${w.notes ? `<p class="muted" style="margin:8px 0 0;font-size:.85rem">${esc(w.notes)}</p>` : ""}
    </div><div><div class="score">${esc(w.score)}</div><button class="del" data-del="${w.id}">Elimina</button></div></div>`).join("");
  $("#hLog").onclick = () => openLog();
  $$("[data-del]").forEach((b) => b.onclick = async () => {
    if (!confirm("Eliminare questo allenamento?")) return;
    await S.deleteWorkout(user.uid, b.dataset.del); await reload(); renderHistory(); toast("Eliminato");
  });
}

// ---------- Progressi ----------
function drawLine(canvas, pts, label, color = "#ff7a1a") {
  const dpr = devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const c = canvas.getContext("2d"); c.scale(dpr, dpr); c.clearRect(0, 0, W, H);
  if (!pts.length) return;
  const pad = { l: 36, r: 10, t: 12, b: 22 };
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs) || 1, y0 = 0, y1 = Math.max(...ys) * 1.15 || 1;
  const X = (x) => pad.l + (x1 === x0 ? (W - pad.l - pad.r) / 2 : ((x - x0) / (x1 - x0)) * (W - pad.l - pad.r));
  const Y = (y) => H - pad.b - ((y - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  c.strokeStyle = "#243252"; c.fillStyle = "#8c9bb8"; c.font = "11px Inter"; c.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = y0 + ((y1 - y0) * i) / 4, y = Y(v);
    c.beginPath(); c.moveTo(pad.l, y); c.lineTo(W - pad.r, y); c.stroke();
    c.fillText(Math.round(v), 4, y + 4);
  }
  c.strokeStyle = color; c.lineWidth = 3; c.lineJoin = "round"; c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(X(p.x), Y(p.y)) : c.moveTo(X(p.x), Y(p.y)))); c.stroke();
  c.fillStyle = color; pts.forEach((p) => { c.beginPath(); c.arc(X(p.x), Y(p.y), 4, 0, 7); c.fill(); });
  c.fillStyle = "#8c9bb8";
  const f = (t) => new Date(t).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
  c.fillText(f(x0), pad.l, H - 5); if (x1 !== x0) { c.textAlign = "right"; c.fillText(f(x1), W - pad.r, H - 5); c.textAlign = "left"; }
}
let selEx = null;
function renderProgress() {
  const el = $("#v-progress");
  if (!workouts.length) return (el.innerHTML = `<div class="card muted">Registra qualche allenamento per vedere i tuoi progressi.</div>`);
  // allenamenti per settimana (ultime 8)
  const ws = weekStart(Date.now()), weeks = [];
  for (let i = 7; i >= 0; i--) { const s = ws - i * 7 * 864e5; weeks.push({ x: s, y: workouts.filter((w) => w.date >= s && w.date < s + 7 * 864e5).length }); }
  const best = bestByExercise(), keys = Object.keys(best);
  if (!selEx || !best[selEx]) selEx = keys[0];
  const total = workouts.length, totalMin = Math.round(workouts.reduce((a, w) => a + (w.duration || 0), 0));
  el.innerHTML = `
    <div class="stats"><div class="stat"><b>${total}</b><small>Allenamenti</small></div>
      <div class="stat"><b>${Math.round(totalMin / 60 * 10) / 10}</b><small>Ore totali</small></div>
      <div class="stat"><b>${streak()}</b><small>Serie giorni</small></div></div>
    <div class="card"><h3>Allenamenti / settimana</h3><canvas id="cWeeks"></canvas></div>
    <div class="card"><h3>Progressione carichi</h3>
      ${keys.length ? `<select id="exSel">${keys.map((k) => `<option value="${esc(k)}" ${k === selEx ? "selected" : ""}>${esc(best[k].name)}</option>`).join("")}</select><canvas id="cEx"></canvas>`
        : `<p class="muted">Aggiungi esercizi con i kg per vedere il grafico.</p>`}</div>
    ${keys.length ? `<div class="card"><h3>Record personali 🏆</h3><table><tr><th>Esercizio</th><th>Max</th><th>Data</th></tr>
      ${keys.map((k) => { const b = best[k].pts.reduce((a, p) => (p.kg >= a.kg ? p : a)); return `<tr><td>${esc(best[k].name)}</td><td><b class="pr">${b.kg} kg</b></td><td class="muted">${new Date(b.t).toLocaleDateString("it-IT")}</td></tr>`; }).join("")}</table></div>` : ""}`;
  drawLine($("#cWeeks"), weeks, "", "#2f6bff");
  if (keys.length) {
    const draw = () => drawLine($("#cEx"), best[selEx].pts.map((p) => ({ x: p.t, y: p.kg })));
    draw(); $("#exSel").onchange = (e) => { selEx = e.target.value; draw(); };
  }
}

// ---------- Profilo ----------
function renderProfile() {
  $("#v-profile").innerHTML = `
    <div class="card"><h3>Account</h3><p style="margin:0">${esc(user.email)}</p>
      <p class="muted" style="font-size:.85rem">${S.demo ? "Modalità demo: i dati restano solo su questo dispositivo." : "Dati sincronizzati su Firebase."}</p></div>
    <div class="card"><h3>Dati</h3>
      <button class="btn" id="pExport" style="width:100%">Esporta storico (JSON)</button></div>
    <button class="btn" id="pOut" style="width:100%">Esci</button>`;
  $("#pExport").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(workouts, null, 2)], { type: "application/json" }));
    a.download = "ibd-allenamenti.json"; a.click();
  };
  $("#pOut").onclick = () => S.authApi.out();
}

// ---------- Avvio ----------
S.init(async (u) => {
  user = u;
  if (!u) return showAuth();
  $("#auth").classList.add("hidden"); $("#app").classList.remove("hidden");
  try { await reload(); } catch (e) { toast("Errore lettura dati: " + e.message, true); }
  setMode("amrap"); go("home");
}).catch((e) => { showAuth(); $("#authErr").textContent = "Errore avvio: " + e.message; });

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
