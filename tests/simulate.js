// Simulation of the adaptive rule with made-up students.
// Usage:  node tests/simulate.js        (prints each student's trace and the checks)
// Also run by tests/validate.js.

"use strict";
const path = require("path");
const App = require(path.join(__dirname, "..", "app.js"));
const { applyOutcome, freshUnitState, levelMessage, RECOVERY_CEILING_TASKS } = App;

// Shorthands for task outcomes.
const pass = (skill) => ({ passed: true, hints: 0, skills: [skill] });
const passOneHint = (skill) => ({ passed: true, hints: 1, skills: [skill] });
const passWithHints = (skill) => ({ passed: true, hints: 2, skills: [skill] });
const passAllHints = (skill) => ({ passed: true, hints: 3, skills: [skill] });
const fail = (skill) => ({ passed: false, hints: 0, skills: [skill] });
const passAfterShowHow = (skill) => ({ passed: true, hints: 0, skills: [skill], showHow: true }); // used "Show me how" first

// Runs one student through a list of outcomes. Returns one row per task.
function simulate(startLevel, outcomes) {
  let state = freshUnitState(startLevel);
  return outcomes.map((o, i) => {
    const before = state.level;
    const r = applyOutcome(state, o);
    const { change, reason, ...fields } = r;
    state = Object.assign({}, state, fields);
    return { task: i + 1, outcome: o, before, after: r.level, change, reason, ceiling: r.ceiling, ceilingTasksLeft: r.ceilingTasksLeft, message: levelMessage(r) };
  });
}

const STUDENTS = [
  {
    name: "Fatima (consistent, varied skills)",
    start: 3,
    outcomes: [pass("if"), passOneHint("elif"), pass("and/or"), pass("if"), pass("boundary")],
  },
  {
    name: "Harry (consistent, but only one skill)",
    start: 3,
    outcomes: [pass("print"), pass("print"), pass("print"), pass("print"), pass("print")],
  },
  {
    name: "Oliver (struggling)",
    start: 5,
    outcomes: [pass("if"), fail("elif"), fail("and/or"), passAllHints("if"), passWithHints("elif"), fail("if")],
  },
  {
    name: "Jess (jumps too far, then recovers)",
    start: 2,
    outcomes: [
      pass("arithmetic"), pass("modulo"), pass("power"), pass("rounding"), pass("precedence"), // fast move up
      fail("division"), fail("modulo"),                                                       // recovery drop
      pass("power"), pass("rounding"), pass("modulo"), pass("power"), pass("rounding"),        // capped by the ceiling
      pass("arithmetic"), pass("division"),                                                   // ceiling lifted
    ],
  },
  {
    name: "Kai (moves up, then struggles later on)",
    start: 4,
    outcomes: [pass("input"), pass("int()"), pass("str()"), passWithHints("input"), pass("str()"), fail("int()"), fail("input")],
  },
  {
    name: "Ruby (already at the top)",
    start: 9,
    outcomes: [pass("if"), pass("elif"), pass("not"), pass("if"), pass("boundary"), pass("if"), pass("elif")],
  },
  {
    name: "Leo (at the bottom)",
    start: 1,
    outcomes: [fail("print"), fail("comments"), fail("print"), fail("sequence")],
  },
  {
    name: "Maya (uses \"Show me how\" twice)",
    start: 4,
    outcomes: [fail("range"), passAfterShowHow("range"), passAfterShowHow("step"), pass("for"), pass("range")],
  },
  {
    name: "Max (the same tasks as Maya, without \"Show me how\")",
    start: 4,
    outcomes: [fail("range"), pass("range"), pass("step"), pass("for"), pass("range")],
  },
];

function runSimulations() {
  const traces = Object.fromEntries(STUDENTS.map((s) => [s.name, simulate(s.start, s.outcomes)]));
  const checks = [];
  const check = (ok, message) => checks.push({ ok: !!ok, message });
  const t = (name) => traces[STUDENTS.find((s) => s.name.startsWith(name)).name];

  // Fast move up: the 5th strong pass in a row, covering 3+ skills, goes up 2.
  const fatima = t("Fatima");
  check(fatima[1].after === 4 && fatima[1].reason === "passes", "Fatima: normal move up after 2 strong passes (a 1-hint pass still counts)");
  check(fatima[3].after === 5 && fatima[3].reason === "passes", "Fatima: second normal move up after 2 more strong passes");
  check(fatima[4].reason === "fast" && fatima[4].change === 2 && fatima[4].after === 7, "Fatima: fast move up of 2 levels on the 5th strong pass in a row (5 → 7)");
  check(/moved up to Level 7|jumped up to Level 7/.test(fatima[4].message), "Fatima: positive level-up message mentions Level 7");

  // No fast move up without skill variety.
  const harry = t("Harry");
  check(!harry.some((r) => r.reason === "fast"), "Harry: no fast move up when the 5 tasks cover only 1 skill");
  check(harry[4].after === 5, "Harry: still moves up normally (3 → 5 after 5 strong passes)");

  // Normal move down.
  const oliver = t("Oliver");
  check(oliver[2].reason === "fails" && oliver[2].after === 4, "Oliver: 2 fails in a row move down 1 level (5 → 4)");
  check(oliver[2].ceiling == null, "Oliver: a normal move down sets no ceiling");
  check(oliver[3].reason === "hints" && oliver[3].after === 3, "Oliver: using 3 hints moves down 1 level, even on a pass (4 → 3)");
  check(oliver[4].change === 0 && oliver[5].change === 0, "Oliver: a 2-hint pass then one fail doesn't change the level");
  check(oliver[2].message === "Let's build up a bit more at Level 4.", "Oliver: positive level-down message");

  // Recovery drop.
  const jess = t("Jess");
  check(jess[4].reason === "fast" && jess[4].after === 6, "Jess: fast move up to Level 6");
  check(jess[6].reason === "recovery" && jess[6].before === 6 && jess[6].after === 5, "Jess: 2 fails within 3 tasks of moving up → recovery drop of 1 level (6 → 5)");
  check(jess[6].ceiling === 5 && jess[6].ceilingTasksLeft === RECOVERY_CEILING_TASKS, "Jess: Level 5 becomes the ceiling for the next " + RECOVERY_CEILING_TASKS + " tasks");
  const capped = jess.slice(7, 7 + RECOVERY_CEILING_TASKS);
  check(capped.length === RECOVERY_CEILING_TASKS && capped.every((r) => r.after === 5), "Jess: stays at the ceiling (Level 5) for the next " + RECOVERY_CEILING_TASKS + " tasks despite strong passes");
  check(capped[capped.length - 1].ceiling == null, "Jess: the ceiling is lifted after " + RECOVERY_CEILING_TASKS + " tasks");
  check(jess[jess.length - 1].after === 6, "Jess: moves back up to Level 6 once the ceiling is lifted");
  check(Math.min(...jess.slice(6).map((r) => r.after)) === 5, "Jess: the recovery drop is only 1 level – no further penalty");

  // Fails long after a level-up are a normal drop, not a recovery drop.
  const kai = t("Kai");
  check(kai[1].after === 5, "Kai: moves up to Level 5");
  check(kai[6].reason === "fails" && kai[6].after === 4 && kai[6].ceiling == null, "Kai: 2 fails more than 3 tasks after moving up → normal drop with no ceiling");

  // Limits.
  const ruby = t("Ruby");
  check(ruby.every((r) => r.after <= 10), "Ruby: never goes above Level 10");
  check(ruby[1].after === 10 && ruby[ruby.length - 1].after === 10, "Ruby: reaches and stays at Level 10");
  const leo = t("Leo");
  check(leo.every((r) => r.after === 1), "Leo: never goes below Level 1");
  check(leo.every((r) => r.message === null), "Leo: no level-change message when the level can't change");

  // "Show me how" never moves a student by itself: the passes after it aren't strong, so they don't move her up,
  // and it isn't a hint, so it doesn't move her down either.
  const maya = t("Maya");
  const max = t("Max");
  check(maya.slice(1, 3).every((r) => r.change === 0 && r.reason === ""), "Maya: using \"Show me how\" twice doesn't change her level (stays at 4)");
  check(max[2].after === 5, "Max: the same passes without \"Show me how\" move him up (4 → 5)");
  check(maya[3].after === 4 && maya[4].after === 5 && maya[4].reason === "passes", "Maya: afterwards the normal rule carries on (2 strong passes → Level 5)");

  return { traces, checks };
}

module.exports = { runSimulations, simulate };

if (require.main === module) {
  const { traces, checks } = runSimulations();
  const describe = (o) => (o.passed ? "pass" : "fail") + (o.hints ? " (" + o.hints + " hint" + (o.hints > 1 ? "s" : "") + ")" : "") + (o.showHow ? " (show me how)" : "") + " [" + o.skills.join(",") + "]";
  for (const [name, rows] of Object.entries(traces)) {
    console.log("\n" + name);
    for (const r of rows) {
      console.log("  task " + String(r.task).padStart(2) + ": " + describe(r.outcome).padEnd(32) + " L" + r.before + " → L" + r.after +
        (r.reason ? "  (" + r.reason + ")" : "") + (r.ceiling != null ? "  ceiling L" + r.ceiling + ", " + r.ceilingTasksLeft + " left" : ""));
    }
  }
  console.log("");
  checks.forEach((c) => console.log((c.ok ? "  ok   " : "  FAIL ") + c.message));
  const failed = checks.filter((c) => !c.ok).length;
  console.log(failed ? "\n" + failed + " simulation check(s) FAILED" : "\nAll " + checks.length + " simulation checks passed.");
  process.exit(failed ? 1 : 0);
}
