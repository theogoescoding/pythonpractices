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
  // exam: { sid: [rows] } Exam Mode attempts (add_exam_attempts); examMode: { sid: true | false } the class's switch as
  // get_progress sends it (unset: true).
  const s = { offline: false, signOutAll: false, students: {}, progress: {}, passed: {}, attempts: {}, events: {}, calls: [], failNext: {}, points: {}, homework: {}, exam: {}, examMode: {} };
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
          homework: s.homework[sid] || [], exam_mode: sid in s.examMode ? s.examMode[sid] : true });
      case "add_exam_attempts": {
        const list = (s.exam[sid] = s.exam[sid] || []);
        let saved = 0;
        for (const r of body.rows) if (!list.some((x) => x.record_id === r.record_id)) { list.push(r); saved++; }
        return reply(200, { saved, rejected: [] });
      }
      case "get_exam_progress":
        return reply(200, { attempts: (s.exam[sid] || []).map((r) => Object.assign({}, r, { student_code: undefined })),
          model_seen: s.events[sid].filter((e) => e.record_type === "exam_model_seen").map((e) => ({ question_id: e.task_id, at: e.timestamp })),
          tutorial_seen: s.events[sid].some((e) => e.record_type === "exam_tutorial_seen") });
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
    events: [], homework: [], homework_progress: [], exam_attempts: [] };
  class Query {
    constructor(name) { this.name = name; this.filters = []; this.op = "select"; this.one = false; this.returning = false; this.from = 0; this.to = Infinity; }
    select() { if (this.op !== "select") this.returning = true; return this; }
    // As exam-server.js uses it: update classes set exam_mode = ... where id = ...
    update(values) { this.op = "update"; this.values = values; return this; }
    eq(col, v) { this.filters.push((r) => r[col] === v); return this; }
    neq(col, v) { this.filters.push((r) => r[col] !== v); return this; }
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
        const added = [];
        for (const r of this.rows) {
          const old = rows.find((x) => keys.every((k) => x[k] === r[k]));
          if (!old) { const row = Object.assign({ id: rows.length + 1, created_at: new Date().toISOString() }, r); rows.push(row); added.push(row); }
          else if (!this.opts.ignoreDuplicates) Object.assign(old, r);
        }
        // With .select() (exam-server.js): the rows actually inserted (a duplicate skipped by ignoreDuplicates isn't).
        return { data: this.returning ? added : null, error: null };
      }
      if (this.op === "update") {
        const hit = rows.filter((r) => this.filters.every((f) => f(r)));
        for (const r of hit) Object.assign(r, this.values);
        return { data: this.returning ? hit : null, error: null };
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

  // ---------- Points and leaderboards (student-api and teacher-api: supabase/functions/_shared/points-server.js, prompt 23) ----------
  // The real module both functions run (through points.ts), with the site's rule (secured.js), against an in-memory
  // database: the programme points and the re-secure bonus are worked out from the rows the server already keeps.
  {
    const PS = require(path.join(ROOT, "supabase", "functions", "_shared", "points-server.js"));
    const Curriculum = require(path.join(ROOT, "curriculum.js"));
    const deps = { Secured, Curriculum };
    const sb = fakeDb();
    const T = sb.t;
    const CLA = "0000000a-0000-0000-0000-00000000c1a5", CLX = "0000000c-0000-0000-0000-00000000c1a5";
    const ADA = "0000000a-0000-0000-0000-0000000057d1", BEN = "0000000a-0000-0000-0000-0000000057d2", XAVI = "0000000c-0000-0000-0000-0000000057d1";
    T.students.push({ id: ADA, class_id: CLA, nickname: "Ada", pin_hash: "SECRET-PIN", login_code_enc: "SECRET-CODE" }, { id: BEN, class_id: CLA, nickname: "Ben", pin_hash: "SECRET-PIN2" },
      { id: XAVI, class_id: CLX, nickname: "Xavi", pin_hash: "SECRET-PIN3" });
    const placed = { status: "done", startLevel: 7 };
    T.progress.push({ student_id: ADA, unit: "maths", level: 10, placement: placed }, { student_id: BEN, unit: "maths", level: 6, placement: placed },
      { student_id: XAVI, unit: "maths", level: 10, placement: placed }, { student_id: ADA, unit: "endless", level: null, placement: null });
    const DAY = 86400000, T0 = Date.parse("2026-09-01T09:00:00Z"), NOW = T0 + 60 * DAY;
    let n = 0;
    const row = (sid, d, extra) => Object.assign({ id: ++n, student_id: sid, unit: "maths", timestamp: new Date(T0 + d * DAY).toISOString(), record_type: "attempt", result: "pass",
      hints_used: 0, hint_type: null, phase: "practice", task_level: 10, task_type: "write", task_id: "maths-L10a", variant_fingerprint: null, student_code: "print('secret code')" }, extra);
    // Ada: secured, then back to 100% twice (2 stars, 20 bonus); endless programmes with 0, 2 and 5 hints (50 + 30 + 10),
    // one with "Show me how" and 1 hint (30), and a repeat of the first (nothing). Xavi (another class): 5 stars, 1 programme.
    T.attempts.push(row(ADA, 0), row(ADA, 0.1), row(ADA, 8), row(ADA, 16),
      row(ADA, 20, { phase: "endless", task_id: "maths-L10b" }), row(ADA, 21, { phase: "endless", task_id: "maths-L10c", hints_used: 2 }),
      row(ADA, 22, { phase: "endless", task_id: "maths-L10d", hints_used: 5 }), row(ADA, 23, { phase: "endless", task_id: "maths-L10e", hints_used: 1, hint_type: "show-me-how" }),
      row(ADA, 24, { phase: "endless", task_id: "maths-L10b", hints_used: 0 }), row(ADA, 25, { phase: "endless", task_id: "trace-L10a", task_type: "trace" }),
      row(BEN, 1, { task_level: 6 }),
      ...[0, 0.1, 8, 16, 24, 32, 40, 48].map((d) => row(XAVI, d)), row(XAVI, 50, { phase: "endless", task_id: "maths-L10z" }));
    const all = await PS.classPoints(sb, deps, CLA, NOW);
    const ada = all.find((s) => s.nickname === "Ada"), ben = all.find((s) => s.nickname === "Ben");
    check(all.length === 2 && ada.bonus === 20 && ada.programme === 50 + 30 + 10 + 30 && ada.programmes === 4 && ada.secured === Secured.securedPoints(Secured.score(
      T.attempts.filter((a) => a.student_id === ADA).map((a) => ({ kind: a.record_type, unit: a.unit, at: a.timestamp, result: a.result, hints: a.hints_used, phase: a.phase, taskLevel: a.task_level })), "maths", NOW)) &&
      ada.level === 100 && ada.combined === ada.secured + ada.level + ada.programme + ada.bonus && ada.total === ada.combined && ben.programme === 0 && ben.bonus === 0 && ben.level === 60,
      "Points on the server: the re-secure bonus (10 a re-secure) and the programme points (first endless pass of each level 10 write task, 50 less 10 a hint, \"Show me how\" counting as one, at least 10; a repeat gives nothing) are worked out from the stored rows; combined = secured + level + programme + bonus");
    const sbAda = PS.studentBoard(all, ADA, deps);
    const sbRows = sbAda.boards.overall.concat(sbAda.boards.improving);
    const text = JSON.stringify(sbAda);
    check(sbRows.every((r) => Object.keys(r).sort().join() === "me,nickname,percent,points,rank") && sbAda.boards.overall.find((r) => r.me).points === ada.combined &&
      Object.keys(sbAda.me).sort().join() === "bonus,gain,level,programme,programmes,secured,total" && sbAda.me.programme === ada.programme && sbAda.me.bonus === 20 && sbAda.me.total === ada.combined &&
      sbAda.max === 300 * Curriculum.UNITS.length && !/SECRET|secret code|57d|c1a5|Xavi/.test(text) && !text.includes('"secured":' + ben.secured + ',"level":' + ben.level),
      "Points on the server: the student's board gives them their own programme points, re-secure bonus and programme count; other students' rows have only nickname, points and place (no separate totals), and there is no PIN, code, id or other class's student");
    const cb = PS.classBoard(all, deps);
    const cbRows = cb.boards.overall.concat(cb.boards.improving);
    const ab = PS.allClassesBoard([{ name: "7A", students: all }, { name: "8X", students: await PS.classPoints(sb, deps, CLX, NOW) }], deps);
    const xavi = ab.boards.overall.find((r) => r.nickname === "Xavi");
    check(cbRows.every((r) => Object.keys(r).sort().join() === "bonus,level,nickname,percent,points,programme,rank,secured") && cb.boards.overall.find((r) => r.nickname === "Ada").bonus === 20 &&
      cb.boards.overall.find((r) => r.nickname === "Ada").points === ada.combined && !/SECRET|secret code|57d|c1a5|Xavi/.test(JSON.stringify(cb)) &&
      xavi.bonus === 50 && xavi.programme === 50 && xavi.class_name === "8X" && ab.classes === 2 && !/SECRET|secret code|57d|c1a5/.test(JSON.stringify(ab)),
      "Points on the server: the teacher's boards carry the secured, level, programme and re-secure bonus totals and the combined points (capped at 50 bonus a unit), with no PIN, code or student id");
  }

  // ---------- Progress summary (teacher-api student_progress_summary: homework-server.js progressSummary, prompt 25) ----------
  // The real module, with homework.js's rules (first passes, homework progress), against an in-memory database.
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
    const ADA = "0000000a-0000-0000-0000-0000000057d1", BEN = "0000000a-0000-0000-0000-0000000057d2", NEW = "0000000a-0000-0000-0000-0000000057d3";
    T.teachers.push({ id: O, name: "Owner O" }, { id: K, name: "Co-teacher K" }, { id: X, name: "Stranger X" });
    T.classes.push({ id: CLA, name: "7A", teacher_id: O }, { id: CLX, name: "8X", teacher_id: X });
    T.class_teachers.push({ class_id: CLA, teacher_id: O }, { class_id: CLA, teacher_id: K }, { class_id: CLX, teacher_id: X });
    T.students.push({ id: ADA, class_id: CLA, nickname: "Ada", pin_hash: "SECRET-PIN", login_code_enc: "SECRET-CODE" }, { id: BEN, class_id: CLA, nickname: "Ben", pin_hash: "SECRET-PIN2" },
      { id: NEW, class_id: CLA, nickname: "Nia" });
    let n = 0;
    const row = (sid, task, ts, result) => ({ id: ++n, student_id: sid, record_type: "attempt", timestamp: ts, unit: "maths", task_units: ["maths"], task_id: task, result: result || "pass",
      student_code: "print('secret code')" });
    // The same passes as tests/features.js: first attempt Monday 26 October, 5 first passes over 4 weeks (one empty), 2 this
    // week, a repeat, and the last attempt at 4 pm on 17 November. Ben has lots of passes this week: none of his must show.
    T.attempts.push(row(ADA, "t-first-try", "2026-10-26T09:00:00Z", "fail"), row(ADA, "t-a", "2026-10-27T10:00:00Z"), row(ADA, "t-e", "2026-10-28T10:00:00Z"),
      row(ADA, "t-b", "2026-11-05T10:00:00Z"), row(ADA, "t-b", "2026-11-16T08:00:00Z"), row(ADA, "t-c", "2026-11-16T09:00:00Z"), row(ADA, "t-d", "2026-11-17T15:30:00Z"),
      row(ADA, "t-x", "2026-11-17T16:00:00Z", "fail"), ...["b1", "b2", "b3", "b4"].map((t, i) => row(BEN, t, "2026-11-17T1" + i + ":00:00Z")));
    T.homework.push({ id: "11111111-1111-1111-1111-111111111111", class_id: CLA, created_by: O, task_count: 3, due_on: "2026-11-08", units: [], created_at: "2026-11-02T08:00:00Z" },
      { id: "22222222-2222-2222-2222-222222222222", class_id: CLA, created_by: K, task_count: 2, due_on: "2026-11-30", units: ["maths"], created_at: "2026-11-15T08:00:00Z" });
    const NOW = Date.parse("2026-11-18T12:00:00Z");
    const problem = async (f) => { try { await f(); return null; } catch (e) { return e instanceof Sharing.Problem ? { status: e.status, message: e.message } : { thrown: String(e) }; } };

    const owner = await HS.progressSummary(sb, deps, O, ADA, NOW);
    check(JSON.stringify(owner) === JSON.stringify({ first_passes_this_week: 2, average_first_passes_per_week: 1.3, average_homework_completion: 67, last_active: "2026-11-17T16:00:00.000Z" }),
      "Progress summary: a teacher on the class gets the student's four figures (2 first passes this week, 1.3 a week, 67% homework, last active 17 November at 4 pm), by the homework rule");
    const co = await HS.progressSummary(sb, deps, K, ADA, NOW);
    check(JSON.stringify(co) === JSON.stringify(owner) && T.homework_progress.length === 0,
      "Progress summary: a co-teacher gets exactly the same as the owner, and nothing is saved");
    const stranger = await problem(() => HS.progressSummary(sb, deps, X, ADA, NOW));
    const nobody = await problem(() => HS.progressSummary(sb, deps, O, "0000000a-0000-0000-0000-0000000099d9", NOW));
    const notId = await problem(() => HS.progressSummary(sb, deps, O, "Ada", NOW));
    check(stranger && stranger.status === 404 && nobody && nobody.status === 404 && stranger.message === nobody.message && notId && notId.status === 404,
      "Progress summary: a teacher who isn't on the class gets nothing (the same 404 as a student who doesn't exist)");
    const text = JSON.stringify(owner);
    const fresh = await HS.progressSummary(sb, deps, O, NEW, NOW);
    check(Object.keys(owner).sort().join() === "average_first_passes_per_week,average_homework_completion,first_passes_this_week,last_active" &&
      !/SECRET|secret code|t-a|t-b|maths|57d|c1a5|Ben|Ada|b1/.test(text) &&
      JSON.stringify(fresh) === JSON.stringify({ first_passes_this_week: 0, average_first_passes_per_week: 0, average_homework_completion: 0, last_active: null }),
      "Progress summary: the reply has only the four figures (no PIN, code, task ids, ids, names, other student's data or attempt log); a student with no attempts has none (last active null)");
    // Prompt 26: only homework set on or after the day the student joined (students.created_at) counts.
    T.students.find((s) => s.id === ADA).created_at = "2026-11-10T15:00:00Z";
    const sinceJoin = await HS.progressSummary(sb, deps, O, ADA, NOW);
    T.students.find((s) => s.id === ADA).created_at = "2026-11-20T09:00:00Z";
    const joinedLater = await HS.progressSummary(sb, deps, K, ADA, NOW);
    check(sinceJoin.average_homework_completion === 100 && joinedLater.average_homework_completion === null && Object.keys(sinceJoin).length === 4,
      "Progress summary (prompt 26): the homework average counts only homework set since the student joined (students.created_at): the 2 November homework drops out (100%), and with none since, it is null (\"No homework set since they joined\")");
    T.homework = [];
    check((await HS.progressSummary(sb, deps, O, ADA, NOW)).average_homework_completion === null, "Progress summary: with no homework set for the class, the homework figure is null");
  }

  // ---------- Homework counting on the server matches the browser (prompt 29) ----------
  // The same passes, every task type, level and phase, made with the app's own attemptRecord: the browser's count
  // (homework.js progress) and the server's (homework-server.js forStudent, on the rows backend.js sends) must agree.
  {
    const HS = require(path.join(ROOT, "supabase", "functions", "_shared", "homework-server.js"));
    const Sharing = require(path.join(ROOT, "supabase", "functions", "_shared", "class-sharing.js"));
    const Homework = require(path.join(ROOT, "homework.js"));
    const App = require(path.join(ROOT, "app.js"));
    const Rows = require(path.join(ROOT, "backend-rows.js"));
    const Curriculum = require(path.join(ROOT, "curriculum.js"));
    const deps = { Sharing, Homework, unitIds: Curriculum.UNITS.map((u) => u.id) };
    const all = require(path.join(ROOT, "tasks.json"));
    const isPl = (t) => (t.tags || []).includes("placement");
    const sb = fakeDb();
    const T = sb.t;
    const SID = "0000000a-0000-0000-0000-0000000057d9", CLS = "0000000a-0000-0000-0000-00000000c1a9";
    T.students.push({ id: SID, class_id: CLS, nickname: "Kit" });
    const NOW = Date.now();
    const hw = (id, units, count, extra) => Object.assign({ id, class_id: CLS, created_by: "t", task_count: count, due_on: Homework.ukDate(NOW + 3 * 86400000), units, created_at: new Date(NOW - 3600000).toISOString() }, extra);
    T.homework.push(hw("11111111-1111-1111-1111-1111111111a1", ["recursion"], 10), hw("11111111-1111-1111-1111-1111111111a2", [], 20),
      hw("11111111-1111-1111-1111-1111111111a3", ["recursion"], 3), hw("11111111-1111-1111-1111-1111111111a4", ["lists"], 10));
    let n = 0;
    const records = [];
    const pass = (task, phase, extra) => {
      const rec = Object.assign({ id: "r" + (++n), at: new Date(NOW - 3000000 + n * 60000).toISOString(), studentId: SID },
        App.attemptRecord({ task, unit: task.unit, phase, kind: "attempt", attemptNumber: 1, hints: 0, result: "pass", levelBefore: task.level, levelAfter: task.level }), extra);
      records.push(rec);
      T.attempts.push(Object.assign({ id: n, student_id: SID }, Rows.attemptToRow(rec)));
    };
    const pick = (f) => all.find((t) => f(t));
    // Recursion: placement, levels 1 to 10, every type it has; plus a repeat, an earlier pass and other units.
    pass(pick((t) => t.unit === "recursion" && isPl(t)), "placement");
    for (const type of ["predict", "fill", "parsons", "partial-parsons", "trace", "write"]) { const t = pick((x) => x.unit === "recursion" && !isPl(x) && x.type === type); if (t) pass(t, "practice"); }
    pass(pick((t) => t.unit === "recursion" && t.level === 10 && !isPl(t)), "endless");
    pass(pick((t) => t.unit === "recursion" && t.level === 1 && !isPl(t)), "practice");                                       // a repeat
    pass(pick((t) => t.unit === "recursion" && t.level === 9 && !isPl(t)), "practice", { at: new Date(NOW - 7200000).toISOString() }); // before it was set
    pass(pick((t) => !!t.error_kind && !isPl(t)), "practice");                                                                  // error-kind, another unit
    pass(pick((t) => t.unit === "selection" && t.type === "parsons" && !isPl(t)), "assignment", { assignmentId: "0000000a-0000-0000-0000-0000000000a5" });
    const browser = T.homework.map((h) => Homework.progress(Object.assign({}, h, { created_at: h.created_at }), records, []).done);
    const server = await HS.forStudent(sb, deps, SID);
    const browserById = Object.fromEntries(T.homework.map((h, i) => [h.id, browser[i]]));
    const serverById = Object.fromEntries(server.map((h) => [h.id, h.done]));
    check(Object.keys(browserById).every((id) => browserById[id] === serverById[id]) && server.length === 4 &&
      browserById["11111111-1111-1111-1111-1111111111a1"] >= 7 && browserById["11111111-1111-1111-1111-1111111111a3"] === 3 && browserById["11111111-1111-1111-1111-1111111111a4"] === 0 &&
      browserById["11111111-1111-1111-1111-1111111111a2"] === browserById["11111111-1111-1111-1111-1111111111a1"] + 2,
      "Homework counting (prompt 29): the server's count (homework-server.js on the rows backend.js sends) matches the browser's (homework.js) for the same passes: placement, every task type, levels 1 to 10, endless and assignment passes count; a repeat and an earlier pass don't; the cap and the units apply (" +
        JSON.stringify(browserById).replace(/1111111111a/g, "") + ")");
  }

  // ---------- Several classes at once (class-create.js, prompt 26) ----------
  // The real module the Classes page uses, against a stand-in for Supabase that does what the database does: the
  // teacher's own row-level security (migration 0002: a class's teacher_id must be the signed-in teacher, and it
  // defaults to them), and a new class code for each class (private.set_class_code).
  {
    const CC = require(path.join(ROOT, "class-create.js"));
    const db = { classes: [] };
    let codeN = 0;
    const signedInAs = (uid) => ({ from: (table) => {
      const q = { row: null };
      const b = { insert(row) { q.row = row; return b; }, select() { return b; }, single() { return b; },
        then(ok, bad) {
          return Promise.resolve().then(() => {
            if (table !== "classes" || !q.row) return { data: null, error: { code: "42501", message: "permission denied" } };
            if ("teacher_id" in q.row && q.row.teacher_id !== uid) return { data: null, error: { code: "42501", message: 'new row violates row-level security policy for table "classes"' } };
            if (Object.keys(q.row).some((k) => !["name", "end_of_year", "stage"].includes(k))) return { data: null, error: { code: "42501", message: "permission denied for table classes" } };
            const made = Object.assign({ id: "class-" + (db.classes.length + 1), class_code: "K" + String(++codeN).padStart(5, "0"), stage: "gcse" }, q.row, { teacher_id: uid });
            db.classes.push(made);
            return { data: { id: made.id, class_code: made.class_code }, error: null };
          }).then(ok, bad);
        } };
      return b; } });
    const OWNER = "teacher-owner", STRANGER = "teacher-stranger";
    const plan = CC.planBatch("11A, 11B, 11C", []);
    const done = await CC.createClasses(signedInAs(OWNER), plan.names, "a-level", true);
    check(done.created.map((c) => c.name).join() === "11A,11B,11C" && new Set(done.created.map((c) => c.class_code)).size === 3 && done.failed.length === 0 &&
      db.classes.length === 3 && db.classes.every((c) => c.teacher_id === OWNER && c.stage === "a-level"),
      "Several classes: the owner's batch makes one class per name, each with its own class code and the chosen stage, all in their name");
    const before = db.classes.length;
    const stranger = await CC.createClasses(signedInAs(STRANGER), ["12Z"], "gcse", true);
    const forged = await signedInAs(STRANGER).from("classes").insert({ name: "Owner's class", teacher_id: OWNER }).select("id, class_code").single();
    check(stranger.created.length === 1 && db.classes.length === before + 1 && db.classes[db.classes.length - 1].teacher_id === STRANGER &&
      db.classes.filter((c) => c.teacher_id === OWNER).length === 3 && forged.error && db.classes.length === before + 1,
      "Several classes: another teacher's batch makes classes only in their own name (the row sent has no teacher id, and a row naming someone else is refused)");
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

  // ---------- A flagged paste is a skip (prompt 10) ----------
  // The page records the flag (an event) and then the Skip button's record (an attempt: kind skip, result skipped), with
  // app.js's own attemptRecord. Both go to student-api as they always have: no new column, type or value.
  {
    const fs = require("fs");
    const App = require(path.join(ROOT, "app.js"));
    const Homework = require(path.join(ROOT, "homework.js"));
    const Curriculum = require(path.join(ROOT, "curriculum.js"));
    const rowsTs = fs.readFileSync(path.join(ROOT, "supabase", "functions", "_shared", "rows.ts"), "utf8");
    const specKeys = (name) => [...rowsTs.slice(rowsTs.indexOf("const " + name + ": Spec = {"), rowsTs.indexOf("};", rowsTs.indexOf("const " + name + ": Spec = {"))).matchAll(/^\s+(\w+): \{ kind:/gm)].map((m) => m[1]);
    const ATTEMPT_KEYS = specKeys("ATTEMPT"), EVENT_KEYS = specKeys("EVENT");
    const PASTE_PHASES = JSON.parse(rowsTs.match(/const PASTE_PHASES = (\[[^\]]*\])/)[1]);
    const m1 = fs.readFileSync(path.join(ROOT, "supabase", "migrations", "0001_schema.sql"), "utf8"), m5 = fs.readFileSync(path.join(ROOT, "supabase", "migrations", "0005_assignments.sql"), "utf8");
    const phases = m5.match(/check \(phase in \(([^)]*)\)\)/)[1].replace(/'/g, "").split(/,\s*/);
    const server = fakeServer();
    const p = openPage(server);
    await p.Backend.join("ABCDEF", "Pat");
    const sid = p.Backend.session().sid;
    const ASG = "0000000a-0000-0000-0000-0000000000a5";
    const task = { id: "if-L5a", unit: "selection", type: "write", level: 5, skills: [] };
    const flagged = (phase, extra) => {
      p.Store.logPasteFlag(Object.assign({ at: new Date(Date.now() - 1).toISOString(), studentId: sid, unit: "selection", units: ["selection"], taskId: task.id, lines: 1, homework: false, phase, homeworkId: null }, extra));
      p.Store.logAttempt(sid, App.attemptRecord({ task, unit: "selection", phase, kind: "skip", result: "skipped", attemptNumber: 0, hints: 0, levelBefore: 5, levelAfter: 5,
        assignmentId: phase === "assignment" ? ASG : undefined }));
    };
    flagged("practice");
    flagged("placement");
    flagged("practice", { lines: 3, homework: true, homeworkId: "0000000a-0000-0000-0000-0000000000b1" });
    flagged("assignment");
    await p.Backend.flush();
    const sentA = server.attempts[sid], sentE = server.events[sid].filter((r) => r.record_type === "paste_flag");
    check(sentA.length === 4 && sentA.every((r) => r.record_type === "skip" && r.result === "skipped" && r.student_level_before === 5 && r.student_level_after === 5 &&
      Object.keys(r).every((k) => ATTEMPT_KEYS.includes(k)) && phases.includes(r.phase) && (r.student_code == null) && r.failure_category == null) &&
      sentA.map((r) => r.phase).join() === "practice,placement,practice,assignment" && sentA[3].assignment_id === ASG &&
      /\(record_type = 'skip' and result = 'skipped'\)/.test(m1) && !p.Backend.pending(),
      "Paste flag: the flagged skip is sent to student-api as the Skip button's record (record_type skip, result skipped, the same level before and after) in practice, placement, homework and an assignment; every column is one the server already accepts (rows.ts), and no code is sent");
    check(sentE.length === 4 && sentE.every((r) => Object.keys(r).every((k) => EVENT_KEYS.includes(k)) && r.paste_lines > 0 && PASTE_PHASES.includes(r.paste_phase)) &&
      sentE.map((r) => r.paste_phase + ":" + r.paste_lines + ":" + r.paste_homework_id).join() ===
        "practice:1:null,placement:1:null,practice:3:0000000a-0000-0000-0000-0000000000b1,assignment:1:null" &&
      sentE.every((r, i) => Date.parse(r.timestamp) < Date.parse(sentA[i].timestamp) + 1),
      "Paste flag: the flag's details are stored as before (phase, line count, homework id), a one-line paste too (the server only needs more than 0 lines); the flag comes just before its skip");
    // Neither the secured score nor homework counts a skip: the same as with no record at all.
    const records = p.Store.attempts(sid);
    const now = Date.now();
    const hw = { created_at: new Date(now - 86400000).toISOString(), due_on: Homework.ukDate(now + 7 * 86400000), units: [], task_count: 2 };
    const flags = p.Store.pasteLog().filter((f) => f.studentId === sid);
    check(JSON.stringify(Secured.score(records, "selection", now)) === JSON.stringify(Secured.score([], "selection", now)) && !Secured.score(records, "selection", now).secured &&
      Homework.progress(hw, records, flags).done === 0 &&
      Homework.progress(hw, records.concat([Object.assign({}, records[0], { kind: "attempt", result: "pass", at: new Date(now + 60000).toISOString() })]), flags).done === 0 &&
      Curriculum.UNITS.some((u) => u.id === "selection"),
      "Paste flag: a flagged skip doesn't count towards the secured score (the same as no record) or homework (and the task can't count later either)");
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

  // ---------- Exam Mode on the server (student-api and teacher-api: _shared/exam-server.js, migration 0021, prompt EM2) ----------
  // The real module both functions run, with the site's own rules (exam.js) and questions (exam-mode.json), against an
  // in-memory database. tests/sql/exam-mode.sql checks the real tables: row-level security, the checks, the model-answer
  // trigger, deletes cascading and code being cleared after 30 days.
  {
    const fs = require("fs");
    const Sharing = require(path.join(ROOT, "supabase", "functions", "_shared", "class-sharing.js"));
    const ES = require(path.join(ROOT, "supabase", "functions", "_shared", "exam-server.js"));
    const ExamMode = require(path.join(ROOT, "exam.js"));
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, "exam-mode.json"), "utf8"));
    const deps = { Sharing, ExamMode, data };
    const sb = fakeDb();
    const T = sb.t;
    const id = (n) => "0000000" + n + "-0000-0000-0000-000000000001";
    const [O, K, X] = [id("a"), id("b"), id("c")];
    const CLA = "0000000a-0000-0000-0000-00000000c1a5", CLK = "0000000a-0000-0000-0000-00000000c1a7", CLX = "0000000c-0000-0000-0000-00000000c1a5";
    const ADA = "0000000a-0000-0000-0000-0000000057d1", BEN = "0000000a-0000-0000-0000-0000000057d2", CY = "0000000a-0000-0000-0000-0000000057d3";
    const KIT = "0000000a-0000-0000-0000-0000000057d7", XAVI = "0000000c-0000-0000-0000-0000000057d1";
    T.teachers.push({ id: O, name: "Owner O" }, { id: K, name: "Co-teacher K" }, { id: X, name: "Stranger X" });
    T.classes.push({ id: CLA, name: "10A", teacher_id: O, stage: "gcse", exam_mode: null }, { id: CLK, name: "8K", teacher_id: O, stage: "ks3", exam_mode: null },
      { id: CLX, name: "11X", teacher_id: X, stage: "gcse", exam_mode: null });
    T.class_teachers.push({ class_id: CLA, teacher_id: O }, { class_id: CLA, teacher_id: K }, { class_id: CLK, teacher_id: O }, { class_id: CLX, teacher_id: X });
    T.students.push({ id: ADA, class_id: CLA, nickname: "Ada", pin_hash: "SECRET-PIN", login_code_enc: "SECRET-CODE" }, { id: BEN, class_id: CLA, nickname: "Ben" },
      { id: CY, class_id: CLA, nickname: "Cy" }, { id: KIT, class_id: CLK, nickname: "Kit" }, { id: XAVI, class_id: CLX, nickname: "Xavi" });
    const problem = async (f) => { try { await f(); return null; } catch (e) { return e instanceof Sharing.Problem ? { status: e.status, problem: e.problem } : { thrown: String(e) }; } };
    const hash = async (code) => "hmac:" + code.length;
    const at = (min) => new Date(Date.parse("2026-11-20T10:00:00Z") + min * 60000).toISOString();
    let n = 0;
    // A row as exam.js sends it (ExamMode.toServerRow), from the points: [awarded, "auto" | "self" | "unsure"].
    const row = (q, rung, min, pts, extra, code) => ExamMode.toServerRow(Object.assign({ id: "x-t" + (++n) + "-abc", at: at(min), questionId: q, rung, attempt: 1, first: true,
      max: pts.length, points: pts.map(([a, how], i) => ({ id: "BP" + (i + 1), awarded: a, how })), help: false, notes: [], pasteFlag: false }, extra || {}), "C1", code);
    const six = (lost) => [1, 2, 3, 4, 5, 6].map((i) => [lost.includes(i) ? 0 : 1, "auto"]);

    // 1. The switch: the same rule as migration 0021's public.exam_mode_effective, for every stage and setting.
    const table = { "ks3|null": false, "gcse|null": true, "a-level|null": false, "null|null": true, "ks3|true": true, "gcse|true": true, "a-level|true": true, "null|true": true,
      "ks3|false": false, "gcse|false": false, "a-level|false": false, "null|false": false };
    const mig = fs.readFileSync(path.join(ROOT, "supabase", "migrations", "0021_exam_mode.sql"), "utf8");
    check(Object.entries(table).every(([k, want]) => { const [st, se] = k.split("|"); return ExamMode.examModeOn(st === "null" ? null : st, se === "null" ? null : se === "true") === want; }) &&
      /select coalesce\(p_setting, coalesce\(p_stage, 'gcse'\) = 'gcse'\)/.test(mig),
      "Exam Mode switch: the effective value for every stage and setting (null follows the stage: on for GCSE, off for KS3 and A-level; true or false wins), the same rule as the SQL function");
    const before = [await ES.examModeForStudent(sb, deps, ADA), await ES.examModeForStudent(sb, deps, KIT)];
    const turnedOn = await ES.setExamMode(sb, deps, O, CLK, true);
    const coOff = await ES.setExamMode(sb, deps, K, CLA, false);
    const after = [await ES.examModeForStudent(sb, deps, ADA), await ES.examModeForStudent(sb, deps, KIT)];
    const back = await ES.setExamMode(sb, deps, O, CLA, null);
    check(before.join() === "true,false" && turnedOn.on && turnedOn.setting === true && turnedOn.stage === "ks3" && coOff.on === false && after.join() === "false,true" &&
      back.setting === null && back.on && (await ES.examModeForStudent(sb, deps, ADA)),
      "Exam Mode switch: a GCSE class has it and a KS3 class doesn't; switching it on for the KS3 class shows it; a co-teacher can switch it too; null goes back to the stage's default");
    const strangerSet = await problem(() => ES.setExamMode(sb, deps, X, CLA, true));
    const badSet = await problem(() => ES.setExamMode(sb, deps, O, CLA, "yes"));
    check(strangerSet && strangerSet.status === 404 && badSet && badSet.status === 400 && badSet.problem === "setting" && T.classes.find((c) => c.id === CLA).exam_mode === null,
      "Exam Mode switch: a teacher who isn't on the class gets the same 404 as a class that doesn't exist; only true, false or null is taken");

    // 2. Saving rows: good ones saved, bad ones refused one by one, a resend saving nothing twice.
    const goodQ1 = row("C1-Q1", 5, 1, six([5, 6]), {}, "games = int(input())\nprint(games * 5)");
    const goodFull = row("C1-Q2", 5, 2, six([]), {}, "print('full marks: no code kept')");
    const part1 = row("C1-R1", 1, 3, [[1, "auto"], [1, "auto"], [0, "auto"], [1, "auto"]], { step: 1, help: true });
    const unsure = row("C1-Q1", 5, 4, [[1, "auto"], [null, "unsure"], [1, "self"], [1, "auto"], [1, "auto"], [1, "auto"]], { attempt: 2, first: false });
    const bad = {
      total: Object.assign({}, row("C1-Q1", 5, 5, six([])), { total: 5 }),
      recordId: Object.assign({}, row("C1-Q1", 5, 5, six([])), { record_id: "a-not-exam" }),
      step: Object.assign({}, row("C1-Q1", 5, 5, six([])), { step: 2 }),
      points: Object.assign({}, row("C1-Q1", 5, 5, six([])), { max: 7 }),
      nullAuto: Object.assign({}, row("C1-Q1", 5, 5, six([])), { points: six([]).map(([a], i) => ({ id: "BP" + (i + 1), awarded: i ? a : null, status: "auto" })), total: 5, auto_total: 5 }),
      autoTotal: Object.assign({}, row("C1-Q1", 5, 5, six([2])), { auto_total: 6 }),
      extra: Object.assign({}, row("C1-Q1", 5, 5, six([])), { teacher_mark: 6 }),
      notes: Object.assign({}, row("C1-Q1", 5, 5, six([])), { notes: ["Not A Note!"] }),
      question: Object.assign({}, row("C1-Q1", 5, 5, six([])), { question_id: "C1 Q1; drop table" }),
      rung: Object.assign({}, row("C1-Q1", 9, 5, six([]))),
    };
    const first = await ES.addAttempts(sb, ADA, [goodQ1, goodFull, part1, unsure, ...Object.values(bad)], { hash });
    const reasons = Object.fromEntries(first.rejected.map((r) => [r.record_id, r.reason]));
    const saved = T.exam_attempts.filter((r) => r.student_id === ADA);
    check(first.saved === 4 && first.rejected.length === Object.keys(bad).length && saved.length === 4 &&
      reasons[bad.total.record_id] === "bad total" && reasons["a-not-exam"] === "bad record_id" && reasons[bad.step.record_id] === "bad step" && reasons[bad.points.record_id] === "bad points" &&
      reasons[bad.nullAuto.record_id] === "bad points" && reasons[bad.autoTotal.record_id] === "bad auto_total" && reasons[bad.extra.record_id] === "bad teacher_mark" &&
      reasons[bad.notes.record_id] === "bad notes" && reasons[bad.question.record_id] === "bad question_id" && reasons[bad.rung.record_id] === "bad rung",
      "add_exam_attempts: good rows are saved and bad ones refused one by one, each with its reason (the sums of the points, ids, a step on rung 5, one point per mark, unknown columns, notes, rung)");
    const q1Row = saved.find((r) => r.record_id === goodQ1.record_id), fullRow = saved.find((r) => r.record_id === goodFull.record_id);
    check(q1Row.student_code && q1Row.code_hash === "hmac:" + q1Row.student_code.length && q1Row.total === 4 && q1Row.auto_total === 4 && q1Row.auto_max === 6 &&
      !("student_code" in fullRow) && fullRow.code_hash === null && saved.find((r) => r.record_id === unsure.record_id).auto_max === 4 &&
      saved.find((r) => r.record_id === part1.record_id).help_used === true,
      "add_exam_attempts: code is kept (with its hash) only for an attempt that lost marks; self-checked and unchecked points count in total but not in auto_total and auto_max; \"Say it simply\" is kept");
    const again = await ES.addAttempts(sb, ADA, [goodQ1, goodFull, part1, unsure], { hash });
    check(again.saved === 0 && again.rejected.length === 0 && T.exam_attempts.filter((r) => r.student_id === ADA).length === 4,
      "add_exam_attempts: a resent batch saves nothing twice (the same record_id)");
    check((await ES.addAttempts(sb, ADA, "not a list", { hash })) === null && (await ES.addAttempts(sb, ADA, new Array(501).fill(goodQ1), { hash })) === null,
      "add_exam_attempts: anything but a list of at most 500 rows is a bad request");

    // 3. Nothing after the model answer (decision 9): the try before it is kept, the one after is refused.
    T.events.push({ id: 900, student_id: ADA, record_type: "exam_model_seen", task_id: "C1-Q2", timestamp: at(10) });
    const beforeModel = row("C1-Q2", 5, 9, six([3]), { attempt: 2, first: false, notes: [ExamMode.ALWAYS_TRUE_NOTE] });
    const afterModel = row("C1-Q2", 5, 11, six([]), { attempt: 3, first: false });
    const otherQ = row("C1-Q1", 5, 12, six([]), { attempt: 3, first: false });
    const mr = await ES.addAttempts(sb, ADA, [beforeModel, afterModel, otherQ], { hash });
    check(mr.saved === 2 && mr.rejected.length === 1 && mr.rejected[0].record_id === afterModel.record_id && mr.rejected[0].reason === "after the model answer",
      "add_exam_attempts: a try made after the student opened that question's model answer is refused; a try before it, and other questions, are saved");

    // 4. The student's own records on another computer: their rows (no code), the model answers seen, the tutorial.
    T.events.push({ id: 901, student_id: ADA, record_type: "exam_tutorial_seen", task_id: null, timestamp: at(0) });
    await ES.addAttempts(sb, BEN, [row("C1-Q1", 5, 20, [[1, "auto"], [1, "auto"], [1, "auto"], [1, "auto"], [1, "auto"], [1, "self"]])], { hash });
    const own = await ES.forStudent(sb, ADA);
    check(own.attempts.length === 6 && own.attempts.every((r) => !("student_code" in r) && !("student_id" in r) && !("code_hash" in r)) &&
      own.model_seen.length === 1 && own.model_seen[0].question_id === "C1-Q2" && own.tutorial_seen === true && (await ES.forStudent(sb, BEN)).attempts.length === 1 &&
      (await ES.forStudent(sb, BEN)).tutorial_seen === false,
      "get_exam_progress: a student gets their own rows only (no code, hash or ids), the model answers they've opened and whether they've seen the tutorial");

    // 5. The teacher's overview, from a small fixed set: Ada (rungs 1 and 5: C1-Q1 4/6 then 6/6, C1-Q2 6/6 then 5/6
    //    after "always true"), Ben (C1-Q1 6/6 with one point self-checked), Cy (nothing).
    const ov = await ES.overview(sb, deps, O, CLA);
    const ada = ov.students.find((s) => s.nickname === "Ada").packs.C1, ben = ov.students.find((s) => s.nickname === "Ben").packs.C1, cy = ov.students.find((s) => s.nickname === "Cy").packs.C1;
    check(ov.students.map((s) => s.nickname).join() === "Ada,Ben,Cy" && ada.reached === 5 && ada.started && ada.first_pct === 83 && ada.best_pct === 100 && ada.full_tried === 2 &&
      ben.reached === 5 && ben.first_pct === 100 && !cy.started && cy.reached === 0 && cy.first_pct === null &&
      ov.average.C1.reached === 3.3 && ov.average.C1.first_pct === 92 && ov.average.C1.best_pct === 100 && ov.average.C1.students === 3 && ov.switch.on === true,
      "exam_overview: each student's rung reached (the landing card's rule) and first and best % on the full questions (Ada 83% then 100%); the class average row (rung 3.3, first 92%, best 100%)");
    const q1 = ov.missed.find((m) => m.question_id === "C1-Q1"), q2 = ov.missed.find((m) => m.question_id === "C1-Q2");
    check(q1.students === 2 && q1.points[0].pct === 50 && ["BP5", "BP6"].includes(q1.points[0].id) && q1.points.filter((p) => p.missed).length === 2 && q1.always_true === 0 &&
      q2.students === 1 && q2.points.every((p) => p.missed === 0) && q2.always_true === 0,
      "exam_overview: most-missed mark points from each student's FIRST attempt only (C1-Q1: BP5 and BP6 50%; Ada's later 5/6 on C1-Q2 isn't counted), most missed first");
    const help1 = ov.help.find((h) => h.question_id === "C1-Q1"), helpR1 = ov.help.find((h) => h.question_id === "C1-R1");
    check(help1.attempts === 4 && help1.self_pct === 13 && help1.help_pct === 0 && helpR1.help_pct === 100 && helpR1.rungs.join() === "1",
      "exam_overview: per question, the % of mark points students checked themselves (3 of 24: a checked one, an unchecked one, Ben's) and the % of attempts with \"Say it simply\"");
    // The always-true count: a first attempt with the marker's note.
    await ES.addAttempts(sb, BEN, [row("C1-Q2", 5, 21, six([3]), { notes: [ExamMode.ALWAYS_TRUE_NOTE] })], { hash });
    const ov2 = await ES.overview(sb, deps, O, CLA);
    check(ov2.missed.find((m) => m.question_id === "C1-Q2").always_true === 1 && ov2.missed.find((m) => m.question_id === "C1-Q2").points[0].id === "BP3",
      "exam_overview: the always-true loop test is counted as its own line (from the first attempt's note)");
    const flat = JSON.stringify(ov2);
    check(![ADA, BEN, CY, "SECRET", "student_code", "games = int", "hmac:"].some((x) => flat.includes(x)),
      "exam_overview: nicknames, numbers and question and mark-point ids only (no student id, PIN, login code or code)");
    const coView = await ES.overview(sb, deps, K, CLA);
    const strangerView = await problem(() => ES.overview(sb, deps, X, CLA));
    const otherClass = await ES.overview(sb, deps, X, CLX);
    check(JSON.stringify(coView) === JSON.stringify(ov2) && strangerView && strangerView.status === 404 && otherClass.students.map((s) => s.nickname).join() === "Xavi" &&
      !JSON.stringify(otherClass).includes("Ada"),
      "exam_overview: a co-teacher sees the same as the owner; a teacher who isn't on the class gets a 404; each class sees only its own students");

    // 6. One student's detail: their attempts, newest first, with code while it is kept; only for a student of that class.
    T.exam_attempts.find((r) => r.record_id === goodQ1.record_id).code_deleted_at = null;
    const oldOne = row("C1-Q1", 5, -60 * 24 * 40, six([1]), { attempt: 4, first: false });
    await ES.addAttempts(sb, ADA, [oldOne], { hash });
    Object.assign(T.exam_attempts.find((r) => r.record_id === oldOne.record_id), { student_code: null, code_deleted_at: at(0) });
    const det = await ES.studentDetail(sb, deps, O, CLA, ADA);
    const times = det.attempts.map((a) => Date.parse(a.at));
    check(det.nickname === "Ada" && det.attempts.length === 7 && times.every((t, i) => !i || times[i - 1] >= t) &&
      det.attempts.find((a) => a.question_id === "C1-Q1" && a.total === 4).code.includes("games") && det.attempts[det.attempts.length - 1].code === null &&
      det.attempts[det.attempts.length - 1].code_cleared === true && det.attempts.every((a) => Array.isArray(a.points) && "notes" in a && "help_used" in a),
      "exam_student_detail: the student's attempts, newest first, with points, notes and \"Say it simply\"; code while it is kept, and \"cleared\" after 30 days");
    const wrongClass = await problem(() => ES.studentDetail(sb, deps, O, CLA, XAVI));
    const strangerDetail = await problem(() => ES.studentDetail(sb, deps, X, CLA, ADA));
    const coDetail = await ES.studentDetail(sb, deps, K, CLA, ADA);
    check(wrongClass && wrongClass.status === 404 && strangerDetail && strangerDetail.status === 404 && coDetail.attempts.length === 7 &&
      !/SECRET/.test(JSON.stringify(coDetail)),
      "exam_student_detail: only for a student of that class (another class's student is a 404), and only for a teacher on the class (owner or co-teacher)");
  }

  // ---------- EM3: the Exam leaderboard, Exam Mode homework, assignments, the export, paste flags ----------
  {
    const fs = require("fs");
    const Sharing = require(path.join(ROOT, "supabase", "functions", "_shared", "class-sharing.js"));
    const ES = require(path.join(ROOT, "supabase", "functions", "_shared", "exam-server.js"));
    const HS = require(path.join(ROOT, "supabase", "functions", "_shared", "homework-server.js"));
    const X = require(path.join(ROOT, "exam.js"));
    const Homework = require(path.join(ROOT, "homework.js"));
    const TD = require(path.join(ROOT, "teacher-data.js"));
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, "exam-mode.json"), "utf8"));
    const NOW = Date.parse("2026-11-27T12:00:00Z");
    const ago = (days) => new Date(NOW - days * 86400000).toISOString();
    let k = 0;
    // A record as exam.js keeps it. pts: [awarded, how] per point; o: { first, help, pasteFlag, step, attempt, assignmentId }.
    const rec = (q, rung, at, pts, o) => Object.assign({ id: "x-r" + (++k) + "-abcdef", at, questionId: q, rung, attempt: 1, first: true, recorded: true, max: pts.length,
      total: pts.reduce((s, [a]) => s + (a || 0), 0), points: pts.map(([a, how], i) => ({ id: "p" + (i + 1), awarded: a, how })), help: false, pasteFlag: false, notes: [] }, o || {});
    const all1 = (n) => Array.from({ length: n }, () => [1, "auto"]);
    const half = [[1, "auto"], [0, "auto"]];
    // Five distinct first attempts in a window, each worth 2 auto marks, scoring the given numbers.
    const five = (q, days, scores) => scores.map((s, i) => rec(q + i, 5, ago(days + i * 0.1), [[s >= 1 ? 1 : 0, "auto"], [s >= 2 ? 1 : 0, "auto"]]));

    // 1. The leaderboard rule.
    const amy = five("A", 1, [2, 2, 2, 2, 2]);                                                   // 100% this week
    amy.push(rec("A0", 5, ago(1.5), [[0, "auto"], [0, "auto"]], { attempt: 2, first: false }));    // a retry: never counts (it would pull 100% down)
    const bob = five("B", 1, [1, 1, 1, 1, 1]);                                                   // 50%
    bob.push(rec("B9", 5, ago(2), [[1, "auto"], [1, "self"]]));                                  // self-marked left out: 1/1, so (5+1)/(10+1) = 55%
    const cat = five("C", 1, [2, 2, 2, 2, 2]).map((r) => Object.assign(r, { help: true }));    // "Say it simply": half marks, possible in full = 50%
    const dan = five("D", 1, [2, 2, 2, 2]);                                                       // only 4 questions: not on the board
    const eve = five("E", 1, [1, 1, 1, 1, 1]);                                                   // 50%: ties with Cat
    const fay = five("F", 1, [2, 2, 2, 2, 2]).concat(five("G", 8, [1, 1, 1, 1, 1]));            // this week 100%, last week 50%: +50
    const gus = five("H", 1, [1, 1, 1, 1, 1]).concat(five("I", 8, [2, 2, 2, 2, 2]));            // this week 50%, last week 100%: −50
    const hal = five("J", 1, [2, 2, 2, 2, 2]).concat(five("K", 8, [1, 1, 1, 1]));               // only 4 last week: not on Most improved
    const ivy = five("L", 1, [2, 2, 2, 2, 2]).map((r, i) => (i ? r : Object.assign(r, { pasteFlag: true })));  // 1 flagged first: 4 left, not on the board
    const boards = X.examBoards([{ nickname: "Amy", recs: amy, me: true }, { nickname: "Bob", recs: bob }, { nickname: "Cat", recs: cat }, { nickname: "Dan", recs: dan },
      { nickname: "Eve", recs: eve }, { nickname: "Fay", recs: fay }, { nickname: "Gus", recs: gus }, { nickname: "Hal", recs: hal }, { nickname: "Ivy", recs: ivy }], NOW);
    const avg = Object.fromEntries(boards.average.map((r) => [r.nickname, r]));
    check(avg.Amy.score === 100 && avg.Amy.me && avg.Bob.score === 55 && avg.Cat.score === 50 && avg.Eve.score === 50 && !avg.Dan && !avg.Ivy && avg.Fay.score === 75 && avg.Gus.score === 75 && avg.Hal.score === 78,
      "Exam leaderboard: first attempts only (a retry never counts), self-marked points left out of scored and possible (Bob 55%), \"Say it simply\" at half marks (Cat 50%), at least 5 questions (Dan, and Ivy once her paste-flagged first is left out, aren't on it)");
    check(avg.Cat.place === avg.Eve.place && boards.average.map((r) => r.place + ":" + r.nickname).join() === "1:Amy,2:Hal,3:Fay,3:Gus,5:Bob,6:Cat,6:Eve",
      "Exam leaderboard: ties share a place (1, 2, 3, 3, 5, 6, 6): " + boards.average.map((r) => r.place + " " + r.nickname + " " + r.score).join(", "));
    check(boards.improved.map((r) => r.nickname + ":" + X.improvedText(r.score)).join() === "Fay:+50,Gus:−50" && boards.min === 5,
      "Most improved: this week's % minus last week's, only with 5 questions in each week (Hal had 4 last week); shown as +50 and −50");

    // 2. Exam Mode homework (homework.js; the server's report and the student's count use it).
    const hw = { created_at: ago(5), due_on: Homework.ukDate(NOW + 2 * 86400000), units: [Homework.EXAM_SECTION], task_count: 6 };
    const ex = [
      { questionId: "C1-Q1", rung: 5, at: ago(4), total: 3 },                    // counts (first)
      { questionId: "C1-Q1", rung: 5, at: ago(3.9), total: 3 },                  // the same score: doesn't
      { questionId: "C1-Q1", rung: 5, at: ago(3.8), total: 5 },                  // higher than every earlier: counts
      { questionId: "C1-Q1", rung: 5, at: ago(3.7), total: 4 },                  // lower: doesn't
      { questionId: "C1-R4", rung: 4, step: 1, at: ago(3), total: 0 },           // each rung 4 step counts once
      { questionId: "C1-R4", rung: 4, step: 2, at: ago(3), total: 1 },
      { questionId: "C1-R1", rung: 1, step: 1, at: ago(9), total: 2 },           // before it was set: doesn't
      { questionId: "C1-R1", rung: 1, step: 1, at: ago(2), total: 2 },           // not higher than that earlier try: doesn't
      { questionId: "C1-Q2", rung: 5, at: ago(2), total: 6, pasteFlag: true },   // paste-flagged: doesn't
      { questionId: "C1-Q2", rung: 5, at: ago(1.9), total: 6 },                  // retyped, but not higher than the flagged one: doesn't
      { questionId: "C1-Q0", rung: 2, at: ago(1), total: 0 },                    // any rung counts, even 0 marks (it's one question answered)
    ];
    const pr = Homework.progress(hw, [], [], ex);
    check(pr.done === 5 && pr.taskIds.join() === "exam:C1-Q1|5|,exam:C1-Q1|5|,exam:C1-R4|4|1,exam:C1-R4|4|2,exam:C1-Q0|2|" && pr.units.join() === "exam-mode" &&
      pr.flagged.map((f) => f.taskId).join() === "exam:C1-Q2|5|",
      "Exam Mode homework: one task per question and rung (and step), the first recorded attempt counting; a retry only when higher than every earlier one; paste flags never (and still block a retype); only in the homework's time");
    // Due on 23 November (UK): the two bowling tries that day count; the rung 4 steps on the 24th don't.
    const late = Homework.progress(Object.assign({}, hw, { due_on: Homework.ukDate(NOW - 3.6 * 86400000) }), [], [], ex);
    const anyUnit = Homework.progress(Object.assign({}, hw, { units: [] }), [], [], ex);
    const practicePass = [{ kind: "attempt", result: "pass", at: ago(1), unit: "selection", units: ["selection"], taskId: "if-L3a" }];
    check(late.done === 2 && late.taskIds.join() === "exam:C1-Q1|5|,exam:C1-Q1|5|" && anyUnit.done === 0 && Homework.progress(hw, practicePass, [], []).done === 0 &&
      Homework.progress(Object.assign({}, hw, { units: ["selection", "exam-mode"] }), practicePass, [], ex).done === 6,
      "Exam Mode homework: nothing after the due date counts; only homework with the Exam Mode section counts Exam Mode (\"any unit\" means the practice units), and practice passes count only for practice units");
    const form = Homework.checkNew({ task_count: 5, due_on: Homework.ukDate(NOW + 86400000), units: ["exam-mode", "selection"] }, ["output", "selection"]);
    check(form.ok && form.homework.units.join() === "selection,exam-mode" && Homework.examTaskName("exam:C1-R4|4|2", () => "Football club goals") === "Exam Mode: Football club goals (rung 4, step 2)" &&
      Homework.examTaskName("exam:C1-Q1|5|") === "Exam Mode: C1-Q1 (full question)" && Homework.examTaskName("if-L3a") === null,
      "Homework form: Exam Mode is a section a teacher can pick; its tasks have readable names in the report");

    // The server: student-api's add_exam_attempts then the student's homework, and the teacher's report.
    const sb = fakeDb();
    const T = sb.t;
    const O = "0000000e-0000-0000-0000-000000000001", Z = "0000000e-0000-0000-0000-000000000002";
    const CL = "0000000e-0000-0000-0000-00000000c1a1", CZ = "0000000e-0000-0000-0000-00000000c1a2";
    const ANN = "0000000e-0000-0000-0000-0000000057d1", BEA = "0000000e-0000-0000-0000-0000000057d2", ZED = "0000000e-0000-0000-0000-0000000057d9";
    T.teachers.push({ id: O, name: "Owner" }, { id: Z, name: "Other" });
    T.classes.push({ id: CL, name: "10E", teacher_id: O, stage: "gcse", exam_mode: false }, { id: CZ, name: "10Z", teacher_id: Z, stage: "gcse", exam_mode: null });
    T.class_teachers.push({ class_id: CL, teacher_id: O }, { class_id: CZ, teacher_id: Z });
    T.students.push({ id: ANN, class_id: CL, nickname: "Ann" }, { id: BEA, class_id: CL, nickname: "Bea" }, { id: ZED, class_id: CZ, nickname: "Zed" });
    const ASG = "0000000e-0000-0000-0000-0000000000a1", ASZ = "0000000e-0000-0000-0000-0000000000a2";
    T.assignments.push({ id: ASG, class_id: CL, title: "Exam practice", task_ids: ["C1-Q1", "if-L3a"], status: "open" }, { id: ASZ, class_id: CZ, title: "Theirs", task_ids: ["C1-Q1"], status: "open" });
    const hwDeps = { Sharing, Homework, unitIds: require(path.join(ROOT, "curriculum.js")).UNITS.map((u) => u.id) };
    const made = await HS.create(sb, hwDeps, O, CL, { task_count: 2, due_on: Homework.ukDate(Date.now() + 7 * 86400000), units: ["exam-mode"] }, Homework.ukDate(Date.now()));
    const row = (q, rung, pts, o) => X.toServerRow(rec(q, rung, new Date(Date.now() + 1000).toISOString(), pts, o), "C1");
    // 3. An Exam Mode assignment item: saved with its assignment_id (the class switch is off: assignments still work).
    const r1 = await ES.addAttempts(sb, ANN, [row("C1-Q1", 5, all1(6), { assignmentId: ASG }), row("C1-Q2", 5, all1(6), { assignmentId: ASZ })], {});
    const saved = T.exam_attempts.filter((r) => r.student_id === ANN);
    check(r1.saved === 1 && r1.rejected.length === 1 && r1.rejected[0].reason === "bad assignment_id" && saved[0].assignment_id === ASG &&
      (await ES.forStudent(sb, ANN)).attempts[0].assignment_id === ASG && X.fromServerRow((await ES.forStudent(sb, ANN)).attempts[0]).assignmentId === ASG,
      "Assignments: an Exam Mode item's attempt is saved with its assignment_id (another class's assignment is refused), and comes back with it");
    const forAnn = await HS.forStudent(sb, hwDeps, ANN);
    await ES.addAttempts(sb, BEA, [row("C1-R4", 4, [[1, "auto"]], { step: 1 }), row("C1-Q1", 5, all1(6), { pasteFlag: true })], {});
    const report = await HS.report(sb, hwDeps, O, made.homework[0].id);
    const bea = report.students.find((s) => s.student_name === "Bea"), ann = report.students.find((s) => s.student_name === "Ann");
    check(made.homework[0].units.join() === "exam-mode" && forAnn[0].done === 1 && ann.done === 1 && ann.units.join() === "exam-mode" && bea.done === 1 &&
      bea.flagged.map((f) => f.task_id + "/" + f.unit).join() === "exam:C1-Q1|5|/exam-mode",
      "Exam Mode homework on the server: set as a section; the student's count and the teacher's report agree, with Exam Mode answers under the Exam Mode section and \"Paste flagged\" as elsewhere");

    // 4 and 5. The overview, the export and paste flags: left out of every score, still shown.
    const ov = await ES.overview(sb, { Sharing, ExamMode: X, data }, O, CL, Date.now());
    const beaOv = ov.students.find((s) => s.nickname === "Bea").packs.C1;
    check(beaOv.first_pct === null && beaOv.best_pct === null && beaOv.paste_flagged === 1 && ov.missed.find((m) => m.question_id === "C1-Q1").students === 1 &&
      ov.leaderboard && Array.isArray(ov.leaderboard.average),
      "Paste flags: a paste-flagged first attempt gives no pack score and isn't in the most-missed mark points, but is counted (paste_flagged) so it can be shown; the overview carries the Exam leaderboard");
    const sum = X.scoreSummary([rec("C1-Q1", 5, ago(2), all1(6), { pasteFlag: true }), rec("C1-Q1", 5, ago(1), half.concat(all1(4)), { attempt: 2, first: false })]);
    check(sum[0].first === null && sum[0].best.total === 5 && sum[0].pasteFlagged === 1,
      "My exam scores: a paste-flagged first attempt has no first score; the best is the best unflagged one; it says how many were flagged (shown \"Paste flagged\")");
    const tdData = { students: { s1: { name: "Ann" }, s2: { name: "Bea" } }, attempts: [], exam: { s1: [rec("C1-Q1", 5, ago(1), half.concat(all1(4)))], s2: [rec("C1-Q2", 5, ago(1), all1(6), { pasteFlag: true })] },
      pasteFlags: {}, homework: [hw] };
    const csv = TD.examExportCsv(tdData, data.packs, X, Homework);
    const lines = csv.trim().split(/\r?\n/);
    check(lines[0] === TD.EXAM_EXPORT_COLUMNS.join(",") && lines.some((l) => /^pack_score,Ann,C1,5,83,83,1,0,/.test(l)) && lines.some((l) => /^pack_score,Bea,C1,5,,,1,1,/.test(l)) &&
      lines.some((l) => /^mark_point,,C1,,,,,,C1-Q1,Strike Zone bowling,BP2,/.test(l)) && lines.filter((l) => /^homework,/.test(l)).length === 2 && !/print\(|SECRET|student_code/.test(csv),
      "Export: an Exam Mode CSV with the columns " + TD.EXAM_EXPORT_COLUMNS.length + " (pack scores per student, most-missed mark points, Exam Mode homework results); paste flags count towards no score; no code");
  }

  // ---------- Exam Mode in the student's browser (backend.js, prompt EM2) ----------
  // exam.js hands its rows to backend.js, which sends them with the rest of the student's work (the same outbox: sent
  // after a moment, kept until it arrives) and fetches them back on another computer.
  {
    const ExamMode = require(path.join(ROOT, "exam.js"));
    const srv = fakeServer();
    let p = openPage(srv);
    await p.Backend.join("ABCDEF", "Eve");
    const sid = p.Backend.session().sid;
    srv.examMode[sid] = false;
    p = openPage(srv, p.storage);
    await p.Backend.ready();
    check(p.Store.examMode(sid) === false, "get_progress: the class's Exam Mode switch is kept for the page (off: the menu item and exam.html are hidden)");
    srv.examMode[sid] = true;
    p = openPage(srv, p.storage);
    await p.Backend.ready();
    const rec = { id: "x-eve1-abcdef", at: new Date().toISOString(), questionId: "C1-Q1", rung: 5, attempt: 1, first: true, max: 6,
      points: [1, 1, 0, 1, 1, 1].map((a, i) => ({ id: "BP" + (i + 1), awarded: a, how: "auto" })), help: false, notes: ["int"], pasteFlag: true };
    const queued = p.Backend.queueExam(sid, ExamMode.toServerRow(rec, "C1", "print(1)"));
    p.Backend.queueExamEvent(sid, { record_id: "x-eve2-abcdef", record_type: "exam_model_seen", timestamp: new Date().toISOString(), task_id: "C1-Q1" });
    await p.Backend.flush();
    check(queued && p.Store.examMode(sid) === true && srv.exam[sid].length === 1 && srv.exam[sid][0].total === 5 && srv.exam[sid][0].student_code === "print(1)" &&
      srv.events[sid].some((e) => e.record_type === "exam_model_seen" && e.task_id === "C1-Q1") && srv.calls.includes("student-api:add_exam_attempts") && !p.Backend.pending(),
      "Exam Mode work goes through the outbox: attempts with add_exam_attempts, the model answer seen with add_events");
    p.Backend.queueExam(sid, ExamMode.toServerRow(rec, "C1", "print(1)"));
    await p.Backend.flush();
    const elsewhere = openPage(srv); // another computer
    await elsewhere.Backend.resume(srv.students[sid].code, "1234");
    const got = await elsewhere.Backend.examProgress();
    check(srv.exam[sid].length === 1 && got.status === 200 && got.body.attempts.length === 1 && got.body.model_seen[0].question_id === "C1-Q1" &&
      (() => { const row = ExamMode.scoreSummary(ExamMode.mergeRecords([], got.body.attempts.map((r) => ExamMode.fromServerRow(r))))[0]; return row.first === null && row.best === null && row.pasteFlagged === 1; })(),
      "Exam Mode: a resend is saved once, and another computer gets the same records (this paste-flagged try: no score, labelled, EM3)");
    // A shared computer: the next student's sign-in clears this one's Exam Mode records once they're all on their way.
    p.storage.setItem(p.Store.EXAM_PREFIX + sid, JSON.stringify({ attempts: [Object.assign({ queued: true }, rec)] }));
    const other = await p.Backend.join("ABCDEF", "Fin");
    check(other.status === 200 && p.storage.getItem(p.Store.EXAM_PREFIX + sid) === null && p.storage.getItem(p.Store.EXAM_MODE_PREFIX + sid) === null,
      "Exam Mode on a shared computer: the next student's sign-in removes the last one's Exam Mode records (all sent) and switch");
    const fin = p.Backend.session().sid;
    p.storage.setItem(p.Store.EXAM_PREFIX + fin, JSON.stringify({ attempts: [{ id: "x-old" }] }));
    await p.Backend.join("ABCDEF", "Gus");
    check(p.storage.getItem(p.Store.EXAM_PREFIX + fin) !== null, "Exam Mode records that haven't been sent yet (from before EM2) are kept for that student's next visit");
    const gus = p.Backend.session().sid;
    p.storage.setItem(p.Store.EXAM_PREFIX + gus, JSON.stringify({ attempts: [] }));
    await p.Backend.deleteMyProgress();
    check(p.storage.getItem(p.Store.EXAM_PREFIX + gus) === null, "Delete everything saved for me also removes this browser's Exam Mode records");
  }

  // ---------- The Edge Functions' allowed origins (the move to pythonsandladders.uk, 2026-11) ----------
  // _shared/origins.js is the list and the rule http.ts uses for every function (CORS headers and the 403).
  {
    const fs = require("fs");
    const Origins = require(path.join(ROOT, "supabase", "functions", "_shared", "origins.js"));
    const httpTs = fs.readFileSync(path.join(ROOT, "supabase", "functions", "_shared", "http.ts"), "utf8");
    const yes = ["https://pythonsandladders.uk", "https://www.pythonsandladders.uk", "https://theogoescoding.github.io", "http://localhost:8000"];
    const no = ["https://evil.example", "http://pythonsandladders.uk", "https://pythonsandladders.uk/", "https://pythonsandladders.uk.evil.example",
      "https://evilpythonsandladders.uk", "https://theogoescoding.github.io/pythonpractices", "https://theogoescoding.github.io.evil.example",
      "https://other.github.io", "http://localhost:8001", "null", "", null, undefined];
    check(yes.every((o) => Origins.allowed(o)) && no.every((o) => !Origins.allowed(o)) && Origins.ALLOWED_ORIGINS.length === yes.length &&
      Origins.ALLOWED_ORIGINS.every((o) => /^https?:\/\/[^/]+$/.test(o)) && Object.isFrozen(Origins.ALLOWED_ORIGINS),
      "Allowed origins: the new address (with and without www), the old GitHub Pages address (kept during the move) and localhost:8000 are accepted; any other origin, a path, http on the new domain, a look-alike or no origin is refused; every entry is an origin with no path");
    check(/import "\.\/origins\.js";/.test(httpTs) && (httpTs.match(/Origins\.allowed\(origin\)/g) || []).length === 2 && !/ALLOWED_ORIGINS = \[/.test(httpTs) &&
      fs.readdirSync(path.join(ROOT, "supabase", "functions")).filter((d) => !d.startsWith("_") && !d.startsWith(".")).every((d) => {
        const src = fs.readFileSync(path.join(ROOT, "supabase", "functions", d, "index.ts"), "utf8");
        return /from "\.\.\/_shared\/http\.ts"/.test(src) && /\bserve\(/.test(src) && !/Access-Control-Allow-Origin/.test(src);
      }),
      "Allowed origins: http.ts uses origins.js for both the CORS headers and the 403, and every function serves through http.ts (none sets its own CORS headers)");
  }

  const failed = out.filter((ok) => !ok).length;
  console.log(failed ? "\n" + failed + " of " + out.length + " backend client checks failed." : "\nAll " + out.length + " backend client checks passed.");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
