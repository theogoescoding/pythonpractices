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

  // Colour bands: each has its label, so colour is never the only signal.
  const BANDS = [
    { min: 100, cls: "gold", label: "Secured" },
    { min: 95, cls: "fresh", label: "Fresh" },
    { min: 80, cls: "fading", label: "Fading" },
    { min: 50, cls: "soon", label: "Revisit soon" },
    { min: -Infinity, cls: "now", label: "Revisit now" },
  ];
  const band = (score) => BANDS.find((b) => score >= b.min);

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

  return { WEEK_MS, DROP_PER_WEEK, PASSES_TO_SECURE, FLOOR_START, FLOOR_STEP, FLOOR_CAP, BANDS, band, isTopPass, score };
});
