// The details of each large paste flag (paste-flag.js), as the teacher's Students page shows them. One rule, used by
// teacher-api (paste_flags_for_class, through supabase/functions/_shared/paste-flags-server.js) and by the teacher
// view's local mode (teacher-data.js), so both always agree. No DOM here: tests/features.js checks it.
//   - The pasted text is never stored anywhere. The code shown is the code of the student's next check on the same
//     task after the paste: the earliest attempt (a Check press) or skip on that task id, strictly after the flag's time.
//     The site keeps code only for a failed check (and the server clears it after 30 days), so a passed check, a skip
//     or cleared code has no code, and the reason is given instead.
//   - Phase, lines and homework are stored with a flag from migration 0019 (and in this browser's store from then).
//     An older flag has none: lines and homework are "not recorded", and the phase is the next check's phase if there is
//     one (a check in an assignment or placement is in that phase; practice and endless likewise).
// A flag: { id, at, unit, taskId, phase (null: not recorded), lines (null: not recorded), homeworkId (null: none or not
//   recorded), recorded (true when the details were stored with it) }.
// An attempt: { at, taskId, kind ("attempt" | "skip" | "hint"), result ("pass" | "fail" | "skipped"), phase, code
//   (string, or null when not kept), codeDeleted (true when the server cleared it) }.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PasteDetails = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const PHASES = ["practice", "placement", "endless", "assignment"];
  const time = (t) => (typeof t === "number" ? t : Date.parse(t));
  const NO_CHECK = "No check since the paste yet.";
  const NOT_RECORDED = "Not recorded";
  const CODE_NOTES = {
    passed: "The site doesn't keep the code of a passed check, only of a failed one.",
    skipped: "The task was skipped, so there is no code.",
    deleted: "The code was deleted: it is kept for 30 days.",
  };

  // The student's earliest check (attempt or skip) on the flag's task after the flag, or null.
  function nextCheck(flag, attempts) {
    const t0 = time(flag.at);
    let best = null;
    for (const a of attempts || []) {
      if (a.taskId !== flag.taskId || (a.kind !== "attempt" && a.kind !== "skip")) continue;
      const t = time(a.at);
      if (!Number.isFinite(t) || !(t > t0)) continue;
      if (!best || t < best.t) best = { t, a };
    }
    if (!best) return null;
    const a = best.a;
    const result = a.kind === "skip" ? "skipped" : a.result === "pass" ? "passed" : "failed";
    const code = result === "failed" && typeof a.code === "string" && !a.codeDeleted ? a.code : null;
    const codeNote = result === "passed" ? CODE_NOTES.passed : result === "skipped" ? CODE_NOTES.skipped : code == null ? CODE_NOTES.deleted : null;
    return { at: new Date(best.t).toISOString(), result, phase: PHASES.includes(a.phase) ? a.phase : null, code, codeNote };
  }

  // One flag's details. homeworkDue: { homeworkId: "YYYY-MM-DD" } (the due dates of the homework the flags name).
  function describe(flag, attempts, homeworkDue) {
    const next = nextCheck(flag, attempts);
    const recorded = !!flag.recorded;
    const phase = recorded && PHASES.includes(flag.phase) ? flag.phase : next && next.phase ? next.phase : null;
    const phaseFrom = recorded && PHASES.includes(flag.phase) ? "recorded" : phase ? "next-check" : null;
    const homework = !recorded ? { recorded: false, inHomework: false, dueOn: null }
      : { recorded: true, inHomework: !!flag.homeworkId, dueOn: flag.homeworkId ? (homeworkDue || {})[flag.homeworkId] || null : null };
    return { id: flag.id, at: new Date(time(flag.at)).toISOString(), unit: flag.unit, taskId: flag.taskId, phase, phaseFrom,
      lines: recorded && Number.isInteger(flag.lines) && flag.lines > 0 ? flag.lines : null, homework, next };
  }

  // Every flag of one student, described and grouped by unit, newest first: { unit: [details] }.
  function byUnit(flags, attempts, homeworkDue) {
    const out = {};
    for (const f of flags || []) (out[f.unit] = out[f.unit] || []).push(describe(f, attempts, homeworkDue));
    for (const u of Object.keys(out)) out[u].sort((x, y) => time(y.at) - time(x.at));
    return out;
  }

  // "1 flag", "3 flags".
  const countText = (n) => n + " flag" + (n === 1 ? "" : "s");
  // Where the paste happened, as the dialog says it.
  function whereText(d) {
    if (d.homework.inHomework) return "Homework" + (d.phase ? " (" + d.phase + ")" : "");
    if (!d.phase) return NOT_RECORDED;
    return d.phase.charAt(0).toUpperCase() + d.phase.slice(1) + (d.phaseFrom === "next-check" ? " (worked out from the next check)" : "");
  }

  return { PHASES, NO_CHECK, NOT_RECORDED, CODE_NOTES, nextCheck, describe, byUnit, countText, whereText };
});
