// Worked examples for "Show me how", one per unit and skill. tools/add-worked-examples.js copies the right one into
// each practice task's "worked_example" field (the example for the task's first skill), with the output worked out
// by running the code. Contexts are deliberately different from the tasks' own (zoo, bakery, cinema, garden centre…).
//
// Each entry: { problem, code, inputs?, key_idea }. "inputs" are typed in when the example is run.
"use strict";

const EXAMPLES = {
  // ---------- Output and sequence ----------
  "output:print": {
    problem: "A cinema sign needs two lines: the film's name, then the screen number.",
    code: 'print("Space Penguins")\nprint("Screen 3")',
    key_idea: "Each print() shows exactly what is inside its quotes, then starts a new line.",
  },
  "output:strings": {
    problem: "A bakery label must show a word in quotes and an apostrophe: Today's special: \"lemon cake\".",
    code: 'print(\'Today\\\'s special: "lemon cake"\')\nprint("Price: 2 pounds")',
    key_idea: "Text goes inside quotes. Use one kind of quote outside, and you can put the other kind inside the text.",
  },
  "output:comments": {
    problem: "A zoo program prints feeding times. The comments explain it but aren't printed.",
    code: '# Feeding times for the penguins\nprint("Fish at 11am")\n# print("Fish at 3pm")\nprint("Fish at 4pm")',
    key_idea: "Python ignores everything after a #, so a line that starts with # never runs.",
  },
  "output:sequence": {
    problem: "A recipe for toast must print its steps in the right order.",
    code: 'print("1. Put bread in the toaster")\nprint("2. Wait two minutes")\nprint("3. Add butter")',
    key_idea: "Python runs lines from top to bottom, so the order of the lines is the order of the output.",
  },
  "output:sep/end": {
    problem: "A garden centre prints a date with slashes, then two words on the same line.",
    code: 'print(14, 3, 2026, sep="/")\nprint("Seeds", end=" ")\nprint("on sale")',
    key_idea: "sep= sets what goes between the values in one print(); end= sets what comes after it instead of a new line.",
  },
  // ---------- Variables and input ----------
  "variables:assignment": {
    problem: "A zoo stores an animal's name and age in variables, then prints them.",
    code: 'animal = "Tiger"\nage = 6\nprint(animal)\nprint(age)',
    key_idea: "= stores the value on the right in the variable on the left. Using the name later gives you the value.",
  },
  "variables:reassignment": {
    problem: "A bus starts with 12 passengers, then 5 more get on.",
    code: 'passengers = 12\npassengers = passengers + 5\nprint(passengers)',
    key_idea: "Giving a variable a new value replaces the old one. The right-hand side is worked out first, using the old value.",
  },
  "variables:input": {
    problem: "A cinema asks for the customer's name and greets them.",
    code: 'name = input("Your name: ")\nprint("Enjoy the film,", name)',
    inputs: ["Kai"],
    key_idea: "input() waits for the user to type, and gives back what they typed, which you store in a variable.",
  },
  "variables:int()": {
    problem: "A bakery asks how many cakes, then works out how many after 3 more are baked.",
    code: 'cakes = int(input("Cakes: "))\nprint(cakes + 3)',
    inputs: ["9"],
    key_idea: "input() always gives text. int() turns that text into a whole number so you can do maths with it.",
  },
  "variables:str()": {
    problem: "A garden centre joins a number of plants into a sentence.",
    code: 'plants = 24\nprint("We have " + str(plants) + " plants")',
    key_idea: "str() turns a number into text, so it can be joined to other text with +.",
  },
  "variables:concatenation": {
    problem: "A zoo makes a sign from a first name and a species.",
    code: 'name = "Mo"\nspecies = "meerkat"\nprint(name + " is a " + species)',
    key_idea: "+ joins pieces of text together exactly as they are, so you add any spaces yourself.",
  },
  // ---------- Maths in Python ----------
  "maths:arithmetic": {
    problem: "A cinema sells 15 tickets in the morning and 27 in the afternoon. How many altogether, and how many more in the afternoon?",
    code: 'morning = 15\nafternoon = 27\nprint(morning + afternoon)\nprint(afternoon - morning)',
    key_idea: "+, -, * and / work like in maths. Python works out the answer before printing it.",
  },
  "maths:division": {
    problem: "A bakery shares 7 litres of milk between 2 jugs.",
    code: 'print(7 / 2)\nprint(8 / 2)',
    key_idea: "/ always gives a decimal answer, even when it divides exactly (8 / 2 is 4.0).",
  },
  "maths:integer-division": {
    problem: "A garden centre packs 23 bulbs into bags of 5. How many full bags?",
    code: 'bulbs = 23\nprint(bulbs // 5)',
    key_idea: "// divides and keeps only the whole-number part, throwing the rest away.",
  },
  "maths:modulo": {
    problem: "A garden centre packs 23 bulbs into bags of 5. How many bulbs are left over?",
    code: 'bulbs = 23\nprint(bulbs % 5)',
    key_idea: "% gives the remainder after dividing: what is left when the full groups are taken out.",
  },
  "maths:power": {
    problem: "A square zoo enclosure has sides of 9 metres. What is its area?",
    code: 'side = 9\nprint(side ** 2)',
    key_idea: "** means 'to the power of', so side ** 2 is side squared.",
  },
  "maths:precedence": {
    problem: "A cinema ticket costs 6 pounds plus a 2 pound booking fee, for 3 people.",
    code: 'print(6 + 2 * 3)\nprint((6 + 2) * 3)',
    key_idea: "Python follows BIDMAS: * and / happen before + and -. Brackets make a part happen first.",
  },
  "maths:rounding": {
    problem: "A bakery's average cake weight is 312.4567 grams. Show it to 1 decimal place.",
    code: 'weight = 312.4567\nprint(round(weight, 1))\nprint(round(weight))',
    key_idea: "round(x, n) rounds to n decimal places. round(x) rounds to the nearest whole number.",
  },
  // ---------- Selection ----------
  "selection:if": {
    problem: "A zoo prints a warning only when the temperature is above 30.",
    code: 'temp = int(input("Temp in C: "))\nif temp > 30:\n    print("Give the animals extra water")\nprint("Check done")',
    inputs: ["34"],
    key_idea: "The indented lines under an if only run when its condition is True. Lines after it always run.",
  },
  "selection:if/else": {
    problem: "A cinema lets people in if they have a ticket, otherwise sends them to the desk.",
    code: 'ticket = input("Ticket? ")\nif ticket == "yes":\n    print("Go to screen 2")\nelse:\n    print("Please buy a ticket")',
    inputs: ["no"],
    key_idea: "else catches every case where the if condition is False, so exactly one of the two branches runs.",
  },
  "selection:elif": {
    problem: "A bakery sorts loaves by weight: 800g or more is large, 400g or more is medium, otherwise small.",
    code: 'grams = int(input("Weight: "))\nif grams >= 800:\n    print("Giant loaf")\nelif grams >= 400:\n    print("Medium")\nelse:\n    print("Mini loaf")',
    inputs: ["500"],
    key_idea: "Python checks each condition in order and runs only the first branch whose condition is True.",
  },
  "selection:comparison": {
    problem: "A garden centre checks whether a plant has exactly 10 leaves, and whether it has fewer than 5.",
    code: 'leaves = 10\nprint(leaves == 10)\nprint(leaves < 5)\nprint(leaves != 3)',
    key_idea: "Comparisons (==, !=, <, >, <=, >=) give True or False. == compares; a single = stores.",
  },
  "selection:boundary": {
    problem: "A zoo train is for children aged 12 or under. Test the value right on the boundary.",
    code: 'age = int(input("Age: "))\nif age <= 12:\n    print("Hop on")\nelse:\n    print("Sorry, children only")',
    inputs: ["12"],
    key_idea: "Always test the boundary value itself: <= includes it and < leaves it out.",
  },
  "selection:and/or": {
    problem: "A cinema shows a film to people who are 15 or over, or who come with an adult.",
    code: 'age = int(input("How old? "))\nadult = input("With an adult? ")\nif age >= 15 or adult == "yes":\n    print("Enjoy the film")\nelse:\n    print("Not this film")',
    inputs: ["13", "yes"],
    key_idea: "and needs both conditions to be True; or needs at least one. Each side must be a full comparison.",
  },
  "selection:not": {
    problem: "A bakery prints a reminder when the oven is not on.",
    code: 'oven_on = False\nif not oven_on:\n    print("Turn the oven on")',
    key_idea: "not turns True into False and False into True.",
  },
  "selection:input-conversion": {
    problem: "A garden centre compares the number of seeds typed in with 50.",
    code: 'seeds = int(input("Seeds: "))\nif seeds > 50:\n    print("Big packet")\nelse:\n    print("Small packet")',
    inputs: ["75"],
    key_idea: "Turn the input into a number with int() before comparing it with a number.",
  },
  "selection:modulo-conditions": {
    problem: "A zoo feeds the lions on every 3rd day. Is today (day 12) a feeding day?",
    code: 'day = int(input("Day: "))\nif day % 3 == 0:\n    print("Feed the lions")\nelse:\n    print("No feed today")',
    inputs: ["12"],
    key_idea: "x % n == 0 is True when x divides exactly by n (the remainder is 0).",
  },
  "selection:input-validation": {
    problem: "A cinema seat number must be between 1 and 40.",
    code: 'seat = int(input("Seat: "))\nif seat >= 1 and seat <= 40:\n    print("Seat booked")\nelse:\n    print("No such seat")',
    inputs: ["52"],
    key_idea: "Check that the value is in the allowed range before using it, and say clearly when it isn't.",
  },
  "selection:selection-in-functions": {
    problem: "A bakery function says whether a cake is ready from its baking time.",
    code: 'def cake_status(minutes):\n    if minutes >= 40:\n        return "Ready"\n    return "Not yet"\n\nprint(cake_status(45))\nprint(cake_status(20))',
    key_idea: "A function can use if to decide what to return. return ends the function straight away.",
  },
  // ---------- Condition-controlled loops ----------
  "loops-condition:while": {
    problem: "A zoo keeper counts down 3 days to a panda's birthday.",
    code: 'days = 3\nwhile days > 0:\n    print(days, "days to go")\n    days = days - 1\nprint("Happy birthday!")',
    key_idea: "A while loop repeats while its condition is True, so something inside it must change the condition.",
  },
  "loops-condition:counter": {
    problem: "A bakery counts how many trays it fills until it runs out of 20 buns, 6 per tray.",
    code: 'buns = 20\ntrays = 0\nwhile buns > 0:\n    buns = buns - 6\n    trays = trays + 1\nprint(trays)',
    key_idea: "A counter starts at 0 before the loop and goes up by 1 each time round.",
  },
  "loops-condition:accumulator": {
    problem: "A garden centre adds up plant prices until the till reaches at least 20 pounds.",
    code: 'total = 0\nwhile total < 20:\n    price = int(input("Cost: "))\n    total = total + price\nprint("Spent:", total)',
    inputs: ["8", "5", "9"],
    key_idea: "A running total starts at 0 before the loop, and each value is added to it inside the loop.",
  },
  "loops-condition:sentinel": {
    problem: "A cinema reads ticket numbers until the user types 0.",
    code: 'count = 0\nticket = int(input("Ticket: "))\nwhile ticket != 0:\n    count = count + 1\n    ticket = int(input("Ticket: "))\nprint(count, "tickets")',
    inputs: ["14", "22", "0"],
    key_idea: "Read the first value before the loop, and the next value at the end of the loop, so the stop value is never processed.",
  },
  "loops-condition:input-validation": {
    problem: "A zoo asks for a number of visitors until it gets one from 1 to 6.",
    code: 'group = int(input("Visitors: "))\nwhile group < 1 or group > 6:\n    print("Groups are 1 to 6")\n    group = int(input("Visitors: "))\nprint("Booked for", group)',
    inputs: ["9", "4"],
    key_idea: "Keep asking while the value is not allowed, and ask again inside the loop.",
  },
  "loops-condition:menu": {
    problem: "A bakery menu repeats until the user chooses 3 to quit.",
    code: 'choice = ""\nwhile choice != "3":\n    choice = input("1 Bread, 2 Cake, 3 Quit: ")\n    if choice == "1":\n        print("Bread is 1 pound")\n    elif choice == "2":\n        print("Cake is 2 pounds")\nprint("Bye")',
    inputs: ["2", "3"],
    key_idea: "Put the menu inside a while loop that stops on the quit choice, with if/elif inside to act on each choice.",
  },
  "loops-condition:and/or": {
    problem: "A garden centre waters a plant while the soil is dry and there is still water in the can.",
    code: 'soil = 2\nwater = 5\nwhile soil < 5 and water > 0:\n    soil = soil + 1\n    water = water - 2\nprint(soil, water)',
    key_idea: "With and, the loop stops as soon as either condition becomes False.",
  },
  "loops-condition:infinite-loop": {
    problem: "A zoo program counts down feeding times. The fixed version changes the counter, so the loop ends.",
    code: 'feeds = 3\nwhile feeds > 0:\n    print("Feed", feeds)\n    feeds = feeds - 1\nprint("All fed")',
    key_idea: "If nothing inside the loop changes the value in the condition, the condition never becomes False.",
  },
  // ---------- Count-controlled loops ----------
  "loops-count:for": {
    problem: "A cinema prints 'Seat ready' for each of 3 seats.",
    code: 'for seat in range(3):\n    print("Seat ready")\nprint("Room ready")',
    key_idea: "A for loop runs its indented lines once for each value in the range.",
  },
  "loops-count:range": {
    problem: "A bakery numbers its 4 ovens from 1 to 4.",
    code: 'for oven in range(1, 5):\n    print("Oven", oven)',
    key_idea: "range(start, stop) starts at start and stops just before stop, so the stop value is never included.",
  },
  "loops-count:loop-variable": {
    problem: "A zoo prints how many legs 1, 2 and 3 ostriches have.",
    code: 'for birds in range(1, 4):\n    print(birds, "ostriches have", birds * 2, "legs")',
    key_idea: "The loop variable takes the next value from the range each time, so you can use it in a calculation.",
  },
  "loops-count:step": {
    problem: "A garden centre counts down plant trays in fives from 20.",
    code: 'for trays in range(20, 0, -5):\n    print(trays)',
    key_idea: "The third number in range is the step. A negative step counts down, and the stop is still left out.",
  },
  "loops-count:nested-loop": {
    problem: "A cinema prints 2 rows with 3 seats in each.",
    code: 'for row in range(1, 3):\n    for seat in range(1, 4):\n        print("Row", row, "seat", seat)',
    key_idea: "The whole inner loop runs once for every time round the outer loop.",
  },
  "loops-count:counting": {
    problem: "A bakery counts how many of 5 cakes typed in weigh over 500g.",
    code: 'heavy = 0\nfor cake in range(5):\n    grams = int(input("Weight: "))\n    if grams > 500:\n        heavy = heavy + 1\nprint(heavy, "heavy cakes")',
    inputs: ["450", "520", "610", "300", "505"],
    key_idea: "Start a counter at 0 before the loop, and add 1 inside an if when the value matches.",
  },
  "loops-count:accumulator": {
    problem: "A garden centre adds up the prices of 3 plants typed in.",
    code: 'total = 0\nfor plant in range(3):\n    price = int(input("Cost: "))\n    total = total + price\nprint("Spent:", total)',
    inputs: ["4", "7", "2"],
    key_idea: "Set the total to 0 before the loop; inside the loop, add each value to it.",
  },
};

module.exports = { EXAMPLES };
