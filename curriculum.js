// Units, skills and the difficulty ladder.
// Shared by app.html, practice.html, teacher.html and the tests.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Curriculum = factory();
})(typeof self !== "undefined" ? self : this, function () {

  // The searching and sorting units' ladder: some levels have two task types (the first is the level's main type).
  const ALGORITHM_TYPES = { 1: "predict", 2: "predict", 3: ["partial-parsons", "predict"], 4: ["partial-parsons", "predict"],
    5: ["fill", "trace"], 6: ["fill", "trace"], 7: ["trace", "parsons"], 8: ["trace", "parsons"], 9: ["trace", "write"], 10: "write" };
  const ALGORITHM_NAMES = { 1: "Predict the output", 2: "Predict – spot the trap", 3: "Pick the missing line", 4: "Pick the missing line – harder",
    5: "Fill in the blanks or trace", 6: "Fill in or trace – harder", 7: "Trace table or Parsons", 8: "Trace table or Parsons – longer",
    9: "Trace table or a short program", 10: "Write the whole algorithm" };

  // Order here is the order shown on the landing page.
  // `skills` is the fixed list a task's "skills" field may use (the fast move up counts these).
  // `skillMinLevel` keeps tasks for a skill out of the lower levels (they need ideas the student hasn't met yet).
  const UNITS = [
    {
      id: "output",
      title: "Output and sequence",
      description: "print, comments, running a script, order of statements",
      skills: ["print", "strings", "comments", "sequence", "sep/end"],
    },
    {
      id: "variables",
      title: "Variables and input",
      description: "assignment, input(), int() and str() conversion",
      skills: ["assignment", "reassignment", "input", "int()", "str()", "concatenation"],
    },
    {
      id: "data-types",
      title: "Data types and casting",
      description: "Choose the right type for a value, and change a value's type with casting.",
      skills: ["integer", "real", "boolean", "string", "casting", "type-choice"],
    },
    {
      id: "maths",
      title: "Maths in Python",
      description: "+ - * /, //, %, **, operator precedence, rounding",
      skills: ["arithmetic", "division", "integer-division", "modulo", "power", "precedence", "rounding"],
    },
    {
      id: "selection",
      title: "Selection",
      description: "if, if/else, elif, comparison operators, and/or",
      skills: ["if", "if/else", "elif", "comparison", "boundary", "and/or", "not", "input-conversion",
        "modulo-conditions", "input-validation", "selection-in-functions"],
      skillMinLevel: { "selection-in-functions": 5 },
    },
    {
      id: "loops-condition",
      title: "Condition-controlled loops",
      description: "Repeat code while a condition is true, and stop when it isn't.",
      skills: ["while", "counter", "accumulator", "sentinel", "input-validation", "menu", "and/or", "infinite-loop"],
    },
    {
      id: "loops-count",
      title: "Count-controlled loops",
      description: "Repeat code a set number of times, using a counter.",
      skills: ["for", "range", "loop-variable", "step", "nested-loop", "counting", "accumulator"],
    },
    {
      id: "strings",
      title: "Strings",
      description: "len(), indexing, slicing, upper() and lower(), find(), replace() and in.",
      skills: ["length", "indexing", "slicing", "upper/lower", "find", "replace", "in"],
    },
    {
      id: "random",
      title: "Random",
      description: "import random, randint() and choice(), and simulations such as dice and coins. When your code is checked, the random numbers are the same each time, so the checker knows what to expect.",
      skills: ["import", "randint", "choice", "simulation"],
    },
    {
      id: "lists",
      title: "Lists",
      description: "Make a list, use indexing, append() and len(), and loop over a list.",
      skills: ["list", "indexing", "append", "length", "list-loop"],
    },
    {
      id: "functions-basic",
      title: "Functions, no return value",
      description: "Define a function with def, call it, give it parameters, and print from inside it.",
      skills: ["def", "call", "parameter", "argument", "print-in-function"],
    },
    {
      id: "functions-return",
      title: "Functions, return values",
      description: "return a value from a function, use the result of a call, and store it in a variable.",
      skills: ["return", "call", "parameter", "store-result"],
    },
    {
      id: "file-handling",
      title: "File handling",
      description: "with open(...): write a file, then read it back, line by line or all at once.",
      skills: ["with-open", "mode", "write", "read", "lines", "close"],
      // No write or from-scratch tasks: every program makes its own file, so the top levels are puzzles too.
      levelTypes: { 8: "fill", 9: "parsons", 10: "parsons" },
      levelNames: { 8: "Fill in two whole lines", 9: "Parsons – longer", 10: "Parsons – extended" },
      noScratch: true,
    },
    {
      id: "arrays-2d",
      title: "2D arrays",
      description: "A list of lists: grid[row][col], len() for rows and columns, and nested loops to read and print a grid.",
      skills: ["list-of-lists", "indexing", "nested-loop", "length"],
    },
    {
      id: "validation",
      title: "Validation",
      description: "Check what the user typed before using it: presence, length, range, format and type checks, asking again with while, and a function that returns True or False.",
      // The first five skills are the five kinds of check: every task practises one of them.
      skills: ["presence", "length", "range", "format", "type-check", "re-ask", "validation-function"],
      // Levels 7 and 8 are both short write tasks (no "complete a whole line" level).
      levelTypes: { 7: "write" },
      levelNames: { 7: "Write a short check", 8: "Write a longer check" },
    },
    {
      id: "authentication",
      title: "Authentication",
      description: "Check a username and password against stored ones: ==, in, and, counting failed attempts, a while loop with three tries, and a login function that returns True or False. Everything is stored in the program itself.",
      skills: ["match", "known-users", "both-match", "which-wrong", "attempts", "login-loop", "presence", "validation-function"],
      levelTypes: { 7: "write" },
      levelNames: { 7: "Write a short check", 8: "Write a longer check" },
    },
    {
      id: "trace-tables",
      title: "Trace tables",
      description: "Follow a program one line at a time, and write each variable's new value, and what it prints, in a trace table.",
      skills: ["trace-assignment", "trace-output", "trace-input", "trace-selection", "trace-loop", "trace-list"],
      // Every level is a trace table: the levels change the program, not the task type.
      levelTypes: { 1: "trace", 2: "trace", 3: "trace", 4: "trace", 5: "trace", 6: "trace", 7: "trace", 8: "trace", 9: "trace", 10: "trace" },
      levelNames: { 1: "Trace a short program", 2: "Trace – spot the trap", 3: "Fill in a table's blanks", 4: "Fill in more blanks",
        5: "Trace a program with input", 6: "Trace input – longer", 7: "Trace selection", 8: "Trace selection – longer",
        9: "Trace a loop", 10: "Trace a full program" },
      noScratch: true,
    },
    // Searching and sorting. These five units start at level 1 (no placement test), and have fewer tasks at the
    // top levels; a level can have two task types (the first is the main one).
    {
      id: "linear-search",
      title: "Linear search",
      description: "Check each item in a list in turn until the one you want is found, or the list runs out.",
      skills: ["linear-search", "found-flag", "not-found", "position", "count-matches"],
      levelTypes: ALGORITHM_TYPES, levelNames: ALGORITHM_NAMES, noPlacement: true,
    },
    {
      id: "binary-search",
      title: "Binary search",
      description: "Search a sorted list by checking the middle item and throwing away the half that can't hold the one you want.",
      skills: ["sorted-list", "midpoint", "halving", "bounds", "binary-search"],
      levelTypes: ALGORITHM_TYPES, levelNames: ALGORITHM_NAMES, noPlacement: true,
    },
    {
      id: "bubble-sort",
      title: "Bubble sort",
      description: "Compare each pair of items next to each other and swap them if they're in the wrong order. Repeat the passes until no swaps are needed.",
      skills: ["compare-pair", "swap", "pass", "bubble-sort", "early-stop"],
      levelTypes: ALGORITHM_TYPES, levelNames: ALGORITHM_NAMES, noPlacement: true,
    },
    {
      id: "insertion-sort",
      title: "Insertion sort",
      description: "Take each item in turn, keep it in a variable, shift the bigger sorted items one place right, and insert it in the gap.",
      skills: ["key", "shift", "insert", "insertion-sort", "sorted-part"],
      levelTypes: ALGORITHM_TYPES, levelNames: ALGORITHM_NAMES, noPlacement: true,
    },
    {
      id: "merge-sort",
      title: "Merge sort",
      description: "Split a list into single items, then merge sorted lists back together by comparing their front items.",
      // One short note on recursion (shown on the unit's card and its practice page).
      note: "Merge sort is usually written with recursion: a function that calls itself on each half, again and again, until every part has one item, then merges the parts on the way back. Recursion is beyond this course, so these tasks never use it: the splitting is shown or done for you, and you practise the merging.",
      skills: ["split", "merge", "compare-fronts", "leftovers", "merge-sort"],
      // No write tasks: level 9 is two trace tables and level 10 a full trace of a longer list.
      levelTypes: Object.assign({}, ALGORITHM_TYPES, { 9: "trace", 10: "trace" }),
      levelNames: Object.assign({}, ALGORITHM_NAMES, { 9: "Trace a longer merge", 10: "Trace a whole merge sort" }),
      noPlacement: true,
      noScratch: true,
    },
  ];

  // How the unit menu groups the units, under headings. Layout only: unit ids, their order and saved progress are
  // unchanged. A group with no units yet lists what is coming, shown as "Coming soon".
  const UNIT_GROUPS = [
    { id: "fundamentals", title: "Programming fundamentals",
      units: ["output", "variables", "data-types", "maths", "selection", "loops-condition", "loops-count"] },
    { id: "advanced", title: "Advanced programming",
      units: ["strings", "random", "lists", "functions-basic", "functions-return", "file-handling", "arrays-2d"] },
    { id: "validation", title: "Validation", units: ["validation", "authentication", "trace-tables"] },
    { id: "searching-sorting", title: "Searching and sorting", units: ["linear-search", "binary-search", "bubble-sort", "insertion-sort", "merge-sort"] },
  ];

  // A level is how much support the task gives. It is the same in every unit.
  const LEVELS = [
    { level: 1,  type: "predict", name: "Predict the output" },
    { level: 2,  type: "predict", name: "Predict – spot the trap" },
    { level: 3,  type: "fill",    name: "Fill in one blank" },
    { level: 4,  type: "fill",    name: "Fill in two blanks" },
    { level: 5,  type: "parsons", name: "Parsons – short" },
    { level: 6,  type: "parsons", name: "Parsons – with traps" },
    { level: 7,  type: "fill",    name: "Complete a whole line" },
    { level: 8,  type: "write",   name: "Write part of the program" },
    { level: 9,  type: "write",   name: "Write a full program" },
    { level: 10, type: "write",   name: "Write an extended program" },
  ];

  const TYPE_INFO = {
    fill:    { label: "Fill in the blanks", how: "Type the missing code into each blank box, then check your answer." },
    parsons: { label: "Parsons puzzle",     how: "Put the lines in the right order and indent them. Some lines are not needed – leave those out." },
    predict: { label: "Predict the output", how: "Read the program and choose what you think it prints. Then run it to check." },
    write:   { label: "Write the code",     how: "Write the program yourself in the editor, then check it." },
    scratch: { label: "Write from scratch", how: "Start with a blank editor and write the whole program yourself. It's checked with several different inputs." },
    trace:   { label: "Trace table",        how: "Follow the program one line at a time. In each row, write the new value of each variable that line changes, and anything it prints." },
    "partial-parsons": { label: "Pick the missing line", how: "One line of the program is missing. Choose the line that makes the program work, then check your answer." },
  };

  // "Write from scratch" tasks are made from templates, at the top level, once a unit is completed.
  const SCRATCH_LEVEL = 10;

  const unitById = (id) => UNITS.find((u) => u.id === id) || null;
  const unitTitle = (id) => (unitById(id) || { title: id }).title;
  // A unit can set its own task type and name for a level (levelTypes, levelNames); otherwise the ladder's are used.
  const levelName = (n, unitId) => ((unitById(unitId) || {}).levelNames || {})[n] || (LEVELS[n - 1] || { name: "" }).name;
  // levelTypes: every task type a level may use (most levels have one); levelType: the level's main (first) type.
  const levelTypes = (n, unitId) => [].concat(((unitById(unitId) || {}).levelTypes || {})[n] || (LEVELS[n - 1] || { type: "" }).type);
  const levelType = (n, unitId) => levelTypes(n, unitId)[0];
  // Units with noScratch never set "Write from scratch" tasks (File handling: its programs make their own files).
  const hasScratch = (unitId) => !(unitById(unitId) || {}).noScratch;
  // Units with noPlacement start at level 1 with no placement test (the searching and sorting units).
  const hasPlacement = (unitId) => !(unitById(unitId) || {}).noPlacement;

  return { UNITS, UNIT_GROUPS, LEVELS, TYPE_INFO, SCRATCH_LEVEL, unitById, unitTitle, levelName, levelType, levelTypes, hasScratch, hasPlacement };
});
