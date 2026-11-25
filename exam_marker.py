# Exam Mode marker (reference version written while planning prompt EM1; integrated in EM1: _prepare and
# _runs_with_int_fallback split out of mark_answer unchanged, check_step for rung 4 and run_tests for the gate added).
# Marks a student's Python answer against one question from exam-mode.json, one mark point at a time.
# Runs in local Python next to harness.py (import harness) and is meant to run in Pyodide too (worker.js loads it
# after harness.py). It already agrees with all 17 approved test answers in exam-mode.json; prompt EM1 asks
# Claude Code to integrate it, keep the rules generic and keep that agreement.
#
# mark_answer_json(code, question_json) -> JSON string:
#   {"points":[{"id","awarded":1|0|None,"status":"auto"|"unsure","reason","feedback"}],"total","max","notes":[...]}

import ast
import json
import re

try:
    import harness  # local Python (tests); in Pyodide harness.py is already loaded into the same namespace
    _run_limited = harness.run_code_limited
except ImportError:  # pragma: no cover
    _run_limited = globals().get("run_code_limited")

MAX_LINES = 2000
_NUM = re.compile(r"-?\d+(?:\.\d+)?")

# Prepended in "int mode": input() hands back a number for numeric text, as if the student had cast it.
_INT_PRELUDE = (
    "_exam_input = input\n"
    "def input(prompt=''):\n"
    "    v = _exam_input(prompt)\n"
    "    try:\n"
    "        return int(v)\n"
    "    except ValueError:\n"
    "        try:\n"
    "            return float(v)\n"
    "        except ValueError:\n"
    "            return v\n"
)


# ---------- Repairs for small slips (penalised once) ----------

_BLOCK_START = re.compile(r"^(\s*)(if|elif|else|while|for|def)\b(.*?)\s*$")


def _repair_syntax(src):
    """Add a missing ':' and turn '=' into '==' in if/elif/while conditions. Returns (new_src, changed)."""
    out, changed = [], False
    for line in src.split("\n"):
        m = _BLOCK_START.match(line)
        if m and not line.rstrip().endswith(":") and not line.strip().startswith("#"):
            line = line.rstrip() + ":"
            changed = True
        m2 = re.match(r"^(\s*)(if|elif|while)\b(.*):\s*$", line)
        if m2:
            cond = m2.group(3)
            fixed = re.sub(r"(?<![=!<>])=(?!=)", "==", cond)
            if fixed != cond:
                line = m2.group(1) + m2.group(2) + fixed + ":"
                changed = True
        out.append(line)
    return "\n".join(out), changed


class _QuoteFixer(ast.NodeTransformer):
    def __init__(self, words, assigned):
        self.words, self.assigned, self.fixed = words, assigned, False

    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Load) and node.id in self.words and node.id not in self.assigned:
            self.fixed = True
            return ast.copy_location(ast.Constant(node.id), node)
        return node


def _assigned_names(tree):
    names = set()
    for n in ast.walk(tree):
        if isinstance(n, (ast.Assign, ast.AugAssign, ast.AnnAssign)):
            targets = n.targets if isinstance(n, ast.Assign) else [n.target]
            for t in targets:
                for x in ast.walk(t):
                    if isinstance(x, ast.Name):
                        names.add(x.id)
        elif isinstance(n, (ast.For,)):
            for x in ast.walk(n.target):
                if isinstance(x, ast.Name):
                    names.add(x.id)
        elif isinstance(n, (ast.FunctionDef,)):
            names.add(n.name)
            names.update(a.arg for a in n.args.args)
    return names


# ---------- Code facts ----------

def _is_input_call(n):
    return isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "input"


def _contains_input(node):
    return any(_is_input_call(x) for x in ast.walk(node))


def _input_vars(tree):
    names = []
    for n in ast.walk(tree):
        if isinstance(n, ast.Assign) and _contains_input(n.value):
            for t in n.targets:
                if isinstance(t, ast.Name):
                    names.append(t.id)
    return names


def _loops(tree):
    return [n for n in ast.walk(tree) if isinstance(n, (ast.While, ast.For))]


def _accumulated(stmts_root):
    """Names updated from themselves (x = x + ..., x += ...) anywhere under stmts_root."""
    names = set()
    for n in ast.walk(stmts_root):
        if isinstance(n, ast.AugAssign) and isinstance(n.target, ast.Name):
            names.add(n.target.id)
        elif isinstance(n, ast.Assign) and len(n.targets) == 1 and isinstance(n.targets[0], ast.Name):
            t = n.targets[0].id
            if isinstance(n.value, ast.BinOp) and any(isinstance(x, ast.Name) and x.id == t for x in ast.walk(n.value)):
                names.add(t)
    return names


def _reset_in(loop, name):
    for n in ast.walk(loop):
        if isinstance(n, ast.Assign) and isinstance(n.value, ast.Constant) and \
                any(isinstance(t, ast.Name) and t.id == name for t in n.targets):
            return True
    return False


def _print_after_loop(tree):
    """A top-level print(...) that uses a variable, placed after the last top-level loop."""
    body = tree.body
    last_loop = max((i for i, s in enumerate(body) if isinstance(s, (ast.While, ast.For))), default=None)
    if last_loop is None:
        return False
    for s in body[last_loop + 1:]:
        for n in ast.walk(s):
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "print" and \
                    any(isinstance(x, ast.Name) for a in n.args for x in ast.walk(a)):
                return True
    return False


# ---------- Rules ----------

def _numbers(text):
    out = []
    for x in _NUM.findall(text or ""):
        try:
            out.append(float(x))
        except ValueError:
            pass
    return out


def _rule(rule, chk, ctx):
    tree = ctx["tree"]
    runs = ctx["runs"]
    tests = chk.get("tests", [])
    if rule == "input_stored":
        names = _input_vars(tree)
        n = len(set(names)) if chk.get("distinctVars") else len(names)
        return n >= chk.get("min", 1)
    if rule == "accumulates":
        return bool(_accumulated(tree))
    if rule == "accumulates_in_loop":
        good = set()
        for loop in _loops(tree):
            for name in _accumulated(loop):
                if chk.get("noResetInLoop") and _reset_in(loop, name):
                    continue
                good.add(name)
        return len(good) >= chk.get("atLeast", 1)
    if rule == "if_tests_input_var":
        ivars = set(_input_vars(tree))
        for n in ast.walk(tree):
            if isinstance(n, ast.If):
                for c in ast.walk(n.test):
                    if isinstance(c, ast.Compare) and any(isinstance(x, ast.Name) and x.id in ivars for x in ast.walk(c)):
                        return True
        return False
    if rule == "loop_contains_input_and_work":
        for loop in _loops(tree):
            if _contains_input(loop) and len(loop.body) >= 2:
                return True
        return False
    if rule == "finishes_on_stop":
        for t in tests:
            r, spare = runs[t]
            if r["error"] or r["inputsLeft"] > spare:
                return False
            if chk.get("spareUnused") and r["inputsLeft"] != spare:
                return False
        return True
    if rule == "spare_unused":
        return all(runs[t][0]["inputsLeft"] == runs[t][1] for t in tests)
    if rule == "prints_number":
        return all(float(chk["value"]) in _numbers(runs[t][0]["output"]) for t in tests)
    if rule == "prints_expected_once_after_loop":
        if not _print_after_loop(tree):
            return False
        if ctx.get("structure_only"):
            return True
        for t in tests:
            nums = _numbers(runs[t][0]["output"])
            for e in ctx["test_by_id"][t].get("expectNumbers", []):
                if nums.count(float(e)) != 1:
                    return False
        return True
    raise ValueError("unknown rule " + rule)


# ---------- Marking ----------

def _run_all(src, question):
    runs = {}
    for t in question["tests"]:
        r = _run_limited(src, list(t["inputs"]) + list(t.get("spare", [])), MAX_LINES)
        runs[t["id"]] = (r, len(t.get("spare", [])))
    return runs


def _prepare(code, question):
    """Parse (repairing small syntax slips once) and fix missing quotes. Returns (src, tree, notes); tree None = no parse."""
    notes = []
    src = code
    # 1. Parse, repairing small syntax slips once.
    try:
        tree = ast.parse(src)
    except SyntaxError:
        repaired, changed = _repair_syntax(src)
        try:
            tree = ast.parse(repaired)
            src = repaired
            notes.append("syntax-fixed")
        except SyntaxError:
            return src, None, ["does-not-parse"]

    # 2. Missing quotes round an expected word (NameError on yes/stop): treat it as text, penalise once.
    words = set(question.get("expectedWords", []))
    if words:
        fixer = _QuoteFixer(words, _assigned_names(tree))
        new_tree = fixer.visit(tree)
        if fixer.fixed:
            tree = ast.fix_missing_locations(new_tree)
            src = ast.unparse(tree)
            notes.append("quotes-fixed")
    return src, tree, notes


def _runs_with_int_fallback(src, question, notes):
    # 3. Run every test; if missing int() is what breaks it, rerun as if input() were cast (no penalty).
    runs = _run_all(src, question)
    if any(r[0]["error"] and r[0]["error"]["type"] in ("TypeError", "Timeout") for r in runs.values()):
        int_runs = _run_all(_INT_PRELUDE + src, question)
        if sum(1 for r in int_runs.values() if r[0]["error"]) < sum(1 for r in runs.values() if r[0]["error"]):
            runs = int_runs
            notes.append("int")
    return runs


def mark_answer(code, question):
    src, tree, notes = _prepare(code, question)
    if tree is None:
        points = [{"id": m["id"], "awarded": None, "status": "unsure", "reason": "does-not-parse",
                   "feedback": m["feedback"]} for m in question["markPoints"]]
        return {"points": points, "total": 0, "max": question["marks"], "notes": ["does-not-parse"]}

    runs = _runs_with_int_fallback(src, question, notes)

    ctx = {"tree": tree, "runs": runs, "test_by_id": {t["id"]: t for t in question["tests"]}}
    results = {}
    points = []
    for m in question["markPoints"]:
        chk = m["check"]
        dep = m.get("dependsOn")
        if dep and results.get(dep) == 0:
            ok, reason = False, "depends-on-" + dep
        else:
            ft = [p for p in m.get("followThroughOn", []) if results.get(p) == 0]
            ctx["structure_only"] = bool(ft)
            ok = _rule(chk["rule"], chk, ctx)
            reason = chk["rule"] + ("-follow-through" if ft else "")
        results[m["id"]] = 1 if ok else 0
        points.append({"id": m["id"], "awarded": results[m["id"]], "status": "auto", "reason": reason,
                       "feedback": m["feedback"]})

    # 4. Penalise a repaired slip once, on the question's chosen mark point.
    if ("quotes-fixed" in notes or "syntax-fixed" in notes) and question.get("penaliseOnceOn"):
        for p in points:
            if p["id"] == question["penaliseOnceOn"] and p["awarded"] == 1:
                p["awarded"] = 0
                p["reason"] = "penalised-once"
                break
    total = sum(p["awarded"] or 0 for p in points)
    return {"points": points, "total": total, "max": question["marks"], "notes": notes}


def mark_answer_json(code, question_json):
    return json.dumps(mark_answer(code, json.loads(question_json)))


# ---------- Rung 4: one step at a time (added in EM1) ----------
# A step has one check (the same rules as the mark points). The same repairs are made (missing int(), quotes, a small
# syntax slip), but nothing is penalised: rung 4 is practice with Run allowed. Returns {"passed", "reason", "notes"};
# passed None = the code doesn't parse, so the step can't be checked.

def check_step(code, question, check):
    src, tree, notes = _prepare(code, question)
    if tree is None:
        return {"passed": None, "reason": "does-not-parse", "notes": notes}
    runs = _runs_with_int_fallback(src, question, notes) if check.get("tests") else {}
    ctx = {"tree": tree, "runs": runs, "test_by_id": {t["id"]: t for t in question["tests"]}, "structure_only": False}
    ok = _rule(check["rule"], check, ctx)
    return {"passed": bool(ok), "reason": check["rule"], "notes": notes}


def check_step_json(code, question_json, check_json):
    return json.dumps(check_step(code, json.loads(question_json), json.loads(check_json)))


def run_tests(code, question, test_ids):
    """Each named test run once (inputs then spare inputs), as the marker runs them. For tests/exam-mode.js."""
    by_id = {t["id"]: t for t in question["tests"]}
    return {i: _run_limited(code, list(by_id[i]["inputs"]) + list(by_id[i].get("spare", [])), MAX_LINES) for i in test_ids}
