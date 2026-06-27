/**
 * app.js
 * Home Page Logic
 * Shree Panchmukhi Balaji Handloom
 */

import { initNavAuth } from "./auth.js";
import { listenCart } from "./cart.js";
import {
  renderProductGrid,
  getFeaturedProducts,
  getLatestProducts,
  getAllProducts,
  getProductsByCategory,
  renderProductCard,
  bindProductCardEvents,
  initSearchBar,
} from "./products.js";
import {
  initDarkMode,
  initScrollReveal,
  initStickyHeader,
  showToast,
  createSkeleton,
} from "./utils.js";

// ─── INIT ────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // ── UI init runs FIRST and independently — not affected by Firebase/import errors ──
  initDarkMode();
  initStickyHeader();
  initMobileNav();   // hamburger must work even if product fetch fails
  initBackToTop();
  initScrollReveal();

  // ── Auth & cart — safe, no heavy imports ──
  initNavAuth();

  // ── Search bar ──
  try { initSearchBar(); } catch(e) { console.warn("Search init failed:", e); }

  // ── Product sections — wrapped so a Firestore error doesn't kill the whole page ──
  loadFeatured().catch(console.error);
  loadLatest().catch(console.error);
  loadTrending().catch(console.error);

  // Category filter
  initCategoryFilter();

  // Cart badge realtime
  listenCart((items) => {
    const badge = document.querySelector(".cart-badge");
    if (badge) {
      badge.textContent = items.length > 99 ? "99+" : items.length;
      badge.style.display = items.length > 0 ? "flex" : "none";
    }
  });

  // Category page: ?cat=saree
  const urlParams = new URLSearchParams(window.location.search);
  const catParam = urlParams.get("cat");
  if (catParam) {
    filterByCategory(catParam);
    document.querySelector(`[data-cat="${catParam}"]`)?.click();
    document
      .getElementById("trending")
      ?.scrollIntoView({ behavior: "smooth" });
  }

  // Hero 3D card — show a random featured product
  loadHeroCard();
});

// ─── FEATURED PRODUCTS ───────────────────────────────────────────────────────
async function loadFeatured() {
  await renderProductGrid(
    "featured-products",
    () => getFeaturedProducts(8),
    "No featured products yet. Check back soon!"
  );
  initScrollReveal();
}

// ─── LATEST PRODUCTS ─────────────────────────────────────────────────────────
async function loadLatest() {
  await renderProductGrid(
    "latest-products",
    () => getLatestProducts(8),
    "No new arrivals yet!"
  );
  initScrollReveal();
}

// ─── TRENDING (all by default) ───────────────────────────────────────────────
let allProductsCache = [];

async function loadTrending(category = "all") {
  const container = document.getElementById("trending-products");
  if (!container) return;

  container.innerHTML = createSkeleton(8);

  try {
    let products;
    if (category === "all") {
      if (!allProductsCache.length) {
        allProductsCache = await getAllProducts();
      }
      products = allProductsCache;
    } else {
      products = await getProductsByCategory(category, 12);
    }

    if (!products.length) {
      container.innerHTML = `<p class="empty-state">No products in this category yet.</p>`;
      return;
    }

    container.innerHTML = products.map(renderProductCard).join("");
    bindProductCardEvents(container);
    initScrollReveal();
  } catch (err) {
    console.error("Trending load error:", err);
    container.innerHTML = `<p class="error-state">Could not load products. Please refresh.</p>`;
  }
}

// ─── CATEGORY FILTER ─────────────────────────────────────────────────────────
function initCategoryFilter() {
  const btns = document.querySelectorAll(".filter-btn");
  btns.forEach((btn) => {
    btn.addEventListener("click", () => {
      btns.forEach((b) => {
        b.classList.remove("btn--primary", "active");
        b.classList.add("btn--outline");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("btn--primary", "active");
      btn.classList.remove("btn--outline");
      btn.setAttribute("aria-selected", "true");

      const cat = btn.dataset.cat;
      loadTrending(cat);
    });
  });
}

async function filterByCategory(cat) {
  const btn = document.querySelector(`[data-cat="${cat}"]`);
  if (btn) btn.click();
}

// ─── HERO CARD ────────────────────────────────────────────────────────────────
async function loadHeroCard() {
  try {
    const products = await getFeaturedProducts(1);
    if (!products.length) return;
    const p = products[0];
    const nameEl = document.getElementById("hero-card-name");
    const priceEl = document.getElementById("hero-card-price");
    const imgEl = document.querySelector(".hero__3d-card img");

    if (nameEl) nameEl.textContent = p.name;
    if (priceEl) priceEl.textContent = `₹${p.price.toLocaleString("en-IN")}`;
    if (imgEl && p.images?.[0]) {
      imgEl.src = p.images[0];
      imgEl.alt = p.name;
    }
  } catch (_) {
    // Fail silently — hero card is decorative
  }
}

// ─── MOBILE NAV ───────────────────────────────────────────────────────────────
function initMobileNav() {
  const hamburger = document.getElementById("hamburger");
  const mobileNav = document.getElementById("mobile-nav");
  const overlay = document.getElementById("mobile-overlay");
  const closeBtn = document.getElementById("mobile-close");

  function openNav() {
    mobileNav?.classList.add("open");
    overlay?.classList.add("show");
    hamburger?.classList.add("open");
    hamburger?.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }

  function closeNav() {
    mobileNav?.classList.remove("open");
    overlay?.classList.remove("show");
    hamburger?.classList.remove("open");
    hamburger?.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  hamburger?.addEventListener("click", openNav);
  closeBtn?.addEventListener("click", closeNav);
  overlay?.addEventListener("click", closeNav);

  // Close on nav link tap
  mobileNav?.querySelectorAll(".mobile-nav__link").forEach((link) => {
    link.addEventListener("click", closeNav);
  });

  // Keyboard: Escape closes nav
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeNav();
  });
}

// ─── BACK TO TOP ─────────────────────────────────────────────────────────────
function initBackToTop() {
  const btn = document.getElementById("back-to-top");
  if (!btn) return;

  window.addEventListener("scroll", () => {
    if (window.scrollY > 400) {
      btn.classList.add("show");
    } else {
      btn.classList.remove("show");
    }
  });

  btn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}
