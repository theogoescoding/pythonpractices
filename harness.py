# Runs a student's program and captures what it prints.
# Used in two places, so the behaviour is identical in both:
#   - worker.js loads it into Pyodide in the browser
#   - tests/validate.js runs it with local Python to check the task bank
#
# input() is replaced by a version that hands out the test's inputs in order.
# Prompts passed to input() are NOT written to the output, so expected
# outputs in tasks.json only contain what the program print()s.

import builtins
import io
import json
import sys

MAX_OUTPUT_CHARS = 20000
USER_FILENAME = "<your code>"


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

    g = {"__name__": "__main__", "__builtins__": builtins, "input": fake_input}
    err = None
    real_stdout = sys.stdout
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
