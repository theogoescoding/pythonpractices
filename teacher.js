"use strict";

// Teacher view: Overview, Detail log and Workshop pages (switched with #overview, #log, #workshop), and CSV export.
// Reads the same localStorage data as the student pages (see store.js); the sums are in teacher-data.js.
// In backend mode, teacher-backend.js signs the teacher in and loads the chosen class into the same data object.
(function () {
  const { UNITS, unitTitle } = self.Curriculum;
  const TD = self.TeacherData;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const PAGES = ["overview", "log", "workshop"];
  const MAX_LOG_ROWS_SHOWN = 1000;
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

  Store.setupDisplaySettings();

  let tasksById = {};
  let misconceptions = [];
  let sortKey = "name";
  let sortDir = 1;
  let unmatchedTask = null; // task whose unmatched attempts are open on the workshop page

  const page = () => (PAGES.includes(location.hash.slice(1)) ? location.hash.slice(1) : "overview");
  const when = (iso) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "–");
  const pct = (x) => Math.round(x * 100) + "%";
  const mName = (id) => (misconceptions.find((m) => m.id === id) || { name: id }).name;
  const taskLabel = (id) => (tasksById[id] ? id + " – " + tasksById[id].title : id);
  const unitShort = (id) => (id ? unitTitle(id) : "–");
  const tb = self.TeacherBackend && self.TeacherBackend.enabled ? self.TeacherBackend : null;
  let classData = null; // backend mode: the chosen class, as teacher-backend.js loaded it
  const collect = () => (tb ? classData : TD.collect(Store, UNITS));
  const byName = (students) => Object.entries(students).sort((a, b) => a[1].name.localeCompare(b[1].name));

  // ---------- Page switching ----------
  function render() {
    const p = page();
    for (const id of PAGES) $("page-" + id).hidden = id !== p;
    document.querySelectorAll(".tab-nav a").forEach((a) => {
      if (a.dataset.page === p) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (!tb) {
      const used = Store.storageUsed();
      $("storage-warning").hidden = used < Store.STORAGE_WARN_BYTES;
      $("storage-warning").textContent = "This browser's storage is nearly full (" + (used / 1048576).toFixed(1) +
        " MB used, about 5 MB allowed). Export the full data now. New attempts may stop being saved.";
    }
    const data = collect();
    if (!data) return; // backend mode: no class loaded yet
    if (p === "overview") renderOverview(data);
    else if (p === "log") renderLog(data);
    else renderWorkshop(data);
    $("filtered-help").textContent = {
      overview: "the student table, with the name filter applied.",
      log: "the attempts that match the filters, including code and output.",
      workshop: "the misconception table and the per-task unmatched table.",
    }[p];
    renderLevelLog(data);
  }

  // ---------- Overview ----------
  function cellHtml(c) {
    if (!c.started) return '<span class="small">Not started</span>';
    const placement = c.placementStatus === "done" ? "Placement: started at " + c.placementStart : "Placement: " + TD.PLACEMENT_STATUS[c.placementStatus];
    return '<span class="lvl">Level ' + c.level + "</span>" +
      (c.complete ? ' <span class="badge-complete" title="Passed a level 10 task">★ Complete</span>' : "") +
      '<br><span class="small">' + esc(placement) + "</span>" +
      (c.tooEasy || c.tooHard || c.alert ? "<br>" : "") +
      (c.tooEasy ? '<span class="flag">Too easy used</span>' : "") +
      (c.tooHard ? '<span class="flag">Too hard used</span>' : "") +
      (c.alert ? '<span class="flag flag-alert">⚠ ' + c.failsInARow + " fails in a row</span>" : "");
  }

  function overviewRows(data) {
    return TD.sortOverview(TD.filterByName(TD.overviewRows(data), $("name-filter").value), sortKey, sortDir);
  }

  function renderOverview(data) {
    const cols = [{ key: "name", label: "Name" }].concat(UNITS.map((u) => ({ key: u.id, label: u.title })));
    $("overview-head").innerHTML = cols.map((c) =>
      '<th scope="col"' + (c.key === sortKey ? ' aria-sort="' + (sortDir === 1 ? "ascending" : "descending") + '"' : "") +
      '><button type="button" data-sort="' + c.key + '">' + esc(c.label) + "</button></th>").join("");
    const rows = overviewRows(data);
    $("overview-rows").innerHTML = rows.length ? rows.map((r) =>
      "<tr" + (UNITS.some((u) => r.cells[u.id].alert) ? ' class="row-alert"' : "") + '><th scope="row">' + esc(r.name) + "</th>" +
      UNITS.map((u) => '<td class="unit-cell">' + cellHtml(r.cells[u.id]) + "</td>").join("") + "</tr>").join("")
      : '<tr><td colspan="' + cols.length + '">No students to show yet.</td></tr>';

    const q = TD.quickLook(data, misconceptions);
    const list = (items, empty, ordered) => items.length ? "<" + (ordered ? "ol" : "ul") + ">" + items.join("") + "</" + (ordered ? "ol" : "ul") + ">" : '<p class="small">' + empty + "</p>";
    $("quick-look").innerHTML =
      "<section><h3>2+ fails in a row</h3>" + list(q.struggling.map((s) =>
        "<li><strong>" + esc(s.name) + "</strong> – " + esc(unitTitle(s.unit)) + ": " + s.failsInARow + " fails in a row" +
        (s.taskId ? ", now on " + esc(taskLabel(s.taskId)) : "") + "</li>"), "No one right now.") + "</section>" +
      "<section><h3>Haven't started a unit</h3>" + list(q.notStarted.map((s) =>
        "<li><strong>" + esc(s.name) + "</strong>: " + esc(s.units.map(unitTitle).join(", ")) + "</li>"), "Everyone has started every unit.") + "</section>" +
      "<section><h3>Most-failed tasks</h3>" + list(q.topFailedTasks.map((t) =>
        "<li>" + esc(taskLabel(t.taskId)) + ": " + t.fails + " of " + t.attempts + " attempts failed (" + pct(t.failRate) + ")" +
        '<br><span class="small">Most common: ' + esc(t.topCategory || "–") + " · Top misconception: " + esc(t.topMisconception ? mName(t.topMisconception) : "none matched") + "</span></li>"),
        "No failed attempts yet.", true) + "</section>" +
      "<section><h3>Top misconceptions</h3>" + list(q.topMisconceptions.map((m) =>
        "<li>" + esc(m.name) + ": " + m.attempts + " attempt" + (m.attempts === 1 ? "" : "s") + ", " + m.studentCount + " student" + (m.studentCount === 1 ? "" : "s") + "</li>"),
        "No misconceptions matched yet.", true) + "</section>";

    // Reset placement controls
    const keepStudent = $("reset-student").value;
    const keepUnit = $("reset-unit").value;
    const students = byName(data.students);
    $("reset-student").innerHTML = students.map(([id, s]) => '<option value="' + esc(id) + '">' + esc(s.name) + "</option>").join("");
    $("reset-unit").innerHTML = UNITS.map((u) => '<option value="' + u.id + '">' + esc(u.title) + "</option>").join("");
    if (keepStudent) $("reset-student").value = keepStudent;
    if (keepUnit) $("reset-unit").value = keepUnit;
    $("reset-placement").disabled = !students.length;
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

  // ---------- Detail log ----------
  const FILTERS = { student: "f-student", unit: "f-unit", task: "f-task", category: "f-category", misconception: "f-misconception" };
  const currentFilters = () => Object.fromEntries(Object.entries(FILTERS).map(([k, id]) => [k, $(id).value]));

  function fillSelect(id, options) {
    const keep = $(id).value;
    $(id).innerHTML = '<option value="">All</option>' + options.map(([v, label]) => '<option value="' + esc(v) + '">' + esc(label) + "</option>").join("");
    if (options.some(([v]) => v === keep)) $(id).value = keep;
  }

  function codeCell(r) {
    if (!r.code && !r.output && r.result !== "fail") return "";
    return "<details><summary>Show</summary><div class=\"side-by-side\">" +
      "<div><strong>Code</strong><pre>" + esc(r.code || "(none)") + "</pre></div>" +
      "<div><strong>Output" + (r.failedTest ? " (test " + r.failedTest + ")" : "") + "</strong><pre>" + esc(r.output || "(nothing)") + "</pre>" +
      (r.expected !== "" ? '<span class="small">Expected:</span><pre>' + esc(r.expected || "(nothing)") + "</pre>" : "") + "</div></div></details>";
  }

  function filteredLogRows(data) {
    return TD.filterDetail(TD.detailRows(data), currentFilters());
  }

  function renderLog(data) {
    const all = TD.detailRows(data);
    fillSelect("f-student", byName(data.students).map(([id, s]) => [id, s.name]));
    fillSelect("f-unit", UNITS.map((u) => [u.id, u.title]));
    fillSelect("f-task", [...new Set(all.map((r) => r.taskId))].sort().map((id) => [id, taskLabel(id)]));
    fillSelect("f-category", Checker.CATEGORIES.map((c) => [c, c]));
    fillSelect("f-misconception", [["none", "(failed, no match)"]].concat(misconceptions.map((m) => [m.id, m.name])));
    const rows = filteredLogRows(data);
    $("log-count").textContent = "Showing " + Math.min(rows.length, MAX_LOG_ROWS_SHOWN) + " of " + rows.length + " matching rows (" + all.length + " in total)." +
      (rows.length > MAX_LOG_ROWS_SHOWN ? " Only the newest " + MAX_LOG_ROWS_SHOWN + " are shown; the filtered export has them all." : "");
    $("log-rows").innerHTML = rows.length ? rows.slice(0, MAX_LOG_ROWS_SHOWN).map((r) =>
      "<tr" + (r.result === "fail" ? ' class="row-alert"' : "") + "><td>" + esc(when(r.at)) + "</td><td>" + esc(r.name) + "</td><td>" + esc(unitShort(r.unit)) +
      "</td><td>" + esc(r.taskId || "") + (r.phase === "placement" ? ' <span class="flag">placement</span>' : "") + '</td><td class="num">' + esc(r.level == null ? "" : r.level) +
      '</td><td class="res-' + (r.result === "pass" ? "pass" : r.result === "fail" ? "fail" : "none") + '">' + esc(r.result) +
      "</td><td>" + esc(r.category) + "</td><td>" + esc(r.misconceptions.map(mName).join("; ")) + '</td><td class="num">' + esc(r.hints) +
      "</td><td>" + esc(r.button) + "</td><td>" + esc(r.levelChange) + "</td><td>" + codeCell(r) + "</td></tr>").join("")
      : '<tr><td colspan="12">No rows match these filters.</td></tr>';
  }

  Object.values(FILTERS).forEach((id) => $(id).addEventListener("change", render));
  $("f-clear").addEventListener("click", () => { Object.values(FILTERS).forEach((id) => { $(id).value = ""; }); render(); });

  // ---------- Workshop ----------
  function renderWorkshop(data) {
    const w = TD.workshop(data, misconceptions, tasksById);
    $("ws-misconceptions").innerHTML = w.misconceptions.length ? w.misconceptions.map((m) =>
      "<tr><th scope=\"row\">" + esc(m.name) + '<br><span class="small">' + esc(m.id) + '</span></th><td class="num">' + m.attempts +
      '</td><td class="num">' + m.studentCount + "</td><td>" + m.taskList.map((t) => esc(taskLabel(t.taskId)) + " (" + t.matches + ")").join("<br>") +
      '</td><td class="num">' + pct(m.failRate) + "</td><td>" + esc(m.studentNames.join(", ")) + "</td></tr>").join("")
      : '<tr><td colspan="6">No misconceptions matched yet.</td></tr>';
    const seen = new Set(w.misconceptions.map((m) => m.id));
    const unseen = misconceptions.filter((m) => !seen.has(m.id));
    $("ws-unseen").textContent = unseen.length ? "Not matched yet: " + unseen.map((m) => m.name).join("; ") + "." : "";

    $("ws-tasks").innerHTML = w.tasks.length ? w.tasks.map((t) =>
      "<tr><th scope=\"row\">" + esc(taskLabel(t.taskId)) + '</th><td class="num">' + t.fails + '</td><td class="num">' + t.unmatched +
      '</td><td class="num">' + pct(t.unmatchedRate) + "</td><td>" + (t.hasVariants ? "Yes" : "No") + "</td><td>" +
      (t.unmatched ? '<button type="button" class="secondary" data-unmatched="' + esc(t.taskId) + '">View ' + t.unmatched + "</button>" : "–") + "</td></tr>").join("")
      : '<tr><td colspan="6">No failed attempts yet.</td></tr>';

    const open = w.tasks.find((t) => t.taskId === unmatchedTask);
    $("ws-unmatched").innerHTML = !open ? "" :
      '<h3 id="unmatched-h" tabindex="-1">Unmatched attempts: ' + esc(taskLabel(open.taskId)) + "</h3>" +
      open.unmatchedAttempts.map((r) =>
        '<div class="table-wrap" style="padding:.5rem .9rem; margin-bottom:.75rem"><p class="small"><strong>' + esc(r.name) + "</strong> · " + esc(when(r.at)) + " · " +
        esc(r.category) + (r.failedTest ? " · test " + r.failedTest + (r.inputs && r.inputs.length ? " (inputs: " + esc(r.inputs.join(", ")) + ")" : "") : "") + "</p>" +
        '<div class="side-by-side"><div><strong>Code</strong><pre>' + esc(r.code || "(none)") + "</pre></div>" +
        "<div><strong>Output</strong><pre>" + esc(r.output || "(nothing)") + "</pre>" +
        (r.expected !== "" ? '<span class="small">Expected:</span><pre>' + esc(r.expected || "(nothing)") + "</pre>" : "") + "</div></div></div>").join("");
  }

  $("ws-tasks").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-unmatched]");
    if (!b) return;
    unmatchedTask = b.dataset.unmatched;
    render();
    if ($("unmatched-h")) $("unmatched-h").focus();
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

  $("export-full").addEventListener("click", () => {
    if (!collect()) return;
    download("python-practice-full-data-" + today() + ".csv", TD.fullExportCsv(collect()));
    setTimeout(() => download("data-dictionary.csv", TD.dataDictionaryCsv(misconceptions)), 400);
  });

  $("export-filtered").addEventListener("click", () => {
    const data = collect();
    if (!data) return;
    const p = page();
    if (p === "overview") {
      const cols = [{ key: "name", label: "Name" }];
      for (const u of UNITS) {
        cols.push({ key: u.id + "_level", label: u.title + ": level" }, { key: u.id + "_placement", label: u.title + ": placement" },
          { key: u.id + "_complete", label: u.title + ": level 10 passed" }, { key: u.id + "_too_easy", label: u.title + ": too easy used" },
          { key: u.id + "_too_hard", label: u.title + ": too hard used" }, { key: u.id + "_fails", label: u.title + ": fails in a row" });
      }
      const rows = overviewRows(data).map((r) => {
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
    } else if (p === "log") {
      const cols = ["timestamp", "student", "unit", "task_id", "task_level", "phase", "result", "failure_category", "misconception_matches", "hints_used",
        "button", "level_change", "failed_test_number", "failed_test_inputs", "expected_output", "student_output", "student_code"].map((key) => ({ key }));
      const rows = filteredLogRows(data).map((r) => ({
        timestamp: r.at, student: r.name, unit: r.unit, task_id: r.taskId, task_level: r.level, phase: r.phase, result: r.result,
        failure_category: r.category, misconception_matches: r.misconceptions.join(";"), hints_used: r.hints, button: r.button,
        level_change: r.levelChange, failed_test_number: r.failedTest, failed_test_inputs: r.inputs ? JSON.stringify(r.inputs) : "",
        expected_output: r.expected, student_output: r.output, student_code: r.code,
      }));
      download("python-practice-detail-log-" + today() + ".csv", TD.toCsv(cols, rows));
    } else {
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
    }
  });

  // ---------- Start up ----------
  window.addEventListener("hashchange", () => {
    if (tb && ["#signin", "#signup"].includes(location.hash)) return; // these belong to the sign-in screen
    render(); const h = document.querySelector("#page-" + page() + " h2"); if (h) h.focus();
  });
  if (tb) tb.start((data) => { classData = data; render(); });
  else window.addEventListener("storage", render); // refresh if a student page in another tab saves progress
  const loadJson = (file) => fetch(file).then((r) => { if (!r.ok) throw new Error(file); return r.json(); });
  Promise.all([loadJson("tasks.json").catch(() => []), loadJson("misconceptions.json").catch(() => [])]).then(([tasks, ms]) => {
    // Attempts logged before a task moved unit use its old id (former_ids).
    tasksById = Object.fromEntries(tasks.flatMap((t) => (t.former_ids || []).map((old) => [old, t])).concat(tasks.map((t) => [t.id, t])));
    misconceptions = ms;
    render();
  });
  render();
})();
