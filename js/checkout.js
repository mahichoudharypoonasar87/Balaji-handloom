/**
 * checkout.js
 * WhatsApp Order + Firestore Order Saving
 * Shree Panchmukhi Balaji Handloom
 */

import { auth, db } from "./firebase.js";
import {
  doc,
  setDoc,
  serverTimestamp,
  collection,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getCartItems, clearCart, calcCartTotal } from "./cart.js";
import { getUserProfile } from "./auth.js";
import { showToast, generateOrderId, formatPrice } from "./utils.js";

// ─── SHOP CONFIG ─────────────────────────────────────────────────────────────
// 🔴 Replace with your actual WhatsApp number (country code without +)
const SHOP_WHATSAPP = "919799000000";
const SHOP_NAME = "Shree Panchmukhi Balaji Handloom";
const SHOP_ADDRESS = "Panchori Road, Poonasar, Rajasthan - 342312";

// ─── INIT CHECKOUT SECTION ───────────────────────────────────────────────────
export function initCheckout() {
  const checkoutSection = document.getElementById("checkout-section");
  const form = document.getElementById("checkout-form");
  if (!checkoutSection || !form) return;

  // Pre-fill form from user profile
  const user = auth.currentUser;
  if (user) {
    getUserProfile(user.uid).then((profile) => {
      if (!profile) return;
      form.querySelector("#co-name").value = profile.name || user.displayName || "";
      form.querySelector("#co-phone").value = profile.phone || "";
      form.querySelector("#co-address").value = profile.address || "";
      form.querySelector("#co-city").value = profile.city || "";
      form.querySelector("#co-state").value = profile.state || "Rajasthan";
      form.querySelector("#co-pincode").value = profile.pincode || "";
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await placeOrder(form);
  });
}

// ─── PLACE ORDER ─────────────────────────────────────────────────────────────
async function placeOrder(form) {
  const user = auth.currentUser;
  if (!user) {
    showToast("Please login to place order", "error");
    window.location.href = "login.html?redirect=cart.html";
    return;
  }

  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Placing Order…";

  try {
    const items = await getCartItems();
    if (items.length === 0) {
      showToast("Your cart is empty", "error");
      btn.disabled = false;
      btn.textContent = "Place Order via WhatsApp";
      return;
    }

    const name = form.querySelector("#co-name").value.trim();
    const phone = form.querySelector("#co-phone").value.trim();
    const address = form.querySelector("#co-address").value.trim();
    const city = form.querySelector("#co-city").value.trim();
    const state = form.querySelector("#co-state").value.trim();
    const pincode = form.querySelector("#co-pincode").value.trim();

    const fullAddress = `${address}, ${city}, ${state} - ${pincode}`;
    const { subtotal } = calcCartTotal(items);
    const orderId = generateOrderId();

    // ── Save to Firestore ──
    await setDoc(doc(db, "orders", orderId), {
      orderId,
      userId: user.uid,
      userName: name,
      userEmail: user.email,
      userPhone: phone,
      userAddress: fullAddress,
      items: items.map((i) => ({
        productId: i.productId,
        name: i.name,
        price: i.price,
        qty: i.qty,
        size: i.size || "",
        image: i.image || "",
      })),
      total: subtotal,
      status: "Pending",
      createdAt: serverTimestamp(),
    });

    // ── Build WhatsApp Message ──
    const waMessage = buildWhatsAppMessage({
      orderId,
      name,
      phone,
      fullAddress,
      items,
      subtotal,
    });

    // ── Clear Cart ──
    await clearCart();

    showToast("Order placed! Redirecting to WhatsApp… 🎉");

    setTimeout(() => {
      const url = `https://wa.me/${SHOP_WHATSAPP}?text=${encodeURIComponent(waMessage)}`;
      window.open(url, "_blank");
      window.location.href = `orders.html?order=${orderId}`;
    }, 1500);
  } catch (err) {
    console.error("Checkout error:", err);
    showToast("Failed to place order. Please try again.", "error");
    btn.disabled = false;
    btn.textContent = "Place Order via WhatsApp";
  }
}

// ─── BUILD WHATSAPP MESSAGE ───────────────────────────────────────────────────
function buildWhatsAppMessage({ orderId, name, phone, fullAddress, items, subtotal }) {
  const itemLines = items
    .map(
      (item, i) =>
        `${i + 1}. ${item.name}${item.size ? ` (${item.size})` : ""} × ${item.qty} = ${formatPrice(item.price * item.qty)}`
    )
    .join("\n");

  return `
🛕 *${SHOP_NAME}*
📍 ${SHOP_ADDRESS}

━━━━━━━━━━━━━━━━━━━
🛍️ *NEW ORDER RECEIVED*
━━━━━━━━━━━━━━━━━━━

📋 *Order ID:* ${orderId}

👤 *Customer Details:*
• Name: ${name}
• Mobile: ${phone}
• Address: ${fullAddress}

🧾 *Order Items:*
${itemLines}

━━━━━━━━━━━━━━━━━━━
💰 *Grand Total: ${formatPrice(subtotal)}*
━━━━━━━━━━━━━━━━━━━

_Thank you for shopping with us!_
_Please confirm this order at the earliest._
`.trim();
}
