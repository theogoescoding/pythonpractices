// teacher-api: POST { action, ... } with the teacher's Supabase Auth token in the Authorization header.
// Every action checks that the class or student belongs to the signed-in teacher.
//   reveal_codes { class_id }               -> { codes: [{ student_id, nickname, code }] }  (each reveal is logged)
//   reset_pin { student_id }                -> { pin }  (shown once; also clears a PIN lock)
//   reset_placement { student_id, unit }    -> { reset }  (false: the student hasn't started that unit)
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
import { checkAttempts, checkEvents, insertRows, MAX_ROWS_PER_BATCH, PROGRESS_UNITS, Rejected, UNITS } from "../_shared/rows.ts";
import { createStudent } from "../_shared/students.ts";

const NOT_FOUND = "That class or student wasn't found.";
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

async function ownClass(tid: string, classId: unknown) {
  if (typeof classId !== "string" || !/^[0-9a-f-]{36}$/.test(classId)) throw new HttpError(404, NOT_FOUND);
  const c = check(await db().from("classes").select("id").eq("id", classId).eq("teacher_id", tid).maybeSingle(), "class");
  if (!c) throw new HttpError(404, NOT_FOUND);
  return classId;
}

async function ownStudent(tid: string, studentId: unknown) {
  if (typeof studentId !== "string" || !/^[0-9a-f-]{36}$/.test(studentId)) throw new HttpError(404, NOT_FOUND);
  const s = check(await db().from("students").select("id, class_id, classes!inner(teacher_id)").eq("id", studentId)
    .eq("classes.teacher_id", tid).maybeSingle(), "student");
  if (!s) throw new HttpError(404, NOT_FOUND);
  return s as { id: string; class_id: string };
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
  return await actions[action](tid, body);
});
