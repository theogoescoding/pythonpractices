// One-off (2026-11): the "Object-oriented programming: methods" unit (id oop-methods, A-level programming
// techniques), built with tools/unit-tasks.js. The A-level ladder, placement at levels 2, 5, 7 and 9 (no buggy
// variants), and an explainer on every task (see tools/add-recursion-unit.js). A method named without its brackets is
// never printed (that would show a memory address, different on every run): it is used where its effect is the same
// every time (it does nothing, counts as True, or gives a TypeError). COVERAGE lists each angle and its tasks.
"use strict";
const { T, addUnit, nameCasting } = require("./unit-tasks.js");

const PRACTICE = [
  // ---------- Level 1: predict ----------
  { id: "meth-L1a", level: 1, type: "predict", title: "Click, click, click",
    description: "click is a method that changes the object's count. What does the program print?",
    solution: `class Clicker:
    def __init__(self):
        self.count = 0

    def click(self):
        self.count = self.count + 1

c = Clicker()
c.click()
c.click()
c.click()
print(c.count)`, tests: [T([])],
    wrongOutputs: ["1", "4"],
    hints: ["Each c.click() runs the method once.", "The method adds 1 to the object's own count."],
    skills: ["method", "change-attribute"], tags: ["METHOD_NO_BRACKETS"],
    buggy: [["METHOD_NO_BRACKETS", `class Clicker:
    def __init__(self):
        self.count = 0

    def click(self):
        self.count = self.count + 1

c = Clicker()
c.click
c.click
c.click
print(c.count)`]],
    explainer: "Each call c.click() runs the method on the same object, which adds 1 to that object's count attribute." },
  { id: "meth-L1b", level: 1, type: "predict", title: "Area",
    description: "area is a method that returns a value. What does the program print?",
    solution: `class Rectangle:
    def __init__(self, width, height):
        self.width = width
        self.height = height

    def area(self):
        return self.width * self.height

r = Rectangle(4, 6)
print(r.area())`, tests: [T([])],
    wrongOutputs: ["10", "4 6", "None"],
    hints: ["self.width and self.height are the object's own values.", "The method returns their product."],
    skills: ["return-method", "method"], tags: ["return"],
    explainer: "area uses the object's own width and height through self and returns the result, which print then shows." },
  { id: "meth-L1c", level: 1, type: "predict", title: "Two banks",
    description: "spend is called on two different objects. What does the program print?",
    solution: `class Bank:
    def __init__(self, money):
        self.money = money

    def spend(self, amount):
        self.money = self.money - amount

a = Bank(50)
b = Bank(30)
a.spend(20)
b.spend(5)
a.spend(10)
print(a.money, b.money)`, tests: [T([])],
    wrongOutputs: ["15 15", "30 25", "20 30"],
    hints: ["a.spend(...) changes only a.", "Work out each object's money separately."],
    skills: ["method-call", "change-attribute"], tags: ["objects"],
    explainer: "Each method call changes only the object it was called on, so a and b keep separate amounts of money." },

  // ---------- Level 2: predict, spot the trap ----------
  { id: "meth-L2a", level: 2, type: "predict", title: "Unlock the door",
    description: "Look closely at the line just before the print. What does the program print?",
    solution: `class Door:
    def __init__(self):
        self.locked = True

    def unlock(self):
        self.locked = False

d = Door()
d.unlock
print(d.locked)`, tests: [T([])],
    wrongOutputs: ["None", "d.unlock"],
    hints: ["d.unlock has no brackets.", "A method only runs when it is called with ()."],
    skills: ["method-brackets"], tags: ["METHOD_NO_BRACKETS"],
    buggy: [["METHOD_NO_BRACKETS", `class Door:
    def __init__(self):
        self.locked = True

    def unlock(self):
        self.locked = False

d = Door()
d.unlock()
print(d.locked)`]],
    explainer: "d.unlock without brackets only names the method and doesn't run it, so locked is never changed." },
  { id: "meth-L2b", level: 2, type: "predict", title: "Minutes",
    description: "minutes returns a value. What does the program print?",
    solution: `class Timer:
    def __init__(self, secs):
        self.secs = secs

    def minutes(self):
        return self.secs // 60

t = Timer(150)
t.minutes()
print(t.secs)`, tests: [T([])],
    wrongOutputs: ["2.5"],
    hints: ["minutes returns a number, but nothing stores it.", "The method doesn't change self.secs."],
    skills: ["return-method"], tags: ["RESULT_NOT_STORED"],
    buggy: [["RESULT_NOT_STORED", `class Timer:
    def __init__(self, secs):
        self.secs = secs

    def minutes(self):
        return self.secs // 60

t = Timer(150)
t.secs = t.minutes()
print(t.secs)`]],
    explainer: "minutes returns a new number but doesn't change the object, and the result isn't stored, so secs keeps its value." },
  { id: "meth-L2c", level: 2, type: "predict", title: "Fill the tank",
    description: "fill changes the tank and returns the new amount. What does the program print?",
    solution: `class Tank:
    def __init__(self, litres):
        self.litres = litres

    def fill(self, extra):
        self.litres = self.litres + extra
        return self.litres

t = Tank(10)
x = t.fill(5)
y = t.fill(x)
print(y)`, tests: [T([])],
    wrongOutputs: ["20", "15", "25"],
    hints: ["The first call adds 5 to the litres and returns the new amount.", "The second call adds x to the litres the tank has now."],
    skills: ["return-method", "change-attribute"], tags: ["trap"],
    explainer: "fill changes the tank's litres and returns the new amount, so the second call adds the value returned by the first." },

  // ---------- Level 3: fill in one blank ----------
  { id: "meth-L3a", level: 3, type: "fill", title: "Add points",
    description: "Fill in the blank so add_points changes this player's score.",
    starter: `class Player:
    def __init__(self, name):
        self.name = name
        self.score = 0

    def add_points(self, points):
        ____ = self.score + points

p = Player("Ava")
p.add_points(int(input("Points: ")))
p.add_points(int(input("Points: ")))
print(p.name, p.score)`,
    answers: ["self.score"], tests: [T(["5", "7"]), T(["0", "3"])],
    hints: ["The score belongs to the object the method was called on.", "Inside a method, that object is self."],
    skills: ["change-attribute", "method"], tags: ["ATTRIBUTE_NOT_STORED"],
    buggy: [["ATTRIBUTE_NOT_STORED", `class Player:
    def __init__(self, name):
        self.name = name
        self.score = 0

    def add_points(self, points):
        score = self.score + points

p = Player("Ava")
p.add_points(int(input("Points: ")))
p.add_points(int(input("Points: ")))
print(p.name, p.score)`]],
    explainer: "Inside a method, self.score is the score of the object the method was called on, so storing the new total there changes that player." },
  { id: "meth-L3b", level: 3, type: "fill", title: "Diameter",
    description: "Fill in the blank so diameter gives its answer back to where it was called.",
    starter: `class Circle:
    def __init__(self, radius):
        self.radius = radius

    def diameter(self):
        ____ self.radius * 2

c = Circle(int(input("Radius: ")))
print("Diameter:", c.diameter())`,
    answers: ["return"], tests: [T(["4"]), T(["11"])],
    hints: ["A method that gives back a value uses one keyword.", "Without it, the call gives back None."],
    skills: ["return-method"], tags: ["RETURN_MISSING_NONE"],
    buggy: [["RETURN_MISSING_NONE", `class Circle:
    def __init__(self, radius):
        self.radius = radius

    def diameter(self):
        self.radius * 2

c = Circle(int(input("Radius: ")))
print("Diameter:", c.diameter())`]],
    explainer: "return sends the method's answer back to where it was called, so print can show it." },
  { id: "meth-L3c", level: 3, type: "fill", title: "Call it",
    description: "Fill in the blank so the method runs and top holds the number it gives back.",
    starter: `class Dice:
    def __init__(self, sides):
        self.sides = sides

    def biggest(self):
        return self.sides

d = Dice(int(input("Sides: ")))
top = d.biggest____
print(top + 1)`,
    answers: ["()"], tests: [T(["6"]), T(["20"])],
    hints: ["Without brackets, d.biggest is the method itself, not its answer.", "Add the brackets that call it."],
    skills: ["method-brackets", "return-method"], tags: ["METHOD_NO_BRACKETS"],
    buggy: [["METHOD_NO_BRACKETS", `class Dice:
    def __init__(self, sides):
        self.sides = sides

    def biggest(self):
        return self.sides

d = Dice(int(input("Sides: ")))
top = d.biggest
print(top + 1)`]],
    explainer: "The brackets after d.biggest are what make the method run and give back its value; without them top would hold the method itself." },

  // ---------- Level 4: fill in two blanks ----------
  { id: "meth-L4a", level: 4, type: "fill", title: "A bag",
    description: "Fill in both blanks: add puts a thing in the bag's list, and size returns how many things it holds.",
    starter: `class Bag:
    def __init__(self):
        self.items = []

    def add(self, thing):
        self.items.____(thing)

    def size(self):
        return ____(self.items)

b = Bag()
b.add(input("Item: "))
b.add(input("Item: "))
print(b.size(), b.items)`,
    answers: ["append", "len"], tests: [T(["map", "torch"]), T(["hat", "hat"])],
    hints: ["self.items is a list: one list method adds to the end.", "One built-in function gives the length of a list."],
    skills: ["change-attribute", "return-method"], tags: ["list"],
    explainer: "add changes the bag's own items list, and size returns how many items that list now holds." },
  { id: "meth-L4b", level: 4, type: "fill", title: "Home and away",
    description: "Fill in both blanks: each H typed is a home goal and each A an away goal. The program prints the score.",
    starter: `class Counter:
    def __init__(self):
        self.n = 0

    def up(self):
        self.n = self.n + 1

home = Counter()
away = Counter()
for goal in input("Goals (H or A): "):
    if goal == "H":
        home.____()
    else:
        ____.up()
print(home.n, "-", away.n)`,
    answers: ["up", "away"], tests: [T(["HAH"]), T(["AAA"])],
    hints: ["Call the same method on the right object.", "The else is for away goals."],
    skills: ["method-call", "method"], tags: ["METHOD_NO_BRACKETS"],
    buggy: [["METHOD_NO_BRACKETS", `class Counter:
    def __init__(self):
        self.n = 0

    def up(self):
        self.n = self.n + 1

home = Counter()
away = Counter()
for goal in input("Goals (H or A): "):
    if goal == "H":
        home.up
    else:
        away.up
print(home.n, "-", away.n)`]],
    explainer: "home.up() and away.up() call the same method on two different objects, so each object counts only its own goals." },
  { id: "meth-L4c", level: 4, type: "fill", title: "Does it open?",
    description: "Fill in both blanks: opens returns True or False, and the program prints Open or Still locked.",
    starter: `class Lock:
    def __init__(self, code):
        self.code = code

    def opens(self, guess):
        return guess == self.code

lock = Lock(input("Set code: "))
if lock.____(input("Try: ")):
    print("Open")
____:
    print("Still locked")`,
    answers: ["opens", "else"], tests: [T(["1234", "1234"]), T(["1234", "4321"])],
    hints: ["Call the method that compares the guess with the code.", "The second message is for every other case."],
    skills: ["return-method", "method-brackets"], tags: ["METHOD_NO_BRACKETS"],
    buggy: [["METHOD_NO_BRACKETS", `class Lock:
    def __init__(self, code):
        self.code = code

    def opens(self, guess):
        return guess == self.code

lock = Lock(input("Set code: "))
if lock.opens:
    print("Open")
else:
    print("Still locked")`]],
    explainer: "opens returns True or False by comparing the guess with the object's own code, and the if uses that value to choose a message." },

  // ---------- Level 5: Parsons, or pick the missing line ----------
  { id: "meth-L5a", level: 5, type: "parsons", title: "Warmer",
    description: "Arrange the lines: warmer raises the thermostat's temperature by the step it is given. The program warms it twice and prints the temperature.\nOne line is not needed.",
    solution: `class Thermostat:
    def __init__(self, temp):
        self.temp = temp
    def warmer(self, step):
        self.temp = self.temp + step
t = Thermostat(int(input("Start: ")))
t.warmer(2)
t.warmer(3)
print(t.temp)`,
    distractors: ["t.warmer"],
    tests: [T(["18"]), T(["0"])],
    hints: ["A method is defined inside the class, after __init__.", "A call needs brackets and a step."],
    skills: ["change-attribute", "method-brackets"], tags: ["parsons"],
    explainer: "warmer changes the thermostat's own temp each time it is called with brackets and a step." },
  { id: "meth-L5b", level: 5, type: "partial-parsons", title: "The order total",
    description: "Pick the line for total, so the program prints the cost of the order.",
    starter: `class Order:
    def __init__(self, price, qty):
        self.price = price
        self.qty = qty

    def total(self):
        ____

o = Order(int(input("Price: ")), int(input("Quantity: ")))
print("Total:", o.total())`,
    options: ["return self.price * self.qty", "return price * qty", "print(self.price * self.qty)", "self.total = self.price * self.qty"],
    optionMisconceptions: { 1: "SELF_MISSING", 2: "PRINT_INSTEAD_OF_RETURN" },
    tests: [T(["3", "4"]), T(["10", "0"])],
    hints: ["Inside a method, the object's values are self.price and self.qty.", "The answer has to be given back, not printed."],
    skills: ["return-method"], tags: ["return"],
    explainer: "total works out the answer from the object's own attributes, self.price and self.qty, and returns it to the caller." },
  { id: "meth-L5c", level: 5, type: "partial-parsons", title: "Switch one on",
    description: "Pick the missing line, so the light whose number is typed is switched on.",
    starter: `class Light:
    def __init__(self, name):
        self.name = name
        self.on = False

    def turn_on(self):
        self.on = True

lights = [Light("hall"), Light("porch"), Light("shed")]
pick = int(input("Light number: "))
____
for light in lights:
    print(light.name, light.on)`,
    options: ["lights[pick].turn_on()", "lights[pick].turn_on", "Light.turn_on()", "lights.turn_on()"], optionMisconceptions: { 1: "METHOD_NO_BRACKETS" },
    tests: [T(["1"]), T(["0"])],
    hints: ["lights[pick] is one Light object.", "Call its method with brackets."],
    skills: ["method-call", "method-brackets"], tags: ["METHOD_NO_BRACKETS"],
    explainer: "lights[pick] is one Light object, and calling turn_on() on it changes only that light's on attribute." },

  // ---------- Level 6: Parsons with traps, or pick the missing line ----------
  { id: "meth-L6a", level: 6, type: "parsons", title: "Pay from a wallet",
    description: "Arrange the lines: pay takes the cost from the wallet if there is enough cash, and returns True or False.\nTwo lines are not needed.",
    solution: `class Wallet:
    def __init__(self, cash):
        self.cash = cash
    def pay(self, cost):
        if cost <= self.cash:
            self.cash = self.cash - cost
            return True
        return False
w = Wallet(int(input("Cash: ")))
if w.pay(int(input("Cost: "))):
    print("Paid, left:", w.cash)
else:
    print("Not enough")`,
    distractors: ["cash = cash - cost", "if w.pay:"],
    tests: [T(["20", "15"]), T(["5", "9"]), T(["8", "8"])],
    hints: ["Inside the method, the cash is self.cash.", "The if must call pay with the cost."],
    skills: ["change-attribute", "return-method"], tags: ["wallet"],
    explainer: "pay checks and changes the wallet's own cash, and returns True or False so the program knows which message to print." },
  { id: "meth-L6b", level: 6, type: "partial-parsons", title: "Red and blue",
    description: "Pick the missing line, so the program prints 3 5: red has 3 points and blue has 5.",
    starter: `class Score:
    def __init__(self):
        self.points = 0

    def add(self, n):
        self.points = self.points + n

red = Score()
blue = Score()
red.add(3)
____
print(red.points, blue.points)`,
    options: ["blue.add(5)", "red.add(5)", "Score.add(5)", "blue.points = red.points + 5"],
    tests: [T([])],
    hints: ["The method changes the object it is called on.", "Which object should get the 5 points?"],
    skills: ["method-call", "method-trace"], tags: ["objects"],
    explainer: "The method changes only the object it is called on, so blue.add(5) changes blue's points and leaves red's alone." },

  // ---------- Level 7: trace, or write a short line ----------
  { id: "meth-L7a", level: 7, type: "trace", title: "Trace two accounts",
    description: "Trace the program. Each method call changes one account's balance.",
    solution: `class Account:
    def __init__(self, balance):
        self.balance = balance

    def deposit(self, amount):
        self.balance = self.balance + amount

    def withdraw(self, amount):
        self.balance = self.balance - amount

a = Account(100)
b = Account(40)
a.withdraw(30)
b.deposit(30)
a.deposit(b.balance)
print(a.balance, b.balance)`, tests: [T([])],
    trace: { columns: ["a.balance", "b.balance"] },
    hints: ["Each call changes the balance of the object before the dot.", "a.deposit(b.balance) uses b's balance at that moment."],
    skills: ["method-trace", "method-call"], tags: ["trace"],
    explainer: "Each method call changes the balance of the one account it is called on, using that account's current balance." },
  { id: "meth-L7b", level: 7, type: "write", title: "Write feed",
    description: "Write a method feed(self, food) in the Pet class that takes food away from the pet's hunger. The program should print, for example:\nRex 3",
    starter: `class Pet:
    def __init__(self, name):
        self.name = name
        self.hunger = 5

    # Write a method feed(self, food) that takes food away from hunger

p = Pet(input("Name: "))
p.feed(int(input("Food: ")))
print(p.name, p.hunger)`,
    solution: `class Pet:
    def __init__(self, name):
        self.name = name
        self.hunger = 5

    def feed(self, food):
        self.hunger = self.hunger - food

p = Pet(input("Name: "))
p.feed(int(input("Food: ")))
print(p.name, p.hunger)`,
    tests: [T(["Rex", "2"]), T(["Bo", "5"])],
    hints: ["A method starts with def and takes self first.", "Change self.hunger, not a plain variable."],
    skills: ["method", "change-attribute"], tags: ["SELF_MISSING", "ATTRIBUTE_NOT_STORED"],
    buggy: [["SELF_MISSING", `class Pet:
    def __init__(self, name):
        self.name = name
        self.hunger = 5

    def feed(food):
        self.hunger = self.hunger - food

p = Pet(input("Name: "))
p.feed(int(input("Food: ")))
print(p.name, p.hunger)`],
      ["ATTRIBUTE_NOT_STORED", `class Pet:
    def __init__(self, name):
        self.name = name
        self.hunger = 5

    def feed(self, food):
        hunger = self.hunger - food

p = Pet(input("Name: "))
p.feed(int(input("Food: ")))
print(p.name, p.hunger)`]],
    explainer: "feed uses self to reach the pet it was called on, so self.hunger = self.hunger - food changes that pet's hunger." },
  { id: "meth-L7c", level: 7, type: "trace", title: "Trace the sales",
    description: "Trace the program. sell only sells if there is enough stock, and returns how many it sold.",
    solution: `class Shop:
    def __init__(self, stock):
        self.stock = stock

    def sell(self, n):
        if n > self.stock:
            return 0
        self.stock = self.stock - n
        return n

s = Shop(12)
sold = s.sell(5)
more = s.sell(9)
last = s.sell(7)
print(sold, more, last, s.stock)`, tests: [T([])],
    trace: { columns: ["s.stock", "sold", "more", "last"] },
    hints: ["After the first sale there are 7 left.", "A sale bigger than the stock returns 0 and changes nothing."],
    skills: ["return-method", "method-trace"], tags: ["trace"],
    explainer: "sell only changes the stock when there is enough, and returns how many were really sold, which the main program stores." },

  // ---------- Level 8: trace, or write ----------
  { id: "meth-L8a", level: 8, type: "write", title: "Odds and evens",
    description: "Write a class Counter with a count that starts at 0, a method add(self, n) that adds n to count, and a method get(self) that returns count. Make two counters, read 4 numbers, add the even ones to the first counter and the odd ones to the second, then print both totals, for example:\nEven: 16\nOdd: 5",
    starter: "# Write the Counter class, then use two counters",
    solution: `class Counter:
    def __init__(self):
        self.count = 0

    def add(self, n):
        self.count = self.count + n

    def get(self):
        return self.count

evens = Counter()
odds = Counter()
for k in range(4):
    n = int(input("Number: "))
    if n % 2 == 0:
        evens.add(n)
    else:
        odds.add(n)
print("Even:", evens.get())
print("Odd:", odds.get())`,
    tests: [T(["4", "5", "8", "4"]), T(["1", "3", "5", "7"])],
    hints: ["n % 2 == 0 is True for an even number.", "Call add on the right counter, then get to read each total."],
    skills: ["method", "return-method", "method-call"], tags: ["RETURN_MISSING_NONE", "ATTRIBUTE_NOT_STORED"],
    buggy: [["RETURN_MISSING_NONE", `class Counter:
    def __init__(self):
        self.count = 0

    def add(self, n):
        self.count = self.count + n

    def get(self):
        self.count

evens = Counter()
odds = Counter()
for k in range(4):
    n = int(input("Number: "))
    if n % 2 == 0:
        evens.add(n)
    else:
        odds.add(n)
print("Even:", evens.get())
print("Odd:", odds.get())`],
      ["ATTRIBUTE_NOT_STORED", `class Counter:
    def __init__(self):
        self.count = 0

    def add(self, n):
        count = self.count + n

    def get(self):
        return self.count

evens = Counter()
odds = Counter()
for k in range(4):
    n = int(input("Number: "))
    if n % 2 == 0:
        evens.add(n)
    else:
        odds.add(n)
print("Even:", evens.get())
print("Odd:", odds.get())`]],
    explainer: "add changes each counter's own count and get returns it, so the two Counter objects keep separate totals." },
  { id: "meth-L8b", level: 8, type: "trace", title: "Trace a robot",
    description: "Trace the program. move changes the robot's x and y.",
    solution: `class Robot:
    def __init__(self):
        self.x = 0
        self.y = 0

    def move(self, dx, dy):
        self.x = self.x + dx
        self.y = self.y + dy

    def distance(self):
        return self.x + self.y

r = Robot()
r.move(3, 0)
r.move(0, 4)
r.move(-1, 2)
d = r.distance()
print(d)`, tests: [T([])],
    trace: { columns: ["r.x", "r.y", "d"] },
    hints: ["Each move adds to the robot's own x and y.", "Fill in only the cells that change on each line."],
    skills: ["method-trace", "change-attribute"], tags: ["trace"],
    explainer: "Each move call adds to the robot's own x and y, so the position builds up across the calls before distance reads it." },

  // ---------- Level 9: write a full program, or a longer trace ----------
  { id: "meth-L9a", level: 9, type: "write", title: "Stock control",
    description: "Write a class Stock with name and qty attributes, and two methods: sell(self, n) takes n off qty only if there are enough, and returns True if it did or False if not; restock(self, n) adds n to qty. Make a Stock called Pens with 10. Read 3 orders and print Sold or Not enough for each. Then restock with 20 and print the stock, for example:\nPens: 20",
    starter: "# Write the Stock class, then process the orders",
    solution: `class Stock:
    def __init__(self, name, qty):
        self.name = name
        self.qty = qty

    def sell(self, n):
        if n <= self.qty:
            self.qty = self.qty - n
            return True
        return False

    def restock(self, n):
        self.qty = self.qty + n

pens = Stock("Pens", 10)
for k in range(3):
    order = int(input("Order: "))
    if pens.sell(order):
        print("Sold")
    else:
        print("Not enough")
pens.restock(20)
print(pens.name + ":", pens.qty)`,
    tests: [T(["4", "8", "6"]), T(["11", "10", "1"])],
    hints: ["sell checks self.qty first, and only then changes it.", "The if in the main program uses the True or False that sell returns."],
    skills: ["return-method", "change-attribute", "method-brackets"], tags: ["METHOD_NO_BRACKETS", "BOUNDARY_LT_VS_LTE"],
    buggy: [["METHOD_NO_BRACKETS", `class Stock:
    def __init__(self, name, qty):
        self.name = name
        self.qty = qty

    def sell(self, n):
        if n <= self.qty:
            self.qty = self.qty - n
            return True
        return False

    def restock(self, n):
        self.qty = self.qty + n

pens = Stock("Pens", 10)
for k in range(3):
    order = int(input("Order: "))
    if pens.sell:
        print("Sold")
    else:
        print("Not enough")
pens.restock(20)
print(pens.name + ":", pens.qty)`],
      ["BOUNDARY_LT_VS_LTE", `class Stock:
    def __init__(self, name, qty):
        self.name = name
        self.qty = qty

    def sell(self, n):
        if n < self.qty:
            self.qty = self.qty - n
            return True
        return False

    def restock(self, n):
        self.qty = self.qty + n

pens = Stock("Pens", 10)
for k in range(3):
    order = int(input("Order: "))
    if pens.sell(order):
        print("Sold")
    else:
        print("Not enough")
pens.restock(20)
print(pens.name + ":", pens.qty)`]],
    explainer: "sell both checks and changes the object's own qty and returns True or False, so the main program decides what to print from the value it gets back." },
  { id: "meth-L9b", level: 9, type: "trace", title: "Trace two jars",
    description: "Trace the program. give moves sweets from one jar to another.",
    solution: `class Jar:
    def __init__(self, sweets):
        self.sweets = sweets

    def give(self, other, n):
        self.sweets = self.sweets - n
        other.sweets = other.sweets + n

a = Jar(20)
b = Jar(5)
a.give(b, 6)
b.give(a, 2)
a.give(b, a.sweets // 2)
print(a.sweets, b.sweets)`, tests: [T([])],
    trace: { columns: ["a.sweets", "b.sweets"] },
    hints: ["One call to give changes two jars.", "a.sweets // 2 is worked out before the call runs."],
    skills: ["method-trace", "method-call"], tags: ["trace"],
    explainer: "give changes the sweets of the jar it is called on and of the other jar passed in, so one call changes two objects." },

  // ---------- Level 10: write an extended program, or a longer trace ----------
  { id: "meth-L10a", level: 10, type: "write", title: "League table",
    description: "Write a class Team with a name, and played and points attributes that start at 0. Add a method result(self, scored, conceded) that adds 1 to played, and 3 points for a win or 1 for a draw, and a method average(self) that returns points // played. Make a team from a name typed in, read 3 results (goals scored, then conceded, for each), then print, for example:\nRovers: 4 points from 3 games\nAverage: 1",
    starter: "# Write the Team class, then read the results",
    solution: `class Team:
    def __init__(self, name):
        self.name = name
        self.played = 0
        self.points = 0

    def result(self, scored, conceded):
        self.played = self.played + 1
        if scored > conceded:
            self.points = self.points + 3
        elif scored == conceded:
            self.points = self.points + 1

    def average(self):
        return self.points // self.played

team = Team(input("Team: "))
for k in range(3):
    scored = int(input("Scored: "))
    conceded = int(input("Conceded: "))
    team.result(scored, conceded)
print(team.name + ":", team.points, "points from", team.played, "games")
print("Average:", team.average())`,
    tests: [T(["Rovers", "2", "1", "0", "0", "1", "3"]), T(["City", "3", "0", "2", "1", "4", "2"])],
    hints: ["result changes self.played and self.points.", "average uses the attributes result has built up."],
    skills: ["method", "change-attribute", "return-method"], tags: ["RETURN_MISSING_NONE", "ATTRIBUTE_NOT_STORED"],
    buggy: [["RETURN_MISSING_NONE", `class Team:
    def __init__(self, name):
        self.name = name
        self.played = 0
        self.points = 0

    def result(self, scored, conceded):
        self.played = self.played + 1
        if scored > conceded:
            self.points = self.points + 3
        elif scored == conceded:
            self.points = self.points + 1

    def average(self):
        self.points // self.played

team = Team(input("Team: "))
for k in range(3):
    scored = int(input("Scored: "))
    conceded = int(input("Conceded: "))
    team.result(scored, conceded)
print(team.name + ":", team.points, "points from", team.played, "games")
print("Average:", team.average())`],
      ["ATTRIBUTE_NOT_STORED", `class Team:
    def __init__(self, name):
        self.name = name
        self.played = 0
        self.points = 0

    def result(self, scored, conceded):
        played = self.played + 1
        if scored > conceded:
            self.points = self.points + 3
        elif scored == conceded:
            self.points = self.points + 1

    def average(self):
        return self.points // self.played

team = Team(input("Team: "))
for k in range(3):
    scored = int(input("Scored: "))
    conceded = int(input("Conceded: "))
    team.result(scored, conceded)
print(team.name + ":", team.points, "points from", team.played, "games")
print("Average:", team.average())`]],
    explainer: "result changes the team's own played and points every time it is called, and average returns a value worked out from them at the end." },
  { id: "meth-L10b", level: 10, type: "trace", title: "Trace the lift",
    description: "Trace the program. go only moves the lift if it is asked for a different floor.",
    solution: `class Lift:
    def __init__(self):
        self.floor = 0
        self.trips = 0

    def go(self, to):
        if to != self.floor:
            self.floor = to
            self.trips = self.trips + 1

lift = Lift()
for f in [3, 3, 1, 4]:
    lift.go(f)
lift.go(lift.floor - 2)
print(lift.floor, lift.trips)`, tests: [T([])],
    trace: { columns: ["f", "lift.floor", "lift.trips"] },
    hints: ["A floor the lift is already on adds no trip.", "The last call works out lift.floor - 2 first."],
    skills: ["method-trace", "change-attribute"], tags: ["trace"],
    explainer: "go only changes the lift's floor and trips when the floor asked for is different, so asking for the same floor again adds no trip." },
];

// Placement (levels 2, 5, 7 and 9): no buggy variants.
const PLACEMENT = [
  { id: "meth-P2a", level: 2, type: "predict", title: "Faster",
    description: "faster doubles the fan's speed. What does the program print?",
    solution: `class Fan:
    def __init__(self):
        self.speed = 1

    def faster(self):
        self.speed = self.speed * 2

f = Fan()
f.faster()
f.faster
f.faster()
print(f.speed)`, tests: [T([])],
    wrongOutputs: ["8", "2", "6"],
    hints: ["One of the three lines has no brackets.", "Only a call with brackets runs the method."],
    skills: ["method-brackets", "change-attribute"], tags: ["trap"],
    explainer: "Only the calls with brackets run the method, and each one doubles the fan's own speed." },
  { id: "meth-P2b", level: 2, type: "predict", title: "Perimeters",
    description: "perimeter returns a value. What does the program print?",
    solution: `class Square:
    def __init__(self, side):
        self.side = side

    def perimeter(self):
        return self.side * 4

s = Square(5)
t = Square(s.perimeter())
print(t.perimeter())`, tests: [T([])],
    wrongOutputs: ["20", "100", "25"],
    hints: ["s.perimeter() is 20.", "t is a Square with side 20."],
    skills: ["return-method", "method-call"], tags: ["return"],
    explainer: "perimeter returns a number worked out from the object's own side, and t is a new Square made from the first one's answer." },
  { id: "meth-P5a", level: 5, type: "parsons", title: "A bulb",
    description: "Arrange the lines: use adds hours to the bulb, and the program prints its hours after one use.\nOne line is not needed.",
    solution: `class Bulb:
    def __init__(self):
        self.hours = 0
    def use(self, h):
        self.hours = self.hours + h
b = Bulb()
b.use(int(input("Hours: ")))
print(b.hours)`,
    distractors: ["def use(h):"],
    tests: [T(["5"]), T(["0"])],
    hints: ["Every method takes self first.", "The method changes self.hours."],
    skills: ["method", "change-attribute"], tags: ["parsons"],
    explainer: "use adds to the bulb's own hours, reached through self, each time it is called." },
  { id: "meth-P5b", level: 5, type: "partial-parsons", title: "Count the coins",
    description: "Pick the missing line, so the program prints twice the number of coins.",
    starter: `class Coins:
    def __init__(self, n):
        self.n = n

    def count(self):
        return self.n

c = Coins(int(input("Coins: ")))
____
print(total * 2)`,
    options: ["total = c.count()", "total = c.count", "total = Coins.count()", "c.count()"],
    tests: [T(["6"]), T(["15"])],
    hints: ["Call the method on the object c.", "Store what it gives back in total."],
    skills: ["method-brackets", "return-method"], tags: ["call"],
    explainer: "c.count() runs the method and gives back the number, which is stored in total." },
  { id: "meth-P7a", level: 7, type: "trace", title: "Trace two pots",
    description: "Trace the program. pour adds water to the pot it is called on.",
    solution: `class Pot:
    def __init__(self):
        self.water = 0

    def pour(self, ml):
        self.water = self.water + ml

p = Pot()
q = Pot()
p.pour(200)
q.pour(150)
p.pour(q.water)
print(p.water)`, tests: [T([])],
    trace: { columns: ["p.water", "q.water"] },
    hints: ["Each pot starts with 0.", "p.pour(q.water) uses q's water at that moment."],
    skills: ["method-trace", "method-call"], tags: ["trace"],
    explainer: "Each pour call adds to the water of the one pot it is called on." },
  { id: "meth-P7b", level: 7, type: "write", title: "Write area",
    description: "Write a method area(self) in the Box class that returns width times depth. The program then prints the area.",
    starter: `class Box:
    def __init__(self, width, depth):
        self.width = width
        self.depth = depth

    # Write a method area(self) that returns width times depth

b = Box(int(input("Width: ")), int(input("Depth: ")))
print(b.area())`,
    solution: `class Box:
    def __init__(self, width, depth):
        self.width = width
        self.depth = depth

    def area(self):
        return self.width * self.depth

b = Box(int(input("Width: ")), int(input("Depth: ")))
print(b.area())`,
    tests: [T(["4", "5"]), T(["9", "2"])],
    hints: ["def area(self): inside the class.", "Return self.width * self.depth."],
    skills: ["return-method", "method"], tags: ["write"],
    explainer: "area uses self.width and self.depth, the box's own attributes, and returns their product to the caller." },
  { id: "meth-P9a", level: 9, type: "write", title: "Heat the kettle",
    description: "Write a class Kettle with a temp attribute that starts at 20, and a method heat(self, degrees) that adds degrees but never lets temp go above 100. Read 3 amounts to heat by, and print the temperature after each.",
    solution: `class Kettle:
    def __init__(self):
        self.temp = 20

    def heat(self, degrees):
        self.temp = self.temp + degrees
        if self.temp > 100:
            self.temp = 100

k = Kettle()
for i in range(3):
    k.heat(int(input("Heat by: ")))
    print(k.temp)`,
    tests: [T(["30", "40", "50"]), T(["5", "5", "5"])],
    hints: ["Add degrees to self.temp, then check it.", "Call heat inside the loop, then print k.temp."],
    skills: ["change-attribute", "method"], tags: ["write"],
    explainer: "heat changes the kettle's own temp and then caps it, so each call starts from where the last one left it." },
  { id: "meth-P9b", level: 9, type: "trace", title: "Trace the gauge",
    description: "Trace the program. drop lowers the gauge's level and returns it.",
    solution: `class Gauge:
    def __init__(self, level):
        self.level = level

    def drop(self):
        self.level = self.level - 10
        return self.level

g = Gauge(45)
a = g.drop()
b = g.drop()
g.level = a + b
print(g.level)`, tests: [T([])],
    trace: { columns: ["g.level", "a", "b"] },
    hints: ["Each drop changes g.level and returns the new level.", "Two cells change on the lines with a call."],
    skills: ["method-trace", "return-method"], tags: ["trace"],
    explainer: "drop changes the gauge's level and returns it, so a and b each hold the level just after their own call." },
];

const COVERAGE = {
  "Methods that read and change attributes": ["meth-L1a", "meth-L2c", "meth-L3a", "meth-L4a", "meth-L5a", "meth-L6a", "meth-L7b", "meth-P5a", "meth-P9a"],
  "Methods that return values": ["meth-L1b", "meth-L2b", "meth-L3b", "meth-L4c", "meth-L5b", "meth-L7c", "meth-L9a", "meth-P2b", "meth-P7b"],
  "Calling methods on several objects and tracing the changes": ["meth-L1c", "meth-L4b", "meth-L5c", "meth-L6b", "meth-L7a", "meth-L8b", "meth-L9b", "meth-L10b", "meth-P7a", "meth-P9b"],
  "Calling a method without its brackets": ["meth-L2a", "meth-L3c", "meth-L4c", "meth-L5a", "meth-L5c", "meth-L9a", "meth-P2a", "meth-P5b"],
};

// Tasks that cast input() with int() say so (the casting sentence, tools/unit-tasks.js nameCasting).
nameCasting(PRACTICE.concat(PLACEMENT));

if (require.main === module) addUnit("oop-methods", PRACTICE, PLACEMENT);
module.exports = { PRACTICE, PLACEMENT, COVERAGE };
