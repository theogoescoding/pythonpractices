// One-off (2026-11): the "Scope and parameters" unit (id scope-parameters, A-level programming techniques), built
// with tools/unit-tasks.js. The A-level ladder, placement at levels 2, 5, 7 and 9 (no buggy variants), and an
// explainer on every task (see tools/add-recursion-unit.js). COVERAGE lists each angle and the tasks that cover it.
"use strict";
const { T, addUnit, nameCasting } = require("./unit-tasks.js");

const PRACTICE = [
  // ---------- Level 1: predict ----------
  { id: "scope-L1a", level: 1, type: "predict", title: "Inside and outside",
    description: "bonus gives score a new value. What does the program print?",
    solution: `score = 10

def bonus():
    score = 50
    print("Inside:", score)

bonus()
print("Outside:", score)`, tests: [T([])],
    wrongOutputs: ["Inside: 10\nOutside: 10"],
    hints: ["score = 50 inside the function makes a new variable that only exists inside bonus.", "The score outside the function is a different variable."],
    skills: ["local"], tags: ["LOCAL_THOUGHT_CHANGES_OUTSIDE"],
    buggy: [["LOCAL_THOUGHT_CHANGES_OUTSIDE", `score = 10

def bonus():
    global score
    score = 50
    print("Inside:", score)

bonus()
print("Outside:", score)`]],
    explainer: "score = 50 inside bonus makes a new local variable, so the global score outside the function is left as it was." },
  { id: "scope-L1b", level: 1, type: "predict", title: "A global count",
    description: "add_one uses global. What does the program print?",
    solution: `count = 0

def add_one():
    global count
    count = count + 1

add_one()
add_one()
add_one()
print(count)`, tests: [T([])],
    wrongOutputs: ["0", "1"],
    hints: ["global count means count inside the function is the variable outside it.", "Each call changes that same variable."],
    skills: ["global"], tags: ["global"],
    explainer: "global count lets add_one change the variable outside the function, so every call adds to the same count." },
  { id: "scope-L1c", level: 1, type: "predict", title: "Pass a number in",
    description: "double changes its parameter. What does the program print?",
    solution: `def double(n):
    n = n * 2
    return n

x = 6
y = double(x)
print(x, y)`, tests: [T([])],
    wrongOutputs: ["6 6"],
    hints: ["n is the function's own variable: it starts with x's value.", "Changing n doesn't change x. The new value comes back through return."],
    skills: ["pass-value", "local"], tags: ["LOCAL_THOUGHT_CHANGES_OUTSIDE"],
    buggy: [["LOCAL_THOUGHT_CHANGES_OUTSIDE", `def double(n):
    n = n * 2
    return n

x = 6
x = double(x)
y = x
print(x, y)`]],
    explainer: "Changing the parameter n only changes the function's own variable, so x keeps its value and the new number comes back through return." },

  // ---------- Level 2: predict, spot the trap ----------
  { id: "scope-L2a", level: 2, type: "predict", title: "Pass a list in",
    description: "add_bonus is given the list scores. What does the program print?",
    solution: `def add_bonus(marks):
    marks.append(10)

scores = [7, 8]
add_bonus(scores)
print(scores)`, tests: [T([])],
    wrongOutputs: ["[7, 8, 10, 10]", "None"],
    hints: ["marks and scores are two names for the same list.", "append changes that list."],
    skills: ["pass-list", "mutable"], tags: ["LIST_COPY_ASSUMED"],
    buggy: [["LIST_COPY_ASSUMED", `def add_bonus(marks):
    marks.append(10)

scores = [7, 8]
add_bonus(scores[:])
print(scores)`]],
    explainer: "A list passed to a function isn't copied, so append changes the same list that scores names." },
  { id: "scope-L2b", level: 2, type: "predict", title: "Change a string",
    description: "shout is given the string name. What does the program print?",
    solution: `def shout(word):
    word = word.upper()

name = "sam"
shout(name)
print(name)`, tests: [T([])],
    wrongOutputs: ["Sam", "None"],
    hints: ["A string can't be changed in place: word.upper() makes a new string.", "word = ... only gives the function's own variable that new string."],
    skills: ["mutable", "pass-value"], tags: ["LOCAL_THOUGHT_CHANGES_OUTSIDE"],
    buggy: [["LOCAL_THOUGHT_CHANGES_OUTSIDE", `def shout(word):
    return word.upper()

name = "sam"
name = shout(name)
print(name)`]],
    explainer: "A string can't be changed in place, so word = word.upper() only gives the function's local word a new string and name stays as it was." },
  { id: "scope-L2c", level: 2, type: "predict", title: "A number and a list",
    description: "change is given a number and a list. What does the program print?",
    solution: `def change(n, items):
    n = n + 1
    items[0] = items[0] + 1

a = 5
b = [5]
change(a, b)
print(a, b)`, tests: [T([])],
    wrongOutputs: ["5 [5]"],
    hints: ["n is the function's own variable, so a doesn't change.", "items and b are the same list, so changing items[0] changes b."],
    skills: ["mutable", "pass-list"], tags: ["LIST_COPY_ASSUMED", "LOCAL_THOUGHT_CHANGES_OUTSIDE"],
    buggy: [["LIST_COPY_ASSUMED", `def change(n, items):
    n = n + 1
    items[0] = items[0] + 1

a = 5
b = [5]
change(a, b[:])
print(a, b)`],
      ["LOCAL_THOUGHT_CHANGES_OUTSIDE", `def change(n, items):
    n = n + 1
    items[0] = items[0] + 1

a = 5
b = [5]
change(a, b)
a = a + 1
print(a, b)`]],
    explainer: "Adding 1 to n makes a new number inside the function only, but items[0] = ... changes the list itself, which b also names." },

  // ---------- Level 3: fill in one blank ----------
  { id: "scope-L3a", level: 3, type: "fill", title: "Lose a life",
    description: "Fill in the blank so lose_life changes the lives variable outside the function.",
    starter: `lives = 3

def lose_life():
    ____ lives
    lives = lives - 1

lose_life()
print("Lives:", lives)`,
    answers: ["global"], tests: [T([])],
    hints: ["Assigning to lives inside the function would make a new local variable.", "One word tells Python to use the variable outside instead."],
    skills: ["global"], tags: ["GLOBAL_KEYWORD_MISSING"],
    buggy: [["GLOBAL_KEYWORD_MISSING", `lives = 3

def lose_life():
    lives = lives - 1

lose_life()
print("Lives:", lives)`]],
    explainer: "global lives tells Python that lives inside the function is the variable outside it, so the function can change it." },
  { id: "scope-L3b", level: 3, type: "fill", title: "Return a new value",
    description: "Fill in the blank so add_fee gives back the price with a booking fee of 3 added. The program prints the price and the total.",
    starter: `def add_fee(price):
    return ____

cost = int(input("Price: "))
total = add_fee(cost)
print(cost, total)`,
    answers: ["price + 3"], tests: [T(["12"]), T(["0"])],
    hints: ["Inside the function, the price is called price.", "return gives the new value back to where the function was called."],
    skills: ["pass-value"], tags: ["return"],
    explainer: "add_fee gives back a new value with return, which the caller stores in total, while cost itself is not changed." },
  { id: "scope-L3c", level: 3, type: "fill", title: "Add to the bag",
    description: "Fill in the blank so add_glue adds \"glue\" to the list it is given. The program prints the bag afterwards.",
    starter: `def add_glue(items):
    items.____("glue")

bag = ["pen", "ruler", "rubber"]
add_glue(bag)
print(bag)`,
    answers: ["append"], tests: [T([])],
    hints: ["One list method adds an item to the end.", "items and bag are the same list."],
    skills: ["pass-list"], tags: ["LIST_COPY_ASSUMED"],
    buggy: [["LIST_COPY_ASSUMED", `def add_glue(items):
    items.append("glue")

bag = ["pen", "ruler", "rubber"]
add_glue(bag[:])
print(bag)`]],
    explainer: "append adds to the list itself, and bag names that same list, so the change is seen outside the function." },

  // ---------- Level 4: fill in two blanks ----------
  { id: "scope-L4a", level: 4, type: "fill", title: "Parameters, not globals",
    description: "Fill in both blanks so area works for any rectangle it is given, not only the global w and h.",
    starter: `w = 4
h = 3

def area(width, height):
    return ____ * ____

print(area(w, h))
print(area(10, 2))`,
    answers: ["width", "height"], tests: [T([])],
    hints: ["The values passed in are called width and height inside the function.", "w and h never change, so using them gives the same area every time."],
    skills: ["param-or-global"], tags: ["parameter"],
    explainer: "Using the parameters width and height makes area work for whatever values it is given, while the globals w and h would always give the same answer." },
  { id: "scope-L4b", level: 4, type: "fill", title: "A running total",
    description: "Fill in both blanks so add changes the global total, adding the points it is given.",
    starter: `total = 0

def add(points):
    ____ total
    total = total + ____

add(int(input("First: ")))
add(int(input("Second: ")))
print("Total:", total)`,
    answers: ["global", "points"], tests: [T(["4", "5"]), T(["0", "7"])],
    hints: ["The function changes a variable from outside it.", "The points it is given are in its parameter."],
    skills: ["global", "pass-value"], tags: ["GLOBAL_KEYWORD_MISSING"],
    buggy: [["GLOBAL_KEYWORD_MISSING", `total = 0

def add(points):
    total = total + points

add(int(input("First: ")))
add(int(input("Second: ")))
print("Total:", total)`]],
    explainer: "add needs global total to change the running total outside it, and adds the points it was given as its parameter." },
  { id: "scope-L4c", level: 4, type: "fill", title: "A new list",
    description: "Fill in both blanks: remove_negatives returns a new list without the negative numbers, and the list passed in stays as it was.",
    starter: `def remove_negatives(nums):
    clean = []
    for n in nums:
        if n >= 0:
            clean.____(n)
    return ____

data = [4, -2, 7, -5, 3]
result = remove_negatives(data)
print(data)
print(result)`,
    answers: ["append", "clean"], tests: [T([])],
    hints: ["The numbers that are kept go into the new list.", "The function gives the new list back."],
    skills: ["mutable", "pass-list"], tags: ["RETURN_MISSING_NONE"],
    buggy: [["RETURN_MISSING_NONE", `def remove_negatives(nums):
    clean = []
    for n in nums:
        if n >= 0:
            clean.append(n)

data = [4, -2, 7, -5, 3]
result = remove_negatives(data)
print(data)
print(result)`]],
    explainer: "The function builds a new list called clean and returns it, so the list passed in, data, is not changed." },

  // ---------- Level 5: Parsons, or pick the missing line ----------
  { id: "scope-L5a", level: 5, type: "parsons", title: "The best score",
    description: "Arrange the lines: check keeps the global best up to date. The program prints the best of the two scores typed.\nOne line is not needed.",
    solution: `best = 0
def check(score):
    global best
    if score > best:
        best = score
check(int(input("Score: ")))
check(int(input("Score: ")))
print("Best:", best)`,
    distractors: ["best == score"],
    tests: [T(["40", "25"]), T(["10", "60"])],
    hints: ["global best goes at the top of the function.", "best only changes when the new score is bigger."],
    skills: ["global"], tags: ["GLOBAL_KEYWORD_MISSING"],
    buggy: [["GLOBAL_KEYWORD_MISSING", `best = 0
def check(score):
    if score > best:
        best = score
check(int(input("Score: ")))
check(int(input("Score: ")))
print("Best:", best)`]],
    explainer: "global best lets check update the best score outside the function whenever a new score beats it." },
  { id: "scope-L5b", level: 5, type: "partial-parsons", title: "Keep what comes back",
    description: "tax returns a tenth of the pay. Pick the missing line, so the program prints the pay left after tax.",
    starter: `def tax(amount):
    return amount // 10

pay = int(input("Pay: "))
____
print("Take home:", pay - cut)`,
    options: ["cut = tax(pay)", "tax(pay)", "cut = tax", "cut = pay // tax"], optionMisconceptions: { 1: "RESULT_NOT_STORED" },
    tests: [T(["450"]), T(["90"])],
    hints: ["The last line uses a variable called cut.", "The value tax gives back has to be stored."],
    skills: ["pass-value"], tags: ["return"],
    explainer: "The value tax returns only lasts if it is stored, so cut = tax(pay) keeps it for the next line." },
  { id: "scope-L5c", level: 5, type: "partial-parsons", title: "Add a player",
    description: "add_player should add the new name to the squad list itself. Pick the missing line.",
    starter: `def add_player(team, name):
    ____
    return team

squad = ["Ava", "Ben"]
new = add_player(squad, input("Name: "))
print(len(squad), len(new))`,
    options: ["team.append(name)", "team = team + [name]", "team = [name]", "name.append(team)"],
    tests: [T(["Cal"]), T(["Dev"])],
    hints: ["team and squad are the same list.", "team + [name] would make a new list, leaving squad as it was."],
    skills: ["pass-list", "mutable"], tags: ["append"],
    explainer: "append changes the list that was passed in, which squad also names, while team + [name] would make a new list and leave squad alone." },

  // ---------- Level 6: Parsons with traps, or pick the missing line ----------
  { id: "scope-L6a", level: 6, type: "parsons", title: "A discount function",
    description: "Arrange the lines: discount takes a price and a percentage as parameters and returns the new price. The program prints two discounts on the price typed.\nTwo lines are not needed.",
    solution: `def discount(price, percent):
    cut = price * percent // 100
    return price - cut
shoes = int(input("Shoe price: "))
print(discount(shoes, 10))
print(discount(shoes, 25))`,
    distractors: ["global price", "return cut"],
    tests: [T(["80"]), T(["60"])],
    hints: ["The function needs no global variables: everything comes in through its parameters.", "It returns the price after the cut is taken off."],
    skills: ["param-or-global", "pass-value"], tags: ["parameter"],
    explainer: "Passing the price and the percentage in as parameters lets one function work out every discount, with no global variables needed." },
  { id: "scope-L6b", level: 6, type: "partial-parsons", title: "Use the result",
    description: "make_greeting returns a greeting. Pick the line that lets the last line print it.",
    starter: `def make_greeting(name):
    message = "Hi " + name
    return message

____
print(greeting)`,
    options: ['greeting = make_greeting(input("Name: "))', 'make_greeting(input("Name: "))', "greeting = message", 'message = make_greeting(input("Name: "))'],
    optionMisconceptions: { 2: "LOCAL_THOUGHT_CHANGES_OUTSIDE" },
    tests: [T(["Mo"]), T(["Kai"])],
    hints: ["message only exists inside make_greeting.", "The last line needs a variable called greeting: store the text the function builds and returns in it."],
    skills: ["local", "pass-value"], tags: ["LOCAL_THOUGHT_CHANGES_OUTSIDE"],
    explainer: "message is local to make_greeting and is gone once it returns, so the caller must store the returned value in its own variable." },
  { id: "scope-L6c", level: 6, type: "parsons", title: "Double every item",
    description: "Arrange the lines: double_all doubles every number in the list it is given, and the program prints the list afterwards.\nTwo lines are not needed.",
    solution: `def double_all(nums):
    for i in range(len(nums)):
        nums[i] = nums[i] * 2
values = [3, 5, 8]
double_all(values)
print(values)`,
    distractors: ["values = double_all(values)", "nums = nums * 2"],
    tests: [T([])],
    hints: ["Change each item with nums[i] = ...", "double_all returns nothing, so don't store what it gives back."],
    skills: ["pass-list", "mutable"], tags: ["list"],
    explainer: "double_all changes each item of the list it was given, and values names that same list, so the function needs no return." },

  // ---------- Level 7: trace, or write a short line ----------
  { id: "scope-L7a", level: 7, type: "trace", title: "Trace three calls",
    description: "Trace the program. Each function works on its own parameter n.",
    solution: `def add_ten(n):
    return n + 10

def halve(n):
    return n // 2

a = 8
b = add_ten(a)
c = halve(b)
a = halve(c)
print(a, b, c)`, tests: [T([])],
    trace: { columns: ["a", "b", "c"] },
    hints: ["Only the main program's variables are in the table.", "A variable only changes on the line that stores a returned value in it."],
    skills: ["scope-trace", "pass-value"], tags: ["LOCAL_THOUGHT_CHANGES_OUTSIDE"],
    buggy: [["LOCAL_THOUGHT_CHANGES_OUTSIDE", `def add_ten(n):
    global a
    a = n + 10
    return a

def halve(n):
    return n // 2

a = 8
b = add_ten(a)
c = halve(b)
a = halve(c)
print(a, b, c)`]],
    explainer: "Each function works on its own parameter, so a, b and c only change when a returned value is stored in them." },
  { id: "scope-L7b", level: 7, type: "write", title: "Count the visits",
    description: "visit should add 1 to visits each time it is called, but the program stops with an error. Add the one line that makes it work, for example:\nVisits: 3",
    starter: `visits = 0

def visit():
    visits = visits + 1

for k in range(int(input("Visitors: "))):
    visit()
print("Visits:", visits)`,
    solution: `visits = 0

def visit():
    global visits
    visits = visits + 1

for k in range(int(input("Visitors: "))):
    visit()
print("Visits:", visits)`,
    tests: [T(["3"]), T(["0"])],
    hints: ["The error is an UnboundLocalError: visits is treated as a new local variable.", "Tell the function to use the global visits."],
    skills: ["global"], tags: ["GLOBAL_KEYWORD_MISSING"],
    buggy: [["GLOBAL_KEYWORD_MISSING", `visits = 0

def visit():
    visits = visits + 1

for k in range(int(input("Visitors: "))):
    visit()
print("Visits:", visits)`]],
    explainer: "Without global visits, the assignment inside visit makes a local variable that has no value yet, so global visits is needed to change the counter outside." },
  { id: "scope-L7c", level: 7, type: "trace", title: "Trace a list through calls",
    description: "Trace the program. add changes the list it is given; first returns its first item.",
    solution: `def add(lst, x):
    lst.append(x)

def first(lst):
    return lst[0]

bag = [4]
add(bag, 9)
add(bag, 2)
top = first(bag)
print(bag, top)`, tests: [T([])],
    trace: { columns: ["bag", "top"] },
    hints: ["bag gets a column for each position.", "add returns nothing, but bag still changes."],
    skills: ["pass-list", "scope-trace"], tags: ["LIST_COPY_ASSUMED"],
    buggy: [["LIST_COPY_ASSUMED", `def add(lst, x):
    lst.append(x)

def first(lst):
    return lst[0]

bag = [4]
add(bag[:], 9)
add(bag[:], 2)
top = first(bag)
print(bag, top)`]],
    explainer: "add changes the list it is given, so bag gains each new item even though add returns nothing." },

  // ---------- Level 8: trace, or write ----------
  { id: "scope-L8a", level: 8, type: "write", title: "Use parameters",
    description: "Write a function order_total(price, qty) that returns price times qty, using its parameters (not global variables). Ask for a price and a quantity, print the total, then print the total for the same price with one more item, for example:\n12\n16",
    starter: "# Write order_total(price, qty), then use it twice",
    solution: `def order_total(price, qty):
    return price * qty

p = int(input("Price: "))
q = int(input("Quantity: "))
print(order_total(p, q))
print(order_total(p, q + 1))`,
    tests: [T(["4", "3"]), T(["7", "0"])],
    hints: ["The function only needs its two parameters.", "Call it a second time with q + 1."],
    skills: ["param-or-global", "pass-value"], tags: ["parameter"],
    explainer: "Because order_total uses its parameters, the same function gives the right total for any price and quantity it is passed." },
  { id: "scope-L8b", level: 8, type: "trace", title: "Trace a number and a list",
    description: "Trace the program. update is given a number and a list each time.",
    solution: `def update(n, items):
    n = n * 3
    items.append(n)
    return n

x = 4
data = []
y = update(x, data)
z = update(y, data)
print(x, y, z, data)`, tests: [T([])],
    trace: { columns: ["x", "y", "z", "data"] },
    hints: ["n is a new number inside update: x doesn't change.", "data is the same list as items, so each append adds to data."],
    skills: ["mutable", "scope-trace"], tags: ["LOCAL_THOUGHT_CHANGES_OUTSIDE"],
    buggy: [["LOCAL_THOUGHT_CHANGES_OUTSIDE", `def update(n, items):
    n = n * 3
    items.append(n)
    return n

x = 4
data = []
x = update(x, data)
y = x
z = update(y, data)
print(x, y, z, data)`]],
    explainer: "n is a new number inside update each time, so x never changes, but each append changes the list data itself." },

  // ---------- Level 9: write a full program, or a longer trace ----------
  { id: "scope-L9a", level: 9, type: "write", title: "Interest each year",
    description: "Write a function add_interest(balance, rate) that returns the new balance: balance + balance * rate // 100. Ask for a balance and a rate, then for 3 years call the function, store the new balance each time, and print it, for example:\nYear 1 balance: 105\nYear 2 balance: 110\nYear 3 balance: 115",
    starter: "# Write add_interest(balance, rate), then use it for 3 years",
    solution: `def add_interest(balance, rate):
    return balance + balance * rate // 100

money = int(input("Balance: "))
rate = int(input("Rate: "))
for year in range(1, 4):
    money = add_interest(money, rate)
    print("Year", year, "balance:", money)`,
    tests: [T(["100", "5"]), T(["2000", "3"])],
    hints: ["Store what the function returns back in the balance variable.", "The next year starts from the balance the last year returned."],
    skills: ["pass-value", "param-or-global"], tags: ["RESULT_NOT_STORED"],
    buggy: [["RESULT_NOT_STORED", `def add_interest(balance, rate):
    return balance + balance * rate // 100

money = int(input("Balance: "))
rate = int(input("Rate: "))
for year in range(1, 4):
    add_interest(money, rate)
    print("Year", year, "balance:", money)`]],
    explainer: "add_interest returns the new balance, and storing it back in money each year is what lets the next call start from it." },
  { id: "scope-L9b", level: 9, type: "trace", title: "Trace a reset",
    description: "Trace the program. Look carefully at reset.",
    solution: `total = 0

def add_score(points):
    global total
    total = total + points
    return total

def reset():
    total = 0

add_score(5)
reset()
t = add_score(7)
print(total, t)`, tests: [T([])],
    trace: { columns: ["total", "t"] },
    hints: ["add_score says global total, so it changes the total outside.", "reset has no global line: its total is a new local variable."],
    skills: ["scope-trace", "local", "global"], tags: ["LOCAL_THOUGHT_CHANGES_OUTSIDE"],
    buggy: [["LOCAL_THOUGHT_CHANGES_OUTSIDE", `total = 0

def add_score(points):
    global total
    total = total + points
    return total

def reset():
    global total
    total = 0

add_score(5)
reset()
t = add_score(7)
print(total, t)`]],
    explainer: "reset has no global line, so its total = 0 makes a local variable and the global total keeps adding up." },

  // ---------- Level 10: write an extended program, or a longer trace ----------
  { id: "scope-L10a", level: 10, type: "write", title: "Basket functions",
    description: "basket is made for you. Write add_item(items, name), which appends name to the list it is given, and count_item(items, name), which returns how many times name is in it. Ask for 3 item names and add each to basket, then ask for a name to count and print it with its count, for example:\napple 2",
    starter: `basket = ["bread"]
# Write add_item(items, name) and count_item(items, name), then use them`,
    solution: `basket = ["bread"]

def add_item(items, name):
    items.append(name)

def count_item(items, name):
    count = 0
    for item in items:
        if item == name:
            count = count + 1
    return count

for k in range(3):
    add_item(basket, input("Item: "))
look = input("Count: ")
print(look, count_item(basket, look))`,
    tests: [T(["apple", "pear", "apple", "apple"]), T(["kiwi", "plum", "fig", "milk"])],
    hints: ["add_item changes the list it is given, so it needs no return.", "count_item makes a new number, so it must return it."],
    skills: ["pass-list", "param-or-global", "mutable"], tags: ["LIST_COPY_ASSUMED", "RETURN_MISSING_NONE"],
    buggy: [["LIST_COPY_ASSUMED", `basket = ["bread"]

def add_item(items, name):
    items.append(name)

def count_item(items, name):
    count = 0
    for item in items:
        if item == name:
            count = count + 1
    return count

for k in range(3):
    add_item(basket[:], input("Item: "))
look = input("Count: ")
print(look, count_item(basket, look))`],
      ["RETURN_MISSING_NONE", `basket = ["bread"]

def add_item(items, name):
    items.append(name)

def count_item(items, name):
    count = 0
    for item in items:
        if item == name:
            count = count + 1

for k in range(3):
    add_item(basket, input("Item: "))
look = input("Count: ")
print(look, count_item(basket, look))`]],
    explainer: "add_item needs no return because it changes the list it is passed, while count_item works out a new number and must return it." },
  { id: "scope-L10b", level: 10, type: "trace", title: "Trace the squares",
    description: "Trace the program. square counts its calls in the global calls.",
    solution: `calls = 0

def square(n):
    global calls
    calls = calls + 1
    return n * n

def sum_squares(a, b):
    return square(a) + square(b)

total = 0
for n in [3, 4, 5]:
    total = total + sum_squares(n, 1)
print(calls, total)`, tests: [T([])],
    trace: { columns: ["calls", "n", "total"] },
    hints: ["Every call to sum_squares calls square twice.", "The n in the main program is not the n inside square."],
    skills: ["scope-trace", "global"], tags: ["trace"],
    explainer: "Every call to sum_squares calls square twice, and square changes the global calls each time, while n and total only change in the main program." },
];

// Placement (levels 2, 5, 7 and 9): no buggy variants.
const PLACEMENT = [
  { id: "scope-P2a", level: 2, type: "predict", title: "Return from inside",
    description: "show has its own x. What does the program print?",
    solution: `x = 1

def show():
    x = 99
    return x

y = show()
print(x, y)`, tests: [T([])],
    wrongOutputs: ["99 99", "1 1"],
    hints: ["x = 99 inside show is a local variable.", "Only the returned value reaches y."],
    skills: ["local", "pass-value"], tags: ["local"],
    explainer: "x = 99 inside show is a local variable, so the x outside is unchanged and only the returned value reaches y." },
  { id: "scope-P2b", level: 2, type: "predict", title: "Grow a list",
    description: "grow is given the list nums twice. What does the program print?",
    solution: `def grow(items):
    items.append(len(items))

nums = [5]
grow(nums)
grow(nums)
print(nums)`, tests: [T([])],
    wrongOutputs: ["[5]", "[5, 1]", "[5, 1, 1]"],
    hints: ["items and nums are the same list.", "len(items) is worked out again on each call."],
    skills: ["pass-list", "mutable"], tags: ["list"],
    explainer: "grow changes the list it is given, which is the same list as nums, so each call adds to it." },
  { id: "scope-P5a", level: 5, type: "parsons", title: "Triple it",
    description: "Arrange the lines: triple returns three times the number it is given, and the program prints the number typed and its triple.\nOne line is not needed.",
    solution: `def triple(n):
    return n * 3
a = int(input("Number: "))
b = triple(a)
print(a, b)`,
    distractors: ["n = n * 3"],
    tests: [T(["4"]), T(["0"])],
    hints: ["The function gives its answer back with return.", "Store the answer in b."],
    skills: ["pass-value"], tags: ["parsons"],
    explainer: "triple returns a new number, which is stored in b, and a keeps its own value." },
  { id: "scope-P5b", level: 5, type: "partial-parsons", title: "Level up",
    description: "level_up should add 1 to the level outside the function. Pick the missing line.",
    starter: `level = 1

def level_up():
    ____
    level = level + 1

level_up()
level_up()
print("Level", level)`,
    options: ["global level", "level = 1", "return level", "level = 0"],
    tests: [T([])],
    hints: ["The function changes a variable from outside it.", "Without the right line, level inside the function is a new local variable."],
    skills: ["global"], tags: ["global"],
    explainer: "global level lets level_up change the variable outside the function, so both calls add to the same level." },
  { id: "scope-P7a", level: 7, type: "trace", title: "Trace the price",
    description: "Trace the program. add_tax works on its own parameter p.",
    solution: `def add_tax(p):
    p = p + p // 5
    return p

price = 50
final = add_tax(price)
price = price + 10
final2 = add_tax(price)
print(final, final2)`, tests: [T([])],
    trace: { columns: ["price", "final", "final2"] },
    hints: ["p is the function's own variable.", "price only changes on the line in the main program that changes it."],
    skills: ["scope-trace", "pass-value"], tags: ["trace"],
    explainer: "add_tax changes only its own parameter p, so price changes only when the main program changes it." },
  { id: "scope-P7b", level: 7, type: "write", title: "Add a name",
    description: "Replace pass with one line that adds new to the list names. The program prints the list, for example:\n['Ava', 'Ben']",
    starter: `def add_name(names, new):
    pass

people = ["Ava"]
add_name(people, input("Name: "))
print(people)`,
    solution: `def add_name(names, new):
    names.append(new)

people = ["Ava"]
add_name(people, input("Name: "))
print(people)`,
    tests: [T(["Ben"]), T(["Kofi"])],
    hints: ["names and people are the same list.", "Use append."],
    skills: ["pass-list"], tags: ["append"],
    explainer: "append changes the list that names refers to, and people is that same list, so the new name is seen outside the function." },
  { id: "scope-P9a", level: 9, type: "write", title: "Make labels",
    description: "Write a function make_label(name, age) that returns a label such as Mia (12). Ask for two names and ages (a name, then an age, for each) and print each one's label, for example:\nMia (12)\nRavi (14)",
    solution: `def make_label(name, age):
    return name + " (" + str(age) + ")"

for k in range(2):
    name = input("Name: ")
    age = int(input("Age: "))
    print(make_label(name, age))`,
    tests: [T(["Mia", "12", "Ravi", "14"]), T(["Zoe", "9", "Tom", "16"])],
    hints: ["Build the label from the parameters and return it.", "str(age) turns the number into text so + can join it."],
    skills: ["pass-value", "param-or-global"], tags: ["return"],
    explainer: "make_label builds a new string from its parameters and returns it, so the same function makes every label." },
  { id: "scope-P9b", level: 9, type: "trace", title: "Trace bump",
    description: "Trace the program. bump is given a number and a list.",
    solution: `def bump(n, items):
    n = n + 1
    items.append(n)

a = 3
b = []
bump(a, b)
bump(a, b)
print(a, b)`, tests: [T([])],
    trace: { columns: ["a", "b"] },
    hints: ["n is the function's own variable.", "items is the same list as b."],
    skills: ["scope-trace", "mutable"], tags: ["trace"],
    explainer: "bump changes its own n but not a, while every append changes the list b itself." },
];

const COVERAGE = {
  "Local variables: a value set inside a function doesn't change outside it": ["scope-L1a", "scope-L1c", "scope-L6b", "scope-L9b", "scope-P2a"],
  "Global variables, read and changed with global": ["scope-L1b", "scope-L3a", "scope-L4b", "scope-L5a", "scope-L7b", "scope-L9b", "scope-P5b"],
  "Passing numbers and strings in, and returning new values": ["scope-L1c", "scope-L2b", "scope-L3b", "scope-L5b", "scope-L9a", "scope-P5a", "scope-P9a"],
  "Passing lists in, and seeing the change outside the function": ["scope-L2a", "scope-L3c", "scope-L5c", "scope-L6c", "scope-L7c", "scope-L10a", "scope-P2b", "scope-P7b"],
  "Mutable versus immutable objects": ["scope-L2b", "scope-L2c", "scope-L4c", "scope-L8b", "scope-P9b"],
  "Choosing between a parameter and a global": ["scope-L4a", "scope-L6a", "scope-L8a", "scope-L10a"],
  "Tracing values through several function calls": ["scope-L7a", "scope-L7c", "scope-L8b", "scope-L9b", "scope-L10b", "scope-P7a"],
};

// Tasks that cast input() with int() say so (the casting sentence, tools/unit-tasks.js nameCasting).
nameCasting(PRACTICE.concat(PLACEMENT));

if (require.main === module) addUnit("scope-parameters", PRACTICE, PLACEMENT);
module.exports = { PRACTICE, PLACEMENT, COVERAGE };
