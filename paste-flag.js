// The large paste flag (whole site): a single paste of more than 8 lines into the code editor of a write or
// write-from-scratch task is flagged as possible AI use. It never compares with earlier attempts.
// Pasting expected output is never flagged. Expected output is what the task's Expected output box shows (and what a
// failed test shows as "Expected"): a test's output as the checker compares it (Checker.normalise: trailing spaces and
// trailing blank lines ignored). A paste counts as expected output when its lines (blank lines at the start and end
// left out, spaces at each end of a line ignored) appear, in order and together, in one of the task's tests' expected
// output. That match is exact, so program code can't pass as output by accident; a paste that matches is never flagged.
// No DOM here: app.js calls it from the editor's paste, tests/features.js checks it.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./checker.js"));
  else root.PasteFlag = factory(root.Checker);
})(typeof self !== "undefined" ? self : this, function (Checker) {
  const MAX_LINES = 8;                    // more than this many lines in one paste is flagged
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

  // Whether this paste into this task's editor is flagged.
  const flags = (text, task) => !!task && EDITOR_TYPES.includes(task.type) && lineCount(text) > MAX_LINES && !isExpectedOutput(text, task);

  // What the student is told. In homework the task is replaced with a new one.
  const MESSAGE = "Your teacher has been told this code was pasted in. Try writing it yourself.";
  const HOMEWORK_MESSAGE = "Your teacher has been told. This task doesn't count towards your homework. Here is a new task.";

  return { MAX_LINES, EDITOR_TYPES, lines, lineCount, isExpectedOutput, flags, MESSAGE, HOMEWORK_MESSAGE };
});
