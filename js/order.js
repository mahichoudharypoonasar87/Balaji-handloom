/**
 * order.js
 * Order Tracking — Realtime from Firestore
 * Shree Panchmukhi Balaji Handloom
 */

import { db } from "./firebase.js";
import {
  doc,
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthChange } from "./auth.js";
import {
  formatPrice,
  formatDate,
  statusColor,
  showToast,
  initDarkMode,
  initStickyHeader,
} from "./utils.js";

// ─── ORDER STATUS STEPS ───────────────────────────────────────────────────────
const STATUS_STEPS = ["Pending", "Confirmed", "Packed", "Shipped", "Delivered"];

// ─── INIT ORDERS PAGE ────────────────────────────────────────────────────────
export function initOrdersPage() {
  initDarkMode();
  initStickyHeader();

  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("order");

  onAuthChange((user) => {
    if (!user) {
      window.location.href = "login.html?redirect=orders.html";
      return;
    }

    if (orderId) {
      // Show specific order
      loadSingleOrder(orderId, user.uid);
    } else {
      // Show all orders
      loadAllOrders(user.uid);
    }
  });
}

// ─── LOAD SINGLE ORDER (realtime) ────────────────────────────────────────────
function loadSingleOrder(orderId, uid) {
  const container = document.getElementById("order-detail");
  const listView = document.getElementById("orders-list-view");
  if (!container) return;

  listView && (listView.style.display = "none");
  container.style.display = "block";
  container.innerHTML = `<div style="display:flex;justify-content:center;padding:var(--space-12);"><div class="spinner spinner--lg"></div></div>`;

  onSnapshot(doc(db, "orders", orderId), (snap) => {
    if (!snap.exists()) {
      container.innerHTML = `
        <div style="text-align:center; padding:var(--space-12);">
          <p style="font-size:3rem; margin-bottom:var(--space-4);">🔍</p>
          <h2 style="font-family:var(--font-display); font-size:var(--text-2xl); margin-bottom:var(--space-4);">Order Not Found</h2>
          <a href="orders.html" class="btn btn--primary btn--md">View All Orders</a>
        </div>
      `;
      return;
    }

    const order = { id: snap.id, ...snap.data() };

    // Verify this order belongs to the user
    if (order.userId !== uid) {
      container.innerHTML = `<p style="text-align:center; padding:var(--space-8); color:var(--clr-error);">Access denied.</p>`;
      return;
    }

    container.innerHTML = renderOrderDetail(order);
  });
}

// ─── LOAD ALL ORDERS (realtime) ───────────────────────────────────────────────
function loadAllOrders(uid) {
  const container = document.getElementById("orders-list");
  const searchInput = document.getElementById("order-search");
  if (!container) return;

  container.innerHTML = `<div style="display:flex;justify-content:center;padding:var(--space-12);"><div class="spinner spinner--lg"></div></div>`;

  let allOrders = [];

  const q = query(
    collection(db, "orders"),
    where("userId", "==", uid),
    orderBy("createdAt", "desc")
  );

  onSnapshot(q, (snap) => {
    allOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderOrderList(container, allOrders);
  });

  // Search
  searchInput?.addEventListener("input", () => {
    const q = searchInput.value.toLowerCase();
    const filtered = allOrders.filter(
      (o) =>
        o.orderId?.toLowerCase().includes(q) ||
        o.status?.toLowerCase().includes(q) ||
        o.items?.some((i) => i.name?.toLowerCase().includes(q))
    );
    renderOrderList(container, filtered);
  });
}

// ─── RENDER ORDER LIST ────────────────────────────────────────────────────────
function renderOrderList(container, orders) {
  if (!orders.length) {
    container.innerHTML = `
      <div style="text-align:center; padding:var(--space-16); color:var(--clr-text-muted);">
        <p style="font-size:3rem; margin-bottom:var(--space-4);">📦</p>
        <p style="font-size:var(--text-lg); font-weight:600;">No orders found</p>
        <a href="index.html" class="btn btn--primary btn--md" style="margin-top:var(--space-6);">Start Shopping</a>
      </div>
    `;
    return;
  }

  container.innerHTML = orders.map((order) => renderOrderCard(order)).join("");
}

// ─── RENDER ORDER CARD ────────────────────────────────────────────────────────
function renderOrderCard(order) {
  const color = statusColor(order.status);
  const itemsPreview = (order.items || [])
    .slice(0, 2)
    .map((i) => `${i.name} × ${i.qty}`)
    .join(", ");
  const moreCount = (order.items?.length || 0) - 2;
  const isCancelled = order.status === "Cancelled";

  return `
    <article class="glass-card" style="padding:var(--space-6); margin-bottom:var(--space-4); transition: transform 0.2s; cursor:pointer;"
      onclick="window.location.href='orders.html?order=${order.orderId}'"
      role="button" tabindex="0"
      aria-label="Order ${order.orderId}, Status: ${order.status}"
      onkeydown="if(event.key==='Enter') window.location.href='orders.html?order=${order.orderId}'"
    >
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:var(--space-3); margin-bottom:var(--space-4);">
        <div>
          <p style="font-size:var(--text-xs); letter-spacing:0.1em; text-transform:uppercase; color:var(--clr-text-muted); margin-bottom:var(--space-1);">Order ID</p>
          <p style="font-family:var(--font-display); font-size:var(--text-xl); font-weight:700;">${order.orderId}</p>
          <p style="font-size:var(--text-xs); color:var(--clr-text-muted); margin-top:var(--space-1);">${formatDate(order.createdAt)}</p>
        </div>
        <div style="text-align:right;">
          <span style="
            background:${color}20; color:${color};
            padding:var(--space-1) var(--space-4);
            border-radius:var(--radius-full);
            font-size:var(--text-xs); font-weight:700;
            border:1px solid ${color}40;
          ">${order.status}</span>
          <p style="font-family:var(--font-display); font-size:var(--text-xl); font-weight:700; color:var(--clr-primary); margin-top:var(--space-2);">
            ${formatPrice(order.total)}
          </p>
        </div>
      </div>

      <p style="font-size:var(--text-sm); color:var(--clr-text-2); margin-bottom:var(--space-4);">
        ${itemsPreview}${moreCount > 0 ? ` +${moreCount} more item${moreCount > 1 ? "s" : ""}` : ""}
      </p>

      ${!isCancelled ? renderMiniTracker(order.status) : ""}

      <div style="text-align:right; margin-top:var(--space-3);">
        <span style="font-size:var(--text-xs); color:var(--clr-text-muted);">Click to view details →</span>
      </div>
    </article>
  `;
}

// ─── MINI STATUS TRACKER ──────────────────────────────────────────────────────
function renderMiniTracker(status) {
  const currentIdx = STATUS_STEPS.indexOf(status);
  return `
    <div style="display:flex; align-items:center; gap:0; margin-top:var(--space-3);" role="progressbar" aria-valuenow="${currentIdx + 1}" aria-valuemax="${STATUS_STEPS.length}" aria-label="Order progress">
      ${STATUS_STEPS.map((step, i) => {
        const isDone = i < currentIdx;
        const isCurrent = i === currentIdx;
        return `
          <div style="flex:1; display:flex; flex-direction:column; align-items:center; position:relative;">
            ${i < STATUS_STEPS.length - 1 ? `
              <div style="position:absolute; top:10px; left:50%; width:100%; height:2px; background:${isDone || isCurrent ? "var(--clr-primary)" : "var(--clr-border)"}; z-index:0;"></div>
            ` : ""}
            <div style="
              width:20px; height:20px; border-radius:50%;
              background:${isDone ? "var(--clr-success)" : isCurrent ? "var(--clr-primary)" : "var(--clr-border)"};
              display:flex; align-items:center; justify-content:center;
              font-size:10px; color:#fff; position:relative; z-index:1;
              flex-shrink:0;
            ">${isDone ? "✓" : isCurrent ? "●" : ""}</div>
            <span style="font-size:9px; color:${isCurrent ? "var(--clr-primary)" : "var(--clr-text-muted)"}; font-weight:${isCurrent ? "700" : "400"}; margin-top:4px; text-align:center;">${step}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

// ─── RENDER FULL ORDER DETAIL ─────────────────────────────────────────────────
function renderOrderDetail(order) {
  const isCancelled = order.status === "Cancelled";
  const currentIdx = STATUS_STEPS.indexOf(order.status);

  return `
    <div style="margin-bottom:var(--space-6);">
      <a href="orders.html" style="font-size:var(--text-sm); color:var(--clr-text-muted);">← All Orders</a>
    </div>

    <!-- Order Header -->
    <div class="glass-card" style="padding:var(--space-6); margin-bottom:var(--space-6);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:var(--space-4);">
        <div>
          <h1 style="font-family:var(--font-display); font-size:var(--text-3xl); font-weight:700; margin-bottom:var(--space-2);">
            Order #${order.orderId}
          </h1>
          <p style="color:var(--clr-text-muted); font-size:var(--text-sm);">Placed on ${formatDate(order.createdAt)}</p>
        </div>
        <span style="
          background:${statusColor(order.status)}20;
          color:${statusColor(order.status)};
          padding:var(--space-2) var(--space-6);
          border-radius:var(--radius-full);
          font-weight:700; font-size:var(--text-base);
          border:2px solid ${statusColor(order.status)}40;
        ">${order.status}</span>
      </div>
    </div>

    <!-- Status Tracker -->
    ${!isCancelled ? `
    <div class="glass-card" style="padding:var(--space-8); margin-bottom:var(--space-6);">
      <h2 style="font-family:var(--font-display); font-size:var(--text-xl); font-weight:700; margin-bottom:var(--space-8);">Order Progress</h2>
      <div class="order-status-track" role="progressbar" aria-label="Order tracking">
        ${STATUS_STEPS.map((step, i) => {
          const isDone = i < currentIdx;
          const isCurrent = i === currentIdx;
          return `
            <div class="order-status-step ${isDone ? "order-status-step--done" : ""} ${isCurrent ? "order-status-step--current" : ""}">
              <div class="order-status-step__dot" aria-label="${step}${isDone ? " - completed" : isCurrent ? " - current" : ""}">
                ${isDone ? "✓" : i + 1}
              </div>
              <span class="order-status-step__label">${step}</span>
            </div>
          `;
        }).join("")}
      </div>
    </div>
    ` : `
    <div class="glass-card" style="padding:var(--space-6); margin-bottom:var(--space-6); border-left:4px solid var(--clr-error);">
      <p style="color:var(--clr-error); font-weight:600;">⚠️ This order has been cancelled.</p>
    </div>
    `}

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-6);">

      <!-- Order Items -->
      <div class="glass-card" style="padding:var(--space-6);">
        <h2 style="font-family:var(--font-display); font-size:var(--text-xl); font-weight:700; margin-bottom:var(--space-5);">Items Ordered</h2>
        ${(order.items || []).map((item) => `
          <div style="display:flex; gap:var(--space-4); padding:var(--space-4) 0; border-bottom:1px solid var(--clr-border);">
            ${item.image ? `<img src="${item.image}" alt="${item.name}" style="width:64px;height:80px;object-fit:cover;border-radius:var(--radius-md);" loading="lazy" />` : `<div style="width:64px;height:80px;background:var(--clr-bg-2);border-radius:var(--radius-md);"></div>`}
            <div style="flex:1;">
              <p style="font-weight:600; font-size:var(--text-base); margin-bottom:var(--space-1);">${item.name}</p>
              ${item.size ? `<p style="font-size:var(--text-xs); color:var(--clr-text-muted);">Size: ${item.size}</p>` : ""}
              <p style="font-size:var(--text-sm); color:var(--clr-text-muted);">Qty: ${item.qty}</p>
              <p style="color:var(--clr-primary); font-weight:700; margin-top:var(--space-1);">${formatPrice(item.price * item.qty)}</p>
            </div>
          </div>
        `).join("")}

        <div style="display:flex;justify-content:space-between;padding-top:var(--space-4);font-family:var(--font-display);font-size:var(--text-xl);font-weight:700;color:var(--clr-primary);">
          <span>Grand Total</span>
          <span>${formatPrice(order.total)}</span>
        </div>
      </div>

      <!-- Delivery Details -->
      <div>
        <div class="glass-card" style="padding:var(--space-6); margin-bottom:var(--space-4);">
          <h2 style="font-family:var(--font-display); font-size:var(--text-xl); font-weight:700; margin-bottom:var(--space-4);">Delivery Address</h2>
          <p style="font-weight:600; margin-bottom:var(--space-1);">${order.userName}</p>
          <p style="color:var(--clr-text-muted); font-size:var(--text-sm); line-height:1.6;">${order.userAddress}</p>
          <p style="margin-top:var(--space-2); font-size:var(--text-sm);">📞 ${order.userPhone}</p>
        </div>

        <div class="glass-card" style="padding:var(--space-5);">
          <h3 style="font-size:var(--text-base); font-weight:700; margin-bottom:var(--space-3);">Need Help?</h3>
          <p style="font-size:var(--text-sm); color:var(--clr-text-muted); margin-bottom:var(--space-4);">For any queries about your order, reach us on WhatsApp.</p>
          <a
            href="https://wa.me/919799000000?text=Order+query+for+${order.orderId}"
            target="_blank" rel="noopener"
            class="btn btn--primary btn--sm btn--full"
          >
            📱 WhatsApp Support
          </a>
        </div>
      </div>
    </div>
  `;
}
