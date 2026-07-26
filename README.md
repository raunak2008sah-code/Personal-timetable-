# 🌅 Adaptive Timetable System — Mission Log

> **Live Application Deployed At:** [https://raunak2008sah-code.github.io/Personal-timetable-/](https://raunak2008sah-code.github.io/Personal-timetable-/)
> **GitHub Repository:** [https://github.com/raunak2008sah-code/Personal-timetable-.git](https://github.com/raunak2008sah-code/Personal-timetable-.git)

## 1. What This Is & Who It's For

The **Adaptive Timetable System** is a lightweight, zero-build personal daily execution and habit tracking web application designed specifically for **Raunak**, a Class 12 student preparing concurrently for **CBSE Boards 2027**, **JEE Main 2027**, and **NDA 2 2026**. Built with zero heavy frameworks, zero ongoing hosting costs, and high visual clarity, this application helps manage daily study rotations, repair sleep architecture, track multi-week habits, and triage unexpected schedule disruptions without guilt.

---

## 2. Five Core Tabs Overview

1. **🏫 School Day**: Vertical interactive timeline tailored for weekdays with school attendance. Dynamically adjusts based on configured school dismissal time and commute duration.
2. **🏠 Holiday**: Optimized weekend/holiday schedule providing longer, uninterrupted deep-work blocks and structured revision cycles.
3. **⚡ Busy / Special Day**: High-efficiency triage schedule designed for high-stress days, exam days, or travel, protecting only essential recall and sleep routines.
4. **⚙️ System**: Master control center containing the sleep repair rationale, subject wheel rotation matrix, fallback protocols, weekly reset checklist, weekly review questions, priority matrix, monthly syllabus tracker, editable school settings, and JSON export/import data management tools.
5. **📈 Habits**: Dedicated habit signal checklist, interactive 30/90-day consistency heatmap, per-habit breakdown bars, weekly completion trendline, and automated qualitative insight diagnostics.

---

## 3. How the Sync Code & Security Tradeoff Works

To eliminate authentication friction (no login screens, passwords, or OAuth dialogs), the application uses a **Sync Code** system:
- A unique 8-character string (e.g. `a1b2c3d4`) acts as your document namespace in Firebase Firestore (`users/{syncCode}/...`).
- Entering the same Sync Code on your phone and laptop instantly links them to the exact same cloud dataset via real-time Firestore listeners (`onSnapshot`).
- **Security Tradeoff**: Treat your Sync Code as a **password, not a username**. Anyone who possesses your Sync Code can read and write to your timetable storage space. You can view, copy, or update your Sync Code at any time in the **System → Sync & Data Management** section.

---

## 4. Setting Up Your Own Firebase Backend

If you want to host your own instance of the application with your own Firebase database:

1. **Create a Firebase Project**:
   - Go to the [Firebase Console](https://console.firebase.google.com/) and click **Add project**.
   - Name your project (e.g. `raunak-timetable`) and disable Google Analytics (optional).

2. **Create a Firestore Database**:
   - In your Firebase project sidebar, click **Build → Firestore Database**.
   - Click **Create database**, choose your location, and start in **Production mode**.

3. **Configure Security Rules**:
   - In the Firestore Database tab, navigate to **Rules**.
   - Copy and paste the contents of `firestore.rules`:
     ```javascript
     rules_version = '2';
     service cloud.firestore {
       match /databases/{database}/documents {
         match /users/{syncCode}/{document=**} {
           allow read, write: if syncCode != null && syncCode.size() >= 4;
         }
       }
     }
     ```
   - Click **Publish**.

4. **Add Web App Credentials**:
   - Go to **Project Settings** (gear icon) → **General**.
   - Scroll down to **Your apps** and click the **Web (`</>`)** icon.
   - Register the app and copy your `firebaseConfig` object values.
   - Open `app.js` in your text editor and update lines 18–26 with your project keys:
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

## 5. Running Locally

Because the app is built purely with native ES modules and standard web APIs:
- Simply serve the project folder using any static HTTP server (e.g., Python's built-in server or VS Code Live Server):
  ```bash
  python -m http.server 8000
  ```
- Open `http://localhost:8000` in your web browser.

---

## 6. Deploying to GitHub Pages

1. Create a public repository on GitHub named `adaptive-timetable`.
2. Push this codebase to the `main` branch:
   ```bash
   git init
   git add .
   git commit -m "feat: complete adaptive timetable system"
   git remote add origin https://github.com/sahmo/adaptive-timetable.git
   git push -u origin main
   ```
3. Go to **Settings → Pages** in your GitHub repository.
4. Under **Build and deployment**, select `Deploy from a branch` and set Branch to `main` / `/ (root)`.
5. Click **Save**. Your site will be live at `https://<your-username>.github.io/adaptive-timetable/` in 1–2 minutes!

---

## 7. Key Features Built-In

- **Cross-Device Real-Time Sync**: Changes on phone reflect on laptop in real time via Firestore WebSocket listeners.
- **Offline PWA Support**: Service worker caches app shell for immediate loading without connectivity; Firestore IndexedDB persistence preserves and syncs offline edits.
- **Printable "Today" View**: Press `Ctrl+P` or print to get a clean, high-contrast, black-and-white paper daily execution sheet without web chrome.
- **JSON Export / Import**: Download full cloud data backups at any time for total peace of mind.
- **Editable School Settings**: Customize school dismissal and commute times directly in the System tab to adapt daily block durations on the fly.
