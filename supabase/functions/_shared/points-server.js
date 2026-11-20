// Points and leaderboards on the server (student-api leaderboard, teacher-api leaderboards and leaderboards_all).
// The rule is the site's own: secured.js (Secured.studentPoints, Secured.boards) with the units from curriculum.js, so
// the server and the pages can't disagree. A plain script, like homework-server.js, so the Deno functions (through
// points.ts) and the Node tests (tests/backend-client.js) run the same code. Every function takes the database
// client (the service role, or a fake in the tests) and deps = { Secured, Curriculum }.
// Everything is worked out from rows the server already keeps (attempts, events, progress): nothing new is stored.
//   - secured and level points: as before (at most 300 a unit, the 14-day gain unchanged);
//   - the re-secure bonus (prompt 23): 10 points each time a unit comes back to 100%, at most 50 a unit;
//   - programme points (prompt 23): each level 10 write task's first pass in endless mode, 50 less 10 a hint
//     ("Show me how" counts as one), at least 10.
// Only nicknames, class names, the totals and percentages ever leave this file: no student id (outside the server),
// unit detail, attempt, code, PIN or login code.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PointsServer = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const PAGE = 1000;

  function data(r, what) {
    if (r.error) throw new Error(what + ": " + (r.error.code || "") + " " + r.error.message);
    return r.data;
  }
  // Every row of a table for these students, a page at a time (the API returns at most 1000 rows per request).
  async function rowsFor(sb, table, columns, ids, narrow) {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      const page = data(await narrow(sb.from(table).select(columns).in("student_id", ids)).order("id").range(from, from + PAGE - 1), "read " + table);
      out.push(...page);
      if (page.length < PAGE) return out;
    }
  }
  const pointUnits = (deps) => deps.Curriculum.UNITS.map((u) => ({ id: u.id, placement: deps.Curriculum.hasPlacement(u.id) }));

  // Each student of a class with their points:
  // [{ id, nickname, secured, level, programme, programmes, bonus, combined, total (= combined, the Most points board),
  //    gain (secured + level over 14 days, as before), unitCount }]. The id stays on the server (see the boards below).
  async function classPoints(sb, deps, classId, now) {
    const at = now == null ? Date.now() : now;
    const units = pointUnits(deps);
    const noPlacement = units.filter((u) => !u.placement).map((u) => u.id);
    const students = data(await sb.from("students").select("id, nickname").eq("class_id", classId), "students");
    if (!students.length) return [];
    const ids = students.map((s) => s.id);
    // The saved level and placement of each unit (generated columns: not the whole saved state).
    const progress = [];
    for (let from = 0; ; from += PAGE) {
      const page = data(await sb.from("progress").select("student_id, unit, level, placement").in("student_id", ids).neq("unit", "endless")
        .order("student_id").order("unit").range(from, from + PAGE - 1), "read progress");
      progress.push(...page);
      if (page.length < PAGE) break;
    }
    const COLUMNS = "id, student_id, unit, timestamp, phase, task_level, task_type, task_id, variant_fingerprint, hints_used, hint_type, result, record_type";
    // The passes that can count towards a secured score (Secured.isTopPass checks the rest: the phase and level) ...
    const topPasses = await rowsFor(sb, "attempts", COLUMNS, ids, (q) => q.eq("record_type", "attempt").eq("result", "pass").eq("hints_used", 0).is("hint_type", null));
    // ... and every level 10 pass in endless mode, with its hints (programme points; Secured.isProgrammePass checks the type).
    const endlessPasses = await rowsFor(sb, "attempts", COLUMNS, ids, (q) => q.eq("record_type", "attempt").eq("result", "pass").eq("phase", "endless").eq("task_level", 10));
    const seen = new Set();
    const passes = topPasses.concat(endlessPasses).filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))); // a row in both lists counts once
    const events = await rowsFor(sb, "events", "student_id, unit, record_type, timestamp, student_level_after, placement_start_level", ids,
      (q) => q.in("record_type", ["level_change", "placement_result", "placement_reset"]));
    // A unit with no placement test is placed from the student's first record in it.
    const firsts = noPlacement.length ? await rowsFor(sb, "attempts", "student_id, unit, timestamp", ids, (q) => q.in("unit", noPlacement)) : [];

    return students.map((s) => {
      const current = {};
      for (const p of progress) if (p.student_id === s.id) current[p.unit] = { level: p.level, placement: p.placement };
      const attempts = passes.filter((a) => a.student_id === s.id).map((a) => ({
        kind: a.record_type, unit: a.unit, at: a.timestamp, result: a.result, hints: a.hints_used, hintType: a.hint_type == null ? undefined : a.hint_type,
        phase: a.phase, taskLevel: a.task_level, taskType: a.task_type, taskId: a.task_id, fingerprint: a.variant_fingerprint == null ? undefined : a.variant_fingerprint,
      }));
      const mine = events.filter((e) => e.student_id === s.id);
      const started = {};
      const earliest = (unit, t) => { if (!started[unit] || Date.parse(t) < Date.parse(started[unit])) started[unit] = t; };
      for (const a of firsts) if (a.student_id === s.id) earliest(a.unit, a.timestamp);
      for (const e of mine) if (noPlacement.includes(e.unit)) earliest(e.unit, e.timestamp);
      const history = {
        levels: mine.filter((e) => e.record_type === "level_change").map((e) => ({ unit: e.unit, at: e.timestamp, to: e.student_level_after })),
        placements: mine.filter((e) => e.record_type !== "level_change").map((e) => ({ unit: e.unit, at: e.timestamp, kind: e.record_type === "placement_reset" ? "reset" : "result", startLevel: e.placement_start_level })),
        started,
      };
      const p = deps.Secured.studentPoints({ units, current, attempts, history, now: at });
      return { id: s.id, nickname: s.nickname, secured: p.secured, level: p.level, programme: p.programme, programmes: p.programmes, bonus: p.bonus,
        combined: p.combined, total: p.combined, gain: p.gain, unitCount: units.length };
    });
  }

  // The most possible for the "630 of 12,000" display: 300 a unit (secured + level). Programme points and the
  // re-secure bonus come on top of it, so a combined total can go past it.
  const maxFor = (deps) => deps.Secured.UNIT_POINTS_MAX * deps.Curriculum.UNITS.length;
  const totals = (s) => ({ secured: s.secured, level: s.level, programme: s.programme, bonus: s.bonus });

  // student-api: the student's own class's two boards. Each row has only the nickname, the combined points, the
  // percentage and whether it is the student's own (other students' separate totals aren't sent); "me" has the
  // student's own separate totals, programme count and gain.
  function studentBoard(all, sid, deps) {
    const me = all.find((s) => s.id === sid);
    const b = deps.Secured.boards(all.map((s) => ({ nickname: s.nickname, total: s.combined, gain: s.gain, unitCount: s.unitCount, me: s.id === sid })), false);
    return { boards: b, me: me ? Object.assign(totals(me), { programmes: me.programmes, total: me.combined, gain: me.gain }) : null, max: maxFor(deps) };
  }
  // teacher-api leaderboards: one class, ranked by the combined points. Each row: nickname, the four totals, the
  // combined points and the percentage.
  function classBoard(all, deps) {
    return { boards: deps.Secured.boards(all.map((s) => Object.assign({ nickname: s.nickname, total: s.combined, gain: s.gain, unitCount: s.unitCount }, totals(s))), false), max: maxFor(deps) };
  }
  // teacher-api leaderboards_all: every class the teacher is on ([{ name, students: classPoints(...) }]), ranked by
  // the percentage: combined points / (300 x units) x 100.
  function allClassesBoard(classes, deps) {
    const rows = [];
    for (const c of classes) for (const s of c.students) rows.push(Object.assign({ nickname: s.nickname, class_name: c.name, total: s.combined, gain: s.gain, unitCount: s.unitCount }, totals(s)));
    return { boards: deps.Secured.boards(rows, true), classes: classes.length, max: maxFor(deps) };
  }

  return { classPoints, studentBoard, classBoard, allClassesBoard, maxFor };
});
