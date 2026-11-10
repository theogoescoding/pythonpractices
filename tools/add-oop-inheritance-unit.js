// One-off (2026-11): the "Object-oriented programming: inheritance and polymorphism" unit (id oop-inheritance,
// A-level programming techniques), built with tools/unit-tasks.js. The A-level ladder, placement at levels 2, 5, 7
// and 9 (no buggy variants), and an explainer on every task (see tools/add-recursion-unit.js). COVERAGE lists each
// angle and the tasks that cover it.
"use strict";
const { T, addUnit, nameCasting } = require("./unit-tasks.js");

const PRACTICE = [
  // ---------- Level 1: predict ----------
  { id: "inh-L1a", level: 1, type: "predict", title: "A bird is an animal",
    description: "Bird is a subclass of Animal. What does the program print?",
    solution: `class Animal:
    def __init__(self, name):
        self.name = name

    def describe(self):
        return self.name + " is an animal"

class Bird(Animal):
    def fly(self):
        return self.name + " flies"

b = Bird("Kiwi")
print(b.describe())
print(b.fly())`, tests: [T([])],
    wrongOutputs: ["Kiwi flies", "Kiwi is an animal", "Kiwi is a bird\nKiwi flies"],
    hints: ["Bird has no __init__ or describe of its own.", "It uses the ones it inherits from Animal."],
    skills: ["inherit", "subclass"], tags: ["inherit"],
    explainer: "Bird has no describe or __init__ of its own, so it uses the ones it inherits from Animal, as well as its own fly method." },
  { id: "inh-L1b", level: 1, type: "predict", title: "Which name?",
    description: "Square overrides name. What does the program print?",
    solution: `class Shape:
    def name(self):
        return "shape"

class Square(Shape):
    def name(self):
        return "square"

s = Square()
t = Shape()
print(s.name(), t.name())`, tests: [T([])],
    wrongOutputs: ["square square", "shape square"],
    hints: ["s is a Square: its own class has a name method.", "t is a plain Shape."],
    skills: ["override"], tags: ["OVERRIDE_WRONG_VERSION"],
    buggy: [["OVERRIDE_WRONG_VERSION", `class Shape:
    def name(self):
        return "shape"

class Square(Shape):
    pass

s = Square()
t = Shape()
print(s.name(), t.name())`]],
    explainer: "Square defines its own name method, which overrides the one in Shape for Square objects, while a Shape object still uses the original." },
  { id: "inh-L1c", level: 1, type: "predict", title: "Animal sounds",
    description: "The same method is called on three different objects. What does the program print?",
    solution: `class Pet:
    def sound(self):
        return "..."

class Cat(Pet):
    def sound(self):
        return "Meow"

class Cow(Pet):
    def sound(self):
        return "Moo"

for p in [Cat(), Cow(), Pet()]:
    print(p.sound())`, tests: [T([])],
    wrongOutputs: ["Meow\nMoo\nMoo", "Meow\nMoo"],
    hints: ["Each object uses the sound method of its own class.", "A plain Pet uses Pet's version."],
    skills: ["polymorphism", "override"], tags: ["OVERRIDE_WRONG_VERSION"],
    buggy: [["OVERRIDE_WRONG_VERSION", `class Pet:
    def sound(self):
        return "..."

class Cat(Pet):
    pass

class Cow(Pet):
    pass

for p in [Cat(), Cow(), Pet()]:
    print(p.sound())`]],
    explainer: "Each object in the list uses the sound method of its own class, so the same call p.sound() gives a different result for each." },

  // ---------- Level 2: predict, spot the trap ----------
  { id: "inh-L2a", level: 2, type: "predict", title: "A bike's speed",
    description: "Bike calls super().__init__ and then sets speed. What does the program print?",
    solution: `class Vehicle:
    def __init__(self, wheels):
        self.wheels = wheels
        self.speed = 0

class Bike(Vehicle):
    def __init__(self):
        super().__init__(2)
        self.speed = 10

b = Bike()
print(b.wheels, b.speed)`, tests: [T([])],
    wrongOutputs: ["2 0", "0 10"],
    hints: ["super().__init__(2) runs Vehicle's __init__ first.", "Then Bike's next line runs."],
    skills: ["super", "inherit"], tags: ["trap"],
    explainer: "super().__init__(2) runs Vehicle's __init__ first, which sets both attributes, and then Bike's own line changes speed." },
  { id: "inh-L2b", level: 2, type: "predict", title: "Fees",
    description: "Student overrides fee; Premium doesn't. What does the program print?",
    solution: `class Account:
    def fee(self):
        return 5

class Student(Account):
    def fee(self):
        return super().fee() - 3

class Premium(Account):
    pass

print(Student().fee(), Premium().fee())`, tests: [T([])],
    wrongOutputs: ["2 2", "-3 5"],
    hints: ["super().fee() is Account's fee.", "Premium has no fee of its own."],
    skills: ["override", "inherit"], tags: ["OVERRIDE_WRONG_VERSION"],
    buggy: [["OVERRIDE_WRONG_VERSION", `class Account:
    def fee(self):
        return 5

class Student(Account):
    pass

class Premium(Account):
    pass

print(Student().fee(), Premium().fee())`]],
    explainer: "Student overrides fee but uses super().fee() to start from the parent's value, while Premium has no fee of its own so it inherits the parent's." },
  { id: "inh-L2c", level: 2, type: "predict", title: "Hello from a drone",
    description: "greet is inherited from Robot, but it calls self.kind(). What does the program print?",
    solution: `class Robot:
    def greet(self):
        return "Hello, I am " + self.kind()

    def kind(self):
        return "a robot"

class Drone(Robot):
    def kind(self):
        return "a drone"

d = Drone()
print(d.greet())`, tests: [T([])],
    wrongOutputs: ["Hello, I am a robota drone", "a drone"],
    hints: ["self is the Drone object, even inside an inherited method.", "self.kind() uses the version for the object's own class."],
    skills: ["override", "polymorphism"], tags: ["OVERRIDE_WRONG_VERSION"],
    buggy: [["OVERRIDE_WRONG_VERSION", `class Robot:
    def greet(self):
        return "Hello, I am " + self.kind()

    def kind(self):
        return "a robot"

class Drone(Robot):
    pass

d = Drone()
print(d.greet())`]],
    explainer: "greet is inherited, but self.kind() inside it still calls the version for the object's own class, which Drone has overridden." },

  // ---------- Level 3: fill in one blank ----------
  { id: "inh-L3a", level: 3, type: "fill", title: "Make a subclass",
    description: "Fill in the blank so Fish is a subclass of Animal, and gets a name from Animal's __init__.",
    starter: `class Animal:
    def __init__(self, name):
        self.name = name

class Fish(____):
    def swim(self):
        print(self.name, "swims")

f = Fish(input("Name: "))
f.swim()`,
    answers: ["Animal"], tests: [T(["Nemo"]), T(["Dory"])],
    hints: ["The parent class goes in the brackets.", "Fish then inherits everything Animal has."],
    skills: ["subclass", "inherit"], tags: ["subclass"],
    explainer: "Writing Animal in the brackets makes Fish a subclass, so it inherits Animal's __init__ and every Fish gets a name." },
  { id: "inh-L3b", level: 3, type: "fill", title: "Call the parent",
    description: "Fill in the blank so Teacher runs Person's __init__, which stores the name.",
    starter: `class Person:
    def __init__(self, name):
        self.name = name

class Teacher(Person):
    def __init__(self, name, subject):
        ____.__init__(name)
        self.subject = subject

t = Teacher(input("Name: "), input("Subject: "))
print(t.name, "teaches", t.subject)`,
    answers: ["super()"], tests: [T(["Mr Ali", "maths"]), T(["Ms Roe", "art"])],
    hints: ["The parent class's version is reached with one built-in function.", "It is followed by .__init__(name)."],
    skills: ["super"], tags: ["SUPER_NOT_CALLED"],
    buggy: [["SUPER_NOT_CALLED", `class Person:
    def __init__(self, name):
        self.name = name

class Teacher(Person):
    def __init__(self, name, subject):
        self.subject = subject

t = Teacher(input("Name: "), input("Subject: "))
print(t.name, "teaches", t.subject)`]],
    explainer: "super().__init__(name) runs Person's __init__, which stores the name, before Teacher stores its own subject." },
  { id: "inh-L3c", level: 3, type: "fill", title: "Override area",
    description: "Fill in the blank so Square overrides Shape's area method.",
    starter: `class Shape:
    def __init__(self, size):
        self.size = size

    def area(self):
        return 0

class Square(Shape):
    def ____(self):
        return self.size * self.size

s = Square(int(input("Side: ")))
print(s.area())`,
    answers: ["area"], tests: [T(["4"]), T(["9"])],
    hints: ["To override a method, use the same name.", "s.area() then runs Square's version."],
    skills: ["override"], tags: ["OVERRIDE_WRONG_VERSION"],
    buggy: [["OVERRIDE_WRONG_VERSION", `class Shape:
    def __init__(self, size):
        self.size = size

    def area(self):
        return 0

class Square(Shape):
    def square_area(self):
        return self.size * self.size

s = Square(int(input("Side: ")))
print(s.area())`]],
    explainer: "Giving Square its own area method overrides the one in Shape, so a Square object uses its own version." },

  // ---------- Level 4: fill in two blanks ----------
  { id: "inh-L4a", level: 4, type: "fill", title: "Pass them up",
    description: "Fill in both blanks so Food passes the name and price up to Item's __init__.",
    starter: `class Item:
    def __init__(self, name, price):
        self.name = name
        self.price = price

class Food(Item):
    def __init__(self, name, price, days):
        super().__init__(____, ____)
        self.days = days

f = Food(input("Food: "), int(input("Price: ")), int(input("Days: ")))
print(f.name, f.price, f.days)`,
    answers: ["name", "price"], tests: [T(["milk", "95", "5"]), T(["rice", "120", "300"])],
    hints: ["Item's __init__ needs a name and a price.", "Pass on the values Food was given."],
    skills: ["super"], tags: ["SUPER_NOT_CALLED"],
    buggy: [["SUPER_NOT_CALLED", `class Item:
    def __init__(self, name, price):
        self.name = name
        self.price = price

class Food(Item):
    def __init__(self, name, price, days):
        self.days = days

f = Food(input("Food: "), int(input("Price: ")), int(input("Days: ")))
print(f.name, f.price, f.days)`]],
    explainer: "Food passes name and price up to Item's __init__ through super(), and stores only its own extra attribute, days." },
  { id: "inh-L4b", level: 4, type: "fill", title: "Add up the areas",
    description: "Fill in both blanks so the loop adds up the area of every shape and prints the total.",
    starter: `class Shape:
    def area(self):
        return 0

class Rect(Shape):
    def __init__(self, w, h):
        self.w = w
        self.h = h

    def area(self):
        return self.w * self.h

class Tri(Shape):
    def __init__(self, b, h):
        self.b = b
        self.h = h

    def area(self):
        return self.b * self.h // 2

shapes = [Rect(3, 4), Tri(6, 5), Rect(2, 2)]
total = 0
for s in shapes:
    total = total + s.____()
print(____)`,
    answers: ["area", "total"], tests: [T([])],
    hints: ["Every shape has a method with the same name.", "Print the running total."],
    skills: ["polymorphism"], tags: ["OVERRIDE_WRONG_VERSION"],
    buggy: [["OVERRIDE_WRONG_VERSION", `class Shape:
    def area(self):
        return 0

class Rect(Shape):
    def __init__(self, w, h):
        self.w = w
        self.h = h

    def area(self):
        return self.w * self.h

class Tri(Shape):
    def __init__(self, b, h):
        self.b = b
        self.h = h

    def tri_area(self):
        return self.b * self.h // 2

shapes = [Rect(3, 4), Tri(6, 5), Rect(2, 2)]
total = 0
for s in shapes:
    total = total + s.area()
print(total)`]],
    explainer: "Every object in the list has an area method, so the loop can call s.area() on each and get the right version for its class." },
  { id: "inh-L4c", level: 4, type: "fill", title: "Child tickets",
    description: "Fill in both blanks: a child ticket costs half the price, and the program prints both costs.",
    starter: `class Ticket:
    def __init__(self, price):
        self.price = price

    def cost(self):
        return self.price

class ChildTicket(Ticket):
    def cost(self):
        return ____ // 2

t1 = Ticket(int(input("Price: ")))
t2 = ChildTicket(t1.price)
print(t1.____(), t2.cost())`,
    answers: ["self.price", "cost"], tests: [T(["12"]), T(["7"])],
    hints: ["ChildTicket inherits the price attribute.", "Call the same method on t1."],
    skills: ["override", "inherit"], tags: ["OVERRIDE_WRONG_VERSION"],
    buggy: [["OVERRIDE_WRONG_VERSION", `class Ticket:
    def __init__(self, price):
        self.price = price

    def cost(self):
        return self.price

class ChildTicket(Ticket):
    pass

t1 = Ticket(int(input("Price: ")))
t2 = ChildTicket(t1.price)
print(t1.cost(), t2.cost())`]],
    explainer: "ChildTicket inherits price from Ticket but overrides cost, so the same call gives half the price for a child ticket." },

  // ---------- Level 5: Parsons, or pick the missing line ----------
  { id: "inh-L5a", level: 5, type: "parsons", title: "A dog speaks",
    description: "Arrange the lines: Dog is a subclass of Animal and overrides speak.\nOne line is not needed.",
    solution: `class Animal:
    def __init__(self, name):
        self.name = name
    def speak(self):
        return "..."
class Dog(Animal):
    def speak(self):
        return "Woof"
d = Dog(input("Name: "))
print(d.name, "says", d.speak())`,
    distractors: ["class Dog:"],
    tests: [T(["Rex"]), T(["Bo"])],
    hints: ["The parent class goes in the brackets after Dog.", "Dog's speak replaces Animal's for dogs."],
    skills: ["subclass", "override"], tags: ["parsons"],
    explainer: "Dog(Animal) inherits Animal's __init__, so it gets a name, and its own speak overrides the parent's." },
  { id: "inh-L5b", level: 5, type: "partial-parsons", title: "A savings account",
    description: "Pick the missing line, so a Savings account gets an owner and a balance from Account.",
    starter: `class Account:
    def __init__(self, owner):
        self.owner = owner
        self.balance = 0

class Savings(Account):
    def __init__(self, owner, rate):
        ____
        self.rate = rate

s = Savings(input("Owner: "), int(input("Rate: ")))
print(s.owner, s.balance, s.rate)`,
    options: ["super().__init__(owner)", "Account(owner)", "self.owner = owner", "super().__init__(owner, rate)"], optionMisconceptions: { 1: "SUPER_NOT_CALLED" },
    tests: [T(["Ava", "3"]), T(["Kai", "5"])],
    hints: ["Account's __init__ sets up the owner and the balance.", "Run it for this object."],
    skills: ["super"], tags: ["SUPER_NOT_CALLED"],
    explainer: "super().__init__(owner) runs Account's __init__ for this object, which stores the owner and sets the balance to 0." },
  { id: "inh-L5c", level: 5, type: "partial-parsons", title: "Pay everyone",
    description: "Pick the missing line, so the program adds up everyone's pay. A Manager is paid more.",
    starter: `class Worker:
    def __init__(self, name):
        self.name = name

    def pay(self):
        return 100

class Manager(Worker):
    def pay(self):
        return 250

staff = [Worker("Ava"), Manager("Ben"), Worker("Cal")]
total = 0
for person in staff:
    ____
print("Total pay:", total)`,
    options: ["total = total + person.pay()", "total = total + Worker.pay(person)", "total = total + person.pay", "total = person.pay()"],
    optionMisconceptions: { 1: "OVERRIDE_WRONG_VERSION" },
    tests: [T([])],
    hints: ["person.pay() uses the version for each person's own class.", "Add each pay to the running total."],
    skills: ["polymorphism", "override"], tags: ["OVERRIDE_WRONG_VERSION"],
    explainer: "person.pay() runs the pay method of each object's own class, so the Manager's override is used for the manager only." },

  // ---------- Level 6: Parsons with traps, or pick the missing line ----------
  { id: "inh-L6a", level: 6, type: "parsons", title: "A circle is a shape",
    description: "Arrange the lines: Circle calls Shape's __init__ for the colour, then stores its own radius.\nTwo lines are not needed.",
    solution: `class Shape:
    def __init__(self, colour):
        self.colour = colour
class Circle(Shape):
    def __init__(self, colour, radius):
        super().__init__(colour)
        self.radius = radius
c = Circle(input("Colour: "), int(input("Radius: ")))
print(c.colour, c.radius * 2)`,
    distractors: ["Shape.__init__(colour)", "super().__init__(colour, radius)"],
    tests: [T(["red", "4"]), T(["blue", "9"])],
    hints: ["Shape's __init__ takes only a colour.", "Call it with super()."],
    skills: ["super", "subclass"], tags: ["parsons"],
    explainer: "Circle's __init__ calls super().__init__(colour) so the Shape part of the object is set up, then adds its own radius." },
  { id: "inh-L6b", level: 6, type: "partial-parsons", title: "Shout it",
    description: "Pick the missing line, so a Shout object shows its text in capitals with a !",
    starter: `class Message:
    def __init__(self, text):
        self.text = text

    def show(self):
        return self.text

class Shout(Message):
    ____
        return self.text.upper() + "!"

m = Shout(input("Text: "))
print(m.show())`,
    options: ["def show(self):", "def shout(self):", "def show():", "def show(self, text):"], optionMisconceptions: { 1: "OVERRIDE_WRONG_VERSION", 2: "SELF_MISSING" },
    tests: [T(["hello"]), T(["go"])],
    hints: ["The program calls m.show().", "To override a method, use the same name and parameters."],
    skills: ["override"], tags: ["OVERRIDE_WRONG_VERSION"],
    explainer: "A method in Shout with the same name, show, overrides Message's version, so Shout objects use it instead." },

  // ---------- Level 7: trace, or write a short line ----------
  { id: "inh-L7a", level: 7, type: "trace", title: "Trace the tiles",
    description: "Trace the program. Bonus tiles override score.",
    solution: `class Tile:
    def __init__(self):
        self.points = 1

    def score(self):
        return self.points

class Bonus(Tile):
    def score(self):
        return self.points * 3

total = 0
for t in [Tile(), Bonus(), Tile(), Bonus()]:
    total = total + t.score()
print(total)`, tests: [T([])],
    trace: { columns: ["total"] },
    hints: ["t.score() runs the version for the tile's own class.", "A Bonus tile scores 3 times its points."],
    skills: ["polymorphism", "override"], tags: ["OVERRIDE_WRONG_VERSION"],
    buggy: [["OVERRIDE_WRONG_VERSION", `class Tile:
    def __init__(self):
        self.points = 1

    def score(self):
        return self.points

class Bonus(Tile):
    pass

total = 0
for t in [Tile(), Bonus(), Tile(), Bonus()]:
    total = total + t.score()
print(total)`]],
    explainer: "Each t is a different kind of tile, and t.score() runs the version for its own class, so the bonus tiles add three times as much." },
  { id: "inh-L7b", level: 7, type: "write", title: "Call super",
    description: "Hamster's __init__ should also store the name. Add the line that calls the parent's __init__. The program should print, for example:\nNibbles has a red wheel",
    starter: `class Pet:
    def __init__(self, name):
        self.name = name

class Hamster(Pet):
    def __init__(self, name, wheel):
        # Call the parent's __init__ here, so the name is stored
        self.wheel = wheel

h = Hamster(input("Name: "), input("Wheel colour: "))
print(h.name, "has a", h.wheel, "wheel")`,
    solution: `class Pet:
    def __init__(self, name):
        self.name = name

class Hamster(Pet):
    def __init__(self, name, wheel):
        super().__init__(name)
        self.wheel = wheel

h = Hamster(input("Name: "), input("Wheel colour: "))
print(h.name, "has a", h.wheel, "wheel")`,
    tests: [T(["Nibbles", "red"]), T(["Pip", "blue"])],
    hints: ["Use super() to reach the parent class.", "Pass it the name."],
    skills: ["super"], tags: ["SUPER_NOT_CALLED"],
    buggy: [["SUPER_NOT_CALLED", `class Pet:
    def __init__(self, name):
        self.name = name

class Hamster(Pet):
    def __init__(self, name, wheel):
        self.wheel = wheel

h = Hamster(input("Name: "), input("Wheel colour: "))
print(h.name, "has a", h.wheel, "wheel")`]],
    explainer: "super().__init__(name) runs Pet's __init__ for the hamster, so its name is stored as well as its own wheel." },
  { id: "inh-L7c", level: 7, type: "trace", title: "Trace a doubler",
    description: "Trace the program. Doubler inherits __init__ but overrides step.",
    solution: `class Counter:
    def __init__(self, start):
        self.value = start

    def step(self):
        self.value = self.value + 1

class Doubler(Counter):
    def step(self):
        self.value = self.value * 2

a = Counter(3)
b = Doubler(3)
a.step()
b.step()
b.step()
a.step()
print(a.value, b.value)`, tests: [T([])],
    trace: { columns: ["a.value", "b.value"] },
    hints: ["Both start at 3.", "b uses Doubler's step; a uses Counter's."],
    skills: ["override", "inherit"], tags: ["OVERRIDE_WRONG_VERSION"],
    buggy: [["OVERRIDE_WRONG_VERSION", `class Counter:
    def __init__(self, start):
        self.value = start

    def step(self):
        self.value = self.value + 1

class Doubler(Counter):
    pass

a = Counter(3)
b = Doubler(3)
a.step()
b.step()
b.step()
a.step()
print(a.value, b.value)`]],
    explainer: "Doubler inherits __init__ but overrides step, so b doubles its value while a, a plain Counter, adds 1." },

  // ---------- Level 8: trace, or write ----------
  { id: "inh-L8a", level: 8, type: "write", title: "A manager's pay",
    description: "Employee is made for you. Write a subclass Manager whose __init__ takes name, salary and bonus, calls super().__init__(name, salary) and stores bonus. Override yearly(self) to return the salary plus the bonus. Ask for a name, a salary and a bonus, make a Manager, and print, for example:\nSam earns 42000",
    starter: `class Employee:
    def __init__(self, name, salary):
        self.name = name
        self.salary = salary

    def yearly(self):
        return self.salary

# Write the Manager class here, then use it`,
    solution: `class Employee:
    def __init__(self, name, salary):
        self.name = name
        self.salary = salary

    def yearly(self):
        return self.salary

class Manager(Employee):
    def __init__(self, name, salary, bonus):
        super().__init__(name, salary)
        self.bonus = bonus

    def yearly(self):
        return self.salary + self.bonus

m = Manager(input("Name: "), int(input("Salary: ")), int(input("Bonus: ")))
print(m.name, "earns", m.yearly())`,
    tests: [T(["Sam", "40000", "2000"]), T(["Lin", "35000", "0"])],
    hints: ["class Manager(Employee): then an __init__ that calls super().__init__(name, salary).", "yearly in Manager uses self.salary and self.bonus."],
    skills: ["super", "override", "subclass"], tags: ["SUPER_NOT_CALLED", "OVERRIDE_WRONG_VERSION"],
    buggy: [["SUPER_NOT_CALLED", `class Employee:
    def __init__(self, name, salary):
        self.name = name
        self.salary = salary

    def yearly(self):
        return self.salary

class Manager(Employee):
    def __init__(self, name, salary, bonus):
        self.bonus = bonus

    def yearly(self):
        return self.salary + self.bonus

m = Manager(input("Name: "), int(input("Salary: ")), int(input("Bonus: ")))
print(m.name, "earns", m.yearly())`],
      ["OVERRIDE_WRONG_VERSION", `class Employee:
    def __init__(self, name, salary):
        self.name = name
        self.salary = salary

    def yearly(self):
        return self.salary

class Manager(Employee):
    def __init__(self, name, salary, bonus):
        super().__init__(name, salary)
        self.bonus = bonus

m = Manager(input("Name: "), int(input("Salary: ")), int(input("Bonus: ")))
print(m.name, "earns", m.yearly())`]],
    explainer: "Manager gets name and salary through super().__init__, and its own yearly overrides Employee's to add the bonus." },
  { id: "inh-L8b", level: 8, type: "trace", title: "Trace the ticket prices",
    description: "Trace the program. Each kind of ticket has its own cost method.",
    solution: `class Ticket:
    def __init__(self, price):
        self.price = price

    def cost(self):
        return self.price

class Child(Ticket):
    def cost(self):
        return self.price // 2

class Senior(Ticket):
    def cost(self):
        return self.price - 3

total = 0
for t in [Ticket(10), Child(10), Senior(10), Child(8)]:
    total = total + t.cost()
print(total)`, tests: [T([])],
    trace: { columns: ["t.price", "total"] },
    hints: ["t.price only gets a value in a row when it changes.", "Each t.cost() uses the version for that ticket's own class."],
    skills: ["polymorphism", "override"], tags: ["trace"],
    explainer: "Each ticket object uses the cost method of its own class, so the same call t.cost() gives a different price for each kind." },

  // ---------- Level 9: write a full program, or a longer trace ----------
  { id: "inh-L9a", level: 9, type: "write", title: "Total area",
    description: "Write a class Shape whose area(self) returns 0, and two subclasses that override area: Rectangle(width, height) and Triangle(base, height), using base * height // 2. Read 3 shapes: a letter (R or T), then two numbers, for each. Make the right object for each and put them in a list, then print the total area, for example:\nTotal area: 37",
    starter: "# Write Shape, Rectangle and Triangle, then read the shapes",
    solution: `class Shape:
    def area(self):
        return 0

class Rectangle(Shape):
    def __init__(self, width, height):
        self.width = width
        self.height = height

    def area(self):
        return self.width * self.height

class Triangle(Shape):
    def __init__(self, base, height):
        self.base = base
        self.height = height

    def area(self):
        return self.base * self.height // 2

shapes = []
for k in range(3):
    kind = input("R or T: ")
    a = int(input("First number: "))
    b = int(input("Second number: "))
    if kind == "R":
        shapes.append(Rectangle(a, b))
    else:
        shapes.append(Triangle(a, b))
total = 0
for s in shapes:
    total = total + s.area()
print("Total area:", total)`,
    tests: [T(["R", "3", "4", "T", "6", "5", "R", "2", "5"]), T(["T", "4", "3", "T", "5", "2", "R", "1", "1"])],
    hints: ["Each subclass has its own area method with the same name.", "The last loop calls s.area() on every shape without checking its kind."],
    skills: ["polymorphism", "override", "subclass"], tags: ["OVERRIDE_WRONG_VERSION"],
    buggy: [["OVERRIDE_WRONG_VERSION", `class Shape:
    def area(self):
        return 0

class Rectangle(Shape):
    def __init__(self, width, height):
        self.width = width
        self.height = height

    def area(self):
        return self.width * self.height

class Triangle(Shape):
    def __init__(self, base, height):
        self.base = base
        self.height = height

    def tri_area(self):
        return self.base * self.height // 2

shapes = []
for k in range(3):
    kind = input("R or T: ")
    a = int(input("First number: "))
    b = int(input("Second number: "))
    if kind == "R":
        shapes.append(Rectangle(a, b))
    else:
        shapes.append(Triangle(a, b))
total = 0
for s in shapes:
    total = total + s.area()
print("Total area:", total)`]],
    explainer: "Each shape overrides area for its own kind, so the loop can call s.area() on every object without checking which class it is." },
  { id: "inh-L9b", level: 9, type: "trace", title: "Trace a dimmer",
    description: "Trace the program. Dimmer's switch calls the parent's switch, then does more.",
    solution: `class Light:
    def __init__(self, watts):
        self.watts = watts
        self.on = False

    def switch(self):
        self.on = not self.on

class Dimmer(Light):
    def __init__(self, watts):
        super().__init__(watts)
        self.level = 100

    def switch(self):
        super().switch()
        self.level = self.level // 2

a = Light(60)
b = Dimmer(40)
a.switch()
b.switch()
b.switch()
used = b.level
print(a.on, b.on, used)`, tests: [T([])],
    trace: { columns: ["a.on", "b.on", "b.level", "used"] },
    hints: ["Making b runs Light's __init__ through super(), then sets level.", "Each b.switch() changes on and halves level."],
    skills: ["super", "override"], tags: ["trace"],
    explainer: "Dimmer's switch calls super().switch() to run the Light version first, then does its own extra step, so b changes both on and level." },

  // ---------- Level 10: write an extended program, or a longer trace ----------
  { id: "inh-L10a", level: 10, type: "write", title: "Savings interest",
    description: "Write a class Account with an owner, a balance that starts at 0, deposit(self, amount), and monthly(self), which does nothing (use pass). Write a subclass Savings that also stores a rate (calling super().__init__) and overrides monthly to add balance * rate // 100 to the balance. Make an Account and a Savings from the names typed (and a rate for the savings), pay an amount typed into each, then run monthly() on both for 2 months and print each owner and balance, for example:\nAva 500\nBen 520",
    starter: "# Write Account and Savings, then use them",
    solution: `class Account:
    def __init__(self, owner):
        self.owner = owner
        self.balance = 0

    def deposit(self, amount):
        self.balance = self.balance + amount

    def monthly(self):
        pass

class Savings(Account):
    def __init__(self, owner, rate):
        super().__init__(owner)
        self.rate = rate

    def monthly(self):
        self.balance = self.balance + self.balance * self.rate // 100

plain = Account(input("Account owner: "))
saver = Savings(input("Savings owner: "), int(input("Rate: ")))
plain.deposit(int(input("Pay into the account: ")))
saver.deposit(int(input("Pay into the savings: ")))
for month in range(2):
    for acc in [plain, saver]:
        acc.monthly()
print(plain.owner, plain.balance)
print(saver.owner, saver.balance)`,
    tests: [T(["Ava", "Ben", "2", "500", "500"]), T(["Kai", "Zoe", "10", "100", "1000"])],
    hints: ["Savings calls super().__init__(owner) and then stores its rate.", "The loop calls acc.monthly() on both accounts: each uses its own class's version."],
    skills: ["super", "override", "polymorphism"], tags: ["SUPER_NOT_CALLED", "OVERRIDE_WRONG_VERSION"],
    buggy: [["SUPER_NOT_CALLED", `class Account:
    def __init__(self, owner):
        self.owner = owner
        self.balance = 0

    def deposit(self, amount):
        self.balance = self.balance + amount

    def monthly(self):
        pass

class Savings(Account):
    def __init__(self, owner, rate):
        self.rate = rate

    def monthly(self):
        self.balance = self.balance + self.balance * self.rate // 100

plain = Account(input("Account owner: "))
saver = Savings(input("Savings owner: "), int(input("Rate: ")))
plain.deposit(int(input("Pay into the account: ")))
saver.deposit(int(input("Pay into the savings: ")))
for month in range(2):
    for acc in [plain, saver]:
        acc.monthly()
print(plain.owner, plain.balance)
print(saver.owner, saver.balance)`],
      ["OVERRIDE_WRONG_VERSION", `class Account:
    def __init__(self, owner):
        self.owner = owner
        self.balance = 0

    def deposit(self, amount):
        self.balance = self.balance + amount

    def monthly(self):
        pass

class Savings(Account):
    def __init__(self, owner, rate):
        super().__init__(owner)
        self.rate = rate

    def add_interest(self):
        self.balance = self.balance + self.balance * self.rate // 100

plain = Account(input("Account owner: "))
saver = Savings(input("Savings owner: "), int(input("Rate: ")))
plain.deposit(int(input("Pay into the account: ")))
saver.deposit(int(input("Pay into the savings: ")))
for month in range(2):
    for acc in [plain, saver]:
        acc.monthly()
print(plain.owner, plain.balance)
print(saver.owner, saver.balance)`]],
    explainer: "Savings gets an owner and balance through super().__init__ and overrides monthly, so the same acc.monthly() call adds interest only to the savings account." },
  { id: "inh-L10b", level: 10, type: "trace", title: "Trace the battle",
    description: "Trace the program. Knight overrides hit; Archer inherits Unit's.",
    solution: `class Unit:
    def __init__(self, health):
        self.health = health

    def hit(self, power):
        self.health = self.health - power

class Knight(Unit):
    def hit(self, power):
        super().hit(power // 2)

class Archer(Unit):
    pass

k = Knight(40)
a = Archer(30)
for p in [10, 16, 6]:
    k.hit(p)
    a.hit(p)
print(k.health, a.health)`, tests: [T([])],
    trace: { columns: ["p", "k.health", "a.health"] },
    hints: ["The knight's hit passes only half the power to Unit's hit.", "The archer takes the full power."],
    skills: ["override", "inherit", "super"], tags: ["trace"],
    explainer: "Knight overrides hit to pass only half the power to the parent's version, while Archer has no hit of its own and inherits Unit's." },
];

// Placement (levels 2, 5, 7 and 9): no buggy variants.
const PLACEMENT = [
  { id: "inh-P2a", level: 2, type: "predict", title: "The boss's level",
    description: "Boss calls super().__init__() and then changes level. What does the program print?",
    solution: `class Base:
    def __init__(self):
        self.level = 1

    def info(self):
        return "Level " + str(self.level)

class Boss(Base):
    def __init__(self):
        super().__init__()
        self.level = self.level + 4

print(Boss().info())`, tests: [T([])],
    wrongOutputs: ["Level 1", "Level 4", "Level 14"],
    hints: ["Base's __init__ runs first and sets level to 1.", "Then Boss adds 4."],
    skills: ["super", "inherit"], tags: ["super"],
    explainer: "Boss runs Base's __init__ through super() first and then changes level, and it inherits info from Base." },
  { id: "inh-P2b", level: 2, type: "predict", title: "Drums and bells",
    description: "Drum overrides play; Bell doesn't. What does the program print?",
    solution: `class Note:
    def play(self):
        return "beep"

class Drum(Note):
    def play(self):
        return "boom"

class Bell(Note):
    pass

sounds = ""
for n in [Drum(), Bell(), Drum()]:
    sounds = sounds + n.play() + " "
print(sounds)`, tests: [T([])],
    wrongOutputs: ["boom boom boom", "beep beep beep", "boom bell boom"],
    hints: ["Bell has no play of its own.", "So a Bell uses Note's play."],
    skills: ["polymorphism", "override"], tags: ["polymorphism"],
    explainer: "Drum overrides play while Bell inherits Note's version, so each object in the list uses the play method its own class has." },
  { id: "inh-P5a", level: 5, type: "parsons", title: "A car is a vehicle",
    description: "Arrange the lines: Car calls Vehicle's __init__ with 4 wheels, then stores its own seats.\nOne line is not needed.",
    solution: `class Vehicle:
    def __init__(self, wheels):
        self.wheels = wheels
class Car(Vehicle):
    def __init__(self, seats):
        super().__init__(4)
        self.seats = seats
c = Car(int(input("Seats: ")))
print(c.wheels, c.seats)`,
    distractors: ["class Car:"],
    tests: [T(["5"]), T(["2"])],
    hints: ["Car is a subclass, so Vehicle goes in the brackets.", "super().__init__(4) sets up the wheels."],
    skills: ["super", "subclass"], tags: ["parsons"],
    explainer: "Car calls super().__init__(4) to set up its wheels through Vehicle, then stores its own seats." },
  { id: "inh-P5b", level: 5, type: "partial-parsons", title: "Penguins swim",
    description: "Pick the missing line, so a Penguin moves differently from other birds.",
    starter: `class Bird:
    def move(self):
        return "flies"

class Penguin(Bird):
    ____
        return "swims"

for b in [Bird(), Penguin()]:
    print(b.move())`,
    options: ["def move(self):", "def swim(self):", "def move():", "def fly(self):"],
    tests: [T([])],
    hints: ["The loop calls b.move().", "Override it with the same name."],
    skills: ["override"], tags: ["override"],
    explainer: "Penguin overrides move with its own version, so the same call gives a different answer for a Penguin object." },
  { id: "inh-P7a", level: 7, type: "trace", title: "Trace the boxes",
    description: "Trace the program. BigBox overrides grow.",
    solution: `class Box:
    def __init__(self, size):
        self.size = size

    def grow(self):
        self.size = self.size + 1

class BigBox(Box):
    def grow(self):
        self.size = self.size + 5

a = Box(2)
b = BigBox(2)
a.grow()
b.grow()
b.grow()
print(a.size + b.size)`, tests: [T([])],
    trace: { columns: ["a.size", "b.size"] },
    hints: ["Both boxes start with size 2.", "b uses BigBox's grow."],
    skills: ["override", "inherit"], tags: ["trace"],
    explainer: "BigBox overrides grow, so calling grow on b adds more than calling it on a plain Box." },
  { id: "inh-P7b", level: 7, type: "write", title: "Override sides",
    description: "Replace pass with a sides method in Triangle that overrides Shape's and returns 3. The program prints a triangle's sides, then a plain shape's.",
    starter: `class Shape:
    def sides(self):
        return 0

class Triangle(Shape):
    pass

t = Triangle()
s = Shape()
print(t.sides(), s.sides())`,
    solution: `class Shape:
    def sides(self):
        return 0

class Triangle(Shape):
    def sides(self):
        return 3

t = Triangle()
s = Shape()
print(t.sides(), s.sides())`,
    tests: [T([])],
    hints: ["Use the same name: def sides(self):", "Return 3."],
    skills: ["override"], tags: ["write"],
    explainer: "A sides method in Triangle overrides the one in Shape for triangles, while a plain Shape still uses the original." },
  { id: "inh-P9a", level: 9, type: "write", title: "Talking animals",
    description: "Write a class Animal with __init__(self, name) and speak(self), which returns the name followed by \" makes a sound\". Write subclasses Dog and Cow that override speak to return the name followed by \" says Woof\" or \" says Moo\". Read 3 animals: a letter (D, C or A), then a name, for each. Make the right object and print what it says, for example:\nRex says Woof",
    solution: `class Animal:
    def __init__(self, name):
        self.name = name

    def speak(self):
        return self.name + " makes a sound"

class Dog(Animal):
    def speak(self):
        return self.name + " says Woof"

class Cow(Animal):
    def speak(self):
        return self.name + " says Moo"

for k in range(3):
    kind = input("D, C or A: ")
    name = input("Name: ")
    if kind == "D":
        a = Dog(name)
    elif kind == "C":
        a = Cow(name)
    else:
        a = Animal(name)
    print(a.speak())`,
    tests: [T(["D", "Rex", "C", "Daisy", "A", "Sid"]), T(["C", "Bess", "C", "Moo", "D", "Fido"])],
    hints: ["Dog and Cow inherit __init__ from Animal.", "Each overrides speak with the same name."],
    skills: ["override", "polymorphism", "subclass"], tags: ["write"],
    explainer: "Each subclass overrides speak, so calling speak() on each object gives the message for its own class." },
  { id: "inh-P9b", level: 9, type: "trace", title: "Trace the coins",
    description: "Trace the program. Gold calls Coin's __init__, then makes its value bigger.",
    solution: `class Coin:
    def __init__(self):
        self.value = 1

    def double(self):
        self.value = self.value * 2

class Gold(Coin):
    def __init__(self):
        super().__init__()
        self.value = self.value * 10

g = Gold()
c = Coin()
g.double()
c.double()
total = g.value + c.value
print(total)`, tests: [T([])],
    trace: { columns: ["g.value", "c.value", "total"] },
    hints: ["Making g runs Coin's __init__ first, then multiplies by 10.", "Both inherit double."],
    skills: ["super", "inherit"], tags: ["trace"],
    explainer: "Gold runs Coin's __init__ through super() and then makes its value 10 times bigger, and it inherits double from Coin." },
];

const COVERAGE = {
  "Subclasses inheriting attributes and methods": ["inh-L1a", "inh-L2b", "inh-L3a", "inh-L4c", "inh-L5a", "inh-L7c", "inh-L10b", "inh-P2a", "inh-P9b"],
  "super() in a constructor": ["inh-L2a", "inh-L3b", "inh-L4a", "inh-L5b", "inh-L6a", "inh-L7b", "inh-L8a", "inh-L9b", "inh-L10a", "inh-P5a"],
  "Overriding a method and predicting which version runs": ["inh-L1b", "inh-L2b", "inh-L2c", "inh-L3c", "inh-L6b", "inh-L7c", "inh-L9b", "inh-P5b", "inh-P7a", "inh-P7b"],
  "One variable used for several kinds of object, calling the same method on each": ["inh-L1c", "inh-L4b", "inh-L5c", "inh-L7a", "inh-L8b", "inh-L9a", "inh-L10a", "inh-P2b", "inh-P9a"],
};

// Tasks that cast input() with int() say so (the casting sentence, tools/unit-tasks.js nameCasting).
nameCasting(PRACTICE.concat(PLACEMENT));

if (require.main === module) addUnit("oop-inheritance", PRACTICE, PLACEMENT);
module.exports = { PRACTICE, PLACEMENT, COVERAGE };
