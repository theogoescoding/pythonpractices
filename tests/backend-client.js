// Tests for backend.js (the student side of backend mode) against a fake server kept in memory. No network needed.
//   node tests/backend-client.js
"use strict";
const path = require("path");
const ROOT = path.join(__dirname, "..");
const Secured = require(path.join(ROOT, "secured.js"));

function memoryStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] || null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
    text: () => JSON.stringify(Object.fromEntries(m)),
  };
}

// A fake of join-class, resume and student-api, close enough to the real ones for the client.
function fakeServer() {
  // failNext: { "resume": [546, 546] } answers the next calls to that function with those statuses (an overloaded server).
  const s = { offline: false, signOutAll: false, students: {}, progress: {}, passed: {}, attempts: {}, events: {}, calls: [], failNext: {}, points: {} };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const token = (sid) => b64({ sid, exp: Math.floor(Date.now() / 1000) + 8 * 3600 }) + ".sig";
  const sidOf = (t) => { try { return JSON.parse(Buffer.from(String(t).split(".")[0], "base64url").toString()).sid; } catch (e) { return null; } };
  const reply = (status, body) => ({ status, json: async () => body });
  const signedIn = (sid) => ({ nickname: s.students[sid].nickname, class_name: "7X", token: token(sid), expires_at: new Date(Date.now() + 8 * 3600e3).toISOString() });
  let n = 0;
  s.fetch = async (url, opts) => {
    const fn = url.split("/functions/v1/")[1];
    const body = JSON.parse(opts.body);
    if (s.offline) throw new TypeError("Failed to fetch");
    s.calls.push(fn + (body.action ? ":" + body.action : ""));
    if ((s.failNext[fn] || []).length) return reply(s.failNext[fn].shift(), { error: "Worker limit" });
    if (fn === "join-class") {
      const sid = "stu-" + (++n);
      s.students[sid] = { nickname: body.nickname, code: String(10000000 + n), pin: "1234", classCode: body.class_code };
      s.progress[sid] = {}; s.passed[sid] = []; s.attempts[sid] = []; s.events[sid] = [];
      return reply(200, Object.assign({ code: s.students[sid].code, pin: "1234" }, signedIn(sid)));
    }
    if (fn === "resume") {
      const sid = Object.keys(s.students).find((k) => s.students[k].code === body.code && s.students[k].pin === body.pin);
      return sid ? reply(200, signedIn(sid)) : reply(401, { error: "That code or PIN isn't right." });
    }
    const sid = sidOf(body.token);
    if (!sid || !s.students[sid] || s.signOutAll) return reply(401, { error: "You've been signed out." });
    switch (body.action) {
      case "get_progress":
        return reply(200, { student: { nickname: s.students[sid].nickname, class_name: "7X" },
          progress: Object.entries(s.progress[sid]).map(([unit, state]) => ({ unit, state: JSON.parse(state) })),
          passed: s.passed[sid].map((x) => ({ unit: x.split("|")[0], fingerprint: x.split("|")[1] })),
          attempts: s.attempts[sid].map((r) => Object.assign({}, r, { timestamp: r.timestamp.replace("Z", "+00:00") })) });
      case "save_progress": s.progress[sid][body.unit] = JSON.stringify(body.state); return reply(200, { ok: true });
      case "mark_passed":
        if (!s.passed[sid].includes(body.unit + "|" + body.fingerprint)) s.passed[sid].push(body.unit + "|" + body.fingerprint);
        return reply(200, { ok: true });
      case "add_attempts":
      case "add_events": {
        const list = s[body.action === "add_attempts" ? "attempts" : "events"][sid];
        let saved = 0;
        for (const r of body.rows) if (!list.some((x) => x.record_id === r.record_id)) { list.push(r); saved++; }
        return reply(200, { saved, rejected: [] });
      }
      case "rename_me": {
        if (body.pin !== s.students[sid].pin) return reply(403, { error: "That PIN isn't right.", problem: "pin" });
        if (Object.entries(s.students).some(([k, v]) => k !== sid && v.nickname.toLowerCase() === String(body.nickname).toLowerCase())) return reply(400, { error: "Taken.", problem: "taken" });
        s.students[sid].nickname = body.nickname;
        return reply(200, { nickname: body.nickname });
      }
      // As the real one: the student's own class only (whatever the request says), ranked with secured.js's boards;
      // points from s.points (the server's sums, set by the test).
      case "leaderboard": {
        s.lastLeaderboardBody = body;
        const mine = Object.keys(s.students).filter((k) => s.students[k].classCode === s.students[sid].classCode);
        const pts = (k) => s.points[k] || { secured: 0, level: 0, total: 0, gain: 0 };
        const b = Secured.boards(mine.map((k) => ({ nickname: s.students[k].nickname, total: pts(k).total, gain: pts(k).gain, unitCount: 39, me: k === sid })), false);
        const me = pts(sid);
        return reply(200, { boards: b, me: { secured: me.secured, level: me.level, total: me.total, gain: me.gain }, max: 300 * 39 });
      }
      case "delete_my_progress": delete s.students[sid]; return reply(200, { deleted: true, message: "Deleted." });
      default: return reply(400, { error: "bad" });
    }
  };
  return s;
}

// An in-memory stand-in for the service-role database client, with just what class-sharing.js uses: the tables it
// reads and writes, and the two server functions of migration 0016 (written to match their SQL).
function fakeDb() {
  const t = { users: [], teachers: [], classes: [], class_teachers: [], students: [], assignments: [] };
  class Query {
    constructor(name) { this.name = name; this.filters = []; this.op = "select"; this.one = false; this.returning = false; }
    select() { if (this.op !== "select") this.returning = true; return this; }
    eq(col, v) { this.filters.push((r) => r[col] === v); return this; }
    in(col, vs) { this.filters.push((r) => vs.includes(r[col])); return this; }
    order() { return this; }
    maybeSingle() { this.one = true; return this; }
    insert(row) { this.op = "insert"; this.row = row; return this; }
    delete() { this.op = "delete"; return this; }
    then(resolve, reject) { return Promise.resolve().then(() => this.run()).then(resolve, reject); }
    run() {
      const rows = t[this.name];
      if (this.op === "insert") {
        if (this.name === "class_teachers" && rows.some((r) => r.class_id === this.row.class_id && r.teacher_id === this.row.teacher_id))
          return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        rows.push(Object.assign({ added_at: new Date().toISOString() }, this.row));
        return { data: null, error: null };
      }
      const hit = rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.op === "delete") { t[this.name] = rows.filter((r) => !hit.includes(r)); return { data: this.returning ? hit : null, error: null }; }
      return { data: this.one ? hit[0] || null : hit.slice(), error: null };
    }
  }
  const rpcs = {
    // public.teacher_by_email: a teachers row whose auth.users email matches, ignoring capitals and spaces at the ends.
    teacher_by_email: ({ p_email }) => t.teachers.filter((x) => t.users.some((u) => u.id === x.id && u.email.toLowerCase() === p_email.trim().toLowerCase()))
      .slice(0, 1).map((x) => ({ id: x.id, name: x.name })),
    // public.class_teacher_list: the class's teachers, owner first, then by name.
    class_teacher_list: ({ p_class }) => {
      const cls = t.classes.find((c) => c.id === p_class);
      return t.class_teachers.filter((r) => r.class_id === p_class).map((r) => ({ teacher_id: r.teacher_id, name: t.teachers.find((x) => x.id === r.teacher_id).name,
        email: (t.users.find((u) => u.id === r.teacher_id) || {}).email, is_owner: r.teacher_id === cls.teacher_id, added_at: r.added_at }))
        .sort((a, b) => b.is_owner - a.is_owner || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    },
  };
  return { t, from: (name) => new Query(name), rpc: async (name, args) => ({ data: rpcs[name](args), error: null }) };
}

// Opens a page: a fresh store.js and backend.js over the given localStorage (a new one is a different computer).
function openPage(server, storage) {
  storage = storage || memoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
  for (const f of ["store.js", "backend-rows.js", "backend.js"]) delete require.cache[path.join(ROOT, f)];
  const Store = require(path.join(ROOT, "store.js"));
  const Rows = require(path.join(ROOT, "backend-rows.js"));
  const Backend = require(path.join(ROOT, "backend.js"))({
    config: { BACKEND_ENABLED: true, SUPABASE_URL: "https://fake.example", SUPABASE_ANON_KEY: "anon" },
    Store, Rows, fetch: server.fetch, storage, sleep: async () => {}, // retries without real waiting
  });
  return { storage, Store, Backend };
}

const out = [];
const check = (ok, message) => { out.push(!!ok); console.log((ok ? "  ok   " : "  FAIL ") + message); };
const attempt = (Store, sid, extra) => Store.logAttempt(sid, Object.assign({ kind: "attempt", unit: "selection", units: ["selection"], taskId: "if-L3a",
  templateId: null, phase: "practice", taskType: "fill", taskLevel: 3, attemptNumber: 1, result: "pass", hints: 0, levelBefore: 3, levelAfter: 3 }, extra));

(async () => {
  const server = fakeServer();

  // ---------- Local mode ----------
  {
    for (const f of ["store.js", "backend.js"]) delete require.cache[path.join(ROOT, f)];
    const local = require(path.join(ROOT, "backend.js"))({ config: undefined, Store: require(path.join(ROOT, "store.js")) });
    let ran = false;
    require(path.join(ROOT, "store.js")).whenReady(() => { ran = true; });
    check(!local.enabled && ran, "Without config.js, backend mode is off and pages start straight away");
  }

  // ---------- A student joins and works ----------
  let page = openPage(server);
  const computer = page.storage;
  const joined = await page.Backend.join("ABCDEF", "Ada");
  const sid = page.Backend.session().sid;
  check(joined.status === 200 && page.Store.currentStudent().name === "Ada" && page.Store.currentStudent().id === sid,
    "Joining a class signs the student in as the current student");
  check(!computer.text().includes("1234"), "The PIN isn't kept anywhere in the browser");

  page = openPage(server, computer);
  let started = false;
  page.Store.whenReady(() => { started = true; });
  await page.Backend.ready();
  await new Promise((r) => setImmediate(r));
  check(started, "A page starts once the student's data has been fetched");
  const progress = page.Store.loadProgress(sid);
  progress.units.selection = { level: 3, placement: { status: "done", startLevel: 3 }, passedFingerprints: { "if-L3a": "2026-11-02T10:00:00.000Z" } };
  page.Store.saveProgress(sid, progress);
  attempt(page.Store, sid);
  attempt(page.Store, sid, { result: "fail", category: "WRONG_OUTPUT", details: { test: 1 }, misconceptions: ["m1"], code: "print(2)", failedTest: 1, inputs: [], expected: "3", output: "2", errorType: "", errorKind: "" });
  page.Store.logLevelChange({ studentId: sid, unit: "selection", from: 3, to: 4, reason: "passes", taskId: "if-L3a" });
  page.Store.logButton({ studentId: sid, unit: "selection", taskId: "if-L4a", button: "too-easy", from: 4, to: 5 });
  check(page.Backend.pending(), "Writes go into the outbox straight away");
  await page.Backend.flush();
  check(!page.Backend.pending() && server.attempts[sid].length === 2 && server.events[sid].length === 2 && JSON.parse(server.progress[sid].selection).level === 3 &&
    server.passed[sid].includes("selection|if-L3a"), "The outbox is sent: progress, attempts, events and the passed fingerprint all arrive");
  check(server.calls.filter((c) => c === "student-api:add_attempts").length === 1, "Attempts are sent together in one batch");

  // ---------- Changing my nickname (after typing the PIN) ----------
  const wrongPin = await page.Backend.renameMe("9999", "Ada L");
  check(wrongPin.status === 403 && server.students[sid].nickname === "Ada" && page.Store.currentStudent().name === "Ada" && !page.Backend.isSignedOut(),
    "A wrong PIN doesn't change the nickname, and doesn't sign the student out");
  const renamed = await page.Backend.renameMe("1234", "Ada L");
  check(renamed.status === 200 && server.students[sid].nickname === "Ada L" && page.Store.currentStudent().name === "Ada L" && page.Backend.session().nickname === "Ada L" &&
    !computer.text().includes("1234"), "With the right PIN the nickname changes on the server and in this browser (and the PIN still isn't kept)");
  await page.Backend.renameMe("1234", "Ada"); // back to the name the rest of the tests use
  page.Store.saveProgress(sid, progress);
  check(!page.Backend.pending(), "Saving progress that hasn't changed sends nothing");

  // ---------- The class leaderboard ----------
  {
    const ben = openPage(server), cat = openPage(server);
    await ben.Backend.join("ABCDEF", "Ben");
    await cat.Backend.join("QWERTY", "Cat"); // another class
    const bid = ben.Backend.session().sid, cid = cat.Backend.session().sid;
    server.points = { [sid]: { secured: 600, level: 300, total: 900, gain: 120 }, [bid]: { secured: 500, level: 400, total: 900, gain: 30 }, [cid]: { secured: 4000, level: 1000, total: 5000, gain: 999 } };
    const lb = await page.Backend.leaderboard();
    const rows = lb.body.boards.overall.concat(lb.body.boards.improving);
    check(lb.status === 200 && rows.every((r) => Object.keys(r).sort().join() === "me,nickname,percent,points,rank") &&
      lb.body.boards.overall.map((r) => r.rank + r.nickname + r.points).join() === "1Ada900,1Ben900" && lb.body.boards.improving.map((r) => r.nickname).join() === "Ada,Ben" &&
      lb.body.boards.overall.find((r) => r.me).nickname === "Ada" && lb.body.me.total === 900 && lb.body.me.secured === 600 && lb.body.me.level === 300,
      "The leaderboard has nicknames and points only (no unit detail, attempts or codes); ties share a place; the student's own row is marked; their own secured, level and total points come too");
    check(!rows.some((r) => r.nickname === "Cat") && !JSON.stringify(lb.body).includes("5000") && !JSON.stringify(lb.body).includes(cid),
      "The leaderboard has only the student's own class: students of other classes aren't on it");
    check(page.Backend.leaderboard.length === 0 && Object.keys(server.lastLeaderboardBody).sort().join() === "action,token" &&
      (await cat.Backend.leaderboard()).body.boards.overall.map((r) => r.nickname).join() === "Cat",
      "A student can't ask for another class's board: the request names no class, and each student gets their own class's");
    server.points = {};
    Object.defineProperty(globalThis, "localStorage", { value: computer, configurable: true, writable: true }); // back to Ada's computer
  }

  // ---------- The network drops ----------
  server.offline = true;
  attempt(page.Store, sid, { taskId: "if-L4a" });
  progress.units.selection.level = 4;
  page.Store.saveProgress(sid, progress);
  progress.units.selection.level = 5;
  page.Store.saveProgress(sid, progress);
  await page.Backend.flush();
  const box = JSON.parse(computer.getItem("pyPractice.outbox.v1." + sid));
  check(page.Backend.pending() && server.attempts[sid].length === 2 && box.ops.length === 2, "Offline: nothing is lost, the outbox keeps the work");
  check(box.ops.find((o) => o.type === "progress").state.level === 5, "Only the latest save of a unit's progress is kept in the outbox");

  // The page is opened again while still offline: it starts with the work kept on this computer.
  page = openPage(server, computer);
  await page.Backend.ready();
  check(page.Store.loadProgress(sid).units.selection.level === 5 && page.Store.attempts(sid).length === 3,
    "Opened again offline, the page uses the work kept on this computer");

  // Back online: sent, and the server's copy now matches.
  server.offline = false;
  await page.Backend.flush();
  check(!page.Backend.pending() && server.attempts[sid].length === 3 && JSON.parse(server.progress[sid].selection).level === 5, "Back online, the outbox is sent");

  // ---------- Signed out (token refused) ----------
  server.signOutAll = true;
  attempt(page.Store, sid, { taskId: "if-L5a" });
  await page.Backend.flush();
  check(page.Backend.pending() && page.Backend.isSignedOut(), "A refused token keeps the outbox and tells the page the student is signed out");
  server.signOutAll = false;
  await page.Backend.resume(server.students[sid].code, "1234");
  await page.Backend.flush();
  check(!page.Backend.pending() && server.attempts[sid].length === 4, "After signing in again, the kept work is sent");

  // ---------- Another computer ----------
  const other = openPage(server);
  await other.Backend.resume(server.students[sid].code, "1234");
  await other.Backend.ready();
  const there = other.Store.loadProgress(sid);
  check(there.units.selection.level === 5 && other.Store.attempts(sid).length === 4 &&
    other.Store.attempts(sid)[1].category === "WRONG_OUTPUT" && other.Store.attempts(sid)[1].at === page.Store.attempts(sid)[1].at &&
    /Z$/.test(other.Store.attempts(sid)[1].at),
    "On another computer the student carries on with the same progress and attempts");

  // ---------- A shared computer ----------
  page = openPage(server, computer);
  await page.Backend.ready();
  server.offline = true;
  attempt(page.Store, sid, { taskId: "if-L6a" }); // Ada's last attempt doesn't get sent before she leaves
  const grace = await page.Backend.join("ABCDEF", "Grace");
  check(grace.status === 0, "(offline: Grace can't join yet)");
  server.offline = false;
  await page.Backend.join("ABCDEF", "Grace");
  const gid = page.Backend.session().sid;
  check(page.Store.currentStudent().name === "Grace" && !page.Store.students()[sid] && computer.getItem("pyPractice.progress.v3." + sid) === null,
    "When the next student signs in, the last student's cached progress is removed from the computer");
  await page.Backend.flush();
  check(server.attempts[sid].length === 5 && server.attempts[gid].length === 0,
    "The last student's unsent attempt is still sent, as theirs, with their own token");

  // ---------- Signing out and deleting ----------
  attempt(page.Store, gid);
  await page.Backend.signOut();
  check(server.attempts[gid].length === 1 && !page.Store.currentStudent() && !computer.text().includes("Grace"),
    "Signing out sends what's waiting and removes the student from the computer");
  await page.Backend.resume(server.students[gid].code, "1234");
  const del = await page.Backend.deleteMyProgress();
  check(del.status === 200 && !server.students[gid] && !page.Store.currentStudent() && !page.Backend.session(), "Deleting my progress deletes it on the server and signs out");

  // ---------- An overloaded server (status 546 when a whole class signs in at once) ----------
  {
    const p = openPage(server);
    await p.Backend.join("ABC234", "Hana");
    const hid = p.Store.currentStudent().id;
    await p.Backend.signOut();
    const count = (fn) => server.calls.filter((c) => c === fn).length;
    let before = count("resume");
    server.failNext.resume = [546, 503];
    const r = await p.Backend.resume(server.students[hid].code, "1234");
    check(r.status === 200 && count("resume") - before === 3 && p.Store.currentStudent().id === hid,
      "Sign-in is retried after a 546 or 503 and then succeeds, so the student doesn't see the error");
    await p.Backend.signOut();
    before = count("resume");
    server.failNext.resume = [546, 546, 546];
    const gaveUp = await p.Backend.resume(server.students[hid].code, "1234");
    check(gaveUp.status === 546 && count("resume") - before === 3 && !p.Backend.session(), "Sign-in gives up after 2 retries and reports the error");
    before = count("resume");
    await p.Backend.resume(server.students[hid].code, "9999");
    check(count("resume") - before === 1, "A wrong PIN (401) is never retried");
    before = count("join-class");
    server.failNext["join-class"] = [546];
    const j = await p.Backend.join("ABC234", "Ivo");
    check(j.status === 546 && count("join-class") - before === 1, "Joining a class is never retried (a retry could find its own new nickname taken)");
    server.failNext = {};
  }

  // ---------- Sharing a class (teacher-api: supabase/functions/_shared/class-sharing.js, migration 0016) ----------
  // The real module teacher-api runs, against an in-memory database. Teachers' own reads go through row-level security,
  // whose rule (private.my_class_ids: the classes they own, plus their class_teachers rows) is myClasses here;
  // tests/sql/class-sharing.sql checks the real policies.
  {
    const Sharing = require(path.join(ROOT, "supabase", "functions", "_shared", "class-sharing.js"));
    const sb = fakeDb();
    const T = sb.t;
    const id = (n) => "0000000" + n + "-0000-0000-0000-000000000001";
    const [O, K, X] = [id("a"), id("b"), id("c")];
    const CLS = "0000000a-0000-0000-0000-00000000c1a5", CLX = "0000000c-0000-0000-0000-00000000c1a5";
    T.users.push({ id: O, email: "owner.o@school.example" }, { id: K, email: "K.Teacher@School.example" }, { id: X, email: "x@school.example" },
      { id: "0000000d-0000-0000-0000-000000000001", email: "not-a-teacher@school.example" }); // signed up, never signed in: no teachers row
    T.teachers.push({ id: O, name: "Owner O" }, { id: K, name: "Co-teacher K" }, { id: X, name: "Stranger X" });
    T.classes.push({ id: CLS, name: "7A", teacher_id: O }, { id: CLX, name: "8X", teacher_id: X });
    T.class_teachers.push({ class_id: CLS, teacher_id: O, added_by: O, added_at: "2026-09-01T00:00:00Z" }, { class_id: CLX, teacher_id: X, added_by: X, added_at: "2026-09-01T00:00:00Z" });
    T.students.push({ id: "0000000a-0000-0000-0000-0000000057d1", class_id: CLS, nickname: "Ada" }, { id: "0000000c-0000-0000-0000-0000000057d1", class_id: CLX, nickname: "Xavi" });
    T.assignments.push({ id: "as-1", class_id: CLS, title: "Homework 1" }, { id: "as-2", class_id: CLX, title: "X's homework" });
    const problem = async (f) => { try { await f(); return null; } catch (e) { return e instanceof Sharing.Problem ? { status: e.status, problem: e.problem, message: e.message } : { thrown: String(e) }; } };
    const reads = async (tid, table) => { const ids = (await Sharing.myClasses(sb, tid)).map((c) => c.id); return T[table].filter((r) => ids.includes(r.class_id)); };

    const unknown = await problem(() => Sharing.addCoTeacher(sb, O, CLS, "nobody@school.example"));
    const noTeacherRow = await problem(() => Sharing.addCoTeacher(sb, O, CLS, "not-a-teacher@school.example"));
    const badEmail = await problem(() => Sharing.addCoTeacher(sb, O, CLS, "not an email"));
    check(unknown && unknown.status === 404 && unknown.problem === "unknown" && unknown.message === "No teacher account with that email." &&
      noTeacherRow && noTeacherRow.message === "No teacher account with that email." && badEmail && badEmail.problem === "email" && T.class_teachers.length === 2,
      "Sharing: adding an email with no teacher account says \"No teacher account with that email.\" and adds no one (a badly typed email is refused too)");
    check((await reads(K, "students")).length === 0 && (await problem(() => Sharing.requireClass(sb, K, CLS))).status === 404,
      "Sharing: before the class is shared, the other teacher can't see it (the same 404 as a class that doesn't exist)");
    const added = await Sharing.addCoTeacher(sb, O, CLS, "  k.teacher@school.EXAMPLE ");
    check(added.added.name === "Co-teacher K" && added.teachers.map((t) => t.name + (t.owner ? "*" : "")).join() === "Owner O*,Co-teacher K" &&
      T.class_teachers.some((r) => r.class_id === CLS && r.teacher_id === K && r.added_by === O),
      "Sharing: the owner adds a co-teacher by their email (any capitals, spaces trimmed); the list shows the owner first, marked");
    check((await reads(K, "students")).map((s) => s.nickname).join() === "Ada" && (await reads(K, "assignments")).map((a) => a.title).join() === "Homework 1" &&
      (await Sharing.requireStudent(sb, K, "0000000a-0000-0000-0000-0000000057d1")).class_id === CLS,
      "Sharing: the co-teacher can read the class's students and assignments, and use its students (PINs, renaming, placement)");
    check((await reads(X, "students")).map((s) => s.nickname).join() === "Xavi" && (await reads(X, "assignments")).map((a) => a.title).join() === "X's homework" &&
      (await problem(() => Sharing.requireStudent(sb, X, "0000000a-0000-0000-0000-0000000057d1"))).status === 404 &&
      (await problem(() => Sharing.listCoTeachers(sb, X, CLS))).status === 404,
      "Sharing: a teacher who isn't on the class can't read its students, assignments or teachers");
    const mine = await Sharing.myClasses(sb, K);
    const list = await Sharing.listCoTeachers(sb, K, CLS);
    check(mine.map((c) => c.name + ":" + c.owner).join() === "7A:false" && list.teachers.length === 2 && list.you_own === false,
      "Sharing: the shared class is in the co-teacher's class list (not as theirs), and they can see its teachers");
    const again = await problem(() => Sharing.addCoTeacher(sb, O, CLS, "k.teacher@school.example"));
    const self = await problem(() => Sharing.addCoTeacher(sb, O, CLS, "owner.o@school.example"));
    const byCo = await problem(() => Sharing.addCoTeacher(sb, K, CLS, "x@school.example"));
    check(again.problem === "already" && self.problem === "self" && byCo.status === 403 && byCo.problem === "owner-only" && T.class_teachers.length === 3,
      "Sharing: only the owner adds teachers; adding someone already on the class, or yourself, is refused");
    const coRemovesOwner = await problem(() => Sharing.removeCoTeacher(sb, K, CLS, O));
    const ownerRemovesOwner = await problem(() => Sharing.removeCoTeacher(sb, O, CLS, O));
    const strangerRemoves = await problem(() => Sharing.removeCoTeacher(sb, X, CLS, K));
    check(coRemovesOwner.status === 403 && ownerRemovesOwner.problem === "owner" && strangerRemoves.status === 404 && T.class_teachers.length === 3,
      "Sharing: a co-teacher can't remove anyone (not even the owner), the owner can't be removed, and a stranger can't remove anyone");
    const removed = await Sharing.removeCoTeacher(sb, O, CLS, K);
    check(removed.teachers.map((t) => t.name).join() === "Owner O" && (await reads(K, "students")).length === 0 &&
      (await problem(() => Sharing.requireClass(sb, K, CLS))).status === 404 && (await Sharing.myClasses(sb, O)).map((c) => c.name).join() === "7A",
      "Sharing: the owner removes a co-teacher, who then can't see the class; the owner keeps it");
  }

  const failed = out.filter((ok) => !ok).length;
  console.log(failed ? "\n" + failed + " of " + out.length + " backend client checks failed." : "\nAll " + out.length + " backend client checks passed.");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
