/* ═══════════════════════════════════════════════════════════════════
   ADAPTIVE TIMETABLE SYSTEM — app.js
   Firebase Firestore-backed, offline-capable, cross-device sync
   ═══════════════════════════════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc,
  collection, getDocs, onSnapshot,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";

/* ─────────────────────────────────────────────────────────────────
   0. FIREBASE CONFIG — Replace with your own project config
   ───────────────────────────────────────────────────────────────── */

const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

let firebaseApp = null;
let db = null;
let syncCode = null;
let firestoreReady = false;
const activeListeners = [];

function initFirebase() {
  try {
    firebaseApp = initializeApp(FIREBASE_CONFIG);
    db = getFirestore(firebaseApp);
    enableIndexedDbPersistence(db).catch((err) => {
      if (err.code === "failed-precondition") {
        console.warn("[Firebase] Offline persistence unavailable: multiple tabs open.");
      } else if (err.code === "unimplemented") {
        console.warn("[Firebase] Offline persistence not supported in this browser.");
      }
    });
    firestoreReady = true;
    console.log("[Firebase] Initialized successfully.");
  } catch (err) {
    console.warn("[Firebase] Init failed — running in offline/memory mode:", err.message);
    firestoreReady = false;
  }
}

/* ─────────────────────────────────────────────────────────────────
   1. DATA SPECIFICATIONS (SECTION 5 EXACT DATA)
   ───────────────────────────────────────────────────────────────── */

const WEEKLY_WHEEL = {
  1: { day: "Monday",    deep1: "Physics",   deep2: "Maths",     light: "Computer Science" },
  2: { day: "Tuesday",   deep1: "Chemistry", deep2: "Physics",   light: "NDA GAT" },
  3: { day: "Wednesday", deep1: "Maths",     deep2: "Chemistry", light: "English" },
  4: { day: "Thursday",  deep1: "Physics",   deep2: "Maths",     light: "Computer Science" },
  5: { day: "Friday",    deep1: "Chemistry", deep2: "Physics",   light: "NDA GAT" },
  6: { day: "Saturday",  deep1: "Maths",     deep2: "Chemistry", light: "English + NDA Maths speed drills" },
  0: { day: "Sunday",    deep1: "Full rotation", deep2: "Mock / Revision day", light: "\u2014" }
};

const SLEEP_PHASES = {
  "1": { nap: "25\u201330 min, alarm-locked", bedtime: "12:00\u201312:15 AM", result: "~5.5\u20136 hrs" },
  "2": { nap: "20 min", bedtime: "11:30 PM", result: "~6.5\u20137 hrs" },
  "3": { nap: "15\u201320 min, optional", bedtime: "10:30\u201311:00 PM", result: "~7\u20137.5 hrs" }
};

const SCHOOL_DAY_BLOCKS = [
  { icon: "\u{1F305}", title: "Wake", duration: "5:30\u20136:00 AM", detail: "Target per active sleep repair phase" },
  { icon: "\u{1F4A7}", title: "Hydrate + Stretch", duration: "5 min", detail: "Hydrate + quick stretch" },
  { icon: "\u{1F9E0}", title: "2-Min Recall", duration: "2 min", detail: "Yesterday's error log / formula sheet" },
  { icon: "\u{1F392}", title: "Commute to School", duration: "Commute slot", detail: "\u{1F3A7} Chapter audiobook slot", isDynCommute: true },
  { icon: "\u{1F3EB}", title: "School", duration: "8:00\u20134/5:00 PM", detail: "Focus on class, zero dead time", isDynSchool: true },
  { icon: "\u{1F68C}", title: "Commute Home", duration: "Commute slot", detail: "\u{1F3A7} Audiobook or decompress", isDynCommute: true },
  { icon: "\u{1F634}", title: "Recovery Block", duration: "25\u201330 min", detail: "Power nap, alarm-locked \u2014 not longer" },
  { icon: "\u{1F4DD}", title: "Homework", duration: "30\u201360 min", detail: "School assignments" },
  { icon: "\u{1F3CB}\u{FE0F}", title: "Fitness Block", duration: "30\u201335 min", detail: "Running \u00B7 Push/Pull-ups \u00B7 Core \u00B7 Mobility" },
  { icon: "\u{1F37D}\u{FE0F}", title: "Dinner", duration: "30 min", detail: "Phone away" },
  { icon: "\u{1F4D8}", title: "Deep Work 1", duration: "60\u201390 min", detail: "Concept \u2192 NCERT \u2192 PYQ \u2192 error log", isWheel1: true },
  { icon: "\u2615", title: "Break", duration: "10\u201315 min", detail: "No phone" },
  { icon: "\u{1F4D7}", title: "Deep Work 2", duration: "45\u201375 min", detail: "Concept \u2192 practice \u2192 error log", isWheel2: true },
  { icon: "\u2615", title: "Break", duration: "10\u201315 min", detail: "Hydrate & stretch" },
  { icon: "\u{1F4D9}", title: "Light Block", duration: "30\u201345 min", detail: "Revision / CS / English / NDA GAT", isWheelLight: true },
  { icon: "\u{1F6E0}\u{FE0F}", title: "Skill / Project Block", duration: "0\u201330 min", detail: "First to shrink if day runs long" },
  { icon: "\u{1F3AE}", title: "Leisure", duration: "30\u201345 min", detail: "Guilt-free" },
  { icon: "\u{1F5D2}\u{FE0F}", title: "Planning + Reflection", duration: "10 min", detail: "Tomorrow's priority subject" },
  { icon: "\u{1F319}", title: "Night Routine + Digital Detox", duration: "15 min", detail: "Screen-free wind-down" },
  { icon: "\u{1F634}", title: "Sleep", duration: "Bedtime target", detail: "Sleep per active repair phase" }
];

const HOLIDAY_BLOCKS = [
  { icon: "\u{1F305}", title: "Wake", duration: "1\u20132 hrs later", detail: "1\u20132 hrs later than school day" },
  { icon: "\u{1F4A7}", title: "Hydrate + Morning Routine", duration: "Morning slot", detail: "Hydrate + light stretch" },
  { icon: "\u{1F9E0}", title: "Recall Block", duration: "10 min", detail: "Error log + formula recall" },
  { icon: "\u{1F4D8}", title: "Deep Work 1", duration: "90 min", detail: "Hardest subject" },
  { icon: "\u2615", title: "Break", duration: "15 min", detail: "Rest & hydrate" },
  { icon: "\u{1F4D7}", title: "Deep Work 2", duration: "75\u201390 min", detail: "Second subject" },
  { icon: "\u{1F37D}\u{FE0F}", title: "Lunch + Real Break", duration: "45\u201360 min", detail: "No screens" },
  { icon: "\u{1F4D9}", title: "Deep Work 3", duration: "60\u201375 min", detail: "Third subject or NDA GAT" },
  { icon: "\u2615", title: "Long Break", duration: "20\u201330 min", detail: "Stretch & decompress" },
  { icon: "\u{1F3CB}\u{FE0F}", title: "Extended Fitness Session", duration: "45\u201360 min", detail: "Endurance / strength progression" },
  { icon: "\u{1F634}", title: "Optional Nap", duration: "20\u201330 min", detail: "Only if genuinely needed" },
  { icon: "\u{1F4D5}", title: "Revision / Mock Test Block", duration: "60\u201390 min", detail: "Chapter \u2192 subject \u2192 full mock (70\u201380% syllabus)" },
  { icon: "\u{1F6E0}\u{FE0F}", title: "Skill / Project Block", duration: "45\u201360 min", detail: "Real runway day for GeetaDiva/ExamForge" },
  { icon: "\u{1F37D}\u{FE0F}", title: "Dinner", duration: "Evening slot", detail: "Meal & rest" },
  { icon: "\u{1F3AE}", title: "Extended Leisure", duration: "60\u201390 min", detail: "Protect this \u2014 real recovery day" },
  { icon: "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}", title: "Family / Social Time", duration: "Flexible", detail: "As available" },
  { icon: "\u{1F5D2}\u{FE0F}", title: "Weekly Planning", duration: "Sundays only", detail: "See weekly system" },
  { icon: "\u{1F319}", title: "Night Routine + Digital Detox", duration: "15 min", detail: "Wind down screen-free" },
  { icon: "\u{1F634}", title: "Sleep", duration: "Bedtime target", detail: "Same target as school days \u2014 Don\u2019t let holidays reset your clock" }
];

const BUSY_DAY_BLOCKS = [
  { icon: "\u{1F305}", title: "Wake", duration: "As required", detail: "Whatever the day demands" },
  { icon: "\u{1F4A7}", title: "Hydrate + 2-Min Recall", duration: "2 min", detail: "Non-negotiable \u2014 keeps the thread alive" },
  { icon: "\u{1F3C3}", title: "Micro-Movement", duration: "10 min", detail: "Mobility/stretch only" },
  { icon: "\u26A1", title: "The Day's Actual Demand", duration: "Main event", detail: "Competition / travel / event / rest" },
  { icon: "\u{1F4D8}", title: "One Priority-Subject Touch", duration: "30\u201345 min", detail: "Even just error-log review or 10 problems" },
  { icon: "\u{1F4DD}", title: "Homework", duration: "Flexible", detail: "Only if unavoidable" },
  { icon: "\u{1F319}", title: "Digital Detox Before Sleep", duration: "15 min", detail: "Still enforced \u2014 cheap and high-value" },
  { icon: "\u{1F634}", title: "Sleep", duration: "Bedtime target", detail: "Protect above all else today" }
];

const WEEKLY_RESET_ITEMS = [
  "Error logs reviewed across all subjects touched this week",
  "Next week\u2019s Subject Wheel confirmed (no changes unless exam approaching)",
  "Fitness progression checked (add 1 rep/round if last week felt manageable)",
  "Sleep phase checked \u2014 ready to tighten bedtime by 30 min?"
];

const HABIT_ITEMS = [
  "Wake time on target",
  "Fitness done",
  "Deep Block 1 completed",
  "Deep Block 2 completed",
  "Digital detox before sleep",
  "Sleep 7hrs+"
];

const SYLLABUS_SUBJECTS = ["Physics", "Chemistry", "Maths", "Computer Science", "English"];

/* ─────────────────────────────────────────────────────────────────
   2. DATE UTILITY HELPERS
   ───────────────────────────────────────────────────────────────── */

function getTodayDateString(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getISOWeekString(d = new Date()) {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNum = 1 + Math.round((firstThursday - target.valueOf()) / 604800000);
  return `${target.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function getYearMonthString(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function generateSyncCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/* ─────────────────────────────────────────────────────────────────
   3. STORAGE LAYER — Firebase Firestore abstraction
   Maintains the same get/set/list API used by the rest of the app.
   ───────────────────────────────────────────────────────────────── */

function parseStorageKey(key) {
  // Maps old window.storage keys → Firestore collection/doc
  if (key === "sleep_phase") return { coll: "meta", docId: "sleepPhase" };
  if (key === "school_settings") return { coll: "meta", docId: "schoolSettings" };

  const parts = key.split(":");
  if (parts.length === 2) {
    const prefix = parts[0];
    const suffix = parts[1];
    const collMap = {
      "checklist": "checklists",
      "weekly-reset": "weeklyReset",
      "weekly-review": "weeklyReview",
      "habits": "habits",
      "syllabus": "syllabus",
      "monthly-reflection": "monthlyReflection",
      "day-type": "dayType"
    };
    if (collMap[prefix]) {
      return { coll: collMap[prefix], docId: suffix };
    }
  }
  // Fallback
  return { coll: "misc", docId: key.replace(/[\/\.]/g, "_") };
}

function withTimeout(promise, ms, fallbackVal) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(fallbackVal), ms))
  ]);
}

const memoryStore = {};

const StorageLayer = {
  async get(key) {
    if (firestoreReady && syncCode) {
      try {
        const { coll, docId } = parseStorageKey(key);
        const ref = doc(db, "users", syncCode, coll, docId);
        const snap = await withTimeout(getDoc(ref), 1000, null);
        if (snap && snap.exists()) {
          return snap.data().value;
        }
      } catch (err) {
        console.warn("[Storage] Firestore get error:", err);
      }
    }
    const localVal = localStorage.getItem(`cache:${syncCode}:${key}`);
    if (localVal !== null) {
      try { return JSON.parse(localVal); } catch(e) { return localVal; }
    }
    return memoryStore[key] !== undefined ? memoryStore[key] : null;
  },

  async set(key, value) {
    memoryStore[key] = value;
    try {
      localStorage.setItem(`cache:${syncCode}:${key}`, JSON.stringify(value));
    } catch(e){}
    if (firestoreReady && syncCode) {
      try {
        const { coll, docId } = parseStorageKey(key);
        const ref = doc(db, "users", syncCode, coll, docId);
        await withTimeout(setDoc(ref, { value }, { merge: true }), 1000, null);
      } catch (err) {
        console.warn("[Storage] Firestore set error:", err);
      }
    }
  },

  async list(prefix) {
    const keys = [];
    if (firestoreReady && syncCode) {
      try {
        const { coll } = parseStorageKey(prefix + "dummy");
        const collRef = collection(db, "users", syncCode, coll);
        const snap = await withTimeout(getDocs(collRef), 1000, null);
        if (snap) {
          snap.forEach(d => {
            const fullKey = prefix.split(":")[0] + ":" + d.id;
            if (fullKey.startsWith(prefix) && !keys.includes(fullKey)) {
              keys.push(fullKey);
            }
          });
        }
      } catch (err) {
        console.warn("[Storage] Firestore list error:", err);
      }
    }
    // Check localStorage cache
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const cachePrefix = `cache:${syncCode}:${prefix}`;
      if (k && k.startsWith(cachePrefix)) {
        const rawKey = k.replace(`cache:${syncCode}:`, '');
        if (!keys.includes(rawKey)) keys.push(rawKey);
      }
    }
    // Check memory store
    Object.keys(memoryStore).forEach(k => {
      if (k.startsWith(prefix) && !keys.includes(k)) {
        keys.push(k);
      }
    });
    return keys;
  }
};

/* ─────────────────────────────────────────────────────────────────
   4. REAL-TIME LISTENERS for cross-device sync
   ───────────────────────────────────────────────────────────────── */

function setupRealtimeListeners() {
  if (!firestoreReady || !syncCode || !db) return;

  // Listen to today's checklist
  const checklistRef = doc(db, "users", syncCode, "checklists", STATE.dateStr);
  activeListeners.push(onSnapshot(checklistRef, (snap) => {
    if (snap.exists() && snap.metadata.hasPendingWrites === false) {
      const data = snap.data().value;
      if (data && typeof data === "object") {
        STATE.checklists.school = Array.isArray(data.school) ? data.school : STATE.checklists.school;
        STATE.checklists.holiday = Array.isArray(data.holiday) ? data.holiday : STATE.checklists.holiday;
        STATE.checklists.busy = Array.isArray(data.busy) ? data.busy : STATE.checklists.busy;
        ensureChecklistArrays();
        if (["school", "holiday", "busy"].includes(STATE.activeTab)) {
          renderDailyTimeline();
        }
      }
    }
  }));

  // Listen to today's habits
  const habitsRef = doc(db, "users", syncCode, "habits", STATE.dateStr);
  activeListeners.push(onSnapshot(habitsRef, (snap) => {
    if (snap.exists() && snap.metadata.hasPendingWrites === false) {
      const data = snap.data().value;
      if (Array.isArray(data) && data.length === HABIT_ITEMS.length) {
        STATE.habits = data;
        STATE.habitHistory[STATE.dateStr] = data;
        updateHabitsBadgeUI();
        if (STATE.activeTab === "habits") {
          renderHabitsTabSections();
        }
      }
    }
  }));

  // Listen to sleep phase
  const sleepRef = doc(db, "users", syncCode, "meta", "sleepPhase");
  activeListeners.push(onSnapshot(sleepRef, (snap) => {
    if (snap.exists() && snap.metadata.hasPendingWrites === false) {
      const val = snap.data().value;
      if (val && SLEEP_PHASES[val]) {
        STATE.sleepPhase = val;
        document.getElementById("sleep-phase-select").value = val;
        updateSleepPhaseUI(val);
      }
    }
  }));

  // Listen to weekly reset
  const wResetRef = doc(db, "users", syncCode, "weeklyReset", STATE.isoWeekStr);
  activeListeners.push(onSnapshot(wResetRef, (snap) => {
    if (snap.exists() && snap.metadata.hasPendingWrites === false) {
      const data = snap.data().value;
      if (Array.isArray(data) && data.length === WEEKLY_RESET_ITEMS.length) {
        STATE.weeklyReset = data;
        updateSystemBadgeUI();
        if (STATE.activeTab === "system") {
          renderWeeklyReset();
        }
      }
    }
  }));

  // Listen to school settings
  const settingsRef = doc(db, "users", syncCode, "meta", "schoolSettings");
  activeListeners.push(onSnapshot(settingsRef, (snap) => {
    if (snap.exists() && snap.metadata.hasPendingWrites === false) {
      const data = snap.data().value;
      if (data && typeof data === "object") {
        STATE.schoolSettings = { ...STATE.schoolSettings, ...data };
        if (STATE.activeTab === "school") {
          renderDailyTimeline();
        }
      }
    }
  }));

  // Listen to today's day-type lock
  const dayTypeRef = doc(db, "users", syncCode, "dayType", STATE.dateStr);
  activeListeners.push(onSnapshot(dayTypeRef, (snap) => {
    if (snap.exists() && snap.metadata.hasPendingWrites === false) {
      const val = snap.data().value;
      if (val && ["school", "holiday", "busy"].includes(val)) {
        if (STATE.dayType !== val) {
          STATE.dayType = val;
          if (["school", "holiday", "busy"].includes(STATE.activeTab)) {
            STATE.activeTab = val;
          }
          renderDayTypeSelectorUI();
          renderCurrentTab();
        }
      }
    }
  }));
}

/* ─────────────────────────────────────────────────────────────────
   5. APPLICATION STATE
   ───────────────────────────────────────────────────────────────── */

const STATE = {
  activeTab: "school",
  dayType: null, // "school" | "holiday" | "busy" | null
  sleepPhase: "1",
  dateStr: getTodayDateString(),
  isoWeekStr: getISOWeekString(),
  yearMonthStr: getYearMonthString(),
  todayWheel: WEEKLY_WHEEL[new Date().getDay()],
  checklists: { school: [], holiday: [], busy: [] },
  weeklyReset: [],
  weeklyReview: { q1: "", q2: "", q3: "" },
  habits: [],
  syllabus: { Physics: 0, Chemistry: 0, Maths: 0, "Computer Science": 0, English: 0 },
  monthlyReflection: { q1: "", q2: "", q3: "" },
  habitHistory: {},
  heatmapRange: 30,
  schoolSettings: { endTime: "4:00\u20135:00 PM", commuteDuration: "30 min" }
};

/* ─────────────────────────────────────────────────────────────────
   6. SYNC CODE MANAGEMENT
   ───────────────────────────────────────────────────────────────── */

function showSyncCodeModal() {
  return new Promise((resolve) => {
    const overlay = document.getElementById("sync-modal-overlay");
    const input = document.getElementById("sync-code-input");
    const generateBtn = document.getElementById("sync-generate-btn");
    const connectBtn = document.getElementById("sync-connect-btn");

    overlay.style.display = "flex";

    generateBtn.onclick = () => {
      input.value = generateSyncCode();
    };

    connectBtn.onclick = () => {
      let code = input.value.trim();
      if (!code) code = generateSyncCode();
      localStorage.setItem("timetable_sync_code", code);
      overlay.style.display = "none";
      resolve(code);
    };

    // Allow Enter key
    input.onkeydown = (e) => {
      if (e.key === "Enter") connectBtn.click();
    };
  });
}

function updateSyncCodeDisplay() {
  const el = document.getElementById("sync-code-display-value");
  if (el) el.textContent = syncCode || "—";
}

/* ─────────────────────────────────────────────────────────────────
   7. INITIALIZATION
   ───────────────────────────────────────────────────────────────── */

async function initApp() {
  // 0. Init Firebase
  initFirebase();

  // 1. Get or prompt for sync code
  syncCode = localStorage.getItem("timetable_sync_code");
  if (!syncCode) {
    syncCode = await showSyncCodeModal();
  }
  updateSyncCodeDisplay();

  // 2. Display date
  renderDateDisplay();

  // 3. Load sleep phase
  const savedSleepPhase = await StorageLayer.get("sleep_phase");
  if (savedSleepPhase && SLEEP_PHASES[savedSleepPhase]) {
    STATE.sleepPhase = savedSleepPhase;
  }
  document.getElementById("sleep-phase-select").value = STATE.sleepPhase;
  updateSleepPhaseUI(STATE.sleepPhase);

  // 4. Load school settings
  const savedSettings = await StorageLayer.get("school_settings");
  if (savedSettings && typeof savedSettings === "object") {
    STATE.schoolSettings = { ...STATE.schoolSettings, ...savedSettings };
  }
  renderSchoolSettings();

  // 5. Load daily checklist
  const dailyKey = `checklist:${STATE.dateStr}`;
  const savedChecklists = await StorageLayer.get(dailyKey);
  if (savedChecklists && typeof savedChecklists === "object") {
    STATE.checklists.school = Array.isArray(savedChecklists.school) ? savedChecklists.school : [];
    STATE.checklists.holiday = Array.isArray(savedChecklists.holiday) ? savedChecklists.holiday : [];
    STATE.checklists.busy = Array.isArray(savedChecklists.busy) ? savedChecklists.busy : [];
  }
  ensureChecklistArrays();

  // 6. Load system & habits data
  await loadSystemTabData();
  await loadHabitHistoryData();

  // 6b. Load today's day-type lock
  const savedDayType = await StorageLayer.get(`day-type:${STATE.dateStr}`);
  if (savedDayType && ["school", "holiday", "busy"].includes(savedDayType)) {
    STATE.dayType = savedDayType;
    STATE.activeTab = savedDayType;
  }
  renderDayTypeSelectorUI();

  // 7. Update UI
  updateSubjectWheelUI();
  updateSystemBadgeUI();
  updateHabitsBadgeUI();

  // 8. Bind events
  bindEvents();

  // 9. Render active tab
  renderCurrentTab();

  // 10. Setup real-time listeners for cross-device sync
  setupRealtimeListeners();

  // 11. Hide loading indicator
  const loader = document.getElementById("app-loading");
  if (loader) loader.style.display = "none";
  const container = document.querySelector(".app-container");
  if (container) container.style.display = "block";
}

async function loadSystemTabData() {
  const wResetKey = `weekly-reset:${STATE.isoWeekStr}`;
  const savedWReset = await StorageLayer.get(wResetKey);
  if (Array.isArray(savedWReset) && savedWReset.length === WEEKLY_RESET_ITEMS.length) {
    STATE.weeklyReset = savedWReset;
  } else {
    STATE.weeklyReset = new Array(WEEKLY_RESET_ITEMS.length).fill(false);
  }

  const wRevKey = `weekly-review:${STATE.isoWeekStr}`;
  const savedWRev = await StorageLayer.get(wRevKey);
  if (savedWRev && typeof savedWRev === "object") {
    STATE.weeklyReview = { q1: savedWRev.q1 || "", q2: savedWRev.q2 || "", q3: savedWRev.q3 || "" };
  }

  const habitKey = `habits:${STATE.dateStr}`;
  const savedHabits = await StorageLayer.get(habitKey);
  if (Array.isArray(savedHabits) && savedHabits.length === HABIT_ITEMS.length) {
    STATE.habits = savedHabits;
  } else {
    STATE.habits = new Array(HABIT_ITEMS.length).fill(false);
  }

  const sylKey = `syllabus:${STATE.yearMonthStr}`;
  const savedSyl = await StorageLayer.get(sylKey);
  if (savedSyl && typeof savedSyl === "object") {
    SYLLABUS_SUBJECTS.forEach(sub => {
      STATE.syllabus[sub] = typeof savedSyl[sub] === "number" ? savedSyl[sub] : 0;
    });
  }

  const mRefKey = `monthly-reflection:${STATE.yearMonthStr}`;
  const savedMRef = await StorageLayer.get(mRefKey);
  if (savedMRef && typeof savedMRef === "object") {
    STATE.monthlyReflection = { q1: savedMRef.q1 || "", q2: savedMRef.q2 || "", q3: savedMRef.q3 || "" };
  }
}

// NOTE: No seed data. App starts completely empty for new users.
async function loadHabitHistoryData() {
  const map = {};
  try {
    const keys = await StorageLayer.list("habits:");
    for (const key of keys) {
      const datePart = key.replace("habits:", "");
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        const val = await StorageLayer.get(key);
        if (Array.isArray(val) && val.length === HABIT_ITEMS.length) {
          map[datePart] = val;
        }
      }
    }
  } catch (err) {
    console.warn("[Habits] Error loading habit history:", err);
  }

  if (STATE.habits && Array.isArray(STATE.habits)) {
    map[STATE.dateStr] = STATE.habits;
  }
  STATE.habitHistory = map;
}

/* ─────────────────────────────────────────────────────────────────
   8. UI RENDERERS
   ───────────────────────────────────────────────────────────────── */

function renderDateDisplay() {
  const now = new Date();
  const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  document.getElementById("current-date-display").textContent = now.toLocaleDateString("en-US", options);

  const weekLabelText = `Week ${STATE.isoWeekStr.split("-W")[1]}, ${STATE.isoWeekStr.split("-W")[0]}`;
  const monthLabelText = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  document.getElementById("weekly-period-label").textContent = weekLabelText;
  document.getElementById("weekly-review-period").textContent = weekLabelText;
  document.getElementById("syllabus-month-label").textContent = monthLabelText;
  document.getElementById("monthly-reflection-period").textContent = monthLabelText;
}

function updateSleepPhaseUI(phaseKey) {
  const phaseData = SLEEP_PHASES[phaseKey] || SLEEP_PHASES["1"];
  document.getElementById("sleep-nap-val").textContent = phaseData.nap;
  document.getElementById("sleep-bedtime-val").textContent = phaseData.bedtime;
  document.getElementById("sleep-result-val").textContent = phaseData.result;
}

function updateSubjectWheelUI() {
  const w = STATE.todayWheel;
  document.getElementById("wheel-day-name").textContent = w.day.toUpperCase();
  document.getElementById("wheel-deep1-val").textContent = w.deep1;
  document.getElementById("wheel-deep2-val").textContent = w.deep2;
  document.getElementById("wheel-light-val").textContent = w.light;
}

function updateSystemBadgeUI() {
  const doneCount = STATE.weeklyReset.filter(Boolean).length;
  document.getElementById("system-badge").textContent = `${doneCount}/4`;
}

function updateHabitsBadgeUI() {
  const doneCount = STATE.habits.filter(Boolean).length;
  document.getElementById("habits-badge").textContent = `${doneCount}/6`;
}

function ensureChecklistArrays() {
  if (STATE.checklists.school.length !== SCHOOL_DAY_BLOCKS.length) {
    STATE.checklists.school = new Array(SCHOOL_DAY_BLOCKS.length).fill(false);
  }
  if (STATE.checklists.holiday.length !== HOLIDAY_BLOCKS.length) {
    STATE.checklists.holiday = new Array(HOLIDAY_BLOCKS.length).fill(false);
  }
  if (STATE.checklists.busy.length !== BUSY_DAY_BLOCKS.length) {
    STATE.checklists.busy = new Array(BUSY_DAY_BLOCKS.length).fill(false);
  }
}

function getActiveBlocks() {
  if (STATE.activeTab === "school") return SCHOOL_DAY_BLOCKS;
  if (STATE.activeTab === "holiday") return HOLIDAY_BLOCKS;
  if (STATE.activeTab === "busy") return BUSY_DAY_BLOCKS;
  return [];
}

async function selectDayType(mode) {
  if (STATE.dayType !== null) return;
  if (!["school", "holiday", "busy"].includes(mode)) return;

  STATE.dayType = mode;
  STATE.activeTab = mode;

  renderDayTypeSelectorUI();
  renderCurrentTab();

  await StorageLayer.set(`day-type:${STATE.dateStr}`, mode);
}

function renderDayTypeSelectorUI() {
  const unselectedView = document.getElementById("day-type-unselected-view");
  const lockedView = document.getElementById("day-type-locked-view");
  const lockedTitle = document.getElementById("day-type-locked-title");

  if (!unselectedView || !lockedView) return;

  if (STATE.dayType) {
    unselectedView.style.display = "none";
    lockedView.style.display = "block";

    const labels = {
      school: "📘 School Day",
      holiday: "🏠 Holiday",
      busy: "⚡ Busy / Special Day"
    };
    if (lockedTitle) lockedTitle.textContent = labels[STATE.dayType] || "Selected Day";
  } else {
    unselectedView.style.display = "block";
    lockedView.style.display = "none";
  }
}

function renderCurrentTab() {
  const tabs = [
    { id: "tab-school", mode: "school", label: "🏫 School Day" },
    { id: "tab-holiday", mode: "holiday", label: "🏠 Holiday" },
    { id: "tab-busy", mode: "busy", label: "⚡ Busy / Special Day" },
    { id: "tab-system", mode: "system", label: "⚙️ System" },
    { id: "tab-habits", mode: "habits", label: "📈 Habits" }
  ];

  tabs.forEach(tab => {
    const btn = document.getElementById(tab.id);
    if (!btn) return;
    const isDaily = ["school", "holiday", "busy"].includes(tab.mode);
    const isActive = tab.mode === STATE.activeTab;

    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");

    if (isDaily) {
      const isLocked = STATE.dayType !== null;
      const isChosen = STATE.dayType === tab.mode;

      if (isLocked && !isChosen) {
        btn.classList.add("disabled-lock");
        btn.innerHTML = `${tab.label} <span style="font-size:11px; opacity:0.7;">🔒</span>`;
      } else {
        btn.classList.remove("disabled-lock");
        btn.innerHTML = tab.label;
      }
    }
  });

  const isDaily = ["school", "holiday", "busy"].includes(STATE.activeTab);
  const isSystem = STATE.activeTab === "system";
  const isHabits = STATE.activeTab === "habits";

  const promptContainer = document.getElementById("unselected-prompt-container");
  const wheelStrip = document.getElementById("subject-wheel-strip");
  const opsBar = document.getElementById("ops-bar-container");
  const blocksContainer = document.getElementById("blocks-container");
  const systemContainer = document.getElementById("system-view-container");
  const habitsContainer = document.getElementById("habits-view-container");

  if (isDaily) {
    if (STATE.dayType === null) {
      if (promptContainer) promptContainer.style.display = "block";
      if (wheelStrip) wheelStrip.style.display = "none";
      if (opsBar) opsBar.style.display = "none";
      if (blocksContainer) blocksContainer.style.display = "none";
      if (systemContainer) systemContainer.style.display = "none";
      if (habitsContainer) habitsContainer.style.display = "none";

      const promptText = document.getElementById("unselected-prompt-text");
      if (promptText) {
        const isMobile = window.innerWidth <= 768;
        promptText.textContent = isMobile
          ? "Pick today's day type at the top to open your timetable."
          : "Pick today's day type on the left to open your timetable.";
      }
    } else {
      if (promptContainer) promptContainer.style.display = "none";
      if (wheelStrip) wheelStrip.style.display = (STATE.activeTab === "school") ? "block" : "none";
      if (opsBar) opsBar.style.display = "flex";
      if (blocksContainer) blocksContainer.style.display = "block";
      if (systemContainer) systemContainer.style.display = "none";
      if (habitsContainer) habitsContainer.style.display = "none";
      renderDailyTimeline();
    }
  } else if (isSystem) {
    if (promptContainer) promptContainer.style.display = "none";
    if (wheelStrip) wheelStrip.style.display = "none";
    if (opsBar) opsBar.style.display = "none";
    if (blocksContainer) blocksContainer.style.display = "none";
    if (systemContainer) systemContainer.style.display = "block";
    if (habitsContainer) habitsContainer.style.display = "none";
    renderSystemTabSections();
  } else if (isHabits) {
    if (promptContainer) promptContainer.style.display = "none";
    if (wheelStrip) wheelStrip.style.display = "none";
    if (opsBar) opsBar.style.display = "none";
    if (blocksContainer) blocksContainer.style.display = "none";
    if (systemContainer) systemContainer.style.display = "none";
    if (habitsContainer) habitsContainer.style.display = "block";
    renderHabitsTabSections();
  }
}

/* ─────────────────────────────────────────────────────────────────
   9. DAILY TIMELINE RENDERER
   ───────────────────────────────────────────────────────────────── */

function renderDailyTimeline() {
  const container = document.getElementById("blocks-container");
  container.innerHTML = "";

  const blocks = getActiveBlocks();
  const checks = STATE.checklists[STATE.activeTab] || [];
  const wheel = STATE.todayWheel;

  blocks.forEach((block, index) => {
    const isDone = Boolean(checks[index]);
    const blockNumStr = String(index + 1).padStart(2, "0");

    let displayTitle = block.title;
    let displayDuration = block.duration;

    if (STATE.activeTab === "school") {
      if (block.isWheel1) displayTitle = `${block.title} \u2014 ${wheel.deep1}`;
      else if (block.isWheel2) displayTitle = `${block.title} \u2014 ${wheel.deep2}`;
      else if (block.isWheelLight) displayTitle = `${block.title} \u2014 ${wheel.light}`;
      // Apply school settings to dynamic blocks
      if (block.isDynSchool) displayDuration = `8:00\u2013${STATE.schoolSettings.endTime}`;
      if (block.isDynCommute) displayDuration = STATE.schoolSettings.commuteDuration;
    }

    const itemElem = document.createElement("div");
    itemElem.className = `block-item${isDone ? " done" : ""}`;

    const nodeElem = document.createElement("div");
    nodeElem.className = "block-node";
    nodeElem.setAttribute("aria-hidden", "true");

    const cardElem = document.createElement("div");
    cardElem.className = "block-card";
    cardElem.setAttribute("role", "checkbox");
    cardElem.setAttribute("aria-checked", isDone ? "true" : "false");
    cardElem.setAttribute("tabindex", "0");

    const mainElem = document.createElement("div");
    mainElem.className = "block-main";

    const eyebrowElem = document.createElement("div");
    eyebrowElem.className = "block-eyebrow";
    eyebrowElem.textContent = `#${blockNumStr} \u00B7 BLOCK`;

    const titleElem = document.createElement("div");
    titleElem.className = "block-title";
    titleElem.textContent = `${block.icon} ${displayTitle}`;

    const detailElem = document.createElement("div");
    detailElem.className = "block-detail";
    detailElem.textContent = `"${block.detail}"`;

    mainElem.appendChild(eyebrowElem);
    mainElem.appendChild(titleElem);
    mainElem.appendChild(detailElem);

    const metaElem = document.createElement("div");
    metaElem.className = "block-meta";

    const durElem = document.createElement("div");
    durElem.className = "block-duration";
    durElem.textContent = displayDuration;

    const checkElem = document.createElement("div");
    checkElem.className = "custom-checkbox";
    if (isDone) {
      checkElem.style.setProperty("background-color", "#8a9a68", "important");
      checkElem.style.setProperty("border-color", "#8a9a68", "important");
    }
    checkElem.innerHTML = `<svg class="checkmark-icon" style="opacity: ${isDone ? "1" : "0"} !important; stroke: #12161c !important; stroke-width: 3;" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

    metaElem.appendChild(durElem);
    metaElem.appendChild(checkElem);

    cardElem.appendChild(mainElem);
    cardElem.appendChild(metaElem);

    itemElem.appendChild(nodeElem);
    itemElem.appendChild(cardElem);

    const toggleHandler = () => toggleBlockCheck(index);
    cardElem.addEventListener("click", toggleHandler);
    cardElem.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggleHandler(); }
    });

    container.appendChild(itemElem);
  });

  updateProgressBar();
}

function toggleBlockCheck(index) {
  STATE.checklists[STATE.activeTab][index] = !STATE.checklists[STATE.activeTab][index];
  saveChecklistState();
  renderDailyTimeline();
}

async function saveChecklistState() {
  await StorageLayer.set(`checklist:${STATE.dateStr}`, STATE.checklists);
}

function updateProgressBar() {
  const checks = STATE.checklists[STATE.activeTab] || [];
  const total = checks.length;
  const doneCount = checks.filter(Boolean).length;
  const percentage = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  document.getElementById("progress-text").textContent = `${doneCount} / ${total} COMPLETED (${percentage}%)`;
  document.getElementById("progress-fill-bar").style.width = `${percentage}%`;
}

/* ─────────────────────────────────────────────────────────────────
   10. SYSTEM TAB RENDERER
   ───────────────────────────────────────────────────────────────── */

function renderSystemTabSections() {
  renderWeeklyReset();

  document.getElementById("wrev-q1").value = STATE.weeklyReview.q1;
  document.getElementById("wrev-q2").value = STATE.weeklyReview.q2;
  document.getElementById("wrev-q3").value = STATE.weeklyReview.q3;

  renderSyllabusProgress();

  document.getElementById("mref-q1").value = STATE.monthlyReflection.q1;
  document.getElementById("mref-q2").value = STATE.monthlyReflection.q2;
  document.getElementById("mref-q3").value = STATE.monthlyReflection.q3;

  renderSchoolSettings();
}

function renderWeeklyReset() {
  const container = document.getElementById("weekly-reset-list");
  container.innerHTML = "";

  WEEKLY_RESET_ITEMS.forEach((text, idx) => {
    const isDone = Boolean(STATE.weeklyReset[idx]);
    const item = document.createElement("div");
    item.className = `system-check-item${isDone ? " done" : ""}`;
    item.setAttribute("role", "checkbox");
    item.setAttribute("aria-checked", isDone ? "true" : "false");
    item.setAttribute("tabindex", "0");

    const textSpan = document.createElement("span");
    textSpan.className = "system-check-text";
    textSpan.textContent = text;

    const checkElem = document.createElement("div");
    checkElem.className = "custom-checkbox";
    if (isDone) {
      checkElem.style.setProperty("background-color", "#8a9a68", "important");
      checkElem.style.setProperty("border-color", "#8a9a68", "important");
    }
    checkElem.innerHTML = `<svg class="checkmark-icon" style="opacity: ${isDone ? "1" : "0"} !important; stroke: #12161c !important; stroke-width: 3;" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

    item.appendChild(textSpan);
    item.appendChild(checkElem);

    const toggle = () => {
      STATE.weeklyReset[idx] = !STATE.weeklyReset[idx];
      StorageLayer.set(`weekly-reset:${STATE.isoWeekStr}`, STATE.weeklyReset);
      updateSystemBadgeUI();
      renderWeeklyReset();
    };

    item.addEventListener("click", toggle);
    item.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
    });

    container.appendChild(item);
  });
}

function renderSyllabusProgress() {
  const container = document.getElementById("syllabus-list");
  container.innerHTML = "";

  SYLLABUS_SUBJECTS.forEach(subject => {
    const val = STATE.syllabus[subject] || 0;

    const row = document.createElement("div");
    row.className = "syllabus-row";

    const nameDiv = document.createElement("div");
    nameDiv.className = "syllabus-name";
    nameDiv.textContent = subject;

    const trackDiv = document.createElement("div");
    trackDiv.className = "syllabus-track";
    const fillDiv = document.createElement("div");
    fillDiv.className = "syllabus-fill";
    fillDiv.style.width = `${Math.min(100, Math.max(0, val))}%`;
    trackDiv.appendChild(fillDiv);

    const inputWrap = document.createElement("div");
    inputWrap.className = "syllabus-input-wrap";
    const input = document.createElement("input");
    input.type = "number"; input.min = "0"; input.max = "100"; input.value = val;
    input.className = "syllabus-input";
    input.setAttribute("aria-label", `${subject} syllabus percentage`);
    const unitSpan = document.createElement("span");
    unitSpan.textContent = "%";
    inputWrap.appendChild(input);
    inputWrap.appendChild(unitSpan);

    row.appendChild(nameDiv);
    row.appendChild(trackDiv);
    row.appendChild(inputWrap);

    const saveVal = () => {
      let num = parseInt(input.value, 10);
      if (isNaN(num)) num = 0;
      num = Math.min(100, Math.max(0, num));
      input.value = num;
      fillDiv.style.width = `${num}%`;
      STATE.syllabus[subject] = num;
      StorageLayer.set(`syllabus:${STATE.yearMonthStr}`, STATE.syllabus);
    };

    input.addEventListener("blur", saveVal);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { saveVal(); input.blur(); } });

    container.appendChild(row);
  });
}

function flashSaveIndicator(flashId) {
  const elem = document.getElementById(flashId);
  if (!elem) return;
  elem.classList.add("visible");
  setTimeout(() => elem.classList.remove("visible"), 1500);
}

/* ─────────────────────────────────────────────────────────────────
   11. SCHOOL SETTINGS (Editable end time & commute)
   ───────────────────────────────────────────────────────────────── */

function renderSchoolSettings() {
  const endTimeInput = document.getElementById("setting-school-end");
  const commuteInput = document.getElementById("setting-commute");
  if (endTimeInput) endTimeInput.value = STATE.schoolSettings.endTime;
  if (commuteInput) commuteInput.value = STATE.schoolSettings.commuteDuration;
}

async function saveSchoolSettings() {
  await StorageLayer.set("school_settings", STATE.schoolSettings);
  flashSaveIndicator("flash-settings");
  if (STATE.activeTab === "school") renderDailyTimeline();
}

/* ─────────────────────────────────────────────────────────────────
   12. HABITS TAB RENDERER
   ───────────────────────────────────────────────────────────────── */

function renderHabitsTabSections() {
  renderHabitTracker();
  renderConsistencyHeatmap();
  renderHabitBreakdown();
  renderWeeklyTrend();
  renderHabitInsights();
}

function renderHabitTracker() {
  const container = document.getElementById("habits-today-list");
  container.innerHTML = "";

  HABIT_ITEMS.forEach((text, idx) => {
    const isDone = Boolean(STATE.habits[idx]);
    const item = document.createElement("div");
    item.className = `system-check-item${isDone ? " done" : ""}`;
    item.setAttribute("role", "checkbox");
    item.setAttribute("aria-checked", isDone ? "true" : "false");
    item.setAttribute("tabindex", "0");

    const textSpan = document.createElement("span");
    textSpan.className = "system-check-text";
    textSpan.textContent = text;

    const checkElem = document.createElement("div");
    checkElem.className = "custom-checkbox";
    if (isDone) {
      checkElem.style.setProperty("background-color", "#8a9a68", "important");
      checkElem.style.setProperty("border-color", "#8a9a68", "important");
    }
    checkElem.innerHTML = `<svg class="checkmark-icon" style="opacity: ${isDone ? "1" : "0"} !important; stroke: #12161c !important; stroke-width: 3;" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

    item.appendChild(textSpan);
    item.appendChild(checkElem);

    const toggle = () => {
      STATE.habits[idx] = !STATE.habits[idx];
      STATE.habitHistory[STATE.dateStr] = [...STATE.habits];
      updateHabitsBadgeUI();
      renderHabitsTabSections();
      StorageLayer.set(`habits:${STATE.dateStr}`, STATE.habits);
    };

    item.addEventListener("click", toggle);
    item.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
    });

    container.appendChild(item);
  });
}

function getDateRangeArray(numDays) {
  const dates = [];
  const now = new Date();
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push({ dateStr: getTodayDateString(d), dateObj: d });
  }
  return dates;
}

function renderConsistencyHeatmap() {
  const range = STATE.heatmapRange || 30;
  const dates = getDateRangeArray(range);
  const container = document.getElementById("heatmap-container");
  const emptyContainer = document.getElementById("heatmap-empty-state");
  const detailBox = document.getElementById("heatmap-detail-box");
  container.innerHTML = "";

  const trackedDates = dates.filter(d => STATE.habitHistory[d.dateStr] !== undefined);
  if (trackedDates.length === 0) {
    container.style.display = "none";
    emptyContainer.style.display = "block";
    detailBox.style.display = "none";
    return;
  }
  container.style.display = "block";
  emptyContainer.style.display = "none";

  document.getElementById("btn-range-30").classList.toggle("active", range === 30);
  document.getElementById("btn-range-90").classList.toggle("active", range === 90);

  const gridElem = document.createElement("div");
  gridElem.className = "heatmap-grid";
  if (range === 90) gridElem.classList.add("range-90");

  const daysOfWeek = ["M", "T", "W", "T", "F", "S", "S"];
  const headerRow = document.createElement("div");
  headerRow.className = "heatmap-header-row";
  daysOfWeek.forEach(dName => {
    const label = document.createElement("span");
    label.className = "heatmap-header-label";
    label.textContent = dName;
    headerRow.appendChild(label);
  });
  gridElem.appendChild(headerRow);

  const cellsContainer = document.createElement("div");
  cellsContainer.className = "heatmap-cells";

  dates.forEach(item => {
    const entry = STATE.habitHistory[item.dateStr];
    let statusClass = "no-data";
    let doneCount = 0;
    if (entry !== undefined) {
      doneCount = entry.filter(Boolean).length;
      statusClass = `step-${doneCount}`;
    }

    const cell = document.createElement("div");
    cell.className = `heatmap-cell ${statusClass}`;
    cell.setAttribute("tabindex", "0");
    cell.setAttribute("aria-label", item.dateStr + ": " + (entry !== undefined ? doneCount + "/6 habits" : "No data"));

    const selectCell = () => {
      showHeatmapCellDetail(item.dateStr, entry);
      cellsContainer.querySelectorAll(".heatmap-cell").forEach(c => c.classList.remove("selected"));
      cell.classList.add("selected");
    };

    cell.addEventListener("click", selectCell);
    cell.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); selectCell(); }
    });

    cellsContainer.appendChild(cell);
  });

  gridElem.appendChild(cellsContainer);
  container.appendChild(gridElem);
}

function showHeatmapCellDetail(dateStr, entry) {
  const detailBox = document.getElementById("heatmap-detail-box");
  detailBox.style.display = "block";

  const dateObj = new Date(dateStr + "T00:00:00");
  const formatted = dateObj.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

  let html = `<div class="detail-header"><strong>${formatted}</strong>`;
  if (entry === undefined) {
    html += ` <span style="color: var(--text-dim); font-size: 11px; font-family: var(--font-mono);">(NO DATA TRACKED)</span></div>`;
    html += `<div style="font-size: 12px; color: var(--text-dim); margin-top: 4px;">No habits were logged on this date.</div>`;
  } else {
    const doneCount = entry.filter(Boolean).length;
    html += ` <span style="color: var(--olive); font-size: 12px; font-weight: 600; font-family: var(--font-mono);">${doneCount} / 6 DONE</span></div>`;
    html += `<div class="detail-habits-grid">`;
    HABIT_ITEMS.forEach((habitName, idx) => {
      const isDone = Boolean(entry[idx]);
      const symbol = isDone ? "\u2713" : "-";
      const statusClass = isDone ? "done" : "missed";
      html += `<div class="detail-habit-item ${statusClass}"><span>${symbol}</span> ${habitName}</div>`;
    });
    html += `</div>`;
  }
  detailBox.innerHTML = html;
}

function renderHabitBreakdown() {
  const range = STATE.heatmapRange || 30;
  const dates = getDateRangeArray(range);
  const container = document.getElementById("breakdown-container");
  const emptyContainer = document.getElementById("breakdown-empty-state");
  container.innerHTML = "";

  const trackedDates = dates.filter(d => STATE.habitHistory[d.dateStr] !== undefined);
  if (trackedDates.length < 3) {
    container.style.display = "none";
    emptyContainer.style.display = "block";
    return;
  }
  container.style.display = "block";
  emptyContainer.style.display = "none";

  const denom = trackedDates.length;
  const breakdown = HABIT_ITEMS.map((name, idx) => {
    let doneSum = 0;
    trackedDates.forEach(d => { if (STATE.habitHistory[d.dateStr][idx]) doneSum++; });
    return { name, rate: Math.round((doneSum / denom) * 100) };
  });
  breakdown.sort((a, b) => a.rate - b.rate);

  breakdown.forEach(item => {
    const row = document.createElement("div");
    row.className = "syllabus-row";

    const nameDiv = document.createElement("div");
    nameDiv.className = "syllabus-name";
    nameDiv.style.width = "170px";
    nameDiv.textContent = item.name;

    const trackDiv = document.createElement("div");
    trackDiv.className = "syllabus-track";
    const fillDiv = document.createElement("div");
    fillDiv.className = "syllabus-fill";
    fillDiv.style.width = `${item.rate}%`;
    trackDiv.appendChild(fillDiv);

    const valDiv = document.createElement("div");
    valDiv.style.cssText = "font-family:var(--font-mono);font-size:12px;color:var(--text-dim);width:45px;text-align:right;";
    valDiv.textContent = `${item.rate}%`;

    row.appendChild(nameDiv);
    row.appendChild(trackDiv);
    row.appendChild(valDiv);
    container.appendChild(row);
  });
}

function renderWeeklyTrend() {
  const container = document.getElementById("trend-container");
  const emptyContainer = document.getElementById("trend-empty-state");
  container.innerHTML = "";

  const weeks = [];
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - (i * 7));
    const wStr = getISOWeekString(d);
    if (!weeks.includes(wStr)) weeks.push(wStr);
  }

  let totalTrackedWeeks = 0;
  const weekPoints = weeks.map(wStr => {
    let dayScores = [];
    Object.keys(STATE.habitHistory).forEach(dStr => {
      const dObj = new Date(dStr + "T00:00:00");
      if (getISOWeekString(dObj) === wStr) {
        dayScores.push(STATE.habitHistory[dStr].filter(Boolean).length);
      }
    });
    if (dayScores.length > 0) {
      totalTrackedWeeks++;
      return { wStr, avg: dayScores.reduce((a, b) => a + b, 0) / dayScores.length, hasData: true };
    }
    return { wStr, avg: 0, hasData: false };
  });

  if (totalTrackedWeeks < 2) {
    container.style.display = "none";
    emptyContainer.style.display = "block";
    return;
  }
  container.style.display = "block";
  emptyContainer.style.display = "none";

  const width = 600, height = 120, padding = 24;
  const graphW = width - (padding * 2), graphH = height - (padding * 2);
  const stepX = graphW / (weeks.length - 1);

  let polylinePoints = [];
  let svgContent = `<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:120px;overflow:visible;">`;
  svgContent += `<line x1="${padding}" y1="${padding}" x2="${width - padding}" y2="${padding}" stroke="var(--line)" stroke-dasharray="4 4" stroke-width="1"/>`;
  svgContent += `<text x="${width - padding}" y="${padding - 4}" fill="var(--text-dim)" font-family="var(--font-mono)" font-size="10" text-anchor="end">CEILING 6/6</text>`;

  weekPoints.forEach((pt, i) => {
    const x = padding + (i * stepX);
    const wLabel = "W" + pt.wStr.split("-W")[1];
    svgContent += `<text x="${x}" y="${height - 4}" fill="var(--text-dim)" font-family="var(--font-mono)" font-size="10" text-anchor="middle">${wLabel}</text>`;
    if (pt.hasData) {
      const y = height - padding - ((pt.avg / 6) * graphH);
      polylinePoints.push(`${x},${y}`);
      svgContent += `<circle cx="${x}" cy="${y}" r="3.5" fill="var(--olive)"/>`;
    }
  });

  if (polylinePoints.length > 1) {
    svgContent += `<polyline points="${polylinePoints.join(" ")}" fill="none" stroke="var(--olive)" stroke-width="2" stroke-linejoin="round"/>`;
  }

  svgContent += `</svg>`;
  container.innerHTML = svgContent;
}

function renderHabitInsights() {
  const container = document.getElementById("insights-container");
  container.innerHTML = "";

  const range = STATE.heatmapRange || 30;
  const dates = getDateRangeArray(range);
  const trackedDates = dates.filter(d => STATE.habitHistory[d.dateStr] !== undefined);

  if (trackedDates.length < 3) {
    container.style.display = "none";
    return;
  }
  container.style.display = "block";

  const denom = trackedDates.length;
  const breakdown = HABIT_ITEMS.map((name, idx) => {
    let doneSum = 0;
    trackedDates.forEach(d => { if (STATE.habitHistory[d.dateStr][idx]) doneSum++; });
    return { name, rate: Math.round((doneSum / denom) * 100) };
  });

  const lowestRate = Math.min(...breakdown.map(b => b.rate));
  const weakestHabits = breakdown.filter(b => b.rate === lowestRate).map(b => b.name);

  let calloutText;
  if (weakestHabits.length === 1) {
    calloutText = `"${weakestHabits[0]} is your lowest completion rate this period (${lowestRate}%) \u2014 worth a look."`;
  } else {
    calloutText = `"${weakestHabits.join(", ")} are tied for lowest completion rate this period (${lowestRate}%) \u2014 worth a look."`;
  }

  const calloutCard = document.createElement("div");
  calloutCard.className = "table-caption-amber";
  calloutCard.style.cssText = "padding:12px 14px;background-color:rgba(217,164,65,0.08);border-left:3px solid var(--amber);border-radius:6px;margin-bottom:12px;";
  calloutCard.textContent = calloutText;
  container.appendChild(calloutCard);

  let maxDone = 0;
  const dayCounts = trackedDates.map(d => {
    const done = STATE.habitHistory[d.dateStr].filter(Boolean).length;
    if (done > maxDone) maxDone = done;
    return { dateStr: d.dateStr, count: done };
  });

  const bestDays = dayCounts.filter(dc => dc.count === maxDone);
  let bestDayText = "";
  if (bestDays.length <= 3 && maxDone > 0) {
    const dObj = new Date(bestDays[0].dateStr + "T00:00:00");
    bestDayText = `Best day: ${dObj.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} \u2014 ${maxDone}/6`;
  }

  const fullCompletionCount = dayCounts.filter(dc => dc.count === 6).length;
  const streakText = `Full completion: ${fullCompletionCount} of last ${denom} tracked days`;

  const statsRow = document.createElement("div");
  statsRow.style.cssText = "font-family:var(--font-mono);font-size:12px;color:var(--text-dim);display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;";
  statsRow.innerHTML = `<span>${streakText}</span>` + (bestDayText ? `<span>${bestDayText}</span>` : "");
  container.appendChild(statsRow);
}

/* ─────────────────────────────────────────────────────────────────
   13. JSON EXPORT / IMPORT (Backup & Restore)
   ───────────────────────────────────────────────────────────────── */

async function exportAllData() {
  const exportBtn = document.getElementById("btn-export-data");
  if (exportBtn) exportBtn.textContent = "Exporting...";

  const allData = {};
  const collections = ["checklists", "habits", "weeklyReset", "weeklyReview", "syllabus", "monthlyReflection", "dayType", "meta"];

  if (firestoreReady && syncCode) {
    try {
      for (const collName of collections) {
        const collRef = collection(db, "users", syncCode, collName);
        const snap = await getDocs(collRef);
        const docs = {};
        snap.forEach(d => { docs[d.id] = d.data(); });
        if (Object.keys(docs).length > 0) allData[collName] = docs;
      }
    } catch (err) {
      console.warn("[Export] Firestore read error:", err);
    }
  }

  // Also include memory store as fallback
  if (Object.keys(allData).length === 0) {
    allData._memoryStore = { ...memoryStore };
  }

  allData._meta = {
    exportedAt: new Date().toISOString(),
    syncCode: syncCode,
    version: "1.0"
  };

  const blob = new Blob([JSON.stringify(allData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `timetable-backup-${getTodayDateString()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  if (exportBtn) exportBtn.textContent = "\u2913 Export All Data";
  flashSaveIndicator("flash-export");
}

async function importData(file) {
  const importBtn = document.getElementById("btn-import-data");
  if (importBtn) importBtn.textContent = "Importing...";

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (firestoreReady && syncCode) {
      const collections = ["checklists", "habits", "weeklyReset", "weeklyReview", "syllabus", "monthlyReflection", "dayType", "meta"];
      for (const collName of collections) {
        if (data[collName] && typeof data[collName] === "object") {
          for (const [docId, docData] of Object.entries(data[collName])) {
            const ref = doc(db, "users", syncCode, collName, docId);
            await setDoc(ref, docData, { merge: true });
          }
        }
      }
    }

    alert("Import complete! The page will reload to apply changes.");
    location.reload();
  } catch (err) {
    console.error("[Import] Error:", err);
    alert("Import failed: " + err.message);
  }

  if (importBtn) importBtn.textContent = "\u2912 Import Backup";
}

/* ─────────────────────────────────────────────────────────────────
   14. EVENT BINDINGS
   ───────────────────────────────────────────────────────────────── */

function bindEvents() {
  // Tab navigation
  document.getElementById("tab-school").addEventListener("click", () => switchTab("school"));
  document.getElementById("tab-holiday").addEventListener("click", () => switchTab("holiday"));
  document.getElementById("tab-busy").addEventListener("click", () => switchTab("busy"));
  document.getElementById("tab-system").addEventListener("click", () => switchTab("system"));
  document.getElementById("tab-habits").addEventListener("click", () => switchTab("habits"));

  // Sleep phase
  document.getElementById("sleep-phase-select").addEventListener("change", async (e) => {
    STATE.sleepPhase = e.target.value;
    updateSleepPhaseUI(STATE.sleepPhase);
    await StorageLayer.set("sleep_phase", STATE.sleepPhase);
  });

  // Reset checklist
  document.getElementById("reset-checklist-btn").addEventListener("click", async () => {
    STATE.checklists[STATE.activeTab] = new Array(getActiveBlocks().length).fill(false);
    await saveChecklistState();
    renderDailyTimeline();
  });

  // Collapsible sleep rationale
  const sleepHeader = document.getElementById("sleep-rationale-header");
  const sleepBody = document.getElementById("sleep-rationale-body");
  const sleepToggle = document.getElementById("sleep-rationale-toggle");
  sleepHeader.addEventListener("click", () => {
    const isExpanded = sleepBody.classList.contains("expanded");
    sleepBody.classList.toggle("expanded", !isExpanded);
    sleepToggle.textContent = isExpanded ? "[+] Expand" : "[-] Collapse";
  });

  // Weekly review blur saves
  ["wrev-q1", "wrev-q2", "wrev-q3"].forEach((id, idx) => {
    document.getElementById(id).addEventListener("blur", function () {
      STATE.weeklyReview[["q1", "q2", "q3"][idx]] = this.value.trim();
      StorageLayer.set(`weekly-review:${STATE.isoWeekStr}`, STATE.weeklyReview);
      flashSaveIndicator(`flash-w${idx + 1}`);
    });
  });

  // Monthly reflection blur saves
  ["mref-q1", "mref-q2", "mref-q3"].forEach((id, idx) => {
    document.getElementById(id).addEventListener("blur", function () {
      STATE.monthlyReflection[["q1", "q2", "q3"][idx]] = this.value.trim();
      StorageLayer.set(`monthly-reflection:${STATE.yearMonthStr}`, STATE.monthlyReflection);
      flashSaveIndicator(`flash-m${idx + 1}`);
    });
  });

  // Heatmap range toggles
  document.getElementById("btn-range-30").addEventListener("click", () => {
    if (STATE.heatmapRange === 30) return;
    STATE.heatmapRange = 30;
    renderHabitsTabSections();
  });
  document.getElementById("btn-range-90").addEventListener("click", () => {
    if (STATE.heatmapRange === 90) return;
    STATE.heatmapRange = 90;
    renderHabitsTabSections();
  });

  // School settings
  const endTimeInput = document.getElementById("setting-school-end");
  const commuteInput = document.getElementById("setting-commute");
  if (endTimeInput) {
    endTimeInput.addEventListener("blur", function () {
      STATE.schoolSettings.endTime = this.value.trim() || "4:00\u20135:00 PM";
      saveSchoolSettings();
    });
  }
  if (commuteInput) {
    commuteInput.addEventListener("blur", function () {
      STATE.schoolSettings.commuteDuration = this.value.trim() || "30 min";
      saveSchoolSettings();
    });
  }

  // Sync code management
  const copyCodeBtn = document.getElementById("btn-copy-sync-code");
  if (copyCodeBtn) {
    copyCodeBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(syncCode || "").then(() => {
        copyCodeBtn.textContent = "Copied!";
        setTimeout(() => { copyCodeBtn.textContent = "Copy"; }, 1500);
      }).catch(() => {
        prompt("Your sync code:", syncCode);
      });
    });
  }

  const changeCodeBtn = document.getElementById("btn-change-sync-code");
  if (changeCodeBtn) {
    changeCodeBtn.addEventListener("click", async () => {
      const newCode = prompt("Enter new sync code (this will switch your data source):", "");
      if (newCode && newCode.trim()) {
        syncCode = newCode.trim();
        localStorage.setItem("timetable_sync_code", syncCode);
        location.reload();
      }
    });
  }

  // Export / Import
  // Day type selector buttons
  ["school", "holiday", "busy"].forEach(mode => {
    const btn = document.getElementById(`btn-select-${mode}`);
    if (btn) {
      btn.addEventListener("click", () => selectDayType(mode));
    }
  });

  const exportBtn = document.getElementById("btn-export-data");
  if (exportBtn) exportBtn.addEventListener("click", exportAllData);

  const importBtn = document.getElementById("btn-import-data");
  const importFileInput = document.getElementById("import-file-input");
  if (importBtn && importFileInput) {
    importBtn.addEventListener("click", () => importFileInput.click());
    importFileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) importData(e.target.files[0]);
    });
  }
}

function switchTab(mode) {
  const isDaily = ["school", "holiday", "busy"].includes(mode);

  if (isDaily && STATE.dayType !== null && STATE.dayType !== mode) {
    showLockToast(mode);
    return;
  }

  if (STATE.activeTab === mode) return;
  STATE.activeTab = mode;
  renderCurrentTab();
}

let lockToastTimer = null;
function showLockToast(targetMode) {
  const banner = document.getElementById("lock-toast-banner");
  if (!banner) return;
  const labels = { school: "School Day", holiday: "Holiday", busy: "Busy / Special Day" };
  const chosenLabel = labels[STATE.dayType] || STATE.dayType;
  banner.textContent = `Today is locked as ${chosenLabel} — resets tomorrow.`;
  banner.style.display = "block";
  if (lockToastTimer) clearTimeout(lockToastTimer);
  lockToastTimer = setTimeout(() => {
    banner.style.display = "none";
  }, 3500);
}

/* ─────────────────────────────────────────────────────────────────
   15. SERVICE WORKER REGISTRATION
   ───────────────────────────────────────────────────────────────── */

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js")
    .then(() => console.log("[SW] Registered."))
    .catch(err => console.warn("[SW] Registration failed:", err));
}

/* ─────────────────────────────────────────────────────────────────
   16. INIT ON DOM READY
   ───────────────────────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", initApp);
