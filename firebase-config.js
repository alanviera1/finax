import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  initializeFirestore,
  limit,
  onSnapshot,
  orderBy,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

// Reemplaza estos valores con la configuración de tu proyecto en Firebase.
const firebaseConfig = {
  apiKey: "AIzaSyAJ5qOz3EXlQb-PX4qt5n2NuwrBpO48QFA",
  authDomain: "finax-38f0e.firebaseapp.com",
  projectId: "finax-38f0e",
  storageBucket: "finax-38f0e.firebasestorage.app",
  messagingSenderId: "724977375785",
  appId: "1:724977375785:web:c512fe2bb613b093331a38",
};

const app = initializeApp(firebaseConfig);

// IndexedDB persistente con soporte para varias pestañas.
// Firestore sincronizará los cambios locales al recuperar la conexión.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

export {
  Timestamp,
  collection,
  db,
  deleteDoc,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  where,
  writeBatch,
};
