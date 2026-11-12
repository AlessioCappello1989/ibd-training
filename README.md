# IBD Training

Web app di allenamento (Allena · WOD · Progressi · Storico) con timer, massimali, 1RM stimato e storico.
Login con email o Google. Dati su Firebase, codice su GitHub Pages. Nessuna build.

## File (tutti nella stessa cartella)
index.html · app.js · store.js · timer.js · firebase-config.js · sw.js · manifest.json · logo.png · firestore.rules

## Setup
1. Firebase → Authentication → Metodo di accesso: attiva **Email/Password** e **Google**.
2. Firebase → Firestore Database → Crea database → scheda **Regole**: incolla `firestore.rules` e Pubblica.
3. Firebase → Authentication → Impostazioni → **Domini autorizzati**: aggiungi `TUOUTENTE.github.io`.
4. Firebase → ⚙️ Impostazioni progetto → Le tue app → Web `</>`: copia `firebaseConfig` dentro `firebase-config.js`.
5. GitHub → Settings → Pages → Deploy from a branch → `main` / root.

Finché `firebase-config.js` contiene `INSERISCI_...` l'app parte in modalità demo (dati solo sul telefono).
