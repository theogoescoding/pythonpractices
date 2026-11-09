# Runs a student's program and captures what it prints.
# Used in two places, so the behaviour is identical in both:
#   - worker.js loads it into Pyodide in the browser
#   - tests/validate.js runs it with local Python to check the task bank
#
# Each run starts in its own empty temporary folder (see run_code), and random is seeded from the first input.
# input() is replaced by a version that hands out the test's inputs in order.
# Prompts passed to input() are NOT written to the output, so expected
# outputs in tasks.json only contain what the program print()s.

import builtins
import io
import json
import os
import random as _random
import shutil
import sys
import tempfile

MAX_OUTPUT_CHARS = 20000
USER_FILENAME = "<your code>"


# ---------- Random numbers ----------
# A program that uses random must print the same thing each time it is checked, or its output couldn't be compared
# with the expected output. So before every run, the random module's functions are pointed at a generator seeded from
# the test's first input: the same test always gives the same "random" numbers, and tests with different first
# inputs give different ones. Run uses the example test's inputs, so it shows what the example test expects.
# The generator is mulberry32, which templates.js also has (HELPERS.pyRandom), so a template can work out what a
# program using random.randint or random.choice prints. Students never see or write a seed.
_M32 = 0xFFFFFFFF
_RANDOM_NAMES = ("seed", "random", "randint", "randrange", "choice", "choices", "shuffle", "sample", "uniform", "getrandbits")


def random_seed_for(inputs):
    """FNV-1a (32-bit) of the first input's characters ("" when there are no inputs)."""
    h = 2166136261
    for ch in (str(inputs[0]) if inputs else ""):
        h = ((h ^ ord(ch)) * 16777619) & _M32
    return h


class _CheckRandom(_random.Random):
    def seed(self, a=None, version=2):
        self._state = a & _M32 if isinstance(a, int) else random_seed_for([str(a)])

    def _next(self):
        a = self._state = (self._state + 0x6D2B79F5) & _M32
        t = ((a ^ (a >> 15)) * (1 | a)) & _M32
        t = ((t + (((t ^ (t >> 7)) * (61 | t)) & _M32)) & _M32) ^ t
        return ((t ^ (t >> 14)) & _M32) / 4294967296

    def random(self):
        return self._next()

    # randint, randrange, choice, shuffle and sample all use this.
    def _randbelow(self, n):
        return int(self._next() * n)

    def getrandbits(self, k):
        n = 0
        for i in range(0, k, 32):
            n |= int(self._next() * 4294967296) << i
        return n & ((1 << k) - 1)


def _use_check_random(inputs):
    inst = _CheckRandom(random_seed_for(inputs))
    for name in _RANDOM_NAMES:
        setattr(_random, name, getattr(inst, name))


class _NoMoreInput(Exception):
    pass


class _TooMuchOutput(Exception):
    pass


class _Capture(io.StringIO):
    def write(self, s):
        if self.tell() + len(s) > MAX_OUTPUT_CHARS:
            raise _TooMuchOutput()
        return super().write(s)


def _user_line(tb):
    """Line number of the deepest traceback frame that is in the student's code."""
    line = None
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == USER_FILENAME:
            line = tb.tb_lineno
        tb = tb.tb_next
    return line


def run_code(src, inputs):
    out = _Capture()
    queue = [str(x) for x in inputs]

    def fake_input(prompt=""):
        if not queue:
            raise _NoMoreInput()
        return queue.pop(0)

    _use_check_random(queue)
    g = {"__name__": "__main__", "__builtins__": builtins, "input": fake_input}
    err = None
    real_stdout = sys.stdout
    # Files: each run starts in its own empty folder, deleted afterwards, so a program's files (File handling tasks
    # write a file, then read it back) never last into the next run and never land in the project folder.
    home = os.getcwd()
    work = tempfile.mkdtemp(prefix="run-")
    os.chdir(work)
    sys.stdout = out
    try:
        exec(compile(src, USER_FILENAME, "exec"), g)
    except SystemExit:
        pass
    except _NoMoreInput as e:
        err = {"type": "NoMoreInput", "message": "", "line": _user_line(e.__traceback__)}
    except _TooMuchOutput:
        err = {"type": "TooMuchOutput", "message": "", "line": None}
    except SyntaxError as e:  # also catches IndentationError and TabError
        err = {
            "type": type(e).__name__,
            "message": e.msg or "",
            "line": e.lineno,
            "text": (e.text or "").rstrip(),
        }
    except BaseException as e:
        err = {"type": type(e).__name__, "message": str(e), "line": _user_line(e.__traceback__)}
    finally:
        sys.stdout = real_stdout
        os.chdir(home)
        shutil.rmtree(work, ignore_errors=True)

    try:
        output = out.getvalue()
    except Exception:
        output = ""
    return {"output": output, "error": err, "inputsLeft": len(queue)}


def run_code_json(src, inputs_json):
    return json.dumps(run_code(src, json.loads(inputs_json)))


class _LineLimit(BaseException):
    pass


def run_code_limited(src, inputs, max_lines):
    """run_code, stopped after max_lines lines of the program have run (reported as a Timeout).
    Used for the app's own runs (template variants and their buggy variants), not for students' code:
    counting lines rather than seconds gives the same result in the browser and in local Python."""
    count = [0]

    def local(frame, event, arg):
        if event == "line":
            count[0] += 1
            if count[0] > max_lines:
                raise _LineLimit()
        return local

    def tracer(frame, event, arg):
        return local if frame.f_code.co_filename == USER_FILENAME else None

    sys.settrace(tracer)
    try:
        result = run_code(src, inputs)
    finally:
        sys.settrace(None)
    if result["error"] and result["error"]["type"] == "_LineLimit":
        result["error"] = {"type": "Timeout", "message": "", "line": None}
    return result


def run_code_limited_json(src, inputs_json, max_lines):
    return json.dumps(run_code_limited(src, json.loads(inputs_json), int(max_lines)))


# ---------- Trace tables ----------
# trace_code runs a program like run_code_limited and also records, after every line of the main program that
# runs, the value of each variable and what that line printed. Lines inside a function are not recorded on their
# own: a call counts as part of the line that made it. checker.js (traceTable) turns the steps into a trace table.
# Values are written as a trace table shows them: numbers and True/False as Python prints them, text without its
# quotes ("" for empty text), and a list as a list of those values (each position gets its own column).
MAX_TRACE_STEPS = 400


def _cell(v):
    if isinstance(v, bool):
        return str(v)
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, str):
        return v if v != "" else '""'
    return None


def _snapshot(names):
    out = {}
    for k, v in names.items():
        if k.startswith("__") or k == "input":
            continue
        if isinstance(v, list):
            cells = [_cell(x) for x in v]
            if all(c is not None for c in cells):
                out[k] = cells
            continue
        c = _cell(v)
        if c is not None:
            out[k] = c
    return out


def trace_code(src, inputs, max_lines=100000):
    steps = []
    state = {"line": None, "outpos": 0, "count": 0}

    def record(frame):
        if state["line"] is None:
            return
        try:
            text = sys.stdout.getvalue()
        except Exception:
            text = ""
        printed = text[state["outpos"]:]
        state["outpos"] = len(text)
        if len(steps) < MAX_TRACE_STEPS:
            steps.append({"line": state["line"], "vars": _snapshot(frame.f_globals), "out": printed})

    def module_local(frame, event, arg):
        if event == "line":
            state["count"] += 1
            if state["count"] > max_lines:
                raise _LineLimit()
            record(frame)
            state["line"] = frame.f_lineno
        elif event == "return":
            record(frame)
            state["line"] = None
        return module_local

    def other_local(frame, event, arg):
        if event == "line":
            state["count"] += 1
            if state["count"] > max_lines:
                raise _LineLimit()
        return other_local

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != USER_FILENAME:
            return None
        return module_local if frame.f_code.co_name == "<module>" else other_local

    sys.settrace(tracer)
    try:
        result = run_code(src, inputs)
    finally:
        sys.settrace(None)
    if result["error"] and result["error"]["type"] == "_LineLimit":
        result["error"] = {"type": "Timeout", "message": "", "line": None}
    result["steps"] = steps
    return result


def trace_code_json(src, inputs_json, max_lines):
    return json.dumps(trace_code(src, json.loads(inputs_json), int(max_lines)))
