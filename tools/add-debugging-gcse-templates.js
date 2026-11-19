// One-off (2026-11): hand-written combined templates for the Debugging (GCSE) unit, 3 for each pair of units next to it
// in the unit order (validate.js): Authentication and Debugging (GCSE), Debugging (GCSE) and Trace tables. Every one has
// the error question (error_kind) like the unit's own tasks. No write-from-scratch templates: the unit has none
// (curriculum.js noScratch: its write tasks start from a program with errors in it).
// Checked here first, with 20 seeds each: the error question is right for every variant (Checker.errorKindShapeProblems
// and errorKindRunProblems, by running the program with the errors), then by tools/hand-templates.js (each solution
// prints the expected output, and 5 or more different variants).
//
// Usage:  node tools/add-debugging-gcse-templates.js --check   check only
//         node tools/add-debugging-gcse-templates.js           check, then add them to templates.json
// Then: node tools/add-worked-examples.js.
"use strict";
const path = require("path");
const { addTemplates } = require("./hand-templates.js");
const { runPython } = require("./run-python.js");
const Checker = require(path.join(__dirname, "..", "checker.js"));
const Templates = require(path.join(__dirname, "..", "templates.js"));

const L = (...lines) => lines.join("\n");
// A template's error question from its solution and errors (whole lines, with the same {{…}} placeholders).
function withQuestion(tpl, ask, errors) {
  const bug = Checker.withErrors(tpl.solution, errors);
  if (bug == null) throw new Error(tpl.id + ": an error's fix line isn't in the solution");
  return Object.assign(tpl, { starter: bug, error_kind: { ask, bug, errors } });
}

const LOGIN = L('username = input("Username: ")', 'password = input("Password: ")', 'if username == "{{user}}" and password == "{{pw}}":', '    print("{{ok}}")', "else:", '    print("{{no}}")');
const TRIES = L("tries = 0", 'password = input("Password: ")', 'while password != "{{pw}}" and tries < 2:', "    tries = tries + 1", '    print("Wrong password")',
  '    password = input("Password: ")', 'if password == "{{pw}}":', '    print("Welcome")', "else:", '    print("Locked out")');
const USERS = { user: { choice: ["sam", "ria", "leo", "kit", "ola", "ben"] }, pw: { choice: ["sunset", "maple", "harbour", "pebble", "comet"] },
  bad: { choice: ["guess", "123", "password", "qwerty"] }, msg: { choice: [["Logged in", "Access denied"], ["Welcome", "Wrong details"], ["You're in", "Login failed"], ["Hello again", "Try again"]] } };

const NEW = [
  // ---------- Authentication + Debugging (GCSE) ----------
  withQuestion({ id: "comb-auth-bug-login", units: ["authentication", "debugging-gcse"], source: "bug-L7a", level: 7, type: "write", title: "Fix the login",
    params: USERS, values: { ok: "msg[0]", no: "msg[1]" },
    description: "Only {{user}} with the password {{pw}} can log in. The program prints {{ok}} or {{no}}. It has an error. Fix it in the editor.",
    solution: LOGIN,
    tests: [{ inputs: ["{{user}}", "{{pw}}"], expected: "{{ok}}" }, { inputs: ["{{user}}", "{{bad}}"], expected: "{{no}}" }],
    hints: ["Every if and else line needs the same ending.", "Ask: would Python run this program at all?"],
    skills: ["both-match", "syntax-error"], tags: ["debugging", "syntax error", "authentication"] },
  "kind", [{ kind: "syntax", fix: 'if username == "{{user}}" and password == "{{pw}}":', line: 'if username == "{{user}}" and password == "{{pw}}"' }]),
  withQuestion({ id: "comb-auth-bug-or", units: ["authentication", "debugging-gcse"], source: "bug-L8b", level: 8, type: "write", title: "Both must match",
    params: USERS, values: { ok: "msg[0]", no: "msg[1]" },
    description: "Only {{user}} with the password {{pw}} can log in: both must match. The program prints {{ok}} or {{no}}. It has an error. Fix it in the editor.",
    solution: LOGIN,
    tests: [{ inputs: ["{{user}}", "{{bad}}"], expected: "{{no}}" }, { inputs: ["{{user}}", "{{pw}}"], expected: "{{ok}}" }],
    hints: ["The program runs. Try the right username with a wrong password.", "Both the username and the password must be right."],
    skills: ["both-match", "logic-error", "error-definitions"], tags: ["debugging", "logic error", "authentication"] },
  "definition", [{ kind: "logic", fix: 'if username == "{{user}}" and password == "{{pw}}":', line: 'if username == "{{user}}" or password == "{{pw}}":' }]),
  withQuestion({ id: "comb-auth-bug-tries", units: ["authentication", "debugging-gcse"], source: "bug-L9d", level: 9, type: "write", title: "Three tries",
    params: { pw: USERS.pw, bad: USERS.bad, bad2: { choice: ["hello", "abc", "000", "secret"] } },
    description: "The user has three goes at typing the password {{pw}}. If none of the three is right, the program prints Locked out. It has two errors: one syntax error and one logic error. Fix both in the editor.",
    solution: TRIES,
    tests: [{ inputs: ["{{bad}}", "{{bad2}}", "{{pw}}"], expected: "Wrong password\nWrong password\nWelcome" }, { inputs: ["{{pw}}"], expected: "Welcome" }],
    hints: ["Fix the line Python refuses to run first.", "Then try two wrong passwords and the right one: how many tries should that use?"],
    skills: ["attempts", "two-errors"], tags: ["debugging", "syntax error", "logic error", "authentication"] },
  "both", [{ kind: "syntax", fix: 'if password == "{{pw}}":', line: 'if password == "{{pw}}"' }, { kind: "logic", fix: "    tries = tries + 1", line: "    tries = tries + 2" }]),

  // ---------- Debugging (GCSE) + Trace tables ----------
  withQuestion({ id: "comb-bug-trace-loop", units: ["debugging-gcse", "trace-tables"], source: "bug-L7b", level: 7, type: "write", title: "Trace to find it",
    params: { a: { int: [3, 9] }, b: { int: [2, 9] } }, where: "a !== b",
    description: "The program should add up the numbers from 1 to n. Trace the loop for a small n to find the error. It has an error. Fix it in the editor.",
    solution: L('n = int(input("How many numbers? "))', "total = 0", "for i in range(1, n + 1):", "    total = total + i", 'print("Total:", total)'),
    tests: [{ inputs: ["{{a}}"], expected: "Total: {{a * (a + 1) / 2}}" }, { inputs: ["{{b}}"], expected: "Total: {{b * (b + 1) / 2}}" }],
    hints: ["The program runs. Trace it for n = 3: the total should be 6.", "Each time round the loop, add the loop's number i."],
    skills: ["logic-error", "trace-loop"], tags: ["debugging", "logic error", "trace table"] },
  "kind", [{ kind: "logic", fix: "    total = total + i", line: "    total = total + n" }]),
  withQuestion({ id: "comb-bug-trace-select", units: ["debugging-gcse", "trace-tables"], source: "bug-L8a", level: 8, type: "write", title: "Odd or even",
    params: { h: { int: [1, 20] }, k: { int: [0, 20] } }, values: { e: "2 * h", o: "2 * k + 1" },
    description: "The program should say whether a number is even or odd. Trace it with one even and one odd number. It has an error. Fix it in the editor.",
    solution: L('x = int(input("Number: "))', "if x % 2 == 0:", '    print(x, "is even")', "else:", '    print(x, "is odd")'),
    tests: [{ inputs: ["{{e}}"], expected: "{{e}} is even" }, { inputs: ["{{o}}"], expected: "{{o}} is odd" }],
    hints: ["Look at the end of the if line.", "Ask: would Python run this program at all?"],
    skills: ["syntax-error", "error-definitions", "trace-selection"], tags: ["debugging", "syntax error", "trace table"] },
  "definition", [{ kind: "syntax", fix: "if x % 2 == 0:", line: "if x % 2 == 0" }]),
  withQuestion({ id: "comb-bug-trace-swap", units: ["debugging-gcse", "trace-tables"], source: "bug-L9a", level: 9, type: "write", title: "Swap two numbers",
    params: { p: { int: [1, 50] }, q: { int: [1, 50] }, r: { int: [1, 50] }, s: { int: [1, 50] } }, where: "p !== q && r !== s && p !== r",
    description: "The program should swap two numbers, using temp. Trace a, b and temp line by line. It has two errors: one syntax error and one logic error. Fix both in the editor.",
    solution: L('a = int(input("First: "))', 'b = int(input("Second: "))', "temp = a", "a = b", "b = temp", 'print("First is now", a)', 'print("Second is now", b)'),
    tests: [{ inputs: ["{{p}}", "{{q}}"], expected: "First is now {{q}}\nSecond is now {{p}}" }, { inputs: ["{{r}}", "{{s}}"], expected: "First is now {{s}}\nSecond is now {{r}}" }],
    hints: ["Fix the line Python refuses to run first.", "Then trace a, b and temp: after a = b, which variable still holds the first number?"],
    skills: ["two-errors", "trace-assignment"], tags: ["debugging", "syntax error", "logic error", "trace table"] },
  "both", [{ kind: "syntax", fix: 'print("First is now", a)', line: 'print("First is now", a' }, { kind: "logic", fix: "b = temp", line: "b = a" }]),
];

// The error question of every variant (20 seeds each), checked by running it.
function checkQuestions() {
  const problems = [];
  const jobs = [];
  const where = [];
  for (const tpl of NEW) {
    for (let seed = 1; seed <= 20; seed++) {
      const v = Templates.expand(tpl, seed);
      for (const p of Checker.errorKindShapeProblems(v.error_kind, v.solution)) problems.push(tpl.id + " seed " + seed + ": " + p);
      if (v.starter !== v.error_kind.bug) problems.push(tpl.id + " seed " + seed + ": the starter must be the program with the errors");
      const ek = Checker.errorKindJobs(v.error_kind, v.solution, v.tests);
      where.push({ id: tpl.id, seed, v, ek, from: jobs.length });
      ek.forEach((j) => jobs.push({ code: j.code, inputs: j.inputs, maxLines: 100000 }));
    }
  }
  const results = runPython(jobs);
  for (const w of where) {
    const res = results.slice(w.from, w.from + w.ek.length);
    for (const p of Checker.errorKindRunProblems(w.v.error_kind, w.ek, res, w.v.tests.map((t) => t.expected))) problems.push(w.id + " seed " + w.seed + ": " + p);
  }
  return problems;
}

const problems = checkQuestions();
console.log(NEW.length + " templates, error questions checked with 20 seeds each.");
if (problems.length) { console.log(problems.slice(0, 20).join("\n")); process.exit(1); }
if (process.argv.includes("--check")) { console.log("No problems."); process.exit(0); }
addTemplates(NEW);
