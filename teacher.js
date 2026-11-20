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
  const PAGES = ["classes", "students", "leaderboards", "certificates", "student", "homework", "assignments", "reports", "misconceptions", "tasks", "settings", "curriculum"];
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
  // A unit whose quick check isn't finished (review finding N2): one grey "Placement to do" chip on the student's page
  // (the Students table has it in grey for Freshness and in blue in the Level row).
  const PLACEMENT_GREY = '<span class="rag rag-none">' + esc(self.Secured.PLACEMENT_TO_DO) + "</span>";

  Store.setupDisplaySettings();
  // Each section heading opens and closes its section (collapse.js, the same as the student view's unit groups).
  Collapse.enhance(document.querySelector("main"), "pythonPractice.teacherCollapsedSections"); // also the Students page's unit blocks

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
  // The Students page table's cells (two rows per student) are built in teacher-data.js (overviewTablesHtml).

  // ---------- The phone menu (review finding L8) ----------
  // Under 700px wide (styles.css) the side menu is one closed button, "Menu: <page name>", that opens the list.
  // Choosing a page, or Esc, closes it again. Wider screens always show the list, and the button is hidden.
  function setNavOpen(open) {
    $("side-nav").classList.toggle("nav-open", open);
    $("nav-toggle").setAttribute("aria-expanded", String(open));
  }
  $("nav-toggle").addEventListener("click", () => setNavOpen($("nav-toggle").getAttribute("aria-expanded") !== "true"));
  $("side-nav-links").addEventListener("click", (e) => { if (e.target.closest("a")) setNavOpen(false); });
  $("side-nav").addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || $("nav-toggle").getAttribute("aria-expanded") !== "true") return;
    setNavOpen(false);
    $("nav-toggle").focus();
  });

  // ---------- Page switching ----------
  function render() {
    const [p, arg] = route();
    for (const id of PAGES) $("page-" + id).hidden = id !== p;
    document.querySelectorAll(".side-nav a").forEach((a) => {
      const on = a.dataset.page === p || (p === "student" && a.dataset.page === "students");
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      if (on) $("nav-current").textContent = a.textContent; // the phone menu's button: "Menu: <page name>"
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
    // The teacher tour (teacher-tour.js): once on this browser, the first time the teacher view is on show.
    if (self.TeacherTour) self.TeacherTour.maybeStart(window, !!tb);
    if (p === "classes") renderClassCards(); // needs no class data
    if (p === "curriculum") renderCurriculum(); // needs no class data
    if (p === "tasks") renderTaskBrowser(arg); // needs no class
    renderHomework(); // the class chosen at the top; does nothing unless the page is showing
    const data = collect();
    if (!data) return; // backend mode: no class loaded yet
    if (p === "students") renderStudents(data);
    else if (p === "leaderboards") renderLeaderboards(data);
    else if (p === "certificates") renderCertificates(data);
    else if (p === "student") renderStudent(data, arg);
    else if (p === "reports") renderReports(data);
    else if (p === "misconceptions") renderMisconceptions(data);
    else if (p === "assignments") renderAssignments(data);
  }

  // ---------- Students ----------
  // The Students page shows every unit, in its groups (A-level too), whatever the class's stage: each group is a
  // collapsible block. The stage still decides which groups open first on the students' home page.
  const OVERVIEW_KEY = "pythonPractice.teacherCollapsedSections"; // the same key as the page's other sections (collapse.js)
  const studentsPageUnitIds = () => UNITS.map((u) => u.id);
  // Every unit is a column, but only the class's stage's units count in an average (TD.studentAverage), here as on the
  // student's page and in the Class scores export.
  const scoreRows = (data) => TD.sortScoreTable(TD.filterByName(TD.scoreTable(data, studentsPageUnitIds(), null, stageUnitIds()).rows, $("name-filter").value), sortKey, sortDir);

  function renderCodeCards() {
    const c = currentClass();
    $("st-code-card").hidden = !c;
    if (c) $("st-code").textContent = c.class_code;
  }

  function renderStudents(data) {
    const unitIds = studentsPageUnitIds();
    const c = currentClass();
    $("st-stage").textContent = (c ? c.name + ", " : "") + self.Curriculum.stageOf(stage()).label + " class. Every unit is shown below, in groups you can close." +
      (c ? " The stage sets which groups open first on your students' home page. Change it on the Classes page." : " (In this browser every student is shown.)");
    renderCodeCards();
    // A class with no students (review finding S2): one short line, and none of the tiles, help or tables.
    const none = !Object.keys(data.students).length;
    $("st-empty").hidden = !none;
    $("st-body").hidden = none;
    if (none) {
      $("st-empty").textContent = c ? "No students yet. They join with the class code " + c.class_code + "." : "No students yet. Students appear here once they use this browser.";
      $("overview-tables").innerHTML = "";
      return;
    }
    const table = TD.scoreTable(data, unitIds, null, stageUnitIds()); // the tiles and class averages: the stage's units only
    const s = table.summary;
    // One tile per group (TD.SUMMARY_TILES), each student in exactly one: by their secured average, or with nothing
    // secured yet by their average level, or Placement to do. Each tile's label is a chip in the colour the unit cards
    // use for that band, so the label says what it counts and the colour matches the cells.
    // Two labelled rows (prompt 25): Freshness (four tiles), then Level (five, Placement to do last).
    $("st-summary").innerHTML = TD.SUMMARY_ROWS.map((row) => { const tiles = TD.SUMMARY_TILES.filter((t) => t.row === row.id);
      return '<div class="rag-row" role="group" aria-labelledby="st-row-' + row.id + '"><p class="rag-row-label" id="st-row-' + row.id + '">' + esc(row.label) + "</p>" +
        '<div class="rag-tiles rag-tiles-' + tiles.length + '">' + tiles.map((t) => '<div class="rag-tile rag-tile-' + t.cls + '" title="' + esc(t.label + ": " + t.note) + '"><span class="rag rag-' + t.cls + '">' + esc(t.label) + "</span><strong>" +
        s.tiles[t.key] + '</strong><span class="small">' + esc(t.note) + "</span></div>").join("") + "</div></div>"; }).join("");
    const started = table.unitAverages.filter((u) => u.average != null);
    $("st-averages").innerHTML = '<p class="small">Class average secured score per unit (students who have secured it):</p>' + (started.length
      ? started.map((u) => '<span class="rag rag-' + u.band.cls + '">' + esc(unitTitle(u.unit)) + ": " + u.average + "% · " + esc(u.band.label) + "</span>").join(" ")
      : '<span class="small">No student has secured a unit yet.</span>');

    // Two rows per student (Freshness and Level), in one table per group of units (TD.overviewTablesHtml) with every
    // unit of the group. A table scrolls sideways inside its own wrapper, with the Name and Shows columns fixed.
    // Each group of units is a collapsible block (open unless this teacher closed it on this device), wired by
    // Collapse.enhance's handler on <main>. Redrawing (a sort, the name filter, new data) keeps a closed block closed:
    // the remembered ones, and those closed on the page now (in case this browser can't remember them).
    loadPasteFlags(data);
    const closedNow = [...$("overview-tables").querySelectorAll('button.group-toggle[aria-expanded="false"]')].map((b) => b.dataset.group);
    // Each table keeps how far it was scrolled sideways, so a sort doesn't jump back to the first unit.
    const scrolled = Object.fromEntries([...$("overview-tables").querySelectorAll(".overview-wrap")].map((w) => [w.firstElementChild.dataset.group, w.scrollLeft]));
    $("overview-tables").innerHTML = TD.overviewTablesHtml({ rows: scoreRows(data), unitIds, unitGroups: self.Curriculum.UNIT_GROUPS, unitTitle,
      sortKey, sortDir, when, flagsHtml: buttonFlagsHtml, buttonHtml: Collapse.buttonHtml, collapsed: Collapse.collapsedIds(OVERVIEW_KEY).concat(closedNow),
      pasteHtml: (sid, u) => TD.pasteFlagHtml(sid, u, (pasteFlags[sid] || {})[u]),
      // Each unit's OCR specification code under its heading, small and grey (prompt 28; curriculum-codes.json).
      specLabelHtml: (u) => (specCodes ? self.CurriculumCodes.labelHtml(specCodes.get(u)) : "") });
    $("overview-tables").querySelectorAll(".overview-wrap").forEach((w) => { const x = scrolled[w.firstElementChild.dataset.group]; if (x) w.scrollLeft = x; });
  }

  // ---------- Paste flags (the Students page's Level cells) ----------
  // A red flag next to a unit's level when the student had a paste flagged in it (paste-flag.js), with the count
  // when there are several. Selecting it opens the details (paste-details.js: when, the task, where, lines, homework,
  // and the code of the student's next check on that task). Backend mode: teacher-api paste_flags_for_class (any
  // teacher on the class, owner or co-teacher). Local mode: this browser's own record of them (Store.pasteLog).
  const PD = self.PasteDetails;
  let pasteFlags = {};   // { studentId: { unit: [details, newest first] } } for the class on show
  let pasteFor = null;   // the class data they were loaded for
  function loadPasteFlags(data) {
    if (pasteFor === data) return;
    pasteFor = data;
    if (!tb) { pasteFlags = TD.pasteFlagsFor(data, Store.pasteLog()); return; }
    pasteFlags = {};
    const c = currentClass();
    if (!c) return;
    tb.pasteFlagsForClass(c.id).then((r) => {
      if (pasteFor !== data) return; // another class was chosen meanwhile
      $("st-paste-status").textContent = r.error || "";
      pasteFlags = r.error ? {} : TD.pasteFlagsFromServer(r);
      if (page() === "students" && Object.keys(pasteFlags).length) render();
    });
  }
  const ukTime = (iso) => new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const RESULT_WORDS = { passed: "Passed", failed: "Failed", skipped: "Skipped" };
  // The dialog's body: every flag, newest first. Text only (textContent): nothing here is read as HTML.
  function pasteDialogBody(make, flags) {
    const wrap = make("div", "paste-dialog");
    wrap.appendChild(make("p", "small", PD.countText(flags.length) + ", newest first. The pasted text is never stored: the code shown is from the student's next check on the same task."));
    const list = make("ol", "paste-flag-list");
    for (const f of flags) {
      const li = make("li", "paste-flag-item");
      const dl = make("dl", "paste-flag-facts");
      const row = (k, v) => { dl.appendChild(make("dt", null, k)); dl.appendChild(make("dd", null, v)); };
      row("When", ukTime(f.at));
      row("Task", taskName(f.taskId));
      row("Where", PD.whereText(f));
      if (!f.homework.recorded) row("Homework", PD.NOT_RECORDED);
      else if (f.homework.inHomework) row("Homework due", f.homework.dueOn ? HW.longDate(f.homework.dueOn) : "Not known");
      row("Lines pasted", f.lines == null ? PD.NOT_RECORDED : String(f.lines));
      li.appendChild(dl);
      if (!f.next) li.appendChild(make("p", "paste-next paste-next-none", PD.NO_CHECK));
      else {
        li.appendChild(make("p", "paste-next", "Next check: " + RESULT_WORDS[f.next.result] + ", " + ukTime(f.next.at) + "."));
        if (f.next.code != null) {
          const pre = make("pre", "paste-code");
          pre.setAttribute("tabindex", "0");
          pre.setAttribute("aria-label", "Code from the next check");
          pre.appendChild(make("code", null, f.next.code === "" ? "(no code)" : f.next.code));
          li.appendChild(pre);
        } else li.appendChild(make("p", "small", f.next.codeNote));
      }
      list.appendChild(li);
    }
    wrap.appendChild(list);
    return wrap;
  }
  async function openPasteDialog(sid, unit) {
    const flags = (pasteFlags[sid] || {})[unit] || [];
    if (!flags.length) return;
    if (flags.some((f) => String(f.taskId).includes("#"))) await loadTemplateTitles();
    const name = ((collect() || { students: {} }).students[sid] || { name: "Student" }).name;
    const sel = 'button[data-paste-student="' + CSS.escape(sid) + '"][data-paste-unit="' + CSS.escape(unit) + '"]';
    const api = self.openDialog(document, {
      id: "paste-flags", title: TD.PASTE_FLAGGED + ": " + name + ", " + unitTitle(unit),
      inert: [document.querySelector(".site-header"), document.querySelector("main"), document.querySelector(".skip-link")],
      returnFocus: () => { const b = $("overview-tables").querySelector(sel); if (b) b.focus(); },
      body: (make) => pasteDialogBody(make, flags),
      buttons: [{ label: "Close", action: (a) => a.close() }],
    });
    api.element.querySelector(".modal").classList.add("modal-wide");
  }
  $("overview-tables").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-paste-student]");
    if (b) openPasteDialog(b.dataset.pasteStudent, b.dataset.pasteUnit);
  });

  // Any table's column heading sorts every table; focus goes back to the same heading in the same table.
  $("overview-tables").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-sort]");
    if (!b) return;
    const tables = [...$("overview-tables").querySelectorAll("table")];
    const which = tables.indexOf(b.closest("table"));
    if (sortKey === b.dataset.sort) sortDir = -sortDir;
    else { sortKey = b.dataset.sort; sortDir = 1; }
    render();
    const table = $("overview-tables").querySelectorAll("table")[which];
    const again = table && table.querySelector('button[data-sort="' + CSS.escape(sortKey) + '"]');
    if (again) again.focus();
  });
  $("name-filter").addEventListener("input", render);

  // ---------- Leaderboards ----------
  // Backend mode: worked out on the server (teacher-api leaderboards and leaderboards_all). Local mode: the same rule
  // (secured.js) on this browser's records, with "This browser" as the only class.
  const POINT_UNITS = UNITS.map((u) => ({ id: u.id, placement: self.Curriculum.hasPlacement(u.id) }));
  const MAX_POINTS = self.Secured.maxPoints(POINT_UNITS.length);
  const signed = (n) => (n > 0 ? "+" + n : String(n));
  // A number with thousands separators ("12,400"). Review finding T2 showed each total as "630 of 12,000"; since
  // prompt 24 the combined total is the number only (programme points and the re-secure bonus have no limit), and
  // "of 12,000" stays only in the notes that explain the 300-a-unit maximum. Display only.
  const thousands = (n) => Number(n).toLocaleString("en-GB");
  let boardMax = MAX_POINTS; // the 300-a-unit maximum, as the server's reply gives it: the notes and the % column use it
  // One board as a table. withClass: the All my classes boards (class name, ranked by percentage).
  // The Most points board's separate totals (prompt 23), then the combined points: secured + level + programme points +
  // re-secure bonus. A server not yet updated sends none of them: "–".
  const TOTALS = [["secured", "Secured"], ["level", "Level"], ["programme", "Programme"], ["bonus", "Re-secure bonus"]];
  function boardHtml(title, note, rows, gain, withClass) {
    // The combined total is the number only (prompt 24): it has no cap, so it isn't shown "of" the 300-a-unit maximum.
    const num = (r) => (gain ? signed(r.points) : thousands(r.points));
    const per = (r) => (gain ? signed(r.percent) : String(r.percent)) + "%";
    const parts = gain ? [] : TOTALS;
    return '<section class="board"><h4>' + esc(title) + '</h4><p class="small">' + esc(note) + "</p>" + (!rows.length ? '<p class="small">No students yet.</p>' :
      '<div class="table-wrap"><table class="board-table" aria-label="' + esc(title) + '"><thead><tr><th scope="col" class="num">Place</th><th scope="col">Nickname</th>' +
      // Points, then %, on every board (review finding L9). All my classes stays ranked by %.
      (withClass ? '<th scope="col">Class</th>' : "") + parts.map(([, label]) => '<th scope="col" class="num">' + label + "</th>").join("") +
      '<th scope="col" class="num">' + (gain ? "Points" : "Combined") + '</th><th scope="col" class="num">%</th>' +
      "</tr></thead><tbody>" + rows.map((r) => '<tr><td class="num">' + r.rank + "</td><td>" + esc(r.nickname) + "</td>" +
        (withClass ? "<td>" + esc(r.class_name || "") + "</td>" : "") + parts.map(([k]) => '<td class="num">' + (r[k] == null ? "–" : thousands(r[k])) + "</td>").join("") +
        '<td class="num">' + num(r) + '</td><td class="num">' + per(r) + "</td></tr>").join("") + "</tbody></table></div>") + "</section>";
  }
  function boardsHtml(b, withClass, max) {
    boardMax = max || MAX_POINTS;
    return boardHtml("Most points", (withClass ? "Ranked by percentage of " + thousands(boardMax) + " points. " : "") +
        "Combined = secured + level + programme points + re-secure bonus. Secured and level points give up to 300 a unit, " + thousands(boardMax) + " in all; programme points and the bonus have no limit, so the combined total has none.", b.overall, false, withClass) +
      boardHtml("Most improved", "Secured and level points gained in the last 14 days" + (withClass ? ", ranked by percentage." : "."), b.improving, true, withClass);
  }
  const localBoards = (data, extra, byPercent) => self.Secured.boards(TD.leaderboardStudents(data, POINT_UNITS, null, extra), byPercent);

  let lbShown = null; // the class data the class boards were made from (they load again when it changes)
  async function renderLeaderboards(data) {
    const c = currentClass();
    $("lb-class-name").textContent = c ? "Class: " + c.name : "Every student who has used this browser.";
    if (lbShown === data) return;
    lbShown = data;
    $("lb-all").innerHTML = "";
    $("lb-all-status").textContent = "";
    if (!tb) { $("lb-class").innerHTML = boardsHtml(localBoards(data, {}, false), false); return; }
    $("lb-class-status").textContent = "Loading…";
    $("lb-class").innerHTML = "";
    const r = await tb.leaderboards();
    if (lbShown !== data) return; // another class was chosen meanwhile
    $("lb-class-status").textContent = r.error || "";
    $("lb-class").innerHTML = r.error ? "" : boardsHtml(r.boards, false, r.max);
  }
  $("lb-all-load").addEventListener("click", async () => {
    if (!tb) {
      $("lb-all").innerHTML = boardsHtml(localBoards(collect(), { class_name: "This browser" }, true), true);
      $("lb-all-status").textContent = "In local mode there is only this browser to show. In backend mode every one of your classes is here.";
      return;
    }
    $("lb-all-status").textContent = "Loading your classes…";
    $("lb-all").innerHTML = "";
    const r = await tb.leaderboardsAll();
    $("lb-all-status").textContent = r.error || (r.classes === 1 ? "Your 1 class." : "Your " + r.classes + " classes.");
    $("lb-all").innerHTML = r.error ? "" : boardsHtml(r.boards, true, r.max);
  });

  // ---------- Certificates ----------
  // A certificate for each block of units where every unit has its floor at 100% (certificates.js). Backend mode: the
  // server works them out and keeps them (teacher-api, migration 0017). Local mode: the same rule (teacher-data.js) on
  // this browser's records, kept in this browser only (never sent anywhere).
  const Certs = self.Certificates;
  // Local mode: works them out and keeps them in this browser (Store.certificates), so one earned is never lost.
  function localCertificates(data) {
    const stored = Store.certificates();
    const now = TD.certificatesFor(data, stored);
    Store.saveCertificates(Object.assign(stored, now));
    return now;
  }
  const issuer = () => (tb ? tb.teacherName() : Store.certificateTeacher()) || "your teacher";
  // The certificate page (certificate.html) gets its text in the address's # part, which never goes to a server.
  const certificateUrl = (c) => "certificate.html#" + new URLSearchParams({ s: c.student_name, c: c.class_name || "", b: c.block_name, d: c.earned_on, t: issuer(), print: "1" }).toString();
  const printButton = (c) => '<button type="button" class="secondary" data-cert="' + esc(JSON.stringify({ student_name: c.student_name, class_name: c.class_name || "", block_name: c.block_name, earned_on: c.earned_on })) +
    '" aria-label="' + esc("Print " + c.student_name + "'s " + c.block_name + " certificate") + '">Print</button>';
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-cert]");
    if (b) window.open(certificateUrl(JSON.parse(b.dataset.cert)), "_blank");
  });
  const certDate = (ymd) => Certs.longDate(ymd);
  // One class's certificates: a row each (student, block, date, Print), which wraps cleanly on a phone.
  // Backend mode: each class's heading (h4) is under "All your classes" (h3). Local mode: one list, "This browser" (h3).
  const certHeading = (title) => (tb ? "<h4>" + esc(title) + "</h4>" : "<h3>" + esc(title) + "</h3>");
  function certTableHtml(title, rows) {
    return '<section class="cert-class">' + certHeading(title) +(!rows.length ? '<p class="small">No certificates yet.</p>' :
      '<ul class="cert-list">' + rows.map((r) => '<li class="cert-row"><span class="cert-who"><strong>' + esc(r.student_name) + "</strong> " + esc(r.block_name) +
        ' <span class="small">earned on ' + esc(certDate(r.earned_on)) + "</span></span> " + printButton(r) + "</li>").join("") + "</ul>") + "</section>";
  }
  let certShown = null; // the data the Certificates page was made from
  async function renderCertificates(data) {
    $("cert-local").hidden = !!tb;
    $("cert-name-row").hidden = !!tb;
    if (!tb && document.activeElement !== $("cert-teacher-name")) $("cert-teacher-name").value = Store.certificateTeacher();
    if (certShown === data) return;
    certShown = data;
    if (!tb) {
      $("cert-list").innerHTML = certTableHtml("This browser", TD.certificateRows(data, localCertificates(data)));
      return;
    }
    // Every class this teacher is on (own and shared), one table each.
    $("cert-status").textContent = "Loading…";
    $("cert-list").innerHTML = "";
    const parts = [];
    for (const c of tb.allClasses()) {
      const r = await tb.certificatesForClass(c.id);
      if (certShown !== data) return; // the page changed meanwhile
      parts.push(r.error ? '<section class="cert-class">' + certHeading(c.name) + '<p class="problem">' + esc(r.error) + "</p></section>" : certTableHtml(c.name, r.certificates));
    }
    $("cert-status").textContent = "";
    $("cert-list").innerHTML = parts.join("") || '<p class="small">You have no classes yet.</p>';
  }
  $("cert-teacher-name").addEventListener("input", () => Store.saveCertificateTeacher($("cert-teacher-name").value.trim()));

  // ---------- The student page's Progress summary (prompt 25) ----------
  // Four figures, by homework.js's rules (its first-pass rule, as homework counts tasks). Backend mode: teacher-api
  // student_progress_summary works them out on the server. Local mode: the same rule on this browser's attempts, with
  // no homework (it needs the server).
  const ukWhen = (iso) => new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  function summaryFiguresHtml(x) {
    const homework = x.average_homework_completion === undefined ? "Homework is not available in this browser"
      : x.average_homework_completion === null ? "No homework set since they joined" : x.average_homework_completion + "%";
    const rows = [["First passes this week", String(x.first_passes_this_week)], ["Average first passes per week", Number(x.average_first_passes_per_week).toFixed(1)],
      ["Average homework completion", homework], ["Last active", x.last_active ? ukWhen(x.last_active) : "Not active yet"]];
    return '<dl class="summary-figures">' + rows.map(([k, v]) => '<div class="summary-figure"><dt>' + esc(k) + "</dt><dd>" + esc(v) + "</dd></div>").join("") + "</dl>";
  }
  // The local figures, in the server's reply's shape (average_homework_completion undefined: no homework here).
  // joinedAt: when this browser first saw the student (Store's "created"), the local stand-in for joining a class.
  const localSummary = (data, studentId) => { const x = self.Homework.progressSummary({ attempts: data.attempts.filter((a) => a.studentId === studentId), flags: [], homework: null,
    joinedAt: (data.students[studentId] || {}).created });
    return { first_passes_this_week: x.firstPassesThisWeek, average_first_passes_per_week: x.averageFirstPassesPerWeek, average_homework_completion: undefined, last_active: x.lastActive }; };
  let sdSummaryFor = null;
  function renderStudentSummary(data, studentId) {
    if (sdSummaryFor && sdSummaryFor.data === data && sdSummaryFor.id === studentId) return;
    const mine = (sdSummaryFor = { data, id: studentId });
    if (!tb) { $("sd-summary").innerHTML = summaryFiguresHtml(localSummary(data, studentId)); return; }
    $("sd-summary").innerHTML = '<p class="small">Loading…</p>';
    tb.progressSummary(studentId).then((r) => {
      if (sdSummaryFor !== mine) return; // another student (or new data) meanwhile
      $("sd-summary").innerHTML = r.error ? '<p class="problem">' + esc(r.error) + "</p>" : summaryFiguresHtml(r);
    });
  }

  // The student page's Certificates panel.
  let sdCertsFor = null;
  async function renderStudentCertificates(data, studentId, name) {
    if (sdCertsFor && sdCertsFor.data === data && sdCertsFor.id === studentId) return;
    const mine = (sdCertsFor = { data, id: studentId });
    const fill = (list) => {
      $("sd-certs").innerHTML = !list.length ? '<p class="small">No certificates yet.</p>' : '<ul class="cert-list">' + list.map((c) =>
        '<li class="cert-row"><span><strong>' + esc(c.block_name) + '</strong> <span class="small">earned on ' + esc(certDate(c.earned_on)) + "</span></span> " + printButton(c) + "</li>").join("") + "</ul>";
    };
    if (!tb) { fill((localCertificates(data)[studentId] || []).map((c) => ({ student_name: name, class_name: "", block_name: c.block_name, earned_on: c.earned_on }))); return; }
    $("sd-certs").innerHTML = '<p class="small">Loading…</p>';
    const r = await tb.certificatesForStudent(studentId);
    if (sdCertsFor !== mine) return; // another student was opened meanwhile
    if (r.error) { $("sd-certs").innerHTML = '<p class="problem">' + esc(r.error) + "</p>"; return; }
    fill(r.certificates);
  }

  // ---------- Homework (backend mode) ----------
  // teacher-api works out each student's "x of y done" with the site's rule (homework.js) and keeps the homework. Any
  // teacher on the class (owner or co-teacher) sees and does the same: set, delete, and open the report. Local mode has
  // no homework: its menu link is hidden (data-backend) and the page says why.
  const HW = self.Homework;
  const HW_BLOCKS = self.Certificates.BLOCKS; // the six blocks of the Students page, with their units
  let hwClassId = null;      // the class on the Homework page: always the class chosen at the top (currentClass)
  let hwLoadedFor = null;    // the class its list was loaded for
  let hwList = [];
  let hwOnPage = false;      // the page was showing at the last render (coming back to it loads the list again)
  let hwReport = null;       // { id, data } the report on show
  let hwSort = { key: "name", dir: 1 };
  let templateTitles = null; // template id -> title (templates.json), loaded when a report names a template variant

  const unitNames = (units) => (units && units.length ? units.map((u) => unitTitle(u)).join(", ") : "Any unit");
  const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");
  // The templates' titles (templates.json), loaded once, the first time a template variant needs naming.
  async function loadTemplateTitles() {
    if (!templateTitles) templateTitles = await fetch("templates.json").then((x) => x.json()).then((list) => Object.fromEntries(list.map((t) => [t.id, t.title]))).catch(() => ({}));
    return templateTitles;
  }
  // A task's name: its title, then its id. A template variant ("template#seed") is named by its template.
  function taskName(id) {
    const tpl = String(id).split("#")[0];
    const title = (tasksById[id] && tasksById[id].title) || (templateTitles && templateTitles[tpl]) || (tasksById[tpl.replace(/^d-/, "")] || {}).title;
    return title ? title + " (" + id + ")" : id;
  }

  function buildUnitPicker() {
    $("hw-blocks").innerHTML = HW_BLOCKS.map((b) => '<details class="hw-block"><summary>' + esc(b.name) + ' <span class="small" data-hw-count="' + b.id + '"></span></summary>' +
      '<label class="hw-all"><input type="checkbox" data-hw-block="' + b.id + '"> Select all of ' + esc(b.name) + "</label>" +
      '<div class="hw-unit-grid">' + b.units.map((u) => '<label><input type="checkbox" data-hw-unit="' + esc(u) + '" data-block="' + b.id + '"> ' +
        esc(self.Curriculum.studentUnitTitle(u)) + "</label>").join("") + "</div></details>").join("");
    hwBlockStates();
  }
  // Each block's "Select all" box: ticked when every unit is, part-ticked when some are; the count in its heading.
  function hwBlockStates() {
    for (const b of HW_BLOCKS) {
      const boxes = [...$("hw-blocks").querySelectorAll('input[data-block="' + b.id + '"]')];
      const n = boxes.filter((x) => x.checked).length;
      const all = $("hw-blocks").querySelector('input[data-hw-block="' + b.id + '"]');
      all.checked = n === boxes.length;
      all.indeterminate = n > 0 && n < boxes.length;
      $("hw-blocks").querySelector('[data-hw-count="' + b.id + '"]').textContent = n ? "(" + n + " of " + boxes.length + " chosen)" : "";
    }
  }
  $("hw-blocks").addEventListener("change", (e) => {
    const block = e.target.dataset && e.target.dataset.hwBlock;
    if (block) $("hw-blocks").querySelectorAll('input[data-block="' + block + '"]').forEach((x) => { x.checked = e.target.checked; });
    hwBlockStates();
  });

  function renderHomework() {
    const on = page() === "homework";
    const fresh = on && !hwOnPage;
    hwOnPage = on;
    $("hw-local").hidden = !!tb;
    $("hw-main").hidden = !tb;
    if (!tb || !on) return;
    if (!$("hw-blocks").children.length) buildUnitPicker();
    // The class chosen at the top of the page, as every other page uses: its homework is listed and set here.
    const chosen = (currentClass() || {}).id || null;
    if (chosen !== hwClassId) { hwClassId = chosen; closeHomeworkReport(); closeHomeworkForm(); }
    $("hw-new").hidden = !hwClassId;
    if (!hwClassId) closeHomeworkForm();
    $("hw-due").min = HW.ukDate(Date.now());
    if (!hwClassId) { $("hw-status").textContent = "Make a class first (Classes page)."; $("hw-list").innerHTML = ""; return; }
    if (fresh || hwLoadedFor !== hwClassId) loadHomework();
  }

  async function loadHomework() {
    const id = hwClassId;
    hwLoadedFor = id;
    $("hw-status").textContent = "Loading…";
    const r = await tb.listHomework(id);
    if (hwClassId !== id) return; // another class was chosen meanwhile
    $("hw-status").textContent = r.error || "";
    hwList = r.error ? [] : r.homework;
    renderHomeworkList();
    if (hwReport && !hwList.some((h) => h.id === hwReport.id)) closeHomeworkReport();
  }

  // Set homework: the button opens the form below the list; Cancel (or setting it) closes it again.
  function openHomeworkForm() {
    $("hw-form").hidden = false;
    $("hw-new").setAttribute("aria-expanded", "true");
    $("hw-form-h").focus();
  }
  function closeHomeworkForm() {
    $("hw-form").hidden = true;
    $("hw-new").setAttribute("aria-expanded", "false");
  }
  $("hw-new").addEventListener("click", () => ($("hw-form").hidden ? openHomeworkForm() : closeHomeworkForm()));
  $("hw-cancel").addEventListener("click", () => { closeHomeworkForm(); $("hw-new").focus(); });

  // The report sits under its own homework (review finding L2): the one report box is moved into that homework's card,
  // and back out before the list is drawn again (so it is never lost with the old cards).
  const parkHomeworkReport = () => $("hw-main").appendChild($("hw-report"));
  function placeHomeworkReport() {
    const card = hwReport && $("hw-list").querySelector('[data-hw-item="' + CSS.escape(hwReport.id) + '"]');
    if (card) card.appendChild($("hw-report")); else parkHomeworkReport();
  }

  function renderHomeworkList() {
    const cls = (tb.allClasses().find((c) => c.id === hwClassId) || { name: "" }).name;
    parkHomeworkReport();
    $("hw-list").innerHTML = '<h3 class="hw-list-h">Homework for ' + esc(cls) + "</h3>" + (!hwList.length ? '<p class="small">No homework for this class yet.</p>' :
      '<ul class="hw-list">' + hwList.map((h) => '<li class="task-card hw-item" data-hw-item="' + esc(h.id) + '">' +
        "<h4>" + esc(plural(h.task_count, "task")) + ", due " + esc(HW.longDate(h.due_on)) + (HW.pastDue(h) ? ' <span class="flag">Due date passed</span>' : "") + "</h4>" +
        '<p class="small">Units: ' + esc(unitNames(h.units)) + "</p>" +
        '<p class="small">Set by ' + esc(h.yours ? "you" : h.created_by_name || "another teacher") + " on " + esc(when(h.created_at)) + ". " +
          h.complete + " of " + esc(plural(h.students, "student")) + " complete.</p>" +
        '<p class="teacher-controls"><button type="button" class="secondary" data-hw-report="' + esc(h.id) + '">Report</button>' +
          '<button type="button" class="secondary" data-hw-delete="' + esc(h.id) + '">Delete</button>' +
          '<span data-hw-confirm="' + esc(h.id) + '" hidden>Delete this homework? Students will no longer see it. ' +
          '<button type="button" class="danger" data-hw-delete-yes="' + esc(h.id) + '">Yes, delete</button> ' +
          '<button type="button" class="secondary" data-hw-delete-no="' + esc(h.id) + '">Cancel</button></span></p></li>').join("") + "</ul>");
    placeHomeworkReport();
  }

  $("hw-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = $("hw-form-status");
    const fail = (msg, field) => {
      status.hidden = false; status.className = "problem"; status.textContent = msg;
      if (field) $(field).focus();
    };
    const fields = { count: "hw-count", due: "hw-due", units: null };
    const units = [...$("hw-blocks").querySelectorAll("input[data-hw-unit]:checked")].map((x) => x.dataset.hwUnit);
    const raw = $("hw-count").value.trim();
    const c = HW.checkNew({ task_count: raw === "" ? NaN : Number(raw), due_on: $("hw-due").value, units }, UNITS.map((u) => u.id), HW.ukDate(Date.now()));
    if (!c.ok) return fail(c.message, fields[c.problem]);
    $("hw-save").disabled = true;
    const r = await tb.createHomework(hwClassId, c.homework);
    $("hw-save").disabled = false;
    if (r.error) return fail(r.error, fields[r.problem]);
    status.hidden = true;
    $("hw-form").reset();
    hwBlockStates();
    closeHomeworkForm();
    hwList = r.homework;
    hwLoadedFor = hwClassId;
    renderHomeworkList();
    $("hw-status").textContent = "Homework set: " + plural(c.homework.task_count, "task") + ", due " + HW.longDate(c.homework.due_on) + ".";
  });

  $("hw-list").addEventListener("click", async (e) => {
    const sel = (attr, id) => $("hw-list").querySelector("[" + attr + '="' + CSS.escape(id) + '"]');
    const report = e.target.closest("button[data-hw-report]");
    const del = e.target.closest("button[data-hw-delete]");
    const no = e.target.closest("button[data-hw-delete-no]");
    const yes = e.target.closest("button[data-hw-delete-yes]");
    if (report) openHomeworkReport(report.dataset.hwReport);
    // Delete asks first, on the page: Delete shows "Yes, delete / Cancel"; Cancel changes nothing.
    if (del) { sel("data-hw-confirm", del.dataset.hwDelete).hidden = false; sel("data-hw-delete-no", del.dataset.hwDelete).focus(); }
    if (no) { sel("data-hw-confirm", no.dataset.hwDeleteNo).hidden = true; sel("data-hw-delete", no.dataset.hwDeleteNo).focus(); }
    if (yes) {
      yes.disabled = true;
      const r = await tb.deleteHomework(yes.dataset.hwDeleteYes);
      if (r.error) { yes.disabled = false; $("hw-status").textContent = r.error; return; }
      await loadHomework();
      $("hw-status").textContent = "The homework has been deleted.";
      $("hw-status").setAttribute("tabindex", "-1");
      $("hw-status").focus(); // the deleted card (and its buttons) are gone
    }
  });

  function closeHomeworkReport() { hwReport = null; $("hw-report").hidden = true; parkHomeworkReport(); }
  async function openHomeworkReport(id) {
    hwReport = { id, data: null };
    placeHomeworkReport();
    $("hw-report").hidden = false;
    $("hw-report-meta").textContent = "Loading…";
    $("hw-report-table").innerHTML = "";
    $("hw-report-h").focus();
    const r = await tb.homeworkReport(id);
    if (!hwReport || hwReport.id !== id) return; // another report was opened meanwhile
    if (r.error) { $("hw-report-meta").textContent = r.error; return; }
    if (r.students.some((s) => s.flagged.some((f) => String(f.task_id).includes("#")))) {
      await loadTemplateTitles();
      if (!hwReport || hwReport.id !== id) return;
    }
    hwReport.data = r;
    drawHomeworkReport();
  }

  // The report's columns, each sortable: Student, Done, Units, Paste flagged (the flag's one name, review finding N3).
  const HW_COLUMNS = [
    { key: "name", label: "Student", cmp: (a, b) => a.student_name.localeCompare(b.student_name) },
    { key: "done", label: "Done", cmp: (a, b) => a.done - b.done },
    { key: "units", label: "Units", cmp: (a, b) => a.units.length - b.units.length || unitNames(a.units).localeCompare(unitNames(b.units)) },
    { key: "flagged", label: TD.PASTE_FLAGGED, cmp: (a, b) => a.flagged.length - b.flagged.length },
  ];
  function drawHomeworkReport() {
    const r = hwReport.data;
    const h = r.homework;
    $("hw-report-meta").textContent = r.class_name + ": " + plural(h.task_count, "task") + ", due " + HW.longDate(h.due_on) + ". Units: " + unitNames(h.units) + ". " +
      r.students.filter((s) => s.complete).length + " of " + plural(r.students.length, "student") + " complete.";
    const col = HW_COLUMNS.find((c) => c.key === hwSort.key) || HW_COLUMNS[0];
    const rows = r.students.slice().sort((a, b) => hwSort.dir * col.cmp(a, b) || a.student_name.localeCompare(b.student_name));
    const head = HW_COLUMNS.map((c) => '<th scope="col"' + (c.key === hwSort.key ? ' aria-sort="' + (hwSort.dir === 1 ? "ascending" : "descending") + '"' : "") +
      (c.key === "done" ? ' class="num"' : "") + '><button type="button" data-hw-sort="' + c.key + '">' + esc(c.label) + "</button></th>").join("");
    $("hw-report-table").innerHTML = !rows.length ? '<p class="small">No students in this class yet.</p>' :
      '<div class="table-wrap"><table class="hw-report-table"><thead><tr>' + head + "</tr></thead><tbody>" + rows.map((s) =>
        '<tr><th scope="row">' + esc(s.student_name) + "</th>" +
        '<td class="num" data-label="Done">' + (s.complete ? '<span class="badge-complete">Complete</span> ' : "") + s.done + " of " + s.task_count + "</td>" +
        '<td data-label="Units">' + (s.units.length ? esc(unitNames(s.units)) : '<span class="small">None yet</span>') + "</td>" +
        '<td data-label="' + esc(TD.PASTE_FLAGGED) + '">' + (s.flagged.length ? '<ul class="hw-flags">' + s.flagged.map((f) => '<li><span class="flag flag-alert">' + esc(TD.PASTE_FLAGGED) + "</span> " + esc(taskName(f.task_id)) + "</li>").join("") + "</ul>"
          : '<span class="small">None</span>') + "</td></tr>").join("") + "</tbody></table></div>";
  }
  $("hw-report-table").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-hw-sort]");
    if (!b || !hwReport || !hwReport.data) return;
    hwSort = hwSort.key === b.dataset.hwSort ? { key: hwSort.key, dir: -hwSort.dir } : { key: b.dataset.hwSort, dir: 1 };
    drawHomeworkReport();
    const again = $("hw-report-table").querySelector('button[data-hw-sort="' + CSS.escape(hwSort.key) + '"]');
    if (again) again.focus();
  });

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
      $("sd-points").innerHTML = "";
      $("sd-certs").innerHTML = "";
      sdCertsFor = null;
      $("sd-summary").innerHTML = "";
      sdSummaryFor = null;
      $("sd-recent").innerHTML = "";
      return;
    }
    $("sd-actions").hidden = false;
    // The bars (review finding T3): the class's stage's units, then any other unit the student has started, tagged as
    // outside the stage. Only the stage's units count in the average (TD.studentAverage), as everywhere.
    const inStage = stageUnitIds();
    const startedUnits = UNITS.map((u) => u.id).filter((u) => ((data.progress[studentId] || {}).units || {})[u]);
    const unitIds = UNITS.map((u) => u.id).filter((u) => inStage.includes(u) || startedUnits.includes(u));
    const d = TD.studentDetail(data, studentId, unitIds, null, RECENT_ATTEMPTS, inStage);
    $("student-title").textContent = s.name;
    $("sd-meta").textContent = "Last active " + when(d.lastActive) + (d.average == null ? "" : " · average secured score " + d.average + "% (" + d.band.label + ")");
    // Reset placement: only the units the student has started (a unit not started has no placement to reset).
    const keepUnit = $("reset-unit").value;
    $("reset-unit").innerHTML = startedUnits.length ? startedUnits.map((u) => '<option value="' + u + '">' + esc(unitTitle(u)) + "</option>").join("")
      : '<option value="">No unit started yet</option>';
    $("reset-unit").disabled = !startedUnits.length;
    $("reset-placement").disabled = !startedUnits.length;
    if (keepUnit && startedUnits.includes(keepUnit)) $("reset-unit").value = keepUnit;
    // Points (secured.js, the rule the leaderboards use), worked out first: each placed unit's bar shows its stars.
    const pts = TD.pointsByStudent({ students: { [studentId]: s }, progress: data.progress, attempts: data.attempts, levelLog: data.levelLog, placementLog: data.placementLog }, POINT_UNITS)[studentId];
    $("sd-scores").innerHTML = unitIds.map((u) => {
      const c = d.cells[u];
      // The bar: the secured score, or for a unit not secured yet its level (out of 10) in the level's colour.
      const width = c.score != null ? c.score : c.levelBand ? c.level * 10 : 0;
      const barCls = c.band ? c.band.cls : c.levelBand ? c.levelBand.cls : "";
      return '<div class="score-bar"><div class="score-bar-head"><strong>' + esc(unitTitle(u)) + "</strong> " +
        (inStage.includes(u) ? "" : '<span class="small">(not in this class\'s stage)</span> ') +
        // Placement to do: one grey chip (the teacher colour key's), not a level as well.
        (c.started ? (c.placed ? bandHtml(c) : PLACEMENT_GREY) + " " + '<span class="small">' + (c.placementToDo ? "" :
          c.placed && !c.secured ? "Not secured yet (" + c.levelTenPasses + " of 2 level 10 passes with no hints)" : "Level " + c.level) +
          (c.failsInARow ? " · " + c.failsInARow + " fail" + (c.failsInARow === 1 ? "" : "s") + " in a row" : "") + "</span> " + buttonFlagsHtml(c) +
          // The unit card's stars (prompt 23): one each time the unit came back to 100%, the same as the student sees.
          (c.placed && pts.units[u] ? " " + self.Secured.starsHtml(pts.units[u].stars) : "")
          : '<span class="small">Not started</span>') +
        '</div><div class="bar" aria-hidden="true"><span class="' + (barCls ? "rag-" + barCls : "") + '" style="width:' + width + '%"></span></div></div>';
    }).join("");
    // Points per unit: every unit with points, then the totals. Total is secured + level (at most 300 a unit); the
    // re-secure bonus (at most 50 a unit) and the programme points come on top, in the combined total (prompt 23).
    const withPoints = POINT_UNITS.filter((u) => pts.units[u.id].total > 0 || pts.units[u.id].bonus > 0);
    $("sd-points").innerHTML = '<div class="table-wrap"><table class="board-table"><thead><tr><th scope="col">Unit</th><th scope="col" class="num">Secured</th><th scope="col" class="num">Level</th><th scope="col" class="num">Total</th><th scope="col" class="num">Re-secure bonus</th></tr></thead><tbody>' +
      (withPoints.length ? withPoints.map((u) => { const p = pts.units[u.id]; return '<tr><th scope="row">' + esc(unitTitle(u.id)) + '</th><td class="num">' + p.secured + '</td><td class="num">' + p.level + '</td><td class="num">' + p.total + '</td><td class="num">' + p.bonus + "</td></tr>"; }).join("")
        : '<tr><td colspan="5">No points yet.</td></tr>') +
      '</tbody><tfoot><tr><th scope="row">All ' + POINT_UNITS.length + " units (out of " + MAX_POINTS + ")</th><td class=\"num\">" + pts.secured + '</td><td class="num">' + pts.level + '</td><td class="num"><strong>' + pts.total + '</strong></td><td class="num">' + pts.bonus + "</td></tr></tfoot></table></div>" +
      '<p class="sd-programmes"><strong>' + esc(self.Secured.programmesText(pts.programmes)) + "</strong> in endless mode: " + pts.programme + " programme points.</p>" +
      '<p class="small">Combined total: ' + thousands(pts.combined) + " (secured " + pts.secured + " + level " + pts.level + " + programme " + pts.programme + " + re-secure bonus " + pts.bonus + ")." +
      " Points count every unit, as on the Leaderboards page. Units not listed have 0 points. In the last 14 days: " + signed(pts.gain) + " secured and level points (" + pts.before.total + " points 14 days ago).</p>";
    renderStudentCertificates(data, studentId, s.name);
    renderStudentSummary(data, studentId);
    $("sd-recent").innerHTML = d.recent.length ? '<div class="table-wrap"><table><thead><tr><th scope="col">Time</th><th scope="col">Task</th><th scope="col">Result</th>' +
      '<th scope="col">Hints</th><th scope="col">Test that failed</th><th scope="col">Misconception matched</th></tr></thead><tbody>' +
      d.recent.map((a) => "<tr" + (a.result === "fail" ? ' class="row-alert"' : "") + "><td>" + esc(when(a.at)) + "</td><td>" + taskLink(a.taskId) +
        (a.phase && a.phase !== "practice" ? ' <span class="flag">' + esc(a.phase) + "</span>" : "") +
        '</td><td class="res-' + (a.result === "pass" ? "pass" : a.result === "fail" ? "fail" : "none") + '">' + esc(a.result) + (a.category ? ' <span class="small">(' + esc(TD.failureName(a.category)) + ")</span>" : "") +
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
  // The exports and the level changes. Compare classes is on the Leaderboards page; the workshop is on Misconceptions.
  function renderReports(data) {
    renderLevelLog(data);
  }

  // ---------- "Needs review" (review-rules.js) ----------
  // Failed attempts from the last 30 days that match a newer rule (rules-review.json, added each term once it has been
  // checked), worked out each time the page is drawn: nothing is stored, so a new rule covers this month at once.
  // Local mode: this browser's records. Backend mode: teacher-api review_candidates_for_class gives the class's failed
  // checks on the rules' tasks (any teacher on the class, owner or co-teacher), and they are matched here.
  const RR = self.ReviewRules;
  let reviewRules = [];   // rules-review.json, loaded with the tasks
  let reviewCache = null; // backend mode: { data, rules, list, error, loading } for the class on show
  function reviewState(data) {
    if (!tb) return { list: RR.matches(reviewRules, RR.candidatesFromRecords(data), Date.now()), error: "", loading: false };
    if (reviewCache && reviewCache.data === data && reviewCache.rules === reviewRules) return reviewCache;
    const mine = (reviewCache = { data, rules: reviewRules, list: [], error: "", loading: true });
    const c = currentClass();
    const ids = RR.taskIds(reviewRules);
    if (!c || !ids.length) { mine.loading = false; return mine; }
    tb.reviewCandidates(c.id, ids).then((r) => {
      if (reviewCache !== mine) return; // another class (or rules) meanwhile
      mine.loading = false;
      mine.error = r.error || "";
      mine.list = r.error ? [] : RR.matches(reviewRules, r.candidates, Date.now());
      if (page() === "misconceptions") render();
    });
    return mine;
  }
  // Each entry: the rule's name, the task, the student's nickname, the date, and the code only as the attempt stored it.
  function renderReview(st) {
    $("mc-review-status").textContent = st.loading ? "Loading…" : st.error ||
      (!reviewRules.length ? "No newer rules have been added yet." : !st.list.length ? "No attempts from the last 30 days match the newer rules." :
        st.list.length + (st.list.length === 1 ? " attempt" : " attempts") + " to review, newest first.");
    $("mc-review").innerHTML = st.list.map((m) => '<article class="review-item">' +
      "<h4>" + esc(m.rule_name) + ' <span class="flag">Needs review</span></h4>' +
      '<dl class="review-facts"><dt>Task</dt><dd>' + taskLink(m.task_id) + "</dd><dt>Student</dt><dd>" + esc(m.student_name) + "</dd><dt>Date</dt><dd>" + esc(when(m.at)) + "</dd></dl>" +
      (m.code != null ? '<pre class="review-code" tabindex="0" aria-label="' + esc(m.student_name + "'s code") + '">' + esc(m.code) + "</pre>"
        : '<p class="small">The code is no longer stored.</p>') + "</article>").join("");
  }

  // ---------- Misconceptions (the workshop) ----------
  // The unit picker lists the class's stage's units (curriculum.js stageUnits), then "All units", which it opens on.
  function renderMisconceptions(data) {
    const unitIds = stageUnitIds();
    // It opens on "All units" (review finding L7); a unit the teacher picked is kept while it is in the class's stage.
    if (mcUnit !== "all" && !unitIds.includes(mcUnit)) mcUnit = "all";
    const options = unitIds.map((u) => '<option value="' + esc(u) + '">' + esc(unitTitle(u)) + "</option>").join("") + '<option value="all">All units</option>';
    if ($("mc-unit").dataset.options !== options) { $("mc-unit").innerHTML = options; $("mc-unit").dataset.options = options; } // keeps focus on the picker
    $("mc-unit").value = mcUnit;
    const where = mcUnit === "all" ? "any unit" : unitTitle(mcUnit);
    const failedTasks = TD.mostFailedTasks(data, mcUnit === "all" ? null : mcUnit);
    $("mc-failed").innerHTML = !failedTasks.length ? '<p class="small">No failed attempts in ' + esc(where) + " yet.</p>" :
      '<div class="table-wrap"><table><thead><tr><th scope="col">Task</th><th scope="col">Failed attempts</th><th scope="col">Failure rate</th>' +
      '<th scope="col">Most common failure type</th><th scope="col">Top misconception</th></tr></thead><tbody>' +
      failedTasks.map((t) => '<tr><th scope="row">' + taskLink(t.taskId) + '</th><td class="num">' + t.fails + " of " + t.attempts + '</td><td class="num">' + pct(t.failRate) +
        "</td><td>" + esc(TD.failureName(t.topCategory) || "–") + "</td><td>" + esc(t.topMisconception ? mName(t.topMisconception) : "none matched") + "</td></tr>").join("") +
      "</tbody></table></div>";

    const review = reviewState(data);
    renderReview(review);
    const w = TD.workshop(data, misconceptions, tasksById, RR.countsByTask(review.list));
    $("ws-misconceptions").innerHTML = w.misconceptions.length ? w.misconceptions.map((m) =>
      "<tr><th scope=\"row\">" + esc(m.name) + '<br><span class="small">' + esc(m.id) + '</span></th><td class="num">' + m.attempts +
      '</td><td class="num">' + m.studentCount + "</td><td>" + m.taskList.map((t) => taskLink(t.taskId) + " (" + t.matches + ")").join("<br>") +
      '</td><td class="num">' + pct(m.failRate) + "</td><td>" + esc(m.studentNames.join(", ")) + "</td></tr>").join("")
      : '<tr><td colspan="6">No misconceptions matched yet.</td></tr>';
    const seen = new Set(w.misconceptions.map((m) => m.id));
    const unseen = misconceptions.filter((m) => !seen.has(m.id));
    // A class with no failed attempts at all has nothing to compare with yet (review finding S6).
    $("ws-unseen").innerHTML = !w.tasks.length ? '<p class="small">No failed attempts yet.</p>' : unseen.length ?'<ul class="small">' + unseen.map((m) => "<li>" + esc(m.name) + "</li>").join("") + "</ul>"
      : '<p class="small">Every misconception has been matched at least once.</p>';

    $("ws-tasks").innerHTML = w.tasks.length ? w.tasks.map((t) =>
      "<tr><th scope=\"row\">" + taskLink(t.taskId) + '</th><td class="num">' + t.fails + '</td><td class="num">' + t.unmatched +
      '</td><td class="num">' + pct(t.unmatchedRate) + "</td><td>" + (t.hasVariants ? "Yes" : "No") + '</td><td class="num">' + (t.needsReview || "–") + "</td><td>" +
      (t.unmatched ? '<button type="button" class="secondary" data-unmatched="' + esc(t.taskId) + '">View ' + t.unmatched + "</button>" : "–") + "</td></tr>").join("")
      : '<tr><td colspan="7">No failed attempts yet.</td></tr>';

    const open = w.tasks.find((t) => t.taskId === unmatchedTask);
    $("ws-unmatched").innerHTML = !open ? "" :
      '<h4 id="unmatched-h" tabindex="-1">Unmatched attempts: ' + esc(taskLabel(open.taskId)) + "</h4>" +
      open.unmatchedAttempts.map((r) =>
        '<div class="table-wrap" style="padding:.5rem .9rem; margin-bottom:.75rem"><p class="small"><strong>' + esc(r.name) + "</strong> · " + esc(when(r.at)) + " · " +
        esc(TD.failureName(r.category)) + (r.failedTest ? " · test " + r.failedTest + (r.inputs && r.inputs.length ? " (inputs: " + esc(r.inputs.join(", ")) + ")" : "") : "") + "</p>" +
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
      // Each class counts only its own stage's units (as every average does); its other units say so.
      classes = r.classes.map((c) => ({ name: c.name + " (" + self.Curriculum.stageOf(c.stage).label + ")",
        averages: TD.scoreTable(c.data, unitIds, null, self.Curriculum.stageUnits(self.Curriculum.stageOf(c.stage).id)).unitAverages }));
    } else {
      classes = [{ name: "This browser", averages: TD.scoreTable(collect(), unitIds, null, stageUnitIds()).unitAverages }];
    }
    const used = unitIds.filter((u) => classes.some((c) => c.averages.find((a) => a.unit === u).average != null));
    // Only students who have secured the unit count in its average (an unsecured unit has no score, never 0%).
    $("compare").innerHTML = !used.length ? '<p class="small">No class has a secured unit yet.</p>' :
      '<div class="table-wrap"><table><thead><tr><th scope="col">Unit</th>' + classes.map((c) => '<th scope="col">' + esc(c.name) + "</th>").join("") + "</tr></thead><tbody>" +
      used.map((u) => '<tr><th scope="row">' + esc(unitTitle(u)) + "</th>" + classes.map((c) => {
        const a = c.averages.find((x) => x.unit === u);
        return "<td>" + (!a.counted ? '<span class="small">Not in this class\'s stage</span>' : a.average == null ? '<span class="rag rag-none">None secured yet</span>' : '<span class="rag rag-' + a.band.cls + '">' + a.average + "% · " + esc(a.band.label) + '</span> <span class="small">(' + a.students + ")</span>") + "</td>";
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
        '</td><td class="num">' + t.checks + '</td><td class="num">' + t.fails + '</td><td class="num">' + t.showHow + "</td><td>" + esc(TD.failureName(t.topCategory) || "–") +
        "</td><td>" + esc(t.topMisconception ? mName(t.topMisconception) : "–") + "</td></tr>").join("");
      const hard = s.struggled.slice(0, 3).map((t) => "<li>" + esc(taskLabel(t.taskId)) + ": " + t.stuckCount + " of " + t.triedCount + " who tried haven't passed it yet, " +
        t.fails + " failed check" + (t.fails === 1 ? "" : "s") + "</li>").join("");
      return '<section class="assignment-card task-card" aria-labelledby="as-' + esc(a.id) + '">' +
        '<h3 id="as-' + esc(a.id) + '">' + esc(a.title) + ' <span class="flag' + (a.status === "open" ? "" : " flag-alert") + '">' + (a.status === "open" ? "Open" : "Closed") + "</span></h3>" +
        (a.description ? "<p>" + esc(a.description) + "</p>" : "") +
        '<p class="small">' + a.task_ids.length + " task" + (a.task_ids.length === 1 ? "" : "s") + " · created " + esc(when(a.created_at)) + " · " + s.students + " student" + (s.students === 1 ? "" : "s") + " have tried it</p>" +
        '<ol class="assignment-tasks">' + a.task_ids.map((id) => "<li>" + taskLink(id) + "</li>").join("") + "</ol>" +
        '<p class="teacher-controls"><button type="button" class="secondary" data-as-edit="' + esc(a.id) + '">Change</button>' +
          '<button type="button" class="secondary" data-as-status="' + esc(a.id) + '" data-to="' + (a.status === "open" ? "closed" : "open") + '">' + (a.status === "open" ? "Close it" : "Open it again") + "</button>" +
          '<button type="button" class="secondary" data-as-delete="' + esc(a.id) + '">Delete</button>' +
          '<span data-as-confirm="' + esc(a.id) + '" hidden>Delete this assignment? Students will no longer see it; their work on it stays in the attempt log. ' +
          '<button type="button" class="danger" data-as-delete-yes="' + esc(a.id) + '">Yes, delete</button> ' +
          '<button type="button" class="secondary" data-as-delete-no="' + esc(a.id) + '">Cancel</button></span></p>' +
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
    // Delete asks first, on the page (no browser dialog): Delete shows "Yes, delete / Cancel"; Cancel changes nothing.
    const sel = (attr, id) => $("as-list").querySelector("[" + attr + '="' + CSS.escape(id) + '"]');
    const del = e.target.closest("button[data-as-delete]");
    const no = e.target.closest("button[data-as-delete-no]");
    const yes = e.target.closest("button[data-as-delete-yes]");
    if (del) { sel("data-as-confirm", del.dataset.asDelete).hidden = false; sel("data-as-delete-no", del.dataset.asDelete).focus(); }
    if (no) { sel("data-as-confirm", no.dataset.asDeleteNo).hidden = true; sel("data-as-delete", no.dataset.asDeleteNo).focus(); }
    if (yes) {
      const id = yes.dataset.asDeleteYes;
      yes.disabled = true;
      const r = await tb.deleteAssignment(id);
      if (r.error) { yes.disabled = false; $("as-list").insertAdjacentHTML("afterbegin", '<p class="problem" role="alert">' + esc(r.error) + "</p>"); return; }
      if (editing && editing.id === id) closeAssignmentForm(); // the form was changing the deleted assignment
      $("as-list").insertAdjacentHTML("afterbegin", '<p class="notice notice-up" role="status" tabindex="-1">The assignment has been deleted.</p>');
      const done = $("as-list").firstElementChild;
      if (done && done.focus) done.focus(); // the deleted card (and its buttons) are gone
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

  // Each export button opens a popup first (openExport): what the file contains, its first row as a sample, and a
  // Download button that downloads exactly the file(s) the button gave before. build() returns [{ name, text }] (null
  // with no class loaded).
  const EXPORTS = {
    "export-scores": { title: "Class scores (CSV)",
      text: "One row per student. It has the student's average secured score, then for each unit of the class's stage: the secured score, its label and the student's level.",
      build: () => { const data = collect(); if (!data) return null;
        return [{ name: "python-practice-class-scores-" + today() + ".csv", text: TD.classScoresCsv(TD.scoreTable(data, stageUnitIds(), null, stageUnitIds()), stageUnitIds(), unitTitle) }]; } },
    "export-full": { title: "Full attempt log (CSV)",
      text: "Everything recorded for the class, one row each: every check, skip and use of \"Show me how\", every level change, button press and placement result. The data dictionary comes with it, as a second file that explains every column. Your browser may ask you to allow two downloads.",
      build: () => { const data = collect(); if (!data) return null;
        return [{ name: "python-practice-full-data-" + today() + ".csv", text: TD.fullExportCsv(data) }, { name: "data-dictionary.csv", text: TD.dataDictionaryCsv(misconceptions) }]; } },
    "export-dictionary": { title: "Data dictionary",
      text: "Explains the full attempt log in plain English: what each column means, the values a column can have, and each misconception's name and description.",
      build: () => [{ name: "data-dictionary.csv", text: TD.dataDictionaryCsv(misconceptions) }] },
    "export-levels": { title: "Levels table (CSV)",
      text: "One row per student (the name filter on the Students page applies). For every unit: the level, the placement result, whether a level 10 task is passed, whether \"too easy\" or \"way too hard\" was used, and the fails in a row.",
      // With a name typed in the filter, the popup says so plainly (review finding B7). The file itself is unchanged.
      note: () => { const q = $("name-filter").value.trim(); return q ? "Only students whose name matches \"" + q + "\" are in this file, because of the name filter on the Students page." : ""; },
      build: () => { const data = collect(); return data ? [{ name: "python-practice-overview-" + today() + ".csv", text: levelsCsv(data) }] : null; } },
    "export-log": { title: "Detail log (CSV)",
      text: "One row per check and button press, newest first: the student, unit, task, result, the kind of mistake, any misconceptions matched, the hints used, and the test, output and code of each check.",
      build: () => { const data = collect(); return data ? [{ name: "python-practice-detail-log-" + today() + ".csv", text: detailLogCsv(data) }] : null; } },
    "export-workshop": { title: "Workshop tables (CSV)",
      text: "The two tables from the Misconceptions page: each misconception matched (attempts, students and tasks), then each task's failed attempts that matched no misconception.",
      build: () => { const data = collect(); return data ? [{ name: "python-practice-workshop-" + today() + ".csv", text: workshopCsv(data) }] : null; } },
  };

  // The first rows of a CSV text (a quoted field can hold commas, quotes and new lines).
  function csvRows(text, max) {
    const rows = [];
    let row = [], field = "", quoted = false;
    for (let i = 0; i < text.length && rows.length < max; i++) {
      const ch = text[i];
      if (quoted) { if (ch !== '"') field += ch; else if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else if (ch === '"') quoted = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(field); rows.push(row); row = []; field = ""; }
      else field += ch;
    }
    if (rows.length < max && (field || row.length)) { row.push(field); rows.push(row); }
    return rows;
  }

  // The popup: the title, what the file contains, and its first row as "column: value" pairs (the first 12 columns,
  // each value cut to 60 characters), so it fits a phone. Esc or Cancel closes it; Download makes the file(s).
  const SAMPLE_COLUMNS = 12;
  let exportFiles = null;
  function openExport(id) {
    const e = EXPORTS[id];
    const files = e.build();
    if (!files) return;
    exportFiles = files;
    const [head, first] = csvRows(files[0].text, 2);
    const cut = (v) => (v.length > 60 ? v.slice(0, 57) + "…" : v);
    $("export-dialog-h").textContent = e.title;
    const note = e.note ? e.note() : "";
    $("export-dialog-text").textContent = e.text + (note ? " " + note : "");
    $("export-dialog-sample").innerHTML = first
      ? '<thead><tr><th scope="col">Column</th><th scope="col">Sample value</th></tr></thead><tbody>' +
        head.slice(0, SAMPLE_COLUMNS).map((h, i) => '<tr><th scope="row">' + esc(h) + "</th><td>" + esc(cut(first[i] || "")) + "</td></tr>").join("") + "</tbody>"
      : '<tbody><tr><td>No rows yet. The file will have the column names only.</td></tr></tbody>';
    $("export-dialog-more").textContent = head.length > SAMPLE_COLUMNS ? "…and " + (head.length - SAMPLE_COLUMNS) + " more columns in the file." : "";
    $("export-dialog-download").textContent = files.length > 1 ? "Download both files" : "Download";
    $("export-dialog").showModal();
    $("export-dialog-download").focus();
  }
  Object.keys(EXPORTS).forEach((id) => $(id).addEventListener("click", () => openExport(id)));
  $("export-dialog-download").addEventListener("click", () => {
    const files = exportFiles || [];
    $("export-dialog").close();
    files.forEach((f, i) => setTimeout(() => download(f.name, f.text), i * 400)); // two files: a moment apart, as before
  });
  $("export-dialog-close").addEventListener("click", () => $("export-dialog").close());

  // The levels table (the old Overview's export): every unit, with the Students page's name filter applied.
  function levelsCsv(data) {
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
          [u.id + "_level"]: TD.levelShown(c), [u.id + "_placement"]: c.placementStatus === "done" ? "started at " + c.placementStart : TD.PLACEMENT_STATUS[c.placementStatus],
          [u.id + "_complete"]: c.complete ? "yes" : "no", [u.id + "_too_easy"]: c.tooEasy ? "yes" : "no", [u.id + "_too_hard"]: c.tooHard ? "yes" : "no",
          [u.id + "_fails"]: c.failsInARow,
        });
      }
      return out;
    });
    return TD.toCsv(cols, rows);
  }

  // The detail log (export only): one row per attempt and button use, newest first, with code and output.
  function detailLogCsv(data) {
    const cols = ["timestamp", "student", "unit", "task_id", "task_level", "phase", "result", "failure_category", "misconception_matches", "hints_used",
      "button", "level_change", "failed_test_number", "failed_test_inputs", "expected_output", "student_output", "student_code"].map((key) => ({ key }));
    const rows = TD.detailRows(data).map((r) => ({
      timestamp: r.at, student: r.name, unit: r.unit, task_id: r.taskId, task_level: r.level, phase: r.phase, result: r.result,
      failure_category: r.category, misconception_matches: r.misconceptions.join(";"), hints_used: r.hints, button: r.button,
      level_change: r.levelChange, failed_test_number: r.failedTest, failed_test_inputs: r.inputs ? JSON.stringify(r.inputs) : "",
      expected_output: r.expected, student_output: r.output, student_code: r.code,
    }));
    return TD.toCsv(cols, rows);
  }

  // The workshop tables: the misconception table and the per-task unmatched table (Misconceptions page).
  // needs_review: how many of the task's unmatched attempts from the last 30 days a newer rule matches (rules-review.json).
  function workshopCsv(data) {
    const w = TD.workshop(data, misconceptions, tasksById, RR.countsByTask(reviewState(data).list));
    const cols = ["section", "id", "name", "attempts_matched", "students_affected", "students", "tasks", "failure_rate_on_tasks",
      "failed_attempts", "unmatched", "unmatched_rate", "has_buggy_variants", "needs_review"].map((key) => ({ key }));
    const rows = w.misconceptions.map((m) => ({
      section: "misconception", id: m.id, name: m.name, attempts_matched: m.attempts, students_affected: m.studentCount,
      students: m.studentNames.join("; "), tasks: m.taskList.map((t) => t.taskId + " (" + t.matches + ")").join("; "), failure_rate_on_tasks: pct(m.failRate),
    })).concat(w.tasks.map((t) => ({
      section: "task", id: t.taskId, name: tasksById[t.taskId] ? tasksById[t.taskId].title : "", failed_attempts: t.fails,
      unmatched: t.unmatched, unmatched_rate: pct(t.unmatchedRate), has_buggy_variants: t.hasVariants ? "yes" : "no", needs_review: t.needsReview,
    })));
    return TD.toCsv(cols, rows);
  }

  // ---------- Curriculum (prompt 28) ----------
  // Every unit's OCR specification code (curriculum-codes.json, curriculum-codes.js), grouped by block, with a search
  // box that filters by unit name or code. Print opens curriculum-print.html: the whole table on one A4 landscape page.
  // For teachers only: students never see the codes, and no export uses them.
  let codesData = null;  // curriculum-codes.json
  let specCodes = null;  // its entries by unit (a Map)
  function renderCurriculum() {
    if (!codesData) { $("cc-status").textContent = "Loading…"; return; }
    $("cc-versions").textContent = self.CurriculumCodes.versions(codesData).join(" · ");
    const all = self.CurriculumCodes.rows(codesData, self.Curriculum);
    const shown = self.CurriculumCodes.search(all, $("cc-search").value);
    $("cc-table").innerHTML = self.CurriculumCodes.tableHtml(shown);
    $("cc-status").textContent = !shown.length ? self.CurriculumCodes.NO_MATCH + "." : shown.length === all.length ? all.length + " units." : shown.length + (shown.length === 1 ? " unit matches." : " units match.");
  }
  $("cc-search").addEventListener("input", renderCurriculum);
  $("cc-print").addEventListener("click", () => window.open("curriculum-print.html#print=1", "_blank"));

  // ---------- Class code cards (prompt 26) ----------
  // Every class the teacher is on, each with Print card, and Print all classes: class-card.html, one A4 card a class.
  // Local mode: one card for this browser, with no class code (class codes need the server).
  const cardClasses = () => (tb ? tb.classCards() : [{ name: "This browser", stage: stage(), class_code: "" }])
    .map((c) => ({ name: c.name, stage: self.Curriculum.stageOf(c.stage).label, code: c.class_code || "" }));
  function renderClassCards() {
    const list = cardClasses();
    const html = list.map((c, i) => '<li class="card-row"><span><strong>' + esc(c.name) + "</strong> · " + esc(c.stage) + " · " +
      (c.code ? '<span class="class-code">' + esc(c.code) + "</span>" : '<span class="small">no class code</span>') + "</span> " +
      '<button type="button" class="secondary" data-card="' + i + '" aria-label="' + esc("Print the card for " + c.name) + '">Print card</button></li>').join("");
    if ($("card-list").dataset.html !== html) { $("card-list").innerHTML = html || '<li class="small">No classes yet.</li>'; $("card-list").dataset.html = html; } // keeps focus
    $("cards-print-all").hidden = list.length < 2;
  }
  $("card-list").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-card]");
    if (b) window.open(self.ClassCard.url([cardClasses()[+b.dataset.card]], true), "_blank");
  });
  $("cards-print-all").addEventListener("click", () => window.open(self.ClassCard.url(cardClasses(), true), "_blank"));

  // Settings: Replay tour opens the teacher tour from the start (local mode too: the page says what needs the server).
  $("tour-replay").addEventListener("click", () => { if (self.TeacherTour) self.TeacherTour.replay(window, !!tb); });

  // ---------- Start up ----------
  window.addEventListener("hashchange", () => {
    if (tb && ["#signin", "#signup"].includes(location.hash)) return; // these belong to the sign-in screen
    render(); const h = document.querySelector("#page-" + page() + " h2"); if (h) h.focus();
  });
  if (tb) tb.start((data) => { classData = data; render(); }, () => render());
  else window.addEventListener("storage", render); // refresh if a student page in another tab saves progress
  const loadJson = (file) => fetch(file).then((r) => { if (!r.ok) throw new Error(file); return r.json(); });
  Promise.all([loadJson("tasks.json").catch(() => []), loadJson("misconceptions.json").catch(() => []), loadJson("rules-review.json").catch(() => []),
    loadJson("curriculum-codes.json").catch(() => null)]).then(([tasks, ms, rr, codes]) => {
    codesData = codes;
    specCodes = codes ? self.CurriculumCodes.byUnit(codes) : null; // without it, the Students page shows no codes
    reviewRules = Array.isArray(rr) ? rr : [];
    // Attempts logged before a task moved unit use its old id (former_ids).
    tasksById = Object.fromEntries(tasks.flatMap((t) => (t.former_ids || []).map((old) => [old, t])).concat(tasks.map((t) => [t.id, t])));
    bankTasks = tasks;
    misconceptions = ms;
    render();
  });
  render();
})();
