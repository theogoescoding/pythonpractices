"use strict";

// The tutorial overlay for the student app (app.html, practice.html, progress.html; never the teacher pages).
//   - A new student (no unit started, nothing remembered) gets the full walkthrough the first time the unit menu opens.
//     It points at the real controls on the screen; the task view's steps are shown again, pointing at its real
//     buttons, the first time that student opens a task.
//   - A returning student gets a short reminder only when something new has appeared for them (a new unit, a unit
//     whose placement isn't done, a new assignment, a unit whose freshness has dropped to a new band), once per thing.
//   - "Help" (home page and My progress) opens the walkthrough from step 1 again.
// What has been seen is remembered in this browser only, per student, with storage errors caught (as collapse.js):
// if storage is blocked nothing opens by itself, and Help still works.
// The rules (steps, reminders, storage) need no DOM, so tests/features.js checks them in Node; run() is the overlay.
(function (root, factory) {
  const Tour = factory();
  if (typeof module === "object" && module.exports) module.exports = Tour;
  else root.Tour = Tour;
})(typeof self !== "undefined" ? self : this, function () {
  const KEY_PREFIX = "pythonPractice.tutorial.";
  const MAX_REMINDERS = 3; // shown at once; any others wait for the next visit
  const BAND_ORDER = ["gold", "fresh", "fading", "soon"]; // secured.js BANDS, freshest first

  // ---------- The walkthrough ----------
  // page: where the step's control is. "home" steps point at the unit menu, "task" steps at the task view.
  // targets: the controls to point at, first one found and visible. text: two or three short sentences.
  const STEPS = [
    { id: "join", page: "home", title: "Signing in",
      targets: ["#student-area"],
      backend: "You joined your class with the class code from your teacher. Next time, choose Returning student and type the 8-digit code and 4-digit PIN you wrote down. If you lose them, ask your teacher.",
      local: "Start by choosing a unit from the list below. Each unit practises one part of Python and has its own level." ,
      localTargets: ["#unit-list"] },
    { id: "placement", page: "home", title: "The quick check",
      targets: ["#unit-list .rag-placement", "#unit-colour-key"],
      text: "The first time you open a unit, you do a quick check of four questions to find your starting level. You only do it once in each unit. Until it's done the unit says Placement to do, and after it the unit's colour changes." },
    { id: "unit-card", page: "home", title: "Your unit cards",
      targets: ["#unit-list .unit-card"],
      text: "Each card shows your level in that unit, from Level 1 to Level 10. The colour goes from red through amber to green as you move up. Open a card to practise that unit." },
    { id: "task-view", page: "task", title: "The task",
      targets: ["#task .task-body", "#task"],
      text: "Read the question at the top of the task first. The Expected output box shows exactly what your program should print. Write or fix your code in the editor." },
    { id: "check-run", page: "task", title: "Run and Check my answer",
      targets: ["#task .actions"],
      text: "Press Run to try your program and see what it prints. When you're happy with it, press Check my answer to test it." },
    { id: "hints", page: "task", title: "Hints",
      targets: ["#hint-btn"],
      text: "If you're stuck, press Show a hint: each task has up to three, and the button says how many are left. A pass that used a hint still counts for your level, but not towards your freshness score." },
    { id: "show-how", page: "task", title: "Show me how",
      targets: ["#show-how-btn"],
      text: "Show me how is greyed out at first. After two failed tries on the task, it shows a worked example of a similar problem, then the key step for this task. A pass after Show me how doesn't count towards your freshness score." },
    { id: "level-buttons", page: "task", title: "Too easy or too hard",
      targets: ["#level-buttons"],
      text: "If the tasks feel far too easy, press This is too easy to move up one level. If they feel far too hard, press This is way too hard to move down one level. You can use each one once in each unit." },
    { id: "freshness", page: "home", title: "Freshness",
      targets: ["#unit-list .secured-note .rag-gold", "#unit-list .secured-note .rag-fresh", "#unit-list .secured-note .rag-fading", "#unit-list .secured-note .rag-soon", "#unit-colour-key"],
      text: "At level 10, pass two programs with no hints to secure the unit: it glows gold at 100%. After a week it drops to 90%, then 10 points more each week, down to 50%. One more level 10 pass with no hints brings it back to 100%." },
    { id: "progress", page: "home", title: "My progress",
      targets: ['a[href="progress.html"]'],
      text: "Open My progress to see every unit and your level in each. Select a unit there to see the skills you've secured." },
    { id: "help", page: "home", title: "See this again",
      targets: ["#tour-help"],
      text: "That's the tour. Press Help on the home page or on My progress to see it again at any time." },
  ];

  // The steps with their text for this mode (backend: joining a class; local: choosing a unit first).
  function stepsFor(backend) {
    return STEPS.map((s) => ({ id: s.id, page: s.page, title: s.id === "join" && !backend ? "Choose a unit" : s.title,
      text: s.id === "join" ? (backend ? s.backend : s.local) : s.text, targets: s.id === "join" && !backend ? s.localTargets : s.targets }));
  }
  const taskSteps = (backend) => stepsFor(backend).filter((s) => s.page === "task");

  // ---------- What has been seen (this browser, per student) ----------
  // state = { v: 1, walkthrough, taskTour, shown: [trigger keys], bands: { unit: band cls } }
  function getStorage(win) { try { return (win || self).localStorage || null; } catch (e) { return null; } }
  function storageWorks(storage) {
    if (!storage) return false;
    try { storage.setItem(KEY_PREFIX + "check", "1"); storage.removeItem(KEY_PREFIX + "check"); return true; } catch (e) { return false; }
  }
  function load(storage, studentId) {
    if (!storage) return null;
    try { const v = JSON.parse(storage.getItem(KEY_PREFIX + studentId) || "null"); return v && typeof v === "object" && Array.isArray(v.shown) ? v : null; } catch (e) { return null; }
  }
  function save(storage, studentId, state) {
    if (!storage) return false;
    try { storage.setItem(KEY_PREFIX + studentId, JSON.stringify(state)); return true; } catch (e) { return false; }
  }

  // ---------- Reminders ----------
  // ctx = { backend, units: [{ id, title }], started: [unit ids], placing: [unit ids], assignments: [{ id, title }],
  //         bands: { unit: { cls, label, score } } (secured units only) }
  const titleOf = (ctx, id) => ((ctx.units || []).find((u) => u.id === id) || { title: id }).title;
  const unitHref = (id) => "practice.html?unit=" + encodeURIComponent(id);
  // Every trigger there is now, whether or not it is new: { key, text, href, go }.
  function triggers(ctx, state) {
    const out = [];
    for (const a of ctx.assignments || []) out.push({ key: "assignment:" + a.id, text: "Your teacher has set a new practice set: " + a.title + ".",
      href: "practice.html?assignment=" + encodeURIComponent(a.id), go: "Open it" });
    for (const u of ctx.placing || []) out.push({ key: "placement:" + u, text: "You haven't finished the quick check in " + titleOf(ctx, u) + " yet. It finds your starting level, and you only do it once.",
      href: unitHref(u), go: "Finish the quick check" });
    for (const [u, b] of Object.entries(ctx.bands || {})) {
      const before = state && state.bands ? state.bands[u] : null;
      if (before && BAND_ORDER.indexOf(b.cls) > BAND_ORDER.indexOf(before)) out.push({ key: "band:" + u + ":" + b.cls, unit: u, cls: b.cls,
        text: titleOf(ctx, u) + " has faded to " + b.label + " (" + b.score + "%). One level 10 pass with no hints brings it back to 100%.", href: unitHref(u), go: "Practise " + titleOf(ctx, u) });
    }
    for (const u of ctx.units || []) out.push({ key: "unit:" + u.id, text: "There's a new unit: " + u.title + ". Open it to start with its quick check.", href: unitHref(u.id), go: "Open " + u.title });
    return out;
  }
  const bandsNow = (ctx) => Object.fromEntries(Object.entries(ctx.bands || {}).map(([u, b]) => [u, b.cls]));

  // What to show on the home page now, and the state to keep. Nothing is shown when storage doesn't work (it couldn't
  // be remembered, so it would come back on every visit). With nothing remembered yet:
  //   - a new student (no unit started) gets the walkthrough;
  //   - a student who has started a unit is treated as returning: everything there is now counts as seen, silently.
  // Otherwise: the reminders not shown before (at most MAX_REMINDERS), each marked as shown here.
  function planHome(state, ctx, storageOk) {
    if (!storageOk) return { walkthrough: false, reminders: [], state: null };
    if (!state) {
      const isNew = !(ctx.started || []).length;
      const fresh = { v: 1, walkthrough: true, taskTour: !isNew, shown: triggers(ctx, null).map((t) => t.key), bands: bandsNow(ctx) };
      return { walkthrough: isNew, reminders: [], state: fresh };
    }
    const shown = new Set(state.shown);
    // A unit that has come back up can be reminded again the next time it drops.
    for (const [u, b] of Object.entries(ctx.bands || {})) {
      const before = state.bands ? state.bands[u] : null;
      if (before && BAND_ORDER.indexOf(b.cls) < BAND_ORDER.indexOf(before)) for (const k of [...shown]) if (k.startsWith("band:" + u + ":")) shown.delete(k);
    }
    const due = triggers(ctx, state).filter((t) => !shown.has(t.key));
    const reminders = due.slice(0, MAX_REMINDERS);
    reminders.forEach((t) => shown.add(t.key));
    // A unit's band is remembered once it hasn't dropped, or its drop has been shown (so a waiting one isn't lost).
    const bands = Object.assign({}, state.bands || {});
    for (const [u, cls] of Object.entries(bandsNow(ctx))) if (!due.some((t) => t.unit === u && !reminders.includes(t))) bands[u] = cls;
    return { walkthrough: false, reminders, state: Object.assign({}, state, { shown: [...shown], bands }) };
  }

  // Help: the walkthrough from step 1 again, and the task view's steps on the next task.
  const restartState = (state) => Object.assign({}, state || { v: 1, shown: [], bands: {} }, { walkthrough: true, taskTour: false });
  const helpRequested = (hash) => hash === "#help";

  // Never on the teacher pages, and never inside them (teacher practice opens practice.html?preview=<id> in a frame).
  function allowed(win) {
    try {
      const path = (win.location && win.location.pathname) || "";
      if (/teacher\.html$/.test(path)) return false;
      if (new URLSearchParams((win.location && win.location.search) || "").has("preview")) return false;
      if (win.parent && win.parent !== win) return false;
      return true;
    } catch (e) { return false; }
  }

  // ---------- The overlay ----------
  // A card fixed to the bottom of the screen (never a backdrop over the page), with Back, Next and Skip. The control a
  // step is about is scrolled into view and ringed (class tour-target); a step whose control isn't on this screen
  // says where it is. Escape closes it, and so does Skip at any step. Closing removes everything it added and gives
  // focus back, so nothing is left over the editor or the buttons.
  // opts = { doc, steps, start (index), onClose(reason, index), elsewhere (text for a step not on this screen) }
  let active = null; // only one overlay at a time
  function run(opts) {
    if (active && active.isOpen()) active.close("replaced");
    const doc = opts.doc;
    const steps = opts.steps;
    let index = Math.max(0, Math.min(steps.length - 1, opts.start || 0));
    let target = null;
    let open = true;
    const before = doc.activeElement || null;
    const make = (tag, cls, text) => { const el = doc.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };

    const card = make("div", "tour-card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "false");
    card.setAttribute("aria-labelledby", "tour-title");
    const count = make("p", "tour-count small");
    const title = make("h2", "tour-title");
    title.id = "tour-title";
    title.setAttribute("tabindex", "-1");
    const text = make("p", "tour-text");
    const where = make("p", "tour-where small");
    const buttons = make("p", "tour-buttons");
    const back = make("button", "secondary", "Back");
    const next = make("button", "primary", "Next");
    const skip = make("button", "secondary tour-skip", "Skip");
    [back, next, skip].forEach((b) => b.setAttribute("type", "button"));
    skip.setAttribute("aria-label", "Skip the tour");
    buttons.appendChild(back); buttons.appendChild(next); buttons.appendChild(skip);
    [count, title, text, where, buttons].forEach((el) => card.appendChild(el));

    function findTarget(step) {
      // The first one on screen (a unit card in a closed group isn't).
      for (const sel of step.targets || []) {
        let found = [];
        try { found = doc.querySelectorAll ? [...doc.querySelectorAll(sel)] : [doc.querySelector(sel)]; } catch (e) { found = []; }
        const el = found.find((x) => x && !x.hidden && (!x.getClientRects || x.getClientRects().length));
        if (el) return el;
      }
      return null;
    }
    function show() {
      const step = steps[index];
      if (target && target.classList) target.classList.remove("tour-target");
      target = findTarget(step);
      count.textContent = "Step " + (index + 1) + " of " + steps.length;
      title.textContent = step.title;
      text.textContent = step.text;
      where.textContent = target ? "" : opts.elsewhere || "You'll find this on another screen.";
      where.hidden = !!target;
      back.disabled = index === 0;
      next.textContent = index === steps.length - 1 ? "Finish" : "Next";
      if (target) {
        target.classList.add("tour-target");
        if (target.scrollIntoView) target.scrollIntoView({ block: "start" });
      }
      if (title.focus) title.focus();
    }
    function close(reason) {
      if (!open) return;
      open = false;
      if (target && target.classList) target.classList.remove("tour-target");
      card.remove();
      if (doc.body && doc.body.classList) doc.body.classList.remove("tour-open");
      doc.removeEventListener("keydown", onKey);
      if (before && before.focus && (!doc.body || !doc.body.contains || doc.body.contains(before))) before.focus();
      if (opts.onClose) opts.onClose(reason, index);
    }
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault && e.preventDefault(); close("escape"); return; }
      if (!card.contains || !card.contains(e.target)) return;
      if (e.key === "ArrowRight") { e.preventDefault && e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault && e.preventDefault(); go(-1); }
    }
    function go(d) {
      if (index + d >= steps.length) return close("finished");
      if (index + d < 0) return;
      index += d;
      show();
    }
    back.addEventListener("click", () => go(-1));
    next.addEventListener("click", () => go(1));
    skip.addEventListener("click", () => close("skipped"));
    doc.addEventListener("keydown", onKey);
    if (doc.body.classList) doc.body.classList.add("tour-open");
    doc.body.appendChild(card);
    show();
    active = { close, next: () => go(1), back: () => go(-1), index: () => index, isOpen: () => open, card };
    return active;
  }

  // The reminders, as notices above the unit cards (not over the page): each with a link to the thing and Dismiss.
  function showReminders(doc, host, reminders) {
    if (!host || !reminders.length) return;
    host.hidden = false;
    for (const r of reminders) {
      const box = doc.createElement("div");
      box.className = "notice notice-up tour-reminder";
      box.setAttribute("role", "status");
      const p = doc.createElement("p");
      p.textContent = r.text;
      const go = doc.createElement("a");
      go.className = "menu-link";
      go.href = r.href;
      go.textContent = r.go;
      const dismiss = doc.createElement("button");
      dismiss.type = "button";
      dismiss.className = "secondary";
      dismiss.textContent = "Dismiss";
      dismiss.addEventListener("click", () => { box.remove(); if (!host.querySelector(".tour-reminder")) host.hidden = true; });
      box.addEventListener("keydown", (e) => { if (e.key === "Escape") dismiss.click(); });
      const row = doc.createElement("p");
      row.className = "teacher-controls";
      row.appendChild(go); row.appendChild(dismiss);
      box.appendChild(p); box.appendChild(row);
      host.appendChild(box);
    }
  }

  // ---------- Wiring (browser only) ----------
  let homeDone = false;
  // home.js calls this each time the unit menu is drawn; the walkthrough or reminders are decided once per page load.
  function home(ctx, win) {
    win = win || self;
    if (!allowed(win)) return;
    const doc = win.document;
    const storage = getStorage(win);
    const ok = storageWorks(storage);
    const help = doc.getElementById("tour-help");
    if (help && !help.dataset.wired) {
      help.dataset.wired = "1";
      help.addEventListener("click", (e) => { e.preventDefault(); startWalkthrough(ctx, win, storage, ok); });
    }
    if (homeDone) return;
    homeDone = true;
    if (helpRequested(win.location.hash)) {
      if (win.history && win.history.replaceState) win.history.replaceState(null, "", win.location.pathname + win.location.search);
      return startWalkthrough(ctx, win, storage, ok);
    }
    const plan = planHome(load(storage, ctx.studentId), ctx, ok);
    if (plan.state) save(storage, ctx.studentId, plan.state);
    if (plan.walkthrough) run({ doc, steps: stepsFor(ctx.backend), elsewhere: "You'll see this when you open a unit: the guide points at it then." });
    else showReminders(doc, doc.getElementById("tour-reminders"), plan.reminders);
  }
  function startWalkthrough(ctx, win, storage, ok) {
    if (ok) save(storage, ctx.studentId, restartState(load(storage, ctx.studentId)));
    run({ doc: win.document, steps: stepsFor(ctx.backend), elsewhere: "You'll see this when you open a unit: the guide points at it then." });
  }

  // The practice page: the task view's steps, pointing at its real buttons, the first time after the walkthrough.
  function task(win) {
    win = win || self;
    if (!allowed(win)) return;
    const doc = win.document;
    const storage = getStorage(win);
    if (!storageWorks(storage) || !win.Store || !win.Store.currentStudent) return;
    const student = win.Store.currentStudent();
    const state = student && load(storage, student.id);
    if (!state || state.taskTour !== false) return;
    const host = doc.getElementById("task");
    if (!host) return;
    const backend = !!(win.Backend && win.Backend.enabled);
    const start = () => {
      save(storage, student.id, Object.assign({}, state, { taskTour: true }));
      run({ doc, steps: taskSteps(backend), elsewhere: "This appears later, when you need it." });
    };
    if (doc.getElementById("check-btn")) return start();
    if (!win.MutationObserver) return;
    const watch = new win.MutationObserver(() => { if (doc.getElementById("check-btn")) { watch.disconnect(); start(); } });
    watch.observe(host, { childList: true, subtree: true });
  }

  // The practice page starts its part by itself (once the student's saved data is ready). The progress page's Help
  // is a link to app.html#help, which opens the walkthrough on the home page, where its controls are.
  if (typeof document !== "undefined" && typeof self !== "undefined" && self.document === document) {
    const startTask = () => {
      if (!document.getElementById("task")) return;
      if (self.Store && self.Store.whenReady) self.Store.whenReady(() => task(self)); else task(self);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startTask); else startTask();
  }

  return { KEY_PREFIX, MAX_REMINDERS, STEPS, stepsFor, taskSteps, getStorage, storageWorks, load, save, triggers, planHome,
    restartState, helpRequested, allowed, run, showReminders, home, task };
});
