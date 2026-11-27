// Exam Mode gate (prompt EM1): node tests/exam-mode.js
// Checks exam-mode.json, runs exam_marker.py with local Python (through harness.py, the runner the browser loads into
// Pyodide) on every model answer, test answer and extra check, and the Exam Mode page's own logic (exam.js).
//   - the data is valid: every mark point's rule exists, every test answer's expected keys match the question's mark
//     points and its total is their sum, every block id used exists;
//   - every model answer scores full marks and passes every test;
//   - agreement: per question, the marker agrees with the examiner on at least 95% of mark points (decision 5); every
//     disagreement is printed. The reference marker agreed on all 94, so the overall figure must stay at 100%;
//   - the extra checks (Claude's sanity checks) pass, and A6 has the int note, A5 and B4 quotes-fixed.
// EM1b (decision 21) added: each rung's own question and context, rung 1's bullet-to-code and examiner data (the
// examiner pairs are the rung question's test answers, so the marker agrees with them too), Theo's B7 answer (5/6 with
// the "never stops" feedback), the landing page's progress, the tutorial, and no banner on app.html.
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const data = JSON.parse(fs.readFileSync(path.join(ROOT, "exam-mode.json"), "utf8"));
const Exam = require(path.join(ROOT, "exam.js"));
const AGREEMENT_NEEDED = 0.95; // decision 5
const MISCONCEPTIONS = ["always-true-or"]; // exam_marker.py _MISCONCEPTIONS (EM1b)

let failures = 0, checks = 0;
let pendingChecks = 1; // the end of the file, plus one for each async block still running (see finish)
function check(ok, message) {
  checks++;
  if (!ok) { failures++; console.log("  FAIL " + message); }
  return ok;
}

// ---------- Python: the marker itself ----------
// jobs = [{ code, question, check? }]: check given = one step (rung 4, check_step), else the whole question (mark_answer).
function runMarker(jobs) {
  const driver = [
    "import sys, json",
    "sys.path.insert(0, " + JSON.stringify(ROOT) + ")",
    "import exam_marker",
    "jobs = json.loads(sys.stdin.read())",
    "out = []",
    "for j in jobs:",
    "    if j.get('check') is not None: out.append(exam_marker.check_step(j['code'], j['question'], j['check']))",
    "    elif j.get('runTests'): out.append(exam_marker.run_tests(j['code'], j['question'], j['runTests']))",
    "    else: out.append(exam_marker.mark_answer(j['code'], j['question']))",
    "print(json.dumps(out))",
  ].join("\n");
  const res = spawnSync(process.env.PYTHON || "python", ["-c", driver], {
    input: JSON.stringify(jobs), encoding: "utf8", timeout: 600000, maxBuffer: 64 * 1024 * 1024,
    env: Object.assign({}, process.env, { PYTHONIOENCODING: "utf-8" }),
  });
  if (res.error || res.status !== 0) { console.error("Could not run Python:", res.error || res.stderr); process.exit(2); }
  return JSON.parse(res.stdout);
}

// ---------- 1. The data ----------
console.log("exam-mode.json");
const blockIds = new Set(data.blocks.map((b) => b.id));
check(data.blocks.length === 17 && blockIds.size === 17, "17 blocks with different ids");
check(data.teachingOrder.length === 17 && data.teachingOrder.every((b) => blockIds.has(b)) && new Set(data.teachingOrder).size === 17,
  "teachingOrder lists every block once");
for (const b of data.blocks) {
  check(b.name && b.cue && Array.isArray(b.cuePhrases) && b.cuePhrases.length && Array.isArray(b.mistakes) && Array.isArray(b.pnl),
    b.id + ": name, cue, cue phrases, mistakes and pnl");
}
// EM1c (decision 23): every block's student-facing wording, plain job first, exactly as approved.
const approved = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "exammode", "exam-mode-block-display.json"), "utf8")).blocks;
for (const b of data.blocks) {
  const d = b.display || {};
  check(typeof d.title === "string" && d.title.trim() && Array.isArray(d.questionExamples) && d.questionExamples.length >= 1 && d.questionExamples.every((x) => typeof x === "string" && x.trim()) &&
    [d.python, d.erl, d.examTerm, d.commonMistake].every((x) => typeof x === "string" && x.trim()),
    b.id + ": a display object with a title, at least one example, Python, ERL, an exam term and a common mistake");
  check(JSON.stringify(d) === JSON.stringify(approved[b.id]), b.id + ": the display wording is the approved wording, unchanged");
}
check(Object.keys(approved).length === data.blocks.length, "the approved wording covers exactly the 17 blocks");
// No student-facing title starts with "…" (or has one anywhere): block titles, pack titles as shown, question titles,
// the tutorial's titles and the rung names.
const shownPackTitle = (p) => (p.display && p.display.title) || p.title;
const titles = [...data.blocks.map((b) => b.display && b.display.title), ...data.packs.map(shownPackTitle), ...data.packs.flatMap((p) => p.questions.map((q) => q.title)),
  ...Exam.TUTORIAL.map((t) => t.title), ...Object.values(Exam.RUNG_NAMES)];
const ellipsis = titles.filter((t) => !t || /^\s*(…|\.\.\.)/.test(t) || /…/.test(t));
check(ellipsis.length === 0, "no student-facing title starts with \"…\" or contains one " + JSON.stringify(ellipsis));

const questions = [];
for (const pack of data.packs) {
  check(pack.blocks.every((b) => blockIds.has(b)), pack.id + ": every block id used exists");
  // EM1b (decision 21): each of rungs 1-4 has its own question, in its own context, with the pack's blocks.
  const rqs = pack.rungQuestions || {};
  const rq = (key) => pack.questions.find((q) => q.id === rqs[key]);
  check(Exam.RUNG_KEYS.every((k) => rq(k)), pack.id + ": rungs 1-4 each name a question of the pack");
  check(new Set(Exam.RUNG_KEYS.map((k) => rqs[k])).size === 4 && new Set(Exam.RUNG_KEYS.map((k) => rq(k) && rq(k).stem)).size === 4,
    pack.id + ": each rung has a different question and context");
  check(Exam.fullQuestionsOf(pack).length >= 1 && Exam.fullQuestionsOf(pack).every((q) => q.context === "exam"), pack.id + ": the full questions (rung 5) are the exam-context ones");
  const r = pack.rungs || {};
  if (r.decode) {
    const q1 = rq("decode");
    check(r.decode.bulletToCode.length === q1.bullets.length, pack.id + " decode: one bullet-to-code item per bullet");
    for (const [i, item] of r.decode.bulletToCode.entries()) {
      check(item.options.length >= 3 && item.options.length <= 4 && item.options.filter((o) => o.right).length === 1 &&
        item.options.every((o) => o.right || o.why) && new Set(item.options.map((o) => o.code)).size === item.options.length,
        pack.id + " decode bullet " + (i + 1) + ": 3-4 different lines, one right, every wrong one with a reason");
      check(q1.markPoints.some((m) => m.id === item.point), pack.id + " decode bullet " + (i + 1) + ": its mark point exists");
    }
    for (const [i, pair] of r.decode.examiner.entries()) {
      const A = q1.testAnswers.find((a) => a.id === pair.a), B = q1.testAnswers.find((a) => a.id === pair.b);
      check(A && B && ["a", "b"].includes(pair.right) && pair.reasons.filter((x) => x.right).length === 1 && pair.reasons.length >= 3,
        pack.id + " examiner pair " + (i + 1) + ": two of the question's test answers, a right one and one right reason of 3 or more");
      const good = pair.right === "a" ? A : B, bad = pair.right === "a" ? B : A;
      check(good && bad && good.expected[pair.point] === 1 && bad.expected[pair.point] === 0,
        pack.id + " examiner pair " + (i + 1) + ": the examiner's marks agree (the right answer earns " + pair.point + ", the other doesn't)");
    }
  }
  if (r.skeleton) check(r.skeleton.lines.length >= 3 && r.skeleton.distractors.every((d) => d.line && d.why), pack.id + " skeleton: lines and distractors with a reason");
  if (r.fill) {
    const gaps = r.fill.code.split("____").length - 1;
    check(gaps === r.fill.gaps.length && r.fill.gaps.every((g) => (g.accept && g.accept.length) || g.acceptPattern), pack.id + " fill: one accept rule per gap");
    check(rq("fill") && r.fill.tests.every((t) => rq("fill").tests.some((x) => x.id === t)), pack.id + " fill: its tests are the rung question's");
  }
  if (r.steps) check(r.steps.steps.every((s) => Exam.RULES.includes(s.check.rule)) && r.steps.steps.every((s) => (s.check.tests || []).every((t) => rq("steps").tests.some((x) => x.id === t))),
    pack.id + " steps: every step's rule and test exists");
  for (const q of pack.questions) {
    questions.push(q);
    const ids = q.markPoints.map((m) => m.id);
    check(q.blocks.every((b) => blockIds.has(b)) && q.markPoints.every((m) => blockIds.has(m.block)), q.id + ": every block id used exists");
    check(q.markPoints.length === q.marks, q.id + ": " + q.marks + " marks, one mark point each");
    check(q.markPoints.every((m) => Exam.RULES.includes(m.check.rule)), q.id + ": every mark point's rule exists");
    check(q.markPoints.every((m) => (m.check.tests || []).every((t) => q.tests.some((x) => x.id === t))), q.id + ": every test a mark point names exists");
    check(q.markPoints.every((m) => !m.dependsOn || ids.includes(m.dependsOn)) && q.markPoints.every((m) => (m.followThroughOn || []).every((p) => ids.includes(p))),
      q.id + ": dependsOn and followThroughOn name its own mark points");
    check(!q.penaliseOnceOn || ids.includes(q.penaliseOnceOn), q.id + ": penaliseOnceOn is one of its mark points");
    check(q.tests.every((t) => Array.isArray(t.spare) && t.spare.length), q.id + ": every test has spare inputs after the stop value");
    check(q.markPoints.every((m) => !m.misconceptions || Object.entries(m.misconceptions).every(([k, v]) => MISCONCEPTIONS.includes(k) && v)),
      q.id + ": every named mistake is one the marker knows, with a feedback line");
    for (const a of q.testAnswers) {
      const keys = Object.keys(a.expected);
      check(keys.length === ids.length && ids.every((k) => k in a.expected), q.id + " " + a.id + ": expected has exactly the question's mark points");
      check(keys.reduce((s, k) => s + a.expected[k], 0) === a.total, q.id + " " + a.id + ": total is the sum of the expected marks");
    }
  }
}

// ---------- 2. Marking ----------
const jobs = [];
for (const q of questions) {
  jobs.push({ kind: "model", q, code: q.modelPython, question: q });
  for (const t of q.tests) jobs.push({ kind: "modelTest", q, t, code: q.modelPython, question: q, runTests: [t.id] });
  for (const a of q.testAnswers) jobs.push({ kind: "answer", q, a, code: a.code, question: q });
  for (const x of q.extraChecks || []) jobs.push({ kind: "extra", q, x, code: x.code, question: q });
}
const results = runMarker(jobs.map((j) => ({ code: j.code, question: j.question, runTests: j.runTests })));

console.log("Model answers");
jobs.forEach((j, i) => {
  if (j.kind === "model") check(results[i].total === j.q.marks && results[i].notes.length === 0, j.q.id + ": the model answer scores " + results[i].total + "/" + j.q.marks + " with no notes");
  if (j.kind === "modelTest") {
    const r = results[i][j.t.id];
    const nums = Exam.numbersIn(r.output);
    check(!r.error && r.inputsLeft === j.t.spare.length && (j.t.expectNumbers || []).every((e) => nums.includes(e)),
      j.q.id + " " + j.t.id + ": the model answer passes (no error, stops on the stop value, prints " + JSON.stringify(j.t.expectNumbers || []) + ")");
  }
});

console.log("Agreement with the examiner's marks (decision 5: at least " + AGREEMENT_NEEDED * 100 + "% of mark points per question)");
let allAgree = 0, allPoints = 0;
for (const q of questions) {
  let agree = 0, points = 0;
  jobs.forEach((j, i) => {
    if (j.kind !== "answer" || j.q !== q) return;
    const got = Object.fromEntries(results[i].points.map((p) => [p.id, p]));
    for (const [id, expected] of Object.entries(j.a.expected)) {
      points++;
      const p = got[id];
      if (p && p.awarded === expected) agree++;
      else console.log("  disagree: " + q.id + " " + j.a.id + " " + id + ": expected " + expected + ", got " + (p ? p.awarded : "nothing") + " (" + (p ? p.reason : "no point") + ")");
    }
  });
  allAgree += agree; allPoints += points;
  const pct = points ? agree / points : 1;
  console.log("  " + q.id + " " + q.title + ": " + agree + "/" + points + " mark points (" + (100 * pct).toFixed(1) + "%)");
  check(pct >= AGREEMENT_NEEDED, q.id + ": agreement " + (100 * pct).toFixed(1) + "% is below " + AGREEMENT_NEEDED * 100 + "%");
}
console.log("  Overall: " + allAgree + "/" + allPoints + " (" + (100 * allAgree / allPoints).toFixed(1) + "%)");
check(allAgree === allPoints, "the overall agreement stays at 100% (the reference marker agreed on every mark point)");

console.log("Extra checks (sanity checks, not part of the 95% gate)");
jobs.forEach((j, i) => {
  if (j.kind !== "extra") return;
  const r = results[i];
  console.log("  " + j.q.id + " " + j.x.what + ": " + r.total + "/" + r.max + (r.notes.length ? " (" + r.notes.join(", ") + ")" : ""));
  check(r.total === j.x.total, j.q.id + " " + j.x.what + ": expected " + j.x.total + ", got " + r.total);
});

console.log("Notes");
const noteOf = (qid, aid) => { const i = jobs.findIndex((j) => j.kind === "answer" && j.q.id === qid && j.a.id === aid); return i >= 0 ? results[i].notes : []; };
check(noteOf("C1-Q1", "A6").includes("int"), "A6 carries the int note");
check(noteOf("C1-Q1", "A5").includes("quotes-fixed"), "A5 carries quotes-fixed");
check(noteOf("C1-Q2", "B4").includes("quotes-fixed"), "B4 carries quotes-fixed");
jobs.forEach((j, i) => { if (j.kind === "answer" && j.a.note) check(results[i].notes.includes(j.a.note), j.q.id + " " + j.a.id + ": carries the " + j.a.note + " note"); });
const a5 = jobs.findIndex((j) => j.kind === "answer" && j.q.id === "C1-Q1" && j.a.id === "A5");
check(results[a5].total === 5 && results[a5].points.find((p) => p.id === "BP3").awarded === 0, "A5 in the bowling question: 5/6, with BP3 lost");
// Feedback: the JSON's own text, unchanged. A missed point whose mistake the marker names gets that mistake's line from
// the same mark point (EM1b), and only when a test answer or extra check expects it.
const feedbackOk = (j, r) => r.points.every((p) => {
  const m = j.q.markPoints.find((x) => x.id === p.id);
  const want = ((j.a || j.x || {}).misconception || {})[p.id];
  return want ? p.misconception === want && p.feedback === m.misconceptions[want] : !p.misconception && p.feedback === m.feedback;
});
check(results.every((r, i) => jobs[i].kind === "modelTest" || feedbackOk(jobs[i], r)),
  "every mark point's feedback is the JSON's own text, unchanged (or its named mistake's line, where expected)");
jobs.forEach((j, i) => {
  const want = (j.a || j.x || {}).misconception;
  if (!want) return;
  for (const [pid, mid] of Object.entries(want)) {
    const p = results[i].points.find((x) => x.id === pid);
    check(p && p.awarded === 0 && p.misconception === mid, j.q.id + " " + (j.a ? j.a.id : j.x.what) + ": " + pid + " is missed and names the mistake " + mid);
  }
});
// Theo's answer (decision 21): marked 4/6 before EM1b; fair mark 5/6 with only BP3 lost, and the "never stops" line.
const b7 = jobs.findIndex((j) => j.kind === "answer" && j.q.id === "C1-Q2" && j.a.id === "B7");
check(b7 >= 0 && results[b7].total === 5 && results[b7].points.filter((p) => p.awarded === 0).map((p) => p.id).join() === "BP3" &&
  /never stops/.test(results[b7].points.find((p) => p.id === "BP3").feedback), "B7 (always-true or): 5/6, only BP3 lost, with the \"Your loop never stops\" feedback");
const b2 = jobs.findIndex((j) => j.kind === "answer" && j.q.id === "C1-Q2" && j.a.id === "B2");
check(results[b2].points.find((p) => p.id === "BP4").awarded === 0, "B2 still loses BP4 (name and score asked together): the follow-through doesn't excuse it");

// ---------- 3. Rung 4 steps, and the slips the marker repairs ----------
console.log("Rung 4 steps and repairs");
const pack = data.packs[0];
const q4 = pack.questions.find((q) => q.id === pack.rungQuestions.steps); // the football club (stop value -1)
const steps = pack.rungs.steps.steps;
const stepJobs = [];
for (const s of steps) {
  stepJobs.push({ code: q4.modelPython, question: q4, check: s.check, want: true, what: "the model answer passes step " + s.n });
  stepJobs.push({ code: "", question: q4, check: s.check, want: false, what: "an empty answer fails step " + s.n });
}
stepJobs.push({ code: "goals = int(input('Goals: '))\n", question: q4, check: steps[0].check, want: true, what: "step 1 passes on its own" });
stepJobs.push({ code: "goals = int(input('Goals: '))\ntotal = 0\ntotal = total + goals\n", question: q4, check: steps[1].check, want: true, what: "step 2 passes before the loop is written" });
stepJobs.push({ code: "goals = int(input('Goals: '))\ntotal = 0\nwhile goals != 0:\n    total = total + goals\n    goals = int(input('Goals: '))\n", question: q4, check: steps[2].check, want: false, what: "step 3 fails with != 0 (a 0-0 match would stop it)" });
stepJobs.push({ code: "goals = int(input('Goals: '))\ntotal = 0\nwhile goals != -1:\n    total = total + goals\n    goals = int(input('Goals: '))\n", question: q4, check: steps[2].check, want: true, what: "step 3 passes with != -1" });
stepJobs.push({ code: "total = 0\ngoals = input('Goals: ')\nwhile goals != -1:\n    total = total + goals\n    goals = input('Goals: ')\nprint(total)\n", question: q4, check: steps[3].check, want: true, what: "step 4 passes without int() (int note)" });
const stepResults = runMarker(stepJobs.map((j) => ({ code: j.code, question: j.question, check: j.check })));
stepJobs.forEach((j, i) => check(stepResults[i].passed === j.want, j.what + " (got " + stepResults[i].passed + ")"));
check(stepResults[stepResults.length - 1].notes.includes("int"), "a step marked without int() carries the int note");

// EM3 section 6: Next and Show answer put each rung 4 step's correct code in, so the next step builds on working code.
// Each step's code must pass that step and every step before it, and the last must be the model answer.
const codeJobs = [];
steps.forEach((s, i) => { for (let k = 0; k <= i; k++) codeJobs.push({ code: s.code, question: q4, check: steps[k].check, what: "step " + s.n + "'s code passes step " + steps[k].n }); });
const codeResults = runMarker(codeJobs.map((j) => ({ code: j.code, question: j.question, check: j.check })));
check(steps.every((s) => typeof s.code === "string" && s.code.trim()) && codeResults.every((r) => r.passed === true) && steps[steps.length - 1].code + "\n" === q4.modelPython,
  "rung 4: each step's correct code passes that step and every one before it, and the last step's is the model answer" +
  (codeResults.every((r) => r.passed === true) ? "" : " (" + codeJobs.filter((j, i) => codeResults[i].passed !== true).map((j) => j.what).join("; ") + ")"));
const q3 = pack.questions.find((q) => q.id === pack.rungQuestions.fill);
const gapAns = Exam.gapAnswers(pack.rungs.fill, q3.modelPython);
const gapRun = gapAns ? runMarker([{ code: Exam.fillCode(pack.rungs.fill, gapAns), question: q3, runTests: pack.rungs.fill.tests }])[0] : {};
check(gapAns && gapAns.length === pack.rungs.fill.gaps.length && Exam.checkGaps(pack.rungs.fill, gapAns).every(Boolean) &&
  pack.rungs.fill.tests.every((id) => Exam.runPasses(q3.tests.find((t) => t.id === id), gapRun[id])),
  "rung 3: Show answer's gaps (read from the model program: " + JSON.stringify(gapAns) + ") are accepted, and the program works on the rung's tests");

const q1 = questions.find((q) => q.id === "C1-Q1");
const slip = runMarker([
  { code: "games = int(input('g'))\nwhile games != 0\n    member = input('m')\n    if member = 'yes':\n        print(games * 3.5)\n    else:\n        print(games * 5)\n    games = int(input('g'))\n", question: q1 },
  { code: "games = int(input('g')\nwhile games != 0:\n    print(games)\n", question: q1 },
  { code: "", question: q1 },
]);
check(slip[0].notes.includes("syntax-fixed") && slip[0].total === 5, "a missing colon and = for == are repaired, penalised once (5/6): got " + slip[0].total);
check(slip[1].notes.includes("does-not-parse") && slip[1].points.every((p) => p.status === "unsure"), "code that still won't parse: every point unsure");
check(slip[2].total === 0 && slip[2].points.every((p) => p.awarded === 0), "an empty answer scores 0");

// ---------- 4. The page's own logic (exam.js) ----------
console.log("The Exam Mode page (exam.js)");
const decode = pack.rungs.decode;
const bm = Exam.markBullets(decode, decode.bulletToCode.map((it) => it.options.find((o) => o.right).code));
check(bm.total === bm.max && bm.max === decode.bulletToCode.length, "decode part 1: the right lines score " + bm.total + "/" + bm.max);
const bw = Exam.markBullets(decode, decode.bulletToCode.map((it) => it.options.find((o) => !o.right).code));
check(bw.total === 0 && bw.points.every((p) => !p.correct && p.answer && p.why && p.point), "decode part 1: wrong lines score 0, each with its reason, the right line and its mark point");
check(decode.bulletToCode.every((it) => Exam.sortedOptions(it).length === it.options.length), "decode part 1: every option is shown");
const em = Exam.markExaminer(decode, decode.examiner.map((p) => ({ which: p.right, reason: p.reasons.find((x) => x.right).text })));
check(em.total === em.max && em.max === 2 * decode.examiner.length, "decode part 2: the right answer and reason score " + em.total + "/" + em.max);
const ew = Exam.markExaminer(decode, decode.examiner.map((p) => ({ which: p.right === "a" ? "b" : "a", reason: p.reasons.find((x) => !x.right).text })));
check(ew.total === 0 && ew.points.every((p) => p.answer), "decode part 2: the wrong answer and reason score 0, and each point shows the right one");
check(Exam.markExaminer(decode, []).total === 0 && Exam.markBullets(decode, []).total === 0, "decode: nothing picked scores 0");
const fill = pack.rungs.fill;
check(Exam.checkGaps(fill, ["0", "!=", "total + price", 'int(input("Price: "))', "total"]).every(Boolean), "fill: the expected answers are accepted");
check(Exam.checkGaps(fill, [" 0 ", "!=", " price+total ", "input('Price')", "total"]).every(Boolean), "fill: spaces and the other order are accepted; input without int() is accepted");
check(Exam.checkGaps(fill, ["1", ">", "total", "price", "price"]).every((x) => !x), "fill: wrong answers are refused");
check(Exam.fillCode(fill, ["0", "!=", "total + price", "input()", "total"]).includes("while price != 0:"), "fill: the completed program puts each answer in its gap");
const passRun = { output: "95\n", error: null, inputsLeft: 1 };
check(Exam.runPasses({ inputs: ["30", "45", "20", "0"], spare: ["7"], expectNumbers: [95] }, passRun) &&
  !Exam.runPasses({ inputs: ["0"], spare: ["7"], expectNumbers: [0] }, { output: "0\n", error: null, inputsLeft: 0 }),
  "fill: a test passes when the run stops on the stop value (spare unused) and prints the numbers");
check(Exam.toErl("total = 0\nminutes = int(input(\"Minutes: \"))\nwhile minutes != 0:\n    total = total + minutes\nprint(\"Total:\", total)") ===
  "total = 0\nminutes = input(\"Minutes: \")\nwhile minutes != 0\n    total = total + minutes\nendwhile\nprint(\"Total: \" + str(total))", "ERL view: casts dropped, while/endwhile, print joins with + and str()");
check(Exam.toErl("if a == \"yes\" and b:\n    x = 1\nelif c:\n    x = 2\nelse:\n    x = 3") === "if a == \"yes\" AND b then\n    x = 1\nelseif c then\n    x = 2\nelse\n    x = 3\nendif",
  "ERL view: if/elseif/else/endif and AND");
check(Exam.toErlLine("while minutes != 0:") === "while minutes != 0" && Exam.toErlLine("print(total)") === "print(total)", "ERL view of a single Parsons line");
const att = [
  { questionId: "C1-Q1", rung: 5, attempt: 1, first: true, total: 3, max: 6, recorded: true },
  { questionId: "C1-Q1", rung: 5, attempt: 2, first: false, total: 6, max: 6, recorded: true },
  { questionId: "C1-Q2", rung: 5, attempt: 1, first: true, total: 5, max: 6, recorded: true },
];
const sc = Exam.scoreSummary(att);
check(sc.length === 2 && sc[0].first.total === 3 && sc[0].best.total === 6 && sc[1].first.total === 5 && sc[1].best.total === 5, "My exam scores: first-attempt and best score per question");
// Rung 1 is two parts (step 1: 4 points, step 2: 6 points), added up.
const r1 = Exam.scoreSummary([
  { questionId: "C1-R1", rung: 1, step: 1, total: 2, max: 4, first: true, recorded: true },
  { questionId: "C1-R1", rung: 1, step: 2, total: 6, max: 6, first: true, recorded: true },
  { questionId: "C1-R1", rung: 1, step: 1, total: 4, max: 4, first: false, recorded: true },
]);
check(r1.length === 1 && r1[0].first.total === 8 && r1[0].first.max === 10 && r1[0].best.total === 10, "My exam scores: rung 1's two parts add up (first 8/10, best 10/10)");
const r4 = Exam.scoreSummary([{ questionId: "C1-R4", rung: 4, step: 1, stepsTotal: 4, total: 1, max: 1, recorded: true }, { questionId: "C1-R4", rung: 4, step: 2, stepsTotal: 4, total: 0, max: 1, recorded: true }]);
check(r4[0].first.total === 1 && r4[0].first.max === 4, "My exam scores: rung 4 still counts out of every step (1/4)");
// The landing page's card (decision 21).
const fresh = Exam.packProgress(pack, []);
check(fresh.reached === 0 && !fresh.started && fresh.first === null && fresh.next === "#pack/C1/decode", "landing: a new student hasn't started; Start goes to rung 1");
const some = Exam.packProgress(pack, [
  { questionId: "C1-R1", rung: 1, step: 1, total: 4, max: 4, recorded: true },
  { questionId: "C1-Q0", rung: 2, total: 1, max: 1, recorded: true },
  { questionId: "C1-Q0", rung: 3, total: 5, max: 5, recorded: true }, // an EM1 record: rung 3 was the café then, so it doesn't count
]);
check(some.reached === 2 && some.started && some.next === "#pack/C1/fill", "landing: rung reached 2; Continue goes to the first rung not tried (records from before EM1b's contexts don't count)");
const all = Exam.packProgress(pack, [
  ...Exam.RUNG_KEYS.map((k, i) => ({ questionId: pack.rungQuestions[k], rung: i + 1, total: 1, max: 1, recorded: true })),
  { questionId: "C1-Q1", rung: 5, first: true, total: 3, max: 6, recorded: true },
  { questionId: "C1-Q1", rung: 5, first: false, total: 6, max: 6, recorded: true },
  { questionId: "C1-Q2", rung: 5, first: true, total: 5, max: 6, recorded: false },
]);
check(all.reached === 5 && all.first.total === 3 && all.first.max === 6 && all.best.total === 6 && all.fullTried === 1 && all.fullCount === 2 && all.next === "#q/C1-Q2",
  "landing: rung 5 reached, first 3/6 and best 6/6 on the one full question recorded; Continue goes to the one not tried");
check(Exam.TUTORIAL.length === 4 && ["blocks", "marks", "riders", "rungs"].every((id) => Exam.TUTORIAL.some((t) => t.id === id && t.title && t.html)) &&
  /mark point/.test(Exam.TUTORIAL.find((t) => t.id === "marks").html) && /You must use either/.test(Exam.TUTORIAL.find((t) => t.id === "riders").html),
  "tutorial: blocks, bullets becoming mark points, riders, and how a pack works");
check(Exam.NOTE_TEXT.int === "Your answer would get the marks in the exam. In real Python, add int() around input().", "the int() note's wording (decision 3)");
// EM1c: the page names blocks only by their display title, in the plain-job-first layout with its exact labels.
const examSrc = fs.readFileSync(path.join(ROOT, "exam.js"), "utf8");
const pageSrc = examSrc.slice(examSrc.indexOf("// ===================== Browser page"));
check(!/\.cue\b/.test(pageSrc) && !/blockById\[[^\]]+\]\.name\b|\bb\.name\b/.test(pageSrc) && !/esc\((pack|p)\.title\)/.test(pageSrc),
  "exam.js: no block is shown by its old cue phrase or name, and no pack by its planning title (display titles only)");
check(["In the question you\\'ll see:", "What to write:", "Exam term:", "Common mistake:", "In OCR Exam Reference Language:", ">Show ERL<", "Hide ERL"].every((l) => pageSrc.includes(l)) &&
  /class="em-erl" hidden/.test(pageSrc) && /aria-expanded="false" aria-controls="erl-/.test(pageSrc),
  "exam.js: the block layout's labels, word for word, and the ERL under the Python, collapsed behind Show ERL");
// Decision 24: rung 1 feedback quotes the current question's bullet after the block title (not the block's general
// example), so every mark point in rung 1 must have its bullet: the bullet-to-code item with that point.
check(/const blockName = \(pointId\) => blockWithBullet\(pointOf\(pointId\)\.block, bulletFor\(pointId\)\)/.test(pageSrc) &&
  /const bulletFor = \(pointId\) => q\.bullets\[d\.bulletToCode\.findIndex\(\(item\) => item\.point === pointId\)\]/.test(pageSrc) &&
  /blockTitle\(id\) \+ " – " \+ quoted\(String\(bullet\)/.test(pageSrc) && !/questionExamples\[0\]/.test(pageSrc),
  "rung 1 feedback names each block by its title and the current question's bullet (decision 24), not the block's general example");
for (const p of data.packs) {
  const d = p.rungs && p.rungs.decode;
  if (!d) continue;
  const q1 = p.questions.find((q) => q.id === p.rungQuestions.decode);
  const points = d.bulletToCode.map((it) => it.point);
  check(new Set(points).size === points.length && d.examiner.every((pair) => points.includes(pair.point)) && q1.bullets.length === points.length,
    p.id + " rung 1: every mark point named in the feedback has exactly one bullet of its own question");
}
check(/data-block-example=\\"B8\\"/.test(examSrc) && /title saying what the code does/.test(Exam.TUTORIAL[0].html) && !/cue phrase/i.test(Exam.TUTORIAL.map((t) => t.html).join(" ")),
  "tutorial screen 1: the layout in a sentence or two, with B8 as the example (no cue-phrase wording)");
// EM3: where the new pieces live (tests/backend-client.js checks their rules; the browser checks were run by hand).
{
  const th = fs.readFileSync(path.join(ROOT, "teacher.html"), "utf8"), tj = fs.readFileSync(path.join(ROOT, "teacher.js"), "utf8");
  const eh = fs.readFileSync(path.join(ROOT, "exam.html"), "utf8"), hj = fs.readFileSync(path.join(ROOT, "home.js"), "utf8");
  check(/<a href="#leaderboard" data-section="leaderboard" id="exam-board-link" hidden>Exam leaderboard<\/a>/.test(eh) && /BE\.examLeaderboard\(\)/.test(pageSrc),
    "Exam Mode's navigation has \"Exam leaderboard\" (backend mode), from student-api exam_leaderboard");
  check(/id="mc-exam-link" class="small" hidden>Exam Mode mistakes are on the <a href="#exam">Exam Mode page<\/a>\./.test(th) &&
    /\$\("mc-exam-link"\)\.hidden = !\(tb && currentClass\(\) && switchOf\(currentClass\(\)\)\.on\)/.test(tj),
    "Misconceptions page: \"Exam Mode mistakes are on the Exam Mode page\", hidden when the class has Exam Mode off");
  check(["id=\"lb-exam\"", "id=\"ex-board\"", "id=\"rp-exam\"", "id=\"export-exam\"", "id=\"as-exam-q\"", "id=\"as-exam-add\""].every((s) => th.includes(s)) &&
    /data-hw-unit="' \+ HW\.EXAM_SECTION \+ '"/.test(tj) && /TD\.examExportCsv\(data, exPacks\(\), EX, HW\)/.test(tj),
    "teacher view: the Exam boards (Leaderboards and Exam Mode pages), the Reports section and export, the assignment picker, and Exam Mode in the homework form");
  check(/exam\.html#asg\/' \+ encodeURIComponent\(a\.id\) \+ "\/" \+ encodeURIComponent\(x\.id\)/.test(hj) && /asgCtx \? \{ assignmentId: asgCtx\.id \} : \{\}/.test(pageSrc),
    "assignments: the student's card links each Exam Mode question to exam.html#asg/<assignment>/<question>, whose tries carry the assignment's id");
}
const tile = fs.readFileSync(path.join(ROOT, "app.html"), "utf8");
check(/href="exam\.html"[^>]*class="menu-link"|class="menu-link"[^>]*href="exam\.html"/.test(tile) && !/id="exam-tile"/.test(tile),
  "app.html: the Exam Mode button in the student menu, and no banner (decision 21)");
const worker = fs.readFileSync(path.join(ROOT, "worker.js"), "utf8");
check(/fetch\("exam_marker\.py"\)/.test(worker) && /msg\.type === "mark"/.test(worker) && /type: "marked"/.test(worker), "worker.js: loads exam_marker.py after harness.py and answers mark messages");
// EM2: backend mode, as the other student pages (store, config, backend-rows, backend), and the class switch.
const html = fs.readFileSync(path.join(ROOT, "exam.html"), "utf8");
check(/<script src="store\.js"><\/script>\s*<script src="config\.js"><\/script>\s*<script src="backend-rows\.js"><\/script>\s*<script src="backend\.js"><\/script>/.test(html) &&
  /const examOff = !!\(BE && Store\.examMode\(student\.id\) === false\)/.test(pageSrc) && /Exam Mode isn't switched on for your class\. Ask your teacher\./.test(pageSrc) &&
  /if \(\(m = \/\^#asg\\\/.*showAssignment\(m\[1\], m\[2\]\)[^\n]*\n\s*if \(examOff\)/.test(pageSrc),
  "exam.html: backend mode as the other student pages; a class with Exam Mode switched off sees \"Exam Mode isn't switched on for your class. Ask your teacher.\" (except an assignment's question, EM3)");
// The rows the page sends are the rows the server takes (exam-server.js checkRows), for every kind of record it makes.
const ES = require(path.join(ROOT, "supabase", "functions", "_shared", "exam-server.js"));
const recs = [
  { id: "x-a1-aaaaaa", at: "2026-11-27T10:00:00.000Z", questionId: "C1-R1", rung: 1, step: 1, attempt: 1, first: true, max: 4, help: true, notes: [], pasteFlag: false,
    points: ["bullet1", "bullet2", "bullet3", "bullet4"].map((id, i) => ({ id, awarded: i ? 1 : 0, how: "auto" })) },
  { id: "x-a2-aaaaaa", at: "2026-11-27T10:01:00.000Z", questionId: "C1-Q0", rung: 2, attempt: 1, first: true, max: 1, points: [{ id: "skeleton", awarded: 0, how: "auto" }], notes: [] },
  { id: "x-a3-aaaaaa", at: "2026-11-27T10:02:00.000Z", questionId: "C1-R3", rung: 3, attempt: 2, first: false, max: 6,
    points: ["gap1", "gap2", "gap3", "gap4", "gap5", "runs"].map((id) => ({ id, awarded: 1, how: "auto" })), notes: [] },
  { id: "x-a4-aaaaaa", at: "2026-11-27T10:03:00.000Z", questionId: "C1-R4", rung: 4, step: 3, stepsTotal: 4, attempt: 1, first: true, max: 1, points: [{ id: "step3", awarded: 1, how: "auto" }], notes: ["int"] },
  { id: "x-a5-aaaaaa", at: "2026-11-27T10:04:00.000Z", questionId: "C1-Q2", rung: 5, attempt: 1, first: true, max: 6, pasteFlag: true, notes: ["quotes-fixed", Exam.ALWAYS_TRUE_NOTE],
    points: [{ id: "BP1", awarded: 1, how: "auto" }, { id: "BP2", awarded: 0, how: "auto" }, { id: "BP3", awarded: null, how: "unsure" }, { id: "BP4", awarded: 1, how: "self" },
      { id: "BP5", awarded: 1, how: "auto" }, { id: "BP6", awarded: 0, how: "self" }] },
];
const sent = recs.map((r) => Exam.toServerRow(r, "C1", "print('x')"));
const took = ES.checkRows(sent);
check(took.ok.length === recs.length && !took.rejected.length && sent[4].total === 3 && sent[4].auto_total === 2 && sent[4].auto_max === 3 && sent[4].points[2].status === "self" &&
  sent[4].points[2].awarded === null && sent[2].student_code === undefined && sent[0].student_code === "print('x')" && sent[4].notes.includes("always-true-condition"),
  "the rows exam.js sends (every rung, a part, a step, a self-check and an unchecked point) are all taken by the server's checks; code only when marks were lost");
const back = sent.map((r) => Exam.fromServerRow(Object.assign({}, r, { timestamp: r.timestamp.replace("Z", "+00:00") }), r.rung === 4 ? 4 : null));
check(JSON.stringify(Exam.scoreSummary(back)) === JSON.stringify(Exam.scoreSummary(recs.map((r) => Object.assign({ recorded: true, total: r.points.reduce((s, p) => s + (p.awarded || 0), 0) }, r)))) &&
  back[4].points.map((p) => p.how).join() === "auto,auto,unsure,self,auto,self" && back.every((r) => r.queued && r.recorded) &&
  Exam.mergeRecords([recs[0]], back).length === recs.length && Exam.mergeRecords(back, back).length === recs.length,
  "a row from the server becomes the same record again (the same My exam scores; unchecked points stay \"check yourself\"); merging keeps one of each");
// EM3 section 6 (decision 27): get it wrong and move on.
{
  let st = Exam.freshStep();
  const before = { next: Exam.nextEnabled(st), recorded: Exam.stepRecorded(st) };
  st = Exam.afterCheck(st, false);
  const wrongFirst = { next: Exam.nextEnabled(st), fills: Exam.nextFillsIn(st), first: st.firstOk, look: Exam.needsAnotherLook(st) };
  st = Exam.afterCheck(st, true);
  const rightSecond = { first: st.firstOk, note: Exam.triesNote(st), fills: Exam.nextFillsIn(st), recorded: Exam.stepRecorded(st) };
  const shown = Exam.afterShow(Exam.afterCheck(Exam.freshStep(), false));
  const practice = Object.assign(Exam.freshStep(), { practice: true });
  check(before.next === false && before.recorded && wrongFirst.next && wrongFirst.fills && wrongFirst.first === false && wrongFirst.look &&
    rightSecond.first === false && rightSecond.note === "Correct on try 2" && !rightSecond.fills && rightSecond.recorded,
    "rungs 1-4: Next is off until the first check; a wrong first check stays wrong (Next fills the answer in), and a later right one shows \"Correct on try 2\"");
  check(!Exam.stepRecorded(shown) && shown.ok && Exam.triesNote(shown) === "" && Exam.needsAnotherLook(shown) && !Exam.stepRecorded(practice) && !Exam.stepRecorded(Exam.freshStep(true)) &&
    !Exam.needsAnotherLook(Exam.afterCheck(Exam.freshStep(), true)),
    "rungs 1-4: after Show answer (now or on an earlier visit), and in practice from the summary, tries aren't recorded; the summary lists steps shown or wrong first time");
  const ids = [Exam.shownId("C1-R1", 1, 2), Exam.shownId("C1-Q0", 2, null), Exam.shownId("C1-R4", 4, 3)];
  check(ids.join() === "C1-R1-r1-s2,C1-Q0-r2,C1-R4-r4-s3" && ids.every((x) => /^[A-Za-z0-9-]{1,40}$/.test(x)),
    "Show answer's exam_model_seen names the question, rung and step (" + ids.join(", ") + "), within the existing id pattern: no database change");
  check(Exam.addedLines("total = 0\nx = 1", "total = 0\nx = 1\ntotal = total + x").join() === "total = total + x" && Exam.addedLines("", "a = 1").join() === "a = 1",
    "rung 4's feedback names the lines a step adds (what to write)");
}
// A Show answer on one rung 4 step doesn't stop the next steps being saved (the server's model-answer rule is the whole
// question's), and the page doesn't send tries at a shown step (stepRecorded above).
{
  const ES2 = require(path.join(ROOT, "supabase", "functions", "_shared", "exam-server.js"));
  const rows = [], events = [{ student_id: "s1", record_type: "exam_model_seen", task_id: Exam.shownId("C1-R4", 4, 2), timestamp: "2026-11-27T10:00:00.000Z" }];
  const fake = { from: (t) => { const q = { f: [], select() { return q; }, eq(c, v) { q.f.push([c, v]); return q; }, in() { return q; }, order() { return q; }, range() { return q; }, maybeSingle() { return q; },
    upsert(rs) { rows.push(...rs); q.up = rs; return q; },
    then(res) { return Promise.resolve(q.up ? { data: q.up, error: null } : { data: (t === "events" ? events : []).filter((r) => q.f.every(([c, v]) => r[c] === v)), error: null }).then(res); } }; return q; } };
  pendingChecks++;
  const later = Exam.toServerRow({ id: "x-step3-abcdef", at: "2026-11-27T10:05:00.000Z", questionId: "C1-R4", rung: 4, step: 3, attempt: 1, first: true, max: 1, points: [{ id: "step3", awarded: 1, how: "auto" }] }, "C1");
  ES2.addAttempts(fake, "s1", [later], {}).then((r) => {
    check(r.saved === 1 && r.rejected.length === 0, "a step shown on rung 4 doesn't stop the server saving the next step's attempt");
    finish();
  });
}
check(Exam.examModeOn("gcse", null) && !Exam.examModeOn("ks3", null) && !Exam.examModeOn("a-level", null) && Exam.examModeOn(null, null) &&
  Exam.examModeOn("ks3", true) && !Exam.examModeOn("gcse", false),
  "the class switch: null follows the stage (on for GCSE, off for KS3 and A-level); a teacher's true or false wins");
const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
check((css.match(/--exam:/g) || []).length === 3 && (css.match(/--on-exam:/g) || []).length === 3 && (css.match(/--exam-ink:/g) || []).length === 3,
  "styles.css: the Exam Mode accent tokens are in all three theme blocks");

// Some checks above finish later (the server's rules are async): the summary waits for every one (pendingChecks).
function finish() {
  if (--pendingChecks > 0) return;
  console.log("\n" + (checks - failures) + " of " + checks + " Exam Mode checks passed.");
  process.exit(failures ? 1 : 0);
}
finish();
