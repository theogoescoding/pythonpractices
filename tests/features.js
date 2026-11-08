// Tests for placement, the level buttons, the failure classifier, misconception matching, the teacher export
// and recheck.py. Run on their own with:  node tests/features.js   (tests/validate.js runs them too).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

// store.js saves to localStorage; in Node, use one kept in memory.
function memoryStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] || null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
  };
}

// A small CSV reader (quoted fields, "" escapes, CRLF), for reading recheck.py's output.
function parseCsv(text) {
  text = text.replace(/^\ufeff/, "");
  const rows = [];
  let row = [], field = "", i = 0, quoted = false;
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (ch === '"') { quoted = false; i++; continue; }
      field += ch; i++; continue;
    }
    if (ch === '"') { quoted = true; i++; continue; }
    if (ch === ",") { row.push(field); field = ""; i++; continue; }
    if (ch === "\r" && text[i + 1] === "\n") i++;
    if (ch === "\n" || ch === "\r") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += ch; i++;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, k) => [h, r[k] == null ? "" : r[k]])));
}

function runRecheck(exportPath, tasksPath, outPath) {
  const py = process.env.PYTHON || "python";
  const res = spawnSync(py, [path.join(ROOT, "recheck.py"), exportPath, tasksPath, "-o", outPath], {
    encoding: "utf8", timeout: 120000, env: Object.assign({}, process.env, { PYTHONIOENCODING: "utf-8" }),
  });
  return { ok: !res.error && res.status === 0, stderr: String(res.stderr || res.error || ""), rows: res.status === 0 ? parseCsv(fs.readFileSync(outPath, "utf8")) : [] };
}

function runFeatureTests({ tasks, misconceptions, runPython }) {
  Object.defineProperty(globalThis, "localStorage", { value: memoryStorage(), configurable: true, writable: true });
  const Store = require(path.join(ROOT, "store.js"));
  const App = require(path.join(ROOT, "app.js"));
  const Checker = require(path.join(ROOT, "checker.js"));
  const Curriculum = require(path.join(ROOT, "curriculum.js"));
  const TD = require(path.join(ROOT, "teacher-data.js"));
  const Templates = require(path.join(ROOT, "templates.js"));
  const Rows = require(path.join(ROOT, "backend-rows.js"));
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const out = [];
  const check = (ok, message) => { out.push({ ok: !!ok, message }); return !!ok; };
  const rng = Templates.mulberry32(7);

  // Backend mode: the class as the database would hold it (rows as sent by backend.js, through JSON, with the database's
  // +00:00 times and ids in arrival order), read back the way the teacher view reads it.
  function throughBackend(data) {
    const wire = (v) => JSON.parse(JSON.stringify(v));
    const dbTime = (r) => Object.assign(r, { timestamp: r.timestamp.replace(/Z$/, "+00:00") });
    let id = 0;
    const students = Object.entries(data.students).map(([sid, s]) => ({ id: sid, nickname: s.name, created_at: s.created }));
    const progress = Object.entries(data.progress).flatMap(([sid, p]) => Rows.progressToRows(p).map((r) => wire(Object.assign(r, { student_id: sid }))));
    const attempts = data.attempts.map((a) => dbTime(wire(Object.assign(Rows.attemptToRow(a), { id: ++id, student_id: a.studentId }))));
    const events = [
      ...data.levelLog.map((e) => Rows.levelToRow(e)), ...data.buttonLog.map(Rows.buttonToRow), ...data.placementLog.map(Rows.placementToRow),
    ].map((r, i) => dbTime(wire(Object.assign(r, { id: ++id, student_id: [...data.levelLog, ...data.buttonLog, ...data.placementLog][i].studentId }))));
    return Rows.teacherData({ students, progress, attempts, events }, data.units);
  }

  // ===================== Printing rule: commas, and casting named =====================
  {
    const plusStrPrint = /print\([^\n]*(\+\s*str\(|str\([^\n]*\)\s*\+)/;
    const code = (t) => [t.solution, t.starter || ""].concat(t.answers || []);
    const joined = tasks.filter((t) => code(t).some((c) => plusStrPrint.test(c)));
    check(!joined.length, "No task joins values with + and str() inside print(): they use commas" + (joined.length ? " (" + joined.map((t) => t.id).join(", ") + ")" : ""));
    // Where text is built with + and stored in a variable, a hint says why.
    const stored = tasks.filter((t) => /^\s*\w+\s*=\s*[^\n]*(\+\s*str\(|"\s*\+|\+\s*")/m.test(t.solution) && !t.tags.includes("placement") && t.type !== "predict");
    const noWhy = stored.filter((t) => !t.hints.some((h) => /stor|built|build/i.test(h)) && !/stor|build/i.test(t.description));
    check(stored.length >= 5 && !noWhy.length, "Every task that builds text with + and stores it says why in a hint" + (noWhy.length ? " (" + noWhy.map((t) => t.id).join(", ") + ")" : ""));
    const casts = tasks.filter((t) => /\b(int|float|bool)\(\s*input\(/.test(t.solution));
    const unnamed = casts.filter((t) => !/\bcast/i.test(t.description + " " + t.hints.join(" ")));
    check(casts.length > 200 && !unnamed.length, "Every task that converts input() with int(), float() or bool() calls it casting" + (unnamed.length ? " (" + unnamed.map((t) => t.id).join(", ") + ")" : ""));
    const asked = casts.filter((t) => t.skills.includes("int()") && t.type !== "predict" && !/\bcast/i.test(t.description));
    check(!asked.length, "Every task whose skill is int() says cast or casting in its description" + (asked.length ? " (" + asked.map((t) => t.id).join(", ") + ")" : ""));
    const commas = byId["out-L1e"];
    check(commas && commas.type === "predict" && commas.level === 1 && commas.options.includes("Score:10\nTeamRedwins") && commas.options[commas.answer] === "Score: 10\nTeam Red wins",
      "Output and sequence has a predict task showing that commas in print() put a space between values (with a no-space wrong option)");
    const cast = byId["var-L2e"];
    check(cast && cast.type === "predict" && cast.level === 2 && cast.options.includes("Joined: 45\nAdded: 45") && cast.options.includes("Joined:45\nAdded:9") &&
      cast.options[cast.answer] === "Joined: 45\nAdded: 9" && /cast/i.test(cast.description + cast.hints.join(" ")),
      "Variables and input has a predict task showing why int(input()) is needed before maths, and the comma's space");
  }

  // ===================== Fewer repeated sep=/end= tasks (Output and sequence, level 10) =====================
  {
    const swaps = { "out-L10e": "out-L10o", "out-L10k": "out-L10p", "out-L10f": "out-L10q", "out-L10h": "out-L10r" };
    const ok = Object.entries(swaps).every(([old, now]) => !byId[old] && byId[now] && byId[now].level === 10 && byId[now].type === "write" &&
      byId[now].former_ids.join() === old && byId[now].former_ids_are_replacements === true && !/\b(sep|end)\s*=/.test(byId[now].solution) && /,/.test(byId[now].solution));
    check(ok, "The four repeated sep=/end= tasks at Output level 10 are replaced by comma tasks, each listing the old id in former_ids");
    const out = tasks.filter((t) => t.unit === "output" && !t.tags.includes("placement"));
    const perLevel = Array.from({ length: 10 }, (_, i) => out.filter((t) => t.level === i + 1).length);
    check(perLevel.every((n) => n >= 3) && perLevel[9] === 14 && ["predict", "fill", "parsons", "write"].every((ty) => out.some((t) => t.type === ty)) &&
      tasks.filter((t) => t.unit === "output" && t.tags.includes("placement")).length === 8,
      "Output and sequence keeps at least 3 tasks per level (14 at level 10), every task type and all 8 placement tasks (" + perLevel.join(",") + ")");
    // A replacement is a different task: the old task's saved progress isn't moved onto it.
    const progress = { units: { output: Object.assign(App.freshUnitState(10), { log: { "out-L10e": { timesSet: 1, attempts: 1, passes: 1, fails: 0, hintsUsed: 0 } },
      passedFingerprints: { "out-L10e": "2026-11-01T10:00:00Z" } }) } };
    App.migrateProgress(progress, { tasks, templates: [], attempts: [], Templates });
    const s = progress.units.output;
    check(s.log["out-L10e"] && !s.log["out-L10o"] && !s.passedFingerprints["out-L10o"], "Saved progress on a replaced task stays on its old id, so the new task can still be set");
    const Import = require(path.join(ROOT, "backend-import.js"));
    check(!Import.renames(tasks)["out-L10e"] && Import.renames(tasks)["loops-L5a"] === "while-L5a", "Import keeps a replaced task's old id (moved tasks are still renamed)");
  }

  // ===================== Data types and casting unit =====================
  {
    const unit = Curriculum.unitById("data-types");
    const order = Curriculum.UNITS.map((u) => u.id);
    check(unit && unit.title === "Data types and casting" && order.indexOf("data-types") === order.indexOf("variables") + 1 && order.indexOf("maths") === order.indexOf("data-types") + 1 &&
      unit.skills.join() === "integer,real,boolean,string,casting,type-choice", "Data types and casting comes between Variables and Maths, with its six skills");
    const mine = tasks.filter((t) => t.unit === "data-types");
    const practice = mine.filter((t) => !t.tags.includes("placement"));
    const perLevel = Array.from({ length: 10 }, (_, i) => practice.filter((t) => t.level === i + 1).length);
    check(practice.length >= 30 && perLevel.every((n) => n >= 3) && ["predict", "fill", "parsons", "write"].every((ty) => practice.some((t) => t.type === ty)),
      "Data types: at least 30 practice tasks, 3 or more at every level, and every task type (" + perLevel.join(",") + ")");
    check([2, 5, 7, 9].every((lv) => mine.filter((t) => t.tags.includes("placement") && t.level === lv).length >= 2) &&
      mine.every((t) => /^types-[LP]\d+[a-z]$/.test(t.id) && t.skills.every((s) => unit.skills.includes(s)) && t.skills.length >= 1 && t.skills.length <= 3),
      "Data types: 2+ placement tasks at levels 2, 5, 7 and 9; ids types-L…/types-P…; 1 to 3 skills from the unit's list");
    // input() for a number must be cast. A task reads a number if its tests type digits.
    const readsNumber = (t) => /input\(/.test(t.solution) && t.tests.some((x) => x.inputs.some((v) => /^-?\d+(\.\d+)?$/.test(v)));
    const uncast = mine.filter((t) => readsNumber(t) && !/\b(int|float|bool)\(/.test(t.solution));
    check(!uncast.length, "Data types: every task that reads a number with input() casts it with int(), float() or bool()" + (uncast.length ? " (" + uncast.map((t) => t.id).join(", ") + ")" : ""));
    const plusPrint = mine.filter((t) => [t.solution, t.starter].concat(t.answers || []).some((c) => /print\([^\n]*(\+\s*str\(|str\([^\n]*\)\s*\+)/.test(c)));
    check(!plusPrint.length, "Data types: no task joins values with + and str() inside print()" + (plusPrint.length ? " (" + plusPrint.map((t) => t.id).join(", ") + ")" : ""));
    const converts = mine.filter((t) => /\b(int|float|str|bool)\(/.test(t.solution));
    const noWord = converts.filter((t) => !/casting/i.test(t.description + " " + t.hints.join(" ")));
    check(converts.length >= 25 && !noWord.length, "Data types: the word casting appears in every task that converts a value" + (noWord.length ? " (" + noWord.map((t) => t.id).join(", ") + ")" : ""));
    check(/\breal\b/i.test(mine.map((t) => t.description).join(" ")) && mine.some((t) => /real number[^.]*Python calls this type float/i.test(t.description)),
      "Data types: descriptions use the word real, and say that Python calls it float");
    // It comes before Maths, Selection and the loops, so it uses none of their ideas.
    const later = mine.filter((t) => /\bround\(|^\s*(if|elif|else|for|while)\b|\/\/|%/m.test([t.solution, t.starter].concat(t.distractors || [], t.answers || [], (t.buggy_variants || []).map((v) => v.code)).join("\n")));
    const swapped = { "types-L5c": "types-L5d", "types-L8a": "types-L8d", "types-L8b": "types-L8e", "types-L9a": "types-L9d", "types-L9b": "types-L9e", "types-L9c": "types-L9f",
      "types-L10a": "types-L10d", "types-L10b": "types-L10e", "types-L10c": "types-L10f", "types-P7a": "types-P7c", "types-P9b": "types-P9c" };
    check(!later.length && Object.entries(swapped).every(([old, now]) => !byId[old] && byId[now] && byId[now].former_ids.join() === old && byId[now].former_ids_are_replacements === true),
      "Data types uses no round(), if/else, loops, // or %; the 11 tasks that did are replaced, each listing the old id in former_ids" + (later.length ? " (" + later.map((t) => t.id).join(", ") + ")" : ""));
    for (const id of ["INT_OF_DECIMAL_STRING", "BOOL_CAST_TRAP"]) {
      const m = misconceptions.find((x) => x.id === id);
      const sentences = m ? m.explanation.split(/(?<=[.!?])\s+/).length : 0;
      const bank = tasks.filter((t) => !t.tags.includes("placement") && (t.buggy_variants || []).some((v) => v.misconception === id));
      check(m && m.name && m.description && sentences >= 2 && sentences <= 3 && bank.length >= 3,
        id + ": in misconceptions.json with a name, description and a 2-3 sentence explanation, and buggy variants on " + bank.length + " bank tasks (3 needed)");
    }
  }

  // ===================== Strings, Random and Lists units =====================
  {
    check(Curriculum.UNITS.map((u) => u.id).join() === "output,variables,data-types,maths,selection,loops-condition,loops-count,strings,random,lists,functions-basic,functions-return,file-handling,arrays-2d",
      "Unit order: Output, Variables, Data types, Maths, Selection, the two loops units, Strings, Random, Lists, the two functions units, File handling and 2D arrays");
    const NEW = {
      strings: { title: "Strings", prefix: "str", skills: "length,indexing,slicing,upper/lower,find,replace,in" },
      random: { title: "Random", prefix: "rand", skills: "import,randint,choice,simulation" },
      lists: { title: "Lists", prefix: "list", skills: "list,indexing,append,length,list-loop" },
    };
    // The word a hint must use when it names a skill (skills with no single word, such as simulation, are left out).
    const SKILL_WORDS = {
      length: /\blen\(|\blength\b/i, indexing: /\bindex(es|ing)?\b/i, slicing: /\bslic(e|es|ing)\b/i, "upper/lower": /\b(upper|lower)\(/,
      find: /\bfind\(/, replace: /\breplace\(/, import: /\bimport\b/, randint: /\brandint\(/, choice: /\bchoice\(/, append: /\bappend\(/,
      "list-loop": /\bloop\b|\bfor \w+ in\b/i,
    };
    // Other words for the same ideas, which hints must not use instead of the skill's word.
    const SYNONYMS = /\bsub-?strings?\b|\bcapitali[sz]|\b(upper|lower) ?case\b|\bposition number|\bsize of\b|\barrays?\b|\bpush\b|\bsearch(es)? for\b|\bsubscript/i;
    const NOT_IN_UNIT = {
      strings: /\.(split|join|strip|count|title|capitalize|index|startswith|endswith|isdigit|isalpha)\(/,
      random: /\brandom\.(?!randint\(|choice\(|_)\w+|\bfrom random import\b(?![^\n]*\b(randint|choice)\b)/,
      lists: /\[[^\]\n]*\bfor\b[^\]\n]*\]|\.(sort|remove|pop|insert|index|count|extend|reverse)\(|\b(sum|max|min|sorted)\(|\w\[[^\]\n]*:[^\]\n]*\]/,
    };
    const codeOf = (t) => [t.solution, t.starter || ""].concat(t.distractors || [], t.answers || [], (t.buggy_variants || []).map((v) => v.code)).join("\n");
    for (const [id, want] of Object.entries(NEW)) {
      const unit = Curriculum.unitById(id);
      const mine = tasks.filter((t) => t.unit === id);
      const practice = mine.filter((t) => !t.tags.includes("placement"));
      const perLevel = Array.from({ length: 10 }, (_, i) => practice.filter((t) => t.level === i + 1).length);
      const placement = [2, 5, 7, 9].map((lv) => mine.filter((t) => t.tags.includes("placement") && t.level === lv).length);
      check(unit && unit.title === want.title && unit.skills.join() === want.skills, want.title + ": in curriculum.js with its skills (" + want.skills + ")");
      check(perLevel.join() === "4,4,3,3,3,3,3,3,3,3" && placement.join() === "2,2,2,2" && mine.length === 40,
        want.title + ": 4 practice tasks at levels 1-2, 3 at levels 3-10, and 2 placement tasks at levels 2, 5, 7 and 9 (" + perLevel.join(",") + " | " + placement.join(",") + ")");
      const badIds = mine.filter((t) => !new RegExp("^" + want.prefix + "-[LP]\\d+[a-z]$").test(t.id) || !t.skills.every((s) => unit.skills.includes(s)));
      check(!badIds.length, want.title + ": ids " + want.prefix + "-L…/" + want.prefix + "-P…, and skills from the unit's list" + (badIds.length ? " (" + badIds.map((t) => t.id).join(", ") + ")" : ""));
      const noHint = mine.filter((t) => !t.hints.length || t.hints.some((h) => !h.trim()));
      check(!noHint.length, want.title + ": every task has hints" + (noHint.length ? " (" + noHint.map((t) => t.id).join(", ") + ")" : ""));
      const wrongWord = mine.filter((t) => t.hints.some((h) => SYNONYMS.test(h)) ||
        t.skills.some((s) => SKILL_WORDS[s] && !SKILL_WORDS[s].test(t.hints.join(" ") + " " + t.description)));
      check(!wrongWord.length, want.title + ": hints name each skill with the skill list's word (len()/length, indexing, slicing, upper(), find(), replace(), import, randint(), choice(), append(), loop), never another word for it" +
        (wrongWord.length ? " (" + wrongWord.map((t) => t.id).join(", ") + ")" : ""));
      const outside = mine.filter((t) => NOT_IN_UNIT[id].test(codeOf(t)) || /\bopen\(|\bsql\b|\bselect\s+\w+\s+from\b|^\s*def\s/im.test(codeOf(t)));
      check(!outside.length, want.title + ": only the Python this unit teaches (no file handling, SQL, functions or recursion)" + (outside.length ? " (" + outside.map((t) => t.id).join(", ") + ")" : ""));
      const notThisBuild = mine.filter((t) => /password|log ?in\b|username|valid/i.test(t.title + " " + t.description + " " + t.hints.join(" ")));
      check(!notThisBuild.length, want.title + ": no validation or authentication tasks (not in this build)" + (notThisBuild.length ? " (" + notThisBuild.map((t) => t.id).join(", ") + ")" : ""));
      const scratch = Templates && require(path.join(ROOT, "templates.json")).filter((t) => t.type === "scratch" && t.units[0] === id);
      check(scratch.length >= 1, want.title + ": has write-from-scratch templates (" + scratch.length + ")");
    }
    const randomCode = tasks.filter((t) => t.unit === "random");
    check(randomCode.every((t) => /^import random$/m.test(t.solution) && !/random\.seed/.test(codeOf(t))), "Random: every solution starts with import random, and nothing sets a seed");
    for (const id of ["INDEX_FROM_ONE", "SLICE_END_INCLUSIVE", "STRING_METHOD_NOT_SAVED", "RANDINT_STOP_EXCLUSIVE", "RANDOM_STORED_ONCE", "APPEND_ASSIGNED"]) {
      const m = misconceptions.find((x) => x.id === id);
      const sentences = m ? m.explanation.split(/(?<=[.!?])\s+/).length : 0;
      const bank = tasks.filter((t) => !t.tags.includes("placement") && (t.buggy_variants || []).some((v) => v.misconception === id));
      check(m && m.name && m.description && sentences >= 2 && sentences <= 3 && bank.length >= 3,
        id + ": in misconceptions.json with a name, description and a 2-3 sentence explanation, and buggy variants on " + bank.length + " bank tasks (3 needed)");
    }

    // Random numbers when a program is checked: the same for the same test, different for a different first input, and
    // exactly what templates.js pyRandom says (hand-written templates work out expected outputs with it).
    const prog = 'import random\nfrom random import randint, choice\nout = []\nfor i in range(20):\n    out.append(random.randint(1, 6))\n    out.append(randint(0, 99))\n    out.append(choice(["a", "b", "c"]))\n    out.append(random.choice("XYZW"))\nprint(out)';
    const sets = [[], ["Ava"], ["7", "x"], ["über"]];
    const runs = runPython(sets.map((inputs) => ({ code: prog, inputs })).concat([{ code: prog, inputs: ["Ava"] }]));
    const js = (inputs) => {
      const R = Templates.HELPERS.pyRandom(inputs);
      const out = [];
      for (let i = 0; i < 20; i++) out.push(R.randint(1, 6), R.randint(0, 99), R.choice(["a", "b", "c"]), R.choice("XYZW"));
      return Templates.HELPERS.pylist(out);
    };
    check(sets.every((inputs, k) => !runs[k].error && runs[k].output.trim() === js(inputs)), "Random: harness.py's numbers match templates.js pyRandom for the same first input");
    check(runs[1].output === runs[4].output && runs[1].output !== runs[0].output && runs[1].output !== runs[2].output,
      "Random: the same test gives the same numbers every run (so Run and Check agree); a different first input gives different ones");
    const plain = runPython([{ code: "print(1 + 1)", inputs: ["Ava"] }]);
    check(plain[0].output === "2\n" && plain[0].inputsLeft === 1, "Programs that don't use random run as before");
    // A Random predict task prints the same whatever numbers come up: run it with several different seeds.
    const predicts = tasks.filter((t) => t.unit === "random" && t.type === "predict");
    const seedRuns = runPython(predicts.flatMap((t) => ["a", "b", "c", "d", "e", "f"].map((s) => ({ code: t.solution, inputs: [s] }))));
    const unfair = predicts.filter((t, i) => new Set(seedRuns.slice(i * 6, i * 6 + 6).map((r) => r.output)).size !== 1 || seedRuns[i * 6].output.trim() !== t.options[t.answer]);
    check(predicts.length === 10 && !unfair.length, "Random: every predict task's answer is the same whatever random numbers come up" + (unfair.length ? " (" + unfair.map((t) => t.id).join(", ") + ")" : ""));
    check(/import random/.test(Checker.explainError({ type: "NameError", message: "name 'random' is not defined", line: 2 }).detail) &&
      /counts from 0/.test(Checker.explainError({ type: "IndexError", message: "string index out of range", line: 2 }).detail) &&
      /append\(\) changes the list/.test(Checker.explainError({ type: "AttributeError", message: "'NoneType' object has no attribute 'append'", line: 3 }).detail),
      "Error messages: a missing import random, an index out of range and items = items.append(...) each get their own advice");
  }

  // ===================== Functions, File handling and 2D arrays units =====================
  {
    const templatesAll = require(path.join(ROOT, "templates.json"));
    const NEW = {
      "functions-basic": { title: "Functions, no return value", prefix: "fb", skills: "def,call,parameter,argument,print-in-function" },
      "functions-return": { title: "Functions, return values", prefix: "fr", skills: "return,call,parameter,store-result" },
      "file-handling": { title: "File handling", prefix: "file", skills: "with-open,mode,write,read,lines,close" },
      "arrays-2d": { title: "2D arrays", prefix: "grid", skills: "list-of-lists,indexing,nested-loop,length" },
    };
    const SKILL_WORDS = {
      def: /\bdef\b/, call: /\bcall/i, parameter: /\bparameter/i, argument: /\bargument/i, return: /\breturn/i, "store-result": /\bstor(e|ed|es|ing)\b/i,
      "with-open": /with open/, mode: /\bmode\b/i, write: /\bwrite\(/, read: /\bread(line)?\(/, lines: /\bline/i, close: /\bclose\(/,
      "list-of-lists": /list of lists/i, indexing: /\bindex(es|ing)?\b|grid\[row\]\[col\]/i, "nested-loop": /nested loop/i, length: /\blen\(/,
    };
    const SYNONYMS = /\bprocedure\b|\bsubroutine\b|\boutput\(\)|\bmatrix\b|\btable of lists\b|\b2d list\b|\bfile pointer\b/i;
    const codeOf = (t) => [t.solution, t.starter || ""].concat(t.distractors || [], t.answers || [], (t.buggy_variants || []).map((v) => v.code)).join("\n");
    const recursive = (code) => [...code.matchAll(/^def ([a-z_]\w*)\(/gm)].some((m) => {
      const body = code.slice(m.index).split("\n").slice(1);
      const end = body.findIndex((l) => l.trim() && !/^\s/.test(l));
      return (end < 0 ? body : body.slice(0, end)).some((l) => new RegExp("\\b" + m[1] + "\\(").test(l));
    });
    for (const [id, want] of Object.entries(NEW)) {
      const unit = Curriculum.unitById(id);
      const mine = tasks.filter((t) => t.unit === id);
      const practice = mine.filter((t) => !t.tags.includes("placement"));
      const perLevel = Array.from({ length: 10 }, (_, i) => practice.filter((t) => t.level === i + 1).length);
      const placement = mine.filter((t) => t.tags.includes("placement"));
      check(unit && unit.title === want.title && unit.skills.join() === want.skills, want.title + ": in curriculum.js with its skills (" + want.skills + ")");
      check(perLevel.join() === "4,4,3,3,3,3,3,3,3,3" && [2, 5, 7, 9].map((lv) => placement.filter((t) => t.level === lv).length).join() === "2,2,2,2" && mine.length === 40,
        want.title + ": 4 practice tasks at levels 1-2, 3 at levels 3-10, and 2 placement tasks at levels 2, 5, 7 and 9 (" + perLevel.join(",") + ")");
      check(mine.every((t) => new RegExp("^" + want.prefix + "-[LP]\\d+[a-z]$").test(t.id) && t.skills.every((s) => unit.skills.includes(s)) && t.type === Curriculum.levelType(t.level, id)),
        want.title + ": ids " + want.prefix + "-L…/" + want.prefix + "-P…, skills from the unit's list, and each task's type is its level's type");
      const wrongWord = mine.filter((t) => t.hints.some((h) => SYNONYMS.test(h)) || t.skills.some((s) => SKILL_WORDS[s] && !SKILL_WORDS[s].test(t.hints.join(" ") + " " + t.description)));
      check(!wrongWord.length, want.title + ": every task has hints, and they name each skill with the skill list's word" + (wrongWord.length ? " (" + wrongWord.map((t) => t.id).join(", ") + ")" : ""));
      const outside = mine.filter((t) => { const c = codeOf(t); return /\bselect\s+[\w*]+\s+from\b|\bsql/i.test(c) || /^\s*class\s/m.test(c) || /\[[^\]\n]*\bfor\b[^\]\n]*\]/.test(c) || /^\s*(import|from)\s/m.test(c) || recursive(c); });
      check(!outside.length, want.title + ": no SQL, recursion, classes, list comprehensions or imports" + (outside.length ? " (" + outside.map((t) => t.id).join(", ") + ")" : ""));
    }
    check(!/\breturn\b/.test(tasks.filter((t) => t.unit === "functions-basic").map(codeOf).join("\n")), "Functions, no return value: no task uses return");
    const file = tasks.filter((t) => t.unit === "file-handling");
    check(file.every((t) => ["predict", "fill", "parsons"].includes(t.type)) && !Curriculum.hasScratch("file-handling") &&
      !templatesAll.some((tpl) => tpl.units.includes("file-handling") && !["predict", "fill", "parsons"].includes(tpl.type)) &&
      [8, 9, 10].map((lv) => Curriculum.levelType(lv, "file-handling")).join() === "fill,parsons,parsons",
      "File handling: only predict, Parsons and fill-in tasks and templates (levels 8-10 are fill-in and Parsons), and no write-from-scratch tasks");
    check(file.every((t) => /open\("[^"]+", "w"\)|open\("[^"]+", "a"\)/.test(t.solution) && t.solution.indexOf('"w")') < t.solution.search(/"r"\)/) &&
      !/open\([^)]*\binput\(/.test(t.solution)) && file.filter((t) => /with open\(/.test(t.solution)).length >= 35,
      "File handling: every program writes its own file before reading it, never opens a file the student names, and most use with open(...)");
    const runs = runPython([
      { code: 'with open("a.txt", "w") as f:\n    f.write("x")\nprint(open("a.txt").read())', inputs: [] },
      { code: 'print(open("a.txt").read())', inputs: [] },
      { code: 'import os\nprint(os.listdir("."))', inputs: [] },
    ]);
    check(runs[0].output === "x\n" && runs[1].error && runs[1].error.type === "FileNotFoundError" && runs[2].output === "[]\n" && !fs.existsSync(path.join(ROOT, "a.txt")),
      "harness.py runs each program in its own empty folder: a file written in one run is gone in the next, and nothing is left in the project folder");
    check(/mode "r"/.test(Checker.explainError({ type: "UnsupportedOperation", message: "not readable", line: 2 }).detail) &&
      /Write it first/.test(Checker.explainError({ type: "FileNotFoundError", message: "[Errno 2] No such file or directory: 'x.txt'", line: 1 }).detail) &&
      /closed/.test(Checker.explainError({ type: "ValueError", message: "I/O operation on closed file.", line: 4 }).detail) &&
      /str\(\)/.test(Checker.explainError({ type: "TypeError", message: "write() argument must be str, not int", line: 2 }).detail) &&
      /return/.test(Checker.explainError({ type: "TypeError", message: "unsupported operand type(s) for +: 'NoneType' and 'int'", line: 5 }).detail),
      "Error messages: a missing file, reading a file opened to write, a closed file, write() given a number, and a None from a missing return each get their own advice");
    check(Curriculum.levelName(8, "file-handling") === "Fill in two whole lines" && Curriculum.levelName(8, "lists") === "Write part of the program",
      "Level names: File handling's levels 8-10 have their own names; other units keep the ladder's");
    for (const id of ["FUNCTION_NOT_CALLED", "ARGUMENT_IN_QUOTES", "RETURN_MISSING_NONE", "PRINT_INSTEAD_OF_RETURN", "RESULT_NOT_STORED",
      "WRITE_MODE_OVERWRITES", "NEWLINE_NOT_WRITTEN", "LINE_NEWLINE_KEPT", "ROW_COL_SWAPPED", "ROWS_COLS_LEN_MIXED"]) {
      const m = misconceptions.find((x) => x.id === id);
      const sentences = m ? m.explanation.split(/(?<=[.!?])\s+/).length : 0;
      const bank = tasks.filter((t) => !t.tags.includes("placement") && (t.buggy_variants || []).some((v) => v.misconception === id));
      check(m && m.name && m.description && sentences >= 2 && sentences <= 3 && bank.length >= 3,
        id + ": in misconceptions.json with a name, description and a 2-3 sentence explanation, and buggy variants on " + bank.length + " bank tasks (3 needed)");
    }
    const none = tasks.find((t) => t.id === "fr-L2a");
    check(none && none.options[none.answer] === "None" && none.buggy_variants.some((v) => v.misconception === "RETURN_MISSING_NONE"),
      "Functions, return values: a function that forgets return prints None (fr-L2a), with the RETURN_MISSING_NONE misconception");
  }

  // ===================== Expected output box and hidden tests =====================
  {
    const TaskView = require(path.join(ROOT, "task-view.js"));
    const esc = TaskView.esc;
    const shown = tasks.filter(TaskView.showsExpectedOutput);
    const badBox = shown.filter((t) => {
      const html = TaskView.expectedBoxHtml(t);
      const out = Checker.normalise(t.tests[0].expected);
      return !html.includes("Expected output") || !(out === "" ? html.includes(esc(TaskView.NO_OUTPUT)) : html.includes(esc(out)));
    });
    check(shown.length > 300 && !badBox.length, "Every non-predict task shows an Expected output box with exactly the example test's output, as the checker compares it" +
      (badBox.length ? " (" + badBox.slice(0, 5).map((t) => t.id).join(", ") + ")" : ""));
    check(!tasks.filter((t) => t.type === "predict").some(TaskView.showsExpectedOutput), "Predict tasks show no Expected output box (it would give the answer away)");
    const empty = { type: "write", tests: [{ inputs: [], expected: "" }] };
    check(TaskView.expectedBoxHtml(empty).includes("No output – the program should not print anything."), "A task that prints nothing says: No output – the program should not print anything.");
    check(TaskView.expectedBoxHtml({ type: "write", tests: [{ inputs: [], expected: "Hi   \n\n" }] }).includes(">Hi</pre>"), "The box ignores trailing spaces and blank lines, as the checker does");
    // Hidden tests: neither their inputs nor their outputs appear (unless the example shows the same text).
    const leaks = shown.filter((t) => {
      const html = TaskView.expectedBoxHtml(t);
      const ex = t.tests[0];
      return t.tests.slice(1).some((h) => {
        const out = Checker.normalise(h.expected);
        const outLeak = out && out !== Checker.normalise(ex.expected) && (html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/g) || []).some((p) => p.includes(">" + esc(out) + "<"));
        const inLeak = h.inputs.some((v) => !ex.inputs.includes(v) && html.includes("<kbd>" + esc(v) + "</kbd>"));
        return outLeak || inLeak;
      });
    });
    check(!leaks.length, "The Expected output box never shows a hidden test's input or output" + (leaks.length ? " (" + leaks.slice(0, 5).map((t) => t.id).join(", ") + ")" : ""));
    check(TaskView.expectedBoxHtml({ type: "write", tests: [{ inputs: ["1"], expected: "a" }, { inputs: ["2"], expected: "b" }, { inputs: ["3"], expected: "c" }] }).includes("2 hidden tests"),
      "The box says how many hidden tests there are");
    const hiddenFail = { category: "WRONG_OUTPUT", details: { test: 2, inputs: ["7"], expected: "Secret", actual: "x" } };
    const hp = Checker.failureParts(hiddenFail, { exampleTests: 1 });
    const msg = hp.message + " " + hp.tryNext;
    check(/hidden test/.test(msg) && !/Secret|test 2|7/.test(msg), "A failed hidden test's message says nothing about its input or expected output");
    check(/test 1 printed/.test(Checker.failureParts({ category: "WRONG_OUTPUT", details: { test: 1 } }, { exampleTests: 1 }).message),
      "A failed example test still says what to compare");
    const appSrc = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    check(/TaskView\.isHidden\(i\)/.test(appSrc) && /failureParts\(failure, \{ exampleTests: TaskView\.EXAMPLE_TESTS \}\)/.test(appSrc),
      "The practice page hides every test after the example one in its results and messages");
  }

  // ===================== Task browser (teacher view) =====================
  {
    const TaskView = require(path.join(ROOT, "task-view.js"));
    const TaskBrowser = require(path.join(ROOT, "task-browser.js"));
    const first = (q) => (TaskView.searchTasks(tasks, q, 5)[0] || {}).id;
    check(first("var-L9d") === "var-L9d" && first("VAR-l9d") === "var-L9d", "Task browser: finds a task by its id, in any case");
    check(first("var-l9d-2") === "var-L9d" && first("d-var-L9d#12345") === "var-L9d", "Task browser: var-l9d-2 and a template variant id find the bank task");
    check(first("Trip cost") === "var-L9c" && TaskView.searchTasks(tasks, "trip", 25).some((t) => t.id === "var-L9c"), "Task browser: finds a task by words in its title");
    check(first("loops-L5a") === "while-L5a", "Task browser: an old id (former_ids) finds the task it became");
    check(TaskView.searchTasks(tasks, "", 5).length === 0 && TaskView.searchTasks(tasks, "zzzz-nothing", 5).length === 0, "Task browser: an empty or unknown search finds nothing");
    // The browser's expected output is the checker's: the reference solution passes against exactly what is shown.
    const jobs = [];
    const where = [];
    for (const t of tasks) {
      const v = TaskBrowser.viewModel(t, App.initialDraft);
      v.tests.forEach((x, i) => { jobs.push({ code: t.solution, inputs: x.inputs }); where.push([t, v, i]); });
    }
    const results = runPython(jobs);
    const mismatch = where.filter(([t, v, i], j) => !Checker.outputsMatch(results[j].output, v.tests[i].expected) || v.tests[i].expected !== Checker.normalise(t.tests[i].expected));
    check(!mismatch.length, "Task browser: every test's expected output is the checker's, and every model solution passes against it (" + jobs.length + " runs)" +
      (mismatch.length ? " – " + mismatch.slice(0, 5).map(([t]) => t.id).join(", ") : ""));
    check(tasks.every((t) => TaskBrowser.viewModel(t).expectedOutput === Checker.normalise(t.tests[0].expected)) &&
      tasks.filter(TaskView.showsExpectedOutput).every((t) => TaskBrowser.html(t, App.initialDraft).includes(TaskView.expectedBoxHtml(t))),
      "Task browser: shows the same Expected output box as the student's page");
    const w = byId["var-L9c"];
    const page = TaskBrowser.html(w, App.initialDraft);
    const solAt = page.indexOf(esc(w.solution));
    check(solAt > page.indexOf('<div id="tb-solution" hidden>') && page.indexOf('<div id="tb-solution" hidden>') > 0, "Task browser: the model solution starts hidden behind a Show button");
    // A model solution is never sent to a student's page.
    const studentPages = ["index.html", "app.html", "practice.html", "progress.html", "endless.html"].map((f) => fs.readFileSync(path.join(ROOT, f), "utf8"));
    check(studentPages.every((h) => !h.includes("task-browser.js")) && fs.readFileSync(path.join(ROOT, "teacher.html"), "utf8").includes("task-browser.js"),
      "The Task browser (with the model solutions) is loaded by the teacher view only, never by a student page");
    const appSrc = fs.readFileSync(path.join(ROOT, "app.js"), "utf8") + fs.readFileSync(path.join(ROOT, "task-view.js"), "utf8");
    check(!/TaskBrowser|model solution|tb-solution/i.test(appSrc), "The student page's code has no model-solution view");
    const solutionShown = tasks.filter((t) => t.type !== "predict" && t.solution.trim().length > 20 && TaskView.expectedBoxHtml(t).includes(esc(t.solution)));
    check(!solutionShown.length, "No student-facing box contains a task's model solution (predict tasks show their program by design)");
    function esc(s) { return TaskView.esc(s); }
  }

  // ===================== No link to the teacher view on student pages =====================
  // The student pages are app.html (the student view), practice, progress and endless. index.html is the public home
  // page, which links to the teacher sign-up and sign-in on purpose (checked in the next section).
  {
    const pages = ["app.html", "practice.html", "progress.html", "endless.html"];
    const linkRe = /href\s*=\s*["'][^"']*teacher\.html|location(\.href)?\s*=\s*["'][^"']*teacher\.html|>\s*Teacher view\s*</i;
    const scriptsOf = (html) => [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]).filter((s) => !/^https?:/.test(s));
    const offenders = [];
    for (const p of pages) {
      const html = fs.readFileSync(path.join(ROOT, p), "utf8");
      if (linkRe.test(html)) offenders.push(p);
      // A script the page loads mustn't add one either (for example a shared top bar).
      for (const s of scriptsOf(html)) {
        const src = fs.readFileSync(path.join(ROOT, s), "utf8");
        if (linkRe.test(src) || /["'][^"'\n]*teacher\.html[^"'\n]*["']/.test(src)) offenders.push(p + " → " + s);
      }
    }
    check(!offenders.length, "No student-facing page (or a script it loads) links to teacher.html" + (offenders.length ? " (" + [...new Set(offenders)].join(", ") + ")" : ""));
  }

  // ===================== Home page, student view and unit groups =====================
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const home = read("index.html");
    const hrefs = [...home.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]).filter((h) => !h.startsWith("#"));
    check(hrefs.join() === "app.html#join,app.html#signin,teacher.html#signup,teacher.html#signin" &&
      /New student[\s\S]*Returning student[\s\S]*New teacher[\s\S]*Returning teacher/.test(home.replace(/<[^>]+>/g, " ")),
      "Home page (index.html): New and Returning student open the student join and sign-in screens; New and Returning teacher open teacher sign-up and sign-in");
    check(home.includes('src="assets/logo/logo-main-light.png"') && home.includes('src="assets/logo/logo-main-dark.png"') && !/<script src="(backend|teacher-backend|app|home)\.js"/.test(home),
      "Home page: shows the main logo and has no sign-in code of its own (it only links to the existing screens)");
    check(home.includes("Climb through the units of Python programming, one rung at a time, with practice that adapts to you."), "Home page: shows the tagline");
    check(/self\.DEFAULT_THEME = "dark";<\/script>\s*<script src="store\.js">/.test(home) &&
      ["app.html", "practice.html", "progress.html", "endless.html", "teacher.html"].every((p) => !read(p).includes("DEFAULT_THEME")),
      "Home page: opens in the Dark theme unless the visitor has chosen one; the other pages keep following the system setting");
    const homeSrc = read("home.js");
    check(/"#join": "join-form", "#signin": "resume-form"/.test(homeSrc), "Student view: app.html#join opens the join form and app.html#signin the sign-in form");
    const app = read("app.html");
    check(app.includes("logo-wordmark-light.png") && app.includes("logo-wordmark-dark.png") && read("styles.css").includes(':root[data-theme="dark"] .logo-for-dark'),
      "Student view (app.html): the header shows the wordmark, with the dark version in the dark themes");
    const pages = ["index.html", "app.html", "practice.html", "progress.html", "endless.html", "teacher.html"];
    check(pages.every((p) => read(p).includes('<link rel="icon" type="image/png" href="assets/logo/icon-light.png">')), "Every page uses icon-light.png as its tab icon");
    check(["practice.html", "progress.html", "endless.html"].every((p) => !read(p).includes('href="index.html"') && read(p).includes('href="app.html"')) &&
      !/location\.replace\("index\.html"\)/.test(read("app.js") + read("progress.js") + read("endless.js")),
      "Every \"back to your units\" link and redirect goes to the student view, app.html");
    const G = Curriculum.UNIT_GROUPS;
    const grouped = G.flatMap((g) => g.units);
    check(G.map((g) => g.title).join() === "Programming fundamentals,Advanced programming,Validation,Searching and sorting" &&
      grouped.join() === Curriculum.UNITS.map((u) => u.id).join() && new Set(grouped).size === grouped.length,
      "Unit menu: four groups in order, holding every unit exactly once, in the units' own order");
    check(G[0].units.join() === "output,variables,data-types,maths,selection,loops-condition,loops-count" &&
      G[1].units.join() === "strings,random,lists,functions-basic,functions-return,file-handling,arrays-2d" &&
      G[2].comingSoon.join() === "Validation,Authentication" && G[3].comingSoon.join() === "Searching,Sorting" && !G[2].units.length && !G[3].units.length,
      "Unit menu: fundamentals and advanced units as listed; Validation and Searching and sorting show Coming soon");
    const collapseSrc = read("collapse.js");
    check(/aria-expanded/.test(collapseSrc) && /try \{[^}]*localStorage\.getItem\(key/.test(collapseSrc) && /try \{[^}]*localStorage\.setItem\(key/.test(collapseSrc) &&
      /Collapse\.buttonHtml\(/.test(homeSrc) && /Collapse\.wire\(\$\("unit-list"\), COLLAPSED_KEY\)/.test(homeSrc) && !/localStorage/.test(homeSrc) &&
      /<script src="collapse\.js"><\/script>\s*<script src="home\.js">/.test(app),
      "Unit menu: each group heading is a button that opens and closes it, remembered on this device (collapse.js; storage errors are caught)");

    // The teacher view's sections use the same component, with their own storage key, all starting expanded.
    const teacher = read("teacher.html");
    const teacherSrc = read("teacher.js");
    const sections = [...teacher.matchAll(/<section class="[^"]*teacher-section[^"]*" data-collapse="([^"]+)">\s*<h3>([^<]+)<\/h3>/g)].map((m) => m[2]);
    check(sections.join() === "Students in this class,Delete this class,Quick look,Students,Reset placement,Misconceptions,Failed attempts with no match, by task,Export",
      "Teacher view: every section (class students, delete class, quick look, students, reset placement, both workshop tables, export) is collapsible");
    const key = (teacherSrc.match(/Collapse\.enhance\(document\.querySelector\("main"\), "([^"]+)"\)/) || [])[1];
    check(key && key !== "pythonPractice.collapsedGroups" && /<script src="collapse\.js"><\/script>\s*<script src="teacher\.js">/.test(teacher) && !/localStorage\./.test(teacherSrc),
      "Teacher view: sections open and close with collapse.js, remembered under their own key (not the student view's)");
    // Run collapse.js on a tiny fake page: sections start expanded, a press collapses one and saves it, and a
    // "reload" keeps it collapsed. With storage blocked, every section still opens and closes.
    const runCollapse = (storage) => {
      const els = {};
      const mk = (tag, attrs) => {
        const el = { tagName: tag, attrs: Object.assign({}, attrs), children: [], hidden: false, className: "", dataset: {}, classList: { add() {} },
          get firstElementChild() { return this.children[0]; },
          get nextSibling() { return null; },
          getAttribute(n) { return this.attrs[n]; }, setAttribute(n, v) { this.attrs[n] = v; },
          appendChild(c) { this.children.push(c); if (c.id) els[c.id] = c; } };
        return el;
      };
      const h = mk("h3"); h.innerHTML = "Students";
      const s = mk("section"); s.dataset.collapse = "students"; s.children.push(h);
      let handler = null;
      const root = { querySelectorAll: () => [s], addEventListener: (_, f) => { handler = f; }, contains: () => true };
      const doc = { createElement: (t) => mk(t), getElementById: (id) => els[id] };
      const ctx = { localStorage: storage, document: doc };
      ctx.self = ctx;
      require("vm").runInNewContext(collapseSrc, ctx);
      ctx.Collapse.enhance(root, "k");
      const body = s.children[1];
      const press = () => {
        const open = /aria-expanded="true"/.test(h.innerHTML) ? "true" : "false";
        const b = { dataset: { group: "students" }, attrs: { "aria-expanded": open, "aria-controls": body.id },
          getAttribute(n) { return this.attrs[n]; }, setAttribute(n, v) { this.attrs[n] = v; h.innerHTML = h.innerHTML.replace(/aria-expanded="\w+"/, 'aria-expanded="' + v + '"'); } };
        handler({ target: { closest: () => b } });
      };
      return { h, body, press };
    };
    const mem = {};
    const store = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
    const first = runCollapse(store);
    const startedOpen = !first.body.hidden && /aria-expanded="true"/.test(first.h.innerHTML) && /aria-controls="section-students"/.test(first.h.innerHTML);
    first.press();
    const closed = first.body.hidden && mem.k === '["students"]';
    const reload = runCollapse(store);
    const keptClosed = reload.body.hidden && /aria-expanded="false"/.test(reload.h.innerHTML);
    reload.press();
    const reopened = !reload.body.hidden && mem.k === "[]";
    check(startedOpen && closed && keptClosed && reopened, "Collapsible sections start expanded, collapse when pressed, stay collapsed after a reload, and open again");
    const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
    const b = runCollapse(blocked);
    const blockedOpen = !b.body.hidden;
    b.press();
    check(blockedOpen && b.body.hidden, "With storage blocked, sections start expanded and still open and close");
    check(!/Haven't started a unit/.test(teacherSrc + teacher), "Teacher overview: the \"Haven't started a unit\" box is gone (the student table still shows Not started cells)");
  }

  // ===================== Class assignments =====================
  {
    const t = byId["var-L9c"];
    const rec = App.attemptRecord({ task: t, unit: "variables", phase: "assignment", assignmentId: "11111111-2222-3333-4444-555555555555", kind: "attempt",
      attemptNumber: 1, hints: 2, result: "pass", levelBefore: null, levelAfter: null });
    check(rec.assignmentId === "11111111-2222-3333-4444-555555555555" && rec.phase === "assignment", "An assignment attempt is recorded with phase assignment and its assignment id");
    const row = Rows.attemptToRow(Object.assign({ id: "a-x1", at: "2026-11-06T10:00:00.000Z", studentId: "s1" }, rec));
    check(row.assignment_id === rec.assignmentId && Rows.rowToAttempt(row, "s1").assignmentId === rec.assignmentId, "Backend mode: the assignment id goes to the attempts row and back");
    const plain = Rows.attemptToRow(Object.assign({ id: "a-x2", at: "2026-11-06T10:00:00.000Z", studentId: "s1" }, App.attemptRecord({ task: t, unit: "variables", phase: "practice", result: "pass", levelBefore: 4, levelAfter: 4 })));
    check(!("assignment_id" in plain) && !("assignmentId" in Rows.rowToAttempt(plain, "s1")),
      "Other attempts have no assignment id, and their rows are unchanged (a server without migration 0005 still accepts them)");
    // The export: the earlier columns are unchanged, and assignment_id is the one new column, at the end.
    const EARLIER = ["record_type", "record_id", "timestamp", "student_id", "student_name", "unit", "task_id", "template_id", "phase", "task_type", "task_level",
      "student_level_before", "student_level_after", "attempt_number", "result", "failure_category", "failure_details", "misconception_matches", "hints_used",
      "failed_test_number", "failed_test_inputs", "expected_output", "student_output", "student_error_type", "student_error_kind", "student_code", "button",
      "level_change_reason", "placement_start_level", "placement_results", "hint_type", "variant_fingerprint"];
    const cols = TD.FULL_COLUMNS.map(([k]) => k);
    check(JSON.stringify(cols.slice(0, EARLIER.length)) === JSON.stringify(EARLIER) && cols.length === EARLIER.length + 1 && cols[cols.length - 1] === "assignment_id",
      "Full export: every earlier column is unchanged and in place, and assignment_id is added at the end");
    const data = { students: { s1: { name: "Ava" }, s2: { name: "Ben" }, s3: { name: "Cal" } }, progress: {}, levelLog: [], buttonLog: [], placementLog: [], units: Curriculum.UNITS,
      attempts: [
        { id: "a-1", at: "2026-11-06T10:00:00Z", studentId: "s1", kind: "attempt", unit: "variables", taskId: "var-L9c", phase: "assignment", assignmentId: "A1", result: "fail", category: "WRONG_OUTPUT", misconceptions: ["INPUT_NOT_INT"] },
        { id: "a-2", at: "2026-11-06T10:01:00Z", studentId: "s1", kind: "attempt", unit: "variables", taskId: "var-L9c", phase: "assignment", assignmentId: "A1", result: "pass" },
        { id: "a-3", at: "2026-11-06T10:02:00Z", studentId: "s2", kind: "attempt", unit: "variables", taskId: "var-L9c", phase: "assignment", assignmentId: "A1", result: "fail", category: "TYPE" },
        { id: "a-4", at: "2026-11-06T10:03:00Z", studentId: "s2", kind: "hint", hintType: "show-me-how", unit: "variables", taskId: "var-L9c", phase: "assignment", assignmentId: "A1", result: "show-me-how" },
        { id: "a-5", at: "2026-11-06T10:04:00Z", studentId: "s3", kind: "attempt", unit: "maths", taskId: "maths-L4a", phase: "assignment", assignmentId: "A1", result: "pass" },
        { id: "a-6", at: "2026-11-06T10:05:00Z", studentId: "s3", kind: "attempt", unit: "maths", taskId: "maths-L4a", phase: "practice", result: "fail", category: "SYNTAX" },
      ] };
    const s = TD.assignmentStats(data, { id: "A1", task_ids: ["var-L9c", "maths-L4a", "out-L1a"] });
    const v = s.tasks[0], m = s.tasks[1], o = s.tasks[2];
    check(v.triedCount === 2 && v.passedCount === 1 && v.stuckCount === 1 && v.fails === 2 && v.showHow === 1 && m.triedCount === 1 && m.fails === 0 && o.triedCount === 0,
      "Assignment summary: per task, the students who tried and passed it, the failed checks and \"Show me how\" (other practice isn't counted)");
    check(s.struggled.length === 1 && s.struggled[0].taskId === "var-L9c" && s.students === 3, "Assignment summary: lists the tasks students struggled with most");
    const exported = TD.fullExportRows(data);
    check(exported.filter((r) => r.assignment_id === "A1").length === 5 && exported.find((r) => r.record_id === "a-6").assignment_id === "",
      "Full export: assignment rows carry their assignment id; other rows leave it empty");
    const dict = TD.dataDictionaryCsv(misconceptions);
    check(/assignment_id/.test(dict) && /value of phase,assignment/.test(dict), "data-dictionary.csv explains assignment_id and the assignment phase");
    // Importing an export: assignment rows are kept, but never rebuild a level or a passed task.
    const Import = require(path.join(ROOT, "backend-import.js"));
    const planned = { students: [{ file_id: "f1" }], events: [], attempts: [
      { file_id: "f1", record_type: "attempt", phase: "assignment", unit: "maths", task_id: "maths-L9a", task_level: 9, result: "pass", timestamp: "2026-11-06T10:00:00Z" },
      { file_id: "f1", record_type: "attempt", phase: "practice", unit: "variables", task_id: "var-L3a", task_level: 3, student_level_after: 3, result: "pass", timestamp: "2026-11-06T10:01:00Z" }] };
    const built = Import.rebuild(planned, App.freshUnitState);
    check(!built.progress.some((p) => p.unit === "maths") && !built.passed.some((p) => p.fingerprint === "maths-L9a") && built.passed.some((p) => p.fingerprint === "var-L3a"),
      "Import: assignment work doesn't rebuild a level or a passed task");
    // What a student's browser keeps for an assignment (practice only, apart from the saved progress).
    Store.saveAssignments("s9", [{ id: "A1", title: "Week 3", description: "", task_ids: ["var-L9c"] }]);
    Store.saveAssignmentWork("s9", "A1", { index: 0, tried: { "var-L9c": "passed" } });
    const progressBefore = JSON.stringify(Store.loadProgress("s9"));
    check(Store.assignments("s9")[0].title === "Week 3" && Store.loadAssignmentWork("s9", "A1").tried["var-L9c"] === "passed" &&
      JSON.stringify(Store.loadProgress("s9")) === progressBefore && Store.assignments("nobody").length === 0,
      "A student's assignments and their work on them are kept apart from their saved progress");
    const appSrc = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    check(/const eachLog = \(fn\) => \{ if \(inAssignment\) return;/.test(appSrc) && /if \(inAssignment\) \{\s*\/\/ Practice only/.test(appSrc) &&
      /save = \(\) => \(inAssignment \? Store\.saveAssignmentWork/.test(appSrc),
      "In an assignment the practice page never changes the unit's state, level, streaks, passed tasks or hint counts");
  }

  // ===================== Placement =====================
  {
    const { PLACEMENT_LEVELS, PLACEMENT_MAX_LEVEL } = App;
    check(PLACEMENT_LEVELS.join() === "2,5,7,9" && PLACEMENT_MAX_LEVEL === 8 && App.PLACEMENT_ATTEMPTS === 2,
      "Placement uses levels 2, 5, 7 and 9, up to 2 attempts each, and PLACEMENT_MAX_LEVEL = 8");
    const res = (passed) => PLACEMENT_LEVELS.map((level, i) => ({ level, passed: passed[i] }));
    check(App.placementStartLevel(res([true, true, false, false])) === 5, "Placement: passes 2 and 5 but fails 7 → starts at 5");
    check(App.placementStartLevel(res([true, true, true, true])) === 8, "Placement: passes 9 → starts at 8 (the cap)");
    check(App.placementStartLevel(res([false, false, false, false])) === 1, "Placement: fails 2 (and everything after it) → starts at 1");
    check(App.placementStartLevel(res([false, true, false, false])) === 5, "Placement: the start is the highest level passed, even after failing an earlier one");

    // The full flow on a unit's state, as the practice page runs it.
    const st = Object.assign(App.freshUnitState(), { placement: App.newPlacement() });
    check(App.needsPlacement(st), "A new unit needs placement first");
    App.startPlacement(st, tasks, "selection", rng);
    const chosen = st.placement.taskIds.map((id) => byId[id]);
    check(chosen.length === 4 && chosen.every((t, i) => t.level === PLACEMENT_LEVELS[i] && App.isPlacementTask(t) && t.unit === "selection"),
      "Placement gives one placement-tagged task at each of levels 2, 5, 7 and 9, in that order");
    [true, true, false, false].forEach((passed, i) => App.recordPlacementStep(st, { taskId: chosen[i].id, level: chosen[i].level, passed, attempts: 1, hints: 0 }));
    check(st.placement.status === "done" && st.level === 5 && st.placement.startLevel === 5, "After the last placement task the unit starts at the placement level");
    check(!App.needsPlacement(st), "Placement can't be repeated: once done, the unit goes straight to practice");
    const firstIds = st.placement.taskIds.slice();
    check(App.resetPlacement(st) && App.needsPlacement(st), "A teacher reset allows placement once more");
    App.startPlacement(st, tasks, "selection", rng);
    check(st.placement.taskIds.every((id) => !firstIds.includes(id)), "After a teacher reset, different placement tasks are given");
    st.placement.taskIds.forEach((id, i) => App.recordPlacementStep(st, { taskId: id, level: PLACEMENT_LEVELS[i], passed: true, attempts: 1, hints: 0 }));
    check(st.level === 8 && !App.needsPlacement(st), "…and after taking it again, it can't be repeated without another reset");

    // Placement tasks are never used in practice, and practice can still reach level 10.
    let leaked = 0;
    for (const u of Curriculum.UNITS) for (let lv = 1; lv <= 10; lv++) leaked += App.tasksAt(tasks, u.id, lv).filter(App.isPlacementTask).length;
    check(leaked === 0, "Placement tasks are never chosen for practice");
    const after = (s, ...outcomes) => outcomes.reduce((acc, o) => Object.assign({}, acc, App.applyOutcome(acc, o)), s);
    const top = after(Object.assign(App.freshUnitState(8)), { passed: true, hints: 0, skills: ["if"] }, { passed: true, hints: 0, skills: ["elif"] },
      { passed: true, hints: 0, skills: ["if"] }, { passed: true, hints: 0, skills: ["elif"] });
    check(top.level === 10, "The placement cap doesn't apply to practice: a student starting at 8 can reach level 10");
  }

  // ===================== "This is too easy" / "This is way too hard" =====================
  {
    const logs = { buttons: [], levels: [] };
    const stub = { logButton: (e) => logs.buttons.push(e), logLevelChange: (e) => logs.levels.push(e) };
    const press = (state, button) => App.pressLevelButton({ state, button, studentId: "s-test", unitId: "maths", taskId: "maths-L5b", store: stub });
    const s = Object.assign(App.freshUnitState(5), { passStreak: 1, strongRun: 3, failStreak: 1, ceiling: 6, ceilingTasksLeft: 2 });
    const r = press(s, "too-easy");
    check(r && s.level === 5 + App.BUTTON_JUMP_LEVELS, "\"This is too easy\" moves up BUTTON_JUMP_LEVELS");
    check(s.passStreak === 0 && s.strongRun === 0 && s.failStreak === 0, "A button resets the pass and fail streaks");
    check(logs.buttons.length === 1 && logs.buttons[0].button === "too-easy" && logs.buttons[0].from === 5 && logs.buttons[0].to === 6 &&
      logs.buttons[0].studentId === "s-test" && logs.buttons[0].unit === "maths" && logs.buttons[0].taskId === "maths-L5b",
      "A button use is logged with student, unit, task, button, level before and level after");
    check(logs.levels.length === 1 && logs.levels[0].reason === "too-easy" && logs.levels[0].from === 5 && logs.levels[0].to === 6, "A button use is logged as a level change");
    check(press(s, "too-easy") === null && s.level === 6 && logs.buttons.length === 1, "\"This is too easy\" can only be used once per unit");
    check(r.message === "Great – let's try Level 6.", "The button message is short and positive");
    const r2 = press(s, "too-hard");
    check(r2 && s.level === 6 - App.BUTTON_JUMP_LEVELS && logs.buttons.length === 2, "\"This is way too hard\" moves down BUTTON_JUMP_LEVELS");
    check(press(s, "too-hard") === null && s.level === 5, "\"This is way too hard\" can only be used once per unit");
    const other = App.freshUnitState(5);
    check(App.levelButtonAvailable(other, "too-easy") && App.levelButtonAvailable(other, "too-hard"), "The buttons are counted per unit (another unit still has both)");
    const bottom = App.freshUnitState(1);
    check(press(bottom, "too-hard") === null && bottom.level === 1 && !bottom.buttonsUsed["too-hard"], "\"This is way too hard\" never goes below level 1 (and isn't used up there)");
    // The adaptive rule carries on unchanged from the new level.
    const moved = Object.assign(App.freshUnitState(4), { passStreak: 1 });
    press(moved, "too-easy");
    const next = App.applyOutcome(moved, { passed: true, hints: 0, skills: ["if"] });
    check(next.level === 5 && next.passStreak === 1, "After a button, the normal rule starts again with fresh streaks");
  }

  // ===================== Failure classifier: one fixture per category =====================
  {
    const t1 = (expected, inputs) => [{ inputs: inputs || [], expected }];
    const fixtures = [
      { want: "SYNTAX", code: "x = 5\nif x > 3\n    print(x)", tests: t1("5"), details: (d) => d.line === 2 },
      { want: "NAME", code: "score = 5\nprint(scroe)", tests: t1("5"), details: (d) => d.name === "scroe" },
      { want: "TYPE", code: 'age = 12\nprint("Age: " + age)', tests: t1("Age: 12"), details: (d) => d.types.join() === "str,int" },
      { want: "TIMEOUT", code: "while True:\n    print('again')", tests: t1("again") },
      { want: "NO_ANSWER", code: "# I'm not sure yet\npass", tests: t1("Hello") },
      { want: "ORDER", type: "parsons", task: "out-P5a",
        code: 'print("Step 2: Boil the water")\nprint("Step 1: Fill the kettle")\nprint("Step 3: Pour into the cup")' },
      { want: "OTHER_ERROR", code: "n = int(input())\nprint(n)", tests: t1("10", ["ten"]), details: (d) => d.errorType === "ValueError" },
      { want: "WRONG_OUTPUT", code: 'print("Helo")', tests: t1("Hello"), details: (d) => d.test === 1 && d.expected === "Hello" && d.actual.trim() === "Helo" },
    ];
    fixtures.forEach((f) => { if (f.task) f.tests = byId[f.task].tests; });
    const runs = runPython(fixtures.map((f) => ({ code: f.code, inputs: f.tests[0].inputs })));
    const seen = new Set();
    fixtures.forEach((f, k) => {
      const c = Checker.classifyAttempt({ type: f.type || "write", code: f.code, results: [runs[k]], tests: f.tests,
        parsons: f.type === "parsons" ? { usedDistractor: false, missing: false } : null });
      seen.add(c.category);
      check(c.category === f.want, `Classifier: fixture for ${f.want} was classified as ${c.category}`);
      if (f.details) check(f.details(c.details), `Classifier: ${f.want} records its details (${JSON.stringify(c.details)})`);
      const msg = Checker.failureMessage(c);
      check(msg && !/Traceback|File "|Error:/.test(msg), `Classifier: the ${f.want} message is friendly, with no traceback (${msg})`);
    });
    const choice = Checker.classifyAttempt({ type: "predict", choice: 0, options: ["12", "444"], answer: 1 });
    seen.add(choice.category);
    check(choice.category === "WRONG_CHOICE" && choice.output === "12", "Classifier: a wrong predict choice is WRONG_CHOICE");
    check(Checker.classifyAttempt({ type: "write", empty: true }).category === "NO_ANSWER", "Classifier: an empty editor is NO_ANSWER");
    check(Checker.classifyAttempt({ type: "write", code: "while x:\n  pass", results: [{ output: "", error: { type: "Timeout" } }], tests: t1("1") }).category === "TIMEOUT",
      "Classifier: a run stopped by the app's time limit is TIMEOUT");
    check(Checker.failureMessage({ category: "NAME", details: { name: "scroe" } }).startsWith("Python couldn't find a name it expected"), "Classifier: the NAME message matches the brief");
    check(["SYNTAX", "NAME", "TYPE", "TIMEOUT", "NO_ANSWER", "ORDER", "WRONG_OUTPUT", "WRONG_CHOICE"].every((c) => seen.has(c)), "Classifier: every category in the brief has a fixture");
  }

  // ===================== Misconception ids =====================
  {
    const known = new Set(misconceptions.map((m) => m.id));
    const required = ["EQUALS_VS_DOUBLE_EQUALS", "SEPARATE_IF_VS_ELIF", "BOUNDARY_LT_VS_LTE", "GT_VS_GTE", "MISSING_ELSE", "INPUT_NOT_INT",
      "PRECEDENCE", "INT_DIV_VS_DIV", "STRING_PLUS_INT", "LOOP_NO_UPDATE", "LOOP_TEST_ONCE", "LOOP_ZERO_RUNS"];
    check(required.every((id) => known.has(id)), "misconceptions.json has all 12 starting misconception ids");
    const used = new Set();
    for (const t of tasks) {
      (t.tags || []).filter((g) => /^[A-Z][A-Z_]+$/.test(g)).forEach((g) => used.add(g));
      (t.buggy_variants || []).forEach((v) => used.add(v.misconception));
    }
    const missing = [...used].filter((id) => !known.has(id));
    check(missing.length === 0, "Every misconception id used in tasks exists in misconceptions.json" + (missing.length ? " (missing: " + missing.join(", ") + ")" : ""));

    // Section 1: every misconception id used in tasks.json has a plain-English explanation of 2 or 3 sentences.
    const byMis = Object.fromEntries(misconceptions.map((m) => [m.id, m]));
    const noExplanation = [...used].filter((id) => !(byMis[id] && typeof byMis[id].explanation === "string" && byMis[id].explanation.trim()));
    check(noExplanation.length === 0, "Every misconception id in tasks.json has an explanation" + (noExplanation.length ? " (missing: " + noExplanation.join(", ") + ")" : ""));
    const sentences = (s) => (s.match(/[.!?](\s|$)/g) || []).length;
    const badLength = misconceptions.filter((m) => !m.explanation || sentences(m.explanation) < 2 || sentences(m.explanation) > 3).map((m) => m.id);
    check(badLength.length === 0, "Each misconception explanation is 2 or 3 sentences" + (badLength.length ? " (" + badLength.join(", ") + ")" : ""));
    // It must not give the answer: no explanation contains a line of any task's solution.
    const solutionLines = new Set(tasks.flatMap((t) => t.solution.split("\n").map((l) => l.trim()).filter((l) => l.length > 12)));
    const leaks = misconceptions.filter((m) => [...solutionLines].some((l) => (m.explanation || "").includes(l))).map((m) => m.id);
    check(leaks.length === 0, "No misconception explanation contains a line of a task's solution" + (leaks.length ? " (" + leaks.join(", ") + ")" : ""));
  }

  // ===================== Section 1: failure messages =====================
  {
    const samples = [
      { category: "SYNTAX", details: { line: 2 } }, { category: "NAME", details: { name: "scroe", line: 2 } },
      { category: "TYPE", details: { types: ["str", "int"], line: 1 } }, { category: "TIMEOUT", details: {} },
      { category: "NO_ANSWER", details: {} }, { category: "ORDER", details: {} }, { category: "OTHER_ERROR", details: { errorType: "ValueError", line: 1 } },
      { category: "WRONG_OUTPUT", details: { test: 1 } }, { category: "WRONG_OUTPUT", details: { parsons: "used a line that isn't needed" } },
      { category: "WRONG_CHOICE", details: {} },
    ];
    for (const f of samples) {
      const lines = Checker.failureMessage(f).split("\n");
      check(lines.length === 2 && lines[1].startsWith("What to try: ") && lines[1].length > 30 && !lines[0].includes("What to try"),
        `Failure message for ${f.category}${f.details.parsons ? " (Parsons)" : ""} ends with one "What to try" line`);
    }
    check(Checker.CATEGORIES.every((c) => samples.some((f) => f.category === c)), "Every failure category has a \"What to try\" line");
    // The practice page shows input, expected output and actual output on labelled lines, and "(no output)" for nothing printed.
    const appSrc = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    check(appSrc.includes("<dt>Input</dt>") && appSrc.includes("<dt>Expected</dt>") && appSrc.includes("<dt>Your output</dt>") && appSrc.includes("(no output)"),
      "A failed test shows Input, Expected and Your output on labelled lines, with (no output) when nothing was printed");
    check(/failureHtml[\s\S]*matchMisconceptions[\s\S]*misconception[\s\S]*parts\.message/.test(appSrc),
      "A matched misconception's explanation is shown first, above the category message");
  }

  // ===================== Section 0: saved data from the current format still loads and exports the same rows =====================
  {
    const templates = JSON.parse(fs.readFileSync(path.join(ROOT, "templates.json"), "utf8"));
    const dump = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "saved-data-v1.json"), "utf8"));
    const wantRows = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "saved-data-v1-export.json"), "utf8"));
    const before = globalThis.localStorage;
    const mem = memoryStorage();
    for (const [k, v] of Object.entries(dump)) mem.setItem(k, v);
    Object.defineProperty(globalThis, "localStorage", { value: mem, configurable: true, writable: true });
    try {
      const sameRows = (rows) => wantRows.length === rows.length && wantRows.every((w) => {
        const r = rows.find((x) => x.record_type === w.record_type && x.record_id === w.record_id);
        return r && Object.keys(w).every((k) => JSON.stringify(r[k]) === JSON.stringify(w[k]));
      });
      const exportNow = () => TD.fullExportRows(TD.collect(Store, Curriculum.UNITS));
      check(sameRows(exportNow()), "Saved data from the current format exports the same rows (with the same values) as before");
      const ids = Object.keys(Store.students());
      check(ids.length === 2 && ids.every((id) => Object.keys(Store.loadProgress(id).units).length > 0), "Saved students and their progress still load");
      const ctx = (id) => ({ tasks, templates, attempts: Store.attempts(id), Templates });
      const [ava, ben] = ids.map((id) => [id, Store.loadProgress(id)]);
      const raw = JSON.stringify(ava[1]);
      check(App.migrateProgress(ava[1], ctx(ava[0])) === true, "Old progress is brought up to date when it is loaded");
      Store.saveProgress(ava[0], ava[1]);
      App.migrateProgress(ben[1], ctx(ben[0]));
      Store.saveProgress(ben[0], ben[1]);
      const again = JSON.parse(JSON.stringify(ava[1]));
      check(App.migrateProgress(again, ctx(ava[0])) === false && JSON.stringify(again) === JSON.stringify(ava[1]), "Bringing progress up to date twice changes nothing more");
      const old = JSON.parse(raw);
      const sel = ava[1].units.selection;
      const loops = ava[1].units["loops-condition"];
      check(sel.level === old.units.selection.level && sel.highest === old.units.selection.highest && sel.passedTop && sel.placement.startLevel === 2 &&
        sel.history.length === old.units.selection.history.length && sel.stats.finished === old.units.selection.stats.finished,
        "After the update, levels, placement, history and stats are unchanged");
      check(!sel.log["sel-L10d"] && sel.log["logic-L10b"].attempts === 4 && sel.log["logic-L10b"].passes === 1 && sel.current.taskId === "logic-L10b",
        "The removed duplicate sel-L10d is merged into logic-L10b (its log and the task in progress)");
      check(loops.skills["and/or"] && loops.skills["and/or"].secured && loops.skills["input-validation"] && !loops.skills["and-or"] && !loops.skills.validation,
        "Skills saved under their old names (and-or, validation) are kept under the new names");
      check(sel.passedFingerprints["logic-L10b"] && sel.passedFingerprints["if-L9a"] && !Object.keys(sel.passedFingerprints).some((k) => k.startsWith("tpl:")),
        "Bank tasks already passed are recorded as passed fingerprints");
      check(sel.failedAttempts["logic-L10b"] === 1 && ben[1].units.maths.failedAttempts["maths-L9b"] === 1, "Failed attempts per task are counted from the saved attempt log");
      check(sameRows(exportNow()), "After the update, the export still contains every row it contained before, with the same values");
      const local = TD.collect(Store, Curriculum.UNITS);
      check(TD.fullExportCsv(throughBackend(local)) === TD.fullExportCsv(local), "Backend mode: the saved class exports identically from the backend");

      // Import (backend section 8): this class's export, imported, exports the same rows again (with moved tasks renamed).
      const Imp = require(path.join(ROOT, "backend-import.js"));
      const exportCsv = TD.fullExportCsv(local);
      const parsed = Imp.parseCsv("﻿" + exportCsv);
      const planned = Imp.plan(parsed, tasks);
      const built = Imp.rebuild(planned, App.freshUnitState);
      const asRows = (list) => list.map((r, i) => Object.assign((({ file_id, ...rest }) => rest)(r), { id: i + 1, student_id: r.file_id }));
      const back = Rows.teacherData({
        students: planned.students.map((s) => ({ id: s.file_id, nickname: s.nickname, created_at: null })),
        progress: built.progress.map((p) => ({ student_id: p.file_id, unit: p.unit, state: p.state })),
        attempts: asRows(planned.attempts), events: asRows(planned.events),
      }, Curriculum.UNITS);
      const moved = Imp.renames(tasks);
      const want = TD.fullExportRows(local).map((r) => Object.assign({}, r, { task_id: moved[r.task_id] || r.task_id }));
      const got = TD.fullExportRows(back);
      const diff = want.findIndex((w, i) => JSON.stringify(w) !== JSON.stringify(got[i]));
      check(planned.students.length === 2 && got.length === want.length && diff === -1,
        "Import: an imported export gives the same rows again, with moved task ids renamed" + (diff >= 0 ? " (first difference at row " + (diff + 2) + ")" : ""));
      check(planned.renamedTasks > 0 && !got.some((r) => r.task_id === "sel-L10d") && got.some((r) => r.task_id === "logic-L10b"),
        "Import: old task ids are renamed using former_ids (sel-L10d becomes logic-L10b)");
      const avaId = ids[0];
      const rebuilt = built.progress.find((p) => p.file_id === avaId && p.unit === "selection").state;
      const have = Store.loadProgress(avaId).units.selection;
      const passedTen = local.attempts.some((a) => a.studentId === avaId && a.unit === "selection" && a.result === "pass" && a.taskLevel === 10);
      check(rebuilt.level === have.level && rebuilt.placement.status === "done" && rebuilt.placement.startLevel === have.placement.startLevel && rebuilt.passedTop === passedTen,
        "Import: the level and placement are rebuilt as they were saved, and level 10 counts as passed only if the export has a level 10 pass");
      const passedHere = new Set(built.passed.filter((p) => p.file_id === avaId && p.unit === "selection").map((p) => p.fingerprint));
      check(Object.keys(have.passedFingerprints).every((fp) => passedHere.has(fp) || !local.attempts.some((a) => a.studentId === avaId && a.result === "pass" && (moved[a.taskId] || a.taskId) === fp)) &&
        passedHere.size > 0, "Import: every task passed in the attempt log is marked as passed");
      check(Imp.parseCsv("name,age\nA,1") === null, "Import: a CSV that isn't a full export is refused");
    } finally {
      Object.defineProperty(globalThis, "localStorage", { value: before, configurable: true, writable: true });
    }
  }

  // ===================== Section 2: "Show me how" =====================
  {
    check(App.SHOW_HOW_AFTER_FAILS === 2, "SHOW_HOW_AFTER_FAILS is 2");
    const t = byId["maths-L9b"];
    const s = App.freshUnitState(5);
    App.noteFailedAttempt(s, t);
    check(!App.showHowAvailable(s, t), "\"Show me how\" isn't offered after 1 failed attempt");
    App.noteFailedAttempt(s, t);
    check(App.showHowAvailable(s, t), "\"Show me how\" is offered after the 2nd failed attempt on the same task");
    App.noteFailedAttempt(s, t);
    check(App.showHowAvailable(s, t) && !App.showHowAvailable(s, byId["maths-L9a"]), "…and after every later failure, for that task only");
    const P = { passed: true, hints: 0, skills: ["modulo"] };
    const two = (o) => [o, o].reduce((st, x) => Object.assign({}, st, App.applyOutcome(st, x)), App.freshUnitState(3));
    check(two(P).level === 4 && two(Object.assign({}, P, { showHow: true })).level === 3, "A pass after \"Show me how\" is not a strong pass, so it doesn't count towards moving up");
    const r = App.applyOutcome(App.freshUnitState(5), { passed: true, hints: 2, skills: ["modulo"], showHow: true });
    check(r.level === 5 && r.reason === "", "\"Show me how\" doesn't count towards the 3-hints move down");
    check(!App.completesTopLevel({ level: 10, passStreak: 1 }, Object.assign({}, P, { showHow: true })), "A pass after \"Show me how\" can't complete Level 10");
    const rec = App.attemptRecord({ task: t, unit: "maths", phase: "practice", kind: "hint", hintType: "show-me-how", attemptNumber: 2, hints: 0, result: "show-me-how", levelBefore: 5, levelAfter: 5 });
    check(rec.kind === "hint" && rec.hintType === "show-me-how" && rec.levelBefore === rec.levelAfter && !rec.category, "Each use of \"Show me how\" is logged in the attempt log as a hint of type show-me-how");
    const rows = TD.fullExportRows({ students: { x: { name: "X" } }, progress: {}, attempts: [Object.assign({ id: "a-1", at: "2026-11-01T10:00:00Z", studentId: "x" }, rec)], levelLog: [], buttonLog: [], placementLog: [], units: Curriculum.UNITS });
    check(rows[0].record_type === "hint" && rows[0].hint_type === "show-me-how" && rows[0].result === "show-me-how", "The export has a hint row with hint_type show-me-how");
    const dict = parseCsv(TD.dataDictionaryCsv(misconceptions));
    check(dict.some((d) => d.name === "show-me-how" && d.kind === "value of hint_type") && dict.some((d) => d.name === "hint" && d.kind === "value of record_type") &&
      dict.some((d) => d.kind === "column" && d.name === "hint_type"), "The data dictionary explains the hint record type and show-me-how");
    const stats = TD.taskStats({ attempts: [Object.assign({ studentId: "x" }, rec)] });
    check(stats.length === 0 || stats[0].attempts === 0, "A \"Show me how\" row isn't counted as an attempt in the teacher's task statistics");
  }

  // ===================== "Reset this task" =====================
  {
    const ofType = (type) => tasks.find((x) => x.type === type && (type !== "fill" || x.starter.includes("____")));
    const answered = {
      fill: (t) => ({ blanks: App.initialDraft(t).blanks.map(() => "x") }),
      parsons: (t) => { const d = App.initialDraft(t); return { available: d.available.slice(1), program: [{ id: d.available[0].id, indent: 0 }] }; },
      predict: () => ({ choice: 1 }),
      write: (t) => ({ code: (t.starter || "") + "\nprint('my answer')" }),
    };
    for (const type of Object.keys(answered)) {
      const t = ofType(type);
      const current = { taskId: t.id, started: true, hints: 1, attempts: 2, showHow: 0, finished: false, passed: false, draft: answered[type](t) };
      App.resetTaskAnswer(current, t);
      const fresh = App.initialDraft(t);
      const same = type === "parsons"
        ? current.draft.program.length === 0 && current.draft.available.map((l) => l.id).sort().join() === fresh.available.map((l) => l.id).sort().join()
        : JSON.stringify(current.draft) === JSON.stringify(fresh);
      check(same && current.hints === 1 && current.attempts === 2 && current.started && !current.finished,
        "Reset this task (" + type + "): the answer goes back to the task's starter; hints and attempts on the task are kept");
    }
    const t = byId["maths-L9b"];
    const s = App.freshUnitState(5);
    App.noteFailedAttempt(s, t);
    App.noteFailedAttempt(s, t);
    s.passStreak = 1; s.failStreak = 2; s.failsInARow = 2; s.ceiling = 7; s.passedFingerprints = { "maths-L9a": "2026-11-01T10:00:00Z" };
    s.current = { taskId: t.id, started: true, hints: 2, attempts: 2, showHow: 0, finished: false, passed: false, draft: { code: "print(1)" } };
    const rec = App.attemptRecord({ task: t, unit: "maths", phase: "practice", kind: "attempt", attemptNumber: 2, hints: 2, result: "fail", levelBefore: 5, levelAfter: 5, code: "print(1)" });
    const data = () => ({ students: { x: { name: "X" } }, progress: { x: { units: { maths: s } } }, attempts: [Object.assign({ id: "a-1", at: "2026-11-01T10:00:00Z", studentId: "x" }, rec)],
      levelLog: [], buttonLog: [], placementLog: [], units: Curriculum.UNITS });
    const before = JSON.stringify(Object.assign({}, s, { current: Object.assign({}, s.current, { draft: null }) }));
    const exportBefore = JSON.stringify(TD.fullExportRows(data()));
    App.resetTaskAnswer(s.current, t);
    check(s.current.draft.code === (t.starter || ""), "Reset this task clears the student's code");
    check(JSON.stringify(Object.assign({}, s, { current: Object.assign({}, s.current, { draft: null }) })) === before,
      "Reset this task keeps the level, streaks, ceiling, hint count and passed tasks");
    check(App.showHowAvailable(s, t) && s.failedAttempts[App.fingerprintOf(t)] === 2, "Reset this task keeps the failed-attempt count, so \"Show me how\" is still offered");
    check(JSON.stringify(TD.fullExportRows(data())) === exportBefore, "Reset this task adds no record and doesn't change the export");
  }

  // ===================== Simulated class: matching, export, recheck.py =====================
  const fillCode = (t, answers) => t.starter.split("____").reduce((acc, part, i) => acc + answers[i - 1] + part);
  const S = {};
  for (const name of ["Ava", "Ben", "Cara"]) S[name] = Store.addStudent(name);
  const scenarios = [
    { who: "Ava", task: "sel-P9a", phase: "placement", want: ["GT_VS_GTE"],
      code: 'p = int(input("Price: "))\nif p > 10:\n    print("Free programme")\nelse:\n    print("Programme: £2")\nprint("Enjoy the show")' },
    { who: "Ava", task: "sel-P9a", phase: "placement", want: ["MISSING_ELSE"],
      code: 'price = int(input("Price: "))\nif price >= 10:\n    print("Free programme")\nprint("Enjoy the show")' },
    { who: "Ava", task: "sel-P9a", phase: "placement", want: [], pass: true, code: byId["sel-P9a"].solution },
    { who: "Ben", task: "sel-P9a", phase: "placement", want: [], code: 'price = int(input("Price: "))\nprint("Enjoy the show")' },
    { who: "Ben", task: "maths-L9b", phase: "practice", want: ["INT_DIV_VS_DIV"],
      code: 'p = int(input())\nprint("Full packs:", p / 12)\nprint("Loose pencils:", p % 12)' },
    { who: "Ben", task: "maths-L9b", phase: "practice", want: [], newVariant: true,
      code: 'p = int(input())\nprint("Full packs:", p // 12)\nprint("Loose pencils:", p - 12)' },
    { who: "Cara", task: "maths-L9b", phase: "practice", want: [], newVariant: true,
      code: 'pencils = int(input("Pencils: "))\nprint("Full packs:", pencils // 12)\nprint("Loose pencils:", pencils - 12)' },
    { who: "Cara", task: "while-P9a", phase: "placement", want: ["LOOP_NO_UPDATE"],
      code: 'n = int(input())\nwhile n < 1 or n > 10:\n    print("Try again")\nprint("Thanks")' },
    { who: "Cara", task: "if-L5a", phase: "practice", want: ["EQUALS_VS_DOUBLE_EQUALS"], parsons: true,
      code: 'password = input("Password: ")\nif password = "sparx123":\n    print("Access granted")' },
    { who: "Cara", task: "var-L9d", phase: "practice", want: ["INPUT_NOT_INT"], code: 'a = input()\nprint("In 5 years you will be", a + 5)' },
    { who: "Ben", task: "if-L3a", phase: "practice", want: ["GT_VS_GTE"], code: fillCode(byId["if-L3a"], [">"]) },
    { who: "Ava", task: "out-P5a", phase: "placement", want: [], parsons: true,
      code: 'print("Step 2: Boil the water")\nprint("Step 1: Fill the kettle")\nprint("Step 3: Pour into the cup")' },
    { who: "Ava", task: "var-P2a", phase: "placement", want: ["INPUT_NOT_INT"], choice: 0 },
    { who: "Ben", task: "var-P2a", phase: "placement", want: [], choice: 3 },
    { who: "Ben", task: "var-L9b", phase: "practice", want: [], empty: true },
  ];
  const jobs = [];
  for (const sc of scenarios) {
    if (sc.choice != null || sc.empty) continue;
    sc.jobFrom = jobs.length;
    byId[sc.task].tests.forEach((test) => jobs.push({ code: sc.code, inputs: test.inputs }));
  }
  const runs = runPython(jobs);
  const records = [];
  scenarios.forEach((sc, k) => {
    const t = byId[sc.task];
    let failure = null;
    let passed = false;
    if (sc.choice != null) {
      passed = sc.choice === t.answer;
      failure = passed ? null : Checker.classifyAttempt({ type: "predict", choice: sc.choice, options: t.options, answer: t.answer });
    } else if (sc.empty) {
      failure = Checker.classifyAttempt({ type: t.type, empty: true });
    } else {
      const results = runs.slice(sc.jobFrom, sc.jobFrom + t.tests.length);
      const passes = results.map((r, i) => !r.error && Checker.outputsMatch(r.output, t.tests[i].expected));
      let parsons = null;
      if (t.type === "parsons") {
        const lines = sc.code.split("\n").map((l) => l.trim());
        parsons = { usedDistractor: t.distractors.some((d) => lines.includes(d.trim())), missing: t.solution.split("\n").some((l) => !lines.includes(l.trim())) };
      }
      passed = passes.every(Boolean) && !(parsons && (parsons.usedDistractor || parsons.missing));
      failure = passed ? null : Checker.classifyAttempt({ type: t.type, code: sc.code, results, tests: t.tests, passes, parsons });
    }
    check(passed === !!sc.pass, `Scenario ${k + 1} (${sc.task}) should ${sc.pass ? "pass" : "fail"}`);
    const rec = App.attemptRecord({ task: t, unit: t.unit, phase: sc.phase, attemptNumber: 1, hints: k % 3, result: passed ? "pass" : "fail",
      failure, code: sc.code || "", levelBefore: t.level, levelAfter: t.level });
    const saved = Store.logAttempt(S[sc.who], rec);
    records.push({ sc, saved });
    if (!passed) check(JSON.stringify(saved.misconceptions) === JSON.stringify(sc.want),
      `Matching: scenario ${k + 1} (${sc.task}) matched ${JSON.stringify(saved.misconceptions)}, expected ${JSON.stringify(sc.want)}`);
  });
  check(records.filter((r) => r.saved.result === "fail" && r.saved.misconceptions.length).length >= 5, "Matching: answers that match a buggy variant are tagged");
  check(records.some((r) => r.sc.task === "sel-P9a" && r.saved.result === "fail" && !r.saved.misconceptions.length), "Matching: an answer that matches no buggy variant is not tagged");
  check(records.find((r) => r.sc.empty).saved.misconceptions.length === 0, "Matching: NO_ANSWER attempts are never tagged");
  const failedRec = records.find((r) => r.saved.result === "fail" && r.saved.code);
  check(failedRec && failedRec.saved.code && "output" in failedRec.saved && failedRec.saved.category && failedRec.saved.failedTest && failedRec.saved.expected != null,
    "A failed attempt stores the code, its output, the category and the failing test's details");

  // A template variant made from a bank task keeps its buggy variants, so a matching mistake is tagged there too.
  const allTemplates = JSON.parse(fs.readFileSync(path.join(ROOT, "templates.json"), "utf8"));
  const derivedTpl = allTemplates.find((t) => t.id === "d-maths-L9b");
  const variant = derivedTpl && Templates.realiseSync(derivedTpl, 4242, runPython);
  let variantRecord = null;
  if (check(variant && variant.buggy_variants && variant.buggy_variants[0].misconception === "INT_DIV_VS_DIV",
    "A template variant keeps its source task's buggy variants (with their outputs worked out)")) {
    const code = variant.buggy_variants[0].code;
    const vr = runPython(variant.tests.map((x) => ({ code, inputs: x.inputs })));
    const vf = Checker.classifyAttempt({ type: "write", code, results: vr, tests: variant.tests });
    variantRecord = Store.logAttempt(S.Cara, App.attemptRecord({ task: variant, unit: "maths", phase: "practice", attemptNumber: 1, hints: 0, result: "fail",
      failure: vf, code, levelBefore: 9, levelAfter: 9 }));
    check(JSON.stringify(variantRecord.misconceptions) === JSON.stringify(["INT_DIV_VS_DIV"]) && variantRecord.fingerprint === variant.fingerprint,
      "A mistake on a template variant is matched to the same misconception, and the attempt stores the variant's fingerprint");
  }

  // Skips, level changes, button uses and placement results, through the real Store.
  Store.logAttempt(S.Cara, App.attemptRecord({ task: byId["maths-L9b"], unit: "maths", phase: "practice", kind: "skip", attemptNumber: 0, hints: 0, result: "skipped", levelBefore: 9, levelAfter: 8 }));
  Store.logLevelChange({ studentId: S.Cara, unit: "maths", from: 9, to: 8, reason: "fails", taskId: "maths-L9b" });
  Store.logLevelChange({ studentId: S.Ava, unit: "selection", from: 1, to: 5, reason: "placement" });
  const benMaths = App.freshUnitState(6);
  App.pressLevelButton({ state: benMaths, button: "too-easy", studentId: S.Ben, unitId: "maths", taskId: "maths-L6a", store: Store });
  Store.logPlacement({ studentId: S.Ava, unit: "selection", kind: "result", results: [{ level: 2, taskId: "sel-P2a", passed: true, attempts: 1, hints: 0 }], startLevel: 2 });
  Store.logPlacement({ studentId: S.Ava, unit: "selection", kind: "reset", by: "teacher" });
  const avaProgress = { units: { selection: Object.assign(App.freshUnitState(5), { placement: { status: "done", startLevel: 5 }, passedTop: true, failsInARow: 2, current: { taskId: "if-L5a" } }) } };
  Store.saveProgress(S.Ava, avaProgress);
  Store.saveProgress(S.Ben, { units: { maths: benMaths } });

  // ===================== Export =====================
  const data = TD.collect(Store, Curriculum.UNITS);
  const exportRows = TD.fullExportRows(data);
  const allAttempts = Object.values(S).flatMap((id) => Store.attempts(id));
  const idsOf = (type) => new Set(exportRows.filter((r) => r.record_type === type || (Array.isArray(type) && type.includes(r.record_type))).map((r) => r.record_id));
  const attemptIds = idsOf(["attempt", "skip"]);
  check(allAttempts.length === scenarios.length + 1 + (variantRecord ? 1 : 0) && allAttempts.every((a) => attemptIds.has(a.id)) && attemptIds.size === allAttempts.length,
    "The full export contains every attempt (and skip)");
  check(exportRows.filter((r) => r.record_type === "level_change").length === Store.levelLog().length && Store.levelLog().length === 3, "The full export contains every level change");
  const buttonIds = idsOf("button_use");
  check(Store.buttonLog().length === 1 && Store.buttonLog().every((b) => buttonIds.has(b.id)), "The full export contains every button use");
  const placementIds = idsOf(["placement_result", "placement_reset"]);
  check(Store.placementLog().length === 2 && Store.placementLog().every((p) => placementIds.has(p.id)), "The full export contains every placement result (and reset)");
  const csv = TD.fullExportCsv(data);
  const header = csv.split("\r\n")[0].split(",");
  check(["student_code", "student_output", "failure_category", "misconception_matches", "failed_test_inputs"].every((c) => header.includes(c)),
    "The full export includes the student's code, output, category, matches and failing-test inputs");
  const dict = parseCsv(TD.dataDictionaryCsv(misconceptions));
  check(header.every((c) => dict.some((d) => d.kind === "column" && d.name === c && d.meaning.length > 20)), "data-dictionary.csv explains every column of the full export");
  check(misconceptions.every((m) => dict.some((d) => d.name === m.id)) && Checker.CATEGORIES.every((c) => dict.some((d) => d.name === c)),
    "data-dictionary.csv explains every failure category and misconception id");

  // Export parity (backend section 9): the same class exported in backend mode gives the same CSV.
  {
    const back = throughBackend(data);
    check(TD.fullExportCsv(back) === csv, "Backend mode: the full export of the same class is identical to local mode's");
    check(JSON.stringify(TD.quickLook(back, misconceptions)) === JSON.stringify(TD.quickLook(data, misconceptions)) &&
      JSON.stringify(TD.overviewRows(back)) === JSON.stringify(TD.overviewRows(data)) &&
      JSON.stringify(TD.detailRows(back)) === JSON.stringify(TD.detailRows(data)),
      "Backend mode: the teacher view's overview, quick look and detail log are the same as local mode's");
    const rt = data.attempts.map((a) => Rows.rowToAttempt(JSON.parse(JSON.stringify(Rows.attemptToRow(a))), a.studentId));
    check(rt.every((a, i) => JSON.stringify(TD.fullExportRows(Object.assign({}, data, { attempts: [a], levelLog: [], buttonLog: [], placementLog: [] }))) ===
      JSON.stringify(TD.fullExportRows(Object.assign({}, data, { attempts: [data.attempts[i]], levelLog: [], buttonLog: [], placementLog: [] })))),
      "Backend mode: every attempt record exports the same after going to a row and back");
    const p = { units: { selection: { level: 3, z: 1, a: { y: 2, b: 3 } } }, endless: { units: ["selection"], current: null, last: {} } };
    check(JSON.stringify(Rows.rowsToProgress(JSON.parse(JSON.stringify(Rows.progressToRows(p))))) === JSON.stringify(p),
      "Backend mode: saved progress is stored one row per unit (and endless) and comes back unchanged");
  }

  // Teacher view sums
  const ql = TD.quickLook(data, misconceptions);
  check(ql.struggling.some((s) => s.name === "Ava" && s.unit === "selection" && s.taskId === "if-L5a"), "Quick look lists students with 2+ fails in a row and their current task");
  check(ql.notStarted.some((s) => s.name === "Cara" && s.units.length === Curriculum.UNITS.length), "Quick look lists students who haven't started a unit");
  check(ql.topFailedTasks[0] && ql.topFailedTasks[0].taskId === "maths-L9b" && ql.topFailedTasks[0].topCategory === "WRONG_OUTPUT" && ql.topFailedTasks[0].topMisconception === "INT_DIV_VS_DIV",
    "Quick look's most-failed tasks give the failure rate, most common category and top misconception");
  const overview = TD.overviewRows(data);
  const ava = overview.find((r) => r.name === "Ava").cells.selection;
  const ben = overview.find((r) => r.name === "Ben").cells.maths;
  check(ava.complete && ava.alert && ava.placementStart === 5 && ben.tooEasy && !ben.tooHard, "Overview cells show level 10 passed, placement, button flags and 2+ fails in a row");
  const detail = TD.detailRows(data);
  check(TD.filterDetail(detail, { misconception: "GT_VS_GTE" }).length === 2 && TD.filterDetail(detail, { category: "NO_ANSWER" }).length === 1 &&
    TD.filterDetail(detail, { student: S.Ben, unit: "maths" }).length === 3, "The detail log filters by student, unit, category and misconception");
  const ws = TD.workshop(data, misconceptions, byId);
  const l9b = ws.tasks.find((t) => t.taskId === "maths-L9b");
  check(l9b && l9b.fails === 3 && l9b.unmatched === 2 && Math.abs(l9b.unmatchedRate - 2 / 3) < 1e-9 && l9b.unmatchedAttempts.every((r) => r.code && "output" in r),
    "The workshop page counts unmatched failed attempts per task, with their code and output");

  // ===================== recheck.py =====================
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "py-practice-"));
  try {
    const exportPath = path.join(tmp, "full-data.csv");
    fs.writeFileSync(exportPath, "\ufeff" + csv);
    const tasksPath = path.join(ROOT, "tasks.json");
    const same = runRecheck(exportPath, tasksPath, path.join(tmp, "same.csv"));
    if (check(same.ok, "recheck.py runs on an exported full-data CSV" + (same.ok ? "" : ": " + same.stderr))) {
      const failedRows = same.rows.filter((r) => r.record_type === "attempt" && r.result === "fail");
      const appMatches = Object.fromEntries(allAttempts.map((a) => [a.id, (a.misconceptions || []).join(";")]));
      check(failedRows.length === allAttempts.filter((a) => a.result === "fail").length, "recheck.py rechecks every failed attempt");
      check(failedRows.every((r) => r.misconception_matches === appMatches[r.record_id] && r.matches_changed === "no"),
        "recheck.py on an unchanged export gives the same matches as the app recorded");
      check(same.rows.length === exportRows.length, "recheck.py keeps every row of the export");
      const vRow = variantRecord && same.rows.find((r) => r.record_id === variantRecord.id);
      check(vRow && vRow.misconception_matches === "INT_DIV_VS_DIV" && vRow.matches_changed === "no",
        "recheck.py makes a template variant again from its template and seed, and gives the same match as the app");
    }

    // A teacher adds a new buggy variant (no stored outputs yet): only the attempts it applies to change.
    const modified = JSON.parse(JSON.stringify(tasks));
    modified.find((t) => t.id === "maths-L9b").buggy_variants.push({
      misconception: "MODULO_AS_SUBTRACTION",
      code: 'pencils = int(input("Pencils: "))\nprint("Full packs:", pencils // 12)\nprint("Loose pencils:", pencils - 12)',
    });
    const modPath = path.join(tmp, "tasks-with-new-variant.json");
    fs.writeFileSync(modPath, JSON.stringify(modified));
    const after = runRecheck(exportPath, modPath, path.join(tmp, "new.csv"));
    if (check(after.ok, "recheck.py runs with a newly added buggy variant" + (after.ok ? "" : ": " + after.stderr))) {
      const expectChanged = new Set(records.filter((r) => r.sc.newVariant).map((r) => r.saved.id));
      const changed = after.rows.filter((r) => r.matches_changed === "yes");
      check(changed.length === expectChanged.size && changed.every((r) => expectChanged.has(r.record_id) && r.misconception_matches.split(";").includes("MODULO_AS_SUBTRACTION")),
        "A new buggy variant changes the matches only for the attempts it applies to");
      const ben = after.rows.find((r) => r.record_id === records[4].saved.id);
      check(ben && ben.misconception_matches === "INT_DIV_VS_DIV" && ben.matches_changed === "no", "Other attempts on the same task keep their matches");
    }

    // An export from before while-P9a moved out of Selection names it by its old id, sel-P9b (its former_ids).
    const movedTask = tasks.find((t) => t.id === "while-P9a");
    check(movedTask && (movedTask.former_ids || []).includes("sel-P9b"), "Moved tasks keep their old id in former_ids");
    const oldPath = path.join(tmp, "old-ids.csv");
    fs.writeFileSync(oldPath, "﻿" + csv.split("while-P9a").join("sel-P9b"));
    const old = runRecheck(oldPath, tasksPath, path.join(tmp, "old.csv"));
    if (check(old.ok, "recheck.py runs on an export with old task ids" + (old.ok ? "" : ": " + old.stderr))) {
      const cara = old.rows.find((r) => r.task_id === "sel-P9b" && r.record_type === "attempt");
      check(cara && cara.misconception_matches === "LOOP_NO_UPDATE" && cara.matches_changed === "no",
        "recheck.py finds a moved task by its old id, so older exports keep their matches");
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return out;
}

if (require.main === module) {
  const { runPython } = require(path.join(ROOT, "tools", "run-python.js"));
  const tasks = JSON.parse(fs.readFileSync(path.join(ROOT, "tasks.json"), "utf8"));
  const misconceptions = JSON.parse(fs.readFileSync(path.join(ROOT, "misconceptions.json"), "utf8"));
  const results = runFeatureTests({ tasks, misconceptions, runPython });
  const failed = results.filter((r) => !r.ok);
  results.forEach((r) => console.log((r.ok ? "  ok   " : "  FAIL ") + r.message));
  console.log(`\n${results.length - failed.length} of ${results.length} feature checks passed.`);
  process.exit(failed.length ? 1 : 0);
}

module.exports = { runFeatureTests, parseCsv };
