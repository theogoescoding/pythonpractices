// Works out what each buggy variant in tasks.json prints for each of its task's tests, and stores it in the
// variant's "outputs" list. The app and recheck.py both compare students' results against these stored outputs.
//
// Usage:  node tools/build-variants.js           update tasks.json
//         node tools/build-variants.js --check   only report whether tasks.json is up to date (exit 1 if not)
//
// Run it after adding or editing a buggy variant, or a task's tests. tests/validate.js fails if it is out of date.
"use strict";
const fs = require("fs");
const path = require("path");
const { runPython, ROOT } = require("./run-python.js");
const Checker = require(path.join(ROOT, "checker.js"));

// One stored result: the output and how the run ended (Checker.errorKind). An endless loop's output is not kept,
// because it depends on when the program was stopped.
function storedResult(r) {
  const errorKind = Checker.errorKind(r.error);
  return { output: errorKind === "Timeout" ? "" : Checker.normalise(r.output), errorKind };
}

// Returns a copy of the tasks with every variant's outputs worked out.
function computeVariantOutputs(tasks) {
  const jobs = [];
  const where = [];
  tasks.forEach((t, ti) => (t.buggy_variants || []).forEach((v, vi) => t.tests.forEach((test, k) => {
    jobs.push({ code: v.code, inputs: test.inputs });
    where.push([ti, vi, k]);
  })));
  const results = jobs.length ? runPython(jobs) : [];
  const out = JSON.parse(JSON.stringify(tasks));
  out.forEach((t) => (t.buggy_variants || []).forEach((v) => { v.outputs = []; }));
  results.forEach((r, j) => {
    const [ti, vi, k] = where[j];
    out[ti].buggy_variants[vi].outputs[k] = storedResult(r);
  });
  return out;
}

if (require.main === module) {
  const file = path.join(ROOT, "tasks.json");
  const tasks = JSON.parse(fs.readFileSync(file, "utf8"));
  const updated = computeVariantOutputs(tasks);
  const changed = JSON.stringify(updated) !== JSON.stringify(tasks);
  const count = updated.reduce((n, t) => n + (t.buggy_variants || []).length, 0);
  if (process.argv.includes("--check")) {
    console.log(changed ? "tasks.json: buggy-variant outputs are out of date. Run: node tools/build-variants.js" : "tasks.json: buggy-variant outputs are up to date (" + count + " variants).");
    process.exit(changed ? 1 : 0);
  }
  if (changed) fs.writeFileSync(file, JSON.stringify(updated, null, 2) + "\n");
  console.log((changed ? "Updated" : "Already up to date:") + " outputs for " + count + " buggy variants.");
}

module.exports = { computeVariantOutputs, storedResult };
