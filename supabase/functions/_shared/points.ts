// Points and leaderboards (student-api leaderboard, teacher-api leaderboards). The rule is the site's own: secured.js
// (Secured.studentPoints, Secured.boards) with the units from curriculum.js, loaded here as they are in the browser,
// so the server and the pages can't disagree. Only nickname, class name (teacher views), points and percentages
// ever leave this file: no unit detail, attempts, codes or PINs.

import "../../../curriculum.js";
import "../../../secured.js";
import { check, db } from "./http.ts";

// deno-lint-ignore no-explicit-any
const G = globalThis as any;
const Secured = G.Secured;
const Curriculum = G.Curriculum;

// Every unit counts, whatever the class's stage (as on the teacher's Students page).
export const POINT_UNITS: { id: string; placement: boolean }[] = Curriculum.UNITS.map((u: { id: string }) => ({ id: u.id, placement: Curriculum.hasPlacement(u.id) }));
const NO_PLACEMENT = POINT_UNITS.filter((u) => !u.placement).map((u) => u.id);

type Row = Record<string, unknown>;

// Every row of a table for these students, a page at a time (the API returns at most 1000 rows per request).
// deno-lint-ignore no-explicit-any
async function rowsFor(table: string, columns: string, ids: string[], narrow: (q: any) => any): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const page = check(await narrow(db().from(table).select(columns).in("student_id", ids)).order("id").range(from, from + 999), "read " + table) as unknown as Row[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

// Each student of a class with their points: [{ id, nickname, total, gain, secured, level, unitCount }].
export async function classPoints(classId: string, now = Date.now()) {
  const students = check(await db().from("students").select("id, nickname").eq("class_id", classId), "students") as unknown as { id: string; nickname: string }[];
  if (!students.length) return [];
  const ids = students.map((s) => s.id);
  // The saved level and placement of each unit (generated columns: not the whole saved state).
  const progress: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const page = check(await db().from("progress").select("student_id, unit, level, placement").in("student_id", ids).neq("unit", "endless")
      .order("student_id").order("unit").range(from, from + 999), "read progress") as unknown as Row[];
    progress.push(...page);
    if (page.length < 1000) break;
  }
  // Only passes that can count towards a secured score (Secured.isTopPass checks the rest: the phase and level).
  const passes = await rowsFor("attempts", "student_id, unit, timestamp, phase, task_level, hints_used, hint_type, result, record_type", ids,
    (q) => q.eq("record_type", "attempt").eq("result", "pass").eq("hints_used", 0).is("hint_type", null));
  const events = await rowsFor("events", "student_id, unit, record_type, timestamp, student_level_after, placement_start_level", ids,
    (q) => q.in("record_type", ["level_change", "placement_result", "placement_reset"]));
  // A unit with no placement test is placed from the student's first record in it.
  const firsts = NO_PLACEMENT.length ? await rowsFor("attempts", "student_id, unit, timestamp", ids, (q) => q.in("unit", NO_PLACEMENT)) : [];

  return students.map((s) => {
    const current: Record<string, Row> = {};
    for (const p of progress) if (p.student_id === s.id) current[p.unit as string] = { level: p.level, placement: p.placement };
    const attempts = passes.filter((a) => a.student_id === s.id).map((a) => ({
      kind: a.record_type, unit: a.unit, at: a.timestamp, result: a.result, hints: a.hints_used, hintType: a.hint_type ?? undefined, phase: a.phase, taskLevel: a.task_level,
    }));
    const mine = events.filter((e) => e.student_id === s.id);
    const started: Record<string, string> = {};
    for (const a of firsts) if (a.student_id === s.id && (!started[a.unit as string] || Date.parse(a.timestamp as string) < Date.parse(started[a.unit as string]))) started[a.unit as string] = a.timestamp as string;
    for (const e of mine) if (NO_PLACEMENT.includes(e.unit as string) && (!started[e.unit as string] || Date.parse(e.timestamp as string) < Date.parse(started[e.unit as string]))) started[e.unit as string] = e.timestamp as string;
    const history = {
      levels: mine.filter((e) => e.record_type === "level_change").map((e) => ({ unit: e.unit, at: e.timestamp, to: e.student_level_after })),
      placements: mine.filter((e) => e.record_type !== "level_change").map((e) => ({ unit: e.unit, at: e.timestamp, kind: e.record_type === "placement_reset" ? "reset" : "result", startLevel: e.placement_start_level })),
      started,
    };
    const p = Secured.studentPoints({ units: POINT_UNITS, current, attempts, history, now });
    return { id: s.id, nickname: s.nickname, total: p.total, gain: p.gain, secured: p.secured, level: p.level, unitCount: POINT_UNITS.length };
  });
}

// The two boards (Secured.boards), with only the fields a board may show.
export const boards = (students: Row[], byPercent: boolean) => Secured.boards(students, byPercent);
