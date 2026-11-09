// Web Worker that runs student Python with Pyodide.
// The main page terminates this worker if a run takes too long
// (e.g. an infinite loop), then starts a fresh one.

const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";

let runCodeJson = null;
let runCodeLimitedJson = null;
let traceCodeJson = null;

async function init() {
  importScripts(PYODIDE_URL + "pyodide.js");
  const pyodide = await loadPyodide({ indexURL: PYODIDE_URL });
  const response = await fetch("harness.py");
  if (!response.ok) throw new Error("Could not load harness.py");
  pyodide.runPython(await response.text());
  runCodeJson = pyodide.globals.get("run_code_json");
  runCodeLimitedJson = pyodide.globals.get("run_code_limited_json");
  traceCodeJson = pyodide.globals.get("trace_code_json");
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
self.onmessage = async (event) => {
  const msg = event.data;
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
