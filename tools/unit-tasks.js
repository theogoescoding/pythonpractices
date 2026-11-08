// Shared by the one-off tools/add-<unit>-unit.js scripts (Strings, Random, Lists): turns a unit's task list into
// tasks.json entries and checks them, as tools/add-data-types-unit.js did for Data types and casting.
//   - Expected outputs are worked out by running each solution through harness.py.
//   - A predict task's answer is the one option equal to the real output.
//   - A fill task's solution is its starter with the answers filled in, so they can't disagree.
//   - Every buggy variant must print something different from the solution on at least one test.
// Nothing is written unless every task is consistent.
"use strict";
const fs = require("fs");
const path = require("path");
const { runPython, ROOT } = require("./run-python.js");
const Checker = require(path.join(ROOT, "checker.js"));

const T = (inputs) => ({ inputs, expected: null }); // expected is worked out when the unit is added

function addUnit(unit, PRACTICE, PLACEMENT) {
  const file = path.join(ROOT, "tasks.json");
  const tasks = JSON.parse(fs.readFileSync(file, "utf8"));
  if (tasks.some((t) => t.unit === unit)) { console.log("The " + unit + " unit is already in tasks.json."); return; }
  const built = buildTasks(unit, PRACTICE.concat(PLACEMENT.map((p) => Object.assign(p, { placement: true }))));
  fs.writeFileSync(file, JSON.stringify(tasks.concat(built), null, 2) + "\n");
  console.log("Added " + built.length + " " + unit + " tasks (" + PRACTICE.length + " practice, " + PLACEMENT.length + " placement).");
}

// Builds and checks task specs (placement ones have placement: true); stops with the problems if any task is wrong.
function buildTasks(unit, all) {
  const built = all.map((s) => {
    const t = { id: s.id, unit, level: s.level, type: s.type, title: s.title, description: s.description,
      starter: s.starter != null ? s.starter : s.type === "write" ? "# Write your program here" : "", solution: s.solution };
    if (s.type === "fill") { let i = 0; t.solution = s.starter.replace(/____/g, () => s.answers[i++]); t.answers = s.answers; }
    if (s.type === "parsons") t.distractors = s.distractors;
    if (s.type === "predict") { t.options = s.options; t.answer = null; }
    t.tests = s.tests.map((x) => ({ inputs: x.inputs, expected: null }));
    t.hints = s.hints;
    t.tags = (s.placement ? ["placement"] : []).concat(s.tags);
    t.skills = s.skills;
    if (s.buggy) t.buggy_variants = s.buggy.map(([misconception, code]) => ({ misconception, code }));
    return t;
  });

  const jobs = [];
  const where = [];
  built.forEach((t, ti) => {
    t.tests.forEach((x, k) => { jobs.push({ code: t.solution, inputs: x.inputs }); where.push([ti, k, -1]); });
    (t.buggy_variants || []).forEach((v, vi) => t.tests.forEach((x, k) => { jobs.push({ code: v.code, inputs: x.inputs }); where.push([ti, k, vi]); }));
  });
  const results = runPython(jobs);
  const problems = [];
  const variantOut = {};
  results.forEach((r, j) => {
    const [ti, k, vi] = where[j];
    const t = built[ti];
    if (vi === -1) {
      if (r.error) problems.push(t.id + " test " + k + ": " + JSON.stringify(r.error));
      if (r.inputsLeft) problems.push(t.id + " test " + k + ": not every input is used");
      t.tests[k].expected = Checker.normalise(r.output);
    } else {
      const key = ti + ":" + vi;
      (variantOut[key] = variantOut[key] || [])[k] = { output: Checker.normalise(r.output), kind: Checker.errorKind(r.error) };
    }
  });
  built.forEach((t, ti) => {
    if (t.type === "predict") {
      const hits = t.options.map((o, i) => (o === t.tests[0].expected ? i : -1)).filter((i) => i >= 0);
      if (hits.length !== 1) problems.push(t.id + ": " + hits.length + " options equal the real output " + JSON.stringify(t.tests[0].expected));
      t.answer = hits[0];
    }
    (t.buggy_variants || []).forEach((v, vi) => {
      const outs = variantOut[ti + ":" + vi];
      if (!t.tags.includes(v.misconception)) problems.push(t.id + ": variant id " + v.misconception + " not in tags");
      if (!outs.some((o, k) => o.kind || o.output !== t.tests[k].expected)) problems.push(t.id + ": the " + v.misconception + " variant passes every test");
      // A syntax error can't tell one mistake from another, so it is refused, except "= in an if" (Checker.errorKind
      // names it SyntaxError:assign-in-condition), which only that mistake gives.
      if (outs.some((o) => /SyntaxError(?!:assign-in-condition)|IndentationError|Timeout/.test(o.kind))) problems.push(t.id + ": the " + v.misconception + " variant ends in " + outs.find((o) => o.kind).kind);
      if (t.type === "predict" && (outs[0].kind || !t.options.includes(outs[0].output) || outs[0].output === t.tests[0].expected))
        problems.push(t.id + ": the " + v.misconception + " variant's output " + JSON.stringify(outs[0].output) + " should be one of the wrong options");
    });
    if (t.skills.length < 1 || t.skills.length > 3) problems.push(t.id + ": 1 to 3 skills");
  });
  if (problems.length) { console.log(problems.join("\n")); process.exit(1); }
  return built;
}

module.exports = { T, addUnit, buildTasks };
