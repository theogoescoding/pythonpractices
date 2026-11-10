// One-off (2026-11): the "Hash tables" unit (id hash-tables, A-level data structures), built with tools/unit-tasks.js.
// The A-level ladder, placement at levels 2, 5, 7 and 9 (no buggy variants), and an explainer on every task (see
// tools/add-recursion-unit.js). A table is a list of a fixed size; the hash is key % size, and collisions use linear
// probing that wraps round with % size. An empty slot is None, except in the trace tasks, where it is 0 (a trace table
// only shows a list whose items are all numbers or text). No dictionaries. COVERAGE lists each angle and its tasks.
"use strict";
const { T, addUnit, nameCasting } = require("./unit-tasks.js");

const PRACTICE = [
  // ---------- Level 1: predict ----------
  { id: "hash-L1a", level: 1, type: "predict", title: "Hash a key",
    description: "The hash function for a table of 7 slots is key % size. What does the program print?",
    solution: `size = 7
key = 23
index = key % size
print(index)`, tests: [T([])],
    wrongOutputs: ["23", "7"],
    hints: ["% gives the remainder after dividing.", "Divide 23 by 7 and look at what is left over."],
    skills: ["hash-function"], tags: ["HASH_NO_MOD"],
    buggy: [["HASH_NO_MOD", `size = 7
key = 23
index = key // size
print(index)`]],
    explainer: "The hash function key % size gives the remainder after dividing by the table size, so every key lands on an index inside the table." },
  { id: "hash-L1b", level: 1, type: "predict", title: "Store three keys",
    description: "Each key is stored at the index key % 5. What does the program print?",
    solution: `table = [None, None, None, None, None]
for key in [12, 9, 20]:
    table[key % 5] = key
print(table)`, tests: [T([])],
    wrongOutputs: ["[12, 9, 20, None, None]", "[None, None, 12, None, 9]", "[20, None, 12, 9, None]"],
    hints: ["Work out key % 5 for each key.", "Each key goes in its own slot, not the next free one."],
    skills: ["store-key", "hash-function"], tags: ["hash"],
    explainer: "Each key is stored at the index its hash gives, so the keys end up spread through the table rather than in the order they were added." },
  { id: "hash-L1c", level: 1, type: "predict", title: "Same slot",
    description: "Two keys are stored, with no check for a collision. What does the program print?",
    solution: `table = [None] * 5
table[7 % 5] = "cat"
table[12 % 5] = "dog"
print(table[2])`, tests: [T([])],
    wrongOutputs: ["cat", "None", "cat dog"],
    hints: ["Work out 7 % 5 and 12 % 5.", "Storing in a slot replaces what was there."],
    skills: ["collision"], tags: ["collision"],
    explainer: "Both keys hash to the same index, so without any collision handling the second store replaces the first one." },

  // ---------- Level 2: predict, spot the trap ----------
  { id: "hash-L2a", level: 2, type: "predict", title: "Linear probing",
    description: "When a slot is taken, the key moves on to the next slot. What does the program print?",
    solution: `table = [None] * 5
for key in [8, 13, 4]:
    index = key % 5
    while table[index] != None:
        index = (index + 1) % 5
    table[index] = key
print(table)`, tests: [T([])],
    wrongOutputs: ["[None, None, None, 8, 13]", "[None, None, None, 8, 4]"],
    hints: ["8 and 13 both hash to 3.", "After the last slot, % 5 wraps round to 0."],
    skills: ["linear-probe", "collision"], tags: ["HASH_COLLISION_OVERWRITES"],
    buggy: [["HASH_COLLISION_OVERWRITES", `table = [None] * 5
for key in [8, 13, 4]:
    index = key % 5
    table[index] = key
print(table)`]],
    explainer: "When a key's slot is taken, linear probing tries the next slot along, and % 5 wraps it round to the start after the last one." },
  { id: "hash-L2b", level: 2, type: "predict", title: "Search past a collision",
    description: "The table was filled with linear probing. What does the program print?",
    solution: `table = [10, None, 7, 17, None]
key = 17
index = key % 5
found = False
while table[index] != None:
    if table[index] == key:
        found = True
    index = (index + 1) % 5
print(found, index)`, tests: [T([])],
    wrongOutputs: ["True 3", "False 4"],
    hints: ["17 hashes to 2, but slot 2 holds 7.", "The search keeps going until it reaches an empty slot."],
    skills: ["hash-search", "linear-probe"], tags: ["HASH_SEARCH_STOPS_AT_HOME"],
    buggy: [["HASH_SEARCH_STOPS_AT_HOME", `table = [10, None, 7, 17, None]
key = 17
index = key % 5
found = False
if table[index] == key:
    found = True
print(found, index)`]],
    explainer: "A key that collided may sit further along, so the search keeps probing until it reaches an empty slot, checking each slot on the way." },
  { id: "hash-L2c", level: 2, type: "predict", title: "Hash a word",
    description: "ord(ch) gives a letter's character code: ord(\"A\") is 65 and ord(\"B\") is 66. What does the program print?",
    solution: `def hash_name(name, size):
    total = 0
    for ch in name:
        total = total + ord(ch)
    return total % size

print(hash_name("AB", 10), hash_name("BA", 10))`, tests: [T([])],
    wrongOutputs: ["1 2", "2 1"],
    hints: ["Add up the codes of the letters.", "The order of the letters doesn't change the total."],
    skills: ["string-hash", "collision"], tags: ["HASH_NO_MOD"],
    buggy: [["HASH_NO_MOD", `def hash_name(name, size):
    total = 0
    for ch in name:
        total = total + ord(ch)
    return total

print(hash_name("AB", 10), hash_name("BA", 10))`]],
    explainer: "Adding up the character codes gives the same total for the same letters in any order, so words made of the same letters always collide." },

  // ---------- Level 3: fill in one blank ----------
  { id: "hash-L3a", level: 3, type: "fill", title: "The hash function",
    description: "Fill in the blank so index is the slot for the key typed, in a table of 11 slots.",
    starter: `size = 11
key = int(input("Key: "))
index = ____
print("Store at index", index)`,
    answers: ["key % size"], tests: [T(["25"]), T(["40"])],
    hints: ["The index must be from 0 to size - 1.", "Use the remainder after dividing by the size."],
    skills: ["hash-function"], tags: ["HASH_NO_MOD"],
    buggy: [["HASH_NO_MOD", `size = 11
key = int(input("Key: "))
index = key
print("Store at index", index)`]],
    explainer: "key % size is the remainder when the key is divided by the table size, so it is always a valid index from 0 to size - 1." },
  { id: "hash-L3b", level: 3, type: "fill", title: "Wrap round",
    description: "Fill in the blank so the probe moves on to the next slot, going back to slot 0 after the last slot.",
    starter: `table = [None] * 5
table[4] = 19
key = int(input("Key: "))
index = key % 5
while table[index] != None:
    index = ____
table[index] = key
print(table)`,
    answers: ["(index + 1) % 5"], tests: [T(["24"]), T(["13"])],
    hints: ["Add 1 to move to the next slot.", "% 5 sends index 5 back to 0."],
    skills: ["linear-probe"], tags: ["HASH_NO_MOD"],
    buggy: [["HASH_NO_MOD", `table = [None] * 5
table[4] = 19
key = int(input("Key: "))
index = key % 5
while table[index] != None:
    index = index + 1
table[index] = key
print(table)`]],
    explainer: "Adding 1 moves to the next slot, and % 5 sends the index from the last slot back to 0, so the probe wraps round the table." },
  { id: "hash-L3c", level: 3, type: "fill", title: "Spot a collision",
    description: "Fill in the blank so the key is only stored if its slot is empty.",
    starter: `table = [None] * 7
table[3] = 10
key = int(input("Key: "))
index = key % 7
if ____:
    table[index] = key
    print("Stored at", index)
else:
    print("Collision at", index)`,
    answers: ["table[index] == None"], tests: [T(["17"]), T(["9"])],
    hints: ["An empty slot holds None.", "Check the slot before storing."],
    skills: ["collision", "store-key"], tags: ["HASH_COLLISION_OVERWRITES"],
    buggy: [["HASH_COLLISION_OVERWRITES", `table = [None] * 7
table[3] = 10
key = int(input("Key: "))
index = key % 7
table[index] = key
print("Stored at", index)`]],
    explainer: "The slot is only used if it is empty, so a key that hashes to a taken slot is reported as a collision instead of replacing what is there." },

  // ---------- Level 4: fill in two blanks ----------
  { id: "hash-L4a", level: 4, type: "fill", title: "Insert with probing",
    description: "Fill in both blanks so each key starts at its home slot, moves on past taken slots, and is stored.",
    starter: `table = [None] * 5
for k in range(3):
    key = int(input("Key: "))
    index = ____
    while table[index] != None:
        index = (index + 1) % 5
    table[index] = ____
print(table)`,
    answers: ["key % 5", "key"], tests: [T(["7", "12", "3"]), T(["5", "10", "15"])],
    hints: ["The home slot is the key's hash.", "Store the key itself in the slot."],
    skills: ["linear-probe", "store-key"], tags: ["HASH_NO_MOD", "HASH_COLLISION_OVERWRITES"],
    buggy: [["HASH_NO_MOD", `table = [None] * 5
for k in range(3):
    key = int(input("Key: "))
    index = key
    while table[index] != None:
        index = (index + 1) % 5
    table[index] = key
print(table)`],
      ["HASH_COLLISION_OVERWRITES", `table = [None] * 5
for k in range(3):
    key = int(input("Key: "))
    index = key % 5
    table[index] = key
print(table)`]],
    explainer: "Each key starts at its home slot, key % 5, and moves along one slot at a time until it finds an empty one to be stored in." },
  { id: "hash-L4b", level: 4, type: "fill", title: "Find a key",
    description: "The table was filled with linear probing. Fill in both blanks so the search finds a key even if it was moved along.",
    starter: `table = [15, None, 7, 22, 12]
key = int(input("Find: "))
index = key % 5
found = False
while table[index] != None and not found:
    if table[index] == ____:
        found = True
    else:
        index = ____
print("Found:", found)`,
    answers: ["key", "(index + 1) % 5"], tests: [T(["22"]), T(["12"]), T(["9"])],
    hints: ["Compare the slot with the key you want.", "If it isn't there, move on to the next slot, wrapping round."],
    skills: ["hash-search", "linear-probe"], tags: ["HASH_SEARCH_STOPS_AT_HOME"],
    buggy: [["HASH_SEARCH_STOPS_AT_HOME", `table = [15, None, 7, 22, 12]
key = int(input("Find: "))
index = key % 5
found = table[index] == key
print("Found:", found)`]],
    explainer: "The search starts at the key's home slot and moves along until it finds the key or an empty slot, because a collided key is stored further on." },
  { id: "hash-L4c", level: 4, type: "fill", title: "A word's slot",
    description: "Fill in both blanks so the function adds up the character codes of the word's letters, then turns the total into an index.",
    starter: `def hash_word(word, size):
    total = 0
    for ch in word:
        total = total + ____
    return total ____ size

print(hash_word(input("Word: "), 10))`,
    answers: ["ord(ch)", "%"], tests: [T(["cat"]), T(["dog"])],
    hints: ["ord(ch) gives a letter's character code.", "The remainder turns the total into an index."],
    skills: ["string-hash", "hash-function"], tags: ["HASH_NO_MOD"],
    buggy: [["HASH_NO_MOD", `def hash_word(word, size):
    total = 0
    for ch in word:
        total = total + ord(ch)
    return total // size

print(hash_word(input("Word: "), 10))`]],
    explainer: "The hash adds up the character code of every letter with ord, then % size turns the total into an index inside the table." },

  // ---------- Level 5: Parsons, or pick the missing line ----------
  { id: "hash-L5a", level: 5, type: "parsons", title: "Build a table",
    description: "Arrange the lines: three keys are stored in a table of 7 slots, with linear probing.\nOne line is not needed.",
    solution: `size = 7
table = [None] * size
for k in range(3):
    key = int(input("Key: "))
    index = key % size
    while table[index] != None:
        index = (index + 1) % size
    table[index] = key
print(table)`,
    distractors: ["index = key // size"],
    tests: [T(["10", "17", "3"]), T(["8", "15", "22"])],
    hints: ["Hash with the remainder.", "Move on while the slot is taken."],
    skills: ["linear-probe", "hash-function"], tags: ["parsons"],
    explainer: "Each key goes to its home slot key % size, and the while loop moves it on past any taken slots before it is stored." },
  { id: "hash-L5b", level: 5, type: "partial-parsons", title: "Keep looking",
    description: "The table was filled with linear probing. Pick the missing line, so a key is found even if it was moved along.",
    starter: `table = [None, 8, 15, 22, None, None, 6]
key = int(input("Find: "))
index = key % 7
____
    if table[index] == key:
        print("Found at", index)
    index = (index + 1) % 7`,
    options: ["while table[index] != None:", "if table[index] != None:", "while table[index] == None:", "while table[index] != key:"],
    optionMisconceptions: { 1: "HASH_SEARCH_STOPS_AT_HOME" },
    tests: [T(["22"]), T(["8"])],
    hints: ["22 hashes to 1, but was moved along.", "Keep going until the slot is empty."],
    skills: ["hash-search", "linear-probe"], tags: ["HASH_SEARCH_STOPS_AT_HOME"],
    explainer: "The search keeps moving along while the slot is not empty, because the key may have been pushed past its home slot by a collision." },
  { id: "hash-L5c", level: 5, type: "partial-parsons", title: "Don't overwrite",
    description: "Pick the missing line, so the key is stored in the first empty slot from its home slot on.",
    starter: `table = [None] * 5
table[2] = 12
table[3] = 8
key = int(input("Key: "))
index = key % 5
____
    index = (index + 1) % 5
table[index] = key
print(table)`,
    options: ["while table[index] != None:", "if table[index] != None:", "while table[index] == None:", "for index in range(5):"],
    optionMisconceptions: { 1: "HASH_COLLISION_OVERWRITES" },
    tests: [T(["17"]), T(["6"])],
    hints: ["The key's home slot and the slot after it may both be taken.", "Keep moving on while the slot is taken."],
    skills: ["linear-probe", "collision"], tags: ["HASH_COLLISION_OVERWRITES"],
    explainer: "The while loop keeps moving on while the slot is taken, so the key is never written over another key." },

  // ---------- Level 6: Parsons with traps, or pick the missing line ----------
  { id: "hash-L6a", level: 6, type: "parsons", title: "A find function",
    description: "Arrange the lines: find returns the index of the key, or -1 if it isn't in the table.\nTwo lines are not needed.",
    solution: `def find(table, key):
    index = key % len(table)
    while table[index] != None:
        if table[index] == key:
            return index
        index = (index + 1) % len(table)
    return -1
table = [14, None, 9, 16, None, None, None]
print(find(table, int(input("Key: "))))`,
    distractors: ["index = key % len(table) + 1", "return False"],
    tests: [T(["16"]), T(["23"]), T(["14"])],
    hints: ["Start at the home slot.", "An empty slot means the key isn't there: return -1."],
    skills: ["hash-search", "linear-probe"], tags: ["find"],
    explainer: "find starts at the key's home slot and probes along until it finds the key, giving its index, or reaches an empty slot, giving -1." },
  { id: "hash-L6b", level: 6, type: "partial-parsons", title: "Store some words",
    description: "Each word's hash is the total of its letters' character codes. Pick the missing line, so each word is stored at its slot.",
    starter: `size = 10
table = [None] * size
for word in ["ant", "bee", "cat"]:
    total = 0
    for ch in word:
        total = total + ord(ch)
    ____
    table[index] = word
print(table)`,
    options: ["index = total % size", "index = total", "index = total // size", "index = size % total"],
    optionMisconceptions: { 1: "HASH_NO_MOD" },
    tests: [T([])],
    hints: ["The total is far bigger than the table.", "Turn it into an index from 0 to size - 1."],
    skills: ["string-hash", "hash-function"], tags: ["HASH_NO_MOD"],
    explainer: "total % size turns any word's total into an index from 0 to size - 1, so every word has a slot in the table." },

  // ---------- Level 7: trace, or write a short line ----------
  { id: "hash-L7a", level: 7, type: "trace", title: "Trace an insert",
    description: "Trace the program. Here 0 marks an empty slot.",
    solution: `table = [0, 0, 0, 0, 0]
for key in [6, 11, 3]:
    index = key % 5
    while table[index] != 0:
        index = (index + 1) % 5
    table[index] = key
print(table)`, tests: [T([])],
    trace: { columns: ["key", "index", "table"] },
    hints: ["6 and 11 both hash to 1.", "11 moves on to the next empty slot."],
    skills: ["linear-probe", "store-key"], tags: ["HASH_COLLISION_OVERWRITES"],
    buggy: [["HASH_COLLISION_OVERWRITES", `table = [0, 0, 0, 0, 0]
for key in [6, 11, 3]:
    index = key % 5
    table[index] = key
print(table)`]],
    explainer: "Each key's index starts at key % 5 and moves along while the slot holds a key, and 0 marks an empty slot." },
  { id: "hash-L7b", level: 7, type: "write", title: "Write the hash",
    description: "Finish the function hash_key so it returns the index for key in a table of the given size, using the remainder. The program then prints that index.",
    starter: `def hash_key(key, size):
    # Return the index for key in a table of this size

print(hash_key(int(input("Key: ")), int(input("Size: "))))`,
    solution: `def hash_key(key, size):
    return key % size

print(hash_key(int(input("Key: ")), int(input("Size: "))))`,
    tests: [T(["37", "11"]), T(["50", "7"])],
    hints: ["The index must be from 0 to size - 1.", "Return the remainder after dividing key by size."],
    skills: ["hash-function"], tags: ["HASH_NO_MOD"],
    buggy: [["HASH_NO_MOD", `def hash_key(key, size):
    return key // size

print(hash_key(int(input("Key: ")), int(input("Size: "))))`]],
    explainer: "key % size is the remainder after dividing the key by the size, which is always a valid index in the table." },
  { id: "hash-L7c", level: 7, type: "trace", title: "Trace a search",
    description: "Trace the program. Here 0 marks an empty slot; the table was filled with linear probing.",
    solution: `table = [20, 0, 0, 13, 8]
key = 18
index = key % 5
found = False
while table[index] != 0 and not found:
    if table[index] == key:
        found = True
    else:
        index = (index + 1) % 5
print(found, index)`, tests: [T([])],
    trace: { columns: ["key", "index", "found"] },
    hints: ["18 hashes to 3.", "The search wraps round from slot 4 to slot 0."],
    skills: ["hash-search", "linear-probe"], tags: ["HASH_SEARCH_STOPS_AT_HOME"],
    buggy: [["HASH_SEARCH_STOPS_AT_HOME", `table = [20, 0, 0, 13, 8]
key = 18
index = key % 5
found = False
if table[index] == key:
    found = True
print(found, index)`]],
    explainer: "The search follows the same probing as an insert, wrapping round with % 5, and only stops early when it finds the key or an empty slot." },

  // ---------- Level 8: trace, or write ----------
  { id: "hash-L8a", level: 8, type: "write", title: "Fill a table",
    description: "A hash table of 7 slots stores whole numbers using key % 7, with linear probing (move on one slot, wrapping round, until an empty slot is found). Make the table as a list of 7 None values. Ask for 4 keys and store each one, then print the table, for example:\n[14, None, 9, 16, None, None, 20]",
    starter: "# Make the table, then store the 4 keys",
    solution: `table = [None] * 7
for k in range(4):
    key = int(input("Key: "))
    index = key % 7
    while table[index] != None:
        index = (index + 1) % 7
    table[index] = key
print(table)`,
    tests: [T(["14", "9", "16", "20"]), T(["3", "10", "17", "24"])],
    hints: ["[None] * 7 makes the empty table.", "Move on with (index + 1) % 7 while the slot is taken."],
    skills: ["linear-probe", "store-key"], tags: ["HASH_COLLISION_OVERWRITES", "HASH_NO_MOD"],
    buggy: [["HASH_COLLISION_OVERWRITES", `table = [None] * 7
for k in range(4):
    key = int(input("Key: "))
    index = key % 7
    table[index] = key
print(table)`],
      ["HASH_NO_MOD", `table = [None] * 7
for k in range(4):
    key = int(input("Key: "))
    index = key
    while table[index] != None:
        index = (index + 1) % 7
    table[index] = key
print(table)`]],
    explainer: "Each key starts at its home slot, key % 7, and probes along to the next empty slot, so keys that collide are all kept." },
  { id: "hash-L8b", level: 8, type: "trace", title: "Trace a word hash",
    description: "Trace the program. ord(\"a\") is 97, ord(\"b\") is 98 and ord(\"c\") is 99.",
    solution: `word = "cab"
total = 0
for ch in word:
    total = total + ord(ch)
index = total % 8
print(index)`, tests: [T([])],
    trace: { columns: ["ch", "total", "index"] },
    hints: ["Add each letter's code to total.", "Then take the remainder after dividing by 8."],
    skills: ["string-hash"], tags: ["HASH_NO_MOD"],
    buggy: [["HASH_NO_MOD", `word = "cab"
total = 0
for ch in word:
    total = total + ord(ch)
index = total
print(index)`]],
    explainer: "The hash adds each letter's character code to total, then % 8 turns the total into an index inside the table." },

  // ---------- Level 9: write a full program, or a longer trace ----------
  { id: "hash-L9a", level: 9, type: "write", title: "A table of names",
    description: "A hash table of 5 slots holds names. A name's hash is the total of its letters' character codes (use ord), % 5, and collisions use linear probing. Store the names Ava, Ben and Cal, in that order. Then ask for a name and print the index it is stored at, or Not found, for example:\nIndex: 3",
    starter: "# Write the hash function, store the names, then search",
    solution: `def hash_name(name, size):
    total = 0
    for ch in name:
        total = total + ord(ch)
    return total % size

table = [None] * 5
for name in ["Ava", "Ben", "Cal"]:
    index = hash_name(name, 5)
    while table[index] != None:
        index = (index + 1) % 5
    table[index] = name
look = input("Name: ")
index = hash_name(look, 5)
while table[index] != None and table[index] != look:
    index = (index + 1) % 5
if table[index] == look:
    print("Index:", index)
else:
    print("Not found")`,
    tests: [T(["Cal"]), T(["Ava"]), T(["Dan"])],
    hints: ["Store and search with the same hash and the same probing.", "An empty slot means the name isn't in the table."],
    skills: ["string-hash", "hash-search", "linear-probe"], tags: ["HASH_SEARCH_STOPS_AT_HOME", "HASH_COLLISION_OVERWRITES"],
    buggy: [["HASH_SEARCH_STOPS_AT_HOME", `def hash_name(name, size):
    total = 0
    for ch in name:
        total = total + ord(ch)
    return total % size

table = [None] * 5
for name in ["Ava", "Ben", "Cal"]:
    index = hash_name(name, 5)
    while table[index] != None:
        index = (index + 1) % 5
    table[index] = name
look = input("Name: ")
index = hash_name(look, 5)
if table[index] == look:
    print("Index:", index)
else:
    print("Not found")`],
      ["HASH_COLLISION_OVERWRITES", `def hash_name(name, size):
    total = 0
    for ch in name:
        total = total + ord(ch)
    return total % size

table = [None] * 5
for name in ["Ava", "Ben", "Cal"]:
    index = hash_name(name, 5)
    table[index] = name
look = input("Name: ")
index = hash_name(look, 5)
while table[index] != None and table[index] != look:
    index = (index + 1) % 5
if table[index] == look:
    print("Index:", index)
else:
    print("Not found")`]],
    explainer: "Storing and searching use the same hash and the same probing, so a name pushed along by a collision is found again by following the same steps." },
  { id: "hash-L9b", level: 9, type: "trace", title: "Trace the wrap-round",
    description: "Trace the program. Here 0 marks an empty slot. Every key hashes to the last slot.",
    solution: `table = [0, 0, 0, 0, 0, 0]
for key in [11, 17, 5, 23]:
    index = key % 6
    probes = 0
    while table[index] != 0:
        index = (index + 1) % 6
        probes = probes + 1
    table[index] = key
print(table, probes)`, tests: [T([])],
    trace: { columns: ["key", "index", "probes", "table"] },
    hints: ["After slot 5, (index + 1) % 6 goes back to 0.", "probes counts the moves for the key being stored."],
    skills: ["linear-probe", "collision"], tags: ["HASH_NO_MOD"],
    buggy: [["HASH_NO_MOD", `table = [0, 0, 0, 0, 0, 0]
for key in [11, 17, 5, 23]:
    index = key % 6
    probes = 0
    while table[index] != 0:
        index = index + 1
        probes = probes + 1
    table[index] = key
print(table, probes)`]],
    explainer: "Every key here hashes to the last slot, so each one probes further along, and % 6 wraps the index round to the start of the table." },

  // ---------- Level 10: write an extended program, or a longer trace ----------
  { id: "hash-L10a", level: 10, type: "write", title: "A HashTable class",
    description: "Write a class HashTable whose __init__ stores size and makes a list slots of size None values (size is passed in). Give it insert(self, key), which stores key using key % size and linear probing, and find(self, key), which returns the index of key, or -1 if it isn't there. Make a table of size 7, ask for 3 keys and insert them. Then ask for a key to find and print what find returns: its index, or -1.",
    starter: "# Write the HashTable class, then use it",
    solution: `class HashTable:
    def __init__(self, size):
        self.size = size
        self.slots = [None] * size

    def insert(self, key):
        index = key % self.size
        while self.slots[index] != None:
            index = (index + 1) % self.size
        self.slots[index] = key

    def find(self, key):
        index = key % self.size
        while self.slots[index] != None:
            if self.slots[index] == key:
                return index
            index = (index + 1) % self.size
        return -1

h = HashTable(7)
for k in range(3):
    h.insert(int(input("Key: ")))
print(h.find(int(input("Find: "))))`,
    tests: [T(["10", "17", "24", "24"]), T(["8", "15", "4", "9"])],
    hints: ["insert and find both start at key % self.size.", "find stops at an empty slot and returns -1."],
    skills: ["hash-search", "linear-probe", "store-key"], tags: ["HASH_SEARCH_STOPS_AT_HOME", "HASH_COLLISION_OVERWRITES"],
    buggy: [["HASH_SEARCH_STOPS_AT_HOME", `class HashTable:
    def __init__(self, size):
        self.size = size
        self.slots = [None] * size

    def insert(self, key):
        index = key % self.size
        while self.slots[index] != None:
            index = (index + 1) % self.size
        self.slots[index] = key

    def find(self, key):
        index = key % self.size
        if self.slots[index] == key:
            return index
        return -1

h = HashTable(7)
for k in range(3):
    h.insert(int(input("Key: ")))
print(h.find(int(input("Find: "))))`],
      ["HASH_COLLISION_OVERWRITES", `class HashTable:
    def __init__(self, size):
        self.size = size
        self.slots = [None] * size

    def insert(self, key):
        index = key % self.size
        self.slots[index] = key

    def find(self, key):
        index = key % self.size
        while self.slots[index] != None:
            if self.slots[index] == key:
                return index
            index = (index + 1) % self.size
        return -1

h = HashTable(7)
for k in range(3):
    h.insert(int(input("Key: ")))
print(h.find(int(input("Find: "))))`]],
    explainer: "insert and find both start at key % size and probe along in the same way, so find follows the exact path insert took to store the key." },
  { id: "hash-L10b", level: 10, type: "trace", title: "Trace a failed search",
    description: "Trace the program. Here 0 marks an empty slot; the table was filled with linear probing.",
    solution: `table = [21, 0, 9, 16, 23, 0, 13]
key = 30
index = key % 7
steps = 1
while table[index] != key and table[index] != 0:
    index = (index + 1) % 7
    steps = steps + 1
found = table[index] == key
print(found, steps)`, tests: [T([])],
    trace: { columns: ["key", "index", "steps", "found"] },
    hints: ["30 hashes to 2.", "The search stops at the first empty slot."],
    skills: ["hash-search", "linear-probe"], tags: ["HASH_SEARCH_STOPS_AT_HOME"],
    buggy: [["HASH_SEARCH_STOPS_AT_HOME", `table = [21, 0, 9, 16, 23, 0, 13]
key = 30
index = key % 7
steps = 1
found = table[index] == key
print(found, steps)`]],
    explainer: "The search moves along one slot at a time, counting steps, and an empty slot proves the key isn't in the table because it would have been stored there." },
];

// Placement (levels 2, 5, 7 and 9): no buggy variants.
const PLACEMENT = [
  { id: "hash-P2a", level: 2, type: "predict", title: "Two hashes",
    description: "The hash for a table of 8 slots is key % size. What does the program print?",
    solution: `size = 8
for key in [19, 27]:
    print(key % size)`, tests: [T([])],
    wrongOutputs: ["2\n3", "19\n27", "3\n4"],
    hints: ["% gives the remainder.", "Two keys can have the same remainder."],
    skills: ["hash-function", "collision"], tags: ["hash"],
    explainer: "The hash key % size gives the remainder after dividing by the table size, and two different keys can give the same remainder." },
  { id: "hash-P2b", level: 2, type: "predict", title: "Two keys in a table",
    description: "Each key is stored at its hash. What does the program print?",
    solution: `table = [None] * 4
table[9 % 4] = 9
table[6 % 4] = 6
print(table)`, tests: [T([])],
    wrongOutputs: ["[9, 6, None, None]", "[None, 6, 9, None]", "[None, 9, None, 6]"],
    hints: ["Work out 9 % 4 and 6 % 4.", "Each key goes in the slot its hash gives."],
    skills: ["store-key", "hash-function"], tags: ["hash"],
    explainer: "Each key is stored at the index its hash gives, not in the next free place." },
  { id: "hash-P5a", level: 5, type: "parsons", title: "Store a key",
    description: "Arrange the lines: the key typed is stored at its hash in a table of 5 slots.\nOne line is not needed.",
    solution: `table = [None] * 5
key = int(input("Key: "))
index = key % 5
table[index] = key
print("Stored at", index)
print(table)`,
    distractors: ["index = key"],
    tests: [T(["13"]), T(["21"])],
    hints: ["Hash the key first.", "Then store it at that index."],
    skills: ["hash-function", "store-key"], tags: ["parsons"],
    explainer: "The key is stored at the index key % 5 gives, which is always inside the table." },
  { id: "hash-P5b", level: 5, type: "partial-parsons", title: "The next free slot",
    description: "Pick the missing line, so the key moves on past a taken slot before it is stored.",
    starter: `table = [None] * 5
table[1] = 6
key = int(input("Key: "))
index = key % 5
____
    index = (index + 1) % 5
table[index] = key
print(table)`,
    options: ["while table[index] != None:", "while table[index] == None:", "if table[index] == None:", "for index in range(5):"],
    tests: [T(["11"]), T(["3"])],
    hints: ["Move on only while the slot is taken.", "A taken slot isn't None."],
    skills: ["linear-probe"], tags: ["probe"],
    explainer: "The loop moves the index on while the slot is taken, so the key is stored in the first empty slot after its home slot." },
  { id: "hash-P7a", level: 7, type: "trace", title: "Trace a collision",
    description: "Trace the program. Here 0 marks an empty slot.",
    solution: `table = [0, 0, 0, 0]
for key in [5, 9]:
    index = key % 4
    if table[index] != 0:
        index = (index + 1) % 4
    table[index] = key
print(table)`, tests: [T([])],
    trace: { columns: ["key", "index", "table"] },
    hints: ["5 and 9 both hash to 1.", "9 moves on one slot."],
    skills: ["collision", "linear-probe"], tags: ["trace"],
    explainer: "Both keys hash to the same slot, so the second one is moved on to the next slot, and 0 marks an empty slot." },
  { id: "hash-P7b", level: 7, type: "write", title: "Work out the index",
    description: "Add one line that sets index to the slot for key in a table of 9 slots, using the hash key % 9. The program then prints it, for example:\nIndex: 4",
    starter: `key = int(input("Key: "))
# Work out index from key, for a table of 9 slots

print("Index:", index)`,
    solution: `key = int(input("Key: "))
index = key % 9

print("Index:", index)`,
    tests: [T(["40"]), T(["18"])],
    hints: ["Use the remainder after dividing by 9.", "Store it in index."],
    skills: ["hash-function"], tags: ["write"],
    explainer: "key % 9 is the remainder after dividing by nine, which picks one of the nine slots, 0 to 8." },
  { id: "hash-P9a", level: 9, type: "write", title: "Three keys",
    description: "Make a hash table of 6 slots as a list of 6 None values. Ask for 3 keys and store each at key % 6, using linear probing if the slot is taken. Then print the table, for example:\n[None, 7, 13, 3, None, None]",
    solution: `table = [None] * 6
for k in range(3):
    key = int(input("Key: "))
    index = key % 6
    while table[index] != None:
        index = (index + 1) % 6
    table[index] = key
print(table)`,
    tests: [T(["7", "13", "3"]), T(["6", "12", "18"])],
    hints: ["[None] * 6 makes the table.", "Move on with (index + 1) % 6 while the slot is taken."],
    skills: ["linear-probe", "store-key"], tags: ["write"],
    explainer: "Each key starts at its home slot and the loop moves it to the next free slot, so a collision never loses a key." },
  { id: "hash-P9b", level: 9, type: "trace", title: "Trace a short word",
    description: "Trace the program. ord(\"h\") is 104 and ord(\"i\") is 105.",
    solution: `word = "hi"
total = 0
for ch in word:
    total = total + ord(ch)
index = total % 10
print(index)`, tests: [T([])],
    trace: { columns: ["ch", "total", "index"] },
    hints: ["Add each letter's code.", "Then take the remainder after dividing by 10."],
    skills: ["string-hash"], tags: ["trace"],
    explainer: "Each letter's code is added to total, and the remainder after dividing by ten gives the slot." },
];

const COVERAGE = {
  "The hash function: key % size gives an index": ["hash-L1a", "hash-L3a", "hash-L7b", "hash-P2a", "hash-P5a", "hash-P7b"],
  "Storing keys at their index": ["hash-L1b", "hash-L5a", "hash-L8a", "hash-P2b", "hash-P5a"],
  "Collisions: two keys with the same index": ["hash-L1c", "hash-L2c", "hash-L3c", "hash-L5c", "hash-P7a"],
  "Linear probing that wraps round with %": ["hash-L2a", "hash-L3b", "hash-L4a", "hash-L5a", "hash-L7a", "hash-L8a", "hash-L9b", "hash-P5b", "hash-P9a"],
  "Searching a hash table": ["hash-L2b", "hash-L4b", "hash-L5b", "hash-L6a", "hash-L7c", "hash-L9a", "hash-L10a", "hash-L10b"],
  "Hashing a word with ord()": ["hash-L2c", "hash-L4c", "hash-L6b", "hash-L8b", "hash-L9a", "hash-P9b"],
};

// Tasks that cast input() with int() say so (the casting sentence, tools/unit-tasks.js nameCasting).
nameCasting(PRACTICE.concat(PLACEMENT));

if (require.main === module) addUnit("hash-tables", PRACTICE, PLACEMENT);
module.exports = { PRACTICE, PLACEMENT, COVERAGE };
