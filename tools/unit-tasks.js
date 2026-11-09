// Shared by the one-off tools/add-<unit>-unit.js scripts (Strings, Random, Lists and later units): turns a unit's
// task list into tasks.json entries and checks them, as tools/add-data-types-unit.js did for Data types and casting.
//   - Expected outputs are worked out by running each solution through harness.py.
//   - A predict task's answer is the one option equal to the real output. A predict spec may leave out "options":
//     they are then the real output plus what its buggy variants, its "wrong" programs and "wrongOutputs" give.
//   - A fill task's solution is its starter with the answers filled in, so they can't disagree.
//   - A partial-parsons task (pick the missing line): the starter has one line "____" (with its indentation) and
//     "options" lists the lines to choose from, the right one FIRST (they are shuffled, the same way each time). Its
//     solution is the starter with the right line put in. Every other option must fail at least one test, without a
//     syntax error. optionMisconceptions { index: id } makes a buggy variant from that option.
//   - A trace task: the solution is the program students trace, with one test (its inputs). "trace" is the table's
//     spec (Checker.traceTable); the table is worked out by running the program with harness.trace_code. A buggy
//     variant gets its own table's rows, so a student's first wrong row can be matched with it.
//   - Every buggy variant must print something different from the solution on at least one test (a trace task's
//     variant: give a different row somewhere in the table).
// Nothing is written unless every task is consistent.
"use strict";
const fs = require("fs");
const path = require("path");
const { runPython, ROOT } = require("./run-python.js");
const Checker = require(path.join(ROOT, "checker.js"));
const Templates = require(path.join(ROOT, "templates.js"));

const T = (inputs) => ({ inputs, expected: null }); // expected is worked out when the unit is added
const GAP = /^( *)____[ \t]*$/m;
// Misconceptions whose buggy variant may run for ever (an endless loop is how the mistake shows).
const MAY_RUN_FOREVER = ["LOOP_NO_UPDATE", "BINARY_BOUNDS_NOT_UPDATED"];
const LINE_LIMIT = 100000; // a buggy variant that runs longer counts as never ending (as templates do)

function addUnit(unit, PRACTICE, PLACEMENT) {
  const file = path.join(ROOT, "tasks.json");
  const tasks = JSON.parse(fs.readFileSync(file, "utf8"));
  if (tasks.some((t) => t.unit === unit)) { console.log("The " + unit + " unit is already in tasks.json."); return; }
  const built = buildTasks(unit, PRACTICE.concat((PLACEMENT || []).map((p) => Object.assign(p, { placement: true }))));
  fs.writeFileSync(file, JSON.stringify(tasks.concat(built), null, 2) + "\n");
  console.log("Added " + built.length + " " + unit + " tasks (" + PRACTICE.length + " practice, " + (PLACEMENT || []).length + " placement).");
}

// Builds and checks task specs (placement ones have placement: true); stops with the problems if any task is wrong.
function buildTasks(unit, all) {
  const { built, problems } = checkTasks(unit, all);
  if (problems.length) { console.log(problems.join("\n")); process.exit(1); }
  return built;
}

// A shuffle that is the same every time for the same task id.
function seededShuffle(items, id) {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const rand = Templates.mulberry32(h);
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const withLine = (starter, line) => starter.replace(GAP, (m, ind) => ind + line);

// Predict specs without options: the options are worked out first, from the programs a student might be thinking of.
function fillPredictOptions(all, problems) {
  const want = all.filter((s) => s.type === "predict" && !s.options);
  const jobs = [];
  const where = [];
  want.forEach((s, si) => {
    const codes = [s.solution].concat((s.buggy || []).map(([, code]) => code), s.wrong || []);
    codes.forEach((code, k) => { jobs.push({ code, inputs: s.tests[0].inputs, maxLines: LINE_LIMIT }); where.push([si, k]); });
  });
  const res = jobs.length ? runPython(jobs) : [];
  const outs = want.map(() => []);
  res.forEach((r, j) => { const [si, k] = where[j]; outs[si][k] = r.error ? null : Checker.normalise(r.output); });
  want.forEach((s, si) => {
    const correct = outs[si][0];
    if (correct == null) { problems.push(s.id + ": the solution raised an error"); s.options = []; return; }
    const wrong = [];
    for (const o of outs[si].slice(1).concat((s.wrongOutputs || []).map(Checker.normalise))) if (o != null && o !== correct && !wrong.includes(o)) wrong.push(o);
    if (wrong.length < 2) problems.push(s.id + ": only " + wrong.length + " different wrong options (3 or 4 options needed)");
    s.options = seededShuffle([correct].concat(wrong.slice(0, 3)), s.id);
  });
}

// Returns { built, problems }: the tasks, and what is wrong with them (nothing is written or stopped here).
function checkTasks(unit, all) {
  const problems = [];
  fillPredictOptions(all, problems);
  const built = all.map((s) => {
    const t = { id: s.id, unit, level: s.level, type: s.type, title: s.title, description: s.description,
      starter: s.starter != null ? s.starter : s.type === "write" ? "# Write your program here" : "", solution: s.solution };
    if (s.type === "fill") { let i = 0; t.solution = s.starter.replace(/____/g, () => s.answers[i++]); t.answers = s.answers; }
    if (s.type === "parsons") t.distractors = s.distractors;
    if (s.type === "predict") { t.options = s.options; t.answer = null; }
    if (s.type === "partial-parsons") {
      const gaps = (s.starter.match(/^ *____[ \t]*$/gm) || []).length;
      if (gaps !== 1 || (s.starter.match(/____/g) || []).length !== 1) problems.push(s.id + ": a partial-parsons starter needs exactly one gap line (____ on its own line), found " + gaps);
      const opts = s.options || [];
      if (opts.length < 3 || opts.length > 4) problems.push(s.id + ": partial-parsons tasks need 3 or 4 options");
      if (new Set(opts.map((o) => o.trim())).size !== opts.length) problems.push(s.id + ": the options must all be different");
      if (opts.some((o) => o.includes("\n") || o !== o.trim())) problems.push(s.id + ": each option is one line, with no indentation (the gap's indentation is used)");
      t.options = seededShuffle(opts, s.id);
      t.answer = t.options.indexOf(opts[0]);
      t.solution = withLine(s.starter, opts[0]);
      s.buggy = (s.buggy || []).concat(Object.entries(s.optionMisconceptions || {}).map(([i, id]) => [id, withLine(s.starter, opts[+i])]));
      for (const id of Object.values(s.optionMisconceptions || {})) if (!s.tags.includes(id)) s.tags = s.tags.concat([id]);
    }
    if (s.type === "trace") {
      if (s.tests.length !== 1) problems.push(s.id + ": trace tasks have exactly one test (the program's inputs)");
      t.trace_spec = s.trace || {};
    }
    t.tests = s.tests.map((x) => ({ inputs: x.inputs, expected: null }));
    t.hints = s.hints;
    t.tags = (s.placement ? ["placement"] : []).concat(s.tags);
    t.skills = s.skills;
    if (s.buggy) t.buggy_variants = s.buggy.map(([misconception, code]) => ({ misconception, code }));
    return t;
  });

  const jobs = [];
  const where = [];
  built.forEach((t, ti) => {
    t.tests.forEach((x, k) => { jobs.push({ code: t.solution, inputs: x.inputs }); where.push([ti, k, -1]); });
    (t.buggy_variants || []).forEach((v, vi) => t.tests.forEach((x, k) => { jobs.push({ code: v.code, inputs: x.inputs, maxLines: LINE_LIMIT }); where.push([ti, k, vi]); }));
    if (t.type === "trace") {
      jobs.push({ code: t.solution, inputs: t.tests[0].inputs, trace: true }); where.push([ti, 0, "trace"]);
      (t.buggy_variants || []).forEach((v, vi) => { jobs.push({ code: v.code, inputs: t.tests[0].inputs, trace: true, maxLines: 5000 }); where.push([ti, 0, "trace:" + vi]); });
    }
    // Pick the missing line: every wrong option must fail a test (it is run like a buggy variant).
    if (t.type === "partial-parsons") {
      t.options.forEach((o, oi) => { if (oi !== t.answer) t.tests.forEach((x, k) => { jobs.push({ code: withLine(t.starter, o), inputs: x.inputs, maxLines: LINE_LIMIT }); where.push([ti, k, "option:" + oi]); }); });
    }
  });
  const results = runPython(jobs);
  const variantOut = {};
  const optionOut = {};
  const traces = {};
  results.forEach((r, j) => {
    const [ti, k, vi] = where[j];
    const t = built[ti];
    if (vi === -1) {
      if (r.error) problems.push(t.id + " test " + k + ": " + JSON.stringify(r.error));
      if (r.inputsLeft) problems.push(t.id + " test " + k + ": not every input is used");
      t.tests[k].expected = Checker.normalise(r.output);
    } else if (typeof vi === "string" && vi.startsWith("option:")) {
      const key = ti + ":" + vi;
      (optionOut[key] = optionOut[key] || [])[k] = { output: Checker.normalise(r.output), kind: Checker.errorKind(r.error) };
    } else if (typeof vi === "string") {
      traces[ti + ":" + vi] = r;
    } else {
      const key = ti + ":" + vi;
      (variantOut[key] = variantOut[key] || [])[k] = { output: Checker.normalise(r.output), kind: Checker.errorKind(r.error) };
    }
  });
  built.forEach((t, ti) => {
    if (t.type === "predict") {
      const hits = t.options.map((o, i) => (o === t.tests[0].expected ? i : -1)).filter((i) => i >= 0);
      if (hits.length !== 1) problems.push(t.id + ": " + hits.length + " options equal the real output " + JSON.stringify(t.tests[0].expected));
      if (t.options.length < 3 || t.options.length > 4) problems.push(t.id + ": predict tasks need 3 or 4 options");
      t.answer = hits[0];
    }
    if (t.type === "trace") {
      const r = traces[ti + ":trace"];
      if (r.error) problems.push(t.id + ": the traced program raised " + r.error.type);
      const table = Checker.traceTable(r.steps || [], t.trace_spec);
      for (const p of Checker.traceProblems(table)) problems.push(t.id + ": " + p);
      t.trace = table;
      delete t.trace_spec;
      const own = table.rows.map((row) => Checker.traceRowText(table, row));
      (t.buggy_variants || []).forEach((v, vi) => {
        v.rows = Checker.variantTraceRows(table, traces[ti + ":trace:" + vi].steps || []);
        if (!own.some((row, k) => v.rows[k] !== row)) problems.push(t.id + ": the " + v.misconception + " variant gives the same table as the solution");
      });
    }
    if (t.type === "partial-parsons") {
      t.options.forEach((o, oi) => {
        if (oi === t.answer) return;
        const outs = optionOut[ti + ":option:" + oi];
        if (!outs.some((x, k) => x.kind || x.output !== t.tests[k].expected)) problems.push(t.id + ": wrong option " + JSON.stringify(o) + " passes every test");
        if (outs.some((x) => /SyntaxError|IndentationError/.test(x.kind))) problems.push(t.id + ": wrong option " + JSON.stringify(o) + " is a syntax error (choose a line that runs)");
        const misc = (t.buggy_variants || []).find((v) => v.code === withLine(t.starter, o));
        if (outs.some((x) => x.kind === "Timeout") && !(misc && MAY_RUN_FOREVER.includes(misc.misconception))) problems.push(t.id + ": wrong option " + JSON.stringify(o) + " runs for ever");
      });
    }
    (t.buggy_variants || []).forEach((v, vi) => {
      const outs = variantOut[ti + ":" + vi];
      if (!t.tags.includes(v.misconception)) problems.push(t.id + ": variant id " + v.misconception + " not in tags");
      if (t.type !== "trace" && !outs.some((o, k) => o.kind || o.output !== t.tests[k].expected)) problems.push(t.id + ": the " + v.misconception + " variant passes every test");
      // A syntax error can't tell one mistake from another, so it is refused, except "= in an if" (Checker.errorKind
      // names it SyntaxError:assign-in-condition), which only that mistake gives. Only some mistakes may run for ever.
      if (outs.some((o) => /SyntaxError(?!:assign-in-condition)|IndentationError/.test(o.kind) || (o.kind === "Timeout" && !MAY_RUN_FOREVER.includes(v.misconception))))
        problems.push(t.id + ": the " + v.misconception + " variant ends in " + outs.find((o) => o.kind).kind);
      if (t.type === "predict" && (outs[0].kind || !t.options.includes(outs[0].output) || outs[0].output === t.tests[0].expected))
        problems.push(t.id + ": the " + v.misconception + " variant's output " + JSON.stringify(outs[0].output) + " should be one of the wrong options");
    });
    if (t.skills.length < 1 || t.skills.length > 3) problems.push(t.id + ": 1 to 3 skills");
  });
  return { built, problems };
}

module.exports = { T, addUnit, buildTasks, checkTasks, withLine, seededShuffle, MAY_RUN_FOREVER };
