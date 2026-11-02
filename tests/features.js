// Tests for placement, the level buttons, the failure classifier, misconception matching, the teacher export
// and recheck.py. Run on their own with:  node tests/features.js   (tests/validate.js runs them too).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

// store.js saves to localStorage; in Node, use one kept in memory.
function memoryStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] || null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
  };
}

// A small CSV reader (quoted fields, "" escapes, CRLF), for reading recheck.py's output.
function parseCsv(text) {
  text = text.replace(/^\ufeff/, "");
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
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, k) => [h, r[k] == null ? "" : r[k]])));
}

function runRecheck(exportPath, tasksPath, outPath) {
  const py = process.env.PYTHON || "python";
  const res = spawnSync(py, [path.join(ROOT, "recheck.py"), exportPath, tasksPath, "-o", outPath], {
    encoding: "utf8", timeout: 120000, env: Object.assign({}, process.env, { PYTHONIOENCODING: "utf-8" }),
  });
  return { ok: !res.error && res.status === 0, stderr: String(res.stderr || res.error || ""), rows: res.status === 0 ? parseCsv(fs.readFileSync(outPath, "utf8")) : [] };
}

function runFeatureTests({ tasks, misconceptions, runPython }) {
  Object.defineProperty(globalThis, "localStorage", { value: memoryStorage(), configurable: true, writable: true });
  const Store = require(path.join(ROOT, "store.js"));
  const App = require(path.join(ROOT, "app.js"));
  const Checker = require(path.join(ROOT, "checker.js"));
  const Curriculum = require(path.join(ROOT, "curriculum.js"));
  const TD = require(path.join(ROOT, "teacher-data.js"));
  const Templates = require(path.join(ROOT, "templates.js"));
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const out = [];
  const check = (ok, message) => { out.push({ ok: !!ok, message }); return !!ok; };
  const rng = Templates.mulberry32(7);

  // ===================== Placement =====================
  {
    const { PLACEMENT_LEVELS, PLACEMENT_MAX_LEVEL } = App;
    check(PLACEMENT_LEVELS.join() === "2,5,7,9" && PLACEMENT_MAX_LEVEL === 8 && App.PLACEMENT_ATTEMPTS === 2,
      "Placement uses levels 2, 5, 7 and 9, up to 2 attempts each, and PLACEMENT_MAX_LEVEL = 8");
    const res = (passed) => PLACEMENT_LEVELS.map((level, i) => ({ level, passed: passed[i] }));
    check(App.placementStartLevel(res([true, true, false, false])) === 5, "Placement: passes 2 and 5 but fails 7 → starts at 5");
    check(App.placementStartLevel(res([true, true, true, true])) === 8, "Placement: passes 9 → starts at 8 (the cap)");
    check(App.placementStartLevel(res([false, false, false, false])) === 1, "Placement: fails 2 (and everything after it) → starts at 1");
    check(App.placementStartLevel(res([false, true, false, false])) === 5, "Placement: the start is the highest level passed, even after failing an earlier one");

    // The full flow on a unit's state, as the practice page runs it.
    const st = Object.assign(App.freshUnitState(), { placement: App.newPlacement() });
    check(App.needsPlacement(st), "A new unit needs placement first");
    App.startPlacement(st, tasks, "selection", rng);
    const chosen = st.placement.taskIds.map((id) => byId[id]);
    check(chosen.length === 4 && chosen.every((t, i) => t.level === PLACEMENT_LEVELS[i] && App.isPlacementTask(t) && t.unit === "selection"),
      "Placement gives one placement-tagged task at each of levels 2, 5, 7 and 9, in that order");
    [true, true, false, false].forEach((passed, i) => App.recordPlacementStep(st, { taskId: chosen[i].id, level: chosen[i].level, passed, attempts: 1, hints: 0 }));
    check(st.placement.status === "done" && st.level === 5 && st.placement.startLevel === 5, "After the last placement task the unit starts at the placement level");
    check(!App.needsPlacement(st), "Placement can't be repeated: once done, the unit goes straight to practice");
    const firstIds = st.placement.taskIds.slice();
    check(App.resetPlacement(st) && App.needsPlacement(st), "A teacher reset allows placement once more");
    App.startPlacement(st, tasks, "selection", rng);
    check(st.placement.taskIds.every((id) => !firstIds.includes(id)), "After a teacher reset, different placement tasks are given");
    st.placement.taskIds.forEach((id, i) => App.recordPlacementStep(st, { taskId: id, level: PLACEMENT_LEVELS[i], passed: true, attempts: 1, hints: 0 }));
    check(st.level === 8 && !App.needsPlacement(st), "…and after taking it again, it can't be repeated without another reset");

    // Placement tasks are never used in practice, and practice can still reach level 10.
    let leaked = 0;
    for (const u of Curriculum.UNITS) for (let lv = 1; lv <= 10; lv++) leaked += App.tasksAt(tasks, u.id, lv).filter(App.isPlacementTask).length;
    check(leaked === 0, "Placement tasks are never chosen for practice");
    const after = (s, ...outcomes) => outcomes.reduce((acc, o) => Object.assign({}, acc, App.applyOutcome(acc, o)), s);
    const top = after(Object.assign(App.freshUnitState(8)), { passed: true, hints: 0, skills: ["if"] }, { passed: true, hints: 0, skills: ["elif"] },
      { passed: true, hints: 0, skills: ["if"] }, { passed: true, hints: 0, skills: ["elif"] });
    check(top.level === 10, "The placement cap doesn't apply to practice: a student starting at 8 can reach level 10");
  }

  // ===================== "This is too easy" / "This is way too hard" =====================
  {
    const logs = { buttons: [], levels: [] };
    const stub = { logButton: (e) => logs.buttons.push(e), logLevelChange: (e) => logs.levels.push(e) };
    const press = (state, button) => App.pressLevelButton({ state, button, studentId: "s-test", unitId: "maths", taskId: "maths-L5b", store: stub });
    const s = Object.assign(App.freshUnitState(5), { passStreak: 1, strongRun: 3, failStreak: 1, ceiling: 6, ceilingTasksLeft: 2 });
    const r = press(s, "too-easy");
    check(r && s.level === 5 + App.BUTTON_JUMP_LEVELS, "\"This is too easy\" moves up BUTTON_JUMP_LEVELS");
    check(s.passStreak === 0 && s.strongRun === 0 && s.failStreak === 0, "A button resets the pass and fail streaks");
    check(logs.buttons.length === 1 && logs.buttons[0].button === "too-easy" && logs.buttons[0].from === 5 && logs.buttons[0].to === 6 &&
      logs.buttons[0].studentId === "s-test" && logs.buttons[0].unit === "maths" && logs.buttons[0].taskId === "maths-L5b",
      "A button use is logged with student, unit, task, button, level before and level after");
    check(logs.levels.length === 1 && logs.levels[0].reason === "too-easy" && logs.levels[0].from === 5 && logs.levels[0].to === 6, "A button use is logged as a level change");
    check(press(s, "too-easy") === null && s.level === 6 && logs.buttons.length === 1, "\"This is too easy\" can only be used once per unit");
    check(r.message === "Great – let's try Level 6.", "The button message is short and positive");
    const r2 = press(s, "too-hard");
    check(r2 && s.level === 6 - App.BUTTON_JUMP_LEVELS && logs.buttons.length === 2, "\"This is way too hard\" moves down BUTTON_JUMP_LEVELS");
    check(press(s, "too-hard") === null && s.level === 5, "\"This is way too hard\" can only be used once per unit");
    const other = App.freshUnitState(5);
    check(App.levelButtonAvailable(other, "too-easy") && App.levelButtonAvailable(other, "too-hard"), "The buttons are counted per unit (another unit still has both)");
    const bottom = App.freshUnitState(1);
    check(press(bottom, "too-hard") === null && bottom.level === 1 && !bottom.buttonsUsed["too-hard"], "\"This is way too hard\" never goes below level 1 (and isn't used up there)");
    // The adaptive rule carries on unchanged from the new level.
    const moved = Object.assign(App.freshUnitState(4), { passStreak: 1 });
    press(moved, "too-easy");
    const next = App.applyOutcome(moved, { passed: true, hints: 0, skills: ["if"] });
    check(next.level === 5 && next.passStreak === 1, "After a button, the normal rule starts again with fresh streaks");
  }

  // ===================== Failure classifier: one fixture per category =====================
  {
    const t1 = (expected, inputs) => [{ inputs: inputs || [], expected }];
    const fixtures = [
      { want: "SYNTAX", code: "x = 5\nif x > 3\n    print(x)", tests: t1("5"), details: (d) => d.line === 2 },
      { want: "NAME", code: "score = 5\nprint(scroe)", tests: t1("5"), details: (d) => d.name === "scroe" },
      { want: "TYPE", code: 'age = 12\nprint("Age: " + age)', tests: t1("Age: 12"), details: (d) => d.types.join() === "str,int" },
      { want: "TIMEOUT", code: "while True:\n    print('again')", tests: t1("again") },
      { want: "NO_ANSWER", code: "# I'm not sure yet\npass", tests: t1("Hello") },
      { want: "ORDER", type: "parsons", task: "out-P5a",
        code: 'print("Step 2: Boil the water")\nprint("Step 1: Fill the kettle")\nprint("Step 3: Pour into the cup")' },
      { want: "OTHER_ERROR", code: "n = int(input())\nprint(n)", tests: t1("10", ["ten"]), details: (d) => d.errorType === "ValueError" },
      { want: "WRONG_OUTPUT", code: 'print("Helo")', tests: t1("Hello"), details: (d) => d.test === 1 && d.expected === "Hello" && d.actual.trim() === "Helo" },
    ];
    fixtures.forEach((f) => { if (f.task) f.tests = byId[f.task].tests; });
    const runs = runPython(fixtures.map((f) => ({ code: f.code, inputs: f.tests[0].inputs })));
    const seen = new Set();
    fixtures.forEach((f, k) => {
      const c = Checker.classifyAttempt({ type: f.type || "write", code: f.code, results: [runs[k]], tests: f.tests,
        parsons: f.type === "parsons" ? { usedDistractor: false, missing: false } : null });
      seen.add(c.category);
      check(c.category === f.want, `Classifier: fixture for ${f.want} was classified as ${c.category}`);
      if (f.details) check(f.details(c.details), `Classifier: ${f.want} records its details (${JSON.stringify(c.details)})`);
      const msg = Checker.failureMessage(c);
      check(msg && !/Traceback|File "|Error:/.test(msg), `Classifier: the ${f.want} message is friendly, with no traceback (${msg})`);
    });
    const choice = Checker.classifyAttempt({ type: "predict", choice: 0, options: ["12", "444"], answer: 1 });
    seen.add(choice.category);
    check(choice.category === "WRONG_CHOICE" && choice.output === "12", "Classifier: a wrong predict choice is WRONG_CHOICE");
    check(Checker.classifyAttempt({ type: "write", empty: true }).category === "NO_ANSWER", "Classifier: an empty editor is NO_ANSWER");
    check(Checker.classifyAttempt({ type: "write", code: "while x:\n  pass", results: [{ output: "", error: { type: "Timeout" } }], tests: t1("1") }).category === "TIMEOUT",
      "Classifier: a run stopped by the app's time limit is TIMEOUT");
    check(Checker.failureMessage({ category: "NAME", details: { name: "scroe" } }).startsWith("Python couldn't find a name it expected"), "Classifier: the NAME message matches the brief");
    check(["SYNTAX", "NAME", "TYPE", "TIMEOUT", "NO_ANSWER", "ORDER", "WRONG_OUTPUT", "WRONG_CHOICE"].every((c) => seen.has(c)), "Classifier: every category in the brief has a fixture");
  }

  // ===================== Misconception ids =====================
  {
    const known = new Set(misconceptions.map((m) => m.id));
    const required = ["EQUALS_VS_DOUBLE_EQUALS", "SEPARATE_IF_VS_ELIF", "BOUNDARY_LT_VS_LTE", "GT_VS_GTE", "MISSING_ELSE", "INPUT_NOT_INT",
      "PRECEDENCE", "INT_DIV_VS_DIV", "STRING_PLUS_INT", "LOOP_NO_UPDATE", "LOOP_TEST_ONCE", "LOOP_ZERO_RUNS"];
    check(required.every((id) => known.has(id)), "misconceptions.json has all 12 starting misconception ids");
    const used = new Set();
    for (const t of tasks) {
      (t.tags || []).filter((g) => /^[A-Z][A-Z_]+$/.test(g)).forEach((g) => used.add(g));
      (t.buggy_variants || []).forEach((v) => used.add(v.misconception));
    }
    const missing = [...used].filter((id) => !known.has(id));
    check(missing.length === 0, "Every misconception id used in tasks exists in misconceptions.json" + (missing.length ? " (missing: " + missing.join(", ") + ")" : ""));
  }

  // ===================== Simulated class: matching, export, recheck.py =====================
  const fillCode = (t, answers) => t.starter.split("____").reduce((acc, part, i) => acc + answers[i - 1] + part);
  const S = {};
  for (const name of ["Ava", "Ben", "Cara"]) S[name] = Store.addStudent(name);
  const scenarios = [
    { who: "Ava", task: "sel-P9a", phase: "placement", want: ["GT_VS_GTE"],
      code: 'p = int(input("Price: "))\nif p > 10:\n    print("Free programme")\nelse:\n    print("Programme: £2")\nprint("Enjoy the show")' },
    { who: "Ava", task: "sel-P9a", phase: "placement", want: ["MISSING_ELSE"],
      code: 'price = int(input("Price: "))\nif price >= 10:\n    print("Free programme")\nprint("Enjoy the show")' },
    { who: "Ava", task: "sel-P9a", phase: "placement", want: [], pass: true, code: byId["sel-P9a"].solution },
    { who: "Ben", task: "sel-P9a", phase: "placement", want: [], code: 'price = int(input("Price: "))\nprint("Enjoy the show")' },
    { who: "Ben", task: "maths-L9b", phase: "practice", want: ["INT_DIV_VS_DIV"],
      code: 'p = int(input())\nprint("Full packs:", p / 12)\nprint("Loose pencils:", p % 12)' },
    { who: "Ben", task: "maths-L9b", phase: "practice", want: [], newVariant: true,
      code: 'p = int(input())\nprint("Full packs:", p // 12)\nprint("Loose pencils:", p - 12)' },
    { who: "Cara", task: "maths-L9b", phase: "practice", want: [], newVariant: true,
      code: 'pencils = int(input("Pencils: "))\nprint("Full packs:", pencils // 12)\nprint("Loose pencils:", pencils - 12)' },
    { who: "Cara", task: "while-P9a", phase: "placement", want: ["LOOP_NO_UPDATE"],
      code: 'n = int(input())\nwhile n < 1 or n > 10:\n    print("Try again")\nprint("Thanks")' },
    { who: "Cara", task: "if-L5a", phase: "practice", want: ["EQUALS_VS_DOUBLE_EQUALS"], parsons: true,
      code: 'password = input("Password: ")\nif password = "sparx123":\n    print("Access granted")' },
    { who: "Cara", task: "var-L9d", phase: "practice", want: ["INPUT_NOT_INT"], code: 'a = input()\nprint("In 5 years you will be", a + 5)' },
    { who: "Ben", task: "if-L3a", phase: "practice", want: ["GT_VS_GTE"], code: fillCode(byId["if-L3a"], [">"]) },
    { who: "Ava", task: "out-P5a", phase: "placement", want: [], parsons: true,
      code: 'print("Step 2: Boil the water")\nprint("Step 1: Fill the kettle")\nprint("Step 3: Pour into the cup")' },
    { who: "Ava", task: "var-P2a", phase: "placement", want: ["INPUT_NOT_INT"], choice: 0 },
    { who: "Ben", task: "var-P2a", phase: "placement", want: [], choice: 3 },
    { who: "Ben", task: "var-L9b", phase: "practice", want: [], empty: true },
  ];
  const jobs = [];
  for (const sc of scenarios) {
    if (sc.choice != null || sc.empty) continue;
    sc.jobFrom = jobs.length;
    byId[sc.task].tests.forEach((test) => jobs.push({ code: sc.code, inputs: test.inputs }));
  }
  const runs = runPython(jobs);
  const records = [];
  scenarios.forEach((sc, k) => {
    const t = byId[sc.task];
    let failure = null;
    let passed = false;
    if (sc.choice != null) {
      passed = sc.choice === t.answer;
      failure = passed ? null : Checker.classifyAttempt({ type: "predict", choice: sc.choice, options: t.options, answer: t.answer });
    } else if (sc.empty) {
      failure = Checker.classifyAttempt({ type: t.type, empty: true });
    } else {
      const results = runs.slice(sc.jobFrom, sc.jobFrom + t.tests.length);
      const passes = results.map((r, i) => !r.error && Checker.outputsMatch(r.output, t.tests[i].expected));
      let parsons = null;
      if (t.type === "parsons") {
        const lines = sc.code.split("\n").map((l) => l.trim());
        parsons = { usedDistractor: t.distractors.some((d) => lines.includes(d.trim())), missing: t.solution.split("\n").some((l) => !lines.includes(l.trim())) };
      }
      passed = passes.every(Boolean) && !(parsons && (parsons.usedDistractor || parsons.missing));
      failure = passed ? null : Checker.classifyAttempt({ type: t.type, code: sc.code, results, tests: t.tests, passes, parsons });
    }
    check(passed === !!sc.pass, `Scenario ${k + 1} (${sc.task}) should ${sc.pass ? "pass" : "fail"}`);
    const rec = App.attemptRecord({ task: t, unit: t.unit, phase: sc.phase, attemptNumber: 1, hints: k % 3, result: passed ? "pass" : "fail",
      failure, code: sc.code || "", levelBefore: t.level, levelAfter: t.level });
    const saved = Store.logAttempt(S[sc.who], rec);
    records.push({ sc, saved });
    if (!passed) check(JSON.stringify(saved.misconceptions) === JSON.stringify(sc.want),
      `Matching: scenario ${k + 1} (${sc.task}) matched ${JSON.stringify(saved.misconceptions)}, expected ${JSON.stringify(sc.want)}`);
  });
  check(records.filter((r) => r.saved.result === "fail" && r.saved.misconceptions.length).length >= 5, "Matching: answers that match a buggy variant are tagged");
  check(records.some((r) => r.sc.task === "sel-P9a" && r.saved.result === "fail" && !r.saved.misconceptions.length), "Matching: an answer that matches no buggy variant is not tagged");
  check(records.find((r) => r.sc.empty).saved.misconceptions.length === 0, "Matching: NO_ANSWER attempts are never tagged");
  const failedRec = records.find((r) => r.saved.result === "fail" && r.saved.code);
  check(failedRec && failedRec.saved.code && "output" in failedRec.saved && failedRec.saved.category && failedRec.saved.failedTest && failedRec.saved.expected != null,
    "A failed attempt stores the code, its output, the category and the failing test's details");

  // Skips, level changes, button uses and placement results, through the real Store.
  Store.logAttempt(S.Cara, App.attemptRecord({ task: byId["maths-L9b"], unit: "maths", phase: "practice", kind: "skip", attemptNumber: 0, hints: 0, result: "skipped", levelBefore: 9, levelAfter: 8 }));
  Store.logLevelChange({ studentId: S.Cara, unit: "maths", from: 9, to: 8, reason: "fails", taskId: "maths-L9b" });
  Store.logLevelChange({ studentId: S.Ava, unit: "selection", from: 1, to: 5, reason: "placement" });
  const benMaths = App.freshUnitState(6);
  App.pressLevelButton({ state: benMaths, button: "too-easy", studentId: S.Ben, unitId: "maths", taskId: "maths-L6a", store: Store });
  Store.logPlacement({ studentId: S.Ava, unit: "selection", kind: "result", results: [{ level: 2, taskId: "sel-P2a", passed: true, attempts: 1, hints: 0 }], startLevel: 2 });
  Store.logPlacement({ studentId: S.Ava, unit: "selection", kind: "reset", by: "teacher" });
  const avaProgress = { units: { selection: Object.assign(App.freshUnitState(5), { placement: { status: "done", startLevel: 5 }, passedTop: true, failsInARow: 2, current: { taskId: "if-L5a" } }) } };
  Store.saveProgress(S.Ava, avaProgress);
  Store.saveProgress(S.Ben, { units: { maths: benMaths } });

  // ===================== Export =====================
  const data = TD.collect(Store, Curriculum.UNITS);
  const exportRows = TD.fullExportRows(data);
  const allAttempts = Object.values(S).flatMap((id) => Store.attempts(id));
  const idsOf = (type) => new Set(exportRows.filter((r) => r.record_type === type || (Array.isArray(type) && type.includes(r.record_type))).map((r) => r.record_id));
  const attemptIds = idsOf(["attempt", "skip"]);
  check(allAttempts.length === scenarios.length + 1 && allAttempts.every((a) => attemptIds.has(a.id)) && attemptIds.size === allAttempts.length,
    "The full export contains every attempt (and skip)");
  check(exportRows.filter((r) => r.record_type === "level_change").length === Store.levelLog().length && Store.levelLog().length === 3, "The full export contains every level change");
  const buttonIds = idsOf("button_use");
  check(Store.buttonLog().length === 1 && Store.buttonLog().every((b) => buttonIds.has(b.id)), "The full export contains every button use");
  const placementIds = idsOf(["placement_result", "placement_reset"]);
  check(Store.placementLog().length === 2 && Store.placementLog().every((p) => placementIds.has(p.id)), "The full export contains every placement result (and reset)");
  const csv = TD.fullExportCsv(data);
  const header = csv.split("\r\n")[0].split(",");
  check(["student_code", "student_output", "failure_category", "misconception_matches", "failed_test_inputs"].every((c) => header.includes(c)),
    "The full export includes the student's code, output, category, matches and failing-test inputs");
  const dict = parseCsv(TD.dataDictionaryCsv(misconceptions));
  check(header.every((c) => dict.some((d) => d.kind === "column" && d.name === c && d.meaning.length > 20)), "data-dictionary.csv explains every column of the full export");
  check(misconceptions.every((m) => dict.some((d) => d.name === m.id)) && Checker.CATEGORIES.every((c) => dict.some((d) => d.name === c)),
    "data-dictionary.csv explains every failure category and misconception id");

  // Teacher view sums
  const ql = TD.quickLook(data, misconceptions);
  check(ql.struggling.some((s) => s.name === "Ava" && s.unit === "selection" && s.taskId === "if-L5a"), "Quick look lists students with 2+ fails in a row and their current task");
  check(ql.notStarted.some((s) => s.name === "Cara" && s.units.length === Curriculum.UNITS.length), "Quick look lists students who haven't started a unit");
  check(ql.topFailedTasks[0] && ql.topFailedTasks[0].taskId === "maths-L9b" && ql.topFailedTasks[0].topCategory === "WRONG_OUTPUT" && ql.topFailedTasks[0].topMisconception === "INT_DIV_VS_DIV",
    "Quick look's most-failed tasks give the failure rate, most common category and top misconception");
  const overview = TD.overviewRows(data);
  const ava = overview.find((r) => r.name === "Ava").cells.selection;
  const ben = overview.find((r) => r.name === "Ben").cells.maths;
  check(ava.complete && ava.alert && ava.placementStart === 5 && ben.tooEasy && !ben.tooHard, "Overview cells show level 10 passed, placement, button flags and 2+ fails in a row");
  const detail = TD.detailRows(data);
  check(TD.filterDetail(detail, { misconception: "GT_VS_GTE" }).length === 2 && TD.filterDetail(detail, { category: "NO_ANSWER" }).length === 1 &&
    TD.filterDetail(detail, { student: S.Ben, unit: "maths" }).length === 3, "The detail log filters by student, unit, category and misconception");
  const ws = TD.workshop(data, misconceptions, byId);
  const l9b = ws.tasks.find((t) => t.taskId === "maths-L9b");
  check(l9b && l9b.fails === 3 && l9b.unmatched === 2 && Math.abs(l9b.unmatchedRate - 2 / 3) < 1e-9 && l9b.unmatchedAttempts.every((r) => r.code && "output" in r),
    "The workshop page counts unmatched failed attempts per task, with their code and output");

  // ===================== recheck.py =====================
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "py-practice-"));
  try {
    const exportPath = path.join(tmp, "full-data.csv");
    fs.writeFileSync(exportPath, "\ufeff" + csv);
    const tasksPath = path.join(ROOT, "tasks.json");
    const same = runRecheck(exportPath, tasksPath, path.join(tmp, "same.csv"));
    if (check(same.ok, "recheck.py runs on an exported full-data CSV" + (same.ok ? "" : ": " + same.stderr))) {
      const failedRows = same.rows.filter((r) => r.record_type === "attempt" && r.result === "fail");
      const appMatches = Object.fromEntries(allAttempts.map((a) => [a.id, (a.misconceptions || []).join(";")]));
      check(failedRows.length === allAttempts.filter((a) => a.result === "fail").length, "recheck.py rechecks every failed attempt");
      check(failedRows.every((r) => r.misconception_matches === appMatches[r.record_id] && r.matches_changed === "no"),
        "recheck.py on an unchanged export gives the same matches as the app recorded");
      check(same.rows.length === exportRows.length, "recheck.py keeps every row of the export");
    }

    // A teacher adds a new buggy variant (no stored outputs yet): only the attempts it applies to change.
    const modified = JSON.parse(JSON.stringify(tasks));
    modified.find((t) => t.id === "maths-L9b").buggy_variants.push({
      misconception: "MODULO_AS_SUBTRACTION",
      code: 'pencils = int(input("Pencils: "))\nprint("Full packs:", pencils // 12)\nprint("Loose pencils:", pencils - 12)',
    });
    const modPath = path.join(tmp, "tasks-with-new-variant.json");
    fs.writeFileSync(modPath, JSON.stringify(modified));
    const after = runRecheck(exportPath, modPath, path.join(tmp, "new.csv"));
    if (check(after.ok, "recheck.py runs with a newly added buggy variant" + (after.ok ? "" : ": " + after.stderr))) {
      const expectChanged = new Set(records.filter((r) => r.sc.newVariant).map((r) => r.saved.id));
      const changed = after.rows.filter((r) => r.matches_changed === "yes");
      check(changed.length === expectChanged.size && changed.every((r) => expectChanged.has(r.record_id) && r.misconception_matches.split(";").includes("MODULO_AS_SUBTRACTION")),
        "A new buggy variant changes the matches only for the attempts it applies to");
      const ben = after.rows.find((r) => r.record_id === records[4].saved.id);
      check(ben && ben.misconception_matches === "INT_DIV_VS_DIV" && ben.matches_changed === "no", "Other attempts on the same task keep their matches");
    }

    // An export from before while-P9a moved out of Selection names it by its old id, sel-P9b (its former_ids).
    const movedTask = tasks.find((t) => t.id === "while-P9a");
    check(movedTask && (movedTask.former_ids || []).includes("sel-P9b"), "Moved tasks keep their old id in former_ids");
    const oldPath = path.join(tmp, "old-ids.csv");
    fs.writeFileSync(oldPath, "﻿" + csv.split("while-P9a").join("sel-P9b"));
    const old = runRecheck(oldPath, tasksPath, path.join(tmp, "old.csv"));
    if (check(old.ok, "recheck.py runs on an export with old task ids" + (old.ok ? "" : ": " + old.stderr))) {
      const cara = old.rows.find((r) => r.task_id === "sel-P9b" && r.record_type === "attempt");
      check(cara && cara.misconception_matches === "LOOP_NO_UPDATE" && cara.matches_changed === "no",
        "recheck.py finds a moved task by its old id, so older exports keep their matches");
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return out;
}

if (require.main === module) {
  const { runPython } = require(path.join(ROOT, "tools", "run-python.js"));
  const tasks = JSON.parse(fs.readFileSync(path.join(ROOT, "tasks.json"), "utf8"));
  const misconceptions = JSON.parse(fs.readFileSync(path.join(ROOT, "misconceptions.json"), "utf8"));
  const results = runFeatureTests({ tasks, misconceptions, runPython });
  const failed = results.filter((r) => !r.ok);
  results.forEach((r) => console.log((r.ok ? "  ok   " : "  FAIL ") + r.message));
  console.log(`\n${results.length - failed.length} of ${results.length} feature checks passed.`);
  process.exit(failed.length ? 1 : 0);
}

module.exports = { runFeatureTests, parseCsv };
