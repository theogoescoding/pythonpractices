// One-off (2026-11): adds the five Validation units' bank tasks to tasks.json: Presence, Type, Range, Format and Length
// checks, 30 practice tasks (3 at each level) and 8 placement tasks each. The tasks are in tools/validation-units-tasks.js;
// they are built and checked by tools/unit-tasks.js (expected outputs from running each solution, predict options from
// the real output and the wrong ones). A unit already in tasks.json is left as it is.
//
// Usage:  node tools/add-validation-units.js --check   check every task, and the rules below, without writing
//         node tools/add-validation-units.js           add the units' tasks to tasks.json
// Then: build-variants, add-worked-examples, derive-templates --units <the five>, add-validation-units-templates and the tests.
"use strict";
const { addUnit, checkTasks } = require("./unit-tasks.js");
const { UNIT_SPECS, specsFor } = require("./validation-units-tasks.js");

// Out of scope in these units (as in the old Validation unit).
const OUT_OF_SCOPE = /\btry\s*:|\bexcept\b|\.isalpha\(|\.startswith\(|\.upper\(|\.lower\(|\bimport\b|\bre\.\w+\(|\bhash(lib)?\b|\bopen\(|\{[^{}\n]*:[^{}\n]*\}|\bdict\(|\bfloat\(/;
const PREFIX = { "validation-presence": "pres", "validation-type": "typ", "validation-range": "rng", "validation-format": "fmt", "validation-length": "len" };
const LADDER = ["predict", "predict", "fill", "fill", "parsons", "parsons", "write", "write", "write", "write"];

function rules(unit, built) {
  const p = [];
  const practice = built.filter((t) => !t.tags.includes("placement"));
  const placement = built.filter((t) => t.tags.includes("placement"));
  const code = (t) => [t.solution, t.starter || ""].concat(t.distractors || [], t.answers || [], (t.buggy_variants || []).map((v) => v.code)).join("\n");
  for (let lv = 1; lv <= 10; lv++) {
    const here = practice.filter((t) => t.level === lv);
    if (here.length !== 3) p.push(unit + " level " + lv + ": " + here.length + " practice tasks (3 needed)");
    if (lv <= 2 && new Set(here.map((t) => t.tests[0].expected)).size !== here.length) p.push(unit + " level " + lv + ": the predict tasks need different right answers");
  }
  if ([2, 5, 7, 9].map((lv) => placement.filter((t) => t.level === lv).length).join() !== "2,2,2,2" || placement.length !== 8) p.push(unit + ": 2 placement tasks at each of levels 2, 5, 7 and 9");
  const l2 = placement.filter((t) => t.level === 2).map((t) => t.tests[0].expected);
  for (const t of built) {
    if (!new RegExp("^" + PREFIX[unit] + "-[LP]\\d+[a-z]$").test(t.id)) p.push(t.id + ": id should be " + PREFIX[unit] + "-L…/" + PREFIX[unit] + "-P…");
    if (t.type !== LADDER[t.level - 1]) p.push(t.id + ": level " + t.level + " tasks are " + LADDER[t.level - 1]);
    if (OUT_OF_SCOPE.test(code(t))) p.push(t.id + ": uses something out of scope");
    if (t.type === "predict" ? t.tests.length !== 1 : t.tests.length !== 2) p.push(t.id + ": " + (t.type === "predict" ? "1 test" : "2 tests (one passes the check, one fails it)"));
    if (t.type !== "predict" && t.tests.length === 2 && t.tests[0].expected === t.tests[1].expected) p.push(t.id + ": the two tests give the same result");
    if (t.tags.includes("placement") && t.buggy_variants) p.push(t.id + ": placement tasks have no buggy variants");
  }
  if (l2.length === 2 && l2[0] === l2[1]) p.push(unit + ": the two level 2 placement predicts need different answers");
  return p;
}

const check = process.argv.includes("--check");
let problems = [];
for (const unit of Object.keys(UNIT_SPECS)) {
  const { PRACTICE, PLACEMENT } = specsFor(unit);
  if (check) {
    const all = PRACTICE.concat(PLACEMENT.map((s) => Object.assign(s, { placement: true })));
    const { built, problems: found } = checkTasks(unit, all);
    problems = problems.concat(found, rules(unit, built));
    console.log(unit + ": " + built.length + " tasks checked");
  } else {
    addUnit(unit, PRACTICE, PLACEMENT);
  }
}
if (check) {
  console.log(problems.length ? problems.join("\n") : "No problems.");
  process.exit(problems.length ? 1 : 0);
}
