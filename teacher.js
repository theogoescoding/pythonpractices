"use strict";

// Teacher view: a side menu of pages (switched with the address's #): Classes, Students (the default), one student
// (#student=<id>), Assignments, Reports, Misconceptions (the workshop), Task browser (#tasks, or #tasks=<task id> to
// open a task) and Settings. Reads the same localStorage data as the student pages (see store.js); the sums are in
// teacher-data.js and the secured score in secured.js. In backend mode, teacher-backend.js signs the teacher in and
// loads the chosen class into the same data object. Old addresses (#overview, #log, #workshop) still open the right page.
(function () {
  const { UNITS, unitTitle } = self.Curriculum;
  const TD = self.TeacherData;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const PAGES = ["classes", "students", "student", "assignments", "reports", "misconceptions", "tasks", "settings"];
  const OLD_PAGES = { overview: "students", log: "reports", workshop: "misconceptions" }; // the workshop was on Reports
  const RECENT_ATTEMPTS = 30;
  const REASONS = {
    passes: "Moved up: 2 strong passes in a row",
    fast: "Fast move up: 5 strong passes covering 3+ skills",
    fails: "Moved down: 2 fails in a row",
    hints: "Moved down: used all the hints on one task",
    recovery: "Recovery drop: 2 fails soon after moving up (level capped for 5 tasks)",
    placement: "Starting level from the placement test",
    "too-easy": "Student pressed \"This is too easy\"",
    "too-hard": "Student pressed \"This is way too hard\"",
    "test-mode": "Set by the teacher in test mode",
    "test-mode-completed": "Marked as completed by the teacher in test mode (endless mode unlocked)",
    completed: "Completed Level 10: endless mode unlocked",
    reset: "Student reset their progress in this unit",
  };
  // The flags show the student's own button presses (unitCell tooEasy and tooHard). Each button moves the student one
  // level (app.js BUTTON_JUMP_LEVELS).
  const TOO_EASY_TIP = "This student pressed 'This is too easy' in this unit. It moved them up one level. Check that their level is right.";
  const WAY_TOO_HARD_TIP = "This student pressed 'This is way too hard' in this unit. It moved them down one level. Check that their level is right.";
  // The two flags, each with the time of the newest press under it.
  const buttonFlagsHtml = (c) =>
    (c.tooEasy ? '<span class="flag-block"><span class="flag flag-easy" title="' + esc(TOO_EASY_TIP) + '">Too easy</span>' +
      (c.tooEasyAt ? '<span class="small">pressed ' + esc(when(c.tooEasyAt)) + "</span>" : "") + "</span>" : "") +
    (c.tooHard ? '<span class="flag-block"><span class="flag flag-hard" title="' + esc(WAY_TOO_HARD_TIP) + '">Way too hard</span>' +
      (c.tooHardAt ? '<span class="small">pressed ' + esc(when(c.tooHardAt)) + "</span>" : "") + "</span>" : "");
  const NOT_PLACED = '<span class="rag rag-none">Not placed yet</span>';

  Store.setupDisplaySettings();
  // Each section heading opens and closes its section (collapse.js, the same as the student view's unit groups).
  Collapse.enhance(document.querySelector("main"), "pythonPractice.teacherCollapsedSections");

  let tasksById = {};
  let bankTasks = []; // tasks.json as it is (the Task browser)
  let misconceptions = [];
  let sortKey = "name";
  let sortDir = 1;
  let unmatchedTask = null; // task whose unmatched attempts are open on the Misconceptions page
  let mcUnit = null;        // the unit chosen on the Misconceptions page ("all" for every unit)

  // The page and its argument: "#student=<id>" → ["student", id]; "#tasks=<task id>" → ["tasks", task id].
  const route = () => {
    const [name, arg] = location.hash.slice(1).split("=");
    const p = OLD_PAGES[name] || name;
    return PAGES.includes(p) ? [p, arg ? decodeURIComponent(arg) : null] : ["students", null];
  };
  const page = () => route()[0];
  const when = (iso) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "–");
  const pct = (x) => Math.round(x * 100) + "%";
  const mName = (id) => (misconceptions.find((m) => m.id === id) || { name: id }).name;
  const taskLabel = (id) => {
    const t = tasksById[id];
    if (!t) return id;
    // An old id of a task that was replaced by a different one (former_ids_are_replacements).
    if (t.id !== id && t.former_ids_are_replacements) return id + " (a removed task, replaced by " + t.id + " – " + t.title + ")";
    return id + " – " + t.title;
  };
  // A task's name as a link that opens it in the Task browser, ready to try.
  const taskLink = (id) => (tasksById[id] ? '<a href="#tasks=' + encodeURIComponent(tasksById[id].id) + '">' + esc(taskLabel(id)) + "</a>" : esc(taskLabel(id)));
  const tb = self.TeacherBackend && self.TeacherBackend.enabled ? self.TeacherBackend : null;
  let classData = null; // backend mode: the chosen class, as teacher-backend.js loaded it
  const collect = () => (tb ? classData : TD.collect(Store, UNITS));
  const byName = (students) => Object.entries(students).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const currentClass = () => (tb ? tb.currentClass() : null);
  const stage = () => self.Curriculum.stageOf((currentClass() || {}).stage).id;
  const stageUnitIds = () => self.Curriculum.stageUnits(stage());
  // A secured unit: its score and freshness band. A placed unit that isn't secured yet: its level in the level's colour.
  const bandHtml = (c) => (c.band ? '<span class="rag rag-' + c.band.cls + '">' + c.score + "% · " + esc(c.band.label) + "</span>"
    : c.levelBand ? '<span class="rag rag-' + c.levelBand.cls + '">' + esc(c.levelBand.label) + "</span>" : "");
  // A student's average: of their secured units, or (none secured yet) their average level in its colour.
  const averageHtml = (r) => (r.band ? '<span class="rag rag-' + r.band.cls + '">' + r.average + "% · " + esc(r.band.label) + "</span>"
    : r.levelBand ? '<span class="rag rag-' + r.levelBand.cls + '">Average ' + esc(r.levelBand.label.toLowerCase()) + '</span><br><span class="small">No unit secured yet</span>' : NOT_PLACED);

  // ---------- Page switching ----------
  function render() {
    const [p, arg] = route();
    for (const id of PAGES) $("page-" + id).hidden = id !== p;
    document.querySelectorAll(".side-nav a").forEach((a) => {
      const on = a.dataset.page === p || (p === "student" && a.dataset.page === "students");
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (!tb) {
      const used = Store.storageUsed();
      $("storage-warning").hidden = used < Store.STORAGE_WARN_BYTES;
      $("storage-warning").textContent = "This browser's storage is nearly full (" + (used / 1048576).toFixed(1) +
        " MB used, about 5 MB allowed). Export the full data now. New attempts may stop being saved.";
    }
    $("cl-local").hidden = !!tb;
    $("cl-main").hidden = !tb;
    $("set-local").hidden = !!tb;
    $("pw-form").hidden = !tb;
    document.querySelectorAll("[data-backend]").forEach((b) => { b.hidden = !tb; });
    if (p === "tasks") renderTaskBrowser(arg); // needs no class
    const data = collect();
    if (!data) return; // backend mode: no class loaded yet
    if (p === "students") renderStudents(data);
    else if (p === "student") renderStudent(data, arg);
    else if (p === "reports") renderReports(data);
    else if (p === "misconceptions") renderMisconceptions(data);
    else if (p === "assignments") renderAssignments(data);
  }

  // ---------- Students ----------
  function scoreCellHtml(c) {
    if (!c.started) return '<span class="small">Not started</span>';
    const placement = c.placementStatus === "done" ? "Placement: started at " + c.placementStart : "Placement: " + TD.PLACEMENT_STATUS[c.placementStatus];
    return (c.placed ? bandHtml(c) + (c.secured ? "" : '<br><span class="small">Not secured yet</span>') : NOT_PLACED) +
      (c.secured || !c.placed ? '<br><span class="lvl">Level ' + c.level + "</span>" : "") + // an unsecured unit already shows its level

      (c.complete ? ' <span class="badge-complete" title="Passed a level 10 task">★ Complete</span>' : "") +
      '<br><span class="small">' + esc(placement) + "</span>" +
      (c.tooEasy || c.tooHard ? "<br>" + buttonFlagsHtml(c) : "");
  }

  const scoreRows = (data) => TD.sortScoreTable(TD.filterByName(TD.scoreTable(data, stageUnitIds()).rows, $("name-filter").value), sortKey, sortDir);

  function renderCodeCards() {
    const c = currentClass();
    $("st-code-card").hidden = !c;
    if (c) $("st-code").textContent = c.class_code;
  }

  function renderStudents(data) {
    const unitIds = stageUnitIds();
    const c = currentClass();
    $("st-stage").textContent = (c ? c.name + ", " : "") + self.Curriculum.stageOf(stage()).label + ": showing the units for this stage." +
      (c ? " Change the stage on the Classes page." : " (In this browser every student is shown, with the GCSE units.)");
    renderCodeCards();
    const table = TD.scoreTable(data, unitIds);
    const s = table.summary;
    // One tile per group (TD.SUMMARY_TILES), each student in exactly one: by their secured average, or with nothing
    // secured yet by their average level, or Not placed yet. Each tile's label is a chip in the colour the unit cards
    // use for that band, so the label says what it counts and the colour matches the cells.
    $("st-summary").innerHTML = TD.SUMMARY_TILES.map((t) => '<div class="rag-tile rag-tile-' + t.cls + '"><span class="rag rag-' + t.cls + '">' + esc(t.label) + "</span><strong>" +
      s.tiles[t.key] + '</strong><span class="small">' + esc(t.note) + "</span></div>").join("");
    const started = table.unitAverages.filter((u) => u.average != null);
    $("st-averages").innerHTML = '<p class="small">Class average secured score per unit (students who have secured it):</p>' + (started.length
      ? started.map((u) => '<span class="rag rag-' + u.band.cls + '">' + esc(unitTitle(u.unit)) + ": " + u.average + "% · " + esc(u.band.label) + "</span>").join(" ")
      : '<span class="small">No student has secured a unit yet.</span>');

    const cols = [{ key: "name", label: "Name" }, { key: "average", label: "Average" }].concat(unitIds.map((u) => ({ key: u, label: unitTitle(u) })));
    $("overview-head").innerHTML = cols.map((col) =>
      '<th scope="col"' + (col.key === sortKey ? ' aria-sort="' + (sortDir === 1 ? "ascending" : "descending") + '"' : "") +
      '><button type="button" data-sort="' + col.key + '">' + esc(col.label) + "</button></th>").join("");
    const rows = scoreRows(data);
    $("overview-rows").innerHTML = rows.length ? rows.map((r) =>
      '<tr><th scope="row"><a href="#student=' + encodeURIComponent(r.studentId) + '">' + esc(r.name) + "</a>" +
        '<br><span class="small">Last active ' + esc(when(r.lastActive)) + "</span></th>" +
      '<td class="unit-cell">' + averageHtml(r) + "</td>" +
      unitIds.map((u) => '<td class="unit-cell">' + scoreCellHtml(r.cells[u]) + "</td>").join("") + "</tr>").join("")
      : '<tr><td colspan="' + cols.length + '">No students to show yet.</td></tr>';
  }

  $("overview-head").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-sort]");
    if (!b) return;
    if (sortKey === b.dataset.sort) sortDir = -sortDir;
    else { sortKey = b.dataset.sort; sortDir = 1; }
    render();
    const again = $("overview-head").querySelector('button[data-sort="' + sortKey + '"]');
    if (again) again.focus();
  });
  $("name-filter").addEventListener("input", render);

  // ---------- One student ----------
  let shownStudent = null;
  function renderStudent(data, studentId) {
    const s = data.students[studentId];
    shownStudent = s ? studentId : null;
    $("reset-student").value = shownStudent || "";
    $("sd-back").textContent = "← Back to " + (currentClass() ? currentClass().name : "the class");
    if (!s) {
      $("student-title").textContent = "Student not found";
      $("sd-meta").textContent = "This student isn't in the class (they may have been removed).";
      $("sd-actions").hidden = true;
      $("sd-scores").innerHTML = "";
      $("sd-recent").innerHTML = "";
      return;
    }
    $("sd-actions").hidden = false;
    const unitIds = stageUnitIds();
    const d = TD.studentDetail(data, studentId, unitIds, null, RECENT_ATTEMPTS);
    $("student-title").textContent = s.name;
    $("sd-meta").textContent = "Last active " + when(d.lastActive) + (d.average == null ? "" : " · average secured score " + d.average + "% (" + d.band.label + ")");
    const keepUnit = $("reset-unit").value;
    $("reset-unit").innerHTML = UNITS.map((u) => '<option value="' + u.id + '">' + esc(u.title) + "</option>").join("");
    if (keepUnit) $("reset-unit").value = keepUnit;
    $("sd-scores").innerHTML = unitIds.map((u) => {
      const c = d.cells[u];
      // The bar: the secured score, or for a unit not secured yet its level (out of 10) in the level's colour.
      const width = c.score != null ? c.score : c.levelBand ? c.level * 10 : 0;
      const barCls = c.band ? c.band.cls : c.levelBand ? c.levelBand.cls : "";
      return '<div class="score-bar"><div class="score-bar-head"><strong>' + esc(unitTitle(u)) + "</strong> " +
        (c.started ? (c.placed ? bandHtml(c) : NOT_PLACED) + ' <span class="small">' +
          (c.placed && !c.secured ? "Not secured yet (" + c.levelTenPasses + " of 2 level 10 passes with no hints)" : "Level " + c.level) +
          (c.failsInARow ? " · " + c.failsInARow + " fail" + (c.failsInARow === 1 ? "" : "s") + " in a row" : "") + "</span> " + buttonFlagsHtml(c)
          : '<span class="small">Not started</span>') +
        '</div><div class="bar" aria-hidden="true"><span class="' + (barCls ? "rag-" + barCls : "") + '" style="width:' + width + '%"></span></div></div>';
    }).join("");
    $("sd-recent").innerHTML = d.recent.length ? '<div class="table-wrap"><table><thead><tr><th scope="col">Time</th><th scope="col">Task</th><th scope="col">Result</th>' +
      '<th scope="col">Hints</th><th scope="col">Test that failed</th><th scope="col">Misconception matched</th></tr></thead><tbody>' +
      d.recent.map((a) => "<tr" + (a.result === "fail" ? ' class="row-alert"' : "") + "><td>" + esc(when(a.at)) + "</td><td>" + taskLink(a.taskId) +
        (a.phase && a.phase !== "practice" ? ' <span class="flag">' + esc(a.phase) + "</span>" : "") +
        '</td><td class="res-' + (a.result === "pass" ? "pass" : a.result === "fail" ? "fail" : "none") + '">' + esc(a.result) + (a.category ? ' <span class="small">(' + esc(a.category) + ")</span>" : "") +
        '</td><td class="num">' + a.hints + "</td><td>" + (a.failedTest == null ? "–" : "Test " + esc(a.failedTest)) + "</td><td>" +
        (a.misconceptions.length ? esc(a.misconceptions.map(mName).join("; ")) : a.result === "fail" ? "None matched" : "–") + "</td></tr>").join("") +
      "</tbody></table></div>" : '<p class="small">No attempts yet.</p>';
  }

  $("reset-placement").addEventListener("click", () => { $("reset-confirm").hidden = false; $("reset-yes").focus(); });
  $("reset-no").addEventListener("click", () => { $("reset-confirm").hidden = true; $("reset-placement").focus(); });
  $("reset-yes").addEventListener("click", async () => {
    const studentId = $("reset-student").value;
    const unit = $("reset-unit").value;
    const name = (collect().students[studentId] || { name: "" }).name;
    $("reset-confirm").hidden = true;
    const notStarted = name + " hasn't started " + unitTitle(unit) + " yet, so they will take the placement test when they first open it.";
    const done = "Placement reset for " + name + " in " + unitTitle(unit) + ". They will take it once more the next time they open the unit.";
    if (tb) {
      const r = await tb.resetPlacement(studentId, unit); // teacher-api: resets it and logs it on the server
      $("reset-status").textContent = r.status !== 200 ? r.body.error || "Couldn't reset the placement. Please try again." : r.body.reset ? done : notStarted;
      return;
    }
    const progress = Store.loadProgress(studentId);
    const st = progress.units[unit];
    if (!st) {
      $("reset-status").textContent = notStarted;
      return;
    }
    resetPlacement(st); // app.js
    Store.saveProgress(studentId, progress);
    Store.logPlacement({ studentId, unit, kind: "reset", by: "teacher" });
    $("reset-status").textContent = done;
    render();
  });

  // Backend mode: Reset PIN, Rename and Remove (the same server calls as the Student logins table on the Classes page).
  const showResult = (html) => { $("sd-result").innerHTML = html; };
  $("sd-pin").addEventListener("click", async () => {
    if (!shownStudent) return;
    const r = await tb.resetPin(shownStudent);
    showResult(r.error ? '<p class="problem">' + esc(r.error) + "</p>" : '<p class="notice notice-up">New PIN for <strong>' + esc(r.nickname) + "</strong>: " +
      '<strong class="class-code">' + esc(r.pin) + "</strong>. Give it to them now: it won't be shown again. Any lock is cleared.</p>");
  });
  $("sd-rename").addEventListener("click", () => { $("sd-rename-form").hidden = false; $("sd-new-name").value = (collect().students[shownStudent] || { name: "" }).name; $("sd-new-name").focus(); });
  $("sd-rename-cancel").addEventListener("click", () => { $("sd-rename-form").hidden = true; });
  $("sd-rename-save").addEventListener("click", async () => {
    const r = await tb.renameStudent(shownStudent, $("sd-new-name").value.trim());
    if (r.error) return showResult('<p class="problem">' + esc(r.error) + "</p>");
    $("sd-rename-form").hidden = true;
    showResult('<p class="notice notice-up">Renamed to <strong>' + esc(r.nickname) + "</strong>.</p>");
  });
  $("sd-remove").addEventListener("click", () => { $("sd-remove-name").textContent = (collect().students[shownStudent] || { name: "" }).name; $("sd-remove-confirm").hidden = false; $("sd-remove-no").focus(); });
  $("sd-remove-no").addEventListener("click", () => { $("sd-remove-confirm").hidden = true; });
  $("sd-remove-yes").addEventListener("click", async () => {
    const name = (collect().students[shownStudent] || { name: "" }).name;
    const r = await tb.removeStudent(shownStudent);
    $("sd-remove-confirm").hidden = true;
    if (r.error) return showResult('<p class="problem">' + esc(r.error) + "</p>");
    location.hash = "students";
    $("tb-status").textContent = name + " and all their data have been deleted.";
  });

  // ---------- Reports ----------
  // The exports, the level changes and Compare classes. The workshop is on the Misconceptions page.
  function renderReports(data) {
    renderLevelLog(data);
  }

  // ---------- Misconceptions (the workshop) ----------
  // The unit picker lists the class's stage's units (curriculum.js stageUnits), first unit by default, then "All units".
  function renderMisconceptions(data) {
    const unitIds = stageUnitIds();
    if (mcUnit !== "all" && !unitIds.includes(mcUnit)) mcUnit = unitIds[0];
    const options = unitIds.map((u) => '<option value="' + esc(u) + '">' + esc(unitTitle(u)) + "</option>").join("") + '<option value="all">All units</option>';
    if ($("mc-unit").dataset.options !== options) { $("mc-unit").innerHTML = options; $("mc-unit").dataset.options = options; } // keeps focus on the picker
    $("mc-unit").value = mcUnit;
    const where = mcUnit === "all" ? "any unit" : unitTitle(mcUnit);
    const failedTasks = TD.mostFailedTasks(data, mcUnit === "all" ? null : mcUnit);
    $("mc-failed").innerHTML = !failedTasks.length ? '<p class="small">No failed attempts in ' + esc(where) + " yet.</p>" :
      '<div class="table-wrap"><table><thead><tr><th scope="col">Task</th><th scope="col">Failed attempts</th><th scope="col">Failure rate</th>' +
      '<th scope="col">Most common failure type</th><th scope="col">Top misconception</th></tr></thead><tbody>' +
      failedTasks.map((t) => '<tr><th scope="row">' + taskLink(t.taskId) + '</th><td class="num">' + t.fails + " of " + t.attempts + '</td><td class="num">' + pct(t.failRate) +
        "</td><td>" + esc(t.topCategory || "–") + "</td><td>" + esc(t.topMisconception ? mName(t.topMisconception) : "none matched") + "</td></tr>").join("") +
      "</tbody></table></div>";

    const w = TD.workshop(data, misconceptions, tasksById);
    $("ws-misconceptions").innerHTML = w.misconceptions.length ? w.misconceptions.map((m) =>
      "<tr><th scope=\"row\">" + esc(m.name) + '<br><span class="small">' + esc(m.id) + '</span></th><td class="num">' + m.attempts +
      '</td><td class="num">' + m.studentCount + "</td><td>" + m.taskList.map((t) => taskLink(t.taskId) + " (" + t.matches + ")").join("<br>") +
      '</td><td class="num">' + pct(m.failRate) + "</td><td>" + esc(m.studentNames.join(", ")) + "</td></tr>").join("")
      : '<tr><td colspan="6">No misconceptions matched yet.</td></tr>';
    const seen = new Set(w.misconceptions.map((m) => m.id));
    const unseen = misconceptions.filter((m) => !seen.has(m.id));
    $("ws-unseen").innerHTML = unseen.length ? '<ul class="small">' + unseen.map((m) => "<li>" + esc(m.name) + "</li>").join("") + "</ul>"
      : '<p class="small">Every misconception has been matched at least once.</p>';

    $("ws-tasks").innerHTML = w.tasks.length ? w.tasks.map((t) =>
      "<tr><th scope=\"row\">" + taskLink(t.taskId) + '</th><td class="num">' + t.fails + '</td><td class="num">' + t.unmatched +
      '</td><td class="num">' + pct(t.unmatchedRate) + "</td><td>" + (t.hasVariants ? "Yes" : "No") + "</td><td>" +
      (t.unmatched ? '<button type="button" class="secondary" data-unmatched="' + esc(t.taskId) + '">View ' + t.unmatched + "</button>" : "–") + "</td></tr>").join("")
      : '<tr><td colspan="6">No failed attempts yet.</td></tr>';

    const open = w.tasks.find((t) => t.taskId === unmatchedTask);
    $("ws-unmatched").innerHTML = !open ? "" :
      '<h4 id="unmatched-h" tabindex="-1">Unmatched attempts: ' + esc(taskLabel(open.taskId)) + "</h4>" +
      open.unmatchedAttempts.map((r) =>
        '<div class="table-wrap" style="padding:.5rem .9rem; margin-bottom:.75rem"><p class="small"><strong>' + esc(r.name) + "</strong> · " + esc(when(r.at)) + " · " +
        esc(r.category) + (r.failedTest ? " · test " + r.failedTest + (r.inputs && r.inputs.length ? " (inputs: " + esc(r.inputs.join(", ")) + ")" : "") : "") + "</p>" +
        '<div class="side-by-side"><div><strong>Code</strong><pre>' + esc(r.code || "(none)") + "</pre></div>" +
        "<div><strong>Output</strong><pre>" + esc(r.output || "(nothing)") + "</pre>" +
        (r.expected !== "" ? '<span class="small">Expected:</span><pre>' + esc(r.expected || "(nothing)") + "</pre>" : "") + "</div></div></div>").join("");
  }

  $("mc-unit").addEventListener("change", () => { mcUnit = $("mc-unit").value; render(); });

  $("ws-tasks").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-unmatched]");
    if (!b) return;
    unmatchedTask = b.dataset.unmatched;
    render();
    if ($("unmatched-h")) $("unmatched-h").focus();
  });

  // Compare classes: the teacher's own classes only, each one's average secured score per unit.
  $("compare-load").addEventListener("click", async () => {
    const unitIds = self.Curriculum.stageUnits("a-level"); // every unit: classes of different stages side by side
    let classes;
    if (tb) {
      $("compare").innerHTML = '<p class="small">Loading your classes…</p>';
      const r = await tb.compareClasses();
      if (r.error) { $("compare").innerHTML = '<p class="problem">' + esc(r.error) + "</p>"; return; }
      classes = r.classes.map((c) => ({ name: c.name + " (" + self.Curriculum.stageOf(c.stage).label + ")", averages: TD.scoreTable(c.data, unitIds).unitAverages }));
    } else {
      classes = [{ name: "This browser", averages: TD.scoreTable(collect(), unitIds).unitAverages }];
    }
    const used = unitIds.filter((u) => classes.some((c) => c.averages.find((a) => a.unit === u).average != null));
    // Only students who have secured the unit count in its average (an unsecured unit has no score, never 0%).
    $("compare").innerHTML = !used.length ? '<p class="small">No class has a secured unit yet.</p>' :
      '<div class="table-wrap"><table><thead><tr><th scope="col">Unit</th>' + classes.map((c) => '<th scope="col">' + esc(c.name) + "</th>").join("") + "</tr></thead><tbody>" +
      used.map((u) => '<tr><th scope="row">' + esc(unitTitle(u)) + "</th>" + classes.map((c) => {
        const a = c.averages.find((x) => x.unit === u);
        return "<td>" + (a.average == null ? '<span class="rag rag-none">None secured yet</span>' : '<span class="rag rag-' + a.band.cls + '">' + a.average + "% · " + esc(a.band.label) + '</span> <span class="small">(' + a.students + ")</span>") + "</td>";
      }).join("") + "</tr>").join("") + "</tbody></table></div>" +
      (tb ? "" : '<p class="small">In local mode there is only this browser to show. In backend mode each of your classes has its own column.</p>');
  });

  // ---------- Assignments (backend mode) ----------
  let editing = null; // { id?, status } while the form is open
  const parseTaskIds = (text) => [...new Set(String(text || "").split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))];
  // The ids typed, each found in the bank (also by an old id), or not.
  function checkTaskIds(ids) {
    return ids.map((id) => {
      const t = tasksById[id] || bankTasks.find((x) => x.id.toLowerCase() === id.toLowerCase());
      if (!t) return { id, problem: "isn't a task in the bank" };
      if ((t.tags || []).includes("placement")) return { id, problem: "is a placement task (placement tasks are only used in the placement test)" };
      return { id: t.id, task: t };
    });
  }

  // The list of tasks, each with Change (another practice task of the same unit and level, not in the list) and
  // Remove. The task ids box below stays the list itself, so typing, pasting and the Task browser's "Add to the
  // assignment" work as before. builderNotes: the note next to a task the builder took from a nearer level.
  let builderNotes = {};
  let swapOpen = null; // the index whose Change list is open
  const setTaskIds = (ids) => { $("as-tasks").value = ids.join("\n"); renderAssignmentCheck(); };
  function renderAssignmentCheck() {
    const checked = checkTaskIds(parseTaskIds($("as-tasks").value));
    const ids = checked.map((c) => c.id);
    $("as-task-check").innerHTML = checked.length ? '<ol class="small as-task-list">' + checked.map((c, i) => {
      const remove = ' <button type="button" class="secondary" data-as-remove="' + i + '">Remove</button>';
      if (!c.task) return '<li class="problem">' + esc(c.id) + " " + esc(c.problem) + remove + "</li>";
      const others = TD.swapOptions(bankTasks, ids, i);
      const note = builderNotes[c.id];
      return "<li>" + esc(c.id) + " – " + esc(c.task.title) + " (" + esc(unitTitle(c.task.unit)) + ", level " + c.task.level + ", " + esc(c.task.type) + ")" +
        (note ? ' <span class="flag">' + esc(note) + "</span>" : "") + " " +
        (others.length ? '<button type="button" class="secondary" data-as-change="' + i + '" aria-expanded="' + (swapOpen === i) + '">Change</button>'
          : '<button type="button" class="secondary" disabled>No other level ' + c.task.level + " tasks in this unit</button>") + remove +
        (swapOpen === i && others.length ? '<ul class="as-swap" aria-label="Other level ' + c.task.level + ' tasks">' + others.map((t) =>
          '<li><button type="button" class="secondary" data-as-swap="' + i + '" data-to="' + esc(t.id) + '">Use ' + esc(t.id) + " – " + esc(t.title) + " (" + esc(t.type) + ")</button></li>").join("") + "</ul>" : "") +
        "</li>";
    }).join("") + "</ol>" : '<p class="small">No tasks yet: build the list above, add one below, or type ids.</p>';
    // Adding: the chosen unit's practice tasks not in the list, while it has fewer than 10.
    const full = ids.length >= TD.BUILDER_MAX_TASKS;
    const options = TD.addOptions(bankTasks, $("as-five-unit").value, ids);
    $("as-add-task").innerHTML = options.map((t) => '<option value="' + esc(t.id) + '">Level ' + t.level + ": " + esc(t.id) + " – " + esc(t.title) + "</option>").join("");
    $("as-add-task").disabled = full || !options.length;
    $("as-add").disabled = full || !options.length;
    $("as-add").textContent = full ? "The list has " + TD.BUILDER_MAX_TASKS + " tasks" : options.length ? "Add" : "No more tasks in this unit";
    return checked;
  }

  // The builder controls: the stage's units, how many tasks (1 to 10, 5 at first) and the levels (1 to 10 at first).
  function fillFiveTaskControls() {
    const keepUnit = $("as-five-unit").value;
    $("as-five-unit").innerHTML = self.Curriculum.stageUnits(stage()).map((u) => '<option value="' + u + '">' + esc(unitTitle(u)) + "</option>").join("");
    if (keepUnit && [...$("as-five-unit").options].some((o) => o.value === keepUnit)) $("as-five-unit").value = keepUnit;
    const numbers = (prefix) => Array.from({ length: 10 }, (_, i) => '<option value="' + (i + 1) + '">' + prefix + (i + 1) + "</option>").join("");
    if (!$("as-count").options.length) { $("as-count").innerHTML = numbers(""); $("as-count").value = "5"; }
    if (!$("as-from").options.length) { $("as-from").innerHTML = numbers("Level "); $("as-from").value = "1"; }
    if (!$("as-to").options.length) { $("as-to").innerHTML = numbers("Level "); $("as-to").value = "10"; }
  }
  // Build the list: count practice tasks from the unit, spread across the levels (TD.buildSpread). It replaces the list.
  $("as-five").addEventListener("click", () => {
    const unit = $("as-five-unit").value;
    const count = +$("as-count").value;
    const lo = Math.min(+$("as-from").value, +$("as-to").value), hi = Math.max(+$("as-from").value, +$("as-to").value);
    const had = parseTaskIds($("as-tasks").value).length;
    const built = TD.buildSpread(bankTasks, unit, lo, hi, count);
    if (!built.length) { $("as-five-status").textContent = unitTitle(unit) + " has no practice tasks to add."; return; }
    builderNotes = Object.fromEntries(built.filter((b) => b.note).map((b) => [b.id, b.note]));
    swapOpen = null;
    setTaskIds(built.map((b) => b.id));
    const range = lo === hi ? "level " + lo : "levels " + lo + " to " + hi;
    if (!$("as-title").value.trim()) $("as-title").value = unitTitle(unit) + ": " + range;
    $("as-five-status").textContent = "Built " + built.length + " task" + (built.length === 1 ? "" : "s") + " from " + unitTitle(unit) + ", " + range +
      " (levels " + built.map((b) => b.level).join(", ") + ")." + (built.length < count ? " The unit doesn't have " + count + " different practice tasks." : "") +
      (had ? " This replaced the previous list." : "") + " Change, remove or add single tasks below.";
  });
  $("as-five-unit").addEventListener("change", renderAssignmentCheck); // the Add list follows the unit
  $("as-task-check").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-as-change], button[data-as-swap], button[data-as-remove]");
    if (!b) return;
    const ids = checkTaskIds(parseTaskIds($("as-tasks").value)).map((c) => c.id);
    if (b.dataset.asChange != null) {
      const i = +b.dataset.asChange;
      swapOpen = swapOpen === i ? null : i;
      renderAssignmentCheck();
      const first = $("as-task-check").querySelector('button[data-as-swap="' + i + '"]');
      if (first) first.focus();
      return;
    }
    if (b.dataset.asSwap != null) {
      const i = +b.dataset.asSwap;
      delete builderNotes[ids[i]];
      ids[i] = b.dataset.to;
      swapOpen = null;
      setTaskIds(ids);
      const again = $("as-task-check").querySelector('button[data-as-change="' + i + '"]');
      if (again) again.focus();
      return;
    }
    const i = +b.dataset.asRemove;
    delete builderNotes[ids[i]];
    ids.splice(i, 1);
    swapOpen = null;
    setTaskIds(ids);
    $("as-list-h").focus();
  });
  $("as-add").addEventListener("click", () => {
    const ids = checkTaskIds(parseTaskIds($("as-tasks").value)).map((c) => c.id);
    const id = $("as-add-task").value;
    if (!id || ids.includes(id) || ids.length >= TD.BUILDER_MAX_TASKS) return;
    swapOpen = null;
    setTaskIds(ids.concat(id));
  });

  function openAssignmentForm(a) {
    editing = a ? { id: a.id, status: a.status } : {};
    $("as-form").hidden = false;
    $("as-form-h").textContent = a ? "Change assignment" : "New assignment";
    $("as-save").textContent = a ? "Save changes" : "Save and open it for students";
    $("as-title").value = a ? a.title : "";
    $("as-description").value = a ? a.description : "";
    $("as-tasks").value = a ? a.task_ids.join("\n") : "";
    $("as-form-status").hidden = true;
    $("as-five-status").textContent = "";
    builderNotes = {};
    swapOpen = null;
    fillFiveTaskControls();
    renderAssignmentCheck();
    $("as-form-h").focus();
  }

  function closeAssignmentForm() { editing = null; $("as-form").hidden = true; }

  function renderAssignments(data) {
    $("as-local").hidden = !!tb;
    $("as-main").hidden = !tb;
    if (!tb) return;
    const list = data.assignments || [];
    $("as-list").innerHTML = list.length ? list.map((a) => {
      const s = TD.assignmentStats(data, a);
      const rows = s.tasks.map((t) => "<tr><th scope=\"row\">" + taskLink(t.taskId) + '</th><td class="num">' + t.triedCount + '</td><td class="num">' + t.passedCount +
        '</td><td class="num">' + t.checks + '</td><td class="num">' + t.fails + '</td><td class="num">' + t.showHow + "</td><td>" + esc(t.topCategory || "–") +
        "</td><td>" + esc(t.topMisconception ? mName(t.topMisconception) : "–") + "</td></tr>").join("");
      const hard = s.struggled.slice(0, 3).map((t) => "<li>" + esc(taskLabel(t.taskId)) + ": " + t.stuckCount + " of " + t.triedCount + " who tried haven't passed it yet, " +
        t.fails + " failed check" + (t.fails === 1 ? "" : "s") + "</li>").join("");
      return '<section class="assignment-card task-card" aria-labelledby="as-' + esc(a.id) + '">' +
        '<h3 id="as-' + esc(a.id) + '">' + esc(a.title) + ' <span class="flag' + (a.status === "open" ? "" : " flag-alert") + '">' + (a.status === "open" ? "Open" : "Closed") + "</span></h3>" +
        (a.description ? "<p>" + esc(a.description) + "</p>" : "") +
        '<p class="small">' + a.task_ids.length + " task" + (a.task_ids.length === 1 ? "" : "s") + " · created " + esc(when(a.created_at)) + " · " + s.students + " student" + (s.students === 1 ? "" : "s") + " have tried it</p>" +
        '<ol class="assignment-tasks">' + a.task_ids.map((id) => "<li>" + taskLink(id) + "</li>").join("") + "</ol>" +
        '<p class="teacher-controls"><button type="button" class="secondary" data-as-edit="' + esc(a.id) + '">Change</button>' +
          '<button type="button" class="secondary" data-as-status="' + esc(a.id) + '" data-to="' + (a.status === "open" ? "closed" : "open") + '">' + (a.status === "open" ? "Close it" : "Open it again") + "</button></p>" +
        "<h4>Struggled with most</h4>" + (hard ? "<ol>" + hard + "</ol>" : '<p class="small">No one has struggled with a task yet.</p>') +
        '<div class="table-wrap"><table><thead><tr><th scope="col">Task</th><th scope="col">Students who tried</th><th scope="col">Students who passed</th>' +
          '<th scope="col">Checks</th><th scope="col">Failed checks</th><th scope="col">"Show me how"</th><th scope="col">Most common failure</th><th scope="col">Top misconception</th></tr></thead>' +
          "<tbody>" + rows + "</tbody></table></div></section>";
    }).join("") : '<p class="small">No assignments for this class yet.</p>';
  }

  $("as-new").addEventListener("click", () => openAssignmentForm(null));
  $("as-cancel").addEventListener("click", closeAssignmentForm);
  $("as-tasks").addEventListener("input", renderAssignmentCheck);
  $("as-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fail = (msg) => { $("as-form-status").hidden = false; $("as-form-status").className = "problem"; $("as-form-status").textContent = msg; };
    const title = $("as-title").value.trim();
    const checked = renderAssignmentCheck();
    if (!title) return fail("Please give the assignment a title.");
    if (!checked.length) return fail("Please add at least one task.");
    if (checked.some((c) => !c.task)) return fail("Some task ids need fixing (see the list above).");
    if (checked.length > 50) return fail("An assignment can have up to 50 tasks.");
    const r = await tb.saveAssignment({ id: editing && editing.id, status: (editing && editing.status) || "open", title,
      description: $("as-description").value.trim(), task_ids: checked.map((c) => c.id) });
    if (r.error) return fail(r.error);
    closeAssignmentForm();
  });
  $("as-list").addEventListener("click", async (e) => {
    const edit = e.target.closest("button[data-as-edit]");
    const status = e.target.closest("button[data-as-status]");
    const list = (collect() || {}).assignments || [];
    if (edit) openAssignmentForm(list.find((a) => a.id === edit.dataset.asEdit));
    if (status) {
      const r = await tb.setAssignmentStatus(status.dataset.asStatus, status.dataset.to);
      if (r.error) $("as-list").insertAdjacentHTML("afterbegin", '<p class="problem" role="alert">' + esc(r.error) + "</p>");
    }
  });

  // ---------- Task browser ----------
  // The task opens in the student's own practice view (practice.html?preview=<id>, in a frame), where nothing is
  // recorded (app.js stopRecording). Hint and Check answer press that view's own buttons; Show solution opens the
  // model solution below it.
  let browsing = null; // id of the task on show
  let framed = null;   // id of the task in the practice frame
  const frameButton = (id) => { const f = document.querySelector("#tb-practice iframe"); const doc = f && f.contentDocument; return doc ? doc.getElementById(id) : null; };
  // Sets the frame's height to the task view's, and again whenever the view grows or shrinks (a hint, the output,
  // a wider or narrower window), so there is never a scrollbar inside the frame. The code editor scrolls as before.
  function fitFrame(f) {
    const doc = f.contentDocument;
    if (!doc || !doc.documentElement) return;
    const fit = () => {
      if (!doc.body) return;
      const h = Math.ceil(Math.max(doc.documentElement.getBoundingClientRect().height, doc.body.scrollHeight));
      if (h > 0 && f.style.height !== h + "px") f.style.height = h + "px";
    };
    fit();
    const RO = f.contentWindow && f.contentWindow.ResizeObserver;
    if (RO) new RO(fit).observe(doc.body);
    else f.contentWindow.addEventListener("resize", fit);
  }
  function renderTaskBrowser(openId) {
    if (openId && tasksById[openId]) { browsing = tasksById[openId].id; if (!$("tb-search").value) $("tb-search").value = browsing; }
    const found = TaskView.searchTasks(bankTasks, $("tb-search").value, 25);
    const q = $("tb-search").value.trim();
    $("tb-results").innerHTML = !q ? "" : found.length ? found.map((t) =>
      '<li><button type="button" class="secondary" data-browse="' + esc(t.id) + '"' + (t.id === browsing ? ' aria-current="true"' : "") + ">" +
        esc(t.id) + " – " + esc(t.title) + ' <span class="small">(' + esc(unitTitle(t.unit)) + ", level " + t.level + ")</span></button></li>").join("")
      : '<li class="small">No task matches "' + esc(q) + '".</li>';
    const t = bankTasks.find((x) => x.id === browsing);
    if (!t) { $("tb-view").innerHTML = ""; $("tb-practice").innerHTML = ""; framed = null; return; }
    if (framed !== t.id) {
      framed = t.id;
      $("tb-practice").innerHTML = '<div class="teacher-controls tb-practice-bar"><strong>' + esc(t.id) + " – " + esc(t.title) + "</strong>" +
        '<button type="button" class="secondary" id="tb-hint">Hint (free)</button>' +
        '<button type="button" class="secondary" id="tb-show-solution">Show solution</button>' +
        '<button type="button" class="primary" id="tb-check">Check answer</button></div>' +
        '<p class="small">Not recorded: no attempt, pass, progress or level change is saved, here or on the server.</p>' +
        '<iframe class="practice-frame" title="Try ' + esc(t.id) + ' as a student" src="practice.html?preview=' + encodeURIComponent(t.id) + '"></iframe>';
      const frame = $("tb-practice").querySelector("iframe");
      frame.addEventListener("load", () => { try { fitFrame(frame); } catch (e) { /* keeps the starting height */ } });
      $("tb-hint").addEventListener("click", () => { const b = frameButton("hint-btn"); if (b && !b.disabled) b.click(); });
      $("tb-check").addEventListener("click", () => { const b = frameButton("check-btn"); if (b && !b.disabled) b.click(); });
      $("tb-show-solution").addEventListener("click", () => {
        const btn = $("tb-solution-btn");
        if (btn && $("tb-solution").hidden) btn.click();
        if ($("tb-solution")) $("tb-solution").scrollIntoView({ block: "start" });
      });
    }
    const canAdd = tb && !$("as-form").hidden && !(t.tags || []).includes("placement");
    $("tb-view").innerHTML = TaskBrowser.html(t, self.initialDraft, unitTitle) +
      (canAdd ? '<p><button type="button" id="tb-add" class="primary">Add ' + esc(t.id) + " to the assignment</button></p>" : "");
    TaskBrowser.wire($("tb-view"));
    if ($("tb-add")) $("tb-add").addEventListener("click", () => {
      const ids = parseTaskIds($("as-tasks").value);
      if (!ids.includes(t.id)) $("as-tasks").value = ids.concat(t.id).join("\n");
      renderAssignmentCheck();
      $("tb-add").textContent = "Added – go to Assignments to save it";
      $("tb-add").disabled = true;
    });
  }
  $("tb-search").addEventListener("input", () => {
    const found = TaskView.searchTasks(bankTasks, $("tb-search").value, 1);
    // An exact id opens straight away.
    if (found[0] && found[0].id.toLowerCase() === $("tb-search").value.trim().toLowerCase()) browsing = found[0].id;
    renderTaskBrowser();
  });
  $("tb-results").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-browse]");
    if (!b) return;
    browsing = b.dataset.browse;
    renderTaskBrowser();
    if ($("tb-task-h")) $("tb-task-h").focus();
  });

  // ---------- Settings ----------
  $("pw-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const say = (text, problem) => { $("pw-status").hidden = false; $("pw-status").className = problem ? "problem" : "notice notice-up"; $("pw-status").textContent = text; };
    const current = $("pw-current").value;
    const next = $("pw-new").value;
    if (!current) return say("Please type your current password.", true);
    if (next.length < 10) return say("The new password needs at least 10 characters.", true);
    if (next !== $("pw-new2").value) return say("The two new passwords aren't the same. Please type them again.", true);
    const r = await tb.changePassword(current, next);
    for (const id of ["pw-current", "pw-new", "pw-new2"]) $(id).value = "";
    if (r.error) return say(r.error, true);
    say("Your password has been changed.");
  });

  // Copy the class code (the Students and Classes pages).
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-copy-code]");
    if (b && currentClass()) tb.copy(currentClass().class_code, "tb-status");
  });

  // ---------- Level-change log ----------
  function renderLevelLog(data) {
    const log = data.levelLog.slice().reverse();
    $("level-log").innerHTML = log.length ? log.slice(0, 300).map((e) =>
      "<tr><td>" + esc(when(e.at)) + "</td><td>" + esc((data.students[e.studentId] || { name: "(removed)" }).name) +
      "</td><td>" + esc(unitTitle(e.unit)) + '</td><td class="num">' + (e.from == null ? "–" : e.from) +
      '</td><td class="num">' + e.to + "</td><td>" + esc(REASONS[e.reason] || e.reason) + "</td></tr>").join("")
      : '<tr><td colspan="6">No level changes yet.</td></tr>';
  }

  // ---------- Export ----------
  function download(filename, text) {
    // BOM so Excel opens the file as UTF-8
    const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const today = () => new Date().toISOString().slice(0, 10);

  $("export-scores").addEventListener("click", () => {
    const data = collect();
    if (!data) return;
    download("python-practice-class-scores-" + today() + ".csv", TD.classScoresCsv(TD.scoreTable(data, stageUnitIds()), stageUnitIds(), unitTitle));
  });

  $("export-full").addEventListener("click", () => {
    if (!collect()) return;
    download("python-practice-full-data-" + today() + ".csv", TD.fullExportCsv(collect()));
    setTimeout(() => download("data-dictionary.csv", TD.dataDictionaryCsv(misconceptions)), 400);
  });
  $("export-dictionary").addEventListener("click", () => download("data-dictionary.csv", TD.dataDictionaryCsv(misconceptions)));

  // The levels table (the old Overview's export): every unit, with the Students page's name filter applied.
  $("export-levels").addEventListener("click", () => {
    const data = collect();
    if (!data) return;
    const cols = [{ key: "name", label: "Name" }];
    for (const u of UNITS) {
      cols.push({ key: u.id + "_level", label: u.title + ": level" }, { key: u.id + "_placement", label: u.title + ": placement" },
        { key: u.id + "_complete", label: u.title + ": level 10 passed" }, { key: u.id + "_too_easy", label: u.title + ": too easy used" },
        { key: u.id + "_too_hard", label: u.title + ": too hard used" }, { key: u.id + "_fails", label: u.title + ": fails in a row" });
    }
    const rows = TD.sortOverview(TD.filterByName(TD.overviewRows(data), $("name-filter").value), "name", 1).map((r) => {
      const out = { name: r.name };
      for (const u of UNITS) {
        const c = r.cells[u.id];
        if (!c.started) { out[u.id + "_level"] = "not started"; continue; }
        Object.assign(out, {
          [u.id + "_level"]: c.level, [u.id + "_placement"]: c.placementStatus === "done" ? "started at " + c.placementStart : TD.PLACEMENT_STATUS[c.placementStatus],
          [u.id + "_complete"]: c.complete ? "yes" : "no", [u.id + "_too_easy"]: c.tooEasy ? "yes" : "no", [u.id + "_too_hard"]: c.tooHard ? "yes" : "no",
          [u.id + "_fails"]: c.failsInARow,
        });
      }
      return out;
    });
    download("python-practice-overview-" + today() + ".csv", TD.toCsv(cols, rows));
  });

  // The detail log (export only): one row per attempt and button use, newest first, with code and output.
  $("export-log").addEventListener("click", () => {
    const data = collect();
    if (!data) return;
    const cols = ["timestamp", "student", "unit", "task_id", "task_level", "phase", "result", "failure_category", "misconception_matches", "hints_used",
      "button", "level_change", "failed_test_number", "failed_test_inputs", "expected_output", "student_output", "student_code"].map((key) => ({ key }));
    const rows = TD.detailRows(data).map((r) => ({
      timestamp: r.at, student: r.name, unit: r.unit, task_id: r.taskId, task_level: r.level, phase: r.phase, result: r.result,
      failure_category: r.category, misconception_matches: r.misconceptions.join(";"), hints_used: r.hints, button: r.button,
      level_change: r.levelChange, failed_test_number: r.failedTest, failed_test_inputs: r.inputs ? JSON.stringify(r.inputs) : "",
      expected_output: r.expected, student_output: r.output, student_code: r.code,
    }));
    download("python-practice-detail-log-" + today() + ".csv", TD.toCsv(cols, rows));
  });

  $("export-workshop").addEventListener("click", () => {
    const data = collect();
    if (!data) return;
    const w = TD.workshop(data, misconceptions, tasksById);
    const cols = ["section", "id", "name", "attempts_matched", "students_affected", "students", "tasks", "failure_rate_on_tasks",
      "failed_attempts", "unmatched", "unmatched_rate", "has_buggy_variants"].map((key) => ({ key }));
    const rows = w.misconceptions.map((m) => ({
      section: "misconception", id: m.id, name: m.name, attempts_matched: m.attempts, students_affected: m.studentCount,
      students: m.studentNames.join("; "), tasks: m.taskList.map((t) => t.taskId + " (" + t.matches + ")").join("; "), failure_rate_on_tasks: pct(m.failRate),
    })).concat(w.tasks.map((t) => ({
      section: "task", id: t.taskId, name: tasksById[t.taskId] ? tasksById[t.taskId].title : "", failed_attempts: t.fails,
      unmatched: t.unmatched, unmatched_rate: pct(t.unmatchedRate), has_buggy_variants: t.hasVariants ? "yes" : "no",
    })));
    download("python-practice-workshop-" + today() + ".csv", TD.toCsv(cols, rows));
  });

  // ---------- Start up ----------
  window.addEventListener("hashchange", () => {
    if (tb && ["#signin", "#signup"].includes(location.hash)) return; // these belong to the sign-in screen
    render(); const h = document.querySelector("#page-" + page() + " h2"); if (h) h.focus();
  });
  if (tb) tb.start((data) => { classData = data; render(); }, () => render());
  else window.addEventListener("storage", render); // refresh if a student page in another tab saves progress
  const loadJson = (file) => fetch(file).then((r) => { if (!r.ok) throw new Error(file); return r.json(); });
  Promise.all([loadJson("tasks.json").catch(() => []), loadJson("misconceptions.json").catch(() => [])]).then(([tasks, ms]) => {
    // Attempts logged before a task moved unit use its old id (former_ids).
    tasksById = Object.fromEntries(tasks.flatMap((t) => (t.former_ids || []).map((old) => [old, t])).concat(tasks.map((t) => [t.id, t])));
    bankTasks = tasks;
    misconceptions = ms;
    render();
  });
  render();
})();
