/**
 * product.js
 * Single Product Page Logic
 * Shree Panchmukhi Balaji Handloom
 */

import { initNavAuth } from "./auth.js";
import { auth } from "./firebase.js";
import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { addToCart } from "./cart.js";
import { addToWishlist, removeFromWishlist, isWishlisted } from "./profile.js";
import { renderProductCard, bindProductCardEvents } from "./products.js";
import {
  calcDiscount,
  formatPrice,
  renderStars,
  showToast,
  initDarkMode,
  initStickyHeader,
  initScrollReveal,
} from "./utils.js";

// ─── STATE ───────────────────────────────────────────────────────────────────
let currentProduct = null;
let selectedSize = "";
let currentQty = 1;

// ─── INIT ────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  initDarkMode();
  initNavAuth();
  initStickyHeader();

  const params = new URLSearchParams(window.location.search);
  const productId = params.get("id");

  if (!productId) {
    showNotFound();
    return;
  }

  await loadProduct(productId);
  initTabs();
  initMobileNav();
});

// ─── LOAD PRODUCT ─────────────────────────────────────────────────────────────
async function loadProduct(id) {
  const loadingEl = document.getElementById("product-loading");
  const contentEl = document.getElementById("product-content");
  const notFoundEl = document.getElementById("product-not-found");

  try {
    const snap = await getDoc(doc(db, "products", id));

    if (!snap.exists()) {
      loadingEl.style.display = "none";
      notFoundEl.style.display = "block";
      return;
    }

    currentProduct = { id: snap.id, ...snap.data() };
    loadingEl.style.display = "none";
    contentEl.style.display = "block";

    renderProduct(currentProduct);
    loadRelated(currentProduct.category, id);
    initScrollReveal();
  } catch (err) {
    console.error("Product load error:", err);
    loadingEl.style.display = "none";
    notFoundEl.style.display = "block";
  }
}

// ─── RENDER PRODUCT ───────────────────────────────────────────────────────────
async function renderProduct(p) {
  // Page title + meta
  document.title = `${p.name} | Balaji Handloom`;
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute("content", p.description?.slice(0, 160) || p.name);

  // Breadcrumb
  document.getElementById("breadcrumb-cat").textContent = p.category || "Products";
  document.getElementById("breadcrumb-name").textContent = p.name;

  // Category badge
  document.getElementById("product-category").textContent = p.category || "Handloom";

  // Title
  document.getElementById("product-title").textContent = p.name;

  // Rating
  const ratingEl = document.getElementById("product-rating");
  ratingEl.innerHTML = `
    <span class="stars">${renderStars(p.rating || 4)}</span>
    <span class="rating-count" style="font-size:var(--text-sm); color:var(--clr-text-muted);">
      ${p.rating || 4}/5 (${p.reviews || 0} reviews)
    </span>
  `;

  // Pricing
  document.getElementById("product-price").textContent = formatPrice(p.price);

  if (p.mrp && p.mrp > p.price) {
    const discount = calcDiscount(p.mrp, p.price);
    const saved = p.mrp - p.price;

    const mrpEl = document.getElementById("product-mrp");
    mrpEl.textContent = formatPrice(p.mrp);
    mrpEl.style.display = "inline";

    const savedEl = document.getElementById("product-saved");
    savedEl.textContent = `Save ${formatPrice(saved)}`;
    savedEl.style.display = "inline-flex";

    const badge = document.getElementById("product-discount-badge");
    badge.textContent = `${discount}% OFF`;
    badge.style.display = "block";
  }

  // Short description
  document.getElementById("product-short-desc").textContent =
    p.description?.slice(0, 200) || "";

  // Full description (tab)
  document.getElementById("product-full-desc").textContent =
    p.description || "No description available.";

  // Stock
  const stockEl = document.getElementById("product-stock");
  if (p.stock === 0) {
    stockEl.textContent = "Out of Stock";
    stockEl.style.color = "var(--clr-error)";
  } else if (p.stock < 10) {
    stockEl.textContent = `Only ${p.stock} left!`;
    stockEl.style.color = "var(--clr-warning)";
  } else {
    stockEl.textContent = "In Stock ✓";
    stockEl.style.color = "var(--clr-success)";
  }

  // Gallery
  renderGallery(p.images || []);

  // Sizes
  renderSizes(p.sizes || []);

  // Enable Add to Cart btn
  const cartBtn = document.getElementById("add-to-cart-btn");
  if (p.stock > 0) {
    cartBtn.disabled = false;
    // If no sizes, enable immediately
    if (!p.sizes?.length) {
      selectedSize = "";
    }
  } else {
    cartBtn.disabled = true;
    cartBtn.textContent = "Out of Stock";
  }

  // Add to Cart click
  cartBtn.addEventListener("click", async () => {
    if (p.sizes?.length && !selectedSize) {
      showToast("Please select a size", "error");
      document.getElementById("size-section").scrollIntoView({ behavior: "smooth" });
      return;
    }
    cartBtn.disabled = true;
    cartBtn.innerHTML = `<span class="spinner spinner--sm"></span> Adding…`;
    try {
      await addToCart(p, selectedSize, currentQty);
    } finally {
      cartBtn.disabled = false;
      cartBtn.innerHTML = `<span>🛒</span> Add to Cart`;
    }
  });

  // Wishlist
  initWishlist(p.id);

  // Share
  initShare(p);

  // Qty controls
  initQtyControls(p.stock);
}

// ─── GALLERY ─────────────────────────────────────────────────────────────────
function renderGallery(images) {
  if (!images.length) {
    images = ["assets/images/placeholder.webp"];
  }

  const mainImg = document.getElementById("main-img");
  const thumbsContainer = document.getElementById("product-thumbnails");

  mainImg.src = images[0];
  mainImg.alt = currentProduct?.name || "Product image";

  thumbsContainer.innerHTML = images
    .map(
      (src, i) => `
    <img
      src="${src}"
      alt="${currentProduct?.name || "Product"} image ${i + 1}"
      class="product-thumb ${i === 0 ? "active" : ""}"
      data-src="${src}"
      loading="lazy"
      role="button"
      tabindex="0"
      width="80" height="80"
    />
  `
    )
    .join("");

  // Thumbnail click
  thumbsContainer.querySelectorAll(".product-thumb").forEach((thumb) => {
    const activate = () => {
      mainImg.src = thumb.dataset.src;
      thumbsContainer
        .querySelectorAll(".product-thumb")
        .forEach((t) => t.classList.remove("active"));
      thumb.classList.add("active");
    };
    thumb.addEventListener("click", activate);
    thumb.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") activate();
    });
  });
}

// ─── SIZES ───────────────────────────────────────────────────────────────────
function renderSizes(sizes) {
  const sizeSection = document.getElementById("size-section");
  const sizeOptions = document.getElementById("size-options");

  if (!sizes.length) {
    sizeSection.style.display = "none";
    return;
  }

  sizeSection.style.display = "block";
  sizeOptions.innerHTML = sizes
    .map(
      (s) => `
    <button class="size-btn" data-size="${s}" aria-label="Size ${s}" role="radio" aria-checked="false">
      ${s}
    </button>
  `
    )
    .join("");

  sizeOptions.querySelectorAll(".size-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      sizeOptions.querySelectorAll(".size-btn").forEach((b) => {
        b.classList.remove("selected");
        b.setAttribute("aria-checked", "false");
      });
      btn.classList.add("selected");
      btn.setAttribute("aria-checked", "true");
      selectedSize = btn.dataset.size;
    });
  });
}

// ─── QUANTITY ────────────────────────────────────────────────────────────────
function initQtyControls(maxStock) {
  const input = document.getElementById("qty-input");
  const dec = document.getElementById("qty-dec");
  const inc = document.getElementById("qty-inc");

  input.max = Math.min(maxStock, 10);

  dec.addEventListener("click", () => {
    if (currentQty > 1) {
      currentQty--;
      input.value = currentQty;
    }
  });

  inc.addEventListener("click", () => {
    if (currentQty < Math.min(maxStock, 10)) {
      currentQty++;
      input.value = currentQty;
    } else {
      showToast(`Maximum ${Math.min(maxStock, 10)} items allowed`, "error");
    }
  });

  input.addEventListener("change", () => {
    const val = parseInt(input.value);
    if (isNaN(val) || val < 1) {
      currentQty = 1;
    } else if (val > Math.min(maxStock, 10)) {
      currentQty = Math.min(maxStock, 10);
    } else {
      currentQty = val;
    }
    input.value = currentQty;
  });
}

// ─── WISHLIST ────────────────────────────────────────────────────────────────
async function initWishlist(productId) {
  const btn = document.getElementById("wishlist-btn-main");
  if (!btn) return;

  const wishlisted = await isWishlisted(productId);
  updateWishlistBtn(btn, wishlisted);

  btn.addEventListener("click", async () => {
    const current = btn.dataset.wishlisted === "true";
    if (current) {
      await removeFromWishlist(productId);
      updateWishlistBtn(btn, false);
    } else {
      await addToWishlist(productId);
      updateWishlistBtn(btn, true);
    }
  });
}

function updateWishlistBtn(btn, wishlisted) {
  btn.dataset.wishlisted = wishlisted;
  btn.innerHTML = wishlisted
    ? `<span>♥</span> Remove from Wishlist`
    : `<span>♡</span> Add to Wishlist`;
  btn.classList.toggle("btn--primary", wishlisted);
  btn.classList.toggle("btn--outline", !wishlisted);
}

// ─── SHARE ───────────────────────────────────────────────────────────────────
function initShare(p) {
  const waBtn = document.getElementById("share-wa");
  const copyBtn = document.getElementById("share-copy");
  const url = window.location.href;

  waBtn?.addEventListener("click", () => {
    const msg = `Check out this product from Balaji Handloom!\n\n*${p.name}*\nPrice: ${formatPrice(p.price)}\n\n${url}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(msg)}`,
      "_blank",
      "noopener"
    );
  });

  copyBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied to clipboard! 🔗");
    } catch {
      showToast("Could not copy link", "error");
    }
  });
}

// ─── TABS ────────────────────────────────────────────────────────────────────
function initTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabPanels = document.querySelectorAll(".tab-panel");

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
      document.getElementById(`panel-${target}`)?.classList.add("active");
    });
  });
}

// ─── RELATED PRODUCTS ────────────────────────────────────────────────────────
async function loadRelated(category, excludeId) {
  const container = document.getElementById("related-products");
  if (!container || !category) return;

  try {
    const q = query(
      collection(db, "products"),
      where("category", "==", category),
      limit(5)
    );
    const snap = await getDocs(q);
    const products = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => p.id !== excludeId)
      .slice(0, 4);

    if (!products.length) {
      container.closest("div").style.display = "none";
      return;
    }

    container.innerHTML = products.map(renderProductCard).join("");
    bindProductCardEvents(container);
    initScrollReveal();
  } catch (err) {
    console.error("Related products error:", err);
  }
}

// ─── NOT FOUND ───────────────────────────────────────────────────────────────
function showNotFound() {
  document.getElementById("product-loading").style.display = "none";
  document.getElementById("product-not-found").style.display = "block";
}

// ─── MOBILE NAV ───────────────────────────────────────────────────────────────
function initMobileNav() {
  const hamburger = document.getElementById("hamburger");
  if (!hamburger) return;
  hamburger.addEventListener("click", () => {
    showToast("Use the back button to explore more", "info");
  });
}
