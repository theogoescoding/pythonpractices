"use strict";

// Progress summary: one card per unit, and a drill-down showing each skill's status.
// progress.html#maths opens the drill-down for a unit, so the browser's Back button works.
Store.whenReady(function () {
  const { UNITS, unitById, levelName } = self.Curriculum;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const STATUS_TEXT = { secured: "Mastered", "in-progress": "In progress", "not-started": "Not started" };

  const student = Store.currentStudent();
  if (!student) { location.replace("app.html"); return; }
  Store.setupDisplaySettings();
  $("student-name").textContent = student.name;
  $("secured-rule").textContent = SECURED_PASSES_IN_A_ROW + " tasks in a row that use it, with " +
    (SECURED_MAX_HINTS === 0 ? "no hints" : SECURED_MAX_HINTS + " hint or fewer") + " each time";

  let tasks = [];
  let progress = null;
  const attempts = Store.attempts(student.id); // for each unit's score (secured.js, the same as the unit cards)

  function summary(u) {
    const s = progress.units[u.id];
    // Practice (bank) tasks only: placement tasks aren't counted.
    const mine = tasks.filter((t) => t.unit === u.id && !isPlacementTask(t));
    const passed = s ? mine.filter((t) => hasPassed(s, t.id)).length : 0;
    const skills = u.skills.map((sk) => ({ skill: sk, state: s && s.skills ? s.skills[sk] : null }));
    const secured = skills.filter((x) => skillStatus(x.state) === "secured").length;
    // The unit's score and what it means for the student (secured.js): placed units only, as on the unit cards.
    const sec = s && !needsPlacement(s) ? self.Secured.score(attempts, u.id) : { secured: false };
    // Stars (prompt 23): one each time the unit came back to 100%, on a placed unit only (as on the unit cards).
    const placed = !!s && !needsPlacement(s);
    return { s, total: mine.length, passed, percent: mine.length ? Math.round((passed / mine.length) * 100) : 0, skills, secured, sec, note: self.Secured.studentNote(sec),
      placed, stars: self.Secured.stars(sec) };
  }

  function renderOverview() {
    // Endless mode's programmes (prompt 23): the first pass of each level 10 writing task, from this student's attempts.
    $("programmes-count").textContent = self.Secured.programmesText(self.Secured.programmes(attempts).count) + " in endless mode.";
    // The old Validation unit only once the student has started it (Curriculum.studentSeesUnit), as on the home page.
    $("progress-cards").innerHTML = UNITS.filter((u) => tasks.some((t) => t.unit === u.id) && self.Curriculum.studentSeesUnit(u.id, progress, attempts)).map((u) => {
      const x = summary(u);
      // "Placement to do" while the quick check isn't finished, never a level (secured.js levelText).
      const toDo = self.Secured.placementToDo(x.s);
      const level = self.Secured.levelText(x.s) || "Not started";
      return '<li><button type="button" class="unit-card" data-unit="' + u.id + '" aria-label="' +
        esc(self.Curriculum.studentUnitTitle(u.id) + ": " + level + ", " + x.percent + "% of tasks passed, " + x.secured + " of " + u.skills.length + " skills mastered. " + (x.placed ? self.Secured.starsText(x.stars) + ". " : "") + x.note + " Show skills.") + '">' +
        "<h3>" + esc(self.Curriculum.studentUnitTitle(u.id)) + "</h3>" +
        '<div class="stat-row">' +
          '<span class="stat"><strong>' + esc(level) + "</strong>" + (x.s && !toDo ? esc(levelName(x.s.level, u.id)) : "&nbsp;") + "</span>" +
          '<span class="stat"><strong>' + x.percent + "%</strong>tasks passed (" + x.passed + " of " + x.total + ")</span>" +
          '<span class="stat"><strong>' + x.secured + " / " + u.skills.length + "</strong>skills mastered</span>" +
        "</div>" +
        (x.s && x.s.completedTop ? '<p class="unit-meta"><span class="status status-secured">Unit completed – endless mode unlocked</span></p>' : "") +
        (x.placed ? '<p class="unit-stars-row">' + self.Secured.starsHtml(x.stars) + "</p>" : "") +
        '<p class="score-note">' + esc(x.note) + "</p>" +
        "</button></li>";
    }).join("");
  }

  function renderDetail(u) {
    const x = summary(u);
    $("detail-h").textContent = self.Curriculum.studentUnitTitle(u.id);
    $("detail-summary").textContent = (!x.s ? "Not started yet" : self.Secured.placementToDo(x.s) ? self.Secured.PLACEMENT_TO_DO : "Level " + x.s.level + " (" + levelName(x.s.level, u.id) + ")") +
      " · " + x.percent + "% of tasks passed · " + x.secured + " of " + u.skills.length + " skills mastered. " + x.note;
    $("skill-list").innerHTML = x.skills.map(({ skill, state }) => {
      const status = skillStatus(state);
      const detail = state && state.attempts ? state.passes + " passed of " + state.attempts + " tried" : "";
      return "<li><span><strong>" + esc(skill) + "</strong>" + (detail ? ' <span class="small">' + esc(detail) + "</span>" : "") + "</span>" +
        '<span class="status status-' + status + '">' + STATUS_TEXT[status] + "</span></li>";
    }).join("");
    $("practise-link").href = "practice.html?unit=" + encodeURIComponent(u.id);
  }

  function route() {
    const u = unitById(location.hash.slice(1));
    $("overview").hidden = !!u;
    $("detail").hidden = !u;
    if (u) { renderDetail(u); $("detail-h").focus(); } else renderOverview();
  }

  $("progress-cards").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-unit]");
    if (b) location.hash = b.dataset.unit;
  });
  $("back-link").addEventListener("click", (e) => { e.preventDefault(); location.hash = ""; });
  window.addEventListener("hashchange", route);

  fetch("tasks.json")
    .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
    .then((data) => {
      tasks = data;
      progress = Store.loadProgress(student.id);
      // Brought up to date for display only; the practice page saves the full update.
      migrateProgress(progress, { tasks, attempts: Store.attempts(student.id) });
      const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
      ensureSkillStates(progress, (id) => byId[id]);
      route();
    })
    .catch(() => { $("progress-cards").innerHTML = '<li class="problem">Couldn\'t load the tasks. Open this site through a local web server (see README.md).</li>'; });
});
