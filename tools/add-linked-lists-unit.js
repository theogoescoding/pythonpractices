// One-off (2026-11): the "Linked lists" unit (id linked-lists, A-level data structures), built with
// tools/unit-tasks.js. The A-level ladder, placement at levels 2, 5, 7 and 9 (no buggy variants), and an explainer on
// every task (see tools/add-recursion-unit.js). Every program uses the same Node class (data, and next, which starts as
// None). In a trace table a node's data is a column of its own (cur.data); a next that refers to a node, or is None,
// isn't shown. No buggy variant here can run for ever (a node joined to itself would): the lost-reference variants cut
// the list short instead. COVERAGE lists each angle and its tasks.
"use strict";
const { T, addUnit, nameCasting } = require("./unit-tasks.js");

const NODE = `class Node:
    def __init__(self, data):
        self.data = data
        self.next = None
`;
// The class as one block of Parsons lines (no blank line after it).
const NODE_LINES = NODE.trimEnd();

const PRACTICE = [
  // ---------- Level 1: predict ----------
  { id: "ll-L1a", level: 1, type: "predict", title: "Two nodes",
    description: "Each Node holds data and next, a reference to the next node. What does the program print?",
    solution: NODE + `
a = Node(5)
b = Node(8)
a.next = b
print(a.data, a.next.data)`, tests: [T([])],
    wrongOutputs: ["5 5", "8 5", "5 None"],
    hints: ["a.next is the node b.", "So a.next.data is b's data."],
    skills: ["node"], tags: ["node"],
    explainer: "Each node holds its own data, and a.next refers to the next node, so a.next.data reads the data stored in that next node." },
  { id: "ll-L1b", level: 1, type: "predict", title: "Add up the list",
    description: "cur goes along the list from head. What does the program print?",
    solution: NODE + `
head = Node(3)
head.next = Node(6)
head.next.next = Node(2)
cur = head
total = 0
while cur != None:
    total = total + cur.data
    cur = cur.next
print(total)`, tests: [T([])],
    wrongOutputs: ["3", "2"],
    hints: ["The loop runs once for each node.", "It stops when cur moves past the last node, to None."],
    skills: ["traverse"], tags: ["LINKED_STOPS_EARLY"],
    buggy: [["LINKED_STOPS_EARLY", NODE + `
head = Node(3)
head.next = Node(6)
head.next.next = Node(2)
cur = head
total = 0
while cur.next != None:
    total = total + cur.data
    cur = cur.next
print(total)`]],
    explainer: "cur starts at head and moves along with cur = cur.next, adding each node's data, until it moves past the last node to None." },
  { id: "ll-L1c", level: 1, type: "predict", title: "A new first node",
    description: "A new node is added at the front of the list. What does the program print?",
    solution: NODE + `
head = Node(4)
new = Node(9)
new.next = head
head = new
print(head.data, head.next == None)`, tests: [T([])],
    wrongOutputs: ["9 True", "4 False"],
    hints: ["new.next = head joins the new node to the old first node.", "head = new makes the list start at the new node."],
    skills: ["insert-front"], tags: ["LINKED_HEAD_NOT_UPDATED"],
    buggy: [["LINKED_HEAD_NOT_UPDATED", NODE + `
head = Node(4)
new = Node(9)
new.next = head
print(head.data, head.next == None)`]],
    explainer: "The new node is linked in front of the old first node, and head is then moved so it refers to the new node." },

  // ---------- Level 2: predict, spot the trap ----------
  { id: "ll-L2a", level: 2, type: "predict", title: "Insert after the first",
    description: "A new node is put in after the first node. What does the program print?",
    solution: NODE + `
head = Node(1)
head.next = Node(2)
head.next.next = Node(3)
new = Node(7)
new.next = head.next
head.next = new
cur = head
count = 0
while cur != None:
    count = count + 1
    cur = cur.next
print(count, head.next.data)`, tests: [T([])],
    wrongOutputs: ["3 7", "4 2"],
    hints: ["new.next is joined to the old second node first.", "Then head.next is changed to new."],
    skills: ["insert-after", "traverse"], tags: ["LINKED_LOST_REFERENCE"],
    buggy: [["LINKED_LOST_REFERENCE", NODE + `
head = Node(1)
head.next = Node(2)
head.next.next = Node(3)
new = Node(7)
head.next = new
cur = head
count = 0
while cur != None:
    count = count + 1
    cur = cur.next
print(count, head.next.data)`]],
    explainer: "new.next is set to the old next node first, so when head.next is changed to new the rest of the list is still joined on behind it." },
  { id: "ll-L2b", level: 2, type: "predict", title: "Find the last node",
    description: "The loop stops on the last node. What does the program print?",
    solution: NODE + `
head = Node(5)
head.next = Node(10)
head.next.next = Node(15)
cur = head
while cur.next != None:
    cur = cur.next
print(cur.data, head.data)`, tests: [T([])],
    wrongOutputs: ["5 5", "10 5"],
    hints: ["Only cur moves.", "head still refers to the first node."],
    skills: ["traverse"], tags: ["LINKED_LOST_REFERENCE"],
    buggy: [["LINKED_LOST_REFERENCE", NODE + `
head = Node(5)
head.next = Node(10)
head.next.next = Node(15)
cur = head
while head.next != None:
    head = head.next
print(cur.data, head.data)`]],
    explainer: "Only cur moves along the list, so head still refers to the first node and the list's start is never lost." },
  { id: "ll-L2c", level: 2, type: "predict", title: "Delete the first node",
    description: "head is moved on by one node. What does the program print?",
    solution: NODE + `
head = Node(8)
head.next = Node(3)
head.next.next = Node(6)
head = head.next
cur = head
out = []
while cur != None:
    out.append(cur.data)
    cur = cur.next
print(out)`, tests: [T([])],
    wrongOutputs: ["[8, 6]", "[6]"],
    hints: ["head = head.next makes the list start at the second node.", "Nothing refers to the old first node any more."],
    skills: ["delete-node", "traverse"], tags: ["LINKED_HEAD_NOT_UPDATED"],
    buggy: [["LINKED_HEAD_NOT_UPDATED", NODE + `
head = Node(8)
head.next = Node(3)
head.next.next = Node(6)
cur = head
out = []
while cur != None:
    out.append(cur.data)
    cur = cur.next
print(out)`]],
    explainer: "Moving head on to the second node removes the first node from the list, because nothing refers to it any more." },

  // ---------- Level 3: fill in one blank ----------
  { id: "ll-L3a", level: 3, type: "fill", title: "Move along",
    description: "Fill in the blank so cur moves along the list, and every node's data is printed.",
    starter: NODE + `
head = Node(int(input("First: ")))
head.next = Node(int(input("Second: ")))
cur = head
while cur != None:
    print(cur.data)
    cur = ____`,
    answers: ["cur.next"], tests: [T(["4", "9"]), T(["7", "1"])],
    hints: ["Each node's next refers to the node after it.", "Move cur to the node after it."],
    skills: ["traverse"], tags: ["traverse"],
    explainer: "cur = cur.next moves cur along to the next node each time round, and the loop stops once it moves past the last node to None." },
  { id: "ll-L3b", level: 3, type: "fill", title: "Move head",
    description: "A new node is added at the front. Fill in the blank so the list starts at the new node.",
    starter: NODE + `
head = Node(int(input("First: ")))
new = Node(int(input("Add at front: ")))
new.next = head
____ = new
print(head.data, head.next.data)`,
    answers: ["head"], tests: [T(["4", "9"]), T(["2", "6"])],
    hints: ["The list starts wherever head refers.", "Make head refer to the new node."],
    skills: ["insert-front"], tags: ["LINKED_HEAD_NOT_UPDATED"],
    buggy: [["LINKED_HEAD_NOT_UPDATED", NODE + `
head = Node(int(input("First: ")))
new = Node(int(input("Add at front: ")))
new.next = head
print(head.data, head.next.data)`]],
    explainer: "After the new node points at the old first node, head must be set to the new node or the list would still start at the old one." },
  { id: "ll-L3c", level: 3, type: "fill", title: "Count the nodes",
    description: "Fill in the blank so every node, including the last, is counted.",
    starter: NODE + `
head = Node(int(input("Data: ")))
head.next = Node(int(input("Data: ")))
head.next.next = Node(int(input("Data: ")))
count = 0
cur = head
while ____:
    count = count + 1
    cur = cur.next
print("Nodes:", count)`,
    answers: ["cur != None"], tests: [T(["4", "9", "2"]), T(["1", "3", "5"])],
    hints: ["The last node's next is None.", "Keep going until cur itself is None."],
    skills: ["traverse"], tags: ["LINKED_STOPS_EARLY"],
    buggy: [["LINKED_STOPS_EARLY", NODE + `
head = Node(int(input("Data: ")))
head.next = Node(int(input("Data: ")))
head.next.next = Node(int(input("Data: ")))
count = 0
cur = head
while cur.next != None:
    count = count + 1
    cur = cur.next
print("Nodes:", count)`]],
    explainer: "The loop has to keep going until cur itself is None, so that the last node, whose next is None, is still counted." },

  // ---------- Level 4: fill in two blanks ----------
  { id: "ll-L4a", level: 4, type: "fill", title: "Put a node in the middle",
    description: "Fill in both blanks so the new node goes between the first and the last node, without losing the last one.",
    starter: NODE + `
head = Node(int(input("First: ")))
head.next = Node(int(input("Last: ")))
new = Node(int(input("Middle: ")))
new.next = ____
head.next = ____
print(head.data, head.next.data, head.next.next.data)`,
    answers: ["head.next", "new"], tests: [T(["1", "9", "5"]), T(["2", "8", "4"])],
    hints: ["Join the new node to the node after head first.", "Then make head point at the new node."],
    skills: ["insert-after"], tags: ["LINKED_LOST_REFERENCE"],
    buggy: [["LINKED_LOST_REFERENCE", NODE + `
head = Node(int(input("First: ")))
head.next = Node(int(input("Last: ")))
new = Node(int(input("Middle: ")))
new.next = None
head.next = new
print(head.data, head.next.data, head.next.next.data)`]],
    explainer: "The new node is pointed at the node after head first, then head is pointed at the new node, so no node is ever cut off." },
  { id: "ll-L4b", level: 4, type: "fill", title: "Search the list",
    description: "Fill in both blanks so the program checks every node for the number typed.",
    starter: NODE + `
head = Node(4)
head.next = Node(11)
head.next.next = Node(7)
look = int(input("Find: "))
cur = head
found = False
while cur != None:
    if ____ == look:
        found = True
    cur = ____
print("Found:", found)`,
    answers: ["cur.data", "cur.next"], tests: [T(["7"]), T(["5"])],
    hints: ["Compare the data of the node cur is on.", "Then move cur on to the next node."],
    skills: ["search-list", "traverse"], tags: ["LINKED_STOPS_EARLY"],
    buggy: [["LINKED_STOPS_EARLY", NODE + `
head = Node(4)
head.next = Node(11)
head.next.next = Node(7)
look = int(input("Find: "))
cur = head
found = False
while cur.next != None:
    if cur.data == look:
        found = True
    cur = cur.next
print("Found:", found)`]],
    explainer: "The loop compares each node's data with the number typed, moving on with cur.next until it has checked every node." },
  { id: "ll-L4c", level: 4, type: "fill", title: "Delete the middle node",
    description: "Fill in both blanks so the second node is removed, and the third is joined straight after the first.",
    starter: NODE + `
head = Node(int(input("Data: ")))
head.next = Node(int(input("Data: ")))
head.next.next = Node(int(input("Data: ")))
gone = head.____
head.next = gone.____
cur = head
while cur != None:
    print(cur.data)
    cur = cur.next`,
    answers: ["next", "next"], tests: [T(["4", "9", "2"]), T(["1", "3", "5"])],
    hints: ["gone is the node after head.", "Join head to the node after gone."],
    skills: ["delete-node"], tags: ["LINKED_LOST_REFERENCE"],
    buggy: [["LINKED_LOST_REFERENCE", NODE + `
head = Node(int(input("Data: ")))
head.next = Node(int(input("Data: ")))
head.next.next = Node(int(input("Data: ")))
gone = head.next
head.next = None
cur = head
while cur != None:
    print(cur.data)
    cur = cur.next`]],
    explainer: "head.next is moved to the node after gone, so the list skips over gone and it is removed without losing the rest." },

  // ---------- Level 5: Parsons, or pick the missing line ----------
  { id: "ll-L5a", level: 5, type: "parsons", title: "Build from the front",
    description: "Arrange the lines: each number typed is added at the front of the list, then the list is printed from head.\nOne line is not needed.",
    solution: NODE_LINES + `
head = None
for k in range(3):
    node = Node(int(input("Add: ")))
    node.next = head
    head = node
cur = head
while cur != None:
    print(cur.data)
    cur = cur.next`,
    distractors: ["while cur.next != None:"],
    tests: [T(["4", "9", "2"]), T(["1", "3", "5"])],
    hints: ["Each new node points at the old head, then becomes head.", "Print every node, the last one too."],
    skills: ["insert-front", "traverse"], tags: ["parsons"],
    explainer: "Each new node is put in front of the old head and becomes the new head, so the numbers are printed in the opposite order to how they were added." },
  { id: "ll-L5b", level: 5, type: "partial-parsons", title: "The biggest number",
    description: "Pick the missing line, so every node is checked and the biggest number is printed.",
    starter: NODE + `
head = Node(int(input("Data: ")))
head.next = Node(int(input("Data: ")))
head.next.next = Node(int(input("Data: ")))
biggest = head.data
cur = head
____
    if cur.data > biggest:
        biggest = cur.data
    cur = cur.next
print("Biggest:", biggest)`,
    options: ["while cur != None:", "while cur.next != None:", "while head != None:", "if cur != None:"],
    optionMisconceptions: { 1: "LINKED_STOPS_EARLY" },
    tests: [T(["4", "9", "12"]), T(["3", "1", "7"])],
    hints: ["The last node has to be checked too.", "Keep going while cur is a node."],
    skills: ["traverse", "search-list"], tags: ["LINKED_STOPS_EARLY"],
    explainer: "The loop runs while cur is a node, so the last node is still checked before cur moves on to None." },
  { id: "ll-L5c", level: 5, type: "partial-parsons", title: "Remove the first node",
    description: "Pick the missing line, so the first node is removed from the list.",
    starter: NODE + `
head = Node(int(input("Data: ")))
head.next = Node(int(input("Data: ")))
head.next.next = Node(int(input("Data: ")))
____
print("First is now", head.data)`,
    options: ["head = head.next", "head.next = head.next.next", "head = None", "head.next = None"],
    optionMisconceptions: { 3: "LINKED_HEAD_NOT_UPDATED" },
    tests: [T(["4", "9", "2"]), T(["1", "3", "5"])],
    hints: ["The list starts wherever head refers.", "Move head on to the second node."],
    skills: ["delete-node"], tags: ["LINKED_HEAD_NOT_UPDATED"],
    explainer: "To delete the first node, head moves on to the second node, and the old first node is left with nothing referring to it." },

  // ---------- Level 6: Parsons with traps, or pick the missing line ----------
  { id: "ll-L6a", level: 6, type: "parsons", title: "Add at the end",
    description: "Arrange the lines: the program walks to the last node and joins a new node on after it.\nTwo lines are not needed.",
    solution: NODE_LINES + `
head = Node(int(input("First: ")))
head.next = Node(int(input("Second: ")))
cur = head
while cur.next != None:
    cur = cur.next
cur.next = Node(int(input("Add at end: ")))
print(cur.next.data, head.next.next.data)`,
    distractors: ["while cur != None:", "head = cur.next"],
    tests: [T(["4", "9", "2"]), T(["1", "3", "5"])],
    hints: ["Stop on the last node, the one whose next is None.", "Join the new node to that node's next."],
    skills: ["insert-after", "traverse"], tags: ["end"],
    explainer: "Here the loop stops on the last node, the one whose next is None, so the new node can be joined on after it." },
  { id: "ll-L6b", level: 6, type: "partial-parsons", title: "Link it in",
    description: "Pick the missing line, so the new node is linked in after the first node.",
    starter: NODE + `
head = Node(int(input("Data: ")))
head.next = Node(int(input("Data: ")))
new = Node(int(input("Insert after the first: ")))
new.next = head.next
____
cur = head
while cur != None:
    print(cur.data)
    cur = cur.next`,
    options: ["head.next = new", "new.next = head", "head = new", "new.next = None"],
    tests: [T(["4", "9", "6"]), T(["1", "3", "2"])],
    hints: ["new already points at the old second node.", "Now point head at new."],
    skills: ["insert-after"], tags: ["insert"],
    explainer: "new already points at the old second node, so pointing head.next at new joins it into the list without losing anything." },

  // ---------- Level 7: trace, or write a short line ----------
  { id: "ll-L7a", level: 7, type: "trace", title: "Trace a list total",
    description: "Trace the program. cur.data is the data of the node cur refers to; it is blank once cur is None.",
    solution: NODE + `
head = Node(6)
head.next = Node(2)
head.next.next = Node(9)
cur = head
total = 0
while cur != None:
    total = total + cur.data
    cur = cur.next
print(total)`, tests: [T([])],
    trace: { columns: ["head.data", "cur.data", "total"] },
    hints: ["cur = cur.next moves cur to the next node.", "Every node's data is added once."],
    skills: ["traverse"], tags: ["LINKED_STOPS_EARLY"],
    buggy: [["LINKED_STOPS_EARLY", NODE + `
head = Node(6)
head.next = Node(2)
head.next.next = Node(9)
cur = head
total = 0
while cur.next != None:
    total = total + cur.data
    cur = cur.next
print(total)`]],
    explainer: "cur.data shows the data of the node cur is on, and cur = cur.next moves it along, so each node's data is added once." },
  { id: "ll-L7b", level: 7, type: "write", title: "Print the list",
    description: "Write the loop that prints every node's data, from head to the end of the list, for example:\n4\n9",
    starter: NODE + `
head = Node(int(input("Data: ")))
head.next = Node(int(input("Data: ")))
cur = head
# Print each node's data and move cur on, until cur is None`,
    solution: NODE + `
head = Node(int(input("Data: ")))
head.next = Node(int(input("Data: ")))
cur = head
while cur != None:
    print(cur.data)
    cur = cur.next`,
    tests: [T(["4", "9"]), T(["7", "2"])],
    hints: ["Loop while cur != None.", "Print cur.data, then move cur to cur.next."],
    skills: ["traverse"], tags: ["LINKED_STOPS_EARLY"],
    buggy: [["LINKED_STOPS_EARLY", NODE + `
head = Node(int(input("Data: ")))
head.next = Node(int(input("Data: ")))
cur = head
while cur.next != None:
    print(cur.data)
    cur = cur.next`]],
    explainer: "The loop prints cur.data and then moves cur on with cur = cur.next, stopping when cur becomes None after the last node." },
  { id: "ll-L7c", level: 7, type: "trace", title: "Trace building from the front",
    description: "Trace the program. Each new node goes at the front of the list.",
    solution: NODE + `
head = None
for n in [3, 8, 5]:
    node = Node(n)
    node.next = head
    head = node
first = head.data
second = head.next.data
print(first, second)`, tests: [T([])],
    trace: { columns: ["n", "node.data", "head.data", "first", "second"] },
    hints: ["Each new node points at the old head.", "Then head moves to the new node."],
    skills: ["insert-front"], tags: ["LINKED_HEAD_NOT_UPDATED"],
    buggy: [["LINKED_HEAD_NOT_UPDATED", NODE + `
head = None
for n in [3, 8, 5]:
    node = Node(n)
    node.next = head
first = head.data
second = head.next.data
print(first, second)`]],
    explainer: "Each new node points at the old head and then becomes head, so head.data always shows the number added most recently." },

  // ---------- Level 8: trace, or write ----------
  { id: "ll-L8a", level: 8, type: "write", title: "Newest first",
    description: "Use the Node class. Ask for 4 numbers and add each one at the front of a linked list that starts at head (head starts as None). Then go along the list from head, printing each node's data, then the total, for example:\n8\n1\n6\n3\nTotal: 18",
    starter: NODE + `
# Add each number at the front, then print the list and the total`,
    solution: NODE + `
head = None
for k in range(4):
    node = Node(int(input("Number: ")))
    node.next = head
    head = node
total = 0
cur = head
while cur != None:
    print(cur.data)
    total = total + cur.data
    cur = cur.next
print("Total:", total)`,
    tests: [T(["3", "6", "1", "8"]), T(["5", "2", "9", "4"])],
    hints: ["Each new node points at head, then head = node.", "Go along with cur until cur is None."],
    skills: ["insert-front", "traverse"], tags: ["LINKED_HEAD_NOT_UPDATED", "LINKED_STOPS_EARLY"],
    buggy: [["LINKED_HEAD_NOT_UPDATED", NODE + `
head = None
for k in range(4):
    node = Node(int(input("Number: ")))
    node.next = head
total = 0
cur = head
while cur != None:
    print(cur.data)
    total = total + cur.data
    cur = cur.next
print("Total:", total)`],
      ["LINKED_STOPS_EARLY", NODE + `
head = None
for k in range(4):
    node = Node(int(input("Number: ")))
    node.next = head
    head = node
total = 0
cur = head
while cur.next != None:
    print(cur.data)
    total = total + cur.data
    cur = cur.next
print("Total:", total)`]],
    explainer: "Adding at the front means each new node points at the old head and then becomes head, so the list is read back newest first." },
  { id: "ll-L8b", level: 8, type: "trace", title: "Trace a deletion",
    description: "Trace the program. The node after head is deleted, then the nodes are counted.",
    solution: NODE + `
head = Node(4)
head.next = Node(7)
head.next.next = Node(1)
prev = head
cur = head.next
prev.next = cur.next
cur = prev.next
count = 0
node = head
while node != None:
    count = count + 1
    node = node.next
print(cur.data, count)`, tests: [T([])],
    trace: { columns: ["prev.data", "cur.data", "node.data", "count"] },
    hints: ["prev.next = cur.next skips over cur's node.", "cur = prev.next then moves cur to the node after prev."],
    skills: ["delete-node", "traverse"], tags: ["LINKED_LOST_REFERENCE"],
    buggy: [["LINKED_LOST_REFERENCE", NODE + `
head = Node(4)
head.next = Node(7)
head.next.next = Node(1)
prev = head
cur = head.next
prev.next = None
cur = prev.next
count = 0
node = head
while node != None:
    count = count + 1
    node = node.next
print(cur.data, count)`]],
    explainer: "prev.next is joined straight to the node after cur, so cur's node is skipped and the list is one node shorter." },

  // ---------- Level 9: write a full program, or a longer trace ----------
  { id: "ll-L9a", level: 9, type: "write", title: "Where is it?",
    description: "Use the Node class. Build a linked list holding 12, then 5, then 30, then 8, in that order, from head. Ask for a number and print its position in the list (the first node is position 1), or Not found, for example:\nPosition: 3",
    starter: NODE + `
# Build the list, then search it`,
    solution: NODE + `
head = Node(12)
head.next = Node(5)
head.next.next = Node(30)
head.next.next.next = Node(8)
look = int(input("Find: "))
cur = head
pos = 1
found = False
while cur != None and not found:
    if cur.data == look:
        found = True
    else:
        pos = pos + 1
        cur = cur.next
if found:
    print("Position:", pos)
else:
    print("Not found")`,
    tests: [T(["30"]), T(["8"]), T(["4"])],
    hints: ["Count the position as cur moves along.", "Stop when the number is found, or when cur is None."],
    skills: ["search-list", "traverse"], tags: ["LINKED_STOPS_EARLY"],
    buggy: [["LINKED_STOPS_EARLY", NODE + `
head = Node(12)
head.next = Node(5)
head.next.next = Node(30)
head.next.next.next = Node(8)
look = int(input("Find: "))
cur = head
pos = 1
found = False
while cur.next != None and not found:
    if cur.data == look:
        found = True
    else:
        pos = pos + 1
        cur = cur.next
if found:
    print("Position:", pos)
else:
    print("Not found")`]],
    explainer: "The search moves cur along one node at a time, counting positions, until it finds the number or runs off the end of the list at None." },
  { id: "ll-L9b", level: 9, type: "trace", title: "Trace an insert in order",
    description: "Trace the program. The list is in order, and the new node is put in its place.",
    solution: NODE + `
head = Node(2)
head.next = Node(6)
head.next.next = Node(9)
new = Node(7)
cur = head
while cur.next != None and cur.next.data < new.data:
    cur = cur.next
new.next = cur.next
cur.next = new
after = new.next.data
before = cur.data
print(before, after)`, tests: [T([])],
    trace: { columns: ["new.data", "cur.data", "after", "before"] },
    hints: ["cur stops on the last node with data smaller than new's.", "new is joined to the node after cur first."],
    skills: ["insert-after", "traverse"], tags: ["LINKED_LOST_REFERENCE"],
    buggy: [["LINKED_LOST_REFERENCE", NODE + `
head = Node(2)
head.next = Node(6)
head.next.next = Node(9)
new = Node(7)
cur = head
while cur.next != None and cur.next.data < new.data:
    cur = cur.next
cur.next = new
after = new.next.data
before = cur.data
print(before, after)`]],
    explainer: "cur stops on the last node smaller than the new one, and the new node is linked in after it, so the list stays in order." },

  // ---------- Level 10: write an extended program, or a longer trace ----------
  { id: "ll-L10a", level: 10, type: "write", title: "A LinkedList class",
    description: "Use the Node class. Write a class LinkedList whose __init__ sets head to None, with these methods: add(self, data) adds a node at the end; remove_first(self) removes the first node; show(self) prints a list of the data in every node, in order. Ask for 4 numbers and add each one. Then remove the first node and show the list, for example:\n[7, 2, 9]",
    starter: NODE + `
# Write the LinkedList class, then use it`,
    solution: NODE + `
class LinkedList:
    def __init__(self):
        self.head = None

    def add(self, data):
        node = Node(data)
        if self.head == None:
            self.head = node
        else:
            cur = self.head
            while cur.next != None:
                cur = cur.next
            cur.next = node

    def remove_first(self):
        if self.head != None:
            self.head = self.head.next

    def show(self):
        out = []
        cur = self.head
        while cur != None:
            out.append(cur.data)
            cur = cur.next
        print(out)

nums = LinkedList()
for k in range(4):
    nums.add(int(input("Number: ")))
nums.remove_first()
nums.show()`,
    tests: [T(["4", "7", "2", "9"]), T(["1", "3", "5", "8"])],
    hints: ["add walks to the last node (its next is None) and joins the new node after it.", "remove_first moves self.head on by one node."],
    skills: ["insert-after", "delete-node", "traverse"], tags: ["LINKED_HEAD_NOT_UPDATED", "LINKED_STOPS_EARLY"],
    buggy: [["LINKED_HEAD_NOT_UPDATED", NODE + `
class LinkedList:
    def __init__(self):
        self.head = None

    def add(self, data):
        node = Node(data)
        if self.head == None:
            self.head = node
        else:
            cur = self.head
            while cur.next != None:
                cur = cur.next
            cur.next = node

    def remove_first(self):
        if self.head != None:
            first = self.head.next

    def show(self):
        out = []
        cur = self.head
        while cur != None:
            out.append(cur.data)
            cur = cur.next
        print(out)

nums = LinkedList()
for k in range(4):
    nums.add(int(input("Number: ")))
nums.remove_first()
nums.show()`],
      ["LINKED_STOPS_EARLY", NODE + `
class LinkedList:
    def __init__(self):
        self.head = None

    def add(self, data):
        node = Node(data)
        if self.head == None:
            self.head = node
        else:
            cur = self.head
            while cur.next != None:
                cur = cur.next
            cur.next = node

    def remove_first(self):
        if self.head != None:
            self.head = self.head.next

    def show(self):
        out = []
        cur = self.head
        while cur.next != None:
            out.append(cur.data)
            cur = cur.next
        print(out)

nums = LinkedList()
for k in range(4):
    nums.add(int(input("Number: ")))
nums.remove_first()
nums.show()`]],
    explainer: "add walks to the last node and joins the new one after it, remove_first moves head on by one node, and show follows next from head to None." },
  { id: "ll-L10b", level: 10, type: "trace", title: "Trace a reversal",
    description: "Trace the program. Each node's next is turned round to point at the node before it.",
    solution: NODE + `
head = Node(1)
head.next = Node(2)
head.next.next = Node(3)
prev = None
cur = head
while cur != None:
    after = cur.next
    cur.next = prev
    prev = cur
    cur = after
head = prev
print(head.data, head.next.data)`, tests: [T([])],
    trace: { columns: ["cur.data", "after.data", "prev.data", "head.data"] },
    hints: ["after keeps the rest of the list before cur.next is changed.", "At the end head moves to prev, the old last node."],
    skills: ["traverse", "insert-front"], tags: ["LINKED_HEAD_NOT_UPDATED"],
    buggy: [["LINKED_HEAD_NOT_UPDATED", NODE + `
head = Node(1)
head.next = Node(2)
head.next.next = Node(3)
prev = None
cur = head
while cur != None:
    after = cur.next
    cur.next = prev
    prev = cur
    cur = after
print(head.data, head.next.data)`]],
    explainer: "Each step turns one node's next round to point back at prev, keeping after so the rest of the list isn't lost, and head finally moves to the old last node." },
];

// Placement (levels 2, 5, 7 and 9): no buggy variants.
const PLACEMENT = [
  { id: "ll-P2a", level: 2, type: "predict", title: "Two steps along",
    description: "Three nodes are joined into a list. What does the program print?",
    solution: NODE + `
a = Node(3)
b = Node(7)
c = Node(5)
a.next = b
b.next = c
print(a.next.next.data)`, tests: [T([])],
    wrongOutputs: ["7", "3", "None"],
    hints: ["a.next is b.", "a.next.next is b.next."],
    skills: ["node"], tags: ["node"],
    explainer: "Each .next moves one node along the list, so following next twice from a reaches the third node." },
  { id: "ll-P2b", level: 2, type: "predict", title: "A list total",
    description: "cur goes along the list from head. What does the program print?",
    solution: NODE + `
head = Node(2)
head.next = Node(4)
head.next.next = Node(6)
count = 0
cur = head
while cur != None:
    count = count + cur.data
    cur = cur.next
print(count)`, tests: [T([])],
    wrongOutputs: ["6", "3", "2"],
    hints: ["The loop visits every node.", "Each node's data is added."],
    skills: ["traverse"], tags: ["traverse"],
    explainer: "cur visits every node from head until it reaches None, adding each node's data as it goes." },
  { id: "ll-P5a", level: 5, type: "parsons", title: "Join two nodes",
    description: "Arrange the lines: two nodes are made from the numbers typed and joined, then their data is added.\nOne line is not needed.",
    solution: NODE_LINES + `
head = Node(int(input("First: ")))
head.next = Node(int(input("Second: ")))
print(head.data + head.next.data)`,
    distractors: ['head = Node(int(input("Second: ")))'],
    tests: [T(["4", "5"]), T(["10", "2"])],
    hints: ["The second node is joined on with head.next.", "Don't replace head."],
    skills: ["node"], tags: ["parsons"],
    explainer: "head is the first node and head.next is joined on to it, so the two data values can be read and added." },
  { id: "ll-P5b", level: 5, type: "partial-parsons", title: "Print every node",
    description: "Pick the missing line, so every node's data is printed.",
    starter: NODE + `
head = Node(int(input("Data: ")))
head.next = Node(int(input("Data: ")))
cur = head
____
    print(cur.data)
    cur = cur.next`,
    options: ["while cur != None:", "while cur.next != None:", "if cur != None:", "while head.next != None:"],
    tests: [T(["4", "9"]), T(["1", "6"])],
    hints: ["The last node has to be printed too.", "Keep going while cur is a node."],
    skills: ["traverse"], tags: ["traverse"],
    explainer: "The loop keeps going while cur is a node, so every node, including the last, has its data printed." },
  { id: "ll-P7a", level: 7, type: "trace", title: "Trace a new first node",
    description: "Trace the program. A node is added at the front.",
    solution: NODE + `
head = Node(5)
node = Node(8)
node.next = head
head = node
cur = head.next
total = head.data + cur.data
print(total)`, tests: [T([])],
    trace: { columns: ["head.data", "node.data", "cur.data", "total"] },
    hints: ["head = node makes the new node the first.", "head.next is then the old first node."],
    skills: ["insert-front"], tags: ["trace"],
    explainer: "The new node is joined in front and becomes head, so head.next now refers to the old first node." },
  { id: "ll-P7b", level: 7, type: "write", title: "Put it at the front",
    description: "Add the two lines that put node at the front of the list. The program then prints the first two numbers, for example:\n9 4",
    starter: NODE + `
head = Node(int(input("First: ")))
node = Node(int(input("New first: ")))
# Put node at the front of the list: two lines

print(head.data, head.next.data)`,
    solution: NODE + `
head = Node(int(input("First: ")))
node = Node(int(input("New first: ")))
node.next = head
head = node

print(head.data, head.next.data)`,
    tests: [T(["4", "9"]), T(["2", "6"])],
    hints: ["Join node to the old first node.", "Then make head refer to node."],
    skills: ["insert-front"], tags: ["write"],
    explainer: "node.next = head joins the new node to the old first one, then head = node makes the list start at the new node." },
  { id: "ll-P9a", level: 9, type: "write", title: "Count the evens",
    description: "Use the Node class. Build a linked list of three nodes holding the numbers typed, in the order typed, from head. Then go along the list and print how many of them are even, for example:\nEven: 2",
    starter: NODE + `
# Build the list, then count the even numbers`,
    solution: NODE + `
head = Node(int(input("Number: ")))
head.next = Node(int(input("Number: ")))
head.next.next = Node(int(input("Number: ")))
even = 0
cur = head
while cur != None:
    if cur.data % 2 == 0:
        even = even + 1
    cur = cur.next
print("Even:", even)`,
    tests: [T(["4", "7", "2"]), T(["1", "3", "6"])],
    hints: ["Join each node to the one before.", "Go along with cur until it is None."],
    skills: ["traverse", "node"], tags: ["write"],
    explainer: "The loop visits every node from head to None and counts the ones whose data divides by two exactly." },
  { id: "ll-P9b", level: 9, type: "trace", title: "Trace the biggest",
    description: "Trace the program. cur goes along the list from head.",
    solution: NODE + `
head = Node(3)
head.next = Node(9)
head.next.next = Node(4)
cur = head
big = 0
while cur != None:
    if cur.data > big:
        big = cur.data
    cur = cur.next
print(big)`, tests: [T([])],
    trace: { columns: ["cur.data", "big"] },
    hints: ["cur moves to the next node each time round.", "big only changes for a bigger number."],
    skills: ["traverse", "search-list"], tags: ["trace"],
    explainer: "cur visits each node in turn, and big only changes when the node's data is bigger than any seen so far." },
];

const COVERAGE = {
  "Nodes: data, and next joining them from head": ["ll-L1a", "ll-L2a", "ll-L3b", "ll-P2a", "ll-P5a", "ll-P7a"],
  "Going along the list from head until None": ["ll-L1b", "ll-L2b", "ll-L3a", "ll-L3c", "ll-L5b", "ll-L7a", "ll-L7b", "ll-L10b", "ll-P2b", "ll-P5b", "ll-P9a", "ll-P9b"],
  "Adding a node at the front": ["ll-L1c", "ll-L3b", "ll-L5a", "ll-L7c", "ll-L8a", "ll-P7a", "ll-P7b"],
  "Adding a node after another one, or at the end": ["ll-L2a", "ll-L4a", "ll-L6a", "ll-L6b", "ll-L9b", "ll-L10a"],
  "Deleting a node": ["ll-L2c", "ll-L4c", "ll-L5c", "ll-L8b", "ll-L10a"],
  "Searching a linked list": ["ll-L4b", "ll-L5b", "ll-L9a", "ll-P9b"],
};

// Tasks that cast input() with int() say so (the casting sentence, tools/unit-tasks.js nameCasting).
nameCasting(PRACTICE.concat(PLACEMENT));

if (require.main === module) addUnit("linked-lists", PRACTICE, PLACEMENT);
module.exports = { PRACTICE, PLACEMENT, COVERAGE };
