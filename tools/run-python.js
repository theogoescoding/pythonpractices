// Runs programs through harness.py with local Python (the same runner the browser loads into Pyodide).
// Used by tests/validate.js and tools/build-variants.js. Set PYTHON=path\to\python to choose the interpreter.
"use strict";
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

// A run is stopped after this long, like the app's RUN_TIMEOUT_MS (in the browser the worker is killed instead).
// The harness then reports a "Timeout" error, as recheck.py does.
const RUN_TIME_LIMIT_S = 5;

// jobs = [{ code, inputs }]. Returns one { output, error, inputsLeft } per job.
function runPython(jobs) {
  const driver = [
    "import sys, json, time",
    "sys.path.insert(0, " + JSON.stringify(ROOT) + ")",
    "from harness import run_code",
    "class Timeout(Exception): pass",
    "def run(code, inputs):",
    "    deadline = time.monotonic() + " + RUN_TIME_LIMIT_S,
    "    def tracer(frame, event, arg):",
    "        if time.monotonic() > deadline: raise Timeout()",
    "        return tracer",
    "    sys.settrace(tracer)",
    "    try: return run_code(code, inputs)",
    "    finally: sys.settrace(None)",
    "jobs = json.loads(sys.stdin.read())",
    "print(json.dumps([run(j['code'], j['inputs']) for j in jobs]))",
  ].join("\n");
  const py = process.env.PYTHON || "python";
  const res = spawnSync(py, ["-c", driver], {
    input: JSON.stringify(jobs),
    encoding: "utf8",
    timeout: 600000,
    maxBuffer: 64 * 1024 * 1024,
    env: Object.assign({}, process.env, { PYTHONIOENCODING: "utf-8" }),
  });
  if (res.error || res.status !== 0) {
    console.error("Could not run Python:", res.error || res.stderr);
    process.exit(2);
  }
  return JSON.parse(res.stdout);
}

module.exports = { runPython, ROOT };
