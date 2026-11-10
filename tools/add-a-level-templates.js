// One-off (2026-11): hand-written templates for the A-level programming techniques units, checked by
// tools/hand-templates.js (20 seeds each).
//   - Combined (3 for each pair of units taught one after the other): merge-sort + recursion, recursion +
//     scope-parameters, scope-parameters + oop-classes, oop-classes + oop-methods, oop-methods + oop-encapsulation,
//     oop-encapsulation + oop-inheritance, oop-inheritance + debugging. Each uses a task type of its level in one of
//     its units, and a skill from each unit.
//   - Write-from-scratch (1 each) for the A-level units except Debugging (its write tasks start from a program with
//     bugs, so it has none: curriculum.js noScratch).
// Every template has an explainer, as the units' bank tasks do. Expected outputs are worked out here in JavaScript
// and checked by running Python.
"use strict";
const { addTemplates } = require("./hand-templates.js");

const SORTED = (v) => "pylist(" + v + ".slice().sort((x, y) => x - y))";
const UNSORTED = [[38, 27, 43, 3, 9, 82, 10], [5, 2, 4, 7, 1, 3, 6], [12, 4, 9, 1, 15, 7], [21, 8, 30, 14, 2, 17], [9, 3, 7, 5, 1], [40, 15, 25, 5, 35, 10, 20, 30]];
const MERGE = `def merge(left, right):
    out = []
    i = 0
    j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            out.append(left[i])
            i = i + 1
        else:
            out.append(right[j])
            j = j + 1
    return out + left[i:] + right[j:]`;
const NAMES = ["Ava", "Ben", "Sam", "Zara", "Ollie", "Priya", "Ali", "Mia", "Leo", "Noah"];

addTemplates([
  // ======================= Combined =======================
  // ---------- Merge sort + Recursion ----------
  { id: "comb-mer-rec-sort", units: ["merge-sort", "recursion"], source: "rec-L1c", level: 2, type: "predict", title: "A recursive merge sort",
    params: { lst: { choice: UNSORTED } },
    values: { shown: "pylist(lst)", half: "Math.floor(lst.length / 2)" },
    description: "This is merge sort written with recursion: merge_sort calls itself on each half until every part has one item, then merges the parts. What does it print?",
    solution: MERGE + `

def merge_sort(items):
    if len(items) <= 1:
        return items
    half = len(items) // 2
    return merge(merge_sort(items[:half]), merge_sort(items[half:]))

print(merge_sort({{shown}}))`,
    inputs: [], options: ["{{" + SORTED("lst") + "}}", "{{shown}}", "{{pylist(lst.slice().sort((x, y) => y - x))}}",
      "{{pylist(lst.slice(0, half).sort((x, y) => x - y).concat(lst.slice(half).sort((x, y) => x - y)))}}"], answer: 0, shuffleOptions: true,
    hints: ["Lists of one item are the base case: they are already sorted.", "Every merge puts two sorted lists together in order."],
    skills: ["merge-sort", "self-call"], tags: ["recursion"],
    explainer: "merge_sort keeps calling itself on smaller halves until the base case of one item, and each call merges its two sorted halves on the way back." },
  { id: "comb-mer-rec-calls", units: ["merge-sort", "recursion"], source: "rec-L2a", level: 1, type: "predict", title: "Count the splits",
    params: { n: { int: [3, 9] } },
    values: { shown: "pylist(Array.from({ length: n }, (_, i) => (i * 7) % 10 + 1))" },
    description: "split_all splits a list in half again and again, using recursion, and counts its calls. What does the program print?",
    solution: `calls = 0

def split_all(items):
    global calls
    calls = calls + 1
    if len(items) <= 1:
        return [items]
    half = len(items) // 2
    return split_all(items[:half]) + split_all(items[half:])

parts = split_all({{shown}})
print(len(parts), calls)`,
    inputs: [], options: ["{{n}} {{2 * n - 1}}", "{{n}} {{n}}", "{{n - 1}} {{2 * n - 1}}", "{{2 * n - 1}} {{n}}"], answer: 0, shuffleOptions: true,
    hints: ["The splitting ends with one part for each item.", "Every call that splits makes two more calls."],
    skills: ["split", "base-case"], tags: ["recursion"],
    explainer: "Each call that doesn't reach the base case splits its list and makes two more calls, so the parts end up one item each and the calls add up." },
  { id: "comb-mer-rec-merge", units: ["merge-sort", "recursion"], source: "rec-L3c", level: 3, type: "fill", title: "A recursive merge",
    params: { a: { choice: [[2, 9, 14], [1, 6, 11, 20], [3, 8, 15], [5, 12, 18, 25], [4, 7, 22]] }, b: { choice: [[3, 10, 16], [5, 13], [2, 9, 17, 21], [6, 11, 19], [1, 8, 30]] } },
    values: { sa: "pylist(a)", sb: "pylist(b)" },
    description: "merge joins two sorted lists using recursion: it takes the smaller front item and merges what is left. Fill in the blank.",
    starter: `def merge(left, right):
    if left == []:
        return right
    if right == []:
        return left
    if left[0] <= right[0]:
        return [left[0]] + merge(left[1:], right)
    return [right[0]] + merge(left, ____)

print(merge({{sa}}, {{sb}}))`,
    answers: ["right[1:]"],
    tests: [{ inputs: [], expected: "{{pylist(a.concat(b).sort((x, y) => x - y))}}" }],
    hints: ["right[0] has just been taken.", "Merge left with the rest of right."],
    skills: ["merge", "recursive-list"], tags: ["recursion"],
    explainer: "Each call takes the smaller front item and merges what is left of both lists, so the lists get shorter until one is empty, which is the base case." },

  // ---------- Recursion + Scope and parameters ----------
  { id: "comb-rec-scope-global", units: ["recursion", "scope-parameters"], source: "scope-L1b", level: 1, type: "predict", title: "Count the calls",
    params: { n: { int: [3, 9] } },
    description: "down calls itself and counts its calls in a global variable. What does the program print?",
    solution: `calls = 0

def down(n):
    global calls
    calls = calls + 1
    if n > 0:
        down(n - 1)

down({{n}})
print(calls)`,
    inputs: [], options: ["{{n + 1}}", "{{n}}", "{{n - 1}}", "1"], answer: 0, shuffleOptions: true,
    hints: ["The calls are down({{n}}), down({{n - 1}}), … down(0).", "Every call adds 1 to the same global calls."],
    skills: ["self-call", "global"], tags: ["recursion"],
    explainer: "Every call, including the last one with n == 0, adds 1 to the one global calls, because each call says global calls." },
  { id: "comb-rec-scope-local", units: ["recursion", "scope-parameters"], source: "scope-L1a", level: 2, type: "predict", title: "Two totals",
    params: { n: { int: [3, 8] } },
    values: { t: "n * (n + 1) / 2" },
    description: "add_up has its own local total in each call. What does the program print?",
    solution: `total = 0

def add_up(n):
    total = n
    if n > 1:
        total = total + add_up(n - 1)
    return total

result = add_up({{n}})
print(total, result)`,
    inputs: [], options: ["0 {{t}}", "{{t}} {{t}}", "0 {{n}}", "{{n}} {{t}}"], answer: 0, shuffleOptions: true,
    hints: ["total inside add_up is a local variable in each call.", "Only result gets the value returned."],
    skills: ["return-through", "local"], tags: ["scope"],
    explainer: "Each call has its own local total, so the global total is never changed, and the answer only comes out through the returned value." },
  { id: "comb-rec-scope-list", units: ["recursion", "scope-parameters"], source: "scope-L2a", level: 2, type: "predict", title: "Collect on the way down",
    params: { n: { int: [2, 4] }, k: { int: [2, 5] } },
    values: { down: "Array.from({ length: n }, (_, i) => (n - i) * k)" },
    description: "collect calls itself and appends to the same list each time. What does the program print?",
    solution: `def collect(n, out):
    if n == 0:
        return
    out.append(n * {{k}})
    collect(n - 1, out)

nums = []
collect({{n}}, nums)
print(nums)`,
    inputs: [], options: ["{{pylist(down)}}", "{{pylist(down.slice().reverse())}}", "[]", "{{pylist([n * k])}}"], answer: 0, shuffleOptions: true,
    hints: ["Every call is given the same list.", "Each call appends before it makes the next call."],
    skills: ["recursive-list", "pass-list"], tags: ["recursion"],
    explainer: "Every call is passed the same list, so each append is seen by the next call and by the main program, in the order the calls happen." },

  // ---------- Scope and parameters + Classes and objects ----------
  { id: "comb-scope-cls-alias", units: ["scope-parameters", "oop-classes"], source: "cls-L1b", level: 1, type: "predict", title: "Pass an object in",
    params: { a: { int: [20, 60] }, b: { int: [3, 15] } },
    description: "spend is given the Purse object mine. What does the program print?",
    solution: `class Purse:
    def __init__(self, coins):
        self.coins = coins

def spend(p, n):
    p.coins = p.coins - n

mine = Purse({{a}})
spend(mine, {{b}})
print(mine.coins)`,
    inputs: [], options: ["{{a - b}}", "{{a}}", "{{b}}", "{{a + b}}"], answer: 0, shuffleOptions: true,
    hints: ["p and mine are two names for the same object.", "Changing p.coins changes that object."],
    skills: ["mutable", "attribute"], tags: ["objects"],
    explainer: "An object passed to a function isn't copied, so changing p.coins inside spend changes the same object that mine names." },
  { id: "comb-scope-cls-rebind", units: ["scope-parameters", "oop-classes"], source: "scope-L2b", level: 2, type: "predict", title: "A new box inside",
    params: { x: { int: [2, 30] }, y: { int: [31, 60] } },
    description: "swap_box makes a new Box inside the function. What does the program print?",
    solution: `class Box:
    def __init__(self, size):
        self.size = size

def swap_box(b):
    b = Box({{x}})

box = Box({{y}})
swap_box(box)
print(box.size)`,
    inputs: [], options: ["{{y}}", "{{x}}", "{{x + y}}", "0"], answer: 0, shuffleOptions: true,
    hints: ["b = Box(...) only gives the local name b a new object.", "box still refers to the object it was given at the start."],
    skills: ["local", "object"], tags: ["scope"],
    explainer: "b = Box(...) only makes the function's local name b refer to a new object, so the object that box names is never changed." },
  { id: "comb-scope-cls-list", units: ["scope-parameters", "oop-classes"], source: "cls-L3c", level: 2, type: "predict", title: "Bonus for the team",
    params: { a: { int: [10, 40] }, b: { int: [41, 80] }, e: { int: [2, 9] } },
    description: "bonus is given the list team. What does the program print?",
    solution: `class Pupil:
    def __init__(self, name, score):
        self.name = name
        self.score = score

def bonus(group, extra):
    for p in group:
        p.score = p.score + extra

team = [Pupil("Ava", {{a}}), Pupil("Ben", {{b}})]
bonus(team, {{e}})
print(team[0].score, team[1].score)`,
    inputs: [], options: ["{{a + e}} {{b + e}}", "{{a}} {{b}}", "{{a + e}} {{b}}", "{{a}} {{b + e}}"], answer: 0, shuffleOptions: true,
    hints: ["group and team are the same list of objects.", "The loop changes every object's score."],
    skills: ["pass-list", "object-list"], tags: ["objects"],
    explainer: "The list passed in holds the same Pupil objects as team, so changing each p.score inside bonus is seen outside the function." },

  // ---------- Classes and objects + Methods ----------
  { id: "comb-cls-meth-jars", units: ["oop-classes", "oop-methods"], source: "meth-L1c", level: 1, type: "predict", title: "Two jars",
    params: { a: { int: [20, 50] }, b: { int: [20, 50] }, e: { int: [2, 9] }, f: { int: [10, 19] } },
    description: "eat is called on two different Jar objects. What does the program print?",
    solution: `class Jar:
    def __init__(self, sweets):
        self.sweets = sweets

    def eat(self, n):
        self.sweets = self.sweets - n

a = Jar({{a}})
b = Jar({{b}})
a.eat({{e}})
b.eat({{f}})
print(a.sweets, b.sweets)`,
    inputs: [], options: ["{{a - e}} {{b - f}}", "{{a}} {{b}}", "{{a - e - f}} {{b}}", "{{a - f}} {{b - e}}"], answer: 0, shuffleOptions: true,
    hints: ["Each object has its own sweets.", "a.eat(...) changes only a."],
    skills: ["object", "method-call"], tags: ["objects"],
    explainer: "a and b are separate objects, and each eat call changes only the sweets of the object it is called on." },
  { id: "comb-cls-meth-garden", units: ["oop-classes", "oop-methods"], source: "meth-L1a", level: 2, type: "predict", title: "Grow the garden",
    params: { a: { int: [5, 20] }, b: { int: [5, 20] }, c: { int: [5, 20] }, g: { int: [2, 6] } },
    description: "garden is a list of Plant objects. What does the program print?",
    solution: `class Plant:
    def __init__(self, height):
        self.height = height

    def grow(self, cm):
        self.height = self.height + cm

garden = [Plant({{a}}), Plant({{b}}), Plant({{c}})]
for p in garden:
    p.grow({{g}})
garden[1].grow({{g}})
print(garden[0].height, garden[1].height, garden[2].height)`,
    inputs: [], options: ["{{a + g}} {{b + 2 * g}} {{c + g}}", "{{a + g}} {{b + g}} {{c + g}}", "{{a}} {{b + g}} {{c}}", "{{a + 2 * g}} {{b + g}} {{c + g}}"], answer: 0, shuffleOptions: true,
    hints: ["The loop calls grow on every plant once.", "Then garden[1], the second plant, grows again."],
    skills: ["object-list", "method-call"], tags: ["objects"],
    explainer: "The loop calls grow once on every Plant object, and the next line calls it again on one object, so only that plant grows twice." },
  { id: "comb-cls-meth-pen", units: ["oop-classes", "oop-methods"], source: "meth-L3b", level: 3, type: "fill", title: "Ink left",
    params: { ink: { int: [50, 100] }, w1: { int: [1, 20] }, w2: { int: [21, 45] } },
    description: "Fill in the blank so left returns the pen's ink after the words typed have been written.",
    starter: `class Pen:
    def __init__(self, ink):
        self.ink = ink

    def write(self, words):
        self.ink = self.ink - words

    def left(self):
        return ____

p = Pen({{ink}})
p.write(int(input("Words: ")))
print(p.left())`,
    answers: ["self.ink"],
    tests: [{ inputs: ["{{w1}}"], expected: "{{ink - w1}}" }, { inputs: ["{{w2}}"], expected: "{{ink - w2}}" }],
    hints: ["The ink belongs to the object.", "Inside a method, the object is self."],
    skills: ["attribute", "return-method"], tags: ["method"],
    explainer: "left returns self.ink, the pen object's own ink, which write has already changed." },

  // ---------- Methods + Encapsulation ----------
  { id: "comb-meth-enc-dial", units: ["oop-methods", "oop-encapsulation"], source: "enc-L2a", level: 1, type: "predict", title: "Set the dial",
    params: { top: { int: [10, 20] }, s: { int: [1, 5] }, good: { int: [6, 9] }, over: { int: [1, 9] }, under: { int: [1, 9] } },
    values: { bad: "top + over", bad2: "-under" },
    description: "set_value only stores values from 0 to {{top}}. What does the program print?",
    solution: `class Dial:
    def __init__(self):
        self._value = {{s}}

    def set_value(self, v):
        if 0 <= v <= {{top}}:
            self._value = v

    def get_value(self):
        return self._value

d = Dial()
d.set_value({{bad}})
d.set_value({{good}})
d.set_value({{bad2}})
print(d.get_value())`,
    inputs: [], options: ["{{good}}", "{{bad2}}", "{{bad}}", "{{s}}"], answer: 0, shuffleOptions: true,
    hints: ["A value outside the range is refused.", "Which of the three calls is stored?"],
    skills: ["setter-check", "method-call"], tags: ["setter"],
    explainer: "Each call runs the setter's check, so only the value inside the range is stored and the refused ones change nothing." },
  { id: "comb-meth-enc-bypass", units: ["oop-methods", "oop-encapsulation"], source: "enc-L1c", level: 2, type: "predict", title: "Round the method",
    params: { a: { int: [30, 80] }, b: { int: [5, 25] } },
    description: "One line goes round add and changes _cash directly. What does the program print?",
    solution: `class Wallet:
    def __init__(self):
        self._cash = 0

    def add(self, n):
        if n > 0:
            self._cash = self._cash + n

    def get_cash(self):
        return self._cash

w = Wallet()
w.add({{a}})
w.add(-{{b}})
w._cash = w._cash - {{b}}
print(w.get_cash())`,
    inputs: [], options: ["{{a - b}}", "{{a}}", "{{a - 2 * b}}", "{{a + b}}"], answer: 0, shuffleOptions: true,
    hints: ["add refuses a negative amount.", "The direct change isn't checked."],
    skills: ["direct-change", "method"], tags: ["encapsulation"],
    explainer: "add refuses the negative amount, but the next line changes _cash directly, so its check never runs and the cash goes down anyway." },
  { id: "comb-meth-enc-brackets", units: ["oop-methods", "oop-encapsulation"], source: "enc-L4c", level: 2, type: "predict", title: "One without brackets",
    params: { r: { int: [3, 9] } },
    description: "Look at every line that uses up. What does the program print?",
    solution: `class Counter:
    def __init__(self):
        self._n = 0

    def up(self):
        self._n = self._n + 1

    def get_n(self):
        return self._n

c = Counter()
for k in range({{r}}):
    c.up()
c.up
print(c.get_n())`,
    inputs: [], options: ["{{r}}", "{{r + 1}}", "0", "{{r - 1}}"], answer: 0, shuffleOptions: true,
    hints: ["The loop calls up() {{r}} times.", "c.up has no brackets."],
    skills: ["method-brackets", "getter"], tags: ["method"],
    explainer: "Only calls with brackets run up, so the line without them changes nothing, and get_n() returns the count the loop made." },

  // ---------- Encapsulation + Inheritance ----------
  { id: "comb-enc-inh-deposit", units: ["oop-encapsulation", "oop-inheritance"], source: "inh-L1a", level: 1, type: "predict", title: "An inherited setter",
    params: { a: { int: [20, 90] }, b: { int: [5, 15] } },
    description: "Savings inherits deposit from Account. What does the program print?",
    solution: `class Account:
    def __init__(self):
        self._balance = 0

    def deposit(self, n):
        if n > 0:
            self._balance = self._balance + n

    def get_balance(self):
        return self._balance

class Savings(Account):
    pass

s = Savings()
s.deposit({{a}})
s.deposit(-{{b}})
print(s.get_balance())`,
    inputs: [], options: ["{{a}}", "{{a - b}}", "0", "{{a + b}}"], answer: 0, shuffleOptions: true,
    hints: ["Savings has no methods of its own: it uses Account's.", "deposit refuses a negative amount."],
    skills: ["inherit", "setter-check"], tags: ["inheritance"],
    explainer: "Savings inherits __init__, deposit and get_balance from Account, so its deposits go through the same check, which refuses the negative amount." },
  { id: "comb-enc-inh-stricter", units: ["oop-encapsulation", "oop-inheritance"], source: "inh-L1b", level: 2, type: "predict", title: "A stricter setter",
    params: { top: { int: [10, 20] }, d: { int: [5, 70] } },
    values: { v: "top + d" },
    description: "Quiz overrides set_mark with a different check. What does the program print?",
    solution: `class Mark:
    def __init__(self):
        self._m = 0

    def set_mark(self, m):
        if 0 <= m <= 100:
            self._m = m

    def get_mark(self):
        return self._m

class Quiz(Mark):
    def set_mark(self, m):
        if 0 <= m <= {{top}}:
            self._m = m

a = Mark()
q = Quiz()
a.set_mark({{v}})
q.set_mark({{v}})
print(a.get_mark(), q.get_mark())`,
    inputs: [], options: ["{{v}} 0", "{{v}} {{v}}", "0 0", "0 {{v}}"], answer: 0, shuffleOptions: true,
    hints: ["a is a Mark, so it uses Mark's set_mark.", "q is a Quiz: its own set_mark only allows up to {{top}}."],
    skills: ["override", "setter-check"], tags: ["inheritance"],
    explainer: "Each object uses the set_mark of its own class, so the Quiz object's stricter check refuses the mark that the Mark object accepts." },
  { id: "comb-enc-inh-prefect", units: ["oop-encapsulation", "oop-inheritance"], source: "inh-L2a", level: 2, type: "predict", title: "A prefect's badge",
    params: { n: { choice: NAMES } },
    description: "Prefect calls super().__init__ and then changes the private _name. What does the program print?",
    solution: `class Badge:
    def __init__(self, name):
        self._name = name

    def get_name(self):
        return self._name

class Prefect(Badge):
    def __init__(self, name):
        super().__init__(name)
        self._name = "Prefect " + self._name

p = Prefect("{{n}}")
print(p.get_name())`,
    inputs: [], options: ["Prefect {{n}}", "{{n}}", "Prefect", "{{n}} Prefect"], answer: 0, shuffleOptions: true,
    hints: ["super().__init__(name) stores the name first.", "Then Prefect's next line changes it."],
    skills: ["super", "getter"], tags: ["inheritance"],
    explainer: "super().__init__ stores the name through Badge's __init__, then Prefect's own line changes the private _name, and the inherited getter returns it." },

  // ---------- Inheritance + Debugging ----------
  { id: "comb-inh-dbg-name", units: ["oop-inheritance", "debugging"], source: "inh-L3c", level: 1, type: "predict", title: "A misspelt override",
    params: { p: { int: [6, 30] } },
    values: { price: "p * 2" },
    description: "Child tickets should cost half price, but the program has a bug. What does it print?",
    solution: `class Ticket:
    def __init__(self, price):
        self.price = price

    def cost(self):
        return self.price

class Child(Ticket):
    def costs(self):
        return self.price // 2

t = Child({{price}})
print(t.cost())`,
    inputs: [], options: ["{{price}}", "{{p}}", "0", "{{price * 2}}"], answer: 0, shuffleOptions: true,
    hints: ["Child's method is called costs, not cost.", "So t.cost() finds Ticket's version."],
    skills: ["override", "first-wrong-value"], tags: ["bug"],
    explainer: "Child's method has a different name, so it doesn't override cost, and t.cost() runs the parent's version: the bug is the method's name." },
  { id: "comb-inh-dbg-super", units: ["oop-inheritance", "debugging"], source: "dbg-L3a", level: 3, type: "fill", title: "The missing super()",
    params: { n: { choice: NAMES }, t: { int: [2, 9] } },
    description: "The comments show a program that stopped, and its error message. Fill in the line number the message points to.",
    starter: `# This program stopped with an error message:
#
#   1  class Pet:
#   2      def __init__(self, name):
#   3          self.name = name
#   4
#   5  class Dog(Pet):
#   6      def __init__(self, name, tricks):
#   7          self.tricks = tricks
#   8
#   9  d = Dog("{{n}}", {{t}})
#  10  print(d.name, d.tricks)
#
#   Traceback (most recent call last):
#     File "main.py", line 10, in <module>
#   AttributeError: 'Dog' object has no attribute 'name'
#
line = "____"
print("The error is on line", line)`,
    answers: ["10"],
    tests: [{ inputs: [], expected: "The error is on line 10" }],
    hints: ["The Traceback names the line.", "The cause is in Dog's __init__, which never calls super().__init__(name)."],
    skills: ["super", "error-line"], tags: ["error message"],
    explainer: "The message points to line 10, where d.name is used, but the cause is Dog's __init__, which never calls super().__init__(name) to store the name." },
  { id: "comb-inh-dbg-area", units: ["oop-inheritance", "debugging"], source: "inh-L4b", level: 2, type: "predict", title: "The wrong area",
    params: { a: { int: [2, 9] }, b: { int: [2, 9] } },
    description: "The program should add up the areas of the squares, but it has a bug. What does it print?",
    solution: `class Shape:
    def area(self):
        return 0

class Square(Shape):
    def __init__(self, side):
        self.side = side

    def area(self):
        return self.side * self.side

shapes = [Square({{a}}), Square({{b}})]
total = 0
for s in shapes:
    total = total + Shape.area(s)
print(total)`,
    inputs: [], options: ["0", "{{a * a + b * b}}", "{{a + b}}", "{{a * a}}"], answer: 0, shuffleOptions: true,
    hints: ["Shape.area(s) runs Shape's version, whatever s is.", "Shape's area returns 0."],
    skills: ["polymorphism", "first-wrong-value"], tags: ["bug"],
    explainer: "Shape.area(s) always runs the parent's version, so the overrides are never used: the bug is in the loop, which should call s.area()." },

  // ======================= Write from scratch =======================
  { id: "scratch-rec-power", units: ["recursion"], source: "rec-L8a", level: 10, type: "scratch", starter: "", title: "Recursive power",
    params: { k: { int: [0, 3] } },
    values: { word: "['Base', 'Number', 'Start', 'Value'][k]" },
    description: "Write a program from scratch with a recursive function power(base, exp) that returns base to the power exp (exp == 0 is the base case, which returns 1). Ask for the {{word.toLowerCase()}} and the power, then print the answer, for example:\n81",
    solution: `def power(base, exp):
    if exp == 0:
        return 1
    return base * power(base, exp - 1)

b = int(input("{{word}}: "))
e = int(input("Power: "))
print(power(b, e))`,
    testParams: { b: { int: [2, 9] }, e: { int: [0, 6] } },
    testCount: 3,
    test: { inputs: ["{{b}}", "{{e}}"], expected: "{{Math.pow(b, e)}}" },
    hints: ["The base case is exp == 0: return 1.", "Otherwise return base * power(base, exp - 1)."],
    skills: ["recursive-number", "base-case"], tags: ["recursion"],
    explainer: "power multiplies base by the answer for one power fewer, and exp == 0 is the base case that stops the calls." },
  { id: "scratch-scope-add-all", units: ["scope-parameters"], source: "scope-L6c", level: 10, type: "scratch", starter: "", title: "Change the list",
    params: { lst: { choice: [[3, 8, 1], [10, 4, 7, 2], [5, 5, 9], [12, 6, 3, 1], [2, 14, 8]] } },
    values: { shown: "pylist(lst)" },
    description: "Write a program from scratch that stores nums = {{shown}}. Write a function add_all(items, extra) that adds extra to every number in the list it is given, changing the list itself (it returns nothing). Ask for extra, call add_all(nums, extra), then print nums.",
    solution: `nums = {{shown}}

def add_all(items, extra):
    for i in range(len(items)):
        items[i] = items[i] + extra

add_all(nums, int(input("Extra: ")))
print(nums)`,
    testParams: { e: { int: [1, 20] } },
    testCount: 3,
    test: { inputs: ["{{e}}"], expected: "{{pylist(lst.map((x) => x + e))}}" },
    hints: ["items and nums are the same list.", "Change each item with items[i] = items[i] + extra."],
    skills: ["pass-list", "mutable"], tags: ["list"],
    explainer: "add_all changes each item of the list it is given, and nums is that same list, so the change is seen without any return." },
  { id: "scratch-cls-books", units: ["oop-classes"], source: "cls-L8a", level: 10, type: "scratch", starter: "", title: "Long books",
    params: { p: { choice: [[240, 310, 160], [120, 450, 300], [500, 90, 210], [180, 260, 340], [330, 150, 410]] } },
    description: "Write a program from scratch with a class Book whose __init__ stores a title and pages. Make a list of three books: Holes with {{p[0]}} pages, Wonder with {{p[1]}} and Matilda with {{p[2]}}. Ask for a number of pages, print the title of every book with more pages than that, then how many there were, for example:\nBooks: 2",
    solution: `class Book:
    def __init__(self, title, pages):
        self.title = title
        self.pages = pages

books = [Book("Holes", {{p[0]}}), Book("Wonder", {{p[1]}}), Book("Matilda", {{p[2]}})]
limit = int(input("Pages: "))
count = 0
for b in books:
    if b.pages > limit:
        print(b.title)
        count = count + 1
print("Books:", count)`,
    testParams: { lim: { int: [50, 520] } },
    testCount: 3,
    test: { inputs: ["{{lim}}"], expected: "{{['Holes', 'Wonder', 'Matilda'].filter((t, i) => p[i] > lim).concat(['Books: ' + p.filter((x) => x > lim).length]).join('\\n')}}" },
    hints: ["Store both values with self in __init__.", "Loop over the list and check each book's pages."],
    skills: ["class", "object-list", "init"], tags: ["class"],
    explainer: "Each Book object keeps its own title and pages, so one loop over the list can check every book." },
  { id: "scratch-meth-tally", units: ["oop-methods"], source: "meth-L8a", level: 10, type: "scratch", starter: "", title: "A tally",
    params: { k: { int: [0, 2] } },
    values: { thing: "['Points', 'Goals', 'Votes'][k]" },
    description: "Write a program from scratch with a class Tally: count starts at 0, add(self, n) adds n to count, and get(self) returns count. Ask for 3 numbers ({{thing.toLowerCase()}}), add each to one Tally, then print, for example:\n{{thing}}: 12",
    solution: `class Tally:
    def __init__(self):
        self.count = 0

    def add(self, n):
        self.count = self.count + n

    def get(self):
        return self.count

t = Tally()
for i in range(3):
    t.add(int(input("{{thing}}: ")))
print("{{thing}}:", t.get())`,
    testParams: { a: { int: [0, 20] }, b: { int: [0, 20] }, c: { int: [0, 20] } },
    testCount: 3,
    test: { inputs: ["{{a}}", "{{b}}", "{{c}}"], expected: "{{thing}}: {{a + b + c}}" },
    hints: ["add changes self.count.", "get returns it: call it with brackets."],
    skills: ["method", "change-attribute", "return-method"], tags: ["method"],
    explainer: "add changes the tally's own count each time, and get returns it, so the object keeps the running total." },
  { id: "scratch-enc-score", units: ["oop-encapsulation"], source: "enc-L7b", level: 10, type: "scratch", starter: "", title: "A checked score",
    params: { top: { int: [10, 20] } },
    description: "Write a program from scratch with a class Score: a private _score that starts at 0, a setter set_score(self, s) that stores s only if it is from 0 to {{top}}, and a getter get_score(self). Ask for three scores; set each one, then print the stored score.",
    solution: `class Score:
    def __init__(self):
        self._score = 0

    def set_score(self, s):
        if 0 <= s <= {{top}}:
            self._score = s

    def get_score(self):
        return self._score

sc = Score()
for k in range(3):
    sc.set_score(int(input("Score: ")))
    print(sc.get_score())`,
    testParams: { a: { int: [-3, 25] }, b: { int: [-3, 25] }, c: { int: [-3, 25] } },
    testCount: 3,
    test: { inputs: ["{{a}}", "{{b}}", "{{c}}"],
      expected: "{{(() => { let s = 0; return [a, b, c].map((x) => { if (x >= 0 && x <= top) s = x; return s; }).join('\\n'); })()}}" },
    hints: ["Check s with an if before storing it in self._score.", "Print the getter's value after each try."],
    skills: ["setter-check", "getter", "private"], tags: ["encapsulation"],
    explainer: "The setter checks every score before storing it, so a score outside the range is refused and the last good score is kept." },
  { id: "scratch-inh-rect", units: ["oop-inheritance"], source: "inh-L9a", level: 10, type: "scratch", starter: "", title: "Override area",
    params: { k: { int: [0, 2] } },
    values: { kind: "['Rectangle', 'Box', 'Panel'][k]" },
    description: "Write a program from scratch with a class Shape whose area(self) returns 0, and a subclass {{kind}} whose __init__ stores a width and a height and which overrides area. Ask for a width and a height, then print the area of a {{kind}} made from them, then the area of a plain Shape, for example:\n12\n0",
    solution: `class Shape:
    def area(self):
        return 0

class {{kind}}(Shape):
    def __init__(self, width, height):
        self.width = width
        self.height = height

    def area(self):
        return self.width * self.height

w = int(input("Width: "))
h = int(input("Height: "))
print({{kind}}(w, h).area())
print(Shape().area())`,
    testParams: { w: { int: [1, 12] }, h: { int: [1, 12] } },
    testCount: 3,
    test: { inputs: ["{{w}}", "{{h}}"], expected: "{{w * h}}\n0" },
    hints: ["class {{kind}}(Shape): makes it a subclass.", "Its own area method, with the same name, overrides Shape's."],
    skills: ["subclass", "override"], tags: ["inheritance"],
    explainer: "{{kind}} overrides area with its own version, so its objects give width times height while a plain Shape still gives 0." },
]);
