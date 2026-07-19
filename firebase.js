// firebase.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAJTrZloIfb9YXvUUOQ-ly81mBDeNsGvEw",
  authDomain: "secretchat-1d39e.firebaseapp.com",
  projectId: "secretchat-1d39e",
  storageBucket: "secretchat-1d39e.firebasestorage.app",
  messagingSenderId: "94883694774",
  appId: "1:94883694774:web:c7aa249407bd3322b7be17"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

export {
  db, auth, storage,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  updateProfile, onAuthStateChanged, signOut,
  ref, uploadBytes, getDownloadURL
};
