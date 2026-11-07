// Shared by the one-off tools/add-<unit>-templates.js scripts: adds hand-written templates (combined and
// write-from-scratch) to templates.json, as tools/add-data-types-templates.js does. Each template is expanded with
// 20 seeds: its solution must print the expected output every time, and it must make 5 or more different variants.
// A template whose id is already in templates.json is left as it is. Nothing is written unless every check passes.
"use strict";
const fs = require("fs");
const path = require("path");
const { runPython, ROOT } = require("./run-python.js");
const Checker = require(path.join(ROOT, "checker.js"));
const Templates = require(path.join(ROOT, "templates.js"));

function addTemplates(NEW) {
  const file = path.join(ROOT, "templates.json");
  const templates = JSON.parse(fs.readFileSync(file, "utf8"));
  const have = new Set(templates.map((t) => t.id));
  const fresh = NEW.filter((t) => !have.has(t.id));
  const jobs = [];
  const where = [];
  const sigs = {};
  for (const tpl of fresh) {
    sigs[tpl.id] = new Set();
    for (let seed = 1; seed <= 20; seed++) {
      const task = Templates.expand(tpl, seed);
      sigs[tpl.id].add(Templates.signature(task));
      task.tests.forEach((t, k) => { jobs.push({ code: task.solution, inputs: t.inputs }); where.push([tpl.id, seed, k, t.expected]); });
    }
  }
  const results = jobs.length ? runPython(jobs) : [];
  const bad = [];
  results.forEach((r, j) => {
    const [id, seed, k, expected] = where[j];
    if (r.error || r.inputsLeft || !Checker.outputsMatch(r.output, expected)) bad.push(id + " seed " + seed + " test " + k + ": expected " + JSON.stringify(expected) + " got " + JSON.stringify(r.output) + " " + JSON.stringify(r.error || ""));
  });
  for (const tpl of fresh) if (sigs[tpl.id].size < 5) bad.push(tpl.id + ": only " + sigs[tpl.id].size + " different variants");
  if (bad.length) { console.log(bad.slice(0, 20).join("\n")); process.exit(1); }
  fs.writeFileSync(file, JSON.stringify(templates.concat(fresh), null, 2) + "\n");
  console.log("Added " + fresh.length + " templates (" + jobs.length + " runs checked).");
}

module.exports = { addTemplates };
