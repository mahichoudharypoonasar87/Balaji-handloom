/**
 * utils.js
 * Shared Utility Functions
 * Shree Panchmukhi Balaji Handloom
 */

// ─── DISCOUNT CALCULATOR ─────────────────────────────────────────────────────
/**
 * Calculate discount percentage from MRP and selling price
 * @param {number} mrp - Maximum Retail Price
 * @param {number} price - Selling Price
 * @returns {number} discount percentage (rounded)
 */
export function calcDiscount(mrp, price) {
  if (!mrp || !price || mrp <= price) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}

// ─── PRICE FORMATTER ─────────────────────────────────────────────────────────
export function formatPrice(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ─── STAR RATING HTML ────────────────────────────────────────────────────────
export function renderStars(rating) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return (
    "★".repeat(full) +
    (half ? "½" : "") +
    "☆".repeat(empty)
  );
}

// ─── TOAST NOTIFICATION ──────────────────────────────────────────────────────
export function showToast(message, type = "success") {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span class="toast__icon">${type === "success" ? "✓" : type === "error" ? "✕" : "ℹ"}</span>
    <span class="toast__msg">${message}</span>
  `;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("toast--show"));
  setTimeout(() => {
    toast.classList.remove("toast--show");
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// ─── IMAGE COMPRESSION ───────────────────────────────────────────────────────
/**
 * Compress image to WebP, max 200KB
 * @param {File} file - input image file
 * @returns {Promise<Blob>} compressed blob
 */
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const MAX_SIZE = 200 * 1024; // 200KB

    if (file.size > 5 * 1024 * 1024) {
      return reject(new Error("File too large. Maximum 5MB allowed for upload."));
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;

        // Max 1200px width
        const MAX_W = 1200;
        if (width > MAX_W) {
          height = Math.round((height * MAX_W) / width);
          width = MAX_W;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // Try quality levels until under 200KB
        let quality = 0.85;
        const tryCompress = () => {
          canvas.toBlob(
            (blob) => {
              if (blob.size <= MAX_SIZE || quality <= 0.1) {
                resolve(blob);
              } else {
                quality -= 0.1;
                tryCompress();
              }
            },
            "image/webp",
            quality
          );
        };
        tryCompress();
      };
      img.onerror = () => reject(new Error("Image load failed"));
    };
    reader.onerror = () => reject(new Error("File read failed"));
  });
}

// ─── GENERATE ORDER ID ───────────────────────────────────────────────────────
export function generateOrderId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BH-${ts}-${rand}`;
}

// ─── DEBOUNCE ─────────────────────────────────────────────────────────────────
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ─── TRUNCATE TEXT ───────────────────────────────────────────────────────────
export function truncate(str, maxLen = 60) {
  return str && str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
}

// ─── DATE FORMATTER ──────────────────────────────────────────────────────────
export function formatDate(timestamp) {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// ─── ORDER STATUS COLOR ──────────────────────────────────────────────────────
export function statusColor(status) {
  const map = {
    Pending: "#f59e0b",
    Confirmed: "#3b82f6",
    Packed: "#8b5cf6",
    Shipped: "#06b6d4",
    Delivered: "#10b981",
    Cancelled: "#ef4444",
  };
  return map[status] || "#6b7280";
}

// ─── CART COUNT BADGE ────────────────────────────────────────────────────────
export function updateCartBadge(count) {
  const badge = document.querySelector(".cart-badge");
  if (!badge) return;
  badge.textContent = count > 99 ? "99+" : count;
  badge.style.display = count > 0 ? "flex" : "none";
}

// ─── WISHLIST COUNT BADGE ────────────────────────────────────────────────────
export function updateWishlistBadge(count) {
  const badge = document.querySelector(".wishlist-badge");
  if (!badge) return;
  badge.textContent = count > 99 ? "99+" : count;
  badge.style.display = count > 0 ? "flex" : "none";
}

// ─── DARK MODE ───────────────────────────────────────────────────────────────
export function initDarkMode() {
  const saved = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);

  const toggle = document.querySelector(".theme-toggle");
  if (toggle) {
    toggle.setAttribute("aria-label", `Switch to ${saved === "dark" ? "light" : "dark"} mode`);
    toggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme");
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
      toggle.setAttribute("aria-label", `Switch to ${next === "dark" ? "light" : "dark"} mode`);
    });
  }
}

// ─── SKELETON LOADER ─────────────────────────────────────────────────────────
export function createSkeleton(count = 4, type = "product") {
  return Array.from({ length: count })
    .map(
      () => `
    <div class="skeleton-card" aria-hidden="true">
      <div class="skeleton skeleton--image"></div>
      <div class="skeleton skeleton--title"></div>
      <div class="skeleton skeleton--text"></div>
      <div class="skeleton skeleton--price"></div>
    </div>
  `
    )
    .join("");
}

// ─── SCROLL REVEAL ───────────────────────────────────────────────────────────
export function initScrollReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
  );

  document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
}

// ─── SMOOTH SCROLL TO ANCHOR ─────────────────────────────────────────────────
export function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const target = document.querySelector(a.getAttribute("href"));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

// ─── STICKY HEADER ───────────────────────────────────────────────────────────
export function initStickyHeader() {
  const header = document.querySelector(".header");
  if (!header) return;
  let lastY = 0;
  window.addEventListener(
    "scroll",
    debounce(() => {
      const y = window.scrollY;
      if (y > 80) {
        header.classList.add("header--scrolled");
      } else {
        header.classList.remove("header--scrolled");
      }
      if (y > lastY && y > 200) {
        header.classList.add("header--hidden");
      } else {
        header.classList.remove("header--hidden");
      }
      lastY = y;
    }, 50)
  );
}
