// Converts between the records store.js keeps and the backend's table rows (backend mode).
// Rows use the tables' column names, which are the full export's. Going to a row and back gives a record that
// exports exactly as the original did (tests/features.js checks this). No DOM, so it's tested in Node.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BackendRows = factory();
})(typeof self !== "undefined" ? self : this, function () {

  const orNull = (v) => (v === undefined ? null : v);
  const iso = (t) => new Date(t).toISOString(); // the database gives +00:00 times; the app keeps ...Z
  const newRecordId = (prefix) => prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  const recordType = (a) => (a.kind === "skip" ? "skip" : a.kind === "hint" ? "hint" : "attempt");

  // ---------- Attempts (Store.logAttempt records) ----------
  function attemptToRow(a) {
    const type = recordType(a);
    const row = {
      record_id: a.id, record_type: type, timestamp: a.at, unit: a.unit, task_units: orNull(a.units),
      task_id: a.taskId, template_id: orNull(a.templateId), phase: orNull(a.phase), task_type: orNull(a.taskType),
      task_level: orNull(a.taskLevel), student_level_before: orNull(a.levelBefore), student_level_after: orNull(a.levelAfter),
      attempt_number: orNull(a.attemptNumber), result: type === "hint" ? a.hintType || "hint" : a.result,
      failure_category: orNull(a.category), failure_details: orNull(a.details), misconception_matches: a.misconceptions || [],
      hints_used: orNull(a.hints), hint_type: orNull(a.hintType), variant_fingerprint: orNull(a.fingerprint),
      failed_test_number: orNull(a.failedTest), failed_test_inputs: orNull(a.inputs),
      expected_output: a.expected == null ? null : String(a.expected), student_output: orNull(a.output),
      student_error_type: orNull(a.errorType), student_error_kind: orNull(a.errorKind), student_code: orNull(a.code),
    };
    // Only assignment rows carry assignment_id, so every other row is exactly what a server without migration 0005
    // accepts (it would refuse a row with a column it doesn't know).
    if (a.assignmentId) row.assignment_id = a.assignmentId;
    return row;
  }

  // The record as app.js attemptRecord makes it: failure fields only on a failed attempt (one with a category).
  function rowToAttempt(r, studentId) {
    const kind = r.record_type === "skip" ? "skip" : r.record_type === "hint" ? "hint" : "attempt";
    const a = {
      id: r.record_id, at: iso(r.timestamp), studentId, kind, unit: r.unit, units: r.task_units || [r.unit], taskId: r.task_id,
      templateId: r.template_id, phase: r.phase, taskType: r.task_type, taskLevel: r.task_level, attemptNumber: r.attempt_number,
      result: r.result, hints: r.hints_used, levelBefore: r.student_level_before, levelAfter: r.student_level_after,
    };
    if (r.variant_fingerprint != null) a.fingerprint = r.variant_fingerprint;
    // A hint row's type, or "show-me-how" on an attempt made after "Show me how" (older attempt rows have none).
    if (kind === "hint" || r.hint_type != null) a.hintType = r.hint_type;
    if (r.assignment_id != null) a.assignmentId = r.assignment_id;
    if (r.failure_category != null) {
      Object.assign(a, {
        category: r.failure_category, details: r.failure_details, misconceptions: r.misconception_matches || [],
        code: r.student_code == null ? "" : r.student_code, failedTest: r.failed_test_number, inputs: r.failed_test_inputs,
        expected: r.expected_output, output: r.student_output, errorType: r.student_error_type, errorKind: r.student_error_kind,
      });
    }
    return a;
  }

  // ---------- Events (level log, button log and placement log entries) ----------
  // Level changes have no id in store.js; a new one is given when the row is made (the export numbers them itself).
  function levelToRow(e, recordId) {
    return {
      record_id: recordId || newRecordId("l"), record_type: "level_change", timestamp: e.at, unit: e.unit,
      task_id: orNull(e.taskId), student_level_before: orNull(e.from), student_level_after: e.to, level_change_reason: e.reason,
    };
  }
  const buttonToRow = (b) => ({
    record_id: b.id, record_type: "button_use", timestamp: b.at, unit: b.unit, task_id: orNull(b.taskId),
    student_level_before: orNull(b.from), student_level_after: orNull(b.to), button: b.button,
  });
  const placementToRow = (p) => p.kind === "reset"
    ? { record_id: p.id, record_type: "placement_reset", timestamp: p.at, unit: p.unit }
    : { record_id: p.id, record_type: "placement_result", timestamp: p.at, unit: p.unit,
        placement_start_level: orNull(p.startLevel), placement_results: orNull(p.results) };

  // -> { log: "level" | "button" | "placement", entry } with the entry as store.js keeps it.
  function rowToEvent(r, studentId) {
    const at = iso(r.timestamp);
    switch (r.record_type) {
      case "level_change": {
        const entry = { at, studentId, unit: r.unit, from: r.student_level_before, to: r.student_level_after, reason: r.level_change_reason };
        if (r.task_id != null) entry.taskId = r.task_id;
        return { log: "level", entry };
      }
      case "button_use":
        return { log: "button", entry: { id: r.record_id, at, studentId, unit: r.unit, taskId: r.task_id, button: r.button,
          from: r.student_level_before, to: r.student_level_after } };
      case "placement_result":
        return { log: "placement", entry: { id: r.record_id, at, studentId, unit: r.unit, kind: "result",
          results: r.placement_results, startLevel: r.placement_start_level } };
      case "placement_reset":
        return { log: "placement", entry: { id: r.record_id, at, studentId, unit: r.unit, kind: "reset", by: "teacher" } };
      default:
        return null;
    }
  }

  // ---------- Progress ----------
  // A student's saved progress ({ units, endless, ... }) as one row per unit, and back.
  function progressToRows(progress) {
    const rows = Object.entries((progress && progress.units) || {}).map(([unit, state]) => ({ unit, state }));
    if (progress && progress.endless) rows.push({ unit: "endless", state: progress.endless });
    return rows;
  }
  function rowsToProgress(rows) {
    const progress = { units: {} };
    for (const r of rows || []) {
      if (r.unit === "endless") progress.endless = r.state;
      else progress.units[r.unit] = r.state;
    }
    return progress;
  }

  // ---------- Teacher view ----------
  // The data object TeacherData.collect makes in local mode, built from rows read through the API:
  // students [{ id, nickname, created_at }], progress [{ student_id, unit, state }], attempts and events (with student_id).
  // Records are in the order the app wrote them (time, then the order they arrived), as the local logs are.
  function teacherData(rows, units) {
    const byTime = (x, y) => (Date.parse(x.timestamp) - Date.parse(y.timestamp)) || ((x.id || 0) - (y.id || 0));
    const students = {};
    const progress = {};
    for (const s of rows.students) { students[s.id] = { name: s.nickname, created: s.created_at }; progress[s.id] = { units: {} }; }
    for (const p of rows.progress) {
      const mine = progress[p.student_id];
      if (!mine) continue;
      if (p.unit === "endless") mine.endless = p.state;
      else mine.units[p.unit] = p.state;
    }
    const attempts = [];
    for (const s of rows.students) {
      rows.attempts.filter((a) => a.student_id === s.id).sort(byTime).forEach((a) => attempts.push(rowToAttempt(a, s.id)));
    }
    const levelLog = [], buttonLog = [], placementLog = [];
    const logs = { level: levelLog, button: buttonLog, placement: placementLog };
    for (const e of rows.events.slice().sort(byTime)) {
      const ev = rowToEvent(e, e.student_id);
      if (ev) logs[ev.log].push(ev.entry);
    }
    return { students, progress, attempts, levelLog, buttonLog, placementLog, units };
  }

  return { attemptToRow, rowToAttempt, levelToRow, buttonToRow, placementToRow, rowToEvent, progressToRows, rowsToProgress,
    teacherData, newRecordId };
});
