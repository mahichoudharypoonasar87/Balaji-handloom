// storage.rules
// Shree Panchmukhi Balaji Handloom
// Firebase Storage Security Rules

rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {

    // ─── HELPER FUNCTIONS ──────────────────────────────────────────────────
    function isLoggedIn() {
      return request.auth != null;
    }

    function isAdmin() {
      return isLoggedIn() &&
        firestore.exists(/databases/(default)/documents/users/$(request.auth.uid)) &&
        firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }

    function isOwner(uid) {
      return isLoggedIn() && request.auth.uid == uid;
    }

    function isValidImage() {
      return request.resource.contentType.matches('image/.*') &&
        request.resource.size <= 5 * 1024 * 1024; // 5MB raw max (compressed to 200KB by JS)
    }

    // ─── PRODUCT IMAGES ─────────────────────────────────────────────────────
    // Only admins can upload, update, or delete product images
    // Anyone can read (public CDN)
    match /products/{productId}/{filename} {
      allow read: if true;
      allow write: if isAdmin() && isValidImage();
      allow delete: if isAdmin();
    }

    // ─── USER AVATARS ────────────────────────────────────────────────────────
    // Users can read/write only their own avatar
    match /users/{uid}/{filename} {
      allow read: if true; // avatars are public
      allow write: if isOwner(uid) && isValidImage();
      allow delete: if isOwner(uid);
    }

    // ─── DEFAULT DENY ────────────────────────────────────────────────────────
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
