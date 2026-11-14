"use strict";

// Progress summary: one card per unit, and a drill-down showing each skill's status.
// progress.html#maths opens the drill-down for a unit, so the browser's Back button works.
Store.whenReady(function () {
  const { UNITS, unitById, levelName } = self.Curriculum;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const STATUS_TEXT = { secured: "Secured", "in-progress": "In progress", "not-started": "Not started" };

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
    return { s, total: mine.length, passed, percent: mine.length ? Math.round((passed / mine.length) * 100) : 0, skills, secured, sec, note: self.Secured.studentNote(sec) };
  }

  function renderOverview() {
    $("progress-cards").innerHTML = UNITS.filter((u) => tasks.some((t) => t.unit === u.id)).map((u) => {
      const x = summary(u);
      const level = x.s ? "Level " + x.s.level : "Not started";
      return '<li><button type="button" class="unit-card" data-unit="' + u.id + '" aria-label="' +
        esc(u.title + ": " + level + ", " + x.percent + "% of tasks passed, " + x.secured + " of " + u.skills.length + " skills secured. " + x.note + " Show skills.") + '">' +
        "<h3>" + esc(u.title) + "</h3>" +
        '<div class="stat-row">' +
          '<span class="stat"><strong>' + esc(level) + "</strong>" + (x.s ? esc(levelName(x.s.level, u.id)) : "&nbsp;") + "</span>" +
          '<span class="stat"><strong>' + x.percent + "%</strong>tasks passed (" + x.passed + " of " + x.total + ")</span>" +
          '<span class="stat"><strong>' + x.secured + " / " + u.skills.length + "</strong>skills secured</span>" +
        "</div>" +
        (x.s && x.s.completedTop ? '<p class="unit-meta"><span class="status status-secured">Unit completed – endless mode unlocked</span></p>' : "") +
        '<p class="score-note">' + esc(x.note) + "</p>" +
        "</button></li>";
    }).join("");
  }

  function renderDetail(u) {
    const x = summary(u);
    $("detail-h").textContent = u.title;
    $("detail-summary").textContent = (x.s ? "Level " + x.s.level + " (" + levelName(x.s.level, u.id) + ")" : "Not started yet") +
      " · " + x.percent + "% of tasks passed · " + x.secured + " of " + u.skills.length + " skills secured. " + x.note;
    $("skill-list").innerHTML = x.skills.map(({ skill, state }) => {
      const status = skillStatus(state);
      const detail = state && state.attempts ? state.passes + " passed of " + state.attempts + " tried" : "";
      return "<li><span><strong>" + esc(skill) + "</strong>" + (detail ? ' <span class="small">' + esc(detail) + "</span>" : "") + "</span>" +
        '<span class="status status-' + status + '">' + STATUS_TEXT[status] + "</span></li>";
    }).join("");
    $("practise-link").href = "practice.html?unit=" + encodeURIComponent(u.id);
    // A unit with sections (Validation): the same section links as on its home card, from the start (before the
    // placement too).
    const sections = u.sections || [];
    $("section-box").hidden = !sections.length;
    $("section-links").innerHTML = sections.map((sec) => '<li><a class="section-link" href="practice.html?unit=' + encodeURIComponent(u.id) +
      "&amp;section=" + encodeURIComponent(sec.name) + '" title="' + esc(sec.description) + '">' + esc(sec.title) + "</a></li>").join("");
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
