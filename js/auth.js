/**
 * auth.js
 * Firebase Authentication Logic
 * Login / Signup / Google / Logout / Password Reset
 */

import { auth, db, googleProvider } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from "./utils.js";

// ─── AUTH STATE LISTENER ─────────────────────────────────────────────────────
/**
 * Listen to auth state and call callback with user or null
 * @param {Function} callback
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// ─── GET CURRENT USER ────────────────────────────────────────────────────────
export function currentUser() {
  return auth.currentUser;
}

// ─── SIGNUP WITH EMAIL ───────────────────────────────────────────────────────
export async function signupWithEmail(name, email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  await createUserDoc(cred.user, { name });
  return cred.user;
}

// ─── LOGIN WITH EMAIL ────────────────────────────────────────────────────────
export async function loginWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

// ─── GOOGLE LOGIN ────────────────────────────────────────────────────────────
export async function loginWithGoogle() {
  const cred = await signInWithPopup(auth, googleProvider);
  // Create doc only if first login
  const snap = await getDoc(doc(db, "users", cred.user.uid));
  if (!snap.exists()) {
    await createUserDoc(cred.user, {});
  }
  return cred.user;
}

// ─── LOGOUT ──────────────────────────────────────────────────────────────────
export async function logout() {
  await signOut(auth);
}

// ─── PASSWORD RESET ──────────────────────────────────────────────────────────
export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

// ─── CREATE USER DOCUMENT IN FIRESTORE ───────────────────────────────────────
async function createUserDoc(user, extra = {}) {
  const ref = doc(db, "users", user.uid);
  await setDoc(
    ref,
    {
      name: extra.name || user.displayName || "",
      email: user.email,
      phone: "",
      address: "",
      city: "",
      state: "Rajasthan",
      pincode: "",
      photoURL: user.photoURL || "",
      isAdmin: false,
      createdAt: serverTimestamp(),
      ...extra,
    },
    { merge: true }
  );
}

// ─── GET USER PROFILE FROM FIRESTORE ─────────────────────────────────────────
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ─── CHECK IF ADMIN ──────────────────────────────────────────────────────────
export async function isAdmin(uid) {
  const profile = await getUserProfile(uid);
  return profile?.isAdmin === true;
}

// ─── INIT LOGIN PAGE ─────────────────────────────────────────────────────────
export function initLoginPage() {
  const form = document.getElementById("login-form");
  const googleBtn = document.getElementById("google-login-btn");
  const forgotBtn = document.getElementById("forgot-btn");
  const togglePass = document.getElementById("toggle-password");
  const passInput = document.getElementById("password");

  // Redirect if already logged in
  onAuthChange((user) => {
    if (user) {
      const redirect = new URLSearchParams(window.location.search).get("redirect") || "index.html";
      window.location.href = redirect;
    }
  });

  // Toggle Password visibility
  if (togglePass && passInput) {
    togglePass.addEventListener("click", () => {
      passInput.type = passInput.type === "password" ? "text" : "password";
      togglePass.textContent = passInput.type === "password" ? "👁" : "🙈";
    });
  }

  // Email login
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector("button[type=submit]");
      const email = document.getElementById("email").value.trim();
      const password = passInput.value;

      btn.disabled = true;
      btn.textContent = "Signing in…";

      try {
        await loginWithEmail(email, password);
        showToast("Welcome back! 🎉");
      } catch (err) {
        showToast(friendlyError(err.code), "error");
        btn.disabled = false;
        btn.textContent = "Login";
      }
    });
  }

  // Google login
  if (googleBtn) {
    googleBtn.addEventListener("click", async () => {
      try {
        await loginWithGoogle();
        showToast("Logged in with Google! 🎉");
      } catch (err) {
        showToast(friendlyError(err.code), "error");
      }
    });
  }

  // Forgot password
  if (forgotBtn) {
    forgotBtn.addEventListener("click", async () => {
      const email = document.getElementById("email")?.value.trim();
      if (!email) {
        showToast("Enter your email first", "error");
        return;
      }
      try {
        await resetPassword(email);
        showToast("Password reset email sent! Check your inbox.");
      } catch (err) {
        showToast(friendlyError(err.code), "error");
      }
    });
  }
}

// ─── INIT SIGNUP PAGE ────────────────────────────────────────────────────────
export function initSignupPage() {
  const form = document.getElementById("signup-form");
  const googleBtn = document.getElementById("google-signup-btn");

  onAuthChange((user) => {
    if (user) window.location.href = "index.html";
  });

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector("button[type=submit]");
      const name = document.getElementById("name").value.trim();
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;
      const confirm = document.getElementById("confirm-password").value;

      if (password !== confirm) {
        showToast("Passwords do not match", "error");
        return;
      }
      if (password.length < 6) {
        showToast("Password must be at least 6 characters", "error");
        return;
      }

      btn.disabled = true;
      btn.textContent = "Creating Account…";

      try {
        await signupWithEmail(name, email, password);
        showToast("Account created! Welcome 🎉");
      } catch (err) {
        showToast(friendlyError(err.code), "error");
        btn.disabled = false;
        btn.textContent = "Create Account";
      }
    });
  }

  if (googleBtn) {
    googleBtn.addEventListener("click", async () => {
      try {
        await loginWithGoogle();
        showToast("Account created with Google! 🎉");
      } catch (err) {
        showToast(friendlyError(err.code), "error");
      }
    });
  }
}

// ─── FRIENDLY ERROR MESSAGES ─────────────────────────────────────────────────
function friendlyError(code) {
  const msgs = {
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Incorrect password. Try again.",
    "auth/email-already-in-use": "This email is already registered.",
    "auth/weak-password": "Password is too weak. Use 6+ characters.",
    "auth/invalid-email": "Invalid email address.",
    "auth/popup-closed-by-user": "Google sign-in was cancelled.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
  };
  return msgs[code] || "Something went wrong. Please try again.";
}

// ─── INIT NAV AUTH STATE ─────────────────────────────────────────────────────
/**
 * Update navigation based on auth state (called on all pages)
 */
export function initNavAuth() {
  onAuthChange(async (user) => {
    const loginLink = document.getElementById("nav-login");
    const profileLink = document.getElementById("nav-profile");
    const logoutBtn = document.getElementById("nav-logout");
    const adminLink = document.getElementById("nav-admin");

    if (user) {
      if (loginLink) loginLink.style.display = "none";
      if (profileLink) {
        profileLink.style.display = "flex";
        profileLink.querySelector(".nav__username") &&
          (profileLink.querySelector(".nav__username").textContent =
            user.displayName?.split(" ")[0] || "Profile");
      }
      if (logoutBtn) {
        logoutBtn.style.display = "flex";
        logoutBtn.addEventListener("click", async () => {
          await logout();
          window.location.href = "index.html";
        });
      }
      // Show admin link if admin
      if (adminLink) {
        const profile = await getUserProfile(user.uid);
        if (profile?.isAdmin) adminLink.style.display = "flex";
      }
    } else {
      if (loginLink) loginLink.style.display = "flex";
      if (profileLink) profileLink.style.display = "none";
      if (logoutBtn) logoutBtn.style.display = "none";
      if (adminLink) adminLink.style.display = "none";
    }
  });
}
