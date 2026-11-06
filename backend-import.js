// Importing a full export (python-practice-full-data-*.csv, made in local mode) into a class (backend section 8).
// Reads the CSV, renames moved tasks (former_ids), rebuilds what it can of each student's progress, and gives the
// rows teacher-api import_data takes. Nicknames are only trimmed: the teacher renames any that are flagged.
// No DOM, so it's tested in Node (tests/features.js).

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BackendImport = factory();
})(typeof self !== "undefined" ? self : this, function () {

  const ATTEMPT_TYPES = ["attempt", "skip", "hint"];
  const EVENT_TYPES = ["level_change", "button_use", "placement_result", "placement_reset"];

  // A CSV reader for the export (quoted fields, "" escapes, CRLF, a BOM at the start).
  function parseCsv(text) {
    text = String(text).replace(/^﻿/, "");
    const rows = [];
    let row = [], field = "", i = 0, quoted = false;
    while (i < text.length) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
        if (ch === '"') { quoted = false; i++; continue; }
        field += ch; i++; continue;
      }
      if (ch === '"') { quoted = true; i++; continue; }
      if (ch === ",") { row.push(field); field = ""; i++; continue; }
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (ch === "\n" || ch === "\r") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += ch; i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    const [header, ...body] = rows;
    if (!header || !header.includes("record_type") || !header.includes("student_id")) return null;
    return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, k) => [h, r[k] == null ? "" : r[k]])));
  }

  const text = (v) => (v === "" || v == null ? null : v);
  const int = (v) => (v === "" || v == null || !/^-?\d+$/.test(v) ? null : Number(v));
  const json = (v) => { if (v === "" || v == null) return null; try { return JSON.parse(v); } catch (e) { return null; } };

  // old task id -> current id, from tasks.json former_ids (for example loops-L5a -> while-L5a, sel-L10d -> logic-L10b)
  function renames(tasks) {
    const map = {};
    // Not a replacement: that was a different task, so its rows keep their own id (and its passes stay its own).
    for (const t of tasks || []) if (!t.former_ids_are_replacements) for (const old of t.former_ids || []) map[old] = t.id;
    return map;
  }

  // Export rows -> students in the file, and the table rows for each (keyed by the file's student id).
  function plan(exportRows, tasks) {
    const moved = renames(tasks);
    const taskId = (v) => (v ? moved[v] || v : v);
    const students = [];
    const seen = new Set();
    const out = { attempts: [], events: [], skipped: [], renamedTasks: 0 };
    exportRows.forEach((r, i) => {
      if (r.student_id && !seen.has(r.student_id)) { seen.add(r.student_id); students.push({ file_id: r.student_id, nickname: String(r.student_name || "").trim() }); }
      const tid = taskId(text(r.task_id));
      if (tid !== text(r.task_id)) out.renamedTasks++;
      const base = { file_id: r.student_id, record_type: r.record_type, timestamp: r.timestamp, unit: r.unit, task_id: tid };
      if (ATTEMPT_TYPES.includes(r.record_type)) {
        out.attempts.push(Object.assign(base, {
          record_id: /^a-[a-z0-9-]{1,40}$/.test(r.record_id) ? r.record_id : "a-imp" + i,
          template_id: text(r.template_id), phase: text(r.phase), task_type: text(r.task_type), task_level: int(r.task_level),
          student_level_before: int(r.student_level_before), student_level_after: int(r.student_level_after),
          attempt_number: int(r.attempt_number), result: r.result, failure_category: text(r.failure_category),
          failure_details: json(r.failure_details), misconception_matches: r.misconception_matches ? r.misconception_matches.split(";") : [],
          hints_used: int(r.hints_used), hint_type: text(r.hint_type),
          variant_fingerprint: text(r.variant_fingerprint) && moved[r.variant_fingerprint] ? moved[r.variant_fingerprint] : text(r.variant_fingerprint),
          failed_test_number: int(r.failed_test_number), failed_test_inputs: json(r.failed_test_inputs),
          expected_output: text(r.expected_output), student_output: r.failure_category ? r.student_output : null,
          student_error_type: text(r.student_error_type), student_error_kind: text(r.student_error_kind),
          student_code: r.failure_category ? r.student_code : null,
        }));
      } else if (EVENT_TYPES.includes(r.record_type)) {
        const prefix = r.record_type === "level_change" ? "l" : r.record_type === "button_use" ? "b" : "p";
        const id = new RegExp("^" + prefix + "-[a-z0-9-]{1,40}$").test(r.record_id) && prefix !== "l" ? r.record_id
          : prefix + "-imp-" + Date.parse(r.timestamp).toString(36) + "-" + i.toString(36); // level change numbers aren't stable
        out.events.push(Object.assign(base, {
          record_id: id, student_level_before: int(r.student_level_before), student_level_after: int(r.student_level_after),
          level_change_reason: text(r.level_change_reason), button: text(r.button),
          placement_start_level: int(r.placement_start_level), placement_results: json(r.placement_results),
        }));
        if (r.record_type === "placement_result" && Array.isArray(base.placement_results)) {
          for (const p of base.placement_results) if (p && moved[p.taskId]) p.taskId = moved[p.taskId];
        }
      } else {
        out.skipped.push({ row: i + 2, record_type: r.record_type });
      }
    });
    out.students = students;
    return out;
  }

  // What can be rebuilt of each unit's saved state from the rows (freshUnitState is app.js's).
  // Returns { progress: [{ file_id, unit, state }], passed: [{ file_id, unit, fingerprint }], report }.
  function rebuild(planned, freshUnitState) {
    const byKey = {};
    const key = (fid, unit) => fid + "\u0000" + unit;
    const get = (fid, unit) => byKey[key(fid, unit)] || (byKey[key(fid, unit)] = { file_id: fid, unit, attempts: [], events: [] });
    // Assignment work is practice only, so it never rebuilds a level or a passed task.
    planned.attempts.filter((a) => a.phase !== "assignment").forEach((a) => get(a.file_id, a.unit).attempts.push(a));
    planned.events.forEach((e) => get(e.file_id, e.unit).events.push(e));
    const time = (r) => Date.parse(r.timestamp);
    const progress = [];
    const passed = [];
    const report = { units: 0, passedTasks: 0, passedWithoutFingerprint: 0, placementRebuilt: 0, noLevel: 0 };

    for (const u of Object.values(byKey)) {
      u.attempts.sort((x, y) => time(x) - time(y));
      u.events.sort((x, y) => time(x) - time(y));
      const levelChanges = u.events.filter((e) => e.record_type === "level_change" && e.student_level_after != null);
      const lastAttempt = u.attempts.filter((a) => a.student_level_after != null || a.task_level != null).pop();
      const level = levelChanges.length ? levelChanges[levelChanges.length - 1].student_level_after
        : lastAttempt ? (lastAttempt.student_level_after != null ? lastAttempt.student_level_after : lastAttempt.task_level) : null;
      if (level == null) { report.noLevel++; continue; }
      const state = freshUnitState(level);
      const levels = [level].concat(levelChanges.map((e) => e.student_level_after), u.attempts.map((a) => a.student_level_after).filter((x) => x != null));
      state.highest = Math.max.apply(null, levels);

      // Placement: the last result, unless a teacher reset came after it.
      const placements = u.events.filter((e) => e.record_type === "placement_result" || e.record_type === "placement_reset");
      const last = placements[placements.length - 1];
      const used = [...new Set(placements.filter((e) => e.record_type === "placement_result")
        .flatMap((e) => (e.placement_results || []).map((p) => p.taskId)).filter(Boolean))];
      if (last && last.record_type === "placement_result") {
        const results = last.placement_results || [];
        state.placement = { status: "done", taskIds: results.map((p) => p.taskId), step: results.length, results, startLevel: last.placement_start_level, used };
        report.placementRebuilt++;
      } else if (last) {
        state.placement = { status: "pending", taskIds: [], step: 0, results: [], startLevel: null, used };
        report.placementRebuilt++;
      }

      // Passed tasks: each pass, by its fingerprint, or its task id if the export has none.
      for (const a of u.attempts) {
        if (a.record_type !== "attempt" || a.result !== "pass") continue;
        const fp = a.variant_fingerprint || a.task_id;
        if (!a.variant_fingerprint && a.template_id) report.passedWithoutFingerprint++;
        if (!(fp in state.passedFingerprints)) {
          state.passedFingerprints[fp] = a.timestamp;
          passed.push({ file_id: u.file_id, unit: u.unit, fingerprint: fp });
          report.passedTasks++;
        }
        if (a.task_level === 10) state.passedTop = true;
      }
      if (u.events.some((e) => e.record_type === "level_change" && ["completed", "test-mode-completed"].includes(e.level_change_reason))) state.completedTop = true;
      for (const e of u.events) if (e.record_type === "button_use" && e.button) state.buttonsUsed[e.button] = true;
      progress.push({ file_id: u.file_id, unit: u.unit, state });
      report.units++;
    }
    return { progress, passed, report };
  }

  // What the teacher is told after an import.
  const NOT_REBUILT = [
    "pass and fail streaks, and the fast-move-up run (they start again from 0)",
    "a recovery ceiling after a drop",
    "skill states (Secured, In progress): an export doesn't say which skills each task used",
    "the per-task log and task history, and the task each student was in the middle of",
    "Endless mode choices",
  ];
  const REBUILT = [
    "each student's level in each unit (from the last level change, or the last attempt)",
    "the highest level reached",
    "placement results (or a pending placement after a teacher reset)",
    "passed tasks, so they aren't set again",
    "units completed, level 10 passed, and the \"too easy\" / \"way too hard\" buttons used",
    "every attempt, level change, button use and placement record, with code and output (code older than 30 days arrives already cleared)",
  ];

  return { parseCsv, plan, rebuild, renames, REBUILT, NOT_REBUILT };
});
