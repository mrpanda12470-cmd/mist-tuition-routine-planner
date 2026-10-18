/**
 * Authentication Module for Tuition & MIST Study Routine Planner
 * Powered by Firebase Authentication (v10 modular SDK)
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

// Default placeholder configuration (Replace with your Firebase Project credentials)
export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Check if a saved config exists in LocalStorage or use default
export function getActiveFirebaseConfig() {
  try {
    const saved = localStorage.getItem('tuition_firebase_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.apiKey && parsed.apiKey !== "YOUR_API_KEY" && parsed.projectId) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Could not read saved Firebase config:", e);
  }
  return DEFAULT_FIREBASE_CONFIG;
}

export function saveFirebaseConfig(config) {
  localStorage.setItem('tuition_firebase_config', JSON.stringify(config));
  window.location.reload();
}

export function resetFirebaseConfig() {
  localStorage.removeItem('tuition_firebase_config');
  window.location.reload();
}

export function isPlaceholderConfig(config = getActiveFirebaseConfig()) {
  return !config.apiKey || config.apiKey === "YOUR_API_KEY" || !config.projectId || config.projectId === "YOUR_PROJECT_ID";
}

// Global instances
let firebaseApp = null;
let firebaseAuth = null;
let isDemoModeActive = false;
let demoUser = null;
const authCallbacks = [];

// Initialize Firebase App & Auth
export function initFirebase() {
  const config = getActiveFirebaseConfig();
  
  if (isPlaceholderConfig(config)) {
    console.info("%c[Firebase Auth] Placeholder config detected. Enabling Demo / Local Sandbox mode.", "color: #38bdf8; font-weight: bold;");
    isDemoModeActive = true;
    checkDemoSession();
    return null;
  }

  try {
    firebaseApp = getApps().length > 0 ? getApp() : initializeApp(config);
    firebaseAuth = getAuth(firebaseApp);
    isDemoModeActive = false;
    return firebaseAuth;
  } catch (err) {
    console.error("[Firebase Auth] Initialization error, falling back to Demo Mode:", err);
    isDemoModeActive = true;
    checkDemoSession();
    return null;
  }
}

// Demo session management for zero-friction evaluation
function checkDemoSession() {
  const stored = localStorage.getItem('tuition_demo_user');
  if (stored) {
    try {
      demoUser = JSON.parse(stored);
    } catch (e) {
      demoUser = null;
    }
  }
}

function setDemoSession(user) {
  demoUser = user;
  if (user) {
    localStorage.setItem('tuition_demo_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('tuition_demo_user');
  }
  notifyAuthSubscribers(demoUser);
}

function notifyAuthSubscribers(user) {
  authCallbacks.forEach(cb => {
    try {
      cb(user);
    } catch (e) {
      console.error("Auth subscriber callback failed:", e);
    }
  });
}

/**
 * Subscribe to authentication state changes
 * @param {Function} callback - receives user object or null
 */
export function initAuth(callback) {
  authCallbacks.push(callback);
  
  const auth = initFirebase();
  if (isDemoModeActive || !auth) {
    // Notify with current demo state
    setTimeout(() => {
      callback(demoUser);
    }, 100);
    return () => {};
  }

  return onAuthStateChanged(auth, (user) => {
    notifyAuthSubscribers(user);
  });
}

/**
 * Sign in with Email and Password
 */
export async function signInWithEmail(email, password) {
  if (isDemoModeActive || !firebaseAuth) {
    // Simulate auth in demo mode
    if (!email || !password) throw new Error("Email and password are required.");
    const simulatedUser = {
      uid: 'demo_user_' + btoa(email.toLowerCase()).replace(/=/g, '').substring(0, 12),
      email: email,
      displayName: email.split('@')[0].toUpperCase(),
      photoURL: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(email)}`,
      isDemo: true
    };
    setDemoSession(simulatedUser);
    return simulatedUser;
  }

  try {
    const cred = await signInWithEmailAndPassword(firebaseAuth, email, password);
    return cred.user;
  } catch (error) {
    throw formatAuthError(error);
  }
}

/**
 * Sign up with Email, Password and optional Display Name
 */
export async function signUpWithEmail(email, password, displayName) {
  if (isDemoModeActive || !firebaseAuth) {
    if (!email || !password) throw new Error("Email and password are required.");
    if (password.length < 6) throw new Error("Password must be at least 6 characters.");
    const simulatedUser = {
      uid: 'demo_user_' + btoa(email.toLowerCase()).replace(/=/g, '').substring(0, 12),
      email: email,
      displayName: displayName || email.split('@')[0],
      photoURL: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(email)}`,
      isDemo: true
    };
    setDemoSession(simulatedUser);
    return simulatedUser;
  }

  try {
    const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
    if (displayName) {
      await updateProfile(cred.user, { displayName });
    }
    return cred.user;
  } catch (error) {
    throw formatAuthError(error);
  }
}

/**
 * Sign in with Google
 */
export async function signInWithGoogle() {
  if (isDemoModeActive || !firebaseAuth) {
    // Demo Google sign-in
    const simulatedUser = {
      uid: 'demo_google_student_ce',
      email: 'student.mist@example.com',
      displayName: 'MIST Scholar',
      photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
      isDemo: true
    };
    setDemoSession(simulatedUser);
    return simulatedUser;
  }

  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(firebaseAuth, provider);
    return result.user;
  } catch (error) {
    throw formatAuthError(error);
  }
}

/**
 * One-Click Demo Mode Sign-In
 */
export function enterDemoMode() {
  const simulatedUser = {
    uid: 'demo_scholar_manikdi',
    email: 'scholar@manikdi.hub',
    displayName: 'CE-411 Scholar',
    photoURL: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
    isDemo: true
  };
  setDemoSession(simulatedUser);
  return simulatedUser;
}

/**
 * Password Reset Email
 */
export async function resetPassword(email) {
  if (isDemoModeActive || !firebaseAuth) {
    return { success: true, message: `Demo reset link simulated for ${email}.` };
  }

  try {
    await sendPasswordResetEmail(firebaseAuth, email);
    return { success: true, message: `Password reset email sent to ${email}!` };
  } catch (error) {
    throw formatAuthError(error);
  }
}

/**
 * Log Out
 */
export async function logOut() {
  if (isDemoModeActive || !firebaseAuth) {
    setDemoSession(null);
    return;
  }

  try {
    await signOut(firebaseAuth);
  } catch (error) {
    console.error("Sign out error:", error);
    throw error;
  }
}

/**
 * Get current user
 */
export function getCurrentUser() {
  if (isDemoModeActive || !firebaseAuth) {
    return demoUser;
  }
  return firebaseAuth.currentUser;
}

/**
 * Check if demo mode is currently active
 */
export function isDemo() {
  return isDemoModeActive || !firebaseAuth || (demoUser && demoUser.isDemo);
}

/**
 * Format Firebase Auth Errors into user-friendly messages
 */
function formatAuthError(err) {
  const code = err.code || '';
  let msg = err.message || 'Authentication error occurred.';

  switch (code) {
    case 'auth/invalid-email':
      msg = 'Invalid email address format.';
      break;
    case 'auth/user-disabled':
      msg = 'This user account has been disabled.';
      break;
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      msg = 'Incorrect email or password. Please verify and try again.';
      break;
    case 'auth/email-already-in-use':
      msg = 'An account with this email already exists.';
      break;
    case 'auth/weak-password':
      msg = 'Password is too weak. Please use at least 6 characters.';
      break;
    case 'auth/popup-closed-by-user':
      msg = 'Google sign-in popup was closed before finishing.';
      break;
    case 'auth/operation-not-allowed':
      msg = 'This authentication provider is not enabled in your Firebase Console.';
      break;
    case 'auth/network-request-failed':
      msg = 'Network connection issue. Please check your internet connection.';
      break;
    default:
      if (err.message) msg = err.message;
  }

  const customError = new Error(msg);
  customError.code = code;
  return customError;
}
