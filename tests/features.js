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
    check(Curriculum.UNITS.map((u) => u.id).join() === "output,variables,data-types,maths,selection,loops-condition,loops-count,strings,random,lists,functions-basic,functions-return,file-handling,arrays-2d,validation,validation-presence,validation-type,validation-range,validation-format,validation-length,authentication,debugging-gcse,trace-tables,linear-search,binary-search,bubble-sort,insertion-sort,merge-sort,recursion,scope-parameters,oop-classes,oop-methods,oop-encapsulation,oop-inheritance,debugging,records-tuples,stacks-queues,linked-lists,hash-tables,arrays-3d",
      "Unit order: Output, Variables, Data types, Maths, Selection, the two loops units, Strings, Random, Lists, the two functions units, File handling, 2D arrays, Validation, the five Validation units (Presence, Type, Range, Format and Length checks), Authentication, Debugging (GCSE), Trace tables, Linear search, Binary search, Bubble sort, Insertion sort, Merge sort, then the seven A-level programming techniques units and the five A-level data structures units");
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

  // ===================== Validation and Authentication units =====================
  {
    const templatesAll = require(path.join(ROOT, "templates.json"));
    const codeOf = (t) => [t.solution, t.starter || ""].concat(t.distractors || [], t.answers || [], (t.buggy_variants || []).map((v) => v.code)).join("\n");
    const LADDER = "predict,predict,fill,fill,parsons,parsons,write,write,write,write";
    const OUT_OF_SCOPE = /\btry\s*:|\bexcept\b|\.isalpha\(|\.startswith\(|\bimport\b|\bre\.\w+\(|\bhash(lib)?\b|\bopen\(|\{[^{}\n]*:[^{}\n]*\}|\bdict\(/;
    const NEW = {
      validation: { title: "Validation", prefix: "val", perLevel: "5,5,5,5,5,5,5,5,5,5", total: 58,
        skills: "presence,length,range,format,type-check,re-ask,validation-function" },
      authentication: { title: "Authentication", prefix: "auth", perLevel: "3,3,3,3,3,3,3,3,3,3", total: 38,
        skills: "match,known-users,both-match,which-wrong,attempts,login-loop,presence,validation-function" },
    };
    for (const [id, want] of Object.entries(NEW)) {
      const unit = Curriculum.unitById(id);
      const mine = tasks.filter((t) => t.unit === id);
      const practice = mine.filter((t) => !t.tags.includes("placement"));
      const placement = mine.filter((t) => t.tags.includes("placement"));
      const perLevel = Array.from({ length: 10 }, (_, i) => practice.filter((t) => t.level === i + 1).length);
      check(unit && unit.title === want.title && unit.skills.join() === want.skills, want.title + ": in curriculum.js with its skills (" + want.skills + ")");
      check(Array.from({ length: 10 }, (_, i) => Curriculum.levelType(i + 1, id)).join() === LADDER && Curriculum.hasScratch(id),
        want.title + ": levels 1-2 predict, 3-4 fill in the blanks, 5-6 Parsons, 7-8 write a short check, 9-10 write a full program");
      check(perLevel.join() === want.perLevel && [2, 5, 7, 9].map((lv) => placement.filter((t) => t.level === lv).length).join() === "2,2,2,2" && mine.length === want.total,
        want.title + ": " + want.perLevel.split(",")[0] + " practice tasks at each level, and 2 placement tasks at levels 2, 5, 7 and 9 (" + perLevel.join(",") + ")");
      check(mine.every((t) => new RegExp("^" + want.prefix + "-[LP]\\d+[a-z]$").test(t.id) && t.skills.every((s) => unit.skills.includes(s)) && t.type === Curriculum.levelType(t.level, id)),
        want.title + ": ids " + want.prefix + "-L…/" + want.prefix + "-P…, skills from the unit's list, and each task's type is its level's type");
      const outside = mine.filter((t) => OUT_OF_SCOPE.test(codeOf(t)));
      check(!outside.length, want.title + ": no try/except, .isalpha(), .startswith(), regular expressions, hashing, files, imports or dictionaries" + (outside.length ? " (" + outside.map((t) => t.id).join(", ") + ")" : ""));
      const tests = practice.filter((t) => t.type !== "predict" && (t.tests.length < 1 || t.tests.length > 2));
      check(!tests.length && practice.filter((t) => t.type === "predict").every((t) => t.tests.length === 1),
        want.title + ": 1-2 test cases per task (predict tasks have one)" + (tests.length ? " (" + tests.map((t) => t.id).join(", ") + ")" : ""));
      // A task's example is its first skill's, and every skill in the unit's list is some task's first skill.
      check(practice.every((t) => t.worked_example && t.worked_example.skill === t.skills[0]) && unit.skills.every((s) => practice.some((t) => t.worked_example.skill === s)),
        want.title + ": every practice task has a \"Show me how\" example for its first skill, and every skill in the unit's list has one (" + unit.skills.join(", ") + ")");
      check(templatesAll.filter((tpl) => tpl.type === "scratch" && tpl.units[0] === id).length >= 3 && practice.every((t) => templatesAll.some((tpl) => tpl.derived && tpl.source === t.id)),
        want.title + ": has write-from-scratch templates, and every practice task has a derived template");
    }
    // Validation: each level has one task for each kind of check, and the id's last letter says which.
    const CAT = { i: "presence", l: "length", r: "range", f: "format", t: "type-check" };
    const val = tasks.filter((t) => t.unit === "validation" && !t.tags.includes("placement"));
    const byCat = Object.values(CAT).map((c) => val.filter((t) => t.skills.filter((s) => Object.values(CAT).includes(s))[0] === c).length);
    check(Array.from({ length: 10 }, (_, i) => val.filter((t) => t.level === i + 1).map((t) => t.id.slice(-1)).sort().join("")).every((s) => s === "filrt") &&
      val.every((t) => t.skills.filter((s) => Object.values(CAT).includes(s))[0] === CAT[t.id.slice(-1)]) && byCat.join() === "10,10,10,10,10",
      "Validation: every level has one presence, length, range, format and type task, 10 of each (" + byCat.join(",") + ")");
    // The kind of check is the first skill, except where the loop (level 8) or the function (level 10) comes first.
    check(val.every((t) => t.skills[0] === CAT[t.id.slice(-1)] || (t.level === 8 && t.skills[0] === "re-ask") || (t.level === 10 && t.skills[0] === "validation-function")) &&
      val.filter((t) => t.level === 10).every((t) => t.skills[0] === "validation-function") && val.some((t) => t.level === 8 && t.skills[0] === "re-ask"),
      "Validation: \"Show me how\" shows the re-ask loop on level 8 tasks that ask again, and the validation function on level 10");
    // A task's tests test its own check: where there are two, one answer passes the check and one fails it.
    const twoOutcomes = val.filter((t) => t.tests.length === 2).filter((t) => t.tests[0].expected === t.tests[1].expected);
    check(!twoOutcomes.length, "Validation: a task with two tests gives two different results (one answer passes the check, one fails it)" + (twoOutcomes.length ? " (" + twoOutcomes.map((t) => t.id).join(", ") + ")" : ""));
    check(val.filter((t) => t.level >= 9).some((t) => /^def /m.test(t.solution)) && val.filter((t) => t.level === 10).every((t) => /^def \w+\(/m.test(t.solution) && /return True/.test(t.solution) && /return False/.test(t.solution)) &&
      val.some((t) => /\bwhile\b/.test(t.solution)) && val.some((t) => /\.isdigit\(\)/.test(t.solution)) && val.some((t) => /\.strip\(\)/.test(t.solution)),
      "Validation: uses .strip(), .isdigit() and while, and every level 10 task has a function that returns True or False");
    // Authentication: three tasks per level on the same step, everything stored in the program.
    const auth = tasks.filter((t) => t.unit === "authentication");
    const STEP = ["match", "match", "known-users", "both-match", "both-match", "attempts", "which-wrong", "login-loop", "presence", "validation-function"];
    check(auth.filter((t) => !t.tags.includes("placement")).every((t) => t.skills[0] === STEP[t.level - 1]),
      "Authentication: the three tasks at each level practise the same step (==, in, and, the login message, failed attempts, which part was wrong, three tries, a presence check, a login function)");
    check(auth.every((t) => !/\bhash|sha\d|md5|bcrypt/i.test(codeOf(t))) && auth.filter((t) => t.level === 10 && !t.tags.includes("placement")).every((t) => /^def check_login\(/m.test(t.solution) && /\bwhile\b/.test(t.solution) && /attempts = attempts \+ 1/.test(t.solution)),
      "Authentication: no hashing, and every level 10 task has a login function returning True or False, a while loop and an attempts counter");
    const NEW_M = ["AND_OR_CONFUSED", "REASK_CONDITION_UNCHANGED", "ISDIGIT_NEGATIVE", "IN_NOT_EQUALS", "EMPTY_AFTER_CAST",
      "USERNAME_CASE_MISMATCH", "ATTEMPTS_NOT_COUNTED"];
    for (const mid of NEW_M) {
      const m = misconceptions.find((x) => x.id === mid);
      const sentences = m ? m.explanation.split(/(?<=[.!?])\s+/).length : 0;
      const bank = tasks.filter((t) => !t.tags.includes("placement") && ["validation", "authentication"].includes(t.unit) && (t.buggy_variants || []).some((v) => v.misconception === mid));
      check(m && m.name && m.description && sentences === 3 && bank.length >= 3,
        mid + ": in misconceptions.json with a teacher description and a 3-sentence explanation, and buggy variants on " + bank.length + " tasks (3 needed)");
    }
    check(tasks.some((t) => t.unit === "validation" && (t.buggy_variants || []).some((v) => v.misconception === "INPUT_NOT_INT")), "Validation: INPUT_NOT_INT is used again where it applies");
    check(tasks.filter((t) => ["validation", "authentication"].includes(t.unit) && t.tags.includes("placement")).every((t) => !t.buggy_variants),
      "Validation and Authentication: placement tasks have no buggy variants");
    // The duplicates were removed: these units reuse the existing ids for = vs == and the boundary comparisons.
    const both = tasks.filter((t) => ["validation", "authentication"].includes(t.unit));
    const uses = (id) => both.filter((t) => (t.buggy_variants || []).some((v) => v.misconception === id));
    check(!misconceptions.some((m) => m.id === "ASSIGN_INSTEAD_OF_COMPARE" || m.id === "RANGE_OFF_BY_ONE") &&
      !tasks.some((t) => (t.buggy_variants || []).some((v) => /^(ASSIGN_INSTEAD_OF_COMPARE|RANGE_OFF_BY_ONE)$/.test(v.misconception)) || t.tags.some((g) => /^(ASSIGN_INSTEAD_OF_COMPARE|RANGE_OFF_BY_ONE)$/.test(g))) &&
      uses("EQUALS_VS_DOUBLE_EQUALS").length >= 3 && uses("BOUNDARY_LT_VS_LTE").length >= 3 && uses("GT_VS_GTE").length >= 3,
      "Validation and Authentication reuse EQUALS_VS_DOUBLE_EQUALS, BOUNDARY_LT_VS_LTE and GT_VS_GTE (no duplicate ids)");
    check(uses("EQUALS_VS_DOUBLE_EQUALS").every((t) => t.buggy_variants.filter((v) => v.misconception === "EQUALS_VS_DOUBLE_EQUALS").every((v) => v.outputs.every((o) => o.errorKind === "SyntaxError:assign-in-condition"))),
      "Their EQUALS_VS_DOUBLE_EQUALS variants are recognised by their own error (= in a condition), so they match only that mistake");
    const l1t = tasks.find((t) => t.id === "val-L1t");
    check(l1t && !/\b(int|float)\(/.test(l1t.solution + l1t.hints.join(" ")) && !l1t.buggy_variants && l1t.options[l1t.answer] === l1t.tests[0].expected,
      "val-L1t: a level 1 type check with no cast, its answer is the real output, and it has no buggy variants");
  }

  // ===================== Trace tables, and the searching and sorting units =====================
  {
    const templatesAll = require(path.join(ROOT, "templates.json"));
    const codeOf = (t) => [t.solution, t.starter || ""].concat(t.distractors || [], t.answers || [], t.type === "partial-parsons" ? t.options : [], (t.buggy_variants || []).map((v) => v.code)).join("\n");
    const recursive = (code) => [...code.matchAll(/^\s*def ([a-z_]\w*)\(/gm)].some((m) => {
      const lines = code.slice(m.index).split("\n");
      const ind = /^\s*/.exec(lines[0])[0].length;
      const end = lines.slice(1).findIndex((l) => l.trim() && /^\s*/.exec(l)[0].length <= ind);
      return (end < 0 ? lines.slice(1) : lines.slice(1, end + 1)).some((l) => new RegExp("\\b" + m[1] + "\\(").test(l));
    });
    const ALGO = { "linear-search": "lin", "binary-search": "bin", "bubble-sort": "bub", "insertion-sort": "ins", "merge-sort": "mer" };
    const typesAt = (mine, lv) => mine.filter((t) => t.level === lv).map((t) => t.type).sort().join("+");

    // Trace tables: 3 practice tasks per level, all trace tables, and placement at levels 2, 5, 7 and 9.
    const tt = tasks.filter((t) => t.unit === "trace-tables");
    const ttPractice = tt.filter((t) => !t.tags.includes("placement"));
    const ttPlacement = tt.filter((t) => t.tags.includes("placement"));
    check(Array.from({ length: 10 }, (_, i) => ttPractice.filter((t) => t.level === i + 1).length).join() === "3,3,3,3,3,3,3,3,3,3" &&
      [2, 5, 7, 9].map((lv) => ttPlacement.filter((t) => t.level === lv).map((t) => t.id).join("+")).join() === "trace-P2a+trace-P2b,trace-P5a+trace-P5b,trace-P7a+trace-P7b,trace-P9a+trace-P9b" &&
      tt.every((t) => t.type === "trace") && Array.from({ length: 10 }, (_, i) => Curriculum.levelType(i + 1, "trace-tables")).every((ty) => ty === "trace") &&
      !Curriculum.hasScratch("trace-tables") && Curriculum.hasPlacement("trace-tables"),
      "Trace tables: 3 trace-table tasks at every level, and placement tasks trace-P2a/b, P5a/b, P7a/b and P9a/b");
    const blanks = (t) => !!t.trace.spec.blanks;
    check(ttPractice.filter((t) => t.level <= 2).every((t) => t.solution.split("\n").length <= 3 && !blanks(t)) &&
      ttPractice.filter((t) => t.level === 3 || t.level === 4).every((t) => blanks(t) && t.trace.ask.length < t.trace.rows.length * (t.trace.columns.length - 1)) &&
      ttPractice.filter((t) => t.level === 5 || t.level === 6).every((t) => t.tests[0].inputs.length > 0) &&
      ttPractice.filter((t) => t.level === 7 || t.level === 8).every((t) => /^\s*if\b/m.test(t.solution) && t.trace.lineMode === "ask") &&
      ttPractice.filter((t) => t.level === 9).every((t) => /^\s*(for|while)\b/m.test(t.solution)) &&
      ttPractice.filter((t) => t.level === 10).every((t) => t.trace.rows.length >= 13 && t.trace.rows.length <= 17),
      "Trace tables: levels 1-2 trace 1-3 lines, 3-4 fill in a table's blanks, 5-6 have input, 7-8 selection (the Line column is asked too), 9 a loop, 10 a full table of about 15 rows");

    // The searching and sorting units: no placement, about 40 tasks each, more at the low levels.
    for (const [id, prefix] of Object.entries(ALGO)) {
      const mine = tasks.filter((t) => t.unit === id);
      const want = id === "merge-sort"
        ? "predict,predict,partial-parsons+partial-parsons+partial-parsons+partial-parsons+predict+predict,partial-parsons+partial-parsons+partial-parsons+partial-parsons+predict+predict,fill+fill+fill+trace+trace,fill+fill+fill+trace+trace,parsons+trace+trace,parsons+trace+trace,trace+trace,trace"
        : "predict,predict,partial-parsons+partial-parsons+partial-parsons+partial-parsons+predict+predict,partial-parsons+partial-parsons+partial-parsons+partial-parsons+predict+predict,fill+fill+fill+trace+trace,fill+fill+fill+trace+trace,parsons+trace+trace,parsons+trace+trace,trace+write,write";
      const got = Array.from({ length: 10 }, (_, i) => (i < 2 ? (typesAt(mine, i + 1) === "predict+predict+predict+predict+predict" ? "predict" : typesAt(mine, i + 1)) : typesAt(mine, i + 1))).join();
      check(mine.length === 41 && got === want && mine.every((t) => new RegExp("^" + prefix + "-L\\d+[a-z]$").test(t.id) && Curriculum.levelTypes(t.level, id).includes(t.type)) &&
        !mine.some((t) => t.tags.includes("placement")) && !Curriculum.hasPlacement(id) && Curriculum.hasScratch(id) === (id !== "merge-sort"),
        Curriculum.unitTitle(id) + ": 41 tasks, no placement; levels 1-2 five predict, 3-4 four pick-the-missing-line and two predict, 5-6 three fill and two trace, 7-8 two trace and a Parsons, 9 " +
        (id === "merge-sort" ? "two trace tables and 10 a full trace (no write tasks)" : "a trace and a short write, 10 a full write") + (got === want ? "" : " (" + got + ")"));
      // The items given: every list written out in the program (merge tasks give two sorted lists), or 5 typed in.
      // A task with no list at all (the binary search guessing game searches 1 to 100) doesn't need one.
      const big = mine.filter((t) => t.level >= 7).filter((t) => {
        const lists = [...t.solution.matchAll(/\[(\s*-?[\w"'.]+\s*(?:,\s*-?[\w"'.]+\s*)+)\]/g)].map((m) => m[1].split(",").length);
        const typed = /for k in range\(5\):\n\s+\w+\.append\(int\(input\(/.test(t.solution) ? 5 : 0;
        return (lists.length || typed) && Math.max(typed, lists.reduce((a, b) => a + b, 0)) < 5;
      });
      check(!big.length, Curriculum.unitTitle(id) + ": every task from level 7 up works on a list of at least 5 items" + (big.length ? " (" + big.map((t) => t.id).join(", ") + ")" : ""));
      // Every task type used in the unit has its own "Show me how" example.
      const practice = mine.filter((t) => !t.tags.includes("placement"));
      check(practice.every((t) => t.worked_example && t.worked_example.skill === t.type) && new Set(practice.map((t) => t.type)).size === new Set(practice.map((t) => t.worked_example.skill)).size,
        Curriculum.unitTitle(id) + ": every practice task has a \"Show me how\" example for its task type, and each type has one");
    }
    const merNote = Curriculum.unitById("merge-sort").note || "";
    check(/recursion/i.test(merNote) && /A-level/.test(merNote) && /Recursion unit/.test(merNote) && !/beyond this course/i.test(merNote) &&
      Curriculum.unitById("recursion") && Curriculum.isALevel("recursion"),
      "Merge sort: the unit has one short note saying merge sort uses recursion, an A-level topic, and pointing to the Recursion unit");
    const NEW_UNITS = ["trace-tables"].concat(Object.keys(ALGO));
    const newTasks = tasks.filter((t) => NEW_UNITS.includes(t.unit));
    const rec = newTasks.filter((t) => recursive(codeOf(t)));
    check(!rec.length, "No task in the six new units uses recursion" + (rec.length ? " (" + rec.map((t) => t.id).join(", ") + ")" : ""));
    check(ttPractice.every((t) => t.worked_example && t.worked_example.trace && t.worked_example.trace.rows.length) &&
      Curriculum.UNITS.find((u) => u.id === "trace-tables").skills.every((s) => ttPractice.some((t) => t.worked_example.skill === s)),
      "Trace tables: every practice task's \"Show me how\" shows a worked trace table, and every skill has one");
    check(newTasks.filter((t) => !t.tags.includes("placement")).every((t) => templatesAll.some((tpl) => tpl.derived && tpl.source === t.id)),
      "The six new units: every practice task has a derived template");
    check(Object.keys(ALGO).filter((u) => u !== "merge-sort").every((u) => templatesAll.filter((tpl) => tpl.type === "scratch" && tpl.units[0] === u).length >= 3),
      "Linear search, Binary search, Bubble sort and Insertion sort have write-from-scratch templates");
    const pairs = [["authentication", "trace-tables"], ["trace-tables", "linear-search"], ["linear-search", "binary-search"], ["binary-search", "bubble-sort"], ["bubble-sort", "insertion-sort"], ["insertion-sort", "merge-sort"]];
    check(pairs.every((p) => templatesAll.filter((tpl) => tpl.units.length === 2 && p.every((u) => tpl.units.includes(u))).length >= 3) &&
      !templatesAll.some((tpl) => tpl.type === "trace" && !tpl.derived),
      "Each new pair of units taught one after the other has 3 combined templates (none of them trace tables, which are only made from bank tasks)");

    // The misconceptions: a teacher description, a 3-sentence explanation, and buggy variants on 3+ tasks in their unit.
    const NEW_M = { LINEAR_NOT_FOUND_MISSING: "linear-search", LINEAR_STOPS_EARLY: "linear-search", BINARY_UNSORTED: "binary-search", BINARY_BOUNDS_NOT_UPDATED: "binary-search",
      BINARY_MID_FLOAT: "binary-search", BUBBLE_RANGE_OFF_BY_ONE: "bubble-sort", BUBBLE_SWAP_NO_TEMP: "bubble-sort", INSERTION_OVERWRITES: "insertion-sort",
      INSERTION_KEY_NOT_KEPT: "insertion-sort", MERGE_ITEMS_LOST: "merge-sort", MERGE_NO_COMPARE: "merge-sort" };
    for (const [mid, unit] of Object.entries(NEW_M)) {
      const m = misconceptions.find((x) => x.id === mid);
      const sentences = m ? m.explanation.split(/(?<=[.!?])\s+/).length : 0;
      const bank = tasks.filter((t) => t.unit === unit && !t.tags.includes("placement") && (t.buggy_variants || []).some((v) => v.misconception === mid));
      check(m && m.name && m.description && sentences === 3 && bank.length >= 3,
        mid + ": in misconceptions.json with a teacher description and a 3-sentence explanation, and buggy variants on " + bank.length + " " + unit + " tasks (3 needed)");
    }
    check(new Set(misconceptions.map((m) => m.id)).size === misconceptions.length && Object.keys(NEW_M).every((id) => misconceptions.some((m) => m.id === id)),
      "misconceptions.json has different ids, with the 11 searching and sorting ones");

    // The two new task types in the app, the checker and the teacher's task browser.
    check(Curriculum.TYPE_INFO.trace && Curriculum.TYPE_INFO["partial-parsons"] && App.initialDraft(byId["bub-L5d"]).cells && App.initialDraft(byId["bub-L3a"]).choice === null,
      "Task types: trace and partial-parsons have a label and an empty answer to start (an empty table; no line chosen)");
    const TaskView = require(path.join(ROOT, "task-view.js"));
    const TaskBrowser = require(path.join(ROOT, "task-browser.js"));
    check(!TaskView.showsExpectedOutput(byId["lin-L5d"]) && TaskView.showsExpectedOutput(byId["lin-L3a"]) &&
      /partial-parsons/.test(TaskBrowser.html(byId["lin-L3a"], App.initialDraft)) && /trace-table/.test(TaskBrowser.html(byId["lin-L5d"], App.initialDraft)),
      "A trace task shows no Expected output box (it's in the table); the teacher's task browser shows both new types, named partial-parsons and Trace table");
    const appSrc = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    check(/hasRun = t\.type !== "predict" && t\.type !== "trace"/.test(appSrc) && /traceBody\(t, c\)/.test(appSrc) && /partialBody\(t, c\)/.test(appSrc),
      "The practice page draws a trace table and a pick-the-missing-line task, with no Run button on trace tables");

    // Marking a trace table.
    const tb = byId["trace-L1b"].trace; // x = 10 / x = x - 3 / print(x)
    const cellsFor = (rows) => { const c = {}; tb.ask.forEach(([r, k]) => { if (rows[r][k] != null) c[r + ":" + k] = rows[r][k]; }); return c; };
    const right = cellsFor(tb.rows);
    const repeated = Object.assign({}, right, { "2:1": "7" });       // x written again in the print row (unchanged)
    const quoted = Object.assign({}, right, { "2:2": '"7"' });       // the output in quotes
    const wrong = Object.assign({}, right, { "1:1": "13" });
    check(Checker.gradeTrace(tb, right).passed && Checker.gradeTrace(tb, repeated).passed && Checker.gradeTrace(tb, quoted).passed &&
      !Checker.gradeTrace(tb, wrong).passed && Checker.gradeTrace(tb, wrong).firstWrongRow === 1 && Checker.gradeTrace(tb, {}).empty,
      "Trace tables are marked cell by cell: a value written again where it didn't change, and quotes round text, are both fine; a wrong cell is found; an empty table is no answer");
    const f = Checker.classifyAttempt({ type: "trace", table: tb, cells: wrong });
    const fe = Checker.classifyAttempt({ type: "trace", table: tb, cells: {} });
    check(f.category === "WRONG_OUTPUT" && f.details.trace && f.details.row === 2 && f.failedTest === 1 && f.output === "x=13" && fe.category === "NO_ANSWER" &&
      /row 2/.test(Checker.failureParts(f).message),
      "A wrong trace table is WRONG_OUTPUT, with its first wrong row as the evidence; an empty one is NO_ANSWER");
    // A student who makes the misconception's mistake in their table matches it, row by row.
    const t9 = byId["trace-L9a"]; // RANGE_STOP_EXCLUSIVE: the loop also runs for i = 5
    const vRows = t9.buggy_variants[0].rows;
    const studentRows = t9.trace.rows.map((row) => row.slice());
    studentRows[9] = t9.trace.columns.map((c) => (c === "Line" ? studentRows[9][0] : c === "i" ? "5" : null));
    const cells9 = {};
    t9.trace.ask.forEach(([r, k]) => { if (studentRows[r][k] != null) cells9[r + ":" + k] = studentRows[r][k]; });
    const f9 = Checker.classifyAttempt({ type: "trace", table: t9.trace, cells: cells9 });
    check(vRows[9] === "i=5" && f9.output === "i=5" && Checker.matchMisconceptions(t9, f9).join() === "RANGE_STOP_EXCLUSIVE" &&
      App.attemptRecord({ task: t9, unit: "trace-tables", failure: f9, code: "" }).expected === "Output=10",
      "A trace task's misconception is matched on the student's first wrong row (trace-L9a: an extra i = 5 row is RANGE_STOP_EXCLUSIVE), and the record gives the real row");

    // The builder's checks for the two new types (tools/unit-tasks.js checkTasks), each with a task it must refuse.
    const { checkTasks, T } = require(path.join(ROOT, "tools", "unit-tasks.js"));
    const pp = (o) => Object.assign({ id: "x-L3a", level: 3, type: "partial-parsons", title: "t", description: "d", tests: [T(["3"]), T(["9"])],
      starter: 'n = int(input("N: "))\nif n > 5:\n    ____\nelse:\n    print("small")', options: ['print("big")', 'print("small")', 'print("n")'], hints: ["h"], skills: ["linear-search"], tags: ["x"] }, o);
    const tr = (o) => Object.assign({ id: "x-L5a", level: 5, type: "trace", title: "t", description: "d", tests: [T([])], solution: "a = 2\nb = a * 3\nprint(b)", hints: ["h"], skills: ["trace-assignment"], tags: ["x"] }, o);
    const probs = (spec) => checkTasks("x", [spec]).problems;
    const ok = checkTasks("x", [pp({}), tr({}), tr({ id: "x-L5b", trace: { blanks: [[1, "b"]] } })]);
    const ppTable = ok.built[0];
    check(!ok.problems.length && ppTable.solution === 'n = int(input("N: "))\nif n > 5:\n    print("big")\nelse:\n    print("small")' && ppTable.options[ppTable.answer] === 'print("big")' &&
      ok.built[1].trace.columns.join() === "Line,a,b,Output" && ok.built[1].trace.rows.length === 3 && ok.built[2].trace.ask.join() === "1,2",
      "Builder: a pick-the-missing-line task gets its solution and right answer; a trace task gets its table from tracing the program (and only the blanks asked, when it has some)");
    check(probs(pp({ options: ['print("big")', 'print("big") ', 'print("n")'] })).some((p) => /different|indentation/.test(p)) &&
      probs(pp({ options: ['print("big")', 'print("BIG".lower())', 'print("n")'] })).some((p) => /passes every test/.test(p)) &&
      probs(pp({ options: ['print("big")', 'print("small"', 'print("n")'] })).some((p) => /syntax error/.test(p)) &&
      probs(pp({ starter: 'n = int(input("N: "))\n____\n____' })).some((p) => /exactly one gap/.test(p)) &&
      probs(pp({ options: ['print("big")', 'print("n")'] })).some((p) => /3 or 4 options/.test(p)),
      "Builder refuses a pick-the-missing-line task with options that are the same, a wrong option that passes every test, a wrong option that is a syntax error, two gaps, or only 2 options");
    check(probs(tr({ tests: [T([]), T([])] })).some((p) => /exactly one test/.test(p)) &&
      probs(tr({ trace: { blanks: [[0, "b"]] } })).some((p) => /empty cell/.test(p)) &&
      probs(tr({ trace: { blanks: [[7, "a"]] } })).some((p) => /outside the table/.test(p)) &&
      probs(tr({ solution: "i = 0\nwhile i < 50:\n    i = i + 1" })).some((p) => /rows \(at most/.test(p)) &&
      !probs(tr({ tags: ["INT_DIV_VS_DIV"], buggy: [["INT_DIV_VS_DIV", "a = 2\nb = a * 4\nprint(b)"]] })).length &&
      probs(tr({ tags: ["INT_DIV_VS_DIV"], buggy: [["INT_DIV_VS_DIV", "a = 2\nb = a * 3\nprint(b)\nc = 0"]] })).some((p) => /same table as the solution/.test(p)),
      "Builder refuses a trace task with two tests, a blank on an empty cell or outside the table, a table of more than 40 rows, or a buggy variant whose table is the same as the real one where the student fills it in");
    // harness.trace_code records each line's values and output (the same file the browser's worker loads).
    const traced = runPython([{ code: 'nums = [3, 1]\nx = 2.5\nfor n in nums:\n    x = x + n\nprint("done")', inputs: [], trace: true }])[0];
    // 8 steps: the for line runs a last time (and changes nothing) when the list runs out.
    check(traced.steps.length === 8 && JSON.stringify(traced.steps[0]) === JSON.stringify({ line: 1, vars: { nums: ["3", "1"] }, out: "" }) &&
      traced.steps[3].vars.x === "5.5" && traced.steps[7].out === "done\n" && /trace_code_json/.test(fs.readFileSync(path.join(ROOT, "worker.js"), "utf8")),
      "harness.py traces a program line by line (values as a trace table writes them, and what each line prints), in Node and in the browser's worker");

    // Server and teacher data: the new task types are accepted and explained (the new units: see "Unit migrations").
    const mig = fs.readFileSync(path.join(ROOT, "supabase", "migrations", "0010_searching_sorting_trace_units.sql"), "utf8");
    const dict = fs.readFileSync(path.join(ROOT, "teacher-data.js"), "utf8");
    check(mig.includes("add constraint attempts_task_type_check") && /'trace', 'partial-parsons'/.test(mig) && /partial-parsons \(pick the missing line/.test(dict),
      "Migration 0010 also re-adds the task type check with trace and partial-parsons, and the data dictionary explains them");
  }

  // ===================== The A-level units (programming techniques and data structures), and the explainer =====================
  {
    const Templates = require(path.join(ROOT, "templates.js"));
    const templatesAll = require(path.join(ROOT, "templates.json"));
    const { explainerProblems } = require(path.join(ROOT, "tools", "unit-tasks.js"));
    // Every A-level unit and its task id prefix, in the menu's order (programming techniques, then data structures).
    const AL = { recursion: "rec", "scope-parameters": "scope", "oop-classes": "cls", "oop-methods": "meth", "oop-encapsulation": "enc", "oop-inheritance": "inh", debugging: "dbg",
      "records-tuples": "tup", "stacks-queues": "sq", "linked-lists": "ll", "hash-tables": "hash", "arrays-3d": "a3d" };
    const ids = Object.keys(AL);
    const DATA_STRUCTURES = ["records-tuples", "stacks-queues", "linked-lists", "hash-tables", "arrays-3d"];
    const order = Curriculum.UNITS.map((u) => u.id);
    const ladder = "predict,predict,fill,fill,parsons+partial-parsons,parsons+partial-parsons,trace+write,trace+write,write+trace,write+trace";
    check(order.slice(order.indexOf("merge-sort") + 1).join() === ids.join() && Curriculum.A_LEVEL_UNIT_IDS.join() === ids.join() &&
      order.slice(order.indexOf("debugging") + 1).join() === DATA_STRUCTURES.join() && ids.every((u) => Curriculum.isALevel(u)) && !Curriculum.isALevel("merge-sort"),
      "A-level units: the seven programming techniques units come after Merge sort, then the five data structures units (records-tuples, stacks-queues, linked-lists, hash-tables, arrays-3d) after Debugging; Curriculum.isALevel names exactly these");
    check(ids.every((u) => Curriculum.hasPlacement(u) && Array.from({ length: 10 }, (_, i) => Curriculum.levelTypes(i + 1, u).join("+")).join() === ladder) &&
      ids.every((u) => Curriculum.hasScratch(u) === (u !== "debugging")),
      "A-level units: levels 1-2 predict, 3-4 fill in, 5-6 Parsons or pick the missing line, 7-8 trace or a short write, 9-10 write or a longer trace; each has a placement test; every unit but Debugging has write-from-scratch tasks");

    for (const [u, prefix] of Object.entries(AL)) {
      const mine = tasks.filter((t) => t.unit === u);
      const practice = mine.filter((t) => !t.tags.includes("placement"));
      const placement = mine.filter((t) => t.tags.includes("placement"));
      const { COVERAGE } = require(path.join(ROOT, "tools", "add-" + u + "-unit.js"));
      const angles = Object.entries(COVERAGE || {});
      const byIdHere = Object.fromEntries(mine.map((t) => [t.id, t]));
      const badCover = angles.filter(([, list]) => !list.length || list.some((id) => !byIdHere[id]));
      check(angles.length >= 4 && !badCover.length && mine.every((t) => new RegExp("^" + prefix + "-[LP]\\d+[a-z]$").test(t.id)) &&
        practice.length >= 24 && mine.length >= 32 && Array.from({ length: 10 }, (_, i) => practice.filter((t) => t.level === i + 1).length).every((n) => n >= 1),
        Curriculum.unitTitle(u) + ": " + mine.length + " tasks (" + practice.length + " practice), a coverage map of " + angles.length + " angles whose tasks exist, and practice tasks at every level" + (badCover.length ? " (" + badCover.map(([a]) => a).join("; ") + ")" : ""));
      check([2, 5, 7, 9].map((lv) => placement.filter((t) => t.level === lv).map((t) => t.id).sort().join("+")).join() === [2, 5, 7, 9].map((lv) => prefix + "-P" + lv + "a+" + prefix + "-P" + lv + "b").join() &&
        placement.length === 8 && placement.every((t) => !(t.buggy_variants || []).length),
        Curriculum.unitTitle(u) + ": placement tasks " + prefix + "-P2a/b, P5a/b, P7a/b and P9a/b, with no buggy variants");
      const noExplainer = mine.filter((t) => !t.explainer || explainerProblems(t).length);
      check(!noExplainer.length, Curriculum.unitTitle(u) + ": every task has a one-sentence explainer (a predict task's doesn't give the answer)" + (noExplainer.length ? " (" + noExplainer.map((t) => t.id).join(", ") + ")" : ""));
      // A data structures unit's derived explainer is the task's own, unless it has numbers that the variant changes.
      const strict = DATA_STRUCTURES.includes(u);
      check(practice.every((t) => templatesAll.some((tpl) => tpl.derived && tpl.source === t.id && tpl.explainer && (!strict || /\d/.test(t.explainer) || tpl.explainer === t.explainer))) &&
        placement.every((t) => !templatesAll.some((tpl) => tpl.source === t.id && tpl.derived)),
        Curriculum.unitTitle(u) + ": every practice task has a derived template, which inherits its explainer");
      check(practice.every((t) => t.worked_example && t.worked_example.skill === t.type), Curriculum.unitTitle(u) + ": every practice task has a \"Show me how\" example for its task type");
      const dicts = mine.filter((t) => /[{}]|\bdict\(/.test(t.solution + (t.buggy_variants || []).map((v) => v.code).join("\n")));
      check(!dicts.length, Curriculum.unitTitle(u) + ": no task uses a dictionary (or any {...})" + (dicts.length ? " (" + dicts.map((t) => t.id).join(", ") + ")" : ""));
    }
    // Combined templates for each pair of units next to each other, from Merge sort + Recursion on.
    const pairs = ["merge-sort"].concat(ids).slice(0, -1).map((u, i) => [u, ids[i]]);
    check(pairs.length === 12 && pairs.every((p) => templatesAll.filter((tpl) => tpl.units.length === 2 && p.every((x) => tpl.units.includes(x)) && tpl.explainer).length >= 3) &&
      ids.filter((u) => u !== "debugging").every((u) => templatesAll.some((tpl) => tpl.type === "scratch" && tpl.units[0] === u && tpl.explainer)),
      "A-level templates: 3 combined templates for each pair of units next to each other (Merge sort + Recursion, ..., Debugging + Records and tuples, ..., Hash tables + 3D arrays), and a write-from-scratch template for each unit but Debugging, all with explainers");

    // Misconceptions: a teacher description, a 3-sentence explanation, and buggy variants on 3+ bank tasks. The
    // programming techniques ids count tasks across those seven units; each data structures id counts its own unit's
    // tasks, and its explanation ends by saying what to write (some code).
    const ptUnits = ids.filter((u) => !DATA_STRUCTURES.includes(u));
    const NEW_MIS = [
      ...["RECURSION_NO_BASE_CASE", "GLOBAL_KEYWORD_MISSING", "LOCAL_THOUGHT_CHANGES_OUTSIDE", "LIST_COPY_ASSUMED", "SELF_MISSING", "ATTRIBUTE_NOT_STORED",
        "METHOD_NO_BRACKETS", "GETTER_BYPASSED", "SUPER_NOT_CALLED", "OVERRIDE_WRONG_VERSION", "FIRST_ERROR_IGNORED", "WRONG_LINE_FIXED"].map((id) => ({ id, units: ptUnits, code: false })),
      ...Object.entries({
        "records-tuples": ["TUPLE_CHANGED_IN_PLACE", "RECORD_FIELD_WRONG_INDEX", "TUPLE_UNPACK_ORDER"],
        "stacks-queues": ["STACK_POP_FROM_FRONT", "QUEUE_REMOVE_FROM_BACK", "POP_EMPTY_NOT_CHECKED"],
        "linked-lists": ["LINKED_LOST_REFERENCE", "LINKED_STOPS_EARLY", "LINKED_HEAD_NOT_UPDATED"],
        "hash-tables": ["HASH_NO_MOD", "HASH_COLLISION_OVERWRITES", "HASH_SEARCH_STOPS_AT_HOME"],
        "arrays-3d": ["CUBE_INDEX_ORDER", "CUBE_WRONG_LEN", "CUBE_SHARED_ROWS"],
      }).flatMap(([u, list]) => list.map((id) => ({ id, units: [u], code: true }))),
    ];
    for (const { id: mid, units, code } of NEW_MIS) {
      const m = misconceptions.find((x) => x.id === mid);
      const sentences = m ? m.explanation.split(/(?<=[.!?])\s+/) : [];
      const bank = tasks.filter((t) => units.includes(t.unit) && !t.tags.includes("placement") && (t.buggy_variants || []).some((v) => v.misconception === mid));
      check(m && m.name && m.description && sentences.length === 3 && (!code || /\w\.\w|[(\[=%]/.test(sentences[2])) && bank.length >= 3,
        mid + ": in misconceptions.json with a teacher description and a 3-sentence explanation" + (code ? " ending with what to write" : "") + ", and buggy variants on " + bank.length +
        " " + (units.length === 1 ? Curriculum.unitTitle(units[0]) : "A-level") + " tasks (3 needed)");
    }
    const alBank = tasks.filter((t) => ptUnits.includes(t.unit) && !t.tags.includes("placement"));
    check(!misconceptions.some((m) => m.id === "RECURSION_RETURN_MISSING") &&
      alBank.filter((t) => t.unit === "recursion" && (t.buggy_variants || []).some((v) => v.misconception === "RETURN_MISSING_NONE")).length >= 3 &&
      misconceptions.slice(52).map((m) => m.id).join() === NEW_MIS.map((x) => x.id).join() && misconceptions.length === 79 && new Set(misconceptions.map((m) => m.id)).size === 79,
      "Recursion reuses RETURN_MISSING_NONE for a recursive call whose result isn't returned (no RECURSION_RETURN_MISSING); misconceptions.json has 79 different ids, the 12 programming techniques ids then the 15 data structures ids after the earlier 52");
    check(alBank.filter((t) => (t.buggy_variants || []).some((v) => v.misconception === "RECURSION_NO_BASE_CASE")).every((t) =>
      t.buggy_variants.filter((v) => v.misconception === "RECURSION_NO_BASE_CASE").every((v) => v.outputs.some((o) => o.errorKind === "RecursionError"))),
      "RECURSION_NO_BASE_CASE variants end in a RecursionError (never a timeout), so they match a student's endless recursion");

    // Objects in a trace table: each attribute of an object made from a class in the program is a column, and each
    // item of a list of numbers or text too.
    const traced = runPython([{ code: "class Acc:\n    def __init__(self, b):\n        self.balance = b\n\na = Acc(5)\na.balance = a.balance + 2", inputs: [], trace: true }])[0];
    const table = Checker.traceTable(traced.steps, {});
    check(table.columns.join() === "Line,a.balance" && JSON.stringify(table.rows) === JSON.stringify([["5", "5"], ["6", "7"]]) &&
      byId["cls-L7a"].trace.columns.includes("b.size") && byId["meth-L7a"].trace.columns.includes("a.balance") &&
      byId["ll-L7a"].trace.columns.includes("cur.data") && byId["ll-L10b"].trace.columns.includes("prev.data") && byId["sq-L10b"].trace.columns.includes("queue[0]"),
      "harness.py traces an object's attributes as columns of their own (a.balance), which the OOP and linked list trace tasks use (cur.data, prev.data), and each list item in its own column (queue[0])");

    // The explainer is shown only after a pass or the second wrong check (App.explainerShown), never before.
    const ex = byId["rec-L1a"];
    const shown = (attempts, passed, t) => App.explainerShown({ attempts, passed }, t || ex);
    check(!shown(0, false) && !shown(1, false) && shown(2, false) && shown(3, false) && shown(1, true) && shown(2, true) &&
      !shown(5, false, byId["sel-L1a"] || tasks.find((t) => !t.explainer)) && App.EXPLAINER_AFTER_WRONG_CHECKS === 2,
      "Explainer: hidden before any check and after one wrong check; shown straight after the second wrong check, or once the task is passed; never on a task without one");
    const appSrc = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    const card = appSrc.slice(appSrc.indexOf('card.innerHTML = noticeHtml + (c.placement ? placementIntro : "")'), appSrc.indexOf("if (t.type === \"fill\") wireFill(c);"));
    check(/<aside id="explainer" class="explainer" aria-live="polite" hidden><\/aside>/.test(card) && card.indexOf('id="explainer"') < card.indexOf('id="next-btn"') &&
      card.indexOf('id="explainer"') < card.indexOf('<div class="actions">') && /renderLevelButtons\(\);\s*renderExplainer\(\);/.test(appSrc) &&
      /box\.hidden = !show;/.test(appSrc) && /show \? "<p><strong>The idea:<\/strong> " \+ esc\(t\.explainer\)/.test(appSrc),
      "Explainer: the box starts hidden, sits above the buttons (before the Skip option), and is filled in after every check; it stays empty while hidden");
    // Template variants keep the explainer, with their own values filled in.
    const dtpl = templatesAll.find((tpl) => tpl.id === "d-rec-L4a");
    const v = Templates.realiseSync(dtpl, 3, runPython);
    const comb = Templates.expand(templatesAll.find((tpl) => tpl.id === "comb-rec-scope-global"), 2);
    check(v && v.explainer && !/\{\{|\[\[/.test(v.explainer) && comb.explainer && !/\{\{/.test(comb.explainer) && dtpl.explainer === byId["rec-L4a"].explainer,
      "Explainer: derived templates inherit it, and every variant gets it with its placeholders filled in");
    // Content only: no database column or server check names the explainer.
    const rowsTs = fs.readFileSync(path.join(ROOT, "supabase", "functions", "_shared", "rows.ts"), "utf8");
    const migAll = fs.readdirSync(path.join(ROOT, "supabase", "migrations")).map((f) => fs.readFileSync(path.join(ROOT, "supabase", "migrations", f), "utf8").replace(/^--.*$/gm, "")).join("\n");
    check(!/explainer/i.test(migAll) && !/explainer/.test(rowsTs) && !("explainer" in App.attemptRecord({ task: ex, unit: "recursion", kind: "attempt", result: "pass" })),
      "Explainer: content only (tasks.json and templates.json), with no database column, server check or attempt field");
  }

  // ===================== Unit migrations =====================
  // Every migration that adds units (0006 on): one transaction that only drops and re-adds checks; the four unit checks
  // list the same units (progress adds endless, last); each keeps the units before it and adds its new ones at the end,
  // in the curriculum's order; rows.ts and the data dictionary list them, and a SQL test covers it. The newest
  // migration's list, rows.ts and the curriculum must name exactly the same units.
  {
    const migDir = path.join(ROOT, "supabase", "migrations");
    const rowsTs = fs.readFileSync(path.join(ROOT, "supabase", "functions", "_shared", "rows.ts"), "utf8");
    const dict = fs.readFileSync(path.join(ROOT, "teacher-data.js"), "utf8");
    const order = Curriculum.UNITS.map((u) => u.id);
    const unitMigrations = fs.readdirSync(migDir).filter((f) => /^\d{4}_.*_units?\.sql$/.test(f)).sort();
    const UNIT_CHECKS = ["progress_unit_check", "passed_tasks_unit_check", "attempts_unit_check", "events_unit_check"];
    let prev = null;
    const bad = [];
    for (const f of unitMigrations) {
      const sql = fs.readFileSync(path.join(migDir, f), "utf8");
      const body = sql.replace(/^--.*$/gm, "");
      const adds = [...body.matchAll(/add constraint (\w+)/g)].map((m) => m[1]);
      const lists = {};
      for (const m of body.matchAll(/add constraint (\w+)\s+check \(unit in \(([\s\S]*?)\)\)/g)) lists[m[1]] = [...m[2].matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1]);
      const prog = lists.progress_unit_check || [];
      const units = prog.filter((u) => u !== "endless");
      const added = prev ? units.filter((u) => !prev.includes(u)) : [];
      const sqlTest = path.join(ROOT, "tests", "sql", f.replace(/^\d{4}_/, "").replace(/_/g, "-"));
      const ok = /^begin;$/m.test(sql) && /^commit;$/m.test(sql) && !/drop (table|column)|alter column|delete from|update /i.test(body) &&
        (body.match(/drop constraint/g) || []).length === adds.length && UNIT_CHECKS.every((c) => adds.includes(c)) &&
        adds.every((c) => UNIT_CHECKS.includes(c) || c === "attempts_task_type_check") &&
        prog[prog.length - 1] === "endless" && UNIT_CHECKS.slice(1).every((c) => (lists[c] || []).join() === units.join()) &&
        (!prev || (prev.every((u) => units.includes(u)) && units.slice(prev.length).join() === added.join() && added.join() === order.filter((u) => added.includes(u)).join() && added.length > 0)) &&
        added.every((u) => rowsTs.includes('"' + u + '"') && dict.includes(u + " (")) && fs.existsSync(sqlTest);
      if (!ok) bad.push(f);
      prev = units;
    }
    check(unitMigrations.length >= 7 && !bad.length,
      "Unit migrations (" + unitMigrations.length + "): each re-adds only its checks in one transaction, keeps every earlier unit and adds its new ones at the end in curriculum order, with endless last in progress; rows.ts, the data dictionary and a SQL test cover each" + (bad.length ? " (" + bad.join(", ") + ")" : ""));
    const tsUnits = [...(rowsTs.match(/export const UNITS = \[([\s\S]*?)\];/) || ["", ""])[1].matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);
    const same = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
    check(same(order, tsUnits) && same(order, prev || []) && new Set(order).size === order.length,
      "Curriculum.UNITS, rows.ts UNITS and the newest migration's unit check list exactly the same " + order.length + " units");
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
    check(/html \+= TaskView\.testResultsHtml\(t, results, passes\);/.test(appSrc) && /failureParts\(failure, \{ exampleTests: TaskView\.EXAMPLE_TESTS \}\)/.test(appSrc) &&
      /isHidden\(i\) \? "Hidden test "/.test(fs.readFileSync(path.join(ROOT, "task-view.js"), "utf8")),
      "The practice page's failure message says nothing about a hidden test; the results list below it shows the details of each failed test only");
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
    check(G.map((g) => g.title).join() === "Programming fundamentals,Advanced programming,Validation,Searching and sorting,A-level" &&
      grouped.join() === Curriculum.UNITS.map((u) => u.id).join() && new Set(grouped).size === grouped.length,
      "Unit menu: five groups in order, holding every unit exactly once, in the units' own order");
    check(G[4].id === "a-level" && G[4].units.join() === "recursion,scope-parameters,oop-classes,oop-methods,oop-encapsulation,oop-inheritance,debugging,records-tuples,stacks-queues,linked-lists,hash-tables,arrays-3d" &&
      (G[4].subsections || []).length === 2 && G[4].subsections[0].title === "Programming techniques" && G[4].subsections[1].title === "Data structures" &&
      G[4].subsections.flatMap((s) => s.units).join() === G[4].units.join() &&
      /g\.subsections/.test(homeSrc) && /class="subsection-heading"/.test(homeSrc) && /unitCard\(u, progress, sub\)/.test(homeSrc) && /sub \? "h5" : "h4"/.test(homeSrc),
      "Unit menu: the A-level group has a Programming techniques subsection (seven units) then a Data structures subsection (five units), each shown under its own heading (unit cards one heading level lower)");
    // The A-level group drawn the way home.js draws it: each subsection heading, then its units in order.
    {
      const subs = G[4].subsections.map((s) => ({ title: s.title, units: Curriculum.UNITS.filter((u) => s.units.includes(u.id)).map((u) => u.title) }));
      check(subs.length === 2 && subs[0].units.join("|") === "Recursion|Scope and parameters|Object-oriented programming: classes and objects|Object-oriented programming: methods|Object-oriented programming: encapsulation|Object-oriented programming: inheritance and polymorphism|Debugging",
        "Unit menu: Programming techniques lists Recursion, Scope and parameters, the four object-oriented programming units, then Debugging");
      check(subs[1].units.join("|") === "Records and tuples|Stacks and queues|Linked lists|Hash tables|3D arrays",
        "Unit menu: Data structures lists Records and tuples, Stacks and queues, Linked lists, Hash tables, then 3D arrays, after Programming techniques");
    }
    check(G[0].units.join() === "output,variables,data-types,maths,selection,loops-condition,loops-count" &&
      G[1].units.join() === "strings,random,lists,functions-basic,functions-return,file-handling,arrays-2d" &&
      G[2].units.join() === "validation,validation-presence,validation-type,validation-range,validation-format,validation-length,authentication,debugging-gcse,trace-tables" &&
      G[3].units.join() === "linear-search,binary-search,bubble-sort,insertion-sort,merge-sort",
      "Unit menu: fundamentals and advanced units as listed; the Validation group holds Validation, the five Validation units (Presence, Type, Range, Format and Length checks), Authentication, Debugging (GCSE) and Trace tables; Searching and sorting holds its five units");
    const collapseSrc = read("collapse.js");
    check(/aria-expanded/.test(collapseSrc) && /try \{[^}]*localStorage\.getItem\(key/.test(collapseSrc) && /try \{[^}]*localStorage\.setItem\(key/.test(collapseSrc) &&
      /Collapse\.buttonHtml\(/.test(homeSrc) && /Collapse\.wire\(\$\("unit-list"\), COLLAPSED_KEY\)/.test(homeSrc) && !/localStorage/.test(homeSrc) &&
      /<script src="collapse\.js"><\/script>\s*<script src="home\.js">/.test(app),
      "Unit menu: each group heading is a button that opens and closes it, remembered on this device (collapse.js; storage errors are caught)");

    // The teacher view's sections use the same component, with their own storage key, all starting expanded.
    const teacher = read("teacher.html");
    const teacherSrc = read("teacher.js");
    const sections = [...teacher.matchAll(/<section class="[^"]*teacher-section[^"]*" data-collapse="([^"]+)"[^>]*>\s*<h3[^>]*>([^<]+)<\/h3>/g)].map((m) => m[2]);
    check(sections.join() === "Teachers,Name and stage,Student logins,Import a full export,Delete this class,Secured score per unit,This class,All my classes,Compare classes,Exports,Level changes,Needs review,Misconception table,Failed attempts with no match, by task,Not matched yet",
      "Teacher view: every section (the class's teachers, class name and stage, student logins, import a full export, delete class, the score table, the two leaderboard sections and Compare classes (on Leaderboards since review findings L6 and T4), exports, level changes, and the Misconceptions page's Needs review list, table, unmatched attempts and not-matched-yet list) is collapsible");
    const key = (teacherSrc.match(/Collapse\.enhance\(document\.querySelector\("main"\), "([^"]+)"\)/) || [])[1];
    check(key && key !== "pythonPractice.collapsedGroups" && /<script src="collapse\.js"><\/script>\s*<script src="tour\.js"><\/script>\s*<script src="teacher-tour\.js"><\/script>\s*<script src="teacher\.js">/.test(teacher) && !/localStorage\./.test(teacherSrc),
      "Teacher view: sections open and close with collapse.js, remembered under their own key (not the student view's)");
    // Run collapse.js on a tiny fake page: sections start expanded, a press collapses one and saves it, and a
    // "reload" keeps it collapsed. With storage blocked, every section still opens and closes.
    const runCollapse = (storage, closedByDefault) => {
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
      const s = mk("section"); s.dataset.collapse = "students"; if (closedByDefault) s.dataset.collapseDefault = "closed"; s.children.push(h);
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
        const b = { dataset: Object.assign({ group: "students" }, /data-closed-by-default="true"/.test(h.innerHTML) ? { closedByDefault: "true" } : {}), attrs: { "aria-expanded": open, "aria-controls": body.id },
          querySelector: () => null, getAttribute(n) { return this.attrs[n]; }, setAttribute(n, v) { this.attrs[n] = v; h.innerHTML = h.innerHTML.replace(/aria-expanded="\w+"/, 'aria-expanded="' + v + '"'); } };
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
    // A section marked closed by default (the Misconceptions page's three): starts collapsed, opens and is remembered
    // open after a reload, and closes again; the other sections' remembered state is untouched.
    const mem2 = { k: '["other"]' };
    const store2 = { getItem: (k) => (k in mem2 ? mem2[k] : null), setItem: (k, v) => { mem2[k] = String(v); } };
    const c1 = runCollapse(store2, true);
    const startsClosed = c1.body.hidden && /aria-expanded="false"/.test(c1.h.innerHTML) && /data-closed-by-default="true"/.test(c1.h.innerHTML);
    c1.press();
    const openedSaved = !c1.body.hidden && mem2.k === '["other","open:students"]';
    const c2 = runCollapse(store2, true);
    const keptOpen = !c2.body.hidden;
    c2.press();
    check(startsClosed && openedSaved && keptOpen && c2.body.hidden && mem2.k === '["other"]' &&
      (teacher.match(/data-collapse-default="closed"/g) || []).length === 6 &&
      ["mc-review", "ws-misconceptions", "ws-unmatched", "ws-unseen", "class-import", "level-log"].every((id) => new RegExp('data-collapse="' + id + '" data-collapse-default="closed"').test(teacher)),
      "Misconceptions page: Needs review (since review finding S5), the misconception table, unmatched attempts and not-matched-yet sections start collapsed, as do Import a full export and Level changes (review findings L3 and L6), and each one's open or closed state is remembered in this browser");
    check(!/Haven't started a unit/.test(teacherSrc + teacher), "Teacher overview: the \"Haven't started a unit\" box is gone (the student table still shows Not started cells)");
  }

  // ===================== Recursion tasks must recurse (rec-L8a, rec-L10a) =====================
  // A loop can print the right answer, so for these two tasks a pass also needs the recursive function to call itself.
  {
    const CheckerR = require(path.join(ROOT, "checker.js"));
    const byIdR = Object.fromEntries(tasks.map((t) => [t.id, t]));
    const l8 = byIdR["rec-L8a"], l10 = byIdR["rec-L10a"];
    // What the app does on Check (app.js check): every test must pass and recursionProblem must find nothing.
    const judge = (t, code) => {
      const results = runPython(t.tests.map((x) => ({ code, inputs: x.inputs })));
      const passes = results.map((r, i) => !r.error && CheckerR.outputsMatch(r.output, t.tests[i].expected));
      const rec = CheckerR.recursionProblem(t, code);
      const failure = passes.every(Boolean) && !rec ? null : CheckerR.classifyAttempt({ type: t.type, code, results, tests: t.tests, passes, recursion: rec && rec.name });
      return { outputsRight: passes.every(Boolean), passed: !failure, failure, message: failure ? CheckerR.failureParts(failure).message : "" };
    };
    const powerMain = '\nb = int(input("Base: "))\ne = int(input("Power: "))\nprint(power_loop(b, e), power_rec(b, e))';
    const powerLoopFn = "def power_loop(base, exp):\n    answer = 1\n    for i in range(exp):\n        answer = answer * base\n    return answer\n\n";
    const l8Loop = powerLoopFn + "def power_rec(base, exp):\n    answer = 1\n    for i in range(exp):\n        answer = answer * base\n    return answer\n" + powerMain;
    const l8Borrow = powerLoopFn + "def power_rec(base, exp):\n    # power_rec(base, exp - 1) would be recursion\n    note = \"power_rec(base, exp - 1)\"\n    return power_loop(base, exp)\n" + powerMain;
    const l8Rec = powerLoopFn + "def power_rec(base, exp):\n    if exp == 0:\n        return 1\n    return base*power_rec (base, exp-1)\n" + powerMain;
    const l10Main = '\nscores.append(int(input("New score: ")))\nprint(biggest(scores), biggest_loop(scores))';
    const l10LoopFn = "def biggest_loop(items):\n    best = items[0]\n    for x in items:\n        if x > best:\n            best = x\n    return best\n\n";
    const l10Loop = "scores = [12, 17, 9, 15]\n\n" + l10LoopFn + "def biggest(items):\n    best = items[0]\n    for x in items:\n        if x > best:\n            best = x\n    return best\n" + l10Main;
    const l10Max = "scores = [12, 17, 9, 15]\n\n" + l10LoopFn + "def biggest(items):\n    return max(items)\n" + l10Main;
    const l10Rec = "scores = [12, 17, 9, 15]\n\ndef biggest(items):\n    if len(items) == 1:\n        return items[0]\n    rest = biggest(items[1:])\n    return items[0] if items[0] > rest else rest\n\n" + l10LoopFn + l10Main;
    const msg8 = "Your function power_rec needs to call itself. Put a call to power_rec inside its own body.";
    const msg10 = "Your function biggest needs to call itself. Put a call to biggest inside its own body.";
    const loop8 = judge(l8, l8Loop), borrow8 = judge(l8, l8Borrow), loop10 = judge(l10, l10Loop), max10 = judge(l10, l10Max);
    check(l8 && l10 && loop8.outputsRight && !loop8.passed && loop8.message === msg8 && borrow8.outputsRight && !borrow8.passed && borrow8.message === msg8 &&
      loop10.outputsRight && !loop10.passed && loop10.message === msg10 && max10.outputsRight && !max10.passed && max10.message === msg10 &&
      loop8.failure.category === "WRONG_OUTPUT" && loop8.failure.failedTest === null && CheckerR.matchMisconceptions(l8, loop8.failure).length === 0,
      "Recursion tasks: a loop answer to rec-L8a and rec-L10a prints the right output but fails, with \"Your function … needs to call itself. Put a call to … inside its own body.\" (a call only in a comment or a string, or handing over to the loop function, doesn't count)");
    const sol8 = judge(l8, l8.solution), sol10 = judge(l10, l10.solution), rec8 = judge(l8, l8Rec), rec10 = judge(l10, l10Rec);
    check(sol8.passed && sol10.passed && rec8.passed && rec10.passed,
      "Recursion tasks: a recursive answer to rec-L8a and rec-L10a passes (the model solutions, and differently written ones)");
    // The tasks made from the three templates built on these two (ids with a "#seed" suffix, such as d-rec-L8a#123).
    const TemplatesR = require(path.join(ROOT, "templates.js"));
    const tplList = (() => { const j = JSON.parse(fs.readFileSync(path.join(ROOT, "templates.json"), "utf8")); return Array.isArray(j) ? j : j.templates || Object.values(j); })();
    const tplById = Object.fromEntries(tplList.map((t) => [t.id, t]));
    const made = {
      "d-rec-L8a": TemplatesR.realiseSync(tplById["d-rec-L8a"], 123, runPython),
      "d-rec-L10a": TemplatesR.realiseSync(tplById["d-rec-L10a"], 123, runPython),
      "scratch-rec-power": TemplatesR.expand(tplById["scratch-rec-power"], 123),
    };
    // Swaps one function in a program for another version of it (the def line and its indented body).
    const swapDef = (code, name, newDef) => {
      const lines = code.split("\n");
      const start = lines.findIndex((l) => l.startsWith("def " + name + "("));
      let end = start + 1;
      while (end < lines.length && (!lines[end].trim() || /^\s/.test(lines[end]))) end++;
      while (end > start + 1 && !lines[end - 1].trim()) end--;
      return lines.slice(0, start).concat(newDef.split("\n"), lines.slice(end)).join("\n");
    };
    const loopDefs = {
      power_rec: "def power_rec(base, exp):\n    answer = 1\n    for i in range(exp):\n        answer = answer * base\n    return answer",
      biggest: "def biggest(items):\n    best = items[0]\n    for x in items:\n        if x > best:\n            best = x\n    return best",
      power: "def power(base, exp):\n    answer = 1\n    for i in range(exp):\n        answer = answer * base\n    return answer",
    };
    const recDefs = {
      power_rec: "def power_rec(base, exp):\n    return 1 if exp == 0 else base * power_rec(base, exp - 1)",
      biggest: "def biggest(items):\n    if len(items) == 1:\n        return items[0]\n    rest = biggest(items[1:])\n    return items[0] if items[0] > rest else rest",
      power: "def power(b, e):\n    if e == 0:\n        return 1\n    return b * power(b, e - 1)",
    };
    const five = [["rec-L8a", l8, "power_rec"], ["rec-L10a", l10, "biggest"], ["d-rec-L8a", made["d-rec-L8a"], "power_rec"],
      ["d-rec-L10a", made["d-rec-L10a"], "biggest"], ["scratch-rec-power", made["scratch-rec-power"], "power"]];
    const fiveOut = five.map(([base, t, name]) => {
      const loop = judge(t, swapDef(t.solution, name, loopDefs[name]));
      const rec = judge(t, swapDef(t.solution, name, recDefs[name]));
      const sol = judge(t, t.solution);
      return { base, id: t.id, name, found: CheckerR.recursiveFunctions(t.solution).join(), loop, rec, sol };
    });
    const nameMsg = (n) => "Your function " + n + " needs to call itself. Put a call to " + n + " inside its own body.";
    check(CheckerR.RECURSION_TASKS.join() === "rec-L8a,rec-L10a,d-rec-L8a,d-rec-L10a,scratch-rec-power" &&
      fiveOut.map((x) => x.id).join() === "rec-L8a,rec-L10a,d-rec-L8a#123,d-rec-L10a#123,scratch-rec-power#123" &&
      fiveOut.every((x) => x.found === x.name && x.loop.outputsRight && !x.loop.passed && x.loop.message === nameMsg(x.name) &&
        CheckerR.failureParts(x.loop.failure).tryNext === "Find the smallest case that needs no call (the base case) and return it. For every other case, return an answer that uses " + x.name + " on a smaller value."),
      "Recursion tasks: a loop answer prints the right output but fails for all five (rec-L8a, rec-L10a, and suffixed copies such as d-rec-L8a#123, d-rec-L10a#123 and scratch-rec-power#123), naming the function from that task's own model solution (power_rec, biggest, power)");
    check(fiveOut.every((x) => x.rec.passed && x.sol.passed),
      "Recursion tasks: a recursive answer passes for all five (the model solution, and one written differently)");
    const others = tasks.filter((t) => t.id !== "rec-L8a" && t.id !== "rec-L10a");
    const otherTemplates = tplList.filter((t) => !CheckerR.RECURSION_TASKS.includes(t.id));
    check(others.every((t) => CheckerR.recursionProblem(t, "x = 1\nprint(x)") === null && CheckerR.recursionProblem(t, t.solution || "") === null) &&
      otherTemplates.every((t) => CheckerR.recursionProblem({ id: t.id + "#7", solution: t.solution || "" }, "x = 1\nprint(x)") === null) &&
      ["d-rec-L8b", "d-rec-L9a", "d-rec-L10b", "scratch-rec-sum"].every((id) => CheckerR.recursionProblem({ id: id + "#123", solution: (tplById[id] || l8).solution }, l8Loop) === null) &&
      ["xd-rec-L8a#1", "rec-L8a2", "d-rec-L8a-x#1", "rec-L8"].every((id) => CheckerR.recursionProblem({ id, solution: l8.solution }, l8Loop) === null) &&
      CheckerR.recursionProblem(byIdR["rec-L8b"], l8Loop) === null && CheckerR.recursionProblem(null, l8Loop) === null &&
      CheckerR.failureParts(CheckerR.classifyAttempt({ type: "write", code: "print(1)", results: [{ output: "1" }], tests: [{ inputs: [], expected: "1" }], passes: [true] })).message !== msg8,
      "Recursion tasks: every other task is unaffected, including the other d- and scratch- templates (only these five base ids, the part before any #, are checked)");
    const appSrcR = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    check(/const recursion = Checker\.recursionProblem\(t, built\.code\);/.test(appSrcR) && /const allPass = passes\.every\(Boolean\) && !extraProblem;/.test(appSrcR) &&
      (appSrcR.match(/async function check\(\)/g) || []).length === 1 && /recursion: recursion && recursion\.name/.test(appSrcR),
      "Recursion tasks: the check is part of the one Check answer path, so it applies to every pass (practice, the level 10 pass that counts towards the secured score, endless and assignments)");
  }

  // ===================== Deleting an assignment =====================
  // Each assignment has Delete next to Close it. It asks on the page first (never a browser dialog); Cancel changes
  // nothing; Yes deletes the assignment row only (row-level security: the owning teacher, migration 0005).
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const tSrc = read("teacher.js");
    const bSrc = read("teacher-backend.js");
    const m5 = read("supabase/migrations/0005_assignments.sql");
    check(/data-as-status="' \+ esc\(a\.id\)[^\n]*\n\s*'<button type="button" class="secondary" data-as-delete="' \+ esc\(a\.id\) \+ '">Delete<\/button>'/.test(tSrc) &&
      /'<span data-as-confirm="' \+ esc\(a\.id\) \+ '" hidden>Delete this assignment\?/.test(tSrc) && /data-as-delete-yes="' \+ esc\(a\.id\) \+ '">Yes, delete<\/button>/.test(tSrc) &&
      /data-as-delete-no="' \+ esc\(a\.id\) \+ '">Cancel<\/button>/.test(tSrc),
      "Assignments: each one has Delete next to Close it, with a hidden on-page question \"Delete this assignment?\" (Yes, delete / Cancel)");
    // Run the Assignments list's real click handler on a tiny fake page, in a child process (it is async; these
    // checks are not): Delete asks first, Cancel changes nothing, Yes deletes that one assignment.
    const deleteFlow = (root) => {
      const src = require("fs").readFileSync(require("path").join(root, "teacher.js"), "utf8");
      const start = src.indexOf('$("as-list").addEventListener("click", async (e) => {');
      const body = src.slice(src.indexOf("{", src.indexOf("=> {", start)) + 1, src.indexOf("\n  });", start));
      const keyOf = { "data-as-edit": "asEdit", "data-as-status": "asStatus", "data-as-delete": "asDelete", "data-as-delete-no": "asDeleteNo", "data-as-delete-yes": "asDeleteYes", "data-as-confirm": "asConfirm" };
      let focused = null;
      const el = (name, dataset) => ({ name, dataset, hidden: false, disabled: false, focus() { focused = name; },
        closest(sel) { const a = (sel.match(/\[([\w-]+)\]/) || [])[1]; return a && keyOf[a] in this.dataset ? this : null; } });
      const confirmBox = Object.assign(el("question", { asConfirm: "a1" }), { hidden: true });
      const items = { del: el("Delete", { asDelete: "a1" }), no: el("Cancel", { asDeleteNo: "a1" }), yes: el("Yes, delete", { asDeleteYes: "a1" }), confirmBox };
      const notes = [];
      const list = { querySelector(sel) { const [, a, v] = sel.match(/\[([\w-]+)="([^"]+)"\]/) || []; return Object.values(items).find((x) => x.dataset[keyOf[a]] === v) || null; },
        insertAdjacentHTML(_, html) { notes.push(html); }, get firstElementChild() { return { focus() { focused = "notice"; } }; } };
      const calls = [];
      const dialogs = [];
      const tb = { deleteAssignment: async (id) => { calls.push("delete " + id); return {}; }, setAssignmentStatus: async () => { calls.push("status"); return {}; } };
      const handler = new Function("$", "collect", "openAssignmentForm", "tb", "esc", "CSS", "closeAssignmentForm", "editing", "confirm", "alert", "prompt",
        "return async (e) => {" + body + "};")((id) => (id === "as-list" ? list : null), () => ({ assignments: [] }), () => calls.push("edit"), tb, (s) => s,
        { escape: (s) => s }, () => calls.push("close-form"), null, () => dialogs.push("confirm"), () => dialogs.push("alert"), () => dialogs.push("prompt"));
      (async () => {
        const out = {};
        await handler({ target: items.del });
        out.asked = { shown: !confirmBox.hidden, focus: focused, calls: calls.slice() };
        await handler({ target: items.no });
        out.cancelled = { shown: !confirmBox.hidden, focus: focused, calls: calls.slice() };
        await handler({ target: items.del });
        await handler({ target: items.yes });
        out.deleted = { calls: calls.slice(), focus: focused, notes: notes.join("") };
        out.dialogs = dialogs;
        console.log(JSON.stringify(out));
      })();
    };
    const flowOut = require("child_process").execFileSync(process.execPath, ["-e", "(" + deleteFlow.toString() + ")(" + JSON.stringify(ROOT) + ")"], { encoding: "utf8" });
    const flow = JSON.parse(flowOut.trim().split("\n").pop());
    check(flow.asked.shown && flow.asked.focus === "Cancel" && flow.asked.calls.length === 0,
      "Assignments: pressing Delete first shows \"Delete this assignment? Yes, delete / Cancel\" on the page (focus on Cancel) and deletes nothing");
    check(!flow.cancelled.shown && flow.cancelled.focus === "Delete" && flow.cancelled.calls.length === 0 &&
      flow.deleted.calls.join() === "delete a1" && flow.deleted.focus === "notice" && /has been deleted/.test(flow.deleted.notes) && flow.dialogs.length === 0,
      "Assignments: Cancel hides the question and changes nothing; Yes, delete deletes that one assignment, says so and moves focus to the message; no browser dialog is opened");
    check(!/\b(confirm|alert|prompt)\(/.test(tSrc + bSrc), "Assignments: Delete never uses a browser dialog (no confirm, alert or prompt)");
    check(/async deleteAssignment\(id\) \{\s*const r = await sb\.from\("assignments"\)\.delete\(\)\.eq\("id", id\)\.select\("id"\);/.test(bSrc) &&
      !/from\("(attempts|progress|passed_tasks|events|students)"\)\.delete/.test(bSrc.slice(bSrc.indexOf("async deleteAssignment"), bSrc.indexOf("currentClass:"))) &&
      /grant select, delete, insert/.test(m5) && /create policy "teacher deletes own assignments" on public\.assignments for delete to authenticated\s*using \(class_id in \(select private\.my_class_ids\(\)\)\)/.test(m5) &&
      /assignment_id uuid references public\.assignments \(id\) on delete set null/.test(m5) && /\.eq\("status", "open"\)/.test(read("supabase/functions/student-api/index.ts")),
      "Assignments: Delete removes only the assignment row (the owning teacher, by row-level security); attempts on it are kept (assignment_id set to null), and students only ever get existing open assignments");
  }

  // ===================== No test mode for students =====================
  // ?test=1 used to show a starting-level control on the student's home page (set a level, mark a unit completed).
  // Now no student page, and no script a student page loads, reads a test flag from the address, so ?test=1 changes
  // nothing and shows nothing. Teacher practice (?preview=) is unchanged (its own checks are below).
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const studentPages = ["index.html", "app.html", "practice.html", "progress.html", "endless.html"];
    const scriptsOf = (html) => [...html.matchAll(/<script src="([^":]+)"><\/script>/g)].map((m) => m[1]).filter((s) => fs.existsSync(path.join(ROOT, s)));
    const scripts = [...new Set(studentPages.flatMap((p) => scriptsOf(read(p))))];
    const src = scripts.map((s) => [s, read(s)]);
    const paramsRead = [...new Set(src.flatMap(([, t]) => [...t.matchAll(/(?:params|URLSearchParams\([^)]*\))\.(?:get|has)\("([\w-]+)"\)/g)].map((m) => m[1])))].sort();
    check(scripts.includes("home.js") && scripts.includes("app.js") && scripts.includes("tour.js") &&
      src.every(([, t]) => !/(?:get|has)\("test"\)|[?&]test=1|testMode/.test(t)) && paramsRead.join() === "assignment,mode,preview,unit,units" &&
      studentPages.every((p) => !/test-panel|test-set|test-complete|test-level|test-unit|Test mode/.test(read(p))) &&
      !/reason: "test-mode/.test(read("home.js")) && !/completedTop: true/.test(read("home.js")) && !/saveProgress/.test(read("home.js")) && !/\.test-panel/.test(read("styles.css")),
      "Student pages: ?test=1 does nothing (no script reads a test flag, so no level is set, no unit is marked completed and no test controls are shown); the address is only read for preview, assignment, mode, unit and units");
  }

  // ===================== Unique ids on every page =====================
  // Each page's own ids, and the ids the scripts add to it later (the practice page's task card from app.js, the
  // teacher view's from teacher.js): none may appear twice, or the wrong element answers a click or a lookup.
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const idsOf = (html) => [...html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const twice = (ids) => [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
    const pages = ["index.html", "app.html", "practice.html", "progress.html", "endless.html", "teacher.html"];
    const dups = pages.map((p) => [p, twice(idsOf(read(p)))]).filter(([, d]) => d.length);
    const appSrc = read("app.js");
    const added = (src) => [...new Set([...src.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]))];
    const practiceClash = added(appSrc.slice(appSrc.indexOf("// ===================== Browser app"))).filter((id) => idsOf(read("practice.html")).includes(id));
    const teacherClash = added(read("teacher.js")).filter((id) => idsOf(read("teacher.html")).includes(id));
    check(!dups.length && !practiceClash.length && !teacherClash.length,
      "No id appears twice on any student or teacher page, counting the ids the scripts add (task card, teacher view)" +
      (dups.length || practiceClash.length || teacherClash.length ? ": " + JSON.stringify({ dups, practiceClash, teacherClash }) : ""));
    check(/id="reset-progress-btn" class="secondary">Reset my progress in this unit<\/button>/.test(read("practice.html")) &&
      /\$\("reset-progress-btn"\)\.addEventListener\("click", \(\) => \{ \$\("reset-confirm"\)\.hidden = false; \$\("reset-yes"\)\.focus\(\); \}\);/.test(appSrc) &&
      /\$\("reset-confirm"\)\.hidden = true; \$\("reset-progress-btn"\)\.focus\(\);/.test(appSrc) &&
      /'<button type="button" id="reset-btn" class="secondary"><\/button>'/.test(appSrc) && /\$\("reset-btn"\)\.addEventListener\("click", resetTask\);/.test(appSrc),
      "Practice page: \"Reset my progress in this unit\" is reset-progress-btn (Cancel gives focus back to it), and the task's \"Reset this task\" keeps reset-btn");
  }

  // ===================== Tutorial overlay (tour.js) =====================
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const tourSrc = read("tour.js");
    // A fresh copy of tour.js each time (it remembers, per page load, that the home page has been handled).
    const loadTour = () => { const m = { exports: {} }; require("vm").runInNewContext(tourSrc, { module: m, URLSearchParams, console }); return m.exports; };
    const Tour = loadTour();
    const App = require(path.join(ROOT, "app.js"));
    const SecuredT = require(path.join(ROOT, "secured.js"));
    // A tiny page: elements with classes, children, clicks and focus, and the document's keydown listeners.
    const fakeDoc = () => {
      const listeners = {};
      const doc = { activeElement: null, targets: {}, byId: {},
        createElement: (tag) => mkEl(tag),
        querySelectorAll(sel) { return this.targets[sel] ? [this.targets[sel]] : []; },
        querySelector(sel) { return this.targets[sel] || null; },
        getElementById(id) { return this.byId[id] || null; },
        addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
        removeEventListener(t, f) { listeners[t] = (listeners[t] || []).filter((x) => x !== f); },
        key(k, target) { (listeners.keydown || []).slice().forEach((f) => f({ key: k, target: target || doc.activeElement, preventDefault() {} })); },
        listeners };
      function mkEl(tag) {
        const classes = new Set();
        const el = { tagName: tag, children: [], parent: null, attrs: {}, hidden: false, disabled: false, textContent: "", className: "", id: "", dataset: {}, handlers: {},
          classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
          setAttribute(n, v) { this.attrs[n] = v; }, appendChild(c) { c.parent = this; this.children.push(c); return c; },
          remove() { if (this.parent) { this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; } },
          addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); },
          click() { if (!this.disabled) (this.handlers.click || []).forEach((f) => f({ target: this, preventDefault() {} })); },
          focus() { doc.activeElement = this; },
          contains(x) { for (let n = x; n; n = n.parent) if (n === this) return true; return false; },
          getClientRects() { return this.hidden ? [] : [1]; }, scrollIntoView() { this.scrolled = (this.scrolled || 0) + 1; } };
        return el;
      }
      doc.body = mkEl("body");
      return doc;
    };
    const cardOf = (doc) => doc.body.children.find((c) => c.className === "tour-card");
    const buttonsOf = (card) => { const row = card.children.find((c) => c.className === "tour-buttons"); return { back: row.children[0], next: row.children[1], skip: row.children[2] }; };
    const titleOf = (card) => card.children.find((c) => c.className === "tour-title").textContent;

    // 1. The new-student steps, in order, in short plain sentences, matching what the app does.
    const ids = Tour.STEPS.map((s) => s.id).join();
    const sentences = (t) => (t.match(/[.!?](\s|$)/g) || []).length;
    const both = Tour.stepsFor(true).concat(Tour.stepsFor(false));
    check(ids === "join,placement,unit-card,task-view,check-run,hints,show-how,level-buttons,freshness,progress,help" &&
      /class code/.test(Tour.stepsFor(true)[0].text) && /8-digit code and 4-digit PIN/.test(Tour.stepsFor(true)[0].text) &&
      /choosing a unit/.test(Tour.stepsFor(false)[0].text) && Tour.stepsFor(false)[0].targets[0] === "#unit-list" &&
      both.every((s) => sentences(s.text) >= 2 && sentences(s.text) <= 3 && !/[\n•;]| - /.test(s.text) && s.title && s.targets.length),
      "Tutorial: the walkthrough's 11 steps, in order (joining a class, or in local mode choosing a unit, then placement, the unit card, the task, Run and Check, hints, Show me how, the level buttons, freshness, My progress, Help), each two or three short sentences, never a list");
    const text = (id) => Tour.STEPS.find((s) => s.id === id).text;
    const maxHints = Math.max(...tasks.map((t) => (t.hints || []).length));
    check(/four questions/.test(text("placement")) && App.PLACEMENT_LEVELS.length === 4 && /once in each unit/.test(text("placement")) &&
      /up to three/.test(text("hints")) && maxHints === 3 && /but not towards your score\./.test(text("hints")) &&
      /After two failed tries/.test(text("show-how")) && App.SHOW_HOW_AFTER_FAILS === 2 && /doesn't count towards your score\./.test(text("show-how")) &&
      /up one level/.test(text("level-buttons")) && /down one level/.test(text("level-buttons")) && App.BUTTON_JUMP_LEVELS === 1 &&
      /two programs with no hints/.test(text("freshness")) && /After a week it drops to 90%, then 10 points more each week, down to 50%/.test(text("freshness")) &&
      SecuredT.DROP_PER_WEEK === 10 && SecuredT.FLOOR_START === 50 && SecuredT.PASSES_TO_SECURE === 2 &&
      ["#student-area", "#unit-list", "#unit-colour-key", 'href="progress.html"', 'id="tour-help"'].every((x) => read("app.html").includes(x.replace(/^#/, 'id="').replace(/^id="(.*)$/, (m, v) => v.includes('"') ? m : 'id="' + v + '"'))) &&
      ["#check-btn", "#hint-btn", "#show-how-btn", "level-buttons", "task-body", '"actions"'].every((x) => read("app.js").includes(x.replace(/^#/, 'id="').replace(/^(id="[\w-]+)$/, '$1"'))),
      "Tutorial: what each step says matches the app (4 placement questions, up to 3 hints, Show me how after 2 fails, one level per button, two level 10 passes, 10 points a week down to 50%), and every control it points at exists");

    // 2. The walkthrough runs in order, points at the controls on this screen, and says where the others are.
    const doc1 = fakeDoc();
    const unitList = doc1.createElement("div"); doc1.targets["#unit-list .unit-card"] = unitList;
    const editor = doc1.body.appendChild(doc1.createElement("textarea")); editor.focus();
    let closed = null;
    const t1 = Tour.run({ doc: doc1, steps: Tour.stepsFor(true), onClose: (reason, i) => { closed = { reason, i }; }, elsewhere: "Elsewhere." });
    const seen = [];
    for (let k = 0; k < 11; k++) { seen.push(titleOf(t1.card)); if (k === 2) var ringed = unitList.classList.contains("tour-target") && unitList.scrolled === 1; if (k < 10) buttonsOf(t1.card).next.click(); }
    const lastLabel = buttonsOf(t1.card).next.textContent;
    buttonsOf(t1.card).next.click();
    check(seen.join("|") === Tour.stepsFor(true).map((s) => s.title).join("|") && ringed && lastLabel === "Finish" && closed && closed.reason === "finished" && !cardOf(doc1) &&
      doc1.activeElement === editor && !unitList.classList.contains("tour-target"),
      "Tutorial: the steps come one at a time in order, the control a step is about is scrolled to and ringed, and Finish closes it");
    // 3. Skip at any step, and Escape, close it and leave nothing behind (nothing over the editor or Check my answer).
    const skipOk = Tour.stepsFor(true).map((_, k) => {
      const d = fakeDoc();
      const check = d.createElement("button"); d.targets["#task .actions"] = check;
      const ed = d.body.appendChild(d.createElement("textarea")); ed.focus();
      let r = null;
      const t = Tour.run({ doc: d, steps: Tour.stepsFor(true), onClose: (reason, i) => { r = { reason, i }; } });
      for (let n = 0; n < k; n++) t.next();
      buttonsOf(t.card).skip.click();
      return r && r.reason === "skipped" && r.i === k && !cardOf(d) && !d.body.classList.contains("tour-open") && !check.classList.contains("tour-target") &&
        (d.listeners.keydown || []).length === 0 && d.activeElement === ed && !t.isOpen();
    });
    const d2 = fakeDoc();
    let esc = null;
    const t2 = Tour.run({ doc: d2, steps: Tour.stepsFor(false), onClose: (reason) => { esc = reason; } });
    t2.next();
    d2.key("ArrowLeft", t2.card.children[1]);
    const backed = t2.index() === 0;
    d2.key("Escape");
    check(skipOk.every(Boolean) && backed && esc === "escape" && !cardOf(d2) && (d2.listeners.keydown || []).length === 0,
      "Tutorial: Skip closes it at any of the 11 steps, Escape closes it, the arrow keys move between steps, and once closed nothing is left on the page (no card, no ring, no key handler; focus goes back, so the editor and Check my answer are free)");
    const css = read("styles.css");
    check(/\.tour-card \{[^}]*position: fixed;[^}]*left: 16px; right: 16px;[^}]*box-sizing: border-box;[^}]*max-width: 28rem;[^}]*max-height: 50vh; overflow: auto;/.test(css) &&
      !/tour-backdrop|inert/.test(tourSrc + css) && /body\.tour-open \{ padding-bottom: 55vh; \}/.test(css) && /\.tour-target \{[^}]*scroll-margin-top/.test(css),
      "Tutorial: a card fixed to the bottom with a 16px gap (no sideways scrolling at phone width, at most 28rem wide on a wide screen), never a backdrop over the page; the page gets room so a control can always be scrolled above it");

    // 4. Reminders for returning students: only when something is new, once per thing.
    const ctx = (o) => Object.assign({ backend: true, units: [{ id: "maths", title: "Maths" }, { id: "selection", title: "Selection" }], started: ["maths"], placing: [], assignments: [], bands: {} }, o);
    const first = Tour.planHome(null, ctx({ started: [] }), true);
    const again = Tour.planHome(first.state, ctx({ started: [] }), true);
    const returning = Tour.planHome(null, ctx({ placing: ["maths"], assignments: [{ id: "a1", title: "Loops" }], bands: { maths: { cls: "gold", label: "Secured", score: 100 } } }), true);
    check(first.walkthrough && first.state.taskTour === false && !first.reminders.length && !again.walkthrough && !again.reminders.length &&
      !returning.walkthrough && !returning.reminders.length && returning.state.taskTour === true,
      "Tutorial: a new student (nothing started) gets the walkthrough once; a student who has started a unit gets no walkthrough, and what is there already counts as seen");
    const s0 = returning.state;
    const withNew = Tour.planHome(s0, ctx({ placing: ["maths"], assignments: [{ id: "a1", title: "Loops" }, { id: "a2", title: "Lists" }], bands: { maths: { cls: "gold", label: "Secured", score: 100 } } }), true);
    const sameAgain = Tour.planHome(withNew.state, ctx({ placing: ["maths"], assignments: [{ id: "a1", title: "Loops" }, { id: "a2", title: "Lists" }], bands: { maths: { cls: "gold", label: "Secured", score: 100 } } }), true);
    const dropped = Tour.planHome(sameAgain.state, ctx({ assignments: [{ id: "a2", title: "Lists" }], bands: { maths: { cls: "fading", label: "Fading", score: 85 } } }), true);
    const stillFading = Tour.planHome(dropped.state, ctx({ bands: { maths: { cls: "fading", label: "Fading", score: 85 } } }), true);
    const newUnit = Tour.planHome(stillFading.state, ctx({ units: [{ id: "maths", title: "Maths" }, { id: "selection", title: "Selection" }, { id: "recursion", title: "Recursion" }], bands: { maths: { cls: "fading", label: "Fading", score: 85 } } }), true);
    const placingNew = Tour.planHome(newUnit.state, ctx({ placing: ["selection"], started: ["maths", "selection"] }), true);
    const placingAgain = Tour.planHome(placingNew.state, ctx({ placing: ["selection"], started: ["maths", "selection"] }), true);
    check(withNew.reminders.map((r) => r.key).join() === "assignment:a2" && /new assignment: Lists\./.test(withNew.reminders[0].text) && withNew.reminders[0].href === "practice.html?assignment=a2" &&
      !sameAgain.reminders.length && dropped.reminders.map((r) => r.key).join() === "band:maths:fading" && /faded to Fading \(85%\)/.test(dropped.reminders[0].text) &&
      !stillFading.reminders.length && newUnit.reminders.map((r) => r.key).join() === "unit:recursion" && placingNew.reminders.map((r) => r.key).join() === "placement:selection" &&
      !placingAgain.reminders.length && [withNew, dropped, newUnit, placingNew].every((p) => p.reminders.every((r) => r.go && r.href && sentences(r.text) <= 2)),
      "Tutorial: a reminder (one or two sentences, with a link to the thing) only for something new: a new assignment, a drop to a new freshness band, a new unit, a unit whose quick check isn't done; each one once, never on every visit");
    const recovered = Tour.planHome(stillFading.state, ctx({ bands: { maths: { cls: "gold", label: "Secured", score: 100 } } }), true);
    const droppedAgain = Tour.planHome(recovered.state, ctx({ bands: { maths: { cls: "fading", label: "Fading", score: 90 } } }), true);
    const lots = Tour.planHome(s0, ctx({ assignments: [1, 2, 3, 4, 5].map((n) => ({ id: "x" + n, title: "Set " + n })) }), true);
    const rest = Tour.planHome(lots.state, ctx({ assignments: [1, 2, 3, 4, 5].map((n) => ({ id: "x" + n, title: "Set " + n })) }), true);
    check(!recovered.reminders.length && droppedAgain.reminders.map((r) => r.key).join() === "band:maths:fading" && lots.reminders.length === Tour.MAX_REMINDERS && rest.reminders.length === 2 &&
      !Tour.planHome(rest.state, ctx({ assignments: [1, 2, 3, 4, 5].map((n) => ({ id: "x" + n, title: "Set " + n })) }), true).reminders.length,
      "Tutorial: going back up to 100% shows nothing, and a later drop is reminded again; at most 3 reminders at once, the others on the next visit");
    const d3 = fakeDoc();
    const host = d3.createElement("div"); host.hidden = true; host.querySelector = () => host.children.find((c) => /tour-reminder/.test(c.className)) || null;
    Tour.showReminders(d3, host, withNew.reminders);
    const box = host.children[0];
    const goLink = box.children[1].children[0], dismiss = box.children[1].children[1];
    const shownOk = !host.hidden && goLink.href === "practice.html?assignment=a2" && dismiss.textContent === "Dismiss" && box.attrs.role === "status";
    dismiss.click();
    check(shownOk && host.children.length === 0 && host.hidden && /id="tour-reminders" class="tour-reminders" hidden/.test(read("app.html")),
      "Tutorial: each reminder sits above the unit cards (not over the page) with a button to go to it and Dismiss");

    // 5. Help opens the walkthrough from step 1 again (home page and My progress), and the task view's steps next time.
    const restarted = Tour.restartState(stillFading.state);
    check(Tour.helpRequested("#help") && !Tour.helpRequested("#join") && restarted.walkthrough === true && restarted.taskTour === false && restarted.shown.length === stillFading.state.shown.length &&
      /<a href="#help" id="tour-help" class="menu-link">Help<\/a>/.test(read("app.html")) && /<a href="app\.html#help" id="tour-help" class="menu-link">/.test(read("progress.html")) &&
      /if \(helpRequested\(win\.location\.hash\)\)/.test(tourSrc) && /help\.addEventListener\("click", \(e\) => \{ e\.preventDefault\(\); startWalkthrough/.test(tourSrc) &&
      /run\(\{ doc: win\.document, steps: stepsFor\(ctx\.backend\)/.test(tourSrc) && !/start: /.test(tourSrc.slice(tourSrc.indexOf("function startWalkthrough"))),
      "Tutorial: Help on the home page and on My progress (app.html#help) opens the walkthrough from step 1 again, and shows the task view's steps on the next task");
    // A Help press while it is open starts it again (one overlay at a time).
    const d4 = fakeDoc();
    const a = Tour.run({ doc: d4, steps: Tour.stepsFor(true) });
    a.next(); a.next();
    const b = Tour.run({ doc: d4, steps: Tour.stepsFor(true) });
    check(!a.isOpen() && b.isOpen() && b.index() === 0 && d4.body.children.filter((c) => c.className === "tour-card").length === 1,
      "Tutorial: opening it again while it is open starts from step 1, with only one overlay");

    // 6. Never on the teacher pages, or inside them (teacher practice frames practice.html?preview=<id>).
    const win = (pathname, search, framed) => { const w = { location: { pathname, search: search || "", hash: "" } }; w.parent = framed ? {} : w; return w; };
    // The teacher page loads tour.js only for its overlay, under the teacher tour (teacher-tour.js, prompt 23): the student
    // tutorial itself still never runs there (Tour.allowed), and the teacher page never calls Tour.home or Tour.task.
    check(/<script src="tour\.js"><\/script>\s*<script src="teacher-tour\.js"><\/script>/.test(read("teacher.html")) && !/Tour\.(home|task)\(/.test(read("teacher.js") + read("teacher-tour.js")) &&
      !Tour.allowed(win("/pythonpractices/teacher.html")) && !Tour.allowed(win("/practice.html", "?preview=var-L9d")) &&
      !Tour.allowed(win("/practice.html", "", true)) && Tour.allowed(win("/app.html")) && Tour.allowed(win("/practice.html", "?unit=maths")) &&
      /<script src="tour\.js"><\/script>\s*<script src="collapse\.js"><\/script>\s*<script src="home\.js">/.test(read("app.html")) && /<script src="app\.js"><\/script>\s*<script src="tour\.js"><\/script>/.test(read("practice.html")),
      "Tutorial: the student pages load it; it never runs on the teacher pages (which load tour.js only for the teacher tour's overlay), in teacher practice or in a frame");

    // 7. Storage blocked: nothing throws, nothing opens by itself (it couldn't be remembered), and the app still works.
    const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
    const winBlocked = Object.assign(win("/app.html"), { document: fakeDoc(), history: { replaceState() {} } });
    Object.defineProperty(winBlocked, "localStorage", { get() { throw new Error("blocked"); } });
    const T2 = loadTour();
    let threw = false;
    try { T2.home(ctx({ started: [], studentId: "s1" }), winBlocked); } catch (e) { threw = true; }
    check(!threw && Tour.getStorage(winBlocked) === null && !Tour.storageWorks(blocked) && Tour.load(blocked, "s1") === null && Tour.save(blocked, "s1", {}) === false &&
      Tour.planHome(null, ctx({ started: [] }), false).walkthrough === false && !cardOf(winBlocked.document) && /if \(ok\) save\(storage/.test(tourSrc),
      "Tutorial: with storage blocked nothing throws and nothing opens by itself (Help still opens the walkthrough); the seen state is kept in this browser only, with every storage error caught");
    // The same with working storage: the first visit opens the walkthrough, the next one doesn't.
    const mem = {};
    const okStore = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
    const winOk = () => Object.assign(win("/app.html"), { document: fakeDoc(), history: { replaceState() {} }, localStorage: okStore });
    const w1 = winOk(), w2 = winOk();
    loadTour().home(ctx({ started: [], studentId: "s9" }), w1);
    loadTour().home(ctx({ started: [], studentId: "s9" }), w2);
    check(cardOf(w1.document) && !cardOf(w2.document) && JSON.parse(mem["pythonPractice.tutorial.s9"]).walkthrough === true &&
      /if \(self\.Tour\) self\.Tour\.home\(\{/.test(read("home.js")) && /bands: bandsShown/.test(read("home.js")),
      "Tutorial: the first visit of a new student opens the walkthrough, the next visit doesn't (remembered per student in this browser); home.js hands it the units, placements, assignments and freshness bands");
  }

  // ===================== Teacher area: pages, secured score, stages and teacher practice =====================
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const Secured = require(path.join(ROOT, "secured.js"));
    const teacher = read("teacher.html");
    const teacherSrc = read("teacher.js");
    const backendSrc = read("teacher-backend.js");

    // The side menu, in order, with Students as the default page; old addresses still open the right page.
    const nav = [...teacher.matchAll(/<a href="#(\w+)" data-page="\w+"( data-backend)?>([^<]+)<\/a>/g)].map((m) => m[3]);
    check(nav.join() === "Students,Homework,Assignments,Misconceptions,Leaderboards,Certificates,Reports,Task browser,Classes,Curriculum,Settings" && !/tab-nav/.test(teacher) &&
      ["classes", "students", "leaderboards", "certificates", "homework", "student", "assignments", "reports", "misconceptions", "tasks", "curriculum", "settings"].every((p) => teacher.includes('id="page-' + p + '"')) &&
      /\["students", null\]/.test(teacherSrc) && /overview: "students", log: "reports", workshop: "misconceptions"/.test(teacherSrc) && /"#students"\)/.test(backendSrc),
      "Teacher view: a side menu (Students, Homework, Assignments, Misconceptions, Leaderboards, Certificates, Reports, Task browser, Classes, Curriculum (prompt 28), Settings; the order since review finding L1) replaces the tabs; Students is the default page, and #overview, #log and #workshop still open Students, Reports or Misconceptions");

    // The Misconceptions page (the workshop, moved from Reports).
    const pageOf = (id) => { const i = teacher.indexOf('<section id="page-' + id + '"'); return teacher.slice(i, teacher.indexOf("<!-- =====", i + 10)); };
    const mcPage = pageOf("misconceptions"), reportsPage = pageOf("reports");
    check(/<a href="#assignments" data-page="assignments" data-backend>Assignments<\/a>\s*<a href="#misconceptions" data-page="misconceptions">Misconceptions<\/a>\s*<a href="#leaderboards"/.test(teacher) &&
      /const PAGES = \[[^\]]*"reports", "misconceptions", "tasks"/.test(teacherSrc) && /else if \(p === "misconceptions"\) renderMisconceptions\(data\);/.test(teacherSrc),
      "Misconceptions: its own side menu item, between Assignments and Leaderboards since review finding L1 (#misconceptions)");
    // The old address: route() maps #workshop to the new page (run on its own).
    const routeSrc = teacherSrc.slice(teacherSrc.indexOf("const route = () =>"), teacherSrc.indexOf("const page = () =>"));
    const routeFor = (hash) => new Function("location", "PAGES", "OLD_PAGES", routeSrc + "; return route();")({ hash },
      JSON.parse(teacherSrc.match(/const PAGES = (\[[^\]]*\])/)[1]), { overview: "students", log: "reports", workshop: "misconceptions" });
    check(routeFor("#workshop")[0] === "misconceptions" && routeFor("#misconceptions")[0] === "misconceptions" && routeFor("#log")[0] === "reports" && routeFor("#nothing")[0] === "students",
      "Misconceptions: the old workshop address (#workshop) opens the new page; #log still opens Reports");
    check(/if \(mcUnit !== "all" && !unitIds\.includes\(mcUnit\)\) mcUnit = "all";/.test(teacherSrc) && /let mcUnit = null;/.test(teacherSrc) && /const stageUnitIds = \(\) => self\.Curriculum\.stageUnits\(stage\(\)\);/.test(teacherSrc) &&
      /function renderMisconceptions\(data\) \{\s*const unitIds = stageUnitIds\(\);/.test(teacherSrc) && /<option value="all">All units<\/option>/.test(teacherSrc) &&
      ["ks3", "gcse", "a-level"].every((st) => Curriculum.stageUnits(st).length > 0) && /<select id="mc-unit">/.test(mcPage),
      "Misconceptions: the unit picker lists the class's stage's units, then All units (the class-wide list), which it opens on since review finding L7");
    const mcAttempt = (result, dt, extra) => Object.assign({ kind: "attempt", result, hints: 0, phase: "practice", taskLevel: 6, at: new Date(Date.parse("2026-01-05T09:00:00Z") + dt).toISOString() }, extra);
    const mcData = { students: { a: { name: "Ann" }, b: { name: "Bo" } }, levelLog: [], buttonLog: [], progress: {}, attempts: [
      mcAttempt("fail", 0, { studentId: "a", taskId: "if-L6a", unit: "selection", category: "WRONG_OUTPUT", misconceptions: ["M1"] }), mcAttempt("fail", 3600000, { studentId: "b", taskId: "if-L6a", unit: "selection", category: "WRONG_OUTPUT" }),
      mcAttempt("pass", 7200000, { studentId: "a", taskId: "if-L6a", unit: "selection" }), mcAttempt("fail", 0, { studentId: "a", taskId: "if-L5a", unit: "selection", category: "SYNTAX" }),
      mcAttempt("fail", 0, { studentId: "z", taskId: "if-L6a", unit: "selection" }), mcAttempt("fail", 0, { studentId: "z", taskId: "if-L9a", unit: "selection" }), // z isn't in this class
      mcAttempt("fail", 0, { studentId: "a", taskId: "maths-L3a", unit: "maths" })] };
    const mf = TD.mostFailedTasks(mcData, "selection");
    check(mf.map((t) => t.taskId).join() === "if-L6a,if-L5a" && mf[0].fails === 2 && mf[0].attempts === 3 && Math.round(mf[0].failRate * 100) === 67 && mf[0].topCategory === "WRONG_OUTPUT" &&
      mf[0].topMisconception === "M1" && mf[1].topMisconception === "" && TD.mostFailedTasks(mcData, "maths").length === 1 && TD.mostFailedTasks(mcData, null).length === 3 &&
      TD.mostFailedTasks(mcData, "loops-count").length === 0,
      "Misconceptions: the most-failed list counts only this class's students and the chosen unit, with failed out of total attempts, the rate, the top failure type and misconception");
    const mcSrc = teacherSrc.slice(teacherSrc.indexOf("function renderMisconceptions("), teacherSrc.indexOf('$("mc-unit").addEventListener'));
    check(/'<tr><th scope="row">' \+ taskLink\(t\.taskId\)/.test(mcSrc) && /t\.fails \+ " of " \+ t\.attempts/.test(mcSrc) && /"none matched"/.test(mcSrc) &&
      /No failed attempts in ' \+ esc\(where\) \+ " yet\./.test(mcSrc) && /href="#tasks=' \+ encodeURIComponent\(tasksById\[id\]\.id\)/.test(teacherSrc) &&
      /if \(p === "tasks"\) renderTaskBrowser\(arg\);/.test(teacherSrc) && (mcSrc.match(/taskLink\(/g) || []).length >= 3,
      "Misconceptions: each task name (most-failed, misconception table, unmatched table) opens that task in the Task browser, ready to try; a unit with no failed attempts says so");
    check(["mc-failed", "ws-misconceptions", "ws-tasks", "ws-unmatched", "ws-unseen"].every((id) => mcPage.includes('id="' + id + '"')) &&
      !/id="(ws-|quick-look|mc-)/.test(reportsPage) && !/<a href="#misconceptions">/.test(reportsPage) && reportsPage.includes('id="export-workshop"') && /the Misconceptions page/.test(reportsPage) &&
      /data-unmatched="' \+ esc\(t\.taskId\) \+ '">View ' \+ t\.unmatched/.test(mcSrc) && /\$\("ws-tasks"\)\.addEventListener\("click"/.test(teacherSrc) &&
      /<th scope="col">Students<\/th>/.test(mcPage) && /m\.studentNames\.join\(", "\)/.test(mcSrc) && /unseen\.map\(\(m\) => "<li>" \+ esc\(m\.name\)/.test(mcSrc),
      "Misconceptions: the misconception table (with its Students column), the unmatched table with View, and the not-matched-yet list are on the new page; Reports keeps the workshop export, which says it is the Misconceptions page's tables (the link line was removed, review finding S12)");
    const wsExport = teacherSrc.slice(teacherSrc.indexOf('"export-workshop": {'), teacherSrc.indexOf('"export-workshop": {') + 600) +
      teacherSrc.slice(teacherSrc.indexOf("function workshopCsv(data)"), teacherSrc.indexOf("function workshopCsv(data)") + 600);
    const wsOut = TD.workshop(mcData, [{ id: "M1", name: "Mistake one" }], {});
    check(/TD\.workshop\(data, misconceptions, tasksById[,)]/.test(wsExport) && /python-practice-workshop-/.test(wsExport) &&
      wsOut.misconceptions.length === 1 && wsOut.misconceptions[0].name === "Mistake one" && wsOut.tasks.some((t) => t.taskId === "if-L6a" && t.unmatched === 2),
      "Reports: the Workshop tables (CSV) export still builds the misconception and unmatched tables");

    // The secured score: worked examples (one place, secured.js).
    const D = Date.parse("2026-01-05T09:00:00Z"), W = Secured.WEEK_MS, H = 3600000;
    const pass = (t, extra) => Object.assign({ kind: "attempt", result: "pass", hints: 0, unit: "selection", phase: "practice", taskLevel: 10, at: new Date(t).toISOString() }, extra || {});
    const two = [pass(D), pass(D + H)];
    const s = (list, at) => Secured.score(list, "selection", at);
    const back = two.concat([pass(D + H + 2 * W + 60000)]);
    // Back to 100% six more times, each after four weeks away: the floor goes 50, 60, 70, 80, 90, then 100 after the
    // fifth return; at 100% the sixth pass isn't a return (the score never dropped).
    let many = two.slice();
    for (let k = 1; k <= 6; k++) many = many.concat([pass(D + H + k * 4 * W)]);
    check(s(two, D + 2 * H).score === 100 && s(two, D + 2 * H).secured && s([pass(D)], D + H).score === null && !s([pass(D)], D + H).secured,
      "Secured score: two level 10 passes with no hints give 100% (one isn't enough)");
    check(s(two, D + H + 2 * W).score === 80 && s(two, D + H + W).score === 90 && s(two, D + H + W - 1).score === 100 && Secured.DROP_PER_WEEK === 10,
      "Secured score: it drops in weekly steps of 10 points, so it is 90% after one week and 80% after two");
    // Worked examples: days after the last qualifying pass (counted in full days), with the first floor of 50%.
    const DAY = Secured.DAY_MS;
    const afterDays = [0, 6, 8, 15, 22, 29, 36, 60].map((d) => d + ":" + s(two, D + H + d * DAY).score).join(",");
    const edges = [[7 * DAY - 1, 100], [7 * DAY, 90], [14 * DAY - 1, 90], [14 * DAY, 80], [21 * DAY, 70], [28 * DAY, 60], [35 * DAY - 1, 60], [35 * DAY, 50]];
    check(afterDays === "0:100,6:100,8:90,15:80,22:70,29:60,36:50,60:50" && edges.every(([dt, want]) => s(two, D + H + dt).score === want),
      "Secured score: 100% for 0 to 7 days, 90% for 7 to 14, 80% for 14 to 21, 70% for 21 to 28, 60% for 28 to 35, then 50% (the floor), counted in full days from the last pass");
    // With a higher floor the steps stop at it: after one return the floor is 60%, so 36 and 60 days give 60%.
    const backAt = D + H + 2 * W + 60000;
    check([0, 8, 15, 22, 29, 36, 60].map((d) => s(back, backAt + d * DAY).score).join() === "100,90,80,70,60,60,60" &&
      s(two.concat([pass(D + H + 3 * DAY)]), D + H + 3 * DAY + 8 * DAY).score === 90 && s(two.concat([pass(D + H + 3 * DAY)]), D + H + 3 * DAY + 8 * DAY).timesAt100 === 1,
      "Secured score: the steps are counted from the most recent qualifying pass, and stop at a higher floor after a return (60%: 36 and 60 days give 60%)");
    check(s(back, D + H + 2 * W + 120000).score === 100 && s(back, D + H + 2 * W + 120000).floor === 60,
      "Secured score: one level 10 pass with no hints brings it back to 100%, and raises the floor");
    check(s(two, D + 30 * W).score === 50 && s(two, D + 30 * W).floor === 50 && s(back, D + 40 * W).score === 60 &&
      s(many, D + 80 * W).floor === 100 && s(many, D + 80 * W).score === 100 && s(many, D + 80 * W).timesAt100 === 6 && Secured.FLOOR_CAP === 100,
      "Secured score: the floor is 50% at first, 60% after coming back once, and at most 100%");
    // The return floor, return by return: each return after two weeks away (when the score is 80%, or the floor).
    let hist = two.slice();
    const floors = [s(hist, D + 2 * H).floor];
    for (let k = 1; k <= 6; k++) { hist = hist.concat([pass(D + H + k * 2 * W + 60000)]); floors.push(s(hist, D + H + k * 2 * W + 120000).floor); }
    const fifth = two.concat([1, 2, 3, 4, 5].map((k) => pass(D + H + k * 2 * W + 60000)));
    const fourth = two.concat([1, 2, 3, 4].map((k) => pass(D + H + k * 2 * W + 60000)));
    const afterFifth = D + H + 10 * W + 60000;
    check(floors.join() === "50,60,70,80,90,100,100" && s(fifth, afterFifth + 60 * DAY).score === 100 && s(fifth, afterFifth + 365 * DAY).score === 100 &&
      s(fifth, afterFifth).timesAt100 === 6 && s(fourth, D + H + 8 * W + 60000 + 60 * DAY).score === 90,
      "Secured score: the floor goes 50%, 60%, 70%, 80%, 90%, then 100% after the fifth return (and stays there), so the unit no longer drops; after four returns it stops at 90%");
    check(s([pass(D, { hints: 1 }), pass(D + H, { hints: 2 })], D + 2 * H).secured === false && s([pass(D, { phase: "endless", taskLevel: 6 }), pass(D + H, { phase: "endless", taskLevel: 3 })], D + 2 * H).score === 100 &&
      !s([pass(D, { taskLevel: 9 }), pass(D + H, { taskLevel: 9 })], D + 2 * H).secured && !s([pass(D, { phase: "assignment" }), pass(D + H, { phase: "placement" })], D + 2 * H).secured &&
      !s([pass(D), pass(D + H, { unit: "maths" })], D + 2 * H).secured && !s([pass(D), pass(D + H, { result: "fail" })], D + 2 * H).secured,
      "Secured score: only passes with no hints count, in endless mode or at level 10 of the ladder, in that unit (not level 9, placement or assignment passes, or fails)");
    check(s([pass(D), pass(D + H), pass(D + 2 * H)], D + 3 * H).timesAt100 === 1,
      "Secured score: a pass while still at 100% keeps it fresh but isn't a return (the floor doesn't go up)");
    // Ways a secured score could appear too early: each pair of passes, built by hand, must not secure the unit.
    const noHints = (extra) => { const a = pass(D, extra); delete a.hints; return a; };
    const early = {
      "two level 9 practice passes with no hints": [pass(D, { taskLevel: 9 }), pass(D + H, { taskLevel: 9 })],
      "two placement passes at level 10 with no hints": [pass(D, { phase: "placement" }), pass(D + H, { phase: "placement" })],
      "two assignment passes at level 10 with no hints": [pass(D, { phase: "assignment", assignmentId: "x" }), pass(D + H, { phase: "assignment", assignmentId: "x" })],
      "two level 10 passes, one with a hint": [pass(D), pass(D + H, { hints: 1 })],
      "two level 10 passes with the hints field missing": [noHints(), Object.assign(noHints(), { at: new Date(D + H).toISOString() })],
      "two level 10 passes with hints null (a server row with no hints_used)": [pass(D, { hints: null }), pass(D + H, { hints: null })],
      "two level 10 passes with hints as empty text (\"\")": [pass(D, { hints: "" }), pass(D + H, { hints: "" })],
      "two level 10 passes with hints as text (\"0\")": [pass(D, { hints: "0" }), pass(D + H, { hints: "0" })],
      "two level 10 passes with the task level as text (\"10\")": [pass(D, { taskLevel: "10" }), pass(D + H, { taskLevel: "10" })],
    };
    for (const [what, list] of Object.entries(early)) {
      const r = s(list, D + 2 * H);
      const counted = /one with a hint/.test(what) ? 1 : 0; // only the pass with no hints counts
      check(!r.secured && r.score === null && r.passes === counted, "Secured score too early: " + what + " must not secure the unit");
    }
    // The same records as the app makes them and as they come back from the server (backend mode).
    const Rows = require(path.join(ROOT, "backend-rows.js"));
    const made = (level, phase, hints, t) => Object.assign(App.attemptRecord({ task: { id: "t" + level, unit: "selection", level, type: "write" },
      unit: "selection", phase, kind: "attempt", attemptNumber: 1, hints, result: "pass", levelBefore: level, levelAfter: level }), { at: new Date(t).toISOString() });
    const viaServer = (list) => list.map((a) => Rows.rowToAttempt(Object.assign(Rows.attemptToRow(a), { timestamp: a.at }), "s1"));
    const madeEarly = [[9, "practice", 0], [10, "placement", 0], [10, "assignment", 0]].map(([l, p, h]) => [made(l, p, h, D), made(l, p, h, D + H)]);
    const madeTop = [made(10, "practice", 0, D), made(10, "practice", 0, D + H)];
    check(madeEarly.every((list) => !s(list, D + 2 * H).secured && !s(viaServer(list), D + 2 * H).secured) &&
      s(madeTop, D + 2 * H).score === 100 && s(viaServer(madeTop), D + 2 * H).score === 100,
      "Secured score: the app's own attempt records (and the same records after the server round trip) secure only after two level 10 passes with no hints");
    const labels = [100, 90, 80, 70, 60, 50].map((x) => Secured.band(x).label + ":" + Secured.band(x).cls).join();
    const cssAll = read("styles.css");
    const token = (name) => ((cssAll.match(new RegExp("--" + name + ":\\s*(#[0-9a-fA-F]{6})")) || [])[1] || "").toLowerCase();
    check(labels === "Secured:gold,Fresh:fresh,Fading:fading,Revisit soon:soon,Revisit soon:soon,Revisit soon:soon" &&
      [99, 95, 90].every((x) => Secured.band(x).label === "Fresh") && [89, 85, 80].every((x) => Secured.band(x).label === "Fading") && Secured.band(79).label === "Revisit soon" &&
      ["gold", "fresh", "fading", "soon"].every((c) => cssAll.includes(".rag-" + c + " ")) && /rag-gold \{[^}]*box-shadow/.test(cssAll) &&
      token("rag-gold") === "#ffd34d" && token("rag-fresh") === "#a9d6ff" && token("rag-fading") === "#1f63c6" && token("rag-soon") === "#3f2f9e",
      "Freshness ramp: gold (glowing) 100% Secured, light blue 90% Fresh, blue 80% Fading, indigo 50–70% Revisit soon, each with its label (an average between them takes the band below)");
    // No unit score is ever 95% (every score is a multiple of 10), and 90% shows as Fresh.
    const scoresSeen = new Set();
    for (const gap of [1, 2, 3, 4, 5, 6, 8]) {
      let h = two.slice();
      for (let k = 1; k <= 8; k++) h = h.concat([pass(D + H + k * gap * W + 60000)]);
      for (let d = 0; d <= gap * 8 * 7 + 60; d += 1) { const r = s(h, D + H + d * DAY + 30000); if (r.secured) scoresSeen.add(r.score); }
    }
    const nineties = s(two, D + H + 8 * DAY);
    check([...scoresSeen].sort((x, y) => x - y).join() === "50,60,70,80,90,100" && !scoresSeen.has(95) &&
      !/95%/.test(read("app.html") + read("teacher.html") + read("tour.js") + read("home.js") + read("teacher.js")),
      "Secured score: no unit ever shows 95% (scores are 100, 90, 80, 70, 60 or 50), and no colour key mentions 95%");
    check(nineties.score === 90 && Secured.band(90).label === "Fresh" && Secured.band(90).cls === "fresh" &&
      Secured.unitColour({ started: true, placed: true, secured: true, score: nineties.score }).label === "90% · Fresh",
      "Secured score: 90% (a week after the last pass) shows as Fresh, light blue");
    // My progress: one plain sentence or two per unit, from the unit's score (secured.js studentNote).
    const P = Date.parse("2026-11-09T12:00:00Z"); // a Monday, at midday
    const twoAt = [pass(P - H), pass(P)];
    const at100 = s(twoAt, P + 2 * H);
    const fmtD = Secured.studentDate;
    check(Secured.studentNote(s([pass(P)], P + H)) === "Reach level 10 and pass twice with no hints to secure this unit." &&
      Secured.studentNote({ secured: false }) === "Reach level 10 and pass twice with no hints to secure this unit." &&
      Secured.studentNote(at100) === "Secured. Keep it at 100% by doing a level 10 pass with no hints before Monday 16 November." &&
      Secured.studentNote(s(twoAt, P + 8 * DAY)) === "Your score is 90%. A level 10 pass with no hints brings it back to 100%." &&
      Secured.studentNote(s(twoAt, P + 22 * DAY)) === "Your score is 70%. A level 10 pass with no hints brings it back to 100%." &&
      Secured.studentNote(s(twoAt, P + 60 * DAY)) === "Your score is 50%. A level 10 pass with no hints brings it back to 100%.",
      "My progress: \"Secured. Keep it at 100% by doing a level 10 pass with no hints before Monday 16 November.\", \"Your score is 90%. A level 10 pass with no hints brings it back to 100%.\" and \"Reach level 10 and pass twice with no hints to secure this unit.\"");
    // The date: the last level 10 pass with no hints plus 7 days (not the last attempt); none below 100%, or once it can't drop.
    const laterTries = twoAt.concat([pass(P + 2 * DAY, { result: "fail" }), pass(P + 3 * DAY, { hints: 1 }), pass(P + 4 * DAY, { phase: "assignment" })]);
    const morePass = twoAt.concat([pass(P + 2 * DAY)]);
    check(Secured.keepByDate(at100).getTime() === P + 7 * DAY && fmtD(Secured.keepByDate(at100)) === "Monday 16 November" &&
      Secured.keepByDate(s(laterTries, P + 5 * DAY)).getTime() === P + 7 * DAY && Secured.keepByDate(s(morePass, P + 5 * DAY)).getTime() === P + 9 * DAY &&
      Secured.keepByDate(s(twoAt, P + 8 * DAY)) === null && Secured.keepByDate(s(fifth, afterFifth + 60 * DAY)) === null &&
      Secured.studentNote(s(fifth, afterFifth + 60 * DAY)) === "Secured. It stays at 100% now.",
      "My progress: the date is the last level 10 pass with no hints plus 7 days (a later fail, hinted pass or assignment pass doesn't move it), shown only at 100%; a unit that can no longer drop says it stays at 100%");
    // The numbers in the sentence are the unit's score, as the unit cards show it.
    const noteNumbersOk = [0, 3, 7, 8, 14, 15, 21, 22, 28, 29, 35, 36, 90].every((d) => {
      const r = s(twoAt, P + d * DAY);
      const shown = Secured.unitColour({ started: true, placed: true, secured: true, score: r.score }).label; // "90% · Fresh"
      const said = Secured.studentNote(r);
      return r.score === 100 ? /^Secured\./.test(said) && shown.startsWith("100%") : said.startsWith("Your score is " + r.score + "%.") && shown.startsWith(r.score + "%");
    });
    const progSrc = read("progress.js"), progHtml = read("progress.html");
    const allNotes = [Secured.studentNote({ secured: false }), Secured.studentNote(at100), Secured.studentNote(s(twoAt, P + 8 * DAY)), Secured.studentNote(s(fifth, afterFifth + 60 * DAY))];
    check(noteNumbersOk && /<p id="score-rule">A unit's score goes down a little each week unless you pass its level 10 challenge with no hints\.<\/p>/.test(progHtml) &&
      /<script src="secured\.js"><\/script>\s*<script src="progress\.js"><\/script>/.test(progHtml) &&
      /self\.Secured\.score\(attempts, u\.id\)/.test(progSrc) && /note: self\.Secured\.studentNote\(sec\)/.test(progSrc) && /<p class="score-note">' \+ esc\(x\.note\)/.test(progSrc) &&
      /skills mastered\. " \+ \(x\.placed \? self\.Secured\.starsText\(x\.stars\) \+ "\. " : ""\) \+ x\.note \+ " Show skills\./.test(progSrc) && !/DROP_PER_WEEK|WEEK_MS|FLOOR_/.test(progSrc) &&
      !/freshness|decay|floor/i.test(allNotes.join(" ") + progHtml.replace(/<!--[\s\S]*?-->/g, "")),
      "My progress: the sentence's numbers are the score the unit cards show (both from secured.js, no rule copied), the page has its one-line rule at the top, and none of it says freshness, decay or floor");
    // No secured unit can show red: the floor is at least 50%, every band below 80% is Revisit soon (indigo), and
    // no freshness band uses a red, amber or green level colour.
    const securedScores = [];
    for (let k = 0; k <= 60; k++) securedScores.push(s(many, D + H + k * 2 * W).score);
    check(securedScores.every((x) => x >= 50) && [0, 10, 49, 50].every((x) => Secured.band(x).cls === "soon") && Secured.BANDS.map((b) => b.cls).join() === "gold,fresh,fading,soon" && !Secured.BANDS.some((b) => /Revisit now/.test(b.label)) &&
      !/rag-now|Revisit now/.test(cssAll + read("teacher.html") + read("app.html") + read("teacher.js") + read("home.js")) &&
      !["rag-gold", "rag-fresh", "rag-fading", "rag-soon"].some((t) => ["lvl-red", "lvl-amber", "lvl-green", "lvl-top"].map(token).includes(token(t))),
      "No secured unit can show red: secured scores stay at 50% or more, the freshness ramp has no red band, and it shares no colour with the level ramp");
    // One calculation, used by both views.
    const others = ["teacher.js", "teacher-data.js", "home.js", "app.js", "teacher-backend.js"].filter((f) => /DROP_PER_WEEK|WEEK_MS|FLOOR_START|\b5 \* Math\.floor/.test(read(f)));
    check(!others.length && /Secured\.score\(/.test(read("teacher-data.js")) && /self\.Secured\.score\(/.test(read("home.js")) &&
      /<script src="secured\.js"><\/script>\s*(<script src="certificates\.js"><\/script>\s*)?<script src="teacher-data\.js">/.test(teacher) && /<script src="secured\.js"><\/script>/.test(read("app.html")),
      "Secured score: worked out in secured.js only, which the teacher view (teacher-data.js) and the student view (home.js) both use");
    // The attempts table records hints: the score can be worked out from it.
    const rec = App.attemptRecord({ task: byId["if-L5a"], unit: "selection", phase: "practice", kind: "attempt", hints: 2, result: "pass" });
    check(rec.hints === 2 && rec.taskLevel === byId["if-L5a"].level && TD.FULL_COLUMNS.some(([c]) => c === "hints_used") && /hints_used/.test(read("supabase/migrations/0001_schema.sql")) &&
      /hints: r\.hints_used/.test(read("backend-rows.js")),
      "Attempts record the hints used (attempts.hints_used), so the secured score is worked out from them");

    // The Students page: the flags are the student's own button presses, and a unit is grey until it is placed.
    const done = (level, extra) => Object.assign({ level, placement: { status: "done", startLevel: level } }, extra || {});
    const fail = (t, extra) => Object.assign({ kind: "attempt", result: "fail", hints: 0, unit: "selection", phase: "practice", taskLevel: 6, taskId: "if-L6a", at: new Date(t).toISOString() }, extra || {});
    const sd = {
      students: { a: { name: "Ann" }, b: { name: "Bo" }, c: { name: "Cy" }, d: { name: "Di" }, e: { name: "Ed" } },
      levelLog: [],
      progress: {
        a: { units: { selection: done(10, { buttonsUsed: { "too-easy": true } }) } },
        b: { units: { selection: done(6, { buttonsUsed: { "too-hard": true } }) } },
        c: { units: {} },
        d: { units: { selection: { level: 3, placement: { status: "in-progress" } }, maths: { level: 1, placement: { status: "pending" } } } },
        e: { units: { "linear-search": { level: 2, placement: null } } },
      },
      buttonLog: [
        { studentId: "a", unit: "selection", button: "too-easy", at: new Date(D).toISOString(), from: 8, to: 9 },
        { studentId: "a", unit: "selection", button: "too-easy", at: new Date(D + 2 * H).toISOString(), from: 9, to: 10 },
        { studentId: "b", unit: "selection", button: "too-hard", at: new Date(D + H).toISOString(), from: 7, to: 6 },
      ],
      attempts: [pass(D, { studentId: "a" }), pass(D + H, { studentId: "a" }),
        fail(D, { studentId: "b" }), fail(D + H, { studentId: "b" }), fail(D + 2 * H, { studentId: "b" }), // the same task failed three times in a row
        fail(D, { studentId: "d" }), fail(D + H, { studentId: "d" })],
    };
    const tab = TD.scoreTable(sd, ["selection", "maths", "linear-search"], D + 3 * H);
    const byStudent = Object.fromEntries(tab.rows.map((r) => [r.name, r]));
    const cell = (n, u) => byStudent[n].cells[u];
    check(cell("Ann", "selection").tooEasy && cell("Ann", "selection").tooEasyAt === new Date(D + 2 * H).toISOString() && !cell("Ann", "selection").tooHard &&
      cell("Bo", "selection").tooHard && cell("Bo", "selection").tooHardAt === new Date(D + H).toISOString() && !cell("Bo", "selection").tooEasy &&
      !cell("Di", "selection").tooHard && !cell("Di", "selection").tooEasy,
      "Flags: Too easy and Way too hard show the student's own button presses in that unit (the unit's buttonsUsed), with the time of the newest press from the button log");
    check(!("tooEasyFlag" in cell("Bo", "selection")) && !("wayTooHardFlag" in cell("Bo", "selection")) && !("tooEasyFlag" in TD) && !("wayTooHardFlag" in TD) &&
      !/wayTooHard|tooEasyFlag|failed the same task two or more times/.test(read("teacher.js") + read("teacher-data.js") + teacher) &&
      cell("Bo", "selection").failsInARow === 0 && TD.studentDetail(sd, "b", ["selection"], D + 3 * H).failsInARow.selection === 0,
      "Flags: the old rule (the same task failed twice or more in a row) is gone; failing a task three times in a row raises no flag");
    const failingStudent = { units: { selection: done(6, { failsInARow: 3 }) } };
    const withFails = TD.studentDetail({ students: { f: { name: "Fi" } }, progress: { f: failingStudent }, attempts: [], buttonLog: [] }, "f", ["selection"], D);
    check(withFails.failsInARow.selection === 3 && !withFails.cells.selection.tooHard && /c\.failsInARow \? " · " \+ c\.failsInARow \+ " fail"/.test(teacherSrc) &&
      /\[u\.id \+ "_fails"\]: c\.failsInARow/.test(teacherSrc),
      "Fails in a row: still on the student page and in the levels export, but never a flag or a colour");
    check(teacherSrc.includes("This student pressed 'This is too easy' in this unit. It moved them up one level. Check that their level is right.") &&
      teacherSrc.includes("This student pressed 'This is way too hard' in this unit. It moved them down one level. Check that their level is right.") &&
      /pressed ' \+ esc\(when\(c\.tooEasyAt\)\)/.test(teacherSrc) && /buttonFlagsHtml\(c\)/.test(teacherSrc.slice(teacherSrc.indexOf("function renderStudent("))) &&
      !/Too easy used<\/span>|Too hard used<\/span>/.test(teacherSrc + teacher) && /badge-complete/.test(read("teacher-data.js")) && /Placement: started at/.test(read("teacher-data.js")) &&
      /flagsHtml: buttonFlagsHtml/.test(teacherSrc) &&
      App.BUTTON_JUMP_LEVELS === 1,
      "Students page: each flag has its tooltip and the time of the newest press, on the cell and on the student page (they replace the Too easy used and Too hard used badges); ★ Complete and the placement result are kept");
    check(!/2\+ fails in a row/.test(teacher + teacherSrc) && !/log-rows|f-student|Detail log<\/h2>/.test(teacher) && !/Needs help|backup reminder|Teach First/i.test(teacher + teacherSrc),
      "Teacher view: the \"2+ fails in a row\" panel and the on-screen detail log are gone (the log is in the export); no Needs help panel, backup reminder or demo class");
    check(cell("Ann", "selection").placed && cell("Ann", "selection").score === 100 && cell("Ann", "selection").band.label === "Secured" && cell("Ann", "selection").levelBand === null &&
      cell("Bo", "selection").placed && cell("Bo", "selection").score === null && cell("Bo", "selection").band === null && cell("Bo", "selection").levelBand.label === "Level 6" &&
      !cell("Di", "selection").placed && cell("Di", "selection").score === null && cell("Di", "selection").band === null && cell("Di", "selection").levelBand === null && !cell("Di", "maths").placed &&
      cell("Cy", "selection").score === null && cell("Ed", "linear-search").placed && cell("Ed", "linear-search").score === null && cell("Ed", "linear-search").levelBand.label === "Level 2",
      "Not placed yet: a started unit whose placement is pending or in progress has no score or colour (grey); a placed unit that isn't secured shows its level, never 0%; a unit with no placement test counts as placed");
    check(tab.summary.green === 1 && tab.summary.amber === 1 && tab.summary.red === 1 && tab.summary.notPlaced === 2 && byStudent.Di.average === null && byStudent.Di.rag === null &&
      byStudent.Bo.average === null && byStudent.Bo.averageLevel === 6 && byStudent.Bo.rag === "amber" && byStudent.Ed.rag === "red" &&
      tab.unitAverages[0].average === 100 && tab.unitAverages[0].students === 1 && tab.unitAverages[1].average === null && tab.unitAverages[2].students === 0 && tab.unitAverages[2].average === null,
      "Students page: a student counts by their secured units' average, or (none secured) their average level's colour; the class average per unit is of the students who secured it (a student with no placed unit is in none of them)");
    check(/rag-none[^<]*>grey: Placement to do</.test(teacher) && /--rag-none:/.test(read("styles.css")) &&
      /const PLACEMENT_GREY = '<span class="rag rag-none">' \+ esc\(self\.Secured\.PLACEMENT_TO_DO\) \+ "<\/span>";/.test(teacherSrc),
      "Colour key: grey means Placement to do (called Not placed yet until review finding N2)");

    // Fix 3: a placed unit that isn't secured shows its level in the level's colour, never "0% · Revisit now".
    const lv = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((l) => TD.levelBand(l).cls + "/" + TD.levelBand(l).rag + "/" + TD.levelBand(l).label);
    check(lv.join() === "lv-red/red/Level 1,lv-red/red/Level 2,lv-red/red/Level 3,lv-amber/amber/Level 4,lv-amber/amber/Level 5,lv-amber/amber/Level 6," +
      "lv-green/green/Level 7,lv-green/green/Level 8,lv-green/green/Level 9,lv-top/green/Level 10" &&
      token("lvl-red") === "#c62828" && token("lvl-amber") === "#f5a524" && token("lvl-green") === "#4fcb7d" && token("lvl-top") === "#a8f0c4",
      "Level ramp: levels 1 to 3 red, 4 to 6 amber, 7 to 9 green, 10 light green (its own colour classes, separate from the freshness ramp)");
    const levelData = { students: { g: { name: "Gus" }, h: { name: "Hal" }, k: { name: "Kim" } }, levelLog: [], buttonLog: [],
      progress: { g: { units: { selection: done(8) } }, h: { units: { selection: done(10), maths: done(9) } }, k: { units: { selection: done(10, { level: 10 }), maths: done(2) } } },
      attempts: [pass(D, { studentId: "k" }), pass(D + H, { studentId: "k" })] };
    const lt = TD.scoreTable(levelData, ["selection", "maths"], D + 2 * H);
    const lc = (n, u) => lt.rows.find((r) => r.name === n).cells[u];
    const lrow = (n) => lt.rows.find((r) => r.name === n);
    check(lc("Gus", "selection").score === null && lc("Gus", "selection").band === null && lc("Gus", "selection").levelBand.label === "Level 8" && lc("Gus", "selection").levelBand.cls === "lv-green" &&
      lc("Hal", "selection").levelBand.cls === "lv-top" && lc("Kim", "selection").score === 100 && lc("Kim", "selection").band.label === "Secured" && lc("Kim", "selection").levelBand === null &&
      lc("Kim", "maths").levelBand.label === "Level 2" && lc("Kim", "maths").score === null,
      "Students page: an unsecured unit reads \"Level 8\" in the level's colour (score null, not 0%); a secured unit keeps its secured percentage and freshness colour");
    check(lrow("Kim").average === 100 && lrow("Kim").rag === "green" && lrow("Gus").average === null && lrow("Gus").averageLevel === 8 && lrow("Gus").rag === "green" &&
      lrow("Hal").rag === "green" && lt.summary.red === 0 && lt.summary.green === 3 && lt.unitAverages[1].average === null && lt.unitAverages[0].average === 100 && lt.unitAverages[0].students === 1,
      "Summary strip: a student counts by their secured units' average (Kim's level 2 unsecured unit doesn't pull her to red), or with none secured by their average level's colour; a placed but unsecured unit is never counted as red for being 0%");
    // The summary tiles: one per group, each student in exactly one, each in a colour the unit cards use.
    const tileData = { levelLog: [], buttonLog: [],
      students: { a: { name: "Ava" }, b: { name: "Ben" }, c: { name: "Cal" }, e: { name: "Eve" }, f: { name: "Fay" }, g: { name: "Gil" }, n: { name: "Nia" }, m: { name: "Max" } },
      progress: { a: { units: { selection: done(10) } }, b: { units: { selection: done(10) } }, c: { units: { selection: done(2) } }, e: { units: { selection: done(5) } },
        f: { units: { selection: done(8) } }, g: { units: { selection: done(10) } }, n: { units: { selection: { level: 3, placement: { status: "pending" } } } }, m: { units: {} } },
      attempts: [pass(D + 8 * W, { studentId: "a" }), pass(D + 8 * W + H, { studentId: "a" }), pass(D, { studentId: "b" }), pass(D + H, { studentId: "b" })] };
    const tt = TD.scoreTable(tileData, ["selection"], D + H + 8 * W + 2 * H);
    const tileOf = (n) => tt.rows.find((r) => r.name === n).summaryTile;
    check(TD.SUMMARY_TILES.length === 9 && TD.SUMMARY_TILES.map((t) => t.key + "/" + t.cls + "/" + t.label).join("|") ===
      "gold/gold/Secured (100%)|fresh/fresh/Fresh (90%)|fading/fading/Fading (80%)|soon/soon/Revisit soon (under 80%)|" +
      "lv-red/lv-red/Levels 1 to 3: still learning|lv-amber/lv-amber/Levels 4 to 6: still learning|lv-green/lv-green/Levels 7 to 9: still learning|" +
      "lv-top/lv-top/Level 10: not secured yet|none/none/Placement to do" && TD.SUMMARY_TILES.every((t) => t.note && t.note.length > 10) &&
      ["Ava:gold", "Ben:soon", "Cal:lv-red", "Eve:lv-amber", "Fay:lv-green", "Gil:lv-top", "Nia:none", "Max:none"].every((x) => tileOf(x.split(":")[0]) === x.split(":")[1]),
      "Summary tiles: nine, in order (Secured gold, Fresh light blue, Fading blue, Revisit soon indigo, the four level bands in their level colours, Placement to do grey), each label saying what it counts");
    // Students averaging 100, 95, 90, 85 and 75% (two units each, scores from days since each unit's last pass), with the
    // level and Not placed yet students: each in the tile of their average's band (an average between bands takes the one below).
    const NOW = D + 400 * Secured.DAY_MS;
    const passPair = (sid, unit, daysAgo) => [pass(NOW - daysAgo * Secured.DAY_MS - H, { studentId: sid, unit }), pass(NOW - daysAgo * Secured.DAY_MS, { studentId: sid, unit })];
    const avgDays = { p100: [0, 0], p95: [0, 8], p90: [8, 8], p85: [8, 15], p75: [15, 22] }; // 0 days 100%, 8 days 90%, 15 days 80%, 22 days 70%
    const sample = { levelLog: [], buttonLog: [], students: {}, progress: {}, attempts: [] };
    for (const [sid, [d1, d2]] of Object.entries(avgDays)) {
      sample.students[sid] = { name: sid };
      sample.progress[sid] = { units: { selection: done(10), maths: done(10) } };
      sample.attempts.push(...passPair(sid, "selection", d1), ...passPair(sid, "maths", d2));
    }
    Object.assign(sample.students, { c: { name: "Cal" }, e: { name: "Eve" }, f: { name: "Fay" }, g: { name: "Gil" }, n: { name: "Nia" }, m: { name: "Max" } });
    Object.assign(sample.progress, { c: tileData.progress.c, e: tileData.progress.e, f: tileData.progress.f, g: tileData.progress.g, n: tileData.progress.n, m: tileData.progress.m });
    const st = TD.scoreTable(sample, ["selection", "maths"], NOW);
    const avgOf = (sid) => st.rows.find((r) => r.studentId === sid).average;
    const tileOfS = (sid) => st.rows.find((r) => r.studentId === sid).summaryTile;
    check(["p100", "p95", "p90", "p85", "p75"].map((sid) => avgOf(sid) + ":" + tileOfS(sid)).join() === "100:gold,95:fresh,90:fresh,85:fading,75:soon" &&
      [100, 95, 90, 85, 75].map((a) => TD.summaryTileOf({ average: a })).join() === "gold,fresh,fresh,fading,soon",
      "Summary tiles: a student averaging 100% is Secured, 95% and 90% Fresh, 85% Fading and 75% Revisit soon (an average between two bands takes the one below)");
    // Revisit soon counts any secured average under 80%, and its label and tooltip say so (75% is in it, so "50% to 70%"
    // would be wrong); the unit colour keys keep 50–70%, the only unit scores in that band.
    const soonTile = TD.SUMMARY_TILES.find((t) => t.key === "soon");
    const under80 = (t) => (/under 80%/.test(t.label) ? 80 : null);
    check(tileOfS("p75") === "soon" && avgOf("p75") === 75 && st.summary.tiles.soon === 1 && soonTile.label === "Revisit soon (under 80%)" && soonTile.note === "secured average under 80%" &&
      avgOf("p75") < under80(soonTile) && [79, 71, 60, 50].every((a) => TD.summaryTileOf({ average: a }) === "soon") && TD.summaryTileOf({ average: 80 }) === "fading" &&
      !/50% to 70%/.test(read("teacher-data.js") + read("teacher.js")) &&
      /rag-soon">50–70% Revisit soon</.test(read("app.html")) && /rag-soon">50–70% Revisit soon</.test(teacher),
      "Summary tiles: Revisit soon is labelled \"Revisit soon (under 80%)\" and counts a student averaging 75% (any average from 50% to 79%); the unit colour keys still show 50–70%, a unit's only scores there");
    check(TD.SUMMARY_TILES.map((t) => t.key + "=" + st.summary.tiles[t.key]).join() === "gold=1,fresh=2,fading=1,soon=1,lv-red=1,lv-amber=1,lv-green=1,lv-top=1,none=2" &&
      Object.values(st.summary.tiles).reduce((x, y) => x + y, 0) === Object.keys(sample.students).length,
      "Summary tiles: on a sample of 11 students each tile counts the right students (1 Secured, 2 Fresh, 1 Fading, 1 Revisit soon, 1 in each level band, 2 Not placed yet), and they add up to 11");
    check(/\.rag-tiles \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/.test(cssAll) && /\.rag-tile \{ min-width: 0; overflow-wrap: break-word;/.test(cssAll) &&
      !/\.rag-tile[^{]*\{[^}]*overflow-wrap: anywhere/.test(cssAll) && /\.rag-tile \.rag \{ display: block; \}/.test(cssAll) &&
      TD.SUMMARY_TILES.every((t) => new RegExp("\\.rag-tile-" + t.cls + " \\{ border-left: 10px solid var\\(--").test(cssAll) && new RegExp("\\.rag-" + t.cls + " \\{[^}]*background: var\\(--").test(cssAll)),
      "Summary tiles: a three-by-three grid whose tiles shrink to fit (no sideways scrolling), labels that use the tile's full width and never break inside a word (\"Secu red\"), and every tile has its colour (edge and label chip)");
    // Three columns at every width: the one rule that sets the columns has no media query around it, and no other
    // rule (in any media query) changes them, so it is 3 × 3 at 1280px (desktop) and at 390px (phone) alike.
    {
      const tileRules = [];
      let depth = 0, media = [], start = 0;
      for (let i = 0; i < cssAll.length; i++) {
        const ch = cssAll[i];
        if (ch === "{") {
          const sel = cssAll.slice(start, i).trim();
          if (sel.startsWith("@media")) media.push({ sel, depth }); else if (/\.rag-tiles\b/.test(sel)) tileRules.push({ sel, media: media.map((m) => m.sel), body: cssAll.slice(i + 1, cssAll.indexOf("}", i)) });
          depth++; start = i + 1;
        } else if (ch === "}") { depth--; if (media.length && media[media.length - 1].depth === depth) media.pop(); start = i + 1; }
        else if (ch === ";" && depth === 0) start = i + 1;
      }
      // Two rows since prompt 25: Freshness (.rag-tiles-4) and Level (.rag-tiles-5), each filling the width; under
      // 700px each wraps two tiles to a line. The later rule that applies wins (the selectors are equally specific).
      const setsColumns = tileRules.filter((r) => /grid-template-columns/.test(r.body));
      const applies = (r, w) => r.media.every((m) => { const min = /min-width:\s*([\d.]+)px/.exec(m), max = /max-width:\s*([\d.]+)px/.exec(m); return (!min || w >= +min[1]) && (!max || w <= +max[1]); });
      const colsFor = (row, w) => { const hit = setsColumns.filter((r) => applies(r, w) && r.sel.split(",").some((x) => x.trim() === ".rag-tiles" || x.trim() === ".rag-tiles-" + row)); return hit.length ? /grid-template-columns:\s*([^;]+)/.exec(hit[hit.length - 1].body)[1].trim() : null; };
      const rowsOf = TD.SUMMARY_ROWS.map((row) => TD.SUMMARY_TILES.filter((t) => t.row === row.id).length);
      check(rowsOf.join() === "4,5" && [1280, 1000, 700].every((w) => colsFor(4, w) === "repeat(4, minmax(0, 1fr))" && colsFor(5, w) === "repeat(5, minmax(0, 1fr))") &&
        [699, 390].every((w) => colsFor(4, w) === "repeat(2, minmax(0, 1fr))" && colsFor(5, w) === "repeat(2, minmax(0, 1fr))") && !/repeat\(9/.test(cssAll) && TD.SUMMARY_TILES.length === 9,
        "Summary tiles (prompt 25): two rows on a desktop, four freshness tiles then five level tiles, each filling the width (1280px, 1000px, 700px); under 700px (699px, 390px) two tiles to a line, so they wrap with no sideways scrolling");
    }
    const tileTotal = Object.values(tt.summary.tiles).reduce((x, y) => x + y, 0);
    check(tileTotal === Object.keys(tileData.students).length && tt.rows.every((r) => r.summaryTile in tt.summary.tiles) &&
      Object.entries(tt.summary.tiles).every(([k, v]) => v === tt.rows.filter((r) => r.summaryTile === k).length) &&
      Object.values(lt.summary.tiles).reduce((x, y) => x + y, 0) === lt.rows.length && Object.values(tab.summary.tiles).reduce((x, y) => x + y, 0) === tab.rows.length,
      "Summary tiles: each student is counted once, and the counts add up to the number of students");
    const tileCls = TD.SUMMARY_TILES.map((t) => t.cls);
    const cardCls = Secured.BANDS.map((b) => b.cls).concat([1, 4, 7, 10].map((l) => Secured.levelBand(l).cls), ["none"]);
    const edge = (cls) => ((cssAll.match(new RegExp("\\.rag-tile-" + cls + " \\{[^}]*var\\(--([\\w-]+)\\)")) || [])[1]);
    const fill = (cls) => ((cssAll.match(new RegExp("\\.rag-" + cls + " \\{[^}]*background: var\\(--([\\w-]+)\\)")) || [])[1]);
    check(tileCls.every((c) => cardCls.includes(c)) && tileCls.every((c) => edge(c) && edge(c) === fill(c)) && !/rag-tile-(green|amber|red)\b/.test(cssAll + teacherSrc) &&
      /tiles\.map\(\(t\) => '<div class="rag-tile rag-tile-' \+ t\.cls \+ '" title="' \+ esc\(t\.label \+ ": " \+ t\.note\) \+ '"><span class="rag rag-' \+ t\.cls \+ '">' \+ esc\(t\.label\)/.test(teacherSrc) &&
      tt.rows.find((r) => r.name === "Ava").band.cls === "gold" && tt.rows.find((r) => r.name === "Ben").band.cls === "soon" && tt.rows.find((r) => r.name === "Fay").levelBand.cls === "lv-green",
      "Summary tiles and unit cards use the same colours: each tile's edge and label chip are the cells' own band and level colours (no separate green, amber and red tiles)");
    const sorted = TD.sortScoreTable(lt.rows, "selection", 1).map((r) => r.name).join();
    check(sorted === "Gus,Hal,Kim", "Sorting a unit column: units not secured yet by level, then secured units by score");
    check(/c\.levelBand \? '<span class="rag rag-' \+ c\.levelBand\.cls \+ '">' \+ esc\(c\.levelBand\.label\)/.test(teacherSrc) &&
      /const width = c\.score != null \? c\.score : c\.levelBand \? c\.level \* 10 : 0;/.test(teacherSrc) && !/shows 0%/.test(teacher) &&
      /rag-lv-green">Level 7–9</.test(teacher) && /rag-lv-top">Level 10</.test(teacher) && /None secured yet/.test(teacherSrc),
      "Teacher view: the cell, the student page's bar and the colour key show the level colour for a unit not secured yet; Compare classes says None secured yet, never 0%");

    // The student's unit cards: blue "Placement to do" until the placement is done, then the level colour, then the
    // freshness colour once secured (secured.js unitColour), the same bands as the teacher view.
    const uc = (o) => Secured.unitColour(Object.assign({ started: true, placed: true, level: 5, secured: false, score: null }, o));
    check(Secured.unitColour({ started: false }) === null && uc({ placed: false }).cls === "placement" && uc({ placed: false }).label === "Placement to do" &&
      uc({ placed: false, level: 9, secured: true, score: 100 }).ramp === "placement" &&
      uc({ level: 2 }).cls === "lv-red" && uc({ level: 2 }).label === "Level 2" && uc({ level: 8 }).cls === "lv-green" && uc({ level: 10 }).cls === "lv-top" &&
      /rag-placement \{[^}]*var\(--placement-bg\)[^}]*var\(--placement-ink\)[^}]*dashed/.test(cssAll) &&
      !/--(rag|lvl)-[\w-]+:\s*#1f4fd1/i.test(cssAll) && (cssAll.match(/var\(--placement-ink\)/g) || []).length === 2,
      "Unit cards: before the placement is done the unit shows blue \"Placement to do\" (a dashed outline, its own blue, used for nothing else), then its level colour");
    check(uc({ secured: true, score: 100 }).cls === "gold" && uc({ secured: true, score: 100 }).label === "100% · Secured" && uc({ secured: true, score: 90 }).label === "90% · Fresh" &&
      uc({ secured: true, score: 85 }).cls === "fading" && uc({ secured: true, score: 60 }).cls === "soon" && uc({ secured: true, score: 60 }).label === "60% · Revisit soon" &&
      /self\.Secured\.unitColour\(\{ started: !!s, placed: !!s && !placing, level: s && s\.level, secured: sec\.secured, score: sec\.score \}\)/.test(read("home.js")) &&
      /const placing = s && needsPlacement\(s\);/.test(read("home.js")) && /★ Level 10 passed/.test(read("home.js")) && /One level 10 pass with no hints brings it back to 100%/.test(read("home.js")),
      "Unit cards: a secured unit shows the freshness colour and \"N% · band\"; the card keeps its level text, the \"★ Level 10 passed\" note and the come-back note");
    // The same rules on both sides: the teacher's cell and the student's card come from the same secured.js functions.
    const both = [3, 6, 9, 10].every((l) => uc({ level: l }).cls === TD.levelBand(l).cls) && [100, 95, 85, 60].every((x) => uc({ secured: true, score: x }).cls === Secured.band(x).cls) &&
      lc("Kim", "selection").band.cls === uc({ secured: true, score: lc("Kim", "selection").score }).cls && lc("Gus", "selection").levelBand.cls === uc({ level: 8 }).cls;
    check(both && /const levelBand = \(level\) => Secured\.levelBand\(level\);/.test(read("teacher-data.js")) && !/function levelBand/.test(read("teacher-data.js")),
      "Teacher and student views use the same band rules (secured.js band and levelBand)");
    // The colour key on both pages shows the two ramps.
    const appHtml = read("app.html");
    const keyOf = (html) => ((html.match(/<p class="small rag-key"[^>]*>([\s\S]*?)<\/p>/) || [])[1] || "");
    const studentKey = keyOf(appHtml), teacherKey = keyOf(teacher);
    const ramps = (k) => ["rag-gold\">100% Secured", "rag-fresh\">90% Fresh", "rag-fading\">80% Fading", "rag-soon\">50–70% Revisit soon",
      "rag-lv-red\">Level 1–3", "rag-lv-amber\">Level 4–6", "rag-lv-green\">Level 7–9", "rag-lv-top\">Level 10"].every((x) => k.includes(x));
    check(ramps(studentKey) && ramps(teacherKey) && studentKey.includes('rag-placement">Placement to do') && teacherKey.includes('rag-none">grey: Placement to do'),
      "Colour key: the student's page and the teacher's Students page each show the level ramp and the freshness ramp (and the placement colour)");
    // Contrast: every chip's text against its own background, at least 4.5:1 (the chips are small bold text).
    const lum = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const chipInk = (cls) => { const rule = (cssAll.match(new RegExp("\\.rag-" + cls + " \\{([^}]*)\\}")) || [])[1] || "";
      const bg = (rule.match(/background: var\(--([\w-]+)\)/) || [])[1]; const ink = (rule.match(/(?:^|;)\s*color: var\(--([\w-]+)\)/) || [])[1] || "rag-ink"; return [token(ink), token(bg)]; };
    const chips = ["gold", "fresh", "fading", "soon", "lv-red", "lv-amber", "lv-green", "lv-top", "none", "placement"];
    const ratios = chips.map((c) => { const [ink, bg] = chipInk(c); return ink && bg ? ratio(ink, bg) : 0; });
    check(ratios.every((r) => r >= 4.5),
      "Contrast: every chip label reaches 4.5:1 on its own background (" + chips.map((c, i) => c + " " + ratios[i].toFixed(2)).join(", ") + ")");

    // Fix 2: a pass after "Show me how" isn't counted towards the secured score.
    const showTask = { id: "sel-L10x", unit: "selection", level: 10, type: "write" };
    const showRec = (showHow, kind) => App.attemptRecord({ task: showTask, unit: "selection", phase: "practice", kind: kind || "attempt", hintType: kind === "hint" ? "show-me-how" : undefined,
      attemptNumber: 1, hints: 0, showHow, result: kind === "hint" ? "show-me-how" : "pass", levelBefore: 10, levelAfter: 10 });
    check(showRec(true).hintType === "show-me-how" && !("hintType" in showRec(false)) && showRec(true, "hint").hintType === "show-me-how" &&
      /hints: c\.hints, showHow: \(c\.showHow \|\| 0\) > 0, result: o\.result/.test(read("app.js")) && (read("app.js").match(/showHow: \(c\.showHow \|\| 0\) > 0/g) || []).length >= 3,
      "Show me how: an attempt made after \"Show me how\" carries hintType show-me-how (like the Show me how row itself); other attempts have none");
    const stamp = (a, t) => Object.assign(a, { at: new Date(t).toISOString() });
    check(!s([stamp(showRec(true), D), stamp(showRec(false), D + H)], D + 2 * H).secured && s([stamp(showRec(true), D), stamp(showRec(false), D + H)], D + 2 * H).passes === 1 &&
      !s([pass(D, { hintType: "show-me-how" }), pass(D + H, { hintType: "show-me-how" })], D + 2 * H).secured &&
      s([stamp(showRec(false), D), stamp(showRec(false), D + H)], D + 2 * H).score === 100 && s([pass(D), pass(D + H)], D + 2 * H).score === 100,
      "Secured score: a pass after \"Show me how\" doesn't count; two passes with no hints still secure the unit (older attempts, with no hintType, count as before)");
    const showRow = Rows.attemptToRow(Object.assign(stamp(showRec(true), D), { id: "a-x1" }));
    const oldRow = Rows.attemptToRow(Object.assign(stamp(showRec(false), D), { id: "a-x2" }));
    const back1 = Rows.rowToAttempt(Object.assign({}, showRow, { timestamp: showRow.timestamp }), "s1");
    const back2 = Rows.rowToAttempt(oldRow, "s1");
    const exported = TD.fullExportRows({ students: { s1: { name: "Sam" } }, attempts: [back1, back2], levelLog: [], buttonLog: [], placementLog: [] });
    check(showRow.hint_type === "show-me-how" && oldRow.hint_type === null && back1.hintType === "show-me-how" && !("hintType" in back2) &&
      exported.find((r) => r.record_id === "a-x1").hint_type === "show-me-how" && exported.find((r) => r.record_id === "a-x2").hint_type === "" &&
      /hint_type: \{ kind: "text", max: 40 \}/.test(read("supabase/functions/_shared/rows.ts")) && /hint_type/.test(read("supabase/functions/student-api/index.ts")) &&
      /hint_type: text\(r\.hint_type\)/.test(read("backend-import.js")),
      "Show me how on an attempt goes through the server unchanged (the existing hint_type column, which student-api already accepts and returns), the full export and import");

    // Fix 1: the task browser's frame takes its content's height, so the page scrolls instead of the frame.
    const css = read("styles.css");
    const frameRule = (css.match(/\.practice-frame \{[^}]*\}/) || [""])[0];
    check(!/46rem/.test(frameRule) && /box-sizing: border-box/.test(frameRule) && /width: 100%/.test(frameRule) &&
      /function fitFrame\(f\)/.test(teacherSrc) && /ResizeObserver/.test(teacherSrc) && /frame\.addEventListener\("load", \(\) => \{ try \{ fitFrame\(frame\)/.test(teacherSrc) &&
      /id="tb-show-solution"/.test(teacherSrc) && /id="tb-hint"/.test(teacherSrc) && /id="tb-check"/.test(teacherSrc),
      "Task browser: the practice frame has no fixed height (it is set to the task view's height, and follows it), and fits the width with its border");
    const csv = TD.classScoresCsv(tab, ["selection"], (u) => u);
    check(csv.split("\r\n")[0] === "Name,Average secured score,RAG,selection: secured score,selection: label,selection: level" && /Ann,100,green,100,Secured,10/.test(csv) &&
      /Di,Placement to do,,Placement to do,Placement to do,Placement to do\r?\n?/.test(csv) && /Bo,not secured yet,amber,not secured yet,Level 6 \(not secured yet\),6/.test(csv) && !/,0,red,0,/.test(csv) &&
      !/not placed yet/i.test(csv),
      "Reports: the class scores export has each student's average and each unit's secured score, label and level (\"Placement to do\" for a unit still to be placed, as on the screen; the level for one not secured yet, never 0)");
    const detail = TD.studentDetail(sd, "a", ["selection"], D + 3 * H, 5);
    check(detail.name === "Ann" && detail.recent.length === 2 && detail.recent[0].at > detail.recent[1].at && detail.cells.selection.score === 100 && detail.cells.selection.tooEasyAt,
      "Student page: the secured score per unit, the flags with their time, and the newest attempts, newest first");

    // Stages: which units the Students page shows, and which sections of the student's menu open by default.
    const C = Curriculum;
    check(C.stageGroups("ks3").join() === "fundamentals,advanced" && C.stageGroups("gcse").join() === "fundamentals,advanced,validation,searching-sorting" &&
      C.stageGroups("a-level").join() === C.UNIT_GROUPS.map((g) => g.id).join() && C.stageOf(undefined).id === "gcse" && C.stageUnits("ks3").includes("arrays-2d") &&
      !C.stageUnits("ks3").includes("validation") && !C.stageUnits("gcse").includes("recursion") && C.stageUnits("a-level").length === C.UNITS.length,
      "Stages: KS3 opens Programming fundamentals and Advanced programming; GCSE adds Validation and Searching and sorting; A-level opens every section; no stage means GCSE");
    const stageRun = () => {
      const mem = {};
      const ctx = { localStorage: { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } }, document: {} };
      ctx.self = ctx;
      require("vm").runInNewContext(read("collapse.js"), ctx);
      return { C2: ctx.Collapse, mem };
    };
    const { C2, mem } = stageRun();
    const first = C2.resetForStage("g", "ks3", ["validation", "a-level"]);
    C2.saveCollapsed("g", ["a-level"]); // the student opens Validation
    const again = C2.resetForStage("g", "ks3", ["validation", "a-level"]);
    const changed = C2.resetForStage("g", "a-level", []);
    check(first && !again && mem.g === "[]" && changed && C2.collapsedIds("g").length === 0 && /Collapse\.resetForStage\(COLLAPSED_KEY, stage/.test(read("home.js")) &&
      /saveClassStage\(s\.sid, r\.body\.student\.class_stage/.test(read("backend.js")) && /class_stage: await classStage/.test(read("supabase/functions/student-api/index.ts")),
      "Student menu: the class's stage sets which sections start open; the student's own opening is kept, and a stage change resets it (the stage comes from get_progress)");
    check(/stage text not null default 'gcse'/.test(read("supabase/migrations/0013_class_stage.sql")) && /^begin;$/m.test(read("supabase/migrations/0013_class_stage.sql")) &&
      /^commit;$/m.test(read("supabase/migrations/0013_class_stage.sql")) && /check \(stage in \('ks3', 'gcse', 'a-level'\)\)/.test(read("supabase/migrations/0013_class_stage.sql")) &&
      /noStage\(r\.error\)/.test(backendSrc) && /if \(r\.error \|\| !r\.data\) return null;/.test(read("supabase/functions/student-api/index.ts")),
      "Class stage: migration 0013 adds classes.stage (KS3, GCSE or A-level; existing classes GCSE); the teacher view and student-api still work on a server without it");

    // Creating a class: runs teacher-backend.js's real "Create class" handler against a fake Supabase client, in a
    // child process (the handler is async and these checks are not).
    const createClass = (mode, stage) => {
      const scenario = async (root, mode, stage) => {
        const fs = require("fs"), vm = require("vm");
        const els = {}, handlers = {}, inserts = [];
        const el = (id) => els[id] || (els[id] = { id, value: "", textContent: "", innerHTML: "", hidden: false, className: "", disabled: false,
          addEventListener: (type, fn) => { handlers[id + ":" + type] = fn; }, focus() {} });
        el("tb-new-class-name").value = " 7X ";
        el("tb-new-class-stage").value = stage;
        const made = { data: { id: "c1", class_code: "ABCDEF" } };
        const respond = (q) => {
          if (!q.insert) return { data: [] };
          inserts.push(q.insert);
          if (mode === "error") return { error: { code: "23514", message: 'new row for relation "classes" violates check constraint "classes_stage_check"' } };
          if (mode === "no-reason") return { error: {} };
          if (mode === "refused" && "stage" in q.insert) return { error: { code: "42501", message: "permission denied for table classes" } };
          return made;
        };
        const query = () => { const q = {}; const b = { insert: (row) => { q.insert = row; return b; }, then: (ok) => ok(respond(q)) };
          ["select", "order", "eq", "single", "maybeSingle", "range"].forEach((m) => { b[m] = () => b; }); return b; };
        const sb = { from: query, auth: { getSession: async () => ({ data: { session: null } }) } };
        const ctx = { document: { getElementById: el, head: { appendChild() {} } }, location: { hash: "", pathname: "/teacher.html", origin: "" },
          history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {} }, console,
          APP_CONFIG: { BACKEND_ENABLED: true, SUPABASE_URL: "https://example.test", SUPABASE_ANON_KEY: "test" },
          supabase: { createClient: () => sb }, Curriculum: { DEFAULT_STAGE: "gcse", stageOf: (s) => ({ label: s }) } };
        ctx.self = ctx;
        vm.createContext(ctx);
        // class-create.js (prompt 26: the one class-creation rule) loads first, as on the page.
        vm.runInContext(fs.readFileSync(require("path").join(root, "class-create.js"), "utf8"), ctx);
        vm.runInContext(fs.readFileSync(require("path").join(root, "teacher-backend.js"), "utf8"), ctx);
        await ctx.TeacherBackend.start(() => {}, () => {});
        await handlers["tb-new-class:submit"]({ preventDefault() {} });
        console.log(JSON.stringify({ inserts, status: el("tb-status").textContent, problem: el("tb-status").className === "problem" }));
      };
      const out = require("child_process").execFileSync(process.execPath,
        ["-e", "(" + scenario.toString() + ")(" + JSON.stringify(ROOT) + ", " + JSON.stringify(mode) + ", " + JSON.stringify(stage) + ")"], { encoding: "utf8" });
      return JSON.parse(out.trim().split("\n").pop());
    };
    const stageOptions = [...(teacher.match(/<select id="tb-new-class-stage">([\s\S]*?)<\/select>/) || ["", ""])[1].matchAll(/value="([^"]*)"/g)].map((m) => m[1]);
    const allowed = (read("supabase/migrations/0013_class_stage.sql").match(/check \(stage in \(([^)]*)\)\)/) || ["", ""])[1].match(/'[^']*'/g).map((s) => s.slice(1, -1));
    const okKs3 = createClass("ok", "ks3");
    check(stageOptions.join() === "ks3,gcse,a-level" && stageOptions.every((s) => allowed.includes(s)) &&
      okKs3.inserts.length === 1 && okKs3.inserts[0].name === "7X" && okKs3.inserts[0].stage === "ks3" && !okKs3.problem && /Class 7X created\. Its class code is ABCDEF/.test(okKs3.status) &&
      /^grant insert \(stage\), update \(stage\) on public\.classes to authenticated;$/m.test(read("supabase/migrations/0014_class_stage_grants.sql")) &&
      /^begin;$/m.test(read("supabase/migrations/0014_class_stage_grants.sql")) && /^commit;$/m.test(read("supabase/migrations/0014_class_stage_grants.sql")),
      "Creating a class sends a valid stage (each option is one 0013 allows, lowercase), and migration 0014 lets a teacher insert and update the stage column");
    const failed = createClass("error", "gcse");
    const noReason = createClass("no-reason", "gcse");
    check(failed.problem && failed.status === 'Couldn\'t create the class (new row for relation "classes" violates check constraint "classes_stage_check"). Please try again.' &&
      noReason.problem && noReason.status === "Couldn't create the class. Please try again.",
      "Creating a class: the error shows the server's reason with \"Please try again\", and keeps the old message when the server gives no reason");
    const refused = createClass("refused", "a-level");
    check(refused.inserts.length === 2 && refused.inserts[0].stage === "a-level" && !("stage" in refused.inserts[1]) && !refused.problem &&
      /needs migration 0014\), so it was made as GCSE/.test(refused.status),
      "Creating a class on a server without migration 0014 (stage refused) still makes the class, as GCSE, and says so");

    // Teacher practice is never recorded: with stopRecording, no Store function writes anything, and every Store
    // function that can write is one stopRecording replaces.
    const storeRun = () => {
      const mem = {};
      const ls = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; },
        key: (i) => Object.keys(mem)[i], get length() { return Object.keys(mem).length; } };
      const ctx = { localStorage: ls };
      ctx.self = ctx;
      require("vm").runInNewContext(read("store.js"), ctx);
      return { S: ctx.Store, mem };
    };
    const callAll = (S) => {
      for (const [name, f] of Object.entries(S)) {
        if (typeof f !== "function" || name === "setupDisplaySettings" || name === "whenReady") continue;
        try { f("s1", { unit: "selection", taskId: "if-L5a", at: new Date().toISOString(), units: {} }, { x: 1 }); } catch (e) { /* a read with odd arguments */ }
      }
    };
    const plain = storeRun();
    const writers = [];
    for (const [name, f] of Object.entries(plain.S)) {
      if (typeof f !== "function" || name === "setupDisplaySettings" || name === "whenReady") continue;
      const fresh = storeRun();
      try { fresh.S[name]("s1", { unit: "selection", taskId: "if-L5a", at: new Date().toISOString(), units: {} }, { x: 1 }); } catch (e) { /* ignore */ }
      if (Object.keys(fresh.mem).length) writers.push(name);
    }
    const guarded = storeRun();
    App.stopRecording(guarded.S);
    callAll(guarded.S);
    check(writers.length >= 8 && writers.every((w) => App.RECORDING_FUNCTIONS.includes(w)) && !Object.keys(guarded.mem).length,
      "Teacher practice: after stopRecording, calling every Store function saves nothing (no attempt, pass, progress, event or assignment work); every Store function that writes (" + writers.join(", ") + ") is stopped");
    const appSrc = read("app.js");
    const browser = appSrc.slice(appSrc.indexOf("// ===================== Browser app"));
    check(browser.indexOf("if (preview) { stopRecording(Store);") > 0 && browser.indexOf("if (preview) { stopRecording(Store);") < browser.indexOf("Store.loadProgress(") &&
      /const student = preview \? PREVIEW_STUDENT : Store\.currentStudent\(\)/.test(browser) && /if \(previewId && !preview\) \{ location\.replace\("app\.html"\); return; \}/.test(browser) &&
      App.previewAllowed({ parent: null }) === false && (() => { const w = {}; w.parent = w; return App.previewAllowed(w) === false; })() &&
      App.previewAllowed({ parent: { location: { pathname: "/pythonpractices/teacher.html" } } }) === true,
      "Teacher practice: practice.html?preview=<id> stops recording before it reads or saves anything, uses no student, and only runs inside teacher.html");
    check(/src="practice\.html\?preview=' \+ encodeURIComponent\(t\.id\)/.test(teacherSrc) && /id="tb-hint">Hint \(free\)/.test(teacherSrc) && /id="tb-show-solution">Show solution/.test(teacherSrc) &&
      /id="tb-check">Check answer/.test(teacherSrc) && /href="#tasks=' \+ encodeURIComponent/.test(teacherSrc) && /route\(\)/.test(teacherSrc),
      "Task browser: the task opens in the student's own practice view, with Hint (free), Show solution and Check answer; a task name in Reports opens it there");

    // Settings and accounts.
    check(/id="pw-current"/.test(teacher) && /id="pw-new"/.test(teacher) && /id="pw-new2"/.test(teacher) && /next !== \$\("pw-new2"\)\.value/.test(teacherSrc) &&
      /signInWithPassword\(\{ email: user\.email, password: currentPassword \}\)/.test(backendSrc) && /updateUser\(\{ password: newPassword \}\)/.test(backendSrc) &&
      /id="tb-new-password2"/.test(teacher) && /password !== \$\("tb-new-password2"\)\.value/.test(backendSrc),
      "Settings: change password checks the current one, and asks for the new one twice (sign-up asks twice too)");
    const tapi = read("supabase/functions/teacher-api/index.ts");
    check(/async rename_student\(tid, body\)/.test(tapi) && /validNickname\(nickname\)/.test(tapi) && /nicknameBlocked\(nickname\)/.test(tapi) && /ownStudent\(tid, body\.student_id\)/.test(tapi) &&
      /teacherApi\("rename_student"/.test(backendSrc) && /resetPin, removeStudent, renameStudent, changePassword, compareClasses/.test(backendSrc),
      "Student page: Rename uses teacher-api rename_student (the nickname rules and word filter); Reset PIN and Remove use the same calls as the logins table");
    check(["export-scores", "export-full", "export-dictionary", "export-levels", "export-log", "export-workshop"].every((id) => teacher.includes('id="' + id + '"')) &&
      /python-practice-overview-/.test(teacherSrc) && /python-practice-detail-log-/.test(teacherSrc) && /python-practice-workshop-/.test(teacherSrc) && /python-practice-full-data-/.test(teacherSrc),
      "Reports: class scores, full attempt log, data dictionary, and the earlier levels table, detail log and workshop exports (with their columns)");
    // The assignment builder: tasks from one unit spread across the levels (teacher-data.js), then Change, Remove and Add.
    check(/id="as-five"/.test(teacher) && /id="as-count"/.test(teacher) && /id="as-from"/.test(teacher) && /id="as-to"/.test(teacher) && /id="as-add-task"/.test(teacher) &&
      /\$\("as-count"\)\.value = "5"/.test(teacherSrc) && /\$\("as-from"\)\.value = "1"/.test(teacherSrc) && /\$\("as-to"\)\.value = "10"/.test(teacherSrc) &&
      /TD\.buildSpread\(bankTasks, unit, lo, hi, count\)/.test(teacherSrc) && /!\(t\.tags \|\| \[\]\)\.includes\("placement"\)/.test(teacherSrc),
      "Assignments: the builder takes a unit, how many tasks (5 at first) and a level range (1 to 10 at first), and builds the list with TD.buildSpread");
    const lvlsOf = (list) => list.map((b) => b.level).join();
    const sel = TD.buildSpread(tasks, "selection", 1, 10, 5);
    check(TD.spreadLevels(1, 10, 5).join() === "1,3,5,7,10" && sel.length === 5 && lvlsOf(sel) === "1,3,5,7,10" && sel.every((b) => b.task.unit === "selection" && b.wanted === b.level && !b.note),
      "Assignment builder: by default 5 tasks spread across levels 1 to 10 (levels 1, 3, 5, 7 and 10), all from the chosen unit");
    const narrow = TD.buildSpread(tasks, "maths", 3, 7, 5);
    check(TD.spreadLevels(3, 7, 5).join() === "3,4,5,6,7" && TD.spreadLevels(3, 7, 3).join() === "3,5,7" && TD.spreadLevels(7, 3, 2).join() === "3,7" &&
      TD.spreadLevels(4, 4, 3).join() === "4,4,4" && TD.spreadLevels(1, 3, 7).join() === "1,1,1,2,2,3,3" && lvlsOf(narrow) === "3,4,5,6,7" && narrow.every((b) => b.task.unit === "maths"),
      "Assignment builder: a narrowed range (3 to 7) keeps every task inside it, always including the lowest and highest level; more tasks than levels share them out evenly");
    const fakeBank = [
      { id: "u-1", unit: "u", level: 1 }, { id: "u-2a", unit: "u", level: 2 }, { id: "u-2b", unit: "u", level: 2 }, { id: "u-P3", unit: "u", level: 3, tags: ["placement"] },
      { id: "u-4a", unit: "u", level: 4 }, { id: "u-4b", unit: "u", level: 4 }, { id: "v-3", unit: "v", level: 3 },
    ];
    const gapList = TD.buildSpread(fakeBank, "u", 1, 4, 4);
    check(gapList.map((b) => b.id).join() === "u-1,u-2a,u-2b,u-4a" && gapList[2].wanted === 3 && gapList[2].level === 2 && /Level 2: the unit has no other level 3 task/.test(gapList[2].note) &&
      gapList.filter((b) => b.note).length === 1 && /' <span class="flag">' \+ esc\(note\)/.test(teacherSrc),
      "Assignment builder: a level with no practice task in the unit uses the nearest level that has one (not the placement task, not another unit's), and says so next to the task");
    const fewer = TD.buildSpread(fakeBank, "u", 1, 1, 10);
    const builderUnits = Curriculum.UNITS.map((u) => u.id);
    check(fewer.map((b) => b.id).join() === "u-1,u-2a,u-2b,u-4a,u-4b" && new Set(fewer.map((b) => b.id)).size === fewer.length &&
      builderUnits.every((u) => { const b = TD.buildSpread(tasks, u, 1, 10, 10); return new Set(b.map((x) => x.id)).size === b.length; }),
      "Assignment builder: never the same task twice (a unit with fewer tasks than asked for gives each one once)");
    check(builderUnits.every((u) => TD.buildSpread(tasks, u, 1, 10, 10).every((b) => !(b.task.tags || []).includes("placement")) &&
      TD.addOptions(tasks, u, []).every((t) => !(t.tags || []).includes("placement") && t.unit === u)) && !TD.buildSpread(fakeBank, "u", 3, 3, 1).some((b) => b.id === "u-P3"),
      "Assignment builder: placement tasks are never added (building or Add a task), in any unit");
    const selIds = sel.map((b) => b.id);
    const swaps = selIds.map((_, i) => TD.swapOptions(tasks, selIds, i));
    check(swaps.every((list, i) => list.length > 0 && list.every((t) => t.unit === "selection" && t.level === sel[i].level && !selIds.includes(t.id) && !(t.tags || []).includes("placement"))) &&
      TD.swapOptions(fakeBank, ["u-1", "u-2a"], 0).length === 0 && TD.swapOptions(fakeBank, ["u-2a", "u-4a"], 0).map((t) => t.id).join() === "u-2b" &&
      TD.swapOptions(fakeBank, ["u-4a", "u-4b"], 1).length === 0 && TD.swapOptions(fakeBank, ["nope"], 0).length === 0 &&
      /No other level ' \+ c\.task\.level \+ " tasks in this unit<\/button>/.test(teacherSrc) && /data-as-swap="' \+ i \+ '" data-to="/.test(teacherSrc),
      "Assignment builder: Change offers only other practice tasks of the same unit and level that aren't in the list, and says so when there are none");
    check(TD.BUILDER_MAX_TASKS === 10 && TD.spreadLevels(1, 10, 0).length === 1 && TD.spreadLevels(1, 10, 1).join() === "1" &&
      TD.spreadLevels(1, 10, 10).join() === "1,2,3,4,5,6,7,8,9,10" && TD.spreadLevels(1, 10, 25).length === 10 && TD.buildSpread(tasks, "selection", 1, 10, 11).length === 10 &&
      TD.buildSpread(tasks, "selection", 1, 10, 1).length === 1 && /const full = ids\.length >= TD\.BUILDER_MAX_TASKS;/.test(teacherSrc) &&
      /ids\.length >= TD\.BUILDER_MAX_TASKS\) return;/.test(teacherSrc) && /data-as-remove="' \+ i \+ '">Remove<\/button>/.test(teacherSrc),
      "Assignment builder: from 1 to 10 tasks (the count is kept between 1 and 10, and Add stops at 10); single tasks can be removed");
    check(/tb\.saveAssignment\(\{ id: editing && editing\.id, status: \(editing && editing\.status\) \|\| "open", title,/.test(teacherSrc) && /checked\.length > 50/.test(teacherSrc) &&
      /tb\.setAssignmentStatus\(/.test(teacherSrc) && /Add ' \+ esc\(t\.id\) \+ " to the assignment/.test(teacherSrc) && /if \(!ids\.includes\(t\.id\)\) \$\("as-tasks"\)\.value = ids\.concat\(t\.id\)/.test(teacherSrc) &&
      /'<ol class="assignment-tasks">' \+ a\.task_ids\.map/.test(teacherSrc) && /id="as-tasks"/.test(teacher),
      "Assignments: saving, changing (title, description, tasks), closing and reopening, the Task browser's Add button and each assignment's task list work as before");
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
    const { PLACEMENT_LEVELS } = App;
    check(PLACEMENT_LEVELS.join() === "2,5,7,9" && App.PLACEMENT_TASKS === 4 && App.PLACEMENT_ATTEMPTS === 2 && !("PLACEMENT_MAX_LEVEL" in App),
      "Placement: 4 tasks starting at level 2 (levels 2, 5, 7 and 9 in that order), up to 2 checks each (2 wrong = failed), and no level cap");
    const res = (passed) => PLACEMENT_LEVELS.map((level, i) => ({ level, passed: passed[i] }));
    check(App.placementStartLevel(res([true, true, false, false])) === 5, "Placement: passes 2 and 5 but fails 7 → starts at 5");
    check(App.placementStartLevel(res([true, true, true, true])) === 9, "Placement: passes the level 9 task → starts at 9 (no cap)");
    check(App.placementStartLevel(res([false, false, false, false])) === 1, "Placement: passes nothing → starts at level 1");
    check(App.placementStartLevel(res([false, true, false, false])) === 5, "Placement: the start is the highest level passed, even after failing an earlier one");

    // The whole flow on a unit's state, as the practice page runs it: the next task is chosen when the last one ends.
    // outcomes: pass or fail for each task in turn. Returns the tasks given and the finished state.
    const runPlacement = (unit, outcomes, st0) => {
      const st = st0 || Object.assign(App.freshUnitState(), { placement: App.newPlacement() });
      App.startPlacement(st, tasks, unit, rng);
      const given = [];
      for (let i = 0; i < 10 && App.needsPlacement(st); i++) {
        const t = byId[st.placement.taskIds[st.placement.step]];
        given.push(t);
        App.recordPlacementStep(st, { taskId: t.id, level: t.level, passed: !!outcomes[i], attempts: 2, hints: 0 });
        if (App.needsPlacement(st)) App.nextPlacementTask(st, tasks, unit, rng);
      }
      return { st, given, kinds: given.map((t) => t.type).join(","), levels: given.map((t) => t.level).join(",") };
    };
    const st = Object.assign(App.freshUnitState(), { placement: App.newPlacement() });
    check(App.needsPlacement(st), "A new unit needs placement first");
    const allPass = runPlacement("selection", [true, true, true, true], st);
    check(allPass.levels === "2,5,7,9" && allPass.kinds === "predict,parsons,fill,write" && allPass.given.every((t) => App.isPlacementTask(t) && t.unit === "selection") &&
      st.placement.status === "done" && st.level === 9 && st.placement.startLevel === 9,
      "Placement: passing every task gives one placement task at each of levels 2, 5, 7 and 9, in that order, and starts at 9");
    check(!App.needsPlacement(st), "Placement can't be repeated: once done, the unit goes straight to practice");
    const firstIds = st.placement.taskIds.slice();
    check(App.resetPlacement(st) && App.needsPlacement(st), "A teacher reset allows placement once more");
    const again = runPlacement("selection", [true, true, true, true], st);
    check(again.given.every((t) => !firstIds.includes(t.id)), "After a teacher reset, different placement tasks are given");
    check(st.level === 9 && !App.needsPlacement(st), "…and after taking it again, it can't be repeated without another reset");

    // Placement tasks are never used in practice, and practice can still reach level 10.
    let leaked = 0;
    for (const u of Curriculum.UNITS) for (let lv = 1; lv <= 10; lv++) leaked += App.tasksAt(tasks, u.id, lv).filter(App.isPlacementTask).length;
    check(leaked === 0, "Placement tasks are never chosen for practice");
    const after = (s, ...outcomes) => outcomes.reduce((acc, o) => Object.assign({}, acc, App.applyOutcome(acc, o)), s);
    const top = after(Object.assign(App.freshUnitState(8)), { passed: true, hints: 0, skills: ["if"] }, { passed: true, hints: 0, skills: ["elif"] },
      { passed: true, hints: 0, skills: ["if"] }, { passed: true, hints: 0, skills: ["elif"] });
    check(top.level === 10, "Practice can still reach level 10: a student starting at 8 can reach level 10");

    // ----- Retries: a failed task is followed by a similar one (the same kind) at the same level -----
    // The example: predict (pass), Parsons (fail), Parsons (pass), fill in the blanks (fail) → starts at 5.
    const ex = runPlacement("selection", [true, false, true, false]);
    check(ex.kinds === "predict,parsons,parsons,fill" && ex.levels === "2,5,5,7" && ex.st.placement.startLevel === 5 && ex.given[1].id !== ex.given[2].id,
      "Placement: predict pass, then a failed Parsons gives another Parsons (a different task), then fill in the blanks; the start is the highest passed task (5)");
    // A failed predict is followed by another predict, never a writing task, in every unit and every way it can go.
    const combos = [];
    for (let m = 0; m < 16; m++) combos.push([0, 1, 2, 3].map((b) => !!(m & (1 << b))));
    const placed = Curriculum.UNITS.filter((u) => Curriculum.hasPlacement(u.id)).map((u) => u.id);
    let predictThenWrite = 0, predictRetry = 0, notFour = 0, repeated = 0, wrongStart = 0, notSameKind = 0, aLevelMixed = 0;
    for (const unit of placed) for (const outcome of combos) for (let k = 0; k < 3; k++) {
      const r = runPlacement(unit, outcome);
      if (r.given.length !== 4 || r.st.placement.results.length !== 4) notFour++;
      if (new Set(r.given.map((t) => t.id)).size !== r.given.length) repeated++;
      const passedLevels = r.st.placement.results.filter((x) => x.passed).map((x) => x.level);
      if (r.st.placement.startLevel !== (passedLevels.length ? Math.max(...passedLevels) : 1)) wrongStart++;
      r.given.forEach((t, i) => {
        if (i === 0 || outcome[i - 1]) return;
        const prev = r.given[i - 1];
        if (App.placementKind(t) !== App.placementKind(prev) || t.level !== prev.level) notSameKind++;
        if (prev.type !== t.type) aLevelMixed++;
        if (prev.type === "predict" && t.type === "predict") predictRetry++;
      });
      if (r.given[0].type === "predict" && !outcome[0] && r.given.some((t) => t.type === "write")) predictThenWrite++;
    }
    check(predictThenWrite === 0 && predictRetry > 0 && notSameKind === 0,
      "Placement: a failed predict is followed by another predict, and a student who fails a predict never gets a writing task (every unit, every pass/fail order)");
    // Where level 7 is a writing task (Validation, Authentication; A-level units' level 7 may be), a student who failed
    // the predict gets another predict there instead, or (A-level) the level's other, non-writing task.
    const val = runPlacement("validation", [false, true, true, true]);
    const recs = [0, 1, 2, 3, 4, 5].map(() => runPlacement("recursion", [false, true, true, true]));
    check(val.kinds === "predict,predict,parsons,predict" && val.levels === "2,2,5,2" && val.st.placement.startLevel === 5 &&
      recs.every((r) => !r.given.some((t) => t.type === "write") && r.given[3].level === 7 && r.given[3].type === "trace") &&
      runPlacement("validation", [true, true, true, true]).kinds === "predict,parsons,write,write",
      "Placement: where level 7 is a writing task, a student who failed the predict gets another predict instead (Validation), or the non-writing task at that level (A-level trace)");
    const aLevelUnits = placed.filter(Curriculum.isALevel);
    const aRetry = aLevelUnits.flatMap((unit) => [0, 1, 2, 3, 4, 5].map(() => runPlacement(unit, [true, false, false, true])));
    check(aRetry.every((r) => r.given.slice(1, 4).every((t) => t.level === 5 && App.placementKind(t) === "parsons")) &&
      aRetry.some((r) => new Set(r.given.slice(1, 4).map((t) => t.type)).size === 2) && App.placementKind({ type: "partial-parsons", unit: "recursion" }) === "parsons" &&
      App.placementKind({ type: "partial-parsons", unit: "selection" }) === "partial-parsons",
      "Placement: a failed Parsons is followed by another Parsons; in an A-level unit Parsons and partial-Parsons count as one kind (a level 5 retry can be either)");
    check(notFour === 0 && repeated === 0, "Placement: always exactly 4 tasks, and no task is given twice in one placement (" + placed.length + " units × 16 pass/fail orders × 3 runs)");
    check(wrongStart === 0, "Placement: the start level is always the level of the highest passed task, or 1 if none was passed");
    // When the placement tasks of a kind run out at a level, the retry comes from that unit's practice tasks of that kind and level.
    const fails = runPlacement("selection", [false, false, false, false]);
    check(fails.kinds === "predict,predict,predict,predict" && fails.given.filter(App.isPlacementTask).length === 2 &&
      fails.given.slice(2).every((t) => !App.isPlacementTask(t) && t.unit === "selection" && t.level === 2 && t.type === "predict") && fails.st.placement.startLevel === 1,
      "Placement: when the placement tasks of a kind run out (2 at each level), the retry is a practice task of the same kind and level in that unit; failing all 4 starts at level 1");
    // After a teacher reset, a retry avoids last placement's tasks where there's a choice.
    const resetSt = fails.st;
    const lastIds = resetSt.placement.taskIds.slice();
    App.resetPlacement(resetSt);
    const second = runPlacement("selection", [false, false, false, false], resetSt);
    check(App.isPlacementTask(second.given[0]) && second.given.slice(1).every((t) => !lastIds.includes(t.id)) &&
      new Set(resetSt.placement.used).size === resetSt.placement.used.length && lastIds.concat(second.given.map((t) => t.id)).every((id) => resetSt.placement.used.includes(id)),
      "Placement: after a teacher reset, the retries avoid the tasks used in the last placement where there's a choice (the first task is a placement task, as before)");
    // The result is stored in the same shape as before (the teacher view and the exports read it).
    const p = ex.st.placement;
    check(JSON.stringify(Object.keys(p).sort()) === JSON.stringify(["finishedAt", "results", "startLevel", "status", "step", "taskIds", "used"]) &&
      p.taskIds.length === 4 && p.step === 4 && p.status === "done" && p.results.every((x, i) => JSON.stringify(Object.keys(x)) === '["taskId","level","passed","attempts","hints"]' && x.taskId === p.taskIds[i]) &&
      (() => { const cell = TD.scoreTable({ students: { a: { name: "A" } }, progress: { a: { units: { selection: ex.st } } }, attempts: [], buttonLog: [] }, ["selection"]).rows[0].cells.selection;
        return cell.placementStatus === "done" && cell.placementStart === 5 && cell.placed && cell.level === 5; })(),
      "Placement: the result is stored as before: status, taskIds (the 4 tasks given), step, results ({ taskId, level, passed, attempts, hints }), startLevel, used, finishedAt");
    // Messages: after a failed task, a similar one is next; at the end, which questions were passed and the start level.
    const midway = { status: "in-progress", step: 2, results: [] };
    check(App.placementStepMessage(midway, false) === "That one was tricky – that's fine. You'll get a similar task next." &&
      App.placementStepMessage(ex.st.placement, false) === "This one was tricky – that's fine. Press Next to move on." &&
      App.placementStepMessage(midway, true) === "Well done! Press Next when you're ready." &&
      App.placementResultText(ex.st.placement, "selection") === "Quick check done – thank you! You passed questions 1 and 3 of 4. You'll start at Level 5 (" + Curriculum.levelName(5, "selection") + ")." &&
      App.placementResultText(fails.st.placement, "selection").startsWith("Quick check done – thank you! You didn't pass any of the 4 questions, and that's fine. You'll start at Level 1"),
      "Placement: after a failed task the student is told a similar task is next; at the end they see which questions they passed and their start level");
    // A practice task given as a retry: the placement changes nothing in practice. The level is set once, at the end
    // (the start level); the task isn't marked passed, its practice log and failed-check count aren't touched; its
    // attempts are phase "placement", which the secured score never counts.
    const Secured = require(path.join(ROOT, "secured.js"));
    const mixed = runPlacement("selection", [false, false, true, true]);
    const practiceGiven = mixed.given.filter((t) => !App.isPlacementTask(t));
    const recsP = practiceGiven.map((t, i) => Object.assign(App.attemptRecord({ task: t, unit: "selection", phase: "placement", kind: "attempt", attemptNumber: 1, hints: 0, result: "pass", levelBefore: 5, levelAfter: 5 }),
      { at: new Date(Date.UTC(2026, 10, 1 + i)).toISOString(), taskLevel: 10 })); // even at level 10 they wouldn't count
    const appP = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    check(practiceGiven.length === 1 && practiceGiven[0].level === 2 && mixed.st.level === 5 && mixed.st.placement.startLevel === 5 &&
      Object.keys(mixed.st.passedFingerprints || {}).length === 0 && Object.keys(mixed.st.log || {}).length === 0 && Object.keys(mixed.st.failedAttempts || {}).length === 0 &&
      recsP.every((r) => r.phase === "placement" && !Secured.isTopPass(r, "selection")) && !Secured.score(recsP.concat(recsP), "selection").secured &&
      /const eachLog = \(fn\) => \{ if \(inAssignment\) return; const t = task\(\); if \(practiceTaskInPlacement\(cur\(\), t\)\) return;/.test(appP) &&
      /o\.result === "fail" && !practiceTaskInPlacement\(c, t\)\) \{ unitsOf\(t\)\.forEach\(\(x\) => noteFailedAttempt/.test(appP) &&
      !/recordTaskResult|applyOutcome/.test(appP.slice(appP.indexOf("  function finishPlacementStep("), appP.indexOf("  // The current placement question follows"))),
      "Placement: a practice task given as a retry doesn't change practice: the level is only set at the end, the task isn't marked passed or logged, and placement attempts never count for the secured score");
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
      { category: "WRONG_CHOICE", details: {} }, { category: "WRONG_ERROR_KIND", details: { wrong: [0], answers: ["logic"] } },
    ];
    for (const f of samples) {
      const lines = Checker.failureMessage(f).split("\n");
      check(lines.length === 2 && lines[1].startsWith("What to try: ") && lines[1].length > 30 && !lines[0].includes("What to try"),
        `Failure message for ${f.category}${f.details.parsons ? " (Parsons)" : ""} ends with one "What to try" line`);
    }
    check(Checker.CATEGORIES.every((c) => samples.some((f) => f.category === c)), "Every failure category has a \"What to try\" line");
    // The practice page shows input, expected output and actual output on labelled lines, and "(no output)" for nothing printed.
    const appSrc = fs.readFileSync(path.join(ROOT, "app.js"), "utf8") + fs.readFileSync(path.join(ROOT, "task-view.js"), "utf8");
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

  // ===================== The code editor: Enter, Tab and Shift-Tab =====================
  {
    // A one-cursor stand-in for CodeMirror 5: the calls editorEnter and editorTab make.
    const fakeCm = (text, sel) => {
      const lines = text.split("\n");
      let cur = { line: lines.length - 1, ch: lines[lines.length - 1].length };
      return {
        value: () => lines.join("\n"), cursor: () => cur, how: null,
        getCursor: () => cur, getLine: (n) => lines[n], somethingSelected: () => !!sel,
        replaceSelection(s) {
          const L = lines[cur.line];
          const parts = (L.slice(0, cur.ch) + s).split("\n");
          const last = parts.pop();
          lines.splice(cur.line, 1, ...parts, last + L.slice(cur.ch));
          cur = { line: cur.line + parts.length, ch: last.length };
        },
        indentSelection(how) {
          this.how = how;
          const L = lines[cur.line];
          const n = how === "add" ? -4 : /^ {0,4}/.exec(L)[0].length;
          lines[cur.line] = n < 0 ? "    " + L : L.slice(n);
          cur = { line: cur.line, ch: Math.max(0, cur.ch - n) };
        },
      };
    };
    const enter = (text) => { const cm = fakeCm(text); App.editorEnter(cm); return { value: cm.value(), cursor: cm.cursor() }; };
    const afterColon = enter("for i in range(3):");
    check(afterColon.value === "for i in range(3):\n    " && afterColon.cursor.line === 1 && afterColon.cursor.ch === 4 &&
      enter("    if i > 1:").value === "    if i > 1:\n        " && enter("while True:  # forever").value === "while True:  # forever\n    ",
      "Enter after a line ending in a colon indents the new line one level (4 spaces) more than that line");
    check(enter("    print(i)").value === "    print(i)\n    " && enter("        total += i").value === "        total += i\n        ",
      "Enter after an indented line gives the new line the same indent");
    check(enter("print(1)").value === "print(1)\n" && enter("x = int(input(\"Number: \"))").value === "x = int(input(\"Number: \"))\n" &&
      enter("").value === "\n" && enter("print(\"a:\")").value === "print(\"a:\")\n" && enter("else").value === "else\n",
      "Enter after a plain line (not indented, no colon at the end) adds a new line with no indent");
    check(App.enterIndent("for x in y:") === "    " && App.enterIndent("    x = 1") === "    " && App.enterIndent("x = 1") === "" && App.EDITOR_INDENT === "    ",
      "enterIndent (both editors) gives 4 spaces after a colon, the line's own indent after an indented line, and nothing otherwise");
    const tab = fakeCm("x = 1");
    App.editorTab(tab, 1);
    const shift = fakeCm("        print(i)");
    App.editorTab(shift, -1);
    const shiftShort = fakeCm("  y");
    App.editorTab(shiftShort, -1);
    const tabSel = fakeCm("print(i)", true);
    App.editorTab(tabSel, 1);
    check(tab.value() === "x = 1    " && tab.how === null && shift.value() === "    print(i)" && shift.how === "subtract" &&
      shiftShort.value() === "y" && tabSel.value() === "    print(i)" && tabSel.how === "add",
      "Tab adds 4 spaces (or indents the selected lines); Shift-Tab takes up to 4 spaces off the line");
    const appEd = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    const cmSetup = appEd.slice(appEd.indexOf("CodeMirror.fromTextArea("), appEd.indexOf("cm.on(\"keydown\""));
    check(/smartIndent: false/.test(cmSetup) && /electricChars: false/.test(cmSetup) && /Enter: editorEnter/.test(cmSetup) &&
      /Tab: indentOrLeave\(1\)/.test(cmSetup) && /"Shift-Tab": indentOrLeave\(-1\)/.test(cmSetup) && /Esc: /.test(cmSetup) && !/smartIndent: true/.test(appEd) &&
      /editorTab\(cm, dir\)/.test(appEd) && /insert\("\\n" \+ enterIndent\(/.test(appEd),
      "CodeMirror's smart indent and electric chars are off, Enter uses editorEnter, Tab and Shift-Tab (and Esc then Tab) are still bound; the plain text box uses enterIndent too");
  }

  // ===================== The starter comment on write-from-scratch tasks =====================
  {
    const commented = tasks.filter((x) => App.hasCommentStarter(x));
    const scratchT = byId["out-L9a"]; // starter "# Write your program here"
    const withCode = tasks.find((x) => x.type === "write" && /^class Node:/.test(x.starter || ""));
    const whole = tasks.find((x) => x.type === "write" && x.starter === "# Write the whole program here\n");
    check(commented.length >= 200 && App.hasCommentStarter(scratchT) && whole && App.hasCommentStarter(whole) && withCode && !App.hasCommentStarter(withCode) &&
      !tasks.some((x) => x.type !== "write" && x.type !== "scratch" && App.hasCommentStarter(x)),
      "Write tasks whose starter is only a comment (" + commented.length + " tasks) are found; a starter with code isn't one");
    const fresh = App.initialDraft(scratchT);
    const removed = App.clearStarterComment(scratchT, fresh);
    const freshAll = commented.every((x) => { const d = App.initialDraft(x); return App.clearStarterComment(x, d) && d.code === ""; });
    check(fresh.code === "" && removed && freshAll, "On the first click into the editor the starter comment is removed while nothing has been typed");
    const typed = { code: scratchT.starter + "\nprint(\"hi\")" };
    const overwritten = { code: "print(\"hi\")" };
    const keptCode = { code: withCode.starter };
    check(!App.clearStarterComment(scratchT, typed) && typed.code === scratchT.starter + "\nprint(\"hi\")" &&
      !App.clearStarterComment(scratchT, overwritten) && overwritten.code === "print(\"hi\")" &&
      !App.clearStarterComment(withCode, keptCode) && keptCode.code === withCode.starter,
      "Once the student has typed, the code is left alone (and a starter with real code is never changed)");
    // The removed comment stays removed: the empty draft is what's saved, and a later visit (or reload) opens it.
    const current = { taskId: scratchT.id, started: true, hints: 0, attempts: 0, showHow: 0, finished: false, passed: false, draft: App.initialDraft(scratchT) };
    App.clearStarterComment(scratchT, current.draft);
    const reopened = JSON.parse(JSON.stringify(current));
    const again = App.clearStarterComment(scratchT, reopened.draft);
    const appC = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    check(reopened.draft.code === "" && !again &&
      /esc\(c\.draft\.code\)/.test(appC.slice(appC.indexOf("function writeBody("), appC.indexOf("function wireWrite("))) &&
      /cm\.on\("focus", \(\) => \{ if \(clearStarterComment\(task\(\), c\.draft\)\) \{ cm\.setValue\(""\); cm\.clearHistory\(\); \} \}\)/.test(appC) &&
      /cm\.on\("change", \(\) => \{ c\.draft\.code = cm\.getValue\(\); save\(\);/.test(appC) &&
      /ta\.addEventListener\("focus", \(\) => \{ if \(clearStarterComment\(task\(\), c\.draft\)\) \{ ta\.value = ""; save\(\); \} \}\)/.test(appC),
      "The starter comment doesn't come back: the empty draft is saved and the editor opens the saved draft on the next visit");
    check(App.codeToRun(scratchT, scratchT.starter) === "" && App.codeToRun(whole, whole.starter).trim() === "" &&
      App.codeToRun(scratchT, scratchT.starter + "\nprint(1)") === "\nprint(1)" && App.codeToRun(scratchT, "print(1)") === "print(1)" &&
      App.codeToRun(scratchT, "# my own note\nprint(1)") === "# my own note\nprint(1)" && App.codeToRun(withCode, withCode.starter) === withCode.starter &&
      /const code = codeToRun\(t, d\.code\)/.test(appC) && /return \{ code \};/.test(appC),
      "The starter comment isn't in the code that is run or checked (its line is left blank, so error line numbers still match)");
  }

  // ===================== Layout: Parsons lines wrap; the Students page has two rows per student =====================
  {
    const cssL = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
    const appL = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    const rule = (sel) => { const i = cssL.indexOf(sel + " {"); return i < 0 ? "" : cssL.slice(i, cssL.indexOf("}", i)); };
    // Parsons: a long line wraps inside its column; the columns can't grow past the task card (so nothing runs under
    // the side panel); continuation lines hang 4ch further in than the line's start.
    const pCode = rule(".p-line code");
    check(/grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/.test(rule(".parsons")) && /\.parsons \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(cssL) &&
      /min-width: 0/.test(rule(".parsons-col")) && /\.layout \{ display: grid; grid-template-columns: minmax\(0, 1fr\) 18rem;/.test(cssL) &&
      /white-space: pre-wrap/.test(pCode) && /overflow-wrap: anywhere/.test(pCode) && /min-width: 0/.test(pCode) && !/white-space: pre;/.test(pCode) && !/overflow-x/.test(pCode) &&
      /flex-wrap: wrap/.test(rule(".p-line")) && /margin-left: auto/.test(rule(".p-btns")),
      "Parsons: lines wrap (pre-wrap) instead of running off to the side, and the columns can't grow under the box on the right");
    const hang = /padding-left: calc\(var\(--p-indent, 0ch\) \+ (\d+)ch\); text-indent: -(\d+)ch;/.exec(pCode);
    check(hang && hang[1] === hang[2] && +hang[1] >= 2 && /'<code style="--p-indent:' \+ indent \* 2\.5 \+ 'ch">'/.test(appL) && !/<code style="padding-left:/.test(appL),
      "Parsons: a wrapped line keeps its indent, and its continuation lines are indented past the start of the code (a hanging indent)");

    // The Students page: two rows per student in every table, Freshness then Level.
    const D = Date.parse("2026-11-13T12:00:00Z");
    const st = (level, extra) => Object.assign({ level, placement: { status: "done", startLevel: 3 }, buttonsUsed: {}, failsInARow: 0 }, extra || {});
    const passes = (sid, unit, daysAgo) => daysAgo.map((d) => ({ studentId: sid, unit, kind: "attempt", result: "pass", hints: 0, phase: "endless", at: new Date(D - d * 86400000).toISOString() }));
    const ovData = {
      students: { a: { name: "Ann" }, b: { name: "Bo" }, c: { name: "Cy" }, d: { name: "Di" } },
      progress: {
        a: { units: { output: st(10, { passedTop: true }), variables: st(10), "data-types": st(10), maths: st(10), selection: st(4, { buttonsUsed: { "too-easy": true } }) } },
        b: { units: { output: st(6, { buttonsUsed: { "too-hard": true } }), variables: st(9), strings: st(2, { placement: { status: "pending" } }) } },
        c: { units: { output: st(2, { placement: { status: "in-progress" } }) } },
        d: { units: {} },
      },
      attempts: [].concat(passes("a", "output", [3, 2]), passes("a", "variables", [12, 11]), passes("a", "data-types", [17, 16]), passes("a", "maths", [40, 39])),
      buttonLog: [], levelLog: [], placementLog: [], units: Curriculum.UNITS,
    };
    const gcse = Curriculum.stageUnits("gcse");
    const ovTable = TD.scoreTable(ovData, gcse, D);
    const flagsFn = (c) => (c.tooEasy ? '<span class="flag flag-easy">Too easy</span>' : "") + (c.tooHard ? '<span class="flag flag-hard">Way too hard</span>' : "");
    const html = TD.overviewTablesHtml({ rows: ovTable.rows, unitIds: gcse, unitGroups: Curriculum.UNIT_GROUPS, unitTitle: Curriculum.unitTitle, sortKey: "name", sortDir: 1, when: () => "today", flagsHtml: flagsFn });
    const tablesL = html.split('<div class="table-wrap overview-wrap"').slice(1);
    const groupsL = TD.overviewGroups(gcse, Curriculum.UNIT_GROUPS);
    const everyTwo = tablesL.every((t) => {
      const bodies = t.split('<tbody class="ov-student">').slice(1);
      return bodies.length === 4 && bodies.every((b) => (b.match(/<tr /g) || []).length === 2 && /^<tr class="ov-fresh"><th scope="rowgroup" rowspan="2" class="ov-name">/.test(b) &&
        /<th scope="row" class="ov-shows">Freshness<\/th>[\s\S]*<tr class="ov-level"><th scope="row" class="ov-shows">Level<\/th>/.test(b));
    });
    // One table per group (prompt 9, 2026-11): no "(continued)" tables and no limit on the units in a table.
    const gcseGroups = Curriculum.UNIT_GROUPS.flatMap((g) => g.subsections || [g]).map((g) => g.units.filter((u) => gcse.includes(u))).filter((u) => u.length);
    check(tablesL.length === groupsL.length && everyTwo && groupsL.reduce((n, g) => n + g.units.length, 0) === gcse.length &&
      JSON.stringify(groupsL.map((g) => g.units)) === JSON.stringify(gcseGroups) && new Set(groupsL.map((g) => g.id)).size === groupsL.length &&
      TD.OVERVIEW_MAX_UNITS === undefined && !/\(continued\)/.test(html),
      "Students page: every student has two rows in every table (Freshness, then Level, the name merged across both), and each group of units is one table with all its units");
    // The same text and colours as the single cell before, split between the rows: a frozen copy of the old cell code.
    const escO = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const bandO = (c) => (c.band ? '<span class="rag rag-' + c.band.cls + '">' + c.score + "% · " + escO(c.band.label) + "</span>"
      : c.levelBand ? '<span class="rag rag-' + c.levelBand.cls + '">' + escO(c.levelBand.label) + "</span>" : "");
    const NP = '<span class="rag rag-none">Placement to do</span>'; // "Not placed yet" until prompt 17 (review finding N2)
    const oldCell = (c) => {
      if (!c.started) return '<span class="small">Not started</span>';
      const placement = c.placementStatus === "done" ? "Placement: started at " + c.placementStart : "Placement: " + TD.PLACEMENT_STATUS[c.placementStatus];
      // (Since prompt 16, review finding B3: a unit still to be placed shows "Placement to do", not its level.)
      return (c.placed ? bandO(c) + (c.secured ? "" : '<br><span class="small">Not secured yet</span>') : NP) +
        (c.secured ? '<br><span class="lvl">Level ' + c.level + "</span>" : !c.placed ? '<br><span class="rag rag-placement">Placement to do</span>' : "") +
        (c.complete ? ' <span class="badge-complete" title="Passed a level 10 task">★ Complete</span>' : "") +
        '<br><span class="small">' + escO(placement) + "</span>" + (c.tooEasy || c.tooHard ? "<br>" + flagsFn(c) : "");
    };
    const oldAvg = (r) => (r.band ? '<span class="rag rag-' + r.band.cls + '">' + r.average + "% · " + escO(r.band.label) + "</span>"
      : r.levelBand ? '<span class="rag rag-' + r.levelBand.cls + '">Average ' + escO(r.levelBand.label.toLowerCase()) + '</span><br><span class="small">No unit secured yet</span>'
      : r.startedAny ? NP : '<span class="small">Not started</span>'); // nothing started: "Not started" (after review finding N2)
    // Pieces: each element's class list and text (order kept within a row), so the split must lose and add nothing.
    const pieces = (h) => (h.match(/<span class="[^"]+"[^>]*>[^<]*/g) || []).map((s) => s.replace(/ title="[^"]*"/, "")).concat((h.replace(/<[^>]+>/g, " ").match(/\S+/g) || []).join(" ")).sort();
    const words = (h) => (h.replace(/<[^>]+>/g, " ").match(/\S+/g) || []).sort().join(" ");
    const all = ovTable.rows.flatMap((r) => gcse.map((u) => r.cells[u]));
    const kinds = { notStarted: 0, notPlaced: 0, learning: 0, secured: 0, flags: 0, complete: 0 };
    const sameCells = all.every((c) => {
      const now = TD.overviewCell(c, flagsFn);
      const old = oldCell(c);
      if (!c.started) kinds.notStarted++; else if (!c.placed) kinds.notPlaced++; else if (c.secured) kinds.secured++; else kinds.learning++;
      if (c.tooEasy || c.tooHard) kinds.flags++;
      if (c.complete) kinds.complete++;
      const both = c.started ? now.fresh + now.level : now.fresh; // "Not started" is in both rows
      const freshRight = !c.started || (c.secured ? now.fresh.includes('class="rag rag-' + c.band.cls + '"') && !/rag-lv-/.test(now.fresh) : !c.placed ? now.fresh === NP : /Not secured yet/.test(now.fresh));
      const levelRight = !c.started || (!c.placed ? now.level.startsWith('<span class="rag rag-placement">Placement to do</span>') && !/Level \d/.test(now.level)
        : c.placed && !c.secured ? now.level.startsWith('<span class="rag rag-' + c.levelBand.cls + '">' + c.levelBand.label) : now.level.startsWith('<span class="lvl">Level ' + c.level));
      return words(both) === words(old) &&
        JSON.stringify(pieces(both).filter((p) => p.startsWith("<"))) === JSON.stringify(pieces(old).filter((p) => p.startsWith("<"))) && freshRight && levelRight;
    });
    const sameAvg = ovTable.rows.every((r) => { const a = TD.overviewAverage(r); return words(a.fresh + a.level) === words(oldAvg(r)) &&
      JSON.stringify(pieces(a.fresh + a.level).filter((p) => p.startsWith("<"))) === JSON.stringify(pieces(oldAvg(r)).filter((p) => p.startsWith("<"))); });
    check(sameCells && sameAvg && Object.values(kinds).every((n) => n > 0) && ovTable.rows.some((r) => r.band) && ovTable.rows.some((r) => !r.band && r.levelBand) && ovTable.rows.some((r) => !r.band && !r.levelBand),
      "Students page: the Freshness row and the Level row together show exactly the old cell's text and colours (band chip in Freshness, level chip, placement, ★ Complete and flags in Level), for every kind of cell and average");
    // Each table scrolls sideways inside its own wrapper (prompt 9); the page doesn't. The fixed columns' widths are
    // custom properties on the wrapper, and the table is at least as wide as all its columns at their least width.
    check(/overflow-x: auto;/.test(rule(".overview-wrap")) && /--ov-name: [\d.]+rem; --ov-shows: [\d.]+rem;/.test(rule(".overview-wrap")) &&
      /table-layout: fixed;/.test(rule(".overview-table")) && /width: max\(100%, calc\(var\(--ov-name\) \+ var\(--ov-shows\) \+ var\(--ov-avg\) \+ var\(--ov-units, 1\) \* var\(--ov-unit\)\)\)/.test(rule(".overview-table")) &&
      /grid-template-columns: minmax\(0, 1fr\)/.test(rule(".overview-tables")) && /container-type: inline-size/.test(rule(".overview-tables")) &&
      !/@container \(max-width: 849px\)/.test(cssL) && !/td\[data-label\]::before/.test(cssL) &&
      /overflow-wrap: anywhere/.test(rule(".overview-table th, .overview-table td")) && !/\.unit-cell \{ white-space: nowrap; \}/.test(cssL) &&
      !/id="overview-table"|id="overview-head"|id="overview-rows"/.test(fs.readFileSync(path.join(ROOT, "teacher.html"), "utf8")),
      "Students page: each table scrolls sideways inside its own wrapper (no tiles any more), long names wrap in their cells, and the grid around the tables can't widen the page");
    const tJs = fs.readFileSync(path.join(ROOT, "teacher.js"), "utf8");
    check(/\$\("overview-tables"\)\.innerHTML = TD\.overviewTablesHtml\(/.test(tJs) && /\$\("overview-tables"\)\.addEventListener\("click"/.test(tJs) &&
      /\$\("st-summary"\)\.innerHTML = TD\.SUMMARY_ROWS\.map/.test(tJs) && /renderCodeCards\(\);/.test(tJs) && /python-practice-overview-/.test(tJs) &&
      /id="overview-tables"/.test(fs.readFileSync(path.join(ROOT, "teacher.html"), "utf8")) && /id="st-summary"/.test(fs.readFileSync(path.join(ROOT, "teacher.html"), "utf8")),
      "Students page: the summary tiles, class code card and exports are unchanged; a column heading in any table sorts them all");
  }

  // ===================== "Show me how" examples on templates =====================
  // Every non-derived template (hand-written, combined, write-from-scratch) has its own worked example, chosen by the
  // tasks' rule from its own unit (a combined one: its first skill's), type (write from scratch: write) and skills.
  {
    const W = require(path.join(ROOT, "tools", "add-worked-examples.js"));
    const Tm = require(path.join(ROOT, "templates.js"));
    const tplW = JSON.parse(fs.readFileSync(path.join(ROOT, "templates.json"), "utf8"));
    const byIdW = Object.fromEntries(tasks.map((t) => [t.id, t]));
    const nonDerived = tplW.filter((t) => !t.derived);
    const derived = tplW.filter((t) => t.derived);
    const srcKey = (t) => { const s = byIdW[t.source]; return s.unit + ":" + s.worked_example.skill; };
    const keyOf = (t) => W.templateExampleKey(t);
    const kept = nonDerived.filter((t) => keyOf(t) === srcKey(t));
    const moved = nonDerived.filter((t) => keyOf(t) !== srcKey(t));
    const selVal = nonDerived.filter((t) => t.units.some((u) => ["selection", "validation"].includes(u)));
    // (2026-11, Debugging (GCSE): 6 more combined templates, 3 with Authentication and 3 with Trace tables, and 40 more
    // derived ones. The 3 with Authentication take an Authentication example, the 3 with Trace tables keep their
    // Debugging (GCSE) source's.)
    check(nonDerived.length === 272 && nonDerived.every((t) => t.worked_example && t.worked_example.problem && t.worked_example.code && typeof t.worked_example.output === "string" && t.worked_example.key_idea) &&
      selVal.length === 35 && selVal.every((t) => t.worked_example),
      "Show me how: every non-derived template (272, including the 35 Selection and Validation ones) has its own worked example");
    check(nonDerived.every((t) => t.worked_example.skill === keyOf(t).split(":")[1] && keyOf(t).startsWith(W.templateUnit(t) + ":")) &&
      moved.length === 118 && moved.every((t) => JSON.stringify(t.worked_example) !== JSON.stringify(byIdW[t.source].worked_example)) &&
      moved.some((t) => t.id === "sel-t8" && keyOf(t) === "selection:modulo-conditions") && moved.some((t) => t.id === "comb-val-auth-pin" && keyOf(t) === "validation:type-check"),
      "Show me how: the 118 templates whose source task's example is another topic's use the key their own unit, type and skills give (e.g. sel-t8: selection:modulo-conditions)");
    check(kept.length === 154 && kept.every((t) => JSON.stringify(t.worked_example) === JSON.stringify(byIdW[t.source].worked_example)),
      "Show me how: the 154 templates whose example already fitted keep exactly the same example");
    check(derived.length === 1381 && derived.every((t) => !("worked_example" in t) && byIdW[t.source].worked_example && W.exampleKey(byIdW[t.source]) === W.exampleKey({ unit: t.units[0], type: t.type, skills: t.skills })),
      "Show me how: derived templates (1381) have no example of their own, so their variants use their source task's, which has the same unit, type and skills");
    const combined = nonDerived.filter((t) => t.units.length > 1);
    check(combined.length === 139 && combined.every((t) => W.templateUnit(t) === App.unitOfSkill(t.skills[0], t.units) && keyOf(t).startsWith(W.templateUnit(t) + ":")) &&
      combined.some((t) => W.templateUnit(t) !== t.units[0]),
      "Show me how: a combined template's example comes from the unit of its first skill");
    // Across several seeds: a different context, not the variant's solution, and the stored output is a fresh run's.
    const literals = (code) => (code.match(/"([^"\\\n]{4,})"|'([^'\\\n]{4,})'/g) || []).map((s) => s.slice(1, -1));
    let variantsW = 0, sharedW = 0, sameW = 0;
    for (const tpl of nonDerived) for (const seed of [11, 2029, 40961, 777777]) {
      const v = Tm.expand(tpl, seed);
      variantsW++;
      const text = v.description + "\n" + v.solution;
      if (literals(tpl.worked_example.code).some((s) => text.includes(s))) sharedW++;
      if (tpl.worked_example.code.trim() === String(v.solution).trim()) sameW++;
    }
    const distinct = [...new Map(nonDerived.map((t) => [t.worked_example.code + "|" + JSON.stringify(t.worked_example.inputs || []), t.worked_example])).values()];
    const freshW = runPython(distinct.map((e) => ({ code: e.code, inputs: e.inputs || [] })));
    check(variantsW === 1088 && !sharedW && !sameW && freshW.every((r, i) => !r.error && Checker.normalise(r.output) === distinct[i].output),
      "Show me how: on 4 seeds of every non-derived template (1088 variants), the example shares no 4+ character text with the variant, isn't its solution, and its stored output matches a fresh run (" + distinct.length + " examples)");
    // The tool: running it again changes nothing (tasks.json and templates.json).
    const againT = W.withTemplateExamples(tplW);
    const againK = W.withWorkedExamples(tasks);
    const appW = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    check(!againT.missing.length && JSON.stringify(againT.templates) === JSON.stringify(tplW) && !againK.missing.length && JSON.stringify(againK.tasks) === JSON.stringify(tasks) &&
      /const tpl = t\.templateId && templateById\[t\.templateId\];\s*if \(tpl && tpl\.worked_example\) return tpl\.worked_example;/.test(appW),
      "Show me how: tools/add-worked-examples.js changes nothing when run again (tasks.json and templates.json), and a variant shows its template's example before its source task's");
  }

  // ===================== Practice page: the address =====================
  // The unit parameter is ignored in endless mode and assignments (they set their own tasks).
  {
    const appV = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    check(/const unitId = endless \|\| inAssignment \? null : params\.get\("unit"\);/.test(appV),
      "Practice page: the unit parameter is ignored in endless mode and assignments");
  }

  // ===================== The five Validation units: the rules they were built to =====================
  // tests/validation-units-check.js (a child process: chooseNextTask is async) makes the templates' variants and runs
  // a climb up each unit's ladder; its results are checked here.
  {
    const V = ["validation-presence", "validation-type", "validation-range", "validation-format", "validation-length"];
    const vr = JSON.parse(require("child_process").execFileSync(process.execPath, [path.join(ROOT, "tests", "validation-units-check.js")], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
    const info = Object.fromEntries(vr.templates.map((t) => [t.id, t]));
    const unitTasks = (u) => tasks.filter((t) => t.unit === u);
    const practiceOf = (u) => unitTasks(u).filter((t) => !App.isPlacementTask(t));
    const placementOf = (u) => unitTasks(u).filter(App.isPlacementTask);
    const right = (t) => t.options[t.answer];
    // 1. Three practice tasks at every level, each with a derived template making 5 or more different variants.
    const thin = [];
    for (const u of V) for (let lv = 1; lv <= 10; lv++) if (practiceOf(u).filter((t) => t.level === lv).length !== 3) thin.push(u + " level " + lv);
    const weak = V.flatMap(practiceOf).filter((t) => { const d = info["d-" + t.id]; return !d || d.different < 5 || d.poolSize < 5; }).map((t) => t.id);
    check(!thin.length && !weak.length,
      "Five Validation units: every level of every unit has 3 practice tasks, and every practice task has a derived template that makes at least 5 different variants" + (thin.concat(weak).length ? " (" + thin.concat(weak).join(", ") + ")" : ""));
    // 2. Different right answers at each predict level, and from each predict template's variants.
    const sameAnswers = V.flatMap((u) => [1, 2].filter((lv) => new Set(practiceOf(u).filter((t) => t.level === lv).map(right)).size !== 3).map((lv) => u + " level " + lv));
    const oneAnswer = vr.templates.filter((t) => t.type === "predict" && t.answers < 2).map((t) => t.id);
    check(!sameAnswers.length && !oneAnswer.length,
      "Five Validation units: at each predict level the 3 tasks have different right answers, and each predict template's variants have more than one right answer (inputs from both sides of the check)" + (sameAnswers.concat(oneAnswer).length ? " (" + sameAnswers.concat(oneAnswer).join(", ") + ")" : ""));
    // 3. Tests: one for a predict task; otherwise two, an answer that passes the check and one that fails it.
    const badTests = V.flatMap(unitTasks).filter((t) => (t.type === "predict" ? t.tests.length !== 1 : t.tests.length !== 2 || t.tests[0].expected === t.tests[1].expected)).map((t) => t.id)
      .concat(vr.templates.filter((t) => t.sameTests).map((t) => t.id));
    check(!badTests.length,
      "Five Validation units: every predict task has exactly 1 test, and every other task (practice and placement) and template variant has 2 tests, one answer that passes the check and one that fails it" + (badTests.length ? " (" + badTests.join(", ") + ")" : ""));
    const clashes = vr.templates.filter((t) => t.shared).map((t) => t.id);
    check(!clashes.length && vr.made > 4000,
      "Five Validation units: no template variant (" + vr.made + " made, in every context) shares 4+ character text with its worked example" + (clashes.length ? " (" + clashes.join(", ") + ")" : ""));
    // 4. Variety: at least 90 different variants at every level.
    const perLevel = V.flatMap((u) => Array.from({ length: 10 }, (_, i) => ({ k: u + " level " + (i + 1), n: vr.templates.filter((t) => t.unit === u && t.level === i + 1).reduce((a, t) => a + t.different, 0) })));
    const low = perLevel.filter((x) => x.n < 90);
    check(!low.length && vr.templates.length === 150,
      "Five Validation units: every level of every unit offers at least 90 different variants across its templates (fewest: " + Math.min(...perLevel.map((x) => x.n)) + "; each made and checked where a template has up to 150)" + (low.length ? " (" + low.map((x) => x.k + " " + x.n).join(", ") + ")" : ""));
    // 5. Placement: 2 at each of levels 2, 5, 7 and 9, none a copy of a practice task.
    const badPlacement = V.filter((u) => {
      const pl = placementOf(u), pr = practiceOf(u);
      return [2, 5, 7, 9].map((lv) => pl.filter((t) => t.level === lv).length).join() !== "2,2,2,2" || pl.length !== 8 ||
        pl.some((p) => pr.some((t) => t.solution === p.solution || t.title === p.title || t.description === p.description));
    });
    check(!badPlacement.length,
      "Five Validation units: every unit has 2 placement tasks at each of levels 2, 5, 7 and 9, and none is a copy of a practice task (its program, title and prompt are its own)" + (badPlacement.length ? " (" + badPlacement.join(", ") + ")" : ""));
    // 6 and 7. The climb.
    const passAll = vr.sims.filter((s) => s.kind === "pass-all"), failAt7 = vr.sims.filter((s) => s.kind === "fail-at-7");
    check(passAll.length === 5 && passAll.every((s) => s.top === 10 && !s.ranOut) && failAt7.length === 5 && failAt7.every((s) => !s.ranOut && s.steps === 60 && s.levels.includes("7x")),
      "Five Validation units: in a simulated climb, a student who passes everything reaches level 10 in every unit, and a student placed at level 7 who fails every level 7 task never runs out of tasks (60 tasks each; no \"Your next task couldn't be made\")");
    const repeats = vr.sims.filter((s) => s.sameId || s.sameAnswer).map((s) => s.unit + " " + s.kind);
    check(!repeats.length && vr.sims.length === 10,
      "Five Validation units: in every simulated climb (10 of them), no two tasks in a row share an id or a right answer" + (repeats.length ? " (" + repeats.join(", ") + ")" : ""));
  }

  // ===================== The old Validation unit: only for students who started it =====================
  {
    const C = Curriculum;
    const NEW = ["validation-presence", "validation-type", "validation-range", "validation-format", "validation-length"];
    const sees = (progress, attempts) => C.UNITS.map((u) => u.id).filter((u) => C.studentSeesUnit(u, progress, attempts));
    const all = C.UNITS.map((u) => u.id);
    const fresh = sees({ units: {} }, []);
    const savedState = sees({ units: { validation: App.freshUnitState(4), "validation-range": App.freshUnitState(2) } }, []);
    const attemptOnly = sees({ units: {} }, [{ kind: "attempt", unit: "validation", taskId: "val-L3r", result: "fail" }]);
    const passedOnly = C.hasStartedUnit("validation", { units: { validation: { passedFingerprints: { "val-L1i": "2026-11-01" } } } }, []);
    const others = sees({ units: { selection: App.freshUnitState(5), "validation-type": App.freshUnitState(3) } }, [{ kind: "attempt", unit: "selection", taskId: "sel-L1a", result: "pass" }]);
    check(!fresh.includes("validation") && NEW.every((u) => fresh.includes(u)) && fresh.length === all.length - 1 &&
      savedState.includes("validation") && savedState.length === all.length && attemptOnly.includes("validation") && passedOnly &&
      !others.includes("validation") && NEW.every((u) => others.includes(u)) &&
      C.studentUnitTitle("validation") === "Validation (old version)" && C.studentUnitTitle("validation-range") === "Range checks" && C.unitTitle("validation") === "Validation",
      "Old Validation unit: a new student sees the five Validation units but not the old one; a student with saved progress in it (or only an attempt, or only a passed task) sees it too, as Validation (old version); a student who has started other units only doesn't");
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const studentPages = ["home.js", "progress.js", "endless.js"];
    const defines = fs.readdirSync(ROOT).filter((f) => f.endsWith(".js")).filter((f) => /function hasStartedUnit|const OLD_UNITS =/.test(read(f)));
    check(studentPages.every((f) => /self\.Curriculum\.studentSeesUnit\(u\.id, progress, (attempts|studentAttempts)\)/.test(read(f)) && /self\.Curriculum\.studentUnitTitle\(u\.id\)/.test(read(f))) &&
      /studentUnitTitle\(unit\.id\)/.test(read("app.js")) && defines.join() === "curriculum.js" && !/studentSeesUnit/.test(read("teacher.js") + read("teacher-data.js")) &&
      C.stageUnits("gcse").includes("validation") && NEW.every((u) => C.stageUnits("gcse").includes(u)) && C.UNITS.some((u) => u.id === "validation"),
      "Old Validation unit: one rule in curriculum.js (studentSeesUnit, studentUnitTitle), used by the home page, My progress, endless mode and the practice page's title; teachers still see all six units");
  }

  // ===================== Prompt 1 (2026-11): Boolean note, Students page blocks, A-level tables, nicknames, export popups =====================
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const TDp = require(path.join(ROOT, "teacher-data.js"));
    const tplP = JSON.parse(read("templates.json"));
    // Item 1: the write tasks that print a Boolean they work out say it must be the Boolean value, not the text.
    const NOTE = "The output must be a Boolean value, not the text \"True\" printed with print(\"True\").";
    const BOOL_TASKS = ["types-L8d", "types-L9e", "types-L9f", "types-L10d", "types-L10e", "types-L10f", "types-P9c", "str-L8c", "str-L10a", "fr-L8c"];
    const byIdP = Object.fromEntries(tasks.map((t) => [t.id, t]));
    const typeTrue = tasks.filter((t) => t.tests.some((x) => /Type:\s*(True|False)\b/.test(x.expected)));
    check(BOOL_TASKS.every((id) => byIdP[id] && byIdP[id].explainer === NOTE && byIdP[id].type === "write" && byIdP[id].tests.some((x) => /\b(True|False)\b/.test(x.expected))) &&
      tplP.filter((t) => t.derived && BOOL_TASKS.includes(t.source)).every((t) => t.explainer === NOTE) && tplP.filter((t) => t.derived && BOOL_TASKS.includes(t.source)).length === 9 &&
      byIdP["types-L9f"].tests[0].expected === "Signed: True\nType: <class 'bool'>" && !typeTrue.length,
      "Boolean output: the 10 write tasks that print a Boolean they work out (types-L9f and others) explain that it must be the Boolean value, not the text \"True\"; their derived templates too; no expected output shows a value where a type belongs");
    // Items 2 and 3: every group of units is one collapsible block (one table inside, since prompt 9), open unless
    // closed, with the A-level subsections as blocks too; without buttonHtml the tables are as before.
    const all = Curriculum.UNITS.map((u) => u.id);
    const ovData = { students: { a: { name: "Ann" } }, progress: { a: { units: {} } }, attempts: [], buttonLog: [], levelLog: [], placementLog: [], units: Curriculum.UNITS };
    const rows = TDp.scoreTable(ovData, all).rows;
    const btn = (id, bodyId, title, open, extra) => '<button type="button" class="group-toggle" data-group="' + id + '" aria-expanded="' + open + '" aria-controls="' + bodyId + '">' + title + (extra || "") + "</button>";
    const o = { rows, unitIds: all, unitGroups: Curriculum.UNIT_GROUPS, unitTitle: Curriculum.unitTitle, sortKey: "name", sortDir: 1, when: () => "today", flagsHtml: () => "" };
    const plain = TDp.overviewTablesHtml(o);
    const open = TDp.overviewTablesHtml(Object.assign({}, o, { buttonHtml: btn, collapsed: [] }));
    const closed = TDp.overviewTablesHtml(Object.assign({}, o, { buttonHtml: btn, collapsed: ["ov-fundamentals", "ov-data-structures"] }));
    const blocks = [...open.matchAll(/<section class="overview-block"[^>]*><h4 class="group-heading" id="(ov-[a-z-]+)-h">(<button[^>]*>)([^<]*)/g)].map((m) => ({ id: m[1], open: /aria-expanded="true"/.test(m[2]), title: m[3] }));
    const tablesIn = (html, id) => (html.slice(html.indexOf('id="ov-body-' + id.slice(3) + '"'), html.indexOf("</section>", html.indexOf('id="ov-body-' + id.slice(3) + '"'))).match(/<table class="overview-table"/g) || []).length;
    check(blocks.map((b) => b.title).join("|") === "Programming fundamentals|Advanced programming|Validation|Searching and sorting|A-level: Programming techniques|A-level: Data structures" &&
      blocks.every((b) => b.open) && blocks.every((b) => tablesIn(open, b.id) === 1) && (open.match(/<table class="overview-table"/g) || []).length === (plain.match(/<table class="overview-table"/g) || []).length && !/overview-block/.test(plain) &&
      /id="ov-body-fundamentals" hidden/.test(closed) && /id="ov-body-data-structures" hidden/.test(closed) && !/id="ov-body-advanced" hidden/.test(closed) &&
      (open.match(/button type="button" data-sort=/g) || []).length === (plain.match(/button type="button" data-sort=/g) || []).length,
      "Students page: each group of units is one collapsible block (one table each), all open at first, a closed one stays closed; the A-level groups (Programming techniques, Data structures) are blocks too; the sort buttons are unchanged");
    const tJs = read("teacher.js");
    check(/const studentsPageUnitIds = \(\) => UNITS\.map\(\(u\) => u\.id\);/.test(tJs) && /TD\.scoreTable\(data, studentsPageUnitIds\(\), null, stageUnitIds\(\)\)/.test(tJs) &&
      /buttonHtml: Collapse\.buttonHtml, collapsed: Collapse\.collapsedIds\(OVERVIEW_KEY\)/.test(tJs) && /const OVERVIEW_KEY = "pythonPractice\.teacherCollapsedSections";/.test(tJs) &&
      /Collapse\.enhance\(document\.querySelector\("main"\), "pythonPractice\.teacherCollapsedSections"\)/.test(tJs) && /\$\("overview-tables"\)\.addEventListener\("click"/.test(tJs),
      "Students page: every class sees every unit (A-level too) in blocks; each teacher's closed blocks are remembered under pythonPractice.teacherCollapsedSections (collapse.js, storage in try/catch); a column heading still sorts");
    // Item 4: a student changes their own nickname after typing their PIN (student-api rename_me), with the join rules.
    const sapi = read("supabase/functions/student-api/index.ts");
    const renameSrc = sapi.slice(sapi.indexOf("async rename_me(sid, body)"), sapi.indexOf("async delete_my_progress"));
    check(/pin_try_begin/.test(renameSrc) && /pinMatches\(pin, s\.pin_hash/.test(renameSrc) && /pin_try_succeeded/.test(renameSrc) && /validNickname\(nickname\)/.test(renameSrc) &&
      /nicknameBlocked\(nickname\)/.test(renameSrc) && /import \{ NICKNAME_RULES, nicknameBlocked, validNickname \} from "\.\.\/_shared\/nickname\.ts";/.test(sapi) && /HttpError\(403, /.test(renameSrc) &&
      /action: "rename_me", pin, nickname/.test(read("backend.js")) && /backend\.renameMe\(pin, nickname\)/.test(read("home.js")) &&
      ["rename-mine", "rename-form", "rename-nickname", "rename-pin", "rename-save"].every((id) => read("app.html").includes('id="' + id + '"')),
      "Nicknames: a student can change their own after typing their PIN (student-api rename_me: the PIN checked as at sign-in, then the join's rules and word filter); a teacher still renames from the student page");
    // Item 5: every export opens a popup first: what it contains, a sample row, and Download (the same file as before).
    const html = read("teacher.html");
    const ids = ["export-scores", "export-full", "export-dictionary", "export-levels", "export-log", "export-workshop"];
    check(ids.every((id) => new RegExp('"' + id + '": \\{ title: "[^"]+",\\s*text: "(?:[^"\\\\]|\\\\.){40,}",\\s*(?:\\/\\/[^\\n]*\\n\\s*note: [^\\n]*\\n\\s*)?build: ').test(tJs)) &&
      /Object\.keys\(EXPORTS\)\.forEach\(\(id\) => \$\(id\)\.addEventListener\("click", \(\) => openExport\(id\)\)\);/.test(tJs) &&
      /files\.forEach\(\(f, i\) => setTimeout\(\(\) => download\(f\.name, f\.text\), i \* 400\)\);/.test(tJs) && /\$\("export-dialog"\)\.showModal\(\);/.test(tJs) &&
      ["export-dialog", "export-dialog-h", "export-dialog-text", "export-dialog-sample", "export-dialog-download", "export-dialog-close"].every((id) => html.includes('id="' + id + '"')) &&
      /TD\.fullExportCsv\(data\) \}, \{ name: "data-dictionary\.csv", text: TD\.dataDictionaryCsv\(misconceptions\) \}/.test(tJs),
      "Exports: each of the six export buttons opens a popup with what the file contains, a sample row and a Download button, which downloads the same file(s) as before");
  }

  // ===================== Prompt 2 (2026-11): points and leaderboards =====================
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const S = require(path.join(ROOT, "secured.js"));
    const TDl = require(path.join(ROOT, "teacher-data.js"));
    const DAY = 86400000;
    const NOW = Date.parse("2026-11-18T12:00:00Z");
    const ago = (d) => new Date(NOW - d * DAY).toISOString();
    const pass = (unit, d) => ({ kind: "attempt", unit, at: ago(d), result: "pass", hints: 0, phase: "practice", taskLevel: 10 });
    // The formula's boundaries: 2 points a secured percent (100% = 200, 50% = 100, under 50% counts as 50%), not
    // secured 0, 10 a level (level 10 = 100), not placed 0, so a unit is worth at most 300.
    check(S.securedPoints({ secured: true, score: 100 }) === 200 && S.securedPoints({ secured: true, score: 50 }) === 100 && S.securedPoints({ secured: true, score: 40 }) === 100 &&
      S.securedPoints({ secured: true, score: 70 }) === 140 && S.securedPoints({ secured: false, score: null }) === 0 && S.securedPoints(null) === 0 &&
      S.levelPoints(10, true) === 100 && S.levelPoints(1, true) === 10 && S.levelPoints(10, false) === 0 && S.levelPoints(null, true) === 0 &&
      S.unitPoints({ secured: true, score: 100 }, 10, true).total === 300 && S.UNIT_POINTS_MAX === 300 && S.unitPoints({ secured: true, score: 100 }, 10, false).total === 200,
      "Points: secured points are 2 for each percent (100% gives 200, 50% gives 100, under 50% counts as 100), 0 if not secured; level points are 10 a level (level 10 gives 100), 0 if not placed; a unit is worth at most 300");
    // From records: a unit secured today at level 10 is 300; the same unit with its placement still to do is 0.
    const U = [{ id: "variables", placement: true }, { id: "linear-search", placement: false }];
    const top = S.studentPoints({ units: U, current: { variables: { level: 10, placement: { status: "done" } } }, attempts: [pass("variables", 2), pass("variables", 1)], now: NOW });
    const pending = S.studentPoints({ units: U, current: { variables: { level: 10, placement: { status: "pending" } } }, attempts: [pass("variables", 2), pass("variables", 1)], now: NOW });
    check(top.units.variables.secured === 200 && top.units.variables.level === 100 && top.total === 300 && top.units["linear-search"].total === 0 && pending.total === 0 &&
      S.maxPoints(Curriculum.UNITS.length) === 300 * Curriculum.UNITS.length && Curriculum.UNITS.length === 40 && S.maxPoints(Curriculum.UNITS.length) === 12000,
      "Points: a unit secured at 100% and at level 10 gives 300; with its placement still to do it gives 0; every one of the 40 units counts (Debugging (GCSE) is the 40th), so the most is 12,000");
    // Normalised: points / (300 x units) x 100, one decimal place; the All my classes boards rank by it.
    const mixed = S.boards([{ nickname: "Ann", total: 1500, gain: 300, unitCount: 10, class_name: "7A" }, { nickname: "Bo", total: 2000, gain: 390, unitCount: 39, class_name: "8B" }], true);
    check(S.normalised(5850, 39) === 50 && S.normalised(234, 39) === 2 && S.normalised(1, 39) === 0 && S.normalised(100, 0) === 0 &&
      mixed.overall.map((r) => r.nickname + ":" + r.percent).join() === "Ann:50,Bo:17.1" && mixed.improving.map((r) => r.nickname + ":" + r.percent).join() === "Ann:10,Bo:3.3" &&
      Object.keys(mixed.overall[0]).sort().join() === "class_name,nickname,percent,points,rank",
      "Leaderboards: the percentage is points / (300 x units) x 100 (5,850 of 39 units is 50%); across classes the boards rank by it, with the gain worked out the same way; each row has only rank, nickname, class, points and percent");
    // Ties share a place (1, 1, 3); within a class the boards rank by points.
    const tie = S.boards([{ nickname: "Cy", total: 50, gain: 0, unitCount: 39 }, { nickname: "Al", total: 90, gain: 5, unitCount: 39 }, { nickname: "Bea", total: 90, gain: 5, unitCount: 39 }], false);
    check(tie.overall.map((r) => r.rank + r.nickname).join() === "1Al,1Bea,3Cy" && tie.improving.map((r) => r.rank + r.nickname).join() === "1Al,1Bea,3Cy",
      "Leaderboards: students with the same points share a place (1, 1, 3), listed by nickname");
    // The 14-day improvement: today's points minus the points 14 days ago, from the records. Variables: placed 20 days
    // ago at level 3, up to level 6 ten days ago, secured by passes 30 and 29 days ago (80% 14 days ago, 60% now: the
    // score drops each full week). Linear search (no placement test): first record 5 days ago, now level 2.
    const history = { levels: [{ unit: "variables", at: ago(10), to: 6 }, { unit: "linear-search", at: ago(3), to: 2 }],
      placements: [{ unit: "variables", at: ago(20), kind: "result", startLevel: 3 }], started: { "linear-search": ago(5) } };
    const atts = [pass("variables", 30), pass("variables", 29)];
    const cur = { variables: { level: 6, placement: { status: "done" } }, "linear-search": { level: 2 } };
    const imp = S.studentPoints({ units: U, current: cur, attempts: atts, history, now: NOW });
    const sNow = S.score(atts, "variables", NOW).score, sThen = S.score(atts, "variables", NOW - 14 * DAY).score;
    check(sNow === 60 && sThen === 80 && imp.units.variables.total === 120 + 60 && imp.units["linear-search"].total === 20 && imp.total === 200 &&
      imp.before.total === 160 + 30 && imp.gain === 10 && S.levelAt("variables", true, history, NOW - 25 * DAY).placed === false &&
      S.levelAt("variables", true, { levels: [], placements: history.placements.concat([{ unit: "variables", at: ago(15), kind: "reset" }]) }, NOW - 14 * DAY).placed === false,
      "Improving: the gain is today's points minus the points 14 days ago, worked out from the attempts (the secured score at that time, as valueAt/fullWeeks count it) and the level and placement history (here +30 levels, -40 secured: +10)");
    // The teacher's local mode works it out the same way from this browser's logs.
    const local = TDl.pointsByStudent({ students: { s1: { name: "Ann" } }, progress: { s1: { units: cur } },
      attempts: atts.map((a) => Object.assign({ studentId: "s1" }, a)).concat([Object.assign({ studentId: "s1" }, { kind: "attempt", unit: "linear-search", at: ago(5), result: "fail", hints: 0, phase: "practice", taskLevel: 1 })]),
      levelLog: history.levels.map((e) => Object.assign({ studentId: "s1" }, e)), placementLog: history.placements.map((e) => Object.assign({ studentId: "s1" }, e)) }, U, NOW).s1;
    check(local.total === imp.total && local.gain === imp.gain && local.before.total === imp.before.total,
      "Improving: the teacher view (local mode) gets the same points and gain from this browser's records as the server does from its tables");
    // Server: the student's board is always their own class (classOf(sid), nothing in the request names one); rows have
    // only nickname, points, percent and "me". The teacher's boards check the class is theirs; All my classes reads
    // only classes with their teacher_id. points.ts reads no PINs, codes or attempt detail.
    const sapi2 = read("supabase/functions/student-api/index.ts");
    const tapi2 = read("supabase/functions/teacher-api/index.ts");
    const pts = read("supabase/functions/_shared/points.ts");
    const lbSrc = sapi2.slice(sapi2.indexOf("async leaderboard(sid)"), sapi2.indexOf("async delete_my_progress"));
    const tlb = tapi2.slice(tapi2.indexOf("async leaderboards(tid, body)"), tapi2.indexOf("async rename_student"));
    const ptsServer = read("supabase/functions/_shared/points-server.js");
    check(/return studentBoard\(await classPoints\(await classOf\(sid\)\), sid\);/.test(lbSrc) && !/body\./.test(lbSrc) &&
      /\(\{ nickname: s\.nickname, total: s\.combined, gain: s\.gain, unitCount: s\.unitCount, me: s\.id === sid \}\)/.test(ptsServer) &&
      /me: me \? Object\.assign\(totals\(me\), \{ programmes: me\.programmes, total: me\.combined, gain: me\.gain \}\) : null/.test(ptsServer) &&
      /ownClass\(tid, body\.class_id\)/.test(tlb) && /Sharing\.myClasses\(db\(\), tid\)/.test(tlb) && /return classBoard\(await classPoints\(classId\)\);/.test(tlb) &&
      /withPoints\.push\(\{ name: c\.name, students: await classPoints\(c\.id\) \}\);\s*return allClassesBoard\(withPoints\);/.test(tlb) &&
      !/pin_hash|code_hash|student_code|encrypted|login_code/.test(pts + ptsServer) && /import "\.\.\/\.\.\/\.\.\/secured\.js";/.test(pts) && /import "\.\/points-server\.js";/.test(pts) && /deps\.Secured\.studentPoints\(/.test(ptsServer) &&
      /import \{ classPoints, studentBoard \} from "\.\.\/_shared\/points\.ts";/.test(sapi2) && /import \{ allClassesBoard, classBoard, classPoints \} from "\.\.\/_shared\/points\.ts";/.test(tapi2),
      "Leaderboards on the server: student-api leaderboard is always the student's own class, rows with nickname and points only; teacher-api checks the teacher is on the class, and All my classes reads only the classes they are on (own and shared); the rule is secured.js itself (through points-server.js since prompt 23), and no PIN or code is read");
    // Pages: the student's Leaderboard button sits next to My progress (backend mode only); the teacher has a
    // Leaderboards page (this class and All my classes) and the points per unit on a student's page.
    const app = read("app.html"), th = read("teacher.html"), tj = read("teacher.js");
    check(/href="progress\.html" class="menu-link">My progress<\/a>\s*<!--[^>]*-->\s*<a href="leaderboard\.html" id="leaderboard-link" class="menu-link" hidden>Leaderboard<\/a>/.test(app) &&
      /\$\("leaderboard-link"\)\.hidden = false;/.test(read("home.js")) && /action: "leaderboard"/.test(read("backend.js")) && /backend\.leaderboard\(\)/.test(read("leaderboard.js")) &&
      /<script src="leaderboard\.js"><\/script>/.test(read("leaderboard.html")) && /class="board-me"/.test(read("leaderboard.js")) &&
      /data-page="leaderboards">Leaderboards</.test(th) && ["page-leaderboards", "lb-class", "lb-all", "lb-all-load", "sd-points"].every((id) => th.includes('id="' + id + '"')) &&
      /"leaderboards", ("certificates", )?"student"/.test(tj) && /tb\.leaderboards\(\)/.test(tj) && /tb\.leaderboardsAll\(\)/.test(tj) && /TD\.pointsByStudent\(/.test(tj),
      "Leaderboard pages: a Leaderboard button next to My progress (backend mode only) shows the class's two boards with the student's own row highlighted; teachers have a Leaderboards page (this class, and All my classes) and points per unit on each student's page");
  }

  // ===================== Prompt 3 (2026-11): sharing a class with another teacher =====================
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const mig = read("supabase/migrations/0016_class_sharing.sql");
    const rls = read("supabase/migrations/0002_rls.sql");
    const flat = (s) => s.replace(/\s+/g, " ");
    // The table, the backfill, the owner trigger and the helper, in one transaction.
    check(/^begin;$/m.test(mig) && /^commit;\s*$/m.test(mig.slice(mig.lastIndexOf("commit;"))) && mig.indexOf("begin;") < mig.indexOf("create table public.class_teachers") &&
      /create table public\.class_teachers \(\s*class_id uuid not null references public\.classes \(id\) on delete cascade,\s*teacher_id uuid not null references public\.teachers \(id\) on delete cascade,\s*added_by uuid references public\.teachers \(id\) on delete set null,\s*added_at timestamptz not null default now\(\),\s*primary key \(class_id, teacher_id\)/.test(mig) &&
      /insert into public\.class_teachers \(class_id, teacher_id, added_by, added_at\)\s*select c\.id, c\.teacher_id, c\.teacher_id, c\.created_at from public\.classes c/.test(mig) &&
      /create trigger classes_add_owner after insert on public\.classes/.test(mig) &&
      /create function private\.is_class_teacher\(p_class uuid\) returns boolean\s*language sql stable security definer set search_path = '' as/.test(mig),
      "Class sharing (0016): a class_teachers table (class, teacher, added by, added at), with a row for every existing class's owner and every new one's, and a security-definer helper with a fixed search_path, all in one transaction");
    // Every policy of 0002/0005 that checked classes.teacher_id = auth.uid() (directly, or through my_class_ids and
    // my_student_ids) now also accepts membership; deleting a class and adding one stay the owner's.
    const ownerPolicies = [...rls.matchAll(/create policy "([^"]+)" on public\.(\w+) for (\w+) to authenticated\s*(?:using|with check) \(teacher_id = \(select auth\.uid\(\)\)\)/g)].map((m) => m[2] + ":" + m[1]);
    const altered = [...mig.matchAll(/alter policy "([^"]+)" on public\.(\w+)/g)].map((m) => m[2] + ":" + m[1]);
    check(ownerPolicies.sort().join() === "classes:teacher adds own classes,classes:teacher deletes own classes,classes:teacher reads own classes,classes:teacher updates own classes,code_reveals:teacher reads own code reveals" &&
      altered.sort().join() === "classes:teacher reads own classes,classes:teacher updates own classes,code_reveals:teacher reads own code reveals" &&
      /create or replace function private\.my_class_ids\(\) returns setof uuid[\s\S]*?where c\.teacher_id = auth\.uid\(\)\s*union\s*select ct\.class_id from public\.class_teachers ct where ct\.teacher_id = auth\.uid\(\)/.test(mig) &&
      /create or replace function private\.my_student_ids\(\)[\s\S]*?where s\.class_id in \(select private\.my_class_ids\(\)\)/.test(mig) &&
      /create or replace function public\.reset_placement\(p_teacher uuid, p_student uuid, p_unit text\)[\s\S]*?c\.teacher_id = p_teacher or exists \(\s*select 1 from public\.class_teachers ct where ct\.class_id = c\.id and ct\.teacher_id = p_teacher\)/.test(mig) &&
      !/alter policy "teacher deletes own classes"|alter policy "teacher adds own classes"/.test(mig),
      "Class sharing (0016): every check of classes.teacher_id = auth.uid() accepts a co-teacher (reading and changing classes, code reveals, the my_class_ids and my_student_ids helpers behind the students, progress, passed tasks, attempts, events and assignments policies, and reset_placement); creating and deleting a class stay the owner's");
    check(/revoke all on table public\.class_teachers from anon, authenticated;\s*grant select on public\.class_teachers to authenticated;/.test(mig) &&
      !/grant (insert|update|delete)[^;]*class_teachers/.test(mig) &&
      flat(mig).includes('create policy "teacher reads own classes\' teachers" on public.class_teachers for select to authenticated using (class_id in (select private.my_class_ids()))') &&
      /grant execute on function public\.teacher_by_email\(text\), public\.class_teacher_list\(uuid\) to service_role;/.test(mig) &&
      /revoke execute on function public\.teacher_by_email\(text\), public\.class_teacher_list\(uuid\) from public, anon, authenticated;/.test(mig) &&
      (mig.match(/security definer set search_path = ''/g) || []).length === 8,
      "Class sharing (0016): teachers may only read class_teachers (for their own classes); adding and removing go through teacher-api; the email lookup and teacher list are for the service role only; every new function has a fixed search_path");
    // teacher-api: every owner check is now a membership check (class-sharing.js); the three new actions.
    const tapi = read("supabase/functions/teacher-api/index.ts");
    const sh = read("supabase/functions/_shared/class-sharing.js");
    const S3 = require(path.join(ROOT, "supabase", "functions", "_shared", "class-sharing.js"));
    check(!/\.eq\("teacher_id", tid\)|"classes\.teacher_id"|classes!inner\(teacher_id\)/.test(tapi) && /return \(await Sharing\.requireClass\(db\(\), tid, classId, false\)\)\.id;/.test(tapi) &&
      /return await Sharing\.requireStudent\(db\(\), tid, studentId\);/.test(tapi) && /import "\.\.\/_shared\/class-sharing\.js";/.test(tapi) &&
      ["list_co_teachers", "add_co_teacher", "remove_co_teacher"].every((a) => new RegExp("async " + a + "\\(tid, body\\)").test(tapi)) &&
      /async function addCoTeacher\(sb, tid, classId, email\) \{\s*const c = await requireClass\(sb, tid, classId, true\);/.test(sh) &&
      /async function removeCoTeacher\(sb, tid, classId, teacherId\) \{\s*const c = await requireClass\(sb, tid, classId, true\);/.test(sh) &&
      /if \(teacherId === c\.ownerId\) throw new Problem\(400, MESSAGES\.owner, "owner"\);/.test(sh) &&
      /async function listCoTeachers\(sb, tid, classId\) \{\s*const c = await requireClass\(sb, tid, classId, false\);/.test(sh) &&
      S3.MESSAGES.unknownEmail === "No teacher account with that email." && /e instanceof Sharing\.Problem/.test(tapi),
      "teacher-api: every class and student check accepts a co-teacher; add_co_teacher and remove_co_teacher are for the owner only (the owner can't be removed), list_co_teachers for anyone on the class; an unknown email says \"No teacher account with that email.\"");
    // The Teachers panel: on the class page, backend mode only; the owner sees Add and Remove, a co-teacher the list
    // only; a shared class hides Delete class and says whose it is.
    const th = read("teacher.html"), tb = read("teacher-backend.js"), tj = read("teacher.js");
    const clMain = th.slice(th.indexOf('<div id="cl-main">'), th.indexOf("<!-- ===== Students"));
    check(/<section class="teacher-section" data-collapse="class-teachers" id="tb-teachers-section" data-backend>\s*<h3>Teachers<\/h3>/.test(clMain) &&
      ["tb-teachers", "tb-add-teacher", "tb-add-teacher-email", "tb-teachers-status", "tb-shared-note", "tb-delete-section"].every((id) => clMain.includes('id="' + id + '"')) &&
      /<form id="tb-add-teacher" class="teacher-controls" novalidate hidden>/.test(th) && /\$\("cl-main"\)\.hidden = !tb;/.test(tj) &&
      /\.teacher-controls\[hidden\] \{ display: none; \}/.test(read("styles.css")) &&
      /document\.querySelectorAll\("\[data-backend\]"\)\.forEach\(\(b\) => \{ b\.hidden = !tb; \}\);/.test(tj),
      "Teachers panel: on the class page (Classes), in backend mode only (in local mode the whole class area and the panel are hidden, as sharing needs accounts); the Add a teacher form starts hidden");
    check(/\$\("tb-delete-section"\)\.hidden = !current\.owned;/.test(tb) && /\$\("tb-add-teacher"\)\.hidden = !current\.owned;/.test(tb) &&
      /\$\("tb-shared-note"\)\.hidden = current\.owned;/.test(tb) && /\(mine && !t\.owner \? '<span class="teacher-actions"><button type="button" class="secondary" data-remove-teacher=/.test(tb) &&
      /\(t\.owner \? ' <span class="flag">Owner<\/span>' : ""\)/.test(tb) && /owned: c\.teacher_id === user\.id/.test(tb) &&
      /\(c\.owned \? "" : " \(" \+ esc\(sharedLabel\(c\)\) \+ "\)"\)/.test(tb) && /const sharedLabel = \(c\) => "Shared with you by " \+ \(c\.ownerName \|\| "another teacher"\);/.test(tb) &&
      /if \(!current\.owned\) return say\("tb-status", "Only the teacher who made this class can delete it\.", true\);/.test(tb) &&
      /teacherApi\("list_co_teachers", \{ class_id: cls\.id \}\)/.test(tb) && /teacherApi\("add_co_teacher", \{ class_id: current\.id, email \}\)/.test(tb) &&
      /teacherApi\("remove_co_teacher", \{ class_id: current\.id, teacher_id: b\.dataset\.removeYes \}\)/.test(tb),
      "Teachers panel: the owner is marked; only the owner sees Add a teacher and Remove; a shared class says \"Shared with you by\" its owner in the class list and hides Delete class, which also refuses for a co-teacher");
  }

  // ===================== Prompt 4 (2026-11): certificates =====================
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const Cert = require(path.join(ROOT, "certificates.js"));
    const Sec = require(path.join(ROOT, "secured.js"));
    const TDc = require(path.join(ROOT, "teacher-data.js"));
    const DAY = 86400000, T0 = Date.parse("2026-09-07T10:00:00Z");
    const pass = (unit, day, extra) => Object.assign({ kind: "attempt", unit, at: new Date(T0 + day * DAY).toISOString(), result: "pass", hints: 0, phase: "practice", taskLevel: 10 }, extra);
    // A unit secured on day `from`, then brought back to 100% five times, 8 days apart: its floor is 100% on day from + 40.
    const toFull = (unit, from) => [0, 0, 8, 16, 24, 32, 40].map((d) => pass(unit, from + d));
    const fund = Cert.BLOCKS.find((b) => b.id === "fundamentals");
    // The blocks are the Students page's six (teacher-data.js overviewGroups' block headings), with their units.
    const pageBlocks = [...new Set(TDc.overviewGroups(Curriculum.UNITS.map((u) => u.id), Curriculum.UNIT_GROUPS).map((g) => g.block))].filter((b) => b !== "Other units");
    check(Cert.BLOCKS.map((b) => b.name).join("|") === pageBlocks.join("|") && pageBlocks.length === 6 &&
      Cert.BLOCKS.map((b) => b.id).join() === "fundamentals,advanced,validation,searching-sorting,programming-techniques,data-structures" &&
      Cert.BLOCKS.reduce((n, b) => n + b.units.length, 0) === Curriculum.UNITS.length && Sec.FLOOR_START === 50 && Sec.FLOOR_STEP === 10 && Sec.FLOOR_CAP === 100,
      "Certificates: the six blocks are the Students page's (Programming fundamentals ... A-level: Data structures), covering all " + Curriculum.UNITS.length + " units; secured.js's floor rules are unchanged (50%, +10, up to 100%)");
    // Floor at 100%: secured.js's own score() at each pass. Secured, then five returns to 100%: 50, 60, 70, 80, 90, 100.
    const floors = [0, 8, 16, 24, 32, 40].map((d) => Sec.score(toFull("output", 0), "output", T0 + d * DAY + 1000).floor);
    check(floors.join() === "50,60,70,80,90,100" && Cert.floorFullAt(toFull("output", 0), "output") === T0 + 40 * DAY &&
      Cert.floorFullAt(toFull("output", 0).slice(0, 6), "output") === null && Cert.floorFullAt([], "output") === null &&
      Cert.floorFullAt(toFull("output", 0).map((a) => Object.assign({}, a, { hints: 1 })), "output") === null,
      "Certificates: a unit's floor reaches 100% at the pass that brings it back to 100% for the fifth time (secured.js's score()); never secured, or passes with hints, is never 100%");
    // All units at 100% = earned, on the date the last unit got there; one unit short = not earned.
    const all = fund.units.reduce((a, u, i) => a.concat(toFull(u, i)), []);
    const earned = Cert.earnedBlocks(all);
    const short = Cert.earnedBlocks(all.filter((a) => !(a.unit === "maths" && a.at === new Date(T0 + 43 * DAY).toISOString())));
    const neverSecured = Cert.earnedBlocks(all.filter((a) => a.unit !== "loops-count"));
    check(earned.length === 1 && earned[0].block_id === "fundamentals" && earned[0].block_name === "Programming fundamentals" &&
      earned[0].earned_on === "2026-10-23" && Cert.blockStatus(fund, all).at === T0 + 46 * DAY && !short.length && !neverSecured.length,
      "Certificates: a block is earned when every unit in it has its floor at 100%, dated the day the last unit reached it (here 23 October 2026); one unit below 100%, or one never secured, and it isn't earned");
    // The date is the day in the UK: a pass at 00:30 BST on 24 October (23:30 UTC on the 23rd) counts for the 24th.
    check(Cert.ukDate(Date.parse("2026-10-23T23:30:00Z")) === "2026-10-24" && Cert.ukDate(Date.parse("2026-12-01T23:30:00Z")) === "2026-12-01" &&
      Cert.longDate("2026-10-23") === "23 October 2026",
      "Certificates: the earned date is the day in the UK (British Summer Time too), printed as \"23 October 2026\"");
    // The old Validation unit counts only for a student who has started it.
    const valBlock = Cert.BLOCKS.find((b) => b.id === "validation");
    const newUnits = valBlock.units.filter((u) => u !== "validation");
    const valAll = newUnits.reduce((a, u, i) => a.concat(toFull(u, i)), []);
    check(Cert.earnedBlocks(valAll, () => false).map((c) => c.block_id).join() === "validation" &&
      Cert.earnedBlocks(valAll, (u) => u === "validation").length === 0 &&
      Cert.earnedBlocks(valAll.concat(toFull("validation", 20)), (u) => u === "validation")[0].earned_on === Cert.ukDate(T0 + 60 * DAY),
      "Certificates: the old Validation unit counts only for a student who has started it (the others never see it)");
    // One certificate per block, kept once earned: the first earned date stays, and nothing is listed twice.
    const stored = { s1: [{ block_id: "fundamentals", block_name: "Programming fundamentals", earned_on: "2026-10-01" }] };
    const data = { students: { s1: { name: "Ada" }, s2: { name: "Bo" } }, progress: {}, attempts: all.map((a) => Object.assign({ studentId: "s1" }, a)), levelLog: [], placementLog: [] };
    const local = TDc.certificatesFor(data, stored);
    const lostAttempts = TDc.certificatesFor(Object.assign({}, data, { attempts: [] }), stored);
    check(local.s1.length === 1 && local.s1[0].earned_on === "2026-10-01" && local.s2.length === 0 &&
      TDc.certificatesFor(data, {}).s1[0].earned_on === "2026-10-23" && lostAttempts.s1.length === 1 &&
      Cert.merge([{ block_id: "advanced", block_name: "A", earned_on: "2026-01-01" }], [{ block_id: "fundamentals", block_name: "F", earned_on: "2026-02-01" }, { block_id: "advanced", block_name: "A", earned_on: "2026-03-01" }]).map((c) => c.block_id + c.earned_on).join() === "fundamentals2026-02-01,advanced2026-01-01" &&
      TDc.certificateRows(data, local).map((r) => r.student_name + ":" + r.block_name).join() === "Ada:Programming fundamentals",
      "Certificates: one per student per block, kept once earned with its first date (even if the records change later); the Certificates page lists only students who have one");
    // The print page: one certificate, no buttons or site menu, one A4 landscape page; the text is put in as text only.
    const ch = read("certificate.html"), cj = read("certificate.js");
    const body = ch.slice(ch.indexOf("<body>"));
    check(!/<button|<nav|class="side-nav"|<a /i.test(body) && /@page \{ size: A4 landscape; margin: 10mm; \}/.test(ch) && /@media print \{/.test(ch) &&
      /\.certificate \{ width: 277mm; height: 188mm;/.test(ch) && /break-inside: avoid/.test(ch) && /\.cert-screen-note \{ display: none; \}/.test(ch) &&
      ["cert-title", "cert-name", "cert-class", "cert-block", "cert-date", "cert-teacher"].every((id) => ch.includes('id="' + id + '"')) &&
      />Issued by <span id="cert-teacher"><\/span><\/p>/.test(ch) && !/%|floor/i.test(body.replace(/<script[\s\S]*$/, "")) && Cert.TITLE === "Pythons and Ladders" &&
      !/innerHTML/.test(cj) && /textContent = name;/.test(cj) && /new URLSearchParams\(location\.hash\.slice\(1\)\)/.test(cj),
      "Certificate print page: Pythons and Ladders, the student, class, block and date, and \"Issued by\" the teacher; no buttons, menu, percentage or floor; one A4 landscape page; its text is put in as text, from the # part of the address");
    // The server: the same rule; only the four fields come back; any teacher on the class; the table only it writes.
    const cs = read("supabase/functions/_shared/certificates-server.js"), tapi = read("supabase/functions/teacher-api/index.ts");
    const mig = read("supabase/migrations/0017_certificates.sql");
    check(/Certificates\.earnedBlocks\(attempts,/.test(cs) && /\.map\(\(c\) => \(\{ student_name: name\(c\.student_id\), class_name: cls\.name, block_name: c\.block_name, earned_on: c\.earned_on \}\)\)/.test(cs) &&
      /deps\.Sharing\.requireClass\(sb, tid, classId, false\)/.test(cs) && /deps\.Sharing\.requireStudent\(sb, tid, studentId\)/.test(cs) &&
      /ignoreDuplicates: true/.test(cs) && /async certificates_for_class\(tid, body\)/.test(tapi) && /async certificate_for_student\(tid, body\)/.test(tapi) &&
      /import "\.\.\/\.\.\/\.\.\/certificates\.js";/.test(tapi) &&
      /^begin;$/m.test(mig) && /^commit;$/m.test(mig) && /unique \(student_id, block_id\)/.test(mig) && /earned_on date not null/.test(mig) &&
      /revoke all on table public\.certificates from anon, authenticated;\s*grant select on public\.certificates to authenticated;/.test(mig) &&
      !/grant (insert|update|delete)[^;]*to authenticated/.test(mig) &&
      /create policy "teacher reads own students' certificates" on public\.certificates for select to authenticated\s*using \(student_id in \(select private\.my_student_ids\(\)\)\);/.test(mig),
      "Certificates on the server: teacher-api works them out with the same rule (certificates.js), for any teacher on the class, and returns only the student, class, block and date; 0017 lets teachers read their classes' certificates and only the server write them");
    // The teacher screens: the Certificates page and the student page's panel, each with Print; local mode keeps them
    // in this browser (store.js) and never sends them.
    const th = read("teacher.html"), tj = read("teacher.js");
    check(/data-page="certificates">Certificates</.test(th) && ["page-certificates", "cert-list", "sd-certs", "cert-teacher-name"].every((id) => th.includes('id="' + id + '"')) &&
      /<h3 id="sd-certs-h">Certificates<\/h3>/.test(th) && /tb\.certificatesForClass\(c\.id\)/.test(tj) && /tb\.certificatesForStudent\(studentId\)/.test(tj) &&
      /for \(const c of tb\.allClasses\(\)\)/.test(tj) && /TD\.certificatesFor\(data, stored\)/.test(tj) && /Store\.saveCertificates\(/.test(tj) &&
      /window\.open\(certificateUrl\(/.test(tj) && /">Print<\/button>'/.test(tj) &&
      !/Store\.certificates|CERTIFICATES_KEY|certificateTeacher/.test(read("backend.js") + read("teacher-backend.js") + read("backend-rows.js")),
      "Certificates in the teacher view: a Certificates page (every class, own and shared) and a panel on each student's page, each with Print; local mode works them out in teacher-data.js and keeps them in this browser only");
  }

  // ===================== Prompt 5 (2026-11): homework and the large paste flag =====================
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const HW = require(path.join(ROOT, "homework.js"));
    const PF = require(path.join(ROOT, "paste-flag.js"));
    const H = 3600000, T0 = Date.parse("2026-11-16T09:00:00Z"); // set on Monday 16 November, due Friday 20 November
    const hw = (o) => Object.assign({ id: "h1", created_at: new Date(T0).toISOString(), due_on: "2026-11-20", units: [], task_count: 3 }, o);
    const at = (h) => new Date(T0 + h * H).toISOString();
    const rec = (taskId, h, o) => Object.assign({ kind: "attempt", at: at(h), unit: "selection", units: ["selection"], taskId, result: "pass", phase: "practice", taskType: "write" }, o);

    // First pass only; placement counts; every task type counts; fails, skips and hints don't.
    const a1 = [rec("t1", 1), rec("t1", 2), rec("t2", 3, { phase: "placement", taskType: "parsons" }), rec("t3", 4, { result: "fail" }),
      rec("t4", 5, { kind: "skip", result: "skipped" }), rec("t5", 6, { taskType: "trace", phase: "endless" })];
    const p1 = HW.progress(hw(), a1, []);
    check(p1.done === 3 && p1.taskIds.join() === "t1,t2,t5" && p1.complete && HW.doneText(Object.assign(hw(), p1)) === "Complete" &&
      HW.progress(hw({ task_count: 5 }), a1, []).done === 3 && HW.doneText(Object.assign(hw({ task_count: 5 }), HW.progress(hw({ task_count: 5 }), a1, []))) === "3 of 5 done",
      "Homework: a task counts the first time it is passed (a repeat pass doesn't count again); placement, endless, trace and Parsons passes count; fails and skips don't");
    // A task passed before the homework was set never counts, even if it is passed again during it.
    const before = [rec("old", -48), rec("old", 2), rec("new", 3)];
    check(HW.progress(hw(), before, []).taskIds.join() === "new",
      "Homework: a task the student had passed before the homework was set doesn't count (a later pass is a repeat)");
    // Due date cut-off: the end of the due date in the UK. 23:30 on Friday 20 November (GMT) counts; 00:30 on the 21st doesn't.
    const cut = [rec("in", 0), rec("late-evening", Date.parse("2026-11-20T23:30:00Z") / H - T0 / H), rec("after", Date.parse("2026-11-21T00:30:00Z") / H - T0 / H)];
    const pc = HW.progress(hw({ task_count: 10 }), cut, []);
    check(pc.taskIds.join() === "in,late-evening" && HW.pastDue(hw(), Date.parse("2026-11-21T00:30:00Z")) && !HW.pastDue(hw(), Date.parse("2026-11-20T23:59:00Z")) &&
      HW.inTime(hw({ due_on: "2026-06-20", created_at: "2026-06-01T00:00:00Z" }), "2026-06-20T22:30:00Z") === true &&
      HW.inTime(hw({ due_on: "2026-06-20", created_at: "2026-06-01T00:00:00Z" }), "2026-06-20T23:30:00Z") === false,
      "Homework: only passes on or before the due date count (the day in the UK: 23:30 GMT on the due date counts, 00:30 BST the next day doesn't); after it the homework still shows");
    // Stops at y.
    const many = ["a", "b", "c", "d", "e", "f"].map((id, i) => rec(id, i));
    const pm = HW.progress(hw({ task_count: 4 }), many, []);
    check(pm.done === 4 && pm.taskIds.join() === "a,b,c,d" && pm.complete && HW.doneText({ task_count: 4, done: 9, complete: false }) === "4 of 4 done",
      "Homework: \"x of y done\" stops at y, and the homework is complete when x reaches y");
    // Units: only the homework's units (either unit of a two-unit endless task); none means any unit.
    const mixed = [rec("s1", 1), rec("m1", 2, { unit: "maths", units: ["maths"] }), rec("both", 3, { unit: "maths", units: ["maths", "selection"] })];
    const pu = HW.progress(hw({ units: ["selection"], task_count: 10 }), mixed, []);
    check(pu.taskIds.join() === "s1,both" && pu.units.join() === "selection" && HW.progress(hw({ task_count: 10 }), mixed, []).units.join() === "selection,maths",
      "Homework: only tasks in the homework's units count (a two-unit endless task counts if either unit is chosen); no units means any unit; the report lists the units the counted tasks were done in");
    // A flagged task doesn't count (a pass after its paste flag); a flag after a pass doesn't undo it.
    const flags = [{ at: at(1), unit: "selection", units: ["selection"], taskId: "pasted" }, { at: at(6), unit: "selection", units: ["selection"], taskId: "late-flag" },
      { at: at(2), unit: "selection", units: ["selection"], taskId: "pasted" }];
    const pf = HW.progress(hw({ task_count: 10 }), [rec("pasted", 2), rec("late-flag", 5), rec("clean", 3)], flags);
    check(pf.taskIds.join() === "clean,late-flag" && pf.flagged.map((f) => f.taskId).join() === "pasted,late-flag" &&
      HW.progress(hw({ task_count: 10, units: ["maths"] }), [], flags).flagged.length === 0,
      "Homework: a flagged paste stops that task counting (a pass after the flag); a flag after the pass doesn't undo it; the report lists each flagged task once, in the homework's units");
    // Which homework a paste is in: open, not complete, not past due, covering the task's unit.
    const list = [hw({ id: "open", done: 1 }), hw({ id: "done", complete: true }), hw({ id: "late", due_on: "2026-11-17" }), hw({ id: "maths", units: ["maths"] })];
    check(HW.activeFor(list, ["selection"], Date.parse("2026-11-18T10:00:00Z")).map((h) => h.id).join() === "open" &&
      HW.activeFor(list, ["maths"], Date.parse("2026-11-18T10:00:00Z")).map((h) => h.id).join() === "open,maths" && HW.activeFor([], ["maths"]).length === 0,
      "Homework: a task is in homework when an open homework (not complete, not past its due date) covers its unit");
    // The teacher's form.
    const U = Curriculum.UNITS.map((u) => u.id);
    const ok = HW.checkNew({ task_count: 5, due_on: "2026-11-20", units: ["maths", "output"] }, U, "2026-11-19");
    check(ok.ok && ok.homework.units.join() === "output,maths" && HW.checkNew({ task_count: 1, due_on: "2026-11-19" }, U, "2026-11-19").ok &&
      ["count", "count", "count", "due", "due", "due", "units"].join() === [
        { task_count: 0, due_on: "2026-11-20" }, { task_count: 2.5, due_on: "2026-11-20" }, { task_count: 201, due_on: "2026-11-20" },
        { task_count: 3 }, { task_count: 3, due_on: "2026-02-30" }, { task_count: 3, due_on: "2026-11-18" }, { task_count: 3, due_on: "2026-11-20", units: ["nope"] },
      ].map((x) => HW.checkNew(x, U, "2026-11-19").problem).join(),
      "Homework form: a whole number of tasks (1 to 200) and a due date (today or later) are needed; units are optional, from the list only");

    // The paste threshold: more than 8 lines flags, 8 doesn't; expected output never flags; only the editor's tasks.
    const code = (n) => Array.from({ length: n }, (_, i) => "x" + i + " = " + i).join("\n");
    const outLines = Array.from({ length: 12 }, (_, i) => "Line " + (i + 1) + ": " + "*".repeat(i));
    const wt = { type: "write", tests: [{ inputs: [], expected: outLines.join("\n") + "\n" }, { inputs: ["5"], expected: "Total: 5\n" }] };
    check(PF.MAX_LINES === 8 && PF.flags(code(9), wt) && !PF.flags(code(8), wt) && !PF.flags("\n\n" + code(8) + "\n\n", wt) && PF.lineCount(code(9) + "\n") === 9 &&
      PF.flags(code(9), { type: "scratch", tests: [] }) && !PF.flags(code(30), { type: "fill", tests: [] }) && !PF.flags(code(30), { type: "predict", tests: [] }),
      "Paste flag: a single paste of more than 8 lines into the editor (write or write-from-scratch tasks) is flagged; 8 lines is not; blank lines at the ends don't count");
    check(!PF.flags(outLines.join("\n"), wt) && !PF.flags(outLines.slice(2, 12).map((l) => "  " + l + "  ").join("\r\n"), wt) && PF.isExpectedOutput(outLines.slice(0, 9).join("\n"), wt) &&
      PF.flags(outLines.slice(0, 9).join("\n") + "\nprint('done')", wt) && PF.flags(outLines.slice(0, 5).concat(outLines.slice(6, 10)).join("\n"), wt),
      "Paste flag: pasting the expected output (all of it, or lines of it in order, spaces at the ends ignored) is never flagged; anything else of 9+ lines is");
    check(PF.MESSAGE === "Your teacher has been told this code was pasted in. Try writing it yourself." &&
      PF.HOMEWORK_MESSAGE === "Your teacher has been told. This task doesn't count towards your homework. Here is a new task.",
      "Paste flag: the student is told exactly what happened, in short sentences (in homework, that the task doesn't count and a new one is given)");

    // The practice page: both editors report a paste; a flag is recorded (an event in backend mode) and the task is
    // recorded as skipped (prompt 10: tested in full below); never in teacher practice.
    const appS = read("app.js"), on = appS.slice(appS.indexOf("  function onPaste("), appS.indexOf("  // ---------- Predict ----------"));
    check(/ta\.addEventListener\("paste"/.test(appS) && /change\.origin !== "paste"/.test(appS) && /if \(preview \|\| !self\.PasteFlag/.test(on) &&
      /Store\.logPasteFlag\(\{ at: [^,]+, studentId: student\.id, unit: units\[0\], units, taskId: t\.id/.test(on) && /const homework = homeworkFor\(t\);/.test(on) && /Homework\.activeFor\(Store\.homework\(student\.id\), unitsOf\(t\), Date\.now\(\)\)/.test(appS) &&
      /if \(!serving\) moveOnFrom\(c, o\.message\);/.test(on) && /if \(lead\) notice = \{ kind: "down", text: lead/.test(appS) &&
      !/applyOutcome/.test(on) && ["logPasteFlag", "saveHomework"].every((f) => App.RECORDING_FUNCTIONS.includes(f)) &&
      /<script src="homework\.js"><\/script>\s*<script src="paste-flag\.js"><\/script>/.test(read("practice.html")),
      "Paste flag on the practice page: both editors (CodeMirror and the plain box) report a paste; it is recorded, the task is skipped as the Skip button does and the student moves on (prompt 11: tested in full below); teacher practice records nothing");
    const Rows = require(path.join(ROOT, "backend-rows.js"));
    const row = Rows.pasteFlagToRow({ id: "f-abc-123", at: "2026-11-18T10:00:00.000Z", unit: "maths", taskId: "maths-L9b", studentId: "s1", lines: 12 });
    check(JSON.stringify(row) === JSON.stringify({ record_id: "f-abc-123", record_type: "paste_flag", timestamp: "2026-11-18T10:00:00.000Z", unit: "maths", task_id: "maths-L9b",
      paste_phase: null, paste_lines: 12, paste_homework_id: null }) &&
      Rows.rowToEvent(row, "s1") === null && /logPasteFlag: Store\.logPasteFlag/.test(read("backend.js")),
      "Paste flag: sent to the server as an event (record_type paste_flag, an f- id, the task id); it isn't part of the teacher's export (the homework report shows it)");

    // The student's card and the teacher's page.
    const home = read("home.js"), appH = read("app.html");
    check(/const list = backend \? Store\.homework\(student\.id\) : \[\];/.test(home) && /"Any unit"/.test(home) && /self\.Homework\.doneText\(hw\)/.test(home) &&
      /<section id="homework" class="assignments homework" hidden aria-labelledby="homework-h">/.test(appH) && /<h2 id="homework-h">Homework<\/h2>/.test(appH),
      "Homework card: on the student's home page in backend mode only, one card per homework with the due date, the units (or \"Any unit\") and \"x of y done\", then \"Complete\"");
    const th = read("teacher.html"), tj = read("teacher.js");
    const cols = [...tj.slice(tj.indexOf("const HW_COLUMNS = ["), tj.indexOf("function drawHomeworkReport")).matchAll(/key: "(\w+)", label: "([^"]+)"/g)].map((m) => m[2]);
    const hwCols = [...tj.slice(tj.indexOf("const HW_COLUMNS = ["), tj.indexOf("function drawHomeworkReport")).matchAll(/key: "(\w+)", label: (?:"([^"]+)"|(TD\.PASTE_FLAGGED))/g)].map((m) => m[2] || "Paste flagged");
    check(hwCols.join() === "Student,Done,Units,Paste flagged" && TD.PASTE_FLAGGED === "Paste flagged" && /data-hw-sort="' \+ c\.key \+ '"/.test(tj) && /aria-sort="' \+ \(hwSort\.dir === 1 \? "ascending" : "descending"\)/.test(tj) &&
      /<span class="flag flag-alert">' \+ esc\(TD\.PASTE_FLAGGED\) \+ "<\/span> " \+ esc\(taskName\(f\.task_id\)\)/.test(tj) && /hwSort = hwSort\.key === b\.dataset\.hwSort \? \{ key: hwSort\.key, dir: -hwSort\.dir \}/.test(tj),
      "Homework report: one row per student with the columns Student, Done (x of y), Units and Paste flagged (each flagged task by name; the flag's one name since review finding N3); every column sorts, both ways");
    check(/<a href="#homework" data-page="homework" data-backend>Homework<\/a>/.test(th) && ["page-homework", "hw-local", "hw-main", "hw-count", "hw-due", "hw-blocks", "hw-list", "hw-report"].every((id) => th.includes('id="' + id + '"')) &&
      /\$\("hw-local"\)\.hidden = !!tb;/.test(tj) && /\$\("hw-main"\)\.hidden = !tb;/.test(tj) && /data-hw-block=/.test(tj) && /for \(const b of HW_BLOCKS\)/.test(tj) &&
      /const HW_BLOCKS = self\.Certificates\.BLOCKS;/.test(tj) && /tb\.createHomework\(hwClassId, c\.homework\)/.test(tj) && /tb\.deleteHomework\(/.test(tj) && /tb\.homeworkReport\(id\)/.test(tj) &&
      /const chosen = \(currentClass\(\) \|\| \{\}\)\.id \|\| null;/.test(tj.slice(tj.indexOf("function renderHomework"))),
      "Homework page: backend mode only (hidden in local mode); the class chosen at the top (own or shared); number of tasks, due date and units from the six blocks with Select all; delete and a report");

    // The server: one rule (homework.js) for both functions; only the server writes progress; 0018 as asked.
    const hs = read("supabase/functions/_shared/homework-server.js"), sapi = read("supabase/functions/student-api/index.ts"), tapi = read("supabase/functions/teacher-api/index.ts");
    const mig = read("supabase/migrations/0018_homework.sql");
    check(/import "\.\.\/\.\.\/\.\.\/homework\.js";/.test(sapi) && /import "\.\.\/\.\.\/\.\.\/homework\.js";/.test(tapi) && /deps\.Homework\.progress\(/.test(hs) &&
      /"paste_flag"\]/.test(sapi) && /async homework\(sid\)/.test(sapi) && /homework: \(await myHomework\(sid\)\) \?\? \[\]/.test(sapi) &&
      ["list_homework", "create_homework", "delete_homework", "homework_report"].every((a) => new RegExp("async " + a + "\\(tid, body\\)").test(tapi)) &&
      /deps\.Sharing\.requireClass\(sb, tid, classId, false\)/.test(hs) && /deps\.Sharing\.onClass\(sb, tid, h\.class_id\)/.test(hs) &&
      !/pin_hash|login_code|student_code|code_hash/.test(hs),
      "Homework on the server: student-api and teacher-api use the site's rule (homework.js); teacher actions need a teacher on the class (owner or co-teacher); no PIN, code or attempt text is read");
    check(/^begin;$/m.test(mig) && /^commit;$/m.test(mig) && /'placement_reset', 'paste_flag'\)/.test(mig) && /\^\[lbpf\]-/.test(mig) &&
      /create table public\.homework \(/.test(mig) && /create table public\.homework_progress \(/.test(mig) && /primary key \(homework_id, student_id\)/.test(mig) &&
      /revoke all on table public\.homework, public\.homework_progress from anon, authenticated;/.test(mig) && /grant select on public\.homework_progress to authenticated;/.test(mig) &&
      !/grant[^;]*(insert|update|delete)[^;]*homework_progress to authenticated/.test(mig) && /using \(class_id in \(select private\.my_class_ids\(\)\)\)/.test(mig) &&
      /using \(student_id in \(select private\.my_student_ids\(\)\)\)/.test(mig) && !/^grant[^;]*\banon\b/m.test(mig) && !/for \w+ to anon/.test(mig),
      "0018: in one transaction; the paste_flag event type (f- ids); homework and homework_progress, read by teachers on the class (owner or co-teacher), homework added by them, progress written only by the server, nothing for anon (students)");
  }

  // ===================== Prompt 6 (2026-11): large paste flags on the Students page =====================
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const PD = require(path.join(ROOT, "paste-details.js"));
    const TDp = require(path.join(ROOT, "teacher-data.js"));
    const T0 = Date.parse("2026-11-16T09:00:00Z"), M = 60000;
    const at = (min) => new Date(T0 + min * M).toISOString();
    const placedAt = (level) => Object.assign(App.freshUnitState(level), { placement: { status: "done", taskIds: [], step: 4, results: [], startLevel: level, used: [] } });
    const data = { students: { s1: { name: "Ada" }, s2: { name: "Bo" } }, progress: { s1: { units: { maths: placedAt(8), selection: placedAt(5) } }, s2: { units: { maths: placedAt(3) } } },
      attempts: [
        // Ada, maths-L9b: a pass before the first paste, a hint and a check on another task after it, then a failed check, then a pass.
        { studentId: "s1", kind: "attempt", at: at(1), unit: "maths", taskId: "maths-L9b", result: "pass", phase: "practice" },
        { studentId: "s1", kind: "hint", at: at(12), unit: "maths", taskId: "maths-L9b", result: "show-me-how", phase: "practice" },
        { studentId: "s1", kind: "attempt", at: at(13), unit: "maths", taskId: "maths-L9a", result: "fail", phase: "practice", code: "print('other task')" },
        { studentId: "s1", kind: "attempt", at: at(15), unit: "maths", taskId: "maths-L9b", result: "fail", phase: "practice", code: "x = int(input())\nprint(x * 2)" },
        { studentId: "s1", kind: "attempt", at: at(20), unit: "maths", taskId: "maths-L9b", result: "pass", phase: "practice" },
        // Ada, if-L9a: skipped in placement after an older paste.
        { studentId: "s1", kind: "skip", at: at(40), unit: "selection", taskId: "if-L9a", result: "skipped", phase: "placement" },
      ], buttonLog: [] };
    const log = [
      { id: "f-1", studentId: "s1", at: at(10), unit: "maths", taskId: "maths-L9b", lines: 12, homework: false, phase: "practice", homeworkId: null },
      { id: "f-2", studentId: "s1", at: at(18), unit: "maths", taskId: "maths-L9b", lines: 9, homework: false, phase: "practice", homeworkId: null },
      { id: "f-3", studentId: "s1", at: at(30), unit: "maths", taskId: "maths-L10a", lines: 20, homework: false, phase: "endless", homeworkId: null },
      { id: "f-old", studentId: "s1", at: at(35), unit: "selection", taskId: "if-L9a", lines: 10, homework: false }, // before phase was kept
    ];
    const flags = TDp.pasteFlagsFor(data, log);
    const maths = flags.s1.maths, sel = flags.s1.selection;

    // Newest first; the next check is the earliest check (attempt or skip) on the same task after the flag.
    check(maths.map((f) => f.id).join() === "f-3,f-2,f-1" && !flags.s2 &&
      maths[2].next.result === "failed" && maths[2].next.at === at(15) && maths[2].next.code === "x = int(input())\nprint(x * 2)" &&
      maths[1].next.result === "passed" && maths[1].next.code === null && maths[1].next.codeNote === PD.CODE_NOTES.passed && maths[1].next.at === at(20),
      "Paste flags: listed newest first; each one's next check is the earliest Check or skip on the same task after the paste (not a hint, another task or an earlier check); a failed check shows its saved code, a passed one says its code isn't kept");
    check(maths[0].next === null && PD.NO_CHECK === "No check since the paste yet." && /PD\.NO_CHECK/.test(read("teacher.js")),
      "Paste flags: with no check on the task since the paste, the dialog says \"No check since the paste yet.\"");
    // An older flag (before phase, lines and homework were stored): Not recorded, and the phase from the next check.
    check(sel.length === 1 && sel[0].lines === null && !sel[0].homework.recorded && sel[0].phase === "placement" && sel[0].phaseFrom === "next-check" &&
      PD.whereText(sel[0]) === "Placement (worked out from the next check)" && sel[0].next.result === "skipped" && sel[0].next.codeNote === PD.CODE_NOTES.skipped &&
      PD.whereText(PD.describe({ id: "x", at: at(0), unit: "maths", taskId: "none", recorded: false }, [], {})) === "Not recorded" &&
      PD.NOT_RECORDED === "Not recorded" && /row\("Homework", PD\.NOT_RECORDED\)/.test(read("teacher.js")) && /row\("Lines pasted", f\.lines == null \? PD\.NOT_RECORDED/.test(read("teacher.js")),
      "Paste flags: an older flag shows \"Not recorded\" for lines and homework, and its phase is worked out from the next check (\"Not recorded\" when there is none)");
    // A recorded flag in homework: the homework's due date; server-cleared code says so.
    const hwFlag = PD.describe({ id: "h", at: at(0), unit: "maths", taskId: "t", phase: "practice", lines: 9, homeworkId: "hw1", recorded: true },
      [{ at: at(5), taskId: "t", kind: "attempt", result: "fail", phase: "practice", code: null, codeDeleted: true }], { hw1: "2026-11-27" });
    check(hwFlag.homework.inHomework && hwFlag.homework.dueOn === "2026-11-27" && PD.whereText(hwFlag) === "Homework (practice)" && hwFlag.lines === 9 &&
      hwFlag.next.code === null && hwFlag.next.codeNote === PD.CODE_NOTES.deleted && PD.countText(1) === "1 flag" && PD.countText(3) === "3 flags",
      "Paste flags: a flag in homework shows \"Homework\" and the homework's due date; code the server cleared after 30 days says so");

    // The Students page: the flag is in the Level cell of that unit only; several show a count; sorting is unchanged.
    const unitIds = Curriculum.UNITS.map((u) => u.id);
    const rows = TDp.sortScoreTable(TDp.scoreTable(data, unitIds).rows, "maths", -1);
    const opts = { rows, unitIds, unitGroups: Curriculum.UNIT_GROUPS, unitTitle: Curriculum.unitTitle, sortKey: "maths", sortDir: -1, when: () => "–" };
    const plain = TDp.overviewTablesHtml(opts);
    const html = TDp.overviewTablesHtml(Object.assign({}, opts, { pasteHtml: (sid, u) => TDp.pasteFlagHtml(sid, u, (flags[sid] || {})[u]) }));
    const cellsWithFlag = [...html.matchAll(/<tr class="(ov-fresh|ov-level)">([\s\S]*?)<\/tr>/g)].flatMap((m) =>
      [...m[2].matchAll(/<td class="unit-cell" data-label="([^"]+)">([\s\S]*?)<\/td>/g)].filter((c) => /paste-flag-btn/.test(c[2])).map((c) => m[1] + ":" + c[1]));
    const buttons = [...html.matchAll(/<button type="button" class="paste-flag-btn"[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[0]);
    check(cellsWithFlag.sort().join() === "ov-level:Maths in Python,ov-level:Selection" && buttons.length === 2 &&
      buttons.some((b) => /data-paste-student="s1" data-paste-unit="maths"/.test(b) && /aria-label="Paste flagged, 3 flags\. Open the details"/.test(b) && />3 flags<\/span>/.test(b)) &&
      buttons.some((b) => /data-paste-unit="selection"/.test(b) && /aria-label="Paste flagged\. Open the details"/.test(b) && !/paste-flag-count/.test(b)),
      "Students page: a red flag appears only in the Level cell of the unit the paste was in (never the Freshness cell or another unit), labelled \"Paste flagged\" (its one name since review finding N3); several show one flag with the count (\"3 flags\")");
    const order = (h) => [...new Set([...h.matchAll(/href="#student=(\w+)"/g)].map((m) => m[1]))].join(); // each table lists every student
    check(order(html) === order(plain) && html.replace(/ <button type="button" class="paste-flag-btn"[\s\S]*?<\/button>/g, "") === plain && order(plain) === "s1,s2",
      "Students page: the flags don't change the sort order (it still uses the level) or anything else in the table");
    const tj = read("teacher.js");
    check(/self\.openDialog\(document, \{/.test(tj) && /id: "paste-flags"/.test(tj) && /e\.target\.closest\("button\[data-paste-student\]"\)/.test(tj) &&
      /tb\.pasteFlagsForClass\(c\.id\)/.test(tj) && /TD\.pasteFlagsFor\(data, Store\.pasteLog\(\)\)/.test(tj) && !/innerHTML/.test(tj.slice(tj.indexOf("function pasteDialogBody"), tj.indexOf("async function openPasteDialog"))) &&
      /<script src="paste-details\.js"><\/script>/.test(read("teacher.html")),
      "Paste flag dialog: the shared openDialog (a button, so Enter opens it too), filled as text only; backend mode asks teacher-api, local mode uses this browser's own record");
    // The code block wraps inside the dialog: no sideways scroll at 390px.
    const css = read("styles.css");
    const rule = (sel) => { const i = css.indexOf("\n" + sel + " {"); return i < 0 ? "" : css.slice(i, css.indexOf("}", i)); };
    check(/white-space: pre-wrap;/.test(rule(".paste-code")) && /overflow-wrap: anywhere;/.test(rule(".paste-code")) && /max-width: 100%;/.test(rule(".paste-code")) &&
      /overflow: auto;/.test(rule(".paste-code")) && /monospace/.test(rule(".paste-code")) && /width: 100%; max-width: 28rem;/.test(rule(".modal")) &&
      /minmax\(0, 1fr\)/.test(rule(".paste-flag-facts")) && /\.modal\.modal-wide \{ max-width: 44rem; \}/.test(css),
      "Paste flag dialog: the code is in a monospace block that wraps long lines (and scrolls up and down inside itself), within a dialog no wider than the screen, so the page never scrolls sideways at 390px");

    // Recording and sending the details; the server's checks; 0019.
    const appS = read("app.js"), rowsTs = read("supabase/functions/_shared/rows.ts"), sapi = read("supabase/functions/student-api/index.ts");
    const tapi = read("supabase/functions/teacher-api/index.ts"), mig = read("supabase/migrations/0019_paste_flag_details.sql"), pfs = read("supabase/functions/_shared/paste-flags-server.js");
    check(/const phase = c\.placement \? "placement" : inAssignment \? "assignment" : endless \? "endless" : "practice";/.test(appS) &&
      /phase, homeworkId: homework\.length \? homework\[0\]\.id : null \}\);/.test(appS) &&
      /paste_phase: orNull\(f\.phase\), paste_lines: orNull\(f\.lines\), paste_homework_id: orNull\(f\.homeworkId\)/.test(read("backend-rows.js")),
      "Paste flag details: the phase, the line count and the open homework's id are recorded with each flag (this browser too) and sent with it; the pasted text never is");
    check(/if \(r\.record_type !== "paste_flag"\) \{\s*const extra = PASTE_FIELDS\.find/.test(rowsTs) && /"bad paste_phase"/.test(rowsTs) && /"bad paste_lines"/.test(rowsTs) &&
      /PasteFlagsServer\.keepOwnHomework\(db\(\), await classOf\(sid\), checked\.ok, rejected\)/.test(sapi) &&
      /async paste_flags_for_class\(tid, body\)/.test(tapi) && /deps\.Sharing\.requireClass\(sb, tid, classId, false\)/.test(pfs) && !/pin_hash|login_code/.test(pfs),
      "Paste flag details on the server: only paste flags may carry them; the homework must be the student's own class's; teacher-api paste_flags_for_class needs a teacher on the class");
    check(/^begin;$/m.test(mig) && /^commit;$/m.test(mig) && /add column paste_phase text check \(paste_phase in \('practice', 'placement', 'endless', 'assignment'\)\)/.test(mig) &&
      /add column paste_lines int check \(paste_lines > 0\)/.test(mig) && /add column paste_homework_id uuid references public\.homework \(id\) on delete set null/.test(mig) &&
      /check \(record_type = 'paste_flag' or \(paste_phase is null and paste_lines is null and paste_homework_id is null\)\)/.test(mig) &&
      !/^\s*(grant|revoke|create policy|alter policy|drop)/im.test(mig),
      "0019: three optional columns on events in one transaction, null unless the row is a paste flag; no grant or policy changes");
  }

  // ===================== Prompt 7 (2026-11): the Debugging (GCSE) unit and the error question =====================
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const U = "debugging-gcse";
    const mine = tasks.filter((t) => t.unit === U);
    const practice = mine.filter((t) => !App.isPlacementTask(t));
    const placement = mine.filter(App.isPlacementTask);
    const tplAll = JSON.parse(read("templates.json"));

    // The error question: two answers, the definitions, and the combined question.
    const ek1 = { ask: "kind", bug: "x", errors: [{ kind: "syntax", line: "if a > 1", fix: "if a > 1:" }] };
    const ekD = { ask: "definition", bug: "x", errors: [{ kind: "logic", line: "t = t - 1", fix: "t = t + 1" }] };
    const ek2 = { ask: "both", bug: "x", errors: [{ kind: "syntax", line: "    print(t", fix: "    print(t)" }, { kind: "logic", line: "t = t - 1", fix: "t = t + 1" }] };
    const q1 = Checker.errorKindQuestion(ek1), qD = Checker.errorKindQuestion(ekD), q2 = Checker.errorKindQuestion(ek2);
    check(q1.parts.length === 1 && q1.parts[0].options.map((o) => o.label).join() === "Syntax error,Logic error" && q1.parts[0].options.map((o) => o.value).join() === "syntax,logic" &&
      Checker.checkErrorKind(ek1, ["syntax"]).correct && !Checker.checkErrorKind(ek1, ["logic"]).correct && !Checker.checkErrorKind(ek1, [null]).complete,
      "Error question (two answers): \"Syntax error\" or \"Logic error\"; the right one passes, the other fails, no answer isn't complete");
    const defs = qD.parts[0].options.map((o) => o.label);
    check(qD.parts.length === 1 && defs.join("|") === [Checker.ERROR_KIND_OPTIONS.syntax, Checker.ERROR_KIND_OPTIONS.logic].join("|") &&
      defs.every((d) => /^[A-Z][^.]*\.$/.test(d) && d.length <= 90 && !/syntax|logic/i.test(d)) &&
      /^A syntax error breaks the rules of the programming language, so the program will not run\.$/.test(Checker.ERROR_KIND_DEFINITIONS.syntax) &&
      /^A logic error does not stop the program running, but the program gives the wrong result\.$/.test(Checker.ERROR_KIND_DEFINITIONS.logic) &&
      Checker.checkErrorKind(ekD, ["logic"]).correct && !Checker.checkErrorKind(ekD, ["syntax"]).correct,
      "Error question (definitions): the two answers are the definitions as plain sentences (no names, so the student matches the meaning), shown as the options before answering");
    const both = Checker.checkErrorKind(ek2, ["logic", "syntax"]);
    check(q2.parts.length === 2 && q2.parts.map((p) => p.line).join("|") === "print(t|t = t - 1" && Checker.checkErrorKind(ek2, ["syntax", "logic"]).correct &&
      !both.correct && both.wrong.join() === "0,1" && Checker.checkErrorKind(ek2, ["syntax", "syntax"]).wrong.join() === "1" && !Checker.checkErrorKind(ek2, ["syntax", null]).complete,
      "Error question (combined): each of the two lines is named syntax or logic; both must be right (which is which)");
    const fail = Checker.classifyAttempt({ type: "write", errorKind: both });
    check(fail.category === "WRONG_ERROR_KIND" && fail.failedTest === null && Checker.matchMisconceptions({ buggy_variants: [{ misconception: "X", outputs: [{ output: "" }] }] }, fail).length === 0 &&
      /Both answers about the errors are wrong/.test(Checker.failureParts(fail).message) && Checker.CATEGORIES.includes("WRONG_ERROR_KIND") &&
      /NO_MATCH_CATEGORIES = \("NO_ANSWER", "WRONG_ERROR_KIND"\)/.test(read("recheck.py")) && /\["failure_category", "WRONG_ERROR_KIND",/.test(read("teacher-data.js")),
      "Error question: a wrong answer is a failed check (WRONG_ERROR_KIND), the program isn't run, no misconception is matched (here or in recheck.py), and the data dictionary explains it");
    // Its programs: the bug is the solution with the errors put in, and each error is what it says (checked by running).
    const ekRun = [];
    const ekJobs = [];
    for (const t of mine) { const js = Checker.errorKindJobs(t.error_kind, t.solution, t.tests); ekRun.push({ t, js, from: ekJobs.length }); ekJobs.push(...js.map((j) => ({ code: j.code, inputs: j.inputs, maxLines: 100000 }))); }
    const ekRes = runPython(ekJobs);
    const ekProblems = ekRun.flatMap(({ t, js, from }) => Checker.errorKindShapeProblems(t.error_kind, t.solution).concat(Checker.errorKindRunProblems(t.error_kind, js, ekRes.slice(from, from + js.length), t.tests.map((x) => x.expected))).map((p) => t.id + ": " + p));
    check(!ekProblems.length && Checker.errorKindRunProblems(Object.assign({}, ekD, { errors: [{ kind: "syntax", line: "a", fix: "b" }] }), [{ role: "bug", test: 0 }], [{ output: "1" }], ["1"]).length === 1,
      "Error question: on every task, a syntax error stops Python running the program and a logic error runs but prints something wrong (each on its own too, when there are two)" + (ekProblems.length ? " " + ekProblems.slice(0, 3).join("; ") : ""));

    // 40 practice tasks (4 at each level, the usual task type), 8 placement tasks; the question by level.
    const ladder = ["predict", "predict", "fill", "fill", "parsons", "parsons", "write", "write", "write", "write"];
    const ask = (lv) => (lv <= 7 ? "kind" : lv === 8 ? "definition" : "both");
    check(practice.length === 40 && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every((lv) => practice.filter((t) => t.level === lv).length === 4) &&
      mine.every((t) => t.type === ladder[t.level - 1] && t.error_kind && t.error_kind.ask === ask(t.level) && /^bug-[LP]\d+[a-z]$/.test(t.id)) &&
      [1, 2, 3, 4, 5, 6, 7, 8].every((lv) => practice.filter((t) => t.level === lv && t.error_kind.errors[0].kind === "syntax").length === 2) &&
      practice.filter((t) => t.level >= 9).every((t) => t.error_kind.errors.length === 2) &&
      placement.length === 8 && [2, 5, 7, 9].every((lv) => placement.filter((t) => t.level === lv).length === 2) &&
      mine.filter((t) => t.type === "write").every((t) => t.starter === t.error_kind.bug) && !tasks.some((t) => t.unit !== U && /^bug-/.test(t.id)),
      "Debugging (GCSE): 40 practice tasks, 4 at each level with the usual task type (predict, fill, Parsons, write); levels 1-7 ask syntax or logic, level 8 the definitions, 9-10 both; 2 of each kind at levels 1-8; 8 placement tasks (levels 2, 5, 7, 9) like the other GCSE units; write tasks start from the program with the errors");
    // Its place: the Validation block, after Authentication (unit menu, Students page, certificate); not the A-level one.
    const valGroup = Curriculum.UNIT_GROUPS.find((g) => g.id === "validation");
    const Cert = require(path.join(ROOT, "certificates.js"));
    const TDg = require(path.join(ROOT, "teacher-data.js"));
    const blocks = TDg.overviewGroups(Curriculum.UNITS.map((u) => u.id), Curriculum.UNIT_GROUPS).filter((g) => g.units.includes(U));
    check(valGroup.units.indexOf(U) === valGroup.units.indexOf("authentication") + 1 && Curriculum.unitTitle(U) === "Debugging (GCSE)" && Curriculum.unitTitle("debugging") === "Debugging" &&
      !Curriculum.A_LEVEL_UNIT_IDS.includes(U) && Curriculum.stageUnits("gcse").includes(U) && !Curriculum.hasScratch(U) && Curriculum.hasPlacement(U) &&
      blocks.length === 1 && blocks[0].block === "Validation" && Cert.BLOCKS.find((b) => b.id === "validation").units.includes(U) && /debugging-gcse \(Debugging \(GCSE\)\)/.test(read("teacher-data.js")),
      "Debugging (GCSE): in the Validation block after Authentication (unit menu, Students page, Validation certificate, export's unit list); a GCSE unit, separate from the A-level Debugging unit");
    // "Show me how": every practice task has a worked example (by task type), and every template of the unit too.
    const keys = [...new Set(practice.map((t) => t.unit + ":" + t.worked_example.skill))].sort();
    const unitTpls = tplAll.filter((t) => t.units.includes(U));
    check(practice.every((t) => t.worked_example && t.worked_example.code && t.worked_example.key_idea && t.worked_example.skill === t.type) &&
      keys.join() === "debugging-gcse:fill,debugging-gcse:parsons,debugging-gcse:predict,debugging-gcse:write" &&
      unitTpls.every((t) => t.worked_example || (tasks.find((x) => x.id === t.source) || {}).worked_example) && unitTpls.filter((t) => t.derived).length === 40,
      "Debugging (GCSE): \"Show me how\" has an example for every one of the 40 practice tasks (one for each task type) and every template; no task is without one");
    // Variants (the climb script, as for the Validation units): 90 or more at every level; a climb never runs out.
    const dr = JSON.parse(require("child_process").execFileSync(process.execPath, [path.join(ROOT, "tests", "validation-units-check.js"), "--units", U], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
    const perLevel = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((lv) => dr.templates.filter((t) => t.level === lv).reduce((n, t) => n + t.different, 0));
    check(dr.templates.length === 40 && perLevel.every((n) => n >= 90) && dr.templates.every((t) => !t.sameTests && !t.shared && t.different >= 5),
      "Debugging (GCSE): every level has 90 or more different variants (" + perLevel.join(", ") + "), from 8 test sets and 4 contexts per task");
    check(dr.sims.every((s) => s.ranOut === 0 && s.steps === 60 && s.sameId === 0) && dr.sims.find((s) => s.kind === "pass-all").top === 10 &&
      dr.sims.find((s) => s.kind === "fail-at-7").levels.every((l) => !/^([89]|10)/.test(l)),
      "Debugging (GCSE): a student who passes everything reaches level 10, and one who fails every level 7 task never runs out of tasks (60 tasks each)");
    // The engine: templates.js and derive-templates.js carry the question into every variant, and check it again.
    const Tm = require(path.join(ROOT, "templates.js"));
    const sample = ["d-bug-L1b", "d-bug-L8a", "d-bug-L9c"].map((id) => Tm.realiseSync(tplAll.find((t) => t.id === id), 3, runPython));
    check(sample.every((v) => v && v.error_kind && Checker.errorKindShapeProblems(v.error_kind, v.solution).length === 0) &&
      sample.map((v) => v.error_kind.ask).join() === "kind,definition,both" && sample[1].starter === sample[1].error_kind.bug &&
      /if \(task\.error_kind\) \{\s*if \(Checker\.errorKindShapeProblems/.test(read("templates.js")) && /tpl\.error_kind = \{ ask: t\.error_kind\.ask, bug: s\(t\.error_kind\.bug\)/.test(read("tools/derive-templates.js")),
      "Error question in templates: every variant carries it (its program and lines changed like the code), and a variant whose errors no longer behave is never used");
    // The practice page: part 1 is the question (the definitions are on screen as its options), part 2 the usual task.
    const appS = read("app.js");
    check(/function errorKindGate\(t, c\)/.test(appS) && /if \(t\.error_kind && !c\.finished && !errorKindGate\(t, c\)\) return;/.test(appS) &&
      /const q = Checker\.errorKindQuestion\(ek\);/.test(appS) && /esc\(o\.label\)/.test(appS) && /numberedCode\(t\.error_kind\.bug\)/.test(appS) &&
      /if \(t\.type === "predict"\) \{ checkPredict\(failure\); return false; \}/.test(appS) && /if \(t\.error_kind\) d\.errorKind = t\.error_kind\.errors\.map\(\(\) => null\);/.test(appS) &&
      App.initialDraft(practice.find((t) => t.level === 9)).errorKind.length === 2 && /\.error-kind \{/.test(read("styles.css")),
      "Practice page: the program with the error, then part 1 (the question, with the definitions as its answers at level 8), then part 2; part 1 must be answered and right before the program is checked");
    // The server: the unit id in rows.ts and migration 0020.
    const rowsTs = read("supabase/functions/_shared/rows.ts"), mig = read("supabase/migrations/0020_debugging_gcse_unit.sql");
    const rowUnits = JSON.parse(rowsTs.match(/export const UNITS = (\[[^\]]*\])/)[1].replace(/\s+/g, " "));
    check(rowUnits.includes(U) && Curriculum.UNITS.every((u) => rowUnits.includes(u.id)) && /^begin;$/m.test(mig) && /^commit;$/m.test(mig) &&
      ["progress", "passed_tasks", "attempts", "events"].every((tb) => new RegExp("alter table public\\." + tb + " add constraint " + tb + "_unit_check[\\s\\S]*?'debugging-gcse'").test(mig)),
      "Server: rows.ts accepts debugging-gcse (and every unit in the curriculum), and 0020 adds it to the unit check of progress, passed tasks, attempts and events, in one transaction");
  }

  // ===================== Prompt 8 (2026-11): "Needs review" rules (rules-review.json, review-rules.js) =====================
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const RR = require(path.join(ROOT, "review-rules.js"));
    const RRT = require(path.join(ROOT, "tools", "review-rules.js"));
    const TDr = require(path.join(ROOT, "teacher-data.js"));
    const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
    // A sample rule (the shipped file has none yet): real buggy-variant code on three bank tasks, so its outputs are real.
    const picks = tasks.filter((t) => !App.isPlacementTask(t) && t.type === "write" && (t.buggy_variants || []).length).slice(0, 3);
    const failing = (t) => t.buggy_variants[0].outputs.findIndex((o, k) => o.errorKind || o.output !== t.tests[k].expected);
    const rule = { id: "rev-sample-rule", name: "Sample rule", description: "A rule for the tests.", added: "2026-11-20", term: "Autumn 2026",
      variants: picks.map((t) => ({ task: t.id, code: t.buggy_variants[0].code, outputs: t.buggy_variants[0].outputs })) };
    const NOW = Date.parse("2026-11-20T12:00:00Z"), DAY = 86400000;
    const ago = (d) => new Date(NOW - d * DAY).toISOString();
    const t0 = picks[0], k0 = failing(t0), out0 = t0.buggy_variants[0].outputs[k0];
    const rec = (o) => Object.assign({ kind: "attempt", result: "fail", studentId: "s1", taskId: t0.id, unit: t0.unit, at: ago(2), category: "WRONG_OUTPUT",
      failedTest: k0 + 1, output: out0.output, errorKind: out0.errorKind, code: "print('my attempt')", misconceptions: [] }, o);
    const data = { students: { s1: { name: "Ada" }, s2: { name: "Bo" } }, progress: {}, buttonLog: [], levelLog: [], placementLog: [], units: Curriculum.UNITS,
      attempts: [rec({ id: "a1" }), rec({ id: "a2", studentId: "s2", at: ago(40) }), rec({ id: "a3", category: "WRONG_ERROR_KIND", at: ago(1) }),
        rec({ id: "a4", at: ago(3), misconceptions: ["SOME_EXISTING"] }), rec({ id: "a5", at: ago(5), output: "something else" }),
        rec({ id: "a6", at: ago(6), studentId: "s2", code: undefined })] };
    const list = RR.matches([rule], RR.candidatesFromRecords(data), NOW);
    check(list.length === 2 && list[0].rule_id === "rev-sample-rule" && list[0].rule_name === "Sample rule" && list[0].task_id === t0.id && list[0].student_name === "Ada" &&
      list[0].at === ago(2) && list[1].student_name === "Bo" && picks.length === 3 && k0 >= 0,
      "Needs review: a new rule's example shows the matching failed attempt with the rule's name, the task, the student's nickname and the date (newest first), using Checker.matchMisconceptions");
    check(!RR.matches([rule], RR.candidatesFromRecords({ students: data.students, attempts: [data.attempts[2]] }), NOW).length &&
      RR.matches([rule], [{ student_name: "X", task_id: t0.id, at: ago(1), category: "WRONG_ERROR_KIND", failed_test: k0 + 1, output: out0.output, error_kind: out0.errorKind, code: null, matched: false }], NOW).length === 0,
      "Needs review: an attempt with a WRONG_ERROR_KIND category is never matched (as recheck.py), even with the same output");
    check(!list.some((m) => m.at === ago(40)) && RR.inWindow(ago(29.9), NOW) && !RR.inWindow(ago(30.1), NOW) && RR.WINDOW_DAYS === 30,
      "Needs review: an attempt older than 30 days is not shown (the window the server keeps code for)");
    check(!list.some((m) => m.at === ago(3)) && !list.some((m) => m.at === ago(5)),
      "Needs review: only attempts that matched no existing misconception, and only when the result on the failing test is the rule's (another output isn't matched)");
    check(list[0].code === "print('my attempt')" && list[1].code === null && /m\.code != null \? '<pre class="review-code"/.test(read("teacher.js")) &&
      /The code is no longer stored\./.test(read("teacher.js")) && !/paste/i.test(read("teacher.js").slice(read("teacher.js").indexOf("function renderReview"), read("teacher.js").indexOf("// ---------- Misconceptions (the workshop)"))),
      "Needs review: the code shown is only the attempt's stored code (\"The code is no longer stored.\" otherwise); nothing pasted is shown");
    // The Workshop per-task table and its CSV: a "Needs review" column.
    const w = TDr.workshop(data, misconceptions, byId, RR.countsByTask(list));
    const th = read("teacher.html");
    check(w.tasks.find((t) => t.taskId === t0.id).needsReview === 2 && /<th scope="col">Has buggy programs<\/th><th scope="col">Needs review<\/th><th scope="col">Unmatched attempts<\/th>/.test(th) &&
      /"has_buggy_variants", "needs_review"\]/.test(read("teacher.js")) && /needs_review: t\.needsReview/.test(read("teacher.js")),
      "Workshop: the per-task table (and its CSV export) has a \"Needs review\" column: how many unmatched attempts a newer rule now matches");
    // The rules file, its tool and the page.
    const shipped = JSON.parse(read("rules-review.json"));
    const fresh = RRT.withOutputs([rule], byId);
    const twoOnly = Object.assign({}, rule, { id: "rev-two", variants: rule.variants.slice(0, 2) });
    check(Array.isArray(shipped) && RRT.problems(shipped, RRT.withOutputs(shipped, byId), byId, misconceptions.map((m) => m.id)).length === 0 &&
      RRT.problems([rule], fresh, byId, misconceptions.map((m) => m.id)).length === 0 && JSON.stringify(fresh) === JSON.stringify([rule]) &&
      RR.rulesProblems([twoOnly], byId, []).some((p) => /at least 3 examples/.test(p)) && RR.rulesProblems([Object.assign({}, rule, { id: "SAMPLE" })], byId, ["SAMPLE"]).length === 2 &&
      misconceptions.length === 79 && /\| Rule id \| Name \| Date added \| Term/.test(read("misconception-changes.md")),
      "Rules file: rules-review.json (empty until Theo approves the first rules) is checked like misconceptions.json (rev- ids, 3+ examples on 3+ bank tasks, outputs worked out by tools/review-rules.js); the 79 misconceptions are unchanged; misconception-changes.md lists the rules");
    const tj = read("teacher.js");
    check(/<section class="teacher-section" data-collapse="mc-review" data-collapse-default="closed" aria-labelledby="mc-review-h">/.test(th) && /<script src="review-rules\.js"><\/script>/.test(th) &&
      /loadJson\("rules-review\.json"\)/.test(tj) && /tb\.reviewCandidates\(c\.id, ids\)/.test(tj) && /RR\.candidatesFromRecords\(data\)/.test(tj) &&
      /RR\.matches\(reviewRules, r\.candidates, Date\.now\(\)\)/.test(tj) && /Adding misconception rules each term/.test(read("README.md")),
      "Misconceptions page: a Needs review section, worked out when the page opens (local mode from this browser's records; backend mode from teacher-api's candidates), with the same rules and window; README has the termly steps");
    const rs = read("supabase/functions/_shared/review-server.js"), tapi = read("supabase/functions/teacher-api/index.ts");
    check(/deps\.Sharing\.requireClass\(sb, tid, classId, false\)/.test(rs) && /\.gte\("timestamp", since\)/.test(rs) && /\.in\("task_id", tasks\)/.test(rs) &&
      /const NO_MATCH = \["NO_ANSWER", "WRONG_ERROR_KIND"\]/.test(rs) && !/pin_hash|login_code/.test(rs) && /async review_candidates_for_class\(tid, body\)/.test(tapi) &&
      !/rules-review/.test(tapi.replace(/\/\/.*$/gm, "")) && !fs.readdirSync(path.join(ROOT, "supabase", "migrations")).some((f) => /review/.test(f)),
      "Needs review on the server: teacher-api gives only the class's failed checks from the last 30 days on the rules' tasks; the rules stay on the website (adding one needs no deploy), and no new table or migration");
  }

  // ===================== Prompt 9 (2026-11): Students page: one table per block, side scrolling, working block buttons =====================
  // The block buttons used to change (aria-expanded, the stored key) while the table stayed on show: the block's body
  // has display: grid, which beats the browser's own [hidden] rule. Each block is now one table with every unit of its
  // group, scrolling sideways inside its own wrapper, with the Name and Shows columns sticky on the left.
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const TD9 = require(path.join(ROOT, "teacher-data.js"));
    const css9 = read("styles.css"), tj9 = read("teacher.js");
    const rule9 = (sel) => { const i = css9.indexOf("\n" + sel + " {"); return i < 0 ? "" : css9.slice(i, css9.indexOf("}", i)); };
    const all = Curriculum.UNITS.map((u) => u.id);
    const data9 = { students: { s1: { name: "Ann" }, s2: { name: "Bo" }, s3: { name: "Cy" } }, progress: { s1: { units: {} }, s2: { units: {} }, s3: { units: {} } },
      attempts: [], buttonLog: [], levelLog: [], placementLog: [], units: Curriculum.UNITS };
    const rows9 = TD9.scoreTable(data9, all).rows;
    // The real collapse.js, with a stand-in page and storage.
    const KEY = "pythonPractice.teacherCollapsedSections";
    const mem9 = {};
    const els9 = {};
    const ctx9 = { localStorage: { getItem: (k) => (k in mem9 ? mem9[k] : null), setItem: (k, v) => { mem9[k] = String(v); } },
      document: { getElementById: (id) => els9[id] || (els9[id] = { id, hidden: false }) } };
    ctx9.self = ctx9;
    require("vm").runInNewContext(read("collapse.js"), ctx9);
    const C9 = ctx9.Collapse;
    let handler9 = null;
    C9.wire({ addEventListener: (_, f) => { handler9 = f; }, contains: () => true }, KEY);
    const render9 = (extra) => TD9.overviewTablesHtml(Object.assign({ rows: TD9.sortScoreTable(rows9, (extra || {}).sortKey || "name", (extra || {}).sortDir || 1), unitIds: all,
      unitGroups: Curriculum.UNIT_GROUPS, unitTitle: Curriculum.unitTitle, sortKey: "name", sortDir: 1, when: () => "today", flagsHtml: () => "",
      buttonHtml: C9.buttonHtml, collapsed: C9.collapsedIds(KEY) }, extra));
    const html9 = render9();
    const blocks9 = html9.split('<section class="overview-block"').slice(1).map((b) => ({
      title: (/<span class="group-arrow" aria-hidden="true"><\/span>([^<]*)/.exec(b) || [])[1],
      units: [...b.matchAll(/data-sort="([^"]+)"/g)].map((m) => m[1]).filter((k) => k !== "name" && k !== "average"),
      tables: (b.match(/<table class="overview-table"/g) || []).length, cols: (b.match(/<col class="ov-col-unit">/g) || []).length,
      students: [...b.matchAll(/<tbody class="ov-student">[\s\S]*?href="#student=(\w+)"/g)].map((m) => m[1]),
      wrap: (b.match(/<div class="table-wrap overview-wrap" role="region" tabindex="0" aria-label="[^"]+">/g) || []).length,
      unitsVar: +(/style="--ov-units: (\d+)"/.exec(b) || [])[1], html: b }));
    const expected9 = Curriculum.UNIT_GROUPS.flatMap((g) => (g.subsections || [g]).map((p) => ({ title: p === g ? g.title : g.title + ": " + p.title, units: p.units })));
    const authId = all.find((u) => Curriculum.unitTitle(u) === "Authentication");
    const valUnits = (blocks9.find((b) => b.title === "Validation") || { units: [] }).units;
    check(blocks9.length === 6 && blocks9.map((b) => b.title).join("|") === "Programming fundamentals|Advanced programming|Validation|Searching and sorting|A-level: Programming techniques|A-level: Data structures" &&
      JSON.stringify(blocks9.map((b) => b.units)) === JSON.stringify(expected9.map((e) => e.units)) && blocks9.every((b) => b.tables === 1 && b.cols === b.units.length && b.unitsVar === b.units.length) &&
      blocks9.reduce((n, b) => n + b.units.length, 0) === all.length && valUnits[valUnits.indexOf(authId) + 1] === "debugging-gcse" && !/\(continued\)/.test(html9),
      "Students page: one table per block (the six blocks, in the curriculum's order), each with every unit of its block as a column; Debugging (GCSE) comes after Authentication in Validation");
    check(blocks9.every((b) => b.students.join() === "s1,s2,s3" && (b.html.match(/<tr class="ov-fresh">/g) || []).length === 3 && (b.html.match(/<tr class="ov-level">/g) || []).length === 3 &&
      /<th scope="col" class="ov-shows">Row<\/th>/.test(b.html) && /data-sort="average"/.test(b.html)),
      "Students page: every student in the class is a row (Freshness and Level) in every block's table, with the Row (\"Shows\" until review finding N17) and Average columns kept");
    check(blocks9.every((b) => /<th scope="col" class="ov-name" aria-sort="ascending"><button type="button" data-sort="name">Name<\/button><\/th>/.test(b.html) && (b.html.match(/<th scope="rowgroup" rowspan="2" class="ov-name">/g) || []).length === 3) &&
      /position: sticky; left: 0;/.test(rule9(".overview-table .ov-name")) && /position: sticky; left: var\(--ov-name\);/.test(rule9(".overview-table .ov-shows")) &&
      /top: auto;/.test(rule9(".overview-table tbody th")) && /z-index: 3;/.test(rule9(".overview-table thead .ov-name, .overview-table thead .ov-shows")),
      "Students page: the student name column (and Shows beside it) has the sticky style, so it stays on the left while the units scroll");
    check(blocks9.every((b) => b.wrap === 1) && /overflow-x: auto;/.test(rule9(".overview-wrap")) && /scroll-padding-left: calc\(var\(--ov-name\) \+ var\(--ov-shows\)\)/.test(rule9(".overview-wrap")) &&
      /grid-template-columns: minmax\(0, 1fr\)/.test(rule9(".overview-tables")) && /grid-template-columns: minmax\(0, 1fr\)/.test(rule9(".overview-block > .group-body")) &&
      /min-width: 0;/.test(rule9(".overview-block")) && /grid-template-columns: minmax\(0, 1fr\)/.test(rule9("@media (max-width: 900px) { .layout")),
      "Students page: each table scrolls sideways inside its own wrapper (a named region a keyboard can scroll), not the page");
    // The block buttons: each one closes and opens its block (aria-expanded, hidden, Hide/Show), remembered in storage.
    // A stand-in for each button on the page (made from the HTML once, then kept, as the page's buttons are).
    const buttons9 = {};
    const press9 = (html, id) => {
      if (!buttons9[id]) {
        const m = new RegExp('<button type="button" class="group-toggle" data-group="' + id + '" aria-expanded="(\\w+)" aria-controls="([^"]+)"').exec(html);
        const state = { textContent: /<span class="group-state">(\w+)<\/span>/.exec(html.slice(m.index))[1] };
        const attrs = { "aria-expanded": m[1], "aria-controls": m[2] };
        els9[m[2]] = { id: m[2], hidden: new RegExp('id="' + m[2] + '" hidden').test(html) };
        buttons9[id] = { state, attrs, dataset: { group: id }, getAttribute: (n) => attrs[n], setAttribute: (n, v) => { attrs[n] = v; }, querySelector: (s) => (s === ".group-state" ? state : null) };
      }
      const b = buttons9[id];
      handler9({ target: { closest: () => b } });
      return b.attrs["aria-expanded"] + ":" + b.state.textContent + ":" + els9[b.attrs["aria-controls"]].hidden;
    };
    const ids9 = [...html9.matchAll(/data-group="(ov-[a-z-]+)"/g)].map((m) => m[1]);
    const toggles = ids9.map((id) => press9(html9, id) + "/" + press9(html9, id));
    check(ids9.length === 6 && toggles.every((t) => t === "false:Show:true/true:Hide:false") && mem9[KEY] === "[]" &&
      (html9.match(/<span class="group-state">Hide<\/span>/g) || []).length === 6 && C9.STATE_TEXT.open === "Hide" && C9.STATE_TEXT.closed === "Show",
      "Students page: each block's button closes and opens its block; its label (Hide or Show) and aria-expanded change with it");
    press9(html9, "ov-advanced");
    const reloaded = render9();
    const closedIn = (h, id) => new RegExp('data-group="' + id + '" aria-expanded="false"[^>]*>[\\s\\S]*?<span class="group-state">Show</span></button></h4><div class="group-body" id="ov-body-' + id.slice(3) + '" hidden>').test(h);
    check(mem9[KEY] === '["ov-advanced"]' && closedIn(reloaded, "ov-advanced") && !closedIn(reloaded, "ov-fundamentals") &&
      /\.overview-block > \.group-body\[hidden\] \{ display: none; \}/.test(css9),
      "Students page: a closed block is remembered after a reload (pythonPractice.teacherCollapsedSections), and a hidden block really is hidden (display: none beats the block's grid)");
    const lastFund = Curriculum.UNIT_GROUPS[0].units[Curriculum.UNIT_GROUPS[0].units.length - 1];
    const sortedHtml = render9({ sortKey: lastFund, sortDir: -1 });
    check(closedIn(sortedHtml, "ov-advanced") && /aria-sort="descending"><button type="button" data-sort="/.test(sortedHtml) &&
      /const closedNow = \[\.\.\.\$\("overview-tables"\)\.querySelectorAll\('button\.group-toggle\[aria-expanded="false"\]'\)\]/.test(tj9) &&
      /collapsed: Collapse\.collapsedIds\(OVERVIEW_KEY\)\.concat\(closedNow\)/.test(tj9) && /w\.scrollLeft = x/.test(tj9),
      "Students page: a sort click keeps a closed block closed (remembered, or closed on the page now if storage is blocked), and each table keeps its sideways scroll");
    check(blocks9.every((b) => ["s1", "s2", "s3"].every((s) => b.html.includes('<a href="#student=' + s + '">'))) && /else if \(p === "student"\) renderStudent\(data, arg\);/.test(tj9) &&
      /const PAGES = \[[^\]]*"student"/.test(tj9),
      "Students page: the student's name links to that student's page (#student=<id>) in every block's table");
    const flagged = render9({ pasteHtml: (sid, u) => (sid === "s2" && u === lastFund ? TD9.pasteFlagHtml(sid, u, [{}, {}]) : "") });
    const flagCells = [...flagged.matchAll(/<tr class="(ov-fresh|ov-level)">([\s\S]*?)<\/tr>/g)].flatMap((m) =>
      [...m[2].matchAll(/<td class="unit-cell" data-label="([^"]+)">([\s\S]*?)<\/td>/g)].filter((c) => /paste-flag-btn/.test(c[2])).map((c) => m[1] + ":" + c[1]));
    const flagBlock = flagged.split('<section class="overview-block"').slice(1).findIndex((b) => /paste-flag-btn/.test(b));
    check(flagCells.join() === "ov-level:" + Curriculum.unitTitle(lastFund) && flagBlock === 0 &&
      /data-paste-student="s2" data-paste-unit="[^"]+" aria-label="Paste flagged, 2 flags\. Open the details"/.test(flagged) && />2 flags<\/span>/.test(flagged) &&
      /e\.target\.closest\("button\[data-paste-student\]"\)/.test(tj9),
      "Students page: the red paste flag is still in the Level cell of the unit it was raised in (the last column of its block), with its count, and opens the dialog");
  }

  // ===================== Prompts 10 and 11 (2026-11): whole-program pastes, and a flagged task is skipped =====================
  // A paste is flagged when it is the whole program (the editor held nothing else, or only the starter comment or blank
  // lines) and at least 3 lines, or when it is more than 8 lines; never when it is expected output. Outside an
  // assignment a flagged task is skipped with the Skip button's own code; in an assignment it stays, marked tried, with
  // Clear code. The student's code is never run while it is flagged.
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const PF = require(path.join(ROOT, "paste-flag.js"));
    const HW = require(path.join(ROOT, "homework.js"));
    const lines = (n, w) => Array.from({ length: n }, (_, i) => (w || "x") + i + " = " + i).join("\n");
    const wt = { type: "write", starter: "# Write your program here\n", tests: [{ inputs: ["5"], expected: "Total: 5\nDone\nBye\n" }] };
    const half = "n = int(input())\nif n > 3:\n";
    check(PF.WHOLE_MIN_LINES === 3 && PF.reason(lines(1), wt, "") === null && PF.reason("print('hi')", wt, "") === null && PF.reason(lines(2), wt, "") === null &&
      PF.reason(lines(3), wt, "") === "whole-program",
      "Paste flag: a 1-line or 2-line paste into an empty editor isn't flagged; a 3-line one is (the whole program, 3 lines or more)");
    check(PF.reason(lines(3), wt, "") === "whole-program" && PF.reason(lines(3), wt, "# Write your program here\n") === "whole-program" &&
      PF.reason(lines(3), wt, "  # Write your program here  ") === "whole-program" && PF.reason(lines(3), wt, "\n  \n") === "whole-program" &&
      PF.reason(lines(3), wt, "# my own note") === null && PF.reason(lines(3), { type: "write", tests: [] }, "# Write your program here") === null,
      "Paste flag: 3 lines pasted after the starter comment is cleared are flagged, and so are 3 lines into an editor holding only the starter comment or blank lines; not after the student's own comment");
    check(PF.reason("\n\n" + lines(2) + "\n\n", wt, "") === null && PF.reason("\n \n" + lines(2) + "\n \n", wt, "") === null && PF.lineCount("\n\n" + lines(2) + "\n\n") === 2 &&
      PF.reason("\n" + lines(3) + "\n", wt, "") === "whole-program",
      "Paste flag: blank lines at the start and end of a paste don't count (blank lines plus 2 code lines aren't flagged)");
    check(PF.reason(lines(9), wt, half) === "long" && PF.reason(lines(8), wt, half) === null && PF.reason(lines(3), wt, half) === null && PF.reason(lines(9), wt, "") === "whole-program",
      "Paste flag: 8 lines pasted into a half-written program aren't flagged; 9 lines are (more than 8, anywhere)");
    check(PF.reason("Total: 5\nDone\nBye", wt, "") === null && PF.reason("Total: 5\nDone", wt, half) === null && PF.reason("  Done  ", wt, "") === null && PF.reason("\n \n", wt, "") === null &&
      PF.reason("print('Total: 5')\nprint('Done')\nprint('Bye')", wt, "") === "whole-program",
      "Paste flag: pasted expected output is never flagged, even 3 lines into an empty editor; code that prints it is");
    check(PF.reason(lines(3), { type: "scratch", tests: [] }, "") === "whole-program" &&
      ["fill", "predict", "parsons", "trace"].every((type) => PF.reason(lines(20), { type, tests: [] }, "") === null) &&
      PF.flags(lines(9), wt) && !PF.flags(lines(3), wt) && PF.isWholeProgram("", wt) && !PF.isWholeProgram("x = 1", wt),
      "Paste flag: only write and write-from-scratch tasks' editors are checked; without the editor's text, only the more-than-8-lines rule applies");
    // The outcome: the Skip button outside an assignment; in an assignment a skip record, the task stays, Clear code.
    const oc = (phase, hw) => JSON.stringify(PF.outcome(phase, hw));
    const skip = '{"kind":"skip","result":"skipped"}';
    check(oc("practice", false) === '{"record":' + skip + ',"skip":true,"keepLevel":false,"clear":false,"moveOn":true,"message":"' + PF.MESSAGE + '"}' &&
      oc("endless", false) === oc("practice", false) && oc("placement", false) === oc("practice", false) &&
      oc("practice", true) === '{"record":' + skip + ',"skip":true,"keepLevel":true,"clear":false,"moveOn":true,"message":"' + PF.HOMEWORK_MESSAGE + '"}' && oc("endless", true) === oc("practice", true) &&
      oc("placement", true) === '{"record":' + skip + ',"skip":true,"keepLevel":false,"clear":false,"moveOn":true,"message":"' + PF.HOMEWORK_MESSAGE + '"}' &&
      oc("assignment", false) === '{"record":' + skip + ',"skip":false,"keepLevel":false,"clear":true,"moveOn":false,"message":"' + PF.ASSIGNMENT_MESSAGE + '"}' && oc("assignment", true) === oc("assignment", false) &&
      PF.ASSIGNMENT_MESSAGE === "Your teacher has been told this code was pasted in. Clear the pasted code and write it yourself." && PF.CLEAR_LABEL === "Clear code",
      "Paste flag outcome: the Skip button in practice, endless and placement; in homework a skip that keeps the level (except a placement question), with the homework message; in an assignment the task stays, with \"Clear the pasted code and write it yourself.\" and Clear code");

    // The real app.js code (onPaste, flagPaste, the Clear code button, nextTask, skipTask, moveOnFrom, recordAttempt and
    // the start of check()) on a stand-in page; finishTask's level step is the real applyOutcome.
    // The checks here run synchronously: "async" and "await" are taken out of the copied code (the stand-ins answer at
    // once), which changes nothing else about it.
    const appP = read("app.js");
    const slice = (from, to) => appP.slice(appP.indexOf(from), appP.indexOf(to)).replace(/\basync /g, "").replace(/\bawait /g, "");
    const pasteSrc = slice("  let pasteFlagPending = false;", "  // ---------- The error question");
    const nextSrc = slice("  async function nextTask() {", "  // The Skip button's record and its effect");
    const skipSrc = slice("  // The Skip button's record and its effect", "  function openAssignmentTask(");
    const recordSrc = slice("  function recordAttempt(", "  // The dialogs after a pass");
    const checkHead = slice("  async function check() {", "    if (t.error_kind && !c.finished");
    const UNIT = "selection";
    const page = (o) => {
      const log = { attempts: [], flags: [], finishTask: 0, placementSteps: [], served: 0, placementServed: 0, ran: 0, shown: [], timers: [] };
      const st = { level: o.level || 5, failStreak: o.failStreak || 0,
        current: { taskId: "sel-L5a", placement: !!o.placement, started: true, hints: 0, attempts: 0, finished: false, passed: false, draft: { code: "" } } };
      const work = { tried: {} };
      const task = Object.assign({ id: "sel-L5a", type: o.type || "write", unit: UNIT, level: 5, skills: [], starter: "# Write your program here\n", tests: wt.tests }, o.task);
      const dom = { msg: null, clear: null };
      const editor = { value: "", history: true, setValue(v) { this.value = v; }, clearHistory() { this.history = false; }, focus() {} };
      const env = {
        preview: false, self: { PasteFlag: PF, Homework: HW }, PasteFlag: PF, Homework: HW, setTimeout: (f) => log.timers.push(f),
        cur: () => (o.assignment ? work.current || (work.current = st.current) : st.current), task: () => task, unitsOf: (t) => t.units || [t.unit], inAssignment: !!o.assignment, endless: !!o.endless,
        student: { id: "s1" }, assignmentId: o.assignment ? "as-1" : null, work, unitId: UNIT, serving: false, busy: false, notice: null, skipArmed: false, resetArmed: false,
        activeEditor: editor, openAssignmentTask: () => {},
        Store: { homework: () => o.homework || [], logPasteFlag: (f) => { log.flags.push(f); }, logAttempt: (sid, r) => { const x = Object.assign({ id: "a-" + log.attempts.length, at: new Date().toISOString(), studentId: sid }, r); log.attempts.push(x); return x; }, attempts: () => log.attempts },
        attemptRecord: App.attemptRecord, levelIn: () => st.level, us: () => st, noteFailedAttempt: () => {}, practiceTaskInPlacement: () => false, reachedFullSecure: () => false, securedDue: false,
        // finishTask, with its real level step (applyOutcome); the notice is set inside (finishTask below).
        finishTaskStub: (passed, setNotice) => {
          const c = env.cur();
          if (c.finished) return {};
          c.finished = true; c.passed = passed;
          if (o.assignment) { work.tried[task.id] = passed ? "passed" : work.tried[task.id] || "tried"; return {}; }
          log.finishTask++;
          const before = st.level;
          const { change, reason, ...fields } = App.applyOutcome(st, { passed, hints: c.hints, skills: [], showHow: false });
          Object.assign(st, fields);
          setNotice(change < 0 ? { kind: "down", text: "Down to level " + st.level + "." } : null);
          return { [(task.units || [task.unit])[0]]: { from: before, to: st.level } }; // keyed by the task's unit, as finishTask does
        },
        finishPlacementStep: (passed) => { const c = env.cur(); c.finished = true; log.placementSteps.push(passed); },
        eachLog: () => {}, save: () => {}, renderButtons: () => {}, renderSide: () => {}, renderTask: () => {},
        inPlacement: () => true, servePlacementTask: () => { log.placementServed++; st.current = { taskId: "next-placement", placement: true, finished: false }; },
        serveNewTask: () => { log.served++; st.current = { taskId: "next-task", finished: false }; return true; }, placementResultText: () => "",
        $: (id) => (id === "editor-help" ? { insertAdjacentHTML: (_, h) => { dom.msg = { html: h, remove() { dom.msg = null; } }; log.shown.push(h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()); } }
          : id === "task" ? { focus() {} } : null),
        document: { querySelector: (sel) => (sel === "#task .paste-flag" ? dom.msg
          : sel === "#task .paste-clear" && dom.msg && /paste-clear/.test(dom.msg.html) ? { addEventListener: (_, f) => { dom.clear = f; } } : null) },
        esc: (s) => s,
      };
      const names = Object.keys(env);
      const run = new Function(...names, "function finishTask(passed) { return finishTaskStub(passed, (n) => { notice = n; }); }\n" +
        pasteSrc + nextSrc + skipSrc + recordSrc + checkHead + "    runTests();\n  }\n" +
        "return { onPaste, check, nextTask, pastedCodeGone, pending: () => pasteFlagPending, notice: () => notice };");
      const api = run(...names.map((n) => env[n]));
      return { api, log, st, work, env, dom, editor };
    };
    // new Function gets runTests as a free name: it is given through a global for the check() slice.
    global.runTests = () => {};
    const flow = (o, text, rest) => {
      const p = page(o);
      global.runTests = () => { p.log.ran++; };
      p.api.onPaste(text, rest);
      const pendingThen = p.api.pending();
      p.api.check();                // pressed while the flag is being handled: nothing runs
      const ranWhilePending = p.log.ran;
      p.log.timers.forEach((f) => f()); // the editor has taken the paste
      return Object.assign(p, { pendingThen, ranWhilePending });
    };
    const keys = (a) => JSON.stringify(["kind", "result", "phase", "levelBefore", "levelAfter", "taskId", "attemptNumber", "hints", "code"].map((k) => a && a[k]));
    // Practice: the flag and a Skip press (Skip, then Skip again to confirm), from the same state: one fail already in a
    // row, so this skip is the second and moves the level down (FAILS_IN_A_ROW_TO_LEVEL_DOWN).
    const practice = flow({ level: 9, failStreak: 1 }, lines(3), "");
    const skipped = page({ level: 9, failStreak: 1 });
    skipped.api.nextTask();
    const armedOnly = skipped.log.attempts.length;
    skipped.api.nextTask();
    const pa = practice.log.attempts[0] || {};
    check(practice.pendingThen && practice.ranWhilePending === 0 && practice.log.ran === 0 && practice.log.attempts.length === 1 && !practice.log.attempts.some((a) => a.result === "pass"),
      "Paste flag: a flagged attempt never runs the tests (Check pressed straight after the paste does nothing) and no pass is shown or recorded");
    check(pa.kind === "skip" && pa.result === "skipped" && pa.phase === "practice" && pa.code === undefined && armedOnly === 0 &&
      keys(pa) === keys(skipped.log.attempts[0]) && pa.levelBefore === 9 && pa.levelAfter === 8 && practice.st.level === 8 && skipped.st.level === 8 &&
      practice.st.failStreak === skipped.st.failStreak && practice.log.finishTask === 1 && skipped.log.finishTask === 1 && App.FAILS_IN_A_ROW_TO_LEVEL_DOWN === 2,
      "Paste flag in practice: exactly a Skip press (the same record, kind skip, result skipped, and the same level effect: a second fail or skip in a row moves the level down, 9 to 8); no code stored");
    check(practice.log.served === 1 && skipped.log.served === 1 && practice.st.current.taskId === "next-task" && practice.api.notice().text === PF.MESSAGE + " Down to level 8." &&
      practice.log.flags.length === 1 && practice.log.flags[0].phase === "practice" && practice.log.flags[0].lines === 3 && Date.parse(practice.log.flags[0].at) < Date.parse(pa.at) + 1,
      "Paste flag in practice: the student moves on to a new task, as after Skip, with the message (and the level message); the flag is recorded with its details, just before the skip");
    const appFlag = appP.slice(appP.indexOf("  function flagPaste("), appP.indexOf("  // The message goes straight under the editor"));
    check(/if \(o\.keepLevel\) skipKeepingLevel\(t, c\);\s*else skipTask\(t, c\);/.test(appFlag) && /if \(!serving\) moveOnFrom\(c, o\.message\);/.test(appFlag) &&
      /skipTask\(t, c\);\s*\}\s*await moveOnFrom\(c\);/.test(appP) && !/applyOutcome|finishTask\(|finishPlacementStep\(/.test(appFlag),
      "Paste flag: practice, endless and placement use the Skip button's own code (skipTask, then moveOnFrom), not a copy of it; homework uses moveOnFrom too");
    // Two practice flags in a row: the second moves the level down, as two Skip presses do.
    const twice = flow({ level: 9 }, lines(3), "");
    twice.api.onPaste(lines(4), "");
    twice.log.timers.slice(1).forEach((f) => f());
    check(twice.log.attempts.length === 2 && twice.log.attempts.every((a) => a.kind === "skip" && a.result === "skipped") &&
      twice.log.attempts[0].levelBefore === 9 && twice.log.attempts[0].levelAfter === 9 && twice.log.attempts[1].levelBefore === 9 && twice.log.attempts[1].levelAfter === 8 &&
      twice.st.level === 8 && twice.log.served === 2,
      "Paste flag in practice: two flags in a row lower the level (9, then 8), as two Skip presses do");
    const endlessRun = flow({ endless: true }, lines(9), half);
    const ea = endlessRun.log.attempts[0] || {};
    check(ea.kind === "skip" && ea.phase === "endless" && endlessRun.log.finishTask === 1 && endlessRun.st.failStreak === 1 && endlessRun.log.served === 1 && endlessRun.log.flags[0].lines === 9,
      "Paste flag in endless mode: a 9-line paste into a started program is a skip, as the Skip button (it counts as a failed task), and a new task comes");
    const placementRun = flow({ placement: true }, lines(3), "");
    const pl = placementRun.log.attempts[0] || {};
    check(pl.kind === "skip" && pl.result === "skipped" && pl.phase === "placement" && JSON.stringify(placementRun.log.placementSteps) === "[false]" && placementRun.log.placementServed === 1 &&
      placementRun.log.finishTask === 0,
      "Paste flag in placement: the Skip button's skip (the question ends as not passed, which can lower the starting level); the next question comes");
    const hwList = [{ id: "hw-1", task_count: 3, due_on: "2099-12-31", units: [UNIT], created_at: "2026-01-01T00:00:00Z", done: 0, complete: false }];
    // Homework (prompt 12): from a state where one more fail would move the level down (a fail already in a row), the
    // flag keeps the level; the Skip button there still moves it, as in practice.
    const homeworkRun = flow({ homework: hwList, level: 9, failStreak: 1 }, lines(4), "");
    const ha = homeworkRun.log.attempts[0] || {};
    const hwFlags = homeworkRun.log.flags.map((f) => ({ at: f.at, unit: f.unit, units: f.units, taskId: f.taskId }));
    check(ha.kind === "skip" && ha.result === "skipped" && ha.phase === "practice" && ha.levelBefore === 9 && ha.levelAfter === 9 &&
      homeworkRun.st.level === 9 && homeworkRun.st.failStreak === 1 && homeworkRun.log.finishTask === 0 && ha.code === undefined,
      "Paste flag in homework: the level is unchanged (9, with a fail already in a row, stays 9; the fail streak doesn't go up), and the skip record shows the same level before and after");
    check(HW.progress(hwList[0], homeworkRun.log.attempts, hwFlags).done === 0 &&
      HW.progress(hwList[0], homeworkRun.log.attempts.concat([Object.assign({}, ha, { kind: "attempt", result: "pass", at: new Date(Date.now() + 1000).toISOString() })]), hwFlags).done === 0 &&
      homeworkRun.log.flags[0].homeworkId === "hw-1" && homeworkRun.log.flags[0].homework === true && homeworkRun.log.flags[0].lines === 4 && homeworkRun.log.flags[0].phase === "practice",
      "Paste flag in homework: it doesn't count towards the homework (not even if the task is passed later); the flag keeps its details (phase, lines, homework id)");
    check(homeworkRun.log.served === 1 && homeworkRun.st.current.taskId === "next-task" && homeworkRun.api.notice().text === PF.HOMEWORK_MESSAGE,
      "Paste flag in homework: the student moves on to a new task with the homework message (and no level message)");
    // The Skip button (prompt 13): on a homework task it keeps the level too (skipKeepingLevel, as the paste flag);
    // anywhere else, and in placement, it is unchanged. press: Skip, then Skip again to confirm (once armed, one press).
    const skipPress = (p) => { const n = p.log.attempts.length; p.api.nextTask(); if (p.log.attempts.length === n) p.api.nextTask(); };
    const hwSkip = page({ homework: hwList, level: 9, failStreak: 1 });
    skipPress(hwSkip);
    const hs = hwSkip.log.attempts[0] || {};
    check(hs.kind === "skip" && hs.result === "skipped" && hs.phase === "practice" && hs.levelBefore === 9 && hs.levelAfter === 9 && hwSkip.st.level === 9 && hwSkip.st.failStreak === 1 &&
      hwSkip.log.finishTask === 0 && keys(hs) === keys(ha),
      "Skip button on a homework task: the level is unchanged (9, with a fail already in a row, stays 9; the fail streak doesn't go up), and the skip record shows the same level before and after, the same record as a homework paste flag");
    skipPress(hwSkip);
    check(hwSkip.log.attempts.length === 2 && hwSkip.log.attempts.every((a) => a.kind === "skip" && a.levelBefore === 9 && a.levelAfter === 9) && hwSkip.st.level === 9 && hwSkip.log.finishTask === 0 &&
      HW.progress(hwList[0], hwSkip.log.attempts, []).done === 0,
      "Skip button on homework tasks: two skips in a row don't lower the level, and skips never count towards the homework");
    check(hwSkip.log.served === 2 && hwSkip.st.current.taskId === "next-task" && hwSkip.api.notice() === null && hwSkip.log.flags.length === 0,
      "Skip button on a homework task: the student moves on to a new task, with no homework message (and no flag)");
    const plainSkip = page({ level: 9 });
    skipPress(plainSkip);
    const afterOne = plainSkip.st.level;
    skipPress(plainSkip);
    check(afterOne === 9 && plainSkip.st.level === 8 && plainSkip.log.attempts.map((a) => a.levelBefore + "-" + a.levelAfter).join() === "9-9,9-8" && plainSkip.log.finishTask === 2,
      "Skip button outside homework: unchanged, two skips in a row lower the level (9, then 8)");
    const placeSkip = page({ placement: true, homework: hwList });
    skipPress(placeSkip);
    check(JSON.stringify(placeSkip.log.placementSteps) === "[false]" && (placeSkip.log.attempts[0] || {}).phase === "placement" && (placeSkip.log.attempts[0] || {}).kind === "skip" &&
      placeSkip.log.placementServed === 1 && /if \(!c\.placement && homeworkFor\(t\)\.length\) skipKeepingLevel\(t, c\);\s*else skipTask\(t, c\);/.test(appP) &&
      /const homework = homeworkFor\(t\);/.test(appP.slice(appP.indexOf("  function flagPaste("))),
      "Skip button in placement (even during homework): unchanged, the question ends as not passed; the Skip button and the paste flag find the homework with the same function (homeworkFor)");

    // Prompt 14: the homework's units. A homework covering unit A (Selection) keeps the level only on tasks in A; a task
    // in unit B (Maths) follows the usual rules. A homework with no units covers every unit.
    const hwA = [Object.assign({}, hwList[0], { units: [UNIT] })];
    const hwAny = [Object.assign({}, hwList[0], { id: "hw-any", units: [] })];
    const mathsTask = { id: "maths-L5a", unit: "maths" };
    const twoSkips = (o) => { const p = page(Object.assign({ level: 9 }, o)); skipPress(p); skipPress(p); return p; };
    const twoFlags = (o) => { const p = flow(Object.assign({ level: 9 }, o), lines(3), ""); p.api.onPaste(lines(4), ""); p.log.timers.slice(1).forEach((f) => f()); return p; };
    const lv = (p) => p.log.attempts.map((a) => a.levelBefore + "-" + a.levelAfter).join() + " at " + p.st.level;
    const inA = twoSkips({ homework: hwA }), inB = twoSkips({ homework: hwA, task: mathsTask }), anyUnit = twoSkips({ homework: hwAny, task: mathsTask });
    check(lv(inA) === "9-9,9-9 at 9" && inA.log.finishTask === 0,
      "Homework with units (Selection): Skip on a Selection task keeps the level (two skips in a row: still 9)");
    check(lv(inB) === "9-9,9-8 at 8" && inB.log.finishTask === 2 && lv(inB) === lv(twoSkips({ task: mathsTask })),
      "Homework with units (Selection): Skip on a Maths task lowers the level after two skips in a row (9, then 8), the same as with no homework");
    check(lv(anyUnit) === "9-9,9-9 at 9" && lv(twoSkips({ homework: hwAny })) === "9-9,9-9 at 9",
      "Homework with no units: Skip keeps the level in any unit (Maths and Selection)");
    const flagB = twoFlags({ homework: hwA, task: mathsTask }), flagA = twoFlags({ homework: hwA });
    check(lv(flagB) === "9-9,9-8 at 8" && flagB.log.flags.every((f) => f.homework === false && f.homeworkId === null) && flagB.api.notice().text === PF.MESSAGE + " Down to level 8.",
      "Paste flag on a Maths task under a homework covering Selection: a practice flag (the usual message, no homework id), so two flags in a row lower the level (9, then 8), as Skip does");
    check(lv(flagA) === "9-9,9-9 at 9" && flagA.log.flags.every((f) => f.homework === true && f.homeworkId === "hw-1") && flagA.api.notice().text === PF.HOMEWORK_MESSAGE,
      "Paste flag on a Selection task under that homework: a homework flag, the level is kept (two flags: still 9), with the homework message");
    // Template variants carry their template's units (templates.js baseTask), never their source task's: a variant of a
    // Selection template whose source is a Maths task is a Selection task; a combined endless variant counts if either
    // of its two units is covered.
    const tplJson = JSON.parse(read("templates.json")), bankById = Object.fromEntries(tasks.map((t) => [t.id, t]));
    const derived = tplJson.filter((x) => x.derived && x.source && bankById[x.source]);
    const comb = tplJson.find((x) => x.units.length === 2);
    const variant = (tpl, over) => Object.assign({ id: tpl.id + "#7", templateId: tpl.id, generated: true, unit: tpl.units[0], units: tpl.units.slice(), source: tpl.source }, over);
    const selVariantMathsSource = variant({ id: "d-test", units: [UNIT], source: "maths-L5a" });
    const mathsVariantSelSource = variant({ id: "d-test2", units: ["maths"], source: "sel-L5a" });
    const combVariant = variant(comb);
    check(/unit: tpl\.units\[0\],\s*units: tpl\.units\.slice\(\),/.test(read("templates.js")) && /const unitsOf = \(t\) => t\.units \|\| \[t\.unit\];/.test(appP) &&
      derived.length > 1000 && derived.every((x) => x.units.includes(bankById[x.source].unit)) &&
      lv(twoSkips({ homework: hwA, task: selVariantMathsSource })) === "9-9,9-9 at 9" && lv(twoSkips({ homework: hwA, task: mathsVariantSelSource })) === "9-9,9-8 at 8" &&
      lv(twoSkips({ homework: [Object.assign({}, hwList[0], { units: [comb.units[1]] })], task: combVariant, endless: true })) === "9-9,9-9 at 9" &&
      lv(twoSkips({ homework: hwA, task: combVariant, endless: true })) === (comb.units.includes(UNIT) ? "9-9,9-9 at 9" : "9-9,9-8 at 8"),
      "Homework units: a template variant uses its own template's units (unitsOf: t.units), not its source task's; a combined endless variant (" + comb.id + ": " + comb.units.join(", ") + ") counts if either unit is covered");
    // Placement and assignments: unchanged. A task already passed in a covered unit: still homework (the unit decides).
    const placeA = page({ placement: true, homework: hwA });
    skipPress(placeA);
    const asgA = flow({ assignment: true, homework: hwA }, lines(3), "");
    const passedBefore = page({ homework: hwA, level: 9, failStreak: 1 });
    passedBefore.log.attempts.push({ kind: "attempt", result: "pass", taskId: "sel-L5a", unit: UNIT, at: "2026-11-01T10:00:00Z" });
    skipPress(passedBefore);
    check(JSON.stringify(placeA.log.placementSteps) === "[false]" && placeA.log.finishTask === 0 &&
      (asgA.log.attempts[0] || {}).phase === "assignment" && asgA.env.cur().pasteFlagged && asgA.log.shown[0] === PF.ASSIGNMENT_MESSAGE + " " + PF.CLEAR_LABEL && asgA.log.flags[0].homeworkId === null &&
      passedBefore.st.level === 9 && passedBefore.log.attempts[1].levelBefore === 9 && passedBefore.log.attempts[1].levelAfter === 9,
      "Homework units: placement (the question ends as not passed) and assignments (Clear code, no homework) are unchanged; a task already passed in a covered unit still keeps the level on Skip");
    const hwPlacement = flow({ homework: hwList, placement: true }, lines(3), "");
    check(JSON.stringify(hwPlacement.log.placementSteps) === "[false]" && hwPlacement.log.placementServed === 1 && (hwPlacement.log.attempts[0] || {}).phase === "placement",
      "Paste flag in a placement question during homework: unchanged, it ends the question as not passed, as the Skip button does");
    // An assignment: the task stays, marked tried, with Clear code; Check doesn't run it; Clear code empties only its
    // editor (and Undo); then writing it works. A whole-program paste after that is flagged again.
    const asg = flow({ assignment: true }, lines(3), "");
    asg.work.drafts = { other: { taskId: "other", draft: { code: "my other answer" } } };
    asg.work.tried.other = "passed";
    const c0 = asg.env.cur();
    c0.draft.code = lines(3);
    asg.editor.value = lines(3);
    const aa = asg.log.attempts[0] || {};
    const shownAfterFlag = asg.log.shown.slice();
    asg.api.check();
    const ranFlagged = asg.log.ran;
    const clearShown = !!asg.dom.clear;
    if (asg.dom.clear) asg.dom.clear();
    const afterClear = { flagged: c0.pasteFlagged, code: c0.draft.code, editor: asg.editor.value, undo: asg.editor.history, msg: asg.dom.msg };
    c0.draft.code = "n = int(input())\nprint(n * 2)"; // the student writes it (the editor's change handler)
    asg.api.check();
    check(aa.kind === "skip" && aa.result === "skipped" && aa.phase === "assignment" && aa.assignmentId === "as-1" && asg.work.tried["sel-L5a"] === "tried" && !c0.finished &&
      asg.log.served === 0 && shownAfterFlag.length === 1 && shownAfterFlag[0] === PF.ASSIGNMENT_MESSAGE + " " + PF.CLEAR_LABEL && clearShown && ranFlagged === 0 &&
      asg.log.shown.length === 2 && asg.log.shown[1] === shownAfterFlag[0],
      "Paste flag in an assignment: a skip record, the task is marked Tried and the student stays on it with \"Clear the pasted code and write it yourself.\" and a Clear code button; Check never runs the pasted code");
    check(afterClear.flagged === false && afterClear.code === "" && afterClear.editor === "" && afterClear.undo === false && afterClear.msg === null &&
      asg.log.ran === 1 && asg.work.tried["sel-L5a"] === "tried" && asg.work.tried.other === "passed" && asg.work.drafts.other.draft.code === "my other answer" &&
      asg.log.attempts.length === 1 && asg.log.flags.length === 1,
      "Paste flag in an assignment: Clear code empties only this task's editor (and its Undo, so the paste can't come back); the Tried mark, the records and the other tasks' answers stay; written afterwards, Check runs it as usual");
    asg.api.onPaste(lines(5), "");
    asg.log.timers.slice(1).forEach((f) => f());
    check(c0.pasteFlagged === true && asg.log.flags.length === 2 && asg.log.attempts.length === 2 && asg.log.attempts[1].kind === "skip",
      "Paste flag in an assignment: after clearing, another whole-program paste is flagged again");
    const del = flow({ assignment: true }, lines(3), "");
    let forgot = 0;
    del.api.pastedCodeGone(del.env.cur(), "x0 = 0", () => { forgot++; });
    const stillFlagged = del.env.cur().pasteFlagged;
    del.api.pastedCodeGone(del.env.cur(), "\n# Write your program here\n", () => { forgot++; });
    check(stillFlagged === true && del.env.cur().pasteFlagged === false && forgot === 1 && del.dom.msg === null &&
      /pastedCodeGone\(c, cm\.getValue\(\), \(\) => cm\.clearHistory\(\)\)/.test(appP) && /pastedCodeGone\(c, ta\.value, /.test(appP),
      "Paste flag in an assignment: deleting all the pasted code by hand clears the flag too (and Undo), in both editors; editing it doesn't");
    // Not flagged: expected output, a 2-line paste, and a typed program, all run as before.
    const outRun = flow({}, "Total: 5\nDone\nBye", ""); // flow presses Check straight after the paste
    const twoRun = flow({}, lines(2), "");
    const typed = page({});
    global.runTests = () => { typed.log.ran++; };
    typed.api.check();
    check(outRun.log.flags.length === 0 && outRun.log.attempts.length === 0 && !outRun.pendingThen && outRun.ranWhilePending === 1 &&
      twoRun.log.flags.length === 0 && twoRun.ranWhilePending === 1 && typed.log.ran === 1 && typed.log.attempts.length === 0,
      "Paste flag: pasted expected output (3 lines) and a 2-line paste aren't flagged or skipped (Check runs the code as usual), and a typed program is checked as before");
    // Both editors give the editor's text just before the paste; the decision is made as the paste happens.
    check(/onPaste\(text, ta\.value\.slice\(0, ta\.selectionStart\) \+ ta\.value\.slice\(ta\.selectionEnd\)\);/.test(appP) &&
      /cm\.on\("beforeChange", \(_, change\) => \{/.test(appP) && /cm\.getRange\(CodeMirror\.Pos\(0, 0\), change\.from\) \+ cm\.getRange\(change\.to, end\)/.test(appP) &&
      /if \(busy \|\| pasteFlagPending\) return;/.test(appP) && /if \(c\.pasteFlagged\) \{ showPasteMessage\(PasteFlag\.ASSIGNMENT_MESSAGE, true\); return; \}/.test(appP) &&
      /if \(c\.pasteFlagged && self\.PasteFlag\) showPasteMessage\(PasteFlag\.ASSIGNMENT_MESSAGE, true\);/.test(appP),
      "Paste flag: both editors (the plain box and CodeMirror) pass the text that stays outside the pasted-over selection; a flagged assignment task shows Clear code again when it is opened again");
    delete global.runTests;
  }

  // ===================== Prompt 15 (2026-11): review fixes B1, B2, B4, N4 =====================
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const TD15 = require(path.join(ROOT, "teacher-data.js"));
    const HW15 = require(path.join(ROOT, "homework.js"));
    const tj = read("teacher.js"), th = read("teacher.html");

    // B1: every average counts only the class's stage's units. A GCSE class student with Output secured at 70% and
    // Recursion (A-level) at 100%: 70% on the Students table and tiles, the teacher's student page and the export.
    const DAY = 86400000, NOW = Date.parse("2026-11-20T12:00:00Z");
    const st15 = (level) => ({ level, placement: { status: "done", startLevel: level }, buttonsUsed: {}, failsInARow: 0 });
    const pass15 = (unit, d) => ({ studentId: "a", kind: "attempt", result: "pass", hints: 0, phase: "practice", taskLevel: 10, unit, units: [unit], at: new Date(NOW - d * DAY).toISOString() });
    const data15 = { students: { a: { name: "Ada" } }, progress: { a: { units: { output: st15(10), recursion: st15(10) } } },
      attempts: [pass15("output", 26), pass15("output", 25), pass15("recursion", 2), pass15("recursion", 1)], buttonLog: [], levelLog: [], placementLog: [], units: Curriculum.UNITS };
    const all15 = Curriculum.UNITS.map((u) => u.id), gcse15 = Curriculum.stageUnits("gcse");
    const studentsTable = TD15.scoreTable(data15, all15, NOW, gcse15);
    const row15 = studentsTable.rows[0];
    const detail15 = TD15.studentDetail(data15, "a", gcse15, NOW, 30, gcse15);
    const csv15 = TD15.classScoresCsv(TD15.scoreTable(data15, gcse15, NOW, gcse15), gcse15, Curriculum.unitTitle).split("\n");
    const avgCell = TD15.overviewAverage(row15).fresh;
    check(row15.cells.recursion.score === 100 && row15.cells.output.score === 70 && row15.average === 70 && row15.band.label === "Revisit soon" && row15.summaryTile === "soon" &&
      studentsTable.summary.tiles.soon === 1 && studentsTable.summary.tiles.gold === 0 && detail15.average === 70 && csv15[1].split(",")[1] === "70" && />70% · Revisit soon</.test(avgCell) &&
      TD15.scoreTable(data15, all15, NOW).rows[0].average === 85,
      "B1: a GCSE class student with a secured unit at 70% and an A-level unit at 100% has the same average, 70%, on the Students table (and its tile), the teacher's student page and the Class scores export (the A-level unit still shows as a column)");
    const recAvg = studentsTable.unitAverages.find((u) => u.unit === "recursion");
    check(TD15.studentAverage(row15.cells, gcse15).average === 70 && TD15.studentAverage(row15.cells, all15).average === 85 && recAvg.counted === false && recAvg.average === null &&
      studentsTable.unitAverages.find((u) => u.unit === "output").average === 70 &&
      (tj.match(/TD\.scoreTable\(/g) || []).length === 5 && (tj.match(/TD\.scoreTable\([^;]*?, null, (stageUnitIds\(\)|self\.Curriculum\.stageUnits\()/g) || []).length === 5 &&
      /const inStage = stageUnitIds\(\);/.test(tj) && /TD\.studentDetail\(data, studentId, unitIds, null, RECENT_ATTEMPTS, inStage\)/.test(tj) && /Object\.assign\(\{ studentId: id, name: s\.name, cells \}, studentAverage\(cells, avgUnits\)/.test(read("teacher-data.js")),
      "B1: one rule for averages (TD.studentAverage), and every place that shows one passes the class's stage's units: the Students table, its tiles and class averages, the student page, the Class scores export and Compare classes");
    check(/Averages and the tiles count only the units for the class's stage; other units still show as columns\./.test(th) && /Not in this class\\'s stage/.test(tj),
      "B1: the Students page says, in one sentence, that only the stage's units count in averages; Compare classes says when a unit isn't in a class's stage");

    // B2: the Homework page follows the class chosen at the top: the real renderHomework, loadHomework and the form's
    // submit on a stand-in page; the top choice changes from class 1 to class 2.
    const strip = (s) => s.replace(/\basync /g, "").replace(/\bawait /g, "");
    const cut = (from, to) => strip(tj.slice(tj.indexOf(from), tj.indexOf(to)));
    const hwSrc = cut("  function renderHomework() {", "  function renderHomeworkList() {") + cut('  $("hw-form").addEventListener("submit"', '  $("hw-list").addEventListener("click"');
    const els = {}, listeners = {};
    const el = (id) => els[id] || (els[id] = { id, hidden: false, textContent: "", value: "", min: "", innerHTML: "", disabled: false, className: "", children: [1], attrs: {},
      focus() {}, reset() {}, querySelectorAll: () => [], querySelector: () => null, appendChild() {}, setAttribute(n, v) { this.attrs[n] = v; },
      addEventListener: (t, f) => { listeners[id + ":" + t] = f; } });
    let chosen15 = { id: "c1", name: "10X" };
    const calls15 = [];
    const tb15 = { allClasses: () => [{ id: "c1", name: "10X" }, { id: "c2", name: "11Y" }], listHomework: (id) => { calls15.push("list " + id); return { homework: [] }; },
      createHomework: (id) => { calls15.push("create " + id); return { homework: [] }; } };
    const run15 = new Function("page", "tb", "currentClass", "$", "HW", "UNITS", "buildUnitPicker", "closeHomeworkReport", "renderHomeworkList", "hwBlockStates", "plural",
      "let hwClassId = null, hwLoadedFor = null, hwList = [], hwOnPage = false, hwReport = null;\n" + hwSrc + "\nreturn { renderHomework, classId: () => hwClassId };");
    let closed15 = 0;
    const api15 = run15(() => "homework", tb15, () => chosen15, el, HW15, Curriculum.UNITS, () => {}, () => { closed15++; }, () => {}, () => {}, (n, w) => n + " " + w);
    api15.renderHomework();
    const first15 = api15.classId();
    chosen15 = { id: "c2", name: "11Y" }; // the teacher picks the second class at the top
    api15.renderHomework();
    el("hw-count").value = "4";
    el("hw-due").value = HW15.ukDate(Date.now() + 3 * DAY);
    listeners["hw-form:submit"]({ preventDefault() {} });
    check(first15 === "c1" && api15.classId() === "c2" && calls15.join() === "list c1,list c2,create c2" && closed15 === 2 && // a class change closes an open report

      !/id="hw-class"/.test(th) && !/\$\("hw-class"\)/.test(tj),
      "B2: the Homework page follows the class picker at the top: after switching to the second class it lists that class's homework and sets new homework for it (no separate Homework class picker)");

    // B4: no level-by-task-type breakdown on the practice page (or the home page); each task still shows its type.
    check(!/1–2 predict|8–10 write the code|id="level-help"/.test(read("practice.html")) && !/level-help/.test(read("app.js")) &&
      /Each unit has its own level, from 1 to 10\.<\/p>/.test(read("app.html")) && !/from 1 \(predict the output\) to 10/.test(read("app.html")) &&
      /type-banner/.test(read("app.js")) && /<span class="type-label">/.test(read("app.js")),
      "B4: the practice page no longer shows \"1–2 predict … 8–10 write the code\" (wrong for many units), and the home page no longer ties levels to task types; the task type on each task is unchanged");

    // N4: the three places describe the current paste rule in the same sentence.
    const RULE = "A paste is flagged when the editor is empty and the paste is 3 lines or more, or when a single paste is more than 8 lines.";
    const flat = th.replace(/\s+/g, " ");
    const at15 = (from, to) => flat.slice(flat.indexOf(from), flat.indexOf(to, flat.indexOf(from)));
    check(flat.split(RULE).length - 1 === 3 && at15('class="small flag-key"', "</ul>").includes(RULE) && at15('id="homework-title"', 'id="hw-local"').includes(RULE) && at15('id="hw-how"', "</details>").includes(RULE) &&
      at15('id="hw-report-h"', 'id="hw-report-table"').includes(RULE) && !/more than 8 lines of code/.test(flat),
      "N4: the Students page flag key, the Homework intro and the Homework report note all give the current rule in the same sentence (empty editor and 3 lines or more, or more than 8 lines at once)");
  }

  // ===================== Prompt 16 (2026-11): review fix B3, "Placement to do" instead of a level =====================
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const S16 = require(path.join(ROOT, "secured.js"));
    const TD16 = require(path.join(ROOT, "teacher-data.js"));
    const pl = (status, level, start) => ({ level, placement: { status, taskIds: [], step: 0, results: [], startLevel: start == null ? null : start, used: [] }, buttonsUsed: {} });
    const pending = pl("pending", 1), taking = pl("in-progress", 1), done = pl("done", 6, 6), noRecord = { level: 4, buttonsUsed: {} }, notTaken = pl("not-taken", 3);
    // The one rule (secured.js), the same as the home page's (app.js needsPlacement) and the teacher view's (placed).
    check(S16.PLACEMENT_TO_DO === "Placement to do" && S16.placementToDo(pending) && S16.placementToDo(taking) && !S16.placementToDo(done) && !S16.placementToDo(noRecord) && !S16.placementToDo(null) &&
      S16.levelText(pending) === "Placement to do" && S16.levelText(taking) === "Placement to do" && S16.levelText(done) === "Level 6" && S16.levelText(noRecord) === "Level 4" &&
      S16.levelText(notTaken) === "Level 3" && S16.levelText(null) === null &&
      [pending, taking, done, noRecord, notTaken, null].every((s) => App.needsPlacement(s) === S16.placementToDo(s)) &&
      S16.unitColour({ started: true, placed: false }).label === S16.PLACEMENT_TO_DO,
      "B3: one rule for \"Placement to do\" (secured.js placementToDo, the home page's needsPlacement): a quick check pending or being taken shows it, whatever the level; a finished one shows the level; a unit with no quick check on record (an older student) shows its level, as before");
    // The teacher's Students table (Level row), the Class scores export and the Levels table export (TD.levelShown).
    const cell16 = (st) => TD16.scoreTable({ students: { a: { name: "Ann" } }, progress: { a: { units: { selection: st } } }, attempts: [], buttonLog: [] }, ["selection"]).rows[0].cells.selection;
    const lvRow = (st) => TD16.overviewCell(cell16(st), () => "").level;
    const csv16 = (st) => TD16.classScoresCsv(TD16.scoreTable({ students: { a: { name: "Ann" } }, progress: { a: { units: { selection: st } } }, attempts: [], buttonLog: [] }, ["selection"]), ["selection"], (u) => u).split(/\r?\n/)[1];
    check(lvRow(pending).startsWith('<span class="rag rag-placement">Placement to do</span>') && !/Level \d/.test(lvRow(pending)) && !/Level \d/.test(lvRow(taking)) &&
      /Level 6/.test(lvRow(done)) && /Level 4/.test(lvRow(noRecord)) &&
      /,Placement to do$/.test(csv16(pending)) && /,6$/.test(csv16(done)) && /,4$/.test(csv16(noRecord)) &&
      TD16.levelShown(cell16(pending)) === "Placement to do" && TD16.levelShown(cell16(done)) === 6 && TD16.levelShown(cell16(noRecord)) === 4 && TD16.levelShown({ started: false }) === "" &&
      /\[u\.id \+ "_level"\]: TD\.levelShown\(c\)/.test(read("teacher.js")),
      "B3: the teacher's Students table (Level row, the student's blue \"Placement to do\" chip), the Class scores export and the Levels table export show \"Placement to do\" for a unit still to be placed, and the level once it is placed (or with no quick check on record); the columns are unchanged");
    // Each page that shows a level uses the rule: My progress, Endless mode, the practice page, the teacher's student page.
    const prog = read("progress.js"), endl = read("endless.js"), appP = read("app.js"), tj16 = read("teacher.js");
    check(/const level = self\.Secured\.levelText\(x\.s\) \|\| "Not started";/.test(prog) && /self\.Secured\.placementToDo\(x\.s\) \? self\.Secured\.PLACEMENT_TO_DO/.test(prog) &&
      /const toDo = self\.Secured\.placementToDo\(s\);/.test(endl) && /toDo \? self\.Secured\.PLACEMENT_TO_DO : "Level " \+ s\.level/.test(endl) &&
      /<script src="secured\.js"><\/script>\s*<script src="endless\.js">/.test(read("endless.html")) &&
      /if \(needsPlacement\(us\(u\)\)\) return '<li class="unit-progress">'/.test(appP) && /const needsPlacement = \(state\) => securedLib\(\)\.placementToDo\(state\);/.test(appP) &&
      /'<span class="small">' \+ \(c\.placementToDo \? "" :/.test(tj16) &&
      !/"Level " \+ x\.s\.level : "Not started"/.test(prog) && !/const level = s \? "Level " \+ s\.level/.test(endl),
      "B3: My progress, Endless mode, the practice page's side panel and the teacher's student page show \"Placement to do\" instead of a level while the quick check isn't finished (the same rule and wording), and the level once it is");
  }

  // ===================== Prompt 17 (2026-11): review fix N2, one phrase "Placement to do" on the teacher side =====================
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const TD17 = require(path.join(ROOT, "teacher-data.js"));
    const pl17 = (status, level) => ({ level, placement: { status, taskIds: [], step: 0, results: [], startLevel: status === "done" ? level : null, used: [] }, buttonsUsed: {} });
    const data17 = { students: { a: { name: "Ann" }, b: { name: "Bo" }, c: { name: "Cy" } }, buttonLog: [], attempts: [],
      progress: { a: { units: { selection: pl17("in-progress", 1) } }, b: { units: {} }, c: { units: { selection: pl17("done", 6) } } } };
    const t17 = TD17.scoreTable(data17, ["selection"]);
    const row = (n) => t17.rows.find((r) => r.name === n);
    const cellA = TD17.overviewCell(row("Ann").cells.selection, () => "");
    check(cellA.fresh === '<span class="rag rag-none">Placement to do</span>' && cellA.level.startsWith('<span class="rag rag-placement">Placement to do</span>') &&
      TD17.overviewAverage(row("Ann")).fresh === '<span class="rag rag-none">Placement to do</span>' &&
      TD17.overviewAverage(row("Bo")).fresh === '<span class="small">Not started</span>' && /Level 6/.test(TD17.overviewCell(row("Cy").cells.selection, () => "").level),
      "N2: an unfinished quick check shows \"Placement to do\" in both the Freshness cell (grey) and the Level row (blue) on the Students page; the Average column says it for a student who has started a unit but placed none, and \"Not started\" for one who has started nothing");
    const tj17 = read("teacher.js");
    check(/\(c\.placed \? bandHtml\(c\) : PLACEMENT_GREY\) \+ " " \+ '<span class="small">' \+ \(c\.placementToDo \? "" :/.test(tj17) && !/PLACEMENT_BLUE/.test(tj17),
      "N2: the teacher's student page shows one grey \"Placement to do\" chip for an unfinished quick check (not a level, and not a second chip)");
    const teacherSide = read("teacher.html") + read("teacher.js") + read("teacher-data.js") + read("teacher-backend.js");
    check(!/[Nn]ot placed yet/.test(teacherSide) && !/[Nn]ot placed/.test(read("teacher.html")),
      "N2: \"Not placed yet\" no longer appears anywhere on the teacher side (pages, tiles, the colour key, the Leaderboards help or the exports)");
    const tile = TD17.SUMMARY_TILES.find((x) => x.key === "none");
    check(tile.label === "Placement to do" && TD17.SUMMARY_TILES.indexOf(tile) === 8 && TD17.SUMMARY_TILES.length === 9 && t17.summary.tiles.none === 2 &&
      row("Ann").summaryTile === "none" && row("Bo").summaryTile === "none" && row("Cy").summaryTile === "lv-amber",
      "N2: the summary tile is called \"Placement to do\" (last of the nine, as before), and it still counts the students with no unit placed (here 2)");
    const csv17 = TD17.classScoresCsv(t17, ["selection"], (u) => u).split(/\r?\n/);
    check(csv17[0] === "Name,Average secured score,RAG,selection: secured score,selection: label,selection: level" &&
      csv17.find((l) => l.startsWith("Ann,")) === "Ann,Placement to do,,Placement to do,Placement to do,Placement to do" &&
      csv17.find((l) => l.startsWith("Bo,")) === "Bo,not started,,not started,," && tile.note === "no quick check finished yet, or no unit started",
      "N2: the Class scores export says \"Placement to do\" in the same cells as the screen (average, secured score, label and level), and \"not started\" as the average of a student who has started nothing; the same columns");
    const home17 = read("home.js"), app17 = read("app.html"), prog17 = read("progress.js");
    check(/levelText = "Quick check to finish"/.test(home17) && /rag-placement">Placement to do<\/span> until you finish the quick check/.test(app17) &&
      /self\.Secured\.levelText\(x\.s\) \|\| "Not started"/.test(prog17) && !/[Nn]ot placed yet/.test(home17 + app17 + prog17 + read("endless.js")),
      "N2: the student side is unchanged (the home card's \"Quick check to finish\" and its \"Placement to do\" chip, My progress's wording)");
  }

  // ===================== Prompt 19 (2026-11): the approved "Fix soon" findings =====================
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const TD19 = require(path.join(ROOT, "teacher-data.js"));
    const S19 = require(path.join(ROOT, "secured.js"));
    const th = read("teacher.html"), tj = read("teacher.js"), tdSrc = read("teacher-data.js");
    const flat = th.replace(/\s+/g, " ");
    // N1: skills are "mastered" on My progress; units keep "Secured".
    const progJs = read("progress.js"), progHtml = read("progress.html");
    check(/A skill is <strong>mastered<\/strong> when you pass/.test(progHtml) && (progJs.match(/skills mastered/g) || []).length === 3 && !/skills secured/.test(progJs) &&
      /const STATUS_TEXT = \{ secured: "Mastered",/.test(progJs) && /see the skills you've mastered\./.test(read("tour.js")) && S19.BANDS[0].label === "Secured",
      "N1: on My progress a skill is \"mastered\" (the intro, the unit cards, a unit's page and its skill list, and the tour); units keep the band name \"Secured\"");
    // N3: one name for the flag, "Paste flagged".
    const flagBtn = TD19.pasteFlagHtml("s1", "maths", [{}, {}]);
    check(!/Large paste flagged|Possible AI use/.test(th + tj + tdSrc) && TD19.PASTE_FLAGGED === "Paste flagged" && /aria-label="Paste flagged, 2 flags\. Open the details"/.test(flagBtn) &&
      /Paste flagged in a task in this unit/.test(flat) && /The report lists these flags as "Paste flagged"\./.test(flat) && /"Paste flagged" lists the student's flagged tasks, which didn't count\./.test(flat) &&
      /title: TD\.PASTE_FLAGGED \+ ": " \+ name/.test(tj) && /label: TD\.PASTE_FLAGGED/.test(tj),
      "N3: the flag is called \"Paste flagged\" everywhere on the teacher side (the Students key, the flag's label, its dialog, the Homework intro, report column and note); \"Large paste flagged\" and \"Possible AI use\" are gone");
    // N5 and N12.
    check(/The stage decides which units count in averages, and which sections of the unit menu open by default for your students/.test(flat) &&
      /Every unit still shows on the Students page\./.test(flat) && !/The stage decides which units the Students page shows/.test(flat),
      "N5: the Classes page's stage help says the stage decides which units count in averages (and which sections open first), and that every unit still shows on the Students page");
    check(!/Theo/.test(th) && /\(added each term, after each one has been checked\)/.test(flat),
      "N12: the Needs review help no longer names a person (\"added each term, after each one has been checked\")");
    // N7: the site's name.
    const pages = ["index.html", "app.html", "practice.html", "progress.html", "leaderboard.html", "endless.html", "teacher.html", "certificate.html"].map(read).join("") + read("app.js");
    check(!/Python Practice/.test(pages) && /<title>Pythons and Ladders<\/title>/.test(read("index.html")) && /alt="Pythons and Ladders"/.test(read("app.html")) &&
      /Welcome to Pythons and Ladders/.test(read("app.html")) && /document\.title = pageTitle \+ " – Pythons and Ladders";/.test(read("app.js")) &&
      /<title>Teacher View – Pythons and Ladders<\/title>/.test(th) && /"python-practice-class-scores-"/.test(tj) && /"python-practice-full-data-"/.test(tj),
      "N7: tab titles, the logo's alt text, the page headers and the landing heading say \"Pythons and Ladders\"; the export file names (python-practice-….csv) are unchanged");
    // L2: the homework list first, Set homework opens the form, a report opens under its own homework.
    const hwPage = th.slice(th.indexOf('<section id="page-homework"'), th.indexOf("<!-- ===== Assignments"));
    check(hwPage.indexOf('id="hw-list"') < hwPage.indexOf('id="hw-new"') && hwPage.indexOf('id="hw-new"') < hwPage.indexOf('id="hw-form"') &&
      /<form id="hw-form" class="task-card" novalidate aria-labelledby="hw-form-h" hidden>/.test(hwPage) && /id="hw-new" class="primary" aria-expanded="false" aria-controls="hw-form">Set homework</.test(hwPage) &&
      /data-hw-item="' \+ esc\(h\.id\) \+ '"/.test(tj) && /if \(card\) card\.appendChild\(\$\("hw-report"\)\); else parkHomeworkReport\(\);/.test(tj) &&
      /closeHomeworkForm\(\);\s*hwList = r\.homework;/.test(tj),
      "L2: the Homework page lists the class's homework first, then Set homework, which opens the form (closed again once it is set, or with Cancel); a report opens inside its own homework's card");
    // L4 and S1: one help paragraph, the colour key under the tiles, the long rules folded away.
    const stPage = th.slice(th.indexOf('<section id="page-students"'), th.indexOf("<!-- ===== Leaderboards"));
    const stFlat = stPage.replace(/\s+/g, " ");
    check(stPage.indexOf('id="st-summary"') < stPage.indexOf('class="small rag-key"') && stPage.indexOf('class="small rag-key"') < stPage.indexOf('data-collapse="students"') &&
      /<details class="rag-more">\s*<summary>More about the colours<\/summary>/.test(stPage) && !/Each student has two rows/.test(stPage) &&
      (stFlat.match(/Averages and the tiles count only the units for the class's stage; other units still show as columns\./g) || []).length === 1 &&
      (stFlat.match(/A paste is flagged when the editor is empty and the paste is 3 lines or more, or when a single paste is more than 8 lines\./g) || []).length === 1 &&
      /drops 10 points for each full week/.test(stFlat.slice(stFlat.indexOf("rag-more"))) && (stPage.match(/Two rows per student/g) || []).length === 1,
      "L4 and S1: the Students page has one help paragraph (no repeated \"Each student has two rows\"), the colour key right under the tiles, and the longer rules in a closed \"More about the colours\"; the averages and paste-rule sentences are kept once each");
    // S2: a class with no students.
    check(/<p id="st-empty" class="notice" hidden><\/p>\s*<div id="st-body">/.test(stPage) &&
      /const none = !Object\.keys\(data\.students\)\.length;\s*\$\("st-empty"\)\.hidden = !none;\s*\$\("st-body"\)\.hidden = none;/.test(tj) &&
      /"No students yet\. They join with the class code " \+ c\.class_code \+ "\."/.test(tj) && /"No students yet\. Students appear here once they use this browser\."/.test(tj) &&
      /No students to show yet\./.test(tdSrc),
      "S2: a class with no students shows one short line (\"No students yet. They join with the class code …\"), not the tiles, help and tables; a name filter that matches nobody still says \"No students to show yet.\"");
    // L5: Change nickname in the header.
    const appHtml = read("app.html"), homeJs = read("home.js");
    check(/<span id="rename-link-area" hidden> · <a href="#delete-area" id="rename-link">Change nickname<\/a><\/span>/.test(appHtml) &&
      /\$\("rename-link-area"\)\.hidden = false;/.test(homeJs) && /\$\("rename-link"\)\.addEventListener\("click", \(e\) => \{ e\.preventDefault\(\); \$\("rename-mine"\)\.click\(\); \}\);/.test(homeJs) &&
      /<div class="delete-zone">\s*<p><button type="button" id="delete-mine"/.test(appHtml) && /\.delete-zone \{ margin-top: 2rem;/.test(read("styles.css")),
      "L5: in backend mode the home page's header has a \"Change nickname\" link that opens the same form; Delete everything saved for me sits apart from it, below a line");
    // L7.
    check(/if \(mcUnit !== "all" && !unitIds\.includes\(mcUnit\)\) mcUnit = "all";/.test(tj),
      "L7: the Misconceptions page opens on All units");
    // T1: unchanged.
    check(TD19.summaryTileOf({ average: 85 }) === "fading" && TD19.summaryTileOf({ average: 100 }) === "gold" && TD19.SUMMARY_TILES.length === 9,
      "T1: the summary tiles are unchanged: each student still counts by their average (85% is Fading)");
    // T2: "630 of 12,000", until prompt 24 made the combined total the number only (it has no limit). The notes keep
    // the maximum (from the server's max), and the % column is unchanged.
    const lbJs = read("leaderboard.js");
    check((12000).toLocaleString("en-GB") === "12,000" && !/const outOf =|outOf\(/.test(tj) &&
      /const num = \(r\) => \(gain \? signed\(r\.points\) : thousands\(r\.points\)\);/.test(tj) && /boardsHtml\(r\.boards, false, r\.max\)/.test(tj) && /boardsHtml\(r\.boards, true, r\.max\)/.test(tj) &&
      /const total = \(n\) => thousands\(n\);/.test(lbJs) && !/" of "/.test(lbJs) && /\$\("me-total"\)\.textContent = total\(me\.total\);/.test(lbJs) &&
      /field === "Points gained" \? plus\(r\.points\) : total\(r\.points\)/.test(lbJs) && /Secured and level points give up to 300 a unit, " \+ thousands\(boardMax\) \+ " in all/.test(tj),
      "T2 (since prompt 24): the leaderboards (teacher and student) show the combined total as a number only, \"12,400\", with no \"of 12,000\"; the notes still give the 300-a-unit maximum");
    // T3: the student page's bars, reset menu and points line.
    check(/const startedUnits = UNITS\.map\(\(u\) => u\.id\)\.filter\(\(u\) => \(\(data\.progress\[studentId\] \|\| \{\}\)\.units \|\| \{\}\)\[u\]\);/.test(tj) &&
      /const unitIds = UNITS\.map\(\(u\) => u\.id\)\.filter\(\(u\) => inStage\.includes\(u\) \|\| startedUnits\.includes\(u\)\);/.test(tj) &&
      /\(inStage\.includes\(u\) \? "" : '<span class="small">\(not in this class\\'s stage\)<\/span> '\)/.test(tj) &&
      /\$\("reset-unit"\)\.innerHTML = startedUnits\.length \? startedUnits\.map/.test(tj) && /'<option value="">No unit started yet<\/option>'/.test(tj) &&
      /Points count every unit, as on the Leaderboards page\./.test(tj),
      "T3: the teacher's student page shows any started unit outside the class's stage (tagged, not in the average), lists only started units for Reset placement, and says points count every unit");
    const gcse19 = Curriculum.stageUnits("gcse");
    const d19 = TD19.studentDetail({ students: { a: { name: "Ada" } }, progress: { a: { units: { output: { level: 4 }, recursion: { level: 3 } } } }, attempts: [], buttonLog: [] },
      "a", Curriculum.UNITS.map((u) => u.id).filter((u) => gcse19.includes(u) || ["output", "recursion"].includes(u)), null, 5, gcse19);
    check(d19.cells.recursion && d19.cells.recursion.level === 3 && d19.averageLevel === 4,
      "T3: an A-level unit a GCSE student started has its own bar on the student page, but their average (here their average level, 4) counts only the GCSE units");
  }

  // ===================== Prompt 21 (2026-11): the approved "Later" findings =====================
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const TD21 = require(path.join(ROOT, "teacher-data.js"));
    const App21 = require(path.join(ROOT, "app.js"));
    const th = read("teacher.html"), tj = read("teacher.js"), tb = read("teacher-backend.js"), css = read("styles.css");
    const app = read("app.html"), tour = read("tour.js"), endless = read("endless.js"), home = read("home.js");
    const flat = th.replace(/\s+/g, " ");
    const pageOf = (id) => { const i = th.indexOf('<section id="page-' + id + '"'); return th.slice(i, th.indexOf("<!-- =====", i + 10)); };
    const between = (src, from, to) => { const i = src.indexOf(from); return i < 0 ? "" : src.slice(i, src.indexOf(to, i + from.length)); };
    const Tour21 = require(path.join(ROOT, "tour.js"));

    // Theme A: wording and naming.
    const scoreStep = Tour21.STEPS.find((s) => s.id === "freshness");
    check(scoreStep.title === "Your score" && !/freshness score/.test(tour) && !/title: "Freshness"/.test(tour) &&
      /but not towards your score\./.test(tour) && /doesn't count towards your score\./.test(tour),
      "N6: the tour says \"score\", not \"freshness score\" (the Hints and Show me how steps), and the step is called \"Your score\"");
    check(/<h2 id="assignments-h">Assignments<\/h2>/.test(app) && !/From your teacher/.test(app) && /"Your teacher has set a new assignment: "/.test(tour) && !/new practice set/.test(tour) &&
      /Practice set for your class\. It doesn't change your level or progress/.test(app),
      "N8: the student home page's heading is \"Assignments\" and the tour's reminder says \"a new assignment\"; the card's \"Practice set for your class\" note stays");
    check(/made with "Full attempt log \(CSV\)" before the class used the server/.test(tb) && !/Export full data/.test(tb) &&
      /<button type="button" id="export-full" class="secondary">Full attempt log \(CSV\)<\/button>/.test(th) && /"python-practice-full-data-" \+ today\(\) \+ "\.csv"/.test(tj),
      "N9: the Import help (and its error) names the export by its button, \"Full attempt log (CSV)\"; the export's file name is unchanged");
    const logins = between(tb, "function renderStudents()", "function wireClasses()");
    check(/'">Remove<\/button>'/.test(logins) && /hidden> Remove ' \+ esc\(s\.nickname\) \+ " and all their data for good\? "/.test(logins) && /'">Yes, remove<\/button> '/.test(logins) &&
      !/Delete|delete<\/button>/.test(logins.replace(/data-delete[-\w]*/g, "")),
      "N10: the Student logins table says Remove (\"Remove Ada and all their data for good?\", \"Yes, remove\"), as the student's page does");
    const codes = [...TD21.dataDictionaryCsv([]).matchAll(/^value of failure_category,([A-Z_]+),/gm)].map((m) => m[1]);
    const plain = { WRONG_OUTPUT: "Wrong output", SYNTAX: "Syntax error", NAME: "Name error", TYPE: "Type error", TIMEOUT: "Took too long", NO_ANSWER: "No answer",
      ORDER: "Lines in the wrong order", OTHER_ERROR: "Other error", WRONG_CHOICE: "Wrong choice", WRONG_ERROR_KIND: "Wrong kind of error" };
    check(Object.keys(plain).every((c) => TD21.failureName(c) === plain[c]) && Object.keys(TD21.FAILURE_NAMES).length === 10 && codes.length === 10 &&
      codes.every((c) => TD21.FAILURE_NAMES[c]) && TD21.failureName("NEW_CODE") === "NEW_CODE" && TD21.failureName("") === "" && TD21.failureName(undefined) === "",
      "N11: every failure category in the data dictionary has a plain name (Wrong output, Syntax error, … Wrong kind of error); an unknown code shows as it is");
    const rec = between(tj, '$("sd-recent").innerHTML = d.recent.length', '$("reset-placement")');
    check(/esc\(TD\.failureName\(a\.category\)\)/.test(rec) && /esc\(TD\.failureName\(t\.topCategory\) \|\| "–"\)/.test(tj) &&
      /failure_category: r\.category,/.test(tj) && TD21.FULL_COLUMNS.some((c) => (Array.isArray(c) ? c[0] : c) === "failure_category") && /"failure_category", "WRONG_OUTPUT"/.test(read("teacher-data.js")),
      "N11: Recent attempts (\"fail (Wrong output)\") and the Most-failed table's most common failure type show the plain name; the exports keep the codes");
    // Prompt 22: the plain names on the Misconceptions page's unmatched attempts and each assignment's "Most common failure".
    const unmatchedSrc = between(tj, '$("ws-unmatched").innerHTML', "$(\"mc-unit\").addEventListener");
    const assignSrc = between(tj, "function renderAssignments(data)", '$("as-new").addEventListener');
    check(/esc\(TD\.failureName\(r\.category\)\) \+ \(r\.failedTest/.test(unmatchedSrc) && /esc\(TD\.failureName\(t\.topCategory\) \|\| "–"\)/.test(assignSrc) &&
      /<th scope="col">Most common failure<\/th>/.test(assignSrc) && !/esc\(r\.category\)|esc\(t\.topCategory|esc\(a\.category\)/.test(tj) &&
      TD21.assignmentStats({ students: { a: { name: "Ann" } }, progress: {}, levelLog: [], buttonLog: [], placementLog: [], attempts: [{ kind: "attempt", studentId: "a", taskId: "var-L9c", unit: "variables", phase: "assignment",
        assignmentId: "A1", result: "fail", category: "WRONG_OUTPUT", misconceptions: [], hints: 0, at: "2026-11-01T10:00:00Z" }] }, { id: "A1", task_ids: ["var-L9c"] }).tasks[0].topCategory === "WRONG_OUTPUT" &&
      TD21.failureName("WRONG_OUTPUT") === "Wrong output",
      "N11 (prompt 22): the Misconceptions page's unmatched attempts and each assignment's \"Most common failure\" column show the plain name (\"Wrong output\"), not the code; no failure code is put on screen as it is");
    // The exports still carry the codes: the full attempt log (run here) and the detail log (teacher.js, run on its own).
    const codeData = { students: { a: { name: "Ann" } }, progress: {}, levelLog: [], buttonLog: [], placementLog: [], units: Curriculum.UNITS,
      attempts: [{ id: "x1", studentId: "a", kind: "attempt", result: "fail", hints: 0, phase: "practice", taskLevel: 6, unit: "maths", units: ["maths"], taskId: "maths-L6a",
        category: "WRONG_OUTPUT", misconceptions: [], at: "2026-11-01T10:00:00Z", code: "print(1)", output: "1" }] };
    const fullCsv = TD21.fullExportCsv(codeData);
    const detailSrc = between(tj, "function detailLogCsv(data)", "// The workshop tables");
    const detailCsv = new Function("TD", detailSrc + "; return detailLogCsv;")(TD21)(codeData);
    check(/,fail,WRONG_OUTPUT,/.test(fullCsv) && !/Wrong output/.test(fullCsv) && /,fail,WRONG_OUTPUT,/.test(detailCsv) && !/Wrong output/.test(detailCsv) &&
      /failure_category/.test(fullCsv.split(/\r?\n/)[0]) && /failure_category/.test(detailCsv.split(/\r?\n/)[0]),
      "N11 (prompt 22): the exports still show the codes (the full attempt log and the detail log say WRONG_OUTPUT in failure_category, never \"Wrong output\")");
    check(/\? "Pass 2 level 10 tasks in a row, with 1 hint or fewer each time and no \\"Show me how\\", to unlock " \+ name \+ "\."/.test(endless) &&
      /: "Reach level 10 in " \+ name \+ ", then pass 2 tasks there in a row with 1 hint or fewer and no \\"Show me how\\"\." \+ \(s && !toDo \? " You're at Level " \+ s\.level \+ "\." : ""\)/.test(endless) &&
      !/strong passes|Complete Level 10/.test(endless) && App21.PASSES_IN_A_ROW_TO_LEVEL_UP === 2 && /&& !outcome\.showHow;/.test(read("app.js")),
      "N13: Endless mode's lock says what unlocks it (\"Pass 2 level 10 tasks in a row, with 1 hint or fewer each time and no \"Show me how\", to unlock X.\", or \"Reach level 10 in X, then pass 2 tasks there in a row with 1 hint or fewer and no \"Show me how\".\"), as the strong-pass rule is; no \"You're at Level\" while the quick check is to do; the rule is unchanged");
    check(/id="change-name">Not you\? Switch student<\/a>/.test(app) && /\$\("change-name"\)\.textContent = "Not you\? Sign out";/.test(home) && !/Change name/.test(app),
      "N14: local mode's header link says \"Not you? Switch student\"; backend mode still says \"Not you? Sign out\"");
    check(!/Every export is free/.test(th) && /Each button shows what is in the file, with a sample row, before you download it\./.test(flat),
      "N15: \"Every export is free.\" is gone from Reports; the rest of the help stays");
    check(/<th scope="col">Share unmatched<\/th>/.test(th) && /<th scope="col">Has buggy programs<\/th>/.test(th) && !/Unmatched rate|Has buggy variants|>Shows</.test(th + read("teacher-data.js")) &&
      /'<th scope="col" class="ov-shows">Row<\/th>'/.test(read("teacher-data.js")) && /"has_buggy_variants", "needs_review"\]/.test(tj) && /RAG/.test(TD21.classScoresCsv({ rows: [] }, [], (u) => u)),
      "N17: on screen the Students table's column is \"Row\" and the unmatched table says \"Share unmatched\" and \"Has buggy programs\"; the export columns (has_buggy_variants, RAG) are unchanged");

    // Theme B: layout and order.
    const classes = pageOf("classes");
    const at = (x) => classes.indexOf(x);
    const importSection = between(classes, 'data-collapse="class-import"', "</section>");
    check(at('id="tb-class-info"') > 0 && at('id="tb-class-info"') < at('data-collapse="class-import"') && at('data-collapse="class-import"') < at('id="tb-delete-section"') &&
      at('id="tb-delete-section"') < at('id="tb-new-class"') && at('id="tb-new-class"') < at('class="retention-note"') &&
      /data-collapse-default="closed">\s*<h3>Import a full export<\/h3>\s*<div id="tb-import"><\/div>/.test(importSection) &&
      !/id="tb-import"/.test(between(classes, 'data-collapse="class-students"', "</section>")) && !/Import full export<\/h3>/.test(tb),
      "L3: the Classes page has the chosen class first, then Import a full export (its own closed section, out of Student logins), Delete this class, Create class and What is kept");
    const reports = pageOf("reports"), boards = pageOf("leaderboards");
    check(/data-collapse="level-log" data-collapse-default="closed">\s*<h3>Level changes<\/h3>/.test(reports) && /id="level-log"/.test(between(reports, 'data-collapse="level-log"', "</section>")) &&
      !/All level changes|<details style/.test(reports) && !/id="compare/.test(reports) &&
      boards.indexOf('data-collapse="compare"') > boards.indexOf('data-collapse="lb-all"') && ["compare-load", "compare"].every((id) => boards.includes('id="' + id + '"')) &&
      /\$\("compare-load"\)\.addEventListener\("click"/.test(tj),
      "L6 and T4: Reports has Exports and its own closed Level changes section; Compare classes is on the Leaderboards page, under All my classes");
    // L8: the phone menu, run on stand-ins.
    check(/<button type="button" id="nav-toggle" class="secondary nav-toggle" aria-expanded="false" aria-controls="side-nav-links">Menu: <span id="nav-current">Students<\/span><\/button>/.test(th) &&
      /<div id="side-nav-links" class="side-nav-links">/.test(th) && /\.nav-toggle \{ display: none; \}/.test(css) &&
      /@media \(max-width: 700px\) \{[^@]*\.nav-toggle \{ display: block;[^}]*\}[^@]*\.side-nav:not\(\.nav-open\) \.side-nav-links \{ display: none; \}/.test(css) &&
      /if \(on\) \$\("nav-current"\)\.textContent = a\.textContent;/.test(tj),
      "L8: under 700px the teacher menu is one closed \"Menu: <page name>\" button (the page on show beside \"Menu\"); wider screens always show the list");
    const navSrc = between(tj, "function setNavOpen(open)", "// ---------- Page switching");
    const el21 = () => { const e = { attrs: {}, classes: new Set(), on: {}, focused: false,
      classList: { toggle: (c, v) => (v ? e.classes.add(c) : e.classes.delete(c)) }, setAttribute: (k, v) => { e.attrs[k] = v; }, getAttribute: (k) => (k in e.attrs ? e.attrs[k] : null),
      addEventListener: (t, f) => { e.on[t] = f; }, focus: () => { e.focused = true; } }; return e; };
    const navEls = { "side-nav": el21(), "nav-toggle": el21(), "side-nav-links": el21() };
    navEls["nav-toggle"].attrs["aria-expanded"] = "false";
    new Function("$", navSrc)((id) => navEls[id]);
    const isOpen = () => navEls["side-nav"].classes.has("nav-open") && navEls["nav-toggle"].attrs["aria-expanded"] === "true";
    navEls["nav-toggle"].on.click();
    const opened = isOpen();
    navEls["side-nav-links"].on.click({ target: { closest: () => ({}) } });
    const closedByLink = !isOpen() && navEls["nav-toggle"].attrs["aria-expanded"] === "false";
    navEls["nav-toggle"].on.click();
    navEls["side-nav"].on.keydown({ key: "Escape" });
    check(opened && closedByLink && !isOpen() && navEls["nav-toggle"].focused,
      "L8: the menu button opens the list and says so (aria-expanded); choosing a page closes it, and Esc closes it and puts focus back on the button");
    // boardHtml with its TOTALS list (prompt 23: the Most points board shows the four totals before the combined points).
    const boardSrc = between(tj, "const TOTALS = ", "function boardsHtml(");
    const boardHtml21 = new Function("esc", "signed", "boardMax", "thousands", boardSrc + "; return boardHtml;")(String, (n) => (n > 0 ? "+" : "") + n, 600, (n) => Number(n).toLocaleString("en-GB"));
    const heads = (h) => [...h.matchAll(/<th scope="col"[^>]*>([^<]+)<\/th>/g)].map((m) => m[1]).join();
    const row21 = { rank: 1, nickname: "Ann", class_name: "7A", points: 300, percent: 50, secured: 100, level: 60, programme: 90, bonus: 50 };
    const allB = boardHtml21("Most points", "", [row21], false, true);
    const oneB = boardHtml21("Most points", "", [row21], false, false);
    const gainB = boardHtml21("Most improved", "", [Object.assign({}, row21, { points: 20, percent: 1 })], true, true);
    check(heads(allB) === "Place,Nickname,Class,Secured,Level,Programme,Re-secure bonus,Combined,%" && heads(oneB) === "Place,Nickname,Secured,Level,Programme,Re-secure bonus,Combined,%" &&
      heads(gainB) === "Place,Nickname,Class,Points,%" && /<td>7A<\/td><td class="num">100<\/td><td class="num">60<\/td><td class="num">90<\/td><td class="num">50<\/td><td class="num">300<\/td><td class="num">50%<\/td>/.test(allB) &&
      /<div class="table-wrap"><table class="board-table"/.test(allB) && /<td class="num">–<\/td>/.test(boardHtml21("Most points", "", [{ rank: 1, nickname: "Old", points: 10, percent: 1 }], false, false)) &&
      /localBoards\(collect\(\), \{ class_name: "This browser" \}, true\)/.test(tj) && /Ranked by percentage of " \+ thousands\(boardMax\)/.test(tj),
      "L9: the All my classes boards show the points, then %, as This class does (since prompt 23 the Most points board shows secured, level, programme and re-secure bonus points before the combined points; a server not yet updated shows –); they are still ranked by %");

    // Prompt 24: a combined total above the 300-a-unit maximum (12,000 for 40 units) shows the number only; the %
    // column is still the combined total out of the maximum (Secured.normalised), so it goes past 100%.
    const S24 = require(path.join(ROOT, "secured.js"));
    const big = Object.assign({}, row21, { points: 12400, percent: S24.normalised(12400, 40) });
    const bigBoard = new Function("esc", "signed", "boardMax", "thousands", boardSrc + "; return boardHtml;")(String, (n) => (n > 0 ? "+" : "") + n, 12000, (n) => Number(n).toLocaleString("en-GB"))("Most points", "", [big], false, false);
    const lbSrc24 = read("leaderboard.js");
    const lbTotal = new Function(lbSrc24.slice(lbSrc24.indexOf("  const thousands = "), lbSrc24.indexOf("  // One board as a table")) + "; return total;")();
    check(/<td class="num">12,400<\/td><td class="num">103\.3%<\/td>/.test(bigBoard) && !/ of /.test(bigBoard) && big.percent === 103.3 && lbTotal(12400) === "12,400" &&
      /'<p class="small">Combined total: ' \+ thousands\(pts\.combined\) \+ " \(secured "/.test(tj) && /units \(out of " \+ MAX_POINTS \+ "\)/.test(tj) && /Ranked by percentage of " \+ thousands\(boardMax\) \+ " points\. "/.test(tj),
      "Prompt 24: a combined total above 12,000 shows the number only (\"12,400\", not \"12,400 of 12,000\") on the teacher's boards, the teacher's student page and the student's leaderboard; the % column is unchanged (103.3%); the notes keep the maximum");

    // Theme C: help text.
    check(/data-collapse="mc-review" data-collapse-default="closed"/.test(th) && /"No newer rules have been added yet\."/.test(tj),
      "S5: Needs review starts closed, like the other Misconceptions sections; opened, it still says \"No newer rules have been added yet.\"");
    check(/: sharedLabel\(current\) \+ "\.";/.test(tb) && !/You can do everything with it except delete it or change its teachers/.test(tb) &&
      /<label>Add a teacher <input type="email" id="tb-add-teacher-email"/.test(th) && /id="tb-add-teacher-save">Add<\/button>/.test(th),
      "S8: a shared class's note is just \"Shared with you by Ms Owen.\"; the add-a-teacher form's button says \"Add\" (its label stays \"Add a teacher\")");
    const how = (id) => between(th, '<details class="how-it-works" id="' + id + '">', "</details>").replace(/\s+/g, " ");
    const shortOf = (page, id) => pageOf(page).replace(/\s+/g, " ").split('<details class="how-it-works" id="' + id + '">')[0];
    const RULE21 = "A paste is flagged when the editor is empty and the paste is 3 lines or more, or when a single paste is more than 8 lines.";
    check(["lb-how", "cert-how", "hw-how", "export-how"].every((id) => /^<details class="how-it-works" id="[\w-]+"> <summary>How it works<\/summary>/.test(how(id))) &&
      (th.match(/<details class="how-it-works"/g) || []).length === 4 && !/<details class="how-it-works"[^>]* open/.test(th) &&
      /<p class="small">Each unit gives up to 300 points: up to 200 for its secured score and up to 100 for its level\. Most improved is the points gained in the last 14 days\.<\/p>/.test(shortOf("leaderboards", "lb-how")) &&
      /Secured points: up to 200, 2 for each percent/.test(how("lb-how")) && /Students with the same points share a place\. Students see their own class's boards, with nicknames only\./.test(how("lb-how")) &&
      /<p class="small">A student earns a certificate for a block of units when every unit in the block has its floor at 100%\. Select Print to print one\.<\/p>/.test(shortOf("certificates", "cert-how")) &&
      /A unit's floor is the lowest its secured score can drop to\./.test(how("cert-how")) && /ready to print on one A4 landscape sheet\./.test(how("cert-how")) &&
      /<p class="small">Set a number of tasks for the class to do by a due date\. A task counts the first time a student passes it\.<\/p>/.test(shortOf("homework", "hw-how")) &&
      how("hw-how").includes(RULE21) && /The report lists these flags as "Paste flagged"\./.test(how("hw-how")) && !shortOf("homework", "hw-how").includes(RULE21) &&
      /<p class="small">Each button shows what is in the file, with a sample row, before you download it\.<\/p>/.test(shortOf("reports", "export-how")) &&
      /<strong>Workshop tables<\/strong>: the misconception table and the per-task unmatched table from the Misconceptions page\./.test(how("export-how")) &&
      /\.how-it-works summary \{/.test(css),
      "S11: Leaderboards, Certificates, Homework and Reports each have a short help line and a closed \"How it works\" with the rest, word for word (the paste rule too)");
    check(!/The misconceptions workshop \(most-failed tasks/.test(flat) && !/Its tables are in the Workshop tables export above/.test(flat),
      "S12: the Reports line pointing to the Misconceptions page is gone");

    // Theme D: empty states.
    const empty = { students: { a: { name: "Ann" } }, progress: {}, attempts: [], levelLog: [], buttonLog: [], placementLog: [], units: Curriculum.UNITS };
    check(TD21.workshop(empty, [], {}, {}).tasks.length === 0 && /\$\("ws-unseen"\)\.innerHTML = !w\.tasks\.length \? '<p class="small">No failed attempts yet\.<\/p>' : unseen\.length \?/.test(tj),
      "S6: Not matched yet says \"No failed attempts yet.\" for a class with no failed attempts, instead of listing every misconception");
    const navLinks = [...th.matchAll(/<a href="#(\w+)" data-page="\w+"( data-backend)?>/g)].map((m) => m[1] + (m[2] ? "*" : ""));
    check(navLinks.join() === "students,homework*,assignments*,misconceptions,leaderboards,certificates,reports,tasks,classes*,curriculum,settings*" &&
      /document\.querySelectorAll\("\[data-backend\]"\)\.forEach\(\(b\) => \{ b\.hidden = !tb; \}\);/.test(tj) && ["cl-local", "as-local", "set-local", "hw-local"].every((id) => th.includes('id="' + id + '"')),
      "S10: local mode's menu hides Homework, Assignments, Classes and Settings (data-backend); their pages still say why they need backend mode");
    const certHtml = read("certificate.html"), certJs = read("certificate.js");
    check(/<p class="cert-missing" id="cert-missing" hidden>This certificate couldn't be shown\. Open it again from the teacher view's Print button\.<\/p>/.test(certHtml) &&
      /if \(!name \|\| !block \|\| !date\) \{ \$\("cert-missing"\)\.hidden = false; return; \}/.test(certJs),
      "B8: certificate.html opened with nothing in its address shows one line (\"This certificate couldn't be shown. Open it again from the teacher view's Print button.\"), not a blank page");

    // Theme E: student side.
    const sel = tasks.filter((t) => t.unit === "selection");
    const practice = sel.filter((t) => !App21.isPlacementTask(t)).length;
    check(/const count = tasks\.filter\(\(t\) => t\.unit === u\.id && !isPlacementTask\(t\)\)\.length;/.test(home) &&
      /const mine = tasks\.filter\(\(t\) => t\.unit === u\.id && !isPlacementTask\(t\)\);/.test(read("progress.js")) && practice < sel.length && practice > 0,
      "B5: the home page's unit cards count practice tasks only (Selection: " + practice + ", not " + sel.length + "), as My progress does");
    check(/@media \(max-width: 600px\) \{\s*\.tour-card \{ max-height: 33vh; \}\s*body\.tour-open \{ padding-bottom: 38vh; \}\s*\}/.test(css) &&
      /\.tour-card \{[^}]*overflow: auto;/.test(css),
      "B10: at phone width the tour card is at most a third of the screen tall, and its text scrolls inside it (the steps don't change)");

    // Theme F: exports.
    const noteSrc = (tj.match(/note: (\(\) => \{[^\n]*\}),\r?\n/) || [])[1];
    const noteFor = (v) => new Function("$", "return (" + noteSrc + ")();")(() => ({ value: v }));
    check(noteSrc && noteFor("ada") === "Only students whose name matches \"ada\" are in this file, because of the name filter on the Students page." && noteFor("") === "" && noteFor("   ") === "" &&
      /const note = e\.note \? e\.note\(\) : "";\s*\$\("export-dialog-text"\)\.textContent = e\.text \+ \(note \? " " \+ note : ""\);/.test(tj) &&
      /TD\.filterByName\(TD\.overviewRows\(data\), \$\("name-filter"\)\.value\)/.test(tj) && /"python-practice-overview-" \+ today\(\) \+ "\.csv"/.test(tj),
      "B7: with a name in the Students page's filter, the Levels table popup says only matching students are in the file; with none it says nothing extra; the file is unchanged");

    // The decisions.
    check(/<h3 id="cert-all-h" data-backend>All your classes<\/h3>\s*<div id="cert-list"><\/div>/.test(th) && /const certHeading = \(title\) => \(tb \? "<h4>"/.test(tj),
      "L10 (decision): the Certificates page has the heading \"All your classes\" above the class lists (each class under it as h4; local mode's one list keeps its own heading)");
    check(/id="st-averages"/.test(between(th, '<details class="rag-more">', "</details>")) && (th.match(/id="st-averages"/g) || []).length === 1,
      "S4 (decision): the class averages line is inside \"More about the colours\" on the Students page, with its wording unchanged");
  }

  // ===================== Prompt 23 (2026-11): teacher tour, stars and the re-secure bonus, endless programme points =====================
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const S23 = require(path.join(ROOT, "secured.js"));
    const TD23 = require(path.join(ROOT, "teacher-data.js"));
    const th = read("teacher.html"), tj = read("teacher.js"), ttSrc = read("teacher-tour.js"), tourSrc23 = read("tour.js");
    const fresh = (src, extra) => { const m = { exports: {} }; require("vm").runInNewContext(src, Object.assign({ module: m, URLSearchParams, console }, extra)); return m.exports; };
    const sentences = (t) => (t.match(/[.!?](\s|$)/g) || []).length;
    // A tiny page (as the tutorial tests'): elements, clicks, focus and the document's keydown listeners.
    const fakeDoc = (byId) => {
      const listeners = {};
      const doc = { activeElement: null, byId: byId || {},
        createElement: (tag) => mkEl(tag), querySelectorAll: () => [], querySelector: () => null, getElementById(id) { return this.byId[id] || null; },
        addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); }, removeEventListener(t, f) { listeners[t] = (listeners[t] || []).filter((x) => x !== f); },
        key(k) { (listeners.keydown || []).slice().forEach((f) => f({ key: k, target: doc.activeElement, preventDefault() {} })); }, listeners };
      function mkEl(tag) {
        const classes = new Set();
        const el = { tagName: tag, children: [], parent: null, attrs: {}, hidden: false, disabled: false, textContent: "", className: "", id: "", dataset: {}, handlers: {},
          classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
          setAttribute(n, v) { this.attrs[n] = v; }, appendChild(c) { c.parent = this; this.children.push(c); return c; },
          remove() { if (this.parent) { this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; } },
          addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); },
          click() { if (!this.disabled) (this.handlers.click || []).forEach((f) => f({ target: this, preventDefault() {} })); },
          focus() { doc.activeElement = this; }, contains(x) { for (let n = x; n; n = n.parent) if (n === this) return true; return false; } };
        return el;
      }
      doc.body = mkEl("body");
      return doc;
    };
    const cardOf = (doc) => doc.body.children.find((c) => c.className === "tour-card");
    const skipOf = (card) => card.children.find((c) => c.className === "tour-buttons").children[2];
    const memStore = () => { const m = {}; return { m, getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; };
    const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };

    // ---------- Feature 1: the teacher tour ----------
    const TT = fresh(ttSrc), Tour23 = fresh(tourSrc23);
    const pages = ["students", "homework", "assignments", "misconceptions", "leaderboards", "certificates", "reports", "tasks", "classes", "curriculum", "settings"]; // Curriculum since prompt 28
    const onServer = ["homework", "assignments", "classes", "settings"];
    const back = TT.stepsFor(true), local = TT.stepsFor(false);
    check(TT.STEPS.map((s) => s.id).join() === "overview," + pages.join() && back.concat(local).every((s) => sentences(s.text) === 2 && s.text.length <= 140 && s.title && s.targets.length) &&
      pages.every((p) => TT.STEPS.find((s) => s.id === p).targets[0] === '.side-nav a[data-page="' + p + '"]' && th.includes('data-page="' + p + '"')) &&
      local.filter((s) => onServer.includes(s.id)).every((s) => /server/.test(s.text)) && back.every((s) => !/server/.test(s.text)) &&
      local.filter((s) => !onServer.includes(s.id)).every((s) => s.text === back.find((b) => b.id === s.id).text),
      "Teacher tour: an overview step, then one step for each page in the menu's order (Students … Settings), each two short sentences pointing at that page's menu link; in local mode the Homework, Assignments, Classes and Settings steps say those pages need the server");
    const store1 = memStore();
    const d1 = fakeDoc();
    const first = TT.start({ Tour: Tour23, doc: d1, storage: store1, backend: true, auto: true });
    const openedFirst = !!first && !!cardOf(d1) && !TT.seen(store1);
    skipOf(cardOf(d1)).click();
    const closedSeen = !cardOf(d1) && store1.m[TT.KEY] === "seen";
    const again = TT.start({ Tour: Tour23, doc: fakeDoc(), storage: store1, backend: true, auto: true });
    const d2 = fakeDoc();
    const replayed = TT.start({ Tour: Tour23, doc: d2, storage: store1, backend: true, auto: false });
    const replayOpen = !!replayed && !!cardOf(d2) && replayed.index() === 0;
    d2.key("Escape");
    const store2 = memStore();
    const d3 = fakeDoc();
    const t3 = TT.start({ Tour: Tour23, doc: d3, storage: store2, backend: false, auto: true });
    for (let k = 0; k < TT.STEPS.length; k++) t3.next(); // to the end: Finish
    check(openedFirst && closedSeen && again === null && replayOpen && !cardOf(d2) && store2.m[TT.KEY] === "seen" && !cardOf(d3) &&
      TT.start({ Tour: Tour23, doc: fakeDoc(), storage: blocked, backend: true, auto: true }) === null && !TT.seen(blocked) && TT.remember(blocked) === false &&
      !!TT.start({ Tour: Tour23, doc: fakeDoc(), storage: blocked, backend: true, auto: false }),
      "Teacher tour: it opens by itself the first time only; closing it (Skip, Escape) or finishing it marks it seen on this browser, so it never opens by itself again; Replay opens it from step 1 at any time; with storage blocked it never opens by itself (every storage error caught), and Replay still works");
    // The wiring: once per page load, and only when the teacher view is on show (backend mode: after signing in).
    const TTw = fresh(ttSrc);
    const main = { hidden: true };
    const store3 = memStore();
    const page = { Tour: fresh(tourSrc23), localStorage: store3, document: fakeDoc({ "teacher-main": main }) };
    const beforeSignIn = TTw.maybeStart(page, true);
    main.hidden = false;
    const afterSignIn = TTw.maybeStart(page, true);
    const secondDraw = TTw.maybeStart(page, true);
    check(beforeSignIn === null && !!afterSignIn && secondDraw === null && /if \(self\.TeacherTour\) self\.TeacherTour\.maybeStart\(window, !!tb\);/.test(tj) &&
      /<button type="button" id="tour-replay" class="secondary">Replay tour<\/button>/.test(th) && th.indexOf('id="tour-replay"') > th.indexOf('id="page-settings"') &&
      /\$\("tour-replay"\)\.addEventListener\("click", \(\) => \{ if \(self\.TeacherTour\) self\.TeacherTour\.replay\(window, !!tb\); \}\);/.test(tj) &&
      /const KEY = "pythonPractice\.teacherTour";/.test(ttSrc) && !/localStorage\.(get|set)Item/.test(ttSrc.replace(/storage\.(get|set|remove)Item/g, "")),
      "Teacher tour: teacher.js starts it when a page is drawn with the teacher view on show (not before signing in), once per page load; Settings has a Replay tour button wired to it");

    // ---------- Feature 2: stars and the re-secure bonus ----------
    const DAY = 86400000, T0 = Date.parse("2026-09-01T09:00:00Z");
    const pass = (d, extra) => Object.assign({ kind: "attempt", result: "pass", hints: 0, phase: "practice", taskLevel: 10, unit: "maths", at: new Date(T0 + d * DAY).toISOString() }, extra);
    // Secured (two passes), then k returns to 100%, each 8 days after the last (the unit had dropped to 90%).
    const history = (k) => [pass(0), pass(0.1)].concat(Array.from({ length: k }, (_, i) => pass(8 * (i + 1))));
    const after = (k) => T0 + (8 * k + 1) * DAY;
    const starsFor = (k) => S23.stars(S23.score(history(k), "maths", after(k)));
    const keptFresh = S23.stars(S23.score([pass(0), pass(0.1), pass(3), pass(6)], "maths", T0 + 7 * DAY)); // passes while still at 100%: no drop, no star
    const html3 = S23.starsHtml(3), html0 = S23.starsHtml(0), html9 = S23.starsHtml(9);
    check([0, 1, 2, 3, 4, 5, 6, 7].map(starsFor).join() === "0,1,2,3,4,5,5,5" && keptFresh === 0 && S23.stars(S23.score([pass(0)], "maths", T0 + DAY)) === 0 && S23.stars(null) === 0 &&
      S23.score(history(5), "maths", after(5)).floor === 100 && S23.score(history(4), "maths", after(4)).floor === 90,
      "Stars: one each time a unit comes back to 100% after it has dropped (0 to 5, capped at 5); a unit that has never dropped, or isn't secured, has 0; five stars is when the floor reaches 100%");
    check((html3.match(/class="star star-on"/g) || []).length === 3 && (html3.match(/<svg class="star/g) || []).length === 5 && /role="img" aria-label="3 of 5 stars"/.test(html3) &&
      (html0.match(/star-on/g) || []).length === 0 && /aria-label="0 of 5 stars"/.test(html0) && (html9.match(/star-on/g) || []).length === 5 && /aria-label="5 of 5 stars"/.test(html9) &&
      /aria-hidden="true" focusable="false"/.test(html3) && /\.unit-stars \.star\.star-on \{ fill: var\(--rag-gold\); stroke: var\(--text\); \}/.test(read("styles.css")),
      "Stars: a unit card shows five star outlines, the first n filled (0 to 5), read out to a screen reader as \"3 of 5 stars\"");
    check(/self\.Secured\.starsHtml\(self\.Secured\.stars\(sec\)\)/.test(read("home.js")) && /self\.Secured\.starsHtml\(x\.stars\)/.test(read("progress.js")) &&
      /self\.Secured\.starsText\(x\.stars\)/.test(read("progress.js")) && /self\.Secured\.starsHtml\(pts\.units\[u\]\.stars\)/.test(tj),
      "Stars: the same star row is on the home page's unit cards, My progress (and in its cards' spoken label) and the teacher's student page");
    const placed10 = { level: 10, placement: { status: "done", startLevel: 7 } };
    const units23 = [{ id: "maths", placement: true }, { id: "selection", placement: true }];
    const pointsFor = (attempts) => S23.studentPoints({ units: units23, current: { maths: placed10 }, attempts, history: {}, now: after(7) });
    const noReturns = pointsFor(history(0)), three = pointsFor(history(3)), seven = pointsFor(history(7));
    check(noReturns.bonus === 0 && three.bonus === 30 && three.units.maths.bonus === 30 && three.units.maths.stars === 3 && seven.bonus === 50 && seven.units.maths.stars === 5 &&
      [noReturns, three, seven].every((p) => p.level === 100 && p.units.maths.total <= S23.UNIT_POINTS_MAX && p.total === p.secured + p.level) &&
      three.secured === S23.securedPoints(S23.score(history(3), "maths", after(7))) && seven.secured === S23.securedPoints(S23.score(history(7), "maths", after(7))) &&
      S23.RESECURE_POINTS === 10 && S23.RESECURE_BONUS_MAX === 50,
      "Re-secure bonus: 10 points each re-secure, at most 50 a unit; the secured and level points (and the 300 a unit) don't change");
    const certificatesSrc = read("certificates.js");
    check(!/stars|resecure|bonus/i.test(certificatesSrc), "Stars and the re-secure bonus don't change certificates (certificates.js doesn't use them)");

    // ---------- Feature 3: endless programme points ----------
    let seq = 0;
    const prog = (hints, extra) => Object.assign({ kind: "attempt", result: "pass", hints, phase: "endless", taskLevel: 10, taskType: "write", unit: "maths",
      taskId: "maths-L10" + "abcdefgh"[seq], at: new Date(T0 + 30 * DAY + seq++ * 60000).toISOString() }, extra);
    const sixPasses = [0, 1, 2, 3, 4, 7].map((h) => prog(h));
    const p6 = S23.programmes(sixPasses, T0 + 40 * DAY);
    check(p6.list.map((p) => p.points).join() === "50,40,30,20,10,10" && p6.count === 6 && p6.points === 160 &&
      [0, 1, 2, 3, 4, 9].map(S23.programmePointsFor).join() === "50,40,30,20,10,10",
      "Programme points: 50, 40, 30, 20 and 10 for 0, 1, 2, 3 and 4 or more hints (never under 10)");
    seq = 0;
    const firstWith3 = prog(3, { taskId: "maths-L10a" });
    const repeat0 = prog(0, { taskId: "maths-L10a" });   // the same programme again, later, with no hints
    const showHow = prog(1, { taskId: "maths-L10b", hintType: "show-me-how" });
    const variantA = prog(0, { taskId: "d-maths-L10a#1", fingerprint: "fp-1" }), variantSame = prog(0, { taskId: "d-maths-L10a#1", fingerprint: "fp-1" }), variantB = prog(0, { taskId: "d-maths-L10a#2", fingerprint: "fp-2" });
    const scratch = prog(0, { taskId: "scratch-out-bar", taskType: "scratch" });
    const notCounted = [prog(0, { taskId: "x1", phase: "practice" }), prog(0, { taskId: "x2", taskLevel: 9 }), prog(0, { taskId: "x3", taskType: "trace" }), prog(0, { taskId: "x4", taskType: "parsons" }),
      prog(0, { taskId: "x5", result: "fail" }), prog(0, { taskId: "x6", kind: "hint" }), prog(0, { taskId: "x7", phase: "assignment" })];
    const mixed = S23.programmes([repeat0, firstWith3, showHow, variantA, variantSame, variantB, scratch].concat(notCounted), T0 + 40 * DAY);
    check(mixed.count === 5 && mixed.list.find((p) => p.key === "maths-L10a").points === 20 && mixed.list.find((p) => p.key === "maths-L10b").points === 30 &&
      mixed.list.filter((p) => p.key.startsWith("fp-")).length === 2 && mixed.points === 20 + 30 + 50 + 50 + 50 &&
      S23.programmes([firstWith3, repeat0], T0 + 40 * DAY).points === S23.programmes([firstWith3], T0 + 40 * DAY).points,
      "Programme points: only the first pass of each programme counts (a repeat gives no points, even with fewer hints; the same made-up variant twice is one programme); \"Show me how\" counts as a hint; only level 10 write and write-from-scratch passes in endless mode count");
    const base = pointsFor(history(3)), withProg = pointsFor(history(3).concat(sixPasses));
    check(withProg.programme === 160 && withProg.programmes === 6 && withProg.secured === base.secured && withProg.level === base.level && withProg.total === base.total &&
      withProg.gain === base.gain && withProg.units.maths.total <= S23.UNIT_POINTS_MAX && S23.maxPoints(units23.length) === 300 * units23.length &&
      withProg.combined > S23.maxPoints(1),
      "Programme points are a separate total: they don't change the secured or level points, the 300 a unit or the most possible (maxPoints), nor the 14-day gain, and the combined total can go past the most possible");
    check([noReturns, three, seven, base, withProg].every((p) => p.combined === p.secured + p.level + p.programme + p.bonus) && withProg.combined === withProg.secured + withProg.level + 160 + 30,
      "Combined total = secured + level + programme points + re-secure bonus");
    // The teacher view's local boards and the student's pages use the same totals.
    const data23 = { students: { a: { name: "Ann" } }, progress: { a: { units: { maths: placed10 } } }, attempts: history(3).concat(sixPasses).map((x) => Object.assign({ studentId: "a" }, x)),
      levelLog: [], buttonLog: [], placementLog: [], units: Curriculum.UNITS };
    const lbRow = TD23.leaderboardStudents(data23, units23, after(7))[0];
    check(lbRow.total === withProg.combined && lbRow.secured === withProg.secured && lbRow.level === withProg.level && lbRow.programme === 160 && lbRow.bonus === 30 && lbRow.gain === withProg.gain &&
      /\$\("programmes-count"\)\.textContent = self\.Secured\.programmesText\(self\.Secured\.programmes\(attempts\)\.count\)/.test(read("progress.js")) && /id="programmes-count"/.test(read("progress.html")) &&
      /self\.Secured\.programmesText\(pts\.programmes\)/.test(tj) && S23.programmesText(12) === "12 programmes completed" && S23.programmesText(1) === "1 programme completed",
      "Programmes: the teacher's local boards carry the four totals and rank by the combined one; My progress and the teacher's student page say \"12 programmes completed\"");
    const lbHtml = read("leaderboard.html"), lbJs = read("leaderboard.js");
    const order = ["me-secured", "me-level", "me-programme", "me-bonus", "me-total"].map((id) => lbHtml.indexOf('id="' + id + '"'));
    check(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])) && /\$\("me-total"\)\.textContent = total\(me\.total\);/.test(lbJs) && /\$\("me-programme"\)\.textContent = thousands\(me\.programme \|\| 0\);/.test(lbJs) &&
      /Your points are all four added together\./.test(lbHtml) && /"Show me how" counts as a hint/.test(lbHtml) && /up to 50 points/.test(lbHtml) &&
      /Programme points: each level 10 writing task/.test(th) && /Most improved still counts only secured and level points\./.test(th),
      "Leaderboards: the student's page shows secured, level, programme and re-secure bonus points, then the combined total (the number only, \"12,400\", since prompt 24); its notes and the teacher's Leaderboards notes give the two new totals");
  }

  // ===================== Prompt 25 (2026-11): two rows of summary tiles; the student page's Progress summary =====================
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const TD25 = require(path.join(ROOT, "teacher-data.js"));
    const HW = require(path.join(ROOT, "homework.js"));
    const tj = read("teacher.js"), th = read("teacher.html");
    const between = (src, from, to) => { const i = src.indexOf(from); return i < 0 ? "" : src.slice(i, src.indexOf(to, i + from.length)); };
    const escF = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    // ---------- Part A: the tiles ----------
    // A mixed class: secured at 100% (Di), levels 2, 5 and 8 with nothing secured (Ann, Bo, Eve), and nothing started (Cy).
    const NOW = Date.parse("2026-11-18T12:00:00Z");
    const placedAt = (level) => ({ level, placement: { status: "done", startLevel: level } });
    const pass10 = (sid, d) => ({ studentId: sid, kind: "attempt", result: "pass", hints: 0, phase: "practice", taskLevel: 10, unit: "maths", units: ["maths"], taskId: "maths-L10a", at: new Date(NOW - d * 86400000).toISOString() });
    const mixed = { students: { a: { name: "Ann" }, b: { name: "Bo" }, c: { name: "Cy" }, d: { name: "Di" }, e: { name: "Eve" } },
      progress: { a: { units: { maths: placedAt(2) } }, b: { units: { maths: placedAt(5) } }, c: { units: {} }, d: { units: { maths: placedAt(10) } }, e: { units: { maths: placedAt(8) } } },
      attempts: [pass10("d", 2), pass10("d", 1)], levelLog: [], buttonLog: [], placementLog: [], units: Curriculum.UNITS };
    const sum25 = TD25.scoreTable(mixed, ["maths"], NOW, ["maths"]).summary;
    // The real drawing code from teacher.js, with a stand-in page.
    const drawSrc = between(tj, '    $("st-summary").innerHTML = TD.SUMMARY_ROWS.map(', '    const started = table.unitAverages');
    const page25 = { "st-summary": { innerHTML: "" } };
    new Function("$", "TD", "esc", "s", drawSrc)((id) => page25[id], TD25, escF, sum25);
    const html25 = page25["st-summary"].innerHTML;
    const rowsHtml = html25.split('<div class="rag-row"').slice(1);
    const tilesIn = (h) => [...h.matchAll(/<div class="rag-tile rag-tile-([\w-]+)" title="[^"]*"><span class="rag rag-[\w-]+">([^<]+)<\/span><strong>(\d+)<\/strong><span class="small">([^<]+)<\/span><\/div>/g)].map((m) => ({ cls: m[1], label: m[2], count: +m[3], note: m[4] }));
    const rowTiles = rowsHtml.map(tilesIn);
    const labels = ["Secured (100%)", "Fresh (90%)", "Fading (80%)", "Revisit soon (under 80%)", "Levels 1 to 3: still learning", "Levels 4 to 6: still learning",
      "Levels 7 to 9: still learning", "Level 10: not secured yet", "Placement to do"];
    check(rowsHtml.length === 2 && /<p class="rag-row-label" id="st-row-freshness">Freshness<\/p><div class="rag-tiles rag-tiles-4">/.test(html25) &&
      /<p class="rag-row-label" id="st-row-level">Level<\/p><div class="rag-tiles rag-tiles-5">/.test(html25) && /role="group" aria-labelledby="st-row-freshness"/.test(html25) &&
      rowTiles[0].map((t) => t.cls).join() === "gold,fresh,fading,soon" && rowTiles[1].map((t) => t.cls).join() === "lv-red,lv-amber,lv-green,lv-top,none" &&
      rowTiles.flat().map((t) => t.label).join("|") === labels.join("|") && rowTiles.flat().every((t) => t.note === TD25.SUMMARY_TILES.find((x) => x.cls === t.cls).note) &&
      /<div id="st-summary" class="rag-summary" aria-live="polite"><\/div>/.test(th),
      "Summary tiles (prompt 25): two labelled rows, \"Freshness\" with four tiles (Secured, Fresh, Fading, Revisit soon) and \"Level\" with five (Levels 1 to 3, 4 to 6, 7 to 9, Level 10, Placement to do), each tile with its wording and note as before");
    const counts = Object.fromEntries(rowTiles.flat().map((t) => [t.cls, t.count]));
    check(counts.gold === 1 && counts["lv-red"] === 1 && counts["lv-amber"] === 1 && counts["lv-green"] === 1 && counts.none === 1 &&
      counts.fresh === 0 && counts.fading === 0 && counts.soon === 0 && counts["lv-top"] === 0 && Object.values(counts).reduce((x, y) => x + y, 0) === 5 &&
      Object.entries(sum25.tiles).every(([k, v]) => counts[k] === v),
      "Summary tiles (prompt 25): for a mixed class each tile still shows its count (one secured at 100%, one each at levels 1 to 3, 4 to 6 and 7 to 9, one with Placement to do), five students in all");

    // ---------- Part B: the Progress summary ----------
    // Now: Wednesday 18 November 2026, so this week is Monday 16 to Sunday 22 November (UK time).
    const at = (iso) => iso;
    const A = (taskId, iso, result) => ({ kind: "attempt", taskId, unit: "maths", units: ["maths"], result: result || "pass", at: at(iso) });
    const known = [
      A("t-first-try", "2026-10-26T09:00:00Z", "fail"),   // Monday 26 October: the first attempt (week 1)
      A("t-a", "2026-10-27T10:00:00Z"), A("t-e", "2026-10-28T10:00:00Z"), // week 1: two first passes
      A("t-b", "2026-11-05T10:00:00Z"),                   // week 2 (2 to 8 November): one
      // week 3 (9 to 15 November): none, which counts as 0
      A("t-b", "2026-11-16T08:00:00Z"),                   // a repeat pass of t-b this week: not counted
      A("t-c", "2026-11-16T09:00:00Z"), A("t-d", "2026-11-17T15:30:00Z"), // week 4 (this week): two first passes
      A("t-x", "2026-11-17T16:00:00Z", "fail"),           // the last attempt: 4:00 pm, 17 November
      { kind: "skip", taskId: "t-y", unit: "maths", result: "skipped", at: "2026-11-18T09:00:00Z" }, // a skip isn't an attempt
    ];
    const x = HW.progressSummary({ attempts: known, flags: [], homework: [], now: NOW });
    check(x.firstPassesThisWeek === 2 && x.averageFirstPassesPerWeek === 1.3 && x.lastActive === "2026-11-17T16:00:00.000Z" && x.averageHomeworkCompletion === null,
      "Progress summary: for a known set of passes, 2 first passes this week (Monday to Sunday, UK time), an average of 1.3 a week (5 first passes over 4 weeks, from the week of the first attempt to this one), and the last attempt's time");
    const noRepeat = HW.progressSummary({ attempts: known.filter((a) => !(a.taskId === "t-b" && a.at.startsWith("2026-11-16"))), flags: [], homework: [], now: NOW });
    check(noRepeat.firstPassesThisWeek === x.firstPassesThisWeek && noRepeat.averageFirstPassesPerWeek === x.averageFirstPassesPerWeek &&
      Object.keys(HW.firstPasses(known)).length === 5 && HW.firstPasses(known)["t-b"].a.at === "2026-11-05T10:00:00Z",
      "Progress summary: a repeat pass doesn't count (only each task's first pass ever, the homework rule's homework.js firstPasses)");
    const gapWeeks = HW.progressSummary({ attempts: [A("t-a", "2026-10-27T10:00:00Z"), A("t-b", "2026-10-28T10:00:00Z")], homework: [], now: NOW });
    check(gapWeeks.averageFirstPassesPerWeek === 0.5 && gapWeeks.firstPassesThisWeek === 0 &&
      HW.ukWeek(Date.parse("2026-11-15T23:30:00Z")) === HW.ukWeek(Date.parse("2026-11-09T00:00:00Z")) && HW.ukWeek(Date.parse("2026-11-16T00:10:00Z")) === HW.ukWeek(NOW) &&
      HW.ukWeek(Date.parse("2026-06-14T23:30:00Z")) === HW.ukWeek(Date.parse("2026-06-15T12:00:00Z")),
      "Progress summary: weeks with no first passes count as zero in the average (2 first passes in the first of 4 weeks is 0.5); weeks run Monday to Sunday in UK time (00:30 on a summer Monday, 23:30 UTC on Sunday, is in Monday's week)");
    // Homework: 1 of 3 done (33%) and 2 of 2 done (100%) average 67%; the count is homework.js progress()'s, as on the card.
    const hw1 = { created_at: "2026-11-02T08:00:00Z", due_on: "2026-11-08", units: [], task_count: 3 };
    const hw2 = { created_at: "2026-11-15T08:00:00Z", due_on: "2026-11-30", units: ["maths"], task_count: 2 };
    const withHw = HW.progressSummary({ attempts: known, flags: [], homework: [hw1, hw2], now: NOW });
    const later = { created_at: "2026-12-01T08:00:00Z", due_on: "2026-12-10", units: [], task_count: 5 }; // not set yet
    check(HW.progress(hw1, known, []).done === 1 && HW.progress(hw2, known, []).done === 2 && withHw.averageHomeworkCompletion === 67 &&
      HW.progressSummary({ attempts: known, flags: [], homework: [hw1, hw2, later], now: NOW }).averageHomeworkCompletion === 67 &&
      HW.progressSummary({ attempts: known, flags: [{ at: "2026-11-16T08:30:00Z", unit: "maths", units: ["maths"], taskId: "t-c" }], homework: [hw2], now: NOW }).averageHomeworkCompletion === 50,
      "Progress summary: the homework average is each homework's done (the homework rule: first passes in its time and units, a flagged task not counted, at most its task count) as a percentage, averaged and rounded (33% and 100% give 67%)");
    const figuresSrc = between(tj, "  const ukWhen = ", "  // The local figures");
    const figures = new Function("esc", figuresSrc + "; return summaryFiguresHtml;")(escF);
    const asReply = (s) => ({ first_passes_this_week: s.firstPassesThisWeek, average_first_passes_per_week: s.averageFirstPassesPerWeek, average_homework_completion: s.averageHomeworkCompletion, last_active: s.lastActive });
    const dl = (h) => [...h.matchAll(/<dt>([^<]+)<\/dt><dd>([^<]+)<\/dd>/g)].map((m) => m[1] + ": " + m[2]);
    const shown = dl(figures(asReply(withHw))), none = dl(figures(asReply(HW.progressSummary({ attempts: [], homework: [], now: NOW })))),
      local = dl(figures(asReply(HW.progressSummary({ attempts: known, homework: null, now: NOW }))));
    check(shown.join(" | ") === "First passes this week: 2 | Average first passes per week: 1.3 | Average homework completion: 67% | Last active: 17 Nov 2026, 16:00" &&
      none.join(" | ") === "First passes this week: 0 | Average first passes per week: 0.0 | Average homework completion: No homework set since they joined | Last active: Not active yet" &&
      local[2] === "Average homework completion: Homework is not available in this browser",
      "Progress summary: the four figures as the page shows them (one decimal place, a whole percentage, UK date and time); \"No homework set since they joined\" with none set (prompt 26), \"Not active yet\" with no attempts, and in local mode \"Homework is not available in this browser\"");
    const sdIdx = (id) => th.indexOf(id);
    const studentPage = between(th, '<section id="page-student"', "<!-- =====");
    check(studentPage.indexOf('id="sd-summary-h">Progress summary</h3>') > 0 && studentPage.indexOf('id="sd-summary-h"') < studentPage.indexOf("<h3>Secured score per unit</h3>") &&
      /<p class="small">Based on first passes\. Repeat passes are not counted\.<\/p>/.test(th) && /renderStudentSummary\(data, studentId\);/.test(tj) && /tb\.progressSummary\(studentId\)/.test(tj) &&
      !/progressSummary|progress_summary|Based on first passes/.test(read("leaderboard.js") + read("leaderboard.html") + read("home.js") + read("progress.js") + read("app.html") + read("progress.html") + read("backend.js")) &&
      !/progress_summary|progressSummary/.test(between(tj, "const EXPORTS = {", "// The first rows of a CSV text")),
      "Progress summary: a section on the teacher's student page, above the secured score per unit, with its one line \"Based on first passes. Repeat passes are not counted.\"; not on the student's own pages, the leaderboards or the exports");
  }

  // ===================== Prompt 26 (2026-11): homework since joining, several classes at once, class code cards =====================
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const HW = require(path.join(ROOT, "homework.js"));
    const CC = require(path.join(ROOT, "class-create.js"));
    const Card = require(path.join(ROOT, "class-card.js"));
    const tj = read("teacher.js"), th = read("teacher.html"), tb = read("teacher-backend.js"), hs = read("supabase/functions/_shared/homework-server.js");
    const between = (src, from, to) => { const i = src.indexOf(from); return i < 0 ? "" : src.slice(i, src.indexOf(to, i + from.length)); };
    const escF = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    // ---------- Part A: homework set since the student joined ----------
    const NOW = Date.parse("2026-11-18T12:00:00Z");
    const A = (taskId, iso) => ({ kind: "attempt", taskId, unit: "maths", units: ["maths"], result: "pass", at: iso });
    const passes = [A("t-a", "2026-11-03T10:00:00Z"), A("t-b", "2026-11-16T09:00:00Z"), A("t-c", "2026-11-17T09:00:00Z")];
    const before = { created_at: "2026-11-02T08:00:00Z", due_on: "2026-11-08", units: [], task_count: 2 };   // set before the student joined: 1 of 2 done
    const sameDay = { created_at: "2026-11-10T07:00:00Z", due_on: "2026-11-30", units: [], task_count: 4 }; // set on the day they joined (earlier that day): 2 of 4
    const later = { created_at: "2026-11-15T08:00:00Z", due_on: "2026-11-30", units: [], task_count: 2 };   // set after: 2 of 2
    const joined = "2026-11-10T15:00:00Z";
    const sinceJoin = HW.progressSummary({ attempts: passes, flags: [], homework: [before, sameDay, later], joinedAt: joined, now: NOW });
    const everyHw = HW.progressSummary({ attempts: passes, flags: [], homework: [before, sameDay, later], now: NOW });
    const noneSince = HW.progressSummary({ attempts: passes, flags: [], homework: [before], joinedAt: joined, now: NOW });
    check(HW.homeworkSinceJoined([before, sameDay, later], joined, NOW).length === 2 && sinceJoin.averageHomeworkCompletion === 75 && everyHw.averageHomeworkCompletion === 67 &&
      noneSince.averageHomeworkCompletion === null && HW.homeworkSinceJoined([later], "2026-12-01T00:00:00Z", NOW).length === 0 &&
      /joinedAt: joined && joined\.created_at/.test(hs) && /sb\.from\("students"\)\.select\("id, created_at"\)\.eq\("id", s\.id\)/.test(hs) &&
      /joinedAt: \(data\.students\[studentId\] \|\| \{\}\)\.created/.test(tj) && /const set = homeworkSinceJoined\(o\.homework, o\.joinedAt, now\)/.test(read("homework.js")),
      "Progress summary (prompt 26): the homework average counts only homework set on or after the day the student joined (50% and 100% give 75%, not 67% with the earlier one); one rule (homework.js homeworkSinceJoined) for the server (students.created_at) and local mode");
    const figures = new Function("esc", between(tj, "  const ukWhen = ", "  // joinedAt: when this browser") + "; return summaryFiguresHtml;")(escF);
    check(/<dt>Average homework completion<\/dt><dd>No homework set since they joined<\/dd>/.test(figures({ first_passes_this_week: 0, average_first_passes_per_week: 0, average_homework_completion: null, last_active: null })) &&
      !/No homework set yet/.test(tj),
      "Progress summary (prompt 26): with no homework set since the student joined, the page says \"No homework set since they joined\"");

    // ---------- Part B: several classes at once ----------
    const plan = CC.planBatch("11A, 11B\n11C,, 11a ,  12X  , 7Y", ["12x", "7Z"]);
    check(plan.names.join("|") === "11A|11B|11C|7Y" && plan.refused.map((r) => r.name + ": " + r.reason).join("|") === "11a: it is in the list twice|12X: you already have a class with this name",
      "Several classes: the names (commas or new lines) are checked first; a name listed twice or one the teacher already has (ignoring capitals and spaces) is refused, with the reason");
    const twelve = CC.planBatch(Array.from({ length: 12 }, (_, i) => "C" + (i + 1)).join(", "), []);
    check(CC.MAX_BATCH === 10 && twelve.names.length === 10 && twelve.refused.map((r) => r.name).join() === "C11,C12" && twelve.refused.every((r) => r.reason === "only 10 classes can be made at a time") &&
      CC.planBatch("x".repeat(101), []).refused[0].reason === "the name is longer than 100 characters",
      "Several classes: at most 10 are made at a time; names after the tenth (and names over 100 characters) are refused and listed");
    // The real "Create several classes" handler (teacher-backend.js with class-create.js) against a stand-in Supabase
    // client that gives each new class its own code, in a child process (the handler is async and these checks are not).
    const batch = (names) => {
      const scenario = async (root, names) => {
        const fs = require("fs"), vm = require("vm");
        const els = {}, handlers = {}, inserts = [];
        const el = (id) => els[id] || (els[id] = { id, value: "", textContent: "", innerHTML: "", hidden: false, className: "", disabled: false,
          addEventListener: (type, fn) => { handlers[id + ":" + type] = fn; }, focus() {} });
        el("tb-new-classes-names").value = names;
        el("tb-new-classes-stage").value = "ks3";
        const respond = (q) => { if (!q.insert) return { data: [] }; inserts.push(q.insert); return { data: { id: "c" + inserts.length, class_code: "CODE" + String(inserts.length).padStart(2, "0") } }; };
        const query = () => { const q = {}; const b = { insert: (row) => { q.insert = row; return b; }, then: (ok) => ok(respond(q)) };
          ["select", "order", "eq", "single", "maybeSingle", "range"].forEach((m) => { b[m] = () => b; }); return b; };
        const sb = { from: query, auth: { getSession: async () => ({ data: { session: null } }) } };
        const ctx = { document: { getElementById: el, head: { appendChild() {} } }, location: { hash: "", pathname: "/teacher.html", origin: "" },
          history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {} }, console,
          APP_CONFIG: { BACKEND_ENABLED: true, SUPABASE_URL: "https://example.test", SUPABASE_ANON_KEY: "test" },
          supabase: { createClient: () => sb }, Curriculum: { DEFAULT_STAGE: "gcse", stageOf: (s) => ({ label: s }) } };
        ctx.self = ctx;
        vm.createContext(ctx);
        vm.runInContext(fs.readFileSync(require("path").join(root, "class-create.js"), "utf8"), ctx);
        vm.runInContext(fs.readFileSync(require("path").join(root, "teacher-backend.js"), "utf8"), ctx);
        await ctx.TeacherBackend.start(() => {}, () => {});
        await handlers["tb-new-classes:submit"]({ preventDefault() {} });
        console.log(JSON.stringify({ inserts, result: el("tb-batch-result").innerHTML, left: el("tb-new-classes-names").value }));
      };
      const out = require("child_process").execFileSync(process.execPath, ["-e", "(" + scenario.toString() + ")(" + JSON.stringify(ROOT) + ", " + JSON.stringify(names) + ")"], { encoding: "utf8" });
      return JSON.parse(out.trim().split("\n").pop());
    };
    const made = batch("11A, 11B\n11C, 11a");
    check(made.inserts.map((r) => JSON.stringify(r)).join() === '{"name":"11A","stage":"ks3"},{"name":"11B","stage":"ks3"},{"name":"11C","stage":"ks3"}' &&
      made.inserts.every((r) => !("teacher_id" in r)) && /3 classes created\./.test(made.result) &&
      ["11A: <strong class=\"class-code\">CODE01", "11B: <strong class=\"class-code\">CODE02", "11C: <strong class=\"class-code\">CODE03"].every((x) => made.result.includes(x)) &&
      /<li>11a: it is in the list twice\.<\/li>/.test(made.result) && made.left === "11a",
      "Several classes: the real handler makes one class per name (each insert as \"Create class\" makes it, with the stage and no teacher id), and the summary lists each new class with its own code, and the refused names with why");
    const over = batch(Array.from({ length: 12 }, (_, i) => "Y" + (i + 1)).join("\n"));
    check(over.inserts.length === 10 && /10 classes created\./.test(over.result) && /<li>Y11: only 10 classes can be made at a time\.<\/li><li>Y12: only 10 classes can be made at a time\.<\/li>/.test(over.result) &&
      /const r = await self\.ClassCreate\.createClass\(sb, name, stage, stageOnServer\);/.test(tb) && !/sb\.from\("classes"\)\.insert/.test(tb) &&
      /<script src="class-create\.js"><\/script>\s*<script src="class-card\.js"><\/script>\s*<script src="teacher-backend\.js"><\/script>/.test(th),
      "Several classes: a batch over 10 makes the first 10 and lists the rest as refused; \"Create class\" and \"Create several classes\" share class-create.js (teacher-backend.js has no insert of its own)");
    const rls = read("supabase/migrations/0002_rls.sql");
    check(/create policy "teacher adds own classes" on public\.classes for insert to authenticated\s*with check \(teacher_id = \(select auth\.uid\(\)\)\);/.test(rls) &&
      /grant select, delete, insert \(name, end_of_year\)/.test(rls) && /teacher_id uuid not null default auth\.uid\(\)/.test(read("supabase/migrations/0001_schema.sql")),
      "Several classes: a class can only be made in the signed-in teacher's own name (row-level security checks teacher_id, which the teacher can't even send)");

    // ---------- Part C: class code cards ----------
    const doc = { createElement: (tag) => { const e = { tagName: tag, children: [], attrs: {}, className: "", textContent: "",
      setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); return c; } }; return e; } };
    const flat = (e) => [e].concat(...e.children.map(flat));
    const text = (e) => flat(e).map((x) => x.textContent).filter(Boolean);
    const cards = Card.parse("#" + Card.url([{ name: "11A", stage: "GCSE", code: "ABC234" }, { name: "11B <b>", stage: "KS3", code: "" }], true).split("#")[1]);
    const one = text(Card.card(doc, cards[0])), noCode = text(Card.card(doc, cards[1]));
    check(cards.length === 2 && cards[1].name === "11B <b>" &&
      JSON.stringify(one) === JSON.stringify(["Pythons and Ladders", "11A", "GCSE", "Class code", "ABC234", "Website: ", "[SITE ADDRESS]", "How to join",
        "Go to [SITE ADDRESS].", "Choose 'New student'.", "Type the class code above and your nickname.", "Write down the code and PIN you are given. Keep them secret.", "If you forget your PIN, ask your teacher."]) &&
      noCode.includes(Card.NO_CODE) && /print=1/.test(Card.url(cards, true)) && Card.parse("#classes=not-json").length === 0 &&
      (read("class-card.js").match(/\[SITE ADDRESS\]/g) || []).length === 1 && !/\[SITE ADDRESS\]/.test(read("class-card.html")) && !/innerHTML/.test(read("class-card.js")),
      "Class code card: the class name and stage, the class code, the site address placeholder ([SITE ADDRESS], set in one place), the four instructions and \"If you forget your PIN, ask your teacher.\", all as text; local mode's card says it has no class code");
    const cardHtml = read("class-card.html");
    check(/@page \{ size: A4 portrait; margin: 12mm; \}/.test(cardHtml) && /\.cc-card \{ width: 186mm; height: 271mm;[^}]*break-after: page;[^}]*break-inside: avoid;/.test(cardHtml) &&
      /\.cc-card:last-child \{ break-after: auto;/.test(cardHtml) && !/<nav|<button|class="side-nav"|<a /i.test(cardHtml.replace(/<!--[\s\S]*?-->/g, "")) &&
      /\.cc-card \{\s*background: var\(--paper\); width: 100%; max-width: 640px;/.test(cardHtml) && /overflow-wrap: anywhere/.test(cardHtml),
      "Class code card: each card is one A4 portrait page (186 × 271 mm inside 12 mm margins, a page break after each but the last), with no site menu, links or buttons, and it shrinks to the screen's width");
    check(/<section class="class-cards" aria-labelledby="cards-h">/.test(th) && /<button type="button" id="cards-print-all" class="secondary">Print all classes<\/button>/.test(th) &&
      /data-card="' \+ i \+ '"[^>]*>Print card<\/button>/.test(tj) && /window\.open\(self\.ClassCard\.url\(cardClasses\(\), true\), "_blank"\)/.test(tj) &&
      /tb \? tb\.classCards\(\) : \[\{ name: "This browser"/.test(tj) && th.indexOf('class="class-cards"') > th.indexOf('id="cl-main"') && th.indexOf('class="class-cards"') < th.indexOf('id="page-students"'),
      "Class code cards: the Classes page lists every class with Print card, and Print all classes prints every class, one per sheet (local mode: this browser's card)");
  }

  // ===================== Prompt 27 (2026-11): class card wording, and the glossary =====================
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const Card = require(path.join(ROOT, "class-card.js"));
    const G = require(path.join(ROOT, "glossary.js"));
    const gl = JSON.parse(read("glossary.json"));
    const compiled = G.compile(gl);
    const links = (h) => [...h.matchAll(/<a class="term-link" href="glossary\.html#term-([\w-]+)" target="_blank" rel="noopener" title="[^"]*">([^<]+)<span class="visually-hidden">/g)].map((m) => m[1] + "=" + m[2]);

    // Part A: the card's steps.
    check(JSON.stringify(Card.STEPS) === JSON.stringify(["Go to [SITE ADDRESS].", "Choose 'New student'.", "Type the class code above and your nickname.", "Write down the code and PIN you are given. Keep them secret."]) &&
      !/Join a class|Choose a PIN/.test(read("class-card.js")) && /Choose 'New student'/.test(read("README.md")),
      "Class code card (prompt 27): step 2 is \"Choose 'New student'.\" and step 4 \"Write down the code and PIN you are given. Keep them secret.\" (steps 1 and 3 unchanged, no others)");

    // Part B: the content.
    const draftTerms = ["variable", "casting", "for loop", "if, elif, else", "2D array", "constructor", "hash table", "dictionary", "f-string", "subroutine", "exception", "algorithm"];
    check(gl.terms.length === 100 && new Set(gl.terms.map((t) => t.id)).size === 100 && new Set(gl.terms.map((t) => t.term.toLowerCase())).size === 100 &&
      gl.terms.every((t) => t.term && t.definition && /[.!?]$/.test(t.definition.trim()) && t.example && t.group && gl.groups.includes(t.group) && Array.isArray(t.match)) &&
      draftTerms.every((x) => gl.terms.some((t) => t.term === x)) && gl.groups.length === 10,
      "Glossary: glossary.json (the one data file) has 100 terms, each with a one-sentence definition, an example and its group (the draft's 91, plus the 9 kept)");
    // Search: the start of a term, the start of a word in a definition, and nothing.
    const names = (q) => G.search(gl.terms, q).map((t) => t.term);
    const none = G.listHtml(gl.terms, "zzzq");
    check(names("").length === 100 && ["record", "recursion"].every((x) => names("rec").includes(x)) && names("constru").join() === "constructor" && names("recu").join() === "base case,recursion" && names("Remainder").includes("modulus") && names("LIFO").length === 0 &&
      names("last in").includes("stack") && !names("ainder").includes("modulus") && G.search(gl.terms, "zzzq").length === 0 && none.count === 0 && /No matching terms/.test(none.html),
      "Glossary search: it finds the start of a term (constru: constructor; rec: record and recursion, among others; recu: recursion, and base case, whose definition says recursive) and the start of any word in a definition (remainder: modulus; last in: stack), ignores capitals, not the middle of a word, and says \"No matching terms\" when nothing matches");
    const all = G.listHtml(gl.terms, "");
    const order = [...all.html.matchAll(/<h3 class="gloss-term">([^<]+) <span/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    const letters = [...all.html.matchAll(/<h2 class="gloss-letter-h" id="letter-(\w+)">/g)].map((m) => m[1]);
    check(order.length === 100 && order[0] === "2D array" && order[1] === "3D array" && order.slice(2).every((t, i, a) => i === 0 || a[i - 1].localeCompare(t, "en-GB", { sensitivity: "base", numeric: true }) <= 0) &&
      letters[0] === "num" && letters.slice(1).every((l, i, a) => i === 0 || a[i - 1] < l) && /<pre class="gloss-example"><code>/.test(all.html) &&
      /\.gloss-example \{[^}]*white-space: pre-wrap;[^}]*overflow-wrap: anywhere;/.test(read("styles.css")),
      "Glossary page: every term A to Z under its letter (\"2D array\" and \"3D array\" first, under 0–9), each with its definition and its example in a code block that wraps on a phone");
    const page = read("glossary.html"), gjs = read("glossary.js");
    check(!/backend\.js|config\.js|supabase|backend-rows/.test(page) && /<script src="store\.js"><\/script>/.test(page) && /<script src="glossary\.js"><\/script>/.test(page) &&
      /fetch\("glossary\.json"\)/.test(gjs) && !/Backend|functions\/v1|supabase|teacher\.html/.test(gjs) && /<input type="search" id="gloss-search"/.test(page) && /id="gloss-status"[^>]*role="status"/.test(page),
      "Glossary page: plain content (glossary.json and the theme settings only), so it works the same in local mode, with no server or sign-in; a search box at the top and a status line");

    // Linking in task text and hints.
    const t1 = { unit: "lists", description: "A list holds several values. Use the list below.\nlist output: 1 2 3", hints: ["Append each value to the list.", "Each list has an index."] };
    const r1 = G.linkTask(t1, compiled);
    check(links(r1.description).join() === "list=list" && links(r1.hints[0]).join() === "append=Append" && links(r1.hints[1]).join() === "index=index" &&
      (r1.description + r1.hints.join("")).split("term-list\"").length === 2 && /\nlist output: 1 2 3$/.test(r1.description),
      "Glossary links: a task's first mention of each term links to its entry (in a new tab), and later mentions on the same task (description or hints) don't");
    const codeLike = G.linkTask({ unit: "loops-count", description: 'Use range(5) and print "a list of numbers". Set self.name too.', hints: ["The loop uses len(items)."] }, compiled);
    const units = (u) => links(G.linkTask({ unit: u, description: "Each class has 30 pupils.", hints: [] }, compiled).description).join();
    check(links(codeLike.description).join() === "" && links(codeLike.hints[0]).join() === "loop=loop" && units("selection") === "" && units("oop-classes") === "class=class" &&
      links(G.linkTask({ unit: "insertion-sort", description: "The item is in a variable called key.", hints: [] }, compiled).description).join() === "variable=variable",
      "Glossary links: never a call such as range(5) or len(, a word in \"double quotes\", or part of a name such as self.name; a term with a meaning that changes (class, key, range, return, length) links only in the units where it means the Python word");
    const realTask = require(path.join(ROOT, "tasks.json")).find((t) => t.id === "lists-L1a") || require(path.join(ROOT, "tasks.json")).find((t) => t.unit === "lists");
    const realLinks = links(G.linkTask(realTask, compiled).description).concat(...G.linkTask(realTask, compiled).hints.map(links));
    check(realLinks.length > 0 && new Set(realLinks.map((l) => l.split("=")[0])).size === realLinks.length,
      "Glossary links: a real task (" + realTask.id + ") links its terms (" + realLinks.join(", ") + "), each only once");
    const appJs = read("app.js");
    check((appJs.match(/linked\(t\)/g) || []).length === 2 && /'<p class="description">' \+ linked\(t\)\.description \+ "<\/p>"/.test(appJs) && /\(linked\(t\)\.hints\[i\] \|\| esc\(h\)\)/.test(appJs) &&
      /loadJson\("glossary\.json"\)\.catch\(\(\) => null\)/.test(appJs) && !/Glossary/.test(read("task-view.js")) && !/Glossary|linked\(/.test(appJs.slice(appJs.indexOf("function renderResults"), appJs.indexOf("function renderResults") + 3000)),
      "Glossary links: only the task's description and hints are linked; the code, the editor (task-view.js) and the test results never are; without glossary.json the text shows as before");
    // The links to the page.
    const tNav = read("teacher.html").slice(read("teacher.html").indexOf('<div id="side-nav-links"'), read("teacher.html").indexOf("</nav>"));
    check(/<a href="glossary\.html" class="menu-link">Glossary<\/a>/.test(read("app.html")) && /<a href="glossary\.html" class="menu-link">Glossary<\/a>/.test(read("progress.html")) &&
      /<a href="glossary\.html" target="_blank" rel="noopener">Glossary/.test(read("practice.html")) && /<script src="glossary\.js"><\/script>/.test(read("practice.html")) &&
      /<a href="glossary\.html" class="nav-glossary">Glossary<\/a>/.test(tNav),
      "Glossary: linked from the student home page's menu, My progress and the practice page's side panel, and from the teacher view's side menu");
  }

  // ===================== Prompt 28 (2026-11): OCR specification codes (teacher side only) =====================
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const CC = require(path.join(ROOT, "curriculum-codes.js"));
    const TD28 = require(path.join(ROOT, "teacher-data.js"));
    const codes = JSON.parse(read("curriculum-codes.json"));
    const tj = read("teacher.js"), th = read("teacher.html");
    const between = (src, from, to) => { const i = src.indexOf(from); return i < 0 ? "" : src.slice(i, src.indexOf(to, i + from.length)); };

    // The data: one code for every unit, every code a real unit, and the versions.
    check(CC.problems(codes, Curriculum).length === 0 && codes.units.length === Curriculum.UNITS.length && Curriculum.UNITS.length === 40 &&
      Curriculum.UNITS.every((u) => codes.units.filter((e) => e.unit === u.id).length === 1) && codes.units.every((e) => Curriculum.UNITS.some((u) => u.id === e.unit)) &&
      CC.problems({ specifications: codes.specifications, units: codes.units.slice(1).concat([{ unit: "no-such-unit", specification: "J277", version: "2.4", code: "2.2.1", point: "x" }]) }, Curriculum).join("|") === "output has 0 entries|no-such-unit isn't a unit",
      "Specification codes: curriculum-codes.json has exactly one code for each of the 40 units in the curriculum, and every code belongs to a real unit (a missing or unknown unit is caught)");
    const vers = CC.versions(codes);
    check(codes.specifications.J277.version === "2.4" && codes.specifications.H446.version === "3.0" && vers.join(" · ") === "OCR GCSE (9–1) Computer Science (J277), version 2.4 · OCR A Level Computer Science (H446), version 3.0" &&
      /\$\("cc-versions"\)\.textContent = self\.CurriculumCodes\.versions\(codesData\)\.join\(" · "\);/.test(tj) && /<p id="cc-versions"/.test(between(th, '<section id="page-curriculum"', "</section>")) &&
      /document\.getElementById\("cc-versions"\)\.textContent = versions\(data\)/.test(read("curriculum-codes.js")) && /id="cc-versions"/.test(read("curriculum-print.html")) &&
      codes.units.every((e) => e.version === codes.specifications[e.specification].version),
      "Specification codes: the J277 (version 2.4) and H446 (version 3.0) versions are on the Curriculum page and its print page");
    const traceRow = codes.units.find((e) => e.unit === "trace-tables");
    const all = CC.rows(codes, Curriculum);
    const html = CC.tableHtml(all);
    check(traceRow.closestMatch === true && traceRow.code === "2.3.2" && traceRow.point === "testing" && /aren't named in the specification/.test(traceRow.matchNote) &&
      codes.units.filter((e) => e.closestMatch).length === 1 && (html.match(/Closest match: not named in the specification<\/span>/g) || []).length === 1 &&
      /Trace tables<\/th><td>J277 \(version 2\.4\)<\/td><td class="cc-code">2\.3\.2<\/td><td>testing <span class="cc-flag"/.test(html),
      "Specification codes: Trace tables is J277 2.3.2 (testing), marked in the data and on the page as the closest match (not named in the specification)");
    // The Curriculum page: every unit, by block, with its code.
    const rowsShown = [...html.matchAll(/<tr><th scope="row">([^<]+)<\/th><td>(J277|H446) \(version [\d.]+\)<\/td><td class="cc-code">([\d.]+)<\/td><td>([^<]+)/g)];
    const blocksShown = [...html.matchAll(/<tr class="cc-block"><th scope="colgroup" colspan="4">([^<]+)<\/th>/g)].map((m) => m[1]);
    check(rowsShown.length === 40 && Curriculum.UNITS.every((u) => rowsShown.some((m) => m[1] === Curriculum.unitTitle(u.id).replace(/&/g, "&amp;") && m[3] === codes.units.find((e) => e.unit === u.id).code)) &&
      blocksShown.join("|") === "Programming fundamentals|Advanced programming|Validation|Searching and sorting|A-level: Programming techniques|A-level: Data structures" &&
      /<a href="#classes" data-page="classes" data-backend>Classes<\/a>\s*<!--[^>]*-->\s*<a href="#curriculum" data-page="curriculum">Curriculum<\/a>/.test(th) &&
      /<thead><tr><th scope="col">Unit<\/th><th scope="col">Specification<\/th><th scope="col">Code<\/th><th scope="col">Specification point<\/th><\/tr><\/thead>/.test(html),
      "Curriculum page: in the teacher menu after Classes (local mode too), a table of every unit grouped by block, with the unit name, specification, code and specification point");
    const names = (q) => CC.search(all, q).map((r) => r.unit);
    check(names("loops").join() === "loops-condition,loops-count" && names("SORT").join() === "bubble-sort,insertion-sort,merge-sort" && names("2.3.1").length === 7 &&
      names("h446 1.4.2").join() === "records-tuples,stacks-queues,linked-lists,hash-tables,arrays-3d" && names("").length === 40 && names("zzq").length === 0 &&
      /No matching units/.test(CC.tableHtml([])) && /\$\("cc-search"\)\.addEventListener\("input", renderCurriculum\);/.test(tj),
      "Curriculum page: the search box filters as you type, by unit name (loops, sort) or by code (2.3.1, H446 1.4.2), and says \"No matching units\" when nothing matches");
    const printPage = read("curriculum-print.html");
    check(/@page \{ size: A4 landscape; margin: 10mm; \}/.test(printPage) && /\.cc-table \{ font-size: 7\.5pt; line-height: 1\.1; min-width: 0; \}/.test(printPage) &&
      !/<button|<nav|<a /i.test(printPage.replace(/<!--[\s\S]*?-->/g, "")) && /<script src="curriculum\.js"><\/script>\s*<script src="curriculum-codes\.js"><\/script>/.test(printPage) &&
      /window\.open\("curriculum-print\.html#print=1", "_blank"\)/.test(tj) && /<button type="button" id="cc-print" class="secondary">Print the table<\/button>/.test(th),
      "Curriculum page: Print the table opens the print page (curriculum-print.html): the whole table on one A4 landscape page, with no menu, links or buttons");
    // The Students page: a small grey label under each unit's heading, with a name for a screen reader.
    const S = TD28.overviewTablesHtml({ rows: TD28.scoreTable({ students: { a: { name: "Ann" } }, progress: { a: { units: {} } }, attempts: [], levelLog: [], buttonLog: [], placementLog: [], units: Curriculum.UNITS },
      Curriculum.UNITS.map((u) => u.id)).rows, unitIds: Curriculum.UNITS.map((u) => u.id), unitGroups: Curriculum.UNIT_GROUPS, unitTitle: Curriculum.unitTitle, sortKey: "name", sortDir: 1, when: () => "",
      flagsHtml: () => "", specLabelHtml: (u) => CC.labelHtml(CC.byUnit(codes).get(u)) });
    check(/<button type="button" data-sort="selection">Selection<\/button><span class="spec-code"><span class="visually-hidden">Specification code <\/span>J277 2\.2\.1<\/span><\/th>/.test(S) &&
      /data-sort="hash-tables">Hash tables<\/button><span class="spec-code"><span class="visually-hidden">Specification code <\/span>H446 1\.4\.2<\/span>/.test(S) &&
      (S.match(/class="spec-code"/g) || []).length === 40 && !/spec-code/.test(S.slice(0, S.indexOf('data-sort="average"') + 60)) &&
      /\.spec-code \{ display: block; font-size: \.72rem; font-weight: 400; color: var\(--muted\);[^}]*white-space: nowrap; \}/.test(read("styles.css")) &&
      /specLabelHtml: \(u\) => \(specCodes \? self\.CurriculumCodes\.labelHtml\(specCodes\.get\(u\)\) : ""\)/.test(tj),
      "Students page: each unit's column heading has its code under it (\"J277 2.2.1\"), small and grey on one line, named \"Specification code J277 2.2.1\" for a screen reader; not under Name or Average");
    // Exports and the student side: no change.
    const t17 = TD28.scoreTable({ students: { a: { name: "Ann" } }, progress: { a: { units: {} } }, attempts: [], levelLog: [], buttonLog: [], placementLog: [], units: Curriculum.UNITS }, ["selection"], null, ["selection"]);
    const exportSrc = between(tj, "const EXPORTS = {", "// The first rows of a CSV text") + between(tj, "function levelsCsv(data)", "// The workshop tables");
    check(TD28.classScoresCsv(t17, ["selection"], (u) => u).split(/\r?\n/)[0] === "Name,Average secured score,RAG,selection: secured score,selection: label,selection: level" &&
      !/J277|H446|CurriculumCodes|specCodes|spec-code/.test(exportSrc + read("teacher-data.js").replace(/o\.specLabelHtml/g, "")) &&
      ["app.html", "practice.html", "progress.html", "endless.html", "leaderboard.html", "glossary.html", "index.html"].every((f) => !/curriculum-codes|J277|H446/.test(read(f))) &&
      !/curriculum-codes|J277|H446/.test(read("app.js") + read("home.js") + read("progress.js") + read("backend.js")),
      "Specification codes: no export header or column changes (the Class scores header is as before), and no student page or script loads or shows the codes");
  }

  // ===================== Prompt 29 (2026-11): homework counting, every task type, level and phase =====================
  // Theo reported counts that stopped at 1, and placement, non-level-10 and Parsons passes not counting. The rule
  // (homework.js progress) was checked and has no filter on task type, level or phase; these checks keep it that way.
  // Each pass is made with the app's own attemptRecord, as the practice page saves it.
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const templates = JSON.parse(read("templates.json"));
    const HW29 = require(path.join(ROOT, "homework.js"));
    const App29 = require(path.join(ROOT, "app.js"));
    const S29 = require(path.join(ROOT, "secured.js"));
    const NOW = Date.parse("2026-11-23T12:00:00Z");
    const set = "2026-11-23T09:00:00Z";
    const hwFor = (units, count, extra) => Object.assign({ created_at: set, due_on: "2026-11-27", units, task_count: count || 10 }, extra);
    let n = 0;
    const passOf = (task, opts) => Object.assign({ id: "p" + (++n), studentId: "s1", at: new Date(NOW - 60 * 60000 + n * 1000).toISOString() },
      App29.attemptRecord(Object.assign({ task, unit: task.unit, phase: "practice", kind: "attempt", attemptNumber: 1, hints: 0, result: "pass", levelBefore: task.level, levelAfter: task.level }, opts)));
    const isPl = (t) => (t.tags || []).includes("placement");
    const find = (f) => tasks.find((t) => !isPl(t) && f(t));
    const count = (hw, recs, flags) => HW29.progress(hw, recs, flags || []).done;
    const one = (task, opts) => count(hwFor([task.unit]), [passOf(task, opts)]);
    const byType = {
      predict: find((t) => t.type === "predict" && !t.error_kind), write: find((t) => t.type === "write"), trace: find((t) => t.type === "trace"),
      Parsons: find((t) => t.type === "parsons"), "fill in the blanks": find((t) => t.type === "fill"), "error-kind": find((t) => !!t.error_kind),
      "partial Parsons": find((t) => t.type === "partial-parsons"),
    };
    for (const [label, task] of Object.entries(byType)) {
      check(task && one(task) === 1, "Homework counting: a " + label + " pass counts (" + (task && task.id) + ", " + (task && task.type) + ", level " + (task && task.level) + ")");
    }
    const tpl29 = (Array.isArray(templates) ? templates : []).find((t) => t.type === "scratch");
    // A template variant carries its template's units (templates.js), so its unit is the first of them.
    check(!tpl29 || one(Object.assign({}, tpl29, { id: tpl29.id + "#7", templateId: tpl29.id, generated: true, fingerprint: "fp7", unit: tpl29.unit || tpl29.units[0], units: tpl29.units }), { phase: "endless" }) === 1,
      "Homework counting: a write-from-scratch variant passed in endless mode counts (a type and phase the rule doesn't list)");
    const lv = (l) => find((t) => t.unit === "recursion" && t.level === l);
    check(one(lv(1)) === 1 && one(lv(5)) === 1 && one(lv(10)) === 1 && one(tasks.find((t) => isPl(t) && t.unit === "recursion"), { phase: "placement" }) === 1 &&
      one(lv(3), { phase: "assignment", assignmentId: "a1" }) === 1 && one(lv(10), { phase: "endless" }) === 1,
      "Homework counting: level 1, 5 and 10 passes count, and so do placement, assignment and endless passes");
    const t1 = lv(1), t5 = lv(5), t10 = lv(10);
    const first = passOf(t1), again = passOf(t1);
    const before = Object.assign(passOf(t5), { at: "2026-11-23T08:00:00Z" });
    const late = Object.assign(passOf(t10), { at: "2026-11-28T09:00:00Z" });
    const flagged = passOf(lv(7));
    const flag = { at: new Date(Date.parse(flagged.at) - 1).toISOString(), unit: "recursion", units: ["recursion"], taskId: flagged.taskId };
    check(count(hwFor(["recursion"]), [first, again]) === 1 && count(hwFor(["recursion"]), [before]) === 0 && count(hwFor(["recursion"]), [late]) === 0 &&
      count(hwFor(["recursion"]), [flagged], [flag]) === 0 && count(hwFor(["recursion"]), [first, flagged], [flag]) === 1,
      "Homework counting: a repeat pass doesn't count again; nor does a task passed before the homework was set, a pass after the due date, or a flagged paste");
    const many = tasks.filter((t) => t.unit === "recursion" && !isPl(t)).slice(0, 6).map((t) => passOf(t));
    const other = passOf(find((t) => t.unit === "selection"));
    const combined = passOf(Object.assign({}, lv(10), { id: "combo#1", units: ["recursion", "scope-parameters"], generated: true, fingerprint: "combo1" }), { phase: "endless" });
    check(count(hwFor(["recursion"], 4), many) === 4 && HW29.progress(hwFor(["recursion"], 4), many, []).complete && count(hwFor(["recursion"]), [other]) === 0 &&
      count(hwFor([]), [other]) === 1 && count(hwFor(["scope-parameters"]), [combined]) === 1 && count(hwFor(["recursion"]), [combined]) === 1 && count(hwFor(["lists"]), [combined]) === 0,
      "Homework counting: the count stops at the number set; a unit the homework doesn't cover doesn't count (no units covers every unit); a combined endless task counts if either of its units is covered");
    const progSrc = read("homework.js").slice(read("homework.js").indexOf("function firstPasses"), read("homework.js").indexOf("// The homework sets a task in these units counts for right now"));
    check(!/taskType|taskLevel|\.phase|\.level\b|"write"|"parsons"|"placement"|isPlacement/.test(progSrc),
      "Homework counting: the rule (homework.js firstPasses and progress) never looks at a task's type, level or phase: only its first pass, the date, its units and any paste flag");
    // The programme points (prompt 23) still count only level 10 write programmes passed in endless mode.
    const progs = S29.programmes([passOf(lv(10), { phase: "endless" }), passOf(lv(10), { phase: "practice" }), passOf(byType.Parsons, { phase: "endless" }),
      passOf(lv(5), { phase: "endless" })], NOW);
    check(progs.count === (lv(10).type === "write" || lv(10).type === "scratch" ? 1 : 0) && progs.list.every((p) => p.points <= 50) &&
      S29.PROGRAMME_TYPES.join() === "write,scratch",
      "Homework counting changes nothing else: programme points and the programme count still count only level 10 write programmes in endless mode");
  }

  // ===================== Selection, trimmed =====================
  // 74 practice tasks (7 or 8 a level, none with a function) and 8 placement tasks; every removed id is in one kept
  // task's former_ids, marked as a replacement (a different task, so a student's progress isn't moved onto it).
  {
    const TaskView = require(path.join(ROOT, "task-view.js"));
    const templatesAll = JSON.parse(fs.readFileSync(path.join(ROOT, "templates.json"), "utf8"));
    const selT = tasks.filter((t) => t.unit === "selection");
    const practiceS = selT.filter((t) => !(t.tags || []).includes("placement"));
    const perLevelS = Array.from({ length: 10 }, (_, i) => practiceS.filter((t) => t.level === i + 1).length);
    const fnS = selT.filter((t) => /^\s*(def|return)\b/m.test([t.solution, t.starter || ""].join("\n")));
    check(practiceS.length === 74 && selT.length - practiceS.length === 8 && perLevelS.join() === "7,8,7,7,8,7,7,7,8,8" && !fnS.length &&
      !Curriculum.unitById("selection").skills.includes("selection-in-functions") && !Curriculum.unitById("selection").skillMinLevel &&
      !selT.some((t) => (t.skills || []).includes("selection-in-functions")),
      "Selection: 74 practice tasks (7 or 8 at each level) and 8 placement tasks, none using a function; the selection-in-functions skill is gone");
    const removedSel = ["functions-L1a", "functions-L10b", "if-L1b", "ifelse-L10b", "elif-L2a", "compare-L6a", "input-L7a", "arith-L8a", "validation-L5a", "sel-L10a", "logic-L10a"];
    const owner = (old) => tasks.filter((t) => (t.former_ids || []).includes(old));
    const allFormer = selT.flatMap((t) => (t.former_ids || []).filter((id) => id !== "sel-L10d"));
    check(removedSel.every((old) => !byId[old] && owner(old).length === 1 && owner(old)[0].unit === "selection" && owner(old)[0].former_ids_are_replacements === true) &&
      allFormer.length === 115 && selT.filter((t) => t.former_ids_are_replacements).every((t) => !(t.former_ids || []).includes("sel-L10d")) &&
      byId["logic-L10b"].former_ids.join() === "sel-L10d" && !byId["logic-L10b"].former_ids_are_replacements &&
      TaskView.searchTasks(tasks, "input-L7a")[0].unit === "selection",
      "Selection: each of the 115 removed ids is in one kept Selection task's former_ids, marked as a replacement (logic-L10b keeps only its duplicate sel-L10d); the Task browser finds them");
    const selTpl = templatesAll.filter((t) => (t.units || []).includes("selection"));
    check(selTpl.length === 97 && selTpl.filter((t) => t.derived).length === 74 && !templatesAll.some((t) => t.source && !byId[t.source]) &&
      !templatesAll.some((t) => /^d-functions-/.test(t.id)) && practiceS.every((t) => templatesAll.some((tpl) => tpl.derived && tpl.source === t.id)),
      "Selection: 97 templates remain (74 derived, one per kept task, plus the hand-written, combined and write-from-scratch ones); no template points at a removed task");
  }

  // ===================== "Unit secured at 100%" pop-up =====================
  {
    const appU = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    const cssU = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
    const t10 = tasks.find((x) => x.unit === "selection" && x.level === 10 && !App.isPlacementTask(x));
    const DAY = 86400000, T0 = Date.UTC(2026, 9, 1, 10);
    const pass = (days, o) => Object.assign(App.attemptRecord(Object.assign({ task: t10, unit: "selection", phase: "practice", kind: "attempt", attemptNumber: 1, hints: 0,
      result: "pass", levelBefore: 10, levelAfter: 10 }, o || {})), { id: "a" + days + JSON.stringify(o || {}), at: new Date(T0 + days * DAY).toISOString() });
    const reached = (before, rec) => App.reachedFullSecure(before, rec);
    const p1 = pass(0), p2 = pass(1), p3 = pass(3), p4 = pass(12), p5 = pass(13);
    check(!reached([], p1) && reached([p1], p2) && !reached([p1, p2], p3) && reached([p1, p2, p3], p4) && !reached([p1, p2, p3, p4], p5),
      "Secured pop-up: it shows after the pass that takes the unit to 100% (the 2nd level 10 pass), and again after a pass that brings it back to 100% from 90%; not for a pass while it is already 100%");
    check(!reached([p1], pass(1, { hints: 1 })) && !reached([p1], pass(1, { showHow: true })) && !reached([p1], pass(1, { result: "fail" })) &&
      !reached([p1], pass(1, { task: tasks.find((x) => x.unit === "selection" && x.level === 9 && !App.isPlacementTask(x)) })),
      "Secured pop-up: not for a pass that doesn't take the unit to 100% (with a hint, after Show me how, a fail, or below level 10)");
    check(!reached([p1], pass(1, { phase: "placement" })) && !reached([p1], pass(1, { phase: "assignment" })) && reached([pass(0, { phase: "endless" })], pass(1, { phase: "endless" })) &&
      /phase: "assignment", assignmentId[\s\S]{0,400}\}\)\);\s*\}\s*const lv = /.test(appU) &&
      /if \(saved && o\.result === "pass" && !c\.placement && !preview\) \{/.test(appU) && /const preview = !!previewId && previewAllowed\(self\);/.test(appU),
      "Secured pop-up: shows in practice and endless mode, never in placement, assignments (they return before the check) or teacher practice");
    // Saved first, shown after: the pass is logged before the check, and the pop-up opens after the page is drawn.
    const recSrc = appU.slice(appU.indexOf("  function recordAttempt("), appU.indexOf("  function showDialogIfDue("));
    check(recSrc.indexOf("const saved = Store.logAttempt(") < recSrc.indexOf("reachedFullSecure(") && /let securedDue = false;/.test(appU) &&
      (appU.match(/\$\("next-btn"\)\.focus\(\);\s*showDialogIfDue\(\);/g) || []).length === 3 && !/save[\w]*\([^)]*securedDue|securedDue[^;\n]*Store\./.test(appU) &&
      /<script src="secured\.js"><\/script>\s*<script src="app\.js">/.test(fs.readFileSync(path.join(ROOT, "practice.html"), "utf8")),
      "Secured pop-up: the pass is saved first and the pop-up opens after it (Check, predict and trace); it is never saved, so reloading the page doesn't show it again");

    // The dialog on a tiny fake page.
    const page = () => {
      const listeners = {};
      const doc = { activeElement: null,
        addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
        removeEventListener(t, f) { listeners[t] = (listeners[t] || []).filter((x) => x !== f); },
        key(k, shift) { let stopped = false; (listeners.keydown || []).slice().forEach((f) => f({ key: k, shiftKey: !!shift, preventDefault() { stopped = true; } })); return stopped; },
        focusIn(target) { (listeners.focusin || []).slice().forEach((f) => f({ target })); },
        listeners, createElement: (tag) => el(tag) };
      function el(tag) {
        const e = { tagName: tag, children: [], parent: null, attrs: {}, handlers: {}, className: "", id: "", textContent: "",
          setAttribute(n, v) { this.attrs[n] = v; }, removeAttribute(n) { delete this.attrs[n]; }, getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; },
          appendChild(c) { c.parent = this; this.children.push(c); return c; },
          remove() { if (this.parent) { this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; } },
          contains(x) { for (let n = x; n; n = n.parent) if (n === this) return true; return false; },
          addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); },
          click() { (this.handlers.click || []).forEach((f) => f({ target: this })); },
          focus() { doc.activeElement = this; } };
        return e;
      }
      doc.body = el("body");
      doc.main = doc.body.appendChild(el("main"));
      doc.next = doc.main.appendChild(el("button"));
      return doc;
    };
    const d = page();
    let home = 0, returned = 0;
    d.next.focus();
    const dlg = App.openSecuredDialog(d, { inert: [d.main], onHome: () => { home++; }, returnFocus: () => { returned++; d.next.focus(); } });
    const box = dlg.element.children[0];
    const row = box.children[2];
    check(box.attrs.role === "dialog" && box.attrs["aria-modal"] === "true" && box.attrs["aria-labelledby"] === dlg.heading.id && dlg.heading.tagName === "h2" &&
      box.attrs["aria-describedby"] === box.children[1].id && dlg.heading.textContent === "Unit secured at 100%" &&
      box.children[1].textContent === "You've passed this unit's level 10 challenge with no hints. You can move on, or keep practising this unit." &&
      row.children.map((b) => b.textContent).join("|") === "Back to units|Keep practising" && d.body.children.includes(dlg.element),
      "Secured pop-up on the ladder: a dialog (role dialog, aria-modal, labelled by its heading \"Unit secured at 100%\") saying \"…keep practising this unit.\", with two buttons: Back to units, then Keep practising");
    check(d.activeElement === dlg.heading && dlg.heading.attrs.tabindex === "-1" && row.children.every((b) => b.className === "secondary" && b.attrs.type === "button" && !("autofocus" in b.attrs)) &&
      d.main.attrs.inert === "",
      "Secured pop-up: neither button is the default or focused; the heading is focused when it opens, and the page behind is inert");
    // Focus stays inside: Tab from the last button goes to the first, Shift+Tab from the first or the heading to the last.
    dlg.stay.focus();
    const wrapped = d.key("Tab") && d.activeElement === dlg.home;
    const back = d.key("Tab", true) && d.activeElement === dlg.stay;
    dlg.heading.focus();
    const fromHeading = d.key("Tab", true) && d.activeElement === dlg.stay;
    d.focusIn(d.next);
    const pulledBack = d.activeElement === dlg.heading;
    check(wrapped && back && fromHeading && pulledBack, "Secured pop-up: focus stays inside while it's open (Tab and Shift+Tab wrap round; focus that escapes comes back to the heading)");
    const escClosed = d.key("Escape") && !dlg.isOpen() && !d.body.children.includes(dlg.element);
    check(escClosed && home === 0 && returned === 1 && d.activeElement === d.next && !("inert" in d.main.attrs) && !(d.listeners.keydown || []).length && !(d.listeners.focusin || []).length,
      "Secured pop-up: Esc closes it, the same as the second button (Keep practising): focus goes back to the task, the page works again");
    const d2 = page();
    let home2 = 0, returned2 = 0;
    const dlg2 = App.openSecuredDialog(d2, { inert: [d2.main], onHome: () => { home2++; }, returnFocus: () => { returned2++; } });
    dlg2.stay.click();
    const d3 = page();
    let home3 = 0;
    const dlg3 = App.openSecuredDialog(d3, { inert: [d3.main], onHome: () => { home3++; }, returnFocus: () => {} });
    dlg3.home.click();
    check(!dlg2.isOpen() && home2 === 0 && returned2 === 1 && !d2.body.children.includes(dlg2.element) && !dlg3.isOpen() && home3 === 1 &&
      /onHome: \(\) => \{ location\.href = "app\.html"; \}/.test(appU) && /returnFocus: \(\) => back\.focus\(\)/.test(appU),
      "Secured pop-up: Keep practising closes it and leaves the student where they are; Back to units goes to the home page (app.html)");
    // In endless mode: the second button is "Stay in endless mode", and the text says so; the rest is the same.
    const dE = page();
    let homeE = 0, returnedE = 0;
    dE.next.focus();
    const dlgE = App.openSecuredDialog(dE, { endless: true, inert: [dE.main], onHome: () => { homeE++; }, returnFocus: () => { returnedE++; dE.next.focus(); } });
    const boxE = dlgE.element.children[0];
    const rowE = boxE.children[2];
    const shownE = { text: boxE.children[1].textContent, labels: rowE.children.map((b) => b.textContent).join("|"), focused: dE.activeElement === dlgE.heading,
      plain: rowE.children.every((b) => b.className === "secondary" && !("autofocus" in b.attrs)) };
    const escE = dE.key("Escape") && !dlgE.isOpen() && homeE === 0 && returnedE === 1 && dE.activeElement === dE.next;
    const dE2 = page();
    let homeE2 = 0;
    const dlgE2 = App.openSecuredDialog(dE2, { endless: true, inert: [dE2.main], onHome: () => { homeE2++; }, returnFocus: () => {} });
    dlgE2.stay.click();
    check(shownE.text === "You've passed this unit's level 10 challenge with no hints. You can move on, or keep practising in endless mode." &&
      shownE.labels === "Back to units|Stay in endless mode" && shownE.focused && shownE.plain && escE && !dlgE2.isOpen() && homeE2 === 0 &&
      /openSecuredDialog\(document, Object\.assign\(common, \{ endless \}\)\)/.test(appU) && /const endless = !inAssignment && params\.get\("mode"\) === "endless";/.test(appU),
      "Secured pop-up in endless mode: \"…keep practising in endless mode.\" with Back to units, then Stay in endless mode (neither the default; Esc and the second button close it); the page passes its own endless flag");
    // 390px: at most the screen less 32px, the buttons wrap, theme colours only.
    const rule = (sel) => { const i = cssU.indexOf(sel + " {"); return i < 0 ? "" : cssU.slice(i, cssU.indexOf("}", i)); };
    const modalCss = [".modal-backdrop", ".modal-backdrop::before", ".modal", ".modal-title", ".modal-actions", ".modal-actions button"].map(rule).join("\n");
    check(/padding: 16px; box-sizing: border-box/.test(rule(".modal-backdrop")) && /width: 100%; max-width: 28rem; max-height: calc\(100vh - 32px\); overflow-y: auto/.test(rule(".modal")) &&
      /flex-wrap: wrap/.test(rule(".modal-actions")) && /flex: 1 1 10rem/.test(rule(".modal-actions button")) && !/#[0-9a-f]{3,6}\b|rgb/i.test(modalCss) && /var\(--card\)/.test(rule(".modal")),
      "Secured pop-up: it fits at 390px (at most the screen less 32px; the buttons wrap) and uses theme colours only");

    // ===================== "Assignment complete" =====================
    // The real code that marks an assignment task done (finishTask's assignment branch), on a stand-in for the page.
    const finSrc = appU.slice(appU.indexOf("      const ids = assignmentTasks.map((x) => x.id);"), appU.indexOf("      renderSide();\n      return {};\n    }\n    const outcome"));
    const finish = new Function("assignmentTasks", "work", "save", "preview", "assignmentComplete", "passed", "t",
      "let assignmentDoneDue = false;\n" + finSrc + "\nreturn assignmentDoneDue;");
    const aTasks = [{ id: "A" }, { id: "B" }, { id: "C" }];
    const work = { tried: {} };
    let saves = 0;
    const step = (id, passed, wk, prev) => finish(aTasks, wk || work, () => { saves++; }, !!prev, App.assignmentComplete, passed, { id });
    const shown = [step("A", true), step("B", false), step("B", true), step("C", false), step("C", true), step("A", true)];
    check(shown.join() === "false,false,false,false,true,false" && JSON.stringify(work.tried) === '{"A":"passed","B":"passed","C":"passed"}' && saves === 6 &&
      App.assignmentComplete(["A", "B", "C"], work.tried) && !App.assignmentComplete(["A", "B", "C"], { A: "passed", B: "tried", C: "passed" }) && !App.assignmentComplete([], {}),
      "Assignment complete: it shows when the last task still needed is passed (every task has a pass), not before, and not for a pass after that");
    const reloaded = JSON.parse(JSON.stringify(work)); // the saved work, as the page loads it again
    check(!step("B", true, reloaded) && /let assignmentDoneDue = false;/.test(appU) && !/assignmentDoneDue[^;\n]*(save|Store)/.test(appU) &&
      finSrc.indexOf("save();") < finSrc.indexOf("assignmentDoneDue = true"),
      "Assignment complete: an assignment already complete when the page loads doesn't show it again (it's never saved; the pass is saved before it opens)");
    const fresh = { tried: { A: "passed", B: "passed" } };
    const finishSrc = appU.slice(appU.indexOf("  function finishTask(passed) {"), appU.indexOf("    const outcome = { passed, hints: c.hints"));
    check(!step("C", true, fresh, true) && /if \(inAssignment\) \{/.test(finishSrc) && (appU.match(/assignmentDoneDue = true/g) || []).length === 1 &&
      !/finishTask\(/.test(appU.slice(appU.indexOf("  function finishPlacementStep("), appU.indexOf("  function logPlacementResult("))) &&
      /const assignmentId = preview \? "teacher-practice"/.test(appU),
      "Assignment complete: only in the student's own assignment work, never in practice, placement or teacher practice");
    // The breakdown, from the saved work: tasks passed, hints and checks per task (current and drafts).
    const saved = { index: 2, tried: { A: "passed", B: "passed", C: "passed", D: "tried" },
      current: { taskId: "C", hints: 2, attempts: 3 }, drafts: { A: { taskId: "A", hints: 1, attempts: 1 }, B: { taskId: "B", hints: 0, attempts: 4 }, D: { taskId: "D", hints: 1, attempts: 2 } } };
    const sum = App.assignmentSummary(["A", "B", "C", "D"], saved);
    check(sum.total === 4 && sum.passed === 3 && sum.hints === 4 && sum.attempts === 10 && sum.grade === 67 && sum.band === "Getting there" &&
      App.assignmentLines(sum).join("|") === "3 of 4 tasks passed|4 hints used|10 attempts|Grade: Getting there" &&
      JSON.stringify(saved) === JSON.stringify({ index: 2, tried: { A: "passed", B: "passed", C: "passed", D: "tried" }, current: { taskId: "C", hints: 2, attempts: 3 }, drafts: { A: { taskId: "A", hints: 1, attempts: 1 }, B: { taskId: "B", hints: 0, attempts: 4 }, D: { taskId: "D", hints: 1, attempts: 2 } } }),
      "Assignment complete: the breakdown matches the saved work (tasks passed, hints and attempts added up over the tasks), and nothing new is saved");
    // The grade: the percentage passed less 2 points a hint, never below 0; 80+ Well done, 50-79 Getting there, under 50 Keep practising.
    const g = (passed, total, hints) => { const tried = {}; const ids = []; for (let i = 0; i < total; i++) { ids.push("t" + i); if (i < passed) tried["t" + i] = "passed"; }
      return App.assignmentSummary(ids, { tried, current: { taskId: "t0", hints, attempts: 1 } }); };
    check(App.ASSIGNMENT_HINT_PENALTY === 2 && App.ASSIGNMENT_WELL_DONE_FROM === 80 && App.ASSIGNMENT_GETTING_THERE_FROM === 50 &&
      g(8, 8, 0).grade === 100 && g(8, 8, 0).band === "Well done" && g(8, 8, 10).grade === 80 && g(8, 8, 10).band === "Well done" &&
      g(8, 8, 11).band === "Getting there" && g(8, 8, 25).grade === 50 && g(8, 8, 25).band === "Getting there" && g(8, 8, 26).band === "Keep practising" &&
      g(8, 8, 20).grade === 60 && g(8, 8, 20).band === "Getting there" && g(2, 8, 20).grade === 0 && g(8, 8, 60).grade === 0 && g(8, 8, 60).band === "Keep practising" &&
      g(7, 8, 0).band === "Well done" && App.assignmentLines(g(7, 8, 1)).join("|") === "7 of 8 tasks passed|1 hint used|1 attempt|Grade: Well done",
      "Assignment complete: grade = % of tasks passed less 2 a hint, never below 0 (20 hints: 60, Getting there; with 2 of 8 passed, 0); 80+ Well done, 50-79 Getting there, under 50 Keep practising; attempts don't count");
    // The unit to go to: more than half of the tasks; otherwise only "Back to units".
    const u = (...units) => App.assignmentUnit(units.map((x, i) => ({ id: "x" + i, unit: x })));
    const builder = TD.buildSpread(tasks, "selection", 1, 10, 5).map((x) => x.task);
    check(u("selection", "selection", "variables") === "selection" && u("output", "variables") === null && u("selection", "selection", "variables", "variables") === null &&
      u("variables", "maths", "output") === null && u("selection", "selection", "variables", "maths") === null &&
      App.assignmentUnit(["out-L1e", "var-L9c"].map((id) => byId[id])) === null && App.assignmentUnit(builder) === "selection",
      "Assignment complete: Go to this unit is the unit of more than half of the tasks; a tie or mixed units with no majority give only Back to units");
    // The screen on the stand-in page: the heading takes focus, Tab stays inside, Esc goes to Back to units.
    const dA = page();
    const go = [];
    let backA = 0;
    dA.next.focus();
    const scr = App.openAssignmentDialog(dA, { summary: sum, unitId: "selection", inert: [dA.main], onUnit: (x) => go.push("unit:" + x), onHome: () => go.push("home"), returnFocus: () => { backA++; } });
    const boxA = scr.element.children[0];
    const items = boxA.children[1].children.map((li) => li.textContent);
    check(boxA.attrs.role === "dialog" && boxA.attrs["aria-modal"] === "true" && boxA.attrs["aria-labelledby"] === scr.heading.id && scr.heading.textContent === "Assignment complete" &&
      boxA.attrs["aria-describedby"] === boxA.children[1].id && items.join("|") === "3 of 4 tasks passed|4 hints used|10 attempts|Grade: Getting there" &&
      scr.buttons.map((b) => b.textContent).join("|") === "Go to this unit|Back to units" && dA.activeElement === scr.heading &&
      scr.buttons.every((b) => b.className === "secondary" && b.attrs.type === "button" && !("autofocus" in b.attrs)) && dA.main.attrs.inert === "",
      "Assignment complete: a dialog headed \"Assignment complete\" with the breakdown and grade; Go to this unit then Back to units, neither the default; the heading takes focus");
    scr.buttons[1].focus();
    const wrapA = dA.key("Tab") && dA.activeElement === scr.buttons[0];
    const shiftA = dA.key("Tab", true) && dA.activeElement === scr.buttons[1];
    dA.focusIn(dA.next);
    const pulled = dA.activeElement === scr.heading;
    const escA = dA.key("Escape") && !scr.isOpen() && go.join() === "home" && backA === 1 && !("inert" in dA.main.attrs) && !(dA.listeners.keydown || []).length;
    const dB = page();
    const goB = [];
    const scrB = App.openAssignmentDialog(dB, { summary: sum, unitId: "selection", inert: [dB.main], onUnit: (x) => goB.push("unit:" + x), onHome: () => goB.push("home"), returnFocus: () => {} });
    scrB.buttons[0].click();
    const dC = page();
    const goC = [];
    const scrC = App.openAssignmentDialog(dC, { summary: sum, unitId: null, inert: [dC.main], onUnit: () => goC.push("unit"), onHome: () => goC.push("home"), returnFocus: () => {} });
    const oneButton = scrC.buttons.map((b) => b.textContent).join("|") === "Back to units";
    scrC.buttons[0].click();
    check(wrapA && shiftA && pulled && escA && goB.join() === "unit:selection" && !scrB.isOpen() && oneButton && goC.join() === "home" &&
      /onUnit: \(u\) => \{ location\.href = "practice\.html\?unit=" \+ encodeURIComponent\(u\); \}/.test(appU),
      "Assignment complete: Tab and Shift+Tab stay inside, focus can't leave, Esc goes to Back to units (home page) and gives focus back; Go to this unit opens that unit; with no majority there's only Back to units");
    check(/\.modal-stats \{ margin: 0; padding-left: 1\.25rem;/.test(cssU) && !/#[0-9a-f]{3,6}\b|rgb/i.test(rule(".modal-stats")) &&
      /width: 100%; max-width: 28rem;/.test(rule(".modal")) && /class="modal|"modal-backdrop"/.test(appU) && /openDialog\(doc, \{\s*id: "assignment-done"/.test(appU) && /openDialog\(doc, \{\s*id: "secured"/.test(appU),
      "Assignment complete: the same dialog code and styles as the 100% pop-up (fits at 390px, theme colours only)");
  }

  // ===================== "Show me how": greyed until two wrong attempts, with a tooltip =====================
  {
    const appS = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    const cssS = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
    const t = tasks.find((x) => x.id === "maths-L9b");
    const s = App.freshUnitState(5);
    const state = (o) => App.showHowState(Object.assign({ placement: false, hasExample: true, passed: false, assignment: false, available: App.showHowAvailable(s, t) }, o));
    const before = state({});
    App.noteFailedAttempt(s, t);
    const afterOne = state({});
    App.noteFailedAttempt(s, t);
    const afterTwo = state({});
    check(before === "greyed" && afterOne === "greyed" && state({ assignment: true, available: false }) === "active" && state({ placement: true }) === "hidden" &&
      state({ hasExample: false }) === "hidden" && /'<span class="tip-wrap" hidden><button type="button" id="show-how-btn" class="secondary">Show me how<\/button>'/.test(appS) &&
      /howBtn\.parentElement\.hidden = howState === "hidden";/.test(appS),
      "Show me how: the button is visible (greyed) from the start of a practice or endless task, before any failure; active from the start in an assignment; still no button in a placement");
    check(afterTwo === "active" && App.SHOW_HOW_AFTER_FAILS === 2 && s.failedAttempts[App.fingerprintOf(t)] === 2,
      "Show me how: it becomes active after two failed checks on the task (the same count as before)");
    check(state({ passed: true, available: false }) === "greyed" && state({ passed: true, available: true }) === "hidden",
      "Show me how: a pass leaves a greyed button greyed (an active one is hidden after a pass, as before)");
    check(App.SHOW_HOW_TIP === "Available after two wrong attempts" &&
      /'<span id="show-how-tip" class="tooltip" role="tooltip" hidden>' \+ esc\(SHOW_HOW_TIP\) \+ "<\/span><\/span>"/.test(appS) &&
      /if \(greyed\) howBtn\.setAttribute\("aria-describedby", "show-how-tip"\);/.test(appS) && /\$\("show-how-tip"\)\.hidden = !greyed;/.test(appS),
      "Show me how: the tooltip says exactly \"Available after two wrong attempts\", and is the greyed button's accessible description (its name stays Show me how)");

    // The real click code (wireShowHow and showHow) on a tiny fake page.
    const wireSrc = appS.slice(appS.indexOf("  let tipTimer = null;"), appS.indexOf("  function showHow() {"));
    const howSrc = appS.slice(appS.indexOf("  function showHow() {"), appS.indexOf("  function renderShowHow() {"));
    const classes = new Set();
    const listeners = {};
    const wrap = { classList: { add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)) }, addEventListener: (k, f) => { listeners["wrap:" + k] = f; } };
    const attrs = { "aria-disabled": "true" };
    const btn = { parentElement: wrap, getAttribute: (k) => attrs[k], addEventListener: (k, f) => { listeners[k] = f; }, getBoundingClientRect: () => ({ left: 300 }) };
    const tip = { hidden: false, style: {}, offsetWidth: 250 };
    const logged = [];
    const c = { showHow: 0, attempts: 2, hints: 0 };
    const make = new Function("$", "tipLeft", "document", "setTimeout", "clearTimeout", "cur", "task", "workedExampleFor", "eachLog", "unitsOf", "Store", "attemptRecord",
      "inAssignment", "assignmentId", "endless", "levelIn", "student", "save", "renderShowHow", "renderButtons",
      wireSrc + howSrc + "\nreturn { wireShowHow, placeTip };");
    const fns = make((id) => ({ "show-how-btn": btn, "show-how-tip": tip, "show-how": { focus() {} } })[id], App.tipLeft, { documentElement: { clientWidth: 390 } },
      () => 0, () => {}, () => c, () => t, () => ({ problem: "p" }), () => {}, () => ["maths"], { logAttempt: (id, r) => logged.push(r) }, (r) => r,
      false, null, false, () => 5, { id: "s1" }, () => {}, () => {}, () => {});
    fns.wireShowHow();
    listeners.click();
    const greyedClick = { logged: logged.length, showHow: c.showHow, tipOpen: classes.has("tip-open"), tipLeft: tip.style.left };
    listeners.keydown({ key: "Escape" });
    const escHides = classes.has("tip-hide");
    attrs["aria-disabled"] = "false";
    listeners.click();
    check(greyedClick.logged === 0 && greyedClick.showHow === 0 && greyedClick.tipOpen && escHides && logged.length === 1 && c.showHow === 1 && logged[0].hintType === "show-me-how",
      "Show me how: a click on the greyed button does nothing but show the tooltip (a tap on a phone; Esc hides it); once active, a click shows the worked example as before");
    // Keyboard: a real <button>, never disabled while greyed (only aria-disabled), and the tooltip shows on focus.
    check(/howBtn\.disabled = busy && !greyed;/.test(appS) && !/id="show-how-btn"[^>]*tabindex/.test(appS) && /\.tip-wrap:focus-within \.tooltip/.test(cssS) &&
      /\.tip-wrap:hover \.tooltip/.test(cssS) && /\.tip-wrap\.tip-open \.tooltip/.test(cssS) && /button\[aria-disabled="true"\] \{ color: var\(--muted\); background: var\(--code-bg\); border-color: var\(--border\); border-style: dashed; cursor: not-allowed; \}/.test(cssS) &&
      !/button\[aria-disabled="true"\][^{]*\{[^}]*opacity/.test(cssS) &&
      /btn\.addEventListener\("focus", placeTip\)/.test(appS),
      "Show me how: the greyed button can be reached with Tab (aria-disabled, not disabled) and its tooltip shows on keyboard focus, on hover and on a tap");
    // At 390px: the tooltip is at most the screen's width less 2rem, and placeTip keeps it inside the screen.
    const fits = (left, w, vw) => { const x = left + App.tipLeft(left, w, vw); return x >= 8 && x + w <= vw - 8; };
    const tipRule = cssS.slice(cssS.indexOf(".tooltip {"), cssS.indexOf("}", cssS.indexOf(".tooltip {")));
    check(/max-width: min\(18rem, calc\(100vw - 2rem\)\)/.test(tipRule) && /white-space: normal/.test(tipRule) && /background: var\(--text\); color: var\(--bg\)/.test(tipRule) &&
      [16, 120, 200, 300, 360].every((left) => fits(left, 250, 390)) && greyedClick.tipLeft === "-168px" && App.tipLeft(16, 250, 390) === 0,
      "Show me how: at 390px the tooltip fits on screen wherever the button is (it wraps, and moves left near the right edge), in theme colours");
  }

  // ===================== Failed tests: input, expected output and the student's output =====================
  // What app.js check() does: one run of every test (runPython here, the worker there), passes worked out from it,
  // then TaskView.testResultsHtml from those same results.
  {
    const TV = require(path.join(ROOT, "task-view.js"));
    const passesOf = (t, results) => results.map((r, i) => !r.error && !r.notRun && Checker.outputsMatch(r.output, t.tests[i].expected));
    const checkOnce = (t, code) => { const results = runPython(t.tests.map((x) => ({ code, inputs: x.inputs }))); return { results, passes: passesOf(t, results), html: TV.testResultsHtml(t, results, passesOf(t, results)) }; };
    const items = (html) => html.split("<li ").slice(1);
    const escT = TV.esc;
    // A wrong answer that passes the example (it prints the example's output whatever the input) and fails the rest.
    const wt = tasks.find((x) => x.type === "write" && x.tests.length >= 3 && x.tests[0].inputs.length && !/random/.test(x.solution) &&
      x.tests.every((y) => y.inputs.every((v) => v !== "")) &&
      new Set(x.tests.map((y) => Checker.normalise(y.expected))).size === x.tests.length && !Checker.normalise(x.tests[0].expected).includes("\\"));
    const hardCoded = "print(" + JSON.stringify(Checker.normalise(wt.tests[0].expected)) + ")";
    const wrong = checkOnce(wt, hardCoded);
    const rows = items(wrong.html);
    const failedRows = rows.filter((r) => r.startsWith('class="fail"'));
    const detailsRight = wt.tests.slice(1).every((test, k) => {
      const row = failedRows[k] || "";
      return row.includes("Hidden test " + (k + 1) + " didn't pass") && row.includes("<dt>Input</dt><dd>" + escT(test.inputs.join(", then ")) + "</dd>") &&
        row.includes("<dt>Expected</dt><dd><pre>" + escT(Checker.normalise(test.expected)) + "</pre></dd>") &&
        row.includes("<dt>Your output</dt><dd><pre>" + escT(Checker.normalise(wt.tests[0].expected)) + "</pre></dd>");
    });
    check(wrong.passes[0] && !wrong.passes.slice(1).some(Boolean) && failedRows.length === wt.tests.length - 1 && detailsRight,
      "A wrong answer shows each failed test (hidden ones too) with its input, the expected output and the student's actual output (" + wt.id + ")");
    const passedRow = rows[0];
    check(passedRow.startsWith('class="pass"') && !/io-lines|<pre>|Expected/.test(passedRow) && (wrong.html.match(/class="io-lines"/g) || []).length === wt.tests.length - 1 &&
      items(checkOnce(wt, wt.solution).html).every((r) => r.startsWith('class="pass"') && !/io-lines|<pre>/.test(r)),
      "A passed test is one line with no input, expected or actual output, so the full set of tests stays hidden");
    // An error: the output so far, then Python's error line, then the explanation box.
    const errT = { type: "write", tests: [{ inputs: ["4"], expected: "2.5" }, { inputs: ["0"], expected: "Cannot divide by 0" }] };
    const errRun = checkOnce(errT, 'n = int(input("Number: "))\nprint("Working")\nprint(10 / n)');
    const errRow = items(errRun.html)[1] || "";
    check(errRun.passes.join() === "false,false" && /ZeroDivisionError: division by zero \(line 3\)<\/span><\/pre>/.test(errRow) && /<pre>Working\n<span class="error-line">/.test(errRow) &&
      errRow.includes("<dt>Input</dt><dd>0</dd>") && errRow.includes("<dt>Expected</dt><dd><pre>Cannot divide by 0</pre>") && /class="error-box"/.test(errRow) &&
      TV.errorText({ type: "Timeout" }) === "Stopped: it ran for too long." &&
      /Not run: an earlier test was stopped/.test(TV.testResultsHtml(errT, [{ output: "", error: { type: "Timeout" } }, { output: "", error: null, notRun: true }], [false, false])),
      "An error shows as the test's output: what was printed, then the error text (ZeroDivisionError: division by zero (line 3)), then the explanation");
    // From the first check: nothing depends on how many attempts have been made, and the details come from that run.
    const appF = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    const checkSrc = appF.slice(appF.indexOf("  async function check() {"), appF.indexOf("  function renderResults("));
    const renderSrc = appF.slice(appF.indexOf("  function renderResults("), appF.indexOf("  // ---------- Fill in the blanks"));
    const tvSrc = fs.readFileSync(path.join(ROOT, "task-view.js"), "utf8");
    const tvFn = tvSrc.slice(tvSrc.indexOf("function testResultsHtml("), tvSrc.indexOf("// ---------- Task browser search"));
    check((checkSrc.match(/runner\.run\(/g) || []).length === 1 && /renderResults\(results, passes, extraProblem, allPass, failure, tryAgain\);/.test(checkSrc) &&
      !/attempts|runner/.test(renderSrc + tvFn) && /TaskView\.testResultsHtml\(t, results, passes\)/.test(renderSrc) && items(wrong.html).filter((r) => /io-lines/.test(r)).length > 0,
      "The details show on the first check (they don't depend on the attempt count) and come from that check's own run: the code runs once per check");
    // Random: a program using random is seeded from each test's own inputs, so the row shows exactly what that run used.
    const rt = tasks.find((x) => x.type === "write" && /import random/.test(x.solution) && x.tests.length >= 2 && x.tests[0].inputs.length);
    const randomWrong = checkOnce(rt, rt.solution + '\nprint("extra")');
    const solo = runPython(rt.tests.map((x) => ({ code: rt.solution, inputs: x.inputs })));
    check(rt && randomWrong.passes.every((p) => !p) && items(randomWrong.html).every((row, i) => row.includes("<dt>Input</dt><dd>" + escT(rt.tests[i].inputs.map((v) => (v === "" ? "(nothing – just Enter)" : v)).join(", then ")) + "</dd>") &&
      row.includes("<dt>Your output</dt><dd><pre>" + escT(Checker.normalise(solo[i].output.replace(/\n?$/, "\n") + "extra")) + "</pre>")),
      "A program using random: each failed test shows the inputs that run was given and the numbers it actually printed (" + (rt && rt.id) + ")");
    // The recursion check and the Parsons "line not needed" check: every test passed, so there are no test rows.
    const rec8 = tasks.find((x) => x.id === "rec-L8a");
    const loopAnswer = "def power_loop(base, exp):\n    answer = 1\n    for i in range(exp):\n        answer = answer * base\n    return answer\n\n" +
      "def power_rec(base, exp):\n    return power_loop(base, exp)\n\nb = int(input(\"Base: \"))\ne = int(input(\"Power: \"))\nprint(power_loop(b, e), power_rec(b, e))";
    const recRun = checkOnce(rec8, loopAnswer);
    const recFail = Checker.classifyAttempt({ type: "write", code: loopAnswer, results: recRun.results, tests: rec8.tests, passes: recRun.passes, recursion: Checker.recursionProblem(rec8, loopAnswer).name });
    const pt = tasks.find((x) => x.type === "parsons" && x.distractors && x.distractors.length);
    const pRun = checkOnce(pt, pt.solution);
    const pFail = Checker.classifyAttempt({ type: "parsons", code: pt.solution, results: pRun.results, tests: pt.tests, passes: pRun.passes, parsons: { usedDistractor: true, missing: false } });
    check(recRun.passes.every(Boolean) && recFail.details.recursion && !/io-lines|class="fail"/.test(recRun.html) &&
      pRun.passes.every(Boolean) && pFail.details.parsons && !/io-lines|class="fail"/.test(pRun.html) &&
      /needs to call itself/.test(Checker.failureParts(recFail).message) && /line that isn't needed/.test(Checker.failureParts(pFail).message),
      "The recursion check and the Parsons \"line not needed\" check show their own message and no test rows (every test passed)");
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
