import { modules, backendTopics, assignments } from "./modules.js";
import { levels } from "./levels.js";
import {
  ADMIN_EMAIL,
  clearFirebaseRuntimeConfig,
  connectGmailReadonly,
  firebaseStatus,
  getCurrentUser,
  getInterestedUsers,
  loadUserProgress,
  logout,
  onAuthChange,
  saveAssignmentResult,
  saveFirebaseRuntimeConfig,
  saveImportedGmailEmails,
  saveInterestedUser,
  saveLevelProgress,
  savePhoneLead,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  verifyLeadRecaptcha
} from "./firebase.js";

const app = document.querySelector("#app");
const sidebar = document.querySelector("#sidebar");
const toast = document.querySelector("#toast");
const accountCorner = document.querySelector("#account-corner");
const pipeline = [
  "Digital Fundamentals", "RTL", "Synthesis", "STA", "Floorplanning", "Power Planning",
  "Placement", "CTS", "Routing", "DRC/LVS", "Signoff", "Tapeout"
];
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
const flowLabs = {
  "Digital Fundamentals": { circuit: "NAND + inverter chain", question: "Set logic input A=1 and B=1. What is NAND output?", answer: "0", waveform: "Gate delay from input transition to output settle." },
  RTL: { circuit: "2:1 mux RTL block", question: "Which signal chooses between mux inputs?", answer: "select", waveform: "sel transition changes output after combinational delay." },
  Synthesis: { circuit: "RTL mapped to standard cells", question: "Which library maps logic to cell timing?", answer: "liberty", waveform: "Mapped cells add arc delay and output slew." },
  STA: { circuit: "Launch/capture flop path", question: "Positive slack means timing is ____.", answer: "met", waveform: "Setup window between data arrival and capture edge." },
  Floorplanning: { circuit: "Macro and IO placement", question: "Routing space around a macro is called a ____.", answer: "halo", waveform: "Physical distance increases data delay." },
  "Power Planning": { circuit: "VDD/VSS ring and straps", question: "Voltage loss across the grid is called ____ drop.", answer: "ir", waveform: "Switching current creates supply droop." },
  Placement: { circuit: "Legalized standard cells", question: "High density often causes routing ____.", answer: "congestion", waveform: "Longer detours increase path delay." },
  CTS: { circuit: "Clock buffer tree", question: "Clock arrival difference is clock ____.", answer: "skew", waveform: "Skew shifts launch and capture edges." },
  Routing: { circuit: "Metal layer interconnect", question: "Two nets touching accidentally create a ____.", answer: "short", waveform: "RC parasitics change slew and delay." },
  "DRC/LVS": { circuit: "Physical verification", question: "LVS compares layout against the ____.", answer: "schematic", waveform: "No waveform; validates physical/electrical equivalence." },
  Signoff: { circuit: "MMMC signoff matrix", question: "SPEF stores extracted ____.", answer: "parasitics", waveform: "Final timing uses extracted RC." },
  Tapeout: { circuit: "GDS handoff package", question: "Final manufacturing layout database is ____.", answer: "gds", waveform: "Tapeout freezes all signed-off behavior." }
};

let currentUser = null;
let progressState = { progress: [], results: [] };
let heroAnimationFrame = 0;
let heroResizeHandler = null;
let progressRefreshToken = 0;
let authResolved = false;

const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

const normalize = (value = "") => String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, "");

const showToast = (message) => {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 3600);
};

const friendlyAuthError = (error) => {
  const message = error?.message || String(error);
  if (message.includes("auth/operation-not-allowed")) return "Enable this sign-in provider in Firebase Console > Authentication > Sign-in method.";
  if (message.includes("auth/unauthorized-domain")) return "Add 127.0.0.1 and localhost in Firebase Console > Authentication > Settings > Authorized domains.";
  if (message.includes("auth/user-not-found")) return "Account not found. Click Create Account first, then login.";
  if (message.includes("auth/invalid-credential")) return "Invalid email/password, or the account does not exist yet. Try Create Account first.";
  if (message.includes("auth/email-already-in-use")) return "This email already has an account. Click Login instead of Create Account.";
  if (message.includes("auth/weak-password")) return "Use a password with at least 6 characters.";
  if (message.includes("auth/invalid-phone-number")) return "Use a phone number with country code, for example +91XXXXXXXXXX.";
  if (message.includes("access_denied")) return "Gmail permission was not granted. Click Connect Gmail and approve Gmail read-only access.";
  if (message.includes("reCAPTCHA")) return "Phone OTP needs Phone provider enabled and an authorized domain in Firebase.";
  return message;
};

function headerValue(headers = [], name) {
  return headers.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value || "";
}

async function fetchRecentGmailMessages(accessToken) {
  const listResponse = await fetch(`${GMAIL_API_BASE}?maxResults=10&q=in:anywhere newer_than:30d`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!listResponse.ok) throw new Error(`Gmail list failed: ${listResponse.status}`);
  const listData = await listResponse.json();
  const messages = listData.messages || [];
  const details = await Promise.all(messages.map(async (message) => {
    const response = await fetch(`${GMAIL_API_BASE}/${message.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) throw new Error(`Gmail message load failed: ${response.status}`);
    const data = await response.json();
    const headers = data.payload?.headers || [];
    return {
      id: data.id,
      from: headerValue(headers, "From"),
      subject: headerValue(headers, "Subject") || "(No subject)",
      date: headerValue(headers, "Date"),
      snippet: data.snippet || ""
    };
  }));
  return details;
}

const page = () => (location.hash || "#home").replace("#", "");

document.querySelector("#sidebar-toggle").addEventListener("click", () => sidebar.classList.toggle("open"));
document.addEventListener("click", (event) => {
  if (event.target.matches(".sidebar a")) sidebar.classList.remove("open");
});

function setActiveNav() {
  const current = page();
  document.querySelectorAll("a[href^='#']").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${current}`);
  });
}

function syncAuthNavigation() {
  document.querySelectorAll("a[href='#login']").forEach((link) => {
    link.hidden = Boolean(currentUser);
    link.setAttribute("aria-hidden", currentUser ? "true" : "false");
  });
}

function authBanner() {
  return "";
}

function bindLogout() {
  document.querySelector("#logout-button")?.addEventListener("click", async () => {
    await logout();
    showToast("Logged out.");
    progressState = { progress: [], results: [] };
    await router();
  });
}

function renderAccountCorner() {
  if (!accountCorner) return;
  syncAuthNavigation();
  if (!currentUser) {
    accountCorner.innerHTML = `<a class="account-login" href="#login">Login</a>`;
    return;
  }

  const email = currentUser.email || currentUser.displayName || "Student";
  const initial = email.trim().charAt(0).toUpperCase() || "S";
  accountCorner.innerHTML = `
    <div class="account-pill" title="${escapeHtml(email)}">
      <span class="account-avatar">${escapeHtml(initial)}</span>
      <span class="account-email">${escapeHtml(email)}</span>
      <button class="account-logout" id="corner-logout" type="button">Logout</button>
    </div>
  `;
  document.querySelector("#corner-logout")?.addEventListener("click", async () => {
    await logout();
    showToast("Logged out.");
    progressState = { progress: [], results: [] };
    await router();
  });
}

async function refreshProgress() {
  try {
    progressState = await Promise.race([
      loadUserProgress(),
      new Promise((_, reject) => window.setTimeout(() => reject(new Error("Progress loading timed out.")), 900))
    ]);
  } catch {
    progressState = { progress: [], results: [] };
  }
}

function refreshProgressInBackground(route = page()) {
  if (!currentUser) return;
  const token = ++progressRefreshToken;
  refreshProgress().then(() => {
    if (token !== progressRefreshToken || page() !== route) return;
    if (route === "academy") renderAcademy();
    else if (route === "dashboard") renderDashboard();
  });
}

function isLevelComplete(number) {
  return progressState.progress.some((item) => Number(item.levelNumber) === Number(number) && item.completed);
}

function highestUnlockedLevel() {
  const completed = progressState.progress.filter((item) => item.completed).map((item) => Number(item.levelNumber));
  return Math.max(8, completed.length ? Math.max(...completed) + 1 : 8);
}

function requireAuth(target = page()) {
  if (currentUser) return true;
  sessionStorage.setItem("postLoginRoute", target);
  if (!page().startsWith("login")) location.hash = "login";
  return false;
}

function renderHome() {
  app.innerHTML = `
    <nav class="interface-bar" aria-label="Workshop tools">
      <a href="#viewer">3D Stack</a>
      <a href="#scenario-lab">Scenario Lab</a>
      <a href="#waveform">Waveform</a>
      <a href="#assignments">Assignments</a>
      <a href="#dashboard">Progress</a>
      <a href="#career">Roadmap</a>
    </nav>
    <section class="hero hero-video">
      <div class="edge-blend-frame hero-visual-blend" aria-label="Blended 3D semiconductor visual">
        <canvas id="hero-video-canvas" class="hero-video-canvas" width="1280" height="720" aria-label="Animated 3D semiconductor video"></canvas>
      </div>
      <div class="hero-hud">
        <span>Live wafer</span>
        <span>Power grid</span>
        <span>Clock nets</span>
        <span>Route layers</span>
      </div>
      <div class="hero-copy">
        <div class="eyebrow">Backend Physical Design Workshop</div>
        <h1>BANZS Semiconductor <span class="gradient-text">ASIC Flow Workshop</span></h1>
        <p class="lead">A premium academy for digital fundamentals, RTL, synthesis, STA, floorplanning, power planning, placement, CTS, routing, physical verification, signoff, and tapeout readiness.</p>
        <div class="hero-actions">
          <a class="gold-button" href="#academy">Start Learning</a>
          <a class="ghost-button" href="#academy">Explore 100 Levels</a>
          <a class="ghost-button" href="#interest">I am Interested</a>
        </div>
      </div>
      <div class="hero-status-panel">
        <strong>Realtime ASIC Interface</strong>
        <span>60 fps canvas target</span>
        <span>Optimized layers</span>
        <a href="#viewer">Open full 3D tool</a>
      </div>
    </section>

    <section class="section">
      ${authBanner()}
      <div class="section-head">
        <div>
          <div class="eyebrow">Functional Flow</div>
          <h2>Fundamentals to tapeout lab path</h2>
          <p>Every step below opens an interactive circuit, waveform, validation question, and progress action.</p>
        </div>
      </div>
      <div class="pipeline">
        ${pipeline.map((step, index) => `<a class="pipe-step" style="--i:${index}" href="#flow-${index}">${index + 1}. ${step}</a>`).join("")}
      </div>
    </section>

    <section class="section">
      <div class="grid">
        <article class="card"><h3>3D Semiconductor Interface</h3><p>Run wafer, clock, power, routing, thermal, and signoff-risk scenarios in an interactive 3D-style canvas.</p><a class="gold-button small" href="#viewer">Open 3D Tool</a></article>
        <article class="card"><h3>Real Backend Coverage</h3><p>Practice floorplanning, power, placement, CTS, routing, STA, DRC/LVS, IR, EM, SI, ECO, UPF, signoff, and tapeout scenarios.</p><a class="gold-button small" href="#scenario-lab">Open Scenario Lab</a></article>
        <article class="card"><h3>Persistent Progress</h3><p>Review saved assessment attempts, imported Gmail items, progress status, XP, and tapeout-readiness signals.</p><a class="gold-button small" href="#dashboard">Open Progress</a></article>
      </div>
    </section>
  `;
  bindLogout();
  initHeroVideo();
}

function initHeroVideo() {
  const canvas = document.querySelector("#hero-video-canvas");
  if (!canvas) return;
  cancelAnimationFrame(heroAnimationFrame);
  if (heroResizeHandler) window.removeEventListener("resize", heroResizeHandler);
  const ctx = canvas.getContext("2d", { alpha: false });
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 720 ? 1.35 : 1.75);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(640, Math.floor(rect.width * ratio));
    canvas.height = Math.max(360, Math.floor(rect.height * ratio));
  };
  resize();
  heroResizeHandler = resize;
  window.addEventListener("resize", heroResizeHandler, { passive: true });

  const drawChipPolygon = (cx, cy, scale, phase) => {
    const tilt = Math.sin(phase) * 5;
    const points = [
      [cx - 230 * scale, cy + 74 * scale + tilt],
      [cx + 96 * scale, cy - 48 * scale - tilt],
      [cx + 256 * scale, cy + 42 * scale],
      [cx - 70 * scale, cy + 164 * scale + tilt]
    ];
    const drawPath = (offsetX = 0, offsetY = 0) => {
      ctx.beginPath();
      points.forEach(([x, y], index) => index ? ctx.lineTo(x + offsetX, y + offsetY) : ctx.moveTo(x + offsetX, y + offsetY));
      ctx.closePath();
    };

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.72)";
    ctx.shadowBlur = 36 * scale;
    ctx.shadowOffsetY = 24 * scale;
    drawPath(-8 * scale, 18 * scale);
    ctx.fillStyle = "rgba(0, 0, 0, 0.52)";
    ctx.fill();
    ctx.restore();

    drawPath(14 * scale, 18 * scale);
    const sideGradient = ctx.createLinearGradient(cx - 190 * scale, cy + 80 * scale, cx + 260 * scale, cy + 220 * scale);
    sideGradient.addColorStop(0, "rgba(75, 56, 18, 0.62)");
    sideGradient.addColorStop(0.5, "rgba(22, 17, 8, 0.92)");
    sideGradient.addColorStop(1, "rgba(3, 3, 2, 0.98)");
    ctx.fillStyle = sideGradient;
    ctx.fill();

    ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    const chipGradient = ctx.createLinearGradient(cx - 270 * scale, cy, cx + 320 * scale, cy + 210 * scale);
    chipGradient.addColorStop(0, "#1e1708");
    chipGradient.addColorStop(0.32, "#080705");
    chipGradient.addColorStop(0.68, "#211807");
    chipGradient.addColorStop(1, "#050403");
    ctx.fillStyle = chipGradient;
    ctx.strokeStyle = "rgba(255, 222, 120, 0.86)";
    ctx.lineWidth = Math.max(1, 1.4 * scale);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = "#f7c948";
    ctx.lineWidth = Math.max(0.8, 1 * scale);
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      ctx.beginPath();
      ctx.moveTo(points[0][0] + (points[1][0] - points[0][0]) * t, points[0][1] + (points[1][1] - points[0][1]) * t);
      ctx.lineTo(points[3][0] + (points[2][0] - points[3][0]) * t, points[3][1] + (points[2][1] - points[3][1]) * t);
      ctx.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      ctx.beginPath();
      ctx.moveTo(points[0][0] + (points[3][0] - points[0][0]) * t, points[0][1] + (points[3][1] - points[0][1]) * t);
      ctx.lineTo(points[1][0] + (points[2][0] - points[1][0]) * t, points[1][1] + (points[2][1] - points[1][1]) * t);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.38 + Math.sin(phase * 2) * 0.1;
    ctx.strokeStyle = "#ffdf82";
    ctx.shadowColor = "rgba(255, 223, 130, 0.55)";
    ctx.shadowBlur = 18 * scale;
    ctx.lineWidth = Math.max(2.2, 3.8 * scale);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - 238 * scale + i * 112 * scale, cy + 82 * scale);
      ctx.lineTo(cx + 82 * scale + i * 54 * scale, cy - 36 * scale);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    drawPath();
    ctx.clip();
    const shine = ctx.createLinearGradient(cx - 220 * scale, cy - 40 * scale, cx + 190 * scale, cy + 150 * scale);
    shine.addColorStop(0, "rgba(255, 243, 196, 0.18)");
    shine.addColorStop(0.38, "rgba(255, 223, 130, 0.03)");
    shine.addColorStop(1, "rgba(255, 223, 130, 0.15)");
    ctx.fillStyle = shine;
    ctx.fillRect(cx - 280 * scale, cy - 80 * scale, 620 * scale, 310 * scale);
    ctx.restore();
  };

  const draw = (time = 0) => {
    if (!canvas.isConnected) return;
    const w = canvas.width;
    const h = canvas.height;
    const phase = time * 0.001;
    ctx.fillStyle = "#050403";
    ctx.fillRect(0, 0, w, h);

    const bg = ctx.createRadialGradient(w * 0.6, h * 0.5, 40, w * 0.64, h * 0.5, Math.max(w, h) * 0.72);
    bg.addColorStop(0, "rgba(247, 201, 72, 0.18)");
    bg.addColorStop(0.45, "rgba(82, 61, 20, 0.22)");
    bg.addColorStop(1, "#050403");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = "#f7c948";
    ctx.lineWidth = 1;
    const grid = Math.max(44, w / 18);
    for (let x = (phase * 5) % grid; x < w; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - w * 0.14, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y + Math.sin(phase) * 24);
      ctx.stroke();
    }
    ctx.restore();

    const waferX = w * 0.66;
    const waferY = h * 0.52;
    const waferR = Math.min(w, h) * 0.32;
    ctx.save();
    ctx.translate(waferX, waferY);
    ctx.rotate(phase * 0.12);
    const waferFill = ctx.createRadialGradient(0, 0, waferR * 0.1, 0, 0, waferR);
    waferFill.addColorStop(0, "rgba(255, 223, 130, 0.12)");
    waferFill.addColorStop(0.72, "rgba(247, 201, 72, 0.08)");
    waferFill.addColorStop(1, "rgba(255, 223, 130, 0.02)");
    ctx.beginPath();
    ctx.arc(0, 0, waferR, 0, Math.PI * 2);
    ctx.fillStyle = waferFill;
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 223, 130, 0.32)";
    ctx.lineWidth = Math.max(1, Math.min(w, h) / 520);
    for (let r = waferR * 0.2; r <= waferR; r += waferR / 7) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 14; i++) {
      const a = (Math.PI * 2 * i) / 14;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * waferR * 0.16, Math.sin(a) * waferR * 0.16);
      ctx.lineTo(Math.cos(a) * waferR, Math.sin(a) * waferR);
      ctx.stroke();
    }
    ctx.restore();

    drawChipPolygon(w * 0.55, h * 0.43, Math.min(w, h) / 560, phase);

    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "#ffdf82";
    for (let i = 0; i < 12; i++) {
      const x = (i * 173 + (phase * 18)) % w;
      const y = (Math.sin(i * 1.7 + phase) * 0.34 + 0.48) * h;
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (!reducedMotion) heroAnimationFrame = requestAnimationFrame(draw);
  };
  draw();
}

function renderFlowStep(index) {
  const step = pipeline[index] || pipeline[0];
  const lab = flowLabs[step];
  app.innerHTML = `
    <section class="section">
      ${authBanner()}
      <a class="ghost-button small" href="#home">Back to flow</a>
      <div class="module-detail">
        <div class="detail-grid">
          <div>
            <div class="pill">Flow step ${Number(index) + 1}</div>
            <h2>${escapeHtml(step)}</h2>
            <p>${escapeHtml(lab.circuit)}. ${escapeHtml(lab.waveform)} This step must be validated before moving forward.</p>
            <form id="flow-form" class="panel">
              <label>${escapeHtml(lab.question)}<input name="answer" required autocomplete="off" /></label>
              <button class="gold-button" type="submit">Validate Step</button>
              <p id="flow-result"></p>
            </form>
          </div>
          <div>${circuitCanvasMarkup("flow-canvas")}</div>
        </div>
        <h3>Waveform response</h3>
        ${waveformSvg(step)}
        <div class="hero-actions">
          ${index > 0 ? `<a class="ghost-button" href="#flow-${index - 1}">Previous</a>` : ""}
          ${index < pipeline.length - 1 ? `<a class="gold-button" href="#flow-${index + 1}">Next flow step</a>` : `<a class="gold-button" href="#academy">Continue to academy</a>`}
        </div>
      </div>
    </section>
  `;
  bindLogout();
  drawCircuitCanvas("flow-canvas", index);
  document.querySelector("#flow-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const answer = normalize(new FormData(event.target).get("answer"));
    const pass = answer === normalize(lab.answer);
    document.querySelector("#flow-result").textContent = pass ? "Correct. This flow step is validated." : `Review hint: expected concept is ${lab.answer}.`;
    if (pass) {
      try {
        if (currentUser) await saveLevelProgress(index + 1, { flowStep: step, flowValidated: true, completed: true, score: 100 });
        showToast(currentUser ? "Flow progress saved." : "Correct. Log in to persist this progress.");
        refreshProgressInBackground(page());
      } catch (error) {
        showToast(error.message);
      }
    }
  });
}

function moduleCard(module) {
  return `
    <article class="card">
      <div class="pill">${escapeHtml(module.track)}</div>
      <h3>${escapeHtml(module.title)}</h3>
      <p>${escapeHtml(module.explanation)}</p>
      <div class="meta">${module.concepts.map((concept) => `<span class="pill">${escapeHtml(concept)}</span>`).join("")}</div>
      <a class="gold-button small" href="#module-${module.id}">Open module</a>
    </article>
  `;
}

function renderModules() {
  app.innerHTML = `
    <section class="section">
      ${authBanner()}
      <div class="section-head">
        <div>
          <div class="eyebrow">Module Library</div>
          <h2>Backend physical design curriculum</h2>
          <p>Expanded from the ASIC Flow Workshop module list into full backend signoff coverage.</p>
        </div>
      </div>
      <div class="filterbar">
        <input class="search-input" id="module-search" placeholder="Search modules, STA, CTS, routing, signoff..." />
      </div>
      <div class="meta">${backendTopics.map((topic) => `<span class="pill">${topic}</span>`).join("")}</div>
      <div class="grid" id="module-grid">${modules.map(moduleCard).join("")}</div>
    </section>
  `;
  bindLogout();
  document.querySelector("#module-search").addEventListener("input", (event) => {
    const q = event.target.value.toLowerCase();
    document.querySelector("#module-grid").innerHTML = modules
      .filter((m) => `${m.title} ${m.track} ${m.concepts.join(" ")}`.toLowerCase().includes(q))
      .map(moduleCard)
      .join("");
  });
}

function renderModuleDetail(id) {
  const module = modules.find((item) => item.id === id) || modules[0];
  app.innerHTML = `
    <section class="section">
      ${authBanner()}
      <a class="ghost-button small" href="#modules">Back to modules</a>
      <div class="module-detail">
        <div class="detail-grid">
          <div>
            <div class="pill">${escapeHtml(module.track)}</div>
            <h2>${escapeHtml(module.title)}</h2>
            <p>${escapeHtml(module.explanation)}</p>
            <h3>Functional description</h3>
            <p>${escapeHtml(module.function)}</p>
            <h3>Why it matters</h3>
            <p>${escapeHtml(module.why)}</p>
          </div>
          <div>${circuitCanvasMarkup("module-canvas")}</div>
        </div>
        <h3>Waveform / timing visualization</h3>
        ${waveformSvg(module.title)}
        <h3>Commands and code snippets</h3>
        <pre><code>${escapeHtml(module.code)}</code></pre>
        <div class="grid two">
          <article class="panel"><h3>Quiz</h3><p>${module.quiz.map(escapeHtml).join("<br>")}</p></article>
          <article class="panel"><h3>Assignment</h3><p>${escapeHtml(module.assignment)}</p></article>
          <article class="panel"><h3>Mini project</h3><p>${escapeHtml(module.project)}</p></article>
          <article class="panel"><h3>Interview questions</h3><p>${module.interview.map(escapeHtml).join("<br>")}</p></article>
        </div>
      </div>
    </section>
  `;
  bindLogout();
  drawCircuitCanvas("module-canvas", modules.indexOf(module));
}

function levelCard(level) {
  const complete = isLevelComplete(level.number) || level.complete;
  const locked = level.number > highestUnlockedLevel() && !complete;
  return `
    <article class="level-row">
      <div><strong>Level ${level.number}</strong><br><span class="${locked ? "lock" : "xp"}">${locked ? "Locked" : complete ? "Complete" : "Unlocked"}</span></div>
      <div>
        <h3>${escapeHtml(level.title)}</h3>
        <p>${escapeHtml(level.explanation)}</p>
        <div class="meta"><span class="pill">${level.difficulty}</span><span class="pill">${level.badge}</span><span class="pill">${level.xp} XP</span>${level.assignment.checkpoint ? `<span class="pill">Checkpoint</span>` : ""}</div>
        <p><strong>Assignment:</strong> ${escapeHtml(level.assignment.instructions)}</p>
      </div>
      <a class="${locked ? "ghost-button" : "gold-button"} small" href="${locked ? "#academy" : `#level-${level.number}`}">${locked ? "Locked" : complete ? "Review" : "Start"}</a>
    </article>
  `;
}

function renderAcademy() {
  app.innerHTML = `
    <section class="section">
      ${authBanner()}
      <div class="section-head">
        <div>
          <div class="eyebrow">Explore Academy</div>
          <h2>100 learning levels</h2>
          <p>Each level now includes graded MCQ, fill-in-the-blank assessment, circuit interaction, waveform activity, XP, badge, and persistent completion.</p>
        </div>
      </div>
      <div class="tabs" id="level-tabs">
        ${["All", "Beginner", "Intermediate", "Advanced", "Expert"].map((tab) => `<button class="tab ${tab === "All" ? "active" : ""}" data-tab="${tab}">${tab}</button>`).join("")}
      </div>
      <div id="levels-list"></div>
    </section>
  `;
  bindLogout();
  const draw = (difficulty = "All") => {
    const filtered = difficulty === "All" ? levels : levels.filter((level) => level.difficulty === difficulty);
    document.querySelector("#levels-list").innerHTML = filtered.map(levelCard).join("");
  };
  draw();
  document.querySelector("#level-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
    button.classList.add("active");
    draw(button.dataset.tab);
  });
}

function renderLevel(number) {
  if (!requireAuth(`level-${number}`)) return;
  const level = levels.find((item) => item.number === Number(number)) || levels[0];
  const assignment = level.assignment;
  app.innerHTML = `
    <section class="section">
      ${authBanner()}
      <a class="ghost-button small" href="#academy">Back to academy</a>
      <div class="module-detail">
        <div class="detail-grid">
          <div>
            <div class="pill">${escapeHtml(level.difficulty)} Level ${level.number}</div>
            <h2>${escapeHtml(level.title)}</h2>
            <p>${escapeHtml(level.explanation)}</p>
            <h3>Practical assignment</h3>
            <p>${escapeHtml(level.practicalAssignment)}</p>
            <p><strong>Expected output:</strong> ${escapeHtml(level.expectedOutput)}</p>
            <p><strong>Mini project:</strong> ${escapeHtml(level.miniProject)}</p>
          </div>
          <div>${circuitCanvasMarkup("level-canvas")}</div>
        </div>
        <h3>Waveform activity</h3>
        ${waveformSvg(level.title)}
        <form id="assessment-form" class="panel">
          <h3>${escapeHtml(assignment.title)}</h3>
          <p>${escapeHtml(assignment.assessment)}</p>
          <label>${escapeHtml(assignment.mcq.prompt)}
            <select name="mcq" required>
              <option value="">Select answer</option>
              ${assignment.mcq.options.map((option, index) => `<option value="${index}">${escapeHtml(option)}</option>`).join("")}
            </select>
          </label>
          <label>${escapeHtml(assignment.fillBlank.prompt)}<input name="blank" required autocomplete="off" /></label>
          <button class="gold-button" type="submit">Submit Assessment</button>
          <p id="assessment-result"></p>
        </form>
      </div>
    </section>
  `;
  bindLogout();
  drawCircuitCanvas("level-canvas", level.number);
  document.querySelector("#assessment-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.target);
    const mcqCorrect = Number(data.get("mcq")) === assignment.mcq.answerIndex;
    const blankCorrect = normalize(data.get("blank")) === normalize(assignment.fillBlank.answer);
    const score = (mcqCorrect ? 50 : 0) + (blankCorrect ? 50 : 0);
    const passed = score >= 70;
    document.querySelector("#assessment-result").innerHTML = `
      Score: ${score}%. ${passed ? "Passed and saved." : "Not passed yet."}<br>
      MCQ: ${mcqCorrect ? "Correct" : assignment.mcq.explanation}<br>
      Fill blank: ${blankCorrect ? "Correct" : assignment.fillBlank.explanation}
    `;
    try {
      await saveAssignmentResult(level.number, {
        title: level.title,
        difficulty: level.difficulty,
        mcqCorrect,
        blankCorrect,
        score,
        passed,
        xpEarned: passed ? level.xp : 0
      });
      showToast(passed ? "Assessment saved to progress." : "Attempt saved. Try again after review.");
      refreshProgressInBackground(page());
    } catch (error) {
      showToast(error.message);
    }
  });
}

function renderAssignments() {
  app.innerHTML = `
    <section class="section">
      ${authBanner()}
      <div class="section-head"><div><div class="eyebrow">Assignments</div><h2>Beginner to tapeout labs</h2></div></div>
      ${assignments.map(([difficulty, title, text], index) => `
        <article class="assignment-row">
          <div><span class="pill">${difficulty}</span></div>
          <div><h3>${index + 1}. ${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></div>
          <a class="ghost-button small" href="#level-${Math.min(100, index + 1)}">Open linked level</a>
        </article>
      `).join("")}
    </section>
  `;
  bindLogout();
}

function waveformSvg(label = "timing") {
  return `
    <div class="waveform">
      <svg viewBox="0 0 720 170" role="img" aria-label="${escapeHtml(label)} waveform">
        <polyline points="20,42 60,42 60,20 100,20 100,42 140,42 140,20 180,20 180,42 220,42 220,20 260,20 260,42 700,42" fill="none" stroke="#ffdf82" stroke-width="4"/>
        <polyline points="20,98 130,98 130,74 250,74 250,98 390,98 390,74 610,74 610,98 700,98" fill="none" stroke="#73e6a8" stroke-width="4"/>
        <line x1="250" y1="18" x2="250" y2="132" stroke="#f7c948" stroke-dasharray="6 6"/>
        <line x1="390" y1="18" x2="390" y2="132" stroke="#ff786d" stroke-dasharray="6 6"/>
        <text x="22" y="154" fill="#bdb3a0" font-size="16">setup window, hold window, launch/capture relationship</text>
      </svg>
    </div>
  `;
}

function circuitCanvasMarkup(id) {
  return `<canvas id="${id}" class="edu-canvas" width="720" height="430" aria-label="Interactive circuit canvas"></canvas>`;
}

function drawCircuitCanvas(id, seed = 0) {
  const canvas = document.querySelector(`#${id}`);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#070604";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(247,201,72,.24)";
  for (let x = 0; x < w; x += 36) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 36) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  const blocks = ["IN", "CELL", "CLK", "ROUTE", "OUT"];
  blocks.forEach((block, index) => {
    const x = 50 + index * 130;
    const y = 150 + Math.sin((seed + index) * 0.7) * 42;
    ctx.fillStyle = index % 2 ? "#f7c948" : "#ffdf82";
    ctx.strokeStyle = "#fff0bd";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, 86, 54, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#120b02";
    ctx.font = "700 17px Inter";
    ctx.fillText(block, x + 20, y + 34);
    if (index < blocks.length - 1) {
      ctx.strokeStyle = "#73e6a8";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x + 86, y + 27);
      ctx.bezierCurveTo(x + 120, y - 30, x + 110, 230, x + 130, 177);
      ctx.stroke();
    }
  });
  ctx.fillStyle = "#bdb3a0";
  ctx.font = "15px Inter";
  ctx.fillText("Interactive educational model: signal path, clock relation, routing parasitics, and signoff checks.", 32, 386);
}

function renderProjects() {
  app.innerHTML = `
    <section class="section">
      ${authBanner()}
      <div class="section-head"><div><div class="eyebrow">Projects</div><h2>Portfolio-ready backend projects</h2></div></div>
      <div class="grid">
        ${["RTL to Netlist Lab", "STA Closure Report", "Floorplan and Power Grid", "Placement Congestion Review", "CTS Skew Optimization", "Routing and DRC Cleanup", "IR/EM Signoff Review", "Tapeout Readiness Capstone"].map((project, index) => `
          <article class="card"><div class="pill">${index < 2 ? "Beginner" : index < 5 ? "Advanced" : "Expert"}</div><h3>${project}</h3><p>Create evidence, diagrams, reports, and interview notes for ${project.toLowerCase()}.</p></article>
        `).join("")}
      </div>
    </section>
  `;
  bindLogout();
}

function renderWaveform() {
  app.innerHTML = `
    <section class="section">
      ${authBanner()}
      <div class="section-head"><div><div class="eyebrow">Waveform Lab</div><h2>Timing visualization playground</h2><p>Adjust the timing numbers and inspect setup/hold slack behavior.</p></div></div>
      <div class="grid two">
        <div class="panel">
          <label>Clock period <input id="period" type="range" min="1" max="10" value="5" /></label>
          <label>Data delay <input id="delay" type="range" min="1" max="10" value="4" /></label>
          <label>Uncertainty <input id="uncertainty" type="range" min="0" max="3" value="1" /></label>
          <h3 id="slack-output"></h3>
          <p id="timing-advice"></p>
        </div>
        <div>${waveformSvg("STA lab")}</div>
      </div>
    </section>
  `;
  bindLogout();
  const update = () => {
    const period = Number(document.querySelector("#period").value);
    const delay = Number(document.querySelector("#delay").value);
    const uncertainty = Number(document.querySelector("#uncertainty").value);
    const slack = period - delay - uncertainty;
    document.querySelector("#slack-output").textContent = `Setup slack: ${slack.toFixed(1)} ns`;
    document.querySelector("#timing-advice").textContent = slack >= 0 ? "Timing is met. Try reducing period to simulate a faster clock." : "Timing fails. Fix with faster cells, buffering, placement improvement, or path restructuring.";
  };
  document.querySelectorAll("input[type='range']").forEach((input) => input.addEventListener("input", update));
  update();
}

function renderViewer() {
  app.innerHTML = `
    <section class="section viewer-section">
      ${authBanner()}
      <div class="viewer-toolbar" aria-label="3D tool navigation">
        <a href="#home">Home</a>
        <a href="#scenario-lab">Scenario Lab</a>
        <a href="#waveform">Waveform Lab</a>
        <a href="#modules">Modules</a>
        <a href="#dashboard">Progress</a>
      </div>
      <div class="section-head compact-head"><div><div class="eyebrow">3D Semiconductor Interface</div><h2>Real-time ASIC stack scenarios</h2><p>Use the controls to inspect devices, routing, clock, power, heat, and signoff risk.</p></div></div>
      <div class="viewer-workbench">
        <canvas id="semiconductor-3d" class="edu-canvas tall viewer-canvas" width="920" height="620"></canvas>
        <div class="panel viewer-controls">
          <label>Scenario<select id="scenario-focus"><option>Mobile SoC high activity</option><option>CPU clock closure</option><option>SRAM macro floorplan</option><option>Low-power island wakeup</option><option>Tapeout signoff review</option></select></label>
          <label>Layer focus<select id="layer-focus"><option>Devices</option><option>Local Interconnect</option><option>Clock Network</option><option>Power Grid</option><option>Top Metal</option><option>Thermal Map</option></select></label>
          <label>Activity<input id="activity" type="range" min="1" max="10" value="6" /></label>
          <label>Routing density<input id="density" type="range" min="1" max="10" value="5" /></label>
          <label>Clock frequency<input id="frequency" type="range" min="200" max="2200" step="100" value="900" /></label>
          <h3 id="viewer-result"></h3>
          <p id="viewer-explain"></p>
          <div class="scenario-metrics" id="viewer-metrics"></div>
        </div>
      </div>
    </section>
  `;
  bindLogout();
  const redraw = () => drawSemiconductor3D();
  document.querySelectorAll("#scenario-focus,#layer-focus,#activity,#density,#frequency").forEach((el) => el.addEventListener("input", redraw));
  redraw();
}

function drawSemiconductor3D() {
  const canvas = document.querySelector("#semiconductor-3d");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const focus = document.querySelector("#layer-focus").value;
  const scenario = document.querySelector("#scenario-focus").value;
  const activity = Number(document.querySelector("#activity").value);
  const density = Number(document.querySelector("#density").value);
  const frequency = Number(document.querySelector("#frequency").value);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#060504";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const layers = ["Silicon devices", "M1/M2 local", "M3-M6 signal", "Clock spine", "Power grid", "Top metal"];
  layers.forEach((layer, index) => {
    const y = 390 - index * 54;
    const x = 100 + index * 30;
    const width = 430;
    ctx.fillStyle = focus.includes(layer.split(" ")[0]) ? "rgba(255,223,130,.82)" : `rgba(247,201,72,${0.16 + index * 0.06})`;
    ctx.strokeStyle = "rgba(255,240,189,.72)";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y - 42);
    ctx.lineTo(x + width + 96, y + 12);
    ctx.lineTo(x + 96, y + 54);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff8e8";
    ctx.font = "700 15px Inter";
    ctx.fillText(layer, x + 24, y + 18);
  });
  for (let i = 0; i < density * 6; i++) {
    ctx.strokeStyle = i % 3 === 0 ? "#73e6a8" : "#f7c948";
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    const x = 145 + (i * 41) % 420;
    ctx.moveTo(x, 130 + (i % 7) * 18);
    ctx.lineTo(x + 160, 220 + ((i + activity) % 9) * 18);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const risk = Math.min(100, Math.round(activity * 4 + density * 4 + frequency / 55));
  const irDrop = Math.min(180, Math.round(activity * 8 + frequency / 35));
  const congestion = Math.min(100, Math.round(density * 8 + activity * 2));
  const setupSlack = Math.round((1200 / frequency - density * 0.05 - activity * 0.03) * 100) / 100;
  document.querySelector("#viewer-result").textContent = `${scenario}: signoff stress ${risk}%`;
  document.querySelector("#viewer-explain").textContent = risk > 70
    ? "This scenario needs closure action: strengthen power grid, reduce congestion, review clock skew, and rerun extraction/signoff."
    : "This scenario is within a moderate exploration range. Increase activity, density, or frequency to observe closure pressure.";
  document.querySelector("#viewer-metrics").innerHTML = `
    <span>IR drop: ${irDrop} mV</span>
    <span>Congestion: ${congestion}%</span>
    <span>Setup slack: ${setupSlack} ns</span>
    <span>Frequency: ${frequency} MHz</span>
  `;
}

function renderScenarioLab() {
  const scenarios = [
    ["Floorplan rescue", "Macros placed too close to IO edge cause narrow channels and route detours.", "Move SRAM inward, add halos, rebalance pin sides.", "Congestion -18%, setup slack +0.08 ns"],
    ["Power grid repair", "Dynamic IR spikes appear near a high-toggle CPU cluster.", "Add local straps, widen rings, insert decaps near switching cells.", "IR drop -42 mV, EM risk -21%"],
    ["CTS closure", "Clock skew is large across a long datapath crossing macro channels.", "Rebalance clock buffers, shield trunk, review useful skew.", "Skew -35 ps, hold risk +9 ps"],
    ["Routing DRC cleanup", "Detailed route reports shorts and spacing violations in M4/M5.", "Relax noncritical nets, add routing blockages, move noisy nets up metal.", "DRC count -76%, crosstalk -14%"],
    ["Tapeout readiness", "Final signoff has waivers, ECO changes, and incomplete noise review.", "Freeze ECO list, rerun extraction, validate DRC/LVS/STA/IR/EM/SI.", "Readiness +31%, open risks reduced"]
  ];
  app.innerHTML = `
    <section class="section">
      <div class="section-head"><div><div class="eyebrow">Real Backend Coverage</div><h2>Scenario-based backend lab</h2><p>Choose realistic physical design problems and inspect expected engineering actions and closure impact.</p></div></div>
      <div class="scenario-lab-grid">
        ${scenarios.map(([title, problem, action, impact], index) => `
          <article class="scenario-card">
            <div class="pill">Scenario ${index + 1}</div>
            <h3>${title}</h3>
            <p><strong>Problem:</strong> ${problem}</p>
            <p><strong>Action:</strong> ${action}</p>
            <div class="scenario-impact">${impact}</div>
            <button class="ghost-button small scenario-run" data-index="${index}" type="button">Run Scenario</button>
          </article>
        `).join("")}
      </div>
      <div class="panel scenario-output" id="scenario-output">
        <h3>Scenario result</h3>
        <p>Select a scenario to simulate backend closure tradeoffs.</p>
      </div>
    </section>
  `;
  document.querySelectorAll(".scenario-run").forEach((button) => {
    button.addEventListener("click", () => {
      const scenario = scenarios[Number(button.dataset.index)];
      document.querySelector("#scenario-output").innerHTML = `
        <h3>${scenario[0]} result</h3>
        <p>${scenario[1]}</p>
        <p><strong>Recommended closure move:</strong> ${scenario[2]}</p>
        <div class="scenario-impact">${scenario[3]}</div>
      `;
      showToast(`${scenario[0]} simulated.`);
    });
  });
}

async function renderDashboard() {
  if (!requireAuth("dashboard")) return;
  const completed = levels.filter((level) => isLevelComplete(level.number) || level.complete).length;
  const results = progressState.results || [];
  const xp = levels.filter((level) => isLevelComplete(level.number) || level.complete).reduce((sum, level) => sum + level.xp, 0);
  app.innerHTML = `
    <section class="section">
      ${authBanner()}
      <div class="section-head"><div><div class="eyebrow">Progress Dashboard</div><h2>XP, badges, leaderboard</h2></div></div>
      <div class="grid">
        <article class="card"><h3>${completed}/100 levels</h3><p>Persisted authenticated progress.</p><div class="progress-bar"><span style="width:${completed}%"></span></div></article>
        <article class="card"><h3>${xp} XP</h3><p>Earned from completed levels, quizzes, labs, and projects.</p></article>
        <article class="card"><h3>${results.length} assessments</h3><p>Latest scores are stored under the signed-in user.</p></article>
      </div>
      <div class="panel" style="margin-top:16px">
        <h3>Recent results</h3>
        ${results.length ? results.slice(-8).reverse().map((result) => `<p><strong>Level ${result.levelNumber}</strong> - ${result.score}% - ${result.passed ? "Passed" : "Retry"}</p>`).join("") : "<p>No assessment results yet.</p>"}
      </div>
    </section>
  `;
  bindLogout();
}

function renderCareer() {
  app.innerHTML = `
    <section class="section">
      ${authBanner()}
      <div class="section-head"><div><div class="eyebrow">Career Roadmap</div><h2>Backend physical design path</h2></div></div>
      <div class="pipeline">
        ${["Digital basics", "RTL literacy", "Synthesis", "STA", "Floorplan", "Power", "Place/CTS/Route", "Signoff", "ECO", "Tapeout portfolio", "Interview prep", "PD engineer"].map((step, index) => `<div class="pipe-step" style="--i:${index}">${step}</div>`).join("")}
      </div>
    </section>
  `;
  bindLogout();
}

function renderLogin() {
  app.innerHTML = `
    <section class="auth-login-page">
      <div class="auth-login-shell">
        <div class="auth-login-copy">
          <div class="eyebrow">ASIC Flow Workshop</div>
          <h2>Login / Mobile Access</h2>
          <p>Sign in with email, Google, or submit your mobile number through reCAPTCHA for workshop access support.</p>
          <div class="login-steps">
            <span>Secure Firebase Auth</span>
            <span>Mobile reCAPTCHA</span>
            <span>Protected assignments</span>
            <span>Persistent progress</span>
          </div>
        </div>

        <div class="login-access-stack">
          <form class="auth-login-card" id="credential-login-form">
            <div class="gmail-card-top">
              <div class="gmail-mark">B</div>
              <div>
                <h3>Sign in</h3>
                <p>Email and password access for ASIC Flow Workshop.</p>
              </div>
            </div>
            <label>Email<input name="email" type="email" autocomplete="email" placeholder="you@example.com" required /></label>
            <label>Password<input name="password" type="password" autocomplete="current-password" minlength="6" placeholder="Minimum 6 characters" required /></label>
            <div id="login-error" class="login-error" role="alert"></div>
            <div class="auth-actions">
              <button class="gold-button" name="mode" value="login" type="submit">Login</button>
              <button class="ghost-button" name="mode" value="signup" type="submit">Create Account</button>
            </div>
            <button class="ghost-button" id="google-login" type="button">Continue with Google</button>
          </form>

          <form class="auth-login-card mobile-capture-card" id="mobile-capture-form">
            <div class="gmail-card-top">
              <div class="gmail-mark">M</div>
              <div>
                <h3>Mobile number access</h3>
                <p>Complete reCAPTCHA and save your number for workshop login support.</p>
              </div>
            </div>
            <label>Full name<input name="fullName" autocomplete="name" maxlength="80" placeholder="Your full name" required /></label>
            <label>Mobile number<input class="phone-primary-input compact-phone-input" name="phone" inputmode="tel" autocomplete="tel" maxlength="18" placeholder="+91XXXXXXXXXX" required /></label>
            <label class="check-row mobile-consent-row"><input name="consent" type="checkbox" required />I agree to be contacted about ASIC Flow Workshop.</label>
            <div id="lead-recaptcha-container" class="recaptcha-wrap"></div>
            <div id="mobile-capture-status" class="login-error mobile-capture-status" role="status"></div>
            <button class="gold-button" type="submit">Verify & Save Mobile</button>
          </form>
        </div>
      </div>
    </section>
  `;
  document.querySelector("#credential-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const mode = event.submitter?.value || "login";
    const errorBox = document.querySelector("#login-error");
    errorBox.textContent = "";
    try {
      if (mode === "signup") await signUpWithEmail(form.get("email"), form.get("password"));
      else await signInWithEmail(form.get("email"), form.get("password"));
      await refreshProgress();
      renderAccountCorner();
      showToast(mode === "signup" ? "Account created." : "Logged in successfully.");
      const next = sessionStorage.getItem("postLoginRoute") || "assignments";
      sessionStorage.removeItem("postLoginRoute");
      location.hash = next;
    } catch (error) {
      errorBox.textContent = friendlyAuthError(error);
      showToast(friendlyAuthError(error));
    }
  });
  document.querySelector("#google-login")?.addEventListener("click", async () => {
    try {
      await signInWithGoogle();
      await refreshProgress();
      renderAccountCorner();
      showToast("Google login successful.");
      const next = sessionStorage.getItem("postLoginRoute") || "assignments";
      sessionStorage.removeItem("postLoginRoute");
      location.hash = next;
    } catch (error) { showToast(friendlyAuthError(error)); }
  });
  document.querySelector("#mobile-capture-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = document.querySelector("#mobile-capture-status");
    const button = event.submitter;
    const form = new FormData(event.target);
    const fullName = String(form.get("fullName") || "").trim();
    const phone = String(form.get("phone") || "").replace(/\s+/g, "");
    const phoneOk = /^\+[1-9]\d{8,14}$/.test(phone);
    status.textContent = "";
    if (!phoneOk) {
      status.textContent = "Enter mobile number with country code, for example +91XXXXXXXXXX.";
      return;
    }
    try {
      button.disabled = true;
      status.textContent = "Complete reCAPTCHA...";
      await verifyLeadRecaptcha("lead-recaptcha-container");
      status.textContent = "Saving mobile number...";
      await savePhoneLead({
        fullName: escapeHtml(fullName),
        phone,
        email: currentUser?.email || "",
        consent: form.get("consent") === "on",
        userId: currentUser?.uid || null
      });
      event.target.reset();
      document.querySelector("#lead-recaptcha-container").innerHTML = "";
      status.textContent = "Mobile number saved. Workshop team can contact you for access support.";
      showToast("Mobile number saved with reCAPTCHA.");
    } catch (error) {
      status.textContent = friendlyAuthError(error);
      showToast(friendlyAuthError(error));
    } finally {
      button.disabled = false;
    }
  });
}

function gmailItemMarkup(email) {
  return `
    <label class="gmail-item">
      <input type="checkbox" value="${escapeHtml(email.id)}" />
      <span>
        <strong>${escapeHtml(email.subject)}</strong>
        <small>${escapeHtml(email.from)}</small>
        <em>${escapeHtml(email.snippet)}</em>
      </span>
    </label>
  `;
}

function bindGmailImport() {
  const connectButton = document.querySelector("#connect-gmail-button");
  const importButton = document.querySelector("#import-selected-gmail");
  const list = document.querySelector("#gmail-list");
  const status = document.querySelector("#gmail-status");
  let gmailMessages = [];

  connectButton?.addEventListener("click", async () => {
    try {
      connectButton.disabled = true;
      status.textContent = "Opening Google consent and loading Gmail messages...";
      const { accessToken } = await connectGmailReadonly();
      gmailMessages = await fetchRecentGmailMessages(accessToken);
      list.innerHTML = gmailMessages.length
        ? gmailMessages.map(gmailItemMarkup).join("")
        : `<div class="gmail-empty">No recent Gmail messages were found.</div>`;
      status.textContent = gmailMessages.length ? `Loaded ${gmailMessages.length} recent Gmail messages.` : "Connected, but no messages were returned.";
      importButton.disabled = !gmailMessages.length;
      await refreshProgress();
      renderAccountCorner();
    } catch (error) {
      status.textContent = friendlyAuthError(error);
      showToast(friendlyAuthError(error));
    } finally {
      connectButton.disabled = false;
    }
  });

  importButton?.addEventListener("click", async () => {
    const selectedIds = [...list.querySelectorAll("input[type='checkbox']:checked")].map((input) => input.value);
    const selected = gmailMessages.filter((message) => selectedIds.includes(message.id));
    if (!selected.length) {
      showToast("Select at least one Gmail message to import.");
      return;
    }
    try {
      importButton.disabled = true;
      await saveImportedGmailEmails(selected);
      status.textContent = `${selected.length} selected email${selected.length === 1 ? "" : "s"} imported into the website.`;
      showToast("Selected Gmail emails imported.");
      await refreshProgress();
    } catch (error) {
      status.textContent = friendlyAuthError(error);
      showToast(friendlyAuthError(error));
    } finally {
      importButton.disabled = false;
    }
  });
}

function renderInterest() {
  app.innerHTML = `
    <section class="section">
      ${authBanner()}
      <div class="section-head"><div><div class="eyebrow">Contact</div><h2>I am Interested</h2><p>Admin/contact email: ${ADMIN_EMAIL}</p></div></div>
      <form class="panel form-grid" id="interest-form">
        <label>Full Name<input name="fullName" maxlength="80" required /></label>
        <label>Email<input name="email" type="email" required /></label>
        <label>Phone Number<input name="phone" maxlength="18" required /></label>
        <label>Current Level<select name="level" required><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
        <label class="full">Interested Topic<input name="topic" maxlength="120" required /></label>
        <label class="full">Message<textarea name="message" maxlength="800" required></textarea></label>
        <button class="gold-button" type="submit">Submit Interest</button>
      </form>
    </section>
  `;
  bindLogout();
  document.querySelector("#interest-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target).entries());
    const sanitized = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, escapeHtml(value).trim()]));
    try {
      await saveInterestedUser(sanitized);
      event.target.reset();
      showToast("Interest submitted and stored.");
    } catch (error) { showToast(error.message); }
  });
}

async function renderAdmin() {
  if (!requireAuth("admin")) return;
  if ((currentUser.email || "") !== ADMIN_EMAIL && !currentUser.localOnly) {
    app.innerHTML = `<section class="section">${authBanner()}<div class="panel"><h2>Admin access only</h2><p>This route is restricted to ${ADMIN_EMAIL}.</p></div></section>`;
    bindLogout();
    return;
  }
  app.innerHTML = `<section class="section">${authBanner()}<div class="eyebrow">Admin</div><h2>Interested users</h2><p>Protected by Firebase Auth and Firestore security rules for ${ADMIN_EMAIL}.</p><div id="admin-list" class="grid"></div></section>`;
  bindLogout();
  try {
    const users = await getInterestedUsers();
    document.querySelector("#admin-list").innerHTML = users.length
      ? users.map((user) => `<article class="card"><h3>${escapeHtml(user.fullName || "Interested User")}</h3><p>${escapeHtml(user.email || "")}<br>${escapeHtml(user.phone || "")}<br>${escapeHtml(user.level || "")}<br>${escapeHtml(user.topic || "")}</p><p>${escapeHtml(user.message || "")}</p></article>`).join("")
      : `<article class="card"><h3>No submissions yet</h3><p>Submitted forms will appear here.</p></article>`;
  } catch (error) { showToast(error.message); }
}

function drawParticles() {
  const canvas = document.querySelector("#particle-canvas");
  const ctx = canvas.getContext("2d");
  const resize = () => {
    const pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
    const cssWidth = Math.max(0, Math.min(window.innerWidth, document.documentElement.clientWidth));
    const cssHeight = window.innerHeight;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = cssWidth * pixelRatio;
    canvas.height = cssHeight * pixelRatio;
  };
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pointCount = window.innerWidth < 720 || prefersReduced ? 10 : 20;
  const points = Array.from({ length: pointCount }, () => ({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.0003, vy: (Math.random() - 0.5) * 0.0003 }));
  let lastParticleFrame = 0;
  const tick = (time = 0) => {
    if (time - lastParticleFrame < 80) {
      if (!prefersReduced) requestAnimationFrame(tick);
      return;
    }
    lastParticleFrame = time;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(247,201,72,.18)";
    ctx.fillStyle = "rgba(255,223,130,.75)";
    points.forEach((p, i) => {
      p.x = (p.x + p.vx + 1) % 1;
      p.y = (p.y + p.vy + 1) % 1;
      const x = p.x * canvas.width;
      const y = p.y * canvas.height;
      ctx.beginPath(); ctx.arc(x, y, 2.2 * devicePixelRatio, 0, Math.PI * 2); ctx.fill();
      points.slice(i + 1).forEach((q) => {
        const x2 = q.x * canvas.width;
        const y2 = q.y * canvas.height;
        const d = Math.hypot(x - x2, y - y2);
        if (d < 110 * devicePixelRatio) {
          ctx.globalAlpha = 1 - d / (110 * devicePixelRatio);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      });
    });
    if (!prefersReduced) requestAnimationFrame(tick);
  };
  resize();
  window.addEventListener("resize", resize);
  tick();
}

async function router() {
  setActiveNav();
  const current = page();
  syncAuthNavigation();
  if (currentUser && current.startsWith("login")) {
    location.hash = "home";
    return;
  }
  const publicRoutes = new Set(["home", "login", "interest"]);
  const isPublic = publicRoutes.has(current) || current.startsWith("login");
  if (!currentUser && !authResolved && !isPublic && current !== "admin") {
    progressState = { progress: [], results: [] };
  } else if (!currentUser && !isPublic) {
    progressState = { progress: [], results: [] };
    sessionStorage.setItem("postLoginRoute", current || "assignments");
    renderLogin();
    app.focus({ preventScroll: true });
    return;
  }
  if (current.startsWith("module-")) renderModuleDetail(current.replace("module-", ""));
  else if (current.startsWith("level-")) renderLevel(current.replace("level-", ""));
  else if (current.startsWith("flow-")) renderFlowStep(Number(current.replace("flow-", "")));
  else if (current === "home") renderHome();
  else if (current === "academy") renderAcademy();
  else if (current === "modules") renderModules();
  else if (current === "assignments") renderAssignments();
  else if (current === "projects") renderProjects();
  else if (current === "waveform") renderWaveform();
  else if (current === "viewer") renderViewer();
  else if (current === "scenario-lab") renderScenarioLab();
  else if (current === "dashboard") await renderDashboard();
  else if (current === "career") renderCareer();
  else if (current.startsWith("login")) renderLogin();
  else if (current === "interest") renderInterest();
  else if (current === "admin") await renderAdmin();
  else renderHome();
  if (currentUser && ["academy", "dashboard"].includes(current)) refreshProgressInBackground(current);
  app.focus({ preventScroll: true });
}

window.addEventListener("hashchange", router);
onAuthChange(async (user) => {
  authResolved = true;
  currentUser = user;
  renderAccountCorner();
  await router();
});
drawParticles();
router();
