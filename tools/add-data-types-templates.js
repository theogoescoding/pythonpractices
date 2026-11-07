// One-off (2026-11): the "Data types and casting" unit's hand-written templates: 5 combined (with Variables and input,
// Maths in Python, and 3 with Count-controlled loops, the unit taught just before it) and 3 write-from-scratch.
// Each is expanded with 20 seeds: its solution must print the expected output every time, with 5+ different variants.
"use strict";
const fs = require("fs");
const path = require("path");
const { runPython, ROOT } = require("./run-python.js");
const Checker = require(path.join(ROOT, "checker.js"));
const Templates = require(path.join(ROOT, "templates.js"));

const file = path.join(ROOT, "templates.json");
const templates = JSON.parse(fs.readFileSync(file, "utf8"));

const NEW = [
  // ---------- Combined ----------
  { id: "comb-types-club-card", units: ["data-types", "variables"], source: "types-L8c", level: 8, type: "write", title: "Club card",
    params: { club: { choice: ["chess club", "choir", "coding club", "drama club", "football team", "art club"] } },
    description: "Make a card for the {{club}}. Ask for a pupil's name, their age (a whole number) and their height in metres (a real number). Cast each number to the right type. Print, for example:\nName: Ava\nAge next year: 13\nHeight (cm): 152",
    starter: "# Write your program here",
    solution: 'name = input("Name: ")\nage = int(input("Age: "))\nheight = float(input("Height (m): "))\nprint("Name:", name)\nprint("Age next year:", age + 1)\nprint("Height (cm):", round(height * 100))',
    testParams: { who: { choice: ["Ava", "Ben", "Zara", "Omar", "Isla", "Kofi"] }, a: { int: [11, 16] }, h: { int: [130, 185] } },
    testCount: 3,
    test: { inputs: ["{{who}}", "{{a}}", "{{fl(h / 100)}}"], expected: "Name: {{who}}\nAge next year: {{a + 1}}\nHeight (cm): {{h}}" },
    hints: ["The name stays a string. Casting: int() for the age, float() for the height.", "Height in centimetres is round(height * 100).", "Print each label and value with a comma."],
    skills: ["casting", "input"], tags: ["heights"] },
  { id: "comb-types-trip-share", units: ["data-types", "maths"], source: "types-L9b", level: 9, type: "write", title: "Sharing the cost",
    params: { thing: { choice: ["minibus", "museum trip", "class party", "cinema trip", "bowling trip"] } },
    description: "The {{thing}} costs an amount in pounds (it can have pence), shared between some pupils. Read the cost and the number of pupils, casting each to a suitable type. Print what each pupil pays, rounded to 2 places, for example:\nEach pays (£): 4.17",
    starter: "# Write your program here",
    solution: 'cost = float(input("Cost (£): "))\npupils = int(input("Pupils: "))\nprint("Each pays (£):", round(cost / pupils, 2))',
    // Each share is a whole number of pence (c = n * p), so the answer never lies halfway between two pennies.
    testParams: { p: { int: [150, 999] }, n: { int: [3, 30] } },
    testValues: { c: "n * p" },
    testCount: 3,
    test: { inputs: ["{{fl(c / 100)}}", "{{n}}"], expected: "Each pays (£): {{fl(pyround(c / 100 / n, 2))}}" },
    hints: ["The cost has pence, so casting with float(); pupils are counted, so int().", "Divide with /, then round(..., 2)."],
    skills: ["real", "type-choice", "rounding"], tags: ["money", "rounding"] },
  { id: "comb-types-basket", units: ["data-types", "loops-count"], source: "types-L8a", level: 10, type: "write", title: "Basket total",
    params: { shop: { choice: ["tuck shop", "book fair", "school shop", "cake sale", "uniform shop"] } },
    description: "At the {{shop}}, ask how many items there are, then read each price in pounds (prices can have pence). Cast each value to a suitable type. Print the total rounded to 2 places, for example:\nTotal (£): 4.75",
    starter: "# Write your program here",
    solution: 'items = int(input("Items: "))\ntotal = 0\nfor i in range(items):\n    price = float(input("Price (£): "))\n    total = total + price\nprint("Total (£):", round(total, 2))',
    testParams: { pence: { sample: [[45, 80, 99, 120, 135, 150, 199, 250, 275], 4] }, k: { int: [1, 4] } },
    testValues: { ys: "pence.slice(0, k)" },
    testCount: 3,
    test: { inputs: [{ list: "[k].concat(ys.map((x) => fl(x / 100)))" }], expected: "Total (£): {{fl(pyround(ys.reduce((s, x) => s + x / 100, 0), 2))}}" },
    hints: ["The number of items is a whole number (int); each price is a real number (float).", "Start the total at 0 and add each price inside the loop.", "Round the total to 2 places when you print it."],
    skills: ["real", "accumulator", "range"], tags: ["shop prices"] },
  { id: "comb-types-register", units: ["data-types", "loops-count"], source: "types-L9c", level: 9, type: "write", title: "Register check",
    params: { group: { choice: ["form group", "football squad", "choir", "trip group", "science club"] } },
    description: "Take the register for a {{group}}. Ask how many pupils are on the list, then ask \"Present? (yes/no)\" once for each. Each answer counts as present only if it is yes (store it as a Boolean, not with bool() casting). Print, for example:\nPresent: 3\nAbsent: 1",
    starter: "# Write your program here",
    solution: 'pupils = int(input("Pupils: "))\npresent = 0\nfor p in range(pupils):\n    here = input("Present? (yes/no): ") == "yes"\n    if here:\n        present = present + 1\nprint("Present:", present)\nprint("Absent:", pupils - present)',
    testParams: { n: { int: [2, 6] }, mask: { int: [0, 63] } },
    testValues: { ys: "Array.from({ length: n }, (_, i) => ((mask >> i) & 1 ? 'yes' : 'no'))", here: "ys.filter((y) => y === 'yes').length" },
    testCount: 4,
    test: { inputs: [{ list: "[n].concat(ys)" }], expected: "Present: {{here}}\nAbsent: {{n - here}}" },
    hints: ["Cast the number of pupils with int().", "answer == \"yes\" gives a Boolean. Casting with bool() would make no count as True too.", "Count with present = present + 1."],
    skills: ["boolean", "counting", "range"], tags: ["register counts"] },
  { id: "comb-types-tall", units: ["data-types", "loops-count"], source: "types-L6c", level: 8, type: "write", title: "Tall enough",
    params: { limit: { choice: [1.2, 1.3, 1.4, 1.5] }, ride: { choice: ["climbing wall", "zip wire", "go-karts", "high ropes"] } },
    description: "The {{ride}} on the trip needs pupils to be at least {{limit}} m tall. Ask how many pupils there are, then read each height in metres. Cast each value to a suitable type. Print how many are tall enough, for example:\nTall enough: 3",
    starter: "# Write your program here",
    solution: 'pupils = int(input("Pupils: "))\ntall = 0\nfor p in range(pupils):\n    height = float(input("Height (m): "))\n    if height >= {{limit}}:\n        tall = tall + 1\nprint("Tall enough:", tall)',
    testParams: { cms: { sample: [[110, 118, 120, 125, 130, 133, 140, 145, 150, 162], 5] }, k: { int: [1, 5] } },
    testValues: { ys: "cms.slice(0, k)", tall: "ys.filter((c) => c / 100 >= limit).length" },
    testCount: 4,
    test: { inputs: [{ list: "[k].concat(ys.map((c) => fl(c / 100)))" }], expected: "Tall enough: {{tall}}" },
    hints: ["Pupils are counted (int); a height has a decimal part (float).", "Count with an if inside the loop: >= includes the limit itself."],
    skills: ["real", "counting", "range"], tags: ["heights"] },

  // ---------- Write from scratch ----------
  { id: "scratch-types-trip", units: ["data-types"], source: "types-L10a", level: 10, type: "scratch", starter: "", title: "Trip planner",
    params: { place: { choice: ["science museum", "castle", "zoo", "theatre", "farm"] } },
    description: "Write a program from scratch for a trip to the {{place}}. Ask for the number of pupils, the cost per pupil in pounds, and whether the coach is booked (yes or no). Cast each value to a suitable type. Print, for example:\nTotal (£): 255.0\nCoach booked: True\nRound the total to 2 places. Coach booked is True only for yes.",
    solution: 'pupils = int(input("Pupils: "))\ncost = float(input("Cost per pupil (£): "))\nbooked = input("Coach booked? (yes/no): ") == "yes"\nprint("Total (£):", round(pupils * cost, 2))\nprint("Coach booked:", booked)',
    testParams: { n: { int: [10, 40] }, p: { int: [250, 2500] }, b: { choice: ["yes", "no"] } },
    testCount: 4,
    test: { inputs: ["{{n}}", "{{fl(p / 100)}}", "{{b}}"], expected: "Total (£): {{fl(pyround(n * (p / 100), 2))}}\nCoach booked: {{b === 'yes' ? 'True' : 'False'}}" },
    hints: ["Casting: int() for pupils, float() for the cost.", "booked = answer == \"yes\" (casting with bool() would be True even for no)."],
    skills: ["type-choice", "casting", "boolean"], tags: ["school trip"] },
  { id: "scratch-types-height", units: ["data-types"], source: "types-L9b", level: 10, type: "scratch", starter: "", title: "Height check",
    params: { limit: { choice: [1.4, 1.45, 1.5, 1.55, 1.6] } },
    description: "Write a program from scratch that asks for a height in metres, casts it to a suitable type, and prints the height in centimetres as a whole number (use round()) and whether it is at least {{limit}} m, for example:\nHeight (cm): 152\nAt least {{limit}} m: True",
    solution: 'height = float(input("Height (m): "))\nprint("Height (cm):", round(height * 100))\nprint("At least {{limit}} m:", height >= {{limit}})',
    testParams: { c: { int: [120, 190] } },
    testCases: [{ c: "Math.round(limit * 100)" }],
    testCount: 4,
    test: { inputs: ["{{fl(c / 100)}}"], expected: "Height (cm): {{c}}\nAt least {{limit}} m: {{c / 100 >= limit ? 'True' : 'False'}}" },
    hints: ["A height has a decimal part, so casting with float().", "A comparison like height >= 1.5 gives a Boolean you can print."],
    skills: ["real", "boolean", "casting"], tags: ["heights"] },
  { id: "scratch-types-receipt", units: ["data-types"], source: "types-L10c", level: 10, type: "scratch", starter: "", title: "One-line receipt",
    params: { item: { choice: ["pencil", "notebook", "ruler", "glue stick", "calculator"] } },
    description: "Write a program from scratch that asks how many of an item are bought and the price of one in pounds. Cast each value to a suitable type. Print one line with commas, then the type of the total, for example:\n3 x {{item}} = 2.25\nType: <class 'float'>\nRound the total to 2 places.",
    solution: 'qty = int(input("How many? "))\nprice = float(input("Price (£): "))\ntotal = round(qty * price, 2)\nprint(qty, "x {{item}} =", total)\nprint("Type:", type(total))',
    testParams: { q: { int: [1, 9] }, p: { int: [20, 450] } },
    testCount: 4,
    test: { inputs: ["{{q}}", "{{fl(p / 100)}}"], expected: "{{q}} x {{item}} = {{fl(pyround(q * (p / 100), 2))}}\nType: <class 'float'>" },
    hints: ["Casting: int() for the number bought, float() for the price.", "print(qty, \"x pencil =\", total) uses commas, so each comma adds a space."],
    skills: ["integer", "real", "casting"], tags: ["shop prices"] },
];

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
