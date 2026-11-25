// Web Worker that runs student Python with Pyodide.
// The main page terminates this worker if a run takes too long
// (e.g. an infinite loop), then starts a fresh one.

const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";

let runCodeJson = null;
let runCodeLimitedJson = null;
let traceCodeJson = null;
let markAnswerJson = null; // Exam Mode (exam_marker.py), loaded after harness.py: it uses harness's run_code_limited
let checkStepJson = null;

async function init() {
  importScripts(PYODIDE_URL + "pyodide.js");
  const pyodide = await loadPyodide({ indexURL: PYODIDE_URL });
  const response = await fetch("harness.py");
  if (!response.ok) throw new Error("Could not load harness.py");
  pyodide.runPython(await response.text());
  runCodeJson = pyodide.globals.get("run_code_json");
  runCodeLimitedJson = pyodide.globals.get("run_code_limited_json");
  traceCodeJson = pyodide.globals.get("trace_code_json");
  // Exam Mode's marker. If it can't be loaded, the rest of the site still runs code as before; only marking fails.
  try {
    const marker = await fetch("exam_marker.py");
    if (marker.ok) {
      pyodide.runPython(await marker.text());
      markAnswerJson = pyodide.globals.get("mark_answer_json");
      checkStepJson = pyodide.globals.get("check_step_json");
    }
  } catch (e) { /* marking unavailable */ }
}

const ready = init().then(
  () => { postMessage({ type: "ready" }); return true; },
  (err) => { postMessage({ type: "load-error", message: String(err) }); return false; }
);

// Message in:  { type: "run", id, code, tests: [ [input, input, ...], ... ], maxLines?, trace? }
//   maxLines: stop after this many lines have run (the app's own runs of template variants, not students' code)
//   trace: also record the steps for a trace table (the app's own runs of trace-task template variants)
// Messages out: { type: "progress", id, index, result } once per test,
//               then { type: "done", id }
// Exam Mode (exam.js): { type: "mark", id, code, question (JSON text), check? (JSON text) } →
//   { type: "marked", id, result }: without check, exam_marker.mark_answer_json (the whole question, point by point);
//   with check (one rung 4 step), check_step_json. The page stops it after 5 seconds, as a run.
async function mark(msg) {
  let result;
  try {
    if (!markAnswerJson) throw new Error("exam_marker.py isn't loaded");
    result = JSON.parse(msg.check ? checkStepJson(msg.code, msg.question, msg.check) : markAnswerJson(msg.code, msg.question));
  } catch (err) {
    result = { error: "marker", message: String(err) };
  }
  postMessage({ type: "marked", id: msg.id, result });
}

self.onmessage = async (event) => {
  const msg = event.data;
  if (msg && msg.type === "mark") { if (await ready) mark(msg); return; }
  if (!msg || msg.type !== "run") return;
  if (!(await ready)) return;
  for (let i = 0; i < msg.tests.length; i++) {
    let result;
    try {
      const inputs = JSON.stringify(msg.tests[i]);
      result = JSON.parse(msg.trace ? traceCodeJson(msg.code, inputs, msg.maxLines || 100000)
        : msg.maxLines ? runCodeLimitedJson(msg.code, inputs, msg.maxLines) : runCodeJson(msg.code, inputs));
    } catch (err) {
      result = { output: "", error: { type: "InternalError", message: "", line: null }, inputsLeft: 0 };
    }
    postMessage({ type: "progress", id: msg.id, index: i, result });
  }
  postMessage({ type: "done", id: msg.id });
};
