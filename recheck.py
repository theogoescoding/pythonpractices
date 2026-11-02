"""Re-runs misconception matching over the failed attempts in an exported full-data CSV.

Use it to try new or changed buggy variants against data you already have, without
running the trial again. It needs only Python 3 (no browser, no Pyodide).

    python recheck.py python-practice-full-data-2026-10-28.csv tasks.json
    python recheck.py export.csv my-tasks.json -o rechecked.csv --misconceptions misconceptions.json

For every failed attempt it compares what the student's program printed on the failing
test with what each of the task's buggy variants prints on that same test, exactly as
the app does (checker.js matchMisconceptions):

  * A variant's stored "outputs" in the tasks file are used, so the results are the
    same as the app's. Run `node tools/build-variants.js` to store outputs for new variants.
  * A variant with no stored outputs (for example one you have just added) is run here
    with harness.py, the same runner the app uses, on the failing test's inputs.

The output CSV has every row of the export. For failed attempts, misconception_matches
holds the new matches, previous_misconception_matches the ones the app recorded, and
matches_changed is "yes" where they differ.
"""

import argparse
import csv
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import run_code  # noqa: E402

SYNTAX_TYPES = ("SyntaxError", "IndentationError", "TabError")
TIMEOUT_TYPES = ("Timeout", "TooMuchOutput")
NO_MATCH_CATEGORIES = ("NO_ANSWER",)
RUN_TIME_LIMIT = 5.0  # seconds, the same as the app's RUN_TIMEOUT_MS


def normalise(text):
    """Same as checker.js normalise: trailing spaces on each line and trailing blank lines are ignored."""
    text = "" if text is None else str(text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return "\n".join(line.rstrip() for line in text.split("\n")).rstrip()


def error_kind(err):
    """Same as checker.js errorKind: keep the two the same."""
    if not err:
        return ""
    etype = err.get("type") or ""
    if etype in TIMEOUT_TYPES:
        return "Timeout"
    msg = err.get("message") or ""
    text = err.get("text") or ""
    if etype in SYNTAX_TYPES and (
        "Maybe you meant '=='" in msg
        or (re.match(r"^\s*(if|elif|while)\b", text) and re.search(r"[^=!<>]=[^=]", text))
    ):
        return "SyntaxError:assign-in-condition"
    if etype == "TypeError":
        if "can only concatenate" in msg:
            return "TypeError:concat"
        if "not supported between instances" in msg:
            return "TypeError:compare"
        if "unsupported operand" in msg:
            return "TypeError:operand"
    return etype or "Error"


def stored_result(result):
    """Same as tools/build-variants.js storedResult."""
    kind = error_kind(result.get("error"))
    return {"output": "" if kind == "Timeout" else normalise(result.get("output")), "errorKind": kind}


class Timeout(Exception):
    """Raised inside a variant that runs too long (the harness reports it as a Timeout error)."""


def run_with_time_limit(code, inputs):
    deadline = time.monotonic() + RUN_TIME_LIMIT

    def tracer(frame, event, arg):
        if time.monotonic() > deadline:
            raise Timeout()
        return tracer

    sys.settrace(tracer)
    try:
        return run_code(code, inputs)
    finally:
        sys.settrace(None)


def same_result(variant_out, output, kind):
    """Same as checker.js sameResult."""
    if (variant_out.get("errorKind") or "") != (kind or ""):
        return False
    if kind == "Timeout":
        return True
    return normalise(variant_out.get("output")) == normalise(output)


class Matcher:
    def __init__(self, tasks):
        # A task that was moved to another unit keeps its old ids in former_ids, so older exports still match.
        self.tasks = {old: t for t in tasks for old in t.get("former_ids", [])}
        self.tasks.update({t["id"]: t for t in tasks})
        self.cache = {}
        self.ran = 0

    def variant_result(self, task, vi, test_index, inputs):
        variant = task["buggy_variants"][vi]
        outputs = variant.get("outputs") or []
        if test_index < len(outputs) and outputs[test_index]:
            return outputs[test_index]
        key = (task["id"], vi, test_index)
        if key not in self.cache:
            if inputs is None:
                inputs = task["tests"][test_index]["inputs"] if test_index < len(task["tests"]) else []
            self.cache[key] = stored_result(run_with_time_limit(variant["code"], inputs))
            self.ran += 1
        return self.cache[key]

    def match(self, row):
        """Misconception ids for one failed-attempt row of the export (an empty list if none match)."""
        task = self.tasks.get(row.get("task_id", ""))
        if not task or not task.get("buggy_variants"):
            return []
        if row.get("failure_category") in NO_MATCH_CATEGORIES or not row.get("failed_test_number"):
            return []
        test_index = int(row["failed_test_number"]) - 1
        inputs = json.loads(row["failed_test_inputs"]) if row.get("failed_test_inputs") else None
        ids = []
        for vi, variant in enumerate(task["buggy_variants"]):
            out = self.variant_result(task, vi, test_index, inputs)
            if same_result(out, row.get("student_output", ""), row.get("student_error_kind", "")) and variant["misconception"] not in ids:
                ids.append(variant["misconception"])
        return ids


def recheck(rows, tasks):
    """Returns (new rows, summary). Each failed attempt gets updated misconception_matches."""
    matcher = Matcher(tasks)
    out = []
    summary = {"failed_attempts": 0, "changed": 0, "before": {}, "after": {}}
    for row in rows:
        row = dict(row)
        is_failed_attempt = row.get("record_type") == "attempt" and row.get("result") == "fail"
        previous = row.get("misconception_matches", "")
        row["previous_misconception_matches"] = previous if is_failed_attempt else ""
        row["matches_changed"] = ""
        if is_failed_attempt:
            new = ";".join(matcher.match(row))
            row["misconception_matches"] = new
            changed = set(filter(None, previous.split(";"))) != set(filter(None, new.split(";")))
            row["matches_changed"] = "yes" if changed else "no"
            summary["failed_attempts"] += 1
            summary["changed"] += changed
            for m in filter(None, previous.split(";")):
                summary["before"][m] = summary["before"].get(m, 0) + 1
            for m in filter(None, new.split(";")):
                summary["after"][m] = summary["after"].get(m, 0) + 1
        out.append(row)
    summary["variants_run"] = matcher.ran
    return out, summary


def main(argv=None):
    parser = argparse.ArgumentParser(description="Re-run buggy-variant matching over an exported full-data CSV.")
    parser.add_argument("export", help="full-data CSV from the teacher view (Export full data)")
    parser.add_argument("tasks", help="tasks file with buggy_variants, normally tasks.json")
    parser.add_argument("-o", "--output", help="CSV to write (default: <export>-rechecked.csv)")
    parser.add_argument("--misconceptions", help="misconceptions.json, to warn about unknown misconception ids")
    args = parser.parse_args(argv)

    with open(args.tasks, encoding="utf-8") as f:
        tasks = json.load(f)
    if args.misconceptions:
        with open(args.misconceptions, encoding="utf-8") as f:
            known = {m["id"] for m in json.load(f)}
        unknown = sorted({v["misconception"] for t in tasks for v in t.get("buggy_variants", [])} - known)
        if unknown:
            print("Warning: misconception ids not in " + args.misconceptions + ": " + ", ".join(unknown), file=sys.stderr)

    with open(args.export, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        columns = list(reader.fieldnames or [])
        rows = list(reader)

    new_rows, summary = recheck(rows, tasks)
    for extra in ("previous_misconception_matches", "matches_changed"):
        if extra not in columns:
            columns.append(extra)
    output = args.output or os.path.splitext(args.export)[0] + "-rechecked.csv"
    with open(output, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns, lineterminator="\r\n")
        writer.writeheader()
        writer.writerows(new_rows)

    print("Rechecked %d failed attempts: %d with changed matches (%d variant runs without stored outputs)."
          % (summary["failed_attempts"], summary["changed"], summary["variants_run"]))
    for m in sorted(set(summary["before"]) | set(summary["after"])):
        print("  %-26s %3d -> %3d" % (m, summary["before"].get(m, 0), summary["after"].get(m, 0)))
    print("Written to " + output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
