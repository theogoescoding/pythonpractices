// One-off (2026-11): the "Data types and casting" unit's hand-written templates: 5 combined (with Variables and input,
// Maths in Python, and 3 with Count-controlled loops, the unit taught just before it) and 3 write-from-scratch.
// Added later (2026-11), when Data types moved between Variables and Maths and the Strings unit was added: 2 more with
// Variables and input, 2 more with Maths in Python (3 each with the units either side), and 3 with Strings.
// Each is expanded with 20 seeds: its solution must print the expected output every time, with 5+ different variants.
// Templates already in templates.json are left as they are, so running it again only adds the new ones.
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
  { id: "comb-types-trip-share", units: ["data-types", "maths"], source: "types-L9e", level: 9, type: "write", title: "Sharing the cost",
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
  { id: "comb-types-basket", units: ["data-types", "loops-count"], source: "types-L8d", level: 10, type: "write", title: "Basket total",
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
  { id: "comb-types-register", units: ["data-types", "loops-count"], source: "types-L9f", level: 9, type: "write", title: "Register check",
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
  // These three replaced scratch-types-trip, scratch-types-height and scratch-types-receipt, which used round()
  // (tools/archive/replace-types-round-if.js removed those). Prices are whole quarters of a pound, so totals are exact.
  { id: "scratch-types-trip-cost", units: ["data-types"], source: "types-L10d", level: 10, type: "scratch", starter: "", title: "Trip planner",
    params: { place: { choice: ["science museum", "castle", "zoo", "theatre", "farm"] } },
    description: "Write a program from scratch for a trip to the {{place}}. Ask for the number of pupils, the cost per pupil in pounds, and whether the coach is booked (yes or no). Cast each value to a suitable type. Print the total cost (pupils times the cost) and whether the coach is booked, for example:\nTotal (£): 255.0\nCoach booked: True\nCoach booked is True only for yes.",
    solution: 'pupils = int(input("Pupils: "))\ncost = float(input("Cost per pupil (£): "))\nbooked = input("Coach booked? (yes/no): ") == "yes"\nprint("Total (£):", pupils * cost)\nprint("Coach booked:", booked)',
    testParams: { n: { int: [10, 40] }, q: { int: [10, 100] }, b: { choice: ["yes", "no"] } },
    testCount: 4,
    test: { inputs: ["{{n}}", "{{fl(q / 4)}}", "{{b}}"], expected: "Total (£): {{fl(n * (q / 4))}}\nCoach booked: {{b === 'yes' ? 'True' : 'False'}}" },
    hints: ["Casting: int() for pupils, float() for the cost.", "booked = answer == \"yes\" (casting with bool() would be True even for no)."],
    skills: ["type-choice", "casting", "boolean"], tags: ["school trip"] },
  { id: "scratch-types-height-check", units: ["data-types"], source: "types-L9e", level: 10, type: "scratch", starter: "", title: "Height check",
    params: { limit: { choice: [1.4, 1.45, 1.5, 1.55, 1.6] } },
    description: "Write a program from scratch that asks for a height in metres and casts it to a suitable type. Print the height, its type, and whether it is at least {{limit}} m, for example:\nHeight (m): 1.52\nType: <class 'float'>\nAt least {{limit}} m: True",
    solution: 'height = float(input("Height (m): "))\nprint("Height (m):", height)\nprint("Type:", type(height))\nprint("At least {{limit}} m:", height >= {{limit}})',
    testParams: { c: { int: [120, 190] } },
    testCases: [{ c: "Math.round(limit * 100)" }],
    testCount: 4,
    test: { inputs: ["{{fl(c / 100)}}"], expected: "Height (m): {{fl(c / 100)}}\nType: <class 'float'>\nAt least {{limit}} m: {{c / 100 >= limit ? 'True' : 'False'}}" },
    hints: ["A height has a decimal part, so casting with float().", "A comparison like height >= 1.5 gives a Boolean you can print."],
    skills: ["real", "boolean", "casting"], tags: ["heights"] },
  { id: "scratch-types-receipt-type", units: ["data-types"], source: "types-L10f", level: 10, type: "scratch", starter: "", title: "One-line receipt",
    params: { item: { choice: ["pencil", "notebook", "ruler", "glue stick", "calculator"] } },
    description: "Write a program from scratch that asks how many of an item are bought and the price of one in pounds. Cast each value to a suitable type. Print one line with commas showing the total, then the type of the total, for example:\n3 x {{item}} = 2.25\nType: <class 'float'>",
    solution: 'qty = int(input("How many? "))\nprice = float(input("Price (£): "))\ntotal = qty * price\nprint(qty, "x {{item}} =", total)\nprint("Type:", type(total))',
    testParams: { q: { int: [1, 9] }, p: { int: [1, 18] } },
    testCount: 4,
    test: { inputs: ["{{q}}", "{{fl(p / 4)}}"], expected: "{{q}} x {{item}} = {{fl(q * (p / 4))}}\nType: <class 'float'>" },
    hints: ["Casting: int() for the number bought, float() for the price.", "print(qty, \"x pencil =\", total) uses commas, so each comma adds a space."],
    skills: ["integer", "real", "casting"], tags: ["shop prices"] },

  // ---------- Added with the move between Variables and Maths: Variables and input ----------
  { id: "comb-types-var-months", units: ["data-types", "variables"], source: "types-L8c", level: 8, type: "write", title: "Pet age",
    params: { pet: { choice: ["dog", "cat", "rabbit", "tortoise", "hamster", "parrot"] } },
    description: "Ask for the name of a pet {{pet}} and its age in whole years. Cast the age to an integer. Print the name, then the age in months, for example:\nName: Biscuit\nAge in months: 36",
    starter: "# Write your program here",
    solution: 'name = input("Name: ")\nyears = int(input("Age in years: "))\nprint("Name:", name)\nprint("Age in months:", years * 12)',
    testParams: { who: { choice: ["Biscuit", "Pepper", "Luna", "Milo", "Coco", "Rex"] }, y: { int: [1, 15] } },
    testCount: 3,
    test: { inputs: ["{{who}}", "{{y}}"], expected: "Name: {{who}}\nAge in months: {{y * 12}}" },
    hints: ["The name stays a string. Casting the age with int() lets you multiply it.", "There are 12 months in a year.", "Print each label and value with a comma."],
    skills: ["casting", "input"], tags: ["pets"] },
  { id: "comb-types-var-label", units: ["data-types", "variables"], source: "types-L4a", level: 9, type: "write", title: "Shelf label",
    params: { shop: { choice: ["school shop", "book fair", "tuck shop", "stationery stall", "uniform shop"] } },
    description: "At the {{shop}}, ask for an item and its price in pounds (it can have pence). Cast the price to a real number. Build a label from the item, a space, £ and the price, store it in label, and print it. Then print what two cost, rounded to 2 places, for example:\nLabel: pencil £0.45\nTwo cost (£): 0.9",
    starter: "# Write your program here",
    solution: 'item = input("Item: ")\nprice = float(input("Price (£): "))\nlabel = item + " £" + str(price)\nprint("Label:", label)\nprint("Two cost (£):", round(price * 2, 2))',
    testParams: { it: { choice: ["pencil", "ruler", "eraser", "notebook", "glue stick", "sharpener"] }, p: { int: [20, 450] } },
    testCount: 3,
    test: { inputs: ["{{it}}", "{{fl(p / 100)}}"], expected: "Label: {{it}} £{{fl(p / 100)}}\nTwo cost (£): {{fl(pyround(p / 100 * 2, 2))}}" },
    hints: ["Casting with float() lets the price have pence.", "The label is built with + and stored, so the price needs str() casting first.", "Print each label and value with a comma."],
    skills: ["casting", "concatenation"], tags: ["shop prices"] },

  // ---------- Maths in Python ----------
  { id: "comb-types-maths-share", units: ["data-types", "maths"], source: "types-L2b", level: 9, type: "write", title: "Fair shares",
    params: { things: { choice: ["sweets", "stickers", "marbles", "cards", "pencils"] } },
    description: "Some {{things}} are shared out equally. Ask how many {{things}} there are and how many people share them, and cast each to an integer. Print how many each person gets, how many are left over, and the exact share as a real number rounded to 2 places, for example:\nEach gets: 4\nLeft over: 2\nExact share: 4.67",
    starter: "# Write your program here",
    solution: 'total = int(input("How many? "))\npeople = int(input("People: "))\nprint("Each gets:", total // people)\nprint("Left over:", total % people)\nprint("Exact share:", round(total / people, 2))',
    testParams: { t: { int: [10, 99] }, n: { int: [2, 9] } },
    testCount: 3,
    test: { inputs: ["{{t}}", "{{n}}"], expected: "Each gets: {{idiv(t, n)}}\nLeft over: {{mod(t, n)}}\nExact share: {{fl(pyround(t / n, 2))}}" },
    hints: ["Casting both inputs with int() makes them whole numbers.", "// gives whole shares and % gives what is left over; / gives a real number.", "round(..., 2) rounds to 2 places."],
    skills: ["casting", "integer-division", "modulo"], tags: ["sharing"] },
  { id: "comb-types-maths-area", units: ["data-types", "maths"], source: "types-L5d", level: 8, type: "write", title: "Floor area",
    params: { room: { choice: ["classroom", "hall", "kitchen", "bedroom", "library", "garden shed"] } },
    description: "Ask for the length and width of a {{room}} in metres (they can have decimals). Cast each to a real number. Work out the area rounded to 2 places, then print it and its type, for example:\nArea (m²): 12.6\nType: <class 'float'>",
    starter: "# Write your program here",
    solution: 'length = float(input("Length (m): "))\nwidth = float(input("Width (m): "))\narea = round(length * width, 2)\nprint("Area (m²):", area)\nprint("Type:", type(area))',
    // Lengths in tenths of a metre, so the exact area has at most 2 decimal places (never halfway when rounded).
    testParams: { l: { int: [20, 90] }, w: { int: [15, 60] } },
    testCount: 3,
    test: { inputs: ["{{fl(l / 10)}}", "{{fl(w / 10)}}"], expected: "Area (m²): {{fl(pyround(l * w / 100, 2))}}\nType: <class 'float'>" },
    hints: ["Casting with float() lets a measurement have decimals.", "The area is length * width; round(..., 2) keeps 2 places.", "type() shows the area is a real number: Python calls it float."],
    skills: ["real", "arithmetic", "rounding"], tags: ["measuring"] },

  // ---------- Strings ----------
  { id: "comb-types-str-code", units: ["data-types", "strings"], source: "types-L4c", level: 9, type: "write", title: "Club code",
    params: { club: { choice: ["chess club", "choir", "coding club", "drama club", "art club"] } },
    description: "The {{club}} gives each member a code: the first 3 letters of their surname in capital letters, then their year group plus 1 (next year's group). Ask for the surname and the year group, and cast the year group to an integer. Build the code with + and str() casting, store it, and print it, for example:\nCode: KHA8",
    starter: "# Write your program here",
    solution: 'surname = input("Surname: ")\nyear = int(input("Year group: "))\ncode = surname[0:3].upper() + str(year + 1)\nprint("Code:", code)',
    testParams: { s: { choice: ["Khan", "Smith", "Patel", "Jones", "Okafor", "Brown", "Nguyen"] }, y: { int: [7, 10] } },
    testCount: 3,
    test: { inputs: ["{{s}}", "{{y}}"], expected: "Code: {{s.slice(0, 3).toUpperCase()}}{{y + 1}}" },
    hints: ["Casting the year group with int() lets you add 1; str() casts it back to text.", "The code is built with + and stored, so every piece must be a string.", "Slicing [0:3] gives the first 3 letters; upper() gives capital letters."],
    skills: ["casting", "slicing", "upper/lower"], tags: ["clubs"] },
  { id: "comb-types-str-ticket", units: ["data-types", "strings"], source: "types-L1b", level: 8, type: "write", title: "Next ticket",
    params: { event: { choice: ["school play", "concert", "quiz night", "disco", "talent show"] } },
    description: "A {{event}} ticket code is 2 letters then 4 digits, for example AB1234. Ask for a code. Slice out the 4 digits, cast them to an integer, and print the next ticket number, for example:\nNext ticket: 1235",
    starter: "# Write your program here",
    solution: 'code = input("Ticket code: ")\nnumber = int(code[2:6])\nprint("Next ticket:", number + 1)',
    testParams: { a: { choice: ["AB", "QT", "ZK", "MP", "RX", "LD"] }, d: { int: [1000, 9998] } },
    testCount: 3,
    test: { inputs: ["{{a}}{{d}}"], expected: "Next ticket: {{d + 1}}" },
    hints: ["Slicing [2:6] gives the characters at indexes 2 to 5: the digits.", "The digits are still a string until casting with int()."],
    skills: ["casting", "string", "slicing"], tags: ["tickets"] },
  { id: "comb-types-str-length", units: ["data-types", "strings"], source: "types-L1d", level: 8, type: "write", title: "Word length check",
    params: { game: { choice: ["word game", "crossword", "spelling quiz", "word search", "anagram game"] } },
    description: "A {{game}} needs words of an exact length. Ask for a word and the length needed, and cast the length to an integer. Print the word's length, whether it is exactly right (a Boolean), and the word in capital letters, for example:\nLength: 5\nExactly right: True\nWord: APPLE",
    starter: "# Write your program here",
    solution: 'word = input("Word: ")\nneeded = int(input("Length needed: "))\nprint("Length:", len(word))\nprint("Exactly right:", len(word) == needed)\nprint("Word:", word.upper())',
    testParams: { w: { choice: ["apple", "river", "cat", "planet", "zebra", "biscuit", "moon", "garden"] }, k: { int: [3, 7] } },
    testCases: [{ w: "'apple'", k: "5" }],
    testCount: 3,
    test: { inputs: ["{{w}}", "{{k}}"], expected: "Length: {{w.length}}\nExactly right: {{w.length === k ? 'True' : 'False'}}\nWord: {{w.toUpperCase()}}" },
    hints: ["Casting the length with int() lets you compare it with len(word).", "len(word) == needed gives a Boolean: True or False.", "upper() gives capital letters."],
    skills: ["boolean", "casting", "length"], tags: ["word games"] },
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
