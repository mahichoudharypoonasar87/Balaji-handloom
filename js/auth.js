/**
 * products.js
 * Product Listing, Filtering, Search
 * Shree Panchmukhi Balaji Handloom
 */

import { db } from "./firebase.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { addToCart } from "./cart.js";
import { addToWishlist, isWishlisted } from "./wishlist.js";
import {
  calcDiscount,
  formatPrice,
  renderStars,
  truncate,
  createSkeleton,
  showToast,
  productImageHtml,
} from "./utils.js";

// ─── PRODUCT CARD HTML ───────────────────────────────────────────────────────
export function renderProductCard(product) {
  const discount = calcDiscount(product.mrp, product.price);
  const mainImage = product.images?.[0] || "";
  const hoverImage = product.images?.[1] || mainImage;

  return `
    <article class="product-card glass-card reveal" data-id="${product.id}" aria-label="${product.name}">
      <a href="product.html?id=${product.id}" class="product-card__img-link" tabindex="-1" aria-hidden="true">
        <div class="product-card__img-wrap">
          ${productImageHtml(mainImage, product.name, "product-card__img", `data-hover="${hoverImage}" width="400" height="500"`)}
          ${discount > 0 ? `<span class="discount-badge" aria-label="${discount}% off">${discount}% OFF</span>` : ""}
          ${product.stock === 0 ? `<span class="out-of-stock-badge">Out of Stock</span>` : ""}
          <button
            class="wishlist-btn"
            data-id="${product.id}"
            aria-label="Add to wishlist"
            title="Add to Wishlist"
          >♡</button>
        </div>
      </a>
      <div class="product-card__body">
        <p class="product-card__category">${product.category || "Handloom"}</p>
        <h3 class="product-card__name">
          <a href="product.html?id=${product.id}">${truncate(product.name, 50)}</a>
        </h3>
        <p class="product-card__desc">${truncate(product.description, 70)}</p>
        <div class="product-card__rating" aria-label="Rating: ${product.rating} out of 5">
          <span class="stars">${renderStars(product.rating || 4)}</span>
          <span class="rating-count">(${product.reviews || 0})</span>
        </div>
        <div class="product-card__pricing">
          <span class="price">${formatPrice(product.price)}</span>
          ${product.mrp > product.price ? `<span class="mrp">${formatPrice(product.mrp)}</span>` : ""}
        </div>
        <p class="product-card__stock ${product.stock < 10 ? "stock--low" : ""}">
          ${product.stock === 0 ? "Out of Stock" : product.stock < 10 ? `Only ${product.stock} left!` : "In Stock"}
        </p>
        <div class="product-card__actions">
          <a href="product.html?id=${product.id}" class="btn btn--outline btn--sm">
            View Details
          </a>
          <button
            class="btn btn--primary btn--sm add-to-cart-btn"
            data-id="${product.id}"
            ${product.stock === 0 ? "disabled" : ""}
            aria-label="Add ${product.name} to cart"
          >
            Add to Cart
          </button>
        </div>
      </div>
    </article>
  `;
}

// ─── BIND PRODUCT CARD EVENTS ────────────────────────────────────────────────
export function bindProductCardEvents(container) {
  // Image hover effect
  container.querySelectorAll(".product-card__img").forEach((img) => {
    const hover = img.dataset.hover;
    if (hover && hover !== img.src) {
      img.addEventListener("mouseenter", () => (img.src = hover));
      img.addEventListener("mouseleave", () => (img.src = img.getAttribute("src")));
    }
  });

  // Add to Cart
  container.querySelectorAll(".add-to-cart-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const card = btn.closest(".product-card");
      const id = btn.dataset.id;
      btn.disabled = true;
      btn.textContent = "Adding…";
      try {
        const product = await getProductById(id);
        if (product) {
          // Check if product has sizes
          if (product.sizes?.length > 0) {
            window.location.href = `product.html?id=${id}`;
            return;
          }
          await addToCart(product);
        }
      } catch (err) {
        showToast("Failed to add to cart", "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "Add to Cart";
      }
    });
  });

  // Wishlist
  container.querySelectorAll(".wishlist-btn").forEach(async (btn) => {
    const id = btn.dataset.id;
    // Check if already wishlisted
    const wishlisted = await isWishlisted(id);
    if (wishlisted) {
      btn.textContent = "♥";
      btn.classList.add("wishlist-btn--active");
    }
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      await addToWishlist(id);
      btn.textContent = btn.textContent === "♡" ? "♥" : "♡";
      btn.classList.toggle("wishlist-btn--active");
    });
  });
}

// ─── GET SINGLE PRODUCT ──────────────────────────────────────────────────────
export async function getProductById(id) {
  const { doc, getDoc } = await import(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
  );
  const snap = await getDoc(doc(db, "products", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ─── FETCH FEATURED PRODUCTS ─────────────────────────────────────────────────
export async function getFeaturedProducts(maxCount = 8) {
  const q = query(
    collection(db, "products"),
    where("featured", "==", true),
    limit(maxCount)
  );
  const snap = await getDocs(q);
  // Client-side filter: stock > 0
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p.stock > 0)
    .slice(0, maxCount);
}

// ─── FETCH LATEST PRODUCTS ───────────────────────────────────────────────────
export async function getLatestProducts(maxCount = 8) {
  const q = query(
    collection(db, "products"),
    orderBy("createdAt", "desc"),
    limit(maxCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── FETCH PRODUCTS BY CATEGORY ──────────────────────────────────────────────
export async function getProductsByCategory(category, maxCount = 12) {
  const q = query(
    collection(db, "products"),
    where("category", "==", category),
    orderBy("createdAt", "desc"),
    limit(maxCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── FETCH ALL PRODUCTS (for search) ─────────────────────────────────────────
export async function getAllProducts() {
  const snap = await getDocs(collection(db, "products"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── SEARCH PRODUCTS (client-side) ───────────────────────────────────────────
export function searchProducts(products, query) {
  const q = query.toLowerCase();
  return products.filter(
    (p) =>
      p.name?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q)
  );
}

// ─── RENDER PRODUCT GRID ─────────────────────────────────────────────────────
export async function renderProductGrid(containerId, fetchFn, emptyMsg = "No products found") {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Show skeleton
  container.innerHTML = createSkeleton(4);

  try {
    const products = await fetchFn();
    if (products.length === 0) {
      container.innerHTML = `<p class="empty-state">${emptyMsg}</p>`;
      return;
    }
    container.innerHTML = products.map(renderProductCard).join("");
    bindProductCardEvents(container);

    // Scroll reveal
    const { initScrollReveal } = await import("./utils.js");
    initScrollReveal();
  } catch (err) {
    console.error("Product fetch error:", err);
    container.innerHTML = `<p class="error-state">Failed to load products. Please refresh.</p>`;
  }
}

// ─── INIT SEARCH BAR ─────────────────────────────────────────────────────────
export function initSearchBar() {
  const input = document.getElementById("search-input");
  const dropdown = document.getElementById("search-dropdown");
  if (!input || !dropdown) return;

  let allProducts = [];

  // Pre-load products for search
  getAllProducts().then((p) => (allProducts = p));

  const { debounce } = await import("./utils.js");

  input.addEventListener(
    "input",
    debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) {
        dropdown.innerHTML = "";
        dropdown.style.display = "none";
        return;
      }
      const results = searchProducts(allProducts, q).slice(0, 6);
      if (results.length === 0) {
        dropdown.innerHTML = `<p class="search-no-results">No products found for "${q}"</p>`;
      } else {
        dropdown.innerHTML = results
          .map(
            (p) => `
          <a href="product.html?id=${p.id}" class="search-result-item">
            ${productImageHtml(p.images?.[0] || "", p.name, "search-result-img")}
            <div class="search-result-info">
              <span class="search-result-name">${p.name}</span>
              <span class="search-result-price">${formatPrice(p.price)}</span>
            </div>
          </a>
        `
          )
          .join("");
      }
      dropdown.style.display = "block";
    }, 300)
  );

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = "none";
    }
  });

  // Submit search form
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      dropdown.style.display = "none";
    }
  });
}
