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
      src.every(([, t]) => !/(?:get|has)\("test"\)|[?&]test=1|testMode/.test(t)) && paramsRead.join() === "assignment,mode,preview,section,unit,units" &&
      studentPages.every((p) => !/test-panel|test-set|test-complete|test-level|test-unit|Test mode/.test(read(p))) &&
      !/reason: "test-mode/.test(read("home.js")) && !/completedTop: true/.test(read("home.js")) && !/saveProgress/.test(read("home.js")) && !/\.test-panel/.test(read("styles.css")),
      "Student pages: ?test=1 does nothing (no script reads a test flag, so no level is set, no unit is marked completed and no test controls are shown); the address is only read for preview, assignment, mode, unit, units and section");
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
      /skills secured\. " \+ x\.note \+ " Show skills\./.test(progSrc) && !/DROP_PER_WEEK|WEEK_MS|FLOOR_/.test(progSrc) &&
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
    check(TD.SUMMARY_TILES.length === 9 && TD.SUMMARY_TILES.map((t) => t.key + "/" + t.cls + "/" + t.label).join("|") ===
      "gold/gold/Secured (100%)|fresh/fresh/Fresh (90%)|fading/fading/Fading (80%)|soon/soon/Revisit soon (under 80%)|" +
      "lv-red/lv-red/Levels 1 to 3: still learning|lv-amber/lv-amber/Levels 4 to 6: still learning|lv-green/lv-green/Levels 7 to 9: still learning|" +
      "lv-top/lv-top/Level 10: not secured yet|none/none/Not placed yet" && TD.SUMMARY_TILES.every((t) => t.note && t.note.length > 10) &&
      ["Ava:gold", "Ben:soon", "Cal:lv-red", "Eve:lv-amber", "Fay:lv-green", "Gil:lv-top", "Nia:none", "Max:none"].every((x) => tileOf(x.split(":")[0]) === x.split(":")[1]),
      "Summary tiles: nine, in order (Secured gold, Fresh light blue, Fading blue, Revisit soon indigo, the four level bands in their level colours, Not placed yet grey), each label saying what it counts");
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
    check(/\.rag-tiles \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/.test(cssAll) && /\.rag-tile \{ min-width: 0; overflow-wrap: anywhere;/.test(cssAll) &&
      TD.SUMMARY_TILES.every((t) => new RegExp("\\.rag-tile-" + t.cls + " \\{ border-left: 10px solid var\\(--").test(cssAll) && new RegExp("\\.rag-" + t.cls + " \\{[^}]*background: var\\(--").test(cssAll)),
      "Summary tiles: a three-by-three grid whose tiles shrink to fit (no sideways scrolling on a phone), and every tile has its colour (edge and label chip)");
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
      /TD\.SUMMARY_TILES\.map\(\(t\) => '<div class="rag-tile rag-tile-' \+ t\.cls \+ '" title="' \+ esc\(t\.label \+ ": " \+ t\.note\) \+ '"><span class="rag rag-' \+ t\.cls \+ '">' \+ esc\(t\.label\)/.test(teacherSrc) &&
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
      { category: "WRONG_CHOICE", details: {} },
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
      /cm\.on\("change", \(\) => \{ c\.draft\.code = cm\.getValue\(\); save\(\); \}\)/.test(appC) &&
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
    const tablesL = html.split('<div class="table-wrap overview-wrap">').slice(1);
    const groupsL = TD.overviewGroups(gcse, Curriculum.UNIT_GROUPS);
    const everyTwo = tablesL.every((t) => {
      const bodies = t.split('<tbody class="ov-student">').slice(1);
      return bodies.length === 4 && bodies.every((b) => (b.match(/<tr /g) || []).length === 2 && /^<tr class="ov-fresh"><th scope="rowgroup" rowspan="2" class="ov-name">/.test(b) &&
        /<th scope="row" class="ov-shows">Freshness<\/th>[\s\S]*<tr class="ov-level"><th scope="row" class="ov-shows">Level<\/th>/.test(b));
    });
    check(tablesL.length === groupsL.length && everyTwo && groupsL.reduce((n, g) => n + g.units.length, 0) === gcse.length &&
      groupsL.every((g) => g.units.length <= TD.OVERVIEW_MAX_UNITS) && TD.OVERVIEW_MAX_UNITS === 5 &&
      JSON.stringify(groupsL.map((g) => g.units.length)) === "[4,3,4,3,3,5]" && groupsL[1].title === "Programming fundamentals (continued)",
      "Students page: every student has two rows in every table (Freshness, then Level, the name merged across both), and every unit is in one table of at most 5 units");
    // The same text and colours as the single cell before, split between the rows: a frozen copy of the old cell code.
    const escO = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const bandO = (c) => (c.band ? '<span class="rag rag-' + c.band.cls + '">' + c.score + "% · " + escO(c.band.label) + "</span>"
      : c.levelBand ? '<span class="rag rag-' + c.levelBand.cls + '">' + escO(c.levelBand.label) + "</span>" : "");
    const NP = '<span class="rag rag-none">Not placed yet</span>';
    const oldCell = (c) => {
      if (!c.started) return '<span class="small">Not started</span>';
      const placement = c.placementStatus === "done" ? "Placement: started at " + c.placementStart : "Placement: " + TD.PLACEMENT_STATUS[c.placementStatus];
      return (c.placed ? bandO(c) + (c.secured ? "" : '<br><span class="small">Not secured yet</span>') : NP) +
        (c.secured || !c.placed ? '<br><span class="lvl">Level ' + c.level + "</span>" : "") +
        (c.complete ? ' <span class="badge-complete" title="Passed a level 10 task">★ Complete</span>' : "") +
        '<br><span class="small">' + escO(placement) + "</span>" + (c.tooEasy || c.tooHard ? "<br>" + flagsFn(c) : "");
    };
    const oldAvg = (r) => (r.band ? '<span class="rag rag-' + r.band.cls + '">' + r.average + "% · " + escO(r.band.label) + "</span>"
      : r.levelBand ? '<span class="rag rag-' + r.levelBand.cls + '">Average ' + escO(r.levelBand.label.toLowerCase()) + '</span><br><span class="small">No unit secured yet</span>' : NP);
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
      const levelRight = !c.started || (c.placed && !c.secured ? now.level.startsWith('<span class="rag rag-' + c.levelBand.cls + '">' + c.levelBand.label) : now.level.startsWith('<span class="lvl">Level ' + c.level));
      return words(both) === words(old) &&
        JSON.stringify(pieces(both).filter((p) => p.startsWith("<"))) === JSON.stringify(pieces(old).filter((p) => p.startsWith("<"))) && freshRight && levelRight;
    });
    const sameAvg = ovTable.rows.every((r) => { const a = TD.overviewAverage(r); return words(a.fresh + a.level) === words(oldAvg(r)) &&
      JSON.stringify(pieces(a.fresh + a.level).filter((p) => p.startsWith("<"))) === JSON.stringify(pieces(oldAvg(r)).filter((p) => p.startsWith("<"))); });
    check(sameCells && sameAvg && Object.values(kinds).every((n) => n > 0) && ovTable.rows.some((r) => r.band) && ovTable.rows.some((r) => !r.band && r.levelBand) && ovTable.rows.some((r) => !r.band && !r.levelBand),
      "Students page: the Freshness row and the Level row together show exactly the old cell's text and colours (band chip in Freshness, level chip, placement, ★ Complete and flags in Level), for every kind of cell and average");
    // No sideways scrolling: each table is table-layout: fixed at the full width, Name, Shows and Average have fixed
    // widths and the (at most 5) unit columns share the rest. Below 850px of table width the rows become tiles.
    const remOf = (sel) => +((/width: ([\d.]+)rem/.exec(rule(".overview-table " + sel)) || [])[1]);
    const fixedPx = 16 * (remOf(".ov-col-name") + remOf(".ov-col-shows") + remOf(".ov-col-avg"));
    const wrapPx = (vw) => Math.min(vw, 1200) - 32; // .wrap: max-width 1200px, 1rem padding each side
    const tableAt = (vw) => wrapPx(vw) - 16 * 12 - 20 - 4; // beside the 12rem side menu (1.25rem gap), inside the 2px border
    const unitPx = (tableAt(1280) - fixedPx) / TD.OVERVIEW_MAX_UNITS;
    const tile = /grid-template-columns: repeat\(auto-fill, minmax\(([\d.]+)rem, 1fr\)\)/.exec(cssL.slice(cssL.indexOf("@container (max-width: 849px)")));
    check(/table-layout: fixed; width: 100%;/.test(rule(".overview-table")) && fixedPx > 0 && unitPx >= 112 && tableAt(1280) >= 850 &&
      /container-type: inline-size/.test(rule(".overview-tables")) && tile && 16 * +tile[1] <= wrapPx(390) - 4 && /td\[data-label\]::before \{ content: attr\(data-label\)/.test(cssL) &&
      /overflow-wrap: anywhere/.test(rule(".overview-table th, .overview-table td")) && !/\.unit-cell \{ white-space: nowrap; \}/.test(cssL) &&
      !/id="overview-table"|id="overview-head"|id="overview-rows"/.test(fs.readFileSync(path.join(ROOT, "teacher.html"), "utf8")),
      "Students page: no table needs sideways scrolling: at 1280px every unit column is " + Math.floor(unitPx) + "px (fixed layout, long names wrap); at 390px each student's rows are tiles of " + tile[1] + "rem");
    const tJs = fs.readFileSync(path.join(ROOT, "teacher.js"), "utf8");
    check(/\$\("overview-tables"\)\.innerHTML = TD\.overviewTablesHtml\(/.test(tJs) && /\$\("overview-tables"\)\.addEventListener\("click"/.test(tJs) &&
      /\$\("st-summary"\)\.innerHTML = TD\.SUMMARY_TILES\.map/.test(tJs) && /renderCodeCards\(\);/.test(tJs) && /python-practice-overview-/.test(tJs) &&
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
    check(nonDerived.length === 243 && nonDerived.every((t) => t.worked_example && t.worked_example.problem && t.worked_example.code && typeof t.worked_example.output === "string" && t.worked_example.key_idea) &&
      selVal.length === 32 && selVal.every((t) => t.worked_example),
      "Show me how: every non-derived template (243, including the 32 Selection and Validation ones) has its own worked example");
    check(nonDerived.every((t) => t.worked_example.skill === keyOf(t).split(":")[1] && keyOf(t).startsWith(W.templateUnit(t) + ":")) &&
      moved.length === 100 && moved.every((t) => JSON.stringify(t.worked_example) !== JSON.stringify(byIdW[t.source].worked_example)) &&
      moved.some((t) => t.id === "sel-t8" && keyOf(t) === "selection:modulo-conditions") && moved.some((t) => t.id === "comb-val-auth-pin" && keyOf(t) === "validation:type-check"),
      "Show me how: the 100 templates that showed another topic's example now use the key their own unit, type and skills give (e.g. sel-t8: selection:modulo-conditions)");
    check(kept.length === 143 && kept.every((t) => JSON.stringify(t.worked_example) === JSON.stringify(byIdW[t.source].worked_example)),
      "Show me how: the 143 templates whose example already fitted keep exactly the same example");
    check(derived.length === 1191 && derived.every((t) => !("worked_example" in t) && byIdW[t.source].worked_example && W.exampleKey(byIdW[t.source]) === W.exampleKey({ unit: t.units[0], type: t.type, skills: t.skills })),
      "Show me how: derived templates (1191) are unchanged: no example of their own, so their variants use their source task's, which has the same unit, type and skills");
    const combined = nonDerived.filter((t) => t.units.length > 1);
    check(combined.length === 115 && combined.every((t) => W.templateUnit(t) === App.unitOfSkill(t.skills[0], t.units) && keyOf(t).startsWith(W.templateUnit(t) + ":")) &&
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
    check(variantsW === 972 && !sharedW && !sameW && freshW.every((r, i) => !r.error && Checker.normalise(r.output) === distinct[i].output),
      "Show me how: on 4 seeds of every non-derived template (972 variants), the example shares no 4+ character text with the variant, isn't its solution, and its stored output matches a fresh run (" + distinct.length + " examples)");
    // The tool: running it again changes nothing (tasks.json and templates.json).
    const againT = W.withTemplateExamples(tplW);
    const againK = W.withWorkedExamples(tasks);
    const appW = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
    check(!againT.missing.length && JSON.stringify(againT.templates) === JSON.stringify(tplW) && !againK.missing.length && JSON.stringify(againK.tasks) === JSON.stringify(tasks) &&
      /const tpl = t\.templateId && templateById\[t\.templateId\];\s*if \(tpl && tpl\.worked_example\) return tpl\.worked_example;/.test(appW),
      "Show me how: tools/add-worked-examples.js changes nothing when run again (tasks.json and templates.json), and a variant shows its template's example before its source task's");
  }

  // ===================== Validation sections =====================
  {
    const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
    const SecuredV = require(path.join(ROOT, "secured.js"));
    const tplV = JSON.parse(read("templates.json"));
    const byIdV = Object.fromEntries(tasks.map((t) => [t.id, t]));
    const secs = Curriculum.unitSections("validation");
    const LETTERS = { presence: "i", type: "t", range: "r", format: "f", length: "l" };
    const valTasks = tasks.filter((t) => t.unit === "validation");
    const valTpls = tplV.filter((t) => t.units.includes("validation"));
    const secOf = (t) => Curriculum.taskSection(t, "validation", byIdV);
    // 1. Every task and template maps to exactly one section; the ids match curriculum.js.
    const practiceV = valTasks.filter((t) => !App.isPlacementTask(t));
    check(secs.map((s) => s.id + ":" + s.name + ":" + s.title).join() === "i:presence:Presence,t:type:Type,r:range:Range,f:format:Format,l:length:Length" &&
      secs.every((s) => s.description && LETTERS[s.name] === s.id) && !("sections" in Curriculum.unitById("selection")) &&
      practiceV.length === 50 && practiceV.every((t) => secOf(t) === t.id.slice(-1) && secs.filter((s) => s.id === secOf(t)).length === 1) &&
      valTasks.filter(App.isPlacementTask).every((t) => secOf(t) === null) &&
      valTpls.length === 59 && valTpls.every((t) => secs.some((s) => s.id === secOf(t))) &&
      secOf(valTpls.find((t) => t.id === "comb-val-auth-pin")) === "t" && secOf(valTpls.find((t) => t.id === "comb-val-auth-function")) === "i" &&
      valTpls.filter((t) => byIdV[t.source] && byIdV[t.source].unit === "validation").every((t) => secOf(t) === t.source.slice(-1)) &&
      JSON.stringify(secs.map((s) => valTpls.filter((t) => secOf(t) === s.id).length)) === "[11,13,13,10,12]",
      "Validation sections: every practice task (by its id's letter) and all 59 templates (by their source task, or a combined one's check skill) map to exactly one of curriculum.js's five sections; placement tasks to none");
    // 2. Section practice picks only its own section's tasks, at the student's level (bank tasks first).
    let wrongBank = 0, emptyLevels = 0, wrongTpl = 0;
    for (const s of secs) {
      const pool = App.sectionPool(tasks, tplV, "validation", s.id);
      for (let lv = 1; lv <= 10; lv++) {
        const t = App.chooseTask(pool.tasks, "validation", lv, {}, null, rng, {});
        if (!t || t.level !== lv || secOf(t) !== s.id || App.isPlacementTask(t)) wrongBank++;
        if (!App.sectionHasLevel(pool, "validation", lv)) emptyLevels++;
        if (App.singleTemplates(pool.templates, "validation", lv).some((tpl) => secOf(tpl) !== s.id || tpl.level !== lv)) wrongTpl++;
      }
    }
    const appV = read("app.js");
    check(!wrongBank && !emptyLevels && !wrongTpl &&
      /if \(inSection\(\)\) \{\s*\/\/[^\n]*\n\s*return chooseNextTask\(Object\.assign\(choice, sectionPool\(tasks, templates, unitId, section\.id\), \{ unitId, state: s, last: sectionHolder\(\)\.last \|\| \{\} \}\)\);/.test(appV),
      "Validation sections: for each of the five sections at each level 1-10, practice picks only that section's bank task at the student's level, and only its templates (chooseNextTask, as normal practice)");
    // The same, through chooseNextTask itself once the bank task is passed (a variant), in a child process (it's async).
    const variantRun = require("child_process").execFileSync(process.execPath, ["-e", `
      const path = require("path"); const ROOT = ${JSON.stringify(ROOT)};
      const App = require(path.join(ROOT, "app.js")); const C = require(path.join(ROOT, "curriculum.js"));
      const tasks = require(path.join(ROOT, "tasks.json")); const tpls = require(path.join(ROOT, "templates.json"));
      const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
      let seed = 1; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const Templates = { randomSeed: (r) => Math.floor(r() * 1e9), signature: () => null };
      const realise = async (tpl, s) => ({ id: tpl.id + "#" + s, templateId: tpl.id, generated: true, fingerprint: tpl.id + "|" + s, unit: tpl.units[0], units: tpl.units, source: tpl.source, skills: tpl.skills, level: tpl.level, type: tpl.type });
      (async () => {
        const out = [];
        for (const s of C.unitSections("validation")) for (let lv = 1; lv <= 10; lv++) {
          const pool = App.sectionPool(tasks, tpls, "validation", s.id);
          const state = Object.assign(App.freshUnitState(lv), { placement: { status: "done", startLevel: lv } });
          const first = await App.chooseNextTask(Object.assign({ tasks, templates: tpls, Templates, realise, rand }, pool, { unitId: "validation", state, last: {} }));
          App.recordTaskResult(state, first, true, "2026-11-13T10:00:00Z");
          const next = await App.chooseNextTask(Object.assign({ tasks, templates: tpls, Templates, realise, rand }, pool, { unitId: "validation", state, last: { key: first.id } }));
          out.push([s.id, lv, first.id, !!first.generated, C.taskSection(first, "validation", byId), first.level, next && next.templateId, next && C.taskSection(next, "validation", byId), next && next.level].join("|"));
        }
        console.log(JSON.stringify(out));
      })();`], { encoding: "utf8" });
    const runs = JSON.parse(variantRun.trim()).map((r) => r.split("|"));
    check(runs.length === 50 && runs.every(([s, lv, , gen, s1, l1, tid, s2, l2]) => gen === "false" && s1 === s && l1 === lv && tid && s2 === s && l2 === lv),
      "Validation sections: chooseNextTask, given a section's pool, sets the section's bank task first and then a variant of that section's own template, at the same level (all five sections, all ten levels)");
    // 3. A section with nothing at the level says so, and sets no other task.
    const thin = App.sectionPool(tasks.filter((t) => !(t.unit === "validation" && t.level === 3)), tplV.filter((t) => t.level !== 3), "validation", "r");
    const serveSrc = appV.slice(appV.indexOf("  async function serveNewTask() {"), appV.indexOf("    holder().current = { taskId: t.id, task: t.generated ? t : null"));
    check(!App.sectionHasLevel(thin, "validation", 3) && App.chooseTask(thin.tasks, "validation", 3, {}, null, rng, {}) === null && App.singleTemplates(thin.templates, "validation", 3).length === 0 &&
      App.sectionNoTaskText("Range", 3, "Validation") === "There's no Range task at Level 3 right now. You can practise the whole Validation unit instead." &&
      /if \(inSection\(\) && !sectionHasLevel\(sectionPool\(tasks, templates, unitId, section\.id\), unitId, us\(\)\.level\)\) \{[\s\S]*sectionNoTaskText\(section\.title, us\(\)\.level, unit\.title\)[\s\S]*Practise the whole ' \+ esc\(unit\.title\) \+ " unit<\/a><\/p>";\s*return false;/.test(serveSrc),
      "Validation sections: a section with no task at the student's level says \"There's no Range task at Level 3 right now…\", offers the unit's normal practice, and sets no task from another section");
    // 4. A section pass: recorded as practice, but no change to the level, streaks, history or the secured score.
    const t10 = byIdV["val-L10r"];
    const st = Object.assign(App.freshUnitState(10), { placement: { status: "done", startLevel: 10 }, passStreak: 1, strongRun: 1 });
    const beforeLadder = JSON.stringify([st.level, st.passStreak, st.strongRun, st.failStreak, st.history, st.passedTop, st.completedTop, st.stats, st.ceiling]);
    App.finishSectionTask(st, t10, { passed: true, hints: 0, showHow: false, now: "2026-11-13T10:00:00Z", key: t10.id });
    const afterLadder = JSON.stringify([st.level, st.passStreak, st.strongRun, st.failStreak, st.history, st.passedTop, st.completedTop, st.stats, st.ceiling]);
    const rec = (days, o) => Object.assign(App.attemptRecord(Object.assign({ task: t10, unit: "validation", phase: "practice", kind: "attempt", attemptNumber: 1, hints: 0, result: "pass", levelBefore: 10, levelAfter: 10, section: "range" }, o || {})),
      { at: new Date(Date.UTC(2026, 10, 1 + days)).toISOString() });
    const secPasses = [rec(0), rec(1)];
    const finSrc = appV.slice(appV.indexOf("    if (inSection()) {\n      // Section practice: recorded"), appV.indexOf("    const outcome = { passed, hints: c.hints, skills: t.skills"));
    check(beforeLadder === afterLadder && st.passedFingerprints["val-L10r"] && st.log["val-L10r"].passes === 1 && st.skills.range && st.skills.range.passes === 1 &&
      secPasses.every((a) => a.phase === "practice" && a.hintType === "section-range" && !SecuredV.isTopPass(a, "validation")) && !SecuredV.score(secPasses, "validation").secured &&
      rec(2, { showHow: true }).hintType === "show-me-how" && rec(2, { section: null }).hintType === undefined &&
      /finishSectionTask\(us\(\), t, \{ passed, hints: c\.hints/.test(finSrc) && /save\(\);\s*renderSide\(\);\s*return \{\};/.test(finSrc) && !/applyOutcome|logLevelChange|passedTop/.test(finSrc) &&
      /const showLevelButtons = !endless && !inAssignment && !c\.placement && !inSection\(\);/.test(appV) && /section: !c\.placement && inSection\(\) \? section\.name : null,/.test(appV),
      "Validation sections: a section pass is a practice attempt and counts on My progress (passed task, log, skill), but never changes the level, streaks, history, ★ Level 10 or the secured score (hintType section-range); no level buttons there");
    // 5. The links: on the home card and on My progress, once placed; not on placement or assignments.
    const homeV = read("home.js");
    const linksFn = new Function("esc", homeV.slice(homeV.indexOf("  function sectionLinksHtml("), homeV.indexOf("  function showUnits()")) + "\nreturn sectionLinksHtml;")((s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"));
    const valUnit = Curriculum.unitById("validation");
    const links = linksFn(valUnit, true);
    const hrefs = [...links.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    const progV = read("progress.js");
    check(hrefs.join() === ["presence", "type", "range", "format", "length"].map((n) => "practice.html?unit=validation&section=" + n).join() &&
      [...links.matchAll(/>([A-Za-z]+)<\/a>/g)].map((m) => m[1]).join() === "Presence,Type,Range,Format,Length" &&
      linksFn(valUnit, false) === "" && linksFn(Curriculum.unitById("selection"), true) === "" &&
      /"<\/a>" \+ sectionLinksHtml\(u, s && !placing\) \+ "<\/li>"/.test(homeV) && !/assignment-card[^\n]*sectionLinksHtml/.test(homeV) &&
      /const sections = x\.s && !needsPlacement\(x\.s\) \? u\.sections \|\| \[\] : \[\];/.test(progV) && /"&amp;section=" \+ encodeURIComponent\(sec\.name\)/.test(progV) &&
      /id="section-links" class="section-links"/.test(read("progress.html")) && !/section-links/.test(appV),
      "Validation sections: the five links (Presence, Type, Range, Format, Length → practice.html?unit=validation&section=…) are under the home card and on My progress once the placement is done; never during placement, on assignments or on the practice page");
    // 6. The section line and the way back; 7. 390px; 8. other units ignore the parameter.
    const cssV = read("styles.css");
    const rule = (sel) => { const i = cssV.indexOf(sel + " {"); return i < 0 ? "" : cssV.slice(i, cssV.indexOf("}", i)); };
    check(/'<p class="section-line">Practising the <strong>' \+ esc\(section\.title\) \+ "<\/strong> section of " \+ esc\(unit\.title\) \+\s*' · <a href="practice\.html\?unit=' \+ encodeURIComponent\(unitId\) \+ '">Back to the whole unit<\/a><\/p>'/.test(appV) &&
      /const noticeHtml = sectionLineHtml\(\) \+/.test(appV) && /: inSection\(\) \? unit\.title \+ ": " \+ section\.title : unit\.title;/.test(appV),
      "Validation sections: section practice shows \"Practising the Range section of Validation · Back to the whole unit\" at the top of the task, and in the page title");
    check(/flex-wrap: wrap/.test(rule(".section-links")) && /display: inline-block; font-weight: 700; font-size: \.9rem; color: var\(--link\); background: var\(--card\)/.test(rule(".section-link")) &&
      !/#[0-9a-f]{3,6}\b|rgb/i.test(rule(".section-links") + rule(".section-link") + rule(".section-line")),
      "Validation sections: the links wrap onto more lines at 390px (pills of .9rem text) and use theme colours only");
    check(Curriculum.sectionByName("selection", "range") === null && Curriculum.sectionByName("validation", "nope") === null && Curriculum.sectionByName("validation", "range").id === "r" &&
      /const section = unitId \? sectionByName\(unitId, params\.get\("section"\)\) : null;/.test(appV) && /const inSection = \(\) => !!section && !needsPlacement\(us\(\)\);/.test(appV) &&
      /const unitId = endless \|\| inAssignment \? null : params\.get\("unit"\);/.test(appV),
      "Validation sections: the section parameter is ignored for other units, unknown sections, endless mode, assignments, and until the placement is done");
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
      /if \(saved && o\.result === "pass" && !c\.placement && !preview && !inSection\(\)\) \{/.test(appU) && /const preview = !!previewId && previewAllowed\(self\);/.test(appU),
      "Secured pop-up: shows in practice and endless mode, never in placement, assignments (they return before the check), section practice or teacher practice");
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
    const finSrc = appU.slice(appU.indexOf("      const ids = assignmentTasks.map((x) => x.id);"), appU.indexOf("      renderSide();\n      return {};\n    }\n    if (inSection()) {"));
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
