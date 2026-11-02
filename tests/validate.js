// Validates tasks.json and the checking/adaptive logic.
// Usage:  node tests/validate.js
// Needs Python 3 on the PATH (or set PYTHON=path\to\python). Uses harness.py,
// the same runner that the browser loads into Pyodide.

"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const Checker = require(path.join(ROOT, "checker.js"));
const Curriculum = require(path.join(ROOT, "curriculum.js"));
const App = require(path.join(ROOT, "app.js"));
const Simulation = require(path.join(__dirname, "simulate.js"));
const Features = require(path.join(__dirname, "features.js"));
const { runPython } = require(path.join(ROOT, "tools", "run-python.js"));
const { computeVariantOutputs } = require(path.join(ROOT, "tools", "build-variants.js"));

const REQUIRED = ["id", "unit", "level", "type", "title", "description", "starter", "solution", "tests", "hints", "tags", "skills"];
const TYPES = ["fill", "parsons", "predict", "write"];
const UNIT_IDS = Curriculum.UNITS.map((u) => u.id);
const MIN_TASKS_PER_UNIT = 30;
const MIN_PER_UNIT_LEVEL = 3;
const MIN_SELECTION_TASKS = 100;

const failures = [];
let checks = 0;
function check(cond, message) {
  checks++;
  if (!cond) failures.push(message);
  return cond;
}

// ---------- Load tasks ----------
let tasks;
try {
  tasks = JSON.parse(fs.readFileSync(path.join(ROOT, "tasks.json"), "utf8"));
} catch (e) {
  console.error("tasks.json is not valid JSON:", e.message);
  process.exit(1);
}

// ---------- Bank-level checks ----------
check(Array.isArray(tasks), "tasks.json must contain an array");
// Units with no tasks are shown as "Coming soon"; every unit that has tasks must be complete.
const unitsWithTasks = UNIT_IDS.filter((u) => tasks.some((t) => t.unit === u));
check(unitsWithTasks.length === UNIT_IDS.length, `Every unit should have tasks; missing: ${UNIT_IDS.filter((u) => !unitsWithTasks.includes(u)).join(", ")}`);
for (const unit of unitsWithTasks) {
  const mine = tasks.filter((t) => t.unit === unit);
  check(mine.length >= MIN_TASKS_PER_UNIT, `Unit "${unit}" needs at least ${MIN_TASKS_PER_UNIT} tasks, found ${mine.length}`);
  for (let lv = 1; lv <= 10; lv++) {
    const count = mine.filter((t) => t.level === lv).length;
    check(count >= MIN_PER_UNIT_LEVEL, `Unit "${unit}" level ${lv} needs at least ${MIN_PER_UNIT_LEVEL} tasks, found ${count}`);
    // Tasks kept out of low levels (skillMinLevel) must still leave enough to choose from.
    const settable = App.tasksAt(tasks, unit, lv).length;
    check(settable >= MIN_PER_UNIT_LEVEL, `Unit "${unit}" level ${lv} has only ${settable} tasks that can be set (after skillMinLevel)`);
  }
  for (const type of TYPES) check(mine.some((t) => t.type === type), `Unit "${unit}" has no tasks of type "${type}"`);
}
check(tasks.filter((t) => t.unit === "selection").length >= MIN_SELECTION_TASKS, `Selection should keep at least ${MIN_SELECTION_TASKS} tasks`);
const ids = tasks.map((t) => t.id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
check(dupes.length === 0, "Duplicate task ids: " + dupes.join(", "));

// ---------- Placement tasks ----------
// At least 2 per placement level in each unit, so a teacher reset gives the student different tasks.
const MIN_PLACEMENT_PER_LEVEL = 2;
for (const unit of UNIT_IDS) {
  for (const lv of App.PLACEMENT_LEVELS) {
    const n = tasks.filter((t) => t.unit === unit && t.level === lv && App.isPlacementTask(t)).length;
    check(n >= MIN_PLACEMENT_PER_LEVEL, `Unit "${unit}" needs at least ${MIN_PLACEMENT_PER_LEVEL} placement tasks at level ${lv}, found ${n}`);
  }
}
check(App.PLACEMENT_MAX_LEVEL === 8 && App.BUTTON_JUMP_LEVELS === 1, "PLACEMENT_MAX_LEVEL is 8 and BUTTON_JUMP_LEVELS is 1");

// ---------- Misconceptions and buggy variants ----------
let misconceptions = [];
try {
  misconceptions = JSON.parse(fs.readFileSync(path.join(ROOT, "misconceptions.json"), "utf8"));
} catch (e) {
  check(false, "misconceptions.json is not valid JSON: " + e.message);
}
const MISCONCEPTION_IDS = misconceptions.map((m) => m.id);
check(new Set(MISCONCEPTION_IDS).size === MISCONCEPTION_IDS.length, "misconceptions.json has duplicate ids");
for (const m of misconceptions) check(/^[A-Z][A-Z_]+$/.test(m.id) && m.name && m.description, `misconceptions.json: ${m.id} needs an UPPER_CASE id, a name and a description`);
const MAX_MISCONCEPTIONS_PER_TASK = 3;
const isMisconceptionTag = (tag) => /^[A-Z][A-Z_]+$/.test(tag);
const variantOutputs = computeVariantOutputs(tasks);
tasks.forEach((t, ti) => {
  const tagged = (t.tags || []).filter(isMisconceptionTag);
  check(tagged.length <= MAX_MISCONCEPTIONS_PER_TASK, `${t.id}: has ${tagged.length} misconception ids in its tags (at most ${MAX_MISCONCEPTIONS_PER_TASK})`);
  for (const v of t.buggy_variants || []) {
    check(tagged.includes(v.misconception), `${t.id}: buggy variant for ${v.misconception} needs that id in the task's tags`);
    check(typeof v.code === "string" && v.code.trim(), `${t.id}: buggy variant for ${v.misconception} has no code`);
  }
  (variantOutputs[ti].buggy_variants || []).forEach((fresh, vi) => {
    const v = t.buggy_variants[vi];
    check(JSON.stringify(fresh.outputs) === JSON.stringify(v.outputs), `${t.id}: stored outputs of the ${v.misconception} variant are out of date – run: node tools/build-variants.js`);
    const differs = fresh.outputs.some((o, k) => o.errorKind || !Checker.outputsMatch(o.output, t.tests[k].expected));
    check(differs, `${t.id}: the ${v.misconception} variant passes every test, so it can never match a failed attempt`);
    check(!fresh.outputs.some((o) => o.errorKind === "SyntaxError" || o.errorKind === "IndentationError"),
      `${t.id}: the ${v.misconception} variant ends in a general syntax error, which would match any syntax error`);
    check(!fresh.outputs.some((o) => o.errorKind === "Timeout") || v.misconception === "LOOP_NO_UPDATE",
      `${t.id}: only LOOP_NO_UPDATE variants may run forever`);
    if (t.type === "predict") {
      const wrong = t.options.filter((o, i) => i !== t.answer).map(Checker.normalise);
      check(wrong.includes(fresh.outputs[0].output), `${t.id}: the ${v.misconception} variant's output should be one of the wrong options`);
    }
  });
});

// Every misconception with a buggy variant has at least 3 bank (non-placement) tasks with a variant for it.
// In the loops units this holds within those units, so their own tasks can show each misconception they use.
const MIN_BANK_TASKS_PER_MISCONCEPTION = 3;
const LOOP_UNITS = ["loops-condition", "loops-count"];
const isBank = (t) => !(t.tags || []).includes("placement");
const variantIds = (t) => new Set((t.buggy_variants || []).map((v) => v.misconception));
for (const [scope, pool] of [["all units", tasks], ["the loops units", tasks.filter((t) => LOOP_UNITS.includes(t.unit))]]) {
  const used = new Set(pool.flatMap((t) => [...variantIds(t)]));
  for (const id of used) {
    const n = pool.filter((t) => isBank(t) && variantIds(t).has(id)).length;
    check(n >= MIN_BANK_TASKS_PER_MISCONCEPTION, `${id} needs buggy variants on at least ${MIN_BANK_TASKS_PER_MISCONCEPTION} bank tasks in ${scope}, found ${n}`);
  }
}
// A task moved to another unit keeps its old ids (former_ids), so older exports still find it. They must not clash.
const currentIds = new Set(tasks.map((t) => t.id));
const formerIds = tasks.flatMap((t) => t.former_ids || []);
check(formerIds.every((id) => !currentIds.has(id)) && new Set(formerIds).size === formerIds.length, "former_ids must be unique and not used by a current task");

// Unit order on the landing page, and a skill that is in two units' lists counting for the task's own unit.
check(UNIT_IDS.join() === "output,variables,maths,selection,loops-condition,loops-count", "Units are listed with Selection, then the two loops units");
check(App.unitOfSkill("accumulator", ["loops-condition"]) === "loops-condition" && App.unitOfSkill("accumulator", ["loops-count"]) === "loops-count" &&
  App.unitOfSkill("accumulator") === "loops-condition", "A skill in two units' lists belongs to the task's own unit");

// ---------- Per-task schema checks (bank tasks and template variants) ----------
// Skills a task may use: its own units' skills. "Write from scratch" tasks may also use skills from earlier units.
function allowedSkills(t) {
  const units = t.type === "scratch" ? UNIT_IDS.slice(0, UNIT_IDS.indexOf(t.unit) + 1) : (t.units || [t.unit]);
  return units.flatMap((u) => (Curriculum.unitById(u) || { skills: [] }).skills);
}

function checkTask(t) {
  const name = t.id || JSON.stringify(t).slice(0, 40);
  for (const f of REQUIRED) check(f in t, `${name}: missing field "${f}"`);
  check(Number.isInteger(t.level) && t.level >= 1 && t.level <= 10, `${name}: level must be an integer 1-10`);
  const types = t.generated ? TYPES.concat(["scratch"]) : TYPES; // "scratch" tasks only come from templates
  check(types.includes(t.type), `${name}: unknown type "${t.type}"`);
  check(UNIT_IDS.includes(t.unit), `${name}: unknown unit "${t.unit}"`);
  for (const u of t.units || []) check(UNIT_IDS.includes(u), `${name}: unknown unit "${u}" in units`);
  check(Array.isArray(t.skills) && t.skills.length >= 1 && t.skills.length <= 3, `${name}: needs 1 to 3 skill tags in "skills" (a task with no skill tag fails)`);
  const okSkills = allowedSkills(t);
  for (const s of t.skills || []) check(okSkills.includes(s), `${name}: skill "${s}" is not in the skill list for its unit(s) (curriculum.js)`);
  const ladder = Curriculum.LEVELS[t.level - 1];
  if (t.type === "scratch") {
    check(t.level === Curriculum.SCRATCH_LEVEL, `${name}: write-from-scratch tasks are level ${Curriculum.SCRATCH_LEVEL}`);
    check(t.starter === "", `${name}: write-from-scratch tasks start with a blank editor (starter "")`);
    check(t.tests.length >= 1, `${name}: write-from-scratch tasks need tests`);
  } else if (ladder) check(t.type === ladder.type, `${name}: level ${t.level} tasks must be "${ladder.type}" (${ladder.name}), not "${t.type}"`);
  check(typeof t.title === "string" && t.title.trim(), `${name}: title must be a non-empty string`);
  check(typeof t.description === "string" && t.description.trim(), `${name}: description must be a non-empty string`);
  check(typeof t.starter === "string", `${name}: starter must be a string (use "" if not needed)`);
  check(typeof t.solution === "string" && t.solution.trim(), `${name}: solution must be a non-empty string`);
  check(Array.isArray(t.hints) && t.hints.length >= 1 && t.hints.length <= 3, `${name}: needs 1 to 3 hints`);
  check(Array.isArray(t.hints) && t.hints.every((h) => typeof h === "string" && h.trim()), `${name}: hints must be non-empty strings`);
  check(Array.isArray(t.tags) && t.tags.length > 0, `${name}: needs at least one tag`);
  check(Array.isArray(t.tests) && t.tests.length > 0, `${name}: needs at least one test`);
  (t.tests || []).forEach((test, i) => {
    check(Array.isArray(test.inputs) && test.inputs.every((v) => typeof v === "string"), `${name} test ${i + 1}: inputs must be a list of strings`);
    check(typeof test.expected === "string", `${name} test ${i + 1}: expected must be a string`);
  });

  if (t.type === "fill") {
    const blanks = (t.starter.match(/____/g) || []).length;
    check(blanks >= 1 && blanks <= 2, `${name}: fill tasks need 1 or 2 blanks (____), found ${blanks}`);
    if (t.level === 3) check(blanks === 1, `${name}: level 3 fill tasks have exactly 1 blank`);
    if (t.level === 4) check(blanks === 2, `${name}: level 4 fill tasks have exactly 2 blanks`);
    if (t.level === 7) check((t.answers || []).some((a) => a.includes(" ")),
      `${name}: level 7 fill tasks must blank out a whole condition or line (an answer containing a space)`);
    check(Array.isArray(t.answers) && t.answers.length === blanks, `${name}: answers must have one entry per blank`);
    if (Array.isArray(t.answers) && t.answers.length === blanks) {
      const filled = t.starter.split("____").reduce((acc, part, i) => acc + t.answers[i - 1] + part);
      check(filled === t.solution, `${name}: starter with answers filled in doesn't equal the solution`);
    }
  }
  if (t.type === "parsons") {
    check(Array.isArray(t.distractors) && t.distractors.length >= 1 && t.distractors.length <= 2, `${name}: parsons tasks need 1 or 2 distractors`);
    if (t.level === 5) check((t.distractors || []).length === 1, `${name}: level 5 parsons tasks have exactly 1 distractor`);
    if (t.level === 6) check((t.distractors || []).length === 2, `${name}: level 6 parsons tasks have exactly 2 distractors`);
    const lines = t.solution.split("\n");
    check(lines.every((l) => l.trim() !== ""), `${name}: parsons solutions must not contain blank lines`);
    check(lines.every((l) => /^( {4})*\S/.test(l)), `${name}: parsons solution lines must be indented in multiples of 4 spaces`);
    const solutionTexts = lines.map((l) => l.trim());
    for (const d of t.distractors || []) check(!solutionTexts.includes(d.trim()), `${name}: distractor "${d}" is identical to a solution line`);
  }
  if (t.type === "predict") {
    check(Array.isArray(t.options) && t.options.length >= 3 && t.options.length <= 4, `${name}: predict tasks need 3 or 4 options`);
    check(Number.isInteger(t.answer) && t.answer >= 0 && t.answer < (t.options || []).length, `${name}: answer must be an index into options`);
    const norm = (t.options || []).map(Checker.normalise);
    check(new Set(norm).size === norm.length, `${name}: options must all be different`);
    check(t.tests.length === 1, `${name}: predict tasks have exactly one test`);
    check(Checker.normalise(t.tests[0].expected) === norm[t.answer], `${name}: the test's expected output must equal the correct option`);
  }
  if (t.type === "write") {
    check(typeof t.starter === "string", `${name}: write tasks need a starter (may be a comment)`);
  }
}
tasks.forEach(checkTask);

// ---------- Templates (templates.json) ----------
const Templates = require(path.join(ROOT, "templates.js"));
const VARIANTS_PER_TEMPLATE = 20;   // variants made from each template (seeds 1..20)
const MIN_DIFFERENT_VARIANTS = 5;
const MIN_COMBINED_TEMPLATES = 10;
let templates = [];
try {
  templates = JSON.parse(fs.readFileSync(path.join(ROOT, "templates.json"), "utf8"));
} catch (e) {
  check(false, "templates.json is not valid JSON: " + e.message);
}
const variants = [];
const variantCounts = {};
const tplIds = templates.map((t) => t.id);
check(tplIds.length === new Set(tplIds).size, "Duplicate template ids");
for (const tpl of templates) {
  const name = "template " + tpl.id;
  check(Array.isArray(tpl.units) && tpl.units.length >= 1 && tpl.units.every((u) => UNIT_IDS.includes(u)), `${name}: units must be a list of known units`);
  if (!Array.isArray(tpl.units)) continue;
  if (tpl.units.length >= 2) {
    // A combined task must really combine: every unit it counts towards contributes a skill.
    for (const u of tpl.units) check((tpl.skills || []).some((s) => App.unitOfSkill(s, [u]) === u), `${name}: combined template has no skill from unit "${u}"`);
    check(tpl.type !== "scratch", `${name}: write-from-scratch templates belong to one unit`);
  }
  const sigs = new Set();
  for (let seed = 1; seed <= VARIANTS_PER_TEMPLATE; seed++) {
    let v;
    try { v = Templates.expand(tpl, seed); } catch (e) { check(false, `${name}: ${e.message}`); break; }
    check(Templates.expand(tpl, seed).id === v.id && Templates.signature(Templates.expand(tpl, seed)) === Templates.signature(v), `${name}: the same seed must give the same variant`);
    const sig = Templates.signature(v);
    if (sigs.has(sig)) continue; // identical variants are only checked once
    sigs.add(sig);
    variants.push(v);
    checkTask(v);
  }
  variantCounts[tpl.id] = sigs.size;
  check(sigs.size >= MIN_DIFFERENT_VARIANTS, `${name}: makes only ${sigs.size} different variants from ${VARIANTS_PER_TEMPLATE} seeds (need ${MIN_DIFFERENT_VARIANTS})`);
}
// Endless mode never runs out: every unit has a single-unit template at every level, and a from-scratch template.
for (const unit of UNIT_IDS) {
  for (let lv = 1; lv <= 10; lv++) check(App.singleTemplates(templates, unit, lv).length >= 1, `No template for unit "${unit}" at level ${lv} (endless mode would run out)`);
  check(App.scratchTemplates(templates, unit).length >= 1, `No write-from-scratch template for unit "${unit}"`);
}
const combinedCount = templates.filter((t) => Array.isArray(t.units) && t.units.length >= 2).length;
check(combinedCount >= MIN_COMBINED_TEMPLATES, `Need at least ${MIN_COMBINED_TEMPLATES} combined templates, found ${combinedCount}`);

// ---------- Run every reference solution against its own tests ----------
const jobs = [];
const meta = [];
for (const t of tasks.concat(variants)) {
  (t.tests || []).forEach((test, i) => {
    jobs.push({ code: t.solution, inputs: test.inputs });
    meta.push({ kind: "solution", t, i });
  });
  // Parsons: rebuilding the code from stripped lines + indent levels must still pass.
  if (t.type === "parsons") {
    const rebuilt = t.solution.split("\n").map((l) => " ".repeat(4 * Math.floor((l.length - l.trimStart().length) / 4)) + l.trim()).join("\n");
    t.tests.forEach((test, i) => { jobs.push({ code: rebuilt, inputs: test.inputs }); meta.push({ kind: "parsons-rebuilt", t, i }); });
  }
  // The starter code on its own must NOT already pass every test.
  if ((t.type === "write" || t.type === "fill" || t.type === "scratch") && t.starter.trim()) {
    t.tests.forEach((test, i) => { jobs.push({ code: t.starter, inputs: test.inputs }); meta.push({ kind: "starter", t, i }); });
  }
  // Predict: every wrong option must differ from the real output.
  if (t.type === "predict") {
    jobs.push({ code: t.solution, inputs: t.tests[0].inputs });
    meta.push({ kind: "predict-options", t, i: 0 });
  }
}

console.log(`Running ${jobs.length} Python programs with ${process.env.PYTHON || "python"}…`);
const results = runPython(jobs);
const starterPasses = {};
results.forEach((r, k) => {
  const { kind, t, i } = meta[k];
  const test = t.tests[i];
  if (kind === "solution" || kind === "parsons-rebuilt") {
    const label = kind === "solution" ? "reference solution" : "rebuilt parsons solution";
    if (check(!r.error, `${t.id}: ${label} raised ${r.error && r.error.type} on test ${i + 1} (${r.error && r.error.message})`)) {
      check(Checker.outputsMatch(r.output, test.expected),
        `${t.id}: ${label} fails test ${i + 1}\n    inputs:   ${JSON.stringify(test.inputs)}\n    expected: ${JSON.stringify(test.expected)}\n    got:      ${JSON.stringify(Checker.normalise(r.output))}`);
      check(r.inputsLeft === 0, `${t.id}: ${label} did not use all inputs on test ${i + 1}`);
    }
  } else if (kind === "starter") {
    starterPasses[t.id] = starterPasses[t.id] === undefined ? true : starterPasses[t.id];
    if (r.error || !Checker.outputsMatch(r.output, test.expected)) starterPasses[t.id] = false;
  } else if (kind === "predict-options") {
    t.options.forEach((opt, oi) => {
      if (oi !== t.answer) check(!Checker.outputsMatch(r.output, opt), `${t.id}: wrong option ${oi + 1} matches the real output`);
    });
  }
});
for (const [id, passes] of Object.entries(starterPasses)) check(!passes, `${id}: starter code already passes every test`);

// ---------- Harness and friendly error checks ----------
const harnessCases = [
  { code: "while True:\n    print('x')", inputs: [], expectType: "TooMuchOutput" },
  { code: "a = input()\nb = input()", inputs: ["1"], expectType: "NoMoreInput" },
  { code: "x = 5\nif x = 5:\n    print('y')", inputs: [], expectType: "SyntaxError", expectTitle: /= instead of ==/ },
  { code: "if 3 > 2\n    print('y')", inputs: [], expectType: "SyntaxError", expectTitle: /Missing colon/ },
  { code: "if 3 > 2:\nprint('y')", inputs: [], expectType: "IndentationError", expectTitle: /Missing indentation/ },
  { code: "age = input()\nif age > 5:\n    print('y')", inputs: ["7"], expectType: "TypeError", expectTitle: /Comparing text with a number/ },
  { code: "n = int(input())", inputs: ["abc"], expectType: "ValueError", expectTitle: /number/ },
  { code: "print(score)", inputs: [], expectType: "NameError", expectTitle: /score/ },
  { code: "x = 3\nif x > 2:\n    print('a')\nelse x < 2:\n    print('b')", inputs: [], expectType: "SyntaxError", expectTitle: /else/ },
  { code: "print('hi', end='')\nprint(input('Name: '))", inputs: ["Sam"], expectOutput: "hiSam\n" },
];
const hres = runPython(harnessCases.map((c) => ({ code: c.code, inputs: c.inputs })));
harnessCases.forEach((c, k) => {
  const r = hres[k];
  if (c.expectOutput !== undefined) {
    check(!r.error && r.output === c.expectOutput, `harness case ${k + 1}: expected output ${JSON.stringify(c.expectOutput)} (input prompts must not be printed), got ${JSON.stringify(r.output)}`);
    return;
  }
  if (!check(r.error && r.error.type === c.expectType, `harness case ${k + 1}: expected ${c.expectType}, got ${r.error ? r.error.type : "no error"}`)) return;
  const friendly = Checker.explainError(r.error);
  check(friendly && friendly.title && friendly.detail, `harness case ${k + 1}: no friendly explanation`);
  check(!/Traceback|File "/.test(friendly.title + friendly.detail), `harness case ${k + 1}: explanation contains traceback text`);
  if (c.expectTitle) check(c.expectTitle.test(friendly.title), `harness case ${k + 1}: expected title matching ${c.expectTitle}, got "${friendly.title}"`);
});
check(Checker.explainError({ type: "Timeout" }).title.includes("too long"), "Timeout explanation missing");
check(Checker.outputsMatch("Pass   \n\n", "Pass"), "Trailing whitespace should be ignored");
check(!Checker.outputsMatch("pass", "Pass"), "Comparison should be case-sensitive");

// ---------- Adaptive logic ----------
{
  const { applyOutcome, chooseTask, tasksAt, freshUnitState, levelMessage, START_LEVEL, MAX_LEVEL, MIN_LEVEL } = App;
  const fresh = freshUnitState();
  check(START_LEVEL === 1 && fresh.level === 1 && fresh.highest === 1, "Without test mode, every new unit starts at level 1");
  check(freshUnitState(7).level === 7 && freshUnitState(7).highest === 7, "Test mode can start a unit at a chosen level");
  check(MIN_LEVEL === 1 && MAX_LEVEL === 10, "Levels run from 1 to 10");

  const after = (state, ...outcomes) => outcomes.reduce((s, o) => Object.assign({}, s, applyOutcome(s, o)), Object.assign(freshUnitState(), state));
  const P = (skill, hints) => ({ passed: true, hints: hints || 0, skills: [skill] });
  const F = (skill) => ({ passed: false, hints: 0, skills: [skill] });

  let s = after({ level: 3 }, P("if", 1));
  check(s.level === 3 && s.passStreak === 1, "One strong pass: stay, streak 1");
  s = after({ level: 3 }, P("if", 1), P("elif"));
  check(s.level === 4, "Two strong passes in a row (1 hint or fewer): move up 1");
  s = after({ level: 3 }, P("if"), P("elif", 2));
  check(s.level === 3 && s.passStreak === 0 && s.strongRun === 0, "Pass with 2 hints: stay and reset both pass streaks");
  s = after({ level: 3 }, F("if"));
  check(s.level === 3 && s.failStreak === 1 && s.failsInARow === 1, "One fail: stay");
  s = after({ level: 3 }, F("if"), F("elif"));
  check(s.level === 2 && s.failsInARow === 2, "Two fails in a row: move down 1, and failsInARow is kept for the teacher view");
  s = after({ level: 3 }, F("if"), F("elif"), F("if"));
  check(s.failsInARow === 3 && s.level === 2, "failsInARow keeps counting after a level change; failStreak restarts");
  s = after({ level: 5 }, P("if", 3));
  check(s.level === 4, "3 hints on a task: move down even if passed");
  s = after({ level: 1 }, F("if"), F("if"));
  check(s.level === 1, "Can't go below level 1");
  s = after({ level: 10 }, P("if"), P("elif"));
  check(s.level === 10, "Can't go above level 10");
  s = after({ level: 9 }, P("a"), P("b"), P("c"), P("d"), P("e"));
  check(s.level === 10, "A fast move up is capped at level 10");
  s = after({ level: 4 }, F("if"), P("if"));
  check(s.failStreak === 0 && s.failsInARow === 0, "A pass resets the fail streaks");
  s = after({ level: 2 }, P("a"), P("b"), P("c"), P("d"), P("e"));
  check(s.level === 6 && s.highest === 6, "5 strong passes over 5 skills: +1, +1, then +2 (2 → 6), and highest level is tracked");
  s = after({ level: 2 }, P("a"), P("a"), P("b"), P("b"), P("a"));
  check(s.level === 4, "5 strong passes over only 2 skills: no fast move up");
  check(levelMessage({ change: 1, level: 4, reason: "passes" }) === "You've moved up to Level 4!", "Level-up message");
  check(levelMessage({ change: -1, level: 3, reason: "fails" }) === "Let's build up a bit more at Level 3.", "Level-down message");
  check(levelMessage({ change: 0, level: 3, reason: "" }) === null, "No message when the level stays the same");

  // Simulated students: fast move up, normal move down and recovery drop.
  const sim = Simulation.runSimulations();
  for (const c of sim.checks) check(c.ok, "Simulation – " + c.message);

  // Skills secured: SECURED_PASSES_IN_A_ROW passes in a row with SECURED_MAX_HINTS or fewer hints each.
  const { updateSkillStates, skillStatus, ensureSkillStates, completesTopLevel, scratchDue, chooseEndlessTask, SECURED_PASSES_IN_A_ROW, SECURED_MAX_HINTS } = App;
  check(SECURED_PASSES_IN_A_ROW === 2 && SECURED_MAX_HINTS === 1, "Secured rule: 2 passes in a row, 1 hint or fewer each");
  const sk = (...outcomes) => outcomes.reduce((st, o) => updateSkillStates(st, ["elif"], o), {}).elif;
  const good = { passed: true, hints: 1 }, weak = { passed: true, hints: 2 }, bad = { passed: false, hints: 0 };
  check(skillStatus(undefined) === "not-started", "A skill never tried is Not started");
  check(skillStatus(sk(good)) === "in-progress", "One strong pass: In progress");
  check(skillStatus(sk(good, good)) === "secured", "Two strong passes in a row: Secured");
  check(skillStatus(sk(good, weak, good)) === "in-progress", "A pass with 2 hints breaks the run");
  check(skillStatus(sk(good, bad, good)) === "in-progress", "A fail breaks the run");
  check(skillStatus(sk(bad, good, good)) === "secured", "Secured after an earlier fail");
  check(skillStatus(sk(good, good, bad, bad)) === "secured", "Once secured, a skill stays secured");
  const old = { units: { maths: { history: [{ taskId: "maths-L1c", result: "pass", hints: 0 }, { taskId: "maths-L3a", result: "pass", hints: 1 }] } } };
  ensureSkillStates(old, (id) => tasks.find((t) => t.id === id));
  check(skillStatus(old.units.maths.skills["integer-division"]) === "secured", "Skill states are rebuilt from history for progress saved before skills were tracked");

  // Completing level 10 (unlocks endless mode and from-scratch tasks).
  check(completesTopLevel({ level: 10, passStreak: 1 }, { passed: true, hints: 0 }), "2nd strong pass in a row at level 10 completes the unit");
  check(!completesTopLevel({ level: 10, passStreak: 0 }, { passed: true, hints: 0 }), "1st strong pass at level 10 doesn't complete it yet");
  check(!completesTopLevel({ level: 10, passStreak: 1 }, { passed: true, hints: 2 }), "A pass with 2 hints doesn't complete it");
  check(!completesTopLevel({ level: 9, passStreak: 1 }, { passed: true, hints: 0 }), "Moving up from level 9 isn't completing the unit");
  check(!scratchDue({ completedTop: false, level: 10, sinceScratch: 5 }), "No from-scratch tasks before the unit is completed");
  check(scratchDue({ completedTop: true, level: 10, sinceScratch: App.SCRATCH_EVERY_N_TASKS - 1 }) &&
    !scratchDue({ completedTop: true, level: 10, sinceScratch: 0 }) && !scratchDue({ completedTop: true, level: 9, sinceScratch: 9 }),
    "From-scratch tasks come every " + App.SCRATCH_EVERY_N_TASKS + " tasks, only at level 10 after completing");

  // Endless mode task choice.
  const completed = (level) => Object.assign(freshUnitState(level), { completedTop: true });
  const passedAll = (unit, level) => Object.assign(completed(level), { log: Object.fromEntries(tasks.filter((t) => t.unit === unit).map((t) => [t.id, { passes: 1 }])) });
  const units = { maths: passedAll("maths", 10), selection: passedAll("selection", 10), output: freshUnitState(10) };
  const rng = Templates.mulberry32(42);
  let prev = {};
  let lockedUsed = 0, combinedSeen = 0, repeats = 0, notGenerated = 0, onlyMaths = true;
  for (let k = 0; k < 300; k++) {
    const t = chooseEndlessTask({ tasks, templates, units, unitIds: ["maths", "selection", "output"], last: prev, rand: rng, Templates });
    if ((t.units || [t.unit]).includes("output")) lockedUsed++;
    if ((t.units || []).length >= 2) combinedSeen++;
    if (!t.generated) notGenerated++;
    const sig = t.generated ? Templates.signature(t) : t.id;
    if (sig === prev.signature || t.id === prev.key) repeats++;
    prev = { key: t.id, unit: t.unit, templateId: t.templateId, signature: sig };
  }
  check(lockedUsed === 0, `Endless mode never uses a unit that isn't completed (used ${lockedUsed} times)`);
  check(combinedSeen > 30, `Endless mode sets combined tasks when 2+ units are ticked (${combinedSeen}/300)`);
  check(notGenerated === 0, "Once every bank task at the level is passed, endless mode makes new variants from templates");
  check(repeats === 0, `Endless mode never gives the same task or variant twice in a row (${repeats} repeats)`);
  prev = {};
  for (let k = 0; k < 100; k++) {
    const t = chooseEndlessTask({ tasks, templates, units, unitIds: ["maths"], last: prev, rand: rng, Templates });
    if ((t.units || [t.unit]).some((u) => u !== "maths")) onlyMaths = false;
    prev = { key: t.id, unit: t.unit, templateId: t.templateId, signature: t.generated ? Templates.signature(t) : t.id };
  }
  check(onlyMaths, "With one unit ticked, endless mode sets no combined tasks");
  const fresh2 = { maths: completed(10) };
  const first = chooseEndlessTask({ tasks, templates, units: fresh2, unitIds: ["maths"], last: {}, rand: rng, Templates });
  check(!first.generated && first.unit === "maths" && first.level === 10, "Endless mode uses unpassed bank tasks at the student's level first");
  check(chooseEndlessTask({ tasks, templates, units: { output: freshUnitState(10) }, unitIds: ["output"], last: {}, rand: rng, Templates }) === null,
    "Endless mode gives nothing if no ticked unit is completed");

  // Task choice stays within the unit and level, avoids repeats, and respects skillMinLevel.
  for (const unit of UNIT_IDS) {
    const pool = tasksAt(tasks, unit, 3);
    const seen = {};
    let ok = true, noRepeats = true;
    for (let k = 0; k < pool.length; k++) {
      const t = chooseTask(tasks, unit, 3, seen, null);
      if (!t || t.level !== 3 || t.unit !== unit) ok = false;
      else { if (seen[t.id]) noRepeats = false; seen[t.id] = { passes: 1 }; }
    }
    check(ok, `chooseTask must pick from the right unit and level (${unit})`);
    check(noRepeats, `chooseTask must avoid repeats while unseen tasks remain (${unit})`);
    const again = chooseTask(tasks, unit, 3, seen, pool[0].id);
    check(again && again.id !== pool[0].id, `chooseTask must avoid the last task once all are seen (${unit})`);
  }
  const minLevels = Curriculum.unitById("selection").skillMinLevel;
  let early = 0;
  for (let k = 0; k < 500; k++) {
    const t = chooseTask(tasks, "selection", 1 + (k % 4), {}, null);
    if (t.skills.some((sk) => minLevels[sk] > t.level)) early++;
  }
  check(early === 0, "Selection tasks for functions are never set below level 5");
  const last = tasks.find((t) => t.unit === "maths" && t.level === 3 && t.skills.includes("modulo"));
  let sameSkill = 0;
  for (let k = 0; k < 200; k++) if (chooseTask(tasks, "maths", 3, {}, last.id).skills.includes("modulo")) sameSkill++;
  check(sameSkill === 0, "chooseTask prefers a different skill from the last task when one is available");
}

// ---------- Colour contrast (WCAG AA) in every theme ----------
// Reads the three theme blocks in styles.css and checks each text colour against the backgrounds it is used on.
const MIN_CONTRAST = 4.5; // WCAG AA for body text
const TEXT_PAIRS = [
  ["text", "bg"], ["text", "card"], ["text", "code-bg"], ["text", "up-bg"], ["text", "down-bg"], ["text", "selection"],
  ["muted", "bg"], ["muted", "card"], ["muted", "code-bg"],
  ["link", "bg"], ["link", "card"], ["primary-text", "primary"],
  ["pass", "pass-bg"], ["pass", "card"], ["fail", "fail-bg"], ["fail", "card"], ["on-danger", "fail"],
  ["on-type", "fill"], ["on-type", "parsons"], ["on-type", "predict"], ["on-type", "write"],
  ["tok-k", "code-bg"], ["tok-s", "code-bg"], ["tok-n", "code-bg"], ["tok-c", "code-bg"], ["tok-f", "code-bg"],
];
function luminance(hex) {
  const n = hex.replace("#", "");
  const full = n.length === 3 ? n.split("").map((c) => c + c).join("") : n;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
const themes = {};
for (const m of css.matchAll(/:root(?:, :root)?\[data-theme="(\w+)"\]\s*\{([^}]*)\}/g)) {
  themes[m[1]] = Object.fromEntries([...m[2].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)].map((x) => [x[1], x[2]]));
}
const contrastReport = {};
for (const theme of ["light", "dark", "contrast"]) {
  const tokens = themes[theme];
  if (!check(tokens, `styles.css has no ${theme} theme block`)) continue;
  let worst = Infinity;
  for (const [fg, bg] of TEXT_PAIRS) {
    if (!check(tokens[fg] && tokens[bg], `${theme} theme: token --${fg} or --${bg} is missing`)) continue;
    const ratio = contrast(tokens[fg], tokens[bg]);
    worst = Math.min(worst, ratio);
    check(ratio >= MIN_CONTRAST, `${theme} theme: --${fg} on --${bg} has contrast ${ratio.toFixed(2)}:1 (WCAG AA needs ${MIN_CONTRAST}:1)`);
  }
  contrastReport[theme] = worst.toFixed(2);
  check(tokens.glow && tokens["glow-outer"], `${theme} theme: the completed-unit glow needs --glow and --glow-outer tokens`);
}
check(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*unit-complete[^}]*animation:\s*none/.test(css), "The glowing card must not pulse when prefers-reduced-motion is set");

// ---------- Feature tests (placement, buttons, classifier, matching, export, recheck.py) ----------
const featureChecks = Features.runFeatureTests({ tasks, misconceptions, runPython });
for (const c of featureChecks) check(c.ok, "Features – " + c.message);
// Every component uses tokens: no hard-coded colours outside the theme blocks (except the overlay tints in store.js).
const outsideThemes = css.replace(/:root(?:, :root)?\[data-theme="\w+"\]\s*\{[^}]*\}/g, "");
const hardCoded = outsideThemes.match(/#[0-9a-fA-F]{3,6}\b/g) || [];
check(hardCoded.length === 0, "styles.css has hard-coded colours outside the theme blocks: " + hardCoded.join(", "));

// ---------- Report ----------
console.log(`Tasks: ${tasks.length}`);
for (const unit of UNIT_IDS) {
  const mine = tasks.filter((t) => t.unit === unit);
  const byLevel = Array.from({ length: 10 }, (_, i) => mine.filter((t) => t.level === i + 1).length);
  const byType = TYPES.map((ty) => `${ty}=${mine.filter((t) => t.type === ty).length}`).join(" ");
  console.log(`  ${unit.padEnd(10)} ${String(mine.length).padStart(3)} tasks | ${byLevel.map((c, i) => `L${i + 1}=${c}`).join(" ")} | ${byType}`);
}
const combinedTpls = templates.filter((t) => t.units && t.units.length >= 2).length;
const scratchTpls = templates.filter((t) => t.type === "scratch").length;
const minVariants = Math.min(...Object.values(variantCounts));
console.log(`Templates: ${templates.length} (single-unit ${templates.length - combinedTpls - scratchTpls}, combined ${combinedTpls}, write-from-scratch ${scratchTpls}); ${variants.length} different variants checked, fewest from one template: ${minVariants}`);
console.log(`Lowest text contrast: ${Object.entries(contrastReport).map(([k, v]) => `${k} ${v}:1`).join(", ")}`);
console.log(`Checks run: ${checks}`);
if (failures.length) {
  console.log(`\nFAILED: ${failures.length} problem(s)\n`);
  failures.forEach((f) => console.log(" - " + f));
  process.exit(1);
}
console.log("\nAll checks passed.");
