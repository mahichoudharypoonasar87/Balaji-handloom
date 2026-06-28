// firestore.rules
// Shree Panchmukhi Balaji Handloom
// Firebase Firestore Security Rules

rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // ─── HELPER FUNCTIONS ─────────────────────────────────────────────────
    function isLoggedIn() {
      return request.auth != null;
    }

    function isOwner(uid) {
      return isLoggedIn() && request.auth.uid == uid;
    }

    function isAdmin() {
      return isLoggedIn() &&
        exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }

    function isValidProduct() {
      let data = request.resource.data;
      return data.keys().hasAll(['name', 'price', 'mrp', 'stock', 'category']) &&
        data.name is string && data.name.size() > 0 &&
        data.price is number && data.price > 0 &&
        data.mrp is number && data.mrp >= data.price &&
        data.stock is int && data.stock >= 0;
    }

    function isValidOrder() {
      let data = request.resource.data;
      return data.keys().hasAll(['userId', 'items', 'total', 'status']) &&
        data.userId == request.auth.uid &&
        data.items is list && data.items.size() > 0 &&
        data.total is number && data.total > 0;
    }

    // ─── PRODUCTS ──────────────────────────────────────────────────────────
    // Anyone can read products
    // Only admins can create / update / delete
    match /products/{productId} {
      allow read: if true;
      allow create: if isAdmin() && isValidProduct();
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }

    // ─── USERS ─────────────────────────────────────────────────────────────
    // Users can read and write their own profile
    // Admins can read all profiles
    // No one can set isAdmin via client (only via Firebase Console)
    match /users/{uid} {
      allow read: if isOwner(uid) || isAdmin();
      allow create: if isOwner(uid) &&
        !request.resource.data.keys().hasAny(['isAdmin']);
      allow update: if isOwner(uid) &&
        !request.resource.data.keys().hasAny(['isAdmin']);
    }

    // ─── ORDERS ────────────────────────────────────────────────────────────
    // Users can create their own orders and read their own orders
    // Admins can read and update all orders (for status updates)
    match /orders/{orderId} {
      allow read: if isLoggedIn() &&
        (resource.data.userId == request.auth.uid || isAdmin());
      allow create: if isLoggedIn() && isValidOrder();
      allow update: if isAdmin() ||
        // User can only cancel their own pending order
        (isLoggedIn() &&
          resource.data.userId == request.auth.uid &&
          resource.data.status == 'Pending' &&
          request.resource.data.status == 'Cancelled' &&
          request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status']));
      allow delete: if isAdmin();
    }

    // ─── CART ──────────────────────────────────────────────────────────────
    // Users can only access their own cart
    match /cart/{uid}/{document=**} {
      allow read, write: if isOwner(uid);
    }

    // ─── WISHLIST ───────────────────────────────────────────────────────────
    // Users can only access their own wishlist
    match /wishlist/{uid}/{document=**} {
      allow read, write: if isOwner(uid);
    }

    // ─── REVIEWS (future) ───────────────────────────────────────────────────
    match /reviews/{reviewId} {
      allow read: if true;
      allow create: if isLoggedIn() &&
        request.resource.data.userId == request.auth.uid;
      allow update, delete: if isLoggedIn() &&
        resource.data.userId == request.auth.uid;
    }

    // ─── DEFAULT DENY ───────────────────────────────────────────────────────
    // Block all other paths not explicitly defined
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
