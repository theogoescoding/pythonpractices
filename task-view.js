// What a student sees of a task's tests: the "Expected output" box with one example test (nothing about the hidden
// tests), and after Check the results, with the details of each failed test (testResultsHtml). Also the task search used by the teacher's Task browser. Shared by practice.html and teacher.html,
// so both always show the same text, and that text is exactly what the checker compares (Checker.normalise).
// No DOM here, so tests/features.js can check it. Works in the browser (window.TaskView) and in Node.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./checker.js"));
  else root.TaskView = factory(root.Checker);
})(typeof self !== "undefined" ? self : this, function (Checker) {

  const NO_OUTPUT = "No output – the program should not print anything.";
  const EXAMPLE_TESTS = 1; // tests shown to the student; the rest are hidden
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // The example test: the first one, also used by the Run button.
  const exampleTest = (t) => (t.tests && t.tests[0]) || { inputs: [], expected: "" };
  // The printed output the checker expects for a test (trailing spaces and trailing blank lines ignored).
  const expectedOutput = (test) => Checker.normalise(test.expected);
  const hiddenTestCount = (t) => Math.max(0, (t.tests || []).length - EXAMPLE_TESTS);
  const isHidden = (index) => index >= EXAMPLE_TESTS;
  // Predict and trace tasks ask the student to work out the output, so the box would give the answer away.
  const showsExpectedOutput = (t) => t.type !== "predict" && t.type !== "trace";
  const inputsText = (inputs) => inputs.map((v) => (v === "" ? "(nothing – just Enter)" : v)).join(", then ");

  // The "Expected output" box: the example test's input and the exact output, and how many tests are hidden.
  function expectedBoxHtml(t) {
    const test = exampleTest(t);
    const out = expectedOutput(test);
    const hidden = hiddenTestCount(t);
    return '<section class="expected-box" aria-labelledby="expected-h">' +
      '<h3 id="expected-h">Expected output</h3>' +
      (test.inputs.length
        ? '<p class="small">Example test. When the user types ' + test.inputs.map((v) => "<kbd>" + esc(v === "" ? "Enter" : v) + "</kbd>").join(" then ") + ", the program should print:</p>"
        : '<p class="small">Example test. With no input, the program should print:</p>') +
      (out === "" ? '<p class="expected-none">' + esc(NO_OUTPUT) + "</p>" : '<pre class="output expected-output">' + esc(out) + "</pre>") +
      (hidden ? '<p class="small">Your program is also checked with ' + hidden + " hidden test" + (hidden === 1 ? "" : "s") + ", with other inputs.</p>" : "") +
      "</section>";
  }

  // ---------- Test results after Check (app.js renderResults) ----------
  // Practice, placement, endless and assignment tasks all show this. A passed test is one line and nothing more, so
  // the full set of tests stays hidden. A failed test, the example or a hidden one, from the first check: its input,
  // the expected output and the student's output, each on its own line. Everything comes from the check's own run
  // (results), never a second run. The inputs are the task's own (a template variant's are its drawn values, and a
  // program using random is seeded from them, harness.py), so they are exactly what the program was given.
  const inputsLine = (inputs) => (inputs.length ? inputs.map((v) => (v === "" ? "(nothing – just Enter)" : v)).join(", then ") : "(no input)");
  function showOutput(text) {
    const n = Checker.normalise(text);
    return n === "" ? '<span class="nothing">(no output)</span>' : esc(n);
  }
  const errorBoxHtml = (err) => (err ? '<div class="error-box"><strong>' + esc(err.title) + "</strong><p>" + esc(err.detail) + "</p></div>" : "");
  // The error as the last line of the output: Python's own error line, or what stopped the program.
  const STOPPED = {
    Timeout: "Stopped: it ran for too long.",
    TooMuchOutput: "Stopped: it printed far too much.",
    NoMoreInput: "Stopped: it asked for more input than this test gives.",
    InternalError: "Stopped: something went wrong while running it.",
  };
  const errorText = (e) => STOPPED[e.type] || (e.type + (e.message ? ": " + e.message : "") + (e.line ? " (line " + e.line + ")" : ""));
  function yourOutputHtml(r) {
    if (r.notRun) return '<p class="not-run">Not run: an earlier test was stopped, so this one didn\'t run.</p>';
    if (!r.error) return "<pre>" + showOutput(r.output) + "</pre>";
    const out = Checker.normalise(r.output);
    return "<pre>" + (out ? esc(out) + "\n" : "") + '<span class="error-line">' + esc(errorText(r.error)) + "</span></pre>";
  }

  // t: the task as checked; results: one { output, error, inputsLeft, notRun } per test; passes: one boolean per test.
  function testResultsHtml(t, results, passes) {
    let html = '<ul class="test-results">';
    results.forEach((r, i) => {
      const test = t.tests[i];
      const label = isHidden(i) ? "Hidden test " + (i + 1 - EXAMPLE_TESTS) : "Example test";
      if (passes[i]) {
        html += '<li class="pass"><span class="mark" aria-hidden="true">✓</span> <strong>' + label + " passed</strong>" +
          (isHidden(i) ? "" : ' <span class="inputs">' + esc(test.inputs.length ? "Input: " + inputsLine(test.inputs) : "No input") + "</span>") + "</li>";
        return;
      }
      html += '<li class="fail"><span class="mark" aria-hidden="true">✗</span> <strong>' + label + (r.notRun ? " not run" : " didn't pass") + "</strong>" +
        '<dl class="io-lines">' +
        "<dt>Input</dt><dd>" + esc(inputsLine(test.inputs)) + "</dd>" +
        "<dt>Expected</dt><dd><pre>" + showOutput(test.expected) + "</pre></dd>" +
        "<dt>Your output</dt><dd>" + yourOutputHtml(r) + "</dd></dl>";
      if (r.error) html += errorBoxHtml(Checker.explainError(r.error));
      else if (!r.notRun) {
        let tip = Checker.mismatchHint(r.output, test.expected);
        if (r.inputsLeft > 0) tip += " (Your program didn't use all of the inputs.)";
        html += '<p class="tip">' + esc(tip) + "</p>";
      }
      html += "</li>";
    });
    return html + "</ul>";
  }

  // ---------- Task browser search (teacher view) ----------
  // Finds bank tasks by id (any case, also an old id in former_ids, or a template variant id like d-var-L9d#123,
  // which finds the task it was made from, or an id with a number on the end, like var-l9d-2) or by words in the
  // title. Exact id matches come first.
  function searchTasks(tasks, query, limit) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return [];
    const base = q.replace(/#.*$/, "").replace(/^d-/, "");
    const trimmed = base.replace(/-\d+$/, ""); // "var-l9d-2" also finds var-L9d
    const scored = [];
    for (const t of tasks) {
      const id = t.id.toLowerCase();
      const old = (t.former_ids || []).map((x) => x.toLowerCase());
      const title = String(t.title || "").toLowerCase();
      let score = 0;
      if (id === q || id === base) score = 100;
      else if (old.includes(q) || old.includes(base)) score = 90;
      else if (id.startsWith(base)) score = 70;
      else if (trimmed !== base && id === trimmed) score = 65;
      else if (id.includes(base)) score = 50;
      else if (title === q) score = 60;
      else if (q.split(/\s+/).every((w) => title.includes(w))) score = 40;
      if (score) scored.push({ task: t, score });
    }
    scored.sort((a, b) => b.score - a.score || a.task.id.localeCompare(b.task.id, "en", { numeric: true }));
    return scored.slice(0, limit || 25).map((s) => s.task);
  }

  return { NO_OUTPUT, EXAMPLE_TESTS, exampleTest, expectedOutput, hiddenTestCount, isHidden, showsExpectedOutput, inputsText,
    expectedBoxHtml, searchTasks, esc, showOutput, errorBoxHtml, errorText, testResultsHtml };
});
