// One-off (2026-11): hand-written templates for the A-level data structures units, checked by tools/hand-templates.js
// (20 seeds each).
//   - Combined (3 for each pair of units taught one after the other): debugging + records-tuples, records-tuples +
//     stacks-queues, stacks-queues + linked-lists, linked-lists + hash-tables, hash-tables + arrays-3d. Each uses a task
//     type of its level in one of its units, and a skill from each unit.
//   - Write-from-scratch (1 for each of the five units).
// Every template has an explainer, as the units' bank tasks do. Expected outputs are worked out here in JavaScript and
// checked by running Python.
"use strict";
const { addTemplates } = require("./hand-templates.js");

// Template values are worked out in templates.js, so a list they use is written into the expression itself.
const NAMES_EXPR = JSON.stringify(["Ava", "Ben", "Sam", "Zara", "Ollie", "Priya", "Ali", "Mia", "Leo", "Noah"]);
const NODE = `class Node:
    def __init__(self, data):
        self.data = data
        self.next = None
`;
// A 3D list of numbers as Python prints it.
const PY3D = (v) => v + ".map((layer) => '[' + layer.map((row) => pylist(row)).join(', ') + ']').join(', ')";

addTemplates([
  // ======================= Combined =======================
  // ---------- Debugging + Records and tuples ----------
  { id: "comb-dbg-tup-field", units: ["debugging", "records-tuples"], source: "tup-L1a", level: 1, type: "predict", title: "The wrong field",
    params: { k: { int: [0, 9] }, a: { int: [11, 17] } },
    values: { name: "['Ava', 'Ben', 'Sam', 'Zara', 'Ollie', 'Priya', 'Ali', 'Mia', 'Leo', 'Noah'][k]" },
    description: "pupil is a record of a name, an age and a form group. The program should print the pupil's age, but it has a bug. What does it print?",
    solution: `pupil = ("{{name}}", {{a}}, "10B")
print("Age:", pupil[2])`,
    inputs: [], options: ["Age: 10B", "Age: {{a}}", "Age: {{name}}", "Age: pupil[2]"], answer: 0, shuffleOptions: true,
    hints: ["The fields are numbered from 0.", "The age is the second field."],
    skills: ["first-wrong-value", "field-index"], tags: ["bug"],
    explainer: "The age is the second field, pupil[1], so the bug is the index: pupil[2] reads the third field instead." },
  { id: "comb-dbg-tup-error", units: ["debugging", "records-tuples"], source: "dbg-L3a", level: 3, type: "fill", title: "Changing a tuple",
    params: { k: { int: [0, 5] }, n: { int: [20, 60] }, s: { int: [2, 15] } },
    values: { item: "['pens', 'pads', 'rulers', 'glue', 'tape', 'clips'][k]" },
    description: "The comments show a program that stopped, and its error message. Fill in the line number the message points to.",
    starter: `# This program stopped with an error message:
#
#   1  stock = ("{{item}}", {{n}})
#   2  sold = {{s}}
#   3  stock[1] = stock[1] - sold
#   4  print(stock)
#
#   Traceback (most recent call last):
#     File "main.py", line 3, in <module>
#   TypeError: 'tuple' object does not support item assignment
#
line = "____"
print("The error is on line", line)`,
    answers: ["3"],
    tests: [{ inputs: [], expected: "The error is on line 3" }],
    hints: ["The Traceback names the line.", "A tuple can't be changed, so stock[1] = ... stops the program."],
    skills: ["error-line", "immutable"], tags: ["error message"],
    explainer: "The message points to line 3, where one field of a tuple is changed, and a tuple can't be changed: make a new tuple instead." },
  { id: "comb-dbg-tup-unpack", units: ["debugging", "records-tuples"], source: "tup-L2b", level: 2, type: "predict", title: "Fields the wrong way round",
    params: { k: { int: [0, 9] }, s: { int: [10, 99] } },
    values: { nm: "['Ava', 'Ben', 'Sam', 'Zara', 'Ollie', 'Priya', 'Ali', 'Mia', 'Leo', 'Noah'][k]" },
    description: "The program should print a name, then a score, but it has a bug. What does it print?",
    solution: `name, score = ({{s}}, "{{nm}}")
print(name, "scored", score)`,
    inputs: [], options: ["{{s}} scored {{nm}}", "{{nm}} scored {{s}}", "name scored score", "{{nm}} scored {{nm}}"], answer: 0, shuffleOptions: true,
    hints: ["Unpacking gives the first variable the first value.", "Look at the order inside the brackets."],
    skills: ["first-wrong-value", "unpack"], tags: ["bug"],
    explainer: "The tuple's fields are in the wrong order for the names they are unpacked into, so the bug is the order inside the brackets." },

  // ---------- Records and tuples + Stacks and queues ----------
  { id: "comb-tup-sq-stack", units: ["records-tuples", "stacks-queues"], source: "sq-L1a", level: 1, type: "predict", title: "A stack of records",
    params: { k: { int: [0, 9] }, x: { int: [10, 99] }, y: { int: [10, 99] } },
    values: { a: NAMES_EXPR + "[k]", b: NAMES_EXPR + "[(k + 3) % 10]" },
    description: "Each item on the stack is a record of a name and a mark. What does the program print?",
    solution: `stack = []
stack.append(("{{a}}", {{x}}))
stack.append(("{{b}}", {{y}}))
name, mark = stack.pop()
print(name, mark, len(stack))`,
    inputs: [], options: ["{{b}} {{y}} 1", "{{a}} {{x}} 1", "{{b}} {{y}} 2", "{{y}} {{b}} 1"], answer: 0, shuffleOptions: true,
    hints: ["pop() takes the record pushed last.", "Unpacking puts its fields into name and mark."],
    skills: ["stack", "unpack"], tags: ["stack"],
    explainer: "pop() takes the record pushed last off the top, and unpacking it puts its two fields into name and mark." },
  { id: "comb-tup-sq-queue", units: ["records-tuples", "stacks-queues"], source: "sq-L3b", level: 3, type: "fill", title: "Serve a record",
    params: { k: { int: [0, 9] }, x: { int: [10, 99] }, y: { int: [10, 99] } },
    values: { a: NAMES_EXPR + "[k]", b: NAMES_EXPR + "[(k + 5) % 10]" },
    description: "The queue holds records of a name and a ticket number. Fill in the blank so the record at the front is served.",
    starter: `queue = [("{{a}}", {{x}}), ("{{b}}", {{y}})]
name, ticket = queue.____
print("Serving", name, "with ticket", ticket)`,
    answers: ["pop(0)"],
    tests: [{ inputs: [], expected: "Serving {{a}} with ticket {{x}}" }],
    hints: ["The front of the queue is index 0.", "pop takes an item off and gives it back."],
    skills: ["queue", "unpack"], tags: ["queue"],
    explainer: "pop(0) takes the first record off the front of the queue, and unpacking it gives the name and the ticket number." },
  { id: "comb-tup-sq-history", units: ["records-tuples", "stacks-queues"], source: "tup-L1c", level: 2, type: "predict", title: "The last page",
    params: { k: { int: [0, 5] }, a: { int: [5, 90] }, b: { int: [5, 90] }, c: { int: [5, 90] } },
    values: { p1: "['home', 'news', 'shop', 'help', 'blog', 'maps'][k]", p2: "['news', 'shop', 'help', 'blog', 'maps', 'home'][k]", p3: "['shop', 'help', 'blog', 'maps', 'home', 'news'][k]" },
    description: "history is a stack of the pages visited, each a record of a page and how many seconds were spent on it. What does the program print?",
    solution: `history = [("{{p1}}", {{a}}), ("{{p2}}", {{b}}), ("{{p3}}", {{c}})]
top = history[-1]
print(top[0], len(history))`,
    inputs: [], options: ["{{p3}} 3", "{{p1}} 3", "{{p3}} 2", "{{p2}} 3"], answer: 0, shuffleOptions: true,
    hints: ["The top of the stack is the end of the list.", "Looking with [-1] doesn't take it off."],
    skills: ["stack-use", "field-index"], tags: ["stack"],
    explainer: "history[-1] looks at the top record without taking it off, and [0] is its first field, the page." },

  // ---------- Stacks and queues + Linked lists ----------
  { id: "comb-sq-ll-stack", units: ["stacks-queues", "linked-lists"], source: "ll-L1c", level: 1, type: "predict", title: "A stack of nodes",
    params: { a: { int: [1, 9] }, b: { int: [10, 19] }, c: { int: [20, 29] } },
    description: "A stack can be built from linked nodes: push adds a node at the front, and pop takes the front node off. What does the program print?",
    solution: NODE + `
top = None
for n in [{{a}}, {{b}}, {{c}}]:
    node = Node(n)
    node.next = top
    top = node
popped = top.data
top = top.next
print(popped, top.data)`,
    inputs: [], options: ["{{c}} {{b}}", "{{a}} {{b}}", "{{c}} {{a}}", "{{b}} {{a}}"], answer: 0, shuffleOptions: true,
    hints: ["Each new node goes in front of top.", "The node pushed last is at the top."],
    skills: ["stack", "insert-front"], tags: ["stack"],
    explainer: "Each push puts a new node in front of top, so the node pushed last is at the top and is the first one popped." },
  { id: "comb-sq-ll-queue", units: ["stacks-queues", "linked-lists"], source: "ll-L3a", level: 3, type: "fill", title: "A queue of nodes",
    params: { a: { int: [1, 30] }, b: { int: [31, 60] }, c: { int: [61, 90] } },
    description: "This queue is a linked list: the front of the queue is head. Fill in the blank so serving removes the front node.",
    starter: NODE + `
head = Node({{a}})
head.next = Node({{b}})
head.next.next = Node({{c}})
served = head.data
head = ____
print("Served", served, "next", head.data)`,
    answers: ["head.next"],
    tests: [{ inputs: [], expected: "Served {{a}} next {{b}}" }],
    hints: ["Serving takes the front node off.", "Move head on to the node after it."],
    skills: ["queue", "delete-node"], tags: ["queue"],
    explainer: "The front of this queue is head, so serving takes head's data and then moves head on to the next node." },
  { id: "comb-sq-ll-empty", units: ["stacks-queues", "linked-lists"], source: "sq-L2c", level: 2, type: "predict", title: "Empty the stack",
    params: { a: { int: [2, 40] }, b: { int: [41, 80] } },
    description: "top is the top node of a stack built from linked nodes. What does the program print?",
    solution: NODE + `
top = Node({{a}})
top.next = Node({{b}})
count = 0
while top != None:
    count = count + top.data
    top = top.next
print(count, top == None)`,
    inputs: [], options: ["{{a + b}} True", "{{a}} True", "{{a + b}} False", "{{b}} False"], answer: 0, shuffleOptions: true,
    hints: ["The loop runs until top is None.", "Every node's data is added first."],
    skills: ["empty-check", "traverse"], tags: ["stack"],
    explainer: "Taking nodes off the top until top is None empties the stack, so the loop adds every node's data before it stops." },

  // ---------- Linked lists + Hash tables ----------
  { id: "comb-ll-hash-chain", units: ["linked-lists", "hash-tables"], source: "hash-L1c", level: 1, type: "predict", title: "Chaining",
    params: { h: { int: [0, 4] }, i: { int: [1, 4] }, j: { int: [5, 9] } },
    values: { a: "h + 5 * i", b: "h + 5 * j" },
    description: "This hash table handles collisions by chaining: each slot holds a linked list, and a new key is added at the front of its slot's list. What does the program print?",
    solution: NODE + `
table = [None] * 5
for key in [{{a}}, {{b}}]:
    node = Node(key)
    node.next = table[key % 5]
    table[key % 5] = node
first = table[{{a}} % 5]
print(first.data, first.next.data)`,
    inputs: [], options: ["{{b}} {{a}}", "{{a}} {{b}}", "{{b}} {{b}}", "{{a}} {{a}}"], answer: 0, shuffleOptions: true,
    hints: ["Both keys hash to the same slot.", "The second key's node goes in front of the first."],
    skills: ["insert-front", "collision"], tags: ["chaining"],
    explainer: "Both keys hash to the same slot, so with chaining the second key's node goes in front of the first in that slot's linked list, and neither is lost." },
  { id: "comb-ll-hash-search", units: ["linked-lists", "hash-tables"], source: "ll-L4b", level: 3, type: "fill", title: "Search a chain",
    params: { h: { int: [0, 4] }, i: { int: [1, 4] }, j: { int: [5, 9] }, q: { int: [6, 11] } },
    values: { a: "h + 5 * i", b: "h + 5 * j", c: "(h + 1) % 5 + 5 * q" },
    description: "Each slot of this hash table holds a linked list (chaining). Fill in the blank so the search goes along the list in the key's slot.",
    starter: NODE + `
table = [None] * 5
for key in [{{a}}, {{b}}, {{c}}]:
    node = Node(key)
    node.next = table[key % 5]
    table[key % 5] = node
look = {{a}}
cur = table[look % 5]
found = False
while cur != None:
    if cur.data == look:
        found = True
    cur = ____
print("Found:", found)`,
    answers: ["cur.next"],
    tests: [{ inputs: [], expected: "Found: True" }],
    hints: ["The key is the second node in its slot's list.", "Move cur on to the next node."],
    skills: ["search-list", "hash-search"], tags: ["chaining"],
    explainer: "The search only walks the linked list in the key's own slot, moving on with cur.next until it finds the key or reaches None." },
  { id: "comb-ll-hash-count", units: ["linked-lists", "hash-tables"], source: "hash-L2a", level: 2, type: "predict", title: "How long is the chain?",
    params: { h: { int: [0, 3] }, i: { int: [1, 4] }, j: { int: [5, 8] }, m: { int: [0, 1] }, q: { int: [9, 12] } },
    values: { a: "h + 4 * i", b: "h + 4 * j", c: "m === 1 ? h + 4 * q : (h + 1) % 4 + 4 * q" },
    description: "Each slot of this hash table holds a linked list (chaining). What does the program print?",
    solution: NODE + `
table = [None] * 4
for key in [{{a}}, {{b}}, {{c}}]:
    node = Node(key)
    node.next = table[key % 4]
    table[key % 4] = node
count = 0
cur = table[{{a}} % 4]
while cur != None:
    count = count + 1
    cur = cur.next
print(count)`,
    inputs: [], options: ["{{2 + m}}", "{{3 - m}}", "1", "0"], answer: 0, shuffleOptions: true,
    hints: ["Work out key % 4 for each key.", "Count the keys that share the first key's slot."],
    skills: ["traverse", "collision"], tags: ["chaining"],
    explainer: "Every key that hashes to the same slot is kept in that slot's linked list, so walking the list counts the keys that collided there." },

  // ---------- Hash tables + 3D arrays ----------
  { id: "comb-hash-a3d-layer", units: ["hash-tables", "arrays-3d"], source: "a3d-L1a", level: 1, type: "predict", title: "A hashed layer",
    params: { k: { int: [10, 60] } },
    description: "A locker's layer is chosen with a hash, key % 3. What does the program print?",
    solution: `lockers = [[[0, 0], [0, 0]], [[0, 0], [0, 0]], [[0, 0], [0, 0]]]
key = {{k}}
layer = key % 3
lockers[layer][1][0] = key
print(layer, lockers[layer][1])`,
    inputs: [], options: ["{{k % 3}} [{{k}}, 0]", "{{k % 3}} [0, {{k}}]", "{{Math.floor(k / 3)}} [{{k}}, 0]", "{{k}} [{{k}}, 0]"], answer: 0, shuffleOptions: true,
    hints: ["% 3 gives the remainder after dividing by 3.", "[1] is the second row of that layer, and [0] its first item."],
    skills: ["hash-function", "index-3d"], tags: ["hash"],
    explainer: "The hash key % 3 picks one of the three layers, then the next two indexes pick the row and the item inside that layer." },
  { id: "comb-hash-a3d-store", units: ["hash-tables", "arrays-3d"], source: "hash-L3a", level: 3, type: "fill", title: "Store on a shelf",
    params: { k: { int: [10, 70] } },
    values: { out: "(() => { const s = [[[0, 0, 0], [0, 0, 0]], [[0, 0, 0], [0, 0, 0]]]; s[k % 2][0][k % 3] = k; return '[' + s[0].map((r) => pylist(r)).join(', ') + ']\\n[' + s[1].map((r) => pylist(r)).join(', ') + ']'; })()" },
    description: "There are 2 layers of shelves, each with 2 rows of 3 places. A key's layer is its hash, key % 2. Fill in the blank.",
    starter: `shelves = [[[0, 0, 0], [0, 0, 0]], [[0, 0, 0], [0, 0, 0]]]
key = {{k}}
layer = ____
shelves[layer][0][key % 3] = key
print(shelves[0])
print(shelves[1])`,
    answers: ["key % 2"],
    tests: [{ inputs: [], expected: "{{out}}" }],
    hints: ["The layer must be 0 or 1.", "Use the remainder after dividing by 2."],
    skills: ["hash-function", "index-3d"], tags: ["hash"],
    explainer: "key % 2 is always 0 or 1, so it picks one of the two layers, and the key is stored in that layer's first row." },
  { id: "comb-hash-a3d-count", units: ["hash-tables", "arrays-3d"], source: "a3d-L2c", level: 2, type: "predict", title: "Count the slots",
    params: { a: { int: [1, 30] }, b: { int: [1, 30] }, c: { int: [1, 30] }, d: { int: [1, 30] }, e: { int: [1, 30] }, f: { int: [1, 30] }, g: { int: [1, 30] }, h: { int: [1, 30] } },
    values: { counts: "pylist([0, 1, 2].map((r) => [a, b, c, d, e, f, g, h].filter((x) => x % 3 === r).length))" },
    description: "Every key in the cube is counted in the slot its hash, key % 3, gives. What does the program print?",
    solution: `cube = [[[{{a}}, {{b}}], [{{c}}, {{d}}]], [[{{e}}, {{f}}], [{{g}}, {{h}}]]]
slots = [0, 0, 0]
for layer in cube:
    for row in layer:
        for key in row:
            slots[key % 3] = slots[key % 3] + 1
print(slots)`,
    inputs: [], options: ["{{counts}}", "[0, 0, 0]", "[1, 1, 1]", "[8, 8, 8]"], answer: 0, shuffleOptions: true,
    hints: ["Work out key % 3 for all eight keys.", "The three counts add up to 8."],
    skills: ["loop-3d", "hash-function"], tags: ["hash"],
    explainer: "Three loops reach every key in the cube, and each key adds one to the count in the slot its hash, key % 3, gives." },

  // ======================= Write from scratch =======================
  { id: "scratch-tup-cheapest", units: ["records-tuples"], source: "tup-L9a", level: 10, type: "scratch", starter: "", title: "The cheapest item",
    params: { w: { int: [0, 5] } },
    values: { thing: "['item', 'snack', 'toy', 'book', 'drink', 'plant'][w]" },
    description: "Write a program from scratch. Ask how many {{thing}}s there are, then for each {{thing}} ask for its name and its price, and store it in a list as a tuple. Then print the name of the cheapest {{thing}}, for example:\nCheapest: bun",
    solution: `items = []
n = int(input("How many? "))
for k in range(n):
    name = input("Name: ")
    price = int(input("Price: "))
    items.append((name, price))
cheapest = items[0]
for item in items:
    if item[1] < cheapest[1]:
        cheapest = item
print("Cheapest:", cheapest[0])`,
    testParams: { p1: { int: [50, 400] }, p2: { int: [50, 400] }, p3: { int: [50, 400] } },
    testCount: 3,
    test: { inputs: ["3", "tea", "{{p1}}", "cake", "{{p2}}", "bun", "{{p3}}"], expected: "Cheapest: {{['tea', 'cake', 'bun'][[p1, p2, p3].indexOf(Math.min(p1, p2, p3))]}}" },
    hints: ["Store each one with items.append((name, price)).", "Keep the whole cheapest record, then print its first field."],
    skills: ["record-list", "tuple"], tags: ["records"],
    explainer: "Each record keeps a name and a price together, so the cheapest record still knows its own name." },
  { id: "scratch-sq-reverse", units: ["stacks-queues"], source: "sq-L8a", level: 10, type: "scratch", starter: "", title: "Reverse with a stack",
    params: { w: { int: [0, 5] } },
    values: { word: "['Number', 'Score', 'Card', 'Ticket', 'Page', 'Item'][w]" },
    description: "Write a program from scratch. Ask for 4 numbers (\"{{word}}: \") and push each one onto a stack (a list). Then pop and print them until the stack is empty, so they come out in reverse order.",
    solution: `stack = []
for k in range(4):
    stack.append(int(input("{{word}}: ")))
while len(stack) > 0:
    print(stack.pop())`,
    testParams: { a: { int: [1, 99] }, b: { int: [1, 99] }, c: { int: [1, 99] }, d: { int: [1, 99] } },
    testCount: 3,
    test: { inputs: ["{{a}}", "{{b}}", "{{c}}", "{{d}}"], expected: "{{d}}\n{{c}}\n{{b}}\n{{a}}" },
    hints: ["Push with append.", "Pop with pop() while len(stack) > 0."],
    skills: ["stack", "empty-check"], tags: ["stack"],
    explainer: "A stack is last in, first out, so popping until it is empty gives the numbers back in the opposite order." },
  { id: "scratch-ll-total", units: ["linked-lists"], source: "ll-L8a", level: 10, type: "scratch", starter: "", title: "Newest first",
    params: { w: { int: [0, 5] } },
    values: { word: "['Number', 'Score', 'Points', 'Steps', 'Goals', 'Laps'][w]" },
    description: "Write a program from scratch with a class Node (data, and next, which starts as None). Ask for 3 numbers (\"{{word}}: \") and add each one at the front of a linked list that starts at head. Then go along the list from head, printing each node's data, then the total, for example:\n6\n1\n4\nTotal: 11",
    solution: NODE + `
head = None
for k in range(3):
    node = Node(int(input("{{word}}: ")))
    node.next = head
    head = node
total = 0
cur = head
while cur != None:
    print(cur.data)
    total = total + cur.data
    cur = cur.next
print("Total:", total)`,
    testParams: { a: { int: [1, 50] }, b: { int: [1, 50] }, c: { int: [1, 50] } },
    testCount: 3,
    test: { inputs: ["{{a}}", "{{b}}", "{{c}}"], expected: "{{c}}\n{{b}}\n{{a}}\nTotal: {{a + b + c}}" },
    hints: ["Each new node points at head, then head = node.", "Go along with cur while cur != None."],
    skills: ["insert-front", "traverse"], tags: ["linked list"],
    explainer: "Each new node goes in front of the old head, so going along from head reads the numbers back newest first." },
  { id: "scratch-hash-store", units: ["hash-tables"], source: "hash-L8a", level: 10, type: "scratch", starter: "", title: "A probing table",
    params: { size: { int: [5, 9] }, w: { int: [0, 1] } },
    values: { word: "['Key', 'Code'][w]" },
    description: "Write a program from scratch. Make a hash table of {{size}} slots, as a list of {{size}} None values. Ask for 4 keys (\"{{word}}: \") and store each one at key % {{size}}, using linear probing (move on one slot, wrapping round, while the slot is taken). Then print the table.",
    solution: `table = [None] * {{size}}
for k in range(4):
    key = int(input("{{word}}: "))
    index = key % {{size}}
    while table[index] != None:
        index = (index + 1) % {{size}}
    table[index] = key
print(table)`,
    testParams: { a: { int: [1, 60] }, b: { int: [1, 60] }, c: { int: [1, 60] }, d: { int: [1, 60] } },
    testCount: 3,
    test: { inputs: ["{{a}}", "{{b}}", "{{c}}", "{{d}}"],
      expected: "{{(() => { const t = Array(size).fill(null); for (const k of [a, b, c, d]) { let i = k % size; while (t[i] !== null) i = (i + 1) % size; t[i] = k; } return '[' + t.map((x) => (x === null ? 'None' : String(x))).join(', ') + ']'; })()}}" },
    hints: ["[None] * size makes the empty table.", "Move on with (index + 1) % size while the slot isn't None."],
    skills: ["linear-probe", "store-key"], tags: ["hash"],
    explainer: "Each key starts at its home slot and probes along to the next empty one, wrapping round, so no key is ever written over." },
  { id: "scratch-a3d-layer", units: ["arrays-3d"], source: "a3d-L9a", level: 10, type: "scratch", starter: "", title: "One layer's total",
    params: { cube: { choice: [[[[4, 1, 7], [2, 9, 3]], [[5, 5, 0], [8, 6, 2]]], [[[3, 8, 2], [6, 1, 4]], [[9, 0, 5], [7, 3, 6]]], [[[10, 2, 4], [1, 1, 8]], [[6, 7, 3], [2, 12, 5]]],
      [[[5, 5, 5], [2, 0, 9]], [[1, 4, 6], [8, 3, 7]]], [[[7, 2, 9], [4, 4, 1]], [[3, 11, 2], [6, 0, 5]]], [[[2, 6, 3], [9, 1, 7]], [[4, 8, 0], [5, 13, 2]]]] } },
    values: { shown: "'[' + " + PY3D("cube") + " + ']'" },
    description: "Write a program from scratch that stores cube = {{shown}}, a 3D array of 2 layers, each with 2 rows of 3 numbers. Ask for a layer (0 or 1), then print the total of that layer, then the biggest number in the whole cube, for example:\nTotal: 26\nBiggest: 9",
    solution: `cube = {{shown}}
layer = int(input("Layer: "))
total = 0
for row in cube[layer]:
    for n in row:
        total = total + n
biggest = cube[0][0][0]
for lay in cube:
    for row in lay:
        for n in row:
            if n > biggest:
                biggest = n
print("Total:", total)
print("Biggest:", biggest)`,
    testParams: { L: { int: [0, 1] } },
    testCount: 2,
    test: { inputs: ["{{L}}"], expected: "Total: {{cube[L].flat().reduce((x, y) => x + y, 0)}}\nBiggest: {{Math.max(...cube.flat(2))}}" },
    hints: ["cube[layer] is one layer: two loops add it up.", "Three loops reach every number in the cube."],
    skills: ["total-3d", "loop-3d"], tags: ["3D array"],
    explainer: "cube[layer] is one layer's 2D list, so two loops add it up, while three loops are needed to look at every number in the cube." },
]);
