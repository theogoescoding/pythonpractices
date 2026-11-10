// One-off (2026-11): the "Object-oriented programming: classes and objects" unit (id oop-classes, A-level
// programming techniques), built with tools/unit-tasks.js. The A-level ladder, placement at levels 2, 5, 7 and 9 (no
// buggy variants), and an explainer on every task (see tools/add-recursion-unit.js). Trace tables show an object's
// attributes as columns of their own (acc.balance), from harness.trace_code. COVERAGE lists each angle and its tasks.
"use strict";
const { T, addUnit, nameCasting } = require("./unit-tasks.js");

const PRACTICE = [
  // ---------- Level 1: predict ----------
  { id: "cls-L1a", level: 1, type: "predict", title: "Make a pet",
    description: "The program makes one Pet object. What does it print?",
    solution: `class Pet:
    def __init__(self, name, age):
        self.name = name
        self.age = age

p = Pet("Rex", 4)
print(p.name, p.age)`, tests: [T([])],
    wrongOutputs: ["name age", "4 Rex", "Pet Rex"],
    hints: ["Pet(...) makes a new object and runs __init__.", "__init__ stores each value as an attribute of the object, self.name and self.age."],
    skills: ["object", "init", "attribute"], tags: ["class"],
    explainer: "Calling the class makes a new object, and __init__ stores the two values it is given as the object's attributes name and age." },
  { id: "cls-L1b", level: 1, type: "predict", title: "Two counters",
    description: "Two Counter objects are made from the same class. What does the program print?",
    solution: `class Counter:
    def __init__(self, start):
        self.value = start

a = Counter(5)
b = Counter(9)
a.value = a.value + 1
print(a.value, b.value)`, tests: [T([])],
    wrongOutputs: ["6 10", "5 9", "6 6"],
    hints: ["a and b are separate objects, each with its own value.", "Only a's value is changed."],
    skills: ["class-vs-object", "attribute"], tags: ["objects"],
    explainer: "a and b are two separate objects made from the same class, so changing a's value attribute leaves b's alone." },
  { id: "cls-L1c", level: 1, type: "predict", title: "A list of planets",
    description: "planets is a list of Planet objects. What does the program print?",
    solution: `class Planet:
    def __init__(self, name, moons):
        self.name = name
        self.moons = moons

planets = [Planet("Mars", 2), Planet("Earth", 1), Planet("Jupiter", 95)]
print(len(planets), planets[1].name)`, tests: [T([])],
    wrongOutputs: ["2 Earth", "3 Jupiter"],
    hints: ["The list holds three objects.", "Indexing counts from 0."],
    skills: ["object-list", "attribute"], tags: ["INDEX_FROM_ONE"],
    buggy: [["INDEX_FROM_ONE", `class Planet:
    def __init__(self, name, moons):
        self.name = name
        self.moons = moons

planets = [Planet("Mars", 2), Planet("Earth", 1), Planet("Jupiter", 95)]
print(len(planets), planets[0].name)`]],
    explainer: "planets is a list holding Planet objects, so planets[1] is one whole object and .name reads that object's attribute." },

  // ---------- Level 2: predict, spot the trap ----------
  { id: "cls-L2a", level: 2, type: "predict", title: "Box sizes",
    description: "c is made from b's size. What does the program print?",
    solution: `class Box:
    def __init__(self, size):
        self.size = size
        self.full = False

b = Box(3)
b.size = b.size * 2
c = Box(b.size)
print(b.size, c.size, c.full)`, tests: [T([])],
    wrongOutputs: ["3 6 False", "6 3 False", "6 6 True"],
    hints: ["b.size is changed before c is made.", "Every new Box starts with full set to False."],
    skills: ["attribute", "object"], tags: ["trap"],
    explainer: "Each object gets its own size and full when it is made, and c is made from the value b.size had at that moment." },
  { id: "cls-L2b", level: 2, type: "predict", title: "The score that wasn't kept",
    description: "Read __init__ carefully. What does the program print?",
    solution: `class Player:
    def __init__(self, name, score):
        self.name = name
        self.score = 0

p = Player("Zoe", 50)
print(p.name, p.score)`, tests: [T([])],
    wrongOutputs: ["Zoe 50", "name 0"],
    hints: ["Look at what is stored in self.score.", "The parameter score is never used."],
    skills: ["init", "attribute"], tags: ["trap"],
    explainer: "__init__ stores the same starting value in self.score whatever is passed in, so the parameter score is never kept by the object." },
  { id: "cls-L2c", level: 2, type: "predict", title: "Two names, one car",
    description: "c2 = c1 doesn't call Car. What does the program print?",
    solution: `class Car:
    def __init__(self, colour):
        self.colour = colour

c1 = Car("red")
c2 = c1
c2.colour = "blue"
print(c1.colour)`, tests: [T([])],
    wrongOutputs: ["c1"],
    hints: ["Only one Car object is ever made.", "c1 and c2 are two names for it."],
    skills: ["class-vs-object", "object"], tags: ["LIST_COPY_ASSUMED"],
    buggy: [["LIST_COPY_ASSUMED", `class Car:
    def __init__(self, colour):
        self.colour = colour

c1 = Car("red")
c2 = Car(c1.colour)
c2.colour = "blue"
print(c1.colour)`]],
    explainer: "c2 = c1 doesn't make a new object, so both names refer to the one Car and changing its colour through c2 is seen through c1." },

  // ---------- Level 3: fill in one blank ----------
  { id: "cls-L3a", level: 3, type: "fill", title: "Store the name",
    description: "Fill in the blank so the name is stored on the object, and d.name works afterwards.",
    starter: `class Dog:
    def __init__(self, name):
        ____ = name

d = Dog(input("Name: "))
print(d.name)`,
    answers: ["self.name"], tests: [T(["Rex"]), T(["Bo"])],
    hints: ["Inside __init__, the new object is called self.", "An attribute is written self.something."],
    skills: ["init", "self"], tags: ["ATTRIBUTE_NOT_STORED"],
    buggy: [["ATTRIBUTE_NOT_STORED", `class Dog:
    def __init__(self, name):
        name = name

d = Dog(input("Name: "))
print(d.name)`]],
    explainer: "self.name = name stores the name on the object being made, so d.name can read it after __init__ has finished." },
  { id: "cls-L3b", level: 3, type: "fill", title: "Make a ticket",
    description: "Fill in the blank to make a Ticket object from the film and seat typed.",
    starter: `class Ticket:
    def __init__(self, film, seat):
        self.film = film
        self.seat = seat

t = ____(input("Film: "), input("Seat: "))
print(t.film, "seat", t.seat)`,
    answers: ["Ticket"], tests: [T(["Up", "F7"]), T(["Cars", "A12"])],
    hints: ["You make an object by calling its class.", "The class here is called Ticket."],
    skills: ["class", "object"], tags: ["class"],
    explainer: "Calling the class name like a function, Ticket(...), makes a new object and passes the values to its __init__." },
  { id: "cls-L3c", level: 3, type: "fill", title: "Loop over the basket",
    description: "Fill in the blank so the loop prints each fruit's name and price.",
    starter: `class Fruit:
    def __init__(self, name, price):
        self.name = name
        self.price = price

basket = [Fruit("apple", 30), Fruit("pear", 45), Fruit("plum", 20)]
for f in basket:
    print(f.name, ____)`,
    answers: ["f.price"], tests: [T([])],
    hints: ["f is one Fruit object each time round.", "Read its price attribute."],
    skills: ["object-list", "attribute"], tags: ["loop"],
    explainer: "Each time round the loop f is one Fruit object from the list, so f.price reads that object's own price." },

  // ---------- Level 4: fill in two blanks ----------
  { id: "cls-L4a", level: 4, type: "fill", title: "The __init__ line",
    description: "Fill in both blanks so __init__ takes the new object first, and stores the year too.",
    starter: `class Student:
    def __init__(____, name, year):
        self.name = name
        self.year = ____

s = Student(input("Name: "), int(input("Year: ")))
print(s.name, "is in Year", s.year)`,
    answers: ["self", "year"], tests: [T(["Ali", "9"]), T(["Mia", "11"])],
    hints: ["The first parameter of every method, including __init__, is the object itself.", "Store the year that was passed in."],
    skills: ["init", "self"], tags: ["SELF_MISSING", "ATTRIBUTE_NOT_STORED"],
    buggy: [["SELF_MISSING", `class Student:
    def __init__(name, year):
        self.name = name
        self.year = year

s = Student(input("Name: "), int(input("Year: ")))
print(s.name, "is in Year", s.year)`],
      ["ATTRIBUTE_NOT_STORED", `class Student:
    def __init__(self, name, year):
        self.name = name
        year = year

s = Student(input("Name: "), int(input("Year: ")))
print(s.name, "is in Year", s.year)`]],
    explainer: "__init__ takes self first, the new object, and stores each value it is given with self.name and self.year." },
  { id: "cls-L4b", level: 4, type: "fill", title: "Count a house",
    description: "Fill in both blanks so the program counts the pupils in the house typed.",
    starter: `class Pupil:
    def __init__(self, name, house):
        self.name = name
        self.house = house

group = [Pupil("Ava", "Red"), Pupil("Ben", "Blue"), Pupil("Cal", "Red")]
look = input("House: ")
count = 0
for p in group:
    if ____ == look:
        count = ____
print(look, count)`,
    answers: ["p.house", "count + 1"], tests: [T(["Red"]), T(["Green"])],
    hints: ["p is one Pupil object each time round.", "Add 1 to count for each match."],
    skills: ["object-list", "attribute"], tags: ["counting"],
    explainer: "The loop checks each Pupil object's own house attribute, adding 1 to count for each one that matches." },
  { id: "cls-L4c", level: 4, type: "fill", title: "Two lamps",
    description: "Fill in both blanks so lamp1 and lamp2 are two separate Lamp objects. The program should print True False.",
    starter: `class Lamp:
    def __init__(self):
        self.on = False

lamp1 = ____
lamp2 = ____
lamp1.on = True
print(lamp1.on, lamp2.on)`,
    answers: ["Lamp()", "Lamp()"], tests: [T([])],
    hints: ["Each call to the class makes a new object.", "lamp2 = lamp1 would only give the same lamp a second name."],
    skills: ["class-vs-object", "object"], tags: ["LIST_COPY_ASSUMED"],
    buggy: [["LIST_COPY_ASSUMED", `class Lamp:
    def __init__(self):
        self.on = False

lamp1 = Lamp()
lamp2 = lamp1
lamp1.on = True
print(lamp1.on, lamp2.on)`]],
    explainer: "Each call to Lamp() makes a separate object with its own on attribute, so switching lamp1 on leaves lamp2 off." },

  // ---------- Level 5: Parsons, or pick the missing line ----------
  { id: "cls-L5a", level: 5, type: "parsons", title: "Build a Song class",
    description: "Arrange the lines: the Song class stores a title and a length, and the program makes one song from what is typed.\nOne line is not needed.",
    solution: `class Song:
    def __init__(self, title, length):
        self.title = title
        self.length = length
s = Song(input("Title: "), int(input("Seconds: ")))
print(s.title, "lasts", s.length, "seconds")`,
    distractors: ["title = title"],
    tests: [T(["Hello", "200"]), T(["Up", "95"])],
    hints: ["The class comes first, then the object is made from it.", "__init__ stores each value on self."],
    skills: ["class", "init"], tags: ["parsons"],
    explainer: "The class is defined first, with __init__ storing each value on self, and then one object is made from what is typed." },
  { id: "cls-L5b", level: 5, type: "partial-parsons", title: "The robot's __init__",
    description: "Pick the missing line, so a Robot can be made from the code typed.",
    starter: `class Robot:
    ____
        self.code = code
        self.power = 100

r = Robot(input("Code: "))
print(r.code, r.power)`,
    options: ["def __init__(self, code):", "def __init__(code):", "def __init__(self):", "def init(self, code):"], optionMisconceptions: { 1: "SELF_MISSING" },
    tests: [T(["R2"]), T(["K9"])],
    hints: ["__init__ runs when the object is made.", "Its first parameter is the new object; then come the values passed in."],
    skills: ["init", "self"], tags: ["SELF_MISSING"],
    explainer: "__init__ runs when the object is made and takes self first, then the values passed in, so self.code can store the code." },
  { id: "cls-L5c", level: 5, type: "partial-parsons", title: "Add to the scoreboard",
    description: "Pick the missing line, so a second Score object is made from what is typed and added to the board.",
    starter: `class Score:
    def __init__(self, name, points):
        self.name = name
        self.points = points

board = []
board.append(Score("Ava", 12))
____
for s in board:
    print(s.name, s.points)`,
    options: ['board.append(Score(input("Name: "), int(input("Points: "))))', 'board.append(input("Name: "), int(input("Points: ")))',
      'Score(input("Name: "), int(input("Points: ")))', 'board = Score(input("Name: "), int(input("Points: ")))'],
    tests: [T(["Ben", "20"]), T(["Kai", "7"])],
    hints: ["The object has to be made, then added to the list.", "append takes one thing: the new object."],
    skills: ["object-list", "object"], tags: ["list"],
    explainer: "Each Score object has to be made and then added to the list with append, so the loop can print every object's attributes." },

  // ---------- Level 6: Parsons with traps, or pick the missing line ----------
  { id: "cls-L6a", level: 6, type: "parsons", title: "Add up the cart",
    description: "Arrange the lines: the program adds up the cost of every Item in the cart.\nTwo lines are not needed.",
    solution: `class Item:
    def __init__(self, name, cost):
        self.name = name
        self.cost = cost
cart = [Item("pen", 120), Item("pad", 250), Item("ink", 80)]
total = 0
for item in cart:
    total = total + item.cost
print("Total:", total)`,
    distractors: ["total = total + cost", "for item in Item:"],
    tests: [T([])],
    hints: ["Loop over the list of objects, not the class.", "item.cost is the cost of the object the loop is on."],
    skills: ["object-list", "attribute"], tags: ["total"],
    explainer: "item is a different Item object each time round the loop, and item.cost is that object's cost, added to the running total." },
  { id: "cls-L6b", level: 6, type: "partial-parsons", title: "Pay in",
    description: "Pick the missing line, so the amount typed is added to this account's balance.",
    starter: `class Account:
    def __init__(self, owner):
        self.owner = owner
        self.balance = 0

acc = Account(input("Owner: "))
____
print(acc.owner, acc.balance)`,
    options: ['acc.balance = acc.balance + int(input("Pay in: "))', 'balance = acc.balance + int(input("Pay in: "))',
      'Account.balance = int(input("Pay in: "))', 'acc = int(input("Pay in: "))'],
    optionMisconceptions: { 1: "ATTRIBUTE_NOT_STORED" },
    tests: [T(["Leo", "25"]), T(["Ana", "40"])],
    hints: ["The balance belongs to the object acc.", "A plain variable called balance would not be part of the object."],
    skills: ["attribute", "class-vs-object"], tags: ["ATTRIBUTE_NOT_STORED"],
    explainer: "The new amount must be stored on the object itself, acc.balance, because a plain variable or the class's name would leave this account's balance at 0." },

  // ---------- Level 7: trace, or write a short line ----------
  { id: "cls-L7a", level: 7, type: "trace", title: "Trace two bottles",
    description: "Trace the program. Each attribute of each object has its own column, such as b.size.",
    solution: `class Bottle:
    def __init__(self, size):
        self.size = size
        self.drunk = 0

b = Bottle(500)
b.drunk = 150
c = Bottle(750)
c.drunk = b.drunk * 2
left = c.size - c.drunk
print(left)`, tests: [T([])],
    trace: { columns: ["b.size", "b.drunk", "c.size", "c.drunk", "left"] },
    hints: ["Making an object fills in all of its attributes on that line.", "b.drunk = 150 changes only b."],
    skills: ["attribute", "object"], tags: ["trace"],
    explainer: "Each object gets its own size and drunk when it is made, and a line like b.drunk = 150 changes only that object's attribute." },
  { id: "cls-L7b", level: 7, type: "write", title: "Write the attributes",
    description: "Finish __init__ so it stores name and height on the object. The program should print, for example:\nFern is 30 cm tall",
    starter: `class Plant:
    def __init__(self, name, height):
        # Store name and height on the object

p = Plant(input("Plant: "), int(input("Height: ")))
print(p.name, "is", p.height, "cm tall")`,
    solution: `class Plant:
    def __init__(self, name, height):
        self.name = name
        self.height = height

p = Plant(input("Plant: "), int(input("Height: ")))
print(p.name, "is", p.height, "cm tall")`,
    tests: [T(["Fern", "30"]), T(["Ivy", "120"])],
    hints: ["Each attribute is stored with self.", "self.name = name, then the same for height."],
    skills: ["init", "self", "attribute"], tags: ["ATTRIBUTE_NOT_STORED"],
    buggy: [["ATTRIBUTE_NOT_STORED", `class Plant:
    def __init__(self, name, height):
        name = name
        height = height

p = Plant(input("Plant: "), int(input("Height: ")))
print(p.name, "is", p.height, "cm tall")`]],
    explainer: "Writing self.name = name and self.height = height stores the values on the new object, so p.name and p.height work afterwards." },
  { id: "cls-L7c", level: 7, type: "trace", title: "Trace the fastest runner",
    description: "Trace the program. best and r each refer to a Runner object; the table shows their names.",
    solution: `class Runner:
    def __init__(self, name, time):
        self.name = name
        self.time = time

race = [Runner("Ava", 61), Runner("Ben", 58), Runner("Cal", 64)]
best = race[0]
for r in race:
    if r.time < best.time:
        best = r
fastest = best.name
print(fastest)`, tests: [T([])],
    trace: { columns: ["r.name", "best.name", "fastest"] },
    hints: ["best = r makes best refer to the whole Runner object r is on.", "Compare the times: the lowest time wins."],
    skills: ["object-list", "attribute"], tags: ["trace"],
    explainer: "best holds whichever Runner object has the lowest time so far, and best = r makes it refer to that whole object." },

  // ---------- Level 8: trace, or write ----------
  { id: "cls-L8a", level: 8, type: "write", title: "A shelf of books",
    description: "Write a class Book whose __init__ stores a title and a number of pages. Make a list of three books: Holes with 240 pages, Wonder with 310 and Coraline with 160. Ask for a number of pages, print the title of every book with more pages than that, then how many there were, for example:\nHoles\nWonder\nBooks: 2",
    starter: "# Write the Book class, then make the list and search it",
    solution: `class Book:
    def __init__(self, title, pages):
        self.title = title
        self.pages = pages

books = [Book("Holes", 240), Book("Wonder", 310), Book("Coraline", 160)]
limit = int(input("Pages: "))
count = 0
for b in books:
    if b.pages > limit:
        print(b.title)
        count = count + 1
print("Books:", count)`,
    tests: [T(["200"]), T(["400"])],
    hints: ["Store both values in __init__ with self.", "Loop over the list and check each book's pages."],
    skills: ["class", "object-list", "init"], tags: ["ATTRIBUTE_NOT_STORED", "SELF_MISSING"],
    buggy: [["ATTRIBUTE_NOT_STORED", `class Book:
    def __init__(self, title, pages):
        self.title = title
        pages = pages

books = [Book("Holes", 240), Book("Wonder", 310), Book("Coraline", 160)]
limit = int(input("Pages: "))
count = 0
for b in books:
    if b.pages > limit:
        print(b.title)
        count = count + 1
print("Books:", count)`],
      ["SELF_MISSING", `class Book:
    def __init__(title, pages):
        self.title = title
        self.pages = pages

books = [Book("Holes", 240), Book("Wonder", 310), Book("Coraline", 160)]
limit = int(input("Pages: "))
count = 0
for b in books:
    if b.pages > limit:
        print(b.title)
        count = count + 1
print("Books:", count)`]],
    explainer: "Each Book object keeps its own title and pages, so the loop can check every book's pages and print the titles that are over the limit." },
  { id: "cls-L8b", level: 8, type: "trace", title: "Trace three names",
    description: "Trace the program. Watch which names refer to the same object.",
    solution: `class Score:
    def __init__(self, points):
        self.points = points

a = Score(10)
b = Score(10)
c = a
c.points = c.points + 5
b.points = b.points * 2
print(a.points, b.points, c.points)`, tests: [T([])],
    trace: { columns: ["a.points", "b.points", "c.points"] },
    hints: ["c = a doesn't make a new object.", "So changing c.points changes a.points on the same line."],
    skills: ["class-vs-object", "attribute"], tags: ["LIST_COPY_ASSUMED"],
    buggy: [["LIST_COPY_ASSUMED", `class Score:
    def __init__(self, points):
        self.points = points

a = Score(10)
b = Score(10)
c = Score(a.points)
c.points = c.points + 5
b.points = b.points * 2
print(a.points, b.points, c.points)`]],
    explainer: "c = a makes c another name for the same object as a, so changing c.points changes a.points too, while b is a separate object." },

  // ---------- Level 9: write a full program, or a longer trace ----------
  { id: "cls-L9a", level: 9, type: "write", title: "Top of the class",
    description: "Write a class Pupil with name and mark attributes. Ask how many pupils there are, then ask for each one's name and mark, making a Pupil object for each and adding it to a list. Then print the name of the pupil with the highest mark, and the average mark using //, for example:\nTop: Mia\nAverage: 63",
    starter: "# Write the Pupil class, then read the pupils into a list",
    solution: `class Pupil:
    def __init__(self, name, mark):
        self.name = name
        self.mark = mark

pupils = []
n = int(input("How many? "))
for k in range(n):
    name = input("Name: ")
    mark = int(input("Mark: "))
    pupils.append(Pupil(name, mark))
top = pupils[0]
total = 0
for p in pupils:
    total = total + p.mark
    if p.mark > top.mark:
        top = p
print("Top:", top.name)
print("Average:", total // n)`,
    tests: [T(["3", "Mia", "70", "Leo", "55", "Ava", "64"]), T(["2", "Kai", "40", "Zoe", "90"])],
    hints: ["Make each Pupil object inside the loop and append it.", "Keep the top pupil as an object: compare p.mark with top.mark."],
    skills: ["object-list", "class", "attribute"], tags: ["ATTRIBUTE_NOT_STORED", "SELF_MISSING"],
    buggy: [["ATTRIBUTE_NOT_STORED", `class Pupil:
    def __init__(self, name, mark):
        self.name = name
        mark = mark

pupils = []
n = int(input("How many? "))
for k in range(n):
    name = input("Name: ")
    mark = int(input("Mark: "))
    pupils.append(Pupil(name, mark))
top = pupils[0]
total = 0
for p in pupils:
    total = total + p.mark
    if p.mark > top.mark:
        top = p
print("Top:", top.name)
print("Average:", total // n)`],
      ["SELF_MISSING", `class Pupil:
    def __init__(name, mark):
        self.name = name
        self.mark = mark

pupils = []
n = int(input("How many? "))
for k in range(n):
    name = input("Name: ")
    mark = int(input("Mark: "))
    pupils.append(Pupil(name, mark))
top = pupils[0]
total = 0
for p in pupils:
    total = total + p.mark
    if p.mark > top.mark:
        top = p
print("Top:", top.name)
print("Average:", total // n)`]],
    explainer: "Each Pupil object keeps its own name and mark, so once they are all in the list one loop can add up the marks and keep the top pupil." },
  { id: "cls-L9b", level: 9, type: "trace", title: "Trace two tanks",
    description: "Trace the program. Each tank has its own fish and fed attributes.",
    solution: `class Tank:
    def __init__(self, fish):
        self.fish = fish
        self.fed = False

t1 = Tank(4)
t2 = Tank(6)
t1.fed = True
t2.fish = t2.fish + t1.fish
t1.fish = t1.fish - 1
t2.fed = t1.fed
total = t1.fish + t2.fish
print(total)`, tests: [T([])],
    trace: { columns: ["t1.fish", "t1.fed", "t2.fish", "t2.fed", "total"] },
    hints: ["Making a Tank fills in both of its attributes.", "Each later line changes one attribute of one tank."],
    skills: ["attribute", "class-vs-object"], tags: ["trace"],
    explainer: "Every line changes one attribute of one object, so t1 and t2 each keep their own fish and fed values all the way through." },

  // ---------- Level 10: write an extended program, or a longer trace ----------
  { id: "cls-L10a", level: 10, type: "write", title: "Car records",
    description: "Write a class Car with make, year and miles attributes; miles starts at 0 for every car. Read three cars (a make, then a year, for each) into a list. Then ask for each car's miles and store it. Print each car's make, year and miles, then the make of the newest car, for example:\nFord 2019 1200\nKia 2021 800\nAudi 2017 3000\nNewest: Kia",
    starter: "# Write the Car class, then read the cars into a list",
    solution: `class Car:
    def __init__(self, make, year):
        self.make = make
        self.year = year
        self.miles = 0

cars = []
for k in range(3):
    make = input("Make: ")
    year = int(input("Year: "))
    cars.append(Car(make, year))
for car in cars:
    car.miles = int(input("Miles for " + car.make + ": "))
newest = cars[0]
for car in cars:
    print(car.make, car.year, car.miles)
    if car.year > newest.year:
        newest = car
print("Newest:", newest.make)`,
    tests: [T(["Ford", "2019", "Kia", "2021", "Audi", "2017", "1200", "800", "3000"]), T(["Fiat", "2015", "Seat", "2012", "Mini", "2014", "500", "9000", "60"])],
    hints: ["miles isn't passed in: __init__ sets self.miles = 0.", "Set car.miles inside a loop over the list."],
    skills: ["object-list", "attribute", "init"], tags: ["ATTRIBUTE_NOT_STORED"],
    buggy: [["ATTRIBUTE_NOT_STORED", `class Car:
    def __init__(self, make, year):
        self.make = make
        self.year = year
        self.miles = 0

cars = []
for k in range(3):
    make = input("Make: ")
    year = int(input("Year: "))
    cars.append(Car(make, year))
for car in cars:
    miles = int(input("Miles for " + car.make + ": "))
newest = cars[0]
for car in cars:
    print(car.make, car.year, car.miles)
    if car.year > newest.year:
        newest = car
print("Newest:", newest.make)`]],
    explainer: "Each Car object starts with its own miles of 0, and setting car.miles inside the loop changes only the car that the loop is on." },
  { id: "cls-L10b", level: 10, type: "trace", title: "Trace the seats",
    description: "Trace the program. Three Seat objects are made, changed, then checked in a loop.",
    solution: `class Seat:
    def __init__(self, row, number):
        self.row = row
        self.number = number
        self.taken = False

s1 = Seat("A", 4)
s2 = Seat("A", 5)
s3 = Seat("B", 4)
s1.taken = True
s3.taken = s1.taken
s2.number = s1.number + s3.number
free = 0
for s in [s1, s2, s3]:
    if not s.taken:
        free = free + 1
print(free)`, tests: [T([])],
    trace: { columns: ["s1.taken", "s2.number", "s3.taken", "free"] },
    hints: ["The table only shows some of the attributes.", "The loop counts the seats whose own taken is False."],
    skills: ["attribute", "object-list"], tags: ["trace"],
    explainer: "Each Seat object has its own taken attribute, so the loop counts only the seats whose own taken is still False." },
];

// Placement (levels 2, 5, 7 and 9): no buggy variants.
const PLACEMENT = [
  { id: "cls-P2a", level: 2, type: "predict", title: "A hat",
    description: "The program makes one Hat object. What does it print?",
    solution: `class Hat:
    def __init__(self, size):
        self.size = size
        self.worn = 0

h = Hat(7)
h.worn = h.worn + 2
print(h.size + h.worn)`, tests: [T([])],
    wrongOutputs: ["7", "2", "72"],
    hints: ["worn starts at 0, then 2 is added.", "Add the two attributes together."],
    skills: ["attribute", "init"], tags: ["class"],
    explainer: "h is one Hat object, and its two attributes are separate values that the program can read and change." },
  { id: "cls-P2b", level: 2, type: "predict", title: "Gems",
    description: "gems is a list of Gem objects. What does the program print?",
    solution: `class Gem:
    def __init__(self, value):
        self.value = value

gems = [Gem(20), Gem(35), Gem(15)]
total = 0
for g in gems:
    total = total + g.value
print(total)`, tests: [T([])],
    wrongOutputs: ["3", "20", "15"],
    hints: ["g is one Gem object each time round.", "Add up every gem's value."],
    skills: ["object-list", "attribute"], tags: ["list"],
    explainer: "The list holds Gem objects, and the loop adds each object's own value attribute to the total." },
  { id: "cls-P5a", level: 5, type: "parsons", title: "A kite",
    description: "Arrange the lines: the Kite class stores a colour, and the program makes a kite in the colour typed.\nOne line is not needed.",
    solution: `class Kite:
    def __init__(self, colour):
        self.colour = colour
k = Kite(input("Colour: "))
print("A", k.colour, "kite")`,
    distractors: ["colour = self.colour"],
    tests: [T(["red"]), T(["green"])],
    hints: ["__init__ stores the colour on self.", "Then make one Kite object."],
    skills: ["class", "init"], tags: ["parsons"],
    explainer: "__init__ stores the colour on self, the new object, so k.colour reads it back." },
  { id: "cls-P5b", level: 5, type: "partial-parsons", title: "A purse of coins",
    description: "Pick the missing line, so the program prints the value of each coin in the purse.",
    starter: `class Coin:
    def __init__(self, value):
        self.value = value

purse = [Coin(20), Coin(50), Coin(10)]
____
    print(c.value)`,
    options: ["for c in purse:", "for c in Coin:", "for purse in c:", "if c in purse:"],
    tests: [T([])],
    hints: ["Loop over the list of objects.", "Each time round, c is one Coin."],
    skills: ["object-list"], tags: ["loop"],
    explainer: "purse is a list of Coin objects, so the loop takes each object in turn and prints its value attribute." },
  { id: "cls-P7a", level: 7, type: "trace", title: "Trace two boxes",
    description: "Trace the program. Each Box has its own items attribute.",
    solution: `class Box:
    def __init__(self, items):
        self.items = items

a = Box(3)
b = Box(a.items + 4)
a.items = b.items * 2
print(a.items, b.items)`, tests: [T([])],
    trace: { columns: ["a.items", "b.items"] },
    hints: ["b is made from a's items plus 4.", "Then a's items are changed."],
    skills: ["attribute", "class-vs-object"], tags: ["trace"],
    explainer: "a and b are separate Box objects, so each assignment to a.items or b.items changes only that one object's attribute." },
  { id: "cls-P7b", level: 7, type: "write", title: "Make a phone",
    description: "Add one line that makes a Phone object called p from the model and the battery level typed. The program then prints them, for example:\nX1 80",
    starter: `class Phone:
    def __init__(self, model, battery):
        self.model = model
        self.battery = battery

# Make a Phone object called p from the model and battery typed in

print(p.model, p.battery)`,
    solution: `class Phone:
    def __init__(self, model, battery):
        self.model = model
        self.battery = battery

p = Phone(input("Model: "), int(input("Battery: ")))

print(p.model, p.battery)`,
    tests: [T(["X1", "80"]), T(["Z5", "15"])],
    hints: ["Call the class with the two values.", "Use input() for the model and int(input()) for the battery."],
    skills: ["object", "init"], tags: ["write"],
    explainer: "Calling Phone with the two values typed makes a new object and passes them to __init__, which stores them as its attributes." },
  { id: "cls-P9a", level: 9, type: "write", title: "Count the legs",
    description: "Write a class Animal with name and legs attributes. Ask for two animals (a name, then a number of legs, for each), make an object for each, then print the total number of legs, for example:\nLegs: 10",
    solution: `class Animal:
    def __init__(self, name, legs):
        self.name = name
        self.legs = legs

a1 = Animal(input("Name: "), int(input("Legs: ")))
a2 = Animal(input("Name: "), int(input("Legs: ")))
print("Legs:", a1.legs + a2.legs)`,
    tests: [T(["spider", "8", "bird", "2"]), T(["ant", "6", "snake", "0"])],
    hints: ["__init__ stores name and legs with self.", "Add the two objects' legs attributes."],
    skills: ["class", "attribute"], tags: ["write"],
    explainer: "Each Animal object stores its own legs, so the total is the sum of the two objects' legs attributes." },
  { id: "cls-P9b", level: 9, type: "trace", title: "Trace two cups",
    description: "Trace the program. Each Cup has its own ml attribute.",
    solution: `class Cup:
    def __init__(self, ml):
        self.ml = ml

big = Cup(300)
small = Cup(120)
big.ml = big.ml - small.ml
small.ml = small.ml * 2
same = big.ml == small.ml
print(same)`, tests: [T([])],
    trace: { columns: ["big.ml", "small.ml", "same"] },
    hints: ["Each line changes one cup's ml.", "same is True or False."],
    skills: ["attribute", "class-vs-object"], tags: ["trace"],
    explainer: "Each line changes one Cup object's ml attribute, and same compares the two objects' values at the end." },
];

const COVERAGE = {
  "Defining a class and creating objects from it": ["cls-L1a", "cls-L3b", "cls-L5a", "cls-L7b", "cls-L8a", "cls-P5a", "cls-P7b"],
  "__init__, self, and storing attributes": ["cls-L1a", "cls-L2b", "cls-L3a", "cls-L4a", "cls-L5b", "cls-L7b", "cls-P9a"],
  "Several objects kept in a list": ["cls-L1c", "cls-L3c", "cls-L4b", "cls-L5c", "cls-L6a", "cls-L7c", "cls-L9a", "cls-L10a", "cls-P2b", "cls-P5b"],
  "Predicting an object's attribute after creation": ["cls-L1a", "cls-L2a", "cls-L2b", "cls-L6b", "cls-L7a", "cls-L9b", "cls-P2a", "cls-P7a"],
  "Telling the class from the object": ["cls-L1b", "cls-L2c", "cls-L4c", "cls-L6b", "cls-L8b", "cls-L10b", "cls-P9b"],
};

// Tasks that cast input() with int() say so (the casting sentence, tools/unit-tasks.js nameCasting).
nameCasting(PRACTICE.concat(PLACEMENT));

if (require.main === module) addUnit("oop-classes", PRACTICE, PLACEMENT);
module.exports = { PRACTICE, PLACEMENT, COVERAGE };
