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
  // homework: { sid: [...] } what student-api sends as the student's homework (get_progress, and after a pass or a paste flag).
  const s = { offline: false, signOutAll: false, students: {}, progress: {}, passed: {}, attempts: {}, events: {}, calls: [], failNext: {}, points: {}, homework: {} };
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
          attempts: s.attempts[sid].map((r) => Object.assign({}, r, { timestamp: r.timestamp.replace("Z", "+00:00") })),
          homework: s.homework[sid] || [] });
      case "save_progress": s.progress[sid][body.unit] = JSON.stringify(body.state); return reply(200, { ok: true });
      case "mark_passed":
        if (!s.passed[sid].includes(body.unit + "|" + body.fingerprint)) s.passed[sid].push(body.unit + "|" + body.fingerprint);
        return reply(200, { ok: true });
      case "add_attempts":
      case "add_events": {
        const list = s[body.action === "add_attempts" ? "attempts" : "events"][sid];
        let saved = 0;
        for (const r of body.rows) if (!list.some((x) => x.record_id === r.record_id)) { list.push(r); saved++; }
        // As the real one: after a pass or a paste flag, the student's homework comes back with the new count.
        const counts = body.rows.some((r) => r.result === "pass" || r.record_type === "paste_flag");
        return reply(200, counts && s.homework[sid] ? { saved, rejected: [], homework: s.homework[sid] } : { saved, rejected: [] });
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
        // Every unit counts, as points.ts POINT_UNITS (the curriculum's units): never a fixed number.
        const units = require(path.join(ROOT, "curriculum.js")).UNITS.length;
        const b = Secured.boards(mine.map((k) => ({ nickname: s.students[k].nickname, total: pts(k).total, gain: pts(k).gain, unitCount: units, me: k === sid })), false);
        const me = pts(sid);
        return reply(200, { boards: b, me: { secured: me.secured, level: me.level, total: me.total, gain: me.gain }, max: 300 * units });
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
  const t = { users: [], teachers: [], classes: [], class_teachers: [], students: [], assignments: [], attempts: [], progress: [], certificates: [],
    events: [], homework: [], homework_progress: [] };
  class Query {
    constructor(name) { this.name = name; this.filters = []; this.op = "select"; this.one = false; this.returning = false; this.from = 0; this.to = Infinity; }
    select() { if (this.op !== "select") this.returning = true; return this; }
    eq(col, v) { this.filters.push((r) => r[col] === v); return this; }
    in(col, vs) { this.filters.push((r) => vs.includes(r[col])); return this; }
    is(col, v) { this.filters.push((r) => (r[col] === undefined ? null : r[col]) === v); return this; }
    gte(col, v) { this.filters.push((r) => r[col] >= v); return this; } // ISO times compare as text
    order() { return this; }
    range(from, to) { this.from = from; this.to = to; return this; }
    maybeSingle() { this.one = true; return this; }
    insert(row) { this.op = "insert"; this.row = row; return this; }
    // As certificates-server.js uses it: insert ... on conflict (student_id, block_id) do nothing.
    upsert(rows, opts) { this.op = "upsert"; this.rows = rows; this.opts = opts; return this; }
    delete() { this.op = "delete"; return this; }
    then(resolve, reject) { return Promise.resolve().then(() => this.run()).then(resolve, reject); }
    run() {
      const rows = t[this.name];
      if (this.op === "upsert") {
        // insert ... on conflict do nothing (ignoreDuplicates, certificates-server.js) or do update (homework-server.js).
        const keys = this.opts.onConflict.split(",");
        for (const r of this.rows) {
          const old = rows.find((x) => keys.every((k) => x[k] === r[k]));
          if (!old) rows.push(Object.assign({ created_at: new Date().toISOString() }, r));
          else if (!this.opts.ignoreDuplicates) Object.assign(old, r);
        }
        return { data: null, error: null };
      }
      if (this.op === "insert") {
        if (this.name === "class_teachers" && rows.some((r) => r.class_id === this.row.class_id && r.teacher_id === this.row.teacher_id))
          return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        // homework: its id and created_at come from the table's defaults.
        rows.push(Object.assign(this.name === "homework" ? { id: require("crypto").randomUUID(), created_at: new Date().toISOString() } : { added_at: new Date().toISOString() }, this.row));
        return { data: null, error: null };
      }
      const hit = rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.op === "delete") { t[this.name] = rows.filter((r) => !hit.includes(r)); return { data: this.returning ? hit : null, error: null }; }
      return { data: this.one ? hit[0] || null : hit.slice(this.from, this.to + 1), error: null };
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

  // ---------- Certificates (teacher-api: supabase/functions/_shared/certificates-server.js, migration 0017) ----------
  // The real module teacher-api runs, with the site's rule (certificates.js), against an in-memory database.
  {
    const Sharing = require(path.join(ROOT, "supabase", "functions", "_shared", "class-sharing.js"));
    const CS = require(path.join(ROOT, "supabase", "functions", "_shared", "certificates-server.js"));
    const deps = { Sharing, Certificates: require(path.join(ROOT, "certificates.js")), Curriculum: require(path.join(ROOT, "curriculum.js")) };
    const sb = fakeDb();
    const T = sb.t;
    const id = (n) => "0000000" + n + "-0000-0000-0000-000000000001";
    const [O, K, X] = [id("a"), id("b"), id("c")];
    const CLA = "0000000a-0000-0000-0000-00000000c1a5", CLX = "0000000c-0000-0000-0000-00000000c1a5";
    const ADA = "0000000a-0000-0000-0000-0000000057d1", BEN = "0000000a-0000-0000-0000-0000000057d2", XAVI = "0000000c-0000-0000-0000-0000000057d1";
    T.teachers.push({ id: O, name: "Owner O" }, { id: K, name: "Co-teacher K" }, { id: X, name: "Stranger X" });
    T.classes.push({ id: CLA, name: "7A", teacher_id: O }, { id: CLX, name: "8X", teacher_id: X });
    T.class_teachers.push({ class_id: CLA, teacher_id: O }, { class_id: CLA, teacher_id: K }, { class_id: CLX, teacher_id: X });
    T.students.push({ id: ADA, class_id: CLA, nickname: "Ada", pin_hash: "SECRET-PIN", login_code_enc: "SECRET-CODE" }, { id: BEN, class_id: CLA, nickname: "Ben" },
      { id: XAVI, class_id: CLX, nickname: "Xavi" });
    // Each unit of a block brought to a floor of 100%: secured, then back to 100% five times, 8 days apart.
    const DAY = 86400000, T0 = Date.parse("2026-09-07T10:00:00Z");
    let n = 0;
    const full = (sid, unit, from) => [0, 0, 8, 16, 24, 32, 40].map((d) => ({ id: ++n, student_id: sid, unit, timestamp: new Date(T0 + (from + d) * DAY).toISOString(),
      record_type: "attempt", result: "pass", hints_used: 0, hint_type: null, phase: "practice", task_level: 10, student_code: "print('secret code')" }));
    const blockOf = (bid) => deps.Certificates.BLOCKS.find((b) => b.id === bid).units;
    blockOf("fundamentals").forEach((u, i) => T.attempts.push(...full(ADA, u, i)));      // Ada: Programming fundamentals, last unit on day 46
    blockOf("advanced").forEach((u, i) => T.attempts.push(...full(XAVI, u, i + 3)));     // Xavi (another class): Advanced programming
    blockOf("searching-sorting").slice(1).forEach((u, i) => T.attempts.push(...full(BEN, u, i))); // Ben: one unit short
    const problem = async (f) => { try { await f(); return null; } catch (e) { return e instanceof Sharing.Problem ? { status: e.status } : { thrown: String(e) }; } };

    const owner = await CS.classCertificates(sb, deps, O, CLA);
    check(owner.class_name === "7A" && owner.certificates.length === 1 &&
      JSON.stringify(owner.certificates[0]) === JSON.stringify({ student_name: "Ada", class_name: "7A", block_name: "Programming fundamentals", earned_on: "2026-10-23" }) &&
      !/SECRET|secret code|0000000a/.test(JSON.stringify(owner)),
      "Certificates: a teacher on the class sees each earned certificate (student, class, block, date) and nothing else (no ids, PINs, codes or attempt text); one unit short earns nothing");
    const co = await CS.classCertificates(sb, deps, K, CLA);
    check(JSON.stringify(co) === JSON.stringify(owner) && T.certificates.length === 1 &&
      (await CS.studentCertificates(sb, deps, K, ADA)).certificates.map((c) => c.block_name).join() === "Programming fundamentals",
      "Certificates: a co-teacher sees the same as the owner, for the class and for one student; asking again saves nothing twice");
    check((await problem(() => CS.classCertificates(sb, deps, X, CLA))).status === 404 && (await problem(() => CS.studentCertificates(sb, deps, X, ADA))).status === 404,
      "Certificates: a teacher who isn't on the class gets none (the same 404 as a class that doesn't exist)");
    const other = await CS.classCertificates(sb, deps, X, CLX);
    check(other.certificates.map((c) => c.student_name + ":" + c.block_name).join() === "Xavi:Advanced programming" &&
      !owner.certificates.some((c) => c.student_name === "Xavi") && !(await CS.classCertificates(sb, deps, O, CLA)).certificates.some((c) => c.student_name === "Xavi") &&
      (await problem(() => CS.studentCertificates(sb, deps, O, XAVI))).status === 404,
      "Certificates: a student's certificate is returned only for their own class, never to another class's teachers");
    // Kept once earned: the attempts going (or a later different result) doesn't remove it or change its date.
    T.attempts = T.attempts.filter((a) => a.student_id !== ADA);
    const kept = await CS.classCertificates(sb, deps, O, CLA);
    check(kept.certificates.length === 1 && kept.certificates[0].earned_on === "2026-10-23", "Certificates: once earned, a certificate is kept with its first earned date");
  }

  // ---------- Homework (teacher-api and student-api: supabase/functions/_shared/homework-server.js, migration 0018) ----------
  // The real module both functions run, with the site's rule (homework.js), against an in-memory database. Teachers'
  // rights come from class-sharing.js (owner or co-teacher); tests/sql/homework.sql checks the real row-level security.
  {
    const Sharing = require(path.join(ROOT, "supabase", "functions", "_shared", "class-sharing.js"));
    const HS = require(path.join(ROOT, "supabase", "functions", "_shared", "homework-server.js"));
    const Homework = require(path.join(ROOT, "homework.js"));
    const deps = { Sharing, Homework, unitIds: require(path.join(ROOT, "curriculum.js")).UNITS.map((u) => u.id) };
    const sb = fakeDb();
    const T = sb.t;
    const id = (n) => "0000000" + n + "-0000-0000-0000-000000000001";
    const [O, K, X] = [id("a"), id("b"), id("c")];
    const CLA = "0000000a-0000-0000-0000-00000000c1a5", CLX = "0000000c-0000-0000-0000-00000000c1a5";
    const ADA = "0000000a-0000-0000-0000-0000000057d1", BEN = "0000000a-0000-0000-0000-0000000057d2", XAVI = "0000000c-0000-0000-0000-0000000057d1";
    T.teachers.push({ id: O, name: "Owner O" }, { id: K, name: "Co-teacher K" }, { id: X, name: "Stranger X" });
    T.classes.push({ id: CLA, name: "7A", teacher_id: O }, { id: CLX, name: "8X", teacher_id: X });
    T.class_teachers.push({ class_id: CLA, teacher_id: O }, { class_id: CLA, teacher_id: K }, { class_id: CLX, teacher_id: X });
    T.students.push({ id: ADA, class_id: CLA, nickname: "Ada", pin_hash: "SECRET-PIN", login_code_enc: "SECRET-CODE" }, { id: BEN, class_id: CLA, nickname: "Ben" },
      { id: XAVI, class_id: CLX, nickname: "Xavi" });
    const problem = async (f) => { try { await f(); return null; } catch (e) { return e instanceof Sharing.Problem ? { status: e.status, problem: e.problem } : { thrown: String(e) }; } };
    const today = Homework.ukDate(Date.now());
    const due = Homework.ukDate(Date.now() + 7 * 86400000);

    // Set by the owner of 7A, and by X for their own class 8X. X can't set, list, report or delete 7A's.
    const made = await HS.create(sb, deps, O, CLA, { task_count: 2, due_on: due, units: [] }, today);
    await HS.create(sb, deps, X, CLX, { task_count: 5, due_on: due, units: ["maths"] }, today);
    const hwA = made.homework[0];
    const badForm = await problem(() => HS.create(sb, deps, O, CLA, { task_count: 0, due_on: due }, today));
    check(made.homework.length === 1 && hwA.task_count === 2 && hwA.yours && hwA.created_by_name === "Owner O" && T.homework.length === 2 &&
      badForm.status === 400 && badForm.problem === "count",
      "Homework: a teacher on the class sets homework (a number of tasks and a due date); a bad form is refused with what to fix");
    const strangerTries = [await problem(() => HS.create(sb, deps, X, CLA, { task_count: 3, due_on: due }, today)), await problem(() => HS.listForClass(sb, deps, X, CLA)),
      await problem(() => HS.report(sb, deps, X, hwA.id)), await problem(() => HS.remove(sb, deps, X, hwA.id))];
    check(strangerTries.every((p) => p && p.status === 404) && T.homework.length === 2,
      "Homework: a teacher who isn't on the class can't set, read, report on or delete its homework (the same 404 as homework that doesn't exist)");

    // Each student sees only their own class's homework.
    const adaSees = await HS.forStudent(sb, deps, ADA), xaviSees = await HS.forStudent(sb, deps, XAVI);
    check(adaSees.length === 1 && adaSees[0].id === hwA.id && adaSees[0].done === 0 && !adaSees[0].complete && xaviSees.length === 1 && xaviSees[0].units.join() === "maths" &&
      Object.keys(adaSees[0]).sort().join() === "complete,created_at,done,due_on,id,task_count,units",
      "Homework: a student sees only their own class's homework, with the due date, the units and how many done (nothing about other students)");

    // Work: Ada passes t1 (then again), pastes into t2 (flagged) and then passes it; Ben passes two new tasks.
    const soon = (min) => new Date(Date.now() + min * 60000).toISOString();
    let n = 0;
    const pass = (sid, task, min, unit) => T.attempts.push({ id: ++n, student_id: sid, record_type: "attempt", result: "pass", timestamp: soon(min), unit: unit || "selection",
      task_units: [unit || "selection"], task_id: task, student_code: "print('secret code')" });
    pass(ADA, "if-L3a", 1); T.events.push({ id: 1, student_id: ADA, record_type: "paste_flag", timestamp: soon(2), unit: "selection", task_id: "if-L4a" });
    pass(ADA, "if-L4a", 3); pass(ADA, "if-L3a", 4);
    pass(BEN, "if-L5a", 1); pass(BEN, "var-L2a", 2, "variables");
    const ownerReport = await HS.report(sb, deps, O, hwA.id);
    const row = (r, name) => r.students.find((s) => s.student_name === name);
    check(row(ownerReport, "Ada").done === 1 && row(ownerReport, "Ada").flagged.map((f) => f.task_id).join() === "if-L4a" && !row(ownerReport, "Ada").complete &&
      (await HS.forStudent(sb, deps, ADA))[0].done === 1,
      "Homework: a flagged paste doesn't count (the task passed after its paste flag isn't counted), and a repeat pass doesn't count again");
    check(row(ownerReport, "Ben").complete && row(ownerReport, "Ben").done === 2 && row(ownerReport, "Ben").units.join() === "selection,variables" &&
      ownerReport.students.map((s) => s.student_name).join() === "Ada,Ben" && !/SECRET|secret code|0000000a-0000-0000-0000-0000000057/.test(JSON.stringify(ownerReport)) &&
      T.homework_progress.filter((p) => p.homework_id === hwA.id).map((p) => p.done).sort().join() === "1,2",
      "Homework report: one row per student (done of y, complete, the units the tasks were done in); only names, numbers, units and task ids; the server saves each student's progress");
    const coReport = await HS.report(sb, deps, K, hwA.id);
    const coList = await HS.listForClass(sb, deps, K, CLA);
    check(JSON.stringify(coReport) === JSON.stringify(ownerReport) && coList.homework.length === 1 && coList.homework[0].complete === 1 && !coList.homework[0].yours,
      "Homework: a co-teacher sees the same report and list as the owner");
    // A co-teacher can delete it too; the other class's homework stays.
    const del = await HS.remove(sb, deps, K, hwA.id);
    check(del.deleted && (await HS.listForClass(sb, deps, O, CLA)).homework.length === 0 && (await HS.forStudent(sb, deps, ADA)).length === 0 &&
      (await HS.forStudent(sb, deps, XAVI)).length === 1,
      "Homework: its creator or a co-teacher can delete it; then the students no longer see it, and other classes' homework stays");
  }

  // ---------- Large paste flags on the Students page (teacher-api paste_flags_for_class: _shared/paste-flags-server.js) ----------
  // The real module teacher-api runs, with the site's rule (paste-details.js), against an in-memory database.
  {
    const Sharing = require(path.join(ROOT, "supabase", "functions", "_shared", "class-sharing.js"));
    const PFS = require(path.join(ROOT, "supabase", "functions", "_shared", "paste-flags-server.js"));
    const deps = { Sharing, PasteDetails: require(path.join(ROOT, "paste-details.js")) };
    const sb = fakeDb();
    const T = sb.t;
    const id = (n) => "0000000" + n + "-0000-0000-0000-000000000001";
    const [O, K, X] = [id("a"), id("b"), id("c")];
    const CLA = "0000000a-0000-0000-0000-00000000c1a5", CLX = "0000000c-0000-0000-0000-00000000c1a5";
    const ADA = "0000000a-0000-0000-0000-0000000057d1", BEN = "0000000a-0000-0000-0000-0000000057d2", XAVI = "0000000c-0000-0000-0000-0000000057d1";
    const HWA = "0000000a-0000-0000-0000-0000000000a1", HWX = "0000000c-0000-0000-0000-0000000000a1";
    T.teachers.push({ id: O, name: "Owner O" }, { id: K, name: "Co-teacher K" }, { id: X, name: "Stranger X" });
    T.classes.push({ id: CLA, name: "7A", teacher_id: O }, { id: CLX, name: "8X", teacher_id: X });
    T.class_teachers.push({ class_id: CLA, teacher_id: O }, { class_id: CLA, teacher_id: K }, { class_id: CLX, teacher_id: X });
    T.students.push({ id: ADA, class_id: CLA, nickname: "Ada", pin_hash: "SECRET-PIN", login_code_enc: "SECRET-CODE" }, { id: BEN, class_id: CLA, nickname: "Ben" },
      { id: XAVI, class_id: CLX, nickname: "Xavi" });
    T.homework.push({ id: HWA, class_id: CLA, task_count: 5, due_on: "2026-11-27", units: [] }, { id: HWX, class_id: CLX, task_count: 5, due_on: "2026-11-30", units: [] });
    const t = (min) => new Date(Date.parse("2026-11-18T10:00:00Z") + min * 60000).toISOString();
    let n = 0;
    const ev = (sid, min, task, unit, extra) => T.events.push(Object.assign({ id: ++n, student_id: sid, record_id: "f-" + n, record_type: "paste_flag", timestamp: t(min), unit, task_id: task,
      paste_phase: null, paste_lines: null, paste_homework_id: null }, extra));
    const at = (sid, min, task, type, result, code, phase) => T.attempts.push({ id: ++n, student_id: sid, record_type: type, timestamp: t(min), task_id: task, unit: "maths",
      phase: phase || "practice", result, student_code: code, code_deleted_at: null });
    ev(ADA, 0, "maths-L9b", "maths", { paste_phase: "practice", paste_lines: 12, paste_homework_id: HWA });
    ev(ADA, 30, "maths-L10a", "maths", { paste_phase: "endless", paste_lines: 9 });
    ev(ADA, 40, "if-L9a", "selection");                                  // an older flag: no details stored
    ev(XAVI, 5, "maths-L9b", "maths", { paste_phase: "practice", paste_lines: 15 });
    T.events.push({ id: ++n, student_id: ADA, record_id: "l-1", record_type: "level_change", timestamp: t(1), unit: "maths" }); // not a flag
    at(ADA, -5, "maths-L9b", "attempt", "fail", "print('before the paste')");
    at(ADA, 3, "maths-L9b", "attempt", "fail", "x = int(input())\nprint(x * 2)");
    at(ADA, 6, "maths-L9b", "attempt", "pass", null);
    at(ADA, 7, "maths-L8a", "attempt", "fail", "print('ANOTHER TASK, never sent')");
    at(ADA, 45, "if-L9a", "skip", "skipped", null, "placement");
    at(XAVI, 8, "maths-L9b", "attempt", "fail", "print('XAVI CODE')");
    const problem = async (f) => { try { await f(); return null; } catch (e) { return e instanceof Sharing.Problem ? { status: e.status } : { thrown: String(e) }; } };

    const owner = await PFS.forClass(sb, deps, O, CLA);
    const ada = owner.students.find((s) => s.student_name === "Ada");
    const maths = ada.units.find((u) => u.unit === "maths").flags, sel = ada.units.find((u) => u.unit === "selection").flags;
    check(owner.students.length === 1 && ada.student_id === ADA && maths.map((f) => f.taskId).join() === "maths-L10a,maths-L9b" &&
      maths[1].lines === 12 && maths[1].phase === "practice" && maths[1].homework.inHomework && maths[1].homework.dueOn === "2026-11-27" &&
      maths[1].next.result === "failed" && maths[1].next.code === "x = int(input())\nprint(x * 2)" && maths[0].next === null &&
      sel[0].lines === null && !sel[0].homework.recorded && sel[0].phase === "placement" && sel[0].phaseFrom === "next-check" && sel[0].next.result === "skipped",
      "Paste flags: a teacher on the class gets each student's flags per unit (newest first), with the phase, lines, homework due date and the next check; older flags are \"not recorded\"");
    const json = JSON.stringify(owner);
    check(!/SECRET|Xavi|XAVI|ANOTHER TASK|before the paste/.test(json) && !/"attempts"|student_code|pin/.test(json) &&
      (json.match(/"code":"/g) || []).length === 1,
      "Paste flags: the reply has no PIN or login code, no other class's student, and only the one next check per flag (not the attempt log: no other task's code, no earlier check)");
    const co = await PFS.forClass(sb, deps, K, CLA);
    check(JSON.stringify(co) === json, "Paste flags: a co-teacher gets exactly what the owner gets");
    check((await problem(() => PFS.forClass(sb, deps, X, CLA))).status === 404 && (await PFS.forClass(sb, deps, X, CLX)).students.map((s) => s.student_name).join() === "Xavi",
      "Paste flags: a teacher who isn't on the class gets none (the same 404 as a class that doesn't exist); their own class shows only their own students");
    // student-api add_events: a homework id from another class is refused; the class's own is kept.
    const rejected = [];
    const rows = [{ record_id: "f-a", record_type: "paste_flag", paste_homework_id: HWA }, { record_id: "f-b", record_type: "paste_flag", paste_homework_id: HWX },
      { record_id: "f-c", record_type: "paste_flag", paste_homework_id: null }];
    const kept = await PFS.keepOwnHomework(sb, CLA, rows, rejected);
    check(kept.map((r) => r.record_id).join() === "f-a,f-c" && rejected.length === 1 && rejected[0].record_id === "f-b" && rejected[0].reason === "bad paste_homework_id",
      "Paste flags: a paste flag naming another class's homework is refused (the student's own class's homework, or none, is kept)");
  }

  // ---------- Homework and paste flags in the student's browser (backend.js) ----------
  {
    const server = fakeServer();
    let p = openPage(server);
    await p.Backend.join("ABCDEF", "Hana");
    const hid = p.Backend.session().sid;
    const hwList = [{ id: "hw-1", task_count: 3, due_on: "2026-12-01", units: ["selection"], created_at: "2026-11-18T09:00:00.000Z", done: 0, complete: false }];
    server.homework[hid] = hwList;
    p = openPage(server, p.storage);
    await p.Backend.ready();
    check(JSON.stringify(p.Store.homework(hid)) === JSON.stringify(hwList), "Homework: the student's page gets their class's homework with the rest of their data");
    p.Store.logPasteFlag({ studentId: hid, unit: "selection", units: ["selection"], taskId: "if-L9a", lines: 12, homework: true, phase: "practice", homeworkId: "hw-1" });
    server.homework[hid] = [Object.assign({}, hwList[0], { done: 1 })];
    attempt(p.Store, hid, { taskId: "if-L8a" });
    await p.Backend.flush();
    const flag = server.events[hid].find((r) => r.record_type === "paste_flag");
    check(flag && flag.task_id === "if-L9a" && flag.unit === "selection" && /^f-/.test(flag.record_id) &&
      Object.keys(flag).sort().join() === "paste_homework_id,paste_lines,paste_phase,record_id,record_type,task_id,timestamp,unit" &&
      flag.paste_phase === "practice" && flag.paste_lines === 12 && flag.paste_homework_id === "hw-1",
      "Paste flag: sent to student-api as an event with the task id, the phase, the line count and the homework id (migration 0019), and nothing else: no code or pasted text");
    check(p.Store.homework(hid)[0].done === 1, "Homework: after a pass is sent, the new \"x of y done\" from the server is kept for the home page");
  }

  // ---------- "Needs review" (teacher-api review_candidates_for_class: _shared/review-server.js) ----------
  // The real module teacher-api runs, against an in-memory database; the page then matches with review-rules.js.
  {
    const Sharing = require(path.join(ROOT, "supabase", "functions", "_shared", "class-sharing.js"));
    const RS = require(path.join(ROOT, "supabase", "functions", "_shared", "review-server.js"));
    const RR = require(path.join(ROOT, "review-rules.js"));
    const bank = require(path.join(ROOT, "tasks.json"));
    const sb = fakeDb();
    const T = sb.t;
    const id = (n) => "0000000" + n + "-0000-0000-0000-000000000001";
    const [O, K, X] = [id("a"), id("b"), id("c")];
    const CLA = "0000000a-0000-0000-0000-00000000c1a5", CLX = "0000000c-0000-0000-0000-00000000c1a5";
    const ADA = "0000000a-0000-0000-0000-0000000057d1", BEN = "0000000a-0000-0000-0000-0000000057d2", XAVI = "0000000c-0000-0000-0000-0000000057d1";
    T.teachers.push({ id: O, name: "Owner O" }, { id: K, name: "Co-teacher K" }, { id: X, name: "Stranger X" });
    T.classes.push({ id: CLA, name: "7A", teacher_id: O }, { id: CLX, name: "8X", teacher_id: X });
    T.class_teachers.push({ class_id: CLA, teacher_id: O }, { class_id: CLA, teacher_id: K }, { class_id: CLX, teacher_id: X });
    T.students.push({ id: ADA, class_id: CLA, nickname: "Ada", pin_hash: "SECRET-PIN", login_code_enc: "SECRET-CODE" }, { id: BEN, class_id: CLA, nickname: "Ben" },
      { id: XAVI, class_id: CLX, nickname: "Xavi" });
    // A sample rule on three bank tasks (real buggy-variant code and outputs).
    const picks = bank.filter((t) => !(t.tags || []).includes("placement") && t.type === "write" && (t.buggy_variants || []).length).slice(0, 3);
    const rule = { id: "rev-sample", name: "Sample rule", description: "x", added: "2026-11-20", term: "Autumn 2026",
      variants: picks.map((t) => ({ task: t.id, code: t.buggy_variants[0].code, outputs: t.buggy_variants[0].outputs })) };
    const t0 = picks[0], k0 = t0.buggy_variants[0].outputs.findIndex((o, k) => o.errorKind || o.output !== t0.tests[k].expected), o0 = t0.buggy_variants[0].outputs[k0];
    const NOW = Date.parse("2026-11-20T12:00:00Z");
    const ago = (d) => new Date(NOW - d * 86400000).toISOString();
    let n = 0;
    const fail = (sid, extra) => T.attempts.push(Object.assign({ id: ++n, student_id: sid, record_type: "attempt", result: "fail", timestamp: ago(2), task_id: t0.id,
      failure_category: "WRONG_OUTPUT", failed_test_number: k0 + 1, student_output: o0.output, student_error_kind: o0.errorKind, student_code: "print('ADA CODE')",
      code_deleted_at: null, misconception_matches: [], hints_used: 0 }, extra));
    fail(ADA);                                                         // a match
    fail(BEN, { timestamp: ago(4), student_code: null });               // no code stored: a match, shown without code
    fail(BEN, { timestamp: ago(5), student_code: null, code_deleted_at: ago(1) }); // code and output cleared: can't be matched
    fail(ADA, { timestamp: ago(45) });                                  // older than 30 days
    fail(ADA, { failure_category: "WRONG_ERROR_KIND" });                // never matched
    fail(ADA, { task_id: "some-other-task", student_code: "print('OTHER TASK')" }); // a task no rule uses
    T.attempts.push({ id: ++n, student_id: ADA, record_type: "attempt", result: "pass", timestamp: ago(1), task_id: t0.id, student_code: "print('A PASS')" });
    fail(XAVI, { student_code: "print('XAVI CODE')" });                 // another class
    const problem = async (f) => { try { await f(); return null; } catch (e) { return e instanceof Sharing.Problem ? { status: e.status } : { thrown: String(e) }; } };
    const ids = RR.taskIds([rule]);

    const owner = await RS.candidatesForClass(sb, { Sharing }, O, CLA, ids, NOW);
    const list = RR.matches([rule], owner.candidates, NOW);
    check(list.length === 2 && list.map((m) => m.student_name).join() === "Ada,Ben" && list[0].code === "print('ADA CODE')" && list[1].code === null &&
      list.every((m) => m.task_id === t0.id && m.rule_name === "Sample rule"),
      "Needs review: a teacher on the class gets their class's failed attempts from the last 30 days on the rules' tasks, and the page matches them (code only if still stored)");
    const json = JSON.stringify(owner);
    check(owner.candidates.length === 3 && owner.candidates.filter((c) => c.output === "" && c.code === null).length === 1 && !/SECRET|Xavi|XAVI|OTHER TASK|A PASS/.test(json) && !/student_id|pin|"id"/.test(json) &&
      owner.candidates.every((c) => Object.keys(c).sort().join() === "at,category,code,error_kind,failed_test,matched,output,student_name,task_id"),
      "Needs review: the reply has no PIN or login code, no other class's student, and no attempt log (no passes, other tasks, attempts over 30 days or WRONG_ERROR_KIND ones)");
    check(JSON.stringify(await RS.candidatesForClass(sb, { Sharing }, K, CLA, ids, NOW)) === json, "Needs review: a co-teacher gets exactly what the owner gets");
    check((await problem(() => RS.candidatesForClass(sb, { Sharing }, X, CLA, ids, NOW))).status === 404 &&
      RR.matches([rule], (await RS.candidatesForClass(sb, { Sharing }, X, CLX, ids, NOW)).candidates, NOW).map((m) => m.student_name).join() === "Xavi" &&
      (await problem(() => RS.candidatesForClass(sb, { Sharing }, O, CLA, "not a list", NOW))).status === 400,
      "Needs review: a teacher who isn't on the class gets none (the same 404 as a class that doesn't exist); their own class shows only their own students");
  }

  // ---------- Debugging (GCSE): the server accepts the new unit (2026-11) ----------
  // student-api and teacher-api check every row's unit against _shared/rows.ts UNITS (Deno code, read here as text),
  // and the database against migration 0020's unit checks. A wrong answer to the error question is an ordinary
  // failed attempt (failure_category WRONG_ERROR_KIND), sent like any other.
  {
    const fs = require("fs");
    const Curriculum = require(path.join(ROOT, "curriculum.js"));
    const rowsTs = fs.readFileSync(path.join(ROOT, "supabase", "functions", "_shared", "rows.ts"), "utf8");
    const serverUnits = JSON.parse(rowsTs.match(/export const UNITS = (\[[^\]]*\])/)[1].replace(/\s+/g, " "));
    const mig = fs.readFileSync(path.join(ROOT, "supabase", "migrations", "0020_debugging_gcse_unit.sql"), "utf8");
    check(serverUnits.includes("debugging-gcse") && serverUnits.length === Curriculum.UNITS.length && Curriculum.UNITS.every((u) => serverUnits.includes(u.id)) &&
      ["progress", "passed_tasks", "attempts", "events"].every((tb) => new RegExp(tb + "_unit_check[\\s\\S]*?'debugging-gcse'").test(mig)),
      "Debugging (GCSE): the server accepts the new unit id (rows.ts UNITS, which matches the curriculum's units, and migration 0020's unit checks)");
    const server = fakeServer();
    let p = openPage(server);
    await p.Backend.join("ABCDEF", "Dee");
    const did = p.Backend.session().sid;
    attempt(p.Store, did, { unit: "debugging-gcse", units: ["debugging-gcse"], taskId: "bug-L7a", taskType: "write", taskLevel: 7, result: "fail",
      category: "WRONG_ERROR_KIND", details: { wrong: [0], answers: ["logic"] }, misconceptions: [], code: "", failedTest: null });
    await p.Backend.flush();
    const sent = server.attempts[did][0];
    check(sent && sent.unit === "debugging-gcse" && sent.failure_category === "WRONG_ERROR_KIND" && JSON.stringify(sent.failure_details) === '{"wrong":[0],"answers":["logic"]}' &&
      sent.failed_test_number === null && !p.Backend.pending(),
      "Debugging (GCSE): an attempt in the new unit (a wrong answer to the error question) is sent to student-api like any other");
  }

  // ---------- Students page (prompt 9): one table per block, the same data ----------
  // The class's rows (as teacher-backend.js loads them) go through BackendRows.teacherData, TD.scoreTable and
  // TD.overviewTablesHtml unchanged: every student of the class is in every block's table, every unit is a column
  // once, each Level cell shows that student's level from the server, and nobody from another class appears.
  {
    const Curriculum = require(path.join(ROOT, "curriculum.js"));
    const Rows = require(path.join(ROOT, "backend-rows.js"));
    const TD = require(path.join(ROOT, "teacher-data.js"));
    const all = Curriculum.UNITS.map((u) => u.id);
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const placed = (level) => ({ level, placement: { status: "done", startLevel: level }, buttonsUsed: {}, failsInARow: 0 });
    const classes = {
      A: { students: [["a1", "Ann"], ["a2", "Bo"]], progress: [["a1", "maths", 7], ["a1", "debugging-gcse", 4], ["a2", "loops-count", 9], ["a2", "recursion", 3]] },
      B: { students: [["b1", "Cy"], ["b2", "Di"], ["b3", "Ed"]], progress: [["b1", "arrays-3d", 5], ["b2", "trace-tables", 8], ["b3", "merge-sort", 2], ["b3", "output", 6]] },
    };
    const results = {};
    for (const [cls, c] of Object.entries(classes)) {
      const rows = { students: c.students.map(([id, nickname]) => ({ id, nickname, created_at: "2026-09-02T09:00:00Z", imported: false, locked_until: null })),
        progress: c.progress.map(([student_id, unit, level]) => ({ student_id, unit, state: placed(level) })), attempts: [], events: [] };
      const data = Rows.teacherData(rows, Curriculum.UNITS);
      const table = TD.scoreTable(data, all);
      const html = TD.overviewTablesHtml({ rows: TD.sortScoreTable(table.rows, "name", 1), unitIds: all, unitGroups: Curriculum.UNIT_GROUPS, unitTitle: Curriculum.unitTitle,
        sortKey: "name", sortDir: 1, when: () => "–", flagsHtml: () => "", buttonHtml: (id, bodyId, title, open, extra) => '<button data-group="' + id + '">' + title + (extra || "") + "</button>", collapsed: [] });
      const blocks = html.split('<section class="overview-block"').slice(1);
      const ids = c.students.map((s) => s[0]);
      // The student's Level row in each block's table; the unit's cell is in one of them.
      const levelCell = (sid, unit) => html.split('<tbody class="ov-student">').filter((b) => b.includes('href="#student=' + sid + '"')).map((body) => {
        const level = body.slice(body.indexOf('<tr class="ov-level">'));
        return (new RegExp('<td class="unit-cell" data-label="' + esc(Curriculum.unitTitle(unit)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '">([\\s\\S]*?)</td>').exec(level) || [])[1] || "";
      }).join("");
      results[cls] = {
        students: Object.keys(data.students).sort().join() === ids.slice().sort().join() && table.rows.length === ids.length,
        everyBlock: blocks.length === 6 && blocks.every((b) => ids.every((sid) => (b.match(new RegExp('href="#student=' + sid + '"', "g")) || []).length === 1)),
        units: JSON.stringify([...html.matchAll(/data-sort="([^"]+)"/g)].map((m) => m[1]).filter((k) => k !== "name" && k !== "average")) === JSON.stringify(TD.overviewGroups(all, Curriculum.UNIT_GROUPS).flatMap((g) => g.units)) &&
          all.every((u) => (html.match(new RegExp('data-sort="' + u + '"', "g")) || []).length === 1),
        levels: c.progress.every(([sid, unit, level]) => new RegExp("Level " + level + "\\b").test(levelCell(sid, unit))) &&
          table.rows.every((r) => all.every((u) => r.cells[u] && (r.cells[u].started === c.progress.some(([sid, unit]) => sid === r.studentId && unit === u)))),
        html,
      };
    }
    check(results.A.students && results.B.students && results.A.everyBlock && results.B.everyBlock,
      "Students page: each class's students are all there, in every block's table (2 in class A, 3 in class B), from the rows teacher-backend.js loads");
    check(results.A.units && results.B.units && results.A.levels && results.B.levels,
      "Students page: every unit is a column exactly once (in curriculum order, Debugging (GCSE) and the A-level units too), and each Level cell shows that student's level from the server");
    check(!/#student=b\d/.test(results.A.html) && !/#student=a\d/.test(results.B.html),
      "Students page: a class's tables never show another class's students");
  }

  const failed = out.filter((ok) => !ok).length;
  console.log(failed ? "\n" + failed + " of " + out.length + " backend client checks failed." : "\nAll " + out.length + " backend client checks passed.");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
