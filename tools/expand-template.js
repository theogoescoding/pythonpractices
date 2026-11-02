// Makes template variants again from their template id and seed, for recheck.py (which can't run templates.js).
// Usage:  node tools/expand-template.js templates.json < requests.json
//   requests.json: [["d-maths-L9b", 1234567], …]   →   prints [task or null, …] as JSON
// A derived template's variant is made by running Python (as the app does), so its buggy variants have their outputs.
"use strict";
const fs = require("fs");
const path = require("path");
const { runPython, ROOT } = require("./run-python.js");
const Templates = require(path.join(ROOT, "templates.js"));

const templates = JSON.parse(fs.readFileSync(process.argv[2] || path.join(ROOT, "templates.json"), "utf8"));
const byId = Object.fromEntries(templates.map((t) => [t.id, t]));
const requests = JSON.parse(fs.readFileSync(0, "utf8"));
const known = requests.map(([id, seed]) => (byId[id] ? [byId[id], Number(seed)] : null));
const made = Templates.realiseMany(known.filter(Boolean), runPython);
let k = 0;
process.stdout.write(JSON.stringify(known.map((r) => (r ? made[k++] : null))));
