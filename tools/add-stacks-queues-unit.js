// One-off (2026-11): the "Stacks and queues" unit (id stacks-queues, A-level data structures), built with
// tools/unit-tasks.js. The A-level ladder, placement at levels 2, 5, 7 and 9 (no buggy variants), and an explainer on
// every task (see tools/add-recursion-unit.js). A list stack's top is its end (append and pop()); a list queue joins at
// the back with append and leaves from the front with pop(0). COVERAGE lists each angle and its tasks.
"use strict";
const { T, addUnit, nameCasting } = require("./unit-tasks.js");

const PRACTICE = [
  // ---------- Level 1: predict ----------
  { id: "sq-L1a", level: 1, type: "predict", title: "Push and pop",
    description: "stack is a list used as a stack: append pushes, pop() pops. What does the program print?",
    solution: `stack = []
stack.append(4)
stack.append(7)
stack.append(2)
top = stack.pop()
print(top, stack)`, tests: [T([])],
    wrongOutputs: ["2 [4, 7, 2]", "4 [4, 7]"],
    hints: ["append puts each item on the top, the end of the list.", "pop() takes the top item off."],
    skills: ["stack"], tags: ["STACK_POP_FROM_FRONT"],
    buggy: [["STACK_POP_FROM_FRONT", `stack = []
stack.append(4)
stack.append(7)
stack.append(2)
top = stack.pop(0)
print(top, stack)`]],
    explainer: "A stack is last in, first out: append puts an item on the top and pop() takes the most recent item off the top." },
  { id: "sq-L1b", level: 1, type: "predict", title: "Join and leave",
    description: "queue is a list used as a queue: append joins the back, pop(0) leaves from the front. What does the program print?",
    solution: `queue = []
queue.append(5)
queue.append(8)
queue.append(3)
first = queue.pop(0)
print(first, queue)`, tests: [T([])],
    wrongOutputs: ["5 [5, 8, 3]", "8 [5, 3]"],
    hints: ["The first item to join is at the front, index 0.", "pop(0) takes the front item off."],
    skills: ["queue"], tags: ["QUEUE_REMOVE_FROM_BACK"],
    buggy: [["QUEUE_REMOVE_FROM_BACK", `queue = []
queue.append(5)
queue.append(8)
queue.append(3)
first = queue.pop()
print(first, queue)`]],
    explainer: "A queue is first in, first out: append adds to the back and pop(0) takes the item that has waited longest from the front." },
  { id: "sq-L1c", level: 1, type: "predict", title: "Peek at the top",
    description: "The program looks at the top of the stack without taking it off. What does it print?",
    solution: `stack = [3, 9, 6]
stack.append(1)
print(stack[-1], len(stack))`, tests: [T([])],
    wrongOutputs: ["6 3", "1 3"],
    hints: ["The top is the end of the list.", "stack[-1] is the last item."],
    skills: ["stack"], tags: ["STACK_POP_FROM_FRONT"],
    buggy: [["STACK_POP_FROM_FRONT", `stack = [3, 9, 6]
stack.append(1)
print(stack[0], len(stack))`]],
    explainer: "The top of a list stack is its last item, so stack[-1] looks at the top without taking it off, and len counts every item." },

  // ---------- Level 2: predict, spot the trap ----------
  { id: "sq-L2a", level: 2, type: "predict", title: "Push between pops",
    description: "Watch what is on top each time pop() is used. What does the program print?",
    solution: `stack = [2, 5]
stack.append(7)
a = stack.pop()
stack.append(4)
b = stack.pop()
c = stack.pop()
print(a, b, c)`, tests: [T([])],
    wrongOutputs: ["7 5 2", "7 4 2"],
    hints: ["Each pop takes whatever is on top at that moment.", "4 is pushed after 7 has been popped."],
    skills: ["stack"], tags: ["STACK_POP_FROM_FRONT"],
    buggy: [["STACK_POP_FROM_FRONT", `stack = [2, 5]
stack.append(7)
a = stack.pop(0)
stack.append(4)
b = stack.pop(0)
c = stack.pop(0)
print(a, b, c)`]],
    explainer: "Each pop() takes whatever is on top at that moment, so an item pushed after a pop is the next one to come off." },
  { id: "sq-L2b", level: 2, type: "predict", title: "Through a stack",
    description: "Every item leaves the queue and is pushed onto a stack, then popped into out. What does the program print?",
    solution: `queue = [1, 2, 3]
stack = []
while len(queue) > 0:
    stack.append(queue.pop(0))
out = []
while len(stack) > 0:
    out.append(stack.pop())
print(out)`, tests: [T([])],
    wrongOutputs: ["[3, 1, 2]", "[]"],
    hints: ["Items leave the queue from the front.", "The stack gives them back last first."],
    skills: ["stack-use", "queue"], tags: ["QUEUE_REMOVE_FROM_BACK"],
    buggy: [["QUEUE_REMOVE_FROM_BACK", `queue = [1, 2, 3]
stack = []
while len(queue) > 0:
    stack.append(queue.pop())
out = []
while len(stack) > 0:
    out.append(stack.pop())
print(out)`]],
    explainer: "Items leave the queue in the order they joined, and the stack then gives them back in the opposite order." },
  { id: "sq-L2c", level: 2, type: "predict", title: "Pop until empty",
    description: "Each pop may push a smaller number back on. What does the program print?",
    solution: `stack = [6]
count = 0
while len(stack) > 0:
    item = stack.pop()
    count = count + 1
    if item > 2:
        stack.append(item - 2)
print(count, item)`, tests: [T([])],
    wrongOutputs: ["2 2", "3 0", "4 0"],
    hints: ["Write down what is on the stack after each pop.", "The loop stops when the stack is empty."],
    skills: ["empty-check", "stack"], tags: ["trap"],
    explainer: "The loop keeps popping until len(stack) is no longer above zero, and each pop may push a smaller item back on for the next turn." },

  // ---------- Level 3: fill in one blank ----------
  { id: "sq-L3a", level: 3, type: "fill", title: "Push three numbers",
    description: "Fill in the blank so each number typed is pushed onto the stack.",
    starter: `stack = []
for k in range(3):
    ____(int(input("Number: ")))
print("Top:", stack[-1])`,
    answers: ["stack.append"], tests: [T(["4", "9", "2"]), T(["1", "1", "8"])],
    hints: ["Pushing adds to the top, the end of the list.", "A list adds to its end with append."],
    skills: ["stack"], tags: ["push"],
    explainer: "append adds each new number to the end of the list, which is the top of the stack, so stack[-1] is the last one pushed." },
  { id: "sq-L3b", level: 3, type: "fill", title: "Serve the next ticket",
    description: "queue holds ticket numbers in the order they joined. Fill in the blank so the ticket at the front is served.",
    starter: `queue = [12, 15, 9]
queue.append(int(input("Ticket: ")))
served = queue.____
print("Serving ticket", served)
print("Waiting:", len(queue))`,
    answers: ["pop(0)"], tests: [T(["20"]), T(["31"])],
    hints: ["The front of the queue is index 0.", "pop with an index takes that item off."],
    skills: ["queue"], tags: ["QUEUE_REMOVE_FROM_BACK"],
    buggy: [["QUEUE_REMOVE_FROM_BACK", `queue = [12, 15, 9]
queue.append(int(input("Ticket: ")))
served = queue.pop()
print("Serving ticket", served)
print("Waiting:", len(queue))`]],
    explainer: "The ticket that joined first is at the front, index 0, so pop(0) takes it off and the rest move up." },
  { id: "sq-L3c", level: 3, type: "fill", title: "Only pop if there's something there",
    description: "Fill in the blank so the program only pops when the stack has something in it.",
    starter: `stack = []
n = int(input("How many to push? "))
for k in range(n):
    stack.append(k * 10)
if ____:
    print("Popped", stack.pop())
else:
    print("The stack is empty")`,
    answers: ["len(stack) > 0"], tests: [T(["3"]), T(["0"])],
    hints: ["Popping an empty list stops the program with an error.", "Check how many items there are first."],
    skills: ["empty-check"], tags: ["POP_EMPTY_NOT_CHECKED"],
    buggy: [["POP_EMPTY_NOT_CHECKED", `stack = []
n = int(input("How many to push? "))
for k in range(n):
    stack.append(k * 10)
print("Popped", stack.pop())`]],
    explainer: "pop() on an empty list stops the program with an error, so the program checks len(stack) > 0 first and only pops when there is something there." },

  // ---------- Level 4: fill in two blanks ----------
  { id: "sq-L4a", level: 4, type: "fill", title: "A Stack class",
    description: "Fill in both blanks so push adds to the top of the stack and pop takes from the top.",
    starter: `class Stack:
    def __init__(self):
        self.items = []

    def push(self, item):
        self.items.____(item)

    def pop(self):
        return self.items.____

s = Stack()
s.push(int(input("First: ")))
s.push(int(input("Second: ")))
print(s.pop(), s.pop())`,
    answers: ["append", "pop()"], tests: [T(["3", "8"]), T(["5", "1"])],
    hints: ["The top of the stack is the end of the list.", "Add to the end, and take from the end."],
    skills: ["stack-queue-class", "stack"], tags: ["STACK_POP_FROM_FRONT"],
    buggy: [["STACK_POP_FROM_FRONT", `class Stack:
    def __init__(self):
        self.items = []

    def push(self, item):
        self.items.append(item)

    def pop(self):
        return self.items.pop(0)

s = Stack()
s.push(int(input("First: ")))
s.push(int(input("Second: ")))
print(s.pop(), s.pop())`]],
    explainer: "push adds to the end of the list and pop takes from the end, so the end is the top and the second number comes off first." },
  { id: "sq-L4b", level: 4, type: "fill", title: "Serve everyone",
    description: "Fill in both blanks so the loop serves every ticket, from the front of the queue, until the queue is empty.",
    starter: `queue = []
for k in range(3):
    queue.append(int(input("Ticket: ")))
while ____:
    print("Next:", queue.____)`,
    answers: ["len(queue) > 0", "pop(0)"], tests: [T(["4", "7", "1"]), T(["12", "3", "9"])],
    hints: ["Keep going while there is someone in the queue.", "Serve from the front."],
    skills: ["queue", "empty-check"], tags: ["QUEUE_REMOVE_FROM_BACK", "POP_EMPTY_NOT_CHECKED"],
    buggy: [["QUEUE_REMOVE_FROM_BACK", `queue = []
for k in range(3):
    queue.append(int(input("Ticket: ")))
while len(queue) > 0:
    print("Next:", queue.pop())`],
      ["POP_EMPTY_NOT_CHECKED", `queue = []
for k in range(3):
    queue.append(int(input("Ticket: ")))
while True:
    print("Next:", queue.pop(0))`]],
    explainer: "The loop runs while the queue still has items, and pop(0) serves them from the front in the order they joined." },
  { id: "sq-L4c", level: 4, type: "fill", title: "Peek safely",
    description: "Fill in both blanks so peek looks at the top item, and it is only used when the stack isn't empty.",
    starter: `class Stack:
    def __init__(self):
        self.items = []

    def is_empty(self):
        return len(self.items) == 0

    def peek(self):
        return self.items[____]

s = Stack()
s.items.append(int(input("Push: ")))
s.items.append(int(input("Push: ")))
if not s.____():
    print("Top:", s.peek())`,
    answers: ["-1", "is_empty"], tests: [T(["4", "7"]), T(["9", "2"])],
    hints: ["The top is the last item of the list.", "Call the method that checks for an empty stack."],
    skills: ["stack-queue-class", "empty-check"], tags: ["STACK_POP_FROM_FRONT"],
    buggy: [["STACK_POP_FROM_FRONT", `class Stack:
    def __init__(self):
        self.items = []

    def is_empty(self):
        return len(self.items) == 0

    def peek(self):
        return self.items[0]

s = Stack()
s.items.append(int(input("Push: ")))
s.items.append(int(input("Push: ")))
if not s.is_empty():
    print("Top:", s.peek())`]],
    explainer: "peek looks at the last item, the top, without removing it, and is_empty is checked first so peek is never used on an empty stack." },

  // ---------- Level 5: Parsons, or pick the missing line ----------
  { id: "sq-L5a", level: 5, type: "parsons", title: "Reverse a word",
    description: "Arrange the lines: every letter is pushed onto a stack, then popped off to build the word backwards.\nOne line is not needed.",
    solution: `word = input("Word: ")
stack = []
for letter in word:
    stack.append(letter)
backwards = ""
while len(stack) > 0:
    backwards = backwards + stack.pop()
print(backwards)`,
    distractors: ["backwards = backwards + stack.pop(0)"],
    tests: [T(["stack"]), T(["queue"])],
    hints: ["Build the reversed word one letter at a time, stored in backwards.", "The last letter pushed is the first popped."],
    skills: ["stack-use", "stack"], tags: ["parsons"],
    explainer: "Every letter is pushed on, then popped off from the top, so they come off last first and the word is built backwards." },
  { id: "sq-L5b", level: 5, type: "partial-parsons", title: "Now serving",
    description: "Pick the missing line, so the ticket at the front of the queue is served and the others keep waiting.",
    starter: `queue = [int(input("Ticket: ")), int(input("Ticket: ")), int(input("Ticket: "))]
____
print("Now serving", served)
print("Still waiting:", queue)`,
    options: ["served = queue.pop(0)", "served = queue.pop()", "served = queue[0]", "served = queue.pop(1)"],
    optionMisconceptions: { 1: "QUEUE_REMOVE_FROM_BACK" },
    tests: [T(["11", "14", "20"]), T(["3", "8", "5"])],
    hints: ["The front ticket must be taken off the queue.", "The front is index 0."],
    skills: ["queue"], tags: ["QUEUE_REMOVE_FROM_BACK"],
    explainer: "pop(0) removes and returns the front item, so the ticket that joined first is served and the rest stay waiting in order." },
  { id: "sq-L5c", level: 5, type: "partial-parsons", title: "A safe pop",
    description: "Pick the missing line, so pop gives back None instead of an error when the stack is empty.",
    starter: `class Stack:
    def __init__(self):
        self.items = []

    def pop(self):
        ____
            return None
        return self.items.pop()

s = Stack()
s.items.append(int(input("Push: ")))
print(s.pop())
print(s.pop())`,
    options: ["if len(self.items) == 0:", "if len(self.items) > 0:", "if self.items == None:", "if len(self.items) == 1:"],
    optionMisconceptions: { 2: "POP_EMPTY_NOT_CHECKED" },
    tests: [T(["5"]), T(["8"])],
    hints: ["The second pop happens when the stack is empty.", "Return None only when there are no items."],
    skills: ["empty-check", "stack-queue-class"], tags: ["POP_EMPTY_NOT_CHECKED"],
    explainer: "pop first checks whether the list is empty and gives back None, so popping an empty stack never stops the program with an error." },

  // ---------- Level 6: Parsons with traps, or pick the missing line ----------
  { id: "sq-L6a", level: 6, type: "parsons", title: "Check the brackets",
    description: "Arrange the lines: the program uses a stack to check that every ( has a matching ).\nTwo lines are not needed.",
    solution: `text = input("Brackets: ")
stack = []
ok = True
for ch in text:
    if ch == "(":
        stack.append(ch)
    elif len(stack) == 0:
        ok = False
    else:
        stack.pop()
if len(stack) > 0:
    ok = False
print("Balanced:", ok)`,
    distractors: ["elif len(stack) > 0:", "stack.append(text)"],
    tests: [T(["(())"]), T(["())("]), T(["(()"])],
    hints: ["Push each ( and pop for each ).", "A ) with nothing to pop, or anything left at the end, means not balanced."],
    skills: ["stack-use", "empty-check"], tags: ["brackets"],
    explainer: "Each opening bracket is pushed and each closing one pops its partner, so a closing bracket with an empty stack, or anything left over at the end, means unbalanced." },
  { id: "sq-L6b", level: 6, type: "partial-parsons", title: "An array queue",
    description: "The queue is a list of 5 slots, with front and rear pointers. Pick the missing line, so the ticket at the front is served.",
    starter: `queue = [0, 0, 0, 0, 0]
front = 0
rear = 0
for k in range(3):
    queue[rear] = int(input("Join: "))
    rear = rear + 1
____
front = front + 1
print("Served", served, "and", rear - front, "still waiting")`,
    options: ["served = queue[front]", "served = queue[rear - 1]", "served = queue[rear]", "served = queue[front + 1]"],
    optionMisconceptions: { 1: "QUEUE_REMOVE_FROM_BACK" },
    tests: [T(["4", "7", "9"]), T(["2", "6", "1"])],
    hints: ["front points at the item that joined first.", "rear points at the next empty slot."],
    skills: ["pointers", "queue"], tags: ["QUEUE_REMOVE_FROM_BACK"],
    explainer: "In an array queue, front points at the item that joined first, so that is the one served before front moves on by one." },

  // ---------- Level 7: trace, or write a short line ----------
  { id: "sq-L7a", level: 7, type: "trace", title: "Trace a stack",
    description: "Trace the program. Each item of the list stack has its own column.",
    solution: `stack = []
stack.append(5)
stack.append(8)
top = stack.pop()
stack.append(top * 2)
stack.append(3)
top = stack.pop()
size = len(stack)
print(top, size)`, tests: [T([])],
    trace: { columns: ["stack", "top", "size"] },
    hints: ["append adds to the end; pop() takes from the end.", "An empty cell means that item doesn't exist yet, or has gone."],
    skills: ["stack"], tags: ["STACK_POP_FROM_FRONT"],
    buggy: [["STACK_POP_FROM_FRONT", `stack = []
stack.append(5)
stack.append(8)
top = stack.pop(0)
stack.append(top * 2)
stack.append(3)
top = stack.pop(0)
size = len(stack)
print(top, size)`]],
    explainer: "Each push adds a new item at the end, the top, and each pop takes the item at the end off again, so the table shows the top changing." },
  { id: "sq-L7b", level: 7, type: "write", title: "Write push",
    description: "Finish the method push so it adds item to the top of the stack. The program should print, for example:\n[4, 9]",
    starter: `class Stack:
    def __init__(self):
        self.items = []

    def push(self, item):
        # Add item to the top of the stack

s = Stack()
s.push(int(input("Push: ")))
s.push(int(input("Push: ")))
print(s.items)`,
    solution: `class Stack:
    def __init__(self):
        self.items = []

    def push(self, item):
        self.items.append(item)

s = Stack()
s.push(int(input("Push: ")))
s.push(int(input("Push: ")))
print(s.items)`,
    tests: [T(["4", "9"]), T(["7", "2"])],
    hints: ["The top of this stack is the end of the list self.items.", "Add item to the end of self.items."],
    skills: ["stack-queue-class", "stack"], tags: ["STACK_POP_FROM_FRONT"],
    buggy: [["STACK_POP_FROM_FRONT", `class Stack:
    def __init__(self):
        self.items = []

    def push(self, item):
        self.items.insert(0, item)

s = Stack()
s.push(int(input("Push: ")))
s.push(int(input("Push: ")))
print(s.items)`]],
    explainer: "push adds the item to the end of the list, because the end of the list is used as the top of the stack." },
  { id: "sq-L7c", level: 7, type: "trace", title: "Trace a queue",
    description: "Trace the program. Each item of the list queue has its own column.",
    solution: `queue = [4, 7]
queue.append(2)
first = queue.pop(0)
queue.append(first + 5)
second = queue.pop(0)
print(first, second, queue)`, tests: [T([])],
    trace: { columns: ["queue", "first", "second"] },
    hints: ["append adds to the back; pop(0) takes from the front.", "When the front item leaves, the others move up one place."],
    skills: ["queue"], tags: ["QUEUE_REMOVE_FROM_BACK"],
    buggy: [["QUEUE_REMOVE_FROM_BACK", `queue = [4, 7]
queue.append(2)
first = queue.pop()
queue.append(first + 5)
second = queue.pop()
print(first, second, queue)`]],
    explainer: "Items join at the back with append and leave from the front with pop(0), so each item moves forward one place when the front one leaves." },

  // ---------- Level 8: trace, or write ----------
  { id: "sq-L8a", level: 8, type: "write", title: "A Stack class",
    description: "Write a class Stack with a list items, and the methods push(self, item), pop(self) and is_empty(self). Ask for 4 numbers and push each one. Then pop and print them until the stack is empty, for example:\n8\n1\n6\n3",
    starter: "# Write the Stack class, then push and pop the numbers",
    solution: `class Stack:
    def __init__(self):
        self.items = []

    def push(self, item):
        self.items.append(item)

    def pop(self):
        return self.items.pop()

    def is_empty(self):
        return len(self.items) == 0

s = Stack()
for k in range(4):
    s.push(int(input("Number: ")))
while not s.is_empty():
    print(s.pop())`,
    tests: [T(["3", "6", "1", "8"]), T(["5", "2", "9", "4"])],
    hints: ["The top is the end of self.items.", "Loop while not s.is_empty()."],
    skills: ["stack-queue-class", "stack", "empty-check"], tags: ["STACK_POP_FROM_FRONT", "POP_EMPTY_NOT_CHECKED"],
    buggy: [["STACK_POP_FROM_FRONT", `class Stack:
    def __init__(self):
        self.items = []

    def push(self, item):
        self.items.append(item)

    def pop(self):
        return self.items.pop(0)

    def is_empty(self):
        return len(self.items) == 0

s = Stack()
for k in range(4):
    s.push(int(input("Number: ")))
while not s.is_empty():
    print(s.pop())`],
      ["POP_EMPTY_NOT_CHECKED", `class Stack:
    def __init__(self):
        self.items = []

    def push(self, item):
        self.items.append(item)

    def pop(self):
        return self.items.pop()

    def is_empty(self):
        return len(self.items) == 0

s = Stack()
for k in range(4):
    s.push(int(input("Number: ")))
while True:
    print(s.pop())`]],
    explainer: "Each number is pushed onto the top, and popping until is_empty is True takes them back off in the opposite order." },
  { id: "sq-L8b", level: 8, type: "trace", title: "Trace an array stack",
    description: "Trace the program. The stack is a list of 4 slots, and top holds the index of the top item (-1 when it is empty).",
    solution: `stack = [0, 0, 0, 0]
top = -1
for n in [6, 3, 9]:
    top = top + 1
    stack[top] = n
item = stack[top]
top = top - 1
print(item, top)`, tests: [T([])],
    trace: { columns: ["n", "top", "stack", "item"] },
    hints: ["A push moves top up by one, then stores at stack[top].", "A pop reads stack[top], then moves top down."],
    skills: ["pointers", "stack"], tags: ["STACK_POP_FROM_FRONT"],
    buggy: [["STACK_POP_FROM_FRONT", `stack = [0, 0, 0, 0]
top = -1
for n in [6, 3, 9]:
    top = top + 1
    stack[top] = n
item = stack[0]
top = top - 1
print(item, top)`]],
    explainer: "top holds the index of the top item, so a push moves top up by one before storing, and a pop reads stack[top] then moves top down." },

  // ---------- Level 9: write a full program, or a longer trace ----------
  { id: "sq-L9a", level: 9, type: "write", title: "The shop queue",
    description: "Ask how many customers join the queue, then ask for each one's name and add them to the back of the queue (a list). Then serve two customers from the front, printing each name, and print how many are still waiting, for example:\nServed Ava\nServed Ben\nWaiting: 1",
    starter: "# Make the queue, then serve two customers",
    solution: `queue = []
n = int(input("How many? "))
for k in range(n):
    queue.append(input("Name: "))
for k in range(2):
    print("Served", queue.pop(0))
print("Waiting:", len(queue))`,
    tests: [T(["3", "Ava", "Ben", "Cal"]), T(["4", "Zoe", "Kai", "Mo", "Lu"])],
    hints: ["Customers join at the back with append.", "Serve from the front with pop(0)."],
    skills: ["queue"], tags: ["QUEUE_REMOVE_FROM_BACK"],
    buggy: [["QUEUE_REMOVE_FROM_BACK", `queue = []
n = int(input("How many? "))
for k in range(n):
    queue.append(input("Name: "))
for k in range(2):
    print("Served", queue.pop())
print("Waiting:", len(queue))`]],
    explainer: "Customers join at the back with append and are served from the front with pop(0), so they are served in the order they arrived." },
  { id: "sq-L9b", level: 9, type: "trace", title: "Trace the undo button",
    description: "Trace the program. Each number is pushed and added to total; -1 means undo: pop the last number and take it away again.",
    solution: `stack = []
total = 0
for n in [5, -1, 7, 3, -1]:
    if n == -1:
        total = total - stack.pop()
    else:
        stack.append(n)
        total = total + n
print(total, len(stack))`, tests: [T([])],
    trace: { columns: ["n", "stack", "total"] },
    hints: ["An undo pops the number pushed most recently.", "An empty cell means that item has gone."],
    skills: ["stack-use", "stack"], tags: ["STACK_POP_FROM_FRONT"],
    buggy: [["STACK_POP_FROM_FRONT", `stack = []
total = 0
for n in [5, -1, 7, 3, -1]:
    if n == -1:
        total = total - stack.pop(0)
    else:
        stack.append(n)
        total = total + n
print(total, len(stack))`]],
    explainer: "Each number is pushed and added to total, and each -1 pops the most recent number off the top and takes it away again, like an undo button." },

  // ---------- Level 10: write an extended program, or a longer trace ----------
  { id: "sq-L10a", level: 10, type: "write", title: "A Queue class",
    description: "Write a class Queue with a list items and the methods enqueue(self, item), dequeue(self) and is_empty(self); dequeue returns None if the queue is empty. Ask for 5 numbers. A number that isn't 0 joins the queue. 0 means serve: print Served and the front number, or Empty if nobody is waiting. At the end print what is left, for example:\nServed 4\nEmpty\nLeft: [7, 9]",
    starter: "# Write the Queue class, then read the 5 numbers",
    solution: `class Queue:
    def __init__(self):
        self.items = []

    def enqueue(self, item):
        self.items.append(item)

    def dequeue(self):
        if self.is_empty():
            return None
        return self.items.pop(0)

    def is_empty(self):
        return len(self.items) == 0

q = Queue()
for k in range(5):
    n = int(input("Number: "))
    if n == 0:
        served = q.dequeue()
        if served == None:
            print("Empty")
        else:
            print("Served", served)
    else:
        q.enqueue(n)
print("Left:", q.items)`,
    tests: [T(["4", "0", "0", "7", "9"]), T(["3", "5", "0", "8", "0"])],
    hints: ["dequeue checks is_empty first, then takes from the front with pop(0).", "Compare what dequeue gives back with None."],
    skills: ["stack-queue-class", "queue", "empty-check"], tags: ["QUEUE_REMOVE_FROM_BACK", "POP_EMPTY_NOT_CHECKED"],
    buggy: [["QUEUE_REMOVE_FROM_BACK", `class Queue:
    def __init__(self):
        self.items = []

    def enqueue(self, item):
        self.items.append(item)

    def dequeue(self):
        if self.is_empty():
            return None
        return self.items.pop()

    def is_empty(self):
        return len(self.items) == 0

q = Queue()
for k in range(5):
    n = int(input("Number: "))
    if n == 0:
        served = q.dequeue()
        if served == None:
            print("Empty")
        else:
            print("Served", served)
    else:
        q.enqueue(n)
print("Left:", q.items)`],
      ["POP_EMPTY_NOT_CHECKED", `class Queue:
    def __init__(self):
        self.items = []

    def enqueue(self, item):
        self.items.append(item)

    def dequeue(self):
        return self.items.pop(0)

    def is_empty(self):
        return len(self.items) == 0

q = Queue()
for k in range(5):
    n = int(input("Number: "))
    if n == 0:
        served = q.dequeue()
        if served == None:
            print("Empty")
        else:
            print("Served", served)
    else:
        q.enqueue(n)
print("Left:", q.items)`]],
    explainer: "dequeue checks is_empty before taking the front item, so serving an empty queue gives None instead of stopping the program." },
  { id: "sq-L10b", level: 10, type: "trace", title: "Trace a circular queue",
    description: "Trace the program. The queue has 3 slots; front and rear wrap round to 0 after the last slot.",
    solution: `size = 3
queue = [0, 0, 0]
front = 0
rear = 0
count = 0
for n in [4, 8, 5]:
    queue[rear] = n
    rear = (rear + 1) % size
    count = count + 1
served = queue[front]
front = (front + 1) % size
count = count - 1
queue[rear] = 6
rear = (rear + 1) % size
count = count + 1
print(served, front, rear, count)`, tests: [T([])],
    trace: { columns: ["queue", "front", "rear", "count", "served"] },
    hints: ["(rear + 1) % size goes from the last slot back to 0.", "The 6 goes in the slot the served item left."],
    skills: ["pointers", "queue"], tags: ["QUEUE_REMOVE_FROM_BACK"],
    buggy: [["QUEUE_REMOVE_FROM_BACK", `size = 3
queue = [0, 0, 0]
front = 0
rear = 0
count = 0
for n in [4, 8, 5]:
    queue[rear] = n
    rear = (rear + 1) % size
    count = count + 1
served = queue[rear - 1]
front = (front + 1) % size
count = count - 1
queue[rear] = 6
rear = (rear + 1) % size
count = count + 1
print(served, front, rear, count)`]],
    explainer: "The % size makes rear go back to the first slot after the last one, so the space left by the served item at the front is used again." },
];

// Placement (levels 2, 5, 7 and 9): no buggy variants.
const PLACEMENT = [
  { id: "sq-P2a", level: 2, type: "predict", title: "What's on top?",
    description: "stack is a list used as a stack. What does the program print?",
    solution: `stack = [1, 4]
stack.append(6)
stack.append(2)
stack.pop()
print(stack[-1])`, tests: [T([])],
    wrongOutputs: ["2", "1", "4"],
    hints: ["pop() takes the top item off.", "stack[-1] is the top after that."],
    skills: ["stack"], tags: ["stack"],
    explainer: "pop() takes the item from the top of the stack, so stack[-1] then shows whatever is on top after it." },
  { id: "sq-P2b", level: 2, type: "predict", title: "Who's in the queue?",
    description: "queue is a list used as a queue. What does the program print?",
    solution: `queue = [9, 3]
queue.append(7)
queue.pop(0)
queue.append(1)
print(queue)`, tests: [T([])],
    wrongOutputs: ["[9, 3, 7]", "[9, 3, 1]", "[3, 7]"],
    hints: ["pop(0) takes the front item off.", "append adds to the back."],
    skills: ["queue"], tags: ["queue"],
    explainer: "append adds to the back of the queue and pop(0) removes from the front, so the item that joined first leaves first." },
  { id: "sq-P5a", level: 5, type: "parsons", title: "Push three, pop one",
    description: "Arrange the lines: three numbers are pushed onto a stack, then the top one is popped.\nOne line is not needed.",
    solution: `stack = []
for k in range(3):
    stack.append(int(input("Push: ")))
print("Popped", stack.pop())
print("Top now", stack[-1])`,
    distractors: ['print("Popped", stack.pop(0))'],
    tests: [T(["2", "5", "8"]), T(["7", "1", "4"])],
    hints: ["Push with append.", "Pop from the top, the end of the list."],
    skills: ["stack"], tags: ["parsons"],
    explainer: "The three numbers are pushed on, then pop() takes the last one pushed and stack[-1] shows the new top." },
  { id: "sq-P5b", level: 5, type: "partial-parsons", title: "First to join",
    description: "Pick the missing line, so the first number to join the queue is served.",
    starter: `queue = []
queue.append(int(input("Join: ")))
queue.append(int(input("Join: ")))
____
print("Served", first)`,
    options: ["first = queue.pop(0)", "first = queue.pop()", "first = queue[1]", "first = queue[-1]"],
    tests: [T(["5", "9"]), T(["2", "3"])],
    hints: ["The first to join is at the front.", "The front is index 0."],
    skills: ["queue"], tags: ["queue"],
    explainer: "The first number to join is at the front, index 0, so pop(0) serves it." },
  { id: "sq-P7a", level: 7, type: "trace", title: "Trace three pops",
    description: "Trace the program. Each item of the list stack has its own column.",
    solution: `stack = [3]
stack.append(5)
a = stack.pop()
stack.append(a + 1)
b = stack.pop()
c = stack.pop()
print(a, b, c)`, tests: [T([])],
    trace: { columns: ["stack", "a", "b", "c"] },
    hints: ["pop() takes the last item.", "An empty cell means that item has gone."],
    skills: ["stack"], tags: ["trace"],
    explainer: "Each pop takes the item at the top, the end of the list, so the item pushed most recently always comes off first." },
  { id: "sq-P7b", level: 7, type: "write", title: "Who's next?",
    description: "Add one line that takes the front ticket off the queue and stores it in next_up. The program then prints it, for example:\nNext: 14\nWaiting: [3, 9]",
    starter: `queue = [int(input("Ticket: ")), int(input("Ticket: ")), int(input("Ticket: "))]
# Take the front ticket off the queue and store it in next_up

print("Next:", next_up)
print("Waiting:", queue)`,
    solution: `queue = [int(input("Ticket: ")), int(input("Ticket: ")), int(input("Ticket: "))]
next_up = queue.pop(0)

print("Next:", next_up)
print("Waiting:", queue)`,
    tests: [T(["14", "3", "9"]), T(["8", "22", "5"])],
    hints: ["The front is index 0.", "pop takes an item off and gives it back."],
    skills: ["queue"], tags: ["write"],
    explainer: "The front of a list queue is index 0, so queue.pop(0) takes off the ticket that joined first and gives it back to be stored." },
  { id: "sq-P9a", level: 9, type: "write", title: "Words backwards",
    description: "Ask for 3 words and push each one onto a stack. Then pop and print them all, so they come out in the opposite order, for example:\nthree\ntwo\none",
    solution: `stack = []
for k in range(3):
    stack.append(input("Word: "))
while len(stack) > 0:
    print(stack.pop())`,
    tests: [T(["one", "two", "three"]), T(["red", "green", "blue"])],
    hints: ["Push with append.", "Pop until the stack is empty."],
    skills: ["stack", "empty-check"], tags: ["write"],
    explainer: "A stack gives items back last in, first out, so popping until it is empty prints the words in reverse order." },
  { id: "sq-P9b", level: 9, type: "trace", title: "Trace a queue total",
    description: "Trace the program. Each item of the list queue has its own column.",
    solution: `queue = [2, 6]
total = 0
queue.append(4)
while len(queue) > 0:
    n = queue.pop(0)
    total = total + n
print(total)`, tests: [T([])],
    trace: { columns: ["queue", "n", "total"] },
    hints: ["pop(0) takes the front item off.", "The loop stops when the queue is empty."],
    skills: ["queue", "empty-check"], tags: ["trace"],
    explainer: "Each time round the loop the front item is taken off the queue and added to total, until the queue is empty." },
];

const COVERAGE = {
  "Stacks: push with append, pop and peek at the top": ["sq-L1a", "sq-L1c", "sq-L2a", "sq-L3a", "sq-L4a", "sq-L4c", "sq-L7a", "sq-L7b", "sq-P2a", "sq-P5a", "sq-P7a"],
  "Queues: join at the back, leave from the front": ["sq-L1b", "sq-L2b", "sq-L3b", "sq-L4b", "sq-L5b", "sq-L7c", "sq-L9a", "sq-P2b", "sq-P5b", "sq-P7b", "sq-P9b"],
  "Checking for an empty stack or queue before popping": ["sq-L2c", "sq-L3c", "sq-L4b", "sq-L5c", "sq-L8a", "sq-L10a", "sq-P9a"],
  "Stack and queue classes with methods": ["sq-L4a", "sq-L4c", "sq-L5c", "sq-L7b", "sq-L8a", "sq-L10a"],
  "Array stacks and queues with pointers (top, front, rear, a circular queue)": ["sq-L6b", "sq-L8b", "sq-L10b"],
  "Using a stack to reverse, match brackets or undo": ["sq-L2b", "sq-L5a", "sq-L6a", "sq-L9b", "sq-P9a"],
};

// Tasks that cast input() with int() say so (the casting sentence, tools/unit-tasks.js nameCasting).
nameCasting(PRACTICE.concat(PLACEMENT));

if (require.main === module) addUnit("stacks-queues", PRACTICE, PLACEMENT);
module.exports = { PRACTICE, PLACEMENT, COVERAGE };
