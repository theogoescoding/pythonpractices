// Web Worker that runs student Python with Pyodide.
// The main page terminates this worker if a run takes too long
// (e.g. an infinite loop), then starts a fresh one.

const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";

let runCodeJson = null;

async function init() {
  importScripts(PYODIDE_URL + "pyodide.js");
  const pyodide = await loadPyodide({ indexURL: PYODIDE_URL });
  const response = await fetch("harness.py");
  if (!response.ok) throw new Error("Could not load harness.py");
  pyodide.runPython(await response.text());
  runCodeJson = pyodide.globals.get("run_code_json");
}

const ready = init().then(
  () => { postMessage({ type: "ready" }); return true; },
  (err) => { postMessage({ type: "load-error", message: String(err) }); return false; }
);

// Message in:  { type: "run", id, code, tests: [ [input, input, ...], ... ] }
// Messages out: { type: "progress", id, index, result } once per test,
//               then { type: "done", id }
self.onmessage = async (event) => {
  const msg = event.data;
  if (!msg || msg.type !== "run") return;
  if (!(await ready)) return;
  for (let i = 0; i < msg.tests.length; i++) {
    let result;
    try {
      result = JSON.parse(runCodeJson(msg.code, JSON.stringify(msg.tests[i])));
    } catch (err) {
      result = { output: "", error: { type: "InternalError", message: "", line: null }, inputsLeft: 0 };
    }
    postMessage({ type: "progress", id: msg.id, index: i, result });
  }
  postMessage({ type: "done", id: msg.id });
};
