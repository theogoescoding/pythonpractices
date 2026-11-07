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
      id: "data-types",
      title: "Data types and casting",
      description: "Choose the right type for a value, and change a value's type with casting.",
      skills: ["integer", "real", "boolean", "string", "casting", "type-choice"],
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
  const levelName = (n) => (LEVELS[n - 1] || { name: "" }).name;

  return { UNITS, LEVELS, TYPE_INFO, SCRATCH_LEVEL, unitById, unitTitle, levelName };
});
