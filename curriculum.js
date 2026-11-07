// Units, skills and the difficulty ladder.
// Shared by index.html, practice.html, teacher.html and the tests.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Curriculum = factory();
})(typeof self !== "undefined" ? self : this, function () {

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
  };

  // "Write from scratch" tasks are made from templates, at the top level, once a unit is completed.
  const SCRATCH_LEVEL = 10;

  const unitById = (id) => UNITS.find((u) => u.id === id) || null;
  const unitTitle = (id) => (unitById(id) || { title: id }).title;
  // A unit can set its own task type and name for a level (levelTypes, levelNames); otherwise the ladder's are used.
  const levelName = (n, unitId) => ((unitById(unitId) || {}).levelNames || {})[n] || (LEVELS[n - 1] || { name: "" }).name;
  const levelType = (n, unitId) => ((unitById(unitId) || {}).levelTypes || {})[n] || (LEVELS[n - 1] || { type: "" }).type;
  // Units with noScratch never set "Write from scratch" tasks (File handling: its programs make their own files).
  const hasScratch = (unitId) => !(unitById(unitId) || {}).noScratch;

  return { UNITS, LEVELS, TYPE_INFO, SCRATCH_LEVEL, unitById, unitTitle, levelName, levelType, hasScratch };
});
