// Large paste flags on the teacher's Students page (teacher-api paste_flags_for_class, migrations 0018 and 0019).
// The details are worked out with the site's own rule (paste-details.js), the same as the teacher view's local mode.
// A plain script, like certificates-server.js, so the Deno function and the Node tests (tests/backend-client.js) run
// the same code. deps = { Sharing, PasteDetails }.
// Only the class's own students are read. For each flag, only the one next check on its task is used (its time,
// result, phase and, for a failed check, its saved code): never the student's other attempts, a PIN or a login code.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PasteFlagsServer = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const PAGE = 1000;
  function data(r, what) {
    if (r.error) throw new Error(what + ": " + (r.error.code || "") + " " + r.error.message);
    return r.data;
  }
  async function all(query, what) {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      const page = data(await query().range(from, from + PAGE - 1), what);
      out.push(...page);
      if (page.length < PAGE) return out;
    }
  }
  const FLAG_COLUMNS = "id, student_id, record_id, timestamp, unit, task_id, paste_phase, paste_lines, paste_homework_id";
  // A server without migration 0019 has no detail columns: then every flag is read as an older one.
  const noColumn = (e) => !!e && (e.code === "42703" || e.code === "PGRST204" || /paste_(phase|lines|homework_id)/.test(e.message || ""));

  // -> { class_name, students: [{ student_id, student_name, units: [{ unit, flags: [details] }] }] } for the students
  // with at least one flag, by name; each unit's flags newest first (paste-details.js describe).
  async function forClass(sb, deps, tid, classId) {
    const cls = await deps.Sharing.requireClass(sb, tid, classId, false);
    const students = data(await sb.from("students").select("id, nickname").eq("class_id", cls.id).order("nickname"), "students");
    const ids = students.map((s) => s.id);
    if (!ids.length) return { class_name: cls.name, students: [] };
    // Every flag of the class, a page at a time; { rows } or { error }.
    const readFlags = async (cols) => {
      const rows = [];
      for (let from = 0; ; from += PAGE) {
        const r = await sb.from("events").select(cols).in("student_id", ids).eq("record_type", "paste_flag").order("id").range(from, from + PAGE - 1);
        if (r.error) return { error: r.error };
        rows.push(...r.data);
        if (r.data.length < PAGE) return { rows };
      }
    };
    let got = await readFlags(FLAG_COLUMNS);
    if (got.error && noColumn(got.error)) got = await readFlags("id, student_id, record_id, timestamp, unit, task_id");
    const rows = data(got.error ? got : { data: got.rows }, "read paste flags");
    if (!rows.length) return { class_name: cls.name, students: [] };
    const flags = rows.map((r) => ({ id: r.record_id, studentId: r.student_id, at: r.timestamp, unit: r.unit, taskId: r.task_id,
      phase: r.paste_phase ?? null, lines: r.paste_lines ?? null, homeworkId: r.paste_homework_id ?? null,
      recorded: r.paste_phase != null || r.paste_lines != null }));
    // The due dates of the homework the flags name.
    const hwIds = [...new Set(flags.map((f) => f.homeworkId).filter(Boolean))];
    const homeworkDue = hwIds.length ? Object.fromEntries(data(await sb.from("homework").select("id, due_on").in("id", hwIds), "homework")
      .map((h) => [h.id, String(h.due_on).slice(0, 10)])) : {};
    // Checks and skips on the flagged tasks only, by the flagged students: enough to find each flag's next check.
    const flagged = [...new Set(flags.map((f) => f.studentId))];
    const tasks = [...new Set(flags.map((f) => f.taskId))];
    const attempts = await all(() => sb.from("attempts").select("id, student_id, record_type, timestamp, task_id, phase, result, student_code, code_deleted_at")
      .in("student_id", flagged).in("task_id", tasks).in("record_type", ["attempt", "skip"]).order("id"), "read checks");
    const out = [];
    for (const s of students) {
      const mine = flags.filter((f) => f.studentId === s.id);
      if (!mine.length) continue;
      const checks = attempts.filter((a) => a.student_id === s.id).map((a) => ({ at: a.timestamp, taskId: a.task_id, kind: a.record_type,
        result: a.result, phase: a.phase, code: a.student_code, codeDeleted: a.code_deleted_at != null }));
      const units = deps.PasteDetails.byUnit(mine, checks, homeworkDue);
      out.push({ student_id: s.id, student_name: s.nickname, units: Object.keys(units).sort().map((u) => ({ unit: u, flags: units[u] })) });
    }
    return { class_name: cls.name, students: out };
  }

  // student-api add_events: keeps the event rows whose paste_homework_id (if any) is a homework of the student's own
  // class; any other is rejected (pushed onto `rejected`). The database checks this again (0019's trigger).
  async function keepOwnHomework(sb, classId, rows, rejected) {
    const named = [...new Set(rows.map((r) => r.paste_homework_id).filter((x) => x != null))];
    if (!named.length) return rows;
    const mine = new Set(data(await sb.from("homework").select("id").eq("class_id", classId).in("id", named), "homework").map((h) => h.id));
    return rows.filter((r) => {
      if (r.paste_homework_id == null || mine.has(r.paste_homework_id)) return true;
      rejected.push({ record_id: r.record_id, reason: "bad paste_homework_id" });
      return false;
    });
  }

  return { forClass, keepOwnHomework };
});
