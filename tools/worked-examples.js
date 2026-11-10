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

  // ---------- Functions, no return value ----------
  "functions-basic:def": {
    problem: "A zookeeper makes a function that prints the feeding time.",
    code: 'def feeding_time():\n    print("Penguins fed at noon")\n\nfeeding_time()',
    key_idea: "def makes a function: the indented lines under it are what it does. Defining it doesn't run it; calling it does.",
  },
  "functions-basic:call": {
    problem: "A rocket launch prints a beep, three times.",
    code: 'def beep():\n    print("Beep")\n\nbeep()\nbeep()\nbeep()',
    key_idea: "A call is the function's name with brackets, such as beep(). Each call runs the function's lines again.",
  },
  "functions-basic:parameter": {
    problem: "A garden centre labels plants with a function that has a parameter.",
    code: 'def label(plant):\n    print("Plant:", plant)\n\nlabel("Fern")\nlabel("Tulip")',
    key_idea: "A parameter is the name in the brackets of def. Inside the function it holds whatever value the call gave it.",
  },
  "functions-basic:argument": {
    problem: "A bus timetable passes two values to a function.",
    code: 'def departs(route, time):\n    print("Route", route, "leaves at", time)\n\nstop = "9:15"\ndeparts(42, stop)',
    key_idea: "Arguments are the values in the call's brackets. They go to the parameters in order. A variable is passed without quotes, so its value is used.",
  },
  "functions-basic:print-in-function": {
    problem: "A function prints a frame round a word.",
    code: 'def frame(word):\n    print("+" * (len(word) + 2))\n    print("|" + word + "|")\n    print("+" * (len(word) + 2))\n\nframe("Moon")',
    key_idea: "A function can print as many lines as it needs, using its parameters. They appear each time the function is called.",
  },

  // ---------- Functions, return values ----------
  "functions-return:return": {
    problem: "A cinema works out the cost of tickets with a function that returns it.",
    code: 'def ticket_cost(adults, children):\n    return adults * 9 + children * 5\n\nprint(ticket_cost(2, 3))',
    key_idea: "return sends a value back to where the function was called, and ends the function. A function with no return gives back None.",
  },
  "functions-return:call": {
    problem: "Two calls to the same function are added together.",
    code: 'def stamps(letters):\n    return letters * 2\n\nprint(stamps(3) + stamps(4))',
    key_idea: "A call to a function that returns a value can be used like the value itself: printed, added, or compared.",
  },
  "functions-return:parameter": {
    problem: "A bakery's function uses its two parameters to work out the trays needed.",
    code: 'def trays(cakes, per_tray):\n    return cakes // per_tray\n\nprint("Trays:", trays(36, 12))',
    key_idea: "The parameters hold the arguments from the call, and the function returns a result made from them.",
  },
  "functions-return:store-result": {
    problem: "A sports club stores what a function returns, then uses it twice.",
    code: 'def laps_to_metres(laps):\n    return laps * 400\n\ndistance = laps_to_metres(5)\nprint("Metres:", distance)\nprint("Kilometres:", distance / 1000)',
    key_idea: "Store a result in a variable, such as distance = laps_to_metres(5), to use it again. Calling the function without storing the result loses it.",
  },

  // ---------- File handling ----------
  "file-handling:with-open": {
    problem: "A weather station saves a reading to a file, then reads it back.",
    code: 'with open("weather.txt", "w") as f:\n    f.write("Sunny")\n\nwith open("weather.txt", "r") as f:\n    print(f.read())',
    key_idea: "with open(name, mode) as f: opens the file for the indented lines under it, and closes it again afterwards.",
  },
  "file-handling:mode": {
    problem: "A garden diary is started with mode \"w\", then added to with mode \"a\".",
    code: 'with open("garden.txt", "w") as f:\n    f.write("Planted beans\\n")\nwith open("garden.txt", "a") as f:\n    f.write("Watered beans\\n")\nwith open("garden.txt", "r") as f:\n    print(f.read())',
    key_idea: "Mode \"w\" starts the file again, empty; \"a\" adds to the end; \"r\" reads it.",
  },
  "file-handling:write": {
    problem: "A library writes three book titles, one per line.",
    code: 'with open("books.txt", "w") as f:\n    f.write("Holes\\n")\n    f.write("Wonder\\n")\n    f.write("Matilda\\n")\nwith open("books.txt", "r") as f:\n    print(f.read())',
    key_idea: "write() writes exactly the text it is given, with no new line: add \"\\n\" to end each line. It needs a string, so cast numbers with str().",
  },
  "file-handling:read": {
    problem: "A planet's moon count is saved as text, then read back and used as a number.",
    code: 'with open("moons.txt", "w") as f:\n    f.write("95")\nwith open("moons.txt", "r") as f:\n    moons = int(f.read())\nprint(moons + 1)',
    key_idea: "read() gives back the whole file as one string. Cast it with int() or float() to use it as a number.",
  },
  "file-handling:lines": {
    problem: "A train timetable is read one line at a time.",
    code: 'with open("trains.txt", "w") as f:\n    f.write("York\\nDurham\\nNewcastle\\n")\nwith open("trains.txt", "r") as f:\n    for line in f:\n        print("Stop:", line.strip())',
    key_idea: "for line in f: reads one line each time round; readline() reads the next line. Each line keeps its \\n, so strip() takes it off.",
  },
  "file-handling:close": {
    problem: "A car park saves its spaces with open() and close() written out.",
    code: 'f = open("spaces.txt", "w")\nf.write("Spaces left: 12")\nf.close()\nf = open("spaces.txt", "r")\nprint(f.read())\nf.close()',
    key_idea: "Without with, open() the file, use it, then close() it. with open(...) closes the file for you.",
  },

  // ---------- 2D arrays ----------
  "arrays-2d:list-of-lists": {
    problem: "A cinema stores how many tickets each seat block sold, one row of blocks per list.",
    code: 'sold = [[40, 35, 52], [18, 27, 30]]\nprint(sold[1])\nprint(len(sold))',
    key_idea: "A 2D array is a list of lists: each inner list is one row. sold[1] is the whole second row.",
  },
  "arrays-2d:indexing": {
    problem: "A minefield game picks out one square by row and column.",
    code: 'field = [[0, 1, 0], [2, 0, 1], [0, 0, 3]]\nprint(field[0][1])\nfield[2][0] = 9\nprint(field[2])',
    key_idea: "grid[row][col]: the first index picks the row, the second the item in it. Both count from 0.",
  },
  "arrays-2d:nested-loop": {
    problem: "A greenhouse prints every tray's plant count, row by row.",
    code: 'trays = [[6, 4], [5, 8], [7, 3]]\nfor shelf in trays:\n    for count in shelf:\n        print(count, end=" ")\n    print()',
    key_idea: "A nested loop: the outer loop takes each row, and the inner loop each item in that row.",
  },
  "arrays-2d:length": {
    problem: "A car park's grid of bays is measured.",
    code: 'bays = [[0, 0, 1, 0], [1, 1, 0, 0]]\nprint("Rows of bays:", len(bays))\nprint("Bays per row:", len(bays[0]))',
    key_idea: "len(grid) is the number of rows; len(grid[0]) is the number of columns (the length of one row).",
  },

  // ---------- Validation (one example for each kind of check) ----------
  "validation:presence": {
    problem: "A sign-up form checks that a surname was typed. The user types only spaces.",
    code: 'surname = input("Surname: ").strip()\nif surname == "":\n    print("Surname is missing")\nelse:\n    print("Surname:", surname)',
    inputs: ["   "],
    key_idea: "A presence check compares the answer with \"\", the empty string. .strip() first, so an answer of only spaces counts as empty.",
  },
  "validation:length": {
    problem: "A games site checks that a gamer tag has 4 to 12 characters. The user types Zo.",
    code: 'tag = input("Gamer tag: ")\nif len(tag) >= 4 and len(tag) <= 12:\n    print("Tag accepted")\nelse:\n    print("Tags have 4 to 12 characters")',
    inputs: ["Zo"],
    key_idea: "A length check uses len() to count the characters. For a lowest and a highest length, both must be True, so join them with and.",
  },
  "validation:range": {
    problem: "A swimming club takes ages 8 to 14, including 8 and 14. The user types 14.",
    code: 'swimmer = int(input("Swimmer\'s age: "))\nif swimmer >= 8 and swimmer <= 14:\n    print("Swim club place offered")\nelse:\n    print("Swim club ages are 8 to 14")',
    inputs: ["14"],
    key_idea: "A range check compares with the lowest and highest values. Use >= and <= when the end values are allowed.",
  },
  "validation:format": {
    problem: "A school checks that a form group looks like 7B: two characters, a digit and then a letter from A to D. The user types 9C.",
    code: 'form = input("Form: ")\nif len(form) == 2 and form[0].isdigit() and form[1] in ["A", "B", "C", "D"]:\n    print("Form accepted")\nelse:\n    print("Forms look like 7B")',
    inputs: ["9C"],
    key_idea: "A format check tests the pattern of the answer: its length, what is at each index, and whether a part is in a list of allowed values.",
  },
  "validation:type-check": {
    problem: "A quiz asks how many questions to set. The user types ten.",
    code: 'answer = input("Questions: ")\nif answer.isdigit():\n    print("Setting", int(answer), "questions")\nelse:\n    print("Type a whole number, such as 10")',
    inputs: ["ten"],
    key_idea: "A type check with .isdigit() makes sure int() will work. Cast with int() only after the check passes. .isdigit() is False for negative numbers and decimals.",
  },
  "validation:re-ask": {
    problem: "A bowling alley keeps asking until a lane from 1 to 12 is chosen. The user types 15, then 4.",
    code: 'lane = int(input("Bowling lane (1 to 12): "))\nwhile lane < 1 or lane > 12:\n    print("There are 12 lanes")\n    lane = int(input("Bowling lane (1 to 12): "))\nprint("Your lane:", lane)',
    inputs: ["15", "4"],
    key_idea: "The while loop runs while the check fails. Ask again inside the loop and store the answer in the same variable, so the condition can change.",
  },
  "validation:validation-function": {
    problem: "A function checks a house number: digits only, from 1 to 999. The user types 0, then 42.",
    code: 'def valid_house(text):\n    if not text.isdigit():\n        return False\n    number = int(text)\n    if number < 1 or number > 999:\n        return False\n    return True\n\nhouse = input("House number: ")\nwhile not valid_house(house):\n    print("Type a number from 1 to 999")\n    house = input("House number: ")\nprint("House number:", house)',
    inputs: ["0", "42"],
    key_idea: "A validation function does the checks and returns True or False. The rest of the program only has to call it, for example while not valid_house(house):",
  },

  // ---------- Authentication ----------
  // A different context from the tasks (a games console, a safe, a lock screen), so no prompt or message is shared.
  "authentication:match": {
    problem: "A treehouse door opens only for the stored secret word. The user types Panda7.",
    code: 'secret = "panda7"\nword = input("Secret word: ")\nif word == secret:\n    print("Door opens")\nelse:\n    print("Door stays shut")',
    inputs: ["Panda7"],
    key_idea: "== is True only when the two strings match exactly, capital letters and all. input() gives a string, so a stored number never matches.",
  },
  "authentication:known-users": {
    problem: "A games console checks whether a gamer tag is one it knows. The user types zack.",
    code: 'players = ["rio", "zack", "nia_b"]\ntag = input("Gamer tag: ")\nif tag in players:\n    print("Player found")\nelse:\n    print("No such player")',
    inputs: ["zack"],
    key_idea: "in checks whether the tag is one of the items in the list. == would compare it with the whole list, which never matches.",
  },
  "authentication:both-match": {
    problem: "A games console signs a player in only when the gamer tag and the secret word both match. The user types rio, then Pass99.",
    code: 'stored_tag = "rio"\nstored_secret = "Cloud6"\ntag = input("Gamer tag: ")\nsecret = input("Secret word: ")\nif tag == stored_tag and secret == stored_secret:\n    print("Signed in")\nelse:\n    print("Sign-in refused")',
    inputs: ["rio", "Pass99"],
    key_idea: "Join the two comparisons with and: both must be True. With or, the right gamer tag alone would be enough to get in.",
  },
  "authentication:which-wrong": {
    problem: "A games console says which detail was wrong. The user types rio, then cloud6.",
    code: 'stored_tag = "rio"\nstored_secret = "Cloud6"\ntag = input("Gamer tag: ")\nsecret = input("Secret word: ")\nif tag == stored_tag and secret == stored_secret:\n    print("Signed in")\nelif tag == stored_tag:\n    print("The secret word is wrong")\nelse:\n    print("The gamer tag is wrong")',
    inputs: ["rio", "cloud6"],
    key_idea: "Check both details first. If that fails but the gamer tag matches, the secret word must be the wrong part; otherwise it's the tag.",
  },
  "authentication:attempts": {
    problem: "A safe counts the wrong codes before the right one. The user types 1111, 2222, then 5050.",
    code: 'safe_code = "5050"\nwrong = 0\ncode = input("Safe code: ")\nwhile code != safe_code:\n    wrong = wrong + 1\n    code = input("Safe code: ")\nprint("Safe opened after", wrong, "wrong tries")',
    inputs: ["1111", "2222", "5050"],
    key_idea: "Start the counter at 0 before the loop, and add 1 for each wrong try with wrong = wrong + 1. wrong + 1 on its own doesn't store anything.",
  },
  "authentication:login-loop": {
    problem: "A lock screen allows three tries at the secret word. The user types cat, then Cloud6.",
    code: 'secret = "Cloud6"\ntries = 0\nopen_now = False\nwhile tries < 3 and not open_now:\n    word = input("Lock screen word: ")\n    tries = tries + 1\n    if word == secret:\n        open_now = True\nif open_now:\n    print("Screen open")\nelse:\n    print("Screen locked for a minute")',
    inputs: ["cat", "Cloud6"],
    key_idea: "The loop stops after 3 tries or as soon as open_now is True. Count every try inside the loop, or it never ends.",
  },
  "authentication:presence": {
    problem: "A games console checks both boxes were filled in before it checks the details. The user leaves the secret word empty.",
    code: 'stored_tag = "rio"\nstored_secret = "Cloud6"\ntag = input("Gamer tag: ").strip()\nsecret = input("Secret word: ")\nif tag == "" or secret == "":\n    print("Both boxes are needed")\nelif tag == stored_tag and secret == stored_secret:\n    print("Signed in")\nelse:\n    print("Sign-in refused")',
    inputs: ["rio", ""],
    key_idea: "Do the presence check first: if either box is empty (or), say so. Only then check the gamer tag and the secret word.",
  },
  "authentication:validation-function": {
    problem: "A sign-in function checks a gamer tag and secret word against two stored lists. The user types zack, then Snow5.",
    code: 'tags = ["rio", "zack"]\nsecrets = ["Cloud6", "Snow5"]\n\ndef check_sign_in(tag, secret):\n    for i in range(len(tags)):\n        if tags[i] == tag and secrets[i] == secret:\n            return True\n    return False\n\nif check_sign_in(input("Gamer tag: "), input("Secret word: ")):\n    print("Signed in")\nelse:\n    print("Sign-in refused")',
    inputs: ["zack", "Snow5"],
    key_idea: "Each password is at the same index as its username. The function returns True as soon as a stored pair matches, and False after checking them all.",
  },

  // ---------- Trace tables ----------
  // Each example has "trace" (a trace table spec), so "Show me how" shows its whole table. Contexts: a shop, a
  // garden, a car park, a bus, a sticker book and a climbing wall.
  "trace-tables:trace-assignment": {
    problem: "A shop works out the change from a £20 note for a cost of £13.",
    code: "paid = 20\ncost = 13\nchange = paid - cost\npaid = 0",
    trace: {},
    key_idea: "Write a value only in the row of the line that changes it. Each line uses the values from the rows above it, so change uses paid before line 4 sets it to 0.",
  },
  "trace-tables:trace-output": {
    problem: "A garden program doubles the number of seeds, then prints it.",
    code: "seeds = 6\nseeds = seeds * 2\nprint(seeds)",
    trace: {},
    key_idea: "A print() line changes no variable: it only has an Output. Write exactly what it prints, without quotes.",
  },
  "trace-tables:trace-input": {
    problem: "A car park works out how many wheels are parked. The user types 9.",
    code: 'cars = int(input("Cars parked: "))\nwheels = cars * 4\nprint(wheels)',
    inputs: ["9"],
    trace: {},
    key_idea: "input() gives the next thing the user types: that is the variable's value in its row. The prompt isn't output.",
  },
  "trace-tables:trace-selection": {
    problem: "A bus fare is free under 5, otherwise 2. The user types 7.",
    code: 'age = int(input("Passenger age: "))\nif age < 5:\n    fare = 0\nelse:\n    fare = 2\nprint(fare)',
    inputs: ["7"],
    trace: {},
    key_idea: "Only the lines that run go in the table. 7 < 5 is False, so line 3 is skipped and line 5 runs.",
  },
  "trace-tables:trace-loop": {
    problem: "A sticker book gets 2 stickers a day for 3 days.",
    code: "stickers = 0\nfor day in range(3):\n    stickers = stickers + 2\nprint(stickers)",
    trace: {},
    key_idea: "Each time round the loop gets new rows: first the loop variable changes, then the lines inside the loop.",
  },
  "trace-tables:trace-list": {
    problem: "A climbing wall finds the highest climb in a list.",
    code: "climbs = [6, 11, 9]\nhighest = climbs[0]\nfor c in climbs:\n    if c > highest:\n        highest = c\nprint(highest)",
    trace: {},
    key_idea: "A list has a column for each position: climbs[0], climbs[1], … Fill them in on the line that makes the list.",
  },

  // ---------- Linear search (one example per task type; contexts: a library shelf, race laps, a car park) ----------
  "linear-search:predict": {
    problem: "A library shelf is searched for book number 31.",
    code: 'shelf = [12, 45, 31, 8, 27]\nfor i in range(len(shelf)):\n    if shelf[i] == 31:\n        print("Book at index", i)',
    key_idea: "A linear search checks each item in turn, from index 0. Indexing counts from 0, so the third item is at index 2.",
  },
  "linear-search:partial-parsons": {
    problem: "A library program says whether book 8 is on the shelf, using a flag.",
    code: 'shelf = [12, 45, 31, 8, 27]\non_shelf = False\nfor book in shelf:\n    if book == 8:\n        on_shelf = True\nprint(on_shelf)',
    key_idea: "The flag starts as False before the loop and only becomes True when an item matches. Nothing sets it back.",
  },
  "linear-search:fill": {
    problem: "A function finds a lap time in a list, or gives -1.",
    code: "def find_lap(laps, t):\n    for i in range(len(laps)):\n        if laps[i] == t:\n            return i\n    return -1\n\nprint(find_lap([58, 61, 57, 60], 57))\nprint(find_lap([58, 61, 57, 60], 55))",
    key_idea: "range(len(laps)) gives every index. return -1 goes after the loop, so it only runs when nothing matched.",
  },
  "linear-search:trace": {
    problem: "Trace a search for lap time 57.",
    code: "laps = [58, 61, 57, 60]\nfound = False\ni = 0\nwhile i < len(laps) and not found:\n    if laps[i] == 57:\n        found = True\n    i = i + 1\nprint(found, i)",
    trace: { columns: ["found", "i"] },
    key_idea: "Each time round, compare the item at i, then i goes up by 1. Once found is True, the loop stops.",
  },
  "linear-search:parsons": {
    problem: "A car park counts how many cars are in space 4.",
    code: 'spaces = [4, 2, 4, 7, 4, 1]\ncount = 0\nfor s in spaces:\n    if s == 4:\n        count = count + 1\nif count == 0:\n    print("No cars there")\nelse:\n    print("Cars:", count)',
    key_idea: "Set the count to 0 before the loop, add 1 for each match inside it, and decide what to print after it.",
  },
  "linear-search:write": {
    problem: "A function searches the car park list for a registration. The user types XY12.",
    code: 'regs = ["AB34", "XY12", "QQ90"]\n\ndef where(items, target):\n    for i in range(len(items)):\n        if items[i] == target:\n            return i\n    return -1\n\nreg = input("Registration: ")\nspot = where(regs, reg)\nif spot == -1:\n    print("Not parked here")\nelse:\n    print("Parked in space", spot)',
    inputs: ["XY12"],
    key_idea: "Check every index and return as soon as one matches. After the loop, return -1 for not found, and let the caller decide what to print.",
  },

  // ---------- Binary search (contexts: page numbers, a ladder of heights, a phone book) ----------
  "binary-search:predict": {
    problem: "A sorted list of page numbers: which page is checked first?",
    code: "pages = [3, 10, 18, 26, 40, 52, 61]\nlow = 0\nhigh = len(pages) - 1\nmid = (low + high) // 2\nprint(mid, pages[mid])",
    key_idea: "The first check is the middle: mid = (low + high) // 2. // keeps mid a whole number, so it can be an index.",
  },
  "binary-search:partial-parsons": {
    problem: "One step of a binary search for page 52: which half is kept?",
    code: "pages = [3, 10, 18, 26, 40, 52, 61]\nlow = 0\nhigh = 6\nmid = (low + high) // 2\nif pages[mid] < 52:\n    low = mid + 1\nelse:\n    high = mid - 1\nprint(low, high)",
    key_idea: "The middle item has been checked, so move past it: low = mid + 1 if it was too small, or high = mid - 1 if it was too big.",
  },
  "binary-search:fill": {
    problem: "A binary search finds the height 150 in a sorted list.",
    code: "heights = [110, 125, 138, 150, 162, 175]\nlow = 0\nhigh = len(heights) - 1\nspot = -1\nwhile low <= high and spot == -1:\n    mid = (low + high) // 2\n    if heights[mid] == 150:\n        spot = mid\n    elif heights[mid] < 150:\n        low = mid + 1\n    else:\n        high = mid - 1\nprint(spot)",
    key_idea: "Keep going while low <= high: when they are equal, one item is still left to check.",
  },
  "binary-search:trace": {
    problem: "Trace a binary search for 18.",
    code: "pages = [3, 10, 18, 26, 40, 52, 61]\nlow = 0\nhigh = len(pages) - 1\nfound = False\nwhile low <= high and not found:\n    mid = (low + high) // 2\n    if pages[mid] == 18:\n        found = True\n    elif pages[mid] < 18:\n        low = mid + 1\n    else:\n        high = mid - 1\nprint(found)",
    trace: { columns: ["low", "high", "found", "mid"] },
    key_idea: "Each time round: work out mid, compare pages[mid], then change low, high or found. Only the value that changes goes in each row.",
  },
  "binary-search:parsons": {
    problem: "A phone book is in alphabetical order. A binary search finds Jo.",
    code: 'book = ["Al", "Cy", "Jo", "Mo", "Ty"]\nlow = 0\nhigh = len(book) - 1\nwhile low <= high:\n    mid = (low + high) // 2\n    if book[mid] == "Jo":\n        print("Entry", mid)\n        low = high + 1\n    elif book[mid] < "Jo":\n        low = mid + 1\n    else:\n        high = mid - 1',
    key_idea: "Set low and high before the loop. Inside it, work out mid first, then compare, then move low or high.",
  },
  "binary-search:write": {
    problem: "A function returns the index of a page in a sorted list, or -1.",
    code: "def find_page(pages, p):\n    low = 0\n    high = len(pages) - 1\n    while low <= high:\n        mid = (low + high) // 2\n        if pages[mid] == p:\n            return mid\n        elif pages[mid] < p:\n            low = mid + 1\n        else:\n            high = mid - 1\n    return -1\n\nprint(find_page([3, 10, 18, 26, 40], 26))\nprint(find_page([3, 10, 18, 26, 40], 5))",
    key_idea: "return mid as soon as it matches. If low passes high, every possible place has been thrown away, so return -1.",
  },

  // ---------- Bubble sort (contexts: plant heights, race times, shoe sizes) ----------
  "bubble-sort:predict": {
    problem: "One pass of a bubble sort on plant heights.",
    code: "plants = [14, 9, 20, 11]\nfor j in range(len(plants) - 1):\n    if plants[j] > plants[j + 1]:\n        plants[j], plants[j + 1] = plants[j + 1], plants[j]\nprint(plants)",
    key_idea: "A pass compares each pair next to each other and swaps it if it is the wrong way round. After one pass, the biggest item is at the end.",
  },
  "bubble-sort:partial-parsons": {
    problem: "Swapping two race times with a temp variable.",
    code: "times = [62, 58]\nif times[0] > times[1]:\n    temp = times[0]\n    times[0] = times[1]\n    times[1] = temp\nprint(times)",
    key_idea: "Keep the first value in temp before you overwrite it. Without temp, both places end up with the same value.",
  },
  "bubble-sort:fill": {
    problem: "A full bubble sort of shoe sizes.",
    code: "sizes = [7, 4, 9, 5, 6]\nfor i in range(len(sizes) - 1):\n    for j in range(len(sizes) - 1 - i):\n        if sizes[j] > sizes[j + 1]:\n            sizes[j], sizes[j + 1] = sizes[j + 1], sizes[j]\nprint(sizes)",
    key_idea: "n items need n - 1 passes. Each pass compares one pair fewer, because the biggest items are already at the end.",
  },
  "bubble-sort:trace": {
    problem: "Trace one pass of a bubble sort on plant heights.",
    code: "plants = [14, 9, 20, 11]\nfor j in range(len(plants) - 1):\n    if plants[j] > plants[j + 1]:\n        plants[j], plants[j + 1] = plants[j + 1], plants[j]\nprint(plants)",
    trace: { columns: ["j", "plants"] },
    key_idea: "In a swap row, both positions change at once: write both new values. A pair that's already in order adds no row.",
  },
  "bubble-sort:parsons": {
    problem: "A bubble sort of race times that stops when a pass makes no swaps.",
    code: "times = [61, 58, 59, 64, 60]\nswapped = True\nwhile swapped:\n    swapped = False\n    for j in range(len(times) - 1):\n        if times[j] > times[j + 1]:\n            times[j], times[j + 1] = times[j + 1], times[j]\n            swapped = True\nprint(times)",
    key_idea: "Set swapped to False at the start of each pass and to True after any swap. A pass with no swaps means the list is sorted.",
  },
  "bubble-sort:write": {
    problem: "A function sorts shoe sizes with a bubble sort and returns them.",
    code: "def sort_sizes(sizes):\n    for i in range(len(sizes) - 1):\n        for j in range(len(sizes) - 1 - i):\n            if sizes[j] > sizes[j + 1]:\n                temp = sizes[j]\n                sizes[j] = sizes[j + 1]\n                sizes[j + 1] = temp\n    return sizes\n\nprint(sort_sizes([8, 3, 6, 2]))",
    key_idea: "The inner loop's range stops at len(sizes) - 1 - i, so sizes[j + 1] is always in the list.",
  },

  // ---------- Insertion sort (contexts: playing cards, book heights, ages) ----------
  "insertion-sort:predict": {
    problem: "Inserting one card into the sorted cards before it.",
    code: "cards = [2, 6, 9, 4, 7]\ni = 3\nkey = cards[i]\nj = i - 1\nwhile j >= 0 and cards[j] > key:\n    cards[j + 1] = cards[j]\n    j = j - 1\ncards[j + 1] = key\nprint(cards)",
    key_idea: "Keep the card in key first. Shift each bigger card one place right, then put key in the gap at j + 1.",
  },
  "insertion-sort:partial-parsons": {
    problem: "A shift copies a bigger book height one place to the right.",
    code: "books = [18, 25, 30, 21]\nkey = books[3]\nj = 2\nwhile j >= 0 and books[j] > key:\n    books[j + 1] = books[j]\n    j = j - 1\nbooks[j + 1] = key\nprint(books)",
    key_idea: "books[j + 1] = books[j] copies to the right, into the place that is free. Copying to the left would write over a value before it is moved.",
  },
  "insertion-sort:fill": {
    problem: "A full insertion sort of ages.",
    code: "ages = [12, 9, 15, 10, 11]\nfor i in range(1, len(ages)):\n    key = ages[i]\n    j = i - 1\n    while j >= 0 and ages[j] > key:\n        ages[j + 1] = ages[j]\n        j = j - 1\n    ages[j + 1] = key\nprint(ages)",
    key_idea: "i starts at 1: the first item is a sorted part on its own. Each time round, one more item joins the sorted part.",
  },
  "insertion-sort:trace": {
    problem: "Trace the insertion of one card.",
    code: "cards = [3, 7, 8, 5]\ni = 3\nkey = cards[i]\nj = i - 1\nwhile j >= 0 and cards[j] > key:\n    cards[j + 1] = cards[j]\n    j = j - 1\ncards[j + 1] = key\nprint(cards)",
    trace: { columns: ["key", "j", "cards"] },
    key_idea: "After a shift, the same card is in two places for one row. The insert at the end fills the gap with key.",
  },
  "insertion-sort:parsons": {
    problem: "An insertion sort of book heights, tallest first.",
    code: "books = [21, 30, 18, 25]\nfor i in range(1, len(books)):\n    key = books[i]\n    j = i - 1\n    while j >= 0 and books[j] < key:\n        books[j + 1] = books[j]\n        j = j - 1\n    books[j + 1] = key\nprint(books)",
    key_idea: "For tallest first, the smaller books shift right. The order of the lines is the same as for smallest first.",
  },
  "insertion-sort:write": {
    problem: "A function sorts ages with an insertion sort and returns them.",
    code: "def sort_ages(ages):\n    for i in range(1, len(ages)):\n        key = ages[i]\n        j = i - 1\n        while j >= 0 and ages[j] > key:\n            ages[j + 1] = ages[j]\n            j = j - 1\n        ages[j + 1] = key\n    return ages\n\nprint(sort_ages([14, 11, 13, 12]))",
    key_idea: "Compare with key, not ages[i]: the first shift writes over ages[i].",
  },

  // ---------- Merge sort (contexts: two queues, two piles of marked tests, ticket numbers) ----------
  "merge-sort:predict": {
    problem: "Two sorted queues of ticket numbers are merged into one.",
    code: "queue_a = [4, 9, 15]\nqueue_b = [6, 7, 20]\nboth = []\na = 0\nb = 0\nwhile a < len(queue_a) and b < len(queue_b):\n    if queue_a[a] <= queue_b[b]:\n        both.append(queue_a[a])\n        a = a + 1\n    else:\n        both.append(queue_b[b])\n        b = b + 1\nboth = both + queue_a[a:] + queue_b[b:]\nprint(both)",
    key_idea: "Compare the two front items and take the smaller one. When one queue runs out, add everything left in the other.",
  },
  "merge-sort:partial-parsons": {
    problem: "Splitting a pile of 7 test marks in half.",
    code: "marks = [41, 77, 58, 63, 90, 35, 72]\nhalf = len(marks) // 2\nfirst = marks[:half]\nsecond = marks[half:]\nprint(first, second)",
    key_idea: "half = len(marks) // 2. marks[:half] is everything before index half, and marks[half:] is the rest, so no item is lost.",
  },
  "merge-sort:fill": {
    problem: "A function merges two sorted piles of marks.",
    code: "def merge_piles(p, q):\n    out = []\n    a = 0\n    b = 0\n    while a < len(p) and b < len(q):\n        if p[a] <= q[b]:\n            out.append(p[a])\n            a = a + 1\n        else:\n            out.append(q[b])\n            b = b + 1\n    return out + p[a:] + q[b:]\n\nprint(merge_piles([35, 58, 77], [41, 63]))",
    key_idea: "p[a:] and q[b:] are the leftovers. One of them is always empty, so adding both is safe.",
  },
  "merge-sort:trace": {
    problem: "Trace a merge of two queues.",
    code: "queue_a = [4, 9]\nqueue_b = [6, 7, 20]\nboth = []\na = 0\nb = 0\nwhile a < len(queue_a) and b < len(queue_b):\n    if queue_a[a] <= queue_b[b]:\n        both.append(queue_a[a])\n        a = a + 1\n    else:\n        both.append(queue_b[b])\n        b = b + 1\nboth = both + queue_a[a:] + queue_b[b:]\nprint(both)",
    trace: { columns: ["a", "b", "both"] },
    key_idea: "Each append fills the next position of both, then a or b moves along. The last line adds the leftovers all at once.",
  },
  "merge-sort:parsons": {
    problem: "Merging two sorted queues, with a loop for each queue's leftovers.",
    code: "queue_a = [2, 8]\nqueue_b = [3, 5, 9]\nboth = []\na = 0\nb = 0\nwhile a < len(queue_a) and b < len(queue_b):\n    if queue_a[a] <= queue_b[b]:\n        both.append(queue_a[a])\n        a = a + 1\n    else:\n        both.append(queue_b[b])\n        b = b + 1\nwhile a < len(queue_a):\n    both.append(queue_a[a])\n    a = a + 1\nwhile b < len(queue_b):\n    both.append(queue_b[b])\n    b = b + 1\nprint(both)",
    key_idea: "The first loop compares; the two leftover loops come after it. Only one of them adds anything.",
  },

  // ---------- A-level: one example for each task type in each unit (stairs, planets, museums, gardens…) ----------
  "recursion:predict": {
    problem: "A climber goes up a staircase one step at a time, using recursion.",
    code: 'def climb(steps):\n    if steps == 0:\n        print("At the top")\n    else:\n        print("Step", steps)\n        climb(steps - 1)\n\nclimb(2)',
    key_idea: "A recursive function calls itself on a smaller problem. Follow one call at a time: each prints its line, then makes the next call, until the base case stops them.",
  },
  "recursion:fill": {
    problem: "A recursive function counts how many times a number can be halved before it drops below 1.",
    code: "def halves(n):\n    if n < 1:\n        return 0\n    return 1 + halves(n // 2)\n\nprint(halves(20))",
    key_idea: "Every recursive function needs a base case that returns without calling itself, and a call on a smaller value that moves towards it. Return the result so it travels back up.",
  },
  "recursion:parsons": {
    problem: "A recursive function counts the planets in a list.",
    code: 'def count_items(things):\n    if things == []:\n        return 0\n    return 1 + count_items(things[1:])\n\nprint(count_items(["Mercury", "Venus", "Saturn"]))',
    key_idea: "Put the base case first in the function, then the line that calls the function again on a smaller list. The main program comes after the function.",
  },
  "recursion:partial-parsons": {
    problem: "A recursive function multiplies the numbers in a list.",
    code: "def product(nums):\n    if len(nums) == 0:\n        return 1\n    return nums[0] * product(nums[1:])\n\nprint(product([2, 3, 5]))",
    key_idea: "Check each choice: does the call get smaller, and does the base case stop it? A call with the same value, or one that moves away from the base case, never stops.",
  },
  "recursion:trace": {
    problem: "A museum guide counts the doors on the way through 3 rooms, using recursion.",
    code: 'def museum(rooms):\n    print("enter", rooms)\n    if rooms == 1:\n        return 1\n    return 2 + museum(rooms - 1)\n\nvisits = museum(3)\nprint(visits)',
    trace: { columns: ["visits"] },
    key_idea: "The trace table only has rows for the main program's lines. A line that makes a recursive call gets one row, with everything the calls print in its Output cell, in the order the calls happen.",
  },
  "recursion:write": {
    problem: "A countdown list made two ways: with recursion and with a loop.",
    code: "def countdown_list(n):\n    if n == 0:\n        return []\n    return [n] + countdown_list(n - 1)\n\ndef countdown_loop(n):\n    out = []\n    while n > 0:\n        out.append(n)\n        n = n - 1\n    return out\n\nprint(countdown_list(3), countdown_loop(3))",
    key_idea: "To turn a loop into recursion, the base case is when the loop would stop, and the recursive call does what the next time round the loop would. Both versions give the same answer.",
  },

  "scope-parameters:predict": {
    problem: "A space game has a planet variable outside a function and another inside it.",
    code: 'planet = "Mars"\n\ndef visit():\n    planet = "Venus"\n    print("Visiting", planet)\n\nvisit()\nprint("Home is", planet)',
    key_idea: "A variable given a value inside a function is local: it is a different variable from one outside with the same name, and it disappears when the function ends.",
  },
  "scope-parameters:fill": {
    problem: "A game collects coins in a global variable.",
    code: "coins = 0\n\ndef collect(n):\n    global coins\n    coins = coins + n\n\ncollect(5)\ncollect(3)\nprint(coins)",
    key_idea: "Use global and the name only when a function must change a variable from outside it. Otherwise, pass values in as parameters and return the new value.",
  },
  "scope-parameters:parsons": {
    problem: "A night sky list is passed to a function that adds to it.",
    code: 'def add_star(sky):\n    sky.append("star")\n\nnight = ["moon"]\nadd_star(night)\nprint(night)',
    key_idea: "A list passed to a function is the same list, not a copy, so a change made inside the function is seen outside. A function that only changes a list doesn't need to return it.",
  },
  "scope-parameters:partial-parsons": {
    problem: "A function tidies up text that was typed with spaces and capitals.",
    code: 'def tidy(word):\n    return word.strip().lower()\n\nentry = tidy("  HELLO ")\nprint(entry)',
    key_idea: "A string can't be changed in place, so a function that works on one returns the new string, and the caller stores it.",
  },
  "scope-parameters:trace": {
    problem: "Trace a number through two calls to a function that changes its parameter.",
    code: "def triple(n):\n    n = n * 3\n    return n\n\nx = 2\ny = triple(x)\nx = triple(y)\nprint(x, y)",
    trace: { columns: ["x", "y"] },
    key_idea: "Only the main program's variables are in the table. Changing a parameter inside a function doesn't change the variable passed in: x and y only change when a returned value is stored.",
  },
  "scope-parameters:write": {
    problem: "A function gives back the length of every tree name in a list.",
    code: 'def lengths(words):\n    out = []\n    for w in words:\n        out.append(len(w))\n    return out\n\ntrees = ["oak", "willow", "ash"]\nprint(trees, lengths(trees))',
    key_idea: "Give a function everything it needs as parameters and return its answer, so it works for any values and never depends on global variables.",
  },

  "oop-classes:predict": {
    problem: "A museum stores each exhibit as an object.",
    code: 'class Exhibit:\n    def __init__(self, title, year):\n        self.title = title\n        self.year = year\n\ne = Exhibit("Sundial", 1650)\nprint(e.title, e.year)',
    key_idea: "Calling the class makes a new object and runs __init__, which stores each value on the object with self. Then object.attribute reads it.",
  },
  "oop-classes:fill": {
    problem: "A space program stores a comet's name and speed.",
    code: 'class Comet:\n    def __init__(self, name, speed):\n        self.name = name\n        self.speed = speed\n\nc = Comet("Halley", 70)\nprint(c.name, "travels at", c.speed)',
    key_idea: "Inside __init__, self is the new object. self.name = name stores the parameter on the object; a plain name = name would be thrown away.",
  },
  "oop-classes:parsons": {
    problem: "A campsite adds up the beds in its tents.",
    code: 'class Tent:\n    def __init__(self, beds):\n        self.beds = beds\ncamp = [Tent(2), Tent(4), Tent(3)]\ntotal = 0\nfor t in camp:\n    total = total + t.beds\nprint("Beds:", total)',
    key_idea: "Write the class first, then make objects from it. A list can hold several objects; loop over it and use each object's attributes.",
  },
  "oop-classes:partial-parsons": {
    problem: "A lantern object is made, then switched on.",
    code: 'class Lantern:\n    def __init__(self, colour):\n        self.colour = colour\n        self.lit = False\n\nlamp = Lantern("amber")\nlamp.lit = True\nprint(lamp.colour, lamp.lit)',
    key_idea: "Every method, including __init__, takes self first. An attribute set in __init__ belongs to that one object, and can be changed later with object.attribute = value.",
  },
  "oop-classes:trace": {
    problem: "Trace two kite objects as one's height is changed.",
    code: "class Kite:\n    def __init__(self, height):\n        self.height = height\n\nk1 = Kite(10)\nk2 = Kite(25)\nk1.height = k2.height + 5\nprint(k1.height)",
    trace: { columns: ["k1.height", "k2.height"] },
    key_idea: "Each object's attributes get their own columns, such as k1.height. Making an object fills in its attributes on that line; later lines change one attribute of one object.",
  },
  "oop-classes:write": {
    problem: "A space program keeps its moons as objects in a list.",
    code: 'class Moon:\n    def __init__(self, name, km):\n        self.name = name\n        self.km = km\n\nmoons = [Moon("Io", 3643), Moon("Europa", 3122)]\nfor m in moons:\n    print(m.name, m.km)',
    key_idea: "Write the class with an __init__ that stores every value with self, make an object for each item, keep them in a list, and loop over the list to use them.",
  },

  "oop-methods:predict": {
    problem: "A rocket object burns fuel with a method.",
    code: "class Rocket:\n    def __init__(self):\n        self.fuel = 10\n\n    def burn(self):\n        self.fuel = self.fuel - 3\n\nr = Rocket()\nr.burn()\nr.burn()\nprint(r.fuel)",
    key_idea: "A method changes the object it is called on, through self. Each call with brackets runs it once; r.burn without brackets would do nothing.",
  },
  "oop-methods:fill": {
    problem: "A garden object works out the length of fence it needs.",
    code: "class Garden:\n    def __init__(self, width, length):\n        self.width = width\n        self.length = length\n\n    def fence(self):\n        return 2 * (self.width + self.length)\n\ng = Garden(3, 5)\nprint(g.fence())",
    key_idea: "A method that works something out uses the object's attributes with self, and returns the answer so the caller can use it.",
  },
  "oop-methods:parsons": {
    problem: "A jukebox counts how many songs it has played.",
    code: "class Jukebox:\n    def __init__(self):\n        self.plays = 0\n    def play(self):\n        self.plays = self.plays + 1\nj = Jukebox()\nj.play()\nj.play()\nprint(j.plays)",
    key_idea: "Methods go inside the class, after __init__, each starting with def and self. Calls go after the class, with brackets.",
  },
  "oop-methods:partial-parsons": {
    problem: "A parcel object says whether it is heavy.",
    code: 'class Parcel:\n    def __init__(self, kg):\n        self.kg = kg\n\n    def heavy(self):\n        return self.kg > 20\n\np = Parcel(25)\nif p.heavy():\n    print("Use the trolley")',
    key_idea: "obj.method() runs the method and gives back its value. Without the brackets, obj.method is the method itself: it doesn't run, and it always counts as True in an if.",
  },
  "oop-methods:trace": {
    problem: "Trace two ferries as cars board them.",
    code: "class Ferry:\n    def __init__(self):\n        self.cars = 0\n\n    def board(self, n):\n        self.cars = self.cars + n\n\nf = Ferry()\ng = Ferry()\nf.board(4)\ng.board(2)\nf.board(g.cars)\nprint(f.cars)",
    trace: { columns: ["f.cars", "g.cars"] },
    key_idea: "A method call changes only the object before the dot, so write the new value in that object's column on the call's row.",
  },
  "oop-methods:write": {
    problem: "A piggy bank object with a method that adds coins and one that gives the total.",
    code: "class Piggy:\n    def __init__(self):\n        self.coins = 0\n\n    def add(self, n):\n        self.coins = self.coins + n\n\n    def total(self):\n        return self.coins\n\nbank = Piggy()\nbank.add(5)\nbank.add(7)\nprint(bank.total())",
    key_idea: "Give the class one method for each job: some change attributes, some return values. Then make the objects and call the methods with brackets.",
  },

  "oop-encapsulation:predict": {
    problem: "A vault keeps its gold in a private attribute.",
    code: "class Vault:\n    def __init__(self):\n        self._gold = 0\n\n    def add_gold(self, n):\n        if n > 0:\n            self._gold = self._gold + n\n\n    def get_gold(self):\n        return self._gold\n\nv = Vault()\nv.add_gold(30)\nv.add_gold(-10)\nprint(v.get_gold())",
    key_idea: "A private attribute (its name starts with _) is changed only through the class's methods, so their checks always run: a value that fails is refused.",
  },
  "oop-encapsulation:fill": {
    problem: "A thermometer only stores readings from -50 to 60.",
    code: "class Thermometer:\n    def __init__(self):\n        self._reading = 20\n\n    def set_reading(self, r):\n        if -50 <= r <= 60:\n            self._reading = r\n\n    def get_reading(self):\n        return self._reading\n\nt = Thermometer()\nt.set_reading(75)\nprint(t.get_reading())",
    key_idea: "A setter checks the value before storing it, like a validation check, and a getter returns the stored value.",
  },
  "oop-encapsulation:parsons": {
    problem: "A nickname is only stored if it has 2 to 8 letters.",
    code: 'class Nickname:\n    def __init__(self):\n        self._nick = "nobody"\n    def set_nick(self, n):\n        if 2 <= len(n) <= 8:\n            self._nick = n\n    def get_nick(self):\n        return self._nick\nx = Nickname()\nx.set_nick("Ziggy")\nprint(x.get_nick())',
    key_idea: "Put the check inside the setter, before the value is stored. Code outside the class calls the setter instead of changing the attribute itself.",
  },
  "oop-encapsulation:partial-parsons": {
    problem: "A scoreboard's home score can only go up through its method.",
    code: 'class Scoreboard:\n    def __init__(self):\n        self._home = 0\n\n    def goal(self):\n        self._home = self._home + 1\n\n    def get_home(self):\n        return self._home\n\ns = Scoreboard()\ns.goal()\ns.goal()\nprint("Home:", s.get_home())',
    key_idea: "Outside the class, read and change a private attribute only through its methods, with brackets. Changing it directly would skip the class's own rules.",
  },
  "oop-encapsulation:trace": {
    problem: "Trace a cooler whose setter only allows 2 to 8 degrees.",
    code: "class Cooler:\n    def __init__(self):\n        self._temp = 5\n\n    def set_temp(self, t):\n        if 2 <= t <= 8:\n            self._temp = t\n\nc = Cooler()\nc.set_temp(4)\nc.set_temp(12)\nc._temp = 12\nprint(c._temp)",
    trace: { columns: ["c._temp"] },
    key_idea: "A setter call that is refused changes nothing, so it gets no row. Setting the attribute directly skips the check, which is why it can break the class.",
  },
  "oop-encapsulation:write": {
    problem: "A gym membership level can only be one of three allowed levels.",
    code: 'class Membership:\n    def __init__(self):\n        self._level = "bronze"\n\n    def set_level(self, lv):\n        if lv in ["bronze", "silver", "gold"]:\n            self._level = lv\n\n    def get_level(self):\n        return self._level\n\nm = Membership()\nm.set_level("platinum")\nm.set_level("silver")\nprint(m.get_level())',
    key_idea: "Make the attribute private, give it a getter, and a setter that checks each value (range, length, presence or an allowed list) before storing it.",
  },

  "oop-inheritance:predict": {
    problem: "Musical instruments: one subclass overrides sound, one doesn't.",
    code: 'class Instrument:\n    def sound(self):\n        return "plink"\n\nclass Trumpet(Instrument):\n    def sound(self):\n        return "toot"\n\nclass Harp(Instrument):\n    pass\n\nfor i in [Trumpet(), Harp()]:\n    print(i.sound())',
    key_idea: "Python looks for a method in the object's own class first, then in its parent. A subclass that overrides a method uses its own version; one that doesn't inherits the parent's.",
  },
  "oop-inheritance:fill": {
    problem: "A tower is a building with a height as well as floors.",
    code: "class Building:\n    def __init__(self, floors):\n        self.floors = floors\n\nclass Tower(Building):\n    def __init__(self, floors, height):\n        super().__init__(floors)\n        self.height = height\n\nt = Tower(30, 120)\nprint(t.floors, t.height)",
    key_idea: "A subclass is written class Child(Parent):. If it has its own __init__, it calls super().__init__(...) first so the parent's attributes are stored, then adds its own.",
  },
  "oop-inheritance:parsons": {
    problem: "A gas giant is a planet with its own description.",
    code: 'class Planet:\n    def __init__(self, name):\n        self.name = name\n    def info(self):\n        return self.name + " orbits the Sun"\nclass Giant(Planet):\n    def info(self):\n        return self.name + " is a gas giant"\ng = Giant("Saturn")\nprint(g.info())',
    key_idea: "Write the parent class first, then the subclass with the parent's name in brackets. A method with the same name in the subclass overrides the parent's.",
  },
  "oop-inheritance:partial-parsons": {
    problem: "A gold badge adds to the label of an ordinary badge.",
    code: 'class Badge:\n    def label(self):\n        return "member"\n\nclass GoldBadge(Badge):\n    def label(self):\n        return "gold " + super().label()\n\nprint(GoldBadge().label())',
    key_idea: "super().method() runs the parent's version from inside an override, so the subclass can add to it instead of starting again.",
  },
  "oop-inheritance:trace": {
    problem: "Trace a plant and a bamboo, which grows faster.",
    code: "class Plant:\n    def __init__(self):\n        self.height = 1\n\n    def grow(self):\n        self.height = self.height + 1\n\nclass Bamboo(Plant):\n    def grow(self):\n        self.height = self.height + 10\n\np = Plant()\nb = Bamboo()\np.grow()\nb.grow()\nprint(p.height, b.height)",
    trace: { columns: ["p.height", "b.height"] },
    key_idea: "Check each object's own class to see which version of a method runs, then write the new value in that object's column.",
  },
  "oop-inheritance:write": {
    problem: "A toll road charges lorries more than other vehicles.",
    code: 'class Vehicle:\n    def __init__(self, name):\n        self.name = name\n\n    def toll(self):\n        return 5\n\nclass Lorry(Vehicle):\n    def toll(self):\n        return 12\n\ntotal = 0\nfor v in [Vehicle("van"), Lorry("truck"), Vehicle("car")]:\n    total = total + v.toll()\nprint("Tolls:", total)',
    key_idea: "Put what every kind shares in the parent class, override only what is different, and call the same method on every object in a list: each uses its own version.",
  },

  "debugging:predict": {
    problem: "A walking log should print the total miles and the mean of 3 walks.",
    code: 'miles = [3, 5, 2]\ntotal = 0\nfor m in miles:\n    total = total + m\nprint("Miles:", total)\nprint("Mean:", total // 2)',
    key_idea: "Read the program line by line and work out each value. A bug can sit quietly on one line and only show up later, in the output of another line: here the mean divides by 2, not by 3.",
  },
  "debugging:fill": {
    problem: "Reading an error message: a list of cities was used past its end.",
    code: '# This program stopped with an error message:\n#   1  cities = ["Leeds", "York"]\n#   2  print(cities[2])\n#   IndexError: list index out of range (line 2)\nprint("Line 2, IndexError")',
    key_idea: "An error message names the line where Python stopped, and its last line gives the type, such as NameError, TypeError or IndexError. Start there.",
  },
  "debugging:parsons": {
    problem: "A speed camera program, fixed: the original used >= where it needed >.",
    code: 'speed = int(input("Speed: "))\nif speed > 30:\n    print("Too fast")\nelse:\n    print("OK")',
    inputs: ["35"],
    key_idea: "When you fix a program, keep the lines that were right and replace only the buggy ones. Check each line you leave out: is it the version with the bug?",
  },
  "debugging:partial-parsons": {
    problem: "A program finding the longest length was fixed by changing its starting value to the first item.",
    code: 'lengths = [12, 7, 9]\nlongest = lengths[0]\nfor n in lengths:\n    if n > longest:\n        longest = n\nprint("Longest:", longest)',
    key_idea: "Find the line that causes the bug, not the line where it shows. Changing only that line fixes the program without changing what it should print.",
  },
  "debugging:trace": {
    problem: "Trace a program that should work out 3 tickets at 8 each, plus 1 booking fee: 25.",
    code: "cost = 8\nqty = 3\ntotal = cost + qty\ntotal = total + 1\nprint(total)",
    trace: {},
    key_idea: "Trace the program and compare each value with what it should be. The first row with a wrong value tells you which line to fix: here line 3 adds where it should multiply.",
  },
  "debugging:write": {
    problem: "A lap timer, after its bugs were fixed. The user types 62, 58 and 60.",
    code: 'laps = []\nfor k in range(3):\n    laps.append(int(input("Lap time: ")))\nbest = laps[0]\nfor t in laps:\n    if t < best:\n        best = t\nprint("Best lap:", best)',
    inputs: ["62", "58", "60"],
    key_idea: "Run the program, fix the first error Python stops at, then run it again. Once it runs, check its output against what it should print, and fix any line that gives a wrong value.",
  },
};

module.exports = { EXAMPLES };
