/**
 * admin.js
 * Admin Panel — Products, Orders, Dashboard
 * Shree Panchmukhi Balaji Handloom
 */

import { auth, db, storage } from "./firebase.js";
import {
  collection,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { onAuthChange, getUserProfile } from "./auth.js";
import {
  showToast,
  formatPrice,
  formatDate,
  statusColor,
  calcDiscount,
  compressImage,
  initDarkMode,
  debounce,
  productImageHtml,
} from "./utils.js";

// ─── STATE ───────────────────────────────────────────────────────────────────
let editingProductId = null;
let pendingImages = []; // {file, blob, previewUrl}
let existingImageUrls = [];

// ─── INIT ────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initDarkMode();

  onAuthChange(async (user) => {
    if (!user) {
      window.location.href = "login.html?redirect=admin.html";
      return;
    }

    const profile = await getUserProfile(user.uid);
    if (!profile?.isAdmin) {
      document.body.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100svh;font-family:system-ui;text-align:center;padding:2rem;">
          <p style="font-size:4rem;margin-bottom:1rem;">🔒</p>
          <h1 style="font-size:2rem;margin-bottom:0.5rem;">Access Denied</h1>
          <p style="color:#666;margin-bottom:2rem;">You don't have admin privileges.</p>
          <a href="index.html" style="padding:0.75rem 2rem;background:#D4AF37;color:#1A1A1A;border-radius:9999px;text-decoration:none;font-weight:600;">Go to Store</a>
        </div>
      `;
      return;
    }

    document.getElementById("admin-shell").style.display = "flex";
    document.getElementById("admin-loading").style.display = "none";
    document.getElementById("admin-user-name").textContent = profile.name || user.email;

    initNav();
    loadDashboard();
    initProductForm();
    initImageUpload();
  });
});

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
function initNav() {
  const navItems = document.querySelectorAll(".admin-nav__item[data-section]");
  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const section = item.dataset.section;
      switchSection(section);
      navItems.forEach((n) => n.classList.remove("active"));
      item.classList.add("active");
    });
  });
}

function switchSection(id) {
  document.querySelectorAll(".admin-section").forEach((s) => s.classList.remove("active"));
  const target = document.getElementById(`section-${id}`);
  if (target) target.classList.add("active");

  if (id === "products") loadProducts();
  if (id === "orders") loadOrders();
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const [productsSnap, ordersSnap, usersSnap] = await Promise.all([
      getDocs(collection(db, "products")),
      getDocs(collection(db, "orders")),
      getDocs(collection(db, "users")),
    ]);

    const orders = ordersSnap.docs.map((d) => d.data());
    const revenue = orders
      .filter((o) => o.status !== "Cancelled")
      .reduce((sum, o) => sum + (o.total || 0), 0);
    const pending = orders.filter((o) => o.status === "Pending").length;

    document.getElementById("stat-products").textContent = productsSnap.size;
    document.getElementById("stat-orders").textContent = ordersSnap.size;
    document.getElementById("stat-users").textContent = usersSnap.size;
    document.getElementById("stat-revenue").textContent = formatPrice(revenue);

    // Pending orders badge
    const badge = document.getElementById("pending-badge");
    if (badge && pending > 0) {
      badge.textContent = pending;
      badge.style.display = "inline";
    }

    // Recent orders in dashboard
    const recent = ordersSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .slice(0, 5);

    const recentContainer = document.getElementById("recent-orders");
    if (recentContainer) {
      recentContainer.innerHTML = recent.length
        ? recent.map((o) => renderDashboardOrderRow(o)).join("")
        : `<tr><td colspan="5" style="text-align:center;padding:var(--space-8);color:var(--clr-text-muted);">No orders yet</td></tr>`;
    }
  } catch (err) {
    console.error("Dashboard error:", err);
  }
}

function renderDashboardOrderRow(order) {
  const color = statusColor(order.status);
  return `
    <tr>
      <td><strong>${order.orderId}</strong></td>
      <td>${order.userName || "—"}</td>
      <td>${formatPrice(order.total)}</td>
      <td>
        <span class="status-badge" style="background:${color}20;color:${color};border:1px solid ${color}40;">
          ${order.status}
        </span>
      </td>
      <td>${formatDate(order.createdAt)}</td>
    </tr>
  `;
}

// ─── PRODUCTS ────────────────────────────────────────────────────────────────
let allProducts = [];

function loadProducts() {
  const container = document.getElementById("products-table-body");
  if (!container) return;

  container.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:var(--space-8);"><div class="spinner" style="margin:0 auto;"></div></td></tr>`;

  onSnapshot(query(collection(db, "products"), orderBy("createdAt", "desc")), (snap) => {
    allProducts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderProductsTable(allProducts);
    document.getElementById("stat-products").textContent = allProducts.length;
  });
}

function renderProductsTable(products) {
  const container = document.getElementById("products-table-body");
  if (!container) return;

  if (!products.length) {
    container.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:var(--space-10);color:var(--clr-text-muted);">No products yet. Add your first product!</td></tr>`;
    return;
  }

  container.innerHTML = products
    .map(
      (p) => `
    <tr>
      <td>
        ${productImageHtml(p.images?.[0] || "", p.name, "admin-table__img")}
      </td>
      <td>
        <strong>${p.name}</strong>
        <p style="font-size:var(--text-xs);color:var(--clr-text-muted);margin-top:2px;">${p.category || "—"}</p>
      </td>
      <td>
        <span style="text-decoration:line-through;color:var(--clr-text-muted);font-size:var(--text-xs);">${formatPrice(p.mrp)}</span><br/>
        <strong style="color:var(--clr-primary);">${formatPrice(p.price)}</strong>
        ${p.mrp > p.price ? `<span style="font-size:10px;color:var(--clr-success);margin-left:4px;">${calcDiscount(p.mrp, p.price)}% off</span>` : ""}
      </td>
      <td>${p.stock}</td>
      <td>
        <span class="status-badge" style="background:${p.featured ? "rgba(201,149,42,0.15)" : "var(--clr-border)"};color:${p.featured ? "var(--clr-gold-dark)" : "var(--clr-text-muted)"};">
          ${p.featured ? "⭐ Featured" : "—"}
        </span>
      </td>
      <td style="font-size:var(--text-xs);color:var(--clr-text-muted);">${formatDate(p.createdAt)}</td>
      <td>
        <div class="admin-table__actions">
          <button class="admin-table__action-btn admin-table__action-btn--edit" onclick="editProduct('${p.id}')" aria-label="Edit ${p.name}">✏️ Edit</button>
          <button class="admin-table__action-btn admin-table__action-btn--delete" onclick="deleteProduct('${p.id}','${p.name}')" aria-label="Delete ${p.name}">🗑 Delete</button>
        </div>
      </td>
    </tr>
  `
    )
    .join("");
}

// Product search
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("product-search")?.addEventListener(
    "input",
    debounce((e) => {
      const q = e.target.value.toLowerCase();
      const filtered = allProducts.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q)
      );
      renderProductsTable(filtered);
    }, 300)
  );
});

// ─── ADD / EDIT PRODUCT FORM ──────────────────────────────────────────────────
function initProductForm() {
  const form = document.getElementById("product-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Saving…";

    try {
      const mrp = parseFloat(document.getElementById("pf-mrp").value);
      const price = parseFloat(document.getElementById("pf-price").value);

      if (price > mrp) {
        showToast("Selling price cannot be greater than MRP", "error");
        btn.disabled = false;
        btn.textContent = "Save Product";
        return;
      }

      // Upload new images
      const uploadedUrls = await uploadPendingImages();
      const allImages = [...existingImageUrls, ...uploadedUrls];

      const sizesRaw = document.getElementById("pf-sizes").value;
      const sizes = sizesRaw
        ? sizesRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : [];

      const data = {
        name: document.getElementById("pf-name").value.trim(),
        description: document.getElementById("pf-desc").value.trim(),
        category: document.getElementById("pf-category").value,
        collection: document.getElementById("pf-collection").value.trim(),
        mrp,
        price,
        stock: parseInt(document.getElementById("pf-stock").value) || 0,
        sizes,
        images: allImages,
        featured: document.getElementById("pf-featured").checked,
        rating: parseFloat(document.getElementById("pf-rating").value) || 4,
        reviews: parseInt(document.getElementById("pf-reviews").value) || 0,
        updatedAt: serverTimestamp(),
      };

      if (editingProductId) {
        await updateDoc(doc(db, "products", editingProductId), data);
        showToast("Product updated ✓");
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, "products"), data);
        showToast("Product added ✓");
      }

      closeModal("product-modal");
      resetProductForm();
    } catch (err) {
      console.error("Product save error:", err);
      showToast("Failed to save product: " + err.message, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Save Product";
    }
  });
}

// Open Add Product modal
window.openAddProductModal = function () {
  editingProductId = null;
  pendingImages = [];
  existingImageUrls = [];
  resetProductForm();
  document.querySelector("#product-modal .modal__title").textContent = "Add New Product";
  openModal("product-modal");
};

// Open Edit Product modal
window.editProduct = async function (id) {
  try {
    const snap = await getDoc(doc(db, "products", id));
    if (!snap.exists()) {
      showToast("Product not found", "error");
      return;
    }
    const p = { id: snap.id, ...snap.data() };
    editingProductId = id;
    pendingImages = [];
    existingImageUrls = p.images || [];

    document.getElementById("pf-name").value = p.name || "";
    document.getElementById("pf-desc").value = p.description || "";
    document.getElementById("pf-category").value = p.category || "saree";
    document.getElementById("pf-collection").value = p.collection || "";
    document.getElementById("pf-mrp").value = p.mrp || "";
    document.getElementById("pf-price").value = p.price || "";
    document.getElementById("pf-stock").value = p.stock || "";
    document.getElementById("pf-sizes").value = (p.sizes || []).join(", ");
    document.getElementById("pf-featured").checked = p.featured || false;
    document.getElementById("pf-rating").value = p.rating || 4;
    document.getElementById("pf-reviews").value = p.reviews || 0;

    renderImagePreviews();
    document.querySelector("#product-modal .modal__title").textContent = "Edit Product";
    openModal("product-modal");
  } catch (err) {
    console.error("Edit product error:", err);
    showToast("Failed to load product", "error");
  }
};

// Delete product
window.deleteProduct = async function (id, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  try {
    await deleteDoc(doc(db, "products", id));
    showToast(`"${name}" deleted`);
  } catch (err) {
    showToast("Delete failed: " + err.message, "error");
  }
};

// Reset form
function resetProductForm() {
  document.getElementById("product-form")?.reset();
  pendingImages = [];
  existingImageUrls = [];
  renderImagePreviews();
}

// ─── IMAGE UPLOAD ─────────────────────────────────────────────────────────────
function initImageUpload() {
  const zone = document.getElementById("upload-zone");
  const input = document.getElementById("img-input");
  if (!zone || !input) return;

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("drag-over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    handleFiles(Array.from(e.dataTransfer.files));
  });

  input.addEventListener("change", () => handleFiles(Array.from(input.files)));
}

async function handleFiles(files) {
  const imageFiles = files.filter((f) => f.type.startsWith("image/"));

  for (const file of imageFiles) {
    try {
      const blob = await compressImage(file);
      const previewUrl = URL.createObjectURL(blob);
      pendingImages.push({ file, blob, previewUrl });
    } catch (err) {
      showToast(err.message || "Image compression failed", "error");
    }
  }
  renderImagePreviews();
}

function renderImagePreviews() {
  const container = document.getElementById("image-previews");
  if (!container) return;

  const existingHtml = existingImageUrls.map(
    (url, i) => `
    <div class="image-preview-item">
      <img src="${url}" alt="Product image ${i + 1}" />
      <button class="image-preview-remove" onclick="removeExistingImage(${i})" aria-label="Remove image">✕</button>
    </div>
  `
  );

  const pendingHtml = pendingImages.map(
    (img, i) => `
    <div class="image-preview-item">
      <img src="${img.previewUrl}" alt="New image ${i + 1}" />
      <button class="image-preview-remove" onclick="removePendingImage(${i})" aria-label="Remove image">✕</button>
    </div>
  `
  );

  container.innerHTML = existingHtml.join("") + pendingHtml.join("");
}

window.removeExistingImage = function (i) {
  existingImageUrls.splice(i, 1);
  renderImagePreviews();
};

window.removePendingImage = function (i) {
  URL.revokeObjectURL(pendingImages[i].previewUrl);
  pendingImages.splice(i, 1);
  renderImagePreviews();
};

async function uploadPendingImages() {
  const urls = [];
  for (const img of pendingImages) {
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.webp`;
    const storageRef = ref(
      storage,
      `products/${editingProductId || "new"}/${filename}`
    );
    await uploadBytes(storageRef, img.blob, { contentType: "image/webp" });
    const url = await getDownloadURL(storageRef);
    urls.push(url);
  }
  return urls;
}

// ─── ORDERS ──────────────────────────────────────────────────────────────────
let allOrders = [];

function loadOrders() {
  const container = document.getElementById("orders-table-body");
  if (!container) return;

  container.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:var(--space-8);"><div class="spinner" style="margin:0 auto;"></div></td></tr>`;

  onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")), (snap) => {
    allOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderOrdersTable(allOrders);
  });

  document.getElementById("admin-order-search")?.addEventListener(
    "input",
    debounce((e) => {
      const q = e.target.value.toLowerCase();
      const filtered = allOrders.filter(
        (o) =>
          o.orderId?.toLowerCase().includes(q) ||
          o.userName?.toLowerCase().includes(q) ||
          o.status?.toLowerCase().includes(q) ||
          o.userPhone?.includes(q)
      );
      renderOrdersTable(filtered);
    }, 300)
  );
}

function renderOrdersTable(orders) {
  const container = document.getElementById("orders-table-body");
  if (!container) return;

  if (!orders.length) {
    container.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:var(--space-10);color:var(--clr-text-muted);">No orders found</td></tr>`;
    return;
  }

  container.innerHTML = orders
    .map(
      (o) => `
    <tr>
      <td><strong>${o.orderId}</strong></td>
      <td>
        <strong>${o.userName || "—"}</strong>
        <p style="font-size:var(--text-xs);color:var(--clr-text-muted);">${o.userPhone || ""}</p>
      </td>
      <td>
        ${(o.items || [])
          .slice(0, 2)
          .map((i) => `<p style="font-size:var(--text-xs);">${i.name} ×${i.qty}</p>`)
          .join("")}
        ${o.items?.length > 2 ? `<p style="font-size:10px;color:var(--clr-text-muted);">+${o.items.length - 2} more</p>` : ""}
      </td>
      <td><strong style="color:var(--clr-primary);">${formatPrice(o.total)}</strong></td>
      <td>
        <select class="status-select" onchange="updateOrderStatus('${o.id}', this.value)" aria-label="Update order status" style="border-color:${statusColor(o.status)};">
          ${["Pending","Confirmed","Packed","Shipped","Delivered","Cancelled"]
            .map((s) => `<option value="${s}" ${s === o.status ? "selected" : ""}>${s}</option>`)
            .join("")}
        </select>
      </td>
      <td style="font-size:var(--text-xs);color:var(--clr-text-muted);">${formatDate(o.createdAt)}</td>
      <td>
        <button class="admin-table__action-btn admin-table__action-btn--view" onclick="viewOrderDetail('${o.id}')" aria-label="View order">👁 View</button>
      </td>
    </tr>
  `
    )
    .join("");
}

window.updateOrderStatus = async function (orderId, status) {
  try {
    await updateDoc(doc(db, "orders", orderId), { status, updatedAt: serverTimestamp() });
    showToast(`Order status updated to ${status} ✓`);
  } catch (err) {
    showToast("Update failed", "error");
  }
};

window.viewOrderDetail = async function (orderId) {
  try {
    const snap = await getDoc(doc(db, "orders", orderId));
    if (!snap.exists()) return;
    const o = { id: snap.id, ...snap.data() };
    const modal = document.getElementById("order-detail-modal");
    const content = document.getElementById("order-detail-content");
    content.innerHTML = `
      <div style="margin-bottom:var(--space-4);">
        <p style="font-size:var(--text-xs);color:var(--clr-text-muted);">ORDER ID</p>
        <p style="font-weight:700;font-size:var(--text-lg);">${o.orderId}</p>
        <p style="font-size:var(--text-xs);color:var(--clr-text-muted);">${formatDate(o.createdAt)}</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);margin-bottom:var(--space-5);">
        <div>
          <p style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--clr-text-muted);margin-bottom:var(--space-2);">Customer</p>
          <p><strong>${o.userName}</strong></p>
          <p>${o.userPhone}</p>
          <p style="font-size:var(--text-sm);color:var(--clr-text-muted);">${o.userEmail || ""}</p>
        </div>
        <div>
          <p style="font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--clr-text-muted);margin-bottom:var(--space-2);">Address</p>
          <p style="font-size:var(--text-sm);line-height:1.5;">${o.userAddress}</p>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:var(--text-sm);">
        <thead>
          <tr style="background:var(--clr-bg-2);">
            <th style="padding:var(--space-3);text-align:left;">Product</th>
            <th style="padding:var(--space-3);text-align:right;">Size</th>
            <th style="padding:var(--space-3);text-align:right;">Qty</th>
            <th style="padding:var(--space-3);text-align:right;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${(o.items || []).map((item) => `
            <tr>
              <td style="padding:var(--space-3);border-bottom:1px solid var(--clr-border);">${item.name}</td>
              <td style="padding:var(--space-3);border-bottom:1px solid var(--clr-border);text-align:right;">${item.size || "—"}</td>
              <td style="padding:var(--space-3);border-bottom:1px solid var(--clr-border);text-align:right;">${item.qty}</td>
              <td style="padding:var(--space-3);border-bottom:1px solid var(--clr-border);text-align:right;">${formatPrice(item.price * item.qty)}</td>
            </tr>
          `).join("")}
          <tr>
            <td colspan="3" style="padding:var(--space-4);font-weight:700;">Grand Total</td>
            <td style="padding:var(--space-4);text-align:right;font-weight:700;color:var(--clr-primary);font-size:var(--text-lg);">${formatPrice(o.total)}</td>
          </tr>
        </tbody>
      </table>
    `;
    openModal("order-detail-modal");
  } catch (err) {
    showToast("Failed to load order", "error");
  }
};

// ─── MODAL HELPERS ────────────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id)?.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove("open");
  document.body.style.overflow = "";
}

window.closeModal = closeModal;

// Close on overlay click
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-overlay")) {
    e.target.classList.remove("open");
    document.body.style.overflow = "";
  }
});

// Close on Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal-overlay.open").forEach((m) => {
      m.classList.remove("open");
      document.body.style.overflow = "";
    });
  }
});
