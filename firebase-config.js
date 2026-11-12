// ============================================================
//  CONFIGURAZIONE FIREBASE
//  1. Console Firebase -> Impostazioni progetto -> Le tue app -> Web (</>)
//  2. Copia qui i valori di firebaseConfig
//  Finché apiKey è "INSERISCI_..." l'app parte in MODALITÀ DEMO
//  (dati salvati solo nel browser, nessun login reale).
// ============================================================
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBgI_PBn3s3uLyYuW790XJJZKITxpA8BKs",
  authDomain: "ibd-training-c4a45.firebaseapp.com",
  projectId: "ibd-training-c4a45",
  storageBucket: "ibd-training-c4a45.firebasestorage.app",
  messagingSenderId: "485210446677",
  appId: "1:485210446677:web:5d67b1e352d97fd143eddc",
  measurementId: "G-GSGNEHTVYD"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);