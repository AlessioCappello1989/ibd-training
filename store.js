// Livello dati: Firebase (Auth + Firestore) con fallback demo su localStorage.
import { firebaseConfig, isConfigured } from "./firebase-config.js";

const V = "10.14.1";
const CDN = (m) => `https://www.gstatic.com/firebasejs/${V}/firebase-${m}.js`;

let A, F, auth, db;
export const demo = !isConfigured;

export async function init(onUser) {
  if (demo) {
    const u = localStorage.getItem("ibd_demo_user");
    onUser(u ? JSON.parse(u) : null);
    return;
  }
  const [{ initializeApp }, a, f] = await Promise.all([import(CDN("app")), import(CDN("auth")), import(CDN("firestore"))]);
  A = a; F = f;
  const app = initializeApp(firebaseConfig);
  auth = A.getAuth(app);
  db = F.getFirestore(app);
  // errori di un eventuale login via redirect
  A.getRedirectResult(auth).catch((e) => window.dispatchEvent(new CustomEvent("autherr", { detail: e })));
  A.onAuthStateChanged(auth, (u) => onUser(u ? { uid: u.uid, email: u.email || "", name: u.displayName || "" } : null));
}

export const authApi = {
  signIn: (email, pw) => A.signInWithEmailAndPassword(auth, email, pw),
  signUp: (email, pw) => A.createUserWithEmailAndPassword(auth, email, pw),
  async google() {
    const p = new A.GoogleAuthProvider();
    p.setCustomParameters({ prompt: "select_account" });
    try {
      return await A.signInWithPopup(auth, p);
    } catch (e) {
      // su alcuni telefoni/browser il popup è bloccato: si passa al redirect
      if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/web-storage-unsupported"].includes(e.code))
        return A.signInWithRedirect(auth, p);
      throw e;
    }
  },
  reset: (email) => A.sendPasswordResetEmail(auth, email),
  async out() {
    if (demo) { localStorage.removeItem("ibd_demo_user"); location.reload(); }
    else await A.signOut(auth);
  },
  demoLogin() {
    localStorage.setItem("ibd_demo_user", JSON.stringify({ uid: "demo", email: "demo@locale", name: "Atleta" }));
    location.reload();
  },
};

// ---- Dati: users/{uid}/{col}/{id}   col = entries | results | wods
const key = (uid, col) => `ibd_${col}_${uid}`;
const ls = (uid, col) => JSON.parse(localStorage.getItem(key(uid, col)) || "[]");
const when = (x) => x.date || x.createdAt || 0;

export async function list(uid, col) {
  if (demo) return ls(uid, col).sort((a, b) => when(b) - when(a));
  const snap = await F.getDocs(F.collection(db, "users", uid, col));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => when(b) - when(a));
}
export async function add(uid, col, obj) {
  if (demo) {
    const all = ls(uid, col);
    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
    all.push({ ...obj, id });
    localStorage.setItem(key(uid, col), JSON.stringify(all));
    return id;
  }
  return (await F.addDoc(F.collection(db, "users", uid, col), obj)).id;
}
export async function remove(uid, col, id) {
  if (demo) {
    localStorage.setItem(key(uid, col), JSON.stringify(ls(uid, col).filter((x) => x.id !== id)));
    return;
  }
  await F.deleteDoc(F.doc(db, "users", uid, col, id));
}
export async function update(uid, col, id, patch) {
  if (demo) {
    localStorage.setItem(key(uid, col), JSON.stringify(ls(uid, col).map((x) => (x.id === id ? { ...x, ...patch } : x))));
    return;
  }
  await F.updateDoc(F.doc(db, "users", uid, col, id), patch);
}

// Elimina tutti i dati dell'utente e poi l'account (richiesto da Google Play)
export async function deleteAccount(uid) {
  const cols = ["entries", "results", "wods", "schede"];
  if (demo) {
    cols.forEach((c) => localStorage.removeItem(key(uid, c)));
    localStorage.removeItem("ibd_demo_user");
    return;
  }
  const u = auth.currentUser;
  // se l'accesso non è recente Firebase rifiuta: meglio saperlo PRIMA di cancellare i dati
  const last = Date.parse(u.metadata && u.metadata.lastSignInTime) || 0;
  if (Date.now() - last > 4 * 60 * 1000) { const e = new Error("login recente richiesto"); e.code = "auth/requires-recent-login"; throw e; }
  for (const c of cols) {
    const snap = await F.getDocs(F.collection(db, "users", uid, c));
    await Promise.all(snap.docs.map((d) => F.deleteDoc(d.ref)));
  }
  await A.deleteUser(u);
}
