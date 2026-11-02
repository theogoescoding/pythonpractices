// Gives every practice (non-placement) task in tasks.json a "worked_example" for "Show me how": the example in
// tools/worked-examples.js for the task's unit and first skill that has one, with its output worked out by running it.
//
// Usage:  node tools/add-worked-examples.js           update tasks.json
//         node tools/add-worked-examples.js --check   only report whether tasks.json is up to date (exit 1 if not)
"use strict";
const fs = require("fs");
const path = require("path");
const { runPython, ROOT } = require("./run-python.js");
const Checker = require(path.join(ROOT, "checker.js"));
const { EXAMPLES } = require("./worked-examples.js");

const isPlacement = (t) => (t.tags || []).includes("placement");
const exampleKey = (t) => t.skills.map((s) => t.unit + ":" + s).find((k) => EXAMPLES[k]) || null;

// Returns a copy of the tasks with worked examples filled in (and the keys that were missing).
function withWorkedExamples(tasks) {
  const keys = [...new Set(tasks.filter((t) => !isPlacement(t)).map(exampleKey).filter(Boolean))];
  const runs = runPython(keys.map((k) => ({ code: EXAMPLES[k].code, inputs: EXAMPLES[k].inputs || [] })));
  const made = {};
  keys.forEach((k, i) => {
    const e = EXAMPLES[k];
    if (runs[i].error) throw new Error("Worked example " + k + " raised " + runs[i].error.type);
    made[k] = Object.assign({ skill: k.split(":")[1], problem: e.problem, code: e.code }, e.inputs ? { inputs: e.inputs } : {},
      { output: Checker.normalise(runs[i].output), key_idea: e.key_idea });
  });
  const missing = [];
  const out = JSON.parse(JSON.stringify(tasks));
  for (const t of out) {
    if (isPlacement(t)) { delete t.worked_example; continue; }
    const k = exampleKey(t);
    if (k) t.worked_example = made[k];
    else missing.push(t.id);
  }
  return { tasks: out, missing };
}

if (require.main === module) {
  const file = path.join(ROOT, "tasks.json");
  const tasks = JSON.parse(fs.readFileSync(file, "utf8"));
  const { tasks: updated, missing } = withWorkedExamples(tasks);
  if (missing.length) console.log("No worked example for: " + missing.join(", "));
  const changed = JSON.stringify(updated) !== JSON.stringify(tasks);
  if (process.argv.includes("--check")) {
    console.log(changed ? "tasks.json: worked examples are out of date. Run: node tools/add-worked-examples.js" : "tasks.json: worked examples are up to date.");
    process.exit(changed || missing.length ? 1 : 0);
  }
  if (changed) fs.writeFileSync(file, JSON.stringify(updated, null, 2) + "\n");
  console.log((changed ? "Updated" : "Already up to date:") + " worked examples on " + updated.filter((t) => t.worked_example).length + " tasks.");
}

module.exports = { withWorkedExamples, exampleKey };
