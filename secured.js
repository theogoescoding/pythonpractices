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

  // ---------- Points and leaderboards (added 2026-11; the rules above are unchanged) ----------
  // One rule, used by the student and teacher pages and by the server (student-api and teacher-api load this file).
  // A unit is worth up to UNIT_POINTS_MAX (300) points:
  //   - secured points, up to 200: 2 for each percent of the unit's secured score (score() above), so 100% is 200 and
  //     50% is 100. A secured unit never counts under 100 points (its score never falls under 50%, the first floor;
  //     anything under 50% would count as 50%). A unit that isn't secured, or isn't placed, has no secured points.
  //   - level points, up to 100: 10 for each level of a placed unit, so level 10 is 100. Not started, or its
  //     placement not done yet: 0.
  // A student's total is the sum over every unit (whatever the class's stage, as on the teacher's Students page).
  const SECURED_POINTS_PER_PERCENT = 2;
  const LEVEL_POINTS_PER_LEVEL = 10;
  const UNIT_POINTS_MAX = 300;
  const IMPROVING_DAYS = 14;
  const securedPoints = (sec) => (sec && sec.secured && sec.score != null ? SECURED_POINTS_PER_PERCENT * Math.min(100, Math.max(FLOOR_START, sec.score)) : 0);
  const levelPoints = (level, placed) => (placed && Number.isFinite(level) && level >= 1 ? LEVEL_POINTS_PER_LEVEL * Math.min(10, Math.round(level)) : 0);
  const unitPoints = (sec, level, placed) => { const s = securedPoints(sec), l = levelPoints(level, placed); return { secured: s, level: l, total: s + l }; };
  // A unit's saved state (the app's, or the server's progress row: { level, placement }) is placed unless its
  // placement test is still to do (pending or in progress). A unit with no placement record counts as placed.
  const placedNow = (state) => !!state && !(state.placement && ["pending", "in-progress"].includes(state.placement.status));

  // A unit's placed level at time `at` (ms), from the history: placements [{ unit, at, kind: "result" | "reset",
  // startLevel }] and level changes [{ unit, at, to }]. A unit with a placement test is placed from its last placement
  // result (a teacher's reset undoes it), at the start level until a later level change. A unit with no placement test
  // (hasPlacement false) is placed from history.started[unit] (its first record), at level 1 until a level change.
  function levelAt(unit, hasPlacement, history, at) {
    const upTo = (list) => (list || []).filter((e) => e.unit === unit && Date.parse(e.at) <= at).sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
    const changes = upTo(history.levels);
    const lastChange = changes[changes.length - 1];
    if (hasPlacement) {
      const pl = upTo(history.placements);
      const lastPl = pl[pl.length - 1];
      if (!lastPl || lastPl.kind !== "result") return { placed: false, level: null };
      return { placed: true, level: lastChange && Date.parse(lastChange.at) >= Date.parse(lastPl.at) ? lastChange.to : lastPl.startLevel };
    }
    if (lastChange) return { placed: true, level: lastChange.to };
    const started = (history.started || {})[unit];
    return started && Date.parse(started) <= at ? { placed: true, level: 1 } : { placed: false, level: null };
  }

  // A student's points now and IMPROVING_DAYS (14) days ago, and the gain.
  //   now: the saved state of each unit (current[unit] = its state, or the server's { level, placement }) and the
  //        secured score now;
  //   14 days ago: the level from the history (levelAt) and the secured score at that moment (score() with that time,
  //        so valueAt and fullWeeks count the weeks from the last pass to then).
  // o = { units: [{ id, placement (has a placement test) }], current, attempts (the app's records: unit, at, kind,
  //       result, hints, hintType, phase, taskLevel), history: { levels, placements, started }, now (ms, default now) }
  // -> { secured, level, total, units: { id: { secured, level, total } }, before: { secured, level, total }, gain }
  function studentPoints(o) {
    const now = o.now == null ? Date.now() : o.now;
    const then = now - IMPROVING_DAYS * DAY_MS;
    const out = { secured: 0, level: 0, total: 0, units: {}, before: { secured: 0, level: 0, total: 0 }, gain: 0 };
    for (const u of o.units) {
      const state = (o.current || {})[u.id];
      // A unit counts only while placed (as on the teacher's Students page: a reset placement shows no secured score).
      const placed = placedNow(state);
      const p = unitPoints(placed ? score(o.attempts, u.id, now) : null, state ? state.level : null, placed);
      const past = levelAt(u.id, u.placement, o.history || {}, then);
      const b = unitPoints(past.placed ? score(o.attempts, u.id, then) : null, past.level, past.placed);
      out.units[u.id] = p;
      for (const k of ["secured", "level", "total"]) { out[k] += p[k]; out.before[k] += b[k]; }
    }
    out.gain = out.total - out.before.total;
    return out;
  }

  // The most a student can have over unitCount units, and points as a percentage of it (one decimal place), so
  // students seeing different numbers of units can be compared: points / (300 x units) x 100.
  const maxPoints = (unitCount) => UNIT_POINTS_MAX * unitCount;
  const normalised = (points, unitCount) => (unitCount ? Math.round((1000 * points) / maxPoints(unitCount)) / 10 : 0);
  // Rows ranked on `key`, highest first; ties share a rank (1, 1, 3) and are listed by nickname.
  function ranked(rows, key) {
    const sorted = rows.slice().sort((x, y) => y[key] - x[key] || String(x.nickname).localeCompare(String(y.nickname)));
    return sorted.map((r) => Object.assign({}, r, { rank: 1 + sorted.filter((x) => x[key] > r[key]).length }));
  }
  // The two boards from each student's { nickname, total, gain, unitCount, ...extra } (extra: me, className):
  //   overall:   ranked by total points; improving: ranked by the gain over the last 14 days.
  //   by "points" within one class (byPercent false), or by the normalised percentage across classes (byPercent true).
  // Each row: { rank, nickname, points, percent, ...extra } and nothing else.
  function boards(students, byPercent) {
    const board = (field) => {
      const rows = students.map((s) => {
        const extra = Object.assign({}, s);
        for (const k of ["total", "gain", "unitCount", "nickname"]) delete extra[k];
        return Object.assign({ nickname: s.nickname, points: s[field], percent: normalised(s[field], s.unitCount) }, extra);
      });
      return ranked(rows, byPercent ? "percent" : "points").map((r) => Object.assign({ rank: r.rank }, r));
    };
    return { overall: board("total"), improving: board("gain") };
  }

  return { DAY_MS, WEEK_MS, DROP_PER_WEEK, keepByDate, studentDate, studentNote, PASSES_TO_SECURE, FLOOR_START, FLOOR_STEP, FLOOR_CAP, BANDS, band, levelBand, unitColour, isTopPass, score,
    SECURED_POINTS_PER_PERCENT, LEVEL_POINTS_PER_LEVEL, UNIT_POINTS_MAX, IMPROVING_DAYS, securedPoints, levelPoints, unitPoints, placedNow, levelAt, studentPoints,
    maxPoints, normalised, ranked, boards };
});
