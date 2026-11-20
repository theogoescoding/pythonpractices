// Homework on the server (migration 0018). Used by teacher-api (create, list, delete, report) and student-api (the
// student's own homework, and the progress update after a pass or a paste flag). The counting rule is the site's own
// (homework.js), so the student's card, the teacher's report and the tests always agree.
// A plain script, like certificates-server.js, so the Deno functions and the Node tests (tests/backend-client.js) run
// the same code. Every function takes the database client (the service role, or a fake in the tests) and
// deps = { Homework, Sharing, unitIds }. Teacher problems are thrown as Sharing.Problem (teacher-api shows them).
// Only homework_progress is written here as the service role: students never write it, and teachers only read it.
// Nothing returned has a student id, PIN, login code or attempt text: student names, numbers, units and task ids only.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HomeworkServer = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const PAGE = 1000;
  const UUID = /^[0-9a-f-]{36}$/;
  const HW_COLUMNS = "id, class_id, created_by, task_count, due_on, units, created_at";
  const NOT_FOUND = "That homework wasn't found.";

  function data(r, what) {
    if (r.error) throw new Error(what + ": " + (r.error.code || "") + " " + r.error.message);
    return r.data;
  }
  // A server without migration 0018 has no homework tables: then there is no homework.
  const noTable = (e) => !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST202" || /homework/.test(e.message || ""));
  // Every row a query returns, a page at a time (the API returns at most 1000 rows per request).
  async function all(query, what) {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      const page = data(await query().range(from, from + PAGE - 1), what);
      out.push(...page);
      if (page.length < PAGE) return out;
    }
  }
  const asHw = (h) => ({ id: h.id, class_id: h.class_id, created_by: h.created_by, task_count: h.task_count, due_on: String(h.due_on).slice(0, 10),
    units: h.units || [], created_at: new Date(h.created_at).toISOString() });

  // Every pass and every paste flag of these students, as homework.js reads them: { sid: { attempts, flags } }.
  async function records(sb, ids) {
    const out = {};
    for (const id of ids) out[id] = { attempts: [], flags: [] };
    if (!ids.length) return out;
    const passes = await all(() => sb.from("attempts").select("id, student_id, record_type, timestamp, unit, task_units, task_id, result")
      .in("student_id", ids).eq("record_type", "attempt").eq("result", "pass").order("id"), "read passes");
    for (const a of passes) out[a.student_id].attempts.push({ kind: "attempt", at: a.timestamp, unit: a.unit, units: a.task_units || [a.unit], taskId: a.task_id, result: a.result });
    const flags = await all(() => sb.from("events").select("id, student_id, record_type, timestamp, unit, task_id")
      .in("student_id", ids).eq("record_type", "paste_flag").order("id"), "read paste flags");
    for (const f of flags) out[f.student_id].flags.push({ at: f.timestamp, unit: f.unit, units: [f.unit], taskId: f.task_id });
    return out;
  }

  // Works out every student's progress on each homework and saves it (homework_progress, one row per homework and
  // student). -> { hwId: { sid: progress } } with homework.js's progress.
  async function refresh(sb, deps, list, studentIds) {
    const recs = await records(sb, studentIds);
    const out = {};
    const rows = [];
    const now = new Date().toISOString();
    for (const hw of list) {
      out[hw.id] = {};
      for (const sid of studentIds) {
        const p = deps.Homework.progress(hw, recs[sid].attempts, recs[sid].flags);
        out[hw.id][sid] = p;
        rows.push({ homework_id: hw.id, student_id: sid, done: p.done, complete: p.complete, units: p.units, task_ids: p.taskIds, updated_at: now });
      }
    }
    if (rows.length) data(await sb.from("homework_progress").upsert(rows, { onConflict: "homework_id,student_id" }), "save homework progress");
    return out;
  }

  // ---------- Students (student-api) ----------
  // The homework of the student's own class, newest due date last, with their "x of y done" (saved as it is worked
  // out): [{ id, task_count, due_on, units, created_at, done, complete }]. Nothing in the request can name another class.
  async function forStudent(sb, deps, sid) {
    const s = data(await sb.from("students").select("id, class_id").eq("id", sid).maybeSingle(), "student");
    if (!s) return [];
    const r = await sb.from("homework").select(HW_COLUMNS).eq("class_id", s.class_id).order("due_on").order("created_at");
    if (r.error && noTable(r.error)) return [];
    const list = data(r, "homework").map(asHw);
    if (!list.length) return [];
    const p = await refresh(sb, deps, list, [sid]);
    return list.map((hw) => ({ id: hw.id, task_count: hw.task_count, due_on: hw.due_on, units: hw.units, created_at: hw.created_at,
      done: p[hw.id][sid].done, complete: p[hw.id][sid].complete }));
  }

  // ---------- Teachers (teacher-api) ----------
  async function homeworkById(sb, deps, tid, homeworkId) {
    if (typeof homeworkId !== "string" || !UUID.test(homeworkId)) throw new deps.Sharing.Problem(404, NOT_FOUND);
    const h = data(await sb.from("homework").select(HW_COLUMNS).eq("id", homeworkId).maybeSingle(), "homework");
    if (!h) throw new deps.Sharing.Problem(404, NOT_FOUND);
    const cls = await deps.Sharing.onClass(sb, tid, h.class_id);
    if (!cls) throw new deps.Sharing.Problem(404, NOT_FOUND); // the same answer as homework that doesn't exist
    return { hw: asHw(h), cls };
  }
  async function teacherNames(sb, ids) {
    const want = [...new Set(ids.filter(Boolean))];
    if (!want.length) return {};
    return Object.fromEntries(data(await sb.from("teachers").select("id, name").in("id", want), "teachers").map((t) => [t.id, t.name]));
  }
  const studentsOf = async (sb, classId) => data(await sb.from("students").select("id, nickname").eq("class_id", classId).order("nickname"), "students");

  // Every homework of a class this teacher is on (owner or co-teacher), soonest due first, with how many students
  // have completed it: [{ id, task_count, due_on, units, created_at, created_by_name, yours, students, complete }].
  async function listForClass(sb, deps, tid, classId) {
    const cls = await deps.Sharing.requireClass(sb, tid, classId, false);
    const list = data(await sb.from("homework").select(HW_COLUMNS).eq("class_id", cls.id).order("due_on").order("created_at"), "homework").map(asHw);
    const students = await studentsOf(sb, cls.id);
    const p = list.length ? await refresh(sb, deps, list, students.map((s) => s.id)) : {};
    const names = await teacherNames(sb, list.map((h) => h.created_by));
    return { class_name: cls.name, homework: list.map((hw) => ({ id: hw.id, task_count: hw.task_count, due_on: hw.due_on, units: hw.units, created_at: hw.created_at,
      created_by_name: names[hw.created_by] || "", yours: hw.created_by === tid, students: students.length,
      complete: students.filter((s) => p[hw.id][s.id].complete).length })) };
  }

  // A new homework for a class this teacher is on. input = { task_count, due_on, units } (homework.js checkNew).
  async function create(sb, deps, tid, classId, input, today) {
    const cls = await deps.Sharing.requireClass(sb, tid, classId, false);
    const c = deps.Homework.checkNew(input, deps.unitIds, today || deps.Homework.ukDate(Date.now()));
    if (!c.ok) throw new deps.Sharing.Problem(400, c.message, c.problem);
    data(await sb.from("homework").insert(Object.assign({ class_id: cls.id, created_by: tid }, c.homework)), "add homework");
    return await listForClass(sb, deps, tid, cls.id);
  }

  // Its creator or any other teacher on the class (owner or co-teacher) can delete a homework. Its progress rows go
  // with it; the students' attempts and paste flags stay in their records.
  async function remove(sb, deps, tid, homeworkId) {
    const { hw } = await homeworkById(sb, deps, tid, homeworkId);
    data(await sb.from("homework").delete().eq("id", hw.id), "delete homework");
    return { deleted: true };
  }

  // The report: one row per student of the class, by name: { student_name, done, task_count, complete, units (the
  // units the counted tasks were done in), flagged: [{ task_id, unit }] (every flagged task, "Possible AI use") }.
  async function report(sb, deps, tid, homeworkId) {
    const { hw, cls } = await homeworkById(sb, deps, tid, homeworkId);
    const students = await studentsOf(sb, cls.id);
    const p = await refresh(sb, deps, [hw], students.map((s) => s.id));
    const names = await teacherNames(sb, [hw.created_by]);
    return {
      class_name: cls.name,
      homework: { id: hw.id, task_count: hw.task_count, due_on: hw.due_on, units: hw.units, created_at: hw.created_at, created_by_name: names[hw.created_by] || "" },
      students: students.map((s) => {
        const x = p[hw.id][s.id];
        return { student_name: s.nickname, done: x.done, task_count: hw.task_count, complete: x.complete, units: x.units,
          flagged: x.flagged.map((f) => ({ task_id: f.taskId, unit: f.unit })) };
      }),
    };
  }

  // The Progress summary on the teacher's student page (prompt 25): any teacher on the student's class, owner or
  // co-teacher (class-sharing.js requireStudent: anyone else gets the same 404 as a student who doesn't exist). The
  // rule is homework.js's (progressSummary, with its first-pass rule and progress()), on the rows the server already
  // keeps: the student's passes and paste flags (records above), the times of their attempts, the class's homework, and
  // when the student joined (students.created_at: the homework average counts only homework set since then, prompt 26).
  // Nothing is saved. -> only the four figures: { first_passes_this_week, average_first_passes_per_week,
  // average_homework_completion (a whole percentage, or null when no homework has been set since they joined), last_active
  // (ISO, or null) }.
  async function progressSummary(sb, deps, tid, studentId, now) {
    const s = await deps.Sharing.requireStudent(sb, tid, studentId);
    const recs = (await records(sb, [s.id]))[s.id];
    const tries = await all(() => sb.from("attempts").select("id, timestamp").eq("student_id", s.id).eq("record_type", "attempt").order("id"), "read attempt times");
    const r = await sb.from("homework").select(HW_COLUMNS).eq("class_id", s.class_id).order("due_on").order("created_at");
    if (r.error && !noTable(r.error)) data(r, "homework");
    const homework = r.error ? [] : (r.data || []).map(asHw);
    const joined = data(await sb.from("students").select("id, created_at").eq("id", s.id).maybeSingle(), "student");
    const x = deps.Homework.progressSummary({ attempts: recs.attempts.concat(tries.map((t) => ({ kind: "attempt", at: t.timestamp }))), flags: recs.flags, homework,
      joinedAt: joined && joined.created_at, now });
    return { first_passes_this_week: x.firstPassesThisWeek, average_first_passes_per_week: x.averageFirstPassesPerWeek,
      average_homework_completion: x.averageHomeworkCompletion, last_active: x.lastActive };
  }

  return { NOT_FOUND, noTable, records, refresh, forStudent, listForClass, create, remove, report, progressSummary };
});
