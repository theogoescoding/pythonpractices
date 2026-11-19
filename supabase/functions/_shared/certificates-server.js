// Certificates on the server (teacher-api certificates_for_class and certificate_for_student, migration 0017).
// Works out what each student has earned with the site's own rule (certificates.js, which uses secured.js), saves any
// new certificate, and returns the class's saved ones. A plain script, like class-sharing.js, so the Deno function and
// the Node tests (tests/backend-client.js) run the same code. Every function takes the database client (the service
// role in teacher-api, a fake in the tests) and deps = { Sharing, Certificates, Curriculum }.
// Only the student's name, the class name, the block name and the earned date are returned: no ids, PINs, codes or
// attempt text.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CertificatesServer = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const PAGE = 1000;
  function data(r, what) {
    if (r.error) throw new Error(what + ": " + (r.error.code || "") + " " + r.error.message);
    return r.data;
  }
  // Every row a query returns, a page at a time (the API returns at most 1000 rows per request).
  async function all(query, what) {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      const page = data(await query().range(from, from + PAGE - 1), what);
      out.push(...page);
      if (page.length < PAGE) return out;
    }
  }

  // Works out and saves the certificates of these students (all of a class's, or one), then returns the saved ones.
  async function earnAndList(sb, deps, cls, students) {
    const { Certificates, Curriculum } = deps;
    if (!students.length) return [];
    const ids = students.map((s) => s.id);
    // Only passes that can count towards a floor (Secured.isTopPass checks the rest: the phase and level).
    const passes = await all(() => sb.from("attempts").select("id, student_id, unit, timestamp, phase, task_level, hints_used, hint_type, result, record_type")
      .in("student_id", ids).eq("record_type", "attempt").eq("result", "pass").eq("hints_used", 0).is("hint_type", null).order("id"), "read passes");
    // Whether each student has started the old unit(s): a saved progress row or any record in it.
    const old = Curriculum.OLD_UNITS;
    const started = new Set();
    if (old.length) {
      for (const p of await all(() => sb.from("progress").select("student_id, unit").in("student_id", ids).in("unit", old).order("student_id"), "read progress")) started.add(p.student_id + "|" + p.unit);
      for (const a of await all(() => sb.from("attempts").select("id, student_id, unit").in("student_id", ids).in("unit", old).order("id"), "read old attempts")) started.add(a.student_id + "|" + a.unit);
    }
    const earned = [];
    for (const s of students) {
      const attempts = passes.filter((a) => a.student_id === s.id).map((a) => ({ kind: a.record_type, unit: a.unit, at: a.timestamp, result: a.result,
        hints: a.hints_used, hintType: a.hint_type == null ? undefined : a.hint_type, phase: a.phase, taskLevel: a.task_level }));
      for (const c of Certificates.earnedBlocks(attempts, (u) => started.has(s.id + "|" + u))) earned.push({ student_id: s.id, block_id: c.block_id, block_name: c.block_name, earned_on: c.earned_on });
    }
    // New ones are added; one already saved keeps its first earned date (the unique student and block pair).
    if (earned.length) data(await sb.from("certificates").upsert(earned, { onConflict: "student_id,block_id", ignoreDuplicates: true }), "save certificates");
    const saved = await all(() => sb.from("certificates").select("student_id, block_id, block_name, earned_on").in("student_id", ids).order("student_id"), "read certificates");
    const order = (id) => { const i = Certificates.BLOCKS.findIndex((b) => b.id === id); return i < 0 ? Certificates.BLOCKS.length : i; };
    const name = (id) => (students.find((s) => s.id === id) || { nickname: "" }).nickname;
    return saved.sort((x, y) => name(x.student_id).localeCompare(name(y.student_id)) || order(x.block_id) - order(y.block_id))
      .map((c) => ({ student_name: name(c.student_id), class_name: cls.name, block_name: c.block_name, earned_on: c.earned_on }));
  }

  // Every student of a class this teacher is on (owner or co-teacher; otherwise the usual 404).
  async function classCertificates(sb, deps, tid, classId) {
    const cls = await deps.Sharing.requireClass(sb, tid, classId, false);
    const students = data(await sb.from("students").select("id, nickname").eq("class_id", cls.id).order("nickname"), "students");
    return { class_name: cls.name, certificates: await earnAndList(sb, deps, cls, students) };
  }

  // One student of a class this teacher is on.
  async function studentCertificates(sb, deps, tid, studentId) {
    const s = await deps.Sharing.requireStudent(sb, tid, studentId);
    const cls = await deps.Sharing.requireClass(sb, tid, s.class_id, false);
    const students = data(await sb.from("students").select("id, nickname").eq("id", s.id), "student");
    return { class_name: cls.name, certificates: await earnAndList(sb, deps, cls, students) };
  }

  return { classCertificates, studentCertificates, earnAndList };
});
