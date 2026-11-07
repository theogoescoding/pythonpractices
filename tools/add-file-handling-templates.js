// One-off (2026-11): hand-written templates for File handling: 3 combined Functions, return values + File handling.
// Like the unit itself, they are puzzles (Parsons and fill-in), never write tasks, and File handling has no
// write-from-scratch templates (noScratch in curriculum.js). Every program makes its own file. Checked by
// tools/hand-templates.js (20 seeds each).
"use strict";
const { addTemplates } = require("./hand-templates.js");

const FILES = ["notes.txt", "data.txt", "save.txt", "store.txt", "memo.txt"];

addTemplates([
  { id: "comb-file-fr-save", units: ["functions-return", "file-handling"], source: "fr-L6b", level: 6, type: "parsons", title: "Save and load functions",
    params: { fname: { choice: FILES } },
    description: "Arrange the lines so save() writes some text to {{fname}}, load() returns what is in it, and the program prints what was loaded.\nTwo lines are not needed.",
    solution: 'def save(name, text):\n    with open(name, "w") as file:\n        file.write(text)\ndef load(name):\n    with open(name, "r") as file:\n        return file.read()\nsave("{{fname}}", input("Note: "))\nprint("Loaded:", load("{{fname}}"))',
    distractors: ["print(file.read())", "file.write(name)"],
    testParams: { note: { choice: ["PE kit", "Bring a coat", "Quiz at 2", "Library book", "Trip money"] } },
    testCount: 3,
    test: { inputs: ["{{note}}"], expected: "Loaded: {{note}}" },
    hints: ["load() must return what read() gives back, not print it.", "save() writes the parameter text with with open(name, \"w\")."],
    skills: ["return", "with-open", "write"], tags: ["files"] },
  { id: "comb-file-fr-count", units: ["functions-return", "file-handling"], source: "fr-L7a", level: 7, type: "fill", title: "Count the lines",
    params: { fname: { choice: FILES }, word: { choice: ["tick", "done", "yes", "star"] } },
    description: "Write the missing line so count_lines() gives back the number of lines it counted. The number of lines to write is cast to an integer.",
    starter: 'def count_lines(name):\n    total = 0\n    with open(name, "r") as file:\n        for line in file:\n            total = total + 1\n    ____\nwith open("{{fname}}", "w") as file:\n    for i in range(int(input("How many lines? "))):\n        file.write("{{word}}\\n")\nprint("Lines:", count_lines("{{fname}}"))',
    answers: ["return total"],
    testParams: { k: { int: [1, 9] } },
    testCount: 3,
    test: { inputs: ["{{k}}"], expected: "Lines: {{k}}" },
    hints: ["The function must return its result.", "Without return the call gives back None. Casting with int() made the number of lines a number."],
    skills: ["return", "lines"], tags: ["files"] },
  { id: "comb-file-fr-load", units: ["functions-return", "file-handling"], source: "fr-L3b", level: 4, type: "fill", title: "Load a score",
    params: { fname: { choice: FILES }, bonus: { choice: [5, 10, 20] } },
    description: "Fill in both blanks: read the file inside load_score(), then call load_score() and store its result.",
    starter: 'def load_score(name):\n    with open(name, "r") as file:\n        return int(file.____())\nwith open("{{fname}}", "w") as file:\n    file.write(input("Score: "))\nbest = ____("{{fname}}")\nprint("Score plus bonus:", best + {{bonus}})',
    answers: ["read", "load_score"],
    testParams: { s: { int: [1, 99] } },
    testCount: 3,
    test: { inputs: ["{{s}}"], expected: "Score plus bonus: {{s + bonus}}" },
    hints: ["read() gives back the file's text; casting with int() makes it a number.", "Call the function by its name and store the result in best."],
    skills: ["return", "read", "store-result"], tags: ["scores"] },
]);
