// The secured score of a unit (0-100), worked out from a student's attempts. One place for the rule, used by the
// teacher view (teacher.js, teacher-data.js) and the student view (home.js), so both always show the same number.
//   - A level 10 pass is an endless-mode pass, or a practice pass of a level 10 task, with no hints.
//   - Two level 10 passes give 100% ("secured"). Before that the unit isn't secured.
//   - From 100% the score drops 5 points for each full week since the last level 10 pass, down to a floor.
//   - One level 10 pass brings it back to 100%. Each time the unit reaches 100% the floor goes up 10 points: it is
//     50% the first time, 60% after coming back once, and so on, to at most 95%.
// No DOM here: tests/features.js checks it in Node.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Secured = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const DROP_PER_WEEK = 5;
  const PASSES_TO_SECURE = 2;
  const FLOOR_START = 50;
  const FLOOR_STEP = 10;
  const FLOOR_CAP = 95;

  // The freshness ramp, for a secured unit: each band has its label, so colour is never the only signal. A secured
  // unit never falls below its floor (at least 50%), so there is no red band: anything under 80% is Revisit soon.
  const BANDS = [
    { min: 100, cls: "gold", label: "Secured" },     // gold, glowing
    { min: 95, cls: "fresh", label: "Fresh" },       // light blue
    { min: 80, cls: "fading", label: "Fading" },     // blue
    { min: -Infinity, cls: "soon", label: "Revisit soon" }, // indigo (50-75%)
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
  const valueAt = (last, times, at) => Math.max(floorFor(times), 100 - DROP_PER_WEEK * Math.floor(Math.max(0, at - last) / WEEK_MS));

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

  return { WEEK_MS, DROP_PER_WEEK, PASSES_TO_SECURE, FLOOR_START, FLOOR_STEP, FLOOR_CAP, BANDS, band, levelBand, unitColour, isTopPass, score };
});
