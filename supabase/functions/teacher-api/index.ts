// teacher-api: POST { action, ... } with the teacher's Supabase Auth token in the Authorization header.
// Every action checks that the signed-in teacher is on the class (its owner or a co-teacher, migration 0016), or on
// the student's class. A co-teacher has the same rights here as the owner, except adding and removing co-teachers.
//   list_co_teachers { class_id }           -> { teachers: [{ teacher_id, name, email, owner, added_at }], you_own, you }
//   add_co_teacher { class_id, email }      -> { added, teachers }  owner only; the email of an existing teacher account
//                                              (404, problem "unknown": "No teacher account with that email.")
//   remove_co_teacher { class_id, teacher_id } -> { removed, teachers }  owner only; the owner can't be removed
//   certificates_for_class { class_id }     -> { class_name, certificates: [{ student_name, class_name, block_name, earned_on }] }
//   certificate_for_student { student_id }  -> the same, for one student. Both save any newly earned certificate first.
//   list_homework { class_id }              -> { class_name, homework: [{ id, task_count, due_on, units, created_at, created_by_name, yours,
//                                              students, complete }] }  (migration 0018; the counting rule is homework.js's)
//   create_homework { class_id, task_count, due_on, units } -> the same as list_homework, with the new one in it
//                                              (400 with problem count | due | units if the form needs fixing)
//   delete_homework { homework_id }         -> { deleted }  its creator or any other teacher on the class
//   homework_report { homework_id }         -> { class_name, homework, students: [{ student_name, done, task_count, complete, units,
//                                              flagged: [{ task_id, unit }] }] }  one row per student; flagged = "Possible AI use"
//   paste_flags_for_class { class_id }      -> { class_name, students: [{ student_id, student_name, units: [{ unit, flags: [{ id, at,
//                                              unit, taskId, phase, phaseFrom, lines, homework, next }] }] }] }  the large paste flags
//                                              (migrations 0018 and 0019), each with its next check on the task (paste-details.js)
//   reveal_codes { class_id }               -> { codes: [{ student_id, nickname, code }] }  (each reveal is logged)
//   reset_pin { student_id }                -> { pin }  (shown once; also clears a PIN lock)
//   reset_placement { student_id, unit }    -> { reset }  (false: the student hasn't started that unit)
//   rename_student { student_id, nickname } -> { nickname }  (the nickname rules and word filter, as for joining;
//                                              refused if another student in the class has that nickname)
//   leaderboards { class_id }               -> { boards: { overall, improving }, max }  one class, ranked by points;
//                                              each row { rank, nickname, points, percent }
//   leaderboards_all                        -> { boards: { overall, improving }, classes }  every class this teacher is on (own and shared),
//                                              ranked by the percentage; each row { rank, nickname, class_name, points, percent }
// Importing a full export (section 8) takes three steps, so a big class fits the Edge Function time limit:
//   import_check { class_id, students: [{ file_id, nickname }] }
//       -> { ok, students: [{ file_id, nickname, status, message }] }. Saves nothing.
//          status: new | existing (rows go to the student already in the class with that nickname)
//                  | invalid | blocked | duplicate (two students in the file with the same nickname) – these must be renamed.
//   import_students { class_id, students }  (at most 10) -> { students: [{ file_id, student_id, nickname, new, code?, pin? }] }
//       Refuses everything if any nickname would be flagged by import_check.
//   import_data { class_id, progress, passed, attempts, events }  rows keyed by student_id (from import_students)
//       -> counts of rows saved and skipped. Safe to send twice: a row already there (same student, task, time and
//          record type) is skipped, and progress is only written for units the student hasn't got yet.

import { decryptCode, hashPin, lookupHash, newPin } from "../_shared/crypto.ts";
import { check, db, HttpError, serve } from "../_shared/http.ts";
import { NICKNAME_RULES, nicknameBlocked, validNickname } from "../_shared/nickname.ts";
import { boards, classPoints, POINT_UNITS } from "../_shared/points.ts";
import { checkAttempts, checkEvents, insertRows, MAX_ROWS_PER_BATCH, PROGRESS_UNITS, Rejected, UNITS } from "../_shared/rows.ts";
import { createStudent } from "../_shared/students.ts";
import "../_shared/class-sharing.js";
// The certificate rule is the site's own (certificates.js, which uses secured.js and curriculum.js; points.ts above
// has loaded those two already, and they are imported again here so the order is plain).
import "../../../curriculum.js";
import "../../../secured.js";
import "../../../certificates.js";
import "../_shared/certificates-server.js";
// The homework rule is the site's own too (homework.js), read and saved by homework-server.js.
import "../../../homework.js";
import "../_shared/homework-server.js";
// The paste flag details too (paste-details.js), read by paste-flags-server.js.
import "../../../paste-details.js";
import "../_shared/paste-flags-server.js";

// class-sharing.js, certificates-server.js and homework-server.js are plain scripts (tests/backend-client.js runs the
// same files in Node): they set globalThis.ClassSharing, globalThis.CertificatesServer and globalThis.HomeworkServer.
// deno-lint-ignore no-explicit-any
const G = globalThis as any;
const Sharing = G.ClassSharing;
const CertificatesServer = G.CertificatesServer;
const HomeworkServer = G.HomeworkServer;
const certDeps = () => ({ Sharing, Certificates: G.Certificates, Curriculum: G.Curriculum });
const hwDeps = () => ({ Sharing, Homework: G.Homework, unitIds: UNITS });

const bad = () => new HttpError(400, "Something went wrong. Please try again.");
const MAX_IMPORT_STUDENTS_PER_CALL = 10;
const CODE_KEPT_DAYS = 30;

async function teacherId(req: Request): Promise<string> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) throw new HttpError(401, "Please sign in again.");
  const { data, error } = await db().auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, "Please sign in again.");
  return data.user.id;
}

// A class or student this teacher is on: as its owner (classes.teacher_id) or as a co-teacher (class_teachers,
// migration 0016). Both have the same rights here. Otherwise 404 ("That class or student wasn't found."), so a stranger can't tell it exists.
async function ownClass(tid: string, classId: unknown): Promise<string> {
  return (await Sharing.requireClass(db(), tid, classId, false)).id;
}

async function ownStudent(tid: string, studentId: unknown): Promise<{ id: string; class_id: string }> {
  return await Sharing.requireStudent(db(), tid, studentId);
}

// ---------- Import names ----------
type FileStudent = { file_id: string; nickname: string };

function fileStudents(v: unknown, max: number): FileStudent[] {
  if (!Array.isArray(v) || v.length > max) throw bad();
  return v.map((s) => {
    if (!s || typeof s.file_id !== "string" || typeof s.nickname !== "string" || s.file_id.length > 100) throw bad();
    return { file_id: s.file_id, nickname: s.nickname.trim() }; // spaces at the ends are trimmed; nothing else changes
  });
}

// What import_check reports. Every name is checked against the class and against the rest of the file.
async function checkNames(classId: string, students: FileStudent[], allFileNames?: string[]) {
  const existing = check(await db().from("students").select("id, nickname").eq("class_id", classId), "students") as
    { id: string; nickname: string }[];
  const inClass = new Map(existing.map((s) => [s.nickname.toLowerCase(), s.id]));
  const counts = new Map<string, number>();
  for (const n of allFileNames ?? students.map((s) => s.nickname)) counts.set(n.toLowerCase(), (counts.get(n.toLowerCase()) || 0) + 1);
  const result = students.map((s) => {
    const key = s.nickname.toLowerCase();
    const r = (status: string, message: string, student_id?: string) => ({ ...s, status, message, student_id });
    if (!validNickname(s.nickname)) return r("invalid", NICKNAME_RULES);
    if (nicknameBlocked(s.nickname)) return r("blocked", "This nickname isn't allowed. Please choose another.");
    if ((counts.get(key) || 0) > 1) return r("duplicate", "Another student in the file has this nickname. Rename one of them.");
    if (inClass.has(key)) return r("existing", "Already in this class: the rows are added to that student.", inClass.get(key));
    return r("new", "A new student will be made, with a login code and PIN.");
  });
  return { ok: result.every((s) => s.status === "new" || s.status === "existing"), students: result };
}

// ---------- Import rows ----------
const timeKey = (t: unknown) => String(Date.parse(String(t)));
const rowKey = (r: Record<string, unknown>) =>
  [r.student_id, r.record_type, timeKey(r.timestamp), r.task_id ?? "", r.unit].join("|");

// Keys of the rows these students already have, so a second import skips them (student, task, time and record type).
async function existingKeys(table: "attempts" | "events", studentIds: string[]) {
  const keys = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const page = check(await db().from(table).select("student_id, record_type, timestamp, task_id, unit")
      .in("student_id", studentIds).order("id").range(from, from + 999), "existing " + table) as Record<string, unknown>[];
    page.forEach((r) => keys.add(rowKey(r)));
    if (page.length < 1000) return keys;
  }
}

async function importRows(table: "attempts" | "events", rows: Record<string, unknown>[], allowed: Set<string>) {
  const rejected: Rejected[] = [];
  const mine = rows.filter((r) => {
    if (allowed.has(r.student_id as string)) return true;
    rejected.push({ record_id: r.record_id, reason: "not a student in this class" });
    return false;
  });
  const have = await existingKeys(table, [...allowed]);
  const fresh: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const r of mine) {
    const k = rowKey(r);
    if (have.has(k)) { skipped++; continue; }
    have.add(k); // the same row twice in one file
    fresh.push(r);
  }
  return { saved: await insertRows(table, fresh, rejected), skipped, rejected };
}

const actions: Record<string, (tid: string, body: Record<string, unknown>) => Promise<unknown>> = {
  async reveal_codes(tid, body) {
    const classId = await ownClass(tid, body.class_id);
    const students = check(await db().from("students").select("id, nickname, login_code_enc").eq("class_id", classId)
      .order("nickname"), "students") as { id: string; nickname: string; login_code_enc: string }[];
    if (students.length) {
      check(await db().from("code_reveals").insert(students.map((s) => ({ teacher_id: tid, class_id: classId, student_id: s.id }))),
        "log reveal");
    }
    return { codes: await Promise.all(students.map(async (s) => ({ student_id: s.id, nickname: s.nickname, code: await decryptCode(s.login_code_enc) }))) };
  },

  async reset_pin(tid, body) {
    const s = await ownStudent(tid, body.student_id);
    const pin = newPin();
    check(await db().from("students").update({ pin_hash: await hashPin(pin), failed_pins: 0, locked_until: null }).eq("id", s.id), "reset pin");
    return { pin };
  },

  async reset_placement(tid, body) {
    const s = await ownStudent(tid, body.student_id);
    if (!UNITS.includes(body.unit as string)) throw bad();
    return { reset: check(await db().rpc("reset_placement", { p_teacher: tid, p_student: s.id, p_unit: body.unit }), "reset placement") };
  },

  // The leaderboards (_shared/points.ts, the site's own rule in secured.js). Rows carry only the nickname, the class
  // name (all classes), the points and the percentage.
  async leaderboards(tid, body) {
    const classId = await ownClass(tid, body.class_id);
    const all = await classPoints(classId);
    return { boards: boards(all.map((s) => ({ nickname: s.nickname, total: s.total, gain: s.gain, unitCount: s.unitCount })), false), max: 300 * POINT_UNITS.length };
  },

  // Every class this teacher is on (their own and the ones shared with them), ranked by the percentage:
  // points / (300 x units) x 100.
  async leaderboards_all(tid) {
    const classes = await Sharing.myClasses(db(), tid) as { id: string; name: string }[];
    const rows = [];
    for (const c of classes) for (const s of await classPoints(c.id)) rows.push({ nickname: s.nickname, class_name: c.name, total: s.total, gain: s.gain, unitCount: s.unitCount });
    return { boards: boards(rows, true), classes: classes.length, max: 300 * POINT_UNITS.length };
  },

  // Certificates (certificates-server.js, migration 0017): works out what each student has earned, saves any new
  // certificate (one per student per block, kept once earned) and returns the saved ones. Any teacher on the class.
  async certificates_for_class(tid, body) {
    return await CertificatesServer.classCertificates(db(), certDeps(), tid, body.class_id);
  },

  async certificate_for_student(tid, body) {
    return await CertificatesServer.studentCertificates(db(), certDeps(), tid, body.student_id);
  },

  // Homework (homework-server.js, migration 0018). Any teacher on the class, owner or co-teacher, for every action.
  async list_homework(tid, body) {
    return await HomeworkServer.listForClass(db(), hwDeps(), tid, body.class_id);
  },

  async create_homework(tid, body) {
    return await HomeworkServer.create(db(), hwDeps(), tid, body.class_id, { task_count: body.task_count, due_on: body.due_on, units: body.units });
  },

  async delete_homework(tid, body) {
    return await HomeworkServer.remove(db(), hwDeps(), tid, body.homework_id);
  },

  async homework_report(tid, body) {
    return await HomeworkServer.report(db(), hwDeps(), tid, body.homework_id);
  },

  // Large paste flags for the Students page (paste-flags-server.js). Any teacher on the class, owner or co-teacher.
  async paste_flags_for_class(tid, body) {
    return await G.PasteFlagsServer.forClass(db(), { Sharing, PasteDetails: G.PasteDetails }, tid, body.class_id);
  },

  // Sharing a class (class-sharing.js). Any teacher on the class can list its teachers; only its owner can add one
  // (by the email of an existing teacher account) or remove one, and the owner can't be removed.
  async list_co_teachers(tid, body) {
    return await Sharing.listCoTeachers(db(), tid, body.class_id);
  },

  async add_co_teacher(tid, body) {
    return await Sharing.addCoTeacher(db(), tid, body.class_id, body.email);
  },

  async remove_co_teacher(tid, body) {
    return await Sharing.removeCoTeacher(db(), tid, body.class_id, body.teacher_id);
  },

  async rename_student(tid, body) {
    const s = await ownStudent(tid, body.student_id);
    if (typeof body.nickname !== "string") throw bad();
    const nickname = body.nickname.trim();
    if (!validNickname(nickname)) throw new HttpError(400, NICKNAME_RULES, { problem: "invalid" });
    if (nicknameBlocked(nickname)) throw new HttpError(400, "This nickname isn't allowed. Please choose another.", { problem: "blocked" });
    const others = check(await db().from("students").select("id, nickname").eq("class_id", s.class_id), "students") as { id: string; nickname: string }[];
    if (others.some((o) => o.id !== s.id && o.nickname.toLowerCase() === nickname.toLowerCase()))
      throw new HttpError(400, "Another student in this class already has that nickname.", { problem: "taken" });
    check(await db().from("students").update({ nickname }).eq("id", s.id), "rename student");
    return { nickname };
  },

  async import_check(tid, body) {
    const classId = await ownClass(tid, body.class_id);
    return await checkNames(classId, fileStudents(body.students, 1000));
  },

  async import_students(tid, body) {
    const classId = await ownClass(tid, body.class_id);
    const students = fileStudents(body.students, MAX_IMPORT_STUDENTS_PER_CALL);
    const all = Array.isArray(body.all_nicknames) && body.all_nicknames.every((n) => typeof n === "string")
      ? (body.all_nicknames as string[]).map((n) => n.trim()) : undefined;
    const checked = await checkNames(classId, students, all);
    if (!checked.ok) throw new HttpError(400, "Some nicknames need changing first. Nothing was saved.", { students: checked.students });
    const out = [];
    for (const s of checked.students) {
      if (s.status === "existing") { out.push({ file_id: s.file_id, student_id: s.student_id, nickname: s.nickname, new: false }); continue; }
      const made = await createStudent(classId, s.nickname, true);
      out.push({ file_id: s.file_id, student_id: made.id, nickname: s.nickname, new: true, code: made.code, pin: made.pin });
    }
    return { students: out };
  },

  async import_data(tid, body) {
    const classId = await ownClass(tid, body.class_id);
    const ids = new Set((check(await db().from("students").select("id").eq("class_id", classId), "students") as { id: string }[]).map((s) => s.id));
    const list = (v: unknown) => {
      if (v === undefined) return [];
      if (!Array.isArray(v) || v.length > MAX_ROWS_PER_BATCH) throw bad();
      return v as Record<string, unknown>[];
    };

    // Progress: only for units the student hasn't got, so a second import (or a student who has practised since) is safe.
    const progress = list(body.progress).filter((p) => ids.has(p.student_id as string) && PROGRESS_UNITS.includes(p.unit as string) &&
      p.state && typeof p.state === "object" && !Array.isArray(p.state));
    const progressSaved = progress.length ? (check(await db().from("progress").upsert(
      progress.map((p) => ({ student_id: p.student_id, unit: p.unit, state: p.state })),
      { onConflict: "student_id,unit", ignoreDuplicates: true }).select("unit"), "import progress") as unknown[]).length : 0;

    const passed = list(body.passed).filter((p) => ids.has(p.student_id as string) && UNITS.includes(p.unit as string) &&
      typeof p.fingerprint === "string" && p.fingerprint && (p.fingerprint as string).length <= 500);
    const passedSaved = passed.length ? (check(await db().from("passed_tasks").upsert(
      passed.map((p) => ({ student_id: p.student_id, unit: p.unit, fingerprint: p.fingerprint })),
      { onConflict: "student_id,unit,fingerprint", ignoreDuplicates: true }).select("unit"), "import passed") as unknown[]).length : 0;

    // Attempts and events: the same checks as the app's own rows, with the student id from import_students.
    const withStudent = (rows: Record<string, unknown>[]) => rows.map(({ student_id, ...r }) => ({ r, student_id }));
    const a = withStudent(list(body.attempts));
    const ac = checkAttempts(a.map((x) => x.r))!;
    const attemptRows = ac.ok.map((r) => ({ ...r, student_id: a.find((x) => x.r === r)!.student_id }));
    // Code is kept 30 days from when it was written, not from the import, so older code arrives already cleared.
    const cutoff = Date.now() - CODE_KEPT_DAYS * 86400000;
    for (const r of attemptRows as Record<string, unknown>[]) {
      r.code_hash = typeof r.student_code === "string" && r.student_code ? await lookupHash("code", r.student_code) : null;
      if (r.student_code != null && Date.parse(String(r.timestamp)) < cutoff) {
        Object.assign(r, { student_code: null, student_output: null, code_deleted_at: new Date().toISOString() });
      }
    }
    const e = withStudent(list(body.events));
    const ec = checkEvents(e.map((x) => x.r), ["level_change", "button_use", "placement_result", "placement_reset"])!;
    const eventRows = ec.ok.map((r) => ({ ...r, student_id: e.find((x) => x.r === r)!.student_id }));
    const attempts = await importRows("attempts", attemptRows, ids);
    const events = await importRows("events", eventRows, ids);
    attempts.rejected.unshift(...ac.rejected);
    events.rejected.unshift(...ec.rejected);
    return {
      progress: { saved: progressSaved, skipped: progress.length - progressSaved },
      passed: { saved: passedSaved, skipped: passed.length - passedSaved },
      attempts, events,
    };
  },
};

serve(async (body, req) => {
  const tid = await teacherId(req);
  const action = body.action as string;
  if (!Object.hasOwn(actions, action)) throw bad();
  try {
    return await actions[action](tid, body);
  } catch (e) {
    // class-sharing.js's problems (not on the class, owner only, unknown email...) become the usual error replies.
    if (e instanceof Sharing.Problem) throw new HttpError(e.status, e.message, e.problem ? { problem: e.problem } : {});
    throw e;
  }
});
