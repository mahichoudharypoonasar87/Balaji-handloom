/**
 * auth.js
 * Firebase Authentication Logic
 * Login / Signup / Google / Logout / Password Reset
 *
 * BUGS FIXED:
 * - logout listener was added multiple times on each auth state change
 * - initNavAuth now uses a single logout listener
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

// ─── CREATE USER DOCUMENT ────────────────────────────────────────────────────
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
      // NOTE: isAdmin is intentionally NOT set here. Firestore security
      // rules block any client write that includes the isAdmin key —
      // admin status can only be granted via the Firebase Console.
      createdAt: serverTimestamp(),
      ...extra,
    },
    { merge: true }
  );
}

// ─── GET USER PROFILE ────────────────────────────────────────────────────────
export async function getUserProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (err) {
    console.error("getUserProfile error:", err);
    return null;
  }
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

  // Redirect ONLY after Firebase has fully resolved the auth state (one-time check).
  // Using onAuthChange (persistent listener) caused a race condition:
  // Firebase would first emit null, then the cached user — triggering a redirect
  // even when the user was actively trying to log in or had just logged out.
  // authStateReady() resolves exactly once with the current persisted session.
  auth.authStateReady().then(() => {
    if (auth.currentUser) {
      const redirect = new URLSearchParams(window.location.search).get("redirect") || "index.html";
      window.location.href = redirect;
    }
  });

  if (togglePass && passInput) {
    togglePass.addEventListener("click", () => {
      passInput.type = passInput.type === "password" ? "text" : "password";
      togglePass.textContent = passInput.type === "password" ? "👁" : "🙈";
    });
  }

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

  if (forgotBtn) {
    forgotBtn.addEventListener("click", async () => {
      const email = document.getElementById("email")?.value.trim();
      if (!email) { showToast("Enter your email first", "error"); return; }
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

      if (password !== confirm) { showToast("Passwords do not match", "error"); return; }
      if (password.length < 6) { showToast("Password must be at least 6 characters", "error"); return; }

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
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/email-already-in-use": "This email is already registered.",
    "auth/weak-password": "Password is too weak. Use 6+ characters.",
    "auth/invalid-email": "Invalid email address.",
    "auth/popup-closed-by-user": "Google sign-in was cancelled.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
  };
  return msgs[code] || "Something went wrong. Please try again.";
}

// ─── INIT NAV AUTH ────────────────────────────────────────────────────────────
// BUG FIX: logout listener was being added multiple times — now attached once outside onAuthChange
export function initNavAuth() {
  // Attach logout listener ONCE — not inside onAuthChange
  const logoutBtn = document.getElementById("nav-logout");
  if (logoutBtn && !logoutBtn.dataset.listenerAttached) {
    logoutBtn.dataset.listenerAttached = "true";
    logoutBtn.addEventListener("click", async () => {
      try {
        await logout();
        window.location.href = "index.html";
      } catch (err) {
        showToast("Logout failed. Try again.", "error");
      }
    });
  }

  onAuthChange(async (user) => {
    const loginLink  = document.getElementById("nav-login");
    const profileLink = document.getElementById("nav-profile");
    const adminLink  = document.getElementById("nav-admin");
    // mobile nav links
    const mobileLoginLink   = document.getElementById("mobile-login-link");
    const mobileProfileLink = document.getElementById("mobile-profile-link");
    const mobileAdminLink   = document.getElementById("mobile-admin-link");

    if (user) {
      // Show profile, hide login
      if (loginLink)  loginLink.style.display  = "none";
      if (logoutBtn)  logoutBtn.style.display   = "flex";
      if (profileLink) {
        profileLink.style.display = "flex";
        const nameEl = profileLink.querySelector(".nav__username");
        if (nameEl) nameEl.textContent = user.displayName?.split(" ")[0] || "Profile";
      }

      // Mobile nav
      if (mobileLoginLink)   mobileLoginLink.style.display   = "none";
      if (mobileProfileLink) mobileProfileLink.style.display = "block";

      // Check admin — fetch fresh from Firestore
      try {
        const profile = await getUserProfile(user.uid);
        if (profile?.isAdmin === true) {
          if (adminLink)       adminLink.style.display       = "flex";
          if (mobileAdminLink) mobileAdminLink.style.display = "block";
        } else {
          if (adminLink)       adminLink.style.display       = "none";
          if (mobileAdminLink) mobileAdminLink.style.display = "none";
        }
      } catch (err) {
        console.warn("Could not fetch profile for admin check:", err);
      }

    } else {
      // Logged out state
      if (loginLink)   loginLink.style.display   = "flex";
      if (logoutBtn)   logoutBtn.style.display    = "none";
      if (profileLink) profileLink.style.display  = "none";
      if (adminLink)   adminLink.style.display    = "none";

      if (mobileLoginLink)   mobileLoginLink.style.display   = "block";
      if (mobileProfileLink) mobileProfileLink.style.display = "none";
      if (mobileAdminLink)   mobileAdminLink.style.display   = "none";
    }
  });
}
