// "Needs review": misconception rules added after the trial started (rules-review.json), matched against the class's
// failed attempts from the last 30 days when a teacher opens the Misconceptions page. Nothing is stored: a rule added
// today covers this month's attempts straight away (that is the retroactive matching).
//
// A rule is a misconception in the same form as misconceptions.json's, with its rule in the same form as the bank
// tasks' buggy variants (tasks.json buggy_variants: { misconception, code, outputs }), on bank tasks:
//   { id ("rev-…"), name, description, added ("YYYY-MM-DD"), term, variants: [{ task, code, outputs }] }
// outputs: what the variant's code prints for each of the task's tests (tools/review-rules.js works them out, as
// tools/build-variants.js does for tasks.json). Matching is the app's own: Checker.matchMisconceptions compares a failed
// attempt's result on its failing test with each variant's stored result for that test. There is no second matcher.
//   - Only failed attempts that matched no existing misconception, on the rule's own bank tasks (a template variant has
//     other test values, so a bank task's stored outputs can't be compared with it).
//   - Never a WRONG_ERROR_KIND (or NO_ANSWER) attempt: Checker.matchMisconceptions refuses those categories, as
//     recheck.py does.
//   - Only the last 30 days: the server clears a stored attempt's code and output after 30 days (0004_retention), so an
//     older attempt can't be matched or shown. Local mode keeps its records, so the same window is applied here.
// A candidate (an attempt the server or this browser gives for matching):
//   { student_name, task_id, at, category, failed_test (1-based, or null), output, error_kind, code (null if not
//     stored), matched (it matched an existing misconception) }
// No DOM here: tests/features.js checks it; teacher.js uses it in both modes.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./checker.js"));
  else root.ReviewRules = factory(root.Checker);
})(typeof self !== "undefined" ? self : this, function (Checker) {
  const WINDOW_DAYS = 30;
  const DAY_MS = 86400000;
  const ID = /^rev-[a-z0-9]+(-[a-z0-9]+)*$/;

  // Whether a moment is in the last 30 days (a few minutes ahead of now still counts: a student's clock may be fast).
  function inWindow(at, now) {
    const t = Date.parse(at);
    const n = now == null ? Date.now() : now;
    return Number.isFinite(t) && t <= n + 10 * 60000 && n - t <= WINDOW_DAYS * DAY_MS;
  }

  // The bank task ids the rules use (what the server is asked for).
  const taskIds = (rules) => [...new Set((rules || []).flatMap((r) => (r.variants || []).map((v) => v.task)))].sort();

  // { taskId: [{ misconception (the rule's id), code, outputs }] }: the buggy-variant form Checker.matchMisconceptions reads.
  function variantsByTask(rules) {
    const out = {};
    for (const r of rules || []) for (const v of r.variants || []) (out[v.task] = out[v.task] || []).push({ misconception: r.id, code: v.code, outputs: v.outputs || [] });
    return out;
  }

  // This browser's records (local mode) as candidates: failed checks only.
  function candidatesFromRecords(data) {
    const name = (id) => ((data.students || {})[id] || { name: "(removed)" }).name;
    return (data.attempts || []).filter((a) => (a.kind || "attempt") === "attempt" && a.result === "fail").map((a) => ({
      student_name: name(a.studentId), task_id: a.taskId, at: a.at, category: a.category || "",
      failed_test: a.failedTest == null || a.failedTest === "" ? null : Number(a.failedTest),
      output: a.output == null ? "" : String(a.output), error_kind: a.errorKind || "", code: typeof a.code === "string" ? a.code : null,
      matched: (a.misconceptions || []).length > 0,
    }));
  }

  // The "Needs review" list: every candidate a rule matches, newest first:
  //   [{ rule_id, rule_name, task_id, student_name, at, category, code (or null) }].
  function matches(rules, candidates, now) {
    const byTask = variantsByTask(rules);
    const names = Object.fromEntries((rules || []).map((r) => [r.id, r.name]));
    const out = [];
    for (const c of candidates || []) {
      const variants = byTask[c.task_id];
      if (!variants || c.matched || !inWindow(c.at, now)) continue;
      const f = { category: c.category, failedTest: c.failed_test == null ? null : c.failed_test - 1, output: c.output || "", errorKind: c.error_kind || "" };
      for (const id of Checker.matchMisconceptions({ type: "write", buggy_variants: variants }, f)) {
        out.push({ rule_id: id, rule_name: names[id], task_id: c.task_id, student_name: c.student_name, at: c.at, category: c.category, code: typeof c.code === "string" && c.code !== "" ? c.code : null });
      }
    }
    return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.student_name.localeCompare(b.student_name));
  }

  // How many attempts on each task a rule matched (the Workshop table's "Needs review" column).
  function countsByTask(list) {
    const out = {};
    for (const m of list || []) out[m.task_id] = (out[m.task_id] || 0) + 1;
    return out;
  }

  // Problems with the rules file that need no running (tools/review-rules.js and tests/validate.js check the outputs too).
  // tasksById: the bank tasks; existingIds: misconceptions.json's ids.
  function rulesProblems(rules, tasksById, existingIds) {
    const p = [];
    if (!Array.isArray(rules)) return ["rules-review.json must be a list"];
    const ids = rules.map((r) => r && r.id);
    if (new Set(ids).size !== ids.length) p.push("two rules have the same id");
    for (const r of rules) {
      const at = (r && r.id) || JSON.stringify(r).slice(0, 40);
      if (!ID.test(r.id || "")) p.push(at + ": the id starts with rev- (lower case, digits and dashes)");
      if ((existingIds || []).includes(r.id)) p.push(at + ": the id is already in misconceptions.json");
      if (!r.name || !String(r.name).trim()) p.push(at + ": needs a name");
      if (!r.description || !String(r.description).trim()) p.push(at + ": needs a description");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.added || "")) p.push(at + ": needs the date it was added (YYYY-MM-DD)");
      if (!r.term || !String(r.term).trim()) p.push(at + ": needs the term its examples came from");
      const vs = Array.isArray(r.variants) ? r.variants : [];
      const tasks = new Set(vs.map((v) => v.task));
      if (vs.length < 3 || tasks.size < 3) p.push(at + ": needs at least 3 examples, on at least 3 bank tasks (as misconceptions.json's do)");
      for (const v of vs) {
        const t = tasksById[v.task];
        if (!t) p.push(at + ": " + v.task + " isn't a bank task");
        else if ((t.tags || []).includes("placement")) p.push(at + ": " + v.task + " is a placement task (they have no buggy variants)");
        else if (t.type === "trace") p.push(at + ": " + v.task + " is a trace table task (its tables, not its output, are matched): not supported here");
        if (typeof v.code !== "string" || !v.code.trim()) p.push(at + ": an example on " + v.task + " has no code");
      }
    }
    return p;
  }

  return { WINDOW_DAYS, DAY_MS, ID, inWindow, taskIds, variantsByTask, candidatesFromRecords, matches, countsByTask, rulesProblems };
});
