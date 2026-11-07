// Everything saved in localStorage. Shared by app.html, practice.html and teacher.html (and index.html, for the display settings).
// In local mode nothing is sent anywhere: all data stays in this browser. In backend mode (config.js), backend.js
// sends every write to the server too, and these keys become a cache of the signed-in student's data.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Store = factory();
})(typeof self !== "undefined" ? self : this, function () {

  const STUDENTS_KEY = "pyPractice.students.v1";        // { id: { name, created } }
  const CURRENT_KEY = "pyPractice.currentStudent";      // id of the student using this browser now
  const PROGRESS_PREFIX = "pyPractice.progress.v3.";    // + student id → { units: { unitId: unit state } }
  const LEVEL_LOG_KEY = "pyPractice.levelLog.v1";       // [ level change, … ] for every student
  const SETTINGS_KEY = "pySelectionPractice.settings.v1"; // display settings (kept from the first version)
  const ATTEMPTS_PREFIX = "pyPractice.attempts.v1.";    // + student id → [ attempt, … ] (every Check press, skip)
  const BUTTON_LOG_KEY = "pyPractice.buttonLog.v1";     // [ "too easy" / "way too hard" use, … ] for every student
  const PLACEMENT_LOG_KEY = "pyPractice.placementLog.v1"; // [ placement result or teacher reset, … ] for every student
  const ASSIGNMENTS_PREFIX = "pyPractice.assignments.v1."; // + student id → [ open assignment of their class, … ] (backend mode)
  const ASSIGNMENT_WORK_PREFIX = "pyPractice.assignmentWork.v1."; // + student id → { assignment id: { index, current, tried, drafts } }
  const MAX_LOG_ENTRIES = 5000;
  const MAX_ATTEMPTS_PER_STUDENT = 3000;
  const MAX_STORED_TEXT = 2000;                         // code and output kept with an attempt are cut to this many characters
  const STORAGE_WARN_BYTES = 4 * 1024 * 1024;           // browsers allow about 5 MB per site

  function readJson(key) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  // Returns false if the browser refused to save (storage full or blocked).
  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  const newRecordId = (prefix) => prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  const clip = (s) => { s = s == null ? "" : String(s); return s.length > MAX_STORED_TEXT ? s.slice(0, MAX_STORED_TEXT) + "\n…(cut short)" : s; };
  function appendLog(key, entry, max) {
    const log = readJson(key) || [];
    log.push(entry);
    return writeJson(key, log.slice(-max));
  }

  // ---------- Students ----------
  const students = () => readJson(STUDENTS_KEY) || {};

  function newId() {
    return "s-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  // Adds a student and makes them the current one. Returns the new id.
  function addStudent(name) {
    const all = students();
    const id = newId();
    all[id] = { name: name.trim(), created: new Date().toISOString() };
    writeJson(STUDENTS_KEY, all);
    setCurrent(id);
    return id;
  }

  function setCurrent(id) {
    try { localStorage.setItem(CURRENT_KEY, id); } catch (e) { /* ignore */ }
  }

  // The current student, or null if nobody has entered a name yet.
  function currentStudent() {
    let id = null;
    try { id = localStorage.getItem(CURRENT_KEY); } catch (e) { /* ignore */ }
    const s = id && students()[id];
    return s ? { id, name: s.name } : null;
  }

  // ---------- Progress ----------
  const loadProgress = (id) => Object.assign({ units: {} }, readJson(PROGRESS_PREFIX + id));
  const saveProgress = (id, progress) => writeJson(PROGRESS_PREFIX + id, progress);

  // ---------- Level-change log ----------
  // entry = { studentId, unit, from, to, reason }, reason is one of the reasons from app.js applyOutcome,
  // "placement", "too-easy", "too-hard", "completed", "test-mode", "test-mode-completed" or "reset"
  function logLevelChange(entry) {
    const log = readJson(LEVEL_LOG_KEY) || [];
    log.push(Object.assign({ at: new Date().toISOString() }, entry));
    writeJson(LEVEL_LOG_KEY, log.slice(-MAX_LOG_ENTRIES));
  }
  const levelLog = () => readJson(LEVEL_LOG_KEY) || [];

  // ---------- Attempts ----------
  // One record per Check press (pass or fail) and per skipped task. Failed attempts also keep the code,
  // the output of the failing test, the failure category and any misconception matches (see app.js recordAttempt).
  function logAttempt(studentId, record) {
    const entry = Object.assign({ id: newRecordId("a"), at: new Date().toISOString(), studentId }, record);
    if ("code" in entry) entry.code = clip(entry.code);
    if ("output" in entry) entry.output = clip(entry.output);
    if (!appendLog(ATTEMPTS_PREFIX + studentId, entry, MAX_ATTEMPTS_PER_STUDENT)) return null;
    return entry;
  }
  const attempts = (studentId) => readJson(ATTEMPTS_PREFIX + studentId) || [];

  // ---------- "This is too easy" / "This is way too hard" ----------
  // entry = { studentId, unit, taskId, button: "too-easy" | "too-hard", from, to }
  function logButton(entry) {
    return appendLog(BUTTON_LOG_KEY, Object.assign({ id: newRecordId("b"), at: new Date().toISOString() }, entry), MAX_LOG_ENTRIES);
  }
  const buttonLog = () => readJson(BUTTON_LOG_KEY) || [];

  // ---------- Placement results and resets ----------
  // entry = { studentId, unit, kind: "result", results: [{ level, taskId, passed, attempts, hints }], startLevel }
  //      or { studentId, unit, kind: "reset", by: "teacher" }
  function logPlacement(entry) {
    return appendLog(PLACEMENT_LOG_KEY, Object.assign({ id: newRecordId("p"), at: new Date().toISOString() }, entry), MAX_LOG_ENTRIES);
  }
  const placementLog = () => readJson(PLACEMENT_LOG_KEY) || [];

  // ---------- Class assignments (backend mode) ----------
  // The open assignments of the student's class, as student-api get_progress sent them: [{ id, title, description,
  // task_ids, updated_at }]. Always empty in local mode. Work on an assignment (which task is open, the answers so far,
  // which tasks were tried) is kept in this browser only: it is practice, so it never touches the saved progress.
  const assignments = (studentId) => readJson(ASSIGNMENTS_PREFIX + studentId) || [];
  const saveAssignments = (studentId, list) => writeJson(ASSIGNMENTS_PREFIX + studentId, list);
  const loadAssignmentWork = (studentId, assignmentId) => (readJson(ASSIGNMENT_WORK_PREFIX + studentId) || {})[assignmentId] || null;
  function saveAssignmentWork(studentId, assignmentId, work) {
    const all = readJson(ASSIGNMENT_WORK_PREFIX + studentId) || {};
    all[assignmentId] = work;
    return writeJson(ASSIGNMENT_WORK_PREFIX + studentId, all);
  }

  // Rough number of bytes this site uses in localStorage (each character takes 2 bytes).
  function storageUsed() {
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        total += (k.length + (localStorage.getItem(k) || "").length) * 2;
      }
    } catch (e) { /* blocked */ }
    return total;
  }

  // ---------- Display settings (on every page) ----------
  // Text size, theme (light / dark / high contrast) and a coloured reading overlay.
  const THEMES = [
    { id: "light", name: "Light" },
    { id: "dark", name: "Dark" },
    { id: "contrast", name: "High contrast" },
  ];
  const TINTS = [
    { id: "off", name: "Off", colour: null },
    { id: "cream", name: "Cream", colour: "#fff0b3" },
    { id: "blue", name: "Pale blue", colour: "#b8dcff" },
    { id: "green", name: "Pale green", colour: "#c2f0c2" },
    { id: "pink", name: "Pale pink", colour: "#ffc9df" },
    { id: "grey", name: "Grey", colour: "#b0b0b0" },
  ];
  const OVERLAY_MIN = 0.05, OVERLAY_MAX = 0.6, OVERLAY_DEFAULT = 0.25;

  function loadSettings() {
    const saved = readJson(SETTINGS_KEY) || {};
    const s = Object.assign({ fontScale: 1, tint: "off", overlayOpacity: OVERLAY_DEFAULT }, saved);
    if (!THEMES.some((t) => t.id === s.theme)) {
      // First visit follows the page's own default if it sets one (the home page sets self.DEFAULT_THEME = "dark"),
      // otherwise the system setting; the first version stored only highContrast. A theme the visitor chooses is
      // saved and always wins.
      const prefersDark = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
      const pageDefault = typeof self !== "undefined" ? self.DEFAULT_THEME : null;
      s.theme = saved.highContrast ? "contrast" : THEMES.some((t) => t.id === pageDefault) ? pageDefault : prefersDark ? "dark" : "light";
    }
    delete s.highContrast;
    if (!TINTS.some((t) => t.id === s.tint)) s.tint = "off";
    s.overlayOpacity = Math.min(OVERLAY_MAX, Math.max(OVERLAY_MIN, +s.overlayOpacity || OVERLAY_DEFAULT));
    return s;
  }

  function applyTheme(s) {
    document.documentElement.dataset.theme = s.theme;
    document.documentElement.style.setProperty("--font-scale", s.fontScale);
  }

  // Applied as soon as this script loads (it is in <head>), so the page never flashes the wrong theme.
  if (typeof document !== "undefined") applyTheme(loadSettings());

  // Builds the controls into <span id="display-tools"> in the top bar.
  function setupDisplaySettings() {
    const settings = loadSettings();
    const host = document.getElementById("display-tools");
    // The theme is saved only once the visitor has chosen one, so a page's own default (the home page opens in
    // Dark) never becomes the theme of every other page.
    let themeChosen = THEMES.some((t) => t.id === (readJson(SETTINGS_KEY) || {}).theme);
    const save = () => {
      const out = Object.assign({}, settings);
      if (!themeChosen) delete out.theme;
      writeJson(SETTINGS_KEY, out);
    };
    host.classList.add("display-tools");
    host.innerHTML =
      '<button type="button" data-font="-1" aria-label="Make text smaller">A−</button>' +
      '<button type="button" data-font="1" aria-label="Make text bigger">A+</button>' +
      '<label>Theme <select id="theme-select">' +
        THEMES.map((t) => '<option value="' + t.id + '">' + t.name + "</option>").join("") +
      "</select></label>" +
      '<details class="overlay-menu" id="overlay-menu"><summary id="overlay-btn">Overlay</summary>' +
        '<div class="overlay-panel"><fieldset><legend>Reading overlay colour</legend>' +
        TINTS.map((t) => '<label class="tint-option"><input type="radio" name="overlay-tint" value="' + t.id + '">' +
          (t.colour ? '<span class="tint-swatch" style="background:' + t.colour + '"></span>' : "") + t.name + "</label>").join("") +
        "</fieldset>" +
        '<label for="overlay-opacity">Strength: <span id="overlay-opacity-value"></span></label>' +
        '<input type="range" id="overlay-opacity" min="' + OVERLAY_MIN * 100 + '" max="' + OVERLAY_MAX * 100 + '" step="5">' +
        '<p class="small">The overlay tints the whole page. It doesn\'t change any colours underneath.</p></div></details>';

    let overlay = document.getElementById("reading-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "reading-overlay";
      overlay.setAttribute("aria-hidden", "true");
      document.body.appendChild(overlay);
    }

    const themeSelect = host.querySelector("#theme-select");
    const slider = host.querySelector("#overlay-opacity");
    function apply() {
      applyTheme(settings);
      themeSelect.value = settings.theme;
      const tint = TINTS.find((t) => t.id === settings.tint);
      overlay.classList.toggle("on", !!tint.colour);
      overlay.style.background = tint.colour || "transparent";
      overlay.style.opacity = settings.overlayOpacity;
      host.querySelectorAll('input[name="overlay-tint"]').forEach((r) => { r.checked = r.value === settings.tint; });
      slider.value = Math.round(settings.overlayOpacity * 100);
      slider.disabled = !tint.colour;
      host.querySelector("#overlay-opacity-value").textContent = Math.round(settings.overlayOpacity * 100) + "%";
      host.querySelector("#overlay-btn").textContent = tint.colour ? "Overlay: " + tint.name : "Overlay";
      save();
    }
    host.querySelectorAll("button[data-font]").forEach((b) => b.addEventListener("click", () => {
      settings.fontScale = Math.min(1.75, Math.max(0.85, +(settings.fontScale + 0.15 * b.dataset.font).toFixed(2)));
      apply();
    }));
    themeSelect.addEventListener("change", () => { settings.theme = themeSelect.value; themeChosen = true; apply(); });
    host.querySelectorAll('input[name="overlay-tint"]').forEach((r) => r.addEventListener("change", () => { settings.tint = r.value; apply(); }));
    slider.addEventListener("input", () => { settings.overlayOpacity = slider.value / 100; apply(); });
    // Close the overlay panel with Escape or a click elsewhere.
    const menu = host.querySelector("#overlay-menu");
    document.addEventListener("click", (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
    menu.addEventListener("keydown", (e) => { if (e.key === "Escape" && menu.open) { menu.open = false; menu.querySelector("summary").focus(); } });
    apply();
  }

  // Runs a page's start-up once saved data is available. In local mode that's straight away; backend.js replaces
  // this so the page waits until the signed-in student's data has been fetched.
  const whenReady = (fn) => fn();

  return {
    STUDENTS_KEY, CURRENT_KEY, PROGRESS_PREFIX, LEVEL_LOG_KEY, SETTINGS_KEY, THEMES, TINTS,
    ATTEMPTS_PREFIX, BUTTON_LOG_KEY, PLACEMENT_LOG_KEY, MAX_STORED_TEXT, STORAGE_WARN_BYTES, whenReady,
    readJson, writeJson, students, addStudent, setCurrent, currentStudent,
    loadProgress, saveProgress, logLevelChange, levelLog, setupDisplaySettings,
    logAttempt, attempts, logButton, buttonLog, logPlacement, placementLog, storageUsed,
    ASSIGNMENTS_PREFIX, ASSIGNMENT_WORK_PREFIX, assignments, saveAssignments, loadAssignmentWork, saveAssignmentWork,
  };
});
