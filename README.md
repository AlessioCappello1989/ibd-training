# IBD Training 🏋️

Web app di allenamento in stile palestra/CrossFit: **timer** (AMRAP, EMOM, Tabata, For Time, Riposo), **progressi** (grafici e record personali), **storico** allenamenti. Login con **email/password** o **Google**. Dati su **Firebase** (Firestore), codice su **GitHub**, hosting gratuito su **GitHub Pages**.

Nessuna build: HTML + CSS + JavaScript puro.

## Struttura

```
index.html            interfaccia
css/style.css         stile
js/app.js             logica UI
js/timer.js           motore timer
js/store.js           Firebase Auth + Firestore (con modalità demo)
js/firebase-config.js <-- QUI vanno le tue chiavi Firebase
firestore.rules       regole di sicurezza
.github/workflows/    deploy automatico su GitHub Pages
```

## Setup (circa 10 minuti)

### 1. Firebase
1. Vai su https://console.firebase.google.com → **Aggiungi progetto**.
2. **Build → Authentication → Inizia** → abilita **Email/Password** e **Google**.
3. **Build → Firestore Database → Crea database** (modalità produzione).
4. Scheda **Regole** di Firestore: incolla il contenuto di `firestore.rules` e pubblica.
5. **Impostazioni progetto (⚙️) → Le tue app → Web (`</>`)** → registra l'app e copia `firebaseConfig`.
6. Incolla i valori in `js/firebase-config.js`.

> La `apiKey` di Firebase per il web non è un segreto: la sicurezza è garantita dalle regole Firestore e dai domini autorizzati.

### 2. GitHub
```bash
cd ibd
git init
git add .
git commit -m "IBD Training"
git branch -M main
git remote add origin https://github.com/TUO-UTENTE/ibd-training.git
git push -u origin main
```
Poi su GitHub: **Settings → Pages → Source: GitHub Actions**. Ad ogni push su `main` l'app viene pubblicata su `https://TUO-UTENTE.github.io/ibd-training/`.

### 3. Dominio autorizzato (necessario per Google/Email)
Firebase → **Authentication → Impostazioni → Domini autorizzati** → aggiungi `TUO-UTENTE.github.io`.

## Provarla in locale
```bash
python3 -m http.server 8000
```
Apri http://localhost:8000 (`localhost` è già autorizzato da Firebase).
Finché `firebase-config.js` ha i valori `INSERISCI_...` l'app parte in **modalità demo** (dati solo nel browser).

## Alternativa: hosting Firebase
```bash
npm i -g firebase-tools
firebase login && firebase init   # scegli Hosting + Firestore, usa i file esistenti
firebase deploy
```

## Struttura dati
`users/{uid}/workouts/{id}` → `{ title, type, date, duration, score, notes, exercises:[{name, weight, reps, sets}] }`

## Idee future
Modelli di allenamento personalizzati, calcolatore % del massimale, foto progressi, classifica con amici.
