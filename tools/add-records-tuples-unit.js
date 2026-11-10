// One-off (2026-11): the "Records and tuples" unit (id records-tuples, A-level data structures), built with
// tools/unit-tasks.js. The A-level ladder, placement at levels 2, 5, 7 and 9 (no buggy variants), and an explainer on
// every task (see tools/add-recursion-unit.js). A tuple isn't shown in a trace table, so the trace tasks trace the
// variables a record is unpacked into. COVERAGE lists each angle and its tasks.
"use strict";
const { T, addUnit, nameCasting } = require("./unit-tasks.js");

const PRACTICE = [
  // ---------- Level 1: predict ----------
  { id: "tup-L1a", level: 1, type: "predict", title: "A pupil record",
    description: "pupil is a record stored as a tuple. What does the program print?",
    solution: `pupil = ("Ava", 15, "10B")
print(pupil[0], pupil[2])`, tests: [T([])],
    wrongOutputs: ["Ava 15", "pupil[0] pupil[2]"],
    hints: ["The fields of a tuple are numbered from 0.", "pupil[2] is the third field."],
    skills: ["tuple", "field-index"], tags: ["RECORD_FIELD_WRONG_INDEX"],
    buggy: [["RECORD_FIELD_WRONG_INDEX", `pupil = ("Ava", 15, "10B")
print(pupil[1], pupil[2])`]],
    explainer: "A tuple keeps several values together in order, and an index in square brackets picks one field, counting from 0." },
  { id: "tup-L1b", level: 1, type: "predict", title: "Unpack a point",
    description: "The tuple point is unpacked into three variables. What does the program print?",
    solution: `point = (4, 7, 2)
x, y, z = point
print(y + z, len(point))`, tests: [T([])],
    wrongOutputs: ["6 3", "9 2"],
    hints: ["Unpacking gives each variable the value in the same position.", "len counts the values in the tuple."],
    skills: ["unpack", "tuple"], tags: ["TUPLE_UNPACK_ORDER"],
    buggy: [["TUPLE_UNPACK_ORDER", `point = (4, 7, 2)
z, y, x = point
print(y + z, len(point))`]],
    explainer: "Unpacking puts each value of the tuple into the variable in the same position, so the first name gets the first value." },
  { id: "tup-L1c", level: 1, type: "predict", title: "A list of cars",
    description: "cars is a list of records, each a tuple of a make and a year. What does the program print?",
    solution: `cars = [("Ford", 2019), ("Kia", 2021), ("Fiat", 2015)]
print(len(cars), cars[1][0])`, tests: [T([])],
    wrongOutputs: ["2 Kia", "3 Ford"],
    hints: ["len counts the records in the list.", "cars[1] is the second record; [0] is its first field."],
    skills: ["record-list", "field-index"], tags: ["RECORD_FIELD_WRONG_INDEX"],
    buggy: [["RECORD_FIELD_WRONG_INDEX", `cars = [("Ford", 2019), ("Kia", 2021), ("Fiat", 2015)]
print(len(cars), cars[1][1])`]],
    explainer: "cars[1] picks the second record from the list, and the second index then picks a field from inside that record." },

  // ---------- Level 2: predict, spot the trap ----------
  { id: "tup-L2a", level: 2, type: "predict", title: "Add to a tuple",
    description: "A tuple can't be changed. So what does this program print?",
    solution: `prices = (3, 5, 8)
prices = prices + (2,)
print(prices, len(prices))`, tests: [T([])],
    wrongOutputs: ["(3, 5, 8) 3", "(5, 7, 10) 3", "(3, 5, 8, 2) 3"],
    hints: ["+ joins two tuples into a new, longer tuple.", "prices is then given the new tuple."],
    skills: ["immutable", "tuple"], tags: ["trap"],
    explainer: "A tuple can't be changed, but + joins two tuples into a new one, and the name prices is then given that new tuple." },
  { id: "tup-L2b", level: 2, type: "predict", title: "Swap with a tuple",
    description: "The third line swaps a and b. What does the program print?",
    solution: `a = 5
b = 9
a, b = b, a
print(a, b)`, tests: [T([])],
    wrongOutputs: ["9 9", "5 5"],
    hints: ["b, a on the right makes a tuple of the old values.", "It is then unpacked into a and b."],
    skills: ["unpack", "tuple"], tags: ["TUPLE_UNPACK_ORDER"],
    buggy: [["TUPLE_UNPACK_ORDER", `a = 5
b = 9
a, b = a, b
print(a, b)`]],
    explainer: "The right side is made into a tuple first, using the old values, and then unpacked into a and b, so the two values swap." },
  { id: "tup-L2c", level: 2, type: "predict", title: "Is the record there?",
    description: "in checks whether a record is in a list of records. What does the program print?",
    solution: `best = ("Mia", 72)
scores = [("Leo", 64), ("Mia", 72), ("Zoe", 81)]
print(best in scores, ("Mia", 64) in scores)`, tests: [T([])],
    wrongOutputs: ["True True", "False False", "False True"],
    hints: ["in looks for a record equal to the whole tuple.", "Every field has to match."],
    skills: ["record-list", "tuple"], tags: ["trap"],
    explainer: "in checks for a whole record equal to the one given, so every field has to match, not just the name." },

  // ---------- Level 3: fill in one blank ----------
  { id: "tup-L3a", level: 3, type: "fill", title: "Read the pages",
    description: "book is a record of a title, an author and a number of pages. Fill in the blank so the program prints the number of pages.",
    starter: `book = ("Holes", "Sachar", 240)
print("Pages:", ____)`,
    answers: ["book[2]"], tests: [T([])],
    hints: ["The fields are numbered from 0.", "The pages are the third field."],
    skills: ["field-index"], tags: ["RECORD_FIELD_WRONG_INDEX"],
    buggy: [["RECORD_FIELD_WRONG_INDEX", `book = ("Holes", "Sachar", 240)
print("Pages:", book[1])`]],
    explainer: "The fields are numbered from 0, so the third field of the record, the pages, is book[2]." },
  { id: "tup-L3b", level: 3, type: "fill", title: "Unpack a city",
    description: "Fill in the blank so the record is unpacked into name, people and region, in the order of its fields.",
    starter: `city = ("York", 210000, "North")
name, people, ____ = city
print(name, "is in the", region, "with", people, "people")`,
    answers: ["region"], tests: [T([])],
    hints: ["Unpacking needs one name for each field.", "The third field is the region."],
    skills: ["unpack"], tags: ["TUPLE_UNPACK_ORDER"],
    buggy: [["TUPLE_UNPACK_ORDER", `city = ("York", 210000, "North")
name, region, people = city
print(name, "is in the", region, "with", people, "people")`]],
    explainer: "Unpacking needs one name for each field, in the same order, so the third name gets the region." },
  { id: "tup-L3c", level: 3, type: "fill", title: "Sell some pens",
    description: "stock is a record of an item and how many are left. A tuple can't be changed, so the program makes a new one. Fill in the blank so the new record holds the number left after the sale.",
    starter: `stock = ("pens", 40)
sold = int(input("Sold: "))
stock = (stock[0], ____)
print(stock)`,
    answers: ["stock[1] - sold"], tests: [T(["5"]), T(["12"])],
    hints: ["The number left is the old number take away the number sold.", "The old number is stock[1]."],
    skills: ["immutable", "field-index"], tags: ["TUPLE_CHANGED_IN_PLACE"],
    buggy: [["TUPLE_CHANGED_IN_PLACE", `stock = ("pens", 40)
sold = int(input("Sold: "))
stock[1] = stock[1] - sold
print(stock)`]],
    explainer: "A tuple can't be changed, so the program makes a new tuple from the old name and the new number and stores it in stock." },

  // ---------- Level 4: fill in two blanks ----------
  { id: "tup-L4a", level: 4, type: "fill", title: "Team goals",
    description: "team is a list of records, each a name and a number of goals. Fill in both blanks so the program prints the team's total goals.",
    starter: `team = [("Ava", 12), ("Ben", 9), ("Cal", 15)]
total = 0
for player in team:
    total = total + ____
print("Goals:", ____)`,
    answers: ["player[1]", "total"], tests: [T([])],
    hints: ["player is one whole record each time round.", "The goals are its second field."],
    skills: ["record-list", "field-index"], tags: ["RECORD_FIELD_WRONG_INDEX"],
    buggy: [["RECORD_FIELD_WRONG_INDEX", `team = [("Ava", 12), ("Ben", 9), ("Cal", 15)]
total = 0
for player in team:
    total = total + player[0]
print("Goals:", total)`]],
    explainer: "Each time round the loop player is one whole record, so player[1] is that player's goals, added to the total." },
  { id: "tup-L4b", level: 4, type: "fill", title: "Who passed?",
    description: "Fill in both blanks so the loop unpacks each record into two variables and prints the name of everyone who reached the pass mark.",
    starter: `marks = [("Mia", 70), ("Leo", 55), ("Zoe", 81)]
pass_mark = int(input("Pass mark: "))
for ____ in marks:
    if mark >= pass_mark:
        print(____)`,
    answers: ["name, mark", "name"], tests: [T(["60"]), T(["75"])],
    hints: ["Each record is a name, then a mark: unpack it into two variables, in that order.", "Print only the name."],
    skills: ["unpack", "record-list"], tags: ["TUPLE_UNPACK_ORDER"],
    buggy: [["TUPLE_UNPACK_ORDER", `marks = [("Mia", 70), ("Leo", 55), ("Zoe", 81)]
pass_mark = int(input("Pass mark: "))
for mark, name in marks:
    if mark >= pass_mark:
        print(name)`]],
    explainer: "for name, mark in marks unpacks each record into two variables, so the loop can use the name and the mark by their own names." },
  { id: "tup-L4c", level: 4, type: "fill", title: "A year older",
    description: "pets is a list of records, each a name and an age. Fill in both blanks so the first pet's record is replaced by a new one with the age increased.",
    starter: `pets = [("Rex", 3), ("Bo", 5)]
older = int(input("Years older: "))
old = pets[0]
pets[0] = (____, old[1] + ____)
print(pets)`,
    answers: ["old[0]", "older"], tests: [T(["1"]), T(["4"])],
    hints: ["The new record keeps the old name.", "Its age is the old age plus the years typed."],
    skills: ["immutable", "record-list"], tags: ["TUPLE_CHANGED_IN_PLACE"],
    buggy: [["TUPLE_CHANGED_IN_PLACE", `pets = [("Rex", 3), ("Bo", 5)]
older = int(input("Years older: "))
old = pets[0]
old[1] = old[1] + older
print(pets)`]],
    explainer: "The list can be changed but the record inside it can't, so a new tuple is made and stored in the list in place of the old one." },

  // ---------- Level 5: Parsons, or pick the missing line ----------
  { id: "tup-L5a", level: 5, type: "parsons", title: "Find a pupil",
    description: "Arrange the lines: the program finds the record for the name typed and prints the pupil's age.\nOne line is not needed.",
    solution: `pupils = [("Ava", 15), ("Ben", 14), ("Cal", 16)]
look = input("Name: ")
for name, age in pupils:
    if name == look:
        print(name, "is", age)`,
    distractors: ["for age, name in pupils:"],
    tests: [T(["Ben"]), T(["Cal"])],
    hints: ["Each record is a name, then an age.", "Unpack in that order."],
    skills: ["unpack", "record-list"], tags: ["parsons"],
    explainer: "The loop unpacks each record into name and age in the same order as its fields, then prints the one whose name matches." },
  { id: "tup-L5b", level: 5, type: "partial-parsons", title: "Seats left",
    description: "flight is a record of a flight number, a city and a number of seats. Pick the missing line, so the program prints how many seats are left.",
    starter: `flight = ("BA117", "London", 145)
booked = int(input("Booked: "))
____
print("Seats left:", seats - booked)`,
    options: ["seats = flight[2]", "seats = flight[3]", "seats = flight[1]", "flight[2] = seats"], optionMisconceptions: { 1: "RECORD_FIELD_WRONG_INDEX" },
    tests: [T(["20"]), T(["140"])],
    hints: ["The seats are the third field.", "Fields are numbered from 0."],
    skills: ["field-index"], tags: ["RECORD_FIELD_WRONG_INDEX"],
    explainer: "The seat count is the third field, so it is flight[2], counting from 0, and it is stored in seats before it is used." },
  { id: "tup-L5c", level: 5, type: "partial-parsons", title: "Bonus points",
    description: "score is a record of a name and a number of points. Pick the missing line, so the bonus typed is added to the points.",
    starter: `score = ("Kai", 20)
bonus = int(input("Bonus: "))
____
print(score[0], score[1])`,
    options: ["score = (score[0], score[1] + bonus)", "score[1] = score[1] + bonus", "score = score[1] + bonus", "score = (score[1] + bonus, score[0])"],
    optionMisconceptions: { 1: "TUPLE_CHANGED_IN_PLACE" },
    tests: [T(["5"]), T(["15"])],
    hints: ["A tuple can't be changed.", "Make a new tuple with the same name and the new points."],
    skills: ["immutable"], tags: ["TUPLE_CHANGED_IN_PLACE"],
    explainer: "A tuple can't be changed, so the line makes a new tuple with the same name and the new score, and stores it in score." },

  // ---------- Level 6: Parsons with traps, or pick the missing line ----------
  { id: "tup-L6a", level: 6, type: "parsons", title: "The longest game",
    description: "Arrange the lines: games is a list of records, each a game and how many minutes it lasts. The program prints the longest game.\nTwo lines are not needed.",
    solution: `games = [("Chess", 40), ("Snap", 10), ("Go", 55)]
best = games[0]
for game in games:
    if game[1] > best[1]:
        best = game
print("Longest:", best[0], best[1])`,
    distractors: ["if game[0] > best[0]:", "best[1] = game[1]"],
    tests: [T([])],
    hints: ["Compare the minutes, the second field.", "Keep the whole record, so its name stays with it."],
    skills: ["record-list", "field-index"], tags: ["highest"],
    explainer: "best keeps the whole record with the longest time so far, so the program compares the time fields and swaps in the whole record." },
  { id: "tup-L6b", level: 6, type: "partial-parsons", title: "Lowest and highest",
    description: "min_max returns a tuple of the smallest and the largest number. Pick the missing line, so the program prints the range (the largest take away the smallest).",
    starter: `def min_max(a, b, c):
    return (min(a, b, c), max(a, b, c))

a = int(input("A: "))
b = int(input("B: "))
c = int(input("C: "))
____
print("Range:", high - low)`,
    options: ["low, high = min_max(a, b, c)", "high, low = min_max(a, b, c)", "low = min_max(a, b, c)", "low, high = (a, c)"],
    optionMisconceptions: { 1: "TUPLE_UNPACK_ORDER" },
    tests: [T(["4", "9", "2"]), T(["7", "1", "5"])],
    hints: ["The function returns the smallest first.", "Unpack in the same order."],
    skills: ["unpack", "tuple"], tags: ["TUPLE_UNPACK_ORDER"],
    explainer: "The function returns one tuple of two values, and unpacking it in the same order puts the smallest in low and the largest in high." },

  // ---------- Level 7: trace, or write a short line ----------
  { id: "tup-L7a", level: 7, type: "trace", title: "Trace a shopping record",
    description: "Trace the program. A tuple isn't shown in the table: trace the variables it is unpacked into.",
    solution: `item = ("cap", 8, 3)
name, price, qty = item
cost = price * qty
item = (name, price, qty + 2)
qty = item[2]
cost = cost + price * 2
print(name, cost)`, tests: [T([])],
    trace: { columns: ["name", "price", "qty", "cost"] },
    hints: ["Unpacking fills in all three variables on one line.", "Making a new tuple doesn't change qty until qty = item[2]."],
    skills: ["unpack", "immutable"], tags: ["TUPLE_UNPACK_ORDER"],
    buggy: [["TUPLE_UNPACK_ORDER", `item = ("cap", 8, 3)
name, qty, price = item
cost = price * qty
item = (name, price, qty + 2)
qty = item[2]
cost = cost + price * 2
print(name, cost)`]],
    explainer: "Unpacking copies each field into its own variable, and making a new tuple later doesn't change those variables until qty is read again." },
  { id: "tup-L7b", level: 7, type: "write", title: "Make a film record",
    description: "Add one line that makes a record (a tuple) called film from the title and the year typed, in that order. The program then prints it, for example:\nUp 2009",
    starter: `title = input("Title: ")
year = int(input("Year: "))
# Make a tuple called film holding the title, then the year

print(film[0], film[1])`,
    solution: `title = input("Title: ")
year = int(input("Year: "))
film = (title, year)

print(film[0], film[1])`,
    tests: [T(["Up", "2009"]), T(["Cars", "2006"])],
    hints: ["A tuple is written with round brackets and commas.", "Put the title first and the year second."],
    skills: ["tuple"], tags: ["TUPLE_UNPACK_ORDER"],
    buggy: [["TUPLE_UNPACK_ORDER", `title = input("Title: ")
year = int(input("Year: "))
film = (year, title)

print(film[0], film[1])`]],
    explainer: "A record's fields go in a fixed order, so film = (title, year) puts the title at index 0 and the year at index 1." },
  { id: "tup-L7c", level: 7, type: "trace", title: "Trace the tea orders",
    description: "Trace the program. Each order is a record of a drink and a quantity.",
    solution: `orders = [("tea", 2), ("cake", 3), ("tea", 1)]
teas = 0
for drink, qty in orders:
    if drink == "tea":
        teas = teas + qty
print(teas)`, tests: [T([])],
    trace: { columns: ["drink", "qty", "teas"] },
    hints: ["The loop line unpacks the next record into drink and qty.", "Only tea orders change teas."],
    skills: ["unpack", "record-list"], tags: ["TUPLE_UNPACK_ORDER"],
    buggy: [["TUPLE_UNPACK_ORDER", `orders = [("tea", 2), ("cake", 3), ("tea", 1)]
teas = 0
for qty, drink in orders:
    if drink == "tea":
        teas = teas + qty
print(teas)`]],
    explainer: "Each time round, the loop unpacks the next record into drink and qty, and only the tea records add their qty to teas." },

  // ---------- Level 8: trace, or write ----------
  { id: "tup-L8a", level: 8, type: "write", title: "High scores",
    description: "Store a list of three records (tuples), each a name and a score: (\"Ava\", 72), (\"Ben\", 58) and (\"Cal\", 91). Ask for a score, then print the name of every pupil whose score is at least that, then how many there were, for example:\nAva\nCal\nPupils: 2",
    starter: "# Store the list of records, then search it",
    solution: `results = [("Ava", 72), ("Ben", 58), ("Cal", 91)]
target = int(input("Score: "))
count = 0
for name, score in results:
    if score >= target:
        print(name)
        count = count + 1
print("Pupils:", count)`,
    tests: [T(["70"]), T(["95"])],
    hints: ["Unpack each record into a name and a score.", "Count the records whose score is at least the one typed."],
    skills: ["record-list", "unpack"], tags: ["RECORD_FIELD_WRONG_INDEX", "TUPLE_UNPACK_ORDER"],
    buggy: [["RECORD_FIELD_WRONG_INDEX", `results = [("Ava", 72), ("Ben", 58), ("Cal", 91)]
target = int(input("Score: "))
count = 0
for r in results:
    if r[0] >= target:
        print(r[1])
        count = count + 1
print("Pupils:", count)`],
      ["TUPLE_UNPACK_ORDER", `results = [("Ava", 72), ("Ben", 58), ("Cal", 91)]
target = int(input("Score: "))
count = 0
for score, name in results:
    if score >= target:
        print(name)
        count = count + 1
print("Pupils:", count)`]],
    explainer: "Each record keeps a name and a score together, so one loop can check every score and print the name from the same record." },
  { id: "tup-L8b", level: 8, type: "trace", title: "Trace a moving point",
    description: "Trace the program. pos is a tuple; trace x and y.",
    solution: `pos = (2, 5)
x, y = pos
x, y = y, x + y
pos = (x, y)
x = pos[0] * 2
y = pos[1] - x
print(x, y)`, tests: [T([])],
    trace: { columns: ["x", "y"] },
    hints: ["On line 3 both new values are worked out from the old x and y.", "Then both are stored at once."],
    skills: ["unpack", "tuple"], tags: ["TUPLE_UNPACK_ORDER"],
    buggy: [["TUPLE_UNPACK_ORDER", `pos = (2, 5)
y, x = pos
x, y = y, x + y
pos = (x, y)
x = pos[0] * 2
y = pos[1] - x
print(x, y)`]],
    explainer: "The right side of x, y = y, x + y is worked out with the old values first, and only then are both new values stored." },

  // ---------- Level 9: write a full program, or a longer trace ----------
  { id: "tup-L9a", level: 9, type: "write", title: "The dearest item",
    description: "Ask how many items there are. For each one, ask for its name and its price in pence, and store it in a list as a tuple. Then print the name of the dearest item, and the total price, for example:\nDearest: cake\nTotal: 470",
    starter: "# Read the items into a list of tuples",
    solution: `items = []
n = int(input("How many? "))
for k in range(n):
    name = input("Name: ")
    price = int(input("Price: "))
    items.append((name, price))
dearest = items[0]
total = 0
for item in items:
    total = total + item[1]
    if item[1] > dearest[1]:
        dearest = item
print("Dearest:", dearest[0])
print("Total:", total)`,
    tests: [T(["3", "tea", "120", "cake", "250", "bun", "100"]), T(["2", "pie", "300", "jam", "90"])],
    hints: ["append((name, price)) adds one record to the list.", "Keep the whole dearest record, then print its first field."],
    skills: ["record-list", "tuple", "field-index"], tags: ["RECORD_FIELD_WRONG_INDEX"],
    buggy: [["RECORD_FIELD_WRONG_INDEX", `items = []
n = int(input("How many? "))
for k in range(n):
    name = input("Name: ")
    price = int(input("Price: "))
    items.append((name, price))
dearest = items[0]
total = 0
for item in items:
    total = total + item[1]
    if item[1] > dearest[1]:
        dearest = item
print("Dearest:", dearest[1])
print("Total:", total)`]],
    explainer: "Storing each item as a (name, price) tuple keeps the two fields together, so the dearest record still knows its own name." },
  { id: "tup-L9b", level: 9, type: "trace", title: "Trace the stock check",
    description: "Trace the program. Each record is an item and how many are in stock.",
    solution: `stock = [("pen", 4), ("pad", 0), ("ink", 7)]
low = 0
total = 0
for name, qty in stock:
    total = total + qty
    if qty < 5:
        low = low + 1
        last = name
print(low, total, last)`, tests: [T([])],
    trace: { columns: ["name", "qty", "total", "low", "last"] },
    hints: ["Every record adds its qty to total.", "low and last only change when qty is under 5."],
    skills: ["unpack", "record-list"], tags: ["trace"],
    explainer: "Each record is unpacked into name and qty, the total adds every qty, and low and last only change for records with fewer than five." },

  // ---------- Level 10: write an extended program, or a longer trace ----------
  { id: "tup-L10a", level: 10, type: "write", title: "A price rise",
    description: "Store a list of three records (tuples) of a product and its price: (\"pen\", 120), (\"pad\", 250) and (\"ink\", 80). Ask for a percentage rise. Tuples can't be changed, so make a new list holding a new tuple for each product with its new price (price + price * rise // 100). Print each new record's product and price, then the total of the new prices, for example:\npen 132\npad 275\nink 88\nTotal: 495",
    starter: "# Store the records, then make a new list of new records",
    solution: `prices = [("pen", 120), ("pad", 250), ("ink", 80)]
rise = int(input("Rise %: "))
new_prices = []
for product, price in prices:
    new_prices.append((product, price + price * rise // 100))
total = 0
for product, price in new_prices:
    print(product, price)
    total = total + price
print("Total:", total)`,
    tests: [T(["10"]), T(["25"])],
    hints: ["You can't change a price inside a tuple: append a new tuple to a new list.", "Then loop over the new list to print and add up."],
    skills: ["immutable", "record-list", "unpack"], tags: ["TUPLE_CHANGED_IN_PLACE"],
    buggy: [["TUPLE_CHANGED_IN_PLACE", `prices = [("pen", 120), ("pad", 250), ("ink", 80)]
rise = int(input("Rise %: "))
for item in prices:
    item[1] = item[1] + item[1] * rise // 100
total = 0
for product, price in prices:
    print(product, price)
    total = total + price
print("Total:", total)`]],
    explainer: "A tuple can't be changed, so each new price goes into a new tuple, and the new list holds those new records." },
  { id: "tup-L10b", level: 10, type: "trace", title: "Trace the fastest runner",
    description: "Trace the program. Each record is a runner and a time in seconds.",
    solution: `runs = [("Ava", 31), ("Ben", 28), ("Cal", 35)]
fast_name, fast_time = runs[0]
slow_time = fast_time
for name, time in runs:
    if time < fast_time:
        fast_name, fast_time = name, time
    if time > slow_time:
        slow_time = time
gap = slow_time - fast_time
print(fast_name, gap)`, tests: [T([])],
    trace: { columns: ["name", "time", "fast_name", "fast_time", "slow_time", "gap"] },
    hints: ["fast_name and fast_time change together, on one line.", "The lowest time is the fastest."],
    skills: ["unpack", "record-list"], tags: ["TUPLE_UNPACK_ORDER"],
    buggy: [["TUPLE_UNPACK_ORDER", `runs = [("Ava", 31), ("Ben", 28), ("Cal", 35)]
fast_name, fast_time = runs[0]
slow_time = fast_time
for time, name in runs:
    if time < fast_time:
        fast_name, fast_time = name, time
    if time > slow_time:
        slow_time = time
gap = slow_time - fast_time
print(fast_name, gap)`]],
    explainer: "Unpacking a record into two variables at once keeps the fastest name and time together, and they are only replaced when a faster time is found." },
];

// Placement (levels 2, 5, 7 and 9): no buggy variants.
const PLACEMENT = [
  { id: "tup-P2a", level: 2, type: "predict", title: "A shape record",
    description: "shape is a record of a name, a number of sides and a side length. What does the program print?",
    solution: `shape = ("square", 4, 5)
name, sides, size = shape
print(name, sides * size)`, tests: [T([])],
    wrongOutputs: ["square 9", "4 20", "square 45"],
    hints: ["Unpack in the order of the fields.", "Then multiply sides by size."],
    skills: ["unpack"], tags: ["tuple"],
    explainer: "Unpacking gives each field its own variable, in the same order as the fields in the tuple." },
  { id: "tup-P2b", level: 2, type: "predict", title: "Days of rain",
    description: "days is a list of records, each a day and how many hours it rained. What does the program print?",
    solution: `days = [("Mon", 3), ("Tue", 6), ("Wed", 2)]
print(days[2][0], days[0][1] + days[1][1])`, tests: [T([])],
    wrongOutputs: ["Tue 9", "Wed 36", "Wed 5"],
    hints: ["The first index picks a record.", "The second picks a field in it."],
    skills: ["record-list", "field-index"], tags: ["tuple"],
    explainer: "The first index picks a record from the list and the second picks a field inside that record, both counting from 0." },
  { id: "tup-P5a", level: 5, type: "parsons", title: "A pet record",
    description: "Arrange the lines: the program makes a record from the name and age typed, then unpacks it.\nOne line is not needed.",
    solution: `pet = (input("Name: "), int(input("Age: ")))
name, age = pet
print(name, "will be", age + 1)`,
    distractors: ["age, name = pet"],
    tests: [T(["Rex", "4"]), T(["Bo", "9"])],
    hints: ["The record is a name, then an age.", "Unpack in the same order."],
    skills: ["tuple", "unpack"], tags: ["parsons"],
    explainer: "The record is made from the two values typed, then unpacked in the same order into name and age." },
  { id: "tup-P5b", level: 5, type: "partial-parsons", title: "A song's length",
    description: "song is a record of a title, a singer and a length in seconds. Pick the missing line, so the program prints the length in minutes and seconds.",
    starter: `song = ("Hello", "Adele", 295)
____
print(minutes, "minutes", seconds, "seconds")`,
    options: ["minutes, seconds = song[2] // 60, song[2] % 60", "minutes, seconds = song[1] // 60, song[1] % 60",
      "minutes, seconds = song[2] % 60, song[2] // 60", "minutes = song[2] // 60"],
    tests: [T([])],
    hints: ["The length is the third field.", "// 60 gives whole minutes and % 60 the seconds left."],
    skills: ["field-index", "unpack"], tags: ["tuple"],
    explainer: "The length is the third field, song[2], and the two values on the right are unpacked into minutes and seconds in the same order." },
  { id: "tup-P7a", level: 7, type: "trace", title: "Trace two points",
    description: "Trace the program. a and b are tuples; trace x and y.",
    solution: `a = (3, 8)
b = (a[1], a[0] + 4)
x, y = b
x = x - y
print(x, y)`, tests: [T([])],
    trace: { columns: ["x", "y"] },
    hints: ["b is made from a's fields.", "Unpack b into x and y."],
    skills: ["unpack", "field-index"], tags: ["trace"],
    explainer: "b is a new tuple made from a's fields, and unpacking it copies its two values into x and y." },
  { id: "tup-P7b", level: 7, type: "write", title: "Unpack a person",
    description: "Add one line that unpacks the record person into the variables name, age and town, in that order. The program then prints them, for example:\nAva lives in Leeds and is 15",
    starter: `person = (input("Name: "), int(input("Age: ")), input("Town: "))
# Unpack person into name, age and town

print(name, "lives in", town, "and is", age)`,
    solution: `person = (input("Name: "), int(input("Age: ")), input("Town: "))
name, age, town = person

print(name, "lives in", town, "and is", age)`,
    tests: [T(["Ava", "15", "Leeds"]), T(["Kai", "12", "York"])],
    hints: ["Write the three names, then = person.", "Use the same order as the fields."],
    skills: ["unpack"], tags: ["write"],
    explainer: "Unpacking needs one variable for each field, in the same order, so name, age, town = person gives each field its own name." },
  { id: "tup-P9a", level: 9, type: "write", title: "Warm cities",
    description: "Store a list of three records (tuples) of a city and its temperature: (\"Leeds\", 12), (\"Rome\", 24) and (\"Oslo\", 4). Ask for a temperature, then print every city warmer than that, for example:\nRome",
    solution: `temps = [("Leeds", 12), ("Rome", 24), ("Oslo", 4)]
limit = int(input("Temperature: "))
for city, temp in temps:
    if temp > limit:
        print(city)`,
    tests: [T(["10"]), T(["20"])],
    hints: ["Unpack each record into a city and a temperature.", "Print the city when its temperature is higher."],
    skills: ["record-list", "unpack"], tags: ["write"],
    explainer: "Each record keeps a city and its temperature together, so the loop can check the temperature and print the city from the same record." },
  { id: "tup-P9b", level: 9, type: "trace", title: "Trace the top score",
    description: "Trace the program. Each record is a name and a score.",
    solution: `scores = [("Ann", 6), ("Bob", 9), ("Cat", 4)]
top = 0
for name, s in scores:
    if s > top:
        top = s
        who = name
print(who, top)`, tests: [T([])],
    trace: { columns: ["name", "s", "top", "who"] },
    hints: ["The loop line unpacks the next record.", "top and who change only for a higher score."],
    skills: ["unpack", "record-list"], tags: ["trace"],
    explainer: "Each record is unpacked into name and s, and top and who change together only when a higher score is found." },
];

const COVERAGE = {
  "Making a tuple and reading its fields by index": ["tup-L1a", "tup-L1c", "tup-L3a", "tup-L5b", "tup-L7b", "tup-P2b", "tup-P5b"],
  "Tuples can't be changed: make a new tuple instead": ["tup-L2a", "tup-L3c", "tup-L4c", "tup-L5c", "tup-L7a", "tup-L10a"],
  "Unpacking a tuple into variables, in the order of its fields": ["tup-L1b", "tup-L2b", "tup-L3b", "tup-L4b", "tup-L6b", "tup-L7a", "tup-L8b", "tup-P2a", "tup-P5a", "tup-P7a", "tup-P7b"],
  "A record as a tuple of fields, and a list of records": ["tup-L1c", "tup-L2c", "tup-L4a", "tup-L5a", "tup-L7c", "tup-L9a", "tup-P2b", "tup-P9a"],
  "Searching, totalling and finding the biggest in a list of records": ["tup-L4a", "tup-L5a", "tup-L6a", "tup-L8a", "tup-L9a", "tup-L9b", "tup-L10b", "tup-P9a", "tup-P9b"],
};

// Tasks that cast input() with int() say so (the casting sentence, tools/unit-tasks.js nameCasting).
nameCasting(PRACTICE.concat(PLACEMENT));

if (require.main === module) addUnit("records-tuples", PRACTICE, PLACEMENT);
module.exports = { PRACTICE, PLACEMENT, COVERAGE };
