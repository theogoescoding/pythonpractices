// The paste flag (whole site). A paste into the code editor of a write or write-from-scratch task is flagged as
// possible AI use when either:
//   - it is the whole program: just before the paste, the editor held nothing else (it was empty, or held only the
//     task's starter comment, or only blank lines). "Else" is the editor's text that stays when the paste goes in, so
//     a paste over the whole selected program counts too. It must be at least 3 lines (WHOLE_MIN_LINES; blank lines
//     at the start and end don't count), so a one- or two-line paste into an empty editor isn't flagged; or
//   - it is long: a single paste of more than 8 lines, even into a program the student had already started.
// Pasting expected output is never flagged. Expected output is what the task's Expected output box shows (and what a
// failed test shows as "Expected"): a test's output as the checker compares it (Checker.normalise: trailing spaces and
// trailing blank lines ignored). A paste counts as expected output when its lines (blank lines at the start and end
// left out, spaces at each end of a line ignored) appear, in order and together, in one of the task's tests' expected
// output. That match is exact, so program code can't pass as output by accident; a paste that matches is never flagged.
// A paste of nothing but blank lines is never flagged. It never compares with earlier attempts.
// A flagged task is recorded as skipped (outcome): the student's code isn't run against the tests.
// Assignments: the flagged task stays, marked tried, until the student clears the pasted code (or deletes it all).
// No DOM here: app.js calls it from the editor's paste, tests/features.js checks it.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./checker.js"));
  else root.PasteFlag = factory(root.Checker);
})(typeof self !== "undefined" ? self : this, function (Checker) {
  const MAX_LINES = 8;                    // more than this many lines in one paste is flagged
  const WHOLE_MIN_LINES = 3;              // a whole-program paste is flagged from this many lines
  const EDITOR_TYPES = ["write", "scratch"]; // the tasks with the code editor (write, and write from scratch)

  // The paste's lines, without blank lines at the start and end ("a\nb\n" is 2 lines).
  function lines(text) {
    const all = Checker.normalise(text).split("\n");
    while (all.length && all[0].trim() === "") all.shift();
    while (all.length && all[all.length - 1].trim() === "") all.pop();
    return all;
  }
  const lineCount = (text) => lines(text).length;

  // Whether the pasted text is (part of) the expected output of one of the task's tests.
  function isExpectedOutput(text, task) {
    const p = lines(text).map((l) => l.trim());
    if (!p.length) return false;
    return ((task && task.tests) || []).some((test) => {
      const e = Checker.normalise(test.expected).split("\n").map((l) => l.trim());
      for (let i = 0; i + p.length <= e.length; i++) if (p.every((l, k) => e[i + k] === l)) return true;
      return false;
    });
  }

  // The task's starter comment lines (spaces at the ends left out), when its starter is only comments ("# Write your
  // program here"), as app.js hasCommentStarter. [] for any other task.
  function starterCommentLines(task) {
    const s = (task && task.starter) || "";
    const own = s.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
    return own.length && own.every((l) => l.startsWith("#")) ? own : [];
  }

  // Whether the editor held nothing but (some of) the starter comment: rest is the editor's text that stays when the
  // paste goes in (the text before and after the selection the paste replaces), just before the paste.
  function isWholeProgram(rest, task) {
    const left = String(rest == null ? "" : rest).split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
    if (!left.length) return true;
    const starter = starterCommentLines(task);
    return starter.length > 0 && left.every((l) => starter.includes(l));
  }

  // Why this paste into this task's editor is flagged: "whole-program", "long", or null (not flagged).
  // rest: the editor's text that stays (isWholeProgram); left out, only the long rule is used.
  function reason(text, task, rest) {
    if (!task || !EDITOR_TYPES.includes(task.type)) return null;
    const n = lineCount(text);
    if (!n || isExpectedOutput(text, task)) return null;
    if (n >= WHOLE_MIN_LINES && rest !== undefined && isWholeProgram(rest, task)) return "whole-program";
    return n > MAX_LINES ? "long" : null;
  }
  const flags = (text, task, rest) => reason(text, task, rest) !== null;

  // What the student is told. In homework the task is replaced with a new one. In an assignment the task stays, with a
  // Clear code button.
  const MESSAGE = "Your teacher has been told this code was pasted in. Try writing it yourself.";
  const HOMEWORK_MESSAGE = "Your teacher has been told. This task doesn't count towards your homework. Here is a new task.";
  const ASSIGNMENT_MESSAGE = "Your teacher has been told this code was pasted in. Clear the pasted code and write it yourself.";
  const CLEAR_LABEL = "Clear code";

  // What happens to a flagged task, by where the student is (phase: practice, endless, placement or assignment) and
  // whether the task is in an open homework. The task is never run against the tests.
  //   - practice and endless: the Skip button exactly (skip: app.js skipTask, the same code), so it counts as a failed
  //     task (it can move the level down, as Skip does); a new task.
  //   - homework (practice or endless with an open homework): the same skip record and a new task, but the level is
  //     kept (keepLevel): no level change and no fail streak, and the record shows the same level before and after.
  //   - placement: the Skip button too (the question ends as not passed; it can lower the starting level); the next
  //     question comes, or practice when it was the last one.
  //   - assignment: a skip record (the Skip button records nothing in an assignment, which is a fixed list); the task is
  //     marked tried and stays, until the student clears the pasted code (clear) and writes it themselves.
  // Every skip record is kind skip, result skipped: never a pass, so it never counts for the secured score or homework.
  function outcome(phase, inHomework) {
    const assignment = phase === "assignment";
    return {
      record: { kind: "skip", result: "skipped" },
      skip: !assignment,
      keepLevel: !!inHomework && (phase === "practice" || phase === "endless"),
      clear: assignment,
      moveOn: !assignment,
      message: assignment ? ASSIGNMENT_MESSAGE : inHomework ? HOMEWORK_MESSAGE : MESSAGE,
    };
  }

  return { MAX_LINES, WHOLE_MIN_LINES, EDITOR_TYPES, lines, lineCount, isExpectedOutput, starterCommentLines, isWholeProgram, reason, flags,
    MESSAGE, HOMEWORK_MESSAGE, ASSIGNMENT_MESSAGE, CLEAR_LABEL, outcome };
});
