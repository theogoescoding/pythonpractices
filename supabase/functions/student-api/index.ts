// student-api: POST { token, action, ... }. Every call checks the session token from resume or join-class.
//   get_progress                       -> { student, progress: [{ unit, state }], passed: [{ unit, fingerprint }], attempts: [...],
//                                           assignments: [{ id, title, description, task_ids, updated_at }] (open ones of their class) }
//   save_progress { unit, state }      one unit's saved state (as the app keeps it in progress.units[unit], or progress.endless)
//   add_attempts { rows }              -> { saved, rejected }  rows use the attempts table's (the export's) column names
//   add_events { rows }                -> { saved, rejected }
//   mark_passed { unit, fingerprint }
//   delete_my_progress                 deletes the student and everything saved for them

import { lookupHash, verifyToken } from "../_shared/crypto.ts";
import { check, db, HttpError, serve } from "../_shared/http.ts";
import { checkAttempts, checkEvents, insertRows, PROGRESS_UNITS, Rejected, UNITS } from "../_shared/rows.ts";

const SIGNED_OUT = "You've been signed out. Please sign in again with your code and PIN.";
const MAX_STATE_CHARS = 900_000;
const STUDENT_EVENT_TYPES = ["level_change", "button_use", "placement_result"];
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

// The open assignments of a class, newest first. Closed ones are never sent to students.
async function openAssignments(classId: string) {
  return check(await db().from("assignments").select("id, title, description, task_ids, updated_at")
    .eq("class_id", classId).eq("status", "open").order("created_at", { ascending: false }), "assignments");
}

const actions: Record<string, (sid: string, body: Record<string, unknown>) => Promise<unknown>> = {
  async get_progress(sid) {
    const student = check(await db().from("students").select("nickname, class_id, classes(name)").eq("id", sid).single(), "student");
    const cls = student.classes as unknown as { name: string } | null;
    return {
      student: { nickname: student.nickname, class_name: cls?.name ?? "" },
      progress: await allRows("progress", "unit, state", sid, "unit"),
      passed: await allRows("passed_tasks", "unit, fingerprint", sid, "created_at"),
      attempts: await allRows("attempts", ATTEMPT_COLUMNS, sid, "id"),
      assignments: await openAssignments(student.class_id as string),
    };
  },

  async get_assignments(sid) {
    return { assignments: await openAssignments(await classOf(sid)) };
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
    return { saved: await insertRows("attempts", ok, rejected), rejected };
  },

  async add_events(sid, body) {
    const checked = checkEvents(body.rows, STUDENT_EVENT_TYPES);
    if (!checked) throw bad();
    for (const r of checked.ok) r.student_id = sid;
    const rejected: Rejected[] = checked.rejected;
    return { saved: await insertRows("events", checked.ok, rejected), rejected };
  },

  async mark_passed(sid, body) {
    const { unit, fingerprint } = body;
    if (!UNITS.includes(unit as string) || typeof fingerprint !== "string" || !fingerprint || fingerprint.length > 500) throw bad();
    check(await db().from("passed_tasks").upsert({ student_id: sid, unit, fingerprint },
      { onConflict: "student_id,unit,fingerprint", ignoreDuplicates: true }), "mark passed");
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
