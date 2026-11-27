// student-api: POST { token, action, ... }. Every call checks the session token from resume or join-class.
//   get_progress                       -> { student: { nickname, class_name, class_stage }, progress: [{ unit, state }], passed: [{ unit, fingerprint }], attempts: [...],
//                                           assignments: [{ id, title, description, task_ids, updated_at, exam_done }] (open ones of their class;
//                                             exam_done: the Exam Mode questions in it this student has done, EM3b),
//                                           homework: [{ id, task_count, due_on, units, created_at, done, complete }] (their class's, migration 0018) }
//   homework                           -> { homework: [...] }  the same list on its own
//   save_progress { unit, state }      one unit's saved state (as the app keeps it in progress.units[unit], or progress.endless)
//   add_attempts { rows }              -> { saved, rejected, homework? }  rows use the attempts table's (the export's) column names.
//                                           After a pass, the student's homework progress is worked out again and sent back.
//   add_events { rows }                -> { saved, rejected, homework? }  also a flagged paste (record_type paste_flag, paste-flag.js),
//                                           after which the homework progress is worked out again and sent back. A paste flag
//                                           may carry paste_phase, paste_lines and paste_homework_id (migration 0019; the
//                                           homework must be one of the student's own class's, or that row is rejected)
//   mark_passed { unit, fingerprint }
//   rename_me { pin, nickname }        -> { nickname }  the student changes their own nickname, after typing their PIN
//   leaderboard                        -> { boards: { overall, improving }, me: { secured, level, programme, bonus, programmes, total, gain }, max }
//                                           their own class only: each row { rank, nickname, points, percent, me } (no unit detail,
//                                           attempts or codes). points = the combined total (secured + level + programme + re-secure bonus)
//   delete_my_progress                 deletes the student and everything saved for them (their Exam Mode attempts too)
// Exam Mode (prompt EM2, migration 0021; exam-server.js):
//   get_progress also sends exam_mode: true | false (the class's switch, or the stage's default: on for GCSE)
//   add_exam_attempts { rows }         -> { saved, rejected }  rows use the exam_attempts table's column names. Each row is
//                                           checked on its own (shape, ranges, the sums of its points); a try made after the
//                                           student opened that question's model answer is refused; a resent row saves nothing.
//   get_exam_progress                  -> { attempts (their own, no code), model_seen: [{ question_id, at }], tutorial_seen }
//   exam_leaderboard                   -> { average, improved, min }  their class's Exam leaderboard (EM3): [{ place, nickname, score, me }]
//   add_exam_attempts also sends back homework (EM3: the Exam Mode section) after saving anything
//   add_events also takes exam_model_seen (task_id = the question) and exam_tutorial_seen, with x- ids and no unit.

import { lookupHash, pinMatches, verifyToken } from "../_shared/crypto.ts";
import { check, db, HttpError, serve } from "../_shared/http.ts";
import { NICKNAME_RULES, nicknameBlocked, validNickname } from "../_shared/nickname.ts";
import { classPoints, studentBoard } from "../_shared/points.ts";
import { checkAttempts, checkEvents, EXAM_EVENT_TYPES, insertRows, PROGRESS_UNITS, Rejected, UNITS } from "../_shared/rows.ts";
// Exam Mode: the switch rule and the row conversions are the site's own (exam.js, whose page part only runs in a
// browser); exam-server.js checks and saves the rows.
import "../../../exam.js";
import "../_shared/exam-server.js";
// exam-mode.json: which Exam Mode questions an assignment can hold, and the parts each has (EM3b: exam_done), as teacher-api imports it.
import examData from "../../../exam-mode.json" with { type: "json" };
// The homework rule is the site's own (homework.js); homework-server.js reads and saves it. Both are plain scripts
// (tests/backend-client.js runs the same files in Node): they set globalThis.Homework and globalThis.HomeworkServer.
import "../../../homework.js";
import "../_shared/homework-server.js";
// keepOwnHomework: a paste flag's homework id (migration 0019) must be a homework of the student's own class.
import "../_shared/paste-flags-server.js";

// deno-lint-ignore no-explicit-any
const G = globalThis as any;
// examParts: how many parts an Exam Mode question's rung has (decision 30: one homework task per whole rung).
const hwDeps = () => ({ Homework: G.Homework, unitIds: UNITS, examParts: (qid: string) => G.ExamMode.itemParts(examData.packs, qid).length });
// The student's homework, worked out and saved. A problem here never stops their work being saved: then null.
async function myHomework(sid: string) {
  try {
    return await G.HomeworkServer.forStudent(db(), hwDeps(), sid);
  } catch (e) {
    console.error("homework", e);
    return null;
  }
}

const SIGNED_OUT = "You've been signed out. Please sign in again with your code and PIN.";
const WRONG_PIN = "That PIN isn't right. Type the 4-digit PIN you sign in with.";
const NAME_TAKEN = "Another student in this class already has that nickname. Try another one.";
const NAME_BLOCKED = "This nickname isn't allowed. Please choose another.";
const MAX_STATE_CHARS = 900_000;
const STUDENT_EVENT_TYPES = ["level_change", "button_use", "placement_result", "paste_flag", ...EXAM_EVENT_TYPES];
const ATTEMPT_COLUMNS = "record_id, record_type, timestamp, unit, task_units, task_id, template_id, phase, task_type, " +
  "task_level, student_level_before, student_level_after, attempt_number, result, failure_category, failure_details, " +
  "misconception_matches, hints_used, hint_type, variant_fingerprint, failed_test_number, failed_test_inputs, " +
  "expected_output, student_output, student_error_type, student_error_kind, student_code, assignment_id";

const bad = () => new HttpError(400, "Something went wrong. Please try again.");

// Every row of a table for one student, a page at a time (the API returns at most 1000 rows per request).
async function allRows(table: string, columns: string, studentId: string, order: string) {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const page = check(await db().from(table).select(columns).eq("student_id", studentId).order(order)
      .range(from, from + 999), "read " + table) as unknown as Record<string, unknown>[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

async function classOf(sid: string): Promise<string> {
  const s = check(await db().from("students").select("class_id").eq("id", sid).single(), "student");
  return s.class_id as string;
}

// The class's stage (migration 0013: ks3, gcse or a-level), which decides which sections of the student's unit menu
// open by default. A server without 0013 has no stage column: then it is null and the app keeps its usual menu.
async function classStage(classId: string): Promise<string | null> {
  const r = await db().from("classes").select("stage").eq("id", classId).maybeSingle();
  if (r.error || !r.data) return null;
  return (r.data as { stage?: string }).stage ?? null;
}

// The open assignments of a class, newest first. Closed ones are never sent to students. Each has exam_done (EM3b):
// the ids of its Exam Mode questions this student has done (exam-server.js withExamDone). A problem working that out
// never stops the assignments being sent: then exam_done is [] and the student's page uses its own records.
async function openAssignments(classId: string, sid: string) {
  const list = check(await db().from("assignments").select("id, title, description, task_ids, updated_at")
    .eq("class_id", classId).eq("status", "open").order("created_at", { ascending: false }), "assignments") as unknown as Record<string, unknown>[];
  try {
    return await G.ExamServer.withExamDone(db(), { ExamMode: G.ExamMode, data: examData }, sid, list);
  } catch (e) {
    console.error("assignment exam_done", e);
    return list.map((a) => ({ ...a, exam_done: [] }));
  }
}

const actions: Record<string, (sid: string, body: Record<string, unknown>) => Promise<unknown>> = {
  async get_progress(sid) {
    const student = check(await db().from("students").select("nickname, class_id, classes(name)").eq("id", sid).single(), "student");
    const cls = student.classes as unknown as { name: string } | null;
    return {
      student: { nickname: student.nickname, class_name: cls?.name ?? "", class_stage: await classStage(student.class_id as string) },
      progress: await allRows("progress", "unit, state", sid, "unit"),
      passed: await allRows("passed_tasks", "unit, fingerprint", sid, "created_at"),
      attempts: await allRows("attempts", ATTEMPT_COLUMNS, sid, "id"),
      assignments: await openAssignments(student.class_id as string, sid),
      homework: (await myHomework(sid)) ?? [],
      exam_mode: await G.ExamServer.examModeForStudent(db(), { ExamMode: G.ExamMode }, sid),
    };
  },

  // Exam Mode (exam-server.js, migration 0021).
  async add_exam_attempts(sid, body) {
    const r = await G.ExamServer.addAttempts(db(), sid, body.rows, { hash: (code: string) => lookupHash("code", code) });
    if (!r) throw bad();
    // An Exam Mode answer can count towards homework with the Exam Mode section (EM3, homework.js): work it out again and
    // send the new "x of y done" back, as add_attempts does after a pass.
    if (r.saved > 0) {
      const homework = await myHomework(sid);
      if (homework) return { ...r, homework };
    }
    return r;
  },

  // The student's own class's Exam leaderboard (EM3, exam.js examBoards through exam-server.js): nicknames, places and
  // scores only, their own row marked me.
  async exam_leaderboard(sid) {
    return await G.ExamServer.studentBoards(db(), { ExamMode: G.ExamMode }, sid);
  },

  async get_exam_progress(sid) {
    return await G.ExamServer.forStudent(db(), sid);
  },

  async get_assignments(sid) {
    return { assignments: await openAssignments(await classOf(sid), sid) };
  },

  async homework(sid) {
    return { homework: (await myHomework(sid)) ?? [] };
  },

  async save_progress(sid, body) {
    const { unit, state } = body;
    if (!PROGRESS_UNITS.includes(unit as string) || !state || typeof state !== "object" || Array.isArray(state)) throw bad();
    if (JSON.stringify(state).length > MAX_STATE_CHARS) throw new HttpError(413, "That was too much to send at once.");
    check(await db().from("progress").upsert({ student_id: sid, unit, state, updated_at: new Date().toISOString() },
      { onConflict: "student_id,unit" }), "save progress");
  },

  async add_attempts(sid, body) {
    const checked = checkAttempts(body.rows);
    if (!checked) throw bad();
    // An assignment row must name an assignment of the student's own class (open or closed: work done offline
    // before it closed is still saved). The database checks this again.
    const named = [...new Set(checked.ok.map((r) => r.assignment_id).filter((x) => x != null))] as string[];
    let mine = new Set<string>();
    if (named.length) {
      const found = check(await db().from("assignments").select("id").eq("class_id", await classOf(sid)).in("id", named), "assignments");
      mine = new Set((found as unknown as { id: string }[]).map((a) => a.id));
    }
    const rejected: Rejected[] = checked.rejected;
    const ok = checked.ok.filter((r) => {
      if (r.assignment_id == null || mine.has(r.assignment_id as string)) return true;
      rejected.push({ record_id: r.record_id, reason: "bad assignment_id" });
      return false;
    });
    for (const r of ok) {
      r.student_id = sid;
      r.code_hash = typeof r.student_code === "string" && r.student_code ? await lookupHash("code", r.student_code) : null;
    }
    const saved = await insertRows("attempts", ok, rejected);
    // A pass may count towards homework: work it out again (homework.js) and send the new "x of y done" back.
    if (ok.some((r) => r.record_type === "attempt" && r.result === "pass")) {
      const homework = await myHomework(sid);
      if (homework) return { saved, rejected, homework };
    }
    return { saved, rejected };
  },

  async add_events(sid, body) {
    const checked = checkEvents(body.rows, STUDENT_EVENT_TYPES);
    if (!checked) throw bad();
    const rejected: Rejected[] = checked.rejected;
    // A paste flag's details (phase, lines, homework id; migration 0019) pass straight through, once its homework id
    // (if any) is known to be one of the student's own class's homework.
    const ok = checked.ok.some((r) => r.paste_homework_id != null)
      ? await G.PasteFlagsServer.keepOwnHomework(db(), await classOf(sid), checked.ok, rejected) as Record<string, unknown>[]
      : checked.ok;
    for (const r of ok) r.student_id = sid;
    const saved = await insertRows("events", ok, rejected);
    // A flagged paste: that task can no longer count towards homework.
    if (ok.some((r) => r.record_type === "paste_flag")) {
      const homework = await myHomework(sid);
      if (homework) return { saved, rejected, homework };
    }
    return { saved, rejected };
  },

  async mark_passed(sid, body) {
    const { unit, fingerprint } = body;
    if (!UNITS.includes(unit as string) || typeof fingerprint !== "string" || !fingerprint || fingerprint.length > 500) throw bad();
    check(await db().from("passed_tasks").upsert({ student_id: sid, unit, fingerprint },
      { onConflict: "student_id,unit,fingerprint", ignoreDuplicates: true }), "mark passed");
  },

  // The PIN is checked as resume checks it (pin_try_begin counts the try first; 5 wrong in a row lock the account for
  // 15 minutes), and the nickname as at join: the same rules and word filter (_shared/nickname.ts), and no other
  // student in the class with it (ignoring capitals). A wrong PIN is 403, not 401, so the app doesn't sign the student out.
  async rename_me(sid, body) {
    const pin = typeof body.pin === "string" ? body.pin.trim() : "";
    if (typeof body.nickname !== "string") throw bad();
    const nickname = body.nickname.trim();
    if (!/^\d{4}$/.test(pin)) throw new HttpError(403, WRONG_PIN, { problem: "pin" });
    const s = check(await db().from("students").select("id, class_id, pin_hash").eq("id", sid).single(), "student");
    const t = check(await db().rpc("pin_try_begin", { p_student: sid }).single(), "pin try") as { allowed: boolean; locked_until: string | null };
    if (!t.allowed || !(await pinMatches(pin, s.pin_hash as string))) {
      const minutes = t.locked_until ? Math.max(1, Math.ceil((Date.parse(t.locked_until) - Date.now()) / 60000)) : 0;
      throw new HttpError(403, minutes ? "Too many wrong PINs. Try again in " + minutes + (minutes === 1 ? " minute." : " minutes.") : WRONG_PIN, { problem: "pin" });
    }
    check(await db().rpc("pin_try_succeeded", { p_student: sid }), "pin ok");
    if (!validNickname(nickname)) throw new HttpError(400, NICKNAME_RULES, { problem: "invalid" });
    if (nicknameBlocked(nickname)) throw new HttpError(400, NAME_BLOCKED, { problem: "blocked" });
    const others = check(await db().from("students").select("id, nickname").eq("class_id", s.class_id), "students") as unknown as { id: string; nickname: string }[];
    if (others.some((o) => o.id !== sid && o.nickname.toLowerCase() === nickname.toLowerCase())) throw new HttpError(400, NAME_TAKEN, { problem: "taken" });
    const u = await db().from("students").update({ nickname }).eq("id", sid);
    if (u.error && u.error.code === "23505") throw new HttpError(400, NAME_TAKEN, { problem: "taken" });
    check(u, "rename me");
    return { nickname };
  },

  // The student's own class's two boards (worked out here: a student can't read other students' rows). The class is
  // always the student's own: nothing in the request can name another. Each row has only the nickname, the combined
  // points, the percentage and whether it is the student's own; "me" adds their own secured, level, programme and
  // re-secure bonus totals, programme count, combined total and gain (points-server.js studentBoard).
  async leaderboard(sid) {
    return studentBoard(await classPoints(await classOf(sid)), sid);
  },

  async delete_my_progress(sid) {
    check(await db().from("students").delete().eq("id", sid), "delete student");
    return { deleted: true, message: "Everything saved for you has been deleted. To practise again, join your class again with the class code." };
  },
};

serve(async (body) => {
  const sid = await verifyToken(body.token);
  if (!sid) throw new HttpError(401, SIGNED_OUT);
  const action = actions[body.action as string];
  if (!action || !Object.hasOwn(actions, body.action as string)) throw bad();
  // The student may have been deleted (by a teacher, or their class ended) since the token was made.
  const exists = check(await db().from("students").select("id").eq("id", sid).maybeSingle(), "student");
  if (!exists) throw new HttpError(401, SIGNED_OUT);
  return await action(sid, body);
});
