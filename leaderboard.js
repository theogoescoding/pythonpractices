"use strict";

// The student's class leaderboards (leaderboard.html): backend mode only. The boards come from student-api
// leaderboard, worked out on the server with the points rule in secured.js. Only nicknames and points are shown.
Store.whenReady(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const backend = self.Backend && self.Backend.enabled ? self.Backend : null;
  const student = Store.currentStudent();
  Store.setupDisplaySettings();
  if (!backend || !student) { location.replace("app.html"); return; }
  $("student-name").textContent = student.name;

  const plus = (n) => (n > 0 ? "+" + n : String(n));
  // A total as "630 of 12,000" (review finding T2): points out of the most possible. Display only.
  const thousands = (n) => Number(n).toLocaleString("en-GB");
  let max = 0;
  const total = (n) => (max ? thousands(n) + " of " + thousands(max) : thousands(n));

  // One board as a table: place, nickname, points. The student's own row is highlighted and says "(you)".
  function table(rows, field, caption) {
    if (!rows.length) return '<p class="small">No one in your class yet.</p>';
    return '<table class="board-table" aria-label="' + esc(caption) + '">' +
      '<thead><tr><th scope="col" class="num">Place</th><th scope="col">Nickname</th><th scope="col" class="num">' + esc(field) + "</th></tr></thead><tbody>" +
      rows.map((r) => '<tr' + (r.me ? ' class="board-me"' : "") + '><td class="num">' + r.rank + "</td><td>" + esc(r.nickname) +
        (r.me ? " <span class=\"small\">(you)</span>" : "") + '</td><td class="num">' + (field === "Points gained" ? plus(r.points) : total(r.points)) + "</td></tr>").join("") +
      "</tbody></table>";
  }

  backend.leaderboard().then((r) => {
    if (r.status !== 200) {
      $("lb-status").textContent = r.body.error || "Couldn't load the leaderboard. Please try again.";
      $("lb-status").classList.remove("loading");
      return;
    }
    const b = r.body.boards || { overall: [], improving: [] };
    const me = r.body.me || { secured: 0, level: 0, total: 0, gain: 0 };
    max = r.body.max || 0;
    $("me-total").textContent = total(me.total);
    $("me-secured").textContent = me.secured;
    $("me-level").textContent = me.level;
    $("me-gain").textContent = plus(me.gain);
    $("board-overall").innerHTML = table(b.overall, "Points", "Most points");
    $("board-improving").innerHTML = table(b.improving, "Points gained", "Most improved in the last 14 days");
    $("lb-status").hidden = true;
    $("lb-body").hidden = false;
  });
});
