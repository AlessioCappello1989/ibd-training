// Configurazione Firebase del progetto "ibd-training-c4a45".
// Le chiavi web di Firebase non sono segrete: la sicurezza dei dati è data dalle regole Firestore.
export const firebaseConfig = {
  apiKey: "AIzaSyBgI_PBn3s3uLyYuW790XJJZKITxpA8BKs",
  authDomain: "ibd-training-c4a45.firebaseapp.com",
  projectId: "ibd-training-c4a45",
  storageBucket: "ibd-training-c4a45.firebasestorage.app",
  messagingSenderId: "485210446677",
  appId: "1:485210446677:web:5d67b1e352d97fd143eddc",
  measurementId: "G-GSGNEHTVYD"
};

export const isConfigured = !String(firebaseConfig.apiKey).startsWith("INSERISCI");
