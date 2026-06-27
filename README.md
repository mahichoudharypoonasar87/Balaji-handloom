# 🛕 Shree Panchmukhi Balaji Handloom
### Premium Handloom Clothing Store — Poonasar, Rajasthan

> A production-ready, full-stack eCommerce web app built with HTML5, CSS3, Vanilla JS, and Firebase.  
> Deployed on Vercel. Zero backend server. 100% Firebase powered.

---

## 📦 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, ES6 Modules |
| Auth | Firebase Authentication |
| Database | Firebase Firestore |
| Storage | Firebase Storage |
| Hosting | Vercel |
| Source Control | GitHub |
| Payments / Orders | WhatsApp API (wa.me) |

---

## 🗂️ Folder Structure

```
/
├── index.html            → Home Page
├── login.html            → Login Page
├── signup.html           → Signup Page
├── profile.html          → User Profile + Order History
├── cart.html             → Cart + Checkout (WhatsApp)
├── product.html          → Single Product Page
├── orders.html           → Order Tracking
├── admin.html            → Admin Panel
│
├── css/
│   ├── style.css         → Main Styles (Glassmorphism + 3D)
│   ├── responsive.css    → Mobile / Tablet Breakpoints
│   ├── animation.css     → All Animations & Transitions
│   └── admin.css         → Admin Panel Styles
│
├── js/
│   ├── firebase.js       → Firebase Config & Init
│   ├── auth.js           → Auth (Login / Signup / Google / Logout)
│   ├── app.js            → Main App Logic (Home Page)
│   ├── cart.js           → Cart Logic
│   ├── products.js       → Products Listing
│   ├── product.js        → Single Product Page Logic
│   ├── admin.js          → Admin Panel Logic
│   ├── checkout.js       → Checkout + WhatsApp Order
│   ├── order.js          → Order Tracking
│   ├── profile.js        → Profile Management
│   └── utils.js          → Shared Utilities
│
├── assets/
│   ├── images/           → Static Images
│   └── icons/            → SVG / PNG Icons
│
├── firebase/
│   ├── firestore.rules   → Firestore Security Rules
│   └── storage.rules     → Firebase Storage Security Rules
│
└── README.md             → This File
```

---

## 🔥 Step 1 — Create a Firebase Project

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Add Project"**
3. Enter project name: `balaji-handloom`
4. Disable Google Analytics (optional)
5. Click **"Create Project"**

---

## 🔐 Step 2 — Enable Firebase Authentication

1. In Firebase Console → **Authentication** → **Get Started**
2. Click **"Sign-in method"** tab
3. Enable **Email/Password** → Save
4. Enable **Google** → Select your support email → Save
5. Under **Settings** → **Authorized Domains**, add your Vercel domain later

---

## 🗃️ Step 3 — Create Firestore Database

1. In Firebase Console → **Firestore Database** → **Create Database**
2. Choose **Production Mode** (we use custom rules)
3. Select region: `asia-south1` (Mumbai) for India
4. Click **Enable**

### Firestore Collections Structure:

```
/products/{productId}
  - name: string
  - description: string
  - mrp: number
  - price: number
  - category: string
  - collection: string
  - stock: number
  - rating: number
  - featured: boolean
  - images: array<string>  ← Firebase Storage URLs
  - sizes: array<string>
  - createdAt: timestamp

/users/{uid}
  - name: string
  - email: string
  - phone: string
  - address: string
  - city: string
  - state: string
  - pincode: string
  - photoURL: string
  - isAdmin: boolean
  - createdAt: timestamp

/orders/{orderId}
  - userId: string
  - userName: string
  - userPhone: string
  - userAddress: string
  - items: array<{productId, name, qty, price, size}>
  - total: number
  - status: "Pending" | "Confirmed" | "Packed" | "Shipped" | "Delivered" | "Cancelled"
  - createdAt: timestamp

/wishlist/{uid}/items/{productId}
  - productId: string
  - addedAt: timestamp

/cart/{uid}/items/{productId}
  - productId: string
  - qty: number
  - size: string
```

---

## 🗄️ Step 4 — Create Firebase Storage

1. In Firebase Console → **Storage** → **Get Started**
2. Start in **Production Mode**
3. Select region: `asia-south1`
4. Click **Done**

### Storage Folder Structure:
```
/products/{productId}/{filename}.webp
/users/{uid}/avatar.webp
```

---

## ⚙️ Step 5 — Update `js/firebase.js`

After creating the project:

1. Go to Firebase Console → Project Settings (⚙️ icon)
2. Scroll to **"Your apps"** → Click **Web** icon (`</>`)
3. Register app name: `balaji-handloom-web`
4. Copy the config object
5. Paste it in `js/firebase.js`:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

---

## 👑 Step 6 — Create Admin User

1. Go to Firebase Console → **Authentication** → **Users**
2. Click **"Add User"**
3. Email: `admin@balaji.com` | Password: `Admin@2024`
4. Copy the **UID** of this user
5. Go to **Firestore** → `users` collection → Add document with this UID
6. Set field: `isAdmin: true`

Or run this in browser console after logging in as admin:
```javascript
// Paste in browser console on your deployed site
import { db } from './js/firebase.js';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.x.x/firebase-firestore.js';
await setDoc(doc(db, 'users', 'YOUR_ADMIN_UID'), { isAdmin: true }, { merge: true });
```

---

## 📤 Step 7 — Push Code to GitHub

```bash
# Initialize git
git init
git add .
git commit -m "Initial commit - Balaji Handloom Store"

# Create repo on GitHub then:
git remote add origin https://github.com/YOUR_USERNAME/balaji-handloom.git
git branch -M main
git push -u origin main
```

---

## 🚀 Step 8 — Deploy to Vercel

1. Go to [https://vercel.com](https://vercel.com) → Sign in with GitHub
2. Click **"New Project"**
3. Import your `balaji-handloom` repository
4. Framework Preset: **Other** (plain HTML)
5. Root Directory: `/` (leave default)
6. Click **Deploy**
7. Copy your Vercel URL (e.g. `https://balaji-handloom.vercel.app`)
8. Go to Firebase Console → Authentication → Settings → **Authorized Domains**
9. Add your Vercel domain

---

## 🛡️ Step 9 — Apply Firebase Security Rules

### Firestore Rules:
1. Firebase Console → Firestore → **Rules** tab
2. Copy content from `firebase/firestore.rules` → Paste → **Publish**

### Storage Rules:
1. Firebase Console → Storage → **Rules** tab
2. Copy content from `firebase/storage.rules` → Paste → **Publish**

---

## 🛍️ Step 10 — Add Your First Product (Admin Panel)

1. Go to `https://your-site.vercel.app/admin.html`
2. Login with admin credentials
3. Click **"Add Product"**
4. Fill in: Name, Description, MRP, Price, Category, Stock, Sizes
5. Upload product images (max 200KB each — auto-compressed)
6. Toggle **Featured** if you want it on homepage
7. Click **Save Product**

---

## 📱 WhatsApp Order Setup

In `js/checkout.js`, update the shop WhatsApp number:

```javascript
const SHOP_WHATSAPP = "919799XXXXXX"; // Replace with your number (91 = India code)
```

When customer places order, a pre-filled WhatsApp message is generated with:
- Customer Name, Phone, Address
- Product List with sizes and quantities
- Grand Total
- Order ID

---

## 🔄 How to Update / Redeploy

After any code change:

```bash
git add .
git commit -m "Update: description of change"
git push origin main
```

Vercel auto-deploys on every push to `main`. ✅

---

## 📊 Admin Dashboard Features

| Feature | Description |
|---|---|
| Dashboard | Total Products, Orders, Users, Revenue |
| Add Product | Name, MRP, Price, Images, Stock, Sizes, Category |
| Edit Product | Update any field, re-upload images |
| Delete Product | Permanent delete with image cleanup |
| View Orders | All customer orders with status |
| Update Order | Pending → Confirmed → Packed → Shipped → Delivered |
| Cancel Order | Mark order as cancelled |
| Search Orders | Search by customer name or order ID |

---

## 🌐 SEO & Performance

- Meta tags on every page
- Open Graph tags for WhatsApp/social sharing
- Lazy loading for all images
- PWA manifest for installable app
- Service Worker for offline support
- WebP image format preferred
- Mobile-first responsive design

---

## 📞 Store Contact

**Shree Panchmukhi Balaji Handloom**  
Panchori Road, Poonasar, Rajasthan — 342312

---

## 🧑‍💻 Developer Notes

- No Bootstrap, No jQuery, No PHP, No Node.js backend
- Pure ES6 modules — all imports use Firebase CDN
- Firebase SDK v10+ (modular)
- All Firestore queries are real-time listeners (onSnapshot)
- Images are auto-compressed to WebP before upload
- Dark/Light mode toggle saved in localStorage

---

*Built with ❤️ for Rajasthan's handloom heritage.*
