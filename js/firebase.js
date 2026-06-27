/**
 * firebase.js
 * Firebase Configuration & Initialization
 * Shree Panchmukhi Balaji Handloom
 *
 * Replace the firebaseConfig values with your own
 * from Firebase Console → Project Settings → Your Apps
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// ─── YOUR FIREBASE CONFIG ────────────────────────────────────────────────────
// Replace ALL values below with your own Firebase project config
const firebaseConfig = {
  apiKey: "AIzaSyAM_SxBGcVqCKzOQdBG-YhoyekprKkvvd0",
  authDomain: "balaji-handloom.firebaseapp.com",
  projectId: "balaji-handloom",
  storageBucket: "balaji-handloom.firebasestorage.app",
  messagingSenderId: "316797473264",
  appId: "1:316797473264:web:d62ac0ff83dcd17b900d35"
};
// ─────────────────────────────────────────────────────────────────────────────

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Firebase Services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Google Auth settings
googleProvider.setCustomParameters({ prompt: "select_account" });

export default app;
