// Turns a task template (templates.json) into a concrete task with random values.
// Shared by practice.html (practice, endless mode and from-scratch tasks) and tests/validate.js.
//
// A template has the same fields as a task in tasks.json, plus:
//   units      ["maths"] or ["variables", "maths"] – the units whose levels the task counts towards
//   source     the bank task it was made from, or the closest one (its worked example is used for "Show me how")
//   params     values drawn once per variant: { name: {"int": [lo, hi]} | {"choice": [...]} | {"sample": [[...], k]} }
//   values     derived values, as JS expressions over the params: { total: "price * qty" }
//   where      optional JS expression; variants where it is false are thrown away
//   test, testParams, testValues, testWhere, testCases, testCount
//              one test template with its own random inputs, drawn testCount times
//              (testCases lists fixed cases first, e.g. boundaries, as expressions)
//              an input can be {"list": "expression"} for several inputs at once, e.g. {"list": "prices.concat([0])"}
//   tests      or a fixed list of test templates
//   shuffleOptions  (predict) shuffle the options, so the right answer isn't always in the same place
// Text fields can contain {{expression}} placeholders, e.g. "Total: £{{price * qty}}".
// The same template and seed always give the same variant.
//
// "Derived" templates ("derived": true) are made from one bank task by tools/derive-templates.js. Their expected
// outputs are not written as expressions: the variant's reference solution is run (realise / realiseSync), and
//   - each test's expected output is what the solution prints
//   - [[out:k]] in a text field is test k's expected output, [[out:k:j]] its line j (for "for example" blocks)
//   - predict options are the solution's output plus wrong outputs from the task's buggy variants and from
//     common-mistake changes to the program (MUTATIONS), shuffled; "optionCount" says how many
//   - buggy_variants keep their misconception and are run on every test, so attempts can be matched
// A variant is thrown away (and the next draw tried) if the solution fails, a buggy variant passes every test,
// a Parsons distractor equals a solution line, or a predict task can't get enough different wrong options.
//
// Every variant has a fingerprint: the template id plus its parameter values. A passed fingerprint is never served again.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./checker.js"));
  else root.Templates = factory(root.Checker);
})(typeof self !== "undefined" ? self : this, function (Checker) {

  const MAX_TRIES = 200;
  const MAX_DERIVED_TRIES = 12;   // draws a derived template may take (each one runs Python)
  const MAX_LINES = 100000;       // lines a template program may run before it counts as never ending (harness.run_code_limited)

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Helpers that template expressions can use, so expected outputs match what Python prints.
  const HELPERS = {
    // Python's round(): halves go to the even number.
    pyround(x, n) {
      n = n || 0;
      const f = Math.pow(10, n);
      const y = x * f;
      if (Math.abs(y % 1) === 0.5) { const down = Math.floor(y); return (down % 2 === 0 ? down : down + 1) / f; }
      return n ? Number(x.toFixed(n)) : Math.round(y);
    },
    // How Python prints a float: 7.0, 3.5, 3.3333333333333335
    fl(x) { return Number.isInteger(x) ? x.toFixed(1) : String(x); },
    // Python's // and % for whole numbers (both round towards minus infinity)
    idiv(a, b) { return Math.floor(a / b); },
    mod(a, b) { return ((a % b) + b) % b; },
    // A number with a fixed number of decimal places, as written in Python code ("2.50" → 2.5 keeps "2.5")
    dp(x, n) { return Number(x.toFixed(n)); },
    // A word with a capital first letter ("red" → "Red"), for a swapped word at the start of a sentence
    cap(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); },
    Math,
  };

  function evaluate(expr, scope) {
    // eslint-disable-next-line no-new-func
    return new Function("scope", "with (scope) { return (" + expr + "); }")(scope);
  }

  function makeScope(...parts) {
    return Object.assign(Object.create(HELPERS), ...parts);
  }

  function fillText(text, scope) {
    if (text == null) return text;
    return String(text).replace(/\{\{([\s\S]+?)\}\}/g, (m, expr) => String(evaluate(expr, scope)));
  }

  function draw(spec, rand) {
    if (spec.int) return spec.int[0] + Math.floor(rand() * (spec.int[1] - spec.int[0] + 1));
    if (spec.choice) return spec.choice[Math.floor(rand() * spec.choice.length)];
    if (spec.sample) {
      const pool = spec.sample[0].slice();
      const out = [];
      while (out.length < spec.sample[1] && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
      return out;
    }
    throw new Error("Unknown parameter spec " + JSON.stringify(spec));
  }

  // Draws every parameter (fixed values in `fixed` are evaluated instead), then works out `values`.
  function drawVars(params, values, rand, outer, fixed) {
    const vars = {};
    for (const [name, spec] of Object.entries(params || {})) {
      vars[name] = fixed && name in fixed
        ? (typeof fixed[name] === "string" ? evaluate(fixed[name], makeScope(outer, vars)) : fixed[name])
        : draw(spec, rand);
    }
    for (const [name, expr] of Object.entries(values || {})) vars[name] = evaluate(expr, makeScope(outer, vars));
    return vars;
  }

  // The variant's identity: template id plus the drawn parameter values (not the values worked out from them).
  // A derived template lists the values that define a variant in "fingerprintVars" (its numbers and words), so two
  // draws that give the same task have the same fingerprint.
  function fingerprint(tpl, vars) {
    const params = (tpl.fingerprintVars || Object.keys(tpl.params || {})).slice().sort().map((k) => [k, vars[k]]);
    return tpl.id + "|" + JSON.stringify(params);
  }

  // Test inputs: each is a text with placeholders, or {"list": expression} for several inputs at once
  // (e.g. a loop that reads a different number of values in each test).
  function fillInputs(inputs, scope) {
    return (inputs || []).flatMap((v) => (v && typeof v === "object" && "list" in v ? evaluate(v.list, scope).map(String) : [fillText(v, scope)]));
  }

  function buildTests(tpl, vars, rand) {
    const scope = makeScope(vars);
    if (!tpl.test) {
      return (tpl.tests || []).map((t) => ({ inputs: fillInputs(t.inputs, scope), expected: fillText(t.expected, scope) }));
    }
    const cases = (tpl.testCases || []).slice();
    const count = Math.max(tpl.testCount || 4, cases.length);
    const tests = [];
    const seen = new Set();
    for (let k = 0; tests.length < count && k < count * 20; k++) {
      const fixed = cases.shift();
      const tv = drawVars(tpl.testParams, tpl.testValues, rand, vars, fixed);
      const ts = makeScope(vars, tv);
      if (!fixed && tpl.testWhere && !evaluate(tpl.testWhere, ts)) continue;
      const test = { inputs: fillInputs(tpl.test.inputs, ts), expected: fillText(tpl.test.expected, ts) };
      const key = JSON.stringify(test.inputs);
      if (seen.has(key)) continue;
      seen.add(key);
      tests.push(test);
    }
    return tests;
  }

  // The fields every variant shares.
  function baseTask(tpl, vars, seed) {
    const f = (s) => fillText(s, makeScope(vars));
    const task = {
      id: tpl.id + "#" + seed,
      templateId: tpl.id,
      seed,
      fingerprint: fingerprint(tpl, vars),
      generated: true,
      unit: tpl.units[0],
      units: tpl.units.slice(),
      level: tpl.level,
      type: tpl.type,
      title: f(tpl.title),
      description: f(tpl.description),
      starter: f(tpl.starter || ""),
      hints: (tpl.hints || []).map(f),
      tags: (tpl.tags || []).slice(),
      skills: (tpl.skills || []).slice(),
    };
    if (tpl.source) task.source = tpl.source;
    if (tpl.type === "fill") {
      task.answers = tpl.answers.map(f);
      task.solution = task.starter.split("____").reduce((acc, part, i) => acc + task.answers[i - 1] + part);
    } else {
      task.solution = f(tpl.solution);
    }
    if (tpl.type === "parsons") task.distractors = tpl.distractors.map(f);
    return task;
  }

  function shuffleInPlace(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function build(tpl, vars, rand, seed) {
    const scope = makeScope(vars);
    const f = (s) => fillText(s, scope);
    const task = baseTask(tpl, vars, seed);
    if (tpl.type === "predict") {
      task.options = tpl.options.map(f);
      task.answer = typeof tpl.answer === "string" ? evaluate(tpl.answer, scope) : tpl.answer;
      if (new Set(task.options).size !== task.options.length) return null; // two options came out the same
      if (tpl.shuffleOptions) {
        const correct = task.options[task.answer];
        shuffleInPlace(task.options, rand);
        task.answer = task.options.indexOf(correct);
      }
      task.tests = [{ inputs: fillInputs(tpl.inputs, scope), expected: task.options[task.answer] }];
    } else {
      task.tests = buildTests(tpl, vars, rand);
      if (!task.tests.length) return null;
      // Values drawn for the tests (testParams) are parameters too.
      if (tpl.test) task.fingerprint += "|" + JSON.stringify(task.tests.map((t) => t.inputs));
    }
    return task;
  }

  // The task for a template and a seed (a whole number). Throws if the template can't make a valid variant.
  // For a derived template use realise / realiseSync instead (its expected outputs come from running the code).
  function expand(tpl, seed) {
    if (tpl.derived) throw new Error("Template " + tpl.id + " is derived: use realise()");
    const rand = mulberry32(seed);
    for (let k = 0; k < MAX_TRIES; k++) {
      const vars = drawVars(tpl.params, tpl.values, rand, {});
      if (tpl.where && !evaluate(tpl.where, makeScope(vars))) continue;
      const task = build(tpl, vars, rand, seed);
      if (task) return task;
    }
    throw new Error("Template " + tpl.id + " couldn't make a valid variant from seed " + seed);
  }

  // ---------- Common-mistake changes to a program (wrong predict options for derived templates) ----------
  // Each rule changes one place in the code (outside strings and comments). Each gives a program a student
  // with that misconception might believe they are reading.
  const MUTATIONS = [
    { re: /\/\//g, to: () => "/" },                                         // INT_DIV_VS_DIV
    { re: /(?<!\/)\/(?![/=])/g, to: () => "//" },
    { re: /%/g, to: () => "//" },
    { re: /\*\*/g, to: () => "*" },
    { re: />=/g, to: () => ">" },                                            // GT_VS_GTE
    { re: /(?<![<>=!-])>(?!=)/g, to: () => ">=" },
    { re: /<=/g, to: () => "<" },                                            // BOUNDARY_LT_VS_LTE
    { re: /(?<![<>=!])<(?!=)/g, to: () => "<=" },
    { re: /\belif\b/g, to: () => "if" },                                     // SEPARATE_IF_VS_ELIF
    { re: /\brange\(([^(),]+),\s*([^(),]+)\)/g, to: (m, a, b) => "range(" + a + ", " + b + " + 1)" }, // RANGE_STOP_EXCLUSIVE
    { re: /\brange\(([^(),]+)\)/g, to: (m, a) => "range(1, " + a + " + 1)" }, // RANGE_START_DEFAULT
    { re: /\bint\((input\([^()]*\))\)/g, to: (m, a) => a },                  // INPUT_NOT_INT
    { re: /(?<![\w)\]])\(([^()]*[+\-][^()]*)\)/g, to: (m, a) => a },         // PRECEDENCE: brackets left out
    { re: /\bprint\(([^()"',]*[+\-*/%][^()"',]*)\)/g, to: (m, a) => "print(\"" + a + "\")" }, // printing the sum itself
    { re: /(?<![\w.])(\d+)\s*(?:\*\*|[+\-*])\s*(\d+)(?![\w.])/g, to: (m, a, b) => "int(\"" + a + b + "\")" }, // numbers joined as text
    { re: /(?<![*])\*(?![*])/g, to: () => "+" },                             // * read as +
    { re: /\*\*/g, to: () => "+" },
    { re: /,\s*(?:end|sep)\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, to: () => "" }, // forgetting sep= / end=
    { re: /\band\b/g, to: () => "or" },
    { re: /\bor\b/g, to: () => "and" },
    { re: /\bnot\s+/g, to: () => "" },
    { re: /^(\s*)(if|elif) (.+):[ \t]*$/gm, to: (m, ind, kw, cond) => ind + kw + " not (" + cond + "):" }, // reads the condition the wrong way
    { re: /^(\s*)else:[ \t]*$/gm, to: (m, ind) => ind + "if True:" },        // thinks the else branch always runs too
    { re: /^(\s*\w+ = )([01])[ \t]*$/gm, to: (m, a, n) => a + (n === "0" ? "1" : "0") }, // counter starts one off
    { re: /\bprint\(([A-Za-z_]\w*)\)/g, to: (m, a) => "print(\"" + a + "\")" }, // prints the name, not the value
    { re: /(,\s*)([a-z_]\w*)(\s*[,)])/g, to: (m, a, b, c) => a + "\"" + b + "\"" + c },
    { re: /("(?:[^"\\\n]|\\.)*")\s*,\s*([a-z_]\w*)\s*\)/g, to: (m, a, b) => a + " + str(" + b + "))", anyPos: true }, // thinks a comma joins with no space
  ];
  // Whole-program misreadings: every branch runs, or none does.
  const BRANCH_MUTATIONS = [
    (code) => code.replace(/^(\s*)(?:if|elif) .+:[ \t]*$/gm, "$1if True:").replace(/^(\s*)else:[ \t]*$/gm, "$1if True:"),
    (code) => code.replace(/^(\s*)(?:if|elif) .+:[ \t]*$/gm, "$1if False:").replace(/^(\s*)else:[ \t]*$/gm, "$1if False:"),
  ];
  const MAX_PLACES_PER_RULE = 3;

  // Positions inside strings and comments, which mutations leave alone.
  function maskedRanges(code) {
    const ranges = [];
    const re = /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|#[^\n]*)/g;
    let m;
    while ((m = re.exec(code))) ranges.push([m.index, m.index + m[0].length]);
    return ranges;
  }

  // Programs that differ from `code` by one common mistake (each different from the original and from each other).
  function mutate(code) {
    const masked = maskedRanges(code);
    const inMask = (i) => masked.some(([a, b]) => i >= a && i < b);
    const out = [];
    const add = (c) => { if (c !== code && !out.includes(c)) out.push(c); };
    for (const rule of MUTATIONS) {
      const re = new RegExp(rule.re.source, rule.re.flags);
      let m, n = 0;
      while ((m = re.exec(code)) && n < MAX_PLACES_PER_RULE) {
        if (!rule.anyPos && inMask(m.index)) continue;
        n++;
        add(code.slice(0, m.index) + rule.to(...m) + code.slice(m.index + m[0].length));
      }
    }
    if (/^\s*(if|elif|else)\b/m.test(code)) BRANCH_MUTATIONS.forEach((f) => add(f(code)));
    const lines = code.split("\n");
    const ind = (l) => /^ */.exec(l)[0];
    // The first line after an if/else/loop block, thought to be part of the block.
    for (let i = 1; i < lines.length; i++) {
      if (ind(lines[i]).length < ind(lines[i - 1]).length && /^\s*print\(/.test(lines[i])) {
        const moved = lines.slice();
        moved[i] = ind(lines[i - 1]) + lines[i].trim();
        add(moved.join("\n"));
        break;
      }
    }
    // Missing that a print line runs (each of the first few print lines left out).
    let dropped = 0;
    for (let i = 0; i < lines.length && dropped < MAX_PLACES_PER_RULE; i++) {
      if (!/^\s*print\(/.test(lines[i])) continue;
      const without = lines.slice(0, i).concat(lines.slice(i + 1));
      if (i > 0 && /:\s*$/.test(lines[i - 1]) && ind(lines[i + 1] || "").length <= ind(lines[i - 1]).length) continue; // would leave an empty block
      add(without.join("\n"));
      dropped++;
    }
    // Two print lines next to each other, the wrong way round (the order of statements).
    for (let i = 0; i + 1 < lines.length; i++) {
      if (/^\s*print\(/.test(lines[i]) && /^\s*print\(/.test(lines[i + 1]) && ind(lines[i]) === ind(lines[i + 1]) && lines[i] !== lines[i + 1]) {
        const swapped = lines.slice();
        [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
        add(swapped.join("\n"));
        break;
      }
    }
    return out;
  }

  // ---------- Derived templates: build, run, then complete ----------
  const errorKind = (err) => Checker.errorKind(err);
  const stored = (r) => { const k = errorKind(r.error); return { output: k === "Timeout" ? "" : Checker.normalise(r.output), errorKind: k }; };

  // The variant before anything has run, and the programs to run: { task, jobs, parts }.
  function draftDerived(tpl, vars, seed) {
    const scope = makeScope(vars);
    const task = baseTask(tpl, vars, seed);
    const tests = (tpl.tests || []).map((t) => ({ inputs: fillInputs(t.inputs, scope) }));
    const jobs = [];
    const parts = { solution: [], variants: [], mutants: [] };
    const add = (code, inputs) => { jobs.push({ code, inputs, maxLines: MAX_LINES }); return jobs.length - 1; };
    tests.forEach((t) => parts.solution.push(add(task.solution, t.inputs)));
    const variants = (tpl.buggy_variants || []).map((v) => ({ misconception: v.misconception, code: fillText(v.code, scope) }));
    variants.forEach((v) => parts.variants.push(tests.map((t) => add(v.code, t.inputs))));
    let mutants = [];
    if (tpl.type === "predict") {
      mutants = variants.map((v) => v.code).concat(mutate(task.solution)).filter((c, i, a) => a.indexOf(c) === i);
      mutants.forEach((c) => parts.mutants.push(add(c, tests[0].inputs)));
    }
    task.tests = tests;
    if (variants.length) task.buggy_variants = variants;
    return { task, jobs, parts };
  }

  function fillOutputs(text, tests) {
    return String(text).replace(/\[\[out:(\d+)(?::(\d+))?\]\]/g, (m, k, j) => {
      const out = tests[+k] ? tests[+k].expected : "";
      return j == null ? out : (out.split("\n")[+j] || "");
    });
  }

  // Fills in the results; returns the finished task, or null if this draw isn't a valid variant.
  function completeDerived(tpl, draft, results, rand) {
    const { task, parts } = draft;
    const sol = parts.solution.map((i) => results[i]);
    if (sol.some((r) => !r || r.error || r.inputsLeft > 0)) return null;
    task.tests.forEach((t, k) => { t.expected = Checker.normalise(sol[k].output); });
    for (const [vi, idxs] of parts.variants.entries()) {
      const v = task.buggy_variants[vi];
      v.outputs = idxs.map((i) => stored(results[i]));
      const differs = v.outputs.some((o, k) => o.errorKind || o.output !== task.tests[k].expected);
      if (!differs) return null; // the mistake wouldn't show with these values
      if (v.outputs.some((o) => o.errorKind === "SyntaxError" || o.errorKind === "IndentationError")) return null;
      if (v.outputs.some((o) => o.errorKind === "Timeout") && v.misconception !== "LOOP_NO_UPDATE") return null;
    }
    if (task.type === "parsons") {
      const lines = task.solution.split("\n").map((l) => l.trim());
      if (task.distractors.some((d) => lines.includes(d.trim()))) return null;
      if (new Set(task.distractors.map((d) => d.trim())).size !== task.distractors.length) return null;
    }
    if (task.type === "predict") {
      const correct = task.tests[0].expected;
      const wrong = [];
      for (const i of parts.mutants) {
        const r = results[i];
        if (r.error || r.inputsLeft > 0) continue;
        const o = Checker.normalise(r.output);
        if (o !== correct && !wrong.includes(o)) wrong.push(o);
      }
      // As many options as the source task (3 or 4) where there are enough different wrong outputs, and never fewer than 3.
      const n = Math.min(tpl.optionCount || 4, wrong.length + 1);
      if (n < 3) return null;
      task.options = shuffleInPlace([correct].concat(wrong.slice(0, n - 1)), rand);
      task.answer = task.options.indexOf(correct);
      // A buggy variant here only matches if its output is one of the options shown.
      if (task.buggy_variants) {
        task.buggy_variants = task.buggy_variants.filter((v) => task.options.includes(v.outputs[0].output) && !v.outputs[0].errorKind);
        if (!task.buggy_variants.length) delete task.buggy_variants;
      }
    }
    task.description = fillOutputs(task.description, task.tests);
    task.hints = task.hints.map((h) => fillOutputs(h, task.tests));
    return task;
  }

  // Steps of making a variant: yields the jobs to run, receives their results, returns the task (or null).
  function* realiseSteps(tpl, seed) {
    if (!tpl.derived) return expand(tpl, seed);
    const rand = mulberry32(Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ (seed >>> 13)); // consecutive seeds give unrelated draws
    let runs = 0;
    for (let k = 0; k < MAX_TRIES && runs < MAX_DERIVED_TRIES; k++) {
      const vars = drawVars(tpl.params, tpl.values, rand, {});
      if (tpl.where && !evaluate(tpl.where, makeScope(vars))) continue;
      runs++;
      const draft = draftDerived(tpl, vars, seed);
      const results = yield draft.jobs;
      const task = completeDerived(tpl, draft, results, rand);
      if (task) return task;
    }
    return null;
  }

  // run(jobs) → results, as tools/run-python.js runPython (Node) does.
  function realiseSync(tpl, seed, run) {
    const steps = realiseSteps(tpl, seed);
    let s = steps.next();
    while (!s.done) s = steps.next(run(s.value));
    return s.value;
  }

  // run(jobs) → Promise of results (the browser runs them in the Pyodide worker).
  async function realise(tpl, seed, run) {
    const steps = realiseSteps(tpl, seed);
    let s = steps.next();
    while (!s.done) s = steps.next(await run(s.value));
    return s.value;
  }

  // Many variants at once (tests and tools): requests = [[tpl, seed], …]. Every round's programs go to one run(jobs)
  // call, so Python is started a few times rather than once per variant. Returns one task (or null) per request.
  function realiseMany(requests, run) {
    const out = new Array(requests.length).fill(null);
    // A template that throws gives { error } instead of a task.
    const advance = (a, v) => { try { a.step = a.steps.next(v); } catch (e) { a.step = { done: true, value: { error: e.message } }; } };
    let active = requests.map(([tpl, seed], i) => ({ i, steps: realiseSteps(tpl, seed), step: null }));
    active.forEach((a) => advance(a));
    while (active.length) {
      active = active.filter((a) => { if (a.step.done) { out[a.i] = a.step.value; return false; } return true; });
      if (!active.length) break;
      const jobs = [];
      const spans = active.map((a) => { const from = jobs.length; jobs.push(...a.step.value); return [from, jobs.length]; });
      const results = run(jobs);
      active.forEach((a, k) => advance(a, results.slice(spans[k][0], spans[k][1])));
    }
    return out;
  }

  // The fingerprint a template and seed would give, without running anything (null for a derived template,
  // whose draw can be thrown away after running).
  function fingerprintOf(tpl, seed) {
    if (tpl.derived) return null;
    return expand(tpl, seed).fingerprint;
  }

  // What makes two variants different (used to avoid the same variant twice in a row).
  const signature = (task) => JSON.stringify([task.templateId, task.description, task.starter, task.solution, task.tests, task.options || null]);

  const randomSeed = (rand) => Math.floor((rand || Math.random)() * 2147483647) + 1;

  return { expand, realise, realiseSync, realiseMany, fingerprint, fingerprintOf, mutate, signature, randomSeed, fillText, HELPERS, mulberry32, MAX_LINES };
});
