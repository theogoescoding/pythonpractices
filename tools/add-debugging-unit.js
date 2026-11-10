// One-off (2026-11): the "Debugging" unit (id debugging, A-level programming techniques), built with
// tools/unit-tasks.js. The A-level ladder, placement at levels 2, 5, 7 and 9 (no buggy variants), and an explainer on
// every task (see tools/add-recursion-unit.js).
//   - A predict task's program must run, so levels 1-2 predict what a program with a bug prints, and where the
//     mistake first shows in the output.
//   - Reading an error message (levels 3-4): the program that stopped is shown in comments, with its line numbers and
//     the error message, and the student fills in the line and the error's type (the answers are in quotes, so they
//     are compared exactly). These tasks use a name, day, colour or food that derived templates can change.
//   - Write tasks start from the program with bugs in it. No write-from-scratch tasks (curriculum.js noScratch).
// COVERAGE lists each angle and the tasks that cover it.
"use strict";
const { T, addUnit, nameCasting } = require("./unit-tasks.js");

const PRACTICE = [
  // ---------- Level 1: predict where the mistake shows ----------
  { id: "dbg-L1a", level: 1, type: "predict", title: "The wrong average",
    description: "The program should print the total and the average, but it has a bug. What does it print?",
    solution: `marks = [6, 8, 10]
total = 0
for m in marks:
    total = total + m
average = total // len(marks)
print("Total:", total)
print("Average:", total)`, tests: [T([])],
    wrongOutputs: ["Total: 24\nAverage: 8", "Total: 8\nAverage: 24"],
    hints: ["average is worked out correctly.", "Look at what the last line prints."],
    skills: ["first-wrong-value", "error-line"], tags: ["bug"],
    explainer: "The last line prints total where it should print average, so the mistake first shows on the second line of output even though average was worked out correctly." },
  { id: "dbg-L1b", level: 1, type: "predict", title: "A running total",
    description: "The program should print a running total of the prices. What does it really print?",
    solution: `prices = [4, 5, 6]
running = 0
for p in prices:
    running = p
    print("Running total:", running)`, tests: [T([])],
    wrongOutputs: ["Running total: 4\nRunning total: 9\nRunning total: 15", "Running total: 15"],
    hints: ["running = p replaces the total.", "The first line printed looks right, because 0 + the first price is that price."],
    skills: ["first-wrong-value"], tags: ["bug"],
    explainer: "running = p replaces the total instead of adding to it, so the first line looks right and the bug only shows from the second line of output." },
  { id: "dbg-L1c", level: 1, type: "predict", title: "The initial",
    description: "The program should print the first letter of the name in capitals. What does it really print?",
    solution: `name = "ava"
first = name[1]
print("Initial:", first.upper())`, tests: [T([])],
    wrongOutputs: ["Initial: a"],
    hints: ["Indexing counts from 0.", "name[1] isn't the first letter."],
    skills: ["error-line", "first-wrong-value"], tags: ["INDEX_FROM_ONE"],
    buggy: [["INDEX_FROM_ONE", `name = "ava"
first = name[0]
print("Initial:", first.upper())`]],
    explainer: "Indexing counts from 0, so the bug is the index on line 2, even though the wrong letter only shows up when line 3 prints it." },

  // ---------- Level 2: predict, spot the trap ----------
  { id: "dbg-L2a", level: 2, type: "predict", title: "Text times 2",
    description: "qty should be a number. What does the program print?",
    solution: `qty = "3"
print("Ordering", qty)
total = qty * 2
print("Total:", total)`, tests: [T([])],
    wrongOutputs: ["Ordering 3\nTotal: 6", "Ordering 3"],
    hints: ["qty is the text \"3\", not the number 3.", "* 2 on text repeats it."],
    skills: ["first-wrong-value", "error-line"], tags: ["trap"],
    explainer: "qty holds text, so * 2 repeats the text instead of doubling a number, and the mistake first shows on the second line printed." },
  { id: "dbg-L2b", level: 2, type: "predict", title: "Which line is wrong?",
    description: "add_vat is right, but total has a bug. What does the program print?",
    solution: `def add_vat(price):
    return price + price // 5

def total(prices):
    t = 0
    for p in prices:
        t = add_vat(p)
    return t

print(add_vat(10))
print(total([10, 20]))`, tests: [T([])],
    wrongOutputs: ["12\n36", "12\n30"],
    hints: ["add_vat(10) is 10 + 2.", "In total, t is replaced each time round, not added to."],
    skills: ["first-wrong-value", "error-line"], tags: ["trap"],
    explainer: "add_vat is right, which is why the first line is correct, but total replaces t on each pass instead of adding to it, so only the second line is wrong." },
  { id: "dbg-L2c", level: 2, type: "predict", title: "A fix in the wrong place",
    description: "The program should print the total of the three prices, but printed only the last price. Someone changed the last line to print total * 3 to fix it. What does it print now?",
    solution: `prices = [3, 4, 5]
total = 0
for p in prices:
    total = p
print("Total:", total * 3)`, tests: [T([])],
    wrongOutputs: ["Total: 5", "Total: 36"],
    hints: ["The loop still replaces total each time round.", "So total is the last price when the print runs."],
    skills: ["choose-line", "first-wrong-value"], tags: ["WRONG_LINE_FIXED"],
    buggy: [["WRONG_LINE_FIXED", `prices = [3, 4, 5]
total = 0
for p in prices:
    total = total + p
print("Total:", total)`]],
    explainer: "Changing the print line can't fix the loop, which still replaces total each time, so the last price is multiplied by 3 instead of the prices being added up." },

  // ---------- Level 3: fill in one blank (read an error message) ----------
  { id: "dbg-L3a", level: 3, type: "fill", title: "Which line?",
    description: "The comments show a program that stopped, and its error message. Fill in the line number the message points to.",
    starter: `# This program stopped with an error message:
#
#   1  name = "Ava"
#   2  age = 13
#   3  print(name + " is " + age)
#
#   Traceback (most recent call last):
#     File "main.py", line 3, in <module>
#   TypeError: can only concatenate str (not "int") to str
#
line = "____"
print("The error is on line", line)`,
    answers: ["3"], tests: [T([])],
    hints: ["The message says which line it stopped on.", "Look for the word line in the Traceback."],
    skills: ["error-line", "error-message"], tags: ["error message"],
    explainer: "Python's error message names the line where it stopped, here line 3, and its last line gives the error's type." },
  { id: "dbg-L3b", level: 3, type: "fill", title: "What type of error?",
    description: "The comments show a program that stopped, and its error message. Fill in the type of error.",
    starter: `# This program stopped with an error message:
#
#   1  team = ["Ava", "Ben", "Sam"]
#   2  print("Captain:", team[0])
#   3  print("Keeper:", team[3])
#
#   Traceback (most recent call last):
#     File "main.py", line 3, in <module>
#   IndexError: list index out of range
#
error_type = "____"
print("This is an", error_type)`,
    answers: ["IndexError"], tests: [T([])],
    hints: ["The type is the word before the colon on the last line of the message.", "It ends in Error."],
    skills: ["error-message"], tags: ["error message"],
    explainer: "The last line of an error message names its type, here IndexError, which means a position past the end of the list was used." },
  { id: "dbg-L3c", level: 3, type: "fill", title: "Where will it stop?",
    description: "Read the program in the comments. It will stop with an error. Fill in the line it will stop on.",
    starter: `# Read this program. It will stop with an error.
#
#   1  total = 0
#   2  for day in ["Monday", "Tuesday"]:
#   3      total = total + 1
#   4  print("Days:", total)
#   5  print("Average:", total / count)
#
line = "____"
print("It will stop on line", line)`,
    answers: ["5"], tests: [T([])],
    hints: ["Python runs the lines in order.", "Which line uses a name that was never given a value?"],
    skills: ["error-line"], tags: ["error message"],
    explainer: "Lines 1 to 4 run without a problem, but line 5 uses count, which was never given a value, so that is where Python stops with a NameError." },

  // ---------- Level 4: fill in two blanks ----------
  { id: "dbg-L4a", level: 4, type: "fill", title: "Line and type",
    description: "The comments show a program that stopped, and its error message. Fill in the line and the type of error.",
    starter: `# This program stopped with an error message:
#
#   1  def area(w, h):
#   2      return w * h
#   3
#   4  room = "library"
#   5  size = area(4)
#   6  print(room, size)
#
#   Traceback (most recent call last):
#     File "main.py", line 5, in <module>
#   TypeError: area() missing 1 required positional argument: 'h'
#
line = "____"
error_type = "____"
print("Line", line, "-", error_type)`,
    answers: ["5", "TypeError"], tests: [T([])],
    hints: ["The line is in the Traceback.", "The type is the first word on the message's last line."],
    skills: ["error-message", "error-line"], tags: ["error message"],
    explainer: "The message points to line 5, where area is called with one value when it needs two, and its last line names the type, TypeError." },
  { id: "dbg-L4b", level: 4, type: "fill", title: "The first error",
    description: "The program in the comments has two mistakes, but Python stops at the first one it reaches. Fill in the line it stops on and the type of error.",
    starter: `# This program has two mistakes:
#
#   1  colour = "red"
#   2  print("Colour:", colur)
#   3  print("Length:", len(colour) + "1")
#
line = "____"
error_type = "____"
print("Line", line, "-", error_type)`,
    answers: ["2", "NameError"], tests: [T([])],
    hints: ["Python runs line 1, then line 2.", "A misspelt name gives a NameError."],
    skills: ["error-line", "error-message"], tags: ["FIRST_ERROR_IGNORED"],
    buggy: [["FIRST_ERROR_IGNORED", `line = "3"
error_type = "TypeError"
print("Line", line, "-", error_type)`]],
    explainer: "Python runs the lines in order and stops at the first error, so the NameError on line 2 is reported and line 3's mistake is never reached." },
  { id: "dbg-L4c", level: 4, type: "fill", title: "The first wrong value",
    description: "The program in the comments should print the cost of the order, but prints the wrong amount. Fill in the first line that gives a wrong value, and the value it gives.",
    starter: `# The order is 3 pizzas at 6 pounds each, plus 2 pounds delivery.
# The program prints pizza 11, which is wrong.
#
#   1  food = "pizza"
#   2  qty = 3
#   3  price = 6
#   4  cost = qty + price
#   5  cost = cost + 2
#   6  print(food, cost)
#
line = "____"
value = "____"
print("Line", line, "gives", value)`,
    answers: ["4", "9"], tests: [T([])],
    hints: ["Work out each line's value in turn.", "The first line whose value isn't what it should be is the bug."],
    skills: ["first-wrong-value", "error-line"], tags: ["FIRST_ERROR_IGNORED"],
    buggy: [["FIRST_ERROR_IGNORED", `line = "5"
value = "11"
print("Line", line, "gives", value)`]],
    explainer: "Line 4 adds qty and price where it should multiply them, so it gives the first wrong value, and lines 5 and 6 only carry the mistake on." },

  // ---------- Level 5: Parsons, or pick the missing line ----------
  { id: "dbg-L5a", level: 5, type: "partial-parsons", title: "The starting value",
    description: "The program should print the bigger of two numbers, but it printed 0 when both numbers were negative. Pick the line that fixes it.",
    starter: `first = int(input("Number: "))
second = int(input("Number: "))
____
if second > biggest:
    biggest = second
print("Biggest:", biggest)`,
    options: ["biggest = first", "biggest = 0", "biggest = second + 1", "biggest = -1"],
    tests: [T(["-5", "-2"]), T(["7", "3"])],
    hints: ["Starting at 0 means no negative number can beat it.", "Start with one of the numbers typed."],
    skills: ["choose-line", "fix-bug"], tags: ["bug"],
    explainer: "Starting biggest at 0 is the bug, because no negative number beats it, so the line to change is the one that sets the starting value." },
  { id: "dbg-L5b", level: 5, type: "parsons", title: "Fix the range",
    description: "The original program printed the total of 1 up to one less than the number typed. Arrange the fixed program, which includes the number itself.\nOne line (from the original) is not needed.",
    solution: `n = int(input("Up to: "))
total = 0
for i in range(1, n + 1):
    total = total + i
print("Total:", total)`,
    distractors: ["for i in range(1, n):"],
    tests: [T(["4"]), T(["1"])],
    hints: ["range stops just before its end value.", "To include n, the end has to be n + 1."],
    skills: ["fix-bug"], tags: ["RANGE_STOP_EXCLUSIVE"],
    buggy: [["RANGE_STOP_EXCLUSIVE", `n = int(input("Up to: "))
total = 0
for i in range(1, n):
    total = total + i
print("Total:", total)`]],
    explainer: "range stops just before its end value, so range(1, n + 1) is needed to include n itself, which was the bug in the original." },
  { id: "dbg-L5c", level: 5, type: "partial-parsons", title: "Fix the line it names",
    description: "The program stopped with NameError: name 'Total' is not defined, on line 5. Pick the line that fixes it.",
    starter: `prices = [3, 5, 4]
total = 0
for p in prices:
    total = total + p
____`,
    options: ['print("Total:", total)', 'print("Total:", Total)', 'print("Total:" + total)', "Total = total"],
    tests: [T([])],
    hints: ["The error is on the last line.", "Names are case sensitive: total and Total are different."],
    skills: ["error-message", "choose-line"], tags: ["error message"],
    explainer: "The NameError names the line where a name Python doesn't know was used, so fixing only that line's spelling lets the program run." },

  // ---------- Level 6: Parsons with traps, or pick the missing line ----------
  { id: "dbg-L6a", level: 6, type: "parsons", title: "Two bugs",
    description: "The original program had two bugs: its count started at the wrong number, and its last line stopped with a TypeError. Arrange the fixed program.\nTwo lines (the buggy ones) are not needed.",
    solution: `words = ["sun", "moon", "star", "sky"]
count = 0
for w in words:
    if len(w) > 3:
        count = count + 1
print("Long words:", count)`,
    distractors: ["count = 1", 'print("Long words: " + count)'],
    tests: [T([])],
    hints: ["A count starts at 0.", "+ can't join text and a number: in print(), put the number after a comma instead."],
    skills: ["several-bugs", "fix-bug"], tags: ["STRING_PLUS_INT"],
    buggy: [["STRING_PLUS_INT", `words = ["sun", "moon", "star", "sky"]
count = 0
for w in words:
    if len(w) > 3:
        count = count + 1
print("Long words: " + count)`]],
    explainer: "The count has to start at 0, and + can't join text and a number, so the fixed print() puts the count after a comma and both buggy lines are left out." },
  { id: "dbg-L6b", level: 6, type: "partial-parsons", title: "Change the right line",
    description: "The program should add up the scores with their bonuses, but it printed only the last one. bonus is right. Pick the line that fixes the program.",
    starter: `def bonus(score):
    if score >= 50:
        extra = 10
    else:
        extra = 0
    return score + extra

total = 0
for s in [40, 55, 60]:
    ____
print(total)`,
    options: ["total = total + bonus(s)", "total = bonus(s)", "total = total + s", "bonus(s)"], optionMisconceptions: { 3: "RESULT_NOT_STORED" },
    tests: [T([])],
    hints: ["bonus doesn't need changing.", "The total must have each score with its bonus added to it."],
    skills: ["choose-line", "fix-bug"], tags: ["bug"],
    explainer: "bonus is already right, so the line to change is the one in the loop, which must add each score with its bonus to the total instead of replacing it." },

  // ---------- Level 7: trace, or write a short fix ----------
  { id: "dbg-L7a", level: 7, type: "trace", title: "Trace to find the bug",
    description: "The program should print the price of two items at 20 each, with 5 off each one. It prints something else. Trace it to find the first line that gives a wrong value: the Line column is yours to fill in too.",
    solution: `price = 20
discount = 5
sale = price - discount
sale = sale * 2
total = sale + discount
print(total)`, tests: [T([])],
    trace: { columns: ["price", "discount", "sale", "total"], lineColumn: "ask" },
    hints: ["Write the line number of each line that changes a value.", "Check each value against what it should be."],
    skills: ["first-wrong-value"], tags: ["trace"],
    explainer: "The trace shows sale is right after line 4, so line 5 is the first to give a wrong value, by adding the discount back on." },
  { id: "dbg-L7b", level: 7, type: "write", title: "Fix the average",
    description: "This program should print the average of the four temperatures typed, for example Average: 12.5, but it prints 1 less than that. Fix the one line that is wrong, without changing anything else.",
    starter: `temps = []
for k in range(4):
    temps.append(int(input("Temperature: ")))
total = 0
for t in temps:
    total = total + t
average = total / len(temps) - 1
print("Average:", average)`,
    solution: `temps = []
for k in range(4):
    temps.append(int(input("Temperature: ")))
total = 0
for t in temps:
    total = total + t
average = total / len(temps)
print("Average:", average)`,
    tests: [T(["12", "15", "9", "14"]), T(["10", "20", "30", "40"])],
    hints: ["The total is right.", "Which line works out the average?"],
    skills: ["fix-bug", "choose-line"], tags: ["WRONG_LINE_FIXED"],
    buggy: [["WRONG_LINE_FIXED", `temps = []
for k in range(4):
    temps.append(int(input("Temperature: ")))
total = 0
for t in temps:
    total = total + t
average = total / len(temps) - 1
print("Average:", round(average, 1))`]],
    explainer: "The bug is on the line that works out the average, which takes 1 off after dividing, so that is the only line to change." },
  { id: "dbg-L7c", level: 7, type: "trace", title: "Trace the biggest",
    description: "The program should find the biggest number in the list, but it doesn't. Trace it to see where biggest first goes wrong.",
    solution: `nums = [3, 7, 2]
biggest = nums[0]
for n in nums:
    if n < biggest:
        biggest = n
print("Biggest:", biggest)`, tests: [T([])],
    trace: { columns: ["nums", "biggest", "n"] },
    hints: ["biggest only changes when the if is True.", "Compare each n with biggest using the < in the program."],
    skills: ["first-wrong-value"], tags: ["trace"],
    explainer: "The trace shows biggest only changes when n is smaller, because the if uses < where it needs >, so the condition is the line to fix." },

  // ---------- Level 8: trace, or write ----------
  { id: "dbg-L8a", level: 8, type: "write", title: "Two bugs to fix",
    description: "This program should print, for example: banana has 3 vowels. It has two bugs. Fix both, without changing anything else.",
    starter: `def count_vowels(word):
    count = 1
    for ch in word:
        if ch in "aeiou":
            count = count + 1
    return count

w = input("Word: ")
print(w, "has", count_vowels(word), "vowels")`,
    solution: `def count_vowels(word):
    count = 0
    for ch in word:
        if ch in "aeiou":
            count = count + 1
    return count

w = input("Word: ")
print(w, "has", count_vowels(w), "vowels")`,
    tests: [T(["banana"]), T(["sky"])],
    hints: ["Run it first: Python stops at the first error.", "Once it runs, check the count: what should it start at?"],
    skills: ["several-bugs", "fix-bug"], tags: ["FIRST_ERROR_IGNORED"],
    buggy: [["FIRST_ERROR_IGNORED", `def count_vowels(word):
    count = 0
    for ch in word:
        if ch in "aeiou":
            count = count + 1
    return count

w = input("Word: ")
print(w, "has", count_vowels(word), "vowels")`]],
    explainer: "Python stops first at the NameError, because word isn't defined outside the function, and once that is fixed the count starting at 1 shows up as one vowel too many." },
  { id: "dbg-L8b", level: 8, type: "trace", title: "Trace the discounts",
    description: "Orders of 10 or more should get 5 off. Trace the three calls to find the first one that gives a wrong value.",
    solution: `def total_cost(qty, price):
    cost = qty * price
    if qty > 10:
        cost = cost - 5
    return cost

a = total_cost(4, 3)
b = total_cost(12, 2)
c = total_cost(10, 6)
print(a, b, c)`, tests: [T([])],
    trace: { columns: ["a", "b", "c"] },
    hints: ["Work out each call: qty times price, then 5 off if qty > 10.", "Is an order of exactly 10 given 5 off?"],
    skills: ["first-wrong-value"], tags: ["trace"],
    explainer: "The trace shows c is the first wrong value, because qty > 10 leaves out an order of exactly 10, so the condition needs >=." },

  // ---------- Level 9: write a full fix, or a longer trace ----------
  { id: "dbg-L9a", level: 9, type: "write", title: "Three bugs",
    description: "This program should read four scores and print their total, the highest score and the average (using //), for example:\nTotal: 24\nHighest: 9\nAverage: 6\nIt has three bugs, and it must also work when every score is negative. Fix them, without changing what it prints.",
    starter: `scores = []
for k in range(4):
    scores.append(input("Score: "))
total = 0
for s in scores:
    total = total + s
highest = 0
for s in scores:
    if s > highest:
        highest = s
print("Total:", total)
print("Highest:", highest)
print("Average:", total // len(score))`,
    solution: `scores = []
for k in range(4):
    scores.append(int(input("Score: ")))
total = 0
for s in scores:
    total = total + s
highest = scores[0]
for s in scores:
    if s > highest:
        highest = s
print("Total:", total)
print("Highest:", highest)
print("Average:", total // len(scores))`,
    tests: [T(["5", "9", "2", "8"]), T(["-3", "-7", "-1", "-5"])],
    hints: ["Start with the first error Python stops at, fix it, then run it again.", "If every score is negative, a highest that starts at 0 is never beaten."],
    skills: ["several-bugs", "fix-bug", "first-wrong-value"], tags: ["FIRST_ERROR_IGNORED", "WRONG_LINE_FIXED"],
    buggy: [["FIRST_ERROR_IGNORED", `scores = []
for k in range(4):
    scores.append(input("Score: "))
total = 0
for s in scores:
    total = total + s
highest = scores[0]
for s in scores:
    if s > highest:
        highest = s
print("Total:", total)
print("Highest:", highest)
print("Average:", total // len(scores))`],
      ["WRONG_LINE_FIXED", `scores = []
for k in range(4):
    scores.append(int(input("Score: ")))
total = 0
for s in scores:
    total = total + s
highest = 0
for s in scores:
    if s > highest:
        highest = s
print("Total:", total)
print("Highest:", highest)
print("Average:", total // len(scores))`]],
    explainer: "Fixing the bugs in order from the first error works best: cast each score with int(), start highest at the first score, and use the list's real name in len()." },
  { id: "dbg-L9b", level: 9, type: "trace", title: "Trace the restock",
    description: "A shop should add 10 to its stock whenever it drops below 10. Trace the program to find the line that goes wrong.",
    solution: `stock = 20
sold = [3, 5, 4]
for s in sold:
    stock = stock - s
    if stock < 10:
        stock = 10
print("Stock:", stock)`, tests: [T([])],
    trace: { columns: ["stock", "s"] },
    hints: ["Work out stock after each sale.", "When stock drops below 10, what does line 6 do to it?"],
    skills: ["first-wrong-value"], tags: ["trace"],
    explainer: "The trace shows every value is right until stock drops below 10, when line 6 sets it to 10 instead of adding 10, so that line is the first to go wrong." },

  // ---------- Level 10: write an extended fix, or a longer trace ----------
  { id: "dbg-L10a", level: 10, type: "write", title: "Fix the grade report",
    description: "This program should print each pupil's name and grade (A for 70 or more, B for 50 or more, C for 30 or more, otherwise U), then the top pupil's name, for example:\nAva A\nBen C\nCal B\nTop: Ava\nIt has three bugs. Fix them, without changing what it prints.",
    starter: `def grade(mark):
    if mark >= 70:
        return "A"
    elif mark >= 50:
        return "B"
    elif mark > 30:
        return "C"
    else:
        return "U"

names = []
marks = []
for k in range(3):
    names.append(input("Name: "))
    marks.append(int(input("Mark: ")))
best = 0
for i in range(len(names)):
    print(names[i], grade(marks))
    if marks[i] > marks[best]:
        best = i
print("Top:", names[best + 1])`,
    solution: `def grade(mark):
    if mark >= 70:
        return "A"
    elif mark >= 50:
        return "B"
    elif mark >= 30:
        return "C"
    else:
        return "U"

names = []
marks = []
for k in range(3):
    names.append(input("Name: "))
    marks.append(int(input("Mark: ")))
best = 0
for i in range(len(names)):
    print(names[i], grade(marks[i]))
    if marks[i] > marks[best]:
        best = i
print("Top:", names[best])`,
    tests: [T(["Ava", "72", "Ben", "30", "Cal", "55"]), T(["Dev", "29", "Eve", "50", "Fin", "90"])],
    hints: ["Run it: the first error is a TypeError from grade.", "Check the C grade's boundary, and what best already holds."],
    skills: ["several-bugs", "fix-bug", "choose-line"], tags: ["FIRST_ERROR_IGNORED", "GT_VS_GTE", "INDEX_FROM_ONE"],
    buggy: [["FIRST_ERROR_IGNORED", `def grade(mark):
    if mark >= 70:
        return "A"
    elif mark >= 50:
        return "B"
    elif mark >= 30:
        return "C"
    else:
        return "U"

names = []
marks = []
for k in range(3):
    names.append(input("Name: "))
    marks.append(int(input("Mark: ")))
best = 0
for i in range(len(names)):
    print(names[i], grade(marks))
    if marks[i] > marks[best]:
        best = i
print("Top:", names[best])`],
      ["GT_VS_GTE", `def grade(mark):
    if mark >= 70:
        return "A"
    elif mark >= 50:
        return "B"
    elif mark > 30:
        return "C"
    else:
        return "U"

names = []
marks = []
for k in range(3):
    names.append(input("Name: "))
    marks.append(int(input("Mark: ")))
best = 0
for i in range(len(names)):
    print(names[i], grade(marks[i]))
    if marks[i] > marks[best]:
        best = i
print("Top:", names[best])`],
      ["INDEX_FROM_ONE", `def grade(mark):
    if mark >= 70:
        return "A"
    elif mark >= 50:
        return "B"
    elif mark >= 30:
        return "C"
    else:
        return "U"

names = []
marks = []
for k in range(3):
    names.append(input("Name: "))
    marks.append(int(input("Mark: ")))
best = 0
for i in range(len(names)):
    print(names[i], grade(marks[i]))
    if marks[i] > marks[best]:
        best = i
print("Top:", names[best + 1])`]],
    explainer: "Each bug is on a different line: the call must pass marks[i], the C grade needs >= 30, and best is already the right index, so it needs no + 1." },
  { id: "dbg-L10b", level: 10, type: "trace", title: "Trace the spending",
    description: "A spend equal to the balance should be allowed, leaving 0, and then 10 is added. Trace the program to find the first step that goes wrong.",
    solution: `balance = 100
for spend in [30, 45, 25]:
    if spend < balance:
        balance = balance - spend
    else:
        print("Refused", spend)
balance = balance + 10
print("Balance:", balance)`, tests: [T([])],
    trace: { columns: ["balance", "spend"] },
    hints: ["Check each spend against the balance at that moment.", "Is the last spend smaller than the balance, or equal to it?"],
    skills: ["first-wrong-value"], tags: ["trace"],
    explainer: "The trace shows the first wrong step is the last spend, which equals the balance and is refused because the condition uses < where it needs <=." },
];

// Placement (levels 2, 5, 7 and 9): no buggy variants.
const PLACEMENT = [
  { id: "dbg-P2a", level: 2, type: "predict", title: "Counting items",
    description: "The program should count the items. What does it really print?",
    solution: `items = ["pen", "pad", "ink"]
count = 0
for item in items:
    count = 1
print("Items:", count)`, tests: [T([])],
    wrongOutputs: ["Items: 3", "Items: 0"],
    hints: ["count = 1 sets count, it doesn't add to it.", "It is set to the same value each time round."],
    skills: ["first-wrong-value"], tags: ["bug"],
    explainer: "count = 1 sets the count instead of adding to it, so the loop's mistake is only seen in the value printed at the end." },
  { id: "dbg-P2b", level: 2, type: "predict", title: "Area and perimeter",
    description: "One of these two lines has a bug. What does the program print?",
    solution: `width = 4
height = 3
area = width * height
perimeter = width + height * 2
print(area)
print(perimeter)`, tests: [T([])],
    wrongOutputs: ["12\n14", "14\n10"],
    hints: ["* is worked out before +.", "height * 2 comes first."],
    skills: ["first-wrong-value", "error-line"], tags: ["bug"],
    explainer: "Multiplication is done before addition, so the perimeter line is the one that goes wrong, while the area line is right." },
  { id: "dbg-P5a", level: 5, type: "parsons", title: "Adult or child",
    description: "The original program said Child for an age of exactly 18. Arrange the fixed program.\nOne line (from the original) is not needed.",
    solution: `age = int(input("Age: "))
if age >= 18:
    print("Adult")
else:
    print("Child")`,
    distractors: ["if age > 18:"],
    tests: [T(["18"]), T(["12"])],
    hints: ["18 itself counts as an adult.", "Use >= for 'or more'."],
    skills: ["fix-bug"], tags: ["parsons"],
    explainer: "An age of exactly 18 counts as an adult, so the condition must be >= 18, which was the bug in the line left out." },
  { id: "dbg-P5b", level: 5, type: "partial-parsons", title: "Fix line 3",
    description: "The program should print each number doubled, but it stopped with an error on line 3. Pick the line that fixes it.",
    starter: `nums = [4, 9, 1]
for n in nums:
    ____`,
    options: ["print(n * 2)", "print(nums * 2)", 'print(n * "2")', "print(num * 2)"],
    tests: [T([])],
    hints: ["The loop variable is n.", "Double the number, not the list."],
    skills: ["error-line", "fix-bug"], tags: ["error message"],
    explainer: "Line 3 is the one the error points to, so it is the line to change, using n, the loop variable that holds each number." },
  { id: "dbg-P7a", level: 7, type: "trace", title: "Trace the doubles",
    description: "The program should print the total of the numbers doubled, 24. Trace it to see where it goes wrong.",
    solution: `total = 0
for n in [2, 4, 6]:
    total = n * 2
print(total)`, tests: [T([])],
    trace: { columns: ["total", "n"] },
    hints: ["total = n * 2 replaces total.", "Write total's new value each time round."],
    skills: ["first-wrong-value"], tags: ["trace"],
    explainer: "The trace shows total is replaced each time round instead of having the doubled number added, so the line inside the loop is the first to go wrong." },
  { id: "dbg-P7b", level: 7, type: "write", title: "Fix the message",
    description: "The program should print, for example: Mia will be 13 next year. It stops with a TypeError. Fix the bug.",
    starter: `name = input("Name: ")
age = int(input("Age: "))
print(name + " will be " + age + 1 + " next year")`,
    solution: `name = input("Name: ")
age = int(input("Age: "))
print(name, "will be", age + 1, "next year")`,
    tests: [T(["Mia", "12"]), T(["Leo", "15"])],
    hints: ["+ can't join text and a number.", "Use commas in print() instead of +, and work out age + 1 inside it."],
    skills: ["fix-bug", "error-message"], tags: ["write"],
    explainer: "Python can't join text and a number with +, so the fixed print() puts each value after a comma and works out age + 1 there." },
  { id: "dbg-P9a", level: 9, type: "write", title: "Fix the average mark",
    description: "This program should read marks until -1 is typed, then print their average using //, for example Average: 15. It stops with an error. Fix it.",
    starter: `total = 0
count = 0
mark = int(input("Mark (-1 to stop): "))
while mark != -1:
    total = total + mark
    mark = int(input("Mark (-1 to stop): "))
print("Average:", total // count)`,
    solution: `total = 0
count = 0
mark = int(input("Mark (-1 to stop): "))
while mark != -1:
    total = total + mark
    count = count + 1
    mark = int(input("Mark (-1 to stop): "))
print("Average:", total // count)`,
    tests: [T(["10", "20", "-1"]), T(["7", "-1"])],
    hints: ["The error is a ZeroDivisionError on the last line.", "count never goes up inside the loop."],
    skills: ["fix-bug", "error-message"], tags: ["write"],
    explainer: "count is never increased inside the loop, so the division on the last line uses 0, and adding count = count + 1 to the loop fixes it." },
  { id: "dbg-P9b", level: 9, type: "trace", title: "Trace the orders",
    description: "An order bigger than the stock should be refused, leaving the stock as it is. Trace the program to find where it goes wrong.",
    solution: `stock = 12
orders = [5, 4, 6]
for o in orders:
    if o <= stock:
        stock = stock - o
    else:
        stock = 0
print(stock)`, tests: [T([])],
    trace: { columns: ["stock", "o"] },
    hints: ["Check each order against the stock at that moment.", "What does the else line do?"],
    skills: ["first-wrong-value"], tags: ["trace"],
    explainer: "The trace shows the stock is right until the third order, where the else line sets it to 0 instead of leaving it alone." },
];

const COVERAGE = {
  "Reading an error message and naming its line and type": ["dbg-L3a", "dbg-L3b", "dbg-L4a", "dbg-L4b", "dbg-L5c", "dbg-P7b"],
  "Predicting where an error will appear": ["dbg-L1a", "dbg-L1b", "dbg-L1c", "dbg-L2a", "dbg-L2b", "dbg-L3c", "dbg-L4b", "dbg-P2a", "dbg-P2b"],
  "Finding the first line where a value goes wrong, with a trace table": ["dbg-L7a", "dbg-L7c", "dbg-L8b", "dbg-L9b", "dbg-L10b", "dbg-P7a", "dbg-P9b"],
  "Fixing a bug without changing the expected output": ["dbg-L5b", "dbg-L7b", "dbg-L8a", "dbg-P5a", "dbg-P9a"],
  "Fixing several bugs in a longer program": ["dbg-L6a", "dbg-L8a", "dbg-L9a", "dbg-L10a"],
  "Choosing the right line to change": ["dbg-L2c", "dbg-L4c", "dbg-L5a", "dbg-L5c", "dbg-L6b", "dbg-L7b", "dbg-P5b"],
};

// Tasks that cast input() with int() say so (the casting sentence, tools/unit-tasks.js nameCasting).
nameCasting(PRACTICE.concat(PLACEMENT));

if (require.main === module) addUnit("debugging", PRACTICE, PLACEMENT);
module.exports = { PRACTICE, PLACEMENT, COVERAGE };
