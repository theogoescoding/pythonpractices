// One-off (2026-11, confirmed by the teacher): Data types and casting now comes between Variables and Maths, before
// students meet round() (Maths) or if/else (Selection). The 11 Data types tasks that used them are replaced by tasks
// with the same level, type and skills that use only casting, types, + - * / and comparisons giving True/False:
//   types-L5c -> types-L5d   types-L8a -> types-L8d   types-L8b -> types-L8e   types-L9a -> types-L9d
//   types-L9b -> types-L9e   types-L9c -> types-L9f   types-L10a -> types-L10d  types-L10b -> types-L10e
//   types-L10c -> types-L10f types-P7a -> types-P7c   types-P9b -> types-P9c
// Real-number sums and products use halves and quarters, which add up exactly, so no output shows 0.30000000000000004.
// Each new task lists the old id in former_ids with former_ids_are_replacements (as tools/replace-sep-end.js did):
// the old task was a different task, so its saved progress is NOT moved onto the new one.
// It also points the hand-written templates whose source was an old task at the new one, and removes the three
// write-from-scratch templates that used round(); tools/add-data-types-templates.js adds their replacements.
// Run once: node tools/replace-types-round-if.js, then build-variants, add-worked-examples, add-data-types-templates,
// derive-templates and the tests.
"use strict";
const fs = require("fs");
const path = require("path");
const { T, buildTasks } = require("./unit-tasks.js");
const { ROOT } = require("./run-python.js");

const NEW = [
  { replaces: "types-L5c", id: "types-L5d", level: 5, type: "parsons", title: "Long jump",
    description: "Arrange the lines so the program reads two long jumps in metres, casts them to real numbers, and prints whether the second jump is longer.\nOne line is not needed.",
    solution: 'jump1 = float(input("First jump (m): "))\njump2 = float(input("Second jump (m): "))\nprint("Second is longer:", jump2 > jump1)',
    distractors: ['jump1 = int(input("First jump (m): "))'], tests: [T(["2.5", "3.25"]), T(["4.1", "3.9"])],
    hints: ["A jump in metres has a decimal part, so cast it with float().", "Casting \"2.5\" with int() stops with an error: use float()."],
    tags: ["sports day", "INT_OF_DECIMAL_STRING"], skills: ["real", "casting"],
    buggy: [["INT_OF_DECIMAL_STRING", 'jump1 = int(input("First jump (m): "))\njump2 = float(input("Second jump (m): "))\nprint("Second is longer:", jump2 > jump1)']] },
  { replaces: "types-L8a", id: "types-L8d", level: 8, type: "write", title: "Paint pot",
    description: "The amount of paint in a pot is read for you as text. Cast it to a real number, then print it and whether it is more than half a litre (0.5), for example:\nLitres: 2.5\nMore than half a litre: True",
    starter: 'paint = input("Paint in the pot (litres): ")\n# Cast paint to a real number, then print the two lines',
    solution: 'paint = input("Paint in the pot (litres): ")\nlitres = float(paint)\nprint("Litres:", litres)\nprint("More than half a litre:", litres > 0.5)',
    tests: [T(["2.5"]), T(["0.25"]), T(["1"])],
    hints: ["litres = float(paint) is the casting step.", "litres > 0.5 gives a Boolean: True or False. Print each label and value with a comma."],
    tags: ["art room", "INT_OF_DECIMAL_STRING"], skills: ["real", "casting"],
    buggy: [["INT_OF_DECIMAL_STRING", 'paint = input("Paint in the pot (litres): ")\nlitres = int(paint)\nprint("Litres:", litres)\nprint("More than half a litre:", litres > 0.5)']] },
  { replaces: "types-L8b", id: "types-L8e", level: 8, type: "write", title: "Cinema snacks",
    description: "The number of tickets and the price of a drink are read for you as text. Cast each to the right type (tickets are counted; a price has pence), then print each value and its type, for example:\nTickets: 3 <class 'int'>\nDrink (£): 1.5 <class 'float'>",
    starter: 'tickets_text = input("Tickets: ")\nprice_text = input("Drink price (£): ")\n# Cast each one to the right type, then print each value and its type',
    solution: 'tickets_text = input("Tickets: ")\nprice_text = input("Drink price (£): ")\ntickets = int(tickets_text)\nprice = float(price_text)\nprint("Tickets:", tickets, type(tickets))\nprint("Drink (£):", price, type(price))',
    tests: [T(["3", "1.5"]), T(["4", "2"]), T(["10", "0.95"])],
    hints: ["Tickets are a whole number, so the casting is int(). A price has pence, so it is float().", "type() shows the type; casting \"2\" with float() gives 2.0."],
    tags: ["cinema", "INT_OF_DECIMAL_STRING"], skills: ["type-choice", "casting"],
    buggy: [["INT_OF_DECIMAL_STRING", 'tickets_text = input("Tickets: ")\nprice_text = input("Drink price (£): ")\ntickets = int(tickets_text)\nprice = int(price_text)\nprint("Tickets:", tickets, type(tickets))\nprint("Drink (£):", price, type(price))']] },
  { replaces: "types-L9a", id: "types-L9d", level: 9, type: "write", title: "Seats left",
    description: "A coach has 52 seats. Ask how many pupils are going, cast the input to the right type, and print how many seats are left, for example:\nSeats left: 22\nAdd a comment saying why you chose that type.",
    starter: "# Write your program here",
    solution: 'pupils = int(input("Pupils: "))  # pupils are counted in whole numbers, so int\nprint("Seats left:", 52 - pupils)',
    tests: [T(["30"]), T(["52"]), T(["7"])],
    hints: ["Pupils are counted, so they are a whole number.", "Casting with int() first lets you take the pupils away from 52."],
    tags: ["school trip", "INPUT_NOT_INT"], skills: ["integer", "type-choice", "casting"],
    buggy: [["INPUT_NOT_INT", 'pupils = input("Pupils: ")\nprint("Seats left:", 52 - pupils)']] },
  { replaces: "types-L9b", id: "types-L9e", level: 9, type: "write", title: "Below freezing",
    description: "Ask for today's temperature in °C (it can have decimals), cast the input to the right type, and print it and whether it is below freezing (below 0), for example:\nTemperature (°C): -2.5\nBelow freezing: True\nAdd a comment saying why you chose that type.",
    starter: "# Write your program here",
    solution: 'temp = float(input("Temperature (°C): "))  # a temperature can have a decimal part, so float\nprint("Temperature (°C):", temp)\nprint("Below freezing:", temp < 0)',
    tests: [T(["-2.5"]), T(["3"]), T(["0"])],
    hints: ["A temperature can have a decimal part.", "Casting with float() first; then temp < 0 gives a Boolean."],
    tags: ["weather", "INT_OF_DECIMAL_STRING"], skills: ["real", "type-choice", "casting"],
    buggy: [["INT_OF_DECIMAL_STRING", 'temp = int(input("Temperature (°C): "))\nprint("Temperature (°C):", temp)\nprint("Below freezing:", temp < 0)']] },
  { replaces: "types-L9c", id: "types-L9f", level: 9, type: "write", title: "Trip slip",
    description: "Ask whether the trip slip has been signed (yes or no). Store the answer as a Boolean that is True only for yes, then print it and its type, for example:\nSigned: True\nType: <class 'bool'>\nAdd a comment saying why you chose that type.",
    starter: "# Write your program here",
    solution: 'answer = input("Slip signed? (yes/no): ")\nsigned = answer == "yes"  # it can only be yes or no, so a Boolean\nprint("Signed:", signed)\nprint("Type:", type(signed))',
    tests: [T(["yes"]), T(["no"])],
    hints: ["A yes/no fact suits a Boolean.", "Casting with bool(answer) would be True even for no: compare the text with == instead."],
    tags: ["school trip", "BOOL_CAST_TRAP"], skills: ["boolean", "type-choice"],
    buggy: [["BOOL_CAST_TRAP", 'answer = input("Slip signed? (yes/no): ")\nsigned = bool(answer)\nprint("Signed:", signed)\nprint("Type:", type(signed))']] },
  { replaces: "types-L10a", id: "types-L10d", level: 10, type: "write", title: "Trip summary",
    description: "Ask for the name of a school trip, the number of pupils going, the cost per pupil in pounds, and whether the deposit has been paid (yes or no). Cast each value to a suitable type. Print each value, with its type after the number and the Boolean, for example:\nTrip: Museum\nPupils: 30 <class 'int'>\nCost per pupil (£): 8.5 <class 'float'>\nDeposit paid: True <class 'bool'>\nDeposit paid is True only for yes.",
    starter: "# Write your program here",
    solution: 'trip = input("Trip: ")\npupils = int(input("Pupils: "))\ncost = float(input("Cost per pupil (£): "))\npaid = input("Deposit paid? (yes/no): ") == "yes"\nprint("Trip:", trip)\nprint("Pupils:", pupils, type(pupils))\nprint("Cost per pupil (£):", cost, type(cost))\nprint("Deposit paid:", paid, type(paid))',
    tests: [T(["Museum", "30", "8.5", "yes"]), T(["Zoo", "25", "12", "no"]), T(["Theatre", "12", "15.75", "yes"])],
    hints: ["Pupils are counted (int), a cost has pence (float), a yes/no fact is a Boolean, and the trip name stays a string.",
      "Casting with bool() would make every answer True: compare the answer with == \"yes\".", "type() shows each value's type: print it after the value, with a comma."],
    tags: ["school trip", "INT_OF_DECIMAL_STRING", "BOOL_CAST_TRAP"], skills: ["type-choice", "casting", "real"],
    buggy: [["INT_OF_DECIMAL_STRING", 'trip = input("Trip: ")\npupils = int(input("Pupils: "))\ncost = int(input("Cost per pupil (£): "))\npaid = input("Deposit paid? (yes/no): ") == "yes"\nprint("Trip:", trip)\nprint("Pupils:", pupils, type(pupils))\nprint("Cost per pupil (£):", cost, type(cost))\nprint("Deposit paid:", paid, type(paid))'],
      ["BOOL_CAST_TRAP", 'trip = input("Trip: ")\npupils = int(input("Pupils: "))\ncost = float(input("Cost per pupil (£): "))\npaid = bool(input("Deposit paid? (yes/no): "))\nprint("Trip:", trip)\nprint("Pupils:", pupils, type(pupils))\nprint("Cost per pupil (£):", cost, type(cost))\nprint("Deposit paid:", paid, type(paid))']] },
  { replaces: "types-L10b", id: "types-L10e", level: 10, type: "write", title: "Relay times",
    description: "Ask for the three leg times of a relay race in seconds (they can have decimals), and cast each one. Add them up, then print the total, its type, and whether the team was under 40 seconds, for example:\nTotal (s): 38.5\nType: <class 'float'>\nUnder 40 seconds: True",
    starter: "# Write your program here",
    solution: 'a = float(input("Leg 1 (s): "))\nb = float(input("Leg 2 (s): "))\nc = float(input("Leg 3 (s): "))\ntotal = a + b + c\nprint("Total (s):", total)\nprint("Type:", type(total))\nprint("Under 40 seconds:", total < 40)',
    tests: [T(["12.5", "13.25", "12.75"]), T(["10", "11", "12"]), T(["14.25", "13.75", "15"])],
    hints: ["Each time needs casting with float(), because it can have a decimal part.", "Adding real numbers gives a real number: Python calls this type float.", "total < 40 gives True or False."],
    tags: ["sports day", "INT_OF_DECIMAL_STRING"], skills: ["real", "casting"],
    buggy: [["INT_OF_DECIMAL_STRING", 'a = int(input("Leg 1 (s): "))\nb = float(input("Leg 2 (s): "))\nc = float(input("Leg 3 (s): "))\ntotal = a + b + c\nprint("Total (s):", total)\nprint("Type:", type(total))\nprint("Under 40 seconds:", total < 40)']] },
  { replaces: "types-L10c", id: "types-L10f", level: 10, type: "write", title: "Book fair order",
    description: "Ask how many books are wanted, the price of one book in pounds, and whether the buyer is a club member (yes or no). Cast each value to a suitable type. Print the total cost (the number of books times the price) and whether they are a member, for example:\nTotal (£): 15.0\nMember: True",
    starter: "# Write your program here",
    solution: 'books = int(input("Books: "))\nprice = float(input("Price (£): "))\nmember = input("Member? (yes/no): ") == "yes"\nprint("Total (£):", books * price)\nprint("Member:", member)',
    tests: [T(["3", "5", "yes"]), T(["2", "4.5", "no"]), T(["4", "2.25", "no"])],
    hints: ["Books are counted (int), a price has pence (float), and member is a Boolean.", "Casting with bool() would give True even for no: compare the answer with == \"yes\".",
      "A whole number times a real number gives a real number."],
    tags: ["book fair", "BOOL_CAST_TRAP", "INPUT_NOT_INT"], skills: ["integer", "real", "boolean"],
    buggy: [["BOOL_CAST_TRAP", 'books = int(input("Books: "))\nprice = float(input("Price (£): "))\nmember = bool(input("Member? (yes/no): "))\nprint("Total (£):", books * price)\nprint("Member:", member)'],
      ["INPUT_NOT_INT", 'books = input("Books: ")\nprice = float(input("Price (£): "))\nmember = input("Member? (yes/no): ") == "yes"\nprint("Total (£):", books * price)\nprint("Member:", member)']] },
  { replaces: "types-P7a", id: "types-P7c", level: 7, type: "fill", title: "Price and type", placement: true,
    description: "Write the missing line that reads the price and casts it to a real number called price.",
    starter: '____\nprint("Price (£):", price)\nprint("Type:", type(price))', answers: ['price = float(input("Price (£): "))'],
    tests: [T(["10"]), T(["2.5"])],
    hints: ["The variable must be called price.", "A price can have pence, so use float() casting."], tags: ["shop prices", "whole line"], skills: ["real", "casting"] },
  { replaces: "types-P9b", id: "types-P9c", level: 9, type: "write", title: "Heavy bag", placement: true,
    description: "Ask for a bag's weight in kilograms (it can have a decimal part), cast it, then print it and whether it is more than 2 kg, for example:\nWeight (kg): 2.5\nMore than 2 kg: True",
    starter: "# Write the whole program here",
    solution: 'kg = float(input("Weight (kg): "))\nprint("Weight (kg):", kg)\nprint("More than 2 kg:", kg > 2)',
    tests: [T(["2.5"]), T(["0.75"]), T(["3"])],
    hints: ["Casting with float(), because the weight can have a decimal part.", "kg > 2 gives True or False."], tags: ["weights", "INT_OF_DECIMAL_STRING"], skills: ["real", "casting"],
    buggy: [["INT_OF_DECIMAL_STRING", 'kg = int(input("Weight (kg): "))\nprint("Weight (kg):", kg)\nprint("More than 2 kg:", kg > 2)']] },
];

// Hand-written templates that pointed at an old task (for "Show me how"), and the from-scratch ones that used round().
const NEW_SOURCE = { "comb-types-trip-share": "types-L9e", "comb-types-basket": "types-L8d", "comb-types-register": "types-L9f", "comb-types-maths-area": "types-L5d" };
const REMOVE_TEMPLATES = ["scratch-types-trip", "scratch-types-height", "scratch-types-receipt"];

const taskFile = path.join(ROOT, "tasks.json");
const tasks = JSON.parse(fs.readFileSync(taskFile, "utf8"));
const ids = new Set(tasks.map((t) => t.id));
for (const n of NEW) {
  if (ids.has(n.id)) throw new Error(n.id + " already exists: already run?");
  if (!ids.has(n.replaces)) throw new Error(n.replaces + " not found");
}
const built = buildTasks("data-types", NEW);
const bad = built.filter((t) => /\bround\(|^\s*(if|elif|else)\b/m.test([t.solution, t.starter].concat(t.distractors || [], (t.buggy_variants || []).map((v) => v.code)).join("\n")));
if (bad.length) throw new Error("still uses round() or if/else: " + bad.map((t) => t.id));
built.forEach((t, i) => {
  const at = tasks.findIndex((x) => x.id === NEW[i].replaces);
  const old = tasks[at];
  if (old.level !== t.level || old.type !== t.type || old.tags.includes("placement") !== t.tags.includes("placement")) throw new Error(t.id + ": level, type or placement differs from " + old.id);
  tasks.splice(at, 1, Object.assign(t, { former_ids: [NEW[i].replaces], former_ids_are_replacements: true }));
});
fs.writeFileSync(taskFile, JSON.stringify(tasks, null, 2) + "\n");

const tplFile = path.join(ROOT, "templates.json");
const templates = JSON.parse(fs.readFileSync(tplFile, "utf8")).filter((t) => !REMOVE_TEMPLATES.includes(t.id));
for (const t of templates) if (NEW_SOURCE[t.id]) t.source = NEW_SOURCE[t.id];
fs.writeFileSync(tplFile, JSON.stringify(templates, null, 2) + "\n");
console.log("Replaced " + NEW.map((n) => n.replaces + " -> " + n.id).join(", ") + "; removed " + REMOVE_TEMPLATES.join(", ") + "; new sources for " + Object.keys(NEW_SOURCE).join(", "));
