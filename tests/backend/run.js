// Backend integration tests (section 12). Only run when TEST_BACKEND=1:
//   $env:TEST_BACKEND = "1"; node tests/backend/run.js
// Local stack by default (npx supabase start, then npx supabase functions serve --env-file <secrets file>).
// Set FUNCTIONS_ENV_FILE to that secrets file to also test an expired token (it needs SESSION_KEY to sign one).

if (process.env.TEST_BACKEND !== "1") {
  console.log("Backend tests skipped (set TEST_BACKEND=1 to run them).");
  process.exit(0);
}

const fs = require("fs");
const crypto = require("crypto");
const L = require("./lib.js");
const { T, call, fn, service, rest, makeTeacher, makeClass, join, deleteTeacher, clearRateLimits, test, assert, eq, results } = L;

const TABLES = ["teachers", "classes", "students", "progress", "passed_tasks", "attempts", "events", "code_reveals", "assignments"];
const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();
const DAY = 86400000;
let n = 0;
const rid = (p) => p + "-t" + Date.now().toString(36) + "-" + (n++).toString(36);

function attemptRow(extra) {
  return Object.assign({
    record_id: rid("a"), record_type: "attempt", timestamp: iso(), unit: "selection", task_units: ["selection"],
    task_id: "if-L3a", template_id: null, phase: "practice", task_type: "fill", task_level: 3, student_level_before: 3,
    student_level_after: 3, attempt_number: 1, result: "pass", hints_used: 0, misconception_matches: [],
  }, extra);
}

(async () => {
  console.log("Backend tests against the " + T.kind + " stack");
  const cleanup = [];
  try {
    const a = await makeTeacher("a"); cleanup.push(a);
    const b = await makeTeacher("b"); cleanup.push(b);
    const classA = await makeClass(a, "Class A");
    const classB = await makeClass(b, "Class B");
    const s1 = await join(classA, "Ada");
    const s2 = await join(classB, "Grace");

    await test("anon cannot read or write any table", async () => {
      for (const t of TABLES) {
        const read = await call("/rest/v1/" + t + "?select=*", { method: "GET" });
        assert(read.status === 401 || read.status === 403, t + " read gave " + read.status);
        const write = await call("/rest/v1/" + t, { body: {} });
        assert(write.status === 401 || write.status === 403, t + " write gave " + write.status);
      }
    });

    await test("a teacher sees only their own classes and students", async () => {
      const classes = await rest("/rest/v1/classes?select=id,name", a, { method: "GET" });
      eq(classes.body.map((c) => c.name), ["Class A"], "teacher A's classes");
      const students = await rest("/rest/v1/students?select=nickname", a, { method: "GET" });
      eq(students.body.map((s) => s.nickname), ["Ada"], "teacher A's students");
      const secret = await rest("/rest/v1/students?select=pin_hash", a, { method: "GET" });
      assert(secret.status === 401 || secret.status === 403, "pin_hash was readable: " + secret.status);
    });

    await test("join-class returns an 8-digit code, a 4-digit PIN and a token; the nickname is unique in the class", async () => {
      assert(/^[1-9]\d{7}$/.test(s1.code) && /^\d{4}$/.test(s1.pin) && s1.token, "bad join reply");
      await clearRateLimits();
      const again = await fn("join-class", { class_code: classA.class_code.toLowerCase(), nickname: "  ADA " });
      eq([again.status, again.body.error], [409, "That nickname is taken in this class. Try another one."], "taken nickname");
      const wrong = await fn("join-class", { class_code: "ZZZZZZ", nickname: "Somebody" });
      eq(wrong.status, 404, "unknown class");
    });

    await test("a class past its end_of_year can't be joined", async () => {
      const ended = await makeClass(a, "Ended", { end_of_year: iso(DAY).slice(0, 10) });
      await clearRateLimits();
      const r = await fn("join-class", { class_code: ended.class_code, nickname: "Late One" });
      eq(r.status, 404, "joined an ended class");
    });

    await test("the nickname filter blocks a word in several forms", async () => {
      for (const nick of ["Shit", "SHIT", "sh1t", "5hit", "Big Sh1t", "S H I T", "Nob", "n0b", "My Snapchat"]) {
        await clearRateLimits();
        const r = await fn("join-class", { class_code: classA.class_code, nickname: nick });
        eq([nick, r.status], [nick, 400], "nickname " + nick);
      }
      for (const nick of ["A", "Two  Spaces", "Zoë", "abcdefghijklmnopqrstu", "Bad!"]) {
        await clearRateLimits();
        const r = await fn("join-class", { class_code: classA.class_code, nickname: nick });
        eq([nick, r.status], [nick, 400], "nickname rule " + nick);
      }
      await clearRateLimits();
      const ok = await fn("join-class", { class_code: classA.class_code, nickname: "Scunthorpe 1" });
      eq(ok.status, 200, "a word containing a blocked word, but not that word, is allowed");
    });

    await test("resume signs a student in with their code and PIN", async () => {
      await clearRateLimits();
      const r = await fn("resume", { code: s1.code, pin: s1.pin });
      eq([r.status, r.body.nickname, r.body.class_name], [200, "Ada", "Class A"], "resume");
      const nobody = await fn("resume", { code: "12345678", pin: "1234" });
      eq([nobody.status, nobody.body.error], [401, "That code or PIN isn't right."], "unknown code");
    });

    await test("5 wrong PINs lock the account for 15 minutes, and the right PIN doesn't unlock it early", async () => {
      const s = await join(classA, "Lock Test");
      const wrong = String((Number(s.pin) + 1) % 10000).padStart(4, "0");
      await clearRateLimits();
      for (let i = 1; i <= 4; i++) {
        const r = await fn("resume", { code: s.code, pin: wrong });
        eq([i, r.status, r.body.error], [i, 401, "That code or PIN isn't right."], "wrong PIN " + i);
      }
      const fifth = await fn("resume", { code: s.code, pin: wrong });
      assert(fifth.status === 401 && /try again in 15 minutes/.test(fifth.body.error), "5th wrong PIN: " + JSON.stringify(fifth.body));
      const right = await fn("resume", { code: s.code, pin: s.pin });
      assert(right.status === 401 && /try again in 1[45] minutes/.test(right.body.error) && !right.body.token, "the right PIN opened a locked account");
      const lockedUntil = Date.parse(right.body.locked_until);
      assert(Math.abs(lockedUntil - (Date.now() + 15 * 60000)) < 60000, "lock isn't 15 minutes");
      s.lockTest = true;
      L.lockStudent = s;
    });

    await test("the lock is cleared by a correct PIN after the lock expires", async () => {
      const s = L.lockStudent;
      assert(s, "needs the lock test");
      const students = await service("/rest/v1/students?nickname=eq.Lock%20Test&class_id=eq." + classA.id, {
        method: "PATCH", body: { locked_until: iso(1000) }, headers: { Prefer: "return=representation" } });
      eq(students.body.length, 1, "set the lock into the past");
      await clearRateLimits();
      const r = await fn("resume", { code: s.code, pin: s.pin });
      eq(r.status, 200, "right PIN after the lock");
      const row = await service("/rest/v1/students?select=failed_pins,locked_until&id=eq." + students.body[0].id, { method: "GET" });
      eq(row.body, [{ failed_pins: 0, locked_until: null }], "count and lock cleared");
    });

    await test("tries sent at the same moment can't get more than 5 PIN guesses", async () => {
      const s = await join(classA, "Race Test");
      await clearRateLimits();
      const guesses = Array.from({ length: 12 }, (_, i) => String(i).padStart(4, "0")).filter((p) => p !== s.pin).slice(0, 10);
      const replies = await Promise.all(guesses.map((pin) => fn("resume", { code: s.code, pin })));
      const checked = replies.filter((r) => r.body && r.body.error && !/try again/.test(r.body.error)).length;
      assert(checked <= 4 && replies.every((r) => r.status === 401), "more than 5 guesses were checked: " + checked + " plain wrong replies");
    });

    await test("a student token can't read or write another student's data", async () => {
      const mine = await fn("student-api", { token: s1.token, action: "get_progress" });
      eq([mine.status, mine.body.student.nickname], [200, "Ada"], "own progress");
      // swap in the other student's id: the signature no longer matches
      const [payload, sig] = s1.token.split(".");
      const other = JSON.parse(Buffer.from(payload, "base64url").toString());
      other.sid = JSON.parse(Buffer.from(s2.token.split(".")[0], "base64url").toString()).sid;
      const forged = Buffer.from(JSON.stringify(other)).toString("base64url") + "." + sig;
      const r = await fn("student-api", { token: forged, action: "get_progress" });
      eq(r.status, 401, "forged token");
      // a student can only write rows for themselves: student_id in a row is refused
      const w = await fn("student-api", { token: s1.token, action: "add_attempts", rows: [attemptRow({ student_id: "x" })] });
      eq([w.status, w.body.saved, w.body.rejected.length], [200, 0, 1], "row with student_id");
      const g = await fn("student-api", { token: s2.token, action: "get_progress" });
      eq(g.body.attempts.length, 0, "student B got rows");
    });

    await test("an expired or tampered token is refused", async () => {
      const bad = [s1.token + "x", s1.token.replace(/^./, (c) => (c === "e" ? "f" : "e")), "", "abc", null, 42];
      for (const token of bad) {
        const r = await fn("student-api", { token, action: "get_progress" });
        eq(r.status, 401, "token " + JSON.stringify(token).slice(0, 20));
      }
      const envFile = process.env.FUNCTIONS_ENV_FILE;
      if (!envFile) { console.log("       (expired token: skipped, FUNCTIONS_ENV_FILE not set)"); return; }
      const key = Buffer.from(fs.readFileSync(envFile, "utf8").match(/^SESSION_KEY=(.+)$/m)[1].trim(), "base64");
      const sid = JSON.parse(Buffer.from(s1.token.split(".")[0], "base64url").toString()).sid;
      const payload = Buffer.from(JSON.stringify({ sid, exp: Math.floor(Date.now() / 1000) - 1 })).toString("base64url");
      const sig = crypto.createHmac("sha256", key).update(payload).digest("base64url");
      const r = await fn("student-api", { token: payload + "." + sig, action: "get_progress" });
      eq(r.status, 401, "expired token");
      const fresh = Buffer.from(JSON.stringify({ sid, exp: Math.floor(Date.now() / 1000) + 60 })).toString("base64url");
      const ok = await fn("student-api", { token: fresh + "." + crypto.createHmac("sha256", key).update(fresh).digest("base64url"), action: "get_progress" });
      eq(ok.status, 200, "a well-signed unexpired token works (so the expired one was refused for its time)");
    });

    await test("student-api saves progress, attempts, events and passed tasks, and a resent batch isn't doubled", async () => {
      const state = { level: 4, highest: 4, placement: { status: "done", startLevel: 3, used: ["sel-P2a"] }, completedTop: false, passedFingerprints: { "if-L3a": iso() } };
      eq((await fn("student-api", { token: s1.token, action: "save_progress", unit: "selection", state })).status, 200, "save_progress");
      eq((await fn("student-api", { token: s1.token, action: "save_progress", unit: "endless", state: { units: ["selection"], current: null, last: {} } })).status, 200, "save endless");
      const rows = [attemptRow({}), attemptRow({ result: "fail", failure_category: "WRONG_OUTPUT", failure_details: { test: 1 },
        misconception_matches: ["assign-vs-compare"], student_code: "x = 1\nprint(x)", student_output: "1", expected_output: "2",
        failed_test_number: 1, failed_test_inputs: ["5"], student_error_type: "", student_error_kind: "" })];
      const first = await fn("student-api", { token: s1.token, action: "add_attempts", rows });
      eq([first.status, first.body.saved, first.body.rejected], [200, 2, []], "add_attempts");
      const again = await fn("student-api", { token: s1.token, action: "add_attempts", rows });
      eq(again.status, 200, "resend");
      const events = [{ record_id: rid("l"), record_type: "level_change", timestamp: iso(), unit: "selection", task_id: "if-L3a",
        student_level_before: 3, student_level_after: 4, level_change_reason: "passes" },
        { record_id: rid("p"), record_type: "placement_reset", timestamp: iso(), unit: "selection" }];
      const ev = await fn("student-api", { token: s1.token, action: "add_events", rows: events });
      eq([ev.body.saved, ev.body.rejected.map((r) => r.reason)], [1, ["bad record_type"]], "a student can't add a placement_reset");
      eq((await fn("student-api", { token: s1.token, action: "mark_passed", unit: "selection", fingerprint: "if-L3a" })).status, 200, "mark_passed");
      await fn("student-api", { token: s1.token, action: "mark_passed", unit: "selection", fingerprint: "if-L3a" });
      const p = await fn("student-api", { token: s1.token, action: "get_progress" });
      eq(p.body.attempts.length, 2, "attempts not doubled");
      eq(p.body.passed, [{ unit: "selection", fingerprint: "if-L3a" }], "passed");
      eq(p.body.progress.map((x) => [x.unit, x.state.level ?? null]), [["endless", null], ["selection", 4]], "progress");
      eq(p.body.attempts[1].student_code, "x = 1\nprint(x)", "code kept");
      const hash = await service("/rest/v1/attempts?select=code_hash&record_id=eq." + rows[1].record_id, { method: "GET" });
      assert(/^[0-9a-f]{64}$/.test(hash.body[0].code_hash), "code_hash not made");
      const teacherView = await rest("/rest/v1/progress?select=unit,level,completed", a, { method: "GET" });
      eq(teacherView.body.find((x) => x.unit === "selection"), { unit: "selection", level: 4, completed: false }, "teacher reads the level");
    });

    await test("saved progress and JSON fields come back exactly as sent (same keys in the same order)", async () => {
      const state = { zeta: 1, level: 6, alpha: { y: 2, b: [3, { k: 1, c: 2 }] }, placement: { status: "done", startLevel: 6, used: [] }, completedTop: false };
      await fn("student-api", { token: s1.token, action: "save_progress", unit: "output", state });
      const row = attemptRow({ result: "fail", failure_category: "TYPE", failure_details: { types: ["str", "int"], line: 2, a: 1 }, failed_test_inputs: ["b", "a"] });
      await fn("student-api", { token: s1.token, action: "add_attempts", rows: [row] });
      const p = await fn("student-api", { token: s1.token, action: "get_progress" });
      eq(JSON.stringify(p.body.progress.find((x) => x.unit === "output").state), JSON.stringify(state), "state");
      eq(JSON.stringify(p.body.attempts.find((a) => a.record_id === row.record_id).failure_details), JSON.stringify(row.failure_details), "failure_details");
    });

    await test("attempts older than 30 days lose their program code and output, and keep their category and matches", async () => {
      const row = attemptRow({ result: "fail", failure_category: "NAME", failure_details: { name: "pritn" }, misconception_matches: ["m1"],
        student_code: "pritn(1)", student_output: "", timestamp: iso(31 * DAY) });
      await fn("student-api", { token: s1.token, action: "add_attempts", rows: [row] });
      await service("/rest/v1/attempts?record_id=eq." + row.record_id, { method: "PATCH", body: { created_at: iso(31 * DAY) } });
      const r = await service("/rest/v1/rpc/clear_old_program_code", { body: {} });
      assert(r.status === 200 && r.body >= 1, "clear_old_program_code: " + r.status + " " + JSON.stringify(r.body));
      const got = await service("/rest/v1/attempts?select=student_code,student_output,code_hash,failure_category,failure_details,misconception_matches,code_deleted_at&record_id=eq." + row.record_id, { method: "GET" });
      const g = got.body[0];
      eq([g.student_code, g.student_output, g.failure_category, g.failure_details, g.misconception_matches], [null, null, "NAME", { name: "pritn" }, ["m1"]], "after retention");
      assert(g.code_hash && g.code_deleted_at, "hash or code_deleted_at missing");
    });

    await test("reveal_codes shows the class's codes to its teacher only, and logs each reveal", async () => {
      const r = await fn("teacher-api", { action: "reveal_codes", class_id: classA.id }, { bearer: a.jwt });
      assert(r.status === 200 && r.body.codes.some((c) => c.nickname === "Ada" && c.code === s1.code), "codes: " + r.status);
      const other = await fn("teacher-api", { action: "reveal_codes", class_id: classB.id }, { bearer: a.jwt });
      eq(other.status, 404, "teacher A revealed class B");
      const anon = await fn("teacher-api", { action: "reveal_codes", class_id: classA.id });
      eq(anon.status, 401, "anon key revealed codes");
      const log = await rest("/rest/v1/code_reveals?select=student_id", a, { method: "GET" });
      eq(log.body.length, r.body.codes.length, "one reveal row per student");
    });

    await test("reset_pin gives a new PIN that works and clears a lock", async () => {
      const ada = (await rest("/rest/v1/students?select=id&nickname=eq.Ada", a, { method: "GET" })).body[0];
      eq((await fn("teacher-api", { action: "reset_pin", student_id: ada.id }, { bearer: b.jwt })).status, 404, "teacher B reset Ada's PIN");
      const r = await fn("teacher-api", { action: "reset_pin", student_id: ada.id }, { bearer: a.jwt });
      assert(r.status === 200 && /^\d{4}$/.test(r.body.pin), "reset_pin");
      await clearRateLimits();
      eq((await fn("resume", { code: s1.code, pin: r.body.pin })).status, 200, "new PIN works");
      s1.pin = r.body.pin;
    });

    await test("reset_placement lets the student take placement once more", async () => {
      const ada = (await rest("/rest/v1/students?select=id&nickname=eq.Ada", a, { method: "GET" })).body[0];
      eq((await fn("teacher-api", { action: "reset_placement", student_id: ada.id, unit: "selection" }, { bearer: b.jwt })).status, 404, "other teacher");
      const none = await fn("teacher-api", { action: "reset_placement", student_id: ada.id, unit: "maths" }, { bearer: a.jwt });
      eq(none.body, { reset: false }, "a unit not started");
      const r = await fn("teacher-api", { action: "reset_placement", student_id: ada.id, unit: "selection" }, { bearer: a.jwt });
      eq(r.body, { reset: true }, "reset");
      const p = await fn("student-api", { token: s1.token, action: "get_progress" });
      const st = p.body.progress.find((x) => x.unit === "selection").state;
      eq([st.placement.status, st.placement.used, st.level], ["pending", ["sel-P2a"], 4], "state after reset");
      const ev = await rest("/rest/v1/events?select=record_type&record_type=eq.placement_reset&student_id=eq." + ada.id, a, { method: "GET" });
      eq(ev.body.length, 1, "placement_reset event");
    });

    await test("import flags names to rename, saves nothing until they're fixed, and importing twice doesn't duplicate", async () => {
      const cls = await makeClass(a, "Import class");
      const bad = [{ file_id: "s-1", nickname: "Sam" }, { file_id: "s-2", nickname: "sam" }, { file_id: "s-3", nickname: "J" }, { file_id: "s-4", nickname: "  Kit  " }];
      const check = await fn("teacher-api", { action: "import_check", class_id: cls.id, students: bad }, { bearer: a.jwt });
      eq(check.body.students.map((s) => [s.nickname, s.status]), [["Sam", "duplicate"], ["sam", "duplicate"], ["J", "invalid"], ["Kit", "new"]], "import_check");
      const refused = await fn("teacher-api", { action: "import_students", class_id: cls.id, students: bad }, { bearer: a.jwt });
      eq(refused.status, 400, "import_students with flagged names");
      eq((await rest("/rest/v1/students?select=id&class_id=eq." + cls.id, a, { method: "GET" })).body.length, 0, "nothing saved");

      const good = [{ file_id: "s-1", nickname: "Sam" }, { file_id: "s-2", nickname: "Sam B" }, { file_id: "s-3", nickname: "Jo" }];
      const made = await fn("teacher-api", { action: "import_students", class_id: cls.id, students: good }, { bearer: a.jwt });
      assert(made.status === 200 && made.body.students.every((s) => s.new && /^\d{8}$/.test(s.code) && /^\d{4}$/.test(s.pin)), "import_students");
      const id = Object.fromEntries(made.body.students.map((s) => [s.file_id, s.student_id]));
      const data = {
        action: "import_data", class_id: cls.id,
        progress: [{ student_id: id["s-1"], unit: "selection", state: { level: 5, placement: null } }],
        passed: [{ student_id: id["s-1"], unit: "selection", fingerprint: "if-L3a" }],
        attempts: [Object.assign(attemptRow({ timestamp: "2026-10-01T09:00:00.000Z", student_code: "print(1)", result: "fail" }), { student_id: id["s-1"] }),
          Object.assign(attemptRow({ timestamp: iso(DAY) }), { student_id: id["s-2"] })],
        events: [{ student_id: id["s-1"], record_id: "l-1", record_type: "level_change", timestamp: "2026-10-01T09:00:05.000Z", unit: "selection",
          student_level_before: 4, student_level_after: 5, level_change_reason: "passes" },
          { student_id: id["s-1"], record_id: rid("p"), record_type: "placement_reset", timestamp: "2026-10-01T09:00:06.000Z", unit: "selection" }],
      };
      const first = await fn("teacher-api", data, { bearer: a.jwt });
      eq([first.status, first.body.attempts.saved, first.body.events.saved, first.body.progress.saved, first.body.passed.saved], [200, 2, 2, 1, 1], "first import");
      // an export made later numbers level changes differently (l-2, not l-1): still the same row
      data.events[0].record_id = "l-2";
      data.attempts = data.attempts.map((r) => Object.assign({}, r, { record_id: rid("a") }));
      data.progress[0].state = { level: 9 };
      const againNames = await fn("teacher-api", { action: "import_students", class_id: cls.id, students: good }, { bearer: a.jwt });
      assert(againNames.body.students.every((s) => !s.new && s.student_id === id[s.file_id]), "second import made new students");
      const second = await fn("teacher-api", data, { bearer: a.jwt });
      eq([second.body.attempts.saved, second.body.attempts.skipped, second.body.events.saved, second.body.events.skipped, second.body.progress.saved],
        [0, 2, 0, 2, 0], "second import");
      const counts = await Promise.all(["attempts", "events", "progress", "passed_tasks"].map((t) =>
        rest("/rest/v1/" + t + "?select=student_id&student_id=in.(" + Object.values(id).join(",") + ")", a, { method: "GET" })));
      eq(counts.map((c) => c.body.length), [2, 2, 1, 1], "rows after two imports");
      const old = await service("/rest/v1/attempts?select=student_code,code_hash&student_id=eq." + id["s-1"], { method: "GET" });
      assert(old.body[0].student_code === null && old.body[0].code_hash, "imported code older than 30 days should arrive cleared, with its hash");
      const imported = await rest("/rest/v1/students?select=imported&class_id=eq." + cls.id, a, { method: "GET" });
      assert(imported.body.every((s) => s.imported), "imported flag");
      const intoOther = await fn("teacher-api", Object.assign({}, data, { class_id: classB.id }), { bearer: a.jwt });
      eq(intoOther.status, 404, "import into another teacher's class");
    });

    await test("an export from the backend matches an export from local mode", async () => {
      const path = require("path");
      const mem = new Map();
      const before = globalThis.localStorage;
      globalThis.localStorage = { get length() { return mem.size; }, key: (i) => [...mem.keys()][i] || null,
        getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
      for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(L.ROOT, "tests", "fixtures", "saved-data-v1.json"), "utf8")))) mem.set(k, v);
      const req = (f) => { delete require.cache[path.join(L.ROOT, f)]; return require(path.join(L.ROOT, f)); };
      const Store = req("store.js"), TD = req("teacher-data.js"), Rows = req("backend-rows.js"), C = req("curriculum.js");
      const local = TD.collect(Store, C.UNITS);
      globalThis.localStorage = before;

      // Each saved student joins a new class and sends their data as backend.js would.
      const cls = await makeClass(a, "Parity class");
      const idOf = {};
      for (const [lid, s] of Object.entries(local.students)) {
        const j = await join(cls, s.name);
        idOf[lid] = JSON.parse(Buffer.from(j.token.split(".")[0], "base64url").toString()).sid;
        const send = (action, rows) => fn("student-api", { token: j.token, action, rows });
        const att = await send("add_attempts", local.attempts.filter((x) => x.studentId === lid).map(Rows.attemptToRow));
        const ev = await send("add_events", [...local.levelLog.filter((e) => e.studentId === lid).map((e) => Rows.levelToRow(e)),
          ...local.buttonLog.filter((e) => e.studentId === lid).map(Rows.buttonToRow),
          ...local.placementLog.filter((e) => e.studentId === lid && e.kind !== "reset").map(Rows.placementToRow)]);
        assert(att.body.rejected.length === 0 && ev.body.rejected.length === 0, "rows rejected: " + JSON.stringify([att.body.rejected, ev.body.rejected]));
        for (const p of Rows.progressToRows(local.progress[lid])) await fn("student-api", { token: j.token, action: "save_progress", unit: p.unit, state: p.state });
        // placement resets are made by the teacher
        for (const e of local.placementLog.filter((x) => x.studentId === lid && x.kind === "reset")) {
          const r = await rest("/rest/v1/events", a, { body: Object.assign(Rows.placementToRow(e), { student_id: idOf[lid] }) });
          eq(r.status, 201, "teacher adds the placement reset");
        }
      }

      // The teacher view's queries (teacher-backend.js), as teacher A.
      const get = async (q) => (await rest("/rest/v1/" + q, a, { method: "GET" })).body;
      const inClass = "students!inner(class_id)&students.class_id=eq." + cls.id;
      const rows = {
        students: await get("students?select=id,nickname,created_at&class_id=eq." + cls.id + "&order=created_at,id"),
        progress: await get("progress?select=student_id,unit,state," + inClass),
        attempts: await get("attempts?select=*," + inClass + "&order=id"),
        events: await get("events?select=*," + inClass + "&order=id"),
      };
      const back = Rows.teacherData(rows, C.UNITS);
      const want = TD.fullExportCsv(local).replace(new RegExp(Object.keys(idOf).join("|"), "g"), (m) => idOf[m]);
      const got = TD.fullExportCsv(back);
      const w = want.split("\r\n"), g = got.split("\r\n");
      const first = w.findIndex((line, i) => line !== g[i]);
      eq([w.length, first], [g.length, -1], "export lines (first difference: " + (first >= 0 ? w[first] + "  vs  " + g[first] : "none") + ")");
    });

    await test("assignments: a teacher sets them for their own class; students get only their class's open ones", async () => {
      const made = await rest("/rest/v1/assignments", a, { body: { class_id: classA.id, title: "Week 3", description: "Commas", task_ids: ["out-L1e", "var-L9c"] } });
      eq(made.status, 201, "teacher A makes an assignment");
      const aid = made.body[0].id;
      const other = await rest("/rest/v1/assignments", a, { body: { class_id: classB.id, title: "Not mine", task_ids: ["var-L9c"] } });
      assert(other.status === 401 || other.status === 403, "teacher A made one for class B: " + other.status);
      const bAs = await rest("/rest/v1/assignments", b, { body: { class_id: classB.id, title: "B's", task_ids: ["var-L9c"] } });
      eq(bAs.status, 201, "teacher B makes one");
      eq((await rest("/rest/v1/assignments?select=title", b, { method: "GET" })).body.map((x) => x.title), ["B's"], "teacher B sees only theirs");
      const p1 = await fn("student-api", { token: s1.token, action: "get_progress" });
      eq(p1.body.assignments.map((x) => [x.title, x.task_ids]), [["Week 3", ["out-L1e", "var-L9c"]]], "Ada gets her class's open assignment");
      eq((await fn("student-api", { token: s2.token, action: "get_assignments" })).body.assignments.map((x) => x.title), ["B's"], "Grace gets only hers");
      // Attempts: on her own class's assignment, saved with its id; on another class's, refused.
      const ok = attemptRow({ phase: "assignment", assignment_id: aid, unit: "variables", task_id: "var-L9c", task_units: ["variables"] });
      const wrong = attemptRow({ phase: "assignment", assignment_id: bAs.body[0].id, unit: "variables", task_id: "var-L9c", task_units: ["variables"] });
      const sent = await fn("student-api", { token: s1.token, action: "add_attempts", rows: [ok, wrong] });
      eq([sent.body.saved, sent.body.rejected.map((r) => r.reason)], [1, ["bad assignment_id"]], "add_attempts");
      const seen = await rest("/rest/v1/attempts?select=assignment_id,phase&record_id=eq." + ok.record_id, a, { method: "GET" });
      eq(seen.body, [{ assignment_id: aid, phase: "assignment" }], "the teacher reads the attempt with its assignment id");
      // Closing it: students no longer get it.
      eq((await rest("/rest/v1/assignments?id=eq." + aid, a, { method: "PATCH", body: { status: "closed" } })).status, 200, "close");
      eq((await fn("student-api", { token: s1.token, action: "get_progress" })).body.assignments, [], "closed assignments aren't sent");
    });

    await test("delete_my_progress deletes the student and everything saved for them", async () => {
      const s = await join(classA, "Leaver");
      await fn("student-api", { token: s.token, action: "add_attempts", rows: [attemptRow({})] });
      const r = await fn("student-api", { token: s.token, action: "delete_my_progress" });
      assert(r.status === 200 && r.body.deleted, "delete");
      eq((await fn("student-api", { token: s.token, action: "get_progress" })).status, 401, "token after delete");
      eq((await rest("/rest/v1/students?select=id&nickname=eq.Leaver", a, { method: "GET" })).body.length, 0, "student row gone");
    });

    await test("CORS allows only the GitHub Pages site and localhost:8000", async () => {
      // The local gateway (Kong) answers preflights itself and rewrites Access-Control-Allow-Origin to *, so the
      // headers can only be checked exactly on the test project. The 403 for other origins comes from the function.
      if (T.kind === "local") console.log("       (local gateway sets Access-Control-Allow-Origin: *; exact headers are checked on the test project)");
      for (const [origin, allowed] of [["https://theogoescoding.github.io", true], ["http://localhost:8000", true],
        ["https://evil.example", false], ["https://theogoescoding.github.io.evil.example", false], ["http://localhost:8001", false]]) {
        await clearRateLimits();
        const r = await fn("resume", { code: "1", pin: "1" }, { headers: { Origin: origin } });
        eq([origin, r.status], [origin, allowed ? 401 : 403], "request from " + origin);
        if (T.kind === "local") continue;
        const pre = await call("/functions/v1/resume", { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST" } });
        eq([origin, pre.headers.get("access-control-allow-origin")], [origin, allowed ? origin : null], "preflight");
        eq([origin, r.headers.get("access-control-allow-origin")], [origin, allowed ? origin : null], "response header");
      }
    });

    // The limit is read from the function code, so this test follows it if it changes.
    const LIMIT = Number(fs.readFileSync(require("path").join(L.ROOT, "supabase", "functions", "_shared", "limits.ts"), "utf8")
      .match(/RATE_LIMIT_HITS = (\d+)/)[1]);
    await test("join-class and resume allow " + LIMIT + " requests per IP every 10 minutes", async () => {
      for (const name of ["resume", "join-class"]) {
        await clearRateLimits();
        const body = name === "resume" ? { code: "00000000", pin: "0000" } : { class_code: "ZZZZZZ", nickname: "Nobody" };
        const statuses = [];
        for (let i = 0; i < LIMIT + 1; i += 20) {
          const n = Math.min(20, LIMIT + 1 - i);
          statuses.push(...(await Promise.all(Array.from({ length: n }, () => fn(name, body)))).map((r) => r.status));
        }
        eq([name, statuses.filter((s) => s === 429).length, statuses.length], [name, 1, LIMIT + 1], "only request " + (LIMIT + 1) + " is refused");
      }
      await clearRateLimits();
    });
  } finally {
    for (const t of cleanup) await deleteTeacher(t); // cascades to their classes, students and data
  }
  const failed = results.filter(([ok]) => !ok).length;
  console.log(failed ? failed + " of " + results.length + " backend tests failed" : "All " + results.length + " backend tests passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("Backend tests stopped: " + e.message); process.exit(1); });
