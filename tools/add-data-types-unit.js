// One-off (2026-11): adds the "Data types and casting" unit's bank tasks to tasks.json (32 practice, 8 placement).
// Expected outputs are worked out by running each solution through harness.py, a predict task's answer is the option
// equal to the real output, and a fill task's solution is its starter with the answers filled in, so they can't
// disagree. Nothing is written unless every task is consistent.
// Run once: node tools/add-data-types-unit.js, then build-variants, add-worked-examples, derive-templates and the tests.
// Later (2026-11), when the unit moved before Maths and Selection, the 11 tasks below that use round() or if/else were
// replaced by tools/archive/replace-types-round-if.js. This file is kept as the record of the unit as first added.
"use strict";
const fs = require("fs");
const path = require("path");
const { runPython, ROOT } = require("./run-python.js");
const Checker = require(path.join(ROOT, "checker.js"));

const file = path.join(ROOT, "tasks.json");
const tasks = JSON.parse(fs.readFileSync(file, "utf8"));
if (tasks.some((t) => t.unit === "data-types")) { console.log("The data-types unit is already in tasks.json."); process.exit(0); }

const T = (inputs) => ({ inputs, expected: null }); // expected is worked out below
const PRACTICE = [
  // ---------- Level 1: predict, what type a value has ----------
  { id: "types-L1a", level: 1, type: "predict", title: "Whole numbers",
    description: "type() tells you a value's type. What will this program print?",
    solution: 'pupils = 28\nprint(type(pupils))',
    options: ["<class 'int'>", "<class 'float'>", "<class 'str'>"], tests: [T([])],
    hints: ["28 has no decimal point and no quotes.", "A whole number is an integer: Python calls this type int."],
    tags: ["type()", "register counts"], skills: ["integer"] },
  { id: "types-L1b", level: 1, type: "predict", title: "Number or text?",
    description: "type() tells you a value's type. What will this program print?",
    solution: 'locker = "42"\nprint(type(locker))',
    options: ["<class 'int'>", "<class 'str'>", "<class 'float'>"], tests: [T([])],
    hints: ["Look carefully: is there anything around the 42?", "Anything in quotes is a string (str), even if it looks like a number."],
    tags: ["type()", "quotes"], skills: ["string"] },
  { id: "types-L1c", level: 1, type: "predict", title: "Real numbers",
    description: "A real number has a decimal point, and Python calls this type float. What will this program print?",
    solution: 'height = 1.65\nprint(type(height))',
    options: ["<class 'int'>", "<class 'real'>", "<class 'float'>"], tests: [T([])],
    hints: ["1.65 has a decimal point.", "Python's name for a real number is float."],
    tags: ["type()", "heights"], skills: ["real"] },
  { id: "types-L1d", level: 1, type: "predict", title: "True or False",
    description: "A comparison gives a Boolean: True or False. What will this program print?",
    solution: 'late = 9 > 8\nprint(late)\nprint(type(late))',
    options: ["True\n<class 'bool'>", "True\n<class 'str'>", "9 > 8\n<class 'bool'>"], tests: [T([])],
    hints: ["Work out 9 > 8 first: is it true?", "Python calls the True/False type bool, short for Boolean."],
    tags: ["type()", "comparison"], skills: ["boolean"] },

  // ---------- Level 2: predict, int and float printing, the type a division gives, and the two traps ----------
  { id: "types-L2a", level: 2, type: "predict", title: "7 or 7.0?",
    description: "Integers and real numbers print differently. What will this program print?",
    solution: 'print(7)\nprint(7.0)\nprint(14 / 2)',
    options: ["7\n7\n7", "7\n7.0\n7", "7\n7.0\n7.0"], tests: [T([])],
    hints: ["7.0 is a real number (float), so Python shows the .0.", "Dividing with / always gives a float, even when it divides exactly."],
    tags: ["int vs float", "division"], skills: ["integer", "real"] },
  { id: "types-L2b", level: 2, type: "predict", title: "Sharing into groups",
    description: "30 pupils are split into 5 groups. What will this program print?",
    solution: 'pupils = 30\ngroups = 5\nper_group = pupils / groups\nprint("Per group:", per_group)\nprint(type(per_group))',
    options: ["Per group: 6\n<class 'int'>", "Per group: 6.0\n<class 'float'>", "Per group: 6.0\n<class 'int'>"], tests: [T([])],
    hints: ["What type does / give?", "/ always gives a real number (float). The comma in print() puts a space after the label."],
    tags: ["division", "int vs float"], skills: ["real", "type-choice"] },
  { id: "types-L2c", level: 2, type: "predict", title: "Joined or added?",
    description: "The user types 12, then 3. What will this program print?\nUsing int() on the input is called casting.",
    solution: 'monday = input("Books on Monday: ")\ntuesday = input("Books on Tuesday: ")\nprint("Total:", monday + tuesday)\nprint("Total:", int(monday) + int(tuesday))',
    options: ["Total: 123\nTotal: 15", "Total:123\nTotal:15", "Total: 15\nTotal: 15", "Total: 123\nTotal: 123"], tests: [T(["12", "3"])],
    hints: ["input() always gives back a string, even when the user types digits.", "+ on two strings joins them. Casting with int() first makes + add them.",
      "The comma in print() puts one space between the label and the value."],
    tags: ["int() on input", "library books", "INPUT_NOT_INT"], skills: ["casting", "string"],
    buggy: [["INPUT_NOT_INT", 'monday = input("Books on Monday: ")\ntuesday = input("Books on Tuesday: ")\nprint("Total:", int(monday) + int(tuesday))\nprint("Total:", int(monday) + int(tuesday))']] },
  { id: "types-L2d", level: 2, type: "predict", title: "Is the library open?",
    description: "This program casts the input with bool(). The user types False. What will it print?",
    solution: 'open_now = bool(input("Is the library open? (True/False): "))\nprint("Open:", open_now)',
    options: ["Open: False", "Open: True", "Open: open_now"], tests: [T(["False"])],
    hints: ["input() gives the string \"False\": five letters, not the value False.", "bool() casting only checks whether the text is empty."],
    tags: ["bool() casting", "library", "BOOL_CAST_TRAP"], skills: ["boolean", "casting"],
    buggy: [["BOOL_CAST_TRAP", 'open_now = input("Is the library open? (True/False): ") == "True"\nprint("Open:", open_now)']] },

  // ---------- Level 3: fill in one blank ----------
  { id: "types-L3a", level: 3, type: "fill", title: "Next shoe size",
    description: "Fill in the blank so the program casts the shoe size to an integer, then prints the next size up.",
    starter: 'size = ____(input("Shoe size: "))\nprint("Next size up:", size + 1)', answers: ["int"],
    tests: [T(["5"]), T(["11"]), T(["2"])],
    hints: ["A shoe size here is a whole number.", "Which casting function turns text into an integer?"],
    tags: ["shoe sizes", "INPUT_NOT_INT"], skills: ["integer", "casting"],
    buggy: [["INPUT_NOT_INT", 'size = input("Shoe size: ")\nprint("Next size up:", size + 1)']] },
  { id: "types-L3b", level: 3, type: "fill", title: "Return bus fare",
    description: "Fill in the blank so the program casts the fare to a real number (a float), then prints the return fare.",
    starter: 'fare = ____(input("Fare (£): "))\nprint("Return fare (£):", fare * 2)', answers: ["float"],
    tests: [T(["1.5"]), T(["2.25"]), T(["2"])],
    hints: ["The fare can have pence after a decimal point.", "Casting with int() fails on \"1.5\". Which casting function takes a decimal?"],
    tags: ["bus fares", "INT_OF_DECIMAL_STRING"], skills: ["real", "casting"],
    buggy: [["INT_OF_DECIMAL_STRING", 'fare = int(input("Fare (£): "))\nprint("Return fare (£):", fare * 2)']] },
  { id: "types-L3c", level: 3, type: "fill", title: "Open or closed",
    description: "Fill in the blank so is_open is True only when the user types yes.",
    starter: 'answer = input("Is the library open? (yes/no): ")\nis_open = answer ____ "yes"\nprint("Open:", is_open)', answers: ["=="],
    tests: [T(["yes"]), T(["no"])],
    hints: ["A comparison gives a Boolean, True or False.", "Casting with bool(answer) would be True for any word, even no. Compare the text instead."],
    tags: ["library", "BOOL_CAST_TRAP"], skills: ["boolean"],
    buggy: [["BOOL_CAST_TRAP", 'answer = input("Is the library open? (yes/no): ")\nis_open = bool(answer)\nprint("Open:", is_open)']] },

  // ---------- Level 4: fill in two blanks (float(), str(), int(), type()) ----------
  { id: "types-L4a", level: 4, type: "fill", title: "Price tag",
    description: "Fill in both blanks: cast the price to a real number, then cast it back to a string to build the price tag.",
    starter: 'price = ____(input("Price (£): "))\nlabel = "£" + ____(price)\nprint("Price tag:", label)', answers: ["float", "str"],
    tests: [T(["2.5"]), T(["0.99"]), T(["3"])],
    hints: ["The label is built with + and stored before it is printed, so its pieces must all be strings. That is why str() casting is needed there.",
      "float() casts text to a real number; str() casts a number back to text."],
    tags: ["shop prices", "STRING_PLUS_INT"], skills: ["real", "string", "casting"],
    buggy: [["STRING_PLUS_INT", 'price = float(input("Price (£): "))\nlabel = "£" + price\nprint("Price tag:", label)']] },
  { id: "types-L4b", level: 4, type: "fill", title: "Bag weight",
    description: "Fill in both blanks: cast the weight to a real number, then print its type with commas.",
    starter: 'weight = ____(input("Bag weight (kg): "))\nprint("Weight (kg):", weight, "Type:", ____(weight))', answers: ["float", "type"],
    tests: [T(["4.5"]), T(["3"])],
    hints: ["A weight can have a decimal part, so cast it with float().", "Which function tells you a value's type?"],
    tags: ["weights", "INT_OF_DECIMAL_STRING"], skills: ["real", "type-choice"],
    buggy: [["INT_OF_DECIMAL_STRING", 'weight = int(input("Bag weight (kg): "))\nprint("Weight (kg):", weight, "Type:", type(weight))']] },
  { id: "types-L4c", level: 4, type: "fill", title: "Library code",
    description: "Fill in both blanks: cast the number of books to an integer, then cast it to a string to build the code.",
    starter: 'books = ____(input("Books borrowed: "))\ncode = "B" + ____(books)\nprint("Code:", code)\nprint("Books next week:", books + 1)', answers: ["int", "str"],
    tests: [T(["3"]), T(["12"])],
    hints: ["The code is built with + and stored, so each piece must be a string: that's why it needs str() casting.",
      "books is used for maths on the last line, so it must be cast to an integer first."],
    tags: ["library books", "INPUT_NOT_INT"], skills: ["integer", "string", "casting"],
    buggy: [["INPUT_NOT_INT", 'books = input("Books borrowed: ")\ncode = "B" + books\nprint("Code:", code)\nprint("Books next week:", books + 1)']] },

  // ---------- Level 5: Parsons, short, one distractor ----------
  { id: "types-L5a", level: 5, type: "parsons", title: "Two snacks",
    description: "Arrange the lines so the program reads two prices, casts them to real numbers and prints the total with commas.\nOne line is not needed.",
    solution: 'a = float(input("First snack (£): "))\nb = float(input("Second snack (£): "))\nprint("Total (£):", a + b)',
    distractors: ['a = input("First snack (£): ")'], tests: [T(["1.5", "2.25"]), T(["0.5", "0.75"])],
    hints: ["Both prices need casting before they can be added.", "Without float(), a would be a string and + would fail."],
    tags: ["shop prices", "INPUT_NOT_INT"], skills: ["real", "casting"],
    buggy: [["INPUT_NOT_INT", 'a = input("First snack (£): ")\nb = float(input("Second snack (£): "))\nprint("Total (£):", a + b)']] },
  { id: "types-L5b", level: 5, type: "parsons", title: "Class size",
    description: "Arrange the lines so the program reads two whole numbers, casts them and prints the class size with commas.\nOne line is not needed.",
    solution: 'boys = int(input("Boys: "))\ngirls = int(input("Girls: "))\nprint("Class size:", boys + girls)',
    distractors: ['print("Class size:" + boys + girls)'], tests: [T(["14", "13"]), T(["9", "16"])],
    hints: ["Cast each input with int(), because a count is a whole number.", "Print with a comma: + can't join text to a number."],
    tags: ["register counts", "STRING_PLUS_INT"], skills: ["integer", "casting"],
    buggy: [["STRING_PLUS_INT", 'boys = int(input("Boys: "))\ngirls = int(input("Girls: "))\nprint("Class size:" + boys + girls)']] },
  { id: "types-L5c", level: 5, type: "parsons", title: "Height difference",
    description: "Arrange the lines so the program reads two heights in metres, casts them and prints the difference, rounded to 2 places.\nOne line is not needed.",
    solution: 'h1 = float(input("Height 1 (m): "))\nh2 = float(input("Height 2 (m): "))\nprint("Difference (m):", round(h1 - h2, 2))',
    distractors: ['h1 = int(input("Height 1 (m): "))'], tests: [T(["1.62", "1.5"]), T(["1.8", "1.75"])],
    hints: ["Heights in metres have a decimal part.", "Casting \"1.62\" with int() stops with an error: use float()."],
    tags: ["heights", "INT_OF_DECIMAL_STRING"], skills: ["real", "casting"],
    buggy: [["INT_OF_DECIMAL_STRING", 'h1 = int(input("Height 1 (m): "))\nh2 = float(input("Height 2 (m): "))\nprint("Difference (m):", round(h1 - h2, 2))']] },

  // ---------- Level 6: Parsons, choose int or float, two distractors ----------
  { id: "types-L6a", level: 6, type: "parsons", title: "Bus journeys",
    description: "Arrange the lines so the program reads the number of journeys (a whole number) and the fare (a real number), casting each to the right type, then prints the cost.\nTwo lines are not needed.",
    solution: 'journeys = int(input("Journeys: "))\nfare = float(input("Fare (£): "))\nprint("Cost (£):", journeys * fare)',
    distractors: ['fare = int(input("Fare (£): "))', 'print("Cost (£): " + journeys * fare)'], tests: [T(["3", "1.5"]), T(["2", "2.25"]), T(["4", "2"])],
    hints: ["Journeys are counted, so int. A fare has pence, so float.", "Print with a comma: + can't join text to a number."],
    tags: ["bus fares", "INT_OF_DECIMAL_STRING", "STRING_PLUS_INT"], skills: ["type-choice", "casting"],
    buggy: [["INT_OF_DECIMAL_STRING", 'journeys = int(input("Journeys: "))\nfare = int(input("Fare (£): "))\nprint("Cost (£):", journeys * fare)'],
      ["STRING_PLUS_INT", 'journeys = int(input("Journeys: "))\nfare = float(input("Fare (£): "))\nprint("Cost (£): " + journeys * fare)']] },
  { id: "types-L6b", level: 6, type: "parsons", title: "Library flag",
    description: "Arrange the lines so the program stores whether the library is open as a Boolean (True only for yes), then prints it and its type.\nTwo lines are not needed.",
    solution: 'answer = input("Is the library open? (yes/no): ")\nis_open = answer == "yes"\nprint("Library open:", is_open)\nprint("Type:", type(is_open))',
    distractors: ["is_open = bool(answer)", 'is_open = "answer" == "yes"'], tests: [T(["yes"]), T(["no"])],
    hints: ["Casting with bool(answer) gives True for any word at all.", "Compare the variable answer, not the text \"answer\"."],
    tags: ["library", "BOOL_CAST_TRAP"], skills: ["boolean", "type-choice"],
    buggy: [["BOOL_CAST_TRAP", 'answer = input("Is the library open? (yes/no): ")\nis_open = bool(answer)\nprint("Library open:", is_open)\nprint("Type:", type(is_open))']] },
  { id: "types-L6c", level: 6, type: "parsons", title: "Shoes and heights",
    description: "Arrange the lines so the program reads a shoe size (a whole number) and a height in metres (a real number), casting each to the right type, then prints both.\nTwo lines are not needed.",
    solution: 'size = int(input("Shoe size: "))\nheight = float(input("Height (m): "))\nprint("Size", size, "and height", height, "m")',
    distractors: ['size = float(input("Shoe size: "))', 'height = int(input("Height (m): "))'], tests: [T(["5", "1.52"]), T(["9", "1.7"])],
    hints: ["A shoe size here is a whole number, so cast it with int(): float() would print 5.0.", "A height has a decimal part, so cast it with float()."],
    tags: ["shoe sizes", "heights", "INT_OF_DECIMAL_STRING"], skills: ["type-choice", "integer", "real"],
    buggy: [["INT_OF_DECIMAL_STRING", 'size = int(input("Shoe size: "))\nheight = int(input("Height (m): "))\nprint("Size", size, "and height", height, "m")']] },

  // ---------- Level 7: fill in a whole line ----------
  { id: "types-L7a", level: 7, type: "fill", title: "Books left to read",
    description: "The reading target is 10 books. Write the missing line that reads the number of books borrowed and casts it to an integer.",
    starter: '____\nprint("Books borrowed:", books)\nprint("Books left to read:", 10 - books)', answers: ['books = int(input("Books borrowed: "))'],
    tests: [T(["3"]), T(["7"]), T(["10"])],
    hints: ["The variable must be called books.", "input() gives a string, so cast it with int() before the maths on the last line."],
    tags: ["library books", "whole line", "INPUT_NOT_INT"], skills: ["integer", "casting"],
    buggy: [["INPUT_NOT_INT", 'books = input("Books borrowed: ")\nprint("Books borrowed:", books)\nprint("Books left to read:", 10 - books)']] },
  { id: "types-L7b", level: 7, type: "fill", title: "Warmer tomorrow",
    description: "Write the missing line that casts the temperature text to a real number called temp_c.",
    starter: 'temp = input("Temperature (°C): ")\n____\nprint("Tomorrow (°C):", temp_c + 1.5)', answers: ["temp_c = float(temp)"],
    tests: [T(["12.5"]), T(["-2"]), T(["20"])],
    hints: ["The temperature can have a decimal part.", "Casting with int() fails on \"12.5\": use float()."],
    tags: ["weather", "whole line", "INT_OF_DECIMAL_STRING"], skills: ["real", "casting"],
    buggy: [["INT_OF_DECIMAL_STRING", 'temp = input("Temperature (°C): ")\ntemp_c = int(temp)\nprint("Tomorrow (°C):", temp_c + 1.5)']] },
  { id: "types-L7c", level: 7, type: "fill", title: "Library card",
    description: "Write the missing line that builds the text for the card, for example Age 12, and stores it in card.",
    starter: 'age = int(input("Age: "))\n____\nprint("Card:", card)', answers: ['card = "Age " + str(age)'],
    tests: [T(["12"]), T(["15"])],
    hints: ["The card text is built with + and stored in card, so every piece must be a string.", "age is an integer, so cast it with str() before joining it."],
    tags: ["library", "whole line", "STRING_PLUS_INT"], skills: ["string", "casting"],
    buggy: [["STRING_PLUS_INT", 'age = int(input("Age: "))\ncard = "Age " + age\nprint("Card:", card)']] },

  // ---------- Level 8: write, part of the program given ----------
  { id: "types-L8a", level: 8, type: "write", title: "Tuck shop",
    description: "The price is read for you as text. Cast it to a real number, then print what 3 of them cost, rounded to 2 places, for example:\n3 items cost (£): 1.35",
    starter: 'price_text = input("Price (£): ")\n# Cast price_text to a real number, then print the cost of 3',
    solution: 'price_text = input("Price (£): ")\nprice = float(price_text)\nprint("3 items cost (£):", round(price * 3, 2))',
    tests: [T(["0.45"]), T(["1.2"]), T(["2"])],
    hints: ["price = float(price_text) is the casting step.", "Use round(..., 2), and print the label and the value with a comma."],
    tags: ["shop prices", "INT_OF_DECIMAL_STRING"], skills: ["real", "casting"],
    buggy: [["INT_OF_DECIMAL_STRING", 'price_text = input("Price (£): ")\nprice = int(price_text)\nprint("3 items cost (£):", round(price * 3, 2))']] },
  { id: "types-L8b", level: 8, type: "write", title: "Bus pass",
    description: "The number of rides and the fare are read for you as text. Cast each to the right type (rides are counted; a fare has pence), then print the total rounded to 2 places, for example:\nTotal (£): 5.0",
    starter: 'rides_text = input("Rides this week: ")\nfare_text = input("Fare (£): ")\n# Cast each one to the right type, then print the total',
    solution: 'rides_text = input("Rides this week: ")\nfare_text = input("Fare (£): ")\nrides = int(rides_text)\nfare = float(fare_text)\nprint("Total (£):", round(rides * fare, 2))',
    tests: [T(["4", "1.25"]), T(["10", "0.8"]), T(["3", "2"])],
    hints: ["Rides are a whole number: int(). A fare has pence: float().", "Use round(..., 2), and print with a comma."],
    tags: ["bus fares", "INT_OF_DECIMAL_STRING"], skills: ["type-choice", "casting"],
    buggy: [["INT_OF_DECIMAL_STRING", 'rides_text = input("Rides this week: ")\nfare_text = input("Fare (£): ")\nrides = int(rides_text)\nfare = int(fare_text)\nprint("Total (£):", round(rides * fare, 2))']] },
  { id: "types-L8c", level: 8, type: "write", title: "Shoe size label",
    description: "The shoe size is read for you as text. Cast it to an integer, then print it and the next size up, for example:\nSize: 5\nNext size up: 6",
    starter: 'size_text = input("Shoe size: ")\n# Cast size_text to an integer, then print the two lines',
    solution: 'size_text = input("Shoe size: ")\nsize = int(size_text)\nprint("Size:", size)\nprint("Next size up:", size + 1)',
    tests: [T(["5"]), T(["12"])],
    hints: ["size = int(size_text) is the casting step.", "Print each label and value with a comma."],
    tags: ["shoe sizes", "INPUT_NOT_INT"], skills: ["integer", "casting"],
    buggy: [["INPUT_NOT_INT", 'size_text = input("Shoe size: ")\nprint("Size:", size_text)\nprint("Next size up:", size_text + 1)']] },

  // ---------- Level 9: write a whole program, choosing a type ----------
  { id: "types-L9a", level: 9, type: "write", title: "Library fine",
    description: "A library charges £0.20 for each day a book is late. Ask how many days late it is, cast the input to the right type, and print the fine rounded to 2 places, for example:\nFine (£): 0.6\nAdd a comment saying why you chose that type.",
    starter: "# Write your program here",
    solution: 'days = int(input("Days late: "))  # days are counted in whole numbers, so int\nprint("Fine (£):", round(days * 0.2, 2))',
    tests: [T(["3"]), T(["10"]), T(["0"])],
    hints: ["Days are counted, so they are a whole number.", "Casting with int() first, then multiply by 0.2 and round to 2 places."],
    tags: ["library fines", "INPUT_NOT_INT"], skills: ["integer", "type-choice", "casting"],
    buggy: [["INPUT_NOT_INT", 'days = input("Days late: ")\nprint("Fine (£):", round(days * 0.2, 2))']] },
  { id: "types-L9b", level: 9, type: "write", title: "Height in centimetres",
    description: "Ask for a pupil's height in metres, cast the input to the right type, and print it in centimetres as a whole number using round(), for example:\nHeight (cm): 152\nAdd a comment saying why you chose that type.",
    starter: "# Write your program here",
    solution: 'height = float(input("Height (m): "))  # a height has a decimal part, so float\nprint("Height (cm):", round(height * 100))',
    tests: [T(["1.52"]), T(["1.6"]), T(["2"])],
    hints: ["A height in metres has a decimal part.", "Casting with float(), then round(height * 100) gives a whole number of centimetres."],
    tags: ["heights", "INT_OF_DECIMAL_STRING"], skills: ["real", "type-choice", "casting"],
    buggy: [["INT_OF_DECIMAL_STRING", 'height = int(input("Height (m): "))\nprint("Height (cm):", round(height * 100))']] },
  { id: "types-L9c", level: 9, type: "write", title: "Trip slip",
    description: "Ask whether the trip slip has been signed (yes or no). Store the answer as a Boolean that is True only for yes, then print it, and then \"You can go on the trip\" or \"Please bring your slip\", for example:\nSigned: True\nYou can go on the trip\nAdd a comment saying why you chose that type.",
    starter: "# Write your program here",
    solution: 'answer = input("Slip signed? (yes/no): ")\nsigned = answer == "yes"  # it can only be yes or no, so a Boolean\nprint("Signed:", signed)\nif signed:\n    print("You can go on the trip")\nelse:\n    print("Please bring your slip")',
    tests: [T(["yes"]), T(["no"])],
    hints: ["A yes/no fact suits a Boolean.", "Casting with bool(answer) would be True even for no: compare the text with == instead."],
    tags: ["school trip", "BOOL_CAST_TRAP"], skills: ["boolean", "type-choice"],
    buggy: [["BOOL_CAST_TRAP", 'answer = input("Slip signed? (yes/no): ")\nsigned = bool(answer)\nprint("Signed:", signed)\nif signed:\n    print("You can go on the trip")\nelse:\n    print("Please bring your slip")']] },

  // ---------- Level 10: write an extended program ----------
  { id: "types-L10a", level: 10, type: "write", title: "Trip summary",
    description: "Ask for the name of a school trip, the number of pupils going, the cost per pupil in pounds, and whether the deposit has been paid (yes or no). Cast each value to a suitable type. Print, for example:\nTrip: Museum\nPupils: 30\nTotal (£): 255.0\nDeposit paid: True\nRound the total to 2 places. Deposit paid is True only for yes.",
    starter: "# Write your program here",
    solution: 'trip = input("Trip: ")\npupils = int(input("Pupils: "))\ncost = float(input("Cost per pupil (£): "))\npaid = input("Deposit paid? (yes/no): ") == "yes"\nprint("Trip:", trip)\nprint("Pupils:", pupils)\nprint("Total (£):", round(pupils * cost, 2))\nprint("Deposit paid:", paid)',
    tests: [T(["Museum", "30", "8.5", "yes"]), T(["Zoo", "25", "12", "no"]), T(["Theatre", "12", "15.75", "yes"])],
    hints: ["Pupils are counted (int), a cost has pence (float), a yes/no fact is a Boolean, and the trip name stays a string.",
      "Casting with bool() would make every answer True: compare the answer with == \"yes\".", "Print each label and value with a comma."],
    tags: ["school trip", "INT_OF_DECIMAL_STRING", "BOOL_CAST_TRAP"], skills: ["type-choice", "casting", "real"],
    buggy: [["INT_OF_DECIMAL_STRING", 'trip = input("Trip: ")\npupils = int(input("Pupils: "))\ncost = int(input("Cost per pupil (£): "))\npaid = input("Deposit paid? (yes/no): ") == "yes"\nprint("Trip:", trip)\nprint("Pupils:", pupils)\nprint("Total (£):", round(pupils * cost, 2))\nprint("Deposit paid:", paid)'],
      ["BOOL_CAST_TRAP", 'trip = input("Trip: ")\npupils = int(input("Pupils: "))\ncost = float(input("Cost per pupil (£): "))\npaid = bool(input("Deposit paid? (yes/no): "))\nprint("Trip:", trip)\nprint("Pupils:", pupils)\nprint("Total (£):", round(pupils * cost, 2))\nprint("Deposit paid:", paid)']] },
  { id: "types-L10b", level: 10, type: "write", title: "Race times",
    description: "Ask for three race times in seconds (they can have decimals). Cast each one. Print the total and the mean, each rounded to 2 places, and the type of the mean, for example:\nTotal (s): 38.4\nMean (s): 12.8\nType: <class 'float'>",
    starter: "# Write your program here",
    solution: 'a = float(input("Time 1 (s): "))\nb = float(input("Time 2 (s): "))\nc = float(input("Time 3 (s): "))\ntotal = a + b + c\nmean = total / 3\nprint("Total (s):", round(total, 2))\nprint("Mean (s):", round(mean, 2))\nprint("Type:", type(mean))',
    tests: [T(["12.5", "13.1", "12.8"]), T(["10", "11", "12"]), T(["14.25", "13.75", "15"])],
    hints: ["Each time needs casting with float(), because it can have a decimal part.", "The mean is total / 3, and / always gives a float.", "Use round(..., 2) for both."],
    tags: ["sports day", "INT_OF_DECIMAL_STRING"], skills: ["real", "casting"],
    buggy: [["INT_OF_DECIMAL_STRING", 'a = int(input("Time 1 (s): "))\nb = float(input("Time 2 (s): "))\nc = float(input("Time 3 (s): "))\ntotal = a + b + c\nmean = total / 3\nprint("Total (s):", round(total, 2))\nprint("Mean (s):", round(mean, 2))\nprint("Type:", type(mean))']] },
  { id: "types-L10c", level: 10, type: "write", title: "Book fair order",
    description: "Ask how many books are wanted, the price of one book in pounds, and whether the buyer is a club member (yes or no). Cast each value to a suitable type. Members get 10% off. Print the total rounded to 2 places, then \"Member discount applied\" if they are a member, for example:\nTotal (£): 13.5\nMember discount applied",
    starter: "# Write your program here",
    solution: 'books = int(input("Books: "))\nprice = float(input("Price (£): "))\nmember = input("Member? (yes/no): ") == "yes"\ntotal = books * price\nif member:\n    total = total * 0.9\nprint("Total (£):", round(total, 2))\nif member:\n    print("Member discount applied")',
    tests: [T(["3", "5", "yes"]), T(["2", "4.99", "no"]), T(["4", "2.5", "no"])],
    hints: ["Books are counted (int), a price has pence (float), and member is a Boolean.", "Casting with bool() would give True even for no: compare the answer with == \"yes\".",
      "Multiply by 0.9 for 10% off."],
    tags: ["book fair", "BOOL_CAST_TRAP", "INPUT_NOT_INT"], skills: ["integer", "real", "boolean"],
    buggy: [["BOOL_CAST_TRAP", 'books = int(input("Books: "))\nprice = float(input("Price (£): "))\nmember = bool(input("Member? (yes/no): "))\ntotal = books * price\nif member:\n    total = total * 0.9\nprint("Total (£):", round(total, 2))\nif member:\n    print("Member discount applied")'],
      ["INPUT_NOT_INT", 'books = input("Books: ")\nprice = float(input("Price (£): "))\nmember = input("Member? (yes/no): ") == "yes"\ntotal = books * price\nif member:\n    total = total * 0.9\nprint("Total (£):", round(total, 2))\nif member:\n    print("Member discount applied")']] },
];

const PLACEMENT = [
  { id: "types-P2a", level: 2, type: "predict", title: "Half the class",
    description: "What will this program print?",
    solution: 'pupils = 24\nprint(pupils / 2)',
    options: ["12", "12.0", "12.00"], tests: [T([])],
    hints: ["What type does / give?", "/ always gives a real number (float)."], tags: ["division"], skills: ["real"] },
  { id: "types-P2b", level: 2, type: "predict", title: "Doubling text",
    description: "What will this program print?",
    solution: 'tickets = "5"\nprint(tickets * 2)',
    options: ["10", "55", "5 5"], tests: [T([])],
    hints: ["tickets is in quotes.", "* on a string repeats it."], tags: ["quotes"], skills: ["string"] },
  { id: "types-P5a", level: 5, type: "parsons", title: "Pages read",
    description: "Arrange the lines so the program reads the pages read on two days, casts them to integers and prints the total.\nOne line is not needed.",
    solution: 'day1 = int(input("Pages on day 1: "))\nday2 = int(input("Pages on day 2: "))\nprint("Pages:", day1 + day2)',
    distractors: ['print("Pages:" + day1 + day2)'], tests: [T(["12", "20"]), T(["5", "9"])],
    hints: ["Cast each input with int().", "Print with a comma."], tags: ["library books", "STRING_PLUS_INT"], skills: ["integer", "casting"],
    buggy: [["STRING_PLUS_INT", 'day1 = int(input("Pages on day 1: "))\nday2 = int(input("Pages on day 2: "))\nprint("Pages:" + day1 + day2)']] },
  { id: "types-P5b", level: 5, type: "parsons", title: "Two drinks",
    description: "Arrange the lines so the program reads two drink prices, casts them to real numbers and prints the total.\nOne line is not needed.",
    solution: 'x = float(input("Drink 1 (£): "))\ny = float(input("Drink 2 (£): "))\nprint("Total (£):", x + y)',
    distractors: ['x = int(input("Drink 1 (£): "))'], tests: [T(["0.8", "1.2"]), T(["1.5", "1"])],
    hints: ["Prices have pence.", "Casting \"0.8\" with int() stops with an error."], tags: ["shop prices", "INT_OF_DECIMAL_STRING"], skills: ["real", "casting"],
    buggy: [["INT_OF_DECIMAL_STRING", 'x = int(input("Drink 1 (£): "))\ny = float(input("Drink 2 (£): "))\nprint("Total (£):", x + y)']] },
  { id: "types-P7a", level: 7, type: "fill", title: "Price with VAT",
    description: "Write the missing line that reads the price and casts it to a real number called price.",
    starter: '____\nprint("With VAT (£):", round(price * 1.2, 2))', answers: ['price = float(input("Price (£): "))'],
    tests: [T(["10"]), T(["2.5"])],
    hints: ["The variable must be called price.", "A price can have pence, so use float() casting."], tags: ["shop prices", "whole line"], skills: ["real", "casting"] },
  { id: "types-P7b", level: 7, type: "fill", title: "Double the count",
    description: "Write the missing line that reads the count and casts it to an integer called count.",
    starter: '____\nprint("Double:", count * 2)', answers: ['count = int(input("Count: "))'],
    tests: [T(["4"]), T(["15"])],
    hints: ["The variable must be called count.", "Without int() casting, count * 2 would repeat the text."], tags: ["register counts", "whole line"], skills: ["integer", "casting"] },
  { id: "types-P9a", level: 9, type: "write", title: "Next two sizes",
    description: "Ask for a shoe size (a whole number), cast it, and print the next two sizes up, for example:\nNext sizes: 6 7",
    starter: "# Write the whole program here",
    solution: 'size = int(input("Shoe size: "))\nprint("Next sizes:", size + 1, size + 2)',
    tests: [T(["5"]), T(["10"])],
    hints: ["Cast the input with int().", "One print() with commas can show both sizes."], tags: ["shoe sizes", "INPUT_NOT_INT"], skills: ["integer", "casting"],
    buggy: [["INPUT_NOT_INT", 'size = input("Shoe size: ")\nprint("Next sizes:", size + 1, size + 2)']] },
  { id: "types-P9b", level: 9, type: "write", title: "Grams",
    description: "Ask for a weight in kilograms (it can have a decimal part), cast it, and print it in grams as a whole number using round(), for example:\nGrams: 2500",
    starter: "# Write the whole program here",
    solution: 'kg = float(input("Weight (kg): "))\nprint("Grams:", round(kg * 1000))',
    tests: [T(["2.5"]), T(["0.75"]), T(["3"])],
    hints: ["Casting with float(), because the weight can have a decimal part.", "round(kg * 1000) gives a whole number."], tags: ["weights", "INT_OF_DECIMAL_STRING"], skills: ["real", "casting"],
    buggy: [["INT_OF_DECIMAL_STRING", 'kg = int(input("Weight (kg): "))\nprint("Grams:", round(kg * 1000))']] },
];

// ---------- Build each task in the tasks.json format ----------
const all = PRACTICE.concat(PLACEMENT.map((p) => Object.assign(p, { placement: true })));
const built = all.map((s) => {
  const t = { id: s.id, unit: "data-types", level: s.level, type: s.type, title: s.title, description: s.description,
    starter: s.starter != null ? s.starter : s.type === "write" ? "# Write your program here" : "", solution: s.solution };
  if (s.type === "fill") { let i = 0; t.solution = s.starter.replace(/____/g, () => s.answers[i++]); t.answers = s.answers; }
  if (s.type === "parsons") t.distractors = s.distractors;
  if (s.type === "predict") { t.options = s.options; t.answer = null; }
  t.tests = s.tests.map((x) => ({ inputs: x.inputs, expected: null }));
  t.hints = s.hints;
  t.tags = (s.placement ? ["placement"] : []).concat(s.tags);
  t.skills = s.skills;
  if (s.buggy) t.buggy_variants = s.buggy.map(([misconception, code]) => ({ misconception, code }));
  return t;
});
const jobs = [];
const where = [];
built.forEach((t, ti) => t.tests.forEach((x, k) => { jobs.push({ code: t.solution, inputs: x.inputs }); where.push([ti, k]); }));
const results = runPython(jobs);
const problems = [];
results.forEach((r, j) => {
  const [ti, k] = where[j];
  const t = built[ti];
  if (r.error) problems.push(t.id + " test " + k + ": " + JSON.stringify(r.error));
  if (r.inputsLeft) problems.push(t.id + " test " + k + ": not every input is used");
  t.tests[k].expected = Checker.normalise(r.output);
});
for (const t of built) {
  if (t.type === "predict") {
    const hits = t.options.map((o, i) => (o === t.tests[0].expected ? i : -1)).filter((i) => i >= 0);
    if (hits.length !== 1) problems.push(t.id + ": " + hits.length + " options equal the real output " + JSON.stringify(t.tests[0].expected));
    t.answer = hits[0];
  }
  for (const b of t.buggy_variants || []) if (!t.tags.includes(b.misconception)) problems.push(t.id + ": variant id not in tags");
  if (t.skills.length < 1 || t.skills.length > 3) problems.push(t.id + ": 1 to 3 skills");
}
if (problems.length) { console.log(problems.join("\n")); process.exit(1); }
fs.writeFileSync(file, JSON.stringify(tasks.concat(built), null, 2) + "\n");
console.log("Added " + built.length + " data-types tasks (" + PRACTICE.length + " practice, " + PLACEMENT.length + " placement).");
