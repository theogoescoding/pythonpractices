// Exam Mode on the server (prompt EM2, migration 0021). Used by student-api (add_exam_attempts, get_exam_progress, the
// exam_mode flag in get_progress) and teacher-api (set_exam_mode, exam_overview, exam_student_detail).
// A plain script, like homework-server.js, so the Deno functions and the Node tests (tests/backend-client.js) run the
// same code. Every function takes the database client (the service role, or a fake in the tests) and, where it needs
// them, deps = { Sharing (class-sharing.js), ExamMode (exam.js: the switch rule, packProgress, the row conversions),
// data (exam-mode.json) }. Teacher problems are thrown as Sharing.Problem (teacher-api shows them).
// Marking stays in the browser (decision 2): the server checks a row's shape and that its sums add up, but doesn't
// re-mark, so the leaderboard and homework figures (EM3) trust the browser's marks, as passes do on the rest of the site.
// Nothing a teacher gets back has a student id, PIN or login code; code only in the one student's detail.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ExamServer = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const PAGE = 1000;
  const MAX_ROWS_PER_BATCH = 500;
  const MAX_STORED_TEXT = 2000; // as store.js and rows.ts: code is cut to this many characters
  const RECORD_ID = /^x-[a-z0-9-]{1,40}$/;
  const ID = /^[A-Za-z0-9-]{1,40}$/;
  const NOTE = /^[a-z0-9-]{1,40}$/;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const MODEL_SEEN = "exam_model_seen";
  const TUTORIAL_SEEN = "exam_tutorial_seen";
  const EVENT_TYPES = [MODEL_SEEN, TUTORIAL_SEEN];
  const KEYS = ["record_id", "timestamp", "pack_id", "question_id", "rung", "step", "attempt_number", "first", "points", "total", "max",
    "auto_total", "auto_max", "notes", "help_used", "paste_flag", "student_code", "assignment_id"];
  // What a student gets back of their own rows (no code), and what a teacher's overview reads.
  const OWN_COLUMNS = "record_id, timestamp, pack_id, question_id, rung, step, attempt_number, first, points, total, max, auto_total, auto_max, notes, help_used, paste_flag, assignment_id";
  const OVERVIEW_COLUMNS = "student_id, " + OWN_COLUMNS;
  const DETAIL_COLUMNS = OWN_COLUMNS + ", student_code, code_deleted_at";
  const MESSAGES = {
    setting: "Choose On, Off or the stage's default.",
    oldServer: "Exam Mode's class switch needs the newest version of the server (migration 0021). It will work once the server has been updated.",
  };

  function data(r, what) {
    if (r.error) throw new Error(what + ": " + (r.error.code || "") + " " + r.error.message);
    return r.data;
  }
  // A server without migration 0021: no exam_attempts table, or no classes.exam_mode column.
  const noExam = (e) => !!e && (e.code === "42P01" || e.code === "42703" || e.code === "PGRST204" || e.code === "PGRST205" || /exam_attempts|exam_mode/.test(e.message || ""));
  async function all(query, what) {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      const page = data(await query().range(from, from + PAGE - 1), what);
      out.push(...page);
      if (page.length < PAGE) return out;
    }
  }
  const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const clip = (s) => (s.length > MAX_STORED_TEXT ? s.slice(0, MAX_STORED_TEXT) + "\n…(cut short)" : s);
  const pct = (n, d) => (d ? Math.round((100 * n) / d) : null);

  // ---------- Checking rows (student-api add_exam_attempts) ----------
  // One row's problem, or null. The sums must add up: total = the awarded points, auto_total and auto_max = the
  // auto-marked points', and one point per mark (max). A point is { id, awarded: 1 | 0 | null, status: "auto" | "self" };
  // only a self-check point can be null (not checked yet). Rung 1 (its two parts) and rung 4 (its steps) have a step.
  function rowProblem(r) {
    const bad = Object.keys(r).find((k) => !KEYS.includes(k));
    if (bad) return "bad " + bad;
    if (typeof r.record_id !== "string" || !RECORD_ID.test(r.record_id)) return "bad record_id";
    if (typeof r.timestamp !== "string" || r.timestamp.length > 40 || Number.isNaN(Date.parse(r.timestamp))) return "bad timestamp";
    if (typeof r.pack_id !== "string" || !ID.test(r.pack_id)) return "bad pack_id";
    if (typeof r.question_id !== "string" || !ID.test(r.question_id)) return "bad question_id";
    if (!isInt(r.rung, 1, 5)) return "bad rung";
    if (r.step != null && (!isInt(r.step, 1, 20) || (r.rung !== 1 && r.rung !== 4))) return "bad step";
    if (!isInt(r.attempt_number, 1, 10000)) return "bad attempt_number";
    if (typeof r.first !== "boolean") return "bad first";
    if (!isInt(r.max, 1, 20)) return "bad max";
    const pts = r.points;
    if (!Array.isArray(pts) || pts.length !== r.max) return "bad points";
    const ids = new Set();
    for (const p of pts) {
      if (!p || typeof p !== "object" || Array.isArray(p) || Object.keys(p).some((k) => !["id", "awarded", "status"].includes(k))) return "bad points";
      if (typeof p.id !== "string" || !ID.test(p.id) || ids.has(p.id)) return "bad points";
      ids.add(p.id);
      if (p.status !== "auto" && p.status !== "self") return "bad points";
      if (!(p.awarded === 1 || p.awarded === 0 || (p.awarded === null && p.status === "self"))) return "bad points";
    }
    const sum = (list) => list.reduce((s, p) => s + (p.awarded || 0), 0);
    const auto = pts.filter((p) => p.status === "auto");
    if (r.total !== sum(pts)) return "bad total";
    if (r.auto_total !== sum(auto) || r.auto_max !== auto.length) return "bad auto_total";
    if (r.notes != null && (!Array.isArray(r.notes) || r.notes.length > 10 || !r.notes.every((n) => typeof n === "string" && NOTE.test(n)))) return "bad notes";
    if (r.help_used != null && typeof r.help_used !== "boolean") return "bad help_used";
    if (r.paste_flag != null && typeof r.paste_flag !== "boolean") return "bad paste_flag";
    if (r.student_code != null && typeof r.student_code !== "string") return "bad student_code";
    if (r.assignment_id != null && (typeof r.assignment_id !== "string" || !UUID.test(r.assignment_id))) return "bad assignment_id";
    return null;
  }

  // -> { ok, rejected } (each bad row rejected on its own), or null when rows isn't a list of at most 500.
  // Code is cut as store.js cuts it, and only kept when marks were lost (as failed attempts on the rest of the site).
  function checkRows(rows) {
    if (!Array.isArray(rows) || rows.length > MAX_ROWS_PER_BATCH) return null;
    const ok = [], rejected = [];
    for (const row of rows) {
      const id = row && typeof row === "object" ? row.record_id : null;
      if (!row || typeof row !== "object" || Array.isArray(row)) { rejected.push({ record_id: id, reason: "not an object" }); continue; }
      const reason = rowProblem(row);
      if (reason) { rejected.push({ record_id: id, reason }); continue; }
      const r = Object.assign({}, row, { step: row.step == null ? null : row.step, notes: row.notes || [], help_used: !!row.help_used, paste_flag: !!row.paste_flag });
      if (typeof r.student_code === "string" && r.student_code && r.total < r.max) r.student_code = clip(r.student_code);
      else delete r.student_code;
      if (r.assignment_id == null) delete r.assignment_id;
      ok.push(r);
    }
    return { ok, rejected };
  }

  // When the student first opened each question's model answer: { question_id: time in ms }.
  async function modelSeenTimes(sb, sid) {
    const seen = {};
    const r = await sb.from("events").select("task_id, timestamp").eq("student_id", sid).eq("record_type", MODEL_SEEN);
    for (const e of data(r, "model answers seen") || []) {
      const t = Date.parse(e.timestamp);
      if (!(e.task_id in seen) || t < seen[e.task_id]) seen[e.task_id] = t;
    }
    return seen;
  }

  // Saves a student's rows. opts = { hash: async (code) => text (the code's HMAC, as attempts.code_hash) }.
  // Refused one by one: a bad shape; an assignment that isn't the student's class's; a try made after the student
  // opened that question's model answer (decision 9: the database checks this too). A row already saved (same
  // record_id) is skipped, so a resent batch saves nothing twice. -> { saved, rejected }, or null for a bad request.
  async function addAttempts(sb, sid, rows, opts) {
    const checked = checkRows(rows);
    if (!checked) return null;
    const rejected = checked.rejected;
    let ok = checked.ok;
    const named = [...new Set(ok.map((r) => r.assignment_id).filter(Boolean))];
    if (named.length) {
      const s = data(await sb.from("students").select("class_id").eq("id", sid).maybeSingle(), "student");
      const found = s ? data(await sb.from("assignments").select("id").eq("class_id", s.class_id).in("id", named), "assignments") : [];
      const mine = new Set(found.map((a) => a.id));
      ok = ok.filter((r) => (!r.assignment_id || mine.has(r.assignment_id) ? true : (rejected.push({ record_id: r.record_id, reason: "bad assignment_id" }), false)));
    }
    const seen = await modelSeenTimes(sb, sid);
    ok = ok.filter((r) => (r.question_id in seen && Date.parse(r.timestamp) > seen[r.question_id]
      ? (rejected.push({ record_id: r.record_id, reason: "after the model answer" }), false) : true));
    for (const r of ok) {
      r.student_id = sid;
      r.code_hash = r.student_code && opts && opts.hash ? await opts.hash(r.student_code) : null;
    }
    if (!ok.length) return { saved: 0, rejected };
    const insert = (rs) => sb.from("exam_attempts").upsert(rs, { onConflict: "student_id,record_id", ignoreDuplicates: true }).select("record_id");
    const isDataError = (e) => /^(22|23)/.test(e.code || "");
    const batch = await insert(ok);
    if (!batch.error) return { saved: (batch.data || []).length, rejected };
    if (!isDataError(batch.error)) data(batch, "save exam attempts");
    let saved = 0;
    for (const r of ok) {
      const one = await insert([r]);
      if (!one.error) saved += (one.data || []).length;
      else if (isDataError(one.error)) rejected.push({ record_id: r.record_id, reason: "refused by the database" });
      else data(one, "save exam attempt");
    }
    return { saved, rejected };
  }

  // ---------- The student's own (student-api get_exam_progress) ----------
  // Their own rows only (no code), the questions whose model answer they've opened, and whether they've seen the
  // tutorial: Exam Mode on another computer shows the same landing cards and My exam scores.
  async function forStudent(sb, sid) {
    const r = await sb.from("exam_attempts").select(OWN_COLUMNS).eq("student_id", sid).order("id").range(0, 0);
    if (r.error && noExam(r.error)) return { attempts: [], model_seen: [], tutorial_seen: false };
    const own = OWN_COLUMNS.split(", ");
    const attempts = (await all(() => sb.from("exam_attempts").select(OWN_COLUMNS).eq("student_id", sid).order("id"), "exam attempts"))
      .map((r) => Object.fromEntries(own.map((k) => [k, r[k] === undefined ? null : r[k]]))); // only these columns, whatever comes back
    const events = data(await sb.from("events").select("record_type, task_id, timestamp").eq("student_id", sid).in("record_type", EVENT_TYPES), "exam events") || [];
    const seen = await modelSeenTimes(sb, sid);
    return {
      attempts,
      model_seen: Object.keys(seen).sort().map((q) => ({ question_id: q, at: new Date(seen[q]).toISOString() })),
      tutorial_seen: events.some((e) => e.record_type === TUTORIAL_SEEN),
    };
  }

  // ---------- Assignments (EM3b, decision 29) ----------
  // The student's open assignments (as student-api sends them), each with exam_done: the ids of its Exam Mode questions
  // that are done (exam.js assignmentItemDone: every part tried with this assignment, or its answer shown). The student's
  // page joins this with its own records, so the assignment card, the assignment page and completion agree on any
  // computer. An assignment with no Exam Mode question gets []. A server without migration 0021: [] for every one.
  async function withExamDone(sb, deps, sid, assignments) {
    const X = deps.ExamMode, packs = deps.data.packs;
    const list = (assignments || []).map((a) => Object.assign({}, a, { exam_done: [] }));
    const ids = list.filter((a) => X.assignmentItems(packs, a.task_ids).some((x) => x.exam)).map((a) => a.id);
    if (!ids.length) return list;
    const r = await sb.from("exam_attempts").select("question_id, rung, step, assignment_id").eq("student_id", sid).in("assignment_id", ids).order("id");
    if (r.error && noExam(r.error)) return list;
    const recs = (data(r, "assignment exam attempts") || []).map((row) => ({ questionId: row.question_id, rung: row.rung, step: row.step == null ? null : row.step, assignmentId: row.assignment_id }));
    const seen = {};
    for (const id of Object.keys(await modelSeenTimes(sb, sid))) seen[id] = true;
    for (const a of list) if (ids.includes(a.id)) a.exam_done = X.examDoneIds(packs, a, recs, seen);
    return list;
  }

  // ---------- The class switch (decisions 1 and 15) ----------
  // { stage, setting } of a class. A server without migration 0021 has no exam_mode column (setting null), and one
  // without 0013 no stage (GCSE).
  async function classSetting(sb, classId) {
    let r = await sb.from("classes").select("stage, exam_mode").eq("id", classId).maybeSingle();
    if (r.error && noExam(r.error)) r = await sb.from("classes").select("stage").eq("id", classId).maybeSingle();
    if (r.error) r = { data: {}, error: null }; // no stage column either: every class is GCSE
    const c = data(r, "class") || {};
    return { stage: c.stage || "gcse", setting: typeof c.exam_mode === "boolean" ? c.exam_mode : null };
  }
  const switchState = (deps, s) => ({ stage: s.stage, setting: s.setting, on: deps.ExamMode.examModeOn(s.stage, s.setting) });

  // Whether the student's class has Exam Mode on (student-api get_progress).
  async function examModeForStudent(sb, deps, sid) {
    const s = data(await sb.from("students").select("class_id").eq("id", sid).maybeSingle(), "student");
    if (!s) return false;
    return switchState(deps, await classSetting(sb, s.class_id)).on;
  }

  // Any teacher on the class (owner or co-teacher), as for its other settings. on: true, false, or null (follow the
  // stage). -> { stage, setting, on }.
  async function setExamMode(sb, deps, tid, classId, on) {
    if (!(on === true || on === false || on === null)) throw new deps.Sharing.Problem(400, MESSAGES.setting, "setting");
    const cls = await deps.Sharing.requireClass(sb, tid, classId, false);
    const r = await sb.from("classes").update({ exam_mode: on }).eq("id", cls.id);
    if (r.error && noExam(r.error)) throw new deps.Sharing.Problem(400, MESSAGES.oldServer, "old-server");
    data(r, "set exam mode");
    return switchState(deps, await classSetting(sb, cls.id));
  }

  // ---------- The teacher's Exam Mode page (decisions 8 and 16) ----------
  const studentsOf = async (sb, classId) => data(await sb.from("students").select("id, nickname").eq("class_id", classId).order("nickname"), "students");
  // The steps rung 4's question has, so its score counts every step (as the student's own page does).
  const stepsTotalOf = (d, packId, questionId) => {
    const p = d.packs.find((x) => x.id === packId);
    return p && p.rungQuestions && p.rungQuestions.steps === questionId ? p.rungs.steps.steps.length : null;
  };

  // Everything the page shows for one class, worked out here from exam_attempts:
  //   switch: { stage, setting, on };
  //   students: [{ nickname, packs: { packId: { reached, started, full_tried, full_count, first_pct, best_pct } } }]
  //     (reached by the landing card's rule, exam.js packProgress; first and best on the pack's full questions, as %);
  //   average: { packId: { reached, first_pct, best_pct, students } } (reached over every student; the % over those
  //     who have a full-question score);
  //   missed: [{ pack_id, question_id, students, points: [{ id, missed, pct }], always_true }] for each full question: of
  //     the students with a first attempt, how many missed each mark point (most missed first), and how many wrote a
  //     loop test that is always true (the marker's note);
  //   help: [{ pack_id, question_id, rungs, attempts, self_pct, help_pct }]: of the recorded attempts, the % of mark
  //     points the student checked themselves and the % with "Say it simply" used.
  // Only nicknames, numbers and question and mark-point ids: no student id, code, PIN or login code.
  // The class's students, each with their Exam Mode records as exam.js keeps them: [{ id, nickname, recs }].
  async function classRecords(sb, deps, classId) {
    const students = await studentsOf(sb, classId);
    const ids = students.map((s) => s.id);
    let rows = [];
    if (ids.length) {
      const probe = await sb.from("exam_attempts").select("id").in("student_id", ids).range(0, 0);
      if (!(probe.error && noExam(probe.error))) rows = await all(() => sb.from("exam_attempts").select(OVERVIEW_COLUMNS).in("student_id", ids).order("id"), "exam attempts");
    }
    const X = deps.ExamMode, d = deps.data;
    return students.map((s) => ({ id: s.id, nickname: s.nickname,
      recs: rows.filter((r) => r.student_id === s.id).map((r) => X.fromServerRow(r, stepsTotalOf(d, r.pack_id, r.question_id))) }));
  }

  // Everything the teacher's Exam Mode page shows for one class: the switch, then exam.js classOverview (students'
  // packs, the class average, the most-missed mark points, self-check and help rates; paste flags left out of every
  // score, EM3) and the class's Exam leaderboard (exam.js examBoards, EM3). Only nicknames, numbers and question and
  // mark-point ids: no student id, code, PIN or login code.
  async function overview(sb, deps, tid, classId, now) {
    const cls = await deps.Sharing.requireClass(sb, tid, classId, false);
    const sw = switchState(deps, await classSetting(sb, cls.id));
    const students = await classRecords(sb, deps, cls.id);
    const o = deps.ExamMode.classOverview(deps.data.packs, students.map((s) => ({ nickname: s.nickname, recs: s.recs })));
    const leaderboard = deps.ExamMode.examBoards(students.map((s) => ({ nickname: s.nickname, recs: s.recs })), now);
    return Object.assign({ class_name: cls.name, switch: sw, packs: deps.data.packs.map((p) => ({ id: p.id })) }, o, { leaderboard });
  }

  // The student's own class's Exam leaderboard (student-api exam_leaderboard): nicknames, places and scores, their own
  // row marked me. The class is always the student's own.
  async function studentBoards(sb, deps, sid, now) {
    const s = data(await sb.from("students").select("id, class_id").eq("id", sid).maybeSingle(), "student");
    if (!s) return { average: [], improved: [], min: deps.ExamMode.BOARD_MIN_QUESTIONS };
    const students = await classRecords(sb, deps, s.class_id);
    return deps.ExamMode.examBoards(students.map((x) => ({ nickname: x.nickname, recs: x.recs, me: x.id === sid })), now);
  }

  // One student's attempts, newest first, with their code while it is kept (30 days, failed attempts only). The student
  // must be in this class, and the teacher on it (404 otherwise, the same as a student who doesn't exist).
  async function studentDetail(sb, deps, tid, classId, studentId) {
    const cls = await deps.Sharing.requireClass(sb, tid, classId, false);
    if (typeof studentId !== "string" || !UUID.test(studentId)) throw new deps.Sharing.Problem(404, deps.Sharing.MESSAGES.notFound);
    const s = data(await sb.from("students").select("id, class_id, nickname").eq("id", studentId).eq("class_id", cls.id).maybeSingle(), "student");
    if (!s) throw new deps.Sharing.Problem(404, deps.Sharing.MESSAGES.notFound);
    const probe = await sb.from("exam_attempts").select("id").eq("student_id", s.id).range(0, 0);
    const rows = probe.error && noExam(probe.error) ? [] : await all(() => sb.from("exam_attempts").select(DETAIL_COLUMNS).eq("student_id", s.id).order("id"), "exam attempts");
    rows.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    return { class_name: cls.name, nickname: s.nickname, attempts: rows.map((r) => ({ at: new Date(r.timestamp).toISOString(), pack_id: r.pack_id, question_id: r.question_id,
      rung: r.rung, step: r.step == null ? null : r.step, attempt_number: r.attempt_number, first: !!r.first, total: r.total, max: r.max, points: r.points || [],
      notes: r.notes || [], help_used: !!r.help_used, paste_flag: !!r.paste_flag, code: r.student_code == null ? null : r.student_code, code_cleared: r.code_deleted_at != null })) };
  }

  return { MESSAGES, MODEL_SEEN, TUTORIAL_SEEN, EVENT_TYPES, MAX_ROWS_PER_BATCH, noExam, rowProblem, checkRows, addAttempts, forStudent, classSetting,
    examModeForStudent, setExamMode, overview, studentBoards, classRecords, studentDetail, withExamDone };
});
