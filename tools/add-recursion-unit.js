// One-off (2026-11): the "Recursion" unit (id recursion, A-level programming techniques), built with
// tools/unit-tasks.js. The A-level ladder (curriculum.js A_LEVEL_TYPES): levels 1-2 predict, 3-4 fill in, 5-6 Parsons
// or pick the missing line, 7-8 trace or a short write, 9-10 write or a longer trace. Placement tasks at levels 2, 5,
// 7 and 9 (no buggy variants). Every task has an "explainer": one sentence naming the idea, shown after a pass or the
// second wrong check. A trace table only records the main program's lines, so calls and returns are traced through
// what the calls print (the Output column) and the values the main program stores.
// COVERAGE lists each angle of the unit and the tasks that practise it (tests/features.js checks it).
"use strict";
const { T, addUnit, nameCasting } = require("./unit-tasks.js");

const PRACTICE = [
  // ---------- Level 1: predict ----------
  { id: "rec-L1a", level: 1, type: "predict", title: "Count down",
    description: "countdown calls itself. What does the program print?",
    solution: `def countdown(n):
    if n == 0:
        print("Lift off")
    else:
        print(n)
        countdown(n - 1)

countdown(3)`, tests: [T([])],
    wrongOutputs: ["3\n2\n1\n0\nLift off", "1\n2\n3\nLift off", "3\nLift off"],
    hints: ["Each call prints its n, then calls countdown with n - 1.", "When n reaches 0, the base case prints the message and makes no more calls."],
    skills: ["self-call", "recursive-number"], tags: ["countdown"],
    explainer: "countdown calls itself with a number one smaller each time, printing it first, until the base case n == 0 prints the message instead." },
  { id: "rec-L1b", level: 1, type: "predict", title: "Factorial",
    description: "factorial(n) is n times factorial(n - 1). What does the program print?",
    solution: `def factorial(n):
    if n == 1:
        return 1
    return n * factorial(n - 1)

print(factorial(4))`, tests: [T([])],
    wrongOutputs: ["4", "10", "1"],
    hints: ["factorial(n) is n * factorial(n - 1), all the way down to factorial(1).", "factorial(1) returns 1; then multiply the answers on the way back."],
    skills: ["recursive-number", "return-through"], tags: ["factorial"],
    explainer: "Each call multiplies its n by the answer for n - 1, and the calls stop at the base case factorial(1)." },
  { id: "rec-L1c", level: 1, type: "predict", title: "Add up a list",
    description: "total adds the first item to the total of the rest. What does the program print?",
    solution: `def total(items):
    if len(items) == 0:
        return 0
    return items[0] + total(items[1:])

print(total([5, 3, 8]))`, tests: [T([])],
    wrongOutputs: ["5", "8", "0"],
    hints: ["items[1:] is the list without its first item.", "The empty list is the base case: its total is 0."],
    skills: ["recursive-list", "return-through"], tags: ["list"],
    explainer: "total adds the first item to the total of the rest of the list, and the empty list is the base case that stops the calls." },

  // ---------- Level 2: predict, spot the trap ----------
  { id: "rec-L2a", level: 2, type: "predict", title: "Print after the call",
    description: "Look where the print is. What does the program print?",
    solution: `def show(n):
    if n > 0:
        show(n - 1)
        print(n)

show(3)`, tests: [T([])],
    wrongOutputs: ["3\n2\n1", "0\n1\n2\n3"],
    hints: ["show(3) calls show(2) before it prints anything.", "The call with the smallest n finishes first, so its print runs first."],
    skills: ["self-call", "call-trace"], tags: ["trap"],
    explainer: "Each call makes its recursive call before it prints, so nothing is printed until the deepest call has run, and the prints come out as the calls return." },
  { id: "rec-L2b", level: 2, type: "predict", title: "Steps of 2",
    description: "n goes down by 2 on each call. What does the program print?",
    solution: `def steps(n):
    if n <= 0:
        return 0
    return 1 + steps(n - 2)

print(steps(7))`, tests: [T([])],
    wrongOutputs: ["3", "7", "14"],
    hints: ["Each call takes 2 off n, until n is 0 or less.", "Count the calls before the base case: each one adds 1."],
    skills: ["base-case", "recursive-number"], tags: ["trap"],
    explainer: "The base case uses <= 0, so it is still reached when n jumps past 0 to a negative number, and every call before it adds 1." },
  { id: "rec-L2c", level: 2, type: "predict", title: "Backwards",
    description: "reverse is recursive. What does the program print?",
    solution: `def reverse(word):
    if len(word) <= 1:
        return word
    return reverse(word[1:]) + word[0]

print(reverse("cat"))`, tests: [T([])],
    wrong: [`def reverse(word):
    if len(word) <= 1:
        return word
    return word[0] + reverse(word[1:])

print(reverse("cat"))`], wrongOutputs: ["c", "tca"],
    hints: ["reverse(word[1:]) reverses everything after the first letter.", "The first letter is added at the end."],
    skills: ["recursive-list", "return-through"], tags: ["string"],
    explainer: "reverse puts the first letter after the reversed rest of the word, and a word of one letter is the base case, returned as it is." },

  // ---------- Level 3: fill in one blank ----------
  { id: "rec-L3a", level: 3, type: "fill", title: "The recursive call",
    description: "Fill in the blank so each call counts down by 1 until it reaches the base case and prints Go!",
    starter: `def countdown(n):
    if n == 0:
        print("Go!")
    else:
        print(n)
        countdown(____)

countdown(int(input("Start: ")))`,
    answers: ["n - 1"], tests: [T(["3"]), T(["0"])],
    hints: ["The call must get closer to the base case, n == 0.", "Pass a number one smaller than n."],
    skills: ["self-call", "base-case"], tags: ["RECURSION_NO_BASE_CASE"],
    buggy: [["RECURSION_NO_BASE_CASE", `def countdown(n):
    if n == 0:
        print("Go!")
    else:
        print(n)
        countdown(n)

countdown(int(input("Start: ")))`]],
    explainer: "Each call must pass a smaller number, n - 1, so the calls move towards the base case n == 0 and stop." },
  { id: "rec-L3b", level: 3, type: "fill", title: "Pass it back",
    description: "Fill in the blank so factorial gives its answer back to the call that asked for it.",
    starter: `def factorial(n):
    if n == 1:
        return 1
    ____ n * factorial(n - 1)

print(factorial(int(input("n: "))))`,
    answers: ["return"], tests: [T(["5"]), T(["1"])],
    hints: ["The base case gives its answer back with return.", "The recursive case must give its answer back too."],
    skills: ["return-through", "recursive-number"], tags: ["RETURN_MISSING_NONE"],
    buggy: [["RETURN_MISSING_NONE", `def factorial(n):
    if n == 1:
        return 1
    n * factorial(n - 1)

print(factorial(int(input("n: "))))`]],
    explainer: "The recursive case must return n * factorial(n - 1), so each answer is passed back up to the call that asked for it." },
  { id: "rec-L3c", level: 3, type: "fill", title: "A shorter list",
    description: "Fill in the blank so total adds up a list by calling itself on a shorter list each time.",
    starter: `def total(items):
    if len(items) == 0:
        return 0
    return items[0] + total(____)

print(total([4, 7, 2, 6]))
print(total([]))`,
    answers: ["items[1:]"], tests: [T([])],
    hints: ["The call must work on the rest of the list.", "items[1:] is everything after the first item."],
    skills: ["recursive-list", "base-case"], tags: ["RECURSION_NO_BASE_CASE"],
    buggy: [["RECURSION_NO_BASE_CASE", `def total(items):
    if len(items) == 0:
        return 0
    return items[0] + total(items)

print(total([4, 7, 2, 6]))
print(total([]))`]],
    explainer: "Each call passes the list without its first item, items[1:], so the list gets shorter until the empty-list base case." },

  // ---------- Level 4: fill in two blanks ----------
  { id: "rec-L4a", level: 4, type: "fill", title: "Powers",
    description: "Fill in both blanks: power(base, exp) works out base to the power exp by calling itself.",
    starter: `def power(base, exp):
    if exp == ____:
        return 1
    return base * power(base, ____)

b = int(input("Base: "))
e = int(input("Power: "))
print(power(b, e))`,
    answers: ["0", "exp - 1"], tests: [T(["2", "5"]), T(["7", "0"])],
    hints: ["Any number to the power 0 is 1: that is the base case.", "Each call asks for one power fewer."],
    skills: ["base-case", "recursive-number"], tags: ["RECURSION_NO_BASE_CASE"],
    buggy: [["RECURSION_NO_BASE_CASE", `def power(base, exp):
    if exp == 0:
        return 1
    return base * power(base, exp)

b = int(input("Base: "))
e = int(input("Power: "))
print(power(b, e))`]],
    explainer: "power stops at the base case exp == 0, which returns 1, and every other call multiplies by base and asks for one power fewer." },
  { id: "rec-L4b", level: 4, type: "fill", title: "Count the a's",
    description: "Fill in both blanks so count_a returns how many times the letter a is in the word.",
    starter: `def count_a(word):
    if word == "":
        return ____
    if word[0] == "a":
        return 1 + count_a(word[1:])
    return ____

print(count_a(input("Word: ")))`,
    answers: ["0", "count_a(word[1:])"], tests: [T(["banana"]), T(["sky"])],
    hints: ["Empty text has no a's in it.", "If the first letter isn't a, the answer is just the count for the rest of the word."],
    skills: ["recursive-list", "return-through"], tags: ["RETURN_MISSING_NONE"],
    buggy: [["RETURN_MISSING_NONE", `def count_a(word):
    if word == "":
        return 0
    if word[0] == "a":
        return 1 + count_a(word[1:])
    count_a(word[1:])

print(count_a(input("Word: ")))`]],
    explainer: "count_a returns 0 for empty text, and otherwise returns the count for the rest of the word, adding 1 when the first letter is a." },
  { id: "rec-L4c", level: 4, type: "fill", title: "Loop or recursion",
    description: "sum_loop adds up 1 to n with a loop. Fill in both blanks so sum_rec gives the same answer using recursion.",
    starter: `def sum_loop(n):
    total = 0
    for i in range(1, n + 1):
        total = total + i
    return total

def sum_rec(n):
    if n == ____:
        return 0
    return n + sum_rec(____)

n = int(input("n: "))
print(sum_loop(n), sum_rec(n))`,
    answers: ["0", "n - 1"], tests: [T(["4"]), T(["0"])],
    hints: ["The sum of the numbers up to 0 is 0: that is the base case.", "The sum up to n is n plus the sum up to n - 1."],
    skills: ["loop-vs-recursion", "base-case"], tags: ["RECURSION_NO_BASE_CASE"],
    buggy: [["RECURSION_NO_BASE_CASE", `def sum_loop(n):
    total = 0
    for i in range(1, n + 1):
        total = total + i
    return total

def sum_rec(n):
    if n == 0:
        return 0
    return n + sum_rec(n + 1)

n = int(input("n: "))
print(sum_loop(n), sum_rec(n))`]],
    explainer: "The loop adds the numbers one at a time, while sum_rec adds n to the sum of the numbers below it, so both give the same total." },

  // ---------- Level 5: Parsons, or pick the missing line ----------
  { id: "rec-L5a", level: 5, type: "parsons", title: "Build factorial",
    description: "Arrange the lines: factorial calls itself, and the program prints the factorial of the number typed.\nOne line is not needed.",
    solution: `def factorial(n):
    if n == 1:
        return 1
    return n * factorial(n - 1)
num = int(input("Number: "))
print(factorial(num))`,
    distractors: ["return n * factorial(n)"],
    tests: [T(["5"]), T(["1"])],
    hints: ["The base case comes first inside the function.", "The recursive call must pass a smaller number."],
    skills: ["recursive-number", "base-case"], tags: ["parsons"],
    explainer: "factorial(n) is n times factorial(n - 1), and the base case factorial(1) returns 1 without calling itself again." },
  { id: "rec-L5b", level: 5, type: "partial-parsons", title: "The base case",
    description: "length counts the letters in a word by calling itself on a shorter word. Pick the line that makes the base case.",
    starter: `def length(word):
    ____
        return 0
    return 1 + length(word[1:])

print(length(input("Word: ")))`,
    options: ['if word == "":', 'if word == " ":', "if len(word) == 1:", 'if word[0] == "":'], optionMisconceptions: { 1: "RECURSION_NO_BASE_CASE" },
    tests: [T(["moon"]), T([""])],
    hints: ["Each call takes one letter off the front.", "The calls end with empty text, which has length 0."],
    skills: ["base-case", "recursive-list"], tags: ["base case"],
    explainer: "Empty text is the base case: its length is 0, and every other call adds 1 for the first letter and asks about the rest." },
  { id: "rec-L5c", level: 5, type: "partial-parsons", title: "The biggest item",
    description: "biggest finds the largest item in a list using recursion. Pick the missing line.",
    starter: `def biggest(items):
    if len(items) == 1:
        return items[0]
    rest = biggest(items[1:])
    ____
        return items[0]
    return rest

print(biggest([4, 11, 7, 2]))
print(biggest([9, 3, 5]))`,
    options: ["if items[0] > rest:", "if items[0] < rest:", "if rest > 0:", "if items[0] == rest:"],
    tests: [T([])],
    hints: ["rest is the biggest item in the rest of the list: the recursive call returned it.", "Keep the first item only if it beats rest."],
    skills: ["return-through", "recursive-list"], tags: ["comparison"],
    explainer: "Each call compares its first item with the biggest of the rest, which the recursive call returned, and passes the bigger one back." },

  // ---------- Level 6: Parsons with traps, or pick the missing line ----------
  { id: "rec-L6a", level: 6, type: "parsons", title: "Reverse a list",
    description: "Arrange the lines: reverse returns the list in the opposite order, using recursion.\nTwo lines are not needed.",
    solution: `def reverse(items):
    if len(items) == 0:
        return []
    return reverse(items[1:]) + [items[0]]
print(reverse([3, 6, 9, 12]))`,
    distractors: ["return [items[0]] + reverse(items[1:])", "return reverse(items)"],
    tests: [T([])],
    hints: ["The empty list reversed is still the empty list.", "The first item goes at the end of the reversed rest."],
    skills: ["recursive-list", "base-case"], tags: ["parsons"],
    explainer: "reverse puts the first item after the reversed rest, so the items come back in the opposite order once the empty list is reached." },
  { id: "rec-L6b", level: 6, type: "partial-parsons", title: "From a loop to recursion",
    description: "count_loop counts down with a loop. count_rec should do the same job with recursion. Pick its missing line.",
    starter: `def count_loop(n):
    while n > 0:
        print(n)
        n = n - 1

def count_rec(n):
    if n > 0:
        print(n)
        ____

count_loop(int(input("Start: ")))
count_rec(int(input("Start again: ")))`,
    options: ["count_rec(n - 1)", "count_rec(n)", "n = n - 1", "return n - 1"], optionMisconceptions: { 1: "RECURSION_NO_BASE_CASE" },
    tests: [T(["3", "3"]), T(["2", "4"])],
    hints: ["The loop goes round again with a smaller n.", "In recursion, going round again is a call with a smaller n."],
    skills: ["loop-vs-recursion", "self-call"], tags: ["loop"],
    explainer: "Where the loop takes 1 off n and goes round again, the recursive version calls itself with n - 1, which does the same job." },
  { id: "rec-L6c", level: 6, type: "parsons", title: "Palindromes",
    description: "Arrange the lines: is_palindrome returns True if a word reads the same both ways. The program prints the answer for the word typed.\nTwo lines are not needed.",
    solution: `def is_palindrome(word):
    if len(word) <= 1:
        return True
    if word[0] != word[-1]:
        return False
    return is_palindrome(word[1:-1])
word = input("Word: ")
print(is_palindrome(word))`,
    distractors: ["return is_palindrome(word)", "if word[0] == word[-1]:"],
    tests: [T(["level"]), T(["lever"])],
    hints: ["A word of one letter, or no letters, is a palindrome: that is the base case.", "word[1:-1] is the word without its first and last letters."],
    skills: ["recursive-list", "base-case"], tags: ["string"],
    explainer: "A word is a palindrome if its first and last letters match and the middle part is a palindrome too, down to a base case of one letter or none." },

  // ---------- Level 7: trace, or write a short line ----------
  { id: "rec-L7a", level: 7, type: "trace", title: "Trace the calls",
    description: "fact prints call and return as it goes. Trace the program: each line of the main program gets a row, and the Output column shows everything the calls print.",
    solution: `def fact(n):
    print("call", n)
    if n == 1:
        result = 1
    else:
        result = n * fact(n - 1)
    print("return", result)
    return result

a = fact(2)
b = fact(3)
print(a + b)`, tests: [T([])],
    trace: { columns: ["a", "b"] },
    hints: ["Each call prints call before it calls fact again, and return only after the call below it has returned.", "So the returns come out in the reverse order of the calls."],
    skills: ["call-trace", "return-through"], tags: ["RETURN_MISSING_NONE"],
    buggy: [["RETURN_MISSING_NONE", `def fact(n):
    print("call", n)
    if n == 1:
        result = 1
    else:
        result = n * fact(n - 1)
    print("return", result)

a = fact(2)
b = fact(3)
print(a + b)`]],
    explainer: "Each call prints call before it calls itself, and return only after the call below it has returned, so the returns come out in the reverse order." },
  { id: "rec-L7b", level: 7, type: "write", title: "Write the base case",
    description: "add_up(n) should add up the numbers from 1 to n, but it never stops. Add the base case: when n is 0, return 0. The program should print, for example: 10, when 4 is typed.",
    starter: `def add_up(n):
    # Write the base case here: when n is 0, return 0
    return n + add_up(n - 1)

print(add_up(int(input("n: "))))`,
    solution: `def add_up(n):
    if n == 0:
        return 0
    return n + add_up(n - 1)

print(add_up(int(input("n: "))))`,
    tests: [T(["4"]), T(["0"])],
    hints: ["The base case is an if at the start of the function.", "if n == 0: then return 0 on the next line, indented."],
    skills: ["base-case", "recursive-number"], tags: ["RECURSION_NO_BASE_CASE"],
    buggy: [["RECURSION_NO_BASE_CASE", `def add_up(n):
    return n + add_up(n - 1)

print(add_up(int(input("n: "))))`]],
    explainer: "Without a base case add_up would call itself for ever, so if n == 0: return 0 stops the calls and lets each one add its n on the way back." },
  { id: "rec-L7c", level: 7, type: "trace", title: "Trace the totals",
    description: "Trace the program. Each of t1, t2 and t3 is a call to the recursive function total.",
    solution: `def total(items):
    if len(items) == 0:
        return 0
    return items[0] + total(items[1:])

nums = [6, 3, 5]
t1 = total(nums[2:])
t2 = total(nums[1:])
t3 = total(nums)
print(t1, t2, t3)`, tests: [T([])],
    trace: { columns: ["nums", "t1", "t2", "t3"] },
    hints: ["nums[2:] is the list from index 2 to the end.", "Each total is the first item plus the total of the rest."],
    skills: ["return-through", "call-trace"], tags: ["list"],
    explainer: "Each call returns its first item plus what the call on the rest of the list returned, so a shorter list's total is part of a longer one's." },

  // ---------- Level 8: trace, or write ----------
  { id: "rec-L8a", level: 8, type: "write", title: "Recursion instead of a loop",
    description: "power_loop works out base to the power exp with a loop. Write power_rec(base, exp), which gives the same answer using recursion instead (the base case is exp == 0). The program prints both answers, for example:\n81 81",
    starter: `def power_loop(base, exp):
    answer = 1
    for i in range(exp):
        answer = answer * base
    return answer

# Write power_rec(base, exp) here

b = int(input("Base: "))
e = int(input("Power: "))
print(power_loop(b, e), power_rec(b, e))`,
    solution: `def power_loop(base, exp):
    answer = 1
    for i in range(exp):
        answer = answer * base
    return answer

def power_rec(base, exp):
    if exp == 0:
        return 1
    return base * power_rec(base, exp - 1)

b = int(input("Base: "))
e = int(input("Power: "))
print(power_loop(b, e), power_rec(b, e))`,
    tests: [T(["3", "4"]), T(["5", "0"])],
    hints: ["Any number to the power 0 is 1: that is the base case.", "base to the power exp is base times base to the power exp - 1."],
    skills: ["loop-vs-recursion", "base-case"], tags: ["RECURSION_NO_BASE_CASE", "RETURN_MISSING_NONE"],
    buggy: [["RECURSION_NO_BASE_CASE", `def power_loop(base, exp):
    answer = 1
    for i in range(exp):
        answer = answer * base
    return answer

def power_rec(base, exp):
    return base * power_rec(base, exp - 1)

b = int(input("Base: "))
e = int(input("Power: "))
print(power_loop(b, e), power_rec(b, e))`],
      ["RETURN_MISSING_NONE", `def power_loop(base, exp):
    answer = 1
    for i in range(exp):
        answer = answer * base
    return answer

def power_rec(base, exp):
    if exp == 0:
        return 1
    base * power_rec(base, exp - 1)

b = int(input("Base: "))
e = int(input("Power: "))
print(power_loop(b, e), power_rec(b, e))`]],
    explainer: "power_rec does the loop's job by multiplying base by the answer for one power fewer, with exp == 0 as the base case that returns 1." },
  { id: "rec-L8b", level: 8, type: "trace", title: "Trace shout",
    description: "Trace the program. shout calls itself until times is 0.",
    solution: `def shout(word, times):
    if times == 0:
        return ""
    return word + "!" + shout(word, times - 1)

a = shout("go", 1)
b = shout("go", 3)
c = len(b)
print(c)`, tests: [T([])],
    trace: { columns: ["a", "b", "c"] },
    hints: ["shout(word, 0) returns empty text.", "Each call adds the word and a ! in front of what the call below it returns."],
    skills: ["return-through", "call-trace"], tags: ["RECURSION_NO_BASE_CASE"],
    buggy: [["RECURSION_NO_BASE_CASE", `def shout(word, times):
    if times == 0:
        return ""
    return word + "!" + shout(word, times)

a = shout("go", 1)
b = shout("go", 3)
c = len(b)
print(c)`]],
    explainer: "Each call adds one word and a ! to what the call below it returns, and the base case times == 0 returns empty text." },

  // ---------- Level 9: write a full program, or a longer trace ----------
  { id: "rec-L9a", level: 9, type: "write", title: "Digit sum",
    description: "Write a recursive function digit_sum(n) that returns the sum of the digits of n: n % 10 is the last digit and n // 10 is the rest. A number less than 10 is the base case. Ask for a number and print its digit sum, for example 14 for 4721.",
    starter: "# Write digit_sum(n) here, then use it",
    solution: `def digit_sum(n):
    if n < 10:
        return n
    return n % 10 + digit_sum(n // 10)

n = int(input("Number: "))
print(digit_sum(n))`,
    tests: [T(["4721"]), T(["8"])],
    hints: ["A single digit is its own digit sum.", "Add the last digit, n % 10, to the digit sum of n // 10."],
    skills: ["recursive-number", "base-case", "return-through"], tags: ["RECURSION_NO_BASE_CASE", "RETURN_MISSING_NONE"],
    buggy: [["RECURSION_NO_BASE_CASE", `def digit_sum(n):
    return n % 10 + digit_sum(n // 10)

n = int(input("Number: "))
print(digit_sum(n))`],
      ["RETURN_MISSING_NONE", `def digit_sum(n):
    if n < 10:
        return n
    n % 10 + digit_sum(n // 10)

n = int(input("Number: "))
print(digit_sum(n))`]],
    explainer: "digit_sum takes off the last digit with n % 10 and adds it to the digit sum of the rest, n // 10, until a single digit is left." },
  { id: "rec-L9b", level: 9, type: "trace", title: "Trace the running totals",
    description: "Trace the program. Each time round the loop, the recursive function total adds up the first k marks.",
    solution: `def total(items):
    if len(items) == 0:
        return 0
    return items[0] + total(items[1:])

marks = [7, 4, 9, 3]
running = []
for k in range(1, len(marks) + 1):
    running.append(total(marks[:k]))
print(running)`, tests: [T([])],
    trace: { columns: ["k", "running"] },
    hints: ["marks[:k] is the first k marks.", "Each new item of running is the total of one more mark than the last."],
    skills: ["call-trace", "return-through"], tags: ["list"],
    explainer: "Each call to total returns the sum of a longer slice of marks, worked out by the recursive calls, and the main program appends it to running." },

  // ---------- Level 10: write an extended program, or a longer trace ----------
  { id: "rec-L10a", level: 10, type: "write", title: "Biggest, two ways",
    description: "scores is made for you. Write a recursive function biggest(items) that returns the largest item (a list of one item is the base case), and a loop version biggest_loop(items). Ask for a new score, add it to scores, then print both answers, for example:\n17 17",
    starter: `scores = [12, 17, 9, 15]
# Write biggest(items) and biggest_loop(items), then use them`,
    solution: `scores = [12, 17, 9, 15]

def biggest(items):
    if len(items) == 1:
        return items[0]
    rest = biggest(items[1:])
    if items[0] > rest:
        return items[0]
    return rest

def biggest_loop(items):
    best = items[0]
    for x in items:
        if x > best:
            best = x
    return best

scores.append(int(input("New score: ")))
print(biggest(scores), biggest_loop(scores))`,
    tests: [T(["5"]), T(["40"])],
    hints: ["biggest compares the first item with the biggest of the rest.", "The loop version keeps the best so far and checks every item."],
    skills: ["loop-vs-recursion", "recursive-list", "return-through"], tags: ["RECURSION_NO_BASE_CASE", "RETURN_MISSING_NONE"],
    buggy: [["RECURSION_NO_BASE_CASE", `scores = [12, 17, 9, 15]

def biggest(items):
    rest = biggest(items[1:])
    if items[0] > rest:
        return items[0]
    return rest

def biggest_loop(items):
    best = items[0]
    for x in items:
        if x > best:
            best = x
    return best

scores.append(int(input("New score: ")))
print(biggest(scores), biggest_loop(scores))`],
      ["RETURN_MISSING_NONE", `scores = [12, 17, 9, 15]

def biggest(items):
    if len(items) == 1:
        return items[0]
    rest = biggest(items[1:])
    if items[0] > rest:
        return items[0]

def biggest_loop(items):
    best = items[0]
    for x in items:
        if x > best:
            best = x
    return best

scores.append(int(input("New score: ")))
print(biggest(scores), biggest_loop(scores))`]],
    explainer: "biggest compares the first item with the biggest of the rest until one item is left, while the loop keeps the best so far, and both give the same answer." },
  { id: "rec-L10b", level: 10, type: "trace", title: "Trace the moves",
    description: "moves(n) is how many moves a puzzle with n discs takes. Trace the program: each time round the loop, m is a recursive call.",
    solution: `def moves(n):
    if n == 1:
        return 1
    return 2 * moves(n - 1) + 1

total = 0
for discs in [1, 3, 4, 5]:
    m = moves(discs)
    total = total + m
print(total)`, tests: [T([])],
    trace: { columns: ["discs", "m", "total"] },
    hints: ["moves(1) is 1, moves(2) is 2 * 1 + 1, and so on.", "total adds each m as the loop goes round."],
    skills: ["call-trace", "recursive-number"], tags: ["loop"],
    explainer: "moves(n) uses the answer for one disc fewer twice and adds one more move, so each answer is built from the calls below it." },
];

// Placement (levels 2, 5, 7 and 9): no buggy variants.
const PLACEMENT = [
  { id: "rec-P2a", level: 2, type: "predict", title: "Stars",
    description: "stars calls itself. What does the program print?",
    solution: `def stars(n):
    if n == 0:
        return ""
    return "*" + stars(n - 1)

print(stars(4))`, tests: [T([])],
    wrongOutputs: ["***", "*", "*****"],
    hints: ["stars(0) returns empty text.", "Each call adds one star."],
    skills: ["recursive-number", "return-through"], tags: ["string"],
    explainer: "Each call adds one star to what the call for n - 1 returns, and stars(0) is the base case that returns empty text." },
  { id: "rec-P2b", level: 2, type: "predict", title: "Mystery",
    description: "mystery calls itself with n // 10. What does the program print?",
    solution: `def mystery(n):
    if n < 10:
        return 1
    return 1 + mystery(n // 10)

print(mystery(5306))`, tests: [T([])],
    wrongOutputs: ["5306", "3", "14"],
    hints: ["n // 10 takes the last digit off.", "Count the calls until n is a single digit."],
    skills: ["recursive-number", "base-case"], tags: ["digits"],
    explainer: "Each call takes the last digit off with // 10 and adds 1, until a single digit is left in the base case." },
  { id: "rec-P5a", level: 5, type: "parsons", title: "Sum to n",
    description: "Arrange the lines: sum_to(n) adds up the numbers from 1 to n by calling itself.\nOne line is not needed.",
    solution: `def sum_to(n):
    if n == 0:
        return 0
    return n + sum_to(n - 1)
print(sum_to(int(input("n: "))))`,
    distractors: ["return n + sum_to(n)"],
    tests: [T(["5"]), T(["0"])],
    hints: ["The base case is n == 0.", "Each call passes a smaller number."],
    skills: ["recursive-number", "base-case"], tags: ["parsons"],
    explainer: "sum_to(n) adds n to the sum of the numbers below it, and sum_to(0) is the base case that returns 0." },
  { id: "rec-P5b", level: 5, type: "partial-parsons", title: "Keep counting down",
    description: "count_down prints the numbers from the one typed down to 0. Pick the missing line.",
    starter: `def count_down(n):
    if n < 0:
        return
    print(n)
    ____

count_down(int(input("Start: ")))`,
    options: ["count_down(n - 1)", "count_down(n + 1)", "count_down(n)", "print(n - 1)"],
    tests: [T(["3"]), T(["0"])],
    hints: ["Each call should move towards the base case, n < 0.", "Pass a number one smaller."],
    skills: ["self-call", "base-case"], tags: ["countdown"],
    explainer: "count_down prints n and then calls itself with n - 1, so the numbers go down until n is below 0 and the calls stop." },
  { id: "rec-P7a", level: 7, type: "trace", title: "Trace double_up",
    description: "Trace the program. double_up calls itself until the number is 50 or more.",
    solution: `def double_up(n):
    if n >= 50:
        return n
    return double_up(n * 2)

a = double_up(7)
b = double_up(60)
print(a, b)`, tests: [T([])],
    trace: { columns: ["a", "b"] },
    hints: ["7, 14, 28, 56: stop at the first one that is 50 or more.", "60 is already 50 or more."],
    skills: ["call-trace", "base-case"], tags: ["trace"],
    explainer: "double_up keeps calling itself with twice the number until the base case n >= 50 returns it, so a number that starts big enough is returned straight away." },
  { id: "rec-P7b", level: 7, type: "write", title: "Write the call",
    description: "show_steps should print the number typed, then every second number below it, then Done. Add the recursive call, so n goes down by 2 each time.",
    starter: `def show_steps(n):
    if n <= 0:
        print("Done")
    else:
        print(n)
        # Write the recursive call here: n goes down by 2 each time

show_steps(int(input("Start: ")))`,
    solution: `def show_steps(n):
    if n <= 0:
        print("Done")
    else:
        print(n)
        show_steps(n - 2)

show_steps(int(input("Start: ")))`,
    tests: [T(["6"]), T(["0"])],
    hints: ["The call goes inside the else, under print(n).", "Pass n - 2."],
    skills: ["self-call", "recursive-number"], tags: ["write"],
    explainer: "Calling show_steps(n - 2) makes each call 2 smaller, so the calls reach the base case n <= 0 and print Done." },
  { id: "rec-P9a", level: 9, type: "write", title: "Build a list",
    description: "Write a recursive function build(n) that returns the list [n, n - 1, ..., 1] (build(0) returns an empty list). Ask for a number and print the list, for example:\n[4, 3, 2, 1]",
    solution: `def build(n):
    if n == 0:
        return []
    return [n] + build(n - 1)

print(build(int(input("n: "))))`,
    tests: [T(["4"]), T(["0"])],
    hints: ["build(0) is the base case: return [].", "Put n in a list of its own and add the list for n - 1 after it."],
    skills: ["recursive-list", "base-case"], tags: ["list"],
    explainer: "build puts n in front of the list for n - 1, and build(0) returns an empty list, so the list is made on the way back." },
  { id: "rec-P9b", level: 9, type: "trace", title: "Trace the triangle numbers",
    description: "Trace the program. Each time round the loop, triangle(k) is a recursive call.",
    solution: `def triangle(n):
    if n == 1:
        return 1
    return n + triangle(n - 1)

row = []
for k in [1, 2, 3, 4, 5]:
    row.append(triangle(k))
print(row)`, tests: [T([])],
    trace: { columns: ["k", "row"] },
    hints: ["triangle(1) is 1.", "triangle(k) adds k to triangle(k - 1)."],
    skills: ["call-trace", "return-through"], tags: ["trace"],
    explainer: "Each triangle(k) adds k to the answer for k - 1, so the list holds the totals of 1 to k for each k in turn." },
];

// The unit's angles, and the tasks that cover each one.
const COVERAGE = {
  "Predicting the output of a self-calling function, one call at a time": ["rec-L1a", "rec-L2a", "rec-L7a", "rec-P2a"],
  "Base cases, and what happens when one is missing": ["rec-L2b", "rec-L3a", "rec-L4a", "rec-L5b", "rec-L6c", "rec-L7b", "rec-P5b"],
  "Recursive calls on numbers (countdown, factorial)": ["rec-L1a", "rec-L1b", "rec-L4a", "rec-L5a", "rec-L9a", "rec-P2b"],
  "Recursive calls on lists and strings (sum, reverse)": ["rec-L1c", "rec-L2c", "rec-L3c", "rec-L4b", "rec-L6a", "rec-L6c", "rec-P9a"],
  "Returning values through the calls and using the result": ["rec-L1b", "rec-L3b", "rec-L5c", "rec-L7c", "rec-L8b", "rec-L9b"],
  "Tracing calls and returns in a trace table": ["rec-L7a", "rec-L7c", "rec-L8b", "rec-L9b", "rec-L10b", "rec-P7a", "rec-P9b"],
  "Writing a recursive version from a loop, and comparing the two": ["rec-L4c", "rec-L6b", "rec-L8a", "rec-L10a"],
};

// Tasks that cast input() with int() say so (the casting sentence, tools/unit-tasks.js nameCasting).
nameCasting(PRACTICE.concat(PLACEMENT));

if (require.main === module) addUnit("recursion", PRACTICE, PLACEMENT);
module.exports = { PRACTICE, PLACEMENT, COVERAGE };
