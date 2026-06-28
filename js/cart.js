/**
 * cart.js
 * Cart Logic — Firestore + LocalStorage fallback
 * Shree Panchmukhi Balaji Handloom
 */

import { auth, db } from "./firebase.js";
import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  getDoc,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { showToast, formatPrice, calcDiscount, updateCartBadge, productImageHtml } from "./utils.js";

let unsubCart = null;

// ─── WAIT FOR AUTH TO BE READY ───────────────────────────────────────────────
// Firebase restores the logged-in session asynchronously on page load.
// auth.currentUser is null until that finishes, even for a logged-in user.
// Without this wait, clicking "Add to Cart" right after a page load can
// wrongly think the user isn't logged in and bounce them to the login page.
async function getCurrentUser() {
  await auth.authStateReady();
  return auth.currentUser;
}

// ─── CART REF ────────────────────────────────────────────────────────────────
function cartRef(uid, productKey) {
  const base = collection(db, "cart", uid, "items");
  return productKey ? doc(base, productKey) : base;
}

// ─── ADD TO CART ─────────────────────────────────────────────────────────────
export async function addToCart(product, size = "", qty = 1) {
  const user = await getCurrentUser();
  if (!user) {
    showToast("Please login to add items to cart", "error");
    setTimeout(() => (window.location.href = "login.html?redirect=index.html"), 1200);
    return;
  }

  const key = `${product.id}_${size || "free"}`;
  const ref = doc(db, "cart", user.uid, "items", key);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const existing = snap.data();
    await setDoc(ref, { ...existing, qty: existing.qty + qty });
  } else {
    await setDoc(ref, {
      productId: product.id,
      name: product.name,
      price: product.price,
      mrp: product.mrp,
      image: product.images?.[0] || "",
      size: size,
      qty: qty,
      addedAt: new Date(),
    });
  }
  showToast(`"${product.name}" added to cart 🛒`);
}

// ─── REMOVE FROM CART ────────────────────────────────────────────────────────
export async function removeFromCart(key) {
  const user = await getCurrentUser();
  if (!user) return;
  await deleteDoc(doc(db, "cart", user.uid, "items", key));
  showToast("Item removed from cart");
}

// ─── UPDATE QUANTITY ─────────────────────────────────────────────────────────
export async function updateCartQty(key, qty) {
  const user = await getCurrentUser();
  if (!user) return;
  if (qty < 1) {
    return removeFromCart(key);
  }
  const ref = doc(db, "cart", user.uid, "items", key);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await setDoc(ref, { ...snap.data(), qty });
  }
}

// ─── GET CART ITEMS (one-time) ───────────────────────────────────────────────
export async function getCartItems() {
  const user = await getCurrentUser();
  if (!user) return [];
  const snap = await getDocs(cartRef(user.uid));
  return snap.docs.map((d) => ({ key: d.id, ...d.data() }));
}

// ─── CLEAR ENTIRE CART ───────────────────────────────────────────────────────
export async function clearCart() {
  const user = await getCurrentUser();
  if (!user) return;
  const items = await getCartItems();
  const deletes = items.map((item) =>
    deleteDoc(doc(db, "cart", user.uid, "items", item.key))
  );
  await Promise.all(deletes);
}

// ─── LISTEN CART (realtime) ───────────────────────────────────────────────────
export function listenCart(callback) {
  if (unsubCart) unsubCart();
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      callback([]);
      return;
    }
    unsubCart = onSnapshot(cartRef(user.uid), (snap) => {
      const items = snap.docs.map((d) => ({ key: d.id, ...d.data() }));
      callback(items);
      updateCartBadge(items.length);
    });
  });
}

// ─── CART TOTAL ──────────────────────────────────────────────────────────────
export function calcCartTotal(items) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const mrpTotal = items.reduce((sum, item) => sum + item.mrp * item.qty, 0);
  const saved = mrpTotal - subtotal;
  return { subtotal, mrpTotal, saved };
}

// ─── RENDER CART PAGE ────────────────────────────────────────────────────────
export function initCartPage() {
  const container = document.getElementById("cart-items");
  const emptyState = document.getElementById("cart-empty");
  const summaryEl = document.getElementById("cart-summary");
  const checkoutBtn = document.getElementById("checkout-btn");

  if (!container) return;

  listenCart((items) => {
    if (items.length === 0) {
      container.innerHTML = "";
      if (emptyState) emptyState.style.display = "flex";
      if (summaryEl) summaryEl.style.display = "none";
      return;
    }

    if (emptyState) emptyState.style.display = "none";
    if (summaryEl) summaryEl.style.display = "block";

    container.innerHTML = items.map((item) => renderCartItem(item)).join("");

    // Bind events
    container.querySelectorAll(".cart-item__dec").forEach((btn) => {
      btn.addEventListener("click", () =>
        updateCartQty(btn.dataset.key, parseInt(btn.dataset.qty) - 1)
      );
    });
    container.querySelectorAll(".cart-item__inc").forEach((btn) => {
      btn.addEventListener("click", () =>
        updateCartQty(btn.dataset.key, parseInt(btn.dataset.qty) + 1)
      );
    });
    container.querySelectorAll(".cart-item__remove").forEach((btn) => {
      btn.addEventListener("click", () => removeFromCart(btn.dataset.key));
    });

    // Summary
    const { subtotal, mrpTotal, saved } = calcCartTotal(items);
    document.getElementById("cart-subtotal").textContent = formatPrice(subtotal);
    document.getElementById("cart-mrp").textContent = formatPrice(mrpTotal);
    document.getElementById("cart-saved").textContent = formatPrice(saved);
    document.getElementById("cart-total").textContent = formatPrice(subtotal);

    if (checkoutBtn) {
      checkoutBtn.onclick = () => {
        window.location.href = "cart.html#checkout";
      };
    }
  });
}

// ─── RENDER SINGLE CART ITEM ─────────────────────────────────────────────────
function renderCartItem(item) {
  const discount = calcDiscount(item.mrp, item.price);
  return `
    <article class="cart-item glass-card reveal" aria-label="${item.name}">
      <div class="cart-item__img-wrap">
        ${productImageHtml(item.image || "", item.name, "cart-item__img")}
        ${discount > 0 ? `<span class="discount-badge">${discount}% OFF</span>` : ""}
      </div>
      <div class="cart-item__info">
        <h3 class="cart-item__name">${item.name}</h3>
        ${item.size ? `<p class="cart-item__size">Size: <strong>${item.size}</strong></p>` : ""}
        <div class="cart-item__pricing">
          <span class="cart-item__price">${formatPrice(item.price)}</span>
          ${item.mrp > item.price ? `<span class="cart-item__mrp">${formatPrice(item.mrp)}</span>` : ""}
        </div>
        <div class="cart-item__controls">
          <button
            class="qty-btn cart-item__dec"
            data-key="${item.key}"
            data-qty="${item.qty}"
            aria-label="Decrease quantity"
          >−</button>
          <span class="qty-display" aria-live="polite">${item.qty}</span>
          <button
            class="qty-btn cart-item__inc"
            data-key="${item.key}"
            data-qty="${item.qty}"
            aria-label="Increase quantity"
          >+</button>
          <button
            class="cart-item__remove"
            data-key="${item.key}"
            aria-label="Remove from cart"
          >🗑</button>
        </div>
        <p class="cart-item__subtotal">
          Item Total: <strong>${formatPrice(item.price * item.qty)}</strong>
        </p>
      </div>
    </article>
  `;
}
