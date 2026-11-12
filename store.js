// Livello dati: Firebase (Auth + Firestore) con fallback demo su localStorage.
import { firebaseConfig, isConfigured } from "./firebase-config.js";

const V = "10.14.1";
const CDN = (m) => `https://www.gstatic.com/firebasejs/${V}/firebase-${m}.js`;

let fb = null; // moduli firebase
let auth, db;
export const demo = !isConfigured;

export async function init(onUser) {
  if (demo) {
    const u = localStorage.getItem("ibd_demo_user");
    onUser(u ? JSON.parse(u) : null);
    return;
  }
  const [{ initializeApp }, A, F] = await Promise.all([
    import(CDN("app")), import(CDN("auth")), import(CDN("firestore"))
  ]);
  fb = { A, F };
  const app = initializeApp(firebaseConfig);
  auth = A.getAuth(app);
  db = F.getFirestore(app);
  A.onAuthStateChanged(auth, (u) => onUser(u ? { uid: u.uid, email: u.email, name: u.displayName } : null));
}

export const authApi = {
  async signIn(email, pw) { return fb.A.signInWithEmailAndPassword(auth, email, pw); },
  async signUp(email, pw) { return fb.A.createUserWithEmailAndPassword(auth, email, pw); },
  async google() { return fb.A.signInWithPopup(auth, new fb.A.GoogleAuthProvider()); },
  async reset(email) { return fb.A.sendPasswordResetEmail(auth, email); },
  async out() { if (demo) { localStorage.removeItem("ibd_demo_user"); location.reload(); } else await fb.A.signOut(auth); },
  demoLogin() { localStorage.setItem("ibd_demo_user", JSON.stringify({ uid: "demo", email: "demo@locale", name: "Atleta" })); location.reload(); }
};

// ---- Allenamenti: users/{uid}/workouts/{id}
const lsKey = (uid) => `ibd_workouts_${uid}`;
const lsRead = (uid) => JSON.parse(localStorage.getItem(lsKey(uid)) || "[]");

export async function listWorkouts(uid) {
  if (demo) return lsRead(uid).sort((a, b) => b.date - a.date);
  const { collection, query, orderBy, getDocs } = fb.F;
  const q = query(collection(db, "users", uid, "workouts"), orderBy("date", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addWorkout(uid, w) {
  if (demo) {
    const all = lsRead(uid);
    all.push({ ...w, id: crypto.randomUUID() });
    localStorage.setItem(lsKey(uid), JSON.stringify(all));
    return;
  }
  const { collection, addDoc } = fb.F;
  await addDoc(collection(db, "users", uid, "workouts"), w);
}

export async function deleteWorkout(uid, id) {
  if (demo) {
    localStorage.setItem(lsKey(uid), JSON.stringify(lsRead(uid).filter((x) => x.id !== id)));
    return;
  }
  const { doc, deleteDoc } = fb.F;
  await deleteDoc(doc(db, "users", uid, "workouts", id));
}
