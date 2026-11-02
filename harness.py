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
