/**
 * Firestore Database Module for Tuition & MIST Study Routine Planner
 * Real-time cloud sync, offline persistence, and multi-user isolation
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getActiveFirebaseConfig, isPlaceholderConfig, isDemo } from "./auth.js";

// Global Firestore instances
let db = null;
let persistenceEnabled = false;

// Real-time sync status listeners
const syncListeners = [];
export function onSyncStatus(cb) {
  syncListeners.push(cb);
}

export function notifySyncStatus(status, details = '') {
  syncListeners.forEach(cb => {
    try {
      cb({ status, details, timestamp: new Date() });
    } catch (e) {
      console.error("Sync listener error:", e);
    }
  });
}

// Initialize Firestore with offline persistence
export function initFirestore() {
  if (db) return db;

  const config = getActiveFirebaseConfig();
  if (isPlaceholderConfig(config)) {
    console.info("[Firestore] Placeholder config detected. Using reactive Local Sandbox engine.");
    return null;
  }

  try {
    const app = getApps().length > 0 ? getApp() : initializeApp(config);
    db = getFirestore(app);

    // Enable offline persistence
    if (!persistenceEnabled) {
      enableIndexedDbPersistence(db)
        .then(() => {
          persistenceEnabled = true;
          console.log("[Firestore] Offline persistence enabled successfully.");
        })
        .catch((err) => {
          if (err.code === 'failed-precondition') {
            console.warn("[Firestore] Multiple tabs open; offline persistence enabled in first tab only.");
          } else if (err.code === 'unimplemented') {
            console.warn("[Firestore] Current browser does not support IndexedDB offline persistence.");
          }
        });
    }

    return db;
  } catch (err) {
    console.error("[Firestore] Initialization failed, falling back to local engine:", err);
    return null;
  }
}

// -------------------------------------------------------------
// DEFAULT SEED DATA (For New Users)
// -------------------------------------------------------------
export const defaultTuitions = [
  // Track A: 5 students (4 days/wk: Sun, Tue, Thu, Fri)
  {
    id: 't_jisan',
    name: 'Jisan (Class 7)',
    area: 'Manikdi (Local)',
    daysPerWeek: 4,
    daysDone: 0,
    fee: 5000,
    paid: false,
    track: 'A',
    slotOrder: 1,
    note: 'Start inside Manikdi right after midday break'
  },
  {
    id: 't_mahadi',
    name: 'Mahadi (Class 5)',
    area: 'Manikdi / Nearby',
    daysPerWeek: 4,
    daysDone: 0,
    fee: 8000,
    paid: false,
    track: 'A',
    slotOrder: 2,
    note: 'Second local slot before heading toward Nirjor'
  },
  {
    id: 't_zayan',
    name: 'Zayan (Class 9)',
    area: 'Nirjor Cantt',
    daysPerWeek: 4,
    daysDone: 0,
    fee: 12000,
    paid: false,
    track: 'A',
    slotOrder: 3,
    note: 'High-priority Class 9 tuition in Nirjor Cantonment'
  },
  {
    id: 't_shafi',
    name: 'Shafi Sariye (Class 7)',
    area: 'Din Mohammad Colony',
    daysPerWeek: 4,
    daysDone: 0,
    fee: 6000,
    paid: false,
    track: 'A',
    slotOrder: 4,
    note: 'Adjacent to Nirjor / Vashantek corridor'
  },
  {
    id: 't_meherab',
    name: 'Meherab (Class 6)',
    area: 'Manikdi / Nearby',
    daysPerWeek: 4,
    daysDone: 0,
    fee: 5000,
    paid: false,
    track: 'A',
    slotOrder: 5,
    note: 'Final slot on return leg to Manikdi home'
  },

  // Track B: 5 students (3 days/wk: Sat, Mon, Wed)
  {
    id: 't_rosul',
    name: 'Rosul (Class 11)',
    area: 'At Your Home (Manikdi)',
    daysPerWeek: 3,
    daysDone: 0,
    fee: 2500,
    paid: false,
    track: 'B',
    slotOrder: 1,
    note: 'Comes to your home in Manikdi — zero travel!'
  },
  {
    id: 't_talha',
    name: 'Talha (Class 9)',
    area: 'Manikdi',
    daysPerWeek: 3,
    daysDone: 0,
    fee: 6000,
    paid: false,
    track: 'B',
    slotOrder: 2,
    note: 'Inside Manikdi neighborhood'
  },
  {
    id: 't_tannjil',
    name: 'Tannjil (Class 10)',
    area: 'Manikdi',
    daysPerWeek: 3,
    daysDone: 0,
    fee: 5500,
    paid: false,
    track: 'B',
    slotOrder: 3,
    note: 'SSC candidate inside Manikdi — chain right after Talha'
  },
  {
    id: 't_musab',
    name: 'Musab (Class 6)',
    area: 'Matikata',
    daysPerWeek: 3,
    daysDone: 0,
    fee: 6000,
    paid: false,
    track: 'B',
    slotOrder: 4,
    note: 'Short hop from Manikdi to Matikata'
  },
  {
    id: 't_rafsan',
    name: 'Rafsan (Class 11)',
    area: 'Vashantek',
    daysPerWeek: 3,
    daysDone: 0,
    fee: 10000,
    paid: false,
    track: 'B',
    slotOrder: 5,
    note: 'HSC Class 11 in Vashantek, then straight home to Manikdi'
  }
];

export const defaultStudyDays = [
  {
    id: 'd18',
    date: 'Sun, 18 Oct 2026 (Today)',
    course: 'CE-411',
    courseTitle: 'Structural Analysis & Design II',
    tag: '6 Days to CE-411',
    tasks: [
      { id: 's18_1', text: 'Morning (3h): Indeterminate Structures — Slope-Deflection & Moment Distribution frames (with & without sidesway)', done: false },
      { id: 's18_2', text: 'Midday (2.5h): Solve 4 past MIST Term Final numericals on MDM & sway frames', done: false },
      { id: 's18_3', text: 'Night (1h): Quick formula sheet review of fixed-end moments & distribution factors', done: false }
    ]
  },
  {
    id: 'd19',
    date: 'Mon, 19 Oct 2026',
    course: 'CE-411',
    courseTitle: 'Structural Analysis & Design II',
    tag: '5 Days to CE-411',
    tasks: [
      { id: 's19_1', text: 'Morning (3h): Stiffness Matrix & Flexibility Matrix methods for beams and trusses', done: false },
      { id: 's19_2', text: 'Midday (2.5h): Practice full global stiffness matrix assembly & boundary conditions by hand', done: false },
      { id: 's19_3', text: 'Night (1h): Review matrix transformations & check sign conventions', done: false }
    ]
  },
  {
    id: 'd20',
    date: 'Tue, 20 Oct 2026',
    course: 'CE-411',
    courseTitle: 'Structural Analysis & Design II',
    tag: '4 Days to CE-411',
    tasks: [
      { id: 's20_1', text: 'Morning (3h): Approximate analysis of multistory frames — Portal Method & Cantilever Method', done: false },
      { id: 's20_2', text: 'Midday (2.5h): Influence Lines for indeterminate structures (Muller-Breslau principle)', done: false },
      { id: 's20_3', text: 'Night (1h): Redo tricky class test / assignment problems from MIST lectures', done: false }
    ]
  },
  {
    id: 'd21',
    date: 'Wed, 21 Oct 2026',
    course: 'CE-411',
    courseTitle: 'Structural Analysis & Design II',
    tag: '3 Days to CE-411',
    tasks: [
      { id: 's21_1', text: 'Morning (3h): Structural Design II — Lateral load calculation (Wind & Seismic per BNBC) & RC frame detailing', done: false },
      { id: 's21_2', text: 'Midday (2.5h): Shear wall / mat foundation or special RC member design steps from lecture slides', done: false },
      { id: 's21_3', text: 'Night (1h): Memorize BNBC / ACI code coefficients & load combinations', done: false }
    ]
  },
  {
    id: 'd22',
    date: 'Thu, 22 Oct 2026',
    course: 'CE-411',
    courseTitle: 'Structural Analysis & Design II',
    tag: '2 Days to CE-411',
    tasks: [
      { id: 's22_1', text: 'Morning (3h): Timed full Section-A past MIST paper simulation (closed book)', done: false },
      { id: 's22_2', text: 'Midday (2.5h): Timed full Section-B past MIST paper simulation & error audit', done: false },
      { id: 's22_3', text: 'Night (1h): Condense all weak formulas onto 1 A4 summary sheet', done: false }
    ]
  },
  {
    id: 'd23',
    date: 'Fri, 23 Oct 2026 (Exam Eve)',
    course: 'CE-411',
    courseTitle: 'Structural Analysis & Design II',
    tag: 'EXAM TOMORROW',
    tasks: [
      { id: 's23_1', text: 'Morning (3.5h): High-yield numerical walk-through (Stiffness, MDM, Portal, BNBC loads)', done: false },
      { id: 's23_2', text: 'Midday (2h): Review all class notes, theory short questions & calculator matrix mode setup', done: false },
      { id: 's23_3', text: 'Evening (8:45–10:30 PM after 1.1h light tuitions): Final formula scan & sleep early', done: false }
    ]
  },
  {
    id: 'd24',
    date: 'Sat, 24 Oct 2026 (CE-411 EXAM DAY)',
    course: 'CE-413',
    courseTitle: 'Exam Morning + Start CE-413 Steel',
    tag: 'EXAM DAY',
    tasks: [
      { id: 's24_1', text: 'Morning: Sit for CE-411 Structural Analysis and Design II Term Final at MIST', done: false },
      { id: 's24_2', text: 'Night (10:00–11:00 PM): Organize CE-413 Design of Steel Structures AISC charts & lecture handouts', done: false }
    ]
  },
  {
    id: 'd25',
    date: 'Sun, 25 Oct 2026',
    course: 'CE-413',
    courseTitle: 'Design of Steel Structures',
    tag: '6 Days to CE-413',
    tasks: [
      { id: 's25_1', text: 'Morning (3h): Tension Members — Gross/Net area, staggered fasteners, shear lag factor U', done: false },
      { id: 's25_2', text: 'Midday (2.5h): Block shear rupture capacity (LRFD & ASD) + design of tension rods/angles', done: false },
      { id: 's25_3', text: 'Night (1h): Tabulate AISC table page numbers for quick exam lookup', done: false }
    ]
  },
  {
    id: 'd26',
    date: 'Mon, 26 Oct 2026',
    course: 'CE-413',
    courseTitle: 'Design of Steel Structures',
    tag: '5 Days to CE-413',
    tasks: [
      { id: 's26_1', text: 'Morning (3h): Compression Members / Columns — Euler buckling, KL/r, local buckling limits', done: false },
      { id: 's26_2', text: 'Midday (2.5h): Column design using AISC tables & alignment charts for frame columns', done: false },
      { id: 's26_3', text: 'Night (1h): Built-up compression members & lacing/batten checks', done: false }
    ]
  },
  {
    id: 'd27',
    date: 'Tue, 27 Oct 2026',
    course: 'CE-413',
    courseTitle: 'Design of Steel Structures',
    tag: '4 Days to CE-413',
    tasks: [
      { id: 's27_1', text: 'Morning (3h): Flexural Members (Beams) — Plastic moment Mp, compact/non-compact web & flange checks', done: false },
      { id: 's27_2', text: 'Midday (2.5h): Lateral-Torsional Buckling Zones & Cb factor', done: false },
      { id: 's27_3', text: 'Night (1h): Beam shear strength, deflection checks & web crippling/yielding', done: false }
    ]
  },
  {
    id: 'd28',
    date: 'Wed, 28 Oct 2026',
    course: 'CE-413',
    courseTitle: 'Design of Steel Structures',
    tag: '3 Days to CE-413',
    tasks: [
      { id: 's28_1', text: 'Morning (3h): Beam-Columns — Combined axial + bending interaction equations & moment magnification', done: false },
      { id: 's28_2', text: 'Midday (2.5h): Plate Girders & Base Plate design numericals from MIST lecture notes', done: false },
      { id: 's28_3', text: 'Night (1h): Review interaction equation flowcharts', done: false }
    ]
  },
  {
    id: 'd29',
    date: 'Thu, 29 Oct 2026',
    course: 'CE-413',
    courseTitle: 'Design of Steel Structures',
    tag: '2 Days to CE-413',
    tasks: [
      { id: 's29_1', text: 'Morning (3h): Bolted Connections — Bearing vs slip-critical, eccentric shear', done: false },
      { id: 's29_2', text: 'Midday (2.5h): Welded Connections — Fillet weld throat checks, eccentric loads on welds + 2 past papers', done: false },
      { id: 's29_3', text: 'Night (1h): Verify all LRFD phi and ASD Omega factors across every chapter', done: false }
    ]
  },
  {
    id: 'd30',
    date: 'Fri, 30 Oct 2026 (Exam Eve)',
    course: 'CE-413',
    courseTitle: 'Design of Steel Structures',
    tag: 'EXAM TOMORROW',
    tasks: [
      { id: 's30_1', text: 'Morning (3.5h): Full past-paper speed drill (Tension, Column, Beam, Beam-Column, Connection)', done: false },
      { id: 's30_2', text: 'Midday (2h): Revise short theoretical questions & AISC specification commentary points', done: false },
      { id: 's30_3', text: 'Evening (8:45–10:30 PM after 1.1h light tuitions): Final checklist & early rest', done: false }
    ]
  },
  {
    id: 'd31',
    date: 'Sat, 31 Oct 2026 (CE-413 EXAM DAY)',
    course: 'CE-451',
    courseTitle: 'Exam Morning + Start CE-451 Highway/Rail',
    tag: 'EXAM DAY',
    tasks: [
      { id: 's31_1', text: 'Morning: Sit for CE-413 Design of Steel Structures Term Final at MIST', done: false },
      { id: 's31_2', text: 'Night (10:00–11:15 PM): Sort CE-451 Highway Materials, Pavement Design & Railways slides', done: false }
    ]
  },
  {
    id: 'd01',
    date: 'Sun, 01 Nov 2026',
    course: 'CE-451',
    courseTitle: 'Highway Materials, Pavement Design & Railways',
    tag: '3 Days to CE-451',
    tasks: [
      { id: 's01_1', text: 'Morning (3h): Highway Materials — Subgrade soil (CBR, resilient modulus Mr), aggregates & Bitumen tests', done: false },
      { id: 's01_2', text: 'Midday (2.5h): Marshall Mix Design numericals (Gmb, Gmm, Va, VMA, VFA, optimum bitumen content)', done: false },
      { id: 's01_3', text: 'Night (1h): Review lab test standards (penetration, ductility, softening point, LA abrasion)', done: false }
    ]
  },
  {
    id: 'd02',
    date: 'Mon, 02 Nov 2026',
    course: 'CE-451',
    courseTitle: 'Highway Materials, Pavement Design & Railways',
    tag: '2 Days to CE-451',
    tasks: [
      { id: 's02_1', text: 'Morning (3h): Flexible Pavement Design — ESAL traffic calculation, AASHTO 1993 Structural Number (SN)', done: false },
      { id: 's02_2', text: 'Midday (2.5h): Rigid Pavement Design — Westergaard wheel/temperature stresses, dowel & tie bar design', done: false },
      { id: 's02_3', text: 'Night (1h): Pavement distress types, overlays & maintenance short notes', done: false }
    ]
  },
  {
    id: 'd03',
    date: 'Tue, 03 Nov 2026 (Exam Eve)',
    course: 'CE-451',
    courseTitle: 'Highway Materials, Pavement Design & Railways',
    tag: 'FINAL EXAM TOMORROW',
    tasks: [
      { id: 's03_1', text: 'Morning (3.5h): Railway Engineering — Track components, gauge, cant/superelevation, transition curves', done: false },
      { id: 's03_2', text: 'Midday (2.5h): Sleeper density, points & crossings (turnout numericals), signaling & stations', done: false },
      { id: 's03_3', text: 'Evening (8:45–10:30 PM after 1.1h light tuitions): Final revision of Marshall + AASHTO + Railway formulas', done: false }
    ]
  },
  {
    id: 'd04',
    date: 'Wed, 04 Nov 2026 (FINAL EXAM DAY)',
    course: 'CE-451',
    courseTitle: 'Highway Materials, Pavement Design & Railways',
    tag: 'FINALS COMPLETE!',
    tasks: [
      { id: 's04_1', text: 'Morning: Sit for CE-451 Term Final at MIST — Celebrate finishing Level-4 Term Finals!', done: false },
      { id: 's04_2', text: 'Evening: Switch planner to Post-Nov 4 Vacation Mode until January', done: false }
    ]
  }
];

export const defaultSettings = {
  routineMode: 'exam', // 'exam' (1.25h), 'eve' (1.1h), 'post' (1.5h)
  routineShift: 'afternoon', // 'afternoon' or 'split'
  selectedDay: 'Sun',
  courseFilter: 'ALL',
  theme: 'dark'
};

// -------------------------------------------------------------
// LOCAL SANDBOX / DEMO STORAGE ENGINE
// -------------------------------------------------------------
const localEventTarget = new EventTarget();

function getLocalData(uid) {
  const key = `user_db_${uid}`;
  const raw = localStorage.getItem(key);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.adjustments) parsed.adjustments = [];
      return parsed;
    } catch (e) {
      console.warn("Corrupt local sandbox data, resetting:", e);
    }
  }
  // Initialize default
  const fresh = {
    profile: {
      name: 'Scholar User',
      email: 'user@manikdi.hub',
      theme: 'dark',
      createdAt: new Date().toISOString()
    },
    settings: { ...defaultSettings },
    tuitions: JSON.parse(JSON.stringify(defaultTuitions)),
    studyDays: JSON.parse(JSON.stringify(defaultStudyDays)),
    history: [],
    adjustments: []
  };
  localStorage.setItem(key, JSON.stringify(fresh));
  return fresh;
}

function saveLocalData(uid, data) {
  const key = `user_db_${uid}`;
  localStorage.setItem(key, JSON.stringify(data));
  localEventTarget.dispatchEvent(new CustomEvent(`sync_${uid}`, { detail: data }));
  notifySyncStatus('synced', 'Local cache updated');
}

// -------------------------------------------------------------
// DATA SEEDING & INITIALIZATION
// -------------------------------------------------------------
export async function initializeUserDataIfNew(uid, userObj) {
  if (!uid) return;

  const firestore = initFirestore();
  if (isDemo() || !firestore) {
    getLocalData(uid);
    return;
  }

  try {
    notifySyncStatus('syncing', 'Checking account data...');
    const userDocRef = doc(firestore, 'users', uid);
    const userDocSnap = await getDoc(userDocRef);

    if (!userDocSnap.exists()) {
      console.log(`[Firestore] New user detected (${uid}). Populating default data...`);
      notifySyncStatus('syncing', 'Initializing routine & students...');

      // 1. Root profile
      await setDoc(userDocRef, {
        profile: {
          name: userObj.displayName || 'Scholar User',
          email: userObj.email || '',
          photoURL: userObj.photoURL || '',
          theme: 'dark',
          createdAt: serverTimestamp()
        },
        settings: defaultSettings
      }, { merge: true });

      // 2. Batch write Tuitions
      const tuitionsColl = collection(firestore, 'users', uid, 'tuitions');
      const batch1 = writeBatch(firestore);
      defaultTuitions.forEach((t) => {
        const ref = doc(tuitionsColl, t.id);
        batch1.set(ref, {
          ...t,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      await batch1.commit();

      // 3. Batch write Study Days
      const studyColl = collection(firestore, 'users', uid, 'studyDays');
      const batch2 = writeBatch(firestore);
      defaultStudyDays.forEach((sd) => {
        const ref = doc(studyColl, sd.id);
        batch2.set(ref, {
          ...sd,
          createdAt: serverTimestamp()
        });
      });
      await batch2.commit();

      notifySyncStatus('synced', 'Welcome! Planner ready.');
    } else {
      notifySyncStatus('synced', 'Cloud synchronized');
    }
  } catch (err) {
    console.error("[Firestore] Data initialization error:", err);
    notifySyncStatus('error', err.message);
  }
}

// -------------------------------------------------------------
// REAL-TIME SUBSCRIPTIONS
// -------------------------------------------------------------

/**
 * Subscribe to User Settings & Profile
 */
export function subscribeSettings(uid, onData, onError) {
  if (!uid) return () => {};

  const firestore = initFirestore();
  if (isDemo() || !firestore) {
    const pushData = () => {
      const data = getLocalData(uid);
      onData({ settings: data.settings || defaultSettings, profile: data.profile || {} });
    };
    pushData();
    const handler = (e) => onData({ settings: e.detail.settings || defaultSettings, profile: e.detail.profile || {} });
    localEventTarget.addEventListener(`sync_${uid}`, handler);
    return () => localEventTarget.removeEventListener(`sync_${uid}`, handler);
  }

  const userDocRef = doc(firestore, 'users', uid);
  return onSnapshot(userDocRef, (snap) => {
    if (snap.exists()) {
      const val = snap.data();
      onData({ settings: val.settings || defaultSettings, profile: val.profile || {} });
      notifySyncStatus('synced', 'Settings updated');
    } else {
      onData({ settings: defaultSettings, profile: {} });
    }
  }, (err) => {
    console.error("[Firestore] Settings listener error:", err);
    notifySyncStatus('error', 'Error syncing settings');
    if (onError) onError(err);
  });
}

/**
 * Subscribe to Tuitions Collection (ordered by slotOrder)
 */
export function subscribeTuitions(uid, onData, onError) {
  if (!uid) return () => {};

  const firestore = initFirestore();
  if (isDemo() || !firestore) {
    const pushData = () => {
      const data = getLocalData(uid);
      const list = [...(data.tuitions || [])].sort((a, b) => (a.slotOrder || 0) - (b.slotOrder || 0));
      onData(list);
    };
    pushData();
    const handler = (e) => {
      const list = [...(e.detail.tuitions || [])].sort((a, b) => (a.slotOrder || 0) - (b.slotOrder || 0));
      onData(list);
    };
    localEventTarget.addEventListener(`sync_${uid}`, handler);
    return () => localEventTarget.removeEventListener(`sync_${uid}`, handler);
  }

  notifySyncStatus('syncing', 'Connecting to tuitions stream...');
  const tuitionsColl = collection(firestore, 'users', uid, 'tuitions');
  const q = query(tuitionsColl, orderBy('slotOrder', 'asc'));

  return onSnapshot(q, (snapshot) => {
    const items = [];
    snapshot.forEach((d) => {
      items.push({ id: d.id, ...d.data() });
    });
    onData(items);
    notifySyncStatus('synced', 'Tuitions live synced');
  }, (err) => {
    console.error("[Firestore] Tuitions listener error:", err);
    notifySyncStatus('error', 'Failed to sync tuitions');
    if (onError) onError(err);
  });
}

/**
 * Subscribe to Study Days Collection
 */
export function subscribeStudyDays(uid, onData, onError) {
  if (!uid) return () => {};

  const firestore = initFirestore();
  if (isDemo() || !firestore) {
    const pushData = () => {
      const data = getLocalData(uid);
      onData(data.studyDays || []);
    };
    pushData();
    const handler = (e) => onData(e.detail.studyDays || []);
    localEventTarget.addEventListener(`sync_${uid}`, handler);
    return () => localEventTarget.removeEventListener(`sync_${uid}`, handler);
  }

  notifySyncStatus('syncing', 'Connecting to study plan stream...');
  const studyColl = collection(firestore, 'users', uid, 'studyDays');

  return onSnapshot(studyColl, (snapshot) => {
    const items = [];
    snapshot.forEach((d) => {
      items.push({ id: d.id, ...d.data() });
    });
    // Sort study days chronologically by id or default order
    const orderedIds = defaultStudyDays.map(x => x.id);
    items.sort((a, b) => {
      const idxA = orderedIds.indexOf(a.id);
      const idxB = orderedIds.indexOf(b.id);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      return (a.id || '').localeCompare(b.id || '');
    });
    onData(items);
    notifySyncStatus('synced', 'Study plan live synced');
  }, (err) => {
    console.error("[Firestore] Study plan listener error:", err);
    notifySyncStatus('error', 'Failed to sync study plan');
    if (onError) onError(err);
  });
}

/**
 * Subscribe to Archival History
 */
export function subscribeHistory(uid, onData) {
  if (!uid) return () => {};

  const firestore = initFirestore();
  if (isDemo() || !firestore) {
    const pushData = () => {
      const data = getLocalData(uid);
      onData(data.history || []);
    };
    pushData();
    const handler = (e) => onData(e.detail.history || []);
    localEventTarget.addEventListener(`sync_${uid}`, handler);
    return () => localEventTarget.removeEventListener(`sync_${uid}`, handler);
  }

  const histColl = collection(firestore, 'users', uid, 'history');
  const q = query(histColl, orderBy('archivedAt', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const items = [];
    snapshot.forEach((d) => items.push({ id: d.id, ...d.data() }));
    onData(items);
  }, (err) => {
    console.error("[Firestore] History listener error:", err);
  });
}

/**
 * Subscribe to Session Adjustments Collection (Shifted, Cancelled, Online)
 */
export function subscribeAdjustments(uid, onData, onError) {
  if (!uid) return () => {};

  const firestore = initFirestore();
  if (isDemo() || !firestore) {
    const pushData = () => {
      const data = getLocalData(uid);
      onData(data.adjustments || []);
    };
    pushData();
    const handler = (e) => onData(e.detail.adjustments || []);
    localEventTarget.addEventListener(`sync_${uid}`, handler);
    return () => localEventTarget.removeEventListener(`sync_${uid}`, handler);
  }

  const adjColl = collection(firestore, 'users', uid, 'adjustments');
  return onSnapshot(adjColl, (snapshot) => {
    const items = [];
    snapshot.forEach((d) => items.push({ id: d.id, ...d.data() }));
    onData(items);
  }, (err) => {
    console.error("[Firestore] Adjustments listener error:", err);
    if (onError) onError(err);
  });
}

// -------------------------------------------------------------
// CRUD OPERATIONS
// -------------------------------------------------------------

/**
 * Save user settings (routineMode, routineShift, selectedDay, courseFilter, etc.)
 */
export async function saveUserSettings(uid, newSettings) {
  if (!uid) return;
  notifySyncStatus('syncing', 'Saving settings...');

  const firestore = initFirestore();
  if (isDemo() || !firestore) {
    const data = getLocalData(uid);
    data.settings = { ...data.settings, ...newSettings };
    saveLocalData(uid, data);
    return;
  }

  try {
    const userDocRef = doc(firestore, 'users', uid);
    await setDoc(userDocRef, { settings: newSettings }, { merge: true });
    notifySyncStatus('synced', 'Settings saved ✓');
  } catch (err) {
    console.error("[Firestore] Save settings error:", err);
    notifySyncStatus('error', 'Error saving settings');
    throw err;
  }
}

/**
 * Save profile details (e.g. theme, name)
 */
export async function saveUserProfile(uid, profileUpdates) {
  if (!uid) return;
  notifySyncStatus('syncing', 'Updating profile...');

  const firestore = initFirestore();
  if (isDemo() || !firestore) {
    const data = getLocalData(uid);
    data.profile = { ...data.profile, ...profileUpdates };
    saveLocalData(uid, data);
    return;
  }

  try {
    const userDocRef = doc(firestore, 'users', uid);
    await setDoc(userDocRef, { profile: profileUpdates }, { merge: true });
    notifySyncStatus('synced', 'Profile updated ✓');
  } catch (err) {
    console.error("[Firestore] Save profile error:", err);
    notifySyncStatus('error', 'Error saving profile');
    throw err;
  }
}

/**
 * Add a new tuition student
 */
export async function addTuition(uid, tuitionData) {
  if (!uid) return;
  notifySyncStatus('syncing', 'Adding student...');

  const docId = 't_' + Date.now();
  const student = {
    id: docId,
    name: tuitionData.name || 'New Student',
    area: tuitionData.area || 'Manikdi',
    daysPerWeek: Number(tuitionData.daysPerWeek) || 3,
    daysDone: 0,
    fee: Number(tuitionData.fee) || 0,
    paid: false,
    track: tuitionData.track || 'A',
    slotOrder: Number(tuitionData.slotOrder) || 99,
    note: tuitionData.note || '',
    updatedAt: new Date().toISOString()
  };

  const firestore = initFirestore();
  if (isDemo() || !firestore) {
    const data = getLocalData(uid);
    data.tuitions.push(student);
    saveLocalData(uid, data);
    return student;
  }

  try {
    const docRef = doc(firestore, 'users', uid, 'tuitions', docId);
    await setDoc(docRef, {
      ...student,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    notifySyncStatus('synced', 'Student added ✓');
    return student;
  } catch (err) {
    console.error("[Firestore] Add tuition error:", err);
    notifySyncStatus('error', 'Error adding student');
    throw err;
  }
}

/**
 * Update an existing tuition student
 */
export async function updateTuition(uid, tuitionId, updates) {
  if (!uid || !tuitionId) return;
  notifySyncStatus('syncing', 'Updating student...');

  const firestore = initFirestore();
  if (isDemo() || !firestore) {
    const data = getLocalData(uid);
    const idx = data.tuitions.findIndex(t => t.id === tuitionId);
    if (idx !== -1) {
      data.tuitions[idx] = { ...data.tuitions[idx], ...updates, updatedAt: new Date().toISOString() };
      saveLocalData(uid, data);
    }
    return;
  }

  try {
    const docRef = doc(firestore, 'users', uid, 'tuitions', tuitionId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    notifySyncStatus('synced', 'Changes saved ✓');
  } catch (err) {
    console.error("[Firestore] Update tuition error:", err);
    notifySyncStatus('error', 'Failed to update student');
    throw err;
  }
}

/**
 * Delete a tuition student
 */
export async function deleteTuition(uid, tuitionId) {
  if (!uid || !tuitionId) return;
  notifySyncStatus('syncing', 'Deleting student...');

  const firestore = initFirestore();
  if (isDemo() || !firestore) {
    const data = getLocalData(uid);
    data.tuitions = data.tuitions.filter(t => t.id !== tuitionId);
    saveLocalData(uid, data);
    return;
  }

  try {
    const docRef = doc(firestore, 'users', uid, 'tuitions', tuitionId);
    await deleteDoc(docRef);
    notifySyncStatus('synced', 'Student removed ✓');
  } catch (err) {
    console.error("[Firestore] Delete tuition error:", err);
    notifySyncStatus('error', 'Failed to delete student');
    throw err;
  }
}

/**
 * Batch reorder tuitions
 * @param {string} uid
 * @param {Array<{id: string, slotOrder: number}>} reorderedItems
 */
export async function reorderTuitions(uid, reorderedItems) {
  if (!uid || !reorderedItems.length) return;
  notifySyncStatus('syncing', 'Saving slot order...');

  const firestore = initFirestore();
  if (isDemo() || !firestore) {
    const data = getLocalData(uid);
    reorderedItems.forEach(item => {
      const match = data.tuitions.find(t => t.id === item.id);
      if (match) match.slotOrder = item.slotOrder;
    });
    saveLocalData(uid, data);
    return;
  }

  try {
    const batch = writeBatch(firestore);
    reorderedItems.forEach(item => {
      const ref = doc(firestore, 'users', uid, 'tuitions', item.id);
      batch.update(ref, { slotOrder: item.slotOrder, updatedAt: serverTimestamp() });
    });
    await batch.commit();
    notifySyncStatus('synced', 'Order saved ✓');
  } catch (err) {
    console.error("[Firestore] Reorder error:", err);
    notifySyncStatus('error', 'Failed to save order');
    throw err;
  }
}

/**
 * Toggle or update a study task done status
 */
export async function updateStudyTask(uid, dayId, taskId, isDone) {
  if (!uid || !dayId || !taskId) return;
  notifySyncStatus('syncing', 'Updating task...');

  const firestore = initFirestore();
  if (isDemo() || !firestore) {
    const data = getLocalData(uid);
    const day = data.studyDays.find(d => d.id === dayId);
    if (day) {
      const task = day.tasks.find(t => t.id === taskId);
      if (task) task.done = isDone;
      saveLocalData(uid, data);
    }
    return;
  }

  try {
    const docRef = doc(firestore, 'users', uid, 'studyDays', dayId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const dayData = docSnap.data();
      const updatedTasks = (dayData.tasks || []).map(t => {
        if (t.id === taskId) return { ...t, done: isDone };
        return t;
      });
      await updateDoc(docRef, { tasks: updatedTasks });
      notifySyncStatus('synced', 'Task updated ✓');
    }
  } catch (err) {
    console.error("[Firestore] Update task error:", err);
    notifySyncStatus('error', 'Failed to update task');
    throw err;
  }
}

/**
 * Add a custom study day / milestone
 */
export async function addStudyDay(uid, dayData) {
  if (!uid) return;
  notifySyncStatus('syncing', 'Adding study day...');

  const dayId = 'd_' + Date.now();
  const newDay = {
    id: dayId,
    date: dayData.date || 'Custom Day',
    course: dayData.course || 'CE-General',
    courseTitle: dayData.courseTitle || 'Engineering Revision',
    tag: dayData.tag || 'Study Day',
    tasks: dayData.tasks || [],
    createdAt: new Date().toISOString()
  };

  const firestore = initFirestore();
  if (isDemo() || !firestore) {
    const data = getLocalData(uid);
    data.studyDays.push(newDay);
    saveLocalData(uid, data);
    return newDay;
  }

  try {
    const docRef = doc(firestore, 'users', uid, 'studyDays', dayId);
    await setDoc(docRef, {
      ...newDay,
      createdAt: serverTimestamp()
    });
    notifySyncStatus('synced', 'Study day added ✓');
    return newDay;
  } catch (err) {
    console.error("[Firestore] Add study day error:", err);
    notifySyncStatus('error', 'Failed to add study day');
    throw err;
  }
}

/**
 * Weekly Reset with History Tracking
 * Archives current week's tuitions summary, fees collected, and resets daysDone to 0
 */
export async function resetWeeklyTuitions(uid, tuitions) {
  if (!uid) return;
  notifySyncStatus('syncing', 'Archiving and resetting weekly progress...');

  const now = new Date();
  const weekStart = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB');
  const weekEnd = now.toLocaleDateString('en-GB');
  const weekId = 'week_' + Date.now();

  const totalFee = tuitions.reduce((acc, t) => acc + Number(t.fee || 0), 0);
  const collectedFee = tuitions.reduce((acc, t) => acc + (t.paid ? Number(t.fee || 0) : 0), 0);
  const totalSessionsDone = tuitions.reduce((acc, t) => acc + Number(t.daysDone || 0), 0);
  const targetSessions = tuitions.reduce((acc, t) => acc + Number(t.daysPerWeek || 0), 0);

  const archiveEntry = {
    id: weekId,
    weekStart,
    weekEnd,
    archivedAt: now.toISOString(),
    totalFee,
    collectedFee,
    totalSessionsDone,
    targetSessions,
    tuitionsSummary: tuitions.map(t => ({
      name: t.name,
      area: t.area,
      daysDone: t.daysDone,
      daysPerWeek: t.daysPerWeek,
      fee: t.fee,
      paid: t.paid
    }))
  };

  const firestore = initFirestore();
  if (isDemo() || !firestore) {
    const data = getLocalData(uid);
    if (!data.history) data.history = [];
    data.history.unshift(archiveEntry);
    data.tuitions.forEach(t => {
      t.daysDone = 0;
    });
    saveLocalData(uid, data);
    return archiveEntry;
  }

  try {
    // 1. Write archive record
    const historyDocRef = doc(firestore, 'users', uid, 'history', weekId);
    await setDoc(historyDocRef, {
      ...archiveEntry,
      archivedAt: serverTimestamp()
    });

    // 2. Batch reset all daysDone to 0
    const batch = writeBatch(firestore);
    tuitions.forEach(t => {
      const ref = doc(firestore, 'users', uid, 'tuitions', t.id);
      batch.update(ref, { daysDone: 0, updatedAt: serverTimestamp() });
    });
    await batch.commit();

    notifySyncStatus('synced', 'Weekly reset complete & archived ✓');
    return archiveEntry;
  } catch (err) {
    console.error("[Firestore] Weekly reset error:", err);
    notifySyncStatus('error', 'Weekly reset failed');
    throw err;
  }
}

/**
 * Full user data export as JSON
 */
export async function exportAllUserData(uid) {
  if (!uid) throw new Error("User ID is required to export data.");

  const firestore = initFirestore();
  if (isDemo() || !firestore) {
    return getLocalData(uid);
  }

  try {
    // Read root doc
    const userDocRef = doc(firestore, 'users', uid);
    const userSnap = await getDoc(userDocRef);
    const userData = userSnap.exists() ? userSnap.data() : {};

    // Read tuitions
    const tuitionsColl = collection(firestore, 'users', uid, 'tuitions');
    const tuitionsSnap = await getDocs(tuitionsColl);
    const tuitions = [];
    tuitionsSnap.forEach(d => tuitions.push({ id: d.id, ...d.data() }));

    // Read study days
    const studyColl = collection(firestore, 'users', uid, 'studyDays');
    const studySnap = await getDocs(studyColl);
    const studyDays = [];
    studySnap.forEach(d => studyDays.push({ id: d.id, ...d.data() }));

    // Read history
    const historyColl = collection(firestore, 'users', uid, 'history');
    const historySnap = await getDocs(historyColl);
    const history = [];
    historySnap.forEach(d => history.push({ id: d.id, ...d.data() }));

    // Read adjustments
    const adjColl = collection(firestore, 'users', uid, 'adjustments');
    const adjSnap = await getDocs(adjColl);
    const adjustments = [];
    adjSnap.forEach(d => adjustments.push({ id: d.id, ...d.data() }));

    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      uid,
      profile: userData.profile || {},
      settings: userData.settings || defaultSettings,
      tuitions,
      studyDays,
      history,
      adjustments
    };
  } catch (err) {
    console.error("[Firestore] Export failed:", err);
    throw err;
  }
}

/**
 * Save or update a session adjustment (Shifted, Cancelled, Online)
 */
export async function saveSessionAdjustment(uid, adjustment) {
  if (!uid || !adjustment.id) return;
  notifySyncStatus('syncing', 'Updating schedule adjustment...');

  const item = {
    ...adjustment,
    updatedAt: new Date().toISOString()
  };

  const firestore = initFirestore();
  if (isDemo() || !firestore) {
    const data = getLocalData(uid);
    if (!data.adjustments) data.adjustments = [];
    const idx = data.adjustments.findIndex(a => a.id === item.id);
    if (idx !== -1) {
      data.adjustments[idx] = item;
    } else {
      data.adjustments.push(item);
    }
    saveLocalData(uid, data);
    return item;
  }

  try {
    const docRef = doc(firestore, 'users', uid, 'adjustments', item.id);
    await setDoc(docRef, {
      ...item,
      updatedAt: serverTimestamp()
    }, { merge: true });
    notifySyncStatus('synced', 'Schedule adjustment saved ✓');
    return item;
  } catch (err) {
    console.error("[Firestore] Save adjustment error:", err);
    notifySyncStatus('error', 'Failed to save adjustment');
    throw err;
  }
}

/**
 * Delete a session adjustment (reverts back to normal routine)
 */
export async function deleteSessionAdjustment(uid, adjustmentId) {
  if (!uid || !adjustmentId) return;
  notifySyncStatus('syncing', 'Reverting schedule adjustment...');

  const firestore = initFirestore();
  if (isDemo() || !firestore) {
    const data = getLocalData(uid);
    if (data.adjustments) {
      data.adjustments = data.adjustments.filter(a => a.id !== adjustmentId);
      saveLocalData(uid, data);
    }
    return;
  }

  try {
    const docRef = doc(firestore, 'users', uid, 'adjustments', adjustmentId);
    await deleteDoc(docRef);
    notifySyncStatus('synced', 'Adjustment removed ✓');
  } catch (err) {
    console.error("[Firestore] Delete adjustment error:", err);
    notifySyncStatus('error', 'Failed to remove adjustment');
    throw err;
  }
}

/**
 * Clear all session adjustments for a specific day or all days
 */
export async function clearDayAdjustments(uid, dayKey = null) {
  if (!uid) return;
  notifySyncStatus('syncing', 'Clearing adjustments...');

  const firestore = initFirestore();
  if (isDemo() || !firestore) {
    const data = getLocalData(uid);
    if (data.adjustments) {
      if (dayKey) {
        data.adjustments = data.adjustments.filter(a => a.originalDay !== dayKey && a.targetDay !== dayKey);
      } else {
        data.adjustments = [];
      }
      saveLocalData(uid, data);
    }
    return;
  }

  try {
    const adjColl = collection(firestore, 'users', uid, 'adjustments');
    const snap = await getDocs(adjColl);
    const batch = writeBatch(firestore);
    snap.forEach(d => {
      const val = d.data();
      if (!dayKey || val.originalDay === dayKey || val.targetDay === dayKey) {
        batch.delete(d.ref);
      }
    });
    await batch.commit();
    notifySyncStatus('synced', 'Adjustments cleared ✓');
  } catch (err) {
    console.error("[Firestore] Clear adjustments error:", err);
    notifySyncStatus('error', 'Failed to clear adjustments');
    throw err;
  }
}
