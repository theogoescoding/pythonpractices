// "Needs review" on the Misconceptions page (teacher-api review_candidates_for_class): the class's failed attempts from
// the last 30 days on the bank tasks the page asks about (the tasks the review rules use, rules-review.json). The page
// matches them itself (review-rules.js, with the app's own Checker.matchMisconceptions), so adding a rule only needs the
// website published: the rules never live on the server, and nothing is stored.
// A plain script, like class-sharing.js, so the Deno function and the Node tests (tests/backend-client.js) run the same
// code. deps = { Sharing }.
// Only the class's own students; only failed checks on the tasks asked for, in the last 30 days (the server keeps code
// and output for 30 days, 0004_retention); only what matching and the list need: no ids, PINs, login codes, passes,
// hints or other tasks.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ReviewServer = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const PAGE = 1000;
  const WINDOW_DAYS = 30;
  const MAX_TASKS = 1000;
  const NO_MATCH = ["NO_ANSWER", "WRONG_ERROR_KIND"]; // never matched (Checker.matchMisconceptions, recheck.py)
  function data(r, what) {
    if (r.error) throw new Error(what + ": " + (r.error.code || "") + " " + r.error.message);
    return r.data;
  }

  // -> { class_name, window_days, candidates: [{ student_name, task_id, at, category, failed_test, output, error_kind,
  //      code (null once cleared), matched }] }. now: the time (ms) the window ends (the tests set it).
  async function candidatesForClass(sb, deps, tid, classId, taskIds, now) {
    const cls = await deps.Sharing.requireClass(sb, tid, classId, false);
    if (!Array.isArray(taskIds) || taskIds.length > MAX_TASKS || taskIds.some((t) => typeof t !== "string" || !t || t.length > 200)) {
      throw new deps.Sharing.Problem(400, "Something went wrong. Please try again.");
    }
    const tasks = [...new Set(taskIds)];
    const out = { class_name: cls.name, window_days: WINDOW_DAYS, candidates: [] };
    if (!tasks.length) return out;
    const students = data(await sb.from("students").select("id, nickname").eq("class_id", cls.id).order("nickname"), "students");
    if (!students.length) return out;
    const name = Object.fromEntries(students.map((s) => [s.id, s.nickname]));
    const since = new Date((now == null ? Date.now() : now) - WINDOW_DAYS * 86400000).toISOString();
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const page = data(await sb.from("attempts")
        .select("id, student_id, timestamp, task_id, failure_category, failed_test_number, student_output, student_error_kind, student_code, code_deleted_at, misconception_matches")
        .in("student_id", students.map((s) => s.id)).eq("record_type", "attempt").eq("result", "fail").gte("timestamp", since).in("task_id", tasks)
        .order("id").range(from, from + PAGE - 1), "read failed attempts");
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    out.candidates = rows.filter((a) => !NO_MATCH.includes(a.failure_category)).map((a) => ({
      student_name: name[a.student_id], task_id: a.task_id, at: a.timestamp, category: a.failure_category || "",
      failed_test: a.failed_test_number == null ? null : a.failed_test_number,
      output: a.code_deleted_at ? "" : a.student_output || "", error_kind: a.student_error_kind || "",
      code: a.code_deleted_at || a.student_code == null ? null : a.student_code,
      matched: (a.misconception_matches || []).length > 0,
    }));
    return out;
  }

  return { WINDOW_DAYS, candidatesForClass };
});
