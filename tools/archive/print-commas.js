// One-off rewrite for the printing rule (2026-11): when a program prints several values it uses commas in print(),
// not + and str(). + is kept only where text is built and stored in a variable, and the hint then says why.
// Run once: node tools/archive/print-commas.js   (then build-variants, add-worked-examples, derive-templates, the tests)
// It checks every changed task: the new solution's output must equal the expected output worked out from the old one.
"use strict";
const fs = require("fs");
const path = require("path");
const { runPython, ROOT } = require("../run-python.js");
const Checker = require(path.join(ROOT, "checker.js"));

const file = path.join(ROOT, "tasks.json");
const tasks = JSON.parse(fs.readFileSync(file, "utf8"));
const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));

// Applies [from, to] pairs (strings or regexes) to a string.
const apply = (s, pairs) => pairs.reduce((acc, [a, b]) => (typeof a === "string" ? acc.split(a).join(b) : acc.replace(a, b)), s);

// code: pairs for every piece of code (solution, starter, answers, distractors, buggy variants).
// text: pairs for what is printed (tests' expected, predict options) and the description.
// Other keys (hints, skills, tags, description, distractors, buggy, starter) replace the field afterwards.
const SPECS = {
  // ---------- Variables and input: text built and stored, so + stays and the hint says why ----------
  "var-L3d": {
    code: [['print("You have " + str(merits) + " merits")', 'message = "You have " + str(merits) + " merits"\nprint(message)'],
           ['print("You have " + ____(merits) + " merits")', 'message = "You have " + ____(merits) + " merits"\nprint(message)']],
    description: "Fill in the blank so the program builds a message, stores it, then prints: You have 12 merits",
    hints: ["The message is built and stored in a variable before it is printed, so its pieces are joined with +, not commas. + only joins text with text.",
      "Which function casts a number to text?"],
    tagsAdd: ["STRING_PLUS_INT"],
    buggy: [{ misconception: "STRING_PLUS_INT", code: 'merits = 12\nmessage = "You have " + merits + " merits"\nprint(message)' }],
  },
  "var-L4d": {
    code: [['print("You scored " + str(score) + " out of " + str(total))', 'result = "You scored " + str(score) + " out of " + str(total)\nprint(result)'],
           ['print("You scored " + ____(score) + " out of " + ____(total))', 'result = "You scored " + ____(score) + " out of " + ____(total)\nprint(result)']],
    description: "Fill in the blanks so the program builds the sentence, stores it in result, then prints: You scored 18 out of 20",
    hints: ["score and total are numbers. The sentence is built and stored in result before it is printed, which is why + joins it instead of commas.",
      "Cast each number to text with str() before joining it with +."],
    tagsAdd: ["STRING_PLUS_INT"],
    buggy: [{ misconception: "STRING_PLUS_INT", code: 'score = 18\ntotal = 20\nresult = "You scored " + score + " out of " + total\nprint(result)' }],
  },
  "var-L5d": {
    code: [['print("Year " + str(year) + " - " + house)', 'badge = "Year " + str(year) + " - " + house\nprint(badge)'],
           ['print("Year " + year + " - " + house)', 'badge = "Year " + year + " - " + house\nprint(badge)']],
    distractors: ['badge = "Year " + year + " - " + house'],
    description: "Arrange the lines so the program builds a name badge, stores it in badge, then prints: Year 9 - Phoenix\nOne line is not needed.",
    hints: ["The badge is built and stored before it is printed, so its pieces are joined with +. Can you join a number to text with +?",
      "str(year) casts 9 to the text \"9\"."],
  },
  "var-L6b": {
    code: [['print("You have £" + str(total))', 'message = "You have £" + str(total)\nprint(message)'],
           ['print("You have £" + total)', 'message = "You have £" + total\nprint(message)']],
    distractors: ['saved = input("Money saved: ")', 'message = "You have £" + total'],
    description: "Arrange the lines so the program adds the money saved and the money earned, builds a message, and prints it, for example: You have £8\nTwo lines are not needed.",
    hints: ["Both inputs need casting with int() so they are added, not joined.",
      "The message is built and stored before it is printed, so it is joined with + (there is no space after £). Cast total back to text with str() first."],
  },
  "var-L7c": {
    hints: ["Build the message by joining three pieces with +. It is stored in message, not printed straight away, so + is used instead of commas.",
      "laps is a number, so cast it to text with str(laps)."],
  },
  "var-P5a": {
    code: [['print(name + " will be " + str(age + 1) + " next year")', 'sentence = name + " will be " + str(age + 1) + " next year"\nprint(sentence)'],
           ['print(name + " will be " + age + 1 + " next year")', 'sentence = name + " will be " + age + 1 + " next year"\nprint(sentence)']],
    distractors: ['sentence = name + " will be " + age + 1 + " next year"'],
    description: "Put the lines in order. The program asks for a name and an age, builds a sentence, stores it, then prints it, for example:\nSam will be 13 next year",
    hints: ["Ask for the inputs before you use them.",
      "The sentence is built and stored first, so its pieces are joined with +. A number must be cast to text with str() before it can be joined."],
  },
  "var-P7b": {
    code: [['print(name + " has " + str(points) + " points")', 'message = name + " has " + str(points) + " points"\nprint(message)'],
           ['print(name + " has " + points + " points")', 'message = name + " has " + points + " points"\nprint(message)']],
    starter: 'name = input("Name: ")\npoints = int(input("Points: "))\n____\nprint(message)',
    answers: ['message = name + " has " + str(points) + " points"'],
    description: "Complete the missing line. It builds the text with + and stores it in message, which is then printed, for example:\nAva has 12 points",
    hints: ["The text is stored in message before it is printed, so the pieces are joined with +, not commas.",
      "points is a number, so cast it to text with str() before joining it."],
  },
  "var-L4c": {
    code: [['print(first + " " + last)', 'full = first + " " + last\nprint(full)'],
           ['print(first ____ " " ____ last)', 'full = first ____ " " ____ last\nprint(full)']],
    description: "Fill in the blanks so the program builds the full name, with a space between the first and last name, stores it in full, then prints it.",
    hints: ["The full name is built and stored before it is printed, so it is joined with +. Which operator joins pieces of text together?",
      "Join first, then the space, then last. + adds no spaces for you."],
  },
  "var-L5a": {
    code: [['print("Hi " + name + ", welcome to coding club")', 'greeting = "Hi " + name + ", welcome to coding club"\nprint(greeting)'],
           ['print("Hi " + "name" + ", welcome to coding club")', 'greeting = "Hi " + "name" + ", welcome to coding club"']],
    distractors: ['greeting = "Hi " + "name" + ", welcome to coding club"'],
    description: "Arrange the lines so the program asks for a name, builds a greeting, stores it, and prints, for example:\nHi Zara, welcome to coding club\nWe meet on Thursdays\nOne line is not needed.",
    hints: ["You must ask for the name before you use it.",
      "The greeting is stored before it is printed, and there's no space before its comma, so it is joined with +. \"name\" in quotes would join the word name."],
  },
  "var-L6c": {
    code: [['print("Your username is " + username)', 'print("Your username is", username)']],
    hints: ["The username has no space in it, and it is stored in a variable, so it is joined with + rather than commas.",
      "Here the year is only joined onto text, so it should stay as text – no casting with int().",
      "Print the text and the username with a comma between them: the comma adds the space."],
  },
  "var-L10f": {
    code: [['print("Full name: " + first + " " + last)\nprint("Register name: " + last + ", " + first)',
      'print("Full name:", first, last)\nregister = last + ", " + first\nprint("Register name:", register)']],
    hints: ["Use commas in print() to show several values: each comma puts a space between them.",
      "The register name has a comma straight after the surname, so build it with + and store it first: register = last + \", \" + first."],
  },
  "var-L10m": {
    code: [['print("You need: " + a + ", " + b + " and " + c)', 'items = a + ", " + b + " and " + c\nprint("You need:", items)']],
    hints: ["Build the list of items with + and store it, because the commas must come straight after each word: items = a + \", \" + b + …",
      "Then print the label and the list with a comma: print(\"You need:\", items). Check the comma, the spaces and the word and."],
  },

  // ---------- Variables and input: printed straight away, so commas ----------
  "var-L4b": {
    code: [['print("Total: £" + str(tickets * 2))', 'print("Total (£):", tickets * 2)']],
    text: [[/Total: £(\d+)/g, "Total (£): $1"]],
    description: "Tickets for the school disco cost £2 each. Fill in the blanks so the program reads the number of tickets and casts it to a whole number.",
    hints: ["The inside function reads what the user types.", "The outside function casts that text to a whole number. This is called casting."],
  },
  "var-L6d": {
    code: [['print("Before: " + str(score))', 'print("Before:", score)'], ['print("After: " + str(score))', 'print("After:", score)']],
    distractors: ["score + 5 = score", 'print("After:", "score")'],
    hints: ["The variable being changed goes on the LEFT of =.",
      "Use a comma in print() to show text and a number together: the comma puts a space between them. \"score\" in quotes would print the word score."],
    skills: ["reassignment"],
    tagsRemove: ["type conversion", "STRING_PLUS_INT"], tagsAdd: ["commas in print"], buggy: [],
  },
  "var-L8b": {
    code: [['print("Total cost: £" + str(total))', 'print("Total cost (£):", total)']],
    text: [[/Total cost: £(\d+)/g, "Total cost (£): $1"]],
    hints: ["total = adults * 5 + children * 3", "Print the label and the number with a comma between them: the comma adds the space."],
    skills: ["assignment", "int()"], tagsRemove: ["type conversion"], tagsAdd: ["commas in print"],
  },
  "var-L9c": {
    code: [['print("Total: £" + str(pupils * 12))', 'print("Total (£):", pupils * 12)']],
    text: [[/Total: £(\d+)/g, "Total (£): $1"]],
    hints: ["Cast the input to a whole number with int() so you can multiply it. This is called casting.", "Print the text and the number with a comma between them."],
    skills: ["input", "int()"], tagsRemove: ["type conversion"], tagsAdd: ["commas in print"],
  },
  "var-L10a": {
    code: [['print(str(quantity) + " x " + item + " = " + str(total) + "p")', 'print(quantity, "x", item, "=", total, "pence")']],
    text: [[/(\d+) x (\w+) = (\d+)p/g, "$1 x $2 = $3 pence"]],
    hints: ["The item stays as text, but the price and quantity need casting with int().",
      "Use commas in print() to show the values in order: each comma puts one space between them.",
      "print(quantity, \"x\", item, \"=\", total, \"pence\")"],
    skills: ["input", "int()", "assignment"], tagsRemove: ["type conversion"], tagsAdd: ["commas in print"],
  },
  "var-L10c": {
    code: [['print("Total pages: " + str(total))', 'print("Total pages:", total)'], ['print("Pages to go: " + str(100 - total))', 'print("Pages to go:", 100 - total)']],
    skills: ["reassignment", "int()", "input"],
  },
  "var-L10d": {
    code: [['print("Name: " + name)', 'print("Name:", name)'], ['print("Year: " + str(year))', 'print("Year:", year)'], ['print("Next year: Year " + str(year + 1))', 'print("Next year: Year", year + 1)']],
    hints: ["The year needs casting with int() so you can add 1.", "Use commas in print() to show text and numbers together: each comma adds a space.",
      "Work out year + 1 inside the print(): print(\"Next year: Year\", year + 1)"],
    skills: ["input", "int()"], tagsRemove: ["type conversion"], tagsAdd: ["commas in print"],
  },
  "var-L10e": {
    code: [['print("Start: £" + str(money))', 'print("Start (£):", money)'], ['print("Left: £" + str(money))', 'print("Left (£):", money)']],
    text: [[/Start: £(\d+)/g, "Start (£): $1"], [/Left: £(\d+)/g, "Left (£): $1"]],
    skills: ["reassignment", "int()", "input"],
  },
  "var-L10i": {
    code: [['print(house + ": " + str(points) + " points")', 'print(house, "has", points, "points")']],
    text: [[/(\w+): (\d+) points/g, "$1 has $2 points"]],
    hints: ["Start points at 0.", "Add each event with points = points + int(input(...)).", "Use commas in print() to show the house, the points and the words."],
    skills: ["reassignment", "int()", "input"],
  },
  "var-L10j": {
    code: [['print("For " + str(people) + " people:")', 'print("For", people, "people:")'], ['print("Flour: " + str(people * 50) + "g")', 'print("Flour (g):", people * 50)'],
      ['print("Milk: " + str(people * 100) + "ml")', 'print("Milk (ml):", people * 100)']],
    text: [[/Flour: (\d+)g/g, "Flour (g): $1"], [/Milk: (\d+)ml/g, "Milk (ml): $1"]],
    hints: ["Cast the input to a whole number with int().", "Use commas in print() to show text and numbers together.",
      "For 1 person the first line is different, so check whether people is 1 before printing it."],
    skills: ["int()", "input"], tagsRemove: ["type conversion"], tagsAdd: ["commas in print"],
  },
  "var-L10k": {
    code: [['print("Card for: " + name)', 'print("Card for:", name)'], ['print("Valid until the end of Year " + str(year + 2))', 'print("Valid until the end of Year", year + 2)']],
    hints: ["The year needs casting with int() so you can add 2.", "Use a comma in print() to show the text and the answer together."],
    skills: ["input", "int()"], tagsRemove: ["type conversion"], tagsAdd: ["commas in print"],
  },
  "var-L10l": {
    code: [['print("Distance: " + str(laps * 400) + "m")', 'print("Distance (m):", laps * 400)']],
    text: [[/Distance: (\d+)m/g, "Distance (m): $1"]],
    hints: ["Start with laps = 0.", "Distance is laps × 400.", "Print the text and the number with a comma between them."],
    skills: ["reassignment", "int()", "input"],
  },
  "var-L10n": {
    code: [['print("Score: " + str(score))', 'print("Score:", score)'], ['print("With bonus: " + str(score))', 'print("With bonus:", score)']],
    skills: ["reassignment", "int()", "input"],
  },
  "var-L9a": {
    code: [['print("Welcome " + name + " to form " + form)', 'print("Welcome", name, "to form", form)']],
    hints: ["Ask for the name first, then the form.", "Use commas in print(): each comma puts a space between the values."],
    skills: ["input", "assignment"], tagsAdd: ["commas in print"],
  },
  "var-P9b": {
    code: [['print("Total laps: " + str(total))', 'print("Total laps:", total)'], ['print("Laps to reach 20: " + str(20 - total))', 'print("Laps to reach 20:", 20 - total)']],
    hints: ["Cast each input to a whole number with int(). This is called casting.", "Work out the total before printing it.",
      "Use commas in print() to show text and a number together."],
    skills: ["int()", "assignment", "input"],
    // the STRING_PLUS_INT variant stays: it is the mistake of joining a number to text with +
    keepBuggy: { STRING_PLUS_INT: 'monday = int(input("Monday laps: "))\ntuesday = int(input("Tuesday laps: "))\ntotal = monday + tuesday\nprint("Total laps: " + total)\nprint("Laps to reach 20:", 20 - total)' },
  },

  // ---------- Maths ----------
  "maths-L4a": { code: [['print("Mean: " + str(round(mean, 2)))', 'print("Mean:", round(mean, 2))'], ['print("Mean: " + str(____(mean, 2)))', 'print("Mean:", ____(mean, 2))']] },
  "maths-L7d": {
    code: [['print("Each pays £" + str(round(share, 2)))', 'print("Each pays (£):", round(share, 2))']],
    text: [[/Each pays £([\d.]+)/g, "Each pays (£): $1"]],
    hints: ["Round share to 2 decimal places with round(share, 2).", "Print the text and the rounded number with a comma between them."],
  },
  "maths-L8d": {
    code: [['print("Percentage: " + str(round(percent, 1)) + "%")', 'print("Percentage (%):", round(percent, 1))']],
    text: [[/Percentage: ([\d.]+)%/g, "Percentage (%): $1"]],
    hints: ["Percentage = score / total * 100.", "Use round(percent, 1).", "Print the text and the rounded number with a comma between them."],
  },
  "maths-L9a": {
    code: [['print("Each pupil pays £" + str(round(cost / pupils, 2)))', 'print("Each pupil pays (£):", round(cost / pupils, 2))']],
    text: [[/Each pupil pays £([\d.]+)/g, "Each pupil pays (£): $1"]],
    hints: ["Cast both inputs to whole numbers with int().", "Divide with / and round to 2 places with round(..., 2).", "Print the text and the result with a comma between them."],
  },
  "maths-L10a": {
    code: [['print("Coach cost: £" + str(cost))', 'print("Coach cost (£):", cost)'], ['print("Cost per pupil: £" + str(round(cost / pupils, 2)))', 'print("Cost per pupil (£):", round(cost / pupils, 2))']],
    text: [[/Coach cost: £(\d+)/g, "Coach cost (£): $1"], [/Cost per pupil: £([\d.]+)/g, "Cost per pupil (£): $1"]],
  },
  "maths-L10c": {
    code: [['print("Percentage: " + str(round(total / 150 * 100, 1)) + "%")', 'print("Percentage (%):", round(total / 150 * 100, 1))']],
    text: [[/Percentage: ([\d.]+)%/g, "Percentage (%): $1"]],
    hints: ["Work out the total first and store it in a variable.", "Mean = total / 3; percentage = total / 150 * 100.", "Use round(..., 1), and print each label and value with a comma between them."],
  },
  "maths-L10l": {
    code: [['print("Each pays: " + str(each) + "p")', 'print("Each pays (p):", each)'], ['print("Extra collected: " + str(each * people - fare) + "p")', 'print("Extra collected (p):", each * people - fare)']],
    text: [[/Each pays: (\d+)p/g, "Each pays (p): $1"], [/Extra collected: (\d+)p/g, "Extra collected (p): $1"]],
  },

  // ---------- Selection ----------
  "functions-L4a": { code: [['print("Fare: £" + str(bus_fare(age)))', 'print("Fare (£):", bus_fare(age))']], text: [[/Fare: £(\d+)/g, "Fare (£): $1"]] },
  "functions-L9b": {
    code: [['print("Fare: £" + str(bus_fare(age)))', 'print("Fare (£):", bus_fare(age))']],
    description: "Write a function bus_fare(age) that returns 0 for under 5s, 1 for ages 5 to 15 and 2 otherwise. Then read an age and print e.g. \"Fare (£): 1\".",
    text: [[/Fare: £(\d+)/g, "Fare (£): $1"]],
    hints: ["The function uses if / elif / else with return.", "Print the text and the fare with a comma between them.", "print(\"Fare (£):\", bus_fare(age))"],
  },
  "sel-L10e": {
    code: [['print("Fine: " + str(days * 10) + "p")', 'print("Fine (p):", days * 10)'], ['print("Fine: " + str(70 + (days - 7) * 20) + "p")', 'print("Fine (p):", 70 + (days - 7) * 20)']],
    text: [[/Fine: (\d+)p/g, "Fine (p): $1"], ['"Fine: " and 10p per day', '"Fine (p):" and 10p per day']],
  },
  "sel-L10f": {
    code: [['print("Score: " + str(score) + "/3")', 'print("Score:", score, "out of 3")']],
    text: [[/Score: (\d)\/3/g, "Score: $1 out of 3"], ["for 3/3", "for 3 out of 3"]],
  },

  // ---------- Condition-controlled loops ----------
  "while-L2c": { code: [['print("Fare: £" + str(total))', 'print("Fare (£):", total)']], text: [[/Fare: £(\d+)/g, "Fare (£): $1"]] },
  "while-L3c": { code: [['print("Fine: " + str(fine) + "p")', 'print("Fine (p):", fine)']], text: [[/Fine: (\d+)p/g, "Fine (p): $1"]] },
  "while-L5c": { code: [['print("Total: £" + str(total))', 'print("Total (£):", total)']], text: [[/Total: £(\d+)/g, "Total (£): $1"]] },
  "while-L8c": { code: [['print("Total fares: £" + str(total))', 'print("Total fares (£):", total)']], text: [[/Total fares: £(\d+)/g, "Total fares (£): $1"]] },
  "while-L9d": { code: [['print("Fine: " + str(fine) + "p")', 'print("Fine (p):", fine)']], text: [[/Fine: (\d+)p/g, "Fine (p): $1"]] },
  "while-L10c": { code: [['print("Total: " + str(total) + "p")', 'print("Total (p):", total)']], text: [[/Total: (\d+)p/g, "Total (p): $1"]] },
  "while-P9b": { code: [['print("Total: £" + str(journeys * 2))', 'print("Total (£):", journeys * 2)']], text: [[/Total: £(\d+)/g, "Total (£): $1"]] },

  // ---------- Count-controlled loops ----------
  "for-L3d": { code: [['print("Saved: £" + str(total))', 'print("Saved (£):", total)']], text: [[/Saved: £(\d+)/g, "Saved (£): $1"]] },
  "for-L5b": { code: [['print("Total: £" + str(total))', 'print("Total (£):", total)']], text: [[/Total: £(\d+)/g, "Total (£): $1"]] },
  "for-L6a": { code: [['print("Fine: " + str(fine) + "p")', 'print("Fine (p):", fine)']], text: [[/Fine: (\d+)p/g, "Fine (p): $1"]] },
  "for-L8d": { code: [['print("Total: " + str(total) + "p")', 'print("Total (p):", total)']], text: [[/Total: (\d+)p/g, "Total (p): $1"]] },
  "for-L10c": { code: [['print("Total: £" + str(total))', 'print("Total (£):", total)']], text: [[/Total: £(\d+)/g, "Total (£): $1"]] },
  "for-L10d": {
    code: [['print("Week " + str(week) + ": great saving!")', 'print("Great saving in week", week)'], ['print("Total saved: £" + str(total))', 'print("Total saved (£):", total)']],
    text: [[/Week (\d+): great saving!/g, "Great saving in week $1"], [/Total saved: £(\d+)/g, "Total saved (£): $1"]],
  },
  "for-P7a": {
    code: [['print("-" + letter)', 'print("Letter:", letter)']],
    text: [[/^-(.)$/gm, "Letter: $1"]],
    description: "Print each letter of the word after the text Letter:, like Letter: c. Write the whole missing line.",
  },
  // Text built up in a variable inside a loop: + stays, and a hint now says why.
  "for-L6b": { hintsAdd: "Each row is built up in line and printed only when it is complete, so its pieces are joined with + rather than commas." },
  "for-L8c": { hints: ["Use one loop for the rows and another inside it for the seats.",
    "Build each row's line with +, then print it after the inner loop. The line is stored while it is built, so + is used rather than commas.",
    "str() casts a number to text so it can be joined."] },
  "for-L9b": { hintsAdd: "Each row is built up in line and printed only when it is complete, so the stars are joined with + rather than commas." },
  "for-L10b": { hints: ["Outer loop for rows, inner loop for columns.", "Each number is row * col.",
    "Build a line of text with + (it is stored while it grows, so commas can't be used), then print it after the inner loop."] },
};

const report = [];
const jobs = [];
const where = [];
for (const [id, spec] of Object.entries(SPECS)) {
  const t = byId[id];
  if (!t) throw new Error("No task " + id);
  const code = spec.code || [];
  const text = spec.text || [];
  const old = JSON.parse(JSON.stringify(t));
  t.solution = apply(t.solution, code);
  if (t.starter) t.starter = apply(t.starter, code);
  if (t.answers) t.answers = t.answers.map((a) => apply(a, code));
  if (t.distractors) t.distractors = t.distractors.map((d) => apply(d, code));
  if (t.options) t.options = t.options.map((o) => apply(o, text));
  t.description = apply(t.description, text);
  for (const k of ["starter", "answers", "distractors", "description", "hints", "skills"]) if (spec[k]) t[k] = spec[k];
  if (spec.hintsAdd) t.hints = t.hints.concat(spec.hintsAdd);
  if (spec.tagsRemove) t.tags = t.tags.filter((x) => !spec.tagsRemove.includes(x));
  if (spec.tagsAdd) for (const x of spec.tagsAdd) if (!t.tags.includes(x)) t.tags.push(x);
  if (spec.buggy) {
    t.buggy_variants = spec.buggy;
    for (const b of spec.buggy) if (!t.tags.includes(b.misconception)) t.tags.push(b.misconception);
    if (!spec.buggy.length) delete t.buggy_variants;
  } else if (t.buggy_variants) {
    t.buggy_variants = t.buggy_variants.map((b) => ({ misconception: b.misconception,
      code: (spec.keepBuggy && spec.keepBuggy[b.misconception]) || apply(b.code, code) }));
  }
  if (t.type === "fill") {
    let i = 0;
    const filled = t.starter.replace(/____/g, () => t.answers[i++]);
    if (filled !== t.solution) throw new Error(id + ": starter with answers is not the solution");
  }
  t.tests.forEach((test, k) => {
    test.expected = apply(test.expected, text);
    jobs.push({ code: t.solution, inputs: test.inputs });
    where.push([id, k]);
  });
  report.push(id);
}

// The new solution must print exactly the expected output worked out above.
const results = runPython(jobs);
let bad = 0;
results.forEach((r, j) => {
  const [id, k] = where[j];
  const t = byId[id];
  const got = Checker.normalise(r.output);
  if (r.error || got !== Checker.normalise(t.tests[k].expected)) {
    bad++;
    console.log("MISMATCH " + id + " test " + k + ": expected " + JSON.stringify(t.tests[k].expected) + " got " + JSON.stringify(got) + " " + (r.error || ""));
  }
});
for (const id of report) {
  const t = byId[id];
  if (t.type === "predict" && t.options[t.answer] !== t.tests[0].expected) { bad++; console.log("PREDICT " + id + ": the answer option is not the expected output"); }
}
if (bad) { console.log(bad + " problems: tasks.json not written."); process.exit(1); }
fs.writeFileSync(file, JSON.stringify(tasks, null, 2) + "\n");
console.log("Rewrote " + report.length + " tasks: " + report.join(" "));
