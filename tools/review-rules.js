// The "Needs review" rules (rules-review.json, see review-rules.js): works out what each example (a buggy variant on a
// bank task) prints for each of its task's tests, as tools/build-variants.js does for tasks.json, and checks every rule.
//
// Usage:  node tools/review-rules.js           work out the outputs and write rules-review.json (after checking)
//         node tools/review-rules.js --check   only check, and report whether the outputs are up to date (exit 1 if not)
//
// The checks are the bank tasks' buggy-variant rules (tests/validate.js): an id starting rev-, a name, a description,
// the date added and the term; at least 3 examples on 3 or more bank tasks (not placement or trace table tasks); each
// example prints something different from the task's solution on at least one test (or it could never match a failed
// attempt); none ends in a general syntax error (it would match any syntax error) or runs for ever; on a predict task,
// its output is one of the task's wrong options. misconceptions.json is never changed.
"use strict";
const fs = require("fs");
const path = require("path");
const { runPython, ROOT } = require("./run-python.js");
const { storedResult } = require("./build-variants.js");
const Checker = require(path.join(ROOT, "checker.js"));
const ReviewRules = require(path.join(ROOT, "review-rules.js"));

// A copy of the rules with every example's outputs worked out.
function withOutputs(rules, tasksById) {
  const jobs = [];
  const where = [];
  rules.forEach((r, ri) => (r.variants || []).forEach((v, vi) => {
    const t = tasksById[v.task];
    if (!t) return;
    t.tests.forEach((test, k) => { jobs.push({ code: v.code, inputs: test.inputs, maxLines: 100000 }); where.push([ri, vi, k]); });
  }));
  const results = jobs.length ? runPython(jobs) : [];
  const out = JSON.parse(JSON.stringify(rules));
  out.forEach((r) => (r.variants || []).forEach((v) => { v.outputs = []; }));
  results.forEach((res, j) => { const [ri, vi, k] = where[j]; out[ri].variants[vi].outputs[k] = storedResult(res); });
  return out;
}

// Problems with the rules, their outputs included (fresh: withOutputs' result).
function problems(rules, fresh, tasksById, existingIds) {
  const p = ReviewRules.rulesProblems(rules, tasksById, existingIds);
  fresh.forEach((r) => (r.variants || []).forEach((v) => {
    const t = tasksById[v.task];
    if (!t) return;
    const at = r.id + " on " + v.task;
    if (!v.outputs.some((o, k) => o.errorKind || !Checker.outputsMatch(o.output, t.tests[k].expected))) p.push(at + ": passes every test, so it can never match a failed attempt");
    if (v.outputs.some((o) => o.errorKind === "SyntaxError" || o.errorKind === "IndentationError")) p.push(at + ": ends in a general syntax error, which would match any syntax error");
    if (v.outputs.some((o) => o.errorKind === "Timeout")) p.push(at + ": runs for ever");
    if (t.type === "predict" && !t.options.filter((o, i) => i !== t.answer).map(Checker.normalise).includes(v.outputs[0].output)) p.push(at + ": its output should be one of the task's wrong options");
  }));
  return p;
}

function load() {
  const tasks = JSON.parse(fs.readFileSync(path.join(ROOT, "tasks.json"), "utf8"));
  const tasksById = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const existingIds = JSON.parse(fs.readFileSync(path.join(ROOT, "misconceptions.json"), "utf8")).map((m) => m.id);
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, "rules-review.json"), "utf8"));
  return { tasksById, existingIds, rules };
}

if (require.main === module) {
  const { tasksById, existingIds, rules } = load();
  const fresh = withOutputs(rules, tasksById);
  const found = problems(rules, fresh, tasksById, existingIds);
  const changed = JSON.stringify(fresh) !== JSON.stringify(rules);
  console.log(rules.length + " review rule" + (rules.length === 1 ? "" : "s") + ", " + fresh.reduce((n, r) => n + (r.variants || []).length, 0) + " examples.");
  if (found.length) { console.log(found.join("\n")); process.exit(1); }
  if (process.argv.includes("--check")) {
    console.log(changed ? "rules-review.json: outputs are out of date. Run: node tools/review-rules.js" : "rules-review.json: up to date, no problems.");
    process.exit(changed ? 1 : 0);
  }
  if (changed) fs.writeFileSync(path.join(ROOT, "rules-review.json"), JSON.stringify(fresh, null, 2) + "\n");
  console.log((changed ? "Updated" : "Already up to date:") + " rules-review.json.");
}

module.exports = { withOutputs, problems, load };
