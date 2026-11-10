// One-off (2026-11): the "Object-oriented programming: encapsulation" unit (id oop-encapsulation, A-level programming
// techniques), built with tools/unit-tasks.js. The A-level ladder, placement at levels 2, 5, 7 and 9 (no buggy
// variants), and an explainer on every task (see tools/add-recursion-unit.js). Setters check a value before storing
// it, as in the Validation unit (range, length, presence, format and "is it allowed" checks). COVERAGE lists each
// angle and the tasks that cover it.
"use strict";
const { T, addUnit, nameCasting } = require("./unit-tasks.js");

const PRACTICE = [
  // ---------- Level 1: predict ----------
  { id: "enc-L1a", level: 1, type: "predict", title: "A getter",
    description: "_code is a private attribute, read with a getter. What does the program print?",
    solution: `class Safe:
    def __init__(self, code):
        self._code = code

    def get_code(self):
        return self._code

s = Safe(4821)
print(s.get_code())`, tests: [T([])],
    wrongOutputs: ["_code", "None"],
    hints: ["The getter returns self._code.", "_code was set to the number passed in."],
    skills: ["getter", "private"], tags: ["getter"],
    explainer: "The getter get_code returns the value of the private attribute _code, which is how code outside the class should read it." },
  { id: "enc-L1b", level: 1, type: "predict", title: "A setter says no",
    description: "set_age checks the age before storing it. What does the program print?",
    solution: `class Person:
    def __init__(self, age):
        self._age = 0
        self.set_age(age)

    def set_age(self, age):
        if age >= 0:
            self._age = age

    def get_age(self):
        return self._age

p = Person(14)
p.set_age(-3)
print(p.get_age())`, tests: [T([])],
    wrongOutputs: ["0"],
    hints: ["__init__ uses the setter too.", "A negative age fails the check, so it isn't stored."],
    skills: ["setter-check", "setter"], tags: ["GETTER_BYPASSED"],
    buggy: [["GETTER_BYPASSED", `class Person:
    def __init__(self, age):
        self._age = 0
        self.set_age(age)

    def set_age(self, age):
        if age >= 0:
            self._age = age

    def get_age(self):
        return self._age

p = Person(14)
p._age = -3
print(p.get_age())`]],
    explainer: "set_age only stores an age that passes its check, so the value that fails it is refused and the old age is kept." },
  { id: "enc-L1c", level: 1, type: "predict", title: "Out of step",
    description: "The program changes _celsius directly instead of using set_celsius. What does it print?",
    solution: `class Temperature:
    def __init__(self, celsius):
        self._celsius = celsius
        self._fahrenheit = celsius * 9 // 5 + 32

    def set_celsius(self, c):
        self._celsius = c
        self._fahrenheit = c * 9 // 5 + 32

t = Temperature(10)
t._celsius = 30
print(t._celsius, t._fahrenheit)`, tests: [T([])],
    wrongOutputs: ["10 50"],
    hints: ["Only set_celsius updates _fahrenheit.", "Setting _celsius directly changes that one attribute."],
    skills: ["direct-change", "private"], tags: ["GETTER_BYPASSED"],
    buggy: [["GETTER_BYPASSED", `class Temperature:
    def __init__(self, celsius):
        self._celsius = celsius
        self._fahrenheit = celsius * 9 // 5 + 32

    def set_celsius(self, c):
        self._celsius = c
        self._fahrenheit = c * 9 // 5 + 32

t = Temperature(10)
t.set_celsius(30)
print(t._celsius, t._fahrenheit)`]],
    explainer: "Changing _celsius directly skips set_celsius, so the class never updates _fahrenheit and the two values no longer agree." },

  // ---------- Level 2: predict, spot the trap ----------
  { id: "enc-L2a", level: 2, type: "predict", title: "Volume control",
    description: "set_level only accepts levels from 0 to 10. What does the program print?",
    solution: `class Volume:
    def __init__(self):
        self._level = 5

    def set_level(self, n):
        if 0 <= n <= 10:
            self._level = n

    def get_level(self):
        return self._level

v = Volume()
v.set_level(8)
v.set_level(12)
v.set_level(v.get_level() + 1)
print(v.get_level())`, tests: [T([])],
    wrongOutputs: ["12", "6"],
    hints: ["The second call is refused.", "The third call adds 1 to the level that was really stored."],
    skills: ["setter-check", "getter"], tags: ["GETTER_BYPASSED"],
    buggy: [["GETTER_BYPASSED", `class Volume:
    def __init__(self):
        self._level = 5

    def set_level(self, n):
        if 0 <= n <= 10:
            self._level = n

    def get_level(self):
        return self._level

v = Volume()
v.set_level(8)
v._level = 12
v.set_level(v.get_level() + 1)
print(v.get_level())`]],
    explainer: "The setter refuses any level outside its range, so a value that fails the check leaves the level where it was." },
  { id: "enc-L2b", level: 2, type: "predict", title: "Only a sign",
    description: "_pin starts with an underscore. What does the program print?",
    solution: `class Card:
    def __init__(self, pin):
        self._pin = pin

c = Card(1234)
c._pin = 9999
print(c._pin)`, tests: [T([])],
    wrongOutputs: ["1234", "_pin"],
    hints: ["Python doesn't stop code outside the class from using _pin.", "The underscore is a message to other programmers."],
    skills: ["private", "direct-change"], tags: ["trap"],
    explainer: "The underscore in _pin is only a sign to other programmers that it is private, so Python still lets outside code change it." },
  { id: "enc-L2c", level: 2, type: "predict", title: "Set the width",
    description: "set_width refuses a width that isn't above 0. What does the program print?",
    solution: `class Rect:
    def __init__(self, w, h):
        self._w = w
        self._h = h

    def get_area(self):
        return self._w * self._h

    def set_width(self, w):
        if w > 0:
            self._w = w

r = Rect(3, 4)
r.set_width(0)
r.set_width(5)
print(r.get_area())`, tests: [T([])],
    wrongOutputs: ["12", "15"],
    hints: ["The first set_width is refused.", "The second is stored."],
    skills: ["setter-check", "getter"], tags: ["trap"],
    explainer: "set_width refuses a width that fails its check and accepts the next one, and get_area works the area out from what is stored." },

  // ---------- Level 3: fill in one blank ----------
  { id: "enc-L3a", level: 3, type: "fill", title: "Write the getter",
    description: "Fill in the blank so the getter returns the private name.",
    starter: `class Badge:
    def __init__(self, name):
        self._name = name

    def get_name(self):
        return ____

b = Badge(input("Name: "))
print("Badge for", b.get_name())`,
    answers: ["self._name"], tests: [T(["Ava"]), T(["Omar"])],
    hints: ["The attribute belongs to the object, self.", "Its name starts with an underscore."],
    skills: ["getter", "private"], tags: ["SELF_MISSING"],
    buggy: [["SELF_MISSING", `class Badge:
    def __init__(self, name):
        self._name = name

    def get_name(self):
        return _name

b = Badge(input("Name: "))
print("Badge for", b.get_name())`]],
    explainer: "The getter returns self._name, so code outside the class reads the private attribute through a method instead of directly." },
  { id: "enc-L3b", level: 3, type: "fill", title: "Check the lives",
    description: "Fill in the blank so set_lives stores any number of lives that is 0 or more, and refuses a negative number.",
    starter: `class Lives:
    def __init__(self):
        self._lives = 3

    def set_lives(self, n):
        if n ____ 0:
            self._lives = n

    def get_lives(self):
        return self._lives

g = Lives()
g.set_lives(int(input("Lives: ")))
print(g.get_lives())`,
    answers: [">="], tests: [T(["5"]), T(["-2"]), T(["0"])],
    hints: ["0 lives is allowed.", "The comparison means 'greater than or equal to'."],
    skills: ["setter-check"], tags: ["GT_VS_GTE"],
    buggy: [["GT_VS_GTE", `class Lives:
    def __init__(self):
        self._lives = 3

    def set_lives(self, n):
        if n > 0:
            self._lives = n

    def get_lives(self):
        return self._lives

g = Lives()
g.set_lives(int(input("Lives: ")))
print(g.get_lives())`]],
    explainer: "The setter only stores a number of lives that passes the check n >= 0, so a negative number is refused and the old value kept." },
  { id: "enc-L3c", level: 3, type: "fill", title: "Use the setter",
    description: "Fill in the blank so the points typed go through the setter, which refuses more than 100.",
    starter: `class Score:
    def __init__(self):
        self._points = 0

    def set_points(self, p):
        if p <= 100:
            self._points = p

    def get_points(self):
        return self._points

s = Score()
s.____(int(input("Points: ")))
print(s.get_points())`,
    answers: ["set_points"], tests: [T(["70"]), T(["150"])],
    hints: ["Call the method that checks the value.", "Its name starts with set_."],
    skills: ["setter", "direct-change"], tags: ["GETTER_BYPASSED"],
    buggy: [["GETTER_BYPASSED", `class Score:
    def __init__(self):
        self._points = 0

    def set_points(self, p):
        if p <= 100:
            self._points = p

    def get_points(self):
        return self._points

s = Score()
s._points = int(input("Points: "))
print(s.get_points())`]],
    explainer: "Calling set_points runs its check, so a score over 100 is refused, which setting _points directly would not do." },

  // ---------- Level 4: fill in two blanks ----------
  { id: "enc-L4a", level: 4, type: "fill", title: "A speed limit",
    description: "Fill in both blanks: the setter stores a speed from 0 to 70, and the getter gives it back.",
    starter: `class Speed:
    def __init__(self):
        self._mph = 0

    def set_mph(self, mph):
        if 0 <= mph <= 70:
            ____ = mph

    def get_mph(self):
        ____ self._mph

car = Speed()
car.set_mph(int(input("Speed: ")))
print(car.get_mph())`,
    answers: ["self._mph", "return"], tests: [T(["50"]), T(["90"])],
    hints: ["Store the speed in the private attribute.", "A getter gives its value back."],
    skills: ["setter", "getter"], tags: ["ATTRIBUTE_NOT_STORED", "RETURN_MISSING_NONE"],
    buggy: [["ATTRIBUTE_NOT_STORED", `class Speed:
    def __init__(self):
        self._mph = 0

    def set_mph(self, mph):
        if 0 <= mph <= 70:
            mph = mph

    def get_mph(self):
        return self._mph

car = Speed()
car.set_mph(int(input("Speed: ")))
print(car.get_mph())`],
      ["RETURN_MISSING_NONE", `class Speed:
    def __init__(self):
        self._mph = 0

    def set_mph(self, mph):
        if 0 <= mph <= 70:
            self._mph = mph

    def get_mph(self):
        self._mph

car = Speed()
car.set_mph(int(input("Speed: ")))
print(car.get_mph())`]],
    explainer: "The setter stores the speed in self._mph only if it passes the range check, and the getter returns whatever is stored there." },
  { id: "enc-L4b", level: 4, type: "fill", title: "A length check",
    description: "Fill in both blanks: set_username only stores a name of 3 to 10 characters, like a length check in Validation.",
    starter: `class Account:
    def __init__(self):
        self._username = "guest"

    def set_username(self, name):
        if ____(name) >= 3 ____ len(name) <= 10:
            self._username = name

    def get_username(self):
        return self._username

a = Account()
a.set_username(input("Username: "))
print(a.get_username())`,
    answers: ["len", "and"], tests: [T(["sam_k"]), T(["al"]), T(["averyverylongname"])],
    hints: ["One function gives the number of characters.", "Both parts of the check must be True."],
    skills: ["setter-check"], tags: ["AND_OR_CONFUSED"],
    buggy: [["AND_OR_CONFUSED", `class Account:
    def __init__(self):
        self._username = "guest"

    def set_username(self, name):
        if len(name) >= 3 or len(name) <= 10:
            self._username = name

    def get_username(self):
        return self._username

a = Account()
a.set_username(input("Username: "))
print(a.get_username())`]],
    explainer: "The setter is a length check, like the ones in Validation: it only stores a username of 3 to 10 characters and refuses the rest." },
  { id: "enc-L4c", level: 4, type: "fill", title: "Count the visits",
    description: "Fill in both blanks: only the class's own method changes the private _count.",
    starter: `class Visits:
    def __init__(self):
        self._count = 0

    def add(self):
        self._count = ____ + 1

    def get_count(self):
        return self._count

v = Visits()
for k in range(int(input("Visitors: "))):
    v.____()
print(v.get_count())`,
    answers: ["self._count", "add"], tests: [T(["4"]), T(["0"])],
    hints: ["The new count is the old count plus 1.", "Call the method that adds a visit."],
    skills: ["private", "getter"], tags: ["METHOD_NO_BRACKETS"],
    buggy: [["METHOD_NO_BRACKETS", `class Visits:
    def __init__(self):
        self._count = 0

    def add(self):
        self._count = self._count + 1

    def get_count(self):
        return self._count

v = Visits()
for k in range(int(input("Visitors: "))):
    v.add
print(v.get_count())`]],
    explainer: "Only the class's own method changes the private _count, so the rest of the program adds a visit by calling v.add()." },

  // ---------- Level 5: Parsons, or pick the missing line ----------
  { id: "enc-L5a", level: 5, type: "parsons", title: "A PIN setter",
    description: "Arrange the lines: set_pin only stores a new PIN of 4 digits, like a format check in Validation.\nOne line is not needed.",
    solution: `class Pin:
    def __init__(self):
        self._pin = "0000"
    def set_pin(self, new):
        if len(new) == 4 and new.isdigit():
            self._pin = new
    def get_pin(self):
        return self._pin
p = Pin()
p.set_pin(input("New PIN: "))
print(p.get_pin())`,
    distractors: ['p._pin = input("New PIN: ")'],
    tests: [T(["4821"]), T(["12a4"])],
    hints: ["The check goes inside set_pin, before the value is stored.", "Outside the class, use the setter, not _pin."],
    skills: ["setter-check", "setter"], tags: ["parsons"],
    explainer: "set_pin checks the new PIN's length and format before storing it, like a validation check, and get_pin reads the stored one." },
  { id: "enc-L5b", level: 5, type: "partial-parsons", title: "Marks out of 50",
    description: "set_mark should store any mark from 0 to 50, including 0 and 50, and refuse anything else. Pick the missing line.",
    starter: `class Mark:
    def __init__(self):
        self._mark = 0

    def set_mark(self, m):
        ____
            self._mark = m

    def get_mark(self):
        return self._mark

x = Mark()
x.set_mark(20)
x.set_mark(int(input("Mark: ")))
print(x.get_mark())`,
    options: ["if 0 <= m <= 50:", "if 0 < m <= 50:", "if m <= 50:", "if 0 <= m < 50:"], optionMisconceptions: { 3: "BOUNDARY_LT_VS_LTE" },
    tests: [T(["35"]), T(["0"]), T(["50"]), T(["-4"]), T(["60"])],
    hints: ["Both 0 and 50 are allowed.", "A negative mark must be refused too."],
    skills: ["setter-check"], tags: ["BOUNDARY_LT_VS_LTE"],
    explainer: "The setter's range check lets every mark from 0 to 50 through, including both ends, and refuses anything outside." },
  { id: "enc-L5c", level: 5, type: "partial-parsons", title: "Pay in safely",
    description: "Pick the missing line, so the amount typed is paid in and a negative amount is refused.",
    starter: `class Bank:
    def __init__(self):
        self._balance = 0

    def deposit(self, amount):
        if amount > 0:
            self._balance = self._balance + amount

    def get_balance(self):
        return self._balance

acc = Bank()
acc.deposit(50)
____
print(acc.get_balance())`,
    options: ['acc.deposit(int(input("Amount: ")))', 'acc._balance = acc._balance + int(input("Amount: "))', 'acc._balance = int(input("Amount: "))', 'acc.deposit = int(input("Amount: "))'],
    optionMisconceptions: { 1: "GETTER_BYPASSED" },
    tests: [T(["20"]), T(["-30"])],
    hints: ["deposit has the check in it.", "Changing _balance directly skips the check."],
    skills: ["direct-change", "setter"], tags: ["GETTER_BYPASSED"],
    explainer: "Paying in through deposit means its check runs, so a negative amount is refused, which changing _balance directly would let through." },

  // ---------- Level 6: Parsons with traps, or pick the missing line ----------
  { id: "enc-L6a", level: 6, type: "parsons", title: "Never below zero",
    description: "Arrange the lines: remove only takes items away if there are enough, so the stock never goes below 0.\nTwo lines are not needed.",
    solution: `class Stock:
    def __init__(self, qty):
        self._qty = qty
    def remove(self, n):
        if n <= self._qty:
            self._qty = self._qty - n
    def get_qty(self):
        return self._qty
s = Stock(int(input("Stock: ")))
s.remove(int(input("Sell: ")))
print(s.get_qty())`,
    distractors: ['s._qty = s._qty - int(input("Sell: "))', "if n < self._qty:"],
    tests: [T(["10", "4"]), T(["3", "5"]), T(["6", "6"])],
    hints: ["Selling exactly the stock left is allowed.", "Use the method, not _qty, outside the class."],
    skills: ["setter-check", "direct-change"], tags: ["stock"],
    explainer: "remove only takes items away when there are enough, so the stock can never go below 0 while the rest of the program uses the method." },
  { id: "enc-L6b", level: 6, type: "partial-parsons", title: "Read the litres",
    description: "Pick the missing line, so the program prints half of the tank's litres.",
    starter: `class Tank:
    def __init__(self, litres):
        self._litres = litres

    def get_litres(self):
        return self._litres

t = Tank(int(input("Litres: ")))
____
print("Half:", half)`,
    options: ["half = t.get_litres() // 2", "half = t.get_litres // 2", "half = Tank.get_litres() // 2", "half = get_litres() // 2"],
    optionMisconceptions: { 1: "METHOD_NO_BRACKETS" },
    tests: [T(["40"]), T(["9"])],
    hints: ["Read the private attribute through its getter.", "A method only runs with brackets."],
    skills: ["getter", "private"], tags: ["METHOD_NO_BRACKETS"],
    explainer: "The getter get_litres() is how code outside the class reads the private _litres, and it needs its brackets to run." },

  // ---------- Level 7: trace, or write a short line ----------
  { id: "enc-L7a", level: 7, type: "trace", title: "Trace the thermostat",
    description: "Trace the program. set_temp only stores temperatures from 10 to 25.",
    solution: `class Thermostat:
    def __init__(self):
        self._temp = 18

    def set_temp(self, t):
        if 10 <= t <= 25:
            self._temp = t

    def get_temp(self):
        return self._temp

th = Thermostat()
th.set_temp(22)
th.set_temp(30)
now = th.get_temp()
th.set_temp(now - 15)
th.set_temp(now - 5)
print(th.get_temp())`, tests: [T([])],
    trace: { columns: ["th._temp", "now"] },
    hints: ["A refused call changes nothing, so it gets no row.", "now is the temperature stored at that moment."],
    skills: ["setter-check", "getter"], tags: ["GETTER_BYPASSED"],
    buggy: [["GETTER_BYPASSED", `class Thermostat:
    def __init__(self):
        self._temp = 18

    def set_temp(self, t):
        if 10 <= t <= 25:
            self._temp = t

    def get_temp(self):
        return self._temp

th = Thermostat()
th.set_temp(22)
th._temp = 30
now = th.get_temp()
th.set_temp(now - 15)
th.set_temp(now - 5)
print(th.get_temp())`]],
    explainer: "set_temp only stores temperatures inside its range, so a value outside it leaves the stored _temp as it was." },
  { id: "enc-L7b", level: 7, type: "write", title: "Write a setter",
    description: "Write the setter set_age(self, age): it stores age in _age only if it is from 0 to 120. The program then prints the stored age.",
    starter: `class Age:
    def __init__(self):
        self._age = 0

    # Write set_age(self, age): store age only if it is from 0 to 120

    def get_age(self):
        return self._age

a = Age()
a.set_age(int(input("Age: ")))
print(a.get_age())`,
    solution: `class Age:
    def __init__(self):
        self._age = 0

    def set_age(self, age):
        if 0 <= age <= 120:
            self._age = age

    def get_age(self):
        return self._age

a = Age()
a.set_age(int(input("Age: ")))
print(a.get_age())`,
    tests: [T(["15"]), T(["120"]), T(["130"]), T(["-1"])],
    hints: ["Check the age with an if before storing it.", "120 itself is allowed."],
    skills: ["setter-check", "setter"], tags: ["BOUNDARY_LT_VS_LTE"],
    buggy: [["BOUNDARY_LT_VS_LTE", `class Age:
    def __init__(self):
        self._age = 0

    def set_age(self, age):
        if 0 <= age < 120:
            self._age = age

    def get_age(self):
        return self._age

a = Age()
a.set_age(int(input("Age: ")))
print(a.get_age())`]],
    explainer: "A setter with a range check stores the age only when it is from 0 to 120, so a wrong value can never get into the object." },
  { id: "enc-L7c", level: 7, type: "trace", title: "Trace a direct change",
    description: "Trace the program. One line changes _qty directly instead of using sell.",
    solution: `class Stock:
    def __init__(self, qty):
        self._qty = qty
        self._sold = 0

    def sell(self, n):
        if n <= self._qty:
            self._qty = self._qty - n
            self._sold = self._sold + n

shop = Stock(10)
shop.sell(4)
shop._qty = shop._qty - 3
shop.sell(5)
total = shop._qty + shop._sold
print(total)`, tests: [T([])],
    trace: { columns: ["shop._qty", "shop._sold", "total"] },
    hints: ["sell changes both _qty and _sold.", "The direct change only changes _qty."],
    skills: ["direct-change", "private"], tags: ["trace"],
    explainer: "Taking 3 off _qty directly skips sell, so _sold is never updated and the stock left plus the stock sold no longer adds up to the start." },

  // ---------- Level 8: trace, or write ----------
  { id: "enc-L8a", level: 8, type: "write", title: "A password setter",
    description: "Write a class Password with a private _password that starts as \"changeme\", a getter get_password(self), and a setter set_password(self, new) that stores new only if it is at least 8 characters long and is not all letters (new.isalpha() is False). Ask for two new passwords in turn, try to set each, and print the stored password after each try.",
    starter: "# Write the Password class, then try two new passwords",
    solution: `class Password:
    def __init__(self):
        self._password = "changeme"

    def set_password(self, new):
        if len(new) >= 8 and not new.isalpha():
            self._password = new

    def get_password(self):
        return self._password

p = Password()
for k in range(2):
    p.set_password(input("New password: "))
    print(p.get_password())`,
    tests: [T(["sunshine", "abcdef12"]), T(["abc12", "password12"])],
    hints: ["Both checks must pass, so join them with and.", "8 characters is long enough."],
    skills: ["setter-check", "getter", "private"], tags: ["AND_OR_CONFUSED", "GT_VS_GTE"],
    buggy: [["AND_OR_CONFUSED", `class Password:
    def __init__(self):
        self._password = "changeme"

    def set_password(self, new):
        if len(new) >= 8 or not new.isalpha():
            self._password = new

    def get_password(self):
        return self._password

p = Password()
for k in range(2):
    p.set_password(input("New password: "))
    print(p.get_password())`],
      ["GT_VS_GTE", `class Password:
    def __init__(self):
        self._password = "changeme"

    def set_password(self, new):
        if len(new) > 8 and not new.isalpha():
            self._password = new

    def get_password(self):
        return self._password

p = Password()
for k in range(2):
    p.set_password(input("New password: "))
    print(p.get_password())`]],
    explainer: "set_password only stores a password that passes both checks, so a weak one is refused and the old password stays." },
  { id: "enc-L8b", level: 8, type: "trace", title: "Trace the meter",
    description: "Trace the program. use adds units and works out the cost; one line resets _units directly.",
    solution: `class Meter:
    def __init__(self):
        self._units = 0
        self._cost = 0

    def use(self, n):
        if n > 0:
            self._units = self._units + n
            self._cost = self._units * 3

m = Meter()
m.use(5)
m.use(-2)
m.use(4)
m._units = 0
m.use(1)
bill = m._cost
print(bill)`, tests: [T([])],
    trace: { columns: ["m._units", "m._cost", "bill"] },
    hints: ["use refuses a negative number.", "After the direct reset, use works the cost out from the units again."],
    skills: ["direct-change", "setter-check"], tags: ["trace"],
    explainer: "Setting _units to 0 directly resets the units without the class knowing, so the next use works the cost out from 1 unit only." },

  // ---------- Level 9: write a full program, or a longer trace ----------
  { id: "enc-L9a", level: 9, type: "write", title: "Allowed grades",
    description: "Write a class Student with private _name and _grade attributes; _grade starts as \"U\". Add get_name(self), get_grade(self), and set_grade(self, g), which stores g only if it is one of \"A\", \"B\", \"C\", \"D\", \"E\" or \"U\" (use in). Read a name, then 3 grades in turn: set each, then print the name and the stored grade, for example:\nMia B",
    starter: "# Write the Student class, then try three grades",
    solution: `class Student:
    def __init__(self, name):
        self._name = name
        self._grade = "U"

    def set_grade(self, g):
        if g in ["A", "B", "C", "D", "E", "U"]:
            self._grade = g

    def get_grade(self):
        return self._grade

    def get_name(self):
        return self._name

s = Student(input("Name: "))
for k in range(3):
    s.set_grade(input("Grade: "))
    print(s.get_name(), s.get_grade())`,
    tests: [T(["Mia", "B", "Z", "A"]), T(["Leo", "F", "C", "U"])],
    hints: ["g in [...] is True only for an allowed grade.", "Outside the class, use the setter and the getters."],
    skills: ["setter-check", "getter", "private"], tags: ["IN_NOT_EQUALS", "GETTER_BYPASSED"],
    buggy: [["IN_NOT_EQUALS", `class Student:
    def __init__(self, name):
        self._name = name
        self._grade = "U"

    def set_grade(self, g):
        if g == ["A", "B", "C", "D", "E", "U"]:
            self._grade = g

    def get_grade(self):
        return self._grade

    def get_name(self):
        return self._name

s = Student(input("Name: "))
for k in range(3):
    s.set_grade(input("Grade: "))
    print(s.get_name(), s.get_grade())`],
      ["GETTER_BYPASSED", `class Student:
    def __init__(self, name):
        self._name = name
        self._grade = "U"

    def set_grade(self, g):
        if g in ["A", "B", "C", "D", "E", "U"]:
            self._grade = g

    def get_grade(self):
        return self._grade

    def get_name(self):
        return self._name

s = Student(input("Name: "))
for k in range(3):
    s._grade = input("Grade: ")
    print(s.get_name(), s.get_grade())`]],
    explainer: "set_grade checks each new grade against the list of allowed grades with in, so a grade that isn't allowed never gets stored." },
  { id: "enc-L9b", level: 9, type: "trace", title: "Trace the locker",
    description: "Trace the program. try_code allows only 3 tries, but one line resets _tries from outside.",
    solution: `class Locker:
    def __init__(self, code):
        self._code = code
        self._open = False
        self._tries = 0

    def try_code(self, guess):
        if self._tries < 3:
            self._tries = self._tries + 1
            if guess == self._code:
                self._open = True

box = Locker(482)
box.try_code(111)
box.try_code(482)
box._tries = 0
box.try_code(999)
print(box._open, box._tries)`, tests: [T([])],
    trace: { columns: ["box._open", "box._tries"] },
    hints: ["Each try within the limit adds 1 to _tries.", "The direct reset puts _tries back to 0."],
    skills: ["direct-change", "private"], tags: ["trace"],
    explainer: "Setting _tries back to 0 from outside the class gets round the limit on tries, which is the kind of change encapsulation is meant to stop." },

  // ---------- Level 10: write an extended program, or a longer trace ----------
  { id: "enc-L10a", level: 10, type: "write", title: "A safe bank account",
    description: "Write a class BankAccount with a private _balance that starts at 0, and methods deposit(self, amount) (only amounts above 0), withdraw(self, amount) (only if amount is above 0 and no more than the balance; return True if it worked and False if not) and get_balance(self). Read 4 transactions, each a letter (D to deposit, W to withdraw) then an amount. Print Refused when a withdrawal doesn't work, and the balance at the end, for example:\nRefused\nBalance: 30",
    starter: "# Write the BankAccount class, then read the transactions",
    solution: `class BankAccount:
    def __init__(self):
        self._balance = 0

    def deposit(self, amount):
        if amount > 0:
            self._balance = self._balance + amount

    def withdraw(self, amount):
        if 0 < amount <= self._balance:
            self._balance = self._balance - amount
            return True
        return False

    def get_balance(self):
        return self._balance

acc = BankAccount()
for k in range(4):
    kind = input("D or W: ")
    amount = int(input("Amount: "))
    if kind == "D":
        acc.deposit(amount)
    elif not acc.withdraw(amount):
        print("Refused")
print("Balance:", acc.get_balance())`,
    tests: [T(["D", "50", "W", "20", "W", "40", "D", "-5"]), T(["W", "10", "D", "25", "D", "10", "W", "35"])],
    hints: ["withdraw checks the amount against self._balance before taking it.", "Every change to the balance goes through deposit or withdraw."],
    skills: ["setter-check", "private", "getter"], tags: ["BOUNDARY_LT_VS_LTE", "GETTER_BYPASSED"],
    buggy: [["BOUNDARY_LT_VS_LTE", `class BankAccount:
    def __init__(self):
        self._balance = 0

    def deposit(self, amount):
        if amount > 0:
            self._balance = self._balance + amount

    def withdraw(self, amount):
        if 0 < amount < self._balance:
            self._balance = self._balance - amount
            return True
        return False

    def get_balance(self):
        return self._balance

acc = BankAccount()
for k in range(4):
    kind = input("D or W: ")
    amount = int(input("Amount: "))
    if kind == "D":
        acc.deposit(amount)
    elif not acc.withdraw(amount):
        print("Refused")
print("Balance:", acc.get_balance())`],
      ["GETTER_BYPASSED", `class BankAccount:
    def __init__(self):
        self._balance = 0

    def deposit(self, amount):
        if amount > 0:
            self._balance = self._balance + amount

    def withdraw(self, amount):
        if 0 < amount <= self._balance:
            self._balance = self._balance - amount
            return True
        return False

    def get_balance(self):
        return self._balance

acc = BankAccount()
for k in range(4):
    kind = input("D or W: ")
    amount = int(input("Amount: "))
    if kind == "D":
        acc._balance = acc._balance + amount
    else:
        acc._balance = acc._balance - amount
print("Balance:", acc.get_balance())`]],
    explainer: "Because every change to _balance goes through deposit or withdraw, their checks make sure the balance can never go below 0." },
  { id: "enc-L10b", level: 10, type: "trace", title: "Trace the battery",
    description: "Trace the program. set_charge only stores a charge from 0 to 100.",
    solution: `class Battery:
    def __init__(self):
        self._charge = 50

    def set_charge(self, c):
        if 0 <= c <= 100:
            self._charge = c

    def get_charge(self):
        return self._charge

b = Battery()
for use in [20, 45, 30]:
    b.set_charge(b.get_charge() - use)
b.set_charge(b.get_charge() + 90)
level = b.get_charge()
print(level)`, tests: [T([])],
    trace: { columns: ["use", "b._charge", "level"] },
    hints: ["A charge below 0 is refused, so nothing changes on that line.", "Each new charge is worked out from the charge stored at that moment."],
    skills: ["setter-check", "getter"], tags: ["trace"],
    explainer: "set_charge refuses any charge outside its range, so a use that would take the battery below empty is ignored." },
];

// Placement (levels 2, 5, 7 and 9): no buggy variants.
const PLACEMENT = [
  { id: "enc-P2a", level: 2, type: "predict", title: "Open the gate",
    description: "set_open checks the value it is given. What does the program print?",
    solution: `class Gate:
    def __init__(self):
        self._open = False

    def set_open(self, value):
        if value == True or value == False:
            self._open = value

    def is_open(self):
        return self._open

g = Gate()
g.set_open("yes")
print(g.is_open())`, tests: [T([])],
    wrongOutputs: ["True", "yes"],
    hints: ["Is the text \"yes\" equal to True?", "A value that fails the check isn't stored."],
    skills: ["setter-check", "getter"], tags: ["trap"],
    explainer: "set_open only accepts a value that passes its check, so text is refused and the stored value doesn't change." },
  { id: "enc-P2b", level: 2, type: "predict", title: "Stamp cost",
    description: "get_cost is a getter that works something out. What does the program print?",
    solution: `class Stamp:
    def __init__(self, cost):
        self._cost = cost

    def get_cost(self):
        return self._cost * 2

s = Stamp(35)
print(s.get_cost())`, tests: [T([])],
    wrongOutputs: ["35", "_cost", "3535"],
    hints: ["The getter doesn't just return _cost.", "It returns _cost times 2."],
    skills: ["getter", "private"], tags: ["getter"],
    explainer: "A getter returns whatever its method works out, here from the private _cost, so outside code never needs to read _cost itself." },
  { id: "enc-P5a", level: 5, type: "parsons", title: "A dial",
    description: "Arrange the lines: set_value only stores a value from 1 to 9.\nOne line is not needed.",
    solution: `class Dial:
    def __init__(self):
        self._value = 1
    def set_value(self, v):
        if 1 <= v <= 9:
            self._value = v
    def get_value(self):
        return self._value
d = Dial()
d.set_value(int(input("Value: ")))
print(d.get_value())`,
    distractors: ['d._value = int(input("Value: "))'],
    tests: [T(["7"]), T(["12"])],
    hints: ["The check goes inside the setter.", "Outside the class, use the setter."],
    skills: ["setter-check", "setter"], tags: ["parsons"],
    explainer: "set_value checks the new value before storing it in the private _value, and get_value reads it back." },
  { id: "enc-P5b", level: 5, type: "partial-parsons", title: "A presence check",
    description: "set_name should store the name typed only if it isn't empty. Pick the missing line.",
    starter: `class Name:
    def __init__(self):
        self._name = "unknown"

    def set_name(self, n):
        ____
            self._name = n

    def get_name(self):
        return self._name

x = Name()
x.set_name(input("Name: "))
print(x.get_name())`,
    options: ['if n != "":', 'if n == "":', 'if n != " ":', "if len(n) > 10:"],
    tests: [T(["Ava"]), T([""])],
    hints: ["Empty text is \"\".", "Store the name only when it is not empty."],
    skills: ["setter-check"], tags: ["presence"],
    explainer: "The setter is a presence check: it only stores a name that isn't empty, so an empty answer leaves the name as it was." },
  { id: "enc-P7a", level: 7, type: "trace", title: "Trace the volume",
    description: "Trace the program. change only applies a step that keeps the volume from 0 to 10.",
    solution: `class Volume:
    def __init__(self):
        self._v = 4

    def change(self, d):
        if 0 <= self._v + d <= 10:
            self._v = self._v + d

vol = Volume()
vol.change(5)
vol.change(3)
vol.change(-6)
print(vol._v)`, tests: [T([])],
    trace: { columns: ["vol._v"] },
    hints: ["4 + 5 is 9, which is allowed.", "9 + 3 is too high, so that call changes nothing."],
    skills: ["setter-check"], tags: ["trace"],
    explainer: "change only applies a step that keeps the volume inside its range, so a step that would go too high is ignored." },
  { id: "enc-P7b", level: 7, type: "write", title: "Write a getter",
    description: "Write get_price(self), which returns the private _price. The program then prints the price, for example:\nPrice: 12",
    starter: `class Ticket:
    def __init__(self, price):
        self._price = price

    # Write get_price(self), which returns the private _price

t = Ticket(int(input("Price: ")))
print("Price:", t.get_price())`,
    solution: `class Ticket:
    def __init__(self, price):
        self._price = price

    def get_price(self):
        return self._price

t = Ticket(int(input("Price: ")))
print("Price:", t.get_price())`,
    tests: [T(["12"]), T(["40"])],
    hints: ["def get_price(self): inside the class.", "Return self._price."],
    skills: ["getter", "private"], tags: ["write"],
    explainer: "get_price returns self._price, giving outside code a safe way to read the private attribute." },
  { id: "enc-P9a", level: 9, type: "write", title: "Scores from 0 to 10",
    description: "Write a class Score with a private _score that starts at 0, a setter set_score(self, s) that only stores s if it is from 0 to 10, and a getter get_score(self). Ask for three scores; set each, then print the stored score.",
    solution: `class Score:
    def __init__(self):
        self._score = 0

    def set_score(self, s):
        if 0 <= s <= 10:
            self._score = s

    def get_score(self):
        return self._score

sc = Score()
for k in range(3):
    sc.set_score(int(input("Score: ")))
    print(sc.get_score())`,
    tests: [T(["7", "11", "3"]), T(["-1", "10", "0"])],
    hints: ["Check s with an if before storing it.", "Print the score from the getter after each try."],
    skills: ["setter-check", "getter"], tags: ["write"],
    explainer: "The setter checks every score before storing it, so a score outside the range is refused and the last good score is kept." },
  { id: "enc-P9b", level: 9, type: "trace", title: "Trace a bus pass",
    description: "Trace the program. ride refuses once 5 rides have been used.",
    solution: `class Pass:
    def __init__(self):
        self._rides = 0

    def ride(self):
        if self._rides < 5:
            self._rides = self._rides + 1
            return True
        return False

p = Pass()
for k in range(3):
    ok = p.ride()
p._rides = 5
last = p.ride()
print(ok, last)`, tests: [T([])],
    trace: { columns: ["k", "p._rides", "ok", "last"] },
    hints: ["Each ride within the limit adds 1.", "After the direct change, the pass looks used up."],
    skills: ["direct-change", "private"], tags: ["trace"],
    explainer: "ride refuses once the limit is reached, and setting _rides directly from outside makes the class think the pass is used up." },
];

const COVERAGE = {
  "Marking an attribute as private with _name": ["enc-L1a", "enc-L1c", "enc-L2b", "enc-L3a", "enc-L4c", "enc-L6b", "enc-P2b", "enc-P7b"],
  "Getters and setters": ["enc-L1a", "enc-L2c", "enc-L3a", "enc-L3c", "enc-L4a", "enc-L6b", "enc-P7b"],
  "Setters that check values before storing them (as in Validation)": ["enc-L1b", "enc-L2a", "enc-L3b", "enc-L4b", "enc-L5a", "enc-L5b", "enc-L7a", "enc-L7b", "enc-L8a", "enc-L9a", "enc-P5a", "enc-P5b"],
  "Why changing an attribute directly can break a class": ["enc-L1c", "enc-L3c", "enc-L5c", "enc-L6a", "enc-L7c", "enc-L8b", "enc-L9b", "enc-L10a", "enc-P9b"],
};

// Tasks that cast input() with int() say so (the casting sentence, tools/unit-tasks.js nameCasting).
nameCasting(PRACTICE.concat(PLACEMENT));

if (require.main === module) addUnit("oop-encapsulation", PRACTICE, PLACEMENT);
module.exports = { PRACTICE, PLACEMENT, COVERAGE };
