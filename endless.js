"use strict";

// Endless mode set-up: a checkbox per unit. A unit unlocks once the student completes Level 10 in it.
Store.whenReady(function () {
  const { UNITS, levelName } = self.Curriculum;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const student = Store.currentStudent();
  if (!student) { location.replace("app.html"); return; }
  Store.setupDisplaySettings();
  $("student-name").textContent = student.name;
  const progress = Store.loadProgress(student.id);
  const ticked = (progress.endless && progress.endless.units) || [];

  function render(tasks) {
    const units = UNITS.filter((u) => tasks.some((t) => t.unit === u.id));
    $("endless-units").innerHTML = units.map((u) => {
      const s = progress.units[u.id];
      const open = !!(s && s.completedTop);
      const level = s ? "Level " + s.level + " – " + levelName(s.level, u.id) : "Not started";
      const msg = s && s.level === 10
        ? "Get 2 strong passes in a row at Level 10 in " + u.title + " to unlock."
        : "Complete Level 10 in " + u.title + " to unlock." + (s ? " You're at Level " + s.level + "." : "");
      return '<li class="' + (open ? "" : "locked") + '"><label><input type="checkbox" name="unit" value="' + u.id + '"' +
        (open ? (ticked.includes(u.id) || !ticked.length ? " checked" : "") : " disabled") +
        (open ? "" : ' aria-describedby="lock-' + u.id + '"') + "> " + esc(u.title) +
        ' <span class="small">(' + esc(level) + ")</span></label>" +
        (open ? "" : '<p class="lock-msg" id="lock-' + u.id + '">🔒 ' + esc(msg) + "</p>") + "</li>";
    }).join("");
    const anyOpen = units.some((u) => progress.units[u.id] && progress.units[u.id].completedTop);
    $("endless-start").disabled = !anyOpen;
    if (!anyOpen) $("endless-error").hidden = true;
  }

  $("endless-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const chosen = [...document.querySelectorAll('input[name="unit"]:checked')].map((c) => c.value);
    if (!chosen.length) { $("endless-error").hidden = false; return; }
    progress.endless = Object.assign({ current: null, last: {} }, progress.endless, { units: chosen });
    // Start a fresh task if the ticked units changed.
    if (progress.endless.current && JSON.stringify(ticked) !== JSON.stringify(chosen)) progress.endless.current = null;
    Store.saveProgress(student.id, progress);
    location.href = "practice.html?mode=endless&units=" + encodeURIComponent(chosen.join(","));
  });

  fetch("tasks.json")
    .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
    .then(render)
    .catch(() => { $("endless-units").innerHTML = '<li class="problem">Couldn\'t load the tasks. Open this site through a local web server (see README.md).</li>'; });
});
