/**
 * wishlist.js
 * Wishlist Functions — extracted from profile.js to break circular dependency
 * products.js → profile.js → products.js circular import was causing:
 *   1. Products not loading (module init failure)
 *   2. Login redirect on home page (auth side-effect firing unexpectedly)
 *   3. Hamburger menu not working (JS crash before event listeners attached)
 */

import { auth, db } from "./firebase.js";
import {
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  collection,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from "./utils.js";

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
