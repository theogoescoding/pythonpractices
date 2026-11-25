// Exam Mode (prompt EM1): the student page exam.html. The pure parts (marking the Decode rung, checking gaps, the ERL
// view of Python code, the scores summary) are a UMD module, ExamMode, tested by tests/exam-mode.js. The browser part
// below draws the page. Marking of code (rungs 4 and 5) happens in the Python worker (worker.js loads exam_marker.py
// after harness.py), never here. Local mode only in EM1: everything is kept in this browser (localStorage), nothing is
// sent to the server (EM2 adds that).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ExamMode = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // The mark-point rules exam_marker.py knows (its _rule). A rule not in this list is an error in exam-mode.json.
  const RULES = ["input_stored", "accumulates", "accumulates_in_loop", "if_tests_input_var", "loop_contains_input_and_work",
    "finishes_on_stop", "spare_unused", "prints_number", "prints_expected_once_after_loop"];

  // What each of the marker's notes tells the student (the int() note is decision 3's wording).
  const NOTE_TEXT = {
    int: "Your answer would get the marks in the exam. In real Python, add int() around input().",
    "quotes-fixed": "Text such as \"yes\" or \"stop\" needs quote marks round it. One mark was taken off for this, and the rest was marked as if the quotes were there.",
    "syntax-fixed": "Python couldn't read one line (for example a missing colon, or = where == was needed). One mark was taken off for this, and the rest was marked as if it were fixed.",
    "does-not-parse": "Python couldn't read your answer, so it couldn't be marked. Check each point yourself, then fix the line Python can't read.",
    timeout: "Your answer took too long to mark, so it couldn't be marked. Check each point yourself.",
  };

  // Numbers in a program's output, as the marker matches them: 7, 7.0, 7.00 and £7 are all 7.
  function numbersIn(text) {
    return (String(text || "").match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  }

  // ---------- Rung 1: Decode ----------
  // answer = { blocks: [block id, …] (ticked), tags: [chosen tag per bullet], format: chosen format }.
  // One point for the blocks (exactly the right set), one per bullet, one for the format. Each point keeps the right
  // answer, shown after submitting.
  function markDecode(decode, answer) {
    const points = [];
    const ticked = new Set(answer.blocks || []);
    const want = decode.blocksQuestion.correct;
    points.push({ id: "blocks", correct: want.length === ticked.size && want.every((b) => ticked.has(b)), given: [...ticked], answer: want.slice() });
    decode.bulletTags.forEach((t, i) => points.push({ id: "tag" + (i + 1), bullet: t.bullet, correct: (answer.tags || [])[i] === t.correct, given: (answer.tags || [])[i] || null, answer: t.correct }));
    points.push({ id: "format", correct: answer.format === decode.formatQuestion.correct, given: answer.format || null, answer: decode.formatQuestion.correct });
    return { points, total: points.filter((p) => p.correct).length, max: points.length };
  }

  // ---------- Rung 3: Fill the gaps ----------
  // A gap is right if it is one of its accept answers (ignoring spaces), or matches acceptPattern. A gap inside print(…)
  // may also be a message and the answer ("Total:", total): every other part must then be text in quotes.
  const squash = (s) => String(s || "").replace(/\s+/g, "");
  const isText = (s) => /^(['"]).*\1$/.test(s.trim());
  function splitArgs(s) {
    const out = [];
    let cur = "", q = null, depth = 0;
    for (const ch of String(s)) {
      if (q) { cur += ch; if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if (ch === "(" || ch === "[") depth++;
      if (ch === ")" || ch === "]") depth--;
      if (ch === "," && depth === 0) { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  }
  function gapRight(gap, given) {
    const g = String(given || "").trim();
    if (!g) return false;
    if (gap.acceptPattern && new RegExp(gap.acceptPattern).test(g)) return true;
    const accept = (gap.accept || []).map(squash);
    if (accept.includes(squash(g))) return true;
    const parts = splitArgs(g);
    return parts.length > 1 && parts.some((p) => accept.includes(squash(p))) && parts.every((p) => accept.includes(squash(p)) || isText(p));
  }
  const checkGaps = (fill, answers) => fill.gaps.map((gap, i) => gapRight(gap, (answers || [])[i]));
  function fillCode(fill, answers) {
    const parts = fill.code.split("____");
    return parts.reduce((acc, part, i) => acc + String((answers || [])[i - 1] || "").trim() + part);
  }

  // A test of the completed program passes when it ran with no error, stopped on the stop value (none of the spare
  // inputs used: the spare inputs come after the stop value) and printed each expected number.
  function runPasses(test, r) {
    if (!r || r.error || r.notRun) return false;
    if (r.inputsLeft !== (test.spare || []).length) return false;
    const nums = numbersIn(r.output);
    return (test.expectNumbers || []).every((e) => nums.includes(e));
  }

  // ---------- The ERL view (rungs 1-3, decision 3: questions are shown in ERL, "Show in Python" switches) ----------
  // A display of Python code in OCR Exam Reference Language. Only for reading: answers are always Python. Covers the
  // constructs the packs use: while/endwhile, if/elseif/else/endif, for … to … next, functions, input() without int(),
  // print with + and str(), AND/OR/NOT, true/false, // comments.
  function outsideStrings(s, fn) {
    return s.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/).map((part, i) => (i % 2 ? part : fn(part))).join("");
  }
  function erlExpr(s) {
    s = s.replace(/\b(?:int|float)\(\s*(input\((?:[^()]|\([^()]*\))*\))\s*\)/g, "$1");
    const pr = /^print\((.*)\)$/.exec(s.trim());
    if (pr) {
      const args = splitArgs(pr[1]).map((a) => a.trim()).filter(Boolean);
      if (args.length > 1) {
        s = "print(" + args.map((a, i) => {
          if (isText(a)) return i < args.length - 1 && !/\s(['"])$/.test(a) ? a.slice(0, -1) + " " + a.slice(-1) : a;
          return "str(" + a + ")";
        }).join(" + ") + ")";
      }
    }
    return outsideStrings(s, (p) => p.replace(/\band\b/g, "AND").replace(/\bor\b/g, "OR").replace(/\bnot\b/g, "NOT")
      .replace(/\bTrue\b/g, "true").replace(/\bFalse\b/g, "false"));
  }
  function toErlLine(text) {
    const t = String(text).trim();
    let m;
    if (t.startsWith("#")) return "//" + t.slice(1);
    if ((m = /^while\s+(.*):$/.exec(t))) return "while " + erlExpr(m[1]);
    if ((m = /^if\s+(.*):$/.exec(t))) return "if " + erlExpr(m[1]) + " then";
    if ((m = /^elif\s+(.*):$/.exec(t))) return "elseif " + erlExpr(m[1]) + " then";
    if (/^else\s*:$/.test(t)) return "else";
    if ((m = /^for\s+(\w+)\s+in\s+range\((.*)\):$/.exec(t))) {
      const a = splitArgs(m[2]).map((x) => x.trim());
      return a.length === 1 ? "for " + m[1] + " = 0 to " + a[0] + " - 1" : "for " + m[1] + " = " + a[0] + " to " + a[1] + " - 1";
    }
    if ((m = /^def\s+(.*):$/.exec(t))) return "function " + m[1];
    return erlExpr(t);
  }
  function toErl(code) {
    const out = [];
    const open = []; // { indent, kind, end }
    const close = (upTo, keepIf) => {
      while (open.length && open[open.length - 1].indent >= upTo) {
        const top = open[open.length - 1];
        if (keepIf && top.indent === upTo && top.kind === "if") break;
        open.pop();
        out.push(" ".repeat(top.indent) + top.end);
      }
    };
    for (const line of String(code).replace(/\s+$/, "").split("\n")) {
      if (!line.trim()) { out.push(""); continue; }
      const indent = line.length - line.trimStart().length;
      const t = line.trim();
      close(indent, /^(elif\b|else\s*:)/.test(t));
      out.push(" ".repeat(indent) + toErlLine(t));
      let m;
      if (/^while\b.*:$/.test(t)) open.push({ indent, kind: "while", end: "endwhile" });
      else if (/^if\b.*:$/.test(t)) open.push({ indent, kind: "if", end: "endif" });
      else if ((m = /^for\s+(\w+)\b.*:$/.exec(t))) open.push({ indent, kind: "for", end: "next " + m[1] });
      else if (/^def\b.*:$/.test(t)) open.push({ indent, kind: "def", end: "endfunction" });
    }
    close(0, false);
    return out.join("\n");
  }

  // ---------- My exam scores ----------
  // Recorded attempts (the model answer not yet opened) → one row per question and rung: the first attempt's score and
  // the best. Rung 4 is one record per step check; its score is the steps passed (first: on their first check).
  function scoreSummary(attempts) {
    const groups = new Map();
    for (const a of attempts || []) {
      if (a.recorded === false) continue;
      const key = a.questionId + "|" + a.rung;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(a);
    }
    const rows = [];
    for (const list of groups.values()) {
      const { questionId, rung } = list[0];
      if (list.some((a) => a.step != null)) {
        const steps = new Map();
        for (const a of list) {
          if (!steps.has(a.step)) steps.set(a.step, { first: a.total, best: a.total });
          else steps.get(a.step).best = Math.max(steps.get(a.step).best, a.total);
        }
        const max = list[0].stepsTotal || steps.size;
        const sum = (k) => [...steps.values()].reduce((s, x) => s + x[k], 0);
        rows.push({ questionId, rung, attempts: list.length, first: { total: sum("first"), max }, best: { total: sum("best"), max } });
        continue;
      }
      const first = list.find((a) => a.first) || list[0];
      const best = list.reduce((b, a) => (a.total > b.total ? a : b), list[0]);
      rows.push({ questionId, rung, attempts: list.length, first: { total: first.total, max: first.max }, best: { total: best.total, max: best.max } });
    }
    return rows.sort((a, b) => (a.questionId < b.questionId ? -1 : a.questionId > b.questionId ? 1 : a.rung - b.rung));
  }

  const STORAGE_PREFIX = "pyPractice.exam.v1."; // + student id → { attempts, help, pasteFlags, modelSeen }
  const RUNG_NAMES = { 1: "Decode", 2: "Skeleton", 3: "Fill the gaps", 4: "One bullet at a time", 5: "Full question" };

  return { RULES, NOTE_TEXT, numbersIn, markDecode, gapRight, checkGaps, fillCode, runPasses, toErl, toErlLine, splitArgs, scoreSummary, STORAGE_PREFIX, RUNG_NAMES };
});

// ===================== Browser page (exam.html only) =====================
if (typeof document !== "undefined" && document.getElementById("exam-app")) Store.whenReady(function () {
  "use strict";
  const X = self.ExamMode;
  const $ = (id) => document.getElementById(id);
  const app = $("exam-app");
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const RUN_TIMEOUT_MS = 5000; // as app.js: a run, or a marking, is stopped after this long

  const student = Store.currentStudent();
  if (!student) { location.replace("app.html"); return; }
  $("student-name").textContent = student.name;
  Store.setupDisplaySettings();

  // ---------- Saved in this browser (store.js patterns: readJson/writeJson already catch storage errors) ----------
  const KEY = X.STORAGE_PREFIX + student.id;
  const saved = Object.assign({ attempts: [], help: [], pasteFlags: [], modelSeen: {} }, Store.readJson(KEY) || {});
  const persist = () => { try { Store.writeJson(KEY, saved); } catch (e) { /* storage full or blocked: carry on */ } };
  const newId = () => "x-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  function record(entry) {
    const prior = saved.attempts.filter((a) => a.questionId === entry.questionId && a.rung === entry.rung && (entry.step == null || a.step === entry.step));
    const r = Object.assign({ id: newId(), at: new Date().toISOString(), attempt: prior.length + 1, first: prior.length === 0, recorded: true }, entry);
    saved.attempts.push(r);
    persist();
    return r;
  }

  // ---------- Python (worker.js, with the page's 5-second stop) ----------
  const pyStatus = $("py-status");
  const runner = {
    worker: null, ready: null, job: null, seq: 0, timer: null,
    start() {
      pyStatus.textContent = "loading…";
      let resolveReady;
      this.ready = new Promise((res) => { resolveReady = res; });
      try { this.worker = new Worker("worker.js"); } catch (e) { pyStatus.textContent = "couldn't start (open the site through a web server – see README)"; resolveReady(false); return; }
      this.worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === "ready") { pyStatus.textContent = "ready"; resolveReady(true); }
        else if (m.type === "load-error") { pyStatus.textContent = "couldn't load – check your internet connection, then reload"; resolveReady(false); }
        else if (this.job && m.id === this.job.id) {
          if (m.type === "progress") { this.job.results[m.index] = m.result; this.arm(); }
          else if (m.type === "done" || m.type === "marked") { clearTimeout(this.timer); const j = this.job; this.job = null; j.resolve(m.type === "marked" ? m.result : j.results); }
        }
      };
      this.worker.onerror = () => { pyStatus.textContent = "couldn't load"; resolveReady(false); };
    },
    arm() { clearTimeout(this.timer); this.timer = setTimeout(() => this.timeout(), RUN_TIMEOUT_MS); },
    timeout() {
      const j = this.job;
      if (!j) return;
      this.job = null;
      this.worker.terminate();
      this.start();
      if (j.mark) j.resolve({ timeout: true });
      else {
        const first = j.results.findIndex((r) => r == null);
        j.resolve(j.results.map((r, i) => r || (i === first ? { output: "", error: { type: "Timeout" }, inputsLeft: 0 } : { output: "", error: null, notRun: true })));
      }
    },
    async send(msg, n) {
      if (!(await this.ready)) return null;
      while (this.job) await this.job.done;
      let markDone;
      const done = new Promise((res) => { markDone = res; });
      return new Promise((resolve) => {
        const id = ++this.seq;
        this.job = { id, mark: msg.type === "mark", done, results: new Array(n || 0).fill(null), resolve: (r) => { markDone(); resolve(r); } };
        this.arm();
        this.worker.postMessage(Object.assign({ id }, msg));
      });
    },
    run(code, inputLists) { return this.send({ type: "run", code, tests: inputLists, maxLines: 2000 }, inputLists.length); },
    mark(code, question, check) { return this.send({ type: "mark", code, question: JSON.stringify(question), check: check ? JSON.stringify(check) : null }); },
  };
  runner.start();

  // ---------- Small pieces ----------
  function highlight(code) {
    const re = /(#[^\n]*|\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\b(if|elif|elseif|else|endif|then|while|endwhile|for|next|to|in|def|function|endfunction|return|and|or|not|AND|OR|NOT|True|False|true|false|None|break|continue|pass)\b|\b(print|input|int|float|str|len|range)\b(?=\()|\b(\d+(?:\.\d+)?)\b/g;
    let out = "", last = 0, m;
    while ((m = re.exec(code))) {
      const cls = m[1] ? "c" : m[2] ? "s" : m[3] ? "k" : m[4] ? "f" : "n";
      out += esc(code.slice(last, m.index)) + '<span class="tok-' + cls + '">' + esc(m[0]) + "</span>";
      last = re.lastIndex;
    }
    return out + esc(code.slice(last));
  }
  const blockById = {};
  const markIcon = (ok) => (ok === true ? '<span class="em-mark em-yes" aria-hidden="true">✓</span>' : ok === false ? '<span class="em-mark em-no" aria-hidden="true">✗</span>' : '<span class="em-mark em-unsure" aria-hidden="true">?</span>');
  const markWord = (ok) => (ok === true ? "got" : ok === false ? "missed" : "check yourself");

  // The question as an exam paper sets it: stem, opening line, bullets, the rider, the marks, the answer-format line.
  // noFormat: rung 1 (Decode) asks which format is allowed, so its answer isn't shown above the question.
  function paperHtml(q, noFormat) {
    return '<div class="exam-paper">' +
      '<p class="exam-stem">' + esc(q.stem) + "</p>" +
      "<p>" + esc(q.opening) + "</p>" +
      '<ul class="exam-bullets">' + q.bullets.map((b) => "<li>" + esc(b) + "</li>").join("") + "</ul>" +
      (q.rider ? '<p class="exam-rider">' + esc(q.rider) + "</p>" : "") +
      '<p class="exam-marks">[' + q.marks + "]</p>" +
      "</div>" +
      (noFormat ? "" : '<p class="exam-format small">' + esc(q.answerFormat) + "</p>");
  }

  // "Say it simply" (rungs 1-3): the plain-English version of the question. Each use is recorded (decision 14).
  let helpUsed = false;
  function sayItSimplyHtml(q) {
    return '<div class="say-simply"><button type="button" class="secondary" id="say-btn" aria-expanded="false" aria-controls="say-text">Say it simply</button>' +
      '<p id="say-text" class="say-text" hidden>' + esc(q.sayItSimply) + "</p></div>";
  }
  function wireSayItSimply(q, rung) {
    const b = $("say-btn");
    if (!b) return;
    b.addEventListener("click", () => {
      const t = $("say-text");
      const open = t.hidden;
      t.hidden = !open;
      b.setAttribute("aria-expanded", String(open));
      if (open) { helpUsed = true; saved.help.push({ at: new Date().toISOString(), questionId: q.id, rung }); persist(); }
    });
  }

  // "Show in Python" (rungs 1-3): code is shown in ERL by default (decision 3); the button switches to Python and back.
  let showPython = false;
  const viewCode = (code) => (showPython ? code : X.toErl(code));
  const viewLine = (line) => (showPython ? line : X.toErlLine(line));
  function langToggleHtml() {
    return '<p class="lang-toggle"><button type="button" class="secondary" id="lang-btn" aria-pressed="' + showPython + '">' + (showPython ? "Show in ERL" : "Show in Python") + "</button> " +
      '<span class="small">The code is shown in ' + (showPython ? "Python" : "OCR Exam Reference Language (ERL), as in the exam") + ".</span></p>";
  }
  function wireLangToggle(redraw) {
    const b = $("lang-btn");
    if (b) b.addEventListener("click", () => { showPython = !showPython; redraw(); const nb = $("lang-btn"); if (nb) nb.focus(); });
  }

  // ---------- The code editor (as app.js: CodeMirror, Tab indents, Esc then Tab leaves; the text box if the CDN fails) ----------
  let editor = null;
  const PASTE_TASK = { type: "write", starter: "", tests: [] }; // paste-flag.js judges an editor paste against this
  function editorHtml(code, label) {
    return '<label for="editor" class="editor-label">' + esc(label || "Your answer (Python)") + "</label>" +
      '<textarea id="editor" class="editor" spellcheck="false" autocomplete="off" autocapitalize="off" rows="12" aria-describedby="editor-help">' + esc(code || "") + "</textarea>" +
      '<p id="editor-help" class="small">Tab indents by 4 spaces. Press Esc then Tab to leave the editor.</p>';
  }
  function wireEditor(onChange, onPaste) {
    const ta = $("editor");
    editor = null;
    if (typeof CodeMirror === "function" && typeof editorEnter === "function") {
      let escPressed = false;
      const leave = (cm, dir) => {
        const input = cm.getInputField();
        const all = [...document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
          .filter((el) => el === input || (!el.closest(".CodeMirror") && el.offsetParent !== null));
        for (let i = all.indexOf(input) + dir; i >= 0 && i < all.length; i += dir) { all[i].focus(); if (document.activeElement === all[i]) return; }
      };
      const indentOrLeave = (dir) => (cm) => { if (escPressed) { escPressed = false; leave(cm, dir); return undefined; } editorTab(cm, dir); return undefined; };
      const cm = CodeMirror.fromTextArea(ta, {
        mode: { name: "python", version: 3 }, lineNumbers: true, indentUnit: 4, tabSize: 4, indentWithTabs: false,
        smartIndent: false, electricChars: false, matchBrackets: true, viewportMargin: Infinity,
        extraKeys: { Enter: editorEnter, Tab: indentOrLeave(1), "Shift-Tab": indentOrLeave(-1), Esc: () => { escPressed = true; } },
      });
      cm.on("keydown", (_, e) => { if (!["Escape", "Tab", "Shift"].includes(e.key)) escPressed = false; });
      cm.on("change", () => onChange(cm.getValue()));
      cm.on("beforeChange", (_, change) => {
        if (change.origin !== "paste") return;
        const end = CodeMirror.Pos(cm.lastLine(), cm.getLine(cm.lastLine()).length);
        onPaste(change.text.join("\n"), cm.getRange(CodeMirror.Pos(0, 0), change.from) + cm.getRange(change.to, end));
      });
      const input = cm.getInputField();
      input.setAttribute("aria-label", "Your answer (Python)");
      input.setAttribute("aria-describedby", "editor-help");
      document.querySelector('label[for="editor"]').addEventListener("click", () => cm.focus());
      editor = { get: () => cm.getValue(), set: (v) => cm.setValue(v) };
      return;
    }
    ta.addEventListener("input", () => onChange(ta.value));
    ta.addEventListener("paste", (e) => onPaste(e.clipboardData ? e.clipboardData.getData("text") : "", ta.value.slice(0, ta.selectionStart) + ta.value.slice(ta.selectionEnd)));
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); ta.setRangeText("    ", ta.selectionStart, ta.selectionEnd, "end"); onChange(ta.value); }
    });
    editor = { get: () => ta.value, set: (v) => { ta.value = v; } };
  }

  // Paste flag (paste-flag.js, as on the rest of the site): a whole-program or long paste is recorded and the student is
  // told. Exam Mode keeps its own flags (homework rules come in EM3), so the main site's paste log isn't changed.
  let pasteFlagged = false;
  function pasteHandler(questionId, rung) {
    return (text, rest) => {
      if (!self.PasteFlag) return;
      const why = PasteFlag.reason(text, PASTE_TASK, rest);
      if (!why) return;
      pasteFlagged = true;
      saved.pasteFlags.push({ at: new Date().toISOString(), questionId, rung, lines: PasteFlag.lineCount(text), reason: why });
      persist();
      const help = $("editor-help");
      const old = document.querySelector(".paste-flag");
      if (old) old.remove();
      if (help) help.insertAdjacentHTML("afterend", '<div class="notice notice-down paste-flag" role="alert"><p>' + esc(PasteFlag.MESSAGE) + "</p></div>");
    };
  }

  // ---------- Views ----------
  let data = null, pack = null;
  const questionById = (id) => pack.questions.find((q) => q.id === id);
  const fullQuestions = () => pack.questions.filter((q) => q.id !== pack.rungQuestion);
  let viewStarted = Date.now();

  function setView(html, title) {
    app.innerHTML = html;
    document.title = (title ? title + " – " : "") + "Exam Mode – Pythons and Ladders";
    // The navigation shows where the student is: Blocks, My exam scores, or the pack (its rungs and full questions).
    const section = /^#blocks/.test(location.hash) ? "blocks" : /^#scores/.test(location.hash) ? "scores" : "pack";
    document.querySelectorAll(".exam-nav a").forEach((a) => {
      if (a.dataset.section === section) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }
  function focusHeading() { const h = app.querySelector("h2"); if (h) { h.setAttribute("tabindex", "-1"); h.focus(); } }

  function route() {
    viewStarted = Date.now();
    helpUsed = false;
    pasteFlagged = false;
    showPython = false; // each page starts in ERL, as the exam does
    const h = location.hash || "#pack/C1";
    let m;
    if (h === "#blocks") showBlocks();
    else if (h === "#scores") showScores();
    else if ((m = /^#pack\/([\w-]+)\/(decode|skeleton|fill|steps)$/.exec(h))) ({ decode: showDecode, skeleton: showSkeleton, fill: showFill, steps: showSteps })[m[2]]();
    else if ((m = /^#q\/([\w-]+)$/.exec(h)) && questionById(m[1])) showQuestion(questionById(m[1]));
    else showPack();
    focusHeading();
  }

  // Blocks: the 17, in teaching order, with the cue phrase and the name. Only pack C1 has content in EM1.
  function showBlocks() {
    const inPack = new Set(pack.blocks);
    setView('<h2>Blocks</h2><p>Exam questions are built from these blocks. Spot the cue phrase in the question, then you know which block it needs.</p>' +
      '<ol class="em-blocks">' + data.teachingOrder.map((id) => {
        const b = blockById[id];
        return '<li class="em-block"><span class="em-block-id">' + esc(b.id) + '</span> <strong>"' + esc(b.cue) + '"</strong> <span class="em-block-name">' + esc(b.name) + "</span>" +
          '<span class="small em-block-status">' + (inPack.has(id) ? 'Practise it in <a href="#pack/' + esc(pack.id) + '">pack ' + esc(pack.id) + "</a>" : "Coming later") + "</span></li>";
      }).join("") + "</ol>", "Blocks");
  }

  // Pack C1: the five rungs.
  function showPack() {
    const best = (qid, rung) => { const r = X.scoreSummary(saved.attempts).find((x) => x.questionId === qid && x.rung === rung); return r ? r.best.total + "/" + r.best.max : "not tried"; };
    const q0 = questionById(pack.rungQuestion);
    const rungs = [
      ["decode", 1, "Decode", "Which blocks does the question need, what does each bullet need, and how can you answer?"],
      ["skeleton", 2, "Skeleton", "Put the lines of the answer in order."],
      ["fill", 3, "Fill the gaps", "Complete the program."],
      ["steps", 4, "One bullet at a time", "Build the answer one step at a time. You can run your code."],
    ];
    setView("<h2>Pack " + esc(pack.id) + ": " + esc(pack.title) + "</h2>" +
      '<p class="small">Blocks: ' + pack.blocks.map((b) => esc(blockById[b].name)).join(", ") + ".</p>" +
      '<ol class="em-rungs">' +
      rungs.map(([k, n, name, what]) => '<li><a href="#pack/' + esc(pack.id) + "/" + k + '"><strong>Rung ' + n + ": " + name + "</strong></a> – " + esc(q0.title) + ". " + what +
        ' <span class="small">Best: ' + best(q0.id, n) + "</span></li>").join("") +
      "<li><strong>Rung 5: Full questions</strong> – exam-style, marked point by point. No Run button.<ul>" +
      fullQuestions().map((q) => '<li><a href="#q/' + esc(q.id) + '">' + esc(q.title) + "</a> [" + q.marks + '] <span class="small">Best: ' + best(q.id, 5) + "</span></li>").join("") +
      "</ul></li></ol>", "Pack " + pack.id);
  }

  // Rung 1: Decode.
  function showDecode() {
    const q = questionById(pack.rungQuestion);
    const d = pack.rungs.decode;
    const blocks = data.teachingOrder.filter((id) => d.blocksQuestion.correct.includes(id) || d.blocksQuestion.distractors.includes(id));
    const opts = (t) => [t.correct, ...t.wrong].sort();
    setView("<h2>Rung 1: Decode – " + esc(q.title) + "</h2>" + paperHtml(q, true) + sayItSimplyHtml(q) +
      '<form id="decode-form" novalidate>' +
      '<fieldset class="em-q"><legend>' + esc(d.blocksQuestion.prompt) + "</legend>" +
      blocks.map((id) => '<label class="em-check"><input type="checkbox" name="block" value="' + esc(id) + '"> <strong>"' + esc(blockById[id].cue) + '"</strong> ' + esc(blockById[id].name) + "</label>").join("") + "</fieldset>" +
      '<fieldset class="em-q"><legend>What does each bullet need?</legend>' +
      d.bulletTags.map((t, i) => '<label class="em-tag" for="tag' + i + '"><span>' + esc(t.bullet) + '</span><select id="tag' + i + '"><option value="">Choose…</option>' +
        opts(t).map((o) => "<option>" + esc(o) + "</option>").join("") + "</select></label>").join("") + "</fieldset>" +
      '<fieldset class="em-q"><legend>' + esc(d.formatQuestion.prompt) + "</legend>" +
      [d.formatQuestion.correct, ...d.formatQuestion.wrong].sort().map((o) => '<label class="em-check"><input type="radio" name="format" value="' + esc(o) + '"> ' + esc(o) + "</label>").join("") + "</fieldset>" +
      '<p><button type="submit" class="primary">Submit</button></p></form><div id="em-result" aria-live="polite"></div>', "Decode");
    wireSayItSimply(q, 1);
    $("decode-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const answer = {
        blocks: [...document.querySelectorAll('input[name="block"]:checked')].map((x) => x.value),
        tags: d.bulletTags.map((_, i) => $("tag" + i).value || null),
        format: (document.querySelector('input[name="format"]:checked') || {}).value || null,
      };
      const r = X.markDecode(d, answer);
      record({ questionId: q.id, rung: 1, total: r.total, max: r.max, points: r.points.map((p) => ({ id: p.id, awarded: p.correct ? 1 : 0, how: "auto" })),
        help: helpUsed, notes: [], pasteFlag: false, seconds: Math.round((Date.now() - viewStarted) / 1000) });
      const name = (id) => '"' + blockById[id].cue + '" (' + blockById[id].name + ")";
      $("em-result").innerHTML = '<h3>Your mark: ' + r.total + "/" + r.max + "</h3><ul class=\"em-points\">" + r.points.map((p) => {
        const what = p.id === "blocks" ? "Blocks needed" : p.id === "format" ? "Answer format" : "“" + p.bullet + "”";
        const right = p.id === "blocks" ? p.answer.map(name).join(", ") : p.answer;
        return "<li>" + markIcon(p.correct) + '<span class="visually-hidden">' + markWord(p.correct) + ": </span><strong>" + esc(what) + "</strong>" + (p.correct ? "" : ': the answer is <span class="em-right">' + esc(right) + "</span>") + "</li>";
      }).join("") + '</ul><p><button type="button" class="secondary" id="again">Try again</button> <a href="#pack/' + esc(pack.id) + '/skeleton">Next: Skeleton →</a></p>';
      $("again").addEventListener("click", () => route());
      $("em-result").querySelector("h3").focus();
    });
  }

  // Rung 2: Skeleton (Parsons, the practice page's behaviour: click or Enter moves a line, ◀ ▶ indent, ▲ ▼ move, ✕ removes).
  let parsons = null;
  function showSkeleton() {
    const q = questionById(pack.rungQuestion);
    const sk = pack.rungs.skeleton;
    if (!parsons || parsons.q !== q.id) {
      const items = sk.lines.map((l, i) => ({ id: "s" + i, text: l.trim() })).concat(sk.distractors.map((d, i) => ({ id: "d" + i, text: d.line.trim() })));
      for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
      parsons = { q: q.id, available: items, program: [] };
    }
    const draw = () => {
      setView("<h2>Rung 2: Skeleton – " + esc(q.title) + "</h2>" + paperHtml(q) + sayItSimplyHtml(q) + langToggleHtml() +
        '<p id="parsons-help" class="small">Click a line (or press Enter) to move it into your program. Use the arrow buttons, or Alt+↑/↓ to reorder and ←/→ to indent. Press Enter or Delete on a line in your program to remove it.</p>' +
        '<div class="parsons"><div class="parsons-col"><h3 id="avail-h">Lines to use</h3><ul id="p-avail" class="p-list" aria-labelledby="avail-h"></ul></div>' +
        '<div class="parsons-col"><h3 id="prog-h">Your program</h3><ul id="p-prog" class="p-list program" aria-labelledby="prog-h"></ul></div></div>' +
        '<p><button type="button" class="primary" id="check-btn">Check my answer</button></p><div id="em-result" aria-live="polite"></div>', "Skeleton");
      wireSayItSimply(q, 2);
      wireLangToggle(draw);
      drawParsons();
      $("check-btn").addEventListener("click", () => checkSkeleton(q, sk));
    };
    draw();
  }
  let parsonsFocus = null;
  function drawParsons() {
    const line = (l, inProgram) => {
      const indent = inProgram ? l.indent || 0 : 0;
      return '<li class="p-line" tabindex="0" draggable="false" data-id="' + l.id + '" aria-label="' + esc(viewLine(l.text)) + (inProgram ? ", indent " + indent : "") + '" aria-describedby="parsons-help">' +
        '<code style="--p-indent:' + indent * 2.5 + 'ch">' + highlight(viewLine(l.text)) + "</code>" +
        (inProgram ? '<span class="p-btns"><button type="button" tabindex="-1" data-act="out" aria-label="Indent less">◀</button><button type="button" tabindex="-1" data-act="in" aria-label="Indent more">▶</button>' +
          '<button type="button" tabindex="-1" data-act="up" aria-label="Move up">▲</button><button type="button" tabindex="-1" data-act="down" aria-label="Move down">▼</button>' +
          '<button type="button" tabindex="-1" data-act="remove" aria-label="Remove">✕</button></span>' : "") + "</li>";
    };
    $("p-avail").innerHTML = parsons.available.map((l) => line(l, false)).join("") || '<li class="p-empty">All lines used</li>';
    $("p-prog").innerHTML = parsons.program.map((l) => line(l, true)).join("") || '<li class="p-empty">Move lines here</li>';
    if (parsonsFocus) { const el = document.querySelector('.p-line[data-id="' + parsonsFocus + '"]'); if (el) el.focus(); parsonsFocus = null; }
  }
  function parsonsAction(id, act) {
    const inAvail = parsons.available.findIndex((l) => l.id === id);
    const list = inAvail >= 0 ? parsons.available : parsons.program;
    const i = inAvail >= 0 ? inAvail : parsons.program.findIndex((l) => l.id === id);
    if (i < 0) return;
    const l = list[i];
    const inProgram = list === parsons.program;
    if (act === "toggle") act = inProgram ? "remove" : "add";
    if (act === "add") { list.splice(i, 1); l.indent = 0; parsons.program.push(l); }
    else if (act === "remove") { list.splice(i, 1); delete l.indent; parsons.available.push(l); }
    else if (act === "up" && i > 0) list.splice(i - 1, 0, list.splice(i, 1)[0]);
    else if (act === "down" && i < list.length - 1) list.splice(i + 1, 0, list.splice(i, 1)[0]);
    else if (act === "in" && inProgram) l.indent = Math.min(4, (l.indent || 0) + 1);
    else if (act === "out" && inProgram) l.indent = Math.max(0, (l.indent || 0) - 1);
    parsonsFocus = id;
    drawParsons();
  }
  app.addEventListener("click", (e) => {
    const el = e.target.closest && e.target.closest(".p-line");
    if (!el || !parsons) return;
    const b = e.target.closest("button[data-act]");
    if (b) parsonsAction(el.dataset.id, b.dataset.act);
    else if (el.closest("#p-avail")) parsonsAction(el.dataset.id, "add");
  });
  app.addEventListener("keydown", (e) => {
    const el = e.target.classList && e.target.classList.contains("p-line") ? e.target : null;
    if (!el) return;
    const id = el.dataset.id, inProgram = !!el.closest("#p-prog");
    let handled = true;
    if (e.key === "Enter" || e.key === " ") parsonsAction(id, "toggle");
    else if ((e.key === "Delete" || e.key === "Backspace") && inProgram) parsonsAction(id, "remove");
    else if (e.altKey && e.key === "ArrowUp") parsonsAction(id, "up");
    else if (e.altKey && e.key === "ArrowDown") parsonsAction(id, "down");
    else if (e.key === "ArrowUp" && el.previousElementSibling) el.previousElementSibling.focus();
    else if (e.key === "ArrowDown" && el.nextElementSibling) el.nextElementSibling.focus();
    else if (e.key === "ArrowRight" && inProgram) parsonsAction(id, "in");
    else if (e.key === "ArrowLeft" && inProgram) parsonsAction(id, "out");
    else handled = false;
    if (handled) e.preventDefault();
  });
  // Checked as on the practice page: no line that isn't needed, no needed line left out, and the program's output on the
  // tests (t1, t2) is the same as the correct skeleton's.
  async function checkSkeleton(q, sk) {
    const res = $("em-result");
    const used = parsons.program.find((l) => l.id.startsWith("d"));
    const missing = parsons.available.some((l) => l.id.startsWith("s"));
    let ok = false, msg = "";
    if (!parsons.program.length) msg = "Move some lines into 'Your program' first.";
    else if (used) {
      const why = sk.distractors[+used.id.slice(1)].why;
      msg = "Your program uses a line that isn't needed: " + viewLine(used.text) + " – move it back out. " + why.charAt(0).toUpperCase() + why.slice(1) + ".";
    }
    else if (missing) msg = "Some lines you need are still in 'Lines to use'.";
    else {
      res.innerHTML = '<p class="running">Checking…</p>';
      const code = parsons.program.map((l) => " ".repeat(4 * (l.indent || 0)) + l.text).join("\n");
      const tests = q.tests.filter((t) => ["t1", "t2"].includes(t.id));
      const inputs = tests.map((t) => t.inputs.concat(t.spare || []));
      const mine = await runner.run(code, inputs);
      const want = await runner.run(sk.lines.join("\n"), inputs);
      if (!mine || !want) { res.innerHTML = '<p class="problem" role="alert">Python couldn\'t be loaded. Check your internet connection and reload the page.</p>'; return; }
      ok = mine.every((r, i) => !r.error && Checker.outputsMatch(r.output, want[i].output) && r.inputsLeft === want[i].inputsLeft);
      if (!ok) msg = mine.some((r) => r.error && /Indentation|Syntax/.test(r.error.type)) ? "Check the indentation: the lines inside the loop are indented once." : "You've picked all the right lines. Now check their order and indentation.";
    }
    if (parsons.program.length) record({ questionId: q.id, rung: 2, total: ok ? 1 : 0, max: 1, points: [{ id: "skeleton", awarded: ok ? 1 : 0, how: "auto" }], help: helpUsed, notes: [], pasteFlag: false, seconds: Math.round((Date.now() - viewStarted) / 1000) });
    res.innerHTML = ok ? '<p class="success" tabindex="-1">✓ Well done – that is the skeleton of the answer.</p><p><a href="#pack/' + esc(pack.id) + '/fill">Next: Fill the gaps →</a></p>'
      : '<p class="problem" role="alert" tabindex="-1">' + esc(msg) + "</p>";
    res.firstChild.focus();
  }

  // Rung 3: Fill the gaps. Each gap is checked (accept / acceptPattern), then the completed program runs on t1 and t2.
  let fillAnswers = null;
  function showFill() {
    const q = questionById(pack.rungQuestion);
    const f = pack.rungs.fill;
    if (!fillAnswers || fillAnswers.q !== q.id) fillAnswers = { q: q.id, a: f.gaps.map(() => "") };
    const draw = () => {
      const parts = viewCode(f.code).split("____");
      let code = '<pre class="code fill-code">' + highlight(parts[0]);
      for (let i = 1; i < parts.length; i++) {
        const v = fillAnswers.a[i - 1];
        code += '<input type="text" class="blank" data-i="' + (i - 1) + '" value="' + esc(v) + '" aria-label="Gap ' + i + '" spellcheck="false" autocomplete="off" autocapitalize="off" style="width:' + Math.max(5, v.length + 2) + 'ch">' + highlight(parts[i]);
      }
      setView("<h2>Rung 3: Fill the gaps – " + esc(q.title) + "</h2>" + paperHtml(q) + sayItSimplyHtml(q) + langToggleHtml() + code + "</pre>" +
        '<p class="small">Answer in Python. The checker accepts input() with or without int().</p>' +
        '<p><button type="button" class="primary" id="check-btn">Check my answer</button></p><div id="em-result" aria-live="polite"></div>', "Fill the gaps");
      wireSayItSimply(q, 3);
      wireLangToggle(draw);
      document.querySelectorAll(".blank").forEach((inp) => inp.addEventListener("input", () => { fillAnswers.a[+inp.dataset.i] = inp.value; inp.style.width = Math.max(5, inp.value.length + 2) + "ch"; }));
      $("check-btn").addEventListener("click", () => checkFill(q, f));
    };
    draw();
  }
  async function checkFill(q, f) {
    const res = $("em-result");
    if (fillAnswers.a.some((a) => !a.trim())) { res.innerHTML = '<p class="problem" role="alert">Fill in every gap before checking.</p>'; return; }
    const gaps = X.checkGaps(f, fillAnswers.a);
    let runOk = null;
    if (gaps.every(Boolean)) {
      res.innerHTML = '<p class="running">Running your program…</p>';
      const tests = f.tests.map((id) => q.tests.find((t) => t.id === id));
      const results = await runner.run(X.fillCode(f, fillAnswers.a), tests.map((t) => t.inputs.concat(t.spare || [])));
      if (!results) { res.innerHTML = '<p class="problem" role="alert">Python couldn\'t be loaded. Check your internet connection and reload the page.</p>'; return; }
      runOk = tests.every((t, i) => X.runPasses(t, results[i]));
    }
    const points = gaps.map((g, i) => ({ id: "gap" + (i + 1), awarded: g ? 1 : 0, how: "auto" })).concat([{ id: "runs", awarded: runOk ? 1 : 0, how: "auto" }]);
    const total = points.reduce((s, p) => s + p.awarded, 0);
    record({ questionId: q.id, rung: 3, total, max: points.length, points, help: helpUsed, notes: [], pasteFlag: false, seconds: Math.round((Date.now() - viewStarted) / 1000) });
    res.innerHTML = '<h3 tabindex="-1">Your mark: ' + total + "/" + points.length + '</h3><ul class="em-points">' +
      gaps.map((g, i) => "<li>" + markIcon(g) + '<span class="visually-hidden">' + markWord(g) + ": </span>Gap " + (i + 1) + (g ? "" : ": not right yet") + "</li>").join("") +
      "<li>" + markIcon(runOk === true) + '<span class="visually-hidden">' + markWord(runOk === true) + ": </span>" +
      (runOk === null ? "The program runs on the tests once every gap is right" : runOk ? "The program works on the tests" : "The program doesn't stop on 0 or show the right total on the tests") + "</li></ul>" +
      (total === points.length ? '<p><a href="#pack/' + esc(pack.id) + '/steps">Next: One bullet at a time →</a></p>' : "");
    res.querySelector("h3").focus();
  }

  // Rung 4: one step at a time, in one editor, with Run (decision 12). Each step is checked by its rule straight away.
  let stepsCode = "";
  let stepDone = {};
  function showSteps() {
    const q = questionById(pack.rungQuestion);
    const steps = pack.rungs.steps.steps;
    const current = () => steps.find((s) => !stepDone[s.n]) || null;
    setView("<h2>Rung 4: One bullet at a time – " + esc(q.title) + "</h2>" + paperHtml(q) +
      '<ol class="em-steps" id="em-steps"></ol>' + editorHtml(stepsCode) +
      '<p><button type="button" class="secondary" id="run-btn">Run</button> <button type="button" class="primary" id="check-btn">Check this step</button></p>' +
      '<div id="em-result" aria-live="polite"></div>', "One bullet at a time");
    const drawSteps = () => {
      const cur = current();
      $("em-steps").innerHTML = steps.map((s) => '<li class="em-step' + (cur && cur.n === s.n ? " em-step-now" : "") + '"' + (cur && cur.n === s.n ? ' aria-current="step"' : "") + ">" +
        (stepDone[s.n] ? markIcon(true) + '<span class="visually-hidden">done: </span>' : "") + esc(s.task) + "</li>").join("");
      $("check-btn").disabled = !cur;
      $("check-btn").textContent = cur ? "Check step " + cur.n : "All steps done";
    };
    wireEditor((v) => { stepsCode = v; }, pasteHandler(q.id, 4));
    drawSteps();
    $("run-btn").addEventListener("click", async () => {
      const t = q.tests[0];
      $("em-result").innerHTML = '<p class="running">Running…</p>';
      const r = await runner.run(editor.get(), [t.inputs.slice()]);
      if (!r) { $("em-result").innerHTML = '<p class="problem" role="alert">Python couldn\'t be loaded. Check your internet connection and reload the page.</p>'; return; }
      const err = Checker.explainError(r[0].error);
      $("em-result").innerHTML = '<h3>Output</h3><p class="inputs">The user types: ' + esc(t.inputs.join(", then ")) + '</p><pre class="output">' + TaskView.showOutput(r[0].output) + "</pre>" + (err ? TaskView.errorBoxHtml(err) : "");
    });
    $("check-btn").addEventListener("click", async () => {
      const s = current();
      if (!s) return;
      $("em-result").innerHTML = '<p class="running">Checking step ' + s.n + "…</p>";
      const r = await runner.mark(editor.get(), q, s.check);
      const passed = r && !r.timeout && !r.error ? r.passed : null;
      record({ questionId: q.id, rung: 4, step: s.n, stepsTotal: steps.length, total: passed ? 1 : 0, max: 1, points: [{ id: "step" + s.n, awarded: passed ? 1 : 0, how: "auto" }],
        help: false, notes: (r && r.notes) || [], pasteFlag: pasteFlagged, seconds: Math.round((Date.now() - viewStarted) / 1000) });
      if (passed) stepDone[s.n] = true;
      const notes = ((r && r.notes) || []).filter((n) => X.NOTE_TEXT[n]).map((n) => '<p class="em-note">' + esc(X.NOTE_TEXT[n]) + "</p>").join("");
      $("em-result").innerHTML = (passed ? '<p class="success" tabindex="-1">✓ Step ' + s.n + " done." + (current() ? " Now step " + current().n + "." : " That's every step: you've written the whole answer.") + "</p>"
        : passed === null ? '<p class="problem" role="alert" tabindex="-1">' + esc(r && r.timeout ? X.NOTE_TEXT.timeout : "Python couldn't read your code, so this step couldn't be checked. Run it to see which line is wrong.") + "</p>"
        : '<p class="problem" role="alert" tabindex="-1">Not yet: ' + esc(s.task.toLowerCase()) + ". Run your code to see what it does.</p>") + notes +
        (!current() ? '<p><a href="#q/' + esc(fullQuestions()[0].id) + '">Next: the full questions →</a></p>' : "");
      drawSteps();
      $("em-result").firstChild.focus();
    });
  }

  // Rung 5: a full question, as in the exam. Editor only (no Run, decision 12). Marked by exam_marker.py on Submit.
  const drafts = {};
  function showQuestion(q) {
    const seen = !!saved.modelSeen[q.id];
    setView('<h2>' + esc(q.title) + "</h2>" + paperHtml(q) +
      (seen ? '<p class="notice">You have seen the model answer, so these tries are practice only and aren\'t recorded.</p>' : "") +
      editorHtml(drafts[q.id] || "") + '<p><button type="button" class="primary" id="submit-btn">Submit</button></p><div id="em-result" aria-live="polite"></div>', q.title);
    wireEditor((v) => { drafts[q.id] = v; }, pasteHandler(q.id, 5));
    $("submit-btn").addEventListener("click", () => submitQuestion(q));
  }
  async function submitQuestion(q) {
    const res = $("em-result");
    const code = editor.get();
    if (!code.trim()) { res.innerHTML = '<p class="problem" role="alert">Write your answer in the editor first.</p>'; return; }
    $("submit-btn").disabled = true;
    res.innerHTML = '<p class="running">Marking your answer…</p>';
    let r = await runner.mark(code, q);
    $("submit-btn").disabled = false;
    if (!r) { res.innerHTML = '<p class="problem" role="alert">Python couldn\'t be loaded, so your answer can\'t be marked. Check your internet connection and reload the page.</p>'; return; }
    if (r.error) { res.innerHTML = '<p class="problem" role="alert">The marker couldn\'t be loaded, so your answer can\'t be marked. Reload the page and try again.</p>'; return; }
    if (r.timeout) r = { points: q.markPoints.map((m) => ({ id: m.id, awarded: null, status: "unsure", reason: "timeout", feedback: m.feedback })), total: 0, max: q.marks, notes: ["timeout"] };
    const practice = !!saved.modelSeen[q.id];
    const points = r.points.map((p) => ({ id: p.id, awarded: p.awarded, how: p.status === "unsure" ? "unsure" : "auto" }));
    const rec = practice ? null : record({ questionId: q.id, rung: 5, total: r.total, autoTotal: r.total, max: r.max, points, help: false, notes: r.notes, pasteFlag: pasteFlagged,
      seconds: Math.round((Date.now() - viewStarted) / 1000) });
    showMarks(q, r, rec);
  }
  function showMarks(q, r, rec) {
    const res = $("em-result");
    const byId = Object.fromEntries(q.markPoints.map((m) => [m.id, m]));
    const total = () => r.points.reduce((s, p) => s + (p.awarded || 0), 0);
    const draw = () => {
      res.innerHTML = '<h3 tabindex="-1">Your mark: ' + total() + "/" + r.max + "</h3>" +
        r.notes.filter((n) => X.NOTE_TEXT[n]).map((n) => '<p class="em-note">' + esc(X.NOTE_TEXT[n]) + "</p>").join("") +
        '<ul class="em-points">' + r.points.map((p) => {
          const m = byId[p.id];
          const ok = p.awarded === 1 ? true : p.awarded === 0 ? false : null;
          let html = "<li>" + markIcon(ok) + '<span class="visually-hidden">' + markWord(ok) + ": </span><strong>" + esc(m.text) + "</strong>" + (p.self ? ' <span class="small">(you checked this yourself)</span>' : "");
          if (ok === false) html += '<p class="em-feedback">' + esc(m.feedback) + "</p>";
          if (ok === null) html += '<div class="em-self"><p>Check this one yourself. In the model answer:</p><pre class="code">' + highlight(q.modelPython.trim()) + "</pre>" +
            '<p><strong>Does your answer do this?</strong> ' + esc(m.text) + '</p><p><button type="button" class="secondary" data-self="1" data-id="' + esc(p.id) + '">Yes</button> ' +
            '<button type="button" class="secondary" data-self="0" data-id="' + esc(p.id) + '">No</button></p></div>';
          return html + "</li>";
        }).join("") + "</ul>" +
        '<p class="em-after"><button type="button" class="secondary" id="retry-btn">Retry</button> <button type="button" class="secondary" id="model-btn">See the model answer and mark scheme</button> ' +
        '<button type="button" class="primary" id="next-btn">Move on</button></p><div id="em-model"></div>';
      res.querySelectorAll("button[data-self]").forEach((b) => b.addEventListener("click", () => {
        const p = r.points.find((x) => x.id === b.dataset.id);
        p.awarded = +b.dataset.self;
        p.self = true;
        if (rec) {
          const rp = rec.points.find((x) => x.id === p.id);
          rp.awarded = p.awarded;
          rp.how = "self";
          rec.total = total();
          persist();
        }
        draw();
        res.querySelector("h3").focus();
      }));
      $("retry-btn").addEventListener("click", () => { route(); });
      $("model-btn").addEventListener("click", () => {
        saved.modelSeen[q.id] = true;
        persist();
        $("em-model").innerHTML = '<h3 tabindex="-1">Model answer</h3><h4>Python</h4><pre class="code">' + highlight(q.modelPython.trim()) + "</pre>" +
          '<h4>OCR Exam Reference Language</h4><pre class="code">' + highlight(q.modelERL.trim()) + "</pre>" +
          '<h3>Mark scheme</h3><ol class="em-scheme">' + q.markPoints.map((m) => "<li>" + esc(m.text) + "</li>").join("") + "</ol>" +
          (q.guidance && q.guidance.length ? '<h4>Marking guidance</h4><ul>' + q.guidance.map((g) => "<li>" + esc(g) + "</li>").join("") + "</ul>" : "") +
          '<p class="small">You can still retry, but from now on your tries at this question are practice only and aren\'t recorded.</p>';
        $("em-model").querySelector("h3").focus();
      });
      $("next-btn").addEventListener("click", () => {
        const list = fullQuestions();
        const i = list.findIndex((x) => x.id === q.id);
        location.hash = i >= 0 && i < list.length - 1 ? "#q/" + list[i + 1].id : "#pack/" + pack.id;
      });
    };
    draw();
    res.querySelector("h3").focus();
  }

  // My exam scores: each question's first-attempt score and best score.
  function showScores() {
    const rows = X.scoreSummary(saved.attempts);
    const title = (id) => { const q = questionById(id); return q ? q.title : id; };
    const helps = saved.help.length;
    setView("<h2>My exam scores</h2>" + (rows.length ? '<div class="table-wrap"><table class="em-scores"><caption class="visually-hidden">First-attempt and best scores</caption>' +
      '<thead><tr><th scope="col">Question</th><th scope="col">Rung</th><th scope="col">First attempt</th><th scope="col">Best</th><th scope="col">Attempts</th></tr></thead><tbody>' +
      rows.map((r) => '<tr><th scope="row">' + esc(title(r.questionId)) + "</th><td>" + r.rung + " " + esc(X.RUNG_NAMES[r.rung]) + "</td><td>" + r.first.total + "/" + r.first.max + "</td><td>" + r.best.total + "/" + r.best.max + "</td><td>" + r.attempts + "</td></tr>").join("") +
      "</tbody></table></div>" : "<p>No scores yet. Start with <a href=\"#pack/" + esc(pack.id) + "\">pack " + esc(pack.id) + "</a>.</p>") +
      '<p class="small">"Say it simply" used ' + helps + " time" + (helps === 1 ? "" : "s") + ". Your Exam Mode work is saved in this browser only. Nothing is sent anywhere.</p>", "My exam scores");
  }

  // ---------- Start ----------
  fetch("exam-mode.json").then((r) => { if (!r.ok) throw new Error("exam-mode.json"); return r.json(); }).then((j) => {
    data = j;
    for (const b of data.blocks) blockById[b.id] = b;
    pack = data.packs[0];
    window.addEventListener("hashchange", route);
    route();
  }).catch(() => {
    app.innerHTML = '<p class="problem">Couldn\'t load Exam Mode. Open this site through a local web server (see README.md) rather than double-clicking the file.</p>';
  });
});
