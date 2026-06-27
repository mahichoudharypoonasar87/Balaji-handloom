/**
 * profile.js
 * User Profile, Wishlist, Order History
 * Shree Panchmukhi Balaji Handloom
 */

import { auth, db, storage } from "./firebase.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { onAuthChange, getUserProfile, logout } from "./auth.js";
import {
  showToast,
  formatPrice,
  formatDate,
  statusColor,
  compressImage,
  initDarkMode,
  initStickyHeader,
} from "./utils.js";
import { renderProductCard, bindProductCardEvents, getProductById } from "./products.js";

// ─── WISHLIST FUNCTIONS ───────────────────────────────────────────────────────
export async function addToWishlist(productId) {
  const user = auth.currentUser;
  if (!user) {
    showToast("Please login to add to wishlist", "error");
    return;
  }
  await setDoc(
    doc(db, "wishlist", user.uid, "items", productId),
    { productId, addedAt: new Date() }
  );
  showToast("Added to wishlist ♥");
}

export async function removeFromWishlist(productId) {
  const user = auth.currentUser;
  if (!user) return;
  await deleteDoc(doc(db, "wishlist", user.uid, "items", productId));
  showToast("Removed from wishlist");
}

export async function isWishlisted(productId) {
  const user = auth.currentUser;
  if (!user) return false;
  const snap = await getDoc(doc(db, "wishlist", user.uid, "items", productId));
  return snap.exists();
}

export async function getWishlistItems() {
  const user = auth.currentUser;
  if (!user) return [];
  const snap = await getDocs(collection(db, "wishlist", user.uid, "items"));
  return snap.docs.map((d) => d.data().productId);
}

// ─── INIT PROFILE PAGE ───────────────────────────────────────────────────────
export function initProfilePage() {
  initDarkMode();
  initStickyHeader();

  onAuthChange(async (user) => {
    if (!user) {
      window.location.href = "login.html?redirect=profile.html";
      return;
    }

    const profile = await getUserProfile(user.uid);
    if (!profile) return;

    renderProfileHeader(user, profile);
    initProfileForm(user, profile);
    initAvatarUpload(user);
    initPasswordChange(user);
    loadOrderHistory(user.uid);
    loadWishlist(user.uid);
    initLogout();
    initTabs();

    // Hash-based tab switch
    if (window.location.hash === "#wishlist") {
      document.querySelector('[data-tab="wishlist"]')?.click();
    } else if (window.location.hash === "#orders") {
      document.querySelector('[data-tab="orders"]')?.click();
    }
  });
}

// ─── RENDER PROFILE HEADER ───────────────────────────────────────────────────
function renderProfileHeader(user, profile) {
  const avatarEl = document.getElementById("profile-avatar");
  const nameEl = document.getElementById("profile-name");
  const emailEl = document.getElementById("profile-email");
  const joinEl = document.getElementById("profile-joined");

  if (avatarEl) {
    avatarEl.src = profile.photoURL || user.photoURL || "assets/images/avatar-default.webp";
    avatarEl.alt = profile.name || user.displayName || "User avatar";
  }
  if (nameEl) nameEl.textContent = profile.name || user.displayName || "User";
  if (emailEl) emailEl.textContent = user.email;
  if (joinEl && profile.createdAt) {
    joinEl.textContent = `Member since ${formatDate(profile.createdAt)}`;
  }

  // Show Admin Panel link if this user is an admin
  const adminLinkWrap = document.getElementById("profile-admin-link-wrap");
  if (adminLinkWrap) {
    adminLinkWrap.style.display = profile.isAdmin ? "block" : "none";
  }
}

// ─── PROFILE FORM ────────────────────────────────────────────────────────────
function initProfileForm(user, profile) {
  const form = document.getElementById("profile-form");
  if (!form) return;

  // Pre-fill
  const fields = ["name", "phone", "address", "city", "state", "pincode"];
  fields.forEach((f) => {
    const el = form.querySelector(`#profile-${f}`);
    if (el) el.value = profile[f] || "";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Saving…";

    try {
      const data = {};
      fields.forEach((f) => {
        const el = form.querySelector(`#profile-${f}`);
        if (el) data[f] = el.value.trim();
      });

      await setDoc(doc(db, "users", user.uid), data, { merge: true });
      await updateProfile(user, { displayName: data.name });

      showToast("Profile updated successfully ✓");
    } catch (err) {
      console.error("Profile update error:", err);
      showToast("Failed to update profile", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Save Changes";
    }
  });
}

// ─── AVATAR UPLOAD ───────────────────────────────────────────────────────────
function initAvatarUpload(user) {
  const input = document.getElementById("avatar-input");
  const avatarEl = document.getElementById("profile-avatar");
  if (!input || !avatarEl) return;

  input.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      showToast("Uploading photo…", "info");
      const blob = await compressImage(file);
      const storageRef = ref(storage, `users/${user.uid}/avatar.webp`);
      await uploadBytes(storageRef, blob, { contentType: "image/webp" });
      const url = await getDownloadURL(storageRef);

      await updateProfile(user, { photoURL: url });
      await setDoc(doc(db, "users", user.uid), { photoURL: url }, { merge: true });

      avatarEl.src = url;
      showToast("Profile photo updated ✓");
    } catch (err) {
      console.error("Avatar upload error:", err);
      showToast(err.message || "Photo upload failed", "error");
    }
  });

  // Click avatar to trigger upload
  document.getElementById("avatar-edit-btn")?.addEventListener("click", () => {
    input.click();
  });
}

// ─── PASSWORD CHANGE ─────────────────────────────────────────────────────────
function initPasswordChange(user) {
  const form = document.getElementById("password-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    const current = document.getElementById("current-password").value;
    const newPass = document.getElementById("new-password").value;
    const confirm = document.getElementById("confirm-new-password").value;

    if (newPass !== confirm) {
      showToast("New passwords do not match", "error");
      return;
    }
    if (newPass.length < 6) {
      showToast("Password must be at least 6 characters", "error");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Updating…";

    try {
      const credential = EmailAuthProvider.credential(user.email, current);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPass);
      showToast("Password updated successfully ✓");
      form.reset();
    } catch (err) {
      showToast(
        err.code === "auth/wrong-password"
          ? "Current password is incorrect"
          : "Failed to update password",
        "error"
      );
    } finally {
      btn.disabled = false;
      btn.textContent = "Update Password";
    }
  });
}

// ─── ORDER HISTORY ───────────────────────────────────────────────────────────
function loadOrderHistory(uid) {
  const container = document.getElementById("order-history");
  if (!container) return;

  container.innerHTML = `<div style="display:flex;justify-content:center;padding:var(--space-8);"><div class="spinner"></div></div>`;

  const q = query(
    collection(db, "orders"),
    where("userId", "==", uid),
    orderBy("createdAt", "desc")
  );

  onSnapshot(q, (snap) => {
    if (snap.empty) {
      container.innerHTML = `
        <div style="text-align:center; padding:var(--space-12); color:var(--clr-text-muted);">
          <p style="font-size:3rem; margin-bottom:var(--space-4);">📦</p>
          <p style="font-size:var(--text-lg); font-weight:600; margin-bottom:var(--space-2);">No orders yet</p>
          <p>Your order history will appear here.</p>
          <a href="index.html" class="btn btn--primary btn--md" style="margin-top:var(--space-6);">Start Shopping</a>
        </div>
      `;
      return;
    }

    container.innerHTML = snap.docs.map((d) => renderOrderCard({ id: d.id, ...d.data() })).join("");
  });
}

function renderOrderCard(order) {
  const color = statusColor(order.status);
  const itemsPreview = (order.items || [])
    .slice(0, 2)
    .map((i) => `${i.name} × ${i.qty}`)
    .join(", ");
  const moreCount = (order.items?.length || 0) - 2;

  return `
    <article class="glass-card" style="padding:var(--space-5); margin-bottom:var(--space-4);" aria-label="Order ${order.orderId}">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:var(--space-3); margin-bottom:var(--space-4);">
        <div>
          <p style="font-size:var(--text-xs); color:var(--clr-text-muted); margin-bottom:var(--space-1);">ORDER ID</p>
          <p style="font-weight:700; font-family:var(--font-display); font-size:var(--text-lg);">${order.orderId}</p>
          <p style="font-size:var(--text-xs); color:var(--clr-text-muted); margin-top:var(--space-1);">${formatDate(order.createdAt)}</p>
        </div>
        <span style="
          background: ${color}20;
          color: ${color};
          padding: var(--space-1) var(--space-4);
          border-radius: var(--radius-full);
          font-size: var(--text-xs);
          font-weight: 700;
          border: 1px solid ${color}40;
          letter-spacing: 0.05em;
        ">${order.status}</span>
      </div>

      <p style="font-size:var(--text-sm); color:var(--clr-text-2); margin-bottom:var(--space-2);">
        ${itemsPreview}${moreCount > 0 ? ` +${moreCount} more` : ""}
      </p>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:var(--space-4);">
        <p style="font-family:var(--font-display); font-size:var(--text-xl); font-weight:700; color:var(--clr-primary);">
          ${formatPrice(order.total)}
        </p>
        <a href="orders.html?order=${order.orderId}" class="btn btn--outline btn--sm">
          Track Order →
        </a>
      </div>
    </article>
  `;
}

// ─── WISHLIST ────────────────────────────────────────────────────────────────
async function loadWishlist(uid) {
  const container = document.getElementById("wishlist-grid");
  if (!container) return;

  container.innerHTML = `<div style="display:flex;justify-content:center;padding:var(--space-8);"><div class="spinner"></div></div>`;

  try {
    const snap = await getDocs(collection(db, "wishlist", uid, "items"));

    if (snap.empty) {
      container.innerHTML = `
        <div style="text-align:center; padding:var(--space-12); color:var(--clr-text-muted); grid-column:1/-1;">
          <p style="font-size:3rem; margin-bottom:var(--space-4);">♡</p>
          <p style="font-size:var(--text-lg); font-weight:600; margin-bottom:var(--space-2);">Wishlist is empty</p>
          <p>Save products you love and find them here.</p>
          <a href="index.html" class="btn btn--primary btn--md" style="margin-top:var(--space-6);">Explore Products</a>
        </div>
      `;
      return;
    }

    const productIds = snap.docs.map((d) => d.data().productId);

    // Fetch products
    const products = await Promise.all(
      productIds.map((id) => getProductById(id).catch(() => null))
    );

    const valid = products.filter(Boolean);

    if (!valid.length) {
      container.innerHTML = `<p class="empty-state" style="grid-column:1/-1;">No products found.</p>`;
      return;
    }

    container.innerHTML = valid.map(renderProductCard).join("");
    bindProductCardEvents(container);
  } catch (err) {
    console.error("Wishlist load error:", err);
    container.innerHTML = `<p class="error-state" style="grid-column:1/-1;">Failed to load wishlist.</p>`;
  }
}

// ─── LOGOUT ──────────────────────────────────────────────────────────────────
function initLogout() {
  document.getElementById("profile-logout-btn")?.addEventListener("click", async () => {
    await logout();
    window.location.href = "index.html";
  });
}

// ─── PROFILE TABS ────────────────────────────────────────────────────────────
function initTabs() {
  const tabBtns = document.querySelectorAll(".profile-tab-btn");
  const tabPanels = document.querySelectorAll(".profile-tab-panel");

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;

      tabBtns.forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      tabPanels.forEach((p) => p.classList.remove("active"));

      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      document.getElementById(`profile-panel-${target}`)?.classList.add("active");

      window.history.replaceState(null, "", `#${target}`);
    });
  });
}
