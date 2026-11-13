// The secured score of a unit (0-100), worked out from a student's attempts. One place for the rule, used by the
// teacher view (teacher.js, teacher-data.js) and the student view (home.js), so both always show the same number.
//   - A level 10 pass is an endless-mode pass, or a practice pass of a level 10 task, with no hints.
//   - Two level 10 passes give 100% ("secured"). Before that the unit isn't secured.
//   - The score is counted from the last level 10 pass, in full days: 100% for the first 7 days, then one step of
//     10 points for each full week (7 to 14 days 90%, 14 to 21 days 80%, 21 to 28 days 70%, 28 to 35 days 60%, then
//     50%), never below the floor.
//   - One level 10 pass brings it back to 100%. Each time the unit reaches 100% the floor goes up 10 points: it is
//     50% the first time, 60% after coming back once, and so on, to at most 100% (after five returns, so from then
//     on the unit stays at 100%). Every score is a multiple of 10, so no score is 95%.
// No DOM here: tests/features.js checks it in Node.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Secured = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const WEEK_MS = 7 * DAY_MS;
  const DROP_PER_WEEK = 10; // one step down for each full week since the last level 10 pass
  const PASSES_TO_SECURE = 2;
  const FLOOR_START = 50;
  const FLOOR_STEP = 10;
  const FLOOR_CAP = 100;

  // The freshness ramp, for a secured unit: each band has its label, so colour is never the only signal. A secured
  // unit never falls below its floor (at least 50%), so there is no red band: anything under 80% is Revisit soon.
  // A unit's score is 100, 90, 80, 70, 60 or 50; an average of several (teacher view) can fall between them.
  const BANDS = [
    { min: 100, cls: "gold", label: "Secured" },     // 100%: gold, glowing
    { min: 90, cls: "fresh", label: "Fresh" },       // 90%: light blue
    { min: 80, cls: "fading", label: "Fading" },     // 80%: blue
    { min: -Infinity, cls: "soon", label: "Revisit soon" }, // a unit's 50% to 70% (an average: anything under 80%): indigo
  ];
  const band = (score) => BANDS.find((b) => score >= b.min);

  // The level ramp, for a placed unit that isn't secured yet: 1-3 red, 4-6 amber, 7-9 green, 10 light green.
  // { cls, label: "Level 8", rag }. The teacher view (teacher-data.js) and the student's unit cards (home.js) both use it.
  function levelBand(level) {
    const l = Math.max(1, Math.min(10, Math.round(level) || 1));
    const [cls, rag] = l <= 3 ? ["lv-red", "red"] : l <= 6 ? ["lv-amber", "amber"] : l <= 9 ? ["lv-green", "green"] : ["lv-top", "green"];
    return { cls, label: "Level " + l, rag };
  }

  // An attempt record as Store.logAttempt saves it (or BackendRows.rowToAttempt makes it). "No hints" means the hints
  // field is there and is the number 0: a record with it missing, null, empty or text isn't counted. A pass after
  // "Show me how" (hintType "show-me-how", app.js attemptRecord) isn't counted either; older attempts have no hintType.
  function isTopPass(a, unit) {
    if ((a.kind || "attempt") !== "attempt" || a.result !== "pass" || a.hints !== 0 || a.hintType != null || a.unit !== unit) return false;
    const phase = a.phase || "practice";
    return phase === "endless" || (phase === "practice" && a.taskLevel === 10);
  }

  const floorFor = (times) => Math.min(FLOOR_CAP, FLOOR_START + FLOOR_STEP * (times - 1));
  // Full weeks since the pass, from full days: 0 to 6 days is 0 weeks, 7 to 13 days 1 week, and so on.
  const fullWeeks = (last, at) => Math.floor(Math.floor(Math.max(0, at - last) / DAY_MS) / 7);
  const valueAt = (last, times, at) => Math.max(floorFor(times), 100 - DROP_PER_WEEK * fullWeeks(last, at));

  // { secured, score (null until secured), passes (level 10 passes counted), timesAt100, floor, lastPass }
  function score(attempts, unit, now) {
    const at = now == null ? Date.now() : typeof now === "number" ? now : Date.parse(now);
    const passes = (attempts || []).filter((a) => isTopPass(a, unit)).map((a) => Date.parse(a.at)).filter((t) => Number.isFinite(t) && t <= at).sort((x, y) => x - y);
    let times = 0;
    let last = null;
    passes.forEach((t, i) => {
      if (i + 1 < PASSES_TO_SECURE) return;
      if (i + 1 === PASSES_TO_SECURE) { times = 1; last = t; return; }
      if (valueAt(last, times, t) < 100) times += 1; // a return to 100% (a pass while still at 100% only keeps it fresh)
      last = t;
    });
    if (!times) return { secured: false, score: null, passes: passes.length, timesAt100: 0, floor: FLOOR_START, lastPass: null };
    return { secured: true, score: valueAt(last, times, at), passes: passes.length, timesAt100: times, floor: floorFor(times), lastPass: new Date(last).toISOString() };
  }

  // A unit's colour on the student's unit card: blue "Placement to do" until the placement is done, then the level
  // ramp, then the freshness ramp once secured. u = { started, placed, level, secured, score }. Returns
  // { cls, label, ramp: "placement" | "level" | "freshness", band? } or null (not started: no colour).
  // The teacher view uses the same band and levelBand, and grey "Not placed yet" before the placement is done.
  function unitColour(u) {
    if (!u || !u.started) return null;
    if (!u.placed) return { cls: "placement", label: "Placement to do", ramp: "placement" };
    if (u.secured) { const b = band(u.score); return { cls: b.cls, label: u.score + "% · " + b.label, ramp: "freshness", band: b }; }
    const lb = levelBand(u.level);
    return { cls: lb.cls, label: lb.label, ramp: "level" };
  }

  // ---------- What the student is told (My progress) ----------
  // sec = score(...) for one unit. The date is the last level 10 pass with no hints plus 7 days: the first day the
  // score would drop to 90%. Null unless the unit is at 100% and can still drop (its floor is below 100%).
  const keepByDate = (sec) => (sec && sec.secured && sec.score >= 100 && sec.floor < 100 && sec.lastPass ? new Date(Date.parse(sec.lastPass) + WEEK_MS) : null);
  // The date as the page shows it: "Monday 16 November".
  const studentDate = (d) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  // One plain sentence or two for a unit, from its score: secured at 100%, a lower score, or not secured yet.
  function studentNote(sec, formatDate) {
    const fmt = formatDate || studentDate;
    if (!sec || !sec.secured) return "Reach level 10 and pass twice with no hints to secure this unit.";
    if (sec.score >= 100) {
      const by = keepByDate(sec);
      return by ? "Secured. Keep it at 100% by doing a level 10 pass with no hints before " + fmt(by) + "." : "Secured. It stays at 100% now.";
    }
    return "Your score is " + sec.score + "%. A level 10 pass with no hints brings it back to 100%.";
  }

  return { DAY_MS, WEEK_MS, DROP_PER_WEEK, keepByDate, studentDate, studentNote, PASSES_TO_SECURE, FLOOR_START, FLOOR_STEP, FLOOR_CAP, BANDS, band, levelBand, unitColour, isTopPass, score };
});
