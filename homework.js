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
// Exam Mode (EM3; decisions 8, 9 and 16): a section a teacher can pick, "exam-mode" in the homework's units (only when
// picked: "any unit" means the practice units). One task = one Exam Mode question answered, at any rung: each rung 1
// part, rung 2, rung 3, each rung 4 step and each full question. For each question, rung (and part or step):
//   - the first recorded attempt counts (in the homework's time);
//   - a retry counts as another task only if it scores more than every earlier attempt there (decision 9);
//   - a paste-flagged attempt never counts (it still counts as an earlier attempt, so pasting then retyping it doesn't);
//   - self-marked and "Say it simply" attempts count as tasks (those rules are the leaderboard's).
// Its task id is "exam:<question>|<rung>|<step>", its unit "exam-mode".

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Homework = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const MAX_TASKS = 200;   // a teacher can set from 1 to 200 tasks
  const MAX_UNITS = 60;
  const EXAM_SECTION = "exam-mode"; // Exam Mode, as a homework section (allowed by migration 0018's private.valid_unit_ids)

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

  // Exam Mode (EM3): whether the homework has the Exam Mode section, and the student's Exam Mode answers that count.
  // exam: their Exam Mode records ({ questionId, rung, step, at, total, pasteFlag }). -> { counted: [{ t, a }], flagged }
  const coversExam = (hw) => (hw.units || []).includes(EXAM_SECTION);
  const examTaskId = (r) => "exam:" + r.questionId + "|" + r.rung + "|" + (r.step == null ? "" : r.step);
  function examTasks(hw, exam) {
    const counted = [], flagged = [];
    if (!coversExam(hw)) return { counted, flagged };
    const groups = new Map();
    for (const r of exam || []) {
      if (!r || !r.questionId || r.recorded === false || !Number.isFinite(time(r.at))) continue;
      const k = examTaskId(r);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    for (const [taskId, list] of groups) {
      list.sort((x, y) => time(x.at) - time(y.at));
      let best = null;
      for (const r of list) {
        const t = time(r.at);
        const total = Number(r.total) || 0;
        if (inTime(hw, t)) {
          if (r.pasteFlag) flagged.push({ taskId, unit: EXAM_SECTION, at: new Date(t).toISOString() });
          else if (best === null || total > best) counted.push({ t, a: { taskId, unit: EXAM_SECTION, units: [EXAM_SECTION] } });
        }
        best = best === null ? total : Math.max(best, total);
      }
    }
    return { counted, flagged };
  }

  // attempts: the student's attempt records ({ kind, at, unit, units, taskId, result }), every one they have (so a
  // repeat pass can be told from a first one). flags: their paste flags ({ at, unit, units, taskId }). exam (EM3): their
  // Exam Mode records (examTasks above), counted only when the homework has the Exam Mode section.
  // -> { done, total, complete, taskIds (the counted tasks, in order), units (the units they were done in, in that
  //      order), flagged: [{ taskId, unit, at }] (the flagged tasks in the homework's time and units, once each) }
  function progress(hw, attempts, flags, exam) {
    const total = hw.task_count;
    const flaggedAt = {};
    for (const f of flags || []) {
      const t = time(f.at);
      if (f.taskId && Number.isFinite(t) && !(flaggedAt[f.taskId] <= t)) flaggedAt[f.taskId] = t;
    }
    const ex = examTasks(hw, exam);
    const counted = Object.values(firstPasses(attempts))
      .filter(({ t, a }) => inTime(hw, t) && coversUnits(hw, unitsOf(a)) && !(flaggedAt[a.taskId] <= t))
      .concat(ex.counted)
      .sort((x, y) => x.t - y.t)
      .slice(0, total);
    const units = [];
    for (const { a } of counted) for (const u of unitsOf(a)) if (coversUnits(hw, [u]) && !units.includes(u)) units.push(u);
    const seen = new Set();
    const flagged = (flags || []).filter((f) => f.taskId && inTime(hw, f.at) && coversUnits(hw, unitsOf(f)))
      .map((f) => ({ taskId: f.taskId, unit: f.unit, at: new Date(time(f.at)).toISOString() }))
      .concat(ex.flagged)
      .sort((x, y) => time(x.at) - time(y.at))
      .filter((f) => !seen.has(f.taskId) && seen.add(f.taskId));
    return { done: counted.length, total, complete: counted.length >= total, taskIds: counted.map((c) => c.a.taskId), units, flagged };
  }

  // The homework sets a task in these units counts for right now: not complete, not past due, covering the units.
  // list: the student's homework as student-api sends it ({ id, task_count, due_on, units, created_at, done, complete }).
  const activeFor = (list, units, now) => (list || []).filter((hw) => !hw.complete && !pastDue(hw, now) &&
    time(hw.created_at) <= (now == null ? Date.now() : time(now)) && coversUnits(hw, units));

  // A new homework from the teacher's form: { task_count, due_on, units } -> { ok, homework } or { ok: false, message }.
  // unitIds: every unit there is (a unit not in it is refused); Exam Mode's section is always allowed (EM3), last.
  function checkNew(input, practiceUnitIds, today) {
    const unitIds = (practiceUnitIds || []).filter((u) => u !== EXAM_SECTION).concat([EXAM_SECTION]);
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
  // Homework set since the student joined (prompt 26): only homework created on or after the day they joined the class
  // (UK dates), and already set by now. joinedAt: when the student joined (the server's students.created_at; in local
  // mode the browser's own record of when the student was added); none known: every homework set by now.
  const homeworkSinceJoined = (list, joinedAt, now) => (list || []).filter((hw) => time(hw.created_at) <= (now == null ? Date.now() : time(now)) &&
    (joinedAt == null || !Number.isFinite(time(joinedAt)) || ukDate(time(hw.created_at)) >= ukDate(time(joinedAt))));
  // o = { attempts (every attempt record the student has: { kind, at, taskId, result, unit, units }), flags (their paste
  //       flags), homework (their class's homework: [{ created_at, due_on, units, task_count }], or null when it isn't
  //       available, as in local mode), joinedAt (when the student joined the class), now (default now) }
  // -> { firstPassesThisWeek, averageFirstPassesPerWeek (one decimal place), averageHomeworkCompletion (a whole
  //      percentage; null when no homework has been set since they joined; undefined when homework isn't available),
  //      lastActive (ISO, or null) }
  //   - First passes: firstPasses() above, the homework rule (a repeat pass never counts).
  //   - This week: first passes in the current UK week, Monday to Sunday.
  //   - Average a week: every first pass so far, divided by the weeks from the week of the student's first attempt
  //     (any result) to this week, both counted; a week with no first pass counts as 0.
  //   - Homework: for each homework set since the student joined (homeworkSinceJoined), progress()'s "done" (the number the student's card shows,
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
      const set = homeworkSinceJoined(o.homework, o.joinedAt, now).filter((hw) => hw.task_count > 0);
      averageHomeworkCompletion = !set.length ? null : Math.round(set.map((hw) =>
        (100 * Math.min(progress(hw, o.attempts, o.flags, o.exam).done, hw.task_count)) / hw.task_count).reduce((x, y) => x + y, 0) / set.length);
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

  // "Exam Mode: Strike Zone bowling (full question)" from an Exam Mode task id; null for any other task id. titleOf(qid)
  // gives a question's title (exam-mode.json), when the caller has it.
  function examTaskName(taskId, titleOf) {
    const m = /^exam:([^|]+)\|(\d)\|(\d*)$/.exec(String(taskId || ""));
    if (!m) return null;
    const rung = +m[2];
    const where = rung === 5 ? "full question" : "rung " + rung + (m[3] ? (rung === 1 ? ", part " : ", step ") + m[3] : "");
    return "Exam Mode: " + ((titleOf && titleOf(m[1])) || m[1]) + " (" + where + ")";
  }

  return { MAX_TASKS, MAX_UNITS, EXAM_SECTION, ukDate, isDate, inTime, pastDue, coversUnits, coversExam, examTasks, examTaskName, firstPasses, progress, activeFor, checkNew, longDate, doneText,
    ukWeek, homeworkSinceJoined, progressSummary };
});
