// One-off (2026-11): the "3D arrays" unit (id arrays-3d, A-level data structures), built with tools/unit-tasks.js.
// The A-level ladder, placement at levels 2, 5, 7 and 9 (no buggy variants), and an explainer on every task (see
// tools/add-recursion-unit.js). A 3D array is a list of 2D lists, read with cube[layer][row][col]. A trace table only
// shows a list of numbers or text, so the trace tasks trace loop variables, single items and one row at a time.
// COVERAGE lists each angle and its tasks.
"use strict";
const { T, addUnit, nameCasting } = require("./unit-tasks.js");

const PRACTICE = [
  // ---------- Level 1: predict ----------
  { id: "a3d-L1a", level: 1, type: "predict", title: "One item",
    description: "cube is a 3D array: a list of layers, each a list of rows. What does the program print?",
    solution: `cube = [[[1, 2], [3, 4]], [[5, 6], [7, 8]]]
print(cube[1][0][0])`, tests: [T([])],
    wrongOutputs: ["3", "7"],
    hints: ["cube[1] is the second layer.", "Then [0] is its first row, and [0] the first item in that row."],
    skills: ["index-3d"], tags: ["CUBE_INDEX_ORDER"],
    buggy: [["CUBE_INDEX_ORDER", `cube = [[[1, 2], [3, 4]], [[5, 6], [7, 8]]]
print(cube[0][0][1])`]],
    explainer: "The first index picks a layer, the second picks a row inside that layer, and the third picks the item in that row." },
  { id: "a3d-L1b", level: 1, type: "predict", title: "Three lengths",
    description: "len gives the length of a list at each level. What does the program print?",
    solution: `data = [[[4, 1, 7], [2, 9, 3]], [[5, 5, 0], [8, 6, 2]], [[1, 1, 1], [3, 3, 3]]]
print(len(data), len(data[0]), len(data[0][0]))`, tests: [T([])],
    wrongOutputs: ["2 3 3", "3 2 2"],
    hints: ["len(data) counts the layers.", "data[0] is one layer; data[0][0] is one row."],
    skills: ["len-3d"], tags: ["CUBE_WRONG_LEN"],
    buggy: [["CUBE_WRONG_LEN", `data = [[[4, 1, 7], [2, 9, 3]], [[5, 5, 0], [8, 6, 2]], [[1, 1, 1], [3, 3, 3]]]
print(len(data), len(data), len(data))`]],
    explainer: "len(data) counts the layers, len(data[0]) counts the rows in one layer, and len(data[0][0]) counts the items in one row." },
  { id: "a3d-L1c", level: 1, type: "predict", title: "Add up a cube",
    description: "Three loops go through the cube. What does the program print?",
    solution: `cube = [[[2, 3], [1, 4]], [[5, 0], [6, 1]]]
total = 0
for layer in cube:
    for row in layer:
        for n in row:
            total = total + n
print(total)`, tests: [T([])],
    wrongOutputs: ["10", "12", "8"],
    hints: ["The loops reach every number.", "Add all eight numbers."],
    skills: ["loop-3d", "total-3d"], tags: ["loops"],
    explainer: "Three loops are needed: one for each layer, one for each row in that layer, and one for each number in that row." },

  // ---------- Level 2: predict, spot the trap ----------
  { id: "a3d-L2a", level: 2, type: "predict", title: "Made with *",
    description: "grid is made by multiplying lists. What does the program print?",
    solution: `grid = [[[0] * 2] * 2] * 2
grid[0][0][0] = 5
print(grid[1][1][0])`, tests: [T([])],
    wrongOutputs: ["None", "[5, 0]"],
    hints: ["* repeats a reference to the same inner list.", "So every row here is the same list."],
    skills: ["build-3d"], tags: ["CUBE_SHARED_ROWS"],
    buggy: [["CUBE_SHARED_ROWS", `grid = [[[0, 0], [0, 0]], [[0, 0], [0, 0]]]
grid[0][0][0] = 5
print(grid[1][1][0])`]],
    explainer: "Multiplying a list with * repeats a reference to the same inner list, so every layer and row here is really one shared list." },
  { id: "a3d-L2b", level: 2, type: "predict", title: "Which seat?",
    description: "seats[floor][row][seat] names a seat. What does the program print?",
    solution: `seats = [[["A1", "A2"], ["B1", "B2"]], [["C1", "C2"], ["D1", "D2"]]]
floor = 1
row = 1
seat = 0
print(seats[floor][row][seat])`, tests: [T([])],
    wrongOutputs: ["C1", "D2"],
    hints: ["floor picks the outer list.", "Then row, then seat."],
    skills: ["index-3d"], tags: ["CUBE_INDEX_ORDER"],
    buggy: [["CUBE_INDEX_ORDER", `seats = [[["A1", "A2"], ["B1", "B2"]], [["C1", "C2"], ["D1", "D2"]]]
floor = 1
row = 1
seat = 0
print(seats[seat][row][floor])`]],
    explainer: "The indexes go in the same order as the nesting, so the floor comes first, then the row on that floor, then the seat in that row." },
  { id: "a3d-L2c", level: 2, type: "predict", title: "Count the items",
    description: "The loops add up the length of every row. What does the program print?",
    solution: `cube = [[[1, 2, 3, 4]], [[5, 6, 7, 8]]]
count = 0
for a in range(len(cube)):
    for b in range(len(cube[a])):
        count = count + len(cube[a][b])
print(count)`, tests: [T([])],
    wrongOutputs: ["2", "16"],
    hints: ["Each layer here has one row.", "len(cube[a][b]) is the length of one row."],
    skills: ["len-3d", "loop-3d"], tags: ["CUBE_WRONG_LEN"],
    buggy: [["CUBE_WRONG_LEN", `cube = [[[1, 2, 3, 4]], [[5, 6, 7, 8]]]
count = 0
for a in range(len(cube)):
    for b in range(len(cube[a])):
        count = count + len(cube)
print(count)`]],
    explainer: "len(cube[a][b]) is the number of items in one row, so adding it for every row in every layer counts all the items." },

  // ---------- Level 3: fill in one blank ----------
  { id: "a3d-L3a", level: 3, type: "fill", title: "Read a temperature",
    description: "temps[week][day][time] holds temperatures. Fill in the blank so the program prints the temperature for the week, day and time typed.",
    starter: `temps = [[[12, 14], [11, 15]], [[18, 20], [17, 19]]]
week = int(input("Week (0 or 1): "))
day = int(input("Day (0 or 1): "))
time = int(input("Time (0 or 1): "))
print(____)`,
    answers: ["temps[week][day][time]"], tests: [T(["1", "1", "0"]), T(["0", "1", "1"])],
    hints: ["The outer list is the weeks.", "Write the three indexes outside in."],
    skills: ["index-3d"], tags: ["CUBE_INDEX_ORDER"],
    buggy: [["CUBE_INDEX_ORDER", `temps = [[[12, 14], [11, 15]], [[18, 20], [17, 19]]]
week = int(input("Week (0 or 1): "))
day = int(input("Day (0 or 1): "))
time = int(input("Time (0 or 1): "))
print(temps[time][day][week])`]],
    explainer: "The indexes go from the outside in: the week picks the outer list, the day picks a list inside it, and the time picks the temperature." },
  { id: "a3d-L3b", level: 3, type: "fill", title: "Rows in a layer",
    description: "Fill in the blank so the program prints how many rows there are in each layer.",
    starter: `shelf = [[[3, 1], [4, 1], [5, 9]], [[2, 6], [5, 3], [5, 8]]]
print("Rows in each layer:", ____)`,
    answers: ["len(shelf[0])"], tests: [T([])],
    hints: ["len(shelf) counts the layers.", "Take the length of one layer."],
    skills: ["len-3d"], tags: ["CUBE_WRONG_LEN"],
    buggy: [["CUBE_WRONG_LEN", `shelf = [[[3, 1], [4, 1], [5, 9]], [[2, 6], [5, 3], [5, 8]]]
print("Rows in each layer:", len(shelf))`]],
    explainer: "len(shelf) counts the layers, so to count the rows inside one layer you take the length of one layer, shelf[0]." },
  { id: "a3d-L3c", level: 3, type: "fill", title: "A new row each time",
    description: "Fill in the blank so every row of the cube is a separate list of zeros.",
    starter: `size = int(input("Size: "))
cube = []
for i in range(size):
    layer = []
    for j in range(size):
        layer.append(____)
    cube.append(layer)
cube[0][0][0] = 1
print(cube[size - 1][size - 1])`,
    answers: ["[0] * size"], tests: [T(["2"]), T(["3"])],
    hints: ["Make a new row each time the line runs.", "A row is size zeros."],
    skills: ["build-3d"], tags: ["CUBE_SHARED_ROWS"],
    buggy: [["CUBE_SHARED_ROWS", `size = int(input("Size: "))
row = [0] * size
cube = []
for i in range(size):
    layer = []
    for j in range(size):
        layer.append(row)
    cube.append(layer)
cube[0][0][0] = 1
print(cube[size - 1][size - 1])`]],
    explainer: "[0] * size makes a brand new row each time the line runs, so changing one item in one row doesn't change any other row." },

  // ---------- Level 4: fill in two blanks ----------
  { id: "a3d-L4a", level: 4, type: "fill", title: "One shop's sales",
    description: "sales[shop][day][hour] holds sales. Fill in both blanks so the program adds up the sales for the shop typed.",
    starter: `sales = [[[3, 5], [2, 4]], [[6, 1], [0, 7]], [[2, 2], [9, 3]]]
shop = int(input("Shop: "))
total = 0
for row in sales[____]:
    for n in ____:
        total = total + n
print("Shop", shop, "sold", total)`,
    answers: ["shop", "row"], tests: [T(["0"]), T(["2"])],
    hints: ["sales[shop] is one shop's 2D list.", "The inner loop goes through one row."],
    skills: ["loop-3d", "total-3d"], tags: ["total"],
    explainer: "sales[shop] is one shop's layer, a list of rows, so the outer loop takes each row and the inner loop adds each number in it." },
  { id: "a3d-L4b", level: 4, type: "fill", title: "The biggest number",
    description: "Fill in both blanks so the three loops check every number and keep the biggest.",
    starter: `cube = [[[1, 8, 2], [3, 6, 0]], [[4, 2, 9], [7, 5, 1]]]
best = 0
for i in range(len(cube)):
    for j in range(len(cube[i])):
        for k in range(len(____)):
            if cube[i][j][k] > best:
                best = ____
print(best)`,
    answers: ["cube[i][j]", "cube[i][j][k]"], tests: [T([])],
    hints: ["k goes along one row: cube[i][j].", "Keep the number itself."],
    skills: ["loop-3d", "len-3d"], tags: ["CUBE_WRONG_LEN"],
    buggy: [["CUBE_WRONG_LEN", `cube = [[[1, 8, 2], [3, 6, 0]], [[4, 2, 9], [7, 5, 1]]]
best = 0
for i in range(len(cube)):
    for j in range(len(cube[i])):
        for k in range(len(cube)):
            if cube[i][j][k] > best:
                best = cube[i][j][k]
print(best)`]],
    explainer: "Each loop's range uses the length of the level it walks through, so k goes along one row, cube[i][j], and every number is compared." },
  { id: "a3d-L4c", level: 4, type: "fill", title: "Place a counter",
    description: "board[level][row][col] is a game board. Fill in both blanks so a 1 is placed at the level, row and column typed.",
    starter: `board = [[[0, 0, 0], [0, 0, 0]], [[0, 0, 0], [0, 0, 0]]]
level = int(input("Level: "))
row = int(input("Row: "))
col = int(input("Col: "))
board[____][row][____] = 1
print(board[0])
print(board[1])`,
    answers: ["level", "col"], tests: [T(["1", "0", "2"]), T(["0", "1", "0"])],
    hints: ["The level is the outer index.", "The column is the last index."],
    skills: ["index-3d"], tags: ["CUBE_INDEX_ORDER"],
    buggy: [["CUBE_INDEX_ORDER", `board = [[[0, 0, 0], [0, 0, 0]], [[0, 0, 0], [0, 0, 0]]]
level = int(input("Level: "))
row = int(input("Row: "))
col = int(input("Col: "))
board[col][row][level] = 1
print(board[0])
print(board[1])`]],
    explainer: "The indexes are written in the order of the nesting, level then row then column, to reach the single item to change." },

  // ---------- Level 5: Parsons, or pick the missing line ----------
  { id: "a3d-L5a", level: 5, type: "parsons", title: "Count the empty cells",
    description: "Arrange the lines: the program counts the zeros in the cube.\nOne line is not needed.",
    solution: `cube = [[[0, 3], [0, 0]], [[5, 0], [2, 4]]]
zeros = 0
for layer in cube:
    for row in layer:
        for n in row:
            if n == 0:
                zeros = zeros + 1
print("Empty:", zeros)`,
    distractors: ["for n in layer:"],
    tests: [T([])],
    hints: ["One loop for each level.", "The innermost loop goes through a row."],
    skills: ["loop-3d"], tags: ["parsons"],
    explainer: "Each loop goes one level deeper, layer then row then number, so the check runs on every single number." },
  { id: "a3d-L5b", level: 5, type: "partial-parsons", title: "Items in a bin",
    description: "stock[warehouse][shelf][bin] is how many items are in each bin. Pick the missing line, so the program prints the number in the bin typed.",
    starter: `stock = [[[5, 2], [0, 7]], [[3, 3], [8, 1]]]
w = int(input("Warehouse: "))
s = int(input("Shelf: "))
b = int(input("Bin: "))
____
print("Items:", items)`,
    options: ["items = stock[w][s][b]", "items = stock[b][s][w]", "items = stock[w][b][s]", "items = stock[w][s]"],
    optionMisconceptions: { 1: "CUBE_INDEX_ORDER" },
    tests: [T(["1", "1", "0"]), T(["0", "0", "1"])],
    hints: ["The warehouse is the outer list.", "Then the shelf, then the bin."],
    skills: ["index-3d"], tags: ["CUBE_INDEX_ORDER"],
    explainer: "The warehouse is the outer list, the shelf is inside it and the bin is inside that, so the indexes are written in that order." },
  { id: "a3d-L5c", level: 5, type: "partial-parsons", title: "How many cells?",
    description: "Pick the missing line, so the program prints how many cells the cube has.",
    starter: `cube = [[[1, 2, 3, 4], [5, 6, 7, 8]], [[9, 8, 7, 6], [5, 4, 3, 2]], [[1, 1, 1, 1], [2, 2, 2, 2]]]
layers = len(cube)
rows = len(cube[0])
____
print(layers * rows * cols, "cells")`,
    options: ["cols = len(cube[0][0])", "cols = len(cube)", "cols = len(cube[0])", "cols = len(cube[0][0][0])"],
    optionMisconceptions: { 1: "CUBE_WRONG_LEN" },
    tests: [T([])],
    hints: ["The number of columns is the length of one row.", "cube[0][0] is one row."],
    skills: ["len-3d"], tags: ["CUBE_WRONG_LEN"],
    explainer: "cube[0][0] is one row, so its length is the number of columns, and layers times rows times columns gives every cell." },

  // ---------- Level 6: Parsons with traps, or pick the missing line ----------
  { id: "a3d-L6a", level: 6, type: "parsons", title: "Build a cube",
    description: "Arrange the lines: the program builds a cube of 2 layers, 3 rows and 4 columns of zeros, with every row a separate list, then changes one item.\nTwo lines are not needed.",
    solution: `cube = []
for i in range(2):
    layer = []
    for j in range(3):
        layer.append([0] * 4)
    cube.append(layer)
cube[1][2][3] = 9
print(len(cube), len(cube[0]), len(cube[0][0]))
print(cube[1][2])`,
    distractors: ["layer.append(cube)", "cube = [[[0] * 4] * 3] * 2"],
    tests: [T([])],
    hints: ["Make each row new inside the inner loop.", "Multiplying the lists would make the rows one shared list."],
    skills: ["build-3d", "len-3d"], tags: ["build"],
    explainer: "Building each row with its own [0] * 4 inside the loops gives separate rows, so setting one item changes only that one row." },
  { id: "a3d-L6b", level: 6, type: "partial-parsons", title: "Two rows per layer",
    description: "Each layer has two rows of n zeros. Pick the missing line, so setting one item changes only that one place.",
    starter: `n = int(input("Size: "))
cube = []
for i in range(n):
    ____
cube[0][0][0] = 7
total = 0
for layer in cube:
    for row in layer:
        total = total + row[0]
print(total)`,
    options: ["cube.append([[0] * n, [0] * n])", "cube.append([[0] * n] * 2)", "cube = [[[0] * n] * 2] * n", "cube.append([0] * n)"],
    optionMisconceptions: { 1: "CUBE_SHARED_ROWS" },
    tests: [T(["2"]), T(["3"])],
    hints: ["Each row must be a new list.", "[[0] * n] * 2 would make one row shared twice."],
    skills: ["build-3d"], tags: ["CUBE_SHARED_ROWS"],
    explainer: "Writing [0] * n twice makes two separate rows for each layer, so setting one item changes only that one place." },

  // ---------- Level 7: trace, or write a short line ----------
  { id: "a3d-L7a", level: 7, type: "trace", title: "Trace three loops",
    description: "Trace the program. Watch how often i, j and k change.",
    solution: `cube = [[[4, 0], [2, 6]], [[1, 3], [0, 5]]]
big = 0
for i in range(2):
    for j in range(2):
        for k in range(2):
            if cube[i][j][k] > 3:
                big = big + 1
print(big)`, tests: [T([])],
    trace: { columns: ["i", "j", "k", "big"] },
    hints: ["k changes on every turn of the innermost loop.", "big goes up for each number bigger than 3."],
    skills: ["loop-3d", "index-3d"], tags: ["CUBE_INDEX_ORDER"],
    buggy: [["CUBE_INDEX_ORDER", `cube = [[[4, 0], [2, 6]], [[1, 3], [0, 5]]]
big = 0
for i in range(2):
    for j in range(2):
        for k in range(2):
            if cube[k][j][i] > 3:
                big = big + 1
print(big)`]],
    explainer: "k changes fastest, j changes each time k's loop finishes, and i changes least, so every number in the cube is checked once." },
  { id: "a3d-L7b", level: 7, type: "write", title: "Read a mark",
    description: "scores[group][pupil][test] holds test marks. Add one line that sets mark to the mark for the group, pupil and test typed. The program then prints it, for example:\nMark: 7",
    starter: `scores = [[[7, 5, 9], [6, 8, 4]], [[3, 9, 8], [10, 6, 7]]]
group = int(input("Group: "))
pupil = int(input("Pupil: "))
test = int(input("Test: "))
# Set mark to this pupil's mark in this test

print("Mark:", mark)`,
    solution: `scores = [[[7, 5, 9], [6, 8, 4]], [[3, 9, 8], [10, 6, 7]]]
group = int(input("Group: "))
pupil = int(input("Pupil: "))
test = int(input("Test: "))
mark = scores[group][pupil][test]

print("Mark:", mark)`,
    tests: [T(["1", "1", "2"]), T(["0", "1", "0"])],
    hints: ["The group is the outer index.", "Then the pupil, then the test."],
    skills: ["index-3d"], tags: ["CUBE_INDEX_ORDER"],
    buggy: [["CUBE_INDEX_ORDER", `scores = [[[7, 5, 9], [6, 8, 4]], [[3, 9, 8], [10, 6, 7]]]
group = int(input("Group: "))
pupil = int(input("Pupil: "))
test = int(input("Test: "))
mark = scores[test][pupil][group]

print("Mark:", mark)`]],
    explainer: "The first index picks the group, the second the pupil in that group, and the third the test, the same order as the lists are nested." },
  { id: "a3d-L7c", level: 7, type: "trace", title: "Trace the corners",
    description: "Trace the program. layer is one whole 2D list each time round.",
    solution: `cube = [[[2, 4], [6, 8]], [[1, 3], [5, 7]]]
total = 0
for layer in cube:
    first = layer[0][0]
    last = layer[1][1]
    total = total + first + last
print(total)`, tests: [T([])],
    trace: { columns: ["first", "last", "total"] },
    hints: ["layer[0][0] is the first number in a layer.", "layer[1][1] is the last."],
    skills: ["index-3d", "total-3d"], tags: ["trace"],
    explainer: "layer is one whole 2D list each time round, so layer[0][0] is its first number and layer[1][1] is its last." },

  // ---------- Level 8: trace, or write ----------
  { id: "a3d-L8a", level: 8, type: "write", title: "Build and fill",
    description: "Make a 3D array called cube with 2 layers, each with 2 rows of 3 zeros, built with loops so every row is a separate list. Ask for a layer, a row, a column and a number, store the number there, then print both layers, for example:\n[[0, 0, 0], [0, 0, 0]]\n[[0, 0, 0], [0, 9, 0]]",
    starter: "# Build the cube with loops, then store the number",
    solution: `cube = []
for i in range(2):
    layer = []
    for j in range(2):
        layer.append([0] * 3)
    cube.append(layer)
l = int(input("Layer: "))
r = int(input("Row: "))
c = int(input("Column: "))
cube[l][r][c] = int(input("Number: "))
print(cube[0])
print(cube[1])`,
    tests: [T(["1", "1", "1", "9"]), T(["0", "1", "2", "4"])],
    hints: ["Make each row new with [0] * 3 inside the inner loop.", "Store with cube[l][r][c]."],
    skills: ["build-3d", "index-3d"], tags: ["CUBE_SHARED_ROWS", "CUBE_INDEX_ORDER"],
    buggy: [["CUBE_SHARED_ROWS", `cube = [[[0] * 3] * 2] * 2
l = int(input("Layer: "))
r = int(input("Row: "))
c = int(input("Column: "))
cube[l][r][c] = int(input("Number: "))
print(cube[0])
print(cube[1])`],
      ["CUBE_INDEX_ORDER", `cube = []
for i in range(2):
    layer = []
    for j in range(2):
        layer.append([0] * 3)
    cube.append(layer)
l = int(input("Layer: "))
r = int(input("Row: "))
c = int(input("Column: "))
cube[c][r][l] = int(input("Number: "))
print(cube[0])
print(cube[1])`]],
    explainer: "Making every row with its own [0] * 3 inside the loops keeps the rows separate, so the number typed lands in exactly one place." },
  { id: "a3d-L8b", level: 8, type: "trace", title: "Trace the sizes",
    description: "Trace the program. Each len reads the length of one level.",
    solution: `cube = [[[3, 1, 4], [1, 5, 9]], [[2, 6, 5], [3, 5, 8]]]
layers = len(cube)
rows = len(cube[0])
cols = len(cube[0][0])
cells = layers * rows * cols
last = cube[layers - 1][rows - 1][cols - 1]
print(cells, last)`, tests: [T([])],
    trace: { columns: ["layers", "rows", "cols", "cells", "last"] },
    hints: ["len(cube[0][0]) is the length of one row.", "The last index at each level is one less than its length."],
    skills: ["len-3d", "index-3d"], tags: ["CUBE_WRONG_LEN"],
    buggy: [["CUBE_WRONG_LEN", `cube = [[[3, 1, 4], [1, 5, 9]], [[2, 6, 5], [3, 5, 8]]]
layers = len(cube)
rows = len(cube[0])
cols = len(cube)
cells = layers * rows * cols
last = cube[layers - 1][rows - 1][cols - 1]
print(cells, last)`]],
    explainer: "Each len reads the length of one level, layers then rows then columns, and subtracting one from each gives the last index at that level." },

  // ---------- Level 9: write a full program, or a longer trace ----------
  { id: "a3d-L9a", level: 9, type: "write", title: "Cinema tickets",
    description: "tickets[screen][row][block] is how many tickets were sold in each block of seats: tickets = [[[12, 0, 7], [5, 9, 3]], [[8, 8, 2], [0, 6, 11]]]. Ask for a screen and print how many tickets were sold on that screen, then how many in the whole cinema, for example:\nSold: 36\nCinema: 71",
    starter: "# Store tickets, then add up one screen and the whole cinema",
    solution: `tickets = [[[12, 0, 7], [5, 9, 3]], [[8, 8, 2], [0, 6, 11]]]
s = int(input("Screen: "))
sold = 0
for row in tickets[s]:
    for n in row:
        sold = sold + n
print("Sold:", sold)
total = 0
for screen in tickets:
    for row in screen:
        for n in row:
            total = total + n
print("Cinema:", total)`,
    tests: [T(["0"]), T(["1"])],
    hints: ["tickets[s] is one screen's 2D list: two loops add it up.", "Three loops add up every screen."],
    skills: ["total-3d", "loop-3d"], tags: ["total"],
    explainer: "tickets[s] is one screen's 2D list, so two loops add up that screen, and three loops are needed to add up every screen in the cinema." },
  { id: "a3d-L9b", level: 9, type: "trace", title: "Trace a cube being built",
    description: "Trace the program. Each row is made from i and j inside the loops.",
    solution: `cube = []
for i in range(2):
    layer = []
    for j in range(2):
        layer.append([i * 10 + j, 0])
    cube.append(layer)
a = cube[1][0][0]
b = cube[0][1][0]
total = a + b
print(total)`, tests: [T([])],
    trace: { columns: ["i", "j", "a", "b", "total"] },
    hints: ["The first item of each row is i * 10 + j.", "cube[1][0] was made when i was 1 and j was 0."],
    skills: ["build-3d", "index-3d"], tags: ["trace"],
    explainer: "Each row is made fresh inside the inner loop from i and j, so cube[1][0][0] holds the value made when i was 1 and j was 0." },

  // ---------- Level 10: write an extended program, or a longer trace ----------
  { id: "a3d-L10a", level: 10, type: "write", title: "One test's marks",
    description: "marks[group][pupil][test] holds test marks: marks = [[[6, 8, 5], [9, 7, 4], [3, 9, 6]], [[5, 5, 9], [8, 6, 7], [7, 4, 8]]]. Ask for a test number (0, 1 or 2). Print every pupil's mark in that test, one per line as the group, the pupil and the mark, then the highest mark in that test, for example:\n0 0 8\n0 1 7\n0 2 9\n1 0 5\n1 1 6\n1 2 4\nHighest: 9",
    starter: "# Store marks, then go through every group and pupil",
    solution: `marks = [[[6, 8, 5], [9, 7, 4], [3, 9, 6]], [[5, 5, 9], [8, 6, 7], [7, 4, 8]]]
test = int(input("Test: "))
highest = 0
for g in range(len(marks)):
    for p in range(len(marks[g])):
        mark = marks[g][p][test]
        print(g, p, mark)
        if mark > highest:
            highest = mark
print("Highest:", highest)`,
    tests: [T(["1"]), T(["2"])],
    hints: ["Loop over the groups, then the pupils in each group.", "The test index stays the same: marks[g][p][test]."],
    skills: ["index-3d", "loop-3d", "len-3d"], tags: ["CUBE_INDEX_ORDER", "CUBE_WRONG_LEN"],
    buggy: [["CUBE_INDEX_ORDER", `marks = [[[6, 8, 5], [9, 7, 4], [3, 9, 6]], [[5, 5, 9], [8, 6, 7], [7, 4, 8]]]
test = int(input("Test: "))
highest = 0
for g in range(len(marks)):
    for p in range(len(marks[g])):
        mark = marks[test][p][g]
        print(g, p, mark)
        if mark > highest:
            highest = mark
print("Highest:", highest)`],
      ["CUBE_WRONG_LEN", `marks = [[[6, 8, 5], [9, 7, 4], [3, 9, 6]], [[5, 5, 9], [8, 6, 7], [7, 4, 8]]]
test = int(input("Test: "))
highest = 0
for g in range(len(marks)):
    for p in range(len(marks)):
        mark = marks[g][p][test]
        print(g, p, mark)
        if mark > highest:
            highest = mark
print("Highest:", highest)`]],
    explainer: "The test index stays the same while the two loops go through every group and every pupil in it, so only that one test's marks are read." },
  { id: "a3d-L10b", level: 10, type: "trace", title: "Trace the biggest layer",
    description: "Trace the program. layer_total adds up one layer at a time.",
    solution: `cube = [[[2, 5], [1, 3]], [[4, 4], [0, 6]]]
best = 0
for i in range(2):
    layer_total = 0
    for row in cube[i]:
        for n in row:
            layer_total = layer_total + n
    if layer_total > best:
        best = layer_total
        top = i
print(top, best)`, tests: [T([])],
    trace: { columns: ["i", "n", "layer_total", "best", "top"] },
    hints: ["layer_total starts again at 0 for each layer.", "best and top change only for a bigger layer total."],
    skills: ["total-3d", "loop-3d"], tags: ["trace"],
    explainer: "layer_total starts again at zero for each layer, adds up every number in that layer, and best and top keep the layer with the largest total." },
];

// Placement (levels 2, 5, 7 and 9): no buggy variants.
const PLACEMENT = [
  { id: "a3d-P2a", level: 2, type: "predict", title: "Two items",
    description: "box is a 3D array. What does the program print?",
    solution: `box = [[[1, 2], [3, 4]], [[5, 6], [7, 8]]]
print(box[0][1][0], box[1][1][1])`, tests: [T([])],
    wrongOutputs: ["2 8", "3 7", "5 8"],
    hints: ["The first index picks a layer.", "Then a row, then an item."],
    skills: ["index-3d"], tags: ["index"],
    explainer: "Each index goes one level deeper: the layer first, then the row in that layer, then the item in that row." },
  { id: "a3d-P2b", level: 2, type: "predict", title: "Three lengths",
    description: "len gives the length of a list. What does the program print?",
    solution: `cube = [[[1, 1, 1]], [[2, 2, 2]], [[3, 3, 3]]]
print(len(cube), len(cube[0]), len(cube[0][0]))`, tests: [T([])],
    wrongOutputs: ["3 3 3", "1 3 3", "3 1 1"],
    hints: ["Each layer here has one row.", "Each row has three items."],
    skills: ["len-3d"], tags: ["len"],
    explainer: "Each len counts the items at one level, so the three lengths are the layers, the rows in a layer and the items in a row." },
  { id: "a3d-P5a", level: 5, type: "parsons", title: "Add up every number",
    description: "Arrange the lines: the program adds up every number in the cube.\nOne line is not needed.",
    solution: `cube = [[[4, 2], [7, 1]], [[3, 8], [5, 6]]]
total = 0
for layer in cube:
    for row in layer:
        for n in row:
            total = total + n
print("Total:", total)`,
    distractors: ["for n in layer:"],
    tests: [T([])],
    hints: ["One loop for each level.", "The innermost loop goes through a row."],
    skills: ["loop-3d", "total-3d"], tags: ["parsons"],
    explainer: "One loop for each level of nesting reaches every number, so all of them are added to the total." },
  { id: "a3d-P5b", level: 5, type: "partial-parsons", title: "The column too",
    description: "Pick the missing line, so the program prints the item at the layer, row and column typed.",
    starter: `grid = [[[5, 3], [8, 2]], [[6, 9], [1, 4]]]
a = int(input("Layer: "))
b = int(input("Row: "))
____
print(grid[a][b][c])`,
    options: ['c = int(input("Column: "))', "c = len(grid)", "c = a", "c = grid[a][b]"],
    tests: [T(["1", "0", "0"]), T(["0", "1", "1"])],
    hints: ["The third index is the column.", "It has to be typed in too."],
    skills: ["index-3d"], tags: ["index"],
    explainer: "The third index picks the item in the row, so the column has to be typed in as well before the item can be read." },
  { id: "a3d-P7a", level: 7, type: "trace", title: "Trace one position",
    description: "Trace the program. The same row and column are read from each layer.",
    solution: `cube = [[[3, 7], [2, 2]], [[9, 1], [4, 6]]]
total = 0
for i in range(2):
    total = total + cube[i][1][0]
print(total)`, tests: [T([])],
    trace: { columns: ["i", "total"] },
    hints: ["cube[i][1][0] is row 1, column 0 of layer i.", "Add it for each layer."],
    skills: ["index-3d", "total-3d"], tags: ["trace"],
    explainer: "The middle and last indexes stay the same while i picks each layer in turn, so the same position is read from every layer." },
  { id: "a3d-P7b", level: 7, type: "write", title: "Print the sizes",
    description: "Add one line that prints the number of layers, the number of rows in a layer and the number of items in a row, for example:\n2 3 4",
    starter: `cube = [[[0] * 4, [0] * 4, [0] * 4], [[0] * 4, [0] * 4, [0] * 4]]
# Print the three lengths: layers, rows, items in a row`,
    solution: `cube = [[[0] * 4, [0] * 4, [0] * 4], [[0] * 4, [0] * 4, [0] * 4]]
print(len(cube), len(cube[0]), len(cube[0][0]))`,
    tests: [T([])],
    hints: ["len(cube) counts the layers.", "cube[0] is a layer; cube[0][0] is a row."],
    skills: ["len-3d"], tags: ["write"],
    explainer: "len of the whole list, of one layer and of one row gives the size at each of the three levels." },
  { id: "a3d-P9a", level: 9, type: "write", title: "The warmest time",
    description: "temps[city][day][time] holds temperatures: temps = [[[8, 12], [9, 14]], [[15, 21], [16, 22]]]. Ask for a city, then print the highest temperature for that city, for example:\nHighest: 14",
    solution: `temps = [[[8, 12], [9, 14]], [[15, 21], [16, 22]]]
city = int(input("City: "))
highest = temps[city][0][0]
for day in temps[city]:
    for t in day:
        if t > highest:
            highest = t
print("Highest:", highest)`,
    tests: [T(["0"]), T(["1"])],
    hints: ["temps[city] is that city's 2D list.", "Two loops go through every day and time."],
    skills: ["loop-3d", "index-3d"], tags: ["write"],
    explainer: "temps[city] is that city's 2D list, so two loops go through every day and every time in it to find the highest." },
  { id: "a3d-P9b", level: 9, type: "trace", title: "Trace the rows",
    description: "Trace the program. Each item of row has its own column.",
    solution: `cube = [[[1, 4], [2, 3]], [[5, 0], [6, 2]]]
count = 0
for layer in cube:
    for row in layer:
        if row[0] > row[1]:
            count = count + 1
print(count)`, tests: [T([])],
    trace: { columns: ["row", "count"] },
    hints: ["row is one row of two numbers each time round.", "count goes up when the first is bigger."],
    skills: ["loop-3d"], tags: ["trace"],
    explainer: "row is one row of two numbers each time round, and count goes up only when the first number in the row is bigger." },
];

const COVERAGE = {
  "Reading one item with three indexes, in the right order": ["a3d-L1a", "a3d-L2b", "a3d-L3a", "a3d-L4c", "a3d-L5b", "a3d-L7b", "a3d-P2a", "a3d-P5b"],
  "The length of each level": ["a3d-L1b", "a3d-L2c", "a3d-L3b", "a3d-L5c", "a3d-L8b", "a3d-P2b", "a3d-P7b"],
  "Nested loops through every item": ["a3d-L1c", "a3d-L4a", "a3d-L4b", "a3d-L5a", "a3d-L7a", "a3d-L10b", "a3d-P5a", "a3d-P9b"],
  "Building a 3D array so its rows aren't shared": ["a3d-L2a", "a3d-L3c", "a3d-L6a", "a3d-L6b", "a3d-L8a", "a3d-L9b"],
  "Totals, counts and the highest value in a layer or the whole array": ["a3d-L7c", "a3d-L9a", "a3d-L10a", "a3d-L10b", "a3d-P7a", "a3d-P9a"],
};

// Tasks that cast input() with int() say so (the casting sentence, tools/unit-tasks.js nameCasting).
nameCasting(PRACTICE.concat(PLACEMENT));

if (require.main === module) addUnit("arrays-3d", PRACTICE, PLACEMENT);
module.exports = { PRACTICE, PLACEMENT, COVERAGE };
