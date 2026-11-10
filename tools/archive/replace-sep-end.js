// One-off (2026-11, confirmed by the teacher): at Output and sequence level 10, four tasks repeated the same sep=/end=
// idea as a task kept at that level. Each is replaced by a comma task with the same level, type and skills.
//   out-L10e (sep=" | ", like out-L10a)  -> out-L10o      out-L10k (sep=" - ", like out-L10a) -> out-L10p
//   out-L10f (end=" | ", like out-L10c)  -> out-L10q      out-L10h (end="... ", like out-L10c) -> out-L10r
// The new task lists the old id in former_ids, so older attempts and exports still find it in the teacher view, with
// former_ids_are_replacements: the old task was a different task, so its saved progress (a pass, the log, a task in
// progress) is NOT moved onto the new one, and imports and recheck.py don't treat it as the same task.
// Run once: node tools/archive/replace-sep-end.js, then add-worked-examples, derive-templates and the tests.
"use strict";
const fs = require("fs");
const path = require("path");
const { runPython, ROOT } = require("../run-python.js");
const Checker = require(path.join(ROOT, "checker.js"));

const file = path.join(ROOT, "tasks.json");
const tasks = JSON.parse(fs.readFileSync(file, "utf8"));

const NEW = [
  { replaces: "out-L10e", task: {
    id: "out-L10o", unit: "output", level: 10, type: "write", title: "Sports day results",
    description: "Write a program that prints exactly:\nSports day results\nHouse Points\nPhoenix 42\nDragon 38\n\nWinner: Phoenix\nUse commas in print() to put the values on each line.",
    starter: "# Write your program here",
    solution: "print(\"Sports day results\")\nprint(\"House\", \"Points\")\nprint(\"Phoenix\", 42)\nprint(\"Dragon\", 38)\nprint()\nprint(\"Winner:\", \"Phoenix\")",
    tests: [{ inputs: [], expected: "Sports day results\nHouse Points\nPhoenix 42\nDragon 38\n\nWinner: Phoenix" }],
    hints: ["There are six lines, so you need six print() calls.", "print() on its own prints a blank line.",
      "A comma between two values prints one space between them: print(\"Phoenix\", 42)."],
    tags: ["commas in print", "empty print"], skills: ["print", "sep/end", "sequence"] } },
  { replaces: "out-L10k", task: {
    id: "out-L10p", unit: "output", level: 10, type: "write", title: "Bus stop sign",
    description: "Use commas in print() to print this sign exactly:\nBus 42 to the station\nBus 17 to the park\nBus 9 to the hospital\nNo spaces are needed inside the quotes: the commas add them.",
    starter: "# Write your program here",
    solution: "print(\"Bus\", 42, \"to the station\")\nprint(\"Bus\", 17, \"to the park\")\nprint(\"Bus\", 9, \"to the hospital\")",
    tests: [{ inputs: [], expected: "Bus 42 to the station\nBus 17 to the park\nBus 9 to the hospital" }],
    hints: ["Each line has three values: the word Bus, a number and where it goes.",
      "print() puts one space between values separated by commas (that is what sep= does when you don't set it)."],
    tags: ["commas in print"], skills: ["sep/end", "print"] } },
  { replaces: "out-L10f", task: {
    id: "out-L10q", unit: "output", level: 10, type: "write", title: "Club list",
    description: "Write a program that prints exactly:\nMonday: Chess club\nTuesday: Drama club\nWednesday: Coding club\nSee you there!\nUse commas in print() between the day, the club and the word club.",
    starter: "# Write your program here",
    solution: "print(\"Monday:\", \"Chess\", \"club\")\nprint(\"Tuesday:\", \"Drama\", \"club\")\nprint(\"Wednesday:\", \"Coding\", \"club\")\nprint(\"See you there!\")",
    tests: [{ inputs: [], expected: "Monday: Chess club\nTuesday: Drama club\nWednesday: Coding club\nSee you there!" }],
    hints: ["Each club line has three values separated by commas.",
      "Don't put a space inside the quotes as well: the comma already adds one, so you'd get two.",
      "print(\"Monday:\", \"Chess\", \"club\")"],
    tags: ["commas in print", "spacing"], skills: ["sep/end", "sequence"] } },
  { replaces: "out-L10h", task: {
    id: "out-L10r", unit: "output", level: 10, type: "write", title: "Countdown in one print",
    description: "Use ONE print() with commas to print, on one line:\n5 4 3 2 1 Holidays!",
    starter: "# Write your program here",
    solution: "print(5, 4, 3, 2, 1, \"Holidays!\")",
    tests: [{ inputs: [], expected: "5 4 3 2 1 Holidays!" }],
    hints: ["print() can take many values, separated by commas.",
      "Numbers don't need quotes. Each comma puts one space between the values."],
    tags: ["commas in print"], skills: ["sep/end"] } },
];

const ids = new Set(tasks.map((t) => t.id));
for (const n of NEW) {
  if (ids.has(n.task.id)) throw new Error(n.task.id + " already exists: already run?");
  if (!ids.has(n.replaces)) throw new Error(n.replaces + " not found");
}
// Each new solution must print its expected output.
const results = runPython(NEW.map((n) => ({ code: n.task.solution, inputs: n.task.tests[0].inputs })));
results.forEach((r, i) => {
  if (r.error || !Checker.outputsMatch(r.output, NEW[i].task.tests[0].expected)) throw new Error(NEW[i].task.id + ": solution prints " + JSON.stringify(r.output));
});
let out = tasks;
for (const n of NEW) {
  const i = out.findIndex((t) => t.id === n.replaces);
  out.splice(i, 1, Object.assign({}, n.task, { former_ids: [n.replaces], former_ids_are_replacements: true }));
}
fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
console.log("Replaced " + NEW.map((n) => n.replaces + " -> " + n.task.id).join(", "));
