// The Debugging (GCSE) unit's bank tasks (2026-11): 40 practice tasks (4 at each level) and 8 placement tasks.
// tools/add-debugging-gcse-unit.js adds them to tasks.json (checked by tools/unit-tasks.js); tools/derive-templates.js
// reads OVERRIDES below, so every derived template's variants come from 8 test sets (or 8 typed answers) and 4 contexts.
// Unit id debugging-gcse, task ids bug-L… and bug-P… ("dbg-" is the A-level Debugging unit's).
//
// Every task has two parts (Checker.errorKindQuestion, app.js errorKindHtml):
//   1. What kind of error is it? Levels 1-7: "Syntax error" or "Logic error", one error. Level 8: the two definitions,
//      one error. Levels 9 and 10: one syntax error and one logic error; say which line is which.
//   2. Fix it, with the level's usual task type: 1-2 predict what the FIXED program prints, 3-4 fill in the blanks of the
//      fixed program, 5-6 Parsons (the line with the error is a line not needed; level 6 has one more), 7-10 write (the
//      editor starts with the program with the error(s) in it).
// Levels 1 to 8 have two syntax-error tasks and two logic-error tasks each.
// A syntax error here is one Python refuses to run (a missing colon, bracket or quote mark, = for ==, a misspelt key
// word, a missing comma). A logic error runs but prints something wrong: every test set shows it on at least one test.
// Errors are given as whole lines: { kind, fix (the line in the solution), line (the line with the error) }.
"use strict";
const path = require("path");
const Checker = require(path.join(__dirname, "..", "checker.js"));
const { nameCasting } = require("./unit-tasks.js");
const { says } = require("./validation-units-tasks.js");

const T = (inputs) => ({ inputs, expected: null });
const L = (...lines) => lines.join("\n");
const syn = (fix, line) => ({ kind: "syntax", fix, line });
const log = (fix, line) => ({ kind: "logic", fix, line });
const askFor = (level) => (level <= 7 ? "kind" : level === 8 ? "definition" : "both");
const strip = (o, keys) => { const c = Object.assign({}, o); for (const k of keys) delete c[k]; return c; };

// Tags and skills from the errors and the level (a task may give its own).
function meta(o) {
  const kinds = [...new Set(o.errors.map((e) => e.kind))];
  const tags = ["debugging"].concat(kinds.map((k) => k + " error"));
  const skills = o.level >= 9 ? ["two-errors", "syntax-error", "logic-error"] : [kinds[0] + "-error"].concat(o.level === 8 ? ["error-definitions"] : []);
  return { tags: o.tags || tags, skills: o.skills || skills };
}

// A predict task: the program with the error is shown; the student predicts what the FIXED program prints.
// { id, level, title, intro, code (the fixed program), errors, inputs (8: the task's own first), ctx, hints,
//   wrongOutputs (the bank task's extra wrong options), dw (its variants' extra wrong options: $IN is the typed answer,
//   $C0, $C1… the context's strings) }.
function P(o) {
  const bug = Checker.withErrors(o.code, o.errors);
  const description = (o.intro ? o.intro + " " : "") + "The user " + says(o.inputs[0]) + ". Fix the error in your head. What will the fixed program print?";
  return Object.assign({ type: "predict", ask: askFor(o.level), description, solution: o.code, tests: [T([o.inputs[0]])],
    wrong: o.errors.every((e) => e.kind === "logic") && bug ? [bug] : [], vary: { inputs: o.inputs, ctx: o.ctx, dw: o.dw } },
  meta(o), strip(o, ["intro", "code", "inputs", "ctx", "dw"]));
}
// Any other task: its tests come from the first of "sets" (each set: one list of inputs per test).
function S(o) {
  return Object.assign({ ask: askFor(o.level), tests: o.sets[0].map(T), vary: { sets: o.sets, ctx: o.ctx } }, meta(o), strip(o, ["sets", "ctx"]));
}
// A placement task: no variants.
function Q(o) {
  const out = Object.assign({ ask: askFor(o.level), tests: o.tests.map(T) }, meta(o), strip(o, ["tests"]));
  if (o.type === "predict") {
    out.description = (o.intro ? o.intro + " " : "") + "The user " + says(o.tests[0][0]) + ". Fix the error in your head. What will the fixed program print?";
    out.solution = o.code;
    const bug = Checker.withErrors(o.code, o.errors);
    out.wrong = o.errors.every((e) => e.kind === "logic") && bug ? [bug] : [];
    delete out.intro; delete out.code;
  }
  return out;
}
const SET = (...tests) => tests; // one test set: a list of tests, each a list of inputs

const FIX1 = "It has an error. Fill in the blank to fix it.";
const FIX2 = "It has an error. Fill in both blanks to fix it.";
const ORDER1 = "It has an error. Put the lines in order to make the fixed program. One line is not needed: it has the error in it.";
const ORDER2 = "It has an error. Put the lines in order to make the fixed program. Two lines are not needed.";
const FIX = "It has an error. Fix it in the editor.";
const FIX_BOTH = "It has two errors: one syntax error and one logic error. Fix both in the editor.";

const PRACTICE = [
  // ---------- Level 1: predict, one error ----------
  P({ id: "bug-L1a", level: 1, title: "A welcome message",
    code: L('name = input("Name: ")', 'print("Hello", name)', 'print("Welcome to the club")'),
    errors: [syn('print("Hello", name)', 'print("Hello", name')],
    inputs: ["Ava", "Ben", "Cara", "Dev", "Eli", "Fay", "Gus", "Hana"],
    ctx: [["Welcome to the club"], ["Welcome to the team"], ["Welcome to the choir"], ["Welcome to the band"]],
    hints: ["Count the opening and closing brackets on each line.", "Once the line is fixed, print() puts a space between the two values."],
    wrongOutputs: ["Hello\nWelcome to the club", "Hello name\nWelcome to the club"], dw: ["Hello\n$C0", "Hello name\n$C0", "Hello $IN"] }),
  P({ id: "bug-L1b", level: 1, title: "Three tickets",
    intro: "This program should print the cost of three tickets.",
    code: L('cost = int(input("Cost of one ticket: "))', "total = cost * 3", 'print("Three tickets cost", total)'),
    errors: [log('print("Three tickets cost", total)', 'print("Three tickets cost", cost)')],
    inputs: ["4", "5", "6", "7", "8", "9", "12", "15"],
    ctx: [["ticket", "tickets"], ["pass", "passes"], ["badge", "badges"], ["mug", "mugs"]],
    hints: ["The program runs, so look at what it prints.", "Which variable holds the cost of three tickets?"],
    wrongOutputs: ["Three tickets cost 7", "Three tickets cost 444"], dw: ["Three $C1 cost $IN$IN$IN", "Three $C1 cost $IN"] }),
  P({ id: "bug-L1c", level: 1, title: "Old enough to join?",
    code: L('age = int(input("Age: "))', "if age >= 12:", '    print("You can join")', "else:", '    print("Too young to join")'),
    errors: [syn("if age >= 12:", "if age >= 12")],
    inputs: ["14", "9", "12", "11", "16", "10", "13", "8"],
    ctx: [["join"], ["enter"], ["play"], ["sign up"]],
    hints: ["Every if and else line needs something at its end.", "After the fix, compare the age with 12."],
    wrongOutputs: ["Too young to join", "You can join\nToo young to join"], dw: ["You can $C0", "Too young to $C0", "You can $C0\nToo young to $C0"] }),
  P({ id: "bug-L1d", level: 1, title: "Money left",
    intro: "This program should take off what was spent.",
    code: L('money = int(input("Money saved: "))', "spent = 5", "left = money - spent", 'print("Money left:", left)'),
    errors: [log("left = money - spent", "left = money + spent")],
    inputs: ["20", "12", "30", "9", "15", "25", "40", "8"],
    ctx: [["Money saved", "Money left"], ["Coins saved", "Coins left"], ["Tokens saved", "Tokens left"], ["Points saved", "Points left"]],
    hints: ["The program runs. Look at the sum on line 3.", "Spending takes money away."],
    wrongOutputs: ["Money left: 5", "Money left: 20"], dw: ["$C1: $IN", "$C1: 5"] }),

  // ---------- Level 2: predict, spot the trap ----------
  P({ id: "bug-L2a", level: 2, title: "Quiz question",
    code: L('answer = input("Capital of France? ")', 'if answer == "Paris":', '    print("Correct")', "else:", '    print("Not quite")', 'print("Quiz over")'),
    errors: [syn('if answer == "Paris":', 'if answer = "Paris":')],
    inputs: ["Paris", "paris", "London", "Rome", "Madrid", "Lyon", "Berlin", "Nice"],
    ctx: [["Capital of France", "Paris"], ["Capital of Spain", "Madrid"], ["Capital of Italy", "Rome"], ["Capital of Germany", "Berlin"]],
    hints: ["Is = the right sign for comparing two things?", "After the fix, does the answer typed match exactly, capitals and all?"],
    wrongOutputs: ["Not quite\nQuiz over", "Correct"], dw: ["Correct\nQuiz over", "Not quite\nQuiz over", "Correct", "Not quite"] }),
  P({ id: "bug-L2b", level: 2, title: "Pass or not",
    intro: "A mark of 40 or more is a pass.",
    code: L('mark = int(input("Mark: "))', "if mark >= 40:", '    print("Pass")', "else:", '    print("Not yet")'),
    errors: [log("if mark >= 40:", "if mark < 40:")],
    inputs: ["40", "39", "55", "12", "41", "70", "30", "90"],
    ctx: [["Pass", "Not yet"], ["Well done", "Try again"], ["Passed", "Keep going"], ["Pass", "Resit"]],
    hints: ["The program runs, but who gets which message?", "A mark of 40 or more should get the first message."],
    wrongOutputs: ["Pass\nNot yet"], dw: ["$C0", "$C1", "$C0\n$C1"] }),
  P({ id: "bug-L2c", level: 2, title: "Shopping",
    code: L('item = input("Item: ")', 'print("You bought:", item)', 'print("Thank you")'),
    errors: [syn('print("You bought:", item)', 'print("You bought:, item)')],
    inputs: ["apples", "bread", "milk", "eggs", "rice", "pasta", "cheese", "jam"],
    ctx: [["You bought", "Thank you"], ["In your basket", "Goodbye"], ["Added", "See you soon"], ["Your order", "Thanks"]],
    hints: ["Every string needs a quote mark at the start and one at the end.", "After the fix, print() puts a space between the two values."],
    wrongOutputs: ["You bought:\nThank you", "You bought: item\nThank you"], dw: ["$C0:\n$C1", "$C0: item\n$C1", "$C0: $IN"] }),
  P({ id: "bug-L2d", level: 2, title: "Laps of the track",
    intro: "Each lap is 400 metres. The program should add up the metres.",
    code: L('laps = int(input("Laps: "))', "total = 0", "for lap in range(laps):", "    total = total + 400", 'print("Metres run:", total)'),
    errors: [log("    total = total + 400", "    total = 400")],
    inputs: ["3", "2", "4", "5", "6", "7", "8", "10"],
    ctx: [["Laps", "Metres run"], ["Lengths", "Metres swum"], ["Circuits", "Metres cycled"], ["Rounds", "Metres walked"]],
    hints: ["The program runs, but look at how total changes each time round the loop.", "total should grow by 400 for every lap."],
    wrongOutputs: ["Metres run: 1600", "Metres run: 403"], dw: ["$C1: 400", "$C1: $IN"] }),

  // ---------- Level 3: fill in one blank ----------
  S({ id: "bug-L3a", level: 3, type: "fill", title: "Counting up",
    description: "The program should count from 1 up to the number typed. " + FIX1,
    starter: L("count = 1", 'target = int(input("Count to: "))', "____ count <= target:", "    print(count)", "    count = count + 1"), answers: ["while"],
    errors: [syn("while count <= target:", "whlie count <= target:")],
    sets: [SET(["3"], ["1"]), SET(["4"], ["2"]), SET(["5"], ["1"]), SET(["2"], ["3"]), SET(["6"], ["2"]), SET(["3"], ["5"]), SET(["4"], ["1"]), SET(["7"], ["3"])],
    ctx: [["Count to"], ["Go up to"], ["Stop at"], ["Last number"]],
    hints: ["Python only knows its own key words, spelt exactly.", "This loop keeps going while the condition is True."] }),
  S({ id: "bug-L3b", level: 3, type: "fill", title: "Coat or no coat",
    description: "Below 5 degrees, you need a coat. " + FIX1,
    starter: L('temp = int(input("Temperature: "))', "if temp ____ 5:", '    print("Wear a coat")', "else:", '    print("No coat needed")'), answers: ["<"],
    errors: [log("if temp < 5:", "if temp > 5:")],
    sets: [SET(["2"], ["12"]), SET(["0"], ["9"]), SET(["3"], ["20"]), SET(["-1"], ["15"]), SET(["4"], ["7"]), SET(["1"], ["18"]), SET(["-3"], ["10"]), SET(["2"], ["25"])],
    ctx: [["Wear a coat", "No coat needed"], ["Wear gloves", "No gloves needed"], ["Wear a hat", "No hat needed"], ["Wear a scarf", "No scarf needed"]],
    hints: ["The program runs. Try a cold day: what does it print?", "Below 5 means the temperature is less than 5."] }),
  S({ id: "bug-L3c", level: 3, type: "fill", title: "Area of a rug",
    description: "The program should work out an area. " + FIX1,
    starter: L('width = int(input("Width: "))', 'height = int(input("Height: ")____', 'print("Area:", width * height)'), answers: [")"],
    errors: [syn('height = int(input("Height: "))', 'height = int(input("Height: ")')],
    sets: [SET(["3", "4"], ["5", "2"]), SET(["6", "2"], ["4", "4"]), SET(["7", "3"], ["2", "9"]), SET(["5", "5"], ["3", "8"]), SET(["10", "2"], ["6", "6"]),
      SET(["4", "9"], ["8", "3"]), SET(["2", "7"], ["9", "4"]), SET(["8", "5"], ["3", "3"])],
    ctx: [["Width", "Height", "Area"], ["Length", "Breadth", "Floor area"], ["Across", "Down", "Squares"], ["Wide", "Tall", "Space"]],
    hints: ["Count the opening and closing brackets on each line.", "int( and input( each need their own closing bracket."] }),
  S({ id: "bug-L3d", level: 3, type: "fill", title: "Three scores",
    description: "The program should add up three scores. " + FIX1,
    starter: L("total = ____", "for i in range(3):", '    score = int(input("Score: "))', "    total = total + score", 'print("Total:", total)'), answers: ["0"],
    errors: [log("total = 0", "total = 1")],
    sets: [SET(["4", "5", "6"], ["1", "2", "3"]), SET(["10", "20", "30"], ["2", "2", "2"]), SET(["7", "8", "9"], ["3", "0", "5"]), SET(["5", "5", "5"], ["1", "9", "4"]),
      SET(["12", "3", "6"], ["8", "8", "1"]), SET(["2", "4", "6"], ["9", "9", "9"]), SET(["0", "6", "3"], ["11", "2", "7"]), SET(["15", "5", "10"], ["4", "3", "2"])],
    ctx: [["Score", "Total"], ["Points", "Sum"], ["Goals", "All goals"], ["Runs", "Total runs"]],
    hints: ["The program runs, but every total is wrong by the same amount.", "Before anything is added, the total should be nothing at all."] }),

  // ---------- Level 4: fill in two blanks ----------
  S({ id: "bug-L4a", level: 4, type: "fill", title: "Drinks menu",
    description: "The program should give the drink for the number chosen. " + FIX2,
    starter: L('choice = input("Pick 1, 2 or 3: ")', 'if choice == "1":', '    print("Tea")', 'elif choice ____ "____":', '    print("Coffee")', "else:", '    print("Water")'),
    answers: ["==", "2"],
    errors: [syn('elif choice == "2":', 'elif choice = "2":')],
    sets: [SET(["2"], ["3"]), SET(["1"], ["2"]), SET(["3"], ["1"]), SET(["2"], ["1"]), SET(["1"], ["3"]), SET(["3"], ["2"]), SET(["2"], ["4"]), SET(["5"], ["1"])],
    ctx: [["Tea", "Coffee", "Water"], ["Juice", "Milk", "Squash"], ["Soup", "Salad", "Bread"], ["Red", "Blue", "Green"]],
    hints: ["One = stores a value. Comparing two things needs something else.", "Fill in the comparison, then the choice this line checks for."] }),
  S({ id: "bug-L4b", level: 4, type: "fill", title: "Change from a purchase",
    description: "The program should work out the change. " + FIX2,
    starter: L('price = int(input("Price: "))', 'paid = int(input("Paid: "))', "change = ____ - ____", 'print("Change:", change)'), answers: ["paid", "price"],
    errors: [log("change = paid - price", "change = price - paid")],
    sets: [SET(["3", "5"], ["7", "10"]), SET(["4", "10"], ["6", "8"]), SET(["12", "20"], ["5", "5"]), SET(["9", "10"], ["15", "20"]), SET(["2", "5"], ["8", "10"]),
      SET(["6", "10"], ["11", "20"]), SET(["7", "10"], ["3", "3"]), SET(["13", "20"], ["1", "2"])],
    ctx: [["Price", "Paid", "Change"], ["Cost", "Given", "Money back"], ["Bill", "Handed over", "Returned"], ["Fare", "Tendered", "Due back"]],
    hints: ["The program runs, but the change comes out below zero.", "Change is what was paid, take away the price."] }),
  S({ id: "bug-L4c", level: 4, type: "fill", title: "Add two numbers",
    description: "The program should add two numbers. " + FIX2,
    starter: L('a = int(input("First number: "))', 'b = int(input("Second number: "))', "total = a + b", 'print____"Total:", total____'), answers: ["(", ")"],
    errors: [syn('print("Total:", total)', 'print "Total:", total')],
    sets: [SET(["3", "4"], ["10", "5"]), SET(["1", "1"], ["6", "7"]), SET(["8", "2"], ["0", "9"]), SET(["5", "5"], ["12", "3"]), SET(["7", "6"], ["2", "2"]),
      SET(["20", "1"], ["4", "8"]), SET(["9", "9"], ["3", "5"]), SET(["11", "4"], ["6", "0"])],
    ctx: [["Total"], ["Sum"], ["Added up"], ["Together"]],
    hints: ["print needs something around what it prints.", "Put an opening bracket before the text and a closing one at the end."] }),
  S({ id: "bug-L4d", level: 4, type: "fill", title: "Five lines of a table",
    description: "The program should print the first 5 lines of a times table. " + FIX2,
    starter: L('n = int(input("Times table: "))', "for i in range(____, ____):", '    print(n, "x", i, "=", n * i)'), answers: ["1", "6"],
    errors: [log("for i in range(1, 6):", "for i in range(1, 5):")],
    sets: [SET(["3"], ["7"]), SET(["2"], ["5"]), SET(["4"], ["9"]), SET(["6"], ["8"]), SET(["5"], ["10"]), SET(["7"], ["2"]), SET(["9"], ["3"]), SET(["8"], ["11"])],
    ctx: [["Times table"], ["Which table"], ["Table to show"], ["Number"]],
    hints: ["The program runs, but count the lines it prints.", "range stops just before its end number."] }),

  // ---------- Level 5: Parsons, the line with the error is not needed ----------
  S({ id: "bug-L5a", level: 5, type: "parsons", title: "Letter by letter",
    description: "The program should print each letter of a word, then Done. " + ORDER1,
    solution: L('word = input("Word: ")', "for letter in word:", "    print(letter)", 'print("Done")'),
    distractors: ["for letter in word"],
    errors: [syn("for letter in word:", "for letter in word")],
    sets: [SET(["cat"], ["sun"]), SET(["dog"], ["hi"]), SET(["pen"], ["book"]), SET(["map"], ["a"]), SET(["tree"], ["ox"]), SET(["fish"], ["egg"]), SET(["bat"], ["moon"]), SET(["ink"], ["jam"])],
    ctx: [["Word", "Done"], ["Name", "Finished"], ["Code", "End"], ["Pet", "All done"]],
    hints: ["A for line must end with a certain symbol.", "The print inside the loop is indented under the for."] }),
  S({ id: "bug-L5b", level: 5, type: "parsons", title: "Average of two tests",
    description: "The program should print the average of two test marks. " + ORDER1,
    solution: L('a = int(input("Test 1: "))', 'b = int(input("Test 2: "))', "average = (a + b) / 2", 'print("Average:", average)'),
    distractors: ["average = a + b / 2"],
    errors: [log("average = (a + b) / 2", "average = a + b / 2")],
    sets: [SET(["6", "8"], ["10", "2"]), SET(["2", "4"], ["9", "3"]), SET(["7", "7"], ["5", "1"]), SET(["8", "2"], ["3", "9"]), SET(["4", "6"], ["10", "10"]),
      SET(["1", "5"], ["6", "2"]), SET(["9", "1"], ["8", "6"]), SET(["3", "3"], ["7", "5"])],
    ctx: [["Test", "Average"], ["Quiz", "Mean"], ["Game", "Average score"], ["Round", "Mean score"]],
    hints: ["The program runs, but is the average sensible?", "Brackets make the adding happen before the dividing."] }),
  S({ id: "bug-L5c", level: 5, type: "parsons", title: "Which ticket?",
    description: "Under 13 gets a child ticket. " + ORDER1,
    solution: L('age = int(input("Age: "))', "if age < 13:", '    print("Child ticket")', "else:", '    print("Adult ticket")'),
    distractors: ["else"],
    errors: [syn("else:", "else")],
    sets: [SET(["9"], ["15"]), SET(["12"], ["13"]), SET(["5"], ["40"]), SET(["10"], ["16"]), SET(["3"], ["70"]), SET(["11"], ["20"]), SET(["8"], ["14"]), SET(["6"], ["30"])],
    ctx: [["Child ticket", "Adult ticket"], ["Junior pass", "Senior pass"], ["Kids menu", "Main menu"], ["Small cup", "Large cup"]],
    hints: ["Look at the end of each if and else line.", "The else line needs the same ending as the if line."] }),
  S({ id: "bug-L5d", level: 5, type: "parsons", title: "Picnic day",
    description: "A picnic needs a Saturday and sunny weather. " + ORDER1,
    solution: L('day = input("Day: ")', 'weather = input("Weather: ")', 'if day == "Saturday" and weather == "sunny":', '    print("Picnic in the park")', "else:", '    print("Stay at home")'),
    distractors: ['if day == "Saturday" or weather == "sunny":'],
    errors: [log('if day == "Saturday" and weather == "sunny":', 'if day == "Saturday" or weather == "sunny":')],
    sets: [SET(["Saturday", "rainy"], ["Saturday", "sunny"]), SET(["Monday", "sunny"], ["Saturday", "sunny"]), SET(["Saturday", "sunny"], ["Sunday", "sunny"]),
      SET(["Saturday", "cloudy"], ["Saturday", "sunny"]), SET(["Friday", "sunny"], ["Saturday", "sunny"]), SET(["Saturday", "sunny"], ["Saturday", "windy"]),
      SET(["Tuesday", "sunny"], ["Saturday", "sunny"]), SET(["Saturday", "sunny"], ["Saturday", "snowy"])],
    ctx: [["Picnic in the park", "Stay at home"], ["Beach trip", "Watch a film"], ["Bike ride", "Read a book"], ["Football match", "Play a board game"]],
    hints: ["The program runs. Try Saturday and rainy: what should happen?", "Both things must be true for a picnic."] }),

  // ---------- Level 6: Parsons, two lines not needed ----------
  S({ id: "bug-L6a", level: 6, type: "parsons", title: "Unlock the door",
    description: "The program should keep asking until the PIN is 1234. " + ORDER2,
    solution: L('pin = input("PIN: ")', 'while pin != "1234":', '    print("Wrong PIN")', '    pin = input("PIN: ")', 'print("Unlocked")'),
    distractors: ['while pin != "1234"', 'while pin == "1234":'],
    errors: [syn('while pin != "1234":', 'while pin != "1234"')],
    sets: [SET(["1234"], ["1111", "1234"]), SET(["0000", "1234"], ["1234"]), SET(["1234"], ["4321", "9999", "1234"]), SET(["12", "1234"], ["1234"]),
      SET(["1234"], ["2468", "1234"]), SET(["1243", "1234"], ["1234"]), SET(["1234"], ["0", "00", "1234"]), SET(["5555", "1234"], ["1234"])],
    ctx: [["PIN", "Unlocked"], ["Code", "Door open"], ["Passcode", "Access granted"], ["Key", "Welcome in"]],
    hints: ["A while line ends like an if line.", "The loop should keep asking while the PIN is not right."] }),
  S({ id: "bug-L6b", level: 6, type: "parsons", title: "Best of three",
    description: "The program should print the best of three scores. " + ORDER2,
    solution: L("best = 0", "for i in range(3):", '    score = int(input("Score: "))', "    if score > best:", "        best = score", 'print("Best score:", best)'),
    distractors: ["if score < best:", "best = best + score"],
    errors: [log("    if score > best:", "    if score < best:")],
    sets: [SET(["4", "9", "2"], ["7", "3", "5"]), SET(["1", "2", "3"], ["8", "8", "1"]), SET(["6", "1", "6"], ["2", "9", "4"]), SET(["10", "4", "7"], ["3", "3", "3"]),
      SET(["5", "8", "1"], ["9", "2", "9"]), SET(["2", "2", "6"], ["7", "1", "4"]), SET(["12", "15", "9"], ["4", "4", "5"]), SET(["3", "7", "7"], ["11", "6", "2"])],
    ctx: [["Score", "Best score"], ["Jump", "Longest jump"], ["Throw", "Furthest throw"], ["Lap", "Best lap"]],
    hints: ["The program runs, but the best score is always 0.", "best should change when a new score is bigger."] }),
  S({ id: "bug-L6c", level: 6, type: "parsons", title: "Make a username",
    description: "The program should greet the user, then make a username from both names. " + ORDER2,
    solution: L('first = input("First name: ")', 'last = input("Last name: ")', 'print("Hello", first, last)', 'print("Your username is", first + last)'),
    distractors: ['print("Hello" first, last)', 'print("Hello", "first", "last")'],
    errors: [syn('print("Hello", first, last)', 'print("Hello" first, last)')],
    sets: [SET(["Ada", "Lee"], ["Sam", "Khan"]), SET(["Mo", "Ali"], ["Jo", "Park"]), SET(["Eve", "Ng"], ["Raj", "Das"]), SET(["Liv", "Cole"], ["Tom", "Wu"]),
      SET(["Zak", "Bell"], ["Amy", "Fox"]), SET(["Ian", "Shaw"], ["Kim", "Lowe"]), SET(["Una", "Reid"], ["Ned", "Gray"]), SET(["Bea", "Hart"], ["Cal", "Moss"])],
    ctx: [["Hello", "Your username is"], ["Hi", "Your login is"], ["Welcome", "Your gamer tag is"], ["Good morning", "Your code name is"]],
    hints: ["Values in print() are separated by something.", "first and last are variables, so they have no quote marks."] }),
  S({ id: "bug-L6d", level: 6, type: "parsons", title: "Double points",
    description: "The program should double the points. " + ORDER2,
    solution: L('points = int(input("Points: "))', "bonus = points * 2", 'print("Points with the double bonus:", bonus)'),
    distractors: ["bonus = points + 2", "bonus = points ** 2"],
    errors: [log("bonus = points * 2", "bonus = points + 2")],
    sets: [SET(["5"], ["8"]), SET(["3"], ["10"]), SET(["7"], ["4"]), SET(["12"], ["6"]), SET(["9"], ["1"]), SET(["15"], ["20"]), SET(["11"], ["3"]), SET(["6"], ["25"])],
    ctx: [["Points", "double bonus"], ["Stars", "double reward"], ["Coins", "double prize"], ["Gems", "double treasure"]],
    hints: ["The program runs. Try 5 points: what should the bonus be?", "Double means two times as many."] }),

  // ---------- Level 7: write, fix one error ----------
  S({ id: "bug-L7a", level: 7, type: "write", title: "Medals",
    description: "The program should print Gold for over 50, Silver for over 20, and Bronze for the rest. " + FIX,
    solution: L('score = int(input("Score: "))', "if score > 50:", '    print("Gold")', "elif score > 20:", '    print("Silver")', "else:", '    print("Bronze")'),
    errors: [syn("elif score > 20:", "elif score > 20")],
    sets: [SET(["60"], ["30"]), SET(["75"], ["10"]), SET(["25"], ["90"]), SET(["5"], ["51"]), SET(["21"], ["0"]), SET(["100"], ["40"]), SET(["35"], ["15"]), SET(["55"], ["22"])],
    ctx: [["Gold", "Silver", "Bronze"], ["Ruby", "Pearl", "Coral"], ["First", "Second", "Third"], ["Star", "Merit", "Effort"]],
    hints: ["Every if, elif and else line needs the same ending.", "Find the line Python refuses to run."] }),
  S({ id: "bug-L7b", level: 7, type: "write", title: "Walking to school",
    description: "The program should count how many of the 4 answers are yes. " + FIX,
    solution: L("count = 0", "for i in range(4):", '    answer = input("Did you walk to school? ")', '    if answer == "yes":', "        count = count + 1", 'print("Days walked:", count)'),
    errors: [log("        count = count + 1", "        count = 1")],
    sets: [SET(["yes", "no", "yes", "yes"], ["no", "no", "no", "yes"]), SET(["yes", "yes", "no", "no"], ["no", "no", "no", "no"]),
      SET(["no", "yes", "yes", "yes"], ["yes", "no", "no", "no"]), SET(["yes", "yes", "yes", "yes"], ["no", "yes", "no", "no"]),
      SET(["no", "no", "yes", "yes"], ["yes", "no", "no", "no"]), SET(["yes", "no", "yes", "no"], ["no", "no", "yes", "no"]),
      SET(["yes", "yes", "yes", "no"], ["no", "no", "no", "no"]), SET(["no", "yes", "no", "yes"], ["yes", "yes", "yes", "yes"])],
    ctx: [["walk to school", "Days walked"], ["cycle to school", "Days cycled"], ["read at home", "Days read"], ["eat breakfast", "Breakfasts eaten"]],
    hints: ["The program runs. Try three yes answers: what is printed?", "count should go up by one for each yes."] }),
  S({ id: "bug-L7c", level: 7, type: "write", title: "Pet legs",
    description: "The program should print a pet's name and how many legs it has. " + FIX,
    solution: L('name = input("Pet\'s name: ")', 'legs = int(input("Number of legs: "))', 'print(name, "has", legs, "legs")'),
    errors: [syn('legs = int(input("Number of legs: "))', 'legs = int(input("Number of legs: ))')],
    sets: [SET(["Rex", "4"], ["Polly", "2"]), SET(["Tom", "4"], ["Nemo", "0"]), SET(["Kiki", "2"], ["Bob", "4"]), SET(["Sid", "8"], ["Max", "4"]),
      SET(["Lulu", "2"], ["Fluff", "4"]), SET(["Spot", "4"], ["Tweet", "2"]), SET(["Ziggy", "6"], ["Coco", "2"]), SET(["Bella", "4"], ["Shelly", "0"])],
    ctx: [["Pet's name"], ["Animal's name"], ["Creature's name"], ["Monster's name"]],
    hints: ["Look for a string that never ends.", "Every opening quote mark needs a closing one."] }),
  S({ id: "bug-L7d", level: 7, type: "write", title: "Ten off",
    description: "Spend 50 or more and you get 10 off. " + FIX,
    solution: L('total = int(input("Total spent: "))', "if total >= 50:", "    total = total - 10", 'print("To pay:", total)'),
    errors: [log("    total = total - 10", "    total = total + 10")],
    sets: [SET(["60"], ["20"]), SET(["50"], ["30"]), SET(["75"], ["49"]), SET(["100"], ["10"]), SET(["55"], ["5"]), SET(["90"], ["45"]), SET(["51"], ["12"]), SET(["80"], ["35"])],
    ctx: [["Total spent", "To pay"], ["Bill", "Amount due"], ["Basket total", "You pay"], ["Order total", "Final price"]],
    hints: ["The program runs. Try 60: what should you pay?", "10 off means taking 10 away."] }),

  // ---------- Level 8: write, match the definition ----------
  S({ id: "bug-L8a", level: 8, type: "write", title: "Add until zero",
    description: "The program should add up numbers until 0 is typed, then print the total. " + FIX,
    solution: L("total = 0", 'number = int(input("Number (0 to stop): "))', "while number != 0:", "    total = total + number", '    number = int(input("Number (0 to stop): "))', 'print("Total:", total)'),
    errors: [syn("while number != 0:", "while number != 0")],
    sets: [SET(["4", "5", "0"], ["0"]), SET(["10", "0"], ["3", "3", "3", "0"]), SET(["0"], ["7", "0"]), SET(["1", "2", "3", "0"], ["0"]), SET(["8", "0"], ["2", "9", "0"]),
      SET(["0"], ["5", "5", "0"]), SET(["6", "6", "0"], ["1", "0"]), SET(["12", "3", "0"], ["0"])],
    ctx: [["Total"], ["Sum"], ["Running total"], ["Grand total"]],
    hints: ["Look at the end of the while line.", "Ask: would Python run this program at all?"] }),
  S({ id: "bug-L8b", level: 8, type: "write", title: "Team ages",
    description: "Only ages 11 to 16 can join the school team. " + FIX,
    solution: L('age = int(input("Age: "))', "if age >= 11 and age <= 16:", '    print("You can join the school team")', "else:", '    print("Sorry, you can\'t join")'),
    errors: [log("if age >= 11 and age <= 16:", "if age >= 11 or age <= 16:")],
    sets: [SET(["13"], ["9"]), SET(["11"], ["17"]), SET(["16"], ["20"]), SET(["8"], ["14"]), SET(["12"], ["5"]), SET(["30"], ["15"]), SET(["10"], ["11"]), SET(["16"], ["17"])],
    ctx: [["school team"], ["youth club"], ["junior choir"], ["chess club"]],
    hints: ["The program runs. Try age 9: who can join?", "Both parts of the age check must be true."] }),
  S({ id: "bug-L8c", level: 8, type: "write", title: "Guess the number",
    description: "The program should tell the user if they guessed 7. " + FIX,
    solution: L('guess = int(input("Guess the number: "))', "secret = 7", "if guess == secret:", '    print("You got it")', "else:", '    print("Wrong, it was", secret)'),
    errors: [syn("else:", "esle:")],
    sets: [SET(["7"], ["3"]), SET(["2"], ["7"]), SET(["7"], ["9"]), SET(["10"], ["7"]), SET(["7"], ["1"]), SET(["6"], ["7"]), SET(["7"], ["8"]), SET(["4"], ["7"])],
    ctx: [["You got it"], ["Well guessed"], ["Spot on"], ["Correct guess"]],
    hints: ["Check that every key word is spelt the way Python spells it.", "Ask: would Python run this program at all?"] }),
  S({ id: "bug-L8d", level: 8, type: "write", title: "Average of four",
    description: "The program should print the average of 4 marks. " + FIX,
    solution: L("total = 0", "for i in range(4):", '    mark = int(input("Mark: "))', "    total = total + mark", 'print("Average mark:", total / 4)'),
    errors: [log('print("Average mark:", total / 4)', 'print("Average mark:", total / 3)')],
    sets: [SET(["10", "20", "30", "40"], ["5", "5", "5", "5"]), SET(["1", "2", "3", "4"], ["8", "8", "8", "8"]), SET(["12", "12", "0", "0"], ["9", "3", "6", "2"]),
      SET(["7", "7", "7", "7"], ["10", "0", "10", "0"]), SET(["4", "8", "12", "16"], ["3", "3", "3", "3"]), SET(["20", "10", "5", "5"], ["1", "1", "1", "1"]),
      SET(["6", "2", "8", "4"], ["9", "9", "9", "9"]), SET(["15", "5", "10", "10"], ["2", "4", "6", "8"])],
    ctx: [["Mark", "Average mark"], ["Score", "Average score"], ["Time", "Average time"], ["Height", "Average height"]],
    hints: ["The program runs. Try four marks of 5: what is the average?", "The total is shared by how many marks?"] }),

  // ---------- Level 9: write, one syntax error and one logic error ----------
  S({ id: "bug-L9a", level: 9, type: "write", title: "Book order",
    description: "The program should work out the cost of some books. Over 20 gets free delivery. " + FIX_BOTH,
    solution: L('price = int(input("Price of one book: "))', 'books = int(input("Number of books: "))', "total = price * books", "if total > 20:",
      '    print("Free delivery")', "else:", '    print("Delivery costs 3")', 'print("Books cost", total)'),
    errors: [syn("if total > 20:", "if total > 20"), log("total = price * books", "total = price + books")],
    sets: [SET(["5", "3"], ["8", "4"]), SET(["6", "4"], ["2", "3"]), SET(["10", "3"], ["4", "2"]), SET(["3", "9"], ["7", "2"]), SET(["12", "2"], ["5", "5"]),
      SET(["9", "1"], ["4", "6"]), SET(["2", "8"], ["11", "3"]), SET(["7", "7"], ["3", "3"])],
    ctx: [["book", "books", "Books"], ["comic", "comics", "Comics"], ["game", "games", "Games"], ["film", "films", "Films"]],
    hints: ["One line stops Python running the program. Find it first.", "Then test the program: is the total right for 5 books at 3 each?"] }),
  S({ id: "bug-L9b", level: 9, type: "write", title: "Overtime pay",
    description: "The program should work out pay. Over 40 hours earns a bonus of 50. " + FIX_BOTH,
    solution: L('hours = int(input("Hours worked: "))', 'rate = int(input("Pay per hour: "))', "pay = hours * rate", "if hours > 40:", "    pay = pay + 50", 'print("Total pay:", pay)'),
    errors: [syn('print("Total pay:", pay)', 'print("Total pay:", pay'), log("if hours > 40:", "if hours < 40:")],
    sets: [SET(["45", "10"], ["20", "8"]), SET(["50", "9"], ["30", "10"]), SET(["41", "5"], ["12", "6"]), SET(["60", "8"], ["35", "7"]), SET(["44", "10"], ["10", "10"]),
      SET(["48", "6"], ["25", "9"]), SET(["42", "7"], ["8", "12"]), SET(["55", "5"], ["39", "4"])],
    ctx: [["Hours worked", "Pay per hour", "Total pay"], ["Days worked", "Pay per day", "Wages"], ["Shifts done", "Pay per shift", "Earnings"], ["Lessons taught", "Pay per lesson", "Income"]],
    hints: ["Fix the line Python refuses to run first.", "Then try 45 hours: who should get the bonus?"] }),
  S({ id: "bug-L9c", level: 9, type: "write", title: "The top and the bottom",
    description: "The program should store 3 temperatures, then print the highest and the lowest. " + FIX_BOTH,
    solution: L("temps = []", "for day in range(3):", '    t = int(input("Temperature: "))', "    temps.append(t)", 'print("Highest:", max(temps))', 'print("Lowest:", min(temps))'),
    errors: [syn("for day in range(3):", "for day in range(3)"), log('print("Lowest:", min(temps))', 'print("Lowest:", max(temps))')],
    sets: [SET(["12", "15", "9"], ["20", "18", "22"]), SET(["5", "7", "6"], ["1", "2", "3"]), SET(["30", "10", "20"], ["8", "8", "9"]), SET(["14", "11", "17"], ["3", "6", "4"]),
      SET(["25", "21", "23"], ["0", "5", "2"]), SET(["9", "9", "10"], ["16", "19", "13"]), SET(["7", "3", "5"], ["28", "24", "26"]), SET(["18", "12", "15"], ["4", "10", "7"])],
    ctx: [["Temperature", "Highest", "Lowest"], ["Rainfall", "Wettest", "Driest"], ["Steps", "Most", "Fewest"], ["Score", "Best", "Worst"]],
    hints: ["One line is missing something at its end.", "Then check: which function gives the smallest value?"] }),
  S({ id: "bug-L9d", level: 9, type: "write", title: "Admin login",
    description: "Only the username admin with the password letmein can log in. " + FIX_BOTH,
    solution: L('name = input("Username: ")', 'password = input("Password: ")', 'if name == "admin" and password == "letmein":', '    print("Welcome back")', "else:", '    print("Access denied")'),
    errors: [syn("else:", "else"), log('if name == "admin" and password == "letmein":', 'if name == "admin" or password == "letmein":')],
    sets: [SET(["admin", "guess"], ["admin", "letmein"]), SET(["guest", "letmein"], ["admin", "letmein"]), SET(["admin", "letmein"], ["admin", "password"]),
      SET(["root", "letmein"], ["admin", "letmein"]), SET(["admin", "letmein"], ["admin", "LETMEIN"]), SET(["Admin", "letmein"], ["admin", "letmein"]),
      SET(["admin", "letmein"], ["admin", "letme"]), SET(["user", "letmein"], ["admin", "letmein"])],
    ctx: [["Welcome back", "Access denied"], ["Logged in", "Login failed"], ["Hello again", "Wrong details"], ["You're in", "Try again"]],
    hints: ["Fix the line Python refuses to run first.", "Then try admin with a wrong password: should that log in?"] }),

  // ---------- Level 10: write, two errors in a longer program ----------
  S({ id: "bug-L10a", level: 10, type: "write", title: "Ticket prices",
    description: "Under 16 pays 5 and everyone else pays 8. The program adds up 3 tickets. " + FIX_BOTH,
    solution: L("def ticket_price(age):", "    if age < 16:", "        return 5", "    else:", "        return 8", "", "total = 0", "for i in range(3):",
      '    age = int(input("Age: "))', "    total = total + ticket_price(age)", 'print("Total for 3 tickets:", total)'),
    errors: [syn("def ticket_price(age):", "def ticket_price(age)"), log("    if age < 16:", "    if age > 16:")],
    sets: [SET(["10", "20", "40"], ["15", "16", "12"]), SET(["5", "30", "9"], ["16", "17", "18"]), SET(["12", "13", "14"], ["20", "3", "25"]), SET(["40", "41", "2"], ["15", "15", "15"]),
      SET(["8", "16", "50"], ["11", "70", "6"]), SET(["17", "4", "15"], ["30", "30", "1"]), SET(["14", "22", "9"], ["16", "16", "16"]), SET(["1", "2", "60"], ["13", "35", "18"])],
    ctx: [["Total for 3 tickets"], ["Cost of 3 tickets"], ["3 tickets cost"], ["Price for 3 people"]],
    hints: ["A def line ends like an if line. Fix that first.", "Then try ages 10, 20 and 40: what should the total be?"] }),
  S({ id: "bug-L10b", level: 10, type: "write", title: "Stop at -1",
    description: "The program should read marks until -1, then print their average (or No marks entered). " + FIX_BOTH,
    solution: L("total = 0", "count = 0", 'mark = int(input("Mark (-1 to stop): "))', "while mark != -1:", "    total = total + mark", "    count = count + 1",
      '    mark = int(input("Mark (-1 to stop): "))', "if count > 0:", '    print("Average:", total / count)', "else:", '    print("No marks entered")'),
    errors: [syn("while mark != -1:", "while mark != -1"), log("    count = count + 1", "    count = count + 2")],
    sets: [SET(["10", "20", "-1"], ["-1"]), SET(["5", "-1"], ["8", "9", "10", "-1"]), SET(["-1"], ["3", "3", "-1"]), SET(["12", "8", "4", "-1"], ["-1"]),
      SET(["7", "-1"], ["1", "2", "-1"]), SET(["-1"], ["9", "-1"]), SET(["6", "6", "6", "-1"], ["2", "-1"]), SET(["20", "-1"], ["-1"])],
    ctx: [["Mark", "Average", "No marks entered"], ["Score", "Mean score", "No scores entered"], ["Time", "Average time", "No times entered"], ["Points", "Mean points", "No points entered"]],
    hints: ["Fix the line Python refuses to run first.", "Then try 10 and 20: what should the average be, and how many marks were counted?"] }),
  S({ id: "bug-L10c", level: 10, type: "write", title: "Stock orders",
    description: "Each order is sent if there is enough stock: that includes taking the very last of it. " + FIX_BOTH,
    solution: L('stock = int(input("Stock: "))', 'orders = int(input("Orders: "))', "for i in range(orders):", '    wanted = int(input("Wanted: "))', "    if wanted <= stock:",
      "        stock = stock - wanted", '        print("Sent", wanted)', "    else:", '        print("Not enough stock")', 'print("Stock left:", stock)'),
    errors: [syn('        print("Sent", wanted)', '        print("Sent", wanted'), log("    if wanted <= stock:", "    if wanted < stock:")],
    sets: [SET(["10", "2", "4", "6"], ["5", "1", "5"]), SET(["8", "1", "8"], ["6", "2", "2", "9"]), SET(["12", "3", "5", "7", "1"], ["3", "1", "2"]), SET(["4", "1", "4"], ["9", "2", "5", "3"]),
      SET(["6", "2", "3", "3"], ["2", "1", "1"]), SET(["7", "1", "7"], ["10", "3", "2", "2", "2"]), SET(["9", "2", "9", "1"], ["5", "1", "6"]), SET(["15", "2", "10", "5"], ["1", "1", "1"])],
    ctx: [["Stock", "Sent", "Not enough stock"], ["Seats", "Booked", "Not enough seats"], ["Tickets", "Sold", "Not enough tickets"], ["Pens", "Given out", "Not enough pens"]],
    hints: ["Fix the line Python refuses to run first.", "Then try a stock of 5 and an order for 5: should it be sent?"] }),
  S({ id: "bug-L10d", level: 10, type: "write", title: "Four-digit codes",
    description: "A code must be 4 digits. The program asks until a valid code is typed, then says how many wrong tries there were. " + FIX_BOTH,
    solution: L("def is_valid(code):", "    if len(code) != 4:", "        return False", "    if not code.isdigit():", "        return False", "    return True", "",
      "tries = 0", 'code = input("Code: ")', "while not is_valid(code):", "    tries = tries + 1", '    print("Invalid code")', '    code = input("Code: ")',
      'print("Code accepted after", tries, "wrong tries")'),
    errors: [syn("    if not code.isdigit():", "    if not code.isdigit()"), log("    tries = tries + 1", "    tries = tries + 2")],
    sets: [SET(["12", "abcd", "4321"], ["9876"]), SET(["1234"], ["x", "55555", "2468"]), SET(["abc", "1111"], ["0000"]), SET(["4444"], ["12a4", "99", "7777"]),
      SET(["1", "22", "333", "4444"], ["5678"]), SET(["8765"], ["code", "1357"]), SET(["9999"], ["123", "2222"]), SET(["a1b2", "3333"], ["6543"])],
    ctx: [["Code", "Invalid code", "Code accepted"], ["PIN", "Invalid PIN", "PIN accepted"], ["Door code", "Invalid door code", "Door code accepted"], ["Locker code", "Invalid locker code", "Locker code accepted"]],
    hints: ["Fix the line Python refuses to run first.", "Then try two wrong codes: how many wrong tries should it say?"] }),
];

const PLACEMENT = [
  // Level 2: predict
  Q({ id: "bug-P2a", level: 2, type: "predict", title: "Hello again",
    code: L('city = input("Home town: ")', 'print("You live in", city)', 'print("Nice place")'),
    errors: [syn('print("You live in", city)', 'print("You live in", city')],
    tests: [["Leeds"]], wrongOutputs: ["You live in\nNice place", "You live in city\nNice place"],
    hints: ["Count the brackets on each line.", "After the fix, print() puts a space between the two values."] }),
  Q({ id: "bug-P2b", level: 2, type: "predict", title: "Bus fare",
    intro: "Under 5s travel free. Everyone else pays 2.",
    code: L('age = int(input("Age: "))', "if age < 5:", '    print("Free")', "else:", '    print("Pay 2")'),
    errors: [log("if age < 5:", "if age > 5:")],
    tests: [["3"]], wrongOutputs: ["Free\nPay 2"],
    hints: ["The program runs, but who travels free?", "Under 5 means less than 5."] }),
  // Level 5: Parsons
  Q({ id: "bug-P5a", level: 5, type: "parsons", title: "Count down",
    description: "The program should count down from the number typed to 1. " + ORDER1,
    solution: L('n = int(input("Start: "))', "while n > 0:", "    print(n)", "    n = n - 1"),
    distractors: ["while n > 0"],
    errors: [syn("while n > 0:", "while n > 0")],
    tests: [["3"], ["1"]],
    hints: ["A while line ends like an if line.", "The two lines inside the loop are indented."] }),
  Q({ id: "bug-P5b", level: 5, type: "parsons", title: "Area of a square",
    description: "The program should print the area of a square. " + ORDER1,
    solution: L('side = int(input("Side: "))', "area = side * side", 'print("Area:", area)'),
    distractors: ["area = side + side"],
    errors: [log("area = side * side", "area = side + side")],
    tests: [["3"], ["5"]],
    hints: ["The program runs, but is the area right for a side of 3?", "Area means side times side."] }),
  // Level 7: write
  Q({ id: "bug-P7a", level: 7, type: "write", title: "Even or odd",
    description: "The program should say whether a number is even or odd. " + FIX,
    solution: L('n = int(input("Number: "))', "if n % 2 == 0:", '    print("Even")', "else:", '    print("Odd")'),
    errors: [syn("if n % 2 == 0:", "if n % 2 = 0:")],
    tests: [["4"], ["7"]],
    hints: ["Is = the right sign for comparing?", "Ask: would Python run this program at all?"] }),
  Q({ id: "bug-P7b", level: 7, type: "write", title: "Running total",
    description: "The program should add up 3 numbers. " + FIX,
    solution: L("total = 0", "for i in range(3):", '    n = int(input("Number: "))', "    total = total + n", 'print("Total:", total)'),
    errors: [log("    total = total + n", "    total = n")],
    tests: [["2", "3", "4"], ["5", "5", "1"]],
    hints: ["The program runs. Try 2, 3 and 4: what should the total be?", "total should grow by each number."] }),
  // Level 9: write, two errors
  Q({ id: "bug-P9a", level: 9, type: "write", title: "Cinema snacks",
    description: "Popcorn costs 3 and a drink costs 2. The program should print the total for the numbers typed. " + FIX_BOTH,
    solution: L('popcorn = int(input("Popcorn: "))', 'drinks = int(input("Drinks: "))', "total = popcorn * 3 + drinks * 2", 'print("Total:", total)'),
    errors: [syn('print("Total:", total)', 'print("Total:" total)'), log("total = popcorn * 3 + drinks * 2", "total = popcorn * 2 + drinks * 3")],
    tests: [["2", "1"], ["1", "3"]],
    hints: ["Fix the line Python refuses to run first.", "Then check which price goes with which snack."] }),
  Q({ id: "bug-P9b", level: 9, type: "write", title: "Countdown loop",
    description: "The program should print the numbers from the one typed down to 1, then Lift off. " + FIX_BOTH,
    solution: L('n = int(input("Start: "))', "for i in range(n, 0, -1):", "    print(i)", 'print("Lift off")'),
    errors: [syn("for i in range(n, 0, -1):", "for i in range(n, 0, -1)"), log('print("Lift off")', '    print("Lift off")')],
    tests: [["3"], ["2"]],
    hints: ["Fix the line Python refuses to run first.", "Then check how many times Lift off is printed."] }),
];

// Every task that casts input() with int() says so, with the course's casting sentence first (tools/unit-tasks.js).
nameCasting(PRACTICE);
nameCasting(PLACEMENT);

// ---------- Variants (tools/derive-templates.js overrides) ----------
// With 8 test sets (or 8 typed answers) and 4 contexts, each derived template makes up to 8 x 4 - 1 = 31 variants,
// so each level has well over 90. Numbers never change: the errors stay exactly where they are.
const textOf = (s) => [s.title, s.description, s.solution || "", s.starter || "", ...(s.answers || []), ...(s.distractors || []), ...(s.hints || [])].join("\n");
const hasWhole = (text, str) => new RegExp((/^\w/.test(str) ? "\\b" : "") + str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + (/\w$/.test(str) ? "\\b" : "")).test(text);
function checkContexts(s, ctx) {
  const text = textOf(s);
  for (const str of ctx[0]) if (!hasWhole(text, str)) throw new Error(s.id + ": context string \"" + str + "\" isn't in the task's text");
  if (ctx.length !== 4 || ctx.some((tu) => tu.length !== ctx[0].length)) throw new Error(s.id + ": 4 contexts, each with the same number of strings");
  if (new Set(ctx.map((tu) => JSON.stringify(tu))).size !== ctx.length) throw new Error(s.id + ": two contexts are the same");
}
// A predict variant's extra wrong options: $IN is its typed answer, $Ck the k-th string of its context (param p0).
const wrongFor = (dw, ctx) => (dw || []).map((w) => w.replace(/\$IN/g, "{{TS[ts][0][0]}}").replace(/\$C(\d)/g, (m, k) => "{{" + JSON.stringify(ctx.map((tu) => tu[+k])) + "[p0]}}"));

const OVERRIDES = {};
for (const s of PRACTICE) {
  const v = s.vary;
  checkContexts(s, v.ctx);
  if (s.type === "predict") {
    if (v.inputs.length !== 8) throw new Error(s.id + ": 8 typed answers");
    OVERRIDES[s.id] = { noNumbers: true, words: false, testSets: v.inputs.map((x) => [[x]]), says: v.inputs.map(says), swaps: [v.ctx], wrongOutputs: wrongFor(v.dw, v.ctx) };
  } else {
    if (v.sets.length !== 8) throw new Error(s.id + ": 8 test sets");
    if (JSON.stringify(v.sets[0]) !== JSON.stringify(s.tests.map((t) => t.inputs))) throw new Error(s.id + ": the first test set must be the task's own tests");
    OVERRIDES[s.id] = { noNumbers: true, words: false, testSets: v.sets, swaps: [v.ctx] };
  }
}

// The task specs as tools/unit-tasks.js takes them (without "vary").
const clean = (s) => { const c = Object.assign({}, s); delete c.vary; return c; };
const specs = () => ({ PRACTICE: PRACTICE.map(clean), PLACEMENT: PLACEMENT.map(clean) });

module.exports = { UNIT: "debugging-gcse", PREFIX: "bug", PRACTICE, PLACEMENT, OVERRIDES, specs };
