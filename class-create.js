// Creating classes (backend mode): the one place for it, used by the Classes page's "Create class" form and by
// "Create several classes" (prompt 26), so both follow the same rules. A plain script: teacher-backend.js uses it in
// the browser, and tests/backend-client.js and tests/features.js run it in Node.
//
// A class is made straight through Supabase, as the teacher (no server action): row-level security (migration 0002)
// lets a teacher insert only classes whose teacher_id is their own, teacher_id defaults to the signed-in teacher, and
// the teacher may send only name, end_of_year and stage (0002 and 0014's column grants). The database gives each new
// class its own class code (private.set_class_code) and adds its owner to its teachers (0016). Nothing here can make a
// class in another teacher's name: the row sent never has a teacher_id.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ClassCreate = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const MAX_BATCH = 10;    // classes in one "Create several classes"
  const MAX_NAME = 100;    // characters in a class name (the form's maxlength)

  // A server without migration 0013 has no classes.stage column.
  const noStage = (e) => !!e && (e.code === "42703" || e.code === "PGRST204" || /stage/.test(e.message || ""));

  // One class. stageOnServer: whether the server stores a class's stage (false once a server without 0013 said no).
  // -> { ok, id, class_code, reason (the server's, when it refused), stageOnServer (for next time), stageRefused }
  async function createClass(sb, name, stage, stageOnServer) {
    const make = (row) => sb.from("classes").insert(row).select("id, class_code").single();
    let onServer = stageOnServer !== false;
    let r = await make(onServer ? { name, stage } : { name });
    if (r.error && noStage(r.error)) { onServer = false; r = await make({ name }); }
    // A server with migration 0013 but not 0014 refuses the stage column (permission denied, 42501): make the class
    // without it (GCSE, the column's default), so a class can still be made.
    let stageRefused = false;
    if (r.error && r.error.code === "42501" && onServer) { stageRefused = true; r = await make({ name }); }
    if (r.error) return { ok: false, reason: r.error.message || r.error.code || "", stageOnServer: onServer, stageRefused };
    return { ok: true, id: r.data.id, class_code: r.data.class_code, stageOnServer: onServer, stageRefused };
  }

  // "Create several classes": the names typed (separated by commas or new lines), checked before anything is made.
  // existing: the names of the classes the teacher already has. Names are compared ignoring capitals and extra spaces.
  // -> { names (to make, in order), refused: [{ name, reason }] }. At most MAX_BATCH names are made; any after the
  //    tenth are refused, as are names listed twice, names the teacher already has and names that are too long.
  const key = (n) => n.replace(/\s+/g, " ").trim().toLowerCase();
  function planBatch(text, existing) {
    const have = new Set((existing || []).map(key));
    const seen = new Set();
    const names = [], refused = [];
    for (const raw of String(text || "").split(/[,\n\r]+/)) {
      const name = raw.replace(/\s+/g, " ").trim();
      if (!name) continue;
      if (name.length > MAX_NAME) refused.push({ name, reason: "the name is longer than " + MAX_NAME + " characters" });
      else if (seen.has(key(name))) refused.push({ name, reason: "it is in the list twice" });
      else if (have.has(key(name))) refused.push({ name, reason: "you already have a class with this name" });
      else if (names.length >= MAX_BATCH) refused.push({ name, reason: "only " + MAX_BATCH + " classes can be made at a time" });
      else names.push(name);
      seen.add(key(name));
    }
    return { names, refused };
  }

  // Makes each class in turn with createClass. -> { created: [{ name, id, class_code }], failed: [{ name, reason }],
  // stageOnServer, stageRefused }
  async function createClasses(sb, names, stage, stageOnServer) {
    const out = { created: [], failed: [], stageOnServer: stageOnServer !== false, stageRefused: false };
    for (const name of names) {
      const r = await createClass(sb, name, stage, out.stageOnServer);
      out.stageOnServer = r.stageOnServer;
      out.stageRefused = out.stageRefused || r.stageRefused;
      if (r.ok) out.created.push({ name, id: r.id, class_code: r.class_code });
      else out.failed.push({ name, reason: r.reason });
    }
    return out;
  }

  return { MAX_BATCH, MAX_NAME, noStage, createClass, planBatch, createClasses };
});
