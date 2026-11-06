// Teacher view: the Task browser. Finds a bank task by id or title and shows it as students see it, with its
// starter code, the "Expected output" box (the same one students get, from task-view.js), every test (teacher only)
// and the model solution behind a Show / Hide button.
// Loaded by teacher.html only: no student page includes this file, so a model solution is never shown to a student.
// Everything is read from tasks.json, the same data the practice page uses, so the browser always matches it.
// viewModel() has no DOM, so tests/features.js checks it in Node.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./task-view.js"));
  else root.TaskBrowser = factory(root.TaskView);
})(typeof self !== "undefined" ? self : this, function (TaskView) {
  const esc = TaskView.esc;
  const TYPE_NAMES = { predict: "Predict the output", fill: "Fill in the blanks", parsons: "Parsons puzzle", write: "Write code", scratch: "Write from scratch" };

  // Everything the browser shows for a task. initialDraft is app.js's (the Parsons lines in the order students get).
  function viewModel(t, initialDraft) {
    const draft = initialDraft ? initialDraft(t) : null;
    return {
      id: t.id, title: t.title, unit: t.unit, level: t.level, type: t.type, typeName: TYPE_NAMES[t.type] || t.type,
      placement: (t.tags || []).includes("placement"), formerIds: t.former_ids || [],
      description: t.description, starter: t.starter || "",
      parsonsLines: t.type === "parsons" && draft ? draft.available.map((l) => l.text) : null,
      options: t.type === "predict" ? t.options.slice() : null,
      studentsSeeExpectedBox: TaskView.showsExpectedOutput(t),
      expectedOutput: TaskView.expectedOutput(TaskView.exampleTest(t)), // the example test, exactly as the checker compares it
      tests: t.tests.map((test, i) => ({ number: i + 1, inputs: test.inputs.slice(), expected: TaskView.expectedOutput(test), hidden: TaskView.isHidden(i) })),
      hints: t.hints.slice(),
      solution: t.solution,
      answers: t.answers ? t.answers.slice() : null,
      correctOption: t.type === "predict" ? t.answer : null,
    };
  }

  const pre = (text, cls) => (text === "" ? '<p class="expected-none">' + esc(TaskView.NO_OUTPUT) + "</p>" : '<pre class="' + (cls || "code") + '">' + esc(text) + "</pre>");
  const inputs = (list) => (list.length ? list.map((v) => "<kbd>" + esc(v === "" ? "Enter" : v) + "</kbd>").join(" then ") : '<span class="small">no input</span>');

  // The task as HTML for the teacher view. The model solution starts hidden.
  function html(t, initialDraft, unitTitle) {
    const v = viewModel(t, initialDraft);
    let student = "";
    if (v.type === "fill") student = '<p class="small">Starter code (students type in each ____ blank):</p>' + pre(v.starter);
    else if (v.type === "parsons") student = '<p class="small">Lines students get, without indentation and shuffled (each student gets their own order). One or two are not needed:</p><ul class="tb-lines">' +
      v.parsonsLines.map((l) => "<li><code>" + esc(l) + "</code></li>").join("") + "</ul>";
    else if (v.type === "predict") student = '<p class="small">Program students read:</p>' + pre(v.solution) +
      (t.tests[0].inputs.length ? '<p class="small">The user types: ' + inputs(t.tests[0].inputs) + "</p>" : "") +
      '<p class="small">Options:</p><ol class="tb-options">' + v.options.map((o, i) => "<li>" + pre(o, "output") + (i === v.correctOption ? ' <span class="flag">correct</span>' : "") + "</li>").join("") + "</ol>";
    else student = '<p class="small">Starter code in the editor:</p>' + (v.starter ? pre(v.starter) : '<p class="small">(empty)</p>');
    return '<article class="tb-task" aria-labelledby="tb-task-h">' +
      '<h3 id="tb-task-h" tabindex="-1">' + esc(v.id) + " – " + esc(v.title) + "</h3>" +
      '<p class="meta"><span class="cat-tag">' + esc(unitTitle ? unitTitle(v.unit) : v.unit) + "</span> Level " + v.level + " · " + esc(v.typeName) +
        (v.placement ? ' · <span class="flag">placement</span>' : "") + (v.formerIds.length ? " · old id: " + esc(v.formerIds.join(", ")) : "") + "</p>" +
      "<h4>The question, as students see it</h4>" +
      '<p class="description">' + esc(v.description) + "</p>" + student +
      "<h4>Expected output</h4>" +
      (v.studentsSeeExpectedBox ? TaskView.expectedBoxHtml(t)
        : '<p class="small">Students don\'t see this box on predict tasks: it is the answer.</p>' + pre(v.expectedOutput, "output expected-output")) +
      "<h4>Tests <span class=\"small\">(teacher only)</span></h4>" +
      '<div class="table-wrap"><table class="tb-tests"><thead><tr><th scope="col">Test</th><th scope="col">Shown to students?</th><th scope="col">Input</th><th scope="col">Expected output</th></tr></thead><tbody>' +
      v.tests.map((x) => '<tr><td class="num">' + x.number + "</td><td>" + (x.hidden ? "Hidden" : "Yes, the example test") + "</td><td>" + inputs(x.inputs) + "</td><td>" + pre(x.expected, "output") + "</td></tr>").join("") +
      "</tbody></table></div>" +
      "<h4>Hints</h4><ol>" + v.hints.map((h) => "<li>" + esc(h) + "</li>").join("") + "</ol>" +
      '<h4>Model solution <span class="small">(teacher only)</span></h4>' +
      '<p><button type="button" id="tb-solution-btn" class="secondary" aria-expanded="false" aria-controls="tb-solution">Show model solution</button></p>' +
      '<div id="tb-solution" hidden>' + pre(v.solution) +
        (v.answers ? '<p class="small">Blanks: ' + v.answers.map((a) => "<code>" + esc(a) + "</code>").join(", ") + "</p>" : "") + "</div>" +
      "</article>";
  }

  // Wires the Show / Hide button inside a container that html() was put into.
  function wire(container) {
    const btn = container.querySelector("#tb-solution-btn");
    const box = container.querySelector("#tb-solution");
    if (!btn || !box) return;
    btn.addEventListener("click", () => {
      box.hidden = !box.hidden;
      btn.textContent = box.hidden ? "Show model solution" : "Hide model solution";
      btn.setAttribute("aria-expanded", String(!box.hidden));
    });
  }

  return { viewModel, html, wire };
});
