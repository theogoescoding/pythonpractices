// Gives every practice (non-placement) task in tasks.json a "worked_example" for "Show me how": the example in
// tools/worked-examples.js for the task's unit and type ("bubble-sort:trace", so each task type has its own example),
// or else for its unit and first skill that has one, with its output worked out by running it. An example with
// "trace" (a trace table spec) also gets its trace table, shown under it.
//
// It also gives every non-derived template in templates.json (hand-written, combined and write-from-scratch) its own
// "worked_example", chosen by the same rule from the template's own unit, type and skills, so a variant's "Show me how"
// matches its topic. A combined template uses the unit of its first skill; a write-from-scratch template is read as a
// write task. Derived templates (one per bank task) get none: their variants use their source task's example, which
// already has the same unit, type and skills. app.js workedExampleFor: the task's own, then its template's, then its
// source task's.
//
// Running it again changes nothing.
//
// Usage:  node tools/add-worked-examples.js           update tasks.json and templates.json
//         node tools/add-worked-examples.js --check   only report whether they are up to date (exit 1 if not)
"use strict";
const fs = require("fs");
const path = require("path");
const { runPython, ROOT } = require("./run-python.js");
const Checker = require(path.join(ROOT, "checker.js"));
const App = require(path.join(ROOT, "app.js"));
const { EXAMPLES } = require("./worked-examples.js");

const isPlacement = (t) => (t.tags || []).includes("placement");
const exampleKey = (t) => [t.unit + ":" + t.type].concat(t.skills.map((s) => t.unit + ":" + s)).find((k) => EXAMPLES[k]) || null;
// A non-derived template's key: as a task's, from its own unit (a combined template: its first skill's unit), type
// (write from scratch: write) and skills.
const templateUnit = (tpl) => (tpl.units.length > 1 ? App.unitOfSkill(tpl.skills[0], tpl.units) : tpl.units[0]);
const templateExampleKey = (tpl) => exampleKey({ unit: templateUnit(tpl), type: tpl.type === "scratch" ? "write" : tpl.type, skills: tpl.skills || [] });

// The examples for these keys, each with its output (and trace table) worked out by running it.
function makeExamples(keys) {
  const runs = runPython(keys.map((k) => Object.assign({ code: EXAMPLES[k].code, inputs: EXAMPLES[k].inputs || [] }, EXAMPLES[k].trace ? { trace: true } : {})));
  const made = {};
  keys.forEach((k, i) => {
    const e = EXAMPLES[k];
    if (runs[i].error) throw new Error("Worked example " + k + " raised " + runs[i].error.type);
    made[k] = Object.assign({ skill: k.split(":")[1], problem: e.problem, code: e.code }, e.inputs ? { inputs: e.inputs } : {},
      { output: Checker.normalise(runs[i].output), key_idea: e.key_idea });
    if (e.trace) {
      const table = Checker.traceTable(runs[i].steps, e.trace);
      made[k].trace = { columns: table.columns, rows: table.rows };
    }
  });
  return made;
}

// Returns a copy of the tasks with worked examples filled in (and the keys that were missing).
function withWorkedExamples(tasks, made) {
  made = made || makeExamples([...new Set(tasks.filter((t) => !isPlacement(t)).map(exampleKey).filter(Boolean))]);
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

// Returns a copy of the templates with each non-derived one's worked example filled in (and the ids with no key).
// A template that already has one keeps its place in the object, so nothing moves when it is run again.
function withTemplateExamples(templates, made) {
  made = made || makeExamples([...new Set(templates.filter((t) => !t.derived).map(templateExampleKey).filter(Boolean))]);
  const missing = [];
  const out = JSON.parse(JSON.stringify(templates));
  for (const t of out) {
    if (t.derived) continue;
    const k = templateExampleKey(t);
    if (k) t.worked_example = made[k];
    else { delete t.worked_example; missing.push(t.id); }
  }
  return { templates: out, missing };
}

if (require.main === module) {
  const tasksFile = path.join(ROOT, "tasks.json");
  const tplFile = path.join(ROOT, "templates.json");
  const tasks = JSON.parse(fs.readFileSync(tasksFile, "utf8"));
  const templates = JSON.parse(fs.readFileSync(tplFile, "utf8"));
  const keys = [...new Set(tasks.filter((t) => !isPlacement(t)).map(exampleKey).concat(templates.filter((t) => !t.derived).map(templateExampleKey)).filter(Boolean))];
  const made = makeExamples(keys);
  const { tasks: updated, missing } = withWorkedExamples(tasks, made);
  const { templates: updatedTpl, missing: missingTpl } = withTemplateExamples(templates, made);
  if (missing.length) console.log("No worked example for: " + missing.join(", "));
  if (missingTpl.length) console.log("No worked example for templates: " + missingTpl.join(", "));
  const changed = JSON.stringify(updated) !== JSON.stringify(tasks);
  const changedTpl = JSON.stringify(updatedTpl) !== JSON.stringify(templates);
  if (process.argv.includes("--check")) {
    console.log(changed ? "tasks.json: worked examples are out of date. Run: node tools/add-worked-examples.js" : "tasks.json: worked examples are up to date.");
    console.log(changedTpl ? "templates.json: worked examples are out of date. Run: node tools/add-worked-examples.js" : "templates.json: worked examples are up to date.");
    process.exit(changed || changedTpl || missing.length || missingTpl.length ? 1 : 0);
  }
  if (changed) fs.writeFileSync(tasksFile, JSON.stringify(updated, null, 2) + "\n");
  if (changedTpl) fs.writeFileSync(tplFile, JSON.stringify(updatedTpl, null, 2) + "\n");
  console.log((changed ? "Updated" : "Already up to date:") + " worked examples on " + updated.filter((t) => t.worked_example).length + " tasks.");
  console.log((changedTpl ? "Updated" : "Already up to date:") + " worked examples on " + updatedTpl.filter((t) => t.worked_example).length + " templates.");
}

module.exports = { withWorkedExamples, withTemplateExamples, exampleKey, templateExampleKey, templateUnit, makeExamples };
