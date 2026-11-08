// Teacher view data: summaries, filters and CSV export, worked out from what store.js saves.
// No DOM here, so tests/features.js can check it. Works in the browser (window.TeacherData) and in Node.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TeacherData = factory();
})(typeof self !== "undefined" ? self : this, function () {

  const FAILS_IN_A_ROW_ALERT = 2;
  const TOP_FAILED_TASKS = 10;
  const BUTTON_NAMES = { "too-easy": "This is too easy", "too-hard": "This is way too hard" };
  const PLACEMENT_STATUS = {
    done: "Done", "in-progress": "Taking it now", pending: "Not taken yet", skipped: "Skipped (level set in test mode)",
    "not-taken": "Started before placement",
  };

  // ---------- Gathering ----------
  // data = { students: { id: { name } }, progress: { id: progress }, attempts: [...], levelLog, buttonLog, placementLog, units }
  function collect(Store, units) {
    const students = Store.students();
    const progress = {};
    let attempts = [];
    for (const id of Object.keys(students)) {
      progress[id] = Store.loadProgress(id);
      attempts = attempts.concat(Store.attempts(id));
    }
    return { students, progress, attempts, levelLog: Store.levelLog(), buttonLog: Store.buttonLog(), placementLog: Store.placementLog(), units };
  }

  const nameOf = (data, id) => (data.students[id] || { name: "(removed)" }).name;
  const placementStatus = (st) => (st && st.placement && st.placement.status) || "not-taken";
  const byTimeDesc = (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);
  const count = (map, key) => { map[key] = (map[key] || 0) + 1; };
  const topKey = (map) => Object.keys(map).sort((a, b) => map[b] - map[a] || a.localeCompare(b))[0] || "";

  // ---------- Overview ----------
  function unitCell(st) {
    if (!st) return { started: false };
    const status = placementStatus(st);
    const used = st.buttonsUsed || {};
    return {
      started: true,
      level: st.level,
      placementStatus: status,
      placementStart: status === "done" ? st.placement.startLevel : null,
      complete: !!(st.passedTop || st.completedTop),
      tooEasy: !!used["too-easy"],
      tooHard: !!used["too-hard"],
      failsInARow: st.failsInARow || 0,
      alert: (st.failsInARow || 0) >= FAILS_IN_A_ROW_ALERT,
      currentTaskId: (st.current && st.current.taskId) || null,
    };
  }

  // One row per student, with a cell per unit.
  function overviewRows(data) {
    return Object.entries(data.students).map(([id, s]) => {
      const units = (data.progress[id] || { units: {} }).units || {};
      return { studentId: id, name: s.name, cells: Object.fromEntries(data.units.map((u) => [u.id, unitCell(units[u.id])])) };
    });
  }

  // key is "name" or a unit id (sorted by level; units not started come first).
  function sortOverview(rows, key, dir) {
    const val = (r) => (key === "name" ? r.name.toLowerCase() : r.cells[key] && r.cells[key].started ? r.cells[key].level : -1);
    return rows.slice().sort((a, b) => {
      const x = val(a), y = val(b);
      if (x < y) return -dir;
      if (x > y) return dir;
      return a.name.localeCompare(b.name);
    });
  }

  const filterByName = (rows, text) => {
    const q = (text || "").trim().toLowerCase();
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  };

  // ---------- Per-task and per-misconception statistics ----------
  // Only Check presses count here (skips are not attempts).
  const checks = (data) => data.attempts.filter((a) => (a.kind || "attempt") === "attempt");
  const failed = (data) => checks(data).filter((a) => a.result === "fail");

  function taskStats(data) {
    const stats = {};
    for (const a of checks(data)) {
      const s = stats[a.taskId] || (stats[a.taskId] = { taskId: a.taskId, unit: a.unit, attempts: 0, fails: 0, unmatched: 0, categories: {}, misconceptions: {}, students: new Set() });
      s.attempts += 1;
      s.students.add(a.studentId);
      if (a.result !== "fail") continue;
      s.fails += 1;
      if (a.category) count(s.categories, a.category);
      const ms = a.misconceptions || [];
      if (!ms.length) s.unmatched += 1;
      ms.forEach((m) => count(s.misconceptions, m));
    }
    return Object.values(stats).map((s) => Object.assign(s, {
      failRate: s.attempts ? s.fails / s.attempts : 0,
      unmatchedRate: s.fails ? s.unmatched / s.fails : 0,
      topCategory: topKey(s.categories),
      topMisconception: topKey(s.misconceptions),
      studentCount: s.students.size,
    }));
  }

  function misconceptionStats(data, misconceptions) {
    const names = Object.fromEntries((misconceptions || []).map((m) => [m.id, m.name]));
    const tasks = Object.fromEntries(taskStats(data).map((s) => [s.taskId, s]));
    const stats = {};
    for (const a of failed(data)) {
      for (const m of a.misconceptions || []) {
        const s = stats[m] || (stats[m] = { id: m, name: names[m] || m, attempts: 0, students: new Set(), tasks: {} });
        s.attempts += 1;
        s.students.add(a.studentId);
        count(s.tasks, a.taskId);
      }
    }
    return Object.values(stats).map((s) => {
      const ts = Object.keys(s.tasks).map((id) => tasks[id]).filter(Boolean);
      const tried = ts.reduce((n, t) => n + t.attempts, 0);
      return Object.assign(s, {
        studentIds: [...s.students].sort(),
        studentCount: s.students.size,
        taskList: Object.entries(s.tasks).sort((x, y) => y[1] - x[1]).map(([taskId, n]) => ({ taskId, matches: n })),
        failRate: tried ? ts.reduce((n, t) => n + t.fails, 0) / tried : 0,
      });
    }).sort((a, b) => b.attempts - a.attempts || b.studentCount - a.studentCount || a.id.localeCompare(b.id));
  }

  // ---------- Quick look ----------
  function quickLook(data, misconceptions) {
    const rows = overviewRows(data);
    const struggling = [];
    const notStarted = [];
    for (const r of rows) {
      const missing = [];
      for (const u of data.units) {
        const c = r.cells[u.id];
        if (!c.started) missing.push(u.id);
        else if (c.alert) struggling.push({ studentId: r.studentId, name: r.name, unit: u.id, failsInARow: c.failsInARow, taskId: c.currentTaskId });
      }
      if (missing.length) notStarted.push({ studentId: r.studentId, name: r.name, units: missing });
    }
    const topFailedTasks = taskStats(data).filter((s) => s.fails > 0)
      .sort((a, b) => b.fails - a.fails || b.failRate - a.failRate || a.taskId.localeCompare(b.taskId)).slice(0, TOP_FAILED_TASKS);
    return { struggling, notStarted, topFailedTasks, topMisconceptions: misconceptionStats(data, misconceptions) };
  }

  // ---------- Detail log ----------
  // One row per attempt (every Check press and every skip) and per button use, newest first.
  function detailRows(data) {
    const rows = data.attempts.map((a) => ({
      id: a.id, at: a.at, studentId: a.studentId, name: nameOf(data, a.studentId), unit: a.unit, taskId: a.taskId,
      level: a.taskLevel, phase: a.phase || "", result: a.kind === "skip" ? "skipped" : a.kind === "hint" ? a.hintType || "hint" : a.result,
      category: a.category || "", misconceptions: a.misconceptions || [], hints: a.hints == null ? "" : a.hints, button: "",
      levelChange: a.levelBefore != null && a.levelAfter != null && a.levelBefore !== a.levelAfter ? a.levelBefore + " → " + a.levelAfter : "",
      code: a.code || "", output: a.output || "", expected: a.expected == null ? "" : a.expected,
      inputs: a.inputs || null, failedTest: a.failedTest == null ? "" : a.failedTest, assignmentId: a.assignmentId || "",
    }));
    for (const b of data.buttonLog) {
      rows.push({
        id: b.id, at: b.at, studentId: b.studentId, name: nameOf(data, b.studentId), unit: b.unit, taskId: b.taskId,
        level: b.from, phase: "practice", result: "button", category: "", misconceptions: [], hints: "",
        button: BUTTON_NAMES[b.button] || b.button, levelChange: b.from + " → " + b.to,
        code: "", output: "", expected: "", inputs: null, failedTest: "",
      });
    }
    return rows.sort(byTimeDesc);
  }

  // f = { student, unit, task, category, misconception } (empty means any). misconception "none": failed with no match.
  function filterDetail(rows, f) {
    return rows.filter((r) =>
      (!f.student || r.studentId === f.student) &&
      (!f.unit || r.unit === f.unit) &&
      (!f.task || r.taskId === f.task) &&
      (!f.category || r.category === f.category) &&
      (!f.misconception || (f.misconception === "none" ? r.result === "fail" && !r.misconceptions.length : r.misconceptions.includes(f.misconception))));
  }

  // ---------- Workshop ----------
  function workshop(data, misconceptions, tasksById) {
    const failedRows = detailRows(data).filter((r) => r.result === "fail");
    const tasks = taskStats(data).filter((s) => s.fails > 0).map((s) => Object.assign(s, {
      hasVariants: !!(tasksById && tasksById[s.taskId] && (tasksById[s.taskId].buggy_variants || []).length),
      unmatchedAttempts: failedRows.filter((r) => r.taskId === s.taskId && !r.misconceptions.length),
    })).sort((a, b) => b.unmatched - a.unmatched || b.fails - a.fails || a.taskId.localeCompare(b.taskId));
    const ms = misconceptionStats(data, misconceptions).map((m) => Object.assign(m, { studentNames: m.studentIds.map((id) => nameOf(data, id)).sort() }));
    return { misconceptions: ms, tasks };
  }

  // ---------- Class assignments ----------
  // For one assignment ({ id, task_ids }): per task, how many students tried it (any Check press or "Show me how")
  // and passed it, the checks and fails, and the most common failure category and misconception. struggled lists
  // the tried tasks with the most students who tried without passing, then the most fails per student.
  function assignmentStats(data, assignment) {
    const rows = data.attempts.filter((a) => a.assignmentId === assignment.id);
    const tasks = (assignment.task_ids || []).map((taskId) => {
      const mine = rows.filter((a) => a.taskId === taskId);
      const tried = new Set(mine.map((a) => a.studentId));
      const passed = new Set(mine.filter((a) => (a.kind || "attempt") === "attempt" && a.result === "pass").map((a) => a.studentId));
      const checksHere = mine.filter((a) => (a.kind || "attempt") === "attempt");
      const fails = checksHere.filter((a) => a.result === "fail");
      const categories = {};
      const misconceptions = {};
      for (const f of fails) {
        if (f.category) count(categories, f.category);
        (f.misconceptions || []).forEach((m) => count(misconceptions, m));
      }
      return {
        taskId, triedCount: tried.size, passedCount: passed.size, stuckCount: [...tried].filter((s) => !passed.has(s)).length,
        checks: checksHere.length, fails: fails.length, failsPerStudent: tried.size ? fails.length / tried.size : 0,
        showHow: mine.filter((a) => a.kind === "hint").length, topCategory: topKey(categories), topMisconception: topKey(misconceptions),
      };
    });
    const struggled = tasks.filter((t) => t.triedCount && (t.stuckCount || t.fails))
      .sort((a, b) => b.stuckCount - a.stuckCount || b.failsPerStudent - a.failsPerStudent || a.taskId.localeCompare(b.taskId));
    return { tasks, struggled, students: new Set(rows.map((a) => a.studentId)).size };
  }

  // ---------- CSV ----------
  function csvCell(v) {
    const s = String(v == null ? "" : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  // columns = [{ key, label? }]; rows = objects. The header uses label (or key).
  function toCsv(columns, rows) {
    return [columns.map((c) => csvCell(c.label || c.key)).join(",")]
      .concat(rows.map((r) => columns.map((c) => csvCell(r[c.key])).join(","))).join("\r\n");
  }
  const json = (v) => (v == null ? "" : JSON.stringify(v));

  // Every column of the full export, with a plain-English explanation (written to data-dictionary.csv).
  const FULL_COLUMNS = [
    ["record_type", "What this row records. One of: attempt, skip, hint, level_change, button_use, placement_result, placement_reset (see the record_type rows below)."],
    ["record_id", "A unique id for this row. Attempt ids start with a-, button uses with b-, placement records with p-. Level changes have no stored id, so one is made from the row number (l-1, l-2, …)."],
    ["timestamp", "When it happened, in UTC, in ISO 8601 format (for example 2026-10-28T09:15:02.123Z)."],
    ["student_id", "A stable id for the student, created when they first typed their name in this browser. Two students with the same name have different ids."],
    ["student_name", "The name the student typed. Not a login; it may not be unique."],
    ["unit", "The unit: output (Output and sequence), variables (Variables and input), data-types (Data types and casting), maths (Maths in Python), selection (Selection), loops-condition (Condition-controlled loops), loops-count (Count-controlled loops), strings (Strings), random (Random), lists (Lists), functions-basic (Functions, no return value), functions-return (Functions, return values), file-handling (File handling), arrays-2d (2D arrays), validation (Validation) or authentication (Authentication)."],
    ["task_id", "The task. Bank tasks come from tasks.json (for example if-L3a). Placement tasks have P in the id (for example sel-P5a). Tasks made from a template have an id of the form <template id>#<seed>. An older export may name a task by an old id that tasks.json now lists in that task's former_ids."],
    ["template_id", "For a task made from a template (a variant with different values, in practice once the bank tasks at a level are passed, in Endless mode, and write-from-scratch tasks), the template it came from. Empty for bank tasks."],
    ["phase", "Where it happened: placement (the starting test taken the first time a unit is opened), practice (normal practice in one unit), endless (Endless mode) or assignment (a class assignment set by the teacher, which is practice only: see assignment_id)."],
    ["task_type", "predict (choose the output), fill (fill in the blanks), parsons (put lines in order), write (write code) or scratch (write from a blank editor)."],
    ["task_level", "The difficulty level of the task, 1 to 10. Levels 1-2 predict, 3-4 fill in, 5-6 Parsons, 7 complete a line, 8-10 write code."],
    ["student_level_before", "The student's level in this unit before this event. For attempts: before the task was finished. For level changes and button uses: the old level."],
    ["student_level_after", "The student's level in this unit after this event. Different from student_level_before only when the level changed."],
    ["attempt_number", "For attempts: which Check press on this task this was (1 = first). Write, fill and Parsons tasks can be checked many times; predict tasks once (twice in placement)."],
    ["result", "For attempts: pass (every test passed / right option chosen) or fail. For skips: skipped (the student gave up on the task, which counts as not passed)."],
    ["failure_category", "For failed attempts only: why it failed, worked out automatically (the student never chooses). One of the failure_category values listed below."],
    ["failure_details", "For failed attempts: extra facts about the failure as JSON, for example the line number of a syntax error, the misspelled name, the types mixed, or which test failed."],
    ["misconception_matches", "For failed attempts: ids of the misconceptions whose buggy example program gave exactly the same result as the student on the failing test, separated by semicolons. Empty means no match was found (not that there was no misconception)."],
    ["hints_used", "How many hints the student had opened on this task at the time of the row (0 to 3)."],
    ["failed_test_number", "For failed attempts: which test (1 = first) was used as evidence – the first one that failed. Empty when the code wasn't run (for example an empty answer)."],
    ["failed_test_inputs", "For failed attempts: the inputs given to the program in that test, as a JSON list of strings, in the order input() received them."],
    ["expected_output", "For failed attempts: what the program should have printed for that test (for predict tasks, the correct option)."],
    ["student_output", "For failed attempts: what the student's program actually printed for that test (for predict tasks, the option they chose). Trailing spaces are ignored when outputs are compared. Cut to 2000 characters."],
    ["student_error_type", "For failed attempts: the Python error the program stopped with on that test (for example TypeError), or empty if it ran to the end. Timeout means it ran too long and was stopped."],
    ["student_error_kind", "For failed attempts: a short label for how the run ended, used for misconception matching. Empty if no error; otherwise the error type, with more detail for some errors (see the student_error_kind values below)."],
    ["student_code", "For failed attempts: the code that was checked. For fill tasks the blanks are filled in; for Parsons tasks it is the lines in the student's order with their indentation. Empty for predict tasks. Cut to 2000 characters."],
    ["button", "For button uses: too-easy (the student pressed 'This is too easy') or too-hard ('This is way too hard'). Each can be used once per unit."],
    ["level_change_reason", "For level changes: why the level changed. One of the level_change_reason values listed below."],
    ["placement_start_level", "For placement results: the level the student started practice at (the highest placement level passed, at least 1 and at most 8)."],
    ["placement_results", "For placement results: each placement task as JSON – its level, task id, whether it was passed, the number of attempts and the hints used."],
    ["hint_type", "For hint rows: which kind of help was used. show-me-how means the student pressed 'Show me how' and saw a worked example (see the hint_type values below). Ordinary hints are not separate rows: they are counted in hints_used."],
    ["variant_fingerprint", "For tasks made from a template: the template id and the values drawn for this variant. Two rows with the same fingerprint are the same task. A passed fingerprint is never given to that student again in that unit. Empty for bank tasks (their task_id is their fingerprint)."],
    ["assignment_id", "For rows with phase assignment: the id of the class assignment the task was set in (backend mode only). Assignment work is practice only: it never changes the student's level, streaks, passed tasks or progress, tries are unlimited, hints are free and 'Show me how' is always offered, so student_level_before and student_level_after are the same (empty if the student hadn't started the unit). Empty for every other row, and for an assignment the teacher has since deleted."],
  ];

  const VALUE_NOTES = [
    ["record_type", "attempt", "One press of Check (or choosing a predict option). Passes and fails are both recorded."],
    ["record_type", "skip", "The student skipped a task. In practice this counts as a fail for the adaptive rule."],
    ["record_type", "hint", "The student asked for extra help on a task. hint_type says which kind. result is the hint type too."],
    ["hint_type", "show-me-how", "'Show me how': a worked example on a similar problem, then the key step for this task. Offered after 2 failed attempts on the same task. The task can then not be a strong pass (it can't count towards moving up), but it doesn't count towards the 3-hints move down, and it doesn't change the level or the pass and fail streaks by itself."],
    ["record_type", "level_change", "The student's level in a unit changed. The reason is in level_change_reason."],
    ["record_type", "button_use", "The student pressed 'This is too easy' or 'This is way too hard'."],
    ["record_type", "placement_result", "The student finished the placement test in a unit."],
    ["record_type", "placement_reset", "A teacher reset the placement test for this student and unit, so they take it once more."],
    ["phase", "placement", "The starting test (4 tasks at levels 2, 5, 7 and 9, up to 2 attempts each). It does not count towards moving up or down."],
    ["phase", "practice", "Normal practice in one unit."],
    ["phase", "endless", "Endless mode, open once a unit is completed."],
    ["phase", "assignment", "A class assignment set by the teacher (assignment_id says which). Practice only: no effect on the level or progress, unlimited tries, free hints."],
    ["failure_category", "SYNTAX", "The code couldn't be understood by Python (a syntax or indentation error). failure_details gives the line."],
    ["failure_category", "NAME", "A variable or function name was used before it was defined (often a spelling mistake). failure_details gives the name."],
    ["failure_category", "TYPE", "An operation on values that don't go together, such as adding text and a number. failure_details gives the types."],
    ["failure_category", "TIMEOUT", "The code ran too long or printed far too much and was stopped. Usually a loop that never ends."],
    ["failure_category", "NO_ANSWER", "Nothing was given: an empty editor, no blanks filled, no Parsons lines, or code that is only comments or pass."],
    ["failure_category", "ORDER", "Parsons tasks: exactly the right lines were used, but in the wrong order or with the wrong indentation."],
    ["failure_category", "OTHER_ERROR", "The code stopped with another error, for example ValueError (int() of something that isn't a whole number), ZeroDivisionError, or asking for more input than the test gives."],
    ["failure_category", "WRONG_OUTPUT", "The code ran, but what it printed didn't match the expected output for the test in failed_test_number."],
    ["failure_category", "WRONG_CHOICE", "Predict tasks: the option chosen is not what the program prints."],
    ["student_error_kind", "SyntaxError:assign-in-condition", "A syntax error caused by a single = in an if, elif or while condition."],
    ["student_error_kind", "TypeError:concat", "A TypeError from joining text and a number with +."],
    ["student_error_kind", "TypeError:compare", "A TypeError from comparing text with a number (for example with < or >=)."],
    ["student_error_kind", "TypeError:operand", "A TypeError from doing maths (- * / // % **) with text."],
    ["student_error_kind", "Timeout", "The program ran too long or printed too much and was stopped."],
    ["student_error_kind", "NoMoreInput", "The program asked for more input than the test gives."],
    ["level_change_reason", "passes", "Moved up 1: 2 strong passes in a row (a strong pass uses 1 hint or fewer)."],
    ["level_change_reason", "fast", "Moved up 2: 5 strong passes in a row covering 3 or more different skills."],
    ["level_change_reason", "fails", "Moved down 1: 2 fails in a row."],
    ["level_change_reason", "hints", "Moved down 1: used 3 hints on one task."],
    ["level_change_reason", "recovery", "Moved down 1: 2 fails soon after moving up. The level is then capped for 5 tasks."],
    ["level_change_reason", "placement", "Set by the placement test."],
    ["level_change_reason", "too-easy", "The student pressed 'This is too easy': up 1."],
    ["level_change_reason", "too-hard", "The student pressed 'This is way too hard': down 1 (never below 1)."],
    ["level_change_reason", "completed", "Completed Level 10 (2 strong passes in a row there). The level stays 10; Endless mode unlocks."],
    ["level_change_reason", "reset", "The student reset their own progress in the unit, back to their starting level."],
    ["level_change_reason", "test-mode", "Set by a teacher using test mode (?test=1)."],
    ["level_change_reason", "test-mode-completed", "Marked as completed by a teacher in test mode."],
  ];

  function fullExportRows(data) {
    const rows = [];
    const base = (rec, type, id) => ({ record_type: type, record_id: id, timestamp: rec.at, student_id: rec.studentId, student_name: nameOf(data, rec.studentId), unit: rec.unit });
    for (const a of data.attempts) {
      const type = a.kind === "skip" ? "skip" : a.kind === "hint" ? "hint" : "attempt";
      rows.push(Object.assign(base(a, type, a.id), {
        task_id: a.taskId, template_id: a.templateId || "", phase: a.phase || "", task_type: a.taskType || "", task_level: a.taskLevel,
        student_level_before: a.levelBefore, student_level_after: a.levelAfter, attempt_number: a.attemptNumber,
        result: type === "skip" ? "skipped" : type === "hint" ? a.hintType || "hint" : a.result, failure_category: a.category || "", failure_details: a.category ? json(a.details) : "",
        hint_type: type === "hint" ? a.hintType || "" : "", variant_fingerprint: a.fingerprint || "",
        misconception_matches: (a.misconceptions || []).join(";"), hints_used: a.hints,
        failed_test_number: a.failedTest == null ? "" : a.failedTest, failed_test_inputs: a.inputs ? json(a.inputs) : "",
        expected_output: a.expected == null ? "" : a.expected, student_output: a.output == null ? "" : a.output,
        student_error_type: a.errorType || "", student_error_kind: a.errorKind || "", student_code: a.code || "",
        assignment_id: a.assignmentId || "",
      }));
    }
    data.levelLog.forEach((e, i) => rows.push(Object.assign(base(e, "level_change", "l-" + (i + 1)), {
      task_id: e.taskId || "", student_level_before: e.from == null ? "" : e.from, student_level_after: e.to, level_change_reason: e.reason,
    })));
    for (const b of data.buttonLog) {
      rows.push(Object.assign(base(b, "button_use", b.id), {
        task_id: b.taskId, phase: "practice", student_level_before: b.from, student_level_after: b.to, button: b.button,
      }));
    }
    for (const p of data.placementLog) {
      rows.push(Object.assign(base(p, p.kind === "reset" ? "placement_reset" : "placement_result", p.id), {
        phase: "placement",
        placement_start_level: p.kind === "reset" ? "" : p.startLevel,
        placement_results: p.kind === "reset" ? "" : json(p.results),
      }));
    }
    return rows.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
  }

  const fullExportCsv = (data) => toCsv(FULL_COLUMNS.map(([key]) => ({ key })), fullExportRows(data));

  function dataDictionaryCsv(misconceptions) {
    const rows = [{ kind: "about", name: "this file", meaning: "Explains the columns and values in the full data export (python-practice-full-data-*.csv). Each row of that file is one event from a Python practice app used by students aged 11-16. All data comes from one browser on one computer. Columns that don't apply to a row's record_type are empty." }];
    for (const [name, meaning] of FULL_COLUMNS) rows.push({ kind: "column", name, meaning });
    for (const [col, value, meaning] of VALUE_NOTES) rows.push({ kind: "value of " + col, name: value, meaning });
    for (const m of misconceptions || []) rows.push({ kind: "value in misconception_matches", name: m.id, meaning: m.name + ". " + m.description });
    return toCsv([{ key: "kind" }, { key: "name" }, { key: "meaning" }], rows);
  }

  return {
    FAILS_IN_A_ROW_ALERT, TOP_FAILED_TASKS, BUTTON_NAMES, PLACEMENT_STATUS, FULL_COLUMNS,
    collect, overviewRows, sortOverview, filterByName, taskStats, misconceptionStats, quickLook,
    detailRows, filterDetail, workshop, toCsv, fullExportRows, fullExportCsv, dataDictionaryCsv, assignmentStats,
  };
});
