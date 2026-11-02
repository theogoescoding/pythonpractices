// Tests for backend.js (the student side of backend mode) against a fake server kept in memory. No network needed.
//   node tests/backend-client.js
"use strict";
const path = require("path");
const ROOT = path.join(__dirname, "..");

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
  const s = { offline: false, signOutAll: false, students: {}, progress: {}, passed: {}, attempts: {}, events: {}, calls: [] };
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
    if (fn === "join-class") {
      const sid = "stu-" + (++n);
      s.students[sid] = { nickname: body.nickname, code: String(10000000 + n), pin: "1234" };
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
      case "delete_my_progress": delete s.students[sid]; return reply(200, { deleted: true, message: "Deleted." });
      default: return reply(400, { error: "bad" });
    }
  };
  return s;
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
    Store, Rows, fetch: server.fetch, storage,
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
  page.Store.saveProgress(sid, progress);
  check(!page.Backend.pending(), "Saving progress that hasn't changed sends nothing");

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

  const failed = out.filter((ok) => !ok).length;
  console.log(failed ? "\n" + failed + " of " + out.length + " backend client checks failed." : "\nAll " + out.length + " backend client checks passed.");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
