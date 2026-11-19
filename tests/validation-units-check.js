// For tests/features.js (run in a child process, because chooseNextTask is async): the five Validation units'
// template variants and a simulated climb up each unit's ladder. Prints one JSON object.
//
// 1. Variants. Each derived template's parameter draws are listed (enumerated, or sampled if there are very many) and
//    the distinct ones counted, after its "where" rule. A template with at most MAX_EXACT draws then makes every one
//    (its parameters pinned to that draw) and counts the valid variants that look different to a student; a bigger
//    one is counted from its draws (far above what a level needs).
// 2. The climb, with the app's own functions (chooseNextTask, applyOutcome, recordTaskResult), for each unit:
//      pass-all:  a student who passes every task from level 1 (STEPS tasks)
//      fail-at-7: a student placed at level 7 who fails every level 7 task and passes elsewhere (STEPS tasks)
//    Template variants come from the variants made in step 1 (and POOL seeds of each bigger template), so nothing is run
//    during the climb. It records whether a task ever couldn't be made, and any two tasks in a row with the same id
//    (fingerprint) or the same right answer.
// Usage: node tests/validation-units-check.js                          the five Validation units
//        node tests/validation-units-check.js --units debugging-gcse   other units (2026-11: Debugging (GCSE))
"use strict";
const path = require("path");
const ROOT = path.join(__dirname, "..");
const App = require(path.join(ROOT, "app.js"));
const T = require(path.join(ROOT, "templates.js"));
const { runPython } = require(path.join(ROOT, "tools", "run-python.js"));
const tasks = require(path.join(ROOT, "tasks.json"));
const templates = require(path.join(ROOT, "templates.json"));
const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));

const UNITS = process.argv.includes("--units") ? process.argv[process.argv.indexOf("--units") + 1].split(",")
  : ["validation-presence", "validation-type", "validation-range", "validation-format", "validation-length"];
const MAX_EXACT = 150; // draws up to which every variant is made and checked
const POOL = 60;       // seeds made for each bigger template (for the climb)
const STEPS = 60;      // tasks in each simulated climb

// A template's distinct draws: [{ vals: { param: value }, key }].
function draws(tpl) {
  const ev = (expr, vars) => new Function("scope", "with (scope) { return (" + expr + "); }")(Object.assign(Object.create(T.HELPERS), vars));
  const names = Object.keys(tpl.params || {});
  const options = names.map((n) => { const s = tpl.params[n]; return s.int ? Array.from({ length: s.int[1] - s.int[0] + 1 }, (_, i) => s.int[0] + i) : s.choice; });
  const total = options.reduce((n, o) => n * o.length, 1);
  const keys = (tpl.fingerprintVars || names).slice().sort();
  const out = new Map();
  const visit = (vals) => {
    const vars = {};
    names.forEach((n, i) => { vars[n] = vals[i]; });
    for (const [k, expr] of Object.entries(tpl.values || {})) vars[k] = ev(expr, vars);
    if (tpl.where && !ev(tpl.where, vars)) return;
    const key = JSON.stringify(keys.map((k) => vars[k]));
    if (!out.has(key)) out.set(key, { vals: Object.fromEntries(names.map((n, i) => [n, vals[i]])), key });
  };
  if (total <= 20000) {
    const idx = names.map(() => 0);
    for (let n = 0; n < total; n++) {
      visit(idx.map((i, k) => options[k][i]));
      for (let k = 0; k < idx.length; k++) { if (++idx[k] < options[k].length) break; idx[k] = 0; }
    }
  } else {
    const rand = T.mulberry32(12345);
    for (let n = 0; n < 6000; n++) visit(options.map((o) => o[Math.floor(rand() * o.length)]));
  }
  return [...out.values()];
}

const pinned = (tpl, vals) => Object.assign(JSON.parse(JSON.stringify(tpl)), {
  params: Object.fromEntries(Object.entries(tpl.params).map(([n, s]) => [n, s.int ? { int: [vals[n], vals[n]] } : { choice: [vals[n]] }])),
});
const answerOf = (t) => (t.type === "predict" ? t.options[t.answer] : JSON.stringify(t.tests.map((x) => x.expected)));

(async () => {
  const started = Date.now();
  const mine = templates.filter((t) => t.derived && UNITS.includes(t.units[0]));
  const info = {};
  const requests = [];
  for (const tpl of mine) {
    const d = draws(tpl);
    info[tpl.id] = { id: tpl.id, unit: tpl.units[0], level: tpl.level, type: tpl.type, source: tpl.source, draws: d.length, exact: d.length <= MAX_EXACT, valid: 0,
      sameTests: 0, shared: 0, sigs: new Set(), answers: new Set(), pool: [] };
    if (d.length <= MAX_EXACT) d.forEach((x) => requests.push([pinned(tpl, x.vals), 1, tpl.id]));
    else for (let s = 1; s <= POOL; s++) requests.push([tpl, s, tpl.id]);
  }
  const made = T.realiseMany(requests.map(([t, s]) => [t, s]), runPython);
  made.forEach((v, i) => {
    const r = info[requests[i][2]];
    if (!v || v.error) return;
    const sig = T.signature(v);
    if (r.sigs.has(sig)) return;
    r.sigs.add(sig);
    if (r.exact) r.valid++;
    if (v.type === "predict") r.answers.add(v.options[v.answer]);
    // Both sides of the check: a non-predict variant's two tests give different results.
    else if (v.tests.length !== 2 || v.tests[0].expected === v.tests[1].expected) r.sameTests++;
    // Its worked example (the source task's) shares no 4+ character text with it, as tests/validate.js checks for tasks.
    const we = byId[r.source].worked_example;
    if ((we.code.match(/"([^"\\\n]{4,})"|'([^'\\\n]{4,})'/g) || []).map((s) => s.slice(1, -1)).some((s) => (v.description + "\n" + v.solution).includes(s))) r.shared++;
    r.pool.push(Object.assign(v, { seed: 1000 + r.pool.length })); // a seed of its own, so a failed variant can come back
  });

  // The climb. realise() hands out the variants made above: the one with that seed, or one chosen by the seed.
  const realise = async (tpl, seed) => {
    const pool = (info[tpl.id] || { pool: [] }).pool;
    if (!pool.length) return null;
    return pool.find((v) => v.seed === seed) || pool[seed % pool.length];
  };
  async function climb(unit, failAt7) {
    let r = 7;
    const rand = () => ((r = (r * 48271) % 2147483647) / 2147483647);
    const start = failAt7 ? 7 : 1;
    const s = Object.assign(App.freshUnitState(start), { placement: { status: "done", startLevel: start } });
    let last = {}, prev = null;
    const out = { unit, kind: failAt7 ? "fail-at-7" : "pass-all", steps: 0, top: start, ranOut: 0, sameId: 0, sameAnswer: 0, variants: 0, levels: [] };
    for (let k = 0; k < STEPS; k++) {
      const t = await App.chooseNextTask({ tasks, templates, unitId: unit, state: s, last, rand, realise, Templates: T });
      if (!t) { out.ranOut++; break; }
      out.steps++;
      const fp = App.fingerprintOf(t), ans = answerOf(t);
      if (prev && prev.fp === fp) out.sameId++;
      if (prev && prev.ans === ans) out.sameAnswer++;
      if (t.generated) out.variants++;
      const passed = !(failAt7 && s.level === 7);
      out.levels.push(s.level + (passed ? "" : "x"));
      const res = App.applyOutcome(s, { passed, hints: 0, skills: t.skills, showHow: false });
      const { change, reason, ...fields } = res;
      Object.assign(s, fields);
      s.log[t.generated ? "tpl:" + t.templateId : t.id] = { passes: passed ? 1 : 0, fails: passed ? 0 : 1 };
      App.recordTaskResult(s, t, passed, "2026-11-15T10:00:00Z");
      out.top = Math.max(out.top, s.level);
      last = { key: fp, templateId: t.generated ? t.templateId : null, signature: t.generated ? T.signature(t) : null };
      prev = { fp, ans };
    }
    return out;
  }
  const sims = [];
  for (const u of UNITS) { sims.push(await climb(u, false)); sims.push(await climb(u, true)); }
  const list = Object.values(info).map(({ sigs, answers, pool, ...rest }) => Object.assign(rest, { different: rest.exact ? rest.valid : rest.draws, poolSize: pool.length, answers: answers.size }));
  console.log(JSON.stringify({ templates: list, sims, made: requests.length, seconds: Math.round((Date.now() - started) / 1000) }));
})();
