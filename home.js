"use strict";

// The student view (app.html): student name, unit menu and (with ?test=1) the starting-level control.
// index.html is the public home page; its student buttons open app.html#join and app.html#signin.
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
  // The home page's buttons open app.html#join (New student) or app.html#signin (Returning student).
  const formFromHash = () => ({ "#join": "join-form", "#signin": "resume-form" })[location.hash] || null;

  function showNameScreen() {
    if (backend) return showLanding(formFromHash());
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

  // ---------- Class assignments (backend mode) ----------
  // The open assignments of the student's class, as a module above the unit cards. Practice only.
  function renderAssignments(student) {
    const list = Store.assignments(student.id);
    const work = (id) => Store.loadAssignmentWork(student.id, id) || { tried: {} };
    $("assignments").hidden = !list.length;
    $("assignment-list").innerHTML = list.map((a) => {
      const tried = work(a.id).tried || {};
      const done = a.task_ids.filter((id) => tried[id] === "passed").length;
      return '<li><a class="unit-card assignment-card" href="practice.html?assignment=' + encodeURIComponent(a.id) + '">' +
        "<h3>" + esc(a.title) + "</h3>" + (a.description ? "<p>" + esc(a.description) + "</p>" : "") +
        '<p class="unit-meta"><span>' + a.task_ids.length + " task" + (a.task_ids.length === 1 ? "" : "s") + "</span><span><strong>" +
        (done ? done + " done" : "Not started") + "</strong></span></p></a></li>";
    }).join("");
  }

  // ---------- Unit groups ----------
  // Groups a student has collapsed, remembered on this device only (collapse.js, shared with the teacher view).
  const COLLAPSED_KEY = "pythonPractice.collapsedGroups";
  let studentAttempts = []; // the student's attempts, for the secured scores on the unit cards

  // The units under their group headings (Curriculum.UNIT_GROUPS), in the same order as UNITS. A unit missing from
  // every group is still shown, in a last group, so no unit can disappear from the menu. A group with no units isn't shown.
  function groupsToShow() {
    const listed = new Set(self.Curriculum.UNIT_GROUPS.flatMap((g) => g.units));
    const groups = self.Curriculum.UNIT_GROUPS.map((g) => Object.assign({}, g, { units: UNITS.filter((u) => g.units.includes(u.id)) }))
      .filter((g) => g.units.length);
    const others = UNITS.filter((u) => !listed.has(u.id));
    if (others.length) groups.push({ id: "other", title: "More units", units: others });
    return groups;
  }

  function renderUnits() {
    const student = Store.currentStudent();
    if (!tasks || !student) return; // still loading, or waiting for a name
    renderAssignments(student);
    const progress = Store.loadProgress(student.id);
    studentAttempts = Store.attempts(student.id);
    // Backend mode: the sections for the class's stage open by default and the rest start closed. When the stage
    // changes (or the first time), the open and closed sections start again from the stage; the student can still
    // open any section. Local mode has no class, so every section starts open as before.
    const stage = Store.classStage(student.id);
    if (stage) Collapse.resetForStage(COLLAPSED_KEY, stage, groupsToShow().map((g) => g.id).filter((id) => !self.Curriculum.stageGroups(stage).includes(id)));
    const collapsed = Collapse.collapsedIds(COLLAPSED_KEY);
    $("unit-list").innerHTML = groupsToShow().map((g) => {
      const open = !collapsed.includes(g.id);
      const list = (units, sub) => '<ul class="unit-list">' + units.map((u) => unitCard(u, progress, sub)).join("") + "</ul>";
      // Subsections (the A-level group's "Programming techniques"): a heading over each one's units, in their order.
      const subs = (g.subsections || []).map((s) => ({ id: s.id, title: s.title, units: g.units.filter((u) => s.units.includes(u.id)) })).filter((s) => s.units.length);
      const loose = g.units.filter((u) => !subs.some((s) => s.units.includes(u)));
      const body = subs.length
        ? (loose.length ? list(loose) : "") + subs.map((s) => '<section class="unit-subsection" aria-labelledby="sub-' + s.id + '-h">' +
          '<h4 class="subsection-heading" id="sub-' + s.id + '-h">' + esc(s.title) + "</h4>" + list(s.units, true) + "</section>").join("")
        : list(g.units);
      const count = '<span class="group-count">' + g.units.length + " unit" + (g.units.length === 1 ? "" : "s") + "</span>";
      return '<section class="unit-group" aria-labelledby="group-' + g.id + '-h">' +
        '<h3 class="group-heading" id="group-' + g.id + '-h">' + Collapse.buttonHtml(g.id, "group-" + g.id, esc(g.title), open, count) + "</h3>" +
        '<div class="group-body" id="group-' + g.id + '"' + (open ? "" : " hidden") + ">" + body + "</div></section>";
    }).join("");
  }

  Collapse.wire($("unit-list"), COLLAPSED_KEY);

  // One unit's card: a link to practise it (every unit has tasks: tests/validate.js checks this). In a subsection
  // the card's heading is one level lower (h5), under the subsection's h4.
  function unitCard(u, progress, sub) {
    const count = tasks.filter((t) => t.unit === u.id).length;
    const h = sub ? "h5" : "h4";
    const title = "<" + h + ">" + esc(u.title) + "</" + h + "><p>" + esc(u.description) + "</p>" + (u.note ? '<p class="unit-note small">' + esc(u.note) + "</p>" : "");
    const s = progress.units[u.id];
    const level = unitLevel(progress, u.id);
    let levelText;
    if (level == null) levelText = u.noPlacement ? "Not started – you'll start at Level 1" : "Not started – a quick check will find your starting level";
    else if (needsPlacement(s)) levelText = "Quick check to finish";
    else levelText = "Your level: " + level + " (" + levelName(level, u.id) + ")" + (s.completedTop ? " ✓ completed" : "");
    // The secured score (secured.js, the same as the teacher sees): a secured unit glows gold at 100%, and shows its
    // colour and label as the score falls. A unit with a level 10 pass that isn't secured yet keeps its note.
    const sec = s ? self.Secured.score(studentAttempts, u.id) : { secured: false };
    const b = sec.secured ? self.Secured.band(sec.score) : null;
    const glow = sec.secured && sec.score >= 100;
    const passedTen = s && (s.passedTop || s.completedTop);
    return '<li><a class="unit-card' + (glow ? " unit-complete" : b ? " unit-scored" : "") + '" href="practice.html?unit=' + encodeURIComponent(u.id) + '">' + title +
      '<p class="unit-meta"><span>' + count + " tasks</span><span><strong>" + esc(levelText) + "</strong></span></p>" +
      (b ? '<p class="secured-note"><span class="rag rag-' + b.cls + '">' + sec.score + "% · " + esc(b.label) + "</span>" +
        (sec.score < 100 ? ' <span class="small">One level 10 pass with no hints brings it back to 100%.</span>' : "") + "</p>"
        : passedTen ? '<p class="complete-note">★ Level 10 passed</p>' : "") + "</a></li>";
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
      '<option value="' + (i + 1) + '"' + (i + 1 === level ? " selected" : "") + ">" + (i + 1) + " – " + esc(levelName(i + 1, $("test-unit").value)) + "</option>").join("");
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
      $("unit-list").innerHTML = '<p class="problem">Couldn\'t load the tasks. Open this site through a local web server (see README.md) rather than double-clicking the file.</p>';
    });
  if (Store.currentStudent()) showUnits();
});
