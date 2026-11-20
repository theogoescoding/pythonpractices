// Homework: a teacher sets a number of tasks for a class, by a due date, from some units (or any unit).
// One rule, used by the student's home page and practice page (app.js, home.js), by student-api and teacher-api
// (through supabase/functions/_shared/homework-server.js) and by the tests, so all of them always agree. No DOM here.
//
// Counting rules:
//   - Every task type counts (write, predict, trace, Parsons...), in every phase (practice, placement, endless,
//     assignment). A task counts when it is passed (record kind "attempt", result "pass").
//   - A task counts only the first time the student ever passes it. A repeat pass doesn't count again, and nor does a
//     task they had already passed before the homework was set.
//   - Only passes in the homework's time: from when it was set (created_at) to the end of its due date, as a day in
//     the UK (Europe/London). After that the homework still shows, but no new pass counts.
//   - Only passes in the homework's units (a task with two units, in endless mode, counts if either is one of them).
//     No units means any unit.
//   - A flagged task doesn't count: a pass of a task that had a large paste flagged (paste-flag.js) at or before it.
//   - "x of y done" stops at y; the homework is complete when x reaches y.
// A task is known by its task id (a bank task's id, or a template variant's "template#seed"), the same in the attempt
// records and the paste-flag events.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Homework = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const MAX_TASKS = 200;   // a teacher can set from 1 to 200 tasks
  const MAX_UNITS = 60;

  // "YYYY-MM-DD" of a moment, in the UK.
  const UK_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });
  const ukDate = (ms) => UK_DATE.format(new Date(ms));
  const time = (t) => (typeof t === "number" ? t : Date.parse(t));
  const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) &&
    new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;

  // hw = { created_at, due_on, units: [] }. Whether a moment is in the homework's time.
  const inTime = (hw, at) => { const t = time(at); return Number.isFinite(t) && t >= time(hw.created_at) && ukDate(t) <= hw.due_on; };
  // Whether the homework is past its due date (no new pass counts).
  const pastDue = (hw, now) => ukDate(now == null ? Date.now() : time(now)) > hw.due_on;
  // Whether a task in these units counts for the homework.
  const coversUnits = (hw, units) => !(hw.units || []).length || (units || []).some((u) => hw.units.includes(u));
  const unitsOf = (r) => (r.units && r.units.length ? r.units : [r.unit]);
  const isPass = (a) => (a.kind || "attempt") === "attempt" && a.result === "pass";

  // The first pass rule: the first time the student ever passed each task (any phase), from every attempt record they
  // have, so a repeat pass is never counted again. -> { taskId: { t (ms), a (that record) } }. Homework progress below
  // and the teacher's Progress summary (progressSummary) both use it.
  function firstPasses(attempts) {
    const firstPass = {};
    for (const a of attempts || []) {
      if (!isPass(a) || !a.taskId) continue;
      const t = time(a.at);
      if (Number.isFinite(t) && (!firstPass[a.taskId] || t < firstPass[a.taskId].t)) firstPass[a.taskId] = { t, a };
    }
    return firstPass;
  }

  // attempts: the student's attempt records ({ kind, at, unit, units, taskId, result }), every one they have (so a
  // repeat pass can be told from a first one). flags: their paste flags ({ at, unit, units, taskId }).
  // -> { done, total, complete, taskIds (the counted tasks, in order), units (the units they were done in, in that
  //      order), flagged: [{ taskId, unit, at }] (the flagged tasks in the homework's time and units, once each) }
  function progress(hw, attempts, flags) {
    const total = hw.task_count;
    const flaggedAt = {};
    for (const f of flags || []) {
      const t = time(f.at);
      if (f.taskId && Number.isFinite(t) && !(flaggedAt[f.taskId] <= t)) flaggedAt[f.taskId] = t;
    }
    const counted = Object.values(firstPasses(attempts))
      .filter(({ t, a }) => inTime(hw, t) && coversUnits(hw, unitsOf(a)) && !(flaggedAt[a.taskId] <= t))
      .sort((x, y) => x.t - y.t)
      .slice(0, total);
    const units = [];
    for (const { a } of counted) for (const u of unitsOf(a)) if (coversUnits(hw, [u]) && !units.includes(u)) units.push(u);
    const seen = new Set();
    const flagged = (flags || []).filter((f) => f.taskId && inTime(hw, f.at) && coversUnits(hw, unitsOf(f)))
      .sort((x, y) => time(x.at) - time(y.at))
      .filter((f) => !seen.has(f.taskId) && seen.add(f.taskId))
      .map((f) => ({ taskId: f.taskId, unit: f.unit, at: new Date(time(f.at)).toISOString() }));
    return { done: counted.length, total, complete: counted.length >= total, taskIds: counted.map((c) => c.a.taskId), units, flagged };
  }

  // The homework sets a task in these units counts for right now: not complete, not past due, covering the units.
  // list: the student's homework as student-api sends it ({ id, task_count, due_on, units, created_at, done, complete }).
  const activeFor = (list, units, now) => (list || []).filter((hw) => !hw.complete && !pastDue(hw, now) &&
    time(hw.created_at) <= (now == null ? Date.now() : time(now)) && coversUnits(hw, units));

  // A new homework from the teacher's form: { task_count, due_on, units } -> { ok, homework } or { ok: false, message }.
  // unitIds: every unit there is (a unit not in it is refused).
  function checkNew(input, unitIds, today) {
    const n = Number(input && input.task_count);
    if (!Number.isInteger(n) || n < 1 || n > MAX_TASKS) return { ok: false, problem: "count", message: "Type a whole number of tasks, from 1 to " + MAX_TASKS + "." };
    const due = input && input.due_on;
    if (!isDate(due)) return { ok: false, problem: "due", message: "Choose a due date." };
    if (today && due < today) return { ok: false, problem: "due", message: "The due date can't be in the past." };
    const units = input && input.units == null ? [] : input.units;
    if (!Array.isArray(units) || units.length > MAX_UNITS || units.some((u) => typeof u !== "string" || !unitIds.includes(u)))
      return { ok: false, problem: "units", message: "Choose units from the list, or none for any unit." };
    return { ok: true, homework: { task_count: n, due_on: due, units: unitIds.filter((u) => units.includes(u)) } };
  }

  // ---------- The teacher's Progress summary for one student (prompt 25) ----------
  // Weeks run Monday to Sunday in the UK. A week's number counts from the week of 1 January 1970 (a Thursday, so +3
  // makes Monday the first day): two moments are in the same week when their numbers match.
  const ukDayNumber = (ms) => { const [y, m, d] = ukDate(ms).split("-").map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); };
  const ukWeek = (ms) => Math.floor((ukDayNumber(ms) + 3) / 7);
  // o = { attempts (every attempt record the student has: { kind, at, taskId, result, unit, units }), flags (their paste
  //       flags), homework (their class's homework: [{ created_at, due_on, units, task_count }], or null when it isn't
  //       available, as in local mode), now (default now) }
  // -> { firstPassesThisWeek, averageFirstPassesPerWeek (one decimal place), averageHomeworkCompletion (a whole
  //      percentage; null when no homework has been set; undefined when homework isn't available), lastActive (ISO, or null) }
  //   - First passes: firstPasses() above, the homework rule (a repeat pass never counts).
  //   - This week: first passes in the current UK week, Monday to Sunday.
  //   - Average a week: every first pass so far, divided by the weeks from the week of the student's first attempt
  //     (any result) to this week, both counted; a week with no first pass counts as 0.
  //   - Homework: for each homework set (created by now), progress()'s "done" (the number the student's card shows,
  //     at most its task count) as a percentage of its task count; the average of those, rounded.
  //   - Last active: the student's most recent attempt (any result).
  function progressSummary(o) {
    const now = o.now == null ? Date.now() : time(o.now);
    const firsts = Object.values(firstPasses(o.attempts)).filter((x) => x.t <= now);
    const tries = (o.attempts || []).filter((a) => (a.kind || "attempt") === "attempt").map((a) => time(a.at)).filter((t) => Number.isFinite(t) && t <= now);
    const firstTry = tries.length ? tries.reduce((x, y) => Math.min(x, y)) : null;
    const lastTry = tries.length ? tries.reduce((x, y) => Math.max(x, y)) : null;
    const thisWeek = ukWeek(now);
    const weeks = firstTry == null ? 0 : thisWeek - ukWeek(firstTry) + 1;
    let averageHomeworkCompletion;
    if (o.homework) {
      const set = o.homework.filter((hw) => time(hw.created_at) <= now && hw.task_count > 0);
      averageHomeworkCompletion = !set.length ? null : Math.round(set.map((hw) =>
        (100 * Math.min(progress(hw, o.attempts, o.flags).done, hw.task_count)) / hw.task_count).reduce((x, y) => x + y, 0) / set.length);
    }
    return {
      firstPassesThisWeek: firsts.filter((x) => ukWeek(x.t) === thisWeek).length,
      averageFirstPassesPerWeek: weeks ? Math.round((10 * firsts.length) / weeks) / 10 : 0,
      averageHomeworkCompletion,
      lastActive: lastTry == null ? null : new Date(lastTry).toISOString(),
    };
  }

  // "Friday 20 November" from "2026-11-20", as the student's card and the teacher's list show it.
  const longDate = (ymd) => (isDate(ymd) ? new Date(ymd + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) : "");
  // "x of y done", or "Complete".
  const doneText = (hw) => (hw.complete ? "Complete" : Math.min(hw.done || 0, hw.task_count) + " of " + hw.task_count + " done");

  return { MAX_TASKS, MAX_UNITS, ukDate, isDate, inTime, pastDue, coversUnits, firstPasses, progress, activeFor, checkNew, longDate, doneText,
    ukWeek, progressSummary };
});
