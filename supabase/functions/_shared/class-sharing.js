// Class sharing (migration 0016): who is on a class, and adding or removing co-teachers. Used by teacher-api.
// A plain script, like secured.js, so the Deno function (a side-effect import, then globalThis.ClassSharing) and the
// Node tests (require) run the same code. Every function takes the database client (the service role in teacher-api,
// a fake in tests/backend-client.js) and throws ClassSharing.Problem(status, message, problem) for the caller to show.
//   - The owner is classes.teacher_id. Every teacher on a class (the owner too) has a class_teachers row.
//   - Any teacher on a class may use it as the owner can, except: only the owner adds or removes co-teachers (and
//     deletes the class, which row-level security keeps to the owner). The owner can't be removed.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ClassSharing = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const MESSAGES = {
    notFound: "That class or student wasn't found.",
    ownerOnly: "Only the teacher who made this class can do that.",
    badEmail: "Type the other teacher's email address.",
    unknownEmail: "No teacher account with that email.",
    self: "You made this class, so you're already on it.",
    already: "That teacher is already on this class.",
    owner: "The teacher who made this class can't be removed.",
    notOn: "That teacher isn't on this class.",
  };
  const UUID = /^[0-9a-f-]{36}$/;
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  class Problem extends Error {
    constructor(status, message, problem) {
      super(message);
      this.status = status;
      this.problem = problem || null;
    }
  }

  function data(r, what) {
    if (r.error) throw new Error(what + ": " + (r.error.code || "") + " " + r.error.message);
    return r.data;
  }
  // A server where migration 0016 isn't applied yet has no class_teachers table: then only owners are on classes.
  const noTable = (e) => !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST202" || /class_teachers|class_teacher_list|teacher_by_email/.test(e.message || ""));

  // The ids of the classes this teacher is on as a co-teacher (or owner: their own rows are there too).
  async function memberClassIds(sb, tid) {
    const r = await sb.from("class_teachers").select("class_id").eq("teacher_id", tid);
    if (r.error && noTable(r.error)) return [];
    return data(r, "class teachers").map((x) => x.class_id);
  }

  // The class and this teacher's place on it: { id, name, ownerId, owner } or null when they aren't on it.
  async function onClass(sb, tid, classId) {
    if (typeof classId !== "string" || !UUID.test(classId)) return null;
    const c = data(await sb.from("classes").select("id, name, teacher_id").eq("id", classId).maybeSingle(), "class");
    if (!c) return null;
    const out = { id: c.id, name: c.name, ownerId: c.teacher_id, owner: c.teacher_id === tid };
    if (out.owner) return out;
    const r = await sb.from("class_teachers").select("class_id").eq("class_id", classId).eq("teacher_id", tid).maybeSingle();
    if (r.error && noTable(r.error)) return null;
    return data(r, "class teacher") ? out : null;
  }

  // Any teacher on the class (404 otherwise, so a stranger can't tell a class exists). ownerOnly: 403 for a co-teacher.
  async function requireClass(sb, tid, classId, ownerOnly) {
    const c = await onClass(sb, tid, classId);
    if (!c) throw new Problem(404, MESSAGES.notFound);
    if (ownerOnly && !c.owner) throw new Problem(403, MESSAGES.ownerOnly, "owner-only");
    return c;
  }

  // A student of a class this teacher is on: { id, class_id }.
  async function requireStudent(sb, tid, studentId) {
    if (typeof studentId !== "string" || !UUID.test(studentId)) throw new Problem(404, MESSAGES.notFound);
    const s = data(await sb.from("students").select("id, class_id").eq("id", studentId).maybeSingle(), "student");
    if (!s || !(await onClass(sb, tid, s.class_id))) throw new Problem(404, MESSAGES.notFound);
    return { id: s.id, class_id: s.class_id };
  }

  // Every class this teacher is on (their own and shared ones), by name: [{ id, name, owner }].
  async function myClasses(sb, tid) {
    const own = data(await sb.from("classes").select("id, name").eq("teacher_id", tid), "classes");
    const ownIds = own.map((c) => c.id);
    const sharedIds = (await memberClassIds(sb, tid)).filter((id) => !ownIds.includes(id));
    const shared = sharedIds.length ? data(await sb.from("classes").select("id, name").in("id", sharedIds), "shared classes") : [];
    return own.map((c) => ({ id: c.id, name: c.name, owner: true })).concat(shared.map((c) => ({ id: c.id, name: c.name, owner: false })))
      .sort((x, y) => x.name.localeCompare(y.name) || (x.id < y.id ? -1 : 1));
  }

  // The teachers on a class, owner first: [{ teacher_id, name, email, owner, added_at }].
  async function teacherList(sb, classId) {
    const rows = data(await sb.rpc("class_teacher_list", { p_class: classId }), "class teacher list") || [];
    return rows.map((r) => ({ teacher_id: r.teacher_id, name: r.name, email: r.email || "", owner: !!r.is_owner, added_at: r.added_at }));
  }

  async function listCoTeachers(sb, tid, classId) {
    const c = await requireClass(sb, tid, classId, false);
    return { teachers: await teacherList(sb, c.id), you_own: c.owner, you: tid };
  }

  // Owner only. The other teacher must already have a teacher account (a teachers row, made at their first sign-in).
  async function addCoTeacher(sb, tid, classId, email) {
    const c = await requireClass(sb, tid, classId, true);
    const e = typeof email === "string" ? email.trim() : "";
    if (!e || e.length > 320 || !EMAIL.test(e)) throw new Problem(400, MESSAGES.badEmail, "email");
    const found = (data(await sb.rpc("teacher_by_email", { p_email: e }), "teacher by email") || [])[0];
    if (!found) throw new Problem(404, MESSAGES.unknownEmail, "unknown");
    if (found.id === c.ownerId) throw new Problem(400, MESSAGES.self, "self");
    const r = await sb.from("class_teachers").insert({ class_id: c.id, teacher_id: found.id, added_by: tid });
    if (r.error && r.error.code === "23505") throw new Problem(400, MESSAGES.already, "already");
    data(r, "add co-teacher");
    return { added: { teacher_id: found.id, name: found.name }, teachers: await teacherList(sb, c.id) };
  }

  // Owner only. The owner's own row can't be removed (the class would have no owner on its list).
  async function removeCoTeacher(sb, tid, classId, teacherId) {
    const c = await requireClass(sb, tid, classId, true);
    if (typeof teacherId !== "string" || !UUID.test(teacherId)) throw new Problem(404, MESSAGES.notOn, "not-on");
    if (teacherId === c.ownerId) throw new Problem(400, MESSAGES.owner, "owner");
    const gone = data(await sb.from("class_teachers").delete().eq("class_id", c.id).eq("teacher_id", teacherId).select("teacher_id"), "remove co-teacher");
    if (!gone || !gone.length) throw new Problem(404, MESSAGES.notOn, "not-on");
    return { removed: teacherId, teachers: await teacherList(sb, c.id) };
  }

  return { MESSAGES, Problem, onClass, requireClass, requireStudent, myClasses, memberClassIds, teacherList, listCoTeachers, addCoTeacher, removeCoTeacher };
});
