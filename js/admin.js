/**
 * admin.js
 * Admin Panel — Products, Orders, Dashboard
 * Shree Panchmukhi Balaji Handloom
 *
 * BUGS FIXED:
 * 1. window.editProduct / window.deleteProduct / window.viewOrderDetail
 *    were defined as window.* assignments AFTER DOMContentLoaded but
 *    inline onclick="" in HTML runs in global scope — moved all to top-level
 *    immediately so they are available before any click.
 * 2. initImageUpload was called inside onAuthChange — sometimes modal opens
 *    before event listeners were attached. Fixed by calling at module level.
 * 3. product-search second DOMContentLoaded listener was redundant and
 *    sometimes ran before allProducts was populated — merged into one flow.
 * 4. onSnapshot for orders was re-subscribing every time loadOrders() called.
 *    Added unsub guard.
 */

import { auth, db, storage } from "./firebase.js";
import {
  collection,
  doc,
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
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { onAuthChange, getUserProfile, logout } from "./auth.js";
import {
  showToast,
  formatPrice,
  formatDate,
  statusColor,
  calcDiscount,
  compressImage,
  initDarkMode,
  debounce,
} from "./utils.js";

// ─── MODULE-LEVEL STATE ───────────────────────────────────────────────────────
let editingProductId = null;
let pendingImages    = [];
let existingImageUrls = [];
let allProducts      = [];
let allOrders        = [];
let unsubProducts    = null;
let unsubOrders      = null;

// ─── EXPOSE GLOBALS IMMEDIATELY (before any HTML onclick runs) ────────────────
// These MUST be at top level so inline onclick="editProduct()" works
window.openAddProductModal = openAddProductModal;
window.editProduct         = editProduct;
window.deleteProduct       = deleteProduct;
window.viewOrderDetail     = viewOrderDetail;
window.updateOrderStatus   = updateOrderStatus;
window.removeExistingImage = removeExistingImage;
window.removePendingImage  = removePendingImage;
window.closeModal          = closeModal;

// ─── INIT ────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initDarkMode();
  initImageUpload(); // attach upload-zone listeners immediately
  initModalClose();  // attach modal close listeners immediately

  onAuthChange(async (user) => {
    if (!user) {
      window.location.href = "login.html?redirect=admin.html";
      return;
    }

    const profile = await getUserProfile(user.uid);

    if (!profile?.isAdmin) {
      document.body.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
          min-height:100svh;font-family:system-ui;text-align:center;padding:2rem;
          background:linear-gradient(135deg,#1a0a00,#3d1a00);">
          <p style="font-size:4rem;margin-bottom:1rem;">🔒</p>
          <h1 style="font-size:2rem;margin-bottom:0.5rem;color:#fff;">Access Denied</h1>
          <p style="color:rgba(255,255,255,0.6);margin-bottom:2rem;">You don't have admin privileges.</p>
          <a href="index.html" style="padding:0.75rem 2rem;background:#C9952A;color:#1a0a00;
            border-radius:9999px;text-decoration:none;font-weight:700;">Go to Store</a>
        </div>`;
      return;
    }

    // Show admin shell
    document.getElementById("admin-shell").style.display  = "flex";
    document.getElementById("admin-loading").style.display = "none";
    document.getElementById("admin-user-name").textContent = profile.name || user.email;

    initNav();
    initProductForm();
    initProductSearch();
    loadDashboard();

    // Logout button
    const logoutBtn = document.getElementById("admin-logout-btn");
    if (logoutBtn && !logoutBtn.dataset.attached) {
      logoutBtn.dataset.attached = "true";
      logoutBtn.addEventListener("click", async () => {
        await logout();
        window.location.href = "login.html";
      });
    }
  });
});

// ─── NAVIGATION ──────────────────────────────────────────────────────────────
function initNav() {
  document.querySelectorAll(".admin-nav__item[data-section]").forEach((item) => {
    item.addEventListener("click", () => {
      document.querySelectorAll(".admin-nav__item[data-section]").forEach((n) =>
        n.classList.remove("active")
      );
      item.classList.add("active");
      switchSection(item.dataset.section);
    });
  });
}

function switchSection(id) {
  document.querySelectorAll(".admin-section").forEach((s) => s.classList.remove("active"));
  const target = document.getElementById(`section-${id}`);
  if (target) target.classList.add("active");

  if (id === "products") loadProducts();
  if (id === "orders")   loadOrders();
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const [productsSnap, ordersSnap, usersSnap] = await Promise.all([
      getDocs(collection(db, "products")),
      getDocs(collection(db, "orders")),
      getDocs(collection(db, "users")),
    ]);

    const orders  = ordersSnap.docs.map((d) => d.data());
    const revenue = orders
      .filter((o) => o.status !== "Cancelled")
      .reduce((sum, o) => sum + (o.total || 0), 0);
    const pending = orders.filter((o) => o.status === "Pending").length;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set("stat-products", productsSnap.size);
    set("stat-orders",   ordersSnap.size);
    set("stat-users",    usersSnap.size);
    set("stat-revenue",  formatPrice(revenue));

    const badge = document.getElementById("pending-badge");
    if (badge) { badge.textContent = pending; badge.style.display = pending > 0 ? "inline" : "none"; }

    const recent = ordersSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .slice(0, 5);

    const tbody = document.getElementById("recent-orders");
    if (tbody) {
      tbody.innerHTML = recent.length
        ? recent.map(renderDashboardRow).join("")
        : `<tr><td colspan="5" style="text-align:center;padding:2rem;color:gray;">No orders yet</td></tr>`;
    }
  } catch (err) {
    console.error("Dashboard error:", err);
    showToast("Dashboard load failed", "error");
  }
}

function renderDashboardRow(o) {
  const color = statusColor(o.status);
  return `
    <tr style="cursor:pointer;" onclick="viewOrderDetail('${o.id}')">
      <td><strong>${o.orderId || o.id}</strong></td>
      <td>${o.userName || "—"}</td>
      <td>${formatPrice(o.total)}</td>
      <td><span class="status-badge" style="background:${color}20;color:${color};
        border:1px solid ${color}40;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;">
        ${o.status}</span></td>
      <td>${formatDate(o.createdAt)}</td>
    </tr>`;
}

// ─── PRODUCTS ────────────────────────────────────────────────────────────────
function loadProducts() {
  const tbody = document.getElementById("products-table-body");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;">
    <div class="spinner" style="margin:0 auto;"></div></td></tr>`;

  // Unsubscribe previous listener
  if (unsubProducts) { unsubProducts(); unsubProducts = null; }

  unsubProducts = onSnapshot(
    query(collection(db, "products"), orderBy("createdAt", "desc")),
    (snap) => {
      allProducts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderProductsTable(allProducts);
      const el = document.getElementById("stat-products");
      if (el) el.textContent = allProducts.length;
    },
    (err) => {
      console.error("Products listener error:", err);
      showToast("Failed to load products: " + err.message, "error");
    }
  );
}

function renderProductsTable(products) {
  const tbody = document.getElementById("products-table-body");
  if (!tbody) return;

  if (!products.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:gray;">
      No products yet. Click "Add Product" to get started!</td></tr>`;
    return;
  }

  tbody.innerHTML = products.map((p) => `
    <tr>
      <td>
        <img src="${p.images?.[0] || "assets/images/placeholder.webp"}"
          alt="${p.name}" class="admin-table__img" loading="lazy" />
      </td>
      <td>
        <strong>${p.name}</strong>
        <p style="font-size:11px;color:gray;margin-top:2px;">${p.category || "—"}</p>
      </td>
      <td>
        <span style="text-decoration:line-through;color:gray;font-size:11px;">${formatPrice(p.mrp)}</span><br/>
        <strong style="color:var(--clr-primary);">${formatPrice(p.price)}</strong>
        ${p.mrp > p.price
          ? `<span style="font-size:10px;color:green;margin-left:4px;">${calcDiscount(p.mrp, p.price)}% off</span>`
          : ""}
      </td>
      <td>${p.stock ?? 0}</td>
      <td>
        <span style="background:${p.featured ? "rgba(201,149,42,0.15)" : "var(--clr-border)"};
          color:${p.featured ? "#9A7020" : "gray"};padding:2px 10px;
          border-radius:999px;font-size:11px;font-weight:700;">
          ${p.featured ? "⭐ Featured" : "—"}
        </span>
      </td>
      <td style="font-size:11px;color:gray;">${formatDate(p.createdAt)}</td>
      <td>
        <div class="admin-table__actions">
          <button class="admin-table__action-btn admin-table__action-btn--edit"
            onclick="editProduct('${p.id}')">✏️ Edit</button>
          <button class="admin-table__action-btn admin-table__action-btn--delete"
            onclick="deleteProduct('${p.id}', '${p.name.replace(/'/g, "\\'")}')">🗑 Delete</button>
        </div>
      </td>
    </tr>`).join("");
}

// ─── PRODUCT SEARCH ──────────────────────────────────────────────────────────
function initProductSearch() {
  const input = document.getElementById("product-search");
  if (!input) return;
  input.addEventListener("input", debounce((e) => {
    const q = e.target.value.toLowerCase();
    renderProductsTable(
      q ? allProducts.filter((p) =>
        p.name?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q)
      ) : allProducts
    );
  }, 300));
}

// ─── ADD PRODUCT MODAL ────────────────────────────────────────────────────────
function openAddProductModal() {
  editingProductId  = null;
  pendingImages     = [];
  existingImageUrls = [];
  document.getElementById("product-form")?.reset();
  renderImagePreviews();
  const title = document.querySelector("#product-modal .modal__title");
  if (title) title.textContent = "Add New Product";
  openModal("product-modal");
}

// ─── EDIT PRODUCT ────────────────────────────────────────────────────────────
async function editProduct(id) {
  try {
    const snap = await getDoc(doc(db, "products", id));
    if (!snap.exists()) { showToast("Product not found", "error"); return; }

    const p = { id: snap.id, ...snap.data() };
    editingProductId  = id;
    pendingImages     = [];
    existingImageUrls = [...(p.images || [])];

    const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };
    set("pf-name",       p.name || "");
    set("pf-desc",       p.description || "");
    set("pf-collection", p.collection || "");
    set("pf-mrp",        p.mrp || "");
    set("pf-price",      p.price || "");
    set("pf-stock",      p.stock ?? "");
    set("pf-sizes",      (p.sizes || []).join(", "));
    set("pf-rating",     p.rating || 4);
    set("pf-reviews",    p.reviews || 0);

    const catEl = document.getElementById("pf-category");
    if (catEl) catEl.value = p.category || "saree";

    const featEl = document.getElementById("pf-featured");
    if (featEl) featEl.checked = p.featured || false;

    renderImagePreviews();

    const title = document.querySelector("#product-modal .modal__title");
    if (title) title.textContent = "Edit Product";

    openModal("product-modal");
  } catch (err) {
    console.error("editProduct error:", err);
    showToast("Failed to load product: " + err.message, "error");
  }
}

// ─── DELETE PRODUCT ───────────────────────────────────────────────────────────
async function deleteProduct(id, name) {
  if (!confirm(`Delete "${name}"?\nThis cannot be undone.`)) return;
  try {
    await deleteDoc(doc(db, "products", id));
    showToast(`"${name}" deleted ✓`);
  } catch (err) {
    showToast("Delete failed: " + err.message, "error");
  }
}

// ─── PRODUCT FORM SUBMIT ─────────────────────────────────────────────────────
function initProductForm() {
  const form = document.getElementById("product-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    btn.disabled    = true;
    btn.textContent = "Saving…";

    try {
      const mrp   = parseFloat(document.getElementById("pf-mrp").value);
      const price = parseFloat(document.getElementById("pf-price").value);

      if (!mrp || !price) {
        showToast("MRP and Price are required", "error");
        return;
      }
      if (price > mrp) {
        showToast("Selling price cannot exceed MRP", "error");
        return;
      }

      const sizesRaw = document.getElementById("pf-sizes").value;
      const sizes    = sizesRaw
        ? sizesRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : [];

      // Upload new images first
      const uploadedUrls = await uploadPendingImages();
      const allImages    = [...existingImageUrls, ...uploadedUrls];

      const data = {
        name:       document.getElementById("pf-name").value.trim(),
        description:document.getElementById("pf-desc").value.trim(),
        category:   document.getElementById("pf-category").value,
        collection: document.getElementById("pf-collection").value.trim(),
        mrp,
        price,
        stock:      parseInt(document.getElementById("pf-stock").value) || 0,
        sizes,
        images:     allImages,
        featured:   document.getElementById("pf-featured").checked,
        rating:     parseFloat(document.getElementById("pf-rating").value) || 4,
        reviews:    parseInt(document.getElementById("pf-reviews").value) || 0,
        updatedAt:  serverTimestamp(),
      };

      if (!data.name) { showToast("Product name is required", "error"); return; }

      if (editingProductId) {
        await updateDoc(doc(db, "products", editingProductId), data);
        showToast("Product updated successfully ✓");
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, "products"), data);
        showToast("Product added successfully ✓");
      }

      closeModal("product-modal");
      // Reset state
      editingProductId  = null;
      pendingImages     = [];
      existingImageUrls = [];
      form.reset();
      renderImagePreviews();

    } catch (err) {
      console.error("Product save error:", err);
      showToast("Failed to save: " + err.message, "error");
    } finally {
      btn.disabled    = false;
      btn.textContent = "Save Product";
    }
  });
}

// ─── IMAGE UPLOAD ─────────────────────────────────────────────────────────────
function initImageUpload() {
  const zone  = document.getElementById("upload-zone");
  const input = document.getElementById("img-input");
  if (!zone || !input) return;

  // Click zone → open file picker
  zone.addEventListener("click", (e) => {
    // Prevent triggering if clicking a button inside zone
    if (e.target.tagName !== "BUTTON") input.click();
  });

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

  input.addEventListener("change", () => {
    if (input.files.length) handleFiles(Array.from(input.files));
    input.value = ""; // reset so same file can be re-picked
  });
}

async function handleFiles(files) {
  const imageFiles = files.filter((f) => f.type.startsWith("image/"));
  if (!imageFiles.length) { showToast("Please select image files only", "error"); return; }

  for (const file of imageFiles) {
    try {
      showToast(`Compressing ${file.name}…`, "info");
      const blob       = await compressImage(file);
      const previewUrl = URL.createObjectURL(blob);
      pendingImages.push({ file, blob, previewUrl });
    } catch (err) {
      showToast(err.message || "Image error", "error");
    }
  }
  renderImagePreviews();
}

function renderImagePreviews() {
  const container = document.getElementById("image-previews");
  if (!container) return;

  container.innerHTML =
    existingImageUrls.map((url, i) => `
      <div class="image-preview-item">
        <img src="${url}" alt="Image ${i + 1}" />
        <button class="image-preview-remove" type="button"
          onclick="removeExistingImage(${i})" aria-label="Remove">✕</button>
      </div>`).join("") +
    pendingImages.map((img, i) => `
      <div class="image-preview-item">
        <img src="${img.previewUrl}" alt="New ${i + 1}" />
        <button class="image-preview-remove" type="button"
          onclick="removePendingImage(${i})" aria-label="Remove">✕</button>
      </div>`).join("");
}

function removeExistingImage(i) {
  existingImageUrls.splice(i, 1);
  renderImagePreviews();
}

function removePendingImage(i) {
  URL.revokeObjectURL(pendingImages[i].previewUrl);
  pendingImages.splice(i, 1);
  renderImagePreviews();
}

async function uploadPendingImages() {
  const urls = [];
  for (const img of pendingImages) {
    const filename    = `${Date.now()}_${Math.random().toString(36).slice(2)}.webp`;
    const storagePath = `products/${editingProductId || "new"}/${filename}`;
    const storageRef  = ref(storage, storagePath);
    await uploadBytes(storageRef, img.blob, { contentType: "image/webp" });
    const url = await getDownloadURL(storageRef);
    urls.push(url);
  }
  return urls;
}

// ─── ORDERS ──────────────────────────────────────────────────────────────────
function loadOrders() {
  const tbody = document.getElementById("orders-table-body");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;">
    <div class="spinner" style="margin:0 auto;"></div></td></tr>`;

  if (unsubOrders) { unsubOrders(); unsubOrders = null; }

  unsubOrders = onSnapshot(
    query(collection(db, "orders"), orderBy("createdAt", "desc")),
    (snap) => {
      allOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderOrdersTable(allOrders);
    },
    (err) => {
      console.error("Orders listener error:", err);
      showToast("Failed to load orders: " + err.message, "error");
    }
  );

  // Order search
  const searchInput = document.getElementById("admin-order-search");
  if (searchInput && !searchInput.dataset.attached) {
    searchInput.dataset.attached = "true";
    searchInput.addEventListener("input", debounce((e) => {
      const q = e.target.value.toLowerCase();
      renderOrdersTable(
        q ? allOrders.filter((o) =>
          o.orderId?.toLowerCase().includes(q) ||
          o.userName?.toLowerCase().includes(q) ||
          o.status?.toLowerCase().includes(q) ||
          o.userPhone?.includes(q)
        ) : allOrders
      );
    }, 300));
  }
}

function renderOrdersTable(orders) {
  const tbody = document.getElementById("orders-table-body");
  if (!tbody) return;

  if (!orders.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:gray;">
      No orders found</td></tr>`;
    return;
  }

  tbody.innerHTML = orders.map((o) => `
    <tr>
      <td><strong>${o.orderId || o.id}</strong></td>
      <td>
        <strong>${o.userName || "—"}</strong>
        <p style="font-size:11px;color:gray;">${o.userPhone || ""}</p>
      </td>
      <td>
        ${(o.items || []).slice(0, 2).map((i) =>
          `<p style="font-size:11px;">${i.name} ×${i.qty}</p>`).join("")}
        ${(o.items?.length || 0) > 2
          ? `<p style="font-size:10px;color:gray;">+${o.items.length - 2} more</p>` : ""}
      </td>
      <td><strong style="color:var(--clr-primary);">${formatPrice(o.total)}</strong></td>
      <td>
        <select class="status-select"
          onchange="updateOrderStatus('${o.id}', this.value)"
          style="border-color:${statusColor(o.status)};">
          ${["Pending","Confirmed","Packed","Shipped","Delivered","Cancelled"]
            .map((s) => `<option value="${s}" ${s === o.status ? "selected" : ""}>${s}</option>`)
            .join("")}
        </select>
      </td>
      <td style="font-size:11px;color:gray;">${formatDate(o.createdAt)}</td>
      <td>
        <button class="admin-table__action-btn admin-table__action-btn--view"
          onclick="viewOrderDetail('${o.id}')">👁 View</button>
      </td>
    </tr>`).join("");
}

async function updateOrderStatus(docId, status) {
  try {
    await updateDoc(doc(db, "orders", docId), { status, updatedAt: serverTimestamp() });
    showToast(`Status updated → ${status} ✓`);
  } catch (err) {
    showToast("Update failed: " + err.message, "error");
  }
}

async function viewOrderDetail(docId) {
  try {
    const snap = await getDoc(doc(db, "orders", docId));
    if (!snap.exists()) { showToast("Order not found", "error"); return; }
    const o       = { id: snap.id, ...snap.data() };
    const content = document.getElementById("order-detail-content");
    if (!content) return;

    content.innerHTML = `
      <div style="margin-bottom:1rem;">
        <p style="font-size:11px;color:gray;letter-spacing:.1em;text-transform:uppercase;">Order ID</p>
        <p style="font-weight:700;font-size:1.1rem;">${o.orderId || o.id}</p>
        <p style="font-size:11px;color:gray;">${formatDate(o.createdAt)}</p>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.25rem;">
        <div>
          <p style="font-size:11px;font-weight:700;text-transform:uppercase;color:gray;margin-bottom:.5rem;">Customer</p>
          <p><strong>${o.userName || "—"}</strong></p>
          <p>${o.userPhone || "—"}</p>
          <p style="font-size:12px;color:gray;">${o.userEmail || ""}</p>
        </div>
        <div>
          <p style="font-size:11px;font-weight:700;text-transform:uppercase;color:gray;margin-bottom:.5rem;">Address</p>
          <p style="font-size:13px;line-height:1.5;">${o.userAddress || "—"}</p>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--clr-bg-2);">
            <th style="padding:.6rem 1rem;text-align:left;">Product</th>
            <th style="padding:.6rem .5rem;text-align:right;">Size</th>
            <th style="padding:.6rem .5rem;text-align:right;">Qty</th>
            <th style="padding:.6rem 1rem;text-align:right;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${(o.items || []).map((item) => `
            <tr>
              <td style="padding:.6rem 1rem;border-bottom:1px solid var(--clr-border);">${item.name}</td>
              <td style="padding:.6rem .5rem;border-bottom:1px solid var(--clr-border);text-align:right;">${item.size || "—"}</td>
              <td style="padding:.6rem .5rem;border-bottom:1px solid var(--clr-border);text-align:right;">${item.qty}</td>
              <td style="padding:.6rem 1rem;border-bottom:1px solid var(--clr-border);text-align:right;">${formatPrice(item.price * item.qty)}</td>
            </tr>`).join("")}
          <tr>
            <td colspan="3" style="padding:.75rem 1rem;font-weight:700;">Grand Total</td>
            <td style="padding:.75rem 1rem;text-align:right;font-weight:700;
              color:var(--clr-primary);font-size:1.1rem;">${formatPrice(o.total)}</td>
          </tr>
        </tbody>
      </table>
    `;
    openModal("order-detail-modal");
  } catch (err) {
    console.error("viewOrderDetail error:", err);
    showToast("Failed to load order: " + err.message, "error");
  }
}

// ─── MODAL HELPERS ────────────────────────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("open");
  document.body.style.overflow = "";
}

function initModalClose() {
  // Close on overlay background click
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-overlay")) {
      e.target.classList.remove("open");
      document.body.style.overflow = "";
    }
  });
  // Close on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-overlay.open").forEach((m) => {
        m.classList.remove("open");
        document.body.style.overflow = "";
      });
    }
  });
}
