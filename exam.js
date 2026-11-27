// Exam Mode (prompts EM1, EM1b): the student page exam.html. The pure parts (marking the Decode rung, checking gaps, the
// ERL view of Python code, the scores summary, the landing page's pack progress, the tutorial's text) are a UMD module,
// ExamMode, tested by tests/exam-mode.js. EM1b (decision 21): a landing page with a card per pack, a tutorial on the
// first visit, rung 1 rebuilt (bullet to code, mark it like an examiner), and each rung set in its own context. The browser part
// below draws the page. Marking of code (rungs 4 and 5) happens in the Python worker (worker.js loads exam_marker.py
// after harness.py), never here. Records are kept in this browser (localStorage); in backend mode (EM2) they also go to
// the class's server through backend.js's outbox, and the page only opens when the class has Exam Mode switched on.
// student-api and teacher-api load this file too, for the switch rule, packProgress and the row conversions (the page
// part below only runs on exam.html).
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

  // ---------- Rung 1: Decode (rebuilt in EM1b, decision 21) ----------
  // Part 1, bullet to code: for each bullet, the line that earns its mark. choices[i] = the code of the option picked.
  // One point per bullet; each keeps the right line and, for a wrong pick, why it doesn't earn the mark.
  const sortedOptions = (item) => item.options.slice().sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  function markBullets(decode, choices) {
    const points = decode.bulletToCode.map((item, i) => {
      const given = item.options.find((o) => o.code === (choices || [])[i]) || null;
      return { id: "bullet" + (i + 1), point: item.point, correct: !!(given && given.right), given: given ? given.code : null,
        why: given && !given.right ? given.why : null, answer: item.options.find((o) => o.right).code };
    });
    return { points, total: points.filter((p) => p.correct).length, max: points.length };
  }
  // Part 2, mark it like an examiner: for each pair of answers, which one earns the mark point (one point) and why (one
  // point). picks[i] = { which: "a" | "b", reason: the reason's text }.
  const sortedReasons = (pair) => pair.reasons.slice().sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
  function markExaminer(decode, picks) {
    const points = [];
    decode.examiner.forEach((pair, i) => {
      const pick = (picks || [])[i] || {};
      const why = pair.reasons.find((r) => r.right).text;
      points.push({ id: "pair" + (i + 1) + "-which", point: pair.point, correct: pick.which === pair.right, given: pick.which || null, answer: pair.right });
      points.push({ id: "pair" + (i + 1) + "-why", point: pair.point, correct: pick.reason === why, given: pick.reason || null, answer: why });
    });
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
  // the best. Rung 4 is one record per step check; its score is the steps passed (first: on their first check). Rung 1
  // is one record per part (step 1 bullet to code, step 2 examiner); its score adds the parts up.
  // Paste-flagged attempts (decisions 16 and 26, EM3) count towards no score: a flagged first attempt gives no first
  // score (null; for rungs 1 and 4, that part or step adds nothing), and the best is the best unflagged one (null if
  // every one was flagged). pasteFlagged: how many were flagged, so the page can say "Paste flagged".
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
      const pasteFlagged = list.filter((a) => a.pasteFlag).length;
      if (list.some((a) => a.step != null)) {
        const steps = new Map();
        for (const a of list) {
          if (!steps.has(a.step)) steps.set(a.step, { first: a.pasteFlag ? 0 : a.total, best: a.pasteFlag ? 0 : a.total, max: a.max, counted: !a.pasteFlag });
          else if (!a.pasteFlag) { const s = steps.get(a.step); s.best = Math.max(s.best, a.total); s.counted = true; }
        }
        const max = list[0].stepsTotal || [...steps.values()].reduce((s, x) => s + (x.max || 1), 0);
        const sum = (k) => [...steps.values()].reduce((s, x) => s + x[k], 0);
        const anyCounted = [...steps.values()].some((x) => x.counted);
        rows.push({ questionId, rung, attempts: list.length, pasteFlagged, first: { total: sum("first"), max }, best: anyCounted ? { total: sum("best"), max } : null });
        continue;
      }
      const first = list.find((a) => a.first) || list[0];
      const counted = list.filter((a) => !a.pasteFlag);
      const best = counted.length ? counted.reduce((b, a) => (a.total > b.total ? a : b), counted[0]) : null;
      rows.push({ questionId, rung, attempts: list.length, pasteFlagged, first: first.pasteFlag ? null : { total: first.total, max: first.max },
        best: best ? { total: best.total, max: best.max } : null });
    }
    return rows.sort((a, b) => (a.questionId < b.questionId ? -1 : a.questionId > b.questionId ? 1 : a.rung - b.rung));
  }

  const STORAGE_PREFIX = "pyPractice.exam.v1."; // + student id → { attempts, help, pasteFlags, modelSeen, tutorialSeen }
  const RUNG_NAMES = { 1: "Decode", 2: "Skeleton", 3: "Fill the gaps", 4: "One bullet at a time", 5: "Full question" };
  const RUNG_KEYS = ["decode", "skeleton", "fill", "steps"]; // rungs 1-4; each has its own question (pack.rungQuestions)

  // ---------- The landing page: one card per pack (EM1b, decision 21) ----------
  // Rung reached = the highest rung tried on the rung's own question (rung 5: any full question). First attempt and
  // best = the full questions tried, added up. next = where Continue goes: the first rung not tried yet, then the first
  // full question not tried yet, then the pack page.
  const fullQuestionsOf = (pack) => { const rq = new Set(Object.values(pack.rungQuestions || {})); return pack.questions.filter((q) => !rq.has(q.id)); };
  function packProgress(pack, attempts) {
    const rec = (attempts || []).filter((a) => a.recorded !== false);
    const full = fullQuestionsOf(pack);
    const tried = (rung) => (rung === 5 ? full.some((q) => rec.some((a) => a.rung === 5 && a.questionId === q.id))
      : rec.some((a) => a.rung === rung && a.questionId === pack.rungQuestions[RUNG_KEYS[rung - 1]]));
    let reached = 0;
    for (let r = 1; r <= 5; r++) if (tried(r)) reached = r;
    const rows = scoreSummary(rec).filter((r) => r.rung === 5 && full.some((q) => q.id === r.questionId));
    // A paste-flagged score (null) adds nothing (EM3).
    const add = (k) => rows.filter((r) => r[k]).reduce((s, r) => ({ total: s.total + r[k].total, max: s.max + r[k].max }), { total: 0, max: 0 });
    const scored = (k) => rows.some((r) => r[k]);
    let next = "#pack/" + pack.id;
    const firstRung = [1, 2, 3, 4].find((r) => !tried(r));
    const firstQ = full.find((q) => !rec.some((a) => a.rung === 5 && a.questionId === q.id));
    if (firstRung) next = "#pack/" + pack.id + "/" + RUNG_KEYS[firstRung - 1];
    else if (firstQ) next = "#q/" + firstQ.id;
    return { reached, started: rec.some((a) => pack.questions.some((q) => q.id === a.questionId)), fullTried: rows.length, fullCount: full.length,
      first: scored("first") ? add("first") : null, best: scored("best") ? add("best") : null, next,
      pasteFlagged: rec.filter((a) => a.pasteFlag && pack.questions.some((q) => q.id === a.questionId)).length };
  }

  // ---------- A class's Exam Mode numbers (EM2's teacher page, EM3's reports and export) ----------
  // students: [{ nickname, recs }], each student's records as this page keeps them (on the server, X.fromServerRow of
  // their exam_attempts rows). One rule for teacher-api's overview and the teacher view's Reports and export:
  //   students: [{ nickname, packs: { packId: { reached, started, full_tried, full_count, first_pct, best_pct, paste_flagged } } }]
  //     (reached by the landing card's rule; first and best on the pack's full questions, as %, paste flags left out);
  //   average: { packId: { reached, first_pct, best_pct, students } } (reached over every student; the % over those with
  //     a full-question score);
  //   missed: [{ pack_id, question_id, students, points: [{ id, missed, pct }], always_true }] for each full question:
  //     from each student's first attempt (none if that attempt was paste-flagged), most missed first;
  //   help: [{ pack_id, question_id, rungs, attempts, self_pct, help_pct }] per question with attempts.
  const pctOf = (n, d) => (d ? Math.round((100 * n) / d) : null);
  function classOverview(packs, students) {
    const byTime = (a, b) => Date.parse(a.at) - Date.parse(b.at);
    const out = students.map((s) => {
      const packsOut = {};
      for (const p of packs) {
        const g = packProgress(p, s.recs);
        packsOut[p.id] = { reached: g.reached, started: g.started, full_tried: g.fullTried, full_count: g.fullCount,
          first_pct: g.first ? pctOf(g.first.total, g.first.max) : null, best_pct: g.best ? pctOf(g.best.total, g.best.max) : null, paste_flagged: g.pasteFlagged };
      }
      return { nickname: s.nickname, packs: packsOut };
    });
    const mean = (list) => (list.length ? Math.round((10 * list.reduce((a, b) => a + b, 0)) / list.length) / 10 : null);
    const average = {};
    for (const p of packs) {
      const cells = out.map((s) => s.packs[p.id]);
      const firsts = cells.filter((c) => c.first_pct != null), bests = cells.filter((c) => c.best_pct != null);
      average[p.id] = { reached: mean(cells.map((c) => c.reached)), first_pct: firsts.length ? Math.round(mean(firsts.map((c) => c.first_pct))) : null,
        best_pct: bests.length ? Math.round(mean(bests.map((c) => c.best_pct))) : null, students: cells.length };
    }
    const missed = [];
    for (const p of packs) {
      for (const q of fullQuestionsOf(p)) {
        const firsts = [];
        for (const s of students) {
          const mine = s.recs.filter((r) => r.recorded !== false && r.questionId === q.id && r.rung === 5).sort(byTime);
          const f = mine.find((r) => r.first) || mine[0];
          if (f && !f.pasteFlag) firsts.push(f);
        }
        const points = q.markPoints.map((m) => {
          const n = firsts.filter((f) => (f.points || []).some((x) => x.id === m.id && x.awarded === 0)).length;
          return { id: m.id, missed: n, pct: pctOf(n, firsts.length) };
        }).sort((a, b) => (b.pct || 0) - (a.pct || 0) || (a.id < b.id ? -1 : 1));
        missed.push({ pack_id: p.id, question_id: q.id, students: firsts.length, points, always_true: firsts.filter((f) => (f.notes || []).includes(ALWAYS_TRUE_NOTE)).length });
      }
    }
    const help = [];
    for (const p of packs) {
      for (const q of p.questions) {
        const mine = students.flatMap((s) => s.recs.filter((r) => r.recorded !== false && r.questionId === q.id));
        if (!mine.length) continue;
        const pts = mine.flatMap((r) => r.points || []);
        help.push({ pack_id: p.id, question_id: q.id, rungs: [...new Set(mine.map((r) => r.rung))].sort(), attempts: mine.length,
          self_pct: pctOf(pts.filter((x) => x.how !== "auto").length, pts.length), help_pct: pctOf(mine.filter((r) => r.help).length, mine.length) });
      }
    }
    return { students: out, average, missed, help };
  }

  // ---------- The Exam Mode leaderboard (EM3; decisions 8, 9, 14, 16) ----------
  // What counts, for each student: the FIRST attempt at each question and rung (each rung 1 part and rung 4 step on its
  // own); retries never. Only its auto-marked points, in the marks scored and the marks possible (self-marked ones are
  // left out of both). A paste-flagged first attempt counts for nothing. A first attempt with "Say it simply" used
  // counts its marks scored at 50%, its marks possible in full. A question with no auto-marked point isn't counted.
  // -> [{ t (ms), scored, possible }]
  const DAY_MS = 86400000;
  const BOARD_MIN_QUESTIONS = 5;
  function countedFirsts(recs) {
    const groups = new Map();
    for (const r of recs || []) {
      if (r.recorded === false) continue;
      const k = r.questionId + "|" + r.rung + "|" + (r.step == null ? "" : r.step);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    const out = [];
    for (const list of groups.values()) {
      list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.attempt || 0) - (b.attempt || 0));
      const f = list.find((a) => a.first) || list[0];
      if (f.pasteFlag) continue;
      const auto = (f.points || []).filter((p) => p.how === "auto");
      if (!auto.length) continue;
      const got = auto.filter((p) => p.awarded === 1).length;
      out.push({ t: Date.parse(f.at), scored: f.help ? got / 2 : got, possible: auto.length });
    }
    return out;
  }
  // Two boards for a class. students: [{ nickname, recs, me }]. A student appears once they have at least 5 counted
  // questions in the board's window. Average % correct: all time, 100 × scored ÷ possible, rounded. Most improved: the
  // average % in the last 7 days minus the 7 days before (at least 5 questions in each), rounded. Ties share a place
  // (1, 2, 2, 4). -> { average: [{ place, nickname, score, me }], improved: [...], min }
  function examBoards(students, now) {
    const at = now == null ? Date.now() : now;
    const pc = (list) => (100 * list.reduce((s, x) => s + x.scored, 0)) / list.reduce((s, x) => s + x.possible, 0);
    const rows = (students || []).map((s) => {
      const c = countedFirsts(s.recs).filter((x) => x.t <= at);
      const last = c.filter((x) => x.t > at - 7 * DAY_MS), prev = c.filter((x) => x.t > at - 14 * DAY_MS && x.t <= at - 7 * DAY_MS);
      return { nickname: s.nickname, me: !!s.me, average: c.length >= BOARD_MIN_QUESTIONS ? Math.round(pc(c)) : null,
        improved: last.length >= BOARD_MIN_QUESTIONS && prev.length >= BOARD_MIN_QUESTIONS ? Math.round(pc(last) - pc(prev)) : null };
    });
    const rank = (key) => {
      const list = rows.filter((r) => r[key] != null).sort((a, b) => b[key] - a[key] || a.nickname.localeCompare(b.nickname));
      let place = 0;
      return list.map((r, i) => { if (i === 0 || r[key] !== list[i - 1][key]) place = i + 1; return { place, nickname: r.nickname, score: r[key], me: r.me }; });
    };
    return { average: rank("average"), improved: rank("improved"), min: BOARD_MIN_QUESTIONS };
  }
  // "+12", "−3" or "0", as the Most improved board shows it.
  const improvedText = (n) => (n > 0 ? "+" + n : n < 0 ? "−" + Math.abs(n) : "0");

  // ---------- The tutorial, shown on the first visit (EM1b, decision 21): blocks, bullets → mark points, riders ----------
  const TUTORIAL = [
    { id: "blocks", title: "Exam questions are built from blocks",
      // decision 23 (EM1c): the plain-job-first layout, with B8 as the example (drawn from exam-mode.json by the page).
      html: "<p>The programming questions in Paper 2 are built from a small set of <strong>blocks</strong>, such as storing what the user types, a loop, or a running total.</p>" +
        "<p>Each block has a title saying what the code does, and examples of question wording that tell you the block is needed. For example:</p>" +
        "<div class=\"em-tutorial-block\" data-block-example=\"B8\"></div>" +
        "<p>The Blocks page, in the menu above, shows all 17.</p>" },
    { id: "marks", title: "Each bullet earns marks",
      html: "<p>The bullets in a question become the <strong>mark points</strong> in the mark scheme. The examiner gives each mark point they can see in your answer, even if other parts of it are wrong.</p>" +
        "<div class=\"em-example\"><p><strong>Bullet:</strong> adds the minutes to a running total</p><p><strong>Mark point:</strong> Adds the minutes to the total (<code>total = total + minutes</code>)</p></div>" +
        "<p>So answer every bullet. A program that only does some of them still earns those marks.</p>" },
    { id: "riders", title: "Read the lines around the bullets",
      html: "<p>The lines before and after the bullets (the <strong>riders</strong>) tell you how you may answer.</p>" +
        "<ul><li><strong>\"Write an algorithm\"</strong>: code, pseudocode or a flowchart all get marks.</li>" +
        "<li><strong>\"You must use either: OCR Exam Reference Language, or a high-level programming language that you have studied.\"</strong>: code only. Pseudocode in English or a flowchart gets no marks.</li></ul>" +
        "<p>Questions are shown in OCR Exam Reference Language (ERL), as in the exam. In Exam Mode you always answer in Python.</p>" },
    { id: "rungs", title: "How a pack works",
      html: "<p>Each pack practises one combination of blocks in five rungs. Each rung is set somewhere different, so you can't copy from the rung before.</p>" +
        "<ol><li><strong>Decode</strong>: pick the line of code each bullet needs, then mark two answers like an examiner.</li>" +
        "<li><strong>Skeleton</strong>: put the lines of an answer in order.</li><li><strong>Fill the gaps</strong>: complete a program.</li>" +
        "<li><strong>One bullet at a time</strong>: build an answer step by step. You can run your code.</li>" +
        "<li><strong>Full questions</strong>: exam-style, marked point by point. No Run button.</li></ol>" +
        "<p>\"Say it simply\" (rungs 1 to 3) gives the question in plain English. Each use is recorded. After a full question you can retry, see the model answer (after that, your tries aren't recorded) or move on.</p>" },
  ];

  // ---------- Rungs 1-4: get it wrong and move on (EM3, decision 27) ----------
  // Each step (rung 1's two parts, rung 2, rung 3, each rung 4 step) has a state. After the first check, right or wrong,
  // the student gets Try again, Show answer and Next; Next stays off until that first check. The first check is the one
  // that counts (decision 13): later checks are recorded as retries until the answer is shown, then not at all (decision
  // 9), and "Try this step again" from the rung's summary is practice, never recorded.
  //   shownBefore: the answer was shown on an earlier visit (its exam_model_seen is already saved).
  const freshStep = (shownBefore) => ({ tries: 0, firstOk: null, ok: false, shown: false, shownBefore: !!shownBefore, practice: false });
  const afterCheck = (st, ok) => Object.assign({}, st, { tries: st.tries + 1, firstOk: st.firstOk === null ? !!ok : st.firstOk, ok: !!ok });
  const afterShow = (st) => Object.assign({}, st, { shown: true, ok: true });
  const stepRecorded = (st) => !st.shown && !st.shownBefore && !st.practice;
  const nextEnabled = (st) => st.tries > 0;
  const nextFillsIn = (st) => !st.ok;            // Next on a wrong step puts the correct version in first
  const triesNote = (st) => (st.ok && !st.shown && st.tries > 1 ? "Correct on try " + st.tries : ""); // for the student only
  const needsAnotherLook = (st) => st.shown || st.firstOk === false; // listed in the rung's summary
  // Show answer is recorded with exam_model_seen. Its task_id names the question, the rung and the step (not just the
  // question, which on the server blocks every later try at the whole question: the full questions' model answer).
  const shownId = (qid, rung, step) => qid + "-r" + rung + (step != null ? "-s" + step : "");
  // Rung 3's answers, read from the rung question's model program (each line of the gapped code against the model's).
  function gapAnswers(fill, model) {
    const lines = String(model).split("\n").map((l) => l.replace(/\s+$/, ""));
    const out = [];
    let from = 0;
    for (const tl of fill.code.split("\n")) {
      if (!tl.includes("____")) continue;
      const re = new RegExp("^" + tl.split("____").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("(.+?)") + "$");
      let m = null;
      for (let i = from; i < lines.length && !m; i++) { m = re.exec(lines[i]); if (m) from = i + 1; }
      if (!m) return null;
      out.push(...m.slice(1));
    }
    return out.length === fill.gaps.length ? out : null;
  }
  // Rung 4: the lines a step adds to the working code before it (what to write, for the feedback).
  function addedLines(before, after) {
    const left = String(before || "").split("\n");
    return String(after).split("\n").filter((l) => { const i = left.indexOf(l); if (i >= 0) { left.splice(i, 1); return false; } return l.trim() !== ""; });
  }

  // ---------- The class switch (EM2, decisions 1 and 15) ----------
  // A class's exam_mode setting: true or false when a teacher has set it, null to follow the stage (on for GCSE, off for
  // KS3 and A-level). The same rule as public.exam_mode_effective in migration 0021; student-api and teacher-api use
  // this one (exam-server.js), and tests check the two agree for every stage and setting.
  const examModeOn = (stage, setting) => (typeof setting === "boolean" ? setting : (stage || "gcse") === "gcse");

  // ---------- Saving to the server (EM2, backend mode) ----------
  // The note recorded when the marker named the always-true loop test (decision 21): the teacher's page counts it.
  const ALWAYS_TRUE_NOTE = "always-true-condition";
  // A record as this page keeps it -> a row for student-api add_exam_attempts (the exam_attempts table's columns).
  // A point the student hasn't checked yet ("check yourself") goes as { awarded: null, status: "self" }. total and
  // auto_total are worked out from the points, as the server checks them. code is only sent when marks were lost.
  function toServerRow(rec, packId, code) {
    const points = (rec.points || []).map((p) => ({ id: p.id, awarded: p.awarded === 1 ? 1 : p.awarded === 0 ? 0 : null, status: p.how === "auto" ? "auto" : "self" }));
    const auto = points.filter((p) => p.status === "auto");
    const sum = (list) => list.reduce((s, p) => s + (p.awarded || 0), 0);
    const row = { record_id: rec.id, timestamp: rec.at, pack_id: packId, question_id: rec.questionId, rung: rec.rung, step: rec.step == null ? null : rec.step,
      attempt_number: rec.attempt || 1, first: !!rec.first, points, total: sum(points), max: rec.max, auto_total: sum(auto), auto_max: auto.length,
      notes: (rec.notes || []).filter((n) => /^[a-z0-9-]{1,40}$/.test(n)).slice(0, 10), help_used: !!rec.help, paste_flag: !!rec.pasteFlag };
    if (typeof code === "string" && code && row.total < row.max) row.student_code = code;
    if (rec.assignmentId) row.assignment_id = rec.assignmentId; // an attempt on a class assignment (EM3)
    return row;
  }
  // A row from student-api get_exam_progress -> a record as this page keeps it (rung 4: stepsTotal, the steps it has).
  function fromServerRow(r, stepsTotal) {
    const rec = { id: r.record_id, at: new Date(r.timestamp).toISOString(), packId: r.pack_id, questionId: r.question_id, rung: r.rung, attempt: r.attempt_number,
      first: !!r.first, recorded: true, queued: true, total: r.total, max: r.max, autoTotal: r.auto_total,
      points: (r.points || []).map((p) => ({ id: p.id, awarded: p.awarded, how: p.status === "auto" ? "auto" : p.awarded == null ? "unsure" : "self" })),
      help: !!r.help_used, notes: r.notes || [], pasteFlag: !!r.paste_flag };
    if (r.step != null) rec.step = r.step;
    if (r.rung === 4 && stepsTotal) rec.stepsTotal = stepsTotal;
    if (r.assignment_id) rec.assignmentId = r.assignment_id;
    return rec;
  }
  // Every Exam Mode question an assignment can hold, in the picker's order: for each pack, rungs 1-4 (each its own
  // question) then the full questions. -> [{ id, packId, rung, title, label }] (EM3)
  function assignableQuestions(packs) {
    const out = [];
    for (const p of packs || []) {
      RUNG_KEYS.forEach((k, i) => { const q = p.questions.find((x) => x.id === (p.rungQuestions || {})[k]); if (q) out.push({ id: q.id, packId: p.id, rung: i + 1, title: q.title, label: "Rung " + (i + 1) + ": " + RUNG_NAMES[i + 1] + " – " + q.title }); });
      for (const q of fullQuestionsOf(p)) out.push({ id: q.id, packId: p.id, rung: 5, title: q.title, label: "Full question – " + q.title });
    }
    return out;
  }
  // The rung a question is used on (1-4: the pack's rung question; 5: a full question), or 0 if it isn't one.
  const rungOfQuestion = (packs, qid) => { const a = assignableQuestions(packs).find((x) => x.id === qid); return a ? a.rung : 0; };
  // This browser's records and the server's, one of each id (this browser's copy is kept: it may have a self-check
  // the server hasn't had yet), oldest first.
  function mergeRecords(local, server) {
    const have = new Set((local || []).map((a) => a.id));
    return (local || []).concat((server || []).filter((a) => !have.has(a.id))).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  }

  return { RULES, NOTE_TEXT, numbersIn, sortedOptions, markBullets, sortedReasons, markExaminer, gapRight, checkGaps, fillCode, runPasses, toErl, toErlLine, splitArgs,
    scoreSummary, packProgress, fullQuestionsOf, TUTORIAL, STORAGE_PREFIX, RUNG_NAMES, RUNG_KEYS,
    examModeOn, ALWAYS_TRUE_NOTE, toServerRow, fromServerRow, mergeRecords,
    freshStep, afterCheck, afterShow, stepRecorded, nextEnabled, nextFillsIn, triesNote, needsAnotherLook, shownId, gapAnswers, addedLines,
    classOverview, countedFirsts, examBoards, improvedText, BOARD_MIN_QUESTIONS, assignableQuestions, rungOfQuestion };
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
  // Backend mode (EM2): Exam Mode work goes to the class's server too, and the page only opens when the class has
  // Exam Mode switched on (the teacher's switch, or the stage's default). Local mode: always open, this browser only.
  const BE = self.Backend && self.Backend.enabled ? self.Backend : null;
  // Switched off: only an assignment's Exam Mode question opens (EM3: the teacher chose it); everything else says so.
  const examOff = !!(BE && Store.examMode(student.id) === false);
  if ($("exam-board-link")) $("exam-board-link").hidden = !BE; // the Exam leaderboard needs the class's server
  // An assignment being done (#asg/<assignment id>/...): its tries are saved with its id, and Next goes back to it.
  let asgCtx = null;
  const go = (hash) => { location.hash = asgCtx ? "#asg/" + asgCtx.id : hash; };
  const nextHref = (hash) => (asgCtx ? "#asg/" + asgCtx.id : hash);

  // ---------- Saved in this browser (store.js patterns: readJson/writeJson already catch storage errors) ----------
  // In backend mode this is a copy of the student's records, merged with the server's when the page opens.
  // modelSeenSent and tutorialSent: the events already on their way to the server (so each is sent once).
  const KEY = X.STORAGE_PREFIX + student.id;
  const saved = Object.assign({ attempts: [], help: [], pasteFlags: [], modelSeen: {}, modelSeenSent: {}, tutorialSeen: false, tutorialSent: false }, Store.readJson(KEY) || {});
  const persist = () => { try { Store.writeJson(KEY, saved); } catch (e) { /* storage full or blocked: carry on */ } };
  const newId = () => "x-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  // code: the program the attempt was marked on (sent to the server only when marks were lost, never kept here).
  function record(entry, code) {
    const prior = saved.attempts.filter((a) => a.questionId === entry.questionId && a.rung === entry.rung && (entry.step == null || a.step === entry.step));
    const r = Object.assign({ id: newId(), at: new Date().toISOString(), attempt: prior.length + 1, first: prior.length === 0, recorded: true, packId: pack.id },
      asgCtx ? { assignmentId: asgCtx.id } : {}, entry);
    saved.attempts.push(r);
    persist();
    // A full question with "check yourself" points waits until they are checked (or the student leaves the question).
    if (r.points.some((p) => p.how === "unsure")) hold(r, code); else send(r, code);
    return r;
  }

  // ---------- The server (backend mode, EM2) ----------
  // Each recorded attempt goes into backend.js's outbox (sent after each try, and again until it arrives), as a row of
  // exam_attempts (X.toServerRow). queued marks it as on its way, so it is never sent twice from this browser.
  const packOf = (qid) => (data ? data.packs.find((p) => p.questions.some((q) => q.id === qid)) : null);
  const stepsTotalOf = (qid) => { const p = packOf(qid); return p && p.rungQuestions && p.rungQuestions.steps === qid ? p.rungs.steps.steps.length : null; };
  let held = null; // { rec, code }: a full question's attempt waiting for its self-checks
  function send(rec, code) {
    if (!BE || rec.queued) return;
    const p = packOf(rec.questionId);
    if (!p) return; // a question that's no longer in exam-mode.json
    rec.queued = BE.queueExam(student.id, X.toServerRow(rec, p.id, code));
    persist();
  }
  function hold(rec, code) { releaseHeld(); held = { rec, code }; }
  function releaseHeld() { if (held) { const h = held; held = null; send(h.rec, h.code); } }
  addEventListener("pagehide", releaseHeld); // into the outbox (kept in this browser), sent now or next time
  const event = (type, extra) => Object.assign({ record_id: newId(), record_type: type, timestamp: new Date().toISOString() }, extra || {});
  function sendModelSeen(qid) {
    if (!BE || saved.modelSeenSent[qid]) return;
    if (BE.queueExamEvent(student.id, event("exam_model_seen", { task_id: qid }))) { saved.modelSeenSent[qid] = true; persist(); }
  }
  function sendTutorialSeen() {
    if (!BE || saved.tutorialSent) return;
    if (BE.queueExamEvent(student.id, event("exam_tutorial_seen"))) { saved.tutorialSent = true; persist(); }
  }
  // When the page opens: the server's records join this browser's (the same scores on any computer), and anything this
  // browser has that the server hasn't (EM1's records, kept here only, the first time) is sent. Offline, or a server
  // without Exam Mode: the page carries on with this browser's records.
  async function syncWithServer() {
    if (!BE) return;
    const r = await BE.examProgress();
    if (r.status !== 200 || !r.body || !Array.isArray(r.body.attempts)) return;
    const server = r.body.attempts.map((row) => X.fromServerRow(row, stepsTotalOf(row.question_id)));
    const onServer = new Set(server.map((a) => a.id));
    for (const a of saved.attempts) if (onServer.has(a.id)) a.queued = true; else send(a, null);
    saved.attempts = X.mergeRecords(saved.attempts, server);
    for (const m of r.body.model_seen || []) { saved.modelSeen[m.question_id] = true; saved.modelSeenSent[m.question_id] = true; }
    for (const qid of Object.keys(saved.modelSeen)) sendModelSeen(qid);
    if (r.body.tutorial_seen) { saved.tutorialSeen = true; saved.tutorialSent = true; } else if (saved.tutorialSeen) sendTutorialSeen();
    persist();
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
  // How a block is named to students (decision 23, EM1c): its display title, what the code does; never the old
  // cue-phrase name. In rung 1's feedback the title is followed by the bullet of the current question it answers
  // (decision 24), e.g. Keep asking until a stop value – “repeats until 0 is entered”, so the feedback never quotes
  // another setting. A pack's display title (where it has one) replaces its planning title the same way.
  const quoted = (s) => "“" + s + "”";
  const blockTitle = (id) => blockById[id].display.title;
  const blockWithBullet = (id, bullet) => blockTitle(id) + " – " + quoted(String(bullet).replace(/\.\s*$/, ""));
  const packTitle = (p) => (p.display && p.display.title) || p.title;
  // One block, plain job first (decision 23): the title, "In the question you'll see:", "What to write:" (Python, with
  // the ERL under it behind Show ERL), "Exam term:", "Common mistake:". tag: "li" on the Blocks page, "div" elsewhere.
  function blockCardHtml(b, tag, extra) {
    const d = b.display;
    return "<" + tag + ' class="em-block" id="block-' + esc(b.id) + '"><h3 class="em-block-title">' + esc(d.title) + "</h3>" +
      '<p class="em-block-label">In the question you\'ll see:</p><ul class="em-examples">' + d.questionExamples.map((x) => "<li>" + esc(quoted(x)) + "</li>").join("") + "</ul>" +
      // tabindex 0: a code box that scrolls sideways on a phone can be scrolled with the keyboard (as app.js markScrollers).
      '<p class="em-block-label">What to write:</p><pre class="code" tabindex="0">' + highlight(d.python) + "</pre>" +
      '<p><button type="button" class="secondary em-erl-btn" aria-expanded="false" aria-controls="erl-' + esc(b.id) + '">Show ERL</button></p>' +
      '<div id="erl-' + esc(b.id) + '" class="em-erl" hidden><p class="em-block-label">In OCR Exam Reference Language:</p><pre class="code" tabindex="0">' + highlight(d.erl) + "</pre></div>" +
      '<p><span class="em-block-label">Exam term:</span> ' + esc(d.examTerm) + "</p>" +
      '<p><span class="em-block-label">Common mistake:</span> ' + esc(d.commonMistake) + "</p>" + (extra || "") + "</" + tag + ">";
  }
  // Show ERL / Hide ERL on any block card.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest(".em-erl-btn");
    if (!btn) return;
    const box = document.getElementById(btn.getAttribute("aria-controls"));
    const open = box.hidden;
    box.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "Hide ERL" : "Show ERL";
  });
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
  const rungQuestion = (key) => questionById(pack.rungQuestions[key]); // each rung has its own context (decision 21)
  const fullQuestions = () => X.fullQuestionsOf(pack);
  let viewStarted = Date.now();

  function setView(html, title) {
    app.innerHTML = html;
    document.title = (title ? title + " – " : "") + "Exam Mode – Pythons and Ladders";
    // The navigation shows where the student is: Blocks, My exam scores, or Packs (the landing page, a pack's rungs and
    // its full questions). The tutorial is none of them.
    const section = /^#blocks/.test(location.hash) ? "blocks" : /^#scores/.test(location.hash) ? "scores" : /^#leaderboard/.test(location.hash) ? "leaderboard"
      : /^#(tutorial|asg\/)/.test(location.hash) ? "" : "pack";
    document.querySelectorAll(".exam-nav a").forEach((a) => {
      if (a.dataset.section === section) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }
  function focusHeading() { const h = app.querySelector("h2"); if (h) { h.setAttribute("tabindex", "-1"); h.focus(); } }

  function route() {
    releaseHeld(); // leaving a full question: its attempt goes as it is (any unchecked point as not checked)
    viewStarted = Date.now();
    helpUsed = false;
    pasteFlagged = false;
    showPython = false; // each page starts in ERL, as the exam does
    const h = location.hash || "#home";
    let m;
    asgCtx = null;
    document.querySelector(".exam-nav").hidden = examOff;
    if ((m = /^#asg\/([0-9a-f-]{36})(?:\/([\w-]+))?$/i.exec(h))) { showAssignment(m[1], m[2]); focusHeading(); return; }
    if (examOff) { // EM2: the class has Exam Mode switched off
      document.title = "Exam Mode – Pythons and Ladders";
      app.innerHTML = "<h2>Exam Mode</h2><p>Exam Mode isn't switched on for your class. Ask your teacher.</p><p><a href=\"app.html\">← Back to your units</a></p>";
      focusHeading();
      return;
    }
    if (h === "#tutorial" || (h === "#home" && !saved.tutorialSeen)) showTutorial(0); // first visit: the tutorial first
    else if (h === "#leaderboard") showLeaderboard();
    else if (h === "#blocks") showBlocks();
    else if (h === "#scores") showScores();
    else if ((m = /^#pack\/([\w-]+)\/(decode|skeleton|fill|steps)$/.exec(h))) ({ decode: showDecode, skeleton: showSkeleton, fill: showFill, steps: showSteps })[m[2]]();
    else if ((m = /^#q\/([\w-]+)$/.exec(h)) && questionById(m[1])) showQuestion(questionById(m[1]));
    else if (/^#pack\//.test(h)) showPack();
    else showHome();
    focusHeading();
  }

  // The tutorial (decision 21): four short screens. Finishing or skipping it is remembered, and the landing page has a
  // link to see it again.
  function showTutorial(i) {
    const t = X.TUTORIAL[i];
    const last = i === X.TUTORIAL.length - 1;
    setView('<p class="small em-count">Step ' + (i + 1) + " of " + X.TUTORIAL.length + '</p><h2>' + esc(t.title) + "</h2>" + '<div class="em-tutorial">' + t.html + "</div>" +
      '<p class="em-after"><button type="button" class="secondary" id="tut-back"' + (i === 0 ? " disabled" : "") + '>Back</button> ' +
      '<button type="button" class="primary" id="tut-next">' + (last ? "Start Exam Mode" : "Next") + "</button> " +
      (last ? "" : '<button type="button" class="secondary" id="tut-skip">Skip</button>') + "</p>", "How Exam Mode works");
    // A block shown as an example (screen 1: B8), in the same layout as the Blocks page.
    app.querySelectorAll("[data-block-example]").forEach((el) => { const b = blockById[el.dataset.blockExample]; if (b) el.innerHTML = blockCardHtml(b, "div"); });
    const done = () => {
      saved.tutorialSeen = true;
      persist();
      sendTutorialSeen(); // backend mode: seen on any computer
      if (location.hash === "#home") route(); else location.hash = "#home";
    };
    $("tut-back").addEventListener("click", () => { showTutorial(i - 1); focusHeading(); });
    $("tut-next").addEventListener("click", () => { if (last) done(); else { showTutorial(i + 1); focusHeading(); } });
    if ($("tut-skip")) $("tut-skip").addEventListener("click", done);
  }

  // The landing page (decision 21, mirroring the main site): one card per pack, with the rung reached, the first-attempt
  // and best score on its full questions, and Continue.
  function showHome() {
    setView('<h2>Exam Mode</h2><p>Practise OCR J277 Paper 2 programming questions, marked point by point like the real exam.</p>' +
      '<p class="small"><a href="#tutorial">How Exam Mode works</a></p>' +
      '<h3 id="packs-h">Packs</h3><ul class="em-packs" aria-labelledby="packs-h">' + data.packs.map((p) => {
        const g = X.packProgress(p, saved.attempts);
        const score = (s) => s.total + "/" + s.max;
        return '<li class="em-pack-card"><h4>Pack ' + esc(p.id) + ": " + esc(packTitle(p)) + "</h4>" +
          '<p class="small">Blocks: ' + p.blocks.map((b) => esc(blockTitle(b))).join(", ") + ".</p>" +
          "<p>" + (g.reached ? "Rung reached: " + g.reached + " of 5 (" + esc(X.RUNG_NAMES[g.reached]) + ")" : "Not started yet") + "</p>" +
          "<p>" + (g.first ? "Full questions: first attempt " + score(g.first) + ", best " + score(g.best) + " (" + g.fullTried + " of " + g.fullCount + " tried)" : "Full questions: not tried yet") + "</p>" +
          '<p class="em-pack-actions"><a class="em-continue" href="' + esc(g.next) + '">' + (g.started ? "Continue" : "Start") + '</a> <a href="#pack/' + esc(p.id) + '">All rungs</a></p></li>';
      }).join("") + "</ul>", "");
  }

  // Blocks: the 17, in teaching order, each plain job first (decision 23). Only pack C1 has content so far.
  function showBlocks() {
    const inPack = new Set(pack.blocks);
    setView("<h2>Blocks</h2><p>Exam questions are built from these blocks. Each one says what the code does, then the kind of wording in a question that tells you it's needed.</p>" +
      '<ol class="em-blocks">' + data.teachingOrder.map((id) => blockCardHtml(blockById[id], "li",
        '<p class="small em-block-status">' + (inPack.has(id) ? 'Practise it in <a href="#pack/' + esc(pack.id) + '">pack ' + esc(pack.id) + "</a>" : "Coming later") + "</p>")).join("") +
      "</ol>", "Blocks");
  }

  // A pack: the five rungs, each set in its own context (decision 21).
  function showPack() {
    const best = (qid, rung) => { const r = X.scoreSummary(saved.attempts).find((x) => x.questionId === qid && x.rung === rung);
      return !r ? "not tried" : r.best ? r.best.total + "/" + r.best.max : "Paste flagged"; };
    const rungs = [
      ["decode", 1, "Decode", "Pick the line of code each bullet needs, then mark two answers like an examiner."],
      ["skeleton", 2, "Skeleton", "Put the lines of the answer in order."],
      ["fill", 3, "Fill the gaps", "Complete the program."],
      ["steps", 4, "One bullet at a time", "Build the answer one step at a time. You can run your code."],
    ];
    setView("<h2>Pack " + esc(pack.id) + ": " + esc(packTitle(pack)) + "</h2>" +
      '<p class="small">Blocks: ' + pack.blocks.map((b) => esc(blockTitle(b))).join(", ") + ".</p>" +
      '<ol class="em-rungs">' +
      rungs.map(([k, n, name, what]) => { const q = rungQuestion(k); return '<li><a href="#pack/' + esc(pack.id) + "/" + k + '"><strong>Rung ' + n + ": " + name + "</strong></a> – " + esc(q.title) + ". " + what +
        ' <span class="small">Best: ' + best(q.id, n) + "</span></li>"; }).join("") +
      "<li><strong>Rung 5: Full questions</strong> – exam-style, marked point by point. No Run button.<ul>" +
      fullQuestions().map((q) => '<li><a href="#q/' + esc(q.id) + '">' + esc(q.title) + "</a> [" + q.marks + '] <span class="small">Best: ' + best(q.id, 5) + "</span></li>").join("") +
      "</ul></li></ol>", "Pack " + pack.id);
  }

  // ---------- Rungs 1-4: get it wrong and move on (EM3, decision 27) ----------
  // Every step has one row of buttons: Check (Check again after the first), and after the first check Try again, Show
  // answer and Next. Next is off until the first check. Next on a wrong step puts the correct version in first, so the
  // next step starts from working code; the student's own version is what was recorded at the check. Show answer is
  // recorded with exam_model_seen (X.shownId: the question, rung and step), after which that step's tries aren't recorded.
  function actionsHtml(st, opts) {
    const p = opts.prefix;
    return '<p class="em-step-actions">' +
      (opts.hideCheck ? "" : '<button type="button" class="primary" id="' + p + 'check">' +
        esc(st.tries ? opts.checkAgain || "Check again" : opts.check || "Check my answer") + "</button> ") +
      (st.tries ? '<button type="button" class="secondary" id="' + p + 'again">Try again</button> ' : "") +
      (st.tries && !st.shown ? '<button type="button" class="secondary" id="' + p + 'show">Show answer</button> ' : "") +
      '<button type="button" class="' + (st.tries ? "primary" : "secondary") + '" id="' + p + 'next"' + (X.nextEnabled(st) ? "" : ' disabled aria-describedby="' + p + 'next-why"') + ">" + esc(opts.next) + "</button>" +
      (X.nextEnabled(st) ? "" : ' <span class="small" id="' + p + 'next-why">Check your answer once first.</span>') + "</p>";
  }
  const stepNotes = (st, filled) => (st.shown ? '<p class="em-note">Answer shown. Your first try is the one that counts, and tries at this step from now on aren\'t recorded.</p>'
    : st.shownBefore ? '<p class="em-note">You\'ve seen this answer before, so tries at this step are practice and aren\'t recorded.</p>'
      : st.practice ? '<p class="em-note">Practice: this try isn\'t recorded, and your score doesn\'t change.</p>' : "") +
    (filled ? '<p class="em-note">The correct answer is filled in, so you can carry on from it. Your own answer is the one that was recorded.</p>' : "") +
    (X.triesNote(st) ? '<p class="success">✓ ' + esc(X.triesNote(st)) + "</p>" : "");
  function markShown(qid, rung, step) {
    const id = X.shownId(qid, rung, step);
    saved.modelSeen[id] = true;
    persist();
    sendModelSeen(id);
  }
  const stepState = (qid, rung, step) => X.freshStep(!!saved.modelSeen[X.shownId(qid, rung, step)]);
  // The end of a rung: the steps shown or wrong first time, each with "Try this step again" (practice only).
  function summaryHtml(title, items, nextHtml) {
    const look = items.filter((i) => X.needsAnotherLook(i.st));
    return '<section class="em-summary" aria-labelledby="sum-h"><h3 id="sum-h" tabindex="-1">' + esc(title) + "</h3>" +
      (look.length ? "<p>Have another look at:</p><ul>" + look.map((i) => "<li><strong>" + esc(i.label) + '</strong> <span class="small">(' +
        (i.st.shown ? "answer shown" : "wrong first time") + ')</span> <button type="button" class="secondary" data-again="' + esc(i.key) + '">Try this step again</button></li>').join("") +
        '</ul><p class="small">Trying a step again is practice. It doesn\'t change your recorded score.</p>' : "<p>Every step was right first time.</p>") +
      "<p>" + nextHtml + "</p></section>";
  }

  // Rung 1: Decode (rebuilt in EM1b, decision 21). Part 1, bullet to code: for each bullet, pick the line that earns its
  // mark (the wrong lines are real mistakes from the examiners' reports and mark schemes); the block is named after
  // answering. Part 2, mark it like an examiner: two short answers side by side; pick the one that earns the mark point,
  // and why. The answers are the rung question's own test answers, so the marker's gate checks them too. Each part is
  // one step (one record each: step 1 and step 2), so My exam scores adds them up. EM3: each part has the three buttons.
  let decodeState = null;
  function showDecode() {
    const q = rungQuestion("decode");
    const d = pack.rungs.decode;
    const answerCode = (id) => q.testAnswers.find((a) => a.id === id).code.trim();
    const pointOf = (id) => q.markPoints.find((m) => m.id === id);
    // Decision 24: the block's title and this question's bullet for that mark point (the bullet-to-code item with the
    // same mark point; its position is the bullet's).
    const bulletFor = (pointId) => q.bullets[d.bulletToCode.findIndex((item) => item.point === pointId)];
    const blockName = (pointId) => blockWithBullet(pointOf(pointId).block, bulletFor(pointId));
    const up = (w) => String(w).toUpperCase();
    const rightChoices = () => d.bulletToCode.map((it) => it.options.find((o) => o.right).code);
    const rightPicks = () => d.examiner.map((p) => ({ which: p.right, reason: p.reasons.find((r) => r.right).text }));
    if (!decodeState || decodeState.q !== q.id) {
      decodeState = { q: q.id, choices: [], part1: null, st1: stepState(q.id, 1, 1), filled1: false, part2Open: false, picks: d.examiner.map(() => ({})), part2: null,
        st2: stepState(q.id, 1, 2), filled2: false, finished: false };
    }
    const s = decodeState;
    const seconds = () => Math.round((Date.now() - viewStarted) / 1000);
    const codeHtml = (c) => "<code>" + highlight(viewLine(c)) + "</code>";

    const part1Result = () => {
      const r = s.part1;
      return '<h3 tabindex="-1" id="p1-h">Part 1: ' + r.total + "/" + r.max + '</h3><ul class="em-points">' + r.points.map((p, i) => "<li>" + markIcon(p.correct) +
        '<span class="visually-hidden">' + markWord(p.correct) + ": </span><strong>Bullet " + (i + 1) + "</strong>" + (p.correct ? ": " + codeHtml(p.answer) : "") +
        ' <span class="small">Block: ' + esc(blockName(p.point)) + "</span>" +
        (p.correct ? "" : '<p class="em-why">' + codeHtml(p.given) + ": " + esc(p.why) + "</p><p class=\"em-why\">Write this line instead: " + codeHtml(p.answer) + "</p>") + "</li>").join("") + "</ul>";
    };
    const part2Result = () => {
      const r = s.part2;
      return '<h3 tabindex="-1" id="p2-h">Part 2: ' + r.total + "/" + r.max + '</h3><ul class="em-points">' + d.examiner.map((pair, i) => {
        const w = r.points[2 * i], y = r.points[2 * i + 1];
        return "<li><strong>" + esc(pointOf(pair.point).text) + '</strong> <span class="small">Block: ' + esc(blockName(pair.point)) + "</span>" +
          '<p class="em-why">' + markIcon(w.correct) + '<span class="visually-hidden">' + markWord(w.correct) + ": </span>" + (w.correct ? "Answer " + up(w.answer) + " earns it." : "Answer " + up(w.answer) + " earns it, not answer " + up(w.given) + ".") + "</p>" +
          '<p class="em-why">' + markIcon(y.correct) + '<span class="visually-hidden">' + markWord(y.correct) + ": </span>" + (y.correct ? "" : "The reason: ") + esc(y.answer) + "</p></li>";
      }).join("") + "</ul>";
    };

    const draw = () => {
      const part1 = '<form id="bullets-form" class="em-part" novalidate><h3>Part 1: Bullet to code</h3><p class="small">For each bullet, pick the line of code that earns its mark.</p>' +
        d.bulletToCode.map((item, i) => '<fieldset class="em-q"><legend>Bullet ' + (i + 1) + ": " + esc(q.bullets[i]) + "</legend>" +
          X.sortedOptions(item).map((o) => '<label class="em-check em-code-option"><input type="radio" name="b' + i + '" value="' + esc(o.code) + '"' +
            (s.choices[i] === o.code ? " checked" : "") + (s.part1 ? " disabled" : "") + "> " + codeHtml(o.code) + "</label>").join("") + "</fieldset>").join("") + "</form>" +
        '<div id="part1-result" aria-live="polite">' + (s.part1 ? part1Result() : "") + stepNotes(s.st1, s.filled1) + "</div>" +
        actionsHtml(s.st1, { prefix: "p1-", check: "Check part 1", hideCheck: !!s.part1, next: s.st1.practice ? "Back to the summary" : "Next: mark it like an examiner" });
      const part2 = !s.part2Open ? "" : '<form id="examiner-form" class="em-part" novalidate><h3 id="p2-title" tabindex="-1">Part 2: Mark it like an examiner</h3>' +
        '<p class="small">Two students answered the question. For each mark point, pick the answer that earns it, and why.</p>' +
        d.examiner.map((pair, i) => '<fieldset class="em-q"><legend>Mark point: ' + esc(pointOf(pair.point).text) + "</legend>" +
          '<div class="em-answers">' + ["a", "b"].map((w) => '<figure><figcaption>Answer ' + up(w) + '</figcaption><pre class="code">' + highlight(viewCode(answerCode(pair[w]))) + "</pre></figure>").join("") + "</div>" +
          '<fieldset class="em-q"><legend>Which answer earns this mark?</legend>' + ["a", "b"].map((w) => '<label class="em-check"><input type="radio" name="w' + i + '" value="' + w + '"' +
            (s.picks[i].which === w ? " checked" : "") + (s.part2 ? " disabled" : "") + "> Answer " + up(w) + "</label>").join("") + "</fieldset>" +
          '<fieldset class="em-q"><legend>Why?</legend>' + X.sortedReasons(pair).map((r) => '<label class="em-check"><input type="radio" name="r' + i + '" value="' + esc(r.text) + '"' +
            (s.picks[i].reason === r.text ? " checked" : "") + (s.part2 ? " disabled" : "") + "> " + esc(r.text) + "</label>").join("") + "</fieldset></fieldset>").join("") + "</form>" +
        '<div id="part2-result" aria-live="polite">' + (s.part2 ? part2Result() : "") + stepNotes(s.st2, s.filled2) + "</div>" +
        actionsHtml(s.st2, { prefix: "p2-", check: "Check part 2", hideCheck: !!s.part2, next: s.st2.practice ? "Back to the summary" : "Next: the end of rung 1" });
      const summary = !s.finished ? "" : summaryHtml("Rung 1 done", [{ key: "1", label: "Part 1: Bullet to code", st: s.st1 }, { key: "2", label: "Part 2: Mark it like an examiner", st: s.st2 }],
        asgCtx ? '<a href="' + esc(nextHref("")) + '">Back to the assignment →</a>' : '<a href="#pack/' + esc(pack.id) + '/skeleton">Next: Skeleton →</a>');
      setView("<h2>Rung 1: Decode – " + esc(q.title) + "</h2>" + paperHtml(q) + sayItSimplyHtml(q) + langToggleHtml() + part1 + part2 + summary, "Decode");
      wireSayItSimply(q, 1);
      wireLangToggle(draw);
      // Choices are kept as they are made, so "Show in Python" doesn't lose them.
      app.querySelectorAll('#bullets-form input[type="radio"]').forEach((el) => el.addEventListener("change", () => { s.choices[+el.name.slice(1)] = el.value; }));
      app.querySelectorAll('#examiner-form input[type="radio"]').forEach((el) => el.addEventListener("change", () => {
        s.picks[+el.name.slice(1)][el.name[0] === "w" ? "which" : "reason"] = el.value;
      }));
      const focus = (id) => { const el = $(id); if (el) el.focus(); };
      const on = (id, f) => { const el = $(id); if (el) el.addEventListener("click", f); };
      // Enter in a part runs its check (never a page reload).
      [["bullets-form", "p1-check"], ["examiner-form", "p2-check"]].forEach(([f, b]) => { if ($(f)) $(f).addEventListener("submit", (e) => { e.preventDefault(); if ($(b)) $(b).click(); }); });
      // Part 1
      on("p1-check", () => {
        if (d.bulletToCode.some((_, i) => !s.choices[i])) { $("part1-result").innerHTML = '<p class="problem" role="alert">Pick a line for every bullet first.</p>'; return; }
        s.part1 = X.markBullets(d, s.choices);
        if (X.stepRecorded(s.st1)) record({ questionId: q.id, rung: 1, step: 1, total: s.part1.total, max: s.part1.max, points: s.part1.points.map((p) => ({ id: p.id, awarded: p.correct ? 1 : 0, how: "auto" })),
          help: helpUsed, notes: [], pasteFlag: false, seconds: seconds() });
        s.st1 = X.afterCheck(s.st1, s.part1.total === s.part1.max);
        s.filled1 = false;
        draw();
        focus("p1-h");
      });
      on("p1-again", () => { s.part1 = null; s.choices = []; s.filled1 = false; draw(); const first = app.querySelector("#bullets-form input"); if (first) first.focus(); });
      on("p1-show", () => { s.choices = rightChoices(); s.part1 = X.markBullets(d, s.choices); s.st1 = X.afterShow(s.st1); s.filled1 = false; markShown(q.id, 1, 1); draw(); focus("p1-h"); });
      on("p1-next", () => {
        if (X.nextFillsIn(s.st1)) { s.choices = rightChoices(); s.part1 = X.markBullets(d, s.choices); s.filled1 = true; }
        if (s.st1.practice) { s.st1 = Object.assign({}, s.st1, { practice: false }); s.finished = true; draw(); focus("sum-h"); return; }
        s.part2Open = true;
        draw();
        focus("p2-title");
      });
      // Part 2
      on("p2-check", () => {
        if (s.picks.some((p) => !p.which || !p.reason)) { $("part2-result").innerHTML = '<p class="problem" role="alert">Pick an answer and a reason for every mark point first.</p>'; return; }
        s.part2 = X.markExaminer(d, s.picks);
        if (X.stepRecorded(s.st2)) record({ questionId: q.id, rung: 1, step: 2, total: s.part2.total, max: s.part2.max, points: s.part2.points.map((p) => ({ id: p.id, awarded: p.correct ? 1 : 0, how: "auto" })),
          help: helpUsed, notes: [], pasteFlag: false, seconds: seconds() });
        s.st2 = X.afterCheck(s.st2, s.part2.total === s.part2.max);
        s.filled2 = false;
        draw();
        focus("p2-h");
      });
      on("p2-again", () => { s.part2 = null; s.picks = d.examiner.map(() => ({})); s.filled2 = false; draw(); focus("p2-title"); });
      on("p2-show", () => { s.picks = rightPicks(); s.part2 = X.markExaminer(d, s.picks); s.st2 = X.afterShow(s.st2); s.filled2 = false; markShown(q.id, 1, 2); draw(); focus("p2-h"); });
      on("p2-next", () => {
        if (X.nextFillsIn(s.st2)) { s.picks = rightPicks(); s.part2 = X.markExaminer(d, s.picks); s.filled2 = true; }
        s.st2 = Object.assign({}, s.st2, { practice: false });
        s.finished = true;
        draw();
        focus("sum-h");
      });
      // "Try this step again" from the summary: practice, never recorded.
      app.querySelectorAll("button[data-again]").forEach((b) => b.addEventListener("click", () => {
        s.finished = false;
        if (b.dataset.again === "1") { s.st1 = Object.assign(X.freshStep(), { practice: true }); s.part1 = null; s.choices = []; s.filled1 = false; draw(); const first = app.querySelector("#bullets-form input"); if (first) first.focus(); }
        else { s.st2 = Object.assign(X.freshStep(), { practice: true }); s.part2 = null; s.picks = d.examiner.map(() => ({})); s.filled2 = false; draw(); focus("p2-title"); }
      }));
    };
    draw();
  }

  // Rung 2: Skeleton (Parsons, the practice page's behaviour: click or Enter moves a line, ◀ ▶ indent, ▲ ▼ move, ✕ removes).
  // EM3: the three buttons; Show answer and Next (on a wrong skeleton) put the lines in the right order.
  let parsons = null;
  function showSkeleton() {
    const q = rungQuestion("skeleton");
    const sk = pack.rungs.skeleton;
    const freshLines = () => {
      const items = sk.lines.map((l, i) => ({ id: "s" + i, text: l.trim() })).concat(sk.distractors.map((d, i) => ({ id: "d" + i, text: d.line.trim() })));
      for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
      return items;
    };
    if (!parsons || parsons.q !== q.id) parsons = { q: q.id, available: freshLines(), program: [], st: stepState(q.id, 2, null), result: "", filled: false };
    // The right skeleton: every needed line, in order, with its indent; the lines that aren't needed left to use.
    const putRight = () => {
      parsons.program = sk.lines.map((l, i) => ({ id: "s" + i, text: l.trim(), indent: Math.round((l.length - l.trimStart().length) / 4) }));
      parsons.available = sk.distractors.map((d, i) => ({ id: "d" + i, text: d.line.trim() }));
    };
    const draw = () => {
      const st = parsons.st;
      setView("<h2>Rung 2: Skeleton – " + esc(q.title) + "</h2>" + paperHtml(q) + sayItSimplyHtml(q) + langToggleHtml() +
        '<p id="parsons-help" class="small">Click a line (or press Enter) to move it into your program. Use the arrow buttons, or Alt+↑/↓ to reorder and ←/→ to indent. Press Enter or Delete on a line in your program to remove it.</p>' +
        '<div class="parsons"><div class="parsons-col"><h3 id="avail-h">Lines to use</h3><ul id="p-avail" class="p-list" aria-labelledby="avail-h"></ul></div>' +
        '<div class="parsons-col"><h3 id="prog-h">Your program</h3><ul id="p-prog" class="p-list program" aria-labelledby="prog-h"></ul></div></div>' +
        '<div id="em-result" aria-live="polite">' + parsons.result + stepNotes(st, parsons.filled) + "</div>" +
        actionsHtml(st, { prefix: "sk-", next: "Next: Fill the gaps" }), "Skeleton");
      wireSayItSimply(q, 2);
      wireLangToggle(draw);
      drawParsons();
      $("sk-check").addEventListener("click", () => checkSkeleton(q, sk, draw));
      if ($("sk-again")) $("sk-again").addEventListener("click", () => { parsons.available = freshLines(); parsons.program = []; parsons.result = ""; parsons.filled = false; draw(); $("p-avail").querySelector(".p-line").focus(); });
      if ($("sk-show")) $("sk-show").addEventListener("click", () => {
        putRight();
        parsons.st = X.afterShow(parsons.st);
        parsons.result = '<p class="success" tabindex="-1">This is the skeleton of the answer.</p>';
        markShown(q.id, 2, null);
        draw();
        $("em-result").firstChild.focus();
      });
      $("sk-next").addEventListener("click", () => {
        if (X.nextFillsIn(parsons.st)) { putRight(); parsons.filled = true; parsons.result = ""; }
        go("#pack/" + pack.id + "/fill");
      });
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
  // tests (t1, t2) is the same as the correct skeleton's. An empty program isn't a check (nothing to mark).
  async function checkSkeleton(q, sk, draw) {
    const res = $("em-result");
    const used = parsons.program.find((l) => l.id.startsWith("d"));
    const missing = parsons.available.some((l) => l.id.startsWith("s"));
    let ok = false, msg = "";
    if (!parsons.program.length) { res.innerHTML = '<p class="problem" role="alert">Move some lines into \'Your program\' first.</p>'; return; }
    if (used) {
      const why = sk.distractors[+used.id.slice(1)].why;
      msg = "Your program uses a line that isn't needed: " + viewLine(used.text) + ". Move it back out. " + why.charAt(0).toUpperCase() + why.slice(1) + ".";
    } else if (missing) msg = "Some lines you need are still in 'Lines to use'. Move every needed line into your program.";
    else {
      res.innerHTML = '<p class="running">Checking…</p>';
      const code = parsons.program.map((l) => " ".repeat(4 * (l.indent || 0)) + l.text).join("\n");
      const tests = q.tests.filter((t) => ["t1", "t2"].includes(t.id));
      const inputs = tests.map((t) => t.inputs.concat(t.spare || []));
      const mine = await runner.run(code, inputs);
      const want = await runner.run(sk.lines.join("\n"), inputs);
      if (!mine || !want) { res.innerHTML = '<p class="problem" role="alert">Python couldn\'t be loaded. Check your internet connection and reload the page.</p>'; return; }
      ok = mine.every((r, i) => !r.error && Checker.outputsMatch(r.output, want[i].output) && r.inputsLeft === want[i].inputsLeft);
      if (!ok) msg = mine.some((r) => r.error && /Indentation|Syntax/.test(r.error.type)) ? "Check the indentation. Indent the lines inside the loop once." : "You've picked all the right lines. Now check their order and indentation.";
    }
    if (X.stepRecorded(parsons.st)) record({ questionId: q.id, rung: 2, total: ok ? 1 : 0, max: 1, points: [{ id: "skeleton", awarded: ok ? 1 : 0, how: "auto" }], help: helpUsed, notes: [], pasteFlag: false, seconds: Math.round((Date.now() - viewStarted) / 1000) },
      parsons.program.map((l) => " ".repeat(4 * (l.indent || 0)) + l.text).join("\n"));
    parsons.st = X.afterCheck(parsons.st, ok);
    parsons.filled = false;
    parsons.result = ok ? '<p class="success" tabindex="-1">✓ Well done – that is the skeleton of the answer.</p>' : '<p class="problem" role="alert" tabindex="-1">' + esc(msg) + "</p>";
    draw();
    $("em-result").firstChild.focus();
  }

  // Rung 3: Fill the gaps. Each gap is checked (accept / acceptPattern), then the completed program runs on t1 and t2.
  // EM3: the three buttons; Show answer and Next (when wrong) fill each gap from the rung question's model program.
  let fillAnswers = null;
  function showFill() {
    const q = rungQuestion("fill");
    const f = pack.rungs.fill;
    const right = X.gapAnswers(f, q.modelPython) || f.gaps.map((g) => (g.accept || [""])[0]);
    if (!fillAnswers || fillAnswers.q !== q.id) fillAnswers = { q: q.id, a: f.gaps.map(() => ""), st: stepState(q.id, 3, null), result: "", filled: false };
    const draw = () => {
      const parts = viewCode(f.code).split("____");
      let code = '<pre class="code fill-code">' + highlight(parts[0]);
      for (let i = 1; i < parts.length; i++) {
        const v = fillAnswers.a[i - 1];
        code += '<input type="text" class="blank" data-i="' + (i - 1) + '" value="' + esc(v) + '" aria-label="Gap ' + i + '" spellcheck="false" autocomplete="off" autocapitalize="off" style="width:' + Math.max(5, v.length + 2) + 'ch">' + highlight(parts[i]);
      }
      setView("<h2>Rung 3: Fill the gaps – " + esc(q.title) + "</h2>" + paperHtml(q) + sayItSimplyHtml(q) + langToggleHtml() + code + "</pre>" +
        '<p class="small">Answer in Python. The checker accepts input() with or without int().</p>' +
        '<div id="em-result" aria-live="polite">' + fillAnswers.result + stepNotes(fillAnswers.st, fillAnswers.filled) + "</div>" +
        actionsHtml(fillAnswers.st, { prefix: "fl-", next: "Next: One bullet at a time" }), "Fill the gaps");
      wireSayItSimply(q, 3);
      wireLangToggle(draw);
      document.querySelectorAll(".blank").forEach((inp) => inp.addEventListener("input", () => { fillAnswers.a[+inp.dataset.i] = inp.value; inp.style.width = Math.max(5, inp.value.length + 2) + "ch"; }));
      $("fl-check").addEventListener("click", () => checkFill(q, f, right, draw));
      if ($("fl-again")) $("fl-again").addEventListener("click", () => {
        // Keep the right gaps; empty the others and go to the first of them.
        const ok = X.checkGaps(f, fillAnswers.a);
        fillAnswers.a = fillAnswers.a.map((v, i) => (ok[i] ? v : ""));
        fillAnswers.result = "";
        fillAnswers.filled = false;
        draw();
        const first = [...document.querySelectorAll(".blank")].find((b) => !b.value) || document.querySelector(".blank");
        if (first) first.focus();
      });
      if ($("fl-show")) $("fl-show").addEventListener("click", () => {
        fillAnswers.a = right.slice();
        fillAnswers.st = X.afterShow(fillAnswers.st);
        fillAnswers.result = '<p class="success" tabindex="-1">Every gap is filled in with an answer that gets the mark.</p>';
        markShown(q.id, 3, null);
        draw();
        $("em-result").firstChild.focus();
      });
      $("fl-next").addEventListener("click", () => {
        if (X.nextFillsIn(fillAnswers.st)) { fillAnswers.a = right.slice(); fillAnswers.filled = true; fillAnswers.result = ""; }
        go("#pack/" + pack.id + "/steps");
      });
    };
    draw();
  }
  async function checkFill(q, f, right, draw) {
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
    if (X.stepRecorded(fillAnswers.st)) record({ questionId: q.id, rung: 3, total, max: points.length, points, help: helpUsed, notes: [], pasteFlag: false, seconds: Math.round((Date.now() - viewStarted) / 1000) },
      X.fillCode(f, fillAnswers.a));
    fillAnswers.st = X.afterCheck(fillAnswers.st, total === points.length);
    fillAnswers.filled = false;
    fillAnswers.result = '<h3 tabindex="-1">Your mark: ' + total + "/" + points.length + '</h3><ul class="em-points">' +
      gaps.map((g, i) => "<li>" + markIcon(g) + '<span class="visually-hidden">' + markWord(g) + ": </span>Gap " + (i + 1) +
        (g ? "" : ' isn\'t right. Write <code>' + esc(right[i]) + "</code>.") + "</li>").join("") +
      "<li>" + markIcon(runOk === true) + '<span class="visually-hidden">' + markWord(runOk === true) + ": </span>" +
      (runOk === null ? "The program runs on the tests once every gap is right." : runOk ? "The program works on the tests." : "The program doesn't stop on the stop value, or doesn't show the right total. Check each gap again.") + "</li></ul>";
    draw();
    const h = $("em-result").querySelector("h3");
    if (h) h.focus();
  }

  // Rung 4: one step at a time, in one editor, with Run (decision 12). Each step is checked by its rule straight away.
  // EM3: after a step's first check, Try again, Show answer (its correct code in the editor) and Next (on a wrong step,
  // the correct code goes in first, so the next step builds on working code). After the last step, the summary.
  let stepsCode = "";
  let stepsState = null;
  function showSteps() {
    const q = rungQuestion("steps");
    const steps = pack.rungs.steps.steps;
    if (!stepsState || stepsState.q !== q.id) stepsState = { q: q.id, idx: 0, st: steps.map((s) => stepState(q.id, 4, s.n)), result: "", filled: false, finished: false };
    const S = stepsState;
    const codeBefore = (i) => (i > 0 ? steps[i - 1].code : "");
    const draw = () => {
      const cur = S.finished ? null : steps[S.idx];
      const st = cur ? S.st[S.idx] : null;
      const icon = (i) => { const x = S.st[i]; return x.tries === 0 && !x.shown ? "" : x.firstOk ? markIcon(true) + '<span class="visually-hidden">right first time: </span>'
        : x.shown && x.firstOk === null ? '<span class="small">(answer shown)</span> ' : markIcon(false) + '<span class="visually-hidden">wrong first time: </span>'; };
      setView("<h2>Rung 4: One bullet at a time – " + esc(q.title) + "</h2>" + paperHtml(q) +
        '<ol class="em-steps" id="em-steps">' + steps.map((s, i) => '<li class="em-step' + (cur && i === S.idx ? " em-step-now" : "") + '"' + (cur && i === S.idx ? ' aria-current="step"' : "") + ">" +
          icon(i) + esc(s.task) + "</li>").join("") + "</ol>" + editorHtml(stepsCode) +
        '<p><button type="button" class="secondary" id="run-btn">Run</button></p>' +
        '<div id="em-result" aria-live="polite">' + S.result + (st ? stepNotes(st, S.filled) : "") + "</div>" +
        (cur ? actionsHtml(st, { prefix: "st-", check: "Check step " + cur.n, checkAgain: "Check step " + cur.n + " again",
          next: st.practice ? "Back to the summary" : S.idx === steps.length - 1 ? "Finish rung 4" : "Next: step " + steps[S.idx + 1].n }) :
          summaryHtml("Rung 4 done", steps.map((s, i) => ({ key: String(i), label: "Step " + s.n + ": " + s.task, st: S.st[i] })),
            asgCtx ? '<a href="' + esc(nextHref("")) + '">Back to the assignment →</a>' : '<a href="#q/' + esc(fullQuestions()[0].id) + '">Next: the full questions →</a>')), "One bullet at a time");
      wireEditor((v) => { stepsCode = v; }, pasteHandler(q.id, 4));
      $("run-btn").addEventListener("click", async () => {
        const t = q.tests[0];
        $("em-result").innerHTML = '<p class="running">Running…</p>';
        const r = await runner.run(editor.get(), [t.inputs.slice()]);
        if (!r) { $("em-result").innerHTML = '<p class="problem" role="alert">Python couldn\'t be loaded. Check your internet connection and reload the page.</p>'; return; }
        const err = Checker.explainError(r[0].error);
        $("em-result").innerHTML = '<h3>Output</h3><p class="inputs">The user types: ' + esc(t.inputs.join(", then ")) + '</p><pre class="output">' + TaskView.showOutput(r[0].output) + "</pre>" + (err ? TaskView.errorBoxHtml(err) : "");
      });
      const setCode = (code) => { stepsCode = code; editor.set(code); };
      const on = (id, f) => { const el = $(id); if (el) el.addEventListener("click", f); };
      on("st-check", async () => {
        const i = S.idx, s = steps[i];
        $("em-result").innerHTML = '<p class="running">Checking step ' + s.n + "…</p>";
        const code = editor.get();
        const r = await runner.mark(code, q, s.check);
        if (!r) { $("em-result").innerHTML = '<p class="problem" role="alert">Python couldn\'t be loaded. Check your internet connection and reload the page.</p>'; return; }
        // Code Python can't read (or that runs too long) is a wrong check, as before: the student can still go on.
        const unreadable = r.timeout || r.error || r.passed === null;
        const passed = !unreadable && !!r.passed;
        if (X.stepRecorded(S.st[i])) record({ questionId: q.id, rung: 4, step: s.n, stepsTotal: steps.length, total: passed ? 1 : 0, max: 1, points: [{ id: "step" + s.n, awarded: passed ? 1 : 0, how: "auto" }],
          help: false, notes: r.notes || [], pasteFlag: pasteFlagged, seconds: Math.round((Date.now() - viewStarted) / 1000) }, code);
        S.st[i] = X.afterCheck(S.st[i], passed);
        S.filled = false;
        const notes = (r.notes || []).filter((n) => X.NOTE_TEXT[n]).map((n) => '<p class="em-note">' + esc(X.NOTE_TEXT[n]) + "</p>").join("");
        const add = X.addedLines(codeBefore(i), s.code);
        S.result = (passed ? '<p class="success" tabindex="-1">✓ Step ' + s.n + " done.</p>"
          : '<p class="problem" role="alert" tabindex="-1">' + (unreadable ? esc(r.timeout ? X.NOTE_TEXT.timeout : "Python couldn't read your code, so this step couldn't be marked.") + " " : "") +
            "Not yet: " + esc(s.task.toLowerCase()) + ". " + (add.length ? "Add " + (add.length === 1 ? "this line" : "these lines") + ":" : "") + "</p>" +
            (add.length ? '<pre class="code">' + highlight(add.join("\n")) + "</pre>" : "") + '<p class="small">Run your code to see what it does.</p>') + notes;
        draw();
        $("em-result").firstChild.focus();
      });
      on("st-again", () => { S.result = ""; S.filled = false; draw(); const cm = document.querySelector(".CodeMirror"); if (cm && cm.CodeMirror) cm.CodeMirror.focus(); else $("editor").focus(); });
      on("st-show", () => {
        const i = S.idx;
        setCode(steps[i].code);
        S.st[i] = X.afterShow(S.st[i]);
        S.result = '<p class="success" tabindex="-1">The code for step ' + steps[i].n + " is in the editor.</p>";
        markShown(q.id, 4, steps[i].n);
        draw();
        $("em-result").firstChild.focus();
      });
      on("st-next", () => {
        const i = S.idx;
        const filled = X.nextFillsIn(S.st[i]);
        if (filled) setCode(steps[i].code);
        if (S.st[i].practice) { S.st[i] = Object.assign({}, S.st[i], { practice: false }); S.finished = true; }
        else if (i === steps.length - 1) S.finished = true;
        else S.idx = i + 1;
        S.result = "";
        S.filled = filled && !S.finished;
        draw();
        const h = $("sum-h") || $("em-steps");
        if (h) { h.setAttribute("tabindex", "-1"); h.focus(); }
      });
      // "Try this step again": the working code before that step, practice only.
      app.querySelectorAll("button[data-again]").forEach((b) => b.addEventListener("click", () => {
        const i = +b.dataset.again;
        S.idx = i;
        S.st[i] = Object.assign(X.freshStep(), { practice: true });
        S.finished = false;
        S.result = "";
        S.filled = false;
        setCode(codeBefore(i));
        draw();
      }));
    };
    draw();
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
    const points = r.points.map((p) => Object.assign({ id: p.id, awarded: p.awarded, how: p.status === "unsure" ? "unsure" : "auto" }, p.misconception ? { misconception: p.misconception } : {}));
    // The always-true loop test (decision 21) is recorded as a note too, so the teacher's page can count it (EM2).
    const notes = r.notes.concat(r.points.some((p) => p.misconception === "always-true-or") ? [X.ALWAYS_TRUE_NOTE] : []);
    const rec = practice ? null : record({ questionId: q.id, rung: 5, total: r.total, autoTotal: r.total, max: r.max, points, help: false, notes, pasteFlag: pasteFlagged,
      seconds: Math.round((Date.now() - viewStarted) / 1000) }, code);
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
          // The marker's feedback line: the mark point's own, or the one for a mistake it named (decision 21).
          if (ok === false) html += '<p class="em-feedback">' + esc(p.feedback || m.feedback) + "</p>";
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
          // Every point checked: the attempt goes to the server now (backend mode), with the self-checks in it.
          if (held && held.rec === rec && !rec.points.some((x) => x.how === "unsure")) releaseHeld();
        }
        draw();
        res.querySelector("h3").focus();
      }));
      $("retry-btn").addEventListener("click", () => { route(); });
      $("model-btn").addEventListener("click", () => {
        releaseHeld(); // this attempt was made before the model answer: it still counts
        saved.modelSeen[q.id] = true;
        persist();
        sendModelSeen(q.id); // backend mode: the server refuses later tries at this question too (decision 9)
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
        go(i >= 0 && i < list.length - 1 ? "#q/" + list[i + 1].id : "#pack/" + pack.id);
      });
    };
    draw();
    res.querySelector("h3").focus();
  }

  // My exam scores: each question's first-attempt score and best score. A paste-flagged answer counts towards no score
  // (EM3, decisions 16 and 26): it still shows, labelled "Paste flagged", as on the rest of the site.
  const PASTE_FLAGGED = '<span class="flag flag-alert">Paste flagged</span>';
  function showScores() {
    const rows = X.scoreSummary(saved.attempts);
    const title = (id) => { const q = questionById(id); return q ? q.title : id; };
    const helps = saved.help.length;
    const score = (s) => (s ? s.total + "/" + s.max : "–");
    setView("<h2>My exam scores</h2>" + (rows.length ? '<div class="table-wrap"><table class="em-scores"><caption class="visually-hidden">First-attempt and best scores</caption>' +
      '<thead><tr><th scope="col">Question</th><th scope="col">Rung</th><th scope="col">First attempt</th><th scope="col">Best</th><th scope="col">Attempts</th></tr></thead><tbody>' +
      rows.map((r) => '<tr><th scope="row">' + esc(title(r.questionId)) + (r.pasteFlagged ? " " + PASTE_FLAGGED : "") + "</th><td>" + r.rung + " " + esc(X.RUNG_NAMES[r.rung]) +
        "</td><td>" + score(r.first) + "</td><td>" + score(r.best) + "</td><td>" + r.attempts + "</td></tr>").join("") +
      "</tbody></table></div>" + (rows.some((r) => r.pasteFlagged) ? '<p class="small">A paste-flagged answer doesn\'t count towards any score.</p>' : "")
      : "<p>No scores yet. Start with <a href=\"#pack/" + esc(pack.id) + "\">pack " + esc(pack.id) + "</a>.</p>") +
      '<p class="small">"Say it simply" used ' + helps + " time" + (helps === 1 ? "" : "s") + ". " +
      (BE ? "Your Exam Mode work is saved to your class on the school's server, so you see the same scores on any computer. Your teacher can see it."
        : "Your Exam Mode work is saved in this browser only. Nothing is sent anywhere.") + "</p>", "My exam scores");
  }

  // ---------- The Exam leaderboard (EM3; backend mode) ----------
  // Two boards for the class, worked out on the server with exam.js's rule (first attempts only, auto-marked points only,
  // "Say it simply" at 50%, paste flags left out, at least 5 questions): Average % correct and Most improved.
  function boardTable(rows, label, scoreText) {
    if (!rows.length) return '<p class="small">No one has answered ' + X.BOARD_MIN_QUESTIONS + " questions here yet.</p>";
    return '<table class="board-table" aria-label="' + esc(label) + '"><thead><tr><th scope="col" class="num">Place</th><th scope="col">Nickname</th><th scope="col" class="num">' +
      esc(label) + "</th></tr></thead><tbody>" + rows.map((r) => "<tr" + (r.me ? ' class="board-me"' : "") + '><td class="num">' + r.place + "</td><td>" + esc(r.nickname) +
        (r.me ? ' <span class="small">(you)</span>' : "") + '</td><td class="num">' + esc(scoreText(r.score)) + "</td></tr>").join("") + "</tbody></table>";
  }
  async function showLeaderboard() {
    setView('<h2>Exam leaderboard</h2><p class="small">Your class, by nickname. It counts the first try at each question and rung, the marks given automatically, and ' +
      '"Say it simply" at half marks. Paste-flagged answers don\'t count. You appear once you have answered ' + X.BOARD_MIN_QUESTIONS + " questions.</p>" +
      '<div id="exam-boards" aria-live="polite"><p class="small">Loading…</p></div>', "Exam leaderboard");
    const box = $("exam-boards");
    if (!BE) { box.innerHTML = '<p class="small">The Exam leaderboard needs your class\'s server, so it isn\'t available in this browser.</p>'; return; }
    const r = await BE.examLeaderboard();
    if (r.status !== 200) {
      box.innerHTML = '<p class="problem">' + esc(r.status === 400 ? "The Exam leaderboard needs the newest version of the server. It will show once it has been updated." : (r.body && r.body.error) || "Couldn't load the leaderboard. Please try again.") + "</p>";
      return;
    }
    box.innerHTML = "<h3>Average % correct</h3>" + boardTable(r.body.average || [], "Average % correct", (n) => n + "%") +
      '<h3>Most improved</h3><p class="small">This week\'s average % minus last week\'s (' + X.BOARD_MIN_QUESTIONS + " questions or more in each).</p>" +
      boardTable(r.body.improved || [], "Most improved", X.improvedText);
  }

  // ---------- An assignment's Exam Mode questions (EM3) ----------
  // #asg/<id>: the assignment's Exam Mode questions, each opening at its rung (#asg/<id>/<question>). Their tries are
  // saved with the assignment's id. It works even when the class has Exam Mode switched off: the teacher chose these.
  function showAssignment(aid, qid) {
    const a = (Store.assignments(student.id) || []).find((x) => x.id === aid);
    const items = a ? X.assignableQuestions(data.packs).filter((x) => a.task_ids.includes(x.id)).sort((x, y) => a.task_ids.indexOf(x.id) - a.task_ids.indexOf(y.id)) : [];
    if (!a || !items.length) {
      setView('<h2>Assignment</h2><p>This assignment isn\'t open for your class, or has no Exam Mode questions.</p><p><a href="app.html">← Back to your units</a></p>', "Assignment");
      return;
    }
    const item = qid ? items.find((x) => x.id === qid) : null;
    if (qid && !item) { location.hash = "#asg/" + aid; return; }
    if (item) {
      asgCtx = { id: aid, title: a.title };
      const q = questionById(item.id);
      if (item.rung === 5) showQuestion(q);
      else ({ 1: showDecode, 2: showSkeleton, 3: showFill, 4: showSteps })[item.rung]();
      app.insertAdjacentHTML("afterbegin", '<p class="small em-asg-note">Assignment: <a href="#asg/' + esc(aid) + '">' + esc(a.title) + "</a></p>");
      return;
    }
    const tried = (x) => X.scoreSummary(saved.attempts.filter((r) => r.assignmentId === aid && r.questionId === x.id))[0];
    setView("<h2>" + esc(a.title) + "</h2>" + (a.description ? "<p>" + esc(a.description) + "</p>" : "") +
      '<p class="small">Exam Mode questions set by your teacher. Your first try at each one is the one that counts.</p><ol class="em-rungs">' +
      items.map((x) => { const s = tried(x); return '<li><a href="#asg/' + esc(aid) + "/" + esc(x.id) + '">' + esc(x.label) + "</a> " +
        '<span class="small">' + (!s ? "Not tried yet" : "First try: " + (s.first ? s.first.total + "/" + s.first.max : "–") + ", best: " + (s.best ? s.best.total + "/" + s.best.max : "–")) +
        (s && s.pasteFlagged ? " " + PASTE_FLAGGED : "") + "</span></li>"; }).join("") +
      '</ol><p><a href="app.html">← Back to your units</a></p>', a.title);
  }

  // ---------- Start ----------
  fetch("exam-mode.json").then((r) => { if (!r.ok) throw new Error("exam-mode.json"); return r.json(); }).then((j) => {
    data = j;
    for (const b of data.blocks) blockById[b.id] = b;
    pack = data.packs[0];
    return syncWithServer().catch(() => { /* the page still opens with this browser's records */ }).then(() => {
      window.addEventListener("hashchange", route);
      route();
    });
  }).catch(() => {
    app.innerHTML = '<p class="problem">Couldn\'t load Exam Mode. Open this site through a local web server (see README.md) rather than double-clicking the file.</p>';
  });
});
