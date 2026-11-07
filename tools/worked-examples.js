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
    key_idea: "input() always gives text. int() casts that text to a whole number so you can do maths with it: this is called casting.",
  },
  "variables:str()": {
    problem: "A garden centre joins a number of plants into a sentence.",
    code: 'plants = 24\nsign = "We have " + str(plants) + " plants"\nprint(sign)',
    key_idea: "str() casts a number to text, so it can be joined to other text with +. The sign is built and stored in a variable first, which is when + is used; to print values straight away, use commas instead.",
  },
  "variables:concatenation": {
    problem: "A zoo makes a sign from a first name and a species.",
    code: 'name = "Mo"\nspecies = "meerkat"\nlabel = name + " is a " + species\nprint(label)',
    key_idea: "+ joins pieces of text together exactly as they are, so you add any spaces yourself. Use + when you build text and store it in a variable; when you just print several values, commas are simpler.",
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
    key_idea: "Cast the input to a number with int() before comparing it with a number (this is called casting).",
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
  // ---------- Data types and casting ----------
  "data-types:integer": {
    problem: "A zoo counts its penguins, a whole number, and checks what type Python gives it.",
    code: 'penguins = 14\nprint(type(penguins))\nprint(penguins + 3)',
    key_idea: "An integer is a whole number with no decimal point. Python calls this type int, and you can do maths with it.",
  },
  "data-types:real": {
    problem: "A bakery weighs flour in kilograms, which can have a decimal part.",
    code: 'flour = 0.75\nprint(type(flour))\nprint(flour * 2)\nprint(8 / 2)',
    key_idea: "A real number has a decimal point. Python calls this type float. Dividing with / always gives a float, even 8 / 2 (4.0).",
  },
  "data-types:boolean": {
    problem: "A cinema works out whether a screening is sold out.",
    code: 'seats_left = 12\nsold_out = seats_left == 0\nprint(sold_out)\nprint(type(sold_out))\nprint(bool("No"))',
    key_idea: "A Boolean is True or False, and a comparison gives one. Python calls this type bool. bool() of any text that isn't empty is True, even \"No\".",
  },
  "data-types:string": {
    problem: "A garden centre stores a plant's shelf number as text.",
    code: 'shelf = "7"\nprint(type(shelf))\nprint(shelf * 3)\nprint(int(shelf) * 3)',
    key_idea: "Anything in quotes is a string (str), even if it looks like a number. * repeats a string; cast it to a number first to do maths.",
  },
  "data-types:casting": {
    problem: "A zoo reads how many visitors came and the ticket price, then works out the takings.",
    code: 'visitors = int(input("Visitors: "))\nticket = float(input("Ticket price: "))\nprint("Takings:", visitors * ticket)',
    inputs: ["20", "4.5"],
    key_idea: "Casting changes a value's type: int() for a whole number, float() for a real number, str() for text and bool() for True or False. input() always gives a string, so cast it before doing maths.",
  },
  "data-types:type-choice": {
    problem: "A cinema stores four facts about a film, each in the type that suits it.",
    code: 'screen = 3              # a whole number: int\nprice = 7.5             # has a decimal part: float\nfilm = "Robot Rescue"   # text: str\nsubtitles = False       # yes or no: bool\nprint(type(screen), type(price))\nprint(type(film), type(subtitles))',
    key_idea: "Choose the type from what the value is like: counts are int, measurements with decimals are float, words are str, and yes/no facts are bool.",
  },

  // ---------- Strings ----------
  "strings:length": {
    problem: "A cinema checks how many characters a film title has, to fit it on the sign.",
    code: 'film = "Moonlight Express"\nprint(len(film))\nprint(len("Up"))',
    key_idea: "len() gives the length of a string: how many characters it has. Every character counts, including spaces.",
  },
  "strings:indexing": {
    problem: "A planet's name is broken into its characters.",
    code: 'planet = "Jupiter"\nprint(planet[0])\nprint(planet[3])\nprint(planet[len(planet) - 1])',
    key_idea: "Indexing counts from 0, so planet[0] is the first character and the last one is planet[len(planet) - 1].",
  },
  "strings:slicing": {
    problem: "A sign says Thames Barrier, and each word is sliced out.",
    code: 'sign = "Thames Barrier"\nprint(sign[0:6])\nprint(sign[7:14])',
    key_idea: "Slicing [a:b] starts at index a and stops just BEFORE index b, so sign[0:6] gives the 6 characters at indexes 0 to 5.",
  },
  "strings:upper/lower": {
    problem: "A library notice is shown in capitals, then stored in small letters.",
    code: 'notice = "Quiet Please"\nprint(notice.upper())\nprint(notice)\nnotice = notice.lower()\nprint(notice)',
    key_idea: "upper() and lower() give back a NEW string. The variable only changes if you store the result, as in notice = notice.lower().",
  },
  "strings:find": {
    problem: "A delivery note is searched for two words.",
    code: 'note = "pick up the parcel"\nprint(note.find("up"))\nprint(note.find("zebra"))',
    key_idea: "find() gives the index where some text first starts, counting from 0, or -1 if it isn't there.",
  },
  "strings:replace": {
    problem: "A recipe swaps one ingredient for another.",
    code: 'recipe = "add salt, then more salt"\nrecipe = recipe.replace("salt", "pepper")\nprint(recipe)',
    key_idea: "replace(old, new) gives back a new string with every copy of old swapped for new. Store it to keep the change.",
  },
  "strings:in": {
    problem: "A café checks whether a soup is on today's board.",
    code: 'board = "soup of the day: tomato"\nprint("tomato" in board)\nprint("Tomato" in board)\nprint("tomato" in board.lower())',
    key_idea: "in gives True if one string is inside another. Capital letters count, so use lower() on both to ignore them.",
  },

  // ---------- Random ----------
  "random:import": {
    problem: "A board game needs the random module before it can spin.",
    code: 'import random\nspin = random.randint(1, 8)\nprint(spin <= 8)',
    key_idea: "import random at the top of the program lets you use random.randint() and random.choice(). Without it, Python doesn't know what random is.",
  },
  "random:randint": {
    problem: "A spinner in a board game has the numbers 1 to 8.",
    code: 'import random\nspin = random.randint(1, 8)\nprint("Spinner:", spin)\nprint(spin >= 1 and spin <= 8)',
    key_idea: "random.randint(a, b) gives a random whole number from a to b, and both a and b can come up. That's different from range(), which stops before its end.",
  },
  "random:choice": {
    problem: "An ice lolly van picks a flavour, and a letter, at random.",
    code: 'import random\nflavour = random.choice(["mint", "lemon", "cherry"])\nprint("Ice lolly:", flavour)\nletter = random.choice("QRS")\nprint(len(letter))',
    key_idea: "random.choice() picks ONE item: one item of a list, or one character of a string.",
  },
  "random:simulation": {
    problem: "A darts player throws 5 darts, and each one has a 1 in 4 chance of a bullseye.",
    code: 'import random\nbullseyes = 0\nfor throw in range(5):\n    if random.randint(1, 4) == 4:\n        bullseyes = bullseyes + 1\nprint("Bullseyes:", bullseyes)',
    key_idea: "Call randint() inside the loop, so every go gets a new number. A random number stored in a variable stays the same until it is assigned again.",
  },

  // ---------- Lists ----------
  "lists:list": {
    problem: "A space club stores the first three planets in a list.",
    code: 'planets = ["Mercury", "Venus", "Earth"]\nprint(planets)\nprint(len(planets))',
    key_idea: "A list stores several values in order, inside square brackets with commas between them.",
  },
  "lists:indexing": {
    problem: "A train's stops are kept in a list, and one is changed.",
    code: 'stops = ["Selby", "Goole", "Hull"]\nprint(stops[0])\nprint(stops[2])\nstops[1] = "Howden"\nprint(stops)',
    key_idea: "Indexing a list counts from 0, like a string. stops[1] = ... replaces the second item.",
  },
  "lists:append": {
    problem: "A sticker book starts empty and gets two stickers.",
    code: 'stickers = []\nstickers.append("comet")\nstickers.append("moon")\nprint(stickers)\nprint(len(stickers))',
    key_idea: "append() adds an item to the END of a list and changes the list itself. Don't write stickers = stickers.append(...): append() gives back None.",
  },
  "lists:length": {
    problem: "A box of crayons is counted, and the last one is found.",
    code: 'crayons = ["teal", "rust", "gold", "lilac"]\nprint(len(crayons))\nprint(crayons[len(crayons) - 1])',
    key_idea: "len() gives the length of a list. The last item is at index len() - 1, because indexing counts from 0.",
  },
  "lists:list-loop": {
    problem: "A swimmer's lap times are added up.",
    code: 'laps = [62, 58, 65]\nall_laps = 0\nfor lap in laps:\n    all_laps = all_laps + lap\nprint("All laps (s):", all_laps)',
    key_idea: "for lap in laps: runs once for each item, with lap holding the next item each time. Use it to add up or check every item.",
  },
};

module.exports = { EXAMPLES };
