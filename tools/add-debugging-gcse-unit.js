// One-off (2026-11): adds the Debugging (GCSE) unit's bank tasks to tasks.json: 40 practice tasks (4 at each level) and
// 8 placement tasks. The tasks are in tools/debugging-gcse-tasks.js; they are built and checked by tools/unit-tasks.js
// (expected outputs from running each solution, predict options from the real output and the wrong ones, and each
// task's error question checked by running the program with the error(s): Checker.errorKindRunProblems). A unit
// already in tasks.json is left as it is.
//
// Usage:  node tools/add-debugging-gcse-unit.js --check   check every task, and the rules below, without writing
//         node tools/add-debugging-gcse-unit.js           add the unit's tasks to tasks.json
// Then: add-worked-examples, derive-templates --units debugging-gcse, add-debugging-gcse-templates and the tests.
"use strict";
const path = require("path");
const { addUnit, checkTasks } = require("./unit-tasks.js");
const { UNIT, PREFIX, specs } = require("./debugging-gcse-tasks.js");
const Checker = require(path.join(__dirname, "..", "checker.js"));

const LADDER = ["predict", "predict", "fill", "fill", "parsons", "parsons", "write", "write", "write", "write"];
const ASK = (lv) => (lv <= 7 ? "kind" : lv === 8 ? "definition" : "both");

function rules(built) {
  const p = [];
  const practice = built.filter((t) => !t.tags.includes("placement"));
  const placement = built.filter((t) => t.tags.includes("placement"));
  for (let lv = 1; lv <= 10; lv++) {
    const here = practice.filter((t) => t.level === lv);
    if (here.length !== 4) p.push("level " + lv + ": " + here.length + " practice tasks (4 needed)");
    if (lv <= 8) {
      const kinds = here.map((t) => t.error_kind && t.error_kind.errors[0].kind);
      if (kinds.filter((k) => k === "syntax").length !== 2 || kinds.filter((k) => k === "logic").length !== 2) p.push("level " + lv + ": two syntax-error tasks and two logic-error tasks");
    }
    if (lv <= 2 && new Set(here.map((t) => t.tests[0].expected)).size !== here.length) p.push("level " + lv + ": the predict tasks need different right answers");
  }
  if ([2, 5, 7, 9].map((lv) => placement.filter((t) => t.level === lv).length).join() !== "2,2,2,2" || placement.length !== 8) p.push("2 placement tasks at each of levels 2, 5, 7 and 9");
  for (const t of built) {
    if (!new RegExp("^" + PREFIX + "-[LP]\\d+[a-z]$").test(t.id)) p.push(t.id + ": id should be " + PREFIX + "-L… or " + PREFIX + "-P…");
    if (t.type !== LADDER[t.level - 1]) p.push(t.id + ": level " + t.level + " tasks are " + LADDER[t.level - 1]);
    const ek = t.error_kind;
    if (!ek) { p.push(t.id + ": needs an error question (error_kind)"); continue; }
    if (ek.ask !== ASK(t.level)) p.push(t.id + ": level " + t.level + " asks \"" + ASK(t.level) + "\"");
    if (t.type === "predict" ? t.tests.length !== 1 : t.tests.length !== 2) p.push(t.id + ": " + (t.type === "predict" ? "1 test" : "2 tests"));
    if (t.type !== "predict" && t.tests.length === 2 && t.tests[0].expected === t.tests[1].expected) p.push(t.id + ": the two tests give the same result");
    if (t.type === "write" && t.starter !== ek.bug) p.push(t.id + ": a write task starts from the program with the error(s)");
    // Parsons: the line with the error is the first line not needed.
    if (t.type === "parsons" && ek.errors.length === 1 && t.distractors[0] !== ek.errors[0].line.trim()) p.push(t.id + ": the first line not needed is the line with the error");
    // Fill: the blanks are on the line with the error.
    if (t.type === "fill") {
      const at = t.solution.split("\n").indexOf(ek.errors[0].fix);
      if (!(t.starter.split("\n")[at] || "").includes("____")) p.push(t.id + ": the blanks are on the line that had the error");
    }
    for (const e of ek.errors) if (!ek.bug.split("\n").includes(e.line)) p.push(t.id + ": the program shown has the line " + JSON.stringify(e.line));
    if (t.hints.length !== 2) p.push(t.id + ": 2 hints");
  }
  // The question's own wording (Checker.errorKindQuestion): every ask gives two answers per part.
  for (const ask of ["kind", "definition", "both"]) {
    const errs = ask === "both" ? [{ kind: "syntax", line: "a", fix: "b" }, { kind: "logic", line: "c", fix: "d" }] : [{ kind: "syntax", line: "a", fix: "b" }];
    const q = Checker.errorKindQuestion({ ask, errors: errs });
    if (q.parts.length !== errs.length || q.parts.some((x) => x.options.length !== 2)) p.push("Checker.errorKindQuestion(\"" + ask + "\") needs two answers for each part");
  }
  return p;
}

const { PRACTICE, PLACEMENT } = specs();
if (process.argv.includes("--check")) {
  const all = PRACTICE.concat(PLACEMENT.map((s) => Object.assign(s, { placement: true })));
  const { built, problems } = checkTasks(UNIT, all);
  const found = problems.concat(rules(built));
  console.log(UNIT + ": " + built.length + " tasks checked");
  console.log(found.length ? found.join("\n") : "No problems.");
  process.exit(found.length ? 1 : 0);
} else {
  addUnit(UNIT, PRACTICE, PLACEMENT);
}
