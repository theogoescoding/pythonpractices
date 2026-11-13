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
    check(Curriculum.UNITS.map((u) => u.id).join() === "output,variables,data-types,maths,selection,loops-condition,loops-count,strings,random,lists,functions-basic,functions-return,file-handling,arrays-2d,validation,authentication,trace-tables,linear-search,binary-search,bubble-sort,insertion-sort,merge-sort,recursion,scope-parameters,oop-classes,oop-methods,oop-encapsulation,oop-inheritance,debugging,records-tuples,stacks-queues,linked-lists,hash-tables,arrays-3d",
      "Unit order: Output, Variables, Data types, Maths, Selection, the two loops units, Strings, Random, Lists, the two functions units, File handling, 2D arrays, Validation, Authentication, Trace tables, Linear search, Binary search, Bubble sort, Insertion sort, Merge sort, then the seven A-level programming techniques units and the five A-level data structures units");
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
      G[2].units.join() === "validation,authentication,trace-tables" &&
      G[3].units.join() === "linear-search,binary-search,bubble-sort,insertion-sort,merge-sort",
      "Unit menu: fundamentals and advanced units as listed; the Validation group holds Validation, Authentication and Trace tables; Searching and sorting holds its five units");
    const collapseSrc = read("collapse.js");
    check(/aria-expanded/.test(collapseSrc) && /try \{[^}]*localStorage\.getItem\(key/.test(collapseSrc) && /try \{[^}]*localStorage\.setItem\(key/.test(collapseSrc) &&
      /Collapse\.buttonHtml\(/.test(homeSrc) && /Collapse\.wire\(\$\("unit-list"\), COLLAPSED_KEY\)/.test(homeSrc) && !/localStorage/.test(homeSrc) &&
      /<script src="collapse\.js"><\/script>\s*<script src="home\.js">/.test(app),
      "Unit menu: each group heading is a button that opens and closes it, remembered on this device (collapse.js; storage errors are caught)");

    // The teacher view's sections use the same component, with their own storage key, all starting expanded.
    const teacher = read("teacher.html");
    const teacherSrc = read("teacher.js");
    const sections = [...teacher.matchAll(/<section class="[^"]*teacher-section[^"]*" data-collapse="([^"]+)"(?: data-collapse-default="closed")?>\s*<h3>([^<]+)<\/h3>/g)].map((m) => m[2]);
    check(sections.join() === "Name and stage,Student logins,Delete this class,Secured score per unit,Exports,Compare classes,Misconception table,Failed attempts with no match, by task,Not matched yet",
      "Teacher view: every section (class name and stage, student logins, delete class, the score table, exports, compare classes, and the Misconceptions page's table, unmatched attempts and not-matched-yet list) is collapsible");
    const key = (teacherSrc.match(/Collapse\.enhance\(document\.querySelector\("main"\), "([^"]+)"\)/) || [])[1];
    check(key && key !== "pythonPractice.collapsedGroups" && /<script src="collapse\.js"><\/script>\s*<script src="teacher\.js">/.test(teacher) && !/localStorage\./.test(teacherSrc),
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
      (teacher.match(/data-collapse-default="closed"/g) || []).length === 3 &&
      ["ws-misconceptions", "ws-unmatched", "ws-unseen"].every((id) => new RegExp('data-collapse="' + id + '" data-collapse-default="closed"').test(teacher)),
      "Misconceptions page: the misconception table, unmatched attempts and not-matched-yet sections start collapsed, and each one's open or closed state is remembered in this browser");
    check(!/Haven't started a unit/.test(teacherSrc + teacher), "Teacher overview: the \"Haven't started a unit\" box is gone (the student table still shows Not started cells)");
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
      /up to three/.test(text("hints")) && maxHints === 3 && /not towards your freshness/.test(text("hints")) &&
      /After two failed tries/.test(text("show-how")) && App.SHOW_HOW_AFTER_FAILS === 2 && /doesn't count towards your freshness/.test(text("show-how")) &&
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
    check(withNew.reminders.map((r) => r.key).join() === "assignment:a2" && /new practice set: Lists/.test(withNew.reminders[0].text) && withNew.reminders[0].href === "practice.html?assignment=a2" &&
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
    check(!/tour\.js/.test(read("teacher.html")) && !Tour.allowed(win("/pythonpractices/teacher.html")) && !Tour.allowed(win("/practice.html", "?preview=var-L9d")) &&
      !Tour.allowed(win("/practice.html", "", true)) && Tour.allowed(win("/app.html")) && Tour.allowed(win("/practice.html", "?unit=maths")) &&
      /<script src="tour\.js"><\/script>\s*<script src="collapse\.js"><\/script>\s*<script src="home\.js">/.test(read("app.html")) && /<script src="app\.js"><\/script>\s*<script src="tour\.js"><\/script>/.test(read("practice.html")),
      "Tutorial: the student pages load it; the teacher pages don't, and it never runs in teacher practice or in a frame");

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
    const nav = [...teacher.matchAll(/<a href="#(\w+)" data-page="\w+">([^<]+)<\/a>/g)].map((m) => m[2]);
    check(nav.join() === "Classes,Students,Assignments,Reports,Misconceptions,Task browser,Settings" && !/tab-nav/.test(teacher) &&
      ["classes", "students", "student", "assignments", "reports", "misconceptions", "tasks", "settings"].every((p) => teacher.includes('id="page-' + p + '"')) &&
      /\["students", null\]/.test(teacherSrc) && /overview: "students", log: "reports", workshop: "misconceptions"/.test(teacherSrc) && /"#students"\)/.test(backendSrc),
      "Teacher view: a side menu (Classes, Students, Assignments, Reports, Misconceptions, Task browser, Settings) replaces the tabs; Students is the default page, and #overview, #log and #workshop still open Students, Reports or Misconceptions");

    // The Misconceptions page (the workshop, moved from Reports).
    const pageOf = (id) => { const i = teacher.indexOf('<section id="page-' + id + '"'); return teacher.slice(i, teacher.indexOf("<!-- =====", i + 10)); };
    const mcPage = pageOf("misconceptions"), reportsPage = pageOf("reports");
    check(/<a href="#reports" data-page="reports">Reports<\/a>\s*<a href="#misconceptions" data-page="misconceptions">Misconceptions<\/a>\s*<a href="#tasks"/.test(teacher) &&
      /const PAGES = \[[^\]]*"reports", "misconceptions", "tasks"/.test(teacherSrc) && /else if \(p === "misconceptions"\) renderMisconceptions\(data\);/.test(teacherSrc),
      "Misconceptions: its own side menu item, between Reports and Task browser (#misconceptions)");
    // The old address: route() maps #workshop to the new page (run on its own).
    const routeSrc = teacherSrc.slice(teacherSrc.indexOf("const route = () =>"), teacherSrc.indexOf("const page = () =>"));
    const routeFor = (hash) => new Function("location", "PAGES", "OLD_PAGES", routeSrc + "; return route();")({ hash },
      JSON.parse(teacherSrc.match(/const PAGES = (\[[^\]]*\])/)[1]), { overview: "students", log: "reports", workshop: "misconceptions" });
    check(routeFor("#workshop")[0] === "misconceptions" && routeFor("#misconceptions")[0] === "misconceptions" && routeFor("#log")[0] === "reports" && routeFor("#nothing")[0] === "students",
      "Misconceptions: the old workshop address (#workshop) opens the new page; #log still opens Reports");
    check(/if \(mcUnit !== "all" && !unitIds\.includes\(mcUnit\)\) mcUnit = unitIds\[0\];/.test(teacherSrc) && /const stageUnitIds = \(\) => self\.Curriculum\.stageUnits\(stage\(\)\);/.test(teacherSrc) &&
      /function renderMisconceptions\(data\) \{\s*const unitIds = stageUnitIds\(\);/.test(teacherSrc) && /<option value="all">All units<\/option>/.test(teacherSrc) &&
      ["ks3", "gcse", "a-level"].every((st) => Curriculum.stageUnits(st).length > 0) && /<select id="mc-unit">/.test(mcPage),
      "Misconceptions: the unit picker lists the class's stage's units and starts at the first one (then All units, the old class-wide list)");
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
      !/id="(ws-|quick-look|mc-)/.test(reportsPage) && /<a href="#misconceptions">Misconceptions<\/a>/.test(reportsPage) && reportsPage.includes('id="export-workshop"') &&
      /data-unmatched="' \+ esc\(t\.taskId\) \+ '">View ' \+ t\.unmatched/.test(mcSrc) && /\$\("ws-tasks"\)\.addEventListener\("click"/.test(teacherSrc) &&
      /<th scope="col">Students<\/th>/.test(mcPage) && /m\.studentNames\.join\(", "\)/.test(mcSrc) && /unseen\.map\(\(m\) => "<li>" \+ esc\(m\.name\)/.test(mcSrc),
      "Misconceptions: the misconception table (with its Students column), the unmatched table with View, and the not-matched-yet list are on the new page; Reports keeps the workshop export and links to it");
    const wsExport = teacherSrc.slice(teacherSrc.indexOf('$("export-workshop").addEventListener'), teacherSrc.indexOf('$("export-workshop").addEventListener') + 1200);
    const wsOut = TD.workshop(mcData, [{ id: "M1", name: "Mistake one" }], {});
    check(/TD\.workshop\(data, misconceptions, tasksById\)/.test(wsExport) && /python-practice-workshop-/.test(wsExport) &&
      wsOut.misconceptions.length === 1 && wsOut.misconceptions[0].name === "Mistake one" && wsOut.tasks.some((t) => t.taskId === "if-L6a" && t.unmatched === 2),
      "Reports: the Workshop tables (CSV) export still builds the misconception and unmatched tables");

    // The secured score: worked examples (one place, secured.js).
    const D = Date.parse("2026-01-05T09:00:00Z"), W = Secured.WEEK_MS, H = 3600000;
    const pass = (t, extra) => Object.assign({ kind: "attempt", result: "pass", hints: 0, unit: "selection", phase: "practice", taskLevel: 10, at: new Date(t).toISOString() }, extra || {});
    const two = [pass(D), pass(D + H)];
    const s = (list, at) => Secured.score(list, "selection", at);
    const back = two.concat([pass(D + H + 2 * W + 60000)]);
    // Back to 100% four more times, each after four weeks away: the floor goes 50, 60, 70, 80, 90, then stops at 95.
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
      s(many, D + 80 * W).floor === 95 && s(many, D + 80 * W).score === 95 && s(many, D + 80 * W).timesAt100 === 7,
      "Secured score: the floor is 50% at first, 60% after coming back once, and never more than 95%");
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
    const labels = [100, 95, 90, 80, 75, 50].map((x) => Secured.band(x).label + ":" + Secured.band(x).cls).join();
    const cssAll = read("styles.css");
    const token = (name) => ((cssAll.match(new RegExp("--" + name + ":\\s*(#[0-9a-fA-F]{6})")) || [])[1] || "").toLowerCase();
    check(labels === "Secured:gold,Fresh:fresh,Fading:fading,Fading:fading,Revisit soon:soon,Revisit soon:soon" &&
      ["gold", "fresh", "fading", "soon"].every((c) => cssAll.includes(".rag-" + c + " ")) && /rag-gold \{[^}]*box-shadow/.test(cssAll) &&
      token("rag-gold") === "#ffd34d" && token("rag-fresh") === "#a9d6ff" && token("rag-fading") === "#1f63c6" && token("rag-soon") === "#3f2f9e",
      "Freshness ramp: gold (glowing) 100% Secured, light blue 95% Fresh, blue 80–90% Fading, indigo 50–75% Revisit soon, each with its label");
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
      /<script src="secured\.js"><\/script>\s*<script src="teacher-data\.js">/.test(teacher) && /<script src="secured\.js"><\/script>/.test(read("app.html")),
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
      !/Too easy used<\/span>|Too hard used<\/span>/.test(teacherSrc + teacher) && /badge-complete/.test(teacherSrc) && /Placement: started at/.test(teacherSrc) &&
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
    check(/rag-none[^<]*>grey: Not placed yet</.test(teacher) && /--rag-none:/.test(read("styles.css")) && /NOT_PLACED = '<span class="rag rag-none">Not placed yet<\/span>'/.test(teacherSrc),
      "Colour key: grey means Not placed yet");

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
    check(TD.SUMMARY_TILES.map((t) => t.key + "/" + t.cls + "/" + t.label).join("|") === "fresh/fresh/Fresh (80%+)|soon/soon/Revisit soon|" +
      "lv-red/lv-red/Levels 1 to 3: still learning|lv-amber/lv-amber/Levels 4 to 6: still learning|lv-green/lv-green/Levels 7 to 9: still learning|" +
      "lv-top/lv-top/Level 10: not secured yet|none/none/Not placed yet" && TD.SUMMARY_TILES.every((t) => t.note && t.note.length > 10) &&
      ["Ava:fresh", "Ben:soon", "Cal:lv-red", "Eve:lv-amber", "Fay:lv-green", "Gil:lv-top", "Nia:none", "Max:none"].every((x) => tileOf(x.split(":")[0]) === x.split(":")[1]),
      "Summary tiles: Fresh (80%+) light blue, Revisit soon indigo, then (nothing secured yet) a tile per average level band in its level colour, and Not placed yet grey, each label saying what it counts");
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
      /TD\.SUMMARY_TILES\.map\(\(t\) => '<div class="rag-tile rag-tile-' \+ t\.cls \+ '"><span class="rag rag-' \+ t\.cls \+ '">' \+ esc\(t\.label\)/.test(teacherSrc) &&
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
    check(uc({ secured: true, score: 100 }).cls === "gold" && uc({ secured: true, score: 100 }).label === "100% · Secured" && uc({ secured: true, score: 95 }).label === "95% · Fresh" &&
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
    const ramps = (k) => ["rag-gold\">100% Secured", "rag-fresh\">95% Fresh", "rag-fading\">80–90% Fading", "rag-soon\">50–75% Revisit soon",
      "rag-lv-red\">Level 1–3", "rag-lv-amber\">Level 4–6", "rag-lv-green\">Level 7–9", "rag-lv-top\">Level 10"].every((x) => k.includes(x));
    check(ramps(studentKey) && ramps(teacherKey) && studentKey.includes('rag-placement">Placement to do') && teacherKey.includes('rag-none">grey: Not placed yet'),
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
      /Di,not placed yet,,not placed yet,Not placed yet,3/.test(csv) && /Bo,not secured yet,amber,not secured yet,Level 6 \(not secured yet\),6/.test(csv) && !/,0,red,0,/.test(csv),
      "Reports: the class scores export has each student's average and each unit's secured score, label and level (Not placed yet for a unit still to be placed, the level for one not secured yet, never 0)");
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
