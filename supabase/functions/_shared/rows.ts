// Checks attempt and event rows sent by the app (student-api add_attempts / add_events, teacher-api import).
// Rows use the table's column names (the full export's). Unknown columns or wrong types reject that row only, so
// one bad row can't block the rest of a student's queue. The database's own checks back these up.

import { check, db } from "./http.ts";

// Keep in step with the unit checks in the migrations (0006 added data-types; 0007 strings, random and lists;
// 0008 functions-basic, functions-return, file-handling and arrays-2d; 0009 validation and authentication; 0010
// trace-tables and the five searching and sorting units; 0011 the seven A-level programming techniques units; 0012
// the five A-level data structures units).
export const UNITS = ["output", "variables", "maths", "selection", "loops-condition", "loops-count", "data-types", "strings", "random", "lists",
  "functions-basic", "functions-return", "file-handling", "arrays-2d", "validation", "authentication",
  "trace-tables", "linear-search", "binary-search", "bubble-sort", "insertion-sort", "merge-sort",
  "recursion", "scope-parameters", "oop-classes", "oop-methods", "oop-encapsulation", "oop-inheritance", "debugging",
  "records-tuples", "stacks-queues", "linked-lists", "hash-tables", "arrays-3d"];
export const PROGRESS_UNITS = [...UNITS, "endless"];
export const MAX_ROWS_PER_BATCH = 500;
const MAX_STORED_TEXT = 2000; // as store.js: code and output are cut to this many characters

type Kind = "text" | "int" | "time" | "json" | "texts";
type Spec = Record<string, { kind: Kind; required?: boolean; max?: number }>;

const ATTEMPT: Spec = {
  record_id: { kind: "text", required: true, max: 60 },
  record_type: { kind: "text", required: true },
  timestamp: { kind: "time", required: true },
  unit: { kind: "text", required: true },
  task_units: { kind: "texts" },
  task_id: { kind: "text", required: true, max: 200 },
  template_id: { kind: "text", max: 200 },
  phase: { kind: "text" },
  task_type: { kind: "text" },
  task_level: { kind: "int" },
  student_level_before: { kind: "int" },
  student_level_after: { kind: "int" },
  attempt_number: { kind: "int" },
  result: { kind: "text", required: true },
  failure_category: { kind: "text", max: 40 },
  failure_details: { kind: "json" },
  misconception_matches: { kind: "texts" },
  hints_used: { kind: "int" },
  hint_type: { kind: "text", max: 40 },
  variant_fingerprint: { kind: "text", max: 500 },
  failed_test_number: { kind: "int" },
  failed_test_inputs: { kind: "json" },
  expected_output: { kind: "text", max: 20000 },
  student_output: { kind: "text" },
  student_error_type: { kind: "text", max: 100 },
  student_error_kind: { kind: "text", max: 100 },
  student_code: { kind: "text" },
  assignment_id: { kind: "text", max: 40 }, // a class assignment (phase assignment); checked against the class by the caller
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EVENT: Spec = {
  record_id: { kind: "text", required: true, max: 60 },
  record_type: { kind: "text", required: true },
  timestamp: { kind: "time", required: true },
  unit: { kind: "text", required: true },
  task_id: { kind: "text", max: 200 },
  student_level_before: { kind: "int" },
  student_level_after: { kind: "int" },
  level_change_reason: { kind: "text" },
  button: { kind: "text" },
  placement_start_level: { kind: "int" },
  placement_results: { kind: "json" },
};

const clip = (s: string) => (s.length > MAX_STORED_TEXT ? s.slice(0, MAX_STORED_TEXT) + "\n…(cut short)" : s);

function checkValue(kind: Kind, v: unknown, max?: number): boolean {
  if (v === null) return true;
  switch (kind) {
    case "text": return typeof v === "string" && (max === undefined || v.length <= max);
    case "int": return Number.isInteger(v);
    case "time": return typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v));
    case "texts": return Array.isArray(v) && v.length <= 50 && v.every((x) => typeof x === "string" && x.length <= 200);
    case "json": return JSON.stringify(v).length <= 20000;
  }
}

export type Rejected = { record_id: unknown; reason: string };

function checkRows(spec: Spec, rows: unknown, extra: (r: Record<string, unknown>) => string | null) {
  const ok: Record<string, unknown>[] = [];
  const rejected: Rejected[] = [];
  if (!Array.isArray(rows) || rows.length > MAX_ROWS_PER_BATCH) return null;
  for (const row of rows) {
    const id = row && typeof row === "object" ? (row as Record<string, unknown>).record_id : null;
    if (!row || typeof row !== "object" || Array.isArray(row)) { rejected.push({ record_id: id, reason: "not an object" }); continue; }
    const r = row as Record<string, unknown>;
    const bad = Object.keys(r).find((k) => !(k in spec)) ?? Object.entries(spec).find(([k, s]) =>
      (s.required && (r[k] === undefined || r[k] === null)) || (r[k] !== undefined && !checkValue(s.kind, r[k], s.max)))?.[0];
    if (bad) { rejected.push({ record_id: id, reason: "bad " + bad }); continue; }
    const reason = extra(r);
    if (reason) { rejected.push({ record_id: id, reason }); continue; }
    ok.push(r);
  }
  return { ok, rejected };
}

// Attempts: the unit must be a real unit, and code and output are cut as store.js cuts them.
// Only an assignment row may name an assignment (the database checks it is the student's class's). An assignment row
// may have none: an imported one, or one whose assignment was deleted.
export function checkAttempts(rows: unknown) {
  return checkRows(ATTEMPT, rows, (r) => {
    if (!UNITS.includes(r.unit as string)) return "bad unit";
    const aid = r.assignment_id;
    if (aid != null && !UUID.test(aid as string)) return "bad assignment_id";
    if (aid != null && r.phase !== "assignment") return "bad assignment_id";
    if (typeof r.student_code === "string") r.student_code = clip(r.student_code);
    if (typeof r.student_output === "string") r.student_output = clip(r.student_output);
    return null;
  });
}

// Adds the rows for one student. A row already stored (same record_id) is skipped, so a resent batch is harmless.
// If the database refuses the batch, each row is tried alone, so only the bad rows are rejected.
export async function insertRows(table: "attempts" | "events", rows: Record<string, unknown>[], rejected: Rejected[]) {
  if (!rows.length) return 0;
  const insert = (rs: Record<string, unknown>[]) =>
    db().from(table).upsert(rs, { onConflict: "student_id,record_id", ignoreDuplicates: true });
  const all = await insert(rows);
  if (!all.error) return rows.length;
  if (!/^(22|23)/.test(all.error.code || "")) check(all, "insert " + table); // not a data error: throw
  let saved = 0;
  for (const r of rows) {
    const one = await insert([r]);
    if (!one.error) saved++;
    else if (/^(22|23)/.test(one.error.code || "")) rejected.push({ record_id: r.record_id, reason: "refused by the database" });
    else check(one, "insert " + table);
  }
  return saved;
}

// Events: students may send every record type except placement_reset, which only a teacher makes.
export function checkEvents(rows: unknown, allowedTypes: string[]) {
  return checkRows(EVENT, rows, (r) => {
    if (!UNITS.includes(r.unit as string)) return "bad unit";
    if (!allowedTypes.includes(r.record_type as string)) return "bad record_type";
    return null;
  });
}
