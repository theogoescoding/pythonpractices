// Turns a task template (templates.json) into a concrete task with random values.
// Shared by practice.html (endless mode and from-scratch tasks) and tests/validate.js.
//
// A template has the same fields as a task in tasks.json, plus:
//   units      ["maths"] or ["variables", "maths"] – the units whose levels the task counts towards
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

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Templates = factory();
})(typeof self !== "undefined" ? self : this, function () {

  const MAX_TRIES = 200;

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

  function build(tpl, vars, rand, seed) {
    const scope = makeScope(vars);
    const f = (s) => fillText(s, scope);
    const task = {
      id: tpl.id + "#" + seed,
      templateId: tpl.id,
      seed,
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
    if (tpl.type === "fill") {
      task.answers = tpl.answers.map(f);
      task.solution = task.starter.split("____").reduce((acc, part, i) => acc + task.answers[i - 1] + part);
    } else {
      task.solution = f(tpl.solution);
    }
    if (tpl.type === "parsons") task.distractors = tpl.distractors.map(f);
    if (tpl.type === "predict") {
      task.options = tpl.options.map(f);
      task.answer = typeof tpl.answer === "string" ? evaluate(tpl.answer, scope) : tpl.answer;
      if (new Set(task.options).size !== task.options.length) return null; // two options came out the same
      if (tpl.shuffleOptions) {
        const correct = task.options[task.answer];
        for (let i = task.options.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [task.options[i], task.options[j]] = [task.options[j], task.options[i]];
        }
        task.answer = task.options.indexOf(correct);
      }
      task.tests = [{ inputs: fillInputs(tpl.inputs, scope), expected: task.options[task.answer] }];
    } else {
      task.tests = buildTests(tpl, vars, rand);
      if (!task.tests.length) return null;
    }
    return task;
  }

  // The task for a template and a seed (a whole number). Throws if the template can't make a valid variant.
  function expand(tpl, seed) {
    const rand = mulberry32(seed);
    for (let k = 0; k < MAX_TRIES; k++) {
      const vars = drawVars(tpl.params, tpl.values, rand, {});
      if (tpl.where && !evaluate(tpl.where, makeScope(vars))) continue;
      const task = build(tpl, vars, rand, seed);
      if (task) return task;
    }
    throw new Error("Template " + tpl.id + " couldn't make a valid variant from seed " + seed);
  }

  // What makes two variants different (used to avoid the same variant twice in a row).
  const signature = (task) => JSON.stringify([task.templateId, task.description, task.starter, task.solution, task.tests, task.options || null]);

  const randomSeed = (rand) => Math.floor((rand || Math.random)() * 2147483647) + 1;

  return { expand, signature, randomSeed, fillText, HELPERS, mulberry32 };
});
