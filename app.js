/**
 * Main Application Logic for Tuition & MIST Study Routine Planner
 * Real-time Firebase Firestore SaaS, PWA, Multi-user Isolation
 */

import {
  initAuth,
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  enterDemoMode,
  resetPassword,
  logOut,
  getCurrentUser,
  isDemo,
  getActiveFirebaseConfig,
  saveFirebaseConfig,
  resetFirebaseConfig
} from "./auth.js";

import {
  initializeUserDataIfNew,
  subscribeSettings,
  subscribeTuitions,
  subscribeStudyDays,
  subscribeHistory,
  subscribeAdjustments,
  saveUserSettings,
  saveUserProfile,
  addTuition,
  updateTuition,
  deleteTuition,
  reorderTuitions,
  updateStudyTask,
  addStudyDay,
  resetWeeklyTuitions,
  saveSessionAdjustment,
  deleteSessionAdjustment,
  clearDayAdjustments,
  exportAllUserData,
  onSyncStatus
} from "./db.js";

// Days of week metadata matching the original planner
const daysOfWeek = [
  { key: 'Sun', name: 'Sunday', track: 'A', examNote: null },
  { key: 'Mon', name: 'Monday', track: 'B', examNote: null },
  { key: 'Tue', name: 'Tuesday', track: 'A', examNote: 'Exam Eve on 3 Nov' },
  { key: 'Wed', name: 'Wednesday', track: 'B', examNote: 'CE-451 Exam on 4 Nov' },
  { key: 'Thu', name: 'Thursday', track: 'A', examNote: null },
  { key: 'Fri', name: 'Friday', track: 'A', examNote: 'Exam Eve on 23 & 30 Oct' },
  { key: 'Sat', name: 'Saturday', track: 'B', examNote: 'CE-411 (24 Oct) & CE-413 (31 Oct)' }
];

// Application In-Memory Reactive State
const state = {
  currentUser: null,
  activeTab: 'routine',
  settings: {
    routineMode: 'exam', // 'exam' (1.25h), 'eve' (1.1h), 'post' (1.5h)
    routineShift: 'afternoon', // 'afternoon' or 'split'
    selectedDay: 'Sun',
    courseFilter: 'ALL',
    theme: 'dark'
  },
  profile: {},
  tuitions: [],
  studyDays: [],
  historyLogs: [],
  adjustments: [],
  tuitionFilter: {
    search: '',
    track: 'ALL',
    paid: 'ALL'
  },
  timer: {
    totalSeconds: 50 * 60,
    remainingSeconds: 50 * 60,
    isRunning: false,
    intervalId: null,
    isMuted: false,
    label: 'Exam Deep Study (50m)'
  },
  draggedTuitionId: null,
  pendingDeleteId: null,
  adjustingSession: null
};

// Subscriptions teardown
let unsubSettings = null;
let unsubTuitions = null;
let unsubStudyDays = null;
let unsubHistory = null;
let unsubAdjustments = null;

// ==============================================================
// 1. INITIALIZATION & AUTH STATE
// ==============================================================
document.addEventListener('DOMContentLoaded', () => {
  setupTheme();
  registerServiceWorker();
  initAuthUI();
  setupEventListeners();

  // Listen for sync status changes from db module
  onSyncStatus(({ status, details }) => {
    updateSyncIndicator(status, details);
  });

  // Initialize Firebase Auth listener
  initAuth(async (user) => {
    handleAuthStateChange(user);
  });
});

/**
 * Handle user logged in / logged out transitions
 */
async function handleAuthStateChange(user) {
  state.currentUser = user;

  const authView = document.getElementById('authView');
  const mainAppView = document.getElementById('mainAppView');

  // Tear down existing subscriptions
  if (unsubSettings) unsubSettings();
  if (unsubTuitions) unsubTuitions();
  if (unsubStudyDays) unsubStudyDays();
  if (unsubHistory) unsubHistory();
  if (unsubAdjustments) unsubAdjustments();

  if (!user) {
    // Show login screen
    authView.classList.remove('hidden');
    mainAppView.classList.add('hidden');
    return;
  }

  // User is authenticated! Show main app view
  authView.classList.add('hidden');
  mainAppView.classList.remove('hidden');

  // Update user header info
  updateUserHeader(user);

  // Seed default data if new account
  await initializeUserDataIfNew(user.uid, user);

  // Subscribe to real-time streams
  subscribeToUserData(user.uid);
}

function updateUserHeader(user) {
  const nameEl = document.getElementById('userNameHeader');
  const menuNameEl = document.getElementById('userMenuName');
  const menuEmailEl = document.getElementById('userMenuEmail');
  const avatarImg = document.getElementById('userAvatarImg');
  const badgeEl = document.getElementById('userStatusBadge');

  const displayName = user.displayName || user.email?.split('@')[0] || 'Scholar';
  if (nameEl) nameEl.textContent = displayName;
  if (menuNameEl) menuNameEl.textContent = displayName;
  if (menuEmailEl) menuEmailEl.textContent = user.email || 'guest@scholar.hub';

  if (avatarImg) {
    avatarImg.src = user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user.email || 'scholar')}`;
  }

  if (badgeEl) {
    if (isDemo()) {
      badgeEl.textContent = 'Demo Mode (Local)';
      badgeEl.className = 'hidden sm:inline-flex rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 border border-cyan-500/30';
    } else {
      badgeEl.textContent = 'Live Cloud Sync';
      badgeEl.className = 'hidden sm:inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-500/30';
    }
  }
}

/**
 * Setup real-time listeners for the authenticated user
 */
function subscribeToUserData(uid) {
  // 1. Settings & Profile
  unsubSettings = subscribeSettings(uid, ({ settings, profile }) => {
    if (settings) {
      state.settings = { ...state.settings, ...settings };
      applyTheme(state.settings.theme || 'dark');
    }
    if (profile) state.profile = profile;
    renderRoutineView();
  });

  // 2. Tuitions
  unsubTuitions = subscribeTuitions(uid, (tuitionsList) => {
    state.tuitions = tuitionsList;
    updateKPIs();
    renderTuitionsView();
    renderRoutineView();
  });

  // 3. Study Days
  unsubStudyDays = subscribeStudyDays(uid, (daysList) => {
    state.studyDays = daysList;
    renderStudyView();
  });

  // 4. History Logs
  unsubHistory = subscribeHistory(uid, (historyItems) => {
    state.historyLogs = historyItems;
    renderHistoryView();
  });

  // 5. Session Adjustments (Shift, Cancel, Online)
  unsubAdjustments = subscribeAdjustments(uid, (adjList) => {
    state.adjustments = adjList || [];
    renderRoutineView();
    renderTuitionsView();
  });
}

// ==============================================================
// 2. REAL-TIME SYNC INDICATOR
// ==============================================================
function updateSyncIndicator(status, details = '') {
  const dot = document.getElementById('syncDot');
  const dotMobile = document.getElementById('syncDotMobile');
  const text = document.getElementById('syncText');
  if (!dot || !text) return;

  dot.classList.remove('bg-emerald-400', 'bg-amber-400', 'bg-rose-400', 'bg-cyan-400', 'animate-pulse');
  if (dotMobile) dotMobile.classList.remove('bg-emerald-400', 'bg-amber-400', 'bg-rose-400', 'bg-cyan-400', 'animate-pulse');

  if (status === 'syncing') {
    dot.classList.add('bg-amber-400', 'animate-pulse');
    if (dotMobile) dotMobile.classList.add('bg-amber-400', 'animate-pulse');
    text.textContent = 'Syncing...';
  } else if (status === 'synced') {
    dot.classList.add('bg-emerald-400');
    if (dotMobile) dotMobile.classList.add('bg-emerald-400');
    text.textContent = isDemo() ? 'Local Sandbox ✓' : 'Live Synced ✓';
  } else if (status === 'error') {
    dot.classList.add('bg-rose-400');
    if (dotMobile) dotMobile.classList.add('bg-rose-400');
    text.textContent = 'Sync Alert';
    if (details) showToast(details, 'error');
  } else {
    dot.classList.add('bg-cyan-400');
    if (dotMobile) dotMobile.classList.add('bg-cyan-400');
    text.textContent = 'Connected';
  }
}

// ==============================================================
// 3. TAB NAVIGATION
// ==============================================================
function switchTab(tabKey) {
  state.activeTab = tabKey;
  const tabs = ['routine', 'study', 'tuitions', 'timer', 'history'];

  tabs.forEach(t => {
    const viewEl = document.getElementById(`view-${t}`);
    const navBtn = document.getElementById(`tabBtn-${t}`);
    const mobileBtn = document.querySelector(`.mobile-tab-btn[data-tab="${t}"]`);

    if (t === tabKey) {
      if (viewEl) viewEl.classList.remove('hidden');
      if (navBtn) {
        navBtn.className = 'nav-tab-btn rounded-lg px-3 py-1.5 text-xs font-semibold transition-all bg-indigo-600 text-white shadow';
      }
      if (mobileBtn) {
        mobileBtn.className = 'mobile-tab-btn flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl text-indigo-400 font-bold';
      }
    } else {
      if (viewEl) viewEl.classList.add('hidden');
      if (navBtn) {
        navBtn.className = 'nav-tab-btn rounded-lg px-3 py-1.5 text-xs font-semibold transition-all text-slate-300 hover:text-white hover:bg-slate-800';
      }
      if (mobileBtn) {
        mobileBtn.className = 'mobile-tab-btn flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl text-slate-400 hover:text-white font-medium';
      }
    }
  });

  // Re-render target tab if needed
  if (tabKey === 'routine') renderRoutineView();
  else if (tabKey === 'study') renderStudyView();
  else if (tabKey === 'tuitions') renderTuitionsView();
  else if (tabKey === 'history') renderHistoryView();
}

// ==============================================================
// 4. KPI ROW UPDATE
// ==============================================================
function updateKPIs() {
  const totalFee = state.tuitions.reduce((acc, t) => acc + Number(t.fee || 0), 0);
  const collectedFee = state.tuitions.reduce((acc, t) => acc + (t.paid ? Number(t.fee || 0) : 0), 0);
  const weeklyTarget = state.tuitions.reduce((acc, t) => acc + Number(t.daysPerWeek || 0), 0);
  const weeklyDone = state.tuitions.reduce((acc, t) => acc + Number(t.daysDone || 0), 0);

  const totalFeeEl = document.getElementById('kpiTotalFee');
  const collectedFeeEl = document.getElementById('kpiCollectedFee');
  const weeklyDoneEl = document.getElementById('kpiWeeklyDone');
  const weeklyTargetEl = document.getElementById('kpiWeeklyTarget');
  const activeStudentsEl = document.getElementById('kpiActiveStudents');
  const paidPercentEl = document.getElementById('kpiPaidPercent');
  const paidProgressBar = document.getElementById('kpiPaidProgressBar');
  const sessionsPercentEl = document.getElementById('kpiSessionsPercent');
  const sessionsProgressBar = document.getElementById('kpiSessionsProgressBar');
  const studyHoursEl = document.getElementById('kpiStudyHours');
  const studyBadgeEl = document.getElementById('kpiStudyModeBadge');

  if (totalFeeEl) totalFeeEl.textContent = totalFee.toLocaleString();
  if (collectedFeeEl) collectedFeeEl.textContent = collectedFee.toLocaleString() + ' BDT';
  if (weeklyDoneEl) weeklyDoneEl.textContent = weeklyDone;
  if (weeklyTargetEl) weeklyTargetEl.textContent = weeklyTarget;
  if (activeStudentsEl) activeStudentsEl.textContent = `${state.tuitions.length} Active`;

  // Paid percentage
  const paidPct = totalFee > 0 ? Math.round((collectedFee / totalFee) * 100) : 0;
  if (paidPercentEl) paidPercentEl.textContent = `${paidPct}%`;
  if (paidProgressBar) paidProgressBar.style.width = `${paidPct}%`;

  // Sessions percentage
  const sessionsPct = weeklyTarget > 0 ? Math.round((weeklyDone / weeklyTarget) * 100) : 0;
  if (sessionsPercentEl) sessionsPercentEl.textContent = `${sessionsPct}%`;
  if (sessionsProgressBar) sessionsProgressBar.style.width = `${Math.min(100, sessionsPct)}%`;

  // Daily study allocation
  if (studyHoursEl && studyBadgeEl) {
    if (state.settings.routineMode === 'exam') {
      studyHoursEl.textContent = '6.5';
      studyBadgeEl.textContent = 'Exam Mode';
      studyBadgeEl.className = 'rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-400';
    } else if (state.settings.routineMode === 'eve') {
      studyHoursEl.textContent = '7.5';
      studyBadgeEl.textContent = 'Exam Eve';
      studyBadgeEl.className = 'rounded-md bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-400';
    } else {
      studyHoursEl.textContent = '2.5';
      studyBadgeEl.textContent = 'Post-Finals';
      studyBadgeEl.className = 'rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400';
    }
  }
}

// ==============================================================
// 5. TAB 1: DAILY ROUTINE & ROUTE PLANNER
// ==============================================================
function renderDaySelector() {
  const container = document.getElementById('dayButtonsContainer');
  if (!container) return;
  container.innerHTML = '';

  daysOfWeek.forEach(d => {
    const isSelected = state.settings.selectedDay === d.key;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = isSelected
      ? 'flex flex-col items-center justify-center rounded-2xl bg-gradient-to-b from-violet-600 to-indigo-600 p-3 text-white shadow-lg shadow-indigo-600/30 ring-1 ring-white/20 transition-all scale-[1.02]'
      : 'flex flex-col items-center justify-center rounded-2xl glass-surface-subtle p-3 text-slate-400 hover:text-white hover:bg-white/[0.08] transition-all border border-white/[0.06] hover:border-white/15';

    const trackLabel = d.track === 'A' ? 'Track A (4d)' : 'Track B (3d)';
    btn.innerHTML = `
      <span class="text-xs font-bold sm:text-sm font-sans">${d.key}</span>
      <span class="mt-0.5 text-[10px] font-mono ${isSelected ? 'text-indigo-100 font-semibold' : 'text-slate-500'}">${trackLabel}</span>
    `;

    btn.addEventListener('click', () => {
      state.settings.selectedDay = d.key;
      if (state.currentUser) {
        saveUserSettings(state.currentUser.uid, { selectedDay: d.key });
      }
      renderRoutineView();
    });

    container.appendChild(btn);
  });
}

function getTrackStudents(trackKey) {
  return state.tuitions
    .filter(t => t.track === trackKey)
    .sort((a, b) => (Number(a.slotOrder) || 1) - (Number(b.slotOrder) || 1));
}

function createTuitionBlock(time, idx, students, dayKey, durationText) {
  const student = students[idx] || null;
  const sName = student ? student.name : `Tuition Slot #${idx + 1}`;
  const sArea = student ? student.area : 'Manikdi';
  const tuitionId = student ? student.id : null;
  const baseNote = student && student.note ? student.note : 'Scheduled session';

  // Find adjustment on dayKey
  const adj = (tuitionId && state.adjustments)
    ? state.adjustments.find(a => a.tuitionId === tuitionId && a.originalDay === dayKey)
    : null;

  const block = {
    time,
    type: 'tuition',
    slotIndex: idx,
    student,
    tuitionId,
    dayKey,
    title: `Tuition ${idx + 1} (${durationText}): ${sName} — ${sArea}`,
    desc: baseNote,
    status: adj ? adj.status : 'normal',
    adjustment: adj
  };

  if (adj) {
    if (adj.status === 'online') {
      block.isOnline = true;
      block.onlinePlatform = adj.onlinePlatform || 'Google Meet';
      block.onlineLink = adj.onlineLink || '';
      block.title = `💻 Online Tuition ${idx + 1}: ${sName} (${adj.onlinePlatform || 'Meet'})`;
      block.desc = adj.reason || `Online session via ${adj.onlinePlatform || 'Google Meet'}. Zero transit required!`;
    } else if (adj.status === 'shifted') {
      block.isShifted = true;
      block.targetDay = adj.targetDay || 'Another Day';
      block.shiftTime = adj.shiftTime || 'Adjusted Slot';
      block.title = `⏩ Shifted: ${sName} (Moved to ${adj.targetDay})`;
      block.desc = adj.reason ? `Shifted to ${adj.targetDay} (${adj.shiftTime || 'Makeup'}): ${adj.reason}` : `Session shifted to ${adj.targetDay}. Slot freed for study / rest!`;
    } else if (adj.status === 'cancelled') {
      block.isCancelled = true;
      block.cancelReason = adj.reason || 'Session off today';
      block.title = `❌ Cancelled: ${sName} (Off Today)`;
      block.desc = `Cancelled: ${adj.reason || 'Session off today'}. Free time for self-study / recharge!`;
    }
  }

  return block;
}

function buildDailyScheduleBlocks(dayObj) {
  const students = getTrackStudents(dayObj.track);
  const isEve = state.settings.routineMode === 'eve';
  const isPost = state.settings.routineMode === 'post';
  const dur = isEve ? '1.1h' : (isPost ? '1.4h' : '1.25h');
  const dKey = dayObj.key;

  let blocks = [];

  if (state.settings.routineShift === 'afternoon') {
    if (isEve) {
      blocks = [
        { time: '07:00 – 10:30 AM', type: 'study', title: 'Exam Eve Deep Revision Block 1 (3.5h)', desc: 'High-yield MIST numericals, design flowcharts & formula walk-through' },
        { time: '10:30 – 11:00 AM', type: 'break', title: 'Breakfast & Short Recharge', desc: 'Step away from desk, hydrate' },
        { time: '11:00 AM – 01:00 PM', type: 'study', title: 'Past Paper & Code Check (2.0h)', desc: 'Review AISC / BNBC / AASHTO tables, calculator setup & short theory' },
        { time: '01:00 – 02:15 PM', type: 'break', title: 'Prayer, Lunch & Power Nap', desc: 'Mandatory rest before afternoon tuitions' },
        createTuitionBlock('02:15 – 03:20 PM', 0, students, dKey, dur),
        createTuitionBlock('03:30 – 04:35 PM', 1, students, dKey, dur),
        createTuitionBlock('04:50 – 05:55 PM', 2, students, dKey, dur),
        createTuitionBlock('06:10 – 07:15 PM', 3, students, dKey, dur),
        createTuitionBlock('07:25 – 08:30 PM', 4, students, dKey, dur),
        { time: '08:45 – 10:45 PM', type: 'study', title: 'Final Exam-Eve Formula Recap (2.0h)', desc: 'Dinner + light review of 1-page formula sheet; sleep by 11:00 PM sharp!' }
      ];
    } else if (isPost) {
      blocks = [
        { time: '08:30 – 11:00 AM', type: 'study', title: 'Personal Skill / Thesis / Software Block (2.5h)', desc: 'Post-final break: ETABS/SAFE, Thesis, GRE/IELTS, or coding' },
        { time: '11:00 AM – 02:15 PM', type: 'break', title: 'Gym, Prayer, Lunch & Full Rest', desc: 'Relaxed vacation pace at home in Manikdi' },
        createTuitionBlock('02:15 – 03:40 PM', 0, students, dKey, dur),
        createTuitionBlock('03:50 – 05:15 PM', 1, students, dKey, dur),
        createTuitionBlock('05:30 – 06:55 PM', 2, students, dKey, dur),
        createTuitionBlock('07:10 – 08:35 PM', 3, students, dKey, dur),
        createTuitionBlock('08:45 – 10:10 PM', 4, students, dKey, dur),
        { time: '10:15 PM – 12:00 AM', type: 'break', title: 'Dinner & Free Evening', desc: 'Zero exam stress until January!' }
      ];
    } else {
      // Standard Exam Prep Mode (1.25h)
      blocks = [
        { time: '07:30 – 10:30 AM', type: 'study', title: 'Morning Deep Study Block 1 (3.0h)', desc: 'Peak focus for heavy CE-411 / CE-413 / CE-451 derivations & numericals at home in Manikdi' },
        { time: '10:30 – 11:00 AM', type: 'break', title: 'Breakfast & Coffee Break', desc: '30m mental reset' },
        { time: '11:00 AM – 01:30 PM', type: 'study', title: 'Midday Past-Paper Sprint Block 2 (2.5h)', desc: 'Solve MIST past Term Final questions under timed conditions' },
        { time: '01:30 – 02:30 PM', type: 'break', title: 'Prayer, Lunch & 20m Power Rest', desc: 'Recharge before starting the Manikdi tuition loop' },
        createTuitionBlock('02:30 – 03:45 PM', 0, students, dKey, dur),
        createTuitionBlock('04:00 – 05:15 PM', 1, students, dKey, dur),
        createTuitionBlock('05:30 – 06:45 PM', 2, students, dKey, dur),
        createTuitionBlock('07:00 – 08:15 PM', 3, students, dKey, dur),
        createTuitionBlock('08:30 – 09:45 PM', 4, students, dKey, dur),
        { time: '10:15 – 11:15 PM', type: 'study', title: 'Night Consolidation Block 3 (1.0h)', desc: 'Light formula review, design code tables & next-day setup after dinner' }
      ];
    }
  } else {
    // Split Shift: 1 Morning Local Tuition + 4 Afternoon/Evening Tuitions
    blocks = [
      { time: '07:30 – 10:15 AM', type: 'study', title: 'Morning Study Block 1 (2.75h)', desc: 'Core MIST Term Final numerical problem solving' },
      createTuitionBlock('10:30 – 11:45 AM', 0, students, dKey, dur),
      { time: '12:00 – 02:30 PM', type: 'study', title: 'Midday Study Block 2 (2.5h)', desc: 'MIST past paper questions & design checks' },
      { time: '02:30 – 03:30 PM', type: 'break', title: 'Prayer, Lunch & Short Rest', desc: 'Recharge at home in Manikdi' },
      createTuitionBlock('03:30 – 04:45 PM', 1, students, dKey, dur),
      createTuitionBlock('05:00 – 06:15 PM', 2, students, dKey, dur),
      createTuitionBlock('06:30 – 07:45 PM', 3, students, dKey, dur),
      createTuitionBlock('08:00 – 09:15 PM', 4, students, dKey, dur),
      { time: '09:45 – 11:00 PM', type: 'study', title: 'Night Study Block 3 (1.25h)', desc: 'Wrap up tuitions earlier & get 75m of night revision' }
    ];
  }

  // Look for any sessions shifted IN to this day from other days
  const shiftedIn = (state.adjustments || []).filter(a => a.targetDay === dKey && a.status === 'shifted');
  shiftedIn.forEach((adj) => {
    const origStudent = state.tuitions.find(t => t.id === adj.tuitionId) || { id: adj.tuitionId, name: adj.studentName || 'Student', area: 'Manikdi' };
    blocks.push({
      time: adj.shiftTime || 'Adjusted Slot',
      type: 'tuition',
      isShiftedIn: true,
      student: origStudent,
      tuitionId: adj.tuitionId,
      dayKey: dKey,
      title: `✨ Makeup Tuition: ${origStudent.name} (Shifted from ${adj.originalDay})`,
      desc: adj.reason ? `Shifted from ${adj.originalDay}: ${adj.reason}` : `Makeup class rescheduled from ${adj.originalDay}.`,
      status: 'shifted-in',
      adjustment: adj
    });
  });

  return blocks;
}

function renderRoutineView() {
  renderDaySelector();

  // Mode and Shift Buttons state
  document.querySelectorAll('.routine-mode-btn').forEach(btn => {
    const active = btn.dataset.mode === state.settings.routineMode;
    btn.className = active
      ? 'routine-mode-btn rounded-xl px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md ring-1 ring-white/15'
      : 'routine-mode-btn rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white transition';
  });

  document.querySelectorAll('.routine-shift-btn').forEach(btn => {
    const active = btn.dataset.shift === state.settings.routineShift;
    btn.className = active
      ? 'routine-shift-btn rounded-xl px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-cyan-600 to-teal-500 text-white shadow-md ring-1 ring-white/15'
      : 'routine-shift-btn rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white transition';
  });

  const dayObj = daysOfWeek.find(d => d.key === state.settings.selectedDay) || daysOfWeek[0];
  const trackTitle = dayObj.track === 'A'
    ? 'Track A (4-Day Students: Sun, Tue, Thu, Fri)'
    : 'Track B (3-Day Students: Sat, Mon, Wed)';

  const titleEl = document.getElementById('selectedDayTitle');
  const subEl = document.getElementById('selectedDaySubtitle');
  const badgeEl = document.getElementById('selectedDayBadge');

  if (titleEl) titleEl.textContent = `${dayObj.name} — ${trackTitle}`;
  if (subEl) {
    subEl.textContent = dayObj.examNote
      ? `Note: ${dayObj.examNote} • Route starts & ends in Manikdi`
      : 'Route starts inside Manikdi and completes a single outer loop';
  }

  const studyHrsText = state.settings.routineMode === 'exam'
    ? '6.5h Study'
    : (state.settings.routineMode === 'eve' ? '7.5h Study' : '2.5h Skill');
  if (badgeEl) badgeEl.textContent = `5 Tuitions • ${studyHrsText}`;

  // 1. Render Active Day Adjustments Banner
  const banner = document.getElementById('dayAdjustmentsBanner');
  if (banner) {
    const dayAdjustments = (state.adjustments || []).filter(a => a.originalDay === dayObj.key || a.targetDay === dayObj.key);
    if (dayAdjustments.length > 0) {
      banner.classList.remove('hidden');
      let badgesHtml = '';
      let onlineCount = 0;
      let shiftedOutCount = 0;
      let cancelledCount = 0;
      let shiftedInCount = 0;

      dayAdjustments.forEach(a => {
        if (a.originalDay === dayObj.key) {
          if (a.status === 'online') onlineCount++;
          else if (a.status === 'shifted') shiftedOutCount++;
          else if (a.status === 'cancelled') cancelledCount++;
        }
        if (a.targetDay === dayObj.key && a.status === 'shifted') {
          shiftedInCount++;
        }
      });

      if (onlineCount > 0) {
        badgesHtml += `<span class="rounded-lg bg-cyan-500/15 border border-cyan-500/30 px-2.5 py-1 text-xs font-bold text-cyan-300 font-sans">💻 ${onlineCount} Online Class</span>`;
      }
      if (shiftedOutCount > 0) {
        badgesHtml += `<span class="rounded-lg bg-violet-500/15 border border-violet-500/30 px-2.5 py-1 text-xs font-bold text-violet-300 font-sans">⏩ ${shiftedOutCount} Shifted Out</span>`;
      }
      if (shiftedInCount > 0) {
        badgesHtml += `<span class="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-xs font-bold text-emerald-300 font-sans">✨ ${shiftedInCount} Makeup Added</span>`;
      }
      if (cancelledCount > 0) {
        badgesHtml += `<span class="rounded-lg bg-rose-500/15 border border-rose-500/30 px-2.5 py-1 text-xs font-bold text-rose-300 font-sans">❌ ${cancelledCount} Cancelled</span>`;
      }

      banner.innerHTML = `
        <div class="flex items-center gap-3">
          <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-sm">⚡</span>
          <div>
            <h4 class="text-xs font-extrabold text-white font-sans">Schedule Adjustments Active for ${dayObj.name}</h4>
            <div class="flex flex-wrap items-center gap-2 pt-1">
              ${badgesHtml}
            </div>
          </div>
        </div>
        <button id="btnClearTodayAdjustments" type="button" class="rounded-xl border border-white/10 bg-white/[0.06] hover:bg-white/[0.12] px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white transition active:scale-95">
          Reset All for ${dayObj.name}
        </button>
      `;

      document.getElementById('btnClearTodayAdjustments')?.addEventListener('click', async () => {
        if (confirm(`Reset all schedule adjustments for ${dayObj.name} back to regular routine?`)) {
          if (state.currentUser) {
            await clearDayAdjustments(state.currentUser.uid, dayObj.key);
            showToast(`Schedule reset for ${dayObj.name} ✓`, 'info');
          }
        }
      });
    } else {
      banner.classList.add('hidden');
      banner.innerHTML = '';
    }
  }

  // 2. Render Daily Timeline
  const timeline = buildDailyScheduleBlocks(dayObj);
  const listEl = document.getElementById('dailyTimelineList');
  if (listEl) {
    listEl.innerHTML = '';
    timeline.forEach(item => {
      let badgeStyle = 'bg-white/[0.05] text-slate-300 border-white/10';
      let cardBorder = 'glass-surface border-l-4 border-l-slate-600';
      let typeLabel = 'Break / Rest';

      if (item.type === 'study') {
        badgeStyle = 'bg-amber-500/10 text-amber-300 border-amber-500/25';
        cardBorder = 'glass-surface border-l-4 border-l-amber-500 shadow-[0_4px_20px_rgba(245,158,11,0.06)]';
        typeLabel = 'MIST Study Block';
      } else if (item.type === 'tuition') {
        if (item.isOnline) {
          badgeStyle = 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
          cardBorder = 'glass-surface border-l-4 border-l-cyan-400 shadow-[0_4px_20px_rgba(6,182,212,0.12)]';
          typeLabel = `💻 Online (${item.onlinePlatform || 'Meet'})`;
        } else if (item.isShifted) {
          badgeStyle = 'bg-violet-500/15 text-violet-300 border-violet-500/30';
          cardBorder = 'glass-surface border-l-4 border-l-violet-400/70 border-dashed opacity-80';
          typeLabel = `⏩ Shifted to ${item.targetDay}`;
        } else if (item.isCancelled) {
          badgeStyle = 'bg-rose-500/15 text-rose-300 border-rose-500/30';
          cardBorder = 'glass-surface border-l-4 border-l-rose-500/60 opacity-60';
          typeLabel = '❌ Cancelled Today';
        } else if (item.isShiftedIn) {
          badgeStyle = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
          cardBorder = 'glass-surface border-l-4 border-l-emerald-400 shadow-[0_4px_20px_rgba(16,185,129,0.12)]';
          typeLabel = `✨ Makeup (From ${item.originalDay})`;
        } else {
          badgeStyle = 'bg-indigo-500/10 text-indigo-300 border-indigo-500/25';
          cardBorder = 'glass-surface border-l-4 border-l-indigo-500 shadow-[0_4px_20px_rgba(99,102,241,0.08)]';
          typeLabel = '🚗 Tuition (In-Person)';
        }
      }

      // Action buttons for tuition slot
      let actionButtons = '';
      if (item.type === 'tuition' && item.tuitionId) {
        let joinBtn = '';
        if (item.isOnline && item.onlineLink) {
          const href = item.onlineLink.startsWith('http') ? item.onlineLink : `https://${item.onlineLink}`;
          joinBtn = `
            <a href="${href}" target="_blank" rel="noopener noreferrer" class="rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 shadow-sm shadow-cyan-500/20">
              <span>🎥</span> Join Meet
            </a>
          `;
        }

        actionButtons = `
          <div class="flex items-center gap-2 pt-1 sm:pt-0">
            ${joinBtn}
            <button type="button" class="btn-adjust-slot rounded-xl border border-white/10 bg-white/[0.05] hover:bg-white/[0.12] hover:border-amber-500/40 px-3 py-1.5 text-xs font-bold text-amber-300 hover:text-amber-200 transition-all active:scale-95 flex items-center gap-1.5 shadow-sm" data-tuition-id="${item.tuitionId}" data-day="${dayObj.key}">
              <span>⚡</span> Adjust
            </button>
          </div>
        `;
      }

      const row = document.createElement('div');
      row.className = `flex flex-col gap-2 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between transition-all hover:translate-x-1 ${cardBorder}`;
      row.innerHTML = `
        <div class="space-y-1 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-mono text-xs font-bold text-white bg-black/60 px-2.5 py-1 rounded-lg border border-white/10 shadow-inner">${item.time}</span>
            <span class="rounded-lg border px-2.5 py-0.5 text-[11px] font-semibold font-sans ${badgeStyle}">${typeLabel}</span>
          </div>
          <h4 class="text-sm font-bold text-white pt-1 font-sans ${item.isCancelled ? 'line-through text-slate-400' : ''}">${item.title}</h4>
          <p class="text-xs text-slate-400 leading-relaxed font-body">${item.desc}</p>
        </div>
        ${actionButtons}
      `;
      listEl.appendChild(row);
    });

    // Attach click listeners to all Adjust Slot buttons in timeline
    listEl.querySelectorAll('.btn-adjust-slot').forEach(btn => {
      btn.addEventListener('click', () => {
        const tId = btn.getAttribute('data-tuition-id');
        const day = btn.getAttribute('data-day');
        openAdjustmentModal(tId, day);
      });
    });
  }

  // 3. Render Manikdi Route Sequence Cards (Dynamic transit recalculation)
  const routeContainer = document.getElementById('routeStepCards');
  if (routeContainer) {
    const trackStudents = getTrackStudents(dayObj.track);
    routeContainer.innerHTML = '';

    let physicalStops = 0;

    trackStudents.forEach((st, idx) => {
      const adj = (state.adjustments || []).find(a => a.tuitionId === st.id && a.originalDay === dayObj.key);
      const isOnline = adj && adj.status === 'online';
      const isShifted = adj && adj.status === 'shifted';
      const isCancelled = adj && adj.status === 'cancelled';

      let statusBadge = `<span class="rounded-lg bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-slate-300 border border-white/10 font-mono">${st.daysPerWeek}d/wk</span>`;
      let cardStyle = 'border-white/10 bg-black/40 hover:border-indigo-500/40 hover:bg-white/[0.04]';
      let avatarStyle = 'bg-gradient-to-tr from-violet-600 to-cyan-500 text-white';
      let nameStyle = 'text-white';

      if (isOnline) {
        statusBadge = `<span class="rounded-lg bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 text-[11px] font-bold text-cyan-300 font-sans">💻 Online (No Commute)</span>`;
        cardStyle = 'border-cyan-500/30 bg-cyan-950/20 hover:border-cyan-500/50';
        avatarStyle = 'bg-gradient-to-tr from-cyan-600 to-teal-500 text-white';
      } else if (isShifted) {
        statusBadge = `<span class="rounded-lg bg-violet-500/15 border border-violet-500/30 px-2 py-0.5 text-[11px] font-bold text-violet-300 font-sans">⏩ Shifted to ${adj.targetDay}</span>`;
        cardStyle = 'border-white/[0.06] bg-black/20 opacity-60';
        avatarStyle = 'bg-slate-700 text-slate-400';
        nameStyle = 'line-through text-slate-400';
      } else if (isCancelled) {
        statusBadge = `<span class="rounded-lg bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[11px] font-bold text-rose-300 font-sans">❌ Cancelled</span>`;
        cardStyle = 'border-rose-500/20 bg-rose-950/10 opacity-60';
        avatarStyle = 'bg-rose-900/60 text-rose-300';
        nameStyle = 'line-through text-slate-400';
      } else {
        physicalStops++;
      }

      const step = document.createElement('div');
      step.className = `flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs transition-all ${cardStyle}`;
      step.innerHTML = `
        <div class="flex items-center gap-3">
          <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl font-extrabold text-xs shadow-md ring-1 ring-white/20 ${avatarStyle}">
            ${idx + 1}
          </span>
          <div>
            <p class="font-bold font-sans ${nameStyle}">${st.name}</p>
            <p class="text-[11px] text-slate-400 font-body">${st.area}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          ${statusBadge}
          <button type="button" class="btn-adjust-route-step text-slate-500 hover:text-amber-300 transition text-xs font-bold" data-tuition-id="${st.id}" data-day="${dayObj.key}" title="Adjust Schedule">⚡</button>
        </div>
      `;
      routeContainer.appendChild(step);
    });

    // Check for makeup students shifted in
    const shiftedIn = (state.adjustments || []).filter(a => a.targetDay === dayObj.key && a.status === 'shifted');
    shiftedIn.forEach((adj, mIdx) => {
      const origStudent = state.tuitions.find(t => t.id === adj.tuitionId) || { id: adj.tuitionId, name: adj.studentName || 'Student', area: 'Manikdi' };
      physicalStops++;

      const step = document.createElement('div');
      step.className = 'flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-3.5 py-2.5 text-xs transition-all hover:border-emerald-500/50';
      step.innerHTML = `
        <div class="flex items-center gap-3">
          <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl font-extrabold text-xs bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md ring-1 ring-white/20">
            +${mIdx + 1}
          </span>
          <div>
            <p class="font-bold font-sans text-white">${origStudent.name}</p>
            <p class="text-[11px] text-emerald-300 font-body">${origStudent.area} (Makeup)</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-bold text-emerald-300 font-sans">✨ From ${adj.originalDay}</span>
          <button type="button" class="btn-adjust-route-step text-slate-500 hover:text-amber-300 transition text-xs font-bold" data-tuition-id="${origStudent.id}" data-day="${dayObj.key}" title="Adjust Schedule">⚡</button>
        </div>
      `;
      routeContainer.appendChild(step);
    });

    // Attach click listeners to route adjust icons
    routeContainer.querySelectorAll('.btn-adjust-route-step').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tId = btn.getAttribute('data-tuition-id');
        const day = btn.getAttribute('data-day');
        openAdjustmentModal(tId, day);
      });
    });

    // Dynamic Transit Summary update
    const transitEstText = physicalStops === 0
      ? '0 mins (All online/off)'
      : `~${physicalStops * 9}–${physicalStops * 11} mins (${physicalStops} home visits)`;

    const transitSubText = physicalStops === 5
      ? 'Average inter-session travel between local Manikdi nodes is only 8–12 mins.'
      : `${5 - physicalStops} session(s) adjusted (online/shifted/off) — Dhaka transit reduced!`;

    const summaryBox = routeContainer.nextElementSibling;
    if (summaryBox) {
      summaryBox.innerHTML = `
        <div class="flex items-center justify-between text-slate-300 font-semibold font-body">
          <span>Active Transit Loop:</span>
          <span class="text-emerald-400 font-mono font-bold">${transitEstText}</span>
        </div>
        <p class="text-[11px] text-slate-400 leading-relaxed font-body">${transitSubText}</p>
      `;
    }
  }
}

// ==============================================================
// 6. TAB 2: MIST STUDY PLAN
// ==============================================================
function renderStudyView() {
  // Filter button classes
  document.querySelectorAll('.course-filter-btn').forEach(btn => {
    const active = btn.dataset.course === state.settings.courseFilter;
    btn.className = active
      ? 'course-filter-btn rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1 text-xs font-bold text-white shadow-sm ring-1 ring-white/15'
      : 'course-filter-btn rounded-xl bg-white/[0.05] border border-white/10 px-3 py-1 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/[0.1]';
  });

  // Course progress summary cards
  const courses = [
    { code: 'CE-411', name: 'Structural Analysis & Design II', examDate: 'Sat, 24 Oct 2026', color: 'rose' },
    { code: 'CE-413', name: 'Design of Steel Structures', examDate: 'Sat, 31 Oct 2026', color: 'indigo' },
    { code: 'CE-451', name: 'Highway, Pavement & Railways', examDate: 'Wed, 04 Nov 2026', color: 'cyan' }
  ];

  const summaryContainer = document.getElementById('courseProgressSummary');
  if (summaryContainer) {
    summaryContainer.innerHTML = '';
    courses.forEach(c => {
      const matchingDays = state.studyDays.filter(d => d.course === c.code);
      let totalTasks = 0;
      let doneTasks = 0;
      matchingDays.forEach(d => {
        (d.tasks || []).forEach(t => {
          totalTasks++;
          if (t.done) doneTasks++;
        });
      });
      const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

      let gradLine = 'from-rose-500 to-pink-500';
      if (c.code === 'CE-413') gradLine = 'from-violet-500 to-indigo-500';
      if (c.code === 'CE-451') gradLine = 'from-cyan-500 to-teal-500';

      const card = document.createElement('div');
      card.className = 'glass-surface glass-surface-hover rounded-2xl p-5 space-y-3 border border-white/10 relative overflow-hidden group';
      card.innerHTML = `
        <div class="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${gradLine}"></div>
        <div class="flex items-center justify-between">
          <span class="text-xs font-extrabold text-white font-mono bg-white/[0.08] px-2.5 py-0.5 rounded-lg border border-white/10">${c.code}</span>
          <span class="text-[11px] font-semibold text-slate-400 font-mono">${c.examDate}</span>
        </div>
        <p class="text-xs text-slate-200 truncate font-semibold font-sans">${c.name}</p>
        <div class="h-2 w-full overflow-hidden rounded-full bg-black/50 p-[1px]">
          <div class="progress-bar-fill h-full bg-gradient-to-r ${gradLine} rounded-full" style="width: ${pct}%"></div>
        </div>
        <div class="flex items-center justify-between text-[11px] text-slate-400 font-body">
          <span>${doneTasks}/${totalTasks} blocks done</span>
          <span class="font-bold text-white font-mono">${pct}%</span>
        </div>
      `;
      summaryContainer.appendChild(card);
    });
  }

  // Render Day Cards
  const daysContainer = document.getElementById('studyPlanDaysContainer');
  if (daysContainer) {
    daysContainer.innerHTML = '';
    const filteredDays = state.studyDays.filter(d => state.settings.courseFilter === 'ALL' || d.course === state.settings.courseFilter);

    filteredDays.forEach(day => {
      const card = document.createElement('div');
      card.className = 'glass-surface rounded-2xl p-5 space-y-3.5 border border-white/10';

      let badgeColor = 'bg-white/[0.06] text-slate-300 border-white/10';
      if (day.course === 'CE-411') badgeColor = 'bg-rose-500/15 text-rose-300 border-rose-500/25';
      else if (day.course === 'CE-413') badgeColor = 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25';
      else if (day.course === 'CE-451') badgeColor = 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25';

      let tasksHtml = '';
      (day.tasks || []).forEach(task => {
        tasksHtml += `
          <label class="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-black/40 p-3 cursor-pointer hover:border-white/20 hover:bg-white/[0.03] transition-all">
            <input type="checkbox" data-day="${day.id}" data-task="${task.id}" ${task.done ? 'checked' : ''} class="study-task-checkbox mt-0.5 h-4 w-4 rounded border-white/20 bg-black/60 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
            <span class="text-xs leading-relaxed font-body ${task.done ? 'line-through text-slate-500' : 'text-slate-200'}">${task.text}</span>
          </label>
        `;
      });

      card.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
          <div>
            <h4 class="text-sm font-bold text-white font-sans">${day.date}</h4>
            <p class="text-xs text-slate-400 font-body">${day.course} — ${day.courseTitle}</p>
          </div>
          <span class="rounded-lg border px-3 py-1 text-[11px] font-bold font-mono ${badgeColor}">${day.tag}</span>
        </div>
        <div class="space-y-2">
          ${tasksHtml}
        </div>
      `;

      daysContainer.appendChild(card);
    });

    // Checkbox click handlers
    daysContainer.querySelectorAll('.study-task-checkbox').forEach(cb => {
      cb.addEventListener('change', async (e) => {
        const dayId = e.target.getAttribute('data-day');
        const taskId = e.target.getAttribute('data-task');
        const isDone = e.target.checked;

        if (state.currentUser) {
          try {
            await updateStudyTask(state.currentUser.uid, dayId, taskId, isDone);
            showToast('Study block updated ✓', 'success');
          } catch (err) {
            showToast('Failed to update task', 'error');
            e.target.checked = !isDone;
          }
        }
      });
    });
  }
}

// ==============================================================
// 7. TAB 3: TUITIONS & PAYMENT TRACKER
// ==============================================================
function renderTuitionsView() {
  const grid = document.getElementById('tuitionsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  // Filter Tuitions
  const filtered = state.tuitions.filter(t => {
    const q = state.tuitionFilter.search.toLowerCase();
    if (q && !t.name.toLowerCase().includes(q) && !t.area.toLowerCase().includes(q)) {
      return false;
    }
    if (state.tuitionFilter.track !== 'ALL' && t.track !== state.tuitionFilter.track) {
      return false;
    }
    if (state.tuitionFilter.paid === 'paid' && !t.paid) return false;
    if (state.tuitionFilter.paid === 'unpaid' && t.paid) return false;
    return true;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full rounded-2xl border border-dashed border-white/10 p-10 text-center text-slate-400 space-y-2 glass-surface">
        <p class="text-sm font-bold text-white font-sans">No students match your filter.</p>
        <p class="text-xs font-body">Try clearing your search query or reset filters.</p>
      </div>
    `;
    return;
  }

  filtered.forEach((t, index) => {
    const pct = Math.min(100, Math.round(((t.daysDone || 0) / (t.daysPerWeek || 1)) * 100));
    const trackBadge = t.track === 'A'
      ? 'Track A: Sun, Tue, Thu, Fri (4d)'
      : 'Track B: Sat, Mon, Wed (3d)';

    const initial = (t.name || 'S').trim().charAt(0).toUpperCase();
    const avatarGrad = t.track === 'A'
      ? 'from-violet-600 via-indigo-600 to-cyan-500'
      : 'from-cyan-600 via-teal-500 to-emerald-500';

    const card = document.createElement('div');
    card.className = 'tuition-card flex flex-col justify-between rounded-2xl glass-surface glass-surface-hover p-5 space-y-4 border border-white/10 group';
    card.setAttribute('draggable', 'true');
    card.setAttribute('data-id', t.id);

    card.innerHTML = `
      <div class="space-y-3">
        <!-- Header: Avatar, Name, Order, Fee -->
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start gap-3">
            <!-- Initial Avatar Badge -->
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr ${avatarGrad} font-black text-white text-sm shadow-md ring-1 ring-white/20">
              ${initial}
            </div>

            <!-- Drag Handle & Reorder Buttons -->
            <div class="flex flex-col items-center justify-center gap-0.5 pt-0.5">
              <span class="cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300" title="Drag to reorder">
                <svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-12a2 2 0 10.001 4.001A2 2 0 0013 2zm0 6a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z" />
                </svg>
              </span>
              <div class="flex flex-col">
                <button type="button" data-action="move-up" data-id="${t.id}" class="text-[9px] text-slate-500 hover:text-indigo-400 leading-none" title="Move Up">▲</button>
                <button type="button" data-action="move-down" data-id="${t.id}" class="text-[9px] text-slate-500 hover:text-indigo-400 leading-none" title="Move Down">▼</button>
              </div>
            </div>

            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-extrabold text-white cursor-pointer hover:text-indigo-300 transition-colors font-sans" data-action="inline-edit" data-id="${t.id}">
                  ${t.name}
                </h3>
                <span class="text-[10px] font-mono rounded-md bg-black/60 px-1.5 py-0.5 text-slate-400 border border-white/10">#${t.slotOrder || index + 1}</span>
              </div>
              <p class="text-xs text-indigo-300 font-medium font-body">${t.area}</p>
            </div>
          </div>

          <div class="flex flex-col items-end gap-1">
            <span class="rounded-xl bg-black/60 px-3 py-1.5 text-xs font-black text-emerald-400 border border-emerald-500/25 font-mono shadow-[0_0_12px_rgba(16,185,129,0.15)]">
              ${Number(t.fee || 0).toLocaleString()} <span class="text-[10px] text-slate-400 font-sans">BDT</span>
            </span>
          </div>
        </div>

        <!-- Note snippet -->
        <p class="text-xs text-slate-400 leading-relaxed italic cursor-pointer hover:text-slate-200 transition-colors font-body bg-black/20 p-2 rounded-xl border border-white/[0.04]" data-action="edit" data-id="${t.id}">
          ${t.note || 'No notes added. Click to edit notes.'}
        </p>

        <!-- Track & Target Badges -->
        <div class="flex flex-wrap items-center gap-2 pt-0.5">
          <span class="rounded-lg bg-white/[0.06] border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-slate-300 font-sans">${trackBadge}</span>
          <span class="rounded-lg bg-white/[0.06] border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-slate-300 font-mono">Target: ${t.daysPerWeek}d/wk</span>
        </div>

        <!-- Active Schedule Adjustment Pills -->
        ${(() => {
          const sAdjs = (state.adjustments || []).filter(a => a.tuitionId === t.id);
          if (sAdjs.length === 0) return '';
          let chips = '';
          sAdjs.forEach(a => {
            if (a.status === 'online') {
              chips += `<span class="rounded-lg bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-bold text-cyan-300">💻 Online (${a.originalDay})</span>`;
            } else if (a.status === 'shifted') {
              chips += `<span class="rounded-lg bg-violet-500/15 border border-violet-500/30 px-2 py-0.5 text-[10px] font-bold text-violet-300">⏩ ${a.originalDay} → ${a.targetDay}</span>`;
            } else if (a.status === 'cancelled') {
              chips += `<span class="rounded-lg bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold text-rose-300">❌ Off (${a.originalDay})</span>`;
            }
          });
          return `<div class="flex flex-wrap items-center gap-1.5 pt-1">${chips}</div>`;
        })()}
      </div>

      <!-- Weekly Progress & Actions -->
      <div class="space-y-3 pt-3 border-t border-white/[0.08]">
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-xs font-body">
            <span class="text-slate-400">Weekly Progress</span>
            <span class="font-bold text-white font-mono">${t.daysDone || 0} / ${t.daysPerWeek} days (${pct}%)</span>
          </div>
          <div class="h-2 w-full overflow-hidden rounded-full bg-black/50 p-[1px]">
            <div class="progress-bar-fill h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full shadow-[0_0_8px_#6366f1]" style="width: ${pct}%"></div>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
          <!-- Counter Buttons -->
          <div class="flex items-center gap-1.5">
            <button type="button" data-action="dec" data-id="${t.id}" class="tuition-action-btn rounded-xl border border-white/10 bg-white/[0.06] hover:bg-white/[0.12] px-3 py-1.5 text-xs font-bold text-slate-200 hover:text-white active:scale-95 transition-all">- Day</button>
            <button type="button" data-action="inc" data-id="${t.id}" class="tuition-action-btn rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 px-3.5 py-1.5 text-xs font-bold text-white active:scale-95 transition-all shadow-md shadow-indigo-600/30 ring-1 ring-white/20">+ Day</button>
          </div>

          <!-- Paid, Adjust, Edit, Delete Controls -->
          <div class="flex items-center gap-1.5">
            <button type="button" data-action="paid" data-id="${t.id}" class="tuition-action-btn rounded-xl px-3 py-1.5 text-xs font-bold border transition-all active:scale-95 ${
              t.paid
                ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                : 'border-white/10 bg-white/[0.04] text-slate-400 hover:text-white hover:border-white/20'
            }">
              ${t.paid ? '✓ Fee Paid' : 'Mark Paid'}
            </button>
            <button type="button" data-action="adjust" data-id="${t.id}" class="tuition-action-btn rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1.5 text-xs font-bold text-amber-300 hover:text-amber-200 transition-all active:scale-95 flex items-center gap-1" title="Adjust Schedule (Shift, Cancel, Online)">
              <span>⚡</span> Adjust
            </button>
            <button type="button" data-action="edit" data-id="${t.id}" class="tuition-action-btn rounded-xl border border-white/10 bg-white/[0.05] hover:bg-white/[0.1] px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white transition-all active:scale-95">
              Edit
            </button>
            <button type="button" data-action="delete" data-id="${t.id}" class="tuition-action-btn rounded-xl border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-1.5 text-xs font-bold text-rose-400 hover:text-rose-300 transition-all active:scale-95" title="Delete Student">
              ✕
            </button>
          </div>
        </div>
      </div>
    `;

    // Attach Drag and Drop handlers
    setupDragAndDrop(card, t.id);

    grid.appendChild(card);
  });

  // Attach button action handlers
  grid.querySelectorAll('.tuition-action-btn, [data-action]').forEach(el => {
    el.addEventListener('click', (e) => {
      const action = el.getAttribute('data-action');
      const id = el.getAttribute('data-id');
      handleTuitionAction(action, id);
    });
  });
}

/**
 * Handle tuition action clicks (inc, dec, paid, edit, delete, move up/down, adjust)
 */
async function handleTuitionAction(action, id) {
  if (!state.currentUser || !id) return;
  const uid = state.currentUser.uid;
  const student = state.tuitions.find(t => t.id === id);
  if (!student) return;

  if (action === 'inc') {
    const nextVal = (Number(student.daysDone) || 0) + 1;
    if (nextVal <= 7) {
      await updateTuition(uid, id, { daysDone: nextVal });
    }
  } else if (action === 'dec') {
    const nextVal = Math.max(0, (Number(student.daysDone) || 0) - 1);
    await updateTuition(uid, id, { daysDone: nextVal });
  } else if (action === 'paid') {
    const nextPaid = !student.paid;
    await updateTuition(uid, id, { paid: nextPaid });
    showToast(nextPaid ? `Marked ${student.name} as paid ✓` : `Marked ${student.name} as unpaid`, 'info');
  } else if (action === 'adjust') {
    openAdjustmentModal(id, state.settings.selectedDay || 'Sun');
  } else if (action === 'edit' || action === 'inline-edit') {
    openTuitionModal(student);
  } else if (action === 'delete') {
    openDeleteModal(student);
  } else if (action === 'move-up') {
    moveTuitionOrder(id, -1);
  } else if (action === 'move-down') {
    moveTuitionOrder(id, 1);
  }
}

/**
 * Move tuition slot order up or down
 */
async function moveTuitionOrder(id, direction) {
  if (!state.currentUser) return;
  const list = [...state.tuitions].sort((a, b) => (Number(a.slotOrder) || 1) - (Number(b.slotOrder) || 1));
  const currentIndex = list.findIndex(t => t.id === id);
  if (currentIndex === -1) return;

  const targetIndex = currentIndex + direction;
  if (targetIndex < 0 || targetIndex >= list.length) return;

  // Swap
  const temp = list[currentIndex];
  list[currentIndex] = list[targetIndex];
  list[targetIndex] = temp;

  const updates = list.map((item, idx) => ({ id: item.id, slotOrder: idx + 1 }));
  await reorderTuitions(state.currentUser.uid, updates);
  showToast('Student order updated ✓', 'success');
}

/**
 * HTML5 Drag & Drop reordering support
 */
function setupDragAndDrop(card, tuitionId) {
  card.addEventListener('dragstart', (e) => {
    state.draggedTuitionId = tuitionId;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    document.querySelectorAll('.tuition-card').forEach(c => c.classList.remove('drag-over'));
  });

  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    card.classList.add('drag-over');
  });

  card.addEventListener('dragleave', () => {
    card.classList.remove('drag-over');
  });

  card.addEventListener('drop', async (e) => {
    e.preventDefault();
    card.classList.remove('drag-over');

    const sourceId = state.draggedTuitionId;
    const targetId = tuitionId;
    if (!sourceId || sourceId === targetId || !state.currentUser) return;

    const list = [...state.tuitions].sort((a, b) => (Number(a.slotOrder) || 1) - (Number(b.slotOrder) || 1));
    const srcIndex = list.findIndex(t => t.id === sourceId);
    const tgtIndex = list.findIndex(t => t.id === targetId);

    if (srcIndex === -1 || tgtIndex === -1) return;

    // Move source element to target position
    const [moved] = list.splice(srcIndex, 1);
    list.splice(tgtIndex, 0, moved);

    const updates = list.map((item, idx) => ({ id: item.id, slotOrder: idx + 1 }));
    await reorderTuitions(state.currentUser.uid, updates);
    showToast('Reordered via drag & drop ✓', 'success');
  });
}

// ==============================================================
// 8. TAB 4: FOCUS & TUITION TIMER
// ==============================================================
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateTimerUI() {
  const display = document.getElementById('timerDisplay');
  const startBtn = document.getElementById('btnTimerStartPause');
  const muteBtn = document.getElementById('btnToggleMute');
  const subStatus = document.getElementById('timerSubStatus');

  if (display) display.textContent = formatTime(state.timer.remainingSeconds);
  if (startBtn) {
    startBtn.textContent = state.timer.isRunning ? 'Pause Timer' : 'Start Timer';
    if (state.timer.isRunning) {
      startBtn.className = 'rounded-2xl bg-amber-600 hover:bg-amber-500 px-8 py-3.5 text-sm font-extrabold text-white shadow-xl shadow-amber-600/30 transition active:scale-95';
    } else {
      startBtn.className = 'rounded-2xl bg-indigo-600 hover:bg-indigo-500 px-8 py-3.5 text-sm font-extrabold text-white shadow-xl shadow-indigo-600/30 transition active:scale-95';
    }
  }
  if (muteBtn) muteBtn.textContent = state.timer.isMuted ? 'Sound: MUTED' : 'Sound: ON';
}

function toggleTimer() {
  if (state.timer.isRunning) {
    // Pause
    clearInterval(state.timer.intervalId);
    state.timer.intervalId = null;
    state.timer.isRunning = false;
    document.getElementById('timerSubStatus').textContent = 'Timer paused';
  } else {
    // Start
    state.timer.isRunning = true;
    document.getElementById('timerSubStatus').textContent = 'Session in progress — stay focused!';
    if (state.timer.intervalId) clearInterval(state.timer.intervalId);

    state.timer.intervalId = setInterval(() => {
      if (state.timer.remainingSeconds > 0) {
        state.timer.remainingSeconds--;
        updateTimerUI();
      } else {
        clearInterval(state.timer.intervalId);
        state.timer.intervalId = null;
        state.timer.isRunning = false;
        document.getElementById('timerSubStatus').textContent = 'Session complete! Excellent job.';
        playChime();
        showToast('Session complete! Great work.', 'success');
        updateTimerUI();
      }
    }, 1000);
  }
  updateTimerUI();
}

function resetTimer() {
  if (state.timer.intervalId) {
    clearInterval(state.timer.intervalId);
    state.timer.intervalId = null;
  }
  state.timer.isRunning = false;
  state.timer.remainingSeconds = state.timer.totalSeconds;
  document.getElementById('timerSubStatus').textContent = 'Timer reset and ready';
  updateTimerUI();
}

/**
 * Web Audio API synthesized chime
 */
function playChime() {
  if (state.timer.isMuted) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    // Harmonious dual bell chime (D5 -> A5)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.2); // A5

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  } catch (err) {
    console.warn("Could not play timer chime:", err);
  }
}

// ==============================================================
// 9. TAB 5: HISTORY & ARCHIVES
// ==============================================================
function renderHistoryView() {
  const container = document.getElementById('historyLogsContainer');
  if (!container) return;
  container.innerHTML = '';

  if (state.historyLogs.length === 0) {
    container.innerHTML = `
      <div class="rounded-2xl border border-dashed border-white/10 p-8 text-center text-slate-400 space-y-2 glass-surface">
        <p class="text-sm font-bold text-white font-sans">No weekly archives found yet.</p>
        <p class="text-xs font-body">Click "Reset Week &amp; Archive" on the Tuitions tab at the end of a week to save your session log.</p>
      </div>
    `;
    return;
  }

  state.historyLogs.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'rounded-2xl border border-white/10 glass-surface glass-surface-hover p-5 space-y-3.5';

    let summaryItems = '';
    (entry.tuitionsSummary || []).forEach(st => {
      summaryItems += `
        <div class="flex items-center justify-between py-1.5 border-b border-white/[0.06] text-xs">
          <div>
            <span class="font-medium text-white font-sans">${st.name}</span>
            <span class="text-[11px] text-slate-400 font-body">(${st.area})</span>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-slate-400 font-mono text-[11px]">${st.daysDone}/${st.daysPerWeek} sessions</span>
            <span class="font-mono font-bold ${st.paid ? 'text-emerald-400' : 'text-slate-400'}">${Number(st.fee).toLocaleString()} BDT</span>
          </div>
        </div>
      `;
    });

    card.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
        <div>
          <h4 class="text-sm font-bold text-white font-sans">Week: ${entry.weekStart} – ${entry.weekEnd}</h4>
          <p class="text-[11px] text-slate-400 font-body">Archived on ${new Date(entry.archivedAt).toLocaleString()}</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 text-xs font-bold font-mono text-emerald-300">
            Collected: ${Number(entry.collectedFee || 0).toLocaleString()} BDT
          </span>
          <span class="rounded-lg bg-indigo-500/10 border border-indigo-500/25 px-2.5 py-1 text-xs font-bold font-mono text-indigo-300">
            ${entry.totalSessionsDone || 0} / ${entry.targetSessions || 35} Sessions
          </span>
        </div>
      </div>
      <div class="space-y-1 pt-1 font-body">
        ${summaryItems}
      </div>
    `;

    container.appendChild(card);
  });
}

// ==============================================================
// 10. MODALS LOGIC
// ==============================================================
function openTuitionModal(student = null) {
  const modal = document.getElementById('tuitionModal');
  const title = document.getElementById('tuitionModalTitle');
  const idInput = document.getElementById('modalStudentId');
  const nameInput = document.getElementById('modalStudentName');
  const areaInput = document.getElementById('modalStudentArea');
  const trackInput = document.getElementById('modalStudentTrack');
  const daysInput = document.getElementById('modalStudentDays');
  const feeInput = document.getElementById('modalStudentFee');
  const orderInput = document.getElementById('modalStudentOrder');
  const noteInput = document.getElementById('modalStudentNote');

  if (student) {
    title.textContent = 'Edit Tuition Student';
    idInput.value = student.id;
    nameInput.value = student.name;
    areaInput.value = student.area;
    trackInput.value = student.track;
    daysInput.value = student.daysPerWeek;
    feeInput.value = student.fee;
    orderInput.value = student.slotOrder || 1;
    noteInput.value = student.note || '';
  } else {
    title.textContent = 'Add New Tuition Student';
    idInput.value = '';
    nameInput.value = '';
    areaInput.value = '';
    trackInput.value = 'A';
    daysInput.value = '4';
    feeInput.value = '6000';
    orderInput.value = (state.tuitions.length + 1).toString();
    noteInput.value = '';
  }

  modal.classList.remove('hidden');
}

function closeTuitionModal() {
  document.getElementById('tuitionModal').classList.add('hidden');
}

function openDeleteModal(student) {
  state.pendingDeleteId = student.id;
  document.getElementById('deleteModalStudentName').textContent = `Are you sure you want to remove "${student.name}"? This cannot be undone.`;
  document.getElementById('deleteModal').classList.remove('hidden');
}

function closeDeleteModal() {
  state.pendingDeleteId = null;
  document.getElementById('deleteModal').classList.add('hidden');
}

// ==============================================================
// 10B. SESSION SCHEDULE ADJUSTMENT MODAL LOGIC (Shift, Cancel, Online)
// ==============================================================
function openAdjustmentModal(tuitionId, dayKey = null) {
  const student = state.tuitions.find(t => t.id === tuitionId);
  if (!student) return;

  const targetDay = dayKey || state.settings.selectedDay || 'Sun';
  const modal = document.getElementById('sessionAdjustModal');
  if (!modal) return;

  document.getElementById('adjustModalStudentName').textContent = student.name;
  document.getElementById('adjustModalDayName').textContent = targetDay;
  document.getElementById('adjustTuitionId').value = student.id;
  document.getElementById('adjustOriginalDay').value = targetDay;

  // Check if an existing adjustment is stored for this student on this day
  const existingAdj = (state.adjustments || []).find(a => a.tuitionId === student.id && a.originalDay === targetDay);
  const currentStatus = existingAdj ? existingAdj.status : 'normal';

  setAdjustStatusInModal(currentStatus);

  if (existingAdj) {
    if (existingAdj.onlinePlatform) document.getElementById('adjustOnlinePlatform').value = existingAdj.onlinePlatform;
    if (existingAdj.onlineLink) document.getElementById('adjustOnlineLink').value = existingAdj.onlineLink;
    if (existingAdj.reason && existingAdj.status === 'online') document.getElementById('adjustOnlineNote').value = existingAdj.reason;

    if (existingAdj.targetDay) document.getElementById('adjustTargetDay').value = existingAdj.targetDay;
    if (existingAdj.shiftTime) document.getElementById('adjustShiftTime').value = existingAdj.shiftTime;
    if (existingAdj.reason && existingAdj.status === 'shifted') document.getElementById('adjustShiftNote').value = existingAdj.reason;

    if (existingAdj.reason && existingAdj.status === 'cancelled') document.getElementById('adjustCancelReason').value = existingAdj.reason;
  } else {
    // Defaults
    document.getElementById('adjustOnlinePlatform').value = 'Google Meet';
    document.getElementById('adjustOnlineLink').value = '';
    document.getElementById('adjustOnlineNote').value = '';
    document.getElementById('adjustTargetDay').value = targetDay === 'Sun' ? 'Tue' : (targetDay === 'Tue' ? 'Wed' : 'Fri');
    document.getElementById('adjustShiftTime').value = '04:00 PM';
    document.getElementById('adjustShiftNote').value = '';
    document.getElementById('adjustCancelReason').value = '';
  }

  modal.classList.remove('hidden');
}

function closeAdjustmentModal() {
  const modal = document.getElementById('sessionAdjustModal');
  if (modal) modal.classList.add('hidden');
}

function setAdjustStatusInModal(status) {
  const statusInput = document.getElementById('adjustCurrentStatus');
  if (statusInput) statusInput.value = status;

  // Highlight status buttons
  document.querySelectorAll('.adjust-status-choice-btn').forEach(btn => {
    const s = btn.getAttribute('data-status');
    if (s === status) {
      if (s === 'normal') {
        btn.className = 'adjust-status-choice-btn rounded-2xl border border-indigo-500/40 bg-gradient-to-tr from-violet-600/30 to-indigo-600/20 p-3 text-left transition-all ring-1 ring-indigo-500/50 space-y-1 shadow-lg shadow-indigo-500/10';
      } else if (s === 'online') {
        btn.className = 'adjust-status-choice-btn rounded-2xl border border-cyan-500/40 bg-gradient-to-tr from-cyan-600/30 to-teal-600/20 p-3 text-left transition-all ring-1 ring-cyan-500/50 space-y-1 shadow-lg shadow-cyan-500/10';
      } else if (s === 'shifted') {
        btn.className = 'adjust-status-choice-btn rounded-2xl border border-violet-500/40 bg-gradient-to-tr from-violet-600/30 to-indigo-600/20 p-3 text-left transition-all ring-1 ring-violet-500/50 space-y-1 shadow-lg shadow-violet-500/10';
      } else if (s === 'cancelled') {
        btn.className = 'adjust-status-choice-btn rounded-2xl border border-rose-500/40 bg-gradient-to-tr from-rose-600/30 to-red-600/20 p-3 text-left transition-all ring-1 ring-rose-500/50 space-y-1 shadow-lg shadow-rose-500/10';
      }
    } else {
      btn.className = 'adjust-status-choice-btn rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left transition-all hover:bg-white/[0.08] hover:border-white/20 active:scale-95 space-y-1';
    }
  });

  // Toggle contextual input panels
  const onlineFields = document.getElementById('adjustOnlineFields');
  const shiftFields = document.getElementById('adjustShiftFields');
  const cancelFields = document.getElementById('adjustCancelFields');
  const normalNotice = document.getElementById('adjustNormalNotice');

  if (onlineFields) onlineFields.classList.toggle('hidden', status !== 'online');
  if (shiftFields) shiftFields.classList.toggle('hidden', status !== 'shifted');
  if (cancelFields) cancelFields.classList.toggle('hidden', status !== 'cancelled');
  if (normalNotice) normalNotice.classList.toggle('hidden', status !== 'normal');
}

async function handleSaveAdjustment() {
  if (!state.currentUser) return;
  const uid = state.currentUser.uid;
  const tuitionId = document.getElementById('adjustTuitionId').value;
  const originalDay = document.getElementById('adjustOriginalDay').value;
  const status = document.getElementById('adjustCurrentStatus').value;
  const student = state.tuitions.find(t => t.id === tuitionId);
  if (!student) return;

  const adjId = `${tuitionId}_${originalDay}`;

  try {
    if (status === 'normal') {
      await deleteSessionAdjustment(uid, adjId);
      showToast(`Reverted ${student.name} to regular in-person schedule ✓`, 'info');
    } else if (status === 'online') {
      const platform = document.getElementById('adjustOnlinePlatform').value;
      const link = document.getElementById('adjustOnlineLink').value.trim();
      const note = document.getElementById('adjustOnlineNote').value.trim();
      await saveSessionAdjustment(uid, {
        id: adjId,
        tuitionId,
        studentName: student.name,
        originalDay,
        status: 'online',
        onlinePlatform: platform,
        onlineLink: link,
        reason: note
      });
      showToast(`Marked ${student.name} as Online Class (${platform}) ✓`, 'success');
    } else if (status === 'shifted') {
      const targetDay = document.getElementById('adjustTargetDay').value;
      const shiftTime = document.getElementById('adjustShiftTime').value.trim() || 'Adjusted Slot';
      const shiftNote = document.getElementById('adjustShiftNote').value.trim();
      await saveSessionAdjustment(uid, {
        id: adjId,
        tuitionId,
        studentName: student.name,
        originalDay,
        status: 'shifted',
        targetDay,
        shiftTime,
        reason: shiftNote
      });
      showToast(`Shifted ${student.name} to ${targetDay} at ${shiftTime} ✓`, 'success');
    } else if (status === 'cancelled') {
      const cancelReason = document.getElementById('adjustCancelReason').value.trim();
      await saveSessionAdjustment(uid, {
        id: adjId,
        tuitionId,
        studentName: student.name,
        originalDay,
        status: 'cancelled',
        reason: cancelReason
      });
      showToast(`Cancelled ${student.name} for today (1.25h study freed) ✓`, 'info');
    }

    closeAdjustmentModal();
  } catch (err) {
    showToast('Failed to save adjustment: ' + err.message, 'error');
  }
}

async function handleResetAdjustment() {
  if (!state.currentUser) return;
  const uid = state.currentUser.uid;
  const tuitionId = document.getElementById('adjustTuitionId').value;
  const originalDay = document.getElementById('adjustOriginalDay').value;
  const adjId = `${tuitionId}_${originalDay}`;

  try {
    await deleteSessionAdjustment(uid, adjId);
    showToast('Reset to regular scheduled session ✓', 'info');
    closeAdjustmentModal();
  } catch (err) {
    showToast('Failed to reset: ' + err.message, 'error');
  }
}

// ==============================================================
// 11. THEME SWITCHER
// ==============================================================
function setupTheme() {
  const savedTheme = localStorage.getItem('tuition_theme') || 'dark';
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  const html = document.documentElement;
  const sun = document.getElementById('themeIconSun');
  const moon = document.getElementById('themeIconMoon');

  if (theme === 'light') {
    html.classList.remove('dark');
    html.classList.add('light');
    if (sun) sun.classList.add('hidden');
    if (moon) moon.classList.remove('hidden');
  } else {
    html.classList.remove('light');
    html.classList.add('dark');
    if (sun) sun.classList.remove('hidden');
    if (moon) moon.classList.add('hidden');
  }

  localStorage.setItem('tuition_theme', theme);
  state.settings.theme = theme;
}

function toggleTheme() {
  const nextTheme = state.settings.theme === 'light' ? 'dark' : 'light';
  applyTheme(nextTheme);
  if (state.currentUser) {
    saveUserProfile(state.currentUser.uid, { theme: nextTheme });
  }
}

// ==============================================================
// 12. TOAST NOTIFICATIONS
// ==============================================================
export function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  let borderStyle = 'border-white/10 bg-black/80 text-slate-200 shadow-[0_10px_30px_rgba(0,0,0,0.6)]';
  let icon = 'ℹ️';

  if (type === 'success') {
    borderStyle = 'border-emerald-500/30 bg-[#061510]/90 text-emerald-300 shadow-[0_10px_30px_rgba(16,185,129,0.15)]';
    icon = '✓';
  } else if (type === 'error') {
    borderStyle = 'border-rose-500/30 bg-[#16080b]/90 text-rose-300 shadow-[0_10px_30px_rgba(244,63,94,0.15)]';
    icon = '✕';
  } else if (type === 'warning') {
    borderStyle = 'border-amber-500/30 bg-[#181106]/90 text-amber-300 shadow-[0_10px_30px_rgba(245,158,11,0.15)]';
    icon = '⚠️';
  }

  toast.className = `pointer-events-auto flex items-center gap-3 rounded-2xl border p-3.5 text-xs font-semibold shadow-2xl backdrop-blur-xl transition-all duration-300 transform translate-y-2 opacity-0 ring-1 ring-white/10 font-sans ${borderStyle}`;
  toast.innerHTML = `
    <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xs font-bold font-mono">${icon}</span>
    <span class="flex-1">${message}</span>
  `;

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 300);
  }, duration);
}

// ==============================================================
// 13. SERVICE WORKER REGISTRATION
// ==============================================================
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => {
          console.log('[PWA] ServiceWorker registered with scope:', reg.scope);
        })
        .catch(err => {
          console.warn('[PWA] ServiceWorker registration failed:', err);
        });
    });
  }
}

// ==============================================================
// 14. EVENT LISTENERS SETUP
// ==============================================================
function setupEventListeners() {
  // Navigation Tabs (Desktop & Mobile)
  document.querySelectorAll('.nav-tab-btn, .mobile-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  // Routine Mode buttons
  document.querySelectorAll('.routine-mode-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const mode = btn.getAttribute('data-mode');
      state.settings.routineMode = mode;
      if (state.currentUser) {
        await saveUserSettings(state.currentUser.uid, { routineMode: mode });
      }
      renderRoutineView();
      updateKPIs();
    });
  });

  // Routine Shift buttons
  document.querySelectorAll('.routine-shift-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const shift = btn.getAttribute('data-shift');
      state.settings.routineShift = shift;
      if (state.currentUser) {
        await saveUserSettings(state.currentUser.uid, { routineShift: shift });
      }
      renderRoutineView();
    });
  });

  // Course Filter buttons
  document.querySelectorAll('.course-filter-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const course = btn.getAttribute('data-course');
      state.settings.courseFilter = course;
      if (state.currentUser) {
        await saveUserSettings(state.currentUser.uid, { courseFilter: course });
      }
      renderStudyView();
    });
  });

  // Tuition Filters & Search
  const searchInput = document.getElementById('tuitionSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.tuitionFilter.search = e.target.value.trim();
      renderTuitionsView();
    });
  }

  const trackFilter = document.getElementById('tuitionTrackFilter');
  if (trackFilter) {
    trackFilter.addEventListener('change', (e) => {
      state.tuitionFilter.track = e.target.value;
      renderTuitionsView();
    });
  }

  const paidFilter = document.getElementById('tuitionPaidFilter');
  if (paidFilter) {
    paidFilter.addEventListener('change', (e) => {
      state.tuitionFilter.paid = e.target.value;
      renderTuitionsView();
    });
  }

  // Add Student button
  const btnOpenAdd = document.getElementById('btnOpenAddStudentModal');
  if (btnOpenAdd) {
    btnOpenAdd.addEventListener('click', () => openTuitionModal(null));
  }

  // Tuition Modal buttons
  document.getElementById('btnCloseTuitionModal')?.addEventListener('click', closeTuitionModal);
  document.getElementById('btnCancelTuitionModal')?.addEventListener('click', closeTuitionModal);

  // Tuition Form Submit
  const tuitionForm = document.getElementById('tuitionForm');
  if (tuitionForm) {
    tuitionForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.currentUser) return;

      const uid = state.currentUser.uid;
      const id = document.getElementById('modalStudentId').value;
      const studentData = {
        name: document.getElementById('modalStudentName').value.trim(),
        area: document.getElementById('modalStudentArea').value.trim(),
        track: document.getElementById('modalStudentTrack').value,
        daysPerWeek: Number(document.getElementById('modalStudentDays').value) || 3,
        fee: Number(document.getElementById('modalStudentFee').value) || 0,
        slotOrder: Number(document.getElementById('modalStudentOrder').value) || 1,
        note: document.getElementById('modalStudentNote').value.trim()
      };

      try {
        if (id) {
          await updateTuition(uid, id, studentData);
          showToast('Student updated ✓', 'success');
        } else {
          await addTuition(uid, studentData);
          showToast('Student added successfully ✓', 'success');
        }
        closeTuitionModal();
      } catch (err) {
        showToast('Error saving student', 'error');
      }
    });
  }

  // Delete Modal buttons
  document.getElementById('btnCancelDelete')?.addEventListener('click', closeDeleteModal);
  document.getElementById('btnConfirmDelete')?.addEventListener('click', async () => {
    if (state.pendingDeleteId && state.currentUser) {
      await deleteTuition(state.currentUser.uid, state.pendingDeleteId);
      showToast('Student removed ✓', 'info');
      closeDeleteModal();
    }
  });

  // Session Schedule Adjustment Modal listeners
  document.getElementById('btnCloseAdjustModal')?.addEventListener('click', closeAdjustmentModal);
  document.getElementById('btnCancelAdjustModal')?.addEventListener('click', closeAdjustmentModal);
  document.getElementById('btnSaveAdjustment')?.addEventListener('click', handleSaveAdjustment);
  document.getElementById('btnResetAdjustment')?.addEventListener('click', handleResetAdjustment);

  // Status choice buttons inside adjustment modal
  document.querySelectorAll('.adjust-status-choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const status = btn.getAttribute('data-status');
      setAdjustStatusInModal(status);
    });
  });

  // Generate Google Meet Link quick button
  document.getElementById('btnGenerateMeetLink')?.addEventListener('click', () => {
    const meetInput = document.getElementById('adjustOnlineLink');
    if (meetInput) {
      const randCode = Math.random().toString(36).substring(2, 5) + '-' + Math.random().toString(36).substring(2, 6) + '-' + Math.random().toString(36).substring(2, 5);
      meetInput.value = `https://meet.google.com/${randCode}`;
      showToast('Generated Google Meet link ✓', 'info');
    }
  });

  // Weekly Reset with Archive Confirmation
  document.getElementById('btnResetWeeklyCounts')?.addEventListener('click', async () => {
    if (!state.currentUser) return;
    const confirmReset = window.confirm(
      "Reset Weekly Sessions?\n\nThis will archive your current progress to the 'History & Logs' tab and reset all student session counters to 0 for the new week."
    );
    if (!confirmReset) return;

    try {
      await resetWeeklyTuitions(state.currentUser.uid, state.tuitions);
      showToast('Week reset and archived to history ✓', 'success');
    } catch (err) {
      showToast('Reset failed', 'error');
    }
  });

  // Toggle All Paid
  document.getElementById('btnMarkAllPaid')?.addEventListener('click', async () => {
    if (!state.currentUser) return;
    const allPaid = state.tuitions.every(t => t.paid);
    const nextStatus = !allPaid;

    for (let t of state.tuitions) {
      await updateTuition(state.currentUser.uid, t.id, { paid: nextStatus });
    }
    showToast(nextStatus ? 'All students marked Paid ✓' : 'All students marked Unpaid', 'info');
  });

  // Timer controls
  document.getElementById('btnTimerStartPause')?.addEventListener('click', toggleTimer);
  document.getElementById('btnTimerReset')?.addEventListener('click', resetTimer);
  document.getElementById('btnToggleMute')?.addEventListener('click', () => {
    state.timer.isMuted = !state.timer.isMuted;
    updateTimerUI();
  });

  // Timer presets
  document.querySelectorAll('.timer-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mins = Number(btn.getAttribute('data-minutes')) || 50;
      const label = btn.getAttribute('data-label') || `${mins}m Session`;

      if (state.timer.intervalId) {
        clearInterval(state.timer.intervalId);
        state.timer.intervalId = null;
      }
      state.timer.isRunning = false;
      state.timer.totalSeconds = mins * 60;
      state.timer.remainingSeconds = mins * 60;
      state.timer.label = label;

      const labelEl = document.getElementById('timerModeLabel');
      const statusEl = document.getElementById('timerSubStatus');
      if (labelEl) labelEl.textContent = label;
      if (statusEl) statusEl.textContent = `Preset loaded: ${mins} minutes`;

      updateTimerUI();
    });
  });

  // Add Study Day / Task Modal
  const studyModal = document.getElementById('addStudyDayModal');
  document.getElementById('btnOpenAddStudyDayModal')?.addEventListener('click', () => {
    studyModal.classList.remove('hidden');
  });
  document.getElementById('btnCloseStudyModal')?.addEventListener('click', () => studyModal.classList.add('hidden'));
  document.getElementById('btnCancelStudyModal')?.addEventListener('click', () => studyModal.classList.add('hidden'));

  document.getElementById('addStudyTaskForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.currentUser) return;

    const course = document.getElementById('modalTaskCourse').value;
    const date = document.getElementById('modalTaskDate').value.trim();
    const taskText = document.getElementById('modalTaskText').value.trim();

    try {
      await addStudyDay(state.currentUser.uid, {
        course,
        courseTitle: `${course} Revision`,
        date,
        tag: 'Custom Goal',
        tasks: [{ id: 'task_' + Date.now(), text: taskText, done: false }]
      });
      showToast('Study milestone added ✓', 'success');
      studyModal.classList.add('hidden');
      document.getElementById('addStudyTaskForm').reset();
    } catch (err) {
      showToast('Failed to add milestone', 'error');
    }
  });

  // Export Data JSON
  document.getElementById('btnExportData')?.addEventListener('click', async () => {
    if (!state.currentUser) return;
    try {
      showToast('Generating backup...', 'info');
      const data = await exportAllUserData(state.currentUser.uid);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tuition_planner_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Export downloaded ✓', 'success');
    } catch (err) {
      showToast('Export failed', 'error');
    }
  });

  // Export History JSON
  document.getElementById('btnExportHistory')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state.historyLogs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tuition_history_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('History downloaded ✓', 'success');
  });

  // Theme toggle button
  document.getElementById('btnThemeToggle')?.addEventListener('click', toggleTheme);

  // User menu dropdown toggle
  const userMenuBtn = document.getElementById('btnUserMenu');
  const userMenuDropdown = document.getElementById('userMenuDropdown');
  if (userMenuBtn && userMenuDropdown) {
    userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userMenuDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
      userMenuDropdown.classList.add('hidden');
    });
  }

  // Firebase Config Setup Modal
  const fbModal = document.getElementById('firebaseConfigModal');
  const openFbModal = () => {
    const current = getActiveFirebaseConfig();
    document.getElementById('firebaseConfigInput').value = JSON.stringify(current, null, 2);
    fbModal.classList.remove('hidden');
  };

  document.getElementById('btnOpenFirebaseModal')?.addEventListener('click', openFbModal);
  document.getElementById('btnMenuFirebaseConfig')?.addEventListener('click', openFbModal);
  document.getElementById('btnCloseFirebaseModal')?.addEventListener('click', () => fbModal.classList.add('hidden'));
  document.getElementById('btnCancelFirebaseModal')?.addEventListener('click', () => fbModal.classList.add('hidden'));

  document.getElementById('btnSaveFirebaseConfig')?.addEventListener('click', () => {
    const raw = document.getElementById('firebaseConfigInput').value.trim();
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.apiKey || !parsed.projectId) {
        throw new Error("Must contain apiKey and projectId.");
      }
      saveFirebaseConfig(parsed);
      showToast('Firebase configuration saved! Reloading...', 'success');
    } catch (e) {
      showToast('Invalid JSON format: ' + e.message, 'error');
    }
  });

  document.getElementById('btnResetToDemo')?.addEventListener('click', () => {
    if (confirm("Reset to default demo setup?")) {
      resetFirebaseConfig();
    }
  });

  // Sign Out
  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    await logOut();
    showToast('Signed out successfully', 'info');
  });
}

// ==============================================================
// 15. AUTHENTICATION UI LOGIC
// ==============================================================
function initAuthUI() {
  let isSignUpMode = false;

  const authTabSignIn = document.getElementById('authTabSignIn');
  const authTabSignUp = document.getElementById('authTabSignUp');
  const authNameField = document.getElementById('authNameField');
  const authSubmitText = document.getElementById('authSubmitText');
  const authAlert = document.getElementById('authAlert');
  const authForm = document.getElementById('authForm');
  const btnGoogle = document.getElementById('btnGoogleAuth');
  const btnQuickDemo = document.getElementById('btnQuickDemo');
  const btnForgotPass = document.getElementById('btnForgotPass');
  const spinner = document.getElementById('authSubmitSpinner');

  function setAuthMode(signUp) {
    isSignUpMode = signUp;
    if (isSignUpMode) {
      authTabSignUp.className = 'flex-1 py-2 rounded-xl text-center text-xs font-bold transition-all bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-indigo-600/25 ring-1 ring-white/20';
      authTabSignIn.className = 'flex-1 py-2 rounded-xl text-center text-xs font-semibold transition-all text-slate-400 hover:text-white';
      authNameField.classList.remove('hidden');
      authSubmitText.textContent = 'Create Account';
    } else {
      authTabSignIn.className = 'flex-1 py-2 rounded-xl text-center text-xs font-bold transition-all bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-indigo-600/25 ring-1 ring-white/20';
      authTabSignUp.className = 'flex-1 py-2 rounded-xl text-center text-xs font-semibold transition-all text-slate-400 hover:text-white';
      authNameField.classList.add('hidden');
      authSubmitText.textContent = 'Sign In';
    }
    clearAlert();
  }

  function showAlert(msg, isSuccess = false) {
    if (!authAlert) return;
    authAlert.textContent = msg;
    authAlert.classList.remove('hidden');
    if (isSuccess) {
      authAlert.className = 'rounded-xl p-3 text-xs border border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
    } else {
      authAlert.className = 'rounded-xl p-3 text-xs border border-rose-500/40 bg-rose-500/10 text-rose-300';
    }
  }

  function clearAlert() {
    if (authAlert) {
      authAlert.classList.add('hidden');
      authAlert.textContent = '';
    }
  }

  authTabSignIn?.addEventListener('click', () => setAuthMode(false));
  authTabSignUp?.addEventListener('click', () => setAuthMode(true));

  // Email / Password Form Submit
  authForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert();
    spinner?.classList.remove('hidden');

    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const name = document.getElementById('authDisplayName').value.trim();

    try {
      if (isSignUpMode) {
        await signUpWithEmail(email, password, name);
        showToast('Account created! Welcome to TuitionHub.', 'success');
      } else {
        await signInWithEmail(email, password);
        showToast('Welcome back!', 'success');
      }
    } catch (err) {
      showAlert(err.message || 'Authentication error.');
    } finally {
      spinner?.classList.add('hidden');
    }
  });

  // Google Sign-In
  btnGoogle?.addEventListener('click', async () => {
    clearAlert();
    try {
      await signInWithGoogle();
      showToast('Signed in with Google ✓', 'success');
    } catch (err) {
      showAlert(err.message || 'Google sign-in was canceled.');
    }
  });

  // 1-Click Instant Demo Access
  btnQuickDemo?.addEventListener('click', () => {
    enterDemoMode();
    showToast('Loaded in Demo Scholar Mode ✓', 'success');
  });

  // Forgot Password
  btnForgotPass?.addEventListener('click', async () => {
    const email = document.getElementById('authEmail').value.trim();
    if (!email) {
      showAlert('Please enter your email address above first.');
      return;
    }
    try {
      const res = await resetPassword(email);
      showAlert(res.message, true);
    } catch (err) {
      showAlert(err.message);
    }
  });
}
