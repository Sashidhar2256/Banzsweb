const placeholderConfig = {
  apiKey: "AIzaSyAFo9SF0ZJ5EhiwyQR-Cq_RTEXedfq458w",
  authDomain: "asicflowworkshop-8e13e.firebaseapp.com",
  projectId: "asicflowworkshop-8e13e",
  storageBucket: "asicflowworkshop-8e13e.firebasestorage.app",
  messagingSenderId: "391257712311",
  appId: "1:391257712311:web:c43f163e6c0b3b5d630f32",
  measurementId: "G-WB9H2GFG5Q"
};

const ADMIN_EMAIL = "besthasasidhar99@gmail.com";
const localUserKey = "asicFlowWorkshopLocalUser";
const localProgressKey = "asicFlowWorkshopProgress";
const localResultsKey = "asicFlowWorkshopResults";

let firebaseApp;
let auth;
let db;
let authModuleRef;
let firestoreModuleRef;
let recaptchaVerifier;
let leadRecaptchaVerifier;
let authReadyPromise;

function readRuntimeConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem("firebaseConfig") || "null");
    if (saved && saved.projectId && saved.projectId !== placeholderConfig.projectId) {
      localStorage.removeItem("firebaseConfig");
      return window.FIREBASE_CONFIG || placeholderConfig;
    }
    return saved || window.FIREBASE_CONFIG || placeholderConfig;
  } catch {
    return window.FIREBASE_CONFIG || placeholderConfig;
  }
}

const firebaseConfig = readRuntimeConfig();
const isConfigured = () => !Object.values(firebaseConfig).some((value) => !value || String(value).startsWith("VITE_"));

function localUser() {
  return JSON.parse(localStorage.getItem(localUserKey) || "null");
}

function setLocalUser(user) {
  if (user) localStorage.setItem(localUserKey, JSON.stringify(user));
  else localStorage.removeItem(localUserKey);
  window.dispatchEvent(new CustomEvent("auth-state-changed", { detail: user }));
}

function localCollection(key) {
  return JSON.parse(localStorage.getItem(key) || "[]");
}

function saveLocalCollection(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export async function initFirebase() {
  if (!isConfigured()) {
    return { configured: false, adminEmail: ADMIN_EMAIL, user: localUser() };
  }

  if (firebaseApp && auth && db) {
    return { configured: true, auth, db, adminEmail: ADMIN_EMAIL, authModule: authModuleRef, firestoreModule: firestoreModuleRef };
  }

  const appModule = await import("https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js");
  authModuleRef = await import("https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js");
  firestoreModuleRef = await import("https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js");

  firebaseApp = appModule.initializeApp(firebaseConfig);
  auth = authModuleRef.getAuth(firebaseApp);
  db = firestoreModuleRef.getFirestore(firebaseApp);
  return { configured: true, auth, db, adminEmail: ADMIN_EMAIL, authModule: authModuleRef, firestoreModule: firestoreModuleRef };
}

export async function onAuthChange(callback) {
  const state = await initFirebase();
  if (!state.configured) {
    callback(localUser());
    window.addEventListener("auth-state-changed", (event) => callback(event.detail));
    return () => {};
  }

  return state.authModule.onAuthStateChanged(auth, callback);
}

export async function getCurrentUser() {
  const state = await initFirebase();
  if (!state.configured) return localUser();

  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve) => {
      const unsubscribe = state.authModule.onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user);
      });
    });
  }
  return auth.currentUser || authReadyPromise;
}

export async function signInWithEmail(email, password) {
  const { configured, authModule } = await initFirebase();
  if (!configured) {
    if (!email || password.length < 6) throw new Error("Enter a valid email and a password with at least 6 characters.");
    const user = { uid: `local-${email}`, email, displayName: email.split("@")[0], localOnly: true };
    setLocalUser(user);
    return { user };
  }
  return authModule.signInWithEmailAndPassword(auth, email, password);
}

export async function signUpWithEmail(email, password) {
  const { configured, authModule } = await initFirebase();
  if (!configured) {
    if (!email || password.length < 6) throw new Error("Enter a valid email and a password with at least 6 characters.");
    const user = { uid: `local-${email}`, email, displayName: email.split("@")[0], localOnly: true };
    setLocalUser(user);
    return { user };
  }
  return authModule.createUserWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  const { configured, authModule } = await initFirebase();
  if (!configured) {
    setLocalUser(null);
    return;
  }
  return authModule.signOut(auth);
}

export async function signInWithGoogle() {
  const { configured, authModule } = await initFirebase();
  if (!configured) throw new Error("Add Firebase config before Google login can run.");
  const provider = new authModule.GoogleAuthProvider();
  return authModule.signInWithPopup(auth, provider);
}

export async function connectGmailReadonly() {
  const { configured, authModule } = await initFirebase();
  if (!configured) throw new Error("Add Firebase config before Gmail import can run.");
  const provider = new authModule.GoogleAuthProvider();
  provider.addScope("https://www.googleapis.com/auth/gmail.readonly");
  provider.setCustomParameters({ prompt: "consent" });
  const result = await authModule.signInWithPopup(auth, provider);
  const credential = authModule.GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error("Google did not return a Gmail access token. Make sure Gmail API is enabled and consent is accepted.");
  }
  return { user: result.user, accessToken: credential.accessToken };
}

export async function sendPhoneOtp(phoneNumber, containerId = "recaptcha-container") {
  const { configured, authModule } = await initFirebase();
  if (!configured) throw new Error("Add Firebase config before phone OTP can run.");

  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear();
    } catch {
      // The verifier is tied to a previous DOM node; recreating it is safer.
    }
  }
  recaptchaVerifier = new authModule.RecaptchaVerifier(auth, containerId, {
    size: "normal",
    callback: () => {},
    "expired-callback": () => {
      recaptchaVerifier = null;
    }
  });
  return authModule.signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
}

export async function verifyLeadRecaptcha(containerId = "lead-recaptcha-container") {
  const { configured, authModule } = await initFirebase();
  if (!configured) return true;

  if (leadRecaptchaVerifier) {
    try {
      leadRecaptchaVerifier.clear();
    } catch {
      // The verifier can be tied to a previous render; recreate it.
    }
  }

  leadRecaptchaVerifier = new authModule.RecaptchaVerifier(auth, containerId, {
    size: "normal",
    callback: () => {},
    "expired-callback": () => {
      leadRecaptchaVerifier = null;
    }
  });

  await leadRecaptchaVerifier.render();
  return leadRecaptchaVerifier.verify();
}

export async function saveInterestedUser(payload) {
  const { configured, firestoreModule } = await initFirebase();
  const cleanPayload = { ...payload, adminEmail: ADMIN_EMAIL, createdAt: new Date().toISOString() };

  if (!configured) {
    const local = localCollection("interestedUsers");
    local.push({ ...cleanPayload, id: crypto.randomUUID(), localOnly: true });
    saveLocalCollection("interestedUsers", local);
    return { localOnly: true };
  }

  return firestoreModule.addDoc(firestoreModule.collection(db, "interestedUsers"), {
    ...payload,
    adminEmail: ADMIN_EMAIL,
    createdAt: firestoreModule.serverTimestamp()
  });
}

export async function savePhoneLead(payload) {
  const { configured, firestoreModule } = await initFirebase();
  const cleanPayload = {
    ...payload,
    type: "phone_capture",
    status: "captured_for_follow_up",
    createdAt: new Date().toISOString()
  };

  if (!configured) {
    const local = localCollection("phoneLeads");
    local.push({ ...cleanPayload, id: crypto.randomUUID(), localOnly: true });
    saveLocalCollection("phoneLeads", local);
    return { localOnly: true };
  }

  const phoneLead = {
    fullName: payload.fullName,
    email: payload.email,
    phone: payload.phone,
    consent: payload.consent === true,
    userId: payload.userId || null,
    type: "phone_capture",
    status: "captured_for_follow_up",
    createdAt: firestoreModule.serverTimestamp()
  };

  try {
    return await firestoreModule.addDoc(firestoreModule.collection(db, "phoneLeads"), phoneLead);
  } catch (error) {
    if (!String(error?.message || error).includes("permission")) throw error;
    try {
      return await firestoreModule.addDoc(firestoreModule.collection(db, "interestedUsers"), {
        fullName: payload.fullName,
        email: payload.email,
        phone: payload.phone,
        level: "Beginner",
        topic: "Mobile number capture",
        message: "User submitted mobile number for ASIC Flow Workshop follow-up.",
        type: "phone_capture_fallback",
        status: "captured_for_follow_up",
        createdAt: firestoreModule.serverTimestamp()
      });
    } catch (fallbackError) {
      if (!payload.userId) throw fallbackError;
      return firestoreModule.setDoc(
        firestoreModule.doc(db, "users", payload.userId, "progress", "mobileContact"),
        {
          fullName: payload.fullName,
          email: payload.email,
          phone: payload.phone,
          consent: payload.consent === true,
          type: "phone_capture_user_progress",
          status: "captured_for_follow_up",
          updatedAt: firestoreModule.serverTimestamp()
        },
        { merge: true }
      );
    }
  }
}

export async function getInterestedUsers() {
  const { configured, firestoreModule } = await initFirebase();
  if (!configured) return localCollection("interestedUsers");

  const snapshot = await firestoreModule.getDocs(firestoreModule.collection(db, "interestedUsers"));
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function saveLevelProgress(levelNumber, payload) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Please log in to save progress.");
  const state = await initFirebase();
  const record = { levelNumber, userId: user.uid, ...payload, updatedAt: new Date().toISOString() };

  if (!state.configured || user.localOnly) {
    const all = localCollection(localProgressKey).filter((item) => !(item.userId === user.uid && item.levelNumber === levelNumber));
    all.push({ ...record, localOnly: true });
    saveLocalCollection(localProgressKey, all);
    return record;
  }

  return state.firestoreModule.setDoc(
    state.firestoreModule.doc(db, "users", user.uid, "progress", String(levelNumber)),
    { ...payload, levelNumber, updatedAt: state.firestoreModule.serverTimestamp() },
    { merge: true }
  );
}

export async function saveAssignmentResult(levelNumber, result) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Please log in to save assessment results.");
  const state = await initFirebase();
  const record = { id: crypto.randomUUID(), levelNumber, userId: user.uid, ...result, createdAt: new Date().toISOString() };

  if (!state.configured || user.localOnly) {
    const all = localCollection(localResultsKey);
    all.push({ ...record, localOnly: true });
    saveLocalCollection(localResultsKey, all);
    await saveLevelProgress(levelNumber, { completed: result.passed, score: result.score, lastResultId: record.id });
    return record;
  }

  const docRef = state.firestoreModule.doc(state.firestoreModule.collection(db, "users", user.uid, "assignmentResults"));
  await state.firestoreModule.setDoc(docRef, {
    ...result,
    levelNumber,
    createdAt: state.firestoreModule.serverTimestamp()
  });
  await saveLevelProgress(levelNumber, { completed: result.passed, score: result.score, lastResultId: docRef.id });
  return { id: docRef.id };
}

export async function loadUserProgress() {
  const user = await getCurrentUser();
  if (!user) return { progress: [], results: [] };
  const state = await initFirebase();

  if (!state.configured || user.localOnly) {
    return {
      progress: localCollection(localProgressKey).filter((item) => item.userId === user.uid),
      results: localCollection(localResultsKey).filter((item) => item.userId === user.uid)
    };
  }

  const progressSnapshot = await state.firestoreModule.getDocs(state.firestoreModule.collection(db, "users", user.uid, "progress"));
  const resultsSnapshot = await state.firestoreModule.getDocs(state.firestoreModule.collection(db, "users", user.uid, "assignmentResults"));
  return {
    progress: progressSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    results: resultsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
  };
}

export async function saveImportedGmailEmails(emails) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Please log in before importing Gmail messages.");
  const state = await initFirebase();
  const safeEmails = emails.slice(0, 20).map((email) => ({
    id: email.id,
    from: email.from || "",
    subject: email.subject || "",
    date: email.date || "",
    snippet: email.snippet || "",
    importedAt: new Date().toISOString()
  }));

  if (!state.configured || user.localOnly) {
    const all = localCollection(localProgressKey).filter((item) => !(item.userId === user.uid && item.levelNumber === "gmailImports"));
    all.push({
      userId: user.uid,
      levelNumber: "gmailImports",
      completed: true,
      importedEmails: safeEmails,
      updatedAt: new Date().toISOString(),
      localOnly: true
    });
    saveLocalCollection(localProgressKey, all);
    return { localOnly: true };
  }

  return state.firestoreModule.setDoc(
    state.firestoreModule.doc(db, "users", user.uid, "progress", "gmailImports"),
    {
      completed: true,
      importedEmails: safeEmails,
      updatedAt: state.firestoreModule.serverTimestamp()
    },
    { merge: true }
  );
}

export function firebaseStatus() {
  return {
    configured: isConfigured(),
    adminEmail: ADMIN_EMAIL,
    projectId: firebaseConfig.projectId
  };
}

export function saveFirebaseRuntimeConfig(config) {
  const required = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];
  const missing = required.filter((key) => !config[key] || String(config[key]).startsWith("VITE_"));
  if (missing.length) {
    throw new Error(`Missing Firebase config values: ${missing.join(", ")}`);
  }
  localStorage.setItem("firebaseConfig", JSON.stringify(config));
}

export function clearFirebaseRuntimeConfig() {
  localStorage.removeItem("firebaseConfig");
}

export { ADMIN_EMAIL, firebaseConfig };
