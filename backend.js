// Backend mode for students (config.js BACKEND_ENABLED = true). Load it straight after store.js.
// Store keeps its synchronous API: its localStorage keys become a cache of the signed-in student's data, filled from
// student-api get_progress when a page opens (Store.whenReady). Every write also goes into an outbox kept in
// localStorage, which is sent to student-api a moment after it changes (so after each task), and again until it
// arrives. Nothing is lost if the network drops: the outbox stays until the server has it.
// Each student's outbox keeps that student's token, so on a shared computer the next student can't send it as theirs.
// In local mode (no config, or BACKEND_ENABLED false) this file changes nothing.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else root.Backend = factory({ config: root.APP_CONFIG, Store: root.Store, Rows: root.BackendRows, fetch: root.fetch && root.fetch.bind(root) });
})(typeof self !== "undefined" ? self : this, function (deps) {
  const config = deps.config || {};
  const Store = deps.Store;
  const Rows = deps.Rows;
  const enabled = !!(config.BACKEND_ENABLED && config.SUPABASE_URL && config.SUPABASE_ANON_KEY);
  if (!enabled) return { enabled: false };

  const storage = () => deps.storage || globalThis.localStorage;
  const SESSION_KEY = "pyPractice.session.v1";   // { token, expires_at, sid, nickname, class_name } (never the PIN)
  const OUTBOX_PREFIX = "pyPractice.outbox.v1."; // + student id → { token, expires_at, ops: [...] }
  const SYNCED_PREFIX = "pyPractice.synced.v1."; // + student id → { units: { unit: JSON last queued }, passed: { "unit|fp": 1 } }
  const SEND_AFTER_MS = 1500;
  const RETRY_MS = [5000, 15000, 30000, 60000];
  const MAX_ROWS_PER_SEND = 200;

  const read = (k) => { try { const v = storage().getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  const write = (k, v) => { try { storage().setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const remove = (k) => { try { storage().removeItem(k); } catch (e) { /* ignore */ } };
  const keys = () => { const out = []; try { for (let i = 0; i < storage().length; i++) out.push(storage().key(i)); } catch (e) { /* ignore */ } return out; };

  // ---------- Calls ----------
  async function api(fn, body, opts) {
    try {
      const res = await (deps.fetch || globalThis.fetch)(config.SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/" + fn, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.SUPABASE_ANON_KEY, Authorization: "Bearer " + config.SUPABASE_ANON_KEY },
        body: JSON.stringify(body),
        keepalive: !!(opts && opts.keepalive),
      });
      let json = null;
      try { json = await res.json(); } catch (e) { /* empty */ }
      return { status: res.status, body: json || {} };
    } catch (e) {
      return { status: 0, body: { error: "Couldn't reach the server. Check your internet connection." } };
    }
  }

  // ---------- Session ----------
  const sidOf = (token) => { try { return JSON.parse(atob(token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))).sid; } catch (e) { return null; } };
  function session() {
    const s = read(SESSION_KEY);
    return s && s.token && Date.parse(s.expires_at) > Date.now() ? s : null;
  }

  // Makes the signed-in student the only one Store knows about, and clears another student's cached data.
  function setSession(reply) {
    const sid = sidOf(reply.token);
    const old = read(SESSION_KEY);
    if (old && old.sid && old.sid !== sid) clearCache(old.sid);
    write(SESSION_KEY, { token: reply.token, expires_at: reply.expires_at, sid, nickname: reply.nickname, class_name: reply.class_name });
    write(Store.STUDENTS_KEY, { [sid]: { name: reply.nickname, created: new Date().toISOString() } });
    Store.setCurrent(sid);
    const box = read(OUTBOX_PREFIX + sid);
    if (box) write(OUTBOX_PREFIX + sid, Object.assign(box, { token: reply.token, expires_at: reply.expires_at }));
    signedOut = false;
    return sid;
  }

  // Removes what this browser keeps for a student, except their unsent outbox.
  function clearCache(sid) {
    remove(Store.PROGRESS_PREFIX + sid);
    remove(Store.ATTEMPTS_PREFIX + sid);
    remove(SYNCED_PREFIX + sid);
    remove(Store.ASSIGNMENTS_PREFIX + sid);
    remove(Store.ASSIGNMENT_WORK_PREFIX + sid);
    for (const k of [Store.LEVEL_LOG_KEY, Store.BUTTON_LOG_KEY, Store.PLACEMENT_LOG_KEY]) {
      const log = read(k);
      if (Array.isArray(log)) write(k, log.filter((e) => e.studentId !== sid));
    }
    remove(Store.STUDENTS_KEY);
  }

  // A sign-in can fail with a 5xx when the server is briefly overloaded: Supabase answers 546 when a function worker
  // hits its limit, as can happen when a whole class signs in at once. resume is safe to send again, so it is retried
  // up to SIGN_IN_RETRIES times after a short random pause (so a class's retries don't all arrive together).
  // join-class is not retried: a join that failed after the student was made would come back as a taken nickname.
  const RETRY_STATUSES = [500, 502, 503, 504, 546];
  const SIGN_IN_RETRIES = 2;
  const wait = deps.sleep || ((ms) => new Promise((res) => setTimeout(res, ms)));
  async function signIn(fn, body) {
    let r = await api(fn, body);
    for (let i = 0; fn === "resume" && i < SIGN_IN_RETRIES && RETRY_STATUSES.includes(r.status); i++) {
      await wait(400 + Math.random() * 800);
      r = await api(fn, body);
    }
    if (r.status === 200) setSession(r.body);
    return r;
  }
  const join = (classCode, nickname) => signIn("join-class", { class_code: classCode, nickname });
  const resume = (code, pin) => signIn("resume", { code, pin });

  async function signOut() {
    const s = session();
    if (s) { await flush(); clearCache(s.sid); }
    remove(SESSION_KEY);
    try { storage().removeItem(Store.CURRENT_KEY); } catch (e) { /* ignore */ }
  }

  async function deleteMyProgress() {
    const s = session();
    if (!s) return { status: 401, body: {} };
    const r = await api("student-api", { token: s.token, action: "delete_my_progress" });
    if (r.status === 200) {
      remove(OUTBOX_PREFIX + s.sid);
      clearCache(s.sid);
      remove(SESSION_KEY);
      remove(Store.CURRENT_KEY);
    }
    return r;
  }

  // ---------- Outbox ----------
  // ops: { type: "attempt" | "event", row } | { type: "progress", unit, state } | { type: "passed", unit, fingerprint }
  let signedOut = false;
  let timer = null;
  let retry = 0;
  let sending = null;
  const listeners = [];
  const emit = (what) => listeners.forEach((f) => { try { f(what); } catch (e) { /* ignore */ } });

  function enqueue(sid, op) {
    const s = session();
    const box = read(OUTBOX_PREFIX + sid) || { ops: [] };
    if (s && s.sid === sid) Object.assign(box, { token: s.token, expires_at: s.expires_at });
    if (op.type === "progress") box.ops = box.ops.filter((o) => !(o.type === "progress" && o.unit === op.unit)); // only the latest
    box.ops.push(op);
    if (!write(OUTBOX_PREFIX + sid, box)) memoryOutbox[sid] = box; // storage full: keep it for this page at least
    schedule(SEND_AFTER_MS);
  }
  const memoryOutbox = {};

  function schedule(ms) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; flush(); }, ms);
  }

  // Sends every outbox whose token is still valid. Resolves when done (or when it has to wait to try again).
  function flush(opts) {
    if (!sending) sending = sendAll(opts).finally(() => { sending = null; });
    return sending;
  }

  async function sendAll(opts) {
    const boxKeys = keys().filter((k) => k && k.startsWith(OUTBOX_PREFIX));
    let wait = false;
    for (const k of boxKeys) {
      const sid = k.slice(OUTBOX_PREFIX.length);
      const result = await sendBox(sid, opts);
      if (result === "retry") wait = true;
    }
    for (const sid of Object.keys(memoryOutbox)) {
      if (write(OUTBOX_PREFIX + sid, memoryOutbox[sid])) delete memoryOutbox[sid];
    }
    if (wait) { schedule(RETRY_MS[Math.min(retry, RETRY_MS.length - 1)]); retry++; } else retry = 0;
    emit(pending() ? "pending" : "saved");
  }

  async function sendBox(sid, opts) {
    for (;;) {
      const box = read(OUTBOX_PREFIX + sid);
      if (!box || !box.ops.length) { remove(OUTBOX_PREFIX + sid); return "done"; }
      if (!box.token || Date.parse(box.expires_at) <= Date.now()) {
        if ((session() || {}).sid === sid) { signedOut = true; emit("signed-out"); }
        return "waiting"; // kept until this student signs in again
      }
      const first = box.ops[0];
      let n = 1;
      let body;
      if (first.type === "attempt" || first.type === "event") {
        while (n < box.ops.length && n < MAX_ROWS_PER_SEND && box.ops[n].type === first.type) n++;
        body = { action: first.type === "attempt" ? "add_attempts" : "add_events", rows: box.ops.slice(0, n).map((o) => o.row) };
      } else if (first.type === "progress") {
        body = { action: "save_progress", unit: first.unit, state: first.state };
      } else {
        body = { action: "mark_passed", unit: first.unit, fingerprint: first.fingerprint };
      }
      const r = await api("student-api", Object.assign({ token: box.token }, body), opts);
      if (r.status === 401) {
        if ((session() || {}).sid === sid) { signedOut = true; emit("signed-out"); }
        return "waiting";
      }
      if (r.status === 0 || r.status === 429 || r.status >= 500) return "retry";
      if (r.status !== 200) console.warn("Not saved (the server refused it):", body.action, r.body.error);
      if (r.body && r.body.rejected && r.body.rejected.length) console.warn("Some rows weren't saved:", r.body.rejected);
      // Sent (or refused for good): take those ops off the front, keeping anything queued meanwhile.
      const now = read(OUTBOX_PREFIX + sid) || { ops: [] };
      now.ops = now.ops.slice(n);
      write(OUTBOX_PREFIX + sid, now);
    }
  }

  const pending = () => keys().some((k) => k && k.startsWith(OUTBOX_PREFIX) && ((read(k) || {}).ops || []).length > 0);

  // ---------- Store writes also go to the outbox ----------
  const orig = {
    saveProgress: Store.saveProgress, logAttempt: Store.logAttempt, logLevelChange: Store.logLevelChange,
    logButton: Store.logButton, logPlacement: Store.logPlacement,
  };
  const mine = (sid) => (session() || {}).sid === sid;
  const now = () => new Date().toISOString();

  // Queues each unit whose state changed since it was last queued, and each newly passed fingerprint.
  function queueProgress(sid, progress) {
    const synced = read(SYNCED_PREFIX + sid) || { units: {}, passed: {} };
    for (const { unit, state } of Rows.progressToRows(progress)) {
      const json = JSON.stringify(state);
      if (synced.units[unit] !== json) { synced.units[unit] = json; enqueue(sid, { type: "progress", unit, state }); }
      if (unit === "endless") continue;
      for (const fp of Object.keys(state.passedFingerprints || {})) {
        if (!synced.passed[unit + "|" + fp]) { synced.passed[unit + "|" + fp] = 1; enqueue(sid, { type: "passed", unit, fingerprint: fp }); }
      }
    }
    write(SYNCED_PREFIX + sid, synced);
  }

  Store.saveProgress = function (sid, progress) {
    const ok = orig.saveProgress(sid, progress);
    if (mine(sid)) queueProgress(sid, progress);
    return ok || mine(sid); // the outbox has it even if the cache was full
  };
  Store.logAttempt = function (sid, record) {
    const entry = orig.logAttempt(sid, record) ||
      Object.assign({ id: Rows.newRecordId("a"), at: now(), studentId: sid }, record); // cache full: still send it
    if (mine(sid)) enqueue(sid, { type: "attempt", row: Rows.attemptToRow(entry) });
    return entry;
  };
  Store.logLevelChange = function (entry) {
    const e = Object.assign({ at: now() }, entry);
    orig.logLevelChange(e);
    if (mine(e.studentId)) enqueue(e.studentId, { type: "event", row: Rows.levelToRow(e) });
  };
  Store.logButton = function (entry) {
    const e = Object.assign({ id: Rows.newRecordId("b"), at: now() }, entry);
    const ok = orig.logButton(e);
    if (mine(e.studentId)) enqueue(e.studentId, { type: "event", row: Rows.buttonToRow(e) });
    return ok;
  };
  Store.logPlacement = function (entry) {
    const e = Object.assign({ id: Rows.newRecordId("p"), at: now() }, entry);
    const ok = orig.logPlacement(e);
    if (mine(e.studentId) && e.kind !== "reset") enqueue(e.studentId, { type: "event", row: Rows.placementToRow(e) });
    return ok;
  };

  // ---------- Opening a page ----------
  // Sends anything waiting, then fills the cache from the server. If something is still waiting (offline), the
  // cache is used as it is, so the student carries on and the outbox is sent later.
  async function ready() {
    const s = session();
    if (!s) { remove(Store.CURRENT_KEY); return null; }
    await flush();
    const box = read(OUTBOX_PREFIX + s.sid);
    if (box && box.ops.length) return s;
    const r = await api("student-api", { token: s.token, action: "get_progress" });
    if (r.status === 401) { signedOut = true; emit("signed-out"); return s; }
    if (r.status !== 200) return s;
    const progress = Rows.rowsToProgress(r.body.progress);
    orig.saveProgress(s.sid, progress);
    write(Store.ATTEMPTS_PREFIX + s.sid, r.body.attempts.map((a) => Rows.rowToAttempt(a, s.sid)));
    Store.saveAssignments(s.sid, r.body.assignments || []); // only the open ones of the student's class
    const synced = { units: {}, passed: {} };
    for (const row of r.body.progress) synced.units[row.unit] = JSON.stringify(row.state);
    for (const p of r.body.passed) synced.passed[p.unit + "|" + p.fingerprint] = 1;
    write(SYNCED_PREFIX + s.sid, synced);
    write(Store.STUDENTS_KEY, { [s.sid]: { name: r.body.student.nickname, created: now() } });
    Store.setCurrent(s.sid);
    return s;
  }

  let readyPromise = null;
  Store.whenReady = function (fn) {
    readyPromise = readyPromise || ready();
    readyPromise.then(() => fn(), () => fn());
  };

  // Send what's waiting when the page is hidden or closed, and when the connection comes back.
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => document.querySelectorAll(".privacy").forEach((p) => {
      p.textContent = "Your progress is saved to your class on the school's server, so you can carry on from any computer. Your teacher can see it.";
    }));
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && pending()) flush({ keepalive: true }); });
    addEventListener("pagehide", () => { if (pending()) flush({ keepalive: true }); });
    addEventListener("online", () => flush());
    listeners.push(showStatus);
  }

  // A small notice at the top of the page when work hasn't reached the server.
  function showStatus(what) {
    let el = document.getElementById("backend-status");
    if (!el) {
      el = document.createElement("p");
      el.id = "backend-status";
      el.className = "backend-status";
      el.setAttribute("role", "status");
      document.body.prepend(el);
    }
    el.hidden = what === "saved";
    el.innerHTML = what === "signed-out"
      ? 'You\'ve been signed out. Your work is kept on this computer. <a href="app.html#signin">Sign in again</a> with your code and PIN to save it.'
      : "Saving… Your work is kept on this computer until it reaches the server.";
  }

  return {
    enabled: true, session, join, resume, signOut, deleteMyProgress, flush, pending, ready,
    onStatus: (f) => listeners.push(f), isSignedOut: () => signedOut,
  };
});
