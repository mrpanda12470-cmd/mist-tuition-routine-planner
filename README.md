# 🎓 Tuition & MIST Study Routine Planner — Real-Time SaaS PWA

A modern, multi-user web application and Progressive Web App (PWA) for managing tuition schedules, daily study routines, track distributions, and financial tracking with real-time cloud sync and offline persistence.

---

## 🌟 Key Features

1. **🔐 Multi-User Authentication**
   - **Google Sign-In** (1-click popup authentication)
   - **Email + Password** registration & login with password reset
   - **Instant Demo Mode** fallback to evaluate without entering credentials
   - Per-user isolated Firestore data space under `/users/{uid}/...`

2. **⚡ Real-Time Auto Push & Cloud Sync**
   - Built on **Firebase v10 Modular SDK** and **Cloud Firestore**
   - Reactive `onSnapshot` listeners — any changes made on your phone update your laptop tab instantly without refreshing
   - Pulse sync indicator in header (*"Syncing..."* ➔ *"Synced ✓"*)
   - Offline caching via Firestore IndexedDB + Service Worker (`sw.js`)

3. **📱 Progressive Web App (PWA)**
   - Fully installable on iOS (Safari: *Add to Home Screen*) and Android (Chrome: *Install App*)
   - Runs in full-screen standalone mode without browser chrome
   - Offline app shell caching with automatic cache invalidation
   - Web Push Notification listener ready

4. **✨ Interactive Routine & Schedule Planner**
   - **Interactive Reordering**: Drag-and-drop or use Up/Down arrow buttons to reorder students
   - **Inline Student Editing & Modal**: Edit student name, fee, area, days/week, and track
   - **Add & Delete Students**: Add custom students or delete with confirmation modal
   - **Track Management**: Automatic Track A (4 days/wk) vs Track B (3 days/wk) distribution for zero-backtracking Manikdi route loop
   - **Routine Mode Switching**:
     - *Exam Prep (1.25h)*
     - *Exam Eve (1.1h)*
     - *Post-Nov 4 Break (1.5h)*
   - **Shift Switching**: Free Morning (2:30–9:45 PM) vs Split Shift (1 AM + 4 PM)
   - **Search & Filter**: Instant search by student name/area + filters by Track and Payment status

5. **📚 MIST Term Final Study Planner**
   - Interactive study block checklists for CE-411, CE-413, and CE-451
   - Real-time progress bars calculating completion percentage per subject
   - Add Custom Study Milestones and milestones modal

6. **⏱️ Focus & Tuition Timer**
   - Built-in countdown timer with presets (25m Pomodoro, 50m Exam Sprint, 1.1h Eve, 1.25h Prep, 1.5h Session)
   - Dual-tone sound chime using Web Audio API (no external MP3 required)

7. **🌓 UI Customization & Data Portability**
   - Dark Mode / Light Mode toggle with local persistence
   - Export all personal routines, tuitions, and study history to a `.json` backup file
   - Weekly session counter reset with automatic archival to history logs

---

## 🚀 How to Run Locally

1. Open your terminal in this directory:
   ```bash
   npm start
   ```
2. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```
3. Click **"Explore in Demo Mode"** to test all features immediately, or connect your Firebase credentials.

---

## 🌐 How to Make It Online Accessible (100% Free)

### Option A: Firebase Hosting (Recommended)

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a project (e.g. `mist-tuition-planner`).
2. In the Firebase console:
   - Go to **Build > Authentication** ➔ Enable **Google** and **Email/Password**.
   - Go to **Build > Firestore Database** ➔ Create Database in Production Mode.
   - Go to **Project Settings > General > Your apps** ➔ Click the **`</>` Web** icon and copy your configuration object.
3. In the web app, click **"Firebase Config"** in the top navigation or auth screen, and paste your config JSON.
4. Deploy to Firebase Hosting:
   ```bash
   npx firebase-tools login
   npx firebase-tools init hosting
   npx firebase-tools deploy
   ```
   Your app will be live at `https://your-project-id.web.app`!

### Option B: Vercel or Netlify (Zero Configuration)

- **Vercel**: Run `npx vercel` or drag-and-drop the folder into [vercel.com](https://vercel.com).
- **Netlify**: Drag-and-drop the folder into [app.netlify.com/drop](https://app.netlify.com/drop).
- **GitHub Pages**: Push this repo to GitHub and enable GitHub Pages on the `main` branch.

---

## 📁 File Structure

| File | Purpose |
|---|---|
| [`index.html`](file:///c:/Users/ratul/Downloads/New%20folder%20%283%29/index.html) | Single-page SaaS interface, Auth screens, Tabs, Modals, and Tailwind UI |
| [`app.js`](file:///c:/Users/ratul/Downloads/New%20folder%20%283%29/app.js) | Main application logic, drag & drop, state management, timer, UI rendering |
| [`auth.js`](file:///c:/Users/ratul/Downloads/New%20folder%20%283%29/auth.js) | Firebase Authentication (Google, Email/Password, Password Reset, Demo Mode) |
| [`db.js`](file:///c:/Users/ratul/Downloads/New%20folder%20%283%29/db.js) | Real-time Firestore sync, `onSnapshot` listeners, seeding, offline caching |
| [`sw.js`](file:///c:/Users/ratul/Downloads/New%20folder%20%283%29/sw.js) | Service worker for PWA installation, offline shell, and Push Notifications |
| [`manifest.json`](file:///c:/Users/ratul/Downloads/New%20folder%20%283%29/manifest.json) | PWA Manifest with icons and standalone display settings |
| [`firebase.json`](file:///c:/Users/ratul/Downloads/New%20folder%20%283%29/firebase.json) | Firebase Hosting rewrites and cache headers configuration |
| [`firestore.rules`](file:///c:/Users/ratul/Downloads/New%20folder%20%283%29/firestore.rules) | Security rules ensuring strict multi-user privacy under `/users/{uid}/` |
| [`server.js`](file:///c:/Users/ratul/Downloads/New%20folder%20%283%29/server.js) | Lightweight local Node.js development server |
| [`package.json`](file:///c:/Users/ratul/Downloads/New%20folder%20%283%29/package.json) | NPM scripts for `npm start` and deployment |
