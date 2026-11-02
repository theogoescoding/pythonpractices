"use strict";

// Landing page: student name, unit menu and (with ?test=1) the starting-level control.
// In backend mode (config.js), the name screen is replaced by joining a class or signing in with a code and PIN.
Store.whenReady(function () {
  const { UNITS, levelName } = self.Curriculum;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const testMode = new URLSearchParams(location.search).get("test") === "1";
  const backend = self.Backend && self.Backend.enabled ? self.Backend : null;

  Store.setupDisplaySettings();

  let tasks = null;

  // ---------- Backend mode: join a class or sign in ----------
  function showLanding(form) {
    $("units-screen").hidden = true;
    $("student-area").hidden = true;
    $("landing").hidden = false;
    $("landing-choices").hidden = !!form;
    for (const id of ["join-form", "resume-form", "new-login"]) $(id).hidden = id !== form;
    if (form === "join-form") $("join-class").focus();
    else if (form === "resume-form") $("resume-code").focus();
    else if (form === "new-login") $("new-login").focus();
  }

  function showError(id, message) {
    $(id).textContent = message;
    $(id).hidden = !message;
  }

  if (backend) {
    $("landing").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-show], button[data-back]");
      if (b) showLanding(b.dataset.show || null);
    });

    $("join-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const classCode = $("join-class").value.trim();
      const nickname = $("join-nickname").value.trim();
      if (!classCode || !nickname) return showError("join-error", "Please type the class code and a nickname.");
      const button = e.submitter || $("join-form").querySelector("button[type=submit]");
      button.disabled = true;
      const r = await backend.join(classCode, nickname);
      button.disabled = false;
      if (r.status !== 200) return showError("join-error", r.body.error || "Something went wrong. Please try again.");
      showError("join-error", "");
      $("join-form").reset();
      // Shown once. The PIN isn't kept anywhere in this browser.
      $("new-code").textContent = r.body.code.replace(/(\d{4})(\d{4})/, "$1 $2");
      $("new-pin").textContent = r.body.pin;
      showLanding("new-login");
    });

    $("new-login-done").addEventListener("click", () => {
      $("new-code").textContent = "";
      $("new-pin").textContent = "";
      location.reload(); // opens the unit menu with the new student's (empty) saved data
    });

    $("resume-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const code = $("resume-code").value.replace(/\s/g, "");
      const pin = $("resume-pin").value.trim();
      if (!/^\d{8}$/.test(code) || !/^\d{4}$/.test(pin)) return showError("resume-error", "Your code is 8 digits and your PIN is 4 digits.");
      const button = e.submitter || $("resume-form").querySelector("button[type=submit]");
      button.disabled = true;
      const r = await backend.resume(code, pin);
      button.disabled = false;
      $("resume-pin").value = "";
      if (r.status !== 200) return showError("resume-error", r.body.error || "Something went wrong. Please try again.");
      showError("resume-error", "");
      location.reload(); // loads this student's saved data
    });

    $("delete-area").hidden = false;
    $("change-name").textContent = "Not you? Sign out";
    $("delete-mine").addEventListener("click", () => { $("delete-confirm").hidden = false; $("delete-no").focus(); });
    $("delete-no").addEventListener("click", () => { $("delete-confirm").hidden = true; $("delete-mine").focus(); });
    $("delete-yes").addEventListener("click", async () => {
      $("delete-yes").disabled = true;
      const r = await backend.deleteMyProgress();
      $("delete-yes").disabled = false;
      $("delete-confirm").hidden = true;
      if (r.status !== 200) { $("delete-status").textContent = r.body.error || "Couldn't delete it. Please try again."; return; }
      showLanding(null);
      $("landing-choices").insertAdjacentHTML("afterbegin", '<p class="notice notice-up" role="status">' + esc(r.body.message) + "</p>");
    });
  }

  // ---------- Name screen ----------
  function showNameScreen() {
    if (backend) return showLanding(null);
    const known = Object.entries(Store.students());
    const current = Store.currentStudent();
    $("units-screen").hidden = true;
    $("student-area").hidden = true;
    $("name-screen").hidden = false;
    $("name-error").hidden = true;
    $("name-input").value = "";
    $("known-students").hidden = known.length === 0;
    $("known-list").innerHTML = known.map(([id, s]) =>
      '<li><button type="button" class="secondary" data-id="' + esc(id) + '">' + esc(s.name) + "</button></li>").join("");
    $("name-cancel").hidden = !current;
    $("name-input").focus();
  }

  $("known-list").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-id]");
    if (!b) return;
    Store.setCurrent(b.dataset.id);
    showUnits();
  });

  $("name-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("name-input").value.trim();
    if (!name) {
      $("name-error").hidden = false;
      $("name-input").setAttribute("aria-invalid", "true");
      $("name-input").focus();
      return;
    }
    $("name-input").removeAttribute("aria-invalid");
    Store.addStudent(name);
    showUnits();
  });

  $("name-cancel").addEventListener("click", showUnits);
  $("change-name").addEventListener("click", async (e) => {
    e.preventDefault();
    if (backend) await backend.signOut(); // sends anything waiting, then clears this student from the browser
    showNameScreen();
  });

  // ---------- Unit menu ----------
  function unitLevel(progress, unitId) {
    const s = progress.units[unitId];
    return s ? s.level : null;
  }

  function renderUnits() {
    const student = Store.currentStudent();
    if (!tasks || !student) return; // still loading, or waiting for a name
    const progress = Store.loadProgress(student.id);
    $("unit-list").innerHTML = UNITS.map((u) => {
      const count = tasks.filter((t) => t.unit === u.id).length;
      const title = "<h3>" + esc(u.title) + "</h3><p>" + esc(u.description) + "</p>";
      if (!count) {
        return '<li><div class="unit-card unavailable" aria-disabled="true">' + title +
          '<p class="unit-meta"><span class="soon">Coming soon</span></p></div></li>';
      }
      const s = progress.units[u.id];
      const level = unitLevel(progress, u.id);
      let levelText;
      if (level == null) levelText = "Not started – a quick check will find your starting level";
      else if (needsPlacement(s)) levelText = "Quick check to finish";
      else levelText = "Your level: " + level + " (" + levelName(level) + ")" + (s.completedTop ? " ✓ completed" : "");
      // A unit glows once a level 10 task has been passed in it.
      const glow = s && (s.passedTop || s.completedTop);
      return '<li><a class="unit-card' + (glow ? " unit-complete" : "") + '" href="practice.html?unit=' + encodeURIComponent(u.id) + '">' + title +
        '<p class="unit-meta"><span>' + count + " tasks</span><span><strong>" + esc(levelText) + "</strong></span></p>" +
        (glow ? '<p class="complete-note">★ Level 10 passed</p>' : "") + "</a></li>";
    }).join("");
  }

  function showUnits() {
    const student = Store.currentStudent();
    if (!student) return showNameScreen();
    $("name-screen").hidden = true;
    $("landing").hidden = true;
    $("units-screen").hidden = false;
    $("student-area").hidden = false;
    $("student-name").textContent = student.name;
    renderUnits();
    renderTestPanel();
  }

  // ---------- Test mode: starting level ----------
  function renderTestPanel() {
    if (!testMode || !tasks) return;
    const student = Store.currentStudent();
    $("test-panel").hidden = false;
    $("test-student").textContent = student.name;
    const available = UNITS.filter((u) => tasks.some((t) => t.unit === u.id));
    const chosen = $("test-unit").value;
    $("test-unit").innerHTML = available.map((u) => '<option value="' + u.id + '">' + esc(u.title) + "</option>").join("");
    if (chosen) $("test-unit").value = chosen;
    syncTestLevel();
  }

  function syncTestLevel() {
    const progress = Store.loadProgress(Store.currentStudent().id);
    const level = unitLevel(progress, $("test-unit").value) || START_LEVEL;
    $("test-level").innerHTML = Array.from({ length: MAX_LEVEL }, (_, i) =>
      '<option value="' + (i + 1) + '"' + (i + 1 === level ? " selected" : "") + ">" + (i + 1) + " – " + esc(levelName(i + 1)) + "</option>").join("");
  }

  $("test-unit").addEventListener("change", syncTestLevel);

  // Resets only this unit's level (and its streaks and ceiling). Attempts and history are kept.
  $("test-set").addEventListener("click", () => {
    const student = Store.currentStudent();
    const unitId = $("test-unit").value;
    const level = +$("test-level").value;
    const progress = Store.loadProgress(student.id);
    const old = progress.units[unitId];
    const fresh = freshUnitState(level);
    fresh.placement = { status: "skipped", used: (old && old.placement && old.placement.used) || [] }; // the level was set here instead
    if (old) {
      Object.assign(fresh, { stats: old.stats, log: old.log, history: old.history, lastAttempt: old.lastAttempt, lastTaskId: old.lastTaskId,
        buttonsUsed: old.buttonsUsed || {}, passedTop: !!old.passedTop });
      if (old.placement && old.placement.status === "done") fresh.placement = old.placement;
      fresh.highest = Math.max(old.highest || old.level, level);
    }
    progress.units[unitId] = fresh;
    Store.saveProgress(student.id, progress);
    Store.logLevelChange({ studentId: student.id, unit: unitId, from: old ? old.level : null, to: level, reason: "test-mode" });
    $("test-status").textContent = student.name + " is now at Level " + level + " in " + self.Curriculum.unitTitle(unitId) + ".";
    renderUnits();
  });

  // Puts the student at Level 10 in the unit and marks it completed, so endless mode can be tried.
  $("test-complete").addEventListener("click", () => {
    const student = Store.currentStudent();
    const unitId = $("test-unit").value;
    const progress = Store.loadProgress(student.id);
    const s = progress.units[unitId] || freshUnitState();
    const from = progress.units[unitId] ? s.level : null;
    Object.assign(s, { level: MAX_LEVEL, highest: MAX_LEVEL, completedTop: true, passedTop: true, ceiling: null, ceilingTasksLeft: 0, passStreak: 0, failStreak: 0 });
    if (from == null || needsPlacement(s)) s.placement ={ status: "skipped", used: (s.placement && s.placement.used) || [] };
    progress.units[unitId] = s;
    Store.saveProgress(student.id, progress);
    Store.logLevelChange({ studentId: student.id, unit: unitId, from, to: MAX_LEVEL, reason: "test-mode-completed" });
    $("test-status").textContent = student.name + " has completed " + self.Curriculum.unitTitle(unitId) + " (Level " + MAX_LEVEL + "). Endless mode is unlocked for it.";
    syncTestLevel();
    renderUnits();
  });

  // ---------- Start up ----------
  if (!Store.currentStudent()) showNameScreen(); // ask for the name before anything else, even while tasks load
  fetch("tasks.json")
    .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
    .then((data) => {
      tasks = data;
      if ($("name-screen").hidden) showUnits();
    })
    .catch(() => {
      tasks = [];
      $("unit-list").innerHTML = '<li class="problem">Couldn\'t load the tasks. Open this site through a local web server (see README.md) rather than double-clicking index.html.</li>';
    });
  if (Store.currentStudent()) showUnits();
});
